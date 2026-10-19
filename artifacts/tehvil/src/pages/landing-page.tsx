import { useState } from 'react';
import { Link } from 'wouter';
import {
  AlertTriangle, ArrowRight, Bell, Calculator, Hammer, Camera, ChevronDown, FileText, HardHat,
  History, House, Layers, Lock, Menu, Search, ShieldCheck, Sparkles, Wrench, X,
} from 'lucide-react';
import { Brand } from '@/components/kit';
import { LanguagePicker } from '@/components/language-picker';
import { Partners } from '@/components/partners';
import type { Lang } from '@/lib/i18n';
import './landing.css';

/**
 * Landing page of the home-passport product (Azerbaijani).
 * Every service card says honestly whether it works today or is still being prepared;
 * nothing here promises a certificate, a guarantee or a price effect.
 */
const PASSPORT_POINTS = [
  [<House size={17} key="r" />, 'Evin və otaqların məlumatları; otaq üzrə avadanlıq (kombi, kondisioner, su filtri…), zəmanət və xidmət tarixləri'],
  [<AlertTriangle size={17} key="d" />, 'Qüsur və nasazlıqların qeydi, onların aradan qaldırılması və hazırda nəyə baxış lazım olduğu'],
  [<Layers size={17} key="l" />, 'Gizli xətlər: elektrik, su, kanalizasiya, qaz, istilik — foto üzərində işarə ilə'],
  [<History size={17} key="h" />, 'Sonradan əlavə edilən və dəyişdirilən hissələrin tarixçəsi: kim, nə vaxt, nəyi dəyişib'],
  [<ShieldCheck size={17} key="c" />, 'Tərəflərin təsdiqi: usta işini qeyd edir, ev sahibi qəbul edir və ya düzəliş istəyir'],
  [<FileText size={17} key="f" />, 'Foto, video, qəbz və sənədlər; seçilmiş hissəni məhdud linklə paylaşmaq və PDF kimi saxlamaq'],
] as const;

const FAQ = [
  { q: 'Məlumatlarım təhlükəsizdirmi? Kim görə bilər?', a: 'Ev məlumatları susmaya görə məxfidir: yalnız siz və dəvət etdiyiniz şəxslər görür. İcazələr serverdə yoxlanılır. Sənədlər, ünvan, xərclər və telefonlar QR kodla heç vaxt açılmır; paylaşım linkində yalnız sizin seçdiyiniz hissə görünür və link istənilən vaxt bağlanır.' },
  { q: 'Təhvil-təslim qeydləri evin vəziyyətini və ya keyfiyyətini təsdiqləyirmi?', a: 'Xeyr. Bu qeydlər rəsmi sertifikat və ya ekspertiza deyil. Hər qeydin yanında onu kimin daxil etdiyi (ev sahibi, usta, podratçı, dəvət olunmuş yoxlayıcı) və sənəd əlavə olunub-olunmadığı göstərilir. Yoxlanılmamış məlumat təsdiqlənmiş texniki fakt kimi təqdim olunmur.' },
  { q: 'Tikinti smetası üçün hansı fayllar qəbul olunur?', a: 'PDF (mətnində yazılan sahə, miqyas, mərtəbə oxunur), JPG/PNG (önizləmə, ölçüləri siz daxil edirsiniz), XLSX və CSV (iş həcmləri və qiymətlər). DWG, DXF, IFC və RVT hələ oxunmur — memardan PDF ixracı və ya ölçü cədvəli istəyin.' },
  { q: 'Tikinti qiymətləri haradan götürülür?', a: 'Təhvil-də tikinti qiymətləri bazası yoxdur və sistem qiymət uydurmur. Vahid qiymətləri podratçı təklifindən, təchizatçıdan və ya yüklədiyiniz cədvəldən daxil edirsiniz; hər sətirdə mənbə və tarix qalır. Qiyməti olmayan sətir “qiymət yoxdur” kimi göstərilir.' },
  { q: 'PDF formatında təhvil aktı yaratmaq olurmu?', a: 'Hazırda ayrıca rəsmi təhvil aktı şablonu yoxdur. Evin seçdiyiniz məlumatlarını (işlər, qüsur və düzəlişlər, avadanlıq, sənədlər) paylaşım səhifəsində toplayıb çap edə və ya PDF kimi saxlaya bilərsiniz.' },
  { q: 'Qiyməti nədir?', a: 'Hazırda ödəniş tələb olunmur və saytda ödəniş mexanizmi yoxdur. Gələcəkdə ödənişli imkanlar olarsa, əvvəlcədən aydın göstəriləcək.' },
];

export function HomePassportLanding({ lang, change }: { lang: Lang; change: (v: Lang) => void }) {
  const [menu, setMenu] = useState(false);
  const nav = [['#passport', 'Ev təhvil-təslim'], ['#smeta', 'AI smeta'], ['#how', 'Necə işləyir'], ['#faq', 'Suallar']];
  return <div className="lp">
    <header className="lp-nav wrap">
      <Brand />
      <nav className={`lp-links ${menu ? 'open' : ''}`} aria-label="Bölmələr">{nav.map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)}>{l}</a>)}<Link href="/sign-in" className="lp-signin-m">Daxil ol</Link></nav>
      <div className="lp-actions"><LanguagePicker lang={lang} change={change} /><Link href="/sign-in" className="text-link lp-signin">Daxil ol</Link><Link href="/sign-up" className="button button-primary lp-signup" data-testid="landing-signup">Qeydiyyat</Link>
        <button type="button" className="lp-burger" aria-label="Menyu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button></div>
    </header>

    <section className="lp-hero2 wrap">
      <h1 className="font-display">Evinizi qeydə alın. Təmir və tikinti xərclərini əvvəlcədən hesablayın.</h1>
      <p>Təhvil.az evin otaqlarını, avadanlığını, qüsurlarını və dəyişikliklərini rəqəmsal şəkildə qeydə almağa, həmçinin evin təmir və tikinti xərclərini əvvəlcədən hesablamağa kömək edir.</p>
    </section>

    <section className="lp-two wrap" aria-label="Əsas xidmətlər">
      <article className="lp-svc" id="passport" data-testid="landing-service">
        <div className="eyebrow"><span className="eyebrow-dot" />Modul A</div>
        <h2 className="font-display">Ev təhvil-təslim</h2>
        <p>Evin vəziyyətini, otaqlarını, avadanlığını, qüsurlarını və dəyişikliklərini foto və video sübutları ilə qeydə alın. Lazım olanda seçdiyiniz hissəni məhdud linklə paylaşın və ya çap edib PDF kimi saxlayın.</p>
        <ul className="lp-points">{PASSPORT_POINTS.map(([i, t]) => <li key={String(t)}>{i}<span>{t}</span></li>)}</ul>
        <Link href="/sign-up" className="button button-primary lp-big" data-testid="cta-passport">Evi qeydə al<ArrowRight size={16} /></Link>
        <p className="lp-honest"><ShieldCheck size={16} />Rəsmi sertifikat və ya keyfiyyət zəmanəti deyil — hər məlumatın mənbəyi (ev sahibi, usta, podratçı, yoxlayıcı) göstərilir.</p>
        <HeroArt />
      </article>
      <article className="lp-svc alt" id="smeta" data-testid="landing-service">
        <div className="eyebrow"><span className="eyebrow-dot" />Modul B</div>
        <h2 className="font-display">AI smeta</h2>
        <p>Mənzil və ya ev təmiri üçün iş həcmi və xərc smetası, memarlıq layihəsindən isə tikinti üçün ilkin material və iş smetası hazırlayın.</p>
        <div className="lp-svc-ctas">
          <Link href="/ai-smeta/temir" className="button button-primary lp-big" data-testid="cta-renovation"><Hammer size={16} />Təmir smetası hazırla</Link>
          <Link href="/ai-smeta/tikinti" className="button button-secondary lp-big" data-testid="cta-build"><Calculator size={16} />Layihədən tikinti smetası hazırla</Link>
        </div>
        <p className="lp-honest"><ShieldCheck size={16} />Hər qiymətin mənbəyi və tarixi smetada görünür; qiyməti olmayan iş “qiymət yoxdur” kimi qalır, uydurulmur.</p>
        <SampleResults />
      </article>
    </section>

    <section className="lp-section wrap" id="how">
      <div className="lp-head"><div className="eyebrow">Necə işləyir</div><h2 className="font-display">Az addım, aydın nəticə.</h2></div>
      <div className="lp-how">
        <div className="lp-how-col"><h3><House size={17} />Ev təhvil-təslim</h3><ol className="lp-steps-mini">
          {['Evi əlavə edin — yalnız ad kifayətdir', 'Otaq üzrə foto və texniki məlumat əlavə edin', 'Dəyişiklik olanda yeniləyin — tarixçə saxlanılır', 'Lazım olanda yalnız seçdiyinizi paylaşın'].map(x => <li key={x}>{x}</li>)}</ol></div>
        <div className="lp-how-col"><h3><HardHat size={17} />Tikinti smetası</h3><ol className="lp-steps-mini">
          {['Layihəni yükləyin (PDF, şəkil, XLSX, CSV)', 'Tapılan ölçüləri yoxlayın, çatışanları yazın', 'Qiymətləri təklif və ya cədvəldən daxil edin', 'Excel və ya PDF kimi ixrac edin'].map(x => <li key={x}>{x}</li>)}</ol></div>
      </div>
    </section>

    <section className="lp-section wrap lp-trust">
      <div className="lp-head"><div className="eyebrow">Etibar</div><h2 className="font-display">Rəqəmin arxasında nə olduğu görünür.</h2></div>
      <div className="lp-why-grid light">
        {[[<ShieldCheck size={20} key="s" />, 'Mənbə həmişə göstərilir', 'Ev sahibi, usta, podratçı və ya dəvət olunmuş yoxlayıcı — kim daxil edibsə, yanında yazılır.'],
          [<Lock size={20} key="l" />, 'Susmaya görə məxfi', 'Ünvan, sənədlər, xərclər və telefonlar icazəsiz paylaşılmır. Linklər məhduddur və bağlanır.'],
          [<Search size={20} key="q" />, 'Uydurma yoxdur', 'Vahid qiymət və ya ölçü tapılmayanda “məlumat yoxdur” deyirik.'],
          [<Bell size={20} key="b" />, 'Qeyri-müəyyənlik gizlədilmir', 'Etibarlılıq səviyyəsi, çatışmayan məlumatlar və fərziyyələr hər nəticədədir.']].map(([i, t, d]) =>
          <div key={String(t)} className="lp-why-item"><span>{i}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div>
    </section>

    <section className="lp-section wrap lp-faq" id="faq">
      <div className="lp-head"><div className="eyebrow">Suallar</div><h2 className="font-display">Tez-tez verilən suallar</h2></div>
      <div>{FAQ.map(f => <details key={f.q} className="lp-faq-item"><summary>{f.q}<ChevronDown size={17} /></summary><p>{f.a}</p></details>)}</div>
    </section>

    <section className="lp-final wrap"><div>
      <Sparkles size={22} />
      <h2 className="font-display">Evinizi tanıyın, xərcinizi əvvəlcədən bilin.</h2>
      <p>Pulsuz başlayın — ilk evi əlavə edin və ya ilk hesablamanı aparın.</p>
      <div className="lp-svc-ctas center"><Link href="/sign-up" className="button button-primary lp-big">Evi qeydə al<ArrowRight size={16} /></Link><Link href="/ai-smeta" className="button button-secondary lp-big">AI Smeta</Link></div>
    </div></section>

    <Partners lang={lang} />
    <footer className="landing-footer wrap"><Brand /><p>Təhvil.az — ev təhvil-təslim və AI smeta platforması. Hesabdakı təsdiq audit qeydidir, hüquqi elektron imza deyil.</p><LanguagePicker lang={lang} change={change} />
      <nav className="landing-legal" aria-label="Bələdçilər"><a href="/menzil-tehvil-teslim-akti.html">Mənzil təhvil-təslim aktı</a><a href="/ev-temiri-ve-tikinti-smetasi.html">Təmir və tikinti smetası</a><a href="/temir-tehvil-akti.html">Təmir işlərinin təhvil aktı</a><a href="/temir-islerinin-qebulu.html">Təmir işlərinin qəbulu</a><a href="/podratci-ile-razilasma.html">Podratçı ilə razılaşma</a><a href="/temir-elave-isler.html">Əlavə işlər və dəyişikliklər</a></nav>
      <nav className="landing-legal"><a href="/privacy.html">Məxfilik siyasəti</a><a href="/terms.html">İstifadə şərtləri</a></nav>
      <address className="landing-contact"><a href="mailto:support@tehvil.az">support@tehvil.az</a><a href="tel:+994503066626">+994 50 306 66 26</a><a href="https://wa.me/994503066626" target="_blank" rel="noopener noreferrer">WhatsApp</a><span>Bakı, Səbail rayonu, Badamdar qəsəbəsi, 26-cı küçə, 20</span></address>
    </footer>
  </div>;
}

/** Example results for the AI Smeta card — clearly marked as a demo, not a real property. */
function SampleResults() {
  return <div className="lp-demo" aria-label="Demo nəticələr">
    <div className="lp-mock-tag">Demo — real hesablama deyil</div>
    <div className="lp-demo-row"><small>Tikinti smetası (nümunə)</small><b>Material 20 752 · İşçilik 8 768 AZN</b><span>13 bölmə · 20 sətirdə qiymət daxil edilməyib — smeta natamamdır</span></div>
  </div>;
}

/** Illustration: a plan with hidden lines, a photo-history card and a service card. Labelled as an example. */
function HeroArt() {
  return <div className="lp-art" aria-hidden="true">
    <div className="lp-art-top"><span><i />Nümunə ev pasportu</span><span>Mənzil · 3 otaq</span></div>
    <svg viewBox="0 0 400 260" className="lp-plan">
      <rect x="8" y="8" width="384" height="244" rx="6" className="wall" />
      <line x1="200" y1="8" x2="200" y2="150" className="inner" /><line x1="8" y1="150" x2="290" y2="150" className="inner" /><line x1="290" y1="150" x2="290" y2="252" className="inner" />
      <text x="24" y="34">Qonaq otağı</text><text x="216" y="34">Yataq otağı</text><text x="24" y="174">Mətbəx</text><text x="306" y="174">Hamam</text>
      <path d="M40 120 H170 V60 H260 V120 H360" className="line-el" /><path d="M60 230 H250 V200 H340" className="line-water" /><path d="M120 230 V170" className="line-water" />
      <circle cx="40" cy="120" r="6" className="pin-el" /><circle cx="340" cy="200" r="6" className="pin-water" /><circle cx="250" cy="200" r="5" className="pin-water" />
    </svg>
    <div className="lp-legend"><span><i className="el" />Elektrik</span><span><i className="water" />Su</span><span>Mənbə: ev sahibi · foto 14.05.2024</span></div>
    <div className="lp-float one"><Camera size={15} /><div><b>Mətbəx su xətti</b><small>Suvaqdan əvvəl · 3 foto</small></div></div>
    <div className="lp-float two"><Wrench size={15} /><div><b>Kombi — servis</b><small>Növbəti: mart 2027</small></div></div>
    <div className="lp-float three"><FileText size={15} /><div><b>Zəmanət kartı.pdf</b><small>Sənəd əlavə olunub</small></div></div>
  </div>;
}
