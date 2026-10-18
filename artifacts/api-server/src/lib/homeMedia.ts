import { and, eq, gt, isNull } from "drizzle-orm";
import { db, evidenceUploadsTable, homeMediaTable, homeSharesTable, homesTable, workRecordsTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import type { MediaInputValue } from "./projectMedia";
import { hashToken } from "./realtorCore";
import type { ShareScopeJson as ShareScope } from "@workspace/db";
import { getHomeAccess, loadActor } from "./homeAccess";
import type { MediaRow } from "./homeDtos";

export const HOME_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];
const MAX_BYTES = 50 * 1024 * 1024;

export class HomeMediaError extends Error {}

/** Claims fresh, unattached uploads of this user (same checks as project evidence). */
export async function attachHomeMedia(userId: string, files: MediaInputValue[], target: {
  homeId: string | null; workId: string | null; roomId: string | null; workerId: string | null; caption: string; phase: string;
}): Promise<MediaRow[]> {
  const storage = new ObjectStorageService();
  for (const file of files) {
    if (!file.objectPath.startsWith("/objects/uploads/") || !HOME_MEDIA_TYPES.includes(file.contentType) || file.size < 1 || file.size > MAX_BYTES) {
      throw new HomeMediaError("Yalnız 50 MB-a qədər şəkil (JPG, PNG, WebP, GIF) və ya video (MP4, WebM, MOV) əlavə oluna bilər");
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
 *  - anyone with a valid share link whose scope covers it
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
  if (shareToken) {
    const s = await activeShare(shareToken);
    if (s && s.home.id === home.id) {
      const scope = s.share.scope;
      if (home.coverMediaId === media.id) return "private";
      if (scope.includePhotos && work && shareIncludesWork(scope, s.share.level, work)) return "private";
      if (scope.includePhotos && !work && media.roomId && (s.share.level === "technical" || scope.roomIds.includes(media.roomId))) return "private";
    }
  }
  if (home.publicLevel !== "off" && home.publicShowPhotos) {
    if (home.coverMediaId === media.id) return "public";
    if (home.publicLevel === "history" && work && work.visibility === "public" && work.status === "confirmed" && media.phase !== "hidden") return "public";
  }
  return null;
}
