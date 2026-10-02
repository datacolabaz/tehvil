import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ConfirmPaymentReceivedBody,
  ConfirmPaymentReceivedParams,
  ConfirmPaymentReceivedResponse,
  CreatePaymentBody,
  CreatePaymentParams,
  CreatePaymentResponse,
  ListPaymentsParams,
  ListPaymentsResponse,
  MarkPaymentSentBody,
  MarkPaymentSentParams,
  MarkPaymentSentResponse,
} from "@workspace/api-zod";
import { db, projectPaymentsTable } from "@workspace/db";
import { attachProjectMedia } from "../lib/projectMedia";
import { formatPayment } from "../lib/renovationFormat";
import {
  recordTimelineEvent,
  requireProjectAccess,
} from "../lib/projectAccess";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/payments",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ListPaymentsParams.safeParse(req.params);
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
    const payments = await db
      .select()
      .from(projectPaymentsTable)
      .where(eq(projectPaymentsTable.projectId, access.project.id));
    res.json(
      ListPaymentsResponse.parse(
        await Promise.all(payments.map(formatPayment)),
      ),
    );
  },
);

router.post(
  "/projects/:projectId/payments",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = CreatePaymentParams.safeParse(req.params);
    const body = CreatePaymentBody.safeParse(req.body);
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
      ["owner"],
    );
    if (!access) return;
    const [payment] = await db
      .insert(projectPaymentsTable)
      .values({
        projectId: access.project.id,
        title: body.data.title,
        amount: body.data.amount,
        currency: "AZN",
        dueCondition: body.data.dueCondition ?? null,
        dueDate: body.data.dueDate ?? null,
        status: body.data.dueDate && body.data.dueDate <= new Date().toISOString().slice(0, 10)
          ? "due"
          : "planned",
      })
      .returning();
    await recordTimelineEvent({
      projectId: access.project.id,
      actorUserId: userId,
      actorRole: access.role,
      action: "payment.planned",
      detail: `Ödəniş mərhələsi əlavə edildi: ${payment.title}`,
      entityType: "payment",
      entityId: payment.id,
    });
    res.status(201).json(
      CreatePaymentResponse.parse(await formatPayment(payment)),
    );
  },
);

router.post(
  "/payments/:paymentId/mark-sent",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = MarkPaymentSentParams.safeParse(req.params);
    const body = MarkPaymentSentBody.safeParse(req.body ?? {});
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
    if (!/^[0-9a-f-]{36}$/i.test(params.data.paymentId)) {
      res.status(400).json({ error: "Invalid payment ID" });
      return;
    }
    const [payment] = await db
      .select()
      .from(projectPaymentsTable)
      .where(eq(projectPaymentsTable.id, params.data.paymentId))
      .limit(1);
    if (!payment) {
      res.status(404).json({ error: "Payment item not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      payment.projectId,
      userId,
      ["owner"],
    );
    if (!access) return;
    if (payment.status !== "planned" && payment.status !== "due") {
      res.status(409).json({ error: "This payment cannot be marked as sent" });
      return;
    }
    try {
      await attachProjectMedia({
        projectId: payment.projectId,
        entityType: "payment",
        entityId: payment.id,
        userId,
        media: body.data.media ?? [],
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid receipt file",
      });
      return;
    }
    const [updated] = await db
      .update(projectPaymentsTable)
      .set({
        status: "marked_sent",
        note: body.data.note ?? payment.note,
        updatedAt: new Date(),
      })
      .where(eq(projectPaymentsTable.id, payment.id))
      .returning();
    await recordTimelineEvent({
      projectId: payment.projectId,
      actorUserId: userId,
      actorRole: access.role,
      action: "payment.marked_sent",
      detail: `Ödəniş göndərildi kimi qeyd edildi: ${payment.title}`,
      entityType: "payment",
      entityId: payment.id,
    });
    res.json(
      MarkPaymentSentResponse.parse(await formatPayment(updated)),
    );
  },
);

router.post(
  "/payments/:paymentId/confirm",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const params = ConfirmPaymentReceivedParams.safeParse(req.params);
    const body = ConfirmPaymentReceivedBody.safeParse(req.body ?? {});
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
    if (!/^[0-9a-f-]{36}$/i.test(params.data.paymentId)) {
      res.status(400).json({ error: "Invalid payment ID" });
      return;
    }
    const [payment] = await db
      .select()
      .from(projectPaymentsTable)
      .where(eq(projectPaymentsTable.id, params.data.paymentId))
      .limit(1);
    if (!payment) {
      res.status(404).json({ error: "Payment item not found" });
      return;
    }
    const access = await requireProjectAccess(
      res,
      payment.projectId,
      userId,
      ["contractor"],
    );
    if (!access) return;
    if (payment.status !== "marked_sent") {
      res.status(409).json({ error: "This payment is not awaiting receipt confirmation" });
      return;
    }
    try {
      await attachProjectMedia({
        projectId: payment.projectId,
        entityType: "payment",
        entityId: payment.id,
        userId,
        media: body.data.media ?? [],
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid receipt file",
      });
      return;
    }
    const [updated] = await db
      .update(projectPaymentsTable)
      .set({
        status: "confirmed_received",
        note: body.data.note ?? payment.note,
        updatedAt: new Date(),
      })
      .where(eq(projectPaymentsTable.id, payment.id))
      .returning();
    await recordTimelineEvent({
      projectId: payment.projectId,
      actorUserId: userId,
      actorRole: access.role,
      action: "payment.confirmed_received",
      detail: `Ödənişin qəbulu təsdiqləndi: ${payment.title}`,
      entityType: "payment",
      entityId: payment.id,
    });
    res.json(
      ConfirmPaymentReceivedResponse.parse(await formatPayment(updated)),
    );
  },
);

export default router;