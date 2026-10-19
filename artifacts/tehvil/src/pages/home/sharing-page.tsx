import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, History, Link2, LoaderCircle, Lock, Plus, QrCode as QrIcon, ShieldOff } from 'lucide-react';
import { Link } from 'wouter';
import {
  useCreateHomeShare, useGetHomeSharing, useListEquipment, useListWorks, useRevokeHomeShare, useUpdateHomeSharing, type HomeShare, type HomeShareInputLevel, type HomeSharingInput,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CopyButton, HomeToaster, Modal, Pill, QrCode, Seg, Skeleton, qrDataUrl, toast } from '@/components/home/ui';
import { PUBLIC_LEVEL, SHARE_LEVEL, dayTime, refreshHomeData } from '@/lib/home/labels';
import { HomeMissing, MembersSection, useHome } from './home-pages';

export function HomeSharingPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const q = useGetHomeSharing(homeId, { query: { enabled: !!home.data?.home.permissions.manageSharing, queryKey: [`/api/homes/${homeId}/sharing`] } });
  const save = useUpdateHomeSharing();
  const revoke = useRevokeHomeShare();
  const qc = useQueryClient();
  const [form, setForm] = useState<HomeSharingInput | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState('');
  useEffect(() => { if (q.data && !form) setForm({ publicLevel: q.data.publicLevel as HomeSharingInput['publicLevel'], publicShowAddress: q.data.publicShowAddress, publicShowPhotos: q.data.publicShowPhotos, publicShowEquipment: q.data.publicShowEquipment, showOnWorkerProfiles: q.data.showOnWorkerProfiles }); }, [q.data, form]);
  if (home.isLoading) return <Skeleton rows={3} />;
  if (!home.data) return <HomeMissing />;
  const perms = home.data.home.permissions;
  const intro = <>
    <p className="hp-private"><Lock size={14} />Ev məlumatları susmaya görə məxfidir. Yalnız aşağıda gördüyünüz şəxslər və linklər vasitəsilə görünür.</p>
    <MembersSection homeId={homeId} owner={perms.manageMembers} />
    {perms.viewAudit && <p className="hp-kvline"><Link href={`/homes/${homeId}/audit`} data-testid="link-audit"><History size={14} className="sm-ii" /> Dəyişikliklər tarixçəsi — kim nəyi nə vaxt əlavə edib</Link></p>}
  </>;
  if (!perms.manageSharing) return <>
    <PageHeading eyebrow={home.data.home.name} title="Paylaşım və giriş" description="Bu evə kimin girişi var və nə edə bilər." />
    {intro}
    <p className="rl-hint">Paylaşım linklərini və QR kodu yalnız ev sahibi idarə edir.</p>
    <HomeToaster />
  </>;
  if (q.isLoading || !q.data || !form) return <Skeleton rows={3} />;
  const s = q.data;
  const qrValue = `${s.publicUrl}?src=qr`;
  const download = async () => { const url = await qrDataUrl(qrValue, 900); const a = document.createElement('a'); a.href = url; a.download = `tehvil-ev-${home.data!.home.publicId}.png`; a.click(); };
  const dirty = JSON.stringify(form) !== JSON.stringify({ publicLevel: s.publicLevel, publicShowAddress: s.publicShowAddress, publicShowPhotos: s.publicShowPhotos, publicShowEquipment: s.publicShowEquipment, showOnWorkerProfiles: s.showOnWorkerProfiles });
  const toggle = (k: keyof HomeSharingInput, label: string, hint: string) => <label className="rl-check"><input type="checkbox" checked={!!form[k]} onChange={e => setForm({ ...form, [k]: e.target.checked })} disabled={form.publicLevel === 'off' && k !== 'showOnWorkerProfiles'} /><span><b>{label}</b><br /><small>{hint}</small></span></label>;
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Paylaşım və giriş" description="Evin məlumatlarını paylaş — alıcıya, ustaya və ya mütəxəssisə yalnız seçdiyiniz məlumatları göstərin. Linki istədiyiniz vaxt bağlayın."
      action={<button type="button" className="button button-primary" onClick={() => { setCreated(''); setCreating(true); }} data-testid="button-create-share"><Link2 size={16} />Paylaşım linki yarat</button>} />
    {intro}
    <section className="surface hp-section">
      <h2><Link2 size={15} className="sm-ii" /> Paylaşdığım linklər</h2>
      {!s.shares.length ? <p className="rl-hint">Hələ link yaratmamısınız. Məsələn: alıcıya yalnız hamam və mətbəxdə görülən işləri, santexnikə isə su və kanalizasiya borularının yerini göstərin.</p>
        : <div className="hp-shares">{s.shares.map(sh => <div key={sh.id} className={`hp-share ${sh.active ? '' : 'off'}`}>
          <div><b>{sh.label || SHARE_LEVEL[sh.level]}</b><small>{shareSummary(sh)}</small>
            <small>{sh.openCount ? `${sh.openCount} dəfə baxılıb` : 'Hələ baxılmayıb'}{sh.lastOpenedAt ? ` · son baxış: ${dayTime(sh.lastOpenedAt)}` : ''}{sh.active ? (sh.expiresAt ? ` · ${dayTime(sh.expiresAt)}-dək` : ' · müddətsiz') : ''}</small></div>
          {sh.active ? <button type="button" className="button button-quiet sm-btn-sm" onClick={() => revoke.mutate({ homeId, shareId: sh.id }, { onSuccess: () => { void refreshHomeData(qc); toast('Link bağlandı — artıq açılmır'); } })} data-testid={`button-revoke-${sh.id}`}><ShieldOff size={14} />Linki bağla</button> : <Pill small tone="neutral">{sh.revokedAt ? 'Bağlanıb' : 'Müddəti bitib'}</Pill>}
        </div>)}</div>}
    </section>
    <div className="hp-two">
      <section className="surface hp-section hp-qr-card">
        <h2><QrIcon size={15} className="sm-ii" /> Evin QR kodu</h2>
        <QrCode value={qrValue} size={190} label={home.data.home.name} />
        <div className="hp-actions"><button type="button" className="button button-secondary" onClick={() => void download()}><Download size={15} />QR kodu yüklə</button><a className="button button-quiet" href={s.publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Necə görünür?</a></div>
        <p className="rl-hint">Bu QR kodu məsələn, elektrik paneli və ya kombinin yanına yapışdıra bilərsiniz. Onu skan edən hər kəs yalnız “QR kodla kim baxsa, nə görsün?” bölməsində seçdiyinizi görür — ona görə şəxsi məlumatı burada göstərməyin.</p>
      </section>
      <section className="surface hp-section">
        <h2>QR kodla kim baxsa, nə görsün?</h2>
        <Seg label="Göstər" value={form.publicLevel} options={Object.entries(PUBLIC_LEVEL) as [HomeSharingInput['publicLevel'], string][]} onChange={v => setForm({ ...form, publicLevel: v })} />
        {toggle('publicShowAddress', 'Ünvan', 'Rayon və şəhər həmişə görünür, dəqiq ünvan yalnız seçsəniz.')}
        {toggle('publicShowPhotos', 'Görülmüş işlərin fotoları', 'Divar bağlanmazdan əvvəl çəkilmiş fotolar QR-da heç vaxt göstərilmir.')}
        {toggle('publicShowEquipment', 'Avadanlıqlar', 'Seriya nömrəsi göstərilmir.')}
        {toggle('showOnWorkerProfiles', 'Ustaların profilində bu evdə gördükləri işlər görünsün', 'Ünvan göstərilmir. Yalnız görülmüş və açıq işlər.')}
        <p className="rl-hint">Naqil və boruların yeri, ustaların telefonları, dəyişikliklər tarixçəsi və şəxsi qeydlər QR kodla heç vaxt görünmür.</p>
        <button type="button" className="button button-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate({ homeId, data: form }, { onSuccess: () => { void refreshHomeData(qc); toast('Yadda saxlanıldı'); } })} data-testid="button-save-sharing">{save.isPending && <LoaderCircle className="spin" size={15} />}Yadda saxla</button>
      </section>
    </div>
    {creating && <ShareModal homeId={homeId} created={created} onCreated={url => { setCreated(url); void refreshHomeData(qc); }} onClose={() => setCreating(false)} />}
    <HomeToaster />
  </>;
}

function shareSummary(sh: HomeShare) {
  if (sh.level === 'technical') return 'Tam məlumatlar';
  const parts = ['Ümumi məlumat'];
  if (sh.scope.roomIds.length) parts.push(`${sh.scope.roomIds.length} otaq`);
  if (sh.scope.workIds.length) parts.push(`${sh.scope.workIds.length} iş`);
  if (sh.scope.equipmentIds.length) parts.push('avadanlıqlar');
  if (sh.scope.includeInfrastructure) parts.push('evdəki sistemlər');
  if (sh.scope.includePhotos) parts.push('fotolar');
  return parts.join(' · ');
}

function ShareModal({ homeId, created, onCreated, onClose }: { homeId: string; created: string; onCreated: (url: string) => void; onClose: () => void }) {
  const home = useHome(homeId);
  const works = useListWorks(homeId);
  const equipment = useListEquipment(homeId);
  const create = useCreateHomeShare();
  const [label, setLabel] = useState('');
  const [days, setDays] = useState('30');
  const [pick, setPick] = useState({ rooms: false, works: false, equipment: false, systems: false, photos: true, full: false });
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [workIds, setWorkIds] = useState<string[]>([]);
  const flip = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  if (created) return <Modal open onClose={onClose} eyebrow="Məlumatları paylaş" title="Link hazırdır">
    <div className="hp-share-done">
      <QrCode value={created} size={170} label="Paylaşım linkinin QR kodu" />
      <div className="hp-linkbox"><small>Linki və ya QR kodu yalnız göstərmək istədiyiniz şəxsə göndərin. Ehtiyac qalmayanda “Linki bağla” düyməsi ilə dərhal bağlayın.</small><code>{created}</code>
        <div className="hp-actions"><CopyButton text={created} /><a className="button button-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${home.data?.home.name ?? 'Evim'} haqqında məlumat: ${created}`)}`}>WhatsApp ilə göndər</a></div></div>
    </div>
  </Modal>;
  const level: HomeShareInputLevel = pick.full ? 'technical' : 'selected';
  const check = (k: keyof typeof pick, title: string, hint: string, testId: string) => <label className={`hp-sharecheck ${pick[k] ? 'on' : ''}`}>
    <input type="checkbox" checked={pick[k]} disabled={pick.full && k !== 'full'} data-testid={testId} onChange={e => setPick({ ...pick, [k]: e.target.checked })} /><span><b>{title}</b><small>{hint}</small></span>
  </label>;
  const submit = () => create.mutate({ homeId, data: { label: label.trim(), level, expiresInDays: days ? Number(days) : null, scope: {
    roomIds: pick.rooms ? roomIds : [], workIds: pick.works ? workIds : [], equipmentIds: pick.equipment ? (equipment.data ?? []).map(e => e.id) : [],
    includePhotos: pick.photos, includeInfrastructure: pick.systems,
  } } }, { onSuccess: r => onCreated(r.url) });
  return <Modal open onClose={onClose} eyebrow="Məlumatları paylaş" title="Nəyi paylaşırsınız?" wide
    footer={<button type="button" className="button button-primary hp-big" disabled={create.isPending} data-testid="button-save-share" onClick={submit}>Link yarat</button>}>
    <div className="rl-form">
      <label className="hp-sharecheck on"><input type="checkbox" checked disabled /><span><b>Evin ümumi məlumatları</b><small>Ad, növ, sahə, ünvan.</small></span></label>
      {check('rooms', 'Seçilmiş otaqlar', 'Otaqda görülən bütün işlər də görünür.', 'share-rooms')}
      {pick.rooms && !pick.full && <div className="hp-chipset">{(home.data?.rooms ?? []).map(r => <button key={r.id} type="button" className={roomIds.includes(r.id) ? 'on' : ''} onClick={() => flip(roomIds, setRoomIds, r.id)}>{r.name}</button>)}</div>}
      {check('works', 'Seçilmiş təmir işləri', 'Yalnız seçdiyiniz işlər.', 'share-works')}
      {pick.works && !pick.full && <div className="hp-chipset">{(works.data ?? []).map(w => <button key={w.id} type="button" className={workIds.includes(w.id) ? 'on' : ''} onClick={() => flip(workIds, setWorkIds, w.id)}>{w.title}</button>)}</div>}
      {check('equipment', 'Avadanlıqlar', 'Kombi, kondisioner və s. — marka, model, zəmanət.', 'share-equipment')}
      {check('systems', 'Evin texniki sistemləri', 'Naqil və boruların harada keçdiyi (seçilmiş otaq və işlər üzrə).', 'share-systems')}
      {check('photos', 'Fotolar', 'Seçilmiş işlərin fotoları.', 'share-photos')}
      {check('full', 'Tam məlumatlar', 'Bütün işlər, materiallar, avadanlıqlar və evdəki sistemlər. Yalnız etibar etdiyiniz usta və ya mütəxəssis üçün.', 'share-full')}
      <div className="field-grid">
        <Field label="Kimin üçün (özünüz üçün qeyd)" name="share-label" value={label} onChange={setLabel} placeholder="məs. Alıcı — Murad" />
        <label className="field"><span>Nə qədər açıq qalsın?</span><select value={days} onChange={e => setDays(e.target.value)}><option value="7">7 gün</option><option value="30">30 gün</option><option value="90">90 gün</option><option value="">Mən bağlayana qədər</option></select></label>
      </div>
    </div>
  </Modal>;
}
