import { Readable } from "node:stream";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetProjectMediaParams,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { db, evidenceUploadsTable, projectMediaTable } from "@workspace/db";
import { getProjectAccess } from "../lib/projectAccess";
import {
  isAllowedEvidenceType,
} from "../lib/projectMedia";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isAllowedEvidenceType(parsed.data.contentType)) {
    res.status(400).json({
      error: "Only images, videos, and PDF documents can be uploaded",
    });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    await db.insert(evidenceUploadsTable).values({
      objectPath,
      userId,
      originalName: parsed.data.name,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: parsed.data,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Failed to create private upload URL");
    res.status(500).json({ error: "Failed to create upload URL" });
  }
});

router.get(
  "/storage/public-objects/*filePath",
  async (req, res): Promise<void> => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const response = await objectStorageService.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        ).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, "Failed to serve public asset");
      res.status(500).json({ error: "Failed to serve public asset" });
    }
  },
);

router.get(
  "/projects/:projectId/media/:mediaId",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const params = GetProjectMediaParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(params.data.mediaId)) {
      res.status(400).json({ error: "Invalid media ID" });
      return;
    }
    const access = await getProjectAccess(params.data.projectId, userId);
    if (!access) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const [media] = await db
      .select()
      .from(projectMediaTable)
      .where(
        and(
          eq(projectMediaTable.id, params.data.mediaId),
          eq(projectMediaTable.projectId, access.project.id),
        ),
      )
      .limit(1);
    if (!media) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        media.objectPath,
      );
      const response = await objectStorageService.downloadObject(objectFile, 0);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(media.originalName)}`,
      );
      if (response.body) {
        Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        ).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      req.log.error({ err: error }, "Failed to stream project media");
      res.status(500).json({ error: "Failed to serve file" });
    }
  },
);

export default router;