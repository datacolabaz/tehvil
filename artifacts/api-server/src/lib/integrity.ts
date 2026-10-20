import { createHash } from "node:crypto";

/**
 * Integrity helpers for handover protocols.
 *
 * What this gives: a way to detect that a photo, a frozen version or the audit history changed after
 * the fact (hashes recomputed and compared). What it does not give: proof of when or where a photo was
 * really taken, a legal signature, or immutability — someone with database and storage access could
 * rewrite everything consistently. The printed hash in the PDF is what a holder can compare against.
 */

/** Canonical JSON: object keys sorted, no whitespace, undefined dropped, Dates as ISO strings. Same data → same bytes. */
export function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonical(x))).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return "null";
  return JSON.stringify(v);
}

export const sha256 = (data: string | Buffer | Uint8Array) => createHash("sha256").update(data).digest("hex");
export const canonicalHash = (v: unknown) => sha256(canonical(v));

export interface ManifestPhoto { id: string; sha256: string; size: number; contentType: string; target: string; receivedAt: string }
export interface Manifest {
  schema: "tehvil.manifest/1";
  protocolId: string; number: string; kind: string; version: number; frozenAt: string;
  /** SHA-256 of the frozen content (the version's contentHash), so the two cannot drift apart. */
  contentHash: string;
  /** The content itself: property, handover, parties' roles and names, rooms, defects, meters, keys, notes, photo ids. */
  content: Record<string, unknown>;
  photos: ManifestPhoto[];
}

export function buildManifest(x: Omit<Manifest, "schema">): { manifest: Manifest; hash: string } {
  const manifest: Manifest = { schema: "tehvil.manifest/1", ...x, photos: [...x.photos].sort((a, b) => a.id.localeCompare(b.id)) };
  return { manifest, hash: canonicalHash(manifest) };
}

/** The approvals record of a version. Hashed apart from the manifest (no circular dependency). */
export function finalRecord(manifestHash: string, approvals: { role: string; decision: string; at: Date; method: string; manifestHash: string }[]) {
  const record = { schema: "tehvil.approvals/1", manifestHash, approvals: [...approvals].sort((a, b) => a.role.localeCompare(b.role)).map((a) => ({ ...a, at: a.at.toISOString() })) };
  return { record, hash: canonicalHash(record) };
}

/** One audit event as it is chained. */
export const eventHash = (e: { prevHash: string; protocolId: string; userId: string | null; action: string; detail: Record<string, unknown>; at: Date }) =>
  canonicalHash({ prevHash: e.prevHash, protocolId: e.protocolId, userId: e.userId, action: e.action, detail: e.detail, at: e.at.toISOString() });

/** Walks a protocol's chained events in order. Events from before the chain existed (hash '') are counted, not checked. */
export function verifyChain(protocolId: string, events: { userId: string | null; action: string; detail: Record<string, unknown>; createdAt: Date; prevHash: string; hash: string }[]) {
  let prev = ""; let checked = 0; let legacy = 0; let brokenAt: number | null = null;
  events.forEach((e, i) => {
    if (!e.hash) { legacy++; return; }
    checked++;
    if (brokenAt !== null) return;
    const ok = e.prevHash === prev && eventHash({ prevHash: e.prevHash, protocolId, userId: e.userId, action: e.action, detail: e.detail, at: e.createdAt }) === e.hash;
    if (!ok) brokenAt = i;
    prev = e.hash;
  });
  return { ok: brokenAt === null, checked, legacy, brokenAt };
}

/**
 * External trust services, prepared but not connected. Nothing in the product may claim a SİMA signature
 * or an RFC 3161 timestamp while these say "not_configured".
 */
export const trustServices = () => ({
  sima: { status: "not_configured" as const, note: "SİMA elektron imzası qoşulmayıb. Təsdiqlər hesab üzərindən qeydə alınır." },
  timestamp: { status: "not_configured" as const, note: "RFC 3161 etibarlı zaman möhürü xidməti qoşulmayıb. Vaxtlar Tehvil.az serverinin vaxtıdır." },
});
