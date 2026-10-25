import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { homesTable } from "./home";

/*
 * AI Smeta: drawings → structural elements → quantities (concrete, rebar, formwork) → priced estimate.
 * `doc` is what the person edits (elements with the source of every parameter, settings, norms, prices,
 * overrides); quantities are always recomputed from it by the engine, never stored as truth.
 * Every analysis, answer round and export freezes a version.
 */
export const aiEstimatesTable = pgTable("ai_estimates", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: varchar("owner_user_id", { length: 128 }).notNull(),
  /** Linked "Evimin xərcləri" home for the plan / actual comparison. */
  homeId: uuid("home_id").references(() => homesTable.id, { onDelete: "set null" }),
  name: varchar("name", { length: 200 }).notNull(),
  /** house | renovation | annex | concrete_rebar | other */
  kind: varchar("kind", { length: 16 }).notNull(),
  location: varchar("location", { length: 200 }).notNull().default(""),
  areaM2: integer("area_m2"),
  floors: integer("floors"),
  /** draft | analyzing | questions | ready | failed */
  status: varchar("status", { length: 12 }).notNull().default("draft"),
  aiError: text("ai_error"),
  aiModel: varchar("ai_model", { length: 64 }),
  doc: jsonb("doc").$type<Record<string, unknown>>().notNull(),
  /** Answers given to questions: id → { value | "unknown" | "engineer", at }. */
  answers: jsonb("answers").$type<Record<string, { value: number | null; kind: "value" | "unknown" | "engineer"; at: string }>>().notNull().default({}),
  /** What the model returned for the drawings, unchanged. */
  aiResult: jsonb("ai_result").$type<Record<string, unknown>>(),
  /** A contractor's own estimate (uploaded table) with the person's confirmed category matches. */
  contractor: jsonb("contractor").$type<Record<string, unknown>>(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_estimates_owner_idx").on(t.ownerUserId, t.updatedAt)]);

export const aiEstimateFilesTable = pgTable("ai_estimate_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  estimateId: uuid("estimate_id").notNull().references(() => aiEstimatesTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 120 }).notNull(),
  size: integer("size").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull().default(""),
  /** drawing (pdf / image) | table (xlsx / csv material list) */
  kind: varchar("kind", { length: 10 }).notNull(),
  /** uploaded | analyzed | failed */
  status: varchar("status", { length: 10 }).notNull().default("uploaded"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_estimate_files_estimate_idx").on(t.estimateId), uniqueIndex("ai_estimate_files_object_idx").on(t.objectPath)]);

export const aiEstimateVersionsTable = pgTable("ai_estimate_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  estimateId: uuid("estimate_id").notNull().references(() => aiEstimatesTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  /** analysis | answers | edit | export | manual */
  reason: varchar("reason", { length: 12 }).notNull(),
  doc: jsonb("doc").$type<Record<string, unknown>>().notNull(),
  totals: jsonb("totals").$type<Record<string, unknown>>().notNull(),
  createdByUserId: varchar("created_by_user_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("ai_estimate_versions_idx").on(t.estimateId, t.version)]);

export type AiEstimateRow = typeof aiEstimatesTable.$inferSelect;
export type AiEstimateFileRow = typeof aiEstimateFilesTable.$inferSelect;
