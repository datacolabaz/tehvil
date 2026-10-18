import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Link2, LoaderCircle, Plus, QrCode as QrIcon, ShieldOff } from 'lucide-react';
import {
  useCreateHomeShare, useGetHomeSharing, useListEquipment, useListWorks, useRevokeHomeShare, useUpdateHomeSharing, type HomeShareInputLevel, type HomeSharingInput,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CopyButton, HomeToaster, Modal, Pill, QrCode, Seg, Skeleton, qrDataUrl, toast } from '@/components/home/ui';
import { PUBLIC_LEVEL, SHARE_LEVEL, dayTime, refreshHomeData } from '@/lib/home/labels';
import { HomeMissing, useHome } from './home-pages';

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
  if (!home.data.home.permissions.manageSharing) return <div className="notice manual-notice">QR və paylaşımı yalnız ev sahibi idarə edir.</div>;
  if (q.isLoading || !q.data || !form) return <Skeleton rows={3} />;
  const s = q.data;
  const qrValue = `${s.publicUrl}?src=qr`;
  const download = async () => { const url = await qrDataUrl(qrValue, 900); const a = document.createElement('a'); a.href = url; a.download = `tehvil-ev-${home.data!.home.publicId}.png`; a.click(); };
  const dirty = JSON.stringify(form) !== JSON.stringify({ publicLevel: s.publicLevel, publicShowAddress: s.publicShowAddress, publicShowPhotos: s.publicShowPhotos, publicShowEquipment: s.publicShowEquipment, showOnWorkerProfiles: s.showOnWorkerProfiles });
  const toggle = (k: keyof HomeSharingInput, label: string, hint: string) => <label className="rl-check"><input type="checkbox" checked={!!form[k]} onChange={e => setForm({ ...form, [k]: e.target.checked })} disabled={form.publicLevel === 'off' && k !== 'showOnWorkerProfiles'} /><span><b>{label}</b><br /><small>{hint}</small></span></label>;
  return <>
    <PageHeading eyebrow={home.data.home.name} title="QR və paylaşım" description="QR kod evin daimi identifikatorudur və yalnız sizin icazə verdiyinizi göstərir. Konkret şəxsə daha çox məlumat göstərmək üçün ayrıca, istənilən vaxt ləğv edilə bilən gizli link yaradın." />
    <div className="hp-two">
      <section className="surface hp-section hp-qr-card">
        <QrCode value={qrValue} size={190} label={home.data.home.name} />
        <div className="hp-actions"><button type="button" className="button button-secondary" onClick={() => void download()}><Download size={15} />QR-ı yüklə (PNG)</button><a className="button button-quiet" href={s.publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Səhifəyə bax</a></div>
        <code className="hp-code">{s.publicUrl}</code>
        <p className="rl-hint">Bu link gizli deyil — QR-ı skan edən hər kəs onu aça bilər. Ona görə də yalnız ümumi məlumat göstərin.</p>
      </section>
      <section className="surface hp-section">
        <h2><QrIcon size={15} className="sm-ii" /> QR səhifəsində nə görünür</h2>
        <Seg label="Səviyyə" value={form.publicLevel} options={Object.entries(PUBLIC_LEVEL) as [HomeSharingInput['publicLevel'], string][]} onChange={v => setForm({ ...form, publicLevel: v })} />
        {toggle('publicShowAddress', 'Ünvanı göstər', 'Default bağlıdır. Rayon və şəhər hər zaman görünür.')}
        {toggle('publicShowPhotos', 'Təsdiqlənmiş işlərin fotolarını göstər', '“Gizli xətlər” fotoları heç vaxt QR-da göstərilmir.')}
        {toggle('publicShowEquipment', 'Avadanlıq siyahısını göstər', 'Seriya nömrəsi göstərilmir.')}
        {toggle('showOnWorkerProfiles', 'Ustaların profilində bu evdəki işləri göstər', 'Ünvansız, yalnız siz qəbul etdiyiniz işlər. Ustaların portfolio-su üçün.')}
        <p className="rl-hint">Kommunikasiya xəritəsi, audit jurnalı, ustaların telefonları və şəxsi qeydlər QR səhifəsində heç vaxt göstərilmir.</p>
        <button type="button" className="button button-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate({ homeId, data: form }, { onSuccess: () => { void refreshHomeData(qc); toast('Ayarlar yadda saxlanıldı'); } })} data-testid="button-save-sharing">{save.isPending && <LoaderCircle className="spin" size={15} />}Yadda saxla</button>
      </section>
    </div>
    <section className="surface hp-section">
      <div className="section-head"><h2><Link2 size={15} className="sm-ii" /> Gizli paylaşım linkləri</h2><button type="button" className="button button-secondary sm-btn-sm" onClick={() => { setCreated(''); setCreating(true); }} data-testid="button-create-share"><Plus size={14} />Link yarat</button></div>
      {!s.shares.length ? <p className="rl-hint">Məsələn: alıcıya yalnız hamam və mətbəx işlərini, santexnikə isə texniki məlumatı və kommunikasiya xəritəsini göstərin.</p>
        : <div className="hp-shares">{s.shares.map(sh => <div key={sh.id} className={`hp-share ${sh.active ? '' : 'off'}`}>
          <div><b>{sh.label || SHARE_LEVEL[sh.level]}</b><small>{SHARE_LEVEL[sh.level]}{sh.level === 'selected' ? ` · ${sh.scope.roomIds.length} otaq, ${sh.scope.workIds.length} iş, ${sh.scope.equipmentIds.length} avadanlıq` : ''}{sh.scope.includePhotos ? ' · fotolarla' : ''}{sh.scope.includeInfrastructure ? ' · xəritə ilə' : ''}</small>
            <small>{sh.openCount} dəfə açılıb{sh.lastOpenedAt ? ` · son: ${dayTime(sh.lastOpenedAt)}` : ''}{sh.expiresAt ? ` · ${dayTime(sh.expiresAt)}-dək` : ' · müddətsiz'}</small></div>
          {sh.active ? <button type="button" className="button button-quiet sm-btn-sm" onClick={() => revoke.mutate({ homeId, shareId: sh.id }, { onSuccess: () => { void refreshHomeData(qc); toast('Link ləğv edildi'); } })} data-testid={`button-revoke-${sh.id}`}><ShieldOff size={14} />Ləğv et</button> : <Pill small tone="neutral">{sh.revokedAt ? 'Ləğv edilib' : 'Müddəti bitib'}</Pill>}
        </div>)}</div>}
    </section>
    {creating && <ShareModal homeId={homeId} created={created} onCreated={url => { setCreated(url); void refreshHomeData(qc); }} onClose={() => setCreating(false)} />}
    <HomeToaster />
  </>;
}

function ShareModal({ homeId, created, onCreated, onClose }: { homeId: string; created: string; onCreated: (url: string) => void; onClose: () => void }) {
  const home = useHome(homeId);
  const works = useListWorks(homeId);
  const equipment = useListEquipment(homeId);
  const create = useCreateHomeShare();
  const [label, setLabel] = useState('');
  const [level, setLevel] = useState<HomeShareInputLevel>('selected');
  const [days, setDays] = useState('30');
  const [scope, setScope] = useState({ roomIds: [] as string[], workIds: [] as string[], equipmentIds: [] as string[], includePhotos: true, includeInfrastructure: false });
  const flip = (k: 'roomIds' | 'workIds' | 'equipmentIds', id: string) => setScope(s => ({ ...s, [k]: s[k].includes(id) ? s[k].filter(x => x !== id) : [...s[k], id] }));
  if (created) return <Modal open onClose={onClose} eyebrow="Paylaşım" title="Link hazırdır">
    <div className="hp-linkbox"><small>Bu linki yalnız göstərmək istədiyiniz şəxsə göndərin. Ehtiyac olmayanda “Ləğv et” düyməsi ilə dərhal bağlayın.</small><code>{created}</code><CopyButton text={created} /></div>
  </Modal>;
  const empty = level === 'selected' && !scope.roomIds.length && !scope.workIds.length && !scope.equipmentIds.length;
  return <Modal open onClose={onClose} eyebrow="Paylaşım" title="Gizli link yarat" wide
    footer={<button type="button" className="button button-primary" disabled={empty || create.isPending} data-testid="button-save-share" onClick={() => create.mutate({ homeId, data: { label: label.trim(), level, scope, expiresInDays: days ? Number(days) : null } }, { onSuccess: r => onCreated(r.url) })}>Link yarat</button>}>
    <div className="rl-form">
      <div className="field-grid"><Field label="Kimin üçün (qeyd)" name="share-label" value={label} onChange={setLabel} placeholder="məs. Alıcı — Murad" />
        <label className="field"><span>Müddət</span><select value={days} onChange={e => setDays(e.target.value)}><option value="7">7 gün</option><option value="30">30 gün</option><option value="90">90 gün</option><option value="">Müddətsiz (ləğv edənə qədər)</option></select></label></div>
      <Seg label="Səviyyə" value={level} options={Object.entries(SHARE_LEVEL) as [HomeShareInputLevel, string][]} onChange={setLevel} />
      {level === 'technical' ? <p className="rl-warn">Texniki link bütün işləri, materialları, avadanlıqları və kommunikasiya xəritəsini göstərir. Yalnız etibar etdiyiniz usta və ya mütəxəssislə paylaşın.</p> : <>
        <div className="field"><span>Otaqlar (otaqdakı bütün işlər daxil olur)</span><div className="rl-chips">{(home.data?.rooms ?? []).map(r => <button key={r.id} type="button" className={scope.roomIds.includes(r.id) ? 'on' : ''} onClick={() => flip('roomIds', r.id)}>{r.name}</button>)}</div></div>
        <div className="field"><span>Ayrı-ayrı işlər</span><div className="rl-chips">{(works.data ?? []).map(w => <button key={w.id} type="button" className={scope.workIds.includes(w.id) ? 'on' : ''} onClick={() => flip('workIds', w.id)}>{w.title}</button>)}</div></div>
        <div className="field"><span>Avadanlıqlar</span><div className="rl-chips">{(equipment.data ?? []).map(e => <button key={e.id} type="button" className={scope.equipmentIds.includes(e.id) ? 'on' : ''} onClick={() => flip('equipmentIds', e.id)}>{e.name}</button>)}</div></div>
        <label className="rl-check"><input type="checkbox" checked={scope.includeInfrastructure} onChange={e => setScope({ ...scope, includeInfrastructure: e.target.checked })} /><span>Seçilmiş otaq / işlərin kommunikasiya xətlərini göstər</span></label>
      </>}
      <label className="rl-check"><input type="checkbox" checked={scope.includePhotos} onChange={e => setScope({ ...scope, includePhotos: e.target.checked })} /><span>Fotoları göstər</span></label>
    </div>
  </Modal>;
}
