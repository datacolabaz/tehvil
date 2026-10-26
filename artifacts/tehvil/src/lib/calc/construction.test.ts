import { test } from 'node:test';
import assert from 'node:assert/strict';
import { az, convertRebar, kgPerMetre, parseNum, piecesFor, rebarFacts, timber, timberCost } from './construction';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('Ø12: 0.8889 kg/m, 1 ton ≈ 1 125 m (table 0.888 → 1 126 m), 12 m bar 10.67 kg, ~94 bars per ton', () => {
  const f = rebarFacts(12);
  near(f.kgPerM, 144 / 162);
  near(f.metresPerTon, 1125);
  near(1000 / f.tableKgPerM!, 1126.126, 1e-3);
  near(f.barKg, 10.6667, 1e-4);
  near(f.barsPerTon, 93.75);
});

test('every diameter: formula within 1% of the standard table', () => {
  for (const d of [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32]) {
    const f = rebarFacts(d);
    assert.ok(Math.abs(f.kgPerM - f.tableKgPerM!) / f.tableKgPerM! < 0.01, `Ø${d}`);
  }
});

test('rebar conversions agree both ways', () => {
  const t = convertRebar(16, 2, 'ton')!;
  near(t.kg, 2000);
  near(t.metres, 2000 / kgPerMetre(16));
  near(t.bars, t.metres / 12);
  const m = convertRebar(16, t.metres, 'metr')!;
  near(m.tons, 2);
  const b = convertRebar(16, t.bars, 'eded')!;
  near(b.tons, 2);
  const short = convertRebar(10, 100, 'eded', 11.7)!;
  near(short.metres, 1170);
  assert.equal(convertRebar(12, -1, 'ton'), null);
});

test('timber 3 × 10 cm × 3 m: 0.009 m³ and 0.3 m² per piece', () => {
  const r = timber({ width: 10, thickness: 3, sectionUnit: 'sm', length: 3, lengthUnit: 'm', count: 20 })!;
  near(r.pieceM3, 0.009);
  near(r.pieceM2, 0.3);
  near(r.totalM3, 0.18);
  near(r.totalM2, 6);
  const mm = timber({ width: 100, thickness: 30, sectionUnit: 'mm', length: 3000, lengthUnit: 'mm', count: 1 })!;
  near(mm.pieceM3, 0.009);
  assert.equal(timber({ width: 0, thickness: 3, sectionUnit: 'sm', length: 3, lengthUnit: 'm', count: 1 }), null);
});

test('pieces needed are rounded up; exact amounts are not', () => {
  assert.equal(piecesFor(1, 0.009), 112); // 111.1 → 112
  assert.equal(piecesFor(0.18, 0.009), 20);
  assert.equal(piecesFor(6, 0.3), 20);
  assert.equal(piecesFor(0, 0.3), 0);
});

test('timber cost per m³ and per piece', () => {
  const r = timber({ width: 10, thickness: 5, sectionUnit: 'sm', length: 6, lengthUnit: 'm', count: 10 })!; // 0.03 m³ each
  const byM3 = timberCost(r, 10, 400, 'm3')!;
  near(byM3.perPiece, 12); near(byM3.total, 120);
  const byPiece = timberCost(r, 10, 12, 'piece')!;
  near(byPiece.total, 120); near(byPiece.perM3, 400);
});

test('format and parse', () => {
  assert.equal(az(1125), '1 125,00');
  assert.equal(az(0.009, 3), '0,009');
  assert.equal(parseNum('1 250,5'), 1250.5);
  assert.equal(parseNum(''), null);
  assert.ok(Number.isNaN(parseNum('abc') as number));
});
