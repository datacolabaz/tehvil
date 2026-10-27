/*
 * "Hörgü və suvaq (çertyojdan)", stage 2: masonry per floor from the walls the person confirmed. Deterministic, no AI.
 *
 * Per wall (metres):
 *   H (masonry height) = floor height − slab thickness.
 *   External walls are measured by the outside dimension, so at a corner the same piece of wall would sit in two
 *   walls; each external corner (junction, at most 2 per wall) takes T / 2 off the length. Internal walls and
 *   partitions are measured clear between walls, so nothing is taken off.
 *   Gross = L_eff × H; openings = Σ count × width × height; net = gross − openings; volume = net × T.
 *   Units across the thickness ("rows"): single = 1, double = 2, auto = round((T + jv) / (W + jv)).
 *   Masonry thickness Tm = rows × W + (rows − 1) × jv; if it differs from the drawn T by more than 3 cm, a warning.
 *   Units = net / ((L + jv)(H + jh)) × rows (L, H, W: the unit's size; jv / jh: vertical / horizontal joints).
 *   Mortar (geometric) = net × Tm − units × L·H·W; or, if the person chose a norm, net × T × norm (m³ per m³ wall).
 * Per floor: units per material, rounded up once with the material's reserve; mortar with its reserve → dry volume
 * (× dry-volume factor) → cement : sand by volume 1 : N → cement kg by bulk density → 40 kg bags (rounded up), sand m³
 * and tonnes. The house total rounds the summed quantities once (so it can be less than the sum of floor roundings).
 * Floors that are not confirmed are not calculated.
 */
import type { WallKind, WallsDoc, WFloor, WWall } from "./wallsModel";

export type UnitMaterial = "red_brick" | "silicate_brick" | "misar" | "concrete_block" | "aerated" | "custom";
export const UNIT_MATERIALS: { key: UnitMaterial; label: string; l: number | null; h: number | null; w: number | null; joint: number; binder: "mortar" | "glue"; note: string }[] = [
  { key: "misar", label: "Mişardaşı", l: null, h: null, w: null, joint: 10, binder: "mortar", note: "Ölçüsü karxanaya görə dəyişir — öz daşınızın uzunluğunu, hündürlüyünü və enini yazın. Ölçüsüz say hesablanmır." },
  { key: "red_brick", label: "Qırmızı kərpic", l: 250, h: 65, w: 120, joint: 10, binder: "mortar", note: "250 × 120 × 65 mm. Kərpiciniz fərqlidirsə, ölçünü dəyişin." },
  { key: "silicate_brick", label: "Ağ silikat kərpic", l: 250, h: 88, w: 120, joint: 10, binder: "mortar", note: "250 × 120 × 88 mm (bir yarım)." },
  { key: "concrete_block", label: "Beton blok", l: 390, h: 188, w: 190, joint: 10, binder: "mortar", note: "390 × 190 × 188 mm — tipik ölçüdür, blokunuzun ölçüsünü yoxlayın." },
  { key: "aerated", label: "Qazbeton blok", l: 600, h: 200, w: 200, joint: 3, binder: "glue", note: "600 × 200 × 200 mm, 2–3 mm yapışqanla. Yapışqan sement-qum məhlulu deyil — onun üçün sement və qum hesablanmır." },
  { key: "custom", label: "Digər (ölçünü yazın)", l: null, h: null, w: null, joint: 10, binder: "mortar", note: "Materialın ölçüsünü yazın." },
];
const MAT = (k: UnitMaterial) => UNIT_MATERIALS.find((m) => m.key === k)!;
export const METHOD_LABEL = { single: "Tək daş", double: "Qoşa daş", auto: "Qalınlığa görə" } as const;

export interface MasonrySpec {
  id: string; name: string; material: UnitMaterial;
  /** Unit size, mm (null = not given). */
  l: number | null; h: number | null; w: number | null;
  /** Joints, mm. */
  jointH: number; jointV: number;
  method: "single" | "double" | "auto"; reservePct: number; binder: "mortar" | "glue";
}
export interface MortarSettings {
  /** geometry: joints from the unit's size; norm: m³ of mortar per m³ of wall given by the person. */
  mode: "geometry" | "norm"; normM3PerM3: number | null;
  ratioSand: number; cementBagKg: number; dryFactor: number; cementDensity: number; sandDensity: number; reservePct: number;
}
export interface MasonrySettings {
  specs: MasonrySpec[];
  /** Spec used for each wall kind; a wall can have its own. */
  byKind: Record<WallKind, string | null>;
  byWall: Record<string, string>;
  mortar: MortarSettings;
}
export const defaultMortar = (): MortarSettings => ({ mode: "geometry", normM3PerM3: null, ratioSand: 4, cementBagKg: 40, dryFactor: 1.3, cementDensity: 1300, sandDensity: 1600, reservePct: 5 });
export const defaultMasonry = (): MasonrySettings => ({ specs: [], byKind: { external: null, internal: null, partition: null }, byWall: {}, mortar: defaultMortar() });

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = num(v); return n == null ? d : Math.min(hi, Math.max(lo, n)); };
const size = (v: unknown) => { const n = num(v); return n != null && n >= 20 && n <= 1000 ? Math.round(n * 10) / 10 : null; };
const sid = (v: unknown) => (typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : null);

/** Never trust the client: unknown materials, absurd sizes and dangling references are dropped or clamped. */
export function sanitizeMasonry(raw: unknown, walls?: WallsDoc): MasonrySettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = defaultMasonry();
  const specs: MasonrySpec[] = [];
  for (const s0 of (Array.isArray(r.specs) ? r.specs : []).slice(0, 12)) {
    const s = (s0 ?? {}) as Record<string, unknown>;
    const material = UNIT_MATERIALS.some((m) => m.key === s.material) ? (s.material as UnitMaterial) : null;
    const id = sid(s.id);
    if (!material || !id || specs.some((x) => x.id === id)) continue;
    specs.push({
      id, material, name: typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 60) : MAT(material).label,
      l: size(s.l), h: size(s.h), w: size(s.w),
      jointH: clamp(s.jointH, 0, 40, MAT(material).joint), jointV: clamp(s.jointV, 0, 40, MAT(material).joint),
      method: s.method === "single" || s.method === "double" ? s.method : "auto",
      reservePct: clamp(s.reservePct, 0, 50, 5), binder: MAT(material).binder,
    });
  }
  const has = (id: unknown) => (sid(id) && specs.some((s) => s.id === id) ? (id as string) : null);
  const bk = (r.byKind ?? {}) as Record<string, unknown>;
  const wallIds = walls ? new Set(walls.floors.flatMap((f) => f.walls.map((w) => w.id))) : null;
  const byWall: Record<string, string> = {};
  for (const [k, v] of Object.entries((r.byWall ?? {}) as Record<string, unknown>).slice(0, 500)) if (sid(k) && has(v) && (!wallIds || wallIds.has(k))) byWall[k] = v as string;
  const m = (r.mortar ?? {}) as Record<string, unknown>;
  const norm = num(m.normM3PerM3);
  return {
    specs, byKind: { external: has(bk.external), internal: has(bk.internal), partition: has(bk.partition) }, byWall,
    mortar: {
      mode: m.mode === "norm" ? "norm" : "geometry", normM3PerM3: norm != null && norm > 0 && norm <= 0.6 ? norm : null,
      ratioSand: clamp(m.ratioSand, 1, 8, d.mortar.ratioSand), cementBagKg: clamp(m.cementBagKg, 10, 60, 40),
      dryFactor: clamp(m.dryFactor, 1, 1.6, d.mortar.dryFactor), cementDensity: clamp(m.cementDensity, 900, 1600, 1300),
      sandDensity: clamp(m.sandDensity, 1200, 1900, 1600), reservePct: clamp(m.reservePct, 0, 50, 5),
    },
  };
}

export interface WallCalc {
  wallId: string; name: string; kind: WallKind; specId: string | null;
  status: "ok" | "no-material" | "no-size" | "no-norm" | "error";
  L: number; deduct: number; Leff: number; H: number; T: number;
  gross: number; openings: number; net: number; volume: number;
  rows: number | null; rowsExact: number | null; Tm: number | null;
  units: number | null; mortarM3: number | null; binder: "mortar" | "glue" | null;
  notes: string[];
}
export interface GroupTotal { kind: WallKind; walls: number; gross: number; openings: number; net: number; volume: number }
export interface UnitTotal { specId: string; name: string; size: string; reservePct: number; unitsRaw: number; units: number; volume: number }
export interface MortarTotal { wetM3: number; reserveM3: number; dryM3: number; cementKg: number; cementBags: number; sandM3: number; sandTon: number; glueM3: number }
export interface FloorCalc {
  floorId: string; name: string; confirmed: boolean; height: number | null;
  walls: WallCalc[]; groups: GroupTotal[]; units: UnitTotal[]; mortar: MortarTotal | null; complete: boolean;
}
export interface MasonryCalc {
  floors: FloorCalc[];
  house: { groups: GroupTotal[]; units: UnitTotal[]; mortar: MortarTotal | null };
  /** True only when every floor is confirmed and every wall has a result. */
  final: boolean;
  issues: string[]; assumptions: string[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const ceil = (v: number) => Math.max(0, Math.ceil(v - 1e-9));
const mm = (v: number | null) => (v == null ? "?" : String(v).replace(".", ","));
export const specSize = (s: MasonrySpec) => `${mm(s.l)} × ${mm(s.w)} × ${mm(s.h)} mm`;
const KIND_ORDER: WallKind[] = ["external", "internal", "partition"];

export function wallCalc(f: WFloor, w: WWall, st: MasonrySettings): WallCalc {
  const notes: string[] = [];
  const H = (f.floorHeight.value ?? 0) - (f.slabThickness.value ?? 0);
  const L = w.length.value ?? 0, T = w.thickness.value ?? 0;
  const junctions = Math.min(2, Math.max(0, Math.round(w.junctions.value ?? 0)));
  const deduct = w.kind === "external" ? (junctions * T) / 2 : 0;
  const Leff = L - deduct;
  const gross = Leff * H;
  const openings = w.openings.reduce((s, o) => s + (o.count.value ?? 0) * (o.width.value ?? 0) * (o.height.value ?? 0), 0);
  const net = gross - openings;
  const specId = st.byWall[w.id] ?? st.byKind[w.kind] ?? null;
  const spec = st.specs.find((s) => s.id === specId) ?? null;
  const base: WallCalc = { wallId: w.id, name: w.name, kind: w.kind, specId: spec?.id ?? null, status: "ok", L, deduct, Leff, H, T, gross, openings, net, volume: Math.max(0, net) * T, rows: null, rowsExact: null, Tm: null, units: null, mortarM3: null, binder: spec?.binder ?? null, notes };
  if (!(L > 0 && T > 0 && H > 0) || Leff <= 0 || net <= 0) { notes.push("Ölçülər hesablamaya imkan vermir — uzunluğu, qalınlığı, hündürlüyü və boşluqları yoxlayın."); return { ...base, status: "error" }; }
  if (deduct > 0) notes.push(`Künclər: ${junctions} × ${mm(r3(T))} / 2 = ${mm(r3(deduct))} m çıxıldı (xarici ölçü küncdə iki divarda sayılmasın).`);
  if (!spec) return { ...base, status: "no-material" };
  if (spec.l == null || spec.h == null || spec.w == null) return { ...base, status: "no-size" };
  const l = spec.l / 1000, h = spec.h / 1000, wd = spec.w / 1000, jh = spec.jointH / 1000, jv = spec.jointV / 1000;
  const rowsExact = (T + jv) / (wd + jv);
  let rows: number;
  if (spec.method === "single") rows = 1;
  else if (spec.method === "double") rows = 2;
  else {
    rows = Math.max(1, Math.round(rowsExact));
    if (Math.abs(rowsExact - rows) > 0.15) notes.push(`Divarın qalınlığı (${mm(r3(T * 100))} sm) bu materialın eninə tam bölünmür (${mm(Math.round(rowsExact * 100) / 100)} cərgə) — ${rows} cərgə götürüldü, yoxlayın.`);
  }
  const Tm = rows * wd + (rows - 1) * jv;
  if (Math.abs(Tm - T) > 0.03) notes.push(`Çertyojda divar ${mm(r3(T * 100))} sm, seçilmiş hörgü (${rows === 1 ? "tək" : rows === 2 ? "qoşa" : `${rows} cərgə`}) ${mm(Math.round(Tm * 1000) / 10)} sm verir — material və ya hörgü üsulu divara uyğun deyil, yoxlayın.`);
  const units = (net / ((l + jv) * (h + jh))) * rows;
  let mortarM3: number | null;
  if (st.mortar.mode === "norm" && spec.binder === "mortar") mortarM3 = st.mortar.normM3PerM3 == null ? null : net * T * st.mortar.normM3PerM3;
  else mortarM3 = Math.max(0, net * Tm - units * l * h * wd);
  return { ...base, status: mortarM3 == null ? "no-norm" : "ok", rows, rowsExact, Tm, units, mortarM3 };
}

function groups(ws: WallCalc[]): GroupTotal[] {
  return KIND_ORDER.map((kind) => {
    const g = ws.filter((w) => w.kind === kind && w.status !== "error");
    return { kind, walls: g.length, gross: g.reduce((s, w) => s + w.gross, 0), openings: g.reduce((s, w) => s + w.openings, 0), net: g.reduce((s, w) => s + w.net, 0), volume: g.reduce((s, w) => s + w.volume, 0) };
  }).filter((g) => g.walls > 0);
}
function units(ws: WallCalc[], st: MasonrySettings): UnitTotal[] {
  return st.specs.flatMap((s) => {
    const g = ws.filter((w) => w.specId === s.id && w.units != null);
    if (!g.length) return [];
    const raw = g.reduce((t, w) => t + (w.units ?? 0), 0);
    return [{ specId: s.id, name: s.name, size: specSize(s), reservePct: s.reservePct, unitsRaw: raw, units: ceil(raw * (1 + s.reservePct / 100)), volume: g.reduce((t, w) => t + w.volume, 0) }];
  });
}
function mortar(ws: WallCalc[], m: MortarSettings): MortarTotal | null {
  const done = ws.filter((w) => w.mortarM3 != null);
  if (!done.length) return null;
  const glueM3 = done.filter((w) => w.binder === "glue").reduce((s, w) => s + (w.mortarM3 ?? 0), 0);
  const wetM3 = done.filter((w) => w.binder === "mortar").reduce((s, w) => s + (w.mortarM3 ?? 0), 0);
  const reserveM3 = wetM3 * (1 + m.reservePct / 100);
  const dryM3 = reserveM3 * m.dryFactor;
  const cementM3 = dryM3 / (1 + m.ratioSand), sandM3 = (dryM3 * m.ratioSand) / (1 + m.ratioSand);
  const cementKg = cementM3 * m.cementDensity;
  return { wetM3, reserveM3, dryM3, cementKg, cementBags: ceil(cementKg / m.cementBagKg), sandM3, sandTon: (sandM3 * m.sandDensity) / 1000, glueM3 };
}

export function masonryCalc(doc: WallsDoc, raw?: MasonrySettings): MasonryCalc {
  const st = raw ?? defaultMasonry();
  const issues: string[] = [];
  const floors: FloorCalc[] = doc.floors.map((f) => {
    if (!f.confirmed) return { floorId: f.id, name: f.name, confirmed: false, height: null, walls: [], groups: [], units: [], mortar: null, complete: false };
    const ws = f.walls.map((w) => wallCalc(f, w, st));
    for (const w of ws) {
      if (w.status === "no-material") issues.push(`${f.name} · ${w.name}: hörgü materialı seçilməyib`);
      if (w.status === "no-size") issues.push(`${f.name} · ${w.name}: materialın ölçüsü yazılmayıb`);
      if (w.status === "no-norm") issues.push(`${f.name} · ${w.name}: 1 m³ hörgüyə məhlul sərfiyyatı yazılmayıb`);
      if (w.status === "error") issues.push(`${f.name} · ${w.name}: ölçüləri yoxlayın`);
    }
    return { floorId: f.id, name: f.name, confirmed: true, height: (f.floorHeight.value ?? 0) - (f.slabThickness.value ?? 0), walls: ws, groups: groups(ws), units: units(ws, st), mortar: mortar(ws, st.mortar), complete: ws.every((w) => w.status === "ok") };
  });
  for (const f of floors) if (!f.confirmed) issues.unshift(`${f.name}: ölçülər təsdiqlənməyib — bu mərtəbə hesablanmır`);
  const all = floors.flatMap((f) => f.walls);
  const m = st.mortar;
  const assumptions = [
    "Hörgü hündürlüyü = mərtəbə hündürlüyü − döşəmə plitəsi.",
    "Xarici divarın uzunluğu fasadın xarici ölçüsüdür: hər küncdə divar qalınlığının yarısı çıxılır. Daxili divar və arakəsmənin uzunluğu divarlar arasındakı xalis məsafədir.",
    "Say = xalis sahə / ((L + şaquli tikiş) × (H + üfüqi tikiş)) × cərgə sayı. Kəsim və qırılma itkisi ehtiyat faizindədir.",
    m.mode === "norm" ? `Məhlul: 1 m³ hörgüyə ${mm(m.normM3PerM3)} m³ (sizin göstəriciniz).` : "Məhlul = xalis hörgü həcmi − daşların həcmi (tikişlərin həcmi). Boşluqlu kərpic və tikişin dolmaması nəzərə alınmır.",
    `Məhlul: sement : qum = 1 : ${mm(m.ratioSand)} (həcmcə), ehtiyat ${mm(m.reservePct)}%, quru həcm əmsalı ${mm(m.dryFactor)} (fərziyyə).`,
    `Sementin töküm sıxlığı ${m.cementDensity} kq/m³, qumun ${m.sandDensity} kq/m³ (fərziyyə). Sement ${mm(m.cementBagKg)} kq-lıq kisələrlə, yuxarı yuvarlaqlaşdırılır.`,
  ];
  return {
    floors, house: { groups: groups(all), units: units(all, st), mortar: mortar(all, m) },
    final: floors.length > 0 && floors.every((f) => f.confirmed && f.complete), issues: issues.slice(0, 60), assumptions,
  };
}
