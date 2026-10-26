import { Plus, X } from 'lucide-react';
import { az, parseNum } from '@/lib/calc/construction';
import type { MaterialListItem } from '@/lib/calc/materials';
import { NumInput } from './calc-pages';

/* Pieces shared by the wall calculators (hörgü, suvaq): door / window list and the material list. */

export const newKey = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Typed text → number; empty or not a number → NaN (the calculators refuse it with a message). */
export const num = (s: string) => { const v = parseNum(s); return v == null ? NaN : v; };
export const numOrNull = (s: string) => { const v = parseNum(s); return v == null || Number.isNaN(v) ? null : v; };

export interface OpeningS { key: string; kind: 'door' | 'window'; count: string; width: string; height: string }

export function OpeningsEditor({ openings, onChange, testid }: { openings: OpeningS[]; onChange: (o: OpeningS[]) => void; testid: string }) {
  const set = (key: string, p: Partial<OpeningS>) => onChange(openings.map((o) => (o.key === key ? { ...o, ...p } : o)));
  const add = (kind: OpeningS['kind']) => onChange([...openings, { key: newKey(), kind, count: '1', width: kind === 'door' ? '0,9' : '1,2', height: kind === 'door' ? '2,1' : '1,5' }]);
  return <div className="cx-field cx-openings"><span>Qapı və pəncərələr</span>
    {openings.map((o) => <div key={o.key} className="cx-opening" data-testid={`${testid}-opening`}>
      <b>{o.kind === 'door' ? 'Qapı' : 'Pəncərə'}</b>
      <NumInput label="Say" value={o.count} onChange={(v) => set(o.key, { count: v })} unit="ədəd" testid={`${testid}-o-count`} />
      <NumInput label="En" value={o.width} onChange={(v) => set(o.key, { width: v })} unit="m" testid={`${testid}-o-width`} />
      <NumInput label="Hündürlük" value={o.height} onChange={(v) => set(o.key, { height: v })} unit="m" testid={`${testid}-o-height`} />
      <button type="button" className="icon-button" aria-label="Boşluğu sil" onClick={() => onChange(openings.filter((x) => x.key !== o.key))} data-testid={`${testid}-o-remove`}><X size={16} /></button>
    </div>)}
    <div className="cx-chips">
      <button type="button" onClick={() => add('door')} data-testid={`${testid}-add-door`}><Plus size={14} />Qapı</button>
      <button type="button" onClick={() => add('window')} data-testid={`${testid}-add-window`}><Plus size={14} />Pəncərə</button>
    </div>
    <small className="cx-hint">Hər boşluq ayrıca: say × en × hündürlük. Boşluqlar divarın sahəsindən çıxılır.</small>
  </div>;
}

/** The structured result: what to buy, how much, and its cost when a price was given. */
export function MaterialList({ items, testid }: { items: MaterialListItem[]; testid: string }) {
  if (!items.length) return null;
  return <div className="cx-list" data-testid={testid}>
    <h3>Material siyahısı</h3>
    <ul>{items.map((m) => <li key={m.name}><span>{m.name}{m.note ? <small> · {m.note}</small> : null}</span><b>{az(m.qty, m.unit === 'ədəd' || m.unit === 'kisə' ? 0 : m.unit === 'kq' ? 1 : 3)} {m.unit}</b><em>{m.cost == null ? 'qiymət daxil edilməyib' : `${az(m.cost)} AZN`}</em></li>)}</ul>
  </div>;
}
