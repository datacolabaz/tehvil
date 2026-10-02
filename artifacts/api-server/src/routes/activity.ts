import { createHash, randomBytes } from "node:crypto";
import { getAuth } from "@clerk/express";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  AcceptInvitationBody,
  AcceptInvitationResponse,
  CreateInvitationBody,
  CreateInvitationParams,
  CreateInvitationResponse,
  GetRenovationPassportParams,
  GetRenovationPassportResponse,
  ListTimelineParams,
  ListTimelineResponse,
} from "@workspace/api-zod";
import {
  changeOrdersTable,
  db,
  milestonesTable,
  projectParticipantsTable,
  projectPaymentsTable,
  renovationProjectsTable,
  renovationRoomsTable,
  scopeItemsTable,
  timelineEventsTable,
} from "@workspace/db";
import {
  formatChangeOrders,
  formatMilestones,
  formatProject,
  formatScopeItems,
  formatTimelineEvents,
} from "../lib/renovationFormat";
import {
  recordTimelineEvent,
  requireProjectAccess,
} from "../lib/projectAccess";
import { formatPayment } from "../lib/renovationFormat";
import { buildPassport } from "../lib/passport";

const router: IRouter = Router();

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getPublicOrigin(req: Request): string {
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || req.get("host") || "localhost";
  const protocol = forwardedProto || req.protocol || "https";
  return `${protocol}://${host}`;
}

router.get(
  "/projects/:projectId/timeline",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListTimelineParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
    );
    if (!access) return;
    const events = await db
      .select()
      .from(timelineEventsTable)
      .where(eq(timelineEventsTable.projectId, access.project.id))
      .orderBy(desc(timelineEventsTable.createdAt));
    res.json(ListTimelineResponse.parse(formatTimelineEvents(events)));
  },
);

router.post(
  "/projects/:projectId/invitations",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = CreateInvitationParams.safeParse(req.params);
    const body = CreateInvitationBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success ? params.error.message : body.error?.message ?? "Invalid request",
      });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
      ["owner"],
    );
    if (!access) return;

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [invitation] = await db
      .insert(projectParticipantsTable)
      .values({
        projectId: access.project.id,
        invitedName: body.data.name,
        contact: body.data.contact,
        role: body.data.role,
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: expiresAt,
      })
      .returning();
    const inviteUrl = new URL(
      "/invites/accept",
      getPublicOrigin(req),
    );
    inviteUrl.searchParams.set("token", token);
    await recordTimelineEvent({
      projectId: access.project.id,
      actorUserId: userId,
      actorRole: access.role,
      action: "participant.invited",
      detail: `${body.data.name} üçün ${body.data.role} dəvəti yaradıldı`,
      entityType: "participant",
      entityId: invitation.id,
    });
    res.status(201).json(
      CreateInvitationResponse.parse({
        id: invitation.id,
        projectId: invitation.projectId,
        inviteUrl: inviteUrl.toString(),
        role: invitation.role,
        expiresAt: expiresAt.toISOString(),
      }),
    );
  },
);

router.post(
  "/invitations/accept",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const body = AcceptInvitationBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [invitation] = await db
      .select()
      .from(projectParticipantsTable)
      .where(
        and(
          eq(
            projectParticipantsTable.inviteTokenHash,
            hashInviteToken(body.data.token),
          ),
          isNull(projectParticipantsTable.acceptedAt),
          gt(projectParticipantsTable.inviteExpiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!invitation) {
      res.status(404).json({ error: "Invitation is invalid or has expired" });
      return;
    }
    const [invitedProject] = await db.select().from(renovationProjectsTable)
      .where(eq(renovationProjectsTable.id, invitation.projectId)).limit(1);
    if (!invitedProject || invitedProject.ownerUserId === userId) {
      res.status(409).json({ error: "You already own this project" });
      return;
    }
    const [existing] = await db
      .select({ id: projectParticipantsTable.id })
      .from(projectParticipantsTable)
      .where(
        and(
          eq(projectParticipantsTable.projectId, invitation.projectId),
          eq(projectParticipantsTable.userId, userId),
          isNull(projectParticipantsTable.inviteTokenHash),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "You already have access to this project" });
      return;
    }
    const [accepted] = await db
      .update(projectParticipantsTable)
      .set({
        userId,
        acceptedAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      })
      .where(and(
        eq(projectParticipantsTable.id, invitation.id),
        eq(projectParticipantsTable.inviteTokenHash, hashInviteToken(body.data.token)),
        isNull(projectParticipantsTable.acceptedAt),
        gt(projectParticipantsTable.inviteExpiresAt, new Date()),
      ))
      .returning();
    if (!accepted) {
      res.status(409).json({ error: "Invitation has already been accepted" });
      return;
    }
    const [project] = await db
      .select()
      .from(renovationProjectsTable)
      .where(eq(renovationProjectsTable.id, invitation.projectId))
      .limit(1);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await recordTimelineEvent({
      projectId: project.id,
      actorUserId: userId,
      actorRole: accepted.role as "contractor" | "viewer",
      action: "participant.joined",
      detail: `${accepted.invitedName} layihəyə qoşuldu`,
      entityType: "participant",
      entityId: accepted.id,
    });
    res.json(
      AcceptInvitationResponse.parse(
        await formatProject(project, accepted.role as "contractor" | "viewer"),
      ),
    );
  },
);

router.get(
  "/projects/:projectId/passport",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = GetRenovationPassportParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
    );
    if (!access) return;
    const formatted = await buildPassport(access.project, access.role);
    res.json(GetRenovationPassportResponse.parse(formatted));
  },
);

export default router;