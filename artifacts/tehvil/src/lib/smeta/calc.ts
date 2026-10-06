import type { ChangeOrder, Estimate, EstimateLineItem, EstimateSection, Expense, Project, ProjectCost, WorkCategory } from './types';

/** All money is kept in AZN rounded to qəpik (2 decimals) at every derived step. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineTotals {
  materialTotal: number;
  laborTotal: number;
  additionalCost: number;
  rowSubtotal: number;
  wasteAmount: number;
  marginPercentage: number;
  marginAmount: number;
  rowTotal: number;
}

/**
 * materialTotal = quantity × materialUnitPrice
 * laborTotal    = quantity × laborUnitPrice
 * rowSubtotal   = materialTotal + laborTotal + additionalCost
 * wasteAmount   = materialTotal × wastePercentage
 * marginAmount  = (rowSubtotal + wasteAmount) × marginPercentage
 * rowTotal      = rowSubtotal + wasteAmount + marginAmount
 */
export function lineTotals(item: EstimateLineItem, defaultMargin: number): LineTotals {
  const materialTotal = round2(item.quantity * item.materialUnitPrice);
  const laborTotal = round2(item.quantity * item.laborUnitPrice);
  const additionalCost = round2(item.additionalCost);
  const rowSubtotal = round2(materialTotal + laborTotal + additionalCost);
  const wasteAmount = round2(materialTotal * item.wastePercentage);
  const marginPercentage = item.marginPercentage ?? defaultMargin;
  const marginAmount = round2((rowSubtotal + wasteAmount) * marginPercentage);
  const rowTotal = round2(rowSubtotal + wasteAmount + marginAmount);
  return { materialTotal, laborTotal, additionalCost, rowSubtotal, wasteAmount, marginPercentage, marginAmount, rowTotal };
}

export interface AggregateTotals {
  material: number;
  labor: number;
  additional: number;
  waste: number;
  margin: number;
  rowsTotal: number;
}

const emptyAgg = (): AggregateTotals => ({ material: 0, labor: 0, additional: 0, waste: 0, margin: 0, rowsTotal: 0 });

function addLine(acc: AggregateTotals, l: LineTotals): AggregateTotals {
  return {
    material: round2(acc.material + l.materialTotal),
    labor: round2(acc.labor + l.laborTotal),
    additional: round2(acc.additional + l.additionalCost),
    waste: round2(acc.waste + l.wasteAmount),
    margin: round2(acc.margin + l.marginAmount),
    rowsTotal: round2(acc.rowsTotal + l.rowTotal),
  };
}

export function sectionTotals(section: EstimateSection, defaultMargin: number): AggregateTotals {
  return section.items.reduce((acc, it) => addLine(acc, lineTotals(it, defaultMargin)), emptyAgg());
}

export interface EstimateTotals extends AggregateTotals {
  projectCosts: number;
  /** estimateTotal = sum(all row totals) + project-level additional costs */
  total: number;
}

export function estimateTotals(estimate: Estimate, projectCosts: ProjectCost[], defaultMargin: number): EstimateTotals {
  const agg = estimate.sections.reduce((acc, s) => s.items.reduce((a, it) => addLine(a, lineTotals(it, defaultMargin)), acc), emptyAgg());
  const pc = round2(projectCosts.reduce((s, c) => s + c.amount, 0));
  return { ...agg, projectCosts: pc, total: round2(agg.rowsTotal + pc) };
}

export const projectTotals = (p: Project) => estimateTotals(p.estimate, p.projectCosts, p.defaultMarginPercentage);

export const changeImpact = (c: Pick<ChangeOrder, 'materialDelta' | 'laborDelta' | 'additionalCost'>) => round2(c.materialDelta + c.laborDelta + c.additionalCost);

export function changeTotals(changes: ChangeOrder[]) {
  const sum = (status: ChangeOrder['status']) => round2(changes.filter(c => c.status === status).reduce((s, c) => s + changeImpact(c), 0));
  return { approved: sum('approved'), pending: sum('pending'), draft: sum('draft'), pendingCount: changes.filter(c => c.status === 'pending').length };
}

export const sumExpenses = (expenses: Expense[], kind?: Expense['kind']) => round2(expenses.filter(e => !kind || e.kind === kind).reduce((s, e) => s + e.amount, 0));

export type BudgetHealth = 'healthy' | 'watch' | 'risk';

export interface BudgetSummary {
  plannedBudget: number;
  approvedChanges: number;
  /** Plan + approved change orders: what the client has agreed to pay. */
  agreedBudget: number;
  actualSpending: number;
  remainingBudget: number;
  /** budgetVariance = actualSpending − plannedBudget */
  budgetVariance: number;
  committedRemainingCost: number;
  /** forecastFinalCost = actualSpending + committedRemainingCost */
  forecastFinalCost: number;
  completion: number;
  health: BudgetHealth;
  /** Categories where actual material purchases exceed the planned material amount (incl. waste reserve). */
  overspentCategories: { category: WorkCategory; planned: number; actual: number; ratio: number }[];
}

/** Planned vs actual material spending per work category. */
export function materialByCategory(p: Project) {
  const planned = new Map<WorkCategory, number>();
  for (const s of p.estimate.sections) {
    const t = sectionTotals(s, p.defaultMarginPercentage);
    planned.set(s.category, round2((planned.get(s.category) ?? 0) + t.material + t.waste));
  }
  const actual = new Map<WorkCategory, number>();
  for (const e of p.expenses) if (e.kind === 'material') actual.set(e.category, round2((actual.get(e.category) ?? 0) + e.amount));
  return { planned, actual };
}

export function budgetSummary(p: Project): BudgetSummary {
  const totals = projectTotals(p);
  const changes = changeTotals(p.changeOrders);
  const plannedBudget = totals.total;
  const agreedBudget = round2(plannedBudget + changes.approved);
  const actualSpending = sumExpenses(p.expenses);
  const completion = Math.min(100, Math.max(0, p.completion)) / 100;
  // Work not yet performed is still owed at its agreed price.
  const committedRemainingCost = round2(Math.max(0, agreedBudget * (1 - completion)));
  const forecastFinalCost = round2(actualSpending + committedRemainingCost);
  const { planned, actual } = materialByCategory(p);
  const overspentCategories = [...actual.entries()]
    .map(([category, a]) => ({ category, planned: planned.get(category) ?? 0, actual: a, ratio: (planned.get(category) ?? 0) > 0 ? a / (planned.get(category) ?? 1) - 1 : 1 }))
    .filter(c => c.ratio > 0.03)
    .sort((a, b) => b.ratio - a.ratio);
  const overrun = forecastFinalCost / (agreedBudget || 1) - 1;
  const health: BudgetHealth = overrun > 0.02 ? 'risk' : overrun > 0 || overspentCategories.length ? 'watch' : 'healthy';
  return {
    plannedBudget,
    approvedChanges: changes.approved,
    agreedBudget,
    actualSpending,
    remainingBudget: round2(plannedBudget - actualSpending),
    budgetVariance: round2(actualSpending - plannedBudget),
    committedRemainingCost,
    forecastFinalCost,
    completion: p.completion,
    health,
    overspentCategories,
  };
}

/** Spend split used by the "Xərclər" tab: planned vs actual for material and labor. */
export function planVsActual(p: Project) {
  const t = projectTotals(p);
  const plannedMaterial = round2(t.material + t.waste);
  const plannedLabor = t.labor;
  const actualMaterial = sumExpenses(p.expenses, 'material');
  const actualLabor = sumExpenses(p.expenses, 'labor');
  const actualOther = sumExpenses(p.expenses, 'other');
  return {
    plannedMaterial, actualMaterial, materialVariance: round2(actualMaterial - plannedMaterial),
    plannedLabor, actualLabor, laborVariance: round2(actualLabor - plannedLabor),
    plannedOther: round2(t.additional + t.margin + t.projectCosts), actualOther,
  };
}

/** Total the client sees as the final price: approved estimate + approved changes. */
export function clientFinalTotal(estimateTotal: number, changes: ChangeOrder[]) {
  return round2(estimateTotal + changeTotals(changes).approved);
}

export function allItems(estimate: Estimate): EstimateLineItem[] {
  return estimate.sections.flatMap(s => s.items);
}

/** Quantity derived from linked measurements; manual quantities are never overwritten. */
export function quantityFromMeasurements(item: EstimateLineItem, values: Map<string, number>): number | null {
  const ids = item.quantitySource.measurementIds;
  if (item.quantitySource.kind === 'manual' || !ids?.length) return null;
  if (ids.some(id => !values.has(id))) return null;
  return round2(ids.reduce((s, id) => s + (values.get(id) ?? 0), 0) * (item.quantitySource.factor ?? 1));
}
