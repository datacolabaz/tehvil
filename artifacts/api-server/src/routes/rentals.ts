import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { CreateRentalBody, CreateRentalInviteBody, UpdateRentalBody } from "@workspace/api-zod";
import {
  db, handoverProtocolsTable, protocolApprovalsTable, protocolVersionsTable, rentalInvitesTable, rentalParticipantsTable, rentalsTable,
  type RentalRow,
} from "@workspace/db";
import { hashToken, newToken, publicOrigin } from "../lib/realtorCore";
import { bad, createRentalProtocol, decidersFor, detail, event, isUuid, liveRentalInvite, newNumber, openLimit, snapshotOf } from "./protocols";
import type { ProtocolSnapshot } from "../lib/protocolPdf";

/** Rental invitation pages work without sign-in. */
export const rentalPublicRouter: IRouter = Router();
const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
const ROLE_AZ: Record<string, string> = { landlord: "ev sahibi", tenant: "kirayəçi", realtor: "rieltor" };

async function access(req: Request, rentalId: unknown) {
  if (!isUuid(rentalId)) return null;
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const [rental] = await db.select().from(rentalsTable).where(and(eq(rentalsTable.id, rentalId), isNull(rentalsTable.archivedAt)));
  if (!rental) return null;
  const [me] = await db.select().from(rentalParticipantsTable).where(and(eq(rentalParticipantsTable.rentalId, rental.id), eq(rentalParticipantsTable.userId, userId)));
  if (!me) return null;
  return { rental, me, userId, isCreator: rental.createdByUserId === userId };
}
type Access = NonNullable<Awaited<ReturnType<typeof access>>>;
async function load(req: Request, res: Response) { const a = await access(req, req.params.rentalId); if (!a) { bad(res, "Kirayə qeydi tapılmadı", 404); return null; } return a; }

async function protocolsOf(rentalId: string) {
  const ps = await db.select().from(handoverProtocolsTable).where(and(eq(handoverProtocolsTable.rentalId, rentalId), isNull(handoverProtocolsTable.archivedAt))).orderBy(handoverProtocolsTable.createdAt);
  const ids = ps.map((p) => p.id);
  const approvals = ids.length ? await db.select().from(protocolApprovalsTable).where(inArray(protocolApprovalsTable.protocolId, ids)) : [];
  const versions = ids.length ? await db.select().from(protocolVersionsTable).where(inArray(protocolVersionsTable.protocolId, ids)) : [];
  return ps.map((p) => ({
    id: p.id, number: p.number, kind: p.kind, status: p.status, currentVersion: p.currentVersion, handoverDate: p.handoverDate, updatedAt: p.updatedAt.toISOString(),
    baseVersion: p.baseVersion,
    decisions: decidersFor(p.kind).map((role) => { const a = approvals.find((x) => x.protocolId === p.id && x.version === p.currentVersion && x.role === role); return { role, decision: a?.decision ?? null, at: a?.createdAt.toISOString() ?? null }; }),
    hasPdf: versions.some((v) => v.protocolId === p.id && v.version === p.currentVersion && !!v.pdfObjectPath),
  }));
}

async function rentalDto(rental: RentalRow, viewer: { userId: string | null; role: string | null; isCreator: boolean; canEdit: boolean }) {
  const parts = await db.select().from(rentalParticipantsTable).where(eq(rentalParticipantsTable.rentalId, rental.id));
  const invites = viewer.isCreator ? await db.select().from(rentalInvitesTable).where(and(eq(rentalInvitesTable.rentalId, rental.id), isNull(rentalInvitesTable.revokedAt))) : [];
  const mask = (phone: string) => (viewer.userId && viewer.role ? phone : phone.replace(/\d(?=\d{2})/g, "•"));
  return {
    rental: {
      id: rental.id, number: rental.number, address: rental.address, propertyType: rental.propertyType,
      landlordName: rental.landlordName, landlordPhone: mask(rental.landlordPhone), tenantName: rental.tenantName, tenantPhone: mask(rental.tenantPhone),
      realtorName: rental.realtorName, realtorPhone: mask(rental.realtorPhone), startDate: rental.startDate, endDate: rental.endDate,
      monthlyRent: rental.monthlyRent, deposit: rental.deposit, currency: rental.currency, notes: viewer.role ? rental.notes : "", createdAt: rental.createdAt.toISOString(), updatedAt: rental.updatedAt.toISOString(),
    },
    participants: parts.map((x) => ({ role: x.role, canEdit: x.canEdit, joinedAt: x.joinedAt.toISOString(), isMe: x.userId === viewer.userId, isCreator: x.userId === rental.createdByUserId })),
    invites: invites.map((i) => ({ id: i.id, role: i.role, canEdit: i.canEdit, createdAt: i.createdAt.toISOString(), used: !!i.usedAt, lastOpenedAt: i.lastOpenedAt?.toISOString() ?? null })),
    protocols: await protocolsOf(rental.id),
    me: { role: viewer.role, isCreator: viewer.isCreator, canEdit: viewer.canEdit },
  };
}
const dto = (a: Access) => rentalDto(a.rental, { userId: a.userId, role: a.me.role, isCreator: a.isCreator, canEdit: a.me.canEdit });

router.get("/rentals", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const mine = await db.select({ r: rentalsTable, role: rentalParticipantsTable.role }).from(rentalParticipantsTable)
    .innerJoin(rentalsTable, eq(rentalsTable.id, rentalParticipantsTable.rentalId))
    .where(and(eq(rentalParticipantsTable.userId, uid(req)), isNull(rentalsTable.archivedAt))).orderBy(desc(rentalsTable.updatedAt)).limit(500);
  const ids = mine.map((m) => m.r.id);
  const ps = ids.length ? await db.select({ rentalId: handoverProtocolsTable.rentalId, kind: handoverProtocolsTable.kind, status: handoverProtocolsTable.status, updatedAt: handoverProtocolsTable.updatedAt }).from(handoverProtocolsTable).where(and(inArray(handoverProtocolsTable.rentalId, ids), isNull(handoverProtocolsTable.archivedAt))) : [];
  res.json(mine.map(({ r, role }) => {
    const pf = ps.filter((p) => p.rentalId === r.id);
    const last = [r.updatedAt, ...pf.map((p) => p.updatedAt)].sort((x, y) => y.getTime() - x.getTime())[0];
    return { id: r.id, number: r.number, address: r.address, myRole: role, startDate: r.startDate, endDate: r.endDate, moveIn: pf.find((p) => p.kind === "move_in")?.status ?? null, moveOut: pf.find((p) => p.kind === "move_out")?.status ?? null, updatedAt: last.toISOString() };
  }));
});

router.post("/rentals", async (req, res): Promise<void> => {
  const b = CreateRentalBody.safeParse(req.body);
  if (!b.success) return bad(res, "Ünvanı və rolunuzu yoxlayın");
  const d = b.data, userId = uid(req);
  if (d.startDate && d.endDate && d.endDate < d.startDate) return bad(res, "Bitmə tarixi başlama tarixindən əvvəl ola bilməz");
  const money = (n: number | null | undefined) => (n == null ? null : Math.max(0, Math.min(10_000_000, Math.round(n))));
  const [rental] = await db.insert(rentalsTable).values({
    number: await newNumber("KR", "rentals"), createdByUserId: userId, address: d.address.trim(), propertyType: d.propertyType ?? "apartment",
    landlordName: d.landlordName?.trim() ?? "", landlordPhone: d.landlordPhone?.trim() ?? "", tenantName: d.tenantName?.trim() ?? "", tenantPhone: d.tenantPhone?.trim() ?? "",
    realtorName: d.realtorName?.trim() ?? "", realtorPhone: d.realtorPhone?.trim() ?? "", startDate: d.startDate ?? null, endDate: d.endDate ?? null,
    monthlyRent: money(d.monthlyRent), deposit: money(d.deposit), currency: d.currency ?? "AZN",
  }).returning();
  const [me] = await db.insert(rentalParticipantsTable).values({ rentalId: rental.id, userId, role: d.role, canEdit: true }).returning();
  await createRentalProtocol(rental, userId, d.role, "move_in");
  res.status(201).json(await dto({ rental, me, userId, isCreator: true }));
});

router.get("/rentals/:rentalId", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const a = await load(req, res); if (!a) return;
  res.json(await dto(a));
});

router.patch("/rentals/:rentalId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a) return;
  if (!a.me.canEdit) return bad(res, "Kirayə məlumatlarını dəyişmək icazəniz yoxdur", 403);
  const b = UpdateRentalBody.safeParse(req.body);
  if (!b.success) return bad(res, "Məlumatları yoxlayın");
  const d = b.data;
  const start = d.startDate !== undefined ? d.startDate : a.rental.startDate, end = d.endDate !== undefined ? d.endDate : a.rental.endDate;
  if (start && end && end < start) return bad(res, "Bitmə tarixi başlama tarixindən əvvəl ola bilməz");
  // Parties and dates are part of what is approved: they cannot change while a protocol waits for approval.
  const waiting = (await protocolsOf(a.rental.id)).some((p) => p.status === "awaiting");
  const set: Partial<typeof rentalsTable.$inferInsert> = {};
  for (const k of ["propertyType", "address", "landlordName", "landlordPhone", "tenantName", "tenantPhone", "realtorName", "realtorPhone", "startDate", "endDate", "monthlyRent", "deposit", "currency", "notes"] as const) {
    if (d[k] !== undefined) (set as Record<string, unknown>)[k] = typeof d[k] === "string" ? (d[k] as string).trim() : d[k];
  }
  if (!Object.keys(set).length) return void res.json(await dto(a));
  if (waiting && Object.keys(set).some((k) => k !== "notes")) return bad(res, "Protokol təsdiq gözləyir — tərəfləri və tarixləri dəyişmək üçün əvvəlcə redaktəni yenidən açın", 409);
  set.updatedAt = new Date();
  const [rental] = await db.update(rentalsTable).set(set).where(eq(rentalsTable.id, a.rental.id)).returning();
  res.json(await dto({ ...a, rental }));
});

router.delete("/rentals/:rentalId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a) return;
  if (!a.isCreator) return bad(res, "Bunu yalnız kirayə qeydini yaradan edə bilər", 403);
  const ps = await protocolsOf(a.rental.id);
  if (ps.some((p) => ["approved", "finalized"].includes(p.status))) return bad(res, "Təsdiqlənmiş protokolu olan kirayə qeydi silinmir — tarixçə qorunur", 409);
  await db.update(rentalsTable).set({ archivedAt: new Date() }).where(eq(rentalsTable.id, a.rental.id));
  res.json({ success: true });
});

router.post("/rentals/:rentalId/invites", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a) return;
  if (!a.isCreator) return bad(res, "Dəvəti yalnız kirayə qeydini yaradan göndərə bilər", 403);
  const b = CreateRentalInviteBody.safeParse(req.body);
  if (!b.success) return bad(res, "Rolu seçin");
  const [taken] = await db.select().from(rentalParticipantsTable).where(and(eq(rentalParticipantsTable.rentalId, a.rental.id), eq(rentalParticipantsTable.role, b.data.role)));
  if (taken) return bad(res, "Bu rolda artıq iştirakçı var", 409);
  await db.update(rentalInvitesTable).set({ revokedAt: new Date() }).where(and(eq(rentalInvitesTable.rentalId, a.rental.id), eq(rentalInvitesTable.role, b.data.role), isNull(rentalInvitesTable.revokedAt)));
  const token = newToken();
  const [inv] = await db.insert(rentalInvitesTable).values({ rentalId: a.rental.id, role: b.data.role, canEdit: b.data.canEdit ?? false, tokenHash: hashToken(token), createdByUserId: a.userId }).returning();
  res.status(201).json({ id: inv.id, role: inv.role, url: `${publicOrigin(req)}/k/${token}` });
});

router.delete("/rentals/:rentalId/invites/:inviteId", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a) return;
  if (!a.isCreator) return bad(res, "Bunu yalnız kirayə qeydini yaradan edə bilər", 403);
  if (!isUuid(req.params.inviteId)) return bad(res, "Link tapılmadı", 404);
  await db.update(rentalInvitesTable).set({ revokedAt: new Date() }).where(and(eq(rentalInvitesTable.id, req.params.inviteId), eq(rentalInvitesTable.rentalId, a.rental.id), isNull(rentalInvitesTable.revokedAt)));
  res.json({ success: true });
});

/** Move-out starts from the move-in protocol: its last sent version if there is one, otherwise its current content. */
router.post("/rentals/:rentalId/move-out", async (req, res): Promise<void> => {
  const a = await load(req, res); if (!a) return;
  if (!a.me.canEdit) return bad(res, "Çıxış protokolunu başlatmaq icazəniz yoxdur", 403);
  const ps = await db.select().from(handoverProtocolsTable).where(and(eq(handoverProtocolsTable.rentalId, a.rental.id), isNull(handoverProtocolsTable.archivedAt)));
  if (ps.some((p) => p.kind === "move_out")) return void res.json(await dto(a)); // already started: repeated request
  const moveIn = ps.find((p) => p.kind === "move_in");
  if (!moveIn) return bad(res, "Əvvəlcə giriş protokolu lazımdır", 409);
  let snapshot: ProtocolSnapshot, version: number | null = null;
  if (moveIn.currentVersion > 0) {
    const [v] = await db.select().from(protocolVersionsTable).where(and(eq(protocolVersionsTable.protocolId, moveIn.id), eq(protocolVersionsTable.version, moveIn.currentVersion)));
    snapshot = v.snapshot as unknown as ProtocolSnapshot; version = v.version;
  } else snapshot = await snapshotOf(moveIn, a.rental);
  const p = await createRentalProtocol(a.rental, a.userId, a.me.role, "move_out", { protocol: moveIn, version, snapshot });
  await event(p.id, a.userId, "move_out_started", { fromVersion: version, moveInStatus: moveIn.status });
  res.json(await dto(a));
});

rentalPublicRouter.get("/rental-invites/:token", openLimit, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const token = String(req.params.token);
  const inv = await liveRentalInvite(token);
  if (!inv) return bad(res, "Link etibarsızdır və ya ləğv edilib", 404);
  await db.update(rentalInvitesTable).set({ lastOpenedAt: new Date() }).where(eq(rentalInvitesTable.id, inv.invite.id));
  const userId = getAuth(req).userId;
  const [me] = userId ? await db.select().from(rentalParticipantsTable).where(and(eq(rentalParticipantsTable.rentalId, inv.rental.id), eq(rentalParticipantsTable.userId, userId))) : [];
  const base = await rentalDto(inv.rental, { userId: me ? userId! : null, role: me?.role ?? null, isCreator: false, canEdit: false });
  // Show the latest protocol read-only, photos through this link.
  const [latest] = await db.select().from(handoverProtocolsTable).where(and(eq(handoverProtocolsTable.rentalId, inv.rental.id), isNull(handoverProtocolsTable.archivedAt))).orderBy(desc(handoverProtocolsTable.createdAt)).limit(1);
  const protocol = latest ? await detail(latest, { userId: me ? userId! : null, isCreator: false, role: me?.role ?? null, canEdit: false, token, tokenParam: "k" }, inv.rental) : null;
  res.json({ role: inv.invite.role, canEdit: inv.invite.canEdit, used: !!inv.invite.usedAt, usedByMe: !!userId && inv.invite.usedByUserId === userId, rentalId: inv.rental.id,
    detail: { ...base, invites: [], protocol: protocol ? { ...protocol, events: [], invites: [] } : null } });
});

rentalPublicRouter.post("/rental-invites/:token/accept", openLimit, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) return bad(res, "Davam etmək üçün daxil olun", 401);
  const inv = await liveRentalInvite(String(req.params.token));
  if (!inv) return bad(res, "Link etibarsızdır və ya ləğv edilib", 404);
  const { invite, rental } = inv;
  if (invite.usedByUserId && invite.usedByUserId !== userId) return bad(res, "Bu link artıq başqa hesabla istifadə olunub. Yeni link istəyin", 409);
  const parts = await db.select().from(rentalParticipantsTable).where(eq(rentalParticipantsTable.rentalId, rental.id));
  const mine = parts.find((x) => x.userId === userId);
  if (mine && mine.role !== invite.role) return bad(res, `Siz bu kirayədə artıq “${ROLE_AZ[mine.role] ?? mine.role}” kimi iştirak edirsiniz`, 409);
  const holder = parts.find((x) => x.role === invite.role);
  if (holder && holder.userId !== userId) return bad(res, "Bu rolda artıq iştirakçı var", 409);
  if (!mine) {
    await db.insert(rentalParticipantsTable).values({ rentalId: rental.id, userId, role: invite.role, canEdit: invite.canEdit }).onConflictDoNothing();
    await db.update(rentalInvitesTable).set({ usedByUserId: userId, usedAt: new Date() }).where(eq(rentalInvitesTable.id, invite.id));
    const ps = await db.select({ id: handoverProtocolsTable.id }).from(handoverProtocolsTable).where(eq(handoverProtocolsTable.rentalId, rental.id));
    for (const p of ps) await event(p.id, userId, "joined", { role: invite.role, canEdit: invite.canEdit });
  }
  const [me] = await db.select().from(rentalParticipantsTable).where(and(eq(rentalParticipantsTable.rentalId, rental.id), eq(rentalParticipantsTable.userId, userId)));
  if (!me) return bad(res, "Qoşulmaq alınmadı. Yenidən cəhd edin", 409);
  res.json(await rentalDto(rental, { userId, role: me.role, isCreator: rental.createdByUserId === userId, canEdit: me.canEdit }));
});

/* ------------------------------------------------------------------ admin statistics */

const adminIds = () => [...(process.env.TEHVIL_ADMIN_USER_IDS ?? ""), ",", ...(process.env.PRICE_ADMIN_USER_IDS ?? "")].join("").split(",").map((s) => s.trim()).filter(Boolean);
const adminEmails = () => `${process.env.TEHVIL_ADMIN_EMAILS ?? ""},${process.env.PRICE_ADMIN_EMAILS ?? ""}`.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
async function isAdmin(userId: string) {
  if (adminIds().includes(userId)) return true;
  const wanted = adminEmails(); if (!wanted.length) return false;
  try { const u = await clerkClient.users.getUser(userId); return u.emailAddresses.some((e) => e.verification?.status === "verified" && wanted.includes(e.emailAddress.toLowerCase())); }
  catch { return false; }
}

router.get("/admin/rental-stats", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await isAdmin(uid(req)))) return bad(res, "Bu səhifə yalnız inzibatçılar üçündür", 403);
  const n = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)).rows[0] as { n: unknown } | undefined)?.n ?? 0);
  const stats = {
    rentals: await n(sql`select count(*)::int n from rentals where archived_at is null`),
    rentals30d: await n(sql`select count(*)::int n from rentals where archived_at is null and created_at > now() - interval '30 days'`),
    moveInSent: await n(sql`select count(distinct protocol_id)::int n from protocol_versions v join handover_protocols p on p.id = v.protocol_id where p.kind = 'move_in'`),
    moveInDone: await n(sql`select count(*)::int n from handover_protocols where kind = 'move_in' and status in ('approved','finalized') and archived_at is null`),
    moveOutStarted: await n(sql`select count(*)::int n from handover_protocols where kind = 'move_out' and archived_at is null`),
    moveOutDone: await n(sql`select count(*)::int n from handover_protocols where kind = 'move_out' and status in ('approved','finalized') and archived_at is null`),
    reports: await n(sql`select count(*)::int n from protocol_versions v join handover_protocols p on p.id = v.protocol_id where p.kind in ('move_in','move_out') and v.pdf_object_path is not null`),
    photos: await n(sql`select count(*)::int n from protocol_media m join handover_protocols p on p.id = m.protocol_id where p.kind in ('move_in','move_out') and m.deleted_at is null`),
    users: await n(sql`select count(distinct user_id)::int n from rental_participants`),
    // Returning: people who acted on rental protocols on at least two different days, or take part in two or more rentals.
    returning: await n(sql`select count(*)::int n from (select user_id from protocol_events e join handover_protocols p on p.id = e.protocol_id where p.kind in ('move_in','move_out') and e.user_id is not null group by user_id having count(distinct date(e.created_at at time zone 'Asia/Baku')) >= 2 union select user_id from rental_participants group by user_id having count(*) >= 2) t`),
    multiRentalOwners: await n(sql`select count(*)::int n from (select user_id from rental_participants where role = 'landlord' group by user_id having count(*) >= 2) t`),
    weekly: (await db.execute(sql`select to_char(date_trunc('week', created_at at time zone 'Asia/Baku'), 'YYYY-MM-DD') wk, count(*)::int n from rentals where created_at > now() - interval '12 weeks' group by 1 order by 1`)).rows,
    generatedAt: new Date().toISOString(),
  };
  res.json({ stats });
});

export default router;
