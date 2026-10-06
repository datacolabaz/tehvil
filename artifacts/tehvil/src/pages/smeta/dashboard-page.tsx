import { useMemo } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowUpRight, Calculator, Clock3, FilePlus2, FileSpreadsheet, Info, LayoutTemplate, MapPin, MessageSquareText, Plus, RotateCcw, Ruler, Sparkles, Upload, WalletCards } from 'lucide-react';
import { PageHeading } from '@/components/kit';
import { HealthLabel, SkeletonDashboard, SmetaToaster, StatusBadge, toast } from '@/components/smeta/ui';
import { portfolioInsight } from '@/lib/smeta/ai';
import { budgetSummary, changeTotals, round2 } from '@/lib/smeta/calc';
import { PROPERTY_LABEL, RENOVATION_LABEL, TEMPLATES } from '@/lib/smeta/catalog';
import { azn, dateAz, num } from '@/lib/smeta/format';
import { displayStatus, smeta, useFirstLoad, useSmetaProjects } from '@/lib/smeta/store';
import type { Project } from '@/lib/smeta/types';

export function SmetaDashboardPage() {
  const projects = useSmetaProjects();
  const loading = useFirstLoad('smeta-dashboard');
  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projects]);
  const stats = useMemo(() => {
    const summaries = projects.map(p => ({ p, b: budgetSummary(p), c: changeTotals(p.changeOrders) }));
    return {
      active: projects.length,
      plan: round2(summaries.reduce((s, x) => s + x.b.plannedBudget, 0)),
      pendingCount: summaries.reduce((s, x) => s + x.c.pendingCount, 0),
      pendingAmount: round2(summaries.reduce((s, x) => s + x.c.pending, 0)),
      overBudget: summaries.filter(x => x.b.health === 'risk').length,
      inProgress: projects.filter(p => p.completion > 0 && p.completion < 100).length,
      drafts: projects.filter(p => p.status === 'draft').length,
    };
  }, [projects]);

  const heading = <PageHeading eyebrow="Smeta və büdcə" title="AI Smeta" description="Çertyoj, ölçü və bazar qiymətləri əsasında təmir büdcənizi idarə edin." action={<div className="heading-buttons">
    <Link href="/smeta/new?source=drawing" className="button button-secondary" data-testid="button-upload-drawing"><Upload size={16} />Çertyoj yüklə</Link>
    <Link href="/smeta/new" className="button button-primary" data-testid="button-new-estimate"><Plus size={16} />Yeni smeta yarat</Link>
  </div>} />;

  if (loading) return <>{heading}<SkeletonDashboard /></>;

  return <>
    {heading}
    <section className="sm-stats" aria-label="Qısa xülasə">
      <div className="sm-stat"><FileSpreadsheet size={17} className="sm-stat-icon" aria-hidden /><span className="eyebrow">Aktiv layihələr</span><strong className="num">{stats.active}</strong><span>{stats.inProgress} icrada · {stats.drafts} qaralama</span></div>
      <div className="sm-stat dark"><WalletCards size={17} className="sm-stat-icon" aria-hidden /><span className="eyebrow">Ümumi plan büdcəsi</span><strong className="num">{num(stats.plan, 0)} <small>AZN</small></strong><span>Bütün aktiv smetalar üzrə</span></div>
      <div className="sm-stat"><MessageSquareText size={17} className="sm-stat-icon" aria-hidden /><span className="eyebrow">Təsdiq gözləyən dəyişikliklər</span><strong className="num">{stats.pendingCount}</strong><span>{stats.pendingCount ? `Cəmi ${azn(stats.pendingAmount)} təsir` : 'Gözləyən qərar yoxdur'}</span></div>
      <div className={`sm-stat ${stats.overBudget ? 'alert' : ''}`}><AlertTriangle size={17} className="sm-stat-icon" aria-hidden /><span className="eyebrow">Büdcəni keçən layihələr</span><strong className="num">{stats.overBudget}</strong><span>{stats.overBudget ? 'Proqnoz razılaşdırılmış büdcədən yüksəkdir' : 'Bütün proqnozlar büdcə daxilindədir'}</span></div>
    </section>

    <div className="sm-dash-grid">
      <section aria-labelledby="recent-projects">
        <div className="section-head" style={{ marginBottom: 14 }}><div><div className="eyebrow">Son yenilənənlər</div><h2 id="recent-projects">Layihələr</h2></div><span className="count-chip">{String(projects.length).padStart(2, '0')}</span></div>
        {sorted.length ? <div className="sm-project-grid">{sorted.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}</div>
          : <div className="sm-empty"><div className="empty-illustration"><Calculator size={30} /></div><h3>Hələ smeta yoxdur</h3><p>Çertyoj yükləyin və ya ölçüləri daxil edin — AI ilkin smeta təklif edəcək, siz isə yoxlayıb təsdiqləyəcəksiniz.</p><Link href="/smeta/new" className="button button-primary"><Plus size={16} />Yeni smeta yarat</Link></div>}
      </section>

      <aside className="sm-aside">
        <div className="sm-ai-card">
          <span className="sm-ai-mark"><Sparkles size={17} aria-hidden /></span>
          <div className="eyebrow">AI tövsiyəsi</div>
          <h3>{portfolioInsight(projects)}</h3>
          <p>Faktiki xərclər qəbzlər əsasında smeta sətirləri ilə müqayisə olunur.</p>
          <div className="sm-ai-foot"><Info size={13} aria-hidden />İlkin avtomatik qiymətləndirmədir. Qərar verməzdən əvvəl rəqəmləri yoxlayın.</div>
        </div>

        <div className="aside-panel">
          <div className="eyebrow">Gözləyən addımlar</div>
          <h3>Diqqətinizi gözləyir</h3>
          <div className="sm-aside-list"><PendingActions projects={sorted} /></div>
        </div>

        <div className="aside-panel">
          <div className="eyebrow">Hazır şablonlar</div>
          <h3>Sürətli başlanğıc</h3>
          <div className="sm-aside-list">{TEMPLATES.slice(0, 4).map(t => <Link key={t.id} href={`/smeta/new?template=${t.id}`}><span className="action-icon"><LayoutTemplate size={15} /></span><span><strong>{t.title}</strong><small>{t.description}</small></span><ArrowUpRight size={14} /></Link>)}</div>
        </div>

        <button type="button" className="sm-link-btn" style={{ alignSelf: 'flex-start', color: '#7c8980' }} onClick={() => { smeta.resetDemo(); toast('Demo məlumatları ilkin vəziyyətə qaytarıldı'); }}><RotateCcw size={13} />Demo məlumatlarını sıfırla</button>
      </aside>
    </div>
    <SmetaToaster />
  </>;
}

function PendingActions({ projects }: { projects: Project[] }) {
  const items: { href: string; icon: typeof Clock3; title: string; detail: string }[] = [];
  for (const p of projects) {
    const pending = p.changeOrders.filter(c => c.status === 'pending');
    if (pending.length) items.push({ href: `/smeta/${p.id}?tab=changes`, icon: FilePlus2, title: `${pending.length} dəyişiklik təsdiq gözləyir`, detail: p.name });
    const ai = p.estimate.sections.flatMap(s => s.items).filter(i => i.status === 'ai').length;
    const review = p.measurements.filter(m => m.status === 'suggested').length;
    if (review) items.push({ href: `/smeta/${p.id}?tab=drawing`, icon: Ruler, title: `${review} AI ölçüsü yoxlanmalıdır`, detail: p.name });
    else if (ai) items.push({ href: `/smeta/${p.id}?tab=estimate`, icon: Sparkles, title: `${ai} AI sətri yoxlanmalıdır`, detail: p.name });
    if (p.status === 'revision_requested') items.push({ href: `/smeta/${p.id}?tab=documents`, icon: MessageSquareText, title: 'Sifarişçi düzəliş istəyib', detail: p.name });
    if (p.status === 'draft') items.push({ href: `/smeta/${p.id}`, icon: Clock3, title: 'Smeta sifarişçiyə göndərilməyib', detail: p.name });
  }
  if (!items.length) return <p className="sm-muted" style={{ fontSize: 13, margin: 0 }}>Hazırda gözləyən addım yoxdur.</p>;
  return <>{items.slice(0, 5).map((it, i) => <Link key={i} href={it.href}><span className={`action-icon action-icon-${i % 2}`}><it.icon size={15} /></span><span><strong>{it.title}</strong><small>{it.detail}</small></span><ArrowUpRight size={14} /></Link>)}</>;
}

function ProjectCard({ project: p, index }: { project: Project; index: number }) {
  const b = budgetSummary(p);
  const used = b.agreedBudget > 0 ? b.actualSpending / b.agreedBudget : 0;
  return <Link href={`/smeta/${p.id}`} className="sm-card appear" style={{ animationDelay: `${index * 40}ms` }} data-testid={`card-smeta-${p.id}`}>
    <div className="sm-card-top"><div className="project-card-symbol">{p.propertyKind === 'ofis' ? 'O' : p.propertyKind === 'villa' ? 'V' : 'M'}</div><StatusBadge status={displayStatus(p)} /><ArrowUpRight size={16} className="card-arrow" /></div>
    <div className="eyebrow">{PROPERTY_LABEL[p.propertyKind]} · {RENOVATION_LABEL[p.renovationKind]} təmir</div>
    <h3>{p.name}</h3>
    <div className="sm-card-meta"><span><MapPin size={12} aria-hidden />{p.district}</span><span>{num(p.areaM2)} m²</span></div>
    <div className="sm-money-row"><div><small>Plan büdcəsi</small><b className="num">{azn(b.plannedBudget)}</b></div><div><small>Faktiki xərc</small><b className="num">{azn(b.actualSpending)}</b></div></div>
    <div className="sm-card-foot" style={{ marginTop: 0, marginBottom: 6 }}><span>Büdcə istifadəsi</span><b className="num">{Math.round(used * 100)}%</b></div>
    <div className={`sm-budget-bar ${b.health}`} role="img" aria-label={`Büdcənin ${Math.round(used * 100)}%-i xərclənib`}><span style={{ width: `${Math.min(100, used * 100)}%` }} /></div>
    <div className="sm-card-foot"><span>İşlərin icrası</span><b className="num">{p.completion}%</b></div>
    <div className="progress-track" style={{ marginTop: 6 }} role="img" aria-label={`Tamamlanma ${p.completion}%`}><span style={{ width: `${p.completion}%` }} /></div>
    <div className="sm-card-foot" style={{ marginTop: 13 }}><HealthLabel health={b.health} /><span>Yeniləndi: {dateAz(p.updatedAt)}</span></div>
  </Link>;
}
