import type { Lang } from './i18n';
export const uiCopy = {
  az: {
    authWorkspace: 'BAKI · LAYİHƏ MƏKANI', authAlreadyAccount: 'Artıq hesabınız var?', authNoAccount: 'Hələ hesabınız yoxdur?',
    themeToLight: 'İşıqlı rejimə keç', themeToDark: 'Tünd rejimə keç', themeLight: 'İşıqlı', themeDark: 'Tünd',
    footerLabel: 'Sayt məlumatı', footerSupport: 'Texniki dəstək', footerSupportWhatsApp: 'WhatsApp ilə yazın: 050 306 66 26',
    footerShare: 'Təhvil-i paylaş', footerShareWhatsApp: 'WhatsApp-da paylaş', footerShareTelegram: 'Telegram-da paylaş',
    footerShareText: 'Təhvil: təmir zamanı aydın razılaşma, dəyişikliklər və təhvil qeydləri.', footerRights: 'Bütün hüquqlar qorunur.',
    authTools: 'Görünüş və dil',
  },
  ru: {
    authWorkspace: 'БАКУ · ПРОЕКТНОЕ ПРОСТРАНСТВО', authAlreadyAccount: 'Уже есть аккаунт?', authNoAccount: 'Ещё нет аккаунта?',
    themeToLight: 'Включить светлую тему', themeToDark: 'Включить тёмную тему', themeLight: 'Светлая', themeDark: 'Тёмная',
    footerLabel: 'Информация о сайте', footerSupport: 'Техподдержка', footerSupportWhatsApp: 'Напишите в WhatsApp: 050 306 66 26',
    footerShare: 'Поделиться Təhvil', footerShareWhatsApp: 'Поделиться в WhatsApp', footerShareTelegram: 'Поделиться в Telegram',
    footerShareText: 'Təhvil: ясные договорённости, изменения и передача работ при ремонте.', footerRights: 'Все права защищены.',
    authTools: 'Тема и язык',
  },
  en: {
    authWorkspace: 'BAKU · PROJECT SPACE', authAlreadyAccount: 'Already have an account?', authNoAccount: 'Don’t have an account yet?',
    themeToLight: 'Switch to light mode', themeToDark: 'Switch to dark mode', themeLight: 'Light', themeDark: 'Dark',
    footerLabel: 'Site information', footerSupport: 'Technical support', footerSupportWhatsApp: 'Message us on WhatsApp: 050 306 66 26',
    footerShare: 'Share Təhvil', footerShareWhatsApp: 'Share on WhatsApp', footerShareTelegram: 'Share on Telegram',
    footerShareText: 'Təhvil: clear agreements, changes and handovers during renovation.', footerRights: 'All rights reserved.',
    authTools: 'Theme and language',
  },
} as const;
export type UiKey = keyof typeof uiCopy.en;
export const uiT = (lang: Lang, key: UiKey): string => uiCopy[lang][key];
