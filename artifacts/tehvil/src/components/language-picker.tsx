import { ChevronDown, Languages } from 'lucide-react';
import { copy, type Lang } from '@/lib/i18n';

export function LanguagePicker({ lang, change, compact = false }: { lang: Lang; change: (v: Lang) => void; compact?: boolean }) {
  return <label className={`lang-picker ${compact ? 'compact' : ''}`} aria-label={copy[lang].language}><Languages size={15} /><select data-testid="select-language" value={lang} onChange={e => change(e.target.value as Lang)}><option value="az">AZ</option><option value="ru">RU</option><option value="en">EN</option></select><ChevronDown size={12} /></label>;
}
