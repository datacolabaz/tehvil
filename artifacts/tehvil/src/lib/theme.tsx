import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
export type Theme = 'light' | 'dark';
const KEY = 'tehvil-theme';
function initial(): Theme {
  try { const v = localStorage.getItem(KEY); if (v === 'dark' || v === 'light') return v; return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => { const r = document.documentElement; r.classList.toggle('dark', theme === 'dark'); r.style.colorScheme = theme; }, [theme]);
  useEffect(() => { const on = (e: StorageEvent) => { if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) setTheme(e.newValue); }; window.addEventListener('storage', on); return () => window.removeEventListener('storage', on); }, []);
  const toggle = useCallback(() => setTheme(old => { const n = old === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(KEY, n); } catch { /* storage unavailable */ } return n; }), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
