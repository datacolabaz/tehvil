import { and, asc, desc, eq } from "drizzle-orm";
import { aiEstimatesTable, db, financeExpensesTable, homeProjectsTable } from "@workspace/db";
import { computeEstimate, DEFAULT_SETTINGS, type Category, type EstimateDoc } from "./estimateEngine";
import { EXPENSE_CATEGORIES, toCents } from "./financeCore";

/** Estimate category → "Evimin xərcləri" category for the plan / actual comparison. */
export const TO_EXPENSE: Record<Category, string> = { concrete: "concrete", rebar: "rebar_metal", formwork: "timber_formwork", timber: "timber_formwork", other: "building_materials" };
/** Older expense categories folded into the new ones for comparison. */
const LEGACY: Record<string, string> = { concrete_rebar: "concrete", material: "building_materials", appliances: "building_materials", contractor: "labor", transport: "machinery_transport", machinery: "machinery_transport" };

export async function comparisonFor(homeId: string, planned: Map<string, number>) {
  const [p] = await db.select().from(homeProjectsTable).where(eq(homeProjectsTable.homeId, homeId)).orderBy(asc(homeProjectsTable.createdAt)).limit(1);
  const actual = new Map<string, number>();
  if (p) {
    const rows = await db.select({ category: financeExpensesTable.category, total: financeExpensesTable.total }).from(financeExpensesTable).where(and(eq(financeExpensesTable.projectId, p.id), eq(financeExpensesTable.status, "approved")));
    for (const r of rows) { const c = LEGACY[r.category] ?? r.category; actual.set(c, (actual.get(c) ?? 0) + toCents(r.total)); }
  }
  const keys = [...new Set([...planned.keys(), ...actual.keys()])];
  return keys.map((k) => ({ category: k, label: EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES]?.label ?? k, planned: planned.get(k) ?? 0, actual: actual.get(k) ?? 0, diff: (actual.get(k) ?? 0) - (planned.get(k) ?? 0) }))
    .sort((a, b) => b.planned - a.planned || b.actual - a.actual);
}

export function plannedByCategory(doc: EstimateDoc) {
  const r = computeEstimate(doc);
  const planned = new Map<string, number>();
  for (const i of r.items) if (i.amount != null) planned.set(TO_EXPENSE[i.category], (planned.get(TO_EXPENSE[i.category]) ?? 0) + Math.round(i.amount * 100));
  return { planned, result: r };
}

/** The most recently updated AI estimate linked to this home, compared with its expense book. */
export async function homeEstimateComparison(homeId: string) {
  const [e] = await db.select().from(aiEstimatesTable).where(eq(aiEstimatesTable.homeId, homeId)).orderBy(desc(aiEstimatesTable.updatedAt)).limit(1);
  if (!e) return null;
  const d = e.doc as unknown as EstimateDoc;
  const doc: EstimateDoc = { ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), plywood: { ...DEFAULT_SETTINGS.plywood, ...(d.settings?.plywood ?? {}) } }, elements: d.elements ?? [], manual: d.manual ?? [], prices: d.prices ?? {}, overrides: d.overrides ?? {}, removed: d.removed ?? [], norms: d.norms ?? {} };
  const { planned, result } = plannedByCategory(doc);
  return { estimateId: e.id, name: e.name, unpriced: result.totals.unpricedLines, rows: await comparisonFor(homeId, planned) };
}
