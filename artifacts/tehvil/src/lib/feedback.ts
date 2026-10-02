export type FeedbackMsg = { key?: string; status?: number; detail?: string };
const listeners = new Set<(m: FeedbackMsg) => void>();
export const onFeedback = (fn: (m: FeedbackMsg) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const emitFeedback = (m: FeedbackMsg) => listeners.forEach(fn => fn(m));
export function errorToMsg(e: unknown): FeedbackMsg {
  const x = e as { status?: number; data?: { error?: unknown; message?: unknown } | null };
  const d = x?.data;
  const detail = typeof d?.error === 'string' ? d.error : typeof d?.message === 'string' ? d.message : undefined;
  return { status: x?.status, detail };
}
