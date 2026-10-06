/**
 * The signed-in contractor's account: onboarding answers, plan, activation
 * checklist and company profile (`GET /api/contractor/account`).
 *
 * Kept in a small external store rather than React Query so non-React code
 * (export actions, plan gates) can read the current plan synchronously.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getContractorAccount, type ContractorAccount } from '@workspace/api-client-react';
import { isPlanId, type PlanId } from '@/lib/entitlements';

export type { ContractorAccount };
type Status = 'idle' | 'loading' | 'ready' | 'error';
interface State { status: Status; data?: ContractorAccount }

let state: State = { status: 'idle' };
let loading: Promise<ContractorAccount | undefined> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function loadContractorAccount(): Promise<ContractorAccount | undefined> {
  if (loading) return loading;
  if (state.status !== 'ready') set({ ...state, status: 'loading' });
  loading = getContractorAccount()
    .then(data => { set({ status: 'ready', data }); return data; })
    .catch(() => { set({ status: state.data ? 'ready' : 'error', data: state.data }); return state.data; })
    .finally(() => { loading = null; });
  return loading;
}

/** Stores the account returned by any contractor write endpoint. */
export function setContractorAccount(data: ContractorAccount) {
  set({ status: 'ready', data });
}

export function refreshContractorAccount() {
  return loadContractorAccount();
}

export function resetContractorSession() {
  set({ status: 'idle' });
}

export function currentPlan(): PlanId | null {
  const id = state.data?.plan.id;
  return isPlanId(id) ? id : null;
}

export function useContractorAccount() {
  useEffect(() => { if (state.status === 'idle' || state.status === 'error') void loadContractorAccount(); }, []);
  const snapshot = useSyncExternalStore(subscribe, () => state);
  return { status: snapshot.status, account: snapshot.data, refresh: refreshContractorAccount };
}

if (typeof window !== 'undefined') {
  // Checklist items depend on actions in other tabs (e.g. the client approving on the public page).
  window.addEventListener('focus', () => { if (state.status === 'ready') void loadContractorAccount(); });
}
