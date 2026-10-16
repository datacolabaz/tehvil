import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, evidenceUploadsTable, realtorMediaTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import type { MediaInputValue } from "./projectMedia";

/** Photos shown to buyers must render in every browser, so only web image formats are accepted. */
export const REALTOR_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type RealtorMediaRow = typeof realtorMediaTable.$inferSelect;

export const realtorMediaUrl = (id: string) => `/api/realtor-media/${id}`;

export function mediaDto(m: RealtorMediaRow) {
  return { id: m.id, url: realtorMediaUrl(m.id), originalName: m.originalName, contentType: m.contentType, size: m.size };
}

export class MediaError extends Error {}

/**
 * Claims files uploaded through /storage/uploads/request-url by this user and
 * registers them as realtor media. Same checks as project evidence: the upload
 * must be fresh, unclaimed, owned by the caller and match its declared size/type.
 */
export async function attachRealtorMedia(userId: string, files: MediaInputValue[]): Promise<RealtorMediaRow[]> {
  const storage = new ObjectStorageService();
  for (const file of files) {
    if (!file.objectPath.startsWith("/objects/uploads/") || !REALTOR_IMAGE_TYPES.includes(file.contentType) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      throw new MediaError("Yalnız 15 MB-a qədər JPG, PNG, WebP və ya GIF şəkil istifadə oluna bilər");
    }
    const [upload] = await db.select().from(evidenceUploadsTable).where(and(
      eq(evidenceUploadsTable.objectPath, file.objectPath),
      eq(evidenceUploadsTable.userId, userId),
      isNull(evidenceUploadsTable.attachedAt),
      gt(evidenceUploadsTable.expiresAt, new Date()),
    )).limit(1);
    if (!upload || upload.originalName !== file.originalName || upload.contentType !== file.contentType || upload.size !== file.size) {
      throw new MediaError("Şəkli yenidən yükləyib təkrar cəhd edin");
    }
    const object = await storage.getObjectEntityFile(file.objectPath);
    const [metadata] = await object.getMetadata();
    if (Number(metadata.size) !== file.size || metadata.contentType !== file.contentType) {
      throw new MediaError("Yüklənən fayl elan edilən ölçü və ya tiplə uyğun gəlmir");
    }
  }
  return db.transaction(async (tx) => {
    for (const file of files) {
      const claimed = await tx.update(evidenceUploadsTable).set({ attachedAt: new Date() }).where(and(
        eq(evidenceUploadsTable.objectPath, file.objectPath),
        eq(evidenceUploadsTable.userId, userId),
        isNull(evidenceUploadsTable.attachedAt),
      )).returning({ objectPath: evidenceUploadsTable.objectPath });
      if (!claimed.length) throw new MediaError("Bu fayl artıq istifadə olunub");
    }
    return tx.insert(realtorMediaTable).values(files.map((f) => ({
      ownerUserId: userId,
      objectPath: f.objectPath,
      originalName: f.originalName,
      contentType: f.contentType,
      size: f.size,
    }))).returning();
  });
}

/** Keeps only ids the user owns, in the given order. Unknown ids are dropped silently. */
export async function ownedMediaIds(userId: string, ids: (string | null | undefined)[]): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (!wanted.length) return new Set();
  const rows = await db.select({ id: realtorMediaTable.id }).from(realtorMediaTable)
    .where(and(eq(realtorMediaTable.ownerUserId, userId), inArray(realtorMediaTable.id, wanted)));
  return new Set(rows.map((r) => r.id));
}

export async function loadMediaMap(ids: (string | null | undefined)[]): Promise<Map<string, RealtorMediaRow>> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (!wanted.length) return new Map();
  const rows = await db.select().from(realtorMediaTable).where(inArray(realtorMediaTable.id, wanted));
  return new Map(rows.map((r) => [r.id, r]));
}

export function pickMedia(map: Map<string, RealtorMediaRow>, ids: string[]) {
  return ids.map((id) => map.get(id)).filter((m): m is RealtorMediaRow => !!m).map(mediaDto);
}

/**
 * A photo is public when a passport that buyers, the contractor or the homeowner
 * can open (published, or with an active confirmation link) shows it.
 */
export async function isMediaPublic(mediaId: string): Promise<boolean> {
  const one = JSON.stringify([mediaId]);
  const result = await db.execute(sql`
    select 1 from property_passports p
    where p.status <> 'archived'
      and (p.status = 'published' or p.owner_token_hash is not null
        or exists (select 1 from passport_works cw where cw.passport_id = p.id and cw.contractor_token_hash is not null))
      and (p.photo_ids @> ${one}::jsonb
        or p.realtor->>'photoMediaId' = ${mediaId}
        or p.realtor->>'logoMediaId' = ${mediaId}
        or exists (select 1 from passport_works w where w.passport_id = p.id
          and (w.before_photo_ids @> ${one}::jsonb or w.after_photo_ids @> ${one}::jsonb)))
    limit 1`);
  return result.rows.length > 0;
}
