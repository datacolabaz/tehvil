/*
 * Plaster (suvaq) calculator — deterministic, no AI.
 * Area: (length × height − openings) × sides (1 or 2). Openings are taken off each side once; reveals (the sides and top
 * of openings) are added only when the person asks, with a depth they give.
 * Volume = area × thickness. Dry mix = area × thickness (mm) × consumption (kg/m²/mm) × (1 + reserve).
 * Cement-sand mixed on site: dry volume = wet volume × dry-volume factor; split by the 1 : N ratio; cement and sand mass
 * from bulk densities. Every factor is shown and editable; nothing is assumed silently.
 */
import { openingArea, type Opening } from './masonry';

export type PlasterMaterial = 'cement_sand' | 'gypsum' | 'custom';
export const PLASTER_MATERIALS: { key: PlasterMaterial; label: string; consumption: number | null; note: string }[] = [
  { key: 'cement_sand', label: 'Sement-qum suvağı', consumption: 1.7, note: 'Hazır sement-qum quru qarışığı üçün tipik sərfiyyat 1,6–1,8 kq/m² hər 1 mm-ə. Bu, fərziyyədir — kisənin üzərindəki rəqəmi yazın.' },
  { key: 'gypsum', label: 'Gips suvağı', consumption: 0.9, note: 'Gips suvaq üçün tipik sərfiyyat 0,8–1,0 kq/m² hər 1 mm-ə. Bu, fərziyyədir — məhsulun texniki vərəqindəki rəqəmi yazın.' },
  { key: 'custom', label: 'Öz qarışığım', consumption: null, note: 'Qarışığın sərfiyyatını (kq/m²/mm) yazın — yazılmasa, kütlə və kisə sayı hesablanmır.' },
];
export const plasterLabel = (k: PlasterMaterial) => PLASTER_MATERIALS.find((m) => m.key === k)?.label ?? k;

export interface PlasterWall {
  length: number; height: number; kind: 'internal' | 'external'; sides: 1 | 2; thicknessMm: number;
  material: PlasterMaterial; openings: Opening[];
  /** Plaster the reveals (two sides and top of each opening) at this depth, cm; null = no. */
  revealDepthCm: number | null;
}
export interface PlasterMix {
  /** kg/m² per 1 mm; null = not given. */
  consumption: number | null; bagKg: number; reservePct: number;
  price: number | null; priceUnit: 'bag' | 'kg';
  /** Cement-sand only: bought as ready dry mix, or cement + sand mixed on site. */
  mode: 'dry' | 'site';
  ratioSand: number; dryFactor: number; cementDensity: number; sandDensity: number; cementBagKg: number;
  cementPrice: number | null; sandPrice: number | null; sandPriceUnit: 'm3' | 'ton';
}
export const defaultMix = (m: PlasterMaterial): PlasterMix => ({
  consumption: PLASTER_MATERIALS.find((x) => x.key === m)?.consumption ?? null, bagKg: m === 'gypsum' ? 30 : 25, reservePct: 10,
  price: null, priceUnit: 'bag', mode: 'dry', ratioSand: 3, dryFactor: 1.3, cementDensity: 1300, sandDensity: 1600, cementBagKg: 50,
  cementPrice: null, sandPrice: null, sandPriceUnit: 'm3',
});

export interface PlasterResult {
  ok: boolean; errors: string[]; warnings: string[];
  grossArea: number; openingsArea: number; netArea: number; revealArea: number; area: number; volume: number;
  /** kg without / with reserve; null when consumption is unknown. */
  dryKg: number | null; dryKgReserve: number | null;
}
const pos = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function plasterWall(w: PlasterWall, mix: PlasterMix): PlasterResult {
  const errors: string[] = [], warnings: string[] = [];
  const empty: PlasterResult = { ok: false, errors, warnings, grossArea: 0, openingsArea: 0, netArea: 0, revealArea: 0, area: 0, volume: 0, dryKg: null, dryKgReserve: null };
  if (!pos(w.length)) errors.push('Divarın uzunluğunu yazın (metr, sıfırdan böyük).');
  if (!pos(w.height)) errors.push('Divarın hündürlüyünü yazın (metr, sıfırdan böyük).');
  if (!(w.thicknessMm > 0 && w.thicknessMm <= 100)) errors.push('Suvağın qalınlığı 1–100 mm olmalıdır.');
  if (w.sides !== 1 && w.sides !== 2) errors.push('Neçə tərəf suvanacağını seçin.');
  if (w.revealDepthCm != null && !pos(w.revealDepthCm)) errors.push('Boşluqların yan səthinin dərinliyini yazın (sm).');
  for (const [i, o] of w.openings.entries()) if (!(Number.isInteger(o.count) && o.count >= 1) || !pos(o.width) || !pos(o.height)) errors.push(`${i + 1}-ci boşluq: say, en və hündürlük sıfırdan böyük olmalıdır.`);
  if (errors.length) return empty;
  const grossArea = w.length * w.height;
  const openingsArea = w.openings.reduce((s, o) => s + openingArea(o), 0);
  if (openingsArea >= grossArea) { errors.push(`Boşluqların sahəsi (${openingsArea.toFixed(2)} m²) divarın sahəsindən böyük və ya bərabərdir — ölçüləri yoxlayın.`); return { ...empty, grossArea, openingsArea }; }
  const netArea = grossArea - openingsArea;
  const revealArea = w.revealDepthCm ? w.openings.reduce((s, o) => s + o.count * (2 * o.height + o.width) * (w.revealDepthCm! / 100), 0) : 0;
  // Sides multiply the face only; reveals are counted once (they are not on both faces).
  const area = netArea * w.sides + revealArea;
  const volume = (area * w.thicknessMm) / 1000;
  const dryKg = mix.consumption != null && mix.consumption > 0 ? area * w.thicknessMm * mix.consumption : null;
  if (mix.consumption == null) warnings.push('Sərfiyyat (kq/m²/mm) yazılmayıb — kütlə və kisə sayı hesablanmır.');
  return { ok: true, errors, warnings, grossArea, openingsArea, netArea, revealArea, area, volume, dryKg, dryKgReserve: dryKg == null ? null : dryKg * (1 + mix.reservePct / 100) };
}

export interface MixTotals {
  material: PlasterMaterial; area: number; volume: number;
  dryKg: number | null; dryKgReserve: number | null; bags: number | null;
  site: null | { wetM3: number; dryM3: number; cementM3: number; cementKg: number; cementBags: number; sandM3: number; sandTon: number };
  cost: number | null; costParts: { label: string; amount: number }[]; missingPrice: boolean; assumptions: string[];
}
/** Totals for one plaster material. Bags are counted on the total mass (rounded up once), not per wall. */
export function mixTotals(material: PlasterMaterial, results: PlasterResult[], mix: PlasterMix): MixTotals {
  const ok = results.filter((r) => r.ok);
  const area = ok.reduce((s, r) => s + r.area, 0), volume = ok.reduce((s, r) => s + r.volume, 0);
  const known = mix.consumption != null && mix.consumption > 0;
  const dryKg = known ? ok.reduce((s, r) => s + (r.dryKg ?? 0), 0) : null;
  const dryKgReserve = dryKg == null ? null : dryKg * (1 + mix.reservePct / 100);
  const assumptions: string[] = [];
  if (known) assumptions.push(`Sərfiyyat ${mix.consumption} kq/m² hər 1 mm-ə${PLASTER_MATERIALS.find((x) => x.key === material)?.consumption === mix.consumption ? ' (tipik dəyər — fərziyyə; məhsulun öz rəqəmi ilə yoxlayın)' : ' (sizin dəyəriniz)'}`);
  assumptions.push(`Ehtiyat ${mix.reservePct}%`);
  const costParts: { label: string; amount: number }[] = [];
  let missingPrice = false;
  let bags: number | null = null, site: MixTotals['site'] = null;
  if (material === 'cement_sand' && mix.mode === 'site') {
    const wetM3 = volume * (1 + mix.reservePct / 100);
    const dryM3 = wetM3 * mix.dryFactor;
    const cementM3 = dryM3 / (1 + mix.ratioSand), sandM3 = (dryM3 * mix.ratioSand) / (1 + mix.ratioSand);
    const cementKg = cementM3 * mix.cementDensity;
    site = { wetM3, dryM3, cementM3, cementKg, cementBags: Math.ceil(cementKg / mix.cementBagKg - 1e-9), sandM3, sandTon: (sandM3 * mix.sandDensity) / 1000 };
    assumptions.push(`Yerində qarışdırılır: sement : qum = 1 : ${mix.ratioSand} (həcmcə)`);
    assumptions.push(`Quru həcm əmsalı ${mix.dryFactor} — yaş məhlulun 1 m³-i üçün ${mix.dryFactor} m³ quru sement və qum (sıxlaşma və boşluqlar; fərziyyə, dəyişdirilə bilər)`);
    assumptions.push(`Sementin töküm sıxlığı ${mix.cementDensity} kq/m³, qumun ${mix.sandDensity} kq/m³ (fərziyyə)`);
    if (mix.cementPrice != null) costParts.push({ label: `Sement ${site.cementBags} kisə × ${mix.cementPrice} AZN`, amount: site.cementBags * mix.cementPrice }); else missingPrice = true;
    if (mix.sandPrice != null) { const q = mix.sandPriceUnit === 'm3' ? site.sandM3 : site.sandTon; costParts.push({ label: `Qum ${q.toFixed(2)} ${mix.sandPriceUnit === 'm3' ? 'm³' : 'ton'} × ${mix.sandPrice} AZN`, amount: q * mix.sandPrice }); } else missingPrice = true;
  } else {
    bags = dryKgReserve == null ? null : Math.ceil(dryKgReserve / mix.bagKg - 1e-9);
    if (mix.price != null && dryKgReserve != null) costParts.push(mix.priceUnit === 'bag' ? { label: `${bags} kisə × ${mix.price} AZN`, amount: bags! * mix.price } : { label: `${dryKgReserve.toFixed(1)} kq × ${mix.price} AZN`, amount: dryKgReserve * mix.price });
    else missingPrice = true;
    if (bags != null) assumptions.push(`Kisə ${mix.bagKg} kq; kisə sayı ümumi kütləyə görə bir dəfə yuxarı yuvarlaqlaşdırılır`);
  }
  return { material, area, volume, dryKg, dryKgReserve, bags, site, cost: costParts.length ? costParts.reduce((s, p) => s + p.amount, 0) : null, costParts, missingPrice, assumptions };
}
