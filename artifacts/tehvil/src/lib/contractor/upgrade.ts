import { useEffect, useState } from 'react';
import { ENFORCEMENT, hasFeature, markNudgeShown, nudgeDue, requiredPlan, withinProjectLimit, type Feature, type PlanId } from '@/lib/entitlements';
import { currentPlan } from './account';

export type UpgradeRequest =
  | { kind: 'feature'; feature: Feature; plan: PlanId; blocked: boolean }
  | { kind: 'lead'; plan: PlanId; source: 'upgrade' | 'plan_page' | 'pricing'; feature?: Feature };

const listeners = new Set<(r: UpgradeRequest | null) => void>();
const emit = (r: UpgradeRequest | null) => listeners.forEach(l => l(r));

export function openUpgradeLead(plan: PlanId, source: 'upgrade' | 'plan_page' | 'pricing', feature?: Feature) {
  emit({ kind: 'lead', plan, source, feature });
}

/**
 * Call before a plan-gated action. Returns whether the action may continue.
 * Unknown plan (account not loaded) and demo projects always pass.
 */
export function gateFeature(feature: Feature, opts: { demo?: boolean } = {}): boolean {
  const plan = currentPlan();
  if (!plan || opts.demo || hasFeature(plan, feature)) return true;
  const blocked = ENFORCEMENT === 'hard';
  if (blocked || nudgeDue(feature)) {
    markNudgeShown(feature);
    emit({ kind: 'feature', feature, plan: requiredPlan(feature), blocked });
  }
  return !blocked;
}

/** Project limit check for a new saved (non-demo) project. */
export function gateNewProject(activeProjects: number): boolean {
  const plan = currentPlan();
  if (!plan || withinProjectLimit(plan, activeProjects)) return true;
  return gateFeature('multipleProjects');
}

export function useUpgradeRequests(): [UpgradeRequest | null, (next: UpgradeRequest | null) => void] {
  const [request, setRequest] = useState<UpgradeRequest | null>(null);
  useEffect(() => { listeners.add(setRequest); return () => { listeners.delete(setRequest); }; }, []);
  return [request, setRequest];
}

const VALUE_NUDGE_KEY = 'tehvil-value-nudge-shown';

/** The "first estimate is ready" note: only on Başlanğıc, only once, only after a real (non-demo) send. */
export function valueNudgeDue(): boolean {
  if (currentPlan() !== 'baslangic') return false;
  try { return !localStorage.getItem(VALUE_NUDGE_KEY); } catch { return false; }
}
export function markValueNudgeShown() {
  try { localStorage.setItem(VALUE_NUDGE_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}
