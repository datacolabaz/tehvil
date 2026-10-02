import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db, evidenceUploadsTable, projectMediaTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

export interface MediaInputValue {
  objectPath: string;
  originalName: string;
  contentType: string;
  size: number;
}

export function isAllowedEvidenceType(contentType: string): boolean {
  return (
    ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "video/mp4", "video/webm", "video/quicktime"].includes(contentType) ||
    contentType === "application/pdf"
  );
}

export async function attachProjectMedia(input: {
  projectId: string;
  entityType: "milestone" | "revision" | "payment";
  entityId: string;
  userId: string;
  media: MediaInputValue[];
}): Promise<void> {
  for (const file of input.media) {
    if (
      !file.objectPath.startsWith("/objects/uploads/") ||
      !isAllowedEvidenceType(file.contentType) ||
      file.size < 1 ||
      file.size > 52_428_800
    ) {
      throw new Error("Invalid private evidence file");
    }
    const [upload] = await db.select().from(evidenceUploadsTable).where(and(
      eq(evidenceUploadsTable.objectPath, file.objectPath),
      eq(evidenceUploadsTable.userId, input.userId),
      isNull(evidenceUploadsTable.attachedAt),
      gt(evidenceUploadsTable.expiresAt, new Date()),
    )).limit(1);
    if (!upload || upload.originalName !== file.originalName || upload.contentType !== file.contentType || upload.size !== file.size) {
      throw new Error("Evidence must be uploaded by the current user using a fresh upload URL");
    }
    const object = await new ObjectStorageService().getObjectEntityFile(file.objectPath);
    const [metadata] = await object.getMetadata();
    if (Number(metadata.size) !== file.size || metadata.contentType !== file.contentType) {
      throw new Error("Uploaded evidence does not match its declared size or type");
    }
  }

  if (input.media.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    for (const file of input.media) {
      const claimed = await tx.update(evidenceUploadsTable).set({ attachedAt: new Date() }).where(and(
        eq(evidenceUploadsTable.objectPath, file.objectPath),
        eq(evidenceUploadsTable.userId, input.userId),
        isNull(evidenceUploadsTable.attachedAt),
        gt(evidenceUploadsTable.expiresAt, new Date()),
      )).returning();
      if (!claimed.length) throw new Error("Evidence was already attached or has expired");
    }
    await tx.insert(projectMediaTable).values(input.media.map((file) => ({
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      objectPath: file.objectPath,
      originalName: file.originalName,
      contentType: file.contentType,
      size: file.size,
      uploadedBy: input.userId,
    })));
  });
}

export async function listProjectMedia(
  entityType: "milestone" | "revision" | "payment",
  entityId: string,
) {
  const media = await db
    .select()
    .from(projectMediaTable)
    .where(
      and(
        eq(projectMediaTable.entityType, entityType),
        eq(projectMediaTable.entityId, entityId),
      ),
    )
    .orderBy(asc(projectMediaTable.createdAt));

  return media.map((item) => ({
    id: item.id,
    objectPath: item.objectPath,
    originalName: item.originalName,
    contentType: item.contentType,
    size: item.size,
    uploadedAt: item.createdAt.toISOString(),
  }));
}