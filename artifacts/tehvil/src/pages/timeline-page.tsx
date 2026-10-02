import { Clock3 } from 'lucide-react';
import { auditDetail } from '@/lib/audit-detail';
import { EmptyLine, PageHeading, QuerySection, actionLabel, date, roleLabel, type T } from '@/components/kit';

export function ActivityItem({ event, lang, t }: { event: any; lang: string; t: T }) {
  return <div className="activity-item"><div className="activity-marker"><span /></div><div className="activity-copy"><strong>{actionLabel(event.action, t)}</strong><p>{auditDetail(event, t)}</p></div><div className="activity-meta"><span>{roleLabel(event.actorRole, t)}</span><time>{date(event.createdAt, lang)}</time></div></div>;
}
export function TimelinePage(p: any) {
  const { t, timeline, lang } = p as Record<string, any> & { t: T };
  return <><PageHeading eyebrow={t('eyAudit')} title={t('timeline')} description={t('history')} /><div className="timeline-page surface"><div className="timeline-intro"><div className="timeline-seal"><Clock3 size={22} /></div><div><div className="eyebrow">{t('eyRecord')}</div><p>{t('disclaimer')}</p></div></div>
    <QuerySection q={timeline} t={t}><div className="timeline-events">{(timeline.data || []).map((e: any) => <div className="timeline-event" key={e.id}><div className="timeline-time">{date(e.createdAt, lang)}</div><span className="timeline-dot" /><div className="timeline-description"><h3>{actionLabel(e.action, t)}</h3><p>{auditDetail(e, t)}</p></div><div className="timeline-actor">{roleLabel(e.actorRole, t)}</div></div>)}{!timeline.data?.length && <EmptyLine t={t} />}</div></QuerySection></div></>;
}
