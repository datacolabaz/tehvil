import type { T } from '@/components/kit';
export type FeedbackMsg = { key?: string; status?: number; detail?: string };
export function apiErrorText(detail: string | undefined, t: T): string | null {
  if (!detail) return null;
  if (/archiv|read.only/i.test(detail)) return t('apiArchived');
  if (/editable draft already/i.test(detail)) return t('apiDraft');
  if (/invit.*(?:invalid|expired|used)|(?:invalid|expired).*invit/i.test(detail)) return t('apiInvalidInvite');
  if (/file|upload|media|object|content.type|mime/i.test(detail)) return t('apiFile');
  if (/not found/i.test(detail)) return t('apiNotFound');
  if (/required|invalid .*input|validation/i.test(detail)) return t('apiRequired');
  if (/contractor already/i.test(detail)) return t('contractorTaken');
  if (/unresolved revision/i.test(detail)) return t('unresolvedBlock');
  return null;
}
const listeners = new Set<(m: FeedbackMsg) => void>();
export const onFeedback = (fn: (m: FeedbackMsg) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const emitFeedback = (m: FeedbackMsg) => listeners.forEach(fn => fn(m));
export function errorToMsg(e: unknown): FeedbackMsg {
  const x = e as { status?: number; data?: { error?: unknown; message?: unknown } | null };
  const d = x?.data;
  const detail = typeof d?.error === 'string' ? d.error : typeof d?.message === 'string' ? d.message : undefined;
  return { status: x?.status, detail };
}
