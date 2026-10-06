import { and, count, eq, sql } from "drizzle-orm";
import type { CompanyProfile, ContractorAccount, SharedEstimateCompany } from "@workspace/api-zod";
import {
  contractorAccountsTable,
  contractorCompanyProfilesTable,
  db,
  projectParticipantsTable,
  renovationProjectsTable,
  smetaClientApprovalsTable,
  smetaPhotosTable,
  smetaProjectsTable,
  smetaSharesTable,
  type ContractorAccountRecord,
  type ContractorCompanyProfileRecord,
} from "@workspace/db";

/**
 * Accounts that already had data before plans existed keep full access (`pesekar`)
 * and skip onboarding, so nobody who used Təhvil before this release is gated.
 */
async function hasExistingData(userId: string): Promise<boolean> {
  const found = await Promise.all([
    db.select({ id: smetaProjectsTable.id }).from(smetaProjectsTable).where(eq(smetaProjectsTable.ownerUserId, userId)).limit(1),
    db.select({ id: renovationProjectsTable.id }).from(renovationProjectsTable).where(eq(renovationProjectsTable.ownerUserId, userId)).limit(1),
    db.select({ id: projectParticipantsTable.id }).from(projectParticipantsTable).where(eq(projectParticipantsTable.userId, userId)).limit(1),
  ]);
  return found.some((rows) => rows.length > 0);
}

export async function ensureContractorAccount(userId: string): Promise<ContractorAccountRecord> {
  const [existing] = await db.select().from(contractorAccountsTable).where(eq(contractorAccountsTable.ownerUserId, userId));
  if (existing) return existing;
  const legacy = await hasExistingData(userId);
  await db.insert(contractorAccountsTable).values({
    ownerUserId: userId,
    ...(legacy ? { plan: "pesekar", planSource: "legacy", onboardingStatus: "skipped" } : {}),
  }).onConflictDoNothing();
  const [created] = await db.select().from(contractorAccountsTable).where(eq(contractorAccountsTable.ownerUserId, userId));
  return created;
}

export async function findCompanyProfile(userId: string): Promise<ContractorCompanyProfileRecord | null> {
  const [profile] = await db.select().from(contractorCompanyProfilesTable).where(eq(contractorCompanyProfilesTable.ownerUserId, userId));
  return profile ?? null;
}

export function companyLogoUrl(profile: ContractorCompanyProfileRecord): string | undefined {
  if (!profile.logoObjectPath) return undefined;
  return `/api/company-logos/${profile.id}?v=${profile.logoUpdatedAt?.getTime() ?? 0}`;
}

export const isProfileComplete = (p: ContractorCompanyProfileRecord) =>
  p.companyName.trim().length >= 2 && p.phone.trim().length >= 9 && p.city.trim().length > 0;

export function toCompanyProfile(p: ContractorCompanyProfileRecord): CompanyProfile {
  return {
    id: p.id,
    companyName: p.companyName,
    description: p.description,
    city: p.city,
    serviceArea: p.serviceArea,
    phone: p.phone,
    email: p.email,
    website: p.website ?? undefined,
    instagram: p.instagram ?? undefined,
    services: p.services,
    teamMembers: p.teamMembers,
    logoUrl: companyLogoUrl(p),
    defaultPaymentTerms: p.defaultPaymentTerms as CompanyProfile["defaultPaymentTerms"],
    paymentTermsNote: p.paymentTermsNote,
    defaultValidityDays: p.defaultValidityDays,
    defaultWastePercentage: p.defaultWastePercentage,
    defaultMarginPercentage: p.defaultMarginPercentage,
    complete: isProfileComplete(p),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** What the client sees on `/estimate/:token`: no team, owner id or internal defaults. */
export function toPublicCompany(p: ContractorCompanyProfileRecord): SharedEstimateCompany {
  const optional = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    name: p.companyName,
    logoUrl: companyLogoUrl(p),
    phone: optional(p.phone),
    email: optional(p.email),
    city: optional(p.city),
    serviceArea: optional(p.serviceArea),
    website: optional(p.website),
    instagram: optional(p.instagram),
    services: p.services,
    paymentTermsNote: optional(p.paymentTermsNote),
  };
}

const phoneDigits = sql`length(regexp_replace(${smetaProjectsTable.clientPhone}, '[^0-9]', '', 'g'))`;

async function checklistFacts(userId: string) {
  const owned = eq(smetaProjectsTable.ownerUserId, userId);
  const [[projects], [clients], [shares], [photos], [approvals]] = await Promise.all([
    db.select({ n: count() }).from(smetaProjectsTable).where(owned),
    db.select({ n: count() }).from(smetaProjectsTable).where(and(owned, sql`${phoneDigits} >= 9`)),
    db.select({ n: count() }).from(smetaSharesTable)
      .innerJoin(smetaProjectsTable, eq(smetaProjectsTable.id, smetaSharesTable.projectId)).where(owned),
    db.select({ n: count() }).from(smetaPhotosTable)
      .innerJoin(smetaProjectsTable, eq(smetaProjectsTable.id, smetaPhotosTable.projectId)).where(owned),
    db.select({ n: count() }).from(smetaClientApprovalsTable)
      .innerJoin(smetaProjectsTable, eq(smetaProjectsTable.id, smetaClientApprovalsTable.projectId)).where(owned),
  ]);
  return {
    projects: Number(projects?.n ?? 0),
    clients: Number(clients?.n ?? 0),
    shares: Number(shares?.n ?? 0),
    photos: Number(photos?.n ?? 0),
    approvals: Number(approvals?.n ?? 0),
  };
}

export async function buildContractorAccount(userId: string): Promise<ContractorAccount> {
  const account = await ensureContractorAccount(userId);
  const [profile, facts] = await Promise.all([findCompanyProfile(userId), checklistFacts(userId)]);
  return {
    onboarding: {
      status: account.onboardingStatus as ContractorAccount["onboarding"]["status"],
      step: account.onboardingStep,
      fullName: account.fullName ?? undefined,
      phone: account.phone ?? undefined,
      businessType: (account.businessType ?? undefined) as ContractorAccount["onboarding"]["businessType"],
      monthlyProjects: (account.monthlyProjects ?? undefined) as ContractorAccount["onboarding"]["monthlyProjects"],
      mainChallenge: (account.mainChallenge ?? undefined) as ContractorAccount["onboarding"]["mainChallenge"],
      completedAt: account.onboardingCompletedAt?.toISOString(),
    },
    plan: {
      id: account.plan as ContractorAccount["plan"]["id"],
      source: account.planSource as ContractorAccount["plan"]["source"],
    },
    checklist: {
      dismissed: Boolean(account.checklistDismissedAt),
      items: {
        companyProfile: profile ? isProfileComplete(profile) : false,
        firstEstimate: facts.projects > 0,
        clientAdded: facts.clients > 0,
        estimateShared: facts.shares > 0,
        photoEvidence: facts.photos > 0,
      },
      firstApproval: facts.approvals > 0,
    },
    usage: { smetaProjects: facts.projects },
    profile: profile ? toCompanyProfile(profile) : undefined,
  };
}
