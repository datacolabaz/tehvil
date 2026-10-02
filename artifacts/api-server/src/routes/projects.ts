import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateProjectBody,
  CreateProjectResponse,
  GetProjectDashboardParams,
  GetProjectDashboardResponse,
  ListProjectsResponse,
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
  formatMilestones,
  formatProject,
  formatTimelineEvents,
} from "../lib/renovationFormat";
import {
  recordTimelineEvent,
  requireProjectAccess,
  type ParticipantRole,
} from "../lib/projectAccess";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [owned, memberships] = await Promise.all([
    db
      .select()
      .from(renovationProjectsTable)
      .where(eq(renovationProjectsTable.ownerUserId, userId)),
    db
      .select({
        projectId: projectParticipantsTable.projectId,
        role: projectParticipantsTable.role,
      })
      .from(projectParticipantsTable)
      .where(
        and(
          eq(projectParticipantsTable.userId, userId),
          isNotNull(projectParticipantsTable.acceptedAt),
        ),
      ),
  ]);

  const ownerIds = new Set(owned.map((project) => project.id));
  const roleByProject = new Map<string, ParticipantRole>();
  for (const membership of memberships) {
    if (
      !ownerIds.has(membership.projectId) &&
      (membership.role === "contractor" || membership.role === "viewer")
    ) {
      roleByProject.set(membership.projectId, membership.role);
    }
  }

  const sharedIds = [...roleByProject.keys()].filter((id) => !ownerIds.has(id));
  const shared = sharedIds.length
    ? await db
        .select()
        .from(renovationProjectsTable)
        .where(inArray(renovationProjectsTable.id, sharedIds))
    : [];

  const projects = [
    ...owned.map((project) => ({ project, role: "owner" as const })),
    ...shared.map((project) => ({
      project,
      role: roleByProject.get(project.id) ?? "viewer",
    })),
  ];
  const result = await Promise.all(
    projects.map(({ project, role }) => formatProject(project, role)),
  );
  res.json(ListProjectsResponse.parse(result));
});

router.post("/projects", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .insert(renovationProjectsTable)
    .values({
      ownerUserId: userId,
      name: parsed.data.name,
      propertyType: parsed.data.propertyType,
      city: parsed.data.city,
      projectType: parsed.data.projectType,
      plannedStartDate: parsed.data.plannedStartDate ?? null,
      plannedCompletionDate: parsed.data.plannedCompletionDate ?? null,
      budget: parsed.data.budget ?? null,
    })
    .returning();

  await recordTimelineEvent({
    projectId: project.id,
    actorUserId: userId,
    actorRole: "owner",
    action: "project.created",
    detail: `Layihə yaradıldı: ${project.name}`,
    entityType: "project",
    entityId: project.id,
  });
  res
    .status(201)
    .json(
      CreateProjectResponse.parse(await formatProject(project, "owner")),
    );
});

router.get(
  "/projects/:projectId/dashboard",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const params = GetProjectDashboardParams.safeParse(req.params);
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

    const projectId = access.project.id;
    const [
      rooms,
      scopeItems,
      changeOrders,
      milestones,
      payments,
      timeline,
    ] = await Promise.all([
      db
        .select()
        .from(renovationRoomsTable)
        .where(eq(renovationRoomsTable.projectId, projectId)),
      db
        .select()
        .from(scopeItemsTable)
        .where(eq(scopeItemsTable.projectId, projectId)),
      db
        .select()
        .from(changeOrdersTable)
        .where(eq(changeOrdersTable.projectId, projectId)),
      db
        .select()
        .from(milestonesTable)
        .where(eq(milestonesTable.projectId, projectId)),
      db
        .select()
        .from(projectPaymentsTable)
        .where(eq(projectPaymentsTable.projectId, projectId)),
      db
        .select()
        .from(timelineEventsTable)
        .where(eq(timelineEventsTable.projectId, projectId))
        .orderBy(desc(timelineEventsTable.createdAt))
        .limit(5),
    ]);

    const actionItems: Array<{
      id: string;
      label: string;
      detail: string;
      kind: "change" | "handover" | "payment" | "scope";
      href: string;
    }> = [];

    for (const change of changeOrders) {
      if (
        (change.status === "submitted" || change.status === "needs_clarification") &&
        change.createdBy !== userId
      ) {
        actionItems.push({
          id: change.id,
          label: "Dəyişiklik sifarişinə baxın",
          detail: change.title,
          kind: "change",
          href: `/projects/${projectId}/changes`,
        });
      }
    }
    for (const milestone of milestones) {
      if (
        milestone.status === "submitted_for_handover" &&
        access.role !== "contractor"
      ) {
        actionItems.push({
          id: milestone.id,
          label: "Mərhələ təhvilini yoxlayın",
          detail: milestone.title,
          kind: "handover",
          href: `/projects/${projectId}/milestones`,
        });
      }
    }
    for (const payment of payments) {
      if (
        payment.status === "marked_sent" &&
        access.role === "contractor"
      ) {
        actionItems.push({
          id: payment.id,
          label: "Ödənişin daxil olmasını təsdiqləyin",
          detail: payment.title,
          kind: "payment",
          href: `/projects/${projectId}/payments`,
        });
      }
    }
    const scopeApprovalPending =
      access.project.scopeStatus === "pending_approval" &&
      ((access.role === "owner" && !access.project.ownerScopeApprovedAt) ||
        (access.role === "contractor" &&
          !access.project.contractorScopeApprovedAt));
    if (scopeApprovalPending) {
      actionItems.push({
        id: `${projectId}-scope-${access.project.scopeVersion}`,
        label: "İş həcmini təsdiqləyin",
        detail: `Versiya ${access.project.scopeVersion}`,
        kind: "scope",
        href: `/projects/${projectId}/scope`,
      });
    }

    const nextPayment = payments
      .filter((payment) => payment.status === "planned" || payment.status === "due")
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
    const formattedProject = await formatProject(access.project, access.role);
    const response = {
      project: formattedProject,
      roomCount: rooms.length,
      includedCount: scopeItems.filter(
        (item) => item.inclusionType === "included",
      ).length,
      excludedCount: scopeItems.filter(
        (item) => item.inclusionType === "excluded",
      ).length,
      pendingChanges: changeOrders.filter(
        (item) =>
          item.status === "submitted" || item.status === "needs_clarification",
      ).length,
      awaitingHandover: milestones.filter(
        (item) => item.status === "submitted_for_handover",
      ).length,
      nextPayment: nextPayment ? Number(nextPayment.amount) : null,
      actionItems,
      milestones: await formatMilestones(milestones),
      recentActivity: formatTimelineEvents(timeline),
    };
    res.json(GetProjectDashboardResponse.parse(response));
  },
);

export default router;