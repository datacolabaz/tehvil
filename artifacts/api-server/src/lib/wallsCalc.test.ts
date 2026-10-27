import { test } from "node:test";
import assert from "node:assert/strict";
import { masonryCalc, sanitizeMasonry, wallCalc, type MasonrySettings } from "./wallsCalc";
import type { WallsDoc, WFloor, WWall } from "./wallsModel";

const p = (value: number | null) => ({ value, source: "user" as const });
const wall = (id: string, kind: WWall["kind"], L: number, T: number, junctions: number, openings: [number, number, number][] = []): WWall => ({
  id, name: id, kind, origin: "user", length: p(L), thickness: p(T), junctions: p(junctions),
  openings: openings.map(([c, w, h], i) => ({ id: `${id}-o${i}`, kind: "window", count: p(c), width: p(w), height: p(h) })),
});
const floor = (id: string, walls: WWall[], confirmed = true, fh = 3.2, slab = 0.2): WFloor => ({ id, name: id, level: 0, floorHeight: p(fh), slabThickness: p(slab), walls, confirmed });
const brick = { id: "b", name: "Qırmızı kərpic", material: "red_brick", l: 250, h: 65, w: 120, jointH: 10, jointV: 10, method: "double", reservePct: 5 };
const settings = (extra: Record<string, unknown> = {}): MasonrySettings => sanitizeMasonry({
  specs: [brick, { ...brick, id: "b1", method: "single" }, { id: "m", material: "misar", method: "auto" }, { id: "a", material: "aerated", l: 600, h: 200, w: 200, method: "auto" }],
  byKind: { external: "b", internal: "b1", partition: "a" }, ...extra,
});
const close = (a: number | null, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("external wall, double brick (hand-calculated): corners, opening, count, mortar", () => {
  const f = floor("f1", [wall("ext", "external", 10, 0.25, 2, [[1, 1.5, 1.5]])]);
  const w = wallCalc(f, f.walls[0], settings());
  close(w.H, 3); close(w.deduct, 0.25); close(w.Leff, 9.75); close(w.gross, 29.25); close(w.openings, 2.25); close(w.net, 27);
  assert.equal(w.rows, 2); close(w.Tm, 0.25);
  close(w.units, (27 / (0.26 * 0.075)) * 2, 1e-6); // 2769.23
  close(w.mortarM3, 27 * 0.25 - ((27 / (0.26 * 0.075)) * 2) * 0.25 * 0.065 * 0.12); // 1.35
  close(w.mortarM3, 1.35, 1e-9);
  const c = masonryCalc({ floors: [f] } as unknown as WallsDoc, settings());
  assert.equal(c.floors[0].units[0].units, 2908); // ceil(2769.23 × 1.05)
  const m = c.floors[0].mortar!;
  close(m.reserveM3, 1.4175); close(m.dryM3, 1.84275); close(m.cementKg, (1.84275 / 5) * 1300); close(m.sandM3, (1.84275 * 4) / 5);
  assert.equal(m.cementBags, 12); // 479.1 kq / 40
  close(m.sandTon, ((1.84275 * 4) / 5) * 1.6);
  assert.equal(c.final, true);
});

test("internal wall: clear length, nothing deducted at junctions; single brick", () => {
  const f = floor("f1", [wall("in", "internal", 4.6, 0.12, 2, [[1, 0.9, 2.1]])]);
  const w = wallCalc(f, f.walls[0], settings());
  close(w.deduct, 0); close(w.gross, 13.8); close(w.net, 11.91); assert.equal(w.rows, 1);
  close(w.units, 11.91 / 0.0195); close(w.mortarM3, 11.91 * 0.12 - (11.91 / 0.0195) * 0.00195);
  assert.ok(!w.notes.some((n) => n.startsWith("Künclər")));
});

test("double vs single on the same wall; thickness that does not match the method is flagged, not changed", () => {
  const f = floor("f1", [wall("w", "internal", 5, 0.25, 0)]);
  const single = wallCalc(f, f.walls[0], settings({ byKind: { internal: "b1" } }));
  const double = wallCalc(f, f.walls[0], settings({ byKind: { internal: "b" } }));
  close(double.units, single.units! * 2);
  assert.equal(single.rows, 1);
  assert.ok(single.notes.some((n) => n.includes("uyğun deyil")));
  assert.ok(!double.notes.some((n) => n.includes("uyğun deyil")));
});

test("mişardaşı without a size is not counted; with a size, 'auto' takes the rows from the thickness", () => {
  const f = floor("f1", [wall("e", "external", 8, 0.4, 0)]);
  const st = settings({ byKind: { external: "m" } });
  const none = masonryCalc({ floors: [f] } as unknown as WallsDoc, st);
  assert.equal(none.floors[0].walls[0].status, "no-size"); assert.equal(none.final, false);
  assert.ok(none.issues.some((i) => i.includes("ölçüsü")));
  const st2 = settings({ specs: [{ id: "m", material: "misar", l: 390, h: 190, w: 190, jointH: 10, jointV: 10, method: "auto", reservePct: 5 }], byKind: { external: "m" } });
  const w = wallCalc(f, f.walls[0], st2);
  assert.equal(w.rows, 2); // (0.4 + 0.01) / (0.19 + 0.01) = 2.05
  close(w.units, (8 * 3) / (0.4 * 0.2) * 2); // 600
});

test("aerated concrete on glue: joint volume reported as glue, no cement or sand from it", () => {
  const f = floor("f1", [wall("p", "partition", 3, 0.2, 2)]);
  const c = masonryCalc({ floors: [f] } as unknown as WallsDoc, settings({ mortar: { mode: "norm", normM3PerM3: 0.25 } }));
  const m = c.floors[0].mortar!;
  assert.ok(m.glueM3 > 0); assert.equal(m.wetM3, 0); assert.equal(m.cementBags, 0);
});

test("mortar norm: used when chosen; missing norm is asked for", () => {
  const f = floor("f1", [wall("in", "internal", 4, 0.12, 0)]);
  const ok = wallCalc(f, f.walls[0], settings({ mortar: { mode: "norm", normM3PerM3: 0.22 } }));
  close(ok.mortarM3, 4 * 3 * 0.12 * 0.22);
  const c = masonryCalc({ floors: [f] } as unknown as WallsDoc, settings({ mortar: { mode: "norm" } }));
  assert.equal(c.floors[0].walls[0].status, "no-norm"); assert.equal(c.final, false);
});

test("unconfirmed floors are not calculated; house total rounds the sum once; per-wall material wins over the kind", () => {
  const f1 = floor("f1", [wall("a", "internal", 2, 0.12, 0)]);
  const f2 = floor("f2", [wall("b", "internal", 2, 0.12, 0)]);
  const f3 = floor("f3", [wall("c", "internal", 9, 0.12, 0)], false);
  const c = masonryCalc({ floors: [f1, f2, f3] } as unknown as WallsDoc, settings());
  assert.equal(c.floors[2].walls.length, 0); assert.equal(c.final, false);
  assert.ok(c.issues[0].includes("təsdiqlənməyib"));
  const each = c.floors[0].units[0].units, raw = c.floors[0].units[0].unitsRaw;
  assert.equal(c.house.units[0].units, Math.ceil(raw * 2 * 1.05 - 1e-9));
  assert.ok(c.house.units[0].units <= each * 2);
  const bags = c.floors[0].mortar!.cementBags + c.floors[1].mortar!.cementBags;
  assert.ok(c.house.mortar!.cementBags <= bags);
  const per = masonryCalc({ floors: [f1] } as unknown as WallsDoc, settings({ byWall: { a: "b" } }));
  assert.equal(per.floors[0].walls[0].specId, "b"); assert.equal(per.floors[0].walls[0].rows, 2);
});

test("settings are sanitized: unknown materials, absurd sizes, dangling references", () => {
  const s = sanitizeMasonry({ specs: [{ id: "x", material: "gold" }, { id: "k", material: "red_brick", l: 5, h: 65, w: 120, jointH: 999, reservePct: -4 }], byKind: { external: "x", internal: "k" }, byWall: { "no-such": "k" }, mortar: { ratioSand: 0, cementBagKg: 40, normM3PerM3: 9 } }, { floors: [] } as unknown as WallsDoc);
  assert.equal(s.specs.length, 1); assert.equal(s.specs[0].l, null); assert.equal(s.specs[0].jointH, 40); assert.equal(s.specs[0].reservePct, 0);
  assert.equal(s.byKind.external, null); assert.equal(s.byKind.internal, "k"); assert.deepEqual(s.byWall, {});
  assert.equal(s.mortar.ratioSand, 1); assert.equal(s.mortar.normM3PerM3, null); assert.equal(s.mortar.cementBagKg, 40);
});

test("same inputs → same result", () => {
  const f = floor("f1", [wall("ext", "external", 10, 0.25, 2, [[1, 1.5, 1.5]])]);
  assert.deepEqual(masonryCalc({ floors: [f] } as unknown as WallsDoc, settings()), masonryCalc({ floors: [f] } as unknown as WallsDoc, settings()));
});
