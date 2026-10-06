import { exportExcel, openPrintView } from '@/lib/smeta/export';
import { smeta } from '@/lib/smeta/store';
import type { Project } from '@/lib/smeta/types';
import { toast } from './ui';

export function runExport(p: Project, kind: 'xlsx' | 'pdf') {
  try {
    const job = kind === 'xlsx' ? exportExcel(p) : openPrintView(p);
    smeta.addExport(p.id, job);
    toast(kind === 'xlsx' ? 'Excel hesabatı hazırdır' : 'PDF sənədi hazırdır');
  } catch {
    toast(kind === 'xlsx' ? 'Excel faylı yaradılmadı. Yenidən cəhd edin.' : 'PDF sənədi açılmadı. Brauzerdə yeni pəncərələrə icazə verin.');
  }
}
