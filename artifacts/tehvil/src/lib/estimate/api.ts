import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { api } from '@/lib/finance/api';

/* Types mirror routes/aiEstimates.ts and lib/estimateEngine.ts. */

export type Source = 'drawing' | 'user' | 'assumed' | 'missing' | 'engineer' | 'list';
export interface Param { value: number | null; source: Source; confidence?: number; note?: string; where?: string }
export type ElementType = 'strip_foundation' | 'column' | 'beam' | 'slab' | 'wall' | 'other_concrete';
export interface Element { id: string; type: ElementType; name: string; params: Record<string, Param | undefined>; segments?: number[] }
export type Category = 'concrete' | 'rebar' | 'formwork' | 'timber' | 'other';
export interface ManualItem { key: string; name: string; category: Category; qty: number | null; unit: string; source: 'manual' | 'list'; note?: string }
export interface Settings { stockLength: number; lapD: number; anchorD: number; hookD: number; cover: number; concreteReservePct: number; rebarCutPct: number; plywood: { w: number; h: number; thicknessMm: number | null }; formworkUses: number; boardLength: number }
export interface Doc { settings: Settings; elements: Element[]; norms: Record<string, number | null | undefined>; manual: ManualItem[]; overrides: Record<string, { qty: number; reason?: string }>; prices: Record<string, number>; removed: string[]; architecturalOnly?: boolean }
export type ItemStatus = 'drawing' | 'user' | 'estimated' | 'missing' | 'engineer' | 'list' | 'manual';
export interface Item {
  key: string; category: Category; name: string; qty: number | null; unit: string; status: ItemStatus; formula: string; inputs: string[]; assumptions: string[];
  extra?: { label: string; value: number; unit: string }[]; reserve?: boolean; unitPrice: number | null; amount: number | null; overridden: boolean; computedQty: number | null;
}
export interface Result { items: Item[]; totals: { amount: number; pricedLines: number; unpricedLines: number; openLines: number; concreteM3: number; rebarKg: number; formworkM2: number }; warnings: string[] }
export interface Question { id: string; elementId: string | null; param: string; text: string; unit: string; options: { label: string; value: number }[]; why: string; current: Param | null }
export interface Estimate {
  id: string; name: string; kind: string; location: string; areaM2: number | null; floors: number | null; status: 'draft' | 'analyzing' | 'questions' | 'ready' | 'failed'; aiError: string | null; aiConfigured: boolean;
  homeId: string | null; version: number; updatedAt: string;
  files: { id: string; name: string; contentType: string; size: number; kind: 'drawing' | 'table'; status: string; error: string | null; url: string }[];
  doc: Doc; result: Result; statusLabels: Record<ItemStatus, string>; categoryLabels: Record<Category, string>; questions: Question[];
  ai: { drawingKinds: string[]; unreadable: string[]; notes: string | null; scaleNote: string | null } | null;
  versions: { version: number; reason: string; totals: Result['totals']; createdAt: string }[];
  contractor: { fileName: string; skipped: number; rows: { row: number; name: string; qty: number | null; unit: string; unitPrice: number | null; amount: number | null; category: Category; confirmed: boolean | null }[] } | null;
  comparison: { category: string; label: string; planned: number; actual: number; diff: number; contractor?: number | null }[] | null;
  walls: WallsView | null;
}

/* "Hörgü və suvaq (çertyojdan)" — mirrors lib/wallsModel.ts */
export type WSource = 'drawing' | 'assumed' | 'missing' | 'user';
export interface WParam { value: number | null; source: WSource; confidence?: number; where?: string; page?: number; how?: string }
export interface WOpening { id: string; kind: 'door' | 'window'; count: WParam; width: WParam; height: WParam }
export type WallKind = 'external' | 'internal' | 'partition';
export interface WWall { id: string; name: string; kind: WallKind; length: WParam; thickness: WParam; junctions: WParam; openings: WOpening[]; origin: 'ai' | 'user' }
export interface WFloor { id: string; name: string; level: number; floorHeight: WParam; slabThickness: WParam; walls: WWall[]; confirmed: boolean; confirmedAt?: string | null }
export interface WallsView {
  floors: WFloor[]; pages: Record<string, number[]>; drawingKinds: string[]; scaleNote: string | null; unreadable: string[]; notes: string | null; analyzedAt: string | null;
  state: { issues: { floorId: string; issues: { path: string; text: string }[] }[]; allConfirmed: boolean; openIssues: number };
  maxPages: number; kindLabels: Record<WallKind, string>; paramLabels: Record<string, string>;
}
export interface EstimateListItem { id: string; name: string; kind: string; status: string; openQuestions: number; itemCount: number; total: number; homeId: string | null; updatedAt: string }

export const estimatesKey = ['ai-estimates'];
export const estimateKey = (id: string) => ['ai-estimate', id];
export const useEstimates = () => useQuery({ queryKey: estimatesKey, queryFn: () => api<EstimateListItem[]>('/ai-estimates') });
export const useEstimate = (id: string) => useQuery({
  queryKey: estimateKey(id), queryFn: () => api<Estimate>(`/ai-estimates/${id}`),
  refetchInterval: (q) => ((q.state.data as Estimate | undefined)?.status === 'analyzing' ? 2000 : false),
});

export async function downloadEstimate(id: string, name: string) {
  const blob = await customFetch<Blob>(`/api/ai-estimates/${id}/export.xlsx`, { responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `smeta-${name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || 'ai'}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const KIND: Record<string, string> = { house: 'Fərdi ev tikintisi', renovation: 'Ev təmiri', annex: 'Əlavə tikili', concrete_rebar: 'Yalnız beton və armatur hesablaması', masonry_plaster: 'Hörgü və suvaq (çertyojdan)', other: 'Digər' };
export const TYPE: Record<ElementType, string> = { strip_foundation: 'Lent fundament', column: 'Kolonlar', beam: 'Rigel / tir', slab: 'Monolit döşəmə', wall: 'Beton divar', other_concrete: 'Digər beton element' };
export const SOURCE: Record<Source, string> = { drawing: 'Çertyojdan', user: 'Siz təsdiqləmisiniz', assumed: 'Təxmini', missing: 'Yoxdur', engineer: 'Mühəndisə', list: 'Siyahıdan' };
export const STATUS_TONE: Record<ItemStatus, 'neutral' | 'info' | 'ok' | 'warn' | 'risk'> = { drawing: 'ok', user: 'ok', list: 'info', manual: 'info', estimated: 'warn', missing: 'risk', engineer: 'risk' };
export const PARAMS: Record<ElementType, [string, string, string][]> = {
  strip_foundation: [['width', 'En', 'm'], ['height', 'Hündürlük', 'm'], ['junctions', 'Künc / T-birləşmə', 'ədəd'], ['longD', 'Uzununa armatur Ø', 'mm'], ['longCount', 'Uzununa armatur sayı', 'ədəd'], ['stirD', 'Xamut Ø', 'mm'], ['stirSpacing', 'Xamut addımı', 'm']],
  column: [['count', 'Say', 'ədəd'], ['width', 'En', 'm'], ['depth', 'Dərinlik', 'm'], ['height', 'Hündürlük', 'm'], ['longD', 'Uzununa armatur Ø', 'mm'], ['longCount', 'Çubuq sayı (bir kolonda)', 'ədəd'], ['stirD', 'Xamut Ø', 'mm'], ['stirSpacing', 'Xamut addımı', 'm']],
  beam: [['count', 'Say', 'ədəd'], ['length', 'Uzunluq (kolonlar arası)', 'm'], ['width', 'En', 'm'], ['height', 'Hündürlük (plitədən aşağı)', 'm'], ['longD', 'Uzununa armatur Ø', 'mm'], ['longCount', 'Çubuq sayı', 'ədəd'], ['stirD', 'Xamut Ø', 'mm'], ['stirSpacing', 'Xamut addımı', 'm']],
  slab: [['area', 'Sahə', 'm²'], ['thickness', 'Qalınlıq', 'm'], ['openings', 'Boşluqlar', 'm²'], ['meshD', 'Tor armatur Ø', 'mm'], ['meshSpacing', 'Tor addımı', 'm'], ['layers', 'Qat sayı', 'qat']],
  wall: [['length', 'Uzunluq', 'm'], ['height', 'Hündürlük', 'm'], ['thickness', 'Qalınlıq', 'm'], ['openings', 'Boşluqlar', 'm²'], ['meshD', 'Tor armatur Ø', 'mm'], ['meshSpacing', 'Tor addımı', 'm'], ['layers', 'Qat sayı', 'qat']],
  other_concrete: [['volume', 'Həcm', 'm³']],
};
export const nf = (n: number | null | undefined, d = 3) => (n == null ? '—' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
