import { useState, type FormEvent } from 'react';
import { MessageSquareText, Check } from 'lucide-react';
import { useListRevisionRequests, useReplyToRevision, useResolveRevision } from '@workspace/api-client-react';
import type { Milestone, RevisionRequest } from '@workspace/api-client-react';
import { Button, Field, Status, QuerySection, priorityLabel, date, type T } from './kit';
import { FilePicker, MediaList, useEvidenceUpload } from './evidence';

export type RevisionDraft = { title: string; issueDescription: string; priority: 'low' | 'normal' | 'high'; files: File[] };
export const emptyRevision: RevisionDraft = { title: '', issueDescription: '', priority: 'normal', files: [] };

export function RevisionForm({ t, pending, withMedia, onSubmit, onCancel }: { t: T; pending: boolean; withMedia: boolean; onSubmit: (d: RevisionDraft) => void; onCancel: () => void }) {
  const [d, setD] = useState<RevisionDraft>(emptyRevision);
  const submit = (e: FormEvent) => { e.preventDefault(); if (d.title.trim().length < 2 || d.issueDescription.trim().length < 2) return; onSubmit(d); };
  return <form className="revision-form" onSubmit={submit}>
    <Field label={t('requestTitle')} name="revision-title" required value={d.title} onChange={v => setD({ ...d, title: v })} />
    <Field label={t('issue')} name="revision-issue" required><textarea required value={d.issueDescription} onChange={e => setD({ ...d, issueDescription: e.target.value })} /></Field>
    <Field label={t('priority')} name="revision-priority"><select value={d.priority} onChange={e => setD({ ...d, priority: e.target.value as RevisionDraft['priority'] })}>{(['low', 'normal', 'high'] as const).map(p => <option key={p} value={p}>{priorityLabel(p, t)}</option>)}</select></Field>
    {withMedia && <FilePicker files={d.files} onChange={files => setD({ ...d, files })} t={t} label={t('attachFiles')} tip={t('evidenceTip')} testId="revision-media" />}
    <div className="inline-actions"><Button variant="quiet" onClick={onCancel}>{t('cancel')}</Button><Button type="submit" disabled={pending}>{t('submit')}</Button></div>
  </form>;
}

export function AcceptHandover({ milestoneId, t, pending, onAccept }: { milestoneId: string; t: T; pending: boolean; onAccept: () => void }) {
  const q = useListRevisionRequests(milestoneId);
  const blocked = (q.data || []).some(r => r.status !== 'resolved');
  return <><Button onClick={onAccept} disabled={pending || blocked || q.isLoading} testId={`button-accept-${milestoneId}`}><Check size={15} />{t('accept')}</Button>{blocked && <small className="revision-date">{t('unresolvedBlock')}</small>}</>;
}

export function MilestoneRevisions({ milestone, projectId, isOwner, isContractor, t, lang, onChanged, notify }: { milestone: Milestone; projectId: string; isOwner: boolean; isContractor: boolean; t: T; lang: string; onChanged: () => void; notify: (m: string) => void }) {
  const q = useListRevisionRequests(milestone.id);
  const reply = useReplyToRevision(); const resolve = useResolveRevision(); const upload = useEvidenceUpload();
  const [replyId, setReplyId] = useState<string | null>(null); const [text, setText] = useState(''); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  const send = async (r: RevisionRequest) => {
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const media = await upload(files);
      reply.mutate({ revisionId: r.id, data: { response: text.trim(), media } }, { onSuccess: () => { setReplyId(null); setText(''); setFiles([]); onChanged(); notify(t('sent')); }, onSettled: () => setBusy(false) });
    } catch { setBusy(false); }
  };
  const list = q.data || [];
  return <QuerySection q={q} t={t}>{list.map(r => <div className="revision-card" key={r.id} data-testid={`revision-${r.id}`}>
    <div className="revision-head"><strong>{r.title}</strong><span className="revision-priority">{priorityLabel(r.priority, t)}</span><Status value={r.status} t={t} /></div>
    <p>{r.issueDescription}</p><small className="revision-date">{date(r.createdAt, lang)}</small>
    <MediaList media={r.media} projectId={projectId} t={t} />
    {r.response && <div className="revision-response"><b>{t('response')}:</b> {r.response}</div>}
    {isContractor && r.status !== 'resolved' && replyId !== r.id && <Button variant="secondary" onClick={() => setReplyId(r.id)}><MessageSquareText size={14} />{t('reply')}</Button>}
    {replyId === r.id && <div className="reply-row"><Field label={t('response')} name={`reply-${r.id}`} required><textarea value={text} onChange={e => setText(e.target.value)} /></Field><FilePicker files={files} onChange={setFiles} t={t} label={t('attachFiles')} testId={`reply-media-${r.id}`} /><div className="inline-actions"><Button variant="quiet" onClick={() => setReplyId(null)}>{t('cancel')}</Button><Button disabled={busy || reply.isPending} onClick={() => { void send(r); }}>{t('reply')}</Button></div></div>}
    {isOwner && r.status === 'contractor_replied' && <Button variant="secondary" disabled={resolve.isPending} onClick={() => resolve.mutate({ revisionId: r.id }, { onSuccess: () => { onChanged(); notify(t('resolved')); } })}><Check size={14} />{t('resolve')}</Button>}
  </div>)}</QuerySection>;
}
