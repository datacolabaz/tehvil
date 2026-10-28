/*
 * Work agreements with a tradesperson: plan vs real payments. Pure — no database, no clock (today is passed in).
 *
 * Plan rows are matched to money paid in order (cumulatively): a row is "paid" once everything paid covers it and every
 * row before it; "partial" when it is covered in part; otherwise "overdue" if its date has passed, else "upcoming".
 * A `rest` row is whatever of the total the other rows leave (never below zero). Nothing is guessed: rows without an
 * amount (other than the rest row) are reported as an issue.
 */
export type Cents = number;
/** Money as text ("1000", "1000.50") → qəpik; same rounding as financeCore, kept here so this module stays pure. */
export const toCents = (v: string | number | null | undefined): Cents => { const n = Number(String(v ?? "0").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
export const fromCents = (c: Cents) => (c / 100).toFixed(2);

export const BASES = ["contract", "monthly", "daily", "hourly"] as const;
export type Basis = (typeof BASES)[number];
export const BASIS_LABEL: Record<Basis, string> = { contract: "Razılaşma üzrə (bütün iş)", monthly: "Aylıq", daily: "Günlük", hourly: "Saatlıq" };
export const BASIS_UNIT: Record<Basis, string> = { contract: "", monthly: "ay", daily: "gün", hourly: "saat" };

export interface PlanRowIn { id?: string; dueDate: string | null; label: string; amount: string | null; rest: boolean }
export interface PlanRowOut extends PlanRowIn { amountC: Cents; cumC: Cents; status: "paid" | "partial" | "overdue" | "upcoming"; coveredC: Cents }
export interface AgreementSummary {
  totalC: Cents; paidC: Cents; remainingC: Cents; plannedC: Cents; unplannedC: Cents;
  overdueC: Cents; next: { dueDate: string | null; label: string; dueC: Cents } | null; issues: string[];
}

export function computePlan(totalC: Cents, rows: PlanRowIn[], paidC: Cents, today: string): { rows: PlanRowOut[]; summary: AgreementSummary } {
  const issues: string[] = [];
  const fixedC = rows.filter((r) => !r.rest).reduce((s, r) => s + toCents(r.amount ?? "0"), 0);
  const restC = Math.max(0, totalC - fixedC);
  if (rows.filter((r) => r.rest).length > 1) issues.push("“Qalan məbləğ” yalnız bir sətirdə ola bilər");
  if (fixedC > totalC) issues.push(`Planın cəmi (${fromCents(fixedC)}) razılaşmanın məbləğindən (${fromCents(totalC)}) çoxdur`);
  for (const r of rows) if (!r.rest && !(toCents(r.amount ?? "0") > 0)) issues.push(`${r.label || r.dueDate || "Sətir"}: məbləğ yazılmayıb`);
  let cum = 0;
  const out: PlanRowOut[] = rows.map((r) => {
    const amountC = r.rest ? restC : toCents(r.amount ?? "0");
    const before = cum; cum += amountC;
    const coveredC = Math.max(0, Math.min(amountC, paidC - before));
    const status: PlanRowOut["status"] = amountC > 0 && coveredC >= amountC ? "paid" : coveredC > 0 ? "partial" : r.dueDate && r.dueDate < today ? "overdue" : "upcoming";
    return { ...r, amountC, cumC: cum, status, coveredC };
  });
  const plannedC = cum;
  const unplannedC = Math.max(0, totalC - plannedC);
  if (rows.length && unplannedC > 0) issues.push(`${fromCents(unplannedC)} AZN plana düşməyib — “Qalan məbləğ” sətri əlavə edin və ya məbləğləri düzəldin`);
  const overdueC = out.filter((r) => r.dueDate && r.dueDate < today).reduce((s, r) => s + (r.amountC - r.coveredC), 0);
  const nx = out.find((r) => r.status !== "paid");
  return {
    rows: out,
    summary: {
      totalC, paidC, remainingC: Math.max(0, totalC - paidC), plannedC, unplannedC, overdueC,
      next: nx ? { dueDate: nx.dueDate, label: nx.label, dueC: nx.amountC - nx.coveredC } : null, issues,
    },
  };
}

/** Total of a time-based agreement: rate × units when both are known; otherwise the total the person typed. */
export function agreementTotal(basis: Basis, rate: string | null, units: string | null, typed: string | null): string | null {
  if (basis !== "contract" && rate && units) return fromCents(Math.round(toCents(rate) * Number(units)));
  return typed;
}

/**
 * A plan that splits a period into months with payments at the start / middle / end of each month — the usual way people
 * describe it ("ayın əvvəlində 1000, ortasında 500, sonunda 1000"). Amounts are left for the person to type.
 */
export function monthSlots(startDate: string, months: number, slots: ("start" | "mid" | "end")[]): PlanRowIn[] {
  // Month i runs from the start date + i months to the day before start + (i + 1) months: "əvvəli" is its first day,
  // "ortası" two weeks later, "sonu" its last day — never before the job starts.
  const [y, m, d] = startDate.split("-").map(Number);
  const iso = (t: Date) => t.toISOString().slice(0, 10);
  const at = (k: number) => { const t = new Date(Date.UTC(y, m - 1 + k, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))); };
  const name = { start: "əvvəli", mid: "ortası", end: "sonu" } as const;
  const out: PlanRowIn[] = [];
  for (let i = 0; i < months; i++) {
    const from = at(i), to = new Date(at(i + 1).getTime() - 86_400_000);
    for (const s of slots) {
      const due = s === "start" ? from : s === "mid" ? new Date(Math.min(from.getTime() + 14 * 86_400_000, to.getTime())) : to;
      out.push({ dueDate: iso(due), label: `${i + 1}-ci ay, ayın ${name[s]}`, amount: null, rest: false });
    }
  }
  return out;
}
