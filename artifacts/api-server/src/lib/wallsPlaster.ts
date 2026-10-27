/*
 * "Hörgü və suvaq (çertyojdan)", stage 3: plaster per floor from the confirmed walls. Deterministic, no AI.
 *
 * Faces of a wall:
 *   external wall — the inner face (internal plaster) and the facade (external plaster);
 *   internal wall / partition — up to two faces, both internal plaster.
 * Heights: internal plaster from floor to ceiling = floor height − slab; the facade covers the full floor height
 * (the slab edge is plastered too).
 * Lengths: the facade by the outside dimension L; the inner face of an external wall is shorter by one wall
 * thickness at each corner (L − corners × T); internal walls by their clear length.
 * Face area = length × height − openings (each face loses the openings once); sides multiply the face.
 * Reveals (sides and top of each opening) only when the person gives a depth: Σ count × (2h + w) × depth, once per
 * opening for the internal plaster and once for the facade.
 * Cement-sand plaster: volume = area × thickness; + reserve; dry volume × factor; cement : sand = 1 : N by volume;
 * cement kg by bulk density → bags (40 kg, rounded up); sand m³ and tonnes.
 * Gypsum plaster: kg = area × thickness (mm) × consumption (kg/m²/mm) × (1 + reserve) → bags; no cement, no sand.
 * Internal and external totals are separate; the grand total adds them at the end (cement bags rounded once).
 */
import type { WallKind, WallsDoc, WFloor, WWall } from "./wallsModel";

export interface PlasterSystem {
  material: "cement_sand" | "gypsum"; thicknessMm: number; ratioSand: number;
  /** Gypsum: kg per m² per mm (null = not given → not calculated). */
  consumption: number | null; bagKg: number; reservePct: number;
  /** Plaster the reveals at this depth (cm); null = no. */
  revealCm: number | null;
}
export interface Sides { inner: number; facade: number }
export interface PlasterSettings {
  internal: PlasterSystem; external: PlasterSystem;
  sides: Record<WallKind, Sides>;
  byWall: Record<string, Sides>;
  cementBagKg: number; dryFactor: number; cementDensity: number; sandDensity: number;
}
export const PLASTER_MATERIAL_LABEL = { cement_sand: "Sement-qum suvağı", gypsum: "Gips suvağı" } as const;
export const defaultPlaster = (): PlasterSettings => ({
  internal: { material: "cement_sand", thicknessMm: 15, ratioSand: 3, consumption: 0.9, bagKg: 30, reservePct: 10, revealCm: null },
  external: { material: "cement_sand", thicknessMm: 20, ratioSand: 3, consumption: 0.9, bagKg: 30, reservePct: 10, revealCm: null },
  sides: { external: { inner: 1, facade: 1 }, internal: { inner: 2, facade: 0 }, partition: { inner: 2, facade: 0 } },
  byWall: {}, cementBagKg: 40, dryFactor: 1.3, cementDensity: 1300, sandDensity: 1600,
});

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = num(v); return n == null ? d : Math.min(hi, Math.max(lo, n)); };
const maxInner = (k: WallKind) => (k === "external" ? 1 : 2);
/** kind null = not known here: the calculation limits the sides by the wall's kind anyway. */
const sidesIn = (raw: unknown, kind: WallKind | null, d: Sides): Sides => {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { inner: Math.round(clamp(r.inner, 0, kind ? maxInner(kind) : 2, d.inner)), facade: !kind || kind === "external" ? Math.round(clamp(r.facade, 0, 1, d.facade)) : 0 };
};
function systemIn(raw: unknown, d: PlasterSystem): PlasterSystem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cons = r.consumption === null ? null : num(r.consumption);
  const rev = r.revealCm == null || r.revealCm === "" ? null : num(r.revealCm);
  return {
    material: r.material === "gypsum" ? "gypsum" : r.material === "cement_sand" ? "cement_sand" : d.material,
    thicknessMm: clamp(r.thicknessMm, 1, 100, d.thicknessMm), ratioSand: clamp(r.ratioSand, 1, 8, d.ratioSand),
    consumption: r.consumption === undefined ? d.consumption : cons != null && cons > 0 && cons <= 5 ? cons : null,
    bagKg: clamp(r.bagKg, 5, 60, d.bagKg), reservePct: clamp(r.reservePct, 0, 50, d.reservePct),
    revealCm: rev != null && rev > 0 && rev <= 100 ? rev : null,
  };
}
/** Never trust the client: everything clamped, sides limited by the kind of wall, dangling wall ids dropped. */
export function sanitizePlaster(raw: unknown, walls?: WallsDoc): PlasterSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = defaultPlaster();
  const s = (r.sides ?? {}) as Record<string, unknown>;
  const kindOf = new Map((walls?.floors ?? []).flatMap((f) => f.walls.map((w) => [w.id, w.kind] as const)));
  const byWall: Record<string, Sides> = {};
  for (const [k, v] of Object.entries((r.byWall ?? {}) as Record<string, unknown>).slice(0, 500)) {
    const kind = kindOf.get(k);
    if (kind || !walls) byWall[k] = sidesIn(v, kind ?? null, d.sides[kind ?? "internal"]);
  }
  return {
    internal: systemIn(r.internal, d.internal), external: systemIn(r.external, d.external),
    sides: { external: sidesIn(s.external, "external", d.sides.external), internal: sidesIn(s.internal, "internal", d.sides.internal), partition: sidesIn(s.partition, "partition", d.sides.partition) },
    byWall, cementBagKg: clamp(r.cementBagKg, 10, 60, 40), dryFactor: clamp(r.dryFactor, 1, 1.6, 1.3),
    cementDensity: clamp(r.cementDensity, 900, 1600, 1300), sandDensity: clamp(r.sandDensity, 1200, 1900, 1600),
  };
}

export interface PlasterWallCalc {
  wallId: string; name: string; kind: WallKind; status: "ok" | "error"; inner: number; facade: number;
  openings: number; innerLen: number; innerH: number; innerFace: number; innerReveal: number; innerArea: number;
  facadeLen: number; facadeH: number; facadeFace: number; facadeReveal: number; facadeArea: number; notes: string[];
}
export interface PlasterTotal {
  system: "internal" | "external"; material: PlasterSystem["material"]; thicknessMm: number; area: number;
  volumeM3: number; reserveM3: number;
  /** Cement-sand. */
  cementKg: number | null; cementBags: number | null; sandM3: number | null; sandTon: number | null;
  /** Gypsum. */
  gypsumKg: number | null; gypsumBags: number | null;
}
export interface FloorPlaster {
  floorId: string; name: string; confirmed: boolean; walls: PlasterWallCalc[];
  byKind: { kind: WallKind; innerArea: number; facadeArea: number }[];
  internal: PlasterTotal | null; external: PlasterTotal | null;
}
export interface PlasterCalc {
  floors: FloorPlaster[];
  house: { internal: PlasterTotal | null; external: PlasterTotal | null; total: { area: number; cementKg: number; cementBags: number; sandM3: number; sandTon: number; gypsumKg: number; gypsumBags: number } };
  final: boolean; issues: string[]; assumptions: string[];
}

const ceil = (v: number) => Math.max(0, Math.ceil(v - 1e-9));
const mm = (v: number | null) => (v == null ? "?" : String(Math.round(v * 1000) / 1000).replace(".", ","));
const KINDS: WallKind[] = ["external", "internal", "partition"];

export function plasterWall(f: WFloor, w: WWall, st: PlasterSettings): PlasterWallCalc {
  const notes: string[] = [];
  const sides = st.byWall[w.id] ?? st.sides[w.kind];
  const inner = Math.min(sides.inner, maxInner(w.kind)), facade = w.kind === "external" ? sides.facade : 0;
  const fh = f.floorHeight.value ?? 0, slab = f.slabThickness.value ?? 0;
  const L = w.length.value ?? 0, T = w.thickness.value ?? 0;
  const corners = Math.min(2, Math.max(0, Math.round(w.junctions.value ?? 0)));
  const innerLen = w.kind === "external" ? L - corners * T : L;
  const innerH = fh - slab, facadeH = fh;
  const openings = w.openings.reduce((s, o) => s + (o.count.value ?? 0) * (o.width.value ?? 0) * (o.height.value ?? 0), 0);
  const revealPer = w.openings.reduce((s, o) => s + (o.count.value ?? 0) * (2 * (o.height.value ?? 0) + (o.width.value ?? 0)), 0);
  const innerFace = innerLen * innerH - openings, facadeFace = L * facadeH - openings;
  const base = { wallId: w.id, name: w.name, kind: w.kind, inner, facade, openings, innerLen, innerH, innerFace, facadeLen: L, facadeH, facadeFace, notes };
  if ((inner > 0 && innerFace <= 0) || (facade > 0 && facadeFace <= 0) || L <= 0 || innerH <= 0) {
    notes.push("Ölçülər suvaq sahəsinə imkan vermir — uzunluğu, hündürlüyü və boşluqları yoxlayın.");
    return { ...base, status: "error", innerReveal: 0, innerArea: 0, facadeReveal: 0, facadeArea: 0 };
  }
  const innerReveal = inner > 0 && st.internal.revealCm ? (revealPer * st.internal.revealCm) / 100 : 0;
  const facadeReveal = facade > 0 && st.external.revealCm ? (revealPer * st.external.revealCm) / 100 : 0;
  if (w.kind === "external" && corners && inner) notes.push(`İçəri üz: küncdə divar qalınlığı çıxılır — ${mm(L)} − ${corners} × ${mm(T)} = ${mm(innerLen)} m.`);
  if (inner === 0 && facade === 0) notes.push("Bu divar suvaqlanmır.");
  return { ...base, status: "ok", innerReveal, innerArea: inner * innerFace + innerReveal, facadeReveal, facadeArea: facade * facadeFace + facadeReveal };
}

function total(system: "internal" | "external", area: number, s: PlasterSystem, st: PlasterSettings): PlasterTotal | null {
  if (area <= 0) return null;
  const volumeM3 = (area * s.thicknessMm) / 1000, reserveM3 = volumeM3 * (1 + s.reservePct / 100);
  const t: PlasterTotal = { system, material: s.material, thicknessMm: s.thicknessMm, area, volumeM3, reserveM3, cementKg: null, cementBags: null, sandM3: null, sandTon: null, gypsumKg: null, gypsumBags: null };
  if (s.material === "gypsum") {
    if (s.consumption == null) return t;
    const kg = area * s.thicknessMm * s.consumption * (1 + s.reservePct / 100);
    return { ...t, gypsumKg: kg, gypsumBags: ceil(kg / s.bagKg) };
  }
  const dry = reserveM3 * st.dryFactor;
  const cementM3 = dry / (1 + s.ratioSand), sandM3 = (dry * s.ratioSand) / (1 + s.ratioSand);
  const cementKg = cementM3 * st.cementDensity;
  return { ...t, cementKg, cementBags: ceil(cementKg / st.cementBagKg), sandM3, sandTon: (sandM3 * st.sandDensity) / 1000 };
}

export function plasterCalc(doc: WallsDoc, raw?: PlasterSettings): PlasterCalc {
  const st = raw ?? defaultPlaster();
  const issues: string[] = [];
  const floors: FloorPlaster[] = doc.floors.map((f) => {
    if (!f.confirmed) { issues.push(`${f.name}: ölçülər təsdiqlənməyib — bu mərtəbə hesablanmır`); return { floorId: f.id, name: f.name, confirmed: false, walls: [], byKind: [], internal: null, external: null }; }
    const walls = f.walls.map((w) => plasterWall(f, w, st));
    for (const w of walls) if (w.status === "error") issues.push(`${f.name} · ${w.name}: ölçüləri yoxlayın`);
    const ok = walls.filter((w) => w.status === "ok");
    const inArea = ok.reduce((s, w) => s + w.innerArea, 0), outArea = ok.reduce((s, w) => s + w.facadeArea, 0);
    return {
      floorId: f.id, name: f.name, confirmed: true, walls,
      byKind: KINDS.map((kind) => ({ kind, innerArea: ok.filter((w) => w.kind === kind).reduce((s, w) => s + w.innerArea, 0), facadeArea: ok.filter((w) => w.kind === kind).reduce((s, w) => s + w.facadeArea, 0) })).filter((k) => k.innerArea > 0 || k.facadeArea > 0),
      internal: total("internal", inArea, st.internal, st), external: total("external", outArea, st.external, st),
    };
  });
  for (const [sys, s] of [["Daxili", st.internal], ["Xarici", st.external]] as const) if (s.material === "gypsum" && s.consumption == null) issues.push(`${sys} suvaq: gipsin sərfiyyatı (kq/m²/mm) yazılmayıb — kütlə və kisə hesablanmır`);
  const done = floors.filter((f) => f.confirmed);
  const sumArea = (k: "internal" | "external") => done.reduce((s, f) => s + (f[k]?.area ?? 0), 0);
  const hi = total("internal", sumArea("internal"), st.internal, st), he = total("external", sumArea("external"), st.external, st);
  const cementKg = (hi?.cementKg ?? 0) + (he?.cementKg ?? 0), sandM3 = (hi?.sandM3 ?? 0) + (he?.sandM3 ?? 0), gypsumKg = (hi?.gypsumKg ?? 0) + (he?.gypsumKg ?? 0);
  const gypsumBags = (hi?.gypsumBags ?? 0) + (he?.gypsumBags ?? 0);
  const sys = (n: string, s: PlasterSystem) => s.material === "gypsum"
    ? `${n}: gips, ${mm(s.thicknessMm)} mm, sərfiyyat ${mm(s.consumption)} kq/m²/mm (məhsulun texniki vərəqi ilə yoxlayın), ehtiyat ${mm(s.reservePct)}%, kisə ${mm(s.bagKg)} kq. Sement və qum hesablanmır.`
    : `${n}: sement-qum 1 : ${mm(s.ratioSand)} (həcmcə), ${mm(s.thicknessMm)} mm, ehtiyat ${mm(s.reservePct)}%.`;
  return {
    floors,
    house: { internal: hi, external: he, total: { area: sumArea("internal") + sumArea("external"), cementKg, cementBags: ceil(cementKg / st.cementBagKg), sandM3, sandTon: (sandM3 * st.sandDensity) / 1000, gypsumKg, gypsumBags } },
    final: floors.length > 0 && floors.every((f) => f.confirmed && f.walls.every((w) => w.status === "ok")) && !issues.length,
    issues: issues.slice(0, 60),
    assumptions: [
      "Daxili suvaq döşəmədən tavana qədərdir: hündürlük = mərtəbə hündürlüyü − döşəmə plitəsi. Fasad mərtəbənin tam hündürlüyü ilə (plitənin kənarı da suvaqlanır).",
      "Fasadın uzunluğu xarici ölçüdür; xarici divarın içəri üzü hər küncdə bir divar qalınlığı qədər qısadır; daxili divarlar xalis uzunluqla.",
      "Qapı və pəncərələr hər suvaqlanan üzdən çıxılır. Yan səthlər yalnız dərinliyi yazılanda əlavə olunur: Σ say × (2 × hündürlük + en) × dərinlik, hər boşluq üçün bir dəfə.",
      sys("Daxili suvaq", st.internal), sys("Xarici suvaq", st.external),
      `Sement-qum: quru həcm = yaş həcm × ${mm(st.dryFactor)}; sementin töküm sıxlığı ${st.cementDensity}, qumun ${st.sandDensity} kq/m³ (fərziyyə). Sement ${mm(st.cementBagKg)} kq-lıq kisələrlə, yuxarı yuvarlaqlaşdırılır.`,
      "Ev üzrə miqdarlar cəmdən bir dəfə yuvarlaqlaşdırılır.",
    ],
  };
}
