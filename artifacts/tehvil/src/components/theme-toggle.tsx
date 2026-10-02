import { Moon, Sun } from 'lucide-react';
import type { Lang } from '@/lib/i18n';
import { uiT } from '@/lib/i18n-ui';
import { useTheme } from '@/lib/theme';
export function ThemeToggle({ lang }: { lang: Lang }) {
  const { theme, toggle } = useTheme();
  const label = uiT(lang, theme === 'dark' ? 'themeToLight' : 'themeToDark');
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label} data-testid="button-theme-toggle">{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}</button>;
}
