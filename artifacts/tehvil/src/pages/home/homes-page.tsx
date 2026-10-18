import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BellRing, Calculator, ClipboardCheck, HardHat, Home, House, LoaderCircle, MapPin, Plus, QrCode, ShieldCheck } from 'lucide-react';
import { useCreateHome, useGetMyInbox, useListHomes, useUpdateHome, type Home as HomeT, type HomeInput } from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { Empty, HomeToaster, Modal, Pill, Seg, Select, Skeleton, opts, toast } from '@/components/home/ui';
import { HOME_ROLE, PROPERTY, STAGE, day, refreshHomeData } from '@/lib/home/labels';

export function HomesPage() {
  const homes = useListHomes();
  const inbox = useGetMyInbox();
  const [creating, setCreating] = useState(false);
  const [, setLocation] = useLocation();
  const list = homes.data ?? [];
  const pendingInvites = (inbox.data?.participations.length ?? 0) + (inbox.data?.memberships.length ?? 0);
  const approvals = inbox.data?.approvals.length ?? 0;
  return <>
    <PageHeading eyebrow="Evin rəqəmsal pasportu" title="Mənim evlərim" description="Hər evin tikinti və təmir tarixçəsi, gizli kommunikasiyaları, avadanlıqları və orada işləmiş ustalar — bir yerdə, sübutlarla."
      action={<button type="button" className="button button-primary" onClick={() => setCreating(true)} data-testid="button-create-home"><Plus size={16} />Ev əlavə et</button>} />
    {(pendingInvites > 0 || approvals > 0) && <div className="hp-alerts">
      {approvals > 0 && <Link href="/approvals" className="hp-alert warn" data-testid="link-approvals"><ClipboardCheck size={17} /><span><b>{approvals} iş</b> sizin təsdiqinizi gözləyir</span><ArrowUpRight size={15} /></Link>}
      {pendingInvites > 0 && <Link href="/invitations" className="hp-alert" data-testid="link-invitations"><BellRing size={17} /><span><b>{pendingInvites} dəvət</b> cavab gözləyir</span><ArrowUpRight size={15} /></Link>}
    </div>}
    {homes.isLoading ? <Skeleton rows={3} /> : !list.length ? <div className="hp-intro surface">
      <div>
        <div className="eyebrow"><ShieldCheck size={13} className="sm-ii" /> Ev üçün tibbi kart kimi</div>
        <h2 className="font-display">Evinizin rəqəmsal pasportunu yaradın</h2>
        <p>Kim, nə vaxt, harada, hansı işi görüb; divarın içində hansı xətlər keçir; kombi nə vaxt quraşdırılıb və zəmanəti nə vaxt bitir — hamısı foto sübutla qeyd olunur. Ustalar öz hesablarından iştiraklarını təsdiqləyir, siz isə işi qəbul edirsiniz.</p>
        <button type="button" className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} />İlk evi əlavə et</button>
      </div>
      <ul className="hp-intro-list">
        <li><House size={18} /><span><b>Ev profili və otaqlar</b>Ünvan, sahə, tikinti ili, otaqlar.</span></li>
        <li><HardHat size={18} /><span><b>Ustalar və briqadalar</b>Hər işdə kimin hansı rolda iştirak etdiyi.</span></li>
        <li><QrCode size={18} /><span><b>QR və paylaşım</b>Alıcıya və ya ustaya yalnız seçdiyinizi göstərin.</span></li>
        <li><Calculator size={18} /><span><b>AI Smeta ilə əlaqə</b>İş qeydini smeta layihəsinə bağlayın.</span></li>
      </ul>
    </div> : <div className="hp-home-grid">{list.map(h => <Link key={h.id} href={`/homes/${h.id}`} className="hp-home-card" data-testid={`card-home-${h.id}`}>
      <div className="hp-home-cover">{h.coverUrl ? <img src={h.coverUrl} alt="" loading="lazy" /> : <Home size={30} />}<Pill small tone={h.myRole === 'owner' ? 'ok' : 'info'}>{HOME_ROLE[h.myRole] ?? h.myRole}</Pill></div>
      <div className="hp-home-body">
        <h3>{h.name}</h3>
        <small><MapPin size={12} className="sm-ii" /> {[PROPERTY[h.propertyType], h.district, h.city].filter(Boolean).join(' · ')}</small>
        <div className="hp-home-meta"><span><b>{h.works}</b> iş</span><span><b>{h.performers}</b> icraçı</span><span>{STAGE[h.stage]}</span>{h.lastWorkAt && <span>son iş: {day(h.lastWorkAt)}</span>}</div>
        {h.pendingApproval > 0 && <span className="hp-pending"><ClipboardCheck size={13} />{h.pendingApproval} iş təsdiq gözləyir</span>}
      </div>
    </Link>)}</div>}
    <HomeFormModal open={creating} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); setLocation(`/homes/${id}`); }} />
    <HomeToaster />
  </>;
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
  return <Modal open={open} onClose={onClose} eyebrow="Ev profili" title={home ? 'Ev məlumatlarını dəyiş' : 'Yeni ev'} wide
    footer={<button type="submit" form="home-form" className="button button-primary" disabled={busy || form.name.trim().length < 2} data-testid="button-save-home">{busy && <LoaderCircle className="spin" size={15} />}Yadda saxla</button>}>
    <form id="home-form" className="rl-form" onSubmit={submit}>
      <Field label="Evin adı" name="home-name" required value={form.name} onChange={set('name')} placeholder="məs. Yasamaldakı mənzil" />
      <Seg label="Əmlak növü" value={form.propertyType} options={opts(PROPERTY)} onChange={set('propertyType')} />
      <div className="field-grid three">
        <Field label="Şəhər" name="home-city" value={form.city} onChange={set('city')} />
        <Field label="Rayon" name="home-district" value={form.district} onChange={set('district')} placeholder="məs. Yasamal" />
        <Select label="Mərhələ" name="home-stage" value={form.stage} onChange={set('stage')} options={opts(STAGE)} />
      </div>
      <Field label="Ünvan (yalnız siz görürsünüz, QR-da göstərmək sizin seçiminizdir)" name="home-address" value={form.address} onChange={set('address')} />
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
