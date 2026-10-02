import { enUS, ruRU } from '@clerk/localizations';
import az from './clerk-az.json';
import type { Lang } from './i18n';

export function clerkLocalization(lang: Lang) {
  const resource = lang === 'az' ? az as typeof enUS : lang === 'ru' ? ruRU : enUS;
  const headings = {
    az: { signIn: 'Layihənizə qayıdın', signInNote: 'Daxil olun və işin gedişini izləyin', signUp: 'Təhvil hesabı yaradın', signUpNote: 'Layihəniz üçün ortaq, aydın qeyd sahəsi' },
    ru: { signIn: 'Вернитесь к своему проекту', signInNote: 'Войдите и следите за ходом работ', signUp: 'Создайте аккаунт Təhvil', signUpNote: 'Общие понятные записи о вашем проекте' },
    en: { signIn: 'Return to your project', signInNote: 'Sign in and follow the work', signUp: 'Create your Təhvil account', signUpNote: 'Clear, shared records for your project' },
  }[lang];
  return { ...resource,
    signIn: { ...resource.signIn, start: { ...resource.signIn?.start, title: headings.signIn, subtitle: headings.signInNote } },
    signUp: { ...resource.signUp, start: { ...resource.signUp?.start, title: headings.signUp, subtitle: headings.signUpNote } },
  };
}