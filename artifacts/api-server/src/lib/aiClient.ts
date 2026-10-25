import { logger } from "./logger";

/*
 * One place for every AI call (receipts, drawings, photo stages, finance assistant).
 * Server side only — the key never reaches the browser.
 *
 * Configuration (Railway backend variables):
 *   AI_API_KEY   — provider key (Gemini "AIza…", Anthropic "sk-ant-…", or any OpenAI-compatible key)
 *   AI_MODEL     — e.g. gemini-3.8-flash (default for Gemini), claude-sonnet-5-5
 *   AI_API_URL   — optional. Gemini: https://generativelanguage.googleapis.com (or a full …:generateContent URL);
 *                  Anthropic: https://api.anthropic.com; OpenAI-compatible: any URL ending in /openai, /v1 or /chat/completions
 *   AI_PROVIDER  — optional override: gemini | anthropic | openai
 * Legacy ANTHROPIC_API_KEY / ANTHROPIC_MODEL / ANTHROPIC_BASE_URL still work.
 *
 * Every call forces one structured "tool" answer, so the model returns data, never free text.
 */

export type Provider = "gemini" | "anthropic" | "openai";
export type Part = { text: string } | { file: { mime: string; data: string; name?: string } };
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }

export class AiNotConfigured extends Error {}
export class AiHttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const env = (k: string) => (process.env[k] || "").trim();
const apiKey = () => env("AI_API_KEY") || env("ANTHROPIC_API_KEY");

export function aiProvider(): Provider {
  const p = env("AI_PROVIDER").toLowerCase();
  if (p === "gemini" || p === "google") return "gemini";
  if (p === "anthropic" || p === "claude") return "anthropic";
  if (p === "openai") return "openai";
  const url = env("AI_API_URL");
  if (/\/openai\b|\/chat\/completions/i.test(url)) return "openai";
  if (/generativelanguage|:generatecontent|aiplatform/i.test(url)) return "gemini";
  if (/anthropic/i.test(url)) return "anthropic";
  const m = env("AI_MODEL").toLowerCase();
  if (m.startsWith("gemini")) return "gemini";
  if (m.startsWith("claude")) return "anthropic";
  if (env("AI_API_KEY")) return env("AI_API_KEY").startsWith("sk-ant-") ? "anthropic" : "gemini";
  return "anthropic"; // only the legacy ANTHROPIC_API_KEY is set
}

export function aiModel(): string {
  const m = env("AI_MODEL");
  if (m) return m;
  const p = aiProvider();
  if (p === "anthropic") return env("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
  return "gemini-3.8-flash";
}

export const aiConfigured = () => !!apiKey();

function endpoint(p: Provider, model: string): string {
  const raw = env("AI_API_URL").replace(/\/+$/, "");
  if (p === "gemini") {
    const u = raw || "https://generativelanguage.googleapis.com";
    if (/:generatecontent/i.test(u)) return u.replace("{model}", model);
    if (/\/models$/.test(u)) return `${u}/${model}:generateContent`;
    if (/\/v1(beta|alpha)?\d*$/.test(u)) return `${u}/models/${model}:generateContent`;
    return `${u}/v1beta/models/${model}:generateContent`;
  }
  if (p === "anthropic") {
    const u = raw || env("ANTHROPIC_BASE_URL").replace(/\/+$/, "") || "https://api.anthropic.com";
    if (/\/messages$/.test(u)) return u;
    return /\/v1$/.test(u) ? `${u}/messages` : `${u}/v1/messages`;
  }
  const u = raw || "https://generativelanguage.googleapis.com/v1beta/openai";
  return /\/chat\/completions$/.test(u) ? u : `${u}/chat/completions`;
}

/** JSON Schema → Gemini's OpenAPI-subset schema (upper-case types, `nullable`, no type arrays). */
export function toGeminiSchema(s: unknown): Record<string, unknown> {
  if (!s || typeof s !== "object") return { type: "STRING" };
  const src = s as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let types = Array.isArray(src.type) ? (src.type as string[]) : src.type ? [src.type as string] : [];
  if (types.includes("null")) { out.nullable = true; types = types.filter((t) => t !== "null"); }
  const t = types[0] ?? (src.properties ? "object" : src.items ? "array" : "string");
  out.type = t.toUpperCase();
  if (typeof src.description === "string") out.description = src.description;
  if (Array.isArray(src.enum)) {
    const vals = (src.enum as unknown[]).filter((v) => v !== null).map(String);
    if ((src.enum as unknown[]).includes(null)) out.nullable = true;
    if (t === "string" && vals.length) out.enum = vals;
  }
  for (const k of ["minimum", "maximum", "minItems", "maxItems"]) if (typeof src[k] === "number") out[k] = src[k];
  if (t === "object" && src.properties && typeof src.properties === "object") {
    out.properties = Object.fromEntries(Object.entries(src.properties as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)]));
    if (Array.isArray(src.required)) out.required = src.required;
  }
  if (t === "array") out.items = toGeminiSchema(src.items);
  return out;
}

const busy = (status: number) => status === 429 || status === 503 || status === 529;

/**
 * Sends one request and returns the forced tool's arguments.
 * Throws AiNotConfigured without a key, AiHttpError on an HTTP error (status kept for messages).
 */
export async function callTool(opts: { system?: string; parts: Part[]; tool: ToolDef; maxTokens: number; timeoutMs: number }): Promise<{ input: Record<string, unknown>; model: string }> {
  if (!aiConfigured()) throw new AiNotConfigured("AI hələ qoşulmayıb");
  const p = aiProvider();
  const model = aiModel();
  const url = endpoint(p, model);
  const { system, parts, tool, maxTokens } = opts;
  let headers: Record<string, string> = { "content-type": "application/json" };
  let body: unknown;

  if (p === "gemini") {
    headers["x-goog-api-key"] = apiKey();
    body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: parts.map((x) => ("text" in x ? { text: x.text } : { inlineData: { mimeType: x.file.mime, data: x.file.data } })) }],
      tools: [{ functionDeclarations: [{ name: tool.name, description: tool.description, parameters: toGeminiSchema(tool.input_schema) }] }],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [tool.name] } },
      // Room for the model's own reasoning on top of the answer.
      generationConfig: { maxOutputTokens: maxTokens + 8192, temperature: 0 },
    };
  } else if (p === "anthropic") {
    headers = { ...headers, "x-api-key": apiKey(), "anthropic-version": "2023-06-01" };
    body = {
      model, max_tokens: maxTokens, ...(system ? { system } : {}), tools: [tool], tool_choice: { type: "tool", name: tool.name },
      messages: [{
        role: "user",
        content: parts.map((x) => ("text" in x ? { type: "text", text: x.text }
          : x.file.mime === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: x.file.data }, ...(x.file.name ? { title: x.file.name } : {}) }
            : { type: "image", source: { type: "base64", media_type: x.file.mime, data: x.file.data } })),
      }],
    };
  } else {
    headers.authorization = `Bearer ${apiKey()}`;
    body = {
      model, max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: parts.map((x) => ("text" in x ? { type: "text", text: x.text } : { type: "image_url", image_url: { url: `data:${x.file.mime};base64,${x.file.data}` } })) },
      ],
      tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
      tool_choice: { type: "function", function: { name: tool.name } },
    };
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ provider: p, model, status: res.status, body: text.slice(0, 500) }, `AI request failed (${tool.name})`);
    throw new AiHttpError(res.status, busy(res.status) ? "AI xidməti hazırda məşğuldur, bir az sonra yenidən cəhd edin" : `AI sorğusu alınmadı (${res.status})`);
  }
  const json = await res.json() as Record<string, unknown>;
  const input = pickInput(p, json, tool.name);
  if (!input) {
    logger.warn({ provider: p, model, body: JSON.stringify(json).slice(0, 500) }, `AI returned no tool call (${tool.name})`);
    throw new Error("AI cavabı boşdur");
  }
  return { input, model };
}

const asObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);
const parseJson = (s: unknown) => { if (typeof s !== "string") return null; try { return asObj(JSON.parse(s.replace(/^```(?:json)?\s*|\s*```$/g, ""))); } catch { return null; } };

function pickInput(p: Provider, json: Record<string, unknown>, name: string): Record<string, unknown> | null {
  if (p === "gemini") {
    const parts = ((json.candidates as { content?: { parts?: Record<string, unknown>[] } }[] | undefined)?.[0]?.content?.parts) ?? [];
    const call = parts.map((x) => asObj(x.functionCall)).find((c) => c && (c.name === name || !c.name));
    if (call) return asObj(call.args) ?? {};
    return parts.map((x) => parseJson(x.text)).find(Boolean) ?? null;
  }
  if (p === "anthropic") {
    const use = (json.content as { type: string; name?: string; input?: unknown }[] | undefined)?.find((c) => c.type === "tool_use" && (!c.name || c.name === name));
    return asObj(use?.input);
  }
  const msg = (json.choices as { message?: { tool_calls?: { function?: { arguments?: unknown } }[]; content?: unknown } }[] | undefined)?.[0]?.message;
  const args = msg?.tool_calls?.[0]?.function?.arguments;
  return asObj(args) ?? parseJson(args) ?? parseJson(msg?.content);
}
