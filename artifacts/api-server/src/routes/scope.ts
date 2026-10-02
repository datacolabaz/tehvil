import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ApproveScopeBody,
  ApproveScopeResponse,
  CreateRoomBody,
  CreateRoomResponse,
  CreateScopeItemBody,
  CreateScopeItemResponse,
  ListRoomsParams,
  ListRoomsResponse,
  ListScopeItemsParams,
  ListScopeItemsResponse,
  SubmitScopeParams,
  SubmitScopeResponse,
} from "@workspace/api-zod";
import {
  db,
  renovationProjectsTable,
  renovationRoomsTable,
  scopeItemsTable,
} from "@workspace/db";
import { formatScopeItem, formatScopeItems } from "../lib/renovationFormat";
import {
  recordTimelineEvent,
  requireProjectAccess,
} from "../lib/projectAccess";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/rooms",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListRoomsParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
    );
    if (!access) return;

    const [rooms, scopeItems] = await Promise.all([
      db
        .select()
        .from(renovationRoomsTable)
        .where(eq(renovationRoomsTable.projectId, access.project.id)),
      db
        .select()
        .from(scopeItemsTable)
        .where(
          and(
            eq(scopeItemsTable.projectId, access.project.id),
            eq(scopeItemsTable.scopeVersion, access.project.scopeVersion),
          ),
        ),
    ]);
    const result = rooms.map((room) => ({
      id: room.id,
      projectId: room.projectId,
      name: room.name,
      itemCount: scopeItems.filter((item) => item.roomId === room.id).length,
    }));
    res.json(ListRoomsResponse.parse(result));
  },
);

router.post(
  "/projects/:projectId/rooms",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListRoomsParams.safeParse(req.params);
    const body = CreateRoomBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success ? params.error.message : body.error?.message ?? "Invalid request",
      });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
      ["owner", "contractor"],
    );
    if (!access) return;
    if (access.project.scopeStatus !== "draft") {
      res.status(409).json({
        error: "Start a new scope version before changing approved scope",
      });
      return;
    }

    const [room] = await db
      .insert(renovationRoomsTable)
      .values({ projectId: access.project.id, name: body.data.name })
      .returning();
    await recordTimelineEvent({
      projectId: access.project.id,
      actorUserId: userId,
      actorRole: access.role,
      action: "scope.room_added",
      detail: `Ərazi əlavə edildi: ${room.name}`,
      entityType: "room",
      entityId: room.id,
    });
    res.status(201).json(
      CreateRoomResponse.parse({
        id: room.id,
        projectId: room.projectId,
        name: room.name,
        itemCount: 0,
      }),
    );
  },
);

router.get(
  "/projects/:projectId/scope-items",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListScopeItemsParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
    );
    if (!access) return;

    const items = await db
      .select()
      .from(scopeItemsTable)
      .where(
        and(
          eq(scopeItemsTable.projectId, access.project.id),
          eq(scopeItemsTable.scopeVersion, access.project.scopeVersion),
        ),
      );
    res.json(
      ListScopeItemsResponse.parse(await formatScopeItems(items)),
    );
  },
);

router.post(
  "/projects/:projectId/scope-items",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListScopeItemsParams.safeParse(req.params);
    const body = CreateScopeItemBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success ? params.error.message : body.error?.message ?? "Invalid request",
      });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
      ["owner", "contractor"],
    );
    if (!access) return;
    if (access.project.scopeStatus !== "draft") {
      res.status(409).json({
        error: "Start a new scope version before changing approved scope",
      });
      return;
    }
    if (body.data.roomId) {
      const [room] = await db
        .select({ id: renovationRoomsTable.id })
        .from(renovationRoomsTable)
        .where(
          and(
            eq(renovationRoomsTable.id, body.data.roomId),
            eq(renovationRoomsTable.projectId, access.project.id),
          ),
        )
        .limit(1);
      if (!room) {
        res.status(400).json({ error: "Room does not belong to this project" });
        return;
      }
    }

    const [item] = await db
      .insert(scopeItemsTable)
      .values({
        projectId: access.project.id,
        roomId: body.data.roomId ?? null,
        scopeVersion: access.project.scopeVersion,
        title: body.data.title,
        description: body.data.description ?? null,
        inclusionType: body.data.inclusionType,
        materialResponsibility: body.data.materialResponsibility,
        laborAmount: body.data.laborAmount ?? null,
        materialEstimate: body.data.materialEstimate ?? null,
        warrantyMonths: body.data.warrantyMonths ?? null,
        status: body.data.inclusionType === "excluded" ? "excluded" : "draft",
        createdBy: userId,
      })
      .returning();
    await recordTimelineEvent({
      projectId: access.project.id,
      actorUserId: userId,
      actorRole: access.role,
      action: "scope.item_added",
      detail: `${body.data.inclusionType === "included" ? "Daxildir" : "Daxil deyil"}: ${item.title}`,
      entityType: "scope_item",
      entityId: item.id,
    });
    res.status(201).json(
      CreateScopeItemResponse.parse(await formatScopeItem(item)),
    );
  },
);

router.post(
  "/projects/:projectId/scope/submit",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = SubmitScopeParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
      ["owner", "contractor"],
    );
    if (!access) return;
    if (access.project.scopeStatus !== "draft") {
      res.status(409).json({ error: "Scope is not in draft" });
      return;
    }
    const [includedItem] = await db
      .select({ id: scopeItemsTable.id })
      .from(scopeItemsTable)
      .where(
        and(
          eq(scopeItemsTable.projectId, access.project.id),
          eq(scopeItemsTable.scopeVersion, access.project.scopeVersion),
          eq(scopeItemsTable.inclusionType, "included"),
        ),
      )
      .limit(1);
    if (!includedItem) {
      res.status(400).json({ error: "Add at least one included work item first" });
      return;
    }
    await db
      .update(renovationProjectsTable)
      .set({
        scopeStatus: "pending_approval",
        ownerScopeApprovedAt: null,
        contractorScopeApprovedAt: null,
      })
      .where(eq(renovationProjectsTable.id, access.project.id));
    await recordTimelineEvent({
      projectId: access.project.id,
      actorUserId: userId,
      actorRole: access.role,
      action: "scope.submitted",
      detail: `İş həcminin ${access.project.scopeVersion}-ci versiyası təsdiqə göndərildi`,
      entityType: "scope",
    });
    res.json(
      SubmitScopeResponse.parse({
        success: true,
        message: "İş həcmi qarşı tərəfin təsdiqinə göndərildi",
      }),
    );
  },
);

router.post(
  "/projects/:projectId/scope/approve",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = SubmitScopeParams.safeParse(req.params);
    const body = ApproveScopeBody.safeParse(req.body ?? {});
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success ? params.error.message : body.error?.message ?? "Invalid request",
      });
      return;
    }
    const access = await requireProjectAccess(
      res,
      params.data.projectId,
      userId,
      ["owner", "contractor"],
    );
    if (!access) return;
    if (access.project.scopeStatus !== "pending_approval") {
      res.status(409).json({ error: "No pending scope approval" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(renovationProjectsTable)
        .where(eq(renovationProjectsTable.id, access.project.id)).for("update");
      if (current.scopeStatus !== "pending_approval") return null;
      const now = new Date();
      const ownerApprovedAt = current.ownerScopeApprovedAt ?? (access.role === "owner" ? now : null);
      const contractorApprovedAt = current.contractorScopeApprovedAt ?? (access.role === "contractor" ? now : null);
      const fullyApproved = Boolean(ownerApprovedAt && contractorApprovedAt);
      await tx
      .update(renovationProjectsTable)
      .set({
        ownerScopeApprovedAt: ownerApprovedAt,
        contractorScopeApprovedAt: contractorApprovedAt,
        scopeStatus: fullyApproved ? "approved" : "pending_approval",
      })
      .where(eq(renovationProjectsTable.id, access.project.id));
      if (fullyApproved) {
        await tx
        .update(scopeItemsTable)
        .set({ status: "active" })
        .where(
          and(
            eq(scopeItemsTable.projectId, access.project.id),
            eq(scopeItemsTable.scopeVersion, access.project.scopeVersion),
            eq(scopeItemsTable.inclusionType, "included"),
          ),
        );
      }
      return { fullyApproved };
    });
    if (!result) {
      res.status(409).json({ error: "Scope approval has already completed" });
      return;
    }
    const { fullyApproved } = result;
    await recordTimelineEvent({
      projectId: access.project.id,
      actorUserId: userId,
      actorRole: access.role,
      action: fullyApproved ? "scope.approved" : "scope.approval_recorded",
      detail: `İş həcmi v${access.project.scopeVersion}: ${body.data.comment || "təsdiq qeydə alındı"}`,
      entityType: "scope",
    });
    res.json(
      ApproveScopeResponse.parse({
        success: true,
        message: fullyApproved
          ? "İş həcmi hər iki tərəf tərəfindən təsdiqləndi"
          : "Təsdiq qeydə alındı; digər tərəfin təsdiqi gözlənilir",
      }),
    );
  },
);

export default router;