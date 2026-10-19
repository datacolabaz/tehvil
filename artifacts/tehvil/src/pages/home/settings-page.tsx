import { Link } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import { BellRing, Building2, ChevronRight, HardHat, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { useGetMyRoles } from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { LanguagePicker } from '@/components/language-picker';
import type { Lang } from '@/lib/i18n';

/**
 * Parametrlər: account, language and the older modules that are no longer in the main menu
 * (they keep working and keep their data — they are just not part of the main flow).
 */
export function SettingsPage({ lang, change }: { lang: Lang; change: (v: Lang) => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const roles = useGetMyRoles({ query: { queryKey: ['/api/me/roles'] } });
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <>
    <PageHeading eyebrow="Hesab" title="Parametrlər" />
    <section className="surface hp-section">
      <h2><UserRound size={15} className="sm-ii" /> Hesab</h2>
      <p className="hp-text">{user?.primaryEmailAddress?.emailAddress ?? '—'}</p>
      <div className="field"><span>Dil</span><LanguagePicker lang={lang} change={change} /></div>
      <p className="rl-hint">Hesabınızın ayrıca rolu yoxdur. Kimin nə görə və dəyişə biləcəyi hər evdə “Paylaşım və giriş” bölməsində təyin olunur.</p>
    </section>
    <section className="surface hp-section">
      <h2>Digər bölmələr</h2>
      <ul className="hp-settings-links">
        <li><Link href="/invitations"><BellRing size={16} /><span><b>Bildirişlər və dəvətlər</b><small>Sizi evə və ya işə dəvət ediblərsə</small></span><ChevronRight size={15} /></Link></li>
        <li><Link href="/workers"><HardHat size={16} /><span><b>Usta kimi profil</b><small>İstəyə bağlı — başqasının evində iş görürsünüzsə</small></span><ChevronRight size={15} /></Link></li>
        {roles.data?.isPerformer && <li><Link href="/my-works"><HardHat size={16} /><span><b>Başqa evlərdə gördüyüm işlər</b><small>Dəvət olunduğunuz işlər</small></span><ChevronRight size={15} /></Link></li>}
        {roles.data?.hasProjects && <li><Link href="/dashboard"><LayoutDashboard size={16} /><span><b>Köhnə təmir layihələri</b><small>Əvvəlki versiyadakı layihələriniz — məlumatlar saxlanılır</small></span><ChevronRight size={15} /></Link></li>}
        <li><Link href="/realtor"><Building2 size={16} /><span><b>Realtor paneli</b><small>Əsas məhsulun hissəsi deyil; mövcud məlumatlar saxlanılır</small></span><ChevronRight size={15} /></Link></li>
      </ul>
    </section>
    <button type="button" className="button button-secondary hp-big" onClick={() => signOut({ redirectUrl: base || '/' })}><LogOut size={16} />Çıxış</button>
  </>;
}
