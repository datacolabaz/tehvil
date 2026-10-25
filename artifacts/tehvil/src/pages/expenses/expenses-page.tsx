import { useEffect, useRef, useState } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, Ban, Camera, Check, ChevronDown, Download, FileText, History, ImagePlus, Info, LoaderCircle, PencilLine, Plus, Settings2, Sparkles, Trash2, Wallet,
} from 'lucide-react';
import { Empty, Modal, Pill, Skeleton } from '@/components/home/ui';
import {
  api, azDate, azn, aznS, booksKey, downloadExcel, errorText, EXP_STATUS, EXP_TONE, financeKey, newKey, putFile, shrinkImage, today, toCentsS, useBooks, useFinance, useRefresh,
  type AiInvoice, type Book, type Expense, type Finance, type HistoryRow, type Invoice,
} from '@/lib/finance/api';
import '../home/finance.css';
import './expenses.css';

/*
 * "Evimin xərcləri" — the simple expense journal. One screen: add an expense (photo / file / by hand),
 * see total, this month, budget and what is left, filter by period, open a record, export to Excel.
 * The full finance (contractors, advances, debts) stays one link away for those who need it.
 */

/* ================================================================= entry */

export function ExpensesEntryPage() {
  const q = useBooks();
  const add = new URLSearchParams(window.location.search).get('add') === '1';
  if (q.isLoading) return <Skeleton rows={3} />;
  if (q.isError) return <Empty icon={<Wallet size={28} />} title="Açılmadı" text={errorText(q.error)} />;
  const books = q.data!.books;
  if (!books.length) return <div className="ex-page"><h1 className="font-display ex-title">Evimin xərcləri</h1><NewBook first add={add} /></div>;
  if (books.length === 1) return <Redirect to={`/xercler/${books[0].homeId}${add ? '?add=1' : ''}`} replace />;
  return <div className="ex-page">
    <h1 className="font-display ex-title">Evimin xərcləri</h1>
    <div className="ex-books">{books.map((b) => <Link key={b.homeId} href={`/xercler/${b.homeId}`} className="ex-book" data-testid="ex-book">
      <span><b>{b.homeName}</b><small>{b.count} xərc{b.location ? ` · ${b.location}` : ''}</small></span><span className="ex-book-sum"><b>{azn(b.total)}</b><small>bu ay {azn(b.month)}</small></span><ArrowRight size={16} />
    </Link>)}</div>
    <NewBook />
  </div>;
}

function NewBook({ first, add }: { first?: boolean; add?: boolean }) {
  const [open, setOpen] = useState(!!first);
  const [f, setF] = useState({ name: '', startDate: '', location: '', budget: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const qc = useQueryClient(); const [, go] = useLocation();
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api<{ homeId: string }>('/expense-books', 'POST', { name: f.name, startDate: f.startDate || null, location: f.location, budget: f.budget || null });
      await qc.invalidateQueries({ queryKey: booksKey }); go(`/xercler/${r.homeId}${add || first ? '?add=1' : ''}`);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  if (!open) return <button className="button button-secondary ex-newbook" onClick={() => setOpen(true)}><Plus size={16} />Başqa ev və ya təmir</button>;
  return <section className="ex-card ex-create" data-testid="ex-create">
    {first && <p className="ex-intro">Xərcləri hansı evə yazaq? Yalnız ad kifayətdir — qalanını sonra da yaza bilərsiniz.</p>}
    <label className="fn-field"><span>Evin adı</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Məs. Həyət evim" data-testid="ex-home-name" autoFocus /></label>
    <div className="fn-grid2">
      <label className="fn-field"><span>Tikintinin başlanması <em>· istəyə bağlı</em></span><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
      <label className="fn-field"><span>İlkin büdcə, AZN <em>· istəyə bağlı</em></span><input inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} placeholder="40000" data-testid="ex-home-budget" /></label>
    </div>
    <label className="fn-field"><span>Yeri <em>· istəyə bağlı</em></span><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Məs. Mərdəkan" /></label>
    {err && <p className="form-error">{err}</p>}
    <button className="button button-primary ex-big" disabled={busy || !f.name.trim()} onClick={save} data-testid="ex-home-save">{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{first ? 'Yarat və xərc əlavə et' : 'Yarat'}</button>
  </section>;
}

/* ================================================================== book */

type Period = 'all' | 'today' | 'week' | 'month' | 'year' | 'range';
const PERIODS: [Period, string][] = [['all', 'Hamısı'], ['today', 'Bu gün'], ['week', 'Bu həftə'], ['month', 'Bu ay'], ['year', 'Bu il'], ['range', 'Tarix aralığı']];
function periodRange(p: Period, from: string, to: string): { from?: string; to?: string } {
  const t = today();
  if (p === 'today') return { from: t, to: t };
  if (p === 'week') { const d = new Date(`${t}T12:00:00`); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return { from: d.toISOString().slice(0, 10), to: t }; }
  if (p === 'month') return { from: `${t.slice(0, 8)}01`, to: t };
  if (p === 'year') return { from: `${t.slice(0, 4)}-01-01`, to: t };
  if (p === 'range') return { from: from || undefined, to: to || undefined };
  return {};
}

export function ExpenseBookPage({ homeId }: { homeId: string }) {
  const books = useBooks();
  const qc = useQueryClient();
  const book = books.data?.books.find((b) => b.homeId === homeId);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    // A home made earlier in "Evimin tarixçəsi" gets its expense book on first visit.
    if (book && !book.projectId && !creating) { setCreating(true); void api(`/homes/${homeId}/expense-book`, 'POST', {}).then(() => qc.invalidateQueries({ queryKey: booksKey })); }
  }, [book, creating, homeId, qc]);
  if (books.isLoading || (book && !book.projectId)) return <Skeleton rows={4} />;
  if (!book) return <Empty icon={<Wallet size={28} />} title="Ev tapılmadı" text="Bu evin xərclərini görmək icazəniz yoxdur və ya ev silinib." action={<Link className="button button-secondary" href="/xercler">Evimin xərcləri</Link>} />;
  return <Book book={book} others={books.data!.books.filter((b) => b.homeId !== homeId)} />;
}

function Book({ book, others }: { book: Book; others: Book[] }) {
  const projectId = book.projectId!;
  const q = useFinance(projectId);
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>('all');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [cat, setCat] = useState('all');
  const [adding, setAdding] = useState(() => new URLSearchParams(window.location.search).get('add') === '1');
  const [form, setForm] = useState<null | { invoice: Invoice | null; existing?: Expense }>(null);
  const [detail, setDetail] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  if (q.isLoading) return <Skeleton rows={4} />;
  if (q.isError) return <Empty icon={<Wallet size={28} />} title="Açılmadı" text={errorText(q.error)} />;
  const d = q.data!;
  const range = periodRange(period, from, to);
  const live = d.expenses.filter((e) => e.status !== 'void');
  const list = live.filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to) && (cat === 'all' || e.category === cat))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const approved = (rows: Expense[]) => rows.filter((e) => e.status === 'approved').reduce((s, e) => s + toCentsS(e.total), 0);
  const total = approved(live);
  const monthStart = `${today().slice(0, 8)}01`;
  const month = approved(live.filter((e) => e.date >= monthStart));
  const budget = d.totals?.budgetCurrent ?? null;
  const shown = approved(list);
  const pendingReceipts = d.invoices.filter((i) => i.status === 'read' || i.status === 'reading' || i.status === 'failed' || i.status === 'uploaded');
  const usedCats = [...new Set(live.map((e) => e.category))];
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: financeKey(projectId) }), qc.invalidateQueries({ queryKey: booksKey })]);
  const exportX = async () => { setBusy(true); try { await downloadExcel(projectId, book.homeName, range); } catch (e) { window.alert(errorText(e)); } finally { setBusy(false); } };
  return <div className="ex-page">
    <div className="ex-head">
      <button className="ex-home" onClick={() => setSwitchOpen(!switchOpen)} aria-expanded={switchOpen}><span className="eyebrow">Evimin xərcləri</span><b className="font-display">{book.homeName}</b>{others.length > 0 && <ChevronDown size={16} />}</button>
      <button className="button button-secondary" onClick={exportX} disabled={busy} data-testid="ex-export">{busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}Excel</button>
    </div>
    {switchOpen && <div className="ex-switch">{others.map((b) => <Link key={b.homeId} href={`/xercler/${b.homeId}`} onClick={() => setSwitchOpen(false)}>{b.homeName}</Link>)}<Link href="/xercler">Bütün evlər</Link></div>}

    <button className="button button-primary ex-add" onClick={() => setAdding(true)} data-testid="ex-add"><Plus size={22} />Xərc əlavə et</button>

    <div className="ex-figs" data-testid="ex-figs">
      <div className="ex-fig main"><small>İndiyə qədər ümumi xərc</small><b data-testid="ex-total">{azn(total)}</b></div>
      <div className="ex-fig"><small>Bu ay</small><b data-testid="ex-month">{azn(month)}</b></div>
      <div className="ex-fig"><small>Büdcə</small>{budget == null ? <button className="text-link" onClick={() => setBudgetOpen(true)} data-testid="ex-set-budget">Büdcəni yaz</button> : <b>{azn(budget)}</b>}</div>
      <div className={`ex-fig ${budget != null && budget - total < 0 ? 'risk' : ''}`}><small>Büdcədən qalan</small><b data-testid="ex-left">{budget == null ? '—' : azn(budget - total)}</b>{budget == null && <small className="ex-muted">büdcə yazılmayıb</small>}</div>
    </div>

    {pendingReceipts.length > 0 && <div className="ex-pending">{pendingReceipts.map((i) => <button key={i.id} onClick={() => setForm({ invoice: i })} data-testid="ex-pending-receipt">
      {i.status === 'reading' ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
      <span>{i.status === 'reading' ? 'Qəbz oxunur…' : i.status === 'read' ? `Qəbzi təsdiqləyin${i.total ? ` · ${aznS(i.total)}` : ''}` : 'Qəbz oxunmadı — məbləği yazın'}</span><ArrowRight size={14} />
    </button>)}</div>}

    <div className="ex-filters">
      <div className="ex-chips" role="tablist" aria-label="Dövr">{PERIODS.map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)} data-testid={`ex-period-${k}`}>{l}</button>)}</div>
      {period === 'range' && <div className="ex-range"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlanğıc" data-testid="ex-from" /><span>—</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Son" data-testid="ex-to" /></div>}
      {usedCats.length > 1 && <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kateqoriya"><option value="all">Bütün kateqoriyalar</option>{usedCats.map((c) => <option key={c} value={c}>{d.categories.find((x) => x.key === c)?.label ?? c}</option>)}</select>}
    </div>
    <p className="ex-shown">{period === 'all' && cat === 'all' ? 'Bütün xərclər' : 'Seçilən dövr'}: <b data-testid="ex-shown">{azn(shown)}</b> · {list.length} qeyd</p>

    {!list.length ? <Empty icon={<Wallet size={26} />} title={live.length ? 'Bu dövrdə xərc yoxdur' : 'Hələ xərc yoxdur'} text="“Xərc əlavə et” ilə qəbzin şəklini çəkin və ya məbləği yazın." />
      : <table className="ex-table" data-testid="ex-table"><thead><tr><th>Tarix</th><th>Xərc</th><th className="hide-s">Kateqoriya</th><th className="num">Məbləğ</th></tr></thead>
        <tbody>{list.map((e) => <tr key={e.id} onClick={() => setDetail(e)} tabIndex={0} onKeyDown={(k) => { if (k.key === 'Enter') setDetail(e); }} data-testid="ex-row">
          <td>{azDate(e.date)}</td>
          <td><b>{e.description}</b><small className="show-s">{d.categories.find((c) => c.key === e.category)?.label}</small>{e.status !== 'approved' && <Pill small tone={EXP_TONE[e.status]}>{EXP_STATUS[e.status]}</Pill>}{e.invoiceId && <FileText size={13} className="ex-has-receipt" aria-label="qəbz var" />}</td>
          <td className="hide-s">{d.categories.find((c) => c.key === e.category)?.label ?? e.category}</td>
          <td className="num">{aznS(e.total)}</td>
        </tr>)}</tbody></table>}

    <Link href={`/homes/${book.homeId}/maliyye/${projectId}`} className="ex-more"><Settings2 size={15} />Ətraflı: podratçı, usta, ödəniş, avans və borc hesabları</Link>

    {adding && <AddChooser projectId={projectId} onClose={() => setAdding(false)} onManual={() => { setAdding(false); setForm({ invoice: null }); }} onInvoice={(inv) => { setAdding(false); setForm({ invoice: inv }); }} />}
    {form && <SimpleExpenseForm d={d} projectId={projectId} invoice={form.invoice} existing={form.existing} onClose={() => setForm(null)} onSaved={refresh} />}
    {detail && <ExpenseDetail d={d} projectId={projectId} e={d.expenses.find((x) => x.id === detail.id) ?? detail} onClose={() => setDetail(null)} onEdit={(e) => { setDetail(null); setForm({ invoice: null, existing: e }); }} onChanged={refresh} />}
    {budgetOpen && <BudgetModal projectId={projectId} onClose={() => setBudgetOpen(false)} onSaved={refresh} />}
  </div>;
}

/* ------------------------------------------------------------- add chooser */

function AddChooser({ projectId, onClose, onManual, onInvoice }: { projectId: string; onClose: () => void; onManual: () => void; onInvoice: (i: Invoice) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; err: string }>({ busy: false, err: '' });
  const qc = useQueryClient();
  const upload = async (list: FileList | null) => {
    const original = list?.[0]; if (!original) return;
    setState({ busy: true, err: '' });
    try {
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(original.type)) throw new Error('Şəkil (JPG, PNG, WebP) və ya PDF seçin.');
      const f = await putFile(await shrinkImage(original));
      const r = await api<{ id: string }>(`/home-projects/${projectId}/invoices`, 'POST', { file: f });
      await qc.invalidateQueries({ queryKey: financeKey(projectId) });
      const fresh = await api<Finance>(`/home-projects/${projectId}/finance`);
      const inv = fresh.invoices.find((i) => i.id === r.id);
      if (inv) onInvoice(inv);
    } catch (e) { setState({ busy: false, err: e instanceof Error && !(e as { data?: unknown }).data ? e.message : errorText(e, 'Fayl yüklənmədi. Yenidən cəhd edin.') }); }
  };
  return <Modal open onClose={onClose} eyebrow="Xərc əlavə et" title="Necə əlavə edək?">
    <div className="ex-choose">
      <button className="ex-opt primary" onClick={() => camera.current?.click()} disabled={state.busy} data-testid="ex-opt-camera">{state.busy ? <LoaderCircle className="spin" size={26} /> : <Camera size={26} />}<span><b>Şəkil çək</b><small>Qəbzin, materialın və ya işin şəkli</small></span></button>
      <button className="ex-opt" onClick={() => file.current?.click()} disabled={state.busy} data-testid="ex-opt-file"><ImagePlus size={26} /><span><b>Şəkil və ya fayl yüklə</b><small>Qalereyadan şəkil və ya PDF qəbz</small></span></button>
      <button className="ex-opt" onClick={onManual} disabled={state.busy} data-testid="ex-opt-manual"><PencilLine size={26} /><span><b>Əl ilə daxil et</b><small>Məbləğ, ad, kateqoriya, tarix</small></span></button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void upload(e.target.files)} />
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => void upload(e.target.files)} data-testid="ex-file-input" />
      {state.busy && <p className="fn-note" role="status"><LoaderCircle className="spin" size={14} />Yüklənir…</p>}
      {state.err && <p className="form-error" role="alert">{state.err}</p>}
    </div>
  </Modal>;
}

/* ------------------------------------------------------------ simple form */

type Line = { name: string; quantity: string; unit: string; unitPrice: string; lineTotal: string };
const c = (s: string) => { const v = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? Math.round(v * 100) : 0; };

function SimpleExpenseForm({ d, projectId, invoice, existing, onClose, onSaved }: { d: Finance; projectId: string; invoice: Invoice | null; existing?: Expense; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const live = useFinance(projectId, !!invoice && invoice.status === 'reading').data;
  const inv = invoice ? live?.invoices.find((i) => i.id === invoice.id) ?? invoice : null;
  const ai: AiInvoice | null = inv?.aiResult ?? null;
  const media = inv ? (live ?? d).media.find((m) => m.id === inv.mediaId) : null;
  const cats = d.categories.filter((x) => !x.legacy || x.key === existing?.category);
  const seed = () => existing ? {
    total: existing.total, description: existing.description, category: existing.category, date: existing.date, dateSource: 'manual', note: existing.note, vendorName: existing.vendorName,
    paymentMethod: existing.paymentMethod, lines: existing.items.map((i) => ({ name: i.name, quantity: i.quantity ?? '', unit: i.unit, unitPrice: i.unitPrice ?? '', lineTotal: i.lineTotal ?? '' })), reason: '',
  } : {
    total: ai?.total ?? '', description: ai?.items?.length ? ai.items.slice(0, 2).map((i) => i.name).join(', ') + (ai.items.length > 2 ? '…' : '') : '',
    category: ai?.suggestedCategory && cats.some((x) => x.key === ai.suggestedCategory) ? ai.suggestedCategory : 'building_materials',
    date: ai?.handwrittenDate ?? ai?.printedDate ?? today(), dateSource: ai?.handwrittenDate ? 'handwritten' : ai?.printedDate ? 'printed' : 'today', note: '', vendorName: ai?.vendor ?? '',
    paymentMethod: ai?.paymentMethod ?? '', lines: (ai?.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '', unitPrice: i.unitPrice ?? '', lineTotal: i.lineTotal ?? '' })), reason: '',
  };
  const [f, setF] = useState(seed);
  const [seeded, setSeeded] = useState(!!ai || !invoice);
  useEffect(() => { if (!seeded && ai) { setF(seed()); setSeeded(true); } }, [ai]); // eslint-disable-line react-hooks/exhaustive-deps
  const [more, setMore] = useState(!!existing && (existing.items.length > 0 || !!existing.vendorName));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [dups, setDups] = useState<{ reason: string }[]>([]);
  const [key] = useState(newKey);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const low = (k: string) => !!ai && (ai.confidence?.[k] ?? 1) < 0.6;
  const linesSum = f.lines.reduce((s, l) => s + (l.lineTotal ? c(l.lineTotal) : 0), 0);
  const subtotal = ai?.subtotal ? c(ai.subtotal) : null;
  const expectedTotal = subtotal != null ? subtotal - c(ai?.discount ?? '0') + c(ai?.tax ?? '0') : null;
  const problems: string[] = [];
  if (f.lines.length && subtotal != null && linesSum !== subtotal) problems.push(`sətirlərin cəmi ${azn(linesSum)}, qəbzdə ara cəm ${azn(subtotal)}`);
  if (expectedTotal != null && f.total && expectedTotal !== c(f.total)) problems.push(`ara cəm − endirim + vergi = ${azn(expectedTotal)}, yekun isə ${azn(c(f.total))}`);
  useEffect(() => {
    if (existing || !f.total || !f.date) { setDups([]); return; }
    const t = window.setTimeout(() => { void api<{ reason: string }[]>(`/home-projects/${projectId}/duplicates`, 'POST', { vendor: f.vendorName, date: f.date, total: f.total, invoiceId: inv?.id ?? null }).then(setDups).catch(() => setDups([])); }, 500);
    return () => window.clearTimeout(t);
  }, [f.vendorName, f.date, f.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const reading = inv?.status === 'reading';
  const save = async () => {
    setBusy(true); setErr('');
    const items = f.lines.filter((l) => l.name.trim()).map((l) => ({ name: l.name, quantity: l.quantity || null, unit: l.unit, unitPrice: l.unitPrice || null, lineTotal: l.lineTotal || null }));
    const body = {
      date: f.date, dateSource: f.dateSource, category: f.category, description: f.description, vendorName: f.vendorName, note: f.note, total: f.total, paymentMethod: f.paymentMethod, items,
      // Lines only fill the journal when the receipt's own figures add up; otherwise the total alone is kept.
      subtotal: existing ? (items.length ? existing.subtotal : f.total) : items.length ? (ai?.subtotal ?? null) : f.total,
      discount: existing ? (items.length ? existing.discount : null) : items.length ? ai?.discount ?? null : null,
      tax: existing ? (items.length ? existing.tax : null) : items.length ? ai?.tax ?? null : null,
    };
    try {
      if (existing) await api(`/home-projects/${projectId}/expenses/${existing.id}`, 'PATCH', { ...body, reason: f.reason });
      else await api(`/home-projects/${projectId}/expenses`, 'POST', { ...body, invoiceId: inv?.id ?? null, paidNow: true, idempotencyKey: key });
      await onSaved(); onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const discard = async () => { if (!inv) return; try { await api(`/home-projects/${projectId}/invoices/${inv.id}/discard`, 'POST', {}); await onSaved(); onClose(); } catch (e) { setErr(errorText(e)); } };
  const dates = ai ? [...(ai.printedDate ? [['printed', ai.printedDate, 'Qəbzdəki tarix']] : []), ...(ai.handwrittenDate ? [['handwritten', ai.handwrittenDate, 'Əl ilə yazılmış tarix']] : []), ['today', today(), 'Bu gün']] as [string, string, string][] : [];
  return <Modal open onClose={onClose} wide={!!inv} eyebrow={existing ? 'Xərci düzəlt' : inv ? 'Qəbzi təsdiqləyin' : 'Əl ilə'} title={existing ? existing.description : inv ? (reading ? 'AI oxuyur…' : ai ? 'Oxunanı yoxlayın' : 'Məbləği yazın') : 'Yeni xərc'}
    footer={<>{inv && !existing && <button className="button button-secondary" onClick={discard}>Qəbzi ləğv et</button>}<button className="button button-primary ex-save" disabled={busy || reading || !f.total || !f.description.trim() || (existing?.status === 'approved' && !f.reason.trim())} onClick={save} data-testid="ex-save">{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Yadda saxla</button></>}>
    <div className={inv ? 'fn-review' : ''}>
      {inv && <div className="fn-doc">{media && (media.contentType === 'application/pdf' ? <a className="fn-pdf" href={media.url} target="_blank" rel="noreferrer"><FileText size={22} />PDF-i aç</a> : <a href={media.url} target="_blank" rel="noreferrer"><img src={media.url} alt="Qəbz" /></a>)}
        {reading && <p className="fn-reading"><LoaderCircle className="spin" size={16} />AI qəbzi oxuyur — adətən 5–20 saniyə.</p>}
        {inv.status === 'failed' && <p className="fn-mismatch"><AlertTriangle size={13} />Qəbz oxunmadı. Məbləği və adı özünüz yazın.</p>}
        {inv.status === 'uploaded' && <p className="fn-note"><Info size={14} />AI oxuma qoşulmayıb — məbləği özünüz yazın.</p>}
        {ai && <p className="fn-ai-note"><Sparkles size={14} />AI-nin oxuduqları doldurulub. Sarı xanaları mütləq yoxlayın.{ai.unreadable.length ? ` Oxunmayan: ${ai.unreadable.join(', ')}.` : ''}</p>}
      </div>}
      <div className="fn-form">
        <label className={`fn-field ex-amount ${low('total') ? 'warn' : ''}`}><span>Məbləğ, AZN{low('total') && <em> · zəif oxunub</em>}</span><input inputMode="decimal" value={f.total} onChange={(e) => set({ total: e.target.value })} placeholder="0,00" data-testid="ex-amount" autoFocus={!inv} /></label>
        <label className="fn-field"><span>Xərcin adı</span><input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Məs. Sement 20 kisə" data-testid="ex-name" /></label>
        <label className="fn-field"><span>Kateqoriya</span><select value={f.category} onChange={(e) => set({ category: e.target.value })} data-testid="ex-category">{cats.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
        {dates.length > 1 && <fieldset className="fn-dates"><legend>Hansı tarix?</legend>{dates.map(([v, dt, l]) => <label key={v} className={f.dateSource === v ? 'on' : ''}><input type="radio" checked={f.dateSource === v} onChange={() => set({ dateSource: v, date: dt })} />{l}: <b>{azDate(dt)}</b>{v === 'handwritten' && low('handwrittenDate') && <em> (zəif oxunub)</em>}</label>)}</fieldset>}
        <label className="fn-field"><span>Tarix</span><input type="date" value={f.date} max={today()} onChange={(e) => set({ date: e.target.value, dateSource: 'manual' })} data-testid="ex-date" /></label>
        <label className="fn-field"><span>Qeyd <em>· istəyə bağlı</em></span><input value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
        {problems.length > 0 && <div className="fn-mismatch" role="alert" data-testid="ex-mismatch"><AlertTriangle size={14} /><span>Qəbzdəki rəqəmlər uyğun gəlmir: {problems.join('; ')}. Məbləğ avtomatik dəyişdirilmir — qəbzlə yoxlayın.</span></div>}
        {dups.length > 0 && <div className="fn-mismatch" role="alert" data-testid="ex-dup"><AlertTriangle size={14} /><span>Bu xərc artıq yazılmış ola bilər ({dups[0].reason}). İki dəfə yazmadığınızı yoxlayın.</span></div>}
        <button type="button" className="text-link ex-toggle" onClick={() => setMore(!more)} aria-expanded={more}>{more ? 'Az göstər' : `Ətraflı: satıcı, ödəniş üsulu${f.lines.length ? `, ${f.lines.length} sətir` : ', sətirlər'}`}<ChevronDown size={14} /></button>
        {more && <>
          <div className="fn-grid2">
            <label className={`fn-field ${low('vendor') ? 'warn' : ''}`}><span>Satıcı</span><input value={f.vendorName} onChange={(e) => set({ vendorName: e.target.value })} /></label>
            <label className="fn-field"><span>Ödəniş üsulu</span><select value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}><option value="">—</option><option value="cash">Nağd</option><option value="card">Kart</option><option value="transfer">Köçürmə</option><option value="other">Digər</option></select></label>
          </div>
          <div className="fn-items-edit">
            <div className="fn-items-head"><b>Sətirlər (material, miqdar, qiymət)</b><button type="button" className="text-link" onClick={() => set({ lines: [...f.lines, { name: '', quantity: '', unit: '', unitPrice: '', lineTotal: '' }] })}><Plus size={14} />Sətir</button></div>
            {f.lines.map((l, k) => <div key={k} className="fn-item">
              {(['name', 'quantity', 'unit', 'unitPrice', 'lineTotal'] as (keyof Line)[]).map((fk) => <input key={fk} aria-label={fk} placeholder={{ name: 'Ad', quantity: 'Miqdar', unit: 'Vahid', unitPrice: 'Qiymət', lineTotal: 'Cəmi' }[fk]} inputMode={fk === 'name' || fk === 'unit' ? undefined : 'decimal'} value={l[fk]} onChange={(e) => set({ lines: f.lines.map((x, j) => j === k ? { ...x, [fk]: e.target.value } : x) })} />)}
              <button type="button" className="icon-button" aria-label="Sətri sil" onClick={() => set({ lines: f.lines.filter((_, j) => j !== k) })}><Trash2 size={14} /></button>
            </div>)}
          </div>
        </>}
        {existing?.status === 'approved' && <label className="fn-field"><span>Düzəlişin səbəbi</span><input value={f.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Məs. qəbzlə yoxladım" data-testid="ex-reason" /><small>Əvvəlki və yeni dəyər tarixçədə saxlanılır.</small></label>}
        {err && <p className="form-error">{err}</p>}
      </div>
    </div>
  </Modal>;
}

/* ---------------------------------------------------------------- detail */

const ACTION: Record<string, string> = { 'expense.created': 'Yaradıldı', 'expense.edited': 'Düzəldildi', 'expense.approve': 'Təsdiqləndi', 'expense.void': 'Ləğv edildi', 'expense.dispute': 'Mübahisəli edildi', 'expense.reopen': 'Yenidən açıldı' };
const FIELD: Record<string, string> = { total: 'Məbləğ', description: 'Ad', category: 'Kateqoriya', date: 'Tarix', note: 'Qeyd', vendorName: 'Satıcı', items: 'Sətirlər', status: 'Status', subtotal: 'Ara cəm', paymentMethod: 'Ödəniş üsulu' };

function ExpenseDetail({ d, projectId, e, onClose, onEdit, onChanged }: { d: Finance; projectId: string; e: Expense; onClose: () => void; onEdit: (e: Expense) => void; onChanged: () => Promise<unknown> }) {
  const [hist, setHist] = useState<HistoryRow[] | null>(null);
  useEffect(() => { void api<HistoryRow[]>(`/home-projects/${projectId}/expenses/${e.id}/history`).then(setHist).catch(() => setHist([])); }, [projectId, e.id, e.total, e.status]);
  const inv = e.invoiceId ? d.invoices.find((i) => i.id === e.invoiceId) : null;
  const media = inv ? d.media.find((m) => m.id === inv.mediaId) : null;
  const voidIt = async () => {
    const reason = window.prompt('Niyə ləğv edirsiniz? (qeyd silinmir, ləğv edilmiş kimi qalır)');
    if (!reason) return;
    try { await api(`/home-projects/${projectId}/expenses/${e.id}/status`, 'POST', { action: 'void', reason }); await onChanged(); onClose(); } catch (x) { window.alert(errorText(x)); }
  };
  const cat = d.categories.find((x) => x.key === e.category)?.label ?? e.category;
  return <Modal open onClose={onClose} eyebrow={azDate(e.date)} title={e.description} footer={<>{d.permissions.manage && e.status !== 'void' && <button className="button button-secondary" onClick={voidIt}><Ban size={15} />Ləğv et</button>}{(d.permissions.manage || (e.mine && e.status === 'pending')) && e.status !== 'void' && <button className="button button-primary" onClick={() => onEdit(e)} data-testid="ex-edit"><PencilLine size={15} />Düzəlt</button>}</>}>
    <div className="ex-detail" data-testid="ex-detail">
      <div className="ex-detail-amt"><b>{aznS(e.total)}</b><span>{cat}</span>{e.status !== 'approved' && <Pill small tone={EXP_TONE[e.status]}>{EXP_STATUS[e.status]}</Pill>}</div>
      {media && (media.contentType === 'application/pdf' ? <a className="fn-pdf" href={media.url} target="_blank" rel="noreferrer"><FileText size={20} />Qəbzi aç (PDF)</a> : <a href={media.url} target="_blank" rel="noreferrer" className="ex-receipt"><img src={media.url} alt="Orijinal qəbz" /></a>)}
      <dl className="fn-dl">
        {e.vendorName && <div><dt>Satıcı</dt><dd>{e.vendorName}</dd></div>}
        {e.note && <div><dt>Qeyd</dt><dd>{e.note}</dd></div>}
        {e.voidReason && <div><dt>Ləğv səbəbi</dt><dd>{e.voidReason}</dd></div>}
        {inv?.aiResult && <div><dt>Mənbə</dt><dd>AI qəbzdən oxuyub, siz təsdiqləmisiniz</dd></div>}
      </dl>
      {e.items.length > 0 && <table className="fn-items"><thead><tr><th>Ad</th><th>Miqdar</th><th>Qiymət</th><th>Cəmi</th></tr></thead><tbody>{e.items.map((i, k) => <tr key={k}><td>{i.name}</td><td>{i.quantity ?? '—'} {i.unit}</td><td>{aznS(i.unitPrice)}</td><td>{aznS(i.lineTotal)}</td></tr>)}</tbody></table>}
      {e.mismatch.length > 0 && <p className="fn-mismatch"><AlertTriangle size={13} />{e.mismatch[0]}</p>}
      <h4 className="ex-hist-h"><History size={15} />Dəyişiklik tarixçəsi</h4>
      {hist == null ? <LoaderCircle className="spin" size={16} /> : <ol className="ex-hist" data-testid="ex-history">{hist.map((h, i) => <li key={i}><b>{ACTION[h.action] ?? h.action}</b><small>{new Date(h.at).toLocaleString('az-AZ', { dateStyle: 'short', timeStyle: 'short' })}{h.byMe ? ' · siz' : ''}</small>
        {h.changes && Object.entries(h.changes).filter(([k]) => k !== 'items').map(([k, v]) => <span key={k} className="ex-change">{FIELD[k] ?? k}: <s>{String(v.from ?? '—')}</s> → {String(v.to ?? '—')}</span>)}
        {h.action === 'expense.edited' && h.summary.includes('səbəb:') && <span className="ex-change">Səbəb: {h.summary.split('səbəb:')[1].trim()}</span>}
      </li>)}</ol>}
    </div>
  </Modal>;
}

function BudgetModal({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [v, setV] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await api(`/home-projects/${projectId}/budget`, 'POST', { total: v, note: '' }); await onSaved(); onClose(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} eyebrow="Büdcə" title="İlkin büdcə" footer={<button className="button button-primary" disabled={busy || !v} onClick={save} data-testid="ex-budget-save">Yadda saxla</button>}>
    <label className="fn-field"><span>Məbləğ, AZN</span><input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus data-testid="ex-budget" /></label>
    {err && <p className="form-error">{err}</p>}
  </Modal>;
}

