import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowUpRight, Bell, BellRing, Building2, CalendarClock, CheckCheck, Eye, FilePlus2, Megaphone, MessageCircle,
  Plus, QrCode, ShieldCheck, Sparkles, UserPlus, Users,
} from 'lucide-react';
import {
  getGetRealtorOverviewQueryKey, useGetRealtorOverview, useGetRealtorProfile, useMarkRealtorNotificationsRead,
  type RealtorAppointment, type RealtorLead,
} from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, Pill, RealtorToaster, Skeleton, StatTile } from '@/components/realtor/ui';
import { COPY, LEAD_STATUS, LEAD_TONE, SOURCE, dayShort, num, relative, timeText } from '@/lib/realtor/labels';
import { ProfileForm } from './profile-page';

export function RealtorOverviewPage() {
  const qc = useQueryClient();
  const overview = useGetRealtorOverview();
  const profile = useGetRealtorProfile();
  const markRead = useMarkRealtorNotificationsRead();
  const d = overview.data;

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
        <ProfileForm profile={profile.data} compact onSaved={() => { void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() }); }} />
      </div>
      <RealtorToaster />
    </>;
  }

  const s = d.stats;
  const unread = d.notifications.filter(n => !n.read).length;
  const funnelMax = Math.max(1, ...d.funnel.map(f => f.count));
  const dailyMax = Math.max(1, ...d.daily.map(x => x.count));
  return <>
    <Heading />
    <section className="sm-stats rl-stats" aria-label="Bugünkü icmal">
      <StatTile icon={<UserPlus size={17} />} label="Bugünkü yeni leadlər" value={s.newLeadsToday} hint={`Son 30 gün: ${s.leads30d}`} tone="dark" />
      <StatTile icon={<Users size={17} />} label="Gözləmədə olan müştərilər" value={s.waitingLeads} hint="Yeni və cavab gözləyən" tone={s.waitingLeads > 5 ? 'alert' : undefined} />
      <StatTile icon={<CalendarClock size={17} />} label="Planlaşdırılan görüşlər" value={s.upcomingAppointments} hint="Qarşıdakı günlər" />
      <StatTile icon={<Building2 size={17} />} label="Aktual elanlar" value={s.activeListings} hint={`${s.certifiedListings} sertifikatlı`} />
      <StatTile icon={<ShieldCheck size={17} />} label="Təhvil Sertifikatlı Mənzil" value={s.publishedPassports} hint="Dərc olunmuş pasport" tone="gold" />
      <StatTile icon={<QrCode size={17} />} label="QR kod skan sayı" value={s.qrScans} hint={`${num(s.passportViews)} pasport baxışı`} />
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
        <div className="aside-panel rl-notes">
          <div className="section-head" style={{ marginBottom: 6 }}><div><div className="eyebrow">{unread ? `${unread} oxunmamış` : 'Bildirişlər'}</div><h3>{unread ? <BellRing size={16} className="sm-ii" /> : <Bell size={16} className="sm-ii" />} Bildirişlər</h3></div>
            {unread > 0 && <button type="button" className="sm-link-btn" onClick={() => markRead.mutate(undefined, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() }); } })}><CheckCheck size={13} />Oxundu</button>}</div>
          {d.notifications.length ? <div className="sm-aside-list">{d.notifications.map(n => <Link key={n.id} href={n.href || '/realtor'} className={n.read ? '' : 'unread'}><span className="action-icon"><Bell size={14} /></span><span><strong>{n.title}</strong><small>{n.body ? `${n.body} · ` : ''}{relative(n.createdAt)}</small></span><ArrowUpRight size={14} /></Link>)}</div>
            : <p className="sm-muted" style={{ fontSize: 13, margin: 0 }}>Hələ bildiriş yoxdur. Yeni lead, podratçı təsdiqi və ev sahibi qəbulu burada görünəcək.</p>}
        </div>

        <div className="aside-panel">
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
          <p><b>Brokly satışı idarə edir.</b> Təhvil satışı idarə edir və mənzilin etibarını sübut edir.</p>
          <Link href="/realtor/passports/new" className="button button-primary sm-btn-sm"><ShieldCheck size={14} />Pasport yarat</Link>
        </div>
      </aside>
    </div>
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
