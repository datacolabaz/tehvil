import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Camera, Check, CheckCircle2, Copy, Hammer, ImagePlus, Link2, LoaderCircle, MessageCircle, Plus, ShieldOff, Trash2, Wallet, X } from 'lucide-react';
import { useCreateWork, type WorkInput } from '@workspace/api-client-react';
import { Modal, toast } from '@/components/home/ui';
import { uploadHomeMedia } from '@/lib/home/upload';
import { api, azDate, azn, booksKey, errorText, financeKey, newKey } from '@/lib/finance/api';
import { agreementsKey, BASIS, basisUnit, monthSlots, useAgreements, WORK_TYPES, type Agreement, type Basis, type PlanRow } from '@/lib/finance/agreements';
import { today } from '@/lib/home/labels';
import './work-entry.css';

/*
 * "Görülən işi qeyd et" — a service, not a purchase: what work (from a list), who does it, how it is paid
 * (hourly / daily / monthly / one price for the whole job), paid in full, in part or not yet.
 * A longer job becomes an agreement with a payment plan ("1-ci ay: əvvəli 1000, ortası 500, sonu 1000 …"); every real
 * payment is one expense, so the day / month / Excel totals include it once. The tradesperson can get a link to that
 * agreement only.
 */

const num = (s: string | null | undefined) => { const t = String(s ?? '').replace(/\s/g, '').replace(',', '.'); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const cents = (s: string | null | undefined) => { const n = num(s); return n == null || Number.isNaN(n) ? 0 : Math.round(n * 100); };
const fx = (c: number) => (c / 100).toFixed(2);
type Pay = 'full' | 'part' | 'none';

export function WorkEntryModal({ homeId, projectId, onClose, onSaved }: { homeId: string; projectId: string; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const ags = useAgreements(projectId);
  const create = useCreateWork();
  const active = (ags.data ?? []).filter((a) => a.status === 'active' && Number(a.summary.remaining) > 0);
  const [toAgreement, setToAgreement] = useState<string>('');
  const [date, setDate] = useState(today());
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [usta, setUsta] = useState(''); const [phone, setPhone] = useState('');
  const [basis, setBasis] = useState<Basis>('daily');
  const [units, setUnits] = useState(''); const [rate, setRate] = useState(''); const [amount, setAmount] = useState('');
  const [pay, setPay] = useState<Pay>('full'); const [paidNow, setPaidNow] = useState('');
  const [long, setLong] = useState(false);
  const [start, setStart] = useState(today()); const [end, setEnd] = useState('');
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [note, setNote] = useState(''); const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [key] = useState(newKey);
  const unit = basisUnit(basis);
  const computed = basis !== 'contract' && num(units) != null && num(rate) != null && !Number.isNaN(num(units)!) && !Number.isNaN(num(rate)!);
  const totalC = computed ? Math.round(num(units)! * num(rate)! * 100) : cents(amount);
  const nowC = pay === 'full' ? totalC : pay === 'part' ? cents(paidNow) : 0;
  const ag = active.find((a) => a.id === toAgreement);
  const label = type && type !== 'other' ? WORK_TYPES.find((w) => w[0] === type)?.[1] ?? '' : '';
  const workName = (name.trim() || label).slice(0, 200);
  const category = WORK_TYPES.find((w) => w[0] === type)?.[2] ?? 'labor';
  const contractors = [...new Set((ags.data ?? []).map((a) => a.contractorName))];
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: financeKey(projectId) }), qc.invalidateQueries({ queryKey: booksKey }), qc.invalidateQueries({ queryKey: agreementsKey(projectId) })]);

  const attachPhotos = async (title: string) => {
    if (!files.length) return null;
    const data: WorkInput = { title, category: 'other' as WorkInput['category'], kind: 'construction' as WorkInput['kind'], startDate: date, endDate: date, status: 'completed', description: note.trim(), materials: '' } as WorkInput;
    const w = await create.mutateAsync({ homeId, data });
    await uploadHomeMedia(files, { workId: w.id, phase: 'after' });
    return w.id;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    try {
      if (ag) {
        const c = cents(paidNow);
        if (!(c > 0)) return setErr('Ödənilən məbləği yazın.');
        if (c > cents(ag.summary.remaining)) return setErr(`Bu razılaşmada qalıb ${azn(cents(ag.summary.remaining))} — ödəniş bundan çox ola bilməz.`);
        setBusy(true);
        await api(`/home-projects/${projectId}/agreements/${ag.id}/payments`, 'POST', { date, amount: fx(c), note: note.trim(), idempotencyKey: key });
        toast(`${ag.contractorName}: ${azn(c)} ödəniş qeyd olundu`);
        await refresh(); onSaved(); return;
      }
      if (!type) return setErr('Hansı iş görülür — siyahıdan seçin.');
      if (workName.length < 2) return setErr('İşin adını yazın.');
      if (!(totalC > 0)) return setErr(basis === 'contract' ? 'Razılaşmanın məbləğini yazın.' : `Neçə ${unit} və 1 ${unit} üçün qiyməti, və ya ümumi məbləği yazın.`);
      if (pay === 'part' && !(nowC > 0 && nowC < totalC)) return setErr('Qismən ödənişdə bu gün ödənilən məbləğ 0-dan böyük, ümumi məbləğdən kiçik olmalıdır.');
      if (long && usta.trim().length < 2) return setErr('Uzunmüddətli iş üçün ustanın və ya briqadanın adını yazın.');
      setBusy(true);
      const workId = await attachPhotos(workName).catch(() => null);
      if (long) {
        const a = await api<Agreement>(`/home-projects/${projectId}/agreements`, 'POST', {
          title: workName, workType: type, contractorName: usta.trim(), contractorPhone: phone.trim(), basis,
          rate: computed ? rate : null, units: computed ? units : null, total: fx(totalC), startDate: start || null, endDate: end || null, note: note.trim(), workId,
          plan: plan.map((r) => ({ dueDate: r.dueDate, label: r.label, amount: r.rest ? null : r.amount, rest: r.rest })),
        });
        if (nowC > 0) await api(`/home-projects/${projectId}/agreements/${a.id}/payments`, 'POST', { date, amount: fx(nowC), note: '', idempotencyKey: key });
        toast(`Razılaşma yaradıldı: ${azn(totalC)}${nowC ? `, ${azn(nowC)} ödənilib` : ''}`);
      } else {
        const title = `${workName}${usta.trim() ? ` — ${usta.trim()}` : ''}`.slice(0, 200);
        const whole = computed ? `${String(num(units)).replace('.', ',')} ${unit} × ${fx(cents(rate)).replace('.', ',')}` : '';
        const line = (name: string, paid: boolean, c: number, byUnits: boolean) => ({ name, category, kind: 'service', quantity: byUnits ? units : null, unitPrice: byUnits ? rate : null, unit: byUnits ? unit : '', lineTotal: byUnits ? null : fx(c), note: byUnits ? '' : whole, paid });
        // A part paid now and the rest later are two lines of the same work (the expense list shows "İş — usta: Ödənilib (qismən)").
        const lines = pay === 'part' ? [line('Ödənilib (qismən)', true, nowC, false), line('Qalan hissə', false, totalC - nowC, false)] : [line(title, pay === 'full', totalC, computed)];
        await api(`/home-projects/${projectId}/daily-entries`, 'POST', { date, description: title, vendorName: usta.trim(), note: note.trim(), workId, lines, idempotencyKey: key });
        toast(`${workName}: ${azn(totalC)} xərclərə əlavə olundu${totalC - nowC > 0 ? `, ${azn(totalC - nowC)} ödənilməyib` : ''}`);
      }
      await refresh(); onSaved();
    } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };

  return <Modal open onClose={onClose} eyebrow="Xidmət" title="Görülən işi qeyd et" wide
    footer={<>{!ag && totalC > 0 && <span className="dl-foot-total">Cəmi: <b>{azn(totalC)}</b>{nowC !== totalC && <> · bu gün: <b>{azn(nowC)}</b></>}</span>}
      <button type="submit" form="work-entry" className="button button-primary hp-big" disabled={busy} data-testid="we-save">{busy && <LoaderCircle className="spin" size={15} />}{ag ? 'Ödənişi qeyd et' : long ? 'Razılaşmanı yadda saxla' : 'Yadda saxla'}</button></>}>
    <form id="work-entry" className="we" onSubmit={(e) => void submit(e)}>
      {active.length > 0 && <div className="we-existing" data-testid="we-existing">
        <span>Uzunmüddətli işə ödənişdir?</span>
        <div className="hp-chipset">{active.map((a) => <button key={a.id} type="button" className={toAgreement === a.id ? 'on' : ''} onClick={() => { setToAgreement(toAgreement === a.id ? '' : a.id); setPaidNow(a.summary.next?.due && Number(a.summary.next.due) > 0 ? a.summary.next.due : ''); }} data-testid="we-agreement">
          {a.contractorName} — {a.title} <small>qalıb {azn(cents(a.summary.remaining))}</small></button>)}</div>
      </div>}

      <div className="field-grid">
        <label className="field"><span>Tarix</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="we-date" /></label>
      </div>

      {ag ? <section className="we-box" data-testid="we-pay-existing">
        <h3>{ag.title} · {ag.contractorName}</h3>
        <AgreementBar a={ag} />
        {ag.summary.next && <p className="we-hint">Növbəti planlı ödəniş: <b>{ag.summary.next.label || azDate(ag.summary.next.dueDate ?? '')}</b>{ag.summary.next.dueDate ? ` (${azDate(ag.summary.next.dueDate)})` : ''} — {azn(cents(ag.summary.next.due))}</p>}
        <label className="field"><span>Bu gün ödənilən, AZN</span><input inputMode="decimal" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} data-testid="we-pay-amount" /></label>
        <label className="field"><span>Qeyd (istəyə bağlı)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
      </section> : <>
        <section className="we-box">
          <label className="field"><span>Hansı iş görülür?</span>
            <select value={type} onChange={(e) => setType(e.target.value)} data-testid="we-type"><option value="">— siyahıdan seçin —</option>{WORK_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {type && <label className="field"><span>{type === 'other' ? 'İşin adı' : 'Dəqiqləşdirin (istəyə bağlı)'}</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'other' ? 'məs. Hasarın hörülməsi' : `məs. ${label === 'Qazıntı, torpaq işləri' ? 'Lenta üçün qazıntı' : label}`} data-testid="we-name" /></label>}
          <div className="field-grid">
            <label className="field"><span>Usta və ya briqada</span><input value={usta} onChange={(e) => setUsta(e.target.value)} list="we-ustas" placeholder="məs. Usta Rauf" data-testid="we-usta" /><datalist id="we-ustas">{contractors.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="field"><span>Telefon (istəyə bağlı)</span><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="we-phone" /></label>
          </div>
        </section>

        <section className="we-box">
          <span className="we-label">Necə hesablanır?</span>
          <div className="rl-seg we-seg" role="radiogroup" aria-label="Ödəniş forması">{BASIS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={basis === k} className={basis === k ? 'on' : ''} onClick={() => setBasis(k)} data-testid={`we-basis-${k}`}>{l}</button>)}</div>
          {basis === 'contract' ? <label className="field"><span>Razılaşdırılan ümumi məbləğ, AZN</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="məs. 3500" data-testid="we-amount" /></label>
            : <div className="field-grid three">
              <label className="field"><span>Neçə {unit}</span><input inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} placeholder={basis === 'monthly' ? '2' : basis === 'daily' ? '5' : '8'} data-testid="we-units" /></label>
              <label className="field"><span>1 {unit} üçün, AZN</span><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={basis === 'monthly' ? '1500' : basis === 'daily' ? '60' : '10'} data-testid="we-rate" /></label>
              <label className="field"><span>Məbləğ, AZN</span>{computed ? <output className="we-out" data-testid="we-total">{azn(totalC)}</output> : <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="və ya cəmi yazın" data-testid="we-amount" />}</label>
            </div>}
          <span className="we-label">Ödəniş</span>
          <div className="rl-seg we-seg" role="radiogroup" aria-label="Ödəniş">{([['full', 'Tam ödənildi'], ['part', 'Qismən ödənildi'], ['none', 'Hələ ödənilməyib']] as [Pay, string][]).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={pay === k} className={pay === k ? 'on' : ''} onClick={() => setPay(k)} data-testid={`we-pay-${k}`}>{l}</button>)}</div>
          {pay === 'part' && <label className="field"><span>Bu gün ödənilən, AZN</span><input inputMode="decimal" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="məs. 1000" data-testid="we-paid-now" />{totalC > 0 && cents(paidNow) > 0 && <small className="we-hint">Qalır: {azn(Math.max(0, totalC - cents(paidNow)))}</small>}</label>}
        </section>

        <section className={`we-box we-long ${long ? 'on' : ''}`}>
          <label className="we-check"><input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} data-testid="we-long" />
            <span><b>Uzunmüddətli iş — ödəniş planı ilə</b><small>Məs. 2 aylıq iş: ayın əvvəli, ortası, sonu ödənişlər. Hər ödəniş xərclərə düşür, qalıq görünür, ustaya ayrıca link göndərmək olar.</small></span></label>
          {long && <>
            <div className="field-grid">
              <label className="field"><span>Başlanır</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="we-start" /></label>
              <label className="field"><span>Bitir (təxmini)</span><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="we-end" /></label>
            </div>
            <PlanEditor rows={plan} onChange={setPlan} totalC={totalC} start={start} />
            {nowC > 0 && <p className="we-hint"><Check size={14} />Bu gün ödənilən {azn(nowC)} razılaşmanın ilk ödənişi kimi yazılacaq.</p>}
          </>}
        </section>

        <section className="we-box">
          <label className="field"><span>Qısa qeyd (istəyə bağlı)</span><textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="məs. 2 nəfər, lenta üçün 40 m qazıldı" data-testid="we-note" /></label>
          <div className="hp-upload-btns">
            <label className="button button-secondary"><input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf" onChange={(e) => { const l = Array.from(e.target.files ?? []); setFiles((p) => [...p, ...l].slice(0, 20)); e.target.value = ''; }} data-testid="we-files" /><ImagePlus size={15} />İşin fotosu</label>
            <label className="button button-quiet"><input type="file" hidden accept="image/*" capture="environment" onChange={(e) => { const l = Array.from(e.target.files ?? []); setFiles((p) => [...p, ...l].slice(0, 20)); e.target.value = ''; }} /><Camera size={15} />Kamera</label>
          </div>
          {files.length > 0 && <div className="hp-chipset">{files.map((p, i) => <span key={i} className="hp-tag">{p.name}<button type="button" aria-label="Sil" onClick={() => setFiles((ps) => ps.filter((_, j) => j !== i))}><X size={12} /></button></span>)}</div>}
        </section>
      </>}
      {err && <p className="sm-field-error" role="alert" data-testid="we-error">{err}</p>}
    </form>
  </Modal>;
}

/** Planned payments: date, label, amount; one row may be "qalan məbləğ". A quick fill splits months into start / middle / end. */
function PlanEditor({ rows, onChange, totalC, start }: { rows: PlanRow[]; onChange: (r: PlanRow[]) => void; totalC: number; start: string }) {
  const [months, setMonths] = useState('2');
  const [slots, setSlots] = useState<('start' | 'mid' | 'end')[]>(['start', 'mid', 'end']);
  const fixedC = rows.filter((r) => !r.rest).reduce((s, r) => s + cents(r.amount), 0);
  const restC = Math.max(0, totalC - fixedC);
  const hasRest = rows.some((r) => r.rest);
  const set = (i: number, p: Partial<PlanRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : p.rest ? { ...r, rest: false } : r)));
  const fill = () => { const s = monthSlots(start || today(), Math.max(1, Math.min(24, Number(months) || 1)), slots); if (s.length) s[s.length - 1] = { ...s[s.length - 1], rest: true, label: `${s[s.length - 1].label} — qalan məbləğ` }; onChange(s); };
  return <div className="we-plan" data-testid="we-plan">
    <span className="we-label"><CalendarClock size={15} />Ödəniş planı</span>
    {!rows.length && <div className="we-fill">
      <label><span>Neçə ay</span><input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))} data-testid="we-months" /></label>
      <div className="hp-chipset">{([['start', 'ayın əvvəli'], ['mid', 'ortası'], ['end', 'sonu']] as const).map(([k, l]) => <button key={k} type="button" className={slots.includes(k) ? 'on' : ''} onClick={() => setSlots(slots.includes(k) ? slots.filter((x) => x !== k) : [...slots, k].sort((a, b) => ['start', 'mid', 'end'].indexOf(a) - ['start', 'mid', 'end'].indexOf(b)) as typeof slots)}>{l}</button>)}</div>
      <button type="button" className="button button-secondary" disabled={!slots.length} onClick={fill} data-testid="we-fill">Planı hazırla</button>
    </div>}
    {rows.length > 0 && <ol className="we-rows">{rows.map((r, i) => <li key={i} data-testid="we-row">
      <input type="date" value={r.dueDate ?? ''} onChange={(e) => set(i, { dueDate: e.target.value || null })} aria-label="Tarix" />
      <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="məs. 1-ci ay, ayın əvvəli" aria-label="Nə üçün" />
      {r.rest ? <output className="we-out" data-testid="we-rest">{azn(restC)} <small>qalan</small></output>
        : <input inputMode="decimal" value={r.amount ?? ''} onChange={(e) => set(i, { amount: e.target.value })} placeholder="AZN" aria-label="Məbləğ" data-testid="we-row-amount" />}
      <label className="we-rest-toggle"><input type="checkbox" checked={r.rest} onChange={(e) => set(i, { rest: e.target.checked, amount: e.target.checked ? null : r.amount })} />qalan</label>
      <button type="button" className="icon-button" aria-label="Sətri sil" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
    </li>)}</ol>}
    <div className="we-plan-foot">
      <button type="button" className="text-link" onClick={() => onChange([...rows, { dueDate: null, label: '', amount: null, rest: false }])} data-testid="we-add-row"><Plus size={13} />Sətir</button>
      {rows.length > 0 && <button type="button" className="text-link" onClick={() => onChange([])}>Planı təmizlə</button>}
      {rows.length > 0 && totalC > 0 && <span className={fixedC > totalC || (!hasRest && fixedC !== totalC) ? 'we-warn' : 'we-ok'} data-testid="we-plan-sum">
        Plan: {azn(fixedC + (hasRest ? restC : 0))} / {azn(totalC)}{fixedC > totalC ? ' — plan razılaşmadan çoxdur' : !hasRest && fixedC < totalC ? ` — ${azn(totalC - fixedC)} plana düşməyib` : ''}</span>}
    </div>
  </div>;
}

function AgreementBar({ a }: { a: Agreement }) {
  const t = cents(a.summary.total), p = cents(a.summary.paid);
  return <div className="we-bar" data-testid="ag-bar">
    <div className="we-bar-track"><span style={{ width: `${t ? Math.min(100, Math.round((p / t) * 100)) : 0}%` }} /></div>
    <div className="we-bar-nums"><span>Razılaşma <b>{azn(t)}</b></span><span>Ödənilib <b data-testid="ag-paid">{azn(p)}</b></span><span>Qalıb <b data-testid="ag-left">{azn(cents(a.summary.remaining))}</b></span></div>
    {cents(a.summary.overdue) > 0 && <small className="we-warn"><AlertTriangle size={13} />Vaxtı keçmiş: {azn(cents(a.summary.overdue))}</small>}
  </div>;
}

const STATUS_LABEL: Record<string, string> = { paid: 'Ödənilib', partial: 'Qismən', overdue: 'Vaxtı keçib', upcoming: 'Gözlənilir' };

/** "Ustalarla razılaşmalar" on the expenses page. */
export function AgreementsSection({ projectId }: { projectId: string }) {
  const q = useAgreements(projectId);
  const [open, setOpen] = useState<string | null>(null);
  const list = q.data ?? [];
  if (!list.length) return null;
  const cur = list.find((a) => a.id === open);
  return <section className="we-section" data-testid="ag-section">
    <h2><Hammer size={17} />Ustalarla razılaşmalar</h2>
    <ul className="we-cards">{list.map((a) => <li key={a.id}><button type="button" onClick={() => setOpen(a.id)} data-testid="ag-card">
      <span className="we-card-head"><b>{a.contractorName}</b><small>{a.title} · {a.basisLabel.toLowerCase()}</small></span>
      <AgreementBar a={a} />
      <span className="we-card-foot">
        {a.status === 'closed' ? <em>Bağlanıb</em> : a.summary.next ? <em>Növbəti: {a.summary.next.dueDate ? azDate(a.summary.next.dueDate) : a.summary.next.label} — {azn(cents(a.summary.next.due))}</em> : <em>Hamısı ödənilib</em>}
        {a.summary.disputed > 0 && <em className="we-warn">Usta {a.summary.disputed} ödənişə etiraz edib</em>}
        {a.share?.active && <em>Ustaya link verilib{a.share.openedAt ? ' · baxıb' : ''}</em>}
      </span>
    </button></li>)}</ul>
    {cur && <AgreementModal projectId={projectId} a={cur} onClose={() => setOpen(null)} />}
  </section>;
}

function AgreementModal({ projectId, a, onClose }: { projectId: string; a: Agreement; onClose: () => void }) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [date, setDate] = useState(today()); const [amt, setAmt] = useState(a.summary.next?.due ?? ''); const [note, setNote] = useState('');
  const [link, setLink] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [total, setTotal] = useState(a.total); const [plan, setPlan] = useState<PlanRow[]>(a.plan.map((r) => ({ dueDate: r.dueDate, label: r.label, amount: r.rest ? null : r.amount, rest: r.rest })));
  const [key, setKey] = useState(newKey);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: agreementsKey(projectId) }), qc.invalidateQueries({ queryKey: financeKey(projectId) }), qc.invalidateQueries({ queryKey: booksKey })]);
  const act = async (k: string, fn: () => Promise<unknown>) => { setBusy(k); setErr(''); try { await fn(); await refresh(); } catch (x) { setErr(errorText(x)); } finally { setBusy(''); } };
  const body = (extra: object = {}) => ({ title: a.title, workType: a.workType, contractorName: a.contractorName, contractorPhone: a.contractorPhone, basis: a.basis, rate: a.rate, units: a.units, total: a.total, startDate: a.startDate, endDate: a.endDate, note: a.note ?? '', workId: a.workId ?? null, plan: a.plan.map((r) => ({ dueDate: r.dueDate, label: r.label, amount: r.rest ? null : r.amount, rest: r.rest })), ...extra });
  const msg = useMemo(() => `Salam! “${a.title}” işi üzrə razılaşma, ödəniş planı və etdiyim ödənişlər bu linkdədir. Hər ödənişi “Aldım” ilə təsdiqləyin: ${link}`, [a.title, link]);
  return <Modal open onClose={onClose} eyebrow={a.contractorName} title={a.title} wide>
    <div className="we-detail" data-testid="ag-detail">
      <p className="we-hint">{a.basisLabel}{a.rate && a.units ? ` · ${String(Number(a.units)).replace('.', ',')} ${a.unit} × ${azn(cents(a.rate))}` : ''}{a.startDate ? ` · ${azDate(a.startDate)}` : ''}{a.endDate ? ` – ${azDate(a.endDate)}` : ''}{a.contractorPhone ? ` · ${a.contractorPhone}` : ''}</p>
      <AgreementBar a={a} />
      {a.summary.issues.length > 0 && <ul className="we-issues">{a.summary.issues.map((x, i) => <li key={i}><AlertTriangle size={13} />{x}</li>)}</ul>}

      <h3>Ödəniş planı</h3>
      {!a.plan.length ? <p className="we-hint">Plan yazılmayıb — ödənişlər yenə də qeyd olunur və qalıq hesablanır.</p>
        : <ol className="we-plan-list" data-testid="ag-plan">{a.plan.map((r, i) => <li key={r.id ?? i} className={r.status}>
          <span><b>{r.label || 'Ödəniş'}</b><small>{r.dueDate ? azDate(r.dueDate) : 'tarixsiz'}{r.rest ? ' · qalan məbləğ' : ''}</small></span>
          <span className="we-amt">{azn(cents(r.amount))}{r.status === 'partial' && <small>{azn(cents(r.covered))} ödənilib</small>}</span>
          <em className={`we-st ${r.status}`} data-testid="ag-plan-status">{STATUS_LABEL[r.status ?? 'upcoming']}</em>
        </li>)}</ol>}

      <h3>Ödənişlər</h3>
      {!a.payments.length ? <p className="we-hint">Hələ ödəniş yoxdur.</p>
        : <ul className="we-pays" data-testid="ag-payments">{a.payments.map((p) => <li key={p.id}>
          <span><b>{azDate(p.date)}</b>{p.note && <small>{p.note}</small>}</span><span className="we-amt">{azn(cents(p.amount))}</span>
          {p.status === 'confirmed' ? <em className="we-st paid" data-testid="ag-pay-status"><CheckCircle2 size={12} />Usta təsdiqlədi</em>
            : p.status === 'disputed' ? <em className="we-st overdue" data-testid="ag-pay-status" title={p.counterpartyNote}><AlertTriangle size={12} />Usta etiraz edib: {p.counterpartyNote}</em>
              : <em className="we-st upcoming" data-testid="ag-pay-status">{a.share?.active ? 'Usta hələ təsdiqləməyib' : 'Qeyd olunub'}</em>}
        </li>)}</ul>}

      {a.status === 'active' && cents(a.summary.remaining) > 0 && (paying ? <div className="we-box" data-testid="ag-pay-form">
        <div className="field-grid three">
          <label className="field"><span>Tarix</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>Məbləğ, AZN</span><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} data-testid="ag-pay-amount" /></label>
          <label className="field"><span>Qeyd</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
        </div>
        <div className="we-actions"><button type="button" className="button button-secondary" onClick={() => setPaying(false)}>Ləğv et</button>
          <button type="button" className="button button-primary" disabled={!!busy} onClick={() => void act('pay', async () => { await api(`/home-projects/${projectId}/agreements/${a.id}/payments`, 'POST', { date, amount: amt, note, idempotencyKey: key }); setPaying(false); setNote(''); setKey(newKey()); })} data-testid="ag-pay-save">{busy === 'pay' && <LoaderCircle className="spin" size={14} />}Ödənişi qeyd et</button></div>
      </div> : <button type="button" className="button button-primary" onClick={() => { setAmt(a.summary.next?.due ?? ''); setPaying(true); }} data-testid="ag-pay"><Wallet size={15} />Ödəniş et</button>)}

      <h3>Usta ilə paylaş</h3>
      <p className="we-hint">Usta linkdə yalnız bu razılaşmanı görür: plan, ödənişlər, ödənilən və qalan. Evin digər xərclərini, ünvanı və sizin qeydlərinizi görmür. Hər ödənişi “Aldım” ilə təsdiqləyə və ya etiraz edə bilər.</p>
      {link ? <div className="we-link" data-testid="ag-link"><code>{link}</code>
        <div className="we-actions"><button type="button" className="button button-secondary" onClick={() => void navigator.clipboard?.writeText(link)}><Copy size={14} />Kopyala</button>
          <a className="button button-secondary" href={`https://wa.me/${a.contractorPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a></div></div>
        : <div className="we-actions">
          <button type="button" className="button button-secondary" disabled={!!busy} onClick={() => void act('share', async () => { const r = await api<{ url: string }>(`/home-projects/${projectId}/agreements/${a.id}/share`, 'POST', {}); setLink(r.url); })} data-testid="ag-share"><Link2 size={14} />{a.share?.active ? 'Yeni link yarat' : 'Ustaya link yarat'}</button>
          {a.share?.active && <button type="button" className="button button-quiet" disabled={!!busy} onClick={() => void act('unshare', () => api(`/home-projects/${projectId}/agreements/${a.id}/share`, 'DELETE'))} data-testid="ag-unshare"><ShieldOff size={14} />Linki bağla</button>}
        </div>}
      {a.share?.active && !link && <small className="we-hint">Link aktivdir{a.share.openedAt ? ` · usta ${azDate(a.share.openedAt.slice(0, 10))} tarixində baxıb` : ' · hələ açılmayıb'}.</small>}

      <h3>Dəyiş</h3>
      {editing ? <div className="we-box">
        <label className="field"><span>Razılaşmanın ümumi məbləği, AZN</span><input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} data-testid="ag-edit-total" /></label>
        <PlanEditor rows={plan} onChange={setPlan} totalC={cents(total)} start={a.startDate ?? today()} />
        <div className="we-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(false)}>Ləğv et</button>
          <button type="button" className="button button-primary" disabled={!!busy} onClick={() => void act('edit', async () => { await api(`/home-projects/${projectId}/agreements/${a.id}`, 'PUT', body({ total, plan: plan.map((r) => ({ dueDate: r.dueDate, label: r.label, amount: r.rest ? null : r.amount, rest: r.rest })) })); setEditing(false); })} data-testid="ag-edit-save">Yadda saxla</button></div>
      </div> : <div className="we-actions">
        <button type="button" className="button button-quiet" onClick={() => setEditing(true)} data-testid="ag-edit">Məbləği və planı dəyiş</button>
        <button type="button" className="button button-quiet" disabled={!!busy} onClick={() => void act('close', () => api(`/home-projects/${projectId}/agreements/${a.id}`, 'PUT', body({ status: a.status === 'active' ? 'closed' : 'active' })))} data-testid="ag-close">{a.status === 'active' ? 'Razılaşmanı bağla' : 'Yenidən aç'}</button>
      </div>}
      {err && <p className="sm-field-error" role="alert" data-testid="ag-error">{err}</p>}
    </div>
  </Modal>;
}
