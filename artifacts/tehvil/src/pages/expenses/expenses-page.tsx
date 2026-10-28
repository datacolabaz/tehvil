import { useEffect, useRef, useState } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, Ban, Check, ChevronDown, CircleDollarSign, Download, FileText, Hammer, History, Info, LoaderCircle, PencilLine, Plus, ReceiptText, Settings2, Sparkles, Wallet,
} from 'lucide-react';
import { Empty, Modal, Pill, Skeleton } from '@/components/home/ui';
import {
  api, azDate, azn, aznS, booksKey, downloadExcel, errorText, EXP_STATUS, EXP_TONE, financeKey, LINE_CATEGORIES, PAY_LABEL, today, toCentsS, useBooks, useFinance,
  type AiInvoice, type Book, type Expense, type Finance, type HistoryRow, type Invoice,
} from '@/lib/finance/api';
import { DailyEntryModal, type DailyMode } from '../home/quick-work';
import { LinesEditor, lineCents, lineKind, lineProblem, newLine, qtyText, type DayLine } from '@/components/daily/lines-editor';
import '../home/finance.css';
import './expenses.css';

/*
 * "Evimin xərcləri" — the simple expense journal. One screen: three ways into the same "Gündəlik qeyd" form
 * (receipt photo / PDF, by hand, work done), total, this month, unpaid, budget and what is left, filters, records, Excel.
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
  const [pay, setPay] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [daily, setDaily] = useState<null | { mode: DailyMode; file?: File; invoice?: Invoice }>(() => (new URLSearchParams(window.location.search).get('add') === '1' ? { mode: 'manual' } : null));
  // "?add=1" (sidebar "Xərc əlavə et", landing) opens the form once; it is removed from the address so a refresh does not open it again.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.has('add')) { u.searchParams.delete('add'); window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`); }
  }, []);
  const [form, setForm] = useState<null | { existing: Expense }>(null);
  const [detail, setDetail] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [xlErr, setXlErr] = useState('');
  if (q.isLoading) return <Skeleton rows={4} />;
  if (q.isError) return <Empty icon={<Wallet size={28} />} title="Açılmadı" text={errorText(q.error)} />;
  const d = q.data!;
  const range = periodRange(period, from, to);
  const live = d.expenses.filter((e) => e.status !== 'void');
  const owed = (e: Expense) => (e.status === 'approved' && e.payState && (e.payState.status === 'unpaid' || e.payState.status === 'partial') ? toCentsS(e.total) - e.payState.paid : 0);
  const list = live.filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to) && (cat === 'all' || slices(e).some((x) => x.category === cat))
    && (pay === 'all' || (pay === 'unpaid' ? owed(e) > 0 : owed(e) === 0)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const approved = (rows: Expense[]) => rows.filter((e) => e.status === 'approved').reduce((s, e) => s + toCentsS(e.total), 0);
  const total = approved(live);
  const monthStart = `${today().slice(0, 8)}01`;
  const month = approved(live.filter((e) => e.date >= monthStart));
  const unpaid = live.reduce((s, e) => s + owed(e), 0);
  const budget = d.totals?.budgetCurrent ?? null;
  // With a category chosen, only that category's lines count (a receipt with cement and a fee shows the cement part).
  const shown = cat === 'all' ? approved(list) : list.filter((e) => e.status === 'approved').reduce((s, e) => s + slices(e).filter((x) => x.category === cat).reduce((a, x) => a + x.cents, 0), 0);
  const pendingReceipts = d.invoices.filter((i) => i.status === 'read' || i.status === 'reading' || i.status === 'failed' || i.status === 'uploaded');
  const usedCats = [...new Set(live.flatMap((e) => slices(e).map((x) => x.category)))];
  const catLabel = (k: string) => d.categories.find((x) => x.key === k)?.label ?? k;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: financeKey(projectId) }), qc.invalidateQueries({ queryKey: booksKey })]);
  // The file follows what the page shows: period, category and paid / unpaid.
  const exportX = async () => {
    setBusy(true); setXlErr('');
    try { await downloadExcel(projectId, book.homeName, { ...range, cat: cat === 'all' ? undefined : cat, pay: pay === 'all' ? undefined : pay }); }
    catch (e) { setXlErr(errorText(e, 'Excel faylı yüklənmədi. İnternet bağlantısını yoxlayıb yenidən cəhd edin.')); }
    finally { setBusy(false); }
  };
  return <div className="ex-page">
    <div className="ex-head">
      <button className="ex-home" onClick={() => setSwitchOpen(!switchOpen)} aria-expanded={switchOpen}><span className="eyebrow">Evimin xərcləri</span><b className="font-display">{book.homeName}</b>{others.length > 0 && <ChevronDown size={16} />}</button>
      <button className="button button-secondary" onClick={exportX} disabled={busy} data-testid="ex-export">{busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{period === 'all' && cat === 'all' && pay === 'all' ? 'Excel' : 'Seçiləni Excel-ə'}</button>
    </div>
    {xlErr && <p className="form-error" role="alert" data-testid="ex-export-error">{xlErr}</p>}
    {switchOpen && <div className="ex-switch">{others.map((b) => <Link key={b.homeId} href={`/xercler/${b.homeId}`} onClick={() => setSwitchOpen(false)}>{b.homeName}</Link>)}<Link href="/xercler">Bütün evlər</Link></div>}

    <div className="ex-actions">
      <label className="button button-primary ex-add" data-testid="ex-add-receipt"><input type="file" hidden accept="image/*,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) setDaily({ mode: 'receipt', file }); }} data-testid="ex-receipt-input" /><ReceiptText size={22} /><span>Qaimə çək və ya yüklə<small>Kamera, qalereya və ya PDF — AI oxuyur, siz yoxlayırsınız</small></span></label>
      <button className="button button-secondary ex-add2" onClick={() => setDaily({ mode: 'manual' })} data-testid="ex-add"><Plus size={20} /><span>Əl ilə xərc əlavə et<small>Material, usta haqqı, texnika</small></span></button>
      <button className="button button-secondary ex-add2" onClick={() => setDaily({ mode: 'work' })} data-testid="ex-add-work"><Hammer size={20} /><span>Görülən işi qeyd et<small>Foto, təsvir, dəyəri</small></span></button>
    </div>

    <div className="ex-figs" data-testid="ex-figs">
      <div className="ex-fig main"><small>İndiyə qədər ümumi xərc</small><b data-testid="ex-total">{azn(total)}</b></div>
      <div className="ex-fig"><small>Bu ay</small><b data-testid="ex-month">{azn(month)}</b></div>
      {budget == null ? <div className="ex-fig"><small>Büdcə</small><button className="text-link" onClick={() => setBudgetOpen(true)} data-testid="ex-set-budget">Büdcəni yaz</button></div>
        : <button className="ex-fig ex-fig-btn" onClick={() => setBudgetOpen(true)} data-testid="ex-edit-budget" aria-label="Büdcəni dəyiş"><small>Büdcə <PencilLine size={12} /></small><b data-testid="ex-budget-fig">{azn(budget)}</b></button>}
      <div className={`ex-fig ${budget != null && budget - total < 0 ? 'risk' : ''}`}><small>Büdcədən qalan</small><b data-testid="ex-left">{budget == null ? '—' : azn(budget - total)}</b>{budget == null && <small className="ex-muted">büdcə yazılmayıb</small>}</div>
      {unpaid > 0 && <button className="ex-fig warn" onClick={() => setPay('unpaid')} data-testid="ex-unpaid-fig"><small>Ödənilməyib</small><b data-testid="ex-unpaid">{azn(unpaid)}</b><small className="ex-muted">ümumi xərcə daxildir — göstər</small></button>}
    </div>

    {pendingReceipts.length > 0 && <div className="ex-pending">{pendingReceipts.map((i) => <button key={i.id} onClick={() => setDaily({ mode: 'receipt', invoice: i })} data-testid="ex-pending-receipt">
      {i.status === 'reading' ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
      <span>{i.status === 'reading' ? 'Qəbz oxunur…' : i.status === 'read' ? `Qəbzi təsdiqləyin${i.total ? ` · ${aznS(i.total)}` : ''}` : 'Qəbz oxunmadı — məbləği yazın'}</span><ArrowRight size={14} />
    </button>)}</div>}

    <div className="ex-filters">
      <div className="ex-chips" role="tablist" aria-label="Dövr">{PERIODS.map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)} data-testid={`ex-period-${k}`}>{l}</button>)}</div>
      {period === 'range' && <div className="ex-range"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlanğıc" data-testid="ex-from" /><span>—</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Son" data-testid="ex-to" /></div>}
      {usedCats.length > 1 && <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kateqoriya" data-testid="ex-cat-filter"><option value="all">Bütün kateqoriyalar</option>{usedCats.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>}
      <select value={pay} onChange={(e) => setPay(e.target.value as typeof pay)} aria-label="Ödəniş" data-testid="ex-pay-filter"><option value="all">Ödənilən və ödənilməyən</option><option value="paid">Yalnız ödənilib</option><option value="unpaid">Yalnız ödənilməyib</option></select>
    </div>
    <p className="ex-shown">{period === 'all' && cat === 'all' && pay === 'all' ? 'Bütün xərclər' : 'Seçilən'}: <b data-testid="ex-shown">{azn(shown)}</b> · {list.length} qeyd{cat !== 'all' ? ` · yalnız “${catLabel(cat)}” sətirləri` : ''}</p>

    {!list.length ? <Empty icon={<Wallet size={26} />} title={live.length ? 'Seçiminizə uyğun xərc yoxdur' : 'Hələ xərc yoxdur'} text="Qaimənin şəklini çəkin və ya alınan materialı, usta haqqını əl ilə yazın." />
      : <table className="ex-table" data-testid="ex-table"><thead><tr><th>Tarix</th><th>Xərc</th><th className="hide-s">Kateqoriya</th><th className="num">Məbləğ</th></tr></thead>
        <tbody>{list.map((e) => <tr key={e.id} onClick={() => setDetail(e)} tabIndex={0} onKeyDown={(k) => { if (k.key === 'Enter') setDetail(e); }} data-testid="ex-row">
          <td>{azDate(e.date)}</td>
          <td><b>{e.description}</b><small className="show-s">{catText(e, catLabel)}</small>{e.status !== 'approved' && <Pill small tone={EXP_TONE[e.status]}>{EXP_STATUS[e.status]}</Pill>}{owed(e) > 0 && <Pill small tone="warn">{PAY_LABEL[e.payState!.status]}</Pill>}{e.invoiceId && <FileText size={13} className="ex-has-receipt" aria-label="qəbz var" />}{e.items.length > 1 && <small className="ex-lines-n">{e.items.length} sətir</small>}</td>
          <td className="hide-s">{catText(e, catLabel)}</td>
          <td className="num">{aznS(e.total)}</td>
        </tr>)}</tbody></table>}

    <Link href={`/homes/${book.homeId}/maliyye/${projectId}`} className="ex-more"><Settings2 size={15} />Ətraflı: podratçı, usta, ödəniş, avans və borc hesabları</Link>

    {daily && <DailyEntryModal homeId={book.homeId} mode={daily.mode} heading={daily.mode === 'manual' ? 'Əl ilə xərc əlavə et' : daily.mode === 'work' ? 'Görülən işi qeyd et' : 'Qaimədən xərc əlavə et'} receiptFile={daily.file} invoice={daily.invoice} onClose={() => { setDaily(null); void refresh(); }} onSaved={() => { setDaily(null); void refresh(); }} />}
    {form && <SimpleExpenseForm d={d} projectId={projectId} invoice={null} existing={form.existing} onClose={() => setForm(null)} onSaved={refresh} />}
    {detail && <ExpenseDetail d={d} projectId={projectId} e={d.expenses.find((x) => x.id === detail.id) ?? detail} onClose={() => setDetail(null)} onEdit={(e) => { setDetail(null); setForm({ existing: e }); }} onChanged={refresh} />}
    {budgetOpen && <BudgetModal projectId={projectId} current={budget} onClose={() => setBudgetOpen(false)} onSaved={refresh} />}
  </div>;
}

/* ------------------------------------------------------------ categories */

/** How an expense splits across categories (lines in their own category, the rest in the expense's) — same rule as the server. */
function slices(e: Expense): { category: string; cents: number }[] {
  const total = toCentsS(e.total);
  if (!e.items.length) return [{ category: e.category, cents: total }];
  const by = new Map<string, number>(); let covered = 0;
  for (const i of e.items) { const c = i.category || e.category; const v = toCentsS(i.lineTotal); by.set(c, (by.get(c) ?? 0) + v); covered += v; }
  if (covered !== total) by.set(e.category, (by.get(e.category) ?? 0) + total - covered);
  return [...by.entries()].filter(([, v]) => v !== 0).map(([category, cents]) => ({ category, cents }));
}
const catText = (e: Expense, label: (k: string) => string) => { const c = [...new Set(slices(e).map((x) => x.category))]; return c.length > 2 ? `${label(c[0])} və ${c.length - 1} digər` : c.map(label).join(', '); };

/* ------------------------------------------------------------ simple form */

const c = (s: string) => { const v = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? Math.round(v * 100) : 0; };

/** Editing a saved expense: amount, name, category, date, note, lines. With lines, the total follows them (− discount + tax). */
function SimpleExpenseForm({ d, projectId, existing, onClose, onSaved }: { d: Finance; projectId: string; invoice: Invoice | null; existing: Expense; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const cats = d.categories.filter((x) => !x.legacy || x.key === existing.category);
  const [f, setF] = useState(() => ({
    total: existing.total, description: existing.description, category: existing.category, date: existing.date, note: existing.note, vendorName: existing.vendorName,
    paymentMethod: existing.paymentMethod, reason: '',
    lines: existing.items.map((i) => newLine({ name: i.name, quantity: i.quantity != null ? String(Number(i.quantity)) : '', unit: i.unit, unitPrice: i.unitPrice ?? '', lineTotal: i.quantity && i.unitPrice ? '' : i.lineTotal ?? '', category: i.category || existing.category, ...(i.kind ? { kind: i.kind } : {}), note: i.note ?? '' })) as DayLine[],
  }));
  const [more, setMore] = useState(existing.items.length > 0 || !!existing.vendorName);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const lines = f.lines.filter((l) => l.name.trim() || l.quantity || l.unitPrice || l.lineTotal);
  const linesSum = lines.reduce((s, l) => s + (lineCents(l) ?? 0), 0);
  const autoTotal = lines.length ? linesSum - c(existing.discount) + c(existing.tax) : null;
  const bad = lines.map(lineProblem).find(Boolean);
  const save = async () => {
    setBusy(true); setErr('');
    const items = lines.map((l) => ({ name: l.name.trim(), quantity: l.quantity || null, unit: l.unit, unitPrice: l.unitPrice || null, lineTotal: lineCents(l) != null ? (lineCents(l)! / 100).toFixed(2) : null, category: l.category, kind: lineKind(l), note: l.note }));
    const total = autoTotal != null ? (autoTotal / 100).toFixed(2) : f.total;
    const body = {
      date: f.date, category: f.category, description: f.description, vendorName: f.vendorName, note: f.note, total, paymentMethod: f.paymentMethod, items,
      subtotal: items.length ? (linesSum / 100).toFixed(2) : total, discount: items.length ? existing.discount : null, tax: items.length ? existing.tax : null, reason: f.reason,
    };
    try { await api(`/home-projects/${projectId}/expenses/${existing.id}`, 'PATCH', body); await onSaved(); onClose(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} wide={more} eyebrow="Xərci düzəlt" title={existing.description}
    footer={<button className="button button-primary ex-save" disabled={busy || !!bad || !(autoTotal != null || f.total) || !f.description.trim() || (existing.status === 'approved' && !f.reason.trim())} onClick={save} data-testid="ex-save">{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Yadda saxla</button>}>
    <div className="fn-form">
      <label className="fn-field ex-amount"><span>Məbləğ, AZN{autoTotal != null && <em> · sətirlərdən hesablanır</em>}</span>
        {autoTotal != null ? <output className="ex-auto" data-testid="ex-amount-auto">{azn(autoTotal)}</output> : <input inputMode="decimal" value={f.total} onChange={(e) => set({ total: e.target.value })} placeholder="0,00" data-testid="ex-amount" />}
      </label>
      <label className="fn-field"><span>Xərcin adı</span><input value={f.description} onChange={(e) => set({ description: e.target.value })} data-testid="ex-name" /></label>
      <label className="fn-field"><span>Əsas kateqoriya</span><select value={f.category} onChange={(e) => set({ category: e.target.value })} data-testid="ex-category">{cats.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
      <label className="fn-field"><span>Tarix</span><input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} data-testid="ex-date" /></label>
      <label className="fn-field"><span>Qeyd <em>· istəyə bağlı</em></span><input value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
      <button type="button" className="text-link ex-toggle" onClick={() => setMore(!more)} aria-expanded={more}>{more ? 'Az göstər' : `Ətraflı: satıcı, ödəniş üsulu${f.lines.length ? `, ${f.lines.length} sətir` : ', sətirlər'}`}<ChevronDown size={14} /></button>
      {more && <>
        <div className="fn-grid2">
          <label className="fn-field"><span>Satıcı</span><input value={f.vendorName} onChange={(e) => set({ vendorName: e.target.value })} /></label>
          <label className="fn-field"><span>Ödəniş üsulu</span><select value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}><option value="">—</option><option value="cash">Nağd</option><option value="card">Kart</option><option value="transfer">Köçürmə</option><option value="other">Digər</option></select></label>
        </div>
        <LinesEditor lines={f.lines} onChange={(l) => set({ lines: l })} showPaid={false} testid="ed" />
        {(c(existing.discount) > 0 || c(existing.tax) > 0) && lines.length > 0 && <p className="fn-note"><Info size={14} />Yekun = sətirlər {azn(linesSum)} − endirim {aznS(existing.discount)} + vergi {aznS(existing.tax)}</p>}
      </>}
      {existing.status === 'approved' && <label className="fn-field"><span>Düzəlişin səbəbi</span><input value={f.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Məs. qəbzlə yoxladım" data-testid="ex-reason" /><small>Əvvəlki və yeni dəyər tarixçədə saxlanılır.</small></label>}
      {err && <p className="form-error">{err}</p>}
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
  const sameEntry = e.entryId ? d.expenses.filter((x) => x.entryId === e.entryId && x.id !== e.id && x.status !== 'void') : [];
  const voidIt = async () => {
    const reason = window.prompt('Niyə ləğv edirsiniz? (qeyd silinmir, ləğv edilmiş kimi qalır)');
    if (!reason) return;
    try { await api(`/home-projects/${projectId}/expenses/${e.id}/status`, 'POST', { action: 'void', reason }); await onChanged(); onClose(); } catch (x) { window.alert(errorText(x)); }
  };
  const cat = d.categories.find((x) => x.key === e.category)?.label ?? e.category;
  const label = (k: string | null | undefined) => d.categories.find((x) => x.key === k)?.label ?? LINE_CATEGORIES.find((x) => x[0] === k)?.[1] ?? k ?? cat;
  const left = e.payState && (e.payState.status === 'unpaid' || e.payState.status === 'partial') ? toCentsS(e.total) - e.payState.paid : 0;
  const [paying, setPaying] = useState(false);
  const [xl, setXl] = useState<'' | 'busy' | string>('');
  const exportOne = async () => {
    setXl('busy');
    try { await downloadExcel(projectId, `${d.project.homeName}-${e.date}-${e.description.slice(0, 30)}`, { entry: e.entryId ?? e.id }); setXl(''); }
    catch (x) { setXl(errorText(x, 'Excel faylı yüklənmədi. Yenidən cəhd edin.')); }
  };
  const markPaid = async () => {
    setPaying(true);
    try { await api(`/home-projects/${projectId}/expenses/${e.id}/mark-paid`, 'POST', { date: today() }); await onChanged(); } catch (x) { window.alert(errorText(x)); } finally { setPaying(false); }
  };
  return <Modal open onClose={onClose} eyebrow={azDate(e.date)} title={e.description} footer={<><button className="button button-secondary" onClick={exportOne} disabled={xl === 'busy'} data-testid="ex-detail-excel">{xl === 'busy' ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}Excel şəklində endir</button>{d.permissions.manage && e.status !== 'void' && <button className="button button-secondary" onClick={voidIt}><Ban size={15} />Ləğv et</button>}{(d.permissions.manage || (e.mine && e.status === 'pending')) && e.status !== 'void' && <button className="button button-primary" onClick={() => onEdit(e)} data-testid="ex-edit"><PencilLine size={15} />Düzəlt</button>}</>}>
    <div className="ex-detail" data-testid="ex-detail">
      <div className="ex-detail-amt"><b>{aznS(e.total)}</b><span>{catText(e, (k) => label(k) ?? k)}</span>{e.status !== 'approved' && <Pill small tone={EXP_TONE[e.status]}>{EXP_STATUS[e.status]}</Pill>}{e.payState && e.status === 'approved' && <Pill small tone={left > 0 ? 'warn' : 'ok'}>{PAY_LABEL[e.payState.status] ?? e.payState.status}</Pill>}</div>
      {left > 0 && d.permissions.manage && <div className="ex-owed" data-testid="ex-owed"><CircleDollarSign size={16} /><span>Ödənilməyib: <b>{azn(left)}</b></span><button className="button button-secondary" onClick={markPaid} disabled={paying} data-testid="ex-mark-paid">{paying ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Ödənildi kimi qeyd et</button></div>}
      {media && (media.contentType === 'application/pdf' ? <a className="fn-pdf" href={media.url} target="_blank" rel="noreferrer"><FileText size={20} />Qəbzi aç (PDF)</a> : <a href={media.url} target="_blank" rel="noreferrer" className="ex-receipt"><img src={media.url} alt="Orijinal qəbz" /></a>)}
      <dl className="fn-dl">
        {e.vendorName && <div><dt>Satıcı</dt><dd>{e.vendorName}</dd></div>}
        {e.note && <div><dt>Qeyd</dt><dd>{e.note}</dd></div>}
        {e.voidReason && <div><dt>Ləğv səbəbi</dt><dd>{e.voidReason}</dd></div>}
        {inv?.aiResult && <div><dt>Mənbə</dt><dd>AI qəbzdən oxuyub, siz təsdiqləmisiniz</dd></div>}
        {e.workId && <div><dt>Görülən iş</dt><dd><Link href={`/works/${e.workId}`} className="text-link">İşə bax</Link></dd></div>}
        {sameEntry.length > 0 && <div><dt>Eyni gündəlik qeyddən</dt><dd>{sameEntry.map((x) => `${x.description} · ${aznS(x.total)}${x.payState ? ` (${PAY_LABEL[x.payState.status] ?? x.payState.status})` : ''}`).join('; ')}</dd></div>}
      </dl>
      {e.items.length > 0 && <table className="fn-items" data-testid="ex-detail-items"><thead><tr><th>Ad</th><th>Kateqoriya</th><th>Miqdar</th><th>Qiymət</th><th>Cəmi</th></tr></thead><tbody>{e.items.map((i, k) => <tr key={k}><td>{i.name}{i.note ? <small className="ex-muted"> · {i.note}</small> : null}</td><td>{label(i.category || e.category)}</td><td>{qtyText(i.quantity)} {i.unit}</td><td>{aznS(i.unitPrice)}</td><td>{aznS(i.lineTotal)}</td></tr>)}</tbody></table>}
      {e.mismatch.length > 0 && <p className="fn-mismatch"><AlertTriangle size={13} />{e.mismatch[0]}</p>}
      {xl && xl !== 'busy' && <p className="form-error" role="alert" data-testid="ex-detail-excel-error">{xl}</p>}
      <h4 className="ex-hist-h"><History size={15} />Dəyişiklik tarixçəsi</h4>
      {hist == null ? <LoaderCircle className="spin" size={16} /> : <ol className="ex-hist" data-testid="ex-history">{hist.map((h, i) => <li key={i}><b>{ACTION[h.action] ?? h.action}</b><small>{new Date(h.at).toLocaleString('az-AZ', { dateStyle: 'short', timeStyle: 'short' })}{h.byMe ? ' · siz' : ''}</small>
        {h.changes && Object.entries(h.changes).filter(([k]) => k !== 'items').map(([k, v]) => <span key={k} className="ex-change">{FIELD[k] ?? k}: <s>{String(v.from ?? '—')}</s> → {String(v.to ?? '—')}</span>)}
        {h.action === 'expense.edited' && h.summary.includes('səbəb:') && <span className="ex-change">Səbəb: {h.summary.split('səbəb:')[1].trim()}</span>}
      </li>)}</ol>}
    </div>
  </Modal>;
}

function BudgetModal({ projectId, current, onClose, onSaved }: { projectId: string; current: number | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [v, setV] = useState(current != null ? (current / 100).toFixed(2) : ''); const [note, setNote] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const send = async (body: unknown) => { setBusy(true); setErr(''); try { await api(`/home-projects/${projectId}/budget`, 'POST', body); await onSaved(); onClose(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  const editing = current != null;
  return <Modal open onClose={onClose} eyebrow="Büdcə" title={editing ? 'Büdcəni dəyiş' : 'İlkin büdcə'}
    footer={<>{editing && <button className="button button-secondary" disabled={busy || !note.trim()} onClick={() => send({ remove: true, note })} data-testid="ex-budget-remove"><Ban size={15} />Büdcəni götür</button>}
      <button className="button button-primary" disabled={busy || !v || (editing && !note.trim())} onClick={() => send({ total: v, note })} data-testid="ex-budget-save">Yadda saxla</button></>}>
    <label className="fn-field"><span>Məbləğ, AZN</span><input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus data-testid="ex-budget" /></label>
    {editing && <label className="fn-field"><span>Səbəb</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Məs. səhvən yazılmışdı" data-testid="ex-budget-note" /><small>Köhnə büdcə tarixçədə qalır. “Büdcəni götür” seçsəniz, büdcə göstərilməyəcək və qalıq hesablanmayacaq.</small></label>}
    {err && <p className="form-error">{err}</p>}
  </Modal>;
}
