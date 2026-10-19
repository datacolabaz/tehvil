/**
 * Homeowner repair estimate. Pure: input + price base → itemised estimate.
 *
 * Every number has a visible origin:
 *  - quantities come from the rooms the person entered (or a stated assumption, e.g. room shape);
 *  - material amounts come from manufacturers' published consumption (NORMS, with links) or,
 *    where we found no published figure, from a general rule that is marked "yoxlanmalı";
 *  - prices come from the price base (low / median / high of real quotes with sources and dates).
 * A line without a price stays in the estimate as "qiymət yoxdur" and is not counted in the total.
 */

export type Tier = 'ekonom' | 'standart' | 'premium';
export type RoomKind = 'living' | 'bed' | 'kitchen' | 'bath' | 'wc' | 'hall' | 'balcony' | 'other';
export type FloorFinish = 'laminate' | 'tile' | 'none';
export type CeilingFinish = 'paint' | 'drywall' | 'none';
export type Condition = 'shell' | 'old' | 'lived';
export type Level = 'kosmetik' | 'standart' | 'kapital';

export interface RoomIn {
  id: string; name: string; kind: RoomKind; area: number;
  length?: number | null; width?: number | null;
  windows: number; floor: FloorFinish; ceiling: CeilingFinish;
}
export interface Scope {
  demolition: boolean; electrical: boolean; plumbing: boolean; plaster: boolean; putty: boolean; paint: boolean;
  screed: boolean; floors: boolean; tiles: boolean; doors: boolean; sanitary: boolean; lighting: boolean; cleanup: boolean;
}
export interface RepairInput {
  version: 1;
  condition: Condition; level: Level; tier: Tier;
  ceilingHeight: number; plasterMm: number; screedMm: number;
  floorNo: number; lift: boolean; doors: number; reservePct: number;
  scope: Scope; rooms: RoomIn[];
}

export interface PriceAgg {
  low: number; median: number; high: number; count: number; verified: boolean; newest: string; stale: boolean; fallback: string | null;
  sources: { id: string; name: string; url: string | null; date: string; price: number; kind: string; note: string }[];
}
export interface PriceItem {
  code: string; name: string; kind: 'material' | 'labor' | 'service'; category: string; unit: string;
  pack?: { size: number; unit: string }; note?: string;
  tiers: Record<Tier, PriceAgg | null>;
}
export interface PriceBaseLike { items: PriceItem[]; generatedAt: string; staleDays: number }

/* ------------------------------------------------------------------ norms */

export interface Norm { id: string; text: string; value: number; source: string; url: string | null; checked: boolean }
/** Consumption figures. `checked` = taken from the manufacturer's published sheet (link). */
export const NORMS = {
  plaster: { id: 'plaster', text: 'Gips suvaq: 8,5 kq/m² hər 10 mm qalınlığa', value: 8.5, source: 'Knauf Rotband texniki məlumatı', url: 'https://knauf.ru/catalog/find-products-and-systems/knauf-rotband.html', checked: true },
  selflevel: { id: 'selflevel', text: 'Özüyayılan döşəmə: 1,5 kq/m² hər 1 mm qalınlığa', value: 1.5, source: 'Ceresit CN 68 texniki məlumatı', url: 'https://datasheets.tdx.henkel.com/CERESIT-CN-68-en_GL.pdf', checked: true },
  adhesive: { id: 'adhesive', text: 'Kafel yapışqanı: 2–7 kq/m² (hesabda 4,5 kq/m² götürülüb; kafelin ölçüsündən və darağın dişindən asılıdır)', value: 4.5, source: 'Ceresit CM 11 texniki məlumatı', url: 'https://datasheets.tdx.henkel.com/CERESIT-CM-11-en_AE.pdf', checked: true },
  groutFloor: { id: 'groutFloor', text: 'Fuqa: 60×60 sm kafel, 3 mm ara — 0,3 kq/m²', value: 0.3, source: 'Ceresit CE 40 texniki məlumatı', url: 'https://datasheets.tdx.henkel.com/CERESIT-CE-40-en_GL.pdf', checked: true },
  groutWall: { id: 'groutWall', text: 'Fuqa: 30×60 sm kafel, 3 mm ara — 0,4 kq/m²', value: 0.4, source: 'Ceresit CE 40 texniki məlumatı', url: 'https://datasheets.tdx.henkel.com/CERESIT-CE-40-en_GL.pdf', checked: true },
  primer: { id: 'primer', text: 'Astar: 0,1–0,5 l/m² (hesabda bir qat üçün 0,2 l/m²)', value: 0.2, source: 'Ceresit CT 17 texniki məlumatı', url: 'https://datasheets.tdx.henkel.com/CERESIT-CT-17-en_GL.pdf', checked: true },
  paint: { id: 'paint', text: 'Su əsaslı boya: hamar səthdə bir qat üçün ~0,12 l/m²', value: 0.12, source: 'Caparol Amphibolin texniki məlumatı', url: 'https://www.kraso.com/wp-content/uploads/2016/09/TI_100_EN-1.pdf', checked: true },
  putty: { id: 'putty', text: 'Finiş şpaklyovka: ~1 kq/m² hər 1 mm, iki qat ~1,5 mm', value: 1.0, source: 'Ümumi göstərici — istifadə edəcəyiniz məhsulun təlimatı ilə yoxlayın', url: null, checked: false },
  screed: { id: 'screed', text: 'Sement-qum styajka qarışığı: ~20 kq/m² hər 10 mm', value: 20, source: 'Ümumi göstərici — məhsulun təlimatı ilə yoxlayın', url: null, checked: false },
  waterproof: { id: 'waterproof', text: 'Hidroizolyasiya mastikası: ~2 kq/m² (iki qat)', value: 2, source: 'Ümumi göstərici — məhsulun təlimatı ilə yoxlayın', url: null, checked: false },
} satisfies Record<string, Norm>;

/** Planning rules that are not material consumption. All are editable assumptions, shown in the result. */
export const RULES = {
  roomShape: 'Otağın uzunluğu və eni verilməyibsə, otaq 1:1,5 nisbətində düzbucaqlı fərz edilir: perimetr ≈ 4,08 × √sahə.',
  window: 'Pəncərə açırımı 1,8 m², qapı açırımı 1,6 m² çıxılır.',
  laminateWaste: 'Laminat üçün kəsim ehtiyatı 7%, altlıq üçün 5%.',
  tileWaste: 'Kafel üçün kəsim ehtiyatı 10%.',
  cable: 'Elektrik kabeli: mənzilin hər m²-nə 2,9 m (Təhvil-in ilkin qaydası — elektrik layihəsi varsa onu əsas götürün).',
  points: 'Rozetka və açar sayı otağın növünə görə: qonaq 6, yataq 5, mətbəx 7, hamam 3, tualet 1, dəhliz 3, eyvan 1, digər 3.',
  plumbing: 'Su nöqtəsi: hamam 5, tualet 2, mətbəx 3; hər nöqtəyə 6 m su borusu və 2,5 m kanalizasiya borusu.',
  spots: 'Asma tavanda hər 2 m²-ə bir spot işıq.',
  apron: 'Mətbəxdə iş səthinin üstünə 2 m² divar kafeli.',
  weights: 'Mərtəbəyə qaldırma çəkisi: kisələrin çəkisi + kafel 20 kq/m² + laminat 8 kq/m².',
};

/* ------------------------------------------------------------------ presets */

export const ROOM_KIND_LABEL: Record<RoomKind, string> = { living: 'Qonaq otağı', bed: 'Yataq otağı', kitchen: 'Mətbəx', bath: 'Hamam', wc: 'Tualet', hall: 'Dəhliz', balcony: 'Eyvan', other: 'Digər' };
export const LEVEL_LABEL: Record<Level, string> = { kosmetik: 'Kosmetik', standart: 'Standart', kapital: 'Kapital (tam)' };
export const TIER_LABEL: Record<Tier, string> = { ekonom: 'Ekonom', standart: 'Standart', premium: 'Premium' };
export const CONDITION_LABEL: Record<Condition, string> = { shell: 'Yeni tikili, təmirsiz (qara karkas)', old: 'Köhnə təmirli — sökülməlidir', lived: 'Təmirli, yenilənməsi lazımdır' };

export function defaultScope(level: Level, condition: Condition): Scope {
  const full = level === 'kapital' || condition === 'shell';
  return {
    demolition: condition === 'old' && level !== 'kosmetik',
    electrical: full, plumbing: full,
    plaster: condition === 'shell' || (condition === 'old' && level === 'kapital'),
    putty: true, paint: true,
    screed: condition === 'shell' || (condition === 'old' && level === 'kapital'),
    floors: level !== 'kosmetik' || condition === 'shell',
    tiles: level !== 'kosmetik' || condition === 'shell',
    doors: full, sanitary: full, lighting: level !== 'kosmetik', cleanup: true,
  };
}
export const defaultFloor = (k: RoomKind): FloorFinish => (k === 'bath' || k === 'wc' || k === 'kitchen' || k === 'hall' || k === 'balcony' ? 'tile' : 'laminate');
export const defaultWindows = (k: RoomKind) => (k === 'living' || k === 'bed' ? 1 : k === 'kitchen' || k === 'balcony' ? 1 : 0);
export const defaultReserve = (level: Level, condition: Condition) => (condition === 'old' || level === 'kapital' ? 15 : level === 'standart' ? 10 : 8);

/* ------------------------------------------------------------------ output */

export interface Money { low: number; typical: number; high: number }
export interface Part {
  code: string; label: string; kind: 'material' | 'labor' | 'service';
  qty: number; unit: string; how: string;
  price: { low: number; median: number; high: number; verified: boolean; stale: boolean; fallback: string | null; count: number; newest: string } | null;
  cost: Money | null;
}
export interface Line { id: string; section: string; name: string; zone: string; qty: number; unit: string; formula: string; parts: Part[]; cost: Money; missing: number; norms: string[] }
export interface Section { id: string; title: string; lines: Line[]; cost: Money }
export interface RepairResult {
  area: number; sections: Section[];
  totals: Money & { material: Money; labor: Money; service: Money; reserve: Money; reservePct: number; perM2: Money };
  missing: { line: string; part: string }[];
  preliminaryShare: number; staleCount: number; fallbackCount: number;
  norms: Norm[]; rules: string[]; warnings: string[];
  benchmark: { perM2: number; total: number; source: string; url: string; date: string; note: string } | null;
  priceDate: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const zero = (): Money => ({ low: 0, typical: 0, high: 0 });
const add = (a: Money, b: Money | null) => (b ? { low: a.low + b.low, typical: a.typical + b.typical, high: a.high + b.high } : a);
const num = (n: number) => String(r2(n)).replace('.', ',');

export function roomGeometry(r: RoomIn, h: number) {
  const exact = !!(r.length && r.width && r.length > 0 && r.width > 0);
  const area = exact ? r2(r.length! * r.width!) : r.area;
  const perimeter = exact ? 2 * (r.length! + r.width!) : 4.08 * Math.sqrt(Math.max(area, 0));
  const doorOpen = 1.6; // one door opening per room
  const openings = r.windows * 1.8 + doorOpen;
  const walls = Math.max(0, perimeter * h - openings);
  return { area, perimeter: r2(perimeter), walls: r2(walls), exact };
}

/** Builds the estimate. `prices` may be missing items; those parts get no price. */
export function buildEstimate(input: RepairInput, base: PriceBaseLike, today = new Date()): RepairResult {
  const byCode = new Map(base.items.map((i) => [i.code, i]));
  const tier = input.tier;
  const h = input.ceilingHeight > 1.8 && input.ceilingHeight < 6 ? input.ceilingHeight : 2.7;
  const rooms = input.rooms.filter((r) => r.area > 0 || (r.length && r.width));
  const geo = new Map(rooms.map((r) => [r.id, roomGeometry(r, h)]));
  const g = (r: RoomIn) => geo.get(r.id)!;
  const sum = (rs: RoomIn[], f: (x: ReturnType<typeof roomGeometry>) => number) => r2(rs.reduce((s, r) => s + f(g(r)), 0));
  const names = (rs: RoomIn[]) => rs.map((r) => r.name).join(', ') || '—';
  const area = sum(rooms, (x) => x.area);
  const wet = rooms.filter((r) => r.kind === 'bath' || r.kind === 'wc');
  const dryWallRooms = rooms.filter((r) => r.kind !== 'bath' && r.kind !== 'wc');
  const s = input.scope;
  const usedNorms = new Set<string>();
  let lift = 0; // kg to carry up
  const warnings: string[] = [];

  const priceOf = (code: string) => {
    const item = byCode.get(code);
    const agg = item?.tiers[tier] ?? null;
    return { item, agg };
  };
  const part = (code: string, qty: number, how: string, labelOverride?: string): Part => {
    const { item, agg } = priceOf(code);
    const q = r2(qty);
    const price = agg ? { low: agg.low, median: agg.median, high: agg.high, verified: agg.verified, stale: agg.stale, fallback: agg.fallback, count: agg.count, newest: agg.newest } : null;
    return {
      code, label: labelOverride ?? item?.name ?? code, kind: item?.kind ?? 'material', qty: q, unit: item?.unit ?? '', how,
      price, cost: price ? { low: r2(q * price.low), typical: r2(q * price.median), high: r2(q * price.high) } : null,
    };
  };
  /** A packed material: amount from a norm, rounded up to whole packs; falls back to a per-m² price. */
  const packed = (code: string, fallbackCode: string | null, amount: number, areaForFallback: number, how: string): Part => {
    const { item, agg } = priceOf(code);
    const size = item?.pack?.size ?? 25;
    const packs = Math.max(1, Math.ceil(amount / size));
    if (item?.pack?.unit === 'kq') lift += packs * size;
    if (agg || !fallbackCode) return part(code, packs, `${how} → ${num(amount)} ${item?.pack?.unit ?? ''} → ${packs} ${item?.unit ?? 'ədəd'} (${size} ${item?.pack?.unit ?? ''})`);
    const fb = priceOf(fallbackCode);
    if (fb.agg) return part(fallbackCode, areaForFallback, `Kisə qiyməti bazada yoxdur — m² üzrə ilkin qiymət götürülüb (${num(packs)} ${item?.unit ?? ''} lazımdır: ${how})`);
    return part(code, packs, `${how} → ${num(amount)} ${item?.pack?.unit ?? ''} → ${packs} ${item?.unit ?? ''}`);
  };

  const sections: Section[] = [];
  let lineNo = 0;
  const section = (id: string, title: string, build: () => Omit<Line, 'id' | 'section' | 'cost' | 'missing'>[]) => {
    const lines = build().filter((l) => l.qty > 0).map((l) => {
      const cost = l.parts.reduce((m, p) => add(m, p.cost), zero());
      return { ...l, id: `l${++lineNo}`, section: id, cost, missing: l.parts.filter((p) => !p.price).length };
    });
    if (lines.length) sections.push({ id, title, lines, cost: lines.reduce((m, l) => add(m, l.cost), zero()) });
  };
  const norm = (n: Norm) => { usedNorms.add(n.id); return n.id; };

  /* 1. Söküntü */
  if (s.demolition) section('demo', 'Söküntü işləri', () => {
    const tileDemo = sum(wet, (x) => x.walls + x.area);
    return [
      { name: 'Köhnə döşəmə örtüyünün sökülməsi', zone: names(rooms.filter((r) => r.kind !== 'bath' && r.kind !== 'wc')), qty: sum(rooms.filter((r) => r.kind !== 'bath' && r.kind !== 'wc'), (x) => x.area), unit: 'm²', formula: 'Otaqların döşəmə sahəsi', norms: [],
        parts: [part('lab.demo.floor', sum(rooms.filter((r) => r.kind !== 'bath' && r.kind !== 'wc'), (x) => x.area), 'döşəmə sahəsi')] },
      { name: 'Köhnə kafelin sökülməsi (hamam, tualet)', zone: names(wet), qty: tileDemo, unit: 'm²', formula: 'Hamam və tualetin divar + döşəmə sahəsi', norms: [],
        parts: [part('lab.demo.tile', tileDemo, 'divar + döşəmə')] },
    ];
  });

  /* 2. Elektrik */
  if (s.electrical) section('el', 'Elektrik işləri', () => {
    const cable = Math.round(area * 2.9);
    const POINTS: Record<RoomKind, number> = { living: 6, bed: 5, kitchen: 7, bath: 3, wc: 1, hall: 3, balcony: 1, other: 3 };
    const points = rooms.reduce((t, r) => t + POINTS[r.kind], 0);
    return [
      { name: 'Elektrik xətlərinin çəkilməsi', zone: 'Bütün mənzil', qty: cable, unit: 'm', formula: `${num(area)} m² × 2,9 m/m²`, norms: [],
        parts: [part('mat.cable', cable, 'kabel'), part('lab.cable', cable, 'çəkilmə')] },
      { name: 'Rozetka və açarlar', zone: 'Otaqlar üzrə', qty: points, unit: 'ədəd', formula: 'Otağın növünə görə say', norms: [],
        parts: [part('mat.socket', points, 'mexanizm + çərçivə'), part('lab.socket', points, 'quraşdırma')] },
      { name: 'Elektrik paneli və avtomatlar', zone: 'Dəhliz', qty: 1, unit: 'komplekt', formula: '1 panel', norms: [],
        parts: [part('mat.panel', 1, 'panel'), part('lab.panel', 1, 'yığılma')] },
    ];
  });

  /* 3. Santexnika */
  if (s.plumbing) section('pl', 'Santexnika işləri', () => {
    const pts = rooms.reduce((t, r) => t + (r.kind === 'bath' ? 5 : r.kind === 'wc' ? 2 : r.kind === 'kitchen' ? 3 : 0), 0);
    if (!pts) return [];
    return [
      { name: 'Su xətləri (isti və soyuq)', zone: names(rooms.filter((r) => r.kind === 'bath' || r.kind === 'wc' || r.kind === 'kitchen')), qty: r2(pts * 6), unit: 'm', formula: `${pts} su nöqtəsi × 6 m`, norms: [],
        parts: [part('mat.pipe.ppr', pts * 6, 'boru + fitinq'), part('lab.pipe.ppr', pts * 6, 'çəkilmə')] },
      { name: 'Kanalizasiya xətləri', zone: names(rooms.filter((r) => r.kind === 'bath' || r.kind === 'wc' || r.kind === 'kitchen')), qty: r2(pts * 2.5), unit: 'm', formula: `${pts} nöqtə × 2,5 m`, norms: [],
        parts: [part('mat.pipe.sewer', pts * 2.5, 'boru + fitinq'), part('lab.pipe.sewer', pts * 2.5, 'çəkilmə')] },
    ];
  });

  /* 4. Divarlar və tavan hazırlığı */
  const paintRooms = rooms.filter((r) => r.kind !== 'bath' && r.kind !== 'wc');
  const paintWalls = sum(paintRooms, (x) => x.walls);
  const paintCeil = sum(rooms.filter((r) => r.ceiling !== 'none' && r.kind !== 'bath' && r.kind !== 'wc'), (x) => x.area);
  if (s.plaster || s.putty) section('walls', 'Divarların hazırlanması', () => {
    const out: Omit<Line, 'id' | 'section' | 'cost' | 'missing'>[] = [];
    if (s.plaster) {
      const wallsAll = sum(rooms, (x) => x.walls);
      const mm = Math.max(5, Math.min(50, input.plasterMm || 15));
      const kg = wallsAll * NORMS.plaster.value * (mm / 10);
      out.push({ name: `Divarların suvağı (gips, orta qalınlıq ${mm} mm)`, zone: 'Bütün otaqlar', qty: wallsAll, unit: 'm²', formula: 'Divarların sahəsi (perimetr × hündürlük − açırımlar)', norms: [norm(NORMS.plaster)],
        parts: [packed('mat.plaster.bag', 'mat.plaster.m2', kg, wallsAll, `${num(wallsAll)} m² × 8,5 kq × ${num(mm / 10)}`), part('lab.plaster', wallsAll, 'suvaq')] });
    }
    if (s.putty) {
      const surf = r2(paintWalls + paintCeil);
      const kg = surf * NORMS.putty.value * 1.5;
      out.push({ name: 'Şpaklyovka (divar və tavan, 2 qat)', zone: names(paintRooms), qty: surf, unit: 'm²', formula: 'Rənglənəcək divar + tavan sahəsi', norms: [norm(NORMS.putty)],
        parts: [packed('mat.putty.bag', 'mat.putty.m2', kg, surf, `${num(surf)} m² × 1,5 kq`), part('lab.putty', surf, 'şpaklyovka')] });
    }
    const primerArea = r2((s.plaster ? sum(rooms, (x) => x.walls) : 0) + (s.putty ? paintWalls + paintCeil : 0) + (s.screed ? area : 0));
    if (primerArea > 0) {
      const l = primerArea * NORMS.primer.value;
      out.push({ name: 'Astar (hər hazırlıq qatından əvvəl)', zone: 'Bütün səthlər', qty: primerArea, unit: 'm²', formula: 'Suvaq, şpaklyovka və döşəmədən əvvəl astarlanan sahə', norms: [norm(NORMS.primer)],
        parts: [packed('mat.primer', null, l, primerArea, `${num(primerArea)} m² × 0,2 l`)] });
    }
    return out;
  });

  /* 5. Rəngləmə */
  if (s.paint) section('paint', 'Rəngləmə', () => {
    const surf = r2(paintWalls + paintCeil);
    const l = surf * NORMS.paint.value * 2;
    return [{ name: 'Divar və tavanların rənglənməsi, 2 qat', zone: names(paintRooms), qty: surf, unit: 'm²', formula: 'Divarlar + tavan (hamam və tualet kafeldir)', norms: [norm(NORMS.paint)],
      parts: [packed('mat.paint.can', 'mat.paint.m2', l, surf, `${num(surf)} m² × 0,12 l × 2 qat`), part('lab.paint', surf, '2 qat')] }];
  });

  /* 6. Asma tavan */
  const dry = rooms.filter((r) => r.ceiling === 'drywall');
  if (dry.length) section('ceiling', 'Gipskarton asma tavan', () => [{
    name: 'Gipskarton asma tavan', zone: names(dry), qty: sum(dry, (x) => x.area), unit: 'm²', formula: 'Seçilmiş otaqların tavan sahəsi', norms: [],
    parts: [part('mat.ceiling.m2', sum(dry, (x) => x.area), 'profil + lövhə + bərkidici'), part('lab.ceiling', sum(dry, (x) => x.area), 'quraşdırma')],
  }]);

  /* 7. Döşəmə */
  section('floor', 'Döşəmə işləri', () => {
    const out: Omit<Line, 'id' | 'section' | 'cost' | 'missing'>[] = [];
    if (s.screed) {
      if (input.condition === 'shell') {
        const mm = Math.max(20, Math.min(100, input.screedMm || 50));
        const kg = area * NORMS.screed.value * (mm / 10);
        out.push({ name: `Sement-qum styajka (${mm} mm)`, zone: 'Bütün mənzil', qty: area, unit: 'm²', formula: 'Döşəmə sahəsi', norms: [norm(NORMS.screed)],
          parts: [packed('mat.screed.bag', 'mat.screed.m2', kg, area, `${num(area)} m² × 20 kq × ${num(mm / 10)}`), part('lab.screed', area, 'styajka')] });
      } else {
        const kg = area * NORMS.selflevel.value * 5;
        out.push({ name: 'Özüyayılan döşəmə ilə tarazlama (5 mm)', zone: 'Bütün mənzil', qty: area, unit: 'm²', formula: 'Döşəmə sahəsi', norms: [norm(NORMS.selflevel)],
          parts: [packed('mat.selflevel.bag', null, kg, area, `${num(area)} m² × 1,5 kq × 5 mm`), part('lab.selflevel', area, 'tökmə')] });
      }
    }
    if (s.floors) {
      const lam = rooms.filter((r) => r.floor === 'laminate');
      const lamArea = sum(lam, (x) => x.area);
      if (lamArea > 0) {
        lift += lamArea * 1.07 * 8;
        out.push({ name: 'Laminat', zone: names(lam), qty: lamArea, unit: 'm²', formula: 'Otaqların sahəsi + 7% kəsim', norms: [],
          parts: [part('mat.laminate', lamArea * 1.07, `${num(lamArea)} m² + 7%`), part('mat.underlay', lamArea * 1.05, `${num(lamArea)} m² + 5%`), part('lab.laminate', lamArea, 'döşənmə')] });
        const sk = r2(Math.max(0, sum(lam, (x) => x.perimeter) - lam.length * 0.9) * 1.05);
        out.push({ name: 'Plintus', zone: names(lam), qty: sk, unit: 'm', formula: 'Perimetr − qapı yerləri (0,9 m) + 5%', norms: [],
          parts: [part('mat.skirting', sk, 'plintus'), part('lab.skirting', sk, 'vurulma')] });
      }
    }
    return out;
  });

  /* 8. Kafel */
  if (s.tiles) section('tile', 'Kafel və hidroizolyasiya', () => {
    const out: Omit<Line, 'id' | 'section' | 'cost' | 'missing'>[] = [];
    const floorTile = rooms.filter((r) => r.floor === 'tile');
    const fArea = sum(floorTile, (x) => x.area);
    const kitchen = rooms.filter((r) => r.kind === 'kitchen');
    const wArea = r2(sum(wet, (x) => x.walls) + kitchen.length * 2);
    if (wet.length) {
      const wp = r2(sum(wet, (x) => x.area + x.perimeter * 0.2));
      out.push({ name: 'Hidroizolyasiya (hamam, tualet: döşəmə + divarın 20 sm-i)', zone: names(wet), qty: wp, unit: 'm²', formula: 'Döşəmə + perimetr × 0,2 m', norms: [norm(NORMS.waterproof)],
        parts: [packed('mat.waterproof', null, wp * NORMS.waterproof.value, wp, `${num(wp)} m² × 2 kq`), part('lab.waterproof', wp, 'iki qat')] });
    }
    if (fArea > 0) {
      lift += fArea * 1.1 * 20;
      out.push({ name: 'Döşəmə kafeli / metlax', zone: names(floorTile), qty: fArea, unit: 'm²', formula: 'Otaqların sahəsi + 10% kəsim', norms: [norm(NORMS.adhesive), norm(NORMS.groutFloor)],
        parts: [part('mat.tile.floor', fArea * 1.1, `${num(fArea)} m² + 10%`), packed('mat.tile.adhesive', null, fArea * NORMS.adhesive.value, fArea, `${num(fArea)} m² × 4,5 kq`),
          packed('mat.grout', null, fArea * NORMS.groutFloor.value, fArea, `${num(fArea)} m² × 0,3 kq`), part('lab.tile.floor', fArea, 'döşənmə')] });
    }
    if (wArea > 0) {
      lift += wArea * 1.1 * 20;
      out.push({ name: 'Divar kafeli (hamam/tualet tam hündürlük, mətbəx önlüyü)', zone: names([...wet, ...kitchen]), qty: wArea, unit: 'm²', formula: 'Hamam və tualet divarları + mətbəxdə 2 m², +10% kəsim', norms: [norm(NORMS.adhesive), norm(NORMS.groutWall)],
        parts: [part('mat.tile.wall', wArea * 1.1, `${num(wArea)} m² + 10%`), packed('mat.tile.adhesive', null, wArea * NORMS.adhesive.value, wArea, `${num(wArea)} m² × 4,5 kq`),
          packed('mat.grout', null, wArea * NORMS.groutWall.value, wArea, `${num(wArea)} m² × 0,4 kq`), part('lab.tile.wall', wArea, 'vurulma')] });
    }
    return out;
  });

  /* 9. Qapılar */
  if (s.doors && input.doors > 0) section('doors', 'Daxili qapılar', () => [{
    name: 'Daxili qapı (komplekt) və quraşdırma', zone: 'Bütün mənzil', qty: input.doors, unit: 'ədəd', formula: 'Daxil etdiyiniz qapı sayı', norms: [],
    parts: [part('mat.door', input.doors, 'qapı, çərçivə, furnitura'), part('lab.door', input.doors, 'quraşdırma')],
  }]);

  /* 10. Sanitar */
  if (s.sanitary && wet.length) section('san', 'Sanitar avadanlıq', () => {
    const baths = rooms.filter((r) => r.kind === 'bath').length;
    return [
      { name: 'Unitaz', zone: names(wet), qty: wet.length, unit: 'ədəd', formula: 'Hər hamam və tualetə bir', norms: [], parts: [part('mat.toilet', wet.length, ''), part('lab.toilet', wet.length, '')] },
      { name: 'Lavabo və smesitel', zone: names(wet), qty: wet.length, unit: 'komplekt', formula: 'Hər hamam və tualetə bir', norms: [], parts: [part('mat.sink', wet.length, ''), part('lab.sink', wet.length, '')] },
      ...(baths ? [{ name: 'Vanna və ya duş', zone: names(rooms.filter((r) => r.kind === 'bath')), qty: baths, unit: 'ədəd', formula: 'Hər hamama bir', norms: [], parts: [part('mat.bath', baths, ''), part('lab.bath', baths, '')] }] : []),
    ];
  });

  /* 11. İşıqlandırma */
  if (s.lighting) section('light', 'İşıqlandırma', () => {
    const spots = Math.round(sum(dry, (x) => x.area) / 2);
    const chand = rooms.filter((r) => r.kind === 'living' || r.kind === 'bed').length;
    return [
      ...(spots ? [{ name: 'Spot işıqlar (asma tavanda)', zone: names(dry), qty: spots, unit: 'ədəd', formula: 'Hər 2 m² asma tavana 1', norms: [], parts: [part('mat.spot', spots, ''), part('lab.spot', spots, '')] }] : []),
      ...(chand ? [{ name: 'Çilçıraq quraşdırılması (çilçıraq daxil deyil)', zone: names(rooms.filter((r) => r.kind === 'living' || r.kind === 'bed')), qty: chand, unit: 'ədəd', formula: 'Qonaq və yataq otaqlarına bir', norms: [], parts: [part('lab.chandelier', chand, '')] }] : []),
    ];
  });

  /* 12. Xidmətlər */
  if (s.cleanup) section('svc', 'Daşınma, tullantı və təmizlik', () => {
    const out: Omit<Line, 'id' | 'section' | 'cost' | 'missing'>[] = [];
    if (s.demolition || input.condition !== 'lived') out.push({ name: 'Tikinti tullantısının çıxarılması', zone: 'Obyekt', qty: area, unit: 'm²', formula: 'Mənzilin sahəsi + bir maşın sifarişi', norms: [],
      parts: [part('svc.debris', area, 'sahə üzrə'), part('svc.debris.base', 1, 'maşın')] });
    if (!input.lift && input.floorNo > 1 && lift > 0) {
      const tf = r2((lift / 1000) * (input.floorNo - 1));
      out.push({ name: `Materialın ${input.floorNo}-cü mərtəbəyə qaldırılması (lift yoxdur)`, zone: 'Obyekt', qty: tf, unit: 'ton·mərtəbə', formula: `${num(lift / 1000)} ton × ${input.floorNo - 1} mərtəbə`, norms: [],
        parts: [part('svc.lift', tf, 'çəki × mərtəbə')] });
    }
    out.push({ name: 'Yekun təmizlik', zone: 'Bütün mənzil', qty: area, unit: 'm²', formula: 'Mənzilin sahəsi', norms: [], parts: [part('svc.cleaning', area, '')] });
    return out;
  });

  /* totals */
  const material = zero(), labor = zero(), service = zero();
  let prelimTypical = 0, pricedTypical = 0, stale = 0, fallback = 0;
  const missing: { line: string; part: string }[] = [];
  const byKind = { material, labor, service } as Record<string, Money>;
  for (const sec of sections) for (const l of sec.lines) for (const p of l.parts) {
    if (!p.cost || !p.price) { missing.push({ line: l.name, part: p.label }); continue; }
    const m = byKind[p.kind]; m.low += p.cost.low; m.typical += p.cost.typical; m.high += p.cost.high;
    pricedTypical += p.cost.typical;
    if (!p.price.verified) prelimTypical += p.cost.typical;
    if (p.price.stale) stale++;
    if (p.price.fallback) fallback++;
  }
  const sub = add(add(material, labor), service);
  const pct = Math.max(0, Math.min(40, input.reservePct));
  const reserve = { low: r2(sub.low * pct / 100), typical: r2(sub.typical * pct / 100), high: r2(sub.high * pct / 100) };
  const total = add(sub, reserve);
  const rnd = (m: Money) => ({ low: Math.round(m.low), typical: Math.round(m.typical), high: Math.round(m.high) });
  if (rooms.some((r) => !geo.get(r.id)!.exact)) warnings.push('Bəzi otaqların uzunluğu və eni verilməyib — divar sahəsi otağın forması fərz edilərək hesablanıb. Ölçüləri yazsanız, smeta dəqiqləşər.');
  if (missing.length) warnings.push(`${missing.length} mövqe üçün bazada qiymət yoxdur — onlar cəmə daxil edilməyib. Smeta natamamdır.`);
  if (pricedTypical > 0 && prelimTypical / pricedTypical > 0.5) warnings.push('Cəmin yarıdan çoxu Təhvil-in yoxlanmamış ilkin qiymətlərinə əsaslanır. Təchizatçı və podratçı qiymətləri ilə yoxlayın.');
  if (fallback) warnings.push(`${fallback} mövqedə seçdiyiniz səviyyə (${TIER_LABEL[tier]}) üçün ayrıca qiymət yoxdur — başqa səviyyənin qiyməti götürülüb.`);

  const BENCH: Record<Tier, number> = { ekonom: 300, standart: 400, premium: 550 };
  const benchmark = input.level === 'kapital' || input.condition === 'shell'
    ? { perM2: BENCH[tier], total: Math.round(BENCH[tier] * area), source: 'CRM İnşaat Pro — açıq qiymət səhifəsi', url: 'https://www.crminsaatpro.com/qiymetler/', date: '2026-09-25',
      note: 'Bir Bakı şirkətinin saytında elan etdiyi tam təmir paket qiyməti (1 m² üçün). Materialların daxil olub-olmadığı səhifədə ayrıca göstərilməyib; yalnız müqayisə üçündür.' }
    : null;

  return {
    area,
    sections: sections.map((sec) => ({ ...sec, cost: rnd(sec.cost) })),
    totals: { ...rnd(total), material: rnd(material), labor: rnd(labor), service: rnd(service), reserve: rnd(reserve), reservePct: pct,
      perM2: area > 0 ? { low: Math.round(total.low / area), typical: Math.round(total.typical / area), high: Math.round(total.high / area) } : zero() },
    missing, preliminaryShare: pricedTypical > 0 ? Math.round((prelimTypical / pricedTypical) * 100) : 0, staleCount: stale, fallbackCount: fallback,
    norms: Object.values(NORMS).filter((n) => usedNorms.has(n.id)),
    rules: Object.values(RULES), warnings, benchmark,
    priceDate: base.generatedAt.slice(0, 10) || today.toISOString().slice(0, 10),
  };
}

let rid = 0;
export const newRoom = (kind: RoomKind, area: number, name?: string): RoomIn => ({
  id: `r${Date.now().toString(36)}${(rid++).toString(36)}`, name: name ?? ROOM_KIND_LABEL[kind], kind, area,
  length: null, width: null, windows: defaultWindows(kind), floor: defaultFloor(kind), ceiling: 'paint',
});

/** Typical Baku apartment layouts to start from (areas are editable). */
export function roomsFor(rooms: number, total: number): RoomIn[] {
  const t = Math.max(20, total);
  const plan: [RoomKind, number][] = rooms <= 1 ? [['living', 0.45], ['kitchen', 0.2], ['bath', 0.1], ['hall', 0.15], ['balcony', 0.1]]
    : rooms === 2 ? [['living', 0.3], ['bed', 0.22], ['kitchen', 0.16], ['bath', 0.08], ['hall', 0.14], ['balcony', 0.1]]
    : rooms === 3 ? [['living', 0.26], ['bed', 0.18], ['bed', 0.15], ['kitchen', 0.13], ['bath', 0.06], ['wc', 0.03], ['hall', 0.12], ['balcony', 0.07]]
    : [['living', 0.24], ['bed', 0.15], ['bed', 0.13], ['bed', 0.12], ['kitchen', 0.11], ['bath', 0.06], ['wc', 0.03], ['hall', 0.11], ['balcony', 0.05]];
  let bed = 0;
  return plan.map(([k, f]) => newRoom(k, r2(t * f), k === 'bed' ? `Yataq otağı ${++bed}` : undefined));
}

export function defaultInput(rooms = 2, area = 70): RepairInput {
  const level: Level = 'kapital', condition: Condition = 'shell';
  return { version: 1, condition, level, tier: 'standart', ceilingHeight: 2.8, plasterMm: 15, screedMm: 50, floorNo: 5, lift: true, doors: Math.max(1, rooms + 1), reservePct: defaultReserve(level, condition), scope: defaultScope(level, condition), rooms: roomsFor(rooms, area) };
}
