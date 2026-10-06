import { round2 } from './calc';
import { todayISO, uid } from './format';
import type {
  EstimateLineItem, EstimateSection, LineStatus, Measurement, PriceSource, PropertyKind, QualityLevel,
  QuantitySource, RenovationKind, Unit, WorkCategory,
} from './types';

export const CATEGORY_ORDER: WorkCategory[] = ['sokuntu', 'elektrik', 'santexnika', 'divar', 'boya', 'dosheme', 'kafel', 'tavan', 'qapi', 'isiqlandirma', 'metbex', 'sanitar', 'temizlik'];

export const CATEGORY_LABEL: Record<WorkCategory, string> = {
  sokuntu: 'Söküntü işləri',
  elektrik: 'Elektrik işləri',
  santexnika: 'Santexnika işləri',
  divar: 'Divarların hazırlanması',
  boya: 'Boya işləri',
  dosheme: 'Döşəmə işləri',
  kafel: 'Kafel və keramika',
  tavan: 'Asma tavan',
  qapi: 'Qapılar',
  isiqlandirma: 'İşıqlandırma',
  metbex: 'Mətbəx mebeli',
  sanitar: 'Sanitar avadanlıqlar',
  temizlik: 'Təmizlik və tullantıların çıxarılması',
};

export const CATEGORY_HINT: Record<WorkCategory, string> = {
  sokuntu: 'Köhnə örtüklər, kafel, arakəsmələr',
  elektrik: 'Kabel, rozetka, panel və avtomatlar',
  santexnika: 'Su və kanalizasiya xətləri',
  divar: 'Suvaq, şpaklyovka, astar',
  boya: 'Divar və tavanların rənglənməsi',
  dosheme: 'Styajka, laminat, plintus',
  kafel: 'Hamam və mətbəx səthləri',
  tavan: 'Gipskarton konstruksiya',
  qapi: 'Daxili qapılar və furnitura',
  isiqlandirma: 'Spot və çilçıraqlar',
  metbex: 'Modul mebel və quraşdırma',
  sanitar: 'Unitaz, lavabo, vanna',
  temizlik: 'Zibilin daşınması, yekun təmizlik',
};

/** Default waste / reserve on materials by category (5–15%). */
export const DEFAULT_WASTE: Record<WorkCategory, number> = {
  sokuntu: 0.05, elektrik: 0.1, santexnika: 0.08, divar: 0.12, boya: 0.1, dosheme: 0.08, kafel: 0.1,
  tavan: 0.08, qapi: 0.05, isiqlandirma: 0.05, metbex: 0.05, sanitar: 0.05, temizlik: 0.05,
};

/** Budget breakdown groups used on the summary tab. */
export const BREAKDOWN_GROUP: Record<WorkCategory, 'Santexnika' | 'Elektrik' | 'Döşəmə' | 'Kafel' | 'Digər'> = {
  sokuntu: 'Digər', elektrik: 'Elektrik', santexnika: 'Santexnika', divar: 'Digər', boya: 'Digər', dosheme: 'Döşəmə',
  kafel: 'Kafel', tavan: 'Digər', qapi: 'Digər', isiqlandirma: 'Elektrik', metbex: 'Digər', sanitar: 'Santexnika', temizlik: 'Digər',
};

export const PROPERTY_LABEL: Record<PropertyKind, string> = { menzil: 'Mənzil', villa: 'Villa', ofis: 'Ofis', magaza: 'Mağaza', diger: 'Digər' };
export const RENOVATION_LABEL: Record<RenovationKind, string> = { kosmetik: 'Kosmetik', standart: 'Standart', kapital: 'Kapital', premium: 'Premium' };
export const QUALITY_LABEL: Record<QualityLevel, string> = { ekonom: 'Ekonom', standart: 'Standart', premium: 'Premium' };

export const QUALITY_FACTOR: Record<QualityLevel, { material: number; labor: number; duration: number }> = {
  ekonom: { material: 0.74, labor: 0.9, duration: 0.9 },
  standart: { material: 1, labor: 1, duration: 1 },
  premium: { material: 1.55, labor: 1.2, duration: 1.2 },
};

export const DEFAULT_PACKAGES: Record<RenovationKind, WorkCategory[]> = {
  kosmetik: ['divar', 'boya', 'dosheme', 'temizlik'],
  standart: ['elektrik', 'divar', 'boya', 'dosheme', 'kafel', 'qapi', 'isiqlandirma', 'temizlik'],
  kapital: ['sokuntu', 'elektrik', 'santexnika', 'divar', 'boya', 'dosheme', 'kafel', 'tavan', 'qapi', 'isiqlandirma', 'sanitar', 'temizlik'],
  premium: [...CATEGORY_ORDER],
};

export type RoomKind = 'living' | 'bed' | 'kitchen' | 'bath' | 'hall' | 'office' | 'other';
export interface RoomInput { id: string; name: string; area: number; kind: RoomKind }

export function guessRoomKind(name: string): RoomKind {
  const n = name.toLocaleLowerCase('az');
  if (/hamam|sanitar|vanna|tualet|wc/.test(n)) return 'bath';
  if (/mətbəx|metbex/.test(n)) return 'kitchen';
  if (/dəhliz|dehliz|koridor|holl/.test(n)) return 'hall';
  if (/yataq|uşaq|usaq/.test(n)) return 'bed';
  if (/qonaq|salon/.test(n)) return 'living';
  if (/ofis|toplantı|rəhbər|iş otağı/.test(n)) return 'office';
  return 'other';
}

export const CEILING_HEIGHT = 2.75;

/** Approximate wall area for a room (square-ish footprint, 15% openings). */
export const roomWallArea = (area: number, height = CEILING_HEIGHT) => round2(4 * Math.sqrt(area) * 1.05 * height * 0.85);
export const roomPerimeter = (area: number) => round2(4 * Math.sqrt(area) * 1.05);

export interface GeneratorContext {
  rooms: RoomInput[];
  quality: QualityLevel;
  /** Measurement ids by room id (only when rooms came from a drawing or manual measurements). */
  measurementByRoom?: Record<string, string>;
  /** Wall-area and perimeter measurements when available. */
  wallMeasurementId?: string;
  perimeterMeasurementId?: string;
  fromDrawing?: boolean;
}

const market = (reference = 'Bazar qiymətləri, Bakı'): PriceSource => ({ kind: 'market', reference, updatedAt: todayISO() });
const contractor = (): PriceSource => ({ kind: 'contractor', reference: 'Podratçının qiymət cədvəli', updatedAt: todayISO() });

interface Draft {
  name: string; zone: string; unit: Unit; quantity: number; material: number; labor: number;
  additional?: number; source?: PriceSource; qty?: QuantitySource;
}

function toItem(d: Draft, category: WorkCategory, ctx: GeneratorContext, status: LineStatus): EstimateLineItem {
  const q = QUALITY_FACTOR[ctx.quality];
  return {
    id: uid('li'),
    name: d.name,
    zone: d.zone,
    unit: d.unit,
    quantity: round2(d.quantity),
    materialUnitPrice: round2(d.material * q.material),
    laborUnitPrice: round2(d.labor * q.labor),
    additionalCost: d.additional ?? 0,
    wastePercentage: d.material > 0 ? DEFAULT_WASTE[category] : 0,
    marginPercentage: null,
    priceSource: d.source ?? (d.material > 0 ? market() : contractor()),
    quantitySource: d.qty ?? { kind: 'formula', label: 'Ümumi sahə əsasında hesablanıb' },
    status,
  };
}

/** Generates estimate sections for the selected work packages. */
export function generateSections(categories: WorkCategory[], ctx: GeneratorContext): EstimateSection[] {
  const status: LineStatus = ctx.fromDrawing ? 'ai' : 'draft';
  const rooms = ctx.rooms.filter(r => r.area > 0);
  const sum = (rs: RoomInput[]) => round2(rs.reduce((s, r) => s + r.area, 0));
  const names = (rs: RoomInput[]) => rs.map(r => r.name).join(', ') || '—';
  const wet = rooms.filter(r => r.kind === 'bath');
  const kitchen = rooms.filter(r => r.kind === 'kitchen');
  const dry = rooms.filter(r => r.kind !== 'bath' && r.kind !== 'kitchen');
  const ceilingRooms = rooms.filter(r => r.kind === 'living' || r.kind === 'hall' || r.kind === 'office');
  const total = sum(rooms);
  const wallsAll = round2(rooms.reduce((s, r) => s + roomWallArea(r.area), 0));
  const wallsDry = round2(rooms.filter(r => r.kind !== 'bath').reduce((s, r) => s + roomWallArea(r.area), 0));
  const bathWalls = round2(wet.reduce((s, r) => s + roomWallArea(r.area), 0));
  const perimeterDry = round2(dry.reduce((s, r) => s + roomPerimeter(r.area), 0));
  const src = ctx.fromDrawing ? 'Çertyoj' : 'Otaq ölçüləri';
  const fromRooms = (rs: RoomInput[], factor = 1): QuantitySource => {
    const ids = rs.map(r => ctx.measurementByRoom?.[r.id]).filter((x): x is string => !!x);
    const label = `${src}: ${rs.map(r => r.name).join(' + ')}${factor !== 1 ? ` × ${String(factor).replace('.', ',')}` : ''}`;
    return ids.length === rs.length && ids.length ? { kind: ctx.fromDrawing ? 'drawing' : 'formula', label, measurementIds: ids, factor } : { kind: 'formula', label };
  };
  const fromWalls = (factor: number, label: string): QuantitySource => ctx.wallMeasurementId
    ? { kind: ctx.fromDrawing ? 'drawing' : 'formula', label: `${src}: ${label}`, measurementIds: [ctx.wallMeasurementId], factor }
    : { kind: 'formula', label: `${label}, tavan hündürlüyü ${String(CEILING_HEIGHT).replace('.', ',')} m` };

  const build: Record<WorkCategory, () => Draft[]> = {
    sokuntu: () => [
      { name: 'Köhnə döşəmə örtüyünün sökülməsi', zone: 'Bütün otaqlar', unit: 'm²', quantity: total, material: 0, labor: 3.5, qty: fromRooms(rooms) },
      ...(wet.length ? [{ name: 'Köhnə kafelin sökülməsi', zone: names(wet), unit: 'm²' as Unit, quantity: bathWalls, material: 0, labor: 6 }] : []),
    ],
    elektrik: () => [
      { name: 'Elektrik kabeli (VVG 3×2,5)', zone: 'Bütün obyekt', unit: 'm', quantity: Math.round(total * 2.9), material: 2.4, labor: 1.8 },
      { name: 'Rozetka və açar', zone: 'Bütün obyekt', unit: 'ədəd', quantity: Math.max(6, Math.round(total * 0.6)), material: 9, labor: 7 },
      { name: 'Elektrik paneli və avtomatlar', zone: 'Dəhliz', unit: 'komplekt', quantity: 1, material: 260, labor: 120 },
    ],
    santexnika: () => [
      { name: 'Santexnika boruları (PPR)', zone: names([...wet, ...kitchen]), unit: 'm', quantity: Math.max(10, (wet.length + kitchen.length) * 16), material: 4.2, labor: 6 },
      { name: 'Kanalizasiya boruları', zone: names([...wet, ...kitchen]), unit: 'm', quantity: Math.max(6, (wet.length + kitchen.length) * 7), material: 5.5, labor: 6 },
    ],
    divar: () => [
      { name: 'Divarların suvağı (gips)', zone: 'Bütün otaqlar', unit: 'm²', quantity: round2(wallsDry * 0.75), material: 3.8, labor: 6.5, qty: fromWalls(0.75, 'divar səthinin 75%-i') },
      { name: 'Divarların şpaklyovkası', zone: 'Bütün otaqlar', unit: 'm²', quantity: wallsDry, material: 2.2, labor: 4.5, qty: fromWalls(1, 'divar səthi') },
    ],
    boya: () => [
      { name: 'Boya, 2 qat', zone: 'Bütün otaqlar', unit: 'm²', quantity: wallsDry, material: 2.6, labor: 3.5, qty: fromWalls(1, 'divar səthi') },
    ],
    dosheme: () => [
      { name: 'Döşəmə styajkası', zone: 'Bütün otaqlar', unit: 'm²', quantity: total, material: 6.5, labor: 7, qty: fromRooms(rooms) },
      ...(dry.length ? [
        { name: 'Laminat (33 sinif)', zone: names(dry), unit: 'm²' as Unit, quantity: sum(dry), material: 18, labor: 6, qty: fromRooms(dry) },
        { name: 'Laminat altlığı', zone: names(dry), unit: 'm²' as Unit, quantity: sum(dry), material: 2.4, labor: 0, qty: fromRooms(dry) },
        { name: 'Plintus', zone: names(dry), unit: 'm' as Unit, quantity: perimeterDry, material: 4.5, labor: 2.5 },
      ] : []),
    ],
    kafel: () => {
      const tile = round2(sum(wet) + bathWalls);
      return [
        ...(wet.length ? [{ name: 'Kafel (hamam divar və döşəmə)', zone: names(wet), unit: 'm²' as Unit, quantity: tile, material: 24, labor: 16 }] : []),
        ...(kitchen.length ? [{ name: 'Döşəmə kafeli (mətbəx)', zone: names(kitchen), unit: 'm²' as Unit, quantity: sum(kitchen), material: 20, labor: 14, qty: fromRooms(kitchen) }] : []),
        { name: 'Kafel yapışqanı (25 kq)', zone: names([...wet, ...kitchen]), unit: 'kisə', quantity: Math.max(2, Math.ceil((tile + sum(kitchen)) / 3.5)), material: 9.5, labor: 0 },
      ];
    },
    tavan: () => ceilingRooms.length ? [{ name: 'Gipskarton asma tavan', zone: names(ceilingRooms), unit: 'm²', quantity: sum(ceilingRooms), material: 9, labor: 9, qty: fromRooms(ceilingRooms) }] : [],
    qapi: () => [{ name: 'Daxili qapı (komplekt)', zone: 'Bütün otaqlar', unit: 'ədəd', quantity: Math.max(1, rooms.length - 1), material: 260, labor: 45 }],
    isiqlandirma: () => [
      { name: 'Spot işıqlar', zone: names(ceilingRooms.length ? ceilingRooms : rooms), unit: 'ədəd', quantity: Math.max(4, Math.round(total * 0.3)), material: 12, labor: 6 },
      { name: 'Çilçıraq quraşdırılması', zone: names(rooms.filter(r => r.kind === 'living' || r.kind === 'bed')), unit: 'ədəd', quantity: Math.max(1, rooms.filter(r => r.kind === 'living' || r.kind === 'bed').length), material: 0, labor: 25 },
    ],
    metbex: () => [{ name: 'Mətbəx mebeli (modul, xətti metr)', zone: names(kitchen.length ? kitchen : rooms.slice(0, 1)), unit: 'm', quantity: 3.6, material: 420, labor: 60 }],
    sanitar: () => wet.length ? [
      { name: 'Unitaz', zone: names(wet), unit: 'ədəd', quantity: wet.length, material: 340, labor: 60 },
      { name: 'Lavabo və smesitel', zone: names(wet), unit: 'komplekt', quantity: wet.length, material: 230, labor: 45 },
      { name: 'Vanna (akril) və quraşdırma', zone: names(wet), unit: 'ədəd', quantity: 1, material: 380, labor: 70 },
    ] : [],
    temizlik: () => [
      { name: 'Tullantıların çıxarılması', zone: 'Obyekt', unit: 'xidmət', quantity: 1, material: 0, labor: 0, additional: Math.round(120 + total * 2.5), source: contractor() },
      { name: 'Yekun təmizlik', zone: 'Bütün otaqlar', unit: 'm²', quantity: total, material: 0, labor: 1.5, qty: fromRooms(rooms) },
    ],
  };

  return CATEGORY_ORDER.filter(c => categories.includes(c)).map(category => ({
    id: uid('sec'),
    category,
    title: CATEGORY_LABEL[category],
    items: build[category]().filter(d => d.quantity > 0).map(d => toItem(d, category, ctx, status)),
  })).filter(s => s.items.length);
}

/** Forecast duration in working days. */
export function forecastDays(area: number, renovation: RenovationKind, quality: QualityLevel): number {
  const perM2: Record<RenovationKind, number> = { kosmetik: 0.35, standart: 0.6, kapital: 0.9, premium: 1.1 };
  return Math.round((7 + area * perM2[renovation]) * QUALITY_FACTOR[quality].duration);
}

export function roomMeasurements(rooms: RoomInput[], source: 'drawing' | 'manual'): Measurement[] {
  return rooms.map(r => ({
    id: `m-${r.id}`,
    kind: 'area' as const,
    name: r.name,
    value: r.area,
    unit: 'm²' as const,
    confidence: source === 'drawing' ? 0.85 : 1,
    source: source === 'drawing' ? 'Çertyoj, otaq konturu' : 'Əl ilə daxil edilib',
    status: source === 'drawing' ? 'suggested' as const : 'approved' as const,
    roomId: r.id,
  }));
}

export interface SmartTemplate {
  id: string;
  title: string;
  description: string;
  propertyKind: PropertyKind;
  renovationKind: RenovationKind;
  rooms: Omit<RoomInput, 'id'>[];
  packages: WorkCategory[];
}

export const TEMPLATES: SmartTemplate[] = [
  { id: 'tpl-1room', title: '1 otaqlı mənzil, standart təmir', description: 'Divar, döşəmə, elektrik və hamam üçün əsas paket', propertyKind: 'menzil', renovationKind: 'standart',
    rooms: [{ name: 'Qonaq otağı', area: 18.5, kind: 'living' }, { name: 'Mətbəx', area: 8.2, kind: 'kitchen' }, { name: 'Hamam', area: 4.1, kind: 'bath' }, { name: 'Dəhliz', area: 5.2, kind: 'hall' }],
    packages: ['elektrik', 'divar', 'boya', 'dosheme', 'kafel', 'qapi', 'isiqlandirma', 'sanitar', 'temizlik'] },
  { id: 'tpl-2room', title: '2 otaqlı mənzil, kapital təmir', description: 'Söküntüdən yekun təmizliyədək tam iş həcmi', propertyKind: 'menzil', renovationKind: 'kapital',
    rooms: [{ name: 'Qonaq otağı', area: 21.4, kind: 'living' }, { name: 'Yataq otağı', area: 16.8, kind: 'bed' }, { name: 'Mətbəx', area: 11.2, kind: 'kitchen' }, { name: 'Hamam', area: 5.4, kind: 'bath' }, { name: 'Dəhliz', area: 7.6, kind: 'hall' }],
    packages: DEFAULT_PACKAGES.kapital },
  { id: 'tpl-bath', title: 'Hamam təmiri', description: 'Söküntü, santexnika, kafel və sanitar avadanlıqlar', propertyKind: 'menzil', renovationKind: 'standart',
    rooms: [{ name: 'Hamam', area: 5, kind: 'bath' }],
    packages: ['sokuntu', 'santexnika', 'kafel', 'sanitar', 'isiqlandirma', 'temizlik'] },
  { id: 'tpl-kitchen', title: 'Mətbəx təmiri', description: 'Elektrik, santexnika, kafel və modul mebel', propertyKind: 'menzil', renovationKind: 'standart',
    rooms: [{ name: 'Mətbəx', area: 10.5, kind: 'kitchen' }],
    packages: ['sokuntu', 'elektrik', 'santexnika', 'divar', 'boya', 'kafel', 'metbex', 'isiqlandirma', 'temizlik'] },
  { id: 'tpl-office', title: 'Ofis təmiri', description: 'Açıq iş sahəsi, toplantı otağı və asma tavan', propertyKind: 'ofis', renovationKind: 'standart',
    rooms: [{ name: 'Açıq iş sahəsi', area: 64, kind: 'office' }, { name: 'Toplantı otağı', area: 18, kind: 'office' }, { name: 'Rəhbər otağı', area: 16, kind: 'office' }, { name: 'Sanitar qovşaq', area: 6, kind: 'bath' }, { name: 'Dəhliz', area: 12, kind: 'hall' }],
    packages: ['elektrik', 'divar', 'boya', 'dosheme', 'tavan', 'qapi', 'isiqlandirma', 'sanitar', 'temizlik'] },
  { id: 'tpl-prep', title: 'Təmir öncəsi hazırlıq', description: 'Söküntü, divarların hazırlanması və zibilin daşınması', propertyKind: 'menzil', renovationKind: 'kosmetik',
    rooms: [{ name: 'Qonaq otağı', area: 20, kind: 'living' }, { name: 'Yataq otağı', area: 15, kind: 'bed' }, { name: 'Dəhliz', area: 7, kind: 'hall' }],
    packages: ['sokuntu', 'divar', 'temizlik'] },
];
