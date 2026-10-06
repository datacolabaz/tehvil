import { getAuth } from "@clerk/express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  GetContractorAccountResponse,
  RemoveCompanyLogoResponse,
  SaveCompanyProfileBody,
  SaveCompanyProfileResponse,
  SetCompanyLogoBody,
  SetCompanyLogoResponse,
  UpdateContractorChecklistBody,
  UpdateContractorChecklistResponse,
  UpdateContractorOnboardingBody,
  UpdateContractorOnboardingResponse,
  type ContractorAccount,
} from "@workspace/api-zod";
import {
  contractorAccountsTable,
  contractorCompanyProfilesTable,
  db,
  evidenceUploadsTable,
} from "@workspace/db";
import { buildContractorAccount, ensureContractorAccount, findCompanyProfile } from "../lib/contractorAccount";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function sendAccount(res: Response, userId: string, parse: (v: unknown) => ContractorAccount) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(parse(await buildContractorAccount(userId)));
}

router.get("/contractor/account", async (req, res): Promise<void> => {
  await sendAccount(res, getAuth(req).userId!, (v) => GetContractorAccountResponse.parse(v));
});

router.put("/contractor/onboarding", async (req, res): Promise<void> => {
  const body = UpdateContractorOnboardingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid onboarding answers" }); return; }
  const userId = getAuth(req).userId!;
  const account = await ensureContractorAccount(userId);
  const input = body.data;
  const trimmed = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
  await db.update(contractorAccountsTable).set({
    fullName: trimmed(input.fullName),
    phone: trimmed(input.phone),
    businessType: input.businessType,
    monthlyProjects: input.monthlyProjects,
    mainChallenge: input.mainChallenge,
    signupSource: account.signupSource ?? trimmed(input.signupSource),
    termsAcceptedAt: input.termsAccepted && !account.termsAcceptedAt ? new Date() : undefined,
    onboardingStep: input.step,
    onboardingStatus: input.status,
    onboardingCompletedAt: input.status === "completed" && !account.onboardingCompletedAt ? new Date() : undefined,
    updatedAt: new Date(),
  }).where(eq(contractorAccountsTable.ownerUserId, userId));
  await sendAccount(res, userId, (v) => UpdateContractorOnboardingResponse.parse(v));
});

router.put("/contractor/checklist", async (req, res): Promise<void> => {
  const body = UpdateContractorChecklistBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid checklist update" }); return; }
  const userId = getAuth(req).userId!;
  await ensureContractorAccount(userId);
  await db.update(contractorAccountsTable)
    .set({ checklistDismissedAt: body.data.dismissed ? new Date() : null, updatedAt: new Date() })
    .where(eq(contractorAccountsTable.ownerUserId, userId));
  await sendAccount(res, userId, (v) => UpdateContractorChecklistResponse.parse(v));
});

router.put("/contractor/company-profile", async (req, res): Promise<void> => {
  const body = SaveCompanyProfileBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid company profile" }); return; }
  const input = body.data;
  const email = input.email.trim();
  if (email && !EMAIL.test(email)) { res.status(400).json({ error: "Invalid e-mail address" }); return; }
  const userId = getAuth(req).userId!;
  await ensureContractorAccount(userId);
  const services = [...new Set(input.services.map((s) => s.trim()).filter(Boolean))];
  const teamMembers = input.teamMembers
    .map((m) => ({ name: m.name.trim(), role: m.role.trim() }))
    .filter((m) => m.name);
  const values = {
    companyName: input.companyName.trim(),
    description: input.description.trim(),
    city: input.city.trim(),
    serviceArea: input.serviceArea.trim(),
    phone: input.phone.trim(),
    email,
    website: input.website?.trim() || null,
    instagram: input.instagram?.trim().replace(/^@/, "") || null,
    services,
    teamMembers,
    defaultPaymentTerms: input.defaultPaymentTerms,
    paymentTermsNote: input.paymentTermsNote.trim(),
    defaultValidityDays: input.defaultValidityDays,
    defaultWastePercentage: input.defaultWastePercentage,
    defaultMarginPercentage: input.defaultMarginPercentage,
    updatedAt: new Date(),
  };
  await db.insert(contractorCompanyProfilesTable)
    .values({ ownerUserId: userId, ...values })
    .onConflictDoUpdate({ target: contractorCompanyProfilesTable.ownerUserId, set: values });
  await sendAccount(res, userId, (v) => SaveCompanyProfileResponse.parse(v));
});

router.put("/contractor/company-profile/logo", async (req, res): Promise<void> => {
  const body = SetCompanyLogoBody.safeParse(req.body);
  if (!body.success || !LOGO_TYPES.has(body.data.contentType) || !body.data.objectPath.startsWith("/objects/uploads/")) {
    res.status(400).json({ error: "The logo must be a PNG, JPEG or WebP image up to 2 MB" });
    return;
  }
  const userId = getAuth(req).userId!;
  const profile = await findCompanyProfile(userId);
  if (!profile) { res.status(409).json({ error: "Save the company profile before adding a logo" }); return; }
  const file = body.data;
  const fresh = and(
    eq(evidenceUploadsTable.objectPath, file.objectPath),
    eq(evidenceUploadsTable.userId, userId),
    isNull(evidenceUploadsTable.attachedAt),
    gt(evidenceUploadsTable.expiresAt, new Date()),
  );
  const [upload] = await db.select().from(evidenceUploadsTable).where(fresh).limit(1);
  if (!upload || upload.originalName !== file.originalName || upload.contentType !== file.contentType || upload.size !== file.size) {
    res.status(400).json({ error: "Upload the logo again using a fresh upload URL" });
    return;
  }
  try {
    const object = await new ObjectStorageService().getObjectEntityFile(file.objectPath);
    const [metadata] = await object.getMetadata();
    if (Number(metadata.size) !== file.size || metadata.contentType !== file.contentType) {
      res.status(400).json({ error: "The uploaded logo does not match its declared size or type" });
      return;
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(400).json({ error: "The logo upload was not found" }); return; }
    throw error;
  }
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.update(evidenceUploadsTable).set({ attachedAt: new Date() }).where(fresh).returning();
    if (!rows.length) return false;
    await tx.update(contractorCompanyProfilesTable).set({
      logoObjectPath: file.objectPath,
      logoContentType: file.contentType,
      logoUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(contractorCompanyProfilesTable.id, profile.id));
    return true;
  });
  if (!claimed) { res.status(409).json({ error: "This upload was already used or has expired" }); return; }
  await sendAccount(res, userId, (v) => SetCompanyLogoResponse.parse(v));
});

router.delete("/contractor/company-profile/logo", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  await db.update(contractorCompanyProfilesTable)
    .set({ logoObjectPath: null, logoContentType: null, logoUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(contractorCompanyProfilesTable.ownerUserId, userId));
  await sendAccount(res, userId, (v) => RemoveCompanyLogoResponse.parse(v));
});

export default router;
