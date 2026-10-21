import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const user = (name: string) => varchar(name, { length: 128 });

/** `na`: this home has no such meter (shown as “tətbiq edilmir”). */
export interface MeterJson { value: string; note: string; mediaIds: string[]; na?: boolean }
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
  creatorRole: varchar("creator_role", { length: 10 }).notNull(), // realtor | seller | buyer | landlord | tenant
  /** sale (purchase handover) | move_in | move_out (rental). Rental protocols take parties and access from their rental. */
  kind: varchar("kind", { length: 10 }).notNull().default("sale"),
  rentalId: uuid("rental_id"),
  /** The home history this handover belongs to (optional; access to the home is checked separately). */
  homeId: uuid("home_id"),
  /** A move-out protocol is built from this move-in protocol and version. */
  baseProtocolId: uuid("base_protocol_id"),
  baseVersion: integer("base_version"),
  /** Move-out: the move-in content it is compared with, frozen when the move-out started. */
  baseline: jsonb("baseline").$type<Record<string, unknown>>(),
  propertyType: varchar("property_type", { length: 12 }).notNull().default("apartment"), // apartment | house | other
  address: varchar("address", { length: 300 }).notNull(),
  handoverDate: date("handover_date", { mode: "string" }),
  /** Local time of the key handover, "HH:MM" (Asia/Baku), optional. */
  handoverTime: varchar("handover_time", { length: 5 }).notNull().default(""),
  status: varchar("status", { length: 12 }).notNull().default("draft"),
  sellerName: varchar("seller_name", { length: 160 }).notNull().default(""),
  sellerPhone: varchar("seller_phone", { length: 40 }).notNull().default(""),
  buyerName: varchar("buyer_name", { length: 160 }).notNull().default(""),
  buyerPhone: varchar("buyer_phone", { length: 40 }).notNull().default(""),
  realtorName: varchar("realtor_name", { length: 160 }).notNull().default(""),
  realtorPhone: varchar("realtor_phone", { length: 40 }).notNull().default(""),
  /** Realtor's agency as it should appear in the PDF, optional. */
  realtorAgency: varchar("realtor_agency", { length: 160 }).notNull().default(""),
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
  /** Move-out: the move-in room this one continues. */
  prevRoomId: uuid("prev_room_id"),
  createdAt: createdAt(),
}, (t) => [index("protocol_rooms_protocol_idx").on(t.protocolId, t.position)]);

/**
 * What is checked in a room: walls, floor, ceiling, window, door, furniture, appliances.
 * category: wall | floor | ceiling | window | door | furniture | appliance | other
 * change (move-out only): unchanged | new_damage | changed | resolved | missing
 */
export const protocolItemsTable = pgTable("protocol_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").notNull().references(() => protocolRoomsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  category: varchar("category", { length: 10 }).notNull().default("other"),
  quantity: integer("quantity").notNull().default(1),
  condition: varchar("condition", { length: 10 }),
  note: text("note").notNull().default(""),
  change: varchar("change", { length: 12 }),
  prevItemId: uuid("prev_item_id"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("protocol_items_protocol_idx").on(t.protocolId, t.roomId)]);

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
  target: varchar("target", { length: 10 }).notNull().default("room"), // room | item | defect | meter | keys | other
  itemId: uuid("item_id"),
  /** When the photo was taken, as the device reports it (EXIF or camera); not proof. Upload time is createdAt (server). */
  takenAt: timestamp("taken_at", { withTimezone: true }),
  takenSource: varchar("taken_source", { length: 8 }),
  meterKind: varchar("meter_kind", { length: 10 }),
  objectPath: text("object_path").notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull().default(""),
  caption: varchar("caption", { length: 300 }).notNull().default(""),
  uploadedByUserId: user("uploaded_by_user_id").notNull(),
  /** Server receive time (createdAt is set by the server). */
  createdAt: createdAt(),
  /** Soft delete: a removed photo stays, with its hash, for the history. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedByUserId: user("deleted_by_user_id"),
  /** SHA-256 of the stored file, computed by the server on receipt ('' for photos stored before this existed). */
  sha256: varchar("sha256", { length: 64 }).notNull().default(""),
  /** What the device said (e.g. GPS from EXIF); may be missing or forged, never proof. */
  clientMeta: jsonb("client_meta").$type<Record<string, unknown>>(),
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
  /** Integrity manifest: content + photo SHA-256s, canonical JSON; approvals point to manifestHash. Empty for older versions. */
  manifest: jsonb("manifest").$type<Record<string, unknown>>(),
  manifestHash: varchar("manifest_hash", { length: 64 }).notNull().default(""),
  /** Secret code in the PDF's QR → public verification page. */
  verifyCode: varchar("verify_code", { length: 40 }),
  /** SHA-256 of {manifestHash, approvals}: kept apart so approvals never sit inside the hash they approve. */
  finalHash: varchar("final_hash", { length: 64 }).notNull().default(""),
  pdfSha256: varchar("pdf_sha256", { length: 64 }).notNull().default(""),
}, (t) => [uniqueIndex("protocol_versions_idx").on(t.protocolId, t.version), uniqueIndex("protocol_versions_verify_idx").on(t.verifyCode)]);

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
  /** The manifest hash this decision was given for ('' for older versions). */
  manifestHash: varchar("manifest_hash", { length: 64 }).notNull().default(""),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("protocol_approvals_idx").on(t.protocolId, t.version, t.role)]);

export const protocolEventsTable = pgTable("protocol_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => handoverProtocolsTable.id, { onDelete: "cascade" }),
  userId: user("user_id"),
  action: varchar("action", { length: 40 }).notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  /** Hash chain per protocol: hash = SHA-256(canonical {prevHash, protocolId, userId, action, detail, at}). Makes edits detectable, not impossible. */
  prevHash: varchar("prev_hash", { length: 64 }).notNull().default(""),
  hash: varchar("hash", { length: 64 }).notNull().default(""),
}, (t) => [index("protocol_events_protocol_idx").on(t.protocolId, t.createdAt)]);

/* ------------------------------------------------------------------ rentals */

/** A rental: the agreement the move-in and move-out protocols belong to. Only the address is required. */
export const rentalsTable = pgTable("rentals", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: varchar("number", { length: 24 }).notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  address: varchar("address", { length: 300 }).notNull(),
  propertyType: varchar("property_type", { length: 12 }).notNull().default("apartment"),
  landlordName: varchar("landlord_name", { length: 160 }).notNull().default(""),
  landlordPhone: varchar("landlord_phone", { length: 40 }).notNull().default(""),
  tenantName: varchar("tenant_name", { length: 160 }).notNull().default(""),
  tenantPhone: varchar("tenant_phone", { length: 40 }).notNull().default(""),
  realtorName: varchar("realtor_name", { length: 160 }).notNull().default(""),
  realtorPhone: varchar("realtor_phone", { length: 40 }).notNull().default(""),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  monthlyRent: integer("monthly_rent"),
  deposit: integer("deposit"),
  currency: varchar("currency", { length: 3 }).notNull().default("AZN"),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [uniqueIndex("rentals_number_idx").on(t.number), index("rentals_creator_idx").on(t.createdByUserId)]);

/** role: landlord (owner or their manager) | tenant | realtor */
export const rentalParticipantsTable = pgTable("rental_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  rentalId: uuid("rental_id").notNull().references(() => rentalsTable.id, { onDelete: "cascade" }),
  userId: user("user_id").notNull(),
  role: varchar("role", { length: 10 }).notNull(),
  canEdit: boolean("can_edit").notNull().default(true),
  joinedAt: createdAt(),
}, (t) => [uniqueIndex("rental_participants_role_idx").on(t.rentalId, t.role), index("rental_participants_user_idx").on(t.userId)]);

/** canEdit: false = the invited party can view and approve only. */
export const rentalInvitesTable = pgTable("rental_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  rentalId: uuid("rental_id").notNull().references(() => rentalsTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  canEdit: boolean("can_edit").notNull().default(true),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  usedByUserId: user("used_by_user_id"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
}, (t) => [uniqueIndex("rental_invites_token_idx").on(t.tokenHash), index("rental_invites_rental_idx").on(t.rentalId)]);

export type RentalRow = typeof rentalsTable.$inferSelect;
export type HandoverProtocolRow = typeof handoverProtocolsTable.$inferSelect;
export type ProtocolRoomRow = typeof protocolRoomsTable.$inferSelect;
export type ProtocolMediaRow = typeof protocolMediaTable.$inferSelect;
