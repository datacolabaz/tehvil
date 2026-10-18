import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ArchiveHomeParams,
  CreateEquipmentBody,
  CreateEquipmentParams,
  CreateHomeBody,
  CreateHomeInvitationBody,
  CreateHomeInvitationParams,
  CreateHomeRoomBody,
  CreateHomeRoomParams,
  CreateHomeShareBody,
  CreateHomeShareParams,
  CreateInfrastructureBody,
  CreateInfrastructureParams,
  CreateWorkBody,
  CreateWorkParams,
  DeleteEquipmentParams,
  DeleteHomeRoomParams,
  DeleteInfrastructureParams,
  GetHomeOverviewParams,
  GetHomeRoomParams,
  GetHomeSharingParams,
  ListEquipmentParams,
  ListHomeAuditParams,
  ListHomeMediaParams,
  ListHomeMembersParams,
  ListHomePerformersParams,
  ListInfrastructureParams,
  ListWorksParams,
  RemoveHomeMemberParams,
  RevokeHomeShareParams,
  UpdateEquipmentBody,
  UpdateEquipmentParams,
  UpdateHomeBody,
  UpdateHomeParams,
  UpdateHomeRoomBody,
  UpdateHomeRoomParams,
  UpdateHomeSharingBody,
  UpdateHomeSharingParams,
  UpdateInfrastructureBody,
  UpdateInfrastructureParams,
  VerifyInfrastructureParams,
} from "@workspace/api-zod";
import {
  db,
  equipmentTable,
  homeAuditTable,
  homeInvitationsTable,
  homeMediaTable,
  homeMembersTable,
  homeRoomsTable,
  homeSharesTable,
  homesTable,
  infrastructureItemsTable,
  smetaProjectsTable,
  workApprovalsTable,
  workParticipantsTable,
  workRecordsTable,
  type ShareScopeJson,
} from "@workspace/db";
import {
  audit,
  diff,
  getHomeAccess,
  homePermissions,
  homesOfUser,
  loadActor,
  visibleWorks,
  type HomeAccess,
  type WorkRow,
} from "../lib/homeAccess";
import {
  equipmentDtos,
  homeDto,
  homePerformers,
  infraDtos,
  mediaDto,
  performerHomeDto,
  roomDtos,
  workDetail,
  workSummaries,
  homeMediaUrl,
} from "../lib/homeDtos";
import { getWorkAccess } from "../lib/homeAccess";
import { hashToken, newPublicId, newToken, publicOrigin } from "../lib/realtorCore";

const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
export const bad = (res: Response, error = "Sorğu düzgün deyil") => { res.status(400).json({ error }); };
export const notFound = (res: Response, error = "Tapılmadı") => { res.status(404).json({ error }); };
export const forbidden = (res: Response, error = "Bu əməliyyat üçün icazəniz yoxdur") => { res.status(403).json({ error }); };
export const noStore = (res: Response) => res.setHeader("Cache-Control", "private, no-store");
const INVITE_DAYS = 14;

const intIn = (v: number | null | undefined, lo: number, hi: number) => v == null ? null : Math.min(hi, Math.max(lo, Math.round(v)));

async function access(req: Request, res: Response, homeId: string): Promise<HomeAccess | null> {
  const a = await getHomeAccess(uid(req), homeId);
  if (!a) { notFound(res, "Ev tapılmadı"); return null; }
  return a;
}

async function homeMediaIn(homeId: string, mediaId: string | null | undefined, imageOnly = true) {
  if (!mediaId) return null;
  const [m] = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.id, mediaId), eq(homeMediaTable.homeId, homeId), isNull(homeMediaTable.deletedAt)));
  if (!m || (imageOnly && !m.contentType.startsWith("image/"))) return undefined;
  return m.id;
}
async function roomIn(homeId: string, roomId: string | null | undefined) {
  if (!roomId) return null;
  const [r] = await db.select({ id: homeRoomsTable.id }).from(homeRoomsTable).where(and(eq(homeRoomsTable.id, roomId), eq(homeRoomsTable.homeId, homeId)));
  return r ? r.id : undefined;
}
async function workIn(homeId: string, workId: string | null | undefined) {
  if (!workId) return null;
  const [w] = await db.select({ id: workRecordsTable.id }).from(workRecordsTable).where(and(eq(workRecordsTable.id, workId), eq(workRecordsTable.homeId, homeId)));
  return w ? w.id : undefined;
}
async function equipmentIn(homeId: string, equipmentId: string | null | undefined) {
  if (!equipmentId) return null;
  const [e] = await db.select({ id: equipmentTable.id }).from(equipmentTable).where(and(eq(equipmentTable.id, equipmentId), eq(equipmentTable.homeId, homeId)));
  return e ? e.id : undefined;
}

/* ------------------------------------------------------------------ overview */

export async function homeOverview(a: HomeAccess, userId: string) {
  const perms = homePermissions(a);
  const member = !!a.memberRole;
  const works = await visibleWorks(a);
  const workIds = new Set(works.map((w) => w.id));
  const allRooms = await db.select().from(homeRoomsTable).where(eq(homeRoomsTable.homeId, a.home.id)).orderBy(homeRoomsTable.position, homeRoomsTable.createdAt);
  const rooms = member ? allRooms : allRooms.filter((r) => works.some((w) => w.roomId === r.id));
  const [equipment, infra, media] = await Promise.all([
    db.select({ id: equipmentTable.id, installWorkId: equipmentTable.installWorkId, createdByUserId: equipmentTable.createdByUserId }).from(equipmentTable).where(eq(equipmentTable.homeId, a.home.id)),
    db.select({ id: infrastructureItemsTable.id, workId: infrastructureItemsTable.workId, createdByUserId: infrastructureItemsTable.createdByUserId }).from(infrastructureItemsTable).where(eq(infrastructureItemsTable.homeId, a.home.id)),
    db.select({ id: homeMediaTable.id, workId: homeMediaTable.workId }).from(homeMediaTable).where(and(eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt))),
  ]);
  const mine = (row: { workId?: string | null; installWorkId?: string | null; createdByUserId?: string }) =>
    member || (row.workId && workIds.has(row.workId)) || (row.installWorkId && workIds.has(row.installWorkId)) || row.createdByUserId === userId;
  const summaries = await workSummaries(works);
  const performers = await homePerformers(a.home.id, userId, member ? undefined : workIds, a.memberRole === "owner" || a.memberRole === "technician");
  return {
    home: member ? homeDto(a.home, a, perms) : performerHomeDto(a.home, perms),
    rooms: await roomDtos(a.home.id, rooms, workIds),
    stats: {
      works: works.length,
      completed: works.filter((w) => w.status === "completed").length,
      confirmed: works.filter((w) => w.status === "confirmed").length,
      pendingApproval: works.filter((w) => w.status === "completed").length,
      equipment: equipment.filter(mine).length,
      infrastructure: infra.filter(mine).length,
      performers: performers.length,
      media: media.filter((m) => member || (m.workId && workIds.has(m.workId))).length,
      openDefects: summaries.reduce((s, w) => s + w.openDefects, 0),
    },
    recentWorks: summaries.slice(0, 6),
    performers,
  };
}

/* --------------------------------------------------------------------- homes */

router.get("/homes", async (req, res): Promise<void> => {
  noStore(res);
  const userId = uid(req);
  const actor = await loadActor(userId);
  const memberHomes = await homesOfUser(userId);
  const performerRows = actor.actingIds.length
    ? await db.selectDistinct({ home: homesTable }).from(workParticipantsTable)
      .innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
      .innerJoin(homesTable, eq(homesTable.id, workRecordsTable.homeId))
      .where(and(inArray(workParticipantsTable.workerId, actor.actingIds), eq(workParticipantsTable.status, "accepted"), isNull(homesTable.archivedAt)))
    : [];
  const list = [...memberHomes.map((h) => ({ home: h.home, role: h.role })),
    ...performerRows.filter((p) => !memberHomes.some((m) => m.home.id === p.home.id)).map((p) => ({ home: p.home, role: "performer" }))];
  const out = [];
  for (const { home, role } of list) {
    const a = await getHomeAccess(userId, home.id, actor);
    if (!a) continue;
    const works = await visibleWorks(a);
    const performerCount = await db.select({ n: sql<number>`count(distinct ${workParticipantsTable.workerId})::int` }).from(workParticipantsTable)
      .where(and(inArray(workParticipantsTable.workId, works.length ? works.map((w) => w.id) : ["00000000-0000-0000-0000-000000000000"]), inArray(workParticipantsTable.status, ["accepted", "recorded"])));
    const last = works.map((w) => w.endDate ?? w.startDate).filter(Boolean).sort().pop() ?? null;
    out.push({
      id: home.id, publicId: home.publicId, name: home.name, propertyType: home.propertyType, city: home.city, district: home.district, stage: home.stage,
      coverUrl: home.coverMediaId ? homeMediaUrl(home.coverMediaId) : null, myRole: role, areaM2: home.areaM2, roomCount: home.roomCount,
      works: works.length, pendingApproval: role === "owner" ? works.filter((w) => w.status === "completed").length : 0,
      performers: performerCount[0]?.n ?? 0, lastWorkAt: last, updatedAt: home.updatedAt.toISOString(),
    });
  }
  out.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  res.json(out);
});

function homeValues(d: ReturnType<typeof CreateHomeBody.parse>) {
  return {
    name: d.name.trim(), propertyType: d.propertyType, city: (d.city ?? "").trim(), district: (d.district ?? "").trim(), address: (d.address ?? "").trim(),
    areaM2: intIn(d.areaM2, 1, 100_000), roomCount: intIn(d.roomCount, 0, 200), floor: (d.floor ?? "").trim(), builtYear: intIn(d.builtYear, 1800, 2100),
    stage: d.stage ?? "living", notes: (d.notes ?? "").trim(),
  };
}

router.post("/homes", async (req, res): Promise<void> => {
  const body = CreateHomeBody.safeParse(req.body);
  if (!body.success) return bad(res, "Evin adını və növünü yoxlayın");
  const userId = uid(req);
  const home = await db.transaction(async (tx) => {
    let row;
    for (let i = 0; i < 5 && !row; i++) {
      [row] = await tx.insert(homesTable).values({ ...homeValues(body.data), publicId: newPublicId(10), createdByUserId: userId })
        .onConflictDoNothing({ target: homesTable.publicId }).returning();
    }
    if (!row) throw new Error("Could not allocate a public id");
    await tx.insert(homeMembersTable).values({ homeId: row.id, userId, role: "owner", addedByUserId: userId });
    await audit({ homeId: row.id, actorUserId: userId, actorRole: "owner", action: "home.created", entityType: "home", entityId: row.id, summary: row.name }, tx);
    return row;
  });
  const a = await getHomeAccess(userId, home.id);
  res.status(201).json(await homeOverview(a!, userId));
});

router.get("/homes/:homeId", async (req, res): Promise<void> => {
  noStore(res);
  const p = GetHomeOverviewParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  res.json(await homeOverview(a, uid(req)));
});

router.patch("/homes/:homeId", async (req, res): Promise<void> => {
  const p = UpdateHomeParams.safeParse(req.params);
  const body = UpdateHomeBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  if (!body.success) return bad(res, "Ev məlumatlarını yoxlayın");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).edit) return forbidden(res);
  const values: Record<string, unknown> = homeValues(body.data);
  if (body.data.coverMediaId !== undefined) {
    const cover = await homeMediaIn(a.home.id, body.data.coverMediaId);
    if (cover === undefined) return bad(res, "Örtük şəkli bu evə aid deyil");
    values.coverMediaId = cover;
  }
  const changes = diff(a.home as unknown as Record<string, unknown>, values, Object.keys(values));
  await db.update(homesTable).set({ ...values, updatedAt: new Date() }).where(eq(homesTable.id, a.home.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "home.updated", entityType: "home", entityId: a.home.id, summary: "Ev profili yeniləndi", changes });
  res.json(await homeOverview((await getHomeAccess(uid(req), a.home.id))!, uid(req)));
});

router.delete("/homes/:homeId", async (req, res): Promise<void> => {
  const p = ArchiveHomeParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (a.memberRole !== "owner") return forbidden(res);
  await db.update(homesTable).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(homesTable.id, a.home.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "home.archived", entityType: "home", entityId: a.home.id, summary: a.home.name });
  res.json({ success: true });
});

/* --------------------------------------------------------------------- rooms */

function roomValues(d: ReturnType<typeof CreateHomeRoomBody.parse>) {
  return {
    name: d.name.trim(), kind: d.kind ?? "other", floor: (d.floor ?? "").trim(), areaM2: intIn(d.areaM2, 1, 10_000),
    condition: d.condition ?? "unknown", notes: (d.notes ?? "").trim(), ...(d.position !== undefined ? { position: intIn(d.position, 0, 1000)! } : {}),
  };
}

router.post("/homes/:homeId/rooms", async (req, res): Promise<void> => {
  const p = CreateHomeRoomParams.safeParse(req.params);
  const body = CreateHomeRoomBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  if (!body.success) return bad(res, "Otağın adını yoxlayın");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).edit) return forbidden(res);
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${homeRoomsTable.position}), -1)::int + 1` }).from(homeRoomsTable).where(eq(homeRoomsTable.homeId, a.home.id));
  const [room] = await db.insert(homeRoomsTable).values({ position: n, ...roomValues(body.data), homeId: a.home.id }).returning();
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "room.created", entityType: "room", entityId: room.id, summary: room.name });
  res.status(201).json((await roomDtos(a.home.id, [room]))[0]);
});

router.get("/homes/:homeId/rooms/:roomId", async (req, res): Promise<void> => {
  noStore(res);
  const p = GetHomeRoomParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Otaq tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  const [room] = await db.select().from(homeRoomsTable).where(and(eq(homeRoomsTable.id, p.data.roomId), eq(homeRoomsTable.homeId, a.home.id)));
  if (!room) return notFound(res, "Otaq tapılmadı");
  const userId = uid(req);
  const works = (await visibleWorks(a)).filter((w) => w.roomId === room.id);
  if (!a.memberRole && !works.length) return notFound(res, "Otaq tapılmadı");
  const workIds = new Set(works.map((w) => w.id));
  const [equipment, infra, media] = await Promise.all([
    db.select().from(equipmentTable).where(and(eq(equipmentTable.homeId, a.home.id), eq(equipmentTable.roomId, room.id))),
    db.select().from(infrastructureItemsTable).where(and(eq(infrastructureItemsTable.homeId, a.home.id), eq(infrastructureItemsTable.roomId, room.id))),
    db.select().from(homeMediaTable).where(and(eq(homeMediaTable.homeId, a.home.id), eq(homeMediaTable.roomId, room.id), isNull(homeMediaTable.deletedAt))).orderBy(desc(homeMediaTable.createdAt)),
  ]);
  const allowed = <T extends { workId?: string | null; installWorkId?: string | null; createdByUserId?: string; uploadedByUserId?: string }>(r: T) =>
    !!a.memberRole || (!!r.workId && workIds.has(r.workId)) || (!!r.installWorkId && workIds.has(r.installWorkId)) || r.createdByUserId === userId || r.uploadedByUserId === userId;
  res.json({
    room: (await roomDtos(a.home.id, [room], workIds))[0],
    works: await workSummaries(works),
    equipment: await equipmentDtos(equipment.filter(allowed)),
    infrastructure: await infraDtos(infra.filter(allowed), userId),
    media: media.filter(allowed).map((m) => mediaDto(m, userId)),
  });
});

router.patch("/homes/:homeId/rooms/:roomId", async (req, res): Promise<void> => {
  const p = UpdateHomeRoomParams.safeParse(req.params);
  const body = UpdateHomeRoomBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Otaq tapılmadı");
  if (!body.success) return bad(res, "Otaq məlumatlarını yoxlayın");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).edit) return forbidden(res);
  const [room] = await db.select().from(homeRoomsTable).where(and(eq(homeRoomsTable.id, p.data.roomId), eq(homeRoomsTable.homeId, a.home.id)));
  if (!room) return notFound(res, "Otaq tapılmadı");
  const values = roomValues(body.data);
  const changes = diff(room as unknown as Record<string, unknown>, values, Object.keys(values));
  const [saved] = await db.update(homeRoomsTable).set(values).where(eq(homeRoomsTable.id, room.id)).returning();
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "room.updated", entityType: "room", entityId: room.id, summary: saved.name, changes });
  res.json((await roomDtos(a.home.id, [saved]))[0]);
});

router.delete("/homes/:homeId/rooms/:roomId", async (req, res): Promise<void> => {
  const p = DeleteHomeRoomParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Otaq tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).edit) return forbidden(res);
  const [room] = await db.select().from(homeRoomsTable).where(and(eq(homeRoomsTable.id, p.data.roomId), eq(homeRoomsTable.homeId, a.home.id)));
  if (!room) return notFound(res, "Otaq tapılmadı");
  await db.transaction(async (tx) => {
    // Works, equipment and utility lines keep existing without a room (FK set null); media is unlinked explicitly.
    await tx.update(homeMediaTable).set({ roomId: null }).where(eq(homeMediaTable.roomId, room.id));
    await tx.delete(homeRoomsTable).where(eq(homeRoomsTable.id, room.id));
    await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "room.deleted", entityType: "room", entityId: room.id, summary: room.name }, tx);
  });
  res.json({ success: true });
});

/* ------------------------------------------------------- members & performers */

router.get("/homes/:homeId/members", async (req, res): Promise<void> => {
  noStore(res);
  const p = ListHomeMembersParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!a.memberRole) return forbidden(res);
  const rows = await db.select().from(homeMembersTable).where(eq(homeMembersTable.homeId, a.home.id)).orderBy(homeMembersTable.createdAt);
  const userId = uid(req);
  res.json(rows.map((m) => ({ id: m.id, role: m.role, displayName: m.displayName, isMe: m.userId === userId, createdAt: m.createdAt.toISOString() })));
});

router.delete("/homes/:homeId/members/:memberId", async (req, res): Promise<void> => {
  const p = RemoveHomeMemberParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Üzv tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  const userId = uid(req);
  const [m] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.id, p.data.memberId), eq(homeMembersTable.homeId, a.home.id)));
  if (!m) return notFound(res, "Üzv tapılmadı");
  // The owner removes technicians / viewers; a technician or viewer may leave on their own.
  const self = m.userId === userId;
  if (m.role === "owner") return bad(res, "Ev sahibi silinə bilməz");
  if (a.memberRole !== "owner" && !self) return forbidden(res);
  await db.delete(homeMembersTable).where(eq(homeMembersTable.id, m.id));
  await audit({ homeId: a.home.id, actorUserId: userId, actorRole: a.memberRole ?? "performer", action: "member.removed", entityType: "member", entityId: m.id, summary: `${m.displayName || m.role} (${m.role})` });
  res.json({ success: true });
});

router.get("/homes/:homeId/performers", async (req, res): Promise<void> => {
  noStore(res);
  const p = ListHomePerformersParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  const works = await visibleWorks(a);
  res.json(await homePerformers(a.home.id, uid(req), a.memberRole ? undefined : new Set(works.map((w) => w.id)), a.memberRole === "owner" || a.memberRole === "technician"));
});

/* ---------------------------------------------------------------------- works */

router.get("/homes/:homeId/works", async (req, res): Promise<void> => {
  noStore(res);
  const p = ListWorksParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  res.json(await workSummaries(await visibleWorks(a)));
});

export async function workValues(homeId: string, userId: string, isOwner: boolean, d: ReturnType<typeof CreateWorkBody.parse>): Promise<{ error: string } | { values: Partial<WorkRow> }> {
  const roomId = await roomIn(homeId, d.roomId);
  if (roomId === undefined) return { error: "Otaq bu evə aid deyil" };
  const equipmentId = await equipmentIn(homeId, d.equipmentId);
  if (equipmentId === undefined) return { error: "Avadanlıq bu evə aid deyil" };
  if (d.startDate && d.endDate && d.endDate < d.startDate) return { error: "Bitmə tarixi başlama tarixindən əvvəl ola bilməz" };
  const values: Partial<WorkRow> = {
    title: d.title.trim(), category: d.category ?? "general", kind: d.kind ?? "renovation", roomId, equipmentId,
    description: (d.description ?? "").trim(), materials: (d.materials ?? "").trim(), location: (d.location ?? "").trim(),
    startDate: d.startDate ?? null, endDate: d.endDate ?? null, visibility: d.visibility ?? "public",
  };
  if (d.smetaProjectId !== undefined) {
    if (!isOwner) return { error: "Smeta layihəsini yalnız ev sahibi bağlaya bilər" };
    if (d.smetaProjectId) {
      const [s] = await db.select({ id: smetaProjectsTable.id }).from(smetaProjectsTable).where(and(eq(smetaProjectsTable.id, d.smetaProjectId), eq(smetaProjectsTable.ownerUserId, userId)));
      if (!s) return { error: "Smeta layihəsi tapılmadı" };
    }
    values.smetaProjectId = d.smetaProjectId ?? null;
  }
  return { values };
}

router.post("/homes/:homeId/works", async (req, res): Promise<void> => {
  const p = CreateWorkParams.safeParse(req.params);
  const body = CreateWorkBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  if (!body.success) return bad(res, "İşin adını və tarixlərini yoxlayın");
  const userId = uid(req);
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).addWorks) return forbidden(res);
  const owner = a.memberRole === "owner";
  const v = await workValues(a.home.id, userId, owner, body.data);
  if ("error" in v) return bad(res, v.error);
  // A performer records a work through the profile they already work in this home with (individual first).
  let performerWorkerId: string | null = null;
  if (!owner) {
    const rows = await db.select({ workerId: workParticipantsTable.workerId }).from(workParticipantsTable)
      .where(and(inArray(workParticipantsTable.workId, [...a.performerWorkIds]), inArray(workParticipantsTable.workerId, a.actor.actingIds), eq(workParticipantsTable.status, "accepted")));
    const ids = rows.map((r) => r.workerId);
    performerWorkerId = a.actor.individual && ids.includes(a.actor.individual.id) ? a.actor.individual.id : ids[0] ?? null;
    if (!performerWorkerId) return forbidden(res);
  }
  const status = body.data.status ?? "planned";
  const work = await db.transaction(async (tx) => {
    const [w] = await tx.insert(workRecordsTable).values({ ...v.values, title: v.values.title!, homeId: a.home.id, status, createdByUserId: userId }).returning();
    await tx.insert(workApprovalsTable).values({ workId: w.id, action: "created", fromStatus: "", toStatus: status, actorUserId: userId, actorRole: a.role });
    if (performerWorkerId) {
      await tx.insert(workParticipantsTable).values({ workId: w.id, workerId: performerWorkerId, role: "lead", status: "accepted", addedByUserId: userId, respondedAt: new Date() });
    }
    await audit({ homeId: a.home.id, actorUserId: userId, actorRole: a.role, action: "work.created", entityType: "work", entityId: w.id, summary: w.title }, tx);
    return w;
  });
  const wa = await getWorkAccess(userId, work.id);
  res.status(201).json(await workDetail(wa!, userId));
});

/* ---------------------------------------------------------------------- media */

router.get("/homes/:homeId/media", async (req, res): Promise<void> => {
  noStore(res);
  const p = ListHomeMediaParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  const userId = uid(req);
  const rows = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt))).orderBy(desc(homeMediaTable.createdAt));
  res.json(rows.filter((m) => a.memberRole || (m.workId && (a.performerWorkIds.has(m.workId) || a.invitedWorkIds.has(m.workId))) || m.uploadedByUserId === userId).map((m) => mediaDto(m, userId)));
});

/* ------------------------------------------------------------- infrastructure */

const clampPoints = (pts: { x: number; y: number }[] | undefined) =>
  (pts ?? []).map((pt) => ({ x: Math.min(100, Math.max(0, Math.round(pt.x * 100) / 100)), y: Math.min(100, Math.max(0, Math.round(pt.y * 100) / 100)) }));

function infraVisible(a: HomeAccess, userId: string) {
  return (i: { workId: string | null; createdByUserId: string }) => !!a.memberRole || (!!i.workId && a.performerWorkIds.has(i.workId)) || i.createdByUserId === userId;
}

router.get("/homes/:homeId/infrastructure", async (req, res): Promise<void> => {
  noStore(res);
  const p = ListInfrastructureParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  const userId = uid(req);
  const rows = await db.select().from(infrastructureItemsTable).where(eq(infrastructureItemsTable.homeId, a.home.id)).orderBy(infrastructureItemsTable.createdAt);
  res.json(await infraDtos(rows.filter(infraVisible(a, userId)), userId));
});

async function infraValues(a: HomeAccess, d: ReturnType<typeof CreateInfrastructureBody.parse>) {
  const roomId = await roomIn(a.home.id, d.roomId);
  if (roomId === undefined) return { error: "Otaq bu evə aid deyil" };
  const workId = await workIn(a.home.id, d.workId);
  if (workId === undefined) return { error: "İş bu evə aid deyil" };
  if (!a.memberRole && (!workId || !a.performerWorkIds.has(workId))) return { error: "Qeydi iştirak etdiyiniz işə bağlayın" };
  const mediaId = await homeMediaIn(a.home.id, d.mediaId);
  if (mediaId === undefined) return { error: "Şəkil bu evə aid deyil" };
  // The source is decided by who records it, not by what the client claims.
  const source = a.memberRole === "technician" ? "specialist" : a.memberRole === "owner" ? (d.source === "plan" ? "plan" : "owner") : "worker";
  return { values: { roomId, workId, mediaId, type: d.type, label: (d.label ?? "").trim(), notes: (d.notes ?? "").trim(), points: clampPoints(d.points), source } };
}

router.post("/homes/:homeId/infrastructure", async (req, res): Promise<void> => {
  const p = CreateInfrastructureParams.safeParse(req.params);
  const body = CreateInfrastructureBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  if (!body.success) return bad(res, "Kommunikasiya qeydini yoxlayın");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (a.memberRole === "viewer" || (!a.memberRole && !a.performerWorkIds.size)) return forbidden(res);
  const v = await infraValues(a, body.data);
  if ("error" in v) return bad(res, v.error);
  const userId = uid(req);
  const [row] = await db.insert(infrastructureItemsTable).values({ ...v.values!, homeId: a.home.id, createdByUserId: userId }).returning();
  await audit({ homeId: a.home.id, actorUserId: userId, actorRole: a.role, action: "infrastructure.created", entityType: "infrastructure", entityId: row.id, summary: `${row.type}: ${row.label}` });
  res.status(201).json((await infraDtos([row], userId))[0]);
});

async function loadInfra(req: Request, res: Response, itemId: string) {
  const [row] = await db.select().from(infrastructureItemsTable).where(eq(infrastructureItemsTable.id, itemId));
  if (!row) { notFound(res, "Qeyd tapılmadı"); return null; }
  const a = await getHomeAccess(uid(req), row.homeId);
  if (!a || !infraVisible(a, uid(req))(row)) { notFound(res, "Qeyd tapılmadı"); return null; }
  return { row, a };
}

router.patch("/infrastructure/:itemId", async (req, res): Promise<void> => {
  const p = UpdateInfrastructureParams.safeParse(req.params);
  const body = UpdateInfrastructureBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Qeyd tapılmadı");
  if (!body.success) return bad(res, "Kommunikasiya qeydini yoxlayın");
  const found = await loadInfra(req, res, p.data.itemId);
  if (!found) return;
  const { row, a } = found;
  const userId = uid(req);
  if (row.createdByUserId !== userId && a.memberRole !== "owner") return forbidden(res);
  const v = await infraValues(a, body.data);
  if ("error" in v) return bad(res, v.error);
  const values = { ...v.values!, source: row.source };
  const changes = diff(row as unknown as Record<string, unknown>, values, ["roomId", "workId", "mediaId", "type", "label", "notes", "points"]);
  // Any change invalidates an earlier specialist verification.
  const resetVerification = Object.keys(changes).length > 0 && !!row.verifiedAt;
  const [saved] = await db.update(infrastructureItemsTable).set({ ...values, updatedAt: new Date(), ...(resetVerification ? { verifiedAt: null, verifiedByUserId: null } : {}) })
    .where(eq(infrastructureItemsTable.id, row.id)).returning();
  await audit({ homeId: a.home.id, actorUserId: userId, actorRole: a.role, action: "infrastructure.updated", entityType: "infrastructure", entityId: row.id, summary: resetVerification ? "Dəyişdi, təsdiq sıfırlandı" : saved.label, changes });
  res.json((await infraDtos([saved], userId))[0]);
});

router.delete("/infrastructure/:itemId", async (req, res): Promise<void> => {
  const p = DeleteInfrastructureParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Qeyd tapılmadı");
  const found = await loadInfra(req, res, p.data.itemId);
  if (!found) return;
  const { row, a } = found;
  const userId = uid(req);
  if (row.createdByUserId !== userId && a.memberRole !== "owner") return forbidden(res);
  await db.delete(infrastructureItemsTable).where(eq(infrastructureItemsTable.id, row.id));
  await audit({ homeId: a.home.id, actorUserId: userId, actorRole: a.role, action: "infrastructure.deleted", entityType: "infrastructure", entityId: row.id, summary: `${row.type}: ${row.label}` });
  res.json({ success: true });
});

router.post("/infrastructure/:itemId/verify", async (req, res): Promise<void> => {
  const p = VerifyInfrastructureParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Qeyd tapılmadı");
  const found = await loadInfra(req, res, p.data.itemId);
  if (!found) return;
  const { row, a } = found;
  if (a.memberRole !== "technician") return forbidden(res, "Yalnız evə əlavə olunmuş texniki mütəxəssis təsdiqləyə bilər");
  const userId = uid(req);
  const [saved] = await db.update(infrastructureItemsTable).set({ verifiedAt: new Date(), verifiedByUserId: userId }).where(eq(infrastructureItemsTable.id, row.id)).returning();
  await audit({ homeId: a.home.id, actorUserId: userId, actorRole: "technician", action: "infrastructure.verified", entityType: "infrastructure", entityId: row.id, summary: `${row.type}: ${row.label}` });
  res.json((await infraDtos([saved], userId))[0]);
});

/* ------------------------------------------------------------------ equipment */

function equipmentVisible(a: HomeAccess, userId: string) {
  return (e: { installWorkId: string | null; createdByUserId: string }) => !!a.memberRole || (!!e.installWorkId && a.performerWorkIds.has(e.installWorkId)) || e.createdByUserId === userId;
}

router.get("/homes/:homeId/equipment", async (req, res): Promise<void> => {
  noStore(res);
  const p = ListEquipmentParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  const rows = await db.select().from(equipmentTable).where(eq(equipmentTable.homeId, a.home.id)).orderBy(equipmentTable.createdAt);
  res.json(await equipmentDtos(rows.filter(equipmentVisible(a, uid(req)))));
});

async function equipmentValues(a: HomeAccess, d: ReturnType<typeof CreateEquipmentBody.parse>) {
  const roomId = await roomIn(a.home.id, d.roomId);
  if (roomId === undefined) return { error: "Otaq bu evə aid deyil" };
  const installWorkId = await workIn(a.home.id, d.installWorkId);
  if (installWorkId === undefined) return { error: "Quraşdırma işi bu evə aid deyil" };
  if (!a.memberRole && (!installWorkId || !a.performerWorkIds.has(installWorkId))) return { error: "Avadanlığı quraşdırdığınız işə bağlayın" };
  const photoMediaId = await homeMediaIn(a.home.id, d.photoMediaId);
  if (photoMediaId === undefined) return { error: "Şəkil bu evə aid deyil" };
  if (d.installedAt && d.warrantyUntil && d.warrantyUntil < d.installedAt) return { error: "Zəmanət tarixi quraşdırma tarixindən əvvəl ola bilməz" };
  return { values: {
    name: d.name.trim(), category: d.category ?? "other", roomId, installWorkId, brand: (d.brand ?? "").trim(), model: (d.model ?? "").trim(),
    serialNumber: (d.serialNumber ?? "").trim(), installedAt: d.installedAt ?? null, warrantyUntil: d.warrantyUntil ?? null, photoMediaId, notes: (d.notes ?? "").trim(),
  } };
}

router.post("/homes/:homeId/equipment", async (req, res): Promise<void> => {
  const p = CreateEquipmentParams.safeParse(req.params);
  const body = CreateEquipmentBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  if (!body.success) return bad(res, "Avadanlıq məlumatlarını yoxlayın");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (a.memberRole === "viewer" || (!a.memberRole && !a.performerWorkIds.size)) return forbidden(res);
  const v = await equipmentValues(a, body.data);
  if ("error" in v) return bad(res, v.error);
  const userId = uid(req);
  const [row] = await db.insert(equipmentTable).values({ ...v.values!, homeId: a.home.id, createdByUserId: userId }).returning();
  await audit({ homeId: a.home.id, actorUserId: userId, actorRole: a.role, action: "equipment.created", entityType: "equipment", entityId: row.id, summary: row.name });
  res.status(201).json((await equipmentDtos([row]))[0]);
});

async function loadEquipment(req: Request, res: Response, id: string) {
  const [row] = await db.select().from(equipmentTable).where(eq(equipmentTable.id, id));
  if (!row) { notFound(res, "Avadanlıq tapılmadı"); return null; }
  const a = await getHomeAccess(uid(req), row.homeId);
  if (!a || !equipmentVisible(a, uid(req))(row)) { notFound(res, "Avadanlıq tapılmadı"); return null; }
  return { row, a };
}

router.patch("/equipment/:equipmentId", async (req, res): Promise<void> => {
  const p = UpdateEquipmentParams.safeParse(req.params);
  const body = UpdateEquipmentBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Avadanlıq tapılmadı");
  if (!body.success) return bad(res, "Avadanlıq məlumatlarını yoxlayın");
  const found = await loadEquipment(req, res, p.data.equipmentId);
  if (!found) return;
  const { row, a } = found;
  const userId = uid(req);
  if (!(a.memberRole === "owner" || a.memberRole === "technician" || row.createdByUserId === userId)) return forbidden(res);
  const v = await equipmentValues(a, body.data);
  if ("error" in v) return bad(res, v.error);
  const changes = diff(row as unknown as Record<string, unknown>, v.values!, Object.keys(v.values!) as never[]);
  const [saved] = await db.update(equipmentTable).set({ ...v.values!, updatedAt: new Date() }).where(eq(equipmentTable.id, row.id)).returning();
  await audit({ homeId: a.home.id, actorUserId: userId, actorRole: a.role, action: "equipment.updated", entityType: "equipment", entityId: row.id, summary: saved.name, changes });
  res.json((await equipmentDtos([saved]))[0]);
});

router.delete("/equipment/:equipmentId", async (req, res): Promise<void> => {
  const p = DeleteEquipmentParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Avadanlıq tapılmadı");
  const found = await loadEquipment(req, res, p.data.equipmentId);
  if (!found) return;
  const { row, a } = found;
  if (a.memberRole !== "owner") return forbidden(res);
  await db.transaction(async (tx) => {
    await tx.update(workRecordsTable).set({ equipmentId: null }).where(eq(workRecordsTable.equipmentId, row.id));
    await tx.delete(equipmentTable).where(eq(equipmentTable.id, row.id));
    await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "equipment.deleted", entityType: "equipment", entityId: row.id, summary: row.name }, tx);
  });
  res.json({ success: true });
});

/* ---------------------------------------------------------------- invitations */

router.post("/homes/:homeId/invitations", async (req, res): Promise<void> => {
  const p = CreateHomeInvitationParams.safeParse(req.params);
  const body = CreateHomeInvitationBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  if (!body.success) return bad(res, "Dəvət məlumatlarını yoxlayın");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (a.memberRole !== "owner") return forbidden(res);
  const d = body.data;
  let workId: string | null = null;
  let placeholderWorkerId: string | null = null;
  if (d.kind === "work") {
    if (["technician", "viewer"].includes(d.role)) return bad(res, "İcraçı üçün iş rolunu seçin");
    workId = (await workIn(a.home.id, d.workId)) ?? null;
    if (!workId) return bad(res, "Dəvət üçün işi seçin");
    if (d.placeholderWorkerId) {
      const [pp] = await db.select().from(workParticipantsTable).where(and(eq(workParticipantsTable.workId, workId), eq(workParticipantsTable.workerId, d.placeholderWorkerId), eq(workParticipantsTable.status, "recorded")));
      if (!pp) return bad(res, "Qeydiyyatsız icraçı bu işdə tapılmadı");
      placeholderWorkerId = d.placeholderWorkerId;
    }
  } else if (!["technician", "viewer"].includes(d.role)) {
    return bad(res, "Ev üzvü üçün rol: texniki mütəxəssis və ya ailə üzvü");
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  const [inv] = await db.insert(homeInvitationsTable).values({
    kind: d.kind, tokenHash: hashToken(token), homeId: a.home.id, workId, placeholderWorkerId, role: d.role,
    name: (d.name ?? "").trim(), contact: (d.contact ?? "").trim(), createdByUserId: uid(req), expiresAt,
  }).returning();
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "invitation.created", entityType: "invitation", entityId: inv.id, summary: `${d.kind}/${d.role}${inv.name ? `: ${inv.name}` : ""}` });
  res.json({ url: `${publicOrigin(req)}/invite/${token}`, expiresAt: expiresAt.toISOString() });
});

/* -------------------------------------------------------------------- sharing */

function shareDto(s: typeof homeSharesTable.$inferSelect) {
  const active = !s.revokedAt && (!s.expiresAt || s.expiresAt > new Date());
  return {
    id: s.id, label: s.label, level: s.level, scope: s.scope, expiresAt: s.expiresAt?.toISOString() ?? null, revokedAt: s.revokedAt?.toISOString() ?? null,
    active, openCount: s.openCount, lastOpenedAt: s.lastOpenedAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(),
  };
}

async function sharingDto(req: Request, homeId: string) {
  const [home] = await db.select().from(homesTable).where(eq(homesTable.id, homeId));
  const shares = await db.select().from(homeSharesTable).where(eq(homeSharesTable.homeId, homeId)).orderBy(desc(homeSharesTable.createdAt));
  return {
    publicLevel: home.publicLevel, publicShowAddress: home.publicShowAddress, publicShowPhotos: home.publicShowPhotos,
    publicShowEquipment: home.publicShowEquipment, showOnWorkerProfiles: home.showOnWorkerProfiles,
    publicUrl: `${publicOrigin(req)}/h/${home.publicId}`, shares: shares.map(shareDto),
  };
}

router.get("/homes/:homeId/sharing", async (req, res): Promise<void> => {
  noStore(res);
  const p = GetHomeSharingParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).manageSharing) return forbidden(res);
  res.json(await sharingDto(req, a.home.id));
});

router.put("/homes/:homeId/sharing", async (req, res): Promise<void> => {
  const p = UpdateHomeSharingParams.safeParse(req.params);
  const body = UpdateHomeSharingBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  if (!body.success) return bad(res);
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).manageSharing) return forbidden(res);
  const changes = diff(a.home as unknown as Record<string, unknown>, body.data, Object.keys(body.data) as never[]);
  await db.update(homesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(homesTable.id, a.home.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "sharing.updated", entityType: "home", entityId: a.home.id, summary: `QR səviyyəsi: ${body.data.publicLevel}`, changes });
  res.json(await sharingDto(req, a.home.id));
});

router.post("/homes/:homeId/shares", async (req, res): Promise<void> => {
  const p = CreateHomeShareParams.safeParse(req.params);
  const body = CreateHomeShareBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  if (!body.success) return bad(res, "Paylaşım məlumatlarını yoxlayın");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).manageSharing) return forbidden(res);
  const d = body.data;
  const [rooms, works, equipment] = await Promise.all([
    db.select({ id: homeRoomsTable.id }).from(homeRoomsTable).where(eq(homeRoomsTable.homeId, a.home.id)),
    db.select({ id: workRecordsTable.id }).from(workRecordsTable).where(eq(workRecordsTable.homeId, a.home.id)),
    db.select({ id: equipmentTable.id }).from(equipmentTable).where(eq(equipmentTable.homeId, a.home.id)),
  ]);
  const keep = (ids: string[], all: { id: string }[]) => [...new Set(ids)].filter((id) => all.some((x) => x.id === id));
  const scope: ShareScopeJson = {
    roomIds: keep(d.scope.roomIds, rooms), workIds: keep(d.scope.workIds, works), equipmentIds: keep(d.scope.equipmentIds, equipment),
    includePhotos: d.scope.includePhotos, includeInfrastructure: d.level === "technical" ? true : d.scope.includeInfrastructure,
  };
  if (d.level === "selected" && !scope.roomIds.length && !scope.workIds.length && !scope.equipmentIds.length) return bad(res, "Paylaşmaq üçün ən azı bir otaq, iş və ya avadanlıq seçin");
  const days = d.expiresInDays == null ? null : Math.min(365, Math.max(1, Math.round(d.expiresInDays)));
  const token = newToken();
  const [share] = await db.insert(homeSharesTable).values({
    homeId: a.home.id, tokenHash: hashToken(token), label: (d.label ?? "").trim(), level: d.level, scope, createdByUserId: uid(req),
    expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
  }).returning();
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "share.created", entityType: "share", entityId: share.id, summary: `${share.level}${share.label ? `: ${share.label}` : ""}` });
  res.json({ share: shareDto(share), url: `${publicOrigin(req)}/h/s/${token}` });
});

router.delete("/homes/:homeId/shares/:shareId", async (req, res): Promise<void> => {
  const p = RevokeHomeShareParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Link tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).manageSharing) return forbidden(res);
  const [share] = await db.update(homeSharesTable).set({ revokedAt: new Date() })
    .where(and(eq(homeSharesTable.id, p.data.shareId), eq(homeSharesTable.homeId, a.home.id), isNull(homeSharesTable.revokedAt))).returning();
  if (!share) return notFound(res, "Link tapılmadı");
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: "owner", action: "share.revoked", entityType: "share", entityId: share.id, summary: share.label });
  res.json({ success: true });
});

/* ---------------------------------------------------------------------- audit */

router.get("/homes/:homeId/audit", async (req, res): Promise<void> => {
  noStore(res);
  const p = ListHomeAuditParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await access(req, res, p.data.homeId);
  if (!a) return;
  if (!homePermissions(a).viewAudit) return forbidden(res);
  const userId = uid(req);
  const rows = await db.select().from(homeAuditTable).where(eq(homeAuditTable.homeId, a.home.id)).orderBy(desc(homeAuditTable.createdAt)).limit(300);
  res.json(rows.map((r) => ({
    id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, summary: r.summary, actorRole: r.actorRole,
    actorIsMe: r.actorUserId === userId, changes: r.changes ?? null, createdAt: r.createdAt.toISOString(),
  })));
});

void or;
export default router;
