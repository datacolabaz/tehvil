import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, ExternalLink, Eye, FileText, Link2, LoaderCircle, MapPin, Pencil, Plus, Search, ShieldCheck, Sparkles, Trash2, UserRound, Users, Wand2, X } from 'lucide-react';
import {
  getGetRealtorOverviewQueryKey, getListRealtorListingsQueryKey, useCreateRealtorListing, useDeleteRealtorListing, useListRealtorAgents,
  useListRealtorListings, useUpdateRealtorListing, useImportRealtorListing,
  type ExternalLink as Ext, type ListingImport, type RealtorListing, type RealtorListingInput, type RealtorMedia,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { errorToMsg } from '@/lib/feedback';
import { CopyButton, Drawer, Empty, Modal, PassportFlag, PhotoPicker, Pill, RealtorToaster, Skeleton, toast } from '@/components/realtor/ui';
import { DEAL, KIND, LISTING_STATUS, LISTING_TONE, PORTAL, facts, listingDescription, num, price, type Trust } from '@/lib/realtor/labels';

const STATUS_TABS = ['all', 'active', 'pending', 'sold', 'archived'] as const;
const emptyForm = { title: '', dealType: 'sale', propertyKind: 'apartment', district: '', address: '', rooms: '', areaM2: '', floor: '', price: '', currency: 'AZN', status: 'active', description: '', agentId: '' };

export function RealtorListingsPage() {
  const listings = useListRealtorListings();
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<RealtorListing | 'new' | null>(null);
  const [describe, setDescribe] = useState<RealtorListing | null>(null);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new')) setEditing('new'); }, []);

  const rows = useMemo(() => (listings.data ?? []).filter(l => (tab === 'all' || l.status === tab) && (!q || `${l.title} ${l.district} ${l.address}`.toLocaleLowerCase('az').includes(q.toLocaleLowerCase('az')))), [listings.data, tab, q]);
  const count = (s: string) => (listings.data ?? []).filter(l => s === 'all' || l.status === s).length;

  return <>
    <PageHeading eyebrow="Elanlarım" title="Elanlar" description="Bütün mənzillərinizi bir yerdə idarə edin. Pasportlu elanlar alıcıya yoxlanıla bilən təmir tarixçəsi göstərir." action={<button type="button" className="button button-primary" onClick={() => setEditing('new')} data-testid="button-add-listing"><Plus size={16} />Elan əlavə et</button>} />
    <div className="rl-toolbar">
      <div className="sm-tabs rl-tabs" role="tablist">{STATUS_TABS.map(s => <button key={s} type="button" role="tab" aria-selected={tab === s} className={`sm-tab ${tab === s ? 'active' : ''}`} onClick={() => setTab(s)}>{s === 'all' ? 'Hamısı' : LISTING_STATUS[s]} <span className="rl-tab-count">{count(s)}</span></button>)}</div>
      <label className="rl-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Başlıq, rayon, ünvan" aria-label="Elan axtar" /></label>
    </div>
    {listings.isLoading ? <Skeleton rows={3} /> : rows.length ? <div className="rl-listing-grid">{rows.map(l => <ListingCard key={l.id} l={l} onEdit={() => setEditing(l)} onDescribe={() => setDescribe(l)} />)}</div>
      : <Empty icon={<Building2 size={28} />} title={listings.data?.length ? 'Bu filtrdə elan yoxdur' : 'Hələ elan yoxdur'} text="İlk mənzilinizi əlavə edin. Brokly.az, Tap.az və ya Bina.az linkini də qeyd edə bilərsiniz." action={<button type="button" className="button button-primary" onClick={() => setEditing('new')}><Plus size={16} />Elan əlavə et</button>} />}
    {editing && <ListingDrawer listing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    <Modal open={!!describe} onClose={() => setDescribe(null)} eyebrow="Elan üçün hazır təsvir" title={describe?.title ?? ''} footer={describe && <CopyButton text={listingDescription(describe, describe.passportStatus === 'published' ? describe.passportPublicId : null)} label="Mətni kopyala" className="button button-primary" />}>
      {describe && <pre className="rl-pre">{listingDescription(describe, describe.passportStatus === 'published' ? describe.passportPublicId : null)}</pre>}
      {describe && describe.passportStatus !== 'published' && <p className="rl-hint"><ShieldCheck size={13} className="sm-ii" /> Pasport dərc olunduqdan sonra mətnə “Təhvil Sertifikatlı” bloku və yoxlama linki avtomatik əlavə olunur.</p>}
    </Modal>
    <RealtorToaster />
  </>;
}

function ListingCard({ l, onEdit, onDescribe }: { l: RealtorListing; onEdit: () => void; onDescribe: () => void }) {
  const cover = l.photos[0];
  const certified = l.passportStatus === 'published';
  return <article className={`rl-listing ${certified ? 'certified' : ''}`} data-testid={`card-listing-${l.id}`}>
    <div className="rl-listing-cover">{cover ? <img src={cover.url} alt="" loading="lazy" /> : <Building2 size={30} />}
      <div className="rl-listing-badges"><Pill small tone={LISTING_TONE[l.status]}>{LISTING_STATUS[l.status]}</Pill></div>
      {l.photos.length > 1 && <span className="rl-photo-count">{l.photos.length} foto</span>}
    </div>
    <div className="rl-listing-body">
      <PassportFlag has={!!l.passportId && l.passportStatus !== 'archived'} level={certified ? l.trustLevel as Trust : null} />
      <div className="eyebrow">{DEAL[l.dealType]} · {KIND[l.propertyKind]}</div>
      <h3>{l.title}</h3>
      <div className="sm-card-meta"><span><MapPin size={12} />{facts(l)}</span></div>
      <div className="rl-price">{price(l.price, l.currency)}</div>
      {l.externalLinks.length > 0 && <div className="rl-links">{l.externalLinks.map((x, i) => <a key={i} href={x.url} target="_blank" rel="noreferrer"><Link2 size={11} />{PORTAL[x.portal]}</a>)}</div>}
      <div className="rl-listing-meta"><span><Eye size={12} />{num(l.views)} baxış</span><span><Users size={12} />{l.leadCount} lead</span>{l.agentName && <span><UserRound size={12} />{l.agentName}</span>}</div>
      <div className="rl-listing-actions">
        <button type="button" className="button button-secondary sm-btn-sm" onClick={onEdit}><Pencil size={13} />Redaktə</button>
        <button type="button" className="button button-quiet sm-btn-sm" onClick={onDescribe}><FileText size={13} />Təsvir</button>
        {l.passportId ? <Link href={`/realtor/passports/${l.passportId}`} className="button button-quiet sm-btn-sm"><ShieldCheck size={13} />Pasport</Link>
          : <Link href={`/realtor/passports/new?listing=${l.id}`} className="button button-primary sm-btn-sm"><ShieldCheck size={13} />Pasport yarat</Link>}
      </div>
    </div>
  </article>;
}

function ListingDrawer({ listing, onClose }: { listing: RealtorListing | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const agents = useListRealtorAgents();
  const create = useCreateRealtorListing();
  const update = useUpdateRealtorListing();
  const remove = useDeleteRealtorListing();
  const importer = useImportRealtorListing();
  const isNew = !listing;
  // New listings use a 3-step wizard: property → portal links → passport offer.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [created, setCreated] = useState<RealtorListing | null>(null);
  const [form, setForm] = useState(() => listing ? {
    title: listing.title, dealType: listing.dealType, propertyKind: listing.propertyKind, district: listing.district, address: listing.address,
    rooms: listing.rooms?.toString() ?? '', areaM2: listing.areaM2?.toString() ?? '', floor: listing.floor, price: listing.price?.toString() ?? '',
    currency: listing.currency, status: listing.status, description: listing.description, agentId: listing.agentId ?? '',
  } : emptyForm);
  const [photos, setPhotos] = useState<RealtorMedia[]>(listing?.photos ?? []);
  const [links, setLinks] = useState<Ext[]>(listing?.externalLinks ?? []);
  const [importUrl, setImportUrl] = useState('');
  const [imported, setImported] = useState<ListingImport | null>(null);
  const [importError, setImportError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const f = (k: keyof typeof form) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const refresh = () => { void qc.invalidateQueries({ queryKey: getListRealtorListingsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() }); };
  const done = (msg: string) => { refresh(); toast(msg); onClose(); };

  const runImport = () => {
    setImportError('');
    importer.mutate({ data: { url: importUrl.trim() } }, {
      onSuccess: r => {
        setImported(r);
        setForm(o => ({
          ...o,
          title: r.title ?? o.title, dealType: r.dealType ?? o.dealType, propertyKind: r.propertyKind ?? o.propertyKind, district: r.district ?? o.district,
          address: r.address ?? o.address, rooms: r.rooms?.toString() ?? o.rooms, areaM2: r.areaM2?.toString() ?? o.areaM2, floor: r.floor ?? o.floor,
          price: r.price?.toString() ?? o.price, currency: r.currency === 'USD' ? 'USD' : r.currency === 'AZN' ? 'AZN' : o.currency, description: o.description || r.description || '',
        }));
        if (r.photos.length) setPhotos(ph => [...ph, ...r.photos].slice(0, 20));
        setLinks(ls => ls.some(x => x.url === r.url) ? ls : [{ portal: r.portal as Ext['portal'], url: r.url }, ...ls]);
      },
      onError: e => setImportError(errorToMsg(e).detail ?? 'Səhifəni oxumaq alınmadı. Sahələri əl ilə doldurun.'),
    });
  };

  const payload = (): RealtorListingInput => ({
    title: form.title.trim(), dealType: form.dealType as 'sale', propertyKind: form.propertyKind as 'apartment', district: form.district.trim(), address: form.address,
    rooms: n(form.rooms), areaM2: n(form.areaM2), floor: form.floor, price: n(form.price), currency: form.currency as 'AZN', status: form.status as 'active',
    description: form.description, agentId: form.agentId || null, photoIds: photos.map(p => p.id),
    externalLinks: links.filter(x => x.url.trim()).map(x => ({ portal: x.portal, url: /^https?:\/\//i.test(x.url.trim()) ? x.url.trim() : `https://${x.url.trim()}` })),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isNew && step === 1) { setStep(2); return; }
    if (listing) update.mutate({ listingId: listing.id, data: payload() }, { onSuccess: () => done('Elan yadda saxlanıldı') });
    else create.mutate({ data: payload() }, { onSuccess: l => { refresh(); setCreated(l); setStep(3); } });
  };
  const pending = create.isPending || update.isPending;

  const propertyFields = <>
    {isNew && <div className="rl-import">
      <div className="rl-import-head"><Wand2 size={16} /><div><b>Linkiniz var? Məlumatları avtomatik çəkək</b><small>Brokly.az, Tap.az, Bina.az, Yeniemlak.az elan linkini yapışdırın.</small></div></div>
      <div className="rl-import-row">
        <input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://bina.az/items/…" aria-label="Elan linki" inputMode="url" data-testid="input-import-url" />
        <button type="button" className="button button-secondary sm-btn-sm" disabled={importUrl.trim().length < 8 || importer.isPending} onClick={runImport} data-testid="button-import">{importer.isPending ? <LoaderCircle className="spin" size={14} /> : <Wand2 size={14} />}Çək</button>
      </div>
      {importer.isPending && <small className="rl-hint">Səhifə oxunur və şəkillər köçürülür…</small>}
      {imported && <p className="rl-import-ok"><Sparkles size={13} />{imported.found.length ? `Doldurulan: ${imported.found.join(', ')}. Yoxlayıb düzəldin.` : 'Məlumat tapılmadı.'}{imported.warnings.map(w => <span key={w}> {w}</span>)}</p>}
      {importError && <small className="sm-field-error" role="alert">{importError}</small>}
    </div>}
    <Field label="Başlıq" name="listing-title" required value={form.title} onChange={f('title')} placeholder="məs. Nərimanovda təmirli 3 otaqlı mənzil" />
    <div className="field-grid">
      <Field label="Satış / icarə" name="listing-deal"><select value={form.dealType} onChange={e => f('dealType')(e.target.value)}><option value="sale">Satış</option><option value="rent">İcarə</option></select></Field>
      <Field label="Obyekt tipi" name="listing-kind"><select value={form.propertyKind} onChange={e => f('propertyKind')(e.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    </div>
    <div className="field-grid">
      <Field label="Rayon" name="listing-district" required value={form.district} onChange={f('district')} placeholder="məs. Nərimanov" />
      <Field label="Ünvan" name="listing-address" value={form.address} onChange={f('address')} placeholder="Küçə, bina (istəyə görə)" />
    </div>
    <div className="field-grid three">
      <Field label="Otaq sayı" name="listing-rooms" type="number" min="0" value={form.rooms} onChange={f('rooms')} />
      <Field label="Sahə, m²" name="listing-area" type="number" min="0" step="0.1" value={form.areaM2} onChange={f('areaM2')} />
      <Field label="Mərtəbə" name="listing-floor" value={form.floor} onChange={f('floor')} placeholder="7/16" />
    </div>
    <div className="field-grid three">
      <Field label="Qiymət" name="listing-price" type="number" min="0" value={form.price} onChange={f('price')} />
      <Field label="Valyuta" name="listing-currency"><select value={form.currency} onChange={e => f('currency')(e.target.value)}><option>AZN</option><option>USD</option></select></Field>
      <Field label="Status" name="listing-status"><select value={form.status} onChange={e => f('status')(e.target.value)}>{Object.entries(LISTING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    </div>
    <div className="field"><span>Əsas şəkillər</span><PhotoPicker media={photos} onChange={setPhotos} max={20} hint="İlk şəkil əsas şəkildir. Ulduz düyməsi ilə dəyişin." testId="listing-photos" /></div>
  </>;
  const linkFields = <>
    <div className="field"><span>Elan linkləri</span>
      {isNew && <p className="rl-hint" style={{ marginTop: 0 }}>Mənzil Brokly.az, Tap.az, Bina.az və ya başqa portalda da yerləşibsə, linkləri əlavə edin — pasportda “portalda elan” kimi görünəcək.</p>}
      {links.map((x, i) => <div className="rl-link-row" key={i}>
        <select value={x.portal} onChange={e => setLinks(links.map((y, j) => j === i ? { ...y, portal: e.target.value as Ext['portal'] } : y))} aria-label="Portal">{Object.entries(PORTAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input value={x.url} onChange={e => setLinks(links.map((y, j) => j === i ? { ...y, url: e.target.value } : y))} placeholder="https://brokly.az/…" aria-label="Link" />
        <button type="button" className="icon-button" aria-label="Linki sil" onClick={() => setLinks(links.filter((_, j) => j !== i))}><X size={15} /></button>
      </div>)}
      {links.length < 6 && <button type="button" className="sm-link-btn" onClick={() => setLinks([...links, { portal: links.length ? 'tap' : 'brokly', url: '' }])}><ExternalLink size={13} />Brokly.az və ya digər portal linki əlavə et</button>}
    </div>
    {(agents.data?.length ?? 0) > 0 && <Field label="Məsul agent" name="listing-agent"><select value={form.agentId} onChange={e => f('agentId')(e.target.value)}><option value="">— Özüm —</option>{agents.data!.filter(a => a.active || a.id === form.agentId).map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select></Field>}
    <Field label="Təsvir" name="listing-description"><textarea value={form.description} onChange={e => f('description')(e.target.value)} rows={6} maxLength={4000} /></Field>
    <button type="button" className="sm-link-btn" onClick={() => f('description')(listingDescription({ ...form, dealType: form.dealType as 'sale', propertyKind: form.propertyKind as 'apartment', rooms: n(form.rooms), areaM2: n(form.areaM2), price: n(form.price), currency: form.currency as 'AZN' }, listing?.passportStatus === 'published' ? listing.passportPublicId : null))}><Wand2 size={13} />Hazır təsvir yarat</button>
  </>;

  if (isNew && step === 3 && created) {
    return <Drawer open onClose={onClose} eyebrow="Elan əlavə olundu" title={created.title}>
      <div className="rl-offer">
        <span className="rl-offer-icon"><ShieldCheck size={26} /></span>
        <h3>Bu mənzil üçün “Təhvil Sertifikatlı Mənzil” pasportu yaratmaq istəyirsiniz?</h3>
        <p>Təmir işləri, əvvəl/sonra fotoları, podratçı və ev sahibi təsdiqi — alıcı QR kodu skan edib hamısını yoxlayır. Brokly-də bu yoxdur.</p>
        <button type="button" className="button button-primary full-button" onClick={() => { onClose(); setLocation(`/realtor/passports/new?listing=${created.id}`); }} data-testid="button-offer-yes"><ShieldCheck size={16} />Bəli, pasport yarat</button>
        <button type="button" className="button button-quiet full-button" onClick={() => { toast('Elan əlavə olundu'); onClose(); }} data-testid="button-offer-no">Xeyr, sonra yaradaram</button>
      </div>
    </Drawer>;
  }

  return <Drawer open onClose={onClose} eyebrow={listing ? 'Elanı redaktə et' : `Yeni elan · Addım ${step}/3`} title={listing?.title || (step === 1 ? 'Mənzil məlumatı' : 'Elan linki')} footer={<div className="rl-drawer-actions">
    {listing ? (confirmDelete
      ? <button type="button" className="button button-danger sm-btn-sm" onClick={() => remove.mutate({ listingId: listing.id }, { onSuccess: () => done('Elan silindi') })}><Trash2 size={13} />Təsdiqlə — sil</button>
      : <button type="button" className="button button-quiet sm-btn-sm" onClick={() => setConfirmDelete(true)}><Trash2 size={13} />Sil</button>)
      : step === 2 ? <button type="button" className="button button-quiet sm-btn-sm" onClick={() => setStep(1)}><ArrowLeft size={13} />Geri</button> : <span />}
    <button type="submit" form="listing-form" className="button button-primary" disabled={pending} data-testid="button-save-listing">{pending && <LoaderCircle className="spin" size={15} />}{listing ? 'Yadda saxla' : step === 1 ? <>Davam et<ArrowRight size={15} /></> : 'Elanı yadda saxla'}</button>
  </div>}>
    {isNew && <div className="rl-mini-steps" aria-hidden><i className="on" /><i className={step >= 2 ? 'on' : ''} /><i /></div>}
    <form id="listing-form" className="rl-form" onSubmit={submit}>
      {(!isNew || step === 1) && propertyFields}
      {(!isNew || step === 2) && linkFields}
    </form>
  </Drawer>;
}
