import { and, desc, eq, max } from "drizzle-orm";
import {
  changeOrdersTable, db, milestonesTable, projectPaymentsTable,
  renovationRoomsTable, scopeItemsTable, timelineEventsTable, type RenovationProject,
} from "@workspace/db";
import { formatChangeOrders, formatMilestones, formatPayment, formatProject, formatScopeItems, formatTimelineEvents } from "./renovationFormat";
import type { ParticipantRole } from "./projectAccess";

export async function buildPassport(project: RenovationProject, role: ParticipantRole) {
  const [approved] = await db.select({ version: max(scopeItemsTable.scopeVersion) })
    .from(scopeItemsTable).where(and(eq(scopeItemsTable.projectId, project.id), eq(scopeItemsTable.status, "active")));
  const version = approved?.version ?? project.scopeVersion;
  const [rooms, scopeItems, changeOrders, milestones, payments, timeline] = await Promise.all([
    db.select().from(renovationRoomsTable).where(eq(renovationRoomsTable.projectId, project.id)),
    db.select().from(scopeItemsTable).where(and(eq(scopeItemsTable.projectId, project.id), eq(scopeItemsTable.scopeVersion, version))),
    db.select().from(changeOrdersTable).where(eq(changeOrdersTable.projectId, project.id)),
    db.select().from(milestonesTable).where(eq(milestonesTable.projectId, project.id)),
    db.select().from(projectPaymentsTable).where(eq(projectPaymentsTable.projectId, project.id)),
    db.select().from(timelineEventsTable).where(eq(timelineEventsTable.projectId, project.id)).orderBy(desc(timelineEventsTable.createdAt)),
  ]);
  return {
    project: { ...await formatProject(project, role), scopeVersion: version },
    rooms: rooms.map(room => ({ id: room.id, projectId: room.projectId, name: room.name, itemCount: scopeItems.filter(item => item.roomId === room.id).length })),
    scopeItems: await formatScopeItems(scopeItems),
    changeOrders: await formatChangeOrders(changeOrders),
    milestones: await formatMilestones(milestones),
    payments: await Promise.all(payments.map(formatPayment)),
    timeline: formatTimelineEvents(timeline),
    disclaimer: "Bu sənəd Təhvil platformasında saxlanılan layihə qeydlərinin xülasəsidir. Hüquqi müqavilə, texniki ekspertiza və ya dövlət tərəfindən verilmiş sənəd deyil. Platformadaxili təsdiqlər hüquqi elektron imza deyil.",
  };
}