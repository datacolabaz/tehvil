import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { BadgeCheck, Building, Camera, CircleDashed, ClipboardCheck, HardHat, ImagePlus, LoaderCircle, Play, ShieldCheck, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { useSearchWorkers, type HomeMedia, type HomeMediaAttachInputPhase, type WorkerRef } from '@workspace/api-client-react';
import { Pill } from '@/components/smeta/ui';
import { useHomeUpload } from '@/lib/home/upload';
import { PHASE, WORKER_KIND, WORK_STATUS, WORK_TONE } from '@/lib/home/labels';

export { CopyButton, Empty, QrCode, Skeleton, StatTile, qrDataUrl } from '@/components/realtor/ui';
export { Drawer, Modal, Pill, SmetaToaster as HomeToaster, toast } from '@/components/smeta/ui';

const KIND_ICON = { individual: UserRound, team: UsersRound, company: Building } as const;

export function WorkerAvatar({ w, size = 38 }: { w: Pick<WorkerRef, 'displayName' | 'photoUrl' | 'kind'>; size?: number }) {
  const Icon = KIND_ICON[w.kind as keyof typeof KIND_ICON] ?? UserRound;
  return <span className={`hp-avatar kind-${w.kind}`} style={{ width: size, height: size }} aria-hidden>
    {w.photoUrl ? <img src={w.photoUrl} alt="" /> : w.kind === 'individual' ? <b>{w.displayName.trim().charAt(0).toUpperCase()}</b> : <Icon size={size * 0.46} />}
  </span>;
}

/** Badges appear only for checks that really happened. */
export function WorkerBadges({ w }: { w: Pick<WorkerRef, 'kind' | 'registered' | 'identityVerified' | 'status'> }) {
  return <span className="hp-badges">
    <span className={`hp-kind kind-${w.kind}`}>{WORKER_KIND[w.kind] ?? w.kind}</span>
    {w.registered ? <span className="hp-badge reg" title="Ustanın Təhvil-də öz hesabı var"><UserRound size={11} />Hesabı var</span>
      : <span className="hp-badge unreg" title="Ev sahibinin yazdığı ad; ustanın hələ Təhvil-də hesabı yoxdur"><CircleDashed size={11} />Hesabı yoxdur</span>}
    {w.identityVerified && <span className="hp-badge id" title="Təhvil administratoru şəxsiyyəti / biznesi ayrıca yoxlayıb"><BadgeCheck size={11} />Şəxsiyyət yoxlanılıb</span>}
  </span>;
}

export function WorkerLine({ w, sub, href, right }: { w: WorkerRef; sub?: ReactNode; href?: string | null; right?: ReactNode }) {
  const body = <><WorkerAvatar w={w} /><span className="hp-wline-text"><strong>{w.displayName}</strong><WorkerBadges w={w} />{sub && <small>{sub}</small>}</span></>;
  return <div className="hp-wline">{href ? <Link href={href} className="hp-wline-main">{body}</Link> : <span className="hp-wline-main">{body}</span>}{right}</div>;
}

export function WorkStatus({ status }: { status: string }) {
  return <Pill small tone={WORK_TONE[status] ?? 'neutral'}>{WORK_STATUS[status] ?? status}</Pill>;
}

/** Separate trust signals of a work: performer confirmation, owner confirmation, specialist inspection. */
export function WorkTrust({ accepted, confirmed, inspected }: { accepted: boolean; confirmed: boolean; inspected: boolean }) {
  return <span className="hp-trust">
    <span className={accepted ? 'on' : ''} title="Usta bu işdə iştirak etdiyini öz hesabından təsdiqləyib"><HardHat size={12} />Usta təsdiqləyib</span>
    <span className={confirmed ? 'on' : ''} title="Ev sahibi işi qəbul edib"><ClipboardCheck size={12} />Ev sahibi təsdiqləyib</span>
    <span className={inspected ? 'on' : ''} title="Ev sahibinin əlavə etdiyi mütəxəssis yoxlayıb"><ShieldCheck size={12} />Mütəxəssis yoxlayıb</span>
  </span>;
}

export function MediaGrid({ media, onDelete, canDelete }: { media: HomeMedia[]; onDelete?: (m: HomeMedia) => void; canDelete?: (m: HomeMedia) => boolean }) {
  const [open, setOpen] = useState<HomeMedia | null>(null);
  if (!media.length) return null;
  return <>
    <div className="hp-media-grid">{media.map(m => <figure key={m.id} className="hp-media">
      <button type="button" onClick={() => setOpen(m)} aria-label={`${PHASE[m.phase] ?? ''} ${m.caption || m.originalName}`}>
        {m.contentType.startsWith('video/') ? <span className="hp-video"><Play size={22} /></span> : <img src={m.url} alt={m.caption || m.originalName} loading="lazy" />}
      </button>
      <figcaption><span className={`hp-phase ph-${m.phase}`}>{PHASE[m.phase] ?? m.phase}</span>{m.caption && <small>{m.caption}</small>}</figcaption>
      {onDelete && canDelete?.(m) && <button type="button" className="hp-media-del" aria-label="Faylı gizlət" title="Gizlət" onClick={() => onDelete(m)}><Trash2 size={13} /></button>}
    </figure>)}</div>
    {open && <div className="hp-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
      <button type="button" className="icon-button" aria-label="Bağla" onClick={() => setOpen(null)}><X size={20} /></button>
      {open.contentType.startsWith('video/') ? <video src={open.url} controls autoPlay onClick={e => e.stopPropagation()} /> : <img src={open.url} alt={open.caption || open.originalName} onClick={e => e.stopPropagation()} />}
      <p>{PHASE[open.phase]}{open.caption ? ` · ${open.caption}` : ''}</p>
    </div>}
  </>;
}

/** Upload photos / videos to a work, room, home or profile. */
export function MediaUpload({ target, onDone, phases = true, videos = true, label = 'Foto əlavə et' }: { target: { homeId?: string; workId?: string; roomId?: string; workerId?: string }; onDone: (m: HomeMedia[]) => void; phases?: boolean; videos?: boolean; label?: string }) {
  const { upload, busy, error } = useHomeUpload();
  const [phase, setPhase] = useState('after');
  const [caption, setCaption] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const add = async (list: FileList | null) => {
    const added = await upload(Array.from(list ?? []).slice(0, 20), { ...target, ...(phases ? { phase: phase as HomeMediaAttachInputPhase, caption } : {}) }, { videos });
    if (added.length) { onDone(added); setCaption(''); }
    if (input.current) input.current.value = '';
    if (camera.current) camera.current.value = '';
  };
  return <div className="hp-upload">
    {phases && <div className="hp-upload-opts">
      <div className="rl-seg" role="radiogroup" aria-label="Mərhələ">{['before', 'during', 'hidden', 'after'].map(p => <button key={p} type="button" role="radio" aria-checked={phase === p} className={phase === p ? 'on' : ''} onClick={() => setPhase(p)}>{PHASE[p]}</button>)}</div>
      <input className="hp-input" value={caption} onChange={e => setCaption(e.target.value)} maxLength={300} placeholder="Qısa izah (istəyə görə)" aria-label="Foto izahı" />
    </div>}
    <div className="hp-upload-btns">
      <label className={`button button-secondary ${busy ? 'busy' : ''}`}>
        <input ref={input} type="file" hidden data-testid="input-home-media" accept={videos ? 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif'} multiple onChange={e => { void add(e.target.files); }} disabled={busy} />
        {busy ? <LoaderCircle className="spin" size={15} /> : <ImagePlus size={15} />}{busy ? 'Yüklənir…' : label}
      </label>
      <label className="button button-quiet" title="Kamera ilə çək">
        <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={e => { void add(e.target.files); }} disabled={busy} /><Camera size={15} />Kamera
      </label>
    </div>
    {phases && phase === 'hidden' && <small className="rl-hint">Divarlar bağlanmazdan əvvəl naqil və boruların fotosunu əlavə edin. Gələcəkdə təmir zamanı onların yerini tapmaq daha asan olacaq.</small>}
    {error && <small className="sm-field-error" role="alert">{error}</small>}
  </div>;
}

/** Search registered performers (individuals, teams, companies). */
export function WorkerSearch({ onPick, exclude = [], kind }: { onPick: (w: WorkerRef) => void; exclude?: string[]; kind?: 'individual' }) {
  const [q, setQ] = useState('');
  const [specialty, setSpecialty] = useState('');
  const params = { ...(q.trim() ? { q: q.trim() } : {}), ...(specialty.trim() ? { specialty: specialty.trim().toLowerCase() } : {}) };
  const res = useSearchWorkers(params, { query: { enabled: q.trim().length >= 2 || specialty.trim().length >= 2, queryKey: ['/api/workers', params] } });
  const rows = (res.data ?? []).filter(c => !exclude.includes(c.worker.id) && (!kind || c.worker.kind === kind));
  return <div className="hp-search">
    <div className="field-grid">
      <label className="field"><span>Ad</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="məs. Elçin" data-testid="input-worker-search" /></label>
      <label className="field"><span>İxtisas</span><input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="məs. elektrik" /></label>
    </div>
    {res.isFetching && <small className="rl-hint">Axtarılır…</small>}
    {(q.trim().length >= 2 || specialty.trim().length >= 2) && !res.isFetching && !rows.length && <small className="rl-hint">Bu adla usta tapılmadı. Hesabı yoxdursa, “Hesabı olmayan usta” kimi əlavə edin və ya link göndərin.</small>}
    <div className="hp-search-list">{rows.map(c => <button type="button" key={c.worker.id} className="hp-search-item" onClick={() => onPick(c.worker)} data-testid={`pick-worker-${c.worker.id}`}>
      <WorkerAvatar w={c.worker} size={32} /><span><strong>{c.worker.displayName}</strong><small>{[WORKER_KIND[c.worker.kind], c.worker.specialties.join(', '), c.city, `${c.stats.confirmedWorks} təsdiqlənmiş iş`].filter(Boolean).join(' · ')}</small></span>
    </button>)}</div>
  </div>;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [string, string][]; onChange: (v: NoInfer<T>) => void; label: string }) {
  return <div className="field"><span>{label}</span><div className="rl-seg" role="radiogroup" aria-label={label}>{options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v as T)}>{l}</button>)}</div></div>;
}

export function Select({ label, value, onChange, options, name, empty }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; name: string; empty?: string }) {
  return <label className="field"><span>{label}</span><select name={name} data-testid={`select-${name}`} value={value} onChange={e => onChange(e.target.value)}>{empty !== undefined && <option value="">{empty}</option>}{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}

export const opts = (m: Record<string, string>) => Object.entries(m) as [string, string][];
