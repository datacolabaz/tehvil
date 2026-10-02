import { getAuth } from "@clerk/express";
import { and, eq, max } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateChangeOrderBody,
  CreateChangeOrderParams,
  CreateChangeOrderResponse,
  DecideChangeOrderBody,
  DecideChangeOrderParams,
  DecideChangeOrderResponse,
  ListChangeOrdersParams,
  ListChangeOrdersResponse,
} from "@workspace/api-zod";
import { changeOrdersTable, db, renovationRoomsTable } from "@workspace/db";
import { formatChangeOrder, formatChangeOrders } from "../lib/renovationFormat";
import {
  recordTimelineEvent,
  requireProjectAccess,
} from "../lib/projectAccess";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/change-orders",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListChangeOrdersParams.safeParse(req.params);
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
    const orders = await db
      .select()
      .from(changeOrdersTable)
      .where(eq(changeOrdersTable.projectId, access.project.id));
    res.json(
      ListChangeOrdersResponse.parse(await formatChangeOrders(orders)),
    );
  },
);

router.post(
  "/projects/:projectId/change-orders",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListChangeOrdersParams.safeParse(req.params);
    const body = CreateChangeOrderBody.safeParse(req.body);
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
    if (access.project.scopeStatus !== "approved") {
      res.status(409).json({
        error: "Approve the project scope before creating a change order",
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
    const [last] = await db
      .select({ number: max(changeOrdersTable.number) })
      .from(changeOrdersTable)
      .where(eq(changeOrdersTable.projectId, access.project.id));
    const number = Number(last?.number ?? 0) + 1;
    const [order] = await db
      .insert(changeOrdersTable)
      .values({
        projectId: access.project.id,
        roomId: body.data.roomId ?? null,
        number,
        title: body.data.title,
        reason: body.data.reason,
        description: body.data.description ?? null,
        laborAmount: body.data.laborAmount,
        materialAmount: body.data.materialAmount,
        scheduleImpactDays: body.data.scheduleImpactDays,
        newCompletionDate: body.data.newCompletionDate ?? null,
        status: "submitted",
        createdBy: userId,
      })
      .returning();
    await recordTimelineEvent({
      projectId: access.project.id,
      actorUserId: userId,
      actorRole: access.role,
      action: "change_order.submitted",
      detail: `Dəyişiklik sifarişi #${number}: ${order.title}`,
      entityType: "change_order",
      entityId: order.id,
    });
    res.status(201).json(
      CreateChangeOrderResponse.parse(await formatChangeOrder(order)),
    );
  },
);

router.post(
  "/change-orders/:changeOrderId/decision",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = DecideChangeOrderParams.safeParse(req.params);
    const body = DecideChangeOrderBody.safeParse(req.body);
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
    if (!/^[0-9a-f-]{36}$/i.test(params.data.changeOrderId)) {
      res.status(400).json({ error: "Invalid change order ID" });
      return;
    }
    const [order] = await db
      .select()
      .from(changeOrdersTable)
      .where(eq(changeOrdersTable.id, params.data.changeOrderId))
      .limit(1);
    if (!order) {
      res.status(404).json({ error: "Change order not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      order.projectId,
      userId,
      ["owner", "contractor"],
    );
    if (!access) return;
    if (order.createdBy === userId) {
      res.status(403).json({ error: "The author cannot decide this request" });
      return;
    }
    if (order.status === "approved" || order.status === "rejected") {
      res.status(409).json({ error: "This change order has already been decided" });
      return;
    }

    const status =
      body.data.decision === "approve"
        ? "approved"
        : body.data.decision === "reject"
          ? "rejected"
          : "needs_clarification";
    const [updated] = await db
      .update(changeOrdersTable)
      .set({
        status,
        decidedBy: userId,
        decidedAt: new Date(),
        decisionComment: body.data.comment ?? null,
      })
      .where(eq(changeOrdersTable.id, order.id))
      .returning();
    if (status === "approved" && order.newCompletionDate) {
      const { renovationProjectsTable } = await import("@workspace/db");
      await db
        .update(renovationProjectsTable)
        .set({ plannedCompletionDate: order.newCompletionDate })
        .where(eq(renovationProjectsTable.id, order.projectId));
    }
    await recordTimelineEvent({
      projectId: order.projectId,
      actorUserId: userId,
      actorRole: access.role,
      action: `change_order.${status}`,
      detail: `Dəyişiklik sifarişi #${order.number}: ${body.data.comment || status}`,
      entityType: "change_order",
      entityId: order.id,
    });
    res.json(
      DecideChangeOrderResponse.parse(await formatChangeOrder(updated)),
    );
  },
);

export default router;