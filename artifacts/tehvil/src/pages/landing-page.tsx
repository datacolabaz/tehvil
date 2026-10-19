import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight, ArrowUpRight, Bell, BookOpenCheck, Building2, Calculator, Camera, Check, ChevronDown, ClipboardList, FileText, HardHat,
  History, House, KeyRound, Layers, Lock, Menu, QrCode, Search, ShieldCheck, Sparkles, Wrench, X,
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
type Service = { icon: ReactNode; title: string; text: string; points: string[]; cta: string; href: string; status: 'live' | 'soon'; note?: string };

const SERVICES: Service[] = [
  { icon: <BookOpenCheck size={22} />, title: 'Evin rəqəmsal pasportu', text: 'Ünvan, otaqlar, tikinti və təmir tarixləri, avadanlıqlar və sənədlər — addım-addım doldurulur.', points: ['Yalnız adla başlayın', 'Məlum olmayan hissə “Məlumat yoxdur” qalır', 'Tamlıq göstəricisi'], cta: 'Pasport yarat', href: '/sign-up', status: 'live' },
  { icon: <Layers size={22} />, title: 'Gizli kommunikasiyalar', text: 'Divar, döşəmə və tavanın arxasındakı elektrik, su, kanalizasiya, qaz, istilik və internet xətləri — foto üzərində işarə ilə.', points: ['Otaq üzrə qeyd', 'Foto üzərində xətt çəkmək', 'Kim və nə vaxt qeyd edib'], cta: 'Xətləri qeyd et', href: '/sign-up', status: 'live' },
  { icon: <History size={22} />, title: 'Təmir tarixçəsi', text: 'Nə edildi, nə vaxt, kim etdi — əvvəl/sonra fotoları, materiallar, xərc, qüsur və onun düzəldilməsi.', points: ['Keçmiş işlər də yazılır', 'Usta qeydiyyatsız qeyd olunur', 'Dəyişikliklər jurnalı'], cta: 'Tarixçə yarat', href: '/sign-up', status: 'live' },
  { icon: <Calculator size={22} />, title: 'Büdcə və xərclər', text: 'AI Smeta ilə ilkin smeta, xərc jurnalı və qəbzlər; görülən işlərin faktiki dəyəri evdə ayrıca toplanır.', points: ['Smeta və faktiki xərc ayrı', 'Valyuta üzrə cəm', 'CSV ixrac'], cta: 'Smeta hazırla', href: '/sign-up', status: 'live', note: 'AI Smeta qaydalara əsaslanan hesablamadır, təxminidir.' },
  { icon: <Wrench size={22} />, title: 'Texniki xidmət', text: 'Kombi, kondisioner, su filtri, nasos: marka, quraşdırma, zəmanət, son və növbəti xidmət, servis şirkəti.', points: ['Xidmət tarixçəsi', 'Zəmanət bitmə tarixi', 'Saytda xatırlatma'], cta: 'Avadanlıq əlavə et', href: '/sign-up', status: 'live', note: 'Xatırlatmalar hazırda yalnız saytda görünür — SMS və e-poçt göndərilmir.' },
  { icon: <KeyRound size={22} />, title: 'Evin satışa hazırlanması', text: 'Alıcıya yalnız seçdiyiniz məlumatları məhdud müddətli link və ya QR kodla göstərin; istədiyiniz vaxt bağlayın.', points: ['Ünvan susmaya görə gizli', 'Sənədləri bir-bir seçmək', 'Çap / PDF kimi saxlamaq'], cta: 'Pasportlu ev hazırla', href: '/sign-up', status: 'live' },
  { icon: <Search size={22} />, title: 'Müstəqil texniki yoxlama', text: 'Görünən qüsurlar, rütubət, santexnika və elektrik üzrə mütəxəssis yoxlaması. Mövcud hesabatı isə indi pasporta əlavə edə bilərsiniz.', points: ['Hesabatı “Sənədlər”ə yükləyin', 'Yoxlayıcını evə dəvət etmək olar'], cta: 'Marağınızı bildirin', href: '/interest/inspection', status: 'soon', note: 'Sifariş xidməti hələ yoxdur — mütəxəssis şəbəkəsi qurulanda açılacaq.' },
];

const AUDIENCES = [
  { key: 'sell', label: 'Evini satanlar', title: 'Alıcı eviniz haqqında sual verəndə cavabınız hazır olsun.', text: 'Təmir tarixləri, materiallar, gizli xətlərin fotoları və zəmanətlər — alıcıya yalnız seçdiyiniz hissə.', cta: 'Evim üçün pasport yarat', href: '/sign-up' },
  { key: 'renovate', label: 'Təmirə başlayanlar', title: 'Divarlar bağlanmamışdan əvvəl elektrik və su xətlərinin yerini qeyd edin.', text: 'Suvaqdan əvvəl çəkilən bir neçə foto illər sonra divarı deşmək lazım olanda işə yarayır.', cta: 'Təmir tarixçəsi yarat', href: '/sign-up' },
  { key: 'owner', label: 'Ev sahibləri', title: 'Evinizin sənədlərini, avadanlıqlarını və texniki xidmət tarixçəsini bir yerdə saxlayın.', text: 'Kombinin zəmanət kartı, sayğacın yeri, son servis tarixi — lazım olanda telefonunuzda.', cta: 'Evimə başla', href: '/sign-up' },
  { key: 'buyer', label: 'Yeni ev alanlar', title: 'Eviniz haqqında bildiklərinizi bir yerə toplayın. Bilmədiklərinizi isə tədricən tamamlayın.', text: 'Satıcıdan və ya tikinti şirkətindən aldığınız sənədləri yükləyin; məlum olmayan bölmələr açıq-aydın “Məlumat yoxdur” kimi qalır.', cta: 'Rəqəmsal pasport yarat', href: '/sign-up' },
  { key: 'pro', label: 'Podratçılar və tikinti şirkətləri', title: 'Müştərinizə yalnız təmir edilmiş ev deyil, onun texniki tarixçəsini də təhvil verin.', text: 'Ev sahibi sizi konkret işə dəvət edir: foto arxivi, gizli xətlər, materiallar və avadanlıq zəmanətlərini öz adınızdan əlavə edirsiniz. Hər qeyddə “Podratçı daxil edib” görünür.', cta: 'Peşəkar hesab yarat', href: '/sign-up' },
];

const FAQ = [
  { q: 'Məlumatlarım təhlükəsizdirmi? Kim görə bilər?', a: 'Ev məlumatları susmaya görə məxfidir: yalnız siz və dəvət etdiyiniz şəxslər görür. İcazələr serverdə yoxlanılır. Sənədlər, ünvan, xərclər və telefonlar QR kodla heç vaxt açılmır; paylaşım linkində isə yalnız sizin seçdiyiniz hissə görünür.' },
  { q: 'Pasportu necə yaradım? Hamısını birdən doldurmalıyam?', a: 'Xeyr. Qeydiyyatdan keçin, evin adını yazın — kifayətdir. Sonra əlinizdə olan foto və sənədləri, işləri və texniki məlumatları istədiyiniz vaxt əlavə edin. Tamlıq göstəricisi hansı bölmələrin boş qaldığını göstərir.' },
  { q: 'Pasport evin keyfiyyətini təsdiqləyirmi?', a: 'Xeyr. Pasport rəsmi sertifikat deyil və evin qüsursuz olduğuna, qiymətinə və ya satışın baş tutacağına zəmanət vermir. Dəyəri şəffaflıqdadır: hər məlumatın yanında kim daxil edib, sənəd əlavə olunubmu, yoxlanılıbmı — göstərilir. Tamlıq faizi də yalnız məlumatın nə qədər doldurulduğunu göstərir, evin vəziyyətini qiymətləndirmir.' },
  { q: 'Alıcı ilə paylaşım necə işləyir?', a: 'Paylaşım və giriş bölməsində link yaradırsınız: hansı işlər, fotolar, xətlər, avadanlıqlar və hansı sənədlər görünsün — özünüz seçirsiniz. Ünvan yalnız işarələsəniz görünür. Linkin müddəti var, istənilən vaxt bağlanır; neçə dəfə açıldığını görürsünüz. Səhifəni çap edə və ya PDF kimi saxlaya bilərsiniz.' },
  { q: 'Texniki yoxlama sifariş edə bilərəmmi?', a: 'Hələ yox. Mütəxəssis şəbəkəsi qurulana qədər yalnız marağınızı bildirə bilərsiniz. Artıq əlinizdə olan yoxlama hesabatını isə “Sənədlər” bölməsinə yükləyə bilərsiniz.' },
  { q: 'Qiyməti nədir?', a: 'Hazırda ev pasportu üçün ödəniş tələb olunmur və saytda ödəniş mexanizmi yoxdur. Gələcəkdə peşəkarlar üçün ödənişli imkanlar olarsa, bu əvvəlcədən aydın göstəriləcək.' },
];

export function HomePassportLanding({ lang, change }: { lang: Lang; change: (v: Lang) => void }) {
  const [menu, setMenu] = useState(false);
  const [aud, setAud] = useState('sell');
  const current = AUDIENCES.find(a => a.key === aud)!;
  const nav = [['#services', 'Xidmətlər'], ['#how', 'Necə işləyir'], ['#sell', 'Evini sat'], ['#pros', 'Podratçılar']];
  return <div className="lp">
    <header className="lp-nav wrap">
      <Brand />
      <nav className={`lp-links ${menu ? 'open' : ''}`} aria-label="Bölmələr">{nav.map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)}>{l}</a>)}<Link href="/sign-in" className="lp-signin-m">Daxil ol</Link></nav>
      <div className="lp-actions"><LanguagePicker lang={lang} change={change} /><Link href="/sign-in" className="text-link lp-signin">Daxil ol</Link><Link href="/sign-up" className="button button-primary lp-signup" data-testid="landing-signup">Qeydiyyat</Link>
        <button type="button" className="lp-burger" aria-label="Menyu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button></div>
    </header>

    <section className="lp-hero wrap">
      <div className="lp-hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" />Evin rəqəmsal pasportu</div>
        <h1 className="font-display">Evinizin bütün tarixçəsi bir yerdə.</h1>
        <p>Evinizin texniki pasportunu yaradın. Təmir fotolarını, elektrik və su xətlərinin yerləşməsini, materialları, xərcləri, zəmanətləri və texniki xidmət tarixçəsini bir yerdə qoruyun.</p>
        <div className="lp-cta"><Link href="/sign-up" className="button button-primary lp-big" data-testid="landing-hero-cta">Evim üçün rəqəmsal pasport yarat<ArrowRight size={17} /></Link><a href="#services" className="button button-secondary lp-big">Bütün xidmətləri kəşf et</a></div>
        <p className="lp-honest"><ShieldCheck size={16} />Rəsmi sertifikat və ya keyfiyyət zəmanəti deyil — hər məlumatın mənbəyi və yoxlanma statusu göstərilir.</p>
      </div>
      <HeroArt />
    </section>

    <section className="lp-section wrap" id="services">
      <div className="lp-head"><div className="eyebrow">Xidmətlər</div><h2 className="font-display">Ev haqqında hər şey — bir pasportda.</h2><p>Hər kartda xidmətin bu gün işlədiyi və ya hələ hazırlandığı açıq yazılıb.</p></div>
      <div className="lp-services">{SERVICES.map(s => <article key={s.title} className={`lp-card ${s.status}`} data-testid="landing-service">
        <div className="lp-card-top"><span className="lp-icon">{s.icon}</span><span className={`lp-status ${s.status}`}>{s.status === 'live' ? <><Check size={12} />İşləyir</> : 'Hazırlanır'}</span></div>
        <h3>{s.title}</h3><p>{s.text}</p>
        <ul>{s.points.map(p => <li key={p}><Check size={13} />{p}</li>)}</ul>
        {s.note && <small className="lp-note">{s.note}</small>}
        <Link href={s.href} className="lp-card-cta">{s.cta}<ArrowUpRight size={15} /></Link>
      </article>)}</div>
    </section>

    <section className="lp-why"><div className="wrap lp-why-inner">
      <div className="lp-head light"><div className="eyebrow">Niyə lazımdır?</div><h2 className="font-display">Evin yaddaşı adamların yaddaşından uzun yaşamalıdır.</h2></div>
      <div className="lp-why-grid">
        {[[<Camera size={20} key="c" />, 'Divar bağlanandan sonra görünmür', 'Naqil və borunun yeri yalnız suvaqdan əvvəl çəkilmiş fotoda qalır. Rəf asanda, təmirdə, sızma axtaranda lazım olur.'],
          [<HardHat size={20} key="h" />, 'Usta dəyişir, məlumat itməsin', 'Kim nə vaxt hansı işi görüb, hansı material istifadə olunub — telefon nömrəsi və qəbz itəndə belə.'],
          [<Bell size={20} key="b" />, 'Zəmanət və servis tarixini unutmayın', 'Kombinin zəmanəti nə vaxt bitir, son servis nə vaxt olub — saytda xatırlatma görürsünüz.'],
          [<ClipboardList size={20} key="l" />, 'Satışda şəffaflıq', 'Alıcının suallarına sənədlərlə cavab verin. Nəyi göstərəcəyinizə özünüz qərar verirsiniz.']].map(([i, t, d]) =>
          <div key={String(t)} className="lp-why-item"><span>{i}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div>
    </div></section>

    <section className="lp-section wrap lp-sell" id="sell">
      <div className="lp-sell-copy">
        <div className="eyebrow">Pasportlu ev</div>
        <h2 className="font-display">Evinizi satarkən yalnız kvadratmetrləri deyil, onun tarixçəsini də göstərin.</h2>
        <p>Evinizin tarixçəsini göstərin. Alıcının suallarına sənədlərlə cavab verin.</p>
        <ul className="lp-checks">{['Təmirin nə vaxt aparıldığı', 'Hansı materialların istifadə olunduğu', 'Gizli kommunikasiyaların fotoları', 'Texniki xidmət tarixçəsi', 'Avadanlıqların zəmanət məlumatları', 'Mövcud yoxlama hesabatları və qəbzlər — yalnız seçdikləriniz'].map(x => <li key={x}><Check size={15} />{x}</li>)}</ul>
        <Link href="/sign-up" className="button button-primary lp-big">Evim üçün pasport yarat<ArrowRight size={16} /></Link>
        <p className="lp-disclaimer">Pasport evin qüsursuz olduğuna, bazar qiymətinin yüksək olacağına və ya satışın mütləq baş tutacağına zəmanət vermir. Məhsulun dəyəri məlumatların şəffaflığındadır.</p>
      </div>
      <div className="lp-share-mock" aria-label="Paylaşım nümunəsi">
        <div className="lp-mock-tag">Nümunə görünüş</div>
        <div className="lp-mock-row"><QrCode size={18} /><b>Alıcı üçün link</b><span className="lp-pill ok">30 gün</span></div>
        {[['Ümumi məlumat', true], ['Təmir işləri (seçilmiş 6)', true], ['Gizli xətlərin fotoları', true], ['Avadanlıq və zəmanət', true], ['Texniki pasport (PDF)', true], ['Dəqiq ünvan', false], ['Xərclər və telefonlar', false]].map(([l, on]) =>
          <div key={String(l)} className={`lp-mock-check ${on ? 'on' : ''}`}>{on ? <Check size={14} /> : <Lock size={13} />}{l}</div>)}
        <small>3 dəfə baxılıb · istənilən vaxt “Linki bağla”</small>
      </div>
    </section>

    <section className="lp-section wrap" id="how">
      <div className="lp-head"><div className="eyebrow">Necə işləyir</div><h2 className="font-display">Təmir zamanı pasport özü yaranır.</h2><p>Əsas əməliyyatlar bir neçə toxunuşla.</p></div>
      <ol className="lp-steps">{[
        ['Evi əlavə edin', 'Yalnız ad kifayətdir. Otaqlar, ünvan, sahə — sonra.'],
        ['Divarlar bağlanmazdan əvvəl çəkin', 'Elektrik və su xətlərinin fotosunu çəkin, üzərində xətti göstərin.'],
        ['İşi qeyd edin', 'Nə edildi, nə vaxt, kim etdi, material və xərc. Ustanı dəvət edin — öz qeydlərini əlavə etsin.'],
        ['Sənəd və zəmanətləri yükləyin', 'Qəbz, müqavilə, zəmanət kartı, yoxlama hesabatı.'],
        ['Lazım olanda paylaşın', 'Alıcıya, ustaya və ya ailəyə — yalnız seçdiyinizi, məhdud müddətə.'],
      ].map(([t, d], i) => <li key={t}><span className="lp-step-n">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>)}</ol>
    </section>

    <section className="lp-section wrap" id="pros">
      <div className="lp-head"><div className="eyebrow">Kimin üçün</div><h2 className="font-display">Ev sahibləri və peşəkarlar üçün.</h2></div>
      <div className="lp-aud">
        <div className="lp-aud-tabs" role="tablist">{AUDIENCES.map(a => <button key={a.key} type="button" role="tab" aria-selected={aud === a.key} className={aud === a.key ? 'on' : ''} onClick={() => setAud(a.key)}>{a.key === 'pro' ? <Building2 size={15} /> : <House size={15} />}{a.label}</button>)}</div>
        <div className="lp-aud-body surface"><h3 className="font-display">{current.title}</h3><p>{current.text}</p><Link href={current.href} className="button button-primary">{current.cta}<ArrowRight size={16} /></Link></div>
      </div>
    </section>

    <section className="lp-section wrap lp-sample">
      <div className="lp-head"><div className="eyebrow">Pasportun görünüşü</div><h2 className="font-display">Nə doldurulub, nə boşdur — açıq görünür.</h2><p>Aşağıdakı nümunədir, real ev deyil.</p></div>
      <SamplePassport />
    </section>

    <section className="lp-section wrap lp-faq">
      <div className="lp-head"><div className="eyebrow">Suallar</div><h2 className="font-display">Tez-tez verilən suallar</h2></div>
      <div>{FAQ.map(f => <details key={f.q} className="lp-faq-item"><summary>{f.q}<ChevronDown size={17} /></summary><p>{f.a}</p></details>)}</div>
    </section>

    <section className="lp-final wrap"><div>
      <Sparkles size={22} />
      <h2 className="font-display">Evinizin rəqəmsal pasportunu yaradın.</h2>
      <p>Pulsuz başlayın — ilk evi əlavə edin və bildiklərinizi yazın. Qalanını tədricən tamamlayın.</p>
      <Link href="/sign-up" className="button button-primary lp-big">Evinizin rəqəmsal pasportunu yaradın<ArrowRight size={16} /></Link>
    </div></section>

    <Partners lang={lang} />
    <footer className="landing-footer wrap"><Brand /><p>Təhvil.az — evin rəqəmsal pasportu. Hesabdakı təsdiq audit qeydidir, hüquqi elektron imza deyil.</p><LanguagePicker lang={lang} change={change} />
      <nav className="landing-legal" aria-label="Bələdçilər"><a href="/temir-tehvil-akti.html">Təhvil-təslim aktı</a><a href="/temir-islerinin-qebulu.html">Təmir işlərinin qəbulu</a><a href="/podratci-ile-razilasma.html">Podratçı ilə razılaşma</a><a href="/temir-elave-isler.html">Əlavə işlər və dəyişikliklər</a></nav>
      <nav className="landing-legal"><a href="/privacy.html">Məxfilik siyasəti</a><a href="/terms.html">İstifadə şərtləri</a></nav>
      <address className="landing-contact"><a href="mailto:support@tehvil.az">support@tehvil.az</a><a href="tel:+994503066626">+994 50 306 66 26</a><a href="https://wa.me/994503066626" target="_blank" rel="noopener noreferrer">WhatsApp</a><span>Bakı, Səbail rayonu, Badamdar qəsəbəsi, 26-cı küçə, 20</span></address>
    </footer>
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

function SamplePassport() {
  const rows: [string, string, string][] = [
    ['Ümumi məlumat', '4 sahə', 'ok'], ['Təmir tarixçəsi', '12 iş', 'ok'], ['Foto arxivi', '86 foto', 'ok'], ['Elektrik xətləri', '5 qeyd', 'ok'],
    ['Su və kanalizasiya', '3 qeyd', 'ok'], ['İstilik, qaz, ventilyasiya', 'Məlumat yoxdur', 'none'], ['Avadanlıqlar', '4', 'ok'], ['Sənədlər', '7', 'ok'], ['Texniki xidmət', 'Məlumat yoxdur', 'none'],
  ];
  return <div className="lp-passport surface">
    <div className="lp-pass-head"><div><div className="eyebrow">Nümunə · real ev deyil</div><h3 className="font-display">Nərimanov mənzili</h3><small>Son dəyişiklik: 2 gün əvvəl</small></div>
      <div className="lp-meter"><b>69%</b><span>məlumat tamlığı</span><div><i style={{ width: '69%' }} /></div></div></div>
    <div className="lp-pass-grid">{rows.map(([l, v, s]) => <div key={l} className={`lp-pass-row ${s}`}><span>{l}</span><b>{v}</b></div>)}</div>
    <div className="lp-sources"><span><i className="s-owner" />Ev sahibi daxil edib</span><span><i className="s-pro" />Podratçı daxil edib</span><span><i className="s-doc" />Sənəd əlavə olunub</span><span><i className="s-spec" />Yoxlanılıb</span><span><i className="s-none" />Məlumat yoxdur</span></div>
    <p className="lp-note">Tamlıq faizi yalnız bölmələrin nə qədər doldurulduğunu göstərir. Evin texniki vəziyyətinin, təhlükəsizliyinin və ya keyfiyyətinin qiymətləndirilməsi deyil.</p>
  </div>;
}
