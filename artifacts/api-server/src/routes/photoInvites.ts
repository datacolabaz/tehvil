import { getAuth } from "@clerk/express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { AddInvitePhotoBody, CreatePhotoInviteBody, RequestInviteUploadUrlBody, SetInviteStageStatusBody } from "@workspace/api-zod";
import { db, evidenceUploadsTable, homeMediaTable, homesTable, stagePhotoInvitesTable, workApprovalsTable, workRecordsTable } from "@workspace/db";
import { photoTags } from "../lib/buildDiary";
import { templateOf } from "../lib/buildTemplates";
import { audit, getHomeAccess, getWorkAccess, homePermissions } from "../lib/homeAccess";
import { attachHomeMedia, HomeMediaError } from "../lib/homeMedia";
import { ObjectStorageService } from "../lib/objectStorage";
import { rateLimit } from "../lib/rateLimit";
import { hashToken, newToken, publicOrigin } from "../lib/realtorCore";

/**
 * Photo invitation links: the owner sends a link for one stage of one home; whoever opens it can take a photo
 * and it lands in that stage — no account, no choosing a home or stage. The token is the only key: it is
 * checked on the server for every request, stored only as SHA-256, revocable, optionally limited in time and
 * number of uploads, and never opens anything else of the home. A stage is never accepted through a link.
 * A link without a stage (work_id null) covers the whole construction diary: the person picks one of the visible
 * stages (titles only) and can only add photos — never change a status.
 */
export const photoInvitePublicRouter: IRouter = Router();
const router: IRouter = Router();
const storage = new ObjectStorageService();
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO = 15 * 1024 * 1024;
const openLimit = rateLimit({ windowMs: 60_000, max: 60, key: (req) => `phi:${req.ip}` });

type Invite = typeof stagePhotoInvitesTable.$inferSelect;
const uid = (req: Request) => getAuth(req).userId!;
const bad = (res: Response, error: string, status = 400) => { res.status(status).json({ error }); };
const actor = (inv: Invite) => `invite:${inv.id}`;
const stateOf = (inv: Invite) => inv.revokedAt ? "revoked" : inv.expiresAt && inv.expiresAt <= new Date() ? "expired" : inv.maxUploads != null && inv.uploadCount >= inv.maxUploads ? "used_up" : "active";
const dto = (inv: Invite, workTitle: string | null, url?: string) => ({
  id: inv.id, workId: inv.workId, workTitle: workTitle ?? "Bütün tikinti", scope: inv.workId ? "stage" : "home", permission: inv.permission, label: inv.label, createdAt: inv.createdAt.toISOString(),
  expiresAt: inv.expiresAt?.toISOString() ?? null, maxUploads: inv.maxUploads ?? null, uploadCount: inv.uploadCount,
  revokedAt: inv.revokedAt?.toISOString() ?? null, lastUsedAt: inv.lastUsedAt?.toISOString() ?? null, state: stateOf(inv), ...(url ? { url } : {}),
});

/** The invitation behind a token, with its stage and home — null if unknown, revoked, expired or the stage/home is gone. */
async function live(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [inv] = await db.select().from(stagePhotoInvitesTable).where(eq(stagePhotoInvitesTable.tokenHash, hashToken(token)));
  if (!inv || inv.revokedAt || (inv.expiresAt && inv.expiresAt <= new Date())) return null;
  const [home] = await db.select().from(homesTable).where(eq(homesTable.id, inv.homeId));
  if (!home || home.archivedAt) return null;
  if (!inv.workId) return { inv, work: null, home };
  const [work] = await db.select().from(workRecordsTable).where(and(eq(workRecordsTable.id, inv.workId), eq(workRecordsTable.homeId, inv.homeId)));
  if (!work) return null;
  return { inv, work, home };
}
type Live = NonNullable<Awaited<ReturnType<typeof live>>>;
/** Stages a whole-diary link may add to: titles, templates and status only. */
async function linkStages(homeId: string) {
  const rows = await db.select().from(workRecordsTable).where(and(eq(workRecordsTable.homeId, homeId), isNull(workRecordsTable.hiddenAt)));
  return rows.sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.createdAt.getTime() - b.createdAt.getTime()).map((w) => {
    const t = templateOf(w.templateKey);
    return { id: w.id, title: w.title, status: w.status, hint: t?.hint ?? null, shots: t?.shots ?? [], perFloor: t?.perFloor ?? true, perRoom: t?.perRoom ?? false };
  });
}
const preview = async (x: Live) => ({
  // Only the home's own name (the owner chose it) — never the address or the owner's details.
  homeName: x.home.name, scope: x.work ? "stage" : "home",
  stageTitle: x.work?.title ?? "Tikinti tarixçəsi", stageStatus: x.work?.status ?? "in_progress", permission: x.work ? x.inv.permission : "photos",
  expiresAt: x.inv.expiresAt?.toISOString() ?? null, remaining: x.inv.maxUploads == null ? null : Math.max(0, x.inv.maxUploads - x.inv.uploadCount), uploadCount: x.inv.uploadCount,
  ...(x.work ? { stage: { id: x.work.id, hint: templateOf(x.work.templateKey)?.hint ?? null, shots: templateOf(x.work.templateKey)?.shots ?? [], perFloor: templateOf(x.work.templateKey)?.perFloor ?? true, perRoom: templateOf(x.work.templateKey)?.perRoom ?? false } } : { stages: await linkStages(x.home.id), currentWorkId: x.home.currentWorkId }),
});
const noStore = (res: Response) => { res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); res.setHeader("Referrer-Policy", "no-referrer"); };

/* ------------------------------------------------------------------ owner side */

router.post("/works/:workId/photo-invites", async (req, res): Promise<void> => {
  const a = await getWorkAccess(uid(req), String(req.params.workId));
  if (!a) return bad(res, "Mərhələ tapılmadı", 404);
  if (!homePermissions(a.homeAccess).edit) return bad(res, "Dəvət linkini yalnız evi idarə edən yarada bilər", 403);
  const b = CreatePhotoInviteBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Dəvətin seçimlərini yoxlayın");
  const d = b.data;
  const days = d.expiresInDays === undefined ? 30 : d.expiresInDays;
  const token = newToken();
  const [inv] = await db.insert(stagePhotoInvitesTable).values({
    homeId: a.work.homeId, workId: a.work.id, tokenHash: hashToken(token), permission: d.permission ?? "photos", label: (d.label ?? "").trim(), createdByUserId: uid(req),
    expiresAt: days == null ? null : new Date(Date.now() + Math.max(1, Math.min(365, Math.round(days))) * 86_400_000),
    maxUploads: d.maxUploads == null ? null : Math.max(1, Math.min(500, Math.round(d.maxUploads))),
  }).returning();
  await audit({ homeId: a.work.homeId, actorUserId: uid(req), actorRole: a.role, action: "photo_invite.created", entityType: "work", entityId: a.work.id, summary: `${a.work.title}: ${inv.permission}${inv.label ? ` (${inv.label})` : ""}` });
  res.json(dto(inv, a.work.title, `${publicOrigin(req)}/f/${token}`));
});

/** A link for the whole construction diary (photos only; the person picks the stage). */
router.post("/homes/:homeId/photo-invites", async (req, res): Promise<void> => {
  const ha = await getHomeAccess(uid(req), String(req.params.homeId));
  if (!ha) return bad(res, "Ev tapılmadı", 404);
  if (!homePermissions(ha).edit) return bad(res, "Dəvət linkini yalnız evi idarə edən yarada bilər", 403);
  const b = CreatePhotoInviteBody.safeParse(req.body ?? {});
  if (!b.success) return bad(res, "Dəvətin seçimlərini yoxlayın");
  const d = b.data;
  const days = d.expiresInDays === undefined ? 30 : d.expiresInDays;
  const token = newToken();
  const [inv] = await db.insert(stagePhotoInvitesTable).values({
    homeId: ha.home.id, workId: null, tokenHash: hashToken(token), permission: "photos", label: (d.label ?? "").trim(), createdByUserId: uid(req),
    expiresAt: days == null ? null : new Date(Date.now() + Math.max(1, Math.min(365, Math.round(days))) * 86_400_000),
    maxUploads: d.maxUploads == null ? null : Math.max(1, Math.min(500, Math.round(d.maxUploads))),
  }).returning();
  await audit({ homeId: ha.home.id, actorUserId: uid(req), actorRole: ha.role, action: "photo_invite.created", entityType: "home", entityId: ha.home.id, summary: `Bütün tikinti: photos${inv.label ? ` (${inv.label})` : ""}` });
  res.json(dto(inv, null, `${publicOrigin(req)}/f/${token}`));
});

router.get("/homes/:homeId/photo-invites", async (req, res): Promise<void> => {
  const ha = await getHomeAccess(uid(req), String(req.params.homeId));
  if (!ha) return bad(res, "Ev tapılmadı", 404);
  if (!homePermissions(ha).edit) return bad(res, "Bu əməliyyat üçün icazəniz yoxdur", 403);
  const rows = await db.select({ inv: stagePhotoInvitesTable, title: workRecordsTable.title }).from(stagePhotoInvitesTable)
    .leftJoin(workRecordsTable, eq(workRecordsTable.id, stagePhotoInvitesTable.workId))
    .where(eq(stagePhotoInvitesTable.homeId, ha.home.id)).orderBy(desc(stagePhotoInvitesTable.createdAt));
  res.json(rows.map((r) => dto(r.inv, r.title)));
});

router.delete("/homes/:homeId/photo-invites/:inviteId", async (req, res): Promise<void> => {
  const ha = await getHomeAccess(uid(req), String(req.params.homeId));
  if (!ha) return bad(res, "Ev tapılmadı", 404);
  if (!homePermissions(ha).edit) return bad(res, "Bu əməliyyat üçün icazəniz yoxdur", 403);
  const id = String(req.params.inviteId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad(res, "Dəvət tapılmadı", 404);
  const [cur] = await db.select().from(stagePhotoInvitesTable).where(and(eq(stagePhotoInvitesTable.id, id), eq(stagePhotoInvitesTable.homeId, ha.home.id)));
  if (!cur) return bad(res, "Dəvət tapılmadı", 404);
  const [inv] = cur.revokedAt ? [cur] : await db.update(stagePhotoInvitesTable).set({ revokedAt: new Date() }).where(eq(stagePhotoInvitesTable.id, cur.id)).returning();
  const [w] = inv.workId ? await db.select({ title: workRecordsTable.title }).from(workRecordsTable).where(eq(workRecordsTable.id, inv.workId)) : [];
  if (!cur.revokedAt) await audit({ homeId: ha.home.id, actorUserId: uid(req), actorRole: ha.role, action: "photo_invite.revoked", entityType: inv.workId ? "work" : "home", entityId: inv.workId ?? ha.home.id, summary: w?.title ?? "Bütün tikinti" });
  res.json(dto(inv, inv.workId ? w?.title ?? "" : null));
});

/* ------------------------------------------------------------------ the link (no account) */

photoInvitePublicRouter.get("/photo-invites/:token", openLimit, async (req, res): Promise<void> => {
  noStore(res);
  const x = await live(String(req.params.token));
  if (!x) return bad(res, "Link etibarsızdır, müddəti bitib və ya ləğv edilib. Ev sahibindən yeni link istəyin.", 404);
  res.json(await preview(x));
});

photoInvitePublicRouter.post("/photo-invites/:token/upload-url", openLimit, async (req, res): Promise<void> => {
  noStore(res);
  const x = await live(String(req.params.token));
  if (!x) return bad(res, "Link etibarsızdır, müddəti bitib və ya ləğv edilib", 404);
  if (x.inv.maxUploads != null && x.inv.uploadCount >= x.inv.maxUploads) return bad(res, "Bu link üçün foto limiti dolub", 409);
  const b = RequestInviteUploadUrlBody.safeParse(req.body);
  if (!b.success || !PHOTO_TYPES.includes(b.data.contentType) || b.data.size < 1 || b.data.size > MAX_PHOTO) return bad(res, "Yalnız 15 MB-a qədər JPG, PNG və ya WebP foto yükləmək olar");
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  await db.insert(evidenceUploadsTable).values({ objectPath, userId: actor(x.inv), originalName: b.data.name.slice(0, 255), contentType: b.data.contentType, size: b.data.size, expiresAt: new Date(Date.now() + 30 * 60_000) });
  res.json({ uploadURL, objectPath });
});

photoInvitePublicRouter.post("/photo-invites/:token/photos", openLimit, async (req, res): Promise<void> => {
  noStore(res);
  const x = await live(String(req.params.token));
  if (!x) return bad(res, "Link etibarsızdır, müddəti bitib və ya ləğv edilib", 404);
  const b = AddInvitePhotoBody.safeParse(req.body);
  if (!b.success || !PHOTO_TYPES.includes(b.data.file.contentType)) return bad(res, "Foto düzgün deyil");
  const d = b.data;
  // A repeated tap or a retry after a lost response: the same upload is returned, not added twice.
  const [dup] = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.objectPath, d.file.objectPath), eq(homeMediaTable.inviteId, x.inv.id)));
  if (dup) return void res.json({ id: dup.id, createdAt: dup.createdAt.toISOString(), uploadCount: x.inv.uploadCount, duplicate: true });
  // A whole-diary link: the stage comes from the person's choice, and must be a visible stage of this home.
  const raw = (req.body ?? {}) as Record<string, unknown>;
  let work = x.work;
  if (!work) {
    const wid = typeof raw.workId === "string" ? raw.workId : "";
    const [w] = /^[0-9a-f-]{36}$/i.test(wid) ? await db.select().from(workRecordsTable).where(and(eq(workRecordsTable.id, wid), eq(workRecordsTable.homeId, x.home.id), isNull(workRecordsTable.hiddenAt))) : [];
    if (!w) return bad(res, "Mərhələni seçin");
    work = w;
  }
  const tags = photoTags(raw, work.templateKey);
  // Reserve one upload within the limit first, so two parallel requests cannot pass it.
  const [counted] = await db.update(stagePhotoInvitesTable).set({ uploadCount: sql`${stagePhotoInvitesTable.uploadCount} + 1`, lastUsedAt: new Date() })
    .where(and(eq(stagePhotoInvitesTable.id, x.inv.id), isNull(stagePhotoInvitesTable.revokedAt), or(isNull(stagePhotoInvitesTable.maxUploads), sql`${stagePhotoInvitesTable.uploadCount} < ${stagePhotoInvitesTable.maxUploads}`))).returning();
  if (!counted) return bad(res, "Bu link üçün foto limiti dolub", 409);
  const taken = d.takenAt ? new Date(d.takenAt) : null;
  const takenAt = taken && !Number.isNaN(taken.getTime()) && taken.getTime() <= Date.now() + 5 * 60_000 && taken.getTime() > Date.now() - 30 * 365 * 86_400_000 ? taken : null;
  const cm = (d as { clientMeta?: { gps?: { lat?: unknown; lon?: unknown }; gpsSource?: unknown } }).clientMeta;
  const lat = Number(cm?.gps?.lat), lon = Number(cm?.gps?.lon);
  const clientMeta = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0)
    ? { gps: { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 }, gpsSource: cm?.gpsSource === "device" ? "device" : "exif" } : null;
  try {
    const [m] = await attachHomeMedia(actor(x.inv), [d.file], { homeId: x.home.id, workId: work.id, roomId: work.roomId, workerId: null, caption: (d.note ?? "").trim().slice(0, 300), phase: "during", takenAt, takenSource: d.takenSource ?? null, clientMeta });
    await db.update(homeMediaTable).set({ inviteId: x.inv.id, ...tags }).where(eq(homeMediaTable.id, m.id));
    await audit({ homeId: x.home.id, actorUserId: actor(x.inv), actorRole: "invite", action: "media.added_via_invite", entityType: "work", entityId: work.id, summary: `${work.title}: 1 foto (dəvət linki)` });
    res.json({ id: m.id, createdAt: m.createdAt.toISOString(), uploadCount: counted.uploadCount, duplicate: false });
  } catch (err) {
    await db.update(stagePhotoInvitesTable).set({ uploadCount: sql`greatest(${stagePhotoInvitesTable.uploadCount} - 1, 0)` }).where(eq(stagePhotoInvitesTable.id, x.inv.id));
    if (err instanceof HomeMediaError) return bad(res, err.message);
    throw err;
  }
});

/** Started / finished only; "finished" means waiting for the owner's review. Acceptance stays with the owner. */
photoInvitePublicRouter.post("/photo-invites/:token/status", openLimit, async (req, res): Promise<void> => {
  noStore(res);
  const x = await live(String(req.params.token));
  if (!x) return bad(res, "Link etibarsızdır, müddəti bitib və ya ləğv edilib", 404);
  if (!x.work || x.inv.permission !== "photos_status") return bad(res, "Bu link yalnız foto əlavə etməyə icazə verir", 403);
  const xw = { ...x, work: x.work };
  const b = SetInviteStageStatusBody.safeParse(req.body);
  if (!b.success) return bad(res, "Statusu seçin");
  const t = b.data.action === "start" ? { from: ["planned", "revision"], to: "in_progress" } : { from: ["planned", "in_progress", "revision"], to: "completed" };
  if (x.work.status === t.to) return void res.json(await preview(x));
  if (!t.from.includes(x.work.status)) return bad(res, x.work.status === "confirmed" ? "Mərhələ artıq ev sahibi tərəfindən qəbul edilib" : "Bu statusdan bu addım mümkün deyil", 409);
  const now = new Date();
  const [w] = await db.update(workRecordsTable).set({ status: t.to, updatedAt: now, ...(t.to === "completed" ? { completedAt: now } : {}) })
    .where(and(eq(workRecordsTable.id, x.work.id), eq(workRecordsTable.status, x.work.status))).returning();
  if (!w) return bad(res, "Mərhələ bu anda dəyişdi. Yenidən cəhd edin", 409);
  await db.insert(workApprovalsTable).values({ workId: w.id, action: b.data.action, fromStatus: x.work.status, toStatus: t.to, actorUserId: actor(x.inv), actorRole: "invite", note: "" });
  await audit({ homeId: x.home.id, actorUserId: actor(x.inv), actorRole: "invite", action: `work.${b.data.action}_via_invite`, entityType: "work", entityId: w.id, summary: `${w.title}: ${x.work.status} → ${t.to}`, changes: { status: { from: x.work.status, to: t.to } } });
  res.json(await preview({ ...xw, work: w }));
});

export default router;
