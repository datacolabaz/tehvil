/**
 * What can be priced in a repair estimate. Prices themselves are not here: they are quotes in the
 * `price_quotes` table, each with a source and a date. The only exception is `prelim`: the
 * starting table the Təhvil team entered on 06.10.2026 (never checked with suppliers). It is
 * loaded as quotes of kind "preliminary" and always shown as unchecked.
 */
export type PriceKind = "material" | "labor" | "service";
export interface PriceItem {
  code: string;
  name: string;
  kind: PriceKind;
  category: string;
  /** The unit the price is for: kisə, l, m², m, ədəd, komplekt, xidmət, ton·mərtəbə. */
  unit: string;
  /** For packed materials: what one unit contains (e.g. 30 kq). */
  pack?: { size: number; unit: "kq" | "l" | "m²" };
  note?: string;
  prelim?: number;
}

export const PRELIM_DATE = "2026-10-06";
export const PRELIM_SOURCE = "Təhvil-in ilkin qiymət cədvəli (təchizatçı ilə yoxlanmayıb)";

export const PRICE_ITEMS: PriceItem[] = [
  // Söküntü
  { code: "lab.demo.floor", name: "Köhnə döşəmə örtüyünün sökülməsi", kind: "labor", category: "sokuntu", unit: "m²", prelim: 3.5 },
  { code: "lab.demo.tile", name: "Köhnə kafelin sökülməsi", kind: "labor", category: "sokuntu", unit: "m²", prelim: 6 },
  { code: "lab.demo.plaster", name: "Köhnə suvağın təmizlənməsi", kind: "labor", category: "sokuntu", unit: "m²" },
  // Elektrik
  { code: "mat.cable", name: "Elektrik kabeli (VVG 3×2,5)", kind: "material", category: "elektrik", unit: "m", prelim: 2.4 },
  { code: "lab.cable", name: "Kabel çəkilməsi (şırımla)", kind: "labor", category: "elektrik", unit: "m", prelim: 1.8 },
  { code: "mat.socket", name: "Rozetka / açar (mexanizm və çərçivə)", kind: "material", category: "elektrik", unit: "ədəd", prelim: 9 },
  { code: "lab.socket", name: "Rozetka / açar quraşdırılması", kind: "labor", category: "elektrik", unit: "ədəd", prelim: 7 },
  { code: "mat.panel", name: "Elektrik paneli və avtomatlar", kind: "material", category: "elektrik", unit: "komplekt", prelim: 260 },
  { code: "lab.panel", name: "Elektrik panelinin yığılması", kind: "labor", category: "elektrik", unit: "komplekt", prelim: 120 },
  // Santexnika
  { code: "mat.pipe.ppr", name: "Su borusu (PPR) fitinqlərlə", kind: "material", category: "santexnika", unit: "m", prelim: 4.2 },
  { code: "lab.pipe.ppr", name: "Su borusunun çəkilməsi", kind: "labor", category: "santexnika", unit: "m", prelim: 6 },
  { code: "mat.pipe.sewer", name: "Kanalizasiya borusu fitinqlərlə", kind: "material", category: "santexnika", unit: "m", prelim: 5.5 },
  { code: "lab.pipe.sewer", name: "Kanalizasiya borusunun çəkilməsi", kind: "labor", category: "santexnika", unit: "m", prelim: 6 },
  // Divarlar
  { code: "mat.plaster.bag", name: "Gips suvaq (kisə)", kind: "material", category: "divar", unit: "kisə", pack: { size: 30, unit: "kq" } },
  { code: "mat.plaster.m2", name: "Gips suvaq materialı, m² üzrə", kind: "material", category: "divar", unit: "m²", prelim: 3.8 },
  { code: "lab.plaster", name: "Divarların suvağı (mayaklarla)", kind: "labor", category: "divar", unit: "m²", prelim: 6.5 },
  { code: "mat.putty.bag", name: "Finiş şpaklyovka (kisə)", kind: "material", category: "divar", unit: "kisə", pack: { size: 25, unit: "kq" } },
  { code: "mat.putty.m2", name: "Şpaklyovka materialı, m² üzrə", kind: "material", category: "divar", unit: "m²", prelim: 2.2 },
  { code: "lab.putty", name: "Şpaklyovka və sumbata", kind: "labor", category: "divar", unit: "m²", prelim: 4.5 },
  { code: "mat.primer", name: "Astar (qab)", kind: "material", category: "divar", unit: "qab", pack: { size: 10, unit: "l" } },
  // Boya
  { code: "mat.paint.can", name: "Daxili su əsaslı boya (qab)", kind: "material", category: "boya", unit: "qab", pack: { size: 10, unit: "l" } },
  { code: "mat.paint.m2", name: "Boya materialı, 2 qat, m² üzrə", kind: "material", category: "boya", unit: "m²", prelim: 2.6 },
  { code: "lab.paint", name: "Rəngləmə, 2 qat (divar və ya tavan)", kind: "labor", category: "boya", unit: "m²", prelim: 3.5 },
  // Döşəmə
  { code: "mat.screed.bag", name: "Styajka quru qarışığı (kisə)", kind: "material", category: "dosheme", unit: "kisə", pack: { size: 25, unit: "kq" } },
  { code: "mat.screed.m2", name: "Styajka materialı, m² üzrə", kind: "material", category: "dosheme", unit: "m²", prelim: 6.5 },
  { code: "lab.screed", name: "Döşəmə styajkası", kind: "labor", category: "dosheme", unit: "m²", prelim: 7 },
  { code: "mat.selflevel.bag", name: "Özüyayılan döşəmə qarışığı (kisə)", kind: "material", category: "dosheme", unit: "kisə", pack: { size: 25, unit: "kq" } },
  { code: "lab.selflevel", name: "Özüyayılan döşəmənin tökülməsi", kind: "labor", category: "dosheme", unit: "m²" },
  { code: "mat.laminate", name: "Laminat", kind: "material", category: "dosheme", unit: "m²", prelim: 18 },
  { code: "mat.underlay", name: "Laminat altlığı", kind: "material", category: "dosheme", unit: "m²", prelim: 2.4 },
  { code: "lab.laminate", name: "Laminatın döşənməsi", kind: "labor", category: "dosheme", unit: "m²", prelim: 6 },
  { code: "mat.skirting", name: "Plintus", kind: "material", category: "dosheme", unit: "m", prelim: 4.5 },
  { code: "lab.skirting", name: "Plintusun vurulması", kind: "labor", category: "dosheme", unit: "m", prelim: 2.5 },
  // Kafel
  { code: "mat.tile.wall", name: "Divar kafeli", kind: "material", category: "kafel", unit: "m²", prelim: 24 },
  { code: "mat.tile.floor", name: "Döşəmə kafeli / metlax", kind: "material", category: "kafel", unit: "m²", prelim: 20 },
  { code: "lab.tile.wall", name: "Divara kafel vurulması", kind: "labor", category: "kafel", unit: "m²", prelim: 16 },
  { code: "lab.tile.floor", name: "Döşəməyə kafel/metlax döşənməsi", kind: "labor", category: "kafel", unit: "m²", prelim: 14 },
  { code: "mat.tile.adhesive", name: "Kafel yapışqanı (kisə)", kind: "material", category: "kafel", unit: "kisə", pack: { size: 25, unit: "kq" }, prelim: 9.5 },
  { code: "mat.grout", name: "Fuqa (ara doldurucu, kisə)", kind: "material", category: "kafel", unit: "kisə", pack: { size: 2, unit: "kq" } },
  { code: "mat.waterproof", name: "Hidroizolyasiya mastikası (qab)", kind: "material", category: "kafel", unit: "qab", pack: { size: 15, unit: "kq" } },
  { code: "lab.waterproof", name: "Hidroizolyasiya (döşəmə + divarın aşağısı)", kind: "labor", category: "kafel", unit: "m²" },
  // Tavan
  { code: "mat.ceiling.m2", name: "Gipskarton asma tavan materialı, m² üzrə", kind: "material", category: "tavan", unit: "m²", prelim: 9 },
  { code: "lab.ceiling", name: "Gipskarton asma tavanın quraşdırılması", kind: "labor", category: "tavan", unit: "m²", prelim: 9 },
  // Qapı, işıq, sanitar
  { code: "mat.door", name: "Daxili qapı (komplekt)", kind: "material", category: "qapi", unit: "ədəd", prelim: 260 },
  { code: "lab.door", name: "Qapının quraşdırılması", kind: "labor", category: "qapi", unit: "ədəd", prelim: 45 },
  { code: "mat.spot", name: "Spot işıq", kind: "material", category: "isiqlandirma", unit: "ədəd", prelim: 12 },
  { code: "lab.spot", name: "Spot işığın quraşdırılması", kind: "labor", category: "isiqlandirma", unit: "ədəd", prelim: 6 },
  { code: "lab.chandelier", name: "Çilçıraq quraşdırılması", kind: "labor", category: "isiqlandirma", unit: "ədəd", prelim: 25 },
  { code: "mat.toilet", name: "Unitaz", kind: "material", category: "sanitar", unit: "ədəd", prelim: 340 },
  { code: "lab.toilet", name: "Unitazın quraşdırılması", kind: "labor", category: "sanitar", unit: "ədəd", prelim: 60 },
  { code: "mat.sink", name: "Lavabo və smesitel", kind: "material", category: "sanitar", unit: "komplekt", prelim: 230 },
  { code: "lab.sink", name: "Lavabonun quraşdırılması", kind: "labor", category: "sanitar", unit: "komplekt", prelim: 45 },
  { code: "mat.bath", name: "Vanna (akril) və ya duş kabini", kind: "material", category: "sanitar", unit: "ədəd", prelim: 380 },
  { code: "lab.bath", name: "Vanna / duşun quraşdırılması", kind: "labor", category: "sanitar", unit: "ədəd", prelim: 70 },
  // Xidmətlər
  { code: "svc.debris", name: "Tikinti tullantısının çıxarılması", kind: "service", category: "temizlik", unit: "m²", prelim: 2.5, note: "Mənzilin sahəsi üzrə" },
  { code: "svc.debris.base", name: "Tullantı maşını (sifariş)", kind: "service", category: "temizlik", unit: "xidmət", prelim: 120 },
  { code: "svc.lift", name: "Materialın mərtəbəyə qaldırılması", kind: "service", category: "temizlik", unit: "ton·mərtəbə", note: "Lift olmayanda" },
  { code: "svc.cleaning", name: "Yekun təmizlik", kind: "service", category: "temizlik", unit: "m²", prelim: 1.5 },
];

export const ITEM_BY_CODE = new Map(PRICE_ITEMS.map((i) => [i.code, i]));
export const TIERS = ["ekonom", "standart", "premium", "any"] as const;
export const SOURCE_KINDS = ["supplier", "contractor", "published", "preliminary"] as const;
/** A price older than this many days is shown as stale. */
export const STALE_DAYS = 60;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
};

export interface QuoteLike { tier: string; price: number; sourceKind: string; sourceName: string; sourceUrl: string | null; observedAt: string; note: string; id: string }

/**
 * Low / median / high for one item and tier. Checked prices (anything but "preliminary") win:
 * the preliminary table is used only when no checked price exists. A tier without its own
 * prices falls back to "any", then to "standart" — and says so.
 */
export function aggregate(quotes: QuoteLike[], tier: string, today = new Date()) {
  const pick = (t: string) => quotes.filter((q) => q.tier === t);
  let used = pick(tier);
  let fallback: string | null = null;
  if (!used.length && tier !== "any") { used = pick("any"); if (used.length) fallback = "any"; }
  if (!used.length && tier !== "standart") { used = pick("standart"); if (used.length) fallback = "standart"; }
  const checked = used.filter((q) => q.sourceKind !== "preliminary");
  const base = checked.length ? checked : used;
  if (!base.length) return null;
  const prices = base.map((q) => q.price);
  const newest = base.map((q) => q.observedAt).sort().at(-1)!;
  const ageDays = Math.floor((today.getTime() - new Date(newest).getTime()) / 86_400_000);
  return {
    low: Math.min(...prices), median: median(prices), high: Math.max(...prices), count: base.length,
    verified: checked.length > 0, newest, stale: ageDays > STALE_DAYS, fallback,
    sources: base.map((q) => ({ id: q.id, name: q.sourceName, url: q.sourceUrl, date: q.observedAt, price: q.price, kind: q.sourceKind, note: q.note })),
  };
}
