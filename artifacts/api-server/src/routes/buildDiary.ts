import { getAuth } from "@clerk/express";
import { and, desc, eq, isNull, ne, notInArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, homeMediaTable, homeMembersTable, homesTable, stagePhotoInvitesTable, workApprovalsTable, workRecordsTable } from "@workspace/db";
import { diaryStatus, photoTags } from "../lib/buildDiary";
import { BUILD_TEMPLATES, templateOf } from "../lib/buildTemplates";
import { homeMediaUrl } from "../lib/homeDtos";
import { audit, getHomeAccess, homePermissions, type HomeAccess } from "../lib/homeAccess";

/**
 * "Evimin tikinti tarixçəsi": one screen for a home under construction — the current stage, a big camera button,
 * stage cards from ready-made templates and the latest photos. It reuses the home's works (stages) and media; it
 * only adds optional tags (floor, room, template shot), the current stage, hiding a stage and deleting a photo.
 *
 * Who may do what (existing roles):
 *   owner / member (manages the home) — everything here, including deleting photos and marking a stage done;
 *   contributor (usta / specialist) — sees the stages, adds photos and tags their own photos; never deletes,
 *     never changes stages or the home;
 *   performer of a work — only that work's stage;
 *   no-account links — see photoInvites.ts.
 */
const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
const bad = (res: Response, error: string, status = 400) => { res.status(status).json({ error }); };
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const HIDDEN_PHASES = ["finance", "document"];

async function homeOr404(req: Request, res: Response) {
  const a = await getHomeAccess(uid(req), String(req.params.homeId));
  if (!a) { bad(res, "Ev tapılmadı", 404); return null; }
  return a;
}
const managerOr403 = (a: HomeAccess, res: Response) => { if (!homePermissions(a).edit) { bad(res, "Bunu yalnız ev sahibi və ya evi idarə edən edə bilər", 403); return false; } return true; };
const stagesVisibleTo = (a: HomeAccess) => (w: { id: string }) => !!a.memberRole || a.performerWorkIds.has(w.id) || a.invitedWorkIds.has(w.id);
const order = <T extends { sortOrder: number | null; createdAt: Date }>(rows: T[]) => [...rows].sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.createdAt.getTime() - b.createdAt.getTime());

router.get("/homes/:homeId/diary", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const a = await homeOr404(req, res); if (!a) return;
  const me = uid(req);
  const p = homePermissions(a);
  const works = order(await db.select().from(workRecordsTable).where(eq(workRecordsTable.homeId, a.home.id))).filter(stagesVisibleTo(a));
  const ids = new Set(works.map((w) => w.id));
  const media = (await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt), notInArray(homeMediaTable.phase, HIDDEN_PHASES))).orderBy(desc(homeMediaTable.createdAt)))
    .filter((m) => m.workId && ids.has(m.workId) && (m.contentType.startsWith("image/") || m.contentType.startsWith("video/")));
  const members = await db.select().from(homeMembersTable).where(eq(homeMembersTable.homeId, a.home.id));
  const invites = p.edit ? await db.select().from(stagePhotoInvitesTable).where(eq(stagePhotoInvitesTable.homeId, a.home.id)) : [];
  const who = (m: typeof media[number]) => {
    if (m.uploadedByUserId === me) return "Siz";
    if (m.inviteId) { const i = invites.find((x) => x.id === m.inviteId); return i?.label ? `${i.label} (link)` : "Dəvət linki ilə"; }
    const mem = members.find((x) => x.userId === m.uploadedByUserId);
    return mem?.displayName || (mem?.role === "owner" ? "Ev sahibi" : mem ? "Ev üzvü" : "Usta");
  };
  const count = (id: string) => media.filter((m) => m.workId === id).length;
  const current = a.home.currentWorkId && works.some((w) => w.id === a.home.currentWorkId && !w.hiddenAt) ? a.home.currentWorkId : null;
  res.json({
    home: { id: a.home.id, name: a.home.name, address: [a.home.address, a.home.district, a.home.city].filter(Boolean).join(", "), propertyType: a.home.propertyType, stage: a.home.stage },
    role: a.role,
    permissions: { manage: p.edit, addPhotos: p.addWorks, deletePhotos: p.edit, share: p.manageSharing },
    currentWorkId: current,
    templates: BUILD_TEMPLATES,
    stages: works.map((w) => {
      const t = templateOf(w.templateKey);
      const n = count(w.id);
      const last = media.find((m) => m.workId === w.id && m.contentType.startsWith("image/"));
      return {
        id: w.id, title: w.title, templateKey: w.templateKey, hint: t?.hint ?? (w.description || null), glossary: t?.glossary ?? null,
        shots: t?.shots ?? [], perFloor: t?.perFloor ?? true, perRoom: t?.perRoom ?? false,
        status: w.status, diaryStatus: diaryStatus(w.status, n), awaitingReview: w.status === "completed", revision: w.status === "revision",
        hidden: !!w.hiddenAt, note: w.description, photoCount: n, lastPhotoUrl: last ? homeMediaUrl(last.id) : null, lastPhotoAt: last?.createdAt.toISOString() ?? null,
      };
    }),
    photos: media.map((m) => ({
      id: m.id, url: homeMediaUrl(m.id), contentType: m.contentType, workId: m.workId, caption: m.caption, createdAt: m.createdAt.toISOString(), takenAt: m.takenAt?.toISOString() ?? null,
      floorLevel: m.floorLevel, roomKind: m.roomKind, shotKey: m.shotKey, by: who(m), viaLink: !!m.inviteId, mine: m.uploadedByUserId === me,
      hasGps: !!(m.clientMeta as { gps?: unknown } | null)?.gps,
    })),
  });
});

/** Ready-made stages for a private house / villa in one tap; stages already there are not duplicated. */
router.post("/homes/:homeId/diary/template", async (req, res): Promise<void> => {
  const a = await homeOr404(req, res); if (!a) return;
  if (!managerOr403(a, res)) return;
  const existing = await db.select().from(workRecordsTable).where(eq(workRecordsTable.homeId, a.home.id));
  const have = new Set(existing.map((w) => w.templateKey).filter(Boolean));
  const add = BUILD_TEMPLATES.filter((t) => t.core && !have.has(t.key));
  let pos = existing.reduce((m, w) => Math.max(m, w.sortOrder ?? 0), 0);
  const created = add.length ? await db.insert(workRecordsTable).values(add.map((t) => ({
    homeId: a.home.id, title: t.title, category: t.category, kind: t.kind, status: "planned", templateKey: t.key, sortOrder: ++pos, createdByUserId: uid(req),
  }))).returning() : [];
  if (created.length && !a.home.currentWorkId) await db.update(homesTable).set({ currentWorkId: created[0].id, ...(a.home.stage === "living" ? { stage: "construction" } : {}), updatedAt: new Date() }).where(eq(homesTable.id, a.home.id));
  if (created.length) await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: a.role, action: "diary.template_applied", entityType: "home", entityId: a.home.id, summary: `${created.length} mərhələ şablondan yaradıldı` });
  res.json({ created: created.length });
});

/** One more stage: an optional template (roof, waterproofing, …) or the person's own name. */
router.post("/homes/:homeId/diary/stages", async (req, res): Promise<void> => {
  const a = await homeOr404(req, res); if (!a) return;
  if (!managerOr403(a, res)) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const t = typeof b.templateKey === "string" ? templateOf(b.templateKey) : null;
  const title = (t?.title ?? (typeof b.title === "string" ? b.title : "")).trim().slice(0, 200);
  if (title.length < 2) return bad(res, "Mərhələnin adını yazın");
  const existing = await db.select().from(workRecordsTable).where(eq(workRecordsTable.homeId, a.home.id));
  if (t) {
    const same = existing.find((w) => w.templateKey === t.key);
    if (same && !same.hiddenAt) return bad(res, `“${t.title}” artıq siyahıdadır`, 409);
    if (same) { await db.update(workRecordsTable).set({ hiddenAt: null, updatedAt: new Date() }).where(eq(workRecordsTable.id, same.id)); return void res.json({ id: same.id, restored: true }); }
  }
  const [w] = await db.insert(workRecordsTable).values({
    homeId: a.home.id, title, category: t?.category ?? "general", kind: t?.kind ?? "construction", status: "planned", templateKey: t?.key ?? null,
    sortOrder: existing.reduce((m, x) => Math.max(m, x.sortOrder ?? 0), 0) + 1, createdByUserId: uid(req),
  }).returning();
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: a.role, action: "work.created", entityType: "work", entityId: w.id, summary: w.title });
  res.json({ id: w.id, restored: false });
});

/** The stage the big camera button adds to. */
router.put("/homes/:homeId/diary/current", async (req, res): Promise<void> => {
  const a = await homeOr404(req, res); if (!a) return;
  if (!managerOr403(a, res)) return;
  const id = (req.body ?? {}).workId;
  if (id !== null) {
    if (!isUuid(id)) return bad(res, "Mərhələni seçin");
    const [w] = await db.select().from(workRecordsTable).where(and(eq(workRecordsTable.id, id), eq(workRecordsTable.homeId, a.home.id), isNull(workRecordsTable.hiddenAt)));
    if (!w) return bad(res, "Mərhələ tapılmadı", 404);
  }
  await db.update(homesTable).set({ currentWorkId: id, updatedAt: new Date() }).where(eq(homesTable.id, a.home.id));
  res.json({ currentWorkId: id });
});

/** Hide / show a stage, mark it done (only the owner side; photos alone never do this), or keep a short note. */
router.patch("/homes/:homeId/diary/stages/:workId", async (req, res): Promise<void> => {
  const a = await homeOr404(req, res); if (!a) return;
  if (!managerOr403(a, res)) return;
  const id = String(req.params.workId);
  const [w] = isUuid(id) ? await db.select().from(workRecordsTable).where(and(eq(workRecordsTable.id, id), eq(workRecordsTable.homeId, a.home.id))) : [];
  if (!w) return bad(res, "Mərhələ tapılmadı", 404);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const set: Partial<typeof workRecordsTable.$inferInsert> = { updatedAt: new Date() };
  if (typeof b.hidden === "boolean") set.hiddenAt = b.hidden ? new Date() : null;
  if (typeof b.note === "string") set.description = b.note.trim().slice(0, 2000);
  if (typeof b.done === "boolean") {
    const to = b.done ? "confirmed" : "in_progress";
    if (w.status !== to) {
      set.status = to; set.confirmedAt = b.done ? new Date() : null;
      await db.insert(workApprovalsTable).values({ workId: w.id, action: b.done ? "confirm" : "reopen", fromStatus: w.status, toStatus: to, actorUserId: uid(req), actorRole: a.role, note: "" });
    }
  }
  const [u] = await db.update(workRecordsTable).set(set).where(eq(workRecordsTable.id, w.id)).returning();
  if (b.hidden === true && a.home.currentWorkId === w.id) await db.update(homesTable).set({ currentWorkId: null }).where(eq(homesTable.id, a.home.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: a.role, action: typeof b.done === "boolean" ? (b.done ? "work.confirm" : "work.reopen") : typeof b.hidden === "boolean" ? (b.hidden ? "diary.stage_hidden" : "diary.stage_shown") : "work.updated", entityType: "work", entityId: w.id, summary: u.title, ...(u.status !== w.status ? { changes: { status: { from: w.status, to: u.status } } } : {}) });
  res.json({ id: u.id, status: u.status, hidden: !!u.hiddenAt, note: u.description });
});

async function photoOf(a: HomeAccess, mediaId: string) {
  if (!isUuid(mediaId)) return null;
  const [m] = await db.select().from(homeMediaTable).where(and(eq(homeMediaTable.id, mediaId), eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt), ne(homeMediaTable.phase, "document")));
  return m ?? null;
}

/** Floor, room, which shot, note — all optional. Whoever manages the home, or the person who added the photo. */
router.patch("/homes/:homeId/diary/photos/:mediaId", async (req, res): Promise<void> => {
  const a = await homeOr404(req, res); if (!a) return;
  const m = await photoOf(a, String(req.params.mediaId));
  if (!m || !m.workId) return bad(res, "Foto tapılmadı", 404);
  const manager = homePermissions(a).edit;
  if (!manager && m.uploadedByUserId !== uid(req)) return bad(res, "Yalnız öz fotonuzun qeydini dəyişə bilərsiniz", 403);
  const b = (req.body ?? {}) as Record<string, unknown>;
  let workId = m.workId;
  if (b.workId !== undefined && b.workId !== m.workId) {
    if (!manager) return bad(res, "Fotonu başqa mərhələyə yalnız ev sahibi köçürə bilər", 403);
    const [w] = isUuid(b.workId) ? await db.select().from(workRecordsTable).where(and(eq(workRecordsTable.id, b.workId), eq(workRecordsTable.homeId, a.home.id))) : [];
    if (!w) return bad(res, "Mərhələ tapılmadı", 404);
    workId = w.id;
  }
  const [w] = await db.select().from(workRecordsTable).where(eq(workRecordsTable.id, workId));
  const tags = photoTags(b, w?.templateKey ?? null, true);
  if (workId !== m.workId && !("shotKey" in b)) tags.shotKey = null;
  const [u] = await db.update(homeMediaTable).set({ ...tags, workId, ...(typeof b.caption === "string" ? { caption: b.caption.trim().slice(0, 300) } : {}) }).where(eq(homeMediaTable.id, m.id)).returning();
  res.json({ id: u.id, workId: u.workId, floorLevel: u.floorLevel, roomKind: u.roomKind, shotKey: u.shotKey, caption: u.caption });
});

/** Only whoever manages the home deletes a photo (kept in storage, hidden everywhere, recorded in the audit log). */
router.delete("/homes/:homeId/diary/photos/:mediaId", async (req, res): Promise<void> => {
  const a = await homeOr404(req, res); if (!a) return;
  if (!homePermissions(a).edit) return bad(res, "Fotonu yalnız ev sahibi və ya evi idarə edən silə bilər", 403);
  const m = await photoOf(a, String(req.params.mediaId));
  if (!m) return bad(res, "Foto tapılmadı", 404);
  await db.update(homeMediaTable).set({ deletedAt: new Date() }).where(eq(homeMediaTable.id, m.id));
  if (a.home.coverMediaId === m.id) await db.update(homesTable).set({ coverMediaId: null }).where(eq(homesTable.id, a.home.id));
  await audit({ homeId: a.home.id, actorUserId: uid(req), actorRole: a.role, action: "media.deleted", entityType: "media", entityId: m.id, summary: m.originalName });
  res.json({ deleted: true });
});

export default router;
