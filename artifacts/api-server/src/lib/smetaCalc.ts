import type {
  SharedEstimateSnapshot,
  SmetaEstimate,
  SmetaLineItem,
  SmetaProjectCost,
} from "@workspace/api-zod";

// Must stay identical to artifacts/tehvil/src/lib/smeta/calc.ts (`lineTotals`),
// otherwise the client link and the contractor screen show different totals.
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineTotals(item: SmetaLineItem, defaultMargin: number) {
  const materialTotal = round2(item.quantity * item.materialUnitPrice);
  const laborTotal = round2(item.quantity * item.laborUnitPrice);
  const additionalCost = round2(item.additionalCost);
  const rowSubtotal = round2(materialTotal + laborTotal + additionalCost);
  const wasteAmount = round2(materialTotal * item.wastePercentage);
  const marginPercentage = item.marginPercentage ?? defaultMargin;
  const marginAmount = round2((rowSubtotal + wasteAmount) * marginPercentage);
  const rowTotal = round2(rowSubtotal + wasteAmount + marginAmount);
  return { materialTotal, laborTotal, additionalCost, wasteAmount, marginPercentage, rowTotal };
}

export function estimateTotal(estimate: SmetaEstimate, projectCosts: SmetaProjectCost[], defaultMargin: number): number {
  let rows = 0;
  for (const section of estimate.sections) {
    for (const item of section.items) rows = round2(rows + lineTotals(item, defaultMargin).rowTotal);
  }
  return round2(rows + round2(projectCosts.reduce((sum, c) => sum + c.amount, 0)));
}

/**
 * Client-facing version of a sent estimate. Every line carries its all-in price;
 * margin is spread proportionally over material, labor and extras, and waste is
 * folded into material, so neither can be read back from the payload.
 */
export function buildPublicSnapshot(
  estimate: SmetaEstimate,
  projectCosts: SmetaProjectCost[],
  defaultMargin: number,
  sentAt: Date,
): SharedEstimateSnapshot {
  let material = 0;
  let labor = 0;
  let rows = 0;
  const sections = estimate.sections.map((section) => {
    let sectionTotal = 0;
    const items = section.items.map((item) => {
      const l = lineTotals(item, defaultMargin);
      const k = 1 + l.marginPercentage;
      material += (l.materialTotal + l.wasteAmount) * k;
      labor += l.laborTotal * k;
      sectionTotal += l.rowTotal;
      return {
        id: item.id,
        name: item.name,
        zone: item.zone,
        unit: item.unit,
        quantity: item.quantity,
        quantityLabel: item.quantitySource.label,
        total: l.rowTotal,
        materialTotal: round2((l.materialTotal + l.wasteAmount) * k),
        laborTotal: round2(l.laborTotal * k),
        additionalTotal: round2(item.additionalCost * k),
      };
    });
    rows = round2(rows + round2(sectionTotal));
    return { id: section.id, title: section.title, total: round2(sectionTotal), items };
  });
  const projectCostsTotal = round2(projectCosts.reduce((sum, c) => sum + c.amount, 0));
  const total = round2(rows + projectCostsTotal);
  material = round2(material);
  labor = round2(labor);
  return {
    version: estimate.version,
    sentAt: sentAt.toISOString(),
    validUntil: estimate.validUntil,
    sections,
    projectCosts: projectCosts.map((c) => ({ id: c.id, label: c.label, amount: c.amount })),
    projectCostsTotal,
    total,
    split: { material, labor, other: round2(total - material - labor) },
  };
}

/** JSON with sorted keys, so values read back from jsonb compare equal to freshly built ones. */
export function stableStringify(value: unknown, skipKeys: ReadonlySet<string> = new Set()): string {
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v, skipKeys)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && !skipKeys.has(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v, skipKeys)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
