import { AI_MODEL, aiConfigured, AiNotConfigured } from "./invoiceAi";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import type { Element, ElementType, Param, ParamMap } from "./estimateEngine";

/*
 * Drawing analysis service (Claude, server side): reads PDF drawings and images and returns structural elements
 * with the dimension, its confidence and where it was read. It only extracts — all arithmetic is done by
 * estimateEngine. Anything not readable is returned as missing and becomes a question to the person.
 */

const MAX_PDF = 25 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const TYPES: ElementType[] = ["strip_foundation", "column", "beam", "slab", "wall", "other_concrete"];
export const PARAM_KEYS = ["width", "height", "depth", "length", "thickness", "count", "area", "openings", "junctions", "volume", "longD", "longCount", "stirD", "stirSpacing", "meshD", "meshSpacing", "layers", "cover"] as const;
const REBAR_KEYS: Record<ElementType, string[]> = {
  strip_foundation: ["longD", "longCount", "stirD", "stirSpacing"], column: ["longD", "longCount", "stirD", "stirSpacing"], beam: ["longD", "longCount", "stirD", "stirSpacing"],
  slab: ["meshD", "meshSpacing", "layers"], wall: ["meshD", "meshSpacing", "layers"], other_concrete: [],
};

const reading = { type: "object", properties: { value: { type: ["number", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, where: { type: "string", description: "sheet / note / dimension line where it was read" } }, required: ["value", "confidence"] };
const TOOL = {
  name: "record_structure",
  description: "Record structural elements and dimensions read from the drawings. Use null for anything not shown. Never guess.",
  input_schema: {
    type: "object",
    properties: {
      drawingKinds: { type: "array", items: { type: "string", enum: ["architectural_plan", "structural_plan", "foundation_plan", "rebar_detail", "section", "elevation", "material_list", "sketch", "other"] } },
      scaleNote: { type: ["string", "null"] },
      totalAreaM2: { type: ["number", "null"] },
      floors: { type: ["number", "null"] },
      elements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: TYPES },
            name: { type: "string", description: "e.g. 'Lent fundament', 'K-1 kolonları', 'R-1 rigel', 'Döşəmə 1-ci mərtəbə'" },
            segments: { type: "array", items: reading, description: "strip foundation: length of each straight segment in metres" },
            params: {
              type: "object",
              description: "metres for sizes (width, height, depth, length, thickness, cover), m² for area/openings, m³ for volume, mm for diameters (longD, stirD, meshD), metres for spacing, plain numbers for count/longCount/layers/junctions",
              properties: Object.fromEntries(PARAM_KEYS.map((k) => [k, reading])),
            },
            notes: { type: ["string", "null"] },
          },
          required: ["type", "name", "params"],
        },
      },
      materialList: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: ["number", "null"] }, unit: { type: ["string", "null"] } }, required: ["name"] } },
      unreadable: { type: "array", items: { type: "string" } },
      notes: { type: ["string", "null"] },
    },
    required: ["drawingKinds", "elements", "unreadable"],
  },
};
const SYSTEM = `You read construction drawings of private houses in Azerbaijan (Azerbaijani / Russian labels, PDF or photos) and extract reinforced-concrete elements for a quantity estimate.
Rules:
- Extract only what the drawing shows: dimension lines, scale, sections, rebar notes (e.g. "4Ø16", "Ø8 a200"), tables. Never invent a value; use null when it is not shown and list it in "unreadable".
- Convert: mm/cm to metres for sizes and spacing; rebar diameters stay in mm. "Ø8 a200" means stirrups Ø8 at 0.20 m.
- Strip foundation: list each straight segment length (outer dimensions are fine) and count corners/T-joints in "junctions".
- Beams: length = clear span between columns; height = part below the slab.
- confidence: 1 = printed dimension, 0.6–0.8 = derived from scale, < 0.5 = unsure (prefer null).
- Say which drawing kinds you saw. If there is no structural / rebar drawing, do not fill rebar values from typical practice.
- Do not judge safety or code compliance.`;

async function readFile(objectPath: string, contentType: string) {
  const file = await new ObjectStorageService().getObjectEntityFile(objectPath);
  const [meta] = await file.getMetadata();
  const max = contentType === "application/pdf" ? MAX_PDF : MAX_IMAGE;
  if (Number(meta.size) > max) throw new Error(contentType === "application/pdf" ? "PDF 25 MB-dan böyükdür" : "Şəkil 5 MB-dan böyükdür — kiçildib yenidən yükləyin");
  const chunks: Buffer[] = [];
  for await (const c of file.createReadStream()) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("base64");
}

export interface DrawingResult {
  drawingKinds: string[]; scaleNote: string | null; totalAreaM2: number | null; floors: number | null;
  elements: { type: ElementType; name: string; segments: { value: number | null; confidence: number; where?: string }[]; params: Record<string, { value: number | null; confidence: number; where?: string }>; notes: string | null }[];
  materialList: { name: string; quantity: number | null; unit: string | null }[]; unreadable: string[]; notes: string | null;
}

export async function analyzeDrawings(files: { objectPath: string; contentType: string; name: string }[], focus: string[] = []): Promise<{ result: DrawingResult; model: string }> {
  if (!aiConfigured()) throw new AiNotConfigured("AI analizi hələ qoşulmayıb");
  const content: unknown[] = [];
  for (const f of files.slice(0, 8)) {
    const data = await readFile(f.objectPath, f.contentType);
    content.push(f.contentType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: f.name }
      : { type: "image", source: { type: "base64", media_type: f.contentType, data } });
  }
  content.push({ type: "text", text: `Extract the reinforced-concrete elements from these drawings.${focus.length ? ` The owner could not answer these; look for them specifically: ${focus.join("; ")}.` : ""}` });
  const model = AI_MODEL();
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM, tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name }, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "drawing AI request failed");
    throw new Error(res.status === 429 || res.status === 529 ? "AI xidməti hazırda məşğuldur, bir az sonra yenidən cəhd edin" : res.status === 413 ? "Fayllar AI üçün çox böyükdür" : "AI çertyoju oxuya bilmədi");
  }
  const json = await res.json() as { content?: { type: string; input?: unknown }[] };
  const input = json.content?.find((c) => c.type === "tool_use")?.input as Record<string, unknown> | undefined;
  if (!input) throw new Error("AI cavabı boşdur");
  return { result: sanitize(input), model };
}

const num = (v: unknown, max = 1e6) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
const conf = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? Math.round(v * 100) / 100 : 0);
const str = (v: unknown, n = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
/** Plausible ranges (metres / mm / counts) — a value outside them is treated as unreadable, not trusted. */
const RANGE: Record<string, [number, number]> = {
  width: [0.05, 5], height: [0.05, 20], depth: [0.05, 5], length: [0.1, 200], thickness: [0.04, 1.5], count: [1, 2000], area: [0.5, 50000], openings: [0, 50000],
  junctions: [0, 500], volume: [0.01, 10000], longD: [6, 40], stirD: [4, 20], meshD: [4, 32], longCount: [1, 200], stirSpacing: [0.04, 1], meshSpacing: [0.04, 1], layers: [1, 4], cover: [0.01, 0.15],
};

export function sanitize(raw: Record<string, unknown>): DrawingResult {
  const els = Array.isArray(raw.elements) ? raw.elements.slice(0, 60) : [];
  return {
    drawingKinds: Array.isArray(raw.drawingKinds) ? raw.drawingKinds.filter((k): k is string => typeof k === "string").slice(0, 12) : [],
    scaleNote: str(raw.scaleNote), totalAreaM2: num(raw.totalAreaM2, 100000), floors: num(raw.floors, 100),
    elements: els.map((e) => {
      const r = (e ?? {}) as Record<string, unknown>;
      const type = TYPES.includes(r.type as ElementType) ? r.type as ElementType : "other_concrete";
      const params: DrawingResult["elements"][number]["params"] = {};
      const p = (r.params ?? {}) as Record<string, unknown>;
      for (const k of PARAM_KEYS) {
        const x = (p[k] ?? null) as { value?: unknown; confidence?: unknown; where?: unknown } | null;
        if (!x) continue;
        const [lo, hi] = RANGE[k];
        const val = num(x.value);
        params[k] = { value: val != null && val >= lo && val <= hi ? val : null, confidence: conf(x.confidence), where: str(x.where, 120) ?? undefined };
      }
      const segs = Array.isArray(r.segments) ? r.segments.slice(0, 100).map((s) => { const x = (s ?? {}) as { value?: unknown; confidence?: unknown; where?: unknown }; const val = num(x.value, 500); return { value: val != null && val >= 0.1 ? val : null, confidence: conf(x.confidence), where: str(x.where, 120) ?? undefined }; }) : [];
      return { type, name: str(r.name, 120) ?? "Element", segments: segs, params, notes: str(r.notes, 400) };
    }),
    materialList: Array.isArray(raw.materialList) ? raw.materialList.slice(0, 300).map((m) => { const x = (m ?? {}) as Record<string, unknown>; return { name: str(x.name) ?? "—", quantity: num(x.quantity, 1e7), unit: str(x.unit, 16) }; }) : [],
    unreadable: Array.isArray(raw.unreadable) ? raw.unreadable.map((u) => str(u, 120)).filter((u): u is string => !!u).slice(0, 50) : [],
    notes: str(raw.notes, 1000),
  };
}

/**
 * Turns the reading into engine elements, keeping every decision the person already made
 * (parameters with source user / engineer stay as they are on re-analysis).
 */
export function mergeElements(prev: Element[], r: DrawingResult): Element[] {
  const out: Element[] = [];
  const counter = new Map<string, number>();
  for (const e of r.elements) {
    const i = (counter.get(e.type) ?? 0) + 1; counter.set(e.type, i);
    const id = `${e.type}-${i}`;
    const old = prev.find((x) => x.id === id);
    const params: ParamMap = {};
    const keys = new Set<string>([...Object.keys(e.params), ...REBAR_KEYS[e.type]]);
    for (const k of keys) {
      const keep = old?.params[k];
      if (keep && (keep.source === "user" || keep.source === "engineer")) { params[k] = keep; continue; }
      const x = e.params[k];
      // A low-confidence reading is kept but marked as an assumption (and asked about); it is never shown as read from the drawing.
      params[k] = x && x.value != null ? { value: x.value, source: x.confidence >= 0.6 ? "drawing" : "assumed", confidence: x.confidence, where: x.where } as Param : { value: null, source: "missing" };
    }
    const segsKnown = e.segments.filter((s) => s.value != null).map((s) => s.value!) ;
    const oldSegs = old?.params.segments?.source === "user" ? old.segments : undefined;
    out.push({
      id, type: e.type, name: e.name, params: { ...params, ...(oldSegs ? { segments: old!.params.segments } : e.type === "strip_foundation" ? { segments: { value: segsKnown.length || null, source: segsKnown.length && e.segments.every((s) => s.value != null && s.confidence >= 0.6) ? "drawing" : segsKnown.length ? "assumed" : "missing" } } : {}) },
      segments: oldSegs ?? (segsKnown.length ? segsKnown : undefined),
    });
  }
  // Elements the person added by hand stay.
  for (const e of prev) if (e.id.startsWith("manual-") && !out.some((x) => x.id === e.id)) out.push(e);
  return out;
}

export const architecturalOnly = (kinds: string[]) => kinds.length > 0 && !kinds.some((k) => k === "structural_plan" || k === "foundation_plan" || k === "rebar_detail" || k === "section");
