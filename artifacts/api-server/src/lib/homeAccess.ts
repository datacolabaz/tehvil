import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  homeAuditTable,
  homeMembersTable,
  homesTable,
  workerMembershipsTable,
  workersTable,
  workParticipantsTable,
  workRecordsTable,
} from "@workspace/db";

/*
 * Permission layer of the home passport. Every route asks this module what the
 * caller may do; the frontend only mirrors the answer (permissions objects).
 *
 * Roles
 *   owner       home_members.role = owner      — full control of the home
 *   technician  home_members.role = technician — technical data, inspection notes, verifies utility lines
 *   viewer      home_members.role = viewer     — household member, read only
 *   performer   accepted participant of at least one work in the home, acting through
 *               an individual profile, or a team / company the caller manages — sees
 *               only the home name and the works they take part in
 */

export type HomeRow = typeof homesTable.$inferSelect;
export type WorkerRow = typeof workersTable.$inferSelect;
export type WorkRow = typeof workRecordsTable.$inferSelect;
export type ParticipantRow = typeof workParticipantsTable.$inferSelect;
export type MemberRole = "owner" | "technician" | "viewer";
export type HomeRole = MemberRole | "performer";

export const ACTIVE_PARTICIPATION = ["accepted", "recorded"] as const;
export const PERFORMER_ROLES_LEADING = ["lead", "team_lead"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function adminUserIds(): Set<string> {
  return new Set((process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/* ------------------------------------------------------------------ actor */

export interface Actor {
  userId: string;
  individual: WorkerRow | null;
  /** Teams and companies the user leads / represents. */
  managed: WorkerRow[];
  /** Individual + managed profiles: the identities the user may act as. */
  actingIds: string[];
}

/**
 * Profiles a user can act as: their individual profile and every active team or
 * company where they are the manager or an active leader / representative.
 */
export async function loadActor(userId: string): Promise<Actor> {
  const [individual] = await db.select().from(workersTable)
    .where(and(eq(workersTable.userId, userId), eq(workersTable.kind, "individual"), eq(workersTable.status, "active")));
  const managedByAccount = await db.select().from(workersTable)
    .where(and(eq(workersTable.managerUserId, userId), inArray(workersTable.kind, ["team", "company"]), eq(workersTable.status, "active")));
  let managedByRole: WorkerRow[] = [];
  if (individual) {
    const rows = await db.select({ w: workersTable }).from(workerMembershipsTable)
      .innerJoin(workersTable, eq(workersTable.id, workerMembershipsTable.groupId))
      .where(and(
        eq(workerMembershipsTable.memberId, individual.id),
        eq(workerMembershipsTable.status, "active"),
        inArray(workerMembershipsTable.role, ["leader", "representative"]),
        eq(workersTable.status, "active"),
      ));
    managedByRole = rows.map((r) => r.w);
  }
  const managed = [...new Map([...managedByAccount, ...managedByRole].map((w) => [w.id, w])).values()];
  const actingIds = [...(individual ? [individual.id] : []), ...managed.map((w) => w.id)];
  return { userId, individual: individual ?? null, managed, actingIds };
}

export const canManageWorker = (actor: Actor, worker: WorkerRow) =>
  worker.userId === actor.userId || worker.managerUserId === actor.userId || actor.managed.some((m) => m.id === worker.id);

/* ------------------------------------------------------------------- home */

export interface HomeAccess {
  home: HomeRow;
  actor: Actor;
  role: HomeRole;
  memberRole: MemberRole | null;
  /** Works the caller takes part in (accepted) through any acting profile. */
  performerWorkIds: Set<string>;
  /** Works the caller is invited to but has not answered yet. */
  invitedWorkIds: Set<string>;
}

/** Null when the caller has nothing to do with this home (routes answer 404, never 403, to avoid leaking existence). */
export async function getHomeAccess(userId: string, homeId: string, actor?: Actor): Promise<HomeAccess | null> {
  if (!isUuid(homeId)) return null;
  const [home] = await db.select().from(homesTable).where(eq(homesTable.id, homeId));
  if (!home) return null;
  const a = actor ?? await loadActor(userId);
  const [member] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, homeId), eq(homeMembersTable.userId, userId)));
  const performerWorkIds = new Set<string>();
  const invitedWorkIds = new Set<string>();
  if (a.actingIds.length) {
    const rows = await db.select({ workId: workParticipantsTable.workId, status: workParticipantsTable.status }).from(workParticipantsTable)
      .innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
      .where(and(eq(workRecordsTable.homeId, homeId), inArray(workParticipantsTable.workerId, a.actingIds), inArray(workParticipantsTable.status, ["accepted", "invited"])));
    for (const r of rows) (r.status === "accepted" ? performerWorkIds : invitedWorkIds).add(r.workId);
  }
  const memberRole = (member?.role as MemberRole | undefined) ?? null;
  if (!memberRole && !performerWorkIds.size && !invitedWorkIds.size) return null;
  if (home.archivedAt && memberRole !== "owner") return null;
  return { home, actor: a, role: memberRole ?? "performer", memberRole, performerWorkIds, invitedWorkIds };
}

export function homePermissions(access: HomeAccess) {
  const owner = access.memberRole === "owner";
  const tech = access.memberRole === "technician";
  return {
    edit: owner,
    manageMembers: owner,
    manageSharing: owner,
    addWorks: owner || access.performerWorkIds.size > 0,
    confirmWorks: owner,
    inspect: tech,
    viewAudit: owner || tech,
  };
}

/* ------------------------------------------------------------------- work */

export interface WorkAccess {
  work: WorkRow;
  homeAccess: HomeAccess;
  /** Participant rows of profiles the caller acts as (any status). */
  mine: ParticipantRow[];
  /** Effective role label shown in the UI. */
  role: HomeRole;
}

export async function getWorkAccess(userId: string, workId: string, actor?: Actor): Promise<WorkAccess | null> {
  if (!isUuid(workId)) return null;
  const [work] = await db.select().from(workRecordsTable).where(eq(workRecordsTable.id, workId));
  if (!work) return null;
  const homeAccess = await getHomeAccess(userId, work.homeId, actor);
  if (!homeAccess) return null;
  const mine = homeAccess.actor.actingIds.length
    ? await db.select().from(workParticipantsTable).where(and(eq(workParticipantsTable.workId, workId), inArray(workParticipantsTable.workerId, homeAccess.actor.actingIds)))
    : [];
  const visibleAsPerformer = mine.some((p) => p.status === "accepted" || p.status === "invited");
  if (!homeAccess.memberRole && !visibleAsPerformer) return null;
  return { work, homeAccess, mine, role: homeAccess.memberRole ?? "performer" };
}

export function workPermissions(access: WorkAccess) {
  const { work, homeAccess, mine } = access;
  const owner = homeAccess.memberRole === "owner";
  const tech = homeAccess.memberRole === "technician";
  const accepted = mine.filter((p) => p.status === "accepted");
  const leading = accepted.some((p) => PERFORMER_ROLES_LEADING.includes(p.role));
  const managesTeamHere = accepted.some((p) => homeAccess.actor.managed.some((m) => m.id === p.workerId));
  const open = work.status !== "confirmed";
  return {
    edit: owner || (leading && open),
    manageParticipants: owner || (managesTeamHere && open),
    addMedia: owner || tech || (accepted.length > 0 && open),
    addNote: owner || tech || accepted.length > 0,
    start: (owner || leading) && (work.status === "planned" || work.status === "revision"),
    complete: (owner || leading) && ["planned", "in_progress", "revision"].includes(work.status),
    confirm: owner && work.status === "completed",
    requestRevision: owner && work.status === "completed",
    reopen: owner && (work.status === "confirmed" || work.status === "completed" || work.status === "revision"),
    inspect: tech,
    review: (owner || homeAccess.memberRole === "viewer") && work.status === "confirmed",
  };
}

/* ------------------------------------------------------------------ audit */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function audit(entry: {
  homeId?: string | null;
  workerId?: string | null;
  actorUserId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
}, tx: Tx | typeof db = db) {
  await tx.insert(homeAuditTable).values({
    homeId: entry.homeId ?? null,
    workerId: entry.workerId ?? null,
    actorUserId: entry.actorUserId,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: (entry.summary ?? "").slice(0, 300),
    changes: entry.changes && Object.keys(entry.changes).length ? entry.changes : null,
  });
}

/** Field-level diff for the audit trail. Values are compared after JSON serialisation. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>, keys: (keyof T)[]) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const b = after[k] instanceof Date ? (after[k] as Date).toISOString() : after[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out[String(k)] = { from: a ?? null, to: b ?? null };
  }
  return out;
}

/* ---------------------------------------------------------------- helpers */

/** Works of a home the caller may see: all for members, only their own for performers. */
export async function visibleWorks(access: HomeAccess): Promise<WorkRow[]> {
  if (access.memberRole) {
    return db.select().from(workRecordsTable).where(eq(workRecordsTable.homeId, access.home.id));
  }
  const ids = [...access.performerWorkIds, ...access.invitedWorkIds];
  if (!ids.length) return [];
  return db.select().from(workRecordsTable).where(and(eq(workRecordsTable.homeId, access.home.id), inArray(workRecordsTable.id, ids)));
}

/** Homes where a worker is shown to the caller as a co-participant (owner sees performer contacts). */
export async function ownerSeesContact(userId: string, workerId: string): Promise<boolean> {
  const rows = await db.select({ id: workParticipantsTable.id }).from(workParticipantsTable)
    .innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
    .innerJoin(homeMembersTable, and(eq(homeMembersTable.homeId, workRecordsTable.homeId), eq(homeMembersTable.userId, userId)))
    .where(and(
      eq(workParticipantsTable.workerId, workerId),
      inArray(workParticipantsTable.status, ["accepted", "recorded", "invited"]),
      or(eq(homeMembersTable.role, "owner"), eq(homeMembersTable.role, "technician")),
    ))
    .limit(1);
  return rows.length > 0;
}

export async function homesOfUser(userId: string) {
  return db.select({ home: homesTable, role: homeMembersTable.role }).from(homeMembersTable)
    .innerJoin(homesTable, eq(homesTable.id, homeMembersTable.homeId))
    .where(and(eq(homeMembersTable.userId, userId), isNull(homesTable.archivedAt)));
}
