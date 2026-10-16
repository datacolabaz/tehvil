import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
} from "@workspace/db";
import { loadMediaMap, pickMedia, realtorMediaUrl } from "./realtorMedia";

export type PassportRow = typeof propertyPassportsTable.$inferSelect;
export type WorkRow = typeof passportWorksTable.$inferSelect;
export type ListingRow = typeof realtorListingsTable.$inferSelect;
export type LeadRow = typeof realtorLeadsTable.$inferSelect;
export type AppointmentRow = typeof realtorAppointmentsTable.$inferSelect;
export type MessageRow = typeof realtorMessagesTable.$inferSelect;
export type TrustLevel = "basic" | "contractor" | "handover";

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

const PUBLIC_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newPublicId(length = 8) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => PUBLIC_ID_ALPHABET[b % PUBLIC_ID_ALPHABET.length]).join("");
}

export function publicOrigin(req?: Request) {
  if (process.env.PUBLIC_APP_URL) return new URL(process.env.PUBLIC_APP_URL).origin;
  if (!req) return "https://tehvil.az";
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${host}`;
}

/** Baku has no daylight saving time: UTC+4 all year. */
export function bakuDayStart(now = new Date()) {
  const shifted = new Date(now.getTime() + 4 * 3_600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 4 * 3_600_000);
}

/** Azerbaijani numbers to international digits for wa.me and the Cloud API. */
export function normalizePhone(raw: string) {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("0")) d = `994${d.slice(1)}`;
  if (d.length === 9) d = `994${d}`;
  return d;
}
export const waLink = (phone: string, text: string) => {
  const digits = normalizePhone(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
};

/**
 * Level 3 (handover) — the homeowner accepted every work and each has "after" photos.
 * Level 2 (contractor) — the contractor confirmed every work.
 * Level 1 (basic) — data entered by the realtor or homeowner.
 */
export function trustLevel(works: Pick<WorkRow, "handoverStatus" | "afterPhotoIds" | "contractorConfirmedAt">[]): TrustLevel {
  if (!works.length) return "basic";
  if (works.every((w) => w.handoverStatus === "accepted" && w.afterPhotoIds.length > 0)) return "handover";
  if (works.every((w) => !!w.contractorConfirmedAt)) return "contractor";
  return "basic";
}

/** Content fields that a contractor or homeowner has confirmed; changing any resets confirmations. */
export function workContentChanged(before: WorkRow, after: { title: string; startDate: string | null; endDate: string | null; contractorName: string; description: string; materials: string; beforePhotoIds: string[]; afterPhotoIds: string[] }) {
  return before.title !== after.title
    || (before.startDate ?? null) !== (after.startDate ?? null)
    || (before.endDate ?? null) !== (after.endDate ?? null)
    || before.contractorName !== after.contractorName
    || before.description !== after.description
    || before.materials !== after.materials
    || JSON.stringify(before.beforePhotoIds) !== JSON.stringify(after.beforePhotoIds)
    || JSON.stringify(before.afterPhotoIds) !== JSON.stringify(after.afterPhotoIds);
}

/* ------------------------------------------------------------------ passports */

async function passportStats(passportIds: string[]) {
  const stats = new Map<string, { views: number; qrScans: number; whatsappClicks: number; shares: number; leads: number }>();
  for (const id of passportIds) stats.set(id, { views: 0, qrScans: 0, whatsappClicks: 0, shares: 0, leads: 0 });
  if (!passportIds.length) return stats;
  const rows = await db.select({ passportId: realtorEventsTable.passportId, kind: realtorEventsTable.kind, count: sql<number>`count(*)::int` })
    .from(realtorEventsTable)
    .where(inArray(realtorEventsTable.passportId, passportIds))
    .groupBy(realtorEventsTable.passportId, realtorEventsTable.kind);
  for (const r of rows) {
    const s = r.passportId ? stats.get(r.passportId) : undefined;
    if (!s) continue;
    if (r.kind === "passport_view") s.views = r.count;
    else if (r.kind === "qr_scan") s.qrScans = r.count;
    else if (r.kind === "whatsapp_click") s.whatsappClicks = r.count;
    else if (r.kind === "share") s.shares = r.count;
    else if (r.kind === "lead_form") s.leads = r.count;
  }
  return stats;
}

export async function loadWorks(passportIds: string[]) {
  if (!passportIds.length) return new Map<string, WorkRow[]>();
  const rows = await db.select().from(passportWorksTable)
    .where(inArray(passportWorksTable.passportId, passportIds))
    .orderBy(passportWorksTable.position, passportWorksTable.createdAt);
  const map = new Map<string, WorkRow[]>();
  for (const r of rows) map.set(r.passportId, [...(map.get(r.passportId) ?? []), r]);
  return map;
}

export async function passportDtos(rows: PassportRow[], origin: string) {
  const ids = rows.map((p) => p.id);
  const [worksMap, stats] = await Promise.all([loadWorks(ids), passportStats(ids)]);
  const mediaIds = rows.flatMap((p) => [
    ...p.photoIds, p.realtor.photoMediaId, p.realtor.logoMediaId,
    ...(worksMap.get(p.id) ?? []).flatMap((w) => [...w.beforePhotoIds, ...w.afterPhotoIds]),
  ]);
  const media = await loadMediaMap(mediaIds);
  return rows.map((p) => {
    const works = worksMap.get(p.id) ?? [];
    return {
      id: p.id,
      publicId: p.publicId,
      publicUrl: `${origin}/p/${p.publicId}`,
      listingId: p.listingId,
      title: p.title,
      dealType: p.dealType as "sale" | "rent",
      propertyKind: p.propertyKind as "apartment",
      district: p.district,
      address: p.address,
      rooms: p.rooms,
      areaM2: p.areaM2,
      price: p.price,
      currency: p.currency as "AZN" | "USD",
      listingUrls: p.listingUrls as { portal: "other"; url: string }[],
      photoIds: p.photoIds,
      photos: pickMedia(media, p.photoIds),
      realtor: {
        ...p.realtor,
        photoUrl: p.realtor.photoMediaId && media.has(p.realtor.photoMediaId) ? realtorMediaUrl(p.realtor.photoMediaId) : null,
        logoUrl: p.realtor.logoMediaId && media.has(p.realtor.logoMediaId) ? realtorMediaUrl(p.realtor.logoMediaId) : null,
      },
      status: p.status as "draft" | "published" | "archived",
      trustLevel: trustLevel(works),
      ownerName: p.ownerName,
      ownerPhone: p.ownerPhone,
      ownerLinkActive: !!p.ownerTokenHash,
      works: works.map((w) => ({
        id: w.id,
        position: w.position,
        title: w.title,
        startDate: w.startDate,
        endDate: w.endDate,
        contractorName: w.contractorName,
        contractorPhone: w.contractorPhone,
        description: w.description,
        materials: w.materials,
        beforePhotoIds: w.beforePhotoIds,
        afterPhotoIds: w.afterPhotoIds,
        beforePhotos: pickMedia(media, w.beforePhotoIds),
        afterPhotos: pickMedia(media, w.afterPhotoIds),
        contractorConfirmedAt: iso(w.contractorConfirmedAt),
        contractorConfirmedName: w.contractorConfirmedName,
        contractorNote: w.contractorNote,
        contractorLinkActive: !!w.contractorTokenHash,
        handoverStatus: w.handoverStatus as "pending" | "accepted" | "revision",
        ownerDecidedAt: iso(w.ownerDecidedAt),
        ownerDecidedName: w.ownerDecidedName,
        ownerNote: w.ownerNote,
      })),
      stats: stats.get(p.id)!,
      publishedAt: iso(p.publishedAt),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  });
}
export type PassportDto = Awaited<ReturnType<typeof passportDtos>>[number];

/** Buyer view: no phone numbers of contractors or owners, no internal ids of media owners. */
export function publicPassportDto(p: PassportDto) {
  return {
    publicId: p.publicId,
    publicUrl: p.publicUrl,
    title: p.title,
    dealType: p.dealType,
    propertyKind: p.propertyKind,
    district: p.district,
    address: p.address,
    rooms: p.rooms,
    areaM2: p.areaM2,
    price: p.price,
    currency: p.currency,
    listingUrls: p.listingUrls,
    photos: p.photos,
    realtor: { name: p.realtor.name, agency: p.realtor.agency, phone: p.realtor.phone, whatsapp: p.realtor.whatsapp, instagram: p.realtor.instagram, photoUrl: p.realtor.photoUrl, logoUrl: p.realtor.logoUrl },
    trustLevel: p.trustLevel,
    works: p.works.map(publicWorkDto),
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
  };
}
export function publicWorkDto(w: PassportDto["works"][number]) {
  return {
    id: w.id,
    title: w.title,
    startDate: w.startDate,
    endDate: w.endDate,
    contractorName: w.contractorName,
    description: w.description,
    materials: w.materials,
    beforePhotos: w.beforePhotos,
    afterPhotos: w.afterPhotos,
    contractorConfirmedAt: w.contractorConfirmedAt,
    handoverStatus: w.handoverStatus,
    ownerDecidedAt: w.ownerDecidedAt,
  };
}

export async function loadPassport(passportId: string, userId: string) {
  const [row] = await db.select().from(propertyPassportsTable)
    .where(and(eq(propertyPassportsTable.id, passportId), eq(propertyPassportsTable.ownerUserId, userId)));
  return row ?? null;
}

/* ------------------------------------------------------------------- listings */

export async function listingDtos(rows: ListingRow[], userId: string) {
  if (!rows.length) return [];
  const ids = rows.map((l) => l.id);
  const [agents, passports, leadCounts, media] = await Promise.all([
    db.select({ id: realtorAgentsTable.id, fullName: realtorAgentsTable.fullName }).from(realtorAgentsTable).where(eq(realtorAgentsTable.ownerUserId, userId)),
    db.select().from(propertyPassportsTable).where(and(eq(propertyPassportsTable.ownerUserId, userId), inArray(propertyPassportsTable.listingId, ids))).orderBy(desc(propertyPassportsTable.updatedAt)),
    db.select({ listingId: realtorLeadsTable.listingId, count: sql<number>`count(*)::int` }).from(realtorLeadsTable)
      .where(and(eq(realtorLeadsTable.ownerUserId, userId), inArray(realtorLeadsTable.listingId, ids))).groupBy(realtorLeadsTable.listingId),
    loadMediaMap(rows.flatMap((l) => l.photoIds)),
  ]);
  const agentName = new Map(agents.map((a) => [a.id, a.fullName]));
  // Prefer a published passport; otherwise the most recently edited draft.
  const passportByListing = new Map<string, PassportRow>();
  for (const p of passports) {
    if (!p.listingId || p.status === "archived") continue;
    const current = passportByListing.get(p.listingId);
    if (!current || (current.status !== "published" && p.status === "published")) passportByListing.set(p.listingId, p);
  }
  const passportIds = [...passportByListing.values()].map((p) => p.id);
  const [works, views] = await Promise.all([
    loadWorks(passportIds),
    passportIds.length ? db.select({ passportId: realtorEventsTable.passportId, count: sql<number>`count(*)::int` }).from(realtorEventsTable)
      .where(and(inArray(realtorEventsTable.passportId, passportIds), eq(realtorEventsTable.kind, "passport_view"))).groupBy(realtorEventsTable.passportId) : Promise.resolve([]),
  ]);
  const viewMap = new Map(views.map((v) => [v.passportId, v.count]));
  const leadMap = new Map(leadCounts.map((c) => [c.listingId, c.count]));
  return rows.map((l) => {
    const p = passportByListing.get(l.id);
    return {
      id: l.id,
      agentId: l.agentId,
      agentName: l.agentId ? agentName.get(l.agentId) ?? null : null,
      title: l.title,
      dealType: l.dealType as "sale" | "rent",
      propertyKind: l.propertyKind as "apartment",
      district: l.district,
      address: l.address,
      rooms: l.rooms,
      areaM2: l.areaM2,
      floor: l.floor,
      price: l.price,
      currency: l.currency as "AZN" | "USD",
      status: l.status as "active" | "pending" | "sold" | "archived",
      description: l.description,
      externalLinks: l.externalLinks as { portal: "other"; url: string }[],
      photoIds: l.photoIds,
      photos: pickMedia(media, l.photoIds),
      passportId: p?.id ?? null,
      passportPublicId: p?.publicId ?? null,
      passportStatus: p?.status ?? null,
      trustLevel: p ? trustLevel(works.get(p.id) ?? []) : null,
      views: p ? viewMap.get(p.id) ?? 0 : 0,
      leadCount: leadMap.get(l.id) ?? 0,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    };
  });
}

/* ---------------------------------------------------------------------- leads */

export async function leadDtos(rows: LeadRow[], userId: string) {
  if (!rows.length) return [];
  const listingIds = [...new Set(rows.map((l) => l.listingId).filter((v): v is string => !!v))];
  const [agents, listings] = await Promise.all([
    db.select({ id: realtorAgentsTable.id, fullName: realtorAgentsTable.fullName }).from(realtorAgentsTable).where(eq(realtorAgentsTable.ownerUserId, userId)),
    listingIds.length ? db.select({ id: realtorListingsTable.id, title: realtorListingsTable.title }).from(realtorListingsTable).where(inArray(realtorListingsTable.id, listingIds)) : Promise.resolve([]),
  ]);
  const agentName = new Map(agents.map((a) => [a.id, a.fullName]));
  const listingTitle = new Map(listings.map((l) => [l.id, l.title]));
  const now = Date.now();
  return rows.map((l) => ({
    id: l.id,
    agentId: l.agentId,
    agentName: l.agentId ? agentName.get(l.agentId) ?? null : null,
    listingId: l.listingId,
    listingTitle: l.listingId ? listingTitle.get(l.listingId) ?? null : null,
    fullName: l.fullName,
    phone: l.phone,
    source: l.source as "other",
    status: l.status as "new",
    dealType: l.dealType,
    district: l.district,
    rooms: l.rooms,
    budgetMin: l.budgetMin,
    budgetMax: l.budgetMax,
    timeframe: l.timeframe,
    notes: l.notes,
    nextAction: l.nextAction,
    nextActionAt: iso(l.nextActionAt),
    lastContactAt: iso(l.lastContactAt),
    readyForMeeting: l.readyForMeeting,
    botStep: l.botState?.step ?? null,
    overdue: !!l.nextActionAt && l.nextActionAt.getTime() < now && !["deal", "lost"].includes(l.status),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));
}

/** Simple, explainable scoring: deal type must match; district, rooms and budget add points. */
export function scoreListing(lead: Pick<LeadRow, "dealType" | "district" | "rooms" | "budgetMin" | "budgetMax">, l: ListingRow) {
  if (l.status !== "active") return -1;
  if (lead.dealType && l.dealType !== lead.dealType) return -1;
  let score = 1;
  const district = lead.district.trim().toLocaleLowerCase("az");
  if (district && l.district.toLocaleLowerCase("az").includes(district.slice(0, 5))) score += 3;
  if (lead.rooms != null && l.rooms != null) score += lead.rooms === l.rooms ? 2 : Math.abs(lead.rooms - l.rooms) === 1 ? 1 : 0;
  if (l.price != null) {
    const max = lead.budgetMax ?? null;
    const min = lead.budgetMin ?? null;
    if (max != null && l.price > max * 1.1) return -1;
    if (max != null && l.price <= max) score += 2;
    if (min != null && l.price < min * 0.7) score -= 1;
  }
  return score;
}

export async function matchListings(lead: LeadRow, userId: string, limit = 5) {
  const listings = await db.select().from(realtorListingsTable)
    .where(and(eq(realtorListingsTable.ownerUserId, userId), eq(realtorListingsTable.status, "active")));
  return listings.map((l) => ({ l, s: scoreListing(lead, l) })).filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || b.l.updatedAt.getTime() - a.l.updatedAt.getTime()).slice(0, limit).map((x) => x.l);
}

/* --------------------------------------------------------------- appointments */

export async function appointmentDtos(rows: AppointmentRow[], userId: string) {
  if (!rows.length) return [];
  const leadIds = [...new Set(rows.map((a) => a.leadId).filter((v): v is string => !!v))];
  const listingIds = [...new Set(rows.map((a) => a.listingId).filter((v): v is string => !!v))];
  const [leads, listings, agents] = await Promise.all([
    leadIds.length ? db.select({ id: realtorLeadsTable.id, fullName: realtorLeadsTable.fullName, phone: realtorLeadsTable.phone }).from(realtorLeadsTable).where(inArray(realtorLeadsTable.id, leadIds)) : Promise.resolve([]),
    listingIds.length ? db.select({ id: realtorListingsTable.id, title: realtorListingsTable.title, address: realtorListingsTable.address, district: realtorListingsTable.district }).from(realtorListingsTable).where(inArray(realtorListingsTable.id, listingIds)) : Promise.resolve([]),
    db.select({ id: realtorAgentsTable.id, fullName: realtorAgentsTable.fullName }).from(realtorAgentsTable).where(eq(realtorAgentsTable.ownerUserId, userId)),
  ]);
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const listingMap = new Map(listings.map((l) => [l.id, l]));
  const agentMap = new Map(agents.map((a) => [a.id, a.fullName]));
  return rows.map((a) => {
    const lead = a.leadId ? leadMap.get(a.leadId) : undefined;
    const listing = a.listingId ? listingMap.get(a.listingId) : undefined;
    return {
      id: a.id,
      leadId: a.leadId,
      leadName: lead?.fullName ?? null,
      leadPhone: lead?.phone ?? null,
      listingId: a.listingId,
      listingTitle: listing?.title ?? null,
      listingAddress: listing ? [listing.district, listing.address].filter(Boolean).join(", ") : null,
      agentId: a.agentId,
      agentName: a.agentId ? agentMap.get(a.agentId) ?? null : null,
      startsAt: a.startsAt.toISOString(),
      durationMin: a.durationMin,
      status: a.status as "planned",
      notes: a.notes,
      reminderSentAt: iso(a.reminderSentAt),
      createdAt: a.createdAt.toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ messages */

export async function messageDtos(rows: MessageRow[]) {
  const leadIds = [...new Set(rows.map((m) => m.leadId).filter((v): v is string => !!v))];
  const leads = leadIds.length ? await db.select({ id: realtorLeadsTable.id, fullName: realtorLeadsTable.fullName }).from(realtorLeadsTable).where(inArray(realtorLeadsTable.id, leadIds)) : [];
  const names = new Map(leads.map((l) => [l.id, l.fullName]));
  return rows.map((m) => ({
    id: m.id,
    leadId: m.leadId,
    leadName: m.leadId ? names.get(m.leadId) ?? null : null,
    direction: m.direction as "in" | "out",
    kind: m.kind,
    body: m.body,
    status: m.status as "sent",
    error: m.error,
    createdAt: m.createdAt.toISOString(),
  }));
}

/* ------------------------------------------------------------- notifications */

export async function notify(ownerUserId: string, n: { kind: string; title: string; body?: string; href?: string }) {
  await db.insert(realtorNotificationsTable).values({ ownerUserId, kind: n.kind, title: n.title, body: n.body ?? "", href: n.href ?? "" });
}

export async function realtorDisplayName(userId: string) {
  const [p] = await db.select({ fullName: realtorProfilesTable.fullName, agency: realtorProfilesTable.agency }).from(realtorProfilesTable).where(eq(realtorProfilesTable.userId, userId));
  return p ?? null;
}

export const DEAL_LABEL: Record<string, string> = { sale: "Satış", rent: "İcarə" };
export const KIND_LABEL: Record<string, string> = { apartment: "Mənzil", villa: "Villa", office: "Ofis", country_house: "Bağ evi", other: "Obyekt" };
export function priceText(price: number | null, currency: string) {
  if (price == null) return "Qiymət razılaşma ilə";
  return `${new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 0 }).format(price)} ${currency}`;
}
