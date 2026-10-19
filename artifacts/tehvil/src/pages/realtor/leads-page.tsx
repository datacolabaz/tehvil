import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock, ArrowRight, Bot, CheckCircle2, CalendarPlus, ChevronRight, Columns3, List, LoaderCircle, MessageCircle, Phone, Plus, Search, Send,
  ShieldCheck, Trash2, UserPlus, Wallet,
} from 'lucide-react';
import {
  getGetRealtorOverviewQueryKey, getListRealtorLeadMessagesQueryKey, getListRealtorLeadsQueryKey,
  useCreateRealtorLead, useDeleteRealtorLead, useGetRealtorProfile, useGetRealtorWhatsapp, useListRealtorAgents, useListRealtorLeadMatches,
  useListRealtorLeadMessages, useListRealtorLeads, useListRealtorListings, useSendRealtorLeadMessage, useUpdateRealtorLead,
  type RealtorLead, type RealtorLeadPatch,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { Drawer, Empty, Pill, RealtorToaster, Skeleton, toast } from '@/components/realtor/ui';
import {
  DEAL_LEAD, LEAD_STATUS, LEAD_STATUSES, LEAD_TONE, SOURCE, SOURCES, dateTime, dayKey, timeText, facts, fromLocalInput, leadScripts, num, price, relative, toLocalInput, waUrl,
} from '@/lib/realtor/labels';

type View = 'board' | 'list';
const NEXT: Record<string, string> = { new: 'contacted', contacted: 'interested', interested: 'meeting', meeting: 'deal' };

function budgetText(l: Pick<RealtorLead, 'budgetMin' | 'budgetMax'>) {
  if (l.budgetMin == null && l.budgetMax == null) return '';
  if (l.budgetMin != null && l.budgetMax != null) return `${num(l.budgetMin)}–${num(l.budgetMax)} AZN`;
  return l.budgetMax != null ? `≤ ${num(l.budgetMax)} AZN` : `≥ ${num(l.budgetMin)} AZN`;
}

export function RealtorLeadsPage() {
  const qc = useQueryClient();
  const leads = useListRealtorLeads();
  const agents = useListRealtorAgents();
  const update = useUpdateRealtorLead();
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem('tehvil-realtor-leads-view') as View) || 'board'; } catch { return 'board'; } });
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [agent, setAgent] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('lead')) setOpenId(p.get('lead'));
    if (p.get('new')) setCreating(true);
  }, []);
  useEffect(() => { try { localStorage.setItem('tehvil-realtor-leads-view', view); } catch { /* ignore */ } }, [view]);

  const rows = useMemo(() => (leads.data ?? []).filter(l =>
    (!source || l.source === source) && (!agent || (agent === 'none' ? !l.agentId : l.agentId === agent))
    && (!q || `${l.fullName} ${l.phone} ${l.district} ${l.notes}`.toLocaleLowerCase('az').includes(q.toLocaleLowerCase('az')))), [leads.data, q, source, agent]);
  const open = leads.data?.find(l => l.id === openId) ?? null;
  const refresh = () => { void qc.invalidateQueries({ queryKey: getListRealtorLeadsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() }); };
  const move = (l: RealtorLead, status: string) => update.mutate({ leadId: l.id, data: { status: status as RealtorLead['status'] } }, { onSuccess: () => { refresh(); toast(`${l.fullName}: ${LEAD_STATUS[status]}`); } });

  return <>
    <PageHeading eyebrow="Müştərilər / Leadlər" title="Leadlər" description="Hər lead üçün status, büdcə, rayon və növbəti addım. Unutsanız, sistem xatırladacaq." action={<button type="button" className="button button-primary" onClick={() => setCreating(true)} data-testid="button-add-lead"><Plus size={16} />Lead əlavə et</button>} />
    <div className="rl-toolbar">
      <label className="rl-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Ad, telefon, rayon" aria-label="Lead axtar" /></label>
      <select className="rl-select" value={source} onChange={e => setSource(e.target.value)} aria-label="Mənbə"><option value="">Bütün mənbələr</option>{SOURCES.map(s => <option key={s} value={s}>{SOURCE[s]}</option>)}</select>
      {(agents.data?.length ?? 0) > 0 && <select className="rl-select" value={agent} onChange={e => setAgent(e.target.value)} aria-label="Agent"><option value="">Bütün agentlər</option><option value="none">Təyin olunmayıb</option>{agents.data!.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select>}
      <div className="rl-view-toggle" role="group" aria-label="Görünüş">
        <button type="button" aria-pressed={view === 'board'} className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}><Columns3 size={15} />Lövhə</button>
        <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={15} />Siyahı</button>
      </div>
    </div>
    {leads.isLoading ? <Skeleton rows={3} /> : !leads.data?.length
      ? <Empty icon={<UserPlus size={28} />} title="Hələ lead yoxdur" text="WhatsApp, Instagram, Facebook, sayt və ya telefondan gələn müştəriləri əlavə edin. Pasport səhifəsindən gələn sorğular avtomatik düşür." action={<button type="button" className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} />İlk leadi əlavə et</button>} />
      : view === 'board'
        ? <div className="rl-board">{LEAD_STATUSES.map(st => {
          const col = rows.filter(l => l.status === st);
          return <section key={st} className={`rl-col-board st-${st}`} aria-label={LEAD_STATUS[st]}>
            <header><Pill small tone={LEAD_TONE[st]}>{LEAD_STATUS[st]}</Pill><span>{col.length}</span></header>
            {col.map(l => <LeadCard key={l.id} l={l} onOpen={() => setOpenId(l.id)} onNext={NEXT[l.status] ? () => move(l, NEXT[l.status]) : undefined} />)}
            {!col.length && <p className="rl-col-empty">—</p>}
          </section>;
        })}</div>
        : <div className="surface rl-table-wrap"><table className="rl-table">
          <thead><tr><th>Müştəri</th><th>Mənbə</th><th>Status</th><th>Axtarış</th><th>Növbəti addım</th><th /></tr></thead>
          <tbody>{rows.map(l => <tr key={l.id} onClick={() => setOpenId(l.id)} className={l.overdue ? 'overdue' : ''}>
            <td><strong>{l.fullName}</strong><small>{l.phone}</small></td>
            <td>{SOURCE[l.source]}</td>
            <td><select value={l.status} onClick={e => e.stopPropagation()} onChange={e => move(l, e.target.value)} aria-label="Status">{LEAD_STATUSES.map(s => <option key={s} value={s}>{LEAD_STATUS[s]}</option>)}</select></td>
            <td><small>{[l.dealType ? DEAL_LEAD[l.dealType] : '', l.district, l.rooms != null ? `${l.rooms} otaq` : '', budgetText(l)].filter(Boolean).join(' · ') || '—'}</small></td>
            <td><small className={l.overdue ? 'rl-overdue' : ''}>{l.nextAction || '—'}{l.nextActionAt ? ` · ${relative(l.nextActionAt)}` : ''}</small></td>
            <td><ChevronRight size={15} /></td>
          </tr>)}</tbody>
        </table></div>}
    {open && <LeadDrawer key={open.id} lead={open} onClose={() => setOpenId(null)} onChanged={refresh} />}
    {creating && <NewLeadDrawer onClose={() => setCreating(false)} onCreated={id => { refresh(); setCreating(false); setOpenId(id); }} />}
    <RealtorToaster />
  </>;
}

function LeadCard({ l, onOpen, onNext }: { l: RealtorLead; onOpen: () => void; onNext?: () => void }) {
  return <article className={`rl-lead ${l.overdue ? 'overdue' : ''} ${l.readyForMeeting ? 'ready' : ''}`} data-testid={`card-lead-${l.id}`}>
    <button type="button" className="rl-lead-main" onClick={onOpen}>
      <span className="rl-lead-top"><strong>{l.fullName}</strong><span className={`rl-src-chip src-${l.source}`}>{SOURCE[l.source]}</span></span>
      <small>{[l.dealType ? DEAL_LEAD[l.dealType] : '', l.district, l.rooms != null ? `${l.rooms} otaq` : ''].filter(Boolean).join(' · ') || 'Tələblər qeyd olunmayıb'}</small>
      {budgetText(l) && <small><Wallet size={11} className="sm-ii" /> {budgetText(l)}</small>}
      {l.nextAction && <small className={l.overdue ? 'rl-overdue' : 'rl-next'}><AlarmClock size={11} className="sm-ii" /> {l.nextAction}{l.nextActionAt ? ` · ${relative(l.nextActionAt)}` : ''}</small>}
      {l.botStep && l.botStep !== 'done' && l.botStep !== 'handoff' && <small className="rl-bot"><Bot size={11} className="sm-ii" /> Bot sual verir</small>}
      {l.readyForMeeting && <small className="rl-ready"><CalendarPlus size={11} className="sm-ii" /> Görüşə hazırdır</small>}
    </button>
    {onNext && <button type="button" className="rl-lead-next" onClick={onNext} title={`→ ${LEAD_STATUS[NEXT[l.status]]}`}>{LEAD_STATUS[NEXT[l.status]]}<ArrowRight size={12} /></button>}
  </article>;
}

const leadForm = (l?: RealtorLead) => ({
  fullName: l?.fullName ?? '', phone: l?.phone ?? '', source: (l?.source ?? 'whatsapp') as string, status: (l?.status ?? 'new') as string, dealType: l?.dealType ?? '',
  district: l?.district ?? '', rooms: l?.rooms?.toString() ?? '', budgetMin: l?.budgetMin?.toString() ?? '', budgetMax: l?.budgetMax?.toString() ?? '',
  timeframe: l?.timeframe ?? '', notes: l?.notes ?? '', nextAction: l?.nextAction ?? '', nextActionAt: toLocalInput(l?.nextActionAt), agentId: l?.agentId ?? '', listingId: l?.listingId ?? '',
});
type LeadForm = ReturnType<typeof leadForm>;
const toPayload = (f: LeadForm): RealtorLeadPatch => {
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  return {
    fullName: f.fullName.trim(), phone: f.phone.trim(), source: f.source as RealtorLead['source'], status: f.status as RealtorLead['status'],
    dealType: (f.dealType || null) as 'sale' | null, district: f.district, rooms: n(f.rooms), budgetMin: n(f.budgetMin), budgetMax: n(f.budgetMax),
    timeframe: f.timeframe, notes: f.notes, nextAction: f.nextAction, nextActionAt: fromLocalInput(f.nextActionAt), agentId: f.agentId || null, listingId: f.listingId || null,
  };
};

const NEXT_PRESETS = ['WhatsApp-dan yazacağam', 'Zəng edəcəyəm', 'Elan göndərəcəyəm', 'Görüş planlayacağam'];
/** Baku-time preset: today at `hour` (tomorrow if already past), or tomorrow at `hour`. */
function at(hour: number, dayOffset = 0) {
  const now = new Date();
  const b = new Date(now.getTime() + 4 * 3_600_000);
  b.setUTCDate(b.getUTCDate() + dayOffset); b.setUTCHours(hour, 0, 0, 0);
  let t = new Date(b.getTime() - 4 * 3_600_000);
  if (dayOffset === 0 && t.getTime() < now.getTime() + 15 * 60_000) t = new Date(t.getTime() + 86_400_000);
  return toLocalInput(t.toISOString());
}

function LeadFields({ form, set, simple = false }: { form: LeadForm; set: (k: keyof LeadForm) => (v: string) => void; simple?: boolean }) {
  const agents = useListRealtorAgents();
  const listings = useListRealtorListings();
  const quick = (hours: number) => set('nextActionAt')(toLocalInput(new Date(Date.now() + hours * 3_600_000).toISOString()));
  const [more, setMore] = useState(!simple);
  return <>
    <div className="field-grid">
      <Field label="Müştərinin adı" name="lead-name" required value={form.fullName} onChange={set('fullName')} />
      <Field label="Telefon / WhatsApp" name="lead-phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+994 …" />
    </div>
    <div className="field"><span>Lead mənbəyi</span><div className="rl-seg" role="radiogroup" aria-label="Lead mənbəyi">{SOURCES.map(s => <button key={s} type="button" role="radio" aria-checked={form.source === s} className={form.source === s ? 'on' : ''} onClick={() => set('source')(s)}>{SOURCE[s]}</button>)}</div></div>
    <div className="field"><span>Alqı və ya icarə</span><div className="rl-seg" role="radiogroup" aria-label="Alqı və ya icarə">{[['sale', 'Alqı'], ['rent', 'İcarə'], ['', 'Bilinmir']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={form.dealType === v} className={form.dealType === v ? 'on' : ''} onClick={() => set('dealType')(v)}>{l}</button>)}</div></div>
    <div className="field-grid three">
      <Field label="Rayon" name="lead-district" value={form.district} onChange={set('district')} placeholder="məs. Yasamal" />
      <Field label="Büdcə (maks, AZN)" name="lead-budget-max" type="number" min="0" value={form.budgetMax} onChange={set('budgetMax')} />
      <Field label="Otaq sayı" name="lead-rooms" type="number" min="0" value={form.rooms} onChange={set('rooms')} />
    </div>
    <Field label="Qeyd" name="lead-notes"><textarea value={form.notes} onChange={e => set('notes')(e.target.value)} rows={simple ? 2 : 4} maxLength={4000} /></Field>
    <div className="rl-next-box">
      <div className="field"><span>Növbəti aksiya</span><div className="rl-chips">{NEXT_PRESETS.map(p => <button key={p} type="button" className={form.nextAction === p ? 'on' : ''} onClick={() => set('nextAction')(p)}>{p}</button>)}</div></div>
      <Field label="Və ya öz mətniniz" name="lead-next" value={form.nextAction} onChange={set('nextAction')} placeholder="məs. 3 variant göndər" />
      <Field label="Tarix və vaxt" name="lead-next-at" type="datetime-local" value={form.nextActionAt} onChange={set('nextActionAt')} />
      <div className="rl-chips"><button type="button" onClick={() => set('nextActionAt')(at(18))}>Bu gün 18:00</button><button type="button" onClick={() => set('nextActionAt')(at(10, 1))}>Sabah 10:00</button><button type="button" onClick={() => quick(2)}>2 saat sonra</button><button type="button" onClick={() => quick(72)}>3 gün</button><button type="button" onClick={() => set('nextActionAt')('')}>Təmizlə</button></div>
    </div>
    {!more ? <button type="button" className="sm-link-btn" onClick={() => setMore(true)}>+ Daha çox: büdcə aralığı, vaxt, elan, agent</button> : <>
      <div className="field-grid">
        <Field label="Büdcə, min (AZN)" name="lead-budget-min" type="number" min="0" value={form.budgetMin} onChange={set('budgetMin')} />
        <Field label="Nə vaxt almaq / köçmək istəyir" name="lead-timeframe" value={form.timeframe} onChange={set('timeframe')} placeholder="məs. 1 ay ərzində" />
      </div>
      <div className="field-grid">
        {(agents.data?.length ?? 0) > 0 && <Field label="Agent" name="lead-agent"><select value={form.agentId} onChange={e => set('agentId')(e.target.value)}><option value="">— Özüm —</option>{agents.data!.filter(a => a.active || a.id === form.agentId).map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select></Field>}
        <Field label="Maraqlandığı elan" name="lead-listing"><select value={form.listingId} onChange={e => set('listingId')(e.target.value)}><option value="">—</option>{(listings.data ?? []).map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select></Field>
      </div>
    </>}
  </>;
}

/** "Bu gün 18:00", "Sabah 10:00" or a date. */
function whenText(iso: string | null | undefined) {
  if (!iso) return '';
  const k = dayKey(new Date(iso)); const today = dayKey(new Date()); const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
  return `${k === today ? 'Bu gün' : k === tomorrow ? 'Sabah' : dateTime(iso).split(',')[0]} ${timeText(iso)}`;
}

function NewLeadDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateRealtorLead();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({ ...leadForm(), nextAction: NEXT_PRESETS[0], nextActionAt: at(18) }));
  const [created, setCreated] = useState<RealtorLead | null>(null);
  const set = (k: keyof LeadForm) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const submit = (e: FormEvent) => { e.preventDefault(); const p = toPayload(form); create.mutate({ data: { ...p, fullName: p.fullName!, source: p.source! } }, { onSuccess: l => { setCreated(l); void qc.invalidateQueries({ queryKey: getListRealtorLeadsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() }); } }); };
  if (created) {
    const first = created.fullName.split(' ')[0];
    return <Drawer open onClose={() => onCreated(created.id)} eyebrow="Lead" title="Yeni lead yaradıldı">
      <div className="rl-offer">
        <span className="rl-offer-icon ok"><CheckCircle2 size={26} /></span>
        <h3>{created.fullName}</h3>
        {created.nextAction ? <p className="rl-next-banner"><AlarmClock size={15} /><span><b>Növbəti aksiya:</b> {created.nextActionAt ? `${whenText(created.nextActionAt)} — ` : ''}{created.nextAction}</span></p> : <p>Növbəti aksiya təyin edilməyib.</p>}
        <p className="rl-hint">Vaxtı çatanda sizə bildiriş gələcək.</p>
        {created.phone && <a className="button button-primary full-button rl-wa" href={waUrl(created.phone, `Salam, ${first}! `)} target="_blank" rel="noreferrer"><MessageCircle size={16} />İndi WhatsApp-dan yaz</a>}
        <button type="button" className="button button-secondary full-button" onClick={() => onCreated(created.id)}>Lead-i aç</button>
        <button type="button" className="button button-quiet full-button" onClick={() => { setCreated(null); setForm({ ...leadForm(), nextAction: NEXT_PRESETS[0], nextActionAt: at(18) }); }}><Plus size={15} />Daha bir lead əlavə et</button>
      </div>
    </Drawer>;
  }
  return <Drawer open onClose={onClose} eyebrow="Yeni lead" title="Lead əlavə et" footer={<button type="submit" form="new-lead" className="button button-primary full-button" disabled={create.isPending} data-testid="button-save-lead">{create.isPending && <LoaderCircle className="spin" size={15} />}Lead-i yarat</button>}>
    <form id="new-lead" className="rl-form" onSubmit={submit}><LeadFields form={form} set={set} simple /></form>
  </Drawer>;
}

function LeadDrawer({ lead, onClose, onChanged }: { lead: RealtorLead; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const update = useUpdateRealtorLead();
  const remove = useDeleteRealtorLead();
  const send = useSendRealtorLeadMessage();
  const matches = useListRealtorLeadMatches(lead.id);
  const messages = useListRealtorLeadMessages(lead.id);
  const profile = useGetRealtorProfile();
  const wa = useGetRealtorWhatsapp();
  const [form, setForm] = useState(() => leadForm(lead));
  const [tab, setTab] = useState<'details' | 'whatsapp'>('details');
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof LeadForm) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const connected = wa.data?.mode === 'cloud_api' && wa.data.tokenSet && wa.data.cloudApiAvailable;
  const scripts = leadScripts(lead, profile.data?.fullName || 'realtorunuz', matches.data ?? []);

  const save = (e?: FormEvent) => { e?.preventDefault(); update.mutate({ leadId: lead.id, data: toPayload(form) }, { onSuccess: () => { onChanged(); toast('Lead yadda saxlanıldı'); } }); };
  const setStatus = (status: string) => { setForm(o => ({ ...o, status })); update.mutate({ leadId: lead.id, data: { status: status as RealtorLead['status'] } }, { onSuccess: onChanged }); };
  const sendText = (body: string, kind: 'manual' | 'listing' | 'slots' | 'follow_up' | 'question' = 'manual') => {
    // Open the chat synchronously so mobile browsers do not block the new tab.
    const win = connected ? null : window.open(waUrl(lead.phone, body), '_blank', 'noopener');
    send.mutate({ leadId: lead.id, data: { body, kind } }, {
      onSuccess: r => {
        void qc.invalidateQueries({ queryKey: getListRealtorLeadMessagesQueryKey(lead.id) }); onChanged(); setDraft('');
        if (r.message.status === 'sent') toast('WhatsApp ilə göndərildi');
        else if (r.message.status === 'failed') toast('Göndərilmədi — WhatsApp linki ilə göndərin', r.waLink ? { label: 'Aç', run: () => window.open(r.waLink!, '_blank', 'noopener') } : undefined);
        else if (!win && r.waLink) window.location.href = r.waLink;
      },
    });
  };

  return <Drawer open onClose={onClose} eyebrow={`${SOURCE[lead.source]} · ${relative(lead.createdAt)}`} title={lead.fullName} subtitle={lead.phone || 'Telefon qeyd olunmayıb'}
    footer={<div className="rl-drawer-actions">
      {confirmDelete ? <button type="button" className="button button-danger sm-btn-sm" onClick={() => remove.mutate({ leadId: lead.id }, { onSuccess: () => { onChanged(); onClose(); toast('Lead silindi'); } })}><Trash2 size={13} />Təsdiqlə — sil</button>
        : <button type="button" className="button button-quiet sm-btn-sm" onClick={() => setConfirmDelete(true)}><Trash2 size={13} />Sil</button>}
      {tab === 'details' && <button type="submit" form="lead-form" className="button button-primary" disabled={update.isPending}>{update.isPending && <LoaderCircle className="spin" size={15} />}Yadda saxla</button>}
    </div>}>
    <div className="rl-status-strip" role="group" aria-label="Status">{LEAD_STATUSES.map(s => <button key={s} type="button" className={form.status === s ? `on st-${s}` : ''} onClick={() => setStatus(s)}>{LEAD_STATUS[s]}</button>)}</div>
    <div className="rl-contact-actions">
      {lead.phone && <a className="button button-secondary sm-btn-sm" href={`tel:${lead.phone.replace(/\s/g, '')}`}><Phone size={13} />Zəng</a>}
      {lead.phone && <a className="button button-secondary sm-btn-sm rl-wa" href={waUrl(lead.phone, '')} target="_blank" rel="noreferrer"><MessageCircle size={13} />WhatsApp</a>}
      <button type="button" className="button button-primary sm-btn-sm" onClick={() => setLocation(`/realtor/appointments?new=1&lead=${lead.id}${lead.listingId ? `&listing=${lead.listingId}` : ''}`)}><CalendarPlus size={13} />Görüş planla</button>
    </div>
    <div className="sm-tabs rl-drawer-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'details'} className={`sm-tab ${tab === 'details' ? 'active' : ''}`} onClick={() => setTab('details')}>Məlumat</button>
      <button type="button" role="tab" aria-selected={tab === 'whatsapp'} className={`sm-tab ${tab === 'whatsapp' ? 'active' : ''}`} onClick={() => setTab('whatsapp')}>WhatsApp {messages.data?.length ? `(${messages.data.length})` : ''}</button>
    </div>
    {tab === 'details' ? <>
      <form id="lead-form" className="rl-form" onSubmit={save}><LeadFields form={form} set={set} /></form>
      <section className="rl-matches">
        <div className="eyebrow">Uyğun elanlar</div>
        {matches.isLoading ? <small className="rl-hint">Axtarılır…</small> : matches.data?.length ? matches.data.map(m => <div key={m.id} className="rl-match">
          {m.photos[0] ? <img src={m.photos[0].url} alt="" /> : <span className="rl-match-ph" />}
          <div><strong>{m.title}</strong><small>{facts(m)} · {price(m.price, m.currency)}</small>{m.passportStatus === 'published' && <small className="rl-cert"><ShieldCheck size={11} className="sm-ii" /> Təhvil pasportlu</small>}</div>
        </div>) : <small className="rl-hint">Kriteriyalara uyğun aktiv elan tapılmadı. Rayon, büdcə və otaq sayını dəqiqləşdirin.</small>}
        {(matches.data?.length ?? 0) > 0 && lead.phone && <button type="button" className="button button-secondary sm-btn-sm" onClick={() => { setTab('whatsapp'); setDraft(scripts.find(s => s.kind === 'listing')?.text ?? ''); }}><Send size={13} />WhatsApp ilə göndər</button>}
      </section>
    </> : <section className="rl-wa-panel">
      <p className="rl-hint">{connected ? <><Bot size={13} className="sm-ii" /> WhatsApp Business qoşulub: mesajlar birbaşa göndərilir, bot müştəriyə sualları özü verir.</> : <><MessageCircle size={13} className="sm-ii" /> Mesaj qeydə alınır və WhatsApp-da hazır mətnlə açılır — sadəcə “Göndər” basın. <Link href="/realtor/whatsapp" className="sm-link-btn">Avtomatlaşdırmanı qoş</Link></>}</p>
      <div className="rl-scripts">{scripts.map(s => <button key={s.kind} type="button" onClick={() => setDraft(s.text)}>{s.label}</button>)}</div>
      <textarea className="rl-compose" value={draft} onChange={e => setDraft(e.target.value)} rows={5} placeholder="Mesaj yazın və ya yuxarıdan hazır mətn seçin" maxLength={2000} />
      <button type="button" className="button button-primary full-button rl-wa-send" disabled={!draft.trim() || !lead.phone || send.isPending} onClick={() => sendText(draft.trim(), (scripts.find(s => s.text === draft)?.kind ?? 'manual') as 'manual')}>{send.isPending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{connected ? 'Göndər' : 'WhatsApp-da aç və qeyd et'}</button>
      {!lead.phone && <small className="sm-field-error">Göndərmək üçün telefon nömrəsini əlavə edin.</small>}
      <div className="rl-chat">{(messages.data ?? []).map(m => <div key={m.id} className={`rl-bubble ${m.direction}`}><p>{m.body}</p><small>{dateTime(m.createdAt)} · {m.direction === 'in' ? 'Müştəri' : m.kind === 'manual' ? 'Siz' : 'Avtomatik'}{m.direction === 'out' ? ` · ${m.status === 'sent' ? 'göndərildi' : m.status === 'failed' ? 'xəta' : 'əl ilə'}` : ''}</small></div>)}
        {!messages.data?.length && <small className="rl-hint">Hələ mesaj yoxdur.</small>}</div>
    </section>}
  </Drawer>;
}
