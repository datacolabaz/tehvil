import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  projectParticipantsTable,
  renovationProjectsTable,
  timelineEventsTable,
} from "@workspace/db";

export type ParticipantRole = "owner" | "contractor" | "viewer";

export interface ProjectAccess {
  project: typeof renovationProjectsTable.$inferSelect;
  role: ParticipantRole;
}

export function requestUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

export async function getProjectAccess(
  projectId: string,
  userId: string,
): Promise<ProjectAccess | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return null;
  }

  const [project] = await db
    .select()
    .from(renovationProjectsTable)
    .where(eq(renovationProjectsTable.id, projectId))
    .limit(1);
  if (!project) {
    return null;
  }

  if (project.ownerUserId === userId) {
    return { project, role: "owner" };
  }

  const [participant] = await db
    .select()
    .from(projectParticipantsTable)
    .where(
      and(
        eq(projectParticipantsTable.projectId, projectId),
        eq(projectParticipantsTable.userId, userId),
        isNotNull(projectParticipantsTable.acceptedAt),
      ),
    )
    .limit(1);

  if (
    participant?.role === "contractor" ||
    participant?.role === "viewer"
  ) {
    return { project, role: participant.role };
  }

  return null;
}

export async function requireProjectAccess(
  res: Response,
  projectId: string,
  userId: string,
  allowedRoles?: readonly ParticipantRole[],
): Promise<ProjectAccess | null> {
  const access = await getProjectAccess(projectId, userId);
  if (!access) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(access.role)) {
    res.status(403).json({ error: "This action is not allowed for your role" });
    return null;
  }
  if (allowedRoles && access.project.archived) {
    res.status(409).json({ error: "Archived projects are read-only" });
    return null;
  }
  return access;
}

export async function recordTimelineEvent(input: {
  projectId: string;
  actorUserId: string;
  actorRole: ParticipantRole;
  action: string;
  detail: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  await db.insert(timelineEventsTable).values({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: input.action,
    detail: input.detail,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
  });
}

export function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}