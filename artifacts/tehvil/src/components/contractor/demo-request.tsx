import { useState, type FormEvent } from 'react';
import { CheckCircle2, LoaderCircle, Send } from 'lucide-react';
import { createDemoRequest, type ContractorMonthlyProjects, type LeadRequestInput } from '@workspace/api-client-react';
import { Button } from '@/components/kit';
import { Modal } from '@/components/smeta/ui';
import { track } from '@/lib/analytics';
import { CHALLENGES, CONTACT_TIMES, MONTHLY_PROJECTS } from '@/lib/contractor/options';
import type { PlanId } from '@/lib/entitlements';

export const DEMO_CTA = '15 dəqiqəlik demo sifariş et';
const SUCCESS = 'Müraciətiniz qeydə alındı. Təhvil komandası sizinlə əlaqə saxlayacaq.';

type Source = LeadRequestInput['source'];
interface Form { fullName: string; companyName: string; phone: string; monthlyProjects: ContractorMonthlyProjects | ''; preferredContactTime: LeadRequestInput['preferredContactTime']; website: string }
const OTHER = '__other';

const statusOf = (e: unknown) => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : 0);

export function DemoRequestForm({ source, interestedPlan, onDone, compact }: { source: Source; interestedPlan?: PlanId; onDone?: () => void; compact?: boolean }) {
  const [form, setForm] = useState<Form>({ fullName: '', companyName: '', phone: '', monthlyProjects: '', preferredContactTime: 'any', website: '' });
  const [choice, setChoice] = useState('');
  const [otherText, setOtherText] = useState('');
  const mainChallenge = choice === OTHER ? otherText.trim() : choice;
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const digits = form.phone.replace(/\D/g, '');
  const errors = {
    fullName: form.fullName.trim().length < 2 ? 'Adınızı və soyadınızı daxil edin' : '',
    companyName: !form.companyName.trim() ? 'Şirkət və ya briqada adını daxil edin' : '',
    phone: digits.length < 9 || !/^[+0-9 ()-]+$/.test(form.phone.trim()) ? 'Telefon nömrəsini tam daxil edin, məs.: +994 50 123 45 67' : '',
    monthlyProjects: !form.monthlyProjects ? 'Ayda neçə layihə apardığınızı seçin' : '',
    mainChallenge: mainChallenge.length < 2 ? 'Əsas çətinliyi seçin və ya qısa yazın' : '',
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="ct-error">{errors[k]}</small> : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true); setError('');
    if (Object.values(errors).some(Boolean) || busy) return;
    setBusy(true);
    try {
      const res = await createDemoRequest({
        fullName: form.fullName.trim(), companyName: form.companyName.trim(), phone: form.phone.trim(),
        monthlyProjects: form.monthlyProjects as ContractorMonthlyProjects, mainChallenge,
        preferredContactTime: form.preferredContactTime, source, interestedPlan, website: form.website || undefined,
      });
      track('demo_requested', { source, monthlyProjects: form.monthlyProjects, interestedPlan });
      setDone(res.message || SUCCESS);
    } catch (e2) {
      setError(statusOf(e2) === 429 ? 'Çox sayda müraciət göndərildi. Bir neçə dəqiqədən sonra yenidən cəhd edin.' : 'Müraciət göndərilmədi. İnternet bağlantısını yoxlayıb yenidən cəhd edin və ya +994 50 306 66 26 nömrəsinə zəng edin.');
    } finally { setBusy(false); }
  };

  if (done) return <div className="ct-success" role="status">
    <span className="sm-success-icon"><CheckCircle2 size={26} /></span>
    <h3>Təşəkkür edirik</h3>
    <p>{done}</p>
    {onDone && <Button variant="secondary" onClick={onDone}>Bağla</Button>}
  </div>;

  return <form className="ct-form ct-form-stack" onSubmit={submit} noValidate>
    <div className="field-grid">
      <label className="field"><span>Ad və soyad<i> *</i></span><input value={form.fullName} onChange={e => set('fullName', e.target.value)} autoComplete="name" placeholder="Məs.: Rəşad Əliyev" aria-invalid={tried && !!errors.fullName} data-testid="input-demo-name" />{err('fullName')}</label>
      <label className="field"><span>Şirkət adı<i> *</i></span><input value={form.companyName} onChange={e => set('companyName', e.target.value)} autoComplete="organization" placeholder="Məs.: Usta Təmir MMC" aria-invalid={tried && !!errors.companyName} data-testid="input-demo-company" />{err('companyName')}</label>
      <label className="field"><span>Telefon<i> *</i></span><input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" placeholder="+994 50 123 45 67" aria-invalid={tried && !!errors.phone} data-testid="input-demo-phone" />{err('phone')}</label>
      <label className="field"><span>Ayda layihə sayı<i> *</i></span><select value={form.monthlyProjects} onChange={e => set('monthlyProjects', e.target.value as ContractorMonthlyProjects)} aria-invalid={tried && !!errors.monthlyProjects} data-testid="select-demo-projects"><option value="">Seçin</option>{MONTHLY_PROJECTS.map(o => <option key={o.id} value={o.id}>{o.label} layihə</option>)}</select>{err('monthlyProjects')}</label>
    </div>
    <label className="field"><span>Əsas çətinlik<i> *</i></span>
      <select value={choice} onChange={e => setChoice(e.target.value)} aria-invalid={tried && !!errors.mainChallenge} data-testid="select-demo-challenge">
        <option value="">Seçin</option>{CHALLENGES.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}<option value={OTHER}>Başqa (yazın)</option>
      </select>
      {choice === OTHER && <input value={otherText} onChange={e => setOtherText(e.target.value)} placeholder="Qısa yazın" maxLength={500} aria-label="Əsas çətinlik" style={{ marginTop: 6 }} />}
      {err('mainChallenge')}
    </label>
    {!compact && <label className="field"><span>Sizinlə nə vaxt əlaqə saxlayaq?</span><select value={form.preferredContactTime} onChange={e => set('preferredContactTime', e.target.value as Form['preferredContactTime'])}>{CONTACT_TIMES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}
    <div className="ct-honeypot" aria-hidden><label>Vebsayt<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)} /></label></div>
    {error && <div className="ct-alert" role="alert">{error}</div>}
    <Button type="submit" disabled={busy} testId="button-demo-submit">{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}{interestedPlan && source !== 'contractor_landing' ? 'Müraciət göndər' : DEMO_CTA}</Button>
    <p className="ct-hint">Məlumatlarınız yalnız sizinlə əlaqə üçün istifadə olunur. <a href="/privacy.html">Məxfilik siyasəti</a></p>
  </form>;
}

export function DemoRequestModal({ open, onClose, source, interestedPlan, title }: { open: boolean; onClose: () => void; source: Source; interestedPlan?: PlanId; title?: string }) {
  return <Modal open={open} onClose={onClose} eyebrow="Təhvil komandası" title={title ?? DEMO_CTA}>
    {open && <DemoRequestForm source={source} interestedPlan={interestedPlan} onDone={onClose} />}
  </Modal>;
}
