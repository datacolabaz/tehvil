import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const user = (name: string) => varchar(name, { length: 128 });

export interface MeterJson { value: string; note: string; mediaIds: string[] }
export interface ProtocolExtrasJson {
  meters: { water: MeterJson; gas: MeterJson; electric: MeterJson };
  keys: { kind: string; count: number }[];
  notes: string;
}

/**
 * A handover protocol: the agreed record of a home's condition at handover between a seller and a
 * buyer (often prepared by a realtor). Edited while "collecting"; frozen into a numbered version when
 * sent for approval. Approvals point to that version and its content hash, so nothing approved can
 * change silently — a change needs a new version and new approvals.
 *
 * status: draft | collecting | awaiting | approved | finalized
 */
export const handoverProtocolsTable = pgTable("handover_protocols", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: varchar("number", { length: 24 }).notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  creatorRole: varchar("creator_role", { length: 10 }).notNull(), // realtor | seller | buyer
  propertyType: varchar("property_type", { length: 12 }).notNull().default("apartment"), // apartment | house | other
  address: varchar("address", { length: 300 }).notNull(),
  handoverDate: date("handover_date", { mode: "string" }),
  status: varchar("status", { length: 12 }).notNull().default("draft"),
  sellerName: varchar("seller_name", { length: 160 }).notNull().default(""),
  sellerPhone: varchar("seller_phone", { length: 40 }).notNull().default(""),
  buyerName: varchar("buyer_name", { length: 160 }).notNull().default(""),
  buyerPhone: varchar("buyer_phone", { length: 40 }).notNull().default(""),
  realtorName: varchar("realtor_name", { length: 160 }).notNull().default(""),
  realtorPhone: varchar("realtor_phone", { length: 40 }).notNull().default(""),
  extras: jsonb("extras").$type<ProtocolExtrasJson>().notNull(),
  /** Increases on every content change; a version records the revision it froze. */
  revision: integer("revision").notNull().default(0),
  currentVersion: integer("current_version").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [uniqueIndex("handover_protocols_number_idx").on(t.number), index("handover_protocols_creator_idx").on(t.createdByUserId)]);

/** Who takes part, in which role. One person per role; the creator can always manage. */
export const protocolParticipantsTable = pgTable("protocol_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  userId: user("user_id").notNull(),
  role: varchar("role", { length: 10 }).notNull(), // realtor | seller | buyer
  canEdit: boolean("can_edit").notNull().default(true),
  joinedAt: createdAt(),
}, (t) => [uniqueIndex("protocol_participants_role_idx").on(t.protocolId, t.role), index("protocol_participants_user_idx").on(t.userId)]);

/** Invitation links. Only a hash of the secret is stored; opening a link never approves anything. */
export const protocolInvitesTable = pgTable("protocol_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  usedByUserId: user("used_by_user_id"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
}, (t) => [uniqueIndex("protocol_invites_token_idx").on(t.tokenHash), index("protocol_invites_protocol_idx").on(t.protocolId)]);

/** condition: good | fair | defective | null (not checked yet) */
export const protocolRoomsTable = pgTable("protocol_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  kind: varchar("kind", { length: 12 }).notNull().default("other"),
  position: integer("position").notNull().default(0),
  condition: varchar("condition", { length: 10 }),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
}, (t) => [index("protocol_rooms_protocol_idx").on(t.protocolId, t.position)]);

export const protocolDefectsTable = pgTable("protocol_defects", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => protocolRoomsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
}, (t) => [index("protocol_defects_protocol_idx").on(t.protocolId)]);

/** target: room | defect | meter | keys | other */
export const protocolMediaTable = pgTable("protocol_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  roomId: uuid("room_id"),
  defectId: uuid("defect_id"),
  target: varchar("target", { length: 10 }).notNull().default("room"),
  meterKind: varchar("meter_kind", { length: 10 }),
  objectPath: text("object_path").notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull().default(""),
  caption: varchar("caption", { length: 300 }).notNull().default(""),
  uploadedByUserId: user("uploaded_by_user_id").notNull(),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("protocol_media_protocol_idx").on(t.protocolId)]);

/** A frozen copy of everything that is approved and printed. */
export const protocolVersionsTable = pgTable("protocol_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  revision: integer("revision").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  pdfObjectPath: text("pdf_object_path"),
  pdfCreatedAt: timestamp("pdf_created_at", { withTimezone: true }),
}, (t) => [uniqueIndex("protocol_versions_idx").on(t.protocolId, t.version)]);

/** decision: approved | changes */
export const protocolApprovalsTable = pgTable("protocol_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  role: varchar("role", { length: 10 }).notNull(),
  userId: user("user_id").notNull(),
  decision: varchar("decision", { length: 10 }).notNull(),
  comment: text("comment").notNull().default(""),
  /** How the person was identified when deciding: "phone" (verified number), "email", or "account". */
  authLevel: varchar("auth_level", { length: 10 }).notNull(),
  authDetail: varchar("auth_detail", { length: 160 }).notNull().default(""),
  ip: varchar("ip", { length: 64 }).notNull().default(""),
  userAgent: varchar("user_agent", { length: 300 }).notNull().default(""),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("protocol_approvals_idx").on(t.protocolId, t.version, t.role)]);

export const protocolEventsTable = pgTable("protocol_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  userId: user("user_id"),
  action: varchar("action", { length: 40 }).notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("protocol_events_protocol_idx").on(t.protocolId, t.createdAt)]);

export type HandoverProtocolRow = typeof handoverProtocolsTable.$inferSelect;
export type ProtocolRoomRow = typeof protocolRoomsTable.$inferSelect;
export type ProtocolMediaRow = typeof protocolMediaTable.$inferSelect;
