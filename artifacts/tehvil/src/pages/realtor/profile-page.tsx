import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AtSign, BadgeCheck, Building2, LoaderCircle, Phone, Save } from 'lucide-react';
import {
  getGetRealtorOverviewQueryKey, getGetRealtorProfileQueryKey, useGetRealtorProfile, useUpdateRealtorProfile,
  type RealtorMedia, type RealtorProfile,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CertifiedSeal, PhotoPicker, RealtorToaster, Skeleton, toast } from '@/components/realtor/ui';

const asMedia = (id: string | null, url: string | null, name: string): RealtorMedia[] => (id && url ? [{ id, url, originalName: name, contentType: 'image/jpeg', size: 0 }] : []);

export function ProfileForm({ profile, onSaved, compact = false }: { profile: RealtorProfile; onSaved?: () => void; compact?: boolean }) {
  const qc = useQueryClient();
  const save = useUpdateRealtorProfile();
  const [form, setForm] = useState({ fullName: profile.fullName, agency: profile.agency, phone: profile.phone, whatsapp: profile.whatsapp, instagram: profile.instagram, bio: profile.bio });
  const [photo, setPhoto] = useState<RealtorMedia[]>(asMedia(profile.photoMediaId, profile.photoUrl, 'Foto'));
  const [logo, setLogo] = useState<RealtorMedia[]>(asMedia(profile.logoMediaId, profile.logoUrl, 'Logo'));
  useEffect(() => { setForm({ fullName: profile.fullName, agency: profile.agency, phone: profile.phone, whatsapp: profile.whatsapp, instagram: profile.instagram, bio: profile.bio }); }, [profile]);
  const f = (k: keyof typeof form) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ data: { ...form, whatsapp: form.whatsapp || form.phone, photoMediaId: photo[0]?.id ?? null, logoMediaId: logo[0]?.id ?? null } }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetRealtorProfileQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() });
        toast('Profil yadda saxlanıldı');
        onSaved?.();
      },
    });
  };
  return <form className="surface form-card rl-form" onSubmit={submit}>
    <div className="form-section-title"><span>01</span><h2>Əlaqə məlumatları</h2></div>
    <div className="field-grid">
      <Field label="Ad, soyad" name="realtor-name" required value={form.fullName} onChange={f('fullName')} placeholder="məs. Aysel Məmmədova" />
      <Field label="Agentlik" name="realtor-agency" value={form.agency} onChange={f('agency')} placeholder="məs. Baku Prime Realty" />
    </div>
    <div className="field-grid">
      <Field label="Telefon" name="realtor-phone" type="tel" value={form.phone} onChange={f('phone')} placeholder="+994 50 000 00 00" />
      <Field label="WhatsApp" name="realtor-whatsapp" type="tel" value={form.whatsapp} onChange={f('whatsapp')} placeholder="Telefonla eynidirsə boş saxlayın" />
    </div>
    <Field label="Instagram" name="realtor-instagram" value={form.instagram} onChange={f('instagram')} placeholder="@istifadeci_adi" />
    {!compact && <>
      <Field label="Qısa təqdimat" name="realtor-bio"><textarea value={form.bio} onChange={e => f('bio')(e.target.value)} maxLength={1000} placeholder="məs. 8 il təcrübə, Nəsimi və Yasamal rayonları üzrə ixtisaslaşmışam." /></Field>
      <div className="form-section-title separated"><span>02</span><h2>Brendiniz</h2></div>
      <p className="rl-hint">Foto və logo hər pasportda, elan səhifəsində, PDF-də və Instagram story şəklində görünür.</p>
      <div className="field-grid">
        <div className="field"><span>Foto</span><PhotoPicker media={photo} onChange={m => setPhoto(m.slice(-1))} max={1} label="Foto yüklə" testId="realtor-photo" /></div>
        <div className="field"><span>Logo</span><PhotoPicker media={logo} onChange={m => setLogo(m.slice(-1))} max={1} label="Logo yüklə" testId="realtor-logo" /></div>
      </div>
    </>}
    <div className="form-actions"><button type="submit" className="button button-primary" disabled={save.isPending} data-testid="button-save-profile">{save.isPending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{profile.exists ? 'Yadda saxla' : 'Profili yarat və başla'}</button></div>
  </form>;
}

export function RealtorProfilePage() {
  const { data, isLoading } = useGetRealtorProfile();
  return <>
    <PageHeading eyebrow="Realtor profili" title="Brendiniz" description="Alıcı pasportu açanda sizi görür: ad, foto, agentlik və WhatsApp düyməsi." />
    {isLoading || !data ? <Skeleton rows={2} /> : <div className="form-layout">
      <ProfileForm profile={data} />
      <aside className="form-aside rl-preview-aside">
        <div className="eyebrow">Pasportda belə görünür</div>
        <div className="rl-realtor-card">
          {data.photoUrl ? <img src={data.photoUrl} alt="" className="rl-avatar" /> : <span className="rl-avatar ph">{(data.fullName || 'R').charAt(0)}</span>}
          <div><strong>{data.fullName || 'Adınız'}</strong><small><Building2 size={12} />{data.agency || 'Agentlik'}</small></div>
          {data.logoUrl && <img src={data.logoUrl} alt="" className="rl-logo" />}
        </div>
        <div className="rl-contact-lines">
          <span><Phone size={13} />{data.phone || '—'}</span>
          <span><AtSign size={13} />{data.instagram ? `@${data.instagram}` : '—'}</span>
        </div>
        <CertifiedSeal level="handover" />
        <div className="audit-note"><BadgeCheck size={17} /><span>Rəqibiniz yalnız satış prosesini idarə edir; siz həm satışı idarə edir, həm də alıcının güvənini qazanırsınız.</span></div>
      </aside>
    </div>}
    <RealtorToaster />
  </>;
}
