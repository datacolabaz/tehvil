import { ShieldCheck } from 'lucide-react';
import { useGetSharedPassport } from '@workspace/api-client-react';
import type { ChangeOrder, Milestone, PaymentItem, ScopeItem } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { LanguagePicker } from '@/components/language-picker';
import { Status, date, money, propLabel, typeLabel, type T } from '@/components/kit';
import { PassportSection } from './passport-page';
import type { Lang } from '@/lib/i18n';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';

export function SharedPassportPage({ token, lang, change, t }: { token: string; lang: Lang; change: (v: Lang) => void; t: T }) {
  const q = useGetSharedPassport(token);
  const fin = !!q.data?.includeFinancial; const d = q.data?.passport;
   return <div className="share-page"><div className="share-bar"><Link href="/" className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></Link><div className="topbar-tools"><ThemeToggle lang={lang}/><LanguagePicker lang={lang} change={change} /></div></div>
    {q.isLoading && <div className="loading-card"><div className="skeleton wide" /><div className="skeleton" /><div className="skeleton short" /></div>}
    {q.isError && <div className="notice error-notice" role="alert"><p>{t('shareInvalid')}</p></div>}
    {d && <article className="passport-sheet"><div className="passport-sheet-head"><span className="eyebrow">{t('eyShare')}</span><span className="eyebrow">{t('shareExpires')}: {date(q.data!.expiresAt, lang)}</span></div>
      <div className="passport-project"><div className="eyebrow">{d.project.city} · {propLabel(d.project.propertyType, t)} · {typeLabel(d.project.projectType, t)}</div><h2 className="font-display">{d.project.name}</h2><p>{t('shareReadOnly')}</p></div>
      <div className="passport-metrics">{fin && <div><span>{t('approvedBudget')}</span><b>{money(d.project.approvedBudget)} AZN</b></div>}<div><span>{t('progress')}</span><b>{d.project.progress}%</b></div><div><span>{t('rooms')}</span><b>{d.rooms.length}</b></div></div>
      <PassportSection title={t('scope')}>{d.scopeItems.map((s: ScopeItem) => <div className="passport-line" key={s.id}><strong>{s.title}</strong><span>{s.roomName || t('unassigned')} · {t(s.inclusionType)}</span>{fin && <span>{money((s.laborAmount || 0) + (s.materialEstimate || 0))} AZN</span>}</div>)}</PassportSection>
      <PassportSection title={t('changes')}>{d.changeOrders.map((c: ChangeOrder) => <div className="passport-line" key={c.id}><strong>{c.title}</strong><span>{date(c.createdAt, lang)} · <Status value={c.status} t={t} /></span>{fin && <span>{money(c.totalAmount)} AZN</span>}</div>)}</PassportSection>
      <PassportSection title={t('milestones')}>{d.milestones.map((m: Milestone) => <div className="passport-line" key={m.id}><strong>{m.title}</strong><span>{date(m.plannedCompletionDate, lang)}</span><Status value={m.status} t={t} /></div>)}</PassportSection>
      {fin && <PassportSection title={t('payments')}>{d.payments.map((pay: PaymentItem) => <div className="passport-line" key={pay.id}><strong>{pay.title}</strong><span>{date(pay.dueDate, lang)} · <Status value={pay.status} t={t} /></span><span>{money(pay.amount)} {pay.currency}</span></div>)}</PassportSection>}
      {!fin && <p className="empty-line">{t('financialHidden')}</p>}
      <div className="passport-disclaimer"><ShieldCheck size={17} />{t('shareMediaNote')} {t('printDisclaimer')}</div></article>}<SiteFooter lang={lang}/></div>;
}
