import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, financeExpenseItemsTable, financeExpensesTable, financePaymentsTable, workAgreementPlanTable, workAgreementsTable } from "@workspace/db";
import { agreementTotal, BASES, BASIS_LABEL, BASIS_UNIT, computePlan, fromCents, toCents, type Basis } from "../lib/agreements";
import { getProjectAccess, parseAmount, parseQty, PAYMENT_METHODS, type ProjectAccess } from "../lib/financeCore";
import { audit } from "../lib/homeAccess";
import { rateLimit } from "../lib/rateLimit";
import { hashToken, newToken, publicOrigin } from "../lib/realtorCore";

/**
 * "Ustalarla razılaşmalar": a longer job agreed with a tradesperson (what, how much, hourly / daily / monthly / one
 * price), its payment plan, and the payments actually made. Each payment is one ordinary expense (category labour,
 * a service line) — it shows in the day, the month, Excel and every total exactly once.
 * The tradesperson gets a link to this agreement only: plan, payments, paid and left — and can confirm ("Aldım") or
 * dispute each payment. They see nothing else of the home.
 */
const router: IRouter = Router();
export const agreementPublicRouter: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
const bad = (res: Response, error: string, status = 400) => { res.status(status).json({ error }); };
const today = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10); // Baku
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
type Agreement = typeof workAgreementsTable.$inferSelect;

const money = z.union([z.string(), z.number(), z.null()]).optional().transform((v, ctx) => {
  if (v == null || v === "") return null;
  const a = parseAmount(v); if (a == null) { ctx.addIssue({ code: "custom", message: "amount" }); return z.NEVER; }
  return a;
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PlanRow = z.object({ dueDate: isoDate.nullable().optional(), label: z.string().trim().max(120).default(""), amount: money, rest: z.boolean().default(false) });
const Body = z.object({
  title: z.string().trim().min(2).max(200),
  workType: z.string().trim().max(40).default(""),
  contractorName: z.string().trim().min(2).max(160),
  contractorPhone: z.string().trim().max(32).default(""),
  basis: z.enum(BASES),
  rate: money, units: z.union([z.string(), z.number(), z.null()]).optional(),
  total: money,
  startDate: isoDate.nullable().optional(), endDate: isoDate.nullable().optional(),
  note: z.string().trim().max(2000).default(""),
  workId: z.string().uuid().nullable().optional(),
  plan: z.array(PlanRow).max(60).default([]),
});
const PaymentBody = z.object({
  date: isoDate, amount: z.union([z.string(), z.number()]), note: z.string().trim().max(500).default(""),
  method: z.enum(PAYMENT_METHODS).default(""), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
});

async function manage(req: Request, res: Response): Promise<ProjectAccess | null> {
  const a = await getProjectAccess(uid(req), String(req.params.projectId));
  if (!a) { bad(res, "Tapılmadı", 404); return null; }
  if (a.level !== "manage") { bad(res, "Razılaşmaları yalnız ev sahibi idarə edir", 403); return null; }
  return a;
}
async function load(a: ProjectAccess, id: string) {
  if (!isUuid(id)) return null;
  const [g] = await db.select().from(workAgreementsTable).where(and(eq(workAgreementsTable.id, id), eq(workAgreementsTable.projectId, a.project.id)));
  return g ?? null;
}

/** Plan, payments (with what the tradesperson said), totals. `forLink` leaves out the owner's own notes. */
async function view(g: Agreement, forLink = false) {
  const plan = await db.select().from(workAgreementPlanTable).where(eq(workAgreementPlanTable.agreementId, g.id)).orderBy(asc(workAgreementPlanTable.position));
  const expenses = await db.select().from(financeExpensesTable).where(and(eq(financeExpensesTable.agreementId, g.id), ne(financeExpensesTable.status, "void"))).orderBy(asc(financeExpensesTable.date), asc(financeExpensesTable.createdAt));
  const pays = expenses.length ? await db.select().from(financePaymentsTable).where(and(inArray(financePaymentsTable.expenseId, expenses.map((e) => e.id)), eq(financePaymentsTable.kind, "payment"))) : [];
  const payments = expenses.map((e) => {
    const p = pays.find((x) => x.expenseId === e.id && x.status !== "cancelled");
    return {
      id: p?.id ?? e.id, expenseId: e.id, date: e.date, amount: e.total, note: forLink ? "" : e.note, method: p?.method ?? "",
      /** recorded (waiting for the tradesperson) | confirmed (they confirmed receipt) | disputed */
      status: p?.status ?? "recorded", counterpartyNote: p?.counterpartyNote ?? "", confirmedAt: p?.confirmedAt?.toISOString() ?? null,
    };
  });
  const paidC = payments.reduce((s, p) => s + toCents(p.amount), 0);
  const c = computePlan(toCents(g.total), plan.map((r) => ({ id: r.id, dueDate: r.dueDate, label: r.label, amount: r.amount, rest: r.rest })), paidC, today());
  return {
    id: g.id, title: g.title, workType: g.workType, contractorName: g.contractorName, contractorPhone: forLink ? "" : g.contractorPhone,
    basis: g.basis, basisLabel: BASIS_LABEL[g.basis as Basis], unit: BASIS_UNIT[g.basis as Basis], rate: g.rate, units: g.units,
    total: g.total, startDate: g.startDate, endDate: g.endDate, status: g.status, ...(forLink ? {} : { note: g.note, workId: g.workId }),
    plan: c.rows.map((r) => ({ ...r, amount: fromCents(r.amountC), covered: fromCents(r.coveredC) })),
    payments,
    summary: { total: fromCents(c.summary.totalC), paid: fromCents(c.summary.paidC), remaining: fromCents(c.summary.remainingC), planned: fromCents(c.summary.plannedC), unplanned: fromCents(c.summary.unplannedC), overdue: fromCents(c.summary.overdueC), next: c.summary.next && { ...c.summary.next, due: fromCents(c.summary.next.dueC) }, issues: c.summary.issues, confirmed: payments.filter((p) => p.status === "confirmed").length, disputed: payments.filter((p) => p.status === "disputed").length },
    ...(forLink ? {} : { share: { active: !!g.shareTokenHash && !g.shareRevokedAt, createdAt: g.shareCreatedAt?.toISOString() ?? null, openedAt: g.shareOpenedAt?.toISOString() ?? null } }),
  };
}

function values(d: z.infer<typeof Body>) {
  const units = parseQty(d.units);
  const total = agreementTotal(d.basis, d.rate, units, d.total);
  if (!total || !(toCents(total) > 0)) return { error: d.basis === "contract" ? "Razılaşmanın ümumi məbləğini yazın" : `Qiyməti və neçə ${BASIS_UNIT[d.basis]} olduğunu və ya ümumi məbləği yazın` };
  if (d.startDate && d.endDate && d.endDate < d.startDate) return { error: "Bitmə tarixi başlanğıcdan əvvəl ola bilməz" };
  if (d.plan.filter((r) => r.rest).length > 1) return { error: "“Qalan məbləğ” yalnız bir sətirdə ola bilər" };
  const fixed = d.plan.filter((r) => !r.rest).reduce((s, r) => s + toCents(r.amount ?? "0"), 0);
  if (fixed > toCents(total)) return { error: `Ödəniş planının cəmi (${fromCents(fixed)} AZN) razılaşmanın məbləğindən (${total} AZN) çoxdur` };
  return { values: { title: d.title, workType: d.workType, contractorName: d.contractorName, contractorPhone: d.contractorPhone, basis: d.basis, rate: d.basis === "contract" ? null : d.rate, units: d.basis === "contract" ? null : units, total, startDate: d.startDate ?? null, endDate: d.endDate ?? null, note: d.note, workId: d.workId ?? null } };
}
const planRows = (agreementId: string, plan: z.infer<typeof Body>["plan"]) => plan.map((r, position) => ({ agreementId, position, dueDate: r.dueDate ?? null, label: r.label, amount: r.rest ? null : r.amount, rest: r.rest }));

router.get("/home-projects/:projectId/agreements", async (req, res): Promise<void> => {
  const a = await manage(req, res); if (!a) return;
  const rows = await db.select().from(workAgreementsTable).where(eq(workAgreementsTable.projectId, a.project.id)).orderBy(desc(workAgreementsTable.createdAt));
  res.json(await Promise.all(rows.map((g) => view(g))));
});

router.get("/home-projects/:projectId/agreements/:id", async (req, res): Promise<void> => {
  const a = await manage(req, res); if (!a) return;
  const g = await load(a, String(req.params.id));
  if (!g) return bad(res, "Razılaşma tapılmadı", 404);
  res.json(await view(g));
});

router.post("/home-projects/:projectId/agreements", async (req, res): Promise<void> => {
  const a = await manage(req, res); if (!a) return;
  const b = Body.safeParse(req.body ?? {});
  if (!b.success) return bad(res, b.error.issues.some((i) => i.path[0] === "contractorName") ? "Ustanın və ya briqadanın adını yazın" : b.error.issues.some((i) => i.path[0] === "title") ? "İşin adını yazın" : "Məlumatları yoxlayın");
  const v = values(b.data); if ("error" in v) return bad(res, v.error!);
  const [g] = await db.insert(workAgreementsTable).values({ ...v.values, projectId: a.project.id, homeId: a.home.id, createdByUserId: uid(req) }).returning();
  if (b.data.plan.length) await db.insert(workAgreementPlanTable).values(planRows(g.id, b.data.plan));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "agreement.created", entityType: "agreement", entityId: g.id, summary: `${g.title} · ${g.contractorName} · ${g.total} AZN` });
  res.status(201).json(await view(g));
});

router.put("/home-projects/:projectId/agreements/:id", async (req, res): Promise<void> => {
  const a = await manage(req, res); if (!a) return;
  const g = await load(a, String(req.params.id));
  if (!g) return bad(res, "Razılaşma tapılmadı", 404);
  const b = Body.extend({ status: z.enum(["active", "closed"]).optional() }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const v = values(b.data); if ("error" in v) return bad(res, v.error!);
  const cur = await view(g);
  if (toCents(v.values.total) < toCents(cur.summary.paid)) return bad(res, `Artıq ${cur.summary.paid} AZN ödənilib — razılaşmanın məbləği bundan az ola bilməz`);
  const [u] = await db.update(workAgreementsTable).set({ ...v.values, ...(b.data.status ? { status: b.data.status } : {}), updatedAt: new Date() }).where(eq(workAgreementsTable.id, g.id)).returning();
  await db.delete(workAgreementPlanTable).where(eq(workAgreementPlanTable.agreementId, g.id));
  if (b.data.plan.length) await db.insert(workAgreementPlanTable).values(planRows(g.id, b.data.plan));
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (g.total !== u.total) changes.total = { from: g.total, to: u.total };
  if (g.status !== u.status) changes.status = { from: g.status, to: u.status };
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "agreement.updated", entityType: "agreement", entityId: g.id, summary: `${u.title} · ${u.total} AZN`, ...(Object.keys(changes).length ? { changes } : {}) });
  res.json(await view(u));
});

/** A payment made to the tradesperson under this agreement: one expense + one payment, never more than what is left. */
router.post("/home-projects/:projectId/agreements/:id/payments", async (req, res): Promise<void> => {
  const a = await manage(req, res); if (!a) return;
  const g = await load(a, String(req.params.id));
  if (!g) return bad(res, "Razılaşma tapılmadı", 404);
  const b = PaymentBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Tarixi və məbləği yoxlayın");
  const amount = parseAmount(b.data.amount);
  if (!amount || !(toCents(amount) > 0)) return bad(res, "Ödənilən məbləği yazın");
  if (b.data.idempotencyKey) {
    const [dup] = await db.select().from(financeExpensesTable).where(and(eq(financeExpensesTable.projectId, a.project.id), eq(financeExpensesTable.idempotencyKey, `ag:${b.data.idempotencyKey}`)));
    if (dup) return void res.json(await view(g));
  }
  const cur = await view(g);
  if (toCents(amount) > toCents(cur.summary.remaining)) return bad(res, `Qalıb ${cur.summary.remaining} AZN — ödəniş bundan çox ola bilməz. İş artıbsa, əvvəl razılaşmanın məbləğini dəyişin.`);
  if (g.status === "closed") return bad(res, "Razılaşma bağlanıb — ödəniş üçün əvvəl yenidən açın");
  const userId = uid(req);
  const n = cur.payments.length + 1;
  const description = `${g.title} — ${g.contractorName}: ${n}-ci ödəniş`.slice(0, 300);
  await db.transaction(async (tx) => {
    const [e] = await tx.insert(financeExpensesTable).values({
      projectId: a.project.id, homeId: a.home.id, date: b.data.date, category: "labor", description, vendorName: g.contractorName,
      subtotal: amount, discount: "0", tax: "0", total: amount, paymentMethod: b.data.method, entryId: randomUUID(), workId: g.workId, agreementId: g.id,
      note: b.data.note, status: "approved", approvedByUserId: userId, approvedAt: new Date(), idempotencyKey: b.data.idempotencyKey ? `ag:${b.data.idempotencyKey}` : null, createdByUserId: userId,
    }).returning();
    await tx.insert(financeExpenseItemsTable).values({ expenseId: e.id, position: 0, name: `${g.title} (${BASIS_LABEL[g.basis as Basis].toLowerCase()})`.slice(0, 200), quantity: null, unit: "", unitPrice: null, lineTotal: amount, category: "labor", kind: "service", note: b.data.note });
    await tx.insert(financePaymentsTable).values({ projectId: a.project.id, homeId: a.home.id, kind: "payment", date: b.data.date, amount, payeeName: g.contractorName, purpose: description, method: b.data.method, expenseId: e.id, createdByUserId: userId });
    await audit({ homeId: a.home.id, actorUserId: userId, actorRole: "owner", action: "agreement.payment", entityType: "agreement", entityId: g.id, summary: `${b.data.date} · ${amount} AZN · ${g.contractorName}` }, tx);
  });
  res.status(201).json(await view(g));
});

/** The tradesperson's link: a new one replaces the old one. */
router.post("/home-projects/:projectId/agreements/:id/share", async (req, res): Promise<void> => {
  const a = await manage(req, res); if (!a) return;
  const g = await load(a, String(req.params.id));
  if (!g) return bad(res, "Razılaşma tapılmadı", 404);
  const token = newToken();
  await db.update(workAgreementsTable).set({ shareTokenHash: hashToken(token), shareCreatedAt: new Date(), shareRevokedAt: null, shareOpenedAt: null }).where(eq(workAgreementsTable.id, g.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "agreement.shared", entityType: "agreement", entityId: g.id, summary: g.contractorName });
  res.json({ url: `${publicOrigin(req)}/razilasma/${token}` });
});
router.delete("/home-projects/:projectId/agreements/:id/share", async (req, res): Promise<void> => {
  const a = await manage(req, res); if (!a) return;
  const g = await load(a, String(req.params.id));
  if (!g) return bad(res, "Razılaşma tapılmadı", 404);
  await db.update(workAgreementsTable).set({ shareRevokedAt: new Date() }).where(eq(workAgreementsTable.id, g.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "agreement.unshared", entityType: "agreement", entityId: g.id, summary: g.contractorName });
  res.json({ revoked: true });
});

/* ------------------------------------------------------------- the tradesperson's link (no account) */

const linkLimit = rateLimit({ windowMs: 60_000, max: 60, key: (req) => `agl:${req.ip}` });
const noStore = (res: Response) => { res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); res.setHeader("Referrer-Policy", "no-referrer"); };
async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [g] = await db.select().from(workAgreementsTable).where(eq(workAgreementsTable.shareTokenHash, hashToken(token)));
  return g && !g.shareRevokedAt ? g : null;
}

agreementPublicRouter.get("/agreement-links/:token", linkLimit, async (req, res): Promise<void> => {
  noStore(res);
  const g = await byToken(String(req.params.token));
  if (!g) return bad(res, "Link etibarsızdır və ya ev sahibi onu bağlayıb", 404);
  if (!g.shareOpenedAt) await db.update(workAgreementsTable).set({ shareOpenedAt: new Date() }).where(eq(workAgreementsTable.id, g.id));
  res.json(await view(g, true));
});

agreementPublicRouter.post("/agreement-links/:token/payments/:paymentId", linkLimit, async (req, res): Promise<void> => {
  noStore(res);
  const g = await byToken(String(req.params.token));
  if (!g) return bad(res, "Link etibarsızdır və ya ev sahibi onu bağlayıb", 404);
  const b = z.object({ status: z.enum(["confirmed", "disputed"]), note: z.string().trim().max(500).default("") }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Seçimi yoxlayın");
  if (b.data.status === "disputed" && !b.data.note) return bad(res, "Nəyin düz olmadığını qısa yazın");
  const id = String(req.params.paymentId);
  const [p] = isUuid(id) ? await db.select({ p: financePaymentsTable }).from(financePaymentsTable).innerJoin(financeExpensesTable, eq(financeExpensesTable.id, financePaymentsTable.expenseId))
    .where(and(eq(financePaymentsTable.id, id), eq(financeExpensesTable.agreementId, g.id), ne(financeExpensesTable.status, "void"))) : [];
  if (!p) return bad(res, "Ödəniş tapılmadı", 404);
  await db.update(financePaymentsTable).set({ status: b.data.status, confirmedAt: new Date(), confirmedByUserId: `agreement:${g.id}`, counterpartyNote: b.data.note || null }).where(eq(financePaymentsTable.id, p.p.id));
  await audit({ homeId: g.homeId, actorUserId: `agreement:${g.id}`, actorRole: "contractor_link", action: b.data.status === "confirmed" ? "agreement.payment_confirmed" : "agreement.payment_disputed", entityType: "agreement", entityId: g.id, summary: `${p.p.date} · ${p.p.amount} AZN${b.data.note ? ` · ${b.data.note}` : ""}` });
  res.json(await view(g, true));
});

export default router;
