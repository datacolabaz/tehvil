import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@clerk/react';
import {
  ArrowDownLeft, ArrowRight, BadgeCheck, Calculator, Camera, CheckCircle2, FilePlus2, FileSignature, Info, PhoneCall, TrendingDown, XCircle,
} from 'lucide-react';
import { Button } from '@/components/kit';
import { DEMO_CTA, DemoRequestForm } from '@/components/contractor/demo-request';
import { PricingCards } from '@/components/contractor/pricing';
import { ProductPreview } from '@/components/contractor/product-preview';
import { track } from '@/lib/analytics';
import { openUpgradeLead } from '@/lib/contractor/upgrade';
import { AFTER, AI_DISCLAIMER, BEFORE, BENEFITS, FLOW, HERO } from '@/lib/contractor/landing-content';
import { UpgradeHost } from '@/components/contractor/upgrade-host';

export const CONTRACTOR_SIGNUP_PATH = '/podratcilar-ucun/qeydiyyat';

const BENEFIT_ICON = { calculator: Calculator, signature: FileSignature, changes: FilePlus2, budget: TrendingDown, camera: Camera, brand: BadgeCheck } as const;

function Brand() {
  return <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark">t.</span><span>Təhvil</span></Link>;
}

export function ContractorLandingPage() {
  const [, navigate] = useLocation();
  const { isSignedIn } = useUser();

  useEffect(() => {
    const previous = document.title;
    document.title = 'Podratçılar üçün — Təhvil';
    track('contractor_landing_viewed', { referrer: document.referrer ? new URL(document.referrer).hostname : undefined });
    return () => { document.title = previous; };
  }, []);

  const start = () => navigate(isSignedIn ? '/smeta/new?guide=1' : CONTRACTOR_SIGNUP_PATH);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return <div className="ct-landing" lang="az">
    <header className="landing-nav ct-nav wrap">
      <Brand />
      <nav aria-label="Səhifə bölmələri"><a href="#nece-isleyir">Necə işləyir?</a><a href="#qiymetler">Planlar</a><a href="#demo">Demo</a></nav>
      <div className="landing-actions">
        {isSignedIn ? <Link href="/smeta" className="button button-primary">AI Smeta<ArrowRight size={16} /></Link> : <>
          <Link href="/sign-in" className="text-link">Daxil ol</Link>
          <Button onClick={() => start()} testId="button-nav-start">Pulsuz başla<ArrowRight size={16} /></Button>
        </>}
      </div>
    </header>

    <main>
      <section className="ct-hero wrap" aria-labelledby="ct-hero-title">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />{HERO.eyebrow}</div>
          <h1 id="ct-hero-title" className="font-display">{HERO.title}</h1>
          <p className="ct-hero-lead">{HERO.lead}</p>
          <div className="ct-hero-cta">
            <Button onClick={() => start()} testId="button-hero-start">{HERO.primary}<ArrowRight size={17} /></Button>
            <a href="#nece-isleyir" className="button button-secondary" onClick={e => { e.preventDefault(); scrollTo('nece-isleyir'); }}>{HERO.secondary}<ArrowDownLeft size={16} /></a>
          </div>
          <ul className="ct-trust">{HERO.trust.map(t => <li key={t}><CheckCircle2 size={16} aria-hidden />{t}</li>)}</ul>
        </div>
        <ProductPreview />
      </section>

      <section className="ct-section alt" id="nece-isleyir" aria-labelledby="ct-flow-title">
        <div className="wrap">
          <div className="ct-section-head">
            <div className="eyebrow">Necə işləyir?</div>
            <h2 id="ct-flow-title" className="font-display">Smetadan təhvilə qədər bir layihə</h2>
            <p>{HERO.value}</p>
          </div>
          <ol className="ct-flow">{FLOW.map((s, i) => <li key={s.title}><b>0{i + 1}</b><strong>{s.title}</strong><small>{s.text}</small></li>)}</ol>
        </div>
      </section>

      <section className="ct-section wrap" aria-labelledby="ct-why-title">
        <div className="ct-section-head">
          <div className="eyebrow">Niyə Təhvil</div>
          <h2 id="ct-why-title" className="font-display">Podratçılar Təhvil-dən niyə istifadə edir</h2>
        </div>
        <div className="ct-benefits">{BENEFITS.map(b => { const Icon = BENEFIT_ICON[b.icon]; return <article className="ct-benefit" key={b.title}><span className="ct-benefit-icon"><Icon size={19} aria-hidden /></span><h3>{b.title}</h3><p>{b.text}</p></article>; })}</div>
      </section>

      <section className="ct-section alt" aria-labelledby="ct-compare-title">
        <div className="wrap">
          <div className="ct-section-head">
            <div className="eyebrow">Əvvəl və sonra</div>
            <h2 id="ct-compare-title" className="font-display">Təhvil-dən əvvəl və Təhvil ilə</h2>
          </div>
          <div className="ct-compare">
            <div className="ct-compare-col before"><h3>Təhvil-dən əvvəl</h3><ul>{BEFORE.map(x => <li key={x}><XCircle size={17} aria-hidden /><span><span className="sr-only">Əvvəl: </span>{x}</span></li>)}</ul></div>
            <div className="ct-compare-col after"><h3>Təhvil ilə</h3><ul>{AFTER.map(x => <li key={x}><CheckCircle2 size={17} aria-hidden /><span><span className="sr-only">Təhvil ilə: </span>{x}</span></li>)}</ul></div>
          </div>
        </div>
      </section>

      <section className="ct-section wrap" id="qiymetler" aria-labelledby="ct-pricing-title">
        <div className="ct-section-head">
          <div className="eyebrow">Planlar</div>
          <h2 id="ct-pricing-title" className="font-display">Pulsuz başlayın, ehtiyac olduqda genişləndirin</h2>
          <p>Onlayn ödəniş yoxdur. Peşəkar və Biznes planlarının şərtlərini komandamızla razılaşdırırsınız.</p>
        </div>
        <PricingCards onStart={() => start()} onContact={plan => { track('upgrade_clicked', { plan, source: 'pricing' }); openUpgradeLead(plan, 'pricing'); }} />
      </section>

      <section className="ct-section alt" id="demo" aria-labelledby="ct-demo-title">
        <div className="wrap ct-demo">
          <div className="ct-section-head">
            <div className="eyebrow">Demo</div>
            <h2 id="ct-demo-title" className="font-display">{DEMO_CTA}</h2>
            <p>Öz layihənizin nümunəsi ilə smeta, sifarişçi təsdiqi və əlavə işlərin necə işlədiyini göstərək. Zəngi sizə uyğun vaxtda edirik.</p>
            <p style={{ marginTop: 14 }}><a className="text-link" href="tel:+994503066626"><PhoneCall size={14} aria-hidden style={{ verticalAlign: -2, marginRight: 6 }} />+994 50 306 66 26</a></p>
          </div>
          <div className="ct-demo-card"><DemoRequestForm source="contractor_landing" /></div>
        </div>
      </section>

      <section className="closing wrap" style={{ marginTop: 64 }}>
        <div className="closing-inner">
          <div className="closing-mark">t.</div>
          <div><div className="eyebrow">{HERO.eyebrow}</div><h2 className="font-display">İlk smetanızı bu gün göndərin</h2><p>{HERO.trust.join(' · ')}</p></div>
          <Button onClick={() => start()}>{HERO.primary}<ArrowRight size={16} /></Button>
        </div>
      </section>
      <div className="wrap" style={{ marginBottom: 28 }}><p className="ct-disclaimer"><Info size={15} aria-hidden />{AI_DISCLAIMER}</p></div>
    </main>

    <footer className="landing-footer wrap">
      <Brand />
      <p>Təmir layihəsi üçün smeta, təsdiq və təhvil qeydləri.</p>
      <nav className="landing-legal" aria-label="Keçidlər"><Link href="/">Sifarişçilər üçün</Link><a href="#qiymetler">Planlar</a><a href="/privacy.html">Məxfilik siyasəti</a><a href="/terms.html">İstifadə şərtləri</a></nav>
      <address className="landing-contact"><a href="mailto:support@tehvil.az">support@tehvil.az</a><a href="tel:+994503066626">+994 50 306 66 26</a><a href="https://wa.me/994503066626" target="_blank" rel="noopener noreferrer">WhatsApp</a></address>
    </footer>
    <UpgradeHost />
  </div>;
}
