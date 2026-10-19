import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const user = (name: string) => varchar(name, { length: 128 });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });

/**
 * A listing as it was seen at one moment: read from a portal page the user linked, pasted as
 * text, or typed in. Only listings read by the server from a portal page — and not changed
 * afterwards in price or area — join the shared comparison pool (`inPool`).
 * These are asking prices from adverts, never sale prices.
 */
export const listingSnapshotsTable = pgTable("listing_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url"),
  urlHash: varchar("url_hash", { length: 64 }),
  portal: varchar("portal", { length: 16 }),
  /** link | text | manual */
  source: varchar("source", { length: 8 }).notNull(),
  dealType: varchar("deal_type", { length: 8 }).notNull().default("sale"),
  city: varchar("city", { length: 100 }).notNull().default(""),
  district: varchar("district", { length: 120 }).notNull().default(""),
  areaM2: numeric("area_m2", { precision: 10, scale: 2, mode: "number" }),
  rooms: integer("rooms"),
  floor: integer("floor"),
  floorsTotal: integer("floors_total"),
  /** new | old | house | unknown */
  buildingType: varchar("building_type", { length: 8 }).notNull().default("unknown"),
  /** yes | no | unknown */
  renovation: varchar("renovation", { length: 8 }).notNull().default("unknown"),
  furnished: varchar("furnished", { length: 8 }).notNull().default("unknown"),
  price: money("price"),
  currency: varchar("currency", { length: 3 }),
  priceAzn: money("price_azn"),
  title: varchar("title", { length: 300 }).notNull().default(""),
  description: text("description").notNull().default(""),
  /** What the server read from the page, kept to show the source and to decide pool membership. */
  parsed: jsonb("parsed").$type<Record<string, unknown>>(),
  inPool: boolean("in_pool").notNull().default(false),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("listing_snapshots_pool_idx").on(t.inPool, t.city, t.fetchedAt),
  index("listing_snapshots_url_idx").on(t.urlHash),
]);

/** One market-value calculation with everything it used, so it can be shown again later. */
export const valuationsTable = pgTable("valuations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: user("owner_user_id").notNull(),
  subjectId: uuid("subject_id").notNull().references(() => listingSnapshotsTable.id, { onDelete: "restrict" }),
  compIds: jsonb("comp_ids").$type<string[]>().notNull().default([]),
  usdRate: numeric("usd_rate", { precision: 8, scale: 4, mode: "number" }).notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
}, (t) => [index("valuations_owner_idx").on(t.ownerUserId, t.createdAt)]);

/** Construction estimate built from an architect's project. Private to its owner. */
export const constructionEstimatesTable = pgTable("construction_estimates", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: user("owner_user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  /** Measurements, lines, prices and file notes as edited in the browser (validated on save). */
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("construction_estimates_owner_idx").on(t.ownerUserId, t.updatedAt)]);

export type ListingSnapshotRow = typeof listingSnapshotsTable.$inferSelect;
