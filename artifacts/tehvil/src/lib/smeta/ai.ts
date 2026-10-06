/**
 * Mock "AI" services for AI Smeta.
 *
 * Nothing here runs a model. Drawing takeoff, receipt reading and market
 * prices return deterministic demo results; insights and assistant answers are
 * rule-based on the current project numbers. Every result is a proposal that
 * the contractor reviews before it reaches the client.
 *
 * TODO(ai): connect `analyzeDrawing` to a takeoff service, `extractReceipt` to
 * OCR, `fetchMarketPrice` to a price feed and `askAssistant` to an LLM endpoint
 * that receives the same project context built in `projectContext()`.
 */
import { allItems, budgetSummary, changeTotals, lineTotals, planVsActual, projectTotals, round2 } from './calc';
import { BREAKDOWN_GROUP, CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_PACKAGES, QUALITY_FACTOR, QUALITY_LABEL, forecastDays } from './catalog';
import { azn, dateAz, num, pct, todayISO, qty } from './format';
import { SAMPLE_DRAWING, drawingMeasurements } from './mock-data';
import type { Drawing, EstimateLineItem, Measurement, Project, QualityLevel, ReceiptSuggestion, WorkCategory } from './types';

const wait = (ms: number) => new Promise(r => window.setTimeout(r, ms));

export const TAKEOFF_STEPS = ['Fayl oxunur', 'Divar konturları tanınır', 'Otaqlar və sahələr hesablanır', 'Qapı və pəncərələr aşkarlanır'];

export async function analyzeDrawing(file: { name: string }, onStep?: (i: number) => void): Promise<{ drawing: Drawing; measurements: Measurement[] }> {
  for (let i = 0; i < TAKEOFF_STEPS.length; i++) { onStep?.(i); await wait(550); }
  const ext = file.name.split('.').pop()?.toLowerCase();
  const fileType = ext === 'png' ? 'png' : ext === 'jpg' || ext === 'jpeg' ? 'jpg' : 'pdf';
  return {
    drawing: { ...structuredClone(SAMPLE_DRAWING), id: `dr-${Date.now().toString(36)}`, fileName: file.name, fileType, uploadedAt: new Date().toISOString() },
    measurements: drawingMeasurements(),
  };
}

const KNOWN_MERCHANTS: { match: RegExp; merchant: string; category: WorkCategory }[] = [
  { match: /bauhaus/i, merchant: 'Bauhaus Bakı', category: 'divar' },
  { match: /keramika|kafel/i, merchant: 'Keramika Evi', category: 'kafel' },
  { match: /parket|laminat/i, merchant: 'Parket Dünyası', category: 'dosheme' },
  { match: /santex/i, merchant: 'Santexnika Mərkəzi', category: 'santexnika' },
  { match: /elektrik|kabel/i, merchant: 'Elektrik Dünyası', category: 'elektrik' },
];

export async function extractReceipt(file: { name: string; size: number }): Promise<ReceiptSuggestion> {
  await wait(1300);
  const known = KNOWN_MERCHANTS.find(m => m.match.test(file.name));
  const seed = (file.size % 9000) / 100;
  return {
    merchant: known?.merchant ?? 'Bakı Tikinti Bazarı',
    date: todayISO(),
    total: round2(120 + seed * 3.7),
    category: known?.category ?? 'elektrik',
    kind: 'material',
    confidence: known ? 0.86 : 0.64,
  };
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function fetchMarketPrice(item: EstimateLineItem): Promise<{ price: number; reference: string }> {
  await wait(700);
  const delta = ((hash(item.id + todayISO()) % 100) / 100) * 0.1 - 0.03;
  return { price: round2(item.materialUnitPrice * (1 + delta)), reference: 'Bakı tikinti bazarları, orta qiymət' };
}

export const isPriceStale = (item: EstimateLineItem, days = 21) =>
  item.materialUnitPrice > 0 && (Date.now() - new Date(`${item.priceSource.updatedAt}T00:00:00`).getTime()) / 864e5 > days;

/* ------------------------------------------------------------------ */
/* Budget insights                                                    */
/* ------------------------------------------------------------------ */

export interface Insight { tone: 'ok' | 'warn' | 'risk' | 'info'; text: string; note?: string }

export function budgetInsights(p: Project): Insight[] {
  const out: Insight[] = [];
  const b = budgetSummary(p);
  for (const c of b.overspentCategories.slice(0, 2)) {
    out.push({ tone: c.ratio > 0.15 ? 'risk' : 'warn', text: `${CATEGORY_LABEL[c.category].replace(' işləri', '')} materialları üzrə xərc ilkin plandan ${Math.round(c.ratio * 100)}% yüksəkdir.`, note: `Plan: ${azn(c.planned)}, faktiki: ${azn(c.actual)}. Qəbzləri və qiymət fərqini yoxlayın.` });
  }
  const pva = planVsActual(p);
  const elec = p.estimate.sections.filter(s => s.category === 'elektrik').flatMap(s => s.items).some(i => i.materialUnitPrice > 0);
  const elecBought = p.expenses.some(e => e.category === 'elektrik' && e.kind === 'material');
  const elecLabor = p.expenses.some(e => e.category === 'elektrik' && e.kind === 'labor');
  if (elec && !elecBought && (elecLabor || p.completion >= 25)) out.push({ tone: 'info', text: 'Elektrik işləri üzrə material alışları hələ əlavə edilməyib.', note: elecLabor ? 'İşçilik ödənişi var, amma kabel və avtomat qəbzləri yoxdur.' : 'Qəbzlər əlavə edildikdə plan-fakt müqayisəsi dəqiqləşəcək.' });
  const bathTile = allItems(p.estimate).find(i => /kafel/i.test(i.name) && /hamam/i.test(i.zone) && i.wastePercentage > 0);
  if (bathTile) out.push({ tone: 'ok', text: `Hamam kafeli üçün ${pct(bathTile.wastePercentage)} ehtiyat nəzərə alınıb.`, note: 'Kəsim və qırılma üçün standart ehtiyat.' });
  if (!out.length && pva.actualMaterial === 0) out.push({ tone: 'info', text: 'Hələ faktiki xərc daxil edilməyib.', note: 'İlk qəbzlər əlavə edildikdən sonra plan-fakt yoxlaması aparılacaq.' });
  if (b.health === 'risk') out.unshift({ tone: 'risk', text: `Proqnoz yekun xərc razılaşdırılmış büdcəni ${azn(b.forecastFinalCost - b.agreedBudget)} keçə bilər.`, note: 'Qalan işlərin qiymətlərini və təsdiq gözləyən dəyişiklikləri yoxlayın.' });
  return out.slice(0, 3);
}

export function portfolioInsight(list: Project[]): string {
  const over = list.filter(p => budgetSummary(p).overspentCategories.length > 0).length;
  if (over > 0) return `${over} layihədə material xərcləri planı keçir. Qiymətləri və satınalma qəbzlərini yoxlayın.`;
  const pending = list.reduce((s, p) => s + changeTotals(p.changeOrders).pendingCount, 0);
  if (pending > 0) return `${pending} dəyişiklik sifarişçinin təsdiqini gözləyir. Qərar verilməmiş işlərə başlamamağınız tövsiyə olunur.`;
  return 'Bütün layihələr plan daxilindədir. Qiymətləri ayda bir dəfə yeniləmək tövsiyə olunur.';
}

/* ------------------------------------------------------------------ */
/* Price scenarios                                                    */
/* ------------------------------------------------------------------ */

export interface Scenario { quality: QualityLevel; label: string; material: number; labor: number; other: number; total: number; days: number }

/** Re-prices the current estimate at each quality level (relative to the project's own level). */
export function priceScenarios(p: Project): Scenario[] {
  const t = projectTotals(p);
  const base = QUALITY_FACTOR[p.quality];
  return (['ekonom', 'standart', 'premium'] as QualityLevel[]).map(q => {
    const f = QUALITY_FACTOR[q];
    const material = round2((t.material + t.waste) * (f.material / base.material));
    const labor = round2(t.labor * (f.labor / base.labor));
    const other = round2(t.additional + t.projectCosts);
    const marginShare = t.rowsTotal - t.margin > 0 ? t.margin / (t.rowsTotal - t.margin) : 0;
    const total = round2(material + labor + t.additional + (material + labor + t.additional) * marginShare + t.projectCosts);
    return { quality: q, label: QUALITY_LABEL[q], material, labor, other, total, days: forecastDays(p.areaM2, p.renovationKind, q) };
  });
}

/* ------------------------------------------------------------------ */
/* Assistant                                                          */
/* ------------------------------------------------------------------ */

export const ASSISTANT_PROMPTS = [
  'Bu smetada nələr çatışmır?',
  'Xərcləri necə azaltmaq olar?',
  'Ən riskli qiymətləri göstər',
  'Material və işçilik payını izah et',
  'Sifarişçi üçün qısa xülasə hazırla',
  'Bu layihə üçün ödəniş planı təklif et',
] as const;

/** Compact, serialisable context that a real LLM endpoint would receive. */
export function projectContext(p: Project) {
  const t = projectTotals(p);
  return {
    name: p.name, area: p.areaM2, renovation: p.renovationKind, quality: p.quality, total: t.total,
    sections: p.estimate.sections.map(s => ({ category: s.category, items: s.items.map(i => ({ name: i.name, qty: i.quantity, unit: i.unit, total: lineTotals(i, p.defaultMarginPercentage).rowTotal })) })),
    budget: budgetSummary(p), changes: changeTotals(p.changeOrders),
  };
}

function answerMissing(p: Project): string {
  const present = new Set(p.estimate.sections.filter(s => s.items.length).map(s => s.category));
  const expected = DEFAULT_PACKAGES[p.renovationKind];
  const missing = CATEGORY_ORDER.filter(c => expected.includes(c) && !present.has(c));
  const lines: string[] = ['Mövcud məlumatlara əsasən smetanı təmir növü ilə müqayisə etdim.'];
  if (missing.length) lines.push(`Bu təmir növü üçün adətən olan, amma smetada görünməyən iş paketləri:\n${missing.map(c => `• ${CATEGORY_LABEL[c]}`).join('\n')}`);
  const items = allItems(p.estimate);
  const checks: string[] = [];
  if (present.has('kafel') && !items.some(i => /hidroizol/i.test(i.name))) checks.push('Hamam üçün hidroizolyasiya sətri yoxdur — kafeldən əvvəl adətən tələb olunur.');
  if (present.has('divar') && !items.some(i => /astar/i.test(i.name))) checks.push('Şpaklyovkadan əvvəl astar sətri görünmür.');
  if (present.has('dosheme') && !items.some(i => /plintus/i.test(i.name))) checks.push('Döşəmə üçün plintus nəzərə alınmayıb.');
  if (!p.projectCosts.some(c => /daşın/i.test(c.label))) checks.push('Material daşınması üçün layihə səviyyəsində xərc yoxdur.');
  if (checks.length) lines.push(`Yoxlanmalı məqamlar:\n${checks.map(c => `• ${c}`).join('\n')}`);
  if (!missing.length && !checks.length) lines.push('Əsas iş paketləri və köməkçi işlər yerindədir. Görünən boşluq aşkar etmədim.');
  lines.push('Bu, ilkin tövsiyədir — obyektin real vəziyyətini yalnız yerində baxış təsdiqləyə bilər.');
  return lines.join('\n\n');
}

function answerSavings(p: Project): string {
  const rows = allItems(p.estimate).map(i => ({ i, t: lineTotals(i, p.defaultMarginPercentage) })).sort((a, b) => b.t.materialTotal - a.t.materialTotal).slice(0, 3);
  const eco = priceScenarios(p).find(s => s.quality === 'ekonom');
  const total = projectTotals(p).total;
  const lines = ['Təxmini olaraq ən çox qənaət material seçimi hesabına mümkündür. Ən böyük material sətirləri:'];
  lines.push(rows.map(({ i, t }) => `• ${i.name} — ${azn(t.materialTotal)} (${num(i.quantity)} ${i.unit} × ${num(i.materialUnitPrice, 2)} AZN)`).join('\n'));
  lines.push('Mümkün addımlar:\n• Bu sətirlər üçün bir səviyyə aşağı brend/sinif alternativi təklif edin.\n• Ehtiyat faizini yalnız kəsim tələb edən materiallarda saxlayın.\n• Materialları bir təchizatçıdan toplu alış endirimi ilə sifariş edin.');
  if (eco && p.quality !== 'ekonom') lines.push(`Ekonom ssenaridə smeta təxminən ${azn(eco.total)} olardı (indiki ${azn(total)}). Keyfiyyət fərqini sifarişçiyə açıq izah etmək vacibdir.`);
  lines.push('Bu, ilkin tövsiyədir; işçilik keyfiyyətindən qənaət etmək tövsiyə olunmur.');
  return lines.join('\n\n');
}

function answerRisky(p: Project): string {
  const items = allItems(p.estimate).filter(i => i.materialUnitPrice > 0);
  const stale = items.filter(i => isPriceStale(i));
  const manual = items.filter(i => i.priceSource.kind === 'manual');
  const t = projectTotals(p);
  const heavy = items.map(i => ({ i, share: lineTotals(i, p.defaultMarginPercentage).rowTotal / (t.total || 1) })).filter(x => x.share > 0.06).sort((a, b) => b.share - a.share);
  const lines = ['Mövcud məlumatlara əsasən qiymət riski olan sətirlər:'];
  if (stale.length) lines.push(`Köhnəlmiş bazar qiyməti (21 gündən çox):\n${stale.map(i => `• ${i.name} — son yenilənmə ${dateAz(i.priceSource.updatedAt)}`).join('\n')}`);
  if (manual.length) lines.push(`Mənbəsiz, əl ilə daxil edilmiş qiymətlər:\n${manual.map(i => `• ${i.name} — ${num(i.materialUnitPrice, 2)} AZN/${i.unit}`).join('\n')}`);
  if (heavy.length) lines.push(`Ümumi məbləğə ən çox təsir edən sətirlər:\n${heavy.slice(0, 3).map(x => `• ${x.i.name} — smetanın ${pct(x.share)}`).join('\n')}`);
  if (lines.length === 1) lines.push('Diqqət tələb edən qiymət aşkar etmədim.');
  lines.push('Yoxlanmalı məqam: “Qiyməti yenilə” ilə bazar qiymətini təzələyin və ya təchizatçıdan yazılı təklif alın.');
  return lines.join('\n\n');
}

function answerShare(p: Project): string {
  const t = projectTotals(p);
  const groups = new Map<string, number>();
  p.estimate.sections.forEach(s => s.items.forEach(i => { const l = lineTotals(i, p.defaultMarginPercentage); groups.set(BREAKDOWN_GROUP[s.category], (groups.get(BREAKDOWN_GROUP[s.category]) ?? 0) + l.rowTotal); }));
  const base = t.material + t.waste + t.labor;
  return [
    `Smetanın ${azn(t.total)} məbləği belə formalaşır:`,
    `• Materiallar (ehtiyatla birlikdə): ${azn(t.material + t.waste)} — birbaşa xərclərin ${pct((t.material + t.waste) / (base || 1))}\n• İşçilik: ${azn(t.labor)} — ${pct(t.labor / (base || 1))}\n• Əlavə xərclər: ${azn(t.additional + t.projectCosts)}\n• Podratçı marjası: ${azn(t.margin)}`,
    `Kapital təmirdə material payının 55–65% olması adi haldır. Bu smetada ${pct((t.material + t.waste) / (base || 1))}-dir.`,
    `Bölmələr üzrə: ${[...groups.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${azn(v)}`).join(', ')}.`,
    'Təxmini müqayisədir; bazar orta göstəriciləri obyektin xüsusiyyətlərindən asılı olaraq dəyişir.',
  ].join('\n\n');
}

function answerClientSummary(p: Project): string {
  const t = projectTotals(p);
  const ch = changeTotals(p.changeOrders);
  const sections = p.estimate.sections.filter(s => s.items.length).map(s => s.title.toLocaleLowerCase('az'));
  return [
    `Hörmətli ${p.client.name.split(' ')[0]},`,
    `${p.name} üzrə smeta ${qty(p.areaM2)} m² sahə üçün hazırlanıb və ${sections.slice(0, 5).join(', ')}${sections.length > 5 ? ' və digər işləri' : ''} əhatə edir.`,
    `Ümumi məbləğ ${azn(t.total)} təşkil edir: materiallar ${azn(t.material + t.waste)}, işçilik ${azn(t.labor)}, əlavə xərclər və podratçı xidməti ${azn(t.additional + t.projectCosts + t.margin)}.`,
    ch.approved ? `Təsdiqlənmiş əlavə işlər: ${azn(ch.approved)}. Yekun məbləğ: ${azn(t.total + ch.approved)}.` : 'Hazırda təsdiqlənmiş əlavə iş yoxdur.',
    'Hər bir sətirdə miqdarın haradan götürüldüyü göstərilib. Sonradan yaranan dəyişikliklər yalnız sizin təsdiqinizlə əlavə olunacaq.',
    '— Bu mətni göndərməzdən əvvəl redaktə edə bilərsiniz.',
  ].join('\n\n');
}

function answerPayments(p: Project): string {
  const t = projectTotals(p).total;
  const plan = p.areaM2 < 20
    ? [['Avans', 0.4, 'Müqavilə imzalandıqda'], ['Əsas işlər', 0.4, 'Kafel və santexnika qəbul edildikdə'], ['Yekun', 0.2, 'Təhvil aktından sonra']] as const
    : [['Avans (materiallar)', 0.3, 'Müqavilə imzalandıqda'], ['Kobud işlər', 0.3, 'Elektrik, santexnika, suvaq qəbul edildikdə'], ['Üz örtükləri', 0.3, 'Döşəmə, kafel və boya qəbul edildikdə'], ['Yekun təhvil', 0.1, 'Foto sübutlu təhvil aktından sonra']] as const;
  return [
    `Təxmini olaraq ${azn(t)} üçün mərhələli ödəniş planı:`,
    plan.map(([title, share, cond]) => `• ${title} — ${pct(share)} · ${azn(t * share)}\n  ${cond}`).join('\n'),
    'Hər ödənişi Təhvil-də müvafiq mərhələnin foto sübutla qəbuluna bağlamaq hər iki tərəf üçün aydınlıq yaradır.',
    'Bu, ilkin tövsiyədir; son şərtlər müqavilədə razılaşdırılmalıdır.',
  ].join('\n\n');
}

export async function askAssistant(p: Project, prompt: string): Promise<string> {
  await wait(650 + Math.min(900, prompt.length * 12));
  const q = prompt.toLocaleLowerCase('az');
  if (/çatışm|unud|nə yox/.test(q)) return answerMissing(p);
  if (/azalt|qənaət|ucuz/.test(q)) return answerSavings(p);
  if (/risk|qiymət/.test(q) && !/ödəniş/.test(q)) return answerRisky(p);
  if (/pay|izah|material və işçilik/.test(q)) return answerShare(p);
  if (/xülasə|sifarişçi üçün/.test(q)) return answerClientSummary(p);
  if (/ödəniş|plan/.test(q)) return answerPayments(p);
  const b = budgetSummary(p);
  return [
    'Sualınızı mövcud layihə məlumatları ilə cavablandırmağa çalışdım.',
    `• Plan büdcəsi: ${azn(b.plannedBudget)}\n• Faktiki xərc: ${azn(b.actualSpending)}\n• Proqnoz yekun xərc: ${azn(b.forecastFinalCost)}\n• Tamamlanma: ${b.completion}%`,
    'Daha dəqiq cavab üçün yuxarıdakı hazır suallardan birini seçin və ya sualı konkret iş paketi ilə yazın.',
  ].join('\n\n');
}
