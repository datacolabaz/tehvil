import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// AI Smeta: contractor estimates, budget control and client approval.
// Child rows keep the client-generated id (unique per project only), so their
// primary key is (project_id, id).

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) =>
  numeric(name, { precision: 14, scale: 2, mode: "number" });
const unitPrice = (name: string) =>
  numeric(name, { precision: 14, scale: 4, mode: "number" });
const ratio = (name: string) =>
  numeric(name, { precision: 7, scale: 4, mode: "number" });
const childId = () => varchar("id", { length: 64 }).notNull();
const projectRef = () =>
  uuid("project_id")
    .notNull()
    .references(() => smetaProjectsTable.id, { onDelete: "cascade" });

export interface SmetaContractorProfileJson {
  name: string;
  phone: string;
  email?: string;
  company: string;
  experienceYears: number;
  completedProjects: number;
  rating: number;
}
export interface SmetaDrawingJson {
  id: string;
  fileName: string;
  fileType: "pdf" | "jpg" | "png";
  uploadedAt: string;
  scale: string;
  width: number;
  height: number;
  status: "processing" | "analyzed" | "failed";
  rooms: { id: string; name: string; x: number; y: number; w: number; h: number }[];
  openings: { id: string; kind: "door" | "window"; x1: number; y1: number; x2: number; y2: number }[];
}
export interface SmetaExportJobJson {
  id: string;
  kind: "xlsx" | "pdf";
  status: "processing" | "ready" | "failed";
  createdAt: string;
  fileName: string;
}
export interface SmetaPriceSourceJson {
  kind: "market" | "contractor" | "manual";
  reference?: string;
  updatedAt: string;
}
export interface SmetaQuantitySourceJson {
  kind: "drawing" | "manual" | "template" | "formula";
  label: string;
  measurementIds?: string[];
  factor?: number;
}
export interface SmetaReceiptSuggestionJson {
  merchant: string;
  date: string;
  total: number;
  category: string;
  kind: "material" | "labor" | "other";
  confidence: number;
}

export const smetaProjectsTable = pgTable(
  "smeta_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    district: varchar("district", { length: 100 }).notNull(),
    address: varchar("address", { length: 250 }).notNull(),
    propertyKind: varchar("property_kind", { length: 16 }).notNull(),
    renovationKind: varchar("renovation_kind", { length: 16 }).notNull(),
    quality: varchar("quality", { length: 16 }).notNull(),
    areaM2: numeric("area_m2", { precision: 10, scale: 2, mode: "number" }).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    clientName: varchar("client_name", { length: 120 }).notNull(),
    clientPhone: varchar("client_phone", { length: 32 }).notNull(),
    clientEmail: varchar("client_email", { length: 254 }),
    contractor: jsonb("contractor").$type<SmetaContractorProfileJson>().notNull(),
    completion: integer("completion").notNull().default(0),
    defaultMarginPercentage: ratio("default_margin_percentage").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    estimateId: varchar("estimate_id", { length: 64 }).notNull(),
    estimateVersion: integer("estimate_version").notNull().default(1),
    estimateCreatedAt: timestamp("estimate_created_at", { withTimezone: true }).notNull().defaultNow(),
    validUntil: date("valid_until", { mode: "string" }).notNull(),
    included: jsonb("included").$type<string[]>().notNull().default([]),
    excluded: jsonb("excluded").$type<string[]>().notNull().default([]),
    drawing: jsonb("drawing").$type<SmetaDrawingJson>(),
    exports: jsonb("exports").$type<SmetaExportJobJson[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("smeta_projects_owner_idx").on(table.ownerUserId, table.updatedAt)],
);

export const smetaSectionsTable = pgTable(
  "smeta_estimate_sections",
  {
    projectId: projectRef(),
    id: childId(),
    position: integer("position").notNull(),
    category: varchar("category", { length: 24 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.id] })],
);

export const smetaLineItemsTable = pgTable(
  "smeta_line_items",
  {
    projectId: projectRef(),
    id: childId(),
    sectionId: varchar("section_id", { length: 64 }).notNull(),
    position: integer("position").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    zone: varchar("zone", { length: 120 }).notNull(),
    unit: varchar("unit", { length: 16 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    materialUnitPrice: unitPrice("material_unit_price").notNull(),
    laborUnitPrice: unitPrice("labor_unit_price").notNull(),
    additionalCost: money("additional_cost").notNull(),
    wastePercentage: ratio("waste_percentage").notNull(),
    marginPercentage: ratio("margin_percentage"),
    priceSource: jsonb("price_source").$type<SmetaPriceSourceJson>().notNull(),
    quantitySource: jsonb("quantity_source").$type<SmetaQuantitySourceJson>().notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    materialId: varchar("material_id", { length: 64 }),
    laborRateId: varchar("labor_rate_id", { length: 64 }),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.id] }),
    index("smeta_line_items_section_idx").on(table.projectId, table.sectionId),
    foreignKey({
      columns: [table.projectId, table.sectionId],
      foreignColumns: [smetaSectionsTable.projectId, smetaSectionsTable.id],
    }).onDelete("cascade"),
  ],
);

export const smetaProjectCostsTable = pgTable(
  "smeta_project_costs",
  {
    projectId: projectRef(),
    id: childId(),
    position: integer("position").notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    amount: money("amount").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.id] })],
);

export const smetaMeasurementsTable = pgTable(
  "smeta_measurements",
  {
    projectId: projectRef(),
    id: childId(),
    position: integer("position").notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    value: numeric("value", { precision: 14, scale: 3, mode: "number" }).notNull(),
    unit: varchar("unit", { length: 8 }).notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3, mode: "number" }).notNull(),
    source: varchar("source", { length: 250 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    roomId: varchar("room_id", { length: 64 }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.id] })],
);

export const smetaChangeOrdersTable = pgTable(
  "smeta_change_orders",
  {
    projectId: projectRef(),
    id: childId(),
    number: integer("number").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    requestedBy: varchar("requested_by", { length: 16 }).notNull(),
    requestedByName: varchar("requested_by_name", { length: 120 }).notNull(),
    category: varchar("category", { length: 24 }).notNull(),
    materialDelta: money("material_delta").notNull(),
    laborDelta: money("labor_delta").notNull(),
    additionalCost: money("additional_cost").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    photoIds: jsonb("photo_ids").$type<string[]>().notNull().default([]),
    lineItemIds: jsonb("line_item_ids").$type<string[]>().notNull().default([]),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** `client` when decided on the public page; such decisions cannot be overwritten by the contractor. */
    decidedBy: varchar("decided_by", { length: 16 }),
    decisionNote: varchar("decision_note", { length: 1000 }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.id] }),
    index("smeta_change_orders_project_idx").on(table.projectId, table.number),
  ],
);

export const smetaExpensesTable = pgTable(
  "smeta_expenses",
  {
    projectId: projectRef(),
    id: childId(),
    position: integer("position").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    category: varchar("category", { length: 24 }).notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    vendor: varchar("vendor", { length: 160 }).notNull(),
    amount: money("amount").notNull(),
    paymentStatus: varchar("payment_status", { length: 16 }).notNull(),
    receiptId: varchar("receipt_id", { length: 64 }),
    lineItemId: varchar("line_item_id", { length: 64 }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.id] })],
);

export const smetaReceiptsTable = pgTable(
  "smeta_receipts",
  {
    projectId: projectRef(),
    id: childId(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 8 }).notNull(),
    uploadedAt: varchar("uploaded_at", { length: 40 }).notNull(),
    /** Private App Storage path once uploads are wired; metadata only for now. */
    objectPath: text("object_path"),
    aiSuggestion: jsonb("ai_suggestion").$type<SmetaReceiptSuggestionJson>(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.id] })],
);

export const smetaPhotosTable = pgTable(
  "smeta_photos",
  {
    projectId: projectRef(),
    id: childId(),
    position: integer("position").notNull(),
    phase: varchar("phase", { length: 8 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    uploadedBy: varchar("uploaded_by", { length: 120 }).notNull(),
    note: varchar("note", { length: 500 }).notNull(),
    room: varchar("room", { length: 120 }).notNull(),
    category: varchar("category", { length: 24 }).notNull(),
    lineItemId: varchar("line_item_id", { length: 64 }),
    clientVisible: boolean("client_visible").notNull().default(true),
    /** Private App Storage path once uploads are wired; metadata only for now. */
    objectPath: text("object_path"),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.id] })],
);

export const smetaPaymentMilestonesTable = pgTable(
  "smeta_payment_milestones",
  {
    projectId: projectRef(),
    id: childId(),
    position: integer("position").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    share: ratio("share").notNull(),
    condition: varchar("condition", { length: 250 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.id] })],
);

/** Every version sent to the client, frozen. `publicSnapshot` is the only part the public link reads. */
export const smetaEstimateVersionsTable = pgTable(
  "smeta_estimate_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    publicSnapshot: jsonb("public_snapshot").$type<Record<string, unknown>>().notNull(),
    total: money("total").notNull(),
    sentBy: text("sent_by").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("smeta_estimate_versions_project_version_idx").on(table.projectId, table.version)],
);

/** One stable client link per project; it always shows the latest sent version. */
export const smetaSharesTable = pgTable(
  "smeta_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef().unique(),
    token: varchar("token", { length: 64 }).notNull().unique(),
    version: integer("version").notNull(),
    clientName: varchar("client_name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    email: varchar("email", { length: 254 }),
    message: varchar("message", { length: 2000 }).notNull(),
    notifyOnApprove: boolean("notify_on_approve").notNull().default(true),
    attachPdf: boolean("attach_pdf").notNull().default(false),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
);

export const smetaClientApprovalsTable = pgTable(
  "smeta_client_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    version: integer("version").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    consent: boolean("consent").notNull(),
    total: money("total").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("smeta_client_approvals_project_version_idx").on(table.projectId, table.version)],
);

export const smetaRevisionRequestsTable = pgTable(
  "smeta_revision_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    version: integer("version").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    message: varchar("message", { length: 1500 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    createdAt: createdAt(),
  },
  (table) => [index("smeta_revision_requests_project_idx").on(table.projectId, table.createdAt)],
);

export type SmetaProjectRecord = typeof smetaProjectsTable.$inferSelect;
export type SmetaSectionRecord = typeof smetaSectionsTable.$inferSelect;
export type SmetaLineItemRecord = typeof smetaLineItemsTable.$inferSelect;
export type SmetaChangeOrderRecord = typeof smetaChangeOrdersTable.$inferSelect;
export type SmetaShareRecord = typeof smetaSharesTable.$inferSelect;
export type SmetaEstimateVersionRecord = typeof smetaEstimateVersionsTable.$inferSelect;
