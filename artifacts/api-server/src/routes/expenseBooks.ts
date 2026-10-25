import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { db, financeBudgetVersionsTable, financeExpensesTable, homeAuditTable, homeMembersTable, homeProjectsTable, homesTable } from "@workspace/db";
import { audit, isUuid } from "../lib/homeAccess";
import { getProjectAccess, parseAmount, toCents } from "../lib/financeCore";
import { aiConfigured } from "../lib/invoiceAi";
import { bad, forbidden, noStore, notFound } from "./homes";
import { newPublicId } from "../lib/realtorCore";
import { homeEstimateComparison } from "../lib/estimateLink";

/*
 * "Evimin xərcləri": the simple face of home finance. One expense book per home = the home's first project.
 * The person sees homes, not projects; a home and its book are created in one step.
 */
const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The book of a home: its oldest project (created on demand for owners / members). */
async function bookOf(homeId: string) {
  const [p] = await db.select().from(homeProjectsTable).where(eq(homeProjectsTable.homeId, homeId)).orderBy(asc(homeProjectsTable.createdAt)).limit(1);
  return p ?? null;
}

router.get("/expense-books", async (req, res): Promise<void> => {
  noStore(res);
  const userId = uid(req);
  const homes = await db.select({ h: homesTable, role: homeMembersTable.role }).from(homeMembersTable)
    .innerJoin(homesTable, eq(homesTable.id, homeMembersTable.homeId))
    .where(and(eq(homeMembersTable.userId, userId), inArray(homeMembersTable.role, ["owner", "member"]), isNull(homesTable.archivedAt)))
    .orderBy(desc(homesTable.updatedAt));
  const out = [];
  for (const { h } of homes) {
    const p = await bookOf(h.id);
    let total = 0, month = 0, count = 0, budget: number | null = null;
    if (p) {
      const monthStart = new Date().toISOString().slice(0, 8) + "01";
      const rows = await db.select({ total: financeExpensesTable.total, date: financeExpensesTable.date }).from(financeExpensesTable)
        .where(and(eq(financeExpensesTable.projectId, p.id), eq(financeExpensesTable.status, "approved")));
      for (const r of rows) { total += toCents(r.total); if (r.date >= monthStart) month += toCents(r.total); }
      count = rows.length;
      const [v] = await db.select().from(financeBudgetVersionsTable).where(eq(financeBudgetVersionsTable.projectId, p.id)).orderBy(desc(financeBudgetVersionsTable.version)).limit(1);
      budget = v ? toCents(v.total) : null;
    }
    out.push({ homeId: h.id, homeName: h.name, location: h.address || h.city, projectId: p?.id ?? null, total, month, count, budget });
  }
  res.json({ aiConfigured: aiConfigured(), books: out });
});

const Create = z.object({
  name: z.string().trim().min(1).max(160),
  startDate: isoDate.nullable().optional(),
  location: z.string().trim().max(240).default(""),
  budget: z.union([z.string(), z.number(), z.null()]).optional(),
  currency: z.literal("AZN").default("AZN"),
});

/** New home + its expense book in one step ("Həyət evim", start date, place, budget — all but the name optional). */
router.post("/expense-books", async (req, res): Promise<void> => {
  const b = Create.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Evin adını yazın");
  const budget = b.data.budget == null || b.data.budget === "" ? null : parseAmount(b.data.budget);
  if (b.data.budget != null && b.data.budget !== "" && budget == null) return bad(res, "Büdcə məbləğini yoxlayın");
  const userId = uid(req);
  const r = await db.transaction(async (tx) => {
    let home;
    for (let i = 0; i < 5 && !home; i++) {
      [home] = await tx.insert(homesTable).values({ name: b.data.name, propertyType: "house", address: b.data.location, stage: "construction", publicId: newPublicId(10), createdByUserId: userId })
        .onConflictDoNothing({ target: homesTable.publicId }).returning();
    }
    if (!home) throw new Error("Could not allocate a public id");
    await tx.insert(homeMembersTable).values({ homeId: home.id, userId, role: "owner", addedByUserId: userId });
    const [p] = await tx.insert(homeProjectsTable).values({ homeId: home.id, name: "Xərclər", kind: "construction", startDate: b.data.startDate ?? null, currency: b.data.currency, createdByUserId: userId }).returning();
    if (budget) await tx.insert(financeBudgetVersionsTable).values({ projectId: p.id, version: 1, total: budget, reason: "initial", createdByUserId: userId });
    await audit({ homeId: home.id, actorUserId: userId, actorRole: "owner", action: "home.created", entityType: "home", entityId: home.id, summary: `${home.name} · xərc jurnalı${budget ? ` · büdcə ${budget} AZN` : ""}` }, tx);
    return { homeId: home.id, projectId: p.id };
  });
  res.status(201).json(r);
});

/** An existing home (created earlier from "Ev tarixçəsi") gets its book when its owner opens expenses. */
router.post("/homes/:homeId/expense-book", async (req, res): Promise<void> => {
  const homeId = String(req.params.homeId);
  if (!isUuid(homeId)) return notFound(res, "Ev tapılmadı");
  const userId = uid(req);
  const [m] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, homeId), eq(homeMembersTable.userId, userId)));
  if (!m) return notFound(res, "Ev tapılmadı");
  if (m.role !== "owner" && m.role !== "member") return forbidden(res);
  const existing = await bookOf(homeId);
  if (existing) return void res.json({ homeId, projectId: existing.id });
  const [p] = await db.insert(homeProjectsTable).values({ homeId, name: "Xərclər", kind: "construction", createdByUserId: userId }).returning();
  await audit({ homeId, actorUserId: userId, actorRole: m.role, action: "project.created", entityType: "project", entityId: p.id, summary: "Xərc jurnalı" });
  res.status(201).json({ homeId, projectId: p.id });
});

/** Change history of one expense (who, when, before / after, why). */
router.get("/home-projects/:projectId/expenses/:expenseId/history", async (req, res): Promise<void> => {
  noStore(res);
  const a = await getProjectAccess(uid(req), String(req.params.projectId));
  if (!a) return notFound(res, "Layihə tapılmadı");
  const id = String(req.params.expenseId);
  if (!isUuid(id)) return notFound(res, "Xərc tapılmadı");
  const [e] = await db.select().from(financeExpensesTable).where(and(eq(financeExpensesTable.id, id), eq(financeExpensesTable.projectId, a.project.id)));
  if (!e) return notFound(res, "Xərc tapılmadı");
  if (a.level === "party" && !a.myParties.some((p) => p.id === e.partyId || p.id === e.fundedByPartyId)) return notFound(res, "Xərc tapılmadı");
  const rows = await db.select().from(homeAuditTable).where(and(eq(homeAuditTable.homeId, a.home.id), eq(homeAuditTable.entityId, e.id))).orderBy(asc(homeAuditTable.createdAt));
  res.json(rows.map((r) => ({ at: r.createdAt.toISOString(), action: r.action, summary: r.summary, changes: r.changes, byMe: r.actorUserId === uid(req), actorRole: r.actorRole })));
});

/** Plan (linked AI estimate) vs actual by category, for the expense book of a home. */
router.get("/homes/:homeId/estimate-comparison", async (req, res): Promise<void> => {
  noStore(res);
  const homeId = String(req.params.homeId);
  if (!isUuid(homeId)) return notFound(res, "Ev tapılmadı");
  const [m] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, homeId), eq(homeMembersTable.userId, uid(req))));
  if (!m || (m.role !== "owner" && m.role !== "member")) return notFound(res, "Ev tapılmadı");
  res.json(await homeEstimateComparison(homeId));
});

export default router;
