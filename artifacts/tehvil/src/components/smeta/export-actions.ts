import { track } from '@/lib/analytics';
import { gateFeature } from '@/lib/contractor/upgrade';
import { exportExcel, openPrintView } from '@/lib/smeta/export';
import { smeta } from '@/lib/smeta/store';
import type { Project } from '@/lib/smeta/types';
import { toast } from './ui';

export function runExport(p: Project, kind: 'xlsx' | 'pdf') {
  const demo = Boolean(p.demo);
  if (kind === 'xlsx' && !gateFeature('excelExport', { demo })) return;
  track('export_started', { projectId: p.id, kind, demo });
  try {
    const job = kind === 'xlsx' ? exportExcel(p) : openPrintView(p);
    smeta.addExport(p.id, job);
    track('export_completed', { projectId: p.id, kind, demo, ok: true });
    toast(kind === 'xlsx' ? 'Excel hesabatı hazırdır' : 'PDF sənədi hazırdır');
  } catch {
    track('export_completed', { projectId: p.id, kind, demo, ok: false });
    toast(kind === 'xlsx' ? 'Excel faylı yaradılmadı. Yenidən cəhd edin.' : 'PDF sənədi açılmadı. Brauzerdə yeni pəncərələrə icazə verin.');
  }
}
