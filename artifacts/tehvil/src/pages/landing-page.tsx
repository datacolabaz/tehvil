import { useState } from 'react';
import { Film, ImagePlus, MapPin } from 'lucide-react';
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
type Role = 'realtor' | 'seller' | 'buyer';
const ROLES: { id: Role; label: string; text: string }[] = [
  { id: 'seller', label: 'Satıcı', text: 'Təməldən son təmirə qədər mərhələləri foto ilə toplayın, alıcıya linklə göstərin. Açar təhvil günü otaqları və sayğacları protokolda təsdiqləyin.' },
  { id: 'buyer', label: 'Alıcı', text: 'Sizə göndərilən linklə evin mərhələ-mərhələ foto tarixçəsinə və təhvil protokoluna hesabsız baxın.' },
  { id: 'realtor', label: 'Rieltor', text: 'Müştərinin evi üçün tarixçə qurun, alıcıya paylaşın, təhvil protokolunu hazırlayın. Təsdiqi satıcı və alıcı özləri verir.' },
];
const BENEFITS = [
  [<Camera size={20} key="c" />, 'Tikinti və təmir mərhələlərini foto ilə qeydə alın', 'Təməl, armatur, suvaq, elektrik, santexnika — divar bağlanmazdan əvvəl görünənlər itmir.'],
  [<Link2 size={20} key="l" />, 'Tarixçəni alıcıya linklə göstərin', 'Yalnız baxış üçün link; ünvan susmaya görə gizli, istənilən vaxt deaktiv edilir.'],
  [<ClipboardCheck size={20} key="a" />, 'Təhvil günü protokolu iki tərəf təsdiqləsin', 'Otaqlar, qüsurlar, sayğaclar, açarlar və PDF — eyni evə bağlı, ayrıca modul.'],
] as const;

const IN_PROTOCOL = [
  [<Camera size={17} key="c" />, 'Otaq-otaq foto və qısa qeydlər — telefonun kamerası ilə, hər foto avtomatik öz otağına bağlanır'],
  [<ShieldCheck size={17} key="q" />, 'Ümumi vəziyyət (yaxşı, qənaətbəxş, qüsurlu) və qüsurların ayrıca qeydi'],
  [<Gauge size={17} key="g" />, 'Su, qaz və elektrik sayğaclarının göstəriciləri, istəsəniz foto ilə'],
  [<KeyRound size={17} key="k" />, 'Təhvil verilən açarlar, pultlar, kartlar və onların sayı'],
  [<Check size={17} key="a" />, 'Satıcı və alıcının təsdiqi: kim, nə vaxt, hansı versiyanı'],
  [<FileText size={17} key="f" />, 'Foto, qüsur, sayğac və təsdiqlərlə PDF protokol — yükləmək və paylaşmaq olur'],
] as const;

const FAQ = [
  { q: 'Qeydiyyat lazımdırmı?', a: 'Protokol yaratmaq üçün hesab lazımdır — protokolun sahibi və idarəetmə hüququ belə müəyyən edilir. Sizə göndərilən linki açıb protokola qeydiyyatsız baxa bilərsiniz; təsdiq etmək üçün isə daxil olursunuz.' },
  { q: 'Linki başqası ələ keçirsə nə olur?', a: 'Link yalnız baxmağa imkan verir, təsdiq hüququ vermir. Linkdən yalnız bir hesab protokola qoşula bilir; protokolu yaradan linki istənilən vaxt ləğv edib yenisini göndərə bilər.' },
  { q: 'Təsdiqdən sonra protokol dəyişdirilə bilərmi?', a: 'Səssizcə yox. Təsdiqə göndərilən məzmun versiya kimi dondurulur. Dəyişiklik lazım olsa, yeni versiya yaranır və tərəflər onu yenidən təsdiqləyir; əvvəlki versiya və onun təsdiqləri saxlanılır.' },
  { q: 'Bu, hüquqi sənəddirmi?', a: 'Protokol tərəflərin təhvil zamanı faktiki vəziyyəti necə qeydə aldığını və bunu öz hesabları ilə təsdiqlədiklərini göstərir. Hesab üzərindən təsdiq hüquqi elektron imza deyil. Müqavilə və mübahisə məsələlərində hüquqşünasla məsləhətləşin.' },
  { q: 'Fotolar kimə görünür?', a: 'Yalnız protokolun iştirakçılarına və aktiv dəvət linki olan şəxsə. Fotolar açıq internetdə yerləşdirilmir və axtarış sistemlərində görünmür.' },
  { q: 'Ayrıca tətbiq yükləmək lazımdırmı?', a: 'Xeyr. Tehvil.az telefonun brauzerində işləyir: iPhone-da Safari, Android-də Chrome. Foto çəkmək üçün telefonun öz kamerası açılır.' },
  { q: 'Qiyməti nədir?', a: 'Pilot mərhələsində bütün funksiyalar pulsuzdur: ev tarixçəsi, fotolar, qısa videolar (ev başına 5-ə qədər), paylaşım linki, təhvil protokolu və PDF. Satıcı, alıcı və rieltor eyni protokol üçün heç nə ödəmir. Pro plan hazırlanır; ödənişli imkanlar olarsa, qiymət əvvəlcədən aydın göstəriləcək.' },
  { q: 'Fotonun tarixi və GPS-i nəyi sübut edir?', a: 'Yüklənmə vaxtını server yazır. Çəkilmə vaxtı və GPS cihazın məlumatıdır və yalnız mövcud olduqda, GPS isə yalnız icazənizlə qeyd olunur. Bunlar fotonun məhz həmin yerdə və vaxtda çəkildiyinin dəyişdirilməz sübutu deyil; alıcıya yalnız “GPS qeydə alınıb” nişanı görünür, koordinatlar yox.' },
  { q: 'Rieltor olmadan istifadə etmək olarmı?', a: 'Bəli. Satıcı və ya alıcı protokolu özü yarada bilər. Rieltor varsa, protokolu hazırlaya və tərəfləri dəvət edə bilər, adı və agentliyi PDF-də göstərilir; lakin onun iştirakı satıcının və ya alıcının təsdiqini əvəz etmir.' },
  { q: 'Bu, mübahisələrə son qoyurmu?', a: 'Xeyr, belə zəmanət yoxdur. Protokol təhvil günü tərəflərin razılaşdığı vəziyyəti sənədləşdirir və sonradan yarana biləcək anlaşılmazlıqları azaltmağa kömək edir. Sübut kimi qəbul edilməsi konkret şəraitdən və qanunvericilikdən asılıdır.' },
];

export function HomePassportLanding({ lang, change }: { lang: Lang; change: (v: Lang) => void }) {
  const [menu, setMenu] = useState(false);
  const [role, setRole] = useState<Role>('seller');
  const nav = [['#modules', 'Tarixçə və protokol'], ['#how', 'Necə işləyir'], ['#plans', 'Planlar'], ['#faq', 'Suallar']];
  const current = ROLES.find((r) => r.id === role)!;
  return <div className="lp">
    <header className="lp-nav wrap">
      <Brand />
      <nav className={`lp-links ${menu ? 'open' : ''}`} aria-label="Bölmələr">{nav.map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)}>{l}</a>)}<Link href="/sign-in" className="lp-signin-m">Daxil ol</Link></nav>
      <div className="lp-actions"><LanguagePicker lang={lang} change={change} /><Link href="/sign-in" className="text-link lp-signin">Daxil ol</Link><Link href="/homes?new=1" className="button button-primary lp-signup" data-testid="landing-signup">Pulsuz başla</Link>
        <button type="button" className="lp-burger" aria-label="Menyu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button></div>
    </header>

    <section className="lp-hero2 lp-hero-pt wrap">
      <div className="lp-hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" />Tehvil.az</div>
        <h1 className="font-display">Evin tikintidən təhvilə qədər rəqəmsal tarixçəsi.</h1>
        <p>Elanda yalnız hazır ev görünür. Təməl, armatur, suvaq, elektrik və santexnika mərhələlərini foto ilə qeydə alın, alıcıya linklə göstərin. Açar təhvil günü otaqları, sayğacları və açarları ayrıca protokolda təsdiqləyin.</p>
        <div className="lp-roles" role="radiogroup" aria-label="Bu təhvildə siz kimsiniz?" data-testid="landing-roles">
          {ROLES.map((r) => <button key={r.id} type="button" role="radio" aria-checked={role === r.id} className={role === r.id ? 'on' : ''} onClick={() => setRole(r.id)} data-testid={`landing-role-${r.id}`}>{r.label}</button>)}
        </div>
        <p className="lp-role-text" data-testid="landing-role-text">{current.text}</p>
        <div className="lp-svc-ctas">
          <Link href="/homes?new=1" className="button button-primary lp-big" data-testid="cta-history"><Camera size={17} />Tarixçəni başlat<ArrowRight size={16} /></Link>
          <Link href={`/protokol/yeni?rol=${role}`} className="button button-secondary lp-big" data-testid="cta-protocol"><ClipboardCheck size={17} />Təhvil protokolu yarat</Link>
        </div>
        <a href="#how" className="lp-have-link" data-testid="cta-how">Necə işləyir?</a>
        {role !== 'realtor' && <a href="#link" className="lp-have-link" data-testid="cta-have-link"><Link2 size={15} />Mənə link göndərilib</a>}
        <p className="lp-honest"><ShieldCheck size={16} />Təsdiq hesabınız, tarix-saat və versiya ilə qeydə alınır; ixtisaslı elektron imza deyil. Protokol hüquqi zəmanət vermir — anlaşılmazlıq riskini azaltmağa kömək edir.</p>
      </div>
      <ProtocolArt />
    </section>
    <section className="lp-section wrap lp-benefits" data-testid="benefits">
      <div className="lp-why-grid light">{BENEFITS.map(([i, t, d], k) => <div key={String(t)} className="lp-why-item"><span>{i}</span><h3>{k + 1}. {t}</h3><p>{d}</p></div>)}</div>
    </section>

    <section className="lp-section wrap" id="modules" data-testid="modules">
      <div className="lp-head"><div className="eyebrow">İki modul, bir ev</div><h2 className="font-display">Tarixçə prosesi göstərir, protokol təhvili bağlayır.</h2></div>
      <div className="lp-modules">
        <article className="lp-module"><h3><ImagePlus size={18} />Ev tarixçəsi</h3><p>Tikinti və təmir mərhələləri timeline kimi: hər mərhələdə foto, tarix, GPS nişanı. Hazır mərhələlər və ya öz mərhələniz.</p>
          <div className="lp-chips">{['Təməl', 'Armatur', 'Beton və monolit', 'Divarlar', 'Dam', 'Suvaq', 'Elektrik', 'Santexnika', 'Döşəmə', 'Son təmir', 'Təhvilə hazırlıq', 'Təhvil günü'].map((x) => <span key={x}>{x}</span>)}</div></article>
        <article className="lp-module"><h3><ClipboardCheck size={18} />Təhvil protokolu</h3><p>Açar günü otaq-otaq yoxlama: vəziyyət, qüsurlar, sayğaclar, açarlar və domofon çipləri, satıcı və alıcının ayrıca təsdiqi, PDF.</p>
          <div className="lp-chips">{['Qonaq otağı', 'Mətbəx', 'Hamam və tualet', 'Dəhliz', 'Su və qaz sayğacı', 'Açarlar'].map((x) => <span key={x}>{x}</span>)}</div></article>
      </div>
    </section>

    <section className="lp-section wrap" id="how">
      <div className="lp-head"><div className="eyebrow">Necə işləyir</div><h2 className="font-display">Evin içində, telefonla, 5–10 dəqiqəyə.</h2></div>
      <ol className="lp-steps4">
        {[['Protokol yaradın', 'Ünvan, tarix və tərəflərin adı. Qalanı məcburi deyil.'],
          ['Otaqları gəzin', 'Otağı seçin, kameranı açın, foto çəkin, lazımsa qısa qeyd yazın.'],
          ['Tərəflər yoxlayır', 'Satıcı və alıcı eyni protokolu öz telefonlarından açır və təsdiqləyir və ya düzəliş istəyir.'],
          ['PDF alın', 'Foto, qüsur, sayğac, açar və təsdiqlərlə yekun protokol — WhatsApp-da paylaşın.']].map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><b>{t}</b><p>{d}</p></div></li>)}
      </ol>
    </section>

    <section className="lp-section wrap" id="inside">
      <div className="lp-head"><div className="eyebrow">Protokolda nə var</div><h2 className="font-display">Mübahisə yaranan hər şey bir sənəddə.</h2></div>
      <ul className="lp-points lp-points-grid">{IN_PROTOCOL.map(([i, t]) => <li key={String(t)}>{i}<span>{t}</span></li>)}</ul>
    </section>

    <section className="lp-section wrap" id="link">
      <div className="lp-link-card">
        <MessageCircle size={22} />
        <div><h2 className="font-display">Sizə link göndərilib?</h2>
          <p>Rieltor və ya qarşı tərəf protokolun linkini WhatsApp və ya SMS ilə göndərir. Linki açın: protokolu qeydiyyatsız görəcəksiniz. Təsdiqləmək və ya düzəliş istəmək üçün telefonunuzla daxil olun — link sizi geri qaytaracaq.</p>
          <p className="lp-small">Linki itirmisinizsə, protokolu yaradandan yenisini istəyin: köhnə link avtomatik ləğv olunur.</p></div>
      </div>
    </section>

    <section className="lp-section wrap lp-trust">
      <div className="lp-head"><div className="eyebrow">Etibar</div><h2 className="font-display">Sadə, amma səssiz dəyişikliyə yer yoxdur.</h2></div>
      <div className="lp-why-grid light">
        {[[<Lock size={20} key="l" />, 'Məxfi', 'Protokolu yalnız iştirakçılar və aktiv link sahibi görür. Fotolar açıq internetdə yerləşdirilmir.'],
          [<ShieldCheck size={20} key="s" />, 'Versiyalar', 'Təsdiqə göndərilən məzmun dondurulur. Dəyişiklik — yeni versiya və yenidən təsdiq.'],
          [<Check size={20} key="c" />, 'Kim, nə vaxt', 'Hər təsdiqin hesabı, tarix-saatı və təsdiqlənən versiyanın izi saxlanılır.'],
          [<Smartphone size={20} key="m" />, 'Tətbiqsiz', 'Telefonun brauzerində işləyir: iPhone Safari və Android Chrome.']].map(([i, t, d]) =>
          <div key={String(t)} className="lp-why-item"><span>{i}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div>
    </section>

    <section className="lp-section wrap" id="plans" data-testid="plans">
      <div className="lp-head"><div className="eyebrow">Planlar</div><h2 className="font-display">Pilotda hamısı pulsuz.</h2></div>
      <div className="lp-plans">
        <article className="lp-plan on"><h3>Pulsuz plan</h3><small>indi aktivdir</small><ul>
          <li><Check size={14} />Ev tarixçəsi və mərhələlər</li><li><Check size={14} />Foto, tarix-saat, GPS (icazə ilə)</li><li><Check size={14} />Qısa video: ev başına 5-ə qədər, ≤60 san., ≤50 MB</li><li><Check size={14} />Paylaşım linki</li><li><Check size={14} />Təhvil protokolu və PDF</li></ul></article>
        <article className="lp-plan"><h3>Pro plan</h3><small>tezliklə · qiymət hələ müəyyən edilməyib</small><ul>
          <li><Film size={14} />Daha çox və daha uzun video</li><li><ImagePlus size={14} />Daha yüksək foto limiti</li><li><Check size={14} />Əlavə imkanlar yalnız real istifadəyə əsasən</li></ul></article>
      </div>
      <p className="lp-small">Hazırda heç bir ödəniş qəbul edilmir. Ödənişli plan açılarsa, qiymət əvvəlcədən göstəriləcək və mövcud məlumatlarınız itməyəcək.</p>
    </section>

    <section className="lp-section wrap lp-faq" id="faq">
      <div className="lp-head"><div className="eyebrow">Suallar</div><h2 className="font-display">Tez-tez verilən suallar</h2></div>
      <div>{FAQ.map((f) => <details key={f.q} className="lp-faq-item"><summary>{f.q}<ChevronDown size={17} /></summary><p>{f.a}</p></details>)}</div>
    </section>

    <section className="lp-section wrap" id="tools">
      <div className="lp-head"><div className="eyebrow">Digər alətlər</div><h2 className="font-display">Təhvildən sonra da işinizə yarayar.</h2></div>
      <div className="lp-tools">
        <Link href="/homes" className="lp-tool" data-testid="tool-passport"><House size={20} /><span><b>Ev pasportu</b><small>Otaqlar, avadanlıq, gizli xətlər, təmir tarixçəsi</small></span><ArrowRight size={15} /></Link>
        <Link href="/kiraye" className="lp-tool" data-testid="tool-rental"><KeyRound size={20} /><span><b>Kirayə təhvili</b><small>Kirayə mənzilinin giriş və çıxış protokolu, müqayisə</small></span><ArrowRight size={15} /></Link>
        <Link href="/ai-smeta" className="lp-tool" data-testid="tool-smeta"><Calculator size={20} /><span><b>AI smeta</b><small>Təmir və tikinti xərclərinin ilkin hesablanması</small></span><ArrowRight size={15} /></Link>
      </div>
    </section>

    <section className="lp-final wrap"><div>
      <ClipboardCheck size={22} />
      <h2 className="font-display">Növbəti təhvili qeydə alın.</h2>
      <p>Pilot mərhələsində pulsuzdur. Ayrıca tətbiq lazım deyil.</p>
      <div className="lp-svc-ctas center"><Link href="/protokol/yeni" className="button button-primary lp-big" data-testid="cta-final">Pulsuz protokol yarat<ArrowRight size={16} /></Link></div>
    </div></section>

    <Partners lang={lang} />
    <footer className="landing-footer wrap"><Brand /><p>Tehvil.az — evin tikintidən təhvilə qədər rəqəmsal tarixçəsi: mərhələlər üzrə foto və açar təhvili günü tərəflərin təsdiqlədiyi protokol. Hesabdakı təsdiq audit qeydidir, ixtisaslı elektron imza deyil; hüquqi zəmanət verilmir.</p><LanguagePicker lang={lang} change={change} />
      <nav className="landing-legal" aria-label="Bələdçilər"><a href="/menzil-tehvil-teslim-akti.html">Mənzil təhvil-təslim aktı</a><a href="/ev-temiri-ve-tikinti-smetasi.html">Təmir və tikinti smetası</a><a href="/temir-tehvil-akti.html">Təmir işlərinin təhvil aktı</a><a href="/temir-islerinin-qebulu.html">Təmir işlərinin qəbulu</a><a href="/podratci-ile-razilasma.html">Podratçı ilə razılaşma</a><a href="/temir-elave-isler.html">Əlavə işlər və dəyişikliklər</a></nav>
      <nav className="landing-legal"><a href="/privacy.html">Məxfilik siyasəti</a><a href="/terms.html">İstifadə şərtləri</a></nav>
      <address className="landing-contact"><a href="mailto:support@tehvil.az">support@tehvil.az</a><a href="tel:+994503066626">+994 50 306 66 26</a><a href="https://wa.me/994503066626" target="_blank" rel="noopener noreferrer">WhatsApp</a><span>Bakı, Səbail rayonu, Badamdar qəsəbəsi, 26-cı küçə, 20</span></address>
    </footer>
  </div>;
}

/** A phone showing a protocol in progress. Labelled as an example. */
function ProtocolArt() {
  const [tab, setTab] = useState<'history' | 'protocol'>('history');
  const tabs = <div className="lp-ph-tabs" role="tablist" aria-label="Nümunə">
    <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')} data-testid="mock-tab-history">Tarixçə</button>
    <button type="button" role="tab" aria-selected={tab === 'protocol'} className={tab === 'protocol' ? 'on' : ''} onClick={() => setTab('protocol')} data-testid="mock-tab-protocol">Təhvil protokolu</button>
  </div>;
  return <div className="lp-phone" data-testid="landing-mock">
    <div className="lp-mock-tag">Nümunə · real ev deyil</div>
    {tab === 'history' ? <div className="lp-phone-screen" data-testid="mock-history">
      {tabs}
      <small>Xətai, yeni tikili · Blok A, m. 42</small>
      <div className="lp-ph-stages" aria-label="Mərhələlər: 7/12">{Array.from({ length: 12 }, (_, i) => <i key={i} className={i < 6 ? 'done' : i === 6 ? 'now' : ''} />)}</div>
      <div className="lp-ph-stage-now"><b>Suvaq</b><small>7-ci mərhələ · tarixçə aparılır</small></div>
      <div className="lp-ph-photo"><span>Son foto</span></div>
      <div className="lp-ph-row"><Camera size={13} />8 foto · 14 okt 2026, 10:35</div>
      <div className="lp-ph-row"><MapPin size={13} />GPS məlumatı qeydə alınıb</div>
      <div className="lp-ph-btn"><Camera size={14} />Foto çək</div>
      <div className="lp-ph-btn alt"><ImagePlus size={14} />Şəkil yüklə</div>
      <div className="lp-ph-links"><span>Tarixçəyə bax</span><button type="button" onClick={() => setTab('protocol')}>Təhvil protokolu →</button></div>
    </div> : <div className="lp-phone-screen" data-testid="mock-protocol">
      {tabs}
      <small>Yasamal, Şərifzadə 12 · № TP-2026-…</small>
      <div className="lp-ph-progress"><span style={{ width: '66%' }} /></div>
      {[['Qonaq otağı', 'Yaxşı · 4 foto', 'ok'], ['Mətbəx', 'Qüsurlu · kran damcılayır', 'bad'], ['Hamam və tualet', 'Qənaətbəxş · 3 foto', 'mid'], ['Dəhliz', 'yoxlanmayıb', '']].map(([n, s, c]) =>
        <div key={n} className={`lp-ph-room ${c}`}><i>{c ? <Check size={11} /> : null}</i><span><b>{n}</b><small>{s}</small></span></div>)}
      <div className="lp-ph-row"><Gauge size={13} />Su: 00342,6 · Qaz: 1290</div>
      <div className="lp-ph-row"><KeyRound size={13} />Açar: 3 · Domofon çipi: 2</div>
      <div className="lp-ph-sign"><span className="ok">Satıcı ✓</span><span>Alıcı …</span></div>
      <div className="lp-ph-btn"><Camera size={14} />Foto çək</div>
    </div>}
  </div>;
}
