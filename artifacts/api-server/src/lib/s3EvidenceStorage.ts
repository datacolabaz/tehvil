import { randomUUID } from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | undefined;
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required storage configuration: ${name}`);
  return value;
}
function bucket() { return required("BUCKET_NAME"); }
function s3() {
  return client ??= new S3Client({
    endpoint: required("BUCKET_ENDPOINT"),
    region: process.env.BUCKET_REGION || "us-east-1",
    forcePathStyle: process.env.BUCKET_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: required("BUCKET_ACCESS_KEY_ID"),
      secretAccessKey: required("BUCKET_SECRET_ACCESS_KEY"),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

export async function createS3EvidenceUpload() {
  const key = `private/uploads/${randomUUID()}`;
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 900 });
}

export function normalizeS3EvidencePath(raw: string) {
  if (/^\/objects\/uploads\/[a-f0-9-]{36}$/.test(raw)) return raw;
  const url = new URL(raw);
  const endpoint = new URL(required("BUCKET_ENDPOINT"));
  const base = endpoint.pathname.replace(/\/$/, "");
  const path = decodeURIComponent(url.pathname);
  let key: string;
  if (url.origin === endpoint.origin) {
    const prefix = `${base}/${bucket()}/`;
    if (!path.startsWith(prefix)) throw new Error("Invalid storage upload URL");
    key = path.slice(prefix.length);
  } else if (url.protocol === endpoint.protocol && url.host === `${bucket()}.${endpoint.host}`) {
    key = path.slice(`${base}/`.length);
  } else {
    throw new Error("Invalid storage upload URL");
  }
  if (!/^private\/uploads\/[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid evidence object key");
  return `/objects/${key.slice("private/".length)}`;
}

type Metadata = { size: number; contentType: string };
export class S3EvidenceFile {
  private metadata?: Metadata;
  constructor(private readonly key: string) {}
  async getMetadata(): Promise<[Metadata]> {
    if (!this.metadata) {
      const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: this.key }));
      this.metadata = { size: head.ContentLength ?? 0, contentType: head.ContentType ?? "application/octet-stream" };
    }
    return [this.metadata];
  }
  createReadStream() {
    const stream = new PassThrough();
    void s3().send(new GetObjectCommand({ Bucket: bucket(), Key: this.key })).then(object => {
      if (!object.Body) throw new Error("Evidence object has no body");
      const body = Readable.fromWeb(object.Body.transformToWebStream() as Parameters<typeof Readable.fromWeb>[0]);
      body.on("error", error => stream.destroy(error));
      stream.on("close", () => body.destroy());
      body.pipe(stream);
    }).catch(error => stream.destroy(error));
    return stream;
  }
}

export async function getS3EvidenceFile(objectPath: string) {
  if (!/^\/objects\/uploads\/[a-f0-9-]{36}$/.test(objectPath)) throw new Error("Invalid evidence object path");
  const file = new S3EvidenceFile(`private/${objectPath.slice("/objects/".length)}`);
  await file.getMetadata();
  return file;
}