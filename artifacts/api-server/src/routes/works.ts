import { getAuth } from "@clerk/express";
import { and, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AddWorkNoteBody,
  AddWorkNoteParams,
  AddWorkParticipantBody,
  AddWorkParticipantParams,
  ChangeWorkStatusBody,
  ChangeWorkStatusParams,
  CreateReviewBody,
  CreateReviewParams,
  GetWorkParams,
  ReportReviewBody,
  ReportReviewParams,
  RespondParticipationBody,
  RespondParticipationParams,
  UpdateWorkBody,
  UpdateWorkParams,
  UpdateWorkParticipantBody,
  UpdateWorkParticipantParams,
} from "@workspace/api-zod";
import {
  db,
  workApprovalsTable,
  workerMembershipsTable,
  workerReviewsTable,
  workersTable,
  workNotesTable,
  workParticipantsTable,
  workRecordsTable,
} from "@workspace/db";
import { audit, canManageWorker, diff, getWorkAccess, loadActor, manages, workPermissions, type WorkAccess } from "../lib/homeAccess";
import { workDetail } from "../lib/homeDtos";
import { bad, forbidden, noStore, notFound, workValues } from "./homes";

const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;

async function work(req: Request, res: Response, workId: string): Promise<WorkAccess | null> {
  const a = await getWorkAccess(uid(req), workId);
  if (!a) { notFound(res, "İş tapılmadı"); return null; }
  return a;
}
const detail = async (req: Request, workId: string) => workDetail((await getWorkAccess(uid(req), workId))!, uid(req));

router.get("/works/:workId", async (req, res): Promise<void> => {
  noStore(res);
  const p = GetWorkParams.safeParse(req.params);
  if (!p.success) return notFound(res, "İş tapılmadı");
  const a = await work(req, res, p.data.workId);
  if (!a) return;
  res.json(await workDetail(a, uid(req)));
});

router.patch("/works/:workId", async (req, res): Promise<void> => {
  const p = UpdateWorkParams.safeParse(req.params);
  const body = UpdateWorkBody.safeParse(req.body);
  if (!p.success) return notFound(res, "İş tapılmadı");
  if (!body.success) return bad(res, "İşin məlumatlarını yoxlayın");
  const a = await work(req, res, p.data.workId);
  if (!a) return;
  if (!workPermissions(a).edit) return forbidden(res, a.work.status === "confirmed" ? "Təsdiqlənmiş işi yalnız ev sahibi dəyişə bilər" : undefined);
  const owner = manages(a.homeAccess.memberRole);
  const { status: _ignored, ...input } = body.data;
  // Cost and warranty are the household's private notes: only home members may set them.
  const own = a.homeAccess.memberRole ? input : { ...input, cost: undefined, currency: undefined, warrantyNote: undefined };
  const v = await workValues(a.work.homeId, uid(req), owner, owner ? own : { ...own, smetaProjectId: undefined });
  if ("error" in v) return bad(res, v.error);
  const changes = diff(a.work as unknown as Record<string, unknown>, v.values, Object.keys(v.values) as never[]);
  if (!Object.keys(changes).length) { res.json(await workDetail(a, uid(req))); return; }
  await db.update(workRecordsTable).set({ ...v.values, updatedAt: new Date() }).where(eq(workRecordsTable.id, a.work.id));
  await audit({
    homeId: a.work.homeId, actorUserId: uid(req), actorRole: a.role,
    action: a.work.status === "confirmed" ? "work.updated_after_confirmation" : "work.updated", entityType: "work", entityId: a.work.id, summary: v.values.title ?? a.work.title, changes,
  });
  res.json(await detail(req, a.work.id));
});

/* --------------------------------------------------------------- status flow */

const TRANSITIONS: Record<string, { from: string[]; to: string; perm: keyof ReturnType<typeof workPermissions> }> = {
  start: { from: ["planned", "revision"], to: "in_progress", perm: "start" },
  complete: { from: ["planned", "in_progress", "revision"], to: "completed", perm: "complete" },
  confirm: { from: ["completed"], to: "confirmed", perm: "confirm" },
  request_revision: { from: ["completed"], to: "revision", perm: "requestRevision" },
  reopen: { from: ["completed", "confirmed", "revision"], to: "in_progress", perm: "reopen" },
};

router.post("/works/:workId/status", async (req, res): Promise<void> => {
  const p = ChangeWorkStatusParams.safeParse(req.params);
  const body = ChangeWorkStatusBody.safeParse(req.body);
  if (!p.success) return notFound(res, "İş tapılmadı");
  if (!body.success) return bad(res);
  const a = await work(req, res, p.data.workId);
  if (!a) return;
  const t = TRANSITIONS[body.data.action];
  if (!t.from.includes(a.work.status)) return bad(res, "Bu statusdan bu addım mümkün deyil");
  if (!workPermissions(a)[t.perm]) return forbidden(res);
  const note = (body.data.note ?? "").trim();
  if (body.data.action === "request_revision" && !note) return bad(res, "Nəyin düzəldilməli olduğunu yazın");
  const now = new Date();
  const userId = uid(req);
  await db.transaction(async (tx) => {
    const updated = await tx.update(workRecordsTable).set({
      status: t.to, updatedAt: now,
      ...(t.to === "completed" ? { completedAt: now } : {}),
      ...(t.to === "confirmed" ? { confirmedAt: now } : {}),
      ...(body.data.action === "reopen" ? { confirmedAt: null } : {}),
    }).where(and(eq(workRecordsTable.id, a.work.id), eq(workRecordsTable.status, a.work.status))).returning({ id: workRecordsTable.id });
    if (!updated.length) throw Object.assign(new Error("conflict"), { conflict: true });
    await tx.insert(workApprovalsTable).values({ workId: a.work.id, action: body.data.action, fromStatus: a.work.status, toStatus: t.to, actorUserId: userId, actorRole: a.role, note });
    await audit({ homeId: a.work.homeId, actorUserId: userId, actorRole: a.role, action: `work.${body.data.action}`, entityType: "work", entityId: a.work.id, summary: `${a.work.title}: ${a.work.status} → ${t.to}`, changes: { status: { from: a.work.status, to: t.to } } }, tx);
  }).catch((err) => { if (!(err as { conflict?: boolean }).conflict) throw err; });
  res.json(await detail(req, a.work.id));
});

/* --------------------------------------------------------------------- notes */

router.post("/works/:workId/notes", async (req, res): Promise<void> => {
  const p = AddWorkNoteParams.safeParse(req.params);
  const body = AddWorkNoteBody.safeParse(req.body);
  if (!p.success) return notFound(res, "İş tapılmadı");
  if (!body.success) return bad(res, "Qeydin mətnini yazın");
  const a = await work(req, res, p.data.workId);
  if (!a) return;
  const perms = workPermissions(a);
  if (!perms.addNote) return forbidden(res);
  const d = body.data;
  if (d.kind === "inspection") {
    if (!perms.inspect) return forbidden(res, "Texniki yoxlamanı yalnız evə əlavə olunmuş mütəxəssis yaza bilər");
    if (!d.result) return bad(res, "Yoxlamanın nəticəsini seçin");
  }
  const userId = uid(req);
  await db.transaction(async (tx) => {
    const [n] = await tx.insert(workNotesTable).values({ workId: a.work.id, kind: d.kind, body: d.body.trim(), result: d.kind === "inspection" ? d.result ?? null : null, authorUserId: userId, authorRole: a.role }).returning();
    if (d.kind === "inspection") {
      await tx.update(workRecordsTable).set({ inspectedAt: d.result === "passed" ? new Date() : null, updatedAt: new Date() }).where(eq(workRecordsTable.id, a.work.id));
      await tx.insert(workApprovalsTable).values({ workId: a.work.id, action: d.result === "passed" ? "inspected" : "inspection_issues", fromStatus: a.work.status, toStatus: a.work.status, actorUserId: userId, actorRole: a.role, note: d.body.trim() });
    }
    await audit({ homeId: a.work.homeId, actorUserId: userId, actorRole: a.role, action: `note.${d.kind}`, entityType: "work", entityId: a.work.id, summary: `${a.work.title}: ${d.body.trim().slice(0, 200)}` }, tx);
    return n;
  });
  res.json(await detail(req, a.work.id));
});

/* -------------------------------------------------------------- participants */

router.post("/works/:workId/participants", async (req, res): Promise<void> => {
  const p = AddWorkParticipantParams.safeParse(req.params);
  const body = AddWorkParticipantBody.safeParse(req.body);
  if (!p.success) return notFound(res, "İş tapılmadı");
  if (!body.success) return bad(res, "İştirakçını yoxlayın");
  const a = await work(req, res, p.data.workId);
  if (!a) return;
  if (!workPermissions(a).manageParticipants) return forbidden(res);
  const userId = uid(req);
  const owner = manages(a.homeAccess.memberRole);
  const d = body.data;

  if (!d.workerId && !d.placeholder) return bad(res, "Usta seçin və ya qeydiyyatsız ustanın adını yazın");

  // Non-registered performer, recorded by the homeowner. Never matched to an existing profile by name.
  if (!d.workerId && d.placeholder) {
    if (!owner) return forbidden(res, "Qeydiyyatsız ustanı yalnız ev sahibi qeyd edə bilər");
    await db.transaction(async (tx) => {
      const [w] = await tx.insert(workersTable).values({
        kind: d.placeholder!.kind === "company" ? "company" : "individual", userId: null, managerUserId: null, displayName: d.placeholder!.name.trim(),
        specialties: d.placeholder!.specialty ? [d.placeholder!.specialty.trim()] : [], phone: (d.placeholder!.phone ?? "").trim(),
        status: "placeholder", createdByUserId: userId,
      }).returning();
      await tx.insert(workParticipantsTable).values({ workId: a.work.id, workerId: w.id, role: d.role, status: "recorded", note: (d.note ?? "").trim(), addedByUserId: userId });
      await audit({ homeId: a.work.homeId, workerId: w.id, actorUserId: userId, actorRole: a.role, action: "participant.recorded", entityType: "work", entityId: a.work.id, summary: `${w.displayName} — ${d.role} (qeydiyyatsız)` }, tx);
    });
    res.json(await detail(req, a.work.id));
    return;
  }

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, d.workerId!));
  // A master without an account may be picked again, but only by the owner / a member of a home where they already worked.
  let reusePlaceholder = false;
  if (worker?.status === "placeholder" && owner) {
    const [here] = await db.select({ id: workParticipantsTable.id }).from(workParticipantsTable)
      .innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
      .where(and(eq(workParticipantsTable.workerId, worker.id), eq(workRecordsTable.homeId, a.work.homeId))).limit(1);
    reusePlaceholder = !!here;
  }
  if (!worker || (worker.status !== "active" && !reusePlaceholder)) return bad(res, "Usta profili tapılmadı");
  let viaTeamId: string | null = null;
  if (!owner) {
    // A team leader / company representative adds only active members of their own team that already takes part.
    const team = a.homeAccess.actor.managed.find((m) => m.id === d.viaTeamId);
    const teamHere = team && a.mine.some((x) => x.workerId === team.id && x.status === "accepted");
    if (!team || !teamHere) return forbidden(res, "Komandanızın bu işdə iştirakı təsdiqlənməyib");
    const [m] = await db.select().from(workerMembershipsTable).where(and(eq(workerMembershipsTable.groupId, team.id), eq(workerMembershipsTable.memberId, worker.id), eq(workerMembershipsTable.status, "active")));
    if (!m) return bad(res, "Bu usta komandanızın aktiv üzvü deyil");
    if (!["team_member", "assistant", "team_lead"].includes(d.role)) return bad(res, "Komanda üzvü üçün rol seçin");
    viaTeamId = team.id;
  } else if (d.viaTeamId) {
    const [team] = await db.select().from(workersTable).where(eq(workersTable.id, d.viaTeamId));
    if (!team || team.kind === "individual") return bad(res, "Komanda tapılmadı");
    viaTeamId = team.id;
  }
  // The invited performer confirms; only one's own profiles are accepted immediately.
  const status = reusePlaceholder ? "recorded" : a.homeAccess.actor.actingIds.includes(worker.id) ? "accepted" : "invited";
  const [existing] = await db.select().from(workParticipantsTable).where(and(eq(workParticipantsTable.workId, a.work.id), eq(workParticipantsTable.workerId, worker.id)));
  if (existing && !["removed", "declined"].includes(existing.status)) return bad(res, "Bu usta artıq bu işdə qeyd olunub");
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(workParticipantsTable).set({ role: d.role, status, viaTeamId, note: (d.note ?? "").trim(), addedByUserId: userId, invitedAt: new Date(), respondedAt: status === "accepted" ? new Date() : null })
        .where(eq(workParticipantsTable.id, existing.id));
    } else {
      await tx.insert(workParticipantsTable).values({ workId: a.work.id, workerId: worker.id, role: d.role, status, viaTeamId, note: (d.note ?? "").trim(), addedByUserId: userId, respondedAt: status === "accepted" ? new Date() : null });
    }
    await audit({ homeId: a.work.homeId, workerId: worker.id, actorUserId: userId, actorRole: a.role, action: "participant.invited", entityType: "work", entityId: a.work.id, summary: `${worker.displayName} — ${d.role}` }, tx);
  });
  res.json(await detail(req, a.work.id));
});

router.patch("/works/:workId/participants/:participantId", async (req, res): Promise<void> => {
  const p = UpdateWorkParticipantParams.safeParse(req.params);
  const body = UpdateWorkParticipantBody.safeParse(req.body);
  if (!p.success) return notFound(res, "İştirakçı tapılmadı");
  if (!body.success) return bad(res);
  const a = await work(req, res, p.data.workId);
  if (!a) return;
  const [row] = await db.select().from(workParticipantsTable).where(and(eq(workParticipantsTable.id, p.data.participantId), eq(workParticipantsTable.workId, a.work.id)));
  if (!row) return notFound(res, "İştirakçı tapılmadı");
  const owner = manages(a.homeAccess.memberRole);
  const teamManager = !!row.viaTeamId && a.homeAccess.actor.managed.some((m) => m.id === row.viaTeamId) && workPermissions(a).manageParticipants;
  if (!owner && !teamManager) return forbidden(res);
  const values: Partial<typeof row> = {};
  if (body.data.role) values.role = body.data.role;
  if (body.data.note !== undefined) values.note = body.data.note.trim();
  if (body.data.status === "removed") values.status = "removed";
  // Per-work permissions: only the owner / a home member decides what a participant may change.
  for (const k of ["canAddMedia", "canAddNotes", "canEdit"] as const) {
    if (body.data[k] === undefined) continue;
    if (!owner) return forbidden(res, "İcazələri yalnız ev sahibi və ya ev üzvü dəyişə bilər");
    values[k] = body.data[k];
  }
  const changes = diff(row as unknown as Record<string, unknown>, values, ["role", "note", "status", "canAddMedia", "canAddNotes", "canEdit"]);
  if (Object.keys(changes).length) {
    await db.update(workParticipantsTable).set(values).where(eq(workParticipantsTable.id, row.id));
    const [w] = await db.select({ name: workersTable.displayName }).from(workersTable).where(eq(workersTable.id, row.workerId));
    await audit({ homeId: a.work.homeId, workerId: row.workerId, actorUserId: uid(req), actorRole: a.role, action: values.status === "removed" ? "participant.removed" : "participant.updated", entityType: "work", entityId: a.work.id, summary: `${w?.name ?? ""} — ${a.work.title}`, changes });
  }
  res.json(await detail(req, a.work.id));
});

router.post("/participations/:participantId/respond", async (req, res): Promise<void> => {
  const p = RespondParticipationParams.safeParse(req.params);
  const body = RespondParticipationBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Dəvət tapılmadı");
  if (!body.success) return bad(res);
  const userId = uid(req);
  const actor = await loadActor(userId);
  const [row] = await db.select().from(workParticipantsTable).where(eq(workParticipantsTable.id, p.data.participantId));
  if (!row || !actor.actingIds.includes(row.workerId)) return notFound(res, "Dəvət tapılmadı");
  if (row.status !== "invited") return bad(res, "Bu dəvət artıq cavablandırılıb");
  const status = body.data.accept ? "accepted" : "declined";
  await db.update(workParticipantsTable).set({ status, respondedAt: new Date() }).where(eq(workParticipantsTable.id, row.id));
  const [w] = await db.select({ homeId: workRecordsTable.homeId, title: workRecordsTable.title }).from(workRecordsTable).where(eq(workRecordsTable.id, row.workId));
  await audit({ homeId: w.homeId, workerId: row.workerId, actorUserId: userId, actorRole: "performer", action: `participant.${status}`, entityType: "work", entityId: row.workId, summary: `${w.title} — ${row.role}` });
  res.json({ success: true });
});

/* ------------------------------------------------------------------- reviews */

router.post("/works/:workId/reviews", async (req, res): Promise<void> => {
  const p = CreateReviewParams.safeParse(req.params);
  const body = CreateReviewBody.safeParse(req.body);
  if (!p.success) return notFound(res, "İş tapılmadı");
  if (!body.success) return bad(res, "Qiyməti 1–5 arasında seçin");
  const a = await work(req, res, p.data.workId);
  if (!a) return;
  if (!workPermissions(a).review) return forbidden(res, "Rəyi yalnız ev sahibi və ailə üzvləri təsdiqlənmiş işə yaza bilər");
  const [part] = await db.select().from(workParticipantsTable).where(and(eq(workParticipantsTable.workId, a.work.id), eq(workParticipantsTable.workerId, body.data.workerId), eq(workParticipantsTable.status, "accepted")));
  if (!part) return bad(res, "Bu usta işdə təsdiqlənmiş iştirakçı deyil");
  if (a.homeAccess.actor.actingIds.includes(part.workerId)) return forbidden(res, "Öz profilinizə rəy yaza bilməzsiniz");
  const userId = uid(req);
  const inserted = await db.insert(workerReviewsTable).values({ workId: a.work.id, workerId: part.workerId, authorUserId: userId, rating: body.data.rating, body: (body.data.body ?? "").trim() })
    .onConflictDoNothing().returning();
  if (!inserted.length) return bad(res, "Bu iş üçün bu ustaya artıq rəy yazmısınız");
  await audit({ homeId: a.work.homeId, workerId: part.workerId, actorUserId: userId, actorRole: a.role, action: "review.created", entityType: "review", entityId: inserted[0].id, summary: `${a.work.title}: ${body.data.rating}/5` });
  res.json(await detail(req, a.work.id));
});

router.post("/reviews/:reviewId/report", async (req, res): Promise<void> => {
  const p = ReportReviewParams.safeParse(req.params);
  const body = ReportReviewBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Rəy tapılmadı");
  if (!body.success) return bad(res, "Səbəbi yazın");
  const userId = uid(req);
  const [review] = await db.select().from(workerReviewsTable).where(eq(workerReviewsTable.id, p.data.reviewId));
  if (!review || review.hiddenAt) return notFound(res, "Rəy tapılmadı");
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, review.workerId));
  const actor = await loadActor(userId);
  // The reviewed performer (or whoever manages the team / company) may dispute a review.
  if (!worker || !canManageWorker(actor, worker)) return forbidden(res);
  await db.update(workerReviewsTable).set({ reportedAt: new Date(), reportReason: body.data.reason.trim() }).where(eq(workerReviewsTable.id, review.id));
  const [w] = await db.select({ homeId: workRecordsTable.homeId }).from(workRecordsTable).where(eq(workRecordsTable.id, review.workId));
  await audit({ homeId: w?.homeId ?? null, workerId: worker.id, actorUserId: userId, actorRole: "performer", action: "review.reported", entityType: "review", entityId: review.id, summary: body.data.reason.trim() });
  res.json({ success: true });
});

void inArray;
export default router;
