import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle2, FileText, Info, LoaderCircle, Plus, RotateCcw, Save, Sparkles, Trash2, X } from 'lucide-react';
import { api, errorText } from '@/lib/finance/api';
import { estimateKey, KIND, type Estimate, type WallKind, type WallsView, type WFloor, type WOpening, type WParam, type WWall } from '@/lib/estimate/api';
import { MasonryPanel } from './masonry-panel';
import './walls.css';

/*
 * "Hörgü və suvaq (çertyojdan)", stage 1: choose the PDF pages → AI reads floors, walls and openings → the person checks
 * every value (source shown next to it), edits, adds or removes, and confirms floor by floor. Until every floor is
 * confirmed nothing is presented as a final result.
 */

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const user = (value: number | null): WParam => ({ value, source: value == null ? 'missing' : 'user' });
const KINDS: WallKind[] = ['external', 'internal', 'partition'];
const SRC: Record<string, { label: string; tone: string }> = {
  drawing: { label: 'Çertyojdan', tone: 'ok' }, assumed: { label: 'Təxmini — yoxlayın', tone: 'warn' }, missing: { label: 'Yoxdur — yazın', tone: 'risk' }, user: { label: 'Siz yazmısınız', tone: 'info' },
};
const fmt = (v: number | null, scale: number) => (v == null ? '' : String(Math.round(v * scale * 1000) / 1000).replace('.', ','));
const parse = (s: string, scale: number) => { const t = s.replace(/\s/g, '').replace(',', '.'); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n / scale : NaN; };

export function WallsEstimatePage({ e, banner }: { e: Estimate; banner: React.ReactNode }) {
  const w = e.walls!;
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: estimateKey(e.id) });
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const pdfs = e.files.filter((f) => f.kind === 'drawing' && f.contentType === 'application/pdf');
  const images = e.files.filter((f) => f.kind === 'drawing' && f.contentType !== 'application/pdf');
  const needPick = pdfs.some((f) => !(w.pages[f.id]?.length));
  const analyze = async () => { setBusy('analyze'); setMsg(''); try { await api(`/ai-estimates/${e.id}/analyze`, 'POST', {}); await refresh(); } catch (x) { setMsg(errorText(x)); } finally { setBusy(''); } };
  return <>
    {banner}
    {pdfs.map((f) => <PagePicker key={f.id} estimateId={e.id} file={f} selected={w.pages[f.id] ?? []} max={w.maxPages} onSaved={refresh} />)}
    {e.files.some((f) => f.kind === 'drawing') && e.status !== 'analyzing' && <div className="es-banner" data-testid="wr-analyze-box"><Sparkles size={18} />
      <div><b>{w.analyzedAt ? 'Çertyojları yenidən oxu' : 'AI çertyojları oxusun'}</b><small>{pdfs.length ? `${pdfs.map((f) => `${f.name}: ${w.pages[f.id]?.length ? `${w.pages[f.id].length} səhifə seçilib` : 'səhifə seçilməyib (12 səhifədən çox olan PDF üçün seçmək lazımdır)'}`).join(' · ')}${images.length ? ` · ${images.length} şəkil` : ''}` : `${images.length} şəkil`}. Siz yazdığınız ölçülər yenidən oxunanda dəyişmir.</small></div>
      <button className="button button-primary sm-btn-sm" onClick={analyze} disabled={!!busy || !e.aiConfigured} data-testid="wr-analyze">{busy === 'analyze' ? <LoaderCircle className="spin" size={14} /> : w.analyzedAt ? <RotateCcw size={14} /> : <Sparkles size={14} />}{w.analyzedAt ? 'Yenidən oxu' : 'Oxu'}</button></div>}
    {needPick && pdfs.length > 0 && !w.analyzedAt && <p className="fn-note"><Info size={14} />Çoxsəhifəli layihədə yalnız mərtəbə planlarını, kəsiyi və pəncərə-qapı cədvəlini seçin — AI daha dəqiq oxuyur.</p>}
    {msg && <p className="es-msg" role="alert">{msg}</p>}
    {w.analyzedAt && <div className="es-ai-note"><Sparkles size={14} /><span>AI {w.drawingKinds.length ? `gördü: ${w.drawingKinds.map((k) => DK[k] ?? k).join(', ')}` : 'çertyojları oxudu'}.{w.scaleNote ? ` Miqyas: ${w.scaleNote}.` : ''}{w.unreadable.length ? ` Oxunmayan: ${w.unreadable.slice(0, 5).join(', ')}.` : ''}{w.notes ? ` ${w.notes}` : ''}</span></div>}
    <Review e={e} w={w} onSaved={refresh} />
    <MasonryPanel e={e} w={w} />
    <p className="fn-note"><Info size={14} />AI yalnız ölçüləri oxuyur — hesablamanı proqram aparır. Növbəti mərhələdə daxili və xarici suvaq (sement 40 kq, qum, gips ayrıca) hesablanacaq.</p>
  </>;
}
const DK: Record<string, string> = { floor_plan: 'mərtəbə planı', section: 'kəsik', elevation: 'fasad', structural_plan: 'konstruktiv plan', site_plan: 'baş plan', detail: 'detal', other: 'digər' };

/* -------------------------------------------------------------- page picker */

type Pdf = { numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> };
function PagePicker({ estimateId, file, selected, max, onSaved }: { estimateId: string; file: Estimate['files'][number]; selected: number[]; max: number; onSaved: () => Promise<unknown> }) {
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<number[]>(selected);
  const [open, setOpen] = useState(!selected.length);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSel(selected); }, [selected.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || pdf) return;
    let stop = false;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        const buf = await (await fetch(file.url, { credentials: 'include' })).arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
        if (!stop) setPdf(doc as unknown as Pdf);
      } catch { if (!stop) setErr('PDF açılmadı — səhifə seçmədən də oxutmaq olar (12 səhifəyə qədər).'); }
    })();
    return () => { stop = true; };
  }, [open, pdf, file.url]);
  const toggle = (n: number) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : s.length >= max ? s : [...s, n].sort((a, b) => a - b)));
  const save = async () => { setSaving(true); setErr(''); try { await api(`/ai-estimates/${estimateId}/pages`, 'PUT', { fileId: file.id, pages: sel }); await onSaved(); setOpen(false); } catch (x) { setErr(errorText(x)); } finally { setSaving(false); } };
  return <section className="es-section wr-pages" data-testid="wr-pages">
    <button className="wr-pages-head" onClick={() => setOpen(!open)} aria-expanded={open}><FileText size={16} /><b>{file.name}</b><span>{pdf ? `${pdf.numPages} səhifə · ` : ''}{selected.length ? `seçilib: ${selected.join(', ')}` : 'səhifələr seçilməyib'}</span></button>
    {open && <>
      <p className="wr-hint">Planların, kəsiyin və pəncərə-qapı cədvəlinin olduğu səhifələri seçin (ən çox {max}). Yalnız bunlar AI-yə göndərilir.</p>
      {!pdf && !err && <p className="fn-reading"><LoaderCircle className="spin" size={15} />PDF açılır…</p>}
      {pdf && <div className="wr-thumbs">{Array.from({ length: Math.min(pdf.numPages, 60) }, (_, i) => i + 1).map((n) => <Thumb key={n} pdf={pdf} n={n} on={sel.includes(n)} onClick={() => toggle(n)} />)}</div>}
      {pdf && pdf.numPages > 60 && <p className="wr-hint">İlk 60 səhifə göstərilir.</p>}
      {err && <p className="es-msg" role="alert">{err}</p>}
      <div className="wr-row"><span>{sel.length} / {max} seçilib</span><button className="button button-primary sm-btn-sm" onClick={save} disabled={saving || !sel.length} data-testid="wr-pages-save">{saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Seçimi saxla</button></div>
    </>}
  </section>;
}
function Thumb({ pdf, n, on, onClick }: { pdf: Pdf; n: number; on: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop = false;
    void pdf.getPage(n).then((p) => {
      if (stop || !ref.current) return;
      const v0 = p.getViewport({ scale: 1 }); const v = p.getViewport({ scale: 140 / Math.max(v0.width, v0.height) });
      const c = ref.current; c.width = v.width; c.height = v.height;
      const ctx = c.getContext('2d'); if (ctx) void p.render({ canvasContext: ctx, viewport: v }).promise.catch(() => null);
    }).catch(() => null);
    return () => { stop = true; };
  }, [pdf, n]);
  return <button type="button" className={`wr-thumb ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on} data-testid={`wr-page-${n}`}><canvas ref={ref} /><span>{on && <Check size={12} />}{n}</span></button>;
}

/* ------------------------------------------------------------------- review */

function Review({ e, w, onSaved }: { e: Estimate; w: WallsView; onSaved: () => Promise<unknown> }) {
  const [floors, setFloors] = useState<WFloor[]>(w.floors);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (!dirty) setFloors(w.floors); }, [w.floors, dirty]);
  const f = floors[Math.min(tab, floors.length - 1)];
  const issuesOf = (id: string) => w.state.issues.find((x) => x.floorId === id)?.issues ?? [];
  const change = (fn: (f: WFloor) => WFloor) => { setFloors((fs) => fs.map((x, i) => (i === Math.min(tab, fs.length - 1) ? { ...fn(x), confirmed: false } : x))); setDirty(true); };
  const save = async (next = floors) => {
    setBusy(true); setErr('');
    try { await api(`/ai-estimates/${e.id}/walls`, 'PUT', { floors: next }); setDirty(false); await onSaved(); } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const confirm = (on: boolean) => { const next = floors.map((x, i) => (i === Math.min(tab, floors.length - 1) ? { ...x, confirmed: on } : x)); setFloors(next); void save(next); };
  const addFloor = () => { setFloors((fs) => [...fs, { id: uid('f'), name: `${fs.length + 1}-ci mərtəbə`, level: fs.length, floorHeight: user(fs[fs.length - 1]?.floorHeight.value ?? null), slabThickness: user(fs[fs.length - 1]?.slabThickness.value ?? null), walls: [], confirmed: false }]); setTab(floors.length); setDirty(true); };
  const masonryH = f && f.floorHeight.value != null && f.slabThickness.value != null ? f.floorHeight.value - f.slabThickness.value : null;
  const confirmedN = floors.filter((x) => x.confirmed).length;

  if (!floors.length) return <section className="es-section" data-testid="wr-empty"><h2 className="es-h2">Mərtəbələr və divarlar</h2>
    <p className="wr-hint">{w.analyzedAt ? 'AI mərtəbə planı tapmadı.' : 'Hələ oxunmayıb.'} Ölçüləri özünüz də daxil edə bilərsiniz.</p>
    <button className="button button-secondary" onClick={addFloor} data-testid="wr-add-floor"><Plus size={15} />Mərtəbə əlavə et</button>
    {dirty && <button className="button button-primary" onClick={() => void save()} disabled={busy}>Yadda saxla</button>}</section>;

  return <section className="es-section wr" data-testid="wr-review">
    <div className="wr-status" data-testid="wr-status">{w.state.allConfirmed && !dirty
      ? <><CheckCircle2 size={18} /><span><b>Bütün mərtəbələr təsdiqlənib.</b> Ölçülər hesablama üçün hazırdır.</span></>
      : <><AlertTriangle size={18} /><span><b>Nəticə hələ yekun deyil.</b> {confirmedN} / {floors.length} mərtəbə təsdiqlənib{w.state.openIssues ? `, ${w.state.openIssues} ölçü yoxlanmalıdır` : ''}. Hər mərtəbəni yoxlayıb təsdiqləyin.</span></>}</div>
    <div className="wr-tabs" role="tablist">{floors.map((x, i) => <button key={x.id} role="tab" aria-selected={i === tab} className={i === tab ? 'on' : ''} onClick={() => setTab(i)} data-testid="wr-tab">{x.confirmed ? <Check size={13} /> : issuesOf(x.id).length ? <AlertTriangle size={13} /> : null}{x.name}</button>)}
      <button className="wr-tab-add" onClick={addFloor} data-testid="wr-add-floor"><Plus size={13} />Mərtəbə</button></div>

    <div className="wr-floor" data-testid="wr-floor">
      <div className="wr-floor-head">
        <input className="wr-name" value={f.name} onChange={(x) => change((y) => ({ ...y, name: x.target.value }))} aria-label="Mərtəbənin adı" />
        {floors.length > 1 && <button className="button button-quiet sm-btn-sm" onClick={() => { setFloors((fs) => fs.filter((x) => x.id !== f.id)); setTab(0); setDirty(true); }} data-testid="wr-remove-floor"><Trash2 size={14} />Mərtəbəni sil</button>}
      </div>
      <div className="wr-grid">
        <PInput label="Mərtəbə hündürlüyü (döşəmədən döşəməyə)" p={f.floorHeight} unit="m" onChange={(p) => change((y) => ({ ...y, floorHeight: p }))} testid="wr-fh" />
        <PInput label="Döşəmə plitəsi" p={f.slabThickness} unit="sm" scale={100} onChange={(p) => change((y) => ({ ...y, slabThickness: p }))} testid="wr-slab" />
        <div className="wr-calc"><small>Hörgü hündürlüyü</small><b data-testid="wr-mh">{masonryH == null ? '—' : `${fmt(masonryH, 1)} m`}</b><em>mərtəbə − plitə</em></div>
      </div>

      <div className="wr-walls">{f.walls.map((wl, i) => <WallCard key={wl.id} wl={wl} n={i + 1} kinds={w.kindLabels}
        onChange={(nw) => change((y) => ({ ...y, walls: y.walls.map((x) => (x.id === wl.id ? nw : x)) }))}
        onRemove={() => change((y) => ({ ...y, walls: y.walls.filter((x) => x.id !== wl.id) }))} />)}</div>
      <button className="button button-secondary" onClick={() => change((y) => ({ ...y, walls: [...y.walls, { id: uid('w'), name: `Divar ${y.walls.length + 1}`, kind: 'internal', length: user(null), thickness: user(y.walls[y.walls.length - 1]?.thickness.value ?? null), junctions: user(0), openings: [], origin: 'user' }] }))} data-testid="wr-add-wall"><Plus size={15} />Divar əlavə et</button>

      {!dirty && issuesOf(f.id).length > 0 && <div className="wr-issues" data-testid="wr-issues"><b>Yoxlanmalı ({issuesOf(f.id).length})</b><ul>{issuesOf(f.id).slice(0, 12).map((x, k) => <li key={k}>{x.text}</li>)}</ul>{issuesOf(f.id).length > 12 && <small>və daha {issuesOf(f.id).length - 12}</small>}</div>}
      {err && <p className="es-msg" role="alert" data-testid="wr-error">{err}</p>}
      <div className="wr-actions">
        {dirty && <button className="button button-primary" onClick={() => void save()} disabled={busy} data-testid="wr-save">{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Dəyişiklikləri saxla</button>}
        {!dirty && (f.confirmed
          ? <button className="button button-secondary" onClick={() => confirm(false)} disabled={busy} data-testid="wr-unconfirm"><X size={15} />Təsdiqi geri al</button>
          : <button className="button button-primary" onClick={() => confirm(true)} disabled={busy || issuesOf(f.id).length > 0} data-testid="wr-confirm">{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{f.name}: ölçüləri təsdiqlə</button>)}
        {f.confirmed && !dirty && <span className="wr-ok" data-testid="wr-confirmed"><CheckCircle2 size={15} />Təsdiqlənib</span>}
      </div>
    </div>
    <p className="wr-hint">Xarici divarın uzunluğu — fasadın xarici ölçüsü; daxili divarınkı — aradakı xalis məsafə. “Kəsişmələr” divarın ucunun neçə divara söykəndiyidir: hesablamada bu yerlər iki dəfə sayılmayacaq. {KIND[e.kind]}.</p>
    {dirty && <p className="wr-dirty">Saxlanmamış dəyişikliklər var.</p>}
    <Link href="/smeta-ai" className="text-link">Smetalarım</Link>
  </section>;
}

function WallCard({ wl, n, kinds, onChange, onRemove }: { wl: WWall; n: number; kinds: Record<WallKind, string>; onChange: (w: WWall) => void; onRemove: () => void }) {
  const setO = (id: string, p: Partial<WOpening>) => onChange({ ...wl, openings: wl.openings.map((o) => (o.id === id ? { ...o, ...p } : o)) });
  const addO = (kind: 'door' | 'window') => onChange({ ...wl, openings: [...wl.openings, { id: uid('o'), kind, count: user(1), width: user(null), height: user(null) }] });
  return <div className="wr-wall" data-testid="wr-wall">
    <div className="wr-wall-head"><span className="wr-no">{n}</span>
      <input className="wr-name" value={wl.name} onChange={(x) => onChange({ ...wl, name: x.target.value })} aria-label="Divarın adı" />
      <button className="icon-button" aria-label="Divarı sil" onClick={onRemove} data-testid="wr-remove-wall"><Trash2 size={15} /></button></div>
    <div className="wr-seg" role="radiogroup" aria-label="Divarın növü">{KINDS.map((k) => <button key={k} role="radio" aria-checked={wl.kind === k} className={wl.kind === k ? 'on' : ''} onClick={() => onChange({ ...wl, kind: k })} data-testid={`wr-kind-${k}`}>{kinds[k]}</button>)}</div>
    <div className="wr-grid">
      <PInput label="Uzunluq" p={wl.length} unit="m" onChange={(p) => onChange({ ...wl, length: p })} testid="wr-len" />
      <PInput label="Qalınlıq" p={wl.thickness} unit="sm" scale={100} onChange={(p) => onChange({ ...wl, thickness: p })} testid="wr-thick" />
      <PInput label="Kəsişmələr" p={wl.junctions} unit="ədəd" onChange={(p) => onChange({ ...wl, junctions: p })} testid="wr-junc" integer />
    </div>
    {wl.openings.map((o, i) => <div key={o.id} className="wr-open" data-testid="wr-opening">
      <div className="wr-open-head"><b>{o.kind === 'door' ? 'Qapı' : 'Pəncərə'} {i + 1}</b><button className="icon-button" aria-label="Boşluğu sil" onClick={() => onChange({ ...wl, openings: wl.openings.filter((x) => x.id !== o.id) })}><X size={14} /></button></div>
      <div className="wr-grid">
        <PInput label="Say" p={o.count} unit="ədəd" onChange={(p) => setO(o.id, { count: p })} testid="wr-o-count" integer />
        <PInput label="En" p={o.width} unit="m" onChange={(p) => setO(o.id, { width: p })} testid="wr-o-width" />
        <PInput label="Hündürlük" p={o.height} unit="m" onChange={(p) => setO(o.id, { height: p })} testid="wr-o-height" />
      </div>
    </div>)}
    <div className="wr-row"><button className="es-chip add" onClick={() => addO('door')} data-testid="wr-add-door"><Plus size={13} />Qapı</button><button className="es-chip add" onClick={() => addO('window')} data-testid="wr-add-window"><Plus size={13} />Pəncərə</button></div>
  </div>;
}

/** A value with its source; typing makes it the person's; an assumed value can be accepted as is. */
function PInput({ label, p, unit, scale = 1, onChange, testid, integer }: { label: string; p: WParam; unit: string; scale?: number; onChange: (p: WParam) => void; testid: string; integer?: boolean }) {
  const [text, setText] = useState(fmt(p.value, scale));
  useEffect(() => { setText(fmt(p.value, scale)); }, [p.value, scale]);
  const s = SRC[p.source] ?? SRC.user;
  const bad = useMemo(() => { const v = parse(text, scale); return Number.isNaN(v as number) || (integer && v != null && !Number.isInteger(v * scale)); }, [text, scale, integer]);
  return <label className={`wr-p ${p.source}`} data-testid={testid}>
    <span>{label}</span>
    <span className="wr-in"><input inputMode="decimal" value={text} aria-invalid={bad}
      onChange={(x) => { setText(x.target.value); const v = parse(x.target.value, scale); if (!Number.isNaN(v as number)) onChange({ value: v as number | null, source: v == null ? 'missing' : 'user', how: 'user' }); }} /><em>{unit}</em></span>
    <small className={`wr-src ${s.tone}`}>{s.label}{p.source !== 'user' && p.where ? ` · ${p.where}` : ''}{p.page ? ` · səh. ${p.page}` : ''}{p.how === 'scale' ? ' · miqyasdan' : ''}
      {p.source === 'assumed' && p.value != null && <button type="button" className="text-link" onClick={(x) => { x.preventDefault(); onChange({ ...p, source: 'user', how: 'user' }); }} data-testid={`${testid}-accept`}>Düzdür</button>}</small>
    {bad && <small className="wr-bad">Rəqəm yazın</small>}
  </label>;
}
