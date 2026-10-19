import { useEffect, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { BadgeCheck, Camera, Check, Copy, HardHat, ImagePlus, KeyRound, LoaderCircle, ShieldCheck, Star, X } from 'lucide-react';
import type { RealtorMedia } from '@workspace/api-client-react';
import { usePhotoUpload } from '@/lib/realtor/upload';
import { TRUST, type Trust } from '@/lib/realtor/labels';

export { Drawer, Modal, Pill, SmetaToaster as RealtorToaster, toast } from '@/components/smeta/ui';

const TRUST_ICON: Record<Trust, typeof ShieldCheck> = { basic: KeyRound, contractor: HardHat, handover: BadgeCheck };

/** Three-step trust meter. Level 3 ("Təhvil təsdiqli") is the strongest visual element. */
export function TrustBadge({ level, size = 'md' }: { level: Trust; size?: 'sm' | 'md' | 'lg' }) {
  const t = TRUST[level];
  const Icon = TRUST_ICON[level];
  return <span className={`rl-trust rl-trust-${level} rl-trust-${size}`} title={t.text}>
    <Icon size={size === 'lg' ? 18 : 14} aria-hidden />
    <span>{t.short}</span>
    <span className="rl-trust-steps" aria-label={`Etibar səviyyəsi ${t.level}/3`}>{[1, 2, 3].map(i => <i key={i} className={i <= t.level ? 'on' : ''} />)}</span>
  </span>;
}

export function TrustLadder({ level, compact = false }: { level: Trust; compact?: boolean }) {
  const current = TRUST[level].level;
  return <ol className={`rl-ladder ${compact ? 'compact' : ''}`}>
    {(['basic', 'contractor', 'handover'] as Trust[]).map(k => {
      const t = TRUST[k]; const Icon = TRUST_ICON[k];
      const state = t.level < current ? 'done' : t.level === current ? 'current' : 'next';
      return <li key={k} className={`rl-ladder-step ${state} ${k}`}>
        <span className="rl-ladder-icon">{state === 'done' ? <Check size={15} /> : <Icon size={15} />}</span>
        <div><strong>{t.level}. {t.title}</strong>{!compact && <small>{t.text}</small>}</div>
      </li>;
    })}
  </ol>;
}

export function CertifiedSeal({ level, big = false }: { level: Trust; big?: boolean }) {
  return <div className={`rl-seal rl-seal-${level} ${big ? 'big' : ''}`}>
    <span className="rl-seal-mark"><ShieldCheck size={big ? 22 : 16} aria-hidden /></span>
    <div><strong>Təhvil pasportlu mənzil</strong><small>{TRUST[level].title}</small></div>
  </div>;
}

export function PassportFlag({ has, level }: { has: boolean; level?: Trust | null }) {
  return has
    ? <span className={`rl-flag yes ${level ?? ''}`}><ShieldCheck size={12} aria-hidden />Təhvil Pasportu var{level === 'handover' ? <Star size={11} aria-hidden /> : null}</span>
    : <span className="rl-flag no">Pasport yoxdur</span>;
}

export function QrCode({ value, size = 168, label }: { value: string; size?: number; label?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#173c33', light: '#ffffff' } })
      .then(svg => { if (alive) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); })
      .catch(() => setSrc(''));
    return () => { alive = false; };
  }, [value]);
  return <figure className="rl-qr" style={{ width: size }}>
    {src ? <img src={src} width={size} height={size} alt={label || 'QR kod'} /> : <div className="rl-qr-ph" style={{ width: size, height: size }} />}
    {label && <figcaption>{label}</figcaption>}
  </figure>;
}

export async function qrDataUrl(value: string, size = 600) {
  return QRCode.toDataURL(value, { margin: 1, width: size, errorCorrectionLevel: 'M', color: { dark: '#173c33', light: '#ffffff' } });
}

export function CopyButton({ text, label = 'Kopyala', className = 'button button-secondary sm-btn-sm' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className={className} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1800); }); }}>
    {done ? <Check size={14} /> : <Copy size={14} />}{done ? 'Kopyalandı' : label}
  </button>;
}

export function StatTile({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone?: 'dark' | 'gold' | 'alert' }) {
  return <div className={`sm-stat rl-stat ${tone ?? ''}`}>
    <span className="sm-stat-icon">{icon}</span>
    <span className="eyebrow">{label}</span>
    <strong className="num">{value}</strong>
    {hint && <span>{hint}</span>}
  </div>;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="sm-empty rl-empty"><div className="empty-illustration">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div aria-busy="true" aria-label="Yüklənir" className="rl-skel">{Array.from({ length: rows }, (_, i) => <div key={i} className="sm-skel-card" />)}</div>;
}

/** Photo grid with upload, remove and "make cover". The first photo is the cover. */
export function PhotoPicker({ media, onChange, max = 12, label = 'Şəkil əlavə et', hint, testId = 'photos' }: { media: RealtorMedia[]; onChange: (m: RealtorMedia[]) => void; max?: number; label?: string; hint?: string; testId?: string }) {
  const { upload, busy, error } = usePhotoUpload();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, Math.max(0, max - media.length));
    const added = await upload(files);
    if (added.length) onChange([...media, ...added]);
    if (input.current) input.current.value = '';
    if (camera.current) camera.current.value = '';
  };
  return <div className="rl-photos">
    <div className="rl-photo-grid">
      {media.map((m, i) => <div className="rl-photo" key={m.id}>
        <img src={m.url} alt={m.originalName} loading="lazy" />
        {i === 0 && max > 1 && <span className="rl-photo-cover">Əsas</span>}
        <div className="rl-photo-actions">
          {i > 0 && <button type="button" title="Əsas şəkil et" aria-label="Əsas şəkil et" onClick={() => onChange([m, ...media.filter(x => x.id !== m.id)])}><Star size={13} /></button>}
          <button type="button" title="Sil" aria-label="Şəkli sil" onClick={() => onChange(media.filter(x => x.id !== m.id))}><X size={13} /></button>
        </div>
      </div>)}
      {media.length < max && <label className={`rl-photo-add ${busy ? 'busy' : ''}`}>
        <input ref={input} data-testid={`input-${testId}`} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={max > 1} onChange={e => { void add(e.target.files); }} disabled={busy} />
        {busy ? <LoaderCircle className="spin" size={20} /> : <ImagePlus size={20} />}
        <span>{busy ? 'Yüklənir…' : label}</span>
      </label>}
      {media.length < max && <label className="rl-photo-add camera" title="Kamera ilə çək">
        <input ref={camera} type="file" accept="image/*" capture="environment" onChange={e => { void add(e.target.files); }} disabled={busy} />
        <Camera size={18} /><span>Kamera</span>
      </label>}
    </div>
    {hint && <small className="rl-hint">{hint}</small>}
    {error && <small className="sm-field-error" role="alert">{error}</small>}
  </div>;
}
