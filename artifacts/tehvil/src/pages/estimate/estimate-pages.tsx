import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, Calculator, Check, ChevronDown, CircleHelp, Download, FileSpreadsheet, FileText, HardHat, Info, Link2, LoaderCircle, Plus, RotateCcw, Settings2, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { Empty, Modal, Pill, Skeleton } from '@/components/home/ui';
import { api, azn, errorText, putFile, shrinkImage, useBooks } from '@/lib/finance/api';
import {
  downloadEstimate, estimateKey, estimatesKey, KIND, nf, PARAMS, SOURCE, STATUS_TONE, TYPE, useEstimate, useEstimates,
  type Category, type Element, type ElementType, type Estimate, type Item, type Question,
} from '@/lib/estimate/api';
import { WallsEstimatePage } from './walls-review';
import '../home/finance.css';
import '../expenses/expenses.css';
import './estimate.css';

/*
 * AI Smeta: upload the project, answer what AI could not read, get one estimate table, export to Excel.
 * Numbers come from the server's calculation engine; the page only edits inputs (answers, prices, quantities).
 */

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CAD = /\.(dwg|dxf|ifc|rvt|skp|pln|3dm)$/i;
const typeOf = (f: File) => (f.name.toLowerCase().endsWith('.csv') ? 'text/csv' : f.name.toLowerCase().endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : f.type);

async function uploadFiles(id: string, files: File[]): Promise<{ drawings: number; errors: string[]; notes: string[] }> {
  let drawings = 0; const errors: string[] = []; const notes: string[] = [];
  for (const original of files) {
    if (CAD.test(original.name)) { errors.push(`${original.name}: DWG, DXF və IFC hələ oxunmur — çertyoju PDF kimi çap edib yükləyin.`); continue; }
    const ct = typeOf(original);
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(ct)) { errors.push(`${original.name}: bu fayl tipi dəstəklənmir (PDF, JPG, PNG, WebP, XLSX, CSV).`); continue; }
    try {
      const file = ct.startsWith('image/') ? await shrinkImage(original, 2400) : new File([original], original.name, { type: ct });
      const f = await putFile(file);
      const r = await api<{ kind: string; imported: { rows: number; skipped: number; error?: string } | null }>(`/ai-estimates/${id}/files`, 'POST', { file: f });
      if (r.kind === 'drawing') drawings++;
      if (r.imported) r.imported.error ? errors.push(`${original.name}: ${r.imported.error}`) : notes.push(`${original.name}: ${r.imported.rows} sətir əlavə edildi${r.imported.skipped ? `, ${r.imported.skipped} sətir oxunmadı` : ''}.`);
    } catch (e) { errors.push(`${original.name}: ${errorText(e, e instanceof Error ? e.message : 'yüklənmədi')}`); }
  }
  return { drawings, errors, notes };
}

/* =================================================================== list */

export function EstimateListPage() {
  const q = useEstimates();
  if (q.isLoading) return <Skeleton rows={3} />;
  const list = q.data ?? [];
  return <div className="es-page">
    <div className="ex-head"><div><span className="eyebrow">AI Smeta</span><h1 className="font-display ex-title">Smetalarım</h1></div><Link className="button button-primary" href="/smeta-ai/yeni" data-testid="es-new"><Plus size={16} />Smeta yarat</Link></div>
    {!list.length ? <Empty icon={<Calculator size={28} />} title="Hələ smeta yoxdur" text="Layihə çertyojunu yükləyin — AI ölçüləri oxuyur, beton, armatur və qəlib miqdarlarını hesablayırıq." action={<Link className="button button-primary" href="/smeta-ai/yeni">Smeta yarat</Link>} />
      : <div className="ex-books">{list.map((e) => <Link key={e.id} href={`/smeta-ai/${e.id}`} className="ex-book" data-testid="es-item"><span><b>{e.name}</b><small>{KIND[e.kind]} · {e.status === 'analyzing' ? 'AI oxuyur…' : e.openQuestions ? `${e.openQuestions} sual gözləyir` : `${e.itemCount} sətir`}</small></span><span className="ex-book-sum"><b>{e.total ? azn(Math.round(e.total * 100)) : '—'}</b></span><ArrowRight size={16} /></Link>)}</div>}
  </div>;
}

/* ================================================================= create */

export function EstimateNewPage() {
  const [, go] = useLocation();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', kind: 'house', location: '', areaM2: '', floors: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const create = async () => {
    setErr(''); setBusy('Smeta yaradılır…');
    try {
      const r = await api<{ id: string }>('/ai-estimates', 'POST', { name: f.name, kind: f.kind, location: f.location, areaM2: f.areaM2 ? Math.round(Number(f.areaM2)) : null, floors: f.floors ? Math.round(Number(f.floors)) : null });
      if (files.length) {
        setBusy('Fayllar yüklənir…');
        const u = await uploadFiles(r.id, files);
        // Masonry and plaster: pages are chosen first, then the drawings are read.
        if (u.drawings && f.kind !== 'masonry_plaster') { setBusy('AI analizə başlayır…'); await api(`/ai-estimates/${r.id}/analyze`, 'POST', {}).catch(() => null); }
        if (u.errors.length) sessionStorage.setItem(`es-msg-${r.id}`, u.errors.join('\n'));
      }
      await qc.invalidateQueries({ queryKey: estimatesKey });
      go(`/smeta-ai/${r.id}`);
    } catch (e) { setErr(errorText(e)); setBusy(''); }
  };
  return <div className="es-page es-narrow">
    <span className="eyebrow">AI Smeta</span><h1 className="font-display ex-title">Smeta yarat</h1>
    <section className="ex-card ex-create">
      <label className="fn-field"><span>Layihənin adı</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Məs. Həyət evi, 1 mərtəbə" data-testid="es-name" autoFocus /></label>
      <label className="fn-field"><span>Nə hesablayırıq?</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} data-testid="es-kind">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <div className="fn-grid2">
        <label className="fn-field"><span>Ümumi sahə, m² <em>· məlumdursa</em></span><input inputMode="decimal" value={f.areaM2} onChange={(e) => setF({ ...f, areaM2: e.target.value })} /></label>
        <label className="fn-field"><span>Mərtəbə sayı <em>· məlumdursa</em></span><input inputMode="numeric" value={f.floors} onChange={(e) => setF({ ...f, floors: e.target.value })} /></label>
      </div>
      <label className="fn-field"><span>Yeri <em>· istəyə bağlı</em></span><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
      <div className="es-drop" onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') input.current?.click(); }}>
        <Upload size={22} /><b>Layihə faylları</b><small>PDF çertyoj, plan şəkli, skan və ya mühəndisin material siyahısı (XLSX, CSV)</small>
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} data-testid="es-files" />
      </div>
      {files.length > 0 && <ul className="es-files">{files.map((x, i) => <li key={i} className={CAD.test(x.name) ? 'bad' : ''}><FileText size={14} />{x.name}{CAD.test(x.name) && <em> — oxunmur, PDF kimi yükləyin</em>}<button className="icon-button" aria-label="Sil" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={13} /></button></li>)}</ul>}
      <p className="fn-note"><Info size={14} />Fayl yoxdursa, smetanı yaradıb ölçüləri özünüz daxil edə bilərsiniz. DWG, DXF və IFC hələ oxunmur.</p>
      {err && <p className="form-error">{err}</p>}
      <button className="button button-primary ex-big" disabled={!!busy || !f.name.trim()} onClick={create} data-testid="es-create">{busy ? <><LoaderCircle className="spin" size={18} />{busy}</> : <><Sparkles size={18} />{!files.length ? 'Yarat' : f.kind === 'masonry_plaster' ? 'Yarat və səhifələri seç' : 'Yarat və AI ilə analiz et'}</>}</button>
    </section>
  </div>;
}

/* ================================================================== view */

export function EstimatePage({ id }: { id: string }) {
  const q = useEstimate(id);
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string>(() => sessionStorage.getItem(`es-msg-${id}`) ?? '');
  useEffect(() => { sessionStorage.removeItem(`es-msg-${id}`); }, [id]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  if (q.isLoading) return <Skeleton rows={5} />;
  if (q.isError || !q.data) return <Empty icon={<Calculator size={28} />} title="Smeta açılmadı" text={errorText(q.error)} action={<Link className="button button-secondary" href="/smeta-ai">Smetalarım</Link>} />;
  const e = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: estimateKey(id) });
  const patch = async (body: object) => { await api(`/ai-estimates/${id}`, 'PATCH', body); await refresh(); };
  const analyze = async () => { setBusy(true); try { await api(`/ai-estimates/${id}/analyze`, 'POST', {}); await refresh(); } catch (x) { setMsg(errorText(x)); } finally { setBusy(false); } };
  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return; setBusy(true); setMsg('');
    const u = await uploadFiles(id, Array.from(list));
    setMsg([...u.notes, ...u.errors].join('\n'));
    if (u.drawings && e.aiConfigured && e.kind !== 'masonry_plaster') await api(`/ai-estimates/${id}/analyze`, 'POST', {}).catch(() => null);
    await refresh(); setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
  };
  const drawings = e.files.filter((f) => f.kind === 'drawing');
  return <div className="es-page">
    <div className="ex-head">
      <div><span className="eyebrow">AI Smeta · {KIND[e.kind]}</span><h1 className="font-display ex-title">{e.name}</h1></div>
      {e.kind !== 'masonry_plaster' && <button className="button button-secondary" onClick={() => void downloadEstimate(id, e.name).catch((x) => setMsg(errorText(x)))} data-testid="es-export"><Download size={16} />Excel</button>}
    </div>

    <section className="es-files-bar">
      <div className="es-file-chips">{e.files.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className={`es-chip ${f.status}`} title={f.error ?? ''}>{f.kind === 'table' ? <FileSpreadsheet size={14} /> : <FileText size={14} />}{f.name}{f.status === 'failed' && <AlertTriangle size={12} />}</a>)}
        <button className="es-chip add" onClick={() => fileInput.current?.click()} disabled={busy} data-testid="es-add-file">{busy ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}Fayl əlavə et</button>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={(x) => void addFiles(x.target.files)} data-testid="es-file-input" /></div>
      {msg && <p className="es-msg" role="status">{msg}</p>}
    </section>

    {e.status === 'analyzing' && <div className="es-banner info" data-testid="es-analyzing"><LoaderCircle className="spin" size={18} /><div><b>AI çertyoju oxuyur</b><small>{e.kind === 'masonry_plaster' ? 'Mərtəbələr, divarlar, qapı və pəncərələr axtarılır.' : 'Ölçülər, kəsiklər və armatur qeydləri axtarılır.'} Bu 20–90 saniyə çəkə bilər; səhifəni bağlaya bilərsiniz.</small></div></div>}
    {e.status === 'failed' && <div className="es-banner risk"><AlertTriangle size={18} /><div><b>AI çertyoju oxuya bilmədi</b><small>{e.aiError}</small></div><button className="button button-secondary sm-btn-sm" onClick={analyze} disabled={busy}><RotateCcw size={14} />Yenidən</button></div>}
    {!e.aiConfigured && <div className="es-banner"><Info size={18} /><div><b>AI analizi hələ qoşulmayıb</b><small>Elementləri və ölçüləri aşağıda özünüz daxil edin — hesablama eyni qaydada işləyir.</small></div></div>}
    {e.kind === 'masonry_plaster' && e.walls ? <WallsEstimatePage e={e} banner={null} /> : <>
    {e.aiConfigured && drawings.length > 0 && e.status !== 'analyzing' && !e.ai && e.status !== 'failed' && <div className="es-banner"><Sparkles size={18} /><div><b>Çertyoj yüklənib</b><small>AI ilə analiz edək?</small></div><button className="button button-primary sm-btn-sm" onClick={analyze} disabled={busy}>Analiz et</button></div>}
    {e.ai && <div className="es-ai-note"><Sparkles size={14} /><span>AI {e.ai.drawingKinds.length ? `gördü: ${e.ai.drawingKinds.map((k) => DRAWING[k] ?? k).join(', ')}` : 'çertyoju oxudu'}.{e.doc.architecturalOnly ? ' Konstruktiv (armatur) çertyoj tapılmadı — armatur miqdarları mühəndis tərəfindən yoxlanmalıdır.' : ''}{e.ai.unreadable.length ? ` Oxunmayan: ${e.ai.unreadable.slice(0, 4).join(', ')}.` : ''}</span></div>}

    {e.questions.length > 0 && <Questions e={e} onDone={refresh} />}

    <EstimateTable e={e} patch={patch} />
    <Elements e={e} patch={patch} />
    <SettingsPanel e={e} patch={patch} />
    <LinkPanel e={e} onDone={refresh} />
    <ContractorPanel e={e} onDone={refresh} />
    </>}
    {e.versions.length > 0 && <details className="es-section"><summary>Versiyalar ({e.versions.length})</summary><ol className="fn-versions">{e.versions.map((v) => <li key={v.version}><b>v{v.version}</b><span>{REASON[v.reason] ?? v.reason}</span><small>{new Date(v.createdAt).toLocaleString('az-AZ', { dateStyle: 'short', timeStyle: 'short' })}</small><b>{v.totals.amount ? azn(Math.round(v.totals.amount * 100)) : '—'}</b></li>)}</ol></details>}
    <p className="fn-note"><HardHat size={14} />AI smetası mühəndis layihəsini və konstruktiv təhlükəsizlik yoxlamasını əvəz etmir. AI konstruktiv həlli dəyişmir; armaturun diametri, sinfi və düzülüşü mühəndis layihəsi ilə uyğunlaşdırılmalıdır.</p>
  </div>;
}
const DRAWING: Record<string, string> = { architectural_plan: 'memarlıq planı', structural_plan: 'konstruktiv plan', foundation_plan: 'fundament planı', rebar_detail: 'armatur detalları', section: 'kəsiklər', elevation: 'fasadlar', material_list: 'material cədvəli', sketch: 'eskiz', other: 'digər' };
const REASON: Record<string, string> = { analysis: 'AI analizi', answers: 'Cavablar', edit: 'Düzəliş', export: 'Excel ixracı', manual: 'Saxlanılıb', 'walls-edited': 'Ölçülər düzəldildi', 'walls-ok': 'Bütün mərtəbələr təsdiqləndi' };

/* -------------------------------------------------------------- questions */

function Questions({ e, onDone }: { e: Estimate; onDone: () => Promise<unknown> }) {
  const [vals, setVals] = useState<Record<string, { kind: 'value' | 'unknown' | 'engineer'; value: string }>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (q: Question, v: { kind: 'value' | 'unknown' | 'engineer'; value: string }) => setVals((x) => ({ ...x, [q.id]: v }));
  const send = async () => {
    const answers = Object.entries(vals).filter(([, v]) => v.kind !== 'value' || v.value.trim()).map(([qid, v]) => ({ id: qid, kind: v.kind, value: v.kind === 'value' ? v.value : null }));
    if (!answers.length) return;
    setBusy(true); setErr('');
    try { await api(`/ai-estimates/${e.id}/answers`, 'POST', { answers }); setVals({}); await onDone(); } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const elName = (q: Question) => q.elementId ? e.doc.elements.find((x) => x.id === q.elementId)?.name : null;
  const n = Object.values(vals).filter((v) => v.kind !== 'value' || v.value.trim()).length;
  return <section className="es-questions" data-testid="es-questions">
    <h2><CircleHelp size={18} />Dəqiqləşdirək ({e.questions.length})</h2>
    <p className="es-q-intro">Bu məlumatlar hesablamaya təsir edir, amma çertyojdan etibarlı oxunmadı. Bilmirsinizsə, “Bilmirəm” seçin — uydurulmayacaq.</p>
    <ol>{e.questions.map((q) => { const v = vals[q.id]; return <li key={q.id} className="es-q" data-testid="es-question">
      <b>{q.text}</b>{elName(q) && <small className="es-q-el">{elName(q)}</small>}
      <div className="es-q-opts">
        {q.options.map((o) => <button key={o.label} className={v?.kind === 'value' && Number(v.value) === o.value ? 'on' : ''} onClick={() => set(q, { kind: 'value', value: String(o.value) })}>{o.label}</button>)}
        <span className="es-q-custom"><input inputMode={q.param === 'segments' ? 'text' : 'decimal'} placeholder={q.param === 'segments' ? '10; 10; 8; 8' : q.options.length ? 'Başqa' : 'Dəyər'} value={v?.kind === 'value' && !q.options.some((o) => String(o.value) === v.value) ? (q.unit === 'sm' ? String(Math.round(Number(v.value) * 10000) / 100) : v.value) : ''}
          onChange={(x) => set(q, { kind: 'value', value: q.unit === 'sm' && x.target.value ? String(Number(x.target.value.replace(',', '.')) / 100) : x.target.value })} aria-label={`${q.text} — başqa dəyər`} data-testid="es-q-input" />{q.unit && <em>{q.unit}</em>}</span>
      </div>
      <div className="es-q-alt">
        <button className={v?.kind === 'unknown' ? 'on' : ''} onClick={() => set(q, { kind: 'unknown', value: '' })} data-testid="es-q-unknown">Bilmirəm, layihədən müəyyən etməyə çalış</button>
        {q.elementId && <button className={v?.kind === 'engineer' ? 'on' : ''} onClick={() => set(q, { kind: 'engineer', value: '' })}><HardHat size={13} />Mühəndisə soruşmaq üçün işarələ</button>}
      </div>
      <small className="es-q-why">{q.why}{q.current?.where ? ` · ${q.current.where}` : ''}</small>
    </li>; })}</ol>
    {err && <p className="form-error">{err}</p>}
    <button className="button button-primary ex-big" disabled={busy || !n} onClick={send} data-testid="es-answers-save">{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Cavabları göndər{n ? ` (${n})` : ''}</button>
  </section>;
}

/* ------------------------------------------------------------------ table */

const CATS: Category[] = ['concrete', 'rebar', 'formwork', 'timber', 'other'];

function EstimateTable({ e, patch }: { e: Estimate; patch: (b: object) => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const items = e.result.items;
  if (!items.length) return <section className="es-section"><Empty icon={<Calculator size={26} />} title="Smeta hələ boşdur" text={e.files.length ? 'AI analizi bitəndə burada beton, armatur və qəlib sətirləri görünəcək.' : 'Çertyoj yükləyin və ya aşağıda elementləri özünüz əlavə edin.'} /></section>;
  const run = async (b: object) => { setErr(''); try { await patch(b); } catch (x) { setErr(errorText(x)); } };
  const setPrice = (i: Item, v: string) => { const n = v.trim() === '' ? null : Number(v.replace(',', '.')); if (n !== null && (!Number.isFinite(n) || n < 0)) return setErr('Qiyməti rəqəmlə yazın'); void run({ prices: { [i.key]: n } }); };
  const setQty = (i: Item, v: string) => {
    if (v.trim() === '') return void run({ overrides: { [i.key]: null } });
    const n = Number(v.replace(',', '.')); if (!Number.isFinite(n) || n < 0) return setErr('Miqdarı rəqəmlə yazın');
    if (i.status === 'manual' || i.status === 'list') return void run({ manual: e.doc.manual.map((m) => m.key === i.key ? { ...m, qty: n } : m) });
    const reason = window.prompt('Miqdarı niyə dəyişirsiniz? (hesablanan dəyər də saxlanılır)', '') ?? '';
    void run({ overrides: { [i.key]: { qty: n, reason } } });
  };
  const remove = (i: Item) => void run(i.status === 'manual' || i.status === 'list' ? { manual: e.doc.manual.filter((m) => m.key !== i.key) } : { removed: [...e.doc.removed, i.key] });
  const t = e.result.totals;
  return <section className="es-section" data-testid="es-table">
    <h2>Smeta</h2>
    <div className="es-sum"><span><small>Beton</small><b>{nf(t.concreteM3)} m³</b></span><span><small>Armatur</small><b>{nf(t.rebarKg / 1000)} t</b></span><span><small>Qəlib</small><b>{nf(t.formworkM2, 1)} m²</b></span><span className="main"><small>Cəmi</small><b data-testid="es-total">{azn(Math.round(t.amount * 100))}</b></span></div>
    {(t.unpricedLines > 0 || t.openLines > 0) && <p className="fn-note"><Info size={14} />{t.unpricedLines ? `${t.unpricedLines} sətrin qiyməti yazılmayıb — cəmə daxil deyil. ` : ''}{t.openLines ? `${t.openLines} sətir üçün məlumat çatışmır.` : ''} Qiymətləri öz mənbənizdən yazın; sistem qiymət uydurmur.</p>}
    {err && <p className="form-error">{err}</p>}
    <div className="es-table-wrap"><table className="es-table">
      <thead><tr><th>Material və ya iş</th><th className="num">Miqdar</th><th>Vahid</th><th className="num">Vahid qiymət</th><th className="num">Məbləğ</th><th></th></tr></thead>
      {CATS.filter((c) => items.some((i) => i.category === c)).map((c) => <tbody key={c}>
        <tr className="es-cat"><td colSpan={6}>{e.categoryLabels[c]}</td></tr>
        {items.filter((i) => i.category === c).map((i) => <Fragment key={i.key}>
          <tr key={i.key} className={`es-row ${i.reserve ? 'reserve' : ''}`} data-testid="es-row">
            <td><button className="es-name" onClick={() => setOpen(open === i.key ? null : i.key)} aria-expanded={open === i.key}>{i.name}<ChevronDown size={13} /></button><Pill small tone={STATUS_TONE[i.status]}>{e.statusLabels[i.status]}</Pill>{i.extra?.map((x) => <small key={x.label} className="es-extra">{x.label}: {nf(x.value)} {x.unit}</small>)}</td>
            <td className="num"><input className="es-num" defaultValue={i.qty ?? ''} key={`${i.key}-${i.qty}`} placeholder="—" inputMode="decimal" onBlur={(x) => { if (x.target.value !== String(i.qty ?? '')) setQty(i, x.target.value); }} aria-label={`${i.name} miqdarı`} data-testid="es-qty" />{i.overridden && <small className="es-was">hesablanan: {nf(i.computedQty)}</small>}</td>
            <td>{i.unit}</td>
            <td className="num"><input className="es-num" defaultValue={i.unitPrice ?? ''} key={`${i.key}-p-${i.unitPrice}`} placeholder="qiymət" inputMode="decimal" onBlur={(x) => { if (x.target.value !== String(i.unitPrice ?? '')) setPrice(i, x.target.value); }} aria-label={`${i.name} vahid qiyməti`} data-testid="es-price" /></td>
            <td className="num"><b>{i.amount == null ? '—' : azn(Math.round(i.amount * 100))}</b></td>
            <td><button className="icon-button" aria-label="Sətri sil" onClick={() => remove(i)}><Trash2 size={14} /></button></td>
          </tr>
          {open === i.key && <tr key={`${i.key}-x`} className="es-explain"><td colSpan={6}><pre>{i.formula}</pre>{i.assumptions.map((a) => <p key={a} className="es-assume"><Info size={12} />{a}</p>)}{i.overridden && <p className="es-assume">Sizin düzəlişiniz: {e.doc.overrides[i.key]?.reason || 'səbəb yazılmayıb'} · <button className="text-link" onClick={() => void run({ overrides: { [i.key]: null } })}>Hesablanana qaytar</button></p>}</td></tr>}
        </Fragment>)}
      </tbody>)}
    </table></div>
    {e.doc.removed.length > 0 && <button className="text-link" onClick={() => void run({ removed: [] })}>Silinmiş {e.doc.removed.length} sətri qaytar</button>}
    {adding ? <AddLine e={e} onClose={() => setAdding(false)} run={run} /> : <button className="button button-secondary" onClick={() => setAdding(true)} data-testid="es-add-line"><Plus size={15} />Material əlavə et</button>}
    {e.result.warnings.length > 0 && <ul className="es-warn">{e.result.warnings.map((w) => <li key={w}><AlertTriangle size={13} />{w}</li>)}</ul>}
  </section>;
}

function AddLine({ e, onClose, run }: { e: Estimate; onClose: () => void; run: (b: object) => Promise<void> }) {
  const [f, setF] = useState({ name: '', category: 'other' as Category, qty: '', unit: '' });
  const save = async () => { await run({ manual: [...e.doc.manual, { key: `manual-${Date.now().toString(36)}`, name: f.name, category: f.category, qty: f.qty ? Number(f.qty.replace(',', '.')) : null, unit: f.unit, source: 'manual' }] }); onClose(); };
  return <div className="es-addline">
    <input placeholder="Material və ya iş" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} data-testid="es-line-name" />
    <select value={f.category} onChange={(x) => setF({ ...f, category: x.target.value as Category })}>{CATS.map((c) => <option key={c} value={c}>{e.categoryLabels[c]}</option>)}</select>
    <input placeholder="Miqdar" inputMode="decimal" value={f.qty} onChange={(x) => setF({ ...f, qty: x.target.value })} data-testid="es-line-qty" />
    <input placeholder="Vahid" value={f.unit} onChange={(x) => setF({ ...f, unit: x.target.value })} />
    <button className="button button-primary sm-btn-sm" disabled={!f.name.trim()} onClick={() => void save()} data-testid="es-line-save">Əlavə et</button><button className="icon-button" aria-label="Bağla" onClick={onClose}><X size={14} /></button>
  </div>;
}

/* --------------------------------------------------------------- elements */

function Elements({ e, patch }: { e: Estimate; patch: (b: object) => Promise<void> }) {
  const [edit, setEdit] = useState<Element | null>(null);
  const [adding, setAdding] = useState<ElementType | ''>('');
  const save = async (el: Element) => { const list = e.doc.elements.some((x) => x.id === el.id) ? e.doc.elements.map((x) => x.id === el.id ? el : x) : [...e.doc.elements, el]; await patch({ elements: list, snapshot: true }); setEdit(null); };
  const remove = async (el: Element) => { if (!window.confirm(`“${el.name}” silinsin?`)) return; await patch({ elements: e.doc.elements.filter((x) => x.id !== el.id), snapshot: true }); };
  return <details className="es-section" open={!e.doc.elements.length || undefined}>
    <summary>Ölçülər və elementlər ({e.doc.elements.length})</summary>
    <p className="es-q-intro">Hər ölçünün mənbəyi göstərilir. Dəyişdirdiyiniz ölçü “Siz təsdiqləmisiniz” olur; AI yenidən oxuyanda onu dəyişmir.</p>
    <div className="es-elements">{e.doc.elements.map((el) => <div key={el.id} className="es-el" data-testid="es-element">
      <div className="es-el-head"><b>{el.name}</b><small>{TYPE[el.type]}</small><button className="text-link" onClick={() => setEdit(el)}>Düzəlt</button><button className="icon-button" aria-label="Sil" onClick={() => void remove(el)}><Trash2 size={13} /></button></div>
      <dl>{el.segments?.length ? <div><dt>Seqmentlər</dt><dd>{el.segments.map((s) => nf(s, 2)).join(' + ')} m <SourceTag p={el.params.segments} /></dd></div> : null}
        {PARAMS[el.type].filter(([k]) => el.params[k]).map(([k, label, unit]) => <div key={k}><dt>{label}</dt><dd>{el.params[k]?.value == null ? '—' : `${nf(el.params[k]!.value)} ${unit}`} <SourceTag p={el.params[k]} /></dd></div>)}</dl>
    </div>)}</div>
    <div className="es-add-el"><select value={adding} onChange={(x) => setAdding(x.target.value as ElementType)} aria-label="Element növü" data-testid="es-add-el"><option value="">+ Element əlavə et…</option>{(Object.keys(TYPE) as ElementType[]).map((t) => <option key={t} value={t}>{TYPE[t]}</option>)}</select></div>
    {(edit || adding) && <ElementForm el={edit ?? { id: `manual-${Date.now().toString(36)}`, type: adding as ElementType, name: TYPE[adding as ElementType], params: {} }} onClose={() => { setEdit(null); setAdding(''); }} onSave={async (el) => { await save(el); setAdding(''); }} />}
  </details>;
}
function SourceTag({ p }: { p?: { source: string; confidence?: number; where?: string; note?: string } }) {
  if (!p) return null;
  return <span className={`es-src s-${p.source}`} title={[p.where, p.note, p.confidence != null ? `əminlik ${Math.round(p.confidence * 100)}%` : ''].filter(Boolean).join(' · ')}>{SOURCE[p.source as keyof typeof SOURCE] ?? p.source}</span>;
}
function ElementForm({ el, onClose, onSave }: { el: Element; onClose: () => void; onSave: (el: Element) => Promise<void> }) {
  const [name, setName] = useState(el.name);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(PARAMS[el.type].map(([k]) => [k, el.params[k]?.value != null ? String(el.params[k]!.value) : ''])));
  const [segs, setSegs] = useState(el.segments?.join('; ') ?? '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    const params = { ...el.params };
    for (const [k] of PARAMS[el.type]) {
      const raw = vals[k]?.trim();
      const before = el.params[k];
      if (!raw) { if (before?.value != null && before.source !== 'missing') params[k] = { value: null, source: 'missing' }; continue; }
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) { setErr('Ölçüləri rəqəmlə yazın'); setBusy(false); return; }
      if (before?.value !== n) params[k] = { value: n, source: 'user' };
    }
    let segments = el.segments;
    if (el.type === 'strip_foundation') {
      const list = segs.split(/[;,\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0);
      if (list.join() !== (el.segments ?? []).join()) { segments = list; params.segments = { value: list.length || null, source: list.length ? 'user' : 'missing' }; }
    }
    try { await onSave({ ...el, name: name.trim() || el.name, params, segments }); } catch (x) { setErr(errorText(x)); setBusy(false); }
  };
  return <Modal open onClose={onClose} eyebrow={TYPE[el.type]} title={el.name} footer={<button className="button button-primary" disabled={busy} onClick={() => void save()} data-testid="es-el-save">{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Yadda saxla</button>}>
    <div className="fn-form">
      <label className="fn-field"><span>Ad</span><input value={name} onChange={(x) => setName(x.target.value)} /></label>
      {el.type === 'strip_foundation' && <label className="fn-field"><span>Seqment uzunluqları, m</span><input value={segs} onChange={(x) => setSegs(x.target.value)} placeholder="10; 10; 8; 8" data-testid="es-segments" /><small>Hər düz hissənin uzunluğu. Künclər “Künc / T-birləşmə” sayı ilə çıxılır — beton iki dəfə sayılmır.</small></label>}
      <div className="fn-grid2">{PARAMS[el.type].map(([k, label, unit]) => <label key={k} className="fn-field"><span>{label}, {unit} <SourceTag p={el.params[k]} /></span><input inputMode="decimal" value={vals[k] ?? ''} onChange={(x) => setVals({ ...vals, [k]: x.target.value })} data-testid={`es-p-${k}`} /></label>)}</div>
      <p className="fn-note"><Info size={14} />Ölçülər metrlə, armatur diametri millimetrlə. Boş qalan ölçü “Dəqiqləşdirilməlidir” olur.</p>
      {err && <p className="form-error">{err}</p>}
    </div>
  </Modal>;
}

/* --------------------------------------------------------------- settings */

function SettingsPanel({ e, patch }: { e: Estimate; patch: (b: object) => Promise<void> }) {
  const s = e.doc.settings, n = e.doc.norms;
  const [err, setErr] = useState('');
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const upd = async (b: object) => { setErr(''); try { await patch(b); } catch (x) { setErr(errorText(x)); } };
  const F = ({ label, value, onSave, hint }: { label: string; value: number | null | undefined; onSave: (v: number | null) => void; hint?: string }) =>
    <label className="fn-field"><span>{label}</span><input inputMode="decimal" defaultValue={value ?? ''} key={String(value)} onBlur={(x) => { const v = num(x.target.value); if (v !== (value ?? null)) onSave(v); }} />{hint && <small>{hint}</small>}</label>;
  return <details className="es-section"><summary><Settings2 size={15} />Parametrlər və normalar</summary>
    <div className="fn-grid2">
      <F label="Beton ehtiyatı, %" value={s.concreteReservePct} onSave={(v) => void upd({ settings: { concreteReservePct: v ?? 0 } })} hint="Ayrıca sətir kimi göstərilir" />
      <F label="Armatur kəsim itkisi, %" value={s.rebarCutPct} onSave={(v) => void upd({ settings: { rebarCutPct: v ?? 0 } })} />
      <F label="Üst-üstə düşmə, d" value={s.lapD} onSave={(v) => void upd({ settings: { lapD: v ?? 0 } })} hint="Məs. 40 → 40 diametr" />
      <F label="Ankerləmə, d" value={s.anchorD} onSave={(v) => void upd({ settings: { anchorD: v ?? 0 } })} />
      <F label="Armatur çubuğunun uzunluğu, m" value={s.stockLength} onSave={(v) => void upd({ settings: { stockLength: v ?? 11.7 } })} />
      <F label="Beton örtüyü, m" value={s.cover} onSave={(v) => void upd({ settings: { cover: v ?? 0.04 } })} />
      <F label="Dikt qalınlığı, mm" value={s.plywood.thicknessMm} onSave={(v) => void upd({ settings: { plywood: { ...s.plywood, thicknessMm: v } } })} />
      <F label="Qəlibin istifadə sayı" value={s.formworkUses} onSave={(v) => void upd({ settings: { formworkUses: v ?? 1 } })} hint="Eyni dikt neçə dəfə istifadə olunur" />
      <F label="Taxtanın uzunluğu, m" value={s.boardLength} onSave={(v) => void upd({ settings: { boardLength: v ?? 6 } })} />
      <F label="3×10 taxta, m / m² qəlib" value={n.board3x10PerM2} onSave={(v) => void upd({ norms: { board3x10PerM2: v } })} hint="Usta və ya mühəndisin norması" />
      <F label="5×10 taxta, m / m² qəlib" value={n.board5x10PerM2} onSave={(v) => void upd({ norms: { board5x10PerM2: v } })} />
      <F label="Yanmış məftil, kq / ton armatur" value={n.wirePerTon} onSave={(v) => void upd({ norms: { wirePerTon: v } })} />
      <F label="Katinka, kq / ton armatur" value={n.katinkaPerTon} onSave={(v) => void upd({ norms: { katinkaPerTon: v } })} />
    </div>
    {err && <p className="form-error">{err}</p>}
    <p className="fn-note"><Info size={14} />Sistem normaları özbaşına götürmür: boş qalan norma ilə sətir “Dəqiqləşdirilməlidir” olaraq qalır.</p>
  </details>;
}

/* ------------------------------------------------------- link to expenses */

function LinkPanel({ e, onDone }: { e: Estimate; onDone: () => Promise<unknown> }) {
  const books = useBooks();
  const [busy, setBusy] = useState(false);
  const link = async (homeId: string | null) => { setBusy(true); try { await api(`/ai-estimates/${e.id}/link`, 'POST', { homeId }); await onDone(); } finally { setBusy(false); } };
  const b = books.data?.books ?? [];
  const linked = b.find((x) => x.homeId === e.homeId);
  return <section className="es-section" data-testid="es-link">
    <h2><Link2 size={17} />Smeta və faktiki xərclər</h2>
    {!e.homeId ? <div className="es-link-row">
      <span>Smetanı “Evimin xərcləri” ilə bağlayın — kateqoriyalar üzrə nə qədər planlaşdırıldığını və nə qədər xərcləndiyini görəcəksiniz.</span>
      {b.length ? <select disabled={busy} defaultValue="" onChange={(x) => x.target.value && void link(x.target.value)} data-testid="es-link-select"><option value="">Evi seçin…</option>{b.map((x) => <option key={x.homeId} value={x.homeId}>{x.homeName}</option>)}</select>
        : <Link href="/xercler" className="button button-secondary sm-btn-sm">Əvvəlcə ev yaradın</Link>}
    </div> : <>
      <div className="es-link-row"><span>Bağlıdır: <Link href={`/xercler/${e.homeId}`}>{linked?.homeName ?? 'ev'}</Link></span><button className="text-link" onClick={() => void link(null)}>Ayır</button></div>
      {e.comparison && e.comparison.length > 0 && <div className="es-table-wrap"><table className="es-table cmp" data-testid="es-comparison"><thead><tr><th>Kateqoriya</th><th className="num">Smetada</th><th className="num">Faktiki</th><th className="num">Fərq</th>{e.comparison.some((c) => c.contractor != null) && <th className="num">Ustanın smetası</th>}</tr></thead>
        <tbody>{e.comparison.map((c) => <tr key={c.category}><td>{c.label}</td><td className="num">{azn(c.planned)}</td><td className="num">{azn(c.actual)}</td><td className={`num ${c.diff > 0 ? 'over' : c.diff < 0 ? 'under' : ''}`}>{c.diff > 0 ? '+' : ''}{azn(c.diff)}</td>{e.comparison!.some((x) => x.contractor != null) && <td className="num">{c.contractor == null ? '—' : azn(c.contractor)}</td>}</tr>)}</tbody></table></div>}
      <p className="fn-note"><Info size={14} />“Smetada” — qiyməti yazılmış sətirlərin cəmi. “Faktiki” — həmin evin təsdiqlənmiş xərcləri. Müsbət fərq planlaşdırılandan çox xərcləndiyini göstərir.</p>
    </>}
  </section>;
}

/* -------------------------------------------------- contractor's estimate */

function ContractorPanel({ e, onDone }: { e: Estimate; onDone: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [cats, setCats] = useState<Record<number, Category>>({});
  const upload = async (list: FileList | null) => {
    const f = list?.[0]; if (!f) return; setBusy(true); setErr('');
    try { const ct = typeOf(f); if (!ct.includes('spreadsheet') && ct !== 'text/csv') throw new Error('Ustanın smetasını XLSX və ya CSV kimi yükləyin.'); const up = await putFile(new File([f], f.name, { type: ct })); await api(`/ai-estimates/${e.id}/contractor`, 'POST', { file: up }); await onDone(); }
    catch (x) { setErr(errorText(x, x instanceof Error ? x.message : 'Yüklənmədi')); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const confirm = async () => {
    setBusy(true);
    try { await api(`/ai-estimates/${e.id}/contractor`, 'PATCH', { rows: e.contractor!.rows.map((r) => ({ row: r.row, category: cats[r.row] ?? r.category, confirmed: true })) }); await onDone(); setCats({}); } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const c = e.contractor;
  return <details className="es-section" open={!!c && c.rows.some((r) => r.confirmed == null)}>
    <summary><FileSpreadsheet size={15} />Ustanın smetası ilə müqayisə</summary>
    <p className="es-q-intro">Ustanın və ya podratçının verdiyi smetanı cədvəl (XLSX, CSV) kimi yükləyin. Sətirlərin kateqoriyasını sistem təklif edir — siz təsdiqləyəndən sonra müqayisəyə düşür.</p>
    <button className="button button-secondary sm-btn-sm" onClick={() => input.current?.click()} disabled={busy} data-testid="es-contractor-upload">{busy ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}{c ? 'Başqa fayl' : 'Ustanın smetasını yüklə'}</button>
    <input ref={input} type="file" accept=".xlsx,.csv,text/csv" hidden onChange={(x) => void upload(x.target.files)} data-testid="es-contractor-input" />
    {err && <p className="form-error">{err}</p>}
    {c && <><div className="es-table-wrap"><table className="es-table"><thead><tr><th>{c.fileName}</th><th className="num">Məbləğ</th><th>Kateqoriya</th><th></th></tr></thead>
      <tbody>{c.rows.map((r) => <tr key={r.row}><td>{r.name}<small className="es-extra">{r.qty != null ? `${nf(r.qty)} ${r.unit}` : ''}</small></td><td className="num">{r.amount == null ? '—' : azn(Math.round(r.amount * 100))}</td>
        <td><select value={cats[r.row] ?? r.category} onChange={(x) => setCats({ ...cats, [r.row]: x.target.value as Category })}>{CATS.map((k) => <option key={k} value={k}>{e.categoryLabels[k]}</option>)}</select></td>
        <td>{r.confirmed ? <Check size={14} className="es-ok" aria-label="təsdiqlənib" /> : <small className="es-wait">təsdiq gözləyir</small>}</td></tr>)}</tbody></table></div>
      <button className="button button-primary sm-btn-sm" onClick={() => void confirm()} disabled={busy} data-testid="es-contractor-confirm"><Check size={14} />Kateqoriyaları təsdiqlə</button></>}
  </details>;
}

