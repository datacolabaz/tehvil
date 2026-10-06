import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { AlertTriangle, CheckCircle2, CircleDashed, Pencil, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { DisplayStatus, StatusTone } from '@/lib/smeta/store';
import { PRICE_SOURCE_LABEL } from '@/lib/smeta/export';
import { dateAz, num, parseNumber, qty } from '@/lib/smeta/format';
import type { BudgetHealth } from '@/lib/smeta/calc';
import type { LineStatus, PriceSource } from '@/lib/smeta/types';

export function Pill({ tone = 'neutral', small, icon, children, title }: { tone?: StatusTone | 'ai'; small?: boolean; icon?: ReactNode; children: ReactNode; title?: string }) {
  return <span className={`sm-pill tone-${tone} ${small ? 'small' : ''}`} title={title}>{icon}{children}</span>;
}

const TONE_ICON: Record<StatusTone, ReactNode> = {
  neutral: <CircleDashed size={13} aria-hidden />,
  info: <Sparkles size={13} aria-hidden />,
  ok: <CheckCircle2 size={13} aria-hidden />,
  warn: <AlertTriangle size={13} aria-hidden />,
  risk: <AlertTriangle size={13} aria-hidden />,
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return <Pill tone={status.tone} icon={TONE_ICON[status.tone]}>{status.label}</Pill>;
}

export function ConfidenceChip({ confidence }: { confidence: number }) {
  const high = confidence >= 0.8;
  return <Pill small tone={high ? 'ok' : 'warn'} icon={high ? <ShieldCheck size={12} aria-hidden /> : <AlertTriangle size={12} aria-hidden />} title={`AI etibarlılıq göstəricisi: ${Math.round(confidence * 100)}%`}>
    {high ? 'Yüksək etibarlılıq' : 'Yoxlanmalıdır'}
  </Pill>;
}

const LINE_STATUS: Record<LineStatus, { label: string; tone: StatusTone | 'ai'; icon: ReactNode }> = {
  approved: { label: 'Təsdiqlənib', tone: 'ok', icon: <CheckCircle2 size={12} aria-hidden /> },
  ai: { label: 'AI təklifi', tone: 'ai', icon: <Sparkles size={12} aria-hidden /> },
  draft: { label: 'Qaralama', tone: 'neutral', icon: <CircleDashed size={12} aria-hidden /> },
  changed: { label: 'Dəyişdirilib', tone: 'info', icon: <Pencil size={12} aria-hidden /> },
};
export function LineStatusPill({ status }: { status: LineStatus }) {
  const s = LINE_STATUS[status];
  return <Pill small tone={s.tone} icon={s.icon}>{s.label}</Pill>;
}

export function SourceTag({ source, withDate = false }: { source: PriceSource; withDate?: boolean }) {
  const title = `${PRICE_SOURCE_LABEL[source.kind]}${source.reference ? ` · ${source.reference}` : ''} · Son yenilənmə: ${dateAz(source.updatedAt)}`;
  return <span className={`sm-source ${source.kind}`} title={title}><i aria-hidden />{PRICE_SOURCE_LABEL[source.kind]}{withDate && <> · {dateAz(source.updatedAt)}</>}</span>;
}

export const HEALTH_TEXT: Record<BudgetHealth, string> = { healthy: 'Büdcə daxilində', watch: 'Diqqət tələb edir', risk: 'Büdcəni keçir' };
export function HealthLabel({ health }: { health: BudgetHealth }) {
  return <span className={`sm-health ${health}`}>{health === 'healthy' ? <CheckCircle2 size={14} aria-hidden /> : <AlertTriangle size={14} aria-hidden />}{HEALTH_TEXT[health]}</span>;
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
}

function useAutoFocus<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]),textarea,select,button:not(.icon-button)');
      (el ?? ref.current)?.focus();
    }, 30);
    return () => window.clearTimeout(t);
  }, [open]);
  return ref;
}

export function Modal({ open, onClose, eyebrow, title, children, footer, wide }: { open: boolean; onClose: () => void; eyebrow?: string; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
  const ref = useAutoFocus<HTMLDivElement>(open);
  const titleId = useId();
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div ref={ref} className={`modal-card sm-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={e => e.stopPropagation()}>
      <div className="modal-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h3 id={titleId}>{title}</h3></div><button type="button" className="icon-button" aria-label="Bağla" onClick={onClose}><X size={18} /></button></div>
      {children}
      {footer && <div className="sm-modal-foot">{footer}</div>}
    </div>
  </div>;
}

export function Drawer({ open, onClose, eyebrow, title, subtitle, children, footer }: { open: boolean; onClose: () => void; eyebrow?: string; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  useEscape(open, onClose);
  const ref = useAutoFocus<HTMLElement>(open);
  const titleId = useId();
  if (!open) return null;
  return <>
    <div className="sm-drawer-backdrop" onClick={onClose} aria-hidden />
    <aside ref={ref} className="sm-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="sm-drawer-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h3 id={titleId}>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="icon-button" aria-label="Bağla" onClick={onClose}><X size={18} /></button></div>
      <div className="sm-drawer-body">{children}</div>
      {footer && <div className="sm-drawer-foot">{footer}</div>}
    </aside>
  </>;
}

/* ---------------- Toasts (reuse the app's .toast-message look) ---------------- */

type ToastMsg = { id: number; text: string; action?: { label: string; run: () => void } };
const toastListeners = new Set<(m: ToastMsg) => void>();
let toastId = 0;
export function toast(text: string, action?: ToastMsg['action']) {
  const m = { id: ++toastId, text, action };
  toastListeners.forEach(l => l(m));
}
export function SmetaToaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => { const l = (m: ToastMsg) => setMsg(m); toastListeners.add(l); return () => { toastListeners.delete(l); }; }, []);
  useEffect(() => { if (!msg) return; const t = window.setTimeout(() => setMsg(null), msg.action ? 6000 : 3400); return () => window.clearTimeout(t); }, [msg]);
  if (!msg) return null;
  return <div className="toast-message" role="status" aria-live="polite"><CheckCircle2 size={17} aria-hidden />{msg.text}{msg.action && <button type="button" className="sm-toast-action" onClick={() => { msg.action!.run(); setMsg(null); }}>{msg.action.label}</button>}</div>;
}

/* ---------------- Numeric cell input ---------------- */

/** Text input that accepts "1 234,5" style numbers and commits every valid change. */
export function NumberInput({ value, onCommit, label, className = '', min = 0, max, fraction = 'auto' as const, id }: { value: number; onCommit: (v: number) => void; label: string; className?: string; min?: number; max?: number; fraction?: 0 | 2 | 'auto'; id?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (fraction === 'auto' ? qty(value) : num(value, fraction));
  const parsed = draft === null ? value : parseNumber(draft);
  const invalid = draft !== null && (parsed === null || parsed < min || (max !== undefined && parsed > max));
  return <input
    id={id}
    className={`sm-cell-input r num ${invalid ? 'invalid' : ''} ${className}`}
    inputMode="decimal"
    aria-label={label}
    aria-invalid={invalid || undefined}
    title={invalid ? `Düzgün rəqəm daxil edin${min === 0 ? ' (mənfi olmamalıdır)' : ''}` : undefined}
    value={shown}
    onFocus={e => { setDraft(String(value).replace('.', ',')); requestAnimationFrame(() => e.target.select()); }}
    onChange={e => {
      setDraft(e.target.value);
      const n = parseNumber(e.target.value);
      if (n !== null && n >= min && (max === undefined || n <= max)) onCommit(n);
    }}
    onBlur={() => setDraft(null)}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
  />;
}

/* ---------------- Dropdown menu ---------------- */

export function DropMenu({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
  return <Menu.Root modal={false}>
    <Menu.Trigger asChild>{trigger}</Menu.Trigger>
    <Menu.Portal><Menu.Content className="sm-menu" align={align} sideOffset={6}>{children}</Menu.Content></Menu.Portal>
  </Menu.Root>;
}
export function DropItem({ icon, children, onSelect, disabled }: { icon?: ReactNode; children: ReactNode; onSelect?: () => void; disabled?: boolean }) {
  return <Menu.Item className="sm-menu-item" onSelect={onSelect} disabled={disabled}>{icon}{children}</Menu.Item>;
}
export const DropSep = () => <Menu.Separator className="sm-menu-sep" />;
export const DropLabel = ({ children }: { children: ReactNode }) => <Menu.Label className="sm-menu-label">{children}</Menu.Label>;

export function SkeletonDashboard() {
  return <div aria-busy="true" aria-label="Məlumat yüklənir"><div className="sm-skel-grid">{[0, 1, 2, 3].map(i => <div className="sm-skel-card" key={i} />)}</div><div className="sm-project-grid">{[0, 1, 2, 3].map(i => <div className="sm-skel-card tall" key={i} />)}</div></div>;
}
