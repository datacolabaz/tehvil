import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { PgInsertValue, PgTable } from "drizzle-orm/pg-core";
import type {
  SmetaChangeOrder,
  SmetaEstimate,
  SmetaProject,
  SmetaProjectCost,
  SmetaProjectInput,
} from "@workspace/api-zod";
import {
  db,
  smetaChangeOrdersTable,
  smetaClientApprovalsTable,
  smetaEstimateVersionsTable,
  smetaExpensesTable,
  smetaLineItemsTable,
  smetaMeasurementsTable,
  smetaPaymentMilestonesTable,
  smetaPhotosTable,
  smetaProjectCostsTable,
  smetaProjectsTable,
  smetaReceiptsTable,
  smetaRevisionRequestsTable,
  smetaSectionsTable,
  smetaSharesTable,
  type SmetaProjectRecord,
} from "@workspace/db";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Internal snapshot stored per sent version (owner-only). */
export interface SmetaVersionSnapshot {
  estimate: SmetaEstimate;
  projectCosts: SmetaProjectCost[];
  margin: number;
}

const opt = <T>(value: T | null): T | undefined => value ?? undefined;
const isoOpt = (value: Date | null) => (value ? value.toISOString() : undefined);

export function parseTimestamp(value: string | undefined): Date {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function loadSmetaProjects(records: SmetaProjectRecord[]): Promise<SmetaProject[]> {
  if (!records.length) return [];
  const ids = records.map((r) => r.id);
  const [sections, items, costs, measurements, changeOrders, expenses, receipts, photos, payments, shares, approvals, revisions] = await Promise.all([
    db.select().from(smetaSectionsTable).where(inArray(smetaSectionsTable.projectId, ids)).orderBy(asc(smetaSectionsTable.position)),
    db.select().from(smetaLineItemsTable).where(inArray(smetaLineItemsTable.projectId, ids)).orderBy(asc(smetaLineItemsTable.position)),
    db.select().from(smetaProjectCostsTable).where(inArray(smetaProjectCostsTable.projectId, ids)).orderBy(asc(smetaProjectCostsTable.position)),
    db.select().from(smetaMeasurementsTable).where(inArray(smetaMeasurementsTable.projectId, ids)).orderBy(asc(smetaMeasurementsTable.position)),
    db.select().from(smetaChangeOrdersTable).where(inArray(smetaChangeOrdersTable.projectId, ids)).orderBy(asc(smetaChangeOrdersTable.number)),
    db.select().from(smetaExpensesTable).where(inArray(smetaExpensesTable.projectId, ids)).orderBy(asc(smetaExpensesTable.position)),
    db.select().from(smetaReceiptsTable).where(inArray(smetaReceiptsTable.projectId, ids)),
    db.select().from(smetaPhotosTable).where(inArray(smetaPhotosTable.projectId, ids)).orderBy(asc(smetaPhotosTable.position)),
    db.select().from(smetaPaymentMilestonesTable).where(inArray(smetaPaymentMilestonesTable.projectId, ids)).orderBy(asc(smetaPaymentMilestonesTable.position)),
    db.select({ share: smetaSharesTable, snapshot: smetaEstimateVersionsTable.snapshot })
      .from(smetaSharesTable)
      .innerJoin(smetaEstimateVersionsTable, and(
        eq(smetaEstimateVersionsTable.projectId, smetaSharesTable.projectId),
        eq(smetaEstimateVersionsTable.version, smetaSharesTable.version),
      ))
      .where(and(inArray(smetaSharesTable.projectId, ids), isNull(smetaSharesTable.revokedAt))),
    db.select().from(smetaClientApprovalsTable).where(inArray(smetaClientApprovalsTable.projectId, ids)).orderBy(asc(smetaClientApprovalsTable.approvedAt)),
    db.select().from(smetaRevisionRequestsTable).where(inArray(smetaRevisionRequestsTable.projectId, ids)).orderBy(asc(smetaRevisionRequestsTable.createdAt)),
  ]);
  const of = <T extends { projectId: string }>(rows: T[], id: string) => rows.filter((r) => r.projectId === id);

  return records.map((p): SmetaProject => {
    const share = shares.find((s) => s.share.projectId === p.id);
    const snapshot = share?.snapshot as unknown as SmetaVersionSnapshot | undefined;
    const projectItems = of(items, p.id);
    return {
      id: p.id,
      name: p.name,
      district: p.district,
      address: p.address,
      propertyKind: p.propertyKind as SmetaProject["propertyKind"],
      renovationKind: p.renovationKind as SmetaProject["renovationKind"],
      quality: p.quality as SmetaProject["quality"],
      areaM2: p.areaM2,
      startDate: p.startDate,
      endDate: p.endDate,
      client: { name: p.clientName, phone: p.clientPhone, email: opt(p.clientEmail) },
      contractor: p.contractor,
      completion: p.completion,
      defaultMarginPercentage: p.defaultMarginPercentage,
      projectCosts: of(costs, p.id).map((c) => ({ id: c.id, label: c.label, amount: c.amount })),
      estimate: {
        id: p.estimateId,
        version: p.estimateVersion,
        createdAt: p.estimateCreatedAt.toISOString(),
        validUntil: p.validUntil,
        sections: of(sections, p.id).map((s) => ({
          id: s.id,
          category: s.category as SmetaEstimate["sections"][number]["category"],
          title: s.title,
          items: projectItems.filter((i) => i.sectionId === s.id).map((i) => ({
            id: i.id,
            name: i.name,
            zone: i.zone,
            unit: i.unit,
            quantity: i.quantity,
            materialUnitPrice: i.materialUnitPrice,
            laborUnitPrice: i.laborUnitPrice,
            additionalCost: i.additionalCost,
            wastePercentage: i.wastePercentage,
            marginPercentage: i.marginPercentage,
            priceSource: i.priceSource,
            quantitySource: i.quantitySource,
            status: i.status as "ai" | "draft" | "approved" | "changed",
            materialId: opt(i.materialId),
            laborRateId: opt(i.laborRateId),
          })),
        })),
      },
      status: p.status as SmetaProject["status"],
      changeOrders: of(changeOrders, p.id).map((c): SmetaChangeOrder => ({
        id: c.id,
        number: c.number,
        title: c.title,
        reason: c.reason,
        date: c.date,
        requestedBy: c.requestedBy as SmetaChangeOrder["requestedBy"],
        requestedByName: c.requestedByName,
        category: c.category as SmetaChangeOrder["category"],
        materialDelta: c.materialDelta,
        laborDelta: c.laborDelta,
        additionalCost: c.additionalCost,
        status: c.status as SmetaChangeOrder["status"],
        photoIds: c.photoIds,
        lineItemIds: c.lineItemIds,
        decidedAt: isoOpt(c.decidedAt),
        decisionNote: opt(c.decisionNote),
      })),
      expenses: of(expenses, p.id).map((e) => ({
        id: e.id,
        date: e.date,
        kind: e.kind as "material" | "labor" | "other",
        category: e.category as SmetaChangeOrder["category"],
        description: e.description,
        vendor: e.vendor,
        amount: e.amount,
        paymentStatus: e.paymentStatus as "paid" | "partial" | "unpaid",
        receiptId: opt(e.receiptId),
        lineItemId: opt(e.lineItemId),
      })),
      receipts: of(receipts, p.id).map((r) => ({
        id: r.id,
        fileName: r.fileName,
        fileType: r.fileType as "image" | "pdf",
        uploadedAt: r.uploadedAt,
        aiSuggestion: r.aiSuggestion
          ? { ...r.aiSuggestion, category: r.aiSuggestion.category as SmetaChangeOrder["category"] }
          : undefined,
      })),
      photos: of(photos, p.id).map((ph) => ({
        id: ph.id,
        phase: ph.phase as "before" | "during" | "after",
        date: ph.date,
        uploadedBy: ph.uploadedBy,
        note: ph.note,
        room: ph.room,
        category: ph.category as SmetaChangeOrder["category"],
        lineItemId: opt(ph.lineItemId),
        clientVisible: ph.clientVisible,
      })),
      drawing: opt(p.drawing),
      measurements: of(measurements, p.id).map((m) => ({
        id: m.id,
        kind: m.kind as "area" | "length" | "count" | "height",
        name: m.name,
        value: m.value,
        unit: m.unit,
        confidence: m.confidence,
        source: m.source,
        status: m.status as "suggested" | "edited" | "approved",
        roomId: opt(m.roomId),
      })),
      approvals: of(approvals, p.id).map((a) => ({
        id: a.id,
        estimateVersion: a.version,
        approvedAt: a.approvedAt.toISOString(),
        name: a.name,
        phone: a.phone,
        confirmedScope: a.consent,
        total: a.total,
      })),
      revisionRequests: of(revisions, p.id).map((r) => ({
        id: r.id,
        estimateVersion: r.version,
        createdAt: r.createdAt.toISOString(),
        name: r.name,
        message: r.message,
      })),
      payments: of(payments, p.id).map((m) => ({
        id: m.id,
        title: m.title,
        share: m.share,
        condition: m.condition,
        status: m.status as "paid" | "due" | "planned",
      })),
      included: p.included,
      excluded: p.excluded,
      share: share && snapshot ? {
        token: share.share.token,
        createdAt: share.share.sentAt.toISOString(),
        expiresAt: share.share.expiresAt.toISOString(),
        clientName: share.share.clientName,
        phone: share.share.phone,
        email: opt(share.share.email),
        message: share.share.message,
        notifyOnApprove: share.share.notifyOnApprove,
        attachPdf: share.share.attachPdf,
        snapshot: snapshot.estimate,
        snapshotProjectCosts: snapshot.projectCosts,
        snapshotMargin: snapshot.margin,
      } : undefined,
      exports: p.exports,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  });
}

/** Columns the contractor may edit on every save. Status, versions and validity are server-controlled. */
export function editableProjectColumns(input: SmetaProjectInput) {
  return {
    name: input.name,
    district: input.district,
    address: input.address,
    propertyKind: input.propertyKind,
    renovationKind: input.renovationKind,
    quality: input.quality,
    areaM2: input.areaM2,
    startDate: input.startDate,
    endDate: input.endDate,
    clientName: input.client.name,
    clientPhone: input.client.phone,
    clientEmail: input.client.email || null,
    contractor: input.contractor,
    completion: input.completion,
    defaultMarginPercentage: input.defaultMarginPercentage,
    included: input.included,
    excluded: input.excluded,
    drawing: input.drawing ?? null,
    exports: input.exports,
  };
}

const CHUNK = 500;
async function insertAll<TTable extends PgTable>(tx: Tx, table: TTable, rows: PgInsertValue<TTable>[]) {
  for (let i = 0; i < rows.length; i += CHUNK) await tx.insert(table).values(rows.slice(i, i + CHUNK));
}

/**
 * Replaces all contractor-editable child rows of a project.
 * Change orders already decided by the client on the public page are kept as stored.
 */
export async function replaceSmetaChildren(tx: Tx, projectId: string, input: SmetaProjectInput): Promise<void> {
  const clientDecided = await tx.select({ id: smetaChangeOrdersTable.id }).from(smetaChangeOrdersTable)
    .where(and(eq(smetaChangeOrdersTable.projectId, projectId), eq(smetaChangeOrdersTable.decidedBy, "client")));
  const locked = new Set(clientDecided.map((c) => c.id));

  await tx.delete(smetaLineItemsTable).where(eq(smetaLineItemsTable.projectId, projectId));
  await tx.delete(smetaSectionsTable).where(eq(smetaSectionsTable.projectId, projectId));
  await tx.delete(smetaProjectCostsTable).where(eq(smetaProjectCostsTable.projectId, projectId));
  await tx.delete(smetaMeasurementsTable).where(eq(smetaMeasurementsTable.projectId, projectId));
  await tx.delete(smetaExpensesTable).where(eq(smetaExpensesTable.projectId, projectId));
  await tx.delete(smetaReceiptsTable).where(eq(smetaReceiptsTable.projectId, projectId));
  await tx.delete(smetaPhotosTable).where(eq(smetaPhotosTable.projectId, projectId));
  await tx.delete(smetaPaymentMilestonesTable).where(eq(smetaPaymentMilestonesTable.projectId, projectId));
  await tx.delete(smetaChangeOrdersTable).where(and(
    eq(smetaChangeOrdersTable.projectId, projectId),
    or(isNull(smetaChangeOrdersTable.decidedBy), ne(smetaChangeOrdersTable.decidedBy, "client")),
  ));

  await insertAll(tx, smetaSectionsTable, input.estimate.sections.map((s, position) => ({
    projectId, id: s.id, position, category: s.category, title: s.title,
  })));
  await insertAll(tx, smetaLineItemsTable, input.estimate.sections.flatMap((s) => s.items.map((i, position) => ({
    projectId,
    id: i.id,
    sectionId: s.id,
    position,
    name: i.name,
    zone: i.zone,
    unit: i.unit,
    quantity: i.quantity,
    materialUnitPrice: i.materialUnitPrice,
    laborUnitPrice: i.laborUnitPrice,
    additionalCost: i.additionalCost,
    wastePercentage: i.wastePercentage,
    marginPercentage: i.marginPercentage,
    priceSource: i.priceSource,
    quantitySource: i.quantitySource,
    status: i.status,
    materialId: i.materialId ?? null,
    laborRateId: i.laborRateId ?? null,
  }))));
  await insertAll(tx, smetaProjectCostsTable, input.projectCosts.map((c, position) => ({
    projectId, id: c.id, position, label: c.label, amount: c.amount,
  })));
  await insertAll(tx, smetaMeasurementsTable, input.measurements.map((m, position) => ({
    projectId,
    id: m.id,
    position,
    kind: m.kind,
    name: m.name,
    value: m.value,
    unit: m.unit,
    confidence: m.confidence,
    source: m.source,
    status: m.status,
    roomId: m.roomId ?? null,
  })));
  await insertAll(tx, smetaChangeOrdersTable, input.changeOrders.filter((c) => !locked.has(c.id)).map((c) => {
    const decided = c.status === "approved" || c.status === "rejected";
    return {
      projectId,
      id: c.id,
      number: c.number,
      title: c.title,
      reason: c.reason,
      date: c.date,
      requestedBy: c.requestedBy,
      requestedByName: c.requestedByName,
      category: c.category,
      materialDelta: c.materialDelta,
      laborDelta: c.laborDelta,
      additionalCost: c.additionalCost,
      status: c.status,
      photoIds: c.photoIds,
      lineItemIds: c.lineItemIds,
      decidedAt: decided ? parseTimestamp(c.decidedAt) : null,
      decidedBy: decided ? "contractor" : null,
      decisionNote: decided ? c.decisionNote ?? null : null,
    };
  }));
  await insertAll(tx, smetaExpensesTable, input.expenses.map((e, position) => ({
    projectId,
    id: e.id,
    position,
    date: e.date,
    kind: e.kind,
    category: e.category,
    description: e.description,
    vendor: e.vendor,
    amount: e.amount,
    paymentStatus: e.paymentStatus,
    receiptId: e.receiptId ?? null,
    lineItemId: e.lineItemId ?? null,
  })));
  // TODO(api): upload receipt files and photos through /storage/uploads/request-url and keep the object path here.
  await insertAll(tx, smetaReceiptsTable, input.receipts.map((r) => ({
    projectId,
    id: r.id,
    fileName: r.fileName,
    fileType: r.fileType,
    uploadedAt: r.uploadedAt,
    aiSuggestion: r.aiSuggestion ?? null,
  })));
  await insertAll(tx, smetaPhotosTable, input.photos.map((ph, position) => ({
    projectId,
    id: ph.id,
    position,
    phase: ph.phase,
    date: ph.date,
    uploadedBy: ph.uploadedBy,
    note: ph.note,
    room: ph.room,
    category: ph.category,
    lineItemId: ph.lineItemId ?? null,
    clientVisible: ph.clientVisible,
  })));
  await insertAll(tx, smetaPaymentMilestonesTable, input.payments.map((m, position) => ({
    projectId, id: m.id, position, title: m.title, share: m.share, condition: m.condition, status: m.status,
  })));
}

export async function findOwnedSmetaProject(projectId: string, userId: string): Promise<SmetaProjectRecord | null> {
  const [project] = await db.select().from(smetaProjectsTable)
    .where(and(eq(smetaProjectsTable.id, projectId), eq(smetaProjectsTable.ownerUserId, userId)))
    .limit(1);
  return project ?? null;
}
