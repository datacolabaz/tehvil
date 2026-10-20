import { useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight, Calculator, Camera, Check, ChevronDown, ClipboardCheck, FileText, Gauge, House, KeyRound, Link2, Lock, Menu, MessageCircle, ShieldCheck, Smartphone, X,
} from 'lucide-react';
import { Brand } from '@/components/kit';
import { LanguagePicker } from '@/components/language-picker';
import { Partners } from '@/components/partners';
import type { Lang } from '@/lib/i18n';
import './landing.css';

/**
 * Landing page (Azerbaijani): the handover protocol up front.
 * The visitor first says who they are; sign-in is asked only when a protocol is created or approved.
 * Nothing here presents the account approval as a legal e-signature.
 */
type Role = 'landlord' | 'tenant' | 'manager';
const ROLES: { id: Role; label: string; text: string; rol: string }[] = [
  { id: 'landlord', label: 'Ev sahibi', rol: 'landlord', text: 'Kirayəçi köçməzdən əvvəl mənzili otaq-otaq foto ilə qeydə alın, kirayəçini linklə dəvət edin. Çıxışda eyni siyahı ilə müqayisə edirsiniz.' },
  { id: 'tenant', label: 'Kirayəçi', rol: 'tenant', text: 'Köçəndə mövcud ləkə, zədə və nasazlıqları qeyd edin ki, çıxışda onlar sizin adınıza yazılmasın. Ev sahibinin göndərdiyi linki də aça bilərsiniz.' },
  { id: 'manager', label: 'Əmlak meneceri', rol: 'landlord', text: 'Bir neçə mənzili idarə edirsiniz? Bütün kirayələr, giriş və çıxış protokolları bir siyahıda — hansının təsdiq gözlədiyi dərhal görünür.' },
];

const IN_PROTOCOL = [
  [<Camera size={17} key="c" />, 'Otaq-otaq: divar, döşəmə, tavan, pəncərə, qapı, mebel və avadanlıq — vəziyyət, qeyd və foto'],
  [<ShieldCheck size={17} key="q" />, 'Mövcud zədə, ləkə və nasazlıqlar giriş günü qeydə alınır; foto yükləmə vaxtını server yazır'],
  [<Gauge size={17} key="g" />, 'Su, qaz və elektrik sayğacları girişdə və çıxışda — fərqi ilə'],
  [<KeyRound size={17} key="k" />, 'Verilən və qaytarılan açarlar, pultlar, kartlar'],
  [<Check size={17} key="a" />, 'Ev sahibi və kirayəçinin ayrıca təsdiq statusu, versiya tarixçəsi'],
  [<FileText size={17} key="f" />, 'Giriş və çıxışın müqayisəli PDF hesabatı — WhatsApp-da paylaşmaq olur'],
] as const;

const FAQ = [
  { q: 'Depozitin qaytarılması təmin olunurmu?', a: 'Xeyr. Tehvil.az kimin haqlı olduğunu müəyyən etmir və depozit barədə qərar vermir. O, giriş və çıxışda mənzilin vəziyyətini hər iki tərəfin gördüyü və təsdiqlədiyi şəkildə qeydə alır — mübahisə yaranarsa, faktlar əvvəlcədən sənədləşdirilmiş olur.' },
  { q: 'Çıxış protokolu necə işləyir?', a: 'Eyni kirayə qeydindən yaradılır: girişdəki otaqlar, əşyalar və fotolar avtomatik gəlir. Hər element üçün yenisini çəkib “dəyişməyib”, “yeni zədə”, “əvvəlki zədə dəyişib”, “təmizlənib” və ya “çatışmır” seçirsiniz. Sayğaclar və açarlar yenidən qeyd olunur, fərq göstərilir.' },
  { q: 'Qeydiyyat lazımdırmı?', a: 'Kirayə qeydini yaratmaq üçün hesab lazımdır. Sizə göndərilən linki açıb qeydiyyatsız baxa bilərsiniz; təsdiq etmək üçün isə daxil olursunuz.' },
  { q: 'Linki başqası ələ keçirsə nə olur?', a: 'Link özü təsdiq hüququ vermir. Linkdən yalnız bir hesab qoşula bilir; linki göndərən onu istənilən vaxt ləğv edib yenisini yarada bilər. Linkin “yalnız baxış və təsdiq” və ya “foto və qeyd əlavə edə bilər” icazəsini seçirsiniz.' },
  { q: 'Fotonun nə vaxt çəkildiyi necə bilinir?', a: 'Yükləmə vaxtını server qeyd edir və onu dəyişmək olmur. Çəkilmə vaxtı fotonun öz məlumatından götürülür və “cihazın məlumatı” kimi ayrıca göstərilir — bəzi telefonlar bu məlumatı saxlamır.' },
  { q: 'Təsdiqdən sonra protokol dəyişdirilə bilərmi?', a: 'Səssizcə yox. Təsdiqə göndərilən məzmun versiya kimi dondurulur. Dəyişiklik lazım olsa, yeni versiya yaranır və tərəflər onu yenidən təsdiqləyir; əvvəlki versiya və onun təsdiqləri saxlanılır.' },
  { q: 'Bu, hüquqi sənəddirmi?', a: 'Hesabat tərəflərin faktiki vəziyyəti necə qeydə aldığını və bunu öz hesabları ilə təsdiqlədiklərini göstərir; avtomatik hüquqi qərar və ya məsuliyyət müəyyən edən sənəd deyil. Hesab üzərindən təsdiq ixtisaslı elektron imza deyil. Mübahisə məsələlərində hüquqşünasla məsləhətləşin.' },
  { q: 'Fotolar kimə görünür?', a: 'Yalnız protokolun iştirakçılarına və aktiv dəvət linki olan şəxsə. Fotolar açıq internetdə yerləşdirilmir və axtarış sistemlərində görünmür.' },
  { q: 'Ayrıca tətbiq yükləmək lazımdırmı?', a: 'Xeyr. Tehvil.az telefonun brauzerində işləyir: iPhone-da Safari, Android-də Chrome. Foto çəkmək üçün telefonun öz kamerası açılır.' },
  { q: 'Qiyməti nədir?', a: 'Hazırda ödəniş tələb olunmur və saytda ödəniş mexanizmi yoxdur. Gələcəkdə ödənişli imkanlar olarsa, əvvəlcədən aydın göstəriləcək.' },
];

export function HomePassportLanding({ lang, change }: { lang: Lang; change: (v: Lang) => void }) {
  const [menu, setMenu] = useState(false);
  const [role, setRole] = useState<Role>('landlord');
  const nav = [['#how', 'Necə işləyir'], ['#inside', 'Nə qeydə alınır'], ['#faq', 'Suallar'], ['#tools', 'Digər alətlər']];
  const current = ROLES.find((r) => r.id === role)!;
  return <div className="lp">
    <header className="lp-nav wrap">
      <Brand />
      <nav className={`lp-links ${menu ? 'open' : ''}`} aria-label="Bölmələr">{nav.map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)}>{l}</a>)}<Link href="/sign-in" className="lp-signin-m">Daxil ol</Link></nav>
      <div className="lp-actions"><LanguagePicker lang={lang} change={change} /><Link href="/sign-in" className="text-link lp-signin">Daxil ol</Link><Link href="/kiraye/yeni" className="button button-primary lp-signup" data-testid="landing-signup">Başla</Link>
        <button type="button" className="lp-burger" aria-label="Menyu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button></div>
    </header>

    <section className="lp-hero2 lp-hero-pt wrap">
      <div className="lp-hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" />Tehvil.az</div>
        <h1 className="font-display">Depozitlə bağlı mübahisə riskini azaldın. Mənzilin vəziyyətini əvvəlcədən qeydə alın.</h1>
        <p>Kirayənin əvvəlində otaq-otaq giriş protokolu, sonunda eyni siyahı ilə çıxış protokolu və müqayisə. Ev sahibi və kirayəçi eyni sənədi təsdiqləyir.</p>
        <div className="lp-roles" role="radiogroup" aria-label="Siz kimsiniz?" data-testid="landing-roles">
          {ROLES.map((r) => <button key={r.id} type="button" role="radio" aria-checked={role === r.id} className={role === r.id ? 'on' : ''} onClick={() => setRole(r.id)} data-testid={`landing-role-${r.id}`}>{r.label}</button>)}
        </div>
        <p className="lp-role-text" data-testid="landing-role-text">{current.text}</p>
        <div className="lp-svc-ctas">
          <Link href={`/kiraye/yeni?rol=${current.rol}`} className="button button-primary lp-big" data-testid="cta-protocol"><ClipboardCheck size={17} />Giriş protokolunu başlat<ArrowRight size={16} /></Link>
          {role !== 'manager' && <a href="#link" className="button button-secondary lp-big" data-testid="cta-have-link"><Link2 size={16} />Mənə link göndərilib</a>}
        </div>
        <p className="lp-honest"><ShieldCheck size={16} />Tehvil.az kimin haqlı olduğunu müəyyən etmir və depozitin qaytarılmasına zəmanət vermir — faktları ardıcıl və şəffaf qeydə alır. Təsdiq ixtisaslı elektron imza deyil.</p>
      </div>
      <ProtocolArt />
    </section>

    <section className="lp-section wrap" id="how">
      <div className="lp-head"><div className="eyebrow">Necə işləyir</div><h2 className="font-display">Girişdə qeyd edin, çıxışda müqayisə edin.</h2></div>
      <ol className="lp-steps4">
        {[['Kirayə qeydi', 'Ünvan kifayətdir. Tarixlər, kirayə, depozit və tərəflər məcburi deyil.'],
          ['Giriş protokolu', 'Otaq-otaq vəziyyət, mövcud zədələr, foto, sayğaclar və açarlar.'],
          ['İki tərəf təsdiqləyir', 'Kirayəçi linki açır, yoxlayır və təsdiqləyir və ya düzəliş istəyir.'],
          ['Çıxış və müqayisə', 'Girişdəki siyahı avtomatik gəlir; dəyişiklikləri qeyd edin, müqayisəli PDF alın.']].map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><b>{t}</b><p>{d}</p></div></li>)}
      </ol>
    </section>

    <section className="lp-section wrap" id="inside">
      <div className="lp-head"><div className="eyebrow">Nə qeydə alınır</div><h2 className="font-display">Depozit söhbətində soruşulan hər şey.</h2></div>
      <ul className="lp-points lp-points-grid">{IN_PROTOCOL.map(([i, t]) => <li key={String(t)}>{i}<span>{t}</span></li>)}</ul>
    </section>

    <section className="lp-section wrap" id="link">
      <div className="lp-link-card">
        <MessageCircle size={22} />
        <div><h2 className="font-display">Sizə link göndərilib?</h2>
          <p>Ev sahibi, kirayəçi və ya menecer kirayə qeydinin linkini WhatsApp və ya SMS ilə göndərir. Linki açın: giriş və ya çıxış protokolunu qeydiyyatsız görəcəksiniz. Təsdiqləmək və ya düzəliş istəmək üçün telefonunuzla daxil olun — link sizi geri qaytaracaq.</p>
          <p className="lp-small">Linki itirmisinizsə, göndərəndən yenisini istəyin: köhnə link avtomatik ləğv olunur.</p></div>
      </div>
    </section>

    <section className="lp-section wrap lp-trust">
      <div className="lp-head"><div className="eyebrow">Etibar</div><h2 className="font-display">Sadə, amma səssiz dəyişikliyə yer yoxdur.</h2></div>
      <div className="lp-why-grid light">
        {[[<Lock size={20} key="l" />, 'Məxfi', 'Protokolu yalnız iştirakçılar və aktiv link sahibi görür. Fotolar açıq internetdə yerləşdirilmir.'],
          [<ShieldCheck size={20} key="s" />, 'Neytral', 'Sistem zərəri kimin yaratdığını təxmin etmir: girişdə nə vardı, çıxışda nə var — yan-yana.'],
          [<Check size={20} key="c" />, 'Kim, nə vaxt', 'Hər təsdiqin hesabı, tarix-saatı və təsdiqlənən versiyanın izi saxlanılır.'],
          [<Smartphone size={20} key="m" />, 'Tətbiqsiz', 'Telefonun brauzerində işləyir: iPhone Safari və Android Chrome.']].map(([i, t, d]) =>
          <div key={String(t)} className="lp-why-item"><span>{i}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div>
    </section>

    <section className="lp-section wrap lp-faq" id="faq">
      <div className="lp-head"><div className="eyebrow">Suallar</div><h2 className="font-display">Tez-tez verilən suallar</h2></div>
      <div>{FAQ.map((f) => <details key={f.q} className="lp-faq-item"><summary>{f.q}<ChevronDown size={17} /></summary><p>{f.a}</p></details>)}</div>
    </section>

    <section className="lp-section wrap" id="tools">
      <div className="lp-head"><div className="eyebrow">Digər alətlər</div><h2 className="font-display">Təhvildən sonra da işinizə yarayar.</h2></div>
      <div className="lp-tools">
        <Link href="/homes" className="lp-tool" data-testid="tool-passport"><House size={20} /><span><b>Ev pasportu</b><small>Otaqlar, avadanlıq, gizli xətlər, təmir tarixçəsi</small></span><ArrowRight size={15} /></Link>
        <Link href="/ai-smeta" className="lp-tool" data-testid="tool-smeta"><Calculator size={20} /><span><b>AI smeta</b><small>Təmir və tikinti xərclərinin ilkin hesablanması</small></span><ArrowRight size={15} /></Link>
        <Link href="/protokol/yeni" className="lp-tool" data-testid="tool-sale"><ClipboardCheck size={20} /><span><b>Alqı-satqı təhvili</b><small>Mənzil satılanda satıcı və alıcı üçün təhvil protokolu</small></span><ArrowRight size={15} /></Link>
      </div>
    </section>

    <section className="lp-final wrap"><div>
      <ClipboardCheck size={22} />
      <h2 className="font-display">Növbəti kirayəni qeydə alaraq başlayın.</h2>
      <p>Pulsuzdur. Ayrıca tətbiq lazım deyil.</p>
      <div className="lp-svc-ctas center"><Link href="/kiraye/yeni" className="button button-primary lp-big" data-testid="cta-final">Kirayə qeydini başlat<ArrowRight size={16} /></Link></div>
    </div></section>

    <Partners lang={lang} />
    <footer className="landing-footer wrap"><Brand /><p>Tehvil.az — kirayə mənzillərinin giriş və çıxış vəziyyətini sənədləşdirən və müqayisə edən platforma. Təqsir müəyyən etmir, depozitə zəmanət vermir; hesabdakı təsdiq audit qeydidir, ixtisaslı elektron imza deyil.</p><LanguagePicker lang={lang} change={change} />
      <nav className="landing-legal" aria-label="Bələdçilər"><a href="/menzil-tehvil-teslim-akti.html">Mənzil təhvil-təslim aktı</a><a href="/ev-temiri-ve-tikinti-smetasi.html">Təmir və tikinti smetası</a><a href="/temir-tehvil-akti.html">Təmir işlərinin təhvil aktı</a><a href="/temir-islerinin-qebulu.html">Təmir işlərinin qəbulu</a><a href="/podratci-ile-razilasma.html">Podratçı ilə razılaşma</a><a href="/temir-elave-isler.html">Əlavə işlər və dəyişikliklər</a></nav>
      <nav className="landing-legal"><a href="/privacy.html">Məxfilik siyasəti</a><a href="/terms.html">İstifadə şərtləri</a></nav>
      <address className="landing-contact"><a href="mailto:support@tehvil.az">support@tehvil.az</a><a href="tel:+994503066626">+994 50 306 66 26</a><a href="https://wa.me/994503066626" target="_blank" rel="noopener noreferrer">WhatsApp</a><span>Bakı, Səbail rayonu, Badamdar qəsəbəsi, 26-cı küçə, 20</span></address>
    </footer>
  </div>;
}

/** A phone showing a protocol in progress. Labelled as an example. */
function ProtocolArt() {
  return <div className="lp-phone" aria-hidden="true">
    <div className="lp-mock-tag">Nümunə protokol</div>
    <div className="lp-phone-screen">
      <small>Çıxış protokolu · Xətai, Babək pr. 20</small>
      <div className="lp-ph-progress"><span style={{ width: '66%' }} /></div>
      {[['Divarlar', 'Girişdə: kiçik ləkə · indi: dəyişməyib', 'ok'], ['Döşəmə', 'Yeni zədə · 2 foto', 'bad'], ['Divan', 'Təmizlənib', 'mid'], ['Stul (4)', 'yoxlanmayıb', '']].map(([n, s, c]) =>
        <div key={n} className={`lp-ph-room ${c}`}><i>{c ? <Check size={11} /> : null}</i><span><b>{n}</b><small>{s}</small></span></div>)}
      <div className="lp-ph-row"><Gauge size={13} />Su: 120,5 → 131,0 (fərq 10,5)</div>
      <div className="lp-ph-row"><KeyRound size={13} />Açar: verilib 2 · qaytarılır 2</div>
      <div className="lp-ph-sign"><span className="ok">Ev sahibi ✓</span><span>Kirayəçi …</span></div>
      <div className="lp-ph-btn"><Camera size={14} />Foto çək</div>
    </div>
  </div>;
}
