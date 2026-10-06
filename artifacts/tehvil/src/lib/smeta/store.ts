/**
 * Client-side store for AI Smeta.
 *
 * Projects live in memory and are persisted to localStorage so the demo keeps
 * edits between visits and the public estimate link works in the same browser.
 *
 * TODO(api): swap `localRepository` for an HTTP repository backed by new
 * `/api/smeta/*` endpoints (see docs/AI_SMETA.md). Components only use the
 * hooks and `smeta.*` actions below, so the swap stays local to this file.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { budgetSummary, changeTotals, quantityFromMeasurements, projectTotals } from './calc';
import { CATEGORY_LABEL } from './catalog';
import { addDaysISO, todayISO, uid } from './format';
import { createSeedProjects } from './mock-data';
import type { ChangeOrder, ClientApproval, EstimateLineItem, ExportJob, Expense, Measurement, PhotoEvidence, Project, Receipt, WorkCategory } from './types';

const STORAGE_KEY = 'tehvil-smeta-v1';

interface SmetaRepository {
  load(): Project[] | null;
  save(projects: Project[]): void;
}

const localRepository: SmetaRepository = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { version: number; projects: Project[] };
      return parsed.version === 1 && Array.isArray(parsed.projects) ? parsed.projects : null;
    } catch { return null; }
  },
  save(projects) {
    try {
      // Object URLs only live for the current session.
      const clean = projects.map(p => ({ ...p, photos: p.photos.map(ph => ({ ...ph, url: undefined })), receipts: p.receipts.map(r => ({ ...r, previewUrl: undefined })) }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projects: clean }));
    } catch { /* storage full or unavailable: keep working in memory */ }
  },
};

const repository: SmetaRepository = localRepository;

let projects: Project[] = repository.load() ?? createSeedProjects();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

function emit() {
  listeners.forEach(l => l());
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => repository.save(projects), 250);
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
const snapshot = () => projects;

export function useSmetaProjects(): Project[] {
  return useSyncExternalStore(subscribe, snapshot);
}
export function useSmetaProject(id: string): Project | undefined {
  const list = useSmetaProjects();
  return list.find(p => p.id === id);
}
export function useSharedProject(token: string): Project | undefined {
  const list = useSmetaProjects();
  return list.find(p => p.share?.token === token && new Date(p.share.expiresAt).getTime() > Date.now());
}

const seenLoads = new Set<string>();
/** Short skeleton on first visit to a screen, mirroring network latency. TODO(api): replace with query state. */
export function useFirstLoad(key: string, ms = 420): boolean {
  const [loading, setLoading] = useState(!seenLoads.has(key));
  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => { seenLoads.add(key); setLoading(false); }, ms);
    return () => window.clearTimeout(t);
  }, [key, loading, ms]);
  return loading;
}

const nowISO = () => new Date().toISOString();

function mutate(id: string, recipe: (draft: Project) => void) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const draft = structuredClone(p);
    recipe(draft);
    draft.updatedAt = nowISO();
    return draft;
  });
  emit();
}

function findLine(p: Project, lineId: string): { item: EstimateLineItem; index: number; sectionIndex: number } | null {
  for (let s = 0; s < p.estimate.sections.length; s++) {
    const index = p.estimate.sections[s].items.findIndex(i => i.id === lineId);
    if (index >= 0) return { item: p.estimate.sections[s].items[index], index, sectionIndex: s };
  }
  return null;
}

const afterApproval = (p: Project) => p.status === 'client_approved' || p.status === 'sent';

export type LinePatch = Partial<Pick<EstimateLineItem, 'name' | 'zone' | 'unit' | 'quantity' | 'materialUnitPrice' | 'laborUnitPrice' | 'additionalCost' | 'wastePercentage' | 'marginPercentage' | 'status'>>;

export const smeta = {
  createProject(p: Project) { projects = [p, ...projects]; emit(); },

  resetDemo() { projects = createSeedProjects(); emit(); },

  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'completion' | 'defaultMarginPercentage' | 'client' | 'address'>>) {
    mutate(id, d => { Object.assign(d, patch); });
  },

  updateLine(id: string, lineId: string, patch: LinePatch) {
    mutate(id, d => {
      const hit = findLine(d, lineId);
      if (!hit) return;
      const it = hit.item;
      const priceChanged = patch.materialUnitPrice !== undefined && patch.materialUnitPrice !== it.materialUnitPrice
        || patch.laborUnitPrice !== undefined && patch.laborUnitPrice !== it.laborUnitPrice;
      if (patch.quantity !== undefined && patch.quantity !== it.quantity) it.quantitySource = { kind: 'manual', label: 'Manual daxil edilib' };
      if (priceChanged) it.priceSource = { kind: 'manual', updatedAt: todayISO() };
      Object.assign(it, patch);
      if (patch.status === undefined && it.status === 'approved' && afterApproval(d)) it.status = 'changed';
    });
  },

  addLine(id: string, sectionId: string): string {
    const lineId = uid('li');
    mutate(id, d => {
      const s = d.estimate.sections.find(x => x.id === sectionId);
      if (!s) return;
      s.items.push({
        id: lineId, name: 'Yeni iş', zone: '—', unit: 'm²', quantity: 1, materialUnitPrice: 0, laborUnitPrice: 0, additionalCost: 0,
        wastePercentage: 0, marginPercentage: null, priceSource: { kind: 'manual', updatedAt: todayISO() },
        quantitySource: { kind: 'manual', label: 'Manual daxil edilib' }, status: 'draft',
      });
    });
    return lineId;
  },

  addSection(id: string, category: WorkCategory): string {
    const sectionId = uid('sec');
    mutate(id, d => { d.estimate.sections.push({ id: sectionId, category, title: CATEGORY_LABEL[category], items: [] }); });
    return sectionId;
  },

  duplicateLine(id: string, lineId: string) {
    mutate(id, d => {
      const hit = findLine(d, lineId);
      if (!hit) return;
      d.estimate.sections[hit.sectionIndex].items.splice(hit.index + 1, 0, { ...structuredClone(hit.item), id: uid('li'), name: `${hit.item.name} (surət)`, status: 'draft' });
    });
  },

  deleteLine(id: string, lineId: string): (() => void) | undefined {
    const p = projects.find(x => x.id === id);
    const hit = p && findLine(p, lineId);
    if (!p || !hit) return undefined;
    const removed = structuredClone(hit.item);
    const sectionId = p.estimate.sections[hit.sectionIndex].id;
    mutate(id, d => { const s = d.estimate.sections.find(x => x.id === sectionId); if (s) s.items = s.items.filter(i => i.id !== lineId); });
    return () => mutate(id, d => { const s = d.estimate.sections.find(x => x.id === sectionId); if (s && !s.items.some(i => i.id === removed.id)) s.items.splice(Math.min(hit.index, s.items.length), 0, removed); });
  },

  approveLines(id: string, lineIds?: string[]) {
    mutate(id, d => d.estimate.sections.forEach(s => s.items.forEach(i => { if ((!lineIds || lineIds.includes(i.id)) && i.status !== 'approved') i.status = 'approved'; })));
  },

  refreshPrice(id: string, lineId: string, price: number, reference: string) {
    mutate(id, d => {
      const hit = findLine(d, lineId);
      if (!hit) return;
      hit.item.materialUnitPrice = price;
      hit.item.priceSource = { kind: 'market', reference, updatedAt: todayISO() };
      if (hit.item.status === 'approved' && afterApproval(d)) hit.item.status = 'changed';
    });
  },

  setProjectCost(id: string, costId: string, patch: { label?: string; amount?: number }) {
    mutate(id, d => { const c = d.projectCosts.find(x => x.id === costId); if (c) Object.assign(c, patch); });
  },
  addProjectCost(id: string) {
    mutate(id, d => { d.projectCosts.push({ id: uid('pc'), label: 'Əlavə xərc', amount: 0 }); });
  },
  removeProjectCost(id: string, costId: string) {
    mutate(id, d => { d.projectCosts = d.projectCosts.filter(c => c.id !== costId); });
  },

  updateMeasurement(id: string, mId: string, patch: Partial<Pick<Measurement, 'value' | 'status' | 'name'>>) {
    mutate(id, d => { const m = d.measurements.find(x => x.id === mId); if (m) Object.assign(m, patch); });
  },

  /** Writes reviewed measurement values into linked line quantities. Returns how many rows changed. */
  applyMeasurements(id: string): number {
    let changed = 0;
    mutate(id, d => {
      const values = new Map(d.measurements.filter(m => m.status !== 'suggested').map(m => [m.id, m.value]));
      d.estimate.sections.forEach(s => s.items.forEach(it => {
        const q = quantityFromMeasurements(it, values);
        if (q !== null && q !== it.quantity) {
          it.quantity = q;
          changed++;
          if (it.status === 'approved' && afterApproval(d)) it.status = 'changed';
        }
      }));
    });
    return changed;
  },

  attachDrawing(id: string, drawing: Project['drawing'], measurements: Measurement[]) {
    mutate(id, d => {
      d.drawing = drawing;
      const keep = d.measurements.filter(m => !measurements.some(n => n.id === m.id));
      d.measurements = [...measurements, ...keep];
    });
  },

  addChangeOrder(id: string, co: Omit<ChangeOrder, 'id' | 'number'>) {
    mutate(id, d => { d.changeOrders.push({ ...co, id: uid('co'), number: Math.max(0, ...d.changeOrders.map(c => c.number)) + 1 }); });
  },
  setChangeStatus(id: string, coId: string, status: ChangeOrder['status'], note?: string) {
    mutate(id, d => {
      const c = d.changeOrders.find(x => x.id === coId);
      if (!c) return;
      c.status = status;
      if (status === 'approved' || status === 'rejected') { c.decidedAt = nowISO(); c.decisionNote = note; }
    });
  },

  addExpense(id: string, e: Omit<Expense, 'id'>, receipt?: Receipt) {
    mutate(id, d => {
      if (receipt) d.receipts.push(receipt);
      d.expenses.push({ ...e, id: uid('ex'), receiptId: receipt?.id ?? e.receiptId });
    });
  },
  setExpenseStatus(id: string, expenseId: string, paymentStatus: Expense['paymentStatus']) {
    mutate(id, d => { const e = d.expenses.find(x => x.id === expenseId); if (e) e.paymentStatus = paymentStatus; });
  },

  addPhoto(id: string, photo: Omit<PhotoEvidence, 'id'>): string {
    const photoId = uid('ph');
    mutate(id, d => { d.photos.unshift({ ...photo, id: photoId }); });
    return photoId;
  },
  togglePhotoVisibility(id: string, photoId: string) {
    mutate(id, d => { const ph = d.photos.find(x => x.id === photoId); if (ph) ph.clientVisible = !ph.clientVisible; });
  },

  /** Freezes the current estimate as the client-visible version and returns the share. */
  shareEstimate(id: string, details: { clientName: string; phone: string; email?: string; message: string; notifyOnApprove: boolean; attachPdf: boolean }) {
    mutate(id, d => {
      const changed = !d.share || hasUnsentChanges(d);
      if (d.share && changed) d.estimate.version = d.share.snapshot.version + 1;
      d.estimate.sections.forEach(s => s.items.forEach(i => { if (i.status !== 'approved') i.status = 'approved'; }));
      d.estimate.validUntil = addDaysISO(todayISO(), 30);
      const token = d.share && !changed ? d.share.token : `${d.id.slice(0, 3)}-${Math.random().toString(36).slice(2, 10)}`;
      d.share = {
        token, createdAt: nowISO(), expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
        ...details, snapshot: structuredClone(d.estimate), snapshotProjectCosts: structuredClone(d.projectCosts), snapshotMargin: d.defaultMarginPercentage,
      };
      d.client = { name: details.clientName, phone: details.phone, email: details.email || d.client.email };
      if (changed || d.status === 'draft' || d.status === 'revision_requested') d.status = 'sent';
    });
    return projects.find(p => p.id === id)?.share;
  },

  approveByClient(token: string, who: { name: string; phone: string }) {
    const p = projects.find(x => x.share?.token === token);
    if (!p?.share) return;
    const share = p.share;
    const total = projectTotals({ ...p, estimate: share.snapshot, projectCosts: share.snapshotProjectCosts, defaultMarginPercentage: share.snapshotMargin }).total;
    const approval: ClientApproval = { id: uid('ap'), estimateVersion: share.snapshot.version, approvedAt: nowISO(), name: who.name, phone: who.phone, confirmedScope: true, total };
    mutate(p.id, d => { d.approvals.push(approval); d.status = 'client_approved'; });
  },

  requestRevision(token: string, who: { name: string; message: string }) {
    const p = projects.find(x => x.share?.token === token);
    if (!p?.share) return;
    const version = p.share.snapshot.version;
    mutate(p.id, d => { d.revisionRequests.push({ id: uid('rv'), estimateVersion: version, createdAt: nowISO(), name: who.name, message: who.message }); d.status = 'revision_requested'; });
  },

  decideChangeByClient(token: string, coId: string, decision: 'approved' | 'rejected', note?: string) {
    const p = projects.find(x => x.share?.token === token);
    if (!p) return;
    smeta.setChangeStatus(p.id, coId, decision, note);
  },

  addExport(id: string, job: ExportJob) {
    mutate(id, d => { d.exports = [job, ...d.exports].slice(0, 12); });
  },
};

export function hasUnsentChanges(p: Project): boolean {
  if (!p.share) return false;
  const strip = (x: unknown) => JSON.stringify(x, (k, v) => (k === 'status' ? undefined : v));
  return strip(p.share.snapshot.sections) !== strip(p.estimate.sections)
    || strip(p.share.snapshotProjectCosts) !== strip(p.projectCosts)
    || p.share.snapshotMargin !== p.defaultMarginPercentage;
}

export type StatusTone = 'neutral' | 'info' | 'ok' | 'warn' | 'risk';
export interface DisplayStatus { label: string; tone: StatusTone }

export const ESTIMATE_STATUS_LABEL: Record<Project['status'], string> = {
  draft: 'Qaralama', sent: 'Sifarişçiyə göndərilib', client_approved: 'Sifarişçi təsdiq edib', revision_requested: 'Düzəliş istənilib',
};

/** Header badge: budget risk and pending changes take priority over the workflow status. */
export function displayStatus(p: Project): DisplayStatus {
  if (budgetSummary(p).health === 'risk') return { label: 'Büdcə riski', tone: 'risk' };
  if (changeTotals(p.changeOrders).pendingCount > 0) return { label: 'Dəyişiklik gözləyir', tone: 'warn' };
  const tone: Record<Project['status'], StatusTone> = { draft: 'neutral', sent: 'info', client_approved: 'ok', revision_requested: 'warn' };
  return { label: ESTIMATE_STATUS_LABEL[p.status], tone: tone[p.status] };
}

export const HEALTH_LABEL = { healthy: 'Büdcə daxilində', watch: 'Diqqət tələb edir', risk: 'Büdcəni keçir' } as const;
