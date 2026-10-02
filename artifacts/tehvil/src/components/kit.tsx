import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { TKey } from '@/lib/i18n';

export type T = (k: TKey) => any;

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false, className = '', testId }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean; className?: string; testId?: string }) {
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`button button-${variant} ${className}`}>{children}</button>;
}
export function Field({ label, name, type = 'text', required = false, value, onChange, placeholder, min, max, step, children }: { label: string; name: string; type?: string; required?: boolean; value?: string | number; onChange?: (v: string) => void; placeholder?: string; min?: string; max?: string; step?: string; children?: ReactNode }) {
  return <label className="field"><span>{label}{required && <i> *</i>}</span>{children || <input data-testid={`input-${name}`} name={name} type={type} required={required} value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} min={min} max={max} step={step} />}</label>;
}
export function Loading({ t }: { t: T }) { return <div className="loading-card"><div className="skeleton wide" /><div className="skeleton" /><div className="skeleton short" /><span>{t('loading')}…</span></div>; }
export function ErrorNotice({ t, retry }: { t: T; retry: () => void }) { return <div className="notice error-notice" role="alert"><p>{t('error')}</p><Button variant="secondary" onClick={retry}>{t('retry')}</Button></div>; }
export function EmptyLine({ t }: { t: T }) { return <div className="empty-line">{t('empty')}</div>; }
export function Notice({ children }: { children: ReactNode }) { return <div className="notice manual-notice">{children}</div>; }

export function QuerySection({ q, t, children }: { q: Pick<UseQueryResult<unknown>, 'isLoading' | 'isError' | 'refetch'>; t: T; children: ReactNode }) {
  if (q.isLoading) return <Loading t={t} />;
  if (q.isError) return <ErrorNotice t={t} retry={() => { void q.refetch(); }} />;
  return <>{children}</>;
}

export function Status({ value, t }: { value: string; t: T }) {
  const m: Record<string, TKey> = { approved: 'approved', accepted: 'accepted', completed: 'accepted', confirmed_received: 'received', planned: 'planned', in_progress: 'inProgress', submitted: 'pendingApproval', pending_approval: 'pendingApproval', submitted_for_handover: 'pendingApproval', revision_requested: 'revise', needs_clarification: 'pendingApproval', due: 'due', marked_sent: 'sent', rejected: 'rejected', resolved: 'resolved', active: 'inProgress', draft: 'scopeDraft', open: 'pendingApproval', contractor_replied: 'sent', disputed: 'revise', excluded: 'excluded' };
  return <span className={`status-pill status-${value}`}>{t(m[value] || 'planned')}</span>;
}
export function money(value?: number | null) { return new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 0 }).format(value || 0); }
export function date(value?: string | null, lang = 'az') { if (!value) return '—'; try { return new Intl.DateTimeFormat(lang === 'az' ? 'az-AZ' : lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); } catch { return value; } }
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1 className="font-display">{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}
export function priorityLabel(p: string, t: T) { return t(p === 'low' ? 'prLow' : p === 'high' ? 'prHigh' : 'prNormal'); }
export function roleLabel(r: string, t: T) { return t(r === 'owner' ? 'roleOwner' : r === 'contractor' ? 'roleContractor' : 'roleViewer'); }
export function actionLabel(a: string, t: T) { return t(('act_' + a.replace(/\./g, '_')) as TKey) || t('actUnknown'); }
export function typeLabel(v: string, t: T) { const m: Record<string, TKey> = { full: 'projectFull', partial: 'projectPartial', kitchen: 'ptKitchen', bathroom: 'ptBathroom', electrical: 'ptElectrical', plumbing: 'ptPlumbing', flooring: 'ptFlooring', painting: 'ptPainting', other: 'ptOther' }; return t(m[v] || 'ptOther'); }
export function propLabel(v: string, t: T) { const m: Record<string, TKey> = { apartment: 'propertyApartment', house: 'propertyHouse', office: 'propertyOffice', commercial: 'propertyCommercial', other: 'propertyOther' }; return t(m[v] || 'propertyOther'); }
export function materialLabel(v: string, t: T) { return v === 'owner' ? t('roleOwner') : v === 'contractor' ? t('roleContractor') : v === 'shared' ? t('shared') : t('notApplicable'); }
export function actionItemText(it: { kind?: string; label: string; detail?: string }, t: T): { label: string; detail: string } {
  const k = String(it.kind || '');
  const key = k.includes('change') ? 'change' : k.includes('handover') || k.includes('milestone') ? 'handover' : k.includes('payment') ? 'payment' : k.includes('scope') ? 'scope' : '';
  if (!key) return { label: t('actions'), detail: t('workflowLead') };
  return { label: t(('ak_' + key) as TKey), detail: t(('ak_' + key + '_d') as TKey) };
}
