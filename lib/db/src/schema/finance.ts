import {
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
import { homeMediaTable, homeRoomsTable, homesTable, workersTable } from "./home";

/*
 * Home finance ("Maliyyə"): budget, actual costs, payments, debts and advances of one
 * construction / renovation project of a home.
 *
 * The five notions are stored separately and never summed together:
 *   budget        finance_budget_versions   agreed amount for the project (versioned; only approved change orders add versions)
 *   actual cost   finance_expenses          what was bought / done (counts only when approved)
 *   payment       finance_payments          money that actually moved (payment | advance | refund)
 *   debt          computed                  obligation − money credited to that party
 *   advance       finance_payments.kind = advance, consumed by expenses with funded_by_party_id
 *
 * Money columns are numeric(14,2) read as strings; the server computes in integer qəpik.
 * Rows are never deleted: wrong rows are voided with a reason, edits of approved rows
 * keep their before / after values in home_audit.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const user = (name: string) => varchar(name, { length: 128 });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "string" });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "string" });

/** One construction / renovation period of a home. A home can have many over the years. */
export const homeProjectsTable = pgTable("home_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  /** construction | renovation | other */
  kind: varchar("kind", { length: 16 }).notNull().default("construction"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  /** active | closed */
  status: varchar("status", { length: 10 }).notNull().default("active"),
  currency: varchar("currency", { length: 3 }).notNull().default("AZN"),
  /** Optional link to a Smeta estimate (planned costs) for the plan / fact comparison. */
  smetaProjectId: uuid("smeta_project_id"),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("home_projects_home_idx").on(t.homeId, t.createdAt)]);

/** Contractor, tradesperson, supplier or anyone else money is settled with, inside one project. */
export const financePartiesTable = pgTable("finance_parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => homeProjectsTable.id, { onDelete: "cascade" }),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  /** contractor | worker | supplier | other */
  role: varchar("role", { length: 12 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  note: text("note").notNull().default(""),
  /** Agreed contract amount; null = settled per invoice (suppliers). */
  contractAmount: money("contract_amount"),
  contractNote: text("contract_note").notNull().default(""),
  /** Optional performer profile of the home passport. */
  workerId: uuid("worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  /** Account of this party once it accepted the finance invitation (sees the shared project finance). */
  userId: user("user_id"),
  inviteTokenHash: varchar("invite_token_hash", { length: 64 }),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("finance_parties_project_idx").on(t.projectId),
  index("finance_parties_user_idx").on(t.userId),
  uniqueIndex("finance_parties_invite_idx").on(t.inviteTokenHash),
]);

/** Budget history of a project. Version 1 is the initial budget; each approved change order adds one. */
export const financeBudgetVersionsTable = pgTable("finance_budget_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => homeProjectsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  total: money("total").notNull(),
  /** initial | change_order | correction */
  reason: varchar("reason", { length: 16 }).notNull(),
  note: text("note").notNull().default(""),
  changeOrderId: uuid("change_order_id"),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("finance_budget_versions_idx").on(t.projectId, t.version)]);

/** Additional work proposed during the project. Only an approved one changes the budget. */
export const financeChangeOrdersTable = pgTable("finance_change_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => homeProjectsTable.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  partyId: uuid("party_id").references(() => financePartiesTable.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  reason: text("reason").notNull().default(""),
  amount: money("amount").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  mediaIds: jsonb("media_ids").$type<string[]>().notNull().default([]),
  /** proposed | approved | rejected | clarification */
  status: varchar("status", { length: 16 }).notNull().default("proposed"),
  proposedByUserId: user("proposed_by_user_id").notNull(),
  decidedByUserId: user("decided_by_user_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note").notNull().default(""),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("finance_change_orders_number_idx").on(t.projectId, t.number)]);

/** An uploaded invoice / receipt / handwritten note and what AI read from it. */
export const financeInvoicesTable = pgTable("finance_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => homeProjectsTable.id, { onDelete: "cascade" }),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  /** The stored file (home_media, phase "document": private). */
  mediaId: uuid("media_id").notNull().references(() => homeMediaTable.id, { onDelete: "restrict" }),
  sha256: varchar("sha256", { length: 64 }).notNull().default(""),
  /** uploaded | reading | read | failed | confirmed | discarded */
  status: varchar("status", { length: 12 }).notNull().default("uploaded"),
  /** What the model returned, unchanged (fields, items, confidences, printed and handwritten dates). */
  aiResult: jsonb("ai_result").$type<Record<string, unknown>>(),
  aiModel: varchar("ai_model", { length: 64 }),
  aiError: text("ai_error"),
  /** Values after the person's review (what became the expense). */
  confirmed: jsonb("confirmed").$type<Record<string, unknown>>(),
  docNumber: varchar("doc_number", { length: 80 }).notNull().default(""),
  vendor: varchar("vendor", { length: 200 }).notNull().default(""),
  docDate: date("doc_date", { mode: "string" }),
  total: money("total"),
  duplicateOfId: uuid("duplicate_of_id"),
  expenseId: uuid("expense_id"),
  uploadedByUserId: user("uploaded_by_user_id").notNull(),
  confirmedByUserId: user("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("finance_invoices_project_idx").on(t.projectId, t.createdAt),
  index("finance_invoices_sha_idx").on(t.homeId, t.sha256),
]);

/** Actual cost: material bought or work done. Counts in totals only when approved. */
export const financeExpensesTable = pgTable("finance_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => homeProjectsTable.id, { onDelete: "cascade" }),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  category: varchar("category", { length: 24 }).notNull(),
  description: varchar("description", { length: 300 }).notNull(),
  /** Supplier / tradesperson / contractor the cost is owed to (optional). */
  partyId: uuid("party_id").references(() => financePartiesTable.id, { onDelete: "set null" }),
  vendorName: varchar("vendor_name", { length: 200 }).notNull().default(""),
  roomId: uuid("room_id").references(() => homeRoomsTable.id, { onDelete: "set null" }),
  subtotal: money("subtotal").notNull(),
  discount: money("discount").notNull().default("0"),
  tax: money("tax").notNull().default("0"),
  total: money("total").notNull(),
  /** cash | card | transfer | other | "" */
  paymentMethod: varchar("payment_method", { length: 12 }).notNull().default(""),
  /** Party whose advance paid for this (the contractor bought it with the owner's advance); null = not from an advance. */
  fundedByPartyId: uuid("funded_by_party_id").references(() => financePartiesTable.id, { onDelete: "set null" }),
  invoiceId: uuid("invoice_id"),
  /** One "gündəlik qeyd" (daily entry) can produce several expenses (paid / unpaid); they share this id. */
  entryId: uuid("entry_id"),
  /** Work record (work_records) done that day, when the entry also described work. Its cost stays empty: money lives here. */
  workId: uuid("work_id"),
  note: text("note").notNull().default(""),
  /** pending | approved | disputed | void */
  status: varchar("status", { length: 10 }).notNull().default("pending"),
  approvedByUserId: user("approved_by_user_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  idempotencyKey: varchar("idempotency_key", { length: 64 }),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("finance_expenses_project_idx").on(t.projectId, t.date),
  index("finance_expenses_entry_idx").on(t.entryId),
  uniqueIndex("finance_expenses_idem_idx").on(t.projectId, t.idempotencyKey),
]);

/** Lines of an expense (materials): what, how much, at what price. */
export const financeExpenseItemsTable = pgTable("finance_expense_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  expenseId: uuid("expense_id").notNull().references(() => financeExpensesTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  quantity: qty("quantity"),
  unit: varchar("unit", { length: 16 }).notNull().default(""),
  unitPrice: money("unit_price"),
  lineTotal: money("line_total").notNull(),
  /** Category of this line (material vs labour on one receipt); null = the expense's category. */
  category: varchar("category", { length: 24 }),
  /** material (quantity × price) | service (work or fee: one amount). null = older line, decided by its category. */
  kind: varchar("kind", { length: 8 }),
  note: text("note").notNull().default(""),
}, (t) => [index("finance_expense_items_expense_idx").on(t.expenseId)]);

/**
 * Money that moved. Recorded by people, never bank-confirmed (no bank integration).
 *   payment  owner → party (or to a shop without a party)
 *   advance  owner → party for future work / purchases; consumed by expenses funded by that party
 *   refund   party → owner
 */
export const financePaymentsTable = pgTable("finance_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => homeProjectsTable.id, { onDelete: "cascade" }),
  homeId: uuid("home_id").notNull().references(() => homesTable.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 8 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  amount: money("amount").notNull(),
  partyId: uuid("party_id").references(() => financePartiesTable.id, { onDelete: "set null" }),
  payeeName: varchar("payee_name", { length: 200 }).notNull().default(""),
  payerName: varchar("payer_name", { length: 200 }).notNull().default(""),
  purpose: varchar("purpose", { length: 300 }).notNull().default(""),
  method: varchar("method", { length: 12 }).notNull().default(""),
  expenseId: uuid("expense_id"),
  changeOrderId: uuid("change_order_id"),
  proofMediaId: uuid("proof_media_id"),
  /** recorded | confirmed (the other side agreed) | disputed | cancelled */
  status: varchar("status", { length: 10 }).notNull().default("recorded"),
  confirmedByUserId: user("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  idempotencyKey: varchar("idempotency_key", { length: 64 }),
  createdByUserId: user("created_by_user_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("finance_payments_project_idx").on(t.projectId, t.date),
  uniqueIndex("finance_payments_idem_idx").on(t.projectId, t.idempotencyKey),
]);

export type HomeProjectRow = typeof homeProjectsTable.$inferSelect;
export type FinancePartyRow = typeof financePartiesTable.$inferSelect;
export type FinanceExpenseRow = typeof financeExpensesTable.$inferSelect;
export type FinanceExpenseItemRow = typeof financeExpenseItemsTable.$inferSelect;
export type FinancePaymentRow = typeof financePaymentsTable.$inferSelect;
export type FinanceChangeOrderRow = typeof financeChangeOrdersTable.$inferSelect;
export type FinanceBudgetVersionRow = typeof financeBudgetVersionsTable.$inferSelect;
export type FinanceInvoiceRow = typeof financeInvoicesTable.$inferSelect;
