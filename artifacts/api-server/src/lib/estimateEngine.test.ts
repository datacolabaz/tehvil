import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEstimate, concreteOf, DEFAULT_SETTINGS, formworkOf, kgPerM, questionsFor, rebarOf, withLaps, type Element, type EstimateDoc, type Param } from "./estimateEngine";

const D = (value: number): Param => ({ value, source: "drawing", confidence: 0.95 });
const U = (value: number): Param => ({ value, source: "user" });
const M: Param = { value: null, source: "missing" };
const doc = (elements: Element[], extra: Partial<EstimateDoc> = {}): EstimateDoc => ({ settings: DEFAULT_SETTINGS, elements, norms: {}, manual: [], overrides: {}, prices: {}, removed: [], ...extra });
const close = (a: number | null, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("simple foundation: one straight segment", () => {
  const e: Element = { id: "f", type: "strip_foundation", name: "F", segments: [10], params: { width: D(0.5), height: D(1), junctions: D(0) } };
  close(concreteOf(e).value, 5);
});

test("foundation ring: overlapping corners are not counted twice", () => {
  // Outer 10 × 8 m, width 0.5, height 1: exact volume = (80 − 9 × 7) × 1 = 17 m³.
  const e: Element = { id: "f", type: "strip_foundation", name: "F", segments: [10, 10, 8, 8], params: { width: D(0.5), height: D(1), junctions: D(4) } };
  close(concreteOf(e).value, 17);
  assert.match(concreteOf(e).formula, /kəsişmələr/);
});

test("foundation with segments of different sizes", () => {
  const e: Element = { id: "f", type: "strip_foundation", name: "F", segments: [12.5, 6, 3.25], params: { width: D(0.4), height: D(0.8), junctions: D(2) } };
  close(concreteOf(e).value, (21.75 * 0.4 * 0.8) - 2 * 0.4 * 0.4 * 0.8);
});

test("columns, beams, slab, wall volumes", () => {
  close(concreteOf({ id: "c", type: "column", name: "K", params: { count: D(12), width: D(0.4), depth: D(0.4), height: D(3) } }).value, 12 * 0.48);
  close(concreteOf({ id: "b", type: "beam", name: "R", params: { count: D(6), length: D(4.5), width: D(0.3), height: D(0.4) } }).value, 6 * 4.5 * 0.12);
  close(concreteOf({ id: "s", type: "slab", name: "P", params: { area: D(120), thickness: D(0.18), openings: D(4) } }).value, 116 * 0.18);
  close(concreteOf({ id: "s2", type: "slab", name: "P", params: { length: D(12), width: D(10), thickness: D(0.2) } }).value, 24);
  close(concreteOf({ id: "w", type: "wall", name: "W", params: { length: D(10), height: D(3), thickness: D(0.2), openings: D(2) } }).value, 28 * 0.2);
});

test("rebar mass d²/162", () => {
  close(kgPerM(8), 64 / 162); close(kgPerM(10), 100 / 162); close(kgPerM(12), 144 / 162);
  close(kgPerM(14), 196 / 162); close(kgPerM(16), 256 / 162); close(kgPerM(18), 324 / 162);
  close(kgPerM(12), 0.888889, 1e-5);
});

test("laps every stock length", () => {
  assert.equal(withLaps(10, 12, DEFAULT_SETTINGS).laps, 0);
  assert.equal(withLaps(11.7, 12, DEFAULT_SETTINGS).laps, 0);
  assert.equal(withLaps(24, 12, DEFAULT_SETTINGS).laps, 2);
  close(withLaps(24, 12, DEFAULT_SETTINGS).length, 24 + 2 * 40 * 12 / 1000);
});

test("column rebar: longitudinal and stirrups by diameter", () => {
  const e: Element = { id: "c", type: "column", name: "K", params: { count: D(4), width: D(0.4), depth: D(0.4), height: D(3), longD: D(16), longCount: D(4), stirD: D(8), stirSpacing: D(0.2) } };
  const r = rebarOf(e, DEFAULT_SETTINGS);
  const long = r.find((x) => x.part === "uzununa")!, stir = r.find((x) => x.part === "xamut")!;
  assert.equal(long.count, 16);
  close(long.lengthEach, 3 + 30 * 16 / 1000);
  close(long.kg, Math.round(16 * 3.48 * (256 / 162) * 100) / 100, 0.01);
  assert.equal(stir.count, 4 * (Math.ceil(3 / 0.2) + 1));
  close(stir.lengthEach, 2 * 0.32 + 2 * 0.32 + 20 * 8 / 1000);
});

test("estimate groups rebar by diameter, only diameters used", () => {
  const r = computeEstimate(doc([
    { id: "c", type: "column", name: "K", params: { count: D(4), width: D(0.4), depth: D(0.4), height: D(3), longD: D(16), longCount: D(4), stirD: D(8), stirSpacing: D(0.2) } },
    { id: "b", type: "beam", name: "R", params: { count: D(2), length: D(5), width: D(0.3), height: D(0.4), longD: D(14), longCount: D(4), stirD: D(8), stirSpacing: D(0.15) } },
  ]));
  const names = r.items.filter((i) => i.category === "rebar" && !i.reserve).map((i) => i.name);
  assert.deepEqual(names, ["Armatur Ø8 mm", "Armatur Ø14 mm", "Armatur Ø16 mm"]);
  const t = r.items.find((i) => i.key === "rebar:16")!;
  assert.equal(t.extra?.[0].unit, "t");
  close(t.extra![0].value, Math.round(t.qty! / 1000 * 1000) / 1000);
});

test("reserves are separate lines, never added to the structural volume", () => {
  const r = computeEstimate(doc([{ id: "s", type: "slab", name: "P", params: { area: D(100), thickness: D(0.2) } }]));
  const slab = r.items.find((i) => i.key === "concrete:slab")!, res = r.items.find((i) => i.key === "concrete:reserve")!;
  close(slab.qty, 20); close(res.qty, 0.4); assert.ok(res.reserve);
  close(r.totals.concreteM3, 20);
});

test("timber pieces and m³; plywood area and sheets", () => {
  const e: Element = { id: "f", type: "strip_foundation", name: "F", segments: [10, 10, 8, 8], params: { width: D(0.5), height: D(1), junctions: D(4) } };
  close(formworkOf(e).value, 2 * 36 * 1);
  const r = computeEstimate(doc([e], { norms: { board5x10PerM2: 2 }, settings: { ...DEFAULT_SETTINGS, plywood: { w: 1.22, h: 2.44, thicknessMm: 18 } } }));
  const ply = r.items.find((i) => i.key === "formwork:plywood")!;
  assert.equal(ply.qty, Math.ceil(72 / (1.22 * 2.44)));
  close(ply.extra![0].value, 72);
  const b5 = r.items.find((i) => i.key === "timber:board5x10PerM2")!;
  assert.equal(b5.qty, Math.ceil(72 * 2 / 6));
  close(b5.extra![0].value, Math.round(24 * 0.05 * 0.10 * 6 * 1000) / 1000);
  assert.equal(r.items.find((i) => i.key === "timber:board3x10PerM2")!.status, "missing");
});

test("missing dimensions: no quantity, clear status, question asked", () => {
  const e: Element = { id: "f", type: "strip_foundation", name: "F", segments: [10], params: { width: M, height: D(1), junctions: D(0) } };
  const r = computeEstimate(doc([e]));
  const f = r.items.find((i) => i.key === "concrete:strip_foundation")!;
  assert.equal(f.qty, null); assert.equal(f.status, "missing");
  assert.equal(r.items.find((i) => i.key === "concrete:reserve")!.qty, null);
  assert.ok(r.warnings.some((w) => w.includes("çatışmır")));
  const q = questionsFor(doc([e]));
  const w = q.find((x) => x.id === "f.width")!;
  assert.match(w.text, /eni/);
  assert.deepEqual(w.options.map((o) => o.label), ["40 sm", "50 sm", "60 sm"]);
  close(w.options[1].value, 0.5);
});

test("only uncertain parameters are asked; confident ones are not", () => {
  const e: Element = { id: "c", type: "column", name: "K", params: { count: D(4), width: D(0.4), depth: { value: 0.4, source: "drawing", confidence: 0.3 }, height: D(3), longD: M, longCount: D(4), stirD: D(8), stirSpacing: D(0.2) } };
  const ids = questionsFor(doc([e])).filter((q) => q.elementId).map((q) => q.param);
  assert.deepEqual(ids.sort(), ["depth", "longD"]);
});

test("engineer flag and architectural-only drawings", () => {
  const e: Element = { id: "c", type: "column", name: "K", params: { count: D(4), width: D(0.4), depth: D(0.4), height: D(3), longD: { value: null, source: "engineer" }, longCount: D(4) } };
  const r = computeEstimate(doc([e]));
  assert.equal(r.items.find((i) => i.key === "rebar:x")!.status, "engineer");
  assert.ok(!questionsFor(doc([e])).some((q) => q.param === "longD"), "flagged for engineer: not asked again");
  const r2 = computeEstimate(doc([{ ...e, params: { ...e.params, longD: { value: 14, source: "assumed" } } }], { architecturalOnly: true }));
  assert.equal(r2.items.find((i) => i.key === "rebar:14")!.status, "engineer");
});

test("user override and prices update the amounts", () => {
  const e: Element = { id: "s", type: "slab", name: "P", params: { area: D(100), thickness: D(0.2) } };
  const r = computeEstimate(doc([e], { overrides: { "concrete:slab": { qty: 21, reason: "ölçüldü" } }, prices: { "concrete:slab": 95 } }));
  const slab = r.items.find((i) => i.key === "concrete:slab")!;
  assert.equal(slab.qty, 21); assert.equal(slab.computedQty, 20); assert.equal(slab.status, "user"); assert.equal(slab.amount, 1995);
  assert.equal(r.totals.amount, 1995);
});

test("norm-based items need a norm from the person", () => {
  const e: Element = { id: "c", type: "column", name: "K", params: { count: D(1), width: D(0.4), depth: D(0.4), height: D(3), longD: D(16), longCount: D(4) } };
  const r = computeEstimate(doc([e]));
  assert.equal(r.items.find((i) => i.key === "other:wirePerTon")!.qty, null);
  const r2 = computeEstimate(doc([e], { norms: { wirePerTon: 10 } }));
  const kg = r2.items.find((i) => i.key === "rebar:16")!.qty!;
  close(r2.items.find((i) => i.key === "other:wirePerTon")!.qty, Math.round(kg / 1000 * 10 * 10) / 10);
});

test("slab mesh by area: estimated, both directions, laps", () => {
  const e: Element = { id: "s", type: "slab", name: "P", params: { area: D(100), thickness: D(0.2), meshD: U(12), meshSpacing: U(0.2), layers: U(2) } };
  const r = rebarOf(e, DEFAULT_SETTINGS)[0];
  close(r.totalM, Math.round(100 * 2 * 2 / 0.2 * (1 + 0.48 / 11.7) * 100) / 100);
  assert.equal(r.status, "user");
});
