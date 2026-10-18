import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  homeMembersTable,
  homesTable,
  workerMembershipsTable,
  workerReviewsTable,
  workersTable,
  workParticipantsTable,
  workRecordsTable,
} from "@workspace/db";
import { canManageWorker, loadActor, ownerSeesContact, type Actor, type WorkerRow } from "./homeAccess";
import { loadWorkers, workerRef } from "./homeDtos";

export async function membershipDtos(rows: (typeof workerMembershipsTable.$inferSelect)[]) {
  const workers = await loadWorkers([...rows.map((r) => r.groupId), ...rows.map((r) => r.memberId)]);
  return rows.map((m) => ({
    id: m.id, group: workerRef(workers.get(m.groupId)!), member: workerRef(workers.get(m.memberId)!), role: m.role, status: m.status,
    joinedAt: m.joinedAt?.toISOString() ?? null, leftAt: m.leftAt?.toISOString() ?? null, createdAt: m.createdAt.toISOString(),
  }));
}

export async function workerStats(workerIds: string[]) {
  if (!workerIds.length) return new Map<string, { works: number; confirmedWorks: number; homes: number; reviews: number; avgRating: number | null }>();
  const parts = await db.select({ workerId: workParticipantsTable.workerId, viaTeamId: workParticipantsTable.viaTeamId, workId: workRecordsTable.id, homeId: workRecordsTable.homeId, status: workRecordsTable.status })
    .from(workParticipantsTable).innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
    .where(and(or(inArray(workParticipantsTable.workerId, workerIds), inArray(workParticipantsTable.viaTeamId, workerIds)), eq(workParticipantsTable.status, "accepted")));
  const reviews = await db.select({ workerId: workerReviewsTable.workerId, n: sql<number>`count(*)::int`, avg: sql<number | null>`avg(${workerReviewsTable.rating})::float` })
    .from(workerReviewsTable).where(and(inArray(workerReviewsTable.workerId, workerIds), isNull(workerReviewsTable.hiddenAt))).groupBy(workerReviewsTable.workerId);
  const out = new Map<string, { works: number; confirmedWorks: number; homes: number; reviews: number; avgRating: number | null }>();
  for (const id of workerIds) {
    const mine = parts.filter((p) => p.workerId === id || p.viaTeamId === id);
    const works = new Map(mine.map((p) => [p.workId, p]));
    const r = reviews.find((x) => x.workerId === id);
    out.set(id, {
      works: works.size, confirmedWorks: [...works.values()].filter((p) => p.status === "confirmed").length,
      homes: new Set(mine.map((p) => p.homeId)).size, reviews: r?.n ?? 0, avgRating: r?.avg != null ? Math.round(r.avg * 10) / 10 : null,
    });
  }
  return out;
}

/**
 * A performer profile as the viewer may see it.
 *  - contacts: to the profile itself / its managers, when the performer made them public,
 *    or to the owner / technician of a home where the performer works
 *  - work history: the performer's own view shows everything they took part in;
 *    others see only owner-confirmed, public works in homes that allow it, without addresses
 * Returns null when the viewer may not see the profile at all.
 */
export async function workerProfile(worker: WorkerRow, viewerUserId: string | null, actorIn?: Actor) {
  if (worker.status === "merged") return null;
  const actor = viewerUserId ? actorIn ?? await loadActor(viewerUserId) : null;
  const canManage = !!actor && canManageWorker(actor, worker);
  const seesAsOwner = !!viewerUserId && await ownerSeesContact(viewerUserId, worker.id);
  if (worker.status === "placeholder" && !(viewerUserId && (worker.createdByUserId === viewerUserId || seesAsOwner))) return null;
  const showContact = canManage || worker.publicContact || seesAsOwner;

  const memberRows = worker.kind === "individual" ? [] : await db.select().from(workerMembershipsTable)
    .where(and(eq(workerMembershipsTable.groupId, worker.id), canManage ? sql`true` : inArray(workerMembershipsTable.status, ["active", "left"])))
    .orderBy(workerMembershipsTable.createdAt);
  const groupRows = worker.kind !== "individual" ? [] : await db.select().from(workerMembershipsTable)
    .where(and(eq(workerMembershipsTable.memberId, worker.id), canManage ? sql`true` : inArray(workerMembershipsTable.status, ["active", "left"])))
    .orderBy(workerMembershipsTable.createdAt);

  // History: own participation + (for teams/companies) what members did on the team's behalf.
  const rows = await db.select({ p: workParticipantsTable, w: workRecordsTable, h: homesTable }).from(workParticipantsTable)
    .innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
    .innerJoin(homesTable, eq(homesTable.id, workRecordsTable.homeId))
    .where(and(
      or(eq(workParticipantsTable.workerId, worker.id), eq(workParticipantsTable.viaTeamId, worker.id)),
      inArray(workParticipantsTable.status, canManage ? ["accepted", "recorded"] : ["accepted"]),
    ));
  const memberHomeIds = viewerUserId
    ? new Set((await db.select({ homeId: homeMembersTable.homeId }).from(homeMembersTable).where(eq(homeMembersTable.userId, viewerUserId))).map((r) => r.homeId))
    : new Set<string>();
  const teams = await loadWorkers(rows.map((r) => r.p.viaTeamId));
  const seen = new Set<string>();
  const history = [];
  for (const { p, w, h } of rows.sort((a, b) => (b.w.startDate ?? b.w.createdAt.toISOString()).localeCompare(a.w.startDate ?? a.w.createdAt.toISOString()))) {
    if (seen.has(w.id)) continue;
    const memberOfHome = memberHomeIds.has(h.id);
    const publicOk = w.status === "confirmed" && w.visibility === "public" && h.showOnWorkerProfiles && !h.archivedAt;
    if (!canManage && !memberOfHome && !publicOk) continue;
    seen.add(w.id);
    const homeVisible = canManage || memberOfHome || h.publicLevel !== "off";
    history.push({
      workId: w.id, title: w.title, category: w.category, kind: w.kind, status: w.status, startDate: w.startDate ?? null, endDate: w.endDate ?? null,
      role: p.role, viaTeamName: p.viaTeamId && p.viaTeamId !== worker.id ? teams.get(p.viaTeamId)?.displayName ?? null : null,
      city: h.city, homeId: canManage || memberOfHome ? h.id : null, homeName: homeVisible ? h.name : null,
      homePublicId: h.publicLevel !== "off" && !h.archivedAt ? h.publicId : null,
    });
  }

  const reviews = await db.select({ r: workerReviewsTable, title: workRecordsTable.title }).from(workerReviewsTable)
    .innerJoin(workRecordsTable, eq(workRecordsTable.id, workerReviewsTable.workId))
    .where(and(eq(workerReviewsTable.workerId, worker.id), isNull(workerReviewsTable.hiddenAt)));
  const stats = (await workerStats([worker.id])).get(worker.id)!;

  return {
    id: worker.id, kind: worker.kind, displayName: worker.displayName, specialties: worker.specialties ?? [], city: worker.city,
    serviceArea: worker.serviceArea, about: worker.about, experienceYears: worker.experienceYears, photoMediaId: worker.photoMediaId,
    photoUrl: workerRef(worker).photoUrl, status: worker.status, registered: worker.status === "active", identityVerified: !!worker.identityVerifiedAt,
    phone: showContact && worker.phone ? worker.phone : null, email: showContact && worker.email ? worker.email : null, publicContact: worker.publicContact,
    legalName: worker.legalName, taxId: canManage ? worker.taxId : null, createdAt: worker.createdAt.toISOString(),
    canManage, isMine: !!actor && worker.userId === actor.userId,
    members: await membershipDtos(memberRows), groups: await membershipDtos(groupRows), stats, history,
    reviews: reviews.map(({ r, title }) => ({
      id: r.id, workId: r.workId, workTitle: title, workerId: r.workerId, rating: r.rating, body: r.body, createdAt: r.createdAt.toISOString(),
      reported: !!r.reportedAt, mine: r.authorUserId === viewerUserId,
    })),
  };
}

export async function workerCard(worker: WorkerRow) {
  const stats = (await workerStats([worker.id])).get(worker.id)!;
  return { worker: workerRef(worker), city: worker.city, stats };
}

export async function loadWorker(id: string) {
  const [w] = await db.select().from(workersTable).where(eq(workersTable.id, id));
  return w ?? null;
}
