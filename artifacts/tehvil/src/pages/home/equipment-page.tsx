import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Boxes, Pencil, Plus, ShieldAlert, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import { useCreateEquipment, useDeleteEquipment, useListEquipment, useListWorks, useUpdateEquipment, type Equipment, type EquipmentInput } from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { Empty, HomeToaster, MediaUpload, Modal, Pill, Select, Skeleton, WorkerAvatar, opts, toast } from '@/components/home/ui';
import { EQUIP_CATEGORY, WORK_STATUS, day, refreshHomeData, today } from '@/lib/home/labels';
import { HomeMissing, useHome } from './home-pages';
import { QuickWorkModal } from './quick-work';

function warranty(e: Equipment) {
  if (!e.warrantyUntil) return null;
  const left = (new Date(e.warrantyUntil).getTime() - new Date(today()).getTime()) / 86_400_000;
  if (left < 0) return <Pill small tone="neutral" icon={<ShieldAlert size={11} />}>Zəmanət bitib ({day(e.warrantyUntil)})</Pill>;
  if (left < 60) return <Pill small tone="warn" icon={<ShieldAlert size={11} />}>Zəmanət {Math.ceil(left)} gün sonra bitir</Pill>;
  return <Pill small tone="ok" icon={<ShieldCheck size={11} />}>Zəmanət {day(e.warrantyUntil)}-dək</Pill>;
}

export function HomeEquipmentPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const q = useListEquipment(homeId);
  const remove = useDeleteEquipment();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [service, setService] = useState<Equipment | null>(null);
  if (home.isLoading || q.isLoading) return <Skeleton rows={3} />;
  if (!home.data) return <HomeMissing />;
  const role = home.data.home.myRole;
  const canAdd = role === 'owner' || role === 'technician' || role === 'performer';
  const list = q.data ?? [];
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Avadanlıqlar" description="Kombi, kondisioner, su filtri, elektrik paneli… Kim quraşdırıb, zəmanət nə vaxt bitir, nə vaxt baxımdan keçib."
      action={canAdd ? <button type="button" className="button button-primary" onClick={() => setEditing('new')} data-testid="button-add-equipment"><Plus size={16} />Avadanlıq əlavə et</button> : undefined} />
    {!list.length ? <Empty icon={<Boxes size={28} />} title="Hələ avadanlıq əlavə etməmisiniz" text="Kombi, kondisioner, su filtri — əlavə edin ki, kim quraşdırıb və zəmanət nə vaxt bitir, həmişə əlinizin altında olsun." />
      : <div className="hp-equip-grid">{list.map(e => <article key={e.id} className="surface hp-equip" data-testid={`card-equipment-${e.id}`}>
        <div className="hp-equip-photo">{e.photoUrl ? <img src={e.photoUrl} alt="" loading="lazy" /> : <Boxes size={26} />}</div>
        <div className="hp-equip-body">
          <div className="eyebrow">{EQUIP_CATEGORY[e.category] ?? e.category}{e.roomName ? ` · ${e.roomName}` : ''}</div>
          <h3>{e.name}</h3>
          <small>{[e.brand, e.model, e.serialNumber ? `S/N ${e.serialNumber}` : ''].filter(Boolean).join(' · ') || 'Marka və model qeyd edilməyib'}</small>
          <div className="hp-badges">{e.installedAt && <Pill small tone="info">Quraşdırılıb: {day(e.installedAt)}</Pill>}{warranty(e)}</div>
          {e.installWorkTitle && <p className="hp-kvline"><b>Quraşdırma:</b> <Link href={`/works/${e.installWorkId}`}>{e.installWorkTitle}</Link></p>}
          {e.installers.length > 0 && <div className="hp-installers">{e.installers.map(w => <Link key={w.id} href={w.registered ? `/workers/${w.id}` : '#'} className="hp-installer"><WorkerAvatar w={w} size={22} />{w.displayName}</Link>)}</div>}
          {e.notes && <p className="hp-text">{e.notes}</p>}
          <div className="hp-services"><b><Wrench size={13} className="sm-ii" /> Baxım və təmir</b>{e.services.length ? <ul>{e.services.map(s => <li key={s.id}><Link href={`/works/${s.id}`}>{s.title}</Link><small>{day(s.startDate)} · {WORK_STATUS[s.status]}</small></li>)}</ul> : <small className="rl-hint">Qeyd yoxdur.</small>}</div>
          <div className="hp-prow-actions">
            {home.data!.home.permissions.addWorks && <button type="button" className="sm-link-btn" onClick={() => setService(e)}><Plus size={13} />Baxım və ya təmir qeyd et</button>}
            {(role === 'owner' || role === 'technician' || role === 'performer') && <button type="button" className="sm-link-btn" onClick={() => setEditing(e)}><Pencil size={13} />Dəyiş</button>}
            {role === 'owner' && <button type="button" className="sm-link-btn danger" onClick={() => remove.mutate({ equipmentId: e.id }, { onSuccess: () => { void refreshHomeData(qc); toast('Avadanlıq silindi'); } })}><Trash2 size={13} />Sil</button>}
          </div>
        </div>
      </article>)}</div>}
    {editing && <EquipmentModal homeId={homeId} item={editing === 'new' ? undefined : editing} performer={role === 'performer'} onClose={() => setEditing(null)} />}
    {service && <QuickWorkModal homeId={homeId} equipmentId={service.id} roomId={service.roomId ?? undefined} category={service.category === 'air_conditioner' ? 'hvac' : service.category === 'boiler' || service.category === 'water_heater' ? 'heating' : 'other'} onClose={() => setService(null)} onSaved={id => setLocation(`/works/${id}`)} key={service.id} />}
    <HomeToaster />
  </>;
}

function EquipmentModal({ homeId, item, performer, onClose }: { homeId: string; item?: Equipment; performer: boolean; onClose: () => void }) {
  const home = useHome(homeId);
  const works = useListWorks(homeId);
  const create = useCreateEquipment();
  const update = useUpdateEquipment();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: item?.name ?? '', category: item?.category ?? 'boiler', roomId: item?.roomId ?? '', installWorkId: item?.installWorkId ?? '', brand: item?.brand ?? '', model: item?.model ?? '', serialNumber: item?.serialNumber ?? '', installedAt: item?.installedAt ?? '', warrantyUntil: item?.warrantyUntil ?? '', notes: item?.notes ?? '', photoMediaId: item?.photoMediaId ?? '' });
  const [photoUrl, setPhotoUrl] = useState(item?.photoUrl ?? '');
  const set = (k: keyof typeof form) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const save = () => {
    const data: EquipmentInput = { ...form, name: form.name.trim(), category: form.category as EquipmentInput['category'], roomId: form.roomId || null, installWorkId: form.installWorkId || null, installedAt: form.installedAt || null, warrantyUntil: form.warrantyUntil || null, photoMediaId: form.photoMediaId || null };
    const done = { onSuccess: () => { void refreshHomeData(qc); toast(item ? 'Avadanlıq yeniləndi' : 'Avadanlıq əlavə olundu'); onClose(); } };
    if (item) update.mutate({ equipmentId: item.id, data }, done); else create.mutate({ homeId, data }, done);
  };
  return <Modal open onClose={onClose} eyebrow="Avadanlıqlar" title={item ? 'Avadanlığı dəyiş' : 'Yeni avadanlıq'} wide
    footer={<button type="button" className="button button-primary" onClick={save} disabled={!form.name.trim() || create.isPending || update.isPending || (performer && !form.installWorkId)} data-testid="button-save-equipment">Yadda saxla</button>}>
    <div className="rl-form">
      <div className="field-grid"><Field label="Ad" name="eq-name" required value={form.name} onChange={set('name')} placeholder="məs. Kombi" /><Select label="Kateqoriya" name="eq-category" value={form.category} onChange={set('category')} options={opts(EQUIP_CATEGORY)} /></div>
      <div className="field-grid three"><Field label="Marka" name="eq-brand" value={form.brand} onChange={set('brand')} /><Field label="Model" name="eq-model" value={form.model} onChange={set('model')} /><Field label="Seriya nömrəsi" name="eq-serial" value={form.serialNumber} onChange={set('serialNumber')} /></div>
      <div className="field-grid"><Select label="Otaq" name="eq-room" value={form.roomId} onChange={set('roomId')} empty="Seçilməyib" options={(home.data?.rooms ?? []).map(r => [r.id, r.name])} />
        <Select label={performer ? 'Quraşdırma işi (mütləq)' : 'Quraşdırma işi'} name="eq-work" value={form.installWorkId} onChange={set('installWorkId')} empty="Seçilməyib" options={(works.data ?? []).map(w => [w.id, w.title])} /></div>
      <div className="field-grid"><Field label="Quraşdırılma tarixi" name="eq-installed" type="date" value={form.installedAt} onChange={set('installedAt')} /><Field label="Zəmanət bitir" name="eq-warranty" type="date" value={form.warrantyUntil} onChange={set('warrantyUntil')} /></div>
      <Field label="Qeyd" name="eq-notes"><textarea rows={2} maxLength={3000} value={form.notes} onChange={e => set('notes')(e.target.value)} /></Field>
      <div className="field"><span>Foto (etiket, seriya nömrəsi)</span>{photoUrl && <img src={photoUrl} alt="" className="hp-eq-photo-preview" />}
        <MediaUpload target={performer ? { workId: form.installWorkId || undefined } : { homeId }} phases={false} videos={false} label={photoUrl ? 'Fotonu dəyiş' : 'Foto əlavə et'} onDone={m => { if (m[0]) { set('photoMediaId')(m[0].id); setPhotoUrl(m[0].url); } }} /></div>
      <small className="rl-hint">Quraşdırma işini seçsəniz, quraşdıran usta avtomatik göstəriləcək.</small>
    </div>
  </Modal>;
}
