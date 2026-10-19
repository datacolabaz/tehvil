import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { CreateServiceInterestBody, GetHomeCostsParams, GetHomePassportParams } from "@workspace/api-zod";
import {
  db,
  equipmentTable,
  homeAuditTable,
  homeMediaTable,
  homeRoomsTable,
  infrastructureItemsTable,
  serviceInterestsTable,
  workApprovalsTable,
  workRecordsTable,
} from "@workspace/db";
import { getHomeAccess, homesOfUser } from "../lib/homeAccess";
import { bad, forbidden, homeSmetaDtos, noStore, notFound } from "./homes";

/**
 * Passport completeness, costs, reminders and "interest" for services that do not exist yet.
 * Completeness only says which sections contain data — it is never a rating of the home.
 */
const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;

const ELECTRIC = ["electric", "electrical_panel"];
const WATER = ["water", "sewer", "valve"];
const HEAT = ["heating", "gas", "ventilation"];
const OTHER_LINES = ["internet", "meter", "other"];
const isVisual = (t: string) => t.startsWith("image/") || t.startsWith("video/");

router.get("/homes/:homeId/passport", async (req, res): Promise<void> => {
  noStore(res);
  const p = GetHomePassportParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await getHomeAccess(uid(req), p.data.homeId);
  if (!a) return notFound(res, "Ev tapılmadı");
  if (!a.memberRole) return forbidden(res);
  const homeId = a.home.id;
  const [rooms, works, media, infra, equipment, [lastAudit]] = await Promise.all([
    db.select({ id: homeRoomsTable.id }).from(homeRoomsTable).where(eq(homeRoomsTable.homeId, homeId)),
    db.select().from(workRecordsTable).where(eq(workRecordsTable.homeId, homeId)),
    db.select({ id: homeMediaTable.id, workId: homeMediaTable.workId, contentType: homeMediaTable.contentType, phase: homeMediaTable.phase }).from(homeMediaTable).where(and(eq(homeMediaTable.homeId, homeId), isNull(homeMediaTable.deletedAt))),
    db.select().from(infrastructureItemsTable).where(eq(infrastructureItemsTable.homeId, homeId)),
    db.select().from(equipmentTable).where(eq(equipmentTable.homeId, homeId)),
    db.select({ at: homeAuditTable.createdAt }).from(homeAuditTable).where(eq(homeAuditTable.homeId, homeId)).orderBy(desc(homeAuditTable.createdAt)).limit(1),
  ]);
  const created = works.length ? await db.select({ workId: workApprovalsTable.workId, role: workApprovalsTable.actorRole }).from(workApprovalsTable)
    .where(and(inArray(workApprovalsTable.workId, works.map((w) => w.id)), eq(workApprovalsTable.action, "created"))) : [];
  const h = a.home;
  const lines = (types: string[]) => infra.filter((i) => types.includes(i.type)).length;
  const basic = [h.address, h.areaM2, h.builtYear, h.roomCount].filter((v) => v !== null && v !== "" && v !== undefined).length;
  const docs = media.filter((m) => m.phase === "document").length;
  const photos = media.filter((m) => isVisual(m.contentType) && m.phase !== "document").length;
  const warranties = equipment.filter((e) => e.warrantyUntil).length + works.filter((w) => w.warrantyNote.trim()).length;
  const maintenance = works.filter((w) => w.kind === "maintenance" || w.kind === "repair" || w.equipmentId).length + equipment.filter((e) => e.nextServiceAt).length;
  const base = `/homes/${homeId}`;
  const sections = [
    { key: "basic", label: "Ümumi məlumat", count: basic, hint: "Ünvan, sahə, tikinti ili, otaq sayı", path: base },
    { key: "rooms", label: "Otaqlar", count: rooms.length, hint: "Otaqların siyahısı", path: `${base}/rooms` },
    { key: "history", label: "Təmir tarixçəsi", count: works.length, hint: "Görülən işlər və tarixləri", path: `${base}/history` },
    { key: "photos", label: "Foto arxivi", count: photos, hint: "Təmir və gizli xətlərin fotoları", path: `${base}/history` },
    { key: "electric", label: "Elektrik xətləri", count: lines(ELECTRIC), hint: "Naqillərin yeri, elektrik lövhəsi", path: `${base}/map` },
    { key: "water", label: "Su və kanalizasiya", count: lines(WATER), hint: "Boruların yeri, ventillər", path: `${base}/map` },
    { key: "heating", label: "İstilik, qaz, ventilyasiya", count: lines(HEAT), hint: "Döşəməaltı isitmə, qaz xətti", path: `${base}/map` },
    { key: "other_lines", label: "Sayğaclar, internet və digər", count: lines(OTHER_LINES), hint: "Sayğaclar, kabel yolları", path: `${base}/map` },
    { key: "materials", label: "Materiallar", count: works.filter((w) => w.materials.trim()).length, hint: "İşlərdə istifadə olunan materiallar", path: `${base}/equipment` },
    { key: "equipment", label: "Avadanlıqlar", count: equipment.length, hint: "Kombi, kondisioner, su filtri…", path: `${base}/equipment` },
    { key: "warranty", label: "Zəmanətlər", count: warranties, hint: "Avadanlıq və işlərin zəmanəti", path: `${base}/equipment` },
    { key: "documents", label: "Sənədlər", count: docs, hint: "Texniki pasport, müqavilə, qəbz, yoxlama hesabatı", path: `${base}/documents` },
    { key: "maintenance", label: "Texniki xidmət", count: maintenance, hint: "Baxım qeydləri və növbəti xidmət tarixi", path: `${base}/equipment` },
  ].map((s) => ({ ...s, filled: s.count > 0 }));
  const filled = sections.filter((s) => s.filled).length;
  const role = (w: { id: string }) => created.find((c) => c.workId === w.id)?.role ?? "owner";
  const withFiles = new Set(media.filter((m) => m.workId && !isVisual(m.contentType)).map((m) => m.workId));
  res.json({
    percent: Math.round((filled / sections.length) * 100), filledSections: filled, totalSections: sections.length, sections,
    sources: {
      owner: works.filter((w) => role(w) !== "performer").length + infra.filter((i) => i.source === "owner" || i.source === "plan").length,
      contractor: works.filter((w) => role(w) === "performer").length + infra.filter((i) => i.source === "worker").length,
      documented: works.filter((w) => withFiles.has(w.id)).length + docs,
      specialist: works.filter((w) => w.inspectedAt).length + infra.filter((i) => i.verifiedAt).length,
    },
    lastChangeAt: lastAudit?.at.toISOString() ?? null,
  });
});

router.get("/homes/:homeId/costs", async (req, res): Promise<void> => {
  noStore(res);
  const p = GetHomeCostsParams.safeParse(req.params);
  if (!p.success) return notFound(res, "Ev tapılmadı");
  const a = await getHomeAccess(uid(req), p.data.homeId);
  if (!a) return notFound(res, "Ev tapılmadı");
  // Costs are private to the people of the home (performers and share links never see them).
  if (!a.memberRole) return forbidden(res);
  const works = await db.select().from(workRecordsTable).where(eq(workRecordsTable.homeId, a.home.id));
  const priced = works.filter((w) => w.cost != null);
  const sum = (key: (w: (typeof works)[number]) => string) => {
    const m = new Map<string, { key: string; currency: string; total: number; count: number }>();
    for (const w of priced) {
      const k = `${key(w)}|${w.currency}`;
      const cur = m.get(k) ?? { key: key(w), currency: w.currency, total: 0, count: 0 };
      cur.total = Math.round((cur.total + Number(w.cost)) * 100) / 100; cur.count += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((x, y) => y.total - x.total);
  };
  res.json({
    byCurrency: sum((w) => w.currency), byCategory: sum((w) => w.category),
    worksWithCost: priced.length, worksWithoutCost: works.filter((w) => w.cost == null && (w.status === "completed" || w.status === "confirmed")).length,
    estimates: await homeSmetaDtos(a.home.id, uid(req)),
  });
});

/** In-app reminders only: nothing is sent by SMS, WhatsApp or e-mail. */
router.get("/me/reminders", async (req, res): Promise<void> => {
  noStore(res);
  const homes = (await homesOfUser(uid(req))).filter((h) => h.role !== "viewer");
  if (!homes.length) { res.json([]); return; }
  const today = new Date().toISOString().slice(0, 10);
  const horizon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const items = await db.select().from(equipmentTable).where(inArray(equipmentTable.homeId, homes.map((h) => h.home.id)));
  const name = new Map(homes.map((h) => [h.home.id, h.home.name]));
  const out: { kind: string; homeId: string; homeName: string; equipmentId: string; title: string; dueDate: string; overdue: boolean }[] = [];
  for (const e of items) {
    if (e.nextServiceAt && e.nextServiceAt <= horizon(30)) out.push({ kind: "service", homeId: e.homeId, homeName: name.get(e.homeId)!, equipmentId: e.id, title: `${e.name}: texniki xidmət`, dueDate: e.nextServiceAt, overdue: e.nextServiceAt < today });
    if (e.warrantyUntil && e.warrantyUntil >= today && e.warrantyUntil <= horizon(60)) out.push({ kind: "warranty", homeId: e.homeId, homeName: name.get(e.homeId)!, equipmentId: e.id, title: `${e.name}: zəmanət bitir`, dueDate: e.warrantyUntil, overdue: false });
  }
  res.json(out.sort((x, y) => x.dueDate.localeCompare(y.dueDate)));
});

router.post("/service-interests", async (req, res): Promise<void> => {
  const body = CreateServiceInterestBody.safeParse(req.body);
  if (!body.success) return bad(res);
  const userId = uid(req);
  let homeId: string | null = null;
  if (body.data.homeId) {
    const a = await getHomeAccess(userId, body.data.homeId);
    if (!a?.memberRole) return notFound(res, "Ev tapılmadı");
    homeId = a.home.id;
  }
  await db.insert(serviceInterestsTable).values({ userId, kind: body.data.kind, homeId, contact: (body.data.contact ?? "").trim(), note: (body.data.note ?? "").trim() });
  res.json({ success: true });
});

export default router;
