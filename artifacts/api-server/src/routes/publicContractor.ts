import { Readable } from "node:stream";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { CreateDemoRequestBody, CreateDemoRequestResponse, GetCompanyLogoParams } from "@workspace/api-zod";
import { contractorCompanyProfilesTable, db, leadRequestsTable } from "@workspace/db";
import { forwardLead } from "../lib/leadSink";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

const logoLimit = rateLimit({ windowMs: 60_000, max: 240, key: (req) => `logo:${req.ip}` });
const leadLimit = rateLimit({ windowMs: 10 * 60_000, max: 5, key: (req) => `lead:${req.ip}` });

export const LEAD_SUCCESS_MESSAGE = "Müraciətiniz qeydə alındı. Təhvil komandası sizinlə əlaqə saxlayacaq.";

/** Logos appear on public estimate pages, so they are served without auth but only through the profile id. */
router.get("/company-logos/:profileId", logoLimit, async (req, res): Promise<void> => {
  const params = GetCompanyLogoParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Logo not found" }); return; }
  const [profile] = await db.select({
    logoObjectPath: contractorCompanyProfilesTable.logoObjectPath,
    logoContentType: contractorCompanyProfilesTable.logoContentType,
  }).from(contractorCompanyProfilesTable).where(eq(contractorCompanyProfilesTable.id, params.data.profileId));
  if (!profile?.logoObjectPath) { res.status(404).json({ error: "Logo not found" }); return; }
  try {
    const storage = new ObjectStorageService();
    const response = await storage.downloadObject(await storage.getObjectEntityFile(profile.logoObjectPath), 0);
    res.status(response.status);
    res.setHeader("Content-Type", profile.logoContentType ?? "application/octet-stream");
    const length = response.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);
    // The URL carries `?v=<logoUpdatedAt>`, so a replaced logo gets a new URL.
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Logo not found" }); return; }
    req.log.error({ err: error }, "Failed to stream company logo");
    res.status(500).json({ error: "Failed to serve logo" });
  }
});

router.post("/demo-requests", leadLimit, async (req, res): Promise<void> => {
  const body = CreateDemoRequestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid demo request" }); return; }
  const input = body.data;
  if (input.website?.trim()) {
    // Honeypot filled: answer like a success so bots learn nothing, store nothing.
    res.status(201).json(CreateDemoRequestResponse.parse({ id: "00000000-0000-0000-0000-000000000000", message: LEAD_SUCCESS_MESSAGE }));
    return;
  }
  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) { res.status(400).json({ error: "Invalid phone number" }); return; }
  const userId = getAuth(req).userId ?? null;
  const [lead] = await db.insert(leadRequestsTable).values({
    fullName: input.fullName.trim(),
    companyName: input.companyName.trim(),
    phone: input.phone.trim(),
    monthlyProjects: input.monthlyProjects,
    mainChallenge: input.mainChallenge.trim(),
    preferredContactTime: input.preferredContactTime,
    source: input.source,
    interestedPlan: input.interestedPlan ?? null,
    userId,
    ipAddress: req.ip?.slice(0, 64) ?? null,
    userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
  }).returning();
  forwardLead({
    id: lead.id,
    fullName: lead.fullName,
    companyName: lead.companyName,
    phone: lead.phone,
    monthlyProjects: lead.monthlyProjects,
    mainChallenge: lead.mainChallenge,
    preferredContactTime: lead.preferredContactTime,
    source: lead.source,
    interestedPlan: lead.interestedPlan ?? undefined,
    userId: lead.userId ?? undefined,
    createdAt: lead.createdAt,
  });
  res.status(201).json(CreateDemoRequestResponse.parse({ id: lead.id, message: LEAD_SUCCESS_MESSAGE }));
});

export default router;
