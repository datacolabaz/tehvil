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

  // Two steps that can fail for different reasons: the storage link (configuration) and recording the upload (database).
  let uploadURL: string, objectPath: string;
  try {
    uploadURL = await objectStorageService.getObjectEntityUploadURL();
    objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
  } catch (error) {
    req.log.error({ err: error, stage: "storage-url" }, "Failed to create private upload URL");
    res.status(503).json({ error: storageErrorText(error) });
    return;
  }
  try {
    await db.insert(evidenceUploadsTable).values({
      objectPath,
      userId,
      originalName: parsed.data.name.slice(0, 255),
      contentType: parsed.data.contentType,
      size: parsed.data.size,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
  } catch (error) {
    req.log.error({ err: error, stage: "record" }, "Failed to record the upload");
    res.status(500).json({ error: "Fayl qeydə alınmadı (verilənlər bazası cavab vermədi). Bir az sonra yenidən cəhd edin." });
    return;
  }
  res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath, metadata: parsed.data }));
});

/** What went wrong with the storage configuration, in words — never a value or a key, only which setting. */
function storageErrorText(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  const missing = msg.match(/Missing required storage configuration: ([A-Z_]+)/);
  if (missing) return `Fayl yaddaşı qoşulmayıb: serverdə ${missing[1]} dəyişəni yoxdur. Railway → backend → Variables bölməsini yoxlayın.`;
  if (/Invalid storage upload URL|Invalid evidence object key/.test(msg)) return "Fayl yaddaşının ünvanı (BUCKET_ENDPOINT) bucket-ın ünvanı ilə uyğun gəlmir. Railway → backend → Variables bölməsini yoxlayın.";
  if (/OBJECT_STORAGE_PROVIDER|PRIVATE_OBJECT_DIR|External hosting/.test(msg)) return "Fayl yaddaşı seçilməyib: serverdə OBJECT_STORAGE_PROVIDER=s3 və bucket dəyişənləri lazımdır.";
  return "Fayl yaddaşı hazırda cavab vermir. Bir az sonra yenidən cəhd edin.";
}

/** Diagnostics for the owner: is file storage configured? Shows only yes / no per setting, never values. */
router.get("/storage/status", async (req, res): Promise<void> => {
  if (!getAuth(req).userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const provider = process.env.OBJECT_STORAGE_PROVIDER || "replit";
  const names = provider === "s3" ? ["BUCKET_NAME", "BUCKET_ENDPOINT", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY", "BUCKET_REGION", "BUCKET_FORCE_PATH_STYLE"] : ["PRIVATE_OBJECT_DIR"];
  const settings = Object.fromEntries(names.map((n) => [n, !!process.env[n]]));
  let uploadLink: { ok: boolean; problem?: string };
  try { const u = await objectStorageService.getObjectEntityUploadURL(); objectStorageService.normalizeObjectEntityPath(u); uploadLink = { ok: true }; }
  catch (e) { uploadLink = { ok: false, problem: storageErrorText(e) }; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ provider, settings, uploadLink });
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