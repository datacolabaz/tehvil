import { PDFDocument } from "pdf-lib";
import { callTool, type Part } from "./aiClient";
import { ObjectStorageService } from "./objectStorage";
import { sanitizeWalls, type WallsReading } from "./wallsModel";

/*
 * Reads floors, walls and their door / window openings from architectural drawings for the masonry and plaster
 * estimate. The model only reports what the drawing shows (with where and how); the calculations are done by code.
 * Multi-page PDFs: only the pages the person selected are sent.
 */

const MAX_PDF = 25 * 1024 * 1024, MAX_IMAGE = 5 * 1024 * 1024;
export const MAX_PAGES = 12;

const reading = (desc: string) => ({
  type: "object", description: desc,
  properties: {
    value: { type: ["number", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    how: { type: "string", enum: ["dimension", "scale", "note"], description: "dimension = a written dimension line, note = written text, scale = measured with the drawing scale" },
    page: { type: ["number", "null"], description: "Page (of the pages you were given, 1-based) where it was read" },
    where: { type: "string", description: "Short place, e.g. 'plan 1-ci mərtəbə, ox A-B'" },
  },
  required: ["value", "confidence", "how"],
});
const TOOL = {
  name: "record_walls",
  description: "Record the floors, the masonry walls on each floor and their door and window openings, exactly as the drawings show them. Use null for anything not shown. Never guess.",
  input_schema: {
    type: "object",
    properties: {
      drawingKinds: { type: "array", items: { type: "string", enum: ["floor_plan", "section", "elevation", "structural_plan", "site_plan", "detail", "other"] } },
      scaleNote: { type: ["string", "null"] },
      floors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "e.g. '1-ci mərtəbə', '2-ci mərtəbə', 'Zirzəmi'" },
            level: { type: "number", description: "0 = ground floor, 1 = first upper floor, -1 = basement" },
            floorHeight: reading("Floor-to-floor height in metres (from a section or elevation), null if not shown"),
            slabThickness: reading("Floor slab thickness in metres, null if not shown"),
            walls: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Axis or side, e.g. 'Ox 1 (A–D)', 'Şimal fasadı', 'Mətbəx–qonaq otağı arası'" },
                  kind: { type: "string", enum: ["external", "internal", "partition"] },
                  length: reading("Length in metres. For external walls the outside dimension of that side; for internal walls the clear length between the walls it meets"),
                  thickness: reading("Wall thickness in metres (e.g. 0.40, 0.20, 0.10)"),
                  junctions: reading("External walls: how many of its two ends are corners with another external wall (0-2), so the corner is not counted twice. Internal walls / partitions: how many walls its ends meet (their clear length already avoids double counting)"),
                  openings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        kind: { type: "string", enum: ["door", "window"] },
                        count: reading("How many identical openings of this size in this wall"),
                        width: reading("Opening width in metres"),
                        height: reading("Opening height in metres (from the opening schedule, elevation or a note), null if not shown"),
                      },
                      required: ["kind", "count", "width", "height"],
                    },
                  },
                },
                required: ["name", "kind", "length", "thickness", "junctions", "openings"],
              },
            },
          },
          required: ["name", "level", "floorHeight", "slabThickness", "walls"],
        },
      },
      unreadable: { type: "array", items: { type: "string" } },
      notes: { type: ["string", "null"] },
    },
    required: ["drawingKinds", "floors", "unreadable"],
  },
};
const SYSTEM = `You read architectural drawings of private houses in Azerbaijan (Azerbaijani / Russian labels) for a masonry and plaster quantity estimate.
Rules:
- Report only what the drawings show. Prefer written dimension lines and schedules ("how": "dimension"). Use the scale only when a scale is printed, and then say "how": "scale". Never invent a value: use null and list it in "unreadable".
- Convert mm and cm to metres.
- One entry per floor plan. Walls: every masonry wall on that floor, external walls side by side, then internal walls and partitions. Do not list reinforced-concrete columns or the same wall twice.
- Length: external walls by the outside dimension of each side; internal walls by the clear length between the walls they meet. In "junctions" give, for an external wall, how many of its ends are corners with another external wall (0-2); for an internal wall, how many walls its ends meet.
- Openings: each door and window in the wall it belongs to; group identical ones with "count". Window heights usually come from the window schedule or elevations.
- Floor height: floor-to-floor from a section; slab thickness from a section or note. Null when not shown.
- confidence: 1 = printed dimension, 0.6–0.8 = derived, below 0.5 = unsure (prefer null).
- Do not judge structure, safety or code compliance.`;

async function readObject(objectPath: string) {
  const file = await new ObjectStorageService().getObjectEntityFile(objectPath);
  const chunks: Buffer[] = [];
  for await (const c of file.createReadStream()) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function pdfPageCount(buf: Buffer) {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
  return doc.getPageCount();
}
/** A new PDF with only the given pages (1-based, in the given order). */
export async function extractPages(buf: Buffer, pages: number[]): Promise<Buffer> {
  const src = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
  const n = src.getPageCount();
  const want = [...new Set(pages)].filter((p) => p >= 1 && p <= n).map((p) => p - 1);
  if (!want.length) throw new Error("Seçilən səhifələr bu PDF-də yoxdur");
  const out = await PDFDocument.create();
  for (const p of await out.copyPages(src, want)) out.addPage(p);
  return Buffer.from(await out.save());
}

export interface WallsFile { id: string; objectPath: string; contentType: string; name: string; size: number }
/** Sends the drawings (selected pages only) and returns the checked reading. */
export async function analyzeWalls(files: WallsFile[], pages: Record<string, number[]>): Promise<{ result: WallsReading; model: string; sentPages: Record<string, number[] | "all"> }> {
  const parts: Part[] = [];
  const sentPages: Record<string, number[] | "all"> = {};
  let total = 0;
  for (const f of files.slice(0, 8)) {
    if (f.size > (f.contentType === "application/pdf" ? MAX_PDF : MAX_IMAGE)) throw new Error(`“${f.name}” çox böyükdür (PDF 25 MB, şəkil 5 MB-a qədər)`);
    let buf: Buffer = await readObject(f.objectPath);
    if (f.contentType === "application/pdf") {
      const count = await pdfPageCount(buf);
      const sel = pages[f.id];
      if (sel?.length) { buf = await extractPages(buf, sel); sentPages[f.id] = sel; total += sel.length; }
      else if (count > MAX_PAGES) throw new Error(`“${f.name}” ${count} səhifədir — planların olduğu səhifələri seçin (ən çox ${MAX_PAGES})`);
      else { sentPages[f.id] = "all"; total += count; }
    } else { sentPages[f.id] = "all"; total += 1; }
    if (total > MAX_PAGES * 2) throw new Error(`Çox səhifə seçilib (${total}) — yalnız mərtəbə planlarını, kəsiyi və pəncərə cədvəlini seçin`);
    parts.push({ file: { mime: f.contentType, data: buf.toString("base64"), name: f.name } });
  }
  parts.push({ text: "Read the floors, the masonry walls of each floor and their door and window openings, and record them with the tool." });
  const { input, model } = await callTool({ system: SYSTEM, parts, tool: TOOL, maxTokens: 12000, timeoutMs: 240_000 });
  return { result: sanitizeWalls(input), model, sentPages };
}
