import { createHash, randomInt } from "node:crypto";
import { Readable } from "node:stream";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AddProtocolDefectBody, AddProtocolItemBody, AddProtocolMediaBody, AddProtocolRoomBody, CreateProtocolBody, CreateProtocolInviteBody, DecideProtocolBody,
  UpdateProtocolBody, UpdateProtocolItemBody, UpdateProtocolRoomBody,
} from "@workspace/api-zod";
import {
  db, evidenceUploadsTable, handoverProtocolsTable, protocolApprovalsTable, protocolDefectsTable, protocolEventsTable, protocolInvitesTable,
  protocolItemsTable, protocolMediaTable, protocolParticipantsTable, protocolRoomsTable, protocolVersionsTable, rentalInvitesTable, rentalParticipantsTable, rentalsTable,
  type HandoverProtocolRow, type ProtocolExtrasJson, type RentalRow,
} from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { renderProtocolPdf, type ProtocolSnapshot } from "../lib/protocolPdf";
import { rateLimit } from "../lib/rateLimit";
import { hashToken, newToken, publicOrigin } from "../lib/realtorCore";
import { getHomeAccess, homePermissions } from "../lib/homeAccess";
import { buildManifest, canonicalHash, eventHash, finalRecord, sha256, trustServices, verifyChain, type ManifestPhoto } from "../lib/integrity";

/** Invitation pages and photos opened through an invitation link work without sign-in. */
export const protocolPublicRouter: IRouter = Router();
const router: IRouter = Router();
const storage = new ObjectStorageService();
export const openLimit = rateLimit({ windowMs: 60_000, max: 120, key: (req) => `pi:${req.ip}` });

const EDITABLE = ["draft", "collecting"];
const PHOTO_TYPES = ["image/jpeg", "image/png"];
const MAX_PHOTO = 15 * 1024 * 1024;
/** Who has to approve: buyer and seller for a sale, landlord and tenant for a rental. */
export const decidersFor = (kind: string) => (kind === "sale" ? ["seller", "buyer"] : ["landlord", "tenant"]);
const ROOM_TEMPLATES: Record<string, [string, string][]> = {
  apartment: [["Qonaq otağı", "living"], ["Yataq otağı", "bed"], ["Mətbəx", "kitchen"], ["Hamam və tualet", "bath"], ["Dəhliz", "hall"], ["Balkon", "balcony"]],
  house: [["Qonaq otağı", "living"], ["Yataq otağı", "bed"], ["Mətbəx", "kitchen"], ["Hamam və tualet", "bath"], ["Dəhliz", "hall"], ["Həyət", "other"]],
  other: [["Əsas otaq", "other"], ["Hamam və tualet", "bath"], ["Dəhliz", "hall"]],
};
/** What is checked in every room of a rental; furniture and appliances are added by the person. */
const ITEM_TEMPLATES: Record<string, [string, string][]> = {
  base: [["Divarlar", "wall"], ["Döşəmə", "floor"], ["Tavan", "ceiling"], ["Pəncərə", "window"], ["Qapı", "door"]],
  kitchen: [["Mətbəx mebeli", "furniture"], ["Qaz plitəsi / soba", "appliance"]],
  bath: [["Santexnika (unitaz, lavabo, vanna/duş)", "appliance"]],
};
const itemsFor = (kind: string): [string, string][] => [
  ...ITEM_TEMPLATES.base.filter(([, c]) => !(c === "window" && (kind === "hall" || kind === "bath"))),
  ...(ITEM_TEMPLATES[kind] ?? []),
];
/** Invitation links stop working this many days after they were created (env INVITE_TTL_DAYS). */
export const inviteTtlDays = () => Math.max(1, Math.min(365, Number(process.env.INVITE_TTL_DAYS) || 30));
export const inviteExpired = (createdAt: Date) => createdAt.getTime() < Date.now() - inviteTtlDays() * 86400_000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Where a protocol is in its life, for people: created → collecting → invited → one/both approved → PDF ready. */
export type Stage = "created" | "collecting" | "invited" | "awaiting" | "one_approved" | "both_approved" | "pdf_ready";
export function stageOf(p: { status: string; revision: number }, x: { invited: boolean; joined: boolean; approvedNow: number; hasMedia: boolean }): Stage {
  if (p.status === "finalized") return "pdf_ready";
  if (p.status === "approved") return "both_approved";
  if (p.status === "awaiting") return x.approvedNow >= 1 ? "one_approved" : "awaiting";
  if (x.invited || x.joined) return "invited";
  return p.revision > 0 || x.hasMedia ? "collecting" : "created";
}

const emptyExtras = (): ProtocolExtrasJson => ({
  meters: { water: { value: "", note: "", mediaIds: [] }, gas: { value: "", note: "", mediaIds: [] }, electric: { value: "", note: "", mediaIds: [] } },
  keys: [{ kind: "Giriş qapısı açarı", count: 0 }], notes: "",
});

const uid = (req: Request) => getAuth(req).userId!;
export const bad = (res: Response, error: string, status = 400) => { res.status(status).json({ error }); };
export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

/** Audit event, chained per protocol (each hash covers the previous one); a per-protocol lock keeps the chain linear. */
export async function event(protocolId: string, userId: string | null, action: string, detail: Record<string, unknown> = {}) {
  const clean = JSON.parse(JSON.stringify(detail)) as Record<string, unknown>;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${protocolId}))`);
    const [last] = await tx.select({ hash: protocolEventsTable.hash, createdAt: protocolEventsTable.createdAt }).from(protocolEventsTable)
      .where(and(eq(protocolEventsTable.protocolId, protocolId), ne(protocolEventsTable.hash, ""))).orderBy(desc(protocolEventsTable.createdAt)).limit(1);
    let at = new Date(Math.floor(Date.now()));
    if (last && at.getTime() <= last.createdAt.getTime()) at = new Date(last.createdAt.getTime() + 1);
    const prevHash = last?.hash ?? "";
    await tx.insert(protocolEventsTable).values({ protocolId, userId, action, detail: clean, createdAt: at, prevHash, hash: eventHash({ prevHash, protocolId, userId, action, detail: clean, at }) });
  });
}

export interface Me { role: string; canEdit: boolean }
/** The protocol and the signed-in person's place in it (through the rental for move-in / move-out). Unknown, archived or foreign → null. */
async function access(req: Request, protocolId: unknown) {
  if (!isUuid(protocolId)) return null;
  const [p] = await db.select().from(handoverProtocolsTable).where(and(eq(handoverProtocolsTable.id, protocolId), isNull(handoverProtocolsTable.archivedAt)));
  if (!p) return null;
  const userId = getAuth(req).userId;
  if (!userId) return null;
  if (p.rentalId) {
    const [rental] = await db.select().from(rentalsTable).where(and(eq(rentalsTable.id, p.rentalId), isNull(rentalsTable.archivedAt)));
    if (!rental) return null;
    const [rp] = await db.select().from(rentalParticipantsTable).where(and(eq(rentalParticipantsTable.rentalId, rental.id), eq(rentalParticipantsTable.userId, userId)));
    if (!rp) return null;
    return { p, me: { role: rp.role, canEdit: rp.canEdit } as Me, isCreator: rental.createdByUserId === userId, userId, rental: rental as RentalRow | null };
  }
  const [me] = await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, p.id), eq(protocolParticipantsTable.userId, userId)));
  if (!me) return null;
  return { p, me: { role: me.role, canEdit: me.canEdit } as Me, isCreator: p.createdByUserId === userId, userId, rental: null as RentalRow | null };
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

export async function newNumber(prefix = "TP", table: "protocols" | "rentals" = "protocols") {
  const y = new Date().getFullYear();
  for (let i = 0; i < 6; i++) {
    const n = `${prefix}-${y}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const [hit] = table === "protocols"
      ? await db.select({ id: handoverProtocolsTable.id }).from(handoverProtocolsTable).where(eq(handoverProtocolsTable.number, n))
      : await db.select({ id: rentalsTable.id }).from(rentalsTable).where(eq(rentalsTable.number, n));
    if (!hit) return n;
  }
  throw new Error("Could not allocate a number");
}

/* ------------------------------------------------------------------ snapshot */

export async function snapshotOf(p: HandoverProtocolRow, rental: RentalRow | null): Promise<ProtocolSnapshot> {
  const [rooms, items, defects, media] = await Promise.all([
    db.select().from(protocolRoomsTable).where(eq(protocolRoomsTable.protocolId, p.id)).orderBy(asc(protocolRoomsTable.position), asc(protocolRoomsTable.createdAt)),
    db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, p.id)).orderBy(asc(protocolItemsTable.position), asc(protocolItemsTable.createdAt)),
    db.select().from(protocolDefectsTable).where(eq(protocolDefectsTable.protocolId, p.id)).orderBy(asc(protocolDefectsTable.createdAt)),
    db.select().from(protocolMediaTable).where(and(eq(protocolMediaTable.protocolId, p.id), isNull(protocolMediaTable.deletedAt))).orderBy(asc(protocolMediaTable.createdAt)),
  ]);
  const ids = (f: (m: typeof media[number]) => boolean) => media.filter(f).map((m) => m.id);
  const x = p.extras;
  const parties = rental ? [
    { role: "landlord", name: rental.landlordName, phone: rental.landlordPhone },
    { role: "tenant", name: rental.tenantName, phone: rental.tenantPhone },
    ...(rental.realtorName || rental.realtorPhone ? [{ role: "realtor", name: rental.realtorName, phone: rental.realtorPhone }] : []),
  ] : [
    { role: "seller", name: p.sellerName, phone: p.sellerPhone },
    { role: "buyer", name: p.buyerName, phone: p.buyerPhone },
    ...(p.realtorName || p.realtorPhone || p.creatorRole === "realtor" ? [{ role: "realtor", name: p.realtorName, phone: p.realtorPhone, agency: p.realtorAgency }] : []),
  ];
  return {
    kind: p.kind, number: p.number, address: rental?.address ?? p.address, propertyType: rental?.propertyType ?? p.propertyType, handoverDate: p.handoverDate, handoverTime: p.handoverTime,
    rental: rental ? { number: rental.number, startDate: rental.startDate, endDate: rental.endDate, monthlyRent: rental.monthlyRent, deposit: rental.deposit, currency: rental.currency } : null,
    base: p.baseProtocolId ? { protocolId: p.baseProtocolId, version: p.baseVersion } : null,
    parties,
    rooms: rooms.map((r) => ({
      id: r.id, name: r.name, kind: r.kind, condition: r.condition, note: r.note, prevRoomId: r.prevRoomId,
      photos: ids((m) => m.target === "room" && m.roomId === r.id),
      items: items.filter((it) => it.roomId === r.id).map((it) => ({ id: it.id, name: it.name, category: it.category, quantity: it.quantity, condition: it.condition, note: it.note, change: it.change, prevItemId: it.prevItemId, photos: ids((m) => m.target === "item" && m.itemId === it.id) })),
      defects: defects.filter((d) => d.roomId === r.id).map((d) => ({ id: d.id, text: d.text, photos: ids((m) => m.target === "defect" && m.defectId === d.id) })),
    })),
    meters: (["water", "gas", "electric"] as const).map((k) => ({ kind: k, value: x.meters[k]?.value ?? "", note: x.meters[k]?.note ?? "", na: !!x.meters[k]?.na, photos: ids((m) => m.target === "meter" && m.meterKind === k) })),
    keys: x.keys, keyPhotos: ids((m) => m.target === "keys"), notes: x.notes, otherPhotos: ids((m) => m.target === "other"),
    revision: p.revision,
    ...(p.kind === "move_out" ? { baseline: (p.baseline as unknown as ProtocolSnapshot) ?? null } : {}),
  };
}
export const hashOf = (s: ProtocolSnapshot) => createHash("sha256").update(JSON.stringify(s)).digest("hex");

/* ------------------------------------------------------------------ DTO */

export const mediaDto = (m: typeof protocolMediaTable.$inferSelect, token?: string, tokenParam = "t") => ({
  id: m.id, roomId: m.roomId, itemId: m.itemId, defectId: m.defectId, target: m.target, meterKind: m.meterKind, caption: m.caption, contentType: m.contentType,
  url: `/api/protocol-media/${m.id}${token ? `?${tokenParam}=${encodeURIComponent(token)}` : ""}`,
  createdAt: m.createdAt.toISOString(), takenAt: m.takenAt?.toISOString() ?? null, takenSource: m.takenSource, sha256: m.sha256 || null,
  hasGps: !!(m.clientMeta as { gps?: unknown } | null)?.gps,
});

export async function detail(p: HandoverProtocolRow, viewer: { userId: string | null; isCreator: boolean; role: string | null; canEdit: boolean; token?: string; tokenParam?: string }, rental: RentalRow | null = null) {
  const [rooms, items, defects, media, versions, approvals] = await Promise.all([
    db.select().from(protocolRoomsTable).where(eq(protocolRoomsTable.protocolId, p.id)).orderBy(asc(protocolRoomsTable.position), asc(protocolRoomsTable.createdAt)),
    db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, p.id)).orderBy(asc(protocolItemsTable.position), asc(protocolItemsTable.createdAt)),
    db.select().from(protocolDefectsTable).where(eq(protocolDefectsTable.protocolId, p.id)).orderBy(asc(protocolDefectsTable.createdAt)),
    db.select().from(protocolMediaTable).where(and(eq(protocolMediaTable.protocolId, p.id), isNull(protocolMediaTable.deletedAt))).orderBy(asc(protocolMediaTable.createdAt)),
    db.select().from(protocolVersionsTable).where(eq(protocolVersionsTable.protocolId, p.id)).orderBy(desc(protocolVersionsTable.version)),
    db.select().from(protocolApprovalsTable).where(eq(protocolApprovalsTable.protocolId, p.id)).orderBy(asc(protocolApprovalsTable.createdAt)),
  ]);
  const participants = rental
    ? (await db.select().from(rentalParticipantsTable).where(eq(rentalParticipantsTable.rentalId, rental.id))).map((x) => ({ userId: x.userId, role: x.role, joinedAt: x.joinedAt }))
    : (await db.select().from(protocolParticipantsTable).where(eq(protocolParticipantsTable.protocolId, p.id))).map((x) => ({ userId: x.userId, role: x.role, joinedAt: x.joinedAt }));
  const creatorId = rental?.createdByUserId ?? p.createdByUserId;
  const allInvites = rental ? [] : await db.select().from(protocolInvitesTable).where(eq(protocolInvitesTable.protocolId, p.id));
  const invites = viewer.isCreator ? allInvites.filter((i) => !i.revokedAt) : [];
  const stage = stageOf(p, { invited: allInvites.length > 0, joined: participants.length > 1, approvedNow: approvals.filter((a) => a.version === p.currentVersion && a.decision === "approved").length, hasMedia: media.length > 0 });
  const events = viewer.userId ? await db.select().from(protocolEventsTable).where(eq(protocolEventsTable.protocolId, p.id)).orderBy(desc(protocolEventsTable.createdAt)).limit(60) : [];
  // Move-out compares with the frozen move-in content; its photos are served through this rental too.
  const baseline = p.baseline as (ProtocolSnapshot & Record<string, unknown>) | null;
  const baseIds = baseline ? [...baseline.rooms.flatMap((r) => [...r.photos, ...(r.items ?? []).flatMap((i) => i.photos), ...r.defects.flatMap((d) => d.photos)]), ...baseline.meters.flatMap((m) => m.photos), ...baseline.keyPhotos] : [];
  const baseMedia = baseIds.length ? await db.select().from(protocolMediaTable).where(inArray(protocolMediaTable.id, baseIds)) : [];
  const roleOf = (u: string | null) => participants.find((x) => x.userId === u)?.role ?? null;
  const cur = versions.find((v) => v.version === p.currentVersion);
  const myDecision = approvals.find((a) => a.version === p.currentVersion && a.role === viewer.role);
  const mask = (phone: string) => (viewer.userId ? phone : phone.replace(/\d(?=\d{2})/g, "•"));
  const deciders = decidersFor(p.kind);
  return {
    protocol: {
      id: p.id, number: p.number, kind: p.kind, rentalId: p.rentalId, address: rental?.address ?? p.address, propertyType: rental?.propertyType ?? p.propertyType, handoverDate: p.handoverDate, status: p.status, creatorRole: p.creatorRole,
      sellerName: p.sellerName, sellerPhone: mask(p.sellerPhone), buyerName: p.buyerName, buyerPhone: mask(p.buyerPhone),
      realtorName: rental?.realtorName ?? p.realtorName, realtorPhone: mask(rental?.realtorPhone ?? p.realtorPhone), realtorAgency: p.realtorAgency, handoverTime: p.handoverTime, stage,
      homeId: viewer.userId ? p.homeId : null,
      landlordName: rental?.landlordName ?? "", landlordPhone: mask(rental?.landlordPhone ?? ""), tenantName: rental?.tenantName ?? "", tenantPhone: mask(rental?.tenantPhone ?? ""),
      extras: p.extras, revision: p.revision, currentVersion: p.currentVersion, baseProtocolId: p.baseProtocolId, baseVersion: p.baseVersion,
      createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
    },
    rental: rental ? { id: rental.id, number: rental.number, startDate: rental.startDate, endDate: rental.endDate, monthlyRent: rental.monthlyRent, deposit: rental.deposit, currency: rental.currency } : null,
    deciders,
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, kind: r.kind, condition: r.condition, note: r.note, position: r.position, prevRoomId: r.prevRoomId })),
    items: items.map((i) => ({ id: i.id, roomId: i.roomId, name: i.name, category: i.category, quantity: i.quantity, condition: i.condition, note: i.note, change: i.change, prevItemId: i.prevItemId, position: i.position })),
    defects: defects.map((d) => ({ id: d.id, roomId: d.roomId, text: d.text, createdAt: d.createdAt.toISOString() })),
    media: media.map((m) => mediaDto(m, viewer.token, viewer.tokenParam)),
    baseline: baseline ? { ...baseline, media: baseMedia.map((m) => mediaDto(m, viewer.token, viewer.tokenParam)) } : null,
    participants: participants.map((x) => ({ role: x.role, joinedAt: x.joinedAt.toISOString(), isMe: x.userId === viewer.userId, isCreator: x.userId === creatorId })),
    invites: invites.map((i) => ({ id: i.id, role: i.role, createdAt: i.createdAt.toISOString(), expiresAt: new Date(i.createdAt.getTime() + inviteTtlDays() * 86400_000).toISOString(), expired: inviteExpired(i.createdAt), used: !!i.usedAt, lastOpenedAt: i.lastOpenedAt?.toISOString() ?? null })),
    versions: versions.map((v) => ({ version: v.version, contentHash: v.contentHash, createdAt: v.createdAt.toISOString(), hasPdf: !!v.pdfObjectPath, pdfCreatedAt: v.pdfCreatedAt?.toISOString() ?? null, manifestHash: v.manifestHash || null, finalHash: v.finalHash || null, verifyCode: viewer.userId ? v.verifyCode : null })),
    approvals: approvals.map((a) => ({ version: a.version, role: a.role, decision: a.decision, comment: a.comment, authLevel: a.authLevel, createdAt: a.createdAt.toISOString(), manifestHash: a.manifestHash || null })),
    events: events.map((e) => ({ action: e.action, role: roleOf(e.userId), detail: e.detail, createdAt: e.createdAt.toISOString() })),
    me: {
      role: viewer.role, isCreator: viewer.isCreator, canEdit: viewer.canEdit && EDITABLE.includes(p.status),
      canDecide: !!viewer.role && deciders.includes(viewer.role) && p.status === "awaiting" && !myDecision,
      current: cur ? { version: cur.version, contentHash: cur.contentHash } : null,
    },
  };
}
const dto = (a: Access) => detail(a.p, { userId: a.userId, isCreator: a.isCreator, role: a.me.role, canEdit: a.me.canEdit }, a.rental);
const reload = async (a: Access) => { const [p] = await db.select().from(handoverProtocolsTable).where(eq(handoverProtocolsTable.id, a.p.id)); return dto({ ...a, p }); };

/** Creates the move-in (from templates) or move-out (from the move-in content) protocol of a rental. */
export async function createRentalProtocol(rental: RentalRow, userId: string, role: string, kind: "move_in" | "move_out", base?: { protocol: HandoverProtocolRow; version: number | null; snapshot: ProtocolSnapshot }) {
  const [p] = await db.insert(handoverProtocolsTable).values({
    number: await newNumber(kind === "move_in" ? "KG" : "KC"), createdByUserId: userId, creatorRole: role, kind, rentalId: rental.id, propertyType: rental.propertyType, address: rental.address,
    handoverDate: kind === "move_in" ? rental.startDate : rental.endDate,
    extras: base ? { ...emptyExtras(), keys: base.snapshot.keys.map((k) => ({ kind: k.kind, count: 0 })) } : emptyExtras(),
    baseProtocolId: base?.protocol.id ?? null, baseVersion: base?.version ?? null, baseline: base ? (base.snapshot as unknown as Record<string, unknown>) : null,
  }).returning();
  if (base) {
    for (const [i, r] of base.snapshot.rooms.entries()) {
      const [room] = await db.insert(protocolRoomsTable).values({ protocolId: p.id, name: r.name, kind: r.kind, position: i, prevRoomId: r.id }).returning();
      const its = r.items ?? [];
      if (its.length) await db.insert(protocolItemsTable).values(its.map((it, k) => ({ protocolId: p.id, roomId: room.id, name: it.name, category: it.category, quantity: it.quantity, position: k, prevItemId: it.id })));
    }
  } else {
    for (const [i, [name, rk]] of (ROOM_TEMPLATES[rental.propertyType] ?? ROOM_TEMPLATES.other).entries()) {
      const [room] = await db.insert(protocolRoomsTable).values({ protocolId: p.id, name, kind: rk, position: i }).returning();
      await db.insert(protocolItemsTable).values(itemsFor(rk).map(([n, c], k) => ({ protocolId: p.id, roomId: room.id, name: n, category: c, position: k })));
    }
  }
  await event(p.id, userId, "created", { role, kind });
  return p;
}

/* ------------------------------------------------------------------ protocols */

router.get("/protocols", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const mine = await db.select({ p: handoverProtocolsTable, role: protocolParticipantsTable.role }).from(protocolParticipantsTable)
    .innerJoin(handoverProtocolsTable, eq(handoverProtocolsTable.id, protocolParticipantsTable.protocolId))
    .where(and(eq(protocolParticipantsTable.userId, uid(req)), isNull(handoverProtocolsTable.archivedAt))).orderBy(desc(handoverProtocolsTable.updatedAt)).limit(200);
  const ids = mine.map((m) => m.p.id);
  const rooms = ids.length ? await db.select({ pid: protocolRoomsTable.protocolId }).from(protocolRoomsTable).where(inArray(protocolRoomsTable.protocolId, ids)) : [];
  const photos = ids.length ? await db.select({ pid: protocolMediaTable.protocolId }).from(protocolMediaTable).where(and(inArray(protocolMediaTable.protocolId, ids), isNull(protocolMediaTable.deletedAt))) : [];
  const invs = ids.length ? await db.select({ pid: protocolInvitesTable.protocolId }).from(protocolInvitesTable).where(inArray(protocolInvitesTable.protocolId, ids)) : [];
  const parts = ids.length ? await db.select({ pid: protocolParticipantsTable.protocolId }).from(protocolParticipantsTable).where(inArray(protocolParticipantsTable.protocolId, ids)) : [];
  const apprs = ids.length ? await db.select({ pid: protocolApprovalsTable.protocolId, version: protocolApprovalsTable.version, role: protocolApprovalsTable.role, decision: protocolApprovalsTable.decision }).from(protocolApprovalsTable).where(inArray(protocolApprovalsTable.protocolId, ids)) : [];
  res.json(mine.map(({ p, role }) => {
    const now = apprs.filter((a) => a.pid === p.id && a.version === p.currentVersion);
    const nPhotos = photos.filter((m) => m.pid === p.id).length;
    return { id: p.id, number: p.number, address: p.address, status: p.status, myRole: role, handoverDate: p.handoverDate, updatedAt: p.updatedAt.toISOString(),
      rooms: rooms.filter((r) => r.pid === p.id).length, photos: nPhotos,
      stage: stageOf(p, { invited: invs.some((i) => i.pid === p.id), joined: parts.filter((x) => x.pid === p.id).length > 1, approvedNow: now.filter((a) => a.decision === "approved").length, hasMedia: nPhotos > 0 }),
      decisions: p.currentVersion ? decidersFor(p.kind).map((r) => ({ role: r, decision: now.find((a) => a.role === r)?.decision ?? null })) : [] };
  }));
});

router.post("/protocols", async (req, res): Promise<void> => {
  const b = CreateProtocolBody.safeParse(req.body);
  if (!b.success) return bad(res, "Ünvanı və rolunuzu yoxlayın");
  const d = b.data, userId = uid(req);
  // Linking to a home history needs edit rights on that home.
  let homeId: string | null = null;
  if (d.homeId) {
    const ha = await getHomeAccess(userId, d.homeId);
    if (!ha || !homePermissions(ha).edit) return bad(res, "Bu ev tarixçəsinə protokol bağlamaq icazəniz yoxdur", 403);
    homeId = ha.home.id;
  }
  const [p] = await db.insert(handoverProtocolsTable).values({ homeId,
    number: await newNumber(), createdByUserId: userId, creatorRole: d.role, propertyType: d.propertyType, address: d.address.trim(), handoverDate: d.handoverDate ?? null,
    sellerName: d.sellerName?.trim() ?? "", sellerPhone: d.sellerPhone?.trim() ?? "", buyerName: d.buyerName?.trim() ?? "", buyerPhone: d.buyerPhone?.trim() ?? "",
    realtorName: d.realtorName?.trim() ?? "", realtorPhone: d.realtorPhone?.trim() ?? "", realtorAgency: d.realtorAgency?.trim() ?? "", handoverTime: HHMM.test(d.handoverTime ?? "") ? d.handoverTime! : "", extras: emptyExtras(),
  }).returning();
  await db.insert(protocolParticipantsTable).values({ protocolId: p.id, userId, role: d.role, canEdit: true });
  await db.insert(protocolRoomsTable).values((ROOM_TEMPLATES[d.propertyType] ?? ROOM_TEMPLATES.other).map(([name, kind], i) => ({ protocolId: p.id, name, kind, position: i })));
  await event(p.id, userId, "created", { role: d.role });
  const [me] = await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, p.id), eq(protocolParticipantsTable.userId, userId)));
  res.status(201).json(await dto({ p, me: { role: me.role, canEdit: me.canEdit }, isCreator: true, userId, rental: null }));
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
  // Rental protocols take address and parties from the rental; only their own content is edited here.
  if (d.handoverTime && !HHMM.test(d.handoverTime)) return bad(res, "Saatı SS:DD formatında yazın, məsələn 14:30");
  if (a.rental && (["propertyType", "address", "sellerName", "sellerPhone", "buyerName", "buyerPhone", "realtorName", "realtorPhone", "realtorAgency"] as const).some((k) => d[k] !== undefined)) return bad(res, "Ünvan və tərəflər kirayə səhifəsində dəyişdirilir");
  const set: Partial<typeof handoverProtocolsTable.$inferInsert> = {};
  for (const k of ["propertyType", "address", "handoverDate", "handoverTime", "sellerName", "sellerPhone", "buyerName", "buyerPhone", "realtorName", "realtorPhone", "realtorAgency"] as const) if (d[k] !== undefined) (set as Record<string, unknown>)[k] = typeof d[k] === "string" ? (d[k] as string).trim() : d[k];
  if (d.extras !== undefined) {
    const x = d.extras as Partial<ProtocolExtrasJson>;
    const meter = (m: unknown) => { const o = (m ?? {}) as { value?: unknown; note?: unknown; mediaIds?: unknown; na?: unknown }; return { value: o.na === true ? "" : String(o.value ?? "").slice(0, 40), note: String(o.note ?? "").slice(0, 500), mediaIds: [] as string[], ...(o.na === true ? { na: true } : {}) }; };
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
  if (r.prevRoomId) return bad(res, "Girişdə qeyd olunmuş otaq çıxışda silinmir", 409);
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
  if (d.target === "item") {
    if (!isUuid(d.itemId)) return bad(res, "Element tapılmadı", 404);
    const [it] = await db.select().from(protocolItemsTable).where(and(eq(protocolItemsTable.id, d.itemId), eq(protocolItemsTable.protocolId, a.p.id)));
    if (!it) return bad(res, "Element tapılmadı", 404);
  }
  // The device's “taken at” is kept only if plausible (not in the future, not older than 20 years); it is never proof.
  const taken = d.takenAt ? new Date(d.takenAt) : null;
  const cm = (d as { clientMeta?: { gps?: { lat?: unknown; lon?: unknown } } }).clientMeta;
  const lat = Number(cm?.gps?.lat), lon = Number(cm?.gps?.lon);
  const clientMeta = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0) ? { gps: { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 }, source: "exif" } : null;
  const takenAt = taken && !Number.isNaN(taken.getTime()) && taken.getTime() <= Date.now() + 5 * 60_000 && taken.getTime() > Date.now() - 20 * 365 * 86_400_000 ? taken : null;
  for (const f of d.files) {
    if (!f.objectPath.startsWith("/objects/uploads/") || !PHOTO_TYPES.includes(f.contentType) || f.size < 1 || f.size > MAX_PHOTO) return bad(res, "Yalnız 15 MB-a qədər JPG və ya PNG foto əlavə etmək olar");
  }
  // Already attached by this person (a repeated request after a lost response): return the protocol unchanged.
  const already = await db.select({ objectPath: protocolMediaTable.objectPath }).from(protocolMediaTable).where(and(eq(protocolMediaTable.protocolId, a.p.id), inArray(protocolMediaTable.objectPath, d.files.map((f) => f.objectPath))));
  const fresh = d.files.filter((f) => !already.some((x) => x.objectPath === f.objectPath));
  if (!fresh.length) return void res.status(201).json(await reload(a));
  const hashes = new Map<string, string>();
  try {
    for (const f of fresh) {
      const [up] = await db.select().from(evidenceUploadsTable).where(and(eq(evidenceUploadsTable.objectPath, f.objectPath), eq(evidenceUploadsTable.userId, a.userId), isNull(evidenceUploadsTable.attachedAt)));
      if (!up || up.contentType !== f.contentType || up.size !== f.size || up.expiresAt <= new Date()) return bad(res, "Foto yüklənmədi. Yenidən cəhd edin");
      const file = await storage.getObjectEntityFile(f.objectPath);
      const [meta] = await file.getMetadata();
      if (Number(meta.size) !== f.size) return bad(res, "Foto tam yüklənməyib. Yenidən cəhd edin");
      // The server's own fingerprint of exactly the bytes it stored.
      const buf = await readObject(f.objectPath);
      if (!buf || buf.length !== f.size) return bad(res, "Foto tam yüklənməyib. Yenidən cəhd edin");
      hashes.set(f.objectPath, sha256(buf));
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
      protocolId: a.p.id, roomId: d.target === "room" ? d.roomId ?? null : null, defectId: d.target === "defect" ? d.defectId ?? null : null, itemId: d.target === "item" ? d.itemId ?? null : null, target: d.target,
      takenAt, takenSource: takenAt ? d.takenSource ?? null : null,
      meterKind: d.target === "meter" ? d.meterKind ?? null : null, objectPath: f.objectPath, contentType: f.contentType, size: f.size, originalName: f.originalName.slice(0, 255),
      caption: d.caption ?? "", uploadedByUserId: a.userId, sha256: hashes.get(f.objectPath) ?? "", clientMeta,
    })));
  });
  const added = await db.select({ id: protocolMediaTable.id, sha256: protocolMediaTable.sha256, target: protocolMediaTable.target }).from(protocolMediaTable).where(and(eq(protocolMediaTable.protocolId, a.p.id), inArray(protocolMediaTable.objectPath, fresh.map((f) => f.objectPath))));
  for (const m of added) await event(a.p.id, a.userId, "photo_added", { mediaId: m.id, sha256: m.sha256, target: m.target });
  await touch(a.p);
  res.status(201).json(await reload(a));
});

router.delete("/protocols/:protocolId/media/:mediaId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  if (!isUuid(req.params.mediaId)) return bad(res, "Foto tapılmadı", 404);
  const del = await db.update(protocolMediaTable).set({ deletedAt: new Date(), deletedByUserId: a.userId }).where(and(eq(protocolMediaTable.id, req.params.mediaId), eq(protocolMediaTable.protocolId, a.p.id), isNull(protocolMediaTable.deletedAt))).returning();
  // The file and its hash stay; only the protocol stops showing it.
  if (del.length) { await event(a.p.id, a.userId, "photo_removed", { mediaId: del[0].id, sha256: del[0].sha256 }); await touch(a.p); }
  res.json(await reload(a));
});

/** A photo: for participants, or for anyone holding a live invitation link of this protocol. */
protocolPublicRouter.get("/protocol-media/:mediaId", openLimit, async (req, res): Promise<void> => {
  if (!isUuid(req.params.mediaId)) return bad(res, "Foto tapılmadı", 404);
  const [m] = await db.select().from(protocolMediaTable).where(eq(protocolMediaTable.id, req.params.mediaId));
  if (!m) return bad(res, "Foto tapılmadı", 404);
  let allowed = false;
  const userId = getAuth(req).userId;
  const [owner] = await db.select({ rentalId: handoverProtocolsTable.rentalId }).from(handoverProtocolsTable).where(eq(handoverProtocolsTable.id, m.protocolId));
  if (userId) {
    if (owner?.rentalId) {
      const [rp] = await db.select().from(rentalParticipantsTable).where(and(eq(rentalParticipantsTable.rentalId, owner.rentalId), eq(rentalParticipantsTable.userId, userId)));
      allowed = !!rp;
    } else {
      const [me] = await db.select().from(protocolParticipantsTable).where(and(eq(protocolParticipantsTable.protocolId, m.protocolId), eq(protocolParticipantsTable.userId, userId)));
      allowed = !!me;
    }
  }
  if (!allowed && typeof req.query.t === "string") { const inv = await liveInvite(req.query.t); allowed = !!inv && inv.invite.protocolId === m.protocolId; }
  if (!allowed && typeof req.query.k === "string" && owner?.rentalId) { const inv = await liveRentalInvite(req.query.k); allowed = !!inv && inv.invite.rentalId === owner.rentalId; }
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
  if (!invite || invite.revokedAt || inviteExpired(invite.createdAt)) return null;
  const [p] = await db.select().from(handoverProtocolsTable).where(and(eq(handoverProtocolsTable.id, invite.protocolId), isNull(handoverProtocolsTable.archivedAt)));
  return p ? { invite, p } : null;
}

router.post("/protocols/:protocolId/invites", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustManage(a, res)) return;
  if (a.p.rentalId) return bad(res, "Kirayə protokolunda tərəflər kirayə səhifəsindən dəvət olunur", 409);
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
  res.json(await dto({ p, me: { role: me.role, canEdit: me.canEdit }, isCreator: p.createdByUserId === userId, userId, rental: null }));
});

/* ------------------------------------------------------------------ versions and approvals */

router.post("/protocols/:protocolId/submit", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustManage(a, res)) return;
  const [last] = await db.select().from(protocolVersionsTable).where(eq(protocolVersionsTable.protocolId, a.p.id)).orderBy(desc(protocolVersionsTable.version)).limit(1);
  if (a.p.status === "awaiting" && last && last.revision === a.p.revision) return void res.json(await dto(a)); // repeated request
  if (!EDITABLE.includes(a.p.status)) return bad(res, "Bu protokol artıq təsdiq mərhələsindədir", 409);
  const snap = await snapshotOf(a.p, a.rental);
  if (!snap.rooms.length) return bad(res, "Ən azı bir otaq əlavə edin");
  if (a.rental) { if (!a.rental.landlordName.trim() || !a.rental.tenantName.trim()) return bad(res, "Ev sahibinin və kirayəçinin adını yazın"); }
  else if (!a.p.sellerName.trim() || !a.p.buyerName.trim()) return bad(res, "Satıcının və alıcının adını yazın");
  const version = (last?.version ?? 0) + 1;
  const contentHash = hashOf(snap);
  const photos = await photoHashes(snap);
  if (!photos) return bad(res, "Bəzi fotolar yaddaşda tapılmadı. Səhifəni yeniləyib yenidən cəhd edin", 409);
  const frozenAt = new Date();
  const { manifest, hash: manifestHash } = buildManifest({ protocolId: a.p.id, number: a.p.number, kind: a.p.kind, version, frozenAt: frozenAt.toISOString(), contentHash, content: snap as unknown as Record<string, unknown>, photos });
  const verifyCode = newToken().slice(0, 22);
  const moved = await db.update(handoverProtocolsTable).set({ status: "awaiting", currentVersion: version, updatedAt: new Date() })
    .where(and(eq(handoverProtocolsTable.id, a.p.id), eq(handoverProtocolsTable.revision, a.p.revision), inArray(handoverProtocolsTable.status, EDITABLE))).returning();
  if (!moved.length) return bad(res, "Protokol bu anda dəyişdi. Səhifəni yeniləyib təkrar göndərin", 409);
  await db.insert(protocolVersionsTable).values({ protocolId: a.p.id, version, revision: a.p.revision, snapshot: snap as unknown as Record<string, unknown>, contentHash, createdByUserId: a.userId, createdAt: frozenAt, manifest: manifest as unknown as Record<string, unknown>, manifestHash, verifyCode });
  await event(a.p.id, a.userId, "submitted", { version, contentHash, manifestHash });
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
  if (!decidersFor(a.p.kind).includes(a.me.role)) return bad(res, a.p.kind === "sale" ? "Təsdiqi yalnız satıcı və alıcı verir" : "Təsdiqi yalnız ev sahibi və kirayəçi verir", 403);
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
    authLevel: who.level, authDetail: who.detail, ip: (req.ip ?? "").slice(0, 64), userAgent: (req.get("user-agent") ?? "").slice(0, 300), manifestHash: v.manifestHash,
  }).onConflictDoNothing().returning();
  if (!inserted.length) return void res.json(await dto(a));
  await event(a.p.id, a.userId, b.data.decision === "approved" ? "approved" : "changes_requested", { version: v.version, role: a.me.role, method: who.level, manifestHash: v.manifestHash, comment: (b.data.comment ?? "").slice(0, 300) });
  let status = a.p.status;
  if (b.data.decision === "changes") status = "collecting";
  else {
    const all = await db.select().from(protocolApprovalsTable).where(and(eq(protocolApprovalsTable.protocolId, a.p.id), eq(protocolApprovalsTable.version, v.version), eq(protocolApprovalsTable.decision, "approved")));
    if (decidersFor(a.p.kind).every((r) => all.some((x) => x.role === r))) status = "approved";
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

/** Every photo a snapshot points to (incl. a move-out's move-in photos) with its server SHA-256; older photos are hashed now. Missing file → null. */
async function photoHashes(snap: ProtocolSnapshot): Promise<ManifestPhoto[] | null> {
  const ids = new Set<string>();
  const walk = (s: ProtocolSnapshot | null | undefined) => {
    if (!s) return;
    for (const r of s.rooms) { r.photos.forEach((i) => ids.add(i)); (r.items ?? []).forEach((it) => it.photos.forEach((i) => ids.add(i))); r.defects.forEach((d) => d.photos.forEach((i) => ids.add(i))); }
    s.meters.forEach((m) => m.photos.forEach((i) => ids.add(i))); s.keyPhotos.forEach((i) => ids.add(i)); (s.otherPhotos ?? []).forEach((i) => ids.add(i));
    walk(s.baseline ?? null);
  };
  walk(snap);
  if (!ids.size) return [];
  const rows = await db.select().from(protocolMediaTable).where(inArray(protocolMediaTable.id, [...ids]));
  const out: ManifestPhoto[] = [];
  for (const m of rows) {
    let h = m.sha256;
    if (!h) {
      const buf = await readObject(m.objectPath); if (!buf) return null;
      h = sha256(buf);
      await db.update(protocolMediaTable).set({ sha256: h }).where(and(eq(protocolMediaTable.id, m.id), eq(protocolMediaTable.sha256, "")));
    }
    out.push({ id: m.id, sha256: h, size: m.size, contentType: m.contentType, target: m.target, receivedAt: m.createdAt.toISOString() });
  }
  return rows.length === ids.size ? out : null;
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
  const final = decidersFor(a.p.kind).every((r) => approvals.some((x) => x.role === r && x.decision === "approved"));
  const snap = v.snapshot as unknown as ProtocolSnapshot;
  const media = await db.select().from(protocolMediaTable).where(inArray(protocolMediaTable.protocolId, [a.p.id, ...(a.p.baseProtocolId ? [a.p.baseProtocolId] : [])]));
  const byId = new Map(media.map((m) => [m.id, m]));
  const fin = v.manifestHash && final ? finalRecord(v.manifestHash, approvals.map((x) => ({ role: x.role, decision: x.decision, at: x.createdAt, method: x.authLevel, manifestHash: x.manifestHash }))) : null;
  const verify = v.manifestHash && v.verifyCode ? { url: `${publicOrigin(req)}/v/${v.verifyCode}`, manifestHash: v.manifestHash, finalHash: fin?.hash ?? "", photos: ((v.manifest as { photos?: unknown[] } | null)?.photos ?? []).length } : null;
  let pdf: Buffer;
  try {
    pdf = await renderProtocolPdf({
      snapshot: snap, version: v.version, contentHash: v.contentHash, createdAt: v.createdAt, protocolCreatedAt: a.p.createdAt, final, verify,
      approvals: approvals.map((x) => ({ role: x.role, decision: x.decision, at: x.createdAt, authLevel: x.authLevel, authDetail: x.authDetail, comment: x.comment })),
      captions: new Map(media.filter((m) => m.caption).map((m) => [m.id, m.caption])),
      times: new Map(media.map((m) => [m.id, { uploaded: m.createdAt, taken: m.takenAt }])),
      photo: async (id) => { const m = byId.get(id); return m && PHOTO_TYPES.includes(m.contentType) ? readObject(m.objectPath) : null; },
    });
  } catch (err) { req.log.error({ err }, "protocol pdf failed"); return bad(res, "PDF yaradılmadı. Yenidən cəhd edin", 500); }
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  const put = await fetch(uploadURL, { method: "PUT", body: new Uint8Array(pdf), headers: { "Content-Type": "application/pdf" } });
  if (!put.ok) { req.log.error({ status: put.status }, "protocol pdf upload failed"); return bad(res, "PDF saxlanılmadı. Yenidən cəhd edin", 502); }
  const pdfSha256 = sha256(pdf);
  await db.update(protocolVersionsTable).set({ pdfObjectPath: objectPath, pdfCreatedAt: new Date(), pdfSha256, ...(fin ? { finalHash: fin.hash } : {}) }).where(eq(protocolVersionsTable.id, v.id));
  let p = a.p;
  if (final && v.version === a.p.currentVersion && a.p.status === "approved") [p] = await db.update(handoverProtocolsTable).set({ status: "finalized", updatedAt: new Date() }).where(eq(handoverProtocolsTable.id, a.p.id)).returning();
  await event(a.p.id, a.userId, "pdf_created", { version: v.version, final, pdfSha256, finalHash: fin?.hash ?? "" });
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

/** A live rental invitation by its secret token. */
export async function liveRentalInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [invite] = await db.select().from(rentalInvitesTable).where(eq(rentalInvitesTable.tokenHash, hashToken(token)));
  if (!invite || invite.revokedAt || inviteExpired(invite.createdAt)) return null;
  const [rental] = await db.select().from(rentalsTable).where(and(eq(rentalsTable.id, invite.rentalId), isNull(rentalsTable.archivedAt)));
  return rental ? { invite, rental } : null;
}

/* ------------------------------------------------------------------ items */

async function ownItem(a: Access, itemId: unknown) {
  if (!isUuid(itemId)) return null;
  const [it] = await db.select().from(protocolItemsTable).where(and(eq(protocolItemsTable.id, itemId), eq(protocolItemsTable.protocolId, a.p.id)));
  return it ?? null;
}

router.post("/protocols/:protocolId/items", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const b = AddProtocolItemBody.safeParse(req.body);
  if (!b.success || !b.data.name?.trim() || !b.data.roomId) return bad(res, "Elementin adını yazın");
  const room = await ownRoom(a, b.data.roomId); if (!room) return bad(res, "Otaq tapılmadı", 404);
  const existing = await db.select({ position: protocolItemsTable.position }).from(protocolItemsTable).where(eq(protocolItemsTable.roomId, room.id));
  if (existing.length >= 60) return bad(res, "Bir otaqda ən çox 60 element ola bilər");
  await db.insert(protocolItemsTable).values({ protocolId: a.p.id, roomId: room.id, name: b.data.name.trim(), category: b.data.category ?? "other", quantity: Math.max(1, Math.min(999, b.data.quantity ?? 1)), condition: b.data.condition ?? null, note: b.data.note ?? "", change: a.p.kind === "move_out" ? b.data.change ?? null : null, position: Math.max(-1, ...existing.map((x) => x.position)) + 1 });
  await touch(a.p);
  res.status(201).json(await reload(a));
});

router.patch("/protocols/:protocolId/items/:itemId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const it = await ownItem(a, req.params.itemId); if (!it) return bad(res, "Element tapılmadı", 404);
  const b = UpdateProtocolItemBody.safeParse(req.body);
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const set: Partial<typeof protocolItemsTable.$inferInsert> = {};
  if (b.data.name !== undefined) set.name = b.data.name.trim() || it.name;
  if (b.data.category !== undefined) set.category = b.data.category;
  if (b.data.quantity !== undefined) set.quantity = Math.max(0, Math.min(999, b.data.quantity));
  if (b.data.condition !== undefined) set.condition = b.data.condition;
  if (b.data.note !== undefined) set.note = b.data.note;
  if (b.data.change !== undefined) {
    if (a.p.kind !== "move_out") return bad(res, "Dəyişiklik yalnız çıxış protokolunda qeyd olunur");
    set.change = b.data.change;
  }
  if (Object.keys(set).length) { await db.update(protocolItemsTable).set(set).where(eq(protocolItemsTable.id, it.id)); await touch(a.p); }
  res.json(await reload(a));
});

router.delete("/protocols/:protocolId/items/:itemId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a || !mustEdit(a, res)) return;
  const it = await ownItem(a, req.params.itemId); if (!it) return void res.json(await dto(a));
  if (it.prevItemId) return bad(res, "Girişdə qeyd olunmuş element silinmir — yoxdursa, “Çatışmır” seçin", 409);
  await db.update(protocolMediaTable).set({ deletedAt: new Date() }).where(eq(protocolMediaTable.itemId, it.id));
  await db.delete(protocolItemsTable).where(eq(protocolItemsTable.id, it.id));
  await touch(a.p);
  res.json(await reload(a));
});

export default router;

/* ------------------------------------------------------------------ public verification (QR in the PDF) */

const verifyLimit = rateLimit({ windowMs: 60_000, max: 20, key: (req) => `pv:${req.ip}` });

/**
 * Recomputes what can be recomputed and compares it with what was stored: the manifest hash, every photo's
 * SHA-256 against the stored file, the PDF file, the approvals record and the audit chain. Shows no names,
 * phones, address or photos. A match means "unchanged since frozen in Tehvil.az", nothing more.
 */
protocolPublicRouter.get("/verify/:token", verifyLimit, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const code = String(req.params.token);
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(code)) return bad(res, "Yoxlama kodu tapılmadı", 404);
  const [v] = await db.select().from(protocolVersionsTable).where(eq(protocolVersionsTable.verifyCode, code));
  if (!v) return bad(res, "Yoxlama kodu tapılmadı", 404);
  const [p] = await db.select().from(handoverProtocolsTable).where(eq(handoverProtocolsTable.id, v.protocolId));
  if (!p) return bad(res, "Yoxlama kodu tapılmadı", 404);
  const manifest = v.manifest as { contentHash?: string; photos?: ManifestPhoto[] } | null;
  const manifestOk = !!manifest && canonicalHash(manifest) === v.manifestHash && manifest.contentHash === v.contentHash;
  // Photos: the stored file is hashed again and compared with the manifest.
  const mp = manifest?.photos ?? [];
  const rows = mp.length ? await db.select().from(protocolMediaTable).where(inArray(protocolMediaTable.id, mp.map((x) => x.id))) : [];
  let okN = 0, changed = 0, missing = 0;
  for (const ph of mp) {
    const m = rows.find((r) => r.id === ph.id);
    const buf = m ? await readObject(m.objectPath) : null;
    if (!buf) missing++; else if (sha256(buf) === ph.sha256) okN++; else changed++;
  }
  const approvals = await db.select().from(protocolApprovalsTable).where(and(eq(protocolApprovalsTable.protocolId, p.id), eq(protocolApprovalsTable.version, v.version))).orderBy(asc(protocolApprovalsTable.createdAt));
  const deciders = decidersFor(p.kind);
  const allApproved = deciders.every((r) => approvals.some((x) => x.role === r && x.decision === "approved"));
  const fin = v.finalHash ? finalRecord(v.manifestHash, approvals.map((x) => ({ role: x.role, decision: x.decision, at: x.createdAt, method: x.authLevel, manifestHash: x.manifestHash }))) : null;
  let pdf: { exists: boolean; ok: boolean | null } = { exists: !!v.pdfObjectPath, ok: null };
  if (v.pdfObjectPath && v.pdfSha256) { const b = await readObject(v.pdfObjectPath); pdf = { exists: !!b, ok: b ? sha256(b) === v.pdfSha256 : false }; }
  const versions = await db.select({ version: protocolVersionsTable.version, createdAt: protocolVersionsTable.createdAt, manifestHash: protocolVersionsTable.manifestHash }).from(protocolVersionsTable).where(eq(protocolVersionsTable.protocolId, p.id)).orderBy(asc(protocolVersionsTable.version));
  const allApprovals = await db.select({ version: protocolApprovalsTable.version, role: protocolApprovalsTable.role, decision: protocolApprovalsTable.decision }).from(protocolApprovalsTable).where(eq(protocolApprovalsTable.protocolId, p.id));
  const events = await db.select().from(protocolEventsTable).where(eq(protocolEventsTable.protocolId, p.id)).orderBy(asc(protocolEventsTable.createdAt));
  const chain = verifyChain(p.id, events);
  const result = {
    protocol: { number: p.number, kind: p.kind, status: p.status, currentVersion: p.currentVersion },
    version: {
      version: v.version, frozenAt: v.createdAt.toISOString(), current: v.version === p.currentVersion,
      manifestHash: v.manifestHash, manifestOk, finalHash: v.finalHash || null, finalOk: fin ? fin.hash === v.finalHash : null, pdf,
    },
    photos: { total: mp.length, ok: okN, changed, missing },
    approvals: deciders.map((role) => { const a = approvals.find((x) => x.role === role); return { role, decision: a?.decision ?? null, at: a?.createdAt.toISOString() ?? null, method: a?.authLevel ?? null, sameManifest: a ? a.manifestHash === v.manifestHash : null }; }),
    allApproved,
    history: versions.map((x) => ({ version: x.version, frozenAt: x.createdAt.toISOString(), hasManifest: !!x.manifestHash, approvedBy: allApprovals.filter((y) => y.version === x.version && y.decision === "approved").map((y) => y.role) })),
    audit: { events: events.length, checked: chain.checked, legacy: chain.legacy, ok: chain.ok, lastAt: events.at(-1)?.createdAt.toISOString() ?? null },
    trust: trustServices(),
    checkedAt: new Date().toISOString(),
  };
  res.json({ result });
});

/** Protocols of a home history, for people who can see the home and take part in the protocol. */
router.get("/homes/:homeId/protocols", async (req, res): Promise<void> => {
  const userId = uid(req);
  const ha = await getHomeAccess(userId, String(req.params.homeId));
  if (!ha) return bad(res, "Ev tapılmadı", 404);
  const rows = await db.select({ p: handoverProtocolsTable, role: protocolParticipantsTable.role }).from(protocolParticipantsTable)
    .innerJoin(handoverProtocolsTable, eq(handoverProtocolsTable.id, protocolParticipantsTable.protocolId))
    .where(and(eq(protocolParticipantsTable.userId, userId), eq(handoverProtocolsTable.homeId, ha.home.id), isNull(handoverProtocolsTable.archivedAt))).orderBy(desc(handoverProtocolsTable.updatedAt));
  res.json(rows.map(({ p, role }) => ({ id: p.id, number: p.number, address: p.address, status: p.status, myRole: role, handoverDate: p.handoverDate, updatedAt: p.updatedAt.toISOString(), rooms: 0, photos: 0,
    stage: stageOf(p, { invited: false, joined: false, approvedNow: 0, hasMedia: false }), decisions: [] })));
});
