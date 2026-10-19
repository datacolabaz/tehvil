import { getAuth } from "@clerk/express";
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateConstructionEstimateBody, CreateValuationBody, DeleteConstructionEstimateParams, GetConstructionEstimateParams, GetValuationParams,
  ReadListingLinkBody, ReadListingTextBody, UpdateConstructionEstimateBody, UpdateConstructionEstimateParams,
} from "@workspace/api-zod";
import { constructionEstimatesTable, db, listingSnapshotsTable, valuationsTable, type ListingSnapshotRow } from "@workspace/db";
import { rateLimit } from "../lib/rateLimit";
import { ImportError, portalFor } from "../lib/realtorImport";
import { DEFAULT_USD_RATE, POOL_DAYS, computeValuation, factsFromText, foundLabels, readListingPage, urlHash, type Comp } from "../lib/valuation";
import { bad, notFound, noStore } from "./homes";

const router: IRouter = Router();

// The market-value service was withdrawn on 20.10.2026: nothing new is read or calculated; stored rows stay untouched.
const withdrawn = (_req: Request, res: Response) => { res.status(410).json({ error: "Bazar dəyəri xidməti dayandırılıb." }); };
router.post(["/valuation/read-link", "/valuation/read-text", "/valuations"], withdrawn);
const uid = (req: Request) => getAuth(req).userId!;
const readLimit = rateLimit({ windowMs: 3_600_000, max: 60, key: (req) => `vl:${getAuth(req).userId ?? req.ip}` });

const listingDto = (r: ListingSnapshotRow) => ({
  id: r.id, url: r.url, portal: r.portal, source: r.source, city: r.city, district: r.district, areaM2: r.areaM2, rooms: r.rooms, floor: r.floor, floorsTotal: r.floorsTotal,
  buildingType: r.buildingType, renovation: r.renovation, furnished: r.furnished, price: r.price, currency: r.currency, priceAzn: r.priceAzn, title: r.title, fetchedAt: r.fetchedAt.toISOString(),
});
const toComp = (r: ListingSnapshotRow, userAdded: boolean): Comp => ({
  id: r.id, url: r.url, city: r.city, district: r.district, areaM2: r.areaM2, rooms: r.rooms, floor: r.floor, floorsTotal: r.floorsTotal,
  buildingType: r.buildingType, renovation: r.renovation, furnished: r.furnished, priceAzn: r.priceAzn, fetchedAt: r.fetchedAt, userAdded, copied: r.source === "copied",
});

router.post("/valuation/read-link", readLimit, async (req, res): Promise<void> => {
  const body = ReadListingLinkBody.safeParse(req.body);
  if (!body.success) return bad(res, "Link düzgün deyil");
  try {
    const { url, portal, facts } = await readListingPage(body.data.url);
    const found = foundLabels(facts);
    // The page reading is kept as a draft; it becomes part of a calculation only when the person confirms it.
    const [snap] = await db.insert(listingSnapshotsTable).values({
      url, urlHash: urlHash(url), portal, source: "link", dealType: facts.dealType ?? "sale", city: facts.city ?? "", district: facts.district ?? "",
      areaM2: facts.areaM2, rooms: facts.rooms, floor: facts.floor, floorsTotal: facts.floorsTotal, buildingType: facts.buildingType, renovation: facts.renovation,
      furnished: facts.furnished, price: facts.price, currency: facts.currency, title: (facts.title ?? "").slice(0, 300), description: (facts.description ?? "").slice(0, 4000),
      parsed: facts as unknown as Record<string, unknown>, inPool: false, createdByUserId: uid(req),
    }).returning();
    const warnings = found.length ? [] : ["Səhifədən məlumat oxunmadı — elanın mətnini yapışdırın və ya sahələri əl ilə doldurun."];
    if (!facts.price) warnings.push("Elan qiyməti tapılmadı.");
    if (!facts.areaM2) warnings.push("Sahə tapılmadı — hesablama üçün mütləqdir.");
    res.json({ snapshotId: snap.id, source: "link", url, portal, fields: facts, found, warnings });
  } catch (err) {
    if (err instanceof ImportError) return bad(res, err.message);
    req.log.warn({ err: err instanceof Error ? err.message : err }, "valuation.read_link_failed");
    bad(res, "Səhifəni açmaq mümkün olmadı. Elanın mətnini yapışdırın və ya məlumatları əl ilə daxil edin.");
  }
});

router.post("/valuation/read-text", async (req, res): Promise<void> => {
  const body = ReadListingTextBody.safeParse(req.body);
  if (!body.success) return bad(res, "Mətn çox qısadır");
  const facts = { ...factsFromText(body.data.text), title: body.data.text.trim().split(/\n/)[0].slice(0, 300) || null, description: body.data.text.slice(0, 4000) };
  const found = foundLabels(facts);
  res.json({ snapshotId: null, source: "text", url: null, portal: null, fields: facts, found, warnings: found.length ? [] : ["Mətndən məlumat oxunmadı — sahələri əl ilə doldurun."] });
});

type Input = NonNullable<ReturnType<typeof CreateValuationBody.safeParse>["data"]>["subject"];

/** Stores what the person confirmed. A page read by the server joins the shared pool only if price and area were not changed. */
async function confirmListing(userId: string, input: Input, usdRate: number) {
  const priceAzn = input.price ? Math.round((input.currency === "USD" ? input.price * usdRate : input.price) * 100) / 100 : null;
  const values = {
    url: input.url ?? null, urlHash: input.url ? urlHash(input.url) : null, source: input.source, dealType: input.dealType ?? "sale", city: input.city.trim(), district: (input.district ?? "").trim(),
    areaM2: input.areaM2, rooms: input.rooms ?? null, floor: input.floor ?? null, floorsTotal: input.floorsTotal ?? null, buildingType: input.buildingType ?? "unknown",
    renovation: input.renovation ?? "unknown", furnished: input.furnished ?? "unknown", price: input.price ?? null, currency: input.price ? input.currency ?? "AZN" : null, priceAzn,
    title: (input.title ?? "").slice(0, 300), description: (input.description ?? "").slice(0, 4000),
  };
  if (input.snapshotId) {
    const [draft] = await db.select().from(listingSnapshotsTable).where(and(eq(listingSnapshotsTable.id, input.snapshotId), eq(listingSnapshotsTable.createdByUserId, userId)));
    if (draft && draft.source === "link") {
      const p = (draft.parsed ?? {}) as { price?: number | null; areaM2?: number | null; city?: string | null };
      const unchanged = p.price != null && p.areaM2 != null && Number(p.price) === Number(input.price) && Number(p.areaM2) === Number(input.areaM2);
      const [row] = await db.update(listingSnapshotsTable).set({ ...values, url: draft.url, urlHash: draft.urlHash, portal: draft.portal, source: "link", inPool: unchanged && values.dealType === "sale" && !!values.city && !!priceAzn })
        .where(eq(listingSnapshotsTable.id, draft.id)).returning();
      return row;
    }
  }
  // Text the person copied from a portal page they opened themselves (the portal refused the server).
  // It joins the shared pool under guards: a supported portal link, one pool entry per advert,
  // plausible price and area, and a daily cap per person. It is always labelled as copied.
  const portalUrl = input.source === "text" && input.url ? supportedUrl(input.url) : null;
  if (portalUrl) {
    const inPool = values.dealType === "sale" && !!values.city && plausible(priceAzn, values.areaM2) && await copiedPoolSlot(userId, portalUrl.hash);
    const [row] = await db.insert(listingSnapshotsTable).values({ ...values, url: portalUrl.url, urlHash: portalUrl.hash, portal: portalUrl.portal, source: "copied", inPool, createdByUserId: userId }).returning();
    return row;
  }
  const [row] = await db.insert(listingSnapshotsTable).values({ ...values, source: input.source === "link" ? "manual" : input.source, inPool: false, createdByUserId: userId }).returning();
  return row;
}

export const COPIED_DAILY_CAP = 30;
function supportedUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    const portal = portalFor(u);
    const hash = urlHash(u.toString());
    return portal && hash ? { url: u.toString(), portal, hash } : null;
  } catch { return null; }
}
/** Asking price per m² and area within what Azerbaijani housing adverts actually show. */
const plausible = (priceAzn: number | null, area: number | null | undefined) =>
  !!priceAzn && !!area && area >= 10 && area <= 2000 && priceAzn / area >= 100 && priceAzn / area <= 20000;
async function copiedPoolSlot(userId: string, hash: string) {
  const since = new Date(Date.now() - POOL_DAYS * 86_400_000);
  const [dup] = await db.select({ id: listingSnapshotsTable.id }).from(listingSnapshotsTable)
    .where(and(eq(listingSnapshotsTable.urlHash, hash), eq(listingSnapshotsTable.inPool, true), gt(listingSnapshotsTable.fetchedAt, since))).limit(1);
  if (dup) return false;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(listingSnapshotsTable)
    .where(and(eq(listingSnapshotsTable.createdByUserId, userId), eq(listingSnapshotsTable.source, "copied"), eq(listingSnapshotsTable.inPool, true), gt(listingSnapshotsTable.createdAt, new Date(Date.now() - 86_400_000))));
  return n < COPIED_DAILY_CAP;
}

router.post("/valuations", async (req, res): Promise<void> => {
  const body = CreateValuationBody.safeParse(req.body);
  if (!body.success) return bad(res, "Əmlakın məlumatlarını yoxlayın (sahə mütləqdir)");
  const userId = uid(req);
  const usdRate = body.data.usdRate && body.data.usdRate > 0.5 && body.data.usdRate < 5 ? body.data.usdRate : DEFAULT_USD_RATE;
  if (!(body.data.subject.areaM2 > 0)) return bad(res, "Sahəni daxil edin");
  const subject = await confirmListing(userId, body.data.subject, usdRate);
  const added: ListingSnapshotRow[] = [];
  for (const c of body.data.comparables ?? []) added.push(await confirmListing(userId, c, usdRate));
  const since = new Date(Date.now() - POOL_DAYS * 86_400_000);
  const pool = body.data.usePool === false ? [] : (await db.select().from(listingSnapshotsTable).where(and(
    eq(listingSnapshotsTable.inPool, true), gt(listingSnapshotsTable.fetchedAt, since), ne(listingSnapshotsTable.id, subject.id),
    sql`lower(${listingSnapshotsTable.city}) = lower(${subject.city})`,
  )).orderBy(desc(listingSnapshotsTable.fetchedAt)).limit(500));
  // One entry per advert (latest reading); the subject's own advert is never its own comparable.
  const byUrl = new Map<string, ListingSnapshotRow>();
  for (const r of pool) { const k = r.urlHash ?? r.id; if (!byUrl.has(k) && (!subject.urlHash || r.urlHash !== subject.urlHash)) byUrl.set(k, r); }
  const addedIds = new Set(added.map((a) => a.id));
  const candidates = [...added.map((r) => toComp(r, true)), ...[...byUrl.values()].filter((r) => !addedIds.has(r.id) && !added.some((a) => a.urlHash && a.urlHash === r.urlHash)).map((r) => toComp(r, false))];
  const out = computeValuation({ ...toComp(subject, false), price: subject.price, currency: subject.currency }, candidates, usdRate, byUrl.size);
  const result = {
    status: out.status, confidence: out.confidence, confidenceReasons: out.confidenceReasons, estimate: out.estimate, factors: out.factors, missing: out.missing, assumptions: out.assumptions,
    askingNote: out.askingNote, poolSize: byUrl.size,
    comparables: out.comps.map((x) => ({ id: x.c.id, score: x.score, pricePerM2: x.ppm2 ? Math.round(x.ppm2) : null, used: x.used, userAdded: x.c.userAdded, notes: x.notes })),
  };
  const [v] = await db.insert(valuationsTable).values({ ownerUserId: userId, subjectId: subject.id, compIds: candidates.map((c) => c.id), usdRate, result }).returning();
  res.status(201).json(await valuationDto(v));
});

async function valuationDto(v: typeof valuationsTable.$inferSelect) {
  const r = v.result as Record<string, unknown> & { comparables: { id: string; score: number; pricePerM2: number | null; used: boolean; userAdded: boolean; notes: string[] }[] };
  const ids = [v.subjectId, ...r.comparables.map((c) => c.id)];
  const rows = await db.select().from(listingSnapshotsTable).where(inArray(listingSnapshotsTable.id, ids));
  const get = (id: string) => rows.find((x) => x.id === id)!;
  return {
    id: v.id, createdAt: v.createdAt.toISOString(), usdRate: v.usdRate, subject: listingDto(get(v.subjectId)),
    status: r.status, confidence: r.confidence, confidenceReasons: r.confidenceReasons, estimate: r.estimate ?? null, factors: r.factors, missing: r.missing, assumptions: r.assumptions,
    askingNote: r.askingNote ?? null, poolSize: r.poolSize ?? 0,
    // Who linked a pool listing is never shown; only the advert's own facts and link.
    comparables: r.comparables.filter((c) => rows.some((x) => x.id === c.id)).map((c) => ({ listing: listingDto(get(c.id)), score: c.score, pricePerM2: c.pricePerM2, used: c.used, userAdded: c.userAdded, notes: c.notes })),
  };
}

router.get("/valuations", async (req, res): Promise<void> => {
  noStore(res);
  const list = await db.select({ v: valuationsTable, s: listingSnapshotsTable }).from(valuationsTable).innerJoin(listingSnapshotsTable, eq(listingSnapshotsTable.id, valuationsTable.subjectId))
    .where(eq(valuationsTable.ownerUserId, uid(req))).orderBy(desc(valuationsTable.createdAt)).limit(100);
  res.json(list.map(({ v, s }) => {
    const r = v.result as { status: string; confidence: string; estimate?: { central: number } | null };
    return { id: v.id, createdAt: v.createdAt.toISOString(), title: s.title || [s.rooms ? `${s.rooms} otaqlı` : "", s.areaM2 ? `${s.areaM2} m²` : ""].filter(Boolean).join(", "), city: s.city, district: s.district, areaM2: s.areaM2, central: r.estimate?.central ?? null, confidence: r.confidence, status: r.status };
  }));
});

router.get("/valuations/:valuationId", async (req, res): Promise<void> => {
  noStore(res);
  const p = GetValuationParams.safeParse(req.params);
  if (!p.success) return notFound(res);
  const [v] = await db.select().from(valuationsTable).where(and(eq(valuationsTable.id, p.data.valuationId), eq(valuationsTable.ownerUserId, uid(req))));
  if (!v) return notFound(res, "Hesablama tapılmadı");
  res.json(await valuationDto(v));
});

/* --------------------------------------------------- construction estimates */

const MAX_DATA = 400_000;
const ceDto = (r: typeof constructionEstimatesTable.$inferSelect) => ({ id: r.id, name: r.name, data: r.data, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
const sizeOk = (data: unknown) => JSON.stringify(data ?? null).length <= MAX_DATA && !!data && typeof data === "object" && !Array.isArray(data);

router.get("/construction-estimates", async (req, res): Promise<void> => {
  noStore(res);
  const rows = await db.select().from(constructionEstimatesTable).where(eq(constructionEstimatesTable.ownerUserId, uid(req))).orderBy(desc(constructionEstimatesTable.updatedAt)).limit(100);
  res.json(rows.map((r) => { const d = r.data as { summary?: { total?: number | null; unpriced?: number | null } }; return { id: r.id, name: r.name, updatedAt: r.updatedAt.toISOString(), total: d.summary?.total ?? null, unpriced: d.summary?.unpriced ?? null }; }));
});

router.post("/construction-estimates", async (req, res): Promise<void> => {
  const body = CreateConstructionEstimateBody.safeParse(req.body);
  if (!body.success || !sizeOk(body.data.data)) return bad(res, "Smeta məlumatları düzgün deyil və ya çox böyükdür");
  const [row] = await db.insert(constructionEstimatesTable).values({ ownerUserId: uid(req), name: body.data.name.trim(), data: body.data.data as Record<string, unknown> }).returning();
  res.status(201).json(ceDto(row));
});

async function ownEstimate(req: Request, id: string) {
  const [row] = await db.select().from(constructionEstimatesTable).where(and(eq(constructionEstimatesTable.id, id), eq(constructionEstimatesTable.ownerUserId, uid(req))));
  return row ?? null;
}

router.get("/construction-estimates/:estimateId", async (req, res): Promise<void> => {
  noStore(res);
  const p = GetConstructionEstimateParams.safeParse(req.params);
  const row = p.success ? await ownEstimate(req, p.data.estimateId) : null;
  if (!row) return notFound(res, "Smeta tapılmadı");
  res.json(ceDto(row));
});

router.put("/construction-estimates/:estimateId", async (req, res): Promise<void> => {
  const p = UpdateConstructionEstimateParams.safeParse(req.params);
  const body = UpdateConstructionEstimateBody.safeParse(req.body);
  const row = p.success ? await ownEstimate(req, p.data.estimateId) : null;
  if (!row) return notFound(res, "Smeta tapılmadı");
  if (!body.success || !sizeOk(body.data.data)) return bad(res, "Smeta məlumatları düzgün deyil və ya çox böyükdür");
  const [saved] = await db.update(constructionEstimatesTable).set({ name: body.data.name.trim(), data: body.data.data as Record<string, unknown>, updatedAt: new Date() }).where(eq(constructionEstimatesTable.id, row.id)).returning();
  res.json(ceDto(saved));
});

router.delete("/construction-estimates/:estimateId", async (req, res): Promise<void> => {
  const p = DeleteConstructionEstimateParams.safeParse(req.params);
  const row = p.success ? await ownEstimate(req, p.data.estimateId) : null;
  if (!row) return notFound(res, "Smeta tapılmadı");
  await db.delete(constructionEstimatesTable).where(eq(constructionEstimatesTable.id, row.id));
  res.json({ success: true });
});


export default router;
