import type { Lang } from './i18n';
export function getLanguage(): Lang {
  try {
    const value = localStorage.getItem('tehvil-language');
    return value === 'ru' || value === 'en' ? value : 'az';
  } catch { return 'az'; }
}
export function storeLanguage(lang: Lang) {
  try { localStorage.setItem('tehvil-language', lang); } catch { /* State still changes when browser storage is disabled. */ }
  document.documentElement.lang = lang;
}