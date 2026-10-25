import { getAuth } from "@clerk/express";
import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  financeBudgetVersionsTable,
  financeChangeOrdersTable,
  financeExpenseItemsTable,
  financeExpensesTable,
  financeInvoicesTable,
  financePartiesTable,
  financePaymentsTable,
  homeMediaTable,
  homeMembersTable,
  homeProjectsTable,
  homeRoomsTable,
  smetaProjectsTable,
  type FinanceExpenseRow,
  type FinancePartyRow,
  type FinancePaymentRow,
} from "@workspace/db";
import { audit, getHomeAccess, isUuid, normalizeMemberRole } from "../lib/homeAccess";
import { attachHomeMedia, HomeMediaError } from "../lib/homeMedia";
import { mediaDto } from "../lib/homeDtos";
import {
  computeLedger, duplicateCandidates, EXPENSE_CATEGORIES, expenseMismatch, financeWarnings, FORMULAS, fromCents, getProjectAccess,
  homeFinanceLevel, isCategory, lineCents, loadProjectData, parseAmount, parseQty, PAYMENT_METHODS, PARTY_ROLES, toCents,
  type ProjectAccess, type ProjectData,
} from "../lib/financeCore";
import { aiConfigured, AiNotConfigured, answerFinanceQuestion, extractInvoice, type InvoiceExtraction } from "../lib/invoiceAi";
import { buildFinanceWorkbook, buildJournalWorkbook } from "../lib/financeExport";
import { homeEstimateComparison } from "../lib/estimateLink";
import { rateLimit } from "../lib/rateLimit";
import { hashToken, newToken, publicOrigin } from "../lib/realtorCore";
import { logger } from "../lib/logger";
import { loadSmetaProjects } from "../lib/smetaRecords";
import { lineTotals, estimateTotal } from "../lib/smetaCalc";

/**
 * Home finance: projects, expense journal, AI-read invoices, payments / advances / debts, change orders,
 * budget versions, Excel export and questions answered from the project's own records.
 * Every rule about who may do what is checked here (financeCore.getProjectAccess); the browser only mirrors it.
 */
const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
const bad = (res: Response, error: string, status = 400) => { res.status(status).json({ error }); };
const notFound = (res: Response, what = "Layihə tapılmadı") => bad(res, what, 404);
const forbidden = (res: Response) => bad(res, "Bu əməliyyat üçün icazəniz yoxdur", 403);
const noStore = (res: Response) => { res.setHeader("Cache-Control", "private, no-store"); };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), "date");
const amount = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const a = parseAmount(v);
  if (a == null) { ctx.addIssue({ code: "custom", message: "amount" }); return z.NEVER; }
  return a;
});
const optAmount = z.union([z.string(), z.number(), z.null()]).optional().transform((v, ctx) => {
  if (v == null || v === "") return null;
  const a = parseAmount(v);
  if (a == null) { ctx.addIssue({ code: "custom", message: "amount" }); return z.NEVER; }
  return a;
});
const optUuid = z.string().uuid().nullable().optional();
const idemKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional();
const fileInput = z.object({ objectPath: z.string().max(300), originalName: z.string().max(255), contentType: z.string().max(120), size: z.number().int().positive() });

const roleOf = (a: ProjectAccess) => a.level === "manage" ? (a.memberRole ?? "member") : a.level;
async function projectAccess(req: Request, res: Response): Promise<ProjectAccess | null> {
  const a = await getProjectAccess(uid(req), String(req.params.projectId));
  if (!a) { notFound(res); return null; }
  return a;
}
const myPartyIds = (a: ProjectAccess) => new Set(a.myParties.map((p) => p.id));

/* ----------------------------------------------------------------- DTOs */

function partyDto(p: FinancePartyRow, a: ProjectAccess) {
  return {
    id: p.id, name: p.name, role: p.role, phone: a.level === "manage" || myPartyIds(a).has(p.id) ? p.phone : "", note: a.level === "manage" ? p.note : "",
    contractAmount: p.contractAmount, contractNote: p.contractNote, workerId: p.workerId, linked: !!p.userId, isMe: myPartyIds(a).has(p.id),
    invitePending: !!p.inviteTokenHash && !p.userId && !!p.inviteExpiresAt && p.inviteExpiresAt > new Date(), archived: !!p.archivedAt,
  };
}
const paymentDto = (p: FinancePaymentRow) => ({
  id: p.id, kind: p.kind, date: p.date, amount: p.amount, partyId: p.partyId, payeeName: p.payeeName, payerName: p.payerName, purpose: p.purpose,
  method: p.method, expenseId: p.expenseId, changeOrderId: p.changeOrderId, proofMediaId: p.proofMediaId, status: p.status, cancelReason: p.cancelReason,
  confirmedAt: p.confirmedAt?.toISOString() ?? null, createdByUserId: p.createdByUserId, createdAt: p.createdAt.toISOString(),
  bankVerified: false,
});

/** What a caller of this level may see of the project data. A tradesperson sees only its own account. */
function visibleData(d: ProjectData, a: ProjectAccess): ProjectData {
  if (a.level !== "party") return d;
  const mine = myPartyIds(a);
  const expenses = d.expenses.filter((e) => (e.partyId && mine.has(e.partyId)) || (e.fundedByPartyId && mine.has(e.fundedByPartyId)));
  const ids = new Set(expenses.map((e) => e.id));
  return {
    ...d,
    parties: d.parties.filter((p) => mine.has(p.id)),
    budget: [],
    changeOrders: d.changeOrders.filter((c) => c.partyId && mine.has(c.partyId)),
    expenses,
    items: d.items.filter((i) => ids.has(i.expenseId)),
    payments: d.payments.filter((p) => p.partyId && mine.has(p.partyId)),
    invoices: d.invoices.filter((i) => (i.expenseId && ids.has(i.expenseId))),
  };
}

async function smetaComparison(d: ProjectData, ledger: ReturnType<typeof computeLedger>) {
  if (!d.project.smetaProjectId) return null;
  const [rec] = await db.select().from(smetaProjectsTable).where(eq(smetaProjectsTable.id, d.project.smetaProjectId));
  if (!rec || (rec.homeId && rec.homeId !== d.project.homeId)) return null;
  const [p] = await loadSmetaProjects([rec]);
  if (!p) return null;
  const margin = p.defaultMarginPercentage;
  let material = 0, labor = 0;
  const sections = p.estimate.sections.map((s) => {
    let total = 0;
    for (const i of s.items) {
      const t = lineTotals(i, margin);
      material += t.materialTotal + t.wasteAmount; labor += t.laborTotal; total += t.rowTotal;
    }
    return { title: s.title, category: s.category, planned: toCents(total.toFixed(2)) };
  });
  const planned = toCents(estimateTotal(p.estimate, p.projectCosts, margin).toFixed(2));
  const actual = ledger.totals.actual;
  return {
    smetaProjectId: rec.id, name: rec.name, planned, plannedMaterial: toCents(material.toFixed(2)), plannedLabor: toCents(labor.toFixed(2)),
    actual, actualMaterial: ledger.totals.material, actualLabor: ledger.totals.labor, diff: planned - actual,
    usedPct: planned ? Math.round((actual / planned) * 1000) / 10 : null, sections,
    approvedChangeOrders: ledger.totals.approvedChangeOrders, pending: ledger.totals.pending,
  };
}

/* ------------------------------------------------------------- projects */

router.get("/homes/:homeId/projects", async (req, res): Promise<void> => {
  noStore(res);
  const userId = uid(req);
  const homeId = String(req.params.homeId);
  const level = await homeFinanceLevel(userId, homeId);
  let rows;
  if (level === "manage") {
    rows = await db.select().from(homeProjectsTable).where(eq(homeProjectsTable.homeId, homeId)).orderBy(desc(homeProjectsTable.createdAt));
  } else {
    if (!isUuid(homeId)) return notFound(res, "Ev tapılmadı");
    const linked = await db.select({ p: homeProjectsTable }).from(financePartiesTable)
      .innerJoin(homeProjectsTable, eq(homeProjectsTable.id, financePartiesTable.projectId))
      .where(and(eq(financePartiesTable.homeId, homeId), eq(financePartiesTable.userId, userId), isNull(financePartiesTable.archivedAt)));
    rows = [...new Map(linked.map((r) => [r.p.id, r.p])).values()];
    if (!rows.length && !(await getHomeAccess(userId, homeId))) return notFound(res, "Ev tapılmadı");
  }
  res.json({
    canManage: level === "manage", aiConfigured: aiConfigured(),
    projects: rows.map((p) => ({ id: p.id, name: p.name, kind: p.kind, status: p.status, startDate: p.startDate, endDate: p.endDate, smetaProjectId: p.smetaProjectId, createdAt: p.createdAt.toISOString() })),
  });
});

const ProjectBody = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["construction", "renovation", "other"]).default("construction"),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  budget: optAmount,
  smetaProjectId: optUuid,
});

router.post("/homes/:homeId/projects", async (req, res): Promise<void> => {
  const userId = uid(req);
  const homeId = String(req.params.homeId);
  if ((await homeFinanceLevel(userId, homeId)) !== "manage") return (await getHomeAccess(userId, homeId)) ? forbidden(res) : notFound(res, "Ev tapılmadı");
  const b = ProjectBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Layihənin adını və tarixlərini yoxlayın");
  const d = b.data;
  if (d.smetaProjectId && !(await smetaAllowed(d.smetaProjectId, homeId, userId))) return bad(res, "Smeta tapılmadı");
  const project = await db.transaction(async (tx) => {
    const [p] = await tx.insert(homeProjectsTable).values({
      homeId, name: d.name, kind: d.kind, startDate: d.startDate ?? null, endDate: d.endDate ?? null, smetaProjectId: d.smetaProjectId ?? null, createdByUserId: userId,
    }).returning();
    if (d.budget != null) await tx.insert(financeBudgetVersionsTable).values({ projectId: p.id, version: 1, total: d.budget, reason: "initial", createdByUserId: userId });
    await audit({ homeId, actorUserId: userId, actorRole: "owner", action: "project.created", entityType: "project", entityId: p.id, summary: `${p.name}${d.budget ? ` · büdcə ${d.budget} AZN` : ""}` }, tx);
    return p;
  });
  res.status(201).json({ id: project.id });
});

async function smetaAllowed(smetaId: string, homeId: string, userId: string) {
  const [s] = await db.select().from(smetaProjectsTable).where(eq(smetaProjectsTable.id, smetaId));
  return !!s && (s.homeId === homeId || s.ownerUserId === userId);
}

router.patch("/home-projects/:projectId", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level !== "manage") return forbidden(res);
  const b = ProjectBody.partial().extend({ status: z.enum(["active", "closed"]).optional() }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const d = b.data;
  if (d.smetaProjectId && !(await smetaAllowed(d.smetaProjectId, a.home.id, uid(req)))) return bad(res, "Smeta tapılmadı");
  const set: Partial<typeof homeProjectsTable.$inferInsert> = { updatedAt: new Date() };
  if (d.name !== undefined) set.name = d.name;
  if (d.kind !== undefined) set.kind = d.kind;
  if (d.startDate !== undefined) set.startDate = d.startDate;
  if (d.endDate !== undefined) set.endDate = d.endDate;
  if (d.status !== undefined) set.status = d.status;
  if (d.smetaProjectId !== undefined) set.smetaProjectId = d.smetaProjectId;
  await db.update(homeProjectsTable).set(set).where(eq(homeProjectsTable.id, a.project.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "project.updated", entityType: "project", entityId: a.project.id, summary: a.project.name });
  res.json({ ok: true });
});

/** The whole finance view of a project, filtered to what the caller may see. */
router.get("/home-projects/:projectId/finance", async (req, res): Promise<void> => {
  noStore(res);
  const a = await projectAccess(req, res); if (!a) return;
  const full = await loadProjectData(a.project);
  const d = visibleData(full, a);
  // Balances are always computed on the full data, then filtered — a tradesperson sees the same numbers for itself as the owner does.
  const ledger = computeLedger(full);
  const mine = myPartyIds(a);
  const itemsBy = new Map<string, typeof d.items>();
  for (const i of d.items) itemsBy.set(i.expenseId, [...(itemsBy.get(i.expenseId) ?? []), i]);
  const mediaIds = [...new Set([...d.invoices.map((i) => i.mediaId), ...d.payments.map((p) => p.proofMediaId).filter((x): x is string => !!x), ...d.changeOrders.flatMap((c) => c.mediaIds)])];
  const media = mediaIds.length ? await db.select().from(homeMediaTable).where(and(sql`${homeMediaTable.id} in ${mediaIds}`, isNull(homeMediaTable.deletedAt))) : [];
  const rooms = await db.select({ id: homeRoomsTable.id, name: homeRoomsTable.name }).from(homeRoomsTable).where(eq(homeRoomsTable.homeId, a.home.id));
  const totals = a.level === "party" ? null : ledger.totals;
  res.json({
    project: { id: a.project.id, homeId: a.home.id, homeName: a.home.name, name: a.project.name, kind: a.project.kind, status: a.project.status, startDate: a.project.startDate, endDate: a.project.endDate, smetaProjectId: a.project.smetaProjectId },
    level: a.level,
    aiConfigured: aiConfigured(),
    permissions: {
      manage: a.level === "manage",
      addExpense: true,
      addInvoice: a.level !== "party",
      addPayment: a.level === "manage",
      proposeChange: true,
      export: a.level !== "party",
      ask: a.level !== "party",
    },
    categories: Object.entries(EXPENSE_CATEGORIES).map(([key, v]) => ({ key, label: v.label, group: v.group, legacy: v.legacy })),
    totals,
    formulas: FORMULAS,
    parties: d.parties.map((p) => ({ ...partyDto(p, a), balance: ledger.parties.find((b) => b.partyId === p.id) ?? null })),
    byCategory: a.level === "party" ? [] : ledger.byCategory,
    warnings: a.level === "party" ? [] : financeWarnings(full, ledger),
    budget: d.budget.map((v) => ({ id: v.id, version: v.version, total: v.total, reason: v.reason, note: v.note, changeOrderId: v.changeOrderId, createdAt: v.createdAt.toISOString() })),
    changeOrders: d.changeOrders.map((c) => ({
      id: c.id, number: c.number, partyId: c.partyId, title: c.title, description: c.description, reason: c.reason, amount: c.amount, date: c.date, mediaIds: c.mediaIds,
      status: c.status, decisionNote: c.decisionNote, decidedAt: c.decidedAt?.toISOString() ?? null, mine: c.proposedByUserId === uid(req), createdAt: c.createdAt.toISOString(),
    })),
    expenses: d.expenses.map((e) => ({
      ...expenseDto(e, itemsBy.get(e.id) ?? []), payState: ledger.payState.get(e.id) ?? null, mine: e.createdByUserId === uid(req),
    })),
    payments: d.payments.map((p) => ({ ...paymentDto(p), toMe: !!p.partyId && mine.has(p.partyId) })),
    invoices: d.invoices.map((i) => ({
      id: i.id, mediaId: i.mediaId, status: i.status, aiResult: i.aiResult, aiError: i.aiError, aiModel: i.aiModel, docNumber: i.docNumber, vendor: i.vendor, docDate: i.docDate, total: i.total,
      duplicateOfId: i.duplicateOfId, expenseId: i.expenseId, confirmedAt: i.confirmedAt?.toISOString() ?? null, createdAt: i.createdAt.toISOString(), mine: i.uploadedByUserId === uid(req),
    })),
    media: media.map((m) => mediaDto(m, uid(req))),
    rooms,
    smeta: a.level === "party" ? null : await smetaComparison(full, ledger),
  });
});

function expenseDto(e: FinanceExpenseRow, items: ProjectData["items"]) {
  return {
    id: e.id, date: e.date, category: e.category, description: e.description, partyId: e.partyId, vendorName: e.vendorName, roomId: e.roomId,
    subtotal: e.subtotal, discount: e.discount, tax: e.tax, total: e.total, paymentMethod: e.paymentMethod, fundedByPartyId: e.fundedByPartyId,
    invoiceId: e.invoiceId, note: e.note, status: e.status, approvedAt: e.approvedAt?.toISOString() ?? null, voidReason: e.voidReason,
    createdAt: e.createdAt.toISOString(),
    items: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    mismatch: expenseMismatch(e, items),
  };
}

/* ---------------------------------------------------------------- budget */

router.post("/home-projects/:projectId/budget", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level !== "manage") return forbidden(res);
  const b = z.object({ total: amount, note: z.string().trim().max(500).default("") }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Büdcə məbləğini yoxlayın");
  const userId = uid(req);
  const r = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from home_projects where id = ${a.project.id} for update`);
    const [{ v }] = await tx.select({ v: max(financeBudgetVersionsTable.version) }).from(financeBudgetVersionsTable).where(eq(financeBudgetVersionsTable.projectId, a.project.id));
    const version = (v ?? 0) + 1;
    // Changing an existing budget by hand is a correction and needs a reason; change orders add versions on their own.
    if (version > 1 && !b.data.note) return { error: "Büdcəni dəyişmək üçün səbəbi yazın" };
    await tx.insert(financeBudgetVersionsTable).values({ projectId: a.project.id, version, total: b.data.total, reason: version === 1 ? "initial" : "correction", note: b.data.note, createdByUserId: userId });
    await audit({ homeId: a.home.id, actorUserId: userId, actorRole: roleOf(a), action: version === 1 ? "budget.set" : "budget.corrected", entityType: "project", entityId: a.project.id, summary: `Büdcə v${version}: ${b.data.total} AZN${b.data.note ? ` — ${b.data.note}` : ""}` }, tx);
    return { version };
  });
  if ("error" in r) return bad(res, r.error!);
  res.json(r);
});

/* --------------------------------------------------------------- parties */

const PartyBody = z.object({
  name: z.string().trim().min(1).max(160),
  role: z.enum(PARTY_ROLES),
  phone: z.string().trim().max(32).default(""),
  note: z.string().trim().max(1000).default(""),
  contractAmount: optAmount,
  contractNote: z.string().trim().max(1000).default(""),
  workerId: optUuid,
});

router.post("/home-projects/:projectId/parties", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level !== "manage") return forbidden(res);
  const b = PartyBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Adı və rolu yoxlayın");
  const d = b.data;
  const [p] = await db.insert(financePartiesTable).values({
    projectId: a.project.id, homeId: a.home.id, name: d.name, role: d.role, phone: d.phone, note: d.note, contractAmount: d.contractAmount ?? null,
    contractNote: d.contractNote, workerId: d.workerId ?? null, createdByUserId: uid(req),
  }).returning();
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "party.created", entityType: "party", entityId: p.id, summary: `${p.name} (${p.role})${p.contractAmount ? ` · müqavilə ${p.contractAmount} AZN` : ""}` });
  res.status(201).json(partyDto(p, a));
});

router.patch("/home-projects/:projectId/parties/:partyId", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level !== "manage") return forbidden(res);
  const [p] = await db.select().from(financePartiesTable).where(and(eq(financePartiesTable.id, String(req.params.partyId)), eq(financePartiesTable.projectId, a.project.id)));
  if (!p) return notFound(res, "Tərəf tapılmadı");
  const b = PartyBody.partial().extend({ reason: z.string().trim().max(500).default(""), archived: z.boolean().optional() }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const d = b.data;
  if (d.contractAmount !== undefined && p.contractAmount != null && d.contractAmount !== p.contractAmount && !d.reason) return bad(res, "Müqavilə məbləğini dəyişmək üçün səbəbi yazın");
  const set: Partial<typeof financePartiesTable.$inferInsert> = { updatedAt: new Date() };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["name", "role", "phone", "note", "contractAmount", "contractNote", "workerId"] as const) {
    if (d[k] !== undefined && d[k] !== p[k]) { (set as Record<string, unknown>)[k] = d[k]; changes[k] = { from: p[k], to: d[k] }; }
  }
  if (d.archived !== undefined) { set.archivedAt = d.archived ? new Date() : null; changes.archived = { from: !!p.archivedAt, to: d.archived }; }
  await db.update(financePartiesTable).set(set).where(eq(financePartiesTable.id, p.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "party.updated", entityType: "party", entityId: p.id, summary: `${p.name}${d.reason ? ` — ${d.reason}` : ""}`, changes });
  res.json({ ok: true });
});

/** Link for a contractor / tradesperson to see this project's finance with their own account. */
router.post("/home-projects/:projectId/parties/:partyId/invite", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level !== "manage") return forbidden(res);
  const [p] = await db.select().from(financePartiesTable).where(and(eq(financePartiesTable.id, String(req.params.partyId)), eq(financePartiesTable.projectId, a.project.id)));
  if (!p) return notFound(res, "Tərəf tapılmadı");
  if (p.role !== "contractor" && p.role !== "worker") return bad(res, "Dəvət yalnız podratçı və ustaya göndərilir");
  const token = newToken();
  await db.update(financePartiesTable).set({ inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(Date.now() + 14 * 86_400_000), updatedAt: new Date() }).where(eq(financePartiesTable.id, p.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "party.invited", entityType: "party", entityId: p.id, summary: p.name });
  res.json({ url: `${publicOrigin(req)}/hesab/${token}`, expiresInDays: 14 });
});

async function inviteParty(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [p] = await db.select().from(financePartiesTable).where(eq(financePartiesTable.inviteTokenHash, hashToken(token)));
  if (!p || p.archivedAt || !p.inviteExpiresAt || p.inviteExpiresAt <= new Date()) return null;
  const [project] = await db.select().from(homeProjectsTable).where(eq(homeProjectsTable.id, p.projectId));
  return project ? { p, project } : null;
}

router.get("/finance-invites/:token", async (req, res): Promise<void> => {
  noStore(res);
  const x = await inviteParty(String(req.params.token));
  if (!x) return notFound(res, "Dəvət etibarsızdır və ya müddəti bitib");
  res.json({ projectName: x.project.name, partyName: x.p.name, role: x.p.role, alreadyLinked: !!x.p.userId });
});

router.post("/finance-invites/:token/accept", async (req, res): Promise<void> => {
  const userId = uid(req);
  const x = await inviteParty(String(req.params.token));
  if (!x) return notFound(res, "Dəvət etibarsızdır və ya müddəti bitib");
  if (x.p.userId && x.p.userId !== userId) return bad(res, "Bu dəvət artıq başqa hesabla qəbul edilib", 409);
  await db.transaction(async (tx) => {
    // The link works once: the token is cleared when it is accepted.
    await tx.update(financePartiesTable).set({ userId, inviteTokenHash: null, inviteExpiresAt: null, updatedAt: new Date() }).where(eq(financePartiesTable.id, x.p.id));
    const [m] = await tx.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, x.project.homeId), eq(homeMembersTable.userId, userId)));
    // A contractor adds stages and photos (contributor); a tradesperson only looks (viewer). Existing roles are never lowered.
    if (!m) await tx.insert(homeMembersTable).values({ homeId: x.project.homeId, userId, role: x.p.role === "contractor" ? "contributor" : "viewer", displayName: x.p.name, addedByUserId: x.p.createdByUserId });
    await audit({ homeId: x.project.homeId, actorUserId: userId, actorRole: x.p.role, action: "party.linked", entityType: "party", entityId: x.p.id, summary: `${x.p.name} hesabını qoşdu${m ? ` (mövcud rol: ${normalizeMemberRole(m.role)})` : ""}` }, tx);
  });
  res.json({ homeId: x.project.homeId, projectId: x.project.id });
});

/* -------------------------------------------------------------- expenses */

const ItemBody = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.union([z.string(), z.number(), z.null()]).optional(),
  unit: z.string().trim().max(16).default(""),
  unitPrice: optAmount,
  lineTotal: optAmount,
});
const ExpenseBody = z.object({
  date: isoDate,
  category: z.string().refine(isCategory, "category"),
  description: z.string().trim().min(1).max(300),
  partyId: optUuid,
  vendorName: z.string().trim().max(200).default(""),
  roomId: optUuid,
  items: z.array(ItemBody).max(200).default([]),
  subtotal: optAmount,
  discount: optAmount,
  tax: optAmount,
  total: amount,
  paymentMethod: z.enum(PAYMENT_METHODS).default(""),
  fundedByPartyId: optUuid,
  invoiceId: optUuid,
  note: z.string().trim().max(2000).default(""),
  /** Owner paid it on the spot: a matching payment is recorded in the same transaction. */
  paidNow: z.boolean().default(false),
  idempotencyKey: idemKey,
  /** Expense date chosen from: printed | handwritten | manual | today (kept with the invoice review). */
  dateSource: z.enum(["printed", "handwritten", "manual", "today"]).optional(),
});

type ExpenseInput = z.infer<typeof ExpenseBody>;

async function checkRefs(a: ProjectAccess, d: { partyId?: string | null; fundedByPartyId?: string | null; roomId?: string | null }) {
  for (const id of [d.partyId, d.fundedByPartyId]) {
    if (!id) continue;
    const [p] = await db.select({ id: financePartiesTable.id }).from(financePartiesTable).where(and(eq(financePartiesTable.id, id), eq(financePartiesTable.projectId, a.project.id)));
    if (!p) return "Seçilmiş tərəf bu layihəyə aid deyil";
  }
  if (d.roomId) {
    const [r] = await db.select({ id: homeRoomsTable.id }).from(homeRoomsTable).where(and(eq(homeRoomsTable.id, d.roomId), eq(homeRoomsTable.homeId, a.home.id)));
    if (!r) return "Otaq bu evə aid deyil";
  }
  if (a.level === "party") {
    const mine = myPartyIds(a);
    if (!d.partyId || !mine.has(d.partyId)) return "Usta yalnız öz hesabına xərc əlavə edə bilər";
  }
  return null;
}

function normalizeItems(items: ExpenseInput["items"]) {
  return items.map((i, position) => {
    const quantity = parseQty(i.quantity);
    const lineTotal = i.lineTotal ?? (quantity && i.unitPrice ? fromCents(lineCents(quantity, i.unitPrice)) : null);
    return { position, name: i.name, quantity, unit: i.unit, unitPrice: i.unitPrice ?? null, lineTotal: lineTotal ?? "0.00" };
  });
}

router.post("/home-projects/:projectId/expenses", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const b = ExpenseBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, `Xərc məlumatlarını yoxlayın (${b.error.issues.map((i) => i.path.join(".")).join(", ")})`);
  const d = b.data;
  const refErr = await checkRefs(a, d);
  if (refErr) return bad(res, refErr);
  if (d.paidNow && a.level !== "manage") return bad(res, "Ödənişi yalnız ev sahibi qeyd edir");
  if (d.paidNow && d.fundedByPartyId) return bad(res, "Avansdan ödənmiş xərc üçün ayrıca ödəniş yazılmır");
  const userId = uid(req);
  if (d.idempotencyKey) {
    const [dup] = await db.select().from(financeExpensesTable).where(and(eq(financeExpensesTable.projectId, a.project.id), eq(financeExpensesTable.idempotencyKey, d.idempotencyKey)));
    if (dup) return void res.json({ id: dup.id, duplicateRequest: true });
  }
  const items = normalizeItems(d.items);
  const subtotal = d.subtotal ?? (items.length ? fromCents(items.reduce((s, i) => s + toCents(i.lineTotal), 0)) : fromCents(toCents(d.total) + toCents(d.discount) - toCents(d.tax)));
  const status = a.level === "manage" ? "approved" : "pending";
  try {
    const out = await db.transaction(async (tx) => {
      let invoice: typeof financeInvoicesTable.$inferSelect | undefined;
      if (d.invoiceId) {
        [invoice] = await tx.select().from(financeInvoicesTable).where(and(eq(financeInvoicesTable.id, d.invoiceId), eq(financeInvoicesTable.projectId, a.project.id))).for("update");
        if (!invoice) throw new UserError("Qaimə tapılmadı");
        if (invoice.expenseId || invoice.status === "confirmed") throw new UserError("Bu qaimə artıq xərc kimi təsdiqlənib");
        if (invoice.status === "discarded") throw new UserError("Bu qaimə ləğv edilib");
        if (a.level !== "manage" && invoice.uploadedByUserId !== userId) throw new UserError("Bu qaiməni yalnız yükləyən və ya ev sahibi təsdiqləyə bilər");
      }
      const [e] = await tx.insert(financeExpensesTable).values({
        projectId: a.project.id, homeId: a.home.id, date: d.date, category: d.category, description: d.description, partyId: d.partyId ?? null,
        vendorName: d.vendorName, roomId: d.roomId ?? null, subtotal, discount: d.discount ?? "0.00", tax: d.tax ?? "0.00", total: d.total,
        paymentMethod: d.paymentMethod, fundedByPartyId: d.fundedByPartyId ?? null, invoiceId: d.invoiceId ?? null, note: d.note, status,
        approvedByUserId: status === "approved" ? userId : null, approvedAt: status === "approved" ? new Date() : null,
        idempotencyKey: d.idempotencyKey ?? null, createdByUserId: userId,
      }).returning();
      if (items.length) await tx.insert(financeExpenseItemsTable).values(items.map((i) => ({ ...i, expenseId: e.id })));
      if (invoice) {
        // Keep what AI read and what the person confirmed, side by side.
        const confirmed = { ...d, items, subtotal, idempotencyKey: undefined, paidNow: undefined };
        await tx.update(financeInvoicesTable).set({
          status: "confirmed", expenseId: e.id, confirmed, confirmedByUserId: userId, confirmedAt: new Date(),
          vendor: d.vendorName || invoice.vendor, docDate: d.date, total: d.total,
        }).where(eq(financeInvoicesTable.id, invoice.id));
      }
      if (d.paidNow) {
        await tx.insert(financePaymentsTable).values({
          projectId: a.project.id, homeId: a.home.id, kind: "payment", date: d.date, amount: d.total, partyId: d.partyId ?? null, payeeName: d.vendorName,
          purpose: d.description.slice(0, 300), method: d.paymentMethod, expenseId: e.id, createdByUserId: userId,
        });
      }
      await audit({ homeId: a.home.id, actorUserId: userId, actorRole: roleOf(a), action: "expense.created", entityType: "expense", entityId: e.id,
        summary: `${d.date} · ${d.description} · ${d.total} AZN${status === "pending" ? " (təsdiq gözləyir)" : ""}${invoice ? " · qaimədən" : ""}` }, tx);
      return e;
    });
    res.status(201).json({ id: out.id, status: out.status, mismatch: expenseMismatch(out, items) });
  } catch (err) {
    if (err instanceof UserError) return bad(res, err.message);
    // Unique (project, idempotency key) — a double tap that raced the check above.
    if (String((err as { code?: string }).code) === "23505" && d.idempotencyKey) {
      const [dup] = await db.select().from(financeExpensesTable).where(and(eq(financeExpensesTable.projectId, a.project.id), eq(financeExpensesTable.idempotencyKey, d.idempotencyKey)));
      if (dup) return void res.json({ id: dup.id, duplicateRequest: true });
    }
    throw err;
  }
});

class UserError extends Error {}

async function loadExpense(a: ProjectAccess, id: string) {
  if (!isUuid(id)) return null;
  const [e] = await db.select().from(financeExpensesTable).where(and(eq(financeExpensesTable.id, id), eq(financeExpensesTable.projectId, a.project.id)));
  return e ?? null;
}

router.patch("/home-projects/:projectId/expenses/:expenseId", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const e = await loadExpense(a, String(req.params.expenseId));
  if (!e) return notFound(res, "Xərc tapılmadı");
  const own = e.createdByUserId === uid(req) && e.status === "pending";
  if (a.level !== "manage" && !own) return forbidden(res);
  if (e.status === "void") return bad(res, "Ləğv edilmiş qeyd dəyişdirilmir");
  const b = ExpenseBody.omit({ paidNow: true, idempotencyKey: true, invoiceId: true }).partial().extend({ reason: z.string().trim().max(500).default("") }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const d = b.data;
  // An approved financial record is never changed silently.
  if (e.status === "approved" && !d.reason) return bad(res, "Təsdiqlənmiş xərci dəyişmək üçün səbəbi yazın");
  const refErr = await checkRefs(a, { partyId: d.partyId === undefined ? e.partyId : d.partyId, fundedByPartyId: d.fundedByPartyId, roomId: d.roomId });
  if (refErr) return bad(res, refErr);
  const set: Partial<typeof financeExpensesTable.$inferInsert> = { updatedAt: new Date() };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["date", "category", "description", "partyId", "vendorName", "roomId", "subtotal", "discount", "tax", "total", "paymentMethod", "fundedByPartyId", "note"] as const) {
    let v = d[k];
    // Money columns are never empty: no value means "keep" (subtotal) or zero (discount, tax).
    if (v === null && (k === "subtotal" || k === "total")) v = undefined;
    if (v === null && (k === "discount" || k === "tax")) v = "0.00";
    if (v !== undefined && v !== e[k]) { (set as Record<string, unknown>)[k] = v; changes[k] = { from: e[k], to: v }; }
  }
  await db.transaction(async (tx) => {
    if (d.items) {
      const before = await tx.select().from(financeExpenseItemsTable).where(eq(financeExpenseItemsTable.expenseId, e.id));
      const items = normalizeItems(d.items);
      await tx.delete(financeExpenseItemsTable).where(eq(financeExpenseItemsTable.expenseId, e.id));
      if (items.length) await tx.insert(financeExpenseItemsTable).values(items.map((i) => ({ ...i, expenseId: e.id })));
      changes.items = { from: before.map((i) => `${i.name} ${i.quantity ?? ""}${i.unit} × ${i.unitPrice ?? ""} = ${i.lineTotal}`), to: items.map((i) => `${i.name} ${i.quantity ?? ""}${i.unit} × ${i.unitPrice ?? ""} = ${i.lineTotal}`) };
    }
    await tx.update(financeExpensesTable).set(set).where(eq(financeExpensesTable.id, e.id));
    await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "expense.edited", entityType: "expense", entityId: e.id,
      summary: `${e.description}${d.reason ? ` — səbəb: ${d.reason}` : ""}`, changes }, tx);
  });
  res.json({ ok: true });
});

router.post("/home-projects/:projectId/expenses/:expenseId/status", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const e = await loadExpense(a, String(req.params.expenseId));
  if (!e) return notFound(res, "Xərc tapılmadı");
  const b = z.object({ action: z.enum(["approve", "dispute", "void", "reopen"]), reason: z.string().trim().max(500).default("") }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Əməliyyatı seçin");
  const { action, reason } = b.data;
  const own = e.createdByUserId === uid(req);
  // Only the owner side approves. The author may withdraw (void) their own pending record.
  if (a.level !== "manage" && !(action === "void" && own && e.status === "pending")) return forbidden(res);
  if (e.status === "void") return bad(res, "Ləğv edilmiş qeyd dəyişdirilmir");
  if ((action === "void" || action === "dispute") && !reason) return bad(res, "Səbəbi yazın");
  const next = action === "approve" ? "approved" : action === "dispute" ? "disputed" : action === "void" ? "void" : "pending";
  await db.transaction(async (tx) => {
    await tx.update(financeExpensesTable).set({
      status: next, updatedAt: new Date(),
      ...(next === "approved" ? { approvedByUserId: uid(req), approvedAt: new Date() } : {}),
      ...(next === "void" ? { voidReason: reason } : {}),
    }).where(eq(financeExpensesTable.id, e.id));
    // A voided expense no longer counts as paid by a linked on-the-spot payment either.
    if (next === "void") await tx.update(financePaymentsTable).set({ status: "cancelled", cancelReason: `Xərc ləğv edildi: ${reason}`, updatedAt: new Date() })
      .where(and(eq(financePaymentsTable.expenseId, e.id), sql`${financePaymentsTable.status} in ('recorded','confirmed')`));
    if (next === "void" && e.invoiceId) await tx.update(financeInvoicesTable).set({ status: "read", expenseId: null }).where(eq(financeInvoicesTable.id, e.invoiceId));
    await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: `expense.${action}`, entityType: "expense", entityId: e.id,
      summary: `${e.description} · ${e.total} AZN${reason ? ` — ${reason}` : ""}`, changes: { status: { from: e.status, to: next } } }, tx);
  });
  res.json({ status: next });
});

/* -------------------------------------------------------------- payments */

const PaymentBody = z.object({
  kind: z.enum(["payment", "advance", "refund"]),
  date: isoDate,
  amount,
  partyId: optUuid,
  payeeName: z.string().trim().max(200).default(""),
  payerName: z.string().trim().max(200).default(""),
  purpose: z.string().trim().max(300).default(""),
  method: z.enum(PAYMENT_METHODS).default(""),
  expenseId: optUuid,
  changeOrderId: optUuid,
  proofMediaId: optUuid,
  idempotencyKey: idemKey,
});

router.post("/home-projects/:projectId/payments", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level !== "manage") return forbidden(res);
  const b = PaymentBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Ödəniş məlumatlarını yoxlayın");
  const d = b.data;
  if (toCents(d.amount) <= 0) return bad(res, "Məbləğ sıfırdan böyük olmalıdır");
  if ((d.kind === "advance" || d.kind === "refund") && !d.partyId) return bad(res, "Avans və geri qaytarma üçün tərəfi seçin");
  if (!d.partyId && !d.payeeName) return bad(res, "Pulu alanı seçin və ya adını yazın");
  const refErr = await checkRefs(a, { partyId: d.partyId });
  if (refErr) return bad(res, refErr);
  if (d.expenseId && !(await loadExpense(a, d.expenseId))) return bad(res, "Xərc bu layihəyə aid deyil");
  if (d.changeOrderId) {
    const [c] = await db.select({ id: financeChangeOrdersTable.id }).from(financeChangeOrdersTable).where(and(eq(financeChangeOrdersTable.id, d.changeOrderId), eq(financeChangeOrdersTable.projectId, a.project.id)));
    if (!c) return bad(res, "Əlavə iş bu layihəyə aid deyil");
  }
  if (d.proofMediaId && !(await financeMedia(a, d.proofMediaId))) return bad(res, "Sübut faylı tapılmadı");
  const userId = uid(req);
  if (d.idempotencyKey) {
    const [dup] = await db.select().from(financePaymentsTable).where(and(eq(financePaymentsTable.projectId, a.project.id), eq(financePaymentsTable.idempotencyKey, d.idempotencyKey)));
    if (dup) return void res.json({ id: dup.id, duplicateRequest: true });
  }
  try {
    const p = await db.transaction(async (tx) => {
      const [p] = await tx.insert(financePaymentsTable).values({
        projectId: a.project.id, homeId: a.home.id, kind: d.kind, date: d.date, amount: d.amount, partyId: d.partyId ?? null, payeeName: d.payeeName, payerName: d.payerName,
        purpose: d.purpose, method: d.method, expenseId: d.expenseId ?? null, changeOrderId: d.changeOrderId ?? null, proofMediaId: d.proofMediaId ?? null,
        idempotencyKey: d.idempotencyKey ?? null, createdByUserId: userId,
      }).returning();
      await audit({ homeId: a.home.id, actorUserId: userId, actorRole: roleOf(a), action: `payment.${d.kind}`, entityType: "payment", entityId: p.id, summary: `${d.date} · ${d.amount} AZN${d.purpose ? ` · ${d.purpose}` : ""}` }, tx);
      return p;
    });
    res.status(201).json(paymentDto(p));
  } catch (err) {
    if (String((err as { code?: string }).code) === "23505" && d.idempotencyKey) {
      const [dup] = await db.select().from(financePaymentsTable).where(and(eq(financePaymentsTable.projectId, a.project.id), eq(financePaymentsTable.idempotencyKey, d.idempotencyKey)));
      if (dup) return void res.json({ id: dup.id, duplicateRequest: true });
    }
    throw err;
  }
});

router.post("/home-projects/:projectId/payments/:paymentId/status", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const id = String(req.params.paymentId);
  if (!isUuid(id)) return notFound(res, "Ödəniş tapılmadı");
  const [p] = await db.select().from(financePaymentsTable).where(and(eq(financePaymentsTable.id, id), eq(financePaymentsTable.projectId, a.project.id)));
  if (!p) return notFound(res, "Ödəniş tapılmadı");
  const b = z.object({ action: z.enum(["confirm", "dispute", "cancel", "reopen"]), reason: z.string().trim().max(500).default("") }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Əməliyyatı seçin");
  const { action, reason } = b.data;
  const receiver = !!p.partyId && myPartyIds(a).has(p.partyId);
  // The receiving side confirms or disputes; the owner side cancels (with a reason) or reopens a dispute.
  if ((action === "confirm" || action === "dispute") && !receiver) return forbidden(res);
  if ((action === "cancel" || action === "reopen") && a.level !== "manage") return forbidden(res);
  if (p.status === "cancelled") return bad(res, "Ləğv edilmiş ödəniş dəyişdirilmir");
  if ((action === "dispute" || action === "cancel") && !reason) return bad(res, "Səbəbi yazın");
  const next = action === "confirm" ? "confirmed" : action === "dispute" ? "disputed" : action === "cancel" ? "cancelled" : "recorded";
  await db.transaction(async (tx) => {
    await tx.update(financePaymentsTable).set({
      status: next, updatedAt: new Date(),
      ...(next === "confirmed" ? { confirmedByUserId: uid(req), confirmedAt: new Date() } : {}),
      ...(next === "cancelled" || next === "disputed" ? { cancelReason: reason } : {}),
    }).where(eq(financePaymentsTable.id, p.id));
    await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: `payment.${action}`, entityType: "payment", entityId: p.id,
      summary: `${p.date} · ${p.amount} AZN${reason ? ` — ${reason}` : ""}`, changes: { status: { from: p.status, to: next } } }, tx);
  });
  res.json({ status: next });
});

router.patch("/home-projects/:projectId/payments/:paymentId", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level !== "manage") return forbidden(res);
  const id = String(req.params.paymentId);
  if (!isUuid(id)) return notFound(res, "Ödəniş tapılmadı");
  const [p] = await db.select().from(financePaymentsTable).where(and(eq(financePaymentsTable.id, id), eq(financePaymentsTable.projectId, a.project.id)));
  if (!p) return notFound(res, "Ödəniş tapılmadı");
  if (p.status === "cancelled") return bad(res, "Ləğv edilmiş ödəniş dəyişdirilmir");
  const b = PaymentBody.omit({ idempotencyKey: true, kind: true }).partial().extend({ reason: z.string().trim().max(500).default("") }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const d = b.data;
  const moneyChange = (d.amount !== undefined && d.amount !== p.amount) || (d.date !== undefined && d.date !== p.date) || (d.partyId !== undefined && d.partyId !== p.partyId);
  if (moneyChange && !d.reason) return bad(res, "Ödənişin məbləğini, tarixini və ya alanını dəyişmək üçün səbəbi yazın");
  const refErr = await checkRefs(a, { partyId: d.partyId });
  if (refErr) return bad(res, refErr);
  if (d.proofMediaId && !(await financeMedia(a, d.proofMediaId))) return bad(res, "Sübut faylı tapılmadı");
  const set: Partial<typeof financePaymentsTable.$inferInsert> = { updatedAt: new Date() };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["date", "amount", "partyId", "payeeName", "payerName", "purpose", "method", "expenseId", "changeOrderId", "proofMediaId"] as const) {
    const v = d[k];
    if (v !== undefined && v !== p[k]) { (set as Record<string, unknown>)[k] = v; changes[k] = { from: p[k], to: v }; }
  }
  // A confirmed payment whose amount changed must be confirmed again by the receiver.
  if (moneyChange && p.status === "confirmed") { set.status = "recorded"; set.confirmedAt = null; set.confirmedByUserId = null; changes.status = { from: p.status, to: "recorded" }; }
  await db.update(financePaymentsTable).set(set).where(eq(financePaymentsTable.id, p.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "payment.edited", entityType: "payment", entityId: p.id, summary: `${p.amount} AZN${d.reason ? ` — səbəb: ${d.reason}` : ""}`, changes });
  res.json({ ok: true });
});

/* --------------------------------------------------------- change orders */

const ChangeBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).default(""),
  reason: z.string().trim().max(2000).default(""),
  amount,
  date: isoDate,
  partyId: optUuid,
  mediaIds: z.array(z.string().uuid()).max(20).default([]),
});

router.post("/home-projects/:projectId/change-orders", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const b = ChangeBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Əlavə işin adını, məbləğini və tarixini yoxlayın");
  const d = b.data;
  let partyId = d.partyId ?? null;
  // A contractor / tradesperson proposes in their own name.
  if (a.level !== "manage") partyId = partyId && myPartyIds(a).has(partyId) ? partyId : a.myParties[0]?.id ?? null;
  const refErr = await checkRefs(a, { partyId });
  if (refErr) return bad(res, refErr);
  for (const m of d.mediaIds) if (!(await financeMedia(a, m))) return bad(res, "Fayl tapılmadı");
  const userId = uid(req);
  const c = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from home_projects where id = ${a.project.id} for update`);
    const [{ n }] = await tx.select({ n: max(financeChangeOrdersTable.number) }).from(financeChangeOrdersTable).where(eq(financeChangeOrdersTable.projectId, a.project.id));
    const [c] = await tx.insert(financeChangeOrdersTable).values({
      projectId: a.project.id, number: (n ?? 0) + 1, partyId, title: d.title, description: d.description, reason: d.reason, amount: d.amount, date: d.date,
      mediaIds: d.mediaIds, status: "proposed", proposedByUserId: userId,
    }).returning();
    await audit({ homeId: a.home.id, actorUserId: userId, actorRole: roleOf(a), action: "change_order.proposed", entityType: "change_order", entityId: c.id, summary: `№${c.number} ${c.title} · ${c.amount} AZN` }, tx);
    return c;
  });
  res.status(201).json({ id: c.id, number: c.number });
});

router.patch("/home-projects/:projectId/change-orders/:changeId", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const id = String(req.params.changeId);
  if (!isUuid(id)) return notFound(res, "Əlavə iş tapılmadı");
  const [c] = await db.select().from(financeChangeOrdersTable).where(and(eq(financeChangeOrdersTable.id, id), eq(financeChangeOrdersTable.projectId, a.project.id)));
  if (!c) return notFound(res, "Əlavə iş tapılmadı");
  if (c.proposedByUserId !== uid(req) && a.level !== "manage") return forbidden(res);
  if (c.status !== "proposed" && c.status !== "clarification") return bad(res, "Qərar verilmiş təklif dəyişdirilmir");
  const b = ChangeBody.partial().safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const d = b.data;
  const set: Partial<typeof financeChangeOrdersTable.$inferInsert> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["title", "description", "reason", "amount", "date"] as const) {
    if (d[k] !== undefined && d[k] !== c[k]) { (set as Record<string, unknown>)[k] = d[k]; changes[k] = { from: c[k], to: d[k] }; }
  }
  if (d.mediaIds) { for (const m of d.mediaIds) if (!(await financeMedia(a, m))) return bad(res, "Fayl tapılmadı"); set.mediaIds = d.mediaIds; }
  // Answering a request for clarification sends it back for a decision.
  if (c.status === "clarification") { set.status = "proposed"; changes.status = { from: c.status, to: "proposed" }; }
  await db.update(financeChangeOrdersTable).set(set).where(eq(financeChangeOrdersTable.id, c.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "change_order.edited", entityType: "change_order", entityId: c.id, summary: `№${c.number} ${c.title}`, changes });
  res.json({ ok: true });
});

router.post("/home-projects/:projectId/change-orders/:changeId/decision", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level !== "manage") return forbidden(res);
  const id = String(req.params.changeId);
  if (!isUuid(id)) return notFound(res, "Əlavə iş tapılmadı");
  const b = z.object({ decision: z.enum(["approve", "reject", "clarify"]), note: z.string().trim().max(2000).default("") }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Qərarı seçin");
  const { decision, note } = b.data;
  if (decision !== "approve" && !note) return bad(res, decision === "reject" ? "Rədd etmə səbəbini yazın" : "Nəyi izah etməli olduqlarını yazın");
  const userId = uid(req);
  const r = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(financeChangeOrdersTable).where(and(eq(financeChangeOrdersTable.id, id), eq(financeChangeOrdersTable.projectId, a.project.id))).for("update");
    if (!c) return { error: "Əlavə iş tapılmadı", status: 404 };
    if (c.status !== "proposed" && c.status !== "clarification") return { error: "Bu təklif üzrə artıq qərar verilib", status: 409 };
    const next = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "clarification";
    await tx.update(financeChangeOrdersTable).set({ status: next, decidedByUserId: userId, decidedAt: new Date(), decisionNote: note }).where(eq(financeChangeOrdersTable.id, c.id));
    let budgetVersion: number | null = null;
    if (next === "approved") {
      // Only an approved change order moves the budget. Earlier versions stay.
      const [last] = await tx.select().from(financeBudgetVersionsTable).where(eq(financeBudgetVersionsTable.projectId, a.project.id)).orderBy(desc(financeBudgetVersionsTable.version)).limit(1);
      if (last) {
        budgetVersion = last.version + 1;
        await tx.insert(financeBudgetVersionsTable).values({
          projectId: a.project.id, version: budgetVersion, total: fromCents(toCents(last.total) + toCents(c.amount)), reason: "change_order",
          note: `Əlavə iş №${c.number}: ${c.title}`, changeOrderId: c.id, createdByUserId: userId,
        });
      }
    }
    await audit({ homeId: a.home.id, actorUserId: userId, actorRole: roleOf(a), action: `change_order.${decision}`, entityType: "change_order", entityId: c.id,
      summary: `№${c.number} ${c.title} · ${c.amount} AZN${note ? ` — ${note}` : ""}${budgetVersion ? ` · büdcə v${budgetVersion}` : ""}`, changes: { status: { from: c.status, to: next } } }, tx);
    return { status: next, budgetVersion };
  });
  if ("error" in r) return bad(res, r.error!, Number(r.status));
  res.json(r);
});

/* -------------------------------------------------------- files, invoices */

async function financeMedia(a: ProjectAccess, mediaId: string) {
  const [m] = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.id, mediaId), eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt)));
  return m ?? null;
}

/** Uploads a private finance file (payment proof, change-order photo, invoice) into the home's storage. */
async function attachFinanceFile(a: ProjectAccess, userId: string, file: z.infer<typeof fileInput>, caption: string) {
  const [m] = await attachHomeMedia(userId, [file], { homeId: a.home.id, workId: null, roomId: null, workerId: null, caption, phase: "finance" });
  return m;
}

router.post("/home-projects/:projectId/files", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const b = z.object({ file: fileInput, caption: z.string().trim().max(300).default("") }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Faylı yoxlayın");
  if (!b.data.file.contentType.startsWith("image/") && b.data.file.contentType !== "application/pdf") return bad(res, "Yalnız şəkil və ya PDF");
  try {
    const m = await attachFinanceFile(a, uid(req), b.data.file, b.data.caption);
    res.status(201).json(mediaDto(m, uid(req)));
  } catch (err) {
    if (err instanceof HomeMediaError) return bad(res, err.message);
    throw err;
  }
});

const aiLimit = rateLimit({ windowMs: 60 * 60_000, max: 60, key: (req) => `ai:${getAuth(req).userId}` });

router.post("/home-projects/:projectId/invoices", aiLimit, async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level === "party") return forbidden(res);
  const b = z.object({ file: fileInput, read: z.boolean().default(true) }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Faylı yoxlayın");
  const f = b.data.file;
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(f.contentType)) return bad(res, "Qaimə şəkil (JPG, PNG, WebP) və ya PDF olmalıdır");
  if (f.size > 15 * 1024 * 1024) return bad(res, "Fayl 15 MB-dan böyük olmamalıdır");
  let media;
  try { media = await attachFinanceFile(a, uid(req), f, "Qaimə / çek"); }
  catch (err) { if (err instanceof HomeMediaError) return bad(res, err.message); throw err; }
  const data = await loadProjectData(a.project);
  const dups = duplicateCandidates(data, { sha256: media.sha256 });
  const [inv] = await db.insert(financeInvoicesTable).values({
    projectId: a.project.id, homeId: a.home.id, mediaId: media.id, sha256: media.sha256, uploadedByUserId: uid(req),
    status: b.data.read && aiConfigured() ? "reading" : "uploaded", duplicateOfId: dups.find((x) => x.type === "invoice")?.id ?? null,
  }).returning();
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "invoice.uploaded", entityType: "invoice", entityId: inv.id, summary: media.originalName });
  if (inv.status === "reading") void readInvoice(inv.id, media.objectPath);
  res.status(201).json({ id: inv.id, status: inv.status, mediaId: media.id, duplicates: dups, aiConfigured: aiConfigured() });
});

/** Runs AI reading in the background; the page polls the project and sees read / failed. */
async function readInvoice(invoiceId: string, objectPath: string) {
  try {
    const { result, model } = await extractInvoice(objectPath);
    const total = result.total ? parseAmount(result.total) : null;
    const [inv] = await db.select().from(financeInvoicesTable).where(eq(financeInvoicesTable.id, invoiceId));
    if (!inv || inv.status === "confirmed" || inv.status === "discarded") return;
    const [project] = await db.select().from(homeProjectsTable).where(eq(homeProjectsTable.id, inv.projectId));
    const data = await loadProjectData(project);
    const date = result.handwrittenDate ?? result.printedDate;
    const dups = duplicateCandidates(data, { invoiceId, sha256: inv.sha256, docNumber: result.docNumber ?? "", vendor: result.vendor ?? "", date, total: total ? toCents(total) : null });
    await db.update(financeInvoicesTable).set({
      status: "read", aiResult: { ...result, duplicates: dups } as unknown as Record<string, unknown>, aiModel: model, aiError: null,
      docNumber: result.docNumber ?? "", vendor: result.vendor ?? "", docDate: date, total,
      duplicateOfId: inv.duplicateOfId ?? (dups.find((x) => x.type === "invoice")?.id ?? null),
    }).where(eq(financeInvoicesTable.id, invoiceId));
  } catch (err) {
    const msg = err instanceof AiNotConfigured ? "AI oxuma qoşulmayıb — məlumatları əl ilə daxil edin" : err instanceof Error ? err.message : "AI sənədi oxuya bilmədi";
    logger.warn({ invoiceId, err: msg }, "invoice read failed");
    await db.update(financeInvoicesTable).set({ status: "failed", aiError: msg }).where(and(eq(financeInvoicesTable.id, invoiceId), eq(financeInvoicesTable.status, "reading")));
  }
}

router.post("/home-projects/:projectId/invoices/:invoiceId/read", aiLimit, async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level === "party") return forbidden(res);
  if (!aiConfigured()) return bad(res, "AI oxuma hələ qoşulmayıb — məlumatları əl ilə daxil edin", 503);
  const id = String(req.params.invoiceId);
  if (!isUuid(id)) return notFound(res, "Qaimə tapılmadı");
  const [inv] = await db.select().from(financeInvoicesTable).where(and(eq(financeInvoicesTable.id, id), eq(financeInvoicesTable.projectId, a.project.id)));
  if (!inv) return notFound(res, "Qaimə tapılmadı");
  if (inv.status === "confirmed" || inv.status === "discarded") return bad(res, "Bu qaimə artıq bağlanıb");
  const [m] = await db.select().from(homeMediaTable).where(eq(homeMediaTable.id, inv.mediaId));
  if (!m) return notFound(res, "Fayl tapılmadı");
  await db.update(financeInvoicesTable).set({ status: "reading", aiError: null }).where(eq(financeInvoicesTable.id, inv.id));
  void readInvoice(inv.id, m.objectPath);
  res.json({ status: "reading" });
});

router.post("/home-projects/:projectId/invoices/:invoiceId/discard", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const id = String(req.params.invoiceId);
  if (!isUuid(id)) return notFound(res, "Qaimə tapılmadı");
  const [inv] = await db.select().from(financeInvoicesTable).where(and(eq(financeInvoicesTable.id, id), eq(financeInvoicesTable.projectId, a.project.id)));
  if (!inv) return notFound(res, "Qaimə tapılmadı");
  if (a.level !== "manage" && inv.uploadedByUserId !== uid(req)) return forbidden(res);
  if (inv.status === "confirmed") return bad(res, "Təsdiqlənmiş qaimə xərc qeydi ilə birlikdə ləğv edilir");
  await db.update(financeInvoicesTable).set({ status: "discarded" }).where(eq(financeInvoicesTable.id, inv.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: roleOf(a), action: "invoice.discarded", entityType: "invoice", entityId: inv.id, summary: inv.vendor || "qaimə" });
  res.json({ ok: true });
});

/** Duplicate check before saving an expense typed by hand (same vendor + date + total). */
router.post("/home-projects/:projectId/duplicates", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  const b = z.object({ vendor: z.string().max(200).default(""), date: isoDate.nullable().default(null), total: optAmount, docNumber: z.string().max(80).default(""), invoiceId: optUuid }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const data = visibleData(await loadProjectData(a.project), a);
  res.json(duplicateCandidates(data, { ...b.data, total: b.data.total ? toCents(b.data.total) : null }));
});

/* ---------------------------------------------------------------- export */

router.get("/home-projects/:projectId/export.xlsx", async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level === "party") return forbidden(res);
  const data = await loadProjectData(a.project);
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const buf = req.query.view === "journal"
    ? await buildJournalWorkbook(a, data, { from: day(req.query.from), to: day(req.query.to) }, await categoryComparison(a, data))
    : await buildFinanceWorkbook(a, data);
  const safe = a.project.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "layihe";
  noStore(res);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="tehvil-${encodeURIComponent(safe)}.xlsx"; filename*=UTF-8''tehvil-${encodeURIComponent(safe)}.xlsx`);
  res.send(buf);
});

/* ------------------------------------------------------------- assistant */

const askLimit = rateLimit({ windowMs: 60 * 60_000, max: 40, key: (req) => `ask:${getAuth(req).userId}` });

router.post("/home-projects/:projectId/ask", askLimit, async (req, res): Promise<void> => {
  const a = await projectAccess(req, res); if (!a) return;
  if (a.level === "party") return forbidden(res);
  const b = z.object({ question: z.string().trim().min(3).max(500) }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Sualı yazın");
  if (!aiConfigured()) return bad(res, "AI köməkçisi hələ qoşulmayıb", 503);
  const data = await loadProjectData(a.project);
  const ledger = computeLedger(data);
  const partyName = new Map(data.parties.map((p) => [p.id, p.name]));
  const rooms = await db.select({ id: homeRoomsTable.id, name: homeRoomsTable.name }).from(homeRoomsTable).where(eq(homeRoomsTable.homeId, a.home.id));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const c = (v: number | null) => (v == null ? null : fromCents(v));
  const context = {
    today: new Date().toISOString().slice(0, 10),
    project: { name: a.project.name, kind: a.project.kind },
    totals: Object.fromEntries(Object.entries(ledger.totals).map(([k, v]) => [k, typeof v === "number" && !/Count|Pct/.test(k) ? c(v) : v])),
    parties: ledger.parties.map((p) => ({ id: p.partyId, name: p.name, role: p.role, obligation: c(p.obligation), credited: c(p.credited), remaining: c(p.remaining), advanceBalance: c(p.advanceBalance), status: p.status })),
    expenses: data.expenses.filter((e) => e.status !== "void").map((e) => ({
      id: e.id, date: e.date, status: e.status, category: EXPENSE_CATEGORIES[e.category as keyof typeof EXPENSE_CATEGORIES]?.label ?? e.category, description: e.description,
      vendor: e.vendorName || (e.partyId ? partyName.get(e.partyId) : "") || "", room: e.roomId ? roomName.get(e.roomId) : undefined, total: e.total,
      fundedByAdvanceOf: e.fundedByPartyId ? partyName.get(e.fundedByPartyId) : undefined,
      lines: data.items.filter((i) => i.expenseId === e.id).map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    })),
    payments: data.payments.map((p) => ({ id: p.id, date: p.date, kind: p.kind, amount: p.amount, to: p.partyId ? partyName.get(p.partyId) : p.payeeName, status: p.status, purpose: p.purpose, hasProof: !!p.proofMediaId })),
    invoices: data.invoices.filter((i) => i.status !== "discarded").map((i) => ({ id: i.id, status: i.status, vendor: i.vendor, number: i.docNumber, date: i.docDate, total: i.total })),
    changeOrders: data.changeOrders.map((x) => ({ id: x.id, number: x.number, title: x.title, amount: x.amount, status: x.status })),
    budgetVersions: data.budget.map((v) => ({ version: v.version, total: v.total, reason: v.reason, note: v.note })),
  };
  try {
    const r = await answerFinanceQuestion(b.data.question, context);
    // Keep only references to records that really exist in this project.
    const known = new Set([...data.expenses.map((e) => e.id), ...data.payments.map((p) => p.id), ...data.invoices.map((i) => i.id), ...data.changeOrders.map((x) => x.id), ...data.parties.map((p) => p.id)]);
    res.json({ answer: r.answer, refs: r.refs.filter((x) => known.has(x.id)), model: r.model });
  } catch (err) {
    if (err instanceof AiNotConfigured) return bad(res, err.message, 503);
    return bad(res, err instanceof Error ? err.message : "AI cavab verə bilmədi", 502);
  }
});

/** Planned (estimate) vs actual by category — filled in by the AI Smeta link (phase 3); null when no estimate is linked. */
async function categoryComparison(a: ProjectAccess, _d: ProjectData): Promise<{ category: string; planned: number; actual: number }[] | null> {
  const c = await homeEstimateComparison(a.home.id);
  return c ? c.rows.map((r) => ({ category: r.label, planned: r.planned, actual: r.actual })) : null;
}

export type { InvoiceExtraction };
export default router;
