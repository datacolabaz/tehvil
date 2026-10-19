import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { db, evidenceUploadsTable, realtorMediaTable } from "@workspace/db";
import { logger } from "./logger";
import { ObjectStorageService } from "./objectStorage";
import { mediaDto } from "./realtorMedia";

/*
 * Prefills a listing from a public portal page (Tap.az, Bina.az …).
 * Best effort: reads OpenGraph tags, JSON-LD and common Azerbaijani wording
 * ("3 otaqlı", "96 m²", "185 000 AZN"). Portals change their markup, so every
 * field is optional and the realtor confirms the result.
 *
 * Only allow-listed portal hosts are fetched; photo hosts must resolve to public
 * addresses. REALTOR_IMPORT_EXTRA_HOSTS (comma separated) adds hosts for local testing.
 */

const PORTALS: { host: string; portal: "tap" | "bina" | "yeniemlak" | "other" }[] = [
  { host: "tap.az", portal: "tap" },
  { host: "bina.az", portal: "bina" },
  { host: "yeniemlak.az", portal: "yeniemlak" },
  { host: "emlak.az", portal: "other" },
  { host: "arenda.az", portal: "other" },
  { host: "ev10.az", portal: "other" },
  { host: "lalafo.az", portal: "other" },
  { host: "unvan.az", portal: "other" },
];
const extraHosts = () => (process.env.REALTOR_IMPORT_EXTRA_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
const MAX_PAGE = 3 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_PHOTOS = 8;
const UA = "Mozilla/5.0 (compatible; TehvilBot/1.0; +https://tehvil.az)";

export class ImportError extends Error {}

const hostMatches = (host: string, base: string) => host === base || host.endsWith(`.${base}`);
export function portalFor(url: URL) {
  const host = url.hostname.toLowerCase();
  if (extraHosts().includes(host)) return "other" as const;
  return PORTALS.find((p) => hostMatches(host, p.host))?.portal ?? null;
}

function privateAddress(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicHost(url: URL) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new ImportError("Link düzgün deyil");
  if (extraHosts().includes(url.hostname.toLowerCase())) return;
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((a) => privateAddress(a.address))) throw new ImportError("Bu ünvana müraciət etmək olmaz");
}

/** GET with manual redirects; every hop is re-validated. */
export async function safeFetch(raw: string, accept: string, maxBytes: number, allowHost: (u: URL) => boolean) {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    if (!allowHost(url)) throw new ImportError("Bu sayt dəstəklənmir");
    await assertPublicHost(url);
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "az,ru;q=0.8,en;q=0.6" }, signal: AbortSignal.timeout(12_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, url); continue; }
    if (!res.ok || !res.body) throw new ImportError(`Səhifə açılmadı (${res.status})`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new ImportError("Fayl çox böyükdür");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new ImportError("Fayl çox böyükdür"); }
      chunks.push(value);
    }
    return { url, contentType: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), body: Buffer.concat(chunks) };
  }
  throw new ImportError("Çox yönləndirmə");
}

/* ------------------------------------------------------------------- parsing */

const decode = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)));

function metas(html: string) {
  const out: { key: string; value: string }[] = [];
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const key = tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const value = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key && value) out.push({ key, value: decode(value).trim() });
  }
  return out;
}

function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim()) as unknown;
      const list = Array.isArray(parsed) ? parsed : (parsed as { "@graph"?: unknown[] })?.["@graph"] ?? [parsed];
      for (const item of list) if (item && typeof item === "object") out.push(item as Record<string, unknown>);
    } catch { /* ignore malformed blocks */ }
  }
  return out;
}

const num = (s: string) => {
  const n = Number(s.replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const KIND_WORDS: [RegExp, string][] = [[/villa/i, "villa"], [/ofis|office/i, "office"], [/bağ evi|bag evi|dacha|dača/i, "country_house"], [/mənzil|menzil|kvartira|квартир|yeni tikili|köhnə tikili/i, "apartment"], [/həyət evi|heyet evi|ev\b/i, "villa"]];

export interface ParsedListing {
  title: string | null; description: string | null; dealType: string | null; propertyKind: string | null; district: string | null; address: string | null;
  rooms: number | null; areaM2: number | null; floor: string | null; price: number | null; currency: string | null; images: string[]; found: string[];
}

export function parseListingHtml(html: string, pageUrl: URL): ParsedListing {
  const m = metas(html);
  const meta = (...keys: string[]) => keys.map((k) => m.find((x) => x.key === k)?.value).find(Boolean) ?? null;
  const ld = jsonLd(html);
  const titleTag = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const h1 = decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const title = (meta("og:title", "twitter:title") ?? (h1 || titleTag) ?? null)?.replace(/\s*[|—–-]\s*(Tap\.az|Bina\.az|Yeniemlak)[^|]*$/i, "").trim() || null;
  const description = meta("og:description", "description", "twitter:description");
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const hay = `${title ?? ""} ${description ?? ""} ${text}`;
  const found: string[] = [];

  // JSON-LD offers / residence
  let price: number | null = null; let currency: string | null = null; let rooms: number | null = null; let areaM2: number | null = null; let address: string | null = null;
  const ldImages: string[] = [];
  for (const item of ld) {
    const offers = (Array.isArray(item.offers) ? item.offers[0] : item.offers) as Record<string, unknown> | undefined;
    if (offers?.price != null && price == null) { price = num(String(offers.price)); currency = String(offers.priceCurrency ?? "") || null; }
    if (item.numberOfRooms != null && rooms == null) rooms = num(String((item.numberOfRooms as { value?: unknown })?.value ?? item.numberOfRooms));
    const floorSize = item.floorSize as { value?: unknown } | undefined;
    if (floorSize?.value != null && areaM2 == null) areaM2 = num(String(floorSize.value));
    const addr = item.address as { streetAddress?: string; addressLocality?: string } | string | undefined;
    if (addr && !address) address = typeof addr === "string" ? addr : [addr.streetAddress, addr.addressLocality].filter(Boolean).join(", ") || null;
    const img = item.image;
    for (const i of Array.isArray(img) ? img : img ? [img] : []) ldImages.push(typeof i === "string" ? i : String((i as { url?: string }).url ?? ""));
  }
  const priceMeta = meta("product:price:amount", "og:price:amount", "price");
  if (price == null && priceMeta) { price = num(priceMeta); currency = meta("product:price:currency", "og:price:currency", "pricecurrency"); }
  if (price == null) {
    const pm = hay.match(/(?<![\d/.,])(\d{1,3}(?:[ \u00a0\u202f.]\d{3})+|\d{3,9})\s*(AZN|₼|manat|man\.|USD|\$|€|EUR)/i);
    if (pm) { price = num(pm[1].replace(/\./g, "")); currency = /usd|\$/i.test(pm[2]) ? "USD" : /eur|€/i.test(pm[2]) ? "EUR" : "AZN"; }
  }
  if (currency && /azn|₼|man/i.test(currency)) currency = "AZN";
  if (currency && /usd|\$/i.test(currency)) currency = "USD";
  if (rooms == null) { const r = hay.match(/(\d{1,2})\s*-?\s*(?:otaql[ıi]|otaq\b|комнат)/i); if (r) rooms = Number(r[1]); }
  if (areaM2 == null) { const a = hay.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:m²|m2|kv\.?\s*m|кв\.?\s*м)/i); if (a) areaM2 = num(a[1]); }
  const floorM = hay.match(/(?:mərtəbə|mertebe|этаж)\s*:?\s*(\d{1,2}\s*\/\s*\d{1,2})/i) ?? hay.match(/(\d{1,2}\s*\/\s*\d{1,2})\s*(?:mərtəbə|mertebe|этаж)/i);
  const districtM = hay.match(/([A-ZƏÖÜĞIŞÇ][a-zəöüğışç]+)\s+(?:r\.|ray\.|rayonu)/) ?? hay.match(/\b([A-ZƏÖÜĞIŞÇ][a-zəöüğışç]+)\s+(?:qəs\.|qəsəbəsi)/) ?? hay.match(/\bm\.\s*([A-ZƏÖÜĞIŞÇ][\wəöüğışç]+(?:\s[A-ZƏÖÜĞIŞÇ][\wəöüğışç]+)?)/);
  const dealType = /icar|kiray|аренд|rent/i.test(`${title ?? ""} ${pageUrl.pathname}`) ? "rent" : /sat[ıi]l|satış|satis|продаж|sale/i.test(`${title ?? ""} ${pageUrl.pathname} ${description ?? ""}`) ? "sale" : null;
  const propertyKind = KIND_WORDS.find(([re]) => re.test(`${title ?? ""} ${description ?? ""}`))?.[1] ?? null;

  const imageSet = new Set<string>();
  for (const v of [...m.filter((x) => ["og:image", "og:image:url", "og:image:secure_url", "twitter:image"].includes(x.key)).map((x) => x.value), ...ldImages]) {
    try { const u = new URL(v, pageUrl); if (/^https?:$/.test(u.protocol)) imageSet.add(u.toString()); } catch { /* skip */ }
  }
  // Gallery links that point straight at large photos.
  for (const g of html.matchAll(/(?:href|data-src|data-full|data-large)\s*=\s*["']([^"']+\.(?:jpe?g|webp|png)(?:\?[^"']*)?)["']/gi)) {
    if (imageSet.size >= MAX_PHOTOS * 2) break;
    try { imageSet.add(new URL(decode(g[1]), pageUrl).toString()); } catch { /* skip */ }
  }

  const result: ParsedListing = {
    title, description: description?.slice(0, 4000) ?? null, dealType, propertyKind,
    district: districtM?.[1] ?? null, address, rooms: rooms != null && rooms <= 50 ? rooms : null, areaM2: areaM2 != null && areaM2 > 5 && areaM2 < 100000 ? areaM2 : null,
    floor: floorM?.[1]?.replace(/\s/g, "") ?? null, price: price != null && price > 0 ? price : null, currency: currency === "EUR" ? null : currency, images: [...imageSet].slice(0, MAX_PHOTOS), found,
  };
  for (const [k, label] of [["title", "başlıq"], ["price", "qiymət"], ["areaM2", "sahə"], ["rooms", "otaq sayı"], ["district", "rayon"], ["floor", "mərtəbə"]] as const) if (result[k] != null) found.push(label);
  return result;
}

/* ------------------------------------------------------------------- photos */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function storePhoto(userId: string, src: string, index: number) {
  const { body, contentType, url } = await safeFetch(src, "image/avif,image/webp,image/*", MAX_IMAGE, () => true);
  const type = IMAGE_TYPES.includes(contentType) ? contentType : null;
  if (!type || body.length < 2_000) return null;
  const storage = new ObjectStorageService();
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": type }, body: new Uint8Array(body), signal: AbortSignal.timeout(20_000) });
  if (!put.ok) throw new Error(`storage upload failed: ${put.status}`);
  const name = `${url.hostname.replace(/^www\./, "")}-${index + 1}.${type.split("/")[1].replace("jpeg", "jpg")}`;
  await db.insert(evidenceUploadsTable).values({ objectPath, userId, originalName: name, contentType: type, size: body.length, expiresAt: new Date(Date.now() + 60_000), attachedAt: new Date() });
  const [media] = await db.insert(realtorMediaTable).values({ ownerUserId: userId, objectPath, originalName: name, contentType: type, size: body.length }).returning();
  return media;
}

export async function importListing(userId: string, rawUrl: string) {
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`); } catch { throw new ImportError("Link düzgün deyil"); }
  const portal = portalFor(url);
  if (!portal) throw new ImportError("Hələlik Tap.az, Bina.az, Yeniemlak.az və digər əsas Azərbaycan portalları dəstəklənir");
  const page = await safeFetch(url.toString(), "text/html,application/xhtml+xml", MAX_PAGE, (u) => portalFor(u) !== null);
  if (!/html|xml/.test(page.contentType)) throw new ImportError("Bu link elan səhifəsi deyil");
  const parsed = parseListingHtml(page.body.toString("utf8"), page.url);
  const warnings: string[] = [];
  const photos = [];
  for (const [i, src] of parsed.images.entries()) {
    try { const media = await storePhoto(userId, src, i); if (media) photos.push(mediaDto(media)); }
    catch (err) { logger.warn({ err: err instanceof Error ? err.message : err }, "realtor.import_photo_failed"); }
  }
  if (parsed.images.length && !photos.length) warnings.push("Şəkilləri köçürmək alınmadı — əl ilə əlavə edin.");
  if (!parsed.found.length) warnings.push("Səhifədən məlumat oxunmadı — sahələri əl ilə doldurun.");
  if (parsed.found.length) parsed.found.push(...(photos.length ? [`${photos.length} şəkil`] : []));
  const { images: _images, ...fields } = parsed;
  return { url: page.url.toString(), portal, ...fields, photos, warnings };
}
