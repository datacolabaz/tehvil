/*
 * The common shape of a calculator result, so it can later be attached to a home, a construction stage or the
 * expense journal ("Evimin xərcləri" lines take name, quantity, unit, unit price and category) without re-calculating.
 * Today it feeds the on-screen material list, the shared text and the copy kept in the browser.
 */
export interface MaterialListItem {
  name: string;
  qty: number;
  unit: string;
  /** AZN per unit as the person entered it; null = not given (no cost is invented). */
  unitPrice: number | null;
  cost: number | null;
  /** Category key of "Evimin xərcləri" this line would go to. */
  expenseCategory: 'concrete' | 'building_materials' | 'labor' | 'other';
  note?: string;
}
export interface CalcRecord {
  calculator: 'masonry' | 'plaster';
  /** Construction stage key (photo stages use the same words). */
  stage: 'masonry' | 'plaster';
  createdAt: string;
  inputs: unknown;
  materials: MaterialListItem[];
  assumptions: string[];
}

export function loadState<T>(key: string): T | null {
  try { const v = localStorage.getItem(`tehvil-calc:${key}`); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
export function saveState(key: string, v: unknown) { try { localStorage.setItem(`tehvil-calc:${key}`, JSON.stringify(v)); } catch { /* storage unavailable */ } }
export function clearState(key: string) { try { localStorage.removeItem(`tehvil-calc:${key}`); } catch { /* storage unavailable */ } }
