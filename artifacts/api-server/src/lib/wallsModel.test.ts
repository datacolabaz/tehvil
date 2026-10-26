import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { applyEdit, emptyWalls, floorIssues, mergeWalls, sanitizeWalls, wallsState, type WallsDoc } from "./wallsModel";
import { extractPages, pdfPageCount } from "./wallsAi";

const r = (value: number | null, confidence = 0.9, how = "dimension", page = 1) => ({ value, confidence, how, page, where: "plan" });
const reading = () => sanitizeWalls({
  drawingKinds: ["floor_plan", "section"], scaleNote: "1:100", unreadable: ["2-ci mərtəbə pəncərə hündürlüyü"],
  floors: [
    { name: "1-ci mərtəbə", level: 0, floorHeight: r(3.2), slabThickness: r(0.2), walls: [
      { name: "Ox 1", kind: "external", length: r(10), thickness: r(0.4), junctions: r(0), openings: [{ kind: "window", count: r(2), width: r(1.5), height: r(1.5) }, { kind: "door", count: r(1), width: r(1), height: r(2.1) }] },
      { name: "Daxili 1", kind: "internal", length: r(4.6), thickness: r(0.2), junctions: r(2), openings: [] },
      { name: "Ox 2", kind: "external", length: r(999), thickness: r(0.4), junctions: r(0), openings: [] },
    ] },
    { name: "2-ci mərtəbə", level: 1, floorHeight: r(3.0, 0.4), slabThickness: r(null), walls: [
      { name: "Ox 1", kind: "external", length: r(10, 0.7, "scale"), thickness: r(0.4), junctions: r(0), openings: [{ kind: "window", count: r(3), width: r(1.5), height: r(null) }] },
    ] },
  ],
});

test("AI reading: printed values are 'drawing', low confidence and scale are 'assumed', impossible and empty are 'missing'", () => {
  const x = reading();
  const f1 = x.floors[0], f2 = x.floors[1];
  assert.equal(f1.floorHeight.source, "drawing"); assert.equal(f1.floorHeight.value, 3.2);
  assert.equal(f1.walls[2].length.source, "missing"); assert.ok(f1.walls[2].length.where?.includes("999"));
  assert.equal(f2.floorHeight.source, "assumed");
  assert.equal(f2.slabThickness.source, "missing");
  assert.equal(f2.walls[0].length.source, "assumed"); // read with the scale, never "from the drawing"
  assert.equal(f2.walls[0].openings[0].height.source, "missing");
  assert.equal(sanitizeWalls({ floors: [{ walls: [{ kind: "x", length: { value: "4,5", confidence: 1, how: "dimension" } }] }] }).floors[0].walls[0].length.value, 4.5);
});

test("issues: a floor with missing / assumed values cannot be confirmed; a clean floor can", () => {
  const w = mergeWalls(emptyWalls(), reading());
  const i1 = floorIssues(w.floors[0]), i2 = floorIssues(w.floors[1]);
  assert.equal(i1.length, 1); assert.ok(i1[0].text.includes("Ox 2"));
  assert.ok(i2.length >= 4);
  const tryConfirm = applyEdit(w, w.floors.map((f) => ({ ...f, confirmed: true })));
  assert.ok(tryConfirm.error?.includes("təsdiqlənə bilməz"));
  // The person types the missing length → floor 1 can be confirmed.
  const fixed = w.floors.map((f, i) => (i === 0 ? { ...f, confirmed: true, walls: f.walls.map((x) => (x.name === "Ox 2" ? { ...x, length: { value: 8, source: "user" } } : x)) } : f));
  const ok = applyEdit(w, fixed);
  assert.equal(ok.error, undefined);
  assert.equal(ok.doc.floors[0].confirmed, true); assert.ok(ok.doc.floors[0].confirmedAt);
  assert.equal(ok.doc.floors[0].walls[2].length.source, "user");
  assert.equal(wallsState(ok.doc).allConfirmed, false);
});

test("edits: a 'drawing' value changed by the client becomes the person's; unchanged values stay as read", () => {
  const w = mergeWalls(emptyWalls(), reading());
  const f = w.floors[0];
  const sent = [{ ...f, walls: f.walls.map((x, i) => (i === 0 ? { ...x, length: { ...x.length, value: 10.5 } } : x)) }, w.floors[1]];
  const out = applyEdit(w, sent).doc;
  assert.equal(out.floors[0].walls[0].length.source, "user"); assert.equal(out.floors[0].walls[0].length.value, 10.5);
  assert.equal(out.floors[0].walls[0].thickness.source, "drawing");
  // Cannot smuggle an unread value in as "drawing".
  const fake = applyEdit(w, [{ ...f, walls: f.walls.map((x, i) => (i === 2 ? { ...x, length: { value: 7, source: "drawing", confidence: 1 } } : x)) }, w.floors[1]]).doc;
  assert.equal(fake.floors[0].walls[2].length.source, "user");
  // Empty value → missing.
  const cleared = applyEdit(w, [{ ...f, walls: f.walls.map((x, i) => (i === 0 ? { ...x, thickness: { value: null, source: "user" } } : x)) }, w.floors[1]]).doc;
  assert.equal(cleared.floors[0].walls[0].thickness.source, "missing");
});

test("added and removed walls and openings; openings larger than the wall are an issue", () => {
  const w = mergeWalls(emptyWalls(), reading());
  const f = w.floors[0];
  const added = { id: "new-1", name: "Arakəsmə", kind: "partition", length: { value: 3, source: "user" }, thickness: { value: 0.1, source: "user" }, junctions: { value: 2, source: "user" }, openings: [{ id: "o-new", kind: "door", count: { value: 1, source: "user" }, width: { value: 0.8, source: "user" }, height: { value: 2, source: "user" } }] };
  const out = applyEdit(w, [{ ...f, walls: [...f.walls.slice(0, 2), added] }, w.floors[1]]).doc;
  assert.equal(out.floors[0].walls.length, 3); assert.equal(out.floors[0].walls[2].origin, "user");
  const big = applyEdit(w, [{ ...f, walls: [{ ...f.walls[0], openings: [{ id: "x", kind: "window", count: { value: 20, source: "user" }, width: { value: 1.5, source: "user" }, height: { value: 1.5, source: "user" } }] }] }]).doc;
  assert.ok(floorIssues(big.floors[0]).some((i) => i.text.includes("böyükdür")));
});

test("re-reading keeps what the person typed and the walls they added; confirmation drops only if something changed", () => {
  let w: WallsDoc = mergeWalls(emptyWalls(), reading());
  const f = w.floors[0];
  w = applyEdit(w, [{ ...f, confirmed: true, walls: [...f.walls.map((x) => (x.name === "Ox 2" ? { ...x, length: { value: 8, source: "user" } } : x)), { id: "u1", name: "Mənim divarım", kind: "partition", length: { value: 2, source: "user" }, thickness: { value: 0.1, source: "user" }, junctions: { value: 1, source: "user" }, openings: [] }] }, w.floors[1]]).doc;
  assert.equal(w.floors[0].confirmed, true);
  const again = mergeWalls(w, reading());
  assert.equal(again.floors[0].walls.find((x) => x.name === "Ox 2")!.length.value, 8);
  assert.ok(again.floors[0].walls.some((x) => x.id === "u1"));
  assert.equal(again.floors[0].confirmed, true);
  const changed = reading(); changed.floors[0].walls[0].thickness = { value: 0.3, source: "drawing", confidence: 1 };
  assert.equal(mergeWalls(w, changed).floors[0].confirmed, false);
});

test("PDF: count pages and send only the selected ones", async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 5; i++) doc.addPage([200 + i * 10, 200]);
  const buf = Buffer.from(await doc.save());
  assert.equal(await pdfPageCount(buf), 5);
  const out = await extractPages(buf, [4, 2, 4, 9]);
  const back = await PDFDocument.load(out);
  assert.equal(back.getPageCount(), 2);
  assert.deepEqual(back.getPages().map((p) => p.getWidth()), [230, 210]);
  await assert.rejects(extractPages(buf, [9]));
});
