/**
 * Client store for AI Smeta.
 *
 * Signed-in contractors' projects are persisted through the API
 * (`/api/smeta/*`, generated client in `@workspace/api-client-react`). Edits are
 * applied locally first and saved in the background: one request per project
 * at a time, debounced, always sending the latest state.
 *
 * The seeded demo projects (incl. Nərimanov, 24 860 AZN) are never sent to the
 * server: they contain sample client approvals and fixed links. They live in
 * this browser's localStorage and are marked `demo: true`.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  createSmetaProject, deleteSmetaProject, listSmetaProjects, shareSmetaEstimate, updateSmetaProject,
  type SmetaProject, type SmetaProjectInput,
} from '@workspace/api-client-react';
import { track } from '@/lib/analytics';
import { gateFeature } from '@/lib/contractor/upgrade';
import { budgetSummary, changeTotals, quantityFromMeasurements, projectTotals } from './calc';
import { CATEGORY_LABEL } from './catalog';
import { addDaysISO, todayISO, uid } from './format';
import { createSeedProjects } from './mock-data';
import type { ChangeOrder, ClientApproval, EstimateLineItem, EstimateShare, ExportJob, Expense, Measurement, PhotoEvidence, Project, Receipt, WorkCategory } from './types';

const DEMO_KEY = 'tehvil-smeta-demo-v1';
const SHOW_DEMO_KEY = 'tehvil-smeta-show-demo';
const SAVE_DELAY = 600;

export type RemoteStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

interface State {
  server: Project[];
  demo: Project[];
  remote: RemoteStatus;
  sync: SyncStatus;
  showDemo: boolean | null;
  all: Project[];
  visible: Project[];
}

const demoRepository = {
  load(): Project[] | null {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { version: number; projects: Project[] };
      return parsed.version === 1 && Array.isArray(parsed.projects) ? parsed.projects : null;
    } catch { return null; }
  },
  save(projects: Project[]) {
    try {
      // Object URLs only live for the current session.
      const clean = projects.map(p => ({ ...p, photos: p.photos.map(ph => ({ ...ph, url: undefined })), receipts: p.receipts.map(r => ({ ...r, previewUrl: undefined })) }));
      localStorage.setItem(DEMO_KEY, JSON.stringify({ version: 1, projects: clean }));
    } catch { /* storage full or unavailable: keep working in memory */ }
  },
};

const seedDemo = () => createSeedProjects().map(p => ({ ...p, demo: true }));
const readShowDemo = (): boolean | null => {
  try { const v = localStorage.getItem(SHOW_DEMO_KEY); return v === null ? null : v === '1'; } catch { return null; }
};

function derive(s: Omit<State, 'all' | 'visible'>): State {
  // Demo projects are shown until the contractor has their own, unless they chose otherwise.
  const showDemo = s.showDemo ?? !(s.remote === 'ready' && s.server.length > 0);
  return { ...s, all: [...s.server, ...s.demo], visible: showDemo ? [...s.server, ...s.demo] : s.server };
}

let state: State = derive({ server: [], demo: demoRepository.load() ?? seedDemo(), remote: 'idle', sync: 'idle', showDemo: readShowDemo() });
const listeners = new Set<() => void>();
let demoSaveTimer: number | undefined;

function set(patch: Partial<Omit<State, 'all' | 'visible'>>) {
  const demoChanged = patch.demo !== undefined && patch.demo !== state.demo;
  state = derive({ ...state, ...patch });
  listeners.forEach(l => l());
  if (demoChanged) {
    window.clearTimeout(demoSaveTimer);
    demoSaveTimer = window.setTimeout(() => demoRepository.save(state.demo), 250);
  }
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
const findProject = (id: string) => state.all.find(p => p.id === id);
const isDemo = (id: string) => state.demo.some(p => p.id === id);

/* ---------------------------------------------------------------- API mapping */

function toInput(p: Project): SmetaProjectInput {
  return {
    name: p.name, district: p.district, address: p.address, propertyKind: p.propertyKind, renovationKind: p.renovationKind, quality: p.quality,
    areaM2: p.areaM2, startDate: p.startDate, endDate: p.endDate, client: p.client, contractor: p.contractor, completion: p.completion,
    defaultMarginPercentage: p.defaultMarginPercentage, projectCosts: p.projectCosts, estimate: p.estimate, changeOrders: p.changeOrders,
    expenses: p.expenses,
    // TODO(api): upload receipt and photo files to App Storage; only metadata is saved for now.
    receipts: p.receipts.map(({ previewUrl: _url, ...r }) => r),
    photos: p.photos.map(({ url: _url, ...ph }) => ph),
    drawing: p.drawing, measurements: p.measurements, payments: p.payments, included: p.included, excluded: p.excluded, exports: p.exports,
  };
}

/** Server response → client model, keeping this session's object URLs for files picked locally. */
function fromApi(dto: SmetaProject, local?: Project): Project {
  const p = dto as unknown as Project;
  if (!local) return p;
  const photoUrls = new Map(local.photos.filter(ph => ph.url).map(ph => [ph.id, ph.url]));
  const previews = new Map(local.receipts.filter(r => r.previewUrl).map(r => [r.id, r.previewUrl]));
  return {
    ...p,
    photos: p.photos.map(ph => photoUrls.has(ph.id) ? { ...ph, url: photoUrls.get(ph.id) } : ph),
    receipts: p.receipts.map(r => previews.has(r.id) ? { ...r, previewUrl: previews.get(r.id) } : r),
  };
}

function replaceServerProject(next: Project) {
  set({ server: state.server.some(p => p.id === next.id) ? state.server.map(p => p.id === next.id ? next : p) : [next, ...state.server] });
}

/* ------------------------------------------------------------- loading & sync */

let loading: Promise<void> | null = null;
const dirty = new Set<string>();
const saveTimers = new Map<string, number>();
const inflight = new Map<string, Promise<boolean>>();
const editSeq = new Map<string, number>();

function loadRemote(): Promise<void> {
  if (loading) return loading;
  if (state.remote !== 'ready') set({ remote: 'loading' });
  loading = listSmetaProjects()
    .then(list => {
      // Unsaved local edits win over the fetched copy; they are saved next.
      const local = new Map(state.server.map(p => [p.id, p]));
      set({ server: list.map(dto => dirty.has(dto.id) && local.has(dto.id) ? local.get(dto.id)! : fromApi(dto, local.get(dto.id))), remote: 'ready' });
    })
    .catch(() => { set({ remote: state.remote === 'ready' ? 'ready' : 'error' }); })
    .finally(() => { loading = null; });
  return loading;
}

function ensureLoaded() {
  if (state.remote === 'idle' || state.remote === 'error') void loadRemote();
}

const busy = () => dirty.size > 0 || saveTimers.size > 0 || inflight.size > 0;

if (typeof window !== 'undefined') {
  // Picks up client approvals and decisions made on the public page.
  window.addEventListener('focus', () => { if (state.remote === 'ready' && !busy()) void loadRemote(); });
  window.addEventListener('beforeunload', e => { if (busy()) e.preventDefault(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') dirty.forEach(id => { void flush(id); }); });
}

function scheduleSave(id: string) {
  dirty.add(id);
  editSeq.set(id, (editSeq.get(id) ?? 0) + 1);
  window.clearTimeout(saveTimers.get(id));
  saveTimers.set(id, window.setTimeout(() => { saveTimers.delete(id); void flush(id); }, SAVE_DELAY));
  if (state.sync !== 'saving') set({ sync: 'saving' });
}

/** Saves pending edits of one project. Resolves `false` when the save failed. */
async function flush(id: string): Promise<boolean> {
  window.clearTimeout(saveTimers.get(id));
  saveTimers.delete(id);
  const previous = inflight.get(id);
  if (previous) await previous;
  const p = state.server.find(x => x.id === id);
  if (!p || !dirty.has(id)) return true;
  dirty.delete(id);
  const seq = editSeq.get(id);
  set({ sync: 'saving' });
  const run = updateSmetaProject(id, toInput(p)).then(saved => {
    if (editSeq.get(id) === seq) replaceServerProject(fromApi(saved, state.server.find(x => x.id === id)));
    if (!busyExcept(id)) set({ sync: 'saved' });
    return true;
  }, () => {
    dirty.add(id);
    set({ sync: 'error' });
    return false;
  }).finally(() => { inflight.delete(id); });
  inflight.set(id, run);
  return run;
}
const busyExcept = (id: string) => [...dirty].some(x => x !== id) || saveTimers.size > 0 || [...inflight.keys()].some(x => x !== id);

/* ---------------------------------------------------------------------- hooks */

export function useSmetaProjects(): Project[] {
  useEffect(ensureLoaded, []);
  return useSyncExternalStore(subscribe, () => state.visible);
}
export function useSmetaProject(id: string): Project | undefined {
  useEffect(ensureLoaded, []);
  return useSyncExternalStore(subscribe, () => state.all).find(p => p.id === id);
}
/** True until the contractor's projects have been fetched for the first time. */
export function useSmetaLoading(): boolean {
  useEffect(ensureLoaded, []);
  const remote = useSyncExternalStore(subscribe, () => state.remote);
  return remote === 'idle' || remote === 'loading';
}
export function useSmetaRemoteStatus(): RemoteStatus {
  return useSyncExternalStore(subscribe, () => state.remote);
}
export function useSmetaSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => state.sync);
}
export function useDemoVisible(): boolean {
  return useSyncExternalStore(subscribe, () => state.visible !== state.server);
}

/** Clears everything cached for the previous Clerk user. */
export function resetSmetaSession() {
  saveTimers.forEach(t => window.clearTimeout(t));
  saveTimers.clear(); dirty.clear(); editSeq.clear();
  set({ server: [], remote: 'idle', sync: 'idle' });
}

/* ------------------------------------------------------------------ mutations */

const nowISO = () => new Date().toISOString();

function mutate(id: string, recipe: (draft: Project) => void) {
  const apply = (list: Project[]) => list.map(p => {
    if (p.id !== id) return p;
    const draft = structuredClone(p);
    recipe(draft);
    draft.updatedAt = nowISO();
    return draft;
  });
  if (state.demo.some(p => p.id === id)) { set({ demo: apply(state.demo) }); return; }
  if (!state.server.some(p => p.id === id)) return;
  set({ server: apply(state.server) });
  scheduleSave(id);
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
export type ShareDetails = { clientName: string; phone: string; email?: string; message: string; notifyOnApprove: boolean; attachPdf: boolean };

export const smeta = {
  /** Saves a new project on the server and returns the stored copy (with its server id). */
  async createProject(p: Project, opts: { guided?: boolean } = {}): Promise<Project> {
    const saved = fromApi(await createSmetaProject(toInput(p)), p);
    replaceServerProject(saved);
    track('estimate_created', {
      projectId: saved.id, total: Math.round(projectTotals(saved).total), sections: saved.estimate.sections.length,
      guided: Boolean(opts.guided), demo: false,
    });
    return saved;
  },

  async deleteProject(id: string) {
    if (state.demo.some(p => p.id === id)) { set({ demo: state.demo.filter(p => p.id !== id) }); return; }
    await deleteSmetaProject(id);
    dirty.delete(id);
    set({ server: state.server.filter(p => p.id !== id) });
  },

  resetDemo() { set({ demo: seedDemo() }); },

  setDemoVisible(visible: boolean) {
    try { localStorage.setItem(SHOW_DEMO_KEY, visible ? '1' : '0'); } catch { /* preference stays in memory */ }
    set({ showDemo: visible });
  },

  /** Retries failed background saves. */
  retrySync() { [...dirty].forEach(id => { void flush(id); }); },

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
    const p = findProject(id);
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
    if (!gateFeature('changeOrders', { demo: isDemo(id) })) return;
    mutate(id, d => { d.changeOrders.push({ ...co, id: uid('co'), number: Math.max(0, ...d.changeOrders.map(c => c.number)) + 1 }); });
    track('change_order_created', { projectId: id, impact: Math.round(co.materialDelta + co.laborDelta + co.additionalCost), demo: isDemo(id) });
  },
  setChangeStatus(id: string, coId: string, status: ChangeOrder['status'], note?: string, by: 'contractor' | 'client' = 'contractor') {
    let approved = false;
    mutate(id, d => {
      const c = d.changeOrders.find(x => x.id === coId);
      if (!c) return;
      approved = status === 'approved' && c.status !== 'approved';
      c.status = status;
      if (status === 'approved' || status === 'rejected') { c.decidedAt = nowISO(); c.decisionNote = note; }
    });
    if (approved) track('change_order_approved', { projectId: id, by, demo: isDemo(id) });
  },

  addExpense(id: string, e: Omit<Expense, 'id'>, receipt?: Receipt) {
    if (!gateFeature('expenseTracking', { demo: isDemo(id) })) return;
    mutate(id, d => {
      if (receipt) d.receipts.push(receipt);
      d.expenses.push({ ...e, id: uid('ex'), receiptId: receipt?.id ?? e.receiptId });
    });
    track('expense_added', { projectId: id, amount: Math.round(e.amount), category: e.category, demo: isDemo(id) });
  },
  setExpenseStatus(id: string, expenseId: string, paymentStatus: Expense['paymentStatus']) {
    mutate(id, d => { const e = d.expenses.find(x => x.id === expenseId); if (e) e.paymentStatus = paymentStatus; });
  },

  addPhoto(id: string, photo: Omit<PhotoEvidence, 'id'>): string {
    const photoId = uid('ph');
    if (!gateFeature('photoEvidence', { demo: isDemo(id) })) return '';
    mutate(id, d => { d.photos.unshift({ ...photo, id: photoId }); });
    track('photo_evidence_added', { projectId: id, phase: photo.phase, demo: isDemo(id) });
    return photoId;
  },
  togglePhotoVisibility(id: string, photoId: string) {
    mutate(id, d => { const ph = d.photos.find(x => x.id === photoId); if (ph) ph.clientVisible = !ph.clientVisible; });
  },

  /**
   * Freezes the current estimate as the client-visible version and returns the share.
   * For saved projects the server creates the token, stores the snapshot and sends the notification.
   */
  async shareEstimate(id: string, details: ShareDetails): Promise<EstimateShare | undefined> {
    const first = !findProject(id)?.share;
    if (isDemo(id)) {
      const share = shareDemo(id, details);
      if (share) track('estimate_shared', { projectId: id, version: share.snapshot.version, demo: true, first });
      return share;
    }
    if (!(await flush(id))) throw new Error('Unsaved changes could not be stored');
    const saved = fromApi(await shareSmetaEstimate(id, { ...details, email: details.email || undefined }), findProject(id));
    replaceServerProject(saved);
    track('estimate_shared', { projectId: id, version: saved.share?.snapshot.version ?? saved.estimate.version, demo: false, first });
    return saved.share;
  },

  /* Demo-only client actions. Saved projects use the public API (see `shared.ts`). */

  approveByClient(token: string, who: { name: string; phone: string }) {
    const p = state.demo.find(x => x.share?.token === token);
    if (!p?.share) return;
    const share = p.share;
    const total = projectTotals({ ...p, estimate: share.snapshot, projectCosts: share.snapshotProjectCosts, defaultMarginPercentage: share.snapshotMargin }).total;
    const approval: ClientApproval = { id: uid('ap'), estimateVersion: share.snapshot.version, approvedAt: nowISO(), name: who.name, phone: who.phone, confirmedScope: true, total };
    mutate(p.id, d => { d.approvals.push(approval); d.status = 'client_approved'; });
    track('estimate_client_approved', { version: approval.estimateVersion, total: Math.round(total), demo: true });
  },

  requestRevision(token: string, who: { name: string; message: string }) {
    const p = state.demo.find(x => x.share?.token === token);
    if (!p?.share) return;
    const version = p.share.snapshot.version;
    mutate(p.id, d => { d.revisionRequests.push({ id: uid('rv'), estimateVersion: version, createdAt: nowISO(), name: who.name, message: who.message }); d.status = 'revision_requested'; });
  },

  decideChangeByClient(token: string, coId: string, decision: 'approved' | 'rejected', note?: string) {
    const p = state.demo.find(x => x.share?.token === token);
    if (!p) return;
    smeta.setChangeStatus(p.id, coId, decision, note, 'client');
  },

  addExport(id: string, job: ExportJob) {
    mutate(id, d => { d.exports = [job, ...d.exports].slice(0, 12); });
  },
};

function shareDemo(id: string, details: ShareDetails): EstimateShare | undefined {
  mutate(id, d => {
    const changed = !d.share || hasUnsentChanges(d);
    if (d.share && changed) d.estimate.version = d.share.snapshot.version + 1;
    d.estimate.sections.forEach(s => s.items.forEach(i => { if (i.status !== 'approved') i.status = 'approved'; }));
    d.estimate.validUntil = addDaysISO(todayISO(), 30);
    // The link stays stable across versions so a client's saved link always shows the latest sent version.
    const token = d.share?.token ?? `${d.id.slice(0, 3)}-${Math.random().toString(36).slice(2, 10)}`;
    d.share = {
      token, createdAt: nowISO(), expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      ...details, snapshot: structuredClone(d.estimate), snapshotProjectCosts: structuredClone(d.projectCosts), snapshotMargin: d.defaultMarginPercentage,
    };
    d.client = { name: details.clientName, phone: details.phone, email: details.email || d.client.email };
    if (changed || d.status === 'draft' || d.status === 'revision_requested') d.status = 'sent';
  });
  return findProject(id)?.share;
}

/** Demo project shared under this token, if any (demo links only work in this browser). */
export function findDemoShare(token: string): Project | undefined {
  return state.demo.find(p => p.share?.token === token);
}
export function subscribeSmeta(listener: () => void) { return subscribe(listener); }

/** JSON with sorted keys: snapshots read back from the database do not keep key order. */
function stableJson(value: unknown, skip?: string): string {
  if (Array.isArray(value)) return `[${value.map(v => stableJson(v, skip)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && k !== skip)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v, skip)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function hasUnsentChanges(p: Project): boolean {
  if (!p.share) return false;
  return stableJson(p.share.snapshot.sections, 'status') !== stableJson(p.estimate.sections, 'status')
    || stableJson(p.share.snapshotProjectCosts) !== stableJson(p.projectCosts)
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
