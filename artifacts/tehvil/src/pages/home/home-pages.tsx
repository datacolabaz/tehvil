import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Archive, ArrowUpRight, Boxes, Cable, CalendarDays, Camera, ClipboardCheck, DoorOpen, HardHat, Image, ListChecks, LoaderCircle, Pencil, Phone, Plus, QrCode,
  ShieldCheck, Trash2, UserPlus, Users,
  CheckCircle2, Circle,
} from 'lucide-react';
import {
  useArchiveHome, useCreateHomeInvitation, useCreateHomeRoom, useDeleteHomeRoom, useGetHomeOverview, useGetHomeRoom, useListHomeAudit, useListHomeMembers,
  useListHomePerformers, useListInfrastructure, useListWorks, useRemoveHomeMember, useUpdateHome, useUpdateHomeRoom, type HomeInvitationInputRole, type HomeOverview, type HomeRoom, type HomeRoomInput, type WorkSummary,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CopyButton, Empty, HomeToaster, MediaGrid, MediaUpload, Modal, Pill, Seg, Select, Skeleton, StatTile, WorkStatus, WorkerLine, opts, toast } from '@/components/home/ui';
import { AUDIT_ACTION, EQUIP_CATEGORY, HOME_ROLE, HOME_ROLE_HINT, INFRA_TYPE, PART_ROLE, PROPERTY, ROOM_CONDITION, ROOM_KIND, STAGE, WORK_CATEGORY, WORK_STATUS, day, dayTime, range, refreshHomeData } from '@/lib/home/labels';
import { HomeFormModal } from './homes-page';
import { QuickWorkModal } from './quick-work';

export function useHome(homeId: string) { return useGetHomeOverview(homeId); }

export function HomeMissing() {
  return <div className="notice error-notice" role="alert"><p>Ev tapılmadı və ya baxmaq icazəniz yoxdur.</p><Link href="/homes" className="button button-secondary">Mənim evlərim</Link></div>;
}

/* ----------------------------------------------------- Evin məlumatları */

export function HomeProfilePage({ homeId }: { homeId: string }) {
  const q = useHome(homeId);
  const qc = useQueryClient();
  const update = useUpdateHome();
  const archive = useArchiveHome();
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [adding, setAdding] = useState(false);
  if (q.isLoading) return <Skeleton rows={4} />;
  if (!q.data) return <HomeMissing />;
  const { home, stats, recentWorks, performers, rooms } = q.data;
  const p = home.permissions;
  const owner = home.myRole === 'owner';
  const setCover = (mediaId: string) => update.mutate({ homeId, data: { name: home.name, propertyType: home.propertyType as never, city: home.city, district: home.district, address: home.address, areaM2: home.areaM2, roomCount: home.roomCount, floor: home.floor, builtYear: home.builtYear, stage: home.stage as never, notes: home.notes, coverMediaId: mediaId } }, { onSuccess: () => { void refreshHomeData(qc); toast('Örtük şəkli dəyişdi'); } });
  return <>
    <div className="hp-hero surface">
      <div className="hp-hero-cover">{home.coverUrl ? <img src={home.coverUrl} alt="" /> : <DoorOpen size={40} />}
        {p.edit && <div className="hp-hero-upload"><MediaUpload target={{ homeId }} phases={false} videos={false} label={home.coverUrl ? 'Şəkli dəyiş' : 'Şəkil əlavə et'} onDone={m => m[0] && setCover(m[0].id)} /></div>}
      </div>
      <div className="hp-hero-body">
        <div className="eyebrow">{PROPERTY[home.propertyType]} · {STAGE[home.stage]} · {HOME_ROLE[home.myRole]}</div>
        <h1 className="font-display">{home.name}</h1>
        <p>{[home.district, home.city].filter(Boolean).join(', ')}{home.address ? ` · ${home.address}` : ''}</p>
        <dl className="hp-facts">
          <div><dt>Sahə</dt><dd>{home.areaM2 ? `${home.areaM2} m²` : '—'}</dd></div>
          <div><dt>Otaq sayı</dt><dd>{home.roomCount ?? '—'}</dd></div>
          <div><dt>Mərtəbə</dt><dd>{home.floor || '—'}</dd></div>
          <div><dt>Tikinti ili</dt><dd>{home.builtYear ?? '—'}</dd></div>
        </dl>
        {home.notes && <p className="hp-text">{home.notes}</p>}
        <div className="hp-actions">
          {p.addWorks && <button type="button" className="button button-primary" onClick={() => setAdding(true)} data-testid="button-quick-work"><Plus size={15} />Görülən işi əlavə et</button>}
          {p.edit && <button type="button" className="button button-secondary" onClick={() => setEditing(true)} data-testid="button-edit-home"><Pencil size={15} />Məlumatları dəyiş</button>}
          {p.manageSharing && <Link href={`/homes/${homeId}/sharing`} className="button button-secondary"><QrCode size={15} />Məlumatları paylaş</Link>}
          {owner && <button type="button" className="button button-quiet" onClick={() => setArchiving(true)}><Archive size={15} />Arxivlə</button>}
        </div>
      </div>
    </div>
    {p.edit && <NextSteps homeId={homeId} overview={q.data} onAddWork={() => setAdding(true)} />}
    {stats.works > 0 && <div className="hp-stats">
      <StatTile icon={<ListChecks size={16} />} label="Görülən işlər" value={stats.works} hint={`${stats.confirmed} təsdiqlənib`} />
      <StatTile icon={<HardHat size={16} />} label="Usta və şirkətlər" value={stats.performers} />
      {stats.pendingApproval > 0 && <StatTile icon={<ClipboardCheck size={16} />} label="Təsdiqinizi gözləyir" value={stats.pendingApproval} tone="gold" />}
      {stats.openDefects > 0 && <StatTile icon={<AlertTriangle size={16} />} label="Həll olunmamış problem" value={stats.openDefects} tone="alert" />}
    </div>}
    <div className="hp-two">
      <section className="surface hp-section">
        <div className="section-head"><h2>Son görülən işlər</h2><Link href={`/homes/${homeId}/history`} className="text-link">Təmir tarixçəsi<ArrowUpRight size={14} /></Link></div>
        {recentWorks.length ? <div className="hp-wlist">{recentWorks.map(w => <WorkRow key={w.id} w={w} />)}</div> : <p className="rl-hint">Hələ görülən iş əlavə etməmisiniz.</p>}
      </section>
      <section className="surface hp-section">
        <div className="section-head"><h2>Otaqlar</h2><Link href={`/homes/${homeId}/rooms`} className="text-link">Hamısı<ArrowUpRight size={14} /></Link></div>
        {rooms.length ? <div className="hp-chips">{rooms.map(r => <Link key={r.id} href={`/homes/${homeId}/rooms/${r.id}`} className="hp-chip">{r.name}<small>{r.works} iş</small></Link>)}</div> : <p className="rl-hint">Hələ otaq əlavə etməmisiniz.</p>}
        <div className="section-head hp-mt"><h2>Usta və şirkətlər</h2><Link href={`/homes/${homeId}/performers`} className="text-link">Hamısı<ArrowUpRight size={14} /></Link></div>
        {performers.length ? performers.slice(0, 5).map(x => <WorkerLine key={x.worker.id} w={x.worker} href={x.worker.registered ? `/workers/${x.worker.id}` : null} sub={x.roles.map(r => PART_ROLE[r] ?? r).join(', ')} />) : <p className="rl-hint">Hələ usta əlavə olunmayıb.</p>}
      </section>
    </div>
    {home.myRole !== 'performer' && <MembersSection homeId={homeId} owner={owner} />}
    {adding && <QuickWorkModal homeId={homeId} onClose={() => setAdding(false)} onSaved={id => setLocation(`/works/${id}`)} />}
    {editing && <HomeFormModal open home={home} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    <Modal open={archiving} onClose={() => setArchiving(false)} eyebrow={home.name} title="Evi arxivə köçürmək" footer={<button type="button" className="button button-danger" disabled={archive.isPending} onClick={() => archive.mutate({ homeId }, { onSuccess: () => { void refreshHomeData(qc); setLocation('/homes'); } })}>Arxivlə</button>}>
      <p className="rl-hint">Ev “Evlərim” siyahısından və QR səhifəsindən gizlənəcək. Heç nə silinmir — təmir tarixçəsi və fotolar saxlanılır.</p>
    </Modal>
    <HomeToaster />
  </>;
}

/** Step 2 of adding a home: optional sections, each with one sentence on why it is useful. */
function NextSteps({ homeId, overview, onAddWork }: { homeId: string; overview: HomeOverview; onAddWork: () => void }) {
  const infra = useListInfrastructure(homeId);
  const hideKey = `tehvil-steps-hidden:${homeId}`;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(hideKey) === '1'; } catch { return false; } });
  const has = (types: string[]) => (infra.data ?? []).some(i => types.includes(i.type));
  const steps = [
    { done: overview.rooms.length > 0, title: 'Otaqlar', text: 'Otaqları əlavə edin — işləri və sistemləri yerinə bağlamaq asan olacaq.', href: `/homes/${homeId}/rooms` },
    { done: overview.stats.works > 0, title: 'İlk görülən iş', text: 'Son təmirdə nə edilib? Bir neçə düymə ilə qeyd edin, fotosunu əlavə edin.', action: onAddWork },
    { done: has(['electric']), title: 'Elektrik sistemi', text: 'Divarlar bağlanmazdan əvvəl elektrik naqillərinin fotosunu əlavə edin. Gələcəkdə təmir zamanı naqillərin yerini tapmaq daha asan olacaq.', href: `/homes/${homeId}/map?type=electric` },
    { done: has(['water', 'sewer']), title: 'Su və kanalizasiya', text: 'Boruların harada keçdiyini fotoda göstərin — sızma olanda yeri tez tapılar.', href: `/homes/${homeId}/map?type=water` },
    { done: has(['heating', 'ventilation', 'gas']), title: 'İstilik və soyutma', text: 'Kombi, radiator, kondisioner və qaz xətlərini qeyd edin.', href: `/homes/${homeId}/map?type=heating` },
    { done: overview.stats.equipment > 0, title: 'Avadanlıqlar', text: 'Kombi, kondisioner, su filtri — zəmanətin nə vaxt bitdiyini unutmayın.', href: `/homes/${homeId}/equipment` },
  ];
  const left = steps.filter(x => !x.done).length;
  if (hidden || !left) return null;
  return <section className="surface hp-section hp-steps" data-testid="next-steps">
    <div className="section-head"><h2>Növbəti addımlar</h2><button type="button" className="sm-link-btn" onClick={() => { setHidden(true); try { localStorage.setItem(hideKey, '1'); } catch { /* ignore */ } }}>Gizlət</button></div>
    <p className="rl-hint">Heç biri məcburi deyil. İstədiyiniz vaxt qayıdıb əlavə edə bilərsiniz.</p>
    <ol>{steps.map(x => <li key={x.title} className={x.done ? 'done' : ''}>
      <span className="hp-step-mark">{x.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
      <div><b>{x.title}</b><small>{x.text}</small></div>
      {!x.done && (x.href ? <Link href={x.href} className="button button-secondary sm-btn-sm">Əlavə et</Link> : <button type="button" className="button button-secondary sm-btn-sm" onClick={x.action}>Əlavə et</button>)}
    </li>)}</ol>
  </section>;
}

function MembersSection({ homeId, owner }: { homeId: string; owner: boolean }) {
  const members = useListHomeMembers(homeId);
  const remove = useRemoveHomeMember();
  const invite = useCreateHomeInvitation();
  const qc = useQueryClient();
  const [role, setRole] = useState<HomeInvitationInputRole>('member');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  return <section className="surface hp-section">
    <div className="section-head"><h2><Users size={15} className="sm-ii" /> Evə kimin girişi var</h2></div>
    <div className="hp-members">{(members.data ?? []).map(m => <div key={m.id} className="hp-member"><b>{m.displayName || (m.isMe ? 'Siz' : HOME_ROLE[m.role])}</b><Pill small tone={m.role === 'owner' ? 'ok' : 'info'}>{HOME_ROLE[m.role]}</Pill><small>{day(m.createdAt)}</small>
      {m.role !== 'owner' && (owner || m.isMe) && <button type="button" className="sm-link-btn danger" onClick={() => remove.mutate({ homeId, memberId: m.id }, { onSuccess: () => { void refreshHomeData(qc); toast(m.isMe ? 'Evdən çıxdınız' : 'Üzv çıxarıldı'); } })}><Trash2 size={12} />{m.isMe ? 'Çıx' : 'Çıxar'}</button>}</div>)}</div>
    {owner && (link ? <div className="hp-linkbox"><small>Linki göndərin (WhatsApp, SMS). Linki açan şəxs öz hesabı ilə qoşulacaq: “{HOME_ROLE[role]}”. Link 14 gün etibarlıdır və bir dəfə işləyir.</small><code>{link}</code><CopyButton text={link} /><button type="button" className="sm-link-btn" onClick={() => setLink('')}>Başqa dəvət</button></div>
      : <form className="hp-inline-form" onSubmit={(e: FormEvent) => { e.preventDefault(); invite.mutate({ homeId, data: { kind: 'member', role, name: name.trim() } }, { onSuccess: r => setLink(r.url) }); }}>
        <Seg label="Nə edə bilsin?" value={role} options={[['member', HOME_ROLE.member], ['contributor', HOME_ROLE.contributor], ['viewer', HOME_ROLE.viewer]]} onChange={setRole} />
        <small className="rl-hint hp-span">{HOME_ROLE_HINT[role]}</small>
        <Field label="Ad (istəyə görə)" name="member-name" value={name} onChange={setName} />
        <button type="submit" className="button button-secondary" disabled={invite.isPending} data-testid="button-invite-member"><UserPlus size={15} />Dəvət linki</button>
      </form>)}
    <p className="rl-hint">Ustaları buradan yox, konkret görülən işə əlavə edin — onlar yalnız öz işlərini görəcək.</p>
  </section>;
}

export function WorkRow({ w, showHome }: { w: WorkSummary; showHome?: string }) {
  return <Link href={`/works/${w.id}`} className="hp-wrow" data-testid={`row-work-${w.id}`}>
    <span className={`hp-wdot st-${w.status}`} aria-hidden />
    <span className="hp-wrow-main"><strong>{w.title}</strong>
      <small>{[showHome, WORK_CATEGORY[w.category], w.roomName, range(w.startDate, w.endDate)].filter(Boolean).join(' · ')}</small>
      {w.participants.length > 0 && <small className="hp-wrow-people">{w.participants.map(p => `${p.name} (${PART_ROLE[p.role] ?? p.role}${p.status === 'invited' ? ', cavab gözlənilir' : p.status === 'recorded' ? ', hesabı yoxdur' : ''})`).join(', ')}</small>}
    </span>
    <span className="hp-wrow-side"><WorkStatus status={w.status} />{w.inspected && <span className="hp-mini ok"><ShieldCheck size={11} />Yoxlanılıb</span>}{w.openDefects > 0 && <span className="hp-mini risk"><AlertTriangle size={11} />{w.openDefects}</span>}{w.mediaCount > 0 && <span className="hp-mini"><Camera size={11} />{w.mediaCount}</span>}</span>
  </Link>;
}

/* ------------------------------------------- Tikinti və təmir tarixçəsi */

export function HomeHistoryPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const works = useListWorks(homeId);
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [room, setRoom] = useState('');
  const list = (works.data ?? []).filter(w => (!category || w.category === category) && (!status || w.status === status) && (!room || w.roomId === room));
  const byYear = useMemo(() => {
    const m = new Map<string, WorkSummary[]>();
    for (const w of list) { const y = (w.startDate ?? w.updatedAt).slice(0, 4); m.set(y, [...(m.get(y) ?? []), w]); }
    return [...m.entries()];
  }, [list]);
  if (home.isLoading) return <Skeleton rows={4} />;
  if (!home.data) return <HomeMissing />;
  const p = home.data.home.permissions;
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Təmir tarixçəsi" description="Evdə görülən bütün işlər tarix üzrə: nə, harada, nə vaxt və kim. İşə toxunun — fotolar, qeydlər və təsdiqlər açılacaq."
      action={p.addWorks ? <button type="button" className="button button-primary" onClick={() => setCreating(true)} data-testid="button-create-work"><Plus size={16} />Görülən işi əlavə et</button> : undefined} />
    <div className="hp-filters">
      <Select label="Kateqoriya" name="f-category" value={category} onChange={setCategory} empty="Hamısı" options={opts(WORK_CATEGORY)} />
      <Select label="Status" name="f-status" value={status} onChange={setStatus} empty="Hamısı" options={opts(WORK_STATUS)} />
      <Select label="Otaq" name="f-room" value={room} onChange={setRoom} empty="Hamısı" options={home.data.rooms.map(r => [r.id, r.name])} />
    </div>
    {works.isLoading ? <Skeleton rows={3} /> : !list.length ? <Empty icon={<CalendarDays size={28} />} title={works.data?.length ? 'Seçiminizə uyğun iş yoxdur' : 'Hələ görülən iş əlavə etməmisiniz'} text="Elektrik, santexnika, boya, döşəmə — hər işi bir neçə düymə ilə qeyd edin, fotosunu və ustanı əlavə edin." action={p.addWorks ? <button type="button" className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} />Görülən işi əlavə et</button> : undefined} />
      : <div className="hp-timeline">{byYear.map(([y, ws]) => <section key={y}><h3 className="hp-year">{y}</h3><div className="hp-wlist">{ws.map(w => <WorkRow key={w.id} w={w} />)}</div></section>)}</div>}
    {creating && <QuickWorkModal homeId={homeId} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); void refreshHomeData(qc); setLocation(`/works/${id}`); }} />}
    <HomeToaster />
  </>;
}

/* ---------------------------------------------------------------- Otaqlar */

export function HomeRoomsPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const [editing, setEditing] = useState<HomeRoom | 'new' | null>(null);
  if (home.isLoading) return <Skeleton rows={3} />;
  if (!home.data) return <HomeMissing />;
  const p = home.data.home.permissions;
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Otaqlar" description="Hər otaqda görülən işlər, avadanlıqlar, naqil və borular, fotolar."
      action={p.edit ? <button type="button" className="button button-primary" onClick={() => setEditing('new')} data-testid="button-add-room"><Plus size={16} />Otaq əlavə et</button> : undefined} />
    {!home.data.rooms.length ? <Empty icon={<DoorOpen size={28} />} title="Hələ otaq əlavə etməmisiniz" text="Mətbəx, hamam, yataq otağı… Otaqları əlavə etsəniz, görülən işləri və sistemləri yerinə bağlamaq asan olacaq." action={p.edit ? <button type="button" className="button button-primary" onClick={() => setEditing('new')}><Plus size={16} />Otaq əlavə et</button> : undefined} />
      : <div className="hp-room-grid">{home.data.rooms.map(r => <Link key={r.id} href={`/homes/${homeId}/rooms/${r.id}`} className="hp-room-card" data-testid={`card-room-${r.id}`}>
        <div className="hp-room-photo">{r.photoUrl ? <img src={r.photoUrl} alt="" loading="lazy" /> : <DoorOpen size={24} />}</div>
        <div><h3>{r.name}</h3><small>{[ROOM_KIND[r.kind], r.areaM2 ? `${r.areaM2} m²` : '', r.floor].filter(Boolean).join(' · ')}</small>
          <div className="hp-home-meta"><span><b>{r.works}</b> iş</span><span><b>{r.equipment}</b> avadanlıq</span><span><b>{r.infrastructure}</b> xətt</span></div>
          {r.condition !== 'unknown' && <Pill small tone={r.condition === 'good' ? 'ok' : r.condition === 'needs_repair' ? 'risk' : 'info'}>{ROOM_CONDITION[r.condition]}</Pill>}</div>
      </Link>)}</div>}
    {editing && <RoomFormModal homeId={homeId} room={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    <HomeToaster />
  </>;
}

function RoomFormModal({ homeId, room, onClose }: { homeId: string; room?: HomeRoom; onClose: () => void }) {
  const create = useCreateHomeRoom();
  const update = useUpdateHomeRoom();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: room?.name ?? '', kind: room?.kind ?? 'living', floor: room?.floor ?? '', areaM2: room?.areaM2?.toString() ?? '', condition: room?.condition ?? 'unknown', notes: room?.notes ?? '' });
  const set = (k: keyof typeof form) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data: HomeRoomInput = { name: form.name.trim(), kind: form.kind as HomeRoomInput['kind'], floor: form.floor, areaM2: form.areaM2 ? Number(form.areaM2) : null, condition: form.condition as HomeRoomInput['condition'], notes: form.notes };
    const done = { onSuccess: () => { void refreshHomeData(qc); toast(room ? 'Otaq yeniləndi' : 'Otaq əlavə olundu'); onClose(); } };
    if (room) update.mutate({ homeId, roomId: room.id, data }, done); else create.mutate({ homeId, data }, done);
  };
  return <Modal open onClose={onClose} eyebrow="Otaq" title={room ? 'Otağı redaktə et' : 'Yeni otaq'}
    footer={<button type="submit" form="room-form" className="button button-primary" disabled={!form.name.trim() || create.isPending || update.isPending} data-testid="button-save-room">Yadda saxla</button>}>
    <form id="room-form" className="rl-form" onSubmit={submit}>
      <Field label="Ad" name="room-name" required value={form.name} onChange={set('name')} placeholder="məs. Mətbəx" />
      <div className="field-grid three"><Select label="Növ" name="room-kind" value={form.kind} onChange={v => { set('kind')(v); if (!form.name.trim()) set('name')(ROOM_KIND[v]); }} options={opts(ROOM_KIND)} />
        <Field label="Sahə, m²" name="room-area" type="number" min="1" value={form.areaM2} onChange={set('areaM2')} /><Field label="Mərtəbə" name="room-floor" value={form.floor} onChange={set('floor')} /></div>
      <Select label="Vəziyyət" name="room-condition" value={form.condition} onChange={set('condition')} options={opts(ROOM_CONDITION)} />
      <Field label="Qeyd" name="room-notes"><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes')(e.target.value)} /></Field>
    </form>
  </Modal>;
}

export function RoomPage({ homeId, roomId }: { homeId: string; roomId: string }) {
  const home = useHome(homeId);
  const q = useGetHomeRoom(homeId, roomId);
  const remove = useDeleteHomeRoom();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  if (q.isLoading || home.isLoading) return <Skeleton rows={3} />;
  if (!q.data || !home.data) return <HomeMissing />;
  const { room, works, equipment, infrastructure, media } = q.data;
  const p = home.data.home.permissions;
  const canUpload = ['owner', 'member', 'contributor'].includes(home.data.home.myRole);
  return <>
    <Link href={`/homes/${homeId}/rooms`} className="hp-back">← Otaqlar</Link>
    <PageHeading eyebrow={`${home.data.home.name} · ${ROOM_KIND[room.kind] ?? room.kind}`} title={room.name} description={[room.areaM2 ? `${room.areaM2} m²` : '', room.floor ? `mərtəbə ${room.floor}` : '', ROOM_CONDITION[room.condition]].filter(Boolean).join(' · ')}
      action={p.edit ? <div className="hp-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={15} />Redaktə</button><button type="button" className="button button-quiet" onClick={() => remove.mutate({ homeId, roomId }, { onSuccess: () => { void refreshHomeData(qc); setLocation(`/homes/${homeId}/rooms`); } })}><Trash2 size={15} />Sil</button></div> : undefined} />
    {room.notes && <p className="hp-text surface hp-section">{room.notes}</p>}
    <section className="surface hp-section"><div className="section-head"><h2>Görülən işlər</h2>{p.addWorks && <button type="button" className="button button-secondary sm-btn-sm" onClick={() => setCreating(true)}><Plus size={14} />Əlavə et</button>}</div>
      {works.length ? <div className="hp-wlist">{works.map(w => <WorkRow key={w.id} w={w} />)}</div> : <p className="rl-hint">Bu otaqda hələ iş qeyd olunmayıb.</p>}</section>
    <div className="hp-two">
      <section className="surface hp-section"><div className="section-head"><h2>Avadanlıqlar</h2><Link href={`/homes/${homeId}/equipment`} className="text-link">Reyestr<ArrowUpRight size={14} /></Link></div>
        {equipment.length ? equipment.map(e => <div key={e.id} className="hp-kvline"><b>{e.name}</b><small>{[EQUIP_CATEGORY[e.category], e.brand, e.model].filter(Boolean).join(' · ')}</small></div>) : <p className="rl-hint">Yoxdur.</p>}</section>
      <section className="surface hp-section"><div className="section-head"><h2>Evdəki sistemlər</h2><Link href={`/homes/${homeId}/map`} className="text-link">Hamısı<ArrowUpRight size={14} /></Link></div>
        {infrastructure.length ? infrastructure.map(i => <div key={i.id} className="hp-kvline"><b>{INFRA_TYPE[i.type]}</b><small>{i.label}{i.verified ? ' · mütəxəssis təsdiqləyib' : ''}</small></div>) : <p className="rl-hint">Yoxdur.</p>}</section>
    </div>
    <section className="surface hp-section"><div className="section-head"><h2><Image size={15} className="sm-ii" /> Otağın fotoları</h2></div>
      {!media.length && <p className="rl-hint">İşlərin fotoları iş səhifəsindədir. Burada otağın ümumi görünüşünü saxlaya bilərsiniz.</p>}
      <MediaGrid media={media} />
      {canUpload && <MediaUpload target={{ homeId, roomId }} onDone={() => { void refreshHomeData(qc); toast('Fotolar əlavə olundu'); }} />}</section>
    {editing && <RoomFormModal homeId={homeId} room={room} onClose={() => setEditing(false)} />}
    {creating && <QuickWorkModal homeId={homeId} roomId={roomId} onClose={() => setCreating(false)} onSaved={id => setLocation(`/works/${id}`)} />}
    <HomeToaster />
  </>;
}

/* ------------------------------------------------- Ustalar və briqadalar */

export function HomePerformersPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const q = useListHomePerformers(homeId);
  if (home.isLoading || q.isLoading) return <Skeleton rows={3} />;
  if (!home.data) return <HomeMissing />;
  const list = q.data ?? [];
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Usta və şirkətlər" description="Bu evdə işləmiş ustalar, briqadalar və şirkətlər — kim hansı işi görüb." />
    {!list.length ? <Empty icon={<HardHat size={28} />} title="Hələ usta əlavə olunmayıb" text="Görülən işə usta, briqada və ya şirkət əlavə edin. Təhvil-də hesabı olmayan ustanı da adı ilə yaza bilərsiniz." />
      : <div className="hp-perf-grid">{list.map(x => <article key={x.worker.id} className="surface hp-perf">
        <WorkerLine w={x.worker} href={x.worker.registered ? `/workers/${x.worker.id}` : null} sub={x.roles.map(r => PART_ROLE[r] ?? r).join(', ')} />
        {x.phone && <a className="hp-phone" href={`tel:${x.phone}`}><Phone size={13} />{x.phone}</a>}
        <ul className="hp-perf-works">{x.works.map(w => <li key={w.id}><Link href={`/works/${w.id}`}>{w.title}</Link><small>{PART_ROLE[w.role] ?? w.role} · {w.startDate ? day(w.startDate) : '—'} · {WORK_STATUS[w.status]}</small></li>)}</ul>
      </article>)}</div>}
  </>;
}

/* ------------------------------------------------------------------ Audit */

export function HomeAuditPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const q = useListHomeAudit(homeId);
  const [open, setOpen] = useState<string | null>(null);
  if (home.isLoading) return <Skeleton rows={3} />;
  if (!home.data) return <HomeMissing />;
  if (!home.data.home.permissions.viewAudit) return <div className="notice manual-notice">Dəyişikliklər tarixçəsini yalnız ev sahibi, ev üzvü və məlumat əlavə edən şəxs görür.</div>;
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Dəyişikliklər tarixçəsi" description="Bu evdə kim, nə vaxt, nəyi dəyişib. Bu siyahıdan heç nə silinmir." />
    {q.isLoading ? <Skeleton rows={3} /> : <ol className="hp-audit surface">{(q.data ?? []).map(a => <li key={a.id}>
      <div><b>{AUDIT_ACTION[a.action] ?? a.action}</b>{a.summary && <span> — {a.summary}</span>}</div>
      <small>{HOME_ROLE[a.actorRole] ?? a.actorRole}{a.actorIsMe ? ' (siz)' : ''} · {dayTime(a.createdAt)}</small>
      {!!a.changes && <button type="button" className="sm-link-btn" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Gizlət' : 'Dəyişikliklər'}</button>}
      {open === a.id && !!a.changes && <table className="hp-diff"><tbody>{Object.entries(a.changes as Record<string, { from: unknown; to: unknown }>).map(([k, v]) => <tr key={k}><th>{k}</th><td>{String(v.from ?? '—')}</td><td>→ {String(v.to ?? '—')}</td></tr>)}</tbody></table>}
    </li>)}</ol>}
  </>;
}

export type { HomeOverview };
void LoaderCircle;
