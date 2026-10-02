import { useRef } from 'react';
import { Camera, Download, ExternalLink, FileText, ImagePlus, X } from 'lucide-react';
import { useRequestUploadUrl } from '@workspace/api-client-react';
import type { MediaInput, MediaItem } from '@workspace/api-client-react';
import { emitFeedback } from '@/lib/feedback';
import type { T } from './kit';

export const MAX_BYTES = 50 * 1024 * 1024;
export const mediaUrl = (projectId: string, mediaId: string) => `/api/projects/${projectId}/media/${mediaId}`;

export function MediaList({ media, projectId, t }: { media?: MediaItem[]; projectId: string; t: T }) {
  if (!media?.length) return null;
  return <div className="evidence-thumbs">{media.map(m => {
    const url = mediaUrl(projectId, m.id); const isImage = m.contentType.startsWith('image/'); const isVideo = m.contentType.startsWith('video/');
    return <div className="evidence-file evidence-item" key={m.id} data-testid={`media-${m.id}`}>
      {isImage ? <a href={url} target="_blank" rel="noreferrer" className="evidence-thumb"><img src={url} alt={m.originalName} loading="lazy" /></a> : isVideo ? <video src={url} className="evidence-video" controls preload="metadata" /> : <FileText size={16} />}
      <span className="evidence-name">{m.originalName}</span>
      <a href={url} target="_blank" rel="noreferrer" aria-label={t('view')} title={t('view')}><ExternalLink size={14} /></a>
      <a href={url} download={m.originalName} aria-label={t('download')} title={t('download')}><Download size={14} /></a>
    </div>;
  })}</div>;
}

export function useEvidenceUpload() {
  const req = useRequestUploadUrl();
  const mutateAsync = req.mutateAsync;
  return async (files: File[]): Promise<MediaInput[]> => {
    const out: MediaInput[] = [];
    for (const file of files) {
      const contentType = file.type || 'application/octet-stream';
      const meta = await mutateAsync({ data: { name: file.name, size: file.size, contentType } });
      let ok = false;
      try { const put = await fetch(meta.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file }); ok = put.ok; } catch { ok = false; }
      if (!ok) { emitFeedback({ key: 'errUpload' }); throw new Error('upload-failed'); }
      out.push({ objectPath: meta.objectPath, originalName: file.name, contentType, size: file.size });
    }
    return out;
  };
}

export function FilePicker({ files, onChange, t, label, tip, camera = false, testId }: { files: File[]; onChange: (f: File[]) => void; t: T; label?: string; tip?: string; camera?: boolean; testId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    const picked = Array.from(list || []);
    if (picked.some(f => f.size > MAX_BYTES)) emitFeedback({ key: 'errTooLarge' });
    onChange([...files, ...picked.filter(f => f.size <= MAX_BYTES)]);
    if (ref.current) ref.current.value = '';
  };
  return <div className="file-picker">
    <label className="upload-drop"><input ref={ref} data-testid={`input-${testId}`} type="file" accept="image/*,video/*,application/pdf" multiple onChange={e => add(e.target.files)} /><span className="upload-icon"><ImagePlus size={19} /></span><strong>{files.length ? `${files.length} ${t('evidenceReady')}` : label || t('attachEvidence')}</strong><small>{tip || t('evidenceTip')}</small></label>
    {camera && <label className="button button-secondary camera-button"><input data-testid={`input-${testId}-camera`} type="file" accept="image/*" capture="environment" onChange={e => add(e.target.files)} hidden /><Camera size={15} />{t('attachEvidence').split(' ')[0]}</label>}
    {files.length > 0 && <ul className="picked-files">{files.map((f, i) => <li key={`${f.name}-${i}`}><span>{f.name}</span><button type="button" className="icon-button" aria-label={t('dismiss')} onClick={() => onChange(files.filter((_, j) => j !== i))}><X size={14} /></button></li>)}</ul>}
  </div>;
}
