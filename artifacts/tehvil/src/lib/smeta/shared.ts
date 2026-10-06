/**
 * Client-facing estimate behind `/estimate/:publicToken`.
 *
 * Saved projects are read from `GET /api/shared-estimates/:token`, which only
 * returns the last sent version with all-in line prices. Demo links are built
 * locally into the same shape so both render through one page.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  approveSharedEstimate, decideSharedChangeOrder, getSharedEstimate, requestSharedEstimateRevision,
  type SharedEstimate,
} from '@workspace/api-client-react';
import { changeImpact, changeTotals, estimateTotals, lineTotals, round2 } from './calc';
import { findDemoShare, smeta, subscribeSmeta } from './store';
import type { Project } from './types';

export type { SharedEstimate };
export type SharedEstimateState = 'loading' | 'ready' | 'missing' | 'error';

/** Same rules as the server's public snapshot: margin and waste are folded into each line. */
export function sharedEstimateFromProject(p: Project): SharedEstimate | null {
  const share = p.share;
  if (!share) return null;
  const snap = share.snapshot;
  const margin = share.snapshotMargin;
  let material = 0, labor = 0;
  const sections = snap.sections.map(s => {
    const items = s.items.map(it => {
      const l = lineTotals(it, margin);
      const k = 1 + l.marginPercentage;
      material += (l.materialTotal + l.wasteAmount) * k;
      labor += l.laborTotal * k;
      return {
        id: it.id, name: it.name, zone: it.zone, unit: it.unit, quantity: it.quantity, quantityLabel: it.quantitySource.label,
        total: l.rowTotal, materialTotal: round2((l.materialTotal + l.wasteAmount) * k), laborTotal: round2(l.laborTotal * k), additionalTotal: round2(it.additionalCost * k),
      };
    });
    return { id: s.id, title: s.title, total: round2(s.items.reduce((sum, it) => sum + lineTotals(it, margin).rowTotal, 0)), items };
  });
  const totals = estimateTotals(snap, share.snapshotProjectCosts, margin);
  material = round2(material); labor = round2(labor);
  const approvedChangesTotal = changeTotals(p.changeOrders).approved;
  const finalTotal = round2(totals.total + approvedChangesTotal);
  const approval = p.approvals.find(a => a.estimateVersion === snap.version);
  const revision = approval ? undefined : [...p.revisionRequests].reverse().find(r => r.estimateVersion === snap.version);
  return {
    project: { name: p.name, district: p.district, propertyKind: p.propertyKind, renovationKind: p.renovationKind, areaM2: p.areaM2, included: p.included, excluded: p.excluded },
    contractor: { name: p.contractor.name, company: p.contractor.company, phone: p.contractor.phone, experienceYears: p.contractor.experienceYears, completedProjects: p.contractor.completedProjects, rating: p.contractor.rating },
    client: { name: share.clientName, phone: share.phone },
    message: share.message,
    expiresAt: share.expiresAt,
    estimate: {
      version: snap.version, sentAt: share.createdAt, validUntil: snap.validUntil, sections,
      projectCosts: share.snapshotProjectCosts.map(c => ({ id: c.id, label: c.label, amount: c.amount })),
      projectCostsTotal: totals.projectCosts, total: totals.total,
      split: { material, labor, other: round2(totals.total - material - labor) },
    },
    changeOrders: p.changeOrders.filter(c => c.status !== 'draft').sort((a, b) => b.date.localeCompare(a.date))
      .map(c => ({ id: c.id, number: c.number, title: c.title, reason: c.reason, date: c.date, status: c.status as 'pending' | 'approved' | 'rejected', impact: changeImpact(c) })),
    approvedChangesTotal,
    finalTotal,
    payments: p.payments.map(m => ({ id: m.id, title: m.title, share: m.share, condition: m.condition, amount: round2(finalTotal * m.share) })),
    approval: approval ? { approvedAt: approval.approvedAt, name: approval.name } : undefined,
    revisionRequestedAt: revision?.createdAt,
  };
}

const statusOf = (e: unknown) => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : 0);

export function useSharedEstimate(token: string) {
  const demo = useSyncExternalStore(subscribeSmeta, () => findDemoShare(token));
  const demoData = useMemo(() => (demo?.share && new Date(demo.share.expiresAt).getTime() > Date.now() ? sharedEstimateFromProject(demo) : null), [demo]);
  const [remote, setRemote] = useState<{ status: SharedEstimateState; data?: SharedEstimate }>({ status: 'loading' });

  const load = useCallback(() => getSharedEstimate(token).then(
    data => setRemote({ status: 'ready', data }),
    e => setRemote({ status: [400, 404].includes(statusOf(e)) ? 'missing' : 'error' }),
  ), [token]);

  useEffect(() => { if (!demo) void load(); }, [demo, load]);

  /** Runs a public action; a 409 means the contractor sent a newer version, so the page is refreshed. */
  const run = async (action: () => Promise<SharedEstimate>) => {
    try { setRemote({ status: 'ready', data: await action() }); }
    catch (e) { if (statusOf(e) === 409) void load(); throw e; }
  };

  const data = demo ? demoData ?? undefined : remote.data;
  const status: SharedEstimateState = demo ? (demoData ? 'ready' : 'missing') : remote.status;
  const version = data?.estimate.version ?? 0;

  return {
    status,
    data,
    retry: load,
    approve: async (who: { name: string; phone: string }) => {
      if (demo) { smeta.approveByClient(token, who); return; }
      await run(() => approveSharedEstimate(token, { version, name: who.name, phone: who.phone, consent: true }));
    },
    requestRevision: async (who: { name: string; message: string }) => {
      if (demo) { smeta.requestRevision(token, who); return; }
      await run(() => requestSharedEstimateRevision(token, { version, name: who.name, message: who.message }));
    },
    decideChange: async (changeOrderId: string, decision: 'approved' | 'rejected') => {
      if (demo) { smeta.decideChangeByClient(token, changeOrderId, decision); return; }
      await run(() => decideSharedChangeOrder(token, changeOrderId, { decision }));
    },
  };
}
