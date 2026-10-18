import { getAuth } from "@clerk/express";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AcceptHomeInvitationBody,
  AcceptHomeInvitationParams,
  AddWorkerMemberBody,
  AddWorkerMemberParams,
  AttachHomeMediaBody,
  CreateTeamInvitationBody,
  CreateTeamInvitationParams,
  CreateWorkerBody,
  DeleteHomeMediaParams,
  RespondMembershipBody,
  RespondMembershipParams,
  SearchWorkersQueryParams,
  SetWorkerIdentityBody,
  SetWorkerIdentityParams,
  UpdateWorkerBody,
  UpdateWorkerMemberBody,
  UpdateWorkerMemberParams,
  UpdateWorkerParams,
} from "@workspace/api-zod";
import {
  db,
  homeInvitationsTable,
  homeMediaTable,
  homeMembersTable,
  homesTable,
  workerMembershipsTable,
  workersTable,
  workParticipantsTable,
  workRecordsTable,
} from "@workspace/db";
import { adminUserIds, audit, canManageWorker, diff, getHomeAccess, getWorkAccess, loadActor, workPermissions, type Actor, type WorkerRow } from "../lib/homeAccess";
import { loadWorkers, mediaDto, workerRef, workSummaries } from "../lib/homeDtos";
import { attachHomeMedia, HomeMediaError } from "../lib/homeMedia";
import { hashToken, newToken, publicOrigin } from "../lib/realtorCore";
import { loadWorker, membershipDtos, workerCard, workerProfile } from "../lib/workerProfile";
import { bad, forbidden, noStore, notFound } from "./homes";

const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
const INVITE_DAYS = 14;

const cleanSpecialties = (list: string[] | undefined) => [...new Set((list ?? []).map((s) => s.trim().toLowerCase()).filter((s) => s && s.length <= 40))].slice(0, 20);

async function profileOut(res: Response, worker: WorkerRow, userId: string) {
  res.json(await workerProfile(worker, userId));
}

/* --------------------------------------------------------------------- me */

router.get("/me/workers", async (req, res): Promise<void> => {
  noStore(res);
  const userId = uid(req);
  const actor = await loadActor(userId);
  const memberships = actor.individual
    ? await db.select().from(workerMembershipsTable).where(eq(workerMembershipsTable.memberId, actor.individual.id)).orderBy(desc(workerMembershipsTable.createdAt))
    : [];
  res.json({
    individual: actor.individual ? await workerProfile(actor.individual, userId, actor) : null,
    managed: await Promise.all(actor.managed.map(workerCard)),
    memberships: await membershipDtos(memberships),
  });
});

router.get("/me/inbox", async (req, res): Promise<void> => {
  noStore(res);
  const userId = uid(req);
  const actor = await loadActor(userId);
  const invited = actor.actingIds.length
    ? await db.select({ p: workParticipantsTable, w: workRecordsTable, h: homesTable }).from(workParticipantsTable)
      .innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
      .innerJoin(homesTable, eq(homesTable.id, workRecordsTable.homeId))
      .where(and(inArray(workParticipantsTable.workerId, actor.actingIds), eq(workParticipantsTable.status, "invited"), isNull(homesTable.archivedAt)))
    : [];
  const workers = await loadWorkers(invited.map((r) => r.p.workerId));
  const memberships = actor.individual
    ? await db.select().from(workerMembershipsTable).where(and(eq(workerMembershipsTable.memberId, actor.individual.id), eq(workerMembershipsTable.status, "invited")))
    : [];
  const ownedHomes = await db.select({ home: homesTable }).from(homeMembersTable).innerJoin(homesTable, eq(homesTable.id, homeMembersTable.homeId))
    .where(and(eq(homeMembersTable.userId, userId), eq(homeMembersTable.role, "owner"), isNull(homesTable.archivedAt)));
  const pending = ownedHomes.length
    ? await db.select().from(workRecordsTable).where(and(inArray(workRecordsTable.homeId, ownedHomes.map((h) => h.home.id)), eq(workRecordsTable.status, "completed")))
    : [];
  const summaries = await workSummaries(pending);
  res.json({
    participations: invited.map(({ p, w, h }) => ({
      participantId: p.id, workId: w.id, workTitle: w.title, homeId: h.id, homeName: h.name, role: p.role, worker: workerRef(workers.get(p.workerId)!), invitedAt: p.invitedAt.toISOString(),
    })),
    memberships: (await membershipDtos(memberships)).map((m) => ({ membershipId: m.id, group: m.group, role: m.role, member: m.member, createdAt: m.createdAt })),
    approvals: summaries.map((s) => ({ work: s, homeName: ownedHomes.find((h) => h.home.id === s.homeId)?.home.name ?? "" })),
  });
});

router.get("/me/works", async (req, res): Promise<void> => {
  noStore(res);
  const userId = uid(req);
  const actor = await loadActor(userId);
  if (!actor.actingIds.length) { res.json([]); return; }
  const rows = await db.select({ p: workParticipantsTable, w: workRecordsTable, h: homesTable }).from(workParticipantsTable)
    .innerJoin(workRecordsTable, eq(workRecordsTable.id, workParticipantsTable.workId))
    .innerJoin(homesTable, eq(homesTable.id, workRecordsTable.homeId))
    .where(and(inArray(workParticipantsTable.workerId, actor.actingIds), inArray(workParticipantsTable.status, ["accepted", "invited"]), isNull(homesTable.archivedAt)));
  const summaries = await workSummaries([...new Map(rows.map((r) => [r.w.id, r.w])).values()]);
  const workers = await loadWorkers(rows.map((r) => r.p.workerId));
  res.json(rows.map(({ p, w, h }) => ({
    work: summaries.find((s) => s.id === w.id)!, homeName: h.name, role: p.role, participantStatus: p.status, worker: workerRef(workers.get(p.workerId)!),
  })).sort((a, b) => b.work.updatedAt.localeCompare(a.work.updatedAt)));
});

/* ---------------------------------------------------------------- profiles */

router.get("/workers", async (req, res): Promise<void> => {
  noStore(res);
  const q = SearchWorkersQueryParams.safeParse(req.query);
  if (!q.success) return bad(res);
  const conds = [eq(workersTable.status, "active")];
  const term = (q.data.q ?? "").trim().replace(/[%_\\]/g, "");
  if (term) conds.push(ilike(workersTable.displayName, `%${term}%`));
  if (q.data.specialty) conds.push(sql`${workersTable.specialties} @> ${JSON.stringify([q.data.specialty.trim().toLowerCase()])}::jsonb`);
  if (q.data.city) conds.push(ilike(workersTable.city, `%${q.data.city.trim().replace(/[%_\\]/g, "")}%`));
  const rows = await db.select().from(workersTable).where(and(...conds)).orderBy(desc(workersTable.updatedAt)).limit(30);
  res.json(await Promise.all(rows.map(workerCard)));
});

router.post("/workers", async (req, res): Promise<void> => {
  const body = CreateWorkerBody.safeParse(req.body);
  if (!body.success) return bad(res, "Profil məlumatlarını yoxlayın");
  const userId = uid(req);
  const d = body.data;
  const actor = await loadActor(userId);
  if (d.kind === "individual") {
    const [existing] = await db.select({ id: workersTable.id }).from(workersTable).where(eq(workersTable.userId, userId));
    if (existing) return bad(res, "Sizin artıq fərdi usta profiliniz var");
  }
  const worker = await db.transaction(async (tx) => {
    const [w] = await tx.insert(workersTable).values({
      kind: d.kind, userId: d.kind === "individual" ? userId : null, managerUserId: userId, displayName: d.displayName.trim(),
      specialties: cleanSpecialties(d.specialties), city: (d.city ?? "").trim(), serviceArea: (d.serviceArea ?? "").trim(), about: (d.about ?? "").trim(),
      experienceYears: d.experienceYears == null ? null : Math.min(80, Math.max(0, Math.round(d.experienceYears))),
      phone: (d.phone ?? "").trim(), email: (d.email ?? "").trim(), publicContact: d.publicContact ?? false,
      legalName: d.kind === "company" ? (d.legalName ?? "").trim() : "", taxId: d.kind === "company" ? (d.taxId ?? "").trim() : "",
      status: "active", createdByUserId: userId,
    }).returning();
    // The creator's own individual profile becomes the team leader / company representative.
    if (d.kind !== "individual" && actor.individual) {
      await tx.insert(workerMembershipsTable).values({ groupId: w.id, memberId: actor.individual.id, role: d.kind === "team" ? "leader" : "representative", status: "active", invitedByUserId: userId, joinedAt: new Date() });
    }
    await audit({ workerId: w.id, actorUserId: userId, actorRole: d.kind === "individual" ? "worker" : d.kind === "team" ? "team_leader" : "company_rep", action: "worker.created", entityType: "worker", entityId: w.id, summary: w.displayName }, tx);
    return w;
  });
  res.status(201).json(await workerProfile(worker, userId));
});

async function managedWorker(req: Request, res: Response, workerId: string): Promise<{ worker: WorkerRow; actor: Actor } | null> {
  const worker = await loadWorker(workerId);
  const actor = await loadActor(uid(req));
  if (!worker || worker.status !== "active") { notFound(res, "Profil tapılmadı"); return null; }
  if (!canManageWorker(actor, worker)) { forbidden(res); return null; }
  return { worker, actor };
}

router.patch("/workers/:workerId", async (req, res): Promise<void> => {
  const p = UpdateWorkerParams.safeParse(req.params);
  const body = UpdateWorkerBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Profil tapılmadı");
  if (!body.success) return bad(res, "Profil məlumatlarını yoxlayın");
  const m = await managedWorker(req, res, p.data.workerId);
  if (!m) return;
  const d = body.data;
  const values: Partial<WorkerRow> = {};
  if (d.displayName !== undefined) values.displayName = d.displayName.trim();
  if (d.specialties !== undefined) values.specialties = cleanSpecialties(d.specialties);
  for (const k of ["city", "serviceArea", "about", "phone", "email"] as const) if (d[k] !== undefined) values[k] = (d[k] ?? "").trim();
  if (d.experienceYears !== undefined) values.experienceYears = d.experienceYears == null ? null : Math.min(80, Math.max(0, Math.round(d.experienceYears)));
  if (d.publicContact !== undefined) values.publicContact = d.publicContact;
  if (m.worker.kind === "company") {
    if (d.legalName !== undefined) values.legalName = d.legalName.trim();
    if (d.taxId !== undefined) values.taxId = d.taxId.trim();
  }
  if (d.photoMediaId !== undefined) {
    if (d.photoMediaId) {
      const [photo] = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.id, d.photoMediaId), eq(homeMediaTable.workerId, m.worker.id), isNull(homeMediaTable.homeId), isNull(homeMediaTable.deletedAt)));
      if (!photo || !photo.contentType.startsWith("image/")) return bad(res, "Profil şəkli tapılmadı");
    }
    values.photoMediaId = d.photoMediaId ?? null;
  }
  const changes = diff(m.worker as unknown as Record<string, unknown>, values, Object.keys(values) as never[]);
  // Phone / e-mail changes are recorded without their values.
  for (const k of ["phone", "email", "taxId"]) if (changes[k]) changes[k] = { from: "•••", to: "•••" };
  const [saved] = await db.update(workersTable).set({ ...values, updatedAt: new Date() }).where(eq(workersTable.id, m.worker.id)).returning();
  await audit({ workerId: m.worker.id, actorUserId: uid(req), actorRole: "worker", action: "worker.updated", entityType: "worker", entityId: m.worker.id, summary: saved.displayName, changes });
  await profileOut(res, saved, uid(req));
});

/* ---------------------------------------------------------- team membership */

router.post("/workers/:workerId/members", async (req, res): Promise<void> => {
  const p = AddWorkerMemberParams.safeParse(req.params);
  const body = AddWorkerMemberBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Profil tapılmadı");
  if (!body.success) return bad(res);
  const m = await managedWorker(req, res, p.data.workerId);
  if (!m) return;
  if (m.worker.kind === "individual") return bad(res, "Üzvləri yalnız komanda və ya şirkətə əlavə etmək olar");
  const member = await loadWorker(body.data.memberWorkerId);
  if (!member || member.kind !== "individual" || member.status !== "active") return bad(res, "Yalnız qeydiyyatdan keçmiş fərdi ustanı əlavə etmək olar");
  const [existing] = await db.select().from(workerMembershipsTable)
    .where(and(eq(workerMembershipsTable.groupId, m.worker.id), eq(workerMembershipsTable.memberId, member.id), inArray(workerMembershipsTable.status, ["invited", "active"])));
  if (existing) return bad(res, existing.status === "active" ? "Bu usta artıq üzvdür" : "Dəvət artıq göndərilib");
  const self = member.userId === uid(req);
  await db.insert(workerMembershipsTable).values({
    groupId: m.worker.id, memberId: member.id, role: body.data.role ?? "member", status: self ? "active" : "invited",
    invitedByUserId: uid(req), joinedAt: self ? new Date() : null,
  });
  await audit({ workerId: m.worker.id, actorUserId: uid(req), actorRole: "team_leader", action: "membership.invited", entityType: "membership", entityId: member.id, summary: `${member.displayName} → ${m.worker.displayName}` });
  await profileOut(res, m.worker, uid(req));
});

router.patch("/workers/:workerId/members/:membershipId", async (req, res): Promise<void> => {
  const p = UpdateWorkerMemberParams.safeParse(req.params);
  const body = UpdateWorkerMemberBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Üzvlük tapılmadı");
  if (!body.success) return bad(res);
  const userId = uid(req);
  const actor = await loadActor(userId);
  const [row] = await db.select().from(workerMembershipsTable).where(and(eq(workerMembershipsTable.id, p.data.membershipId), eq(workerMembershipsTable.groupId, p.data.workerId)));
  const group = row ? await loadWorker(row.groupId) : null;
  if (!row || !group) return notFound(res, "Üzvlük tapılmadı");
  const manager = canManageWorker(actor, group);
  const self = actor.individual?.id === row.memberId;
  if (!manager && !self) return forbidden(res);
  const values: Partial<typeof row> = {};
  if (body.data.status === "left") { if (!self) return forbidden(res); values.status = "left"; values.leftAt = new Date(); }
  if (body.data.status === "removed") { if (!manager) return forbidden(res); values.status = "removed"; values.leftAt = new Date(); }
  if (body.data.role) { if (!manager) return forbidden(res); values.role = body.data.role; }
  if (values.status && !["active", "invited"].includes(row.status)) return bad(res, "Üzvlük artıq aktiv deyil");
  // Leaving or being removed never touches work_participants: past work stays in history.
  const [saved] = await db.update(workerMembershipsTable).set(values).where(eq(workerMembershipsTable.id, row.id)).returning();
  await audit({ workerId: group.id, actorUserId: userId, actorRole: self ? "worker" : "team_leader", action: `membership.${values.status ?? "updated"}`, entityType: "membership", entityId: row.id, summary: `${group.displayName}: ${saved.status}/${saved.role}` });
  await profileOut(res, group, userId);
});

router.post("/memberships/:membershipId/respond", async (req, res): Promise<void> => {
  const p = RespondMembershipParams.safeParse(req.params);
  const body = RespondMembershipBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Dəvət tapılmadı");
  if (!body.success) return bad(res);
  const userId = uid(req);
  const actor = await loadActor(userId);
  const [row] = await db.select().from(workerMembershipsTable).where(eq(workerMembershipsTable.id, p.data.membershipId));
  if (!row || row.memberId !== actor.individual?.id) return notFound(res, "Dəvət tapılmadı");
  if (row.status !== "invited") return bad(res, "Bu dəvət artıq cavablandırılıb");
  const accept = body.data.accept;
  await db.update(workerMembershipsTable).set({ status: accept ? "active" : "declined", joinedAt: accept ? new Date() : null }).where(eq(workerMembershipsTable.id, row.id));
  await audit({ workerId: row.groupId, actorUserId: userId, actorRole: "worker", action: accept ? "membership.accepted" : "membership.declined", entityType: "membership", entityId: row.id, summary: actor.individual!.displayName });
  res.json({ success: true });
});

router.post("/workers/:workerId/invitations", async (req, res): Promise<void> => {
  const p = CreateTeamInvitationParams.safeParse(req.params);
  const body = CreateTeamInvitationBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Profil tapılmadı");
  if (!body.success) return bad(res);
  const m = await managedWorker(req, res, p.data.workerId);
  if (!m) return;
  if (m.worker.kind === "individual") return bad(res, "Dəvət linki komanda və ya şirkət üçündür");
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  const [inv] = await db.insert(homeInvitationsTable).values({
    kind: "team", tokenHash: hashToken(token), groupId: m.worker.id, role: body.data.role, name: (body.data.name ?? "").trim(),
    contact: (body.data.contact ?? "").trim(), createdByUserId: uid(req), expiresAt,
  }).returning();
  await audit({ workerId: m.worker.id, actorUserId: uid(req), actorRole: "team_leader", action: "invitation.created", entityType: "invitation", entityId: inv.id, summary: inv.name });
  res.json({ url: `${publicOrigin(req)}/invite/${token}`, expiresAt: expiresAt.toISOString() });
});

/* -------------------------------------------------------- accept invitation */

router.post("/invitations/:token/accept", async (req, res): Promise<void> => {
  const p = AcceptHomeInvitationParams.safeParse(req.params);
  const body = AcceptHomeInvitationBody.safeParse(req.body ?? {});
  if (!p.success) return notFound(res, "Dəvət tapılmadı");
  if (!body.success) return bad(res, "Profil məlumatlarını yoxlayın");
  const userId = uid(req);
  const [inv] = await db.select().from(homeInvitationsTable).where(eq(homeInvitationsTable.tokenHash, hashToken(p.data.token)));
  if (!inv || inv.status !== "pending" || inv.expiresAt <= new Date()) return notFound(res, "Dəvət aktiv deyil. Göndərəndən yeni link istəyin.");
  let actor = await loadActor(userId);

  if (inv.kind === "member") {
    const [home] = await db.select().from(homesTable).where(eq(homesTable.id, inv.homeId!));
    if (!home || home.archivedAt) return notFound(res, "Ev tapılmadı");
    const [existing] = await db.select().from(homeMembersTable).where(and(eq(homeMembersTable.homeId, home.id), eq(homeMembersTable.userId, userId)));
    await db.transaction(async (tx) => {
      if (!existing) {
        await tx.insert(homeMembersTable).values({ homeId: home.id, userId, role: inv.role, displayName: (actor.individual?.displayName ?? inv.name).slice(0, 120), addedByUserId: inv.createdByUserId });
      }
      await tx.update(homeInvitationsTable).set({ status: "accepted", acceptedByUserId: userId, acceptedAt: new Date() }).where(eq(homeInvitationsTable.id, inv.id));
      await audit({ homeId: home.id, actorUserId: userId, actorRole: existing?.role ?? inv.role, action: "member.joined", entityType: "member", summary: `${inv.role}${inv.name ? `: ${inv.name}` : ""}` }, tx);
    });
    res.json({ redirect: `/homes/${home.id}` });
    return;
  }

  // Work and team invitations need a performer profile; create the individual one on the spot if asked.
  if (body.data.createProfile && !actor.individual) {
    const d = body.data.createProfile;
    const [w] = await db.insert(workersTable).values({
      kind: "individual", userId, managerUserId: userId, displayName: d.displayName.trim(), specialties: cleanSpecialties(d.specialties),
      city: (d.city ?? "").trim(), phone: (d.phone ?? "").trim(), status: "active", createdByUserId: userId,
    }).onConflictDoNothing().returning();
    if (w) await audit({ workerId: w.id, actorUserId: userId, actorRole: "worker", action: "worker.created", entityType: "worker", entityId: w.id, summary: w.displayName });
    actor = await loadActor(userId);
  }

  if (inv.kind === "team") {
    if (!actor.individual) return bad(res, "Əvvəlcə usta profilinizi yaradın");
    const group = await loadWorker(inv.groupId!);
    if (!group || group.status !== "active") return notFound(res, "Komanda tapılmadı");
    const [existing] = await db.select().from(workerMembershipsTable)
      .where(and(eq(workerMembershipsTable.groupId, group.id), eq(workerMembershipsTable.memberId, actor.individual.id), inArray(workerMembershipsTable.status, ["invited", "active"])));
    await db.transaction(async (tx) => {
      if (existing) await tx.update(workerMembershipsTable).set({ status: "active", joinedAt: existing.joinedAt ?? new Date() }).where(eq(workerMembershipsTable.id, existing.id));
      else await tx.insert(workerMembershipsTable).values({ groupId: group.id, memberId: actor.individual!.id, role: inv.role, status: "active", invitedByUserId: inv.createdByUserId, joinedAt: new Date() });
      await tx.update(homeInvitationsTable).set({ status: "accepted", acceptedByUserId: userId, acceptedAt: new Date() }).where(eq(homeInvitationsTable.id, inv.id));
      await audit({ workerId: group.id, actorUserId: userId, actorRole: "worker", action: "membership.accepted", entityType: "membership", summary: actor.individual!.displayName }, tx);
    });
    res.json({ redirect: `/workers/${group.id}` });
    return;
  }

  // kind === "work"
  const workerId = body.data.workerId ?? actor.individual?.id ?? null;
  if (!workerId) return bad(res, "Əvvəlcə usta profilinizi yaradın");
  if (!actor.actingIds.includes(workerId)) return forbidden(res, "Bu profil adından qəbul edə bilməzsiniz");
  if (inv.placeholderWorkerId && workerId !== actor.individual?.id) return bad(res, "Bu dəvəti fərdi usta profilinizlə qəbul edin");
  const [work] = await db.select().from(workRecordsTable).where(eq(workRecordsTable.id, inv.workId!));
  if (!work) return notFound(res, "İş tapılmadı");
  const now = new Date();
  await db.transaction(async (tx) => {
    if (inv.placeholderWorkerId) {
      const [ph] = await tx.select().from(workersTable).where(eq(workersTable.id, inv.placeholderWorkerId));
      if (ph && ph.status === "placeholder") {
        // Explicit claim through the owner's link: move the placeholder's records to the real profile.
        const rows = await tx.select().from(workParticipantsTable).where(eq(workParticipantsTable.workerId, ph.id));
        for (const r of rows) {
          const [clash] = await tx.select({ id: workParticipantsTable.id }).from(workParticipantsTable).where(and(eq(workParticipantsTable.workId, r.workId), eq(workParticipantsTable.workerId, workerId)));
          if (clash) {
            await tx.update(workParticipantsTable).set({ status: "removed" }).where(eq(workParticipantsTable.id, r.id));
            if (r.workId === work.id) await tx.update(workParticipantsTable).set({ status: "accepted", respondedAt: now }).where(eq(workParticipantsTable.id, clash.id));
          } else {
            // The invited work is accepted now; other works recorded for the placeholder wait for the performer's own confirmation.
            await tx.update(workParticipantsTable).set({ workerId, status: r.workId === work.id ? "accepted" : r.status === "recorded" ? "invited" : r.status, respondedAt: r.workId === work.id ? now : r.respondedAt })
              .where(eq(workParticipantsTable.id, r.id));
          }
        }
        await tx.update(workersTable).set({ status: "merged", mergedIntoId: workerId, updatedAt: now }).where(eq(workersTable.id, ph.id));
        await audit({ homeId: work.homeId, workerId, actorUserId: userId, actorRole: "performer", action: "placeholder.claimed", entityType: "worker", entityId: ph.id, summary: `${ph.displayName} → profil` }, tx);
      }
    }
    const [mine] = await tx.select().from(workParticipantsTable).where(and(eq(workParticipantsTable.workId, work.id), eq(workParticipantsTable.workerId, workerId)));
    if (!mine) {
      await tx.insert(workParticipantsTable).values({ workId: work.id, workerId, role: inv.role, status: "accepted", addedByUserId: inv.createdByUserId, respondedAt: now });
    } else if (mine.status !== "accepted") {
      await tx.update(workParticipantsTable).set({ status: "accepted", respondedAt: now }).where(eq(workParticipantsTable.id, mine.id));
    }
    await tx.update(homeInvitationsTable).set({ status: "accepted", acceptedByUserId: userId, acceptedAt: now }).where(eq(homeInvitationsTable.id, inv.id));
    await audit({ homeId: work.homeId, workerId, actorUserId: userId, actorRole: "performer", action: "participant.accepted", entityType: "work", entityId: work.id, summary: `${work.title} — ${inv.role}` }, tx);
  });
  res.json({ redirect: `/works/${work.id}` });
});

/* --------------------------------------------------------------------- media */

router.post("/home-media", async (req, res): Promise<void> => {
  const body = AttachHomeMediaBody.safeParse(req.body);
  if (!body.success) return bad(res, "Fayllar düzgün deyil");
  const userId = uid(req);
  const d = body.data;
  let homeId: string | null = null;
  let workId: string | null = null;
  let roomId: string | null = null;
  let workerId: string | null = null;
  if (d.workerId && !d.homeId && !d.workId) {
    const worker = await loadWorker(d.workerId);
    if (!worker || worker.status !== "active" || !canManageWorker(await loadActor(userId), worker)) return forbidden(res);
    workerId = worker.id;
  } else if (d.workId) {
    const a = await getWorkAccess(userId, d.workId);
    if (!a) return notFound(res, "İş tapılmadı");
    if (!workPermissions(a).addMedia) return forbidden(res);
    homeId = a.work.homeId; workId = a.work.id; roomId = a.work.roomId;
  } else if (d.homeId) {
    const a = await getHomeAccess(userId, d.homeId);
    if (!a) return notFound(res, "Ev tapılmadı");
    if (a.memberRole !== "owner" && a.memberRole !== "technician" && !a.performerWorkIds.size) return forbidden(res);
    homeId = a.home.id;
    if (d.roomId) {
      const ok = await db.execute(sql`select 1 from home_rooms where id = ${d.roomId} and home_id = ${homeId}`);
      if (!ok.rows.length) return bad(res, "Otaq bu evə aid deyil");
      roomId = d.roomId;
    }
  } else return bad(res, "Faylın aid olduğu yeri seçin");
  try {
    const rows = await attachHomeMedia(userId, d.files, { homeId, workId, roomId, workerId, caption: (d.caption ?? "").trim(), phase: d.phase ?? "other" });
    if (homeId) await audit({ homeId, actorUserId: userId, actorRole: "uploader", action: "media.added", entityType: workId ? "work" : "home", entityId: workId ?? homeId, summary: `${rows.length} fayl${d.phase ? ` (${d.phase})` : ""}` });
    res.json(rows.map((m) => mediaDto(m, userId)));
  } catch (err) {
    if (err instanceof HomeMediaError) return bad(res, err.message);
    throw err;
  }
});

router.delete("/home-media/:mediaId", async (req, res): Promise<void> => {
  const p = DeleteHomeMediaParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Fayl tapılmadı");
  const userId = uid(req);
  const [m] = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.id, p.data.mediaId), isNull(homeMediaTable.deletedAt)));
  if (!m) return notFound(res, "Fayl tapılmadı");
  const a = m.homeId ? await getHomeAccess(userId, m.homeId) : null;
  if (m.uploadedByUserId !== userId && a?.memberRole !== "owner") return forbidden(res);
  // Soft delete: the file record stays for the audit trail.
  await db.update(homeMediaTable).set({ deletedAt: new Date() }).where(eq(homeMediaTable.id, m.id));
  if (m.homeId) {
    await db.update(homesTable).set({ coverMediaId: null }).where(and(eq(homesTable.id, m.homeId), eq(homesTable.coverMediaId, m.id)));
    await audit({ homeId: m.homeId, actorUserId: userId, actorRole: a?.memberRole ?? "uploader", action: "media.hidden", entityType: "media", entityId: m.id, summary: m.originalName });
  }
  res.json({ success: true });
});

/* ---------------------------------------------------------------------- admin */

router.post("/admin/workers/:workerId/identity", async (req, res): Promise<void> => {
  const p = SetWorkerIdentityParams.safeParse(req.params);
  const body = SetWorkerIdentityBody.safeParse(req.body);
  if (!p.success) return notFound(res, "Profil tapılmadı");
  if (!body.success) return bad(res);
  const userId = uid(req);
  if (!adminUserIds().has(userId)) return forbidden(res);
  const worker = await loadWorker(p.data.workerId);
  if (!worker || worker.status !== "active") return notFound(res, "Profil tapılmadı");
  const [saved] = await db.update(workersTable).set({ identityVerifiedAt: body.data.verified ? new Date() : null, identityVerifiedBy: body.data.verified ? userId : null, updatedAt: new Date() })
    .where(eq(workersTable.id, worker.id)).returning();
  await audit({ workerId: worker.id, actorUserId: userId, actorRole: "admin", action: body.data.verified ? "worker.identity_verified" : "worker.identity_revoked", entityType: "worker", entityId: worker.id, summary: worker.displayName });
  await profileOut(res, saved, userId);
});

void or;
export default router;
