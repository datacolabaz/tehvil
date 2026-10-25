import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  financeBudgetVersionsTable,
  financeChangeOrdersTable,
  financeExpenseItemsTable,
  financeExpensesTable,
  financeInvoicesTable,
  financePartiesTable,
  financePaymentsTable,
  homeMembersTable,
  homeProjectsTable,
  homesTable,
  type FinanceBudgetVersionRow,
  type FinanceChangeOrderRow,
  type FinanceExpenseItemRow,
  type FinanceExpenseRow,
  type FinancePartyRow,
  type FinancePaymentRow,
  type HomeProjectRow,
} from "@workspace/db";
import { isUuid, normalizeMemberRole } from "./homeAccess";

/* ------------------------------------------------------------------ money */

/** Money is handled in integer qəpik (1 AZN = 100). Never floats in sums. */
export type Cents = number;
export function toCents(v: string | number | null | undefined): Cents {
  if (v == null || v === "") return 0;
  const s = typeof v === "number" ? v.toFixed(2) : String(v).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount: ${s}`);
  const neg = s.startsWith("-");
  const [int, frac = ""] = s.replace("-", "").split(".");
  // Round half up on the third decimal.
  const f = (frac + "000").slice(0, 3);
  let cents = Number(int) * 100 + Number(f.slice(0, 2));
  if (Number(f[2]) >= 5) cents += 1;
  return neg ? -cents : cents;
}
export const fromCents = (c: Cents) => {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};
/** Parses user / AI input ("1 250,50", "1250.5") into a non-negative amount string or null. */
export function parseAmount(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).replace(/\s|AZN|₼/gi, "").replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(s)) return null;
  return fromCents(toCents(s));
}
export function parseQty(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,11}(\.\d{1,3})?$/.test(s)) return null;
  return s;
}
const qtyMilli = (s: string) => Math.round(Number(s) * 1000);
/** quantity × unit price in cents (quantity has up to 3 decimals). */
export const lineCents = (quantity: string, unitPrice: string) => Math.round((qtyMilli(quantity) * toCents(unitPrice)) / 1000);

/* ------------------------------------------------------------- categories */

export const EXPENSE_CATEGORIES = {
  concrete: { label: "Beton və sement", group: "material", legacy: false },
  rebar_metal: { label: "Armatur və metal", group: "material", legacy: false },
  timber_formwork: { label: "Taxta və qəlib", group: "material", legacy: false },
  electrical: { label: "Elektrik materialları", group: "material", legacy: false },
  plumbing: { label: "Santexnika materialları", group: "material", legacy: false },
  building_materials: { label: "Digər materiallar", group: "material", legacy: false },
  labor: { label: "Usta və fəhlə haqqı", group: "labor", legacy: false },
  machinery_transport: { label: "Texnika və nəqliyyat", group: "other", legacy: false },
  other_work: { label: "Digər işlər", group: "labor", legacy: false },
  design: { label: "Layihələndirmə və mühəndislik", group: "other", legacy: false },
  other: { label: "Digər xərclər", group: "other", legacy: false },
  // Earlier keys (October 2026 finance module): still valid on old records, no longer offered.
  material: { label: "Material alışı", group: "material", legacy: true },
  concrete_rebar: { label: "Beton və armatur", group: "material", legacy: true },
  contractor: { label: "Podratçı ilə hesablaşmalar", group: "labor", legacy: true },
  transport: { label: "Nəqliyyat və daşınma", group: "other", legacy: true },
  meals: { label: "Yemək və digər işçi xərcləri", group: "other", legacy: true },
  tool_rental: { label: "Alət və avadanlıq kirayəsi", group: "other", legacy: true },
  machinery: { label: "Beton pompası və xüsusi texnika", group: "other", legacy: true },
  utilities: { label: "Kommunal xərclər", group: "other", legacy: true },
  cleaning: { label: "Təmizlik və məişət xərcləri", group: "other", legacy: true },
  permits: { label: "İcazə və digər sənədlər", group: "other", legacy: true },
  appliances: { label: "Avadanlıqlar", group: "material", legacy: true },
} as const;
export const ACTIVE_CATEGORIES = Object.entries(EXPENSE_CATEGORIES).filter(([, v]) => !v.legacy).map(([k]) => k);
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
export const isCategory = (v: unknown): v is ExpenseCategory => typeof v === "string" && v in EXPENSE_CATEGORIES;
export const PARTY_ROLES = ["contractor", "worker", "supplier", "other"] as const;
export const PAYMENT_METHODS = ["cash", "card", "transfer", "other", ""] as const;

/* ----------------------------------------------------------------- access */

/**
 * manage      owner / member of the home: everything
 * contractor  account linked to a contractor party of this project: sees the whole project finance,
 *             submits expenses (pending until the owner approves), invoices and change orders,
 *             confirms or disputes payments made to them; never approves
 * party       account linked to another party (tradesperson): sees only its own account
 */
export type FinanceLevel = "manage" | "contractor" | "party";
export interface ProjectAccess {
  project: HomeProjectRow;
  home: typeof homesTable.$inferSelect;
  level: FinanceLevel;
  /** Parties of this project linked to the caller. */
  myParties: FinancePartyRow[];
  memberRole: string | null;
}

export async function homeFinanceLevel(userId: string, homeId: string): Promise<"manage" | null> {
  if (!isUuid(homeId)) return null;
  const [m] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, homeId), eq(homeMembersTable.userId, userId)));
  const role = normalizeMemberRole(m?.role);
  return role === "owner" || role === "member" ? "manage" : null;
}

/** Null when the caller has nothing to do with this project (routes answer 404). */
export async function getProjectAccess(userId: string, projectId: string): Promise<ProjectAccess | null> {
  if (!isUuid(projectId)) return null;
  const [project] = await db.select().from(homeProjectsTable).where(eq(homeProjectsTable.id, projectId));
  if (!project) return null;
  const [home] = await db.select().from(homesTable).where(eq(homesTable.id, project.homeId));
  if (!home) return null;
  const [m] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, home.id), eq(homeMembersTable.userId, userId)));
  const memberRole = normalizeMemberRole(m?.role);
  if (home.archivedAt && memberRole !== "owner") return null;
  const myParties = await db.select().from(financePartiesTable).where(and(
    eq(financePartiesTable.projectId, projectId), eq(financePartiesTable.userId, userId), isNull(financePartiesTable.archivedAt)));
  if (memberRole === "owner" || memberRole === "member") return { project, home, level: "manage", myParties, memberRole };
  if (myParties.some((p) => p.role === "contractor")) return { project, home, level: "contractor", myParties, memberRole };
  if (myParties.length) return { project, home, level: "party", myParties, memberRole };
  return null;
}

/* --------------------------------------------------------------- loading */

export interface ProjectData {
  project: HomeProjectRow;
  parties: FinancePartyRow[];
  budget: FinanceBudgetVersionRow[];
  changeOrders: FinanceChangeOrderRow[];
  expenses: FinanceExpenseRow[];
  items: FinanceExpenseItemRow[];
  payments: FinancePaymentRow[];
  invoices: (typeof financeInvoicesTable.$inferSelect)[];
}

export async function loadProjectData(project: HomeProjectRow): Promise<ProjectData> {
  const pid = project.id;
  const [parties, budget, changeOrders, expenses, payments, invoices] = await Promise.all([
    db.select().from(financePartiesTable).where(eq(financePartiesTable.projectId, pid)).orderBy(asc(financePartiesTable.createdAt)),
    db.select().from(financeBudgetVersionsTable).where(eq(financeBudgetVersionsTable.projectId, pid)).orderBy(asc(financeBudgetVersionsTable.version)),
    db.select().from(financeChangeOrdersTable).where(eq(financeChangeOrdersTable.projectId, pid)).orderBy(asc(financeChangeOrdersTable.number)),
    db.select().from(financeExpensesTable).where(eq(financeExpensesTable.projectId, pid)).orderBy(asc(financeExpensesTable.date), asc(financeExpensesTable.createdAt)),
    db.select().from(financePaymentsTable).where(eq(financePaymentsTable.projectId, pid)).orderBy(asc(financePaymentsTable.date), asc(financePaymentsTable.createdAt)),
    db.select().from(financeInvoicesTable).where(eq(financeInvoicesTable.projectId, pid)).orderBy(asc(financeInvoicesTable.createdAt)),
  ]);
  const items = expenses.length
    ? await db.select().from(financeExpenseItemsTable).where(inArray(financeExpenseItemsTable.expenseId, expenses.map((e) => e.id))).orderBy(asc(financeExpenseItemsTable.position))
    : [];
  return { project, parties, budget, changeOrders, expenses, items, payments, invoices };
}

/* ------------------------------------------------------------ the ledger */

/** Payments that count as money moved: recorded by someone or confirmed by the other side. Disputed / cancelled do not. */
export const paymentCounts = (p: FinancePaymentRow) => p.status === "recorded" || p.status === "confirmed";

export interface PartyBalance {
  partyId: string;
  name: string;
  role: string;
  basis: "contract" | "invoices";
  contract: Cents;
  approvedChangeOrders: Cents;
  invoicedExpenses: Cents;
  obligation: Cents;
  paid: Cents;
  advanceGiven: Cents;
  advanceSpent: Cents;
  advanceBalance: Cents;
  refunds: Cents;
  credited: Cents;
  remaining: Cents;
  status: "none" | "unpaid" | "partial" | "paid" | "overpaid" | "disputed";
  disputedPayments: number;
}

export interface ExpensePayState { paid: Cents; status: "unpaid" | "partial" | "paid" | "advance" | "n/a" }

/** Arithmetic check of an expense: lines vs subtotal, subtotal − discount + tax vs total. Returns problems, never fixes them. */
export function expenseMismatch(e: Pick<FinanceExpenseRow, "subtotal" | "discount" | "tax" | "total">, items: Pick<FinanceExpenseItemRow, "lineTotal" | "quantity" | "unitPrice" | "name">[]) {
  const problems: string[] = [];
  if (items.length) {
    const sum = items.reduce((s, i) => s + toCents(i.lineTotal), 0);
    if (sum !== toCents(e.subtotal)) problems.push(`Sətirlərin cəmi ${money(sum)}, ara cəm isə ${money(toCents(e.subtotal))}`);
    for (const i of items) {
      if (i.quantity && i.unitPrice) {
        const calc = lineCents(i.quantity, i.unitPrice);
        if (Math.abs(calc - toCents(i.lineTotal)) > 1) problems.push(`"${i.name}": ${i.quantity} × ${i.unitPrice} = ${money(calc)}, sənəddə ${money(toCents(i.lineTotal))}`);
      }
    }
  }
  const expected = toCents(e.subtotal) - toCents(e.discount) + toCents(e.tax);
  if (expected !== toCents(e.total)) problems.push(`Ara cəm − endirim + vergi = ${money(expected)}, yekun isə ${money(toCents(e.total))}`);
  return problems;
}

/**
 * How an expense splits across categories: each line in its own category (or the expense's), and whatever
 * the lines do not cover (discount, tax, or an expense without lines) in the expense's category.
 * The slices always add up to the expense total, so nothing is counted twice or lost.
 */
export function expenseSlices(e: Pick<FinanceExpenseRow, "category" | "total">, items: Pick<FinanceExpenseItemRow, "category" | "lineTotal">[]): { category: string; cents: Cents }[] {
  const total = toCents(e.total);
  if (!items.length) return [{ category: e.category, cents: total }];
  const by = new Map<string, Cents>();
  let covered = 0;
  for (const i of items) {
    const c = i.category && isCategory(i.category) ? i.category : e.category;
    const v = toCents(i.lineTotal);
    by.set(c, (by.get(c) ?? 0) + v); covered += v;
  }
  if (total !== covered) by.set(e.category, (by.get(e.category) ?? 0) + total - covered);
  return [...by.entries()].filter(([, v]) => v !== 0).map(([category, cents]) => ({ category, cents }));
}

export function computeLedger(d: ProjectData) {
  const approved = d.expenses.filter((e) => e.status === "approved");
  const pending = d.expenses.filter((e) => e.status === "pending");
  const disputed = d.expenses.filter((e) => e.status === "disputed");
  const sum = (rows: { total: string }[]) => rows.reduce((s, r) => s + toCents(r.total), 0);
  const itemsBy = new Map<string, FinanceExpenseItemRow[]>();
  for (const i of d.items) itemsBy.set(i.expenseId, [...(itemsBy.get(i.expenseId) ?? []), i]);
  // Category and material / labour totals follow the lines, so one receipt with cement and a worker's fee splits correctly.
  const catTotals = new Map<string, { total: Cents; ids: Set<string> }>();
  for (const e of approved) for (const sl of expenseSlices(e, itemsBy.get(e.id) ?? [])) {
    const r = catTotals.get(sl.category) ?? { total: 0, ids: new Set<string>() };
    r.total += sl.cents; r.ids.add(e.id); catTotals.set(sl.category, r);
  }
  const groupSum = (g: string) => [...catTotals.entries()].filter(([c]) => (EXPENSE_CATEGORIES[c as ExpenseCategory]?.group ?? "other") === g).reduce((s, [, r]) => s + r.total, 0);
  const byCategory = Object.keys(EXPENSE_CATEGORIES).filter((c) => catTotals.has(c)).map((c) => {
    const r = catTotals.get(c)!;
    return { category: c, label: EXPENSE_CATEGORIES[c as ExpenseCategory].label, total: r.total, count: r.ids.size };
  });

  const counting = d.payments.filter(paymentCounts);
  const approvedCOs = d.changeOrders.filter((c) => c.status === "approved");
  const parties: PartyBalance[] = d.parties.map((p) => {
    const contract = p.contractAmount != null ? toCents(p.contractAmount) : 0;
    const basis = p.contractAmount != null ? "contract" : "invoices";
    const co = approvedCOs.filter((c) => c.partyId === p.id).reduce((s, c) => s + toCents(c.amount), 0);
    // A purchase paid out of someone's advance is not owed to the shop by the owner.
    const invoiced = basis === "invoices" ? approved.filter((e) => e.partyId === p.id && !e.fundedByPartyId).reduce((s, e) => s + toCents(e.total), 0) : 0;
    const obligation = contract + co + invoiced;
    const mine = counting.filter((x) => x.partyId === p.id);
    const paid = mine.filter((x) => x.kind === "payment" || x.kind === "advance").reduce((s, x) => s + toCents(x.amount), 0);
    const advanceGiven = mine.filter((x) => x.kind === "advance").reduce((s, x) => s + toCents(x.amount), 0);
    const refunds = mine.filter((x) => x.kind === "refund").reduce((s, x) => s + toCents(x.amount), 0);
    const advanceSpent = approved.filter((e) => e.fundedByPartyId === p.id).reduce((s, e) => s + toCents(e.total), 0);
    // Money of the owner this party used for third-party purchases is not a payment for the party's own work.
    const credited = paid - refunds - advanceSpent;
    const remaining = obligation - credited;
    const disputedPayments = d.payments.filter((x) => x.partyId === p.id && x.status === "disputed").length;
    let status: PartyBalance["status"] = "none";
    if (disputedPayments) status = "disputed";
    else if (obligation === 0 && credited === 0) status = "none";
    else if (remaining < 0) status = "overpaid";
    else if (remaining === 0) status = "paid";
    else if (credited > 0) status = "partial";
    else status = "unpaid";
    return {
      partyId: p.id, name: p.name, role: p.role, basis, contract, approvedChangeOrders: co, invoicedExpenses: invoiced, obligation,
      paid, advanceGiven, advanceSpent, advanceBalance: advanceGiven - advanceSpent, refunds, credited, remaining, status, disputedPayments,
    };
  });

  const payState = new Map<string, ExpensePayState>();
  for (const e of d.expenses) {
    if (e.fundedByPartyId) { payState.set(e.id, { paid: toCents(e.total), status: "advance" }); continue; }
    const paid = counting.filter((x) => x.expenseId === e.id && x.kind === "payment").reduce((s, x) => s + toCents(x.amount), 0);
    const total = toCents(e.total);
    payState.set(e.id, { paid, status: paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial" });
  }
  // Unpaid purchases from shops that are not a party of the project.
  const looseUnpaid = approved.filter((e) => !e.partyId && !e.fundedByPartyId)
    .reduce((s, e) => s + Math.max(0, toCents(e.total) - (payState.get(e.id)?.paid ?? 0)), 0);

  const roleSum = (role: string, f: (b: PartyBalance) => number) => parties.filter((b) => b.role === role).reduce((s, b) => s + f(b), 0);
  const budgetInitial = d.budget.length ? toCents(d.budget[0].total) : null;
  // A budget taken away ("removed" version) means: no budget now — nothing is compared against it.
  const lastBudget = d.budget[d.budget.length - 1];
  const budgetCurrent = lastBudget && lastBudget.reason !== "removed" ? toCents(lastBudget.total) : null;
  const actual = sum(approved);
  const unpaidLooseCount = approved.filter((e) => !e.partyId && !e.fundedByPartyId && payState.get(e.id)?.status !== "paid").length;

  const totals = {
    budgetInitial,
    budgetCurrent,
    actual,
    material: groupSum("material"),
    labor: groupSum("labor"),
    other: groupSum("other"),
    paidToContractors: roleSum("contractor", (b) => b.credited),
    remainingToContractors: roleSum("contractor", (b) => Math.max(0, b.remaining)),
    paidToSuppliers: roleSum("supplier", (b) => b.credited) + counting.filter((x) => !x.partyId && x.kind === "payment").reduce((s, x) => s + toCents(x.amount), 0),
    supplierDebt: roleSum("supplier", (b) => Math.max(0, b.remaining)) + looseUnpaid,
    paidToWorkers: roleSum("worker", (b) => b.credited) + roleSum("other", (b) => b.credited),
    remainingToWorkers: roleSum("worker", (b) => Math.max(0, b.remaining)) + roleSum("other", (b) => Math.max(0, b.remaining)),
    advanceBalance: parties.reduce((s, b) => s + b.advanceBalance, 0),
    pending: sum(pending),
    pendingCount: pending.length,
    disputed: sum(disputed),
    disputedCount: disputed.length + d.payments.filter((x) => x.status === "disputed").length,
    budgetDiff: budgetCurrent == null ? null : budgetCurrent - actual,
    budgetUsedPct: budgetCurrent ? Math.round((actual / budgetCurrent) * 1000) / 10 : null,
    ownerOutflow: counting.filter((x) => x.kind !== "refund").reduce((s, x) => s + toCents(x.amount), 0) - counting.filter((x) => x.kind === "refund").reduce((s, x) => s + toCents(x.amount), 0),
    approvedChangeOrders: approvedCOs.reduce((s, c) => s + toCents(c.amount), 0),
    proposedChangeOrders: d.changeOrders.filter((c) => c.status === "proposed" || c.status === "clarification").reduce((s, c) => s + toCents(c.amount), 0),
    proposedChangeOrderCount: d.changeOrders.filter((c) => c.status === "proposed" || c.status === "clarification").length,
    unpaidLooseCount,
  };
  return { totals, parties, byCategory, payState };
}

export type Ledger = ReturnType<typeof computeLedger>;

/** How each figure is calculated — shown when the person opens a figure. */
export const FORMULAS: Record<string, string> = {
  budgetInitial: "Layihə yaradılarkən daxil edilən büdcə (versiya 1).",
  budgetCurrent: "Son büdcə versiyası: ilkin büdcə + təsdiqlənmiş əlavə işlər. Təsdiqlənməmiş təkliflər daxil deyil.",
  actual: "Təsdiqlənmiş xərc qeydlərinin yekun məbləğləri. Ödənişlər və avanslar bura daxil deyil.",
  material: "Təsdiqlənmiş xərclər: beton, armatur, taxta, tikinti materialları, elektrik, santexnika.",
  labor: "Təsdiqlənmiş xərclər: usta və fəhlə ödənişləri.",
  other: "Qalan kateqoriyalar üzrə təsdiqlənmiş xərclər.",
  paidToContractors: "Podratçılara ödəniş + avans − geri qaytarılan − avansdan alınmış materiallar. Mübahisəli və ləğv edilmiş ödənişlər daxil deyil.",
  remainingToContractors: "Müqavilə + təsdiqlənmiş əlavə işlər − podratçıya hesablanan ödəniş.",
  paidToSuppliers: "Təchizatçılara və tərəf olmayan mağazalara edilmiş ödənişlər.",
  supplierDebt: "Təchizatçıların təsdiqlənmiş qaimələri − onlara ödənişlər; avansdan ödənmiş alışlar daxil deyil.",
  advanceBalance: "Verilmiş avanslar − həmin avansdan ödənmiş təsdiqlənmiş xərclər.",
  pending: "Hələ təsdiqlənməmiş xərc qeydləri. Yekun hesablara daxil deyil.",
  disputed: "Mübahisəli xərclər və ödənişlər. Yekun hesablara daxil deyil.",
  budgetDiff: "Son büdcə − faktiki xərc. Mənfi olarsa, büdcə aşılıb.",
};

/* -------------------------------------------------------------- warnings */

/** "1 250,00 AZN" and "21.10.2026" in texts people read. */
export const money = (c: Cents) => {
  const a = Math.abs(c);
  return `${c < 0 ? "−" : ""}${String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")},${String(a % 100).padStart(2, "0")} AZN`;
};
export const azDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function financeWarnings(d: ProjectData, ledger: Ledger) {
  const out: { kind: string; text: string; refType?: string; refId?: string }[] = [];
  const t = ledger.totals;
  if (t.budgetCurrent != null && t.actual > t.budgetCurrent) out.push({ kind: "budget_exceeded", text: `Faktiki xərc büdcəni ${money(t.actual - t.budgetCurrent)} aşıb.` });
  for (const c of d.changeOrders.filter((x) => x.status === "proposed" || x.status === "clarification")) {
    out.push({ kind: "change_order_pending", text: `Əlavə iş №${c.number} "${c.title}" (${money(toCents(c.amount))}) qərar gözləyir.`, refType: "change_order", refId: c.id });
  }
  for (const p of d.payments.filter((x) => paymentCounts(x) && !x.proofMediaId && toCents(x.amount) >= 50000)) {
    out.push({ kind: "payment_no_proof", text: `${azDate(p.date)} tarixli ${money(toCents(p.amount))} ödənişin sübut faylı yoxdur.`, refType: "payment", refId: p.id });
  }
  for (const b of ledger.parties.filter((x) => x.advanceSpent > x.advanceGiven && x.advanceGiven > 0)) {
    out.push({ kind: "advance_overspent", text: `${b.name}: avansdan xərclər (${money(b.advanceSpent)}) verilən avansdan (${money(b.advanceGiven)}) çoxdur.`, refType: "party", refId: b.partyId });
  }
  for (const b of ledger.parties.filter((x) => x.status === "overpaid")) {
    out.push({ kind: "overpaid", text: `${b.name}: hesablanan ödəniş öhdəlikdən ${money(-b.remaining)} çoxdur.`, refType: "party", refId: b.partyId });
  }
  const itemsBy = new Map<string, FinanceExpenseItemRow[]>();
  for (const i of d.items) itemsBy.set(i.expenseId, [...(itemsBy.get(i.expenseId) ?? []), i]);
  for (const e of d.expenses.filter((x) => x.status !== "void")) {
    const problems = expenseMismatch(e, itemsBy.get(e.id) ?? []);
    if (problems.length) out.push({ kind: "amount_mismatch", text: `${azDate(e.date)} "${e.description}": ${problems[0]}`, refType: "expense", refId: e.id });
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const e of d.expenses.filter((x) => x.status !== "void" && x.date > todayIso)) {
    out.push({ kind: "future_date", text: `"${e.description}" xərcinin tarixi (${azDate(e.date)}) gələcəkdədir.`, refType: "expense", refId: e.id });
  }
  // Unusual unit prices: the same material bought at a price far from its usual price in this project.
  const prices = new Map<string, { price: number; expenseId: string; name: string; unit: string }[]>();
  const live = new Set(d.expenses.filter((e) => e.status === "approved" || e.status === "pending").map((e) => e.id));
  for (const i of d.items) {
    if (!live.has(i.expenseId) || !i.unitPrice) continue;
    const key = `${norm(i.name)}|${i.unit}`;
    prices.set(key, [...(prices.get(key) ?? []), { price: toCents(i.unitPrice), expenseId: i.expenseId, name: i.name, unit: i.unit }]);
  }
  for (const list of prices.values()) {
    if (list.length < 3) continue;
    const sorted = [...list].map((x) => x.price).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const x of list) {
      if (median > 0 && (x.price > median * 1.5 || x.price < median * 0.5)) {
        out.push({ kind: "unusual_price", text: `"${x.name}" vahid qiyməti ${money(x.price)} — bu layihədə adi qiymət təxminən ${money(median)}${x.unit ? `/${x.unit}` : ""}. Yoxlayın.`, refType: "expense", refId: x.expenseId });
      }
    }
  }
  return out;
}

/** Possible duplicates of an invoice / expense: same file, or same number + vendor, or same vendor + date + total. Never merged automatically. */
export function duplicateCandidates(d: ProjectData, x: { invoiceId?: string | null; sha256?: string; docNumber?: string; vendor?: string; date?: string | null; total?: Cents | null }) {
  const out: { type: "invoice" | "expense"; id: string; reason: string }[] = [];
  for (const inv of d.invoices) {
    if (inv.id === x.invoiceId || inv.status === "discarded") continue;
    if (x.sha256 && inv.sha256 && inv.sha256 === x.sha256) out.push({ type: "invoice", id: inv.id, reason: "Eyni fayl artıq yüklənib" });
    else if (x.docNumber && inv.docNumber && norm(inv.docNumber) === norm(x.docNumber) && x.vendor && norm(inv.vendor) === norm(x.vendor)) out.push({ type: "invoice", id: inv.id, reason: "Eyni satıcı və sənəd nömrəsi" });
  }
  if (x.total != null && x.date) {
    for (const e of d.expenses) {
      if (e.status === "void" || (x.invoiceId && e.invoiceId === x.invoiceId)) continue;
      const vendorSame = x.vendor && norm(e.vendorName) === norm(x.vendor);
      if (vendorSame && e.date === x.date && toCents(e.total) === x.total) out.push({ type: "expense", id: e.id, reason: "Eyni satıcı, tarix və məbləğ" });
    }
  }
  return out;
}
