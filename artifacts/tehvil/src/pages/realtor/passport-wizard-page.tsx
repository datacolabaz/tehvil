import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, Calendar, Check, ClipboardCheck, Download, ExternalLink, Eye, FileDown, HardHat,
  Instagram, KeyRound, Link2, LoaderCircle, MessageCircle, Pencil, Plus, Send, Share2, ShieldCheck, Trash2, UserRound, X,
} from 'lucide-react';
import {
  createContractorConfirmLink, createOwnerConfirmLink, getGetPropertyPassportQueryKey, getGetRealtorOverviewQueryKey, getListPropertyPassportsQueryKey,
  getListRealtorListingsQueryKey,
  useCreatePassportWork, useCreatePropertyPassport, useDeletePassportWork, useDeletePropertyPassport, useGetPropertyPassport, useGetRealtorProfile,
  useListRealtorListings, useSetPropertyPassportStatus, useUpdatePassportWork, useUpdatePropertyPassport,
  type ExternalLink as Ext, type PassportWork, type PassportWorkInput, type PropertyPassport, type PropertyPassportInput, type RealtorMedia,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CertifiedSeal, CopyButton, PhotoPicker, Pill, QrCode as Qr, RealtorToaster, Skeleton, TrustBadge, TrustLadder, qrDataUrl, toast } from '@/components/realtor/ui';
import { HANDOVER, KIND, PORTAL, PASSPORT_STATUS, dateText, num, passportShareText, passportUrl, qrUrl, waUrl, type Trust } from '@/lib/realtor/labels';
import { downloadBlob, storyImage } from '@/lib/realtor/story';

const STEPS = [
  { n: 1, title: 'Mənzil', icon: Building2 },
  { n: 2, title: 'Realtor', icon: UserRound },
  { n: 3, title: 'Təmir işləri', icon: HardHat },
  { n: 4, title: 'Etibar statusu', icon: ShieldCheck },
  { n: 5, title: 'Paylaşım', icon: Share2 },
];

type Draft = {
  listingId: string; title: string; dealType: string; propertyKind: string; district: string; address: string; rooms: string; areaM2: string;
  price: string; currency: string; links: Ext[]; photos: RealtorMedia[];
  realtor: { name: string; agency: string; phone: string; whatsapp: string; instagram: string; photo: RealtorMedia[]; logo: RealtorMedia[] };
  ownerName: string; ownerPhone: string;
};
const media1 = (id: string | null, url: string | null): RealtorMedia[] => (id && url ? [{ id, url, originalName: '', contentType: 'image/jpeg', size: 0 }] : []);
const fromPassport = (p: PropertyPassport): Draft => ({
  listingId: p.listingId ?? '', title: p.title, dealType: p.dealType, propertyKind: p.propertyKind, district: p.district, address: p.address,
  rooms: p.rooms?.toString() ?? '', areaM2: p.areaM2?.toString() ?? '', price: p.price?.toString() ?? '', currency: p.currency, links: p.listingUrls, photos: p.photos,
  realtor: { name: p.realtor.name, agency: p.realtor.agency, phone: p.realtor.phone, whatsapp: p.realtor.whatsapp, instagram: p.realtor.instagram, photo: media1(p.realtor.photoMediaId, p.realtor.photoUrl), logo: media1(p.realtor.logoMediaId, p.realtor.logoUrl) },
  ownerName: p.ownerName, ownerPhone: p.ownerPhone,
});
const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const toInput = (d: Draft): PropertyPassportInput => ({
  listingId: d.listingId || null, title: d.title.trim(), dealType: d.dealType as 'sale', propertyKind: d.propertyKind as 'apartment', district: d.district.trim(), address: d.address,
  rooms: n(d.rooms), areaM2: n(d.areaM2), price: n(d.price), currency: d.currency as 'AZN',
  listingUrls: d.links.filter(x => x.url.trim()).map(x => ({ portal: x.portal, url: /^https?:\/\//i.test(x.url.trim()) ? x.url.trim() : `https://${x.url.trim()}` })),
  photoIds: d.photos.map(p => p.id),
  realtor: { name: d.realtor.name.trim(), agency: d.realtor.agency, phone: d.realtor.phone, whatsapp: d.realtor.whatsapp, instagram: d.realtor.instagram, photoMediaId: d.realtor.photo[0]?.id ?? null, logoMediaId: d.realtor.logo[0]?.id ?? null },
  ownerName: d.ownerName, ownerPhone: d.ownerPhone,
});

export function PassportWizardPage({ passportId }: { passportId?: string }) {
  const passport = useGetPropertyPassport(passportId ?? '', { query: { enabled: !!passportId, queryKey: getGetPropertyPassportQueryKey(passportId ?? '') } });
  if (passportId && passport.isLoading) return <Skeleton rows={3} />;
  if (passportId && !passport.data) return <div className="notice error-notice" role="alert"><p>Pasport tapılmadı.</p><Link href="/realtor/passports" className="button button-secondary">Pasportlara qayıt</Link></div>;
  return <Wizard key={passportId ?? 'new'} passport={passport.data} />;
}

function Wizard({ passport }: { passport?: PropertyPassport }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const profile = useGetRealtorProfile();
  const listings = useListRealtorListings();
  const create = useCreatePropertyPassport();
  const update = useUpdatePropertyPassport();
  const [step, setStep] = useState(() => {
    const s = Number(new URLSearchParams(window.location.search).get('step'));
    return s >= 1 && s <= 5 ? s : passport ? 3 : 1;
  });
  const [draft, setDraft] = useState<Draft | null>(passport ? fromPassport(passport) : null);

  // A new passport starts from the realtor profile and, when given, a listing.
  useEffect(() => {
    if (draft || !profile.data || !listings.data) return;
    const p = profile.data;
    const listingId = new URLSearchParams(window.location.search).get('listing') ?? '';
    const l = listings.data.find(x => x.id === listingId);
    setDraft({
      listingId: l?.id ?? '', title: l?.title ?? '', dealType: l?.dealType ?? 'sale', propertyKind: l?.propertyKind ?? 'apartment', district: l?.district ?? '', address: l?.address ?? '',
      rooms: l?.rooms?.toString() ?? '', areaM2: l?.areaM2?.toString() ?? '', price: l?.price?.toString() ?? '', currency: l?.currency ?? 'AZN', links: l?.externalLinks ?? [], photos: l?.photos ?? [],
      realtor: { name: p.fullName, agency: p.agency, phone: p.phone, whatsapp: p.whatsapp || p.phone, instagram: p.instagram, photo: media1(p.photoMediaId, p.photoUrl), logo: media1(p.logoMediaId, p.logoUrl) },
      ownerName: '', ownerPhone: '',
    });
  }, [draft, profile.data, listings.data]);

  if (!draft) return <Skeleton rows={3} />;
  const refresh = (id: string) => { for (const k of [getGetPropertyPassportQueryKey(id), getListPropertyPassportsQueryKey(), getListRealtorListingsQueryKey(), getGetRealtorOverviewQueryKey()]) void qc.invalidateQueries({ queryKey: k }); };
  const go = (s: number, id = passport?.id) => { setStep(s); if (id) window.history.replaceState(null, '', `${import.meta.env.BASE_URL.replace(/\/$/, '')}/realtor/passports/${id}?step=${s}`); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const saveDraft = (next: number, d = draft) => {
    const data = toInput(d);
    if (!data.realtor.name || data.realtor.name.length < 2) data.realtor.name = profile.data?.fullName || 'Realtor';
    if (passport) update.mutate({ passportId: passport.id, data }, { onSuccess: () => { refresh(passport.id); go(next); } });
    else create.mutate({ data }, { onSuccess: p => { refresh(p.id); toast('Pasport qaralaması yaradıldı'); setLocation(`/realtor/passports/${p.id}?step=${next}`); } });
  };
  const saving = create.isPending || update.isPending;
  const maxStep = passport ? 5 : 1;

  return <>
    <PageHeading eyebrow={passport ? `Mənzil Təhvil Pasportu · ${PASSPORT_STATUS[passport.status]}` : 'Yeni pasport'} title={passport?.title || 'Pasport yarat'} description="Addım-addım: mənzil, realtor, təmir işləri, etibar statusu və paylaşım." action={passport && <div className="heading-buttons"><TrustBadge level={passport.trustLevel as Trust} size="lg" />{passport.status === 'published' && <a className="button button-secondary" href={passportUrl(passport.publicId)} target="_blank" rel="noreferrer"><Eye size={15} />Alıcı görünüşü</a>}</div>} />
    <ol className="rl-steps" aria-label="Addımlar">{STEPS.map(s => {
      const state = s.n === step ? 'current' : s.n < step || (passport && s.n <= 2) ? 'done' : '';
      return <li key={s.n} className={state}><button type="button" disabled={s.n > maxStep} onClick={() => go(s.n)} aria-current={s.n === step ? 'step' : undefined}><span>{state === 'done' && s.n !== step ? <Check size={13} /> : s.n}</span><b>{s.title}</b></button></li>;
    })}</ol>
    {step === 1 && <StepProperty draft={draft} setDraft={setDraft} onNext={() => saveDraft(2)} saving={saving} isNew={!passport} />}
    {step === 2 && <StepRealtor draft={draft} setDraft={setDraft} onBack={() => go(1)} onNext={() => saveDraft(3)} saving={saving} />}
    {step === 3 && passport && <StepWorks passport={passport} onBack={() => go(2)} onNext={() => go(4)} refresh={() => refresh(passport.id)} />}
    {step === 4 && passport && <StepTrust passport={passport} draft={draft} setDraft={setDraft} onSaveOwner={d => saveDraft(4, d)} onBack={() => go(3)} onNext={() => go(5)} refresh={() => refresh(passport.id)} />}
    {step === 5 && passport && <StepShare passport={passport} onBack={() => go(4)} refresh={() => refresh(passport.id)} />}
    <RealtorToaster />
  </>;
}

function StepNav({ onBack, onNext, nextLabel = 'Davam et', saving, submit }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; saving?: boolean; submit?: boolean }) {
  return <div className="rl-step-nav">
    {onBack ? <button type="button" className="button button-quiet" onClick={onBack}><ArrowLeft size={15} />Geri</button> : <span />}
    {(onNext || submit) && <button type={submit ? 'submit' : 'button'} className="button button-primary" onClick={submit ? undefined : onNext} disabled={saving} data-testid="button-wizard-next">{saving ? <LoaderCircle className="spin" size={15} /> : null}{nextLabel}<ArrowRight size={15} /></button>}
  </div>;
}

/* ---------------------------------------------------------------- 1. Property */

function StepProperty({ draft, setDraft, onNext, saving, isNew }: { draft: Draft; setDraft: (d: Draft) => void; onNext: () => void; saving: boolean; isNew: boolean }) {
  const listings = useListRealtorListings();
  const f = (k: keyof Draft) => (v: string) => setDraft({ ...draft, [k]: v });
  const pick = (id: string) => {
    const l = listings.data?.find(x => x.id === id);
    if (!l) { setDraft({ ...draft, listingId: '' }); return; }
    setDraft({ ...draft, listingId: l.id, title: l.title, dealType: l.dealType, propertyKind: l.propertyKind, district: l.district, address: l.address, rooms: l.rooms?.toString() ?? '', areaM2: l.areaM2?.toString() ?? '', price: l.price?.toString() ?? '', currency: l.currency, links: l.externalLinks.length ? l.externalLinks : draft.links, photos: l.photos.length ? l.photos : draft.photos });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); onNext(); };
  return <form className="surface form-card rl-form rl-step-card" onSubmit={submit}>
    <div className="form-section-title"><span>01</span><h2>Mənzil məlumatı</h2></div>
    {(listings.data?.length ?? 0) > 0 && <Field label="Elandan doldur" name="pp-listing"><select value={draft.listingId} onChange={e => pick(e.target.value)}><option value="">— Elan seçin (istəyə görə) —</option>{listings.data!.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select></Field>}
    <Field label="Başlıq" name="pp-title" required value={draft.title} onChange={f('title')} placeholder="məs. Yasamalda tam təmirli 2 otaqlı mənzil" />
    <div className="field-grid">
      <Field label="Rayon" name="pp-district" required value={draft.district} onChange={f('district')} />
      <Field label="Ünvan" name="pp-address" value={draft.address} onChange={f('address')} placeholder="Alıcıya görünür; istəsəniz yalnız küçəni yazın" />
    </div>
    <div className="field-grid three">
      <Field label="Obyekt tipi" name="pp-kind"><select value={draft.propertyKind} onChange={e => f('propertyKind')(e.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Otaq sayı" name="pp-rooms" type="number" min="0" value={draft.rooms} onChange={f('rooms')} />
      <Field label="Sahə, m²" name="pp-area" type="number" min="0" step="0.1" value={draft.areaM2} onChange={f('areaM2')} />
    </div>
    <div className="field-grid three">
      <Field label="Əməliyyat" name="pp-deal"><select value={draft.dealType} onChange={e => f('dealType')(e.target.value)}><option value="sale">Satış</option><option value="rent">İcarə</option></select></Field>
      <Field label="Qiymət" name="pp-price" type="number" min="0" value={draft.price} onChange={f('price')} />
      <Field label="Valyuta" name="pp-currency"><select value={draft.currency} onChange={e => f('currency')(e.target.value)}><option>AZN</option><option>USD</option></select></Field>
    </div>
    <div className="field"><span>Elan linki (Brokly.az, Tap.az, Bina.az…)</span>
      {draft.links.map((x, i) => <div className="rl-link-row" key={i}>
        <select value={x.portal} onChange={e => setDraft({ ...draft, links: draft.links.map((y, j) => j === i ? { ...y, portal: e.target.value as Ext['portal'] } : y) })} aria-label="Portal">{Object.entries(PORTAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input value={x.url} onChange={e => setDraft({ ...draft, links: draft.links.map((y, j) => j === i ? { ...y, url: e.target.value } : y) })} placeholder="https://" aria-label="Link" />
        <button type="button" className="icon-button" aria-label="Sil" onClick={() => setDraft({ ...draft, links: draft.links.filter((_, j) => j !== i) })}><X size={15} /></button>
      </div>)}
      {draft.links.length < 6 && <button type="button" className="sm-link-btn" onClick={() => setDraft({ ...draft, links: [...draft.links, { portal: 'brokly', url: '' }] })}><Link2 size={13} />Link əlavə et</button>}
    </div>
    <div className="field"><span>Əsas şəkillər</span><PhotoPicker media={draft.photos} onChange={photos => setDraft({ ...draft, photos })} max={20} hint="İlk şəkil pasportun üz qabığıdır." testId="pp-photos" /></div>
    <StepNav submit saving={saving} nextLabel={isNew ? 'Qaralama yarat' : 'Yadda saxla və davam et'} />
  </form>;
}

/* ----------------------------------------------------------------- 2. Realtor */

function StepRealtor({ draft, setDraft, onBack, onNext, saving }: { draft: Draft; setDraft: (d: Draft) => void; onBack: () => void; onNext: () => void; saving: boolean }) {
  const r = draft.realtor;
  const f = (k: keyof Draft['realtor']) => (v: string) => setDraft({ ...draft, realtor: { ...r, [k]: v } });
  return <form className="surface form-card rl-form rl-step-card" onSubmit={e => { e.preventDefault(); onNext(); }}>
    <div className="form-section-title"><span>02</span><h2>Realtor məlumatı</h2></div>
    <p className="rl-hint">Profilinizdən götürülüb. Bu pasport üçün dəyişə bilərsiniz — brendiniz pasportda və elan səhifəsində görünəcək.</p>
    <div className="field-grid">
      <Field label="Realtor adı" name="pp-r-name" required value={r.name} onChange={f('name')} />
      <Field label="Agentlik" name="pp-r-agency" value={r.agency} onChange={f('agency')} />
    </div>
    <div className="field-grid three">
      <Field label="Telefon" name="pp-r-phone" type="tel" value={r.phone} onChange={f('phone')} />
      <Field label="WhatsApp" name="pp-r-wa" type="tel" value={r.whatsapp} onChange={f('whatsapp')} />
      <Field label="Instagram" name="pp-r-ig" value={r.instagram} onChange={f('instagram')} placeholder="@" />
    </div>
    <div className="field-grid">
      <div className="field"><span>Foto</span><PhotoPicker media={r.photo} onChange={m => setDraft({ ...draft, realtor: { ...r, photo: m.slice(-1) } })} max={1} label="Foto" /></div>
      <div className="field"><span>Logo</span><PhotoPicker media={r.logo} onChange={m => setDraft({ ...draft, realtor: { ...r, logo: m.slice(-1) } })} max={1} label="Logo" /></div>
    </div>
    <StepNav onBack={onBack} submit saving={saving} />
  </form>;
}

/* ------------------------------------------------------------------- 3. Works */

const blankWork = { title: '', startDate: '', endDate: '', contractorName: '', contractorPhone: '', description: '', materials: '', before: [] as RealtorMedia[], after: [] as RealtorMedia[] };

function StepWorks({ passport, onBack, onNext, refresh }: { passport: PropertyPassport; onBack: () => void; onNext: () => void; refresh: () => void }) {
  const [editing, setEditing] = useState<PassportWork | 'new' | null>(passport.works.length ? null : 'new');
  const remove = useDeletePassportWork();
  return <div className="rl-step-card">
    <div className="surface rl-panel">
      <div className="section-head"><div><div className="eyebrow">03 · Təmir işləri</div><h2>{passport.works.length ? `${passport.works.length} iş qeyd olunub` : 'Təmir işlərini əlavə edin'}</h2></div>
        {editing === null && <button type="button" className="button button-primary sm-btn-sm" onClick={() => setEditing('new')} data-testid="button-add-work"><Plus size={14} />İş əlavə et</button>}</div>
      <p className="rl-hint">Hər iş üçün tarix, podratçı, materiallar və əvvəl/sonra fotoları. Təsdiqlənmiş işi dəyişsəniz, təsdiq yenidən istənəcək.</p>
      {passport.works.map(w => editing !== 'new' && editing?.id === w.id
        ? <WorkForm key={w.id} passportId={passport.id} work={w} onDone={() => { setEditing(null); refresh(); }} onCancel={() => setEditing(null)} />
        : <WorkCard key={w.id} w={w} actions={<>
          <button type="button" className="button button-secondary sm-btn-sm" onClick={() => setEditing(w)}><Pencil size={13} />Redaktə</button>
          <button type="button" className="button button-quiet sm-btn-sm" onClick={() => { if (window.confirm(`"${w.title}" silinsin?`)) remove.mutate({ passportId: passport.id, workId: w.id }, { onSuccess: () => { refresh(); toast('İş silindi'); } }); }}><Trash2 size={13} />Sil</button>
        </>} />)}
      {editing === 'new' && <WorkForm passportId={passport.id} onDone={() => { setEditing(null); refresh(); }} onCancel={passport.works.length ? () => setEditing(null) : undefined} />}
    </div>
    <StepNav onBack={onBack} onNext={passport.works.length ? onNext : undefined} nextLabel="Etibar statusuna keç" />
  </div>;
}

export function WorkCard({ w, actions }: { w: PassportWork; actions?: ReactNode }) {
  return <article className={`rl-work ${w.handoverStatus}`}>
    <div className="rl-work-head">
      <div><h3>{w.title}</h3><small><Calendar size={12} className="sm-ii" /> {w.startDate ? dateText(w.startDate) : '—'} – {w.endDate ? dateText(w.endDate) : '—'}{w.contractorName ? ` · ${w.contractorName}` : ''}</small></div>
      <div className="rl-work-status">
        {w.contractorConfirmedAt ? <Pill small tone="ok" icon={<HardHat size={11} />}>Podratçı təsdiqləyib</Pill> : <Pill small tone="neutral" icon={<HardHat size={11} />}>Podratçı təsdiqi yoxdur</Pill>}
        <Pill small tone={w.handoverStatus === 'accepted' ? 'ok' : w.handoverStatus === 'revision' ? 'risk' : 'warn'} icon={<KeyRound size={11} />}>{HANDOVER[w.handoverStatus]}</Pill>
      </div>
    </div>
    {w.description && <p>{w.description}</p>}
    {w.materials && <p className="rl-materials"><b>Materiallar:</b> {w.materials}</p>}
    {(w.beforePhotos.length > 0 || w.afterPhotos.length > 0) && <div className="rl-ba-mini">
      <div><small>Əvvəl</small><div>{w.beforePhotos.slice(0, 4).map(m => <img key={m.id} src={m.url} alt="" loading="lazy" />)}{!w.beforePhotos.length && <span>—</span>}</div></div>
      <div><small>Sonra</small><div>{w.afterPhotos.slice(0, 4).map(m => <img key={m.id} src={m.url} alt="" loading="lazy" />)}{!w.afterPhotos.length && <span>—</span>}</div></div>
    </div>}
    {w.ownerNote && w.handoverStatus === 'revision' && <p className="rl-owner-note"><AlertTriangle size={13} className="sm-ii" /> Ev sahibi: {w.ownerNote}</p>}
    {actions && <div className="rl-work-actions">{actions}</div>}
  </article>;
}

function WorkForm({ passportId, work, onDone, onCancel }: { passportId: string; work?: PassportWork; onDone: () => void; onCancel?: () => void }) {
  const create = useCreatePassportWork();
  const update = useUpdatePassportWork();
  const [f, setF] = useState(() => work ? { title: work.title, startDate: work.startDate ?? '', endDate: work.endDate ?? '', contractorName: work.contractorName, contractorPhone: work.contractorPhone, description: work.description, materials: work.materials, before: work.beforePhotos, after: work.afterPhotos } : blankWork);
  const set = (k: keyof typeof f) => (v: string) => setF(o => ({ ...o, [k]: v }));
  const confirmed = !!work && (!!work.contractorConfirmedAt || work.handoverStatus !== 'pending');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data: PassportWorkInput = { title: f.title.trim(), startDate: f.startDate || null, endDate: f.endDate || null, contractorName: f.contractorName, contractorPhone: f.contractorPhone, description: f.description, materials: f.materials, beforePhotoIds: f.before.map(m => m.id), afterPhotoIds: f.after.map(m => m.id) };
    if (work) update.mutate({ passportId, workId: work.id, data }, { onSuccess: () => { toast('İş yadda saxlanıldı'); onDone(); } });
    else create.mutate({ passportId, data }, { onSuccess: () => { toast('İş əlavə olundu'); onDone(); } });
  };
  return <form className="rl-work-form rl-form" onSubmit={submit}>
    <Field label="İşin adı" name="work-title" required value={f.title} onChange={set('title')} placeholder="məs. Vanna otağında kafel dəyişimi" />
    <div className="field-grid">
      <Field label="Başlama tarixi" name="work-start" type="date" value={f.startDate} onChange={set('startDate')} />
      <Field label="Bitmə tarixi" name="work-end" type="date" value={f.endDate} onChange={set('endDate')} />
    </div>
    <div className="field-grid">
      <Field label="Podratçı" name="work-contractor" value={f.contractorName} onChange={set('contractorName')} placeholder="Ad və ya şirkət" />
      <Field label="Podratçının telefonu" name="work-contractor-phone" type="tel" value={f.contractorPhone} onChange={set('contractorPhone')} placeholder="Təsdiq linki üçün; alıcıya görünmür" />
    </div>
    <Field label="Görülən işlərin təsviri" name="work-description"><textarea rows={3} value={f.description} onChange={e => set('description')(e.target.value)} maxLength={3000} /></Field>
    <Field label="Material məlumatı" name="work-materials"><textarea rows={2} value={f.materials} onChange={e => set('materials')(e.target.value)} maxLength={2000} placeholder="məs. Kerama Marazzi kafel, Ceresit yapışqan" /></Field>
    <div className="field-grid">
      <div className="field"><span>Əvvəl fotoları</span><PhotoPicker media={f.before} onChange={m => setF(o => ({ ...o, before: m }))} max={12} label="Əvvəl" testId="work-before" /></div>
      <div className="field"><span>Sonra fotoları</span><PhotoPicker media={f.after} onChange={m => setF(o => ({ ...o, after: m }))} max={12} label="Sonra" testId="work-after" /></div>
    </div>
    {confirmed && <p className="rl-warn"><AlertTriangle size={14} />Bu iş artıq təsdiqlənib. Məzmunu dəyişsəniz, podratçı və ev sahibi təsdiqi sıfırlanacaq.</p>}
    <div className="inline-actions">
      {onCancel && <button type="button" className="button button-quiet" onClick={onCancel}>Ləğv et</button>}
      <button type="submit" className="button button-primary" disabled={create.isPending || update.isPending} data-testid="button-save-work">{(create.isPending || update.isPending) && <LoaderCircle className="spin" size={15} />}{work ? 'Yadda saxla' : 'İşi əlavə et'}</button>
    </div>
  </form>;
}

/* ------------------------------------------------------------------- 4. Trust */

function StepTrust({ passport, draft, setDraft, onSaveOwner, onBack, onNext, refresh }: { passport: PropertyPassport; draft: Draft; setDraft: (d: Draft) => void; onSaveOwner: (d: Draft) => void; onBack: () => void; onNext: () => void; refresh: () => void }) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const level = passport.trustLevel as Trust;
  const allContractor = passport.works.length > 0 && passport.works.every(w => w.contractorConfirmedAt);
  const allOwner = passport.works.length > 0 && passport.works.every(w => w.handoverStatus === 'accepted');
  const missingAfter = passport.works.filter(w => !w.afterPhotos.length);
  const contractorLink = async (w: PassportWork) => {
    setBusy(w.id);
    try { const r = await createContractorConfirmLink(passport.id, w.id); setLinks(o => ({ ...o, [w.id]: r.url })); refresh(); }
    catch { toast('Link yaradılmadı. Yenidən cəhd edin.'); } finally { setBusy(''); }
  };
  const ownerLink = async () => {
    setBusy('owner');
    try { const r = await createOwnerConfirmLink(passport.id); setLinks(o => ({ ...o, owner: r.url })); refresh(); }
    catch { toast('Link yaradılmadı. Yenidən cəhd edin.'); } finally { setBusy(''); }
  };
  const contractorText = (w: PassportWork, url: string) => `Salam${w.contractorName ? `, ${w.contractorName}` : ''}! "${passport.title}" mənzilində gördüyünüz "${w.title}" işini Təhvil pasportunda təsdiqləməyinizi xahiş edirəm. Bir klik kifayətdir:\n${url}`;
  const ownerText = (url: string) => `Salam${draft.ownerName ? `, ${draft.ownerName}` : ''}! Mənzilinizin Təhvil pasportu hazırdır. Hər təmir mərhələsini fotolara baxıb qəbul edin — bu, alıcının güvənini artırır:\n${url}`;
  return <div className="rl-step-card rl-trust-step">
    <div className="surface rl-panel">
      <div className="section-head"><div><div className="eyebrow">04 · Etibar statusu</div><h2>Hazırkı səviyyə: {passport.trustLevel === 'handover' ? 'Təhvil təsdiqli' : passport.trustLevel === 'contractor' ? 'Podratçı təsdiqli' : 'Əsas pasport'}</h2></div><TrustBadge level={level} size="lg" /></div>
      <TrustLadder level={level} />
    </div>

    <div className="surface rl-panel">
      <div className="section-head"><div><div className="eyebrow"><HardHat size={12} className="sm-ii" /> Səviyyə 2</div><h3>Podratçı təsdiqi {allContractor && <Check size={16} className="sm-ii" />}</h3></div></div>
      <p className="rl-hint">Hər iş üçün podratçıya unikal link göndərin. O, “Bu işi mən görmüşəm” deyə təsdiqləyir — qeydiyyat tələb olunmur.</p>
      {passport.works.map(w => <div key={w.id} className="rl-confirm-row">
        <div><strong>{w.title}</strong><small>{w.contractorConfirmedAt ? `Təsdiqlədi: ${w.contractorConfirmedName} · ${dateText(w.contractorConfirmedAt)}` : w.contractorName || 'Podratçı qeyd olunmayıb'}</small></div>
        {w.contractorConfirmedAt ? <Pill small tone="ok" icon={<Check size={11} />}>Təsdiqlənib</Pill> : links[w.id]
          ? <div className="rl-link-actions"><CopyButton text={links[w.id]} /><a className="button button-secondary sm-btn-sm rl-wa" href={waUrl(w.contractorPhone, contractorText(w, links[w.id]))} target="_blank" rel="noreferrer"><MessageCircle size={13} />WhatsApp</a></div>
          : <button type="button" className="button button-secondary sm-btn-sm" disabled={busy === w.id} onClick={() => { void contractorLink(w); }}>{busy === w.id ? <LoaderCircle className="spin" size={13} /> : <Link2 size={13} />}{w.contractorLinkActive ? 'Yeni link' : 'Təsdiq linki'}</button>}
      </div>)}
    </div>

    <div className="surface rl-panel rl-owner-panel">
      <div className="section-head"><div><div className="eyebrow"><KeyRound size={12} className="sm-ii" /> Səviyyə 3 — ən yüksək</div><h3>Ev sahibinin foto ilə qəbulu {allOwner && <Check size={16} className="sm-ii" />}</h3></div></div>
      <p className="rl-hint">Ev sahibi hər işi “sonra” fotolarına baxaraq qəbul edir və ya düzəliş istəyir. Bütün işlər qəbul olunanda pasport “Təhvil təsdiqli” olur.</p>
      {missingAfter.length > 0 && <p className="rl-warn"><AlertTriangle size={14} />{missingAfter.length} işin “sonra” fotosu yoxdur — ev sahibi onları qəbul edə bilməyəcək.</p>}
      <div className="field-grid">
        <Field label="Ev sahibinin adı" name="owner-name" value={draft.ownerName} onChange={v => setDraft({ ...draft, ownerName: v })} />
        <Field label="Ev sahibinin telefonu" name="owner-phone" type="tel" value={draft.ownerPhone} onChange={v => setDraft({ ...draft, ownerPhone: v })} />
      </div>
      <div className="rl-link-actions">
        {(draft.ownerName !== passport.ownerName || draft.ownerPhone !== passport.ownerPhone) && <button type="button" className="button button-secondary sm-btn-sm" onClick={() => onSaveOwner(draft)}>Yadda saxla</button>}
        {links.owner ? <><CopyButton text={links.owner} /><a className="button button-primary sm-btn-sm rl-wa" href={waUrl(draft.ownerPhone, ownerText(links.owner))} target="_blank" rel="noreferrer"><Send size={13} />Ev sahibinə göndər</a></>
          : <button type="button" className="button button-primary sm-btn-sm" disabled={busy === 'owner' || !passport.works.length} onClick={() => { void ownerLink(); }}>{busy === 'owner' ? <LoaderCircle className="spin" size={13} /> : <ClipboardCheck size={13} />}{passport.ownerLinkActive ? 'Yeni qəbul linki' : 'Qəbul linki yarat'}</button>}
      </div>
      <div className="rl-owner-status">{passport.works.map(w => <span key={w.id} className={w.handoverStatus}>{w.handoverStatus === 'accepted' ? <Check size={12} /> : w.handoverStatus === 'revision' ? <AlertTriangle size={12} /> : <span className="dot" />}{w.title}</span>)}</div>
    </div>
    <StepNav onBack={onBack} onNext={onNext} nextLabel="Paylaşıma keç" />
  </div>;
}

/* ------------------------------------------------------------------- 5. Share */

function StepShare({ passport, onBack, refresh }: { passport: PropertyPassport; onBack: () => void; refresh: () => void }) {
  const [, setLocation] = useLocation();
  const setStatus = useSetPropertyPassportStatus();
  const remove = useDeletePropertyPassport();
  const [storyBusy, setStoryBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const published = passport.status === 'published';
  const url = passportUrl(passport.publicId);
  const text = useMemo(() => passportShareText(passport), [passport]);
  const publish = (status: 'published' | 'draft' | 'archived') => setStatus.mutate({ passportId: passport.id, data: { status } }, { onSuccess: () => { refresh(); toast(status === 'published' ? 'Pasport dərc olundu' : status === 'archived' ? 'Pasport arxivləndi' : 'Pasport qaralamaya qaytarıldı'); } });
  const story = async () => {
    setStoryBusy(true);
    try { const blob = await storyImage(passport); setPreview(URL.createObjectURL(blob)); downloadBlob(blob, `tehvil-${passport.publicId}-story.png`); }
    catch { toast('Şəkil yaradılmadı'); } finally { setStoryBusy(false); }
  };
  const downloadQr = async () => {
    const a = document.createElement('a'); a.href = await qrDataUrl(qrUrl(passport.publicId), 1200); a.download = `tehvil-${passport.publicId}-qr.png`; a.click();
  };
  return <div className="rl-step-card">
    <div className={`surface rl-panel rl-publish ${published ? 'on' : ''}`}>
      <div><div className="eyebrow">05 · Paylaşım</div><h2>{published ? 'Pasport dərc olunub — alıcılar görə bilər' : 'Pasport hələ qaralamadır'}</h2>
        <p className="rl-hint">{published ? 'Link və QR kod login tələb etmir. İstənilən vaxt qaralamaya qaytara bilərsiniz.' : 'Dərc etdikdən sonra link, QR kod, PDF və story şəkli işləyəcək.'}</p></div>
      {published ? <button type="button" className="button button-secondary" onClick={() => publish('draft')} disabled={setStatus.isPending}>Qaralamaya qaytar</button>
        : <button type="button" className="button button-primary" onClick={() => publish('published')} disabled={setStatus.isPending || !passport.works.length} data-testid="button-publish-passport">{setStatus.isPending ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}Dərc et</button>}
    </div>
    {!passport.works.length && <p className="rl-warn"><AlertTriangle size={14} />Dərc etmək üçün ən azı bir təmir işi əlavə edin.</p>}

    <div className={`rl-share-grid ${published ? '' : 'disabled'}`} aria-disabled={!published}>
      <div className="surface rl-panel rl-share-qr">
        <CertifiedSeal level={passport.trustLevel as Trust} />
        <Qr value={qrUrl(passport.publicId)} size={188} label="QR kodla təmir tarixçəsini yoxlayın" />
        <div className="rl-link-actions"><button type="button" className="button button-secondary sm-btn-sm" onClick={() => { void downloadQr(); }} disabled={!published}><Download size={13} />QR PNG</button><a className="button button-secondary sm-btn-sm" href={`${url}/print`} target="_blank" rel="noreferrer" aria-disabled={!published} onClick={e => { if (!published) e.preventDefault(); }}><FileDown size={13} />PDF yüklə</a></div>
      </div>
      <div className="surface rl-panel">
        <div className="eyebrow">Unikal link</div>
        <div className="rl-url"><code>{url.replace(/^https?:\/\//, '')}</code><CopyButton text={url} /></div>
        <div className="eyebrow" style={{ marginTop: 16 }}>WhatsApp paylaşım mətni</div>
        <pre className="rl-pre small">{text}</pre>
        <div className="rl-link-actions"><CopyButton text={text} label="Mətni kopyala" /><a className="button button-primary sm-btn-sm rl-wa" href={waUrl('', text)} target="_blank" rel="noreferrer"><MessageCircle size={13} />WhatsApp-da paylaş</a></div>
        <div className="eyebrow" style={{ marginTop: 16 }}>Instagram story</div>
        <div className="rl-link-actions"><button type="button" className="button button-secondary sm-btn-sm" onClick={() => { void story(); }} disabled={storyBusy || !published}>{storyBusy ? <LoaderCircle className="spin" size={13} /> : <Instagram size={13} />}Story şəkli yarat (1080×1920)</button></div>
        {preview && <img className="rl-story-preview" src={preview} alt="Story şəkli" />}
      </div>
    </div>

    <div className="surface rl-panel">
      <div className="eyebrow">Statistika</div>
      <dl className="rl-results inline">
        <div><dt>Baxış</dt><dd>{num(passport.stats.views)}</dd></div>
        <div><dt>QR skan</dt><dd>{passport.stats.qrScans}</dd></div>
        <div><dt>WhatsApp klik</dt><dd>{passport.stats.whatsappClicks}</dd></div>
        <div><dt>Paylaşım</dt><dd>{passport.stats.shares}</dd></div>
        <div><dt>Sorğu</dt><dd>{passport.stats.leads}</dd></div>
      </dl>
    </div>

    <div className="rl-step-nav">
      <button type="button" className="button button-quiet" onClick={onBack}><ArrowLeft size={15} />Geri</button>
      <div className="heading-buttons">
        {passport.status !== 'archived' && <button type="button" className="button button-quiet sm-btn-sm" onClick={() => publish('archived')}>Arxivlə</button>}
        <button type="button" className="button button-quiet sm-btn-sm" onClick={() => { if (window.confirm('Pasport silinsin? Link və QR kod işləməyəcək.')) remove.mutate({ passportId: passport.id }, { onSuccess: () => { refresh(); setLocation('/realtor/passports'); } }); }}><Trash2 size={13} />Sil</button>
        {published && <a className="button button-primary" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} />Pasporta bax</a>}
      </div>
    </div>
  </div>;
}
