/*
 * Masonry (hörgü) calculator — deterministic, no AI.
 * Units: wall length / height and openings in metres, wall thickness in cm, unit (brick / block / mişardaşı) sizes and
 * joints in mm. Everything is converted to metres before calculating.
 *
 * Count: one unit with its joints occupies (L + j) × (H + j) of the wall face. Across the wall thickness there are
 * (T + j) / (W + j) rows ("wythes"). When that is a whole number the count is face count × rows; otherwise the wall
 * thickness does not fit the unit width — the person is warned and the count comes from the volume
 * (net area × (T + j) / ((L + j)(H + j)(W + j))) and is marked approximate. Their choice is never changed.
 * Mortar = net wall volume − volume of the units laid (geometric: horizontal, vertical and inner joints).
 */

export type MasonryMaterial = 'red_brick' | 'silicate_brick' | 'misar' | 'aerated' | 'custom';
export interface UnitSize { l: number | null; h: number | null; w: number | null }
export const MASONRY_MATERIALS: { key: MasonryMaterial; label: string; size: UnitSize; note: string }[] = [
  { key: 'red_brick', label: 'Qırmızı kərpic', size: { l: 250, h: 65, w: 120 }, note: 'Tək kərpic 250 × 120 × 65 mm. Kərpiciniz fərqlidirsə, ölçünü dəyişin.' },
  { key: 'silicate_brick', label: 'Ağ silikat kərpic', size: { l: 250, h: 88, w: 120 }, note: 'Silikat kərpic 250 × 120 × 88 mm (bir yarım). Tək silikat kərpic üçün hündürlüyü 65 mm yazın.' },
  { key: 'misar', label: 'Mişardaşı', size: { l: null, h: null, w: null }, note: 'Mişardaşının ölçüsü karxanaya və kəsimə görə dəyişir. Öz daşınızın uzunluğunu, hündürlüyünü və enini ölçüb yazın — ölçüsüz say hesablanmır.' },
  { key: 'aerated', label: 'Qazbeton bloku', size: { l: 600, h: 200, w: 200 }, note: 'Blok 600 × 200 × 200 mm. Qazbeton adətən 2–3 mm yapışqanla hörülür — tikişi buna görə dəyişin.' },
  { key: 'custom', label: 'Xüsusi ölçülü kərpic və ya blok', size: { l: null, h: null, w: null }, note: 'Materialın ölçüsünü yazın.' },
];
export const materialLabel = (k: MasonryMaterial) => MASONRY_MATERIALS.find((m) => m.key === k)?.label ?? k;

export interface Opening { kind: 'door' | 'window'; count: number; width: number; height: number }
export interface MasonryWall {
  length: number; height: number; thicknessCm: number;
  material: MasonryMaterial; unit: UnitSize; jointMm: number; reservePct: number;
  openings: Opening[];
  /** AZN per piece; null = not given. */
  unitPrice: number | null;
  /** AZN per m³ of mortar; null = not given. */
  mortarPrice: number | null;
}

export interface MasonryResult {
  ok: boolean; errors: string[]; warnings: string[]; assumptions: string[];
  grossArea: number; openingsArea: number; netArea: number; netVolume: number;
  rowsExact: number | null; rows: number | null; fits: boolean;
  /** Pieces without reserve, by face area × rows and by volume (for checking). */
  byArea: number | null; byVolume: number | null; pieces: number | null;
  reservePct: number; piecesWithReserve: number | null;
  mortarM3: number | null;
  unitCost: number | null; mortarCost: number | null; total: number | null;
}

const pos = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) && v > 0;
export const openingArea = (o: Opening) => (pos(o.width) && pos(o.height) && o.count > 0 ? o.count * o.width * o.height : 0);

export function masonryWall(w: MasonryWall): MasonryResult {
  const errors: string[] = [], warnings: string[] = [], assumptions: string[] = [];
  const empty: MasonryResult = { ok: false, errors, warnings, assumptions, grossArea: 0, openingsArea: 0, netArea: 0, netVolume: 0, rowsExact: null, rows: null, fits: false, byArea: null, byVolume: null, pieces: null, reservePct: w.reservePct, piecesWithReserve: null, mortarM3: null, unitCost: null, mortarCost: null, total: null };
  if (!pos(w.length)) errors.push('Divarın uzunluğunu yazın (metr, sıfırdan böyük).');
  if (!pos(w.height)) errors.push('Divarın hündürlüyünü yazın (metr, sıfırdan böyük).');
  if (!pos(w.thicknessCm)) errors.push('Divarın qalınlığını seçin və ya yazın.');
  if (!(w.jointMm >= 0 && w.jointMm <= 40)) errors.push('Tikişin qalınlığı 0–40 mm olmalıdır.');
  if (!(w.reservePct >= 0 && w.reservePct <= 50)) errors.push('Ehtiyat faizi 0–50% olmalıdır.');
  for (const [i, o] of w.openings.entries()) {
    if (!(Number.isInteger(o.count) && o.count >= 1) || !pos(o.width) || !pos(o.height)) errors.push(`${i + 1}-ci boşluq: say, en və hündürlük sıfırdan böyük olmalıdır.`);
  }
  if (errors.length) return empty;
  const grossArea = w.length * w.height;
  const openingsArea = w.openings.reduce((s, o) => s + openingArea(o), 0);
  if (openingsArea >= grossArea) { errors.push(`Qapı və pəncərələrin sahəsi (${round(openingsArea, 2)} m²) divarın sahəsindən (${round(grossArea, 2)} m²) böyük və ya bərabərdir — ölçüləri yoxlayın.`); return { ...empty, grossArea, openingsArea }; }
  const tooBig = w.openings.find((o) => o.width > w.length || o.height > w.height);
  if (tooBig) warnings.push('Boşluqlardan biri divardan enli və ya hündürdür — ölçüləri yoxlayın.');
  const netArea = grossArea - openingsArea;
  const T = w.thicknessCm / 100;
  const netVolume = netArea * T;
  const base = { ...empty, ok: true, grossArea, openingsArea, netArea, netVolume };
  if (!pos(w.unit.l) || !pos(w.unit.h) || !pos(w.unit.w)) {
    errors.push(`${materialLabel(w.material)} üçün uzunluq, hündürlük və eni (mm) yazın — ölçü olmadan say hesablanmır.`);
    return { ...base, ok: false };
  }
  const L = w.unit.l! / 1000, H = w.unit.h! / 1000, W = w.unit.w! / 1000, j = w.jointMm / 1000;
  const faceCell = (L + j) * (H + j);
  const perFace = netArea / faceCell;
  const rowsExact = (T + j) / (W + j);
  const rows = Math.max(1, Math.round(rowsExact));
  const fits = Math.abs(rowsExact - rows) <= 0.15 && rowsExact >= 0.85;
  const byArea = perFace * rows;
  // Volume check: the wall with one more joint on its thickness (rows × W + (rows − 1) × j = T) over one unit cell.
  const byVolume = (netArea * (T + j)) / (faceCell * (W + j));
  if (rowsExact < 0.85) warnings.push(`Divar (${w.thicknessCm} sm) materialın enindən (${w.unit.w} mm) nazikdir — material divara sığmır. Qalınlığı və ya materialı yoxlayın.`);
  else if (!fits) warnings.push(`Divarın qalınlığı (${w.thicknessCm} sm) materialın eni ${w.unit.w} mm + ${w.jointMm} mm tikişlə tam düşmür (${round(rowsExact, 2)} cərgə). Say həcmə görə təxmini hesablanıb; seçiminiz dəyişdirilməyib.`);
  const pieces = fits ? byArea : byVolume;
  const piecesWithReserve = Math.ceil(pieces * (1 + w.reservePct / 100) - 1e-9);
  const unitVol = L * H * W;
  const mortarRaw = netVolume - pieces * unitVol;
  const mortarM3 = rowsExact < 0.85 || mortarRaw < 0 ? null : mortarRaw;
  assumptions.push(`Material: ${materialLabel(w.material)} ${w.unit.l} × ${w.unit.w} × ${w.unit.h} mm (uzunluq × en × hündürlük)`);
  assumptions.push(`Tikiş ${w.jointMm} mm; divarın qalınlığı boyunca ${fits ? rows : round(rowsExact, 2)} cərgə`);
  assumptions.push(`Ehtiyat ${w.reservePct}% yalnız material sayına tətbiq edilir`);
  assumptions.push('Məhlul = xalis hörgü həcmi − hörülən materialın həcmi (üfüqi, şaquli və daxili tikişlər). Boşluqlu kərpicin dəlikləri, kəsimlər və itki nəzərə alınmır — təxminidir.');
  const unitCost = w.unitPrice != null && w.unitPrice >= 0 ? piecesWithReserve * w.unitPrice : null;
  const mortarCost = w.mortarPrice != null && w.mortarPrice >= 0 && mortarM3 != null ? mortarM3 * w.mortarPrice : null;
  const total = unitCost == null && mortarCost == null ? null : (unitCost ?? 0) + (mortarCost ?? 0);
  return { ...base, rowsExact, rows: fits ? rows : null, fits, byArea, byVolume, pieces, piecesWithReserve, mortarM3, unitCost, mortarCost, total };
}

export interface MasonryTotals {
  walls: number; grossArea: number; openingsArea: number; netArea: number; netVolume: number; mortarM3: number;
  byMaterial: { material: MasonryMaterial; label: string; size: string; pieces: number; unitCost: number | null; priced: boolean }[];
  unitCost: number | null; mortarCost: number | null; total: number | null; unpricedWalls: number; incomplete: number;
}
/** Sums the walls that could be calculated. Each wall counts once; pieces are summed after each wall's rounding. */
export function masonryTotals(walls: MasonryWall[], results: MasonryResult[]): MasonryTotals {
  const t: MasonryTotals = { walls: 0, grossArea: 0, openingsArea: 0, netArea: 0, netVolume: 0, mortarM3: 0, byMaterial: [], unitCost: null, mortarCost: null, total: null, unpricedWalls: 0, incomplete: 0 };
  results.forEach((r, i) => {
    const w = walls[i];
    if (!r.ok || r.piecesWithReserve == null) { t.incomplete++; return; }
    t.walls++; t.grossArea += r.grossArea; t.openingsArea += r.openingsArea; t.netArea += r.netArea; t.netVolume += r.netVolume; t.mortarM3 += r.mortarM3 ?? 0;
    const size = `${w.unit.l}×${w.unit.w}×${w.unit.h}`;
    let m = t.byMaterial.find((x) => x.material === w.material && x.size === size);
    if (!m) { m = { material: w.material, label: materialLabel(w.material), size, pieces: 0, unitCost: null, priced: true }; t.byMaterial.push(m); }
    m.pieces += r.piecesWithReserve;
    if (r.unitCost != null) m.unitCost = (m.unitCost ?? 0) + r.unitCost; else { m.priced = false; t.unpricedWalls++; }
    if (r.unitCost != null) t.unitCost = (t.unitCost ?? 0) + r.unitCost;
    if (r.mortarCost != null) t.mortarCost = (t.mortarCost ?? 0) + r.mortarCost;
  });
  t.total = t.unitCost == null && t.mortarCost == null ? null : (t.unitCost ?? 0) + (t.mortarCost ?? 0);
  return t;
}

export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
