import { createHash, randomInt } from "node:crypto";
import { Readable } from "node:stream";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AddProtocolDefectBody, AddProtocolMediaBody, AddProtocolRoomBody, CreateProtocolBody, CreateProtocolInviteBody, DecideProtocolBody,
  UpdateProtocolBody, UpdateProtocolRoomBody,
} from "@workspace/api-zod";
import {
  db, evidenceUploadsTable, handoverProtocolsTable, protocolApprovalsTable, protocolDefectsTable, protocolEventsTable, protocolInvitesTable,
  protocolMediaTable, protocolParticipantsTable, protocolRoomsTable, protocolVersionsTable,
  type HandoverProtocolRow, type ProtocolExtrasJson,
} from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { renderProtocolPdf, type ProtocolSnapshot } from "../lib/protocolPdf";
import { rateLimit } from "../lib/rateLimit";
import { hashToken, newToken, publicOrigin } from "../lib/realtorCore";

/** Invitation pages and photos opened through an invitation link work without sign-in. */
export const protocolPublicRouter: IRouter = Router();
const router: IRouter = Router();
const storage = new ObjectStorageService();
const openLimit = rateLimit({ windowMs: 60_000, max: 120, key: (req) => `pi:${req.ip}` });

const ROLES = ["realtor", "seller", "buyer"] as const;
const DECIDERS = ["seller", "buyer"];
const EDITABLE = ["draft", "collecting"];
const PHOTO_TYPES = ["image/jpeg", "image/png"];
const MAX_PHOTO = 15 * 1024 * 1024;
const ROOM_TEMPLATES: Record<string, [string, string][]> = {
  apartment: [["Qonaq otağı", "living"], ["Yataq otağı", "bed"], ["Mətbəx", "kitchen"], ["Hamam və tualet", "bath"], ["Dəhliz", "hall"], ["Balkon", "balcony"]],
  house: [["Qonaq otağı", "living"], ["Yataq otağı", "bed"], ["Mətbəx", "kitchen"], ["Hamam və tualet", "bath"], ["Dəhliz", "hall"], ["Həyət", "other"]],
  other: [["Əsas otaq", "other"], ["Hamam və tualet", "bath"], ["Dəhliz", "hall"]],
};
const emptyExtras = (): ProtocolExtrasJson => ({
  meters: { water: { value: "", note: "", mediaIds: [] }, gas: { value: "", note: "", mediaIds: [] }, electric: { value: "", note: "", mediaIds: [] } },
  keys: [{ kind: "Giriş qapısı açarı", count: 0 }], notes: "",
});

const uid = (req: Request) => getAuth(req).userId!;
const bad = (res: Response, error: string, status = 400) => { res.status(status).json({ error }); };
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

async function event(protocolId: string, userId: string | null, action: string, detail: Record<string, unknown> = {}) {
  await db.insert(protocolEventsTable).values({ protocolId, userId, action, detail });
}

/** The protocol and the signed-in person's place in it. Unknown, archived or foreign → null. */
async function access(req: Request, protocolId: unknown) {
  if (!isUuid(protocolId)) return null;
  const [p] = await db.select().from(handoverProtocolsTable).where(and(eq(handoverProtocolsTable.id, protocolId), isNull(handoverProtocolsTable.archivedAt)));
  if (!p) return null;
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const [me] = await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, p.id), eq(protocolParticipantsTable.userId, userId)));
  if (!me) return null;
  return { p, me, isCreator: p.createdByUserId === userId, userId };
}
type Access = NonNullable<Awaited<ReturnType<typeof access>>>;

async function load(req: Request, res: Response) {
  const a = await access(req, req.params.protocolId);
  if (!a) { bad(res, "Protokol tapılmadı", 404); return null; }
  return a;
}
const mustEdit = (a: Access, res: Response) => {
  if (!EDITABLE.includes(a.p.status)) { bad(res, "Protokol təsdiqə göndərilib — dəyişmək üçün əvvəlcə redaktəni yenidən açın", 409); return false; }
  if (!a.me.canEdit) { bad(res, "Bu protokolu dəyişmək icazəniz yoxdur", 403); return false; }
  return true;
};
const mustManage = (a: Access, res: Response) => { if (!a.isCreator) { bad(res, "Bunu yalnız protokolu yaradan edə bilər", 403); return false; } return true; };
/** Every content change: draft → collecting, revision +1. */
async function touch(p: HandoverProtocolRow) {
  await db.update(handoverProtocolsTable).set({ revision: p.revision + 1, status: p.status === "draft" ? "collecting" : p.status, updatedAt: new Date() }).where(eq(handoverProtocolsTable.id, p.id));
}

async function newNumber() {
  const y = new Date().getFullYear();
  for (let i = 0; i < 6; i++) {
    const n = `TP-${y}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const [hit] = await db.select({ id: handoverProtocolsTable.id }).from(handoverProtocolsTable).where(eq(handoverProtocolsTable.number, n));
    if (!hit) return n;
  }
  throw new Error("Could not allocate a protocol number");
}

/* ------------------------------------------------------------------ snapshot */

async function snapshotOf(p: HandoverProtocolRow): Promise<ProtocolSnapshot> {
  const rooms = await db.select().from(protocolRoomsTable).where(eq(protocolRoomsTable.protocolId, p.id)).orderBy(asc(protocolRoomsTable.position), asc(protocolRoomsTable.createdAt));
  const defects = await db.select().from(protocolDefectsTable).where(eq(protocolDefectsTable.protocolId, p.id)).orderBy(asc(protocolDefectsTable.createdAt));
  const media = await db.select().from(protocolMediaTable).where(and(eq(protocolMediaTable.protocolId, p.id), isNull(protocolMediaTable.deletedAt))).orderBy(asc(protocolMediaTable.createdAt));
  const ids = (f: (m: typeof media[number]) => boolean) => media.filter(f).map((m) => m.id);
  const x = p.extras;
  return {
    number: p.number, address: p.address, propertyType: p.propertyType, handoverDate: p.handoverDate,
    parties: [
      { role: "seller", name: p.sellerName, phone: p.sellerPhone },
      { role: "buyer", name: p.buyerName, phone: p.buyerPhone },
      ...(p.realtorName || p.realtorPhone || p.creatorRole === "realtor" ? [{ role: "realtor", name: p.realtorName, phone: p.realtorPhone }] : []),
    ],
    rooms: rooms.map((r) => ({
      id: r.id, name: r.name, kind: r.kind, condition: r.condition, note: r.note,
      photos: ids((m) => m.target === "room" && m.roomId === r.id),
      defects: defects.filter((d) => d.roomId === r.id).map((d) => ({ id: d.id, text: d.text, photos: ids((m) => m.target === "defect" && m.defectId === d.id) })),
    })),
    meters: (["water", "gas", "electric"] as const).map((k) => ({ kind: k, value: x.meters[k]?.value ?? "", note: x.meters[k]?.note ?? "", photos: ids((m) => m.target === "meter" && m.meterKind === k) })),
    keys: x.keys, keyPhotos: ids((m) => m.target === "keys"), notes: x.notes, otherPhotos: ids((m) => m.target === "other"),
    revision: p.revision,
  };
}
const hashOf = (s: ProtocolSnapshot) => createHash("sha256").update(JSON.stringify(s)).digest("hex");

/* ------------------------------------------------------------------ DTO */

const mediaDto = (m: typeof protocolMediaTable.$inferSelect, token?: string) => ({
  id: m.id, roomId: m.roomId, defectId: m.defectId, target: m.target, meterKind: m.meterKind, caption: m.caption, contentType: m.contentType,
  url: `/api/protocol-media/${m.id}${token ? `?t=${encodeURIComponent(token)}` : ""}`, createdAt: m.createdAt.toISOString(),
});

async function detail(p: HandoverProtocolRow, viewer: { userId: string | null; isCreator: boolean; role: string | null; canEdit: boolean; token?: string }) {
  const [rooms, defects, media, participants, versions, approvals] = await Promise.all([
    db.select().from(protocolRoomsTable).where(eq(protocolRoomsTable.protocolId, p.id)).orderBy(asc(protocolRoomsTable.position), asc(protocolRoomsTable.createdAt)),
    db.select().from(protocolDefectsTable).where(eq(protocolDefectsTable.protocolId, p.id)).orderBy(asc(protocolDefectsTable.createdAt)),
    db.select().from(protocolMediaTable).where(and(eq(protocolMediaTable.protocolId, p.id), isNull(protocolMediaTable.deletedAt))).orderBy(asc(protocolMediaTable.createdAt)),
    db.select().from(protocolParticipantsTable).where(eq(protocolParticipantsTable.protocolId, p.id)),
    db.select().from(protocolVersionsTable).where(eq(protocolVersionsTable.protocolId, p.id)).orderBy(desc(protocolVersionsTable.version)),
    db.select().from(protocolApprovalsTable).where(eq(protocolApprovalsTable.protocolId, p.id)).orderBy(asc(protocolApprovalsTable.createdAt)),
  ]);
  const invites = viewer.isCreator ? await db.select().from(protocolInvitesTable).where(and(eq(protocolInvitesTable.protocolId, p.id), isNull(protocolInvitesTable.revokedAt))) : [];
  const events = viewer.userId ? await db.select().from(protocolEventsTable).where(eq(protocolEventsTable.protocolId, p.id)).orderBy(desc(protocolEventsTable.createdAt)).limit(60) : [];
  const roleOf = (u: string | null) => participants.find((x) => x.userId === u)?.role ?? null;
  const cur = versions.find((v) => v.version === p.currentVersion);
  const myDecision = approvals.find((a) => a.version === p.currentVersion && a.role === viewer.role);
  const mask = (phone: string) => (viewer.userId ? phone : phone.replace(/\d(?=\d{2})/g, "•"));
  return {
    protocol: {
      id: p.id, number: p.number, address: p.address, propertyType: p.propertyType, handoverDate: p.handoverDate, status: p.status, creatorRole: p.creatorRole,
      sellerName: p.sellerName, sellerPhone: mask(p.sellerPhone), buyerName: p.buyerName, buyerPhone: mask(p.buyerPhone), realtorName: p.realtorName, realtorPhone: mask(p.realtorPhone),
      extras: p.extras, revision: p.revision, currentVersion: p.currentVersion, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
    },
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, kind: r.kind, condition: r.condition, note: r.note, position: r.position })),
    defects: defects.map((d) => ({ id: d.id, roomId: d.roomId, text: d.text, createdAt: d.createdAt.toISOString() })),
    media: media.map((m) => mediaDto(m, viewer.token)),
    participants: participants.map((x) => ({ role: x.role, joinedAt: x.joinedAt.toISOString(), isMe: x.userId === viewer.userId, isCreator: x.userId === p.createdByUserId })),
    invites: invites.map((i) => ({ id: i.id, role: i.role, createdAt: i.createdAt.toISOString(), used: !!i.usedAt, lastOpenedAt: i.lastOpenedAt?.toISOString() ?? null })),
    versions: versions.map((v) => ({ version: v.version, contentHash: v.contentHash, createdAt: v.createdAt.toISOString(), hasPdf: !!v.pdfObjectPath, pdfCreatedAt: v.pdfCreatedAt?.toISOString() ?? null })),
    approvals: approvals.map((a) => ({ version: a.version, role: a.role, decision: a.decision, comment: a.comment, authLevel: a.authLevel, createdAt: a.createdAt.toISOString() })),
    events: events.map((e) => ({ action: e.action, role: roleOf(e.userId), detail: e.detail, createdAt: e.createdAt.toISOString() })),
    me: {
      role: viewer.role, isCreator: viewer.isCreator, canEdit: viewer.canEdit && EDITABLE.includes(p.status),
      canDecide: !!viewer.role && DECIDERS.includes(viewer.role) && p.status === "awaiting" && !myDecision,
      current: cur ? { version: cur.version, contentHash: cur.contentHash } : null,
    },
  };
}
const dto = (a: Access) => detail(a.p, { userId: a.userId, isCreator: a.isCreator, role: a.me.role, canEdit: a.me.canEdit });
const reload = async (a: Access) => { const [p] = await db.select().from(handoverProtocolsTable).where(eq(handoverProtocolsTable.id, a.p.id)); return dto({ ...a, p }); };

/* ------------------------------------------------------------------ protocols */

router.get("/protocols", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const mine = await db.select({ p: handoverProtocolsTable, role: protocolParticipantsTable.role }).from(protocolParticipantsTable)
    .innerJoin(handoverProtocolsTable, eq(handoverProtocolsTable.id, protocolParticipantsTable.protocolId))
    .where(and(eq(protocolParticipantsTable.userId, uid(req)), isNull(handoverProtocolsTable.archivedAt))).orderBy(desc(handoverProtocolsTable.updatedAt)).limit(200);
  const ids = mine.map((m) => m.p.id);
  const rooms = ids.length ? await db.select({ pid: protocolRoomsTable.protocolId }).from(protocolRoomsTable).where(inArray(protocolRoomsTable.protocolId, ids)) : [];
  const photos = ids.length ? await db.select({ pid: protocolMediaTable.protocolId }).from(protocolMediaTable).where(and(inArray(protocolMediaTable.protocolId, ids), isNull(protocolMediaTable.deletedAt))) : [];
  res.json(mine.map(({ p, role }) => ({ id: p.id, number: p.number, address: p.address, status: p.status, myRole: role, handoverDate: p.handoverDate, updatedAt: p.updatedAt.toISOString(),
    rooms: rooms.filter((r) => r.pid === p.id).length, photos: photos.filter((m) => m.pid === p.id).length })));
});

router.post("/protocols", async (req, res): Promise<void> => {
  const b = CreateProtocolBody.safeParse(req.body);
  if (!b.success) return bad(res, "Ünvanı və rolunuzu yoxlayın");
  const d = b.data, userId = uid(req);
  const [p] = await db.insert(handoverProtocolsTable).values({
    number: await newNumber(), createdByUserId: userId, creatorRole: d.role, propertyType: d.propertyType, address: d.address.trim(), handoverDate: d.handoverDate ?? null,
    sellerName: d.sellerName?.trim() ?? "", sellerPhone: d.sellerPhone?.trim() ?? "", buyerName: d.buyerName?.trim() ?? "", buyerPhone: d.buyerPhone?.trim() ?? "",
    realtorName: d.realtorName?.trim() ?? "", realtorPhone: d.realtorPhone?.trim() ?? "", extras: emptyExtras(),
  }).returning();
  await db.insert(protocolParticipantsTable).values({ protocolId: p.id, userId, role: d.role, canEdit: true });
  await db.insert(protocolRoomsTable).values((ROOM_TEMPLATES[d.propertyType] ?? ROOM_TEMPLATES.other).map(([name, kind], i) => ({ protocolId: p.id, name, kind, position: i })));
  await event(p.id, userId, "created", { role: d.role });
  const [me] = await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, p.id), eq(protocolParticipantsTable.userId, userId)));
  res.status(201).json(await dto({ p, me, isCreator: true, userId }));
});

router.get("/protocols/:protocolId", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const a = await load(req, res); if (!a) return;
  res.json(await dto(a));
});

router.patch("/protocols/:protocolId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const b = UpdateProtocolBody.safeParse(req.body);
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const d = b.data;
  const set: Partial<typeof handoverProtocolsTable.$inferInsert> = {};
  for (const k of ["propertyType", "address", "handoverDate", "sellerName", "sellerPhone", "buyerName", "buyerPhone", "realtorName", "realtorPhone"] as const) if (d[k] !== undefined) (set as Record<string, unknown>)[k] = typeof d[k] === "string" ? (d[k] as string).trim() : d[k];
  if (d.extras !== undefined) {
    const x = d.extras as Partial<ProtocolExtrasJson>;
    const meter = (m: unknown) => { const o = (m ?? {}) as { value?: unknown; note?: unknown; mediaIds?: unknown }; return { value: String(o.value ?? "").slice(0, 40), note: String(o.note ?? "").slice(0, 500), mediaIds: [] as string[] }; };
    const keys = Array.isArray(x.keys) ? x.keys.slice(0, 12).map((k) => ({ kind: String((k as { kind?: unknown }).kind ?? "").slice(0, 80), count: Math.max(0, Math.min(99, Math.round(Number((k as { count?: unknown }).count) || 0))) })) : a.p.extras.keys;
    set.extras = { meters: { water: meter(x.meters?.water), gas: meter(x.meters?.gas), electric: meter(x.meters?.electric) }, keys, notes: String(x.notes ?? "").slice(0, 4000) };
  }
  if (!Object.keys(set).length) return void res.json(await dto(a));
  await db.update(handoverProtocolsTable).set(set).where(eq(handoverProtocolsTable.id, a.p.id));
  await touch(a.p);
  await event(a.p.id, a.userId, "details_updated", { fields: Object.keys(set) });
  res.json(await reload(a));
});

router.delete("/protocols/:protocolId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustManage(a, res)) return;
  if (["approved", "finalized"].includes(a.p.status)) return bad(res, "Təsdiqlənmiş protokol silinmir — tarixçə qorunur", 409);
  await db.update(handoverProtocolsTable).set({ archivedAt: new Date() }).where(eq(handoverProtocolsTable.id, a.p.id));
  await event(a.p.id, a.userId, "archived");
  res.json({ success: true });
});

/* ------------------------------------------------------------------ rooms, defects, photos */

router.post("/protocols/:protocolId/rooms", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const b = AddProtocolRoomBody.safeParse(req.body);
  if (!b.success || !b.data.name?.trim()) return bad(res, "Otağın adını yazın");
  const existing = await db.select({ position: protocolRoomsTable.position }).from(protocolRoomsTable).where(eq(protocolRoomsTable.protocolId, a.p.id));
  if (existing.length >= 40) return bad(res, "Bir protokolda ən çox 40 otaq ola bilər");
  await db.insert(protocolRoomsTable).values({ protocolId: a.p.id, name: b.data.name.trim(), kind: b.data.kind ?? "other", position: Math.max(-1, ...existing.map((r) => r.position)) + 1, condition: b.data.condition ?? null, note: b.data.note ?? "" });
  await touch(a.p);
  res.status(201).json(await reload(a));
});

async function ownRoom(a: Access, roomId: unknown) {
  if (!isUuid(roomId)) return null;
  const [r] = await db.select().from(protocolRoomsTable).where(and(eq(protocolRoomsTable.id, roomId), eq(protocolRoomsTable.protocolId, a.p.id)));
  return r ?? null;
}

router.patch("/protocols/:protocolId/rooms/:roomId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const r = await ownRoom(a, req.params.roomId); if (!r) return bad(res, "Otaq tapılmadı", 404);
  const b = UpdateProtocolRoomBody.safeParse(req.body);
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const set: Partial<typeof protocolRoomsTable.$inferInsert> = {};
  if (b.data.name !== undefined) set.name = b.data.name.trim() || r.name;
  if (b.data.kind !== undefined) set.kind = b.data.kind;
  if (b.data.condition !== undefined) set.condition = b.data.condition;
  if (b.data.note !== undefined) set.note = b.data.note;
  if (Object.keys(set).length) { await db.update(protocolRoomsTable).set(set).where(eq(protocolRoomsTable.id, r.id)); await touch(a.p); }
  res.json(await reload(a));
});

router.delete("/protocols/:protocolId/rooms/:roomId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const r = await ownRoom(a, req.params.roomId); if (!r) return void res.json(await dto(a)); // already gone: repeated request is harmless
  await db.update(protocolMediaTable).set({ deletedAt: new Date() }).where(and(eq(protocolMediaTable.protocolId, a.p.id), eq(protocolMediaTable.roomId, r.id)));
  await db.delete(protocolRoomsTable).where(eq(protocolRoomsTable.id, r.id));
  await touch(a.p);
  await event(a.p.id, a.userId, "room_removed", { name: r.name });
  res.json(await reload(a));
});

router.post("/protocols/:protocolId/defects", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const b = AddProtocolDefectBody.safeParse(req.body);
  if (!b.success || !b.data.text.trim()) return bad(res, "Qüsuru qısa təsvir edin");
  if (b.data.roomId && !(await ownRoom(a, b.data.roomId))) return bad(res, "Otaq tapılmadı", 404);
  await db.insert(protocolDefectsTable).values({ protocolId: a.p.id, roomId: b.data.roomId ?? null, text: b.data.text.trim(), createdByUserId: a.userId });
  if (b.data.roomId) await db.update(protocolRoomsTable).set({ condition: "defective" }).where(and(eq(protocolRoomsTable.id, b.data.roomId), isNull(protocolRoomsTable.condition)));
  await touch(a.p);
  res.status(201).json(await reload(a));
});

router.delete("/protocols/:protocolId/defects/:defectId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  if (!isUuid(req.params.defectId)) return bad(res, "Qüsur tapılmadı", 404);
  const del = await db.delete(protocolDefectsTable).where(and(eq(protocolDefectsTable.id, req.params.defectId), eq(protocolDefectsTable.protocolId, a.p.id))).returning();
  if (del.length) { await db.update(protocolMediaTable).set({ deletedAt: new Date() }).where(eq(protocolMediaTable.defectId, req.params.defectId)); await touch(a.p); }
  res.json(await reload(a));
});

router.post("/protocols/:protocolId/media", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const b = AddProtocolMediaBody.safeParse(req.body);
  if (!b.success || !b.data.files.length) return bad(res, "Foto seçilməyib");
  const d = b.data;
  if (d.target === "room" && !(await ownRoom(a, d.roomId))) return bad(res, "Otaq tapılmadı", 404);
  if (d.target === "defect") {
    if (!isUuid(d.defectId)) return bad(res, "Qüsur tapılmadı", 404);
    const [df] = await db.select().from(protocolDefectsTable).where(and(eq(protocolDefectsTable.id, d.defectId), eq(protocolDefectsTable.protocolId, a.p.id)));
    if (!df) return bad(res, "Qüsur tapılmadı", 404);
  }
  if (d.target === "meter" && !d.meterKind) return bad(res, "Sayğacın növünü seçin");
  for (const f of d.files) {
    if (!f.objectPath.startsWith("/objects/uploads/") || !PHOTO_TYPES.includes(f.contentType) || f.size < 1 || f.size > MAX_PHOTO) return bad(res, "Yalnız 15 MB-a qədər JPG və ya PNG foto əlavə etmək olar");
  }
  // Already attached by this person (a repeated request after a lost response): return the protocol unchanged.
  const already = await db.select({ objectPath: protocolMediaTable.objectPath }).from(protocolMediaTable).where(and(eq(protocolMediaTable.protocolId, a.p.id), inArray(protocolMediaTable.objectPath, d.files.map((f) => f.objectPath))));
  const fresh = d.files.filter((f) => !already.some((x) => x.objectPath === f.objectPath));
  if (!fresh.length) return void res.status(201).json(await reload(a));
  try {
    for (const f of fresh) {
      const [up] = await db.select().from(evidenceUploadsTable).where(and(eq(evidenceUploadsTable.objectPath, f.objectPath), eq(evidenceUploadsTable.userId, a.userId), isNull(evidenceUploadsTable.attachedAt)));
      if (!up || up.contentType !== f.contentType || up.size !== f.size || up.expiresAt <= new Date()) return bad(res, "Foto yüklənmədi. Yenidən cəhd edin");
      const file = await storage.getObjectEntityFile(f.objectPath);
      const [meta] = await file.getMetadata();
      if (Number(meta.size) !== f.size) return bad(res, "Foto tam yüklənməyib. Yenidən cəhd edin");
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return bad(res, "Foto tam yüklənməyib. Yenidən cəhd edin");
    throw err;
  }
  await db.transaction(async (tx) => {
    for (const f of fresh) {
      const claimed = await tx.update(evidenceUploadsTable).set({ attachedAt: new Date() }).where(and(eq(evidenceUploadsTable.objectPath, f.objectPath), eq(evidenceUploadsTable.userId, a.userId), isNull(evidenceUploadsTable.attachedAt))).returning();
      if (!claimed.length) throw new Error("upload already used");
    }
    await tx.insert(protocolMediaTable).values(fresh.map((f) => ({
      protocolId: a.p.id, roomId: d.target === "room" ? d.roomId ?? null : null, defectId: d.target === "defect" ? d.defectId ?? null : null, target: d.target,
      meterKind: d.target === "meter" ? d.meterKind ?? null : null, objectPath: f.objectPath, contentType: f.contentType, size: f.size, originalName: f.originalName.slice(0, 255),
      caption: d.caption ?? "", uploadedByUserId: a.userId,
    })));
  });
  await touch(a.p);
  res.status(201).json(await reload(a));
});

router.delete("/protocols/:protocolId/media/:mediaId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  if (!isUuid(req.params.mediaId)) return bad(res, "Foto tapılmadı", 404);
  const del = await db.update(protocolMediaTable).set({ deletedAt: new Date() }).where(and(eq(protocolMediaTable.id, req.params.mediaId), eq(protocolMediaTable.protocolId, a.p.id), isNull(protocolMediaTable.deletedAt))).returning();
  if (del.length) await touch(a.p);
  res.json(await reload(a));
});

/** A photo: for participants, or for anyone holding a live invitation link of this protocol. */
protocolPublicRouter.get("/protocol-media/:mediaId", openLimit, async (req, res): Promise<void> => {
  if (!isUuid(req.params.mediaId)) return bad(res, "Foto tapılmadı", 404);
  const [m] = await db.select().from(protocolMediaTable).where(eq(protocolMediaTable.id, req.params.mediaId));
  if (!m) return bad(res, "Foto tapılmadı", 404);
  let allowed = false;
  const userId = getAuth(req).userId;
  if (userId) {
    const [me] = await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, m.protocolId), eq(protocolParticipantsTable.userId, userId)));
    allowed = !!me;
  }
  if (!allowed && typeof req.query.t === "string") { const inv = await liveInvite(req.query.t); allowed = !!inv && inv.invite.protocolId === m.protocolId; }
  // A removed photo stays readable only to participants (it may be part of an earlier version).
  if (!allowed || (m.deletedAt && !userId)) return bad(res, "Foto tapılmadı", 404);
  try {
    const file = await storage.getObjectEntityFile(m.objectPath);
    const response = await storage.downloadObject(file, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (response.body) Readable.fromWeb(response.body as never).pipe(res); else res.end();
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return bad(res, "Foto tapılmadı", 404);
    throw err;
  }
});

/* ------------------------------------------------------------------ invitations */

async function liveInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [invite] = await db.select().from(protocolInvitesTable).where(eq(protocolInvitesTable.tokenHash, hashToken(token)));
  if (!invite || invite.revokedAt) return null;
  const [p] = await db.select().from(handoverProtocolsTable).where(and(eq(handoverProtocolsTable.id, invite.protocolId), isNull(handoverProtocolsTable.archivedAt)));
  return p ? { invite, p } : null;
}

router.post("/protocols/:protocolId/invites", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustManage(a, res)) return;
  const b = CreateProtocolInviteBody.safeParse(req.body);
  if (!b.success) return bad(res, "Rolu seçin");
  const role = b.data.role;
  const [taken] = await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, a.p.id), eq(protocolParticipantsTable.role, role)));
  if (taken) return bad(res, "Bu rolda artıq iştirakçı var", 409);
  await db.update(protocolInvitesTable).set({ revokedAt: new Date() }).where(and(eq(protocolInvitesTable.protocolId, a.p.id), eq(protocolInvitesTable.role, role), isNull(protocolInvitesTable.revokedAt)));
  const token = newToken();
  const [inv] = await db.insert(protocolInvitesTable).values({ protocolId: a.p.id, role, tokenHash: hashToken(token), createdByUserId: a.userId }).returning();
  await event(a.p.id, a.userId, "invite_created", { role });
  res.status(201).json({ id: inv.id, role, url: `${publicOrigin(req)}/d/${token}` });
});

router.delete("/protocols/:protocolId/invites/:inviteId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustManage(a, res)) return;
  if (!isUuid(req.params.inviteId)) return bad(res, "Link tapılmadı", 404);
  const r = await db.update(protocolInvitesTable).set({ revokedAt: new Date() }).where(and(eq(protocolInvitesTable.id, req.params.inviteId), eq(protocolInvitesTable.protocolId, a.p.id), isNull(protocolInvitesTable.revokedAt))).returning();
  if (r.length) await event(a.p.id, a.userId, "invite_revoked", { role: r[0].role });
  res.json({ success: true });
});

protocolPublicRouter.get("/protocol-invites/:token", openLimit, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const token = String(req.params.token);
  const inv = await liveInvite(token);
  if (!inv) return bad(res, "Link etibarsızdır və ya ləğv edilib", 404);
  await db.update(protocolInvitesTable).set({ lastOpenedAt: new Date() }).where(eq(protocolInvitesTable.id, inv.invite.id));
  const userId = getAuth(req).userId;
  const [me] = userId ? await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, inv.p.id), eq(protocolParticipantsTable.userId, userId))) : [];
  const d = await detail(inv.p, { userId: me ? userId! : null, isCreator: false, role: me?.role ?? null, canEdit: false, token });
  res.json({ role: inv.invite.role, used: !!inv.invite.usedAt, usedByMe: !!userId && inv.invite.usedByUserId === userId, protocolId: inv.p.id, detail: { ...d, events: [], invites: [] } });
});

protocolPublicRouter.post("/protocol-invites/:token/accept", openLimit, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) return bad(res, "Davam etmək üçün daxil olun", 401);
  const inv = await liveInvite(String(req.params.token));
  if (!inv) return bad(res, "Link etibarsızdır və ya ləğv edilib", 404);
  const { invite, p } = inv;
  if (invite.usedByUserId && invite.usedByUserId !== userId) return bad(res, "Bu link artıq başqa hesabla istifadə olunub. Protokolu yaradandan yeni link istəyin", 409);
  const parts = await db.select().from(protocolParticipantsTable).where(eq(protocolParticipantsTable.protocolId, p.id));
  const mine = parts.find((x) => x.userId === userId);
  if (mine && mine.role !== invite.role) return bad(res, `Siz bu protokolda artıq “${mine.role === "seller" ? "satıcı" : mine.role === "buyer" ? "alıcı" : "rieltor"}” kimi iştirak edirsiniz`, 409);
  const holder = parts.find((x) => x.role === invite.role);
  if (holder && holder.userId !== userId) return bad(res, "Bu rolda artıq iştirakçı var", 409);
  if (!mine) {
    await db.insert(protocolParticipantsTable).values({ protocolId: p.id, userId, role: invite.role, canEdit: true }).onConflictDoNothing();
    await db.update(protocolInvitesTable).set({ usedByUserId: userId, usedAt: new Date() }).where(eq(protocolInvitesTable.id, invite.id));
    await event(p.id, userId, "joined", { role: invite.role });
  }
  const [me] = await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, p.id), eq(protocolParticipantsTable.userId, userId)));
  if (!me) return bad(res, "Qoşulmaq alınmadı. Yenidən cəhd edin", 409);
  res.json(await dto({ p, me, isCreator: p.createdByUserId === userId, userId }));
});

/* ------------------------------------------------------------------ versions and approvals */

router.post("/protocols/:protocolId/submit", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustManage(a, res)) return;
  const [last] = await db.select().from(protocolVersionsTable).where(eq(protocolVersionsTable.protocolId, a.p.id)).orderBy(desc(protocolVersionsTable.version)).limit(1);
  if (a.p.status === "awaiting" && last && last.revision === a.p.revision) return void res.json(await dto(a)); // repeated request
  if (!EDITABLE.includes(a.p.status)) return bad(res, "Bu protokol artıq təsdiq mərhələsindədir", 409);
  const snap = await snapshotOf(a.p);
  if (!snap.rooms.length) return bad(res, "Ən azı bir otaq əlavə edin");
  if (!a.p.sellerName.trim() || !a.p.buyerName.trim()) return bad(res, "Satıcının və alıcının adını yazın");
  const version = (last?.version ?? 0) + 1;
  const contentHash = hashOf(snap);
  const moved = await db.update(handoverProtocolsTable).set({ status: "awaiting", currentVersion: version, updatedAt: new Date() })
    .where(and(eq(handoverProtocolsTable.id, a.p.id), eq(handoverProtocolsTable.revision, a.p.revision), inArray(handoverProtocolsTable.status, EDITABLE))).returning();
  if (!moved.length) return bad(res, "Protokol bu anda dəyişdi. Səhifəni yeniləyib təkrar göndərin", 409);
  await db.insert(protocolVersionsTable).values({ protocolId: a.p.id, version, revision: a.p.revision, snapshot: snap as unknown as Record<string, unknown>, contentHash, createdByUserId: a.userId });
  await event(a.p.id, a.userId, "submitted", { version, contentHash });
  res.json(await dto({ ...a, p: moved[0] }));
});

router.post("/protocols/:protocolId/reopen", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustManage(a, res)) return;
  if (EDITABLE.includes(a.p.status)) return void res.json(await dto(a));
  const [p] = await db.update(handoverProtocolsTable).set({ status: "collecting", updatedAt: new Date() }).where(eq(handoverProtocolsTable.id, a.p.id)).returning();
  await event(a.p.id, a.userId, "reopened", { fromVersion: a.p.currentVersion, fromStatus: a.p.status });
  res.json(await dto({ ...a, p }));
});

/** How the person deciding is identified: a verified phone number is the strongest we record. */
async function identity(userId: string): Promise<{ level: string; detail: string }> {
  try {
    const u = await clerkClient.users.getUser(userId);
    const phone = u.phoneNumbers.find((x) => x.verification?.status === "verified");
    if (phone) return { level: "phone", detail: phone.phoneNumber.replace(/\d(?=\d{4})/g, "•") };
    const mail = u.emailAddresses.find((x) => x.verification?.status === "verified");
    if (mail) return { level: "email", detail: mail.emailAddress.replace(/^(.).*(@.*)$/, "$1•••$2") };
  } catch { /* identity service unavailable: fall back to the account itself */ }
  return { level: "account", detail: "" };
}

router.post("/protocols/:protocolId/decisions", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a) return;
  const b = DecideProtocolBody.safeParse(req.body);
  if (!b.success) return bad(res, "Qərarı yoxlayın");
  if (!DECIDERS.includes(a.me.role)) return bad(res, "Təsdiqi yalnız satıcı və alıcı verir", 403);
  const [v] = await db.select().from(protocolVersionsTable).where(and(eq(protocolVersionsTable.protocolId, a.p.id), eq(protocolVersionsTable.version, b.data.version)));
  if (!v) return bad(res, "Versiya tapılmadı", 404);
  const [prev] = await db.select().from(protocolApprovalsTable).where(and(eq(protocolApprovalsTable.protocolId, a.p.id), eq(protocolApprovalsTable.version, v.version), eq(protocolApprovalsTable.role, a.me.role)));
  if (prev) {
    if (prev.decision === b.data.decision) return void res.json(await dto(a)); // repeated request
    return bad(res, "Bu versiya üzrə artıq qərar vermisiniz", 409);
  }
  if (a.p.status !== "awaiting" || a.p.currentVersion !== v.version) return bad(res, "Bu versiya artıq aktual deyil. Səhifəni yeniləyin", 409);
  if (b.data.contentHash !== v.contentHash) return bad(res, "Protokolun məzmunu dəyişib. Səhifəni yeniləyib yenidən baxın", 409);
  if (b.data.decision === "changes" && !(b.data.comment ?? "").trim()) return bad(res, "Nəyin düzəldilməli olduğunu yazın");
  const who = await identity(a.userId);
  if (process.env.PROTOCOL_REQUIRE_PHONE === "on" && who.level !== "phone") return bad(res, "Təsdiq üçün hesabınızda telefon nömrəsini təsdiqləyin", 403);
  const inserted = await db.insert(protocolApprovalsTable).values({
    protocolId: a.p.id, version: v.version, contentHash: v.contentHash, role: a.me.role, userId: a.userId, decision: b.data.decision, comment: (b.data.comment ?? "").trim(),
    authLevel: who.level, authDetail: who.detail, ip: (req.ip ?? "").slice(0, 64), userAgent: (req.get("user-agent") ?? "").slice(0, 300),
  }).onConflictDoNothing().returning();
  if (!inserted.length) return void res.json(await dto(a));
  await event(a.p.id, a.userId, b.data.decision === "approved" ? "approved" : "changes_requested", { version: v.version, comment: (b.data.comment ?? "").slice(0, 300) });
  let status = a.p.status;
  if (b.data.decision === "changes") status = "collecting";
  else {
    const all = await db.select().from(protocolApprovalsTable).where(and(eq(protocolApprovalsTable.protocolId, a.p.id), eq(protocolApprovalsTable.version, v.version), eq(protocolApprovalsTable.decision, "approved")));
    if (DECIDERS.every((r) => all.some((x) => x.role === r))) status = "approved";
  }
  const [p] = await db.update(handoverProtocolsTable).set({ status, updatedAt: new Date() }).where(and(eq(handoverProtocolsTable.id, a.p.id), eq(handoverProtocolsTable.currentVersion, v.version))).returning();
  if (status === "approved") await event(a.p.id, null, "fully_approved", { version: v.version });
  res.json(await dto({ ...a, p: p ?? a.p }));
});

/* ------------------------------------------------------------------ PDF */

async function versionFor(a: Access, raw: unknown) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  const [v] = await db.select().from(protocolVersionsTable).where(and(eq(protocolVersionsTable.protocolId, a.p.id), eq(protocolVersionsTable.version, n)));
  return v ?? null;
}

async function readObject(objectPath: string): Promise<Buffer | null> {
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const chunks: Buffer[] = [];
    for await (const c of file.createReadStream()) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  } catch { return null; }
}

router.post("/protocols/:protocolId/versions/:version/pdf", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a) return;
  const v = await versionFor(a, req.params.version); if (!v) return bad(res, "Versiya tapılmadı", 404);
  const approvals = await db.select().from(protocolApprovalsTable).where(and(eq(protocolApprovalsTable.protocolId, a.p.id), eq(protocolApprovalsTable.version, v.version))).orderBy(asc(protocolApprovalsTable.createdAt));
  const final = DECIDERS.every((r) => approvals.some((x) => x.role === r && x.decision === "approved"));
  const snap = v.snapshot as unknown as ProtocolSnapshot;
  const media = await db.select().from(protocolMediaTable).where(eq(protocolMediaTable.protocolId, a.p.id));
  const byId = new Map(media.map((m) => [m.id, m]));
  let pdf: Buffer;
  try {
    pdf = await renderProtocolPdf({
      snapshot: snap, version: v.version, contentHash: v.contentHash, createdAt: v.createdAt, final,
      approvals: approvals.map((x) => ({ role: x.role, decision: x.decision, at: x.createdAt, authLevel: x.authLevel, authDetail: x.authDetail, comment: x.comment })),
      captions: new Map(media.filter((m) => m.caption).map((m) => [m.id, m.caption])),
      photo: async (id) => { const m = byId.get(id); return m && PHOTO_TYPES.includes(m.contentType) ? readObject(m.objectPath) : null; },
    });
  } catch (err) { req.log.error({ err }, "protocol pdf failed"); return bad(res, "PDF yaradılmadı. Yenidən cəhd edin", 500); }
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  const put = await fetch(uploadURL, { method: "PUT", body: new Uint8Array(pdf), headers: { "Content-Type": "application/pdf" } });
  if (!put.ok) { req.log.error({ status: put.status }, "protocol pdf upload failed"); return bad(res, "PDF saxlanılmadı. Yenidən cəhd edin", 502); }
  await db.update(protocolVersionsTable).set({ pdfObjectPath: objectPath, pdfCreatedAt: new Date() }).where(eq(protocolVersionsTable.id, v.id));
  let p = a.p;
  if (final && v.version === a.p.currentVersion && a.p.status === "approved") [p] = await db.update(handoverProtocolsTable).set({ status: "finalized", updatedAt: new Date() }).where(eq(handoverProtocolsTable.id, a.p.id)).returning();
  await event(a.p.id, a.userId, "pdf_created", { version: v.version, final });
  res.json(await dto({ ...a, p }));
});

router.get("/protocols/:protocolId/versions/:version/pdf", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a) return;
  const v = await versionFor(a, req.params.version); if (!v?.pdfObjectPath) return bad(res, "PDF hələ yaradılmayıb", 404);
  const buf = await readObject(v.pdfObjectPath);
  if (!buf) return bad(res, "PDF tapılmadı. Yenidən yaradın", 404);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="tehvil-${a.p.number}-v${v.version}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.end(buf);
});

export default router;
