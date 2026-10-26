/*
 * Construction calculators (pure functions, no UI): rebar weight ↔ length ↔ bars, timber volume and area.
 * Rebar mass per metre: d² / 162 kg/m (steel 7 850 kg/m³: π·d²/4 · 7850 / 10⁶ ≈ d²/162.2).
 * Published tables round these values (e.g. Ø12 = 0.888 kg/m); both are shown, the formula is used for the results.
 */

export const REBAR_DIAMETERS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32] as const;
/** Nominal mass from the standard table (GOST 5781 / ГОСТ 34028), kg/m. */
export const REBAR_TABLE: Record<number, number> = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 14: 1.208, 16: 1.578, 18: 1.998, 20: 2.466, 22: 2.984, 25: 3.853, 28: 4.834, 32: 6.313 };

export const kgPerMetre = (d: number) => (d * d) / 162;

export interface RebarFacts { d: number; kgPerM: number; tableKgPerM: number | null; metresPerTon: number; barLength: number; barKg: number; barsPerTon: number }
export function rebarFacts(d: number, barLength = 12): RebarFacts {
  const k = kgPerMetre(d);
  return { d, kgPerM: k, tableKgPerM: REBAR_TABLE[d] ?? null, metresPerTon: 1000 / k, barLength, barKg: k * barLength, barsPerTon: 1000 / (k * barLength) };
}

export type RebarUnit = 'ton' | 'metr' | 'eded';
export interface RebarAmount { tons: number; kg: number; metres: number; bars: number }
/** One amount (tons, metres or bars of the given length) → all three. */
export function convertRebar(d: number, value: number, unit: RebarUnit, barLength = 12): RebarAmount | null {
  if (!(value >= 0) || !(d > 0) || !(barLength > 0)) return null;
  const k = kgPerMetre(d);
  const metres = unit === 'ton' ? (value * 1000) / k : unit === 'metr' ? value : value * barLength;
  const kg = metres * k;
  return { tons: kg / 1000, kg, metres, bars: metres / barLength };
}

export type LenUnit = 'mm' | 'sm' | 'm';
export const toMetres = (v: number, u: LenUnit) => (u === 'mm' ? v / 1000 : u === 'sm' ? v / 100 : v);

export interface TimberInput { width: number; thickness: number; sectionUnit: LenUnit; length: number; lengthUnit: LenUnit; count: number }
export interface TimberResult { pieceM3: number; totalM3: number; pieceM2: number; totalM2: number; widthM: number; thicknessM: number; lengthM: number }
/** Volume = width × thickness × length; face area = the wider side × length. */
export function timber(i: TimberInput): TimberResult | null {
  const w = toMetres(i.width, i.sectionUnit), t = toMetres(i.thickness, i.sectionUnit), L = toMetres(i.length, i.lengthUnit);
  if (!(w > 0 && t > 0 && L > 0) || !(i.count >= 0)) return null;
  const pieceM3 = w * t * L, pieceM2 = Math.max(w, t) * L;
  return { pieceM3, totalM3: pieceM3 * i.count, pieceM2, totalM2: pieceM2 * i.count, widthM: w, thicknessM: t, lengthM: L };
}
/** How many pieces cover a needed volume (m³) or face area (m²): always rounded up. */
export const piecesFor = (needed: number, perPiece: number) => (needed > 0 && perPiece > 0 ? Math.ceil(needed / perPiece - 1e-9) : 0);

export type PriceBasis = 'm3' | 'piece';
export function timberCost(r: TimberResult, count: number, price: number, basis: PriceBasis) {
  if (!(price >= 0)) return null;
  const perPiece = basis === 'm3' ? price * r.pieceM3 : price;
  return { perPiece, total: perPiece * count, perM3: basis === 'm3' ? price : r.pieceM3 > 0 ? price / r.pieceM3 : 0 };
}

/** Azerbaijani number format: "1 125,00". */
export function az(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  const [i, f] = Math.abs(n).toFixed(digits).split('.');
  return `${n < 0 ? '−' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${f ? `,${f}` : ''}`;
}
/** Reads "1 250,5" or "1250.5". Empty → null; not a number → NaN. */
export function parseNum(s: string): number | null {
  const t = String(s ?? '').replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}
