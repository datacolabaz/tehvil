import { and, eq } from "drizzle-orm";
import {
  changeOrdersTable,
  db,
  milestonesTable,
  projectParticipantsTable,
  renovationProjectsTable,
  renovationRoomsTable,
  type ChangeOrderRecord,
  type MilestoneRecord,
  type RenovationProject,
  type ScopeItemRecord,
  type TimelineEventRecord,
} from "@workspace/db";
import { listProjectMedia } from "./projectMedia";
import type { ParticipantRole } from "./projectAccess";

export async function formatProject(
  project: RenovationProject,
  participantRole: ParticipantRole,
) {
  const [contractor] = await db
    .select({ name: projectParticipantsTable.invitedName })
    .from(projectParticipantsTable)
    .where(
      and(
        eq(projectParticipantsTable.projectId, project.id),
        eq(projectParticipantsTable.role, "contractor"),
      ),
    )
    .limit(1);

  const approvedOrders = await db
    .select({
      laborAmount: changeOrdersTable.laborAmount,
      materialAmount: changeOrdersTable.materialAmount,
    })
    .from(changeOrdersTable)
    .where(
      and(
        eq(changeOrdersTable.projectId, project.id),
        eq(changeOrdersTable.status, "approved"),
      ),
    );
  const milestoneRows = await db
    .select({ status: milestonesTable.status })
    .from(milestonesTable)
    .where(eq(milestonesTable.projectId, project.id));
  const acceptedMilestones = milestoneRows.filter(
    (milestone) => milestone.status === "accepted",
  ).length;
  const approvedTotal = approvedOrders.reduce((sum, item) => {
    return sum + Number(item.laborAmount) + Number(item.materialAmount);
  }, 0);

  return {
    id: project.id,
    name: project.name,
    propertyType: project.propertyType,
    city: project.city,
    projectType: project.projectType,
    plannedStartDate: project.plannedStartDate,
    plannedCompletionDate: project.plannedCompletionDate,
    budget: project.budget,
    approvedBudget: Number(project.budget ?? 0) + approvedTotal,
    approvedChanges: approvedTotal,
    progress:
      milestoneRows.length === 0
        ? 0
        : Math.round((acceptedMilestones / milestoneRows.length) * 100),
    status: project.status,
    scopeVersion: project.scopeVersion,
    scopeStatus: project.scopeStatus,
    archived: project.archived,
    participantRole,
    contractorName: contractor?.name ?? null,
    createdAt: project.createdAt.toISOString(),
  };
}

export async function formatScopeItem(item: ScopeItemRecord) {
  let roomName: string | null = null;
  if (item.roomId) {
    const [room] = await db
      .select({ name: renovationRoomsTable.name })
      .from(renovationRoomsTable)
      .where(eq(renovationRoomsTable.id, item.roomId))
      .limit(1);
    roomName = room?.name ?? null;
  }

  return {
    id: item.id,
    projectId: item.projectId,
    roomId: item.roomId,
    roomName,
    title: item.title,
    description: item.description,
    inclusionType: item.inclusionType,
    materialResponsibility: item.materialResponsibility,
    laborAmount: item.laborAmount,
    materialEstimate: item.materialEstimate,
    warrantyMonths: item.warrantyMonths,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function formatChangeOrder(item: ChangeOrderRecord) {
  let roomName: string | null = null;
  if (item.roomId) {
    const [room] = await db
      .select({ name: renovationRoomsTable.name })
      .from(renovationRoomsTable)
      .where(eq(renovationRoomsTable.id, item.roomId))
      .limit(1);
    roomName = room?.name ?? null;
  }

  return {
    id: item.id,
    projectId: item.projectId,
    number: item.number,
    roomName,
    title: item.title,
    reason: item.reason,
    description: item.description,
    laborAmount: Number(item.laborAmount),
    materialAmount: Number(item.materialAmount),
    totalAmount: Number(item.laborAmount) + Number(item.materialAmount),
    scheduleImpactDays: item.scheduleImpactDays,
    newCompletionDate: item.newCompletionDate,
    status: item.status,
    createdBy: item.createdBy,
    createdAt: item.createdAt.toISOString(),
    decisionComment: item.decisionComment,
  };
}

export async function formatMilestone(item: MilestoneRecord) {
  return {
    id: item.id,
    projectId: item.projectId,
    title: item.title,
    description: item.description,
    plannedCompletionDate: item.plannedCompletionDate,
    status: item.status,
    note: item.note,
    media: await listProjectMedia("milestone", item.id),
    acceptedAt: item.acceptedAt?.toISOString() ?? null,
  };
}

export function formatTimeline(item: TimelineEventRecord) {
  return {
    id: item.id,
    projectId: item.projectId,
    action: item.action,
    detail: item.detail,
    actorRole: item.actorRole,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function getProjectById(projectId: string) {
  const [project] = await db
    .select()
    .from(renovationProjectsTable)
    .where(eq(renovationProjectsTable.id, projectId))
    .limit(1);
  return project ?? null;
}

export async function formatPayment(item: {
  id: string;
  projectId: string;
  title: string;
  amount: number;
  currency: string;
  dueCondition: string | null;
  dueDate: string | null;
  status: string;
  note: string | null;
  updatedAt: Date;
}) {
  return {
    ...item,
    media: await listProjectMedia("payment", item.id),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function formatMilestones(items: MilestoneRecord[]) {
  return Promise.all(items.map(formatMilestone));
}

export async function formatScopeItems(items: ScopeItemRecord[]) {
  return Promise.all(items.map(formatScopeItem));
}

export async function formatChangeOrders(items: ChangeOrderRecord[]) {
  return Promise.all(items.map(formatChangeOrder));
}

export function formatTimelineEvents(items: TimelineEventRecord[]) {
  return items.map(formatTimeline);
}

export async function currentMilestones(projectId: string) {
  const items = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.projectId, projectId));
  return formatMilestones(items);
}