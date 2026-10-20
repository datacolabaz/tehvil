import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Show } from '@clerk/react';
import { ArrowRight, BarChart3, Check, ChevronRight, ClipboardCheck, Copy, Home, Link2, LoaderCircle, LogIn, LogOut as LogOutIcon, MessageCircle, Plus, Send, Users } from 'lucide-react';
import {
  useAcceptRentalInvite, useCreateMoveOut, useCreateRental, useCreateRentalInvite, useGetRental, useGetRentalInvite, useGetRentalStats, useListRentals,
  useRevokeRentalInvite, useUpdateRental,
} from '@workspace/api-client-react';
import { Empty, Pill, Skeleton } from '@/components/home/ui';
import { ROLE_LABEL, ROLE_SHORT, STATUS_LABEL, STATUS_TONE, asDetail, dayAz, errorText, money, timeAz, waLink, type Role, type Status } from '@/lib/protocol/model';
import { Review } from '@/pages/protocol/protocol-pages';
import '@/pages/protocol/protocol.css';

const silent = { mutation: { meta: { silent: true } } } as const;
type RRole = 'landlord' | 'tenant' | 'realtor';
const RROLES: RRole[] = ['landlord', 'tenant', 'realtor'];
const RROLE_LABEL: Record<RRole, string> = { landlord: 'Ev sahibi / menecer', tenant: 'Kirayəçi', realtor: 'Rieltor' };
interface RentalDetail {
  rental: { id: string; number: string; address: string; propertyType: string; landlordName: string; landlordPhone: string; tenantName: string; tenantPhone: string; realtorName: string; realtorPhone: string; startDate: string | null; endDate: string | null; monthlyRent: number | null; deposit: number | null; currency: string; notes: string };
  participants: { role: RRole; canEdit: boolean; joinedAt: string; isMe: boolean; isCreator: boolean }[];
  invites: { id: string; role: RRole; canEdit: boolean; createdAt: string; used: boolean; lastOpenedAt: string | null }[];
  protocols: { id: string; number: string; kind: 'move_in' | 'move_out'; status: Status; currentVersion: number; handoverDate: string | null; baseVersion: number | null; decisions: { role: Role; decision: string | null; at: string | null }[]; hasPdf: boolean }[];
  me: { role: RRole | null; isCreator: boolean; canEdit: boolean };
}
const asRental = (x: unknown) => x as RentalDetail;
const here = () => window.location.pathname + window.location.search;
const Status_ = ({ s }: { s: Status | null | undefined }) => (s ? <Pill small tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Pill> : <Pill small tone="neutral">başlanmayıb</Pill>);

/* ================================================================== list (one or many flats) */

export function RentalListPage() {
  const list = useListRentals();
  const [q, setQ] = useState('');
  const items = (list.data ?? []).filter((r) => !q || r.address.toLocaleLowerCase('az').includes(q.toLocaleLowerCase('az')) || r.number.includes(q));
  const active = (list.data ?? []).filter((r) => r.moveIn && !r.moveOut).length;
  return <div className="pt-page">
    <div className="pt-head-row"><h1 className="pt-title">Kirayələr</h1><Link href="/kiraye/yeni" className="button button-primary" data-testid="rental-new"><Plus size={16} />Yeni kirayə</Link></div>
    {list.isLoading ? <Skeleton rows={3} /> : !(list.data ?? []).length
      ? <Empty icon={<Home size={28} />} title="Hələ kirayə qeydi yoxdur" text="Kirayəçi köçməzdən əvvəl mənzilin vəziyyətini otaq-otaq qeydə alın. Çıxışda eyni siyahı ilə müqayisə edəcəksiniz." />
      : <>
        {(list.data ?? []).length > 1 && <div className="rt-summary"><span><b>{list.data!.length}</b> kirayə</span><span><b>{active}</b> davam edir</span><span><b>{list.data!.filter((r) => r.moveOut && ['approved', 'finalized'].includes(r.moveOut)).length}</b> çıxışı tamamlanıb</span></div>}
        {(list.data ?? []).length > 4 && <input className="hp-input rt-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ünvan və ya nömrə ilə axtar" aria-label="Axtar" />}
        <ul className="pt-list">{items.map((r) => <li key={r.id}><Link href={`/kiraye/${r.id}`} data-testid="rental-item">
          <span><b>{r.address}</b><small>№ {r.number} · {ROLE_SHORT[r.myRole as Role] ?? r.myRole} · {dayAz(r.startDate ?? null)} — {dayAz(r.endDate ?? null)}</small>
            <span className="rt-steps"><small>Giriş:</small><Status_ s={r.moveIn as Status} /><small>Çıxış:</small><Status_ s={r.moveOut as Status} /></span></span>
          <ChevronRight size={16} /></Link></li>)}</ul>
      </>}
  </div>;
}

/* ================================================================== new */

export function RentalNewPage() {
  const params = new URLSearchParams(window.location.search);
  const [role, setRole] = useState<RRole>((RROLES.find((r) => r === params.get('rol')) ?? 'landlord'));
  const [f, setF] = useState({ address: '', propertyType: 'apartment', startDate: '', endDate: '', monthlyRent: '', deposit: '', currency: 'AZN', landlordName: '', landlordPhone: '', tenantName: '', tenantPhone: '' });
  const [more, setMore] = useState(false); const [err, setErr] = useState('');
  const create = useCreateRental(silent); const [, go] = useLocation(); const qc = useQueryClient();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v.trim() ? Math.round(Number(v.replace(/\s/g, '').replace(',', '.'))) || null : null);
  const submit = () => {
    setErr('');
    if (f.address.trim().length < 3) return setErr('Mənzilin ünvanını yazın.');
    create.mutate({ data: { role, address: f.address, propertyType: f.propertyType as never, startDate: f.startDate || null, endDate: f.endDate || null, monthlyRent: n(f.monthlyRent), deposit: n(f.deposit), currency: f.currency as never, landlordName: f.landlordName, landlordPhone: f.landlordPhone, tenantName: f.tenantName, tenantPhone: f.tenantPhone } }, {
      onSuccess: (d) => { void qc.invalidateQueries({ queryKey: ['/api/rentals'] }); const r = asRental(d); const mi = r.protocols.find((p) => p.kind === 'move_in'); go(mi ? `/protokol/${mi.id}` : `/kiraye/${r.rental.id}`); },
      onError: (e) => setErr(errorText(e)),
    });
  };
  return <div className="pt-page">
    <h1 className="pt-title">Yeni kirayə</h1>
    <p className="pt-lead">Yalnız ünvan məcburidir. Qalanını indi və ya sonra yazın — giriş protokolu dərhal açılacaq.</p>
    <section className="pt-card"><h2>Bu kirayədə siz kimsiniz?</h2>
      <div className="pt-roles" role="radiogroup">{RROLES.map((r) => <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)} data-testid={`rnew-role-${r}`}>{RROLE_LABEL[r]}</button>)}</div>
    </section>
    <section className="pt-card"><h2>Mənzil</h2>
      <label className="field"><span>Ünvan *</span><input value={f.address} onChange={set('address')} placeholder="Bakı, rayon, küçə, bina, mənzil" data-testid="rnew-address" /></label>
      <label className="field"><span>Növü</span><select value={f.propertyType} onChange={set('propertyType')}><option value="apartment">Mənzil</option><option value="house">Fərdi ev</option><option value="other">Digər</option></select></label>
    </section>
    {!more ? <button type="button" className="sm-link-btn" onClick={() => setMore(true)} data-testid="rnew-more"><Plus size={13} />Tarixlər, kirayə, depozit və tərəflər (məcburi deyil)</button>
      : <><section className="pt-card"><h2>Kirayə şərtləri</h2>
        <div className="pt-two"><label className="field"><span>Başlama tarixi</span><input type="date" value={f.startDate} onChange={set('startDate')} data-testid="rnew-start" /></label><label className="field"><span>Bitmə tarixi</span><input type="date" value={f.endDate} onChange={set('endDate')} /></label></div>
        <div className="pt-two"><label className="field"><span>Aylıq kirayə</span><input inputMode="numeric" value={f.monthlyRent} onChange={set('monthlyRent')} data-testid="rnew-rent" /></label><label className="field"><span>Depozit</span><input inputMode="numeric" value={f.deposit} onChange={set('deposit')} data-testid="rnew-deposit" /></label></div>
        <label className="field"><span>Valyuta</span><select value={f.currency} onChange={set('currency')}><option>AZN</option><option>USD</option><option>EUR</option></select></label>
      </section>
      <section className="pt-card"><h2>Tərəflər</h2>
        <div className="pt-two"><label className="field"><span>Ev sahibi</span><input value={f.landlordName} onChange={set('landlordName')} data-testid="rnew-landlord" /></label><label className="field"><span>Telefon</span><input inputMode="tel" value={f.landlordPhone} onChange={set('landlordPhone')} /></label></div>
        <div className="pt-two"><label className="field"><span>Kirayəçi</span><input value={f.tenantName} onChange={set('tenantName')} data-testid="rnew-tenant" /></label><label className="field"><span>Telefon</span><input inputMode="tel" value={f.tenantPhone} onChange={set('tenantPhone')} data-testid="rnew-tenant-phone" /></label></div>
      </section></>}
    {err && <p className="ai-error pt-err">{err}</p>}
    <div className="pt-bar"><button type="button" className="button button-primary pt-big pt-wide" onClick={submit} disabled={create.isPending} data-testid="rnew-submit">{create.isPending ? <LoaderCircle size={17} className="spin" /> : <ClipboardCheck size={17} />}Kirayə yarat və girişi başlat</button></div>
  </div>;
}

/* ================================================================== rental page */

export function RentalPage({ id }: { id: string }) {
  const q = useGetRental(id, { query: { queryKey: [`/api/rentals/${id}`] } });
  const qc = useQueryClient(); const [, go] = useLocation();
  const moveOut = useCreateMoveOut(silent); const [err, setErr] = useState('');
  if (q.isLoading) return <div className="pt-page"><Skeleton rows={5} /></div>;
  if (!q.data) return <div className="pt-page"><Empty icon={<Home size={28} />} title="Kirayə qeydi tapılmadı" text="Link səhvdir və ya bu kirayədə iştirak etmirsiniz." /></div>;
  const d = asRental(q.data); const r = d.rental;
  const mi = d.protocols.find((p) => p.kind === 'move_in'); const mo = d.protocols.find((p) => p.kind === 'move_out');
  const put = (x: unknown) => qc.setQueryData([`/api/rentals/${id}`], x);
  const card = (p: RentalDetail['protocols'][number], title: string) => <Link href={`/protokol/${p.id}`} className="rt-proto" data-testid={`card-${p.kind}`}>
    <span className="rt-proto-head"><b>{title}</b><Status_ s={p.status} /></span>
    <span className="rt-proto-sub">№ {p.number} · {dayAz(p.handoverDate)}{p.currentVersion ? ` · versiya ${p.currentVersion}` : ''}{p.kind === 'move_out' && p.baseVersion ? ` · giriş versiyası ${p.baseVersion} ilə müqayisə` : ''}</span>
    {p.currentVersion > 0 && <span className="rt-decisions">{p.decisions.map((x) => <span key={x.role} className={x.decision ?? 'wait'} data-testid={`card-${p.kind}-${x.role}`}>{ROLE_LABEL[x.role]}: {x.decision === 'approved' ? 'təsdiqləyib' : x.decision === 'changes' ? 'düzəliş istəyib' : 'təsdiqləməyib'}</span>)}</span>}
    <span className="rt-open">Aç<ArrowRight size={14} /></span>
  </Link>;
  return <div className="pt-page" data-testid="rental-page">
    <Link href="/kiraye" className="pt-back">← Kirayələr</Link>
    <h1 className="pt-title">{r.address}</h1>
    <div className="pt-meta"><span>№ {r.number}</span><span>{dayAz(r.startDate)} — {dayAz(r.endDate)}</span><span>Kirayə: {money(r.monthlyRent, r.currency)}</span><span>Depozit: {money(r.deposit, r.currency)}</span></div>
    <div className="rt-protos">
      {mi ? card(mi, 'Giriş protokolu') : null}
      {mo ? card(mo, 'Çıxış protokolu') : <div className="rt-proto rt-proto-new" data-testid="card-move_out-new">
        <span className="rt-proto-head"><b>Çıxış protokolu</b><Pill small tone="neutral">başlanmayıb</Pill></span>
        <span className="rt-proto-sub">Kirayəçi çıxanda başladın: girişdəki otaqlar, əşyalar və fotolar avtomatik gətirilir, siz yalnız dəyişiklikləri qeyd edirsiniz.{mi && !['approved', 'finalized'].includes(mi.status) ? ' Giriş protokolu hələ hər iki tərəf tərəfindən təsdiqlənməyib — müqayisə təsdiqlənməmiş məzmunla aparılacaq.' : ''}</span>
        {d.me.canEdit && <button type="button" className="button button-primary" disabled={moveOut.isPending} onClick={() => { setErr(''); moveOut.mutate({ rentalId: id }, { onSuccess: (x) => { put(x); const m = asRental(x).protocols.find((p) => p.kind === 'move_out'); if (m) go(`/protokol/${m.id}`); }, onError: (e) => setErr(errorText(e)) }); }} data-testid="start-move-out"><LogOutIcon size={15} />Çıxış protokolunu başlat</button>}
      </div>}
    </div>
    {err && <p className="ai-error pt-err">{err}</p>}
    <RentalParties d={d} put={put} />
    <RentalTerms d={d} put={put} />
  </div>;
}

function RentalParties({ d, put }: { d: RentalDetail; put: (x: unknown) => void }) {
  const r = d.rental; const id = r.id;
  const inv = useCreateRentalInvite(silent); const rev = useRevokeRentalInvite(silent); const qc = useQueryClient();
  const [links, setLinks] = useState<Record<string, string>>({}); const [edit, setEdit] = useState<Record<string, boolean>>({}); const [err, setErr] = useState('');
  const phone: Record<RRole, string> = { landlord: r.landlordPhone, tenant: r.tenantPhone, realtor: r.realtorPhone };
  const name: Record<RRole, string> = { landlord: r.landlordName, tenant: r.tenantName, realtor: r.realtorName };
  const msg = (role: RRole, url: string) => `Salam${name[role] ? `, ${name[role]}` : ''}! ${r.address} ünvanındakı mənzilin kirayə təhvil-təslim protokolu Tehvil.az-da hazırlanır. Baxmaq və təsdiqləmək üçün: ${url}`;
  void put;
  return <section className="pt-card" data-testid="rental-parties">
    <h3><Users size={16} />Tərəflər</h3>
    {RROLES.map((role) => {
      const joined = d.participants.find((x) => x.role === role); const live = d.invites.find((x) => x.role === role); const url = links[role];
      if (role === 'realtor' && !joined && !d.me.isCreator) return null;
      return <div key={role} className="rt-party" data-testid={`rparty-${role}`}>
        <div className="rt-party-head"><b>{RROLE_LABEL[role]}</b><span>{name[role] || '—'} {phone[role]}</span>{joined ? <Pill small tone="ok">{joined.isMe ? 'siz' : 'qoşulub'}{!joined.canEdit ? ' · yalnız baxış' : ''}</Pill> : <Pill small tone="neutral">qoşulmayıb</Pill>}</div>
        {d.me.isCreator && !joined && <div className="pt-invite">
          {url ? <>
            <div className="pt-link" data-testid={`rinvite-url-${role}`}><Link2 size={14} /><span>{url}</span></div>
            <div className="pt-invite-btns"><a className="button button-primary" href={waLink(msg(role, url), phone[role])} target="_blank" rel="noopener noreferrer" data-testid={`rinvite-wa-${role}`}><MessageCircle size={15} />WhatsApp-da göndər</a><button type="button" className="button button-secondary" onClick={() => void navigator.clipboard?.writeText(url)}><Copy size={15} />Kopyala</button></div>
          </> : <>
            <label className="rl-check"><input type="checkbox" checked={!!edit[role]} onChange={(e) => setEdit({ ...edit, [role]: e.target.checked })} data-testid={`rinvite-edit-${role}`} /><span>Foto və qeyd əlavə edə bilsin <small>(işarələnməsə: yalnız baxış və təsdiq)</small></span></label>
            <button type="button" className="button button-secondary" disabled={inv.isPending} onClick={() => { setErr(''); inv.mutate({ rentalId: id, data: { role, canEdit: !!edit[role] } }, { onSuccess: (l) => { setLinks({ ...links, [role]: l.url }); void qc.invalidateQueries({ queryKey: [`/api/rentals/${id}`] }); }, onError: (e) => setErr(errorText(e)) }); }} data-testid={`rinvite-${role}`}><Send size={15} />{live ? 'Yeni dəvət linki' : 'Dəvət linki yarat'}</button>
          </>}
          {live && <p className="rl-hint">Aktiv link ({live.canEdit ? 'redaktə' : 'yalnız baxış'}) {timeAz(live.createdAt)}{live.lastOpenedAt ? ` · son açılış ${timeAz(live.lastOpenedAt)}` : ' · hələ açılmayıb'}. <button type="button" className="sm-link-btn" onClick={() => rev.mutate({ rentalId: id, inviteId: live.id }, { onSuccess: () => { setLinks({ ...links, [role]: '' }); void qc.invalidateQueries({ queryKey: [`/api/rentals/${id}`] }); } })} data-testid={`rinvite-revoke-${role}`}>Ləğv et</button></p>}
        </div>}
      </div>;
    })}
    <p className="rl-hint">Link açmaq heç nəyi təsdiqləmir: tərəf telefonundan daxil olub qoşulur. Linkdən yalnız bir hesab qoşula bilir; yeni link köhnəni ləğv edir.</p>
    {err && <p className="ai-error pt-err">{err}</p>}
  </section>;
}

function RentalTerms({ d, put }: { d: RentalDetail; put: (x: unknown) => void }) {
  const r = d.rental;
  const init = { address: r.address, startDate: r.startDate ?? '', endDate: r.endDate ?? '', monthlyRent: r.monthlyRent?.toString() ?? '', deposit: r.deposit?.toString() ?? '', currency: r.currency, landlordName: r.landlordName, landlordPhone: r.landlordPhone, tenantName: r.tenantName, tenantPhone: r.tenantPhone, realtorName: r.realtorName, realtorPhone: r.realtorPhone, notes: r.notes };
  const [f, setF] = useState(init); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  const upd = useUpdateRental(silent);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v.trim() ? Math.round(Number(v.replace(/\s/g, '').replace(',', '.'))) || null : null);
  const can = d.me.canEdit;
  return <section className="pt-card" data-testid="rental-terms">
    <h3>Kirayə məlumatları</h3>
    <label className="field"><span>Ünvan</span><input value={f.address} disabled={!can} onChange={set('address')} /></label>
    <div className="pt-two"><label className="field"><span>Başlama</span><input type="date" value={f.startDate} disabled={!can} onChange={set('startDate')} /></label><label className="field"><span>Bitmə</span><input type="date" value={f.endDate} disabled={!can} onChange={set('endDate')} /></label></div>
    <div className="pt-two"><label className="field"><span>Aylıq kirayə ({f.currency})</span><input inputMode="numeric" value={f.monthlyRent} disabled={!can} onChange={set('monthlyRent')} /></label><label className="field"><span>Depozit ({f.currency})</span><input inputMode="numeric" value={f.deposit} disabled={!can} onChange={set('deposit')} data-testid="terms-deposit" /></label></div>
    <div className="pt-two"><label className="field"><span>Ev sahibi</span><input value={f.landlordName} disabled={!can} onChange={set('landlordName')} data-testid="terms-landlord" /></label><label className="field"><span>Telefon</span><input inputMode="tel" value={f.landlordPhone} disabled={!can} onChange={set('landlordPhone')} data-testid="terms-landlord-phone" /></label></div>
    <div className="pt-two"><label className="field"><span>Kirayəçi</span><input value={f.tenantName} disabled={!can} onChange={set('tenantName')} data-testid="terms-tenant" /></label><label className="field"><span>Telefon</span><input inputMode="tel" value={f.tenantPhone} disabled={!can} onChange={set('tenantPhone')} data-testid="terms-tenant-phone" /></label></div>
    {d.me.role && <label className="field"><span>Qeydlər</span><textarea className="hp-input" rows={2} value={f.notes} disabled={!can} onChange={set('notes')} /></label>}
    {err && <p className="ai-error pt-err">{err}</p>}
    {can && <button type="button" className="button button-primary" disabled={!dirty || upd.isPending} onClick={() => { setErr(''); upd.mutate({ rentalId: r.id, data: { ...f, monthlyRent: n(f.monthlyRent), deposit: n(f.deposit), startDate: f.startDate || null, endDate: f.endDate || null, currency: f.currency as never } }, { onSuccess: (x) => { put(x); setOk(true); setTimeout(() => setOk(false), 2000); }, onError: (e) => setErr(errorText(e)) }); }} data-testid="terms-save"><Check size={15} />{ok ? 'Yadda saxlanıldı' : 'Yadda saxla'}</button>}
  </section>;
}

/* ================================================================== invitation */

export function RentalInvitePage({ token }: { token: string }) {
  const q = useGetRentalInvite(token, { query: { queryKey: [`/api/rental-invites/${token}`], retry: false } });
  const accept = useAcceptRentalInvite(silent); const [, go] = useLocation(); const [err, setErr] = useState('');
  const detail = useMemo(() => (q.data ? (q.data.detail as unknown as RentalDetail & { protocol: unknown }) : null), [q.data]);
  if (q.isLoading) return <div className="pt-page"><Skeleton rows={4} /></div>;
  if (!q.data || !detail) return <div className="pt-page"><Empty icon={<Link2 size={28} />} title="Link etibarsızdır" text="Link ləğv edilib və ya səhv kopyalanıb. Kirayə qeydini hazırlayandan yeni link istəyin." /></div>;
  const role = q.data.role as RRole; const r = detail.rental; const pd = detail.protocol ? asDetail(detail.protocol) : null;
  const join = () => { setErr(''); accept.mutate({ token }, { onSuccess: (x) => { const rd = asRental(x); const last = rd.protocols[rd.protocols.length - 1]; go(last ? `/protokol/${last.id}?tab=approve` : `/kiraye/${rd.rental.id}`); }, onError: (e) => setErr(errorText(e)) }); };
  return <div className="pt-page pt-public" data-testid="rental-invite-page">
    <div className="pt-brand"><img src="/favicon.svg" alt="" width={26} height={26} />Tehvil.az</div>
    <div className="pt-invite-banner"><ClipboardCheck size={20} /><div><b>Sizi {RROLE_LABEL[role].toLowerCase()} kimi dəvət ediblər</b><span>{r.address} · № {r.number} · {dayAz(r.startDate)} — {dayAz(r.endDate)}</span><span>{q.data.canEdit ? 'Foto və qeyd əlavə edə və təsdiqləyə bilərsiniz.' : 'Protokola baxa və təsdiqləyə bilərsiniz.'}</span></div></div>
    <div className="pt-card"><ul className="pt-plain"><li>Ev sahibi: <b>{r.landlordName || '—'}</b> {r.landlordPhone}</li><li>Kirayəçi: <b>{r.tenantName || '—'}</b> {r.tenantPhone}</li><li>Aylıq kirayə: <b>{money(r.monthlyRent, r.currency)}</b> · Depozit: <b>{money(r.deposit, r.currency)}</b></li></ul>
      <div className="rt-decisions">{detail.protocols.map((p) => <span key={p.id}>{p.kind === 'move_in' ? 'Giriş' : 'Çıxış'}: {STATUS_LABEL[p.status]}</span>)}</div></div>
    {pd && <Review d={pd} />}
    {err && <p className="ai-error pt-err">{err}</p>}
    <div className="pt-bar">
      <Show when="signed-in"><button type="button" className="button button-primary pt-big pt-wide" onClick={join} disabled={accept.isPending} data-testid="rinvite-join">{accept.isPending ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}{q.data.usedByMe ? 'Kirayəyə keç' : `${RROLE_LABEL[role]} kimi qoşul`}</button></Show>
      <Show when="signed-out"><Link href={`/sign-in?redirect=${encodeURIComponent(here())}`} className="button button-primary pt-big pt-wide" data-testid="rinvite-signin"><LogIn size={16} />Təsdiq üçün daxil olun</Link></Show>
    </div>
    <p className="pt-legal">Bu linklə qeydiyyatsız baxmaq olar. Təsdiq hesabınızla, tarix-saat və versiya ilə qeydə alınır; ixtisaslı elektron imza deyil. Hesabat təqsiri və ya depozitin taleyini müəyyən etmir.</p>
  </div>;
}

/* ================================================================== admin */

export function RentalStatsPage() {
  const q = useGetRentalStats({ query: { queryKey: ['/api/admin/rental-stats'], retry: false } });
  if (q.isLoading) return <div className="pt-page"><Skeleton rows={3} /></div>;
  if (!q.data) return <div className="pt-page"><Empty icon={<BarChart3 size={28} />} title="Bu səhifə inzibatçılar üçündür" text="Hesabınızın inzibatçı icazəsi yoxdur." /></div>;
  const s = q.data.stats as Record<string, number> & { weekly: { wk: string; n: number }[]; generatedAt: string };
  const tiles: [string, number, string][] = [['Kirayə qeydi', s.rentals, `son 30 gün: ${s.rentals30d}`], ['Giriş təsdiqə göndərilib', s.moveInSent, ''], ['Giriş tamamlanıb', s.moveInDone, 'hər iki tərəf təsdiqləyib'], ['Çıxış başladılıb', s.moveOutStarted, ''], ['Çıxış tamamlanıb', s.moveOutDone, ''], ['PDF hesabat', s.reports, ''], ['Foto', s.photos, ''], ['İstifadəçi', s.users, `qayıdan: ${s.returning}`], ['Bir neçə mənzilli ev sahibi', s.multiRentalOwners, '']];
  const max = Math.max(1, ...s.weekly.map((w) => w.n));
  return <div className="pt-page" data-testid="stats-page">
    <h1 className="pt-title">Kirayə statistikası</h1>
    <p className="pt-lead">Verilənlər bazasından, {timeAz(s.generatedAt)}. Qayıdan istifadəçi: ən azı iki fərqli gündə protokolla işləyən və ya iki və daha çox kirayədə iştirak edən hesab.</p>
    <div className="rt-tiles">{tiles.map(([t, v, sub]) => <div key={t} className="pt-card rt-tile" data-testid="stat"><small>{t}</small><b>{v}</b>{sub && <span>{sub}</span>}</div>)}</div>
    <div className="pt-card"><h3>Həftəlik yeni kirayələr (12 həftə)</h3>{s.weekly.length ? <ul className="rt-bars">{s.weekly.map((w) => <li key={w.wk}><small>{dayAz(w.wk)}</small><span style={{ width: `${(w.n / max) * 100}%` }} /><b>{w.n}</b></li>)}</ul> : <p className="rl-hint">Hələ məlumat yoxdur.</p>}</div>
  </div>;
}
