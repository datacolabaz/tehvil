import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Archive, ArrowUpRight, Boxes, Cable, CalendarDays, Camera, ClipboardCheck, DoorOpen, HardHat, Image, ListChecks, LoaderCircle, Pencil, Phone, Plus, QrCode,
  ShieldCheck, Trash2, UserPlus, Users,
} from 'lucide-react';
import {
  useArchiveHome, useCreateHomeInvitation, useCreateHomeRoom, useDeleteHomeRoom, useGetHomeOverview, useGetHomeRoom, useListHomeAudit, useListHomeMembers,
  useListHomePerformers, useListWorks, useRemoveHomeMember, useUpdateHome, useUpdateHomeRoom, type HomeInvitationInputRole, type HomeOverview, type HomeRoom, type HomeRoomInput, type WorkSummary,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CopyButton, Empty, HomeToaster, MediaGrid, MediaUpload, Modal, Pill, Seg, Select, Skeleton, StatTile, WorkStatus, WorkerLine, opts, toast } from '@/components/home/ui';
import { AUDIT_ACTION, EQUIP_CATEGORY, HOME_ROLE, INFRA_TYPE, PART_ROLE, PROPERTY, ROOM_CONDITION, ROOM_KIND, STAGE, WORK_CATEGORY, WORK_STATUS, day, dayTime, range, refreshHomeData } from '@/lib/home/labels';
import { HomeFormModal } from './homes-page';
import { WorkFormModal } from './work-page';

export function useHome(homeId: string) { return useGetHomeOverview(homeId); }

export function HomeMissing() {
  return <div className="notice error-notice" role="alert"><p>Ev tapılmadı və ya baxmaq icazəniz yoxdur.</p><Link href="/homes" className="button button-secondary">Mənim evlərim</Link></div>;
}

/* ----------------------------------------------------------- Ev profili */

export function HomeProfilePage({ homeId }: { homeId: string }) {
  const q = useHome(homeId);
  const qc = useQueryClient();
  const update = useUpdateHome();
  const archive = useArchiveHome();
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  if (q.isLoading) return <Skeleton rows={4} />;
  if (!q.data) return <HomeMissing />;
  const { home, stats, recentWorks, performers, rooms } = q.data;
  const p = home.permissions;
  const owner = home.myRole === 'owner';
  const setCover = (mediaId: string) => update.mutate({ homeId, data: { name: home.name, propertyType: home.propertyType as never, city: home.city, district: home.district, address: home.address, areaM2: home.areaM2, roomCount: home.roomCount, floor: home.floor, builtYear: home.builtYear, stage: home.stage as never, notes: home.notes, coverMediaId: mediaId } }, { onSuccess: () => { void refreshHomeData(qc); toast('Örtük şəkli dəyişdi'); } });
  return <>
    <div className="hp-hero surface">
      <div className="hp-hero-cover">{home.coverUrl ? <img src={home.coverUrl} alt="" /> : <DoorOpen size={40} />}
        {p.edit && <div className="hp-hero-upload"><MediaUpload target={{ homeId }} phases={false} videos={false} label="Örtük şəkli" onDone={m => m[0] && setCover(m[0].id)} /></div>}
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
          {p.edit && <button type="button" className="button button-secondary" onClick={() => setEditing(true)} data-testid="button-edit-home"><Pencil size={15} />Redaktə et</button>}
          {p.manageSharing && <Link href={`/homes/${homeId}/sharing`} className="button button-secondary"><QrCode size={15} />QR və paylaşım</Link>}
          {owner && <button type="button" className="button button-quiet" onClick={() => setArchiving(true)}><Archive size={15} />Arxivlə</button>}
        </div>
      </div>
    </div>
    <div className="hp-stats">
      <StatTile icon={<ListChecks size={16} />} label="İş qeydləri" value={stats.works} hint={`${stats.confirmed} qəbul edilib`} />
      <StatTile icon={<ClipboardCheck size={16} />} label="Təsdiq gözləyir" value={stats.pendingApproval} tone={stats.pendingApproval ? 'gold' : undefined} />
      <StatTile icon={<HardHat size={16} />} label="Ustalar / briqadalar" value={stats.performers} />
      <StatTile icon={<Cable size={16} />} label="Kommunikasiya xətti" value={stats.infrastructure} />
      <StatTile icon={<Boxes size={16} />} label="Avadanlıq" value={stats.equipment} />
      <StatTile icon={<AlertTriangle size={16} />} label="Açıq nasazlıq" value={stats.openDefects} tone={stats.openDefects ? 'alert' : undefined} />
    </div>
    <div className="hp-two">
      <section className="surface hp-section">
        <div className="section-head"><h2>Son işlər</h2><Link href={`/homes/${homeId}/history`} className="text-link">Bütün tarixçə<ArrowUpRight size={14} /></Link></div>
        {recentWorks.length ? <div className="hp-wlist">{recentWorks.map(w => <WorkRow key={w.id} w={w} />)}</div> : <p className="rl-hint">Hələ iş qeydi yoxdur.</p>}
      </section>
      <section className="surface hp-section">
        <div className="section-head"><h2>Otaqlar</h2><Link href={`/homes/${homeId}/rooms`} className="text-link">Hamısı<ArrowUpRight size={14} /></Link></div>
        {rooms.length ? <div className="hp-chips">{rooms.map(r => <Link key={r.id} href={`/homes/${homeId}/rooms/${r.id}`} className="hp-chip">{r.name}<small>{r.works} iş</small></Link>)}</div> : <p className="rl-hint">Otaq əlavə olunmayıb.</p>}
        <div className="section-head hp-mt"><h2>Ustalar və briqadalar</h2><Link href={`/homes/${homeId}/performers`} className="text-link">Hamısı<ArrowUpRight size={14} /></Link></div>
        {performers.length ? performers.slice(0, 5).map(x => <WorkerLine key={x.worker.id} w={x.worker} href={x.worker.registered ? `/workers/${x.worker.id}` : null} sub={x.roles.map(r => PART_ROLE[r] ?? r).join(', ')} />) : <p className="rl-hint">Hələ icraçı yoxdur.</p>}
      </section>
    </div>
    {home.myRole !== 'performer' && <MembersSection homeId={homeId} owner={owner} />}
    {editing && <HomeFormModal open home={home} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    <Modal open={archiving} onClose={() => setArchiving(false)} eyebrow={home.name} title="Evi arxivləmək" footer={<button type="button" className="button button-danger" disabled={archive.isPending} onClick={() => archive.mutate({ homeId }, { onSuccess: () => { void refreshHomeData(qc); setLocation('/homes'); } })}>Arxivlə</button>}>
      <p className="rl-hint">Ev siyahıdan və QR səhifəsindən gizlənəcək. Heç bir qeyd silinmir — tarixçə, fotolar və audit jurnalı saxlanılır.</p>
    </Modal>
    <HomeToaster />
  </>;
}

function MembersSection({ homeId, owner }: { homeId: string; owner: boolean }) {
  const members = useListHomeMembers(homeId);
  const remove = useRemoveHomeMember();
  const invite = useCreateHomeInvitation();
  const qc = useQueryClient();
  const [role, setRole] = useState<HomeInvitationInputRole>('technician');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  return <section className="surface hp-section">
    <div className="section-head"><h2><Users size={15} className="sm-ii" /> Evin üzvləri</h2></div>
    <div className="hp-members">{(members.data ?? []).map(m => <div key={m.id} className="hp-member"><b>{m.displayName || (m.isMe ? 'Siz' : HOME_ROLE[m.role])}</b><Pill small tone={m.role === 'owner' ? 'ok' : 'info'}>{HOME_ROLE[m.role]}</Pill><small>{day(m.createdAt)}</small>
      {m.role !== 'owner' && (owner || m.isMe) && <button type="button" className="sm-link-btn danger" onClick={() => remove.mutate({ homeId, memberId: m.id }, { onSuccess: () => { void refreshHomeData(qc); toast(m.isMe ? 'Evdən çıxdınız' : 'Üzv çıxarıldı'); } })}><Trash2 size={12} />{m.isMe ? 'Çıx' : 'Çıxar'}</button>}</div>)}</div>
    {owner && (link ? <div className="hp-linkbox"><small>Linki göndərin. Qəbul edən şəxs öz hesabı ilə bu evə {HOME_ROLE[role].toLowerCase()} kimi qoşulacaq. Link 14 gün etibarlıdır.</small><code>{link}</code><CopyButton text={link} /><button type="button" className="sm-link-btn" onClick={() => setLink('')}>Başqa dəvət</button></div>
      : <form className="hp-inline-form" onSubmit={(e: FormEvent) => { e.preventDefault(); invite.mutate({ homeId, data: { kind: 'member', role, name: name.trim() } }, { onSuccess: r => setLink(r.url) }); }}>
        <Seg label="Kimi dəvət edirsiniz" value={role} options={[['technician', 'Texniki mütəxəssis'], ['viewer', 'Ailə üzvü']]} onChange={setRole} />
        <Field label="Ad (istəyə görə)" name="member-name" value={name} onChange={setName} />
        <button type="submit" className="button button-secondary" disabled={invite.isPending} data-testid="button-invite-member"><UserPlus size={15} />Dəvət linki</button>
      </form>)}
    <p className="rl-hint">Texniki mütəxəssis texniki məlumatları görür, yoxlama qeydi yazır və kommunikasiya xətlərini təsdiqləyir. Ailə üzvü yalnız baxır. Ustalar evə burada yox, konkret işə dəvət olunur.</p>
  </section>;
}

export function WorkRow({ w, showHome }: { w: WorkSummary; showHome?: string }) {
  return <Link href={`/works/${w.id}`} className="hp-wrow" data-testid={`row-work-${w.id}`}>
    <span className={`hp-wdot st-${w.status}`} aria-hidden />
    <span className="hp-wrow-main"><strong>{w.title}</strong>
      <small>{[showHome, WORK_CATEGORY[w.category], w.roomName, range(w.startDate, w.endDate)].filter(Boolean).join(' · ')}</small>
      {w.participants.length > 0 && <small className="hp-wrow-people">{w.participants.map(p => `${p.name} (${PART_ROLE[p.role] ?? p.role}${p.status === 'invited' ? ', dəvət' : p.status === 'recorded' ? ', qeydiyyatsız' : ''})`).join(', ')}</small>}
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
    <PageHeading eyebrow={home.data.home.name} title="Tikinti və təmir tarixçəsi" description="Hər iş tarix üzrə: kim, hansı rolda, harada və nə vaxt işləyib. İşə klikləyin — fotolar, qeydlər və təsdiqlər açılacaq."
      action={p.addWorks ? <button type="button" className="button button-primary" onClick={() => setCreating(true)} data-testid="button-create-work"><Plus size={16} />İş qeydi əlavə et</button> : undefined} />
    <div className="hp-filters">
      <Select label="Kateqoriya" name="f-category" value={category} onChange={setCategory} empty="Hamısı" options={opts(WORK_CATEGORY)} />
      <Select label="Status" name="f-status" value={status} onChange={setStatus} empty="Hamısı" options={opts(WORK_STATUS)} />
      <Select label="Otaq" name="f-room" value={room} onChange={setRoom} empty="Hamısı" options={home.data.rooms.map(r => [r.id, r.name])} />
    </div>
    {works.isLoading ? <Skeleton rows={3} /> : !list.length ? <Empty icon={<CalendarDays size={28} />} title={works.data?.length ? 'Filtrə uyğun iş yoxdur' : 'Tarixçə hələ boşdur'} text="Elektrik, santexnika, kafel, kombi quraşdırılması — hər işi ayrıca qeyd edin, ustanı dəvət edin və fotoları əlavə edin." action={p.addWorks ? <button type="button" className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} />İlk işi qeyd et</button> : undefined} />
      : <div className="hp-timeline">{byYear.map(([y, ws]) => <section key={y}><h3 className="hp-year">{y}</h3><div className="hp-wlist">{ws.map(w => <WorkRow key={w.id} w={w} />)}</div></section>)}</div>}
    {creating && <WorkFormModal homeId={homeId} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); void refreshHomeData(qc); setLocation(`/works/${id}`); }} />}
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
    <PageHeading eyebrow={home.data.home.name} title="Otaqlar" description="Hər otağın işləri, avadanlıqları, gizli xətləri və fotoları."
      action={p.edit ? <button type="button" className="button button-primary" onClick={() => setEditing('new')} data-testid="button-add-room"><Plus size={16} />Otaq əlavə et</button> : undefined} />
    {!home.data.rooms.length ? <Empty icon={<DoorOpen size={28} />} title="Otaq yoxdur" text="Mətbəx, hamam, yataq otağı… Otaqları əlavə edin ki, işləri və xətləri yerinə bağlayasınız." action={p.edit ? <button type="button" className="button button-primary" onClick={() => setEditing('new')}><Plus size={16} />Otaq əlavə et</button> : undefined} />
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
  const canUpload = home.data.home.myRole === 'owner' || home.data.home.myRole === 'technician';
  return <>
    <Link href={`/homes/${homeId}/rooms`} className="hp-back">← Otaqlar</Link>
    <PageHeading eyebrow={`${home.data.home.name} · ${ROOM_KIND[room.kind] ?? room.kind}`} title={room.name} description={[room.areaM2 ? `${room.areaM2} m²` : '', room.floor ? `mərtəbə ${room.floor}` : '', ROOM_CONDITION[room.condition]].filter(Boolean).join(' · ')}
      action={p.edit ? <div className="hp-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={15} />Redaktə</button><button type="button" className="button button-quiet" onClick={() => remove.mutate({ homeId, roomId }, { onSuccess: () => { void refreshHomeData(qc); setLocation(`/homes/${homeId}/rooms`); } })}><Trash2 size={15} />Sil</button></div> : undefined} />
    {room.notes && <p className="hp-text surface hp-section">{room.notes}</p>}
    <section className="surface hp-section"><div className="section-head"><h2>İşlər</h2>{p.addWorks && <button type="button" className="button button-secondary sm-btn-sm" onClick={() => setCreating(true)}><Plus size={14} />İş qeydi</button>}</div>
      {works.length ? <div className="hp-wlist">{works.map(w => <WorkRow key={w.id} w={w} />)}</div> : <p className="rl-hint">Bu otaqda iş qeydi yoxdur.</p>}</section>
    <div className="hp-two">
      <section className="surface hp-section"><div className="section-head"><h2>Avadanlıqlar</h2><Link href={`/homes/${homeId}/equipment`} className="text-link">Reyestr<ArrowUpRight size={14} /></Link></div>
        {equipment.length ? equipment.map(e => <div key={e.id} className="hp-kvline"><b>{e.name}</b><small>{[EQUIP_CATEGORY[e.category], e.brand, e.model].filter(Boolean).join(' · ')}</small></div>) : <p className="rl-hint">Yoxdur.</p>}</section>
      <section className="surface hp-section"><div className="section-head"><h2>Gizli xətlər</h2><Link href={`/homes/${homeId}/map`} className="text-link">Xəritə<ArrowUpRight size={14} /></Link></div>
        {infrastructure.length ? infrastructure.map(i => <div key={i.id} className="hp-kvline"><b>{INFRA_TYPE[i.type]}</b><small>{i.label}{i.verified ? ' · mütəxəssis təsdiqləyib' : ''}</small></div>) : <p className="rl-hint">Yoxdur.</p>}</section>
    </div>
    <section className="surface hp-section"><div className="section-head"><h2><Image size={15} className="sm-ii" /> Otağın fotoları</h2></div>
      {!media.length && <p className="rl-hint">İşlərə aid fotolar iş səhifəsindədir. Burada otağın ümumi görünüşünü saxlaya bilərsiniz.</p>}
      <MediaGrid media={media} />
      {canUpload && <MediaUpload target={{ homeId, roomId }} onDone={() => { void refreshHomeData(qc); toast('Fotolar əlavə olundu'); }} />}</section>
    {editing && <RoomFormModal homeId={homeId} room={room} onClose={() => setEditing(false)} />}
    {creating && <WorkFormModal homeId={homeId} roomId={roomId} onClose={() => setCreating(false)} onSaved={id => setLocation(`/works/${id}`)} />}
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
    <PageHeading eyebrow={home.data.home.name} title="Ustalar və briqadalar" description="Bu evdə işləmiş fərdi ustalar, briqadalar və şirkətlər — hər biri hansı işdə, hansı rolda." />
    {!list.length ? <Empty icon={<HardHat size={28} />} title="Hələ icraçı yoxdur" text="İş qeydinə usta, briqada və ya şirkət əlavə edin. Qeydiyyatdan keçməyən ustanı da öz qeydiniz kimi yaza bilərsiniz." />
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
  if (!home.data.home.permissions.viewAudit) return <div className="notice manual-notice">Audit jurnalını yalnız ev sahibi və texniki mütəxəssis görür.</div>;
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Audit jurnalı" description="Evin pasportunda edilən hər dəyişiklik: kim (rol), nə vaxt, nəyi dəyişib. Qeydlər silinmir." />
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
