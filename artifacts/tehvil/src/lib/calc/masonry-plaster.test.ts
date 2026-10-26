import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masonryTotals, masonryWall, type MasonryWall } from './masonry';
import { defaultMix, mixTotals, plasterWall, type PlasterWall } from './plaster';

const near = (a: number | null, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const wall = (p: Partial<MasonryWall> = {}): MasonryWall => ({
  length: 5, height: 3, thicknessCm: 25, material: 'red_brick', unit: { l: 250, h: 65, w: 120 }, jointMm: 10, reservePct: 5, openings: [], unitPrice: null, mortarPrice: null, ...p,
});

/* ---------------------------------------------------------------- masonry */

test('red brick 250×120×65, 10 mm joint, 25 cm wall: two rows, 1 538 bricks, 1 616 with 5%, mortar 0.75 m³', () => {
  const r = masonryWall(wall());
  assert.equal(r.ok, true); assert.equal(r.fits, true); assert.equal(r.rows, 2);
  near(r.netArea, 15); near(r.netVolume, 3.75);
  near(r.byArea, 15 / (0.26 * 0.075) * 2);
  near(r.pieces, 1538.4615, 1e-3);
  assert.equal(r.piecesWithReserve, 1616);
  near(r.mortarM3, 3.75 - r.pieces! * 0.25 * 0.065 * 0.12, 1e-9);
  near(r.mortarM3, 0.75, 1e-3);
});

test('red brick, 12 cm wall: 51.3 bricks per m² (the usual norm ≈ 51)', () => {
  const r = masonryWall(wall({ length: 1, height: 1, thicknessCm: 12, reservePct: 0 }));
  near(r.pieces, 51.282, 1e-3); assert.equal(r.piecesWithReserve, 52);
});

test('another red brick size (250×120×88): fewer pieces', () => {
  const a = masonryWall(wall({ thicknessCm: 12 })), b = masonryWall(wall({ thicknessCm: 12, unit: { l: 250, h: 88, w: 120 } }));
  assert.ok(b.pieces! < a.pieces!);
  near(b.pieces, 15 / (0.26 * 0.098), 1e-9);
});

test('white silicate brick 250×120×88, 12 cm wall', () => {
  const r = masonryWall(wall({ material: 'silicate_brick', thicknessCm: 12, unit: { l: 250, h: 88, w: 120 } }));
  assert.equal(r.fits, true); near(r.pieces, 15 / (0.26 * 0.098)); assert.equal(r.piecesWithReserve, Math.ceil(15 / (0.26 * 0.098) * 1.05));
});

test('mişardaşı: no size → no count, asks for the size', () => {
  const r = masonryWall(wall({ material: 'misar', thicknessCm: 20, unit: { l: null, h: null, w: null } }));
  assert.equal(r.ok, false); assert.equal(r.piecesWithReserve, null);
  assert.ok(r.errors.some((e) => e.includes('Mişardaşı') && e.includes('ölçü')));
  near(r.netArea, 15); // the wall itself is still known
});

test('mişardaşı 400×200×200 in a 20 cm wall; other sizes change the count', () => {
  const r = masonryWall(wall({ material: 'misar', thicknessCm: 20, unit: { l: 400, h: 200, w: 200 } }));
  assert.equal(r.fits, true); assert.equal(r.rows, 1);
  near(r.pieces, 15 / (0.41 * 0.21)); assert.equal(r.piecesWithReserve, Math.ceil(15 / (0.41 * 0.21) * 1.05)); // 174.2 → 183
  // Checked two ways: by face area and by volume give the same count when the width fits.
  near(r.byArea, r.byVolume!, 1e-9);
  const s = masonryWall(wall({ material: 'misar', thicknessCm: 20, unit: { l: 390, h: 190, w: 190 } }));
  assert.ok(s.pieces! > r.pieces!);
  const wide = masonryWall(wall({ material: 'misar', thicknessCm: 30, unit: { l: 400, h: 200, w: 300 } }));
  assert.equal(wide.fits, true); near(wide.pieces, 15 / (0.41 * 0.21));
});

test('aerated block: changing its size updates the count', () => {
  const a = masonryWall(wall({ material: 'aerated', thicknessCm: 20, unit: { l: 600, h: 200, w: 200 }, jointMm: 3 }));
  const b = masonryWall(wall({ material: 'aerated', thicknessCm: 20, unit: { l: 600, h: 250, w: 200 }, jointMm: 3 }));
  near(a.pieces, 15 / (0.603 * 0.203)); near(b.pieces, 15 / (0.603 * 0.253)); assert.ok(b.pieces! < a.pieces!);
});

test('doors and windows come off the area', () => {
  const r = masonryWall(wall({ openings: [{ kind: 'door', count: 1, width: 0.9, height: 2.1 }, { kind: 'window', count: 2, width: 1.2, height: 1.5 }] }));
  near(r.openingsArea, 5.49); near(r.netArea, 15 - 5.49); near(r.netVolume, (15 - 5.49) * 0.25);
  const big = masonryWall(wall({ openings: [{ kind: 'window', count: 10, width: 2, height: 1 }] }));
  assert.equal(big.ok, false); assert.ok(big.errors[0].includes('böyük'));
});

test('joint thickness changes the count', () => {
  const a = masonryWall(wall({ thicknessCm: 12, jointMm: 10 })), b = masonryWall(wall({ thicknessCm: 12, jointMm: 15 }));
  assert.ok(b.pieces! < a.pieces!); near(b.pieces, 15 / (0.265 * 0.08));
});

test('thickness that does not fit the unit width: warned, choice kept, count by volume', () => {
  const r = masonryWall(wall({ thicknessCm: 20 }));
  assert.equal(r.fits, false); assert.equal(r.rows, null);
  assert.ok(r.warnings.some((w) => w.includes('tam düşmür')));
  near(r.pieces, r.byVolume!); near(r.byVolume, (15 * 0.21) / (0.26 * 0.075 * 0.13));
  const thin = masonryWall(wall({ thicknessCm: 6 }));
  assert.ok(thin.warnings.some((w) => w.includes('nazikdir'))); assert.equal(thin.mortarM3, null);
});

test('several walls add up once each; reserve and price', () => {
  const walls = [wall({ unitPrice: 0.35, mortarPrice: 90 }), wall({ length: 4, openings: [{ kind: 'door', count: 1, width: 0.9, height: 2.1 }], unitPrice: 0.35 }), wall({ material: 'misar', unit: { l: null, h: null, w: null } })];
  const rs = walls.map(masonryWall);
  const t = masonryTotals(walls, rs);
  assert.equal(t.walls, 2); assert.equal(t.incomplete, 1);
  near(t.netArea, 15 + 12 - 1.89);
  assert.equal(t.byMaterial.length, 1); assert.equal(t.byMaterial[0].pieces, rs[0].piecesWithReserve! + rs[1].piecesWithReserve!);
  near(rs[0].unitCost, 1616 * 0.35); near(rs[0].mortarCost, rs[0].mortarM3! * 90);
  near(t.total, rs[0].unitCost! + rs[0].mortarCost! + rs[1].unitCost!);
  const noPrice = masonryWall(wall());
  assert.equal(noPrice.unitCost, null); assert.equal(noPrice.total, null);
  assert.equal(masonryWall(wall({ reservePct: 0 })).piecesWithReserve, 1539);
  assert.equal(masonryWall(wall({ reservePct: 10 })).piecesWithReserve, Math.ceil(1538.4615 * 1.1));
});

test('zero and negative sizes are refused', () => {
  assert.equal(masonryWall(wall({ length: 0 })).ok, false);
  assert.equal(masonryWall(wall({ height: -2 })).ok, false);
  assert.equal(masonryWall(wall({ unit: { l: 250, h: 0, w: 120 } })).ok, false);
  assert.equal(masonryWall(wall({ openings: [{ kind: 'door', count: 1, width: -1, height: 2 }] })).ok, false);
});

/* ---------------------------------------------------------------- plaster */

const pw = (p: Partial<PlasterWall> = {}): PlasterWall => ({ length: 5, height: 3, kind: 'internal', sides: 1, thicknessMm: 15, material: 'gypsum', openings: [], revealDepthCm: null, ...p });

test('15 mm gypsum on 15 m²: 0.225 m³, 202.5 kg, 222.75 kg with 10%, 8 bags of 30 kg, 9 of 25 kg', () => {
  const mix = defaultMix('gypsum');
  const r = plasterWall(pw(), mix);
  near(r.area, 15); near(r.volume, 0.225); near(r.dryKg, 202.5); near(r.dryKgReserve, 222.75);
  const t = mixTotals('gypsum', [r], mix);
  assert.equal(t.bags, 8);
  assert.equal(mixTotals('gypsum', [r], { ...mix, bagKg: 25 }).bags, 9);
});

test('thickness change updates volume and mix', () => {
  const mix = defaultMix('gypsum');
  const r = plasterWall(pw({ thicknessMm: 20 }), mix);
  near(r.volume, 0.3); near(r.dryKg, 270);
});

test('one side vs both sides; openings off each side; reveals once and only when asked', () => {
  const mix = defaultMix('gypsum');
  const door = [{ kind: 'door' as const, count: 1, width: 0.9, height: 2.1 }];
  const one = plasterWall(pw({ openings: door }), mix), two = plasterWall(pw({ openings: door, sides: 2 }), mix);
  near(one.area, 15 - 1.89); near(two.area, 2 * (15 - 1.89));
  const rev = plasterWall(pw({ openings: door, sides: 2, revealDepthCm: 20 }), mix);
  near(rev.revealArea, (2 * 2.1 + 0.9) * 0.2); near(rev.area, 2 * (15 - 1.89) + 1.02);
});

test('internal and external walls kept apart, then together', () => {
  const mix = defaultMix('cement_sand');
  const rs = [plasterWall(pw({ material: 'cement_sand' }), mix), plasterWall(pw({ material: 'cement_sand', kind: 'external', sides: 1, length: 10 }), mix)];
  const inside = mixTotals('cement_sand', [rs[0]], mix), outside = mixTotals('cement_sand', [rs[1]], mix), all = mixTotals('cement_sand', rs, mix);
  near(inside.area, 15); near(outside.area, 30); near(all.area, 45);
  near(all.dryKgReserve, 45 * 15 * 1.7 * 1.1);
  assert.equal(all.bags, Math.ceil(45 * 15 * 1.7 * 1.1 / 25));
});

test('cement-sand on site: ratio and factors drive cement and sand', () => {
  const mix = { ...defaultMix('cement_sand'), mode: 'site' as const };
  const r = plasterWall(pw({ material: 'cement_sand' }), mix);
  const t = mixTotals('cement_sand', [r], mix);
  const dry = 0.225 * 1.1 * 1.3;
  near(t.site!.dryM3, dry); near(t.site!.cementM3, dry / 4); near(t.site!.sandM3, (dry * 3) / 4);
  near(t.site!.cementKg, (dry / 4) * 1300); assert.equal(t.site!.cementBags, Math.ceil(((dry / 4) * 1300) / 40));
  const t4 = mixTotals('cement_sand', [r], { ...mix, ratioSand: 4 });
  assert.ok(t4.site!.cementKg < t.site!.cementKg);
  assert.ok(t.assumptions.some((a) => a.includes('Quru həcm əmsalı 1.3')));
});

test('no price → no cost invented; prices → cost', () => {
  const mix = defaultMix('gypsum');
  const r = plasterWall(pw(), mix);
  const t = mixTotals('gypsum', [r], mix);
  assert.equal(t.cost, null); assert.equal(t.missingPrice, true);
  near(mixTotals('gypsum', [r], { ...mix, price: 12 }).cost, 8 * 12);
  near(mixTotals('gypsum', [r], { ...mix, price: 0.4, priceUnit: 'kg' }).cost, 222.75 * 0.4);
  const site = { ...defaultMix('cement_sand'), mode: 'site' as const, cementPrice: 9, sandPrice: null };
  const ts = mixTotals('cement_sand', [plasterWall(pw({ material: 'cement_sand' }), site)], site);
  assert.equal(ts.missingPrice, true); near(ts.cost, ts.site!.cementBags * 9);
});

test('unknown consumption: no mass and no bags', () => {
  const mix = defaultMix('custom');
  const r = plasterWall(pw({ material: 'custom' }), mix);
  assert.equal(r.dryKg, null);
  const t = mixTotals('custom', [r], mix);
  assert.equal(t.bags, null); assert.equal(t.dryKg, null);
});

test('plaster: bad sizes and openings bigger than the wall are refused', () => {
  const mix = defaultMix('gypsum');
  assert.equal(plasterWall(pw({ length: 0 }), mix).ok, false);
  assert.equal(plasterWall(pw({ thicknessMm: -5 }), mix).ok, false);
  const big = plasterWall(pw({ openings: [{ kind: 'window', count: 8, width: 2, height: 1 }] }), mix);
  assert.equal(big.ok, false); assert.ok(big.errors[0].includes('böyük'));
});
