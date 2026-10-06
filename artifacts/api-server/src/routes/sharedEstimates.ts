import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ApproveSharedEstimateBody,
  ApproveSharedEstimateParams,
  ApproveSharedEstimateResponse,
  DecideSharedChangeOrderBody,
  DecideSharedChangeOrderParams,
  DecideSharedChangeOrderResponse,
  GetSharedEstimateParams,
  GetSharedEstimateResponse,
  RequestSharedEstimateRevisionBody,
  RequestSharedEstimateRevisionParams,
  RequestSharedEstimateRevisionResponse,
  type SharedEstimate,
  type SharedEstimateSnapshot,
} from "@workspace/api-zod";
import {
  db,
  smetaChangeOrdersTable,
  smetaClientApprovalsTable,
  smetaEstimateVersionsTable,
  smetaPaymentMilestonesTable,
  smetaProjectsTable,
  smetaRevisionRequestsTable,
  smetaSharesTable,
} from "@workspace/db";
import { rateLimit } from "../lib/rateLimit";
import { round2 } from "../lib/smetaCalc";
import { notifySmeta } from "../lib/smetaNotifications";

const router: IRouter = Router();

const readLimit = rateLimit({ windowMs: 60_000, max: 120, key: (req) => `r:${req.ip}` });
const writeLimit = rateLimit({ windowMs: 10 * 60_000, max: 10, key: (req) => `w:${req.ip}:${req.params.token}` });

/** Active link only: not revoked and inside its validity window. */
async function findShare(token: string) {
  const [row] = await db.select({ share: smetaSharesTable, project: smetaProjectsTable, version: smetaEstimateVersionsTable })
    .from(smetaSharesTable)
    .innerJoin(smetaProjectsTable, eq(smetaProjectsTable.id, smetaSharesTable.projectId))
    .innerJoin(smetaEstimateVersionsTable, and(
      eq(smetaEstimateVersionsTable.projectId, smetaSharesTable.projectId),
      eq(smetaEstimateVersionsTable.version, smetaSharesTable.version),
    ))
    .where(and(eq(smetaSharesTable.token, token), isNull(smetaSharesTable.revokedAt), gt(smetaSharesTable.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}
type ShareRow = NonNullable<Awaited<ReturnType<typeof findShare>>>;

async function buildSharedEstimate({ share, project, version }: ShareRow): Promise<SharedEstimate> {
  const [changeOrders, payments, approvals, revisions] = await Promise.all([
    db.select().from(smetaChangeOrdersTable).where(eq(smetaChangeOrdersTable.projectId, project.id)),
    db.select().from(smetaPaymentMilestonesTable).where(eq(smetaPaymentMilestonesTable.projectId, project.id)).orderBy(asc(smetaPaymentMilestonesTable.position)),
    db.select().from(smetaClientApprovalsTable).where(and(eq(smetaClientApprovalsTable.projectId, project.id), eq(smetaClientApprovalsTable.version, share.version))),
    db.select().from(smetaRevisionRequestsTable).where(and(eq(smetaRevisionRequestsTable.projectId, project.id), eq(smetaRevisionRequestsTable.version, share.version))).orderBy(asc(smetaRevisionRequestsTable.createdAt)),
  ]);
  const estimate = version.publicSnapshot as unknown as SharedEstimateSnapshot;
  const impact = (c: (typeof changeOrders)[number]) => round2(c.materialDelta + c.laborDelta + c.additionalCost);
  const approvedChangesTotal = round2(changeOrders.filter((c) => c.status === "approved").reduce((sum, c) => sum + impact(c), 0));
  const finalTotal = round2(estimate.total + approvedChangesTotal);
  const approval = approvals[0];
  const revision = approval ? undefined : revisions[revisions.length - 1];
  return {
    project: {
      name: project.name,
      district: project.district,
      propertyKind: project.propertyKind as SharedEstimate["project"]["propertyKind"],
      renovationKind: project.renovationKind as SharedEstimate["project"]["renovationKind"],
      areaM2: project.areaM2,
      included: project.included,
      excluded: project.excluded,
    },
    contractor: {
      name: project.contractor.name,
      company: project.contractor.company,
      phone: project.contractor.phone,
      experienceYears: project.contractor.experienceYears,
      completedProjects: project.contractor.completedProjects,
      rating: project.contractor.rating,
    },
    client: { name: share.clientName, phone: share.phone },
    message: share.message,
    expiresAt: share.expiresAt.toISOString(),
    estimate,
    changeOrders: changeOrders
      .filter((c) => c.status !== "draft")
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        reason: c.reason,
        date: c.date,
        status: c.status as "pending" | "approved" | "rejected",
        impact: impact(c),
      })),
    approvedChangesTotal,
    finalTotal,
    payments: payments.map((m) => ({ id: m.id, title: m.title, share: m.share, condition: m.condition, amount: round2(finalTotal * m.share) })),
    approval: approval ? { approvedAt: approval.approvedAt.toISOString(), name: approval.name } : undefined,
    revisionRequestedAt: revision?.createdAt.toISOString(),
  };
}

const clientMeta = (req: Request) => ({
  ipAddress: req.ip?.slice(0, 64) ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});

function linkGone(res: Response) {
  res.status(404).json({ error: "Share link expired or revoked" });
}

async function respond(res: Response, token: string, parse: (v: unknown) => SharedEstimate) {
  const row = await findShare(token);
  if (!row) { linkGone(res); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(parse(await buildSharedEstimate(row)));
}

router.get("/shared-estimates/:token", readLimit, async (req, res): Promise<void> => {
  const params = GetSharedEstimateParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Invalid share link" }); return; }
  await respond(res, params.data.token, (v) => GetSharedEstimateResponse.parse(v));
});

router.post("/shared-estimates/:token/approve", writeLimit, async (req, res): Promise<void> => {
  const params = ApproveSharedEstimateParams.safeParse(req.params);
  const body = ApproveSharedEstimateBody.safeParse(req.body);
  if (!params.success) { res.status(404).json({ error: "Invalid share link" }); return; }
  if (!body.success || body.data.consent !== true) {
    res.status(400).json({ error: "Name, phone number and confirmation are required" });
    return;
  }
  const row = await findShare(params.data.token);
  if (!row) { linkGone(res); return; }
  if (body.data.version !== row.share.version) {
    res.status(409).json({ error: "A newer version of this estimate was sent. Reload the page to review it." });
    return;
  }
  const [inserted] = await db.insert(smetaClientApprovalsTable).values({
    projectId: row.project.id,
    version: row.share.version,
    name: body.data.name.trim(),
    phone: body.data.phone.trim(),
    consent: true,
    total: row.version.total,
    ...clientMeta(req),
  }).onConflictDoNothing().returning({ id: smetaClientApprovalsTable.id });
  if (inserted) {
    await db.update(smetaProjectsTable).set({ status: "client_approved", updatedAt: new Date() }).where(eq(smetaProjectsTable.id, row.project.id));
    if (row.share.notifyOnApprove) {
      notifySmeta("estimateApproved", {
        projectId: row.project.id, projectName: row.project.name, ownerUserId: row.project.ownerUserId,
        clientName: body.data.name.trim(), version: row.share.version, total: row.version.total,
      });
    }
  }
  await respond(res, params.data.token, (v) => ApproveSharedEstimateResponse.parse(v));
});

router.post("/shared-estimates/:token/revision", writeLimit, async (req, res): Promise<void> => {
  const params = RequestSharedEstimateRevisionParams.safeParse(req.params);
  const body = RequestSharedEstimateRevisionBody.safeParse(req.body);
  if (!params.success) { res.status(404).json({ error: "Invalid share link" }); return; }
  if (!body.success) { res.status(400).json({ error: "Name and a short description of the change are required" }); return; }
  const row = await findShare(params.data.token);
  if (!row) { linkGone(res); return; }
  if (body.data.version !== row.share.version) {
    res.status(409).json({ error: "A newer version of this estimate was sent. Reload the page to review it." });
    return;
  }
  const [approved] = await db.select({ id: smetaClientApprovalsTable.id }).from(smetaClientApprovalsTable)
    .where(and(eq(smetaClientApprovalsTable.projectId, row.project.id), eq(smetaClientApprovalsTable.version, row.share.version)));
  if (approved) { res.status(409).json({ error: "This version is already approved" }); return; }
  await db.insert(smetaRevisionRequestsTable).values({
    projectId: row.project.id,
    version: row.share.version,
    name: body.data.name.trim(),
    message: body.data.message.trim(),
    ...clientMeta(req),
  });
  await db.update(smetaProjectsTable).set({ status: "revision_requested", updatedAt: new Date() }).where(eq(smetaProjectsTable.id, row.project.id));
  notifySmeta("revisionRequested", {
    projectId: row.project.id, projectName: row.project.name, ownerUserId: row.project.ownerUserId,
    clientName: body.data.name.trim(), version: row.share.version, message: body.data.message.trim(),
  });
  await respond(res, params.data.token, (v) => RequestSharedEstimateRevisionResponse.parse(v));
});

router.post("/shared-estimates/:token/change-orders/:changeOrderId/decision", writeLimit, async (req, res): Promise<void> => {
  const params = DecideSharedChangeOrderParams.safeParse(req.params);
  const body = DecideSharedChangeOrderBody.safeParse(req.body);
  if (!params.success) { res.status(404).json({ error: "Invalid share link" }); return; }
  if (!body.success) { res.status(400).json({ error: "Invalid decision" }); return; }
  const row = await findShare(params.data.token);
  if (!row) { linkGone(res); return; }
  const [updated] = await db.update(smetaChangeOrdersTable).set({
    status: body.data.decision,
    decidedAt: new Date(),
    decidedBy: "client",
    decisionNote: body.data.note?.trim() || null,
  }).where(and(
    eq(smetaChangeOrdersTable.projectId, row.project.id),
    eq(smetaChangeOrdersTable.id, params.data.changeOrderId),
    eq(smetaChangeOrdersTable.status, "pending"),
  )).returning({ id: smetaChangeOrdersTable.id });
  if (!updated) { res.status(409).json({ error: "This change is not awaiting your decision" }); return; }
  await db.update(smetaProjectsTable).set({ updatedAt: new Date() }).where(eq(smetaProjectsTable.id, row.project.id));
  await respond(res, params.data.token, (v) => DecideSharedChangeOrderResponse.parse(v));
});

export default router;
