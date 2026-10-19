import { boolean, date, index, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Unit prices for repair and construction estimates. The list of items (what is priced, in which
 * unit and pack) lives in the API code; this table keeps every price someone actually observed,
 * with its source and date, so an estimate can show low / median / high and where each came from.
 */
export const priceQuotesTable = pgTable("price_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemCode: varchar("item_code", { length: 80 }).notNull(),
  /** ekonom | standart | premium | any */
  tier: varchar("tier", { length: 10 }).notNull().default("any"),
  price: numeric("price", { precision: 12, scale: 2, mode: "number" }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AZN"),
  /** supplier | contractor | published | preliminary */
  sourceKind: varchar("source_kind", { length: 16 }).notNull(),
  sourceName: varchar("source_name", { length: 200 }).notNull(),
  sourceUrl: text("source_url"),
  observedAt: date("observed_at", { mode: "string" }).notNull(),
  note: text("note").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdByUserId: varchar("created_by_user_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("price_quotes_item_idx").on(t.itemCode, t.active)]);

/** A homeowner's repair estimate: what they entered and the result with the prices it used. */
export const repairEstimatesTable = pgTable("repair_estimates", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: varchar("owner_user_id", { length: 128 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("repair_estimates_owner_idx").on(t.ownerUserId, t.updatedAt)]);

export type PriceQuoteRow = typeof priceQuotesTable.$inferSelect;
