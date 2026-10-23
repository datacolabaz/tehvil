import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, BadgeCheck, Ban, Camera, Check, CircleHelp, Download, FilePlus2, FileText, HandCoins, ImagePlus, Info, LoaderCircle, MessageCircleQuestion,
  Plus, ReceiptText, RotateCcw, Scale, Send, Sparkles, Trash2, UserPlus, Users, Wallet, X,
} from 'lucide-react';
import { PageHeading } from '@/components/kit';
import { CopyButton, Empty, Modal, Pill, Skeleton } from '@/components/home/ui';
import {
  api, azDate, azn, aznS, CO_STATUS, CO_TONE, downloadExcel, errorText, EXP_PAY, EXP_STATUS, EXP_TONE, METHOD, newKey, PARTY_STATUS, PARTY_TONE, PAY_KIND, PAY_STATUS, PAY_TONE,
  projectsKey, putFile, ROLE, shrinkImage, today, toCentsS, useFinance, useProjects, useRefresh,
  type AiInvoice, type ChangeOrder, type Expense, type Finance, type Invoice, type Party, type Payment,
} from '@/lib/finance/api';
import './finance.css';

/* =================================================================== list */

export function HomeFinancePage({ homeId }: { homeId: string }) {
  const q = useProjects(homeId);
  const [, go] = useLocation();
  const [creating, setCreating] = useState(false);
  if (q.isLoading) return <Skeleton rows={3} />;
  if (q.isError) return <Empty icon={<Wallet size={28} />} title="Maliyyə açılmadı" text={errorText(q.error)} />;
  const d = q.data!;
  return <div className="fn-page">
    <PageHeading eyebrow="Maliyyə" title="Xərclər, ödənişlər və büdcə" description="Hər tikinti və ya təmir layihəsi üçün ayrıca: büdcə, faktiki xərclər, ödənişlər, avans və borclar ayrı-ayrı hesablanır."
      action={d.canManage ? <button className="button button-primary" onClick={() => setCreating(true)} data-testid="fn-new-project"><Plus size={16} />Layihə</button> : undefined} />
    {!d.projects.length
      ? <Empty icon={<Wallet size={28} />} title="Hələ layihə yoxdur" text={d.canManage ? 'Tikinti və ya təmir layihəsini yaradın: büdcəni yazın, qaimə şəkillərini çəkin, ödənişləri qeyd edin.' : 'Ev sahibi sizi hələ heç bir layihəyə əlavə etməyib.'}
          action={d.canManage ? <button className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} />Layihə yarat</button> : undefined} />
      : <div className="fn-projects">{d.projects.map((p) => <Link key={p.id} href={`/homes/${homeId}/maliyye/${p.id}`} className="fn-project" data-testid="fn-project-card">
        <Wallet size={20} /><span><b>{p.name}</b><small>{p.kind === 'construction' ? 'Tikinti' : p.kind === 'renovation' ? 'Təmir' : 'Digər'}{p.startDate ? ` · ${azDate(p.startDate)}` : ''}{p.status === 'closed' ? ' · bağlanıb' : ''}</small></span><ArrowRight size={16} />
      </Link>)}</div>}
    {!d.aiConfigured && <p className="fn-note"><Info size={14} />AI ilə qaimə oxuma hələ qoşulmayıb. Xərcləri əl ilə daxil etmək tam işləyir.</p>}
    <NewProject open={creating} onClose={() => setCreating(false)} homeId={homeId} onDone={(id) => go(`/homes/${homeId}/maliyye/${id}`)} />
  </div>;
}

function NewProject({ open, onClose, homeId, onDone }: { open: boolean; onClose: () => void; homeId: string; onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', kind: 'construction', startDate: today(), budget: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api<{ id: string }>(`/homes/${homeId}/projects`, 'POST', { ...f, budget: f.budget || null });
      await qc.invalidateQueries({ queryKey: projectsKey(homeId) }); onClose(); onDone(r.id);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} eyebrow="Yeni layihə" title="Tikinti və ya təmir layihəsi"
    footer={<><button className="button button-secondary" onClick={onClose}>Ləğv et</button><button className="button button-primary" disabled={busy || !f.name.trim()} onClick={save} data-testid="fn-project-save">{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Yarat</button></>}>
    <div className="fn-form">
      <Fld label="Ad"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Məs. Evin tikintisi 2026" data-testid="fn-project-name" /></Fld>
      <Fld label="Növ"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="construction">Tikinti</option><option value="renovation">Təmir</option><option value="other">Digər</option></select></Fld>
      <Fld label="Başlama tarixi"><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Fld>
      <Fld label="İlkin büdcə (AZN)" hint="Razılaşdırılmış məbləğ. Sonra yalnız təsdiqlənmiş əlavə işlər və ya səbəbli düzəliş ilə dəyişir."><input inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} placeholder="50000" data-testid="fn-project-budget" /></Fld>
      {err && <p className="form-error">{err}</p>}
    </div>
  </Modal>;
}

/* ================================================================ project */

const TABS = [
  { key: 'panel', label: 'Panel', icon: Scale },
  { key: 'expenses', label: 'Xərclər', icon: ReceiptText },
  { key: 'parties', label: 'Hesablaşmalar', icon: Users },
  { key: 'payments', label: 'Ödənişlər', icon: HandCoins },
  { key: 'changes', label: 'Əlavə işlər', icon: FilePlus2 },
  { key: 'invoices', label: 'Qaimələr', icon: FileText },
  { key: 'ask', label: 'Sual ver', icon: MessageCircleQuestion },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function ProjectFinancePage({ homeId, projectId }: { homeId: string; projectId: string }) {
  const q = useFinance(projectId);
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('tab') as Tab) || 'panel');
  const [modal, setModal] = useState<null | 'expense' | 'payment' | 'change' | 'party' | 'budget'>(null);
  const [review, setReview] = useState<Invoice | 'manual' | null>(null);
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <Skeleton rows={4} />;
  if (q.isError) return <Empty icon={<Wallet size={28} />} title="Layihə açılmadı" text={errorText(q.error)} action={<Link className="button button-secondary" href={`/homes/${homeId}/maliyye`}>Layihələr</Link>} />;
  const d = q.data!;
  const tabs = TABS.filter((t) => (t.key !== 'ask' || d.permissions.ask) && (t.key !== 'invoices' || d.permissions.addInvoice) && (t.key !== 'panel' || d.level !== 'party'));
  const current = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;
  const exportX = async () => { setBusy(true); try { await downloadExcel(projectId, d.project.name); } catch (e) { alertErr(e); } finally { setBusy(false); } };
  return <div className="fn-page">
    <PageHeading eyebrow={d.level === 'manage' ? 'Maliyyə' : d.level === 'contractor' ? 'Maliyyə · podratçı' : 'Mənim hesabım'} title={d.project.name}
      description={d.level === 'party' ? 'Bu layihədə sizə aid ödənişlər, xərclər və qalıq. Rəqəmlər ev sahibinin gördüyü ilə eynidir.' : 'Büdcə, faktiki xərc, ödəniş, borc və avans ayrı-ayrı hesablanır.'}
      action={d.permissions.export ? <button className="button button-secondary" onClick={exportX} disabled={busy} data-testid="fn-export">{busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}Excel yüklə</button> : undefined} />
    <QuickActions d={d} projectId={projectId} onExpense={() => { setReview('manual'); }} onPayment={() => setModal('payment')} onChange={() => setModal('change')} onInvoice={(inv) => { setTab('invoices'); setReview(inv); }} />
    <nav className="fn-tabs" aria-label="Bölmələr">{tabs.map(({ key, label, icon: Icon }) => <button key={key} className={current === key ? 'on' : ''} onClick={() => setTab(key)} data-testid={`fn-tab-${key}`}><Icon size={15} />{label}</button>)}</nav>
    {current === 'panel' && <PanelTab d={d} onBudget={() => setModal('budget')} goTab={setTab} />}
    {current === 'expenses' && <ExpensesTab d={d} projectId={projectId} />}
    {current === 'parties' && <PartiesTab d={d} projectId={projectId} onAdd={() => setModal('party')} />}
    {current === 'payments' && <PaymentsTab d={d} projectId={projectId} />}
    {current === 'changes' && <ChangesTab d={d} projectId={projectId} />}
    {current === 'invoices' && <InvoicesTab d={d} projectId={projectId} onReview={setReview} />}
    {current === 'ask' && <AskTab d={d} projectId={projectId} goTab={setTab} />}
    {review && <ExpenseForm d={d} projectId={projectId} invoice={review === 'manual' ? null : review} onClose={() => setReview(null)} />}
    {modal === 'payment' && <PaymentForm d={d} projectId={projectId} onClose={() => setModal(null)} />}
    {modal === 'change' && <ChangeForm d={d} projectId={projectId} onClose={() => setModal(null)} />}
    {modal === 'party' && <PartyForm projectId={projectId} onClose={() => setModal(null)} />}
    {modal === 'budget' && <BudgetForm d={d} projectId={projectId} onClose={() => setModal(null)} />}
  </div>;
}

function alertErr(e: unknown) { window.alert(errorText(e)); }

/** The four things done most often, big enough for a thumb. */
function QuickActions({ d, projectId, onExpense, onPayment, onChange, onInvoice }: { d: Finance; projectId: string; onExpense: () => void; onPayment: () => void; onChange: () => void; onInvoice: (i: Invoice) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const refresh = useRefresh(projectId);
  const [state, setState] = useState<{ busy: boolean; msg: string; err: boolean }>({ busy: false, msg: '', err: false });
  const upload = async (list: FileList | null) => {
    const original = list?.[0];
    if (!original) return;
    if (camera.current) camera.current.value = ''; if (gallery.current) gallery.current.value = '';
    setState({ busy: true, msg: 'Qaimə yüklənir…', err: false });
    try {
      const file = await shrinkImage(original);
      const f = await putFile(file);
      const r = await api<{ id: string; status: string; duplicates: { reason: string }[] }>(`/home-projects/${projectId}/invoices`, 'POST', { file: f });
      setState({ busy: false, msg: r.status === 'reading' ? 'Yükləndi. AI qaiməni oxuyur — bir neçə saniyə.' : 'Yükləndi. Məlumatları əl ilə daxil edin.', err: false });
      if (r.duplicates.length) setState({ busy: false, msg: `Diqqət: ${r.duplicates[0].reason}. Yenə də yoxlaya bilərsiniz.`, err: true });
      const fresh = await refresh().then(() => api<Finance>(`/home-projects/${projectId}/finance`));
      const inv = fresh.invoices.find((i) => i.id === r.id);
      if (inv) onInvoice(inv);
    } catch (e) { setState({ busy: false, msg: errorText(e, 'Qaimə yüklənmədi. Yenidən cəhd edin.'), err: true }); }
  };
  return <div className="fn-quick">
    {d.permissions.addInvoice && <>
      <button className="fn-q primary" onClick={() => camera.current?.click()} disabled={state.busy} data-testid="fn-invoice-camera">{state.busy ? <LoaderCircle className="spin" size={20} /> : <Camera size={20} />}<span>Qaimə çək</span></button>
      <button className="fn-q" onClick={() => gallery.current?.click()} disabled={state.busy}><ImagePlus size={20} /><span>Qaimə yüklə</span></button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void upload(e.target.files)} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => void upload(e.target.files)} data-testid="fn-invoice-file" />
    </>}
    {d.permissions.addExpense && <button className="fn-q" onClick={onExpense} data-testid="fn-add-expense"><ReceiptText size={20} /><span>Xərc daxil et</span></button>}
    {d.permissions.addPayment && <button className="fn-q" onClick={onPayment} data-testid="fn-add-payment"><HandCoins size={20} /><span>Ödəniş</span></button>}
    {d.permissions.proposeChange && <button className="fn-q" onClick={onChange} data-testid="fn-add-change"><FilePlus2 size={20} /><span>Əlavə iş</span></button>}
    {state.msg && <p className={`fn-q-msg ${state.err ? 'err' : ''}`} role="status">{state.msg}</p>}
  </div>;
}

/* ------------------------------------------------------------------ panel */

function Figure({ label, value, formula, tone, testid }: { label: string; value: ReactNode; formula?: string; tone?: 'warn' | 'ok' | 'risk' | 'main'; testid?: string }) {
  const [open, setOpen] = useState(false);
  return <div className={`fn-fig ${tone ?? ''}`} data-testid={testid}>
    <span className="fn-fig-label">{label}{formula && <button className="fn-why" aria-label={`${label}: necə hesablanır`} onClick={() => setOpen(!open)}><CircleHelp size={14} /></button>}</span>
    <b>{value}</b>
    {open && formula && <small className="fn-formula">{formula}</small>}
  </div>;
}

function PanelTab({ d, onBudget, goTab }: { d: Finance; onBudget: () => void; goTab: (t: Tab) => void }) {
  const t = d.totals!;
  const f = d.formulas;
  const pct = t.budgetUsedPct;
  return <div className="fn-panel">
    {!!d.warnings.length && <section className="fn-warnings" aria-label="Yoxlama tələb edən hallar">
      <h3><AlertTriangle size={16} />Yoxlayın ({d.warnings.length})</h3>
      <ul>{d.warnings.slice(0, 8).map((w, i) => <li key={i}>{w.text}{w.refType && <button className="text-link" onClick={() => goTab(w.refType === 'payment' ? 'payments' : w.refType === 'change_order' ? 'changes' : w.refType === 'party' ? 'parties' : 'expenses')}>Bax</button>}</li>)}</ul>
      <small>Bunlar avtomatik nəticə deyil — sadəcə yoxlanmalı hallardır.</small>
    </section>}
    <section className="fn-budget">
      <div className="fn-budget-head"><h3>Büdcə</h3>{d.permissions.manage && <button className="button button-secondary sm-btn-sm" onClick={onBudget} data-testid="fn-budget-edit">{t.budgetInitial == null ? 'Büdcəni yaz' : 'Düzəliş'}</button>}</div>
      {t.budgetCurrent != null && <div className="fn-bar" role="img" aria-label={`Büdcənin ${pct ?? 0}% istifadə olunub`}><span style={{ width: `${Math.min(100, pct ?? 0)}%` }} className={(pct ?? 0) > 100 ? 'over' : ''} /></div>}
      <div className="fn-figs">
        <Figure label="İlkin büdcə" value={azn(t.budgetInitial)} formula={f.budgetInitial} />
        <Figure label="Son büdcə" value={azn(t.budgetCurrent)} formula={f.budgetCurrent} testid="fn-budget-current" />
        <Figure label="Faktiki xərc" value={azn(t.actual)} formula={f.actual} tone="main" testid="fn-actual" />
        <Figure label="Fərq" value={azn(t.budgetDiff)} formula={f.budgetDiff} tone={t.budgetDiff != null && t.budgetDiff < 0 ? 'risk' : undefined} />
      </div>
    </section>
    <section><h3>Faktiki xərclər</h3><div className="fn-figs">
      <Figure label="Material" value={azn(t.material)} formula={f.material} />
      <Figure label="İşçilik" value={azn(t.labor)} formula={f.labor} />
      <Figure label="Digər" value={azn(t.other)} formula={f.other} />
      <Figure label="Təsdiq gözləyir" value={`${azn(t.pending)}${t.pendingCount ? ` · ${t.pendingCount}` : ''}`} formula={f.pending} tone={t.pendingCount ? 'warn' : undefined} testid="fn-pending" />
    </div></section>
    <section><h3>Ödənişlər və borclar</h3><div className="fn-figs">
      <Figure label="Podratçıya ödənilib" value={azn(t.paidToContractors)} formula={f.paidToContractors} />
      <Figure label="Podratçıya qalıb" value={azn(t.remainingToContractors)} formula={f.remainingToContractors} testid="fn-contractor-left" />
      <Figure label="Ustalara qalıb" value={azn(t.remainingToWorkers)} />
      <Figure label="Təchizatçılara ödənilib" value={azn(t.paidToSuppliers)} formula={f.paidToSuppliers} />
      <Figure label="Təchizatçılara borc" value={azn(t.supplierDebt)} formula={f.supplierDebt} tone={t.supplierDebt ? 'warn' : undefined} />
      <Figure label="Avans qalığı" value={azn(t.advanceBalance)} formula={f.advanceBalance} testid="fn-advance" />
      <Figure label="Mübahisəli" value={`${azn(t.disputed)}${t.disputedCount ? ` · ${t.disputedCount}` : ''}`} formula={f.disputed} tone={t.disputedCount ? 'risk' : undefined} />
      <Figure label="Əlavə işlər (təsdiqlənmiş)" value={azn(t.approvedChangeOrders)} />
    </div>
    <p className="fn-note"><Info size={14} />Ödənişlər istifadəçilər tərəfindən qeyd olunur; bank tərəfindən təsdiqlənmir. Avans xərc deyil — avansdan alınan material xərc kimi bir dəfə sayılır.</p></section>
    {!!d.byCategory.length && <section><h3>Kateqoriyalar üzrə</h3><ul className="fn-cats">{d.byCategory.map((c) => <li key={c.category}><span>{c.label}</span><small>{c.count}</small><b>{azn(c.total)}</b><i style={{ width: `${t.actual ? Math.round((c.total / (t.actual as number)) * 100) : 0}%` }} /></li>)}</ul></section>}
    {d.smeta && <section className="fn-smeta"><h3>Smeta ilə müqayisə · {d.smeta.name}</h3><div className="fn-figs">
      <Figure label="Smetada" value={azn(d.smeta.planned)} /><Figure label="Faktiki" value={azn(d.smeta.actual)} tone="main" />
      <Figure label="Fərq" value={azn(d.smeta.diff)} tone={d.smeta.diff < 0 ? 'risk' : undefined} /><Figure label="İstifadə" value={d.smeta.usedPct == null ? '—' : `${d.smeta.usedPct}%`} />
      <Figure label="Material: smeta / faktiki" value={`${azn(d.smeta.plannedMaterial)} / ${azn(d.smeta.actualMaterial)}`} /><Figure label="İşçilik: smeta / faktiki" value={`${azn(d.smeta.plannedLabor)} / ${azn(d.smeta.actualLabor)}`} />
    </div><small className="fn-note">Smeta planlaşdırılan xərcdir; faktiki rəqəmlər yalnız təsdiqlənmiş xərc qeydlərindəndir. Təsdiqlənməmiş: {azn(d.smeta.pending)}.</small></section>}
    {d.budget.length > 0 && <section><h3>Büdcə versiyaları</h3><ol className="fn-versions">{d.budget.map((v) => <li key={v.id}><b>v{v.version}</b><span>{v.reason === 'initial' ? 'İlkin' : v.reason === 'change_order' ? 'Əlavə iş' : 'Düzəliş'}{v.note ? ` · ${v.note}` : ''}</span><small>{azDate(v.createdAt)}</small><b>{aznS(v.total)}</b></li>)}</ol></section>}
  </div>;
}

function BudgetForm({ d, projectId, onClose }: { d: Finance; projectId: string; onClose: () => void }) {
  const refresh = useRefresh(projectId);
  const first = d.totals?.budgetInitial == null;
  const [total, setTotal] = useState(''); const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setErr(''); try { await api(`/home-projects/${projectId}/budget`, 'POST', { total, note }); await refresh(); onClose(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} eyebrow="Büdcə" title={first ? 'İlkin büdcə' : 'Büdcəyə düzəliş'} footer={<><button className="button button-secondary" onClick={onClose}>Ləğv et</button><button className="button button-primary" disabled={busy || !total} onClick={save}>Saxla</button></>}>
    <div className="fn-form">
      <Fld label="Məbləğ (AZN)"><input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></Fld>
      {!first && <Fld label="Səbəb" hint="Düzəliş yeni versiya kimi saxlanılır; əvvəlki versiyalar silinmir. Əlavə işlər üçün “Əlavə iş” bölməsindən istifadə edin."><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Fld>}
      {err && <p className="form-error">{err}</p>}
    </div>
  </Modal>;
}

/* --------------------------------------------------------------- expenses */

function partyName(d: Finance, id: string | null) { return id ? d.parties.find((p) => p.id === id)?.name ?? '' : ''; }
const catLabel = (d: Finance, c: string) => d.categories.find((x) => x.key === c)?.label ?? c;

function ExpensesTab({ d, projectId }: { d: Finance; projectId: string }) {
  const [status, setStatus] = useState('all'); const [cat, setCat] = useState('all'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [edit, setEdit] = useState<Expense | null>(null);
  const list = d.expenses.filter((e) => (status === 'all' ? e.status !== 'void' : e.status === status) && (cat === 'all' || e.category === cat) && (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const sum = list.filter((e) => e.status === 'approved').reduce((s, e) => s + toCentsS(e.total), 0);
  return <div>
    <div className="fn-filters">
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="all">Hamısı</option><option value="pending">Təsdiq gözləyir</option><option value="approved">Təsdiqlənib</option><option value="disputed">Mübahisəli</option><option value="void">Ləğv edilib</option></select>
      <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kateqoriya"><option value="all">Bütün kateqoriyalar</option>{d.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlanğıc tarix" /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Son tarix" />
    </div>
    <p className="fn-sum">Seçilənlərdə təsdiqlənmiş: <b>{azn(sum)}</b></p>
    {!list.length ? <Empty icon={<ReceiptText size={26} />} title="Xərc yoxdur" text="Qaimənin şəklini çəkin və ya xərci əl ilə daxil edin." />
      : <ul className="fn-list">{list.map((e) => <ExpenseRow key={e.id} e={e} d={d} projectId={projectId} onEdit={() => setEdit(e)} />)}</ul>}
    {edit && <ExpenseForm d={d} projectId={projectId} invoice={null} existing={edit} onClose={() => setEdit(null)} />}
  </div>;
}

function ExpenseRow({ e, d, projectId, onEdit }: { e: Expense; d: Finance; projectId: string; onEdit: () => void }) {
  const refresh = useRefresh(projectId);
  const [open, setOpen] = useState(false);
  const act = async (action: string) => {
    const reason = action === 'void' || action === 'dispute' ? window.prompt(action === 'void' ? 'Ləğv etmə səbəbi' : 'Mübahisənin səbəbi') : '';
    if (reason === null) return;
    try { await api(`/home-projects/${projectId}/expenses/${e.id}/status`, 'POST', { action, reason }); await refresh(); } catch (x) { alertErr(x); }
  };
  const inv = e.invoiceId ? d.invoices.find((i) => i.id === e.invoiceId) : null;
  const media = inv ? d.media.find((m) => m.id === inv.mediaId) : null;
  return <li className={`fn-row st-${e.status}`} data-testid="fn-expense">
    <button className="fn-row-main" onClick={() => setOpen(!open)}>
      <span className="fn-date">{azDate(e.date)}</span>
      <span className="fn-row-text"><b>{e.description}</b><small>{catLabel(d, e.category)}{(e.vendorName || e.partyId) ? ` · ${e.vendorName || partyName(d, e.partyId)}` : ''}{e.fundedByPartyId ? ` · avansdan (${partyName(d, e.fundedByPartyId)})` : ''}</small></span>
      <span className="fn-row-amt"><b>{aznS(e.total)}</b><Pill small tone={EXP_TONE[e.status]}>{EXP_STATUS[e.status]}</Pill></span>
    </button>
    {e.mismatch.length > 0 && <p className="fn-mismatch"><AlertTriangle size={13} />{e.mismatch[0]}</p>}
    {open && <div className="fn-row-more">
      {e.items.length > 0 && <table className="fn-items"><thead><tr><th>Ad</th><th>Miqdar</th><th>Qiymət</th><th>Cəmi</th></tr></thead><tbody>{e.items.map((i, k) => <tr key={k}><td>{i.name}</td><td>{i.quantity ?? '—'} {i.unit}</td><td>{aznS(i.unitPrice)}</td><td>{aznS(i.lineTotal)}</td></tr>)}</tbody></table>}
      <dl className="fn-dl">
        <div><dt>Ara cəm</dt><dd>{aznS(e.subtotal)}</dd></div><div><dt>Endirim</dt><dd>{aznS(e.discount)}</dd></div><div><dt>Vergi</dt><dd>{aznS(e.tax)}</dd></div>
        <div><dt>Ödəniş</dt><dd>{e.payState ? EXP_PAY[e.payState.status] ?? '—' : '—'} · {METHOD[e.paymentMethod]}</dd></div>
        {e.roomId && <div><dt>Otaq</dt><dd>{d.rooms.find((r) => r.id === e.roomId)?.name}</dd></div>}
        {e.note && <div><dt>Qeyd</dt><dd>{e.note}</dd></div>}
        {e.voidReason && <div><dt>Ləğv səbəbi</dt><dd>{e.voidReason}</dd></div>}
        {media && <div><dt>Qaimə</dt><dd><a href={media.url} target="_blank" rel="noreferrer">İlkin sənədi aç</a></dd></div>}
      </dl>
      <div className="fn-actions">
        {d.permissions.manage && e.status !== 'approved' && e.status !== 'void' && <button className="button button-primary sm-btn-sm" onClick={() => act('approve')} data-testid="fn-approve"><Check size={14} />Təsdiqlə</button>}
        {d.permissions.manage && e.status !== 'disputed' && e.status !== 'void' && <button className="button button-secondary sm-btn-sm" onClick={() => act('dispute')}>Mübahisəli</button>}
        {(d.permissions.manage || (e.mine && e.status === 'pending')) && e.status !== 'void' && <button className="button button-secondary sm-btn-sm" onClick={onEdit}>Düzəlt</button>}
        {(d.permissions.manage || (e.mine && e.status === 'pending')) && e.status !== 'void' && <button className="button button-secondary sm-btn-sm" onClick={() => act('void')}><Ban size={14} />Ləğv et</button>}
      </div>
    </div>}
  </li>;
}

/* ------------------------------------------------------- expense / invoice form */

type Item = { name: string; quantity: string; unit: string; unitPrice: string; lineTotal: string; low?: boolean };
const blankItem = (): Item => ({ name: '', quantity: '', unit: '', unitPrice: '', lineTotal: '' });
const num = (s: string) => { const v = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const cents = (s: string) => { const v = num(s); return Number.isNaN(v) ? 0 : Math.round(v * 100); };

function ExpenseForm({ d, projectId, invoice, existing, onClose }: { d: Finance; projectId: string; invoice: Invoice | null; existing?: Expense; onClose: () => void }) {
  const refresh = useRefresh(projectId);
  const live = useFinance(projectId, !!invoice && invoice.status === 'reading').data;
  const inv = invoice ? live?.invoices.find((i) => i.id === invoice.id) ?? invoice : null;
  const ai: AiInvoice | null = inv?.aiResult ?? null;
  const media = inv ? (live ?? d).media.find((m) => m.id === inv.mediaId) : null;
  const myParty = d.level !== 'manage' ? d.parties.find((p) => p.isMe) : null;
  const init = () => {
    if (existing) return {
      date: existing.date, dateSource: 'manual', category: existing.category, description: existing.description, partyId: existing.partyId ?? '', vendorName: existing.vendorName,
      roomId: existing.roomId ?? '', subtotal: existing.subtotal, discount: existing.discount === '0.00' ? '' : existing.discount, tax: existing.tax === '0.00' ? '' : existing.tax, total: existing.total,
      paymentMethod: existing.paymentMethod, fundedByPartyId: existing.fundedByPartyId ?? '', note: existing.note, paidNow: false, reason: '',
      items: existing.items.map((i): Item => ({ name: i.name, quantity: i.quantity ?? '', unit: i.unit, unitPrice: i.unitPrice ?? '', lineTotal: i.lineTotal ?? '', low: false })),
    };
    const supplier = ai?.vendor ? d.parties.find((p) => p.name.toLowerCase() === ai.vendor!.toLowerCase()) : undefined;
    return {
      date: ai?.handwrittenDate ?? ai?.printedDate ?? today(), dateSource: ai?.handwrittenDate ? 'handwritten' : ai?.printedDate ? 'printed' : 'today',
      category: ai?.suggestedCategory && d.categories.some((c) => c.key === ai.suggestedCategory) ? ai.suggestedCategory : 'material',
      description: ai?.items?.length ? ai.items.slice(0, 3).map((i) => i.name).join(', ').slice(0, 300) : '',
      partyId: supplier?.id ?? (myParty && myParty.role === 'worker' ? myParty.id : ''), vendorName: ai?.vendor ?? '', roomId: '',
      subtotal: ai?.subtotal ?? '', discount: ai?.discount ?? '', tax: ai?.tax ?? '', total: ai?.total ?? '', paymentMethod: ai?.paymentMethod ?? '',
      fundedByPartyId: d.level === 'contractor' && myParty ? myParty.id : '', note: ai?.notes ?? '', paidNow: false, reason: '',
      items: ai?.items?.length ? ai.items.map((i): Item => ({ name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '', unitPrice: i.unitPrice ?? '', lineTotal: i.lineTotal ?? '', low: i.confidence < 0.6 })) : [] as Item[],
    };
  };
  const [f, setF] = useState(init);
  const [seeded, setSeeded] = useState(!!ai || !invoice);
  useEffect(() => { if (!seeded && ai) { setF(init()); setSeeded(true); } }, [ai]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [dups, setDups] = useState<{ id: string; reason: string }[]>([]);
  const [key] = useState(newKey);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const low = (k: string) => (ai?.confidence?.[k] ?? 1) < 0.6;
  // Live arithmetic check — shown, never "fixed" silently.
  const linesSum = f.items.reduce((s, i) => s + (i.lineTotal ? cents(i.lineTotal) : (cents(i.quantity) && cents(i.unitPrice) ? Math.round(num(i.quantity) * cents(i.unitPrice)) : 0)), 0);
  const sub = f.subtotal ? cents(f.subtotal) : linesSum;
  const expected = sub - cents(f.discount) + cents(f.tax);
  const problems: string[] = [];
  if (f.items.length && f.subtotal && linesSum !== cents(f.subtotal)) problems.push(`Sətirlərin cəmi ${azn(linesSum)}, ara cəm ${azn(cents(f.subtotal))}.`);
  if (f.total && (f.subtotal || f.items.length) && expected !== cents(f.total)) problems.push(`Ara cəm − endirim + vergi = ${azn(expected)}, yekun isə ${azn(cents(f.total))}.`);
  f.items.forEach((i) => { if (i.quantity && i.unitPrice && i.lineTotal && Math.abs(Math.round(num(i.quantity) * cents(i.unitPrice)) - cents(i.lineTotal)) > 1) problems.push(`"${i.name}": ${i.quantity} × ${i.unitPrice} ≠ ${i.lineTotal}.`); });
  useEffect(() => {
    if (existing || !f.total || !f.date) { setDups([]); return; }
    const t = window.setTimeout(() => { void api<{ id: string; reason: string }[]>(`/home-projects/${projectId}/duplicates`, 'POST', { vendor: f.vendorName, date: f.date, total: f.total, invoiceId: inv?.id ?? null }).then(setDups).catch(() => setDups([])); }, 500);
    return () => window.clearTimeout(t);
  }, [f.vendorName, f.date, f.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const dateOptions = [
    ...(ai?.printedDate ? [{ v: 'printed', d: ai.printedDate, l: 'Çap edilmiş tarix' }] : []),
    ...(ai?.handwrittenDate ? [{ v: 'handwritten', d: ai.handwrittenDate, l: 'Əl ilə yazılmış tarix' }] : []),
    { v: 'today', d: today(), l: 'Bu gün' },
  ];
  const save = async () => {
    setBusy(true); setErr('');
    const body = {
      date: f.date, dateSource: f.dateSource, category: f.category, description: f.description, partyId: f.partyId || null, vendorName: f.vendorName, roomId: f.roomId || null,
      subtotal: f.subtotal || null, discount: f.discount || null, tax: f.tax || null, total: f.total, paymentMethod: f.paymentMethod, fundedByPartyId: f.fundedByPartyId || null, note: f.note,
      items: f.items.filter((i) => i.name.trim()).map((i) => ({ name: i.name, quantity: i.quantity || null, unit: i.unit, unitPrice: i.unitPrice || null, lineTotal: i.lineTotal || null })),
    };
    try {
      if (existing) await api(`/home-projects/${projectId}/expenses/${existing.id}`, 'PATCH', { ...body, reason: f.reason });
      else await api(`/home-projects/${projectId}/expenses`, 'POST', { ...body, invoiceId: inv?.id ?? null, paidNow: f.paidNow, idempotencyKey: key });
      await refresh(); onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const reading = inv?.status === 'reading';
  return <Modal open wide onClose={onClose} eyebrow={existing ? 'Xərci düzəlt' : inv ? 'Qaiməni yoxlayın' : 'Yeni xərc'} title={existing ? existing.description : inv ? (reading ? 'AI oxuyur…' : ai ? 'AI-nin oxuduqlarını yoxlayın' : 'Məlumatları daxil edin') : 'Xərc daxil et'}
    footer={<><button className="button button-secondary" onClick={onClose}>Bağla</button><button className="button button-primary" disabled={busy || reading || !f.total || !f.description.trim() || (existing?.status === 'approved' && !f.reason.trim())} onClick={save} data-testid="fn-expense-save">{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{existing ? 'Saxla' : d.permissions.manage ? 'Təsdiqlə və saxla' : 'Təsdiqə göndər'}</button></>}>
    <div className="fn-review">
      {inv && <div className="fn-doc">{media ? (media.contentType === 'application/pdf' ? <a href={media.url} target="_blank" rel="noreferrer" className="fn-pdf"><FileText size={22} />PDF-i aç</a> : <a href={media.url} target="_blank" rel="noreferrer"><img src={media.url} alt="Qaimə" /></a>) : null}
        {reading && <p className="fn-reading"><LoaderCircle className="spin" size={16} />AI sənədi oxuyur. Bu adətən 5–20 saniyə çəkir.</p>}
        {inv.status === 'failed' && <p className="fn-mismatch"><AlertTriangle size={13} />{inv.aiError || 'AI oxuya bilmədi'} — məlumatları əl ilə daxil edin.</p>}
        {inv.status === 'uploaded' && !d.aiConfigured && <p className="fn-note"><Info size={14} />AI oxuma qoşulmayıb — məlumatları əl ilə daxil edin.</p>}
        {ai && <p className="fn-ai-note"><Sparkles size={14} />AI-nin oxuduqları doldurulub. Sarı xanalar zəif oxunub — mütləq yoxlayın.{ai.unreadable.length ? ` Oxunmayan: ${ai.unreadable.join(', ')}.` : ''}</p>}
        {(ai?.duplicates?.length || inv.duplicateOfId) ? <p className="fn-mismatch"><AlertTriangle size={13} />Bu qaimə əvvəl yüklənmiş ola bilər: {ai?.duplicates?.[0]?.reason ?? 'eyni fayl'}. Əvvəlki qeydi “Qaimələr” bölməsində müqayisə edin.</p> : null}
      </div>}
      <div className="fn-form">
        {ai && dateOptions.length > 1 && <fieldset className="fn-dates"><legend>Xərcin tarixi hansıdır?</legend>{dateOptions.map((o) => <label key={o.v} className={f.dateSource === o.v ? 'on' : ''}><input type="radio" name="ds" checked={f.dateSource === o.v} onChange={() => set({ dateSource: o.v, date: o.d })} />{o.l}: <b>{azDate(o.d)}</b>{o.v === 'handwritten' && low('handwrittenDate') ? <em> (zəif oxunub)</em> : null}</label>)}</fieldset>}
        <div className="fn-grid2">
          <Fld label="Tarix"><input type="date" value={f.date} onChange={(e) => set({ date: e.target.value, dateSource: 'manual' })} data-testid="fn-exp-date" /></Fld>
          <Fld label="Kateqoriya"><select value={f.category} onChange={(e) => set({ category: e.target.value })} data-testid="fn-exp-category">{d.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Fld>
        </div>
        <Fld label="Təsvir"><input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Məs. Armatur 12 mm" data-testid="fn-exp-desc" /></Fld>
        <div className="fn-grid2">
          <Fld label="Satıcı / usta" warn={low('vendor')}><input value={f.vendorName} onChange={(e) => set({ vendorName: e.target.value })} /></Fld>
          <Fld label="Hesablaşma tərəfi"><select value={f.partyId} onChange={(e) => set({ partyId: e.target.value })} disabled={d.level === 'party'}><option value="">— tərəf deyil —</option>{d.parties.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name} ({ROLE[p.role]})</option>)}</select></Fld>
        </div>
        <div className="fn-items-edit">
          <div className="fn-items-head"><b>Sətirlər</b><button className="text-link" onClick={() => set({ items: [...f.items, blankItem()] })} data-testid="fn-add-line"><Plus size={14} />Sətir</button></div>
          {f.items.map((i, k) => <div key={k} className={`fn-item ${i.low ? 'low' : ''}`}>
            <input aria-label="Ad" value={i.name} placeholder="Ad" onChange={(e) => set({ items: f.items.map((x, j) => j === k ? { ...x, name: e.target.value } : x) })} />
            <input aria-label="Miqdar" inputMode="decimal" value={i.quantity} placeholder="Miqdar" onChange={(e) => set({ items: f.items.map((x, j) => j === k ? { ...x, quantity: e.target.value } : x) })} />
            <input aria-label="Vahid" value={i.unit} placeholder="Vahid" onChange={(e) => set({ items: f.items.map((x, j) => j === k ? { ...x, unit: e.target.value } : x) })} />
            <input aria-label="Vahid qiyməti" inputMode="decimal" value={i.unitPrice} placeholder="Qiymət" onChange={(e) => set({ items: f.items.map((x, j) => j === k ? { ...x, unitPrice: e.target.value } : x) })} />
            <input aria-label="Cəmi" inputMode="decimal" value={i.lineTotal} placeholder="Cəmi" onChange={(e) => set({ items: f.items.map((x, j) => j === k ? { ...x, lineTotal: e.target.value } : x) })} />
            <button className="icon-button" aria-label="Sətri sil" onClick={() => set({ items: f.items.filter((_, j) => j !== k) })}><Trash2 size={14} /></button>
          </div>)}
        </div>
        <div className="fn-grid4">
          <Fld label="Ara cəm" warn={low('subtotal')}><input inputMode="decimal" value={f.subtotal} onChange={(e) => set({ subtotal: e.target.value })} placeholder={f.items.length ? (linesSum / 100).toFixed(2) : ''} /></Fld>
          <Fld label="Endirim"><input inputMode="decimal" value={f.discount} onChange={(e) => set({ discount: e.target.value })} /></Fld>
          <Fld label="Vergi"><input inputMode="decimal" value={f.tax} onChange={(e) => set({ tax: e.target.value })} /></Fld>
          <Fld label="Yekun (AZN)" warn={low('total')}><input inputMode="decimal" value={f.total} onChange={(e) => set({ total: e.target.value })} data-testid="fn-exp-total" /></Fld>
        </div>
        {problems.length > 0 && <div className="fn-mismatch" role="alert" data-testid="fn-mismatch"><AlertTriangle size={14} /><span>Hesablama uyğun gəlmir: {problems.join(' ')} Məbləğ avtomatik dəyişdirilmir — sənədlə yoxlayın.</span></div>}
        {dups.length > 0 && <div className="fn-mismatch" role="alert"><AlertTriangle size={14} /><span>Oxşar qeyd var: {dups[0].reason}. Eyni xərcin iki dəfə yazılmadığını yoxlayın.</span></div>}
        <div className="fn-grid2">
          <Fld label="Ödəniş üsulu"><select value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}><option value="">—</option><option value="cash">Nağd</option><option value="card">Kart</option><option value="transfer">Köçürmə</option><option value="other">Digər</option></select></Fld>
          {d.rooms.length > 0 && <Fld label="Otaq"><select value={f.roomId} onChange={(e) => set({ roomId: e.target.value })}><option value="">—</option>{d.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Fld>}
        </div>
        {d.level !== 'party' && <Fld label="Kimin pulu ilə alınıb?" hint="Podratçı ev sahibinin verdiyi avansdan alıbsa, seçin: avans ödəniş kimi, material xərc kimi ayrıca sayılır.">
          <select value={f.fundedByPartyId} onChange={(e) => set({ fundedByPartyId: e.target.value, paidNow: false })} data-testid="fn-exp-funded"><option value="">Ev sahibi birbaşa ödəyir / ödəyəcək</option>{d.parties.filter((p) => p.role === 'contractor' || p.role === 'worker').map((p) => <option key={p.id} value={p.id}>{p.name} — avansdan</option>)}</select>
        </Fld>}
        {d.permissions.manage && !existing && !f.fundedByPartyId && <label className="fn-check"><input type="checkbox" checked={f.paidNow} onChange={(e) => set({ paidNow: e.target.checked })} data-testid="fn-exp-paidnow" />Ödənişi indi etdim (ödəniş qeydi də yaradılsın)</label>}
        <Fld label="Qeyd"><textarea rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} /></Fld>
        {existing?.status === 'approved' && <Fld label="Düzəlişin səbəbi" hint="Təsdiqlənmiş xərc səbəbsiz dəyişdirilmir; əvvəlki və yeni dəyər tarixçədə saxlanılır."><input value={f.reason} onChange={(e) => set({ reason: e.target.value })} /></Fld>}
        {!d.permissions.manage && !existing && <p className="fn-note"><Info size={14} />Ev sahibi təsdiqləyənə qədər bu xərc yekun hesablara daxil edilmir.</p>}
        {err && <p className="form-error">{err}</p>}
      </div>
    </div>
  </Modal>;
}

/* ---------------------------------------------------------------- parties */

function PartiesTab({ d, projectId, onAdd }: { d: Finance; projectId: string; onAdd: () => void }) {
  const refresh = useRefresh(projectId);
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const invite = async (p: Party) => { try { const r = await api<{ url: string }>(`/home-projects/${projectId}/parties/${p.id}/invite`, 'POST', {}); setLink({ id: p.id, url: r.url }); await refresh(); } catch (e) { alertErr(e); } };
  const contract = async (p: Party) => {
    const amount = window.prompt('Müqavilə məbləği (AZN)', p.contractAmount ?? ''); if (amount === null) return;
    const reason = p.contractAmount ? window.prompt('Dəyişikliyin səbəbi') : ''; if (reason === null) return;
    try { await api(`/home-projects/${projectId}/parties/${p.id}`, 'PATCH', { contractAmount: amount || null, reason }); await refresh(); } catch (e) { alertErr(e); }
  };
  const list = d.parties.filter((p) => !p.archived);
  return <div>
    {d.permissions.manage && <div className="fn-toolbar"><button className="button button-primary" onClick={onAdd} data-testid="fn-add-party"><UserPlus size={16} />Tərəf əlavə et</button></div>}
    {!list.length ? <Empty icon={<Users size={26} />} title="Hələ tərəf yoxdur" text="Podratçı, usta və ya təchizatçı əlavə edin: razılaşdırılmış məbləğ, ödənilən və qalıq avtomatik hesablanacaq." />
      : <div className="fn-table-wrap"><table className="fn-table" data-testid="fn-parties"><thead><tr><th>Tərəf</th><th>Öhdəlik</th><th>Ödənilib</th><th>Qalıq</th><th>Status</th></tr></thead>
        <tbody>{list.map((p) => { const b = p.balance!; return <tr key={p.id}>
          <td><b>{p.name}</b><small>{ROLE[p.role]}{b.basis === 'contract' ? ` · müqavilə ${azn(b.contract)}` : ' · qaimələr üzrə'}{p.linked ? ' · hesabı qoşulub' : p.invitePending ? ' · dəvət göndərilib' : ''}</small>
            {d.permissions.manage && <span className="fn-mini">{(p.role === 'contractor' || p.role === 'worker') && !p.linked && <button className="text-link" onClick={() => invite(p)}><Send size={12} />Dəvət linki</button>}{p.role !== 'supplier' && <button className="text-link" onClick={() => contract(p)}>Müqavilə</button>}</span>}
            {link?.id === p.id && <span className="fn-link"><input readOnly value={link.url} aria-label="Dəvət linki" /><CopyButton text={link.url} /></span>}</td>
          <td title={`Müqavilə ${azn(b.contract)} + əlavə işlər ${azn(b.approvedChangeOrders)} + qaimələr ${azn(b.invoicedExpenses)}`}>{azn(b.obligation)}{b.approvedChangeOrders ? <small>+ əlavə işlər {azn(b.approvedChangeOrders)}</small> : null}</td>
          <td title={`Ödəniş+avans ${azn(b.paid)} − geri ${azn(b.refunds)} − avansdan materiallar ${azn(b.advanceSpent)}`}>{azn(b.credited)}{b.advanceGiven ? <small>avans {azn(b.advanceGiven)}, materiala {azn(b.advanceSpent)}</small> : null}</td>
          <td><b>{azn(b.remaining)}</b></td>
          <td><Pill small tone={PARTY_TONE[b.status]}>{PARTY_STATUS[b.status]}</Pill></td>
        </tr>; })}</tbody></table></div>}
    <p className="fn-note"><Info size={14} />Hesaba sayılan ödəniş = ödəniş + avans − geri qaytarılan − avansdan üçüncü tərəfə alınmış materiallar. Qalıq = öhdəlik − hesaba sayılan ödəniş. Mübahisəli və ləğv edilmiş ödənişlər sayılmır.</p>
  </div>;
}

function PartyForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const refresh = useRefresh(projectId);
  const [f, setF] = useState({ name: '', role: 'contractor', phone: '', contractAmount: '', contractNote: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setErr(''); try { await api(`/home-projects/${projectId}/parties`, 'POST', { ...f, contractAmount: f.role === 'supplier' ? null : f.contractAmount || null }); await refresh(); onClose(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} eyebrow="Hesablaşma" title="Tərəf əlavə et" footer={<><button className="button button-secondary" onClick={onClose}>Ləğv et</button><button className="button button-primary" disabled={busy || !f.name.trim()} onClick={save} data-testid="fn-party-save">Əlavə et</button></>}>
    <div className="fn-form">
      <Fld label="Ad və ya şirkət"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="fn-party-name" /></Fld>
      <Fld label="Rol"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} data-testid="fn-party-role"><option value="contractor">Podratçı</option><option value="worker">Usta</option><option value="supplier">Təchizatçı</option><option value="other">Digər</option></select></Fld>
      {f.role !== 'supplier' && <Fld label="Razılaşdırılmış məbləğ (AZN)" hint="Boş qalsa, hesab qaimələr üzrə aparılır."><input inputMode="decimal" value={f.contractAmount} onChange={(e) => setF({ ...f, contractAmount: e.target.value })} data-testid="fn-party-contract" /></Fld>}
      <Fld label="Telefon"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Fld>
      {err && <p className="form-error">{err}</p>}
    </div>
  </Modal>;
}

/* --------------------------------------------------------------- payments */

function PaymentsTab({ d, projectId }: { d: Finance; projectId: string }) {
  const refresh = useRefresh(projectId);
  const act = async (p: Payment, action: string) => {
    const reason = action === 'dispute' || action === 'cancel' ? window.prompt(action === 'dispute' ? 'Nə uyğun deyil?' : 'Ləğv etmə səbəbi') : '';
    if (reason === null) return;
    try { await api(`/home-projects/${projectId}/payments/${p.id}/status`, 'POST', { action, reason }); await refresh(); } catch (e) { alertErr(e); }
  };
  const list = [...d.payments].sort((a, b) => b.date.localeCompare(a.date));
  return <div>
    {!list.length ? <Empty icon={<HandCoins size={26} />} title="Ödəniş yoxdur" text="Podratçıya, ustaya və ya mağazaya verilən pulu, avansları və geri qaytarmaları burada qeyd edin." />
      : <ul className="fn-list">{list.map((p) => { const proof = p.proofMediaId ? d.media.find((m) => m.id === p.proofMediaId) : null; return <li key={p.id} className={`fn-row st-${p.status}`} data-testid="fn-payment">
        <div className="fn-row-main static">
          <span className="fn-date">{azDate(p.date)}</span>
          <span className="fn-row-text"><b>{PAY_KIND[p.kind]} · {p.kind === 'refund' ? `${partyName(d, p.partyId)} → ev sahibi` : partyName(d, p.partyId) || p.payeeName}</b><small>{p.purpose || '—'} · {METHOD[p.method]}{proof ? '' : ' · sübut yoxdur'}{p.cancelReason ? ` · ${p.cancelReason}` : ''}</small></span>
          <span className="fn-row-amt"><b>{aznS(p.amount)}</b><Pill small tone={PAY_TONE[p.status]}>{PAY_STATUS[p.status]}</Pill></span>
        </div>
        <div className="fn-actions">
          {proof && <a className="text-link" href={proof.url} target="_blank" rel="noreferrer">Sübutu aç</a>}
          {p.toMe && p.status === 'recorded' && <><button className="button button-primary sm-btn-sm" onClick={() => act(p, 'confirm')} data-testid="fn-pay-confirm"><BadgeCheck size={14} />Aldım, təsdiqləyirəm</button><button className="button button-secondary sm-btn-sm" onClick={() => act(p, 'dispute')}>Uyğun deyil</button></>}
          {d.permissions.manage && p.status === 'disputed' && <button className="button button-secondary sm-btn-sm" onClick={() => act(p, 'reopen')}><RotateCcw size={14} />Yenidən aç</button>}
          {d.permissions.manage && p.status !== 'cancelled' && <button className="button button-secondary sm-btn-sm" onClick={() => act(p, 'cancel')}><Ban size={14} />Ləğv et</button>}
        </div>
      </li>; })}</ul>}
    <p className="fn-note"><Info size={14} />Bank inteqrasiyası yoxdur: ödənişlər istifadəçilərin qeydidir. “Alan təsdiqləyib” — pulu alan tərəf öz hesabından təsdiqləyib deməkdir.</p>
  </div>;
}

function PaymentForm({ d, projectId, onClose }: { d: Finance; projectId: string; onClose: () => void }) {
  const refresh = useRefresh(projectId);
  const [f, setF] = useState({ kind: 'payment', date: today(), amount: '', partyId: d.parties.find((p) => p.role === 'contractor')?.id ?? '', payeeName: '', purpose: '', method: 'cash', expenseId: '' });
  const [proof, setProof] = useState<File | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [key] = useState(newKey);
  const unpaid = d.expenses.filter((e) => e.status === 'approved' && e.payState && e.payState.status !== 'paid' && e.payState.status !== 'advance');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      let proofMediaId: string | null = null;
      if (proof) { const file = await shrinkImage(proof); const m = await api<{ id: string }>(`/home-projects/${projectId}/files`, 'POST', { file: await putFile(file), caption: 'Ödəniş sübutu' }); proofMediaId = m.id; }
      await api(`/home-projects/${projectId}/payments`, 'POST', { ...f, partyId: f.partyId || null, expenseId: f.expenseId || null, proofMediaId, idempotencyKey: key });
      await refresh(); onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} eyebrow="Ödəniş" title="Ödəniş, avans və ya geri qaytarma" footer={<><button className="button button-secondary" onClick={onClose}>Ləğv et</button><button className="button button-primary" disabled={busy || !f.amount} onClick={save} data-testid="fn-pay-save">{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Saxla</button></>}>
    <div className="fn-form">
      <div className="fn-seg" role="radiogroup" aria-label="Növ">{(['payment', 'advance', 'refund'] as const).map((k) => <button key={k} role="radio" aria-checked={f.kind === k} className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })} data-testid={`fn-pay-kind-${k}`}>{PAY_KIND[k]}</button>)}</div>
      {f.kind === 'advance' && <p className="fn-note"><Info size={14} />Avans xərc deyil. Podratçının bu puldan aldığı materialları xərc kimi əlavə edərkən “avansdan” seçin.</p>}
      <div className="fn-grid2">
        <Fld label="Məbləğ (AZN)"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="fn-pay-amount" /></Fld>
        <Fld label="Tarix"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Fld>
      </div>
      <Fld label={f.kind === 'refund' ? 'Kim qaytarıb' : 'Kimə'}><select value={f.partyId} onChange={(e) => setF({ ...f, partyId: e.target.value })} data-testid="fn-pay-party"><option value="">{f.kind === 'payment' ? '— tərəf deyil (mağaza və s.) —' : '— seçin —'}</option>{d.parties.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name} ({ROLE[p.role]})</option>)}</select></Fld>
      {!f.partyId && f.kind === 'payment' && <Fld label="Alanın adı"><input value={f.payeeName} onChange={(e) => setF({ ...f, payeeName: e.target.value })} /></Fld>}
      {f.kind === 'payment' && unpaid.length > 0 && <Fld label="Hansı xərc üçün (istəyə bağlı)"><select value={f.expenseId} onChange={(e) => { const x = unpaid.find((u) => u.id === e.target.value); setF({ ...f, expenseId: e.target.value, ...(x ? { partyId: x.partyId ?? '', payeeName: x.vendorName, amount: f.amount || ((toCentsS(x.total) - (x.payState?.paid ?? 0)) / 100).toFixed(2) } : {}) }); }}><option value="">—</option>{unpaid.map((x) => <option key={x.id} value={x.id}>{azDate(x.date)} · {x.description} · {aznS(x.total)}</option>)}</select></Fld>}
      <div className="fn-grid2">
        <Fld label="Məqsəd"><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Fld>
        <Fld label="Üsul"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="cash">Nağd</option><option value="card">Kart</option><option value="transfer">Köçürmə</option><option value="other">Digər</option></select></Fld>
      </div>
      <Fld label="Sübut (qəbz, köçürmə şəkli)"><input type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} /></Fld>
      {err && <p className="form-error">{err}</p>}
    </div>
  </Modal>;
}

/* ---------------------------------------------------------- change orders */

function ChangesTab({ d, projectId }: { d: Finance; projectId: string }) {
  const refresh = useRefresh(projectId);
  const [edit, setEdit] = useState<ChangeOrder | null>(null);
  const decide = async (c: ChangeOrder, decision: string) => {
    const note = decision === 'approve' ? '' : window.prompt(decision === 'reject' ? 'Rədd etmə səbəbi' : 'Nəyi izah etsinlər?');
    if (note === null) return;
    try { await api(`/home-projects/${projectId}/change-orders/${c.id}/decision`, 'POST', { decision, note }); await refresh(); } catch (e) { alertErr(e); }
  };
  const list = [...d.changeOrders].sort((a, b) => b.number - a.number);
  return <div>
    {!list.length ? <Empty icon={<FilePlus2 size={26} />} title="Əlavə iş təklifi yoxdur" text="Podratçı əlavə iş təklif edəndə burada görünür. Yalnız təsdiqlənmiş təklif büdcəni dəyişir." />
      : <ul className="fn-list">{list.map((c) => <li key={c.id} className={`fn-row st-${c.status}`} data-testid="fn-change">
        <div className="fn-row-main static"><span className="fn-date">№{c.number}<br />{azDate(c.date)}</span>
          <span className="fn-row-text"><b>{c.title}</b><small>{partyName(d, c.partyId) || '—'}{c.reason ? ` · ${c.reason}` : ''}</small>{c.description && <small>{c.description}</small>}{c.decisionNote && <small className="fn-decision">Qərar qeydi: {c.decisionNote}</small>}</span>
          <span className="fn-row-amt"><b>{aznS(c.amount)}</b><Pill small tone={CO_TONE[c.status]}>{CO_STATUS[c.status]}</Pill></span></div>
        {!!c.mediaIds.length && <div className="fn-thumbs">{c.mediaIds.map((id) => { const m = d.media.find((x) => x.id === id); return m ? <a key={id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" /></a> : null; })}</div>}
        <div className="fn-actions">
          {d.permissions.manage && (c.status === 'proposed' || c.status === 'clarification') && <><button className="button button-primary sm-btn-sm" onClick={() => decide(c, 'approve')} data-testid="fn-co-approve"><Check size={14} />Təsdiqlə</button><button className="button button-secondary sm-btn-sm" onClick={() => decide(c, 'clarify')}>İzah istə</button><button className="button button-secondary sm-btn-sm" onClick={() => decide(c, 'reject')}><X size={14} />Rədd et</button></>}
          {c.mine && (c.status === 'proposed' || c.status === 'clarification') && <button className="button button-secondary sm-btn-sm" onClick={() => setEdit(c)}>{c.status === 'clarification' ? 'Cavab ver / düzəlt' : 'Düzəlt'}</button>}
        </div>
      </li>)}</ul>}
    {edit && <ChangeForm d={d} projectId={projectId} existing={edit} onClose={() => setEdit(null)} />}
  </div>;
}

function ChangeForm({ d, projectId, existing, onClose }: { d: Finance; projectId: string; existing?: ChangeOrder; onClose: () => void }) {
  const refresh = useRefresh(projectId);
  const [f, setF] = useState({ title: existing?.title ?? '', description: existing?.description ?? '', reason: existing?.reason ?? '', amount: existing?.amount ?? '', date: existing?.date ?? today(), partyId: existing?.partyId ?? d.parties.find((p) => p.isMe)?.id ?? d.parties.find((p) => p.role === 'contractor')?.id ?? '' });
  const [photos, setPhotos] = useState<File[]>([]);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const ids = [...(existing?.mediaIds ?? [])];
      for (const p of photos.slice(0, 6)) { const m = await api<{ id: string }>(`/home-projects/${projectId}/files`, 'POST', { file: await putFile(await shrinkImage(p)), caption: 'Əlavə iş' }); ids.push(m.id); }
      const body = { ...f, partyId: f.partyId || null, mediaIds: ids };
      if (existing) await api(`/home-projects/${projectId}/change-orders/${existing.id}`, 'PATCH', body); else await api(`/home-projects/${projectId}/change-orders`, 'POST', body);
      await refresh(); onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} eyebrow="Əlavə iş" title={existing ? `№${existing.number} ${existing.title}` : 'Əlavə iş təklifi'} footer={<><button className="button button-secondary" onClick={onClose}>Ləğv et</button><button className="button button-primary" disabled={busy || !f.title.trim() || !f.amount} onClick={save} data-testid="fn-co-save">{existing ? 'Saxla' : 'Təklif göndər'}</button></>}>
    <div className="fn-form">
      <Fld label="İşin adı"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="fn-co-title" /></Fld>
      <div className="fn-grid2"><Fld label="Əlavə məbləğ (AZN)"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="fn-co-amount" /></Fld><Fld label="Tarix"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Fld></div>
      {d.permissions.manage && <Fld label="Kim üçün"><select value={f.partyId} onChange={(e) => setF({ ...f, partyId: e.target.value })}><option value="">—</option>{d.parties.filter((p) => p.role !== 'supplier').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Fld>}
      <Fld label="Səbəb"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Fld>
      <Fld label="Təsvir"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Fld>
      <Fld label="Foto / sənəd"><input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} /></Fld>
      <p className="fn-note"><Info size={14} />Ev sahibi təsdiqləyənə qədər büdcə dəyişmir.</p>
      {err && <p className="form-error">{err}</p>}
    </div>
  </Modal>;
}

/* --------------------------------------------------------------- invoices */

const INV_STATUS: Record<string, string> = { uploaded: 'Məlumat gözləyir', reading: 'AI oxuyur', read: 'Yoxlamanızı gözləyir', failed: 'Oxunmadı', confirmed: 'Xərc kimi saxlanılıb', discarded: 'Ləğv edilib' };
function InvoicesTab({ d, projectId, onReview }: { d: Finance; projectId: string; onReview: (i: Invoice) => void }) {
  const refresh = useRefresh(projectId);
  const discard = async (i: Invoice) => { if (!window.confirm('Bu qaiməni ləğv edək? Fayl arxivdə qalır.')) return; try { await api(`/home-projects/${projectId}/invoices/${i.id}/discard`, 'POST', {}); await refresh(); } catch (e) { alertErr(e); } };
  const reread = async (i: Invoice) => { try { await api(`/home-projects/${projectId}/invoices/${i.id}/read`, 'POST', {}); await refresh(); } catch (e) { alertErr(e); } };
  const list = d.invoices.filter((i) => i.status !== 'discarded').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div>
    {!list.length ? <Empty icon={<FileText size={26} />} title="Qaimə yoxdur" text="“Qaimə çək” düyməsi ilə qaimə, çek və ya əl ilə yazılmış qeydin şəklini çəkin. AI oxuyur, siz yoxlayıb təsdiqləyirsiniz." />
      : <ul className="fn-list">{list.map((i) => { const m = d.media.find((x) => x.id === i.mediaId); return <li key={i.id} className="fn-row" data-testid="fn-invoice">
        <div className="fn-row-main static">
          <span className="fn-inv-thumb">{m && m.contentType.startsWith('image/') ? <img src={m.url} alt="" /> : <FileText size={20} />}</span>
          <span className="fn-row-text"><b>{i.vendor || 'Qaimə'}{i.docNumber ? ` · №${i.docNumber}` : ''}</b><small>{i.docDate ? azDate(i.docDate) : azDate(i.createdAt)}{i.duplicateOfId ? ' · dublikat ola bilər' : ''}{i.aiError ? ` · ${i.aiError}` : ''}</small></span>
          <span className="fn-row-amt"><b>{aznS(i.total)}</b><Pill small tone={i.status === 'confirmed' ? 'ok' : i.status === 'failed' ? 'risk' : i.status === 'reading' ? 'info' : 'warn'}>{i.status === 'reading' ? <LoaderCircle className="spin" size={11} /> : null}{INV_STATUS[i.status]}</Pill></span>
        </div>
        <div className="fn-actions">
          {i.status !== 'confirmed' && i.status !== 'reading' && <button className="button button-primary sm-btn-sm" onClick={() => onReview(i)} data-testid="fn-invoice-review"><Check size={14} />{i.status === 'read' ? 'Yoxla və təsdiqlə' : 'Əl ilə daxil et'}</button>}
          {i.status === 'failed' && d.aiConfigured && <button className="button button-secondary sm-btn-sm" onClick={() => reread(i)}><RotateCcw size={14} />Yenidən oxut</button>}
          {i.status !== 'confirmed' && (d.permissions.manage || i.mine) && <button className="button button-secondary sm-btn-sm" onClick={() => discard(i)}>Ləğv et</button>}
          {m && <a className="text-link" href={m.url} target="_blank" rel="noreferrer">Sənədi aç</a>}
        </div>
      </li>; })}</ul>}
  </div>;
}

/* -------------------------------------------------------------------- ask */

const EXAMPLES = ['Bu gün nə qədər xərc çəkilib?', 'İndiyə qədər armatura nə qədər pul xərclənib?', 'Hansı qaimələr təsdiq gözləyir?', 'Podratçıya nə qədər ödəniş qalıb?', 'Təchizatçılara nə qədər borc var?', 'İlkin büdcə ilə son büdcə arasında nə qədər fərq var?'];
function AskTab({ d, projectId, goTab }: { d: Finance; projectId: string; goTab: (t: Tab) => void }) {
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  const [a, setA] = useState<{ answer: string; refs: { type: string; id: string }[] } | null>(null); const [err, setErr] = useState('');
  const ask = async (question = q) => { if (!question.trim()) return; setQ(question); setBusy(true); setErr(''); setA(null); try { setA(await api(`/home-projects/${projectId}/ask`, 'POST', { question })); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  const refLabel = (r: { type: string; id: string }) => {
    if (r.type === 'expense') { const e = d.expenses.find((x) => x.id === r.id); return e ? `${azDate(e.date)} · ${e.description} · ${aznS(e.total)}` : null; }
    if (r.type === 'payment') { const p = d.payments.find((x) => x.id === r.id); return p ? `${azDate(p.date)} · ${PAY_KIND[p.kind]} · ${aznS(p.amount)}` : null; }
    if (r.type === 'invoice') { const i = d.invoices.find((x) => x.id === r.id); return i ? `Qaimə ${i.vendor} ${aznS(i.total)}` : null; }
    if (r.type === 'change_order') { const c = d.changeOrders.find((x) => x.id === r.id); return c ? `Əlavə iş №${c.number} ${c.title}` : null; }
    if (r.type === 'party') return partyName(d, r.id) || null;
    return null;
  };
  const tabOf: Record<string, Tab> = { expense: 'expenses', payment: 'payments', invoice: 'invoices', change_order: 'changes', party: 'parties' };
  if (!d.aiConfigured) return <Empty icon={<Sparkles size={26} />} title="AI köməkçisi hələ qoşulmayıb" text="Panel və Excel hesabatındakı rəqəmlər AI olmadan da tam işləyir." />;
  return <div className="fn-ask">
    <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="fn-ask-form"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Məs. Mətbəx üçün nə qədər xərclənib?" maxLength={500} data-testid="fn-ask-input" /><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}Soruş</button></form>
    <div className="fn-chips">{EXAMPLES.map((x) => <button key={x} onClick={() => void ask(x)}>{x}</button>)}</div>
    {err && <p className="form-error">{err}</p>}
    {a && <div className="fn-answer" data-testid="fn-answer"><p>{a.answer}</p>{a.refs.length > 0 && <><small>Əsaslandığı qeydlər:</small><ul>{a.refs.map((r) => { const l = refLabel(r); return l ? <li key={r.id}><button className="text-link" onClick={() => goTab(tabOf[r.type] ?? 'expenses')}>{l}</button></li> : null; })}</ul></>}
      <small className="fn-note">Cavab yalnız bu layihənin qeydlərinə əsaslanır; yekun məbləğlər sistemin hesabladığı rəqəmlərdir.</small></div>}
  </div>;
}

/* --------------------------------------------------------- invite accept */

export function FinanceInvitePage({ token }: { token: string }) {
  const [, go] = useLocation();
  const [state, setState] = useState<{ loading: boolean; data?: { projectName: string; partyName: string; role: string }; err?: string; busy?: boolean }>({ loading: true });
  useEffect(() => { api<{ projectName: string; partyName: string; role: string }>(`/finance-invites/${token}`).then((data) => setState({ loading: false, data })).catch((e) => setState({ loading: false, err: errorText(e) })); }, [token]);
  const accept = async () => { setState((s) => ({ ...s, busy: true })); try { const r = await api<{ homeId: string; projectId: string }>(`/finance-invites/${token}/accept`, 'POST', {}); go(`/homes/${r.homeId}/maliyye/${r.projectId}`); } catch (e) { setState((s) => ({ ...s, busy: false, err: errorText(e) })); } };
  if (state.loading) return <Skeleton rows={2} />;
  if (!state.data) return <Empty icon={<Wallet size={28} />} title="Dəvət açılmadı" text={state.err ?? ''} />;
  return <div className="fn-invite">
    <Wallet size={30} /><div className="eyebrow">Maliyyəyə dəvət</div>
    <h1 className="font-display">{state.data.projectName}</h1>
    <p>Siz <b>{state.data.partyName}</b> ({ROLE[state.data.role]}) kimi dəvət olunmusunuz. Qəbul etsəniz, {state.data.role === 'contractor' ? 'layihənin ortaq maliyyə göstəricilərini görəcək, xərc və qaimə əlavə edə, əlavə iş təklif edə biləcəksiniz.' : 'sizə edilən ödənişləri görəcək və təsdiqləyə biləcəksiniz.'} Ev sahibinin digər şəxsi məlumatları sizə açılmır.</p>
    <button className="button button-primary" onClick={accept} disabled={state.busy} data-testid="fn-invite-accept">{state.busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Qəbul et</button>
    {state.err && <p className="form-error">{state.err}</p>}
  </div>;
}

/* ------------------------------------------------------------------ bits */

function Fld({ label, hint, warn, children }: { label: string; hint?: string; warn?: boolean; children: ReactNode }) {
  return <label className={`fn-field ${warn ? 'warn' : ''}`}><span>{label}{warn && <em> · zəif oxunub</em>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

