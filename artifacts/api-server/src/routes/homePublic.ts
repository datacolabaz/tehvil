import { Readable } from "node:stream";
import { getAuth } from "@clerk/express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import { GetHomeInvitationParams, GetHomeMediaParams, GetPublicHomeParams, GetSharedHomeParams, GetWorkerParams } from "@workspace/api-zod";
import {
  db,
  equipmentTable,
  homeInvitationsTable,
  homeMediaTable,
  homeRoomsTable,
  homeSharesTable,
  homesTable,
  infrastructureItemsTable,
  workersTable,
  workParticipantsTable,
  workRecordsTable,
  type ShareScopeJson,
} from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { rateLimit } from "../lib/rateLimit";
import { hashToken } from "../lib/realtorCore";
import { activeShare, canReadMedia, shareIncludesWork } from "../lib/homeMedia";
import { homeMediaUrl, loadWorkers } from "../lib/homeDtos";
import { loadWorker, workerProfile } from "../lib/workerProfile";
import type { HomeRow, WorkRow } from "../lib/homeAccess";

/*
 * Endpoints that work without sign-in. The QR code carries only the stable public id;
 * it shows what the owner chose (publicLevel). Secret share links carry a revocable
 * token and show the chosen scope. Neither ever exposes performer contacts or audit data.
 */

const router: IRouter = Router();
const storage = new ObjectStorageService();
const readLimit = rateLimit({ windowMs: 60_000, max: 240, key: (req) => `hp:${req.ip}` });
const tokenLimit = rateLimit({ windowMs: 60_000, max: 60, key: (req) => `ht:${req.ip}` });
const gone = (res: Response, error = "Bu link aktiv deyil") => { res.status(404).json({ error }); };
const viewer = (req: Parameters<typeof getAuth>[0]) => getAuth(req).userId ?? null;

/* --------------------------------------------------------------- media file */

router.get("/home-media/:mediaId", readLimit, async (req, res): Promise<void> => {
  const p = GetHomeMediaParams.safeParse(req.params);
  if (!p.success) return gone(res, "File not found");
  const [media] = await db.select().from(homeMediaTable).where(eq(homeMediaTable.id, p.data.mediaId));
  if (!media) return gone(res, "File not found");
  const share = typeof req.query.s === "string" ? req.query.s : null;
  const level = await canReadMedia(media, viewer(req), share);
  if (!level) return gone(res, "File not found");
  try {
    const file = await storage.getObjectEntityFile(media.objectPath);
    const response = await storage.downloadObject(file, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", level === "public" ? "public, max-age=300" : "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return gone(res, "File not found");
    req.log.error({ err: error }, "Failed to stream home media");
    res.status(500).json({ error: "Failed to serve file" });
  }
});

/* ------------------------------------------------------ public & shared home */

async function publicHomeDto(home: HomeRow, opts: { mode: "qr" } | { mode: "share"; level: string; scope: ShareScopeJson; token: string; label: string }) {
  const share = opts.mode === "share" ? opts : null;
  const showPhotos = share ? share.scope.includePhotos : home.publicShowPhotos;
  const rooms = await db.select().from(homeRoomsTable).where(eq(homeRoomsTable.homeId, home.id)).orderBy(homeRoomsTable.position);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  let works: WorkRow[] = [];
  if (share) {
    works = (await db.select().from(workRecordsTable).where(eq(workRecordsTable.homeId, home.id)))
      .filter((w) => shareIncludesWork(share.scope, share.level, w) && (share.level === "technical" || w.visibility === "public" || share.scope.workIds.includes(w.id)));
  } else if (home.publicLevel === "history") {
    works = await db.select().from(workRecordsTable).where(and(eq(workRecordsTable.homeId, home.id), eq(workRecordsTable.status, "confirmed"), eq(workRecordsTable.visibility, "public")));
  }
  works.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  const ids = works.map((w) => w.id);
  const parts = ids.length ? await db.select().from(workParticipantsTable).where(and(inArray(workParticipantsTable.workId, ids), inArray(workParticipantsTable.status, ["accepted", "recorded"]))) : [];
  const workers = await loadWorkers(parts.map((p) => p.workerId));
  const media = ids.length && showPhotos
    ? await db.select().from(homeMediaTable).where(and(inArray(homeMediaTable.workId, ids), isNull(homeMediaTable.deletedAt))).orderBy(homeMediaTable.createdAt)
    : [];
  const technical = share?.level === "technical";

  const allEquipment = await db.select().from(equipmentTable).where(eq(equipmentTable.homeId, home.id));
  const equipment = share
    ? allEquipment.filter((e) => share.level === "technical" || share.scope.equipmentIds.includes(e.id) || (!!e.roomId && share.scope.roomIds.includes(e.roomId)))
    : home.publicShowEquipment && home.publicLevel !== "off" ? allEquipment : [];

  const infra = share && share.scope.includeInfrastructure
    ? (await db.select().from(infrastructureItemsTable).where(eq(infrastructureItemsTable.homeId, home.id)))
      .filter((i) => share.level === "technical" || (!!i.roomId && share.scope.roomIds.includes(i.roomId)) || (!!i.workId && ids.includes(i.workId)))
    : [];

  return {
    publicId: home.publicId, name: home.name, propertyType: home.propertyType, city: home.city, district: home.district,
    address: share || home.publicShowAddress ? home.address || null : null,
    areaM2: home.areaM2, roomCount: home.roomCount, builtYear: home.builtYear, stage: home.stage,
    coverUrl: home.coverMediaId && showPhotos ? homeMediaUrl(home.coverMediaId, share?.token) : null,
    level: share ? share.level : home.publicLevel,
    rooms: (share && share.level === "selected" ? rooms.filter((r) => share.scope.roomIds.includes(r.id)) : rooms).map((r) => r.name),
    works: works.map((w) => ({
      id: w.id, title: w.title, category: w.category, kind: w.kind, status: w.status, startDate: w.startDate ?? null, endDate: w.endDate ?? null,
      roomName: w.roomId ? roomName.get(w.roomId) ?? null : null,
      performers: parts.filter((p) => p.workId === w.id).map((p) => {
        const wk = workers.get(p.workerId)!;
        // A name typed by the owner for a non-registered person is not published.
        const registered = wk.status === "active" && p.status === "accepted";
        return { id: registered ? wk.id : "", displayName: registered ? wk.displayName : "Qeydiyyatsız icraçı", kind: wk.kind, role: p.role, profilePublic: registered };
      }),
      photos: media.filter((m) => m.workId === w.id && m.contentType.startsWith("image/") && (technical || m.phase !== "hidden" || !!share)).map((m) => homeMediaUrl(m.id, share?.token)),
      confirmed: w.status === "confirmed", inspected: !!w.inspectedAt, description: w.description, materials: share ? w.materials : "",
    })),
    equipment: equipment.map((e) => ({
      id: e.id, name: e.name, category: e.category, brand: e.brand, model: e.model, installedAt: e.installedAt ?? null, warrantyUntil: e.warrantyUntil ?? null,
      roomName: e.roomId ? roomName.get(e.roomId) ?? null : null,
    })),
    infrastructure: infra.map((i) => ({
      id: i.id, type: i.type, label: i.label, notes: i.notes, roomName: i.roomId ? roomName.get(i.roomId) ?? null : null,
      mediaUrl: i.mediaId && share ? homeMediaUrl(i.mediaId, share.token) : null, points: i.points ?? [], source: i.source, verified: !!i.verifiedAt,
    })),
    shareLabel: share?.label || null,
    updatedAt: home.updatedAt.toISOString(),
  };
}

router.get("/public/homes/:publicId", readLimit, async (req, res): Promise<void> => {
  const p = GetPublicHomeParams.safeParse(req.params);
  if (!p.success) return gone(res, "Ev tapılmadı");
  const [home] = await db.select().from(homesTable).where(eq(homesTable.publicId, p.data.publicId));
  if (!home || home.archivedAt || home.publicLevel === "off") return gone(res, "Bu evin səhifəsi ictimai deyil");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(await publicHomeDto(home, { mode: "qr" }));
});

router.get("/public/home-shares/:token", tokenLimit, async (req, res): Promise<void> => {
  const p = GetSharedHomeParams.safeParse(req.params);
  if (!p.success) return gone(res);
  const s = await activeShare(p.data.token);
  if (!s) return gone(res, "Bu paylaşım linki aktiv deyil və ya ləğv olunub");
  await db.update(homeSharesTable).set({ openCount: sql`${homeSharesTable.openCount} + 1`, lastOpenedAt: new Date() }).where(eq(homeSharesTable.id, s.share.id));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.json(await publicHomeDto(s.home, { mode: "share", level: s.share.level, scope: s.share.scope, token: p.data.token, label: s.share.label }));
});

/* ------------------------------------------------------------- invitations */

router.get("/invitations/:token", tokenLimit, async (req, res): Promise<void> => {
  const p = GetHomeInvitationParams.safeParse(req.params);
  if (!p.success) return gone(res);
  const [inv] = await db.select().from(homeInvitationsTable).where(eq(homeInvitationsTable.tokenHash, hashToken(p.data.token)));
  if (!inv) return gone(res, "Dəvət tapılmadı");
  const [home] = inv.homeId ? await db.select({ name: homesTable.name, archivedAt: homesTable.archivedAt }).from(homesTable).where(eq(homesTable.id, inv.homeId)) : [];
  const [work] = inv.workId ? await db.select({ title: workRecordsTable.title }).from(workRecordsTable).where(eq(workRecordsTable.id, inv.workId)) : [];
  const [group] = inv.groupId ? await db.select({ name: workersTable.displayName, kind: workersTable.kind }).from(workersTable).where(eq(workersTable.id, inv.groupId)) : [];
  const [ph] = inv.placeholderWorkerId ? await db.select({ name: workersTable.displayName, status: workersTable.status }).from(workersTable).where(eq(workersTable.id, inv.placeholderWorkerId)) : [];
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    kind: inv.kind, role: inv.role, status: home?.archivedAt ? "revoked" : inv.status, expired: inv.expiresAt <= new Date(),
    homeName: home?.name ?? null, workTitle: work?.title ?? null, groupName: group?.name ?? null, groupKind: group?.kind ?? null,
    name: inv.name, placeholderName: ph?.status === "placeholder" ? ph.name : null,
  });
});

/* ----------------------------------------------------------- worker profile */

router.get("/workers/:workerId", readLimit, async (req, res): Promise<void> => {
  const p = GetWorkerParams.safeParse(req.params);
  if (!p.success) return gone(res, "Profil tapılmadı");
  const worker = await loadWorker(p.data.workerId);
  const profile = worker ? await workerProfile(worker, viewer(req)) : null;
  if (!profile) return gone(res, "Profil tapılmadı");
  res.setHeader("Cache-Control", "private, no-store");
  res.json(profile);
});

export default router;
