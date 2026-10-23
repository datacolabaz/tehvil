import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { db, homeMediaTable, mediaStageTagsTable } from "@workspace/db";
import { audit, getHomeAccess, homePermissions, isUuid } from "../lib/homeAccess";
import { aiConfigured } from "../lib/invoiceAi";
import { CONFIDENT, enqueuePhotos, PHOTO_STAGES, progressOf, ROOM_KINDS, STAGE_KEYS, UTILITIES } from "../lib/photoStageAi";
import { bad, forbidden, noStore, notFound } from "./homes";
import { homeMediaUrl } from "../lib/homeDtos";

/** AI construction stages of a home's photos: gallery by stage, review, bulk "organise old photos". */
const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;

router.get("/homes/:homeId/photo-stages", async (req, res): Promise<void> => {
  noStore(res);
  const a = await getHomeAccess(uid(req), String(req.params.homeId));
  if (!a) return notFound(res, "Ev tapılmadı");
  const userId = uid(req);
  const media = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt), ne(homeMediaTable.phase, "finance"), ne(homeMediaTable.phase, "document")))
    .orderBy(desc(homeMediaTable.createdAt));
  // Same visibility as the home's photo list: members all, performers their works, uploaders their own.
  const visible = media.filter((m) => a.memberRole || (m.workId && (a.performerWorkIds.has(m.workId) || a.invitedWorkIds.has(m.workId))) || m.uploadedByUserId === userId);
  const ids = visible.map((m) => m.id);
  const tags = ids.length ? await db.select().from(mediaStageTagsTable).where(inArray(mediaStageTagsTable.mediaId, ids)) : [];
  const byMedia = new Map(tags.map((t) => [t.mediaId, t]));
  const p = homePermissions(a);
  res.json({
    aiConfigured: aiConfigured(),
    confidentThreshold: CONFIDENT,
    canEdit: p.edit || p.inspect || p.addWorks,
    canAnalyze: p.edit,
    stages: PHOTO_STAGES,
    progress: await progressOf(a.home.id),
    photos: visible.filter((m) => m.contentType.startsWith("image/")).map((m) => {
      const t = byMedia.get(m.id);
      const needsReview = !!t && t.stageStatus === "ai_suggested" && (t.aiConfidence ?? 0) < CONFIDENT;
      return {
        mediaId: m.id, url: homeMediaUrl(m.id), workId: m.workId, roomId: m.roomId, uploadedAt: m.createdAt.toISOString(), takenAt: m.takenAt?.toISOString() ?? null, caption: m.caption,
        aiStatus: t?.aiStatus ?? "none", aiError: t?.aiError ?? null, aiStage: t?.aiStage ?? null, aiConfidence: t?.aiConfidence ?? null, aiEvidence: t?.aiEvidence ?? null,
        aiRoomKind: t?.aiRoomKind ?? null, aiUtility: t?.aiUtility ?? null, aiUtilities: t?.aiUtilities ?? [],
        stage: t?.stage ?? null, stageStatus: t ? t.stageStatus : "none", roomKind: t?.roomKind ?? t?.aiRoomKind ?? null,
        utility: t?.utility ?? t?.aiUtility ?? null, needsReview, decidedAt: t?.decidedAt?.toISOString() ?? null,
      };
    }),
  });
});

/** "Fotoları mərhələlər üzrə təşkil et": queues every photo of the home that has no stage analysis yet (and, if asked, the failed ones). */
router.post("/homes/:homeId/photo-stages/analyze", async (req, res): Promise<void> => {
  const a = await getHomeAccess(uid(req), String(req.params.homeId));
  if (!a) return notFound(res, "Ev tapılmadı");
  if (!homePermissions(a).edit) return forbidden(res);
  if (!aiConfigured()) { res.status(503).json({ error: "AI analizi hələ qoşulmayıb" }); return; }
  const b = z.object({ retryFailed: z.boolean().default(true) }).safeParse(req.body ?? {});
  if (!b.success) return bad(res);
  const media = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt)));
  const queued = await enqueuePhotos(media, { retry: b.data.retryFailed });
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: a.memberRole ?? "member", action: "photo_stages.analyze", entityType: "home", entityId: a.home.id, summary: `${queued} foto növbəyə alındı` });
  res.json({ queued, progress: await progressOf(a.home.id) });
});

const Decision = z.object({
  action: z.enum(["confirm", "set", "undetermined"]),
  stage: z.string().refine((s) => STAGE_KEYS.includes(s)).optional(),
  roomKind: z.enum(ROOM_KINDS).nullable().optional(),
  utility: z.enum(UTILITIES).nullable().optional(),
});

router.post("/homes/:homeId/photo-stages/:mediaId", async (req, res): Promise<void> => {
  const a = await getHomeAccess(uid(req), String(req.params.homeId));
  if (!a) return notFound(res, "Ev tapılmadı");
  const p = homePermissions(a);
  const mediaId = String(req.params.mediaId);
  if (!isUuid(mediaId)) return notFound(res, "Foto tapılmadı");
  const [m] = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.id, mediaId), eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt)));
  if (!m || m.phase === "finance" || m.phase === "document") return notFound(res, "Foto tapılmadı");
  const performerOwn = !!m.workId && a.performerWorkIds.has(m.workId);
  if (!(p.edit || p.inspect || performerOwn)) return forbidden(res);
  const b = Decision.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Mərhələni seçin");
  const d = b.data;
  let [t] = await db.select().from(mediaStageTagsTable).where(eq(mediaStageTagsTable.mediaId, m.id));
  if (!t) {
    // A person can tag a photo that AI never saw (AI off, video still, old photo).
    [t] = await db.insert(mediaStageTagsTable).values({ mediaId: m.id, homeId: a.home.id, aiStatus: "skipped", aiError: "Əl ilə" })
      .onConflictDoNothing({ target: mediaStageTagsTable.mediaId }).returning();
    if (!t) [t] = await db.select().from(mediaStageTagsTable).where(eq(mediaStageTagsTable.mediaId, m.id));
  }
  let stage: string | null, stageStatus: string;
  if (d.action === "confirm") {
    if (!t.aiStage) return bad(res, "AI təklifi yoxdur — mərhələni seçin");
    stage = t.aiStage; stageStatus = "confirmed";
  } else if (d.action === "set") {
    if (!d.stage) return bad(res, "Mərhələni seçin");
    stage = d.stage; stageStatus = d.stage === t.aiStage ? "confirmed" : "changed";
  } else { stage = null; stageStatus = "undetermined"; }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (stage !== t.stage) changes.stage = { from: t.stage, to: stage };
  if (stageStatus !== t.stageStatus) changes.stageStatus = { from: t.stageStatus, to: stageStatus };
  const set: Partial<typeof mediaStageTagsTable.$inferInsert> = { stage, stageStatus, decidedByUserId: uid(req), decidedAt: new Date(), updatedAt: new Date() };
  if (d.roomKind !== undefined) { set.roomKind = d.roomKind; changes.roomKind = { from: t.roomKind ?? t.aiRoomKind, to: d.roomKind }; }
  if (d.utility !== undefined) { set.utility = d.utility; changes.utility = { from: t.utility ?? t.aiUtility, to: d.utility }; }
  await db.update(mediaStageTagsTable).set(set).where(eq(mediaStageTagsTable.id, t.id));
  // Corrections of the AI are kept (audit) to measure quality; nothing is retrained from them.
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: a.memberRole ?? "performer", action: `photo_stage.${stageStatus}`, entityType: "media", entityId: m.id,
    summary: `${PHOTO_STAGES.find((s) => s.key === stage)?.label ?? "Müəyyən edilməyib"}${t.aiStage && t.aiStage !== stage ? ` (AI: ${PHOTO_STAGES.find((s) => s.key === t.aiStage)?.label})` : ""}`, changes });
  res.json({ stage, stageStatus });
});

export default router;
