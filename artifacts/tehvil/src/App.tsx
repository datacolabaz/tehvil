import { Fragment, Suspense, lazy, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { MutationCache, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, Link, Redirect, Router as WouterRouter, useLocation } from 'wouter';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, Calculator, Check, CheckCircle2, ChevronDown, ChevronRight,
  ClipboardCheck, Clock3, CreditCard, DoorOpen, FileCheck2, FilePlus2, FileText, Home, ImagePlus,
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
  getListTimelineQueryKey, getGetRenovationPassportQueryKey,
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
import { resetContractorSession } from '@/lib/contractor/account';
import { UpgradeHost } from '@/components/contractor/upgrade-host';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';
import './smeta.css';
import './contractor.css';

const SmetaDashboardPage = lazy(() => import('@/pages/smeta/dashboard-page').then(m => ({ default: m.SmetaDashboardPage })));
const NewEstimatePage = lazy(() => import('@/pages/smeta/new-estimate-page').then(m => ({ default: m.NewEstimatePage })));
const EstimateDetailPage = lazy(() => import('@/pages/smeta/estimate-page').then(m => ({ default: m.EstimateDetailPage })));
const PublicEstimatePage = lazy(() => import('@/pages/smeta/public-estimate-page').then(m => ({ default: m.PublicEstimatePage })));
const EstimatePrintPage = lazy(() => import('@/pages/smeta/print-page').then(m => ({ default: m.EstimatePrintPage })));
const ContractorLandingPage = lazy(() => import('@/pages/contractors/landing-page').then(m => ({ default: m.ContractorLandingPage })));
const ContractorSignupPage = lazy(() => import('@/pages/contractors/signup-page').then(m => ({ default: m.ContractorSignupPage })));
const ContractorSsoCallbackPage = lazy(() => import('@/pages/contractors/signup-page').then(m => ({ default: m.ContractorSsoCallbackPage })));
const OnboardingPage = lazy(() => import('@/pages/contractors/onboarding-page').then(m => ({ default: m.OnboardingPage })));
const CompanyProfilePage = lazy(() => import('@/pages/settings/company-profile-page').then(m => ({ default: m.CompanyProfilePage })));
const PlanPage = lazy(() => import('@/pages/settings/plan-page').then(m => ({ default: m.PlanPage })));

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
function AppShell({ children, project, projectId, active, crumbs, lang, change, t }: { children: ReactNode; project?: Project; projectId?: string; active?: string; crumbs?: Crumb[]; lang: Lang; change: (v: Lang) => void; t: (k: TKey) => string }) {
  const [open, setOpen] = useState(false);
  const { signOut } = useClerk(); const { user } = useUser();
  const nav: { href: string; icon: typeof Home; key: TKey; badge?: boolean }[] = [
    { href: '/dashboard', icon: LayoutDashboard, key: 'dashboard' as const },
    { href: '/smeta', icon: Calculator, key: 'smeta' as const, badge: true },
    ...(projectId ? [
      { href: `/projects/${projectId}`, icon: Home, key: 'projects' as const },
      { href: `/projects/${projectId}/scope`, icon: ListChecks, key: 'scope' as const },
      { href: `/projects/${projectId}/changes`, icon: FilePlus2, key: 'changes' as const },
      { href: `/projects/${projectId}/milestones`, icon: ClipboardCheck, key: 'milestones' as const },
      { href: `/projects/${projectId}/payments`, icon: WalletCards, key: 'payments' as const },
      { href: `/projects/${projectId}/timeline`, icon: Clock3, key: 'timeline' as const },
      { href: `/projects/${projectId}/passport`, icon: FileText, key: 'passport' as const },
    ] : [
      { href: '/settings/company-profile', icon: Building2, key: 'companyProfile' as const },
      { href: '/settings/plan', icon: CreditCard, key: 'planNav' as const },
    ]),
  ];
  return <div className="workspace">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}><div className="sidebar-head"><Brand inverse/><button className="mobile-close" onClick={() => setOpen(false)} aria-label={t('close')}><X size={18}/></button></div>
      {project && <div className="project-switcher"><span className="project-symbol">⌂</span><div><small>{t('projects')}</small><strong>{project.name}</strong></div><ChevronDown size={14}/></div>}
      <div className="sidebar-label">{projectId ? project?.name || t('projects') : t('dashboard')}</div>
      <nav className="side-nav">{nav.map(({ href, icon: Icon, key, badge }) => <Link key={key} href={href} onClick={() => setOpen(false)} className={`side-link ${active === key || (!active && key === 'dashboard') ? 'selected' : ''}`} data-testid={`nav-${key}`}><Icon size={17}/><span>{t(key)}</span>{badge && <span className="nav-badge">{t('newBadge')}</span>}{active === key && <span className="nav-active-dot"/>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={17}/><p>{t('disclaimer')}</p></div><button className="side-link logout" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={17}/>{t('signOut')}</button></div>
    </aside>
    <div className="workspace-main"><header className="topbar"><button className="mobile-menu" onClick={() => setOpen(true)} aria-label={t('openMenu')}><Menu size={20}/></button><div className="crumbs"><Link href="/dashboard">{t('dashboard')}</Link>{project && <><ChevronRight size={13}/><span>{project.name}</span></>}{crumbs?.map((c, i) => <Fragment key={i}><ChevronRight size={13}/>{c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}</Fragment>)}</div><div className="topbar-tools"><LanguagePicker lang={lang} change={change} compact/><div className="user-initials">{(user?.firstName||user?.primaryEmailAddress?.emailAddress||'T').charAt(0).toUpperCase()}</div></div></header>
      <main className="page-content">{children}</main>
    </div>{open && <button className="scrim" aria-label={t('close')} onClick={() => setOpen(false)}/>}<UpgradeHost/>
  </div>;
}
function Landing({ lang, change, t }: { lang: Lang; change: (v: Lang)=>void; t: (k:TKey)=>string }) {
  const [, setLocation] = useLocation();
  const stages = copy[lang].stages;
  const descriptions = copy[lang].stageDescs;
  return <div className="landing"><header className="landing-nav wrap"><Brand/><nav><a href="#how">{t('learn')}</a><Link href="/podratcilar-ucun" data-testid="link-for-contractors">{t('forContractors')}</Link><Link href="/dashboard">{t('dashboard')}</Link></nav><div className="landing-actions"><LanguagePicker lang={lang} change={change}/><Link href="/sign-in" className="text-link">{t('signIn')}</Link><Link href="/sign-up" className="button button-primary">{t('signUp')}<ArrowUpRight size={16}/></Link></div></header>
    <section className="hero wrap"><div className="hero-copy appear"><div className="eyebrow"><span className="eyebrow-dot"/>{t('tagline')}</div><h1 className="font-display">{t('hero')}</h1><p>{t('lead')}</p><div className="hero-cta"><Button onClick={() => setLocation('/sign-up')}>{t('start')}<ArrowRight size={17}/></Button><a href="#how" className="quiet-link">{t('learn')}<ArrowDownLeft size={16}/></a></div><div className="hero-proof"><ShieldCheck size={17}/><span>{t('disclaimer')}</span></div></div>
      <div className="hero-art appear-delay"><div className="art-topline"><span><i/> {t('artTop')}</span><span>01 — 03</span></div><div className="blueprint"><div className="blueprint-label">BAKI · RESIDENTIAL / 02</div><div className="blueprint-plan"><div className="plan-room room-living"><span>{t('planLiving')}</span><small>01</small></div><div className="plan-room room-kitchen"><span>{t('planKitchen')}</span><small>02</small></div><div className="plan-room room-bed"><span>{t('planBed')}</span><small>03</small></div><div className="plan-room room-bath"><span>{t('planBath')}</span><small>04</small></div><div className="plan-door"/></div><div className="plan-dim">6.40 m <span>3.80 m</span></div><div className="plan-status"><div className="status-check"><Check size={15}/></div><div><strong>{t('planApproved')}</strong><small>{t('planParties')}</small></div><div className="status-mini">{t('planRecorded')}</div></div></div><div className="art-foot"><span>{t('artOne')}</span><span>40°22' N / 49°50' E</span></div></div>
    </section><div className="trust-strip"><div className="wrap trust-items"><span>{t('trust')}</span><i/><span>{t('clarity')}</span><i/><span>{t('history')}</span></div></div>
    <section className="workflow wrap" id="how"><div className="workflow-intro"><div className="eyebrow">{t('eyCertain')}</div><h2 className="font-display">{t('workflow')}</h2><p>{t('workflowLead')}</p></div><div className="workflow-list">{stages.map((stage, i) => { const Icons=[FileCheck2, ArrowRight, ImagePlus]; const Icon=Icons[i]; return <article className="workflow-row" key={stage}><div className="workflow-number">0{i+1}</div><div className="workflow-icon"><Icon size={20}/></div><div><h3>{stage}</h3><p>{descriptions[i]}</p></div><ChevronRight className="workflow-chevron" size={18}/></article>; })}</div></section>
    <section className="closing wrap"><div className="closing-inner"><div className="closing-mark">t.</div><div><div className="eyebrow">{t('tagline')}</div><h2 className="font-display">{t('start')}</h2><p>{t('lead')}</p></div><Link href="/sign-up" className="button button-primary">{t('createFirst')}<ArrowRight size={16}/></Link></div></section>
    <Partners lang={lang}/>
    <footer className="landing-footer wrap"><Brand/><p>{t('disclaimer')}</p><LanguagePicker lang={lang} change={change}/><nav className="landing-legal" aria-label="Bələdçilər"><Link href="/podratcilar-ucun">{t('forContractors')}</Link><a href="/temir-tehvil-akti.html">Təhvil-təslim aktı</a><a href="/temir-islerinin-qebulu.html">Təmir işlərinin qəbulu</a><a href="/podratci-ile-razilasma.html">Podratçı ilə razılaşma</a><a href="/temir-elave-isler.html">Əlavə işlər və dəyişikliklər</a></nav><nav className="landing-legal"><a href="/privacy.html">{lang==='az'?'Məxfilik siyasəti':lang==='ru'?'Политика конфиденциальности':'Privacy policy'}</a><a href="/terms.html">{lang==='az'?'İstifadə şərtləri':lang==='ru'?'Условия использования':'Terms of use'}</a></nav><address className="landing-contact"><a href="mailto:support@tehvil.az">support@tehvil.az</a><a href="tel:+994503066626">+994 50 306 66 26</a><a href="https://wa.me/994503066626" target="_blank" rel="noopener noreferrer">WhatsApp</a><span>Bakı, Səbail rayonu, Badamdar qəsəbəsi, 26-cı küçə, 20</span></address></footer>
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
      <aside className="dashboard-aside"><div className="aside-panel"><div className="eyebrow">{t('actions')}</div><h3>{t('pending')}</h3>{projects.slice(0,2).map((p, i) => <Link href={`/projects/${p.id}`} className="action-link" key={p.id}><span className={`action-icon action-icon-${i}`}><ClipboardCheck size={16}/></span><span><strong>{p.name}</strong><small>{roleLabel(p.participantRole,t)} · {p.city}</small></span><ArrowUpRight size={14}/></Link>)}<div className="aside-foot"><ShieldCheck size={15}/>{t('disclaimer')}</div></div><div className="aside-stat"><span className="eyebrow">{t('history')}</span><strong>{projects.length} <small>{t('projects').toLowerCase()}</small></strong><span>{t('trust')}</span></div><Link href="/smeta" className="passport-promo" data-testid="link-smeta-promo"><Calculator size={19}/><div><strong>{t('smeta')}</strong><small>{t('smetaPromo')}</small></div><ArrowUpRight size={15}/></Link></aside>
    </div> : <div className="empty-projects"><div className="empty-illustration"><div className="empty-window"><div/><div/><div/></div><DoorOpen size={36}/></div><span className="eyebrow">{t('active')}</span><h2 className="font-display">{t('noProjects')}</h2><p>{t('noProjectsText')}</p><Link href="/projects/new" className="button button-primary"><Plus size={17}/>{t('createFirst')}</Link></div>}
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
function SettingsShell({ active, label, children, ...shell }: ShellProps & { active: TKey; label: string; children: ReactNode }) {
  return <Protected t={shell.t}><AppShell {...shell} active={active} crumbs={[{ label }]}><Suspense fallback={<Loading t={shell.t}/>}>{children}</Suspense></AppShell></Protected>;
}
function SmetaDetailRoute({ projectId, ...shell }: ShellProps & { projectId: string }) {
  const project = useSmetaProject(projectId);
  return <SmetaShell {...shell} crumbs={project ? [{ label: project.name }] : []}><EstimateDetailPage projectId={projectId}/></SmetaShell>;
}
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
function authCopy() { return copy[((localStorage.getItem('tehvil-language') as Lang) || 'az')]; }
function SignInPage() { const c=authCopy(); return <div className="auth-page"><div className="auth-side"><Brand inverse/><div><div className="eyebrow">{c.artTop}</div><h1 className="font-display">{c.hero}</h1><p>{c.disclaimer}</p></div><span>BAKI · PROJECT SPACE</span></div><div className="auth-form-side"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></div></div>; }
function SignUpPage() { const c=authCopy(); return <div className="auth-page"><div className="auth-side"><Brand inverse/><div><div className="eyebrow">{c.artTop}</div><h1 className="font-display">{c.hero}</h1><p>{c.disclaimer}</p></div><span>BAKI · PROJECT SPACE</span></div><div className="auth-form-side"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></div></div>; }
function HomeRedirect({lang,change,t}:{lang:Lang;change:(v:Lang)=>void;t:(k:TKey)=>string}) { return <><Show when="signed-in"><Redirect to="/dashboard"/></Show><Show when="signed-out"><Landing lang={lang} change={change} t={t}/></Show></>; }
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
  useEffect(()=>{let previous:string|null|undefined;return addListener(({user})=>{const current=user?.id??null;if(previous!==undefined&&previous!==current){qc.clear();resetSmetaSession();resetContractorSession();}previous=current;});},[addListener,qc]);
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
      <Route path="/smeta/:projectId">{params => <SmetaDetailRoute projectId={params.projectId} lang={lang} change={changeLang} t={t}/>}</Route>
      <Route path="/podratcilar-ucun">{() => <Suspense fallback={<Loading t={t}/>}><ContractorLandingPage/></Suspense>}</Route>
      <Route path="/podratcilar-ucun/qeydiyyat/sso-callback">{() => <Suspense fallback={<Loading t={t}/>}><ContractorSsoCallbackPage/></Suspense>}</Route>
      <Route path="/podratcilar-ucun/qeydiyyat">{() => <Suspense fallback={<Loading t={t}/>}><ContractorSignupPage/></Suspense>}</Route>
      <Route path="/onboarding">{() => <Protected t={t}><Suspense fallback={<Loading t={t}/>}><OnboardingPage/></Suspense></Protected>}</Route>
      <Route path="/settings/company-profile">{() => <SettingsShell lang={lang} change={changeLang} t={t} active="companyProfile" label={t('companyProfile')}><CompanyProfilePage/></SettingsShell>}</Route>
      <Route path="/settings/plan">{() => <SettingsShell lang={lang} change={changeLang} t={t} active="planNav" label={t('planNav')}><PlanPage/></SettingsShell>}</Route>
      <Route component={NotFound}/>
    </Switch><Toaster/><FeedbackBanner t={t}/></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <ErrorBoundary><TooltipProvider><WouterRouter base={basePath}><ClerkRoutes/></WouterRouter></TooltipProvider></ErrorBoundary>;
}

export default App;
