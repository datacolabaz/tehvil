import { test } from "node:test";
import assert from "node:assert/strict";
import { plasterCalc, plasterWall, sanitizePlaster } from "./wallsPlaster";
import type { WallsDoc, WFloor, WWall } from "./wallsModel";

const p = (value: number | null) => ({ value, source: "user" as const });
const op = (kind: "door" | "window", c: number, w: number, h: number) => ({ id: `${kind}${c}${w}${h}`, kind, count: p(c), width: p(w), height: p(h) });
const wall = (id: string, kind: WWall["kind"], L: number, T: number, j: number, openings: ReturnType<typeof op>[] = []): WWall => ({ id, name: id, kind, origin: "user", length: p(L), thickness: p(T), junctions: p(j), openings });
const floor = (id: string, walls: WWall[], confirmed = true): WFloor => ({ id, name: id, level: 0, floorHeight: p(3.2), slabThickness: p(0.2), walls, confirmed });
const close = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const doc = (...floors: WFloor[]) => ({ floors } as unknown as WallsDoc);
const ext = () => wall("ext", "external", 10, 0.4, 2, [op("window", 2, 1.5, 1.5), op("door", 1, 1, 2.1)]);
const inn = () => wall("in", "internal", 4.6, 0.2, 2, [op("door", 1, 0.9, 2.1)]);

test("external wall (hand-calculated): inner face shorter by the corners, facade full height", () => {
  const w = plasterWall(floor("f", []), ext(), sanitizePlaster({}));
  close(w.openings, 6.6);
  close(w.innerLen, 9.2); close(w.innerH, 3); close(w.innerArea, 9.2 * 3 - 6.6); // 21,0
  close(w.facadeLen, 10); close(w.facadeH, 3.2); close(w.facadeArea, 10 * 3.2 - 6.6); // 25,4
});

test("internal wall: both sides, clear length, opening off each side", () => {
  const w = plasterWall(floor("f", []), inn(), sanitizePlaster({}));
  close(w.innerArea, (4.6 * 3 - 1.89) * 2); close(w.facadeArea, 0); // 23,82
});

test("cement-sand totals (hand-calculated): internal and external separate, 40 kg bags rounded up, grand total at the end", () => {
  const c = plasterCalc(doc(floor("f", [ext(), inn()])), sanitizePlaster({}));
  const i = c.floors[0].internal!, x = c.floors[0].external!;
  close(i.area, 44.82); close(i.volumeM3, 0.6723); close(i.reserveM3, 0.73953);
  close(i.cementKg, (0.73953 * 1.3) / 4 * 1300); assert.equal(i.cementBags, 8); // 312,45 kq
  close(i.sandM3, (0.73953 * 1.3 * 3) / 4);
  close(x.area, 25.4); close(x.cementKg, (25.4 * 0.02 * 1.1 * 1.3) / 4 * 1300); assert.equal(x.cementBags, 6); // 236,09 kq
  assert.equal(c.house.total.cementBags, 14); // 548,5 kq / 40
  close(c.house.total.sandM3, i.sandM3! + x.sandM3!);
  assert.equal(c.final, true);
});

test("gypsum: kg and bags, no cement or sand; missing consumption is asked for", () => {
  const c = plasterCalc(doc(floor("f", [ext(), inn()])), sanitizePlaster({ internal: { material: "gypsum", thicknessMm: 10, consumption: 0.9, bagKg: 30 } }));
  const i = c.floors[0].internal!;
  close(i.gypsumKg, 44.82 * 10 * 0.9 * 1.1); assert.equal(i.gypsumBags, 15); // 443,7 kq / 30
  assert.equal(i.cementKg, null); assert.equal(i.sandM3, null);
  assert.equal(c.house.total.cementBags, 6); // only the facade
  const none = plasterCalc(doc(floor("f", [inn()])), sanitizePlaster({ internal: { material: "gypsum", consumption: null } }));
  assert.equal(none.floors[0].internal!.gypsumKg, null); assert.equal(none.final, false);
  assert.ok(none.issues.some((s) => s.includes("sərfiyyat")));
});

test("sides: per kind and per wall; an internal wall has no facade; reveals once per opening", () => {
  const st = sanitizePlaster({ sides: { internal: { inner: 1, facade: 1 } }, byWall: { ext: { inner: 0, facade: 1 } }, internal: { revealCm: 20 } });
  assert.deepEqual(st.sides.internal, { inner: 1, facade: 0 });
  const f = floor("f", [ext(), inn()]);
  const a = plasterWall(f, f.walls[0], st), b = plasterWall(f, f.walls[1], st);
  close(a.innerArea, 0); close(a.facadeArea, 25.4);
  close(b.innerReveal, 1 * (2 * 2.1 + 0.9) * 0.2); close(b.innerArea, 4.6 * 3 - 1.89 + 1.02);
});

test("unconfirmed floors are not calculated; impossible sizes are flagged", () => {
  const c = plasterCalc(doc(floor("a", [inn()]), floor("b", [inn()], false)), sanitizePlaster({}));
  assert.equal(c.floors[1].walls.length, 0); assert.equal(c.final, false);
  const bad = plasterCalc(doc(floor("a", [wall("x", "internal", 1, 0.2, 0, [op("door", 2, 1, 2.1)])])), sanitizePlaster({}));
  assert.equal(bad.floors[0].walls[0].status, "error"); assert.equal(bad.final, false);
});

test("settings are sanitized", () => {
  const s = sanitizePlaster({ internal: { material: "gold", thicknessMm: 500, ratioSand: 0, reservePct: -5, consumption: 99 }, sides: { external: { inner: 5, facade: 3 } }, byWall: { nope: { inner: 1 } } }, doc());
  assert.equal(s.internal.material, "cement_sand"); assert.equal(s.internal.thicknessMm, 100); assert.equal(s.internal.ratioSand, 1); assert.equal(s.internal.reservePct, 0); assert.equal(s.internal.consumption, null);
  assert.deepEqual(s.sides.external, { inner: 1, facade: 1 }); assert.deepEqual(s.byWall, {}); assert.equal(s.cementBagKg, 40);
});
