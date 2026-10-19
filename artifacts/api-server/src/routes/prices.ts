import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { AddPriceQuoteBody, CreateRepairEstimateBody, ImportPricesBody, UpdateRepairEstimateBody } from "@workspace/api-zod";
import { db, priceQuotesTable, repairEstimatesTable } from "@workspace/db";
import { ITEM_BY_CODE, PRELIM_DATE, PRELIM_SOURCE, PRICE_ITEMS, SOURCE_KINDS, STALE_DAYS, TIERS, aggregate, type QuoteLike } from "../lib/prices";
import { bad, notFound, noStore } from "./homes";

/** Public: the price base itself is open, so anyone can see where an estimate's numbers come from. */
export const pricesPublicRouter: IRouter = Router();
const router: IRouter = Router();

const admins = () => (process.env.PRICE_ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const adminEmails = () => (process.env.PRICE_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const emailCache = new Map<string, { at: number; emails: string[] }>();
/** Administrators are listed by Clerk user id (PRICE_ADMIN_USER_IDS) or verified e-mail (PRICE_ADMIN_EMAILS). */
async function isAdmin(req: Request) {
  const id = getAuth(req).userId;
  if (!id) return false;
  if (admins().includes(id)) return true;
  const wanted = adminEmails();
  if (!wanted.length) return false;
  let hit = emailCache.get(id);
  if (!hit || Date.now() - hit.at > 600_000) {
    try {
      const u = await clerkClient.users.getUser(id);
      hit = { at: Date.now(), emails: u.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress.toLowerCase()) };
    } catch { hit = { at: Date.now(), emails: [] }; }
    emailCache.set(id, hit);
  }
  return hit.emails.some((e) => wanted.includes(e));
}
const uid = (req: Request) => getAuth(req).userId!;

let seeded: Promise<void> | null = null;
/** Loads the preliminary table once (as "preliminary" quotes); never touches checked prices. */
function ensureSeeded() {
  seeded ??= (async () => {
    const have = await db.select({ code: priceQuotesTable.itemCode }).from(priceQuotesTable).where(eq(priceQuotesTable.sourceKind, "preliminary"));
    const done = new Set(have.map((r) => r.code));
    const rows = PRICE_ITEMS.filter((i) => i.prelim != null && !done.has(i.code)).map((i) => ({
      itemCode: i.code, tier: "standart", price: i.prelim!, sourceKind: "preliminary", sourceName: PRELIM_SOURCE, observedAt: PRELIM_DATE, createdByUserId: "system",
    }));
    if (rows.length) await db.insert(priceQuotesTable).values(rows);
  })().catch((err) => { seeded = null; throw err; });
  return seeded;
}

async function priceBase(req: Request) {
  await ensureSeeded();
  const rows = await db.select().from(priceQuotesTable).where(eq(priceQuotesTable.active, true)).orderBy(desc(priceQuotesTable.observedAt));
  const byItem = new Map<string, QuoteLike[]>();
  for (const r of rows) {
    const list = byItem.get(r.itemCode) ?? [];
    list.push({ id: r.id, tier: r.tier, price: r.price, sourceKind: r.sourceKind, sourceName: r.sourceName, sourceUrl: r.sourceUrl, observedAt: r.observedAt, note: r.note });
    byItem.set(r.itemCode, list);
  }
  const items = PRICE_ITEMS.map(({ prelim: _p, ...i }) => {
    const quotes = byItem.get(i.code) ?? [];
    return { ...i, tiers: { ekonom: aggregate(quotes, "ekonom"), standart: aggregate(quotes, "standart"), premium: aggregate(quotes, "premium") } };
  });
  return { items, generatedAt: new Date().toISOString(), staleDays: STALE_DAYS, admin: await isAdmin(req) };
}

pricesPublicRouter.get("/prices", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-cache");
  res.json(await priceBase(req));
});

const adminOnly = async (req: Request, res: Response) => {
  if (await isAdmin(req)) return true;
  res.status(403).json({ error: "Qiymətləri yalnız qiymət administratoru dəyişə bilər" });
  return false;
};

const urlOk = (u: string | null | undefined) => !u || /^https?:\/\/[^\s]+$/i.test(u);
const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && Date.parse(d) <= Date.now() + 86_400_000;

router.post("/prices/quotes", async (req, res): Promise<void> => {
  if (!(await adminOnly(req, res))) return;
  const b = AddPriceQuoteBody.safeParse(req.body);
  if (!b.success) return bad(res, "Qiymət məlumatlarını yoxlayın");
  const d = b.data;
  if (!ITEM_BY_CODE.has(d.itemCode)) return bad(res, "Belə qiymət maddəsi yoxdur");
  if (!(d.price > 0) || d.price > 1_000_000) return bad(res, "Qiymət müsbət olmalıdır");
  if (!urlOk(d.sourceUrl)) return bad(res, "Mənbə linki http(s) ilə başlamalıdır");
  if (!dateOk(d.observedAt)) return bad(res, "Tarix düzgün deyil");
  await db.insert(priceQuotesTable).values({ itemCode: d.itemCode, tier: d.tier, price: Math.round(d.price * 100) / 100, sourceKind: d.sourceKind, sourceName: d.sourceName.trim(), sourceUrl: d.sourceUrl || null, observedAt: d.observedAt, note: d.note ?? "", createdByUserId: uid(req) });
  res.status(201).json({ success: true });
});

router.delete("/prices/quotes/:quoteId", async (req, res): Promise<void> => {
  if (!(await adminOnly(req, res))) return;
  const id = String(req.params.quoteId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound(res);
  const [row] = await db.update(priceQuotesTable).set({ active: false }).where(eq(priceQuotesTable.id, id)).returning();
  if (!row) return notFound(res, "Qiymət tapılmadı");
  res.json({ success: true });
});

/** One quote per line: kod;səviyyə;qiymət;mənbə növü;mənbə adı;link;tarix;qeyd — comma, semicolon or tab separated. */
export function parsePriceCsv(csv: string) {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: { itemCode: string; tier: string; price: number; sourceKind: string; sourceName: string; sourceUrl: string | null; observedAt: string; note: string }[] = [];
  const errors: string[] = [];
  const sep = (l: string) => (l.includes("\t") ? "\t" : l.includes(";") ? ";" : ",");
  lines.forEach((line, i) => {
    const cells = line.split(sep(line)).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    if (i === 0 && /^(kod|code)$/i.test(cells[0])) return;
    const [itemCode, tier = "any", priceRaw = "", sourceKind = "", sourceName = "", sourceUrl = "", observedAt = "", note = ""] = cells;
    const n = i + 1;
    const price = Number(priceRaw.replace(/\s/g, "").replace(",", "."));
    if (!itemCode) return;
    if (!ITEM_BY_CODE.has(itemCode)) return void errors.push(`Sətir ${n}: “${itemCode}” maddəsi yoxdur`);
    if (!(TIERS as readonly string[]).includes(tier)) return void errors.push(`Sətir ${n}: səviyyə ekonom, standart, premium və ya any olmalıdır`);
    if (!(price > 0) || price > 1_000_000) return void errors.push(`Sətir ${n}: qiymət düzgün deyil`);
    if (!(SOURCE_KINDS as readonly string[]).includes(sourceKind) || sourceKind === "preliminary") return void errors.push(`Sətir ${n}: mənbə növü supplier, contractor və ya published olmalıdır`);
    if (sourceName.length < 2) return void errors.push(`Sətir ${n}: mənbənin adı yazılmayıb`);
    if (!urlOk(sourceUrl)) return void errors.push(`Sətir ${n}: link http(s) ilə başlamalıdır`);
    if (!dateOk(observedAt)) return void errors.push(`Sətir ${n}: tarix İİİİ-AA-GG formatında olmalıdır`);
    rows.push({ itemCode, tier, price: Math.round(price * 100) / 100, sourceKind, sourceName: sourceName.slice(0, 200), sourceUrl: sourceUrl || null, observedAt, note: note.slice(0, 500) });
  });
  return { rows, errors };
}

router.post("/prices/import", async (req, res): Promise<void> => {
  if (!(await adminOnly(req, res))) return;
  const b = ImportPricesBody.safeParse(req.body);
  if (!b.success) return bad(res, "CSV boşdur və ya çox böyükdür");
  const { rows, errors } = parsePriceCsv(b.data.csv);
  if (rows.length) await db.insert(priceQuotesTable).values(rows.map((r) => ({ ...r, createdByUserId: uid(req) })));
  res.json({ added: rows.length, errors: errors.slice(0, 50) });
});

/* ------------------------------------------------------------ repair estimates */

const MAX_DATA = 600_000;
const sizeOk = (data: unknown) => !!data && typeof data === "object" && !Array.isArray(data) && JSON.stringify(data).length <= MAX_DATA;
const dto = (r: typeof repairEstimatesTable.$inferSelect) => ({ id: r.id, name: r.name, data: r.data, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });

router.get("/repair-estimates", async (req, res): Promise<void> => {
  noStore(res);
  const rows = await db.select().from(repairEstimatesTable).where(eq(repairEstimatesTable.ownerUserId, uid(req))).orderBy(desc(repairEstimatesTable.updatedAt)).limit(100);
  res.json(rows.map((r) => {
    const t = (r.data as { result?: { totals?: { low?: number; typical?: number; high?: number } }; input?: { area?: number } });
    return { id: r.id, name: r.name, updatedAt: r.updatedAt.toISOString(), totalLow: t.result?.totals?.low ?? null, total: t.result?.totals?.typical ?? null, totalHigh: t.result?.totals?.high ?? null, area: t.input?.area ?? null };
  }));
});

router.post("/repair-estimates", async (req, res): Promise<void> => {
  const b = CreateRepairEstimateBody.safeParse(req.body);
  if (!b.success || !sizeOk(b.data.data)) return bad(res, "Smetanı saxlamaq alınmadı");
  const [r] = await db.insert(repairEstimatesTable).values({ ownerUserId: uid(req), name: b.data.name.trim(), data: b.data.data as Record<string, unknown> }).returning();
  res.status(201).json(dto(r));
});

const own = async (req: Request) => {
  const id = String(req.params.estimateId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.select().from(repairEstimatesTable).where(and(eq(repairEstimatesTable.id, id), eq(repairEstimatesTable.ownerUserId, uid(req))));
  return r ?? null;
};

router.get("/repair-estimates/:estimateId", async (req, res): Promise<void> => {
  noStore(res);
  const r = await own(req);
  if (!r) return notFound(res, "Smeta tapılmadı");
  res.json(dto(r));
});

router.put("/repair-estimates/:estimateId", async (req, res): Promise<void> => {
  const r = await own(req);
  if (!r) return notFound(res, "Smeta tapılmadı");
  const b = UpdateRepairEstimateBody.safeParse(req.body);
  if (!b.success || !sizeOk(b.data.data)) return bad(res, "Smetanı saxlamaq alınmadı");
  const [u] = await db.update(repairEstimatesTable).set({ name: b.data.name.trim(), data: b.data.data as Record<string, unknown>, updatedAt: new Date() }).where(eq(repairEstimatesTable.id, r.id)).returning();
  res.json(dto(u));
});

router.delete("/repair-estimates/:estimateId", async (req, res): Promise<void> => {
  const r = await own(req);
  if (!r) return notFound(res, "Smeta tapılmadı");
  await db.delete(repairEstimatesTable).where(eq(repairEstimatesTable.id, r.id));
  res.json({ success: true });
});

export default router;
