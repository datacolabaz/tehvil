/**
 * Plans and what they unlock. The single place to change limits.
 *
 * There is no billing yet: the plan is stored on the server (`contractor_accounts.plan`)
 * and changed manually after a sales conversation. New accounts start on `baslangic`;
 * accounts that had data before plans existed were moved to `pesekar` (`source: legacy`).
 *
 * `ENFORCEMENT` decides what happens when a feature is outside the plan:
 * - `soft` (default): the action still works; an upgrade note is shown at most once
 *   per feature every `NUDGE_COOLDOWN_DAYS`.
 * - `hard`: the action is blocked and the upgrade note explains why.
 * Demo projects are never gated.
 */

export type PlanId = 'baslangic' | 'pesekar' | 'biznes';

export type Feature =
  | 'multipleProjects'
  | 'excelExport'
  | 'changeOrders'
  | 'expenseTracking'
  | 'photoEvidence'
  | 'companyBranding'
  | 'teamMembers'
  | 'roles'
  | 'advancedReports'
  | 'customBranding'
  | 'prioritySupport';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  summary: string;
  /** Lines shown on the pricing cards. */
  highlights: string[];
  features: ReadonlySet<Feature>;
  limits: { activeProjects: number | null };
}

export const ENFORCEMENT: 'soft' | 'hard' = 'soft';
export const NUDGE_COOLDOWN_DAYS = 7;
export const PRICE_LABEL = 'Qiymət üçün əlaqə saxlayın';

const PRO_FEATURES: Feature[] = ['multipleProjects', 'excelExport', 'changeOrders', 'expenseTracking', 'photoEvidence', 'companyBranding', 'teamMembers'];

export const PLANS: Record<PlanId, PlanDefinition> = {
  baslangic: {
    id: 'baslangic',
    name: 'Başlanğıc',
    summary: 'İlk layihəni sınamaq üçün',
    highlights: ['1 aktiv layihə', 'Əsas smeta', 'Sifarişçi üçün paylaşım linki', 'PDF çıxarışı'],
    features: new Set<Feature>(),
    limits: { activeProjects: 1 },
  },
  pesekar: {
    id: 'pesekar',
    name: 'Peşəkar',
    summary: 'Hər ay bir neçə layihə aparan podratçılar üçün',
    highlights: ['Bir neçə layihə', 'Excel export', 'Dəyişiklik sifarişləri', 'Xərclərin izlənməsi', 'Foto sübutlar', 'Şirkət brendi', 'Komanda üzvləri'],
    features: new Set<Feature>(PRO_FEATURES),
    limits: { activeProjects: null },
  },
  biznes: {
    id: 'biznes',
    name: 'Biznes',
    summary: 'Komandası və çoxlu obyekti olan şirkətlər üçün',
    highlights: ['Limitsiz layihə', 'Rollar və icazələr', 'Ətraflı hesabatlar', 'Fərdi brendinq', 'Prioritet dəstək'],
    features: new Set<Feature>([...PRO_FEATURES, 'roles', 'advancedReports', 'customBranding', 'prioritySupport']),
    limits: { activeProjects: null },
  },
};

export const PLAN_ORDER: PlanId[] = ['baslangic', 'pesekar', 'biznes'];

export const FEATURE_LABEL: Record<Feature, string> = {
  multipleProjects: 'Bir neçə aktiv layihə',
  excelExport: 'Excel export',
  changeOrders: 'Dəyişiklik sifarişləri',
  expenseTracking: 'Xərclərin izlənməsi',
  photoEvidence: 'Foto sübutlar',
  companyBranding: 'Şirkət brendi',
  teamMembers: 'Komanda üzvləri',
  roles: 'Rollar və icazələr',
  advancedReports: 'Ətraflı hesabatlar',
  customBranding: 'Fərdi brendinq',
  prioritySupport: 'Prioritet dəstək',
};

export const isPlanId = (v: unknown): v is PlanId => v === 'baslangic' || v === 'pesekar' || v === 'biznes';

export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.has(feature);
}

/** Cheapest plan that includes the feature. */
export function requiredPlan(feature: Feature): PlanId {
  return PLAN_ORDER.find(id => PLANS[id].features.has(feature)) ?? 'biznes';
}

export function withinProjectLimit(plan: PlanId, activeProjects: number): boolean {
  const limit = PLANS[plan].limits.activeProjects;
  return limit === null || activeProjects < limit;
}

const nudgeKey = (feature: Feature) => `tehvil-upgrade-nudge:${feature}`;

/** True when the upgrade note for this feature has not been shown within the cooldown. */
export function nudgeDue(feature: Feature): boolean {
  try {
    const last = Number(localStorage.getItem(nudgeKey(feature)) || 0);
    return Date.now() - last > NUDGE_COOLDOWN_DAYS * 86_400_000;
  } catch { return true; }
}
export function markNudgeShown(feature: Feature): void {
  try { localStorage.setItem(nudgeKey(feature), String(Date.now())); } catch { /* storage unavailable */ }
}
