/**
 * Demo data for the AI Smeta module.
 * TODO(api): replace with server data once estimate endpoints exist.
 */
import { round2, sectionTotals } from './calc';
import { CATEGORY_LABEL, DEFAULT_WASTE, TEMPLATES, generateSections, roomMeasurements, type RoomInput } from './catalog';
import type {
  ChangeOrder, Drawing, Estimate, EstimateLineItem, EstimateSection, Expense, Measurement, PaymentMilestone,
  PhotoEvidence, PriceSource, Project, QuantitySource, Unit, WorkCategory,
} from './types';

const CONTRACTOR = { name: 'Rəşad Hüseynov', company: 'RH Təmir Studiyası', phone: '+994 50 412 37 80', email: 'info@rhtemir.az', experienceYears: 9, completedProjects: 64, rating: 4.8 };
/** Signed-in contractor profile used for new estimates. TODO(api): load from the company profile. */
export const DEFAULT_CONTRACTOR = CONTRACTOR;

const market = (updatedAt = '2026-10-04', reference = 'Bakı tikinti bazarları, orta qiymət'): PriceSource => ({ kind: 'market', reference, updatedAt });
const contractor = (updatedAt = '2026-09-08'): PriceSource => ({ kind: 'contractor', reference: 'Podratçının qiymət cədvəli', updatedAt });
const manual = (updatedAt = '2026-09-10'): PriceSource => ({ kind: 'manual', updatedAt });

const drawingQty = (label: string, measurementIds: string[], factor = 1): QuantitySource => ({ kind: 'drawing', label, measurementIds, factor });
const formulaQty = (label: string): QuantitySource => ({ kind: 'formula', label });

interface LOpts { add?: number; waste?: number; margin?: number | null; source?: PriceSource; qty?: QuantitySource; status?: EstimateLineItem['status'] }
function line(category: WorkCategory, id: string, name: string, zone: string, unit: Unit, quantity: number, material: number, labor: number, o: LOpts = {}): EstimateLineItem {
  return {
    id, name, zone, unit, quantity,
    materialUnitPrice: material,
    laborUnitPrice: labor,
    additionalCost: o.add ?? 0,
    wastePercentage: o.waste ?? (material > 0 ? DEFAULT_WASTE[category] : 0),
    marginPercentage: o.margin ?? null,
    priceSource: o.source ?? (material > 0 ? market() : contractor()),
    quantitySource: o.qty ?? formulaQty('Podratçının ölçüsü'),
    status: o.status ?? 'approved',
  };
}
const section = (category: WorkCategory, items: EstimateLineItem[]): EstimateSection => ({ id: `sec-${category}`, category, title: CATEGORY_LABEL[category], items });

/* ------------------------------------------------------------------ */
/* Nərimanov, 2 otaqlı mənzil — the flagship demo project             */
/* ------------------------------------------------------------------ */

const NRM_ROOMS = ['m-qonaq', 'm-yataq', 'm-metbex', 'm-hamam', 'm-dehliz'];
const NRM_DRY = ['m-qonaq', 'm-yataq', 'm-dehliz'];

function narimanovSections(): EstimateSection[] {
  return [
    section('sokuntu', [
      line('sokuntu', 'li-n01', 'Köhnə döşəmə örtüyünün sökülməsi', 'Bütün otaqlar', 'm²', 62.4, 0, 4, { qty: drawingQty('Çertyoj: 5 otağın sahəsi', NRM_ROOMS) }),
      line('sokuntu', 'li-n02', 'Köhnə kafelin sökülməsi', 'Hamam', 'm²', 18.4, 0, 7, { qty: formulaQty('Hamam divarları: perimetr 9,3 m × 2,0 m − qapı') }),
    ]),
    section('elektrik', [
      line('elektrik', 'li-n03', 'Elektrik kabeli (VVG 3×2,5)', 'Bütün mənzil', 'm', 180, 2.6, 2.2, { qty: formulaQty('Elektrik sxemi: 14 xətt üzrə') }),
      line('elektrik', 'li-n04', 'Rozetka və açar', 'Bütün mənzil', 'ədəd', 38, 14, 8, { waste: 0.05, qty: formulaQty('Elektrik sxemi üzrə nöqtələr') }),
      line('elektrik', 'li-n05', 'Elektrik paneli və avtomatlar', 'Dəhliz', 'komplekt', 1, 340, 160, { waste: 0, source: market('2026-09-08') }),
      line('elektrik', 'li-n06', 'Divarlarda kabel kanalının açılması (şrifovka)', 'Bütün mənzil', 'm', 120, 0, 3.5, { qty: formulaQty('Elektrik sxemi: gizli xətlər') }),
      line('elektrik', 'li-n07', 'Kondisioner xəttinin hazırlanması', 'Qonaq otağı, Yataq otağı', 'ədəd', 2, 45, 65),
    ]),
    section('santexnika', [
      line('santexnika', 'li-n08', 'Santexnika boruları (PPR)', 'Hamam, Mətbəx', 'm', 34, 5.2, 8, { qty: formulaQty('Su xətləri sxemi: hamam 22 m, mətbəx 12 m') }),
      line('santexnika', 'li-n09', 'Kanalizasiya boruları', 'Hamam, Mətbəx', 'm', 14, 6.5, 7),
    ]),
    section('divar', [
      line('divar', 'li-n10', 'Divarların suvağı (gips)', 'Bütün otaqlar', 'm²', 147, 4.2, 8, { qty: drawingQty('Çertyoj: divar səthinin 75%-i', ['m-walls'], 0.75) }),
      line('divar', 'li-n11', 'Divarların astarlanması', 'Bütün otaqlar', 'm²', 196, 0.9, 1.2, { qty: drawingQty('Çertyoj: divar səthi', ['m-walls']) }),
      line('divar', 'li-n12', 'Divarların şpaklyovkası', 'Bütün otaqlar', 'm²', 196, 2.6, 6, { qty: drawingQty('Çertyoj: divar səthi', ['m-walls']) }),
      line('divar', 'li-n13', 'Pəncərə yamaclarının suvağı', 'Qonaq otağı, Yataq otağı, Mətbəx', 'm', 22, 2.5, 8.65, { qty: formulaQty('Çertyoj: 4 pəncərə × 5,5 m') }),
    ]),
    section('boya', [
      line('boya', 'li-n14', 'Boya, 2 qat', 'Bütün otaqlar', 'm²', 196, 3.4, 4.5, { qty: drawingQty('Çertyoj: divar səthi', ['m-walls']) }),
      line('boya', 'li-n15', 'Tavanların rənglənməsi', 'Yataq otağı, Mətbəx, Hamam', 'm²', 33.4, 3.4, 5, { qty: drawingQty('Çertyoj: Yataq otağı + Mətbəx + Hamam', ['m-yataq', 'm-metbex', 'm-hamam']) }),
    ]),
    section('dosheme', [
      line('dosheme', 'li-n16', 'Döşəmə styajkası', 'Bütün otaqlar', 'm²', 62.4, 7.5, 8, { qty: drawingQty('Çertyoj: 5 otağın sahəsi', NRM_ROOMS) }),
      line('dosheme', 'li-n17', 'Laminat (33 sinif)', 'Qonaq otağı, Yataq otağı, Dəhliz', 'm²', 45.8, 26, 7, { qty: drawingQty('Çertyoj: Qonaq otağı + Yataq otağı + Dəhliz', NRM_DRY), source: market('2026-09-08') }),
      line('dosheme', 'li-n18', 'Laminat altlığı', 'Qonaq otağı, Yataq otağı, Dəhliz', 'm²', 45.8, 3, 0, { waste: 0.05, qty: drawingQty('Çertyoj: Qonaq otağı + Yataq otağı + Dəhliz', NRM_DRY) }),
      line('dosheme', 'li-n19', 'Plintus', 'Qonaq otağı, Yataq otağı, Dəhliz', 'm', 41.6, 6, 3, { qty: drawingQty('Çertyoj: quru otaqların perimetri', ['m-perimeter']) }),
    ]),
    section('kafel', [
      line('kafel', 'li-n20', 'Hamamın hidroizolyasiyası', 'Hamam', 'm²', 9.8, 8.5, 6, { qty: formulaQty('Döşəmə 5,4 m² + duş zonası divarları 4,4 m²') }),
      line('kafel', 'li-n21', 'Kafel (hamam divar və döşəmə)', 'Hamam', 'm²', 23.8, 32, 22, { qty: formulaQty('Çertyoj: döşəmə 5,4 m² + divarlar 18,4 m²') }),
      line('kafel', 'li-n22', 'Döşəmə kafeli (mətbəx)', 'Mətbəx', 'm²', 11.2, 28, 18, { qty: drawingQty('Çertyoj: Mətbəx', ['m-metbex']) }),
      line('kafel', 'li-n23', 'Kafel yapışqanı (25 kq)', 'Hamam, Mətbəx', 'kisə', 12, 11, 0, { waste: 0.05, qty: formulaQty('35 m² kafel üçün ≈ 3 m²/kisə') }),
      line('kafel', 'li-n24', 'İsti döşəmə (elektrik mat)', 'Hamam', 'm²', 5.4, 48, 22, { waste: 0.08, qty: drawingQty('Çertyoj: Hamam', ['m-hamam']) }),
    ]),
    section('tavan', [
      line('tavan', 'li-n25', 'Gipskarton asma tavan', 'Qonaq otağı, Dəhliz', 'm²', 29, 12, 11, { qty: drawingQty('Çertyoj: Qonaq otağı + Dəhliz', ['m-qonaq', 'm-dehliz']) }),
    ]),
    section('qapi', [
      line('qapi', 'li-n26', 'Daxili qapı (komplekt)', 'Bütün otaqlar', 'ədəd', 4, 380, 60, { waste: 0, source: contractor('2026-09-08'), qty: formulaQty('Çertyoj: 5 qapı, giriş qapısı daxil deyil') }),
    ]),
    section('isiqlandirma', [
      line('isiqlandirma', 'li-n27', 'Spot işıqlar', 'Qonaq otağı, Dəhliz', 'ədəd', 18, 15.35, 8, { qty: formulaQty('Asma tavan üzrə 1,6 m addımla') }),
      line('isiqlandirma', 'li-n28', 'Çilçıraq quraşdırılması', 'Qonaq otağı, Yataq otağı', 'ədəd', 2, 0, 30),
    ]),
    section('sanitar', [
      line('sanitar', 'li-n29', 'Unitaz', 'Hamam', 'ədəd', 1, 420, 70, { waste: 0, source: manual() }),
      line('sanitar', 'li-n30', 'Lavabo və smesitel', 'Hamam', 'komplekt', 1, 290, 55, { waste: 0 }),
      line('sanitar', 'li-n31', 'Vanna (akril) və quraşdırma', 'Hamam', 'ədəd', 1, 460, 90, { waste: 0, source: market('2026-09-08') }),
    ]),
    section('temizlik', [
      line('temizlik', 'li-n32', 'Tullantıların çıxarılması', 'Obyekt', 'xidmət', 1, 0, 0, { add: 380, qty: formulaQty('2 konteyner, 8 m³') }),
      line('temizlik', 'li-n33', 'Yekun təmizlik', 'Bütün otaqlar', 'm²', 62.4, 0, 2.1, { qty: drawingQty('Çertyoj: 5 otağın sahəsi', NRM_ROOMS) }),
    ]),
  ];
}

const NRM_DRAWING: Drawing = {
  id: 'dr-nrm', fileName: 'narimanov_plan_v2.pdf', fileType: 'pdf', uploadedAt: '2026-10-03T11:20:00', scale: '1:100',
  width: 10.09, height: 6.19, status: 'analyzed',
  rooms: [
    { id: 'r-qonaq', name: 'Qonaq otağı', x: 0, y: 0, w: 5.65, h: 3.79 },
    { id: 'r-yataq', name: 'Yataq otağı', x: 5.65, y: 0, w: 4.44, h: 3.79 },
    { id: 'r-metbex', name: 'Mətbəx', x: 0, y: 3.79, w: 4.67, h: 2.4 },
    { id: 'r-dehliz', name: 'Dəhliz', x: 4.67, y: 3.79, w: 3.17, h: 2.4 },
    { id: 'r-hamam', name: 'Hamam', x: 7.84, y: 3.79, w: 2.25, h: 2.4 },
  ],
  openings: [
    { id: 'o-d1', kind: 'door', x1: 5.7, y1: 6.19, x2: 6.6, y2: 6.19 },
    { id: 'o-d2', kind: 'door', x1: 4.8, y1: 3.79, x2: 5.5, y2: 3.79 },
    { id: 'o-d3', kind: 'door', x1: 6.4, y1: 3.79, x2: 7.2, y2: 3.79 },
    { id: 'o-d4', kind: 'door', x1: 7.84, y1: 4.4, x2: 7.84, y2: 5.1 },
    { id: 'o-d5', kind: 'door', x1: 4.67, y1: 4.5, x2: 4.67, y2: 5.3 },
    { id: 'o-w1', kind: 'window', x1: 1.2, y1: 0, x2: 3.2, y2: 0 },
    { id: 'o-w2', kind: 'window', x1: 0, y1: 1.0, x2: 0, y2: 2.6 },
    { id: 'o-w3', kind: 'window', x1: 6.8, y1: 0, x2: 8.6, y2: 0 },
    { id: 'o-w4', kind: 'window', x1: 0, y1: 4.3, x2: 0, y2: 5.6 },
  ],
};

export function drawingMeasurements(roomStatus: (id: string) => Measurement['status'] = () => 'suggested'): Measurement[] {
  return [
    { id: 'm-qonaq', kind: 'area', name: 'Qonaq otağı', value: 21.4, unit: 'm²', confidence: 0.94, source: 'A-1 vərəqi, ölçü yazıları 5,65 × 3,79 m', status: roomStatus('m-qonaq'), roomId: 'r-qonaq' },
    { id: 'm-yataq', kind: 'area', name: 'Yataq otağı', value: 16.8, unit: 'm²', confidence: 0.92, source: 'A-1 vərəqi, ölçü yazıları 4,44 × 3,79 m', status: roomStatus('m-yataq'), roomId: 'r-yataq' },
    { id: 'm-metbex', kind: 'area', name: 'Mətbəx', value: 11.2, unit: 'm²', confidence: 0.88, source: 'A-1 vərəqi, ölçü yazıları 4,67 × 2,40 m', status: roomStatus('m-metbex'), roomId: 'r-metbex' },
    { id: 'm-hamam', kind: 'area', name: 'Hamam', value: 5.4, unit: 'm²', confidence: 0.71, source: 'Ölçü yazısı oxunmur, miqyas 1:100 üzrə hesablanıb', status: roomStatus('m-hamam'), roomId: 'r-hamam' },
    { id: 'm-dehliz', kind: 'area', name: 'Dəhliz', value: 7.6, unit: 'm²', confidence: 0.67, source: 'Kontur qeyri-düzgündür, giriş nişi ayrıca yoxlanmalıdır', status: roomStatus('m-dehliz'), roomId: 'r-dehliz' },
    { id: 'm-walls', kind: 'area', name: 'Divar səthi (quru otaqlar)', value: 196, unit: 'm²', confidence: 0.74, source: 'Perimetr × 2,75 m hündürlük − qapı və pəncərə açırımları', status: roomStatus('m-walls') },
    { id: 'm-perimeter', kind: 'length', name: 'Plintus uzunluğu', value: 41.6, unit: 'm', confidence: 0.86, source: 'Quru otaqların perimetri − qapı açırımları', status: roomStatus('m-perimeter') },
    { id: 'm-outer', kind: 'length', name: 'Xarici divarların uzunluğu', value: 32.56, unit: 'm', confidence: 0.9, source: 'Plan konturu 10,09 × 6,19 m', status: roomStatus('m-outer') },
    { id: 'm-height', kind: 'height', name: 'Tavan hündürlüyü', value: 2.75, unit: 'm', confidence: 0.55, source: 'Çertyojda göstərilməyib, standart dəyər götürülüb', status: roomStatus('m-height') },
    { id: 'm-doors', kind: 'count', name: 'Qapılar', value: 5, unit: 'ədəd', confidence: 0.9, source: 'Plan simvolları: 1 giriş, 4 daxili', status: roomStatus('m-doors') },
    { id: 'm-windows', kind: 'count', name: 'Pəncərələr', value: 4, unit: 'ədəd', confidence: 0.93, source: 'Plan simvolları, xarici divarlar üzrə', status: roomStatus('m-windows') },
  ];
}

export const SAMPLE_DRAWING = NRM_DRAWING;

function narimanov(): Project {
  const estimate: Estimate = { id: 'est-nrm', version: 2, createdAt: '2026-09-10T10:00:00', validUntil: '2026-10-10', sections: narimanovSections() };
  const reviewed = new Set(['m-qonaq', 'm-yataq', 'm-metbex', 'm-perimeter', 'm-outer', 'm-doors', 'm-windows']);
  const changeOrders: ChangeOrder[] = [
    { id: 'co-n1', number: 1, title: 'Hamam üçün premium kafel seçimi', reason: 'Sifarişçi standart kafel əvəzinə İspaniya istehsalı mat kafel seçdi. Qiymət fərqi və əlavə kəsim işi nəzərə alınıb.', date: '2026-09-18', requestedBy: 'client', requestedByName: 'Leyla Məmmədova', category: 'kafel', materialDelta: 640, laborDelta: 140, additionalCost: 0, status: 'approved', photoIds: ['ph-n3'], lineItemIds: ['li-n21'], decidedAt: '2026-09-19T09:40:00' },
    { id: 'co-n2', number: 2, title: 'Mətbəx üçün əlavə elektrik xətti', reason: 'Soyuducu, qabyuyan maşın və duxovka üçün ayrıca avtomatlı xətlər tələb olundu.', date: '2026-09-26', requestedBy: 'contractor', requestedByName: 'Rəşad Hüseynov', category: 'elektrik', materialDelta: 190, laborDelta: 230, additionalCost: 40, status: 'approved', photoIds: ['ph-n4'], lineItemIds: ['li-n03', 'li-n05'], decidedAt: '2026-09-27T18:15:00' },
    { id: 'co-n3', number: 3, title: 'Qonaq otağında əlavə LED işıqlandırma', reason: 'Sifarişçi asma tavanın perimetri boyunca gizli LED zolaq istəyir. Transformator və profil əlavə olunur.', date: '2026-10-02', requestedBy: 'client', requestedByName: 'Leyla Məmmədova', category: 'isiqlandirma', materialDelta: 280, laborDelta: 150, additionalCost: 30, status: 'pending', photoIds: ['ph-n2'], lineItemIds: ['li-n25', 'li-n27'] },
    { id: 'co-n4', number: 4, title: 'Laminat rənginin dəyişdirilməsi', reason: '“Palıd natural” rəngi anbarda yoxdur. Eyni sinifdən “Palıd boz” təklif olunur, qiyməti bir qədər aşağıdır.', date: '2026-10-04', requestedBy: 'contractor', requestedByName: 'Rəşad Hüseynov', category: 'dosheme', materialDelta: -120, laborDelta: 0, additionalCost: 0, status: 'draft', photoIds: [], lineItemIds: ['li-n17'] },
  ];
  const expenses: Expense[] = [
    { id: 'ex-n01', date: '2026-08-26', kind: 'labor', category: 'sokuntu', description: 'Söküntü briqadası, 3 gün', vendor: 'Elvin Quliyev (usta)', amount: 380, paymentStatus: 'paid', lineItemId: 'li-n01' },
    { id: 'ex-n02', date: '2026-08-28', kind: 'other', category: 'temizlik', description: 'Tikinti tullantısı konteyneri, 2 ədəd', vendor: 'Təmiz Şəhər MMC', amount: 240, paymentStatus: 'paid', receiptId: 'rc-n1', lineItemId: 'li-n32' },
    { id: 'ex-n03', date: '2026-08-29', kind: 'other', category: 'temizlik', description: 'Lift və pilləkən üçün mühafizə örtükləri', vendor: 'Bakı Tikinti Bazarı', amount: 60, paymentStatus: 'paid' },
    { id: 'ex-n04', date: '2026-09-02', kind: 'material', category: 'santexnika', description: 'PPR borular və fitinqlər', vendor: 'Santexnika Mərkəzi', amount: 260, paymentStatus: 'paid', receiptId: 'rc-n2', lineItemId: 'li-n08' },
    { id: 'ex-n05', date: '2026-09-04', kind: 'labor', category: 'santexnika', description: 'Santexnik, su və kanalizasiya xətləri', vendor: 'Kamran Əliyev (usta)', amount: 540, paymentStatus: 'paid', lineItemId: 'li-n08' },
    { id: 'ex-n06', date: '2026-09-05', kind: 'labor', category: 'elektrik', description: 'Elektrik ustası, kabel çəkilişi', vendor: 'Tural Nəsirov (usta)', amount: 520, paymentStatus: 'paid', lineItemId: 'li-n03' },
    { id: 'ex-n07', date: '2026-09-09', kind: 'material', category: 'divar', description: 'Gips suvaq “Rotband”, 60 kisə', vendor: 'Bauhaus Bakı', amount: 690, paymentStatus: 'paid', receiptId: 'rc-n3', lineItemId: 'li-n10' },
    { id: 'ex-n08', date: '2026-09-12', kind: 'labor', category: 'divar', description: 'Suvaq işləri, avans', vendor: 'Elvin Quliyev (usta)', amount: 1200, paymentStatus: 'partial', lineItemId: 'li-n10' },
    { id: 'ex-n09', date: '2026-09-15', kind: 'material', category: 'dosheme', description: 'Styajka qarışığı, 52 kisə', vendor: 'Bauhaus Bakı', amount: 572, paymentStatus: 'paid', receiptId: 'rc-n4', lineItemId: 'li-n16' },
    { id: 'ex-n10', date: '2026-09-17', kind: 'labor', category: 'dosheme', description: 'Döşəmə styajkası işləri', vendor: 'Elvin Quliyev (usta)', amount: 480, paymentStatus: 'paid', lineItemId: 'li-n16' },
    { id: 'ex-n11', date: '2026-09-20', kind: 'material', category: 'kafel', description: 'Hamam kafeli, 26 m²', vendor: 'Keramika Evi', amount: 900, paymentStatus: 'paid', receiptId: 'rc-n5', lineItemId: 'li-n21' },
    { id: 'ex-n12', date: '2026-09-20', kind: 'material', category: 'kafel', description: 'Kafel yapışqanı, 12 kisə', vendor: 'Keramika Evi', amount: 130, paymentStatus: 'paid', lineItemId: 'li-n23' },
    { id: 'ex-n13', date: '2026-09-24', kind: 'material', category: 'divar', description: 'Şpaklyovka və astar', vendor: 'Bauhaus Bakı', amount: 310, paymentStatus: 'paid', lineItemId: 'li-n12' },
    { id: 'ex-n14', date: '2026-09-28', kind: 'material', category: 'dosheme', description: 'Laminat, 33 sinif, 49 m²', vendor: 'Parket Dünyası', amount: 1512, paymentStatus: 'paid', receiptId: 'rc-n6', lineItemId: 'li-n17' },
    { id: 'ex-n15', date: '2026-09-28', kind: 'material', category: 'dosheme', description: 'Laminat altlığı və plintus', vendor: 'Parket Dünyası', amount: 386, paymentStatus: 'paid', lineItemId: 'li-n18' },
    { id: 'ex-n16', date: '2026-10-01', kind: 'material', category: 'qapi', description: 'Daxili qapılar, 50% avans', vendor: 'Qapı Sarayı', amount: 760, paymentStatus: 'partial', lineItemId: 'li-n26' },
  ];
  const photos: PhotoEvidence[] = [
    { id: 'ph-n1', phase: 'before', date: '2026-08-25', uploadedBy: 'Rəşad Hüseynov', note: 'Qonaq otağı, söküntüdən əvvəl ümumi görünüş', room: 'Qonaq otağı', category: 'sokuntu', lineItemId: 'li-n01', clientVisible: true },
    { id: 'ph-n2', phase: 'before', date: '2026-08-25', uploadedBy: 'Rəşad Hüseynov', note: 'Köhnə tavan və işıq nöqtələri', room: 'Qonaq otağı', category: 'tavan', lineItemId: 'li-n25', clientVisible: true },
    { id: 'ph-n3', phase: 'during', date: '2026-09-03', uploadedBy: 'Rəşad Hüseynov', note: 'Hamamda köhnə kafel söküldü, divarlar açıqdır', room: 'Hamam', category: 'kafel', lineItemId: 'li-n02', clientVisible: true },
    { id: 'ph-n4', phase: 'during', date: '2026-09-06', uploadedBy: 'Tural Nəsirov', note: 'Mətbəxdə yeni kabel xətləri, gizli çəkiliş', room: 'Mətbəx', category: 'elektrik', lineItemId: 'li-n03', clientVisible: true },
    { id: 'ph-n5', phase: 'during', date: '2026-09-07', uploadedBy: 'Kamran Əliyev', note: 'PPR borular quraşdırıldı, təzyiq testi 6 bar', room: 'Hamam', category: 'santexnika', lineItemId: 'li-n08', clientVisible: true },
    { id: 'ph-n6', phase: 'during', date: '2026-09-14', uploadedBy: 'Rəşad Hüseynov', note: 'Yataq otağında suvaq işləri, mayaklar üzrə', room: 'Yataq otağı', category: 'divar', lineItemId: 'li-n10', clientVisible: false },
    { id: 'ph-n7', phase: 'during', date: '2026-09-18', uploadedBy: 'Rəşad Hüseynov', note: 'Dəhlizdə styajka töküldü, quruma müddəti 7 gün', room: 'Dəhliz', category: 'dosheme', lineItemId: 'li-n16', clientVisible: true },
    { id: 'ph-n8', phase: 'after', date: '2026-09-30', uploadedBy: 'Leyla Məmmədova', note: 'Yataq otağının suvağı qəbul olundu', room: 'Yataq otağı', category: 'divar', lineItemId: 'li-n10', clientVisible: true },
  ];
  const payments: PaymentMilestone[] = [
    { id: 'pm-n1', title: 'Avans', share: 0.3, condition: 'Müqavilə imzalandıqda', status: 'paid' },
    { id: 'pm-n2', title: 'Kobud işlərin tamamlanması', share: 0.3, condition: 'Elektrik, santexnika və suvaq qəbul edildikdə', status: 'due' },
    { id: 'pm-n3', title: 'Üz örtükləri', share: 0.3, condition: 'Laminat, kafel və boya qəbul edildikdə', status: 'planned' },
    { id: 'pm-n4', title: 'Yekun təhvil', share: 0.1, condition: 'Yekun təhvil aktı təsdiqləndikdə', status: 'planned' },
  ];
  const projectCosts = [
    { id: 'pc-n1', label: 'Material daşınması və yükləmə', amount: 380 },
    { id: 'pc-n2', label: 'Lift və pilləkən mühafizəsi', amount: 160 },
    { id: 'pc-n3', label: 'Layihə koordinasiyası və nəzarət', amount: 450 },
  ];
  return {
    id: 'narimanov-2-otaq', name: 'Nərimanov, 2 otaqlı mənzil', district: 'Nərimanov', address: 'Bakı, Nərimanov r-nu, Təbriz küç. 76, mənzil 41',
    propertyKind: 'menzil', renovationKind: 'kapital', quality: 'standart', areaM2: 62.4, startDate: '2026-08-25', endDate: '2026-11-20',
    client: { name: 'Leyla Məmmədova', phone: '+994 55 318 24 61' }, contractor: CONTRACTOR, completion: 38, defaultMarginPercentage: 0.15,
    projectCosts, estimate, status: 'client_approved', changeOrders, expenses,
    receipts: [
      { id: 'rc-n1', fileName: 'konteyner_qebz.jpg', fileType: 'image', uploadedAt: '2026-08-28T16:10:00' },
      { id: 'rc-n2', fileName: 'santexnika_merkezi_0902.pdf', fileType: 'pdf', uploadedAt: '2026-09-02T13:05:00' },
      { id: 'rc-n3', fileName: 'bauhaus_suvaq.jpg', fileType: 'image', uploadedAt: '2026-09-09T12:44:00' },
      { id: 'rc-n4', fileName: 'bauhaus_styajka.jpg', fileType: 'image', uploadedAt: '2026-09-15T10:18:00' },
      { id: 'rc-n5', fileName: 'keramika_evi_faktura.pdf', fileType: 'pdf', uploadedAt: '2026-09-20T17:30:00' },
      { id: 'rc-n6', fileName: 'parket_dunyasi_laminat.pdf', fileType: 'pdf', uploadedAt: '2026-09-28T15:02:00' },
    ],
    photos, drawing: NRM_DRAWING, measurements: drawingMeasurements(id => reviewed.has(id) ? 'approved' : 'suggested'),
    approvals: [{ id: 'ap-n1', estimateVersion: 2, approvedAt: '2026-09-12T20:14:00', name: 'Leyla Məmmədova', phone: '+994 55 318 24 61', confirmedScope: true, total: 24860 }],
    revisionRequests: [{ id: 'rv-n1', estimateVersion: 1, createdAt: '2026-09-08T19:02:00', name: 'Leyla Məmmədova', message: 'Hamam üçün isti döşəmə əlavə etmək mümkündürmü? Qiymətini ayrıca görmək istəyirəm.' }],
    payments,
    included: ['Bütün söküntü işləri və tullantıların çıxarılması', 'Elektrik və santexnika xətlərinin tam yenilənməsi', 'Divarların hazırlanması və 2 qat boya', 'Laminat, kafel və asma tavan işləri', 'Sanitar avadanlıqların quraşdırılması', 'Yekun təmizlik'],
    excluded: ['Mətbəx mebeli və məişət texnikası', 'Pəncərələrin dəyişdirilməsi', 'Kondisioner avadanlığı (yalnız xətt hazırlığı daxildir)', 'Dekor, pərdə və yumşaq mebel', 'Bina idarəsinin icazə rüsumları'],
    share: {
      token: 'nrm-7f3k2q9d', createdAt: '2026-09-10T10:05:00', expiresAt: '2026-10-10T10:05:00', clientName: 'Leyla Məmmədova', phone: '+994 55 318 24 61',
      message: 'Salam, təmir layihəniz üzrə smeta hazırdır. İş həcmini, material və işçilik xərclərini nəzərdən keçirib təsdiqləyə bilərsiniz.',
      notifyOnApprove: true, attachPdf: true, snapshot: structuredClone(estimate), snapshotProjectCosts: structuredClone(projectCosts), snapshotMargin: 0.15,
    },
    exports: [],
    createdAt: '2026-08-12T09:30:00', updatedAt: '2026-10-04T18:20:00',
  };
}

/* ------------------------------------------------------------------ */
/* Supporting demo projects — generated from templates                */
/* ------------------------------------------------------------------ */

function rooms(prefix: string, list: Omit<RoomInput, 'id'>[]): RoomInput[] {
  return list.map((r, i) => ({ ...r, id: `${prefix}-r${i + 1}` }));
}

/** Creates expenses as a share of the planned amounts so the budget story stays consistent. */
function expensesFrom(sections: EstimateSection[], margin: number, plan: { category: WorkCategory; material?: number; labor?: number; vendor: string; date: string; desc: string; laborVendor?: string }[]): Expense[] {
  const out: Expense[] = [];
  plan.forEach((p, i) => {
    const s = sections.find(x => x.category === p.category);
    if (!s) return;
    const t = sectionTotals(s, margin);
    if (p.material) out.push({ id: `ex-g${i}m-${p.category}`, date: p.date, kind: 'material', category: p.category, description: `${p.desc} — material`, vendor: p.vendor, amount: Math.round((t.material + t.waste) * p.material), paymentStatus: 'paid' });
    if (p.labor) out.push({ id: `ex-g${i}l-${p.category}`, date: p.date, kind: 'labor', category: p.category, description: `${p.desc} — işçilik`, vendor: p.laborVendor ?? 'Usta briqadası', amount: Math.round(t.labor * p.labor), paymentStatus: p.labor >= 0.9 ? 'paid' : 'partial' });
  });
  return out;
}

function agShahar(): Project {
  const rs = rooms('ag', [
    { name: 'Qonaq otağı', area: 26.5, kind: 'living' }, { name: 'Yataq otağı', area: 18.2, kind: 'bed' }, { name: 'Uşaq otağı', area: 14.6, kind: 'bed' },
    { name: 'Mətbəx', area: 13.4, kind: 'kitchen' }, { name: 'Hamam', area: 6.2, kind: 'bath' }, { name: 'Dəhliz', area: 12.1, kind: 'hall' },
  ]);
  const measurements = roomMeasurements(rs, 'manual');
  const sections = generateSections(['sokuntu', 'elektrik', 'santexnika', 'divar', 'boya', 'dosheme', 'kafel', 'tavan', 'qapi', 'isiqlandirma', 'sanitar', 'temizlik'], {
    rooms: rs, quality: 'premium', measurementByRoom: Object.fromEntries(rs.map(r => [r.id, `m-${r.id}`])),
  }).map(s => ({ ...s, items: s.items.map(it => ({ ...it, status: 'approved' as const })) }));
  const estimate: Estimate = { id: 'est-ag', version: 1, createdAt: '2026-09-21T12:00:00', validUntil: '2026-10-21', sections };
  const expenses = expensesFrom(sections, 0.14, [
    { category: 'sokuntu', labor: 1, vendor: '—', laborVendor: 'Söküntü briqadası', date: '2026-09-25', desc: 'Söküntü işləri' },
    { category: 'elektrik', material: 0.62, labor: 0.4, vendor: 'Elektrik Dünyası', laborVendor: 'Tural Nəsirov (usta)', date: '2026-09-30', desc: 'Elektrik xətləri' },
    { category: 'santexnika', material: 0.7, vendor: 'Santexnika Mərkəzi', date: '2026-10-02', desc: 'Su xətləri' },
    { category: 'temizlik', labor: 0.5, vendor: '—', laborVendor: 'Təmiz Şəhər MMC', date: '2026-09-26', desc: 'Tullantıların daşınması' },
  ]);
  return {
    id: 'ag-seher-3-otaq', name: 'Ağ Şəhər, 3 otaqlı mənzil', district: 'Ağ Şəhər', address: 'Bakı, Xətai r-nu, Ağ Şəhər, Nobel pr. 15, mənzil 112',
    propertyKind: 'menzil', renovationKind: 'premium', quality: 'premium', areaM2: 91, startDate: '2026-09-24', endDate: '2027-01-30',
    client: { name: 'Fərid Abbasov', phone: '+994 50 227 61 09', email: 'farid.abbasov@mail.az' }, contractor: CONTRACTOR, completion: 18, defaultMarginPercentage: 0.14,
    projectCosts: [{ id: 'pc-a1', label: 'Material daşınması və yükləmə', amount: 650 }, { id: 'pc-a2', label: 'Layihə koordinasiyası və nəzarət', amount: 1200 }],
    estimate, status: 'client_approved', changeOrders: [
      { id: 'co-a1', number: 1, title: 'Uşaq otağında akustik panel', reason: 'Sifarişçi səs izolyasiyası üçün bir divara akustik panel istəyir.', date: '2026-10-03', requestedBy: 'client', requestedByName: 'Fərid Abbasov', category: 'divar', materialDelta: 420, laborDelta: 160, additionalCost: 0, status: 'draft', photoIds: [], lineItemIds: [] },
    ],
    expenses, receipts: [], photos: [
      { id: 'ph-a1', phase: 'before', date: '2026-09-24', uploadedBy: 'Rəşad Hüseynov', note: 'Qonaq otağı, ilkin vəziyyət', room: 'Qonaq otağı', category: 'sokuntu', clientVisible: true },
      { id: 'ph-a2', phase: 'during', date: '2026-10-01', uploadedBy: 'Tural Nəsirov', note: 'Elektrik paneli üçün niş açıldı', room: 'Dəhliz', category: 'elektrik', clientVisible: true },
    ],
    measurements, approvals: [{ id: 'ap-a1', estimateVersion: 1, approvedAt: '2026-09-23T11:30:00', name: 'Fərid Abbasov', phone: '+994 50 227 61 09', confirmedScope: true, total: 0 }],
    revisionRequests: [], payments: [
      { id: 'pm-a1', title: 'Avans', share: 0.25, condition: 'Müqavilə imzalandıqda', status: 'paid' },
      { id: 'pm-a2', title: 'Kobud işlər', share: 0.35, condition: 'Elektrik, santexnika və suvaq qəbul edildikdə', status: 'planned' },
      { id: 'pm-a3', title: 'Üz örtükləri', share: 0.3, condition: 'Döşəmə, kafel və boya qəbul edildikdə', status: 'planned' },
      { id: 'pm-a4', title: 'Yekun təhvil', share: 0.1, condition: 'Yekun təhvil aktı təsdiqləndikdə', status: 'planned' },
    ],
    included: ['Tam söküntü və tullantıların çıxarılması', 'Premium səviyyəli üz örtükləri', 'Asma tavan və gizli işıqlandırma', 'Sanitar avadanlıqların quraşdırılması'],
    excluded: ['Mətbəx mebeli və texnika', 'Dekor və mebel', 'Ağıllı ev sistemi'],
    exports: [], createdAt: '2026-09-18T15:00:00', updatedAt: '2026-10-03T12:40:00',
  };
}

function xetai(): Project {
  const rs = rooms('xt', [{ name: 'Hamam', area: 6.8, kind: 'bath' }, { name: 'Qonaq tualeti', area: 3, kind: 'bath' }]);
  const measurements = roomMeasurements(rs, 'manual');
  const sections = generateSections(['sokuntu', 'santexnika', 'kafel', 'sanitar', 'isiqlandirma', 'temizlik'], {
    rooms: rs, quality: 'standart', measurementByRoom: Object.fromEntries(rs.map(r => [r.id, `m-${r.id}`])),
  }).map(s => ({ ...s, items: s.items.map(it => ({ ...it, status: 'approved' as const })) }));
  const estimate: Estimate = { id: 'est-xt', version: 1, createdAt: '2026-08-30T10:00:00', validUntil: '2026-09-30', sections };
  const expenses = expensesFrom(sections, 0.12, [
    { category: 'sokuntu', labor: 1, vendor: '—', laborVendor: 'Söküntü briqadası', date: '2026-09-08', desc: 'Söküntü' },
    { category: 'santexnika', material: 1.08, labor: 0.9, vendor: 'Santexnika Mərkəzi', laborVendor: 'Kamran Əliyev (usta)', date: '2026-09-12', desc: 'Su və kanalizasiya xətləri' },
    { category: 'kafel', material: 1.31, labor: 0.75, vendor: 'Keramika Evi', laborVendor: 'Kafelçi Anar Bayramov', date: '2026-09-22', desc: 'Kafel işləri' },
    { category: 'sanitar', material: 0.95, vendor: 'Santexnika Mərkəzi', date: '2026-09-29', desc: 'Sanitar avadanlıqlar' },
    { category: 'temizlik', labor: 1, vendor: '—', laborVendor: 'Təmiz Şəhər MMC', date: '2026-09-09', desc: 'Tullantıların daşınması' },
  ]);
  return {
    id: 'xetai-sanitar-qovsaq', name: 'Xətai, sanitar qovşağın təmiri', district: 'Xətai', address: 'Bakı, Xətai r-nu, Babək pr. 42, mənzil 8',
    propertyKind: 'menzil', renovationKind: 'standart', quality: 'standart', areaM2: 9.8, startDate: '2026-09-07', endDate: '2026-10-15',
    client: { name: 'Səbinə Rzayeva', phone: '+994 70 544 18 32' }, contractor: CONTRACTOR, completion: 64, defaultMarginPercentage: 0.12,
    projectCosts: [{ id: 'pc-x1', label: 'Material daşınması', amount: 120 }],
    estimate, status: 'client_approved', changeOrders: [
      { id: 'co-x1', number: 1, title: 'Duş kabinasının şüşə arakəsmə ilə əvəzlənməsi', reason: 'Vanna əvəzinə duş zonası istənilir. Trap və şüşə arakəsmə əlavə olunur.', date: '2026-10-01', requestedBy: 'client', requestedByName: 'Səbinə Rzayeva', category: 'sanitar', materialDelta: 290, laborDelta: 60, additionalCost: 0, status: 'pending', photoIds: [], lineItemIds: [] },
    ],
    expenses, receipts: [], photos: [
      { id: 'ph-x1', phase: 'during', date: '2026-09-21', uploadedBy: 'Anar Bayramov', note: 'Hamam divarlarında kafel düzülüşü', room: 'Hamam', category: 'kafel', clientVisible: true },
    ],
    measurements, approvals: [{ id: 'ap-x1', estimateVersion: 1, approvedAt: '2026-09-02T09:10:00', name: 'Səbinə Rzayeva', phone: '+994 70 544 18 32', confirmedScope: true, total: 0 }],
    revisionRequests: [], payments: [
      { id: 'pm-x1', title: 'Avans', share: 0.4, condition: 'Müqavilə imzalandıqda', status: 'paid' },
      { id: 'pm-x2', title: 'Kafel işlərinin qəbulu', share: 0.4, condition: 'Kafel və santexnika qəbul edildikdə', status: 'due' },
      { id: 'pm-x3', title: 'Yekun təhvil', share: 0.2, condition: 'Yekun təhvil aktı təsdiqləndikdə', status: 'planned' },
    ],
    included: ['Köhnə kafelin sökülməsi', 'Su və kanalizasiya xətlərinin dəyişdirilməsi', 'Kafel işləri', 'Sanitar avadanlıqların quraşdırılması'],
    excluded: ['Paltaryuyan maşın', 'Güzgü və aksesuarlar'],
    exports: [], createdAt: '2026-08-28T11:00:00', updatedAt: '2026-10-02T09:15:00',
  };
}

function yasamal(): Project {
  const tpl = TEMPLATES.find(t => t.id === 'tpl-office')!;
  const rs = rooms('ys', tpl.rooms);
  const measurements = roomMeasurements(rs, 'manual');
  const sections = generateSections(tpl.packages, { rooms: rs, quality: 'standart', measurementByRoom: Object.fromEntries(rs.map(r => [r.id, `m-${r.id}`])) });
  const estimate: Estimate = { id: 'est-ys', version: 1, createdAt: '2026-10-05T16:00:00', validUntil: '2026-11-04', sections };
  return {
    id: 'yasamal-ofis', name: 'Yasamal, ofis təmiri', district: 'Yasamal', address: 'Bakı, Yasamal r-nu, Şərifzadə küç. 210, 3-cü mərtəbə',
    propertyKind: 'ofis', renovationKind: 'standart', quality: 'standart', areaM2: 116, startDate: '2026-10-20', endDate: '2026-12-25',
    client: { name: '“Kaspi Logistika” MMC — Orxan Səfərov', phone: '+994 12 565 40 18', email: 'o.seferov@kaspilog.az' }, contractor: CONTRACTOR, completion: 0, defaultMarginPercentage: 0.13,
    projectCosts: [{ id: 'pc-y1', label: 'Material daşınması və yükləmə', amount: 420 }, { id: 'pc-y2', label: 'Gecə iş rejimi üçün əlavə', amount: 900 }],
    estimate, status: 'draft', changeOrders: [], expenses: [], receipts: [], photos: [], measurements, approvals: [], revisionRequests: [],
    payments: [
      { id: 'pm-y1', title: 'Avans', share: 0.3, condition: 'Müqavilə imzalandıqda', status: 'planned' },
      { id: 'pm-y2', title: 'Kobud işlər', share: 0.4, condition: 'Elektrik və tavan işləri qəbul edildikdə', status: 'planned' },
      { id: 'pm-y3', title: 'Yekun təhvil', share: 0.3, condition: 'Yekun təhvil aktı təsdiqləndikdə', status: 'planned' },
    ],
    included: ['Elektrik və işıqlandırma', 'Asma tavan', 'Divar və döşəmə işləri', 'Sanitar qovşaq'],
    excluded: ['Ofis mebeli', 'Şəbəkə və server avadanlığı', 'Kondisioner sistemi'],
    exports: [], createdAt: '2026-10-05T15:30:00', updatedAt: '2026-10-05T16:40:00',
  };
}

export function createSeedProjects(): Project[] {
  const list = [narimanov(), agShahar(), xetai(), yasamal()];
  // Approved totals for generated projects are filled from the computed estimate.
  for (const p of list) {
    if (p.approvals.length && p.approvals[0].total === 0) {
      const total = p.estimate.sections.reduce((s, sec) => s + sectionTotals(sec, p.defaultMarginPercentage).rowsTotal, 0) + p.projectCosts.reduce((s, c) => s + c.amount, 0);
      p.approvals[0].total = round2(total);
    }
  }
  return list;
}
