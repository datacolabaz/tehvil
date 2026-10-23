import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, homeMediaTable, mediaStageTagsTable } from "@workspace/db";
import { AI_MODEL, aiConfigured } from "./invoiceAi";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

/*
 * AI construction-stage tagging of photos.
 *
 * Every new home photo gets a row in media_stage_tags (queued). A small worker claims queued rows from the
 * database (FOR UPDATE SKIP LOCKED — safe across restarts and several instances), sends the image to Claude
 * and stores the suggestion. Failure never touches the photo: the upload is already saved.
 * A person's decision is stored apart from the AI suggestion; changing it later is audited.
 */

export const PHOTO_STAGES = [
  { key: "site_prep", label: "Torpaq hazırlığı və qazıntı" },
  { key: "foundation", label: "Fundament və bünövrə" },
  { key: "rebar_formwork", label: "Armatur və qəlib işləri" },
  { key: "concrete_pour", label: "Beton tökmə" },
  { key: "structure", label: "Daşıyıcı konstruksiya və sütunlar" },
  { key: "masonry", label: "Divar hörgüsü" },
  { key: "roof", label: "Dam və dam örtüyü" },
  { key: "electrical", label: "Elektrik xətlərinin çəkilməsi" },
  { key: "plumbing", label: "Su və kanalizasiya xətlərinin çəkilməsi" },
  { key: "heating", label: "İstilik sistemi və isti döşəmə" },
  { key: "windows_doors", label: "Pəncərə və qapıların quraşdırılması" },
  { key: "plaster", label: "Suvaq işləri" },
  { key: "screed", label: "Döşəmə və şap işləri" },
  { key: "waterproofing", label: "Hidroizolyasiya" },
  { key: "tiling", label: "Kafel və digər üzlük işləri" },
  { key: "finishing", label: "Boya və son tamamlama işləri" },
  { key: "kitchen_sanitary", label: "Mətbəx və sanitar avadanlıqların quraşdırılması" },
  { key: "facade", label: "Xarici fasad işləri" },
  { key: "landscaping", label: "Həyət və abadlıq işləri" },
  { key: "completed", label: "Tamamlanmış ev" },
  { key: "other", label: "Digər və ya dəqiq müəyyən edilməyən mərhələ" },
] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number]["key"];
export const STAGE_KEYS = PHOTO_STAGES.map((s) => s.key) as string[];
export const UTILITIES = ["electric", "water", "sewer", "heating", "gas", "ventilation", "internet"] as const;
export const ROOM_KINDS = ["living", "bedroom", "kitchen", "bathroom", "toilet", "hall", "balcony", "utility", "yard", "basement", "exterior", "other"] as const;
/** Below this the photo is shown as "Mərhələni təsdiqlə". */
export const CONFIDENT = 0.7;
const MAX_IMAGE = 5 * 1024 * 1024; // Anthropic image limit (base64 of ≤ 5 MB)
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const TOOL = {
  name: "classify_stage",
  description: "Record which construction stage this photo shows, based only on what is visible.",
  input_schema: {
    type: "object",
    properties: {
      stage: { type: "string", enum: [...STAGE_KEYS, "unknown"], description: "unknown if the photo does not show construction work clearly enough" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      roomKind: { type: ["string", "null"], enum: [...ROOM_KINDS, null] },
      utility: { type: ["string", "null"], enum: [...UTILITIES, null], description: "Main utility line visible (cables, pipes …), null if none is visible" },
      visibleUtilities: { type: "array", items: { type: "string", enum: [...UTILITIES] } },
      workType: { type: ["string", "null"], description: "Short work type, e.g. electrical, plumbing, masonry, tiling" },
      evidence: { type: "string", description: "One sentence in Azerbaijani: what in the photo shows this stage" },
    },
    required: ["stage", "confidence", "roomKind", "utility", "visibleUtilities", "workType", "evidence"],
  },
};
const SYSTEM = `You classify photos from house construction and renovation sites in Azerbaijan into a construction stage.
Stages: ${PHOTO_STAGES.map((s) => `${s.key} = ${s.label}`).join("; ")}.
Rules:
- Decide only from what is visible in this one photo. Never infer a stage that is not shown (e.g. do not say "plumbing" because the room is a bathroom if no pipes are visible).
- Exposed cables / conduits in unplastered walls → electrical. Exposed pipes → plumbing (or heating for radiators / underfloor heating loops).
- Prefer "unknown" with low confidence over a guess. Use confidence < 0.5 when several stages fit.
- Never estimate when the photo was taken, the quality of the work or whether it meets standards.
- evidence: one short neutral sentence in Azerbaijani describing the visible signs.`;

export interface StageResult { stage: string | null; confidence: number; roomKind: string | null; utility: string | null; utilities: string[]; workType: string | null; evidence: string }

async function readImage(objectPath: string) {
  const file = await new ObjectStorageService().getObjectEntityFile(objectPath);
  const [meta] = await file.getMetadata();
  if (Number(meta.size) > MAX_IMAGE) throw new SkipError("Şəkil AI analizi üçün çox böyükdür (5 MB-a qədər)");
  const chunks: Buffer[] = [];
  for await (const c of file.createReadStream()) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
class SkipError extends Error {}

export async function classifyPhoto(objectPath: string, contentType: string): Promise<StageResult & { model: string }> {
  const data = await readImage(objectPath);
  const model = AI_MODEL();
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 600, system: SYSTEM, tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: contentType, data: data.toString("base64") } }, { type: "text", text: "Classify this photo." }] }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(res.status === 429 || res.status === 529 ? "AI xidməti məşğuldur" : `AI cavab vermədi (${res.status})`);
  const json = await res.json() as { content?: { type: string; input?: Record<string, unknown> }[] };
  const r = json.content?.find((c) => c.type === "tool_use")?.input;
  if (!r) throw new Error("AI cavabı boşdur");
  const stage = typeof r.stage === "string" && STAGE_KEYS.includes(r.stage) ? r.stage : null;
  const conf = typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1 ? Math.round(r.confidence * 1000) / 1000 : 0;
  const pick = <T extends readonly string[]>(v: unknown, list: T) => (typeof v === "string" && (list as readonly string[]).includes(v) ? v : null);
  return {
    model,
    stage,
    confidence: stage ? conf : 0,
    roomKind: pick(r.roomKind, ROOM_KINDS),
    utility: pick(r.utility, UTILITIES),
    utilities: Array.isArray(r.visibleUtilities) ? [...new Set(r.visibleUtilities.map((u) => pick(u, UTILITIES)).filter((u): u is string => !!u))] : [],
    workType: typeof r.workType === "string" ? r.workType.slice(0, 24) : null,
    evidence: typeof r.evidence === "string" ? r.evidence.slice(0, 400) : "",
  };
}

/** Photos that can be analysed: images of a home, not documents, invoices or deleted files. */
export const analysable = (m: { homeId: string | null; contentType: string; phase: string; deletedAt: Date | null }) =>
  !!m.homeId && IMAGE_TYPES.includes(m.contentType) && m.phase !== "document" && m.phase !== "finance" && !m.deletedAt;

/** Adds photos to the queue. Existing rows are left alone unless `retry` (failed / skipped ones are queued again). */
export async function enqueuePhotos(media: { id: string; homeId: string | null; contentType: string; phase: string; deletedAt: Date | null }[], opts: { retry?: boolean } = {}) {
  const rows = media.filter(analysable);
  if (!rows.length) return 0;
  const inserted = await db.insert(mediaStageTagsTable).values(rows.map((m) => ({ mediaId: m.id, homeId: m.homeId!, aiStatus: aiConfigured() ? "queued" : "skipped", aiError: aiConfigured() ? null : "AI qoşulmayıb" })))
    .onConflictDoNothing({ target: mediaStageTagsTable.mediaId }).returning({ id: mediaStageTagsTable.id });
  let requeued = 0;
  if (opts.retry && aiConfigured()) {
    const r = await db.update(mediaStageTagsTable).set({ aiStatus: "queued", aiError: null, attempts: 0, updatedAt: new Date() })
      .where(and(inArray(mediaStageTagsTable.mediaId, rows.map((m) => m.id)), inArray(mediaStageTagsTable.aiStatus, ["failed", "skipped"])))
      .returning({ id: mediaStageTagsTable.id });
    requeued = r.length;
  }
  if (inserted.length || requeued) kick();
  return inserted.length + requeued;
}

/* ------------------------------------------------------------------ worker */

let running = 0;
const CONCURRENCY = Math.max(1, Number(process.env.PHOTO_AI_CONCURRENCY ?? 2) || 2);
let timer: NodeJS.Timeout | null = null;

export function kick() { for (let i = running; i < CONCURRENCY; i++) void work(); }

async function claim() {
  // Stale claims (a crashed process) are released after 5 minutes.
  const r = await db.execute(sql`
    update media_stage_tags set ai_status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
    where id = (
      select id from media_stage_tags
      where (ai_status = 'queued' or (ai_status = 'processing' and claimed_at < now() - interval '5 minutes'))
      order by created_at limit 1 for update skip locked
    ) returning id, media_id, attempts`);
  return r.rows[0] as { id: string; media_id: string; attempts: number } | undefined;
}

async function work() {
  if (!aiConfigured()) return;
  running++;
  try {
    for (;;) {
      const job = await claim();
      if (!job) break;
      const [m] = await db.select().from(homeMediaTable).where(eq(homeMediaTable.id, job.media_id));
      const [tag] = await db.select().from(mediaStageTagsTable).where(eq(mediaStageTagsTable.id, job.id));
      if (!m || !tag || !analysable(m)) {
        await db.update(mediaStageTagsTable).set({ aiStatus: "skipped", aiError: "Foto mövcud deyil", updatedAt: new Date() }).where(eq(mediaStageTagsTable.id, job.id));
        continue;
      }
      // Same file already analysed: nothing to send again.
      if (tag.analyzedSha256 && m.sha256 && tag.analyzedSha256 === m.sha256 && tag.analyzedAt) {
        await db.update(mediaStageTagsTable).set({ aiStatus: "done", updatedAt: new Date() }).where(eq(mediaStageTagsTable.id, job.id));
        continue;
      }
      try {
        const r = await classifyPhoto(m.objectPath, m.contentType);
        const undetermined = !r.stage;
        await db.update(mediaStageTagsTable).set({
          aiStatus: "done", aiStage: r.stage, aiConfidence: r.confidence, aiRoomKind: r.roomKind, aiUtility: r.utility, aiUtilities: r.utilities, aiWorkType: r.workType,
          aiEvidence: r.evidence, aiModel: r.model, aiError: null, analyzedSha256: m.sha256 || null, analyzedAt: new Date(), updatedAt: new Date(),
          // A person's decision is never overwritten by a new analysis.
          ...(tag.decidedAt ? {} : { stage: r.stage, stageStatus: undetermined ? "undetermined" : "ai_suggested" }),
        }).where(eq(mediaStageTagsTable.id, job.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI analizi alınmadı";
        const final = err instanceof SkipError || job.attempts >= 3;
        await db.update(mediaStageTagsTable).set({
          aiStatus: final ? (err instanceof SkipError ? "skipped" : "failed") : "queued", aiError: msg, updatedAt: new Date(),
          ...(final && !tag.decidedAt && !tag.stage ? { stageStatus: "undetermined" } : {}),
        }).where(eq(mediaStageTagsTable.id, job.id));
        if (!final) await new Promise((r) => setTimeout(r, 2000 * job.attempts));
        logger.warn({ mediaId: m.id, err: msg }, "photo stage analysis failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "photo stage worker stopped");
  } finally {
    running--;
  }
}

/** Picks up work left over from a restart and anything queued by another instance. */
export function startPhotoStageWorker() {
  if (timer || !aiConfigured()) return;
  timer = setInterval(kick, 30_000);
  timer.unref();
  kick();
}

export async function progressOf(homeId: string) {
  const r = await db.execute(sql`select ai_status, count(*)::int n from media_stage_tags where home_id = ${homeId} group by ai_status`);
  const by = Object.fromEntries((r.rows as { ai_status: string; n: number }[]).map((x) => [x.ai_status, x.n]));
  const untagged = await db.select({ id: homeMediaTable.id }).from(homeMediaTable)
    .leftJoin(mediaStageTagsTable, eq(mediaStageTagsTable.mediaId, homeMediaTable.id))
    .where(and(eq(homeMediaTable.homeId, homeId), isNull(homeMediaTable.deletedAt), isNull(mediaStageTagsTable.id),
      inArray(homeMediaTable.contentType, IMAGE_TYPES), ne(homeMediaTable.phase, "document"), ne(homeMediaTable.phase, "finance")));
  return { queued: (by.queued ?? 0) + (by.processing ?? 0), done: by.done ?? 0, failed: by.failed ?? 0, skipped: by.skipped ?? 0, notAnalysed: untagged.length };
}

