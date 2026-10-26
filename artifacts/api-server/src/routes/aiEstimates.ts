import { createHash } from "node:crypto";
import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, gt, isNull, max, sql } from "drizzle-orm";
import { Readable } from "node:stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  aiEstimateFilesTable, aiEstimatesTable, aiEstimateVersionsTable, db, evidenceUploadsTable, homeMembersTable, type AiEstimateRow,
} from "@workspace/db";
import { isUuid } from "../lib/homeAccess";
import { aiConfigured, AiNotConfigured } from "../lib/invoiceAi";
import { analyzeDrawings, architecturalOnly, mergeElements } from "../lib/drawingAi";
import { analyzeWalls, MAX_PAGES } from "../lib/wallsAi";
import { applyEdit, emptyWalls, KIND_LABEL, mergeWalls, PARAM_LABEL, wallsState, type WallsDoc } from "../lib/wallsModel";
import {
  CATEGORY_LABEL, computeEstimate, DEFAULT_SETTINGS, questionsFor, STATUS_LABEL, type Category, type Element, type EstimateDoc, type ManualItem, type Param,
} from "../lib/estimateEngine";
import { buildEstimateWorkbook } from "../lib/estimateExport";
import { readTable } from "../lib/tableImport";
import { ObjectStorageService } from "../lib/objectStorage";
import { comparisonFor, TO_EXPENSE } from "../lib/estimateLink";
import { rateLimit } from "../lib/rateLimit";
import { logger } from "../lib/logger";

/**
 * AI Smeta: create → upload drawings / material lists → AI reads → questions → estimate table → Excel.
 * Private to its owner. Quantities are always recomputed by the engine from `doc`.
 */
const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
const bad = (res: Response, error: string, status = 400) => { res.status(status).json({ error }); };
const noStore = (res: Response) => res.setHeader("Cache-Control", "private, no-store");
const KINDS = ["house", "renovation", "annex", "concrete_rebar", "other", "masonry_plaster"] as const;
const DRAWING_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const TABLE_TYPES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"];
const UNSUPPORTED = /\.(dwg|dxf|ifc|rvt|skp|pln|3dm)$/i;
const storage = new ObjectStorageService();

export const emptyDoc = (): EstimateDoc => ({ settings: { ...DEFAULT_SETTINGS }, elements: [], norms: {}, manual: [], overrides: {}, prices: {}, removed: [] });
const docOf = (e: AiEstimateRow): EstimateDoc => {
  const d = e.doc as unknown as Partial<EstimateDoc>;
  return { ...emptyDoc(), ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), plywood: { ...DEFAULT_SETTINGS.plywood, ...(d.settings?.plywood ?? {}) } } };
};
/** "Hörgü və suvaq (çertyojdan)": floors / walls / openings live under doc.walls. */
const isWalls = (e: Pick<AiEstimateRow, "kind">) => e.kind === "masonry_plaster";
const wallsOf = (e: AiEstimateRow): WallsDoc => ({ ...emptyWalls(), ...((e.doc as { walls?: Partial<WallsDoc> }).walls ?? {}) });
const withWalls = (e: AiEstimateRow, walls: WallsDoc) => ({ ...docOf(e), walls }) as EstimateDoc & { walls: WallsDoc };
const wallsStatus = (w: WallsDoc) => (!w.floors.length ? "draft" : wallsState(w).allConfirmed ? "ready" : "questions");
const answeredSet = (e: AiEstimateRow) => new Set(Object.entries(e.answers ?? {}).filter(([, a]) => a.kind !== "value").map(([k]) => k));

async function own(req: Request, res: Response) {
  const id = String(req.params.estimateId);
  if (!isUuid(id)) { bad(res, "Smeta tapılmadı", 404); return null; }
  const [e] = await db.select().from(aiEstimatesTable).where(and(eq(aiEstimatesTable.id, id), eq(aiEstimatesTable.ownerUserId, uid(req))));
  if (!e) { bad(res, "Smeta tapılmadı", 404); return null; }
  return e;
}

async function snapshot(e: AiEstimateRow, doc: EstimateDoc, reason: string, userId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ai_estimates where id = ${e.id} for update`);
    const [{ v }] = await tx.select({ v: max(aiEstimateVersionsTable.version) }).from(aiEstimateVersionsTable).where(eq(aiEstimateVersionsTable.estimateId, e.id));
    const version = (v ?? 0) + 1;
    const r = computeEstimate(doc);
    await tx.insert(aiEstimateVersionsTable).values({ estimateId: e.id, version, reason, doc: doc as unknown as Record<string, unknown>, totals: r.totals as unknown as Record<string, unknown>, createdByUserId: userId });
    await tx.update(aiEstimatesTable).set({ version }).where(eq(aiEstimatesTable.id, e.id));
    return version;
  });
}

function statusFor(doc: EstimateDoc, e: AiEstimateRow) {
  const q = questionsFor(doc, answeredSet(e));
  return q.length ? "questions" : "ready";
}

/* ---------------------------------------------------------------- list / create */

router.get("/ai-estimates", async (req, res): Promise<void> => {
  noStore(res);
  const rows = await db.select().from(aiEstimatesTable).where(eq(aiEstimatesTable.ownerUserId, uid(req))).orderBy(desc(aiEstimatesTable.updatedAt));
  res.json(rows.map((e) => {
    const doc = docOf(e); const r = computeEstimate(doc);
    if (isWalls(e)) { const w = wallsOf(e); return { id: e.id, name: e.name, kind: e.kind, status: e.status, openQuestions: wallsState(w).openIssues, itemCount: w.floors.reduce((n, f) => n + f.walls.length, 0), total: 0, homeId: e.homeId, updatedAt: e.updatedAt.toISOString() }; }
    return { id: e.id, name: e.name, kind: e.kind, status: e.status, openQuestions: questionsFor(doc, answeredSet(e)).length, itemCount: r.items.length, total: r.totals.amount, homeId: e.homeId, updatedAt: e.updatedAt.toISOString() };
  }));
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(KINDS),
  location: z.string().trim().max(200).default(""),
  areaM2: z.number().int().positive().max(100000).nullable().optional(),
  floors: z.number().int().positive().max(100).nullable().optional(),
});

router.post("/ai-estimates", async (req, res): Promise<void> => {
  const b = CreateBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Layihənin adını və növünü seçin");
  const [e] = await db.insert(aiEstimatesTable).values({ ownerUserId: uid(req), ...b.data, areaM2: b.data.areaM2 ?? null, floors: b.data.floors ?? null, doc: emptyDoc() as unknown as Record<string, unknown> }).returning();
  res.status(201).json({ id: e.id });
});

router.delete("/ai-estimates/:estimateId", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  await db.delete(aiEstimatesTable).where(eq(aiEstimatesTable.id, e.id));
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- view */

router.get("/ai-estimates/:estimateId", async (req, res): Promise<void> => {
  noStore(res);
  const e = await own(req, res); if (!e) return;
  const doc = docOf(e);
  const files = await db.select().from(aiEstimateFilesTable).where(eq(aiEstimateFilesTable.estimateId, e.id)).orderBy(asc(aiEstimateFilesTable.createdAt));
  const versions = await db.select({ version: aiEstimateVersionsTable.version, reason: aiEstimateVersionsTable.reason, totals: aiEstimateVersionsTable.totals, createdAt: aiEstimateVersionsTable.createdAt })
    .from(aiEstimateVersionsTable).where(eq(aiEstimateVersionsTable.estimateId, e.id)).orderBy(desc(aiEstimateVersionsTable.version)).limit(30);
  const result = computeEstimate(doc);
  res.json({
    id: e.id, name: e.name, kind: e.kind, location: e.location, areaM2: e.areaM2, floors: e.floors, status: e.status, aiError: e.aiError, aiConfigured: aiConfigured(), homeId: e.homeId,
    version: e.version, updatedAt: e.updatedAt.toISOString(),
    files: files.map((f) => ({ id: f.id, name: f.originalName, contentType: f.contentType, size: f.size, kind: f.kind, status: f.status, error: f.error, url: `/api/ai-estimates/${e.id}/files/${f.id}` })),
    doc, result, statusLabels: STATUS_LABEL, categoryLabels: CATEGORY_LABEL,
    questions: questionsFor(doc, answeredSet(e)), answers: e.answers,
    ai: e.aiResult ? { drawingKinds: (e.aiResult as { drawingKinds?: string[] }).drawingKinds ?? [], unreadable: (e.aiResult as { unreadable?: string[] }).unreadable ?? [], notes: (e.aiResult as { notes?: string }).notes ?? null, scaleNote: (e.aiResult as { scaleNote?: string }).scaleNote ?? null } : null,
    versions: versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
    contractor: e.contractor ?? null,
    comparison: await comparison(e, result),
    walls: isWalls(e) ? { ...wallsOf(e), state: wallsState(wallsOf(e)), maxPages: MAX_PAGES, kindLabels: KIND_LABEL, paramLabels: PARAM_LABEL } : null,
  });
});

/* ---------------------------------------------------------------- hörgü və suvaq: pages and review */

/** Which pages of a PDF go to the AI (the floor plans, a section, the window schedule). */
router.put("/ai-estimates/:estimateId/pages", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  if (!isWalls(e)) return bad(res, "Bu smeta növü üçün deyil");
  const b = z.object({ fileId: z.string().uuid(), pages: z.array(z.number().int().min(1).max(2000)).max(MAX_PAGES) }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, `Ən çox ${MAX_PAGES} səhifə seçin`);
  const [f] = await db.select().from(aiEstimateFilesTable).where(and(eq(aiEstimateFilesTable.id, b.data.fileId), eq(aiEstimateFilesTable.estimateId, e.id)));
  if (!f || f.contentType !== "application/pdf") return bad(res, "PDF tapılmadı", 404);
  const w = wallsOf(e);
  w.pages = { ...w.pages, [f.id]: [...new Set(b.data.pages)].sort((x, y) => x - y) };
  await db.update(aiEstimatesTable).set({ doc: withWalls(e, w) as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  res.json({ pages: w.pages[f.id] });
});

/** The person's checked version of floors, walls and openings (a floor is confirmed only when nothing is missing or assumed). */
router.put("/ai-estimates/:estimateId/walls", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  if (!isWalls(e)) return bad(res, "Bu smeta növü üçün deyil");
  if (e.status === "analyzing") return bad(res, "AI hələ oxuyur — bir az gözləyin");
  const r = applyEdit(wallsOf(e), (req.body ?? {}).floors);
  if (r.error) return bad(res, r.error);
  const doc = withWalls(e, r.doc);
  const status = wallsStatus(r.doc);
  await db.update(aiEstimatesTable).set({ doc: doc as unknown as Record<string, unknown>, status, floors: r.doc.floors.length || e.floors, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  const confirmed = r.doc.floors.filter((f) => f.confirmed).length;
  await snapshot(e, doc, confirmed === r.doc.floors.length && confirmed > 0 ? "walls-ok" : "walls-edited", uid(req));
  res.json({ status, state: wallsState(r.doc) });
});

router.get("/ai-estimates/:estimateId/files/:fileId", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const fid = String(req.params.fileId);
  if (!isUuid(fid)) return bad(res, "Fayl tapılmadı", 404);
  const [f] = await db.select().from(aiEstimateFilesTable).where(and(eq(aiEstimateFilesTable.id, fid), eq(aiEstimateFilesTable.estimateId, e.id)));
  if (!f) return bad(res, "Fayl tapılmadı", 404);
  const file = await storage.getObjectEntityFile(f.objectPath);
  const response = await storage.downloadObject(file, 0);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  if (response.body) Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  else res.end();
});

/* ---------------------------------------------------------------- files */

const FileBody = z.object({ file: z.object({ objectPath: z.string().max(300), originalName: z.string().max(255), contentType: z.string().max(120), size: z.number().int().positive() }) });

router.post("/ai-estimates/:estimateId/files", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const b = FileBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Faylı yoxlayın");
  const f = b.data.file;
  if (UNSUPPORTED.test(f.originalName)) return bad(res, "DWG, DXF, IFC və digər CAD/BIM faylları hələ oxunmur. Çertyoju PDF kimi çap edib yükləyin.", 415);
  const kind = DRAWING_TYPES.includes(f.contentType) ? "drawing" : TABLE_TYPES.includes(f.contentType) ? "table" : null;
  if (!kind) return bad(res, "Bu fayl tipi dəstəklənmir: PDF, JPG, PNG, WebP, XLSX və ya CSV yükləyin.", 415);
  if (f.size > 25 * 1024 * 1024) return bad(res, "Fayl 25 MB-dan böyük olmamalıdır");
  if (kind === "drawing" && f.contentType !== "application/pdf" && f.size > 5 * 1024 * 1024) return bad(res, "Şəkil 5 MB-dan böyükdür — kiçildib yenidən yükləyin");
  const userId = uid(req);
  // Same claim rules as every other upload: fresh, not yet attached, uploaded by this person, same size and type.
  const [up] = await db.select().from(evidenceUploadsTable).where(and(eq(evidenceUploadsTable.objectPath, f.objectPath), eq(evidenceUploadsTable.userId, userId), isNull(evidenceUploadsTable.attachedAt), gt(evidenceUploadsTable.expiresAt, new Date())));
  if (!up || up.size !== f.size || up.contentType !== f.contentType) return bad(res, "Faylı yenidən yükləyin");
  const obj = await storage.getObjectEntityFile(f.objectPath);
  const h = createHash("sha256");
  for await (const c of obj.createReadStream()) h.update(c as Buffer);
  const sha = h.digest("hex");
  const row = await db.transaction(async (tx) => {
    const claimed = await tx.update(evidenceUploadsTable).set({ attachedAt: new Date() }).where(and(eq(evidenceUploadsTable.objectPath, f.objectPath), isNull(evidenceUploadsTable.attachedAt))).returning();
    if (!claimed.length) return null;
    const [r] = await tx.insert(aiEstimateFilesTable).values({ estimateId: e.id, objectPath: f.objectPath, originalName: f.originalName.slice(0, 255), contentType: f.contentType, size: f.size, sha256: sha, kind }).returning();
    return r;
  });
  if (!row) return bad(res, "Bu fayl artıq istifadə olunub");
  let imported: { rows: number; skipped: number; error?: string } | null = null;
  if (kind === "table") {
    try {
      const t = await readTable(f.objectPath, f.contentType);
      const doc = docOf(e);
      const items: ManualItem[] = t.rows.map((r) => ({ key: `list:${row.id}:${r.row}`, name: r.name, category: r.category, qty: r.qty, unit: r.unit, source: "list", note: `${f.originalName}, sətir ${r.row}` }));
      for (const r of t.rows) if (r.unitPrice != null) doc.prices[`list:${row.id}:${r.row}`] = r.unitPrice;
      doc.manual = [...doc.manual, ...items];
      await db.update(aiEstimatesTable).set({ doc: doc as unknown as Record<string, unknown>, updatedAt: new Date(), status: e.status === "draft" ? statusFor(doc, e) : e.status }).where(eq(aiEstimatesTable.id, e.id));
      await db.update(aiEstimateFilesTable).set({ status: t.error ? "failed" : "analyzed", error: t.error ?? null }).where(eq(aiEstimateFilesTable.id, row.id));
      imported = { rows: t.rows.length, skipped: t.skipped, error: t.error };
    } catch (err) {
      await db.update(aiEstimateFilesTable).set({ status: "failed", error: "Cədvəl oxunmadı" }).where(eq(aiEstimateFilesTable.id, row.id));
      imported = { rows: 0, skipped: 0, error: "Cədvəl oxunmadı — faylın düzgün XLSX/CSV olduğunu yoxlayın" };
      logger.warn({ err }, "table import failed");
    }
  }
  res.status(201).json({ id: row.id, kind, imported });
});

/* ---------------------------------------------------------------- analysis */

const aiLimit = rateLimit({ windowMs: 60 * 60_000, max: 20, key: (req) => `drw:${getAuth(req).userId}` });

router.post("/ai-estimates/:estimateId/analyze", aiLimit, async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  if (!aiConfigured()) return bad(res, "AI analizi hələ qoşulmayıb. Ölçüləri əl ilə daxil edə bilərsiniz.", 503);
  const files = await db.select().from(aiEstimateFilesTable).where(and(eq(aiEstimateFilesTable.estimateId, e.id), eq(aiEstimateFilesTable.kind, "drawing")));
  if (!files.length) return bad(res, "Əvvəlcə çertyoj (PDF və ya şəkil) yükləyin");
  if (e.status === "analyzing") return void res.json({ status: "analyzing" });
  await db.update(aiEstimatesTable).set({ status: "analyzing", aiError: null, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  if (isWalls(e)) { void runWallsAnalysis(e.id, uid(req)); return void res.json({ status: "analyzing" }); }
  const focus = Object.entries(e.answers ?? {}).filter(([, a]) => a.kind === "unknown").map(([k]) => k);
  void runAnalysis(e.id, uid(req), focus);
  res.json({ status: "analyzing" });
});

async function runAnalysis(estimateId: string, userId: string, focus: string[]) {
  const [e] = await db.select().from(aiEstimatesTable).where(eq(aiEstimatesTable.id, estimateId));
  if (!e) return;
  const files = await db.select().from(aiEstimateFilesTable).where(and(eq(aiEstimateFilesTable.estimateId, e.id), eq(aiEstimateFilesTable.kind, "drawing")));
  try {
    const { result, model } = await analyzeDrawings(files.map((f) => ({ objectPath: f.objectPath, contentType: f.contentType, name: f.originalName })), focus);
    const doc = docOf(e);
    doc.elements = mergeElements(doc.elements, result);
    doc.architecturalOnly = architecturalOnly(result.drawingKinds);
    // A material list written on the drawing becomes list lines (replaced on re-analysis).
    doc.manual = [...doc.manual.filter((m) => !m.key.startsWith("drawing-list:")), ...result.materialList.map((m, i) => ({ key: `drawing-list:${i}`, name: m.name, category: "other" as Category, qty: m.quantity, unit: m.unit ?? "", source: "list" as const, note: "Çertyojdakı material cədvəli" }))];
    const fresh = { ...e, doc: doc as unknown as Record<string, unknown> };
    await db.update(aiEstimatesTable).set({ doc: doc as unknown as Record<string, unknown>, aiResult: result as unknown as Record<string, unknown>, aiModel: model, status: statusFor(doc, fresh), aiError: null, updatedAt: new Date(), areaM2: e.areaM2 ?? (result.totalAreaM2 ? Math.round(result.totalAreaM2) : null), floors: e.floors ?? (result.floors ? Math.round(result.floors) : null) }).where(eq(aiEstimatesTable.id, e.id));
    await db.update(aiEstimateFilesTable).set({ status: "analyzed", error: null }).where(and(eq(aiEstimateFilesTable.estimateId, e.id), eq(aiEstimateFilesTable.kind, "drawing")));
    await snapshot(fresh as AiEstimateRow, doc, "analysis", userId);
  } catch (err) {
    const msg = err instanceof AiNotConfigured ? "AI analizi qoşulmayıb" : err instanceof Error ? err.message : "AI çertyoju oxuya bilmədi";
    logger.warn({ estimateId, err: msg }, "drawing analysis failed");
    await db.update(aiEstimatesTable).set({ status: "failed", aiError: msg, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  }
}

async function runWallsAnalysis(estimateId: string, userId: string) {
  const [e] = await db.select().from(aiEstimatesTable).where(eq(aiEstimatesTable.id, estimateId));
  if (!e) return;
  const files = await db.select().from(aiEstimateFilesTable).where(and(eq(aiEstimateFilesTable.estimateId, e.id), eq(aiEstimateFilesTable.kind, "drawing")));
  const prev = wallsOf(e);
  try {
    const { result, model, sentPages } = await analyzeWalls(files.map((f) => ({ id: f.id, objectPath: f.objectPath, contentType: f.contentType, name: f.originalName, size: f.size })), prev.pages);
    const walls = mergeWalls(prev, result);
    const doc = withWalls(e, walls);
    await db.update(aiEstimatesTable).set({ doc: doc as unknown as Record<string, unknown>, aiResult: { ...result, sentPages } as unknown as Record<string, unknown>, aiModel: model, status: wallsStatus(walls), aiError: null, floors: walls.floors.length || e.floors, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
    await db.update(aiEstimateFilesTable).set({ status: "analyzed", error: null }).where(and(eq(aiEstimateFilesTable.estimateId, e.id), eq(aiEstimateFilesTable.kind, "drawing")));
    await snapshot(e, doc, "analysis", userId);
  } catch (err) {
    const msg = err instanceof AiNotConfigured ? "AI analizi qoşulmayıb" : err instanceof Error ? err.message : "AI çertyoju oxuya bilmədi";
    logger.warn({ estimateId, err: msg }, "walls analysis failed");
    await db.update(aiEstimatesTable).set({ status: "failed", aiError: msg, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  }
}

/* ---------------------------------------------------------------- answers */

const AnswerBody = z.object({ answers: z.array(z.object({ id: z.string().max(80), kind: z.enum(["value", "unknown", "engineer"]), value: z.union([z.number(), z.string(), z.null()]).optional() })).min(1).max(100) });

router.post("/ai-estimates/:estimateId/answers", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const b = AnswerBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Cavabları yoxlayın");
  const doc = docOf(e);
  const answers = { ...(e.answers ?? {}) };
  const errors: string[] = [];
  for (const a of b.data.answers) {
    const [scope, key] = a.id.split(".");
    const n = a.value == null || a.value === "" ? null : Number(String(a.value).replace(",", "."));
    if (a.kind === "value" && key !== "segments" && (n == null || !Number.isFinite(n) || n < 0)) { errors.push(a.id); continue; }
    if (scope === "settings" && key === "plywoodThickness") { if (a.kind === "value") doc.settings.plywood.thicknessMm = n; }
    else if (scope === "norms") { if (a.kind === "value") (doc.norms as Record<string, number | null>)[key] = n; }
    else {
      const el = doc.elements.find((x) => x.id === scope);
      if (!el) { errors.push(a.id); continue; }
      if (key === "segments") {
        if (a.kind === "value") {
          const segs = String(a.value ?? "").split(/[;,\s]+/).map((x) => Number(x.replace(",", "."))).filter((x) => Number.isFinite(x) && x > 0 && x < 500);
          if (!segs.length) { errors.push(a.id); continue; }
          el.segments = segs; el.params.segments = { value: segs.length, source: "user" };
        } else el.params.segments = { value: null, source: a.kind === "engineer" ? "engineer" : "missing" };
      } else {
        el.params[key] = a.kind === "value" ? { value: n, source: "user" } as Param : a.kind === "engineer" ? { value: null, source: "engineer", note: "Mühəndisə soruşulacaq" } : { ...(el.params[key] ?? { value: null }), source: el.params[key]?.value != null ? "assumed" : "missing", note: "İstifadəçi bilmir" } as Param;
      }
    }
    answers[a.id] = { value: a.kind === "value" ? n : null, kind: a.kind, at: new Date().toISOString() };
  }
  if (errors.length) return bad(res, `Bu cavablar oxunmadı: ${errors.join(", ")}`);
  const fresh = { ...e, answers, doc: doc as unknown as Record<string, unknown> };
  const status = statusFor(doc, fresh as AiEstimateRow);
  await db.update(aiEstimatesTable).set({ doc: doc as unknown as Record<string, unknown>, answers, status, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  await snapshot(fresh as AiEstimateRow, doc, "answers", uid(req));
  // "Bilmirəm" answers: AI looks again for exactly those values, if it can.
  const unknown = b.data.answers.filter((a) => a.kind === "unknown").map((a) => a.id);
  const hasDrawings = (await db.select({ id: aiEstimateFilesTable.id }).from(aiEstimateFilesTable).where(and(eq(aiEstimateFilesTable.estimateId, e.id), eq(aiEstimateFilesTable.kind, "drawing"))).limit(1)).length > 0;
  if (unknown.length && aiConfigured() && hasDrawings) {
    await db.update(aiEstimatesTable).set({ status: "analyzing" }).where(eq(aiEstimatesTable.id, e.id));
    void runAnalysis(e.id, uid(req), unknown);
  }
  res.json({ status: unknown.length && aiConfigured() && hasDrawings ? "analyzing" : status });
});

/* ---------------------------------------------------------------- edits */

const num = z.number().finite().nonnegative().max(1e9);
const ParamZ = z.object({ value: num.nullable(), source: z.enum(["drawing", "user", "assumed", "missing", "engineer", "list"]), confidence: z.number().min(0).max(1).optional(), note: z.string().max(300).optional(), where: z.string().max(200).optional() });
const ElementZ = z.object({ id: z.string().max(60), type: z.enum(["strip_foundation", "column", "beam", "slab", "wall", "other_concrete"]), name: z.string().trim().min(1).max(120), params: z.record(z.string().max(20), ParamZ.optional()), segments: z.array(num.max(500)).max(200).optional() });
const EditBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().max(200).optional(),
  elements: z.array(ElementZ).max(100).optional(),
  settings: z.object({ stockLength: num.min(1).max(20), lapD: num.max(100), anchorD: num.max(100), hookD: num.max(60), cover: num.max(0.2), concreteReservePct: num.max(30), rebarCutPct: num.max(30), plywood: z.object({ w: num.min(0.3).max(5), h: num.min(0.3).max(5), thicknessMm: num.max(50).nullable() }), formworkUses: num.min(1).max(50), boardLength: num.min(1).max(12) }).partial().optional(),
  norms: z.object({ board3x10PerM2: num.max(100).nullable(), board5x10PerM2: num.max(100).nullable(), wirePerTon: num.max(200).nullable(), katinkaPerTon: num.max(500).nullable() }).partial().optional(),
  prices: z.record(z.string().max(120), num.nullable()).optional(),
  overrides: z.record(z.string().max(120), z.object({ qty: num, reason: z.string().max(300).optional() }).nullable()).optional(),
  removed: z.array(z.string().max(120)).max(500).optional(),
  manual: z.array(z.object({ key: z.string().max(120), name: z.string().trim().min(1).max(200), category: z.enum(["concrete", "rebar", "formwork", "timber", "other"]), qty: num.nullable(), unit: z.string().max(16), source: z.enum(["manual", "list"]), note: z.string().max(300).optional() })).max(500).optional(),
  snapshot: z.boolean().optional(),
});

router.patch("/ai-estimates/:estimateId", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const b = EditBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, `Məlumatları yoxlayın (${b.error.issues.map((i) => i.path.join(".")).slice(0, 3).join(", ")})`);
  const d = b.data;
  const doc = docOf(e);
  if (d.elements) doc.elements = d.elements as Element[];
  if (d.settings) doc.settings = { ...doc.settings, ...d.settings, plywood: { ...doc.settings.plywood, ...(d.settings.plywood ?? {}) } };
  if (d.norms) doc.norms = { ...doc.norms, ...d.norms };
  if (d.prices) for (const [k, v] of Object.entries(d.prices)) { if (v == null) delete doc.prices[k]; else doc.prices[k] = v; }
  if (d.overrides) for (const [k, v] of Object.entries(d.overrides)) { if (v == null) delete doc.overrides[k]; else doc.overrides[k] = v; }
  if (d.removed) doc.removed = d.removed;
  if (d.manual) doc.manual = d.manual;
  const fresh = { ...e, doc: doc as unknown as Record<string, unknown> };
  const status = e.status === "analyzing" ? e.status : doc.elements.length || doc.manual.length ? statusFor(doc, fresh as AiEstimateRow) : e.status;
  await db.update(aiEstimatesTable).set({ doc: doc as unknown as Record<string, unknown>, status, updatedAt: new Date(), ...(d.name ? { name: d.name } : {}), ...(d.location !== undefined ? { location: d.location } : {}) }).where(eq(aiEstimatesTable.id, e.id));
  const version = d.snapshot ? await snapshot(fresh as AiEstimateRow, doc, "edit", uid(req)) : e.version;
  res.json({ ok: true, version, result: computeEstimate(doc), questions: questionsFor(doc, answeredSet(fresh as AiEstimateRow)) });
});

router.get("/ai-estimates/:estimateId/versions/:version", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const [v] = await db.select().from(aiEstimateVersionsTable).where(and(eq(aiEstimateVersionsTable.estimateId, e.id), eq(aiEstimateVersionsTable.version, Number(req.params.version) || 0)));
  if (!v) return bad(res, "Versiya tapılmadı", 404);
  res.json({ version: v.version, reason: v.reason, createdAt: v.createdAt.toISOString(), totals: v.totals, result: computeEstimate(v.doc as unknown as EstimateDoc) });
});

/* ---------------------------------------------------------------- export */

router.get("/ai-estimates/:estimateId/export.xlsx", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const doc = docOf(e);
  const version = await snapshot(e, doc, "export", uid(req));
  const buf = await buildEstimateWorkbook({ name: e.name, kind: e.kind, location: e.location, version, date: new Date().toISOString().slice(0, 10) }, doc, computeEstimate(doc), questionsFor(doc, answeredSet(e)));
  const safe = e.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "smeta";
  noStore(res);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="smeta.xlsx"; filename*=UTF-8''smeta-${encodeURIComponent(safe)}.xlsx`);
  res.send(buf);
});

/* ---------------------------------------------------------- link to expenses */

async function comparison(e: AiEstimateRow, r: ReturnType<typeof computeEstimate>) {
  if (!e.homeId) return null;
  const [m] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, e.homeId), eq(homeMembersTable.userId, e.ownerUserId)));
  if (!m) return null;
  const planned = new Map<string, number>();
  for (const i of r.items) if (i.amount != null) planned.set(TO_EXPENSE[i.category], (planned.get(TO_EXPENSE[i.category]) ?? 0) + Math.round(i.amount * 100));
  const rows = await comparisonFor(e.homeId, planned);
  const contractor = (e.contractor as { rows?: { category: Category; amount: number | null; confirmed?: boolean }[] } | null)?.rows;
  if (contractor?.length) {
    const theirs = new Map<string, number>();
    for (const c of contractor) if (c.amount != null && c.confirmed === true) theirs.set(TO_EXPENSE[c.category], (theirs.get(TO_EXPENSE[c.category]) ?? 0) + Math.round(c.amount * 100));
    return rows.map((x) => ({ ...x, contractor: theirs.get(x.category) ?? null }));
  }
  return rows;
}

router.post("/ai-estimates/:estimateId/link", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const b = z.object({ homeId: z.string().uuid().nullable() }).safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Evi seçin");
  if (b.data.homeId) {
    const [m] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, b.data.homeId), eq(homeMembersTable.userId, uid(req))));
    if (!m || (m.role !== "owner" && m.role !== "member")) return bad(res, "Ev tapılmadı", 404);
  }
  await db.update(aiEstimatesTable).set({ homeId: b.data.homeId, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  res.json({ ok: true });
});

/* ------------------------------------------------------ contractor's estimate */

router.post("/ai-estimates/:estimateId/contractor", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const b = FileBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Faylı yoxlayın");
  const f = b.data.file;
  if (!TABLE_TYPES.includes(f.contentType)) return bad(res, "Ustanın smetasını XLSX və ya CSV cədvəl kimi yükləyin", 415);
  const [up] = await db.select().from(evidenceUploadsTable).where(and(eq(evidenceUploadsTable.objectPath, f.objectPath), eq(evidenceUploadsTable.userId, uid(req)), isNull(evidenceUploadsTable.attachedAt), gt(evidenceUploadsTable.expiresAt, new Date())));
  if (!up || up.size !== f.size) return bad(res, "Faylı yenidən yükləyin");
  await db.update(evidenceUploadsTable).set({ attachedAt: new Date() }).where(eq(evidenceUploadsTable.objectPath, f.objectPath));
  const t = await readTable(f.objectPath, f.contentType);
  if (t.error) return bad(res, t.error);
  // The guessed category of every line must be confirmed by the person before it counts.
  const contractor = { fileName: f.originalName, objectPath: f.objectPath, uploadedAt: new Date().toISOString(), skipped: t.skipped, rows: t.rows.map((r) => ({ ...r, confirmed: null as boolean | null })) };
  await db.update(aiEstimatesTable).set({ contractor, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  res.status(201).json({ rows: t.rows.length, skipped: t.skipped });
});

router.patch("/ai-estimates/:estimateId/contractor", async (req, res): Promise<void> => {
  const e = await own(req, res); if (!e) return;
  const b = z.object({ rows: z.array(z.object({ row: z.number().int(), category: z.enum(["concrete", "rebar", "formwork", "timber", "other"]), confirmed: z.boolean() })).max(500) }).safeParse(req.body ?? {});
  if (!b.success || !e.contractor) return bad(res, "Məlumatları yoxlayın");
  const c = e.contractor as { rows: { row: number; category: Category; confirmed: boolean | null }[] };
  for (const x of b.data.rows) { const r = c.rows.find((y) => y.row === x.row); if (r) { r.category = x.category; r.confirmed = x.confirmed; } }
  await db.update(aiEstimatesTable).set({ contractor: c as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(aiEstimatesTable.id, e.id));
  res.json({ ok: true });
});

export default router;
