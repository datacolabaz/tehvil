import type { Request } from "express";
import { publicOrigin } from "./realtorCore";

/**
 * The address the browser sends the file to. With an S3 bucket it is this server (same site as the page), not the
 * bucket: a bucket on another domain rejects browser uploads unless it has CORS rules for this site (Railway buckets give no way to set them).
 */
export function clientUploadURL(req: Request, presigned: string, objectPath: string) {
  if (process.env.OBJECT_STORAGE_PROVIDER !== "s3") return presigned;
  // The site the page is on (PUBLIC_APP_URL), which forwards /api here — so the upload stays same-origin.
  return `${publicOrigin(req)}/api/storage/uploads/${objectPath.slice("/objects/uploads/".length)}`;
}
