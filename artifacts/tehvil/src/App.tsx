import { Fragment, Suspense, lazy, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { MutationCache, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, Link, Redirect, Router as WouterRouter, useLocation } from 'wouter';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BellRing, Boxes, Cable, ClipboardList, HardHat, History, House, Building2, CalendarClock, Calculator, Megaphone, MessageCircle, QrCode, UserRound, Users, UsersRound, Check, CheckCircle2, ChevronDown, ChevronRight,
  ClipboardCheck, Clock3, DoorOpen, FileCheck2, FilePlus2, FileText, Home, ImagePlus,
  LayoutDashboard, ListChecks, LoaderCircle, LogOut, Menu, Plus, ShieldCheck,
  WalletCards, X,
} from 'lucide-react';
import {
  useListProjects, useCreateProject, useGetProjectDashboard, useListRooms, useCreateRoom,
  useListScopeItems, useCreateScopeItem, useUpdateScopeItem, useSubmitScope, useApproveScope, useCreateScopeVersion, useArchiveProject, useListChangeOrders,
  useCreateChangeOrder, useDecideChangeOrder, useListMilestones, useCreateMilestone,
  useSubmitMilestoneHandover, useDecideMilestone, useCreateRevisionRequest,
  useReplyToRevision, useResolveRevision, useListPayments, useCreatePayment, useMarkPaymentSent,
  useConfirmPaymentReceived, useListTimeline, useCreateInvitation, useAcceptInvitation,
  useGetRenovationPassport, getListProjectsQueryKey, getGetProjectDashboardQueryKey,
  getListRoomsQueryKey, getListScopeItemsQueryKey, getListChangeOrdersQueryKey,
  getListMilestonesQueryKey, getListPaymentsQueryKey,
  getListTimelineQueryKey, getGetRenovationPassportQueryKey, useGetHomeOverview, useGetWork,
} from '@workspace/api-client-react';
import type { Project, ProjectInput, Room, ScopeItem } from '@workspace/api-client-react';
import { copy, type Lang, type TKey } from '@/lib/i18n';
import { emitFeedback, errorToMsg, onFeedback, type FeedbackMsg } from '@/lib/feedback';
import { Button, ErrorNotice, EmptyLine, Field, Loading, PageHeading, Status, actionItemText, date, money, propLabel, roleLabel, typeLabel } from '@/components/kit';
import { LanguagePicker } from '@/components/language-picker';
import { Partners } from '@/components/partners';
import { ScopePage } from '@/pages/scope-page';
import { ChangesPage } from '@/pages/changes-page';
import { MilestonesPage } from '@/pages/milestones-page';
import { PaymentsPage } from '@/pages/payments-page';
import { TimelinePage, ActivityItem } from '@/pages/timeline-page';
import { PassportPage } from '@/pages/passport-page';
import { SharedPassportPage } from '@/pages/shared-passport-page';
import { resetSmetaSession, useSmetaProject } from '@/lib/smeta/store';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';
import './smeta.css';
import './realtor.css';
import './home.css';

const SmetaDashboardPage = lazy(() => import('@/pages/smeta/dashboard-page').then(m => ({ default: m.SmetaDashboardPage })));
const NewEstimatePage = lazy(() => import('@/pages/smeta/new-estimate-page').then(m => ({ default: m.NewEstimatePage })));
const EstimateDetailPage = lazy(() => import('@/pages/smeta/estimate-page').then(m => ({ default: m.EstimateDetailPage })));
const PublicEstimatePage = lazy(() => import('@/pages/smeta/public-estimate-page').then(m => ({ default: m.PublicEstimatePage })));
const EstimatePrintPage = lazy(() => import('@/pages/smeta/print-page').then(m => ({ default: m.EstimatePrintPage })));
const RealtorOverviewPage = lazy(() => import('@/pages/realtor/overview-page').then(m => ({ default: m.RealtorOverviewPage })));
const RealtorListingsPage = lazy(() => import('@/pages/realtor/listings-page').then(m => ({ default: m.RealtorListingsPage })));
const RealtorLeadsPage = lazy(() => import('@/pages/realtor/leads-page').then(m => ({ default: m.RealtorLeadsPage })));
const RealtorAppointmentsPage = lazy(() => import('@/pages/realtor/appointments-page').then(m => ({ default: m.RealtorAppointmentsPage })));
const RealtorPassportsPage = lazy(() => import('@/pages/realtor/passports-page').then(m => ({ default: m.RealtorPassportsPage })));
const PassportWizardPage = lazy(() => import('@/pages/realtor/passport-wizard-page').then(m => ({ default: m.PassportWizardPage })));
const RealtorWhatsappPage = lazy(() => import('@/pages/realtor/whatsapp-page').then(m => ({ default: m.RealtorWhatsappPage })));
const RealtorProfilePage = lazy(() => import('@/pages/realtor/profile-page').then(m => ({ default: m.RealtorProfilePage })));
const RealtorTeamPage = lazy(() => import('@/pages/realtor/team-page').then(m => ({ default: m.RealtorTeamPage })));
const PublicPassportPage = lazy(() => import('@/pages/realtor/public-passport-page').then(m => ({ default: m.PublicPassportPage })));
const PrintPassportPage = lazy(() => import('@/pages/realtor/public-passport-page').then(m => ({ default: m.PrintPassportPage })));
const ContractorConfirmPage = lazy(() => import('@/pages/realtor/confirm-pages').then(m => ({ default: m.ContractorConfirmPage })));
const OwnerConfirmPage = lazy(() => import('@/pages/realtor/confirm-pages').then(m => ({ default: m.OwnerConfirmPage })));
const HomesPage = lazy(() => import('@/pages/home/homes-page').then(m => ({ default: m.HomesPage })));
const HomeProfilePage = lazy(() => import('@/pages/home/home-pages').then(m => ({ default: m.HomeProfilePage })));
const HomeHistoryPage = lazy(() => import('@/pages/home/home-pages').then(m => ({ default: m.HomeHistoryPage })));
const HomeRoomsPage = lazy(() => import('@/pages/home/home-pages').then(m => ({ default: m.HomeRoomsPage })));
const RoomPage = lazy(() => import('@/pages/home/home-pages').then(m => ({ default: m.RoomPage })));
const HomePerformersPage = lazy(() => import('@/pages/home/home-pages').then(m => ({ default: m.HomePerformersPage })));
const HomeAuditPage = lazy(() => import('@/pages/home/home-pages').then(m => ({ default: m.HomeAuditPage })));
const HomeMapPage = lazy(() => import('@/pages/home/map-page').then(m => ({ default: m.HomeMapPage })));
const HomeEquipmentPage = lazy(() => import('@/pages/home/equipment-page').then(m => ({ default: m.HomeEquipmentPage })));
const HomeSharingPage = lazy(() => import('@/pages/home/sharing-page').then(m => ({ default: m.HomeSharingPage })));
const WorkPage = lazy(() => import('@/pages/home/work-page').then(m => ({ default: m.WorkPage })));
const WorkersPage = lazy(() => import('@/pages/home/workers-pages').then(m => ({ default: m.WorkersPage })));
const WorkerProfilePage = lazy(() => import('@/pages/home/workers-pages').then(m => ({ default: m.WorkerProfilePage })));
const PublicWorkerPage = lazy(() => import('@/pages/home/workers-pages').then(m => ({ default: m.PublicWorkerPage })));
const MyWorksPage = lazy(() => import('@/pages/home/inbox-pages').then(m => ({ default: m.MyWorksPage })));
const InboxPage = lazy(() => import('@/pages/home/inbox-pages').then(m => ({ default: m.InboxPage })));
const InviteAcceptPage = lazy(() => import('@/pages/home/inbox-pages').then(m => ({ default: m.InviteAcceptPage })));
const PublicHomePage = lazy(() => import('@/pages/home/public-home-page').then(m => ({ default: m.PublicHomePage })));
const SharedHomePage = lazy(() => import('@/pages/home/public-home-page').then(m => ({ default: m.SharedHomePage })));

/** Sections of one home in the digital home passport (Azerbaijani, like the brief). */
const HOME_NAV = [
  { path: '', key: 'profile', label: 'Ev profili', icon: House },
  { path: '/history', key: 'history', label: 'Tikinti və təmir tarixçəsi', icon: History },
  { path: '/rooms', key: 'rooms', label: 'Otaqlar', icon: DoorOpen },
  { path: '/map', key: 'map', label: 'Kommunikasiya xəritəsi', icon: Cable },
  { path: '/equipment', key: 'equipment', label: 'Avadanlıqlar', icon: Boxes },
  { path: '/performers', key: 'performers', label: 'Ustalar və briqadalar', icon: HardHat },
  { path: '/sharing', key: 'sharing', label: 'QR və paylaşım', icon: QrCode },
  { path: '/audit', key: 'audit', label: 'Audit jurnalı', icon: ClipboardList },
] as const;

/** Realtor panel sections (the brief's sidebar). Labels are Azerbaijani, like the AI Smeta module. */
const REALTOR_NAV = [
  { href: '/realtor', key: 'overview', label: 'İcmal', icon: LayoutDashboard },
  { href: '/realtor/listings', key: 'listings', label: 'Elanlarım', icon: Megaphone },
  { href: '/realtor/leads', key: 'leads', label: 'Müştərilər / Leadlər', icon: Users },
  { href: '/realtor/appointments', key: 'appointments', label: 'Görüşlər', icon: CalendarClock },
  { href: '/realtor/passports', key: 'passports', label: 'Təhvil Sertifikatlı Mənzil', icon: QrCode },
  { href: '/realtor/whatsapp', key: 'whatsapp', label: 'WhatsApp avtomatlaşdırma', icon: MessageCircle },
  { href: '/realtor/profile', key: 'profile', label: 'Realtor profili', icon: UserRound },
  { href: '/realtor/team', key: 'team', label: 'Komanda', icon: UsersRound },
] as const;

const queryClient = new QueryClient({ mutationCache: new MutationCache({ onError: e => emitFeedback(errorToMsg(e)) }), defaultOptions: { queries: { retry: 1, staleTime: 20_000, refetchOnWindowFocus: true } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }


function useLanguage() {
  const [lang, setLang] = useState<Lang>(() => {
    const value = localStorage.getItem('tehvil-language');
    return value === 'ru' || value === 'en' ? value : 'az';
  });
  const t = (key: TKey): any => {
    const value = copy[lang][key];
    return typeof value === 'string' ? value.replace(/\\n/g, '\n') : value;
  };
  const change = (value: Lang) => { localStorage.setItem('tehvil-language', value); setLang(value); };
  return { lang, t, change };
}
function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className={`brand ${inverse ? 'inverse' : ''}`} data-testid="link-brand"><span className="brand-mark">t.</span><span>Təhvil</span></Link>;
}
type Crumb = { label: string; href?: string };
function AppShell({ children, project, projectId, active, crumbs, lang, change, t, realtorSection, home }: { children: ReactNode; project?: Project; projectId?: string; active?: string; crumbs?: Crumb[]; lang: Lang; change: (v: Lang) => void; t: (k: TKey) => string; realtorSection?: string; home?: { id: string; name: string; section: string; owner: boolean; audit: boolean } }) {
  const [open, setOpen] = useState(false);
  const { signOut } = useClerk(); const { user } = useUser();
  const nav: { href: string; icon: typeof Home; key: TKey; badge?: boolean }[] = [
    { href: '/homes', icon: House, key: 'myHomes' as const },
    { href: '/my-works', icon: HardHat, key: 'myWorks' as const },
    { href: '/workers', icon: UsersRound, key: 'workersNav' as const },
    { href: '/invitations', icon: BellRing, key: 'inboxNav' as const },
    { href: '/dashboard', icon: LayoutDashboard, key: 'dashboard' as const },
    { href: '/smeta', icon: Calculator, key: 'smeta' as const, badge: true },
    { href: '/realtor', icon: Building2, key: 'realtor' as const, badge: true },
    ...(projectId ? [
      { href: `/projects/${projectId}`, icon: Home, key: 'projects' as const },
      { href: `/projects/${projectId}/scope`, icon: ListChecks, key: 'scope' as const },
      { href: `/projects/${projectId}/changes`, icon: FilePlus2, key: 'changes' as const },
      { href: `/projects/${projectId}/milestones`, icon: ClipboardCheck, key: 'milestones' as const },
      { href: `/projects/${projectId}/payments`, icon: WalletCards, key: 'payments' as const },
      { href: `/projects/${projectId}/timeline`, icon: Clock3, key: 'timeline' as const },
      { href: `/projects/${projectId}/passport`, icon: FileText, key: 'passport' as const },
    ] : []),
  ];
  return <div className="workspace">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}><div className="sidebar-head"><Brand inverse/><button className="mobile-close" onClick={() => setOpen(false)} aria-label={t('close')}><X size={18}/></button></div>
      {project && <div className="project-switcher"><span className="project-symbol">⌂</span><div><small>{t('projects')}</small><strong>{project.name}</strong></div><ChevronDown size={14}/></div>}
      <div className="sidebar-label">{projectId ? project?.name || t('projects') : t('dashboard')}</div>
      <nav className="side-nav">{nav.map(({ href, icon: Icon, key, badge }) => <Link key={key} href={href} onClick={() => setOpen(false)} className={`side-link ${active === key || (!active && key === 'dashboard') ? 'selected' : ''}`} data-testid={`nav-${key}`}><Icon size={17}/><span>{t(key)}</span>{badge && <span className="nav-badge">{t('newBadge')}</span>}{active === key && <span className="nav-active-dot"/>}</Link>)}</nav>
      {home && <><div className="sidebar-label hp-side-label">{home.name}</div><nav className="side-nav rl-side-nav">{HOME_NAV.filter(n => (n.key !== 'sharing' || home.owner) && (n.key !== 'audit' || home.audit)).map(({ path, key, label, icon: Icon }) => <Link key={key} href={`/homes/${home.id}${path}`} onClick={() => setOpen(false)} className={`side-link ${home.section === key ? 'selected' : ''}`} data-testid={`nav-home-${key}`}><Icon size={17}/><span>{label}</span>{home.section === key && <span className="nav-active-dot"/>}</Link>)}</nav></>}
      {realtorSection && <><div className="sidebar-label">{t('realtor')}</div><nav className="side-nav rl-side-nav">{REALTOR_NAV.map(({ href, key, label, icon: Icon }) => <Link key={key} href={href} onClick={() => setOpen(false)} className={`side-link ${realtorSection === key ? 'selected' : ''}`} data-testid={`nav-realtor-${key}`}><Icon size={17}/><span>{label}</span>{realtorSection === key && <span className="nav-active-dot"/>}</Link>)}</nav></>}
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={17}/><p>{t('disclaimer')}</p></div><button className="side-link logout" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={17}/>{t('signOut')}</button></div>
    </aside>
    <div className="workspace-main"><header className="topbar"><button className="mobile-menu" onClick={() => setOpen(true)} aria-label={t('openMenu')}><Menu size={20}/></button><div className="crumbs"><Link href="/dashboard">{t('dashboard')}</Link>{project && <><ChevronRight size={13}/><span>{project.name}</span></>}{crumbs?.map((c, i) => <Fragment key={i}><ChevronRight size={13}/>{c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}</Fragment>)}</div><div className="topbar-tools"><LanguagePicker lang={lang} change={change} compact/><div className="user-initials">{(user?.firstName||user?.primaryEmailAddress?.emailAddress||'T').charAt(0).toUpperCase()}</div></div></header>
      <main className="page-content">{children}</main>
    </div>{open && <button className="scrim" aria-label={t('close')} onClick={() => setOpen(false)}/>}
  </div>;
}
function Landing({ lang, change, t }: { lang: Lang; change: (v: Lang)=>void; t: (k:TKey)=>string }) {
  const [, setLocation] = useLocation();
  const stages = copy[lang].stages;
  const descriptions = copy[lang].stageDescs;
  return <div className="landing"><header className="landing-nav wrap"><Brand/><nav><a href="#how">{t('learn')}</a><Link href="/dashboard">{t('dashboard')}</Link></nav><div className="landing-actions"><LanguagePicker lang={lang} change={change}/><Link href="/sign-in" className="text-link">{t('signIn')}</Link><Link href="/sign-up" className="button button-primary">{t('signUp')}<ArrowUpRight size={16}/></Link></div></header>
    <section className="hero wrap"><div className="hero-copy appear"><div className="eyebrow"><span className="eyebrow-dot"/>{t('tagline')}</div><h1 className="font-display">{t('hero')}</h1><p>{t('lead')}</p><div className="hero-cta"><Button onClick={() => setLocation('/sign-up')}>{t('start')}<ArrowRight size={17}/></Button><a href="#how" className="quiet-link">{t('learn')}<ArrowDownLeft size={16}/></a></div><div className="hero-proof"><ShieldCheck size={17}/><span>{t('disclaimer')}</span></div></div>
      <div className="hero-art appear-delay"><div className="art-topline"><span><i/> {t('artTop')}</span><span>01 — 03</span></div><div className="blueprint"><div className="blueprint-label">{lang==='az'?'BAKI · YAŞAYIŞ / 02':lang==='ru'?'БАКУ · ЖИЛОЕ / 02':'BAKU · RESIDENTIAL / 02'}</div><div className="blueprint-plan"><div className="plan-room room-living"><span>{t('planLiving')}</span><small>01</small></div><div className="plan-room room-kitchen"><span>{t('planKitchen')}</span><small>02</small></div><div className="plan-room room-bed"><span>{t('planBed')}</span><small>03</small></div><div className="plan-room room-bath"><span>{t('planBath')}</span><small>04</small></div><div className="plan-door"/></div><div className="plan-dim">6.40 m <span>3.80 m</span></div><div className="plan-status"><div className="status-check"><Check size={15}/></div><div><strong>{t('planApproved')}</strong><small>{t('planParties')}</small></div><div className="status-mini">{t('planRecorded')}</div></div></div><div className="art-foot"><span>{t('artOne')}</span><span>40°22' N / 49°50' E</span></div></div>
    </section><div className="trust-strip"><div className="wrap trust-items"><span>{t('trust')}</span><i/><span>{t('clarity')}</span><i/><span>{t('history')}</span></div></div>
    <section className="workflow wrap" id="how"><div className="workflow-intro"><div className="eyebrow">{t('eyCertain')}</div><h2 className="font-display">{t('workflow')}</h2><p>{t('workflowLead')}</p></div><div className="workflow-list">{stages.map((stage, i) => { const Icons=[FileCheck2, ArrowRight, ImagePlus]; const Icon=Icons[i]; return <article className="workflow-row" key={stage}><div className="workflow-number">0{i+1}</div><div className="workflow-icon"><Icon size={20}/></div><div><h3>{stage}</h3><p>{descriptions[i]}</p></div><ChevronRight className="workflow-chevron" size={18}/></article>; })}</div></section>
    <section className="rl-landing wrap" id="realtor"><div className="rl-landing-copy"><div className="eyebrow"><span className="eyebrow-dot"/>{lang==='az'?'Realtorlar üçün':lang==='ru'?'Для риелторов':'For realtors'}</div><h2 className="font-display">{lang==='az'?'Realtor üçün satış və etibar platforması':lang==='ru'?'Платформа продаж и доверия для риелторов':'A sales and trust platform for realtors'}</h2><p>{lang==='az'?'Siz leadləri, elanları və görüşləri Təhvil.az-da idarə edirsiniz; hər mənzilinizi QR kodlu, foto sübutlu və ev sahibi təsdiqli “Təhvil Sertifikatlı Mənzil” kimi təqdim edirsiniz. Rəqibiniz yalnız satış prosesini idarə edir, siz həm satışı idarə edir, həm də alıcının güvənini qazanırsınız.':lang==='ru'?'Вы ведёте лиды, объявления и показы в Təhvil.az и представляете каждую квартиру как «Квартиру с сертификатом Təhvil» — с QR-кодом, фотодоказательствами и подтверждением владельца. Конкурент управляет только продажей, вы — продажей и доверием покупателя.':'You manage leads, listings and viewings in Təhvil.az and present every apartment as a “Təhvil-certified apartment” with a QR code, photo evidence and owner confirmation. Competitors manage the sale; you manage the sale and earn the buyer\'s trust.'}</p><Link href="/sign-up?realtor=1" className="button button-primary">{lang==='az'?'Realtor kimi başla':lang==='ru'?'Начать как риелтор':'Start as a realtor'}<ArrowRight size={16}/></Link></div><ul className="rl-landing-list"><li><Users size={18}/><span><b>{lang==='az'?'Lead və CRM':lang==='ru'?'Лиды и CRM':'Leads and CRM'}</b>{lang==='az'?'WhatsApp, Instagram, Facebook, sayt — hamısı bir paneldə.':lang==='ru'?'WhatsApp, Instagram, Facebook, сайт — в одной панели.':'WhatsApp, Instagram, Facebook, website — in one panel.'}</span></li><li><MessageCircle size={18}/><span><b>{lang==='az'?'WhatsApp avtomatlaşdırma':lang==='ru'?'Автоматизация WhatsApp':'WhatsApp automation'}</b>{lang==='az'?'Avtomatik cavab, filtr sualları, uyğun elan və görüş təklifi.':lang==='ru'?'Автоответ, уточняющие вопросы, подбор объявлений и время показа.':'Auto-reply, qualifying questions, matching listings and viewing slots.'}</span></li><li><QrCode size={18}/><span><b>{lang==='az'?'Təhvil Sertifikatlı Mənzil':lang==='ru'?'Квартира с сертификатом Təhvil':'Təhvil-certified apartment'}</b>{lang==='az'?'QR kodla təmir tarixçəsini yoxlayın — foto sübut, podratçı və ev sahibi təsdiqi.':lang==='ru'?'История ремонта по QR-коду — фото, подтверждение подрядчика и владельца.':'Verify renovation history by QR — photos, contractor and owner confirmation.'}</span></li></ul></section>
    <section className="closing wrap"><div className="closing-inner"><div className="closing-mark">t.</div><div><div className="eyebrow">{t('tagline')}</div><h2 className="font-display">{t('start')}</h2><p>{t('lead')}</p></div><Link href="/sign-up" className="button button-primary">{t('createFirst')}<ArrowRight size={16}/></Link></div></section>
    <Partners lang={lang}/>
    <footer className="landing-footer wrap"><Brand/><p>{t('disclaimer')}</p><LanguagePicker lang={lang} change={change}/><nav className="landing-legal" aria-label="Bələdçilər"><a href="/temir-tehvil-akti.html">Təhvil-təslim aktı</a><a href="/temir-islerinin-qebulu.html">Təmir işlərinin qəbulu</a><a href="/podratci-ile-razilasma.html">Podratçı ilə razılaşma</a><a href="/temir-elave-isler.html">Əlavə işlər və dəyişikliklər</a></nav><nav className="landing-legal"><a href="/privacy.html">{lang==='az'?'Məxfilik siyasəti':lang==='ru'?'Политика конфиденциальности':'Privacy policy'}</a><a href="/terms.html">{lang==='az'?'İstifadə şərtləri':lang==='ru'?'Условия использования':'Terms of use'}</a></nav><address className="landing-contact"><a href="mailto:support@tehvil.az">support@tehvil.az</a><a href="tel:+994503066626">+994 50 306 66 26</a><a href="https://wa.me/994503066626" target="_blank" rel="noopener noreferrer">WhatsApp</a><span>Bakı, Səbail rayonu, Badamdar qəsəbəsi, 26-cı küçə, 20</span></address></footer>
  </div>;
}
function Protected({ children, t }: { children: ReactNode; t: (k:TKey)=>string }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><div className="auth-wall"><div className="auth-panel"><Brand/><div className="eyebrow">{t('trust')}</div><h1 className="font-display">{t('signinPrompt')}</h1><Link className="button button-primary" href="/sign-in">{t('signIn')}<ArrowRight size={16}/></Link></div></div></Show></>;
}
function useProjectData(id: string) {
  const projects = useListProjects();
  const dashboard = useGetProjectDashboard(id);
  const rooms = useListRooms(id);
  const scope = useListScopeItems(id);
  const changes = useListChangeOrders(id);
  const milestones = useListMilestones(id);
  const payments = useListPayments(id);
  const timeline = useListTimeline(id);
  const passport = useGetRenovationPassport(id);
  return { projects, dashboard, rooms, scope, changes, milestones, payments, timeline, passport };
}
function DashboardPage({ lang, change, t }: { lang: Lang; change:(v:Lang)=>void; t:(k:TKey)=>string }) {
  return <Protected t={t}><DashboardContent lang={lang} change={change} t={t}/></Protected>;
}
function DashboardContent({ lang, change, t }: { lang: Lang; change:(v:Lang)=>void; t:(k:TKey)=>string }) {
  const { data: projects, isLoading, isError, refetch } = useListProjects();
  if (isLoading) return <AppShell lang={lang} change={change} t={t}><Loading t={t}/></AppShell>;
  return <AppShell lang={lang} change={change} t={t}><PageHeading eyebrow={t('eyWorkspace')} title={t('welcome')} description={t('pending')} action={<Link href="/projects/new" className="button button-primary"><Plus size={17}/>{t('newProject')}</Link>}/>
    {isError ? <ErrorNotice t={t} retry={() => refetch()}/> : projects?.length ? <div className="dashboard-grid"><section className="project-list-area"><div className="section-head"><div><div className="eyebrow">{t('active')}</div><h2>{t('projects')}</h2></div><span className="count-chip">{projects.length.toString().padStart(2,'0')}</span></div>{projects.map((project, i) => <ProjectCard key={project.id} project={project} lang={lang} t={t} index={i}/>)}</section>
      <aside className="dashboard-aside"><div className="aside-panel"><div className="eyebrow">{t('actions')}</div><h3>{t('pending')}</h3>{projects.slice(0,2).map((p, i) => <Link href={`/projects/${p.id}`} className="action-link" key={p.id}><span className={`action-icon action-icon-${i}`}><ClipboardCheck size={16}/></span><span><strong>{p.name}</strong><small>{roleLabel(p.participantRole,t)} · {p.city}</small></span><ArrowUpRight size={14}/></Link>)}<div className="aside-foot"><ShieldCheck size={15}/>{t('disclaimer')}</div></div><div className="aside-stat"><span className="eyebrow">{t('history')}</span><strong>{projects.length} <small>{t('projects').toLowerCase()}</small></strong><span>{t('trust')}</span></div><Link href="/smeta" className="passport-promo" data-testid="link-smeta-promo"><Calculator size={19}/><div><strong>{t('smeta')}</strong><small>{t('smetaPromo')}</small></div><ArrowUpRight size={15}/></Link><Link href="/realtor" className="passport-promo" data-testid="link-realtor-promo"><Building2 size={19}/><div><strong>{t('realtor')}</strong><small>{t('realtorPromo')}</small></div><ArrowUpRight size={15}/></Link></aside>
    </div> : <div className="empty-projects"><div className="empty-illustration"><div className="empty-window"><div/><div/><div/></div><DoorOpen size={36}/></div><span className="eyebrow">{t('active')}</span><h2 className="font-display">{t('noProjects')}</h2><p>{t('noProjectsText')}</p><Link href="/projects/new" className="button button-primary"><Plus size={17}/>{t('createFirst')}</Link><Link href="/realtor" className="text-link rl-empty-realtor"><Building2 size={15}/>{t('realtor')}<ArrowUpRight size={14}/></Link></div>}
  </AppShell>;
}
function ProjectCard({ project, lang, t, index }: { project: Project; lang: Lang; t:(k:TKey)=>string; index:number }) {
  const { data: summary } = useGetProjectDashboard(project.id);
  return <Link href={`/projects/${project.id}`} className={`project-card appear project-card-${index%3}`} data-testid={`card-project-${project.id}`}><div className="project-card-top"><div className="project-card-symbol">{project.propertyType === 'house' ? 'H' : project.propertyType === 'office' ? 'O' : 'A'}</div><Status value={project.status} t={t}/><ArrowUpRight size={16} className="card-arrow"/></div><div className="project-card-body"><div className="eyebrow">{project.city} · {typeLabel(project.projectType,t)}</div><h3>{project.name}</h3><div className="project-card-meta"><span>{project.contractorName || t('contractor') + ' —'}</span><span>{project.progress}% {t('progress').toLowerCase()}</span></div></div><div className="progress-track"><span style={{width:`${Math.min(100,Math.max(0,project.progress))}%`}}/></div><div className="project-card-bottom"><span>{t('approvedBudget')}</span><strong>{money(project.approvedBudget)} <small>AZN</small></strong></div>{summary&&<div className="project-card-signals"><span><DoorOpen size={13}/>{summary.roomCount} {t('rooms').toLowerCase()}</span><span><FilePlus2 size={13}/>{summary.pendingChanges}</span><span><ClipboardCheck size={13}/>{summary.awaitingHandover}</span>{summary.nextPayment!=null&&<b>{money(summary.nextPayment)} AZN</b>}</div>}{summary?.actionItems?.[0]&&<div className="project-action-teaser"><span className="action-teaser-dot"/><strong>{actionItemText(summary.actionItems[0] as any,t).label}</strong><span>{summary.actionItems.length} {t('actions').toLowerCase()}</span></div>}</Link>;
}
function CreateProjectPage({ lang, change, t }: { lang:Lang; change:(v:Lang)=>void; t:(k:TKey)=>string }) {
  const create = useCreateProject();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ name:'', city:'Bakı', propertyType:'apartment', projectType:'full', plannedStartDate:'', plannedCompletionDate:'', budget:'' });
  const update = (key: keyof typeof form) => (v:string) => setForm(old => ({...old,[key]:v}));
  const submit = (e:FormEvent) => { e.preventDefault(); if(form.name.trim().length<2 || !form.city.trim()) return; const payload:ProjectInput={...form,propertyType:form.propertyType as ProjectInput['propertyType'],projectType:form.projectType as ProjectInput['projectType'],plannedStartDate:form.plannedStartDate||null,plannedCompletionDate:form.plannedCompletionDate||null,budget:form.budget?Number(form.budget):null}; create.mutate({data:payload}, {onSuccess: p => { qc.invalidateQueries({queryKey:getListProjectsQueryKey()}); setLocation(`/projects/${p.id}`); }}); };
  return <Protected t={t}><AppShell lang={lang} change={change} t={t}><PageHeading eyebrow={t('eyNew')} title={t('newProject')} description={t('lead')}/>
    <div className="form-layout"><form className="surface form-card" onSubmit={submit}><div className="form-section-title"><span>01</span><h2>{t('projectName')}</h2></div><Field label={t('projectName')} name="project-name" required value={form.name} onChange={update('name')} placeholder={lang==='en'?'e.g. Narimanov apartment':lang==='ru'?'Например, квартира в Нариманове':'məs. Nərimanov mənzili'}/><div className="field-grid"><Field label={t('city')} name="city" required value={form.city} onChange={update('city')}/><Field label={t('propertyType')} name="property-type"><select value={form.propertyType} onChange={e=>update('propertyType')(e.target.value)}><option value="apartment">{t('propertyApartment')}</option><option value="house">{t('propertyHouse')}</option><option value="office">{t('propertyOffice')}</option><option value="commercial">{t('propertyCommercial')}</option><option value="other">{t('propertyOther')}</option></select></Field></div><Field label={t('projectType')} name="project-type"><select value={form.projectType} onChange={e=>update('projectType')(e.target.value)}>{['full','partial','kitchen','bathroom','electrical','plumbing','flooring','painting','other'].map(v=><option key={v} value={v}>{typeLabel(v,t)}</option>)}</select></Field><div className="form-section-title separated"><span>02</span><h2>{t('plannedDate')}</h2></div><div className="field-grid"><Field label={t('startDate')} name="start-date" type="date" value={form.plannedStartDate} onChange={update('plannedStartDate')}/><Field label={t('completionDate')} name="completion-date" type="date" value={form.plannedCompletionDate} onChange={update('plannedCompletionDate')}/></div><Field label={t('budget')} name="budget" type="number" min="0" step="1" value={form.budget} onChange={update('budget')}/><div className="form-actions"><Button variant="secondary" onClick={()=>setLocation('/dashboard')}>{t('cancel')}</Button><Button type="submit" disabled={create.isPending}>{create.isPending?<LoaderCircle className="spin" size={16}/>:<ArrowRight size={16}/>} {t('createFirst')}</Button></div>{create.isError&&<p className="form-error">{t('error')}</p>}</form><aside className="form-aside"><div className="aside-number">01—03</div><div className="aside-ornament"><div/><div/><div/></div><div className="eyebrow">{t('trust')}</div><h3 className="font-display">{t('workflow')}</h3><p>{t('lead')}</p><div className="audit-note"><ShieldCheck size={17}/><span>{t('disclaimer')}</span></div></aside></div>
  </AppShell></Protected>;
}
type SectionProps = { id:string; lang:Lang; change:(v:Lang)=>void; t:(k:TKey)=>string; section:string };
function ProjectRoute({ section='overview', lang, change, t }: {section?:string;lang:Lang;change:(v:Lang)=>void;t:(k:TKey)=>string}) {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const projectIndex = pathParts.lastIndexOf('projects');
  const id = projectIndex >= 0 ? pathParts[projectIndex + 1] || '' : '';
  return <Protected t={t}><ProjectRouteContent section={section} lang={lang} change={change} t={t} id={id}/></Protected>;
}
function ProjectRouteContent({ section='overview', lang, change, t, id }: {section?:string;lang:Lang;change:(v:Lang)=>void;t:(k:TKey)=>string;id:string}) {
  const data = useProjectData(id);
  if (data.projects.isLoading || data.dashboard.isLoading) return <AppShell lang={lang} change={change} t={t}><Loading t={t}/></AppShell>;
  const project = data.dashboard.data?.project || data.projects.data?.find(p=>p.id===id);
  if (data.dashboard.isError || !project) return <AppShell lang={lang} change={change} t={t}><ErrorNotice t={t} retry={()=>{data.dashboard.refetch();data.projects.refetch();}}/></AppShell>;
  return <AppShell lang={lang} change={change} t={t} project={project} projectId={id} active={section==='overview'?'projects':section}><ProjectContent {...data} project={project} id={id} section={section} lang={lang} t={t}/></AppShell>;
}
function ProjectContent({ project, id, section, lang, t, dashboard, rooms, scope, changes, milestones, payments, timeline, passport }: any) {
  const qc = useQueryClient(); const { user } = useUser(); const me = user?.id; const [, setLocation] = useLocation();
  const createRoom = useCreateRoom(); const createScope = useCreateScopeItem(); const updateScope = useUpdateScopeItem(); const submitScope = useSubmitScope(); const approveScope = useApproveScope(); const createVersion = useCreateScopeVersion();
  const createChange = useCreateChangeOrder(); const decideChange = useDecideChangeOrder();
  const createMilestone = useCreateMilestone(); const submitHandover = useSubmitMilestoneHandover(); const decideMilestone = useDecideMilestone();
  const createRevision = useCreateRevisionRequest(); const replyRevision = useReplyToRevision(); const resolveRevision = useResolveRevision();
  const createPayment = useCreatePayment(); const markSent = useMarkPaymentSent(); const confirmReceived = useConfirmPaymentReceived();
  const createInvite = useCreateInvitation(); const archive = useArchiveProject();
  const invalidate = (keys: readonly (readonly unknown[])[]) => keys.forEach(queryKey => qc.invalidateQueries({ queryKey }));
  const refreshCore = () => { invalidate([getGetProjectDashboardQueryKey(id), getListProjectsQueryKey(), getListTimelineQueryKey(id), getListRoomsQueryKey(id), getListScopeItemsQueryKey(id), getListChangeOrdersQueryKey(id), getListMilestonesQueryKey(id), getListPaymentsQueryKey(id), getGetRenovationPassportQueryKey(id)]); qc.invalidateQueries({ predicate: q => String(q.queryKey[0]).includes('/revisions') }); };
  const blankScope = { title: '', description: '', roomId: '', inclusionType: 'included', materialResponsibility: 'contractor', laborAmount: '', materialEstimate: '', warrantyMonths: '' };
  const [roomName, setRoomName] = useState(''); const [showRoom, setShowRoom] = useState(false); const [scopeForm, setScopeForm] = useState(blankScope); const [showScope, setShowScope] = useState(false); const [editingId, setEditingId] = useState<string | null>(null); const [showArchive, setShowArchive] = useState(false);
  const contractorTaken = !!project.contractorName;
  const [inviteForm, setInviteForm] = useState({ name: '', contact: '', role: contractorTaken ? 'viewer' : 'contractor' }); const [inviteUrl, setInviteUrl] = useState('');
  const [form, setForm] = useState<Record<string, string>>({}); const [toast, setToast] = useState('');
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3200); };
  const mutating = [createRoom, createScope, updateScope, submitScope, approveScope, createVersion, createChange, decideChange, createMilestone, submitHandover, decideMilestone, createRevision, replyRevision, resolveRevision, createPayment, markSent, confirmReceived, createInvite, archive].some(m => m.isPending);
  const archived = !!(project as any).archived || project.status === 'archived';
  const role = project.participantRole; const isOwner = role === 'owner' && !archived; const isContractor = role === 'contractor' && !archived;
  const canWrite = (isOwner || isContractor) && !archived; const scopeApproved = project.scopeStatus === 'approved';
  const canEditScope = canWrite && project.scopeStatus === 'draft';
  const common = { project, id, section, lang, t, dashboard, rooms, scope, changes, milestones, payments, timeline, passport, form, setForm, showRoom, setShowRoom, roomName, setRoomName, scopeForm, setScopeForm, showScope, setShowScope, inviteForm, setInviteForm, inviteUrl, setInviteUrl, notify, refreshCore, mutating, me, isOwner, isContractor, canWrite, canEditScope, scopeApproved, archived,
    createRoom, createScope, submitScope, approveScope, createVersion, createChange, decideChange, createMilestone, submitHandover, decideMilestone, createRevision, replyRevision, resolveRevision, createPayment, markSent, confirmReceived,
    openScope: (roomId: string) => { setEditingId(null); setScopeForm({ ...blankScope, roomId }); setShowScope(true); },
    editItem: (item: any) => { setEditingId(item.id); setScopeForm({ title: item.title, description: item.description || '', roomId: item.roomId || '', inclusionType: item.inclusionType, materialResponsibility: item.materialResponsibility, laborAmount: item.laborAmount != null ? String(item.laborAmount) : '', materialEstimate: item.materialEstimate != null ? String(item.materialEstimate) : '', warrantyMonths: item.warrantyMonths != null ? String(item.warrantyMonths) : '' }); setShowScope(true); },
    archiveOpen: () => setShowArchive(true) };
  const doAddRoom = (e: FormEvent) => { e.preventDefault(); createRoom.mutate({ projectId: id, data: { name: roomName.trim() } }, { onSuccess: () => { setRoomName(''); setShowRoom(false); invalidate([getListRoomsQueryKey(id), getGetProjectDashboardQueryKey(id)]); notify(t('created')); } }); };
  const doAddScope = (e: FormEvent) => {
    e.preventDefault(); const f = scopeForm;
    const data = { title: f.title, description: f.description || null, roomId: f.roomId || null, inclusionType: f.inclusionType as 'included' | 'excluded', materialResponsibility: f.materialResponsibility as 'owner' | 'contractor' | 'shared' | 'not_applicable', laborAmount: f.laborAmount ? Number(f.laborAmount) : null, materialEstimate: f.materialEstimate ? Number(f.materialEstimate) : null, warrantyMonths: f.warrantyMonths ? Number(f.warrantyMonths) : null };
    const done = { onSuccess: () => { setShowScope(false); setEditingId(null); setScopeForm(blankScope); invalidate([getListScopeItemsQueryKey(id), getListRoomsQueryKey(id), getGetRenovationPassportQueryKey(id)]); notify(t(editingId ? 'saveChanges' : 'created')); } };
    if (editingId) updateScope.mutate({ projectId: id, scopeItemId: editingId, data }, done); else createScope.mutate({ projectId: id, data }, done);
  };
  const roomForm = showRoom && canEditScope && <form className="inline-form" onSubmit={doAddRoom}><Field label={t('roomName')} name="room-name" required value={roomName} onChange={setRoomName} /><div className="inline-actions"><Button variant="quiet" onClick={() => setShowRoom(false)}>{t('cancel')}</Button><Button type="submit" disabled={createRoom.isPending}>{t('save')}</Button></div></form>;
  const sf = (k: keyof typeof scopeForm) => (v: string) => setScopeForm({ ...scopeForm, [k]: v });
  const scopeCreate = showScope && canEditScope && <form className="scope-create surface" onSubmit={doAddScope}><div className="section-head"><h3>{editingId ? t('editItem') : t('addScope')}</h3><button type="button" className="icon-button" aria-label={t('close')} onClick={() => { setShowScope(false); setEditingId(null); }}><X size={17} /></button></div><div className="field-grid"><Field label={t('itemTitle')} name="scope-title" required value={scopeForm.title} onChange={sf('title')} /><Field label={t('room')} name="scope-room"><select value={scopeForm.roomId} onChange={e => sf('roomId')(e.target.value)}><option value="">—</option>{(rooms.data || []).map((r: Room) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field></div><Field label={t('description')} name="scope-description"><textarea value={scopeForm.description} onChange={e => sf('description')(e.target.value)} /></Field><div className="field-grid"><Field label={t('inclusion')} name="scope-inclusion"><select value={scopeForm.inclusionType} onChange={e => sf('inclusionType')(e.target.value)}><option value="included">{t('included')}</option><option value="excluded">{t('excluded')}</option></select></Field><Field label={t('materialResponsibility')} name="material-owner"><select value={scopeForm.materialResponsibility} onChange={e => sf('materialResponsibility')(e.target.value)}><option value="contractor">{t('roleContractor')}</option><option value="owner">{t('roleOwner')}</option><option value="shared">{t('shared')}</option><option value="not_applicable">{t('notApplicable')}</option></select></Field></div><div className="field-grid three"><Field label={t('labor')} name="labor" type="number" min="0" value={scopeForm.laborAmount} onChange={sf('laborAmount')} /><Field label={t('materials')} name="materials" type="number" min="0" value={scopeForm.materialEstimate} onChange={sf('materialEstimate')} /><Field label={t('warranty')} name="warranty" type="number" min="0" value={scopeForm.warrantyMonths} onChange={sf('warrantyMonths')} /></div><div className="inline-actions"><Button variant="secondary" onClick={() => { setShowScope(false); setEditingId(null); }}>{t('cancel')}</Button><Button type="submit" disabled={createScope.isPending || updateScope.isPending}>{editingId ? t('saveChanges') : t('save')}</Button></div></form>;
  const headingAction = isOwner && !archived ? <div className="heading-buttons"><Button variant="secondary" onClick={() => { setInviteUrl(''); setForm({ ...form, inviteOpen: 'yes' }); }}><Plus size={15} />{t('invite')}</Button></div> : undefined;
  const inviteModal = form.inviteOpen && <div className="modal-backdrop" onClick={() => setForm({ ...form, inviteOpen: '' })}><form className="modal-card" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); createInvite.mutate({ projectId: id, data: { ...inviteForm, role: inviteForm.role as 'contractor' | 'viewer' } }, { onSuccess: inv => { setInviteUrl(inv.inviteUrl); notify(t('inviteCopied')); } }); }}><div className="modal-head"><div><div className="eyebrow">{project.name}</div><h3>{t('invite')}</h3></div><button type="button" className="icon-button" aria-label={t('close')} onClick={() => setForm({ ...form, inviteOpen: '' })}><X size={18} /></button></div><Field label={t('name')} name="invite-name" required value={inviteForm.name} onChange={v => setInviteForm({ ...inviteForm, name: v })} /><Field label={t('contact')} name="invite-contact" required value={inviteForm.contact} onChange={v => setInviteForm({ ...inviteForm, contact: v })} /><Field label={t('role')} name="invite-role"><select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}><option value="contractor" disabled={contractorTaken}>{t('roleContractor')}</option><option value="viewer">{t('roleViewer')}</option></select></Field>{contractorTaken && <small className="revision-date">{t('contractorTaken')}</small>}{inviteUrl && <div className="invite-success"><CheckCircle2 size={17} /><span>{t('inviteCopied')}</span><a href={inviteUrl}>{inviteUrl}</a><Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(inviteUrl); }}>{t('copy')}</Button></div>}<Button type="submit" disabled={createInvite.isPending} className="full-button">{t('makeInvite')}</Button></form></div>;
  const archiveModal = showArchive && <div className="modal-backdrop" onClick={() => setShowArchive(false)}><div className="modal-card" onClick={e => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">{project.name}</div><h3>{t('archiveTitle')}</h3></div></div><p className="empty-line" style={{ textAlign: 'left' }}>{t('archiveNote')}</p><div className="inline-actions"><Button variant="secondary" onClick={() => setShowArchive(false)}>{t('cancel')}</Button><Button variant="danger" disabled={archive.isPending} testId="button-confirm-archive" onClick={() => archive.mutate({ projectId: id }, { onSuccess: () => { setShowArchive(false); qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); setLocation('/dashboard'); } })}>{t('archive')}</Button></div></div></div>;
  let content: ReactNode;
  if (section === 'scope') content = <ScopePage {...common} roomForm={roomForm} scopeCreate={scopeCreate} />;
  else if (section === 'changes') content = <ChangesPage {...common} />;
  else if (section === 'milestones') content = <MilestonesPage {...common} />;
  else if (section === 'payments') content = <PaymentsPage {...common} />;
  else if (section === 'timeline') content = <TimelinePage {...common} />;
  else if (section === 'passport') content = <PassportPage {...common} />;
  else content = <Overview {...common} headingAction={headingAction} roomForm={roomForm} />;
  return <>{archived && <div className="notice manual-notice">{t('archivedNote')}</div>}{content}{inviteModal}{archiveModal}{toast && <div className="toast-message"><CheckCircle2 size={17} />{toast}</div>}{mutating && <div className="saving-state"><LoaderCircle className="spin" size={14} />{t('save')}…</div>}</>;
}

function Overview(p:any) {
  const {project,t,dashboard,lang,rooms,scope,headingAction,roomForm,setShowRoom}=p; const d=dashboard.data;
  return <><PageHeading eyebrow={`${project.city.toUpperCase()} / ${propLabel(project.propertyType,t).toUpperCase()}`} title={project.name} description={`${project.contractorName || t('contractor')} · ${t('projectTypeLabel')}: ${typeLabel(project.projectType,t)}`} action={headingAction}/>
    <div className="project-overview-layout"><section className="overview-main"><div className="hero-project-panel"><div className="hero-project-meta"><span className="eyebrow">{t('progress')}</span><Status value={project.status} t={t}/></div><div className="progress-big"><strong>{project.progress}<small>%</small></strong><div className="progress-track"><span style={{width:`${project.progress}%`}}/></div><span>{t('approvedBudget')}: <b>{money(project.approvedBudget)} AZN</b></span></div><div className="project-dates"><div><span>{t('startDate')}</span><b>{date(project.plannedStartDate,lang)}</b></div><div><span>{t('completionDate')}</span><b>{date(project.plannedCompletionDate,lang)}</b></div><div><span>{t('contractor')}</span><b>{project.contractorName||'—'}</b></div></div></div>
      <div className="stat-row"><div className="stat-card"><span className="eyebrow">{t('rooms')}</span><strong>{d?.roomCount ?? rooms.data?.length ?? 0}</strong><Link href={`/projects/${project.id}/scope`}>{t('viewAll')}<ArrowUpRight size={13}/></Link></div><div className="stat-card"><span className="eyebrow">{t('included')}</span><strong>{d?.includedCount ?? scope.data?.filter((s:ScopeItem)=>s.inclusionType==='included').length ?? 0}</strong><span>{t('excluded')}: {d?.excludedCount ?? scope.data?.filter((s:ScopeItem)=>s.inclusionType==='excluded').length ?? 0}</span></div><div className="stat-card"><span className="eyebrow">{t('totalChanges')}</span><strong>{money(project.approvedChanges)}<small> AZN</small></strong><Link href={`/projects/${project.id}/changes`}>{t('changes')}<ArrowUpRight size={13}/></Link></div></div>
      <section className="activity-panel surface"><div className="section-head"><div><div className="eyebrow">{t('recent')}</div><h2>{t('timeline')}</h2></div><Link href={`/projects/${project.id}/timeline`} className="text-link">{t('viewAll')}<ArrowRight size={14}/></Link></div><div className="activity-list">{(d?.recentActivity||[]).slice(0,4).map((event:any)=><ActivityItem event={event} key={event.id} lang={lang} t={t}/>)}{!d?.recentActivity?.length&&<EmptyLine t={t}/>}</div></section></section>
      <aside className="overview-aside"><div className="next-step-card"><div className="next-step-icon"><ClipboardCheck size={20}/></div><div className="eyebrow">{t('actions')}</div><h3>{d?.actionItems?.[0]?actionItemText(d.actionItems[0] as any,t).label:t('workflow')}</h3><p>{d?.actionItems?.[0]?actionItemText(d.actionItems[0] as any,t).detail:t('workflowLead')}</p>{d?.actionItems?.[0]?.href?<Link href={d.actionItems[0].href} className="button button-primary">{t('viewAll')}<ArrowRight size={15}/></Link>:<Link href={`/projects/${project.id}/scope`} className="button button-primary">{t('scope')}<ArrowRight size={15}/></Link>}</div><div className="money-card"><span className="eyebrow">{t('approvedBudget')}</span><strong>{money(project.approvedBudget)} <small>AZN</small></strong><div className="money-split"><span>{t('budget')}<b>{money(project.budget)} AZN</b></span><span>{t('totalChanges')}<b>{money(project.approvedChanges)} AZN</b></span></div></div><div className="rooms-card surface"><div className="section-head"><h3>{t('rooms')}</h3>{p.canEditScope&&<button className="icon-button" onClick={()=>setShowRoom(true)} aria-label={t('addRoom')}><Plus size={17}/></button>}</div>{roomForm}{(rooms.data||[]).slice(0,4).map((r:Room,i:number)=><div className="room-line" key={r.id}><span className={`room-dot room-dot-${i%4}`}/><span>{r.name}</span><small>{r.itemCount}</small></div>)}{!rooms.data?.length&&!roomForm&&<EmptyLine t={t}/>}</div><div className="passport-promo"><FileText size={19}/><div><strong>{t('passport')}</strong><small>{t('passportLead')}</small></div><Link href={`/projects/${project.id}/passport`}><ArrowUpRight size={15}/></Link></div></aside>
    </div></>;
}
function NewRoute({lang,change,t}:{lang:Lang;change:(v:Lang)=>void;t:(k:TKey)=>string}) { return <CreateProjectPage lang={lang} change={change} t={t}/>; }
type ShellProps = { lang: Lang; change: (v: Lang) => void; t: (k: TKey) => string };
function SmetaShell({ crumbs, children, ...shell }: ShellProps & { crumbs?: Crumb[]; children: ReactNode }) {
  return <Protected t={shell.t}><AppShell {...shell} active="smeta" crumbs={[{ label: 'AI Smeta', href: crumbs?.length ? '/smeta' : undefined }, ...(crumbs || [])]}><Suspense fallback={<Loading t={shell.t}/>}>{children}</Suspense></AppShell></Protected>;
}
function SmetaDetailRoute({ projectId, ...shell }: ShellProps & { projectId: string }) {
  const project = useSmetaProject(projectId);
  return <SmetaShell {...shell} crumbs={project ? [{ label: project.name }] : []}><EstimateDetailPage projectId={projectId}/></SmetaShell>;
}
function RealtorShell({ section, crumbs, children, ...shell }: ShellProps & { section: string; crumbs?: Crumb[]; children: ReactNode }) {
  const label = REALTOR_NAV.find(n => n.key === section)?.label;
  return <Protected t={shell.t}><AppShell {...shell} active="realtor" realtorSection={section} crumbs={[{ label: shell.t('realtor'), href: section === 'overview' && !crumbs?.length ? undefined : '/realtor' }, ...(section !== 'overview' && label ? [{ label, href: crumbs?.length ? REALTOR_NAV.find(n => n.key === section)?.href : undefined }] : []), ...(crumbs || [])]}><Suspense fallback={<Loading t={shell.t}/>}>{children}</Suspense></AppShell></Protected>;
}
function HomeShell({ homeId, section, crumbs, children, ...shell }: ShellProps & { homeId: string; section: string; crumbs?: Crumb[]; children: ReactNode }) {
  return <Protected t={shell.t}><HomeShellInner homeId={homeId} section={section} crumbs={crumbs} {...shell}>{children}</HomeShellInner></Protected>;
}
function HomeShellInner({ homeId, section, crumbs, children, ...shell }: ShellProps & { homeId: string; section: string; crumbs?: Crumb[]; children: ReactNode }) {
  const q = useGetHomeOverview(homeId);
  const h = q.data?.home;
  const label = HOME_NAV.find(n => n.key === section)?.label;
  return <AppShell {...shell} active="myHomes" home={h ? { id: homeId, name: h.name, section, owner: h.permissions.manageSharing, audit: h.permissions.viewAudit } : undefined}
    crumbs={[{ label: shell.t('myHomes'), href: '/homes' }, ...(h ? [{ label: h.name, href: section === 'profile' && !crumbs?.length ? undefined : `/homes/${homeId}` }] : []), ...(section !== 'profile' && label ? [{ label }] : []), ...(crumbs || [])]}>
    <Suspense fallback={<Loading t={shell.t}/>}>{children}</Suspense></AppShell>;
}
function WorkShell({ workId, ...shell }: ShellProps & { workId: string }) {
  return <Protected t={shell.t}><WorkShellInner workId={workId} {...shell}/></Protected>;
}
function WorkShellInner({ workId, ...shell }: ShellProps & { workId: string }) {
  const w = useGetWork(workId);
  const h = useGetHomeOverview(w.data?.homeId ?? '', { query: { enabled: !!w.data?.homeId, queryKey: [`/api/homes/${w.data?.homeId}`] } });
  const home = h.data?.home;
  return <AppShell {...shell} active="myHomes" home={home ? { id: home.id, name: home.name, section: 'history', owner: home.permissions.manageSharing, audit: home.permissions.viewAudit } : undefined}
    crumbs={[{ label: shell.t('myHomes'), href: '/homes' }, ...(w.data ? [{ label: w.data.homeName, href: `/homes/${w.data.homeId}` }, { label: w.data.title }] : [])]}>
    <Suspense fallback={<Loading t={shell.t}/>}><WorkPage workId={workId}/></Suspense></AppShell>;
}
function PlainShell({ active, crumbs, children, ...shell }: ShellProps & { active: string; crumbs: Crumb[]; children: ReactNode }) {
  return <Protected t={shell.t}><AppShell {...shell} active={active} crumbs={crumbs}><Suspense fallback={<Loading t={shell.t}/>}>{children}</Suspense></AppShell></Protected>;
}
function PublicSuspense({ children, t }: { children: ReactNode; t: (k: TKey) => string }) { return <Suspense fallback={<Loading t={t}/>}>{children}</Suspense>; }
function InvitationPage({lang,change,t}:{lang:Lang;change:(v:Lang)=>void;t:(k:TKey)=>string}) {
  const accept=useAcceptInvitation();const [,setLocation]=useLocation();const token=new URLSearchParams(window.location.search).get('token')||'';const [typed,setTyped]=useState(token);
  return <Protected t={t}><AppShell lang={lang} change={change} t={t}><div className="invite-page"><div className="invite-mark"><FileCheck2 size={25}/></div><div className="eyebrow">{t('eyAccess')}</div><h1 className="font-display">{t('acceptInvite')}</h1><p>{t('trust')}</p><form onSubmit={e=>{e.preventDefault();accept.mutate({data:{token:typed}},{onSuccess:()=>{setLocation('/dashboard');}});}}><Field label={t('invitationToken')} name="invite-token" required value={typed} onChange={setTyped}/><Button type="submit" disabled={accept.isPending}>{t('accept')}<ArrowRight size={15}/></Button></form>{accept.isError&&<p className="form-error">{t('error')}</p>}</div></AppShell></Protected>;
}
const clerkCopy: Record<Lang, Record<string, unknown>> = {
  az: { formFieldLabel__emailAddress:'E-poçt ünvanı', formFieldLabel__password:'Şifrə', formFieldInputPlaceholder__emailAddress:'E-poçt ünvanınızı yazın', formFieldInputPlaceholder__password:'Şifrənizi yazın', formFieldInputPlaceholder__signUpPassword:'Şifrə yaradın', formButtonPrimary:'Davam et', dividerText:'və ya', socialButtonsBlockButton:'{{provider|titleize}} ilə davam et',
    signIn:{start:{title:'Layihənizə qayıdın',subtitle:'Daxil olun və işin gedişini izləyin',actionText:'Hesabınız yoxdur?',actionLink:'Qeydiyyatdan keçin'}},
    signUp:{start:{title:'Təhvil hesabı yaradın',subtitle:'Layihəniz üçün ortaq, aydın qeyd sahəsi',actionText:'Artıq hesabınız var?',actionLink:'Daxil olun'}} },
  ru: { formFieldLabel__emailAddress:'Эл. почта', formFieldLabel__password:'Пароль', formFieldInputPlaceholder__emailAddress:'Введите адрес эл. почты', formFieldInputPlaceholder__password:'Введите пароль', formFieldInputPlaceholder__signUpPassword:'Придумайте пароль', formButtonPrimary:'Продолжить', dividerText:'или', socialButtonsBlockButton:'Продолжить через {{provider|titleize}}',
    signIn:{start:{title:'Вернитесь к проекту',subtitle:'Войдите и следите за ходом работ',actionText:'Нет аккаунта?',actionLink:'Зарегистрироваться'}},
    signUp:{start:{title:'Создайте аккаунт Təhvil',subtitle:'Общее и понятное пространство для вашего проекта',actionText:'Уже есть аккаунт?',actionLink:'Войти'}} },
  en: { signIn:{start:{title:'Return to your project',subtitle:'Sign in and follow the progress'}}, signUp:{start:{title:'Create your Təhvil account',subtitle:'A shared, clear record for your project'}} },
};
function authTag() { const l=(localStorage.getItem('tehvil-language') as Lang)||'az'; return l==='ru'?'БАКУ · ПРОСТРАНСТВО ПРОЕКТА':l==='en'?'BAKU · PROJECT SPACE':'BAKI · LAYİHƏ MƏKANI'; }
function authCopy() { return copy[((localStorage.getItem('tehvil-language') as Lang) || 'az')]; }
function SignInPage() { const c=authCopy(); return <div className="auth-page"><div className="auth-side"><Brand inverse/><div><div className="eyebrow">{c.artTop}</div><h1 className="font-display">{c.hero}</h1><p>{c.disclaimer}</p></div><span>{authTag()}</span></div><div className="auth-form-side"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} {...realtorRedirect()}/></div></div>; }
function realtorRedirect() {
  const qs = new URLSearchParams(window.location.search);
  // Only same-site paths (e.g. an invitation link) are accepted as a redirect target.
  const next = qs.get('redirect');
  if (next && /^\/(invite|works|homes|workers)\/[A-Za-z0-9_/-]{1,80}$/.test(next)) return { forceRedirectUrl: `${basePath}${next}` };
  return qs.get('realtor') ? { forceRedirectUrl: `${basePath}/realtor` } : {};
}
function SignUpPage() { const c=authCopy(); const realtor=!!realtorRedirect().forceRedirectUrl; return <div className="auth-page"><div className="auth-side"><Brand inverse/><div><div className="eyebrow">{realtor?'REALTOR':c.artTop}</div><h1 className="font-display">{realtor?'Satışı idarə edin, güvəni sübut edin.':c.hero}</h1><p>{c.disclaimer}</p></div><span>{authTag()}</span></div><div className="auth-form-side"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in${realtor?'?realtor=1':''}`} {...realtorRedirect()}/></div></div>; }
function HomeRedirect({lang,change,t}:{lang:Lang;change:(v:Lang)=>void;t:(k:TKey)=>string}) { return <><Show when="signed-in"><Redirect to="/homes"/></Show><Show when="signed-out"><Landing lang={lang} change={change} t={t}/></Show></>; }
function FeedbackBanner({ t }: { t: (k: TKey) => any }) {
  const [msg, setMsg] = useState<FeedbackMsg | null>(null);
  useEffect(() => onFeedback(m => setMsg(m)), []);
  useEffect(() => { if (!msg) return; const timer = window.setTimeout(() => setMsg(null), 7000); return () => window.clearTimeout(timer); }, [msg]);
  if (!msg) return null;
  const key = (msg.key ?? (msg.status === 401 ? 'errAuth' : msg.status === 403 ? 'errForbidden' : msg.status && msg.status < 500 ? 'errState' : 'error')) as TKey;
  return <div className="feedback-banner" role="alert" data-testid="feedback-banner"><div><strong>{t('errTitle')}</strong>{t(key)}{msg.detail && <small>{msg.detail}</small>}</div><button className="icon-button" aria-label={t('dismiss')} onClick={() => setMsg(null)}><X size={14} /></button></div>;
}
function ClerkCacheInvalidator() {
  const {addListener}=useClerk();const qc=useQueryClient();
  useEffect(()=>{let previous:string|null|undefined;return addListener(({user})=>{const current=user?.id??null;if(previous!==undefined&&previous!==current){qc.clear();resetSmetaSession();}previous=current;});},[addListener,qc]);
  return null;
}
function ClerkRoutes() {
  const [,setLocation]=useLocation();
  const {lang,change:changeLang}=useLanguage();
  const t=(key:TKey):any=>copy[lang][key];
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    appearance={{theme:shadcn,cssLayerName:'clerk',options:{logoPlacement:'inside',logoLinkUrl:basePath||'/',logoImageUrl:`${window.location.origin}${basePath}/logo.svg`},variables:{colorPrimary:'#24483f',colorPrimaryForeground:'#f8f6f1',colorForeground:'#213a34',colorMutedForeground:'#6b7b73',colorDanger:'#a9433d',colorBackground:'#fbf9f4',colorInput:'#fffdf9',colorInputForeground:'#213a34',colorNeutral:'#d8d5ca',fontFamily:'DM Sans, sans-serif',borderRadius:'1rem'},elements:{rootBox:'w-full flex justify-center',cardBox:'bg-[#fbf9f4] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#e5e0d5]',card:'!shadow-none !border-0 !bg-transparent !rounded-none',footer:'!shadow-none !border-0 !bg-transparent !rounded-none',headerTitle:'text-[#213a34] font-semibold',headerSubtitle:'text-[#66766f]',socialButtonsBlockButtonText:'text-[#213a34]',formFieldLabel:'text-[#344b43]',footerActionLink:'text-[#24483f] font-semibold',footerActionText:'text-[#66766f]',dividerText:'text-[#758078]',identityPreviewEditButton:'text-[#24483f]',formFieldSuccessText:'text-[#24483f]',alertText:'text-[#a9433d]',logoBox:'mb-3',logoImage:'max-h-10',socialButtonsBlockButton:'border border-[#d8d5ca] bg-[#fffdf9] rounded-xl',formButtonPrimary:'bg-[#24483f] hover:bg-[#1b3932] text-[#f8f6f1] rounded-xl',formFieldInput:'bg-[#fffdf9] border border-[#d8d5ca] rounded-xl text-[#213a34]',footerAction:'border-0',dividerLine:'bg-[#e5e0d5]',alert:'bg-[#f6e8e4] border-[#ecd1cb]',otpCodeFieldInput:'border border-[#d8d5ca] rounded-lg',formFieldRow:'mb-4',main:'gap-4'}}}
    localization={clerkCopy[lang]}
    routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <QueryClientProvider client={queryClient}><ClerkCacheInvalidator/><Switch>
      <Route path="/share/:token" component={()=> <SharedPassportPage token={window.location.pathname.split('/').filter(Boolean).pop()||''} lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/p/confirm/contractor/:token">{params => <PublicSuspense t={t}><ContractorConfirmPage token={params.token}/></PublicSuspense>}</Route>
      <Route path="/p/confirm/owner/:token">{params => <PublicSuspense t={t}><OwnerConfirmPage token={params.token}/></PublicSuspense>}</Route>
      <Route path="/p/:publicId/print">{params => <PublicSuspense t={t}><PrintPassportPage publicId={params.publicId}/></PublicSuspense>}</Route>
      <Route path="/p/:publicId">{params => <PublicSuspense t={t}><PublicPassportPage publicId={params.publicId}/></PublicSuspense>}</Route>
      <Route path="/h/s/:token">{params => <PublicSuspense t={t}><SharedHomePage token={params.token}/></PublicSuspense>}</Route>
      <Route path="/h/:publicId">{params => <PublicSuspense t={t}><PublicHomePage publicId={params.publicId}/></PublicSuspense>}</Route>
      <Route path="/w/:workerId">{params => <PublicSuspense t={t}><PublicWorkerPage workerId={params.workerId}/></PublicSuspense>}</Route>
      <Route path="/invite/:token">{params => <PublicSuspense t={t}><InviteAcceptPage token={params.token}/></PublicSuspense>}</Route>
      <Route path="/homes">{() => <PlainShell active="myHomes" crumbs={[{ label: t('myHomes') }]} lang={lang} change={changeLang} t={t}><HomesPage/></PlainShell>}</Route>
      <Route path="/homes/:homeId/history">{params => <HomeShell homeId={params.homeId} section="history" lang={lang} change={changeLang} t={t}><HomeHistoryPage homeId={params.homeId}/></HomeShell>}</Route>
      <Route path="/homes/:homeId/rooms/:roomId">{params => <HomeShell homeId={params.homeId} section="rooms" lang={lang} change={changeLang} t={t}><RoomPage homeId={params.homeId} roomId={params.roomId}/></HomeShell>}</Route>
      <Route path="/homes/:homeId/rooms">{params => <HomeShell homeId={params.homeId} section="rooms" lang={lang} change={changeLang} t={t}><HomeRoomsPage homeId={params.homeId}/></HomeShell>}</Route>
      <Route path="/homes/:homeId/map">{params => <HomeShell homeId={params.homeId} section="map" lang={lang} change={changeLang} t={t}><HomeMapPage homeId={params.homeId}/></HomeShell>}</Route>
      <Route path="/homes/:homeId/equipment">{params => <HomeShell homeId={params.homeId} section="equipment" lang={lang} change={changeLang} t={t}><HomeEquipmentPage homeId={params.homeId}/></HomeShell>}</Route>
      <Route path="/homes/:homeId/performers">{params => <HomeShell homeId={params.homeId} section="performers" lang={lang} change={changeLang} t={t}><HomePerformersPage homeId={params.homeId}/></HomeShell>}</Route>
      <Route path="/homes/:homeId/sharing">{params => <HomeShell homeId={params.homeId} section="sharing" lang={lang} change={changeLang} t={t}><HomeSharingPage homeId={params.homeId}/></HomeShell>}</Route>
      <Route path="/homes/:homeId/audit">{params => <HomeShell homeId={params.homeId} section="audit" lang={lang} change={changeLang} t={t}><HomeAuditPage homeId={params.homeId}/></HomeShell>}</Route>
      <Route path="/homes/:homeId">{params => <HomeShell homeId={params.homeId} section="profile" lang={lang} change={changeLang} t={t}><HomeProfilePage homeId={params.homeId}/></HomeShell>}</Route>
      <Route path="/works/:workId">{params => <WorkShell workId={params.workId} lang={lang} change={changeLang} t={t}/>}</Route>
      <Route path="/my-works">{() => <PlainShell active="myWorks" crumbs={[{ label: t('myWorks') }]} lang={lang} change={changeLang} t={t}><MyWorksPage/></PlainShell>}</Route>
      <Route path="/workers/:workerId">{params => <PlainShell active="workersNav" crumbs={[{ label: t('workersNav'), href: '/workers' }, { label: 'Profil' }]} lang={lang} change={changeLang} t={t}><WorkerProfilePage workerId={params.workerId}/></PlainShell>}</Route>
      <Route path="/workers">{() => <PlainShell active="workersNav" crumbs={[{ label: t('workersNav') }]} lang={lang} change={changeLang} t={t}><WorkersPage/></PlainShell>}</Route>
      <Route path="/invitations">{() => <PlainShell active="inboxNav" crumbs={[{ label: 'Dəvətlər' }]} lang={lang} change={changeLang} t={t}><InboxPage tab="invitations"/></PlainShell>}</Route>
      <Route path="/approvals">{() => <PlainShell active="inboxNav" crumbs={[{ label: 'Təsdiq gözləyən qeydlər' }]} lang={lang} change={changeLang} t={t}><InboxPage tab="approvals"/></PlainShell>}</Route>
      <Route path="/" component={()=> <HomeRedirect lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/sign-in/*?" component={SignInPage}/><Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/dashboard" component={()=> <DashboardPage lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/projects/new" component={()=> <NewRoute lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/projects/:projectId/scope" component={()=> <ProjectRoute section="scope" lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/projects/:projectId/changes" component={()=> <ProjectRoute section="changes" lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/projects/:projectId/milestones" component={()=> <ProjectRoute section="milestones" lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/projects/:projectId/payments" component={()=> <ProjectRoute section="payments" lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/projects/:projectId/timeline" component={()=> <ProjectRoute section="timeline" lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/projects/:projectId/passport" component={()=> <ProjectRoute section="passport" lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/projects/:projectId" component={()=> <ProjectRoute lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/invites/accept" component={()=> <InvitationPage lang={lang} change={changeLang} t={t}/>}/>
      <Route path="/estimate/:publicToken">{params => <Suspense fallback={<Loading t={t}/>}><PublicEstimatePage token={params.publicToken}/></Suspense>}</Route>
      <Route path="/smeta">{() => <SmetaShell lang={lang} change={changeLang} t={t}><SmetaDashboardPage/></SmetaShell>}</Route>
      <Route path="/smeta/new">{() => <SmetaShell lang={lang} change={changeLang} t={t} crumbs={[{ label: 'Yeni smeta' }]}><NewEstimatePage/></SmetaShell>}</Route>
      <Route path="/smeta/:projectId/print">{params => <Protected t={t}><Suspense fallback={<Loading t={t}/>}><EstimatePrintPage projectId={params.projectId}/></Suspense></Protected>}</Route>
      <Route path="/realtor">{() => <RealtorShell section="overview" lang={lang} change={changeLang} t={t}><RealtorOverviewPage/></RealtorShell>}</Route>
      <Route path="/realtor/listings">{() => <RealtorShell section="listings" lang={lang} change={changeLang} t={t}><RealtorListingsPage/></RealtorShell>}</Route>
      <Route path="/realtor/leads">{() => <RealtorShell section="leads" lang={lang} change={changeLang} t={t}><RealtorLeadsPage/></RealtorShell>}</Route>
      <Route path="/realtor/appointments">{() => <RealtorShell section="appointments" lang={lang} change={changeLang} t={t}><RealtorAppointmentsPage/></RealtorShell>}</Route>
      <Route path="/realtor/passports">{() => <RealtorShell section="passports" lang={lang} change={changeLang} t={t}><RealtorPassportsPage/></RealtorShell>}</Route>
      <Route path="/realtor/passports/new">{() => <RealtorShell section="passports" crumbs={[{ label: 'Yeni pasport' }]} lang={lang} change={changeLang} t={t}><PassportWizardPage/></RealtorShell>}</Route>
      <Route path="/realtor/passports/:passportId">{params => <RealtorShell section="passports" crumbs={[{ label: 'Pasport' }]} lang={lang} change={changeLang} t={t}><PassportWizardPage passportId={params.passportId}/></RealtorShell>}</Route>
      <Route path="/realtor/whatsapp">{() => <RealtorShell section="whatsapp" lang={lang} change={changeLang} t={t}><RealtorWhatsappPage/></RealtorShell>}</Route>
      <Route path="/realtor/profile">{() => <RealtorShell section="profile" lang={lang} change={changeLang} t={t}><RealtorProfilePage/></RealtorShell>}</Route>
      <Route path="/realtor/team">{() => <RealtorShell section="team" lang={lang} change={changeLang} t={t}><RealtorTeamPage/></RealtorShell>}</Route>
      <Route path="/smeta/:projectId">{params => <SmetaDetailRoute projectId={params.projectId} lang={lang} change={changeLang} t={t}/>}</Route>
      <Route component={NotFound}/>
    </Switch><Toaster/><FeedbackBanner t={t}/></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <ErrorBoundary><TooltipProvider><WouterRouter base={basePath}><ClerkRoutes/></WouterRouter></TooltipProvider></ErrorBoundary>;
}

export default App;
