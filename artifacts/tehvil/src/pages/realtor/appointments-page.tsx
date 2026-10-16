import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, LoaderCircle, MapPin, MessageCircle, Plus, Trash2, UserRound } from 'lucide-react';
import {
  getGetRealtorOverviewQueryKey, getListRealtorAppointmentsQueryKey, getListRealtorLeadsQueryKey,
  useCreateRealtorAppointment, useDeleteRealtorAppointment, useGetRealtorWhatsapp, useListRealtorAgents, useListRealtorAppointments,
  useListRealtorLeads, useListRealtorListings, useUpdateRealtorAppointment,
  type RealtorAppointment,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { Empty, Modal, Pill, RealtorToaster, Skeleton, toast } from '@/components/realtor/ui';
import { APPT_STATUS, APPT_TONE, dateText, dayKey, fromLocalInput, timeText, toLocalInput, waUrl } from '@/lib/realtor/labels';

const DAY = 86_400_000;
const WEEKDAYS = ['B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş', 'B'];
/** Monday 00:00 in Baku for the week containing `d`. */
function weekStart(d: Date) {
  const baku = new Date(d.getTime() + 4 * 3_600_000);
  const dow = (baku.getUTCDay() + 6) % 7;
  baku.setUTCHours(0, 0, 0, 0);
  return new Date(baku.getTime() - dow * DAY - 4 * 3_600_000);
}

export function RealtorAppointmentsPage() {
  const appts = useListRealtorAppointments();
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [editing, setEditing] = useState<RealtorAppointment | 'new' | null>(null);
  const [preset, setPreset] = useState<{ leadId?: string; listingId?: string; startsAt?: string }>({});
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('new')) { setPreset({ leadId: p.get('lead') ?? undefined, listingId: p.get('listing') ?? undefined }); setEditing('new'); }
  }, []);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
  const byDay = useMemo(() => {
    const m = new Map<string, RealtorAppointment[]>();
    for (const a of appts.data ?? []) { const k = dayKey(new Date(a.startsAt)); m.set(k, [...(m.get(k) ?? []), a]); }
    return m;
  }, [appts.data]);
  const today = dayKey(new Date());
  const upcoming = (appts.data ?? []).filter(a => a.status === 'planned' && new Date(a.startsAt).getTime() > Date.now() - 3_600_000).slice(0, 12);
  const weekLabel = `${dateText(days[0].toISOString())} — ${dateText(days[6].toISOString())}`;
  const newAt = (d: Date) => { setPreset({ startsAt: new Date(d.getTime() + 11 * 3_600_000 + 4 * 3_600_000 - 4 * 3_600_000).toISOString() }); setEditing('new'); };

  return <>
    <PageHeading eyebrow="Görüşlər" title="Görüş təqvimi" description="Görüş mənzilə, leadə və agentə bağlanır. Müştəriyə WhatsApp xatırlatması gedir." action={<button type="button" className="button button-primary" onClick={() => { setPreset({}); setEditing('new'); }} data-testid="button-add-appointment"><CalendarPlus size={16} />Görüş planla</button>} />
    <div className="rl-week-nav">
      <button type="button" className="icon-button" aria-label="Əvvəlki həftə" onClick={() => setStart(new Date(start.getTime() - 7 * DAY))}><ChevronLeft size={17} /></button>
      <strong>{weekLabel}</strong>
      <button type="button" className="icon-button" aria-label="Növbəti həftə" onClick={() => setStart(new Date(start.getTime() + 7 * DAY))}><ChevronRight size={17} /></button>
      <button type="button" className="button button-quiet sm-btn-sm" onClick={() => setStart(weekStart(new Date()))}>Bu həftə</button>
    </div>
    {appts.isLoading ? <Skeleton rows={2} /> : <div className="rl-week">{days.map((d, i) => {
      const k = dayKey(d);
      const list = byDay.get(k) ?? [];
      return <section key={k} className={`rl-day ${k === today ? 'today' : ''}`}>
        <header><span>{WEEKDAYS[i]}</span><b>{Number(k.slice(8))}</b><button type="button" className="rl-day-add" aria-label={`${k} üçün görüş əlavə et`} onClick={() => newAt(d)}><Plus size={13} /></button></header>
        {list.map(a => <button type="button" key={a.id} className={`rl-appt st-${a.status}`} onClick={() => setEditing(a)}>
          <b>{timeText(a.startsAt)}</b><span>{a.leadName || 'Müştəri'}</span>{a.listingTitle && <small>{a.listingTitle}</small>}
        </button>)}
      </section>;
    })}</div>}
    <section className="surface rl-panel" style={{ marginTop: 20 }}>
      <div className="section-head"><div><div className="eyebrow">Qarşıdakı</div><h2>Həftəlik görüş cədvəli</h2></div></div>
      {upcoming.length ? <div className="rl-list">{upcoming.map(a => <button type="button" key={a.id} className="rl-row" onClick={() => setEditing(a)}>
        <span className="rl-time"><b>{timeText(a.startsAt)}</b><small>{dateText(a.startsAt)}</small></span>
        <span className="rl-row-main"><strong>{a.leadName || 'Müştəri'}</strong><small>{[a.listingTitle, a.listingAddress, a.agentName].filter(Boolean).join(' · ') || '—'}</small></span>
        {a.reminderSentAt ? <Pill small tone="ok" icon={<BellRing size={11} />}>Xatırladıldı</Pill> : <Pill small tone={APPT_TONE[a.status]}>{APPT_STATUS[a.status]}</Pill>}
      </button>)}</div> : <Empty icon={<CalendarClock size={26} />} title="Qarşıda görüş yoxdur" text="Leaddən və ya burdan görüş planlayın." />}
    </section>
    {editing && <AppointmentModal appt={editing === 'new' ? null : editing} preset={preset} onClose={() => setEditing(null)} />}
    <RealtorToaster />
  </>;
}

function AppointmentModal({ appt, preset, onClose }: { appt: RealtorAppointment | null; preset: { leadId?: string; listingId?: string; startsAt?: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const leads = useListRealtorLeads();
  const listings = useListRealtorListings();
  const agents = useListRealtorAgents();
  const wa = useGetRealtorWhatsapp();
  const create = useCreateRealtorAppointment();
  const update = useUpdateRealtorAppointment();
  const remove = useDeleteRealtorAppointment();
  const defaultStart = preset.startsAt ?? new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 3_600_000) * 3_600_000).toISOString();
  const [form, setForm] = useState({
    leadId: appt?.leadId ?? preset.leadId ?? '', listingId: appt?.listingId ?? preset.listingId ?? '', agentId: appt?.agentId ?? '',
    startsAt: toLocalInput(appt?.startsAt ?? defaultStart), durationMin: String(appt?.durationMin ?? 30), status: appt?.status ?? 'planned', notes: appt?.notes ?? '',
  });
  const f = (k: keyof typeof form) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const done = (msg: string) => { for (const k of [getListRealtorAppointmentsQueryKey(), getGetRealtorOverviewQueryKey(), getListRealtorLeadsQueryKey()]) void qc.invalidateQueries({ queryKey: k }); toast(msg); onClose(); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const startsAt = fromLocalInput(form.startsAt);
    if (!startsAt) return;
    const data = { leadId: form.leadId || null, listingId: form.listingId || null, agentId: form.agentId || null, startsAt, durationMin: Number(form.durationMin) || 30, status: form.status as 'planned', notes: form.notes };
    if (appt) update.mutate({ appointmentId: appt.id, data }, { onSuccess: () => done('Görüş yeniləndi') });
    else create.mutate({ data }, { onSuccess: () => done('Görüş planlandı') });
  };
  const lead = leads.data?.find(l => l.id === form.leadId);
  const listing = listings.data?.find(l => l.id === form.listingId);
  const iso = fromLocalInput(form.startsAt);
  const reminder = lead && iso ? (wa.data?.reminderText || 'Salam, {ad}! Xatırlatma: {vaxt} {unvan} ünvanında görüşümüz var. Görüşənədək!')
    .replace('{ad}', lead.fullName.split(' ')[0]).replace('{vaxt}', `${dateText(iso)}, ${timeText(iso)}`).replace('{unvan}', listing ? [listing.district, listing.address].filter(Boolean).join(', ') : 'razılaşdırılmış') : '';
  const pending = create.isPending || update.isPending;
  return <Modal open onClose={onClose} eyebrow={appt ? 'Görüş' : 'Yeni görüş'} title={appt ? `${appt.leadName || 'Müştəri'} · ${timeText(appt.startsAt)}` : 'Görüş planla'} wide footer={<div className="rl-drawer-actions">
    {appt && <button type="button" className="button button-quiet sm-btn-sm" onClick={() => remove.mutate({ appointmentId: appt.id }, { onSuccess: () => done('Görüş silindi') })}><Trash2 size={13} />Sil</button>}
    <button type="submit" form="appt-form" className="button button-primary" disabled={pending} data-testid="button-save-appointment">{pending && <LoaderCircle className="spin" size={15} />}Yadda saxla</button>
  </div>}>
    <form id="appt-form" className="rl-form" onSubmit={submit}>
      <div className="field-grid">
        <Field label="Tarix və saat" name="appt-at" type="datetime-local" required value={form.startsAt} onChange={f('startsAt')} />
        <Field label="Müddət" name="appt-duration"><select value={form.durationMin} onChange={e => f('durationMin')(e.target.value)}>{[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} dəq</option>)}</select></Field>
      </div>
      <div className="field-grid">
        <Field label="Müştəri (lead)" name="appt-lead"><select value={form.leadId} onChange={e => f('leadId')(e.target.value)}><option value="">—</option>{(leads.data ?? []).filter(l => l.status !== 'lost' || l.id === form.leadId).map(l => <option key={l.id} value={l.id}>{l.fullName}{l.phone ? ` · ${l.phone}` : ''}</option>)}</select></Field>
        <Field label="Mənzil" name="appt-listing"><select value={form.listingId} onChange={e => f('listingId')(e.target.value)}><option value="">—</option>{(listings.data ?? []).map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select></Field>
      </div>
      <div className="field-grid">
        <Field label="Realtor / agent" name="appt-agent"><select value={form.agentId} onChange={e => f('agentId')(e.target.value)}><option value="">— Özüm —</option>{(agents.data ?? []).map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select></Field>
        <Field label="Status" name="appt-status"><select value={form.status} onChange={e => f('status')(e.target.value)}>{Object.entries(APPT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <Field label="Qeyd" name="appt-notes"><textarea rows={3} value={form.notes} onChange={e => f('notes')(e.target.value)} maxLength={2000} /></Field>
      {listing && <p className="rl-hint"><MapPin size={12} className="sm-ii" /> {[listing.district, listing.address].filter(Boolean).join(', ')}</p>}
      {lead?.phone && reminder && <div className="rl-reminder">
        <div><BellRing size={15} /><span><b>WhatsApp xatırlatması</b>{wa.data?.mode === 'cloud_api' && wa.data.tokenSet ? ` görüşdən ${wa.data.reminderHoursBefore} saat əvvəl avtomatik göndəriləcək.` : ' — hazır mətni bir kliklə göndərin.'}</span></div>
        <a className="button button-secondary sm-btn-sm rl-wa" href={waUrl(lead.phone, reminder)} target="_blank" rel="noreferrer"><MessageCircle size={13} />İndi göndər</a>
      </div>}
      {appt?.agentName && <p className="rl-hint"><UserRound size={12} className="sm-ii" /> {appt.agentName}</p>}
    </form>
  </Modal>;
}
