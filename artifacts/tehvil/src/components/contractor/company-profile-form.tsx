import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Building2, ImagePlus, LoaderCircle, Plus, Trash2, Users, WalletCards } from 'lucide-react';
import {
  removeCompanyLogo, requestUploadUrl, saveCompanyProfile, setCompanyLogo,
  type CompanyPaymentTerms, type CompanyProfile, type CompanyProfileInput, type ContractorAccount,
} from '@workspace/api-client-react';
import { Button } from '@/components/kit';
import { track } from '@/lib/analytics';
import { setContractorAccount } from '@/lib/contractor/account';
import { CITIES, PAYMENT_PRESETS, SERVICE_SUGGESTIONS, isPaymentTerms } from '@/lib/contractor/options';
import { gateFeature } from '@/lib/contractor/upgrade';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX = 2 * 1024 * 1024;

export const PROFILE_HELPER = 'Bu məlumatlar sifarişçiyə göndərdiyiniz smeta səhifəsində görünəcək.';

/** Uploads through the private evidence storage, then attaches the object as the company logo. */
async function uploadLogo(file: File): Promise<ContractorAccount> {
  const meta = await requestUploadUrl({ name: file.name, size: file.size, contentType: file.type });
  const put = await fetch(meta.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!put.ok) throw new Error('upload-failed');
  return setCompanyLogo({ objectPath: meta.objectPath, originalName: file.name, contentType: file.type as 'image/png', size: file.size });
}

interface Draft {
  companyName: string; description: string; city: string; serviceArea: string; phone: string; email: string; website: string; instagram: string;
  services: string[]; teamMembers: { name: string; role: string }[];
  defaultPaymentTerms: CompanyPaymentTerms; paymentTermsNote: string; validityDays: string; wastePct: string; marginPct: string;
}

function draftFrom(p: CompanyProfile | undefined, seed: { phone?: string; email?: string; companyName?: string }): Draft {
  return {
    companyName: p?.companyName ?? seed.companyName ?? '', description: p?.description ?? '', city: p?.city ?? 'Bakı', serviceArea: p?.serviceArea ?? '',
    phone: p?.phone ?? seed.phone ?? '', email: p?.email ?? seed.email ?? '', website: p?.website ?? '', instagram: p?.instagram ?? '',
    services: p?.services ?? [], teamMembers: p?.teamMembers ?? [],
    defaultPaymentTerms: p && isPaymentTerms(p.defaultPaymentTerms) ? p.defaultPaymentTerms : '30-40-30',
    paymentTermsNote: p?.paymentTermsNote ?? '',
    validityDays: String(p?.defaultValidityDays ?? 30),
    wastePct: p?.defaultWastePercentage == null ? '' : String(Math.round(p.defaultWastePercentage * 1000) / 10),
    marginPct: String(p ? Math.round(p.defaultMarginPercentage * 1000) / 10 : 15),
  };
}

const num = (v: string) => { const n = Number(v.replace(',', '.').trim()); return v.trim() === '' || !Number.isFinite(n) ? null : n; };
const digits = (v: string) => v.replace(/\D/g, '').length;

export function CompanyProfileForm({ variant, profile, seed = {}, submitLabel, submitIcon, onSaved, secondary }: {
  variant: 'onboarding' | 'full';
  profile?: CompanyProfile;
  seed?: { phone?: string; email?: string; companyName?: string };
  submitLabel: string;
  submitIcon?: ReactNode;
  onSaved: (account: ContractorAccount) => void;
  secondary?: ReactNode;
}) {
  const [d, setD] = useState<Draft>(() => draftFrom(profile, seed));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [newService, setNewService] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));
  const full = variant === 'full';

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);
  const shownLogo = logoPreview ?? (logoRemoved ? null : profile?.logoUrl ?? null);

  const validity = num(d.validityDays), waste = num(d.wastePct), margin = num(d.marginPct);
  const errors = {
    companyName: d.companyName.trim().length < 2 ? 'Şirkət və ya briqada adını daxil edin' : '',
    phone: digits(d.phone) < 9 || !/^[+0-9 ()-]*$/.test(d.phone.trim()) ? 'Telefon nömrəsini tam daxil edin, məs.: +994 50 123 45 67' : '',
    email: d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()) ? 'E-poçt ünvanı düzgün deyil' : '',
    city: !d.city.trim() ? 'Şəhəri seçin və ya yazın' : '',
    website: d.website.trim() && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(d.website.trim()) ? 'Sayt ünvanı düzgün deyil, məs.: ustatemir.az' : '',
    validityDays: validity === null || !Number.isInteger(validity) || validity < 7 || validity > 90 ? 'Müddət 7 ilə 90 gün arasında olmalıdır' : '',
    wastePct: waste !== null && (waste < 0 || waste > 50) ? 'Tullantı faizi 0 ilə 50 arasında olmalıdır' : '',
    marginPct: margin === null || margin < 0 || margin > 60 ? 'Marja 0 ilə 60% arasında olmalıdır' : '',
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="ct-error">{errors[k]}</small> : null;
  const inv = (k: keyof typeof errors) => tried && !!errors[k];

  const pickLogo = (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) { setError('Loqo PNG, JPG və ya WebP formatında olmalıdır.'); return; }
    if (file.size > LOGO_MAX) { setError('Loqo faylı 2 MB-dan böyük olmamalıdır.'); return; }
    setLogoFile(file); setLogoRemoved(false);
  };
  const toggleService = (s: string) => set('services', d.services.includes(s) ? d.services.filter(x => x !== s) : d.services.length >= 20 ? d.services : [...d.services, s]);
  const addService = () => { const s = newService.trim().slice(0, 60); if (s && !d.services.includes(s)) toggleService(s); setNewService(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true); setError('');
    if (Object.values(errors).some(Boolean) || busy) return;
    const input: CompanyProfileInput = {
      companyName: d.companyName.trim(), description: d.description.trim(), city: d.city.trim(), serviceArea: d.serviceArea.trim(),
      phone: d.phone.trim(), email: d.email.trim(), website: d.website.trim() || undefined, instagram: d.instagram.trim() || undefined,
      services: d.services, teamMembers: d.teamMembers.filter(m => m.name.trim()).map(m => ({ name: m.name.trim(), role: m.role.trim() })),
      defaultPaymentTerms: d.defaultPaymentTerms, paymentTermsNote: d.paymentTermsNote.trim(),
      defaultValidityDays: validity!, defaultWastePercentage: waste === null ? null : waste / 100, defaultMarginPercentage: margin! / 100,
    };
    setBusy(true);
    const wasComplete = Boolean(profile?.complete);
    try {
      let account = await saveCompanyProfile(input);
      setContractorAccount(account);
      if (logoFile) {
        try { account = await uploadLogo(logoFile); setContractorAccount(account); setLogoFile(null); }
        catch { setError('Profil saxlanıldı, amma loqo yüklənmədi. Bir az sonra yenidən cəhd edin.'); setBusy(false); return; }
      } else if (logoRemoved && profile?.logoUrl) {
        account = await removeCompanyLogo(); setContractorAccount(account); setLogoRemoved(false);
      }
      if (account.profile?.complete && !wasComplete) {
        track('company_profile_completed', { hasLogo: Boolean(account.profile.logoUrl), services: account.profile.services.length, source: variant === 'onboarding' ? 'onboarding' : 'settings' });
      }
      onSaved(account);
    } catch {
      setError('Profil saxlanılmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.');
    } finally { setBusy(false); }
  };

  const logoBlock = <div className="field"><span>Loqo <small className="sm-muted">(PNG, JPG, WebP · 2 MB-a qədər)</small></span>
    <div className="ct-logo">
      <div className="ct-logo-box">{shownLogo ? <img src={shownLogo} alt="Şirkət loqosu" /> : <ImagePlus size={24} aria-hidden />}</div>
      <div className="ct-logo-actions">
        <label className="sm-link-btn"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-logo" />{shownLogo ? 'Loqonu dəyiş' : 'Loqo yüklə'}</label>
        {shownLogo && <button type="button" className="sm-link-btn" onClick={() => { setLogoFile(null); setLogoRemoved(true); }}>Sil</button>}
      </div>
    </div>
  </div>;

  const basics = <>
    <div className="field-grid">
      <label className="field full" style={{ gridColumn: '1 / -1' }}><span>Şirkət / briqada adı<i> *</i></span><input value={d.companyName} onChange={e => set('companyName', e.target.value)} maxLength={160} autoComplete="organization" placeholder="Məs.: Usta Təmir MMC" aria-invalid={inv('companyName')} data-testid="input-company-name" />{err('companyName')}</label>
    </div>
    {logoBlock}
    {full && <label className="field"><span>Qısa təsvir</span><textarea value={d.description} onChange={e => set('description', e.target.value)} maxLength={1000} rows={3} placeholder="Məs.: 2015-ci ildən Bakıda mənzil və ofis təmiri ilə məşğuluq." /></label>}
  </>;

  const contacts = <div className="field-grid">
    <label className="field"><span>Telefon nömrəsi<i> *</i></span><input type="tel" value={d.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" placeholder="+994 50 123 45 67" aria-invalid={inv('phone')} data-testid="input-company-phone" />{err('phone')}</label>
    <label className="field"><span>E-poçt</span><input type="email" value={d.email} onChange={e => set('email', e.target.value)} autoComplete="email" placeholder="info@ustatemir.az" aria-invalid={inv('email')} />{err('email')}</label>
    <label className="field"><span>Şəhər<i> *</i></span><input list="ct-cities" value={d.city} onChange={e => set('city', e.target.value)} maxLength={80} aria-invalid={inv('city')} data-testid="input-company-city" /><datalist id="ct-cities">{CITIES.map(c => <option key={c} value={c} />)}</datalist>{err('city')}</label>
    {full && <label className="field"><span>Xidmət ərazisi</span><input value={d.serviceArea} onChange={e => set('serviceArea', e.target.value)} maxLength={200} placeholder="Məs.: Bakı və Abşeron" /></label>}
    <label className="field"><span>Instagram <small className="sm-muted">(istəyə bağlı)</small></span><input value={d.instagram} onChange={e => set('instagram', e.target.value)} maxLength={120} placeholder="@ustatemir" /></label>
    <label className="field"><span>Vebsayt <small className="sm-muted">(istəyə bağlı)</small></span><input value={d.website} onChange={e => set('website', e.target.value)} maxLength={250} placeholder="ustatemir.az" aria-invalid={inv('website')} />{err('website')}</label>
  </div>;

  const services = <div className="field"><span>Xidmət kateqoriyaları</span>
    <div className="ct-chips" role="group" aria-label="Xidmət kateqoriyaları">
      {[...SERVICE_SUGGESTIONS, ...d.services.filter(s => !SERVICE_SUGGESTIONS.includes(s))].map(s => <button key={s} type="button" className="ct-chip" aria-pressed={d.services.includes(s)} onClick={() => toggleService(s)}>{s}</button>)}
    </div>
    <div className="ct-chip-add"><input value={newService} onChange={e => setNewService(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addService(); } }} placeholder="Başqa xidmət əlavə edin" maxLength={60} aria-label="Yeni xidmət" /><Button variant="secondary" onClick={addService}><Plus size={15} />Əlavə et</Button></div>
  </div>;

  const actions = <div className="ct-actions">{secondary ?? <span />}<Button type="submit" disabled={busy} testId="button-save-profile">{busy ? <LoaderCircle className="spin" size={16} /> : submitIcon}{submitLabel}</Button></div>;

  if (!full) return <form className="ct-form ct-form-stack" onSubmit={submit} noValidate>
    {basics}{contacts}{services}
    <p className="ct-hint">{PROFILE_HELPER}</p>
    {error && <div className="ct-alert" role="alert">{error}</div>}
    {actions}
  </form>;

  return <form className="ct-form" onSubmit={submit} noValidate>
    <section className="surface ct-settings-section"><h2><Building2 size={18} aria-hidden />Şirkət</h2><p className="ct-hint">{PROFILE_HELPER}</p>{basics}</section>
    <section className="surface ct-settings-section"><h2>Əlaqə və ərazi</h2><p className="ct-hint">Telefon, şəhər və ad doldurulduqda profil tamamlanmış sayılır.</p>{contacts}</section>
    <section className="surface ct-settings-section"><h2>Xidmətlər</h2><p className="ct-hint">Sifarişçi smeta səhifəsində bu siyahını görür.</p>{services}</section>
    <section className="surface ct-settings-section"><h2><Users size={18} aria-hidden />Komanda üzvləri</h2><p className="ct-hint">Daxili qeyd üçündür, sifarişçiyə göstərilmir.</p>
      {d.teamMembers.map((m, i) => <div className="ct-team-row" key={i}>
        <input value={m.name} onChange={e => set('teamMembers', d.teamMembers.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Ad və soyad" maxLength={120} aria-label={`Üzv ${i + 1}: ad`} />
        <input value={m.role} onChange={e => set('teamMembers', d.teamMembers.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Vəzifə, məs.: Usta" maxLength={80} aria-label={`Üzv ${i + 1}: vəzifə`} />
        <button type="button" className="icon-button" aria-label={`${m.name || 'Üzvü'} sil`} onClick={() => set('teamMembers', d.teamMembers.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
      </div>)}
      {d.teamMembers.length < 30 && <button type="button" className="sm-link-btn" onClick={() => { if (gateFeature('teamMembers')) set('teamMembers', [...d.teamMembers, { name: '', role: '' }]); }}><Plus size={13} />Üzv əlavə et</button>}
    </section>
    <section className="surface ct-settings-section"><h2><WalletCards size={18} aria-hidden />Yeni smetalar üçün standartlar</h2><p className="ct-hint">Yalnız yeni yaradılan smetalara tətbiq olunur; mövcud smetalar dəyişmir.</p>
      <div className="field-grid">
        <label className="field"><span>Ödəniş qrafiki</span><select value={d.defaultPaymentTerms} onChange={e => set('defaultPaymentTerms', e.target.value as CompanyPaymentTerms)} data-testid="select-payment-terms">{(Object.keys(PAYMENT_PRESETS) as CompanyPaymentTerms[]).map(k => <option key={k} value={k}>{PAYMENT_PRESETS[k].label}</option>)}</select></label>
        <label className="field"><span>Smetanın qüvvədə olma müddəti, gün</span><input inputMode="numeric" value={d.validityDays} onChange={e => set('validityDays', e.target.value)} aria-invalid={inv('validityDays')} data-testid="input-validity" />{err('validityDays')}</label>
        <label className="field"><span>Tullantı / ehtiyat, % <small className="sm-muted">(boş: kateqoriya üzrə 5–15%)</small></span><input inputMode="decimal" value={d.wastePct} onChange={e => set('wastePct', e.target.value)} placeholder="Məs.: 8" aria-invalid={inv('wastePct')} />{err('wastePct')}</label>
        <label className="field"><span>Podratçı marjası, %</span><input inputMode="decimal" value={d.marginPct} onChange={e => set('marginPct', e.target.value)} aria-invalid={inv('marginPct')} data-testid="input-margin" />{err('marginPct')}</label>
      </div>
      <label className="field"><span>Ödəniş şərtləri barədə qeyd <small className="sm-muted">(sifarişçi görür)</small></span><textarea value={d.paymentTermsNote} onChange={e => set('paymentTermsNote', e.target.value)} maxLength={500} rows={2} placeholder="Məs.: Ödəniş nağd və ya bank köçürməsi ilə qəbul edilir." /></label>
    </section>
    {error && <div className="ct-alert" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
    <div className="ct-save-bar"><Button type="submit" disabled={busy} testId="button-save-profile">{busy ? <LoaderCircle className="spin" size={16} /> : submitIcon}{submitLabel}</Button></div>
  </form>;
}
