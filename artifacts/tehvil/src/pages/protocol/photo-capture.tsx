import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react';
import { PhotoError, photoTakenAt, preparePhoto, timeAz, uploadPhoto, type Detail, type Media, type PhotoTarget } from '@/lib/protocol/model';

interface Item { id: string; file: File; url: string; state: 'uploading' | 'error'; error: string; camera: boolean }
let seq = 0;

/**
 * “Foto çək” opens the phone camera (browser file input in capture mode), “Qalereyadan seç” the gallery.
 * Every photo is previewed first; only accepted ones are uploaded. A photo is shown as saved only after
 * the server confirmed it; a failed one stays with “Yenidən cəhd et”.
 */
export function PhotoCapture({ protocolId, target, onSaved, compact = false, testId }: { protocolId: string; target: PhotoTarget; onSaved: (d: Detail) => void; compact?: boolean; testId?: string }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ files: { file: File; url: string }[]; fromCamera: boolean } | null>(null);
  const [queue, setQueue] = useState<Item[]>([]);
  useEffect(() => () => { queue.forEach((q) => URL.revokeObjectURL(q.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (list: FileList | null, fromCamera: boolean) => {
    const files = Array.from(list ?? []).slice(0, 10);
    if (files.length) setPreview({ files: files.map((file) => ({ file, url: URL.createObjectURL(file) })), fromCamera });
  };
  const send = async (item: Item) => {
    setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, state: 'uploading', error: '' } : x)));
    try {
      // Device time first (re-encoding drops it); a camera shot without it was taken just now.
      const exif = await photoTakenAt(item.file);
      const taken = exif ? { at: exif, source: 'exif' as const } : item.camera ? { at: new Date().toISOString(), source: 'camera' as const } : { at: null, source: null };
      const prepared = await preparePhoto(item.file);
      const d = await uploadPhoto(protocolId, prepared, target, taken);
      onSaved(d);
      setQueue((q) => q.filter((x) => x.id !== item.id));
      URL.revokeObjectURL(item.url);
    } catch (e) {
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, state: 'error', error: e instanceof PhotoError ? e.message : 'Foto yüklənmədi. Yenidən cəhd edin.' } : x)));
    }
  };
  const accept = () => {
    if (!preview) return;
    const items = preview.files.map(({ file, url }) => ({ id: `q${++seq}`, file, url, state: 'uploading' as const, error: '', camera: preview.fromCamera }));
    setQueue((q) => [...q, ...items]);
    setPreview(null);
    items.forEach((i) => void send(i));
  };
  const drop = (i: number) => {
    if (!preview) return;
    URL.revokeObjectURL(preview.files[i].url);
    const files = preview.files.filter((_, k) => k !== i);
    setPreview(files.length ? { ...preview, files } : null);
  };

  return <div className={`pt-capture ${compact ? 'compact' : ''}`} data-testid={testId}>
    <div className="pt-capture-btns">
      <button type="button" className="button button-primary pt-big" onClick={() => cam.current?.click()} data-testid={testId ? `${testId}-camera` : undefined}><Camera size={18} />Foto çək</button>
      <button type="button" className="button button-secondary pt-big" onClick={() => gal.current?.click()} data-testid={testId ? `${testId}-gallery` : undefined}><ImagePlus size={18} />Qalereyadan seç</button>
    </div>
    <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files, true); e.target.value = ''; }} data-testid={testId ? `${testId}-camera-input` : undefined} />
    <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => { pick(e.target.files, false); e.target.value = ''; }} data-testid={testId ? `${testId}-gallery-input` : undefined} />
    {queue.length > 0 && <ul className="pt-queue" aria-live="polite">{queue.map((q) => <li key={q.id} className={q.state}>
      <img src={q.url} alt="" />
      {q.state === 'uploading' ? <span className="pt-q-status"><LoaderCircle size={15} className="spin" />Yüklənir…</span>
        : <span className="pt-q-status err" data-testid="photo-error">{q.error}<span className="pt-q-actions"><button type="button" className="button button-secondary sm-btn-sm" onClick={() => void send(q)} data-testid="photo-retry"><RotateCcw size={13} />Yenidən cəhd et</button><button type="button" className="icon-button" aria-label="Sil" onClick={() => setQueue((x) => x.filter((y) => y.id !== q.id))}><Trash2 size={13} /></button></span></span>}
    </li>)}</ul>}
    {preview && <div className="pt-preview" role="dialog" aria-modal="true" aria-label="Foto önbaxışı" data-testid="photo-preview">
      <div className="pt-preview-imgs">{preview.files.map((f, i) => <figure key={f.url}><img src={f.url} alt="Önbaxış" />{preview.files.length > 1 && <button type="button" className="icon-button" aria-label="Bu fotonu çıxar" onClick={() => drop(i)}><X size={14} /></button>}</figure>)}</div>
      <div className="pt-preview-bar">
        {preview.fromCamera ? <button type="button" className="button button-secondary pt-big" onClick={() => { preview.files.forEach((f) => URL.revokeObjectURL(f.url)); setPreview(null); cam.current?.click(); }} data-testid="photo-retake"><RotateCcw size={16} />Yenidən çək</button>
          : <button type="button" className="button button-secondary pt-big" onClick={() => { preview.files.forEach((f) => URL.revokeObjectURL(f.url)); setPreview(null); }}><X size={16} />Ləğv et</button>}
        <button type="button" className="button button-primary pt-big" onClick={accept} data-testid="photo-accept"><Check size={16} />{preview.files.length > 1 ? `Qəbul et (${preview.files.length})` : 'Qəbul et'}</button>
      </div>
    </div>}
  </div>;
}

export function PhotoGrid({ media, onDelete, testId, times = false }: { media: Media[]; onDelete?: (m: Media) => void; testId?: string; times?: boolean }) {
  if (!media.length) return null;
  return <ul className="pt-photos" data-testid={testId}>{media.map((m) => <li key={m.id}>
    <a href={m.url} target="_blank" rel="noopener noreferrer" title={`Yüklənib: ${timeAz(m.createdAt)} (server)${m.takenAt ? ` · çəkilib: ${timeAz(m.takenAt)} (cihazın məlumatı)` : ''}`}><img src={m.url} alt={m.caption || 'Foto'} loading="lazy" /></a>
    {times && <small className="pt-photo-time">{m.takenAt ? `📷 ${timeAz(m.takenAt).slice(0, 10)} · ` : ''}⬆ {timeAz(m.createdAt).slice(0, 16)}</small>}
    {onDelete && <button type="button" className="icon-button pt-photo-del" aria-label="Fotonu sil" onClick={() => onDelete(m)}><Trash2 size={13} /></button>}
  </li>)}</ul>;
}
