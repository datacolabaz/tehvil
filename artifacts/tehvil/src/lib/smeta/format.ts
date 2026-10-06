const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const NBSP = '\u00a0';

/** Azerbaijani grouping with spaces and a decimal comma: 24 860 / 1 234,50 */
export function num(value: number, fraction: 0 | 1 | 2 | 'auto' = 'auto'): string {
  const v = Number.isFinite(value) ? value : 0;
  const digits = fraction === 'auto' ? (Math.abs(v - Math.round(v)) < 0.005 ? 0 : 2) : fraction;
  const fixed = Math.abs(v).toFixed(digits);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = v < 0 && Number(fixed) !== 0 ? '−' : '';
  return `${sign}${grouped}${dec ? `,${dec}` : ''}`;
}

/** "24 860 AZN" */
export function azn(value: number, fraction: 0 | 1 | 2 | 'auto' = 0): string {
  return `${num(value, fraction)}${NBSP}AZN`;
}

/** "+780 AZN" / "−120 AZN" */
export function signedAzn(value: number): string {
  if (value > 0) return `+${azn(value)}`;
  return azn(value);
}

export function pct(value: number, fraction: 0 | 1 = 0): string {
  return `${num(value * 100, fraction)}%`;
}

function toDate(value: string | Date): Date | null {
  const d = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "04 oktyabr 2026" */
export function dateAz(value?: string | Date | null): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "04 okt" */
export function dateShortAz(value?: string | Date | null): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "04 oktyabr 2026, 14:20" */
export function dateTimeAz(value?: string | Date | null): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${dateAz(d)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Parses user input such as "1 234,5" or "1234.5". Returns null for invalid input. */
export function parseNumber(input: string): number | null {
  const cleaned = input.replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysISO(date: string, days: number): string {
  const d = toDate(date) ?? new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}
