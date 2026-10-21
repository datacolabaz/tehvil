import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, evidenceUploadsTable, homeMediaTable, homeSharesTable, homesTable, workRecordsTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import type { MediaInputValue } from "./projectMedia";
import { hashToken } from "./realtorCore";
import type { ShareScopeJson as ShareScope } from "@workspace/db";
import { getHomeAccess, loadActor } from "./homeAccess";
import type { MediaRow } from "./homeDtos";

export const HOME_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime", "application/pdf"];
/** Only photos and videos can ever leave the account (QR page, share links); files and documents stay private. */
const isVisual = (m: { contentType: string; phase: string }) => (m.contentType.startsWith("image/") || m.contentType.startsWith("video/")) && m.phase !== "document";
const MAX_BYTES = 50 * 1024 * 1024;

export class HomeMediaError extends Error {}

/** Claims fresh, unattached uploads of this user (same checks as project evidence). */
export async function attachHomeMedia(userId: string, files: MediaInputValue[], target: {
  homeId: string | null; workId: string | null; roomId: string | null; workerId: string | null; caption: string; phase: string;
  /** Device data for every file of this request (one photo per request from the camera flow). */
  takenAt?: Date | null; takenSource?: string | null; clientMeta?: Record<string, unknown> | null;
}): Promise<MediaRow[]> {
  const hashes = new Map<string, string>();
  const storage = new ObjectStorageService();
  for (const file of files) {
    if (!file.objectPath.startsWith("/objects/uploads/") || !HOME_MEDIA_TYPES.includes(file.contentType) || file.size < 1 || file.size > MAX_BYTES) {
      throw new HomeMediaError("Yalnız 50 MB-a qədər foto (JPG, PNG, WebP), video (MP4, MOV) və ya PDF fayl əlavə etmək olar");
    }
    const [upload] = await db.select().from(evidenceUploadsTable).where(and(
      eq(evidenceUploadsTable.objectPath, file.objectPath),
      eq(evidenceUploadsTable.userId, userId),
      isNull(evidenceUploadsTable.attachedAt),
      gt(evidenceUploadsTable.expiresAt, new Date()),
    )).limit(1);
    if (!upload || upload.originalName !== file.originalName || upload.contentType !== file.contentType || upload.size !== file.size) {
      throw new HomeMediaError("Faylı yenidən yükləyib təkrar cəhd edin");
    }
    const object = await storage.getObjectEntityFile(file.objectPath);
    const [metadata] = await object.getMetadata();
    if (Number(metadata.size) !== file.size || metadata.contentType !== file.contentType) {
      throw new HomeMediaError("Yüklənən fayl elan edilən ölçü və ya tiplə uyğun gəlmir");
    }
    // Server fingerprint of exactly what was stored (detects a later swap of the file).
    const h = createHash("sha256");
    for await (const chunk of object.createReadStream()) h.update(chunk as Buffer);
    hashes.set(file.objectPath, h.digest("hex"));
  }
  return db.transaction(async (tx) => {
    for (const file of files) {
      const claimed = await tx.update(evidenceUploadsTable).set({ attachedAt: new Date() }).where(and(
        eq(evidenceUploadsTable.objectPath, file.objectPath),
        eq(evidenceUploadsTable.userId, userId),
        isNull(evidenceUploadsTable.attachedAt),
      )).returning({ objectPath: evidenceUploadsTable.objectPath });
      if (!claimed.length) throw new HomeMediaError("Bu fayl artıq istifadə olunub");
    }
    return tx.insert(homeMediaTable).values(files.map((f) => ({
      homeId: target.homeId, workId: target.workId, roomId: target.roomId, workerId: target.workerId,
      objectPath: f.objectPath, originalName: f.originalName.slice(0, 255), contentType: f.contentType, size: f.size,
      caption: target.caption, phase: target.phase, uploadedByUserId: userId,
      takenAt: target.takenAt ?? null, takenSource: target.takenAt ? target.takenSource ?? null : null, clientMeta: target.clientMeta ?? null,
      sha256: hashes.get(f.objectPath) ?? "",
    }))).returning();
  });
}

/** Resolves an active share link by its secret token. */
export async function activeShare(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [share] = await db.select().from(homeSharesTable).where(eq(homeSharesTable.tokenHash, hashToken(token)));
  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt <= new Date())) return null;
  const [home] = await db.select().from(homesTable).where(eq(homesTable.id, share.homeId));
  if (!home || home.archivedAt) return null;
  return { share, home };
}

export function shareIncludesWork(scope: ShareScope, level: string, work: { id: string; roomId: string | null }) {
  if (level === "technical") return true;
  return scope.workIds.includes(work.id) || (!!work.roomId && scope.roomIds.includes(work.roomId));
}

/**
 * Who may download a media file:
 *  - its uploader; members of the home; performers of the work it belongs to
 *  - anyone, for a performer's profile photo
 *  - anyone with the QR link, if the owner made photos public and the work is public & confirmed
 *  - anyone with a valid share link whose scope covers it (documents: only if picked for that link)
 */
export async function canReadMedia(media: MediaRow, userId: string | null, shareToken: string | null): Promise<"private" | "public" | null> {
  if (media.deletedAt) return null;
  if (userId && media.uploadedByUserId === userId) return "private";
  if (!media.homeId) return media.workerId ? "public" : null;
  if (userId) {
    const access = await getHomeAccess(userId, media.homeId, await loadActor(userId));
    if (access?.memberRole) return "private";
    if (access && media.workId && (access.performerWorkIds.has(media.workId) || access.invitedWorkIds.has(media.workId))) return "private";
  }
  const [home] = await db.select().from(homesTable).where(eq(homesTable.id, media.homeId));
  if (!home || home.archivedAt) return null;
  const [work] = media.workId ? await db.select().from(workRecordsTable).where(eq(workRecordsTable.id, media.workId)) : [];
  if (shareToken && media.phase === "document") {
    // A document opens through a link only when the owner picked that exact document for it.
    const s = await activeShare(shareToken);
    if (s && s.home.id === home.id && (s.share.scope.documentIds ?? []).includes(media.id)) return "private";
    return null;
  }
  if (shareToken && isVisual(media)) {
    const s = await activeShare(shareToken);
    if (s && s.home.id === home.id) {
      const scope = s.share.scope;
      if (home.coverMediaId === media.id) return "private";
      if (scope.includePhotos && work && shareIncludesWork(scope, s.share.level, work)) return "private";
      if (scope.includePhotos && !work && media.roomId && (s.share.level === "technical" || scope.roomIds.includes(media.roomId))) return "private";
    }
  }
  if (home.publicLevel !== "off" && home.publicShowPhotos && isVisual(media)) {
    if (home.coverMediaId === media.id) return "public";
    if (home.publicLevel === "history" && work && work.visibility === "public" && work.status === "confirmed" && media.phase !== "hidden") return "public";
  }
  return null;
}
