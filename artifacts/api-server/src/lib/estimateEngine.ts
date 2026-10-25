/*
 * AI Smeta calculation engine — pure functions, no AI, no I/O. Every quantity is computed from explicit
 * parameters with a formula that is returned next to the number, so the person can see where it came from.
 *
 * Units: lengths, widths, heights in metres; rebar diameter in mm; spacing in metres; areas m², volumes m³.
 * The engine never invents a parameter: a missing value makes the line "Dəqiqləşdirilməlidir" with no quantity.
 * Losses / order reserve are separate lines, never folded into the structural quantity.
 */

export type Source = "drawing" | "user" | "assumed" | "missing" | "engineer" | "list";
export interface Param { value: number | null; source: Source; confidence?: number; note?: string; where?: string }
export type ParamMap = Record<string, Param | undefined>;

export type ElementType = "strip_foundation" | "column" | "beam" | "slab" | "wall" | "other_concrete";
export interface Element {
  id: string;
  type: ElementType;
  name: string;
  /**
   * strip_foundation: segments (lengths, m, comma list in `segments`), width, height, junctions (overlapping corners / T-joints)
   * column: count, width, depth, height · beam: count, length (clear span between columns), width, height (below the slab)
   * slab: area or length × width, thickness, openings (m²) · wall: length, height, thickness · other_concrete: volume
   * rebar: longD, longCount (bars in section), stirD, stirSpacing, meshD, meshSpacing, layers, cover
   */
  params: ParamMap;
  segments?: number[];
}

export interface Settings {
  stockLength: number;   // m, standard bar length (11.7)
  lapD: number;          // lap splice length in diameters (40 → 40d)
  anchorD: number;       // anchorage length in diameters
  hookD: number;         // stirrup hooks, total, in diameters (2 × 10d = 20)
  cover: number;         // m, default concrete cover if the element has none
  concreteReservePct: number; // order reserve / technological loss, separate line
  rebarCutPct: number;   // cutting loss, separate line
  plywood: { w: number; h: number; thicknessMm: number | null };
  formworkUses: number;  // how many times the same plywood is used
  boardLength: number;   // m, standard board length
}
export const DEFAULT_SETTINGS: Settings = {
  stockLength: 11.7, lapD: 40, anchorD: 30, hookD: 20, cover: 0.04, concreteReservePct: 2, rebarCutPct: 3,
  plywood: { w: 1.22, h: 2.44, thicknessMm: null }, formworkUses: 1, boardLength: 6,
};
/** Material norms only from the person / engineer — none are assumed by the system. */
export interface Norms {
  board3x10PerM2?: number | null;   // m of 3×10 board per m² of formwork
  board5x10PerM2?: number | null;   // m of 5×10 board per m² of formwork
  wirePerTon?: number | null;       // kg of annealed tie wire per tonne of rebar
  katinkaPerTon?: number | null;    // kg of wire rod (katanka) per tonne of rebar
}

export type ItemStatus = "drawing" | "user" | "estimated" | "missing" | "engineer" | "list" | "manual";
export const STATUS_LABEL: Record<ItemStatus, string> = {
  drawing: "Çertyojdan müəyyən edilib", user: "İstifadəçi tərəfindən təsdiqlənib", estimated: "Təxmini hesablanıb",
  missing: "Dəqiqləşdirilməlidir", engineer: "Mühəndis yoxlaması tələb olunur", list: "Mühəndisin siyahısından", manual: "Əl ilə əlavə edilib",
};
export type Category = "concrete" | "rebar" | "formwork" | "timber" | "other";
export const CATEGORY_LABEL: Record<Category, string> = { concrete: "Beton", rebar: "Armatur", formwork: "Qəlib", timber: "Taxta", other: "Digər materiallar" };

export interface Item {
  key: string;
  category: Category;
  name: string;
  qty: number | null;
  unit: string;
  status: ItemStatus;
  formula: string;
  inputs: string[];
  assumptions: string[];
  /** extra numbers shown in the line (e.g. rebar tonnes, timber m³) */
  extra?: { label: string; value: number; unit: string }[];
  reserve?: boolean;
}

export interface Breakdown { element: string; type: ElementType; part: string; formula: string; value: number | null; unit: string; status: ItemStatus }
export interface RebarLine { element: string; part: string; d: number; count: number | null; lengthEach: number | null; totalM: number | null; kgPerM: number; kg: number | null; formula: string; status: ItemStatus }

export const round = (v: number, p = 3) => Math.round(v * 10 ** p) / 10 ** p;
/** Theoretical mass of 1 m of rebar, kg (d in mm): d² / 162. */
export const kgPerM = (d: number) => (d * d) / 162;

const LABEL: Record<string, string> = {
  width: "en", height: "hündürlük", depth: "dərinlik", length: "uzunluq", thickness: "qalınlıq", count: "say", area: "sahə", openings: "boşluqlar",
  junctions: "kəsişmə sayı", volume: "həcm", longD: "uzununa armatur diametri", longCount: "uzununa armatur sayı", stirD: "xamut diametri",
  stirSpacing: "xamut addımı", meshD: "tor armatur diametri", meshSpacing: "tor addımı", layers: "tor qatı", cover: "beton örtüyü", segments: "seqmentlər",
};
export const paramLabel = (k: string) => LABEL[k] ?? k;

/** Status of a result from the sources of the parameters it used. */
function statusOf(ps: (Param | undefined)[]): ItemStatus {
  if (ps.some((p) => !p || p.value == null || p.source === "missing")) return ps.some((p) => p?.source === "engineer") ? "engineer" : "missing";
  if (ps.some((p) => p!.source === "engineer")) return "engineer";
  if (ps.some((p) => p!.source === "assumed")) return "estimated";
  if (ps.some((p) => p!.source === "user")) return "user";
  if (ps.every((p) => p!.source === "list")) return "list";
  return "drawing";
}
const worst = (a: ItemStatus, b: ItemStatus): ItemStatus => {
  const order: ItemStatus[] = ["engineer", "missing", "estimated", "user", "list", "drawing", "manual"];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
};
const v = (p: Param | undefined) => (p && p.value != null && p.source !== "missing" && p.source !== "engineer" ? p.value : null);
const fmt = (x: number) => String(round(x, 3)).replace(".", ",");

/* --------------------------------------------------------------- concrete */

export function concreteOf(e: Element): Breakdown {
  const p = e.params;
  switch (e.type) {
    case "strip_foundation": {
      const segs = e.segments ?? [];
      const w = v(p.width), h = v(p.height), j = v(p.junctions) ?? 0;
      const st = statusOf([p.width, p.height, segs.length ? { value: 1, source: p.segments?.source ?? "drawing" } : undefined, p.junctions ?? { value: 0, source: "assumed" }]);
      if (w == null || h == null || !segs.length) return { element: e.name, type: e.type, part: "beton", formula: "Σ(seqment uzunluğu) × en × hündürlük − kəsişmələr", value: null, unit: "m³", status: st === "drawing" ? "missing" : st };
      const L = segs.reduce((s, x) => s + x, 0);
      const gross = L * w * h, overlap = j * w * w * h;
      return { element: e.name, type: e.type, part: "beton", unit: "m³", status: st, value: round(gross - overlap),
        formula: `(${segs.map(fmt).join(" + ")}) = ${fmt(L)} m × ${fmt(w)} × ${fmt(h)} = ${fmt(gross)} m³; kəsişmələr: ${fmt(j)} × ${fmt(w)} × ${fmt(w)} × ${fmt(h)} = ${fmt(overlap)} m³ çıxılır` };
    }
    case "column": {
      const n = v(p.count), a = v(p.width), b = v(p.depth), h = v(p.height);
      const st = statusOf([p.count, p.width, p.depth, p.height]);
      return { element: e.name, type: e.type, part: "beton", unit: "m³", status: st, value: n == null || a == null || b == null || h == null ? null : round(n * a * b * h),
        formula: `say × en × dərinlik × hündürlük${n != null && a != null && b != null && h != null ? ` = ${fmt(n)} × ${fmt(a)} × ${fmt(b)} × ${fmt(h)}` : ""}` };
    }
    case "beam": {
      const n = v(p.count) ?? null, L = v(p.length), b = v(p.width), h = v(p.height);
      const st = statusOf([p.count, p.length, p.width, p.height]);
      return { element: e.name, type: e.type, part: "beton", unit: "m³", status: st, value: n == null || L == null || b == null || h == null ? null : round(n * L * b * h),
        formula: `say × uzunluq (kolonlar arası) × en × hündürlük (plitədən aşağı)${n != null && L != null && b != null && h != null ? ` = ${fmt(n)} × ${fmt(L)} × ${fmt(b)} × ${fmt(h)}` : ""}` };
    }
    case "slab": {
      const A = v(p.area) ?? (v(p.length) != null && v(p.width) != null ? v(p.length)! * v(p.width)! : null);
      const t = v(p.thickness), o = v(p.openings) ?? 0;
      const st = statusOf([p.area?.value != null ? p.area : p.length, ...(p.area?.value != null ? [] : [p.width]), p.thickness]);
      return { element: e.name, type: e.type, part: "beton", unit: "m³", status: st, value: A == null || t == null ? null : round((A - o) * t),
        formula: `(sahə − boşluqlar) × qalınlıq${A != null && t != null ? ` = (${fmt(A)} − ${fmt(o)}) × ${fmt(t)}` : ""}` };
    }
    case "wall": {
      const L = v(p.length), h = v(p.height), t = v(p.thickness), o = v(p.openings) ?? 0;
      const st = statusOf([p.length, p.height, p.thickness]);
      return { element: e.name, type: e.type, part: "beton", unit: "m³", status: st, value: L == null || h == null || t == null ? null : round((L * h - o) * t),
        formula: `(uzunluq × hündürlük − boşluqlar) × qalınlıq${L != null && h != null && t != null ? ` = (${fmt(L)} × ${fmt(h)} − ${fmt(o)}) × ${fmt(t)}` : ""}` };
    }
    default: {
      const V = v(p.volume);
      return { element: e.name, type: e.type, part: "beton", unit: "m³", status: statusOf([p.volume]), value: V == null ? null : round(V), formula: "verilmiş həcm" };
    }
  }
}

/* ------------------------------------------------------------------ rebar */

/** Length of one continuous bar run including lap splices every stock length. */
export function withLaps(run: number, d: number, s: Settings) {
  const laps = Math.max(0, Math.ceil(run / s.stockLength) - 1);
  return { length: run + laps * s.lapD * d / 1000, laps };
}

export function rebarOf(e: Element, s: Settings): RebarLine[] {
  const p = e.params, out: RebarLine[] = [];
  const cover = v(p.cover) ?? s.cover;
  const line = (part: string, dP: Param | undefined, count: number | null, each: number | null, formula: string, deps: (Param | undefined)[]) => {
    const d = v(dP);
    const st = statusOf([dP, ...deps]);
    const totalM = d != null && count != null && each != null ? round(count * each, 2) : null;
    out.push({ element: e.name, part, d: d ?? 0, count, lengthEach: each == null ? null : round(each, 3), totalM, kgPerM: d ? round(kgPerM(d), 4) : 0, kg: totalM != null && d ? round(totalM * kgPerM(d), 2) : null, formula, status: d == null ? (st === "engineer" ? "engineer" : "missing") : st });
  };
  const longCount = v(p.longCount), longD = v(p.longD), stirD = v(p.stirD), stirS = v(p.stirSpacing);
  const hasLong = !!(p.longD || p.longCount), hasStir = !!(p.stirD || p.stirSpacing);
  switch (e.type) {
    case "strip_foundation": {
      const segs = e.segments ?? [], L = segs.reduce((a, b) => a + b, 0), w = v(p.width), h = v(p.height), j = v(p.junctions) ?? 0;
      if (hasLong) {
        const each = longD != null && L ? withLaps(L, longD, s).length + j * s.anchorD * longD / 1000 : null;
        line("uzununa", p.longD, longCount, each, `say × (ümumi uzunluq ${fmt(L)} m + üst-üstə düşmə ${s.lapD}d hər ${s.stockLength} m-dən bir + kəsişmələrdə ankerləmə ${fmt(j)} × ${s.anchorD}d)`, [p.longCount, p.segments ?? { value: segs.length || null, source: segs.length ? "drawing" : "missing" }]);
      }
      if (hasStir) {
        const n = stirS != null && L ? Math.ceil(L / stirS) + segs.length : null;
        const each = w != null && h != null && stirD != null ? 2 * (w - 2 * cover) + 2 * (h - 2 * cover) + s.hookD * stirD / 1000 : null;
        line("xamut", p.stirD, n, each, `say = uzunluq / addım + seqment sayı; bir xamut = 2(en − 2·örtük) + 2(hünd. − 2·örtük) + ${s.hookD}d`, [p.stirSpacing, p.width, p.height]);
      }
      break;
    }
    case "column": {
      const n = v(p.count), h = v(p.height), a = v(p.width), b = v(p.depth);
      if (hasLong) line("uzununa", p.longD, n != null && longCount != null ? n * longCount : null, h != null && longD != null ? h + s.anchorD * longD / 1000 : null, `kolon sayı × çubuq sayı × (hündürlük + ankerləmə ${s.anchorD}d)`, [p.count, p.longCount, p.height]);
      if (hasStir) line("xamut", p.stirD, n != null && h != null && stirS != null ? n * (Math.ceil(h / stirS) + 1) : null, a != null && b != null && stirD != null ? 2 * (a - 2 * cover) + 2 * (b - 2 * cover) + s.hookD * stirD / 1000 : null, `kolon sayı × (hündürlük / addım + 1); bir xamut = perimetr − örtük + ${s.hookD}d`, [p.count, p.height, p.stirSpacing, p.width, p.depth]);
      break;
    }
    case "beam": {
      const n = v(p.count), L = v(p.length), b = v(p.width), h = v(p.height);
      if (hasLong) line("uzununa", p.longD, n != null && longCount != null ? n * longCount : null, L != null && longD != null ? withLaps(L, longD, s).length + 2 * s.anchorD * longD / 1000 : null, `tir sayı × çubuq sayı × (uzunluq + 2 × ankerləmə ${s.anchorD}d + üst-üstə düşmə)`, [p.count, p.longCount, p.length]);
      if (hasStir) line("xamut", p.stirD, n != null && L != null && stirS != null ? n * (Math.ceil(L / stirS) + 1) : null, b != null && h != null && stirD != null ? 2 * (b - 2 * cover) + 2 * (h - 2 * cover) + s.hookD * stirD / 1000 : null, `tir sayı × (uzunluq / addım + 1); bir xamut = perimetr − örtük + ${s.hookD}d`, [p.count, p.length, p.stirSpacing, p.width, p.height]);
      break;
    }
    case "slab":
    case "wall": {
      if (!(p.meshD || p.meshSpacing)) break;
      const d = v(p.meshD), sp = v(p.meshSpacing), layers = v(p.layers);
      let A: number | null, label: string;
      if (e.type === "slab") { const a0 = v(p.area) ?? (v(p.length) != null && v(p.width) != null ? v(p.length)! * v(p.width)! : null); A = a0 == null ? null : a0 - (v(p.openings) ?? 0); label = "plitənin sahəsi"; }
      else { A = v(p.length) != null && v(p.height) != null ? v(p.length)! * v(p.height)! - (v(p.openings) ?? 0) : null; label = "divarın sahəsi"; }
      // Per layer two directions: 1/spacing metres of bar per m² each; laps as a share of stock length.
      const lapFactor = d != null ? 1 + (s.lapD * d / 1000) / s.stockLength : 1;
      const total = A != null && sp != null && layers != null && d != null ? A * layers * 2 / sp * lapFactor : null;
      out.push({ element: e.name, part: "tor", d: d ?? 0, count: null, lengthEach: null, totalM: total == null ? null : round(total, 2), kgPerM: d ? round(kgPerM(d), 4) : 0,
        kg: total != null && d ? round(total * kgPerM(d), 2) : null, status: statusOf([p.meshD, p.meshSpacing, p.layers, e.type === "slab" ? (p.area?.value != null ? p.area : p.length) : p.length]) === "drawing" ? "estimated" : statusOf([p.meshD, p.meshSpacing, p.layers]),
        formula: `${label} × qat sayı × 2 istiqamət / addım × (1 + üst-üstə düşmə ${s.lapD}d / ${s.stockLength} m) — çubuqların düzülüşü çertyojdan dəqiqləşdirilməlidir` });
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ formwork */

export function formworkOf(e: Element): Breakdown {
  const p = e.params;
  switch (e.type) {
    case "strip_foundation": {
      const segs = e.segments ?? [], L = segs.reduce((a, b) => a + b, 0), h = v(p.height);
      return { element: e.name, type: e.type, part: "qəlib", unit: "m²", status: statusOf([p.height, segs.length ? { value: 1, source: p.segments?.source ?? "drawing" } : undefined]), value: h == null || !L ? null : round(2 * L * h),
        formula: `2 tərəf × uzunluq × hündürlük${h != null && L ? ` = 2 × ${fmt(L)} × ${fmt(h)}` : ""}` };
    }
    case "column": {
      const n = v(p.count), a = v(p.width), b = v(p.depth), h = v(p.height);
      return { element: e.name, type: e.type, part: "qəlib", unit: "m²", status: statusOf([p.count, p.width, p.depth, p.height]), value: n == null || a == null || b == null || h == null ? null : round(n * 2 * (a + b) * h),
        formula: "say × perimetr × hündürlük" };
    }
    case "beam": {
      const n = v(p.count), L = v(p.length), b = v(p.width), h = v(p.height);
      return { element: e.name, type: e.type, part: "qəlib", unit: "m²", status: statusOf([p.count, p.length, p.width, p.height]), value: n == null || L == null || b == null || h == null ? null : round(n * L * (b + 2 * h)),
        formula: "say × uzunluq × (alt + 2 yan)" };
    }
    case "slab": {
      const A = v(p.area) ?? (v(p.length) != null && v(p.width) != null ? v(p.length)! * v(p.width)! : null);
      return { element: e.name, type: e.type, part: "qəlib", unit: "m²", status: statusOf([p.area?.value != null ? p.area : p.length, p.thickness]), value: A == null ? null : round(A - (v(p.openings) ?? 0)),
        formula: "plitənin alt səthi (sahə − boşluqlar); kənar lövhələr daxil deyil" };
    }
    case "wall": {
      const L = v(p.length), h = v(p.height);
      return { element: e.name, type: e.type, part: "qəlib", unit: "m²", status: statusOf([p.length, p.height]), value: L == null || h == null ? null : round(2 * (L * h - (v(p.openings) ?? 0))),
        formula: "2 üz × (uzunluq × hündürlük − boşluqlar)" };
    }
    default: return { element: e.name, type: e.type, part: "qəlib", unit: "m²", status: "missing", value: null, formula: "Bu element üçün qəlib sahəsini daxil edin" };
  }
}

/* ------------------------------------------------------------------- the estimate */

const TYPE_CONCRETE: Record<ElementType, string> = {
  strip_foundation: "Fundament betonu", beam: "Rigel betonu", column: "Kolon betonu", slab: "Monolit döşəmə betonu", wall: "Beton divar", other_concrete: "Digər beton elementlər",
};

export interface ManualItem { key: string; name: string; category: Category; qty: number | null; unit: string; source: "manual" | "list"; note?: string }
export interface EstimateDoc {
  settings: Settings;
  elements: Element[];
  norms: Norms;
  manual: ManualItem[];
  /** quantity overrides by item key, with the person's reason */
  overrides: Record<string, { qty: number; reason?: string }>;
  prices: Record<string, number>;
  removed: string[];
  /** Only architectural drawings were found: rebar quantities need an engineer. */
  architecturalOnly?: boolean;
}

export interface EstimateResult {
  items: (Item & { unitPrice: number | null; amount: number | null; overridden: boolean; computedQty: number | null })[];
  concrete: Breakdown[];
  rebar: RebarLine[];
  formwork: Breakdown[];
  totals: { amount: number; pricedLines: number; unpricedLines: number; openLines: number; concreteM3: number; rebarKg: number; formworkM2: number };
  warnings: string[];
}

export function computeEstimate(doc: EstimateDoc): EstimateResult {
  const s = { ...DEFAULT_SETTINGS, ...doc.settings, plywood: { ...DEFAULT_SETTINGS.plywood, ...(doc.settings?.plywood ?? {}) } };
  const items: Item[] = [];
  const warnings: string[] = [];

  // Concrete per element type, summed; each element stays visible in the breakdown.
  const concrete = doc.elements.map(concreteOf);
  const byType = new Map<ElementType, Breakdown[]>();
  for (const c of concrete) byType.set(c.type, [...(byType.get(c.type) ?? []), c]);
  let concreteTotal = 0; let concreteStatus: ItemStatus = "drawing"; let anyConcrete = false;
  for (const [type, list] of byType) {
    const known = list.filter((c) => c.value != null);
    const status = list.reduce<ItemStatus>((a, c) => worst(a, c.status), "drawing");
    const qty = known.length === list.length ? round(known.reduce((a, c) => a + c.value!, 0)) : null;
    if (qty != null) concreteTotal += qty; else concreteStatus = worst(concreteStatus, status);
    concreteStatus = worst(concreteStatus, status);
    anyConcrete = true;
    items.push({ key: `concrete:${type}`, category: "concrete", name: TYPE_CONCRETE[type], qty, unit: "m³", status, formula: list.map((c) => `${c.element}: ${c.formula}`).join("\n"),
      inputs: list.map((c) => c.element), assumptions: type === "beam" ? ["Rigel uzunluğu kolonlar arası açıq aşırım, hündürlüyü plitədən aşağı hissə kimi götürülür — kəsişmələr iki dəfə sayılmır."] : type === "strip_foundation" ? ["Künc və T-birləşmələrdə seqmentlərin üst-üstə düşən hissəsi çıxılır."] : [] });
  }
  if (anyConcrete) {
    items.push({ key: "concrete:reserve", category: "concrete", name: `Texnoloji itki və sifariş ehtiyatı (${s.concreteReservePct}%)`, qty: concreteStatus === "missing" || concreteStatus === "engineer" ? null : round(concreteTotal * s.concreteReservePct / 100), unit: "m³", status: "estimated",
      formula: `konstruktiv həcm ${fmt(concreteTotal)} m³ × ${s.concreteReservePct}% — ayrıca göstərilir, yuxarıdakı həcmlərə əlavə edilməyib`, inputs: [], assumptions: ["Ehtiyat faizini parametrlərdə dəyişə bilərsiniz."], reserve: true });
  }

  // Rebar by diameter.
  const rebar = doc.elements.flatMap((e) => rebarOf(e, s));
  const byD = new Map<number, RebarLine[]>();
  for (const r of rebar) byD.set(r.d, [...(byD.get(r.d) ?? []), r]);
  let rebarKg = 0, rebarOpen = false;
  for (const [d, list] of [...byD.entries()].sort((a, b) => a[0] - b[0])) {
    let status = list.reduce<ItemStatus>((a, r) => worst(a, r.status), "drawing");
    if (doc.architecturalOnly && status !== "missing") status = "engineer";
    const known = list.every((r) => r.kg != null);
    const kg = known ? round(list.reduce((a, r) => a + r.kg!, 0), 1) : null;
    if (kg != null) rebarKg += kg; else rebarOpen = true;
    items.push({ key: `rebar:${d || "x"}`, category: "rebar", name: d ? `Armatur Ø${d} mm` : "Armatur (diametr məlum deyil)", qty: kg, unit: "kq", status,
      formula: `kütlə = uzunluq × d²/162 kq/m${d ? ` = uzunluq × ${fmt(kgPerM(d))} kq/m` : ""}\n` + list.map((r) => `${r.element} (${r.part}): ${r.formula}${r.totalM != null ? ` → ${fmt(r.totalM)} m` : ""}`).join("\n"),
      inputs: list.map((r) => `${r.element} ${r.part}`), assumptions: doc.architecturalOnly ? ["Yalnız memarlıq planı var: armatur konstruktiv çertyoj olmadan təxminidir — mühəndis yoxlamalıdır."] : [],
      extra: kg != null ? [{ label: "ton", value: round(kg / 1000, 3), unit: "t" }] : undefined });
  }
  if (rebar.length) {
    items.push({ key: "rebar:cut", category: "rebar", name: `Armatur kəsim itkisi (${s.rebarCutPct}%)`, qty: rebarOpen ? null : round(rebarKg * s.rebarCutPct / 100, 1), unit: "kq", status: "estimated",
      formula: `armatur cəmi ${fmt(rebarKg)} kq × ${s.rebarCutPct}% — ayrıca göstərilir`, inputs: [], assumptions: [], reserve: true });
  }

  // Formwork, plywood, timber.
  const formwork = doc.elements.map(formworkOf);
  const fwKnown = formwork.every((f) => f.value != null);
  const fwArea = round(formwork.reduce((a, f) => a + (f.value ?? 0), 0), 2);
  const fwStatus = formwork.reduce<ItemStatus>((a, f) => worst(a, f.status), "drawing");
  if (formwork.length) {
    items.push({ key: "formwork:area", category: "formwork", name: "Qəlib səthi", qty: fwKnown ? fwArea : null, unit: "m²", status: fwStatus, formula: formwork.map((f) => `${f.element}: ${f.formula}${f.value != null ? ` = ${fmt(f.value)} m²` : ""}`).join("\n"), inputs: [], assumptions: [] });
    const sheet = s.plywood.w * s.plywood.h;
    items.push({ key: "formwork:plywood", category: "formwork", name: `Dikt (faner) ${s.plywood.w}×${s.plywood.h} m${s.plywood.thicknessMm ? `, ${s.plywood.thicknessMm} mm` : ""}`, qty: fwKnown ? Math.ceil(fwArea / s.formworkUses / sheet) : null, unit: "vərəq", status: s.plywood.thicknessMm ? fwStatus : worst(fwStatus, "missing"),
      formula: `qəlib səthi ${fmt(fwArea)} m² / ${s.formworkUses} istifadə / vərəq ${fmt(sheet)} m² (yuxarı yuvarlaqlaşdırılır)`, inputs: [], assumptions: s.plywood.thicknessMm ? [] : ["Diktin qalınlığı seçilməyib."], extra: fwKnown ? [{ label: "sahə", value: round(fwArea / s.formworkUses, 2), unit: "m²" }] : undefined });
    for (const [k, w, t, name] of [["board3x10PerM2", 0.03, 0.10, "Taxta 3×10 sm"], ["board5x10PerM2", 0.05, 0.10, "Taxta 5×10 sm"]] as const) {
      const norm = doc.norms?.[k];
      const lengthM = norm != null && fwKnown ? fwArea / s.formworkUses * norm : null;
      const pieces = lengthM == null ? null : Math.ceil(lengthM / s.boardLength);
      items.push({ key: `timber:${k}`, category: "timber", name, qty: pieces, unit: "ədəd", status: norm == null ? "missing" : fwKnown ? "user" : fwStatus,
        formula: norm == null ? "Norma lazımdır: 1 m² qəlibə neçə metr taxta düşür (usta və ya mühəndis müəyyən edir)" : `qəlib səthi ${fmt(fwArea)} m² / ${s.formworkUses} × ${fmt(norm)} m/m² = ${fmt(lengthM ?? 0)} m / ${s.boardLength} m uzunluq`,
        inputs: [], assumptions: [], extra: pieces != null ? [{ label: "həcm", value: round(pieces * w * t * s.boardLength, 3), unit: "m³" }] : undefined });
    }
  }
  if (rebar.length) {
    for (const [k, name] of [["wirePerTon", "Yanmış məftil (bağlama)"], ["katinkaPerTon", "Katinka"]] as const) {
      const norm = doc.norms?.[k];
      items.push({ key: `other:${k}`, category: "other", name, qty: norm == null || rebarOpen ? null : round(rebarKg / 1000 * norm, 1), unit: "kq", status: norm == null ? "missing" : "user",
        formula: norm == null ? "Norma lazımdır: 1 ton armatura neçə kq (mühəndis və ya usta təsdiqləyir)" : `armatur ${fmt(rebarKg / 1000)} t × ${fmt(norm)} kq/t`, inputs: [], assumptions: [] });
    }
  }

  // Manual and engineer-list items.
  for (const m of doc.manual ?? []) items.push({ key: m.key, category: m.category, name: m.name, qty: m.qty, unit: m.unit, status: m.source === "list" ? "list" : "manual", formula: m.source === "list" ? "Mühəndisin material siyahısından" : "Əl ilə əlavə edilib", inputs: [], assumptions: m.note ? [m.note] : [] });

  const removed = new Set(doc.removed ?? []);
  const out = items.filter((i) => !removed.has(i.key)).map((i) => {
    const o = doc.overrides?.[i.key];
    const qty = o ? o.qty : i.qty;
    const unitPrice = doc.prices?.[i.key] ?? null;
    return { ...i, qty, computedQty: i.qty, overridden: !!o, status: o && i.status !== "manual" && i.status !== "list" ? "user" as ItemStatus : i.status,
      unitPrice, amount: qty != null && unitPrice != null ? Math.round(qty * unitPrice * 100) / 100 : null };
  });
  if (doc.architecturalOnly) warnings.push("Yalnız memarlıq planı yüklənib: armatur sərfiyyatı konstruktiv çertyoj olmadan dəqiq deyil.");
  const open = out.filter((i) => i.qty == null).length;
  if (open) warnings.push(`${open} sətir üçün məlumat çatışmır — “Dəqiqləşdirilməli məsələlər” bölməsinə baxın.`);
  return {
    items: out, concrete, rebar, formwork, warnings,
    totals: {
      amount: Math.round(out.reduce((a, i) => a + (i.amount ?? 0), 0) * 100) / 100,
      pricedLines: out.filter((i) => i.amount != null).length, unpricedLines: out.filter((i) => i.qty != null && i.unitPrice == null).length, openLines: open,
      concreteM3: round(concreteTotal), rebarKg: round(rebarKg, 1), formworkM2: fwArea,
    },
  };
}

/* --------------------------------------------------------- what to ask */

export interface Question {
  id: string;            // `${elementId}.${param}` or `settings.x` / `norms.x`
  elementId: string | null;
  param: string;
  text: string;
  unit: string;
  options: { label: string; value: number }[];
  why: string;
  current: Param | null;
}

const OPTIONS: Record<string, { unit: string; values: number[]; scale?: number; suffix?: string }> = {
  width: { unit: "sm", values: [40, 50, 60], scale: 0.01 },
  height: { unit: "sm", values: [60, 80, 100], scale: 0.01 },
  depth: { unit: "sm", values: [30, 40, 50], scale: 0.01 },
  thickness: { unit: "sm", values: [15, 18, 20], scale: 0.01 },
  longD: { unit: "mm", values: [12, 14, 16, 18] },
  stirD: { unit: "mm", values: [8, 10] },
  meshD: { unit: "mm", values: [10, 12, 14] },
  stirSpacing: { unit: "sm", values: [15, 20, 25], scale: 0.01 },
  meshSpacing: { unit: "sm", values: [15, 20, 25], scale: 0.01 },
  longCount: { unit: "ədəd", values: [4, 6, 8] },
  layers: { unit: "qat", values: [1, 2] },
  count: { unit: "ədəd", values: [] },
  length: { unit: "m", values: [] },
  area: { unit: "m²", values: [] },
  junctions: { unit: "ədəd", values: [0, 4, 6, 8] },
};
const REQUIRED: Record<ElementType, string[]> = {
  strip_foundation: ["width", "height", "junctions"], column: ["count", "width", "depth", "height"], beam: ["count", "length", "width", "height"],
  slab: ["thickness"], wall: ["length", "height", "thickness"], other_concrete: ["volume"],
};
const REBAR_PARAMS: Record<ElementType, string[]> = {
  strip_foundation: ["longD", "longCount", "stirD", "stirSpacing"], column: ["longD", "longCount", "stirD", "stirSpacing"], beam: ["longD", "longCount", "stirD", "stirSpacing"],
  slab: ["meshD", "meshSpacing", "layers"], wall: ["meshD", "meshSpacing", "layers"], other_concrete: [],
};
const ELEMENT_WORD: Record<ElementType, string> = { strip_foundation: "Fundamentin", column: "Kolonların", beam: "Rigellərin", slab: "Monolit döşəmənin", wall: "Beton divarın", other_concrete: "Elementin" };
const QUESTION_TEXT: Record<string, (el: string) => string> = {
  width: (el) => `${el} eni çertyojda aydın görünmür. Hansı ölçüdən istifadə edək?`,
  height: (el) => `${el} hündürlüyü neçə santimetrdir?`,
  depth: (el) => `${el} kəsiyinin ikinci ölçüsü neçə santimetrdir?`,
  thickness: (el) => `${el} qalınlığı neçə santimetrdir?`,
  longD: (el) => `${el} uzununa armaturunda hansı diametr nəzərdə tutulub?`,
  longCount: (el) => `${el} kəsiyində neçə uzununa armatur çubuğu var?`,
  stirD: (el) => `${el} xamutlarının diametri nədir?`,
  stirSpacing: (el) => `${el} xamut addımı neçə santimetrdir?`,
  meshD: (el) => `${el} armatur torunun diametri nədir?`,
  meshSpacing: (el) => `${el} armaturunun addımı neçə santimetrdir?`,
  layers: (el) => `${el} armaturu neçə qatdır (aşağı / yuxarı)?`,
  count: (el) => `${el} sayı neçədir?`,
  length: (el) => `${el} uzunluğu neçə metrdir?`,
  junctions: (el) => `${el} neçə künc və T-birləşməsi var? (beton iki dəfə sayılmasın deyə)`,
  volume: (el) => `${el} betonunun həcmi neçə m³-dir?`,
};

/**
 * Questions only for what changes the result and could not be read reliably:
 * missing values, low-confidence readings, and parameters the engineer should confirm.
 */
export function questionsFor(doc: EstimateDoc, answered: Set<string> = new Set()): Question[] {
  const out: Question[] = [];
  for (const e of doc.elements) {
    const word = ELEMENT_WORD[e.type];
    const params = [...REQUIRED[e.type], ...(REBAR_PARAMS[e.type].some((k) => e.params[k]) ? REBAR_PARAMS[e.type] : [])];
    if (e.type === "slab" && !(e.params.area?.value != null) && !(e.params.length?.value != null && e.params.width?.value != null)) params.unshift("area");
    if (e.type === "strip_foundation" && !(e.segments?.length)) out.push({ id: `${e.id}.segments`, elementId: e.id, param: "segments", text: "Fundament seqmentlərinin uzunluqlarını yazın (metr, vergüllə ayırın).", unit: "m", options: [], why: "Beton və qəlib uzunluqdan hesablanır.", current: null });
    for (const k of params) {
      const p = e.params[k];
      const weak = !p || p.value == null || p.source === "missing" || (p.source === "assumed" && p.note !== "İstifadəçi bilmir") || (p.source === "drawing" && (p.confidence ?? 1) < 0.6);
      if (!weak || p?.source === "engineer" || answered.has(`${e.id}.${k}`)) continue;
      const o = OPTIONS[k] ?? { unit: "", values: [] };
      out.push({ id: `${e.id}.${k}`, elementId: e.id, param: k, text: (QUESTION_TEXT[k] ?? ((el: string) => `${el} ${paramLabel(k)}?`))(word) + (doc.elements.filter((x) => x.type === e.type).length > 1 ? ` (${e.name})` : ""), unit: o.unit,
        options: o.values.map((x) => ({ label: `${x} ${o.unit}`, value: o.scale ? round(x * o.scale, 4) : x })), why: p?.value != null ? `Çertyojdan oxunan dəyər (${p.value}) etibarlı deyil.` : "Bu ölçü olmadan sətir hesablanmır.", current: p ?? null });
    }
  }
  const s = doc.settings ?? DEFAULT_SETTINGS;
  if (doc.elements.length && !s.plywood?.thicknessMm && !answered.has("settings.plywoodThickness")) out.push({ id: "settings.plywoodThickness", elementId: null, param: "plywoodThickness", text: "Qəlib üçün hansı qalınlıqda dikt istifadə ediləcək?", unit: "mm", options: [18, 21].map((x) => ({ label: `${x} mm`, value: x })), why: "Diktin növü və qiyməti qalınlıqdan asılıdır.", current: null });
  for (const [k, text, opts] of [
    ["board3x10PerM2", "1 m² qəlibə neçə metr 3×10 sm taxta düşür? (usta və ya mühəndisin norması)", []],
    ["board5x10PerM2", "1 m² qəlibə neçə metr 5×10 sm taxta düşür?", []],
    ["wirePerTon", "1 ton armatura neçə kq yanmış məftil götürülür?", []],
  ] as [keyof Norms, string, number[]][]) {
    if (!doc.elements.length || doc.norms?.[k] != null || answered.has(`norms.${k}`)) continue;
    out.push({ id: `norms.${k}`, elementId: null, param: k, text, unit: k === "wirePerTon" ? "kq/t" : "m/m²", options: opts.map((x) => ({ label: String(x), value: x })), why: "Sistem bu normanı özbaşına götürmür; bilmirsinizsə, sətir “Dəqiqləşdirilməlidir” qalır.", current: null });
  }
  return out;
}
