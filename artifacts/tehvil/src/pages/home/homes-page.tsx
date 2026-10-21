import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, BellRing, ClipboardCheck, HardHat, Home, House, ImagePlus, LoaderCircle, MapPin, Plus } from 'lucide-react';
import { useCreateHome, useGetMyInbox, useGetMyRoles, useListHomes, useUpdateHome, type Home as HomeT, type HomeInput } from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { HomeToaster, Modal, Pill, Seg, Select, Skeleton, opts, toast } from '@/components/home/ui';
import { HOME_ROLE, PROPERTY, PROPERTY_SIMPLE, STAGE, clearDraft, day, loadDraft, refreshHomeData, saveDraft } from '@/lib/home/labels';
import { uploadHomeMedia } from '@/lib/home/upload';

export function HomesPage() {
  const homes = useListHomes();
  const inbox = useGetMyInbox();
  const roles = useGetMyRoles({ query: { queryKey: ['/api/me/roles'] } });
  const [creating, setCreating] = useState(() => new URLSearchParams(window.location.search).get('new') === '1');
  const [, setLocation] = useLocation();
  useEffect(() => {
    // The sidebar button opens the form even when we are already on this page.
    const open = () => { if (new URLSearchParams(window.location.search).get('new') === '1') setCreating(true); };
    window.addEventListener('popstate', open); open();
    return () => window.removeEventListener('popstate', open);
  });
  const close = () => { setCreating(false); if (window.location.search.includes('new=1')) setLocation('/homes', { replace: true }); };
  const list = homes.data ?? [];
  const pendingInvites = (inbox.data?.participations.length ?? 0) + (inbox.data?.memberships.length ?? 0);
  const approvals = inbox.data?.approvals.length ?? 0;
  const firstVisit = !homes.isLoading && !list.length;
  return <>
    {!firstVisit && <PageHeading eyebrow="Evlərim" title="Evlərim" description="Evinizin işləri, texniki məlumatları və sənədləri."
      action={<button type="button" className="button button-primary" onClick={() => setCreating(true)} data-testid="button-create-home"><Plus size={16} />Ev əlavə et</button>} />}
    {(pendingInvites > 0 || approvals > 0) && <div className="hp-alerts">
      {approvals > 0 && <Link href="/approvals" className="hp-alert warn" data-testid="link-approvals"><ClipboardCheck size={17} /><span><b>{approvals} iş</b> sizin təsdiqinizi gözləyir</span><ArrowUpRight size={15} /></Link>}
      {pendingInvites > 0 && <Link href="/invitations" className="hp-alert" data-testid="link-invitations"><BellRing size={17} /><span>Sizi <b>{pendingInvites}</b> evə və ya işə dəvət ediblər</span><ArrowUpRight size={15} /></Link>}
    </div>}
    {homes.isLoading ? <Skeleton rows={3} /> : firstVisit ? <section className="hp-welcome">
      <div className="hp-welcome-mark"><House size={34} /></div>
      <h1 className="font-display">Evinin məlumatları bir yerdə.</h1>
      <p>Görülən işləri, fotoları və vacib detalları saxla — lazım olanda paylaş. Başlamaq üçün yalnız evin adı kifayətdir.</p>
      <button type="button" className="button button-primary hp-big hp-welcome-cta" onClick={() => setCreating(true)} data-testid="button-create-home"><Plus size={18} />İlk evini əlavə et</button>
      <ol className="hp-welcome-steps"><li><b>1</b>Ev əlavə et</li><li><b>2</b>İş və foto əlavə et</li><li><b>3</b>Lazım olanda paylaş</li></ol>
    </section> : <div className="hp-home-grid">{list.map(h => <Link key={h.id} href={`/homes/${h.id}`} className="hp-home-card" data-testid={`card-home-${h.id}`}>
      <div className="hp-home-cover">{h.coverUrl ? <img src={h.coverUrl} alt="" loading="lazy" /> : <Home size={30} />}<Pill small tone={h.myRole === 'owner' ? 'ok' : 'info'}>{HOME_ROLE[h.myRole] ?? h.myRole}</Pill></div>
      <div className="hp-home-body">
        <h3>{h.name}</h3>
        <small><MapPin size={12} className="sm-ii" /> {[h.address, h.district, h.city].filter(Boolean).join(', ') || PROPERTY[h.propertyType]}</small>
        <div className="hp-home-meta"><span><b>{h.works}</b> iş</span>{h.lastWorkAt && <span>son iş: {day(h.lastWorkAt)}</span>}</div>
        {h.pendingApproval > 0 && <span className="hp-pending"><ClipboardCheck size={13} />{h.pendingApproval} iş təsdiqinizi gözləyir</span>}
      </div>
    </Link>)}</div>}
    {creating && <AddHomeModal onClose={close} onSaved={id => { setCreating(false); setLocation(`/homes/${id}/tarixce`); }} />}
    <HomeToaster />
  </>;
}

const DRAFT = 'new-home';
/** Step 1: only what is needed to start. Everything else is filled in later from the home page. */
export function AddHomeModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const create = useCreateHome();
  const update = useUpdateHome();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => loadDraft<{ name: string; propertyType: string; address: string }>(DRAFT) ?? { name: '', propertyType: 'apartment', address: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { saveDraft(DRAFT, form); }, [form]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) { setError('Evin adını yazın, məsələn “Bakıdakı evim”.'); return; }
    setBusy(true); setError('');
    try {
      const data: HomeInput = { name: form.name.trim(), propertyType: form.propertyType as HomeInput['propertyType'], address: form.address.trim(), city: 'Bakı' };
      const o = await create.mutateAsync({ data });
      if (photo) {
        try {
          const [m] = await uploadHomeMedia([photo], { homeId: o.home.id }, { videos: false });
          if (m) await update.mutateAsync({ homeId: o.home.id, data: { ...data, coverMediaId: m.id } });
        } catch { toast('Ev əlavə olundu, amma şəkil yüklənmədi. Şəkli sonra əlavə edə bilərsiniz.'); }
      }
      clearDraft(DRAFT);
      void refreshHomeData(qc);
      onSaved(o.home.id);
    } catch { setError('Ev əlavə olunmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.'); }
    finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} eyebrow="Yeni ev" title="Ev əlavə et"
    footer={<button type="submit" form="add-home" className="button button-primary hp-big" disabled={busy} data-testid="button-save-home">{busy && <LoaderCircle className="spin" size={15} />}Evi əlavə et</button>}>
    <form id="add-home" className="rl-form" onSubmit={e => { void submit(e); }}>
      <Field label="Evin adı" name="home-name" required value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="məs. Bakıdakı evim" />
      <Seg label="Ev növü" value={form.propertyType} options={PROPERTY_SIMPLE} onChange={v => setForm({ ...form, propertyType: v })} />
      <Field label="Ünvan və ya qısa təsvir (istəyə bağlı)" name="home-address" value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="məs. Yasamal, 3 otaqlı mənzil" />
      <small className="rl-hint">Ünvanı yalnız siz görürsünüz. Başqasına göstərmək sizin seçiminizdir.</small>
      <label className="field"><span>Şəkil (istəyə bağlı)</span>
        <span className="hp-file"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] ?? null)} data-testid="input-home-photo" /><ImagePlus size={16} />{photo ? photo.name : 'Şəkil seç'}</span>
      </label>
      <p className="rl-hint">Qalan məlumatları — otaqları, işləri, texniki məlumatları, sənədləri — sonra, istədiyiniz vaxt əlavə edə bilərsiniz.</p>
      <p className="rl-hint">Ev əlavə etmək mülkiyyətin rəsmi təsdiqi deyil — bu, sizin öz qeydlərinizdir.</p>
      {error && <p className="sm-field-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}

const blank = { name: '', propertyType: 'apartment', city: 'Bakı', district: '', address: '', areaM2: '', roomCount: '', floor: '', builtYear: '', stage: 'living', notes: '' };
const fromHome = (h?: HomeT) => h ? { name: h.name, propertyType: h.propertyType, city: h.city, district: h.district, address: h.address, areaM2: h.areaM2?.toString() ?? '', roomCount: h.roomCount?.toString() ?? '', floor: h.floor, builtYear: h.builtYear?.toString() ?? '', stage: h.stage, notes: h.notes } : blank;

export function HomeFormModal({ open, onClose, onSaved, home }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; home?: HomeT }) {
  const create = useCreateHome();
  const update = useUpdateHome();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => fromHome(home));
  const set = (k: keyof typeof blank) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const n = (v: string) => (v.trim() ? Number(v) : null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data: HomeInput = { name: form.name.trim(), propertyType: form.propertyType as HomeInput['propertyType'], city: form.city, district: form.district, address: form.address, areaM2: n(form.areaM2), roomCount: n(form.roomCount), floor: form.floor, builtYear: n(form.builtYear), stage: form.stage as HomeInput['stage'], notes: form.notes };
    const done = { onSuccess: (o: { home: HomeT }) => { void refreshHomeData(qc); toast(home ? 'Ev profili yeniləndi' : 'Ev yaradıldı'); onSaved(o.home.id); } };
    if (home) update.mutate({ homeId: home.id, data }, done); else create.mutate({ data }, done);
  };
  const busy = create.isPending || update.isPending;
  return <Modal open={open} onClose={onClose} eyebrow="Evin məlumatları" title={home ? 'Evin məlumatlarını dəyiş' : 'Yeni ev'} wide
    footer={<button type="submit" form="home-form" className="button button-primary" disabled={busy || form.name.trim().length < 2} data-testid="button-save-home">{busy && <LoaderCircle className="spin" size={15} />}Yadda saxla</button>}>
    <form id="home-form" className="rl-form" onSubmit={submit}>
      <Field label="Evin adı" name="home-name" required value={form.name} onChange={set('name')} placeholder="məs. Yasamaldakı mənzil" />
      <Seg label="Əmlak növü" value={form.propertyType} options={opts(PROPERTY)} onChange={set('propertyType')} />
      <div className="field-grid three">
        <Field label="Şəhər" name="home-city" value={form.city} onChange={set('city')} />
        <Field label="Rayon" name="home-district" value={form.district} onChange={set('district')} placeholder="məs. Yasamal" />
        <Select label="Hazırda" name="home-stage" value={form.stage} onChange={set('stage')} options={opts(STAGE)} />
      </div>
      <Field label="Ünvan (yalnız siz görürsünüz)" name="home-address" value={form.address} onChange={set('address')} />
      <div className="field-grid four">
        <Field label="Sahə, m²" name="home-area" type="number" min="1" value={form.areaM2} onChange={set('areaM2')} />
        <Field label="Otaq sayı" name="home-rooms" type="number" min="0" value={form.roomCount} onChange={set('roomCount')} />
        <Field label="Mərtəbə" name="home-floor" value={form.floor} onChange={set('floor')} placeholder="7/16" />
        <Field label="Tikinti ili" name="home-year" type="number" min="1800" max="2100" value={form.builtYear} onChange={set('builtYear')} />
      </div>
      <Field label="Qeyd" name="home-notes"><textarea rows={3} maxLength={4000} value={form.notes} onChange={e => set('notes')(e.target.value)} /></Field>
    </form>
  </Modal>;
}
