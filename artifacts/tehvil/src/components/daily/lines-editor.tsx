import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { azn, LINE_CATEGORIES } from '@/lib/finance/api';
import './daily.css';

/*
 * Material and work lines of a day: name, category, quantity, unit, unit price, total, note, paid / not paid.
 * The amount is quantity × unit price when both are known; otherwise the person types the total.
 * Nothing is guessed: a line without an amount is marked and blocks saving.
 */

export interface DayLine {
  key: string; name: string; category: string; quantity: string; unit: string; unitPrice: string; lineTotal: string; note: string; paid: boolean;
  /** Set when AI read it with low confidence. */
  weak?: boolean;
  /** The receipt's own line total when it differs from quantity × price. */
  receiptTotal?: string | null;
}

const UNITS = ['ədəd', 'kisə', 'ton', 'kq', 'm', 'm²', 'm³', 'l', 'gün', 'saat', 'reys', 'dəst'];
export const num = (s: string) => { const t = String(s ?? '').replace(/\s/g, '').replace(',', '.'); if (!t) return null; const v = Number(t); return Number.isFinite(v) && v >= 0 ? v : NaN; };
/** Amount of a line in qəpik, or null when it is not known yet. */
export function lineCents(l: Pick<DayLine, 'quantity' | 'unitPrice' | 'lineTotal'>): number | null {
  const q = num(l.quantity), p = num(l.unitPrice);
  if (q != null && p != null && !Number.isNaN(q) && !Number.isNaN(p)) return Math.round(q * p * 100);
  const t = num(l.lineTotal);
  return t == null || Number.isNaN(t) ? null : Math.round(t * 100);
}
export const computed = (l: DayLine) => { const q = num(l.quantity), p = num(l.unitPrice); return q != null && p != null && !Number.isNaN(q) && !Number.isNaN(p); };
export const newLine = (p: Partial<DayLine> = {}): DayLine => ({ key: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: '', category: 'building_materials', quantity: '', unit: '', unitPrice: '', lineTotal: '', note: '', paid: true, ...p });
export const lineProblem = (l: DayLine): string | null => {
  if (!l.name.trim()) return 'adı yazın';
  if (Number.isNaN(num(l.quantity) as number) || Number.isNaN(num(l.unitPrice) as number) || Number.isNaN(num(l.lineTotal) as number)) return 'rəqəmləri yoxlayın';
  if (lineCents(l) == null) return 'məbləği yazın';
  return null;
};
const fixed = (c: number) => (c / 100).toFixed(2).replace('.', ',');
/** "2.000" → "2", "0.500" → "0,5" */
export const qtyText = (q: string | null | undefined) => (q == null || q === '' ? '—' : String(Number(q)).replace('.', ','));

export function LinesEditor({ lines, onChange, showPaid = true, testid = 'day' }: { lines: DayLine[]; onChange: (l: DayLine[]) => void; showPaid?: boolean; testid?: string }) {
  const set = (k: string, p: Partial<DayLine>) => onChange(lines.map((l) => (l.key === k ? { ...l, ...p, weak: false } : l)));
  return <div className="dl-lines" data-testid={`${testid}-lines`}>
    {lines.map((l, i) => {
      const auto = computed(l);
      const cents = lineCents(l);
      const problem = l.name || l.quantity || l.unitPrice || l.lineTotal ? lineProblem(l) : null;
      const receiptDiff = l.receiptTotal && cents != null && Math.round(Number(l.receiptTotal) * 100) !== cents;
      return <div key={l.key} className={`dl-line ${l.weak ? 'weak' : ''} ${problem ? 'bad' : ''}`} data-testid={`${testid}-line`}>
        <div className="dl-row1">
          <span className="dl-no">{i + 1}</span>
          <input className="dl-name" value={l.name} onChange={(e) => set(l.key, { name: e.target.value })} placeholder="Məhsul və ya iş, məs. Sement M400" aria-label="Məhsulun və ya işin adı" data-testid={`${testid}-name`} />
          <button type="button" className="icon-button" aria-label="Sətri sil" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} data-testid={`${testid}-remove`}><Trash2 size={15} /></button>
        </div>
        <select value={l.category} onChange={(e) => set(l.key, { category: e.target.value })} aria-label="Kateqoriya" data-testid={`${testid}-cat`}>
          <optgroup label="Material">{LINE_CATEGORIES.filter((c) => c[2] === 'material').map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</optgroup>
          <optgroup label="İş və ödənişlər">{LINE_CATEGORIES.filter((c) => c[2] !== 'material').map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</optgroup>
        </select>
        <div className="dl-nums">
          <label><span>Miqdar</span><input inputMode="decimal" value={l.quantity} onChange={(e) => set(l.key, { quantity: e.target.value })} placeholder="50" data-testid={`${testid}-qty`} /></label>
          <label><span>Vahid</span><input list="dl-units" value={l.unit} onChange={(e) => set(l.key, { unit: e.target.value })} placeholder="kisə" data-testid={`${testid}-unit`} /></label>
          <label><span>Vahid qiymət</span><input inputMode="decimal" value={l.unitPrice} onChange={(e) => set(l.key, { unitPrice: e.target.value })} placeholder="9,50" data-testid={`${testid}-price`} /></label>
          <label className="dl-total"><span>{auto ? 'Ümumi məbləğ · miqdar × qiymət' : 'Ümumi məbləğ'}</span>
            {auto ? <output data-testid={`${testid}-line-total`}>{azn(cents)}</output>
              : <input inputMode="decimal" value={l.lineTotal} onChange={(e) => set(l.key, { lineTotal: e.target.value })} placeholder="0,00" data-testid={`${testid}-total-input`} />}
          </label>
        </div>
        <div className="dl-row3">
          <input className="dl-note" value={l.note} onChange={(e) => set(l.key, { note: e.target.value })} placeholder="Qeyd (istəyə bağlı)" aria-label="Qeyd" />
          {showPaid && <div className="rl-seg dl-paid" role="radiogroup" aria-label="Ödəniş">
            <button type="button" role="radio" aria-checked={l.paid} className={l.paid ? 'on' : ''} onClick={() => set(l.key, { paid: true })} data-testid={`${testid}-paid-yes`}>Ödənilib</button>
            <button type="button" role="radio" aria-checked={!l.paid} className={!l.paid ? 'on' : ''} onClick={() => set(l.key, { paid: false })} data-testid={`${testid}-paid-no`}>Ödənilməyib</button>
          </div>}
        </div>
        {!auto && !l.lineTotal && (l.quantity || l.unitPrice) && <small className="dl-hint">Vahid qiyməti bilmirsinizsə, ümumi məbləği yazın</small>}
        {l.weak && <small className="dl-warn"><AlertTriangle size={12} />AI bu sətri zəif oxuyub — qaimə ilə yoxlayın</small>}
        {receiptDiff && <small className="dl-warn"><AlertTriangle size={12} />Qaimədə bu sətir {l.receiptTotal} AZN-dir, miqdar × qiymət isə {fixed(cents!)} — hansı düzdür, yoxlayın</small>}
        {problem && <small className="dl-err" role="alert">{problem === 'məbləği yazın' ? 'Məbləğ məlum deyil — miqdar və vahid qiyməti və ya ümumi məbləği yazın' : `Bu sətirdə ${problem}`}</small>}
      </div>;
    })}
    <datalist id="dl-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    <button type="button" className="button button-secondary dl-add" onClick={() => onChange([...lines, newLine({ category: lines[lines.length - 1]?.category ?? 'building_materials', paid: lines[lines.length - 1]?.paid ?? true })])} data-testid={`${testid}-add`}><Plus size={15} />Material və ya iş əlavə et</button>
  </div>;
}

/** The day's totals: all, paid and unpaid, material vs work. */
export function DayTotals({ lines, discount = 0, tax = 0 }: { lines: DayLine[]; discount?: number; tax?: number }) {
  const sum = (f: (l: DayLine) => boolean) => lines.filter(f).reduce((s, l) => s + (lineCents(l) ?? 0), 0);
  const group = (k: string) => LINE_CATEGORIES.find((c) => c[0] === k)?.[2] ?? 'other';
  const linesTotal = sum(() => true), total = linesTotal - discount + tax, unpaid = sum((l) => !l.paid);
  const mat = sum((l) => group(l.category) === 'material'), lab = sum((l) => group(l.category) === 'labor');
  if (!lines.length) return null;
  return <div className="dl-totals" data-testid="day-totals">
    <div className="dl-total-main"><span>Günün ümumi xərci</span><b data-testid="day-total">{azn(total)}</b></div>
    <div className="dl-total-split">
      <span>Material: <b>{azn(mat)}</b></span><span>Usta və işlər: <b>{azn(lab)}</b></span>{linesTotal - mat - lab > 0 && <span>Digər: <b>{azn(linesTotal - mat - lab)}</b></span>}
      {(discount > 0 || tax > 0) && <span>Sətirlər {azn(linesTotal)}{discount > 0 ? ` − endirim ${azn(discount)}` : ''}{tax > 0 ? ` + vergi ${azn(tax)}` : ''}</span>}
      {unpaid > 0 && <span className="dl-unpaid">Ödənilməyib: <b data-testid="day-unpaid">{azn(unpaid)}</b></span>}
    </div>
  </div>;
}
