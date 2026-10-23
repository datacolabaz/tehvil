import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { homeMediaTable, homesTable } from "./home";

/*
 * Construction stage of a photo, suggested by AI and decided by a person — kept in separate columns.
 * One row per photo (unique media_id): analysing the same photo again updates this row, it never
 * creates a second photo or history record. The photo itself (home_media) is never changed here.
 *
 * stage_status:
 *   ai_suggested   AI proposed a stage; nobody has looked at it yet
 *   confirmed      a person accepted the AI stage
 *   changed        a person picked a different stage (the AI stage stays in ai_stage)
 *   undetermined   AI could not tell / the person chose "not determined"
 */
export const mediaStageTagsTable = pgTable("media_stage_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id").notNull().references(() => homeMediaTable.id, { onDelete: "cascade" }),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  /** queued | processing | done | failed | skipped */
  aiStatus: varchar("ai_status", { length: 12 }).notNull().default("queued"),
  aiStage: varchar("ai_stage", { length: 24 }),
  aiConfidence: numeric("ai_confidence", { precision: 4, scale: 3, mode: "number" }),
  aiRoomKind: varchar("ai_room_kind", { length: 24 }),
  aiUtility: varchar("ai_utility", { length: 16 }),
  aiUtilities: jsonb("ai_utilities").$type<string[]>().notNull().default([]),
  aiWorkType: varchar("ai_work_type", { length: 24 }),
  aiEvidence: text("ai_evidence"),
  aiModel: varchar("ai_model", { length: 64 }),
  aiError: text("ai_error"),
  /** SHA-256 of the file that was analysed: the same file is not sent again. */
  analyzedSha256: varchar("analyzed_sha256", { length: 64 }),
  attempts: integer("attempts").notNull().default(0),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  /** Final stage shown to people (AI suggestion until a person decides). */
  stage: varchar("stage", { length: 24 }),
  stageStatus: varchar("stage_status", { length: 14 }).notNull().default("ai_suggested"),
  /** Room / utility chosen by a person (null: use the AI suggestion). */
  roomKind: varchar("room_kind", { length: 24 }),
  utility: varchar("utility", { length: 16 }),
  decidedByUserId: varchar("decided_by_user_id", { length: 128 }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("media_stage_tags_media_idx").on(t.mediaId),
  index("media_stage_tags_home_idx").on(t.homeId, t.stage),
  index("media_stage_tags_queue_idx").on(t.aiStatus, t.createdAt),
]);

export type MediaStageTagRow = typeof mediaStageTagsTable.$inferSelect;
