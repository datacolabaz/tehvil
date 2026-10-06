import type {
  CompanyPaymentTerms, CompanyProfile, ContractorBusinessType, ContractorChallenge, ContractorMonthlyProjects,
} from '@workspace/api-client-react';
import { addDaysISO, todayISO, uid } from '@/lib/smeta/format';
import type { ContractorProfile, PaymentMilestone } from '@/lib/smeta/types';

export const BUSINESS_TYPES: { id: ContractorBusinessType; label: string }[] = [
  { id: 'renovation_company', label: 'Təmir şirkəti' },
  { id: 'foreman', label: 'Usta / briqada rəhbəri' },
  { id: 'design_studio', label: 'Dizayn studiyası' },
  { id: 'construction_company', label: 'Tikinti şirkəti' },
  { id: 'project_manager', label: 'Layihə rəhbəri' },
  { id: 'other', label: 'Digər' },
];

export const MONTHLY_PROJECTS: { id: ContractorMonthlyProjects; label: string }[] = [
  { id: '1-2', label: '1–2' },
  { id: '3-5', label: '3–5' },
  { id: '6-10', label: '6–10' },
  { id: '10+', label: '10-dan çox' },
];

export const CHALLENGES: { id: ContractorChallenge; label: string }[] = [
  { id: 'estimates', label: 'Smeta hazırlamaq' },
  { id: 'client_approval', label: 'Sifarişçi təsdiqi almaq' },
  { id: 'change_orders', label: 'Əlavə işləri idarə etmək' },
  { id: 'expenses', label: 'Xərcləri izləmək' },
  { id: 'photo_handover', label: 'Foto ilə təhvil vermək' },
];

export const CONTACT_TIMES = [
  { id: 'morning', label: 'Səhər (09:00–12:00)' },
  { id: 'afternoon', label: 'Günorta (12:00–17:00)' },
  { id: 'evening', label: 'Axşam (17:00–20:00)' },
  { id: 'any', label: 'Fərqi yoxdur' },
] as const;

export const CITIES = ['Bakı', 'Sumqayıt', 'Gəncə', 'Xırdalan', 'Mingəçevir', 'Şirvan', 'Lənkəran', 'Şəki', 'Quba', 'Naxçıvan'];

export const SERVICE_SUGGESTIONS = [
  'Əsaslı təmir', 'Kosmetik təmir', 'Mətbəx təmiri', 'Hamam və sanitar qovşaq', 'Elektrik işləri', 'Santexnika',
  'Döşəmə və laminat', 'Kafel işləri', 'Alçipan və tavan', 'Rəngləmə', 'Dizayn layihəsi', 'Ofis təmiri',
];

type MilestoneDraft = Pick<PaymentMilestone, 'title' | 'share' | 'condition'>;

/** Payment schedule presets the company profile can choose as default for new estimates. */
export const PAYMENT_PRESETS: Record<CompanyPaymentTerms, { label: string; milestones: MilestoneDraft[] }> = {
  '30-40-30': {
    label: '30% avans · 40% kobud işlər · 30% yekun',
    milestones: [
      { title: 'Avans', share: 0.3, condition: 'Smeta təsdiqləndikdə və işə başlamazdan əvvəl' },
      { title: 'Kobud işlər', share: 0.4, condition: 'Gizli işlər foto ilə təhvil verildikdə' },
      { title: 'Yekun təhvil', share: 0.3, condition: 'Yekun təhvil aktı təsdiqləndikdə' },
    ],
  },
  '50-50': {
    label: '50% avans · 50% yekun',
    milestones: [
      { title: 'Avans', share: 0.5, condition: 'Smeta təsdiqləndikdə və işə başlamazdan əvvəl' },
      { title: 'Yekun təhvil', share: 0.5, condition: 'Yekun təhvil aktı təsdiqləndikdə' },
    ],
  },
  '30-30-30-10': {
    label: '30% · 30% · 30% · 10% zəmanət',
    milestones: [
      { title: 'Avans', share: 0.3, condition: 'Smeta təsdiqləndikdə və işə başlamazdan əvvəl' },
      { title: 'Kobud işlər', share: 0.3, condition: 'Gizli işlər foto ilə təhvil verildikdə' },
      { title: 'Üz işləri', share: 0.3, condition: 'Üz işləri tamamlandıqda' },
      { title: 'Zəmanət saxlanması', share: 0.1, condition: 'Təhvildən 30 gün sonra irad olmadıqda' },
    ],
  },
  '100-end': {
    label: 'Tam ödəniş təhvildən sonra',
    milestones: [{ title: 'Yekun ödəniş', share: 1, condition: 'Yekun təhvil aktı təsdiqləndikdə' }],
  },
};

export const isPaymentTerms = (v: unknown): v is CompanyPaymentTerms => typeof v === 'string' && v in PAYMENT_PRESETS;

export interface EstimateDefaults {
  marginPercent: number;
  validityDays: number;
  wastePercentage: number | null;
  payments: PaymentMilestone[];
}

/** Defaults for `/smeta/new`; without a profile the previous built-in values apply. */
export function estimateDefaults(profile?: CompanyProfile): EstimateDefaults {
  const terms = profile && isPaymentTerms(profile.defaultPaymentTerms) ? profile.defaultPaymentTerms : '30-40-30';
  return {
    marginPercent: profile ? Math.round(profile.defaultMarginPercentage * 1000) / 10 : 15,
    validityDays: profile?.defaultValidityDays ?? 30,
    wastePercentage: profile?.defaultWastePercentage ?? null,
    payments: PAYMENT_PRESETS[terms].milestones.map(m => ({ ...m, id: uid('pm'), status: 'planned' as const })),
  };
}

export const validUntilFor = (days: number) => addDaysISO(todayISO(), days);

/**
 * Contractor block stored on new estimates. Ratings and project counts are not
 * collected, so they stay 0 and are not shown to clients.
 */
export function contractorFromProfile(profile: CompanyProfile | undefined, user: { fullName?: string | null; email?: string | null }): ContractorProfile {
  const person = (user.fullName?.trim() || profile?.companyName || user.email || 'Podratçı').slice(0, 120);
  return {
    name: person,
    company: (profile?.companyName ?? person).slice(0, 160),
    phone: profile?.phone ?? '',
    email: profile?.email || user.email || undefined,
    experienceYears: 0,
    completedProjects: 0,
    rating: 0,
  };
}
