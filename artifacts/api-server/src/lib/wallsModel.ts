/*
 * "Hörgü və suvaq (çertyojdan)": floors → walls → openings read from drawings, checked by the person.
 * Every value carries where it came from. Nothing unconfirmed is treated as final: a floor can only be confirmed when
 * none of its values is missing or merely assumed, and results stay "ilkin" until every floor is confirmed.
 * Lengths and heights in metres.
 */

export type WSource = "drawing" | "assumed" | "missing" | "user";
export interface WParam { value: number | null; source: WSource; confidence?: number; where?: string; page?: number; how?: "dimension" | "scale" | "note" | "user" }
export interface WOpening { id: string; kind: "door" | "window"; count: WParam; width: WParam; height: WParam }
export type WallKind = "external" | "internal" | "partition";
export interface WWall { id: string; name: string; kind: WallKind; length: WParam; thickness: WParam; junctions: WParam; openings: WOpening[]; origin: "ai" | "user" }
export interface WFloor { id: string; name: string; level: number; floorHeight: WParam; slabThickness: WParam; walls: WWall[]; confirmed: boolean; confirmedAt?: string | null }
export interface WallsDoc {
  floors: WFloor[];
  /** Selected PDF pages per file id (1-based). */
  pages: Record<string, number[]>;
  drawingKinds: string[]; scaleNote: string | null; unreadable: string[]; notes: string | null; analyzedAt: string | null;
  /** Stage 2: materials and mortar chosen by the person (see wallsCalc.ts). */
  masonry?: import("./wallsCalc").MasonrySettings;
  /** Stage 3: plaster sides, thickness and mix (see wallsPlaster.ts). */
  plaster?: import("./wallsPlaster").PlasterSettings;
}
export const emptyWalls = (): WallsDoc => ({ floors: [], pages: {}, drawingKinds: [], scaleNote: null, unreadable: [], notes: null, analyzedAt: null });

/** Plausible ranges (m / count). A value outside is not trusted: it becomes "missing" and is asked for. */
export const W_RANGE = {
  floorHeight: [2, 6], slabThickness: [0, 0.5], length: [0.2, 100], thickness: [0.05, 1], junctions: [0, 20],
  count: [1, 50], width: [0.3, 6], height: [0.3, 4],
} as const;
type RangeKey = keyof typeof W_RANGE;
export const KIND_LABEL: Record<WallKind, string> = { external: "Xarici divar", internal: "Daxili divar", partition: "Arakəsmə" };
export const PARAM_LABEL: Record<string, string> = {
  floorHeight: "Mərtəbə hündürlüyü (döşəmədən döşəməyə)", slabThickness: "Döşəmə plitəsinin qalınlığı", length: "Uzunluq", thickness: "Qalınlıq",
  junctions: "Kəsişmələr (bitişik divarlar)", count: "Say", width: "En", height: "Hündürlük",
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
const str = (v: unknown, n = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const conf = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? Math.round(v * 100) / 100 : 0);
const inRange = (k: RangeKey, v: number) => v >= W_RANGE[k][0] && v <= W_RANGE[k][1];

/** One AI reading → parameter. Low confidence = "assumed" (asked about); implausible = "missing". */
export function readParam(k: RangeKey, raw: unknown): WParam {
  const r = (raw ?? {}) as Record<string, unknown>;
  const v = num(r.value);
  const how = r.how === "dimension" || r.how === "scale" || r.how === "note" ? r.how : undefined;
  const page = typeof r.page === "number" && r.page >= 1 && r.page <= 500 ? Math.round(r.page) : undefined;
  const where = str(r.where, 120) ?? undefined;
  if (v == null || !inRange(k, k === "count" || k === "junctions" ? Math.round(v) : v)) return { value: null, source: "missing", ...(v != null ? { where: `oxunan ${v} etibarlı deyil${where ? ` · ${where}` : ""}` } : where ? { where } : {}), page };
  const c = conf(r.confidence);
  // A size taken from the drawing's scale is never "read": it is at most an assumption to confirm.
  const source: WSource = c >= 0.6 && how !== "scale" ? "drawing" : "assumed";
  return { value: k === "count" || k === "junctions" ? Math.round(v) : Math.round(v * 1000) / 1000, source, confidence: c, where, page, how };
}

let seq = 0;
const id = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface WallsReading {
  drawingKinds: string[]; scaleNote: string | null; unreadable: string[]; notes: string | null;
  floors: { name: string; level: number; floorHeight: WParam; slabThickness: WParam; walls: { name: string; kind: WallKind; length: WParam; thickness: WParam; junctions: WParam; openings: { kind: "door" | "window"; count: WParam; width: WParam; height: WParam }[] }[] }[];
}

/** Never trust the model's shape: keep only well-formed values. */
export function sanitizeWalls(raw: Record<string, unknown>): WallsReading {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    drawingKinds: arr(raw.drawingKinds).map((k) => str(k, 40)).filter((k): k is string => !!k).slice(0, 20),
    scaleNote: str(raw.scaleNote, 120), notes: str(raw.notes, 1000),
    unreadable: arr(raw.unreadable).map((u) => str(u, 120)).filter((u): u is string => !!u).slice(0, 40),
    floors: arr(raw.floors).slice(0, 10).map((f0, fi) => {
      const f = (f0 ?? {}) as Record<string, unknown>;
      return {
        name: str(f.name, 60) ?? `${fi + 1}-ci mərtəbə`, level: Math.max(-2, Math.min(20, Math.round(num(f.level) ?? fi))),
        floorHeight: readParam("floorHeight", f.floorHeight), slabThickness: readParam("slabThickness", f.slabThickness),
        walls: arr(f.walls).slice(0, 200).map((w0, wi) => {
          const w = (w0 ?? {}) as Record<string, unknown>;
          const kind: WallKind = w.kind === "external" || w.kind === "internal" || w.kind === "partition" ? w.kind : "internal";
          return {
            name: str(w.name, 80) ?? `Divar ${wi + 1}`, kind,
            length: readParam("length", w.length), thickness: readParam("thickness", w.thickness), junctions: readParam("junctions", w.junctions ?? { value: 0, confidence: 1, how: "dimension" }),
            openings: arr(w.openings).slice(0, 50).map((o0) => {
              const o = (o0 ?? {}) as Record<string, unknown>;
              return { kind: o.kind === "door" ? "door" as const : "window" as const, count: readParam("count", o.count ?? { value: 1, confidence: 1, how: "note" }), width: readParam("width", o.width), height: readParam("height", o.height) };
            }),
          };
        }),
      };
    }),
  };
}

const keep = (old: WParam | undefined, fresh: WParam) => (old && old.source === "user" ? old : fresh);
/**
 * Reading → model, keeping what the person decided: values they typed, walls they added, confirmed floors stay
 * as they are only if nothing new came in for them (a changed AI value un-confirms the floor).
 */
export function mergeWalls(prev: WallsDoc, r: WallsReading): WallsDoc {
  const floors: WFloor[] = r.floors.map((f, fi) => {
    const old = prev.floors[fi];
    const walls: WWall[] = f.walls.map((w, wi) => {
      const ow = old?.walls.filter((x) => x.origin === "ai")[wi];
      return {
        id: ow?.id ?? id("w"), name: ow && ow.name !== w.name && ow.origin === "ai" ? w.name : ow?.name ?? w.name, kind: ow?.kind ?? w.kind, origin: "ai",
        length: keep(ow?.length, w.length), thickness: keep(ow?.thickness, w.thickness), junctions: keep(ow?.junctions, w.junctions),
        openings: w.openings.map((o, oi) => { const oo = ow?.openings[oi]; return { id: oo?.id ?? id("o"), kind: oo?.kind ?? o.kind, count: keep(oo?.count, o.count), width: keep(oo?.width, o.width), height: keep(oo?.height, o.height) }; }),
      };
    });
    for (const uw of old?.walls.filter((x) => x.origin === "user") ?? []) walls.push(uw);
    const floor: WFloor = { id: old?.id ?? id("f"), name: old?.name ?? f.name, level: f.level, floorHeight: keep(old?.floorHeight, f.floorHeight), slabThickness: keep(old?.slabThickness, f.slabThickness), walls, confirmed: false, confirmedAt: null };
    floor.confirmed = !!old?.confirmed && JSON.stringify(stripFloor(old)) === JSON.stringify(stripFloor(floor));
    floor.confirmedAt = floor.confirmed ? old!.confirmedAt ?? null : null;
    return floor;
  });
  // Floors the person added by hand beyond what the drawing showed stay.
  for (const f of prev.floors.slice(r.floors.length)) if (f.walls.every((w) => w.origin === "user")) floors.push(f);
  return { ...prev, floors, drawingKinds: r.drawingKinds, scaleNote: r.scaleNote, unreadable: r.unreadable, notes: r.notes, analyzedAt: new Date().toISOString() };
}
/** What a confirmation vouches for: values and where they came from, not ids, page notes or key order. */
const sig = (p: WParam) => [p.value, p.source];
const stripFloor = (f: WFloor) => [f.name, f.level, sig(f.floorHeight), sig(f.slabThickness),
  f.walls.map((w) => [w.name, w.kind, w.origin, sig(w.length), sig(w.thickness), sig(w.junctions), w.openings.map((o) => [o.kind, sig(o.count), sig(o.width), sig(o.height)])])];

/** What still blocks a floor: missing or assumed values, impossible geometry. */
export function floorIssues(f: WFloor): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const check = (path: string, label: string, p: WParam, k: RangeKey) => {
    if (p.value == null || p.source === "missing") out.push({ path, text: `${label}: ölçü yoxdur — yazın` });
    else if (!inRange(k, p.value)) out.push({ path, text: `${label}: ${p.value} etibarlı deyil` });
    else if (p.source === "assumed") out.push({ path, text: `${label}: ${p.value} təxminidir — təsdiqləyin və ya düzəldin` });
  };
  check("floorHeight", `${f.name} · ${PARAM_LABEL.floorHeight}`, f.floorHeight, "floorHeight");
  check("slabThickness", `${f.name} · ${PARAM_LABEL.slabThickness}`, f.slabThickness, "slabThickness");
  if (f.floorHeight.value != null && f.slabThickness.value != null && f.floorHeight.value - f.slabThickness.value <= 1.5) out.push({ path: "floorHeight", text: `${f.name}: hörgü hündürlüyü (mərtəbə − plitə) çox kiçikdir` });
  if (!f.walls.length) out.push({ path: "walls", text: `${f.name}: divar yoxdur — əlavə edin və ya mərtəbəni silin` });
  for (const w of f.walls) {
    const base = `${f.name} · ${w.name}`;
    check(`${w.id}.length`, `${base} · uzunluq`, w.length, "length");
    check(`${w.id}.thickness`, `${base} · qalınlıq`, w.thickness, "thickness");
    check(`${w.id}.junctions`, `${base} · kəsişmələr`, w.junctions, "junctions");
    for (const [i, o] of w.openings.entries()) {
      const ob = `${base} · ${o.kind === "door" ? "qapı" : "pəncərə"} ${i + 1}`;
      check(`${o.id}.count`, `${ob} · say`, o.count, "count");
      check(`${o.id}.width`, `${ob} · en`, o.width, "width");
      check(`${o.id}.height`, `${ob} · hündürlük`, o.height, "height");
    }
    const h = f.floorHeight.value != null && f.slabThickness.value != null ? f.floorHeight.value - f.slabThickness.value : null;
    if (w.length.value != null && h != null) {
      const open = w.openings.reduce((s, o) => s + (o.count.value ?? 0) * (o.width.value ?? 0) * (o.height.value ?? 0), 0);
      if (open >= w.length.value * h) out.push({ path: `${w.id}.openings`, text: `${base}: boşluqlar divarın sahəsindən böyükdür` });
      if (w.openings.some((o) => (o.width.value ?? 0) > w.length.value! || (o.height.value ?? 0) > h)) out.push({ path: `${w.id}.openings`, text: `${base}: boşluq divardan böyükdür` });
    }
  }
  return out;
}

/* ------------------------------------------------- person's edits (PUT) */

const paramIn = (raw: unknown): WParam => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const v = num(r.value);
  const source: WSource = r.source === "drawing" || r.source === "assumed" || r.source === "missing" || r.source === "user" ? r.source : "user";
  return { value: v, source: v == null ? "missing" : source, ...(typeof r.confidence === "number" ? { confidence: conf(r.confidence) } : {}), ...(str(r.where, 120) ? { where: str(r.where, 120)! } : {}), ...(typeof r.page === "number" ? { page: Math.round(r.page) } : {}), ...(r.how === "dimension" || r.how === "scale" || r.how === "note" || r.how === "user" ? { how: r.how } : {}) };
};
/** A value the client says came from the drawing but differs from what is stored is the person's. */
const reconcile = (incoming: WParam, stored: WParam | undefined): WParam => {
  if (incoming.source === "user" || incoming.source === "missing") return incoming.value == null ? { value: null, source: "missing" } : { ...incoming, source: "user", how: "user" };
  if (!stored || stored.value !== incoming.value || stored.source !== incoming.source) return incoming.value == null ? { value: null, source: "missing" } : { ...incoming, source: "user", how: "user" };
  return stored;
};

/** Validates the person's version of floors (from the review screen) against what is stored. */
export function applyEdit(prev: WallsDoc, rawFloors: unknown): { doc: WallsDoc; error?: string } {
  if (!Array.isArray(rawFloors) || rawFloors.length > 10) return { doc: prev, error: "Mərtəbələri yoxlayın (ən çox 10)" };
  const floors: WFloor[] = [];
  for (const [fi, f0] of rawFloors.entries()) {
    const f = (f0 ?? {}) as Record<string, unknown>;
    const old = prev.floors.find((x) => x.id === f.id);
    const walls0 = Array.isArray(f.walls) ? f.walls : [];
    if (walls0.length > 200) return { doc: prev, error: "Bir mərtəbədə ən çox 200 divar" };
    const walls: WWall[] = walls0.map((w0) => {
      const w = (w0 ?? {}) as Record<string, unknown>;
      const ow = old?.walls.find((x) => x.id === w.id);
      const op0 = Array.isArray(w.openings) ? w.openings.slice(0, 50) : [];
      return {
        id: typeof w.id === "string" && w.id.length <= 40 ? w.id : id("w"), name: str(w.name, 80) ?? "Divar",
        kind: w.kind === "external" || w.kind === "internal" || w.kind === "partition" ? w.kind : "internal", origin: ow?.origin ?? "user",
        length: reconcile(paramIn(w.length), ow?.length), thickness: reconcile(paramIn(w.thickness), ow?.thickness), junctions: reconcile(paramIn(w.junctions), ow?.junctions),
        openings: op0.map((o0) => {
          const o = (o0 ?? {}) as Record<string, unknown>;
          const oo = ow?.openings.find((x) => x.id === o.id);
          return { id: typeof o.id === "string" && o.id.length <= 40 ? o.id : id("o"), kind: o.kind === "door" ? "door" as const : "window" as const, count: reconcile(paramIn(o.count), oo?.count), width: reconcile(paramIn(o.width), oo?.width), height: reconcile(paramIn(o.height), oo?.height) };
        }),
      };
    });
    const floor: WFloor = {
      id: typeof f.id === "string" && f.id.length <= 40 ? f.id : id("f"), name: str(f.name, 60) ?? `${fi + 1}-ci mərtəbə`, level: Math.round(num(f.level) ?? fi),
      floorHeight: reconcile(paramIn(f.floorHeight), old?.floorHeight), slabThickness: reconcile(paramIn(f.slabThickness), old?.slabThickness),
      walls, confirmed: f.confirmed === true, confirmedAt: null,
    };
    if (floor.confirmed) {
      const issues = floorIssues(floor);
      if (issues.length) return { doc: prev, error: `${floor.name} təsdiqlənə bilməz: ${issues.slice(0, 3).map((i) => i.text).join("; ")}${issues.length > 3 ? ` və daha ${issues.length - 3}` : ""}` };
      floor.confirmedAt = old?.confirmed ? old.confirmedAt ?? new Date().toISOString() : new Date().toISOString();
    }
    floors.push(floor);
  }
  return { doc: { ...prev, floors } };
}

export function wallsState(d: WallsDoc) {
  const issues = d.floors.map((f) => ({ floorId: f.id, issues: floorIssues(f) }));
  const allConfirmed = d.floors.length > 0 && d.floors.every((f) => f.confirmed);
  return { issues, allConfirmed, openIssues: issues.reduce((s, x) => s + x.issues.length, 0) };
}
