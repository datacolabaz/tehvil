import { Readable } from "node:stream";
import { getAuth } from "@clerk/express";
import { and, eq, gt, isNull } from "drizzle-orm";
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
import { checkS3Write, putS3EvidenceObject } from "../lib/s3EvidenceStorage";
import { clientUploadURL } from "../lib/uploadUrl";

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
  res.json(RequestUploadUrlResponse.parse({ uploadURL: clientUploadURL(req, uploadURL, objectPath), objectPath, metadata: parsed.data }));
});

/**
 * Receives a file for an upload that was just requested (row in evidence_uploads, not expired, not attached yet) and
 * writes it to the bucket. The id is a random UUID handed out by request-url (also to photo-invite visitors without
 * an account), so knowing it is the permission; the declared type and size must match.
 */
router.put("/storage/uploads/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  if (!/^[a-f0-9-]{36}$/.test(id)) { res.status(400).json({ error: "Yükləmə linki düzgün deyil." }); return; }
  const objectPath = `/objects/uploads/${id}`;
  const [row] = await db.select().from(evidenceUploadsTable)
    .where(and(eq(evidenceUploadsTable.objectPath, objectPath), gt(evidenceUploadsTable.expiresAt, new Date()), isNull(evidenceUploadsTable.attachedAt))).limit(1);
  if (!row) { res.status(404).json({ error: "Yükləmə linkinin vaxtı bitib. Faylı yenidən seçin." }); return; }
  const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (type !== row.contentType.toLowerCase()) { res.status(400).json({ error: "Faylın növü əvvəl bildiriləndən fərqlidir." }); return; }
  const length = Number(req.headers["content-length"]);
  if (!Number.isInteger(length) || length < 1 || length > row.size) { res.status(400).json({ error: "Faylın ölçüsü əvvəl bildiriləndən fərqlidir." }); return; }
  try {
    await putS3EvidenceObject(objectPath, req, length, row.contentType);
  } catch (error) {
    req.log.error({ err: error, stage: "storage-put" }, "Failed to write upload to the bucket");
    res.status(502).json({ error: storagePutErrorText(error) });
    return;
  }
  res.json({ ok: true });
});

/** Why the bucket refused the file, in words — which setting to check, never a value. */
function storagePutErrorText(error: unknown) {
  const e = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number }; code?: string; message?: string };
  const code = e.name || e.Code || "";
  const status = e.$metadata?.httpStatusCode;
  if (/InvalidAccessKeyId/.test(code)) return "Fayl yaddaşı açarı qəbul etmədi: BUCKET_ACCESS_KEY_ID səhvdir. Railway → backend → Variables bölməsini yoxlayın.";
  if (/SignatureDoesNotMatch/.test(code)) return "Fayl yaddaşı açarı qəbul etmədi: BUCKET_SECRET_ACCESS_KEY səhvdir. Railway → backend → Variables bölməsini yoxlayın.";
  if (/NoSuchBucket/.test(code)) return "Fayl yaddaşında belə bucket yoxdur: BUCKET_NAME səhvdir. Railway → backend → Variables bölməsini yoxlayın.";
  if (/AccessDenied/.test(code) || status === 403) return "Fayl yaddaşı yazmağa icazə vermədi (açarlar və ya BUCKET_NAME). Railway → backend → Variables bölməsini yoxlayın.";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/.test(`${e.code ?? ""} ${e.message ?? ""}`)) return "Fayl yaddaşına qoşulmaq olmadı: BUCKET_ENDPOINT ünvanını yoxlayın.";
  if (/PermanentRedirect|AuthorizationHeaderMalformed/.test(code)) return "Fayl yaddaşının ünvanı və ya regionu uyğun deyil: BUCKET_ENDPOINT, BUCKET_REGION və BUCKET_FORCE_PATH_STYLE-ı yoxlayın.";
  return "Fayl yaddaşa yazılmadı. Bir az sonra yenidən cəhd edin.";
}

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
  // A link can be made with any keys; only a real write shows the keys and the bucket name are right.
  let write: { ok: boolean; problem?: string } | undefined;
  if (provider === "s3" && uploadLink.ok) {
    try { await checkS3Write(); write = { ok: true }; }
    catch (e) { req.log.error({ err: e, stage: "status-write" }, "Bucket write check failed"); write = { ok: false, problem: storagePutErrorText(e) }; }
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ provider, settings, uploadLink, ...(write ? { write } : {}) });
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