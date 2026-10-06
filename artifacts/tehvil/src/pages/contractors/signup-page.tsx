import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { AuthenticateWithRedirectCallback, useClerk, useUser } from '@clerk/react';
import { useSignUp } from '@clerk/react/legacy';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, MailCheck } from 'lucide-react';
import { Button } from '@/components/kit';
import { track } from '@/lib/analytics';
import { savePendingSignup } from '@/lib/contractor/signup';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const SSO_CALLBACK_PATH = '/podratcilar-ucun/qeydiyyat/sso-callback';

type ClerkLikeError = { errors?: { code?: string; meta?: { paramName?: string } }[] };
const errorCode = (e: unknown) => (e as ClerkLikeError)?.errors?.[0]?.code ?? '';

const MESSAGES: Record<string, string> = {
  form_identifier_exists: 'Bu e-poçt ilə hesab artıq mövcuddur. Daxil olun və ya başqa e-poçt yazın.',
  form_password_pwned: 'Bu şifrə məlumat sızmalarında rast gəlinib. Təhlükəsizlik üçün başqa şifrə seçin.',
  form_password_length_too_short: 'Şifrə ən azı 8 simvoldan ibarət olmalıdır.',
  form_password_not_strong_enough: 'Şifrə kifayət qədər güclü deyil. Hərf, rəqəm və simvol əlavə edin.',
  form_password_validation_failed: 'Şifrə tələblərə uyğun deyil. Daha uzun və mürəkkəb şifrə seçin.',
  form_param_format_invalid: 'E-poçt ünvanı düzgün deyil.',
  form_code_incorrect: 'Kod yanlışdır. E-poçtdakı 6 rəqəmli kodu yoxlayın.',
  verification_expired: 'Kodun müddəti bitib. Yeni kod göndərin.',
  verification_failed: 'Təsdiq alınmadı. Yeni kod göndərib yenidən cəhd edin.',
  too_many_requests: 'Çox sayda cəhd edildi. Bir neçə dəqiqə sonra yenidən yoxlayın.',
  captcha_invalid: 'Təhlükəsizlik yoxlaması alınmadı. Səhifəni yeniləyib yenidən cəhd edin.',
  captcha_unavailable: 'Təhlükəsizlik yoxlaması yüklənmədi. Səhifəni yeniləyib yenidən cəhd edin.',
};
const GENERIC = 'Qeydiyyat tamamlanmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.';
const messageFor = (e: unknown) => MESSAGES[errorCode(e)] ?? GENERIC;

/** Google is shown only when the Clerk instance has it enabled (read from Clerk's loaded environment). */
function useGoogleEnabled(): boolean {
  const clerk = useClerk() as unknown as { loaded?: boolean; __internal_environment?: { userSettings?: { socialProviderStrategies?: string[] } } };
  try { return Boolean(clerk.__internal_environment?.userSettings?.socialProviderStrategies?.includes('oauth_google')); } catch { return false; }
}

function GoogleMark() {
  return <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.8l-8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>;
}

function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-page" lang="az">
    <div className="auth-side">
      <Link href="/podratcilar-ucun" className="brand inverse"><span className="brand-mark">t.</span><span>Təhvil</span></Link>
      <div>
        <div className="eyebrow">Podratçılar üçün</div>
        <h1 className="font-display">Smetanı göndər.{'\n'}Təsdiqi al.</h1>
        <ul className="ct-auth-side-list">
          <li><CheckCircle2 size={16} />Kredit kartı tələb olunmur</li>
          <li><CheckCircle2 size={16} />İlk layihənizi dəqiqələr içində yaradın</li>
          <li><CheckCircle2 size={16} />Sifarişçi üçün sadə paylaşım linki</li>
        </ul>
      </div>
      <span>BAKI · PODRATÇI HESABI</span>
    </div>
    <div className="auth-form-side">{children}</div>
  </div>;
}

export function ContractorSignupPage() {
  const { isSignedIn } = useUser();
  if (isSignedIn) return <Redirect to="/onboarding" />;
  return <AuthLayout><SignupForm /></AuthLayout>;
}

function SignupForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const google = useGoogleEnabled();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', terms: false });
  const [showPassword, setShowPassword] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'form' | 'code'>('form');
  const [code, setCode] = useState('');
  const started = useRef(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));
  const markStarted = (method: 'email' | 'google') => {
    if (started.current) return;
    started.current = true;
    track('contractor_signup_started', { method, source: 'landing' });
  };

  const digits = form.phone.replace(/\D/g, '').length;
  const errors = {
    fullName: form.fullName.trim().split(/\s+/).filter(Boolean).length < 2 ? 'Adınızı və soyadınızı yazın' : '',
    phone: digits < 9 || !/^[+0-9 ()-]+$/.test(form.phone.trim()) ? 'Telefon nömrəsini tam daxil edin, məs.: +994 50 123 45 67' : '',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? 'E-poçt ünvanını düzgün daxil edin' : '',
    password: form.password.length < 8 ? 'Şifrə ən azı 8 simvoldan ibarət olmalıdır' : '',
    terms: !form.terms ? 'Davam etmək üçün istifadə şərtləri və məxfilik siyasəti ilə razılaşın' : '',
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="ct-error">{errors[k]}</small> : null;

  const finish = async (sessionId: string | null, method: 'email' | 'google') => {
    if (!setActive || !sessionId) { setError(GENERIC); return; }
    await setActive({ session: sessionId });
    track('contractor_signup_completed', { method });
    navigate('/onboarding');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    markStarted('email');
    setTried(true); setError('');
    if (Object.values(errors).some(Boolean) || busy || !isLoaded) return;
    const [firstName, ...rest] = form.fullName.trim().split(/\s+/);
    const termsAcceptedAt = new Date().toISOString();
    savePendingSignup({ fullName: form.fullName.trim(), phone: form.phone.trim(), termsAcceptedAt, method: 'email' });
    const params = { emailAddress: form.email.trim(), password: form.password, unsafeMetadata: { signupIntent: 'contractor', phone: form.phone.trim(), termsAcceptedAt } };
    setBusy(true);
    try {
      let res;
      try { res = await signUp.create({ ...params, firstName, lastName: rest.join(' ') }); }
      catch (e2) { if (errorCode(e2) === 'form_param_unknown') res = await signUp.create(params); else throw e2; }
      if (res.status === 'complete') { await finish(res.createdSessionId, 'email'); return; }
      if (res.unverifiedFields.includes('email_address')) {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setStage('code');
        return;
      }
      setError('Hesab üçün əlavə məlumat tələb olunur. Standart qeydiyyat səhifəsindən davam edin.');
    } catch (e2) {
      setError(messageFor(e2));
    } finally { setBusy(false); }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) { setError('E-poçta göndərilən 6 rəqəmli kodu daxil edin.'); return; }
    if (!isLoaded || busy) return;
    setBusy(true);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete') { await finish(res.createdSessionId, 'email'); return; }
      setError('Hesab üçün əlavə məlumat tələb olunur. Standart qeydiyyat səhifəsindən davam edin.');
    } catch (e2) { setError(messageFor(e2)); } finally { setBusy(false); }
  };

  const resend = async () => {
    if (!isLoaded) return;
    setError('');
    try { await signUp.prepareEmailAddressVerification({ strategy: 'email_code' }); setError(''); setCode(''); }
    catch (e2) { setError(messageFor(e2)); }
  };

  const withGoogle = async () => {
    if (!form.terms) { setError(errors.terms); return; }
    if (!isLoaded) return;
    markStarted('google');
    const termsAcceptedAt = new Date().toISOString();
    savePendingSignup({ fullName: form.fullName.trim(), phone: form.phone.trim(), termsAcceptedAt, method: 'google' });
    try {
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: `${window.location.origin}${base}${SSO_CALLBACK_PATH}`,
        redirectUrlComplete: `${window.location.origin}${base}/onboarding`,
        unsafeMetadata: { signupIntent: 'contractor', termsAcceptedAt },
      });
    } catch (e2) { setError(messageFor(e2)); }
  };

  if (stage === 'code') return <form className="ct-auth ct-form ct-form-stack" onSubmit={verify} noValidate>
    <span className="sm-success-icon" style={{ alignSelf: 'flex-start' }}><MailCheck size={24} /></span>
    <div><div className="eyebrow">Addım 1 / 4</div><h1 className="font-display">E-poçtunuzu təsdiqləyin</h1>
      <p className="ct-card-lead"><b>{form.email.trim()}</b> ünvanına 6 rəqəmli kod göndərdik.</p></div>
    <label className="field"><span>Təsdiq kodu</span><input className="ct-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus data-testid="input-signup-code" /></label>
    {error && <div className="ct-alert" role="alert">{error}</div>}
    <Button type="submit" disabled={busy} testId="button-signup-verify">{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Təsdiqlə və davam et</Button>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <button type="button" className="sm-link-btn" onClick={() => { void resend(); }}>Kodu yenidən göndər</button>
      <button type="button" className="sm-link-btn" onClick={() => { setStage('form'); setCode(''); }}>E-poçtu dəyiş</button>
    </div>
  </form>;

  return <form className="ct-auth ct-form ct-form-stack" onSubmit={submit} onFocus={() => markStarted('email')} noValidate>
    <div><div className="eyebrow">Addım 1 / 4</div><h1 className="font-display">Təhvil-ə qoşulun</h1>
      <p className="ct-card-lead">Pulsuz hesab yaradın və ilk smetanızı bu gün göndərin.</p></div>
    <label className="field"><span>Ad və soyad<i> *</i></span><input value={form.fullName} onChange={e => set('fullName', e.target.value)} autoComplete="name" placeholder="Məs.: Rəşad Əliyev" aria-invalid={tried && !!errors.fullName} data-testid="input-signup-name" />{err('fullName')}</label>
    <label className="field"><span>Telefon nömrəsi<i> *</i></span><input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" placeholder="+994 50 123 45 67" aria-invalid={tried && !!errors.phone} data-testid="input-signup-phone" />{err('phone')}</label>
    <label className="field"><span>E-poçt<i> *</i></span><input type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" placeholder="ad@sirket.az" aria-invalid={tried && !!errors.email} data-testid="input-signup-email" />{err('email')}</label>
    <label className="field"><span>Şifrə<i> *</i></span>
      <span style={{ position: 'relative', display: 'block' }}>
        <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" placeholder="Ən azı 8 simvol" aria-invalid={tried && !!errors.password} style={{ paddingRight: 44 }} data-testid="input-signup-password" />
        <button type="button" className="icon-button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Şifrəni gizlət' : 'Şifrəni göstər'} style={{ position: 'absolute', right: 4, top: 4 }}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </span>{err('password')}</label>
    <label className="sm-check"><input type="checkbox" checked={form.terms} onChange={e => set('terms', e.target.checked)} data-testid="checkbox-signup-terms" /><span><a href="/terms.html" target="_blank" rel="noreferrer">İstifadə şərtləri</a> və <a href="/privacy.html" target="_blank" rel="noreferrer">məxfilik siyasəti</a> ilə tanış oldum.</span></label>
    {err('terms')}
    <div id="clerk-captcha" />
    {error && <div className="ct-alert" role="alert">{error}{error.includes('Standart') && <> <Link href="/sign-up">Standart qeydiyyat</Link></>}</div>}
    <Button type="submit" disabled={busy || !isLoaded} testId="button-signup-submit">{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Pulsuz başla</Button>
    {google && <>
      <div className="ct-divider">və ya</div>
      <Button variant="secondary" className="ct-google" onClick={() => { void withGoogle(); }} disabled={busy || !isLoaded} testId="button-signup-google"><GoogleMark />Google ilə davam et</Button>
    </>}
    <p className="ct-auth-foot">Artıq hesabınız var? <Link href="/sign-in">Daxil olun</Link></p>
  </form>;
}

/** Return URL for Google sign-up. Clerk finishes the OAuth handshake and redirects to `/onboarding`. */
export function ContractorSsoCallbackPage() {
  useEffect(() => { document.title = 'Təhvil'; }, []);
  return <AuthLayout>
    <div className="ct-auth" role="status" aria-live="polite"><LoaderCircle className="spin" size={20} /> Google hesabı yoxlanılır…</div>
    <div id="clerk-captcha" />
    <AuthenticateWithRedirectCallback signUpFallbackRedirectUrl={`${base}/onboarding`} signInFallbackRedirectUrl={`${base}/smeta`} />
  </AuthLayout>;
}
