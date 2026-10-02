import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { createS3EvidenceUpload, getS3EvidenceFile, normalizeS3EvidencePath } from "./s3EvidenceStorage";

const objects = new Map<string, { data: Buffer; type: string }>();
let server: Server;
let endpoint: string;
before(async () => {
  server = createServer(async (req, res) => {
    const key = new URL(req.url!, "http://localhost").pathname;
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      objects.set(key, { data: Buffer.concat(chunks), type: req.headers["content-type"] || "application/octet-stream" });
      res.writeHead(200); res.end(); return;
    }
    const object = objects.get(key);
    if (!object) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", object.type);
    res.setHeader("Content-Length", object.data.length);
    res.end(req.method === "HEAD" ? undefined : object.data);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  endpoint = `http://127.0.0.1:${address.port}`;
  Object.assign(process.env, {
    R2_ENDPOINT: endpoint, R2_BUCKET_NAME: "test-bucket", R2_REGION: "auto",
    R2_ACCESS_KEY_ID: "fixture-access", R2_SECRET_ACCESS_KEY: "fixture-secret-not-a-real-key",
    BUCKET_FORCE_PATH_STYLE: "true",
  });
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test("presigned private upload, metadata validation and participant streaming use the same object", async () => {
  const url = await createS3EvidenceUpload();
  const objectPath = normalizeS3EvidencePath(url);
  assert.match(objectPath, /^\/objects\/uploads\/[a-f0-9-]{36}$/);
  const data = Buffer.from("evidence-fixture");
  const upload = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: data });
  assert.equal(upload.status, 200);
  const file = await getS3EvidenceFile(objectPath);
  const [metadata] = await file.getMetadata();
  assert.equal(metadata.size, data.length);
  assert.equal(metadata.contentType, "image/png");
  const chunks: Buffer[] = [];
  for await (const chunk of file.createReadStream()) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks), data);
});

test("normalization rejects foreign origins and traversal, and supports virtual-host buckets", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.throws(() => normalizeS3EvidencePath(`https://foreign.example/test-bucket/private/uploads/${id}`));
  assert.throws(() => normalizeS3EvidencePath(`/objects/uploads/../private`));
  process.env.R2_ENDPOINT = "https://storage.example.test";
  try {
    assert.equal(normalizeS3EvidencePath(`https://test-bucket.storage.example.test/private/uploads/${id}`), `/objects/uploads/${id}`);
    assert.equal(normalizeS3EvidencePath(`https://storage.example.test/test-bucket/private/uploads/${id}`), `/objects/uploads/${id}`);
  } finally { process.env.R2_ENDPOINT = endpoint; }
});

test("unuploaded and invalid objects cannot be attached as evidence", async () => {
  await assert.rejects(getS3EvidenceFile("/objects/uploads/00000000-0000-4000-8000-000000000002"));
  await assert.rejects(getS3EvidenceFile("/objects/uploads/../../other"));
});