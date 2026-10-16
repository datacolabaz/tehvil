import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Realtor module: listings, leads (CRM), appointments, team, WhatsApp automation
// and the public "Təhvil Sertifikatlı Mənzil" passport with its trust workflow.
// Every realtor-owned row carries owner_user_id (the Clerk user id of the agency
// owner); access checks always filter by it.

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const owner = () => varchar("owner_user_id", { length: 128 }).notNull();

export interface ExternalLinkJson { portal: string; url: string }
export interface PassportRealtorJson {
  name: string;
  agency: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  photoMediaId: string | null;
  logoMediaId: string | null;
}
export interface LeadBotStateJson {
  step: "deal" | "district" | "budget" | "rooms" | "timeframe" | "slots" | "done" | "handoff";
  offeredSlots?: string[];
  offeredListingIds?: string[];
}

/** Uploaded photos and logos. Files come from the shared upload flow (evidence_uploads). */
export const realtorMediaTable = pgTable("realtor_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: owner(),
  objectPath: text("object_path").notNull(),
  originalName: text("original_name").notNull(),
  contentType: varchar("content_type", { length: 120 }).notNull(),
  size: integer("size").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("realtor_media_object_path_idx").on(t.objectPath), index("realtor_media_owner_idx").on(t.ownerUserId)]);

export const realtorProfilesTable = pgTable("realtor_profiles", {
  userId: varchar("user_id", { length: 128 }).primaryKey(),
  fullName: text("full_name").notNull(),
  agency: text("agency").notNull().default(""),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  whatsapp: varchar("whatsapp", { length: 32 }).notNull().default(""),
  instagram: varchar("instagram", { length: 120 }).notNull().default(""),
  bio: text("bio").notNull().default(""),
  photoMediaId: uuid("photo_media_id").references(() => realtorMediaTable.id, { onDelete: "set null" }),
  logoMediaId: uuid("logo_media_id").references(() => realtorMediaTable.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Agents of an agency. Leads, listings and appointments can be assigned to them. */
export const realtorAgentsTable = pgTable("realtor_agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: owner(),
  fullName: text("full_name").notNull(),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  email: varchar("email", { length: 254 }).notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("realtor_agents_owner_idx").on(t.ownerUserId)]);

export const realtorListingsTable = pgTable("realtor_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: owner(),
  agentId: uuid("agent_id").references(() => realtorAgentsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  dealType: varchar("deal_type", { length: 12 }).notNull(), // sale | rent
  propertyKind: varchar("property_kind", { length: 20 }).notNull(), // apartment | villa | office | country_house | other
  district: text("district").notNull(),
  address: text("address").notNull().default(""),
  rooms: integer("rooms"),
  areaM2: numeric("area_m2", { precision: 10, scale: 2, mode: "number" }),
  floor: varchar("floor", { length: 20 }).notNull().default(""),
  price: money("price"),
  currency: varchar("currency", { length: 3 }).notNull().default("AZN"),
  status: varchar("status", { length: 12 }).notNull().default("active"), // active | pending | sold | archived
  description: text("description").notNull().default(""),
  externalLinks: jsonb("external_links").$type<ExternalLinkJson[]>().notNull().default([]),
  photoIds: jsonb("photo_ids").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("realtor_listings_owner_idx").on(t.ownerUserId, t.status)]);

export const realtorLeadsTable = pgTable("realtor_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: owner(),
  agentId: uuid("agent_id").references(() => realtorAgentsTable.id, { onDelete: "set null" }),
  listingId: uuid("listing_id").references(() => realtorListingsTable.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  source: varchar("source", { length: 16 }).notNull(), // whatsapp | instagram | facebook | site | phone | other
  status: varchar("status", { length: 16 }).notNull().default("new"), // new | contacted | interested | meeting | deal | lost
  dealType: varchar("deal_type", { length: 12 }), // sale | rent
  district: text("district").notNull().default(""),
  rooms: integer("rooms"),
  budgetMin: money("budget_min"),
  budgetMax: money("budget_max"),
  timeframe: text("timeframe").notNull().default(""),
  notes: text("notes").notNull().default(""),
  nextAction: text("next_action").notNull().default(""),
  nextActionAt: timestamp("next_action_at", { withTimezone: true }),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  followUpSentAt: timestamp("follow_up_sent_at", { withTimezone: true }),
  botState: jsonb("bot_state").$type<LeadBotStateJson | null>(),
  readyForMeeting: boolean("ready_for_meeting").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("realtor_leads_owner_idx").on(t.ownerUserId, t.status),
  index("realtor_leads_phone_idx").on(t.ownerUserId, t.phone),
]);

export const realtorAppointmentsTable = pgTable("realtor_appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: owner(),
  leadId: uuid("lead_id").references(() => realtorLeadsTable.id, { onDelete: "set null" }),
  listingId: uuid("listing_id").references(() => realtorListingsTable.id, { onDelete: "set null" }),
  agentId: uuid("agent_id").references(() => realtorAgentsTable.id, { onDelete: "set null" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull().default(30),
  status: varchar("status", { length: 16 }).notNull().default("planned"), // planned | done | cancelled | rescheduled
  notes: text("notes").notNull().default(""),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("realtor_appointments_owner_idx").on(t.ownerUserId, t.startsAt)]);

/** "Mənzil Təhvil Pasportu": public at /p/{public_id} once published. */
export const propertyPassportsTable = pgTable("property_passports", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: varchar("public_id", { length: 16 }).notNull(),
  ownerUserId: owner(),
  listingId: uuid("listing_id").references(() => realtorListingsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  dealType: varchar("deal_type", { length: 12 }).notNull().default("sale"),
  propertyKind: varchar("property_kind", { length: 20 }).notNull(),
  district: text("district").notNull(),
  address: text("address").notNull().default(""),
  rooms: integer("rooms"),
  areaM2: numeric("area_m2", { precision: 10, scale: 2, mode: "number" }),
  price: money("price"),
  currency: varchar("currency", { length: 3 }).notNull().default("AZN"),
  listingUrls: jsonb("listing_urls").$type<ExternalLinkJson[]>().notNull().default([]),
  photoIds: jsonb("photo_ids").$type<string[]>().notNull().default([]),
  realtor: jsonb("realtor").$type<PassportRealtorJson>().notNull(),
  status: varchar("status", { length: 12 }).notNull().default("draft"), // draft | published | archived
  ownerName: text("owner_name").notNull().default(""),
  ownerPhone: varchar("owner_phone", { length: 32 }).notNull().default(""),
  ownerTokenHash: varchar("owner_token_hash", { length: 64 }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("property_passports_public_id_idx").on(t.publicId),
  index("property_passports_owner_idx").on(t.ownerUserId),
  uniqueIndex("property_passports_owner_token_idx").on(t.ownerTokenHash),
]);

/** One renovation job in a passport. Editing its content clears earlier confirmations. */
export const passportWorksTable = pgTable("passport_works", {
  id: uuid("id").primaryKey().defaultRandom(),
  passportId: uuid("passport_id").notNull().references(() => propertyPassportsTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  contractorName: text("contractor_name").notNull().default(""),
  contractorPhone: varchar("contractor_phone", { length: 32 }).notNull().default(""),
  description: text("description").notNull().default(""),
  materials: text("materials").notNull().default(""),
  beforePhotoIds: jsonb("before_photo_ids").$type<string[]>().notNull().default([]),
  afterPhotoIds: jsonb("after_photo_ids").$type<string[]>().notNull().default([]),
  contractorTokenHash: varchar("contractor_token_hash", { length: 64 }),
  contractorConfirmedAt: timestamp("contractor_confirmed_at", { withTimezone: true }),
  contractorConfirmedName: text("contractor_confirmed_name"),
  contractorNote: text("contractor_note"),
  handoverStatus: varchar("handover_status", { length: 12 }).notNull().default("pending"), // pending | accepted | revision
  ownerDecidedAt: timestamp("owner_decided_at", { withTimezone: true }),
  ownerDecidedName: text("owner_decided_name"),
  ownerNote: text("owner_note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("passport_works_passport_idx").on(t.passportId, t.position),
  uniqueIndex("passport_works_contractor_token_idx").on(t.contractorTokenHash),
]);

/** Analytics: passport views, QR scans, WhatsApp clicks, lead forms. */
export const realtorEventsTable = pgTable("realtor_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: owner(),
  passportId: uuid("passport_id").references(() => propertyPassportsTable.id, { onDelete: "cascade" }),
  listingId: uuid("listing_id").references(() => realtorListingsTable.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 20 }).notNull(), // passport_view | qr_scan | whatsapp_click | share | lead_form
  createdAt: createdAt(),
}, (t) => [index("realtor_events_owner_idx").on(t.ownerUserId, t.createdAt), index("realtor_events_passport_idx").on(t.passportId, t.kind)]);

export const realtorWhatsappSettingsTable = pgTable("realtor_whatsapp_settings", {
  userId: varchar("user_id", { length: 128 }).primaryKey(),
  mode: varchar("mode", { length: 12 }).notNull().default("manual"), // manual | cloud_api
  businessPhone: varchar("business_phone", { length: 32 }).notNull().default(""),
  phoneNumberId: varchar("phone_number_id", { length: 64 }),
  accessTokenEnc: text("access_token_enc"),
  autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(true),
  greeting: text("greeting").notNull().default(""),
  followUpEnabled: boolean("follow_up_enabled").notNull().default(true),
  followUpHours: integer("follow_up_hours").notNull().default(48),
  followUpText: text("follow_up_text").notNull().default(""),
  reminderEnabled: boolean("reminder_enabled").notNull().default(true),
  reminderHoursBefore: integer("reminder_hours_before").notNull().default(3),
  reminderText: text("reminder_text").notNull().default(""),
  workdayStartHour: integer("workday_start_hour").notNull().default(10),
  workdayEndHour: integer("workday_end_hour").notNull().default(19),
  followUpTemplate: varchar("follow_up_template", { length: 120 }).notNull().default(""),
  reminderTemplate: varchar("reminder_template", { length: 120 }).notNull().default(""),
  templateLanguage: varchar("template_language", { length: 12 }).notNull().default("az"),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("realtor_whatsapp_phone_number_idx").on(t.phoneNumberId)]);

export const realtorMessagesTable = pgTable("realtor_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: owner(),
  leadId: uuid("lead_id").references(() => realtorLeadsTable.id, { onDelete: "cascade" }),
  direction: varchar("direction", { length: 4 }).notNull(), // in | out
  kind: varchar("kind", { length: 20 }).notNull(), // inbound | auto_reply | question | listing | slots | confirm | follow_up | reminder | manual | handoff
  body: text("body").notNull(),
  status: varchar("status", { length: 12 }).notNull(), // received | sent | failed | manual
  waMessageId: varchar("wa_message_id", { length: 128 }),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [index("realtor_messages_lead_idx").on(t.leadId, t.createdAt), index("realtor_messages_owner_idx").on(t.ownerUserId, t.createdAt)]);

export const realtorNotificationsTable = pgTable("realtor_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: owner(),
  kind: varchar("kind", { length: 24 }).notNull(), // new_lead | lead_ready | reminder_due | contractor_confirmed | owner_accepted | owner_revision
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  href: text("href").notNull().default(""),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("realtor_notifications_owner_idx").on(t.ownerUserId, t.createdAt)]);
