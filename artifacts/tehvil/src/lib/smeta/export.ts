/**
 * Excel and PDF export for estimates.
 *
 * Excel is generated in the browser (see ./xlsx.ts). PDF uses the
 * print-optimised `/smeta/:id/print` view and the browser's "Save as PDF",
 * the same approach as the existing renovation passport.
 *
 * TODO(api): for archived, signed documents add `POST /api/smeta/:id/exports`
 * that renders the same sheets server-side and stores the file with the project.
 */
import { budgetSummary, changeImpact, changeTotals, lineTotals, materialByCategory, planVsActual, projectTotals, round2 } from './calc';
import { CATEGORY_LABEL, CATEGORY_ORDER, PROPERTY_LABEL, QUALITY_LABEL, RENOVATION_LABEL } from './catalog';
import { dateAz, todayISO, uid } from './format';
import type { ChangeOrder, ExportJob, Expense, Project, WorkCategory } from './types';
import { buildXlsx, downloadBlob, type XCell, type XSheet } from './xlsx';

export const CHANGE_STATUS_LABEL: Record<ChangeOrder['status'], string> = { draft: 'Qaralama', pending: 'Təsdiq gözləyir', approved: 'Sifarişçi təsdiq edib', rejected: 'Rədd edilib' };
export const PAYMENT_STATUS_LABEL: Record<Expense['paymentStatus'], string> = { paid: 'Ödənilib', partial: 'Qismən ödənilib', unpaid: 'Ödənilməyib' };
export const PRICE_SOURCE_LABEL = { market: 'Bazar qiyməti', contractor: 'Podratçı qiyməti', manual: 'Manual daxil edilib' } as const;

const H = (v: string): XCell => ({ v, s: 'header' });
const M = (v: number): XCell => ({ v: round2(v), s: 'money' });
const MB = (v: number): XCell => ({ v: round2(v), s: 'moneyBold' });
const B = (v: string): XCell => ({ v, s: 'bold' });

const TRANSLIT: Record<string, string> = { ə: 'e', Ə: 'E', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U', ğ: 'g', Ğ: 'G', ş: 's', Ş: 'S', ç: 'c', Ç: 'C' };
export function fileSlug(name: string) {
  return name.replace(/[əƏıİöÖüÜğĞşŞçÇ]/g, c => TRANSLIT[c] ?? c).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function buildWorkbook(p: Project): XSheet[] {
  const t = projectTotals(p);
  const b = budgetSummary(p);
  const ch = changeTotals(p.changeOrders);
  const generated = dateAz(new Date());

  const summary: XSheet = {
    name: 'Xülasə', widths: [34, 22, 46],
    rows: [
      [{ v: `Smeta — ${p.name}`, s: 'title' }],
      [{ v: `Versiya v${p.estimate.version} · Hazırlanma tarixi: ${generated} · Təhvil AI Smeta`, s: 'muted' }],
      [],
      [H('Layihə məlumatları'), H('')],
      ['Ünvan', p.address], ['Obyekt növü', PROPERTY_LABEL[p.propertyKind]], ['Təmir növü', RENOVATION_LABEL[p.renovationKind]], ['Keyfiyyət səviyyəsi', QUALITY_LABEL[p.quality]],
      ['Ümumi sahə, m²', { v: p.areaM2, s: 'number' }], ['Plan tarixləri', `${dateAz(p.startDate)} — ${dateAz(p.endDate)}`],
      ['Sifarişçi', `${p.client.name}, ${p.client.phone}`], ['Podratçı', `${p.contractor.name} (${p.contractor.company}), ${p.contractor.phone}`],
      [],
      [H('Smeta'), H('Məbləğ, AZN')],
      ['Materiallar', M(t.material)], ['İşçilik', M(t.labor)], ['Əlavə xərclər (sətirlər üzrə)', M(t.additional)], ['Ehtiyat / tullantı', M(t.waste)],
      ['Podratçı marjası', M(t.margin)], ['Layihə səviyyəsində xərclər', M(t.projectCosts)], [B('Ümumi məbləğ'), MB(t.total)],
      [],
      [H('Büdcə nəzarəti'), H('Məbləğ, AZN')],
      ['Plan büdcəsi', M(b.plannedBudget)], ['Təsdiqlənmiş əlavə işlər', M(ch.approved)], ['Razılaşdırılmış büdcə', M(b.agreedBudget)], ['Faktiki xərc', M(b.actualSpending)],
      ['Qalıq büdcə', M(b.remainingBudget)], ['Proqnoz yekun xərc', M(b.forecastFinalCost)], ['Tamamlanma', { v: b.completion / 100, s: 'percent' }],
      [],
      [{ v: 'Qeyd: ölçülər AI tərəfindən ilkin təklif kimi hazırlanıb və podratçı tərəfindən yoxlanılıb. Sonradan təsdiqlənən dəyişikliklər ayrıca qeydə alınır.', s: 'muted' }],
    ],
  };

  const detailRows: XCell[][] = [[H('Bölmə'), H('İşin adı'), H('Otaq / Zona'), H('Vahid'), H('Miqdar'), H('Material vahid qiyməti'), H('Material məbləği'), H('İşçilik vahid qiyməti'), H('İşçilik məbləği'), H('Əlavə xərc'), H('Ehtiyat'), H('Marja'), H('Cəmi'), H('Miqdarın mənbəyi'), H('Qiymət mənbəyi')]];
  for (const s of p.estimate.sections) {
    if (!s.items.length) continue;
    let sub = 0;
    for (const it of s.items) {
      const l = lineTotals(it, p.defaultMarginPercentage);
      sub += l.rowTotal;
      detailRows.push([s.title, it.name, it.zone, it.unit, { v: it.quantity, s: 'number' }, M(it.materialUnitPrice), M(l.materialTotal), M(it.laborUnitPrice), M(l.laborTotal), M(l.additionalCost), M(l.wasteAmount), M(l.marginAmount), M(l.rowTotal), it.quantitySource.label, PRICE_SOURCE_LABEL[it.priceSource.kind]]);
    }
    detailRows.push([B(`${s.title} — cəmi`), '', '', '', '', '', '', '', '', '', '', '', MB(sub)]);
  }
  for (const c of p.projectCosts) detailRows.push([B('Layihə xərci'), c.label, '', 'xidmət', '', '', '', '', '', M(c.amount), '', '', M(c.amount)]);
  detailRows.push([B('ÜMUMİ'), '', '', '', '', '', MB(t.material), '', MB(t.labor), MB(t.additional + t.projectCosts), MB(t.waste), MB(t.margin), MB(t.total)]);
  const detail: XSheet = { name: 'Detallı smeta', rows: detailRows, freezeRow: 1, widths: [24, 38, 26, 9, 10, 14, 14, 14, 14, 12, 12, 12, 14, 40, 20] };

  const mats = new Map<string, { unit: string; qty: number; waste: number; price: number; amount: number; source: string; updated: string }>();
  for (const it of p.estimate.sections.flatMap(s => s.items)) {
    if (it.materialUnitPrice <= 0) continue;
    const l = lineTotals(it, p.defaultMarginPercentage);
    const key = `${it.name}|${it.unit}`;
    const prev = mats.get(key);
    mats.set(key, { unit: it.unit, qty: round2((prev?.qty ?? 0) + it.quantity), waste: it.wastePercentage, price: it.materialUnitPrice, amount: round2((prev?.amount ?? 0) + l.materialTotal + l.wasteAmount), source: PRICE_SOURCE_LABEL[it.priceSource.kind], updated: dateAz(it.priceSource.updatedAt) });
  }
  const materials: XSheet = {
    name: 'Material siyahısı', freezeRow: 1, widths: [38, 9, 11, 10, 16, 14, 16, 20, 18],
    rows: [[H('Material'), H('Vahid'), H('Miqdar'), H('Ehtiyat'), H('Ehtiyatla miqdar'), H('Vahid qiymət'), H('Məbləğ (ehtiyatla)'), H('Qiymət mənbəyi'), H('Son yenilənmə')],
      ...[...mats.entries()].map(([k, m]) => [k.split('|')[0], m.unit, { v: m.qty, s: 'number' as const }, { v: m.waste, s: 'percent' as const }, { v: round2(m.qty * (1 + m.waste)), s: 'number' as const }, M(m.price), M(m.amount), m.source, m.updated]),
      [B('Cəmi'), '', '', '', '', '', MB(t.material + t.waste)]],
  };

  const laborRows: XCell[][] = [[H('Bölmə'), H('İş'), H('Otaq / Zona'), H('Vahid'), H('Miqdar'), H('Vahid qiymət'), H('Məbləğ')]];
  for (const s of p.estimate.sections) for (const it of s.items) if (it.laborUnitPrice > 0) laborRows.push([s.title, it.name, it.zone, it.unit, { v: it.quantity, s: 'number' }, M(it.laborUnitPrice), M(lineTotals(it, p.defaultMarginPercentage).laborTotal)]);
  laborRows.push([B('Cəmi'), '', '', '', '', '', MB(t.labor)]);
  const labor: XSheet = { name: 'İşçilik planı', rows: laborRows, freezeRow: 1, widths: [24, 38, 26, 9, 10, 14, 14] };

  const changes: XSheet = {
    name: 'Dəyişikliklər', freezeRow: 1, widths: [8, 40, 50, 16, 22, 14, 14, 12, 14, 22],
    rows: [[H('№'), H('Dəyişiklik'), H('Səbəb'), H('Tarix'), H('Tələb edən'), H('Material fərqi'), H('İşçilik fərqi'), H('Əlavə xərc'), H('Cəmi təsir'), H('Status')],
      ...p.changeOrders.map(c => [`DS-${String(c.number).padStart(3, '0')}`, c.title, c.reason, dateAz(c.date), c.requestedByName, M(c.materialDelta), M(c.laborDelta), M(c.additionalCost), M(changeImpact(c)), CHANGE_STATUS_LABEL[c.status]]),
      [], [B('Təsdiqlənmiş'), '', '', '', '', '', '', '', MB(ch.approved)], [B('Təsdiq gözləyən'), '', '', '', '', '', '', '', MB(ch.pending)]],
  };

  const pva = planVsActual(p);
  const mc = materialByCategory(p);
  const laborActual = new Map<WorkCategory, number>();
  const laborPlanned = new Map<WorkCategory, number>();
  for (const e of p.expenses) if (e.kind === 'labor') laborActual.set(e.category, round2((laborActual.get(e.category) ?? 0) + e.amount));
  for (const s of p.estimate.sections) for (const it of s.items) laborPlanned.set(s.category, round2((laborPlanned.get(s.category) ?? 0) + lineTotals(it, p.defaultMarginPercentage).laborTotal));
  const cats = CATEGORY_ORDER.filter(c => mc.planned.has(c) || mc.actual.has(c) || laborActual.has(c));
  const planFact: XSheet = {
    name: 'Plan-fakt müqayisəsi', freezeRow: 1, widths: [34, 16, 16, 14, 16, 16, 14],
    rows: [[H('Bölmə'), H('Plan material'), H('Faktiki material'), H('Fərq'), H('Plan işçilik'), H('Faktiki işçilik'), H('Fərq')],
      ...cats.map(c => { const pm = mc.planned.get(c) ?? 0, am = mc.actual.get(c) ?? 0, pl = laborPlanned.get(c) ?? 0, al = laborActual.get(c) ?? 0; return [CATEGORY_LABEL[c], M(pm), M(am), M(am - pm), M(pl), M(al), M(al - pl)]; }),
      [B('Cəmi'), MB(pva.plannedMaterial), MB(pva.actualMaterial), MB(pva.materialVariance), MB(pva.plannedLabor), MB(pva.actualLabor), MB(pva.laborVariance)],
      [],
      [H('Tarix'), H('Kateqoriya'), H('Təsvir'), H('Təchizatçı / Usta'), H('Məbləğ'), H('Ödəniş statusu')],
      ...[...p.expenses].sort((a, b2) => a.date.localeCompare(b2.date)).map(e => [dateAz(e.date), CATEGORY_LABEL[e.category], e.description, e.vendor, M(e.amount), PAYMENT_STATUS_LABEL[e.paymentStatus]]),
      [B('Faktiki xərc cəmi'), '', '', '', MB(b.actualSpending)]],
  };

  return [summary, detail, materials, labor, changes, planFact];
}

export function exportExcel(p: Project): ExportJob {
  const fileName = `Smeta_${fileSlug(p.name)}_v${p.estimate.version}_${todayISO()}.xlsx`;
  downloadBlob(buildXlsx(buildWorkbook(p)), fileName);
  return { id: uid('exp'), kind: 'xlsx', status: 'ready', createdAt: new Date().toISOString(), fileName };
}

export function openPrintView(p: Project): ExportJob {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.open(`${base}/smeta/${p.id}/print`, '_blank', 'noopener');
  return { id: uid('exp'), kind: 'pdf', status: 'ready', createdAt: new Date().toISOString(), fileName: `Smeta_${fileSlug(p.name)}_v${p.estimate.version}.pdf` };
}
