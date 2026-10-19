import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/*
 * Digital home passport ("Evin rəqəmsal pasportu").
 *
 * Three core objects:
 *   home (homesTable)            — the centre of all data and history
 *   work record (workRecordsTable) — one concrete construction / repair / installation / service job
 *   performer (workersTable)     — an individual tradesperson, an informal team (briqada) or a company
 *
 * Who did what is stored per work in work_participants (worker + role in that job).
 * Team membership (worker_memberships) never implies participation in a job.
 * Every row here is additive: no existing table is changed.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const user = (name: string) => varchar(name, { length: 128 });

export interface MarkerPointJson { x: number; y: number }
export interface ShareScopeJson {
  roomIds: string[];
  workIds: string[];
  equipmentIds: string[];
  includePhotos: boolean;
  includeInfrastructure: boolean;
}

/* ------------------------------------------------------------------ homes */

export const homesTable = pgTable("homes", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stable QR identifier; it opens only what the owner made public. Never a secret. */
  publicId: varchar("public_id", { length: 16 }).notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  propertyType: varchar("property_type", { length: 24 }).notNull(), // apartment | house | villa | office | commercial | other
  city: varchar("city", { length: 100 }).notNull().default(""),
  district: varchar("district", { length: 120 }).notNull().default(""),
  address: varchar("address", { length: 240 }).notNull().default(""),
  areaM2: integer("area_m2"),
  roomCount: integer("room_count"),
  floor: varchar("floor", { length: 20 }).notNull().default(""),
  builtYear: integer("built_year"),
  /** construction | renovation | living */
  stage: varchar("stage", { length: 16 }).notNull().default("living"),
  coverMediaId: uuid("cover_media_id"),
  notes: text("notes").notNull().default(""),
  /** QR page: off | basic | history */
  publicLevel: varchar("public_level", { length: 12 }).notNull().default("basic"),
  publicShowAddress: boolean("public_show_address").notNull().default(false),
  publicShowPhotos: boolean("public_show_photos").notNull().default(false),
  publicShowEquipment: boolean("public_show_equipment").notNull().default(false),
  /** Whether confirmed works here may appear (without address) on performers' public profiles. */
  showOnWorkerProfiles: boolean("show_on_worker_profiles").notNull().default(true),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("homes_public_id_idx").on(t.publicId), index("homes_creator_idx").on(t.createdByUserId)]);

/** Account-level access to a home. Performers get access per work, not here. */
export const homeMembersTable = pgTable("home_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  userId: user("user_id").notNull(),
  role: varchar("role", { length: 16 }).notNull(), // owner | member | contributor | viewer (legacy: technician = contributor)
  displayName: varchar("display_name", { length: 120 }).notNull().default(""),
  addedByUserId: user("added_by_user_id"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("home_members_home_user_idx").on(t.homeId, t.userId), index("home_members_user_idx").on(t.userId)]);

export const homeRoomsTable = pgTable("home_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  kind: varchar("kind", { length: 24 }).notNull().default("other"), // living | bedroom | kitchen | bathroom | toilet | hall | balcony | utility | other
  floor: varchar("floor", { length: 20 }).notNull().default(""),
  areaM2: integer("area_m2"),
  condition: varchar("condition", { length: 16 }).notNull().default("unknown"), // good | needs_repair | in_progress | unknown
  notes: text("notes").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("home_rooms_home_idx").on(t.homeId, t.position)]);

/* --------------------------------------------------------------- performers */

/** Individual tradesperson, informal team (briqada) or company. */
export const workersTable = pgTable("workers", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: varchar("kind", { length: 12 }).notNull(), // individual | team | company
  /** Account that owns an individual profile (one per user). Null for placeholders. */
  userId: user("user_id"),
  /** Account that manages a team (leader) or company (representative). */
  managerUserId: user("manager_user_id"),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  specialties: jsonb("specialties").$type<string[]>().notNull().default([]),
  city: varchar("city", { length: 100 }).notNull().default(""),
  serviceArea: varchar("service_area", { length: 200 }).notNull().default(""),
  about: text("about").notNull().default(""),
  experienceYears: integer("experience_years"),
  photoMediaId: uuid("photo_media_id"),
  /** Private unless publicContact is true. */
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  email: varchar("email", { length: 254 }).notNull().default(""),
  publicContact: boolean("public_contact").notNull().default(false),
  /** Optional company details; never required for individuals or teams. */
  legalName: varchar("legal_name", { length: 200 }).notNull().default(""),
  taxId: varchar("tax_id", { length: 20 }).notNull().default(""),
  /** active | placeholder (added by a homeowner, not a registered account) | merged */
  status: varchar("status", { length: 16 }).notNull().default("active"),
  mergedIntoId: uuid("merged_into_id"),
  createdByUserId: user("created_by_user_id").notNull(),
  /** Set by an administrator after a separate identity / business check. */
  identityVerifiedAt: timestamp("identity_verified_at", { withTimezone: true }),
  identityVerifiedBy: user("identity_verified_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("workers_individual_user_idx").on(t.userId),
  index("workers_manager_idx").on(t.managerUserId),
  index("workers_kind_idx").on(t.kind, t.status),
]);

/** Team / company membership over time. Leaving keeps the row (status left) and all past work. */
export const workerMembershipsTable = pgTable("worker_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 16 }).notNull().default("member"), // leader | member | representative
  status: varchar("status", { length: 12 }).notNull().default("invited"), // invited | active | declined | left | removed
  invitedByUserId: user("invited_by_user_id"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("worker_memberships_group_idx").on(t.groupId, t.status), index("worker_memberships_member_idx").on(t.memberId)]);

/* ------------------------------------------------------------------- media */

export const homeMediaTable = pgTable("home_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").references(() => homesTable.id, { onDelete: "cascade" }),
  workId: uuid("work_id"),
  roomId: uuid("room_id"),
  /** Profile photos of performers have no home. */
  workerId: uuid("worker_id"),
  objectPath: text("object_path").notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 120 }).notNull(),
  size: integer("size").notNull(),
  caption: varchar("caption", { length: 300 }).notNull().default(""),
  /** before | during | after | hidden (before walls are closed) | other | document (home documents: private, never shared) */
  phase: varchar("phase", { length: 12 }).notNull().default("other"),
  uploadedByUserId: user("uploaded_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("home_media_object_idx").on(t.objectPath),
  index("home_media_home_idx").on(t.homeId, t.createdAt),
  index("home_media_work_idx").on(t.workId),
]);

/* ------------------------------------------------------------------- works */

export const workRecordsTable = pgTable("work_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => homeRoomsTable.id, { onDelete: "set null" }),
  equipmentId: uuid("equipment_id"),
  title: varchar("title", { length: 200 }).notNull(),
  /** electrical | plumbing | sewer | heating | tiling | plaster | painting | flooring | drywall | welding | carpentry | roofing | hvac | insulation | general | other */
  category: varchar("category", { length: 20 }).notNull().default("general"),
  /** construction | renovation | installation | maintenance | repair | inspection */
  kind: varchar("kind", { length: 16 }).notNull().default("renovation"),
  description: text("description").notNull().default(""),
  materials: text("materials").notNull().default(""),
  /** Where hidden lines run, in words (the photo map is infrastructure_items). */
  location: text("location").notNull().default(""),
  startDate: date("start_date"),
  endDate: date("end_date"),
  /** planned | in_progress | completed | confirmed | revision */
  status: varchar("status", { length: 16 }).notNull().default("planned"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }),
  /** public (may appear on the QR page when the owner shares history) | private */
  visibility: varchar("visibility", { length: 8 }).notNull().default("public"),
  /** Actual cost the owner paid (separate from any Smeta estimate) and an optional warranty note. */
  cost: numeric("cost", { precision: 14, scale: 2, mode: "number" }),
  currency: varchar("currency", { length: 3 }).notNull().default("AZN"),
  warrantyNote: text("warranty_note").notNull().default(""),
  /** Optional link to an AI Smeta project of the owner. */
  smetaProjectId: uuid("smeta_project_id"),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("work_records_home_idx").on(t.homeId, t.startDate), index("work_records_room_idx").on(t.roomId)]);

/** Who took part in a work and in which role. Team membership never adds rows here automatically. */
export const workParticipantsTable = pgTable("work_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  workId: uuid("work_id").notNull().references(() => workRecordsTable.id, { onDelete: "cascade" }),
  workerId: uuid("worker_id").notNull().references(() => workersTable.id, { onDelete: "restrict" }),
  /** lead | team_lead | team_member | assistant | supervisor | inspector */
  role: varchar("role", { length: 16 }).notNull().default("lead"),
  /** invited | accepted | declined | removed | recorded (owner's record of a non-registered performer) */
  status: varchar("status", { length: 12 }).notNull().default("invited"),
  /** Set when a team leader added this member as part of the team's work. */
  viaTeamId: uuid("via_team_id"),
  note: varchar("note", { length: 300 }).notNull().default(""),
  /** Per-work permissions set by the home owner. canEdit null = default by role (lead / team_lead may edit). */
  canAddMedia: boolean("can_add_media").notNull().default(true),
  canAddNotes: boolean("can_add_notes").notNull().default(true),
  canEdit: boolean("can_edit"),
  addedByUserId: user("added_by_user_id").notNull(),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("work_participants_work_worker_idx").on(t.workId, t.workerId),
  index("work_participants_worker_idx").on(t.workerId, t.status),
]);

/** Defects, fixes, inspection results and ordinary notes. Append-only. */
export const workNotesTable = pgTable("work_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workId: uuid("work_id").notNull().references(() => workRecordsTable.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 12 }).notNull(), // note | defect | fix | inspection
  body: text("body").notNull(),
  /** inspection result: passed | issues */
  result: varchar("result", { length: 8 }),
  authorUserId: user("author_user_id").notNull(),
  authorRole: varchar("author_role", { length: 16 }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("work_notes_work_idx").on(t.workId, t.createdAt)]);

/** Immutable status history: started, completed, confirmed by owner, revision requested, reopened, inspected. */
export const workApprovalsTable = pgTable("work_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workId: uuid("work_id").notNull().references(() => workRecordsTable.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 20 }).notNull(),
  fromStatus: varchar("from_status", { length: 16 }).notNull(),
  toStatus: varchar("to_status", { length: 16 }).notNull(),
  actorUserId: user("actor_user_id").notNull(),
  actorRole: varchar("actor_role", { length: 16 }).notNull(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
}, (t) => [index("work_approvals_work_idx").on(t.workId, t.createdAt)]);

/* ----------------------------------------------- infrastructure & equipment */

/** Hidden utility line marked on a photo (electric, water, sewer, heating …). */
export const infrastructureItemsTable = pgTable("infrastructure_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => homeRoomsTable.id, { onDelete: "set null" }),
  workId: uuid("work_id").references(() => workRecordsTable.id, { onDelete: "set null" }),
  mediaId: uuid("media_id").references(() => homeMediaTable.id, { onDelete: "set null" }),
  /** electric | water | sewer | heating | gas | ventilation | internet | other */
  type: varchar("type", { length: 16 }).notNull(),
  label: varchar("label", { length: 160 }).notNull().default(""),
  notes: text("notes").notNull().default(""),
  /** Polyline over the photo in percent coordinates (0–100). */
  points: jsonb("points").$type<MarkerPointJson[]>().notNull().default([]),
  /** owner | worker | plan | specialist */
  source: varchar("source", { length: 12 }).notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  verifiedByUserId: user("verified_by_user_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("infrastructure_items_home_idx").on(t.homeId, t.type)]);

export const equipmentTable = pgTable("equipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => homeRoomsTable.id, { onDelete: "set null" }),
  installWorkId: uuid("install_work_id").references(() => workRecordsTable.id, { onDelete: "set null" }),
  name: varchar("name", { length: 160 }).notNull(),
  /** boiler | air_conditioner | water_filter | water_heater | electrical_panel | ventilation | appliance | other */
  category: varchar("category", { length: 20 }).notNull().default("other"),
  brand: varchar("brand", { length: 80 }).notNull().default(""),
  model: varchar("model", { length: 120 }).notNull().default(""),
  serialNumber: varchar("serial_number", { length: 120 }).notNull().default(""),
  installedAt: date("installed_at"),
  warrantyUntil: date("warranty_until"),
  photoMediaId: uuid("photo_media_id"),
  notes: text("notes").notNull().default(""),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("equipment_home_idx").on(t.homeId)]);

/* --------------------------------------------- invitations, sharing, audit */

/**
 * Link invitations (token stored as a hash):
 *   work      — join a work as a performer (optionally claiming a placeholder profile)
 *   member    — become technician / viewer of a home
 *   team      — join a team or company
 */
export const homeInvitationsTable = pgTable("home_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: varchar("kind", { length: 8 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  homeId: uuid("home_id").references(() => homesTable.id, { onDelete: "cascade" }),
  workId: uuid("work_id").references(() => workRecordsTable.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => workersTable.id, { onDelete: "cascade" }),
  /** The placeholder performer this link lets someone claim (never merged by name). */
  placeholderWorkerId: uuid("placeholder_worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  role: varchar("role", { length: 16 }).notNull(),
  name: varchar("name", { length: 120 }).notNull().default(""),
  contact: varchar("contact", { length: 254 }).notNull().default(""),
  status: varchar("status", { length: 10 }).notNull().default("pending"), // pending | accepted | revoked
  createdByUserId: user("created_by_user_id").notNull(),
  acceptedByUserId: user("accepted_by_user_id"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("home_invitations_token_idx").on(t.tokenHash), index("home_invitations_home_idx").on(t.homeId)]);

/** Revocable secret links with a chosen scope. Separate from the public QR identifier. */
export const homeSharesTable = pgTable("home_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  label: varchar("label", { length: 120 }).notNull().default(""),
  level: varchar("level", { length: 12 }).notNull(), // selected | technical
  scope: jsonb("scope").$type<ShareScopeJson>().notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("home_shares_token_idx").on(t.tokenHash), index("home_shares_home_idx").on(t.homeId)]);

/** Audit trail of every change in the home passport and performer profiles. */
export const homeAuditTable = pgTable("home_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").references(() => homesTable.id, { onDelete: "cascade" }),
  workerId: uuid("worker_id"),
  actorUserId: user("actor_user_id").notNull(),
  actorRole: varchar("actor_role", { length: 16 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  entityType: varchar("entity_type", { length: 24 }).notNull(),
  entityId: uuid("entity_id"),
  summary: varchar("summary", { length: 300 }).notNull().default(""),
  changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
  createdAt: createdAt(),
}, (t) => [index("home_audit_home_idx").on(t.homeId, t.createdAt), index("home_audit_worker_idx").on(t.workerId, t.createdAt)]);

/** One review per performer per work, only by a member of that home after owner confirmation. */
export const workerReviewsTable = pgTable("worker_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  workId: uuid("work_id").notNull().references(() => workRecordsTable.id, { onDelete: "cascade" }),
  workerId: uuid("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  authorUserId: user("author_user_id").notNull(),
  rating: smallint("rating").notNull(),
  body: text("body").notNull().default(""),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
  reportReason: varchar("report_reason", { length: 300 }),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("worker_reviews_unique_idx").on(t.workId, t.workerId, t.authorUserId), index("worker_reviews_worker_idx").on(t.workerId)]);
