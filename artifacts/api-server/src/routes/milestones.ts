import { getAuth } from "@clerk/express";
import { and, asc, eq, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateMilestoneBody,
  CreateMilestoneParams,
  CreateMilestoneResponse,
  CreateRevisionRequestBody,
  CreateRevisionRequestParams,
  CreateRevisionRequestResponse,
  DecideMilestoneBody,
  DecideMilestoneParams,
  DecideMilestoneResponse,
  ListMilestonesParams,
  ListMilestonesResponse,
  ListRevisionRequestsParams,
  ListRevisionRequestsResponse,
  ReplyToRevisionBody,
  ReplyToRevisionParams,
  ReplyToRevisionResponse,
  ResolveRevisionParams,
  ResolveRevisionResponse,
  SubmitMilestoneHandoverBody,
  SubmitMilestoneHandoverParams,
  SubmitMilestoneHandoverResponse,
} from "@workspace/api-zod";
import {
  db,
  milestonesTable,
  renovationProjectsTable,
  revisionRequestsTable,
} from "@workspace/db";
import { listProjectMedia, attachProjectMedia } from "../lib/projectMedia";
import {
  formatMilestone,
  formatMilestones,
} from "../lib/renovationFormat";
import {
  recordTimelineEvent,
  requireProjectAccess,
} from "../lib/projectAccess";

const router: IRouter = Router();

function formatRevision(
  revision: typeof revisionRequestsTable.$inferSelect,
  media: Awaited<ReturnType<typeof listProjectMedia>>,
) {
  return {
    id: revision.id,
    milestoneId: revision.milestoneId,
    title: revision.title,
    issueDescription: revision.issueDescription,
    priority: revision.priority,
    status: revision.status,
    response: revision.response,
    media,
    createdAt: revision.createdAt.toISOString(),
  };
}

async function getRevision(revisionId: string) {
  const [revision] = await db
    .select()
    .from(revisionRequestsTable)
    .where(eq(revisionRequestsTable.id, revisionId))
    .limit(1);
  return revision ?? null;
}

async function getMilestone(milestoneId: string) {
  const [milestone] = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.id, milestoneId))
    .limit(1);
  return milestone ?? null;
}

router.get(
  "/projects/:projectId/milestones",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListMilestonesParams.safeParse(req.params);
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
    const milestones = await db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.projectId, access.project.id))
      .orderBy(asc(milestonesTable.plannedCompletionDate));
    res.json(
      ListMilestonesResponse.parse(await formatMilestones(milestones)),
    );
  },
);

router.post(
  "/projects/:projectId/milestones",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = CreateMilestoneParams.safeParse(req.params);
    const body = CreateMilestoneBody.safeParse(req.body);
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
      ["owner", "contractor"],
    );
    if (!access) return;
    const [milestone] = await db
      .insert(milestonesTable)
      .values({
        projectId: access.project.id,
        title: body.data.title,
        description: body.data.description ?? null,
        plannedCompletionDate: body.data.plannedCompletionDate ?? null,
        status: "planned",
      })
      .returning();
    if (access.project.status === "planning") {
      await db
        .update(renovationProjectsTable)
        .set({ status: "in_progress" })
        .where(eq(renovationProjectsTable.id, access.project.id));
    }
    await recordTimelineEvent({
      projectId: access.project.id,
      actorUserId: userId,
      actorRole: access.role,
      action: "milestone.created",
      detail: `Mərhələ əlavə edildi: ${milestone.title}`,
      entityType: "milestone",
      entityId: milestone.id,
    });
    res.status(201).json(
      CreateMilestoneResponse.parse(await formatMilestone(milestone)),
    );
  },
);

router.post(
  "/milestones/:milestoneId/handover",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = SubmitMilestoneHandoverParams.safeParse(req.params);
    const body = SubmitMilestoneHandoverBody.safeParse(req.body);
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
    if (!/^[0-9a-f-]{36}$/i.test(params.data.milestoneId)) {
      res.status(400).json({ error: "Invalid milestone ID" });
      return;
    }
    const milestone = await getMilestone(params.data.milestoneId);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      milestone.projectId,
      userId,
      ["contractor"],
    );
    if (!access) return;
    if (
      milestone.status === "accepted" ||
      milestone.status === "submitted_for_handover"
    ) {
      res.status(409).json({ error: "This milestone cannot be submitted now" });
      return;
    }
    try {
      await attachProjectMedia({
        projectId: milestone.projectId,
        entityType: "milestone",
        entityId: milestone.id,
        userId,
        media: body.data.media,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid evidence file",
      });
      return;
    }
    const [updated] = await db
      .update(milestonesTable)
      .set({
        status: "submitted_for_handover",
        note: body.data.note ?? null,
      })
      .where(eq(milestonesTable.id, milestone.id))
      .returning();
    await recordTimelineEvent({
      projectId: milestone.projectId,
      actorUserId: userId,
      actorRole: access.role,
      action: "milestone.handover_submitted",
      detail: `Təhvil təqdim edildi: ${milestone.title}`,
      entityType: "milestone",
      entityId: milestone.id,
    });
    res.json(
      SubmitMilestoneHandoverResponse.parse(await formatMilestone(updated)),
    );
  },
);

router.post(
  "/milestones/:milestoneId/decision",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = DecideMilestoneParams.safeParse(req.params);
    const body = DecideMilestoneBody.safeParse(req.body);
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
    if (!/^[0-9a-f-]{36}$/i.test(params.data.milestoneId)) {
      res.status(400).json({ error: "Invalid milestone ID" });
      return;
    }
    const milestone = await getMilestone(params.data.milestoneId);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      milestone.projectId,
      userId,
      ["owner"],
    );
    if (!access) return;
    if (milestone.status !== "submitted_for_handover") {
      res.status(409).json({ error: "This milestone is not awaiting review" });
      return;
    }
    if (
      body.data.decision === "revise" &&
      !body.data.revisionTitle?.trim()
    ) {
      res.status(400).json({
        error: "Add a short title for the requested revision",
      });
      return;
    }

    const accepted = body.data.decision === "accept";
    if (accepted) {
      const [unresolved] = await db.select({ id: revisionRequestsTable.id })
        .from(revisionRequestsTable).where(and(
          eq(revisionRequestsTable.milestoneId, milestone.id),
          ne(revisionRequestsTable.status, "resolved"),
        )).limit(1);
      if (unresolved) {
        res.status(409).json({ error: "Resolve all revision requests before accepting handover" });
        return;
      }
    }
    const [updated] = await db
      .update(milestonesTable)
      .set({
        status: accepted ? "accepted" : "revision_requested",
        note: body.data.note ?? milestone.note,
        acceptedAt: accepted ? new Date() : null,
      })
      .where(eq(milestonesTable.id, milestone.id))
      .returning();
    if (!accepted) {
      const [revision] = await db
        .insert(revisionRequestsTable)
        .values({
          projectId: milestone.projectId,
          milestoneId: milestone.id,
          title: body.data.revisionTitle!,
          issueDescription:
            body.data.note?.trim() ||
            "Please review the handover and add details for the requested change.",
          priority: body.data.priority ?? "normal",
          status: "open",
          createdBy: userId,
        })
        .returning();
      void revision;
    }
    const remaining = await db
      .select({ status: milestonesTable.status })
      .from(milestonesTable)
      .where(eq(milestonesTable.projectId, milestone.projectId));
    const allAccepted =
      remaining.length > 0 &&
      remaining.every((item) => item.status === "accepted");
    await db
      .update(renovationProjectsTable)
      .set({ status: allAccepted ? "complete" : "in_progress" })
      .where(eq(renovationProjectsTable.id, milestone.projectId));
    await recordTimelineEvent({
      projectId: milestone.projectId,
      actorUserId: userId,
      actorRole: access.role,
      action: accepted ? "milestone.accepted" : "milestone.revision_requested",
      detail: accepted
        ? `Mərhələ qəbul edildi: ${milestone.title}`
        : `Düzəliş istənildi: ${milestone.title}`,
      entityType: "milestone",
      entityId: milestone.id,
    });
    res.json(
      DecideMilestoneResponse.parse(await formatMilestone(updated)),
    );
  },
);

router.get(
  "/milestones/:milestoneId/revisions",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListRevisionRequestsParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(params.data.milestoneId)) {
      res.status(400).json({ error: "Invalid milestone ID" });
      return;
    }
    const milestone = await getMilestone(params.data.milestoneId);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      milestone.projectId,
      userId,
    );
    if (!access) return;
    const revisions = await db
      .select()
      .from(revisionRequestsTable)
      .where(eq(revisionRequestsTable.milestoneId, milestone.id));
    const formatted = await Promise.all(
      revisions.map(async (revision) =>
        formatRevision(
          revision,
          await listProjectMedia("revision", revision.id),
        ),
      ),
    );
    res.json(ListRevisionRequestsResponse.parse(formatted));
  },
);

router.post(
  "/milestones/:milestoneId/revisions",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = CreateRevisionRequestParams.safeParse(req.params);
    const body = CreateRevisionRequestBody.safeParse(req.body);
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
    if (!/^[0-9a-f-]{36}$/i.test(params.data.milestoneId)) {
      res.status(400).json({ error: "Invalid milestone ID" });
      return;
    }
    const milestone = await getMilestone(params.data.milestoneId);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      milestone.projectId,
      userId,
      ["owner"],
    );
    if (!access) return;
    const [revision] = await db
      .insert(revisionRequestsTable)
      .values({
        projectId: milestone.projectId,
        milestoneId: milestone.id,
        title: body.data.title,
        issueDescription: body.data.issueDescription,
        priority: body.data.priority,
        status: "open",
        createdBy: userId,
      })
      .returning();
    try {
      await attachProjectMedia({
        projectId: milestone.projectId,
        entityType: "revision",
        entityId: revision.id,
        userId,
        media: body.data.media ?? [],
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid evidence file",
      });
      return;
    }
    await db
      .update(milestonesTable)
      .set({ status: "revision_requested" })
      .where(eq(milestonesTable.id, milestone.id));
    await recordTimelineEvent({
      projectId: milestone.projectId,
      actorUserId: userId,
      actorRole: access.role,
      action: "revision.created",
      detail: `Düzəliş tələbi: ${body.data.title}`,
      entityType: "revision",
      entityId: revision.id,
    });
    res.status(201).json(
      CreateRevisionRequestResponse.parse(
        formatRevision(revision, await listProjectMedia("revision", revision.id)),
      ),
    );
  },
);

router.post(
  "/revisions/:revisionId/reply",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ReplyToRevisionParams.safeParse(req.params);
    const body = ReplyToRevisionBody.safeParse(req.body);
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
    if (!/^[0-9a-f-]{36}$/i.test(params.data.revisionId)) {
      res.status(400).json({ error: "Invalid revision ID" });
      return;
    }
    const revision = await getRevision(params.data.revisionId);
    if (!revision) {
      res.status(404).json({ error: "Revision request not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      revision.projectId,
      userId,
      ["contractor"],
    );
    if (!access) return;
    if (revision.status === "resolved") {
      res.status(409).json({ error: "This revision is already resolved" });
      return;
    }
    try {
      await attachProjectMedia({
        projectId: revision.projectId,
        entityType: "revision",
        entityId: revision.id,
        userId,
        media: body.data.media ?? [],
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid evidence file",
      });
      return;
    }
    const [updated] = await db
      .update(revisionRequestsTable)
      .set({ response: body.data.response, status: "contractor_replied" })
      .where(eq(revisionRequestsTable.id, revision.id))
      .returning();
    await recordTimelineEvent({
      projectId: revision.projectId,
      actorUserId: userId,
      actorRole: access.role,
      action: "revision.replied",
      detail: `Cavab verildi: ${revision.title}`,
      entityType: "revision",
      entityId: revision.id,
    });
    res.json(
      ReplyToRevisionResponse.parse(
        formatRevision(updated, await listProjectMedia("revision", revision.id)),
      ),
    );
  },
);

router.post(
  "/revisions/:revisionId/resolve",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ResolveRevisionParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(params.data.revisionId)) {
      res.status(400).json({ error: "Invalid revision ID" });
      return;
    }
    const revision = await getRevision(params.data.revisionId);
    if (!revision) {
      res.status(404).json({ error: "Revision request not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      revision.projectId,
      userId,
      ["owner"],
    );
    if (!access) return;
    const [updated] = await db
      .update(revisionRequestsTable)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(revisionRequestsTable.id, revision.id))
      .returning();
    await db
      .update(milestonesTable)
      .set({ status: "in_progress" })
      .where(eq(milestonesTable.id, revision.milestoneId));
    await recordTimelineEvent({
      projectId: revision.projectId,
      actorUserId: userId,
      actorRole: access.role,
      action: "revision.resolved",
      detail: `Düzəliş bağlandı: ${revision.title}`,
      entityType: "revision",
      entityId: revision.id,
    });
    res.json(
      ResolveRevisionResponse.parse(
        formatRevision(updated, await listProjectMedia("revision", revision.id)),
      ),
    );
  },
);

export default router;