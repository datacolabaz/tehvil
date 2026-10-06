import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Contractor acquisition: onboarding answers, plan/entitlement, company profile
// shown on client estimates, and demo/lead requests from the public landing page.

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const ratio = (name: string) =>
  numeric(name, { precision: 7, scale: 4, mode: "number" });

export interface CompanyTeamMemberJson {
  name: string;
  role: string;
}

/** One row per Clerk user, created lazily on the first `GET /api/contractor/account`. */
export const contractorAccountsTable = pgTable("contractor_accounts", {
  ownerUserId: text("owner_user_id").primaryKey(),
  fullName: varchar("full_name", { length: 120 }),
  phone: varchar("phone", { length: 32 }),
  businessType: varchar("business_type", { length: 32 }),
  monthlyProjects: varchar("monthly_projects", { length: 16 }),
  mainChallenge: varchar("main_challenge", { length: 32 }),
  signupSource: varchar("signup_source", { length: 40 }),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  /** `pending` (new account), `completed`, or `skipped` (existing users and "later"). */
  onboardingStatus: varchar("onboarding_status", { length: 16 }).notNull().default("pending"),
  onboardingStep: integer("onboarding_step").notNull().default(2),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  checklistDismissedAt: timestamp("checklist_dismissed_at", { withTimezone: true }),
  /** `baslangic` | `pesekar` | `biznes`. No billing: changed manually or by `legacy` backfill. */
  plan: varchar("plan", { length: 16 }).notNull().default("baslangic"),
  /** `default` (new account), `legacy` (had data before plans existed) or `manual`. */
  planSource: varchar("plan_source", { length: 16 }).notNull().default("default"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contractorCompanyProfilesTable = pgTable("contractor_company_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull().unique(),
  companyName: varchar("company_name", { length: 160 }).notNull(),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  city: varchar("city", { length: 80 }).notNull().default(""),
  serviceArea: varchar("service_area", { length: 200 }).notNull().default(""),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  email: varchar("email", { length: 254 }).notNull().default(""),
  website: varchar("website", { length: 250 }),
  instagram: varchar("instagram", { length: 120 }),
  services: jsonb("services").$type<string[]>().notNull().default([]),
  teamMembers: jsonb("team_members").$type<CompanyTeamMemberJson[]>().notNull().default([]),
  /** Private object path (`/objects/uploads/...`); served publicly only through `/api/company-logos/:id`. */
  logoObjectPath: text("logo_object_path"),
  logoContentType: varchar("logo_content_type", { length: 64 }),
  logoUpdatedAt: timestamp("logo_updated_at", { withTimezone: true }),
  /** Payment schedule preset id used for new estimates (see the web app's `lib/contractor/options.ts`). */
  defaultPaymentTerms: varchar("default_payment_terms", { length: 32 }).notNull().default("30-40-30"),
  paymentTermsNote: varchar("payment_terms_note", { length: 500 }).notNull().default(""),
  defaultValidityDays: integer("default_validity_days").notNull().default(30),
  /** Null keeps the per-category waste defaults of the estimate generator. */
  defaultWastePercentage: ratio("default_waste_percentage"),
  defaultMarginPercentage: ratio("default_margin_percentage").notNull().default(0.15),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Demo / contact requests from the public site. TODO(crm): forward through the API's `LeadSink`. */
export const leadRequestsTable = pgTable(
  "lead_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    companyName: varchar("company_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    monthlyProjects: varchar("monthly_projects", { length: 16 }).notNull(),
    mainChallenge: varchar("main_challenge", { length: 500 }).notNull(),
    preferredContactTime: varchar("preferred_contact_time", { length: 16 }).notNull(),
    source: varchar("source", { length: 40 }).notNull(),
    interestedPlan: varchar("interested_plan", { length: 16 }),
    /** Clerk user when the request was sent while signed in (e.g. the upgrade form). */
    userId: text("user_id"),
    status: varchar("status", { length: 16 }).notNull().default("new"),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    createdAt: createdAt(),
  },
  (table) => [index("lead_requests_created_idx").on(table.createdAt)],
);

export type ContractorAccountRecord = typeof contractorAccountsTable.$inferSelect;
export type ContractorCompanyProfileRecord = typeof contractorCompanyProfilesTable.$inferSelect;
export type LeadRequestRecord = typeof leadRequestsTable.$inferSelect;
