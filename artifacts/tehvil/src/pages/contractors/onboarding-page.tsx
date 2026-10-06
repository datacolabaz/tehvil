import { useEffect, useRef, useState } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useUser } from '@clerk/react';
import { ArrowRight, Check, LoaderCircle, Rocket } from 'lucide-react';
import {
  updateContractorOnboarding, type ContractorAccount, type ContractorBusinessType, type ContractorChallenge,
  type ContractorMonthlyProjects, type ContractorOnboardingInput,
} from '@workspace/api-client-react';
import { Button, Loading } from '@/components/kit';
import { CompanyProfileForm } from '@/components/contractor/company-profile-form';
import { FIRST_PROJECT_STEPS } from '@/components/contractor/first-project-guide';
import { track } from '@/lib/analytics';
import { setContractorAccount, useContractorAccount } from '@/lib/contractor/account';
import { BUSINESS_TYPES, CHALLENGES, MONTHLY_PROJECTS } from '@/lib/contractor/options';
import { clearPendingSignup, readPendingSignup } from '@/lib/contractor/signup';

const STEP_LABELS = ['Hesab', 'İşiniz', 'Şirkət profili', 'İlk layihə'];

function Options<T extends string>({ name, legend, options, value, onChange, three }: { name: string; legend: string; options: { id: T; label: string }[]; value: T | ''; onChange: (v: T) => void; three?: boolean }) {
  return <fieldset className="ct-question">
    <legend>{legend}</legend>
    <div className={`ct-options ${three ? 'three' : ''}`} role="radiogroup" aria-label={legend}>
      {options.map(o => <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="ct-option" onClick={() => onChange(o.id)} data-testid={`option-${name}-${o.id}`}><i aria-hidden />{o.label}</button>)}
    </div>
  </fieldset>;
}

export function OnboardingPage() {
  const { account, status } = useContractorAccount();
  const { user } = useUser();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ businessType: ContractorBusinessType | ''; monthlyProjects: ContractorMonthlyProjects | ''; mainChallenge: ContractorChallenge | ''; phone: string }>({ businessType: '', monthlyProjects: '', mainChallenge: '', phone: '' });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const synced = useRef(false);

  const save = async (input: ContractorOnboardingInput) => {
    const next = await updateContractorOnboarding(input);
    setContractorAccount(next);
    return next;
  };

  // Moves sign-up answers (phone, name, consent) to the server once the Clerk account exists.
  useEffect(() => {
    if (!account || synced.current) return;
    synced.current = true;
    const pending = readPendingSignup();
    const meta = (user?.unsafeMetadata ?? {}) as { phone?: string; termsAcceptedAt?: string; signupIntent?: string };
    const fullName = pending?.fullName || user?.fullName || undefined;
    const phone = pending?.phone || meta.phone || undefined;
    const termsAccepted = Boolean(pending?.termsAcceptedAt || meta.termsAcceptedAt);
    if (pending?.method === 'google') track('contractor_signup_completed', { method: 'google' });
    const needsSync = (fullName && !account.onboarding.fullName) || (phone && !account.onboarding.phone) || termsAccepted;
    if (needsSync) {
      void save({ fullName: fullName?.slice(0, 120), phone: phone && /^[+0-9 ()-]*$/.test(phone) ? phone.slice(0, 32) : undefined, termsAccepted, signupSource: meta.signupIntent === 'contractor' || pending ? 'contractor_landing' : 'app' })
        .then(clearPendingSignup, () => { synced.current = false; });
    }
    setAnswers(a => ({
      ...a,
      businessType: account.onboarding.businessType ?? '', monthlyProjects: account.onboarding.monthlyProjects ?? '', mainChallenge: account.onboarding.mainChallenge ?? '',
      phone: account.onboarding.phone ?? phone ?? '',
    }));
    setStep(account.onboarding.status === 'completed' ? 4 : Math.min(4, Math.max(2, account.onboarding.step)));
  }, [account, user]);

  if (status === 'error' && !account) return <div className="ct-onboard"><div className="ct-onboard-main"><div className="ct-alert" role="alert">Hesab məlumatları yüklənmədi. Səhifəni yeniləyin.</div></div></div>;
  if (!account || step === null) return <div className="ct-onboard"><div className="ct-onboard-main"><Loading t={() => 'Yüklənir'} /></div></div>;
  if (account.plan.source === 'legacy') return <Redirect to="/smeta" />;

  const skip = async () => {
    setBusy(true);
    try { await save({ status: 'skipped' }); track('onboarding_completed', { skipped: true }); navigate('/smeta'); }
    catch { setError('Yadda saxlanılmadı. Yenidən cəhd edin.'); } finally { setBusy(false); }
  };

  const phoneNeeded = !account.onboarding.phone;
  const phoneError = phoneNeeded && answers.phone.replace(/\D/g, '').length < 9 ? 'Telefon nömrəsini tam daxil edin, məs.: +994 50 123 45 67' : '';
  const submitStep2 = async () => {
    setTried(true); setError('');
    if (!answers.businessType || !answers.monthlyProjects || !answers.mainChallenge || phoneError) return;
    setBusy(true);
    try {
      await save({ businessType: answers.businessType, monthlyProjects: answers.monthlyProjects, mainChallenge: answers.mainChallenge, phone: phoneNeeded ? answers.phone.trim() : undefined, step: 3 });
      setTried(false); setStep(3); window.scrollTo({ top: 0 });
    } catch { setError('Cavablar saxlanılmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.'); } finally { setBusy(false); }
  };

  const startFirstEstimate = async () => {
    setBusy(true);
    try {
      if (account.onboarding.status !== 'completed') {
        const next = await save({ status: 'completed', step: 4 });
        track('onboarding_completed', { businessType: next.onboarding.businessType, monthlyProjects: next.onboarding.monthlyProjects, mainChallenge: next.onboarding.mainChallenge });
      }
      navigate(account.checklist.items.firstEstimate ? '/smeta' : '/smeta/new?guide=1');
    } catch { setError('Yadda saxlanılmadı. Yenidən cəhd edin.'); setBusy(false); }
  };

  return <div className="ct-onboard" lang="az">
    <header className="ct-onboard-top wrap">
      <Link href="/podratcilar-ucun" className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></Link>
      {step < 4 && <button type="button" className="sm-link-btn" onClick={() => { void skip(); }} disabled={busy} data-testid="button-onboarding-skip">Sonra tamamlayaram</button>}
    </header>
    <main className="ct-onboard-main">
      <ol className="ct-steps" aria-label="Qeydiyyat addımları">{STEP_LABELS.map((l, i) => <li key={l} className={i + 1 < step ? 'done' : i + 1 === step ? 'active' : ''} aria-current={i + 1 === step ? 'step' : undefined}>{i + 1}. {l}</li>)}</ol>

      {step === 2 && <section className="ct-card" aria-labelledby="ob-title">
        <div className="eyebrow">Addım 2 / 4</div>
        <h1 id="ob-title" className="font-display">İşiniz haqqında qısa məlumat</h1>
        <p className="ct-card-lead">Cavablara görə ilk layihə üçün daha uyğun nümunə və ipuçları göstərəcəyik.</p>
        <Options name="business" legend="Əsas fəaliyyətiniz hansıdır?" options={BUSINESS_TYPES} value={answers.businessType} onChange={v => setAnswers(a => ({ ...a, businessType: v }))} three />
        {tried && !answers.businessType && <small role="alert" className="ct-error" style={{ marginTop: -10, marginBottom: 12 }}>Fəaliyyət növünü seçin</small>}
        <Options name="projects" legend="Ayda təxminən neçə layihə idarə edirsiniz?" options={MONTHLY_PROJECTS.map(o => ({ ...o, label: o.id === '10+' ? o.label : `${o.label} layihə` }))} value={answers.monthlyProjects} onChange={v => setAnswers(a => ({ ...a, monthlyProjects: v }))} />
        {tried && !answers.monthlyProjects && <small role="alert" className="ct-error" style={{ marginTop: -10, marginBottom: 12 }}>Layihə sayını seçin</small>}
        <Options name="challenge" legend="Bu gün ən çox hansı problemi həll etmək istəyirsiniz?" options={CHALLENGES} value={answers.mainChallenge} onChange={v => setAnswers(a => ({ ...a, mainChallenge: v }))} />
        {tried && !answers.mainChallenge && <small role="alert" className="ct-error" style={{ marginTop: -10, marginBottom: 12 }}>Əsas problemi seçin</small>}
        {phoneNeeded && <label className="field ct-form"><span>Telefon nömrəsi<i> *</i></span><input type="tel" value={answers.phone} onChange={e => setAnswers(a => ({ ...a, phone: e.target.value }))} autoComplete="tel" placeholder="+994 50 123 45 67" aria-invalid={tried && !!phoneError} />{tried && phoneError && <small role="alert" className="ct-error">{phoneError}</small>}</label>}
        {error && <div className="ct-alert" role="alert">{error}</div>}
        <div className="ct-actions"><span /><Button onClick={() => { void submitStep2(); }} disabled={busy} testId="button-onboarding-next">{busy ? <LoaderCircle className="spin" size={16} /> : null}Davam et<ArrowRight size={16} /></Button></div>
      </section>}

      {step === 3 && <section className="ct-card" aria-labelledby="ob-title">
        <div className="eyebrow">Addım 3 / 4</div>
        <h1 id="ob-title" className="font-display">Şirkət profilinizi yaradın</h1>
        <p className="ct-card-lead">Sifarişçi smetanı açanda kimin göndərdiyini və sizinlə necə əlaqə saxlayacağını görəcək.</p>
        <CompanyProfileForm
          variant="onboarding" profile={account.profile}
          seed={{ phone: account.onboarding.phone, email: user?.primaryEmailAddress?.emailAddress }}
          submitLabel="İlk smetamı yarat" submitIcon={<ArrowRight size={16} />}
          secondary={<Button variant="quiet" onClick={() => setStep(2)}>Geri</Button>}
          onSaved={async () => { try { await save({ step: 4 }); } catch { /* step is cosmetic */ } setStep(4); window.scrollTo({ top: 0 }); }}
        />
      </section>}

      {step === 4 && <FirstProjectStep account={account} busy={busy} error={error} onStart={() => { void startFirstEstimate(); }} />}
    </main>
  </div>;
}

function FirstProjectStep({ account, busy, error, onStart }: { account: ContractorAccount; busy: boolean; error: string; onStart: () => void }) {
  const items = account.checklist.items;
  const done = [items.firstEstimate, items.firstEstimate, items.estimateShared];
  const count = done.filter(Boolean).length;
  const pct = Math.round((count / 3) * 100);
  return <section className="ct-card" aria-labelledby="ob-title">
    <div className="eyebrow">Addım 4 / 4</div>
    <h1 id="ob-title" className="font-display">İlk layihənizi 3 addımda yaradın</h1>
    <p className="ct-card-lead">Yeni smeta sihirbazı sizi addım-addım aparacaq. Sifarişçi yalnız təsdiqlədiyiniz versiyanı görür.</p>
    <div className="ct-meter"><div className="ct-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="İlk layihə"><span style={{ width: `${pct}%` }} /></div><b>{pct}%</b></div>
    <ol className="ct-checklist">{FIRST_PROJECT_STEPS.map((s, i) => <li key={s} className={`ct-check-item ${done[i] ? 'done' : ''}`}><span aria-hidden><Check size={14} /></span><span className="ct-check-label">{s}</span></li>)}</ol>
    {error && <div className="ct-alert" role="alert" style={{ marginTop: 12 }}>{error}</div>}
    <div className="ct-actions">
      <Link href="/smeta" className="sm-link-btn">AI Smeta panelinə keç</Link>
      <Button onClick={onStart} disabled={busy} testId="button-onboarding-start">{busy ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}{count ? 'Davam et' : 'Yeni smeta yarat'}</Button>
    </div>
  </section>;
}
