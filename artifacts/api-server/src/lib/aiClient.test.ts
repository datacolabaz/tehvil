import { test } from "node:test";
import assert from "node:assert/strict";
import { aiModel, aiProvider, callTool, toGeminiSchema } from "./aiClient";

const KEYS = ["AI_API_KEY", "AI_MODEL", "AI_API_URL", "AI_PROVIDER", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "ANTHROPIC_BASE_URL"];
function withEnv(vars: Record<string, string>, fn: () => unknown) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try { return fn(); } finally { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test("provider and model from the variables", () => {
  withEnv({ AI_API_KEY: "AIzaXYZ" }, () => { assert.equal(aiProvider(), "gemini"); assert.equal(aiModel(), "gemini-3.8-flash"); });
  withEnv({ AI_API_KEY: "k", AI_MODEL: "gemini-3.5-flash-lite" }, () => assert.equal(aiProvider(), "gemini"));
  withEnv({ AI_API_KEY: "sk-ant-1" }, () => { assert.equal(aiProvider(), "anthropic"); assert.equal(aiModel(), "claude-sonnet-5-5"); });
  withEnv({ AI_API_KEY: "k", AI_MODEL: "claude-opus-5-5" }, () => assert.equal(aiProvider(), "anthropic"));
  withEnv({ AI_API_KEY: "k", AI_API_URL: "https://generativelanguage.googleapis.com/v1beta/openai/" }, () => assert.equal(aiProvider(), "openai"));
  withEnv({ AI_API_KEY: "k", AI_PROVIDER: "openai" }, () => assert.equal(aiProvider(), "openai"));
  withEnv({ ANTHROPIC_API_KEY: "sk-ant-1", ANTHROPIC_MODEL: "claude-x" }, () => { assert.equal(aiProvider(), "anthropic"); assert.equal(aiModel(), "claude-x"); });
});

test("JSON Schema becomes Gemini schema", () => {
  const g = toGeminiSchema({
    type: "object",
    properties: {
      a: { type: ["number", "null"], minimum: 0 },
      b: { type: ["string", "null"], enum: ["x", "y", null] },
      c: { type: "array", items: { type: "object", properties: { n: { type: "string" } }, required: ["n"] } },
      d: { type: "object", additionalProperties: { type: "number" }, properties: { k: { type: "number" } } },
    },
    required: ["a"],
  });
  assert.deepEqual(g, {
    type: "OBJECT",
    properties: {
      a: { type: "NUMBER", nullable: true, minimum: 0 },
      b: { type: "STRING", nullable: true, enum: ["x", "y"] },
      c: { type: "ARRAY", items: { type: "OBJECT", properties: { n: { type: "STRING" } }, required: ["n"] } },
      d: { type: "OBJECT", properties: { k: { type: "NUMBER" } } },
    },
    required: ["a"],
  });
});

test("Gemini URL forms all reach generateContent", async () => {
  const seen: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push(url);
    assert.equal((init.headers as Record<string, string>)["x-goog-api-key"], "AIzaK");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "t", args: { ok: 1 } } }] } }] }), { status: 200 });
  }) as typeof fetch;
  const tool = { name: "t", description: "d", input_schema: { type: "object", properties: { ok: { type: "number" } } } };
  try {
    for (const u of ["", "https://generativelanguage.googleapis.com/", "https://generativelanguage.googleapis.com/v1beta", "https://generativelanguage.googleapis.com/v1beta/models",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"]) {
      const r = await withEnv({ AI_API_KEY: "AIzaK", AI_MODEL: "gemini-3.8-flash", ...(u ? { AI_API_URL: u } : {}) }, () => callTool({ parts: [{ text: "x" }], tool, maxTokens: 10, timeoutMs: 1000 })) as { input: Record<string, unknown> };
      assert.deepEqual(r.input, { ok: 1 });
    }
  } finally { globalThis.fetch = orig; }
  assert.ok(seen.every((u) => u === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"), seen.join("\n"));
});
