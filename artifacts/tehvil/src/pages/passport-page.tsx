import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, Check, Copy, Link2, Printer, ShieldCheck, Trash2 } from 'lucide-react';
import { getListPassportSharesQueryKey, useCreatePassportShare, useListPassportShares, useListRevisionRequests, useRevokePassportShare } from '@workspace/api-client-react';
import type { ChangeOrder, Milestone, PaymentItem, ScopeItem } from '@workspace/api-client-react';
import { Button, PageHeading, QuerySection, Status, actionLabel, date, money, priorityLabel, propLabel, typeLabel, roleLabel, type T } from '@/components/kit';
import { mediaUrl } from '@/components/evidence';

export function PassportSection({ title, children }: { title: string; children?: ReactNode }) { return <section className="passport-section"><h3>{title}</h3>{children || <p className="empty-line">—</p>}</section>; }

function RevisionPrint({ m, projectId, t, lang }: { m: Milestone; projectId: string; t: T; lang: string }) {
  const q = useListRevisionRequests(m.id);
  const list = q.data || [];
  if (q.isLoading) return null;
  return <>{list.map(r => <div className="passport-line" key={r.id}><strong>{m.title}: {r.title}</strong><span>{priorityLabel(r.priority, t)} · {date(r.createdAt, lang)}{r.response ? ` · ${r.response}` : ''}</span><Status value={r.status} t={t} />{(r.media || []).map(x => <small key={x.id} className="print-media">{x.originalName} — {window.location.origin}{mediaUrl(projectId, x.id)}</small>)}</div>)}</>;
}

function SharePanel({ projectId, t, lang, notify }: { projectId: string; t: T; lang: string; notify: (m: string) => void }) {
  const create = useCreatePassportShare(); const revoke = useRevokePassportShare();
  const shares = useListPassportShares(projectId);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: getListPassportSharesQueryKey(projectId) });
  const [financial, setFinancial] = useState(false);
  const [share, setShare] = useState<{ id: string; url: string; expiresAt: string; includeFinancial: boolean } | null>(null);
  return <div className="share-panel surface no-print"><h3><Link2 size={15} /> {t('shareTitle')}</h3><p className="empty-line" style={{ textAlign: 'left', padding: 0 }}>{t('shareMediaNote')}</p>
    {!share && <><label className="check-row"><input type="checkbox" checked={financial} onChange={e => setFinancial(e.target.checked)} data-testid="checkbox-share-financial" />{t('shareFinancial')}</label><Button disabled={create.isPending} onClick={() => create.mutate({ projectId, data: { includeFinancial: financial } }, { onSuccess: s => { setShare(s); void refresh(); } })} testId="button-create-share"><Link2 size={15} />{t('shareCreate')}</Button></>}
    {share && <div className="share-created"><span><b>{t('shareLink')}:</b> {share.url}</span><Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(share.url); notify(t('copied')); }}><Copy size={14} />{t('copy')}</Button></div>}
    <QuerySection q={shares} t={t}>{(shares.data || []).filter(s => !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now()).map(s =>
      <div className="share-created" key={s.id}><span><b>{t('shareExpires')}:</b> {date(s.expiresAt, lang)}</span>{s.includeFinancial && <small>{t('shareFinancial')}</small>}<Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate({ projectId, shareId: s.id }, { onSuccess: () => { if (share?.id === s.id) setShare(null); void refresh(); } })} testId={share?.id === s.id ? 'button-revoke-share' : `button-revoke-share-${s.id}`}><Trash2 size={14} />{t('shareRevoke')}</Button></div>
    )}</QuerySection>
  </div>;
}

export function PassportPage(p: any) {
  const { t, passport, lang, id, project, isOwner, notify, archiveOpen } = p as Record<string, any> & { t: T };
  const data = passport.data;
  const evidence: { name: string; id: string; from: string }[] = [];
  if (data) { data.milestones.forEach((m: Milestone) => (m.media || []).forEach(x => evidence.push({ name: x.originalName, id: x.id, from: m.title }))); data.payments.forEach((pay: PaymentItem) => (pay.media || []).forEach(x => evidence.push({ name: x.originalName, id: x.id, from: pay.title }))); }
  return <><div className="passport-toolbar no-print"><div><PageHeading eyebrow={t('eyDoc')} title={t('passport')} description={t('passportLead')} /></div><div className="heading-buttons"><Button variant="secondary" onClick={() => window.print()}><Printer size={16} />{t('exportPrint')}</Button>{isOwner && !project.archived && <Button variant="danger" onClick={archiveOpen} testId="button-archive"><Archive size={16} />{t('archive')}</Button>}</div></div>
    <QuerySection q={passport} t={t}>{data && <article className="passport-sheet"><div className="passport-sheet-head"><span className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></span><span className="eyebrow">{t('eyRenov')} · {date(new Date().toISOString(), lang)}</span></div><div className="passport-project"><div className="eyebrow">{data.project.city} · {propLabel(data.project.propertyType, t)} · {typeLabel(data.project.projectType, t)}</div><h2 className="font-display">{data.project.name}</h2><p>{data.project.contractorName || '—'}</p></div>
      <div className="passport-metrics"><div><span>{t('approvedBudget')}</span><b>{money(data.project.approvedBudget)} AZN</b></div><div><span>{t('progress')}</span><b>{data.project.progress}%</b></div><div><span>{t('rooms')}</span><b>{data.rooms.length}</b></div></div>
      <PassportSection title={`${t('scope')}${(data.project as any).scopeVersion != null ? ` · v${(data.project as any).scopeVersion}` : ''}`}>{data.scopeItems.map((s: ScopeItem) => <div className="passport-line" key={s.id}><strong>{s.title}</strong><span>{s.roomName || t('unassigned')} · {t(s.inclusionType)}</span><span>{money((s.laborAmount || 0) + (s.materialEstimate || 0))} AZN</span></div>)}</PassportSection>
      <PassportSection title={t('changes')}>{data.changeOrders.map((c: ChangeOrder) => <div className="passport-line" key={c.id}><strong>{c.title}</strong><span>{date(c.createdAt, lang)} · <Status value={c.status} t={t} /></span><span>{money(c.totalAmount)} AZN</span></div>)}</PassportSection>
      <PassportSection title={t('milestones')}>{data.milestones.map((m: Milestone) => <div className="passport-line" key={m.id}><strong>{m.title}</strong><span>{date(m.plannedCompletionDate, lang)}</span><Status value={m.status} t={t} /></div>)}</PassportSection>
      <PassportSection title={t('revisionSummary')}>{data.milestones.length ? data.milestones.map((m: Milestone) => <RevisionPrint key={m.id} m={m} projectId={id} t={t} lang={lang} />) : <p className="empty-line">{t('noRevisions')}</p>}</PassportSection>
      <PassportSection title={t('payments')}>{data.payments.map((pay: PaymentItem) => <div className="passport-line" key={pay.id}><strong>{pay.title}</strong><span>{date(pay.dueDate, lang)} · <Status value={pay.status} t={t} /></span><span>{money(pay.amount)} {pay.currency}</span></div>)}</PassportSection>
      <PassportSection title={t('evidenceIndex')}>{evidence.length ? evidence.map(e => <div className="passport-line" key={e.id}><strong>{e.name}</strong><span>{e.from}</span><small className="print-media">{window.location.origin}{mediaUrl(id, e.id)}</small></div>) : undefined}</PassportSection>
      <PassportSection title={t('timeline')}>{data.timeline.slice(0, 12).map((ev: any) => <div className="passport-line" key={ev.id}><strong>{actionLabel(ev.action, t)}</strong><span>{date(ev.createdAt, lang)} · {roleLabel(ev.actorRole, t)}</span><span>{ev.detail}</span></div>)}</PassportSection>
      <div className="passport-disclaimer"><ShieldCheck size={17} />{t('printDisclaimer')} {t('disclaimer')}</div></article>}</QuerySection>
    {project.participantRole === 'owner' && <SharePanel projectId={id} t={t} lang={lang} notify={notify} />}
    <span hidden><Check size={1} /></span></>;
}
