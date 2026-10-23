import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

/*
 * Reads an invoice / receipt / handwritten note with Claude (Anthropic Messages API, server side only).
 * The key never reaches the browser. Without ANTHROPIC_API_KEY the feature reports "not configured"
 * and every form keeps working by hand.
 *
 * The model only extracts what it sees. It never invents a date or an amount: missing values are null,
 * every field carries a confidence, and printed and handwritten dates are returned separately.
 */

export const AI_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export class AiNotConfigured extends Error {}

export interface InvoiceExtraction {
  documentType: "invoice" | "receipt" | "handwritten" | "other";
  vendor: string | null;
  docNumber: string | null;
  printedDate: string | null;
  handwrittenDate: string | null;
  currency: string | null;
  items: { name: string; quantity: string | null; unit: string | null; unitPrice: string | null; lineTotal: string | null; confidence: number }[];
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
          },
          required: ["name", "quantity", "unit", "unitPrice", "lineTotal", "confidence"],
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
        additionalProperties: { type: "number" },
      },
      suggestedCategory: {
        type: ["string", "null"],
        enum: ["material", "concrete_rebar", "labor", "contractor", "transport", "meals", "tool_rental", "machinery", "utilities", "cleaning", "design", "permits", "appliances", "other", null],
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
  const block = contentType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : IMAGE_TYPES.includes(contentType)
      ? { type: "image", source: { type: "base64", media_type: contentType, data: b64 } }
      : null;
  if (!block) throw new Error("Bu fayl tipi AI ilə oxunmur (JPG, PNG, WebP və ya PDF)");
  const model = AI_MODEL();
  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: [block, { type: "text", text: "Read this document and record it with the tool." }] }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn({ status: res.status, body: body.slice(0, 500) }, "invoice AI request failed");
    throw new Error(res.status === 429 || res.status === 529 ? "AI xidməti hazırda məşğuldur, bir az sonra yenidən cəhd edin" : "AI sənədi oxuya bilmədi");
  }
  const json = await res.json() as { content?: { type: string; name?: string; input?: unknown }[] };
  const use = json.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
  if (!use?.input) throw new Error("AI cavabı boşdur");
  return { result: sanitize(use.input as Record<string, unknown>), model };
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
      return { name: str(r.name) ?? "—", quantity: num(r.quantity), unit: str(r.unit, 16), unitPrice: num(r.unitPrice), lineTotal: num(r.lineTotal), confidence: conf(r.confidence) };
    }),
    subtotal: num(raw.subtotal),
    discount: num(raw.discount),
    tax: num(raw.tax),
    total: num(raw.total),
    paymentMethod: pm === "cash" || pm === "card" || pm === "transfer" || pm === "other" ? pm : null,
    notes: str(raw.notes, 500),
    confidence,
    suggestedCategory: str(raw.suggestedCategory, 24),
    unreadable: Array.isArray(raw.unreadable) ? raw.unreadable.map((u) => str(u, 80)).filter((u): u is string => !!u).slice(0, 30) : [],
  };
}

/**
 * Answers a question about one project's finance strictly from the given records (JSON).
 * The model must not compute new totals: every total it may quote is precomputed by the server.
 */
export async function answerFinanceQuestion(question: string, context: unknown): Promise<{ answer: string; refs: { type: string; id: string }[]; model: string }> {
  if (!aiConfigured()) throw new AiNotConfigured("AI köməkçisi hələ qoşulmayıb");
  const model = AI_MODEL();
  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
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
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: `You answer questions about one home construction project using ONLY the JSON data provided.
- Totals in "totals" and "parties" are computed by the system: quote them, do not recompute them.
- For questions needing a filter (e.g. "how much on rebar"), add up only the listed approved expense/line amounts that match and say which records you used.
- Unapproved (pending) or disputed records are not part of final totals; mention them separately if relevant.
- If the data does not contain the answer, say so plainly. Never invent records, amounts or dates.
- Money is in AZN.`,
      tools: [tool],
      tool_choice: { type: "tool", name: "answer" },
      messages: [{ role: "user", content: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(res.status === 429 || res.status === 529 ? "AI xidməti hazırda məşğuldur" : "AI cavab verə bilmədi");
  const json = await res.json() as { content?: { type: string; input?: { answer?: unknown; refs?: unknown } }[] };
  const input = json.content?.find((c) => c.type === "tool_use")?.input;
  const answer = typeof input?.answer === "string" ? input.answer.slice(0, 4000) : "";
  const refs = Array.isArray(input?.refs) ? (input!.refs as { type?: unknown; id?: unknown }[]).filter((r) => typeof r?.type === "string" && typeof r?.id === "string").map((r) => ({ type: r.type as string, id: r.id as string })).slice(0, 50) : [];
  if (!answer) throw new Error("AI cavabı boşdur");
  return { answer, refs, model };
}
