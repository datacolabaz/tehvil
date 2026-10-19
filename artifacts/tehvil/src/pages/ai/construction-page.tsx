import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Download, FileImage, FileSpreadsheet, FileText, FileX, HardHat, Info, LoaderCircle, Plus, Printer, Save, Trash2, Upload } from 'lucide-react';
import {
  useCreateConstructionEstimate, useDeleteConstructionEstimate, useGetConstructionEstimate, useListConstructionEstimates, useUpdateConstructionEstimate,
} from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, Pill, Skeleton } from '@/components/home/ui';
import {
  LEVELS, LEVEL_LABEL, fmtNum, MEASURE_LABEL, SECTIONS, SEPARATE_SECTION, calcLine, emptyMeasures, linesFromTable, parseCsv, templateLines, totals,
  type Level, type Line, type MeasureKey, type Measures,
} from '@/lib/build/estimate';
import { CAD_HINT, UNSUPPORTED_CAD, readPdf, type PdfFinding } from '@/lib/files/pdf-text';
import { buildXlsx, downloadBlob, type XCell } from '@/lib/smeta/xlsx';
import './ai.css';

interface FileNote { name: string; kind: 'pdf' | 'image' | 'table' | 'cad' | 'other'; status: 'read' | 'empty' | 'unsupported'; note: string }
interface Data { measures: Measures; sources: Partial<Record<MeasureKey, string>>; lines: Line[]; level: Level; files: FileNote[]; findings: PdfFinding[]; summary?: { total: number; unpriced: number } }
const initial = (): Data => ({ measures: emptyMeasures(), sources: {}, lines: templateLines(), level: 'orta', files: [], findings: [] });
const today = () => new Date().toISOString().slice(0, 10);
const az = (n: number) => fmtNum(n);
const azn = (n: number) => `${az(n)} AZN`;

export function ConstructionListPage() {
  const list = useListConstructionEstimates();
  const create = useCreateConstructionEstimate();
  const [, setLocation] = useLocation();
  return <>
    <PageHeading eyebrow="AI Smeta · Rejim 2" title="Layihədən tikinti smetası" description="Memarın layihəsindən ölçüləri götürün, qiymətləri öz mənbənizdən daxil edin. Hazır evin bazar dəyəri ilə qarışdırılmır."
      action={<button type="button" className="button button-primary" disabled={create.isPending} data-testid="button-new-build" onClick={() => create.mutate({ data: { name: 'Yeni tikinti smetası', data: initial() as unknown as Record<string, unknown> } }, { onSuccess: e => setLocation(`/ai-smeta/tikinti/${e.id}`) })}><Plus size={16} />Yeni smeta</button>} />
    <div className="ai-honest"><Info size={15} /><p>Təhvil-də tikinti qiymətləri bazası yoxdur — vahid qiymətləri podratçı təklifindən, təchizatçı qiymətindən və ya yüklədiyiniz cədvəldən daxil edirsiniz. Qiyməti olmayan sətir “qiymət yoxdur” kimi qalır.</p></div>
    {list.isLoading ? <Skeleton rows={2} /> : !(list.data ?? []).length ? <Empty icon={<HardHat size={28} />} title="Hələ tikinti smetası yoxdur" text="“Yeni smeta” ilə başlayın: layihə faylını yükləyin və ya ölçüləri özünüz yazın." />
      : <ul className="ai-history surface hp-section">{list.data!.map(e => <li key={e.id}><Link href={`/ai-smeta/tikinti/${e.id}`}><b>{e.name}</b><small>Yenilənib: {new Date(e.updatedAt).toLocaleDateString('az-AZ')}</small></Link><span>{e.total ? azn(e.total) : '—'}{e.unpriced ? <small className="ai-sub"> · {e.unpriced} sətir qiymətsiz</small> : null}</span></li>)}</ul>}
  </>;
}

export function ConstructionEditorPage({ id }: { id: string }) {
  const q = useGetConstructionEstimate(id);
  if (q.isLoading) return <Skeleton rows={4} />;
  if (!q.data) return <Empty icon={<HardHat size={28} />} title="Smeta tapılmadı" text="Link səhvdir və ya bu smeta başqa hesaba aiddir." />;
  return <Editor id={id} name={q.data.name} saved={{ ...initial(), ...(q.data.data as unknown as Partial<Data>) }} />;
}

function Editor({ id, name: savedName, saved }: { id: string; name: string; saved: Data }) {
  const [d, setD] = useState<Data>(saved);
  const [name, setName] = useState(savedName);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const update = useUpdateConstructionEstimate();
  const remove = useDeleteConstructionEstimate();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const change = (patch: Partial<Data>) => { setD(x => ({ ...x, ...patch })); setDirty(true); };
  const t = useMemo(() => totals(d.lines, d.measures, d.level), [d.lines, d.measures, d.level]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  const save = () => update.mutate({ estimateId: id, data: { name: name.trim() || 'Tikinti smetası', data: { ...d, summary: { total: t.total, unpriced: t.unpriced + t.noQty } } as unknown as Record<string, unknown> } }, {
    onSuccess: () => { setDirty(false); void qc.invalidateQueries({ queryKey: ['/api/construction-estimates'] }); },
  });

  const setMeasure = (k: MeasureKey, v: string, source = 'Siz daxil etdiniz') => {
    const n = v.trim() === '' ? null : Number(v.replace(',', '.'));
    change({ measures: { ...d.measures, [k]: n != null && Number.isFinite(n) ? n : null }, sources: { ...d.sources, [k]: n == null ? undefined : source } });
  };

  const onFiles = async (files: FileList | null) => {
    setFileError('');
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setBusy(true);
    const notes: FileNote[] = []; let findings = [...d.findings]; let lines = [...d.lines];
    for (const f of list) {
      try {
        if (f.size > 30 * 1024 * 1024) { notes.push({ name: f.name, kind: 'other', status: 'unsupported', note: 'Fayl 30 MB-dan böyükdür.' }); continue; }
        if (UNSUPPORTED_CAD.test(f.name)) { notes.push({ name: f.name, kind: 'cad', status: 'unsupported', note: CAD_HINT }); continue; }
        if (/\.pdf$/i.test(f.name)) {
          const r = await readPdf(f);
          findings = [...findings.filter(x => !x.snippet.startsWith(`[${f.name}]`)), ...r.findings.map(x => ({ ...x, snippet: `[${f.name}] ${x.snippet}` }))];
          notes.push(r.hasText ? { name: f.name, kind: 'pdf', status: r.findings.length ? 'read' : 'empty', note: r.findings.length ? `${r.pageCount} səhifə oxundu, ${r.findings.length} göstərici tapıldı — aşağıda yoxlayıb tətbiq edin.` : `${r.pageCount} səhifənin mətnində sahə, miqyas və ya mərtəbə yazısı tapılmadı. Ölçüləri əl ilə daxil edin.` }
            : { name: f.name, kind: 'pdf', status: 'empty', note: 'Mətn qatı yoxdur (skan və ya yalnız xətlər). Çertyojdakı ölçülər avtomatik oxunmur — əl ilə daxil edin.' });
          continue;
        }
        if (/\.(jpe?g|png)$/i.test(f.name)) { notes.push({ name: f.name, kind: 'image', status: 'empty', note: 'Şəkildən ölçülər avtomatik oxunmur. Şəkli açıb ölçüləri əl ilə daxil edin.' }); continue; }
        if (/\.(xlsx|csv)$/i.test(f.name)) {
          const rows: unknown[][] = /\.csv$/i.test(f.name) ? parseCsv(await f.text()) : await (await import('read-excel-file')).default(f) as unknown[][];
          const res = linesFromTable(rows, f.name, today());
          lines = [...lines.filter(l => !l.id.startsWith(`t-${f.name}`.replace(/[^\w-]/g, '_'))), ...res.lines];
          notes.push({ name: f.name, kind: 'table', status: res.lines.length ? 'read' : 'empty', note: res.lines.length ? `${res.lines.length} sətir əlavə olundu${res.skipped.length ? `, ${res.skipped.length} sətir buraxıldı (${res.skipped.slice(0, 2).map(s => `sətir ${s.row}: ${s.reason}`).join('; ')})` : ''}.` : res.skipped[0]?.reason ?? 'Cədvəldən sətir oxunmadı.' });
          continue;
        }
        notes.push({ name: f.name, kind: 'other', status: 'unsupported', note: 'Bu format dəstəklənmir. PDF, JPG, PNG, XLSX və ya CSV yükləyin.' });
      } catch {
        notes.push({ name: f.name, kind: 'other', status: 'unsupported', note: 'Faylı oxumaq alınmadı (zədələnmiş və ya parolla qorunan ola bilər).' });
      }
    }
    setBusy(false);
    change({ files: [...d.files.filter(x => !notes.some(n => n.name === x.name)), ...notes], findings, lines });
  };

  const apply = (f: PdfFinding) => {
    const key: MeasureKey | null = f.kind === 'total_area' ? 'totalArea' : f.kind === 'floors' ? 'floors' : f.kind === 'height' ? 'floorHeight' : null;
    if (key) setMeasure(key, String(f.value), `PDF səh. ${f.page}: “${f.snippet.replace(/^\[[^\]]+\]\s*/, '').slice(0, 60)}”`);
  };
  const roomSum = d.findings.filter(f => f.kind === 'room_area').reduce((s, f) => s + f.value, 0);

  const setPrice = (l: Line, field: 'material' | 'labor' | 'source', v: string) => {
    const cur = l.prices[d.level] ?? { material: null, labor: null, source: 'Siz daxil etdiniz', date: today() };
    const next = field === 'source' ? { ...cur, source: v } : { ...cur, [field]: v.trim() === '' ? null : Number(v.replace(',', '.')), date: today() };
    change({ lines: d.lines.map(x => x.id === l.id ? { ...x, prices: { ...x.prices, [d.level]: next } } : x) });
  };
  const setLine = (l: Line, patch: Partial<Line>) => change({ lines: d.lines.map(x => x.id === l.id ? { ...x, ...patch } : x) });

  const exportXlsx = () => {
    const rows: XCell[][] = [[{ v: name, s: 'title' }], [`Material səviyyəsi: ${LEVEL_LABEL[d.level]}`], [`Qiymətlər: ${t.priceDates.join(', ') || 'daxil edilməyib'}`], [],
      ['Bölmə', 'İşin adı', 'Vahid', 'Miqdar', 'Miqdar necə hesablanıb', 'Material, vahid', 'İşçilik, vahid', 'Məbləğ', 'Qiymət mənbəyi', 'Etibarlılıq'].map(v => ({ v, s: 'header' as const }))];
    d.lines.forEach(l => { const c = calcLine(l, d.measures, d.level); rows.push([SECTIONS[l.section], l.name, l.unit, c.qty.value, c.qty.how, c.price?.material ?? null, c.price?.labor ?? null, c.total != null ? { v: c.total, s: 'money' } : 'qiymət yoxdur', c.price ? `${c.price.source} (${c.price.date})${c.fallback ? ' — orta səviyyə qiyməti' : ''}` : '—', c.confidence]); });
    rows.push([], ['Material', null, null, null, null, null, null, { v: t.material, s: 'moneyBold' }], ['İşçilik', null, null, null, null, null, null, { v: t.labor, s: 'moneyBold' }], ['Əlavə xərclər', null, null, null, null, null, null, { v: t.extra, s: 'moneyBold' }], ['Tikinti büdcəsi (qiymətli sətirlər)', null, null, null, null, null, null, { v: t.total, s: 'moneyBold' }], [`Qiyməti olmayan sətirlər: ${t.unpriced}; miqdarı olmayan: ${t.noQty}`], ['Torpaq, layihə, qoşulma və s. bu büdcəyə daxil deyil.']);
    downloadBlob(buildXlsx([{ name: 'Smeta', rows, widths: [26, 44, 10, 10, 46, 14, 14, 14, 40, 12], freezeRow: 5 }]), `tikinti-smetasi-${today()}.xlsx`);
  };

  const sectionsWithLines = SECTIONS.map((title, i) => ({ title, i, lines: d.lines.filter(l => l.section === i) }));
  return <>
    <PageHeading eyebrow="AI Smeta · Layihədən tikinti smetası" title={name || 'Tikinti smetası'} description="Faylları yükləyin, ölçüləri yoxlayın, qiymətləri daxil edin. Bütün hesablamalar aşağıda açıq göstərilir."
      action={<div className="hp-actions hp-noprint"><button type="button" className="button button-primary" onClick={save} disabled={update.isPending || !dirty} data-testid="button-save-build">{update.isPending ? <LoaderCircle size={15} className="spin" /> : dirty ? <Save size={15} /> : <Check size={15} />}{dirty ? 'Yadda saxla' : 'Saxlanılıb'}</button></div>} />

    <section className="surface hp-section hp-noprint">
      <label className="field"><span>Smetanın adı</span><input value={name} onChange={e => { setName(e.target.value); setDirty(true); }} maxLength={200} data-testid="input-build-name" /></label>
    </section>

    <section className="surface hp-section hp-noprint" data-testid="build-files">
      <h2>1. Layihə faylları</h2>
      <label className={`sm-drop ${busy ? 'busy' : ''}`} style={{ minHeight: 120 }}>
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv,.dwg,.dxf,.ifc,.rvt" onChange={e => { void onFiles(e.target.files); e.target.value = ''; }} data-testid="input-build-files" />
        {busy ? <LoaderCircle size={22} className="spin" /> : <Upload size={22} />}<strong>{busy ? 'Fayllar oxunur…' : 'PDF, JPG, PNG, XLSX və ya CSV yükləyin'}</strong>
        <span>PDF-in mətnindən sahə, miqyas və mərtəbə yazıları oxunur. XLSX/CSV cədvəlindən iş həcmləri və qiymətlər götürülür. DWG, DXF, IFC, RVT hələ oxunmur.</span>
      </label>
      {fileError && <p className="ai-error">{fileError}</p>}
      {d.files.length > 0 && <ul className="ai-files">{d.files.map(f => <li key={f.name} className={f.status}>{f.kind === 'pdf' ? <FileText size={16} /> : f.kind === 'image' ? <FileImage size={16} /> : f.kind === 'table' ? <FileSpreadsheet size={16} /> : <FileX size={16} />}<span><b>{f.name}</b><small>{f.note}</small></span></li>)}</ul>}
      {d.findings.length > 0 && <div className="ai-findings" data-testid="pdf-findings"><h3>PDF-də tapılan göstəricilər</h3><p className="rl-hint">Hər birini çertyojla yoxlayın; yalnız “Tətbiq et” basdıqda ölçülərə yazılır.</p>
        <ul>{d.findings.filter(f => f.kind !== 'room_area').map((f, i) => <li key={i}><span><b>{f.label}{f.unit ? ` · ${az(f.value)} ${f.unit}` : ''}</b><small>Səh. {f.page}: “{f.snippet}”</small></span>{f.kind !== 'scale' && <button type="button" className="button button-secondary sm-btn-sm" onClick={() => apply(f)} data-testid={`apply-${f.kind}`}>Tətbiq et</button>}</li>)}</ul>
        {roomSum > 0 && <p className="hp-text">Otaq sahələri yazıları: {d.findings.filter(f => f.kind === 'room_area').length} ədəd, cəmi {az(Math.round(roomSum * 10) / 10)} m². <button type="button" className="sm-link-btn" onClick={() => setMeasure('totalArea', String(Math.round(roomSum * 10) / 10), 'PDF: otaq sahələrinin cəmi')} data-testid="apply-room-sum">Ümumi sahə kimi tətbiq et</button></p>}
      </div>}
    </section>

    <section className="surface hp-section" data-testid="build-measures">
      <h2>2. Ölçülər</h2>
      <p className="rl-hint">Boş xanalar “ölçü çatışmır” kimi qalır — sistem onları təxmin etmir. Hər ölçünün mənbəyi altında göstərilir.</p>
      <div className="field-grid three">
        {(Object.keys(MEASURE_LABEL) as MeasureKey[]).filter(k => (k !== 'foundationWidth' || d.measures.foundationType === 'strip') && (k !== 'slabThickness' || d.measures.foundationType === 'slab')).map(k => <label key={k} className="field"><span>{MEASURE_LABEL[k][0]}{MEASURE_LABEL[k][1] ? `, ${MEASURE_LABEL[k][1]}` : ''}</span>
          <input inputMode="decimal" value={d.measures[k] ?? ''} onChange={e => setMeasure(k, e.target.value)} data-testid={`m-${k}`} />{d.sources[k] && <small className="ai-src">{d.sources[k]}</small>}</label>)}
        <label className="field"><span>Bünövrə növü</span><select value={d.measures.foundationType} onChange={e => change({ measures: { ...d.measures, foundationType: e.target.value as Measures['foundationType'] } })} data-testid="m-foundationType"><option value="">Seçin</option><option value="strip">Lent</option><option value="slab">Plitə</option><option value="pile">Svay</option></select></label>
        <label className="field"><span>Dam növü</span><select value={d.measures.roofType} onChange={e => change({ measures: { ...d.measures, roofType: e.target.value as Measures['roofType'] } })} data-testid="m-roofType"><option value="">Seçin</option><option value="flat">Düz</option><option value="pitched">Maili</option></select></label>
      </div>
    </section>

    <section className="surface hp-section" data-testid="build-lines">
      <div className="section-head"><h2>3. Smeta</h2>
        <div className="rl-seg hp-tabs" role="tablist" aria-label="Material səviyyəsi">{LEVELS.map(l => <button key={l} type="button" role="tab" aria-selected={d.level === l} className={d.level === l ? 'on' : ''} onClick={() => change({ level: l })} data-testid={`level-${l}`}>{LEVEL_LABEL[l]}</button>)}</div></div>
      <p className="rl-hint">Qiymətlər seçilmiş səviyyə ({LEVEL_LABEL[d.level]}) üçün yazılır. {d.level !== 'orta' ? 'Bu səviyyədə qiymət yazılmayan sətirlərdə “Orta” qiymət istifadə olunur və bu, sətirdə göstərilir.' : ''}</p>
      {sectionsWithLines.map(s => <div key={s.i} className={`ai-sec ${s.i === SEPARATE_SECTION ? 'separate' : ''}`}>
        <h3>{s.i + 1}. {s.title}{s.i === SEPARATE_SECTION && <small> — tikinti büdcəsinə daxil edilmir</small>}{s.i !== SEPARATE_SECTION && t.sections[s.i].total > 0 && <small> · {azn(t.sections[s.i].total)}</small>}</h3>
        {s.lines.map(l => <LineRow key={l.id} l={l} d={d} setPrice={setPrice} setLine={setLine} onRemove={!l.key ? () => change({ lines: d.lines.filter(x => x.id !== l.id) }) : undefined} />)}
        <button type="button" className="sm-link-btn hp-noprint" onClick={() => change({ lines: [...d.lines, { id: `u-${Date.now().toString(36)}`, section: s.i, name: 'Yeni iş', unit: 'm²', qty: null, qtySource: 'user', prices: {} }] })} data-testid={`add-line-${s.i}`}><Plus size={13} />Sətir əlavə et</button>
      </div>)}
    </section>

    <section className="surface hp-section ai-result" data-testid="build-summary">
      <h2>4. Nəticə</h2>
      <div className="ai-range">
        <div><small>Material</small><b>{azn(t.material)}</b></div><div><small>İşçilik</small><b>{azn(t.labor)}</b></div><div><small>Əlavə xərclər</small><b>{azn(t.extra)}</b></div>
      </div>
      <div className="ai-range" style={{ marginTop: 10 }}>
        <div><small>Ümumi tikinti büdcəsi (qiyməti olan sətirlər)</small><b className="big" data-testid="build-total">{azn(t.total)}</b></div>
        <div><small>Ssenarilər</small>{t.scenarios.tiered ? <b data-testid="build-scenarios">{azn(t.scenarios.low)} · {azn(t.scenarios.base)} · {azn(t.scenarios.high)}</b> : <span className="rl-hint">Aşağı/yüksək ssenari üçün “İqtisadi” və “Premium” qiymətlərini daxil edin.</span>}<small>aşağı · əsas · yüksək</small></div>
        <div><small>Etibarlılıq</small><b>{t.lines ? Math.round((t.priced / t.lines) * 100) : 0}% sətir qiymətli</b><small>{t.unpriced} qiymətsiz · {t.noQty} miqdarsız</small></div>
      </div>
      {(t.unpriced > 0 || t.noQty > 0) && <p className="ai-warn" data-testid="build-incomplete"><AlertTriangle size={14} />Smeta natamamdır: {t.unpriced} sətirdə qiymət, {t.noQty} sətirdə miqdar yoxdur. Ümumi məbləğə yalnız hər ikisi olan sətirlər daxildir.</p>}
      {t.fallbackLines > 0 && <p className="rl-hint">{t.fallbackLines} sətirdə “{LEVEL_LABEL[d.level]}” qiyməti yoxdur, “Orta” qiymət istifadə olunub.</p>}
      <p className="rl-hint">Qiymətlərin tarixi: {t.priceDates.length ? t.priceDates.join(', ') : 'qiymət daxil edilməyib'}. Büdcəyə daxil deyil: torpaq, layihə və icazə, şəbəkəyə qoşulma, abadlaşdırma, mebel{t.separate > 0 ? ` (ayrıca daxil etdiyiniz: ${azn(t.separate)})` : ''}. Formulalar ilkin hesablamadır — konstruktiv hesabı və podratçının yerində ölçməsini əvəz etmir.</p>
      <div className="hp-actions hp-noprint"><button type="button" className="button button-secondary" onClick={exportXlsx} data-testid="button-build-xlsx"><Download size={15} />Excel</button><button type="button" className="button button-secondary" onClick={() => window.print()}><Printer size={15} />Çap et / PDF</button>
        <button type="button" className="button button-quiet" onClick={() => remove.mutate({ estimateId: id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: ['/api/construction-estimates'] }); setLocation('/ai-smeta/tikinti'); } })}><Trash2 size={15} />Sil</button></div>
    </section>
  </>;
}

function LineRow({ l, d, setPrice, setLine, onRemove }: { l: Line; d: Data; setPrice: (l: Line, f: 'material' | 'labor' | 'source', v: string) => void; setLine: (l: Line, p: Partial<Line>) => void; onRemove?: () => void }) {
  const c = calcLine(l, d.measures, d.level);
  const own = l.prices[d.level];
  const sep = l.section === SEPARATE_SECTION;
  return <div className={`ai-line ${c.total == null ? 'open' : ''}`} data-testid={`line-${l.id}`}>
    <div className="ai-line-name">{l.key ? <b>{l.name}</b> : <input className="hp-input" value={l.name} onChange={e => setLine(l, { name: e.target.value })} aria-label="İşin adı" />}
      <small>{c.qty.how}{l.note && l.qtySource === 'table' ? '' : ''}</small></div>
    <label className="ai-cell"><span>Miqdar ({l.key ? l.unit : <input className="ai-unit" value={l.unit} onChange={e => setLine(l, { unit: e.target.value })} aria-label="Vahid" />})</span>
      <input inputMode="decimal" value={l.qty ?? ''} placeholder={c.qty.value != null && l.qty == null ? az(c.qty.value) : sep ? '—' : 'daxil edin'} onChange={e => { const v = e.target.value.trim(); setLine(l, { qty: v === '' ? null : Number(v.replace(',', '.')), qtySource: v === '' ? (l.key ? 'formula' : 'user') : 'user' }); }} data-testid={`qty-${l.id}`} /></label>
    <label className="ai-cell"><span>Material / {l.unit}</span><input inputMode="decimal" value={own?.material ?? ''} placeholder={c.fallback ? `orta: ${c.price?.material ?? '—'}` : '—'} onChange={e => setPrice(l, 'material', e.target.value)} data-testid={`pm-${l.id}`} /></label>
    <label className="ai-cell"><span>İşçilik / {l.unit}</span><input inputMode="decimal" value={own?.labor ?? ''} placeholder={c.fallback ? `orta: ${c.price?.labor ?? '—'}` : '—'} onChange={e => setPrice(l, 'labor', e.target.value)} data-testid={`pl-${l.id}`} /></label>
    <div className="ai-cell ai-amount"><span>Məbləğ</span><b data-testid={`amount-${l.id}`}>{c.total != null ? azn(c.total) : c.qty.value == null ? 'miqdar yoxdur' : 'qiymət yoxdur'}</b>
      {c.price ? <small>{c.price.source} · {c.price.date}{c.fallback ? ' · orta səviyyə' : ''}</small> : null}
      <Pill small tone={c.confidence === 'yüksək' ? 'ok' : c.confidence === 'orta' ? 'info' : 'warn'}>{c.confidence}</Pill></div>
    {own && <label className="ai-cell ai-source hp-noprint"><span>Qiymətin mənbəyi</span><input value={own.source} onChange={e => setPrice(l, 'source', e.target.value)} placeholder="məs. Podratçı təklifi, 12.10.2026" data-testid={`src-${l.id}`} /></label>}
    {onRemove && <button type="button" className="icon-button hp-noprint" aria-label="Sətri sil" onClick={onRemove}><Trash2 size={14} /></button>}
  </div>;
}

