import { randomBytes } from "node:crypto";
import { getAuth } from "@clerk/express";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  CreateSmetaProjectBody,
  CreateSmetaProjectResponse,
  DeleteSmetaProjectParams,
  DeleteSmetaProjectResponse,
  GetSmetaProjectParams,
  GetSmetaProjectResponse,
  ListSmetaProjectsResponse,
  RevokeSmetaShareParams,
  RevokeSmetaShareResponse,
  ShareSmetaEstimateBody,
  ShareSmetaEstimateParams,
  ShareSmetaEstimateResponse,
  UpdateSmetaProjectBody,
  UpdateSmetaProjectParams,
  UpdateSmetaProjectResponse,
} from "@workspace/api-zod";
import {
  db,
  smetaEstimateVersionsTable,
  smetaLineItemsTable,
  smetaProjectsTable,
  smetaSharesTable,
} from "@workspace/db";
import { findCompanyProfile, toPublicCompany } from "../lib/contractorAccount";
import { buildPublicSnapshot, estimateTotal, stableStringify } from "../lib/smetaCalc";
import { notifySmeta } from "../lib/smetaNotifications";
import {
  editableProjectColumns,
  findOwnedSmetaProject,
  loadSmetaProjects,
  parseTimestamp,
  replaceSmetaChildren,
  type SmetaVersionSnapshot,
} from "../lib/smetaRecords";

const router: IRouter = Router();

/** Default link validity after each send (the company profile can set 7–90 days); enforced on every public request. */
export const SMETA_SHARE_DAYS = 30;
const DAY_MS = 86_400_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function origin(req: Request) {
  if (process.env.PUBLIC_APP_URL) return new URL(process.env.PUBLIC_APP_URL).origin;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${host}`;
}

async function loadOne(projectId: string) {
  const [record] = await db.select().from(smetaProjectsTable).where(eq(smetaProjectsTable.id, projectId));
  const [project] = await loadSmetaProjects(record ? [record] : []);
  return project;
}

router.get("/smeta/projects", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const records = await db.select().from(smetaProjectsTable)
    .where(eq(smetaProjectsTable.ownerUserId, userId))
    .orderBy(desc(smetaProjectsTable.updatedAt));
  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListSmetaProjectsResponse.parse(await loadSmetaProjects(records)));
});

router.post("/smeta/projects", async (req, res): Promise<void> => {
  const body = CreateSmetaProjectBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid estimate project" }); return; }
  const userId = getAuth(req).userId!;
  const input = body.data;
  if (input.id) {
    const [existing] = await db.select({ id: smetaProjectsTable.id }).from(smetaProjectsTable).where(eq(smetaProjectsTable.id, input.id));
    if (existing) { res.status(409).json({ error: "This project already exists" }); return; }
  }
  const projectId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(smetaProjectsTable).values({
      ...(input.id ? { id: input.id } : {}),
      ownerUserId: userId,
      ...editableProjectColumns(input),
      status: "draft",
      estimateId: input.estimate.id,
      estimateVersion: 1,
      estimateCreatedAt: parseTimestamp(input.estimate.createdAt),
      validUntil: input.estimate.validUntil,
    }).returning({ id: smetaProjectsTable.id });
    await replaceSmetaChildren(tx, created.id, input);
    return created.id;
  });
  res.status(201).json(CreateSmetaProjectResponse.parse(await loadOne(projectId)));
});

router.get("/smeta/projects/:projectId", async (req, res): Promise<void> => {
  const params = GetSmetaProjectParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Project not found" }); return; }
  const record = await findOwnedSmetaProject(params.data.projectId, getAuth(req).userId!);
  if (!record) { res.status(404).json({ error: "Project not found" }); return; }
  const [project] = await loadSmetaProjects([record]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetSmetaProjectResponse.parse(project));
});

router.put("/smeta/projects/:projectId", async (req, res): Promise<void> => {
  const params = UpdateSmetaProjectParams.safeParse(req.params);
  const body = UpdateSmetaProjectBody.safeParse(req.body);
  if (!params.success) { res.status(404).json({ error: "Project not found" }); return; }
  if (!body.success) { res.status(400).json({ error: "Invalid estimate project" }); return; }
  const record = await findOwnedSmetaProject(params.data.projectId, getAuth(req).userId!);
  if (!record) { res.status(404).json({ error: "Project not found" }); return; }
  await db.transaction(async (tx) => {
    await tx.update(smetaProjectsTable).set({ ...editableProjectColumns(body.data), updatedAt: new Date() })
      .where(eq(smetaProjectsTable.id, record.id));
    await replaceSmetaChildren(tx, record.id, body.data);
  });
  res.json(UpdateSmetaProjectResponse.parse(await loadOne(record.id)));
});

router.delete("/smeta/projects/:projectId", async (req, res): Promise<void> => {
  const params = DeleteSmetaProjectParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Project not found" }); return; }
  const record = await findOwnedSmetaProject(params.data.projectId, getAuth(req).userId!);
  if (!record) { res.status(404).json({ error: "Project not found" }); return; }
  await db.delete(smetaProjectsTable).where(eq(smetaProjectsTable.id, record.id));
  res.json(DeleteSmetaProjectResponse.parse({ success: true, message: "Project deleted" }));
});

router.post("/smeta/projects/:projectId/share", async (req, res): Promise<void> => {
  const params = ShareSmetaEstimateParams.safeParse(req.params);
  const body = ShareSmetaEstimateBody.safeParse(req.body);
  if (!params.success) { res.status(404).json({ error: "Project not found" }); return; }
  if (!body.success || (body.data.email && !EMAIL.test(body.data.email.trim()))) {
    res.status(400).json({ error: "Invalid share request" });
    return;
  }
  const userId = getAuth(req).userId!;
  const record = await findOwnedSmetaProject(params.data.projectId, userId);
  if (!record) { res.status(404).json({ error: "Project not found" }); return; }
  const [current] = await loadSmetaProjects([record]);
  const [last] = await db.select({ snapshot: smetaEstimateVersionsTable.snapshot }).from(smetaEstimateVersionsTable)
    .where(eq(smetaEstimateVersionsTable.projectId, record.id))
    .orderBy(desc(smetaEstimateVersionsTable.version)).limit(1);
  const lastSnapshot = last?.snapshot as unknown as SmetaVersionSnapshot | undefined;

  // Same rule as the contractor screen: line statuses do not count as a change.
  const ignoreStatus = new Set(["status"]);
  const changed = !lastSnapshot
    || stableStringify(lastSnapshot.estimate.sections, ignoreStatus) !== stableStringify(current.estimate.sections, ignoreStatus)
    || stableStringify(lastSnapshot.projectCosts) !== stableStringify(current.projectCosts)
    || lastSnapshot.margin !== current.defaultMarginPercentage;
  const version = lastSnapshot ? lastSnapshot.estimate.version + (changed ? 1 : 0) : current.estimate.version;

  const profile = await findCompanyProfile(userId);
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + (profile?.defaultValidityDays ?? SMETA_SHARE_DAYS) * DAY_MS);
  const validUntil = expiresAt.toISOString().slice(0, 10);
  const estimate = {
    ...current.estimate,
    version,
    validUntil,
    sections: current.estimate.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, status: "approved" as const })) })),
  };
  const snapshot: SmetaVersionSnapshot = { estimate, projectCosts: current.projectCosts, margin: current.defaultMarginPercentage };
  const publicSnapshot = {
    ...buildPublicSnapshot(estimate, current.projectCosts, current.defaultMarginPercentage, sentAt),
    ...(profile ? { company: toPublicCompany(profile) } : {}),
  };
  const total = estimateTotal(estimate, current.projectCosts, current.defaultMarginPercentage);
  const email = body.data.email?.trim() || null;
  const details = {
    version,
    clientName: body.data.clientName.trim(),
    phone: body.data.phone.trim(),
    email,
    message: body.data.message.trim(),
    notifyOnApprove: body.data.notifyOnApprove,
    attachPdf: body.data.attachPdf,
    sentAt,
    expiresAt,
    revokedAt: null,
  };

  const token = await db.transaction(async (tx) => {
    await tx.update(smetaLineItemsTable).set({ status: "approved" }).where(eq(smetaLineItemsTable.projectId, record.id));
    await tx.update(smetaProjectsTable).set({
      estimateVersion: version,
      validUntil,
      clientName: details.clientName,
      clientPhone: details.phone,
      clientEmail: email ?? record.clientEmail,
      status: changed || record.status === "draft" || record.status === "revision_requested" ? "sent" : record.status,
      updatedAt: sentAt,
    }).where(eq(smetaProjectsTable.id, record.id));
    await tx.insert(smetaEstimateVersionsTable)
      .values({ projectId: record.id, version, snapshot: { ...snapshot }, publicSnapshot: { ...publicSnapshot }, total, sentBy: userId, sentAt })
      .onConflictDoUpdate({
        target: [smetaEstimateVersionsTable.projectId, smetaEstimateVersionsTable.version],
        set: { snapshot: { ...snapshot }, publicSnapshot: { ...publicSnapshot }, total, sentBy: userId, sentAt },
      });
    const [existing] = await tx.select().from(smetaSharesTable).where(eq(smetaSharesTable.projectId, record.id)).for("update");
    // The link stays stable across versions; a revoked link is replaced by a new token.
    const nextToken = existing && !existing.revokedAt ? existing.token : randomBytes(24).toString("base64url");
    if (existing) {
      await tx.update(smetaSharesTable).set({ ...details, token: nextToken }).where(eq(smetaSharesTable.id, existing.id));
    } else {
      await tx.insert(smetaSharesTable).values({ projectId: record.id, token: nextToken, ...details });
    }
    return nextToken;
  });

  // TODO(notify): attach the server-rendered PDF when `attachPdf` is set.
  notifySmeta("estimateSent", {
    projectId: record.id,
    projectName: record.name,
    clientName: details.clientName,
    phone: details.phone,
    email: email ?? undefined,
    url: `${origin(req)}/estimate/${token}`,
    version,
    attachPdf: details.attachPdf,
  });
  res.json(ShareSmetaEstimateResponse.parse(await loadOne(record.id)));
});

router.delete("/smeta/projects/:projectId/share", async (req, res): Promise<void> => {
  const params = RevokeSmetaShareParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Project not found" }); return; }
  const record = await findOwnedSmetaProject(params.data.projectId, getAuth(req).userId!);
  if (!record) { res.status(404).json({ error: "Project not found" }); return; }
  await db.update(smetaSharesTable).set({ revokedAt: new Date() }).where(eq(smetaSharesTable.projectId, record.id));
  res.json(RevokeSmetaShareResponse.parse(await loadOne(record.id)));
});

export default router;
