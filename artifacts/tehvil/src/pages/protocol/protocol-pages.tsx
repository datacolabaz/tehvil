import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Show } from '@clerk/react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, ClipboardCheck, Copy, Download, FileText, Gauge, History, ImagePlus, KeyRound, Link2,
  LoaderCircle, LogIn, MessageCircle, Plus, RotateCcw, Send, Trash2, Users, X,
} from 'lucide-react';
import {
  useAcceptProtocolInvite, useAddProtocolDefect, useAddProtocolRoom, useCreateProtocol, useCreateProtocolInvite, useCreateProtocolPdf, useDecideProtocol,
  useDeleteProtocolDefect, useDeleteProtocolMedia, useDeleteProtocolRoom, useGetProtocol, useGetProtocolInvite, useListProtocols, useReopenProtocol,
  useRevokeProtocolInvite, useSubmitProtocol, useUpdateProtocol, useUpdateProtocolRoom,
} from '@workspace/api-client-react';
import { Empty, Pill, Skeleton } from '@/components/home/ui';
import {
  CONDITION_LABEL, EVENT_LABEL, KIND_LABEL, METER_LABEL, PROPERTY_LABEL, ROLE_LABEL, ROLE_SHORT, ROOM_KINDS, STAGES, STAGE_LABEL, STAGE_TONE, STATUS_LABEL, STATUS_TONE, asDetail, dayAz, errorText, roomDone, timeAz, waLink,
  type Condition, type Detail, type Extras, type Role, type Stage,
} from '@/lib/protocol/model';
import { PhotoCapture, PhotoGrid } from './photo-capture';
import { RentalReview, RentalRoomView, baselineOf } from './rental-parts';
import './protocol.css';

const silent = { mutation: { meta: { silent: true } } } as const;
const key = (id: string) => [`/api/protocols/${id}`];
const here = () => window.location.pathname + window.location.search;

function Err({ text }: { text: string }) { return text ? <p className="ai-error pt-err" role="alert"><AlertTriangle size={14} />{text}</p> : null; }
/** Six steps from the brief; the current one is highlighted, earlier ones ticked. */
function Stepper({ stage }: { stage: Stage }) {
  const at = STAGES.findIndex(([keys]) => keys.includes(stage));
  return <ol className="pt-stepper-line" aria-label="Protokolun mərhələsi" data-testid="stage">{STAGES.map(([, label], i) => <li key={label} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}><span>{i < at ? '✓' : i + 1}</span><small>{label}</small></li>)}</ol>;
}

function StatusPill({ s }: { s: Detail['protocol']['status'] }) { return <Pill tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Pill>; }

/* ================================================================== new */

export function ProtocolNewPage() {
  const params = new URLSearchParams(window.location.search);
  type SaleRole = 'realtor' | 'seller' | 'buyer';
  const initialRole = (['realtor', 'seller', 'buyer'] as SaleRole[]).find((r) => r === params.get('rol')) ?? 'realtor';
  const [role, setRole] = useState<SaleRole>(initialRole);
  const [f, setF] = useState({ propertyType: 'apartment', address: '', handoverDate: new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10), handoverTime: '', sellerName: '', sellerPhone: '', buyerName: '', buyerPhone: '', realtorName: '', realtorPhone: '', realtorAgency: '' });
  const [err, setErr] = useState('');
  const create = useCreateProtocol(silent);
  const [, go] = useLocation();
  const qc = useQueryClient();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    setErr('');
    if (f.address.trim().length < 3) return setErr('Əmlakın ünvanını yazın.');
    create.mutate({ data: { role, propertyType: f.propertyType as never, address: f.address, handoverDate: f.handoverDate || null, handoverTime: f.handoverTime, sellerName: f.sellerName, sellerPhone: f.sellerPhone, buyerName: f.buyerName, buyerPhone: f.buyerPhone, realtorName: f.realtorName, realtorPhone: f.realtorPhone, realtorAgency: f.realtorAgency } }, {
      onSuccess: (d) => { void qc.invalidateQueries({ queryKey: ['/api/protocols'] }); go(`/protokol/${asDetail(d).protocol.id}`); },
      onError: (e) => setErr(errorText(e)),
    });
  };
  const party = (label: string, n: 'sellerName' | 'buyerName' | 'realtorName', p: 'sellerPhone' | 'buyerPhone' | 'realtorPhone', me: boolean) => <fieldset className="pt-party">
    <legend>{label}{me && <small> · siz</small>}</legend>
    <label className="field"><span>Ad, soyad</span><input value={f[n]} onChange={set(n)} autoComplete={me ? 'name' : 'off'} data-testid={`new-${n}`} /></label>
    <label className="field"><span>Telefon</span><input value={f[p]} onChange={set(p)} inputMode="tel" placeholder="+994 50 000 00 00" autoComplete={me ? 'tel' : 'off'} data-testid={`new-${p}`} /></label>
    {n === 'realtorName' && <label className="field"><span>Agentlik (PDF-də göstərilir)</span><input value={f.realtorAgency} onChange={set('realtorAgency')} autoComplete="organization" data-testid="new-realtorAgency" /></label>}
  </fieldset>;
  return <div className="pt-page">
    <h1 className="pt-title">Yeni təhvil protokolu</h1>
    <p className="pt-lead">Yalnız ünvan məcburidir. Qalanını sonra da əlavə edə bilərsiniz. Pilot mərhələsində pulsuzdur — satıcı, alıcı və rieltor heç nə ödəmir.</p>
    <section className="pt-card">
      <h2>Bu təhvildə siz kimsiniz?</h2>
      <div className="pt-roles" role="radiogroup">{(['seller', 'buyer', 'realtor'] as SaleRole[]).map((r) => <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)} data-testid={`new-role-${r}`}>{ROLE_LABEL[r]}</button>)}</div>
    </section>
    <section className="pt-card">
      <h2>Əmlak</h2>
      <label className="field"><span>Ünvan *</span><input value={f.address} onChange={set('address')} placeholder="Bakı, Yasamal, küçə, bina, mənzil" data-testid="new-address" /></label>
      <div className="pt-two">
        <label className="field"><span>Növü</span><select value={f.propertyType} onChange={set('propertyType')} data-testid="new-type"><option value="apartment">Mənzil</option><option value="house">Fərdi ev</option><option value="other">Digər</option></select></label>
        <label className="field"><span>Təhvil tarixi</span><input type="date" value={f.handoverDate} onChange={set('handoverDate')} data-testid="new-date" /></label>
      </div>
      <label className="field pt-time"><span>Saat (məcburi deyil)</span><input type="time" value={f.handoverTime} onChange={set('handoverTime')} data-testid="new-time" /></label>
    </section>
    <section className="pt-card">
      <h2>Tərəflər</h2>
      {party('Satıcı', 'sellerName', 'sellerPhone', role === 'seller')}
      {party('Alıcı', 'buyerName', 'buyerPhone', role === 'buyer')}
      {party('Rieltor (varsa)', 'realtorName', 'realtorPhone', role === 'realtor')}
    </section>
    <Err text={err} />
    <div className="pt-bar"><button type="button" className="button button-primary pt-big pt-wide" onClick={submit} disabled={create.isPending} data-testid="new-submit">{create.isPending ? <LoaderCircle size={17} className="spin" /> : <ClipboardCheck size={17} />}Protokol yarat</button></div>
  </div>;
}

/* ================================================================== list */

export function ProtocolListPage() {
  const list = useListProtocols();
  return <div className="pt-page">
    <div className="pt-head-row"><h1 className="pt-title">Təhvil protokolları</h1><Link href="/protokol/yeni" className="button button-primary" data-testid="list-new"><Plus size={16} />Yeni protokol</Link></div>
    {list.isLoading ? <Skeleton rows={3} /> : !(list.data ?? []).length
      ? <Empty icon={<ClipboardCheck size={28} />} title="Hələ protokol yoxdur" text="Mənzilin təhvilini telefonla 5–10 dəqiqəyə sənədləşdirin: otaqlar, foto, sayğaclar, açarlar və iki tərəfin təsdiqi." />
      : <ul className="pt-list">{list.data!.map((p) => <li key={p.id}><Link href={`/protokol/${p.id}`} data-testid="list-item">
        <span><b>{p.address}</b><small>№ {p.number} · {ROLE_SHORT[p.myRole as Role] ?? p.myRole} · {dayAz(p.handoverDate ?? null)} · {p.rooms} otaq · {p.photos} foto</small></span>
        {p.stage ? <Pill tone={STAGE_TONE[p.stage as Stage]}>{STAGE_LABEL[p.stage as Stage]}</Pill> : <StatusPill s={p.status as never} />}<ChevronRight size={16} /></Link></li>)}</ul>}
  </div>;
}

/* ================================================================== workspace */

type Tab = 'rooms' | 'extras' | 'parties' | 'approve';
const TABS: [Tab, string, ReactNode][] = [['rooms', 'Otaqlar', <ClipboardCheck size={15} key="r" />], ['extras', 'Sayğac və açarlar', <Gauge size={15} key="e" />], ['parties', 'Tərəflər', <Users size={15} key="p" />], ['approve', 'Təsdiq və PDF', <CheckCircle2 size={15} key="a" />]];

export function ProtocolPage({ id }: { id: string }) {
  const q = useGetProtocol(id, { query: { queryKey: key(id) } });
  const qc = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'rooms');
  const [roomId, setRoomId] = useState<string | null>(params.get('otaq'));
  if (q.isLoading) return <div className="pt-page"><Skeleton rows={5} /></div>;
  if (!q.data) return <div className="pt-page"><Empty icon={<ClipboardCheck size={28} />} title="Protokol tapılmadı" text="Link səhvdir və ya bu protokolda iştirak etmirsiniz." /></div>;
  const d = asDetail(q.data);
  const put = (x: unknown) => qc.setQueryData(key(id), x);
  const p = d.protocol;
  const done = d.rooms.filter((r) => roomDone(d, r)).length;
  const room = roomId ? d.rooms.find((r) => r.id === roomId) : null;
  const nav = (t: Tab, r: string | null = null) => { setTab(t); setRoomId(r); const u = new URL(window.location.href); u.searchParams.set('tab', t); if (r) u.searchParams.set('otaq', r); else u.searchParams.delete('otaq'); window.history.replaceState(null, '', u.pathname + u.search); window.scrollTo(0, 0); };
  return <div className="pt-page" data-testid="protocol-page">
    <div className="pt-top">
      {p.rentalId ? <Link href={`/kiraye/${p.rentalId}`} className="pt-back" data-testid="back-rental"><ArrowLeft size={15} />Kirayə qeydi</Link> : <Link href="/protokollar" className="pt-back"><ArrowLeft size={15} />Protokollar</Link>}
      {p.kind !== 'sale' && <div className={`pt-kind ${p.kind}`} data-testid="protocol-kind">{KIND_LABEL[p.kind]}</div>}
      {p.homeId && <Link href={`/homes/${p.homeId}/tarixce`} className="pt-home-link" data-testid="protocol-home"><ImagePlus size={14} />Bu evin tikinti tarixçəsi</Link>}
      <h1 className="pt-title">{p.address}</h1>
      <div className="pt-meta"><span>№ {p.number}</span><span>{PROPERTY_LABEL[p.propertyType]}</span><span>{dayAz(p.handoverDate)}{p.handoverTime ? `, ${p.handoverTime}` : ''}</span><StatusPill s={p.status} /></div>
      {p.kind === 'sale' && p.stage && <Stepper stage={p.stage} />}
      {!d.me.canEdit && ['awaiting', 'approved', 'finalized'].includes(p.status) && <p className="pt-lock"><Check size={14} />Versiya {p.currentVersion} {p.status === 'awaiting' ? 'təsdiq gözləyir' : 'təsdiqlənib'} — məzmun dəyişdirilmir{d.me.isCreator ? '. Dəyişiklik lazımdırsa, “Təsdiq və PDF” bölməsində redaktəni yenidən açın — yeni versiya yaranacaq.' : '.'}</p>}
    </div>
    <nav className="pt-tabs" role="tablist">{TABS.map(([t, label, icon]) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => nav(t)} data-testid={`tab-${t}`}>{icon}<span>{label}</span>{t === 'rooms' && <small>{done}/{d.rooms.length}</small>}</button>)}</nav>
    {tab === 'rooms' && (room ? (p.kind === 'sale' ? <RoomView key={room.id} d={d} roomId={room.id} put={put} back={() => nav('rooms')} next={(rid) => nav('rooms', rid)} /> : <RentalRoomView key={room.id} d={d} roomId={room.id} put={put} back={() => nav('rooms')} next={(rid) => nav('rooms', rid)} />) : <RoomList d={d} put={put} open={(rid) => nav('rooms', rid)} />)}
    {tab === 'extras' && <ExtrasView d={d} put={put} />}
    {tab === 'parties' && (p.rentalId ? <RentalPartiesNote d={d} /> : <PartiesView d={d} put={put} />)}
    {tab === 'approve' && <ApproveView d={d} put={put} />}
  </div>;
}

function RoomList({ d, put, open }: { d: Detail; put: (x: unknown) => void; open: (id: string) => void }) {
  const add = useAddProtocolRoom(silent);
  const [name, setName] = useState(''); const [kind, setKind] = useState('other'); const [err, setErr] = useState('');
  return <section className="pt-section">
    <ul className="pt-rooms">{d.rooms.map((r) => {
      const its = d.items.filter((x) => x.roomId === r.id);
      const photos = d.media.filter((m) => m.roomId === r.id || its.some((x) => x.id === m.itemId)).length, defects = d.defects.filter((x) => x.roomId === r.id).length, ok = roomDone(d, r);
      const sub = d.protocol.kind === 'sale' ? `${r.condition ? CONDITION_LABEL[r.condition] : 'yoxlanmayıb'} · ${photos} foto${defects ? ` · ${defects} qüsur` : ''}`
        : `${its.filter((x) => x.condition).length}/${its.length} element · ${photos} foto${its.some((x) => x.condition === 'defective') ? ' · zədə var' : ''}${d.protocol.kind === 'move_out' && its.some((x) => x.change && x.change !== 'unchanged') ? ' · dəyişiklik var' : ''}`;
      return <li key={r.id}><button type="button" onClick={() => open(r.id)} className={ok ? 'done' : ''} data-testid="room-card">
        <span className="pt-room-check">{ok ? <Check size={15} /> : null}</span>
        <span className="pt-room-txt"><b>{r.name}</b><small>{sub}</small></span><ChevronRight size={17} />
      </button></li>;
    })}</ul>
    {d.me.canEdit && <form className="pt-add-room" onSubmit={(e) => { e.preventDefault(); setErr(''); add.mutate({ protocolId: d.protocol.id, data: { name, kind: kind as never } }, { onSuccess: (x) => { put(x); setName(''); }, onError: (e2) => setErr(errorText(e2)) }); }}>
      <input className="hp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Əlavə otaq (məs. Uşaq otağı)" aria-label="Otağın adı" data-testid="room-add-name" />
      <select className="hp-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Otağın növü">{ROOM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <button type="submit" className="button button-secondary" disabled={!name.trim() || add.isPending} data-testid="room-add"><Plus size={15} />Əlavə et</button>
    </form>}
    <Err text={err} />
  </section>;
}

function RoomView({ d, roomId, put, back, next }: { d: Detail; roomId: string; put: (x: unknown) => void; back: () => void; next: (id: string) => void }) {
  const r = d.rooms.find((x) => x.id === roomId)!;
  const pid = d.protocol.id;
  const upd = useUpdateProtocolRoom(silent); const del = useDeleteProtocolRoom(silent);
  const addDefect = useAddProtocolDefect(silent); const delDefect = useDeleteProtocolDefect(silent); const delMedia = useDeleteProtocolMedia(silent);
  const [note, setNote] = useState(r.note); const [defect, setDefect] = useState(''); const [err, setErr] = useState('');
  const can = d.me.canEdit;
  const i = d.rooms.findIndex((x) => x.id === roomId); const after = d.rooms[i + 1];
  const fail = (e: unknown) => setErr(errorText(e));
  const setCond = (c: Condition) => upd.mutate({ protocolId: pid, roomId, data: { condition: c } }, { onSuccess: put, onError: fail });
  const saveNote = () => { if (note !== r.note) upd.mutate({ protocolId: pid, roomId, data: { note } }, { onSuccess: put, onError: fail }); };
  const roomPhotos = d.media.filter((m) => m.target === 'room' && m.roomId === roomId);
  const defects = d.defects.filter((x) => x.roomId === roomId);
  const delPhoto = can ? (m: { id: string }) => delMedia.mutate({ protocolId: pid, mediaId: m.id }, { onSuccess: put, onError: fail }) : undefined;
  return <section className="pt-section" data-testid="room-view">
    <button type="button" className="pt-back" onClick={back}><ArrowLeft size={15} />Otaqlar</button>
    <h2 className="pt-room-title">{r.name}</h2>
    <div className="pt-cond" role="radiogroup" aria-label="Ümumi vəziyyət">{(['good', 'fair', 'defective'] as Condition[]).map((c) => <button key={c} type="button" role="radio" aria-checked={r.condition === c} disabled={!can} className={`${c} ${r.condition === c ? 'on' : ''}`} onClick={() => setCond(c)} data-testid={`cond-${c}`}>{CONDITION_LABEL[c]}</button>)}</div>
    <label className="field"><span>Qısa qeyd</span><textarea className="hp-input" rows={2} value={note} disabled={!can} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} placeholder={r.condition === 'defective' ? 'Nə qüsurludur?' : 'Məcburi deyil'} data-testid="room-note" /></label>
    <h3>Fotolar <small>{roomPhotos.length}</small></h3>
    <PhotoGrid media={roomPhotos} onDelete={delPhoto} testId="room-photos" />
    {can && <PhotoCapture protocolId={pid} target={{ target: 'room', roomId }} onSaved={put} testId="room-capture" />}
    <h3>Qüsurlar <small>{defects.length}</small></h3>
    {defects.length > 0 && <ul className="pt-defects">{defects.map((x) => <li key={x.id} data-testid="defect">
      <div className="pt-defect-row"><span>{x.text}</span>{can && <button type="button" className="icon-button" aria-label="Qüsuru sil" onClick={() => delDefect.mutate({ protocolId: pid, defectId: x.id }, { onSuccess: put, onError: fail })}><Trash2 size={14} /></button>}</div>
      <PhotoGrid media={d.media.filter((m) => m.defectId === x.id)} onDelete={delPhoto} />
      {can && <PhotoCapture compact protocolId={pid} target={{ target: 'defect', defectId: x.id }} onSaved={put} />}
    </li>)}</ul>}
    {can && <form className="pt-inline" onSubmit={(e) => { e.preventDefault(); setErr(''); addDefect.mutate({ protocolId: pid, data: { roomId, text: defect } }, { onSuccess: (x) => { put(x); setDefect(''); }, onError: fail }); }}>
      <input className="hp-input" value={defect} onChange={(e) => setDefect(e.target.value)} placeholder="Qüsur əlavə et: məs. divarda çat" aria-label="Qüsur" data-testid="defect-text" />
      <button type="submit" className="button button-secondary" disabled={!defect.trim() || addDefect.isPending} data-testid="defect-add"><Plus size={15} />Qeyd et</button>
    </form>}
    <Err text={err} />
    {can && <button type="button" className="sm-link-btn pt-remove" onClick={() => del.mutate({ protocolId: pid, roomId }, { onSuccess: (x) => { put(x); back(); }, onError: fail })}><Trash2 size={13} />Bu otaq yoxdur — sil</button>}
    <div className="pt-bar">{after ? <button type="button" className="button button-primary pt-big pt-wide" onClick={() => next(after.id)} data-testid="room-next">Növbəti: {after.name}<ArrowRight size={16} /></button>
      : <button type="button" className="button button-primary pt-big pt-wide" onClick={back} data-testid="room-done"><Check size={16} />Otaqlar hazırdır</button>}</div>
  </section>;
}

function ExtrasView({ d, put }: { d: Detail; put: (x: unknown) => void }) {
  const [x, setX] = useState<Extras>(d.protocol.extras);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const upd = useUpdateProtocol(silent); const delMedia = useDeleteProtocolMedia(silent);
  const can = d.me.canEdit; const pid = d.protocol.id;
  const dirty = JSON.stringify(x) !== JSON.stringify(d.protocol.extras);
  const save = () => { setErr(''); upd.mutate({ protocolId: pid, data: { extras: x } }, { onSuccess: (r) => { put(r); setX(asDetail(r).protocol.extras); setMsg('Yadda saxlanıldı'); setTimeout(() => setMsg(''), 2500); }, onError: (e) => setErr(errorText(e)) }); };
  const delPhoto = can ? (m: { id: string }) => delMedia.mutate({ protocolId: pid, mediaId: m.id }, { onSuccess: put }) : undefined;
  const base = baselineOf(d);
  return <section className="pt-section" data-testid="extras-view">
    {(['water', 'gas', 'electric'] as const).map((k) => <div key={k} className={`pt-card pt-meter ${x.meters[k].na ? 'na' : ''}`}>
      <h3>{METER_LABEL[k]}</h3>
      <label className="rl-check pt-na"><input type="checkbox" checked={!!x.meters[k].na} disabled={!can} onChange={(e) => setX({ ...x, meters: { ...x.meters, [k]: { ...x.meters[k], na: e.target.checked, value: e.target.checked ? '' : x.meters[k].value } } })} data-testid={`meter-${k}-na`} /><span>Bu mənzildə yoxdur (tətbiq edilmir)</span></label>
      {!x.meters[k].na && <><div className="pt-two">
        <label className="field"><span>Göstərici{base.b && <small className="pt-was" data-testid={`meter-${k}-before`}> · girişdə: {base.b.meters.find((m) => m.kind === k)?.value || '—'}</small>}</span><input inputMode="decimal" value={x.meters[k].value} disabled={!can} onChange={(e) => setX({ ...x, meters: { ...x.meters, [k]: { ...x.meters[k], value: e.target.value } } })} data-testid={`meter-${k}`} /></label>
        <label className="field"><span>Qeyd</span><input value={x.meters[k].note} disabled={!can} onChange={(e) => setX({ ...x, meters: { ...x.meters, [k]: { ...x.meters[k], note: e.target.value } } })} placeholder="Yeri, nömrəsi" /></label>
      </div>
      <PhotoGrid media={d.media.filter((m) => m.target === 'meter' && m.meterKind === k)} onDelete={delPhoto} />
      {can && <PhotoCapture compact protocolId={pid} target={{ target: 'meter', meterKind: k }} onSaved={put} testId={`meter-${k}-capture`} />}</>}
    </div>)}
    <div className="pt-card">
      <h3><KeyRound size={16} />Açarlar və giriş vasitələri</h3>
      {x.keys.map((k, i) => <div key={i} className="pt-key">
        <span className="pt-key-name"><input className="hp-input" value={k.kind} disabled={!can} onChange={(e) => setX({ ...x, keys: x.keys.map((y, j) => (j === i ? { ...y, kind: e.target.value } : y)) })} aria-label="Açarın növü" data-testid="key-kind" />{base.b && <small className="pt-was">girişdə verilib: {base.b.keys.find((y) => y.kind.trim() === k.kind.trim())?.count ?? 0}</small>}</span>
        <div className="pt-stepper"><button type="button" disabled={!can || k.count <= 0} onClick={() => setX({ ...x, keys: x.keys.map((y, j) => (j === i ? { ...y, count: y.count - 1 } : y)) })} aria-label="Azalt">−</button><b data-testid="key-count">{k.count}</b><button type="button" disabled={!can} onClick={() => setX({ ...x, keys: x.keys.map((y, j) => (j === i ? { ...y, count: y.count + 1 } : y)) })} aria-label="Artır" data-testid="key-plus">+</button></div>
        {can && <button type="button" className="icon-button" aria-label="Sil" onClick={() => setX({ ...x, keys: x.keys.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
      </div>)}
      {can && <button type="button" className="sm-link-btn" onClick={() => setX({ ...x, keys: [...x.keys, { kind: '', count: 1 }] })} data-testid="key-add"><Plus size={13} />Açar / pult / kart əlavə et</button>}
      <PhotoGrid media={d.media.filter((m) => m.target === 'keys')} onDelete={delPhoto} />
      {can && <PhotoCapture compact protocolId={pid} target={{ target: 'keys' }} onSaved={put} />}
    </div>
    <div className="pt-card">
      <h3>Digər qeydlər</h3>
      <textarea className="hp-input" rows={3} value={x.notes} disabled={!can} onChange={(e) => setX({ ...x, notes: e.target.value })} placeholder="Qalan əşyalar, razılaşmalar və s." data-testid="extras-notes" />
    </div>
    <Err text={err} />
    {can && <div className="pt-bar"><button type="button" className="button button-primary pt-big pt-wide" onClick={save} disabled={!dirty || upd.isPending} data-testid="extras-save">{upd.isPending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{msg || (dirty ? 'Yadda saxla' : 'Yadda saxlanılıb')}</button></div>}
  </section>;
}

function PartiesView({ d, put }: { d: Detail; put: (x: unknown) => void }) {
  const p = d.protocol; const pid = p.id;
  const [f, setF] = useState({ address: p.address, propertyType: p.propertyType, handoverDate: p.handoverDate ?? '', handoverTime: p.handoverTime ?? '', sellerName: p.sellerName, sellerPhone: p.sellerPhone, buyerName: p.buyerName, buyerPhone: p.buyerPhone, realtorName: p.realtorName, realtorPhone: p.realtorPhone, realtorAgency: p.realtorAgency ?? '' });
  const [err, setErr] = useState(''); const [links, setLinks] = useState<Record<string, string>>({});
  const upd = useUpdateProtocol(silent); const inv = useCreateProtocolInvite(silent); const rev = useRevokeProtocolInvite(silent);
  const qc = useQueryClient();
  const can = d.me.canEdit;
  const dirty = JSON.stringify(f) !== JSON.stringify({ address: p.address, propertyType: p.propertyType, handoverDate: p.handoverDate ?? '', handoverTime: p.handoverTime ?? '', sellerName: p.sellerName, sellerPhone: p.sellerPhone, buyerName: p.buyerName, buyerPhone: p.buyerPhone, realtorName: p.realtorName, realtorPhone: p.realtorPhone, realtorAgency: p.realtorAgency ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const phoneOf: Record<Role, string> = { seller: p.sellerPhone, buyer: p.buyerPhone, realtor: p.realtorPhone, landlord: p.landlordPhone, tenant: p.tenantPhone };
  const nameOf: Record<Role, string> = { seller: p.sellerName, buyer: p.buyerName, realtor: p.realtorName, landlord: p.landlordName, tenant: p.tenantName };
  const invite = (role: Role) => inv.mutate({ protocolId: pid, data: { role: role as 'seller' } }, { onSuccess: (l) => { setLinks({ ...links, [role]: l.url }); void qc.invalidateQueries({ queryKey: key(pid) }); }, onError: (e) => setErr(errorText(e)) });
  const message = (role: Role, url: string) => `Salam${nameOf[role] ? `, ${nameOf[role]}` : ''}! ${p.address} ünvanındakı mənzilin açar təhvili protokolu Tehvil.az-da hazırlanır. Baxmaq və təsdiqləmək üçün (pulsuzdur): ${url}`;
  return <section className="pt-section" data-testid="parties-view">
    <div className="pt-card">
      <h3>Əmlak</h3>
      <label className="field"><span>Ünvan</span><input value={f.address} disabled={!can} onChange={set('address')} /></label>
      <div className="pt-two"><label className="field"><span>Növü</span><select value={f.propertyType} disabled={!can} onChange={set('propertyType')}><option value="apartment">Mənzil</option><option value="house">Fərdi ev</option><option value="other">Digər</option></select></label>
        <label className="field"><span>Təhvil tarixi</span><input type="date" value={f.handoverDate} disabled={!can} onChange={set('handoverDate')} /></label></div>
      <label className="field pt-time"><span>Saat</span><input type="time" value={f.handoverTime} disabled={!can} onChange={set('handoverTime')} data-testid="party-time" /></label>
    </div>
    {(['seller', 'buyer', 'realtor'] as Role[]).map((role) => {
      const joined = d.participants.find((x) => x.role === role);
      const live = d.invites.find((x) => x.role === role);
      const url = links[role];
      const n = (role + 'Name') as 'sellerName', ph = (role + 'Phone') as 'sellerPhone';
      return <div key={role} className="pt-card" data-testid={`party-${role}`}>
        <h3>{ROLE_LABEL[role]}{joined ? <Pill small tone="ok">{joined.isMe ? 'siz' : 'qoşulub'}</Pill> : <Pill small tone="neutral">qoşulmayıb</Pill>}</h3>
        <div className="pt-two"><label className="field"><span>Ad, soyad</span><input value={f[n]} disabled={!can} onChange={set(n)} data-testid={`party-${role}-name`} /></label>
          <label className="field"><span>Telefon</span><input value={f[ph]} disabled={!can} inputMode="tel" onChange={set(ph)} /></label></div>
        {role === 'realtor' && <label className="field"><span>Agentlik (PDF-də göstərilir)</span><input value={f.realtorAgency} disabled={!can} onChange={set('realtorAgency')} data-testid="party-realtor-agency" /></label>}
        {role === 'realtor' && <p className="rl-hint">Rieltor protokolu hazırlaya və tərəfləri dəvət edə bilər; onun təsdiqi satıcının və ya alıcının təsdiqini əvəz etmir.</p>}
        {d.me.isCreator && !joined && <div className="pt-invite">
          {url ? <>
            <div className="pt-link" data-testid={`invite-url-${role}`}><Link2 size={14} /><span>{url}</span></div>
            <div className="pt-invite-btns">
              <a className="button button-primary" href={waLink(message(role, url), phoneOf[role])} target="_blank" rel="noopener noreferrer" data-testid={`invite-wa-${role}`}><MessageCircle size={15} />WhatsApp-da göndər</a>
              <button type="button" className="button button-secondary" onClick={() => void navigator.clipboard?.writeText(url)}><Copy size={15} />Kopyala</button>
            </div>
          </> : <button type="button" className="button button-secondary" onClick={() => invite(role)} disabled={inv.isPending} data-testid={`invite-${role}`}><Send size={15} />{live ? 'Yeni dəvət linki' : 'Dəvət linki yarat'}</button>}
          {live && <p className="rl-hint">{live.expired ? 'Linkin müddəti bitib — yeni link yaradın. ' : `Aktiv link ${timeAz(live.createdAt)} yaradılıb${live.expiresAt ? `, ${dayAz(live.expiresAt.slice(0, 10))} tarixinədək etibarlıdır` : ''}`}{live.lastOpenedAt ? ` · son açılış ${timeAz(live.lastOpenedAt)}` : ' · hələ açılmayıb'}. <button type="button" className="sm-link-btn" onClick={() => rev.mutate({ protocolId: pid, inviteId: live.id }, { onSuccess: () => { setLinks({ ...links, [role]: '' }); void qc.invalidateQueries({ queryKey: key(pid) }); } })} data-testid={`invite-revoke-${role}`}>Linki ləğv et</button></p>}
          <p className="rl-hint">Link yalnız protokola baxmağa imkan verir. Təsdiq üçün tərəf telefonundan daxil olur; yeni link köhnəsini ləğv edir.</p>
        </div>}
      </div>;
    })}
    <Err text={err} />
    {can && <div className="pt-bar"><button type="button" className="button button-primary pt-big pt-wide" disabled={!dirty || upd.isPending} onClick={() => { setErr(''); upd.mutate({ protocolId: pid, data: { ...f, propertyType: f.propertyType as never, handoverDate: f.handoverDate || null } }, { onSuccess: put, onError: (e) => setErr(errorText(e)) }); }} data-testid="parties-save"><Check size={16} />{dirty ? 'Yadda saxla' : 'Yadda saxlanılıb'}</button></div>}
  </section>;
}

/** Everything a party approves, in the order of the PDF. */
export function Review({ d }: { d: Detail }) {
  if (d.protocol.kind !== 'sale') return <RentalReview d={d} />;
  const x = d.protocol.extras;
  const meters = (['water', 'gas', 'electric'] as const).filter((k) => x.meters[k].na || x.meters[k].value || d.media.some((m) => m.meterKind === k));
  const keys = x.keys.filter((k) => k.kind.trim() && k.count > 0);
  return <div className="pt-review" data-testid="review">
    {d.rooms.map((r) => { const defects = d.defects.filter((y) => y.roomId === r.id); return <div key={r.id} className="pt-rv-room">
      <div className="pt-rv-head"><b>{r.name}</b>{r.condition ? <span className={`pt-chip ${r.condition}`}>{CONDITION_LABEL[r.condition]}</span> : <span className="pt-chip">qeyd edilməyib</span>}</div>
      {r.note && <p>{r.note}</p>}
      {defects.length > 0 && <ul className="pt-rv-defects">{defects.map((y) => <li key={y.id}>{y.text}<PhotoGrid media={d.media.filter((m) => m.defectId === y.id)} /></li>)}</ul>}
      <PhotoGrid media={d.media.filter((m) => m.target === 'room' && m.roomId === r.id)} />
    </div>; })}
    <div className="pt-rv-room"><div className="pt-rv-head"><b>Sayğaclar</b></div>{meters.length ? <ul>{meters.map((k) => <li key={k}>{METER_LABEL[k]}: <b>{x.meters[k].na ? 'tətbiq edilmir' : x.meters[k].value || '—'}</b>{x.meters[k].note ? ` · ${x.meters[k].note}` : ''}<PhotoGrid media={d.media.filter((m) => m.meterKind === k)} /></li>)}</ul> : <p className="rl-hint">Daxil edilməyib</p>}</div>
    <div className="pt-rv-room"><div className="pt-rv-head"><b>Açarlar</b></div>{keys.length ? <ul>{keys.map((k, i) => <li key={i}>{k.kind}: <b>{k.count}</b></li>)}</ul> : <p className="rl-hint">Daxil edilməyib</p>}<PhotoGrid media={d.media.filter((m) => m.target === 'keys')} /></div>
    {x.notes && <div className="pt-rv-room"><div className="pt-rv-head"><b>Digər qeydlər</b></div><p>{x.notes}</p></div>}
  </div>;
}

function ApproveView({ d, put }: { d: Detail; put: (x: unknown) => void }) {
  const p = d.protocol; const pid = p.id;
  const submit = useSubmitProtocol(silent); const reopen = useReopenProtocol(silent); const decide = useDecideProtocol(silent); const pdf = useCreateProtocolPdf(silent);
  const [comment, setComment] = useState(''); const [asking, setAsking] = useState(false); const [err, setErr] = useState('');
  const fail = (e: unknown) => setErr(errorText(e));
  const cur = d.me.current;
  const decisions = d.approvals.filter((a) => a.version === p.currentVersion);
  const done = d.rooms.filter((r) => roomDone(d, r)).length;
  const deciders = (d.deciders?.length ? d.deciders : ['seller', 'buyer']) as Role[];
  const rental = p.kind !== 'sale';
  const checks = [
    { ok: d.rooms.length > 0 && done === d.rooms.length, text: rental ? `Bütün otaqlarda elementlərin vəziyyəti qeyd olunub (${done}/${d.rooms.length})` : `Otaqlar yoxlanılıb (${done}/${d.rooms.length})`, soft: true },
    { ok: rental ? !!p.landlordName.trim() && !!p.tenantName.trim() : !!p.sellerName.trim() && !!p.buyerName.trim(), text: rental ? 'Ev sahibinin və kirayəçinin adı yazılıb (kirayə səhifəsində)' : 'Satıcının və alıcının adı yazılıb', soft: false },
    { ok: deciders.every((r) => d.participants.some((x) => x.role === r)), text: rental ? 'Ev sahibi və kirayəçi qoşulub (təsdiq üçün lazımdır)' : 'Satıcı və alıcı protokola qoşulub (təsdiq üçün lazımdır)', soft: true },

    ...(rental ? [] : [
      { ok: (['water', 'gas', 'electric'] as const).every((k) => p.extras.meters[k].na || !!p.extras.meters[k].value.trim()), text: 'Sayğaclar: göstərici yazılıb və ya “tətbiq edilmir” seçilib', soft: true },
      { ok: p.extras.keys.some((k) => k.kind.trim() && k.count > 0), text: 'Təhvil verilən açarların sayı qeyd olunub', soft: true },
    ]),
  ];
  const latest = d.versions[0];
  const asked = ['draft', 'collecting'].includes(p.status) ? d.approvals.filter((x) => x.version === p.currentVersion && x.decision === 'changes') : [];
  return <section className="pt-section" data-testid="approve-view">
    {asked.map((x) => <div key={x.role} className="pt-card pt-changes" data-testid="changes-requested"><h3><RotateCcw size={16} />{ROLE_LABEL[x.role]} düzəliş istəyib · versiya {x.version}</h3><p>“{x.comment}”</p><small>{timeAz(x.createdAt)} — düzəldib yenidən təsdiqə göndərin; yeni versiya yaranacaq.</small></div>)}
    {['draft', 'collecting'].includes(p.status) && <div className="pt-card">
      <h3>Təsdiqə göndərmək</h3>
      <ul className="pt-checks">{checks.map((c) => <li key={c.text} className={c.ok ? 'ok' : c.soft ? 'soft' : 'bad'}>{c.ok ? <Check size={14} /> : <AlertTriangle size={14} />}{c.text}</li>)}</ul>
      <details className="pt-preview-all" data-testid="preview-all"><summary>Göndəriləcək məzmuna baxın</summary><Review d={d} /></details>
      {d.me.isCreator ? <><p className="rl-hint">Göndərəndən sonra məzmun versiya {p.currentVersion + 1} kimi dondurulur və dəyişdirilmir. Tərəflər eyni versiyanı yoxlayıb təsdiqləyir.</p>
        <button type="button" className="button button-primary pt-big pt-wide" disabled={submit.isPending || !checks[1].ok} onClick={() => { setErr(''); submit.mutate({ protocolId: pid }, { onSuccess: put, onError: fail }); }} data-testid="submit">{submit.isPending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}Təsdiqə göndər</button></>
        : <p className="rl-hint">Protokolu yaradan məlumatları tamamlayıb təsdiqə göndərəndə burada təsdiq edə biləcəksiniz.</p>}
    </div>}

    {p.status !== 'draft' && p.status !== 'collecting' && cur && <div className="pt-card" data-testid="version-card">
      <h3>Versiya {cur.version} <StatusPill s={p.status} /></h3>
      <div className="pt-parties">{deciders.map((role) => { const a = decisions.find((x) => x.role === role); return <div key={role} className={a ? a.decision : 'wait'} data-testid={`decision-${role}`}>
        <b>{ROLE_LABEL[role]}</b><span>{a ? (a.decision === 'approved' ? `Təsdiqləyib · ${timeAz(a.createdAt)}` : `Düzəliş istəyib · ${timeAz(a.createdAt)}`) : 'Hələ təsdiqləməyib'}</span>{a?.comment && <small>“{a.comment}”</small>}
      </div>; })}</div>
      <p className="rl-hint pt-hash">Məzmun izi: <code>{cur.contentHash.slice(0, 16)}…</code>{(() => { const vv = d.versions.find((x) => x.version === cur.version); return vv?.manifestHash ? <> · manifest: <code>{vv.manifestHash.slice(0, 16)}…</code>{vv.verifyCode && <> · <a href={`/v/${vv.verifyCode}`} target="_blank" rel="noopener noreferrer" data-testid="verify-link">Yoxlama səhifəsi</a></>}</> : null; })()}</p>
    </div>}

    {d.me.canDecide && cur && <div className="pt-card pt-decide" data-testid="decide">
      <h3>Protokolu yoxlayın</h3>
      <p className="rl-hint">Aşağıda versiya {cur.version}-in bütün məzmunu var. Təsdiq etdikdən sonra bu versiya dəyişdirilmir.</p>
      <Review d={d} />
      {asking ? <>
        <label className="field"><span>Nə düzəldilməlidir?</span><textarea className="hp-input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="decide-comment" /></label>
        <div className="pt-decide-btns"><button type="button" className="button button-secondary pt-big" onClick={() => setAsking(false)}><X size={16} />Geri</button>
          <button type="button" className="button button-primary pt-big" disabled={!comment.trim() || decide.isPending} onClick={() => decide.mutate({ protocolId: pid, data: { version: cur.version, contentHash: cur.contentHash, decision: 'changes', comment } }, { onSuccess: put, onError: fail })} data-testid="decide-changes-send">Düzəliş tələbini göndər</button></div>
      </> : <div className="pt-decide-btns">
        <button type="button" className="button button-secondary pt-big" onClick={() => setAsking(true)} data-testid="decide-changes"><RotateCcw size={16} />Düzəliş istəyirəm</button>
        <button type="button" className="button button-primary pt-big" disabled={decide.isPending} onClick={() => decide.mutate({ protocolId: pid, data: { version: cur.version, contentHash: cur.contentHash, decision: 'approved' } }, { onSuccess: put, onError: fail })} data-testid="decide-approve">{decide.isPending ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}Təsdiq edirəm</button>
      </div>}
      <p className="pt-legal">“Təsdiq edirəm” düyməsi hesabınızla, tarix-saat və versiya ilə qeydə alınır. Bu, tərəflərin faktiki vəziyyəti qəbul etdiyinin qeydidir; ixtisaslı elektron imza deyil.{rental ? ' Hesabat zərərin kim tərəfindən yaradıldığını, təqsiri və ya depozitin taleyini müəyyən etmir.' : ''}</p>
    </div>}

    {d.me.isCreator && ['awaiting', 'approved', 'finalized'].includes(p.status) && <div className="pt-card">
      <h3>Dəyişiklik lazımdır?</h3>
      <p className="rl-hint">Redaktəni açsanız, versiya {p.currentVersion} və onun təsdiqləri tarixçədə qalır; dəyişikliklərdən sonra yeni versiya yenidən təsdiq tələb edəcək.</p>
      <button type="button" className="button button-secondary" disabled={reopen.isPending} onClick={() => { setErr(''); reopen.mutate({ protocolId: pid }, { onSuccess: put, onError: fail }); }} data-testid="reopen"><RotateCcw size={15} />Redaktəni yenidən aç</button>
    </div>}

    {d.versions.length > 0 && <div className="pt-card" data-testid="pdf-card">
      <h3><FileText size={16} />PDF protokol</h3>
      <ul className="pt-versions">{d.versions.map((v) => { const vd = deciders.every((r) => d.approvals.some((a) => a.version === v.version && a.role === r && a.decision === 'approved')); return <li key={v.version}>
        <span><b>Versiya {v.version}</b><small>{timeAz(v.createdAt)} · {vd ? 'hər iki tərəf təsdiqləyib' : 'tam təsdiqlənməyib'}</small></span>
        <span className="pt-v-btns">
          {v.hasPdf && <><a className="button button-secondary sm-btn-sm" href={`/api/protocols/${pid}/versions/${v.version}/pdf`} target="_blank" rel="noopener noreferrer" data-testid={`pdf-open-${v.version}`}><FileText size={13} />Aç</a>
            <a className="button button-secondary sm-btn-sm" href={`/api/protocols/${pid}/versions/${v.version}/pdf?download=1`} data-testid={`pdf-download-${v.version}`}><Download size={13} />Yüklə</a></>}
          <button type="button" className={`button ${vd && v === latest && !v.hasPdf ? 'button-primary' : 'button-secondary'} sm-btn-sm`} disabled={pdf.isPending} onClick={() => { setErr(''); pdf.mutate({ protocolId: pid, version: v.version }, { onSuccess: put, onError: fail }); }} data-testid={`pdf-make-${v.version}`}>{pdf.isPending && pdf.variables?.version === v.version ? <LoaderCircle size={13} className="spin" /> : <FileText size={13} />}{v.hasPdf ? 'Yenidən yarat' : vd ? 'Yekun PDF yarat' : 'Qaralama PDF'}</button>
        </span></li>; })}</ul>
      {p.status === 'finalized' && <a className="button button-secondary" href={waLink(`${p.address} — ${KIND_LABEL[p.kind].toLowerCase()} № ${p.number} hər iki tərəf tərəfindən təsdiqləndi. PDF: ${window.location.origin}/protokol/${pid}?tab=approve`)} target="_blank" rel="noopener noreferrer" data-testid="share-wa"><MessageCircle size={15} />WhatsApp-da paylaş</a>}
      <p className="rl-hint">PDF yalnız protokolun iştirakçılarına açılır. Təsdiqlənməmiş versiyanın PDF-i “TƏSDİQLƏNMƏYİB” işarəsi ilə yaradılır.</p>
    </div>}
    <Err text={err} />
    {d.events.length > 0 && <details className="pt-card pt-history"><summary><History size={15} />Tarixçə</summary><ul>{d.events.map((e, i) => <li key={i}><small>{timeAz(e.createdAt)}</small>{e.role ? `${ROLE_LABEL[e.role]}: ` : ''}{EVENT_LABEL[e.action] ?? e.action}{typeof e.detail.version === 'number' ? ` (versiya ${e.detail.version})` : ''}{typeof e.detail.comment === 'string' && e.detail.comment ? ` — “${e.detail.comment}”` : ''}</li>)}</ul></details>}
  </section>;
}

/* ================================================================== invitation */

/** Rental protocols: parties and invitations live on the rental page. */
function RentalPartiesNote({ d }: { d: Detail }) {
  const p = d.protocol;
  return <section className="pt-section" data-testid="rental-parties">
    <div className="pt-card">
      <h3>Tərəflər</h3>
      <ul className="pt-plain"><li>Ev sahibi: <b>{p.landlordName || '—'}</b> {p.landlordPhone}</li><li>Kirayəçi: <b>{p.tenantName || '—'}</b> {p.tenantPhone}</li>{p.realtorName && <li>Rieltor: <b>{p.realtorName}</b> {p.realtorPhone}</li>}</ul>
      {d.rental && <p className="rl-hint">Kirayə № {d.rental.number} · {dayAz(d.rental.startDate)} — {dayAz(d.rental.endDate)}</p>}
      <p className="rl-hint">Qoşulub: {d.participants.map((x) => `${ROLE_LABEL[x.role]}${x.isMe ? ' (siz)' : ''}`).join(', ') || '—'}</p>
      <Link href={`/kiraye/${p.rentalId}`} className="button button-secondary" data-testid="open-rental"><Users size={15} />Tərəflər və dəvət linkləri</Link>
    </div>
  </section>;
}

export function ProtocolInvitePage({ token }: { token: string }) {
  const q = useGetProtocolInvite(token, { query: { queryKey: [`/api/protocol-invites/${token}`], retry: false } });
  const accept = useAcceptProtocolInvite(silent);
  const [, go] = useLocation();
  const [err, setErr] = useState('');
  const d = useMemo(() => (q.data ? asDetail(q.data.detail) : null), [q.data]);
  if (q.isLoading) return <div className="pt-page"><Skeleton rows={4} /></div>;
  if (!q.data || !d) return <div className="pt-page"><Empty icon={<Link2 size={28} />} title="Link etibarsızdır" text="Link ləğv edilib və ya səhv kopyalanıb. Protokolu hazırlayan şəxsdən yeni link istəyin." /></div>;
  const role = q.data.role as Role; const p = d.protocol;
  const join = () => { setErr(''); accept.mutate({ token }, { onSuccess: (x) => go(`/protokol/${asDetail(x).protocol.id}?tab=approve`), onError: (e) => setErr(errorText(e)) }); };
  return <div className="pt-page pt-public" data-testid="invite-page">
    <div className="pt-brand"><img src="/favicon.svg" alt="" width={26} height={26} />Tehvil.az</div>
    <div className="pt-invite-banner"><ClipboardCheck size={20} /><div><b>Sizi {ROLE_SHORT[role]} kimi dəvət ediblər</b><span>{p.address} · № {p.number} · {dayAz(p.handoverDate)}</span></div></div>
    <div className="pt-meta"><StatusPill s={p.status} />{p.currentVersion > 0 && <span>Versiya {p.currentVersion}</span>}</div>
    <div className="pt-card"><h3>Tərəflər</h3><ul className="pt-plain"><li>Satıcı: <b>{p.sellerName || '—'}</b> {p.sellerPhone}</li><li>Alıcı: <b>{p.buyerName || '—'}</b> {p.buyerPhone}</li>{p.realtorName && <li>Rieltor: <b>{p.realtorName}</b>{p.realtorAgency ? ` · ${p.realtorAgency}` : ''} {p.realtorPhone}</li>}</ul></div>
    <Review d={d} />
    <Err text={err} />
    <div className="pt-bar">
      <Show when="signed-in"><button type="button" className="button button-primary pt-big pt-wide" onClick={join} disabled={accept.isPending} data-testid="invite-join">{accept.isPending ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}{q.data.usedByMe ? 'Protokola keç' : `Protokola ${ROLE_SHORT[role]} kimi qoşul`}</button></Show>
      <Show when="signed-out"><Link href={`/sign-in?redirect=${encodeURIComponent(here())}`} className="button button-primary pt-big pt-wide" data-testid="invite-signin"><LogIn size={16} />Təsdiq üçün daxil olun</Link></Show>
    </div>
    <p className="pt-legal">Bu linklə protokola baxmaq olar. Təsdiq etmək üçün hesabınızla daxil olmalısınız: təsdiq hesabınız, tarix-saat və versiya ilə qeydə alınır. Hüquqi elektron imza deyil.</p>
  </div>;
}
