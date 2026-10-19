/**
 * Construction estimate from an architect's project.
 *
 * Quantities come from measurements the person confirms (typed, or applied from the PDF text),
 * through formulas that are shown on every line. Unit prices come only from the person or an
 * uploaded price table — the app has no price base and never invents a price. A line without
 * a price stays "qiymət yoxdur" and the total says how many such lines remain.
 */
/** Azerbaijani number format: 1 234 567,5 (space for thousands, comma for decimals). */
export function fmtNum(n: number, maxDigits = 2): string {
  const neg = n < 0; const v = Math.abs(n);
  const [int, frac] = (Math.round(v * 10 ** maxDigits) / 10 ** maxDigits).toFixed(maxDigits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const f = (frac ?? '').replace(/0+$/, '');
  return `${neg ? '−' : ''}${grouped}${f ? `,${f}` : ''}`;
}

export type Level = 'ekonom' | 'orta' | 'premium';
export const LEVELS: Level[] = ['ekonom', 'orta', 'premium'];
export const LEVEL_LABEL: Record<Level, string> = { ekonom: 'İqtisadi', orta: 'Orta', premium: 'Premium' };

export const SECTIONS = [
  'Torpaq işləri və bünövrə', 'Daşıyıcı konstruksiya', 'Divarlar və arakəsmələr', 'Dam və hidroizolyasiya', 'Elektrik işləri', 'Su və kanalizasiya',
  'İstilik və havalandırma', 'Suvaq, boya və digər tamamlama işləri', 'Döşəmə və üzlük', 'Qapı və pəncərələr', 'Materialların daşınması və digər əlavə xərclər',
  'İşçilik', 'Layihədə olmayan və ayrıca qiymətləndirilməli işlər',
] as const;
export const EXTRA_SECTION = 10; // index of "daşınma və əlavə xərclər"
export const SEPARATE_SECTION = 12; // never part of the construction budget

export interface Measures {
  totalArea: number | null; floors: number | null; floorHeight: number | null; footprint: number | null; extPerimeter: number | null; intWallLength: number | null;
  windowsArea: number | null; windowsCount: number | null; extDoors: number | null; intDoors: number | null; roofArea: number | null; bathrooms: number | null;
  foundationWidth: number | null; foundationDepth: number | null; slabThickness: number | null;
  roofType: '' | 'flat' | 'pitched'; foundationType: '' | 'strip' | 'slab' | 'pile';
}
export type MeasureKey = keyof Omit<Measures, 'roofType' | 'foundationType'>;
export const MEASURE_LABEL: Record<MeasureKey, [string, string]> = {
  totalArea: ['Ümumi sahə', 'm²'], floors: ['Mərtəbə sayı', ''], floorHeight: ['Mərtəbə hündürlüyü', 'm'], footprint: ['Bina izi (1-ci mərtəbənin sahəsi)', 'm²'],
  extPerimeter: ['Xarici divarların perimetri', 'm'], intWallLength: ['Daxili arakəsmələrin uzunluğu (bütün mərtəbələr)', 'm'], windowsArea: ['Pəncərələrin ümumi sahəsi', 'm²'],
  windowsCount: ['Pəncərə sayı', 'ədəd'], extDoors: ['Xarici qapılar', 'ədəd'], intDoors: ['Daxili qapılar', 'ədəd'], roofArea: ['Dam sahəsi', 'm²'], bathrooms: ['Sanitar qovşaqlar', 'ədəd'],
  foundationWidth: ['Lent bünövrənin eni', 'm'], foundationDepth: ['Bünövrənin dərinliyi', 'm'], slabThickness: ['Plitə bünövrənin qalınlığı', 'm'],
};
export const emptyMeasures = (): Measures => ({ totalArea: null, floors: null, floorHeight: null, footprint: null, extPerimeter: null, intWallLength: null, windowsArea: null, windowsCount: null, extDoors: null, intDoors: null, roofArea: null, bathrooms: null, foundationWidth: null, foundationDepth: null, slabThickness: null, roofType: '', foundationType: '' });

export interface Price { material: number | null; labor: number | null; source: string; date: string }
export interface Line {
  id: string; section: number; key?: string; name: string; unit: string;
  /** Typed or imported quantity; for template lines null means "use the formula". */
  qty: number | null; qtySource: 'formula' | 'user' | 'table';
  note?: string; prices: Partial<Record<Level, Price>>;
}
export interface Qty { value: number | null; how: string }

const r2 = (v: number) => Math.round(v * 100) / 100;
const need = (m: Measures, keys: MeasureKey[]) => keys.filter(k => !(Number(m[k]) > 0)).map(k => MEASURE_LABEL[k][0].toLowerCase());
const q = (m: Measures, keys: MeasureKey[], f: () => number, how: string): Qty => {
  const miss = need(m, keys);
  return miss.length ? { value: null, how: `Ölçü çatışmır: ${miss.join(', ')}` } : { value: r2(f()), how };
};
const extWall = (m: Measures) => m.extPerimeter! * m.floorHeight! * m.floors! - (m.windowsArea ?? 0);

/** Template lines: name, unit and the formula from confirmed measurements. */
export const TEMPLATE: { key: string; section: number; name: string; unit: string; qty: (m: Measures) => Qty }[] = [
  { key: 'dig', section: 0, name: 'Torpaq qazıntısı (bünövrə altında)', unit: 'm³', qty: m => m.foundationType === 'strip' ? q(m, ['extPerimeter', 'foundationWidth', 'foundationDepth'], () => m.extPerimeter! * m.foundationWidth! * m.foundationDepth!, 'Xarici perimetr × en × dərinlik (yalnız xarici divarların altı)')
    : m.foundationType === 'slab' ? q(m, ['footprint', 'foundationDepth'], () => m.footprint! * m.foundationDepth!, 'Bina izi × dərinlik') : { value: null, how: m.foundationType === 'pile' ? 'Svay bünövrə — konstruktiv layihədən ayrıca hesablanmalıdır' : 'Bünövrə növünü seçin' } },
  { key: 'concrete', section: 0, name: 'Bünövrə betonu', unit: 'm³', qty: m => m.foundationType === 'strip' ? q(m, ['extPerimeter', 'foundationWidth', 'foundationDepth'], () => m.extPerimeter! * m.foundationWidth! * m.foundationDepth!, 'Xarici perimetr × en × dərinlik')
    : m.foundationType === 'slab' ? q(m, ['footprint', 'slabThickness'], () => m.footprint! * m.slabThickness!, 'Bina izi × plitənin qalınlığı') : { value: null, how: m.foundationType === 'pile' ? 'Svay bünövrə — konstruktiv layihədən ayrıca' : 'Bünövrə növünü seçin' } },
  { key: 'fwp', section: 0, name: 'Bünövrənin hidroizolyasiyası', unit: 'm²', qty: m => m.foundationType === 'strip' ? q(m, ['extPerimeter', 'foundationDepth'], () => m.extPerimeter! * m.foundationDepth!, 'Xarici perimetr × dərinlik (yalnız xarici üz)')
    : m.foundationType === 'slab' ? q(m, ['footprint'], () => m.footprint!, 'Bina izi') : { value: null, how: 'Bünövrə növünü seçin' } },
  { key: 'slabs', section: 1, name: 'Mərtəbələrarası və dam örtüyü (monolit plitə)', unit: 'm²', qty: m => q(m, ['footprint', 'floors'], () => m.footprint! * m.floors!, 'Bina izi × mərtəbə sayı') },
  { key: 'frame', section: 1, name: 'Sütun və tirlər (karkas)', unit: 'm³', qty: () => ({ value: null, how: 'Konstruktiv çertyojdan ayrıca hesablanmalıdır' }) },
  { key: 'extwall', section: 2, name: 'Xarici divar hörgüsü', unit: 'm²', qty: m => q(m, ['extPerimeter', 'floorHeight', 'floors'], () => extWall(m), 'Perimetr × hündürlük × mərtəbə − pəncərə sahəsi (qapılar çıxılmayıb)') },
  { key: 'partitions', section: 2, name: 'Daxili arakəsmələr', unit: 'm²', qty: m => q(m, ['intWallLength', 'floorHeight'], () => m.intWallLength! * m.floorHeight!, 'Arakəsmə uzunluğu × hündürlük') },
  { key: 'roof', section: 3, name: 'Dam örtüyü', unit: 'm²', qty: m => Number(m.roofArea) > 0 ? { value: m.roofArea, how: 'Daxil edilmiş dam sahəsi' } : m.roofType === 'flat' ? q(m, ['footprint'], () => m.footprint!, 'Düz dam: sahə = bina izi (fərziyyə)') : { value: null, how: m.roofType === 'pitched' ? 'Maili dam sahəsini daxil edin' : 'Dam sahəsini və ya növünü daxil edin' } },
  { key: 'roofwp', section: 3, name: 'Dam hidroizolyasiyası və istilik izolyasiyası', unit: 'm²', qty: m => TEMPLATE.find(t => t.key === 'roof')!.qty(m) },
  { key: 'elec', section: 4, name: 'Elektrik işləri (xətlər, lövhə, nöqtələr)', unit: 'm²', qty: m => q(m, ['totalArea'], () => m.totalArea!, 'Ümumi sahə üzrə (qiymət m² ilə verilir)') },
  { key: 'plumb', section: 5, name: 'Daxili su və kanalizasiya şəbəkəsi', unit: 'm²', qty: m => q(m, ['totalArea'], () => m.totalArea!, 'Ümumi sahə üzrə') },
  { key: 'sanitary', section: 5, name: 'Sanitar qovşaq avadanlığı', unit: 'ədəd', qty: m => q(m, ['bathrooms'], () => m.bathrooms!, 'Sanitar qovşaq sayı') },
  { key: 'heat', section: 6, name: 'İstilik sistemi (radiator və ya isti döşəmə)', unit: 'm²', qty: m => q(m, ['totalArea'], () => m.totalArea!, 'Ümumi sahə üzrə') },
  { key: 'vent', section: 6, name: 'Havalandırma', unit: 'm²', qty: m => q(m, ['totalArea'], () => m.totalArea!, 'Ümumi sahə üzrə') },
  { key: 'plaster', section: 7, name: 'Daxili suvaq', unit: 'm²', qty: m => q(m, ['extPerimeter', 'floorHeight', 'floors', 'intWallLength'], () => extWall(m) + 2 * m.intWallLength! * m.floorHeight!, 'Xarici divarların daxili üzü + arakəsmələrin iki üzü') },
  { key: 'paint', section: 7, name: 'Divar boyası', unit: 'm²', qty: m => TEMPLATE.find(t => t.key === 'plaster')!.qty(m) },
  { key: 'ceil', section: 7, name: 'Tavanların hazırlanması və boyası', unit: 'm²', qty: m => q(m, ['totalArea'], () => m.totalArea!, 'Ümumi sahə') },
  { key: 'facade', section: 7, name: 'Fasad işləri', unit: 'm²', qty: m => q(m, ['extPerimeter', 'floorHeight', 'floors'], () => extWall(m), 'Xarici divar sahəsi − pəncərələr') },
  { key: 'screed', section: 8, name: 'Döşəmə styajkası', unit: 'm²', qty: m => q(m, ['totalArea'], () => m.totalArea!, 'Ümumi sahə') },
  { key: 'floor', section: 8, name: 'Döşəmə örtüyü', unit: 'm²', qty: m => q(m, ['totalArea'], () => m.totalArea!, 'Ümumi sahə') },
  { key: 'tiles', section: 8, name: 'Hamam və mətbəx üzlüyü (kafel)', unit: 'm²', qty: () => ({ value: null, how: 'Kafel sahəsini layihədən daxil edin' }) },
  { key: 'windows', section: 9, name: 'Pəncərələr', unit: 'm²', qty: m => q(m, ['windowsArea'], () => m.windowsArea!, 'Pəncərələrin ümumi sahəsi') },
  { key: 'extdoors', section: 9, name: 'Xarici qapılar', unit: 'ədəd', qty: m => q(m, ['extDoors'], () => m.extDoors!, 'Say') },
  { key: 'intdoors', section: 9, name: 'Daxili qapılar', unit: 'ədəd', qty: m => q(m, ['intDoors'], () => m.intDoors!, 'Say') },
  { key: 'transport', section: 10, name: 'Materialların daşınması', unit: 'kompleks', qty: () => ({ value: 1, how: 'Bütöv xidmət' }) },
  { key: 'waste', section: 10, name: 'Tikinti tullantılarının daşınması', unit: 'kompleks', qty: () => ({ value: 1, how: 'Bütöv xidmət' }) },
  { key: 'scaffold', section: 10, name: 'İskələ və müvəqqəti qurğular', unit: 'kompleks', qty: () => ({ value: 1, how: 'Bütöv xidmət' }) },
  { key: 'labor', section: 11, name: 'Ümumi tikinti işçiliyi (sətirlərə daxil edilməyibsə)', unit: 'm²', qty: m => q(m, ['totalArea'], () => m.totalArea!, 'Ümumi sahə — sətirlərdə işçilik varsa boş saxlayın') },
  ...['Torpaq sahəsinin dəyəri', 'Layihə, ekspertiza və icazə xərcləri', 'Su, qaz, elektrik şəbəkəsinə qoşulma', 'Geoloji tədqiqat', 'Həyət abadlaşdırması və hasar', 'Mebel və məişət texnikası']
    .map((name, i) => ({ key: `sep${i}`, section: SEPARATE_SECTION, name, unit: 'kompleks', qty: () => ({ value: null, how: 'Ayrıca qiymətləndirilir — tikinti büdcəsinə daxil deyil' }) as Qty })),
];

export const templateLines = (): Line[] => TEMPLATE.map(t => ({ id: t.key, section: t.section, key: t.key, name: t.name, unit: t.unit, qty: null, qtySource: 'formula', prices: {} }));

export function lineQty(l: Line, m: Measures): Qty {
  if (l.qty != null) return { value: l.qty, how: l.qtySource === 'table' ? (l.note ?? 'Cədvəldən') : 'Əl ilə daxil edilib' };
  const t = l.key ? TEMPLATE.find(x => x.key === l.key) : undefined;
  return t ? t.qty(m) : { value: null, how: 'Miqdarı daxil edin' };
}

/** Price for a level; falls back to "orta" and says so. Never invents a price. */
export function priceFor(l: Line, level: Level): { p: Price | null; fallback: boolean } {
  const own = l.prices[level];
  if (own && (own.material != null || own.labor != null)) return { p: own, fallback: false };
  const base = l.prices.orta;
  if (level !== 'orta' && base && (base.material != null || base.labor != null)) return { p: base, fallback: true };
  return { p: null, fallback: false };
}

export interface LineCalc { qty: Qty; price: Price | null; fallback: boolean; material: number | null; labor: number | null; total: number | null; confidence: 'yüksək' | 'orta' | 'aşağı' }
export function calcLine(l: Line, m: Measures, level: Level): LineCalc {
  const qty = lineQty(l, m);
  const { p, fallback } = priceFor(l, level);
  const has = qty.value != null && p != null;
  const material = has ? r2(qty.value! * (p!.material ?? 0)) : null;
  const labor = has ? r2(qty.value! * (p!.labor ?? 0)) : null;
  const confidence = !has ? 'aşağı' : l.qtySource !== 'formula' || /Daxil edilmiş/.test(qty.how) ? 'yüksək' : 'orta';
  return { qty, price: p, fallback, material, labor, total: has ? r2((material ?? 0) + (labor ?? 0)) : null, confidence };
}

export interface Totals {
  material: number; labor: number; extra: number; total: number; separate: number;
  priced: number; unpriced: number; noQty: number; lines: number;
  scenarios: { low: number; base: number; high: number; tiered: boolean };
  sections: { index: number; total: number; unpriced: number }[];
  priceDates: string[]; fallbackLines: number;
}
export function totals(lines: Line[], m: Measures, level: Level): Totals {
  let material = 0, labor = 0, extra = 0, separate = 0, priced = 0, unpriced = 0, noQty = 0, fallbackLines = 0;
  const sections = SECTIONS.map((_, index) => ({ index, total: 0, unpriced: 0 }));
  const dates = new Set<string>();
  const sum = (lv: Level) => lines.filter(l => l.section !== SEPARATE_SECTION).reduce((t, l) => t + (calcLine(l, m, lv).total ?? 0), 0);
  for (const l of lines) {
    const c = calcLine(l, m, level);
    if (c.price?.date) dates.add(c.price.date);
    if (l.section === SEPARATE_SECTION) { separate += c.total ?? 0; continue; }
    if (c.qty.value == null) noQty++;
    else if (c.total == null) { unpriced++; sections[l.section].unpriced++; }
    else {
      priced++; if (c.fallback) fallbackLines++;
      sections[l.section].total = r2(sections[l.section].total + c.total);
      if (l.section === EXTRA_SECTION) extra += c.total; else { material += c.material ?? 0; labor += c.labor ?? 0; }
    }
  }
  const tiered = lines.some(l => l.prices.ekonom || l.prices.premium);
  const base = r2(material + labor + extra);
  return {
    material: r2(material), labor: r2(labor), extra: r2(extra), total: base, separate: r2(separate), priced, unpriced, noQty, lines: lines.filter(l => l.section !== SEPARATE_SECTION).length,
    scenarios: { low: r2(sum('ekonom')), base, high: r2(sum('premium')), tiered }, sections, priceDates: [...dates].sort(), fallbackLines,
  };
}

/* ------------------------------------------------------------ table import */

const SECTION_WORDS: [RegExp, number][] = [
  [/torpaq|qazıntı|bünövr|fundament|земл|фундамент/i, 0], [/karkas|sütun|tir|plitə|monolit|örtük|каркас|колонн|перекр/i, 1], [/divar|hörgü|arakəs|kərpic|blok|стен|кладк|перегород/i, 2],
  [/dam|kirəmit|hidroizol|кровл|крыш/i, 3], [/elektrik|kabel|электр/i, 4], [/su |su,|santex|kanaliz|сантех|водо|канализ/i, 5], [/istilik|kombi|radiator|havalandır|отопл|вентил/i, 6],
  [/suvaq|boya|şpaklyovka|fasad|штукат|покрас|фасад/i, 7], [/döşəmə|styajka|laminat|parket|kafel|üzlük|пол|стяжк|плитк/i, 8], [/qapı|pəncərə|двер|окн/i, 9],
  [/daşınma|nəqliyyat|iskələ|zibil|достав|вывоз|леса/i, 10], [/işçilik|usta haqqı|работ/i, 11],
];
export const guessSection = (text: string) => { const t = text.toLocaleLowerCase('az'); return SECTION_WORDS.find(([re]) => re.test(t))?.[1] ?? 11; };

const H = {
  section: /bölmə|bolme|раздел|section/i, name: /ad|iş|is\b|work|наимен|name|təsvir/i, unit: /vahid|ölçü|ед|unit/i, qty: /miqdar|həcm|say|кол|qty|quantity/i,
  material: /material|материал/i, labor: /işçilik|iscilik|работ|labor|labour/i, price: /qiymət|qiymet|цена|price/i,
};
export interface ImportResult { lines: Line[]; skipped: { row: number; reason: string }[]; columns: string[] }
const toNum = (v: unknown): number | null => { if (v == null || v === '') return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null; const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Turns table rows (first row = headers) into estimate lines; reports what could not be read. */
export function linesFromTable(rows: unknown[][], fileName: string, date: string): ImportResult {
  const skipped: { row: number; reason: string }[] = [];
  const headerRow = rows.findIndex(r => r.some(c => typeof c === 'string' && (H.name.test(c) || H.qty.test(c))));
  if (headerRow < 0) return { lines: [], skipped: [{ row: 1, reason: 'Başlıq sətri tapılmadı (məs. “İşin adı”, “Vahid”, “Miqdar”, “Qiymət”)' }], columns: [] };
  const header = rows[headerRow].map(c => String(c ?? '').trim());
  // Azerbaijani lowercasing: “İşçilik” → “işçilik” (a plain /i flag does not fold İ).
  const lower = header.map(h => h.toLocaleLowerCase('az'));
  const col = (re: RegExp, not?: RegExp) => lower.findIndex(h => re.test(h) && !(not && not.test(h)));
  const ci = { section: col(H.section), name: col(H.name, /vahid|ölçü|bölmə|miqdar|qiymət/i), unit: col(H.unit), qty: col(H.qty), material: col(H.material), labor: col(H.labor), price: col(H.price, /material|işçilik|работ/i) };
  if (ci.name < 0) return { lines: [], skipped: [{ row: headerRow + 1, reason: 'İşin adı sütunu tapılmadı' }], columns: header };
  const lines: Line[] = [];
  rows.slice(headerRow + 1).forEach((r, i) => {
    const rowNo = headerRow + i + 2;
    const name = String(r[ci.name] ?? '').trim();
    if (!name) return;
    const qty = ci.qty >= 0 ? toNum(r[ci.qty]) : null;
    const material = ci.material >= 0 ? toNum(r[ci.material]) : ci.price >= 0 ? toNum(r[ci.price]) : null;
    const labor = ci.labor >= 0 ? toNum(r[ci.labor]) : null;
    if (qty == null && material == null && labor == null) { skipped.push({ row: rowNo, reason: `“${name.slice(0, 40)}”: miqdar və qiymət yoxdur` }); return; }
    const sectionText = ci.section >= 0 ? String(r[ci.section] ?? '') : '';
    lines.push({
      id: `t-${fileName}-${rowNo}`.replace(/[^\w-]/g, '_'), section: guessSection(`${sectionText} ${name}`), name: name.slice(0, 200), unit: ci.unit >= 0 ? String(r[ci.unit] ?? '').trim().slice(0, 20) || 'ədəd' : 'ədəd',
      qty, qtySource: qty != null ? 'table' : 'user', note: `${fileName}, sətir ${rowNo}`,
      prices: material != null || labor != null ? { orta: { material, labor, source: `${fileName}, sətir ${rowNo}`, date } } : {},
    });
  });
  return { lines, skipped, columns: header };
}

/** Minimal CSV reader: ; or , separators, quoted cells. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; continue; }
    if (ch === '"') quoted = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
