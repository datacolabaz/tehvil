import { ObjectStorageService } from "./objectStorage";
import { ACTIVE_CATEGORIES } from "./financeCore";
import { aiConfigured, aiModel, AiNotConfigured, callTool, type Part } from "./aiClient";

/*
 * Reads an invoice / receipt / handwritten note with the configured AI (see aiClient.ts, server side only).
 * The key never reaches the browser. Without AI_API_KEY the feature reports "not configured"
 * and every form keeps working by hand.
 *
 * The model only extracts what it sees. It never invents a date or an amount: missing values are null,
 * every field carries a confidence, and printed and handwritten dates are returned separately.
 */

export { aiConfigured, AiNotConfigured } from "./aiClient";
export const AI_MODEL = aiModel;
const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];


export interface InvoiceExtraction {
  documentType: "invoice" | "receipt" | "handwritten" | "other";
  vendor: string | null;
  docNumber: string | null;
  printedDate: string | null;
  handwrittenDate: string | null;
  currency: string | null;
  items: { name: string; quantity: string | null; unit: string | null; unitPrice: string | null; lineTotal: string | null; confidence: number; category: string | null }[];
  subtotal: string | null;
  discount: string | null;
  tax: string | null;
  total: string | null;
  paymentMethod: "cash" | "card" | "transfer" | "other" | null;
  notes: string | null;
  confidence: Record<string, number>;
  suggestedCategory: string | null;
  unreadable: string[];
}

const TOOL = {
  name: "record_invoice",
  description: "Record exactly what is written on the document. Use null for anything not visible or not readable. Never guess.",
  input_schema: {
    type: "object",
    properties: {
      documentType: { type: "string", enum: ["invoice", "receipt", "handwritten", "other"] },
      vendor: { type: ["string", "null"], description: "Seller / shop / company name as written" },
      docNumber: { type: ["string", "null"], description: "Invoice / receipt / qaimə number" },
      printedDate: { type: ["string", "null"], description: "Printed date as YYYY-MM-DD, null if none" },
      handwrittenDate: { type: ["string", "null"], description: "Handwritten date as YYYY-MM-DD, null if none or unreadable" },
      currency: { type: ["string", "null"] },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: ["string", "null"], description: "Decimal with a dot, e.g. 12.5" },
            unit: { type: ["string", "null"], description: "e.g. ədəd, kq, ton, m, m2, m3, kisə, l" },
            unitPrice: { type: ["string", "null"], description: "Decimal with a dot" },
            lineTotal: { type: ["string", "null"], description: "Decimal with a dot" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            category: { type: ["string", "null"], enum: [...ACTIVE_CATEGORIES, null], description: "What this line is: material kind, or labor / other_work for work and fees, machinery_transport for delivery or machinery" },
          },
          required: ["name", "quantity", "unit", "unitPrice", "lineTotal", "confidence", "category"],
        },
      },
      subtotal: { type: ["string", "null"] },
      discount: { type: ["string", "null"] },
      tax: { type: ["string", "null"], description: "ƏDV / VAT amount if shown" },
      total: { type: ["string", "null"], description: "Final amount payable as written" },
      paymentMethod: { type: ["string", "null"], enum: ["cash", "card", "transfer", "other", null] },
      notes: { type: ["string", "null"] },
      confidence: {
        type: "object",
        description: "0..1 per field: vendor, docNumber, printedDate, handwrittenDate, total, subtotal, discount, tax",
        properties: Object.fromEntries(["vendor", "docNumber", "printedDate", "handwrittenDate", "total", "subtotal", "discount", "tax"].map((k) => [k, { type: "number", minimum: 0, maximum: 1 }])),
      },
      suggestedCategory: {
        type: ["string", "null"],
        enum: [...ACTIVE_CATEGORIES, null],
        description: "concrete=beton/sement, rebar_metal=armatur/metal, timber_formwork=taxta/dikt/qəlib, building_materials=kərpic/blok/qum/suvaq və s., labor=usta/fəhlə, machinery_transport=texnika/daşınma, design=layihə/mühəndis, electrical, plumbing, other",
      },
      unreadable: { type: "array", items: { type: "string" }, description: "Fields or parts you could not read" },
    },
    required: ["documentType", "vendor", "docNumber", "printedDate", "handwrittenDate", "items", "subtotal", "discount", "tax", "total", "paymentMethod", "confidence", "suggestedCategory", "unreadable"],
  },
};

const SYSTEM = `You read construction purchase documents from Azerbaijan (Azerbaijani, Russian or English; printed, photographed, or handwritten).
Extract only what is visibly written. Rules:
- Never invent or estimate values. If a value is not on the document or not readable, return null and list it in "unreadable".
- Report a printed date and a handwritten date separately. Convert dates to YYYY-MM-DD only when day, month and year are all readable; otherwise null.
- Amounts: digits with a dot as the decimal separator, no currency symbols, no thousands separators.
- Do not correct the document's arithmetic. Copy each number as written even if it does not add up.
- Confidence: 1 = clearly printed, ~0.5 = partly legible handwriting, <0.3 = guessing (prefer null then).
- Items: one entry per line on the document.`;

async function readObject(objectPath: string): Promise<{ data: Buffer; contentType: string }> {
  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(objectPath);
  const [meta] = await file.getMetadata();
  if (Number(meta.size) > MAX_BYTES) throw new Error("Fayl AI ilə oxumaq üçün çox böyükdür (15 MB-a qədər)");
  const chunks: Buffer[] = [];
  for await (const c of file.createReadStream()) chunks.push(c as Buffer);
  return { data: Buffer.concat(chunks), contentType: String(meta.contentType) };
}

export async function extractInvoice(objectPath: string): Promise<{ result: InvoiceExtraction; model: string }> {
  if (!aiConfigured()) throw new AiNotConfigured("AI oxuma hələ qoşulmayıb");
  const { data, contentType } = await readObject(objectPath);
  const b64 = data.toString("base64");
  if (contentType !== "application/pdf" && !IMAGE_TYPES.includes(contentType)) throw new Error("Bu fayl tipi AI ilə oxunmur (JPG, PNG, WebP və ya PDF)");
  const parts: Part[] = [{ file: { mime: contentType, data: b64 } }, { text: "Read this document and record it with the tool." }];
  const { input, model } = await callTool({ system: SYSTEM, parts, tool: TOOL, maxTokens: 4000, timeoutMs: 90_000 });
  return { result: sanitize(input), model };
}

const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => {
  if (v == null || v === "") return null;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  return /^\d{1,12}(\.\d{1,3})?$/.test(s) ? s : null;
};
const isoDate = (v: unknown) => {
  const s = str(v, 10);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};
const conf = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? Math.round(v * 100) / 100 : 0);

const activeCat = (v: unknown) => (typeof v === "string" && (ACTIVE_CATEGORIES as string[]).includes(v) ? v : null);

/** Never trust model output shape: keep only well-formed values. */
export function sanitize(raw: Record<string, unknown>): InvoiceExtraction {
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 200) : [];
  const confidence: Record<string, number> = {};
  if (raw.confidence && typeof raw.confidence === "object") for (const [k, v] of Object.entries(raw.confidence)) confidence[k.slice(0, 40)] = conf(v);
  const pm = raw.paymentMethod;
  return {
    documentType: (["invoice", "receipt", "handwritten", "other"] as const).find((t) => t === raw.documentType) ?? "other",
    vendor: str(raw.vendor),
    docNumber: str(raw.docNumber, 80),
    printedDate: isoDate(raw.printedDate),
    handwrittenDate: isoDate(raw.handwrittenDate),
    currency: str(raw.currency, 8),
    items: items.map((i) => {
      const r = (i ?? {}) as Record<string, unknown>;
      return { name: str(r.name) ?? "—", quantity: num(r.quantity), unit: str(r.unit, 16), unitPrice: num(r.unitPrice), lineTotal: num(r.lineTotal), confidence: conf(r.confidence), category: activeCat(r.category) };
    }),
    subtotal: num(raw.subtotal),
    discount: num(raw.discount),
    tax: num(raw.tax),
    total: num(raw.total),
    paymentMethod: pm === "cash" || pm === "card" || pm === "transfer" || pm === "other" ? pm : null,
    notes: str(raw.notes, 500),
    confidence,
    suggestedCategory: activeCat(raw.suggestedCategory),
    unreadable: Array.isArray(raw.unreadable) ? raw.unreadable.map((u) => str(u, 80)).filter((u): u is string => !!u).slice(0, 30) : [],
  };
}

/**
 * Answers a question about one project's finance strictly from the given records (JSON).
 * The model must not compute new totals: every total it may quote is precomputed by the server.
 */
export async function answerFinanceQuestion(question: string, context: unknown): Promise<{ answer: string; refs: { type: string; id: string }[]; model: string }> {
  if (!aiConfigured()) throw new AiNotConfigured("AI köməkçisi hələ qoşulmayıb");
  const tool = {
    name: "answer",
    description: "Give the answer and the ids of records it is based on.",
    input_schema: {
      type: "object",
      properties: {
        answer: { type: "string", description: "Answer in the language of the question (usually Azerbaijani). Short. Quote amounts exactly as given in the data with AZN." },
        refs: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["expense", "payment", "invoice", "change_order", "party", "photo", "line"] }, id: { type: "string" } }, required: ["type", "id"] } },
      },
      required: ["answer", "refs"],
    },
  };
  const { input, model } = await callTool({
    system: `You answer questions about one home construction project using ONLY the JSON data provided.
- Totals in "totals" and "parties" are computed by the system: quote them, do not recompute them.
- For questions needing a filter (e.g. "how much on rebar"), add up only the listed approved expense/line amounts that match and say which records you used.
- Unapproved (pending) or disputed records are not part of final totals; mention them separately if relevant.
- If the data does not contain the answer, say so plainly. Never invent records, amounts or dates.
- Money is in AZN.`,
    parts: [{ text: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` }],
    tool, maxTokens: 1500, timeoutMs: 60_000,
  });
  const answer = typeof input.answer === "string" ? (input.answer as string).slice(0, 4000) : "";
  const refs = Array.isArray(input.refs) ? (input.refs as { type?: unknown; id?: unknown }[]).filter((r) => typeof r?.type === "string" && typeof r?.id === "string").map((r) => ({ type: r.type as string, id: r.id as string })).slice(0, 50) : [];
  if (!answer) throw new Error("AI cavabı boşdur");
  return { answer, refs, model };
}
