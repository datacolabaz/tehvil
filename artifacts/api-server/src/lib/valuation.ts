import { createHash } from "node:crypto";
import { ImportError, parseListingHtml, portalFor, safeFetch } from "./realtorImport";

/*
 * Market value from comparable listings.
 *
 * - Reads only the one page a person links, from allow-listed portals, and only where the
 *   portal's robots.txt allows it. No search pages are crawled.
 * - Compares with real listings only: ones the person adds, and listings Təhvil users have
 *   linked before (shared pool). Nothing is generated.
 * - Advert prices are asking prices, not sale prices; the result says so.
 * - No price is given from fewer than MIN_COMPS similar listings.
 */

export const MIN_COMPS = 3;
export const POOL_DAYS = 180;
export const DEFAULT_USD_RATE = 1.7;

export type Building = "new" | "old" | "house" | "unknown";
export type Tri = "yes" | "no" | "unknown";

export interface ListingFacts {
  dealType: string | null; city: string | null; district: string | null; areaM2: number | null; rooms: number | null;
  floor: number | null; floorsTotal: number | null; buildingType: Building; renovation: Tri; furnished: Tri;
  price: number | null; currency: string | null; title: string | null; description: string | null;
}

export const urlHash = (u: string) => {
  try { const url = new URL(u); url.hash = ""; url.search = ""; return createHash("sha256").update(url.toString().toLowerCase().replace(/\/$/, "")).digest("hex"); }
  catch { return null; }
};

const CITIES = ["Bakı", "Sumqayıt", "Gəncə", "Xırdalan", "Mingəçevir", "Lənkəran", "Şirvan", "Naxçıvan", "Şəki", "Quba", "Qəbələ", "Şamaxı"];
const fold = (s: string) => s.toLocaleLowerCase("az").replace(/ı/g, "i").replace(/ə/g, "e").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ğ/g, "g").replace(/ş/g, "s").replace(/ç/g, "c");
export const sameText = (a: string, b: string) => !!a && !!b && fold(a.trim()) === fold(b.trim());

/** Reads the facts the valuation needs from listing text (page text or pasted text). */
export function factsFromText(hay: string): Omit<ListingFacts, "title" | "description"> {
  const t = hay.replace(/\s+/g, " ");
  const lo = t.toLocaleLowerCase("az"); // keyword tests: “İcarə”, “Təmirli” in any case
  const num = (s: string) => { const n = Number(s.replace(/[\s  .]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const area = t.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:m²|m2|kv\.?\s*m|кв\.?\s*м)/i);
  const rooms = t.match(/(\d{1,2})\s*-?\s*(?:otaql[ıi]|otaq\b|комнат)/i) ?? t.match(/otaq(?:\s*sayı)?\s*:?\s*(\d{1,2})/i);
  const floor = t.match(/(?:mərtəbə|mertebe|этаж)\s*:?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i) ?? t.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:mərtəbə|mertebe|этаж)/i);
  const price = t.match(/(?<![\d/.,])(\d{1,3}(?:[ \u00a0\u202f.]\d{3})+|\d{4,9})\s*(AZN|₼|manat|man\.|USD|\$)/i);
  const district = t.match(/([A-ZƏÖÜĞIŞÇ][a-zəöüğışç]+)\s+(?:r\.|ray\.|rayonu)/) ?? t.match(/\b([A-ZƏÖÜĞIŞÇ][a-zəöüğışç]+)\s+(?:qəs\.|qəsəbəsi)/) ?? t.match(/\bm\.\s*([A-ZƏÖÜĞIŞÇ][\wəöüğışç]+)/);
  const city = CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(t) || fold(t).includes(fold(c))) ?? null;
  const building: Building = /yeni\s*tikili|новостройк/i.test(lo) ? "new" : /köhnə\s*tikili|kohne\s*tikili|вторичк|старый фонд/i.test(lo) ? "old" : /həyət\s*evi|heyet\s*evi|villa|bağ\s*evi|частный дом/i.test(lo) ? "house" : "unknown";
  const renovation: Tri = /təmirsiz|temirsiz|без ремонта|qara karkas/i.test(lo) ? "no" : /təmirli|temirli|с ремонтом|euro\s*təmir|əla təmir/i.test(lo) ? "yes" : "unknown";
  const furnished: Tri = /əşyasız|esyasiz|без мебели/i.test(lo) ? "no" : /əşyalı|esyali|с мебелью|mebelli/i.test(lo) ? "yes" : "unknown";
  const deal = /icar|kiray|аренд/i.test(lo) ? "rent" : /sat[ıi]l|satış|satis|продаж/i.test(lo) ? "sale" : null;
  const a = area ? num(area[1]) : null;
  const p = price ? num(price[1].replace(/\./g, "")) : null;
  return {
    dealType: deal, city, district: district?.[1] ?? null, areaM2: a && a > 5 && a < 100000 ? a : null,
    rooms: rooms ? Number(rooms[1]) || null : null, floor: floor ? Number(floor[1]) : null, floorsTotal: floor ? Number(floor[2]) : null,
    buildingType: building, renovation, furnished,
    price: p && p > 100 ? p : null, currency: price ? (/usd|\$/i.test(price[2]) ? "USD" : "AZN") : null,
  };
}

const FIELD_LABEL: Record<string, string> = { city: "şəhər", district: "rayon", areaM2: "sahə", rooms: "otaq sayı", floor: "mərtəbə", floorsTotal: "binanın mərtəbə sayı", buildingType: "tikili növü", renovation: "təmir vəziyyəti", furnished: "əşyalı/əşyasız", price: "elan qiyməti", dealType: "satış/kirayə" };
export const foundLabels = (f: Partial<ListingFacts>) => Object.entries(FIELD_LABEL).filter(([k]) => { const v = (f as Record<string, unknown>)[k]; return v != null && v !== "unknown"; }).map(([, l]) => l);

/* ---------------------------------------------------------------- robots.txt */

const robotsCache = new Map<string, { at: number; rules: { allow: string[]; disallow: string[] } | "all" | "none" }>();

export function parseRobots(txt: string, agent = "tehvilbot") {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null; let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const [k, ...rest] = line.split(":"); const key = k.trim().toLowerCase(); const val = rest.join(":").trim();
    if (key === "user-agent") { if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" && val) cur.allow.push(val);
    if (key === "disallow" && val) cur.disallow.push(val);
  }
  const g = groups.find((x) => x.agents.some((a) => a !== "*" && agent.includes(a))) ?? groups.find((x) => x.agents.includes("*"));
  return { allow: g?.allow ?? [], disallow: g?.disallow ?? [] };
}

const matches = (path: string, rule: string) => {
  const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
};
export function robotsAllows(rules: { allow: string[]; disallow: string[] }, path: string) {
  const longest = (list: string[]) => Math.max(-1, ...list.filter((r) => matches(path, r)).map((r) => r.length));
  return longest(rules.allow) >= longest(rules.disallow);
}

async function robotsFor(url: URL) {
  const key = url.origin;
  const hit = robotsCache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.rules;
  let rules: { allow: string[]; disallow: string[] } | "all" | "none";
  try {
    const r = await safeFetch(`${url.origin}/robots.txt`, "text/plain", 512 * 1024, (u) => u.origin === url.origin);
    rules = parseRobots(r.body.toString("utf8"));
  } catch (err) {
    // A missing robots.txt (4xx) allows reading; a server error means we do not know, so we do not read.
    const m = err instanceof Error ? err.message : "";
    rules = /\((4\d\d)\)/.test(m) ? "all" : "none";
  }
  robotsCache.set(key, { at: Date.now(), rules });
  return rules;
}

/** Reads one listing page. Throws ImportError with a reason the person can act on. */
export async function readListingPage(raw: string) {
  if ((process.env.VALUATION_LINK_FETCH ?? "on") === "off") throw new ImportError("Linkdən oxuma müvəqqəti söndürülüb. Elanın mətnini yapışdırın.");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { throw new ImportError("Link düzgün deyil"); }
  const portal = portalFor(url);
  if (!portal) throw new ImportError("Bu sayt dəstəklənmir. Bina.az, Tap.az, Yeniemlak.az və digər əsas portalların elan linkini və ya elanın mətnini daxil edin.");
  const rules = await robotsFor(url);
  if (rules === "none" || (rules !== "all" && !robotsAllows(rules, url.pathname + url.search))) throw new ImportError("Bu saytın qaydaları (robots.txt) səhifənin avtomatik oxunmasına icazə vermir. Elanın mətnini yapışdırın və ya məlumatları əl ilə daxil edin.");
  const page = await safeFetch(url.toString(), "text/html,application/xhtml+xml", 3 * 1024 * 1024, (u) => portalFor(u) !== null);
  if (!/html|xml/.test(page.contentType)) throw new ImportError("Bu link elan səhifəsi deyil");
  const html = page.body.toString("utf8");
  const base = parseListingHtml(html, page.url);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const extra = factsFromText(`${base.title ?? ""} ${base.description ?? ""} ${text}`);
  const facts: ListingFacts = {
    ...extra,
    dealType: base.dealType ?? extra.dealType, district: base.district ?? extra.district, areaM2: base.areaM2 ?? extra.areaM2, rooms: base.rooms ?? extra.rooms,
    price: base.price ?? extra.price, currency: base.currency ?? extra.currency, title: base.title, description: base.description,
  };
  if (base.floor && !facts.floor) { const [f, t] = base.floor.split("/").map(Number); facts.floor = f || null; facts.floorsTotal = t || null; }
  return { url: page.url.toString(), portal, facts };
}

/* ---------------------------------------------------------------- comparison */

export interface Comp {
  id: string; url: string | null; city: string; district: string; areaM2: number | null; rooms: number | null; floor: number | null; floorsTotal: number | null;
  buildingType: string; renovation: string; furnished: string; priceAzn: number | null; fetchedAt: Date; userAdded: boolean; copied?: boolean;
}

export function similarity(s: Comp, c: Comp): { score: number; notes: string[]; eligible: boolean } {
  const notes: string[] = [];
  if (!c.priceAzn || !c.areaM2) return { score: 0, notes: ["qiymət və ya sahə yoxdur"], eligible: false };
  if (!sameText(s.city, c.city)) return { score: 0, notes: ["başqa şəhər"], eligible: false };
  let score = 0;
  if (sameText(s.district, c.district)) { score += 3; notes.push("eyni rayon"); } else notes.push("başqa rayon");
  if (s.buildingType !== "unknown" && c.buildingType !== "unknown") {
    if (s.buildingType === c.buildingType) { score += 2; notes.push("eyni tikili növü"); } else { score -= 2; notes.push("fərqli tikili növü"); }
  }
  if (s.rooms && c.rooms) { const d = Math.abs(s.rooms - c.rooms); score += d === 0 ? 2 : d === 1 ? 1 : -1; if (d) notes.push(`otaq fərqi ${d}`); }
  if (s.areaM2) { const r = Math.abs(c.areaM2 - s.areaM2) / s.areaM2; score += r <= 0.2 ? 2 : r <= 0.4 ? 1 : -1; if (r > 0.2) notes.push(`sahə fərqi ${Math.round(r * 100)}%`); }
  if (s.renovation !== "unknown" && s.renovation === c.renovation) score += 1;
  const days = (Date.now() - c.fetchedAt.getTime()) / 86_400_000;
  if (days <= 60) score += 1; else notes.push(`${Math.round(days)} gün əvvəlki elan`);
  return { score, notes, eligible: score >= 3 };
}

/** Weighted quantile of values (weights > 0). */
export function wquantile(values: { v: number; w: number }[], q: number) {
  const s = [...values].sort((a, b) => a.v - b.v);
  const total = s.reduce((t, x) => t + x.w, 0);
  let acc = 0;
  for (const x of s) { acc += x.w; if (acc >= q * total) return x.v; }
  return s[s.length - 1].v;
}

const round = (v: number, step: number) => Math.round(v / step) * step;

export function computeValuation(subject: Comp & { price: number | null; currency: string | null }, candidates: Comp[], usdRate: number, poolSize: number) {
  const scored = candidates.map((c) => ({ c, ...similarity(subject, c), ppm2: c.priceAzn && c.areaM2 ? c.priceAzn / c.areaM2 : null }));
  let used = scored.filter((x) => x.eligible).sort((a, b) => b.score - a.score).slice(0, 12);
  // Copied adverts from the shared pool were not read by Təhvil; one far from the others is left out.
  const firm = used.filter((x) => !(x.c.copied && !x.c.userAdded)).map((x) => ({ v: x.ppm2!, w: 1 }));
  const ref = wquantile(used.length >= 3 ? used.map((x) => ({ v: x.ppm2!, w: 1 })) : firm.length ? firm : [{ v: 0, w: 1 }], 0.5);
  if (ref > 0) for (const x of used) if (x.c.copied && !x.c.userAdded && (x.ppm2! < ref * 0.5 || x.ppm2! > ref * 2)) { x.eligible = false; x.notes.push("qiyməti digər elanlardan kəskin fərqlənir"); }
  used = used.filter((x) => x.eligible);
  const missing: string[] = [];
  if (!subject.areaM2) missing.push("Sahə");
  if (!subject.district) missing.push("Rayon / ərazi");
  if (!subject.rooms) missing.push("Otaq sayı");
  if (subject.buildingType === "unknown") missing.push("Yeni və ya köhnə tikili");
  if (subject.renovation === "unknown") missing.push("Təmir vəziyyəti");
  if (!subject.floor || !subject.floorsTotal) missing.push("Mərtəbə / binanın mərtəbə sayı");
  if (subject.furnished === "unknown") missing.push("Əşyalı və ya əşyasız");
  const assumptions = [
    "Müqayisə yalnız elan qiymətlərinə əsaslanır; faktiki satış qiymətləri əlçatan deyil. Satış qiyməti adətən elan qiymətindən fərqli olur.",
    `Dollarla verilən qiymətlər 1 USD = ${String(usdRate).replace(".", ",")} AZN ilə çevrilib.`,
    "Oxşarlıq: eyni şəhər məcburidir; rayon, tikili növü, otaq sayı, sahə, təmir və elanın tarixi bal verir. Bal 3-dən azdırsa elan istifadə olunmur.",
    "Mərkəzi təxmin oxşarlıq balı ilə çəkilmiş median AZN/m² × sahədir; aralıq 25–75% intervalıdır. Mərtəbə, əşya və mikrolokasiya rəqəmlə düzəldilmir — yalnız amil kimi göstərilir.",
  ];
  const copiedUsed = used.filter((x) => x.c.copied && !x.c.userAdded).length;
  if (copiedUsed) assumptions.push(`${copiedUsed} müqayisə elanı istifadəçilər tərəfindən portal səhifəsindən köçürülüb — Təhvil onları özü oxumayıb. Qiyməti digərlərindən iki dəfədən çox fərqlənən belə elanlar istifadə olunmur.`);
  const comps = scored.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score).map((x) => ({ c: x.c, score: x.score, notes: x.notes, used: used.includes(x), ppm2: x.ppm2 }));
  if (used.length < MIN_COMPS || !subject.areaM2) {
    return {
      status: "insufficient" as const, confidence: "none" as const, estimate: null,
      confidenceReasons: [!subject.areaM2 ? "Əmlakın sahəsi məlum deyil." : `Yalnız ${used.length} oxşar elan tapıldı — ən azı ${MIN_COMPS} lazımdır. Rəqəm göstərmirik ki, süni dəqiqlik yaranmasın.`],
      comps, factors: [], missing, assumptions, askingNote: null,
    };
  }
  const vals = used.map((x) => ({ v: x.ppm2!, w: Math.max(1, x.score) }));
  const p25 = wquantile(vals, 0.25), p50 = wquantile(vals, 0.5), p75 = wquantile(vals, 0.75);
  const area = subject.areaM2;
  const estimate = { low: round(p25 * area, 1000), central: round(p50 * area, 1000), high: round(p75 * area, 1000), perM2Low: round(p25, 10), perM2: round(p50, 10), perM2High: round(p75, 10) };
  const sameDistrict = used.filter((x) => sameText(x.c.district, subject.district)).length / used.length;
  const spread = p25 > 0 ? p75 / p25 : 9;
  const confidence = used.length >= 8 && sameDistrict >= 0.6 && spread < 1.35 ? "high" : used.length >= 5 && spread < 1.6 ? "medium" : "low";
  const confidenceReasons = [
    `${used.length} oxşar elan istifadə olunub (${Math.round(sameDistrict * 100)}%-i eyni rayonda).`,
    `Elanlar arasında AZN/m² fərqi: 25% və 75% nöqtələri arasında ${Math.round((spread - 1) * 100)}%.`,
    ...(missing.length ? [`Çatışmayan məlumat: ${missing.join(", ").toLowerCase()}.`] : []),
  ];
  const share = (pred: (c: Comp) => boolean) => used.filter((x) => pred(x.c)).length / used.length;
  const factors: { effect: "up" | "down" | "neutral"; text: string }[] = [];
  if (subject.renovation === "yes" && share((c) => c.renovation === "no") >= 0.3) factors.push({ effect: "up", text: "Əmlak təmirlidir, müqayisə elanlarının bir hissəsi təmirsizdir — qiymətə müsbət təsir edə bilər." });
  if (subject.renovation === "no" && share((c) => c.renovation === "yes") >= 0.3) factors.push({ effect: "down", text: "Əmlak təmirsizdir, müqayisə elanlarının bir hissəsi təmirlidir — qiymətə mənfi təsir edə bilər." });
  if (subject.floor && subject.floorsTotal && (subject.floor === 1 || subject.floor === subject.floorsTotal)) factors.push({ effect: "down", text: `${subject.floor === 1 ? "Birinci" : "Sonuncu"} mərtəbə — alıcılar arasında adətən daha az tələb olunur.` });
  if (subject.furnished === "yes") factors.push({ effect: "neutral", text: "Əşyalıdır — əşyaların dəyəri əmlakın dəyərindən ayrıca qiymətləndirilməlidir." });
  const avgArea = used.reduce((t, x) => t + (x.c.areaM2 ?? 0), 0) / used.length;
  if (area > avgArea * 1.3) factors.push({ effect: "down", text: "Sahə müqayisə elanlarından xeyli böyükdür — böyük mənzillərdə 1 m² qiyməti adətən aşağı olur." });
  if (area < avgArea * 0.7) factors.push({ effect: "up", text: "Sahə müqayisə elanlarından xeyli kiçikdir — kiçik mənzillərdə 1 m² qiyməti adətən yüksək olur." });
  if (sameDistrict < 0.5) factors.push({ effect: "neutral", text: "Müqayisə elanlarının çoxu başqa rayondandır — mikrolokasiya fərqi nəzərə alınmayıb." });
  const asking = subject.price ? (subject.currency === "USD" ? subject.price * usdRate : subject.price) : null;
  const askingNote = asking ? asking > estimate.high ? `Elan qiyməti (${Math.round(asking).toLocaleString("az")} AZN) hesablanmış aralığın yuxarısındadır.` : asking < estimate.low ? `Elan qiyməti (${Math.round(asking).toLocaleString("az")} AZN) hesablanmış aralığın aşağısındadır.` : `Elan qiyməti (${Math.round(asking).toLocaleString("az")} AZN) hesablanmış aralığın içindədir.` : null;
  return { status: "ok" as const, confidence, estimate, confidenceReasons, comps, factors, missing, assumptions, askingNote, poolSize };
}
