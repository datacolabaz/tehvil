import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Show } from '@clerk/react';
import { BellRing, Check, ClipboardCheck, HardHat, Home, LoaderCircle, LogIn, UserPlus, UsersRound, X } from 'lucide-react';
import { useAcceptHomeInvitation, useGetHomeInvitation, useGetMyInbox, useGetMyWorkers, useListMyWorks, useRespondMembership, useRespondParticipation } from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { Empty, HomeToaster, Pill, Skeleton, WorkerLine, toast } from '@/components/home/ui';
import { HOME_ROLE, MEMBER_ROLE, PART_ROLE, PART_STATUS, PART_TONE, WORKER_KIND, day, refreshHomeData } from '@/lib/home/labels';
import { WorkRow } from './home-pages';

export function MyWorksPage() {
  const q = useListMyWorks();
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  if (q.isLoading) return <Skeleton rows={3} />;
  const list = (q.data ?? []).filter(x => filter === 'all' || (filter === 'done' ? x.work.status === 'confirmed' : x.work.status !== 'confirmed'));
  return <>
    <PageHeading eyebrow="Usta paneli" title="Mənim işlərim" description="İştirak etdiyiniz bütün işlər — fərdi profilinizlə və ya idarə etdiyiniz briqada / şirkət adından, bütün evlər üzrə." />
    <div className="rl-seg hp-tabs" role="tablist">{([['all', 'Hamısı'], ['open', 'Davam edir'], ['done', 'Qəbul edilib']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
    {!list.length ? <Empty icon={<HardHat size={28} />} title="İş yoxdur" text="Ev sahibi sizi işə dəvət edəndə burada görünəcək. Usta profiliniz yoxdursa, “Ustalar və briqadalar” bölməsindən yaradın." action={<Link href="/workers" className="button button-secondary">Usta profili</Link>} />
      : <div className="hp-wlist">{list.map(x => <div key={`${x.work.id}-${x.worker.id}`} className="hp-mywork">
        <WorkRow w={x.work} showHome={x.homeName} />
        <small className="hp-mywork-meta">{x.worker.displayName} ({WORKER_KIND[x.worker.kind]}) · {PART_ROLE[x.role] ?? x.role} · <Pill small tone={PART_TONE[x.participantStatus]}>{PART_STATUS[x.participantStatus]}</Pill></small>
      </div>)}</div>}
  </>;
}

export function InboxPage({ tab }: { tab: 'invitations' | 'approvals' }) {
  const q = useGetMyInbox();
  const respond = useRespondParticipation();
  const respondM = useRespondMembership();
  const qc = useQueryClient();
  const refresh = () => void refreshHomeData(qc);
  if (q.isLoading) return <Skeleton rows={3} />;
  const d = q.data!;
  return <>
    <PageHeading eyebrow="Gələnlər" title={tab === 'invitations' ? 'Dəvətlər' : 'Təsdiq gözləyən qeydlər'} description={tab === 'invitations' ? 'Sizi işlərə və komandalara dəvət edənlər. Qəbul etdikdən sonra iş sizin tarixçənizə düşür.' : 'Ustaların tamamlandı kimi qeyd etdiyi işlər. Fotolara baxın, qəbul edin və ya düzəliş istəyin.'} />
    <div className="rl-seg hp-tabs" role="tablist"><Link href="/invitations" className={tab === 'invitations' ? 'on' : ''}>Dəvətlər ({d.participations.length + d.memberships.length})</Link><Link href="/approvals" className={tab === 'approvals' ? 'on' : ''}>Təsdiq gözləyənlər ({d.approvals.length})</Link></div>
    {tab === 'invitations' ? (!d.participations.length && !d.memberships.length ? <Empty icon={<BellRing size={28} />} title="Yeni dəvət yoxdur" text="Ev sahibi sizi işə və ya briqada rəhbəri komandaya dəvət edəndə burada görünəcək." />
      : <div className="hp-inbox">
        {d.participations.map(p => <article key={p.participantId} className="surface hp-inbox-item" data-testid={`invite-${p.participantId}`}>
          <HardHat size={18} /><div><b><Link href={`/works/${p.workId}`}>{p.workTitle}</Link></b><small>{p.homeName} · {PART_ROLE[p.role]} · {p.worker.displayName} ({WORKER_KIND[p.worker.kind]}) · {day(p.invitedAt)}</small></div>
          <div className="hp-actions"><button type="button" className="button button-primary sm-btn-sm" disabled={respond.isPending} onClick={() => respond.mutate({ participantId: p.participantId, data: { accept: true } }, { onSuccess: () => { refresh(); toast('İştirak təsdiqləndi'); } })} data-testid={`accept-${p.participantId}`}><Check size={14} />Təsdiqləyirəm</button>
            <button type="button" className="button button-quiet sm-btn-sm" onClick={() => respond.mutate({ participantId: p.participantId, data: { accept: false } }, { onSuccess: refresh })}><X size={14} />İmtina</button></div>
        </article>)}
        {d.memberships.map(m => <article key={m.membershipId} className="surface hp-inbox-item">
          <UsersRound size={18} /><div><b><Link href={`/workers/${m.group.id}`}>{m.group.displayName}</Link></b><small>{WORKER_KIND[m.group.kind]} · {MEMBER_ROLE[m.role]} kimi · {day(m.createdAt)}</small></div>
          <div className="hp-actions"><button type="button" className="button button-primary sm-btn-sm" onClick={() => respondM.mutate({ membershipId: m.membershipId, data: { accept: true } }, { onSuccess: () => { refresh(); toast('Komandaya qoşuldunuz'); } })}><Check size={14} />Qəbul et</button>
            <button type="button" className="button button-quiet sm-btn-sm" onClick={() => respondM.mutate({ membershipId: m.membershipId, data: { accept: false } }, { onSuccess: refresh })}><X size={14} />İmtina</button></div>
        </article>)}
      </div>)
      : (!d.approvals.length ? <Empty icon={<ClipboardCheck size={28} />} title="Təsdiq gözləyən iş yoxdur" text="Usta işi tamamlandı kimi qeyd edəndə burada görünəcək." />
        : <div className="hp-wlist">{d.approvals.map(a => <WorkRow key={a.work.id} w={a.work} showHome={a.homeName} />)}</div>)}
    <HomeToaster />
  </>;
}

/* --------------------------------------------------- /invite/:token page */

export function InviteAcceptPage({ token }: { token: string }) {
  const q = useGetHomeInvitation(token);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const back = encodeURIComponent(`/invite/${token}`);
  return <div className="hp-public"><header className="hp-public-head"><a href={`${base}/`} className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></a><span className="eyebrow">Dəvət</span></header>
    <main className="hp-public-main hp-invite-page">
      {q.isLoading ? <Skeleton rows={2} /> : !q.data ? <div className="notice error-notice"><p>Dəvət tapılmadı. Linki göndərən şəxsdən yenisini istəyin.</p></div> : (() => {
        const inv = q.data;
        const dead = inv.status !== 'pending' || inv.expired;
        const what = inv.kind === 'work' ? <>Sizi <b>{inv.homeName}</b> evində <b>“{inv.workTitle}”</b> işinə <b>{PART_ROLE[inv.role] ?? inv.role}</b> kimi qeyd edir.</>
          : inv.kind === 'member' ? <>Sizi <b>{inv.homeName}</b> evinə <b>{HOME_ROLE[inv.role] ?? inv.role}</b> kimi əlavə edir.</>
            : <>Sizi <b>{inv.groupName}</b> {inv.groupKind === 'company' ? 'şirkətinə' : 'briqadasına'} <b>{MEMBER_ROLE[inv.role]?.toLowerCase()}</b> kimi dəvət edir.</>;
        return <section className="surface hp-section">
          <div className="hp-invite-icon">{inv.kind === 'member' ? <Home size={26} /> : inv.kind === 'team' ? <UsersRound size={26} /> : <UserPlus size={26} />}</div>
          <h1 className="font-display">{inv.name ? `${inv.name}, ` : ''}sizi Təhvil-ə dəvət edirlər</h1>
          <p>{what}</p>
          {inv.placeholderName && <p className="rl-hint">Ev sahibi bu işdə sizi “{inv.placeholderName}” adı ilə qeyd edib. Qəbul etdikdə həmin qeyd(lər) sizin profilinizə bağlanacaq; digər işləri ayrıca təsdiqləyəcəksiniz.</p>}
          {dead ? <div className="notice manual-notice">Bu dəvət artıq istifadə olunub, ləğv edilib və ya müddəti bitib.</div> : <>
            <Show when="signed-out"><div className="hp-actions"><a href={`${base}/sign-up?redirect=${back}`} className="button button-primary"><UserPlus size={15} />Qeydiyyatdan keç</a><a href={`${base}/sign-in?redirect=${back}`} className="button button-secondary"><LogIn size={15} />Daxil ol</a></div>
              <p className="rl-hint">Telefon nömrəniz və digər şəxsi məlumatlarınız avtomatik olaraq heç kimə göstərilmir.</p></Show>
            <Show when="signed-in"><AcceptBox token={token} kind={inv.kind} placeholder={!!inv.placeholderName} /></Show>
          </>}
        </section>;
      })()}
    </main></div>;
}

function AcceptBox({ token, kind, placeholder }: { token: string; kind: string; placeholder: boolean }) {
  const mine = useGetMyWorkers();
  const accept = useAcceptHomeInvitation();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [workerId, setWorkerId] = useState('');
  const [draft, setDraft] = useState({ displayName: '', specialties: '', city: 'Bakı', phone: '' });
  if (mine.isLoading) return <LoaderCircle className="spin" size={18} />;
  const ind = mine.data?.individual;
  const needsProfile = kind !== 'member' && !ind;
  const choices = kind === 'work' && !placeholder ? [...(ind ? [{ id: ind.id, name: `${ind.displayName} (fərdi)` }] : []), ...(mine.data?.managed ?? []).map(c => ({ id: c.worker.id, name: `${c.worker.displayName} (${WORKER_KIND[c.worker.kind]})` }))] : [];
  const go = () => accept.mutate({ token, data: needsProfile ? { createProfile: { displayName: draft.displayName.trim(), specialties: draft.specialties.split(',').map(s => s.trim()).filter(Boolean), city: draft.city, phone: draft.phone } } : workerId ? { workerId } : {} },
    { onSuccess: r => { void refreshHomeData(qc); toast('Dəvət qəbul edildi'); setLocation(r.redirect); } });
  return <div className="rl-form">
    {needsProfile && <>
      <p className="rl-hint">Usta profiliniz yoxdur. Qısa profil yaradın — sonra istənilən vaxt tamamlaya bilərsiniz. VÖEN tələb olunmur.</p>
      <div className="field-grid"><Field label="Ad, soyad" name="draft-name" required value={draft.displayName} onChange={v => setDraft({ ...draft, displayName: v })} /><Field label="İxtisas (vergüllə)" name="draft-specialties" value={draft.specialties} onChange={v => setDraft({ ...draft, specialties: v })} placeholder="santexnika" /></div>
      <div className="field-grid"><Field label="Şəhər" name="draft-city" value={draft.city} onChange={v => setDraft({ ...draft, city: v })} /><Field label="Telefon (məxfi)" name="draft-phone" type="tel" value={draft.phone} onChange={v => setDraft({ ...draft, phone: v })} /></div>
    </>}
    {choices.length > 1 && <label className="field"><span>Hansı profil adından</span><select value={workerId || choices[0].id} onChange={e => setWorkerId(e.target.value)}>{choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    <button type="button" className="button button-primary full-button" disabled={accept.isPending || (needsProfile && draft.displayName.trim().length < 2)} onClick={go} data-testid="button-accept-invite">{accept.isPending && <LoaderCircle className="spin" size={15} />}<Check size={15} />Dəvəti qəbul et</button>
  </div>;
}
