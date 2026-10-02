import { useState, type FormEvent } from 'react';
import { Check, ClipboardCheck, FileCheck2, MessageSquareText, Plus } from 'lucide-react';
import type { Milestone } from '@workspace/api-client-react';
import { Button, Field, PageHeading, QuerySection, Status, date, type T } from '@/components/kit';
import { FilePicker, MediaList, useEvidenceUpload } from '@/components/evidence';
import { AcceptHandover, MilestoneRevisions, RevisionForm, type RevisionDraft } from '@/components/revisions';

type Mode = { id: string; kind: 'reject' | 'extra' } | null;

export function MilestonesPage(p: any) {
  const { project, id, t, lang, milestones, createMilestone, submitHandover, decideMilestone, createRevision, refreshCore, notify, isOwner, isContractor, canWrite } = p as Record<string, any> & { t: T };
  const upload = useEvidenceUpload();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', plannedCompletionDate: '' });
  const [handover, setHandover] = useState<Record<string, { note: string; files: File[] }>>({});
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const list: Milestone[] = milestones.data || [];

  const create = (e: FormEvent) => { e.preventDefault(); createMilestone.mutate({ projectId: id, data: { ...form, description: form.description || null, plannedCompletionDate: form.plannedCompletionDate || null } }, { onSuccess: () => { setOpen(false); setForm({ title: '', description: '', plannedCompletionDate: '' }); refreshCore(); notify(t('created')); } }); };
  const sendHandover = async (m: Milestone) => {
    const h = handover[m.id] || { note: '', files: [] };
    setBusy(m.id);
    try {
      const media = await upload(h.files);
      submitHandover.mutate({ milestoneId: m.id, data: { note: h.note || null, media } }, { onSuccess: () => { setHandover(o => ({ ...o, [m.id]: { note: '', files: [] } })); refreshCore(); notify(t('sent')); }, onSettled: () => setBusy(null) });
    } catch { setBusy(null); }
  };
  const sendRevision = async (m: Milestone, d: RevisionDraft, kind: 'reject' | 'extra') => {
    if (kind === 'reject') {
      decideMilestone.mutate({ milestoneId: m.id, data: { decision: 'revise', note: d.issueDescription, revisionTitle: d.title, priority: d.priority } }, { onSuccess: () => { setMode(null); refreshCore(); notify(t('sent')); } });
      return;
    }
    setBusy(m.id);
    try {
      const media = await upload(d.files);
      createRevision.mutate({ milestoneId: m.id, data: { title: d.title, issueDescription: d.issueDescription, priority: d.priority, media } }, { onSuccess: () => { setMode(null); refreshCore(); notify(t('sent')); }, onSettled: () => setBusy(null) });
    } catch { setBusy(null); }
  };

  return <><PageHeading eyebrow={t('eyDelivery')} title={t('milestones')} description={t('stages')[2]} action={canWrite ? <Button onClick={() => setOpen(!open)} testId="button-add-milestone"><Plus size={16} />{t('addMilestone')}</Button> : undefined} />
    {!canWrite && <div className="notice manual-notice">{t('readOnly')}</div>}
    {open && <form className="surface form-card compact-form" onSubmit={create}><div className="field-grid"><Field label={t('milestoneTitle')} name="milestone-title" required value={form.title} onChange={v => setForm({ ...form, title: v })} /><Field label={t('plannedDate')} name="milestone-date" type="date" value={form.plannedCompletionDate} onChange={v => setForm({ ...form, plannedCompletionDate: v })} /></div><Field label={t('milestoneDescription')} name="milestone-desc"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field><div className="inline-actions"><Button variant="secondary" onClick={() => setOpen(false)}>{t('cancel')}</Button><Button type="submit" disabled={createMilestone.isPending}>{t('save')}</Button></div></form>}
    <QuerySection q={milestones} t={t}><div className="milestone-list">{list.map((m, i) => {
      const h = handover[m.id] || { note: '', files: [] };
      const canHand = isContractor && ['planned', 'in_progress', 'revision_requested'].includes(m.status);
      return <article className="milestone-card surface" key={m.id} data-testid={`card-milestone-${m.id}`}>
        <div className="milestone-rail"><span className={`milestone-step ${m.status === 'accepted' ? 'done' : ''}`}>{m.status === 'accepted' ? <Check size={14} /> : String(i + 1).padStart(2, '0')}</span><i /></div>
        <div className="milestone-content">
          <div className="milestone-heading"><div><div className="eyebrow">{t('plannedDate')} · {date(m.plannedCompletionDate, lang)}</div><h2>{m.title}</h2></div><Status value={m.status} t={t} /></div>
          <p>{m.description || '—'}</p>
          {m.note && <div className="handover-note"><MessageSquareText size={14} />{m.note}</div>}
          <MediaList media={m.media} projectId={id} t={t} />
          {canHand && <div className="handover-box"><label className="field"><span>{t('handoverNote')}</span><textarea value={h.note} onChange={e => setHandover({ ...handover, [m.id]: { ...h, note: e.target.value } })} /></label><FilePicker files={h.files} onChange={files => setHandover({ ...handover, [m.id]: { ...h, files } })} t={t} camera testId={`evidence-${m.id}`} /><Button onClick={() => { void sendHandover(m); }} disabled={submitHandover.isPending || busy === m.id} testId={`button-handover-${m.id}`}><FileCheck2 size={15} />{busy === m.id ? t('loading') : t('submitHandover')}</Button></div>}
          {isOwner && m.status === 'submitted_for_handover' && <div className="handover-decision"><AcceptHandover milestoneId={m.id} t={t} pending={decideMilestone.isPending} onAccept={() => decideMilestone.mutate({ milestoneId: m.id, data: { decision: 'accept', note: null } }, { onSuccess: () => { refreshCore(); notify(t('accepted')); } })} /><Button variant="secondary" onClick={() => setMode(mode?.id === m.id ? null : { id: m.id, kind: 'reject' })}><MessageSquareText size={15} />{t('requestRevision')}</Button></div>}
          {isOwner && m.status === 'revision_requested' && <div className="handover-decision"><Button variant="secondary" onClick={() => setMode(mode?.id === m.id ? null : { id: m.id, kind: 'extra' })}><Plus size={15} />{t('extraRevision')}</Button></div>}
          {mode?.id === m.id && <RevisionForm t={t} pending={decideMilestone.isPending || createRevision.isPending || busy === m.id} withMedia={mode.kind === 'extra'} onCancel={() => setMode(null)} onSubmit={d => { void sendRevision(m, d, mode.kind); }} />}
          <MilestoneRevisions milestone={m} projectId={id} isOwner={isOwner} isContractor={isContractor} t={t} lang={lang} onChanged={refreshCore} notify={notify} />
        </div></article>;
    })}{!list.length && <div className="empty-projects compact-empty"><div className="empty-illustration"><ClipboardCheck size={32} /></div><h2 className="font-display">{t('empty')}</h2>{canWrite && <Button onClick={() => setOpen(true)}><Plus size={16} />{t('addMilestone')}</Button>}</div>}</div></QuerySection>
    <span hidden>{project.id}</span></>;
}
