import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  equipmentTable,
  homeMediaTable,
  homeRoomsTable,
  infrastructureItemsTable,
  smetaProjectsTable,
  workApprovalsTable,
  workerReviewsTable,
  workersTable,
  workNotesTable,
  workParticipantsTable,
  workRecordsTable,
} from "@workspace/db";
import { iso } from "./realtorCore";
import { ownerSeesContact, participantCanEdit, workPermissions, type HomeAccess, type HomeRow, type WorkAccess, type WorkerRow, type WorkRow } from "./homeAccess";

export type MediaRow = typeof homeMediaTable.$inferSelect;
export type RoomRow = typeof homeRoomsTable.$inferSelect;
export type EquipmentRow = typeof equipmentTable.$inferSelect;
export type InfraRow = typeof infrastructureItemsTable.$inferSelect;

export const homeMediaUrl = (id: string, shareToken?: string) => `/api/home-media/${id}${shareToken ? `?s=${encodeURIComponent(shareToken)}` : ""}`;
const dateStr = (v: string | null | undefined) => v ?? null;
const uniq = <T,>(list: (T | null | undefined)[]) => [...new Set(list.filter((v): v is T => v != null))];

/* ---------------------------------------------------------------- workers */

export function workerRef(w: WorkerRow) {
  return {
    id: w.id,
    kind: w.kind,
    displayName: w.displayName,
    status: w.status,
    photoUrl: w.photoMediaId ? homeMediaUrl(w.photoMediaId) : null,
    specialties: w.specialties ?? [],
    /** A placeholder typed by a homeowner is never shown as a registered profile. */
    registered: w.status === "active",
    identityVerified: !!w.identityVerifiedAt,
  };
}
export type WorkerRefDto = ReturnType<typeof workerRef>;

export async function loadWorkers(ids: (string | null | undefined)[]) {
  const wanted = uniq(ids);
  if (!wanted.length) return new Map<string, WorkerRow>();
  const rows = await db.select().from(workersTable).where(inArray(workersTable.id, wanted));
  return new Map(rows.map((r) => [r.id, r]));
}

/* ------------------------------------------------------------------ homes */

export function homeDto(home: HomeRow, access: Pick<HomeAccess, "role">, permissions: Record<string, boolean>) {
  return {
    id: home.id, publicId: home.publicId, name: home.name, propertyType: home.propertyType, city: home.city, district: home.district,
    address: home.address, areaM2: home.areaM2, roomCount: home.roomCount, floor: home.floor, builtYear: home.builtYear, stage: home.stage,
    coverMediaId: home.coverMediaId, coverUrl: home.coverMediaId ? homeMediaUrl(home.coverMediaId) : null, notes: home.notes,
    publicLevel: home.publicLevel, publicShowAddress: home.publicShowAddress, publicShowPhotos: home.publicShowPhotos,
    publicShowEquipment: home.publicShowEquipment, showOnWorkerProfiles: home.showOnWorkerProfiles,
    myRole: access.role, permissions, archived: !!home.archivedAt, createdAt: home.createdAt.toISOString(), updatedAt: home.updatedAt.toISOString(),
  };
}

/** Performer view of a home: name and area only, no address, notes or sharing settings. */
export function performerHomeDto(home: HomeRow, permissions: Record<string, boolean>) {
  return {
    ...homeDto(home, { role: "performer" }, permissions),
    address: "", notes: "", floor: "", publicLevel: "off", publicShowAddress: false, publicShowPhotos: false, publicShowEquipment: false,
  };
}

export async function roomDtos(homeId: string, rooms: RoomRow[], visibleWorkIds?: Set<string>) {
  if (!rooms.length) return [];
  const ids = rooms.map((r) => r.id);
  const [works, equipment, infra, media] = await Promise.all([
    db.select({ id: workRecordsTable.id, roomId: workRecordsTable.roomId }).from(workRecordsTable).where(and(eq(workRecordsTable.homeId, homeId), inArray(workRecordsTable.roomId, ids))),
    db.select({ roomId: equipmentTable.roomId }).from(equipmentTable).where(and(eq(equipmentTable.homeId, homeId), inArray(equipmentTable.roomId, ids))),
    db.select({ roomId: infrastructureItemsTable.roomId }).from(infrastructureItemsTable).where(and(eq(infrastructureItemsTable.homeId, homeId), inArray(infrastructureItemsTable.roomId, ids))),
    db.select({ id: homeMediaTable.id, roomId: homeMediaTable.roomId, contentType: homeMediaTable.contentType }).from(homeMediaTable)
      .where(and(eq(homeMediaTable.homeId, homeId), inArray(homeMediaTable.roomId, ids), isNull(homeMediaTable.deletedAt), isNull(homeMediaTable.workId))).orderBy(desc(homeMediaTable.createdAt)),
  ]);
  const count = (list: { roomId: string | null }[], id: string) => list.filter((x) => x.roomId === id).length;
  return rooms.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, floor: r.floor, areaM2: r.areaM2, condition: r.condition, notes: r.notes, position: r.position,
    works: works.filter((w) => w.roomId === r.id && (!visibleWorkIds || visibleWorkIds.has(w.id))).length,
    equipment: count(equipment, r.id), infrastructure: count(infra, r.id),
    photoUrl: (() => { const m = media.find((x) => x.roomId === r.id && x.contentType.startsWith("image/")); return m ? homeMediaUrl(m.id) : null; })(),
  }));
}

/* ------------------------------------------------------------------ works */

export async function workSummaries(works: WorkRow[]) {
  if (!works.length) return [];
  const ids = works.map((w) => w.id);
  const [parts, rooms, mediaCounts, notes] = await Promise.all([
    db.select().from(workParticipantsTable).where(and(inArray(workParticipantsTable.workId, ids), inArray(workParticipantsTable.status, ["invited", "accepted", "recorded"]))),
    db.select({ id: homeRoomsTable.id, name: homeRoomsTable.name }).from(homeRoomsTable).where(inArray(homeRoomsTable.id, uniq(works.map((w) => w.roomId)).length ? uniq(works.map((w) => w.roomId)) : ["00000000-0000-0000-0000-000000000000"])),
    db.select({ workId: homeMediaTable.workId, n: sql<number>`count(*)::int` }).from(homeMediaTable).where(and(inArray(homeMediaTable.workId, ids), isNull(homeMediaTable.deletedAt))).groupBy(homeMediaTable.workId),
    db.select({ workId: workNotesTable.workId, kind: workNotesTable.kind }).from(workNotesTable).where(and(inArray(workNotesTable.workId, ids), inArray(workNotesTable.kind, ["defect", "fix"]))),
  ]);
  const workers = await loadWorkers(parts.map((p) => p.workerId));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const sorted = [...works].sort((a, b) => (b.startDate ?? b.createdAt.toISOString()).localeCompare(a.startDate ?? a.createdAt.toISOString()));
  return sorted.map((w) => {
    const defects = notes.filter((n) => n.workId === w.id && n.kind === "defect").length;
    const fixes = notes.filter((n) => n.workId === w.id && n.kind === "fix").length;
    return {
      id: w.id, homeId: w.homeId, title: w.title, category: w.category, kind: w.kind, status: w.status,
      startDate: dateStr(w.startDate), endDate: dateStr(w.endDate), roomId: w.roomId, roomName: w.roomId ? roomName.get(w.roomId) ?? null : null,
      participants: parts.filter((p) => p.workId === w.id).map((p) => {
        const worker = workers.get(p.workerId)!;
        return { workerId: p.workerId, name: worker.displayName, kind: worker.kind, role: p.role, status: p.status };
      }),
      mediaCount: mediaCounts.find((m) => m.workId === w.id)?.n ?? 0,
      openDefects: Math.max(0, defects - fixes),
      inspected: !!w.inspectedAt, visibility: w.visibility, materials: w.materials, description: w.description.slice(0, 300),
      createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString(),
    };
  });
}
export type WorkSummaryDto = Awaited<ReturnType<typeof workSummaries>>[number];

export function mediaDto(m: MediaRow, userId: string | null, shareToken?: string) {
  return {
    id: m.id, url: homeMediaUrl(m.id, shareToken), contentType: m.contentType, originalName: m.originalName, caption: m.caption, phase: m.phase,
    workId: m.workId, roomId: m.roomId, uploadedByMe: !!userId && m.uploadedByUserId === userId, createdAt: m.createdAt.toISOString(),
  };
}

export async function workDetail(access: WorkAccess, userId: string) {
  const { work, homeAccess } = access;
  const [parts, media, notes, approvals, reviews, room, smeta] = await Promise.all([
    db.select().from(workParticipantsTable).where(eq(workParticipantsTable.workId, work.id)).orderBy(workParticipantsTable.invitedAt),
    db.select().from(homeMediaTable).where(and(eq(homeMediaTable.workId, work.id), isNull(homeMediaTable.deletedAt))).orderBy(homeMediaTable.createdAt),
    db.select().from(workNotesTable).where(eq(workNotesTable.workId, work.id)).orderBy(workNotesTable.createdAt),
    db.select().from(workApprovalsTable).where(eq(workApprovalsTable.workId, work.id)).orderBy(workApprovalsTable.createdAt),
    db.select().from(workerReviewsTable).where(and(eq(workerReviewsTable.workId, work.id), isNull(workerReviewsTable.hiddenAt))).orderBy(workerReviewsTable.createdAt),
    work.roomId ? db.select().from(homeRoomsTable).where(eq(homeRoomsTable.id, work.roomId)).then((r) => r[0]) : Promise.resolve(undefined),
    work.smetaProjectId && homeAccess.memberRole === "owner"
      ? db.select({ name: smetaProjectsTable.name }).from(smetaProjectsTable).where(and(eq(smetaProjectsTable.id, work.smetaProjectId), eq(smetaProjectsTable.ownerUserId, userId))).then((r) => r[0])
      : Promise.resolve(undefined),
  ]);
  const [equipment] = work.equipmentId ? await db.select({ name: equipmentTable.name }).from(equipmentTable).where(eq(equipmentTable.id, work.equipmentId)) : [];
  const workers = await loadWorkers([...parts.map((p) => p.workerId), ...parts.map((p) => p.viaTeamId)]);
  const owner = !!homeAccess.memberRole && homeAccess.memberRole !== "viewer";
  const acting = new Set(homeAccess.actor.actingIds);
  const visibleParts = parts.filter((p) => p.status !== "removed" || owner);
  return {
    id: work.id, homeId: work.homeId, homeName: homeAccess.home.name, title: work.title, category: work.category, kind: work.kind, status: work.status,
    description: work.description, materials: work.materials, location: work.location, startDate: dateStr(work.startDate), endDate: dateStr(work.endDate),
    roomId: work.roomId, roomName: room?.name ?? null, equipmentId: work.equipmentId, equipmentName: equipment?.name ?? null, visibility: work.visibility,
    // Private household notes: cost and warranty only for members of the home.
    cost: homeAccess.memberRole ? work.cost ?? null : null, currency: work.currency, warrantyNote: homeAccess.memberRole ? work.warrantyNote : "",
    addedByMe: work.createdByUserId === userId, addedByRole: approvals.find((x) => x.action === "created")?.actorRole ?? "owner",
    smetaProjectId: smeta ? work.smetaProjectId : null, smetaProjectName: smeta?.name ?? null,
    completedAt: iso(work.completedAt), confirmedAt: iso(work.confirmedAt), inspectedAt: iso(work.inspectedAt),
    participants: visibleParts.map((p) => {
      const w = workers.get(p.workerId)!;
      const isMe = acting.has(p.workerId);
      // Contacts: only the home's owner, members and contributors (and the profile itself) see them.
      const phone = (owner || isMe) && w.phone ? w.phone : null;
      return {
        id: p.id, worker: workerRef(w), role: p.role, status: p.status, viaTeamId: p.viaTeamId,
        canAddMedia: p.canAddMedia, canAddNotes: p.canAddNotes, canEdit: participantCanEdit(p),
        viaTeamName: p.viaTeamId ? workers.get(p.viaTeamId)?.displayName ?? null : null, note: p.note,
        invitedAt: p.invitedAt.toISOString(), respondedAt: iso(p.respondedAt), isMe, phone,
      };
    }),
    media: media.map((m) => mediaDto(m, userId)),
    notes: notes.map((n) => ({ id: n.id, kind: n.kind, body: n.body, result: n.result, authorRole: n.authorRole, authorIsMe: n.authorUserId === userId, createdAt: n.createdAt.toISOString() })),
    approvals: approvals.map((a) => ({ id: a.id, action: a.action, fromStatus: a.fromStatus, toStatus: a.toStatus, actorRole: a.actorRole, note: a.note, createdAt: a.createdAt.toISOString() })),
    reviews: reviews.map((r) => ({ id: r.id, workId: r.workId, workTitle: work.title, workerId: r.workerId, rating: r.rating, body: r.body, createdAt: r.createdAt.toISOString(), reported: !!r.reportedAt, mine: r.authorUserId === userId })),
    myRole: access.role,
    permissions: workPermissions(access),
    createdAt: work.createdAt.toISOString(), updatedAt: work.updatedAt.toISOString(),
  };
}

/* ------------------------------------------------- performers of a home */

export async function homePerformers(homeId: string, viewerUserId: string, onlyWorkIds?: Set<string>, showContacts = false) {
  const rows = await db.select({ p: workParticipantsTable, w: workRecordsTable }).from(workParticipantsTable)
    .innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
    .where(and(eq(workRecordsTable.homeId, homeId), inArray(workParticipantsTable.status, ["accepted", "recorded", "invited"])));
  const filtered = onlyWorkIds ? rows.filter((r) => onlyWorkIds.has(r.w.id)) : rows;
  const workers = await loadWorkers(filtered.map((r) => r.p.workerId));
  const by = new Map<string, { worker: WorkerRow; roles: Set<string>; works: { id: string; title: string; status: string; startDate: string | null; role: string }[] }>();
  for (const { p, w } of filtered) {
    const worker = workers.get(p.workerId)!;
    const entry = by.get(worker.id) ?? { worker, roles: new Set(), works: [] };
    entry.roles.add(p.role);
    entry.works.push({ id: w.id, title: w.title, status: w.status, startDate: dateStr(w.startDate), role: p.role });
    by.set(worker.id, entry);
  }
  void viewerUserId;
  return [...by.values()].map((e) => ({
    worker: workerRef(e.worker), roles: [...e.roles], works: e.works,
    phone: showContacts && e.worker.phone ? e.worker.phone : null,
  }));
}

/* ------------------------------------------------- equipment & utilities */

/** `member`: contacts of the service company are only for people who belong to the home. */
/** Date of the latest finished service/repair work linked to the equipment. */
export function lastService(services: { status: string; startDate: string | null }[]): string | null {
  const done = services.filter((s) => (s.status === "completed" || s.status === "confirmed") && s.startDate).map((s) => s.startDate!);
  return done.sort().at(-1) ?? null;
}

export async function equipmentDtos(rows: EquipmentRow[], member = true) {
  if (!rows.length) return [];
  const roomIds = uniq(rows.map((r) => r.roomId));
  const workIds = uniq(rows.map((r) => r.installWorkId));
  const [rooms, works, installers, services] = await Promise.all([
    roomIds.length ? db.select({ id: homeRoomsTable.id, name: homeRoomsTable.name }).from(homeRoomsTable).where(inArray(homeRoomsTable.id, roomIds)) : Promise.resolve([] as { id: string; name: string }[]),
    workIds.length ? db.select({ id: workRecordsTable.id, title: workRecordsTable.title }).from(workRecordsTable).where(inArray(workRecordsTable.id, workIds)) : Promise.resolve([] as { id: string; title: string }[]),
    workIds.length ? db.select().from(workParticipantsTable).where(and(inArray(workParticipantsTable.workId, workIds), inArray(workParticipantsTable.status, ["accepted", "recorded"]))) : Promise.resolve([] as (typeof workParticipantsTable.$inferSelect)[]),
    db.select({ id: workRecordsTable.id, title: workRecordsTable.title, status: workRecordsTable.status, startDate: workRecordsTable.startDate, equipmentId: workRecordsTable.equipmentId })
      .from(workRecordsTable).where(inArray(workRecordsTable.equipmentId, rows.map((r) => r.id))).orderBy(desc(workRecordsTable.startDate)),
  ]);
  const workers = await loadWorkers(installers.map((p) => p.workerId));
  return rows.map((e) => ({
    id: e.id, roomId: e.roomId, roomName: rooms.find((r) => r.id === e.roomId)?.name ?? null,
    installWorkId: e.installWorkId, installWorkTitle: works.find((w) => w.id === e.installWorkId)?.title ?? null,
    installers: installers.filter((p) => p.workId === e.installWorkId).map((p) => workerRef(workers.get(p.workerId)!)),
    name: e.name, category: e.category, brand: e.brand, model: e.model, serialNumber: e.serialNumber,
    installedAt: dateStr(e.installedAt), warrantyUntil: dateStr(e.warrantyUntil), photoMediaId: e.photoMediaId,
    photoUrl: e.photoMediaId ? homeMediaUrl(e.photoMediaId) : null, notes: e.notes,
    services: services.filter((s) => s.equipmentId === e.id).map((s) => ({ id: s.id, title: s.title, status: s.status, startDate: dateStr(s.startDate) })),
    lastServiceAt: lastService(services.filter((s) => s.equipmentId === e.id)),
    nextServiceAt: dateStr(e.nextServiceAt), serviceContact: member ? e.serviceContact : "",
  }));
}

export async function infraDtos(rows: InfraRow[], userId: string | null) {
  if (!rows.length) return [];
  const roomIds = uniq(rows.map((r) => r.roomId));
  const workIds = uniq(rows.map((r) => r.workId));
  const [rooms, works] = await Promise.all([
    roomIds.length ? db.select({ id: homeRoomsTable.id, name: homeRoomsTable.name }).from(homeRoomsTable).where(inArray(homeRoomsTable.id, roomIds)) : Promise.resolve([] as { id: string; name: string }[]),
    workIds.length ? db.select({ id: workRecordsTable.id, title: workRecordsTable.title }).from(workRecordsTable).where(inArray(workRecordsTable.id, workIds)) : Promise.resolve([] as { id: string; title: string }[]),
  ]);
  return rows.map((i) => ({
    id: i.id, roomId: i.roomId, roomName: rooms.find((r) => r.id === i.roomId)?.name ?? null, workId: i.workId,
    workTitle: works.find((w) => w.id === i.workId)?.title ?? null, mediaId: i.mediaId, mediaUrl: i.mediaId ? homeMediaUrl(i.mediaId) : null,
    type: i.type, label: i.label, notes: i.notes, points: i.points ?? [], source: i.source, createdByMe: !!userId && i.createdByUserId === userId,
    verified: !!i.verifiedAt, verifiedAt: iso(i.verifiedAt), createdAt: i.createdAt.toISOString(),
  }));
}

export { ownerSeesContact };
