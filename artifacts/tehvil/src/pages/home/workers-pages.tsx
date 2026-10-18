import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Building, Check, HardHat, Link2, LogOut, MapPin, Pencil, Phone, Plus, Star, ThumbsDown, Trash2, UserPlus, UserRound, UsersRound, X } from 'lucide-react';
import {
  useAddWorkerMember, useCreateTeamInvitation, useCreateWorker, useGetMyWorkers, useGetWorker, useReportReview, useRespondMembership, useUpdateWorker, useUpdateWorkerMember,
  type TeamInvitationInputRole, type Worker, type WorkerInput, type WorkerRef,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CopyButton, Empty, HomeToaster, MediaUpload, Modal, Pill, Seg, Skeleton, WorkerAvatar, WorkerBadges, WorkerLine, WorkerSearch, toast } from '@/components/home/ui';
import { MEMBER_ROLE, MEMBER_STATUS, PART_ROLE, WORKER_KIND, WORK_CATEGORY, WORK_STATUS, day, refreshHomeData, workerPublicUrl } from '@/lib/home/labels';

/* ------------------------------------------- Ustalar və briqadalar (me) */

export function WorkersPage() {
  const mine = useGetMyWorkers();
  const respond = useRespondMembership();
  const qc = useQueryClient();
  const [creating, setCreating] = useState<WorkerInput['kind'] | null>(null);
  const [picked, setPicked] = useState<WorkerRef | null>(null);
  if (mine.isLoading) return <Skeleton rows={3} />;
  const d = mine.data!;
  const invites = d.memberships.filter(m => m.status === 'invited');
  return <>
    <PageHeading eyebrow="Ustalar və briqadalar" title="Usta profilləri" description="Fərdi usta, briqada (qeyri-rəsmi komanda) və ya şirkət kimi profil yaradın. VÖEN tələb olunmur. Telefonunuz yalnız sizin icazənizlə və işlədiyiniz evlərin sahiblərinə görünür." />
    {invites.map(m => <div key={m.id} className="hp-invite-banner"><UsersRound size={18} /><span><b>{m.group.displayName}</b> sizi {MEMBER_ROLE[m.role]?.toLowerCase()} kimi dəvət edir.</span>
      <div className="hp-actions"><button type="button" className="button button-primary" onClick={() => respond.mutate({ membershipId: m.id, data: { accept: true } }, { onSuccess: () => { void refreshHomeData(qc); toast('Komandaya qoşuldunuz'); } })}><Check size={15} />Qəbul et</button>
        <button type="button" className="button button-quiet" onClick={() => respond.mutate({ membershipId: m.id, data: { accept: false } }, { onSuccess: () => void refreshHomeData(qc) })}><X size={15} />İmtina</button></div></div>)}
    <div className="hp-two">
      <section className="surface hp-section">
        <h2><UserRound size={15} className="sm-ii" /> Fərdi profilim</h2>
        {d.individual ? <><WorkerLine w={d.individual as unknown as WorkerRef} href={`/workers/${d.individual.id}`} sub={[d.individual.specialties.join(', '), d.individual.city].filter(Boolean).join(' · ')} />
          <div className="hp-home-meta"><span><b>{d.individual.stats.works}</b> iş</span><span><b>{d.individual.stats.confirmedWorks}</b> qəbul edilmiş</span><span><b>{d.individual.stats.homes}</b> ev</span></div>
          <Link href={`/workers/${d.individual.id}`} className="button button-secondary sm-btn-sm">Profilə bax</Link></>
          : <><p className="rl-hint">Usta kimi işləyirsinizsə, profil yaradın — ev sahibləri sizi işlərə dəvət edə biləcək, iş tarixçəniz isə avtomatik toplanacaq.</p>
            <button type="button" className="button button-primary" onClick={() => setCreating('individual')} data-testid="button-create-individual"><Plus size={15} />Fərdi usta profili yarat</button></>}
        {d.memberships.filter(m => m.status !== 'invited').length > 0 && <><h3 className="hp-mt">Komandalarım</h3>{d.memberships.filter(m => m.status !== 'invited').map(m => <div key={m.id} className="hp-kvline"><Link href={`/workers/${m.group.id}`}><b>{m.group.displayName}</b></Link><small>{MEMBER_ROLE[m.role]} · {MEMBER_STATUS[m.status]}{m.joinedAt ? ` · ${day(m.joinedAt)}-dən` : ''}{m.leftAt ? ` ${day(m.leftAt)}-dək` : ''}</small></div>)}</>}
      </section>
      <section className="surface hp-section">
        <h2><UsersRound size={15} className="sm-ii" /> İdarə etdiyim briqada və şirkətlər</h2>
        {d.managed.length ? d.managed.map(c => <WorkerLine key={c.worker.id} w={c.worker} href={`/workers/${c.worker.id}`} sub={`${c.stats.works} iş · ${c.stats.homes} ev`} />) : <p className="rl-hint">Briqadanız və ya şirkətiniz varsa, onu ayrıca profil kimi yaradın və üzvləri dəvət edin. Üzvlük işdə iştirak demək deyil — hər işdə kimin iştirak etdiyini ayrıca qeyd edirsiniz.</p>}
        <div className="hp-actions"><button type="button" className="button button-secondary" onClick={() => setCreating('team')} data-testid="button-create-team"><UsersRound size={15} />Briqada yarat</button><button type="button" className="button button-secondary" onClick={() => setCreating('company')} data-testid="button-create-company"><Building size={15} />Şirkət yarat</button></div>
      </section>
    </div>
    <section className="surface hp-section">
      <h2>Usta axtar</h2>
      <p className="rl-hint">Yalnız Təhvil-də qeydiyyatdan keçmiş profillər göstərilir.</p>
      {picked ? <><WorkerLine w={picked} href={`/workers/${picked.id}`} right={<button type="button" className="icon-button" aria-label="Bağla" onClick={() => setPicked(null)}><X size={15} /></button>} /></> : <WorkerSearch onPick={setPicked} />}
    </section>
    {creating && <WorkerFormModal kind={creating} onClose={() => setCreating(null)} />}
    <HomeToaster />
  </>;
}

const blank = { displayName: '', specialties: '', city: 'Bakı', serviceArea: '', about: '', experienceYears: '', phone: '', email: '', publicContact: false, legalName: '', taxId: '' };

export function WorkerFormModal({ kind, worker, onClose }: { kind: WorkerInput['kind']; worker?: Worker; onClose: () => void }) {
  const create = useCreateWorker();
  const update = useUpdateWorker();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => worker ? { displayName: worker.displayName, specialties: worker.specialties.join(', '), city: worker.city, serviceArea: worker.serviceArea, about: worker.about, experienceYears: worker.experienceYears?.toString() ?? '', phone: worker.phone ?? '', email: worker.email ?? '', publicContact: worker.publicContact, legalName: worker.legalName, taxId: worker.taxId ?? '' } : blank);
  const set = (k: keyof typeof blank) => (v: string | boolean) => setForm(o => ({ ...o, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data = { displayName: form.displayName.trim(), specialties: form.specialties.split(',').map(s => s.trim()).filter(Boolean), city: form.city, serviceArea: form.serviceArea, about: form.about, experienceYears: form.experienceYears ? Number(form.experienceYears) : null, phone: form.phone, email: form.email, publicContact: form.publicContact, legalName: form.legalName, taxId: form.taxId };
    const done = { onSuccess: () => { void refreshHomeData(qc); toast(worker ? 'Profil yeniləndi' : 'Profil yaradıldı'); onClose(); } };
    if (worker) update.mutate({ workerId: worker.id, data }, done); else create.mutate({ data: { ...data, kind } }, done);
  };
  return <Modal open onClose={onClose} eyebrow={WORKER_KIND[kind]} title={worker ? 'Profili redaktə et' : `${WORKER_KIND[kind]} profili`} wide
    footer={<button type="submit" form="worker-form" className="button button-primary" disabled={form.displayName.trim().length < 2 || create.isPending || update.isPending} data-testid="button-save-worker">Yadda saxla</button>}>
    <form id="worker-form" className="rl-form" onSubmit={submit}>
      <Field label={kind === 'individual' ? 'Ad, soyad' : kind === 'team' ? 'Briqadanın adı' : 'Şirkətin adı'} name="worker-name" required value={form.displayName} onChange={set('displayName')} />
      <div className="field-grid"><Field label="İxtisaslar (vergüllə)" name="worker-specialties" value={form.specialties} onChange={set('specialties')} placeholder="elektrik, santexnika" /><Field label="Təcrübə (il)" name="worker-exp" type="number" min="0" max="80" value={form.experienceYears} onChange={set('experienceYears')} /></div>
      <div className="field-grid"><Field label="Şəhər" name="worker-city" value={form.city} onChange={set('city')} /><Field label="Xidmət ərazisi" name="worker-area" value={form.serviceArea} onChange={set('serviceArea')} placeholder="məs. Bakı və Abşeron" /></div>
      <Field label="Haqqında" name="worker-about"><textarea rows={3} maxLength={3000} value={form.about} onChange={e => set('about')(e.target.value)} /></Field>
      <div className="field-grid"><Field label="Telefon" name="worker-phone" type="tel" value={form.phone} onChange={set('phone')} /><Field label="E-poçt" name="worker-email" type="email" value={form.email} onChange={set('email')} /></div>
      <label className="rl-check"><input type="checkbox" checked={form.publicContact} onChange={e => set('publicContact')(e.target.checked)} /><span>Əlaqə məlumatlarımı açıq profildə göstər. <small>Seçilməsə, yalnız sizinlə işləyən ev sahibləri görür.</small></span></label>
      {kind === 'company' && <div className="field-grid"><Field label="Hüquqi ad (istəyə görə)" name="worker-legal" value={form.legalName} onChange={set('legalName')} /><Field label="VÖEN (istəyə görə, açıq göstərilmir)" name="worker-tax" value={form.taxId} onChange={set('taxId')} /></div>}
    </form>
  </Modal>;
}

/* ---------------------------------------------------------- Profile page */

export function WorkerProfilePage({ workerId, publicView = false }: { workerId: string; publicView?: boolean }) {
  const q = useGetWorker(workerId);
  const qc = useQueryClient();
  const addMember = useAddWorkerMember();
  const updateMember = useUpdateWorkerMember();
  const invite = useCreateTeamInvitation();
  const report = useReportReview();
  const update = useUpdateWorker();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState('');
  const [role, setRole] = useState<TeamInvitationInputRole>('member');
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (q.isLoading) return <Skeleton rows={4} />;
  const w = q.data;
  if (!w) return <div className="notice error-notice" role="alert"><p>Profil tapılmadı.</p></div>;
  const refresh = () => void refreshHomeData(qc);
  const group = w.kind !== 'individual';
  const manage = w.canManage && !publicView;
  return <>
    <div className="hp-profile surface">
      <WorkerAvatar w={w} size={84} />
      <div className="hp-profile-body">
        <div className="eyebrow">{WORKER_KIND[w.kind]}{w.experienceYears ? ` · ${w.experienceYears} il təcrübə` : ''}</div>
        <h1 className="font-display">{w.displayName}</h1>
        <WorkerBadges w={w} />
        <p>{[w.specialties.join(', '), w.city && <span key="c"><MapPin size={12} className="sm-ii" /> {w.city}</span>, w.serviceArea].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</p>
        {w.legalName && <p className="rl-hint">{w.legalName}</p>}
        {w.about && <p className="hp-text">{w.about}</p>}
        {(w.phone || w.email) && <p className="hp-contact">{w.phone && <a href={`tel:${w.phone}`}><Phone size={13} />{w.phone}</a>}{w.email && <a href={`mailto:${w.email}`}>{w.email}</a>}{!w.publicContact && <small> (yalnız sizə görünür)</small>}</p>}
        {manage && w.taxId != null && w.kind === 'company' && <p className="rl-hint">VÖEN: {w.taxId || '—'} (açıq göstərilmir)</p>}
        <div className="hp-actions">
          {manage && <button type="button" className="button button-secondary" onClick={() => setEditing(true)} data-testid="button-edit-worker"><Pencil size={15} />Redaktə et</button>}
          <CopyButton text={workerPublicUrl(w.id)} label="Profil linki" />
        </div>
        {manage && <div className="hp-mt"><MediaUpload target={{ workerId: w.id }} phases={false} videos={false} label={w.photoUrl ? 'Şəkli dəyiş' : 'Profil şəkli'} onDone={m => m[0] && update.mutate({ workerId: w.id, data: { photoMediaId: m[0].id } }, { onSuccess: refresh })} /></div>}
      </div>
      <dl className="hp-wstats">
        <div><dt>İş</dt><dd>{w.stats.works}</dd></div><div><dt>Qəbul edilmiş</dt><dd>{w.stats.confirmedWorks}</dd></div><div><dt>Ev</dt><dd>{w.stats.homes}</dd></div>
        <div><dt>Rəy</dt><dd>{w.stats.avgRating != null ? <><Star size={13} className="on" /> {w.stats.avgRating}</> : '—'} <small>({w.stats.reviews})</small></dd></div>
      </dl>
    </div>

    {group && <section className="surface hp-section">
      <div className="section-head"><h2>Üzvlər</h2>{manage && <div className="hp-actions"><button type="button" className="button button-secondary sm-btn-sm" onClick={() => setAdding(true)} data-testid="button-add-member"><UserPlus size={14} />Usta əlavə et</button></div>}</div>
      {!w.members.length && <p className="rl-hint">Üzv yoxdur.</p>}
      {w.members.map(m => <div key={m.id} className={`hp-prow ${m.status === 'active' ? '' : 'muted'}`}>
        <WorkerLine w={m.member} href={`/workers/${m.member.id}`} sub={`${MEMBER_ROLE[m.role]}${m.joinedAt ? ` · ${day(m.joinedAt)}-dən` : ''}${m.leftAt ? ` ${day(m.leftAt)}-dək` : ''}`} right={<Pill small tone={m.status === 'active' ? 'ok' : m.status === 'invited' ? 'warn' : 'neutral'}>{MEMBER_STATUS[m.status]}</Pill>} />
        {manage && (m.status === 'active' || m.status === 'invited') && m.role !== 'leader' && <div className="hp-prow-actions"><button type="button" className="sm-link-btn danger" onClick={() => updateMember.mutate({ workerId: w.id, membershipId: m.id, data: { status: 'removed' } }, { onSuccess: () => { refresh(); toast('Üzv çıxarıldı; keçmiş işləri tarixçədə qalır'); } })}><Trash2 size={12} />Komandadan çıxar</button></div>}
      </div>)}
      {manage && (link ? <div className="hp-linkbox"><small>Qeydiyyatsız ustaya bu linki göndərin. Usta qeydiyyatdan keçib linki açanda komandaya qoşulacaq.</small><code>{link}</code><CopyButton text={link} /></div>
        : <div className="hp-inline-form"><Seg label="Dəvət linki ilə" value={role} options={[['member', 'Üzv'], ['representative', 'Nümayəndə']]} onChange={setRole} /><button type="button" className="button button-quiet" onClick={() => invite.mutate({ workerId: w.id, data: { role } }, { onSuccess: r => setLink(r.url) })} data-testid="button-team-link"><Link2 size={14} />Link yarat</button></div>)}
      <p className="rl-hint">Üzvün komandadan ayrılması onun keçmiş işlərini silmir — həm üzvün, həm də komandanın tarixçəsində qalır.</p>
    </section>}

    {!group && w.groups.length > 0 && <section className="surface hp-section"><h2>Komandalar</h2>
      {w.groups.map(m => <div key={m.id} className="hp-prow"><WorkerLine w={m.group} href={`/workers/${m.group.id}`} sub={`${MEMBER_ROLE[m.role]} · ${MEMBER_STATUS[m.status]}${m.leftAt ? ` (${day(m.leftAt)})` : ''}`} />
        {manage && w.isMine && m.status === 'active' && m.role !== 'leader' && <div className="hp-prow-actions"><button type="button" className="sm-link-btn" onClick={() => updateMember.mutate({ workerId: m.group.id, membershipId: m.id, data: { status: 'left' } }, { onSuccess: () => { refresh(); toast('Komandadan ayrıldınız'); } })}><LogOut size={12} />Komandadan ayrıl</button></div>}</div>)}
    </section>}

    <section className="surface hp-section">
      <div className="section-head"><h2><HardHat size={15} className="sm-ii" /> İş tarixçəsi</h2><span className="count-chip">{w.history.length}</span></div>
      {!manage && <p className="rl-hint">Yalnız ev sahiblərinin qəbul etdiyi və paylaşmağa icazə verdiyi işlər göstərilir. Ünvanlar göstərilmir.</p>}
      {!w.history.length ? <Empty icon={<HardHat size={24} />} title="Hələ iş yoxdur" text={manage ? 'Ev sahibi sizi işə dəvət edəndə və siz təsdiqləyəndə işlər burada görünəcək.' : 'Açıq göstərilən təsdiqlənmiş iş yoxdur.'} />
        : <ol className="hp-history">{w.history.map(h => <li key={h.workId}>
          <span className={`hp-wdot st-${h.status}`} aria-hidden />
          <div>{h.homeId ? <Link href={`/works/${h.workId}`}><b>{h.title}</b></Link> : <b>{h.title}</b>}
            <small>{[WORK_CATEGORY[h.category], PART_ROLE[h.role] ?? h.role, h.viaTeamName ? `${h.viaTeamName} adından` : '', h.startDate ? day(h.startDate) : '', h.city].filter(Boolean).join(' · ')}</small>
            <small>{h.homeName ? (h.homePublicId ? <a href={`/h/${h.homePublicId}`} target="_blank" rel="noreferrer">{h.homeName}</a> : h.homeName) : 'Ev məlumatı gizlidir'} · {WORK_STATUS[h.status]}</small></div>
        </li>)}</ol>}
    </section>

    {w.reviews.length > 0 && <section className="surface hp-section"><h2>Rəylər</h2>{w.reviews.map(r => <div key={r.id} className="hp-review"><span className="hp-stars">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={13} className={i <= r.rating ? 'on' : ''} />)}</span><b>{r.workTitle}</b>{r.reported && <Pill small tone="warn">Mübahisəli</Pill>}<p>{r.body}</p><small>{day(r.createdAt)}</small>
      {manage && !r.reported && (reporting === r.id ? <div className="hp-inline"><input className="hp-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Niyə yanlışdır?" maxLength={300} /><button type="button" className="button button-secondary sm-btn-sm" disabled={reason.trim().length < 3} onClick={() => report.mutate({ reviewId: r.id, data: { reason: reason.trim() } }, { onSuccess: () => { setReporting(null); refresh(); } })}>Göndər</button></div> : <button type="button" className="sm-link-btn" onClick={() => setReporting(r.id)}><ThumbsDown size={12} />Etiraz et</button>)}</div>)}</section>}

    {editing && <WorkerFormModal kind={w.kind as WorkerInput['kind']} worker={w} onClose={() => setEditing(false)} />}
    {adding && <Modal open onClose={() => setAdding(false)} eyebrow={w.displayName} title="Qeydiyyatlı ustanı dəvət et" wide>
      <WorkerSearch kind="individual" exclude={w.members.filter(m => m.status === 'active' || m.status === 'invited').map(m => m.member.id)} onPick={x => addMember.mutate({ workerId: w.id, data: { memberWorkerId: x.id, role: 'member' } }, { onSuccess: () => { refresh(); setAdding(false); toast('Dəvət göndərildi'); } })} />
    </Modal>}
    <HomeToaster />
  </>;
}

export function PublicWorkerPage({ workerId }: { workerId: string }) {
  return <div className="hp-public"><header className="hp-public-head"><a href="/" className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></a><span className="eyebrow">Usta profili</span></header>
    <main className="hp-public-main"><WorkerProfilePage workerId={workerId} publicView /></main>
    <footer className="hp-public-foot"><BadgeCheck size={14} />Nişanlar yalnız real yoxlamadan sonra göstərilir. Təhvil hüquqi sertifikat vermir.</footer></div>;
}
