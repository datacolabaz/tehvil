import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, requestUploadUrl, type HomeMedia } from '@workspace/api-client-react';

/* Types mirror routes/finance.ts and routes/photoStages.ts. Money from the server: strings ("1250.00") or integer qəpik in totals. */

export type Level = 'manage' | 'contractor' | 'party';
export interface Party {
  id: string; name: string; role: string; phone: string; note: string; contractAmount: string | null; contractNote: string; workerId: string | null;
  linked: boolean; isMe: boolean; invitePending: boolean; archived: boolean;
  balance: null | { basis: 'contract' | 'invoices'; contract: number; approvedChangeOrders: number; invoicedExpenses: number; obligation: number; paid: number; advanceGiven: number; advanceSpent: number; advanceBalance: number; refunds: number; credited: number; remaining: number; status: string; disputedPayments: number };
}
export interface ExpenseItem { id?: string; name: string; quantity: string | null; unit: string; unitPrice: string | null; lineTotal: string | null; category?: string | null; note?: string }
export interface Expense {
  id: string; date: string; category: string; description: string; partyId: string | null; vendorName: string; roomId: string | null;
  subtotal: string; discount: string; tax: string; total: string; paymentMethod: string; fundedByPartyId: string | null; invoiceId: string | null; entryId?: string | null; workId?: string | null; note: string;
  status: 'pending' | 'approved' | 'disputed' | 'void'; approvedAt: string | null; voidReason: string | null; createdAt: string; items: ExpenseItem[]; mismatch: string[];
  payState: { paid: number; status: string } | null; mine: boolean;
}
export interface Payment {
  id: string; kind: 'payment' | 'advance' | 'refund'; date: string; amount: string; partyId: string | null; payeeName: string; payerName: string; purpose: string; method: string;
  expenseId: string | null; changeOrderId: string | null; proofMediaId: string | null; status: string; cancelReason: string | null; confirmedAt: string | null; createdAt: string; toMe: boolean; bankVerified: false;
}
export interface ChangeOrder { id: string; number: number; partyId: string | null; title: string; description: string; reason: string; amount: string; date: string; mediaIds: string[]; status: string; decisionNote: string; decidedAt: string | null; mine: boolean; createdAt: string }
export interface AiInvoice {
  documentType: string; vendor: string | null; docNumber: string | null; printedDate: string | null; handwrittenDate: string | null; currency: string | null;
  items: { name: string; quantity: string | null; unit: string | null; unitPrice: string | null; lineTotal: string | null; confidence: number; category?: string | null }[];
  subtotal: string | null; discount: string | null; tax: string | null; total: string | null; paymentMethod: string | null; notes: string | null;
  confidence: Record<string, number>; suggestedCategory: string | null; unreadable: string[]; duplicates?: { type: string; id: string; reason: string }[];
}
export interface Invoice { id: string; mediaId: string; status: string; aiResult: AiInvoice | null; aiError: string | null; aiModel: string | null; docNumber: string; vendor: string; docDate: string | null; total: string | null; duplicateOfId: string | null; expenseId: string | null; confirmedAt: string | null; createdAt: string; mine: boolean }
export type Totals = Record<string, number | null>;
export interface Finance {
  project: { id: string; homeId: string; homeName: string; name: string; kind: string; status: string; startDate: string | null; endDate: string | null; smetaProjectId: string | null };
  level: Level; aiConfigured: boolean;
  permissions: { manage: boolean; addExpense: boolean; addInvoice: boolean; addPayment: boolean; proposeChange: boolean; export: boolean; ask: boolean };
  categories: { key: string; label: string; group: string; legacy?: boolean }[];
  totals: Totals | null; formulas: Record<string, string>; parties: Party[]; byCategory: { category: string; label: string; total: number; count: number }[];
  warnings: { kind: string; text: string; refType?: string; refId?: string }[];
  budget: { id: string; version: number; total: string; reason: string; note: string; changeOrderId: string | null; createdAt: string }[];
  changeOrders: ChangeOrder[]; expenses: Expense[]; payments: Payment[]; invoices: Invoice[]; media: HomeMedia[]; rooms: { id: string; name: string }[];
  smeta: null | { name: string; planned: number; plannedMaterial: number; plannedLabor: number; actual: number; actualMaterial: number; actualLabor: number; diff: number; usedPct: number | null; sections: { title: string; category: string; planned: number }[]; approvedChangeOrders: number; pending: number };
}
export interface ProjectList { canManage: boolean; aiConfigured: boolean; projects: { id: string; name: string; kind: string; status: string; startDate: string | null; endDate: string | null; smetaProjectId: string | null; createdAt: string }[] }

export const api = <T,>(path: string, method = 'GET', body?: unknown) =>
  customFetch<T>(`/api${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}), responseType: 'json' });
export const errorText = (e: unknown, fallback = 'Xəta baş verdi. Yenidən cəhd edin.') => (e as { data?: { error?: string } })?.data?.error || fallback;

export const projectsKey = (homeId: string) => ['finance-projects', homeId];
export const financeKey = (projectId: string) => ['finance', projectId];
export const useProjects = (homeId: string) => useQuery({ queryKey: projectsKey(homeId), queryFn: () => api<ProjectList>(`/homes/${homeId}/projects`) });
export const useFinance = (projectId: string, poll = false) => useQuery({
  queryKey: financeKey(projectId), queryFn: () => api<Finance>(`/home-projects/${projectId}/finance`),
  refetchInterval: (q) => (poll || (q.state.data as Finance | undefined)?.invoices.some((i) => i.status === 'reading') ? 2500 : false),
});
export function useRefresh(projectId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: financeKey(projectId) });
}

/** Uploads one file to storage (presigned PUT) and returns the descriptor the finance routes accept. */
export async function putFile(file: File) {
  const meta = await requestUploadUrl({ name: file.name, size: file.size, contentType: file.type });
  const put = await fetch(meta.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }).catch(() => null);
  if (!put?.ok) throw new Error('Fayl yüklənmədi. İnternet bağlantısını yoxlayıb yenidən cəhd edin.');
  return { objectPath: meta.objectPath, originalName: file.name, contentType: file.type, size: file.size };
}

/** Phones send big photos; AI reads images up to 5 MB, so photos are reduced in the browser first. */
export async function shrinkImage(file: File, maxEdge = 2000): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  if (file.size < 1_200_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

export async function downloadExcel(projectId: string, name: string, journal?: { from?: string; to?: string; cat?: string; pay?: string }) {
  const qs = journal ? `?view=journal${journal.from ? `&from=${journal.from}` : ''}${journal.to ? `&to=${journal.to}` : ''}${journal.cat ? `&cat=${journal.cat}` : ''}${journal.pay ? `&pay=${journal.pay}` : ''}` : '';
  if (journal?.from || journal?.to) name = `${name}-${journal.from ?? ''}${journal.to && journal.to !== journal.from ? `_${journal.to}` : ''}`;
  const blob = await customFetch<Blob>(`/api/home-projects/${projectId}/export.xlsx${qs}`, { responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `tehvil-${name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || 'layihe'}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ----------------------------------------------------------- formatting */

/** Azerbaijani style "1 250,00" — done by hand so every browser shows the same (not all ship az-AZ locale data). */
function fmtCents(c: number) {
  const neg = c < 0; const a = Math.abs(Math.round(c));
  const int = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${neg ? '−' : ''}${int},${String(a % 100).padStart(2, '0')}`;
}
/** Integer qəpik → "1 250,00 ₼". */
export const azn = (cents: number | null | undefined) => (cents == null ? '—' : `${fmtCents(cents)} ₼`);
/** "1250.00" → "1 250,00 ₼". */
export const aznS = (s: string | null | undefined) => (s == null || s === '' ? '—' : `${fmtCents(Math.round(Number(s) * 100))} ₼`);
export const toCentsS = (s: string | null | undefined) => (s ? Math.round(Number(s) * 100) : 0);
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const azDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');
export const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

export const ROLE: Record<string, string> = { contractor: 'Podratçı', worker: 'Usta', supplier: 'Təchizatçı', other: 'Digər' };
export const EXP_STATUS: Record<string, string> = { pending: 'Təsdiq gözləyir', approved: 'Təsdiqlənib', disputed: 'Mübahisəlidir', void: 'Ləğv edilib' };
export const EXP_TONE: Record<string, 'neutral' | 'info' | 'ok' | 'warn' | 'risk'> = { pending: 'warn', approved: 'ok', disputed: 'risk', void: 'neutral' };
export const PAY_KIND: Record<string, string> = { payment: 'Ödəniş', advance: 'Avans', refund: 'Geri qaytarma' };
export const PAY_STATUS: Record<string, string> = { recorded: 'Qeyd edilib', confirmed: 'Alan təsdiqləyib', disputed: 'Mübahisəlidir', cancelled: 'Ləğv edilib' };
export const PAY_TONE: Record<string, 'neutral' | 'info' | 'ok' | 'warn' | 'risk'> = { recorded: 'info', confirmed: 'ok', disputed: 'risk', cancelled: 'neutral' };
export const PARTY_STATUS: Record<string, string> = { none: 'Hesab yoxdur', unpaid: 'Ödənilməyib', partial: 'Qismən ödənilib', paid: 'Tam ödənilib', overpaid: 'Artıq ödənilib', disputed: 'Mübahisəlidir' };
export const PARTY_TONE: Record<string, 'neutral' | 'info' | 'ok' | 'warn' | 'risk'> = { none: 'neutral', unpaid: 'warn', partial: 'info', paid: 'ok', overpaid: 'risk', disputed: 'risk' };
export const EXP_PAY: Record<string, string> = { unpaid: 'Ödənilməyib', partial: 'Qismən ödənilib', paid: 'Ödənilib', advance: 'Avansdan' };
export const CO_STATUS: Record<string, string> = { proposed: 'Qərar gözləyir', approved: 'Təsdiqlənib', rejected: 'Rədd edilib', clarification: 'İzah istənilib' };
export const CO_TONE: Record<string, 'neutral' | 'info' | 'ok' | 'warn' | 'risk'> = { proposed: 'warn', approved: 'ok', rejected: 'neutral', clarification: 'info' };
export const METHOD: Record<string, string> = { cash: 'Nağd', card: 'Kart', transfer: 'Köçürmə', other: 'Digər', '': '—' };

/* ---------------------------------------------------------- photo stages */

export interface StagePhoto {
  mediaId: string; url: string; workId: string | null; roomId: string | null; uploadedAt: string; takenAt: string | null; caption: string;
  aiStatus: string; aiError: string | null; aiStage: string | null; aiConfidence: number | null; aiEvidence: string | null; aiRoomKind: string | null; aiUtility: string | null; aiUtilities: string[];
  stage: string | null; stageStatus: string; roomKind: string | null; utility: string | null; needsReview: boolean; decidedAt: string | null;
}
export interface StageData {
  aiConfigured: boolean; confidentThreshold: number; canEdit: boolean; canAnalyze: boolean; stages: { key: string; label: string }[];
  progress: { queued: number; done: number; failed: number; skipped: number; notAnalysed: number }; photos: StagePhoto[];
}
export const stagesKey = (homeId: string) => ['photo-stages', homeId];
export const useStageData = (homeId: string) => useQuery({
  queryKey: stagesKey(homeId), queryFn: () => api<StageData>(`/homes/${homeId}/photo-stages`),
  refetchInterval: (q) => ((q.state.data as StageData | undefined)?.progress.queued ? 2500 : false),
});
export const UTILITY: Record<string, string> = { electric: 'Elektrik xətləri', water: 'Su xətləri', sewer: 'Kanalizasiya', heating: 'İstilik', gas: 'Qaz', ventilation: 'Ventilyasiya', internet: 'İnternet / zəif cərəyan' };
export const ROOM_KIND: Record<string, string> = { living: 'Qonaq otağı', bedroom: 'Yataq otağı', kitchen: 'Mətbəx', bathroom: 'Hamam', toilet: 'Tualet', hall: 'Dəhliz', balcony: 'Balkon', utility: 'Texniki otaq', yard: 'Həyət', basement: 'Zirzəmi', exterior: 'Bayır / fasad', other: 'Digər' };

/* ---------------------------------------------------------- expense books */

export interface Book { homeId: string; homeName: string; location: string; projectId: string | null; total: number; month: number; count: number; budget: number | null }
export const booksKey = ['expense-books'];
export const useBooks = () => useQuery({ queryKey: booksKey, queryFn: () => api<{ aiConfigured: boolean; books: Book[] }>('/expense-books') });
export interface HistoryRow { at: string; action: string; summary: string; changes: Record<string, { from: unknown; to: unknown }> | null; byMe: boolean; actorRole: string }

/** Line categories offered in "Gündəlik qeyd" (same keys as the server's active categories, in this order). */
export const LINE_CATEGORIES: [string, string, 'material' | 'labor' | 'other'][] = [
  ['concrete', 'Beton və sement', 'material'], ['rebar_metal', 'Armatur və metal', 'material'], ['timber_formwork', 'Taxta və qəlib', 'material'],
  ['electrical', 'Elektrik materialları', 'material'], ['plumbing', 'Santexnika materialları', 'material'], ['building_materials', 'Digər materiallar', 'material'],
  ['labor', 'Usta və fəhlə haqqı', 'labor'], ['machinery_transport', 'Texnika və nəqliyyat', 'other'], ['other_work', 'Digər işlər', 'labor'],
  ['design', 'Layihələndirmə və mühəndislik', 'other'], ['other', 'Digər xərclər', 'other'],
];
export const PAY_LABEL: Record<string, string> = { paid: 'Ödənilib', unpaid: 'Ödənilməyib', partial: 'Qismən ödənilib', advance: 'Avansdan' };
