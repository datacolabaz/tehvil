import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AttachRealtorMediaBody,
  CreatePassportWorkBody,
  CreatePassportWorkParams,
  CreatePropertyPassportBody,
  CreateRealtorAgentBody,
  CreateRealtorAppointmentBody,
  CreateRealtorLeadBody,
  CreateRealtorListingBody,
  DeletePassportWorkParams,
  DeletePropertyPassportParams,
  DeleteRealtorAgentParams,
  DeleteRealtorAppointmentParams,
  DeleteRealtorLeadParams,
  DeleteRealtorListingParams,
  GetPropertyPassportParams,
  GetRealtorListingParams,
  ListRealtorLeadMatchesParams,
  ListRealtorLeadMessagesParams,
  SendRealtorLeadMessageBody,
  SendRealtorLeadMessageParams,
  SetPropertyPassportStatusBody,
  SetPropertyPassportStatusParams,
  UpdatePassportWorkBody,
  UpdatePassportWorkParams,
  UpdatePropertyPassportBody,
  UpdatePropertyPassportParams,
  UpdateRealtorAgentBody,
  UpdateRealtorAgentParams,
  UpdateRealtorAppointmentBody,
  UpdateRealtorAppointmentParams,
  UpdateRealtorLeadBody,
  UpdateRealtorLeadParams,
  UpdateRealtorListingBody,
  UpdateRealtorListingParams,
  UpdateRealtorProfileBody,
  UpdateRealtorWhatsappBody,
  CreateContractorConfirmLinkParams,
  CreateOwnerConfirmLinkParams,
  ImportRealtorListingBody,
} from "@workspace/api-zod";
import {
  db,
  passportWorksTable,
  propertyPassportsTable,
  realtorAgentsTable,
  realtorAppointmentsTable,
  realtorEventsTable,
  realtorLeadsTable,
  realtorListingsTable,
  realtorMessagesTable,
  realtorNotificationsTable,
  realtorProfilesTable,
  realtorWhatsappSettingsTable,
} from "@workspace/db";
import {
  appointmentDtos,
  bakuDayStart,
  hashToken,
  leadDtos,
  listingDtos,
  loadPassport,
  matchListings,
  messageDtos,
  newPublicId,
  newToken,
  passportDtos,
  publicOrigin,
  waLink,
  workContentChanged,
} from "../lib/realtorCore";
import { attachRealtorMedia, mediaDto, MediaError, ownedMediaIds, realtorMediaUrl } from "../lib/realtorMedia";
import { cloudApiAvailable, encryptToken, getSettings, isConnected, sendToLead } from "../lib/realtorWhatsapp";
import { ImportError, importListing } from "../lib/realtorImport";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();
const uid = (req: Request) => getAuth(req).userId!;
const bad = (res: Response, error = "Sorğu düzgün deyil") => { res.status(400).json({ error }); };
const NAMES: Record<string, string> = { Agent: "Agent", Listing: "Elan", Lead: "Lead", Appointment: "Görüş", Passport: "Pasport", Work: "İş", Record: "Qeyd" };
const notFound = (res: Response, what = "Record") => { res.status(404).json({ error: `${NAMES[what] ?? "Qeyd"} tapılmadı` }); };
const noStore = (res: Response) => res.setHeader("Cache-Control", "private, no-store");

/** Rejects references to another account's agents, listings or leads. */
async function refsOwned(userId: string, refs: { agentId?: string | null; listingId?: string | null; leadId?: string | null }) {
  if (refs.agentId) {
    const [a] = await db.select({ id: realtorAgentsTable.id }).from(realtorAgentsTable).where(and(eq(realtorAgentsTable.id, refs.agentId), eq(realtorAgentsTable.ownerUserId, userId)));
    if (!a) return false;
  }
  if (refs.listingId) {
    const [l] = await db.select({ id: realtorListingsTable.id }).from(realtorListingsTable).where(and(eq(realtorListingsTable.id, refs.listingId), eq(realtorListingsTable.ownerUserId, userId)));
    if (!l) return false;
  }
  if (refs.leadId) {
    const [l] = await db.select({ id: realtorLeadsTable.id }).from(realtorLeadsTable).where(and(eq(realtorLeadsTable.id, refs.leadId), eq(realtorLeadsTable.ownerUserId, userId)));
    if (!l) return false;
  }
  return true;
}

const keepOwned = (ids: string[], owned: Set<string>) => [...new Set(ids)].filter((id) => owned.has(id));

/* -------------------------------------------------------------------- profile */

async function profileDto(userId: string) {
  const [p] = await db.select().from(realtorProfilesTable).where(eq(realtorProfilesTable.userId, userId));
  if (!p) return { exists: false, fullName: "", agency: "", phone: "", whatsapp: "", instagram: "", bio: "", photoMediaId: null, photoUrl: null, logoMediaId: null, logoUrl: null };
  return {
    exists: true, fullName: p.fullName, agency: p.agency, phone: p.phone, whatsapp: p.whatsapp, instagram: p.instagram, bio: p.bio,
    photoMediaId: p.photoMediaId, photoUrl: p.photoMediaId ? realtorMediaUrl(p.photoMediaId) : null,
    logoMediaId: p.logoMediaId, logoUrl: p.logoMediaId ? realtorMediaUrl(p.logoMediaId) : null,
  };
}

router.get("/realtor/profile", async (req, res): Promise<void> => {
  noStore(res);
  res.json(await profileDto(uid(req)));
});

router.put("/realtor/profile", async (req, res): Promise<void> => {
  const body = UpdateRealtorProfileBody.safeParse(req.body);
  if (!body.success) return bad(res, "Profil sahələrini yoxlayın");
  const userId = uid(req);
  const owned = await ownedMediaIds(userId, [body.data.photoMediaId, body.data.logoMediaId]);
  const values = {
    fullName: body.data.fullName.trim(), agency: body.data.agency.trim(), phone: body.data.phone.trim(), whatsapp: body.data.whatsapp.trim(),
    instagram: body.data.instagram.trim().replace(/^@/, ""), bio: body.data.bio.trim(),
    photoMediaId: body.data.photoMediaId && owned.has(body.data.photoMediaId) ? body.data.photoMediaId : null,
    logoMediaId: body.data.logoMediaId && owned.has(body.data.logoMediaId) ? body.data.logoMediaId : null,
  };
  await db.insert(realtorProfilesTable).values({ userId, ...values })
    .onConflictDoUpdate({ target: realtorProfilesTable.userId, set: { ...values, updatedAt: new Date() } });
  res.json(await profileDto(userId));
});

/* ---------------------------------------------------------------------- media */

router.post("/realtor/media", async (req, res): Promise<void> => {
  const body = AttachRealtorMediaBody.safeParse(req.body);
  if (!body.success) return bad(res, "Fayllar düzgün deyil");
  try {
    const rows = await attachRealtorMedia(uid(req), body.data.files);
    res.json(rows.map(mediaDto));
  } catch (err) {
    if (err instanceof MediaError) return bad(res, err.message);
    throw err;
  }
});

/* --------------------------------------------------------------------- agents */

async function agentDtos(userId: string, onlyId?: string) {
  const agents = await db.select().from(realtorAgentsTable)
    .where(onlyId ? and(eq(realtorAgentsTable.ownerUserId, userId), eq(realtorAgentsTable.id, onlyId)) : eq(realtorAgentsTable.ownerUserId, userId))
    .orderBy(asc(realtorAgentsTable.createdAt));
  if (!agents.length) return [];
  const ids = agents.map((a) => a.id);
  const [leads, appts, listings] = await Promise.all([
    db.select({ agentId: realtorLeadsTable.agentId, status: realtorLeadsTable.status, count: sql<number>`count(*)::int` }).from(realtorLeadsTable)
      .where(and(eq(realtorLeadsTable.ownerUserId, userId), inArray(realtorLeadsTable.agentId, ids))).groupBy(realtorLeadsTable.agentId, realtorLeadsTable.status),
    db.select({ agentId: realtorAppointmentsTable.agentId, count: sql<number>`count(*)::int` }).from(realtorAppointmentsTable)
      .where(and(eq(realtorAppointmentsTable.ownerUserId, userId), inArray(realtorAppointmentsTable.agentId, ids))).groupBy(realtorAppointmentsTable.agentId),
    db.select({ agentId: realtorListingsTable.agentId, count: sql<number>`count(*)::int` }).from(realtorListingsTable)
      .where(and(eq(realtorListingsTable.ownerUserId, userId), inArray(realtorListingsTable.agentId, ids))).groupBy(realtorListingsTable.agentId),
  ]);
  return agents.map((a) => {
    const mine = leads.filter((l) => l.agentId === a.id);
    return {
      id: a.id, fullName: a.fullName, phone: a.phone, email: a.email, active: a.active, createdAt: a.createdAt.toISOString(),
      stats: {
        leads: mine.reduce((s, l) => s + l.count, 0),
        activeLeads: mine.filter((l) => !["deal", "lost"].includes(l.status)).reduce((s, l) => s + l.count, 0),
        deals: mine.filter((l) => l.status === "deal").reduce((s, l) => s + l.count, 0),
        appointments: appts.find((x) => x.agentId === a.id)?.count ?? 0,
        listings: listings.find((x) => x.agentId === a.id)?.count ?? 0,
      },
    };
  });
}

router.get("/realtor/agents", async (req, res): Promise<void> => { noStore(res); res.json(await agentDtos(uid(req))); });

router.post("/realtor/agents", async (req, res): Promise<void> => {
  const body = CreateRealtorAgentBody.safeParse(req.body);
  if (!body.success) return bad(res, "Agent sahələrini yoxlayın");
  const userId = uid(req);
  const [a] = await db.insert(realtorAgentsTable).values({ ownerUserId: userId, fullName: body.data.fullName.trim(), phone: body.data.phone?.trim() ?? "", email: body.data.email?.trim() ?? "", active: body.data.active ?? true }).returning();
  res.status(201).json((await agentDtos(userId, a.id))[0]);
});

router.patch("/realtor/agents/:agentId", async (req, res): Promise<void> => {
  const params = UpdateRealtorAgentParams.safeParse(req.params);
  const body = UpdateRealtorAgentBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Agent");
  if (!body.success) return bad(res, "Agent sahələrini yoxlayın");
  const userId = uid(req);
  const [a] = await db.update(realtorAgentsTable).set({ fullName: body.data.fullName.trim(), phone: body.data.phone?.trim() ?? "", email: body.data.email?.trim() ?? "", ...(body.data.active !== undefined ? { active: body.data.active } : {}) })
    .where(and(eq(realtorAgentsTable.id, params.data.agentId), eq(realtorAgentsTable.ownerUserId, userId))).returning();
  if (!a) return notFound(res, "Agent");
  res.json((await agentDtos(userId, a.id))[0]);
});

router.delete("/realtor/agents/:agentId", async (req, res): Promise<void> => {
  const params = DeleteRealtorAgentParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Agent");
  const deleted = await db.delete(realtorAgentsTable).where(and(eq(realtorAgentsTable.id, params.data.agentId), eq(realtorAgentsTable.ownerUserId, uid(req)))).returning({ id: realtorAgentsTable.id });
  if (!deleted.length) return notFound(res, "Agent");
  res.json({ success: true, message: "Agent removed" });
});

/* ------------------------------------------------------------------- listings */

router.get("/realtor/listings", async (req, res): Promise<void> => {
  const userId = uid(req);
  const rows = await db.select().from(realtorListingsTable).where(eq(realtorListingsTable.ownerUserId, userId)).orderBy(desc(realtorListingsTable.updatedAt));
  noStore(res);
  res.json(await listingDtos(rows, userId));
});

async function listingValues(userId: string, d: ReturnType<typeof CreateRealtorListingBody.parse>) {
  const owned = await ownedMediaIds(userId, d.photoIds);
  return {
    agentId: d.agentId ?? null, title: d.title.trim(), dealType: d.dealType, propertyKind: d.propertyKind, district: d.district.trim(),
    address: d.address.trim(), rooms: d.rooms ?? null, areaM2: d.areaM2 ?? null, floor: d.floor.trim(), price: d.price ?? null,
    currency: d.currency, status: d.status, description: d.description.trim(),
    externalLinks: d.externalLinks.filter((l) => /^https?:\/\//i.test(l.url)).map((l) => ({ portal: l.portal, url: l.url.trim() })),
    photoIds: keepOwned(d.photoIds, owned),
  };
}

router.post("/realtor/listings", async (req, res): Promise<void> => {
  const body = CreateRealtorListingBody.safeParse(req.body);
  if (!body.success) return bad(res, "Elan sahələrini yoxlayın");
  const userId = uid(req);
  if (!(await refsOwned(userId, { agentId: body.data.agentId }))) return bad(res, "Agent tapılmadı");
  const [row] = await db.insert(realtorListingsTable).values({ ownerUserId: userId, ...(await listingValues(userId, body.data)) }).returning();
  res.status(201).json((await listingDtos([row], userId))[0]);
});

const importLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, key: (req) => `ri:${getAuth(req).userId}` });

router.post("/realtor/listings/import", importLimit, async (req, res): Promise<void> => {
  const body = ImportRealtorListingBody.safeParse(req.body);
  if (!body.success) return bad(res, "Elan linkini yazın");
  try {
    res.json(await importListing(uid(req), body.data.url));
  } catch (err) {
    if (err instanceof ImportError) return bad(res, err.message);
    req.log.warn({ err }, "realtor.import_failed");
    bad(res, "Səhifəni oxumaq alınmadı. Sahələri əl ilə doldurun.");
  }
});

router.get("/realtor/listings/:listingId", async (req, res): Promise<void> => {
  const params = GetRealtorListingParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Listing");
  const userId = uid(req);
  const [row] = await db.select().from(realtorListingsTable).where(and(eq(realtorListingsTable.id, params.data.listingId), eq(realtorListingsTable.ownerUserId, userId)));
  if (!row) return notFound(res, "Listing");
  noStore(res);
  res.json((await listingDtos([row], userId))[0]);
});

router.put("/realtor/listings/:listingId", async (req, res): Promise<void> => {
  const params = UpdateRealtorListingParams.safeParse(req.params);
  const body = UpdateRealtorListingBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Listing");
  if (!body.success) return bad(res, "Elan sahələrini yoxlayın");
  const userId = uid(req);
  if (!(await refsOwned(userId, { agentId: body.data.agentId }))) return bad(res, "Agent tapılmadı");
  const [row] = await db.update(realtorListingsTable).set({ ...(await listingValues(userId, body.data)), updatedAt: new Date() })
    .where(and(eq(realtorListingsTable.id, params.data.listingId), eq(realtorListingsTable.ownerUserId, userId))).returning();
  if (!row) return notFound(res, "Listing");
  res.json((await listingDtos([row], userId))[0]);
});

router.delete("/realtor/listings/:listingId", async (req, res): Promise<void> => {
  const params = DeleteRealtorListingParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Listing");
  const deleted = await db.delete(realtorListingsTable).where(and(eq(realtorListingsTable.id, params.data.listingId), eq(realtorListingsTable.ownerUserId, uid(req)))).returning({ id: realtorListingsTable.id });
  if (!deleted.length) return notFound(res, "Listing");
  res.json({ success: true, message: "Listing deleted" });
});

/* ---------------------------------------------------------------------- leads */

router.get("/realtor/leads", async (req, res): Promise<void> => {
  const userId = uid(req);
  const rows = await db.select().from(realtorLeadsTable).where(eq(realtorLeadsTable.ownerUserId, userId)).orderBy(desc(realtorLeadsTable.createdAt));
  noStore(res);
  res.json(await leadDtos(rows, userId));
});

function parseWhen(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

router.post("/realtor/leads", async (req, res): Promise<void> => {
  const body = CreateRealtorLeadBody.safeParse(req.body);
  if (!body.success) return bad(res, "Lead sahələrini yoxlayın");
  const userId = uid(req);
  const d = body.data;
  if (!(await refsOwned(userId, { agentId: d.agentId, listingId: d.listingId }))) return bad(res, "Agent və ya elan tapılmadı");
  const [row] = await db.insert(realtorLeadsTable).values({
    ownerUserId: userId, agentId: d.agentId ?? null, listingId: d.listingId ?? null, fullName: d.fullName.trim(), phone: d.phone?.trim() ?? "",
    source: d.source, status: d.status ?? "new", dealType: d.dealType ?? null, district: d.district?.trim() ?? "", rooms: d.rooms ?? null,
    budgetMin: d.budgetMin ?? null, budgetMax: d.budgetMax ?? null, timeframe: d.timeframe?.trim() ?? "", notes: d.notes?.trim() ?? "",
    nextAction: d.nextAction?.trim() ?? "", nextActionAt: parseWhen(d.nextActionAt) ?? null,
  }).returning();
  res.status(201).json((await leadDtos([row], userId))[0]);
});

router.patch("/realtor/leads/:leadId", async (req, res): Promise<void> => {
  const params = UpdateRealtorLeadParams.safeParse(req.params);
  const body = UpdateRealtorLeadBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Lead");
  if (!body.success) return bad(res, "Lead sahələrini yoxlayın");
  const userId = uid(req);
  const d = body.data;
  if (!(await refsOwned(userId, { agentId: d.agentId, listingId: d.listingId }))) return bad(res, "Agent və ya elan tapılmadı");
  const nextActionAt = parseWhen(d.nextActionAt);
  const patch: Partial<typeof realtorLeadsTable.$inferInsert> = { updatedAt: new Date() };
  if (d.agentId !== undefined) patch.agentId = d.agentId;
  if (d.listingId !== undefined) patch.listingId = d.listingId;
  if (d.fullName !== undefined) patch.fullName = d.fullName.trim();
  if (d.phone !== undefined) patch.phone = d.phone.trim();
  if (d.source !== undefined) patch.source = d.source;
  if (d.status !== undefined) { patch.status = d.status; patch.lastContactAt = new Date(); }
  if (d.dealType !== undefined) patch.dealType = d.dealType;
  if (d.district !== undefined) patch.district = d.district.trim();
  if (d.rooms !== undefined) patch.rooms = d.rooms;
  if (d.budgetMin !== undefined) patch.budgetMin = d.budgetMin;
  if (d.budgetMax !== undefined) patch.budgetMax = d.budgetMax;
  if (d.timeframe !== undefined) patch.timeframe = d.timeframe.trim();
  if (d.notes !== undefined) patch.notes = d.notes;
  if (d.nextAction !== undefined) patch.nextAction = d.nextAction.trim();
  if (nextActionAt !== undefined) { patch.nextActionAt = nextActionAt; patch.reminderSentAt = null; }
  if (d.readyForMeeting !== undefined) patch.readyForMeeting = d.readyForMeeting;
  const [row] = await db.update(realtorLeadsTable).set(patch).where(and(eq(realtorLeadsTable.id, params.data.leadId), eq(realtorLeadsTable.ownerUserId, userId))).returning();
  if (!row) return notFound(res, "Lead");
  res.json((await leadDtos([row], userId))[0]);
});

router.delete("/realtor/leads/:leadId", async (req, res): Promise<void> => {
  const params = DeleteRealtorLeadParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Lead");
  const deleted = await db.delete(realtorLeadsTable).where(and(eq(realtorLeadsTable.id, params.data.leadId), eq(realtorLeadsTable.ownerUserId, uid(req)))).returning({ id: realtorLeadsTable.id });
  if (!deleted.length) return notFound(res, "Lead");
  res.json({ success: true, message: "Lead deleted" });
});

router.get("/realtor/leads/:leadId/matches", async (req, res): Promise<void> => {
  const params = ListRealtorLeadMatchesParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Lead");
  const userId = uid(req);
  const [lead] = await db.select().from(realtorLeadsTable).where(and(eq(realtorLeadsTable.id, params.data.leadId), eq(realtorLeadsTable.ownerUserId, userId)));
  if (!lead) return notFound(res, "Lead");
  noStore(res);
  res.json(await listingDtos(await matchListings(lead, userId), userId));
});

router.get("/realtor/leads/:leadId/messages", async (req, res): Promise<void> => {
  const params = ListRealtorLeadMessagesParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Lead");
  const userId = uid(req);
  const rows = await db.select().from(realtorMessagesTable)
    .where(and(eq(realtorMessagesTable.leadId, params.data.leadId), eq(realtorMessagesTable.ownerUserId, userId)))
    .orderBy(asc(realtorMessagesTable.createdAt)).limit(300);
  noStore(res);
  res.json(await messageDtos(rows));
});

router.post("/realtor/leads/:leadId/messages", async (req, res): Promise<void> => {
  const params = SendRealtorLeadMessageParams.safeParse(req.params);
  const body = SendRealtorLeadMessageBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Lead");
  if (!body.success) return bad(res, "Mesaj yazın");
  const userId = uid(req);
  const [lead] = await db.select().from(realtorLeadsTable).where(and(eq(realtorLeadsTable.id, params.data.leadId), eq(realtorLeadsTable.ownerUserId, userId)));
  if (!lead) return notFound(res, "Lead");
  const settings = await getSettings(userId);
  const message = await sendToLead({ settings, lead, body: body.data.body.trim(), kind: body.data.kind ?? "manual" });
  // A message sent by hand counts as contact; the scheduler waits again before the next follow-up.
  await db.update(realtorLeadsTable).set({ lastContactAt: new Date(), followUpSentAt: null, status: lead.status === "new" ? "contacted" : lead.status, updatedAt: new Date() }).where(eq(realtorLeadsTable.id, lead.id));
  const [dto] = await messageDtos([message]);
  res.json({ message: dto, waLink: message.status === "sent" ? null : waLink(lead.phone, message.body) });
});

router.get("/realtor/messages", async (req, res): Promise<void> => {
  const rows = await db.select().from(realtorMessagesTable).where(eq(realtorMessagesTable.ownerUserId, uid(req))).orderBy(desc(realtorMessagesTable.createdAt)).limit(100);
  noStore(res);
  res.json(await messageDtos(rows));
});

/* --------------------------------------------------------------- appointments */

router.get("/realtor/appointments", async (req, res): Promise<void> => {
  const userId = uid(req);
  const rows = await db.select().from(realtorAppointmentsTable).where(eq(realtorAppointmentsTable.ownerUserId, userId)).orderBy(asc(realtorAppointmentsTable.startsAt));
  noStore(res);
  res.json(await appointmentDtos(rows, userId));
});

router.post("/realtor/appointments", async (req, res): Promise<void> => {
  const body = CreateRealtorAppointmentBody.safeParse(req.body);
  if (!body.success) return bad(res, "Görüş sahələrini yoxlayın");
  const userId = uid(req);
  const d = body.data;
  if (!(await refsOwned(userId, { agentId: d.agentId, listingId: d.listingId, leadId: d.leadId }))) return bad(res, "Lead, elan və ya agent tapılmadı");
  const startsAt = new Date(d.startsAt);
  const [row] = await db.insert(realtorAppointmentsTable).values({
    ownerUserId: userId, leadId: d.leadId ?? null, listingId: d.listingId ?? null, agentId: d.agentId ?? null, startsAt,
    durationMin: d.durationMin ?? 30, status: d.status ?? "planned", notes: d.notes?.trim() ?? "",
  }).returning();
  if (d.leadId) {
    await db.update(realtorLeadsTable).set({ status: "meeting", readyForMeeting: true, updatedAt: new Date() })
      .where(and(eq(realtorLeadsTable.id, d.leadId), notInArray(realtorLeadsTable.status, ["deal", "lost"])));
  }
  res.status(201).json((await appointmentDtos([row], userId))[0]);
});

router.patch("/realtor/appointments/:appointmentId", async (req, res): Promise<void> => {
  const params = UpdateRealtorAppointmentParams.safeParse(req.params);
  const body = UpdateRealtorAppointmentBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Appointment");
  if (!body.success) return bad(res, "Görüş sahələrini yoxlayın");
  const userId = uid(req);
  const d = body.data;
  if (!(await refsOwned(userId, { agentId: d.agentId, listingId: d.listingId, leadId: d.leadId }))) return bad(res, "Lead, elan və ya agent tapılmadı");
  const patch: Partial<typeof realtorAppointmentsTable.$inferInsert> = { updatedAt: new Date() };
  if (d.leadId !== undefined) patch.leadId = d.leadId;
  if (d.listingId !== undefined) patch.listingId = d.listingId;
  if (d.agentId !== undefined) patch.agentId = d.agentId;
  if (d.startsAt !== undefined) { patch.startsAt = new Date(d.startsAt); patch.reminderSentAt = null; }
  if (d.durationMin !== undefined) patch.durationMin = d.durationMin;
  if (d.status !== undefined) patch.status = d.status === "rescheduled" && d.startsAt ? "planned" : d.status;
  if (d.notes !== undefined) patch.notes = d.notes;
  const [row] = await db.update(realtorAppointmentsTable).set(patch).where(and(eq(realtorAppointmentsTable.id, params.data.appointmentId), eq(realtorAppointmentsTable.ownerUserId, userId))).returning();
  if (!row) return notFound(res, "Appointment");
  res.json((await appointmentDtos([row], userId))[0]);
});

router.delete("/realtor/appointments/:appointmentId", async (req, res): Promise<void> => {
  const params = DeleteRealtorAppointmentParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Appointment");
  const deleted = await db.delete(realtorAppointmentsTable).where(and(eq(realtorAppointmentsTable.id, params.data.appointmentId), eq(realtorAppointmentsTable.ownerUserId, uid(req)))).returning({ id: realtorAppointmentsTable.id });
  if (!deleted.length) return notFound(res, "Appointment");
  res.json({ success: true, message: "Appointment deleted" });
});

/* ------------------------------------------------------------------ passports */

async function onePassport(req: Request, id: string) {
  const row = await loadPassport(id, uid(req));
  return row ? (await passportDtos([row], publicOrigin(req)))[0] : null;
}

async function passportValues(userId: string, d: ReturnType<typeof CreatePropertyPassportBody.parse>) {
  const owned = await ownedMediaIds(userId, [...d.photoIds, d.realtor.photoMediaId, d.realtor.logoMediaId]);
  return {
    listingId: d.listingId ?? null, title: d.title.trim(), dealType: d.dealType, propertyKind: d.propertyKind, district: d.district.trim(),
    address: d.address.trim(), rooms: d.rooms ?? null, areaM2: d.areaM2 ?? null, price: d.price ?? null, currency: d.currency,
    listingUrls: d.listingUrls.filter((l) => /^https?:\/\//i.test(l.url)).map((l) => ({ portal: l.portal, url: l.url.trim() })),
    photoIds: keepOwned(d.photoIds, owned),
    realtor: {
      name: d.realtor.name.trim(), agency: d.realtor.agency.trim(), phone: d.realtor.phone.trim(), whatsapp: d.realtor.whatsapp.trim(),
      instagram: d.realtor.instagram.trim().replace(/^@/, ""),
      photoMediaId: d.realtor.photoMediaId && owned.has(d.realtor.photoMediaId) ? d.realtor.photoMediaId : null,
      logoMediaId: d.realtor.logoMediaId && owned.has(d.realtor.logoMediaId) ? d.realtor.logoMediaId : null,
    },
    ownerName: d.ownerName.trim(), ownerPhone: d.ownerPhone.trim(),
  };
}

router.get("/realtor/passports", async (req, res): Promise<void> => {
  const userId = uid(req);
  const rows = await db.select().from(propertyPassportsTable).where(eq(propertyPassportsTable.ownerUserId, userId)).orderBy(desc(propertyPassportsTable.updatedAt));
  noStore(res);
  res.json(await passportDtos(rows, publicOrigin(req)));
});

router.post("/realtor/passports", async (req, res): Promise<void> => {
  const body = CreatePropertyPassportBody.safeParse(req.body);
  if (!body.success) return bad(res, "Mənzil sahələrini yoxlayın");
  const userId = uid(req);
  if (!(await refsOwned(userId, { listingId: body.data.listingId }))) return bad(res, "Elan tapılmadı");
  const values = await passportValues(userId, body.data);
  let row: typeof propertyPassportsTable.$inferSelect | undefined;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    [row] = await db.insert(propertyPassportsTable).values({ ownerUserId: userId, publicId: newPublicId(), ...values }).onConflictDoNothing().returning();
  }
  if (!row) throw new Error("Could not allocate a passport id");
  res.status(201).json((await passportDtos([row], publicOrigin(req)))[0]);
});

router.get("/realtor/passports/:passportId", async (req, res): Promise<void> => {
  const params = GetPropertyPassportParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Passport");
  const dto = await onePassport(req, params.data.passportId);
  if (!dto) return notFound(res, "Passport");
  noStore(res);
  res.json(dto);
});

router.put("/realtor/passports/:passportId", async (req, res): Promise<void> => {
  const params = UpdatePropertyPassportParams.safeParse(req.params);
  const body = UpdatePropertyPassportBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Passport");
  if (!body.success) return bad(res, "Mənzil sahələrini yoxlayın");
  const userId = uid(req);
  if (!(await refsOwned(userId, { listingId: body.data.listingId }))) return bad(res, "Elan tapılmadı");
  const [row] = await db.update(propertyPassportsTable).set({ ...(await passportValues(userId, body.data)), updatedAt: new Date() })
    .where(and(eq(propertyPassportsTable.id, params.data.passportId), eq(propertyPassportsTable.ownerUserId, userId))).returning();
  if (!row) return notFound(res, "Passport");
  res.json((await passportDtos([row], publicOrigin(req)))[0]);
});

router.delete("/realtor/passports/:passportId", async (req, res): Promise<void> => {
  const params = DeletePropertyPassportParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Passport");
  const deleted = await db.delete(propertyPassportsTable).where(and(eq(propertyPassportsTable.id, params.data.passportId), eq(propertyPassportsTable.ownerUserId, uid(req)))).returning({ id: propertyPassportsTable.id });
  if (!deleted.length) return notFound(res, "Passport");
  res.json({ success: true, message: "Passport deleted" });
});

router.post("/realtor/passports/:passportId/status", async (req, res): Promise<void> => {
  const params = SetPropertyPassportStatusParams.safeParse(req.params);
  const body = SetPropertyPassportStatusBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Passport");
  if (!body.success) return bad(res);
  const userId = uid(req);
  const current = await loadPassport(params.data.passportId, userId);
  if (!current) return notFound(res, "Passport");
  const status = body.data.status;
  await db.update(propertyPassportsTable).set({
    status, updatedAt: new Date(),
    publishedAt: status === "published" ? current.publishedAt ?? new Date() : current.publishedAt,
    // Archiving closes outstanding confirmation links.
    ...(status === "archived" ? { ownerTokenHash: null } : {}),
  }).where(eq(propertyPassportsTable.id, current.id));
  if (status === "archived") await db.update(passportWorksTable).set({ contractorTokenHash: null }).where(eq(passportWorksTable.passportId, current.id));
  res.json(await onePassport(req, current.id));
});

async function workValues(userId: string, d: ReturnType<typeof CreatePassportWorkBody.parse>) {
  const owned = await ownedMediaIds(userId, [...d.beforePhotoIds, ...d.afterPhotoIds]);
  return {
    title: d.title.trim(), startDate: d.startDate || null, endDate: d.endDate || null, contractorName: d.contractorName.trim(),
    contractorPhone: d.contractorPhone.trim(), description: d.description.trim(), materials: d.materials.trim(),
    beforePhotoIds: keepOwned(d.beforePhotoIds, owned), afterPhotoIds: keepOwned(d.afterPhotoIds, owned),
  };
}

router.post("/realtor/passports/:passportId/works", async (req, res): Promise<void> => {
  const params = CreatePassportWorkParams.safeParse(req.params);
  const body = CreatePassportWorkBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Passport");
  if (!body.success) return bad(res, "İş sahələrini yoxlayın");
  const userId = uid(req);
  const passport = await loadPassport(params.data.passportId, userId);
  if (!passport) return notFound(res, "Passport");
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${passportWorksTable.position}) + 1, 0)::int` }).from(passportWorksTable).where(eq(passportWorksTable.passportId, passport.id));
  await db.insert(passportWorksTable).values({ passportId: passport.id, position: next, ...(await workValues(userId, body.data)) });
  await db.update(propertyPassportsTable).set({ updatedAt: new Date() }).where(eq(propertyPassportsTable.id, passport.id));
  res.status(201).json(await onePassport(req, passport.id));
});

router.put("/realtor/passports/:passportId/works/:workId", async (req, res): Promise<void> => {
  const params = UpdatePassportWorkParams.safeParse(req.params);
  const body = UpdatePassportWorkBody.safeParse(req.body);
  if (!params.success) return notFound(res, "Work");
  if (!body.success) return bad(res, "İş sahələrini yoxlayın");
  const userId = uid(req);
  const passport = await loadPassport(params.data.passportId, userId);
  if (!passport) return notFound(res, "Passport");
  const [work] = await db.select().from(passportWorksTable).where(and(eq(passportWorksTable.id, params.data.workId), eq(passportWorksTable.passportId, passport.id)));
  if (!work) return notFound(res, "Work");
  const values = await workValues(userId, body.data);
  // Confirmations apply to what was shown; edited content has to be confirmed again.
  const reset = workContentChanged(work, values) ? {
    contractorConfirmedAt: null, contractorConfirmedName: null, contractorNote: null,
    handoverStatus: "pending", ownerDecidedAt: null, ownerDecidedName: null, ownerNote: null,
  } : {};
  await db.update(passportWorksTable).set({ ...values, ...reset, updatedAt: new Date() }).where(eq(passportWorksTable.id, work.id));
  await db.update(propertyPassportsTable).set({ updatedAt: new Date() }).where(eq(propertyPassportsTable.id, passport.id));
  res.json(await onePassport(req, passport.id));
});

router.delete("/realtor/passports/:passportId/works/:workId", async (req, res): Promise<void> => {
  const params = DeletePassportWorkParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Work");
  const userId = uid(req);
  const passport = await loadPassport(params.data.passportId, userId);
  if (!passport) return notFound(res, "Passport");
  const deleted = await db.delete(passportWorksTable).where(and(eq(passportWorksTable.id, params.data.workId), eq(passportWorksTable.passportId, passport.id))).returning({ id: passportWorksTable.id });
  if (!deleted.length) return notFound(res, "Work");
  await db.update(propertyPassportsTable).set({ updatedAt: new Date() }).where(eq(propertyPassportsTable.id, passport.id));
  res.json(await onePassport(req, passport.id));
});

router.post("/realtor/passports/:passportId/works/:workId/contractor-link", async (req, res): Promise<void> => {
  const params = CreateContractorConfirmLinkParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Work");
  const passport = await loadPassport(params.data.passportId, uid(req));
  if (!passport || passport.status === "archived") return notFound(res, "Passport");
  const token = newToken();
  const updated = await db.update(passportWorksTable).set({ contractorTokenHash: hashToken(token) })
    .where(and(eq(passportWorksTable.id, params.data.workId), eq(passportWorksTable.passportId, passport.id))).returning({ id: passportWorksTable.id });
  if (!updated.length) return notFound(res, "Work");
  noStore(res);
  res.json({ url: `${publicOrigin(req)}/p/confirm/contractor/${token}` });
});

router.post("/realtor/passports/:passportId/owner-link", async (req, res): Promise<void> => {
  const params = CreateOwnerConfirmLinkParams.safeParse(req.params);
  if (!params.success) return notFound(res, "Passport");
  const passport = await loadPassport(params.data.passportId, uid(req));
  if (!passport || passport.status === "archived") return notFound(res, "Passport");
  const token = newToken();
  await db.update(propertyPassportsTable).set({ ownerTokenHash: hashToken(token) }).where(eq(propertyPassportsTable.id, passport.id));
  noStore(res);
  res.json({ url: `${publicOrigin(req)}/p/confirm/owner/${token}` });
});

/* ------------------------------------------------------------------- whatsapp */

async function whatsappDto(req: Request, userId: string) {
  const s = await getSettings(userId);
  const counts = await db.select({ status: realtorMessagesTable.status, count: sql<number>`count(*)::int` }).from(realtorMessagesTable)
    .where(eq(realtorMessagesTable.ownerUserId, userId)).groupBy(realtorMessagesTable.status);
  const c = (k: string) => counts.find((x) => x.status === k)?.count ?? 0;
  return {
    mode: s.mode as "manual" | "cloud_api", businessPhone: s.businessPhone, phoneNumberId: s.phoneNumberId, tokenSet: !!s.accessTokenEnc,
    cloudApiAvailable: cloudApiAvailable(), webhookUrl: `${publicOrigin(req)}/api/whatsapp/webhook`,
    autoReplyEnabled: s.autoReplyEnabled, greeting: s.greeting, followUpEnabled: s.followUpEnabled, followUpHours: s.followUpHours,
    followUpText: s.followUpText, reminderEnabled: s.reminderEnabled, reminderHoursBefore: s.reminderHoursBefore, reminderText: s.reminderText,
    workdayStartHour: s.workdayStartHour, workdayEndHour: s.workdayEndHour, followUpTemplate: s.followUpTemplate,
    reminderTemplate: s.reminderTemplate, templateLanguage: s.templateLanguage,
    stats: { sent: c("sent"), received: c("received"), failed: c("failed"), manual: c("manual") },
  };
}

router.get("/realtor/whatsapp", async (req, res): Promise<void> => { noStore(res); res.json(await whatsappDto(req, uid(req))); });

router.put("/realtor/whatsapp", async (req, res): Promise<void> => {
  const body = UpdateRealtorWhatsappBody.safeParse(req.body);
  if (!body.success) return bad(res, "WhatsApp ayarlarını yoxlayın");
  const userId = uid(req);
  const d = body.data;
  if (d.workdayEndHour <= d.workdayStartHour) return bad(res, "İş günü başladıqdan sonra bitməlidir");
  await getSettings(userId);
  const patch: Partial<typeof realtorWhatsappSettingsTable.$inferInsert> = {
    mode: d.mode, businessPhone: d.businessPhone.trim(), autoReplyEnabled: d.autoReplyEnabled, greeting: d.greeting.trim(),
    followUpEnabled: d.followUpEnabled, followUpHours: d.followUpHours, followUpText: d.followUpText.trim(), reminderEnabled: d.reminderEnabled,
    reminderHoursBefore: d.reminderHoursBefore, reminderText: d.reminderText.trim(), workdayStartHour: d.workdayStartHour, workdayEndHour: d.workdayEndHour,
    followUpTemplate: d.followUpTemplate.trim(), reminderTemplate: d.reminderTemplate.trim(), templateLanguage: d.templateLanguage.trim() || "az",
    updatedAt: new Date(),
  };
  if (d.phoneNumberId !== undefined) patch.phoneNumberId = d.phoneNumberId?.trim() || null;
  if (d.accessToken) {
    if (!cloudApiAvailable()) return bad(res, "WhatsApp Cloud API bu serverdə konfiqurasiya olunmayıb");
    patch.accessTokenEnc = encryptToken(d.accessToken.trim());
  }
  if (d.mode === "cloud_api" && !cloudApiAvailable()) return bad(res, "WhatsApp Cloud API bu serverdə konfiqurasiya olunmayıb");
  if (patch.phoneNumberId) {
    const [taken] = await db.select({ userId: realtorWhatsappSettingsTable.userId }).from(realtorWhatsappSettingsTable).where(eq(realtorWhatsappSettingsTable.phoneNumberId, patch.phoneNumberId));
    if (taken && taken.userId !== userId) { res.status(409).json({ error: "Bu WhatsApp nömrəsi başqa hesaba qoşulub" }); return; }
  }
  await db.update(realtorWhatsappSettingsTable).set(patch).where(eq(realtorWhatsappSettingsTable.userId, userId));
  res.json(await whatsappDto(req, userId));
});

/* --------------------------------------------------------------- notifications */

const notificationDto = (n: typeof realtorNotificationsTable.$inferSelect) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, read: !!n.readAt, createdAt: n.createdAt.toISOString() });

router.get("/realtor/notifications", async (req, res): Promise<void> => {
  const rows = await db.select().from(realtorNotificationsTable).where(eq(realtorNotificationsTable.ownerUserId, uid(req))).orderBy(desc(realtorNotificationsTable.createdAt)).limit(50);
  noStore(res);
  res.json(rows.map(notificationDto));
});

router.post("/realtor/notifications/read", async (req, res): Promise<void> => {
  await db.update(realtorNotificationsTable).set({ readAt: new Date() }).where(and(eq(realtorNotificationsTable.ownerUserId, uid(req)), isNull(realtorNotificationsTable.readAt)));
  res.json({ success: true, message: "Notifications read" });
});

/* -------------------------------------------------------------------- overview */

router.get("/realtor/overview", async (req, res): Promise<void> => {
  const userId = uid(req);
  const now = new Date();
  const today = bakuDayStart(now);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const since14 = bakuDayStart(new Date(now.getTime() - 13 * 86_400_000));
  const [profile, leads, appts, listings, passports, events, recentViews, notes] = await Promise.all([
    db.select({ id: realtorProfilesTable.userId }).from(realtorProfilesTable).where(eq(realtorProfilesTable.userId, userId)),
    db.select().from(realtorLeadsTable).where(eq(realtorLeadsTable.ownerUserId, userId)).orderBy(desc(realtorLeadsTable.createdAt)),
    db.select().from(realtorAppointmentsTable).where(eq(realtorAppointmentsTable.ownerUserId, userId)).orderBy(asc(realtorAppointmentsTable.startsAt)),
    db.select({ id: realtorListingsTable.id, status: realtorListingsTable.status }).from(realtorListingsTable).where(eq(realtorListingsTable.ownerUserId, userId)),
    db.select({ id: propertyPassportsTable.id, status: propertyPassportsTable.status, listingId: propertyPassportsTable.listingId }).from(propertyPassportsTable).where(eq(propertyPassportsTable.ownerUserId, userId)),
    db.select({ kind: realtorEventsTable.kind, passportId: realtorEventsTable.passportId, count: sql<number>`count(*)::int` }).from(realtorEventsTable)
      .where(eq(realtorEventsTable.ownerUserId, userId)).groupBy(realtorEventsTable.kind, realtorEventsTable.passportId),
    db.select({ day: sql<string>`to_char(${realtorEventsTable.createdAt} at time zone 'Asia/Baku', 'YYYY-MM-DD')`, count: sql<number>`count(*)::int` }).from(realtorEventsTable)
      .where(and(eq(realtorEventsTable.ownerUserId, userId), eq(realtorEventsTable.kind, "passport_view"), gte(realtorEventsTable.createdAt, since14)))
      .groupBy(sql`1`),
    db.select().from(realtorNotificationsTable).where(eq(realtorNotificationsTable.ownerUserId, userId)).orderBy(desc(realtorNotificationsTable.createdAt)).limit(8),
  ]);
  const [profileRow] = await db.select().from(realtorProfilesTable).where(eq(realtorProfilesTable.userId, userId));
  const [waRow] = await db.select().from(realtorWhatsappSettingsTable).where(eq(realtorWhatsappSettingsTable.userId, userId));
  const open = (s: string) => !["deal", "lost"].includes(s);
  const published = passports.filter((p) => p.status === "published");
  const certifiedListingIds = new Set(published.map((p) => p.listingId).filter(Boolean));
  const linkedPassportIds = new Set(passports.filter((p) => p.listingId).map((p) => p.id));
  const sum = (kind: string, filter?: (passportId: string | null) => boolean) => events.filter((e) => e.kind === kind && (!filter || filter(e.passportId))).reduce((s, e) => s + e.count, 0);
  const views = sum("passport_view");
  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since14.getTime() + i * 86_400_000 + 4 * 3_600_000).toISOString().slice(0, 10);
    return { key: d, count: recentViews.find((r) => r.day === d)?.count ?? 0 };
  });
  const due = leads.filter((l) => open(l.status) && ((l.nextActionAt && l.nextActionAt <= now) || (l.readyForMeeting && l.status !== "meeting"))).slice(0, 8);
  const upcomingRows = appts.filter((a) => a.status === "planned" && a.startsAt >= new Date(now.getTime() - 3_600_000)).slice(0, 6);
  noStore(res);
  res.json({
    profileExists: profile.length > 0,
    stats: {
      newLeadsToday: leads.filter((l) => l.createdAt >= today).length,
      waitingLeads: leads.filter((l) => l.status === "new" || l.status === "contacted").length,
      upcomingAppointments: appts.filter((a) => a.status === "planned" && a.startsAt >= now).length,
      activeListings: listings.filter((l) => l.status === "active").length,
      certifiedListings: listings.filter((l) => certifiedListingIds.has(l.id)).length,
      publishedPassports: published.length,
      qrScans: sum("qr_scan"),
      passportViews: views,
      whatsappClicks: sum("whatsapp_click"),
      brandImpressions: views + sum("share"),
      leads30d: leads.filter((l) => l.createdAt >= since30).length,
      appointments30d: appts.filter((a) => a.createdAt >= since30).length,
      passportListingViews: sum("passport_view", (id) => !!id && linkedPassportIds.has(id)),
      newLeads: leads.filter((l) => l.status === "new").length,
    },
    setup: {
      profileComplete: !!profileRow && !!profileRow.fullName && !!(profileRow.whatsapp || profileRow.phone) && !!profileRow.photoMediaId,
      listings: listings.length,
      leads: leads.length,
      passports: passports.filter((p) => p.status !== "archived").length,
      publishedPassports: published.length,
      appointments: appts.length,
      whatsappConnected: !!waRow && (isConnected(waRow) || (waRow.mode === "manual" && !!waRow.businessPhone)),
      whatsappMode: waRow?.mode ?? "none",
      passportViews: views,
      firstName: (profileRow?.fullName ?? "").split(" ")[0] ?? "",
    },
    todayLeads: await leadDtos(leads.filter((l) => l.createdAt >= today).slice(0, 8), userId),
    dueLeads: await leadDtos(due, userId),
    upcoming: await appointmentDtos(upcomingRows, userId),
    notifications: notes.map(notificationDto),
    funnel: ["new", "contacted", "interested", "meeting", "deal", "lost"].map((key) => ({ key, count: leads.filter((l) => l.status === key).length })),
    sources: ["whatsapp", "instagram", "facebook", "site", "phone", "other"].map((key) => ({ key, count: leads.filter((l) => l.source === key).length })).filter((s) => s.count > 0),
    daily,
  });
});

export default router;
