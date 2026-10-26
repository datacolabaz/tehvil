import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Calculator, Camera, ChevronDown, FileSpreadsheet, FileText, History, Info, Menu, MessageCircleQuestion, ReceiptText, Wallet, X } from 'lucide-react';
import { Brand } from '@/components/kit';
import { LanguagePicker } from '@/components/language-picker';
import type { Lang } from '@/lib/i18n';
import './landing-two.css';
import { CalcBlocks } from './calc/calc-pages';

/**
 * Landing (Azerbaijani): two tools only — AI Smeta and "Evimin xərcləri"; the home history is a small link.
 * Signed-out visitors go through sign-up and land straight in the tool they picked.
 */
const FAQ = [
  { q: 'AI smetası mühəndis layihəsini əvəz edirmi?', a: 'Xeyr. AI çertyojdan ölçüləri oxumağa kömək edir, hesablamalar isə açıq düsturlarla aparılır. Bilinməyən ölçünü uydurmur — sizdən soruşur. Konstruktiv təhlükəsizliyi mühəndis yoxlamalıdır.' },
  { q: 'Hansı faylları yükləmək olar?', a: 'PDF çertyoj, şəkil (JPG, PNG, WebP), skan və Excel material siyahısı. DWG, DXF və IFC hələ oxunmur — belə faylı PDF kimi çap edib yükləyin.' },
  { q: 'Qəbz oxunmasa nə olur?', a: 'Məbləği və adı özünüz yazırsınız — bir neçə saniyə. Sistem məbləği heç vaxt uydurmur; oxunanı yoxlamağınızı istəyir.' },
  { q: 'Excel faylı necə alınır?', a: 'Xərclər və smeta səhifəsində “Excel yüklə” düyməsi var. Cəmlər faylda düstur kimidir — Excel-də dəyişsəniz də düzgün hesablanır.' },
  { q: 'Qiyməti nədir?', a: 'Pilot mərhələsində pulsuzdur. Ödənişli imkanlar olarsa, qiymət əvvəlcədən aydın göstəriləcək.' },
  { q: 'Məlumatlarımı kim görür?', a: 'Yalnız siz və özünüzün dəvət etdiyiniz şəxslər. Qəbzlər və çertyojlar açıq internetdə yerləşdirilmir.' },
];

export function TwoToolsLanding({ lang, change }: { lang: Lang; change: (v: Lang) => void }) {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  return <div className="l2">
    <header className="l2-nav wrap">
      <Brand />
      <nav className={`l2-links ${menu ? 'open' : ''}`} aria-label="Bölmələr">
        <a href="#smeta" onClick={() => setMenu(false)}>AI Smeta</a><a href="#xercler" onClick={() => setMenu(false)}>Evimin xərcləri</a><a href="#suallar" onClick={() => setMenu(false)}>Suallar</a>
        <Link href="/sign-in" className="l2-signin-m">Daxil ol</Link>
      </nav>
      <div className="l2-actions"><LanguagePicker lang={lang} change={change} compact /><Link href="/sign-in" className="l2-signin">Daxil ol</Link><Link href="/sign-up?redirect=/baslangic" className="button button-primary">Pulsuz başla</Link>
        <button className="l2-burger" aria-label="Menyu" onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button></div>
    </header>

    <section className="l2-hero wrap">
      <div className="eyebrow"><span className="eyebrow-dot" />TEHVIL.AZ</div>
      <h1 className="font-display" data-testid="l2-title">Tikinti xərclərini əvvəlcədən hesablayın və nəzarətdə saxlayın</h1>
      <p className="l2-lead">Çertyojdan material smetası, qəbzin şəklindən xərc jurnalı. Telefonda, Azərbaycan dilində, bir yerdə.</p>
      <div className="l2-tools" data-testid="l2-tools">
        <article className="l2-tool" id="smeta" data-testid="tool-smeta">
          <span className="l2-icon"><Calculator size={26} /></span>
          <h2>AI Smeta</h2>
          <p>Layihəni yüklə, tikinti materiallarını və təxmini xərcləri hesabla.</p>
          <ul><li><FileText size={15} />PDF çertyoj, şəkil və ya material siyahısı</li><li><MessageCircleQuestion size={15} />Bilinməyən ölçünü AI soruşur, uydurmur</li><li><FileSpreadsheet size={15} />Beton, armatur, qəlib — Excel-ə</li></ul>
          <Link href="/sign-up?redirect=/smeta-ai/yeni" className="button button-primary l2-cta" data-testid="cta-smeta">Smeta yarat<ArrowRight size={17} /></Link>
        </article>
        <article className="l2-tool" id="xercler" data-testid="tool-expenses">
          <span className="l2-icon"><Wallet size={26} /></span>
          <h2>Evimin xərcləri</h2>
          <p>Xərclərini qeyd et, büdcəni və indiyə qədər nə qədər pul xərclədiyini gör.</p>
          <ul><li><Camera size={15} />Qəbzin şəklini çək — AI oxuyur, sən təsdiqləyirsən</li><li><ReceiptText size={15} />Və ya məbləği əl ilə yaz — bir neçə saniyə</li><li><FileSpreadsheet size={15} />İstənilən tarix aralığı və Excel</li></ul>
          <Link href="/sign-up?redirect=/xercler?add=1" className="button button-primary l2-cta" data-testid="cta-expenses">Xərc əlavə et<ArrowRight size={17} /></Link>
        </article>
      </div>
      <Link href="/sign-up?redirect=/homes" className="l2-history" data-testid="link-history"><History size={16} />Evimin tarixçəsi — tikinti fotoları mərhələlər üzrə<ArrowRight size={14} /></Link>
    </section>

    <CalcBlocks />
    <section className="l2-how wrap" aria-label="Necə işləyir">
      <div><h3>AI Smeta necə işləyir</h3><ol><li><b>Faylı yükləyin.</b> Çertyoj PDF-i, plan şəkli və ya mühəndisin material siyahısı.</li><li><b>Suallara cavab verin.</b> AI çertyojda görə bilmədiyi ölçünü və armatur diametrini soruşur; “bilmirəm” də demək olar.</li><li><b>Smetanı alın.</b> Beton m³, armatur kq/ton, qəlib və taxta — hər sətrin izahı ilə. Qiyməti yazın, Excel-ə çıxarın.</li></ol></div>
      <div><h3>Evimin xərcləri necə işləyir</h3><ol><li><b>Evi bir dəfə yaradın.</b> Yalnız ad kifayətdir; büdcə istəyə bağlıdır.</li><li><b>Qəbzi çəkin və ya məbləği yazın.</b> AI satıcını, tarixi və məbləği oxuyur, siz təsdiqləyirsiniz.</li><li><b>Görün və yükləyin.</b> Ümumi xərc, bu ay, büdcədən qalan, kateqoriyalar və Excel.</li></ol></div>
    </section>

    <section className="l2-honest wrap"><Info size={18} /><p>AI smetası mühəndis layihəsini və konstruktiv yoxlamanı əvəz etmir. Hər rəqəmin hansı ölçü və düsturdan gəldiyi göstərilir; çertyojda olmayan məlumat “Dəqiqləşdirilməlidir” kimi qalır.</p></section>

    <section className="l2-faq wrap" id="suallar"><h2 className="font-display">Suallar</h2>
      {FAQ.map((f, i) => <div key={i} className={`l2-q ${open === i ? 'open' : ''}`}><button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>{f.q}<ChevronDown size={18} /></button>{open === i && <p>{f.a}</p>}</div>)}
    </section>

    <footer className="l2-foot wrap"><Brand /><span>Bakı · Tikinti smetası və ev xərcləri</span><span className="l2-foot-links"><Link href="/protokollar">Təhvil protokolu</Link><Link href="/kiraye">Kirayə</Link><a href="/realtor">Rieltorlar</a></span></footer>
  </div>;
}
