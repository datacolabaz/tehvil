import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Calculator, Check, CheckCircle2, ClipboardCheck, Hammer, History, Link2, LoaderCircle, MapPin, MessageSquareText, Pencil, Play, Plus,
  RotateCcw, ShieldCheck, Star, ThumbsDown, ThumbsUp, Trash2, UserPlus, Wrench, X,
} from 'lucide-react';
import {
  useAddWorkNote, useAddWorkParticipant, useChangeWorkStatus, useCreateHomeInvitation, useCreateReview, useCreateWork, useDeleteHomeMedia, useGetHomeOverview,
  useGetWork, useGetWorker, useListEquipment, useListSmetaProjects, useReportReview, useRespondParticipation, useUpdateWork, useUpdateWorkParticipant,
  type ParticipantInputRole, type WorkDetail, type WorkInput, type WorkNoteInputKind, type WorkStatusInputAction, type WorkerRef,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CopyButton, HomeToaster, MediaGrid, MediaUpload, Modal, Pill, Seg, Select, Skeleton, WorkStatus, WorkTrust, WorkerLine, WorkerSearch, opts, toast } from '@/components/home/ui';
import {
  NOTE_KIND, PART_ROLE, PART_ROLES, PART_STATUS, PART_TONE, ROOM_KIND, WORK_CATEGORY, WORK_KIND, WORK_STATUS, day, dayTime, range, refreshHomeData,
} from '@/lib/home/labels';

const STATUS_ACTIONS: { action: WorkStatusInputAction; perm: keyof WorkDetail['permissions']; label: string; icon: typeof Play; tone: string }[] = [
  { action: 'start', perm: 'start', label: 'İşə başlanıldı', icon: Play, tone: 'secondary' },
  { action: 'complete', perm: 'complete', label: 'Tamamlandı kimi işarələ', icon: CheckCircle2, tone: 'primary' },
  { action: 'confirm', perm: 'confirm', label: 'İşi qəbul edirəm', icon: ClipboardCheck, tone: 'primary' },
  { action: 'request_revision', perm: 'requestRevision', label: 'Düzəliş istə', icon: AlertTriangle, tone: 'secondary' },
  { action: 'reopen', perm: 'reopen', label: 'Yenidən aç', icon: RotateCcw, tone: 'quiet' },
];
const APPROVAL_LABEL: Record<string, string> = { created: 'Qeyd yaradıldı', start: 'İşə başlanıldı', complete: 'Tamamlandı', confirm: 'Ev sahibi qəbul etdi', request_revision: 'Düzəliş istənildi', reopen: 'Yenidən açıldı', inspected: 'Mütəxəssis yoxladı — qüsur yoxdur', inspection_issues: 'Mütəxəssis yoxladı — iradlar var' };
const ROLE_OF: Record<string, string> = { owner: 'Ev sahibi', technician: 'Texniki mütəxəssis', viewer: 'Ailə üzvü', performer: 'İcraçı' };

export function WorkPage({ workId }: { workId: string }) {
  const q = useGetWork(workId);
  const qc = useQueryClient();
  const status = useChangeWorkStatus();
  const respond = useRespondParticipation();
  const removeMedia = useDeleteHomeMedia();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [statusNote, setStatusNote] = useState<WorkStatusInputAction | null>(null);
  const refresh = () => void refreshHomeData(qc);
  if (q.isLoading) return <Skeleton rows={4} />;
  const w = q.data;
  if (!w) return <div className="notice error-notice" role="alert"><p>İş tapılmadı və ya baxmaq icazəniz yoxdur.</p><Link href="/homes" className="button button-secondary">Mənim evlərim</Link></div>;
  const p = w.permissions;
  const owner = w.myRole === 'owner';
  const myInvites = w.participants.filter(x => x.isMe && x.status === 'invited');
  const accepted = w.participants.some(x => x.status === 'accepted');
  const doStatus = (action: WorkStatusInputAction, note?: string) => status.mutate({ workId, data: { action, note } }, { onSuccess: () => { refresh(); setStatusNote(null); toast(action === 'confirm' ? 'İş qəbul edildi' : action === 'complete' ? 'Ev sahibinin təsdiqinə göndərildi' : 'Status yeniləndi'); } });
  return <>
    <Link href={`/homes/${w.homeId}/history`} className="hp-back"><ArrowLeft size={14} />{w.homeName} · tarixçə</Link>
    <PageHeading eyebrow={`${WORK_CATEGORY[w.category] ?? w.category} · ${WORK_KIND[w.kind] ?? w.kind}`} title={w.title}
      description={[range(w.startDate, w.endDate), w.roomName, w.visibility === 'private' ? 'Şəxsi qeyd (QR-da göstərilmir)' : ''].filter(Boolean).join(' · ')}
      action={p.edit ? <button type="button" className="button button-secondary" onClick={() => setEditing(true)} data-testid="button-edit-work"><Pencil size={15} />Redaktə et</button> : undefined} />
    <div className="hp-work-status surface">
      <div><WorkStatus status={w.status} /><WorkTrust accepted={accepted} confirmed={w.status === 'confirmed'} inspected={!!w.inspectedAt} /></div>
      <div className="hp-actions">{STATUS_ACTIONS.filter(a => p[a.perm]).map(a => <button key={a.action} type="button" className={`button button-${a.tone}`} disabled={status.isPending} data-testid={`button-status-${a.action}`}
        onClick={() => (a.action === 'request_revision' || a.action === 'reopen') ? setStatusNote(a.action) : doStatus(a.action)}><a.icon size={15} />{a.label}</button>)}</div>
      {w.status === 'completed' && owner && <p className="rl-hint">İcraçı işi tamamlandı kimi qeyd edib. Fotoları və qeydləri yoxlayıb qəbul edin və ya düzəliş istəyin. Qəbul etdikdən sonra icraçılar bu işi dəyişə bilməz.</p>}
      {w.status === 'completed' && !owner && <p className="rl-hint">Ev sahibinin təsdiqini gözləyir.</p>}
    </div>
    {myInvites.map(inv => <div key={inv.id} className="hp-invite-banner"><UserPlus size={18} /><span><b>{inv.worker.displayName}</b> adından <b>{PART_ROLE[inv.role]}</b> kimi dəvət olunmusunuz. İştirakınızı təsdiqləyin.</span>
      <div className="hp-actions"><button type="button" className="button button-primary" data-testid="button-accept-participation" onClick={() => respond.mutate({ participantId: inv.id, data: { accept: true } }, { onSuccess: () => { refresh(); toast('İştirak təsdiqləndi'); } })}><Check size={15} />Təsdiqləyirəm</button>
        <button type="button" className="button button-quiet" onClick={() => respond.mutate({ participantId: inv.id, data: { accept: false } }, { onSuccess: () => { refresh(); toast('Dəvətdən imtina edildi'); } })}><X size={15} />İştirak etməmişəm</button></div></div>)}

    <div className="hp-work-layout">
      <div className="hp-work-main">
        {(w.description || w.materials || w.location) && <section className="surface hp-section">
          <h2>İşin təsviri</h2>
          {w.description && <p className="hp-text">{w.description}</p>}
          {w.materials && <div className="hp-kv"><span>Materiallar</span><p>{w.materials}</p></div>}
          {w.location && <div className="hp-kv"><span><MapPin size={12} className="sm-ii" /> Xətlərin yeri (sözlə)</span><p>{w.location}</p></div>}
        </section>}

        <section className="surface hp-section">
          <div className="section-head"><h2>Foto və video sübutlar</h2><span className="count-chip">{w.media.length}</span></div>
          {!w.media.length && <p className="rl-hint">Hələ foto yoxdur. “Əvvəl”, “iş zamanı”, “gizli xətlər” və “sonra” fotoları işin ən güclü sübutudur.</p>}
          <MediaGrid media={w.media} canDelete={m => m.uploadedByMe || owner} onDelete={m => removeMedia.mutate({ mediaId: m.id }, { onSuccess: () => { refresh(); toast('Fayl gizlədildi'); } })} />
          {p.addMedia && <MediaUpload target={{ workId }} onDone={() => { refresh(); toast('Fayllar əlavə olundu'); }} />}
        </section>

        <NotesSection w={w} onChanged={refresh} />
        <ReviewsSection w={w} onChanged={refresh} />
      </div>

      <aside className="hp-work-aside">
        <section className="surface hp-section">
          <div className="section-head"><h2>İştirakçılar</h2>{p.manageParticipants && <button type="button" className="button button-secondary sm-btn-sm" onClick={() => setAdding(true)} data-testid="button-add-participant"><Plus size={14} />Əlavə et</button>}</div>
          {!w.participants.length && <p className="rl-hint">Hələ icraçı qeyd olunmayıb.</p>}
          <div className="hp-plist">{w.participants.map(x => <ParticipantRow key={x.id} w={w} x={x} onChanged={refresh} />)}</div>
          <p className="rl-hint">Komanda üzvlüyü avtomatik iştirak demək deyil: hər iştirakçı bu işdə öz rolu ilə ayrıca qeyd olunur.</p>
        </section>
        <section className="surface hp-section">
          <h2>Əlaqələr</h2>
          <ul className="hp-links">
            {w.roomName && w.roomId && <li><Link href={`/homes/${w.homeId}/rooms/${w.roomId}`}><Hammer size={14} />Otaq: {w.roomName}</Link></li>}
            {w.equipmentName && <li><Link href={`/homes/${w.homeId}/equipment`}><Wrench size={14} />Avadanlıq: {w.equipmentName}</Link></li>}
            {w.smetaProjectId && <li><Link href={`/smeta/${w.smetaProjectId}`}><Calculator size={14} />AI Smeta: {w.smetaProjectName}</Link></li>}
            {!w.roomName && !w.equipmentName && !w.smetaProjectId && <li className="rl-hint">Otaq, avadanlıq və ya smeta bağlanmayıb.</li>}
          </ul>
        </section>
        <section className="surface hp-section">
          <h2><History size={15} className="sm-ii" /> Status tarixçəsi</h2>
          <ol className="hp-approvals">{w.approvals.map(a => <li key={a.id}><b>{APPROVAL_LABEL[a.action] ?? a.action}</b><small>{ROLE_OF[a.actorRole] ?? a.actorRole} · {dayTime(a.createdAt)}</small>{a.note && <p>{a.note}</p>}</li>)}</ol>
          <p className="rl-hint">Təsdiqlər hesab səviyyəsində qeyd olunur; bu, hüquqi elektron imza deyil.</p>
        </section>
      </aside>
    </div>

    {editing && <WorkFormModal homeId={w.homeId} work={w} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
    {adding && <AddParticipantModal w={w} onClose={() => setAdding(false)} onChanged={refresh} />}
    {statusNote && <StatusNoteModal action={statusNote} busy={status.isPending} onClose={() => setStatusNote(null)} onSubmit={note => doStatus(statusNote, note)} />}
    <HomeToaster />
  </>;
}

function StatusNoteModal({ action, onClose, onSubmit, busy }: { action: WorkStatusInputAction; onClose: () => void; onSubmit: (note: string) => void; busy: boolean }) {
  const [note, setNote] = useState('');
  const revision = action === 'request_revision';
  return <Modal open onClose={onClose} eyebrow="Status" title={revision ? 'Nəyi düzəltmək lazımdır?' : 'İşi yenidən açmaq'}
    footer={<button type="button" className="button button-primary" disabled={busy || (revision && !note.trim())} onClick={() => onSubmit(note.trim())} data-testid="button-confirm-status">{busy && <LoaderCircle className="spin" size={15} />}{revision ? 'Düzəliş istə' : 'Yenidən aç'}</button>}>
    <Field label={revision ? 'Qüsur və ya düzəliş tələbi' : 'Səbəb (istəyə görə)'} name="status-note"><textarea rows={4} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></Field>
  </Modal>;
}

function ParticipantRow({ w, x, onChanged }: { w: WorkDetail; x: WorkDetail['participants'][number]; onChanged: () => void }) {
  const update = useUpdateWorkParticipant();
  const invite = useCreateHomeInvitation();
  const [link, setLink] = useState('');
  const owner = w.myRole === 'owner';
  const removed = x.status === 'removed' || x.status === 'declined';
  return <div className={`hp-prow ${removed ? 'muted' : ''}`}>
    <WorkerLine w={x.worker} href={x.worker.registered ? `/workers/${x.worker.id}` : null}
      sub={<>{PART_ROLE[x.role] ?? x.role}{x.viaTeamName ? ` · ${x.viaTeamName} adından` : ''}{x.phone ? ` · ${x.phone}` : ''}</>}
      right={<Pill small tone={PART_TONE[x.status]}>{PART_STATUS[x.status] ?? x.status}</Pill>} />
    {x.note && <small className="rl-hint">{x.note}</small>}
    {owner && !removed && <div className="hp-prow-actions">
      <select aria-label="Rol" value={x.role} onChange={e => update.mutate({ workId: w.id, participantId: x.id, data: { role: e.target.value as ParticipantInputRole } }, { onSuccess: onChanged })}>{PART_ROLES.map(r => <option key={r} value={r}>{PART_ROLE[r]}</option>)}</select>
      {x.status === 'recorded' && <button type="button" className="sm-link-btn" data-testid="button-claim-link" onClick={() => invite.mutate({ homeId: w.homeId, data: { kind: 'work', workId: w.id, role: x.role as ParticipantInputRole, name: x.worker.displayName, placeholderWorkerId: x.worker.id } }, { onSuccess: r => setLink(r.url) })}><Link2 size={13} />Profilə bağlamaq üçün link</button>}
      <button type="button" className="sm-link-btn danger" onClick={() => update.mutate({ workId: w.id, participantId: x.id, data: { status: 'removed' } }, { onSuccess: () => { onChanged(); toast('İştirakçı çıxarıldı (tarixçədə qalır)'); } })}><Trash2 size={13} />Çıxar</button>
    </div>}
    {link && <div className="hp-linkbox"><small>Bu linki {x.worker.displayName} ilə paylaşın. Usta öz hesabı ilə açıb təsdiqləyəndə bu qeyd onun profilinə bağlanacaq. Eyni adlı başqa profillər avtomatik birləşdirilmir.</small><code>{link}</code><CopyButton text={link} /></div>}
  </div>;
}

function AddParticipantModal({ w, onClose, onChanged }: { w: WorkDetail; onClose: () => void; onChanged: () => void }) {
  const add = useAddWorkParticipant();
  const invite = useCreateHomeInvitation();
  const owner = w.myRole === 'owner';
  const myTeam = w.participants.find(x => x.isMe && x.status === 'accepted' && x.worker.kind !== 'individual');
  const team = useGetWorker(myTeam?.worker.id ?? '', { query: { enabled: !owner && !!myTeam, queryKey: [`/api/workers/${myTeam?.worker.id}`] } });
  const [tab, setTab] = useState<'registered' | 'placeholder' | 'link'>(owner ? 'registered' : 'registered');
  const [role, setRole] = useState<ParticipantInputRole>(owner ? 'lead' : 'team_member');
  const [picked, setPicked] = useState<WorkerRef | null>(null);
  const [ph, setPh] = useState({ name: '', phone: '', specialty: '' });
  const [inv, setInv] = useState({ name: '', contact: '' });
  const [link, setLink] = useState('');
  const existing = w.participants.filter(x => x.status !== 'removed' && x.status !== 'declined').map(x => x.worker.id);
  const done = () => { onChanged(); toast('İştirakçı əlavə olundu'); onClose(); };
  const roles = (owner ? PART_ROLES : ['team_lead', 'team_member', 'assistant'] as const).map(r => [r, PART_ROLE[r]] as [ParticipantInputRole, string]);
  return <Modal open onClose={onClose} eyebrow={w.title} title="İştirakçı əlavə et" wide>
    {owner && <div className="rl-seg hp-tabs" role="tablist">{([['registered', 'Qeydiyyatlı usta'], ['placeholder', 'Qeydiyyatsız usta'], ['link', 'Dəvət linki']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}
    <Select label="Bu işdəki rolu" name="participant-role" value={role} onChange={v => setRole(v as ParticipantInputRole)} options={roles} />
    {!owner && myTeam && <>
      <p className="rl-hint">Yalnız “{myTeam.worker.displayName}” komandasının aktiv üzvlərini əlavə edə bilərsiniz. Hər üzv iştirakını öz hesabından təsdiqləyəcək.</p>
      <div className="hp-search-list">{(team.data?.members ?? []).filter(m => m.status === 'active' && m.member.kind === 'individual' && !existing.includes(m.member.id)).map(m => <button key={m.id} type="button" className="hp-search-item" data-testid={`pick-member-${m.member.id}`} disabled={add.isPending}
        onClick={() => add.mutate({ workId: w.id, data: { workerId: m.member.id, role, viaTeamId: myTeam.worker.id } }, { onSuccess: done })}><span><strong>{m.member.displayName}</strong><small>{m.member.specialties.join(', ')}</small></span><Plus size={15} /></button>)}</div>
    </>}
    {owner && tab === 'registered' && (picked ? <div className="hp-picked"><WorkerLine w={picked} right={<button type="button" className="icon-button" aria-label="Dəyiş" onClick={() => setPicked(null)}><X size={15} /></button>} />
      <button type="button" className="button button-primary full-button" disabled={add.isPending} data-testid="button-invite-worker" onClick={() => add.mutate({ workId: w.id, data: { workerId: picked.id, role } }, { onSuccess: done })}>{add.isPending && <LoaderCircle className="spin" size={15} />}Dəvət göndər</button>
      <small className="rl-hint">Usta dəvəti “Dəvətlər” bölməsində görəcək və iştirakını təsdiqləyəndən sonra “İştirakı təsdiqləyib” kimi göstəriləcək.</small></div>
      : <WorkerSearch onPick={setPicked} exclude={existing} />)}
    {owner && tab === 'placeholder' && <form className="rl-form" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate({ workId: w.id, data: { placeholder: { name: ph.name.trim(), phone: ph.phone.trim(), specialty: ph.specialty.trim() }, role } }, { onSuccess: done }); }}>
      <p className="rl-hint">Usta Təhvil-də qeydiyyatdan keçməyibsə, onu öz qeydiniz kimi əlavə edin. Profil “Qeydiyyatsız” göstəriləcək; telefonu yalnız siz görəcəksiniz. Sonra ona link göndərib qeydi onun hesabına bağlaya bilərsiniz.</p>
      <div className="field-grid three">
        <Field label="Ad, soyad" name="ph-name" required value={ph.name} onChange={v => setPh({ ...ph, name: v })} />
        <Field label="Telefon (məxfi)" name="ph-phone" type="tel" value={ph.phone} onChange={v => setPh({ ...ph, phone: v })} />
        <Field label="İxtisas" name="ph-specialty" value={ph.specialty} onChange={v => setPh({ ...ph, specialty: v })} placeholder="məs. santexnik" />
      </div>
      <button type="submit" className="button button-primary full-button" disabled={add.isPending || ph.name.trim().length < 2} data-testid="button-add-placeholder">Qeyd et</button>
    </form>}
    {owner && tab === 'link' && (link ? <div className="hp-linkbox"><small>Linki ustaya göndərin (WhatsApp, SMS). Usta qeydiyyatdan keçib və ya daxil olub təsdiqləyəndə bu işə öz profili ilə qoşulacaq. Link 14 gün etibarlıdır və bir dəfə istifadə olunur.</small><code>{link}</code><CopyButton text={link} />
      <a className="button button-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Salam! “${w.title}” işini Təhvil-də evin pasportuna qeyd edirəm. İştirakınızı bu linklə təsdiqləyin: ${link}`)}`}>WhatsApp ilə göndər</a></div>
      : <form className="rl-form" onSubmit={(e: FormEvent) => { e.preventDefault(); invite.mutate({ homeId: w.homeId, data: { kind: 'work', workId: w.id, role, name: inv.name.trim(), contact: inv.contact.trim() } }, { onSuccess: r => setLink(r.url) }); }}>
        <div className="field-grid"><Field label="Kimə (ad)" name="inv-name" value={inv.name} onChange={v => setInv({ ...inv, name: v })} /><Field label="Telefon və ya e-poçt (qeyd üçün)" name="inv-contact" value={inv.contact} onChange={v => setInv({ ...inv, contact: v })} /></div>
        <button type="submit" className="button button-primary full-button" disabled={invite.isPending} data-testid="button-create-work-invite">Link yarat</button>
      </form>)}
  </Modal>;
}

function NotesSection({ w, onChanged }: { w: WorkDetail; onChanged: () => void }) {
  const add = useAddWorkNote();
  const [kind, setKind] = useState<WorkNoteInputKind>('note');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<'passed' | 'issues'>('passed');
  const p = w.permissions;
  const kinds: [WorkNoteInputKind, string][] = [['note', NOTE_KIND.note], ['defect', NOTE_KIND.defect], ['fix', NOTE_KIND.fix], ...(p.inspect ? [['inspection', NOTE_KIND.inspection] as [WorkNoteInputKind, string]] : [])];
  const icon = (k: string) => k === 'defect' ? <AlertTriangle size={14} /> : k === 'fix' ? <Wrench size={14} /> : k === 'inspection' ? <ShieldCheck size={14} /> : <MessageSquareText size={14} />;
  return <section className="surface hp-section">
    <div className="section-head"><h2>Qeydlər, nasazlıqlar və yoxlamalar</h2><span className="count-chip">{w.notes.length}</span></div>
    <ol className="hp-notes">{w.notes.map(n => <li key={n.id} className={`nk-${n.kind} ${n.result ?? ''}`}><span className="hp-note-icon">{icon(n.kind)}</span><div><b>{NOTE_KIND[n.kind]}{n.result ? (n.result === 'passed' ? ' — qüsur yoxdur' : ' — iradlar var') : ''}</b><small>{ROLE_OF[n.authorRole] ?? n.authorRole}{n.authorIsMe ? ' (siz)' : ''} · {dayTime(n.createdAt)}</small><p>{n.body}</p></div></li>)}</ol>
    {p.addNote && <form className="rl-form hp-note-form" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate({ workId: w.id, data: { kind, body: body.trim(), ...(kind === 'inspection' ? { result } : {}) } }, { onSuccess: () => { setBody(''); onChanged(); toast('Qeyd əlavə olundu'); } }); }}>
      <Seg label="Növ" value={kind} options={kinds} onChange={setKind} />
      {kind === 'inspection' && <Seg label="Nəticə" value={result} options={[['passed', 'Qüsur yoxdur'], ['issues', 'İradlar var']]} onChange={setResult} />}
      <Field label="Mətn" name="note-body"><textarea rows={3} maxLength={4000} value={body} onChange={e => setBody(e.target.value)} placeholder={kind === 'defect' ? 'məs. Hamamda kafel arasından su sızır' : ''} /></Field>
      <button type="submit" className="button button-secondary" disabled={add.isPending || !body.trim()} data-testid="button-add-note"><Plus size={14} />Əlavə et</button>
    </form>}
  </section>;
}

function ReviewsSection({ w, onChanged }: { w: WorkDetail; onChanged: () => void }) {
  const create = useCreateReview();
  const report = useReportReview();
  const candidates = w.participants.filter(x => x.status === 'accepted' && !x.isMe && !w.reviews.some(r => r.mine && r.workerId === x.worker.id));
  const [workerId, setWorkerId] = useState('');
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const mineIds = new Set(w.participants.filter(x => x.isMe).map(x => x.worker.id));
  const name = (id: string) => w.participants.find(x => x.worker.id === id)?.worker.displayName ?? '';
  if (!w.reviews.length && !(w.permissions.review && candidates.length)) return null;
  return <section className="surface hp-section">
    <h2>Rəylər</h2>
    {w.reviews.map(r => <div key={r.id} className="hp-review"><span className="hp-stars" aria-label={`${r.rating}/5`}>{[1, 2, 3, 4, 5].map(i => <Star key={i} size={13} className={i <= r.rating ? 'on' : ''} />)}</span><b>{name(r.workerId)}</b>{r.reported && <Pill small tone="warn">Mübahisəli</Pill>}<p>{r.body}</p><small>{day(r.createdAt)}</small>
      {mineIds.has(r.workerId) && !r.reported && (reporting === r.id ? <div className="hp-inline"><input className="hp-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Niyə yanlışdır?" maxLength={300} /><button type="button" className="button button-secondary sm-btn-sm" disabled={reason.trim().length < 3} onClick={() => report.mutate({ reviewId: r.id, data: { reason: reason.trim() } }, { onSuccess: () => { setReporting(null); onChanged(); toast('Rəy mübahisəli kimi qeyd olundu'); } })}>Göndər</button></div>
        : <button type="button" className="sm-link-btn" onClick={() => setReporting(r.id)}><ThumbsDown size={12} />Rəyə etiraz et</button>)}
    </div>)}
    {w.permissions.review && candidates.length > 0 && <form className="rl-form" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate({ workId: w.id, data: { workerId: workerId || candidates[0].worker.id, rating, body: body.trim() } }, { onSuccess: () => { setBody(''); onChanged(); toast('Rəy yazıldı'); } }); }}>
      <Select label="Kimə rəy yazırsınız" name="review-worker" value={workerId || candidates[0].worker.id} onChange={setWorkerId} options={candidates.map(c => [c.worker.id, c.worker.displayName])} />
      <div className="field"><span>Qiymət</span><span className="hp-stars big">{[1, 2, 3, 4, 5].map(i => <button key={i} type="button" aria-label={`${i} ulduz`} onClick={() => setRating(i)}><Star size={20} className={i <= rating ? 'on' : ''} /></button>)}</span></div>
      <Field label="Rəy" name="review-body"><textarea rows={3} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} /></Field>
      <button type="submit" className="button button-secondary" disabled={create.isPending} data-testid="button-add-review"><ThumbsUp size={14} />Rəy yaz</button>
      <small className="rl-hint">Rəy yalnız bu evin üzvü tərəfindən, qəbul edilmiş işə və hər ustaya bir dəfə yazıla bilər.</small>
    </form>}
  </section>;
}

/* ------------------------------------------------------------------ form */

const blank = { title: '', category: 'general', kind: 'renovation', roomId: '', equipmentId: '', description: '', materials: '', location: '', startDate: '', endDate: '', visibility: 'public', status: 'planned', smetaProjectId: '' };

export function WorkFormModal({ homeId, work, onClose, onSaved, roomId, kind }: { homeId: string; work?: WorkDetail; onClose: () => void; onSaved: (id: string) => void; roomId?: string; kind?: string }) {
  const create = useCreateWork();
  const update = useUpdateWork();
  const home = useGetHomeOverview(homeId);
  const equipment = useListEquipment(homeId);
  const owner = home.data?.home.myRole === 'owner';
  const smeta = useListSmetaProjects({ query: { enabled: owner, queryKey: ['/api/smeta/projects'] } });
  const [form, setForm] = useState(() => work ? {
    title: work.title, category: work.category, kind: work.kind, roomId: work.roomId ?? '', equipmentId: work.equipmentId ?? '', description: work.description, materials: work.materials,
    location: work.location, startDate: work.startDate ?? '', endDate: work.endDate ?? '', visibility: work.visibility, status: 'planned', smetaProjectId: work.smetaProjectId ?? '',
  } : { ...blank, roomId: roomId ?? '', kind: kind ?? blank.kind });
  const set = (k: keyof typeof blank) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data: WorkInput = {
      title: form.title.trim(), category: form.category as WorkInput['category'], kind: form.kind as WorkInput['kind'], roomId: form.roomId || null, equipmentId: form.equipmentId || null,
      description: form.description, materials: form.materials, location: form.location, startDate: form.startDate || null, endDate: form.endDate || null, visibility: form.visibility as WorkInput['visibility'],
      ...(work ? {} : { status: form.status as WorkInput['status'] }), ...(owner ? { smetaProjectId: form.smetaProjectId || null } : {}),
    };
    const done = { onSuccess: (w: WorkDetail) => { toast(work ? 'İş qeydi yeniləndi' : 'İş qeydi yaradıldı'); onSaved(w.id); } };
    if (work) update.mutate({ workId: work.id, data }, done); else create.mutate({ homeId, data }, done);
  };
  const busy = create.isPending || update.isPending;
  return <Modal open onClose={onClose} eyebrow={home.data?.home.name ?? 'İş qeydi'} title={work ? 'İş qeydini redaktə et' : 'Yeni iş qeydi'} wide
    footer={<button type="submit" form="work-form" className="button button-primary" disabled={busy || form.title.trim().length < 2} data-testid="button-save-work">{busy && <LoaderCircle className="spin" size={15} />}Yadda saxla</button>}>
    <form id="work-form" className="rl-form" onSubmit={submit}>
      {work?.status === 'confirmed' && <p className="rl-warn"><AlertTriangle size={15} />Bu iş artıq qəbul edilib. Dəyişikliklər audit jurnalında “təsdiqdən sonra dəyişiklik” kimi qeyd olunacaq.</p>}
      <Field label="İşin adı" name="work-title" required value={form.title} onChange={set('title')} placeholder="məs. Mətbəxdə elektrik xətlərinin yenilənməsi" />
      <div className="field-grid three">
        <Select label="Kateqoriya" name="work-category" value={form.category} onChange={set('category')} options={opts(WORK_CATEGORY)} />
        <Select label="Növ" name="work-kind" value={form.kind} onChange={set('kind')} options={opts(WORK_KIND)} />
        <Select label="Otaq" name="work-room" value={form.roomId} onChange={set('roomId')} empty="Bütün ev / seçilməyib" options={(home.data?.rooms ?? []).map(r => [r.id, `${r.name} (${ROOM_KIND[r.kind] ?? r.kind})`])} />
      </div>
      <div className="field-grid three">
        <Field label="Başlama tarixi" name="work-start" type="date" value={form.startDate} onChange={set('startDate')} />
        <Field label="Bitmə tarixi" name="work-end" type="date" value={form.endDate} onChange={set('endDate')} />
        {!work ? <Select label="Status" name="work-status" value={form.status} onChange={set('status')} options={[['planned', WORK_STATUS.planned], ['in_progress', WORK_STATUS.in_progress]]} />
          : <Select label="Görünmə" name="work-visibility" value={form.visibility} onChange={set('visibility')} options={[['public', 'QR-da göstərilə bilər'], ['private', 'Şəxsi qeyd']]} />}
      </div>
      <Field label="Görülən işin təsviri" name="work-description"><textarea rows={3} maxLength={6000} value={form.description} onChange={e => set('description')(e.target.value)} /></Field>
      <div className="field-grid">
        <Field label="Materiallar" name="work-materials"><textarea rows={2} maxLength={3000} value={form.materials} onChange={e => set('materials')(e.target.value)} placeholder="məs. VVG 3×2.5 kabel, Schneider avtomatlar" /></Field>
        <Field label="Gizli xətlərin yeri (sözlə)" name="work-location"><textarea rows={2} maxLength={2000} value={form.location} onChange={e => set('location')(e.target.value)} placeholder="məs. Sol divar boyunca döşəmədən 30 sm" /></Field>
      </div>
      <div className="field-grid">
        <Select label="Avadanlıq (texniki xidmət / təmir üçün)" name="work-equipment" value={form.equipmentId} onChange={set('equipmentId')} empty="Seçilməyib" options={(equipment.data ?? []).map(e => [e.id, e.name])} />
        {owner && <Select label="AI Smeta layihəsi" name="work-smeta" value={form.smetaProjectId} onChange={set('smetaProjectId')} empty="Bağlanmayıb" options={(smeta.data ?? []).map(s => [s.id, s.name])} />}
      </div>
    </form>
  </Modal>;
}
