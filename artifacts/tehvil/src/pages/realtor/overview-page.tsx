import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowUpRight, Bell, BellRing, Building2, CalendarClock, CheckCheck, Eye, FilePlus2, Megaphone, MessageCircle,
  Plus, QrCode, ShieldCheck, Sparkles, UserPlus, Users, Check, ChevronRight, X, BarChart3, UserRound,
} from 'lucide-react';
import {
  getGetRealtorOverviewQueryKey, useGetRealtorOverview, useGetRealtorProfile, useMarkRealtorNotificationsRead,
  type RealtorAppointment, type RealtorLead, type RealtorSetup,
} from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, Modal, Pill, RealtorToaster, Skeleton, StatTile } from '@/components/realtor/ui';
import { COPY, LEAD_STATUS, LEAD_TONE, SOURCE, dayShort, num, relative, timeText } from '@/lib/realtor/labels';
import { ProfileForm } from './profile-page';

export function RealtorOverviewPage() {
  const qc = useQueryClient();
  const overview = useGetRealtorOverview();
  const profile = useGetRealtorProfile();
  const markRead = useMarkRealtorNotificationsRead();
  const [, setLocation] = useLocation();
  const [welcome, setWelcome] = useState(() => new URLSearchParams(window.location.search).has('welcome'));
  const d = overview.data;
  const empty = !!d && d.profileExists && d.setup.listings === 0 && d.setup.leads === 0 && d.setup.passports === 0;
  // First visit with an empty workspace: greet once even if the user arrived another way.
  useEffect(() => { if (empty && !readFlag(WELCOME_KEY)) setWelcome(true); }, [empty]);
  const closeWelcome = () => { setFlag(WELCOME_KEY); setWelcome(false); if (window.location.search.includes('welcome')) window.history.replaceState(null, '', window.location.pathname); };
  const go = (href: string) => { setFlag(WELCOME_KEY); setWelcome(false); setLocation(href); };

  if (overview.isLoading || profile.isLoading) return <><Heading /><Skeleton rows={4} /></>;
  if (!d || !profile.data) return <><Heading /><div className="notice error-notice" role="alert"><p>Məlumatı yükləmək alınmadı.</p><button className="button button-secondary" onClick={() => { void overview.refetch(); void profile.refetch(); }}>Yenidən cəhd et</button></div></>;

  if (!d.profileExists) {
    return <>
      <div className="rl-onboard">
        <div className="rl-onboard-copy">
          <div className="eyebrow"><span className="eyebrow-dot" />{COPY.position}</div>
          <h1 className="font-display">Satışı idarə edin, güvəni sübut edin.</h1>
          <p>{COPY.pitch}</p>
          <ol className="rl-onboard-steps">
            <li><b>1</b>Profilinizi yaradın — brendiniz hər pasportda görünəcək.</li>
            <li><b>2</b>Elanlarınızı və leadlərinizi əlavə edin.</li>
            <li><b>3</b>Mənzil üçün “Təhvil Pasportu” yaradın, QR kodu paylaşın.</li>
          </ol>
        </div>
        <ProfileForm profile={profile.data} compact onSaved={() => { void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() }); setWelcome(true); }} />
      </div>
      <RealtorToaster />
    </>;
  }

  const s = d.stats;
  const welcomeModal = <Modal open={welcome} onClose={closeWelcome} eyebrow="Təhvil.az · Realtor" title={`Xoş gəlmisiniz${d.setup.firstName ? `, ${d.setup.firstName}` : ''}!`} wide>
    <p className="rl-welcome-lead">Təhvil.az-da satış prosesinizi idarə edə və hər mənzilinizi <b>“Təhvil Sertifikatlı Mənzil”</b> kimi təqdim edə bilərsiniz.</p>
    <ol className="rl-welcome-steps"><li><b>1</b>İlk elanınızı əlavə edin</li><li><b>2</b>Lead və ya müştəri əlavə edin</li><li><b>3</b>Mənzil üçün Təhvil Pasportu yaradın</li><li><b>4</b>QR kodu paylaşın</li></ol>
    <div className="rl-welcome-actions">
      <button type="button" className="rl-big-action" onClick={() => go('/realtor/listings?new=1')} data-testid="welcome-listing"><Megaphone size={22} /><b>Elan əlavə et</b><small>Mənzili satışa hazırlayın</small></button>
      <button type="button" className="rl-big-action" onClick={() => go('/realtor/leads?new=1')} data-testid="welcome-lead"><UserPlus size={22} /><b>Lead əlavə et</b><small>Müştərini qeyd edin</small></button>
      <button type="button" className="rl-big-action gold" onClick={() => go('/realtor/passports/new')} data-testid="welcome-passport"><ShieldCheck size={22} /><b>Təhvil Pasportu yarat</b><small>QR kodlu təmir tarixçəsi</small></button>
    </div>
    <button type="button" className="sm-link-btn rl-welcome-later" onClick={closeWelcome}>Sonra — dashboard-a keç</button>
  </Modal>;

  if (empty) return <>
    <Heading />
    <section className="rl-start" aria-label="Başlayın">
      <div className="rl-start-head"><div className="eyebrow">Başlayın</div><h2 className="font-display">Burada ilk 5 dəqiqədə nə edə bilərsiniz</h2><p>Bir elan və bir pasport — və alıcıya göstərəcəyiniz QR kod hazırdır.</p></div>
      <div className="rl-start-grid">
        <StartCard icon={<Megaphone size={20} />} title="İlk elanınızı əlavə edin" text="İlk mənzilinizi əlavə edin və satışa hazır edin." cta="Elan əlavə et" href="/realtor/listings?new=1" />
        <StartCard icon={<UserPlus size={20} />} title="İlk leadinizi əlavə edin" text="Müştərilərinizi bir yerdə idarə edin." cta="Lead əlavə et" href="/realtor/leads?new=1" />
        <StartCard icon={<ShieldCheck size={20} />} title="İlk Təhvil Pasportunuzu yaradın" text="Mənziliniz üçün foto sübutlu, QR kodlu təmir tarixçəsi yaradın." cta="Pasport yarat" href="/realtor/passports/new" gold />
        <StartCard icon={<MessageCircle size={20} />} title="WhatsApp-ı bağlayın" text="Yeni leadlərə avtomatik cavab verin." cta="WhatsApp bağla" href="/realtor/whatsapp?connect=1" done={d.setup.whatsappConnected} />
      </div>
    </section>
    <FirstWeek setup={d.setup} />
    {welcomeModal}
    <RealtorToaster />
  </>;

  const unread = d.notifications.filter(n => !n.read).length;
  const funnelMax = Math.max(1, ...d.funnel.map(f => f.count));
  const dailyMax = Math.max(1, ...d.daily.map(x => x.count));
  return <>
    <Heading />
    <section className="sm-stats rl-stats" aria-label="Bugünkü icmal">
      <StatTile icon={<Building2 size={17} />} label="Aktiv elanlar" value={s.activeListings} hint={`${d.setup.listings} elan cəmi`} />
      <StatTile icon={<ShieldCheck size={17} />} label="Təhvil Pasportlu elanlar" value={s.certifiedListings} hint={`${s.publishedPassports} dərc olunmuş pasport`} tone="gold" />
      <StatTile icon={<UserPlus size={17} />} label="Yeni leadlər" value={s.newLeads} hint={`Bu gün: ${s.newLeadsToday} · gözləyən: ${s.waitingLeads}`} tone="dark" />
      <StatTile icon={<CalendarClock size={17} />} label="Planlaşdırılan görüşlər" value={s.upcomingAppointments} hint="Qarşıdakı günlər" />
      <StatTile icon={<QrCode size={17} />} label="QR kod skanları" value={s.qrScans} hint="Pasport QR kodu ilə" />
      <StatTile icon={<Eye size={17} />} label="Pasport baxışları" value={num(s.passportViews)} hint={`WhatsApp klik: ${s.whatsappClicks}`} />
    </section>

    <div className="sm-dash-grid rl-dash-grid">
      <div className="rl-col">
        <section className="surface rl-panel">
          <div className="section-head"><div><div className="eyebrow">Bu gün</div><h2>Yeni leadlər</h2></div><Link href="/realtor/leads" className="text-link">Hamısı<ArrowUpRight size={14} /></Link></div>
          {d.todayLeads.length ? <div className="rl-list">{d.todayLeads.map(l => <LeadRow key={l.id} lead={l} />)}</div>
            : <Empty icon={<UserPlus size={26} />} title="Bu gün yeni lead yoxdur" text="WhatsApp, Instagram və ya pasport səhifəsindən gələn sorğular burada görünəcək." action={<Link href="/realtor/leads?new=1" className="button button-secondary sm-btn-sm"><Plus size={14} />Lead əlavə et</Link>} />}
        </section>

        {d.dueLeads.length > 0 && <section className="surface rl-panel rl-panel-warn">
          <div className="section-head"><div><div className="eyebrow"><AlertTriangle size={12} className="sm-ii" /> Diqqət tələb edir</div><h2>Növbəti addımın vaxtı çatıb</h2></div></div>
          <div className="rl-list">{d.dueLeads.map(l => <LeadRow key={l.id} lead={l} due />)}</div>
        </section>}

        <section className="surface rl-panel">
          <div className="section-head"><div><div className="eyebrow">Təqvim</div><h2>Yaxın görüşlər</h2></div><Link href="/realtor/appointments" className="text-link">Təqvim<ArrowUpRight size={14} /></Link></div>
          {d.upcoming.length ? <div className="rl-list">{d.upcoming.map(a => <ApptRow key={a.id} appt={a} />)}</div>
            : <Empty icon={<CalendarClock size={26} />} title="Planlaşdırılmış görüş yoxdur" text="Leaddən görüş təyin edin — müştəriyə WhatsApp xatırlatması gedəcək." action={<Link href="/realtor/appointments?new=1" className="button button-secondary sm-btn-sm"><Plus size={14} />Görüş planla</Link>} />}
        </section>
      </div>

      <aside className="sm-aside">
        <FirstWeek setup={d.setup} compact />
        <div className="aside-panel rl-notes">
          <div className="section-head" style={{ marginBottom: 6 }}><div><div className="eyebrow">{unread ? `${unread} oxunmamış` : 'Bildirişlər'}</div><h3>{unread ? <BellRing size={16} className="sm-ii" /> : <Bell size={16} className="sm-ii" />} Bildirişlər</h3></div>
            {unread > 0 && <button type="button" className="sm-link-btn" onClick={() => markRead.mutate(undefined, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() }); } })}><CheckCheck size={13} />Oxundu</button>}</div>
          {d.notifications.length ? <div className="sm-aside-list">{d.notifications.map(n => <Link key={n.id} href={n.href || '/realtor'} className={n.read ? '' : 'unread'}><span className="action-icon"><Bell size={14} /></span><span><strong>{n.title}</strong><small>{n.body ? `${n.body} · ` : ''}{relative(n.createdAt)}</small></span><ArrowUpRight size={14} /></Link>)}</div>
            : <p className="sm-muted" style={{ fontSize: 13, margin: 0 }}>Hələ bildiriş yoxdur. Yeni lead, podratçı təsdiqi və ev sahibi qəbulu burada görünəcək.</p>}
        </div>

        <div className="aside-panel" id="results">
          <div className="eyebrow">Son 30 gün</div>
          <h3>Nəticə paneli</h3>
          <dl className="rl-results">
            <div><dt>Gələn leadlər</dt><dd>{s.leads30d}</dd></div>
            <div><dt>Planlanan görüşlər</dt><dd>{s.appointments30d}</dd></div>
            <div><dt>Sertifikatlı elanlar</dt><dd>{s.certifiedListings}</dd></div>
            <div><dt>QR skan</dt><dd>{s.qrScans}</dd></div>
            <div><dt>Pasportlu elan baxışı</dt><dd>{num(s.passportListingViews)}</dd></div>
            <div><dt>Brendinizin görünməsi</dt><dd>{num(s.brandImpressions)}</dd></div>
            <div><dt>WhatsApp klikləri</dt><dd>{s.whatsappClicks}</dd></div>
          </dl>
          <div className="rl-spark" role="img" aria-label="Son 14 gündə pasport baxışları">{d.daily.map(x => <i key={x.key} style={{ height: `${Math.max(4, (x.count / dailyMax) * 100)}%` }} title={`${x.key}: ${x.count}`} />)}</div>
          <small className="rl-hint"><Eye size={12} className="sm-ii" /> Pasport baxışları, son 14 gün</small>
        </div>

        <div className="aside-panel">
          <div className="eyebrow">Satış qıfı</div>
          <h3>Leadlər statusa görə</h3>
          <div className="rl-funnel">{d.funnel.map(f => <div key={f.key}><span>{LEAD_STATUS[f.key]}</span><i><b style={{ width: `${(f.count / funnelMax) * 100}%` }} /></i><em>{f.count}</em></div>)}</div>
          {d.sources.length > 0 && <div className="rl-sources">{d.sources.map(x => <span key={x.key}>{SOURCE[x.key]} <b>{x.count}</b></span>)}</div>}
        </div>

        <div className="rl-diff">
          <Sparkles size={17} />
          <p><b>Adi CRM yalnız satışı idarə edir.</b> Təhvil satışı idarə edir və mənzilin etibarını sübut edir.</p>
          <Link href="/realtor/passports/new" className="button button-primary sm-btn-sm"><ShieldCheck size={14} />Pasport yarat</Link>
        </div>
      </aside>
    </div>
    {welcomeModal}
    <RealtorToaster />
  </>;
}

function Heading() {
  return <PageHeading eyebrow={COPY.position} title="İcmal" description={COPY.flow} action={<div className="heading-buttons">
    <Link href="/realtor/listings?new=1" className="button button-secondary" data-testid="button-new-listing"><Megaphone size={16} />Elan əlavə et</Link>
    <Link href="/realtor/passports/new" className="button button-primary" data-testid="button-new-passport"><FilePlus2 size={16} />Pasport yarat</Link>
  </div>} />;
}

function LeadRow({ lead, due = false }: { lead: RealtorLead; due?: boolean }) {
  return <Link href={`/realtor/leads?lead=${lead.id}`} className="rl-row">
    <span className={`rl-src rl-src-${lead.source}`}>{lead.source === 'whatsapp' ? <MessageCircle size={14} /> : <UserPlus size={14} />}</span>
    <span className="rl-row-main"><strong>{lead.fullName}</strong><small>{SOURCE[lead.source]} · {due && lead.nextAction ? lead.nextAction : [lead.district, lead.listingTitle].filter(Boolean).join(' · ') || relative(lead.createdAt)}</small></span>
    {due && lead.nextActionAt ? <Pill small tone="risk">{relative(lead.nextActionAt)}</Pill> : <Pill small tone={LEAD_TONE[lead.status]}>{LEAD_STATUS[lead.status]}</Pill>}
  </Link>;
}

function ApptRow({ appt }: { appt: RealtorAppointment }) {
  return <Link href="/realtor/appointments" className="rl-row">
    <span className="rl-time"><b>{timeText(appt.startsAt)}</b><small>{dayShort(appt.startsAt)}</small></span>
    <span className="rl-row-main"><strong>{appt.leadName || 'Müştəri'}</strong><small>{appt.listingTitle || 'Mənzil seçilməyib'}{appt.agentName ? ` · ${appt.agentName}` : ''}</small></span>
    <ArrowUpRight size={14} />
  </Link>;
}

const WELCOME_KEY = 'tehvil-realtor-welcome-seen';
const WEEK_KEY = 'tehvil-realtor-week-hidden';
function readFlag(k: string) { try { return localStorage.getItem(k) === '1'; } catch { return false; } }
function setFlag(k: string) { try { localStorage.setItem(k, '1'); } catch { /* private mode */ } }

function StartCard({ icon, title, text, cta, href, gold = false, done = false }: { icon: ReactNode; title: string; text: string; cta: string; href: string; gold?: boolean; done?: boolean }) {
  return <Link href={href} className={`rl-start-card ${gold ? 'gold' : ''} ${done ? 'done' : ''}`}>
    <span className="rl-start-icon">{done ? <Check size={20} /> : icon}</span>
    <strong>{title}</strong><p>{text}</p>
    <span className="button button-primary sm-btn-sm">{done ? 'Bağlanıb' : cta}<ChevronRight size={14} /></span>
  </Link>;
}

/** "İlk həftə planı": eight steps that turn the panel into a daily tool. */
function FirstWeek({ setup, compact = false }: { setup: RealtorSetup; compact?: boolean }) {
  const [hidden, setHidden] = useState(() => readFlag(WEEK_KEY));
  const steps = [
    { done: setup.profileComplete, title: 'Profili tamamla', hint: 'Foto və WhatsApp nömrəsi pasportda görünür', href: '/realtor/profile', icon: UserRound },
    { done: setup.listings > 0, title: 'İlk elanı əlavə et', hint: 'Tap.az / Bina.az linkindən avtomatik doldurun', href: '/realtor/listings?new=1', icon: Megaphone },
    { done: setup.leads > 0, title: 'İlk lead-i əlavə et', hint: 'Növbəti aksiya və vaxtı qeyd edin', href: '/realtor/leads?new=1', icon: UserPlus },
    { done: setup.whatsappConnected, title: 'WhatsApp-ı bağla', hint: 'Yeni leadlərə dərhal cavab', href: '/realtor/whatsapp?connect=1', icon: MessageCircle },
    { done: setup.passports > 0, title: 'İlk Təhvil Pasportunu yarat', hint: 'Təmir işləri, fotolar, təsdiqlər', href: '/realtor/passports/new', icon: ShieldCheck },
    { done: setup.publishedPassports > 0, title: 'QR kodu elana və WhatsApp-a əlavə et', hint: 'Pasportu dərc edin və paylaşın', href: '/realtor/passports', icon: QrCode },
    { done: setup.appointments > 0, title: 'İlk görüşü planla', hint: 'Müştəriyə xatırlatma gedəcək', href: '/realtor/appointments?new=1', icon: CalendarClock },
    { done: setup.passportViews > 0, title: 'Nəticələri dashboard-da izlə', hint: 'Baxışlar, QR skanları, leadlər', href: '/realtor#results', icon: BarChart3 },
  ];
  const doneCount = steps.filter(x => x.done).length;
  if (compact && (hidden || doneCount === steps.length)) return null;
  const next = steps.findIndex(x => !x.done);
  return <section className={`rl-week-plan ${compact ? 'compact aside-panel' : 'surface rl-panel'}`} aria-label="İlk həftə planı">
    <div className="section-head"><div><div className="eyebrow">İlk həftə planı · {doneCount}/{steps.length}</div><h3>{doneCount === steps.length ? 'Hazırsınız — Təhvil gündəlik iş alətinizdir' : 'Başlama planı'}</h3></div>
      {compact && <button type="button" className="icon-button" aria-label="Gizlət" title="Gizlət" onClick={() => { setFlag(WEEK_KEY); setHidden(true); }}><X size={15} /></button>}</div>
    <div className="rl-progress" role="img" aria-label={`${doneCount} / ${steps.length} addım`}><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
    <ol className="rl-plan">{steps.map((st, i) => <li key={st.title} className={`${st.done ? 'done' : ''} ${i === next ? 'next' : ''}`}>
      <Link href={st.href}><span className="rl-plan-dot">{st.done ? <Check size={13} /> : i + 1}</span><span><strong>{st.title}</strong>{(!compact || i === next) && <small>{st.hint}</small>}</span>{i === next && <ChevronRight size={15} />}</Link>
    </li>)}</ol>
  </section>;
}
