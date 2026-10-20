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
type Role = 'realtor' | 'seller' | 'buyer';
const ROLES: { id: Role; label: string; text: string }[] = [
  { id: 'seller', label: 'Satıcı', text: 'Mənzili hansı vəziyyətdə təhvil verdiyinizi foto və qeydlərlə sənədləşdirin, alıcını linklə dəvət edin.' },
  { id: 'buyer', label: 'Alıcı', text: 'Mənzili hansı vəziyyətdə qəbul etdiyinizi qeydə alın. Sizə link göndərilibsə, onu açın — qeydiyyatsız baxa bilərsiniz.' },
  { id: 'realtor', label: 'Rieltor', text: 'İstəyə bağlı: protokolu siz hazırlayın, satıcı və alıcını dəvət edin. Təsdiqi satıcı və alıcı özləri verir.' },
];
const BENEFITS = [
  [<Camera size={20} key="c" />, 'Mənzilin vəziyyətini fotoşəkillərlə qeydə alın', 'Otaq-otaq foto, qeyd və qüsurlar — telefonla, evin içində.'],
  [<Check size={20} key="a" />, 'Satıcı və alıcının təsdiqlərini eyni protokolda toplayın', 'Hər tərəf ayrıca təsdiqləyir; kim və nə vaxt — qeydə alınır.'],
  [<FileText size={20} key="f" />, 'PDF protokolu yaradın və tərəflərlə paylaşın', 'Foto, sayğac, açar və təsdiqlərlə yekun sənəd — WhatsApp-da göndərin.'],
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
  { q: 'Qiyməti nədir?', a: 'Pilot mərhələsində bütün funksiyalar pulsuzdur: protokol, fotolar, dəvətlər, təsdiqlər və PDF. Satıcı, alıcı və rieltor eyni protokol üçün heç nə ödəmir. Gələcəkdə ödənişli imkanlar olarsa, qiymət əvvəlcədən aydın göstəriləcək.' },
  { q: 'Rieltor olmadan istifadə etmək olarmı?', a: 'Bəli. Satıcı və ya alıcı protokolu özü yarada bilər. Rieltor varsa, protokolu hazırlaya və tərəfləri dəvət edə bilər, adı və agentliyi PDF-də göstərilir; lakin onun iştirakı satıcının və ya alıcının təsdiqini əvəz etmir.' },
  { q: 'Bu, mübahisələrə son qoyurmu?', a: 'Xeyr, belə zəmanət yoxdur. Protokol təhvil günü tərəflərin razılaşdığı vəziyyəti sənədləşdirir və sonradan yarana biləcək anlaşılmazlıqları azaltmağa kömək edir. Sübut kimi qəbul edilməsi konkret şəraitdən və qanunvericilikdən asılıdır.' },
];

export function HomePassportLanding({ lang, change }: { lang: Lang; change: (v: Lang) => void }) {
  const [menu, setMenu] = useState(false);
  const [role, setRole] = useState<Role>('seller');
  const nav = [['#how', 'Necə işləyir'], ['#inside', 'Protokolda nə var'], ['#faq', 'Suallar'], ['#tools', 'Digər alətlər']];
  const current = ROLES.find((r) => r.id === role)!;
  return <div className="lp">
    <header className="lp-nav wrap">
      <Brand />
      <nav className={`lp-links ${menu ? 'open' : ''}`} aria-label="Bölmələr">{nav.map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)}>{l}</a>)}<Link href="/sign-in" className="lp-signin-m">Daxil ol</Link></nav>
      <div className="lp-actions"><LanguagePicker lang={lang} change={change} /><Link href="/sign-in" className="text-link lp-signin">Daxil ol</Link><Link href="/protokol/yeni" className="button button-primary lp-signup" data-testid="landing-signup">Pulsuz başla</Link>
        <button type="button" className="lp-burger" aria-label="Menyu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button></div>
    </header>

    <section className="lp-hero2 lp-hero-pt wrap">
      <div className="lp-hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" />Tehvil.az</div>
        <h1 className="font-display">Açarı təhvil verin, mənzilin vəziyyətini qeydə alın.</h1>
        <p>Satıcı və alıcı mənzilin vəziyyətini fotoşəkillər, qeydlər, sayğac göstəriciləri və açar məlumatları ilə vahid rəqəmsal protokolda təsdiqləsin.</p>
        <div className="lp-roles" role="radiogroup" aria-label="Bu təhvildə siz kimsiniz?" data-testid="landing-roles">
          {ROLES.map((r) => <button key={r.id} type="button" role="radio" aria-checked={role === r.id} className={role === r.id ? 'on' : ''} onClick={() => setRole(r.id)} data-testid={`landing-role-${r.id}`}>{r.label}</button>)}
        </div>
        <p className="lp-role-text" data-testid="landing-role-text">{current.text}</p>
        <div className="lp-svc-ctas">
          <Link href={`/protokol/yeni?rol=${role}`} className="button button-primary lp-big" data-testid="cta-protocol"><ClipboardCheck size={17} />Pulsuz protokol yarat<ArrowRight size={16} /></Link>
          <a href="#how" className="button button-secondary lp-big" data-testid="cta-how">Necə işləyir?</a>
        </div>
        {role !== 'realtor' && <a href="#link" className="lp-have-link" data-testid="cta-have-link"><Link2 size={15} />Mənə link göndərilib</a>}
        <p className="lp-honest"><ShieldCheck size={16} />Təsdiq hesabınız, tarix-saat və versiya ilə qeydə alınır; ixtisaslı elektron imza deyil. Protokol hüquqi zəmanət vermir — anlaşılmazlıq riskini azaltmağa kömək edir.</p>
      </div>
      <ProtocolArt />
    </section>
    <section className="lp-section wrap lp-benefits" data-testid="benefits">
      <div className="lp-why-grid light">{BENEFITS.map(([i, t, d], k) => <div key={String(t)} className="lp-why-item"><span>{i}</span><h3>{k + 1}. {t}</h3><p>{d}</p></div>)}</div>
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
    <footer className="landing-footer wrap"><Brand /><p>Tehvil.az — mənzil alqı-satqısında açar təhvili günü evin vəziyyətini foto, qeydlər və tərəflərin təsdiqi ilə sənədləşdirən rəqəmsal protokol. Hesabdakı təsdiq audit qeydidir, ixtisaslı elektron imza deyil; hüquqi zəmanət verilmir.</p><LanguagePicker lang={lang} change={change} />
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
      <small>Yasamal, Şərifzadə 12 · № TP-2026-…</small>
      <div className="lp-ph-progress"><span style={{ width: '66%' }} /></div>
      {[['Qonaq otağı', 'Yaxşı · 4 foto', 'ok'], ['Mətbəx', 'Qüsurlu · kran damcılayır', 'bad'], ['Hamam və tualet', 'Qənaətbəxş · 3 foto', 'mid'], ['Dəhliz', 'yoxlanmayıb', '']].map(([n, s, c]) =>
        <div key={n} className={`lp-ph-room ${c}`}><i>{c ? <Check size={11} /> : null}</i><span><b>{n}</b><small>{s}</small></span></div>)}
      <div className="lp-ph-row"><Gauge size={13} />Su: 00342,6 · Qaz: 1290</div>
      <div className="lp-ph-row"><KeyRound size={13} />Açar: 3 · Domofon çipi: 2</div>
      <div className="lp-ph-sign"><span className="ok">Satıcı ✓</span><span>Alıcı …</span></div>
      <div className="lp-ph-btn"><Camera size={14} />Foto çək</div>
    </div>
  </div>;
}
