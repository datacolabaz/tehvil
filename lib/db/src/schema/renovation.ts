import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const renovationProjectsTable = pgTable(
  "renovation_projects",
  {
    id: id(),
    ownerUserId: text("owner_user_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    propertyType: varchar("property_type", { length: 40 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    projectType: varchar("project_type", { length: 40 }).notNull(),
    plannedStartDate: date("planned_start_date", { mode: "string" }),
    plannedCompletionDate: date("planned_completion_date", { mode: "string" }),
    budget: numeric("budget", { precision: 14, scale: 2, mode: "number" }),
    status: varchar("status", { length: 32 }).notNull().default("planning"),
    scopeVersion: integer("scope_version").notNull().default(1),
    scopeStatus: varchar("scope_status", { length: 32 }).notNull().default("draft"),
    ownerScopeApprovedAt: timestamp("owner_scope_approved_at", {
      withTimezone: true,
    }),
    contractorScopeApprovedAt: timestamp("contractor_scope_approved_at", {
      withTimezone: true,
    }),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("renovation_projects_owner_idx").on(table.ownerUserId)],
);

export const projectParticipantsTable = pgTable(
  "project_participants",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    invitedName: varchar("invited_name", { length: 120 }).notNull(),
    contact: varchar("contact", { length: 254 }).notNull(),
    role: varchar("role", { length: 24 }).notNull(),
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("project_participants_user_idx").on(table.userId),
    index("project_participants_project_idx").on(table.projectId),
    uniqueIndex("project_participants_invite_token_idx").on(
      table.inviteTokenHash,
    ),
    uniqueIndex("project_participants_project_user_idx").on(table.projectId, table.userId),
    uniqueIndex("project_participants_contractor_idx").on(table.projectId)
      .where(sql`${table.role} = 'contractor' AND ${table.acceptedAt} IS NOT NULL`),
  ],
);

export const renovationRoomsTable = pgTable(
  "renovation_rooms",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("renovation_rooms_project_idx").on(table.projectId)],
);

export const scopeItemsTable = pgTable(
  "scope_items",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => renovationRoomsTable.id, {
      onDelete: "set null",
    }),
    scopeVersion: integer("scope_version").notNull().default(1),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    inclusionType: varchar("inclusion_type", { length: 20 }).notNull(),
    materialResponsibility: varchar("material_responsibility", {
      length: 24,
    }).notNull(),
    laborAmount: numeric("labor_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    materialEstimate: numeric("material_estimate", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    warrantyMonths: integer("warranty_months"),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("scope_items_project_version_idx").on(table.projectId, table.scopeVersion)],
);

export const changeOrdersTable = pgTable(
  "change_orders",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => renovationRoomsTable.id, {
      onDelete: "set null",
    }),
    number: integer("number").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    description: text("description"),
    laborAmount: numeric("labor_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    materialAmount: numeric("material_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    scheduleImpactDays: integer("schedule_impact_days").notNull().default(0),
    newCompletionDate: date("new_completion_date", { mode: "string" }),
    status: varchar("status", { length: 32 }).notNull().default("submitted"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionComment: text("decision_comment"),
  },
  (table) => [
    index("change_orders_project_idx").on(table.projectId),
    uniqueIndex("change_orders_project_number_idx").on(
      table.projectId,
      table.number,
    ),
  ],
);

export const milestonesTable = pgTable(
  "renovation_milestones",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description"),
    plannedCompletionDate: date("planned_completion_date", { mode: "string" }),
    status: varchar("status", { length: 32 }).notNull().default("planned"),
    note: text("note"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("renovation_milestones_project_idx").on(table.projectId)],
);

export const revisionRequestsTable = pgTable(
  "revision_requests",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestonesTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    issueDescription: varchar("issue_description", { length: 1500 }).notNull(),
    priority: varchar("priority", { length: 16 }).notNull().default("normal"),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    response: text("response"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("revision_requests_project_idx").on(table.projectId),
    index("revision_requests_milestone_idx").on(table.milestoneId),
  ],
);

export const passportSharesTable = pgTable("passport_shares", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  includeFinancial: boolean("include_financial").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const evidenceUploadsTable = pgTable("evidence_uploads", {
  objectPath: text("object_path").primaryKey(),
  userId: text("user_id").notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 120 }).notNull(),
  size: integer("size").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attachedAt: timestamp("attached_at", { withTimezone: true }),
});

export const projectMediaTable = pgTable(
  "project_media",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 24 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    objectPath: text("object_path").notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    size: integer("size").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("project_media_entity_idx").on(table.entityType, table.entityId),
    index("project_media_project_idx").on(table.projectId),
    uniqueIndex("project_media_object_path_idx").on(table.objectPath),
  ],
);

export const projectPaymentsTable = pgTable(
  "project_payments",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("AZN"),
    dueCondition: varchar("due_condition", { length: 250 }),
    dueDate: date("due_date", { mode: "string" }),
    status: varchar("status", { length: 32 }).notNull().default("planned"),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdAt: createdAt(),
  },
  (table) => [index("project_payments_project_idx").on(table.projectId)],
);

export const timelineEventsTable = pgTable(
  "renovation_timeline_events",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => renovationProjectsTable.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").notNull(),
    actorRole: varchar("actor_role", { length: 24 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    detail: text("detail").notNull(),
    entityType: varchar("entity_type", { length: 40 }),
    entityId: uuid("entity_id"),
    createdAt: createdAt(),
  },
  (table) => [index("renovation_timeline_project_idx").on(table.projectId, table.createdAt)],
);

export type RenovationProject = typeof renovationProjectsTable.$inferSelect;
export type ProjectParticipant = typeof projectParticipantsTable.$inferSelect;
export type RenovationRoom = typeof renovationRoomsTable.$inferSelect;
export type ScopeItemRecord = typeof scopeItemsTable.$inferSelect;
export type ChangeOrderRecord = typeof changeOrdersTable.$inferSelect;
export type MilestoneRecord = typeof milestonesTable.$inferSelect;
export type RevisionRequestRecord = typeof revisionRequestsTable.$inferSelect;
export type ProjectMedia = typeof projectMediaTable.$inferSelect;
export type ProjectPayment = typeof projectPaymentsTable.$inferSelect;
export type TimelineEventRecord = typeof timelineEventsTable.$inferSelect;