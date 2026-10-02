import { createHash, randomBytes } from "node:crypto";
import { getAuth } from "@clerk/express";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Router, type Request } from "express";
import {
  ArchiveProjectParams, ArchiveProjectResponse, CreateScopeVersionParams, CreateScopeVersionResponse,
  UpdateScopeItemParams, UpdateScopeItemBody, UpdateScopeItemResponse,
  CreatePassportShareParams, CreatePassportShareBody, CreatePassportShareResponse,
  RevokePassportShareParams, RevokePassportShareResponse, GetSharedPassportParams, GetSharedPassportResponse,
  ListPassportSharesParams, ListPassportSharesResponse,
} from "@workspace/api-zod";
import { db, passportSharesTable, renovationProjectsTable, renovationRoomsTable, scopeItemsTable } from "@workspace/db";
import { formatProject, formatScopeItem } from "../lib/renovationFormat";
import { recordTimelineEvent, requireProjectAccess } from "../lib/projectAccess";
import { buildPassport } from "../lib/passport";

const router = Router();
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
function origin(req: Request) {
  if (process.env.PUBLIC_APP_URL) return new URL(process.env.PUBLIC_APP_URL).origin;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${host}`;
}

router.get("/shared-passports/:token", async (req, res) => {
  const parsed = GetSharedPassportParams.safeParse(req.params);
  if (!parsed.success) { res.status(404).json({ error: "Invalid share link" }); return; }
  const [share] = await db.select().from(passportSharesTable).where(and(
    eq(passportSharesTable.tokenHash, hash(parsed.data.token)),
    gt(passportSharesTable.expiresAt, new Date()), isNull(passportSharesTable.revokedAt),
  )).limit(1);
  if (!share) { res.status(404).json({ error: "Share link expired or revoked" }); return; }
  const [project] = await db.select().from(renovationProjectsTable).where(eq(renovationProjectsTable.id, share.projectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  const passport = await buildPassport(project, "viewer");
  // Public summaries never expose private storage paths, audit details, or receipt notes.
  passport.timeline = [];
  passport.milestones = passport.milestones.map(m => ({ ...m, media: [], note: null }));
  passport.payments = share.includeFinancial ? passport.payments.map(p => ({ ...p, media: [], note: null })) : [];
  passport.changeOrders = passport.changeOrders.filter(c => c.status === "approved").map(c => ({
    ...c, reason: "", description: null, decisionComment: null, createdBy: "",
    laborAmount: share.includeFinancial ? c.laborAmount : 0,
    materialAmount: share.includeFinancial ? c.materialAmount : 0,
    totalAmount: share.includeFinancial ? c.totalAmount : 0,
  }));
  passport.scopeItems = passport.scopeItems.map(s => ({
    ...s, description: null,
    laborAmount: share.includeFinancial ? s.laborAmount : null,
    materialEstimate: share.includeFinancial ? s.materialEstimate : null,
  }));
  if (!share.includeFinancial) passport.project = { ...passport.project, budget: null, approvedBudget: 0, approvedChanges: 0 };
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetSharedPassportResponse.parse({ passport, includeFinancial: share.includeFinancial, expiresAt: share.expiresAt.toISOString() }));
});

router.use((req, res, next) => {
  if (!getAuth(req).userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
});

router.post("/projects/:projectId/archive", async (req, res) => {
  const params = ArchiveProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid project" }); return; }
  const userId = getAuth(req).userId!;
  const access = await requireProjectAccess(res, params.data.projectId, userId, ["owner"]);
  if (!access) return;
  const [updated] = await db.update(renovationProjectsTable).set({ archived: true })
    .where(eq(renovationProjectsTable.id, access.project.id)).returning();
  await recordTimelineEvent({ projectId: updated.id, actorUserId: userId, actorRole: access.role, action: "project.archived", detail: "Layihə yalnız oxuma rejimində arxivləşdirildi" });
  res.json(ArchiveProjectResponse.parse(await formatProject(updated, access.role)));
});

router.post("/projects/:projectId/scope/new-version", async (req, res) => {
  const params = CreateScopeVersionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid project" }); return; }
  const userId = getAuth(req).userId!;
  const access = await requireProjectAccess(res, params.data.projectId, userId, ["owner", "contractor"]);
  if (!access) return;
  const version = await db.transaction(async tx => {
    const [project] = await tx.select().from(renovationProjectsTable).where(eq(renovationProjectsTable.id, access.project.id)).for("update");
    if (project.scopeStatus === "draft") return null;
    const items = await tx.select().from(scopeItemsTable).where(and(eq(scopeItemsTable.projectId, project.id), eq(scopeItemsTable.scopeVersion, project.scopeVersion)));
    const next = project.scopeVersion + 1;
    if (items.length) await tx.insert(scopeItemsTable).values(items.map(({ id: _id, createdAt: _at, ...item }) => ({ ...item, scopeVersion: next, status: item.inclusionType === "excluded" ? "excluded" : "draft", createdBy: userId })));
    await tx.update(renovationProjectsTable).set({ scopeVersion: next, scopeStatus: "draft", ownerScopeApprovedAt: null, contractorScopeApprovedAt: null }).where(eq(renovationProjectsTable.id, project.id));
    return next;
  });
  if (version === null) { res.status(409).json({ error: "An editable draft already exists" }); return; }
  await recordTimelineEvent({ projectId: access.project.id, actorUserId: userId, actorRole: access.role, action: "scope.version_created", detail: `İş həcmi v${version} yaradıldı; əvvəlki versiya saxlanılıb` });
  res.json(CreateScopeVersionResponse.parse({ success: true, message: `Scope v${version} created` }));
});

router.put("/projects/:projectId/scope-items/:scopeItemId", async (req, res) => {
  const params = UpdateScopeItemParams.safeParse(req.params), body = UpdateScopeItemBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid scope item" }); return; }
  const userId = getAuth(req).userId!;
  const access = await requireProjectAccess(res, params.data.projectId, userId, ["owner", "contractor"]);
  if (!access) return;
  if (access.project.scopeStatus !== "draft") { res.status(409).json({ error: "Only draft scope items can be edited" }); return; }
  if (body.data.roomId) {
    const [room] = await db.select({ id: renovationRoomsTable.id }).from(renovationRoomsTable).where(and(eq(renovationRoomsTable.id, body.data.roomId), eq(renovationRoomsTable.projectId, access.project.id)));
    if (!room) { res.status(400).json({ error: "Room belongs to another project" }); return; }
  }
  const [updated] = await db.update(scopeItemsTable).set({
    ...body.data, roomId: body.data.roomId ?? null, status: body.data.inclusionType === "excluded" ? "excluded" : "draft",
  }).where(and(eq(scopeItemsTable.id, params.data.scopeItemId), eq(scopeItemsTable.projectId, access.project.id), eq(scopeItemsTable.scopeVersion, access.project.scopeVersion))).returning();
  if (!updated) { res.status(404).json({ error: "Draft item not found" }); return; }
  await recordTimelineEvent({ projectId: access.project.id, actorUserId: userId, actorRole: access.role, action: "scope.item_updated", detail: `v${access.project.scopeVersion}: ${updated.title}`, entityType: "scope_item", entityId: updated.id });
  res.json(UpdateScopeItemResponse.parse(await formatScopeItem(updated)));
});

router.get("/projects/:projectId/passport/shares", async (req, res) => {
  const params = ListPassportSharesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid project" }); return; }
  const access = await requireProjectAccess(res, params.data.projectId, getAuth(req).userId!);
  if (!access) return;
  if (access.role !== "owner") { res.status(403).json({ error: "Only the owner can manage shares" }); return; }
  const shares = await db.select({
    id: passportSharesTable.id, expiresAt: passportSharesTable.expiresAt,
    includeFinancial: passportSharesTable.includeFinancial, revokedAt: passportSharesTable.revokedAt,
  }).from(passportSharesTable).where(eq(passportSharesTable.projectId, access.project.id))
    .orderBy(desc(passportSharesTable.createdAt));
  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListPassportSharesResponse.parse(shares.map(s => ({
    ...s, expiresAt: s.expiresAt.toISOString(), revokedAt: s.revokedAt?.toISOString() ?? null,
  }))));
});

router.post("/projects/:projectId/passport/shares", async (req, res) => {
  const params = CreatePassportShareParams.safeParse(req.params), body = CreatePassportShareBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid share request" }); return; }
  const userId = getAuth(req).userId!;
  const access = await requireProjectAccess(res, params.data.projectId, userId);
  if (!access) return;
  if (access.role !== "owner") { res.status(403).json({ error: "Only the owner can share a passport" }); return; }
  const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 7 * 86400000);
  const [share] = await db.insert(passportSharesTable).values({ projectId: access.project.id, tokenHash: hash(token), includeFinancial: body.data.includeFinancial, expiresAt }).returning();
  await recordTimelineEvent({ projectId: access.project.id, actorUserId: userId, actorRole: access.role, action: "passport.shared", detail: "7 günlük yalnız oxuma keçidi yaradıldı" });
  res.status(201).json(CreatePassportShareResponse.parse({ id: share.id, url: `${origin(req)}/share/${token}`, expiresAt: expiresAt.toISOString(), includeFinancial: share.includeFinancial }));
});

router.delete("/projects/:projectId/passport/shares/:shareId", async (req, res) => {
  const params = RevokePassportShareParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid share" }); return; }
  const userId = getAuth(req).userId!;
  const access = await requireProjectAccess(res, params.data.projectId, userId);
  if (!access) return;
  if (access.role !== "owner") { res.status(403).json({ error: "Only the owner can revoke a share" }); return; }
  const [share] = await db.update(passportSharesTable).set({ revokedAt: new Date() }).where(and(eq(passportSharesTable.id, params.data.shareId), eq(passportSharesTable.projectId, access.project.id))).returning();
  if (!share) { res.status(404).json({ error: "Share not found" }); return; }
  await recordTimelineEvent({ projectId: access.project.id, actorUserId: userId, actorRole: access.role, action: "passport.share_revoked", detail: "Paylaşım keçidi ləğv edildi" });
  res.json(RevokePassportShareResponse.parse({ success: true, message: "Share revoked" }));
});

export default router;