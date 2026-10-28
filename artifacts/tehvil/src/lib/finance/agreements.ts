import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/* Ustalarla razılaşmalar — mirrors artifacts/api-server/src/routes/agreements.ts */
export type Basis = 'contract' | 'monthly' | 'daily' | 'hourly';
export const BASIS: [Basis, string, string][] = [['hourly', 'Saatlıq', 'saat'], ['daily', 'Günlük', 'gün'], ['monthly', 'Aylıq', 'ay'], ['contract', 'Bütün iş üçün razılaşma', '']];
export const basisUnit = (b: Basis) => BASIS.find((x) => x[0] === b)?.[2] ?? '';
export interface PlanRow { id?: string; dueDate: string | null; label: string; amount: string | null; rest: boolean; status?: 'paid' | 'partial' | 'overdue' | 'upcoming'; covered?: string }
export interface AgreementPayment { id: string; expenseId: string; date: string; amount: string; note: string; method: string; status: 'recorded' | 'confirmed' | 'disputed' | string; counterpartyNote: string; confirmedAt: string | null }
export interface Agreement {
  id: string; title: string; workType: string; contractorName: string; contractorPhone: string; basis: Basis; basisLabel: string; unit: string;
  rate: string | null; units: string | null; total: string; startDate: string | null; endDate: string | null; status: 'active' | 'closed'; note?: string; workId?: string | null;
  plan: PlanRow[]; payments: AgreementPayment[];
  summary: { total: string; paid: string; remaining: string; planned: string; unplanned: string; overdue: string; next: { dueDate: string | null; label: string; due: string } | null; issues: string[]; confirmed: number; disputed: number };
  share?: { active: boolean; createdAt: string | null; openedAt: string | null };
}
export const agreementsKey = (projectId: string) => ['agreements', projectId];
export const useAgreements = (projectId: string) => useQuery({ queryKey: agreementsKey(projectId), queryFn: () => api<Agreement[]>(`/home-projects/${projectId}/agreements`) });

/** What people actually hire for on a private house build; the name stays editable. Category = expense category. */
export const WORK_TYPES: [string, string, string][] = [
  ['excavation', 'Qazıntı, torpaq işləri', 'labor'], ['foundation', 'Fundament, beton işləri', 'labor'], ['rebar', 'Armatur bağlama', 'labor'],
  ['formwork', 'Qəlib (taxta) işləri', 'labor'], ['masonry', 'Hörgü', 'labor'], ['roof', 'Dam örtüyü', 'labor'], ['electrical', 'Elektrik işləri', 'labor'],
  ['plumbing', 'Santexnika, su və kanalizasiya', 'labor'], ['heating', 'İstilik, isti döşəmə', 'labor'], ['plaster', 'Suvaq', 'labor'], ['screed', 'Şap, döşəmə', 'labor'],
  ['tiling', 'Kafel, metlax', 'labor'], ['painting', 'Şpaklyovka, boya', 'labor'], ['windows', 'Pəncərə və qapı quraşdırılması', 'labor'], ['insulation', 'İzolyasiya', 'labor'],
  ['welding', 'Qaynaq, metal işləri', 'labor'], ['helper', 'Fəhlə (köməkçi işlər)', 'labor'], ['transport', 'Daşınma', 'machinery_transport'],
  ['machinery', 'Texnika: ekskavator, kran, beton nasosu', 'machinery_transport'], ['design', 'Layihə, mühəndis, topoqrafiya', 'design'], ['cleaning', 'Təmizlik, tullantının daşınması', 'other_work'],
  ['other', 'Başqa iş (özüm yazım)', 'other_work'],
];
export const workTypeLabel = (k: string) => WORK_TYPES.find((w) => w[0] === k)?.[1] ?? '';

/** Months × (start / middle / end) rows — same dates as the server's monthSlots. Amounts are typed by the person. */
export function monthSlots(startDate: string, months: number, slots: ('start' | 'mid' | 'end')[]): PlanRow[] {
  // Month i runs from the start date + i months to the day before start + (i + 1) months: "əvvəli" is its first day,
  // "ortası" two weeks later, "sonu" its last day — never before the job starts.
  const [y, m, d] = startDate.split('-').map(Number);
  const iso = (t: Date) => t.toISOString().slice(0, 10);
  const at = (k: number) => { const t = new Date(Date.UTC(y, m - 1 + k, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))); };
  const name = { start: 'əvvəli', mid: 'ortası', end: 'sonu' } as const;
  const out: PlanRow[] = [];
  for (let i = 0; i < months; i++) {
    const from = at(i), to = new Date(at(i + 1).getTime() - 86_400_000);
    for (const s of slots) {
      const due = s === 'start' ? from : s === 'mid' ? new Date(Math.min(from.getTime() + 14 * 86_400_000, to.getTime())) : to;
      out.push({ dueDate: iso(due), label: `${i + 1}-ci ay, ayın ${name[s]}`, amount: null, rest: false });
    }
  }
  return out;
}
