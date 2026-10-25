import ExcelJS from "exceljs";
import { ObjectStorageService } from "./objectStorage";
import type { Category } from "./estimateEngine";

/*
 * Material lists (engineer's or contractor's) from .xlsx / .csv: finds the header row by its words, then reads
 * name, quantity, unit, unit price and amount. Rows it cannot read are reported, not guessed.
 */
export interface TableRow { row: number; name: string; qty: number | null; unit: string; unitPrice: number | null; amount: number | null; category: Category }

const H = {
  name: /^(ad|adı|material|materialın adı|iş|işin adı|mal|məhsul|наимен|материал|работ|name|item|description)/i,
  qty: /^(miqdar|say|həcm|кол|объ|qty|quantity|amount qty)/i,
  unit: /^(vahid|ölçü vahidi|ед|unit)/i,
  price: /^(vahid qiymət|qiymət|цена|price|unit price)/i,
  amount: /^(məbləğ|cəmi|summa|сумм|стоим|amount|total)/i,
};

export function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/beton|бетон|sement|цемент|concrete/.test(n)) return "concrete";
  if (/armatur|арматур|rebar|ø\s?\d|ф\s?\d/.test(n)) return "rebar";
  if (/dikt|faner|фанер|qəlib|опалуб|formwork/.test(n)) return "formwork";
  if (/taxta|тахта|доск|брус|timber|board|3\s?[x×]\s?10|5\s?[x×]\s?10/.test(n)) return "timber";
  return "other";
}

const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "result" in (v as object)) return toNum((v as { result: unknown }).result);
  if (typeof v === "string") { const s = v.replace(/\s|AZN|₼|azn/g, "").replace(",", "."); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null; }
  return null;
};
const toStr = (v: unknown): string => (v == null ? "" : typeof v === "object" && "richText" in (v as object) ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("") : typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result ?? "") : String(v)).trim();

function parseCsv(text: string): string[][] {
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const out: string[] = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out.map((x) => x.trim());
  });
}

export async function readTable(objectPath: string, contentType: string): Promise<{ rows: TableRow[]; skipped: number; error?: string }> {
  const file = await new ObjectStorageService().getObjectEntityFile(objectPath);
  const chunks: Buffer[] = [];
  for await (const c of file.createReadStream()) chunks.push(c as Buffer);
  const buf = Buffer.concat(chunks);
  let grid: unknown[][] = [];
  if (contentType === "text/csv") grid = parseCsv(buf.toString("utf8"));
  else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return { rows: [], skipped: 0, error: "Faylda vərəq yoxdur" };
    ws.eachRow({ includeEmpty: false }, (r) => { grid.push((r.values as unknown[]).slice(1)); });
  }
  const headerIdx = grid.findIndex((r) => r.some((c) => H.name.test(toStr(c))) && r.some((c) => H.qty.test(toStr(c)) || H.amount.test(toStr(c))));
  if (headerIdx < 0) return { rows: [], skipped: grid.length, error: "Başlıq sətri tapılmadı: “Ad”, “Miqdar”, “Vahid”, “Qiymət” sütunları olmalıdır" };
  const head = grid[headerIdx].map(toStr);
  const col = (re: RegExp, not?: RegExp) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const ci = { name: col(H.name), qty: col(H.qty), unit: col(H.unit), price: col(H.price), amount: col(H.amount, H.price) };
  const rows: TableRow[] = []; let skipped = 0;
  for (let i = headerIdx + 1; i < grid.length && rows.length < 500; i++) {
    const r = grid[i];
    const name = toStr(r[ci.name]);
    if (!name || /^(cəmi|итого|total|yekun)/i.test(name)) { skipped++; continue; }
    const qty = ci.qty >= 0 ? toNum(r[ci.qty]) : null, unitPrice = ci.price >= 0 ? toNum(r[ci.price]) : null;
    const amount = ci.amount >= 0 ? toNum(r[ci.amount]) : qty != null && unitPrice != null ? Math.round(qty * unitPrice * 100) / 100 : null;
    if (qty == null && amount == null) { skipped++; continue; }
    rows.push({ row: i + 1, name: name.slice(0, 200), qty, unit: ci.unit >= 0 ? toStr(r[ci.unit]).slice(0, 16) : "", unitPrice, amount, category: guessCategory(name) });
  }
  return { rows, skipped };
}
