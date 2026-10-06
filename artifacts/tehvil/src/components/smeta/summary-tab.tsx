import { CheckCircle2, Info, Lightbulb, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react';
import { budgetInsights, type Insight } from '@/lib/smeta/ai';
import { budgetSummary, changeTotals, projectTotals, round2, sectionTotals } from '@/lib/smeta/calc';
import { BREAKDOWN_GROUP } from '@/lib/smeta/catalog';
import { azn, num, pct } from '@/lib/smeta/format';
import type { Project } from '@/lib/smeta/types';
import { HealthLabel } from './ui';
import { Scenarios } from './scenarios';

export function SummaryTab({ project: p }: { project: Project }) {
  const b = budgetSummary(p);
  const approvedCount = p.changeOrders.filter(c => c.status === 'approved').length;
  const spentShare = b.plannedBudget > 0 ? b.actualSpending / b.plannedBudget : 0;
  return <>
    <div className="sm-fin-cards">
      <div className="sm-fin accent"><span className="eyebrow">Plan</span><strong className="num">{num(b.plannedBudget)} <small>AZN</small></strong><span>Smeta v{p.estimate.version} üzrə</span></div>
      <div className="sm-fin"><span className="eyebrow">Faktiki</span><strong className="num">{num(b.actualSpending)} <small>AZN</small></strong><span>Planın {pct(spentShare)}-i xərclənib</span></div>
      <div className="sm-fin"><span className="eyebrow">Qalıq</span><strong className="num">{num(b.remainingBudget)} <small>AZN</small></strong><span>Plan − faktiki xərc</span></div>
      <div className="sm-fin"><span className="eyebrow">Təsdiqlənmiş əlavə işlər</span><strong className="num">{num(b.approvedChanges)} <small>AZN</small></strong><span>{approvedCount ? `${approvedCount} dəyişiklik sifarişi` : 'Hələ yoxdur'}</span></div>
      <div className="sm-fin"><span className="eyebrow">Tamamlanma</span><strong className="num">{b.completion}%</strong><div className="progress-track" style={{ marginTop: 8 }} role="img" aria-label={`İşlərin ${b.completion}%-i tamamlanıb`}><span style={{ width: `${b.completion}%` }} /></div></div>
    </div>

    <div className="sm-two-col">
      <section className="surface sm-panel" aria-labelledby="pva-title">
        <div className="section-head"><div><div className="eyebrow">Plan və fakt</div><h2 id="pva-title">Büdcə vəziyyəti</h2></div><HealthLabel health={b.health} /></div>
        <PlanVsActual project={p} />
      </section>
      <section className="surface sm-panel" aria-labelledby="ai-check-title">
        <div className="section-head"><div><div className="eyebrow"><Sparkles size={11} aria-hidden style={{ verticalAlign: -1 }} /> Avtomatik yoxlama</div><h2 id="ai-check-title">AI büdcə yoxlaması</h2></div></div>
        <Insights items={budgetInsights(p)} />
        <p className="sm-muted" style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.5 }}>Nəticələr daxil edilmiş qəbzlərə və smeta sətirlərinə əsaslanır. İlkin qiymətləndirmədir — qərar verməzdən əvvəl yoxlayın.</p>
      </section>
    </div>

    <section className="surface sm-panel" aria-labelledby="breakdown-title" style={{ marginBottom: 16 }}>
      <div className="section-head"><div><div className="eyebrow">Smeta strukturu</div><h2 id="breakdown-title">Kateqoriyalar üzrə bölgü</h2></div></div>
      <Breakdown project={p} />
    </section>

    <section className="surface sm-panel" aria-labelledby="scenario-title">
      <div className="section-head"><div><div className="eyebrow">Alternativ variantlar</div><h2 id="scenario-title">Ekonom, Standart və Premium müqayisəsi</h2></div></div>
      <Scenarios project={p} />
    </section>
  </>;
}

export function PlanVsActual({ project: p }: { project: Project }) {
  const b = budgetSummary(p);
  const max = Math.max(b.agreedBudget, b.forecastFinalCost, b.plannedBudget) * 1.04 || 1;
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const marker = w(b.agreedBudget);
  const gap = round2(b.agreedBudget - b.forecastFinalCost);
  const rows = [
    { key: 'k-plan', label: 'Plan büdcəsi', value: b.plannedBudget },
    { key: 'k-actual', label: 'Faktiki xərc', value: b.actualSpending },
    { key: 'k-forecast', label: 'Proqnoz yekun', value: b.forecastFinalCost },
    { key: 'k-remaining', label: 'Qalıq büdcə', value: Math.max(0, b.remainingBudget) },
  ];
  return <>
    <div className="sm-pva" role="list">
      {rows.map(r => <div className="sm-pva-row" role="listitem" key={r.key}>
        <span className="sm-pva-label"><i className={`sm-pva-key ${r.key}`} aria-hidden />{r.label}</span>
        <div className="sm-pva-track" aria-hidden><span className={r.key} style={{ width: w(r.value) }} /><i className="sm-pva-marker" style={{ left: marker }} /></div>
        <span className="sm-pva-value num">{azn(r.value)}</span>
      </div>)}
    </div>
    <div className="sm-pva-note"><Info size={14} aria-hidden /><span>
      Şaquli xətt razılaşdırılmış büdcədir: <b>{azn(b.agreedBudget)}</b> (plan + təsdiqlənmiş dəyişikliklər).
      Proqnoz = faktiki xərc + qalan işlərin razılaşdırılmış dəyəri ({100 - b.completion}%). {gap >= 0 ? `Proqnoz büdcədən ${azn(gap)} aşağıdır.` : `Proqnoz büdcəni ${azn(-gap)} keçir.`}
    </span></div>
  </>;
}

const INSIGHT_ICON = { ok: CheckCircle2, warn: TriangleAlert, risk: ShieldAlert, info: Lightbulb } as const;
export function Insights({ items }: { items: Insight[] }) {
  return <div className="sm-insights">{items.map((it, i) => {
    const Icon = INSIGHT_ICON[it.tone];
    return <div className={`sm-insight ${it.tone}`} key={i}><span className="sm-insight-icon"><Icon size={15} aria-hidden /></span><div><strong>{it.text}</strong>{it.note && <small>{it.note}</small>}</div></div>;
  })}</div>;
}

const GROUPS = ['Santexnika', 'Elektrik', 'Döşəmə', 'Kafel', 'Digər'] as const;
function Breakdown({ project: p }: { project: Project }) {
  const t = projectTotals(p);
  const byGroup = new Map<string, number>(GROUPS.map(g => [g, 0]));
  for (const s of p.estimate.sections) byGroup.set(BREAKDOWN_GROUP[s.category], round2((byGroup.get(BREAKDOWN_GROUP[s.category]) ?? 0) + sectionTotals(s, p.defaultMarginPercentage).rowsTotal));
  byGroup.set('Digər', round2((byGroup.get('Digər') ?? 0) + t.projectCosts));
  const max = Math.max(...byGroup.values(), 1);
  const share = (v: number) => (t.total > 0 ? v / t.total : 0);
  const pending = changeTotals(p.changeOrders).pending;
  return <>
    <div className="sm-break-split">
      <div><small>Materiallar (ehtiyat daxil)</small><b className="num">{azn(t.material + t.waste)}</b><i>Smetanın {pct(share(t.material + t.waste))}-i</i></div>
      <div><small>İşçilik</small><b className="num">{azn(t.labor)}</b><i>Smetanın {pct(share(t.labor))}-i · marja {azn(t.margin)}</i></div>
    </div>
    <div className="sm-breakdown" role="list">
      {GROUPS.map(g => { const v = byGroup.get(g) ?? 0; return <div className="sm-break-row" role="listitem" key={g}>
        <span>{g}</span>
        <div className="sm-break-track" aria-hidden><span style={{ width: `${(v / max) * 100}%` }} /></div>
        <b>{azn(v)}</b><small>{pct(share(v))}</small>
      </div>; })}
    </div>
    {pending > 0 && <p className="sm-muted" style={{ margin: '12px 0 0', fontSize: 12 }}>Təsdiq gözləyən dəyişikliklər ({azn(pending)}) bu bölgüyə daxil deyil.</p>}
  </>;
}
