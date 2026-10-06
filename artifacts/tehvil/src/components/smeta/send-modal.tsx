import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Send } from 'lucide-react';
import { Button } from '@/components/kit';
import { projectTotals } from '@/lib/smeta/calc';
import { azn, dateAz } from '@/lib/smeta/format';
import { hasUnsentChanges, smeta } from '@/lib/smeta/store';
import type { EstimateShare, Project } from '@/lib/smeta/types';
import { Modal, toast } from './ui';

const DEFAULT_MESSAGE = 'Salam, təmir layihəniz üzrə smeta hazırdır. İş həcmini, material və işçilik xərclərini nəzərdən keçirib təsdiqləyə bilərsiniz.';
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const publicEstimateUrl = (token: string) => `${window.location.origin}${base}/estimate/${token}`;

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Link kopyalandı'); }
  catch { window.prompt('Linki kopyalayın:', text); }
}

const phoneOk = (v: string) => v.replace(/\D/g, '').length >= 9;
const emailOk = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function SendModal({ project: p, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(p.client.name);
  const [phone, setPhone] = useState(p.client.phone);
  const [email, setEmail] = useState(p.client.email ?? '');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [notify, setNotify] = useState(true);
  const [attachPdf, setAttachPdf] = useState(false);
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<EstimateShare | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(p.client.name); setPhone(p.client.phone); setEmail(p.client.email ?? ''); setMessage(p.share?.message ?? DEFAULT_MESSAGE);
    setNotify(p.share?.notifyOnApprove ?? true); setAttachPdf(p.share?.attachPdf ?? false); setTried(false); setSent(null);
  }, [open]);

  const aiLines = p.estimate.sections.flatMap(s => s.items).filter(i => i.status === 'ai' || i.status === 'draft').length;
  const pendingMeasures = p.measurements.filter(m => m.status === 'suggested').length;
  const resend = !!p.share && hasUnsentChanges(p);
  const errors = { name: !name.trim() ? 'Sifarişçinin adını daxil edin' : '', phone: !phoneOk(phone) ? 'Telefon nömrəsini tam daxil edin, məs.: +994 50 123 45 67' : '', email: !emailOk(email) ? 'E-poçt ünvanı düzgün deyil' : '' };
  const submit = () => {
    setTried(true);
    if (errors.name || errors.phone || errors.email) return;
    // TODO(api): POST /smeta/:id/share — backend creates the token, stores the snapshot and sends SMS / e-mail.
    const share = smeta.shareEstimate(p.id, { clientName: name.trim(), phone: phone.trim(), email: email.trim() || undefined, message: message.trim(), notifyOnApprove: notify, attachPdf });
    if (share) setSent(share);
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="sm-field-error">{errors[k]}</small> : null;

  if (sent) {
    const url = publicEstimateUrl(sent.token);
    return <Modal open={open} onClose={onClose} title="Smeta göndərildi" footer={<Button onClick={onClose}>Bağla</Button>}>
      <div className="sm-success" role="status">
        <span className="sm-success-icon"><CheckCircle2 size={26} /></span>
        <h3>Smeta sifarişçi ilə paylaşıldı</h3>
        <p>Paylaşım linki 30 gün aktivdir · {dateAz(sent.expiresAt)} tarixinədək</p>
        <p>Versiya {sent.snapshot.version} · {azn(projectTotals({ ...p, estimate: sent.snapshot, projectCosts: sent.snapshotProjectCosts, defaultMarginPercentage: sent.snapshotMargin }).total)}</p>
        <div className="sm-copy-row"><input readOnly value={url} aria-label="Paylaşım linki" onFocus={e => e.target.select()} /><Button variant="secondary" onClick={() => { void copyText(url); }}><Copy size={15} />Kopyala</Button></div>
        <a className="sm-link-btn" href={url} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}><ExternalLink size={14} />Sifarişçi görünüşünü aç</a>
      </div>
    </Modal>;
  }

  return <Modal open={open} onClose={onClose} eyebrow={resend ? `Yeni versiya: v${(p.share?.snapshot.version ?? 0) + 1}` : `Versiya ${p.estimate.version}`} title="Sifarişçiyə göndər" footer={<>
    <Button variant="secondary" onClick={onClose}>Ləğv et</Button>
    <Button onClick={submit} testId="button-create-share"><Send size={15} />Smeta linkini yarat və göndər</Button>
  </>}>
    {(aiLines > 0 || pendingMeasures > 0) && <div className="sm-warn-box" role="note">
      <strong style={{ display: 'flex', alignItems: 'center', gap: 7 }}><AlertTriangle size={15} aria-hidden />Göndərməzdən əvvəl yoxlayın</strong>
      {aiLines > 0 && <span>Smetada yoxlanmamış {aiLines} AI / qaralama sətri var. Göndərildikdə onlar sizin tərəfinizdən təsdiqlənmiş sayılacaq.</span>}
      {pendingMeasures > 0 && <span>{pendingMeasures} ölçü hələ yoxlanmayıb. Sifarişçi yalnız təsdiqlədiyiniz versiyanı görəcək.</span>}
    </div>}
    {resend && <div className="sm-ai-notice" role="note"><AlertTriangle size={15} aria-hidden /><span>Sifarişçi hazırda v{p.share?.snapshot.version} versiyasını görür. Göndərdikdən sonra yeni versiya yaradılacaq və sifarişçinin yenidən təsdiqi tələb olunacaq.</span></div>}
    <div className="field-grid">
      <label className="field full"><span>Sifarişçi adı<i> *</i></span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" aria-invalid={tried && !!errors.name} />{err('name')}</label>
      <label className="field"><span>Telefon nömrəsi<i> *</i></span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+994 50 123 45 67" autoComplete="tel" aria-invalid={tried && !!errors.phone} />{err('phone')}</label>
      <label className="field"><span>E-poçt <small style={{ color: '#8a948c', fontWeight: 500 }}>(istəyə bağlı)</small></span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" aria-invalid={tried && !!errors.email} />{err('email')}</label>
      <label className="field full"><span>Mesaj</span><textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} /></label>
    </div>
    <label className="sm-check"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />Sifarişçi təsdiq etdikdə bildiriş göndər</label>
    <label className="sm-check"><input type="checkbox" checked={attachPdf} onChange={e => setAttachPdf(e.target.checked)} />Smeta PDF əlavəsi ilə göndərilsin</label>
  </Modal>;
}
