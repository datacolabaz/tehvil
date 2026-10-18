import { useRef, useState, type MouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Cable, Eraser, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import {
  useCreateInfrastructure, useDeleteInfrastructure, useListHomeMedia, useListInfrastructure, useListWorks, useUpdateInfrastructure, useVerifyInfrastructure,
  type HomeMedia, type InfrastructureInput, type InfrastructureItem, type MarkerPoint,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { Empty, HomeToaster, MediaUpload, Modal, Pill, Select, Skeleton, opts, toast } from '@/components/home/ui';
import { INFRA_COLOR, INFRA_SOURCE, INFRA_TYPE, PHASE, dayTime, refreshHomeData } from '@/lib/home/labels';
import { HomeMissing, useHome } from './home-pages';

/**
 * Hidden communications map: lines are drawn over real photos (taken before walls were closed)
 * in percent coordinates. Every line shows who recorded it and whether a specialist verified it.
 */
export function HomeMapPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const items = useListInfrastructure(homeId);
  const media = useListHomeMedia(homeId);
  const qc = useQueryClient();
  const verify = useVerifyInfrastructure();
  const remove = useDeleteInfrastructure();
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [type, setType] = useState(() => new URLSearchParams(window.location.search).get('type') ?? '');
  const [editing, setEditing] = useState<InfrastructureItem | 'new' | null>(null);
  if (home.isLoading || items.isLoading) return <Skeleton rows={3} />;
  if (!home.data) return <HomeMissing />;
  const role = home.data.home.myRole;
  const canAdd = role === 'owner' || role === 'technician' || role === 'performer';
  const photos = (media.data ?? []).filter(m => m.contentType.startsWith('image/')).sort((a, b) => Number(b.phase === 'hidden') - Number(a.phase === 'hidden'));
  const list = (items.data ?? []).filter(i => !type || i.type === type);
  const current = photos.find(p => p.id === photoId) ?? photos.find(p => list.some(i => i.mediaId === p.id)) ?? null;
  const onPhoto = list.filter(i => current && i.mediaId === current.id);
  const refresh = () => void refreshHomeData(qc);
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Evdəki sistemlər" description="Elektrik naqilləri, su və kanalizasiya boruları, istilik xətləri divarın içindən harada keçir — fotonun üzərində göstərin. Gələcəkdə təmir zamanı yerini tapmaq asan olacaq."
      action={canAdd ? <button type="button" className="button button-primary" onClick={() => setEditing('new')} data-testid="button-add-line"><Plus size={16} />Naqil və ya boru qeyd et</button> : undefined} />
    <div className="hp-legend">{Object.entries(INFRA_TYPE).map(([k, l]) => <button key={k} type="button" className={type === k ? 'on' : ''} onClick={() => setType(type === k ? '' : k)}><i style={{ background: INFRA_COLOR[k] }} />{l}<small>{(items.data ?? []).filter(i => i.type === k).length}</small></button>)}</div>
    {!(items.data ?? []).length && !photos.length ? <Empty icon={<Cable size={28} />} title="Hələ heç nə qeyd olunmayıb" text="Divarlar bağlanmazdan əvvəl naqil və boruların fotosunu çəkin, sonra fotonun üzərində barmağınızla yerini göstərin. Gələcəkdə təmir zamanı onların yerini tapmaq asan olacaq." action={canAdd ? <button type="button" className="button button-primary" onClick={() => setEditing('new')}><Plus size={16} />İlk qeydi et</button> : undefined} />
      : <div className="hp-map-layout">
        <section className="surface hp-section">
          {current ? <PhotoMap photo={current} items={onPhoto} /> : <p className="rl-hint">Fotosu olan xətt yoxdur. Xətt qeyd edərkən foto seçin.</p>}
          {photos.length > 0 && <div className="hp-thumbs" aria-label="Fotolar">{photos.map(p => <button key={p.id} type="button" className={current?.id === p.id ? 'on' : ''} onClick={() => setPhotoId(p.id)} title={PHASE[p.phase]}>
            <img src={p.url} alt="" loading="lazy" />{(items.data ?? []).some(i => i.mediaId === p.id) && <span className="hp-thumb-dot" />}</button>)}</div>}
        </section>
        <section className="hp-lines">{list.map(i => <article key={i.id} className={`surface hp-line ${current && i.mediaId === current.id ? 'on-photo' : ''}`}>
          <header><i style={{ background: INFRA_COLOR[i.type] }} /><b>{INFRA_TYPE[i.type]}</b>{i.verified ? <Pill small tone="ok" icon={<BadgeCheck size={11} />}>Mütəxəssis təsdiqləyib</Pill> : <Pill small tone="neutral">Mütəxəssis yoxlamayıb</Pill>}</header>
          {i.label && <p><strong>{i.label}</strong></p>}
          {i.notes && <p className="hp-text">{i.notes}</p>}
          <small>{[INFRA_SOURCE[i.source], i.roomName, i.workTitle ? `İş: ${i.workTitle}` : '', dayTime(i.createdAt)].filter(Boolean).join(' · ')}</small>
          <div className="hp-prow-actions">
            {i.mediaId && <button type="button" className="sm-link-btn" onClick={() => setPhotoId(i.mediaId!)}>Fotoda göstər</button>}
            {role === 'technician' && !i.verified && <button type="button" className="sm-link-btn" data-testid={`button-verify-${i.id}`} onClick={() => verify.mutate({ itemId: i.id }, { onSuccess: () => { refresh(); toast('Xətt təsdiqləndi'); } })}><BadgeCheck size={13} />Təsdiqlə</button>}
            {(i.createdByMe || role === 'owner') && <><button type="button" className="sm-link-btn" onClick={() => setEditing(i)}><Pencil size={13} />Dəyiş</button>
              <button type="button" className="sm-link-btn danger" onClick={() => remove.mutate({ itemId: i.id }, { onSuccess: () => { refresh(); toast('Xətt silindi'); } })}><Trash2 size={13} />Sil</button></>}
          </div>
        </article>)}</section>
      </div>}
    <p className="rl-hint hp-mt">Bu qeydləri ev sahibi, usta və ya mütəxəssis edib. “Mütəxəssis təsdiqləyib” yalnız sizin əlavə etdiyiniz mütəxəssis yoxladıqdan sonra görünür. Divarı deşməzdən əvvəl yerində yoxlayın.</p>
    {editing && <LineModal homeId={homeId} item={editing === 'new' ? undefined : editing} photos={photos} role={role} defaultPhoto={current?.id} defaultType={type || undefined} onClose={() => setEditing(null)} onSaved={id => { setEditing(null); refresh(); if (id) setPhotoId(id); }} />}
    <HomeToaster />
  </>;
}

function Polyline({ points, color, width = 0.9 }: { points: MarkerPoint[]; color: string; width?: number }) {
  if (!points.length) return null;
  return <g>
    {points.length > 1 && <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#fff" strokeWidth={width + 0.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.85} />}
    {points.length > 1 && <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.1} fill={color} stroke="#fff" strokeWidth={0.4} />)}
  </g>;
}

function PhotoMap({ photo, items, draft, onTap }: { photo: HomeMedia; items: InfrastructureItem[]; draft?: { points: MarkerPoint[]; color: string }; onTap?: (p: MarkerPoint) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const tap = (e: MouseEvent<SVGSVGElement>) => {
    if (!onTap || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onTap({ x: Math.round(((e.clientX - r.left) / r.width) * 10000) / 100, y: Math.round(((e.clientY - r.top) / r.height) * 10000) / 100 });
  };
  return <div className={`hp-photomap ${onTap ? 'drawing' : ''}`}>
    <img src={photo.url} alt={photo.caption || 'Foto'} />
    <svg ref={ref} viewBox="0 0 100 100" preserveAspectRatio="none" onClick={tap} role={onTap ? 'application' : 'img'} aria-label={onTap ? 'Xəttin keçdiyi yerə toxunun' : 'Xətlər'}>
      {items.map(i => <Polyline key={i.id} points={i.points} color={INFRA_COLOR[i.type]} />)}
      {draft && <Polyline points={draft.points} color={draft.color} width={1.3} />}
    </svg>
  </div>;
}

function LineModal({ homeId, item, photos, role, defaultPhoto, defaultType, onClose, onSaved }: { homeId: string; item?: InfrastructureItem; photos: HomeMedia[]; role: string; defaultPhoto?: string; defaultType?: string; onClose: () => void; onSaved: (photoId: string | null) => void }) {
  const home = useHome(homeId);
  const works = useListWorks(homeId);
  const create = useCreateInfrastructure();
  const update = useUpdateInfrastructure();
  const [form, setForm] = useState({ type: item?.type ?? defaultType ?? 'electric', label: item?.label ?? '', notes: item?.notes ?? '', roomId: item?.roomId ?? '', workId: item?.workId ?? '', mediaId: item?.mediaId ?? defaultPhoto ?? '', source: item?.source === 'plan' ? 'plan' : 'owner' });
  const [points, setPoints] = useState<MarkerPoint[]>(item?.points ?? []);
  const [extra, setExtra] = useState<HomeMedia[]>([]);
  const set = (k: keyof typeof form) => (v: string) => setForm(o => ({ ...o, [k]: v }));
  const allPhotos = [...extra, ...photos];
  const photo = allPhotos.find(p => p.id === form.mediaId);
  const performer = role === 'performer';
  const myWorks = works.data ?? [];
  const save = () => {
    const data: InfrastructureInput = { type: form.type as InfrastructureInput['type'], label: form.label.trim(), notes: form.notes.trim(), roomId: form.roomId || null, workId: form.workId || null, mediaId: form.mediaId || null, points, source: form.source as InfrastructureInput['source'] };
    const done = { onSuccess: () => { toast(item ? 'Xətt yeniləndi' : 'Xətt qeyd olundu'); onSaved(form.mediaId || null); } };
    if (item) update.mutate({ itemId: item.id, data }, done); else create.mutate({ homeId, data }, done);
  };
  return <Modal open onClose={onClose} eyebrow="Evdəki sistemlər" title={item ? 'Qeydi dəyiş' : 'Naqil və ya boru qeyd et'} wide
    footer={<button type="button" className="button button-primary" onClick={save} disabled={create.isPending || update.isPending || (performer && !form.workId)} data-testid="button-save-line">Yadda saxla</button>}>
    <div className="rl-form">
      {item?.verified && <p className="rl-warn">Bu xətt mütəxəssis tərəfindən təsdiqlənib. Dəyişiklik etsəniz təsdiq sıfırlanacaq.</p>}
      <div className="field-grid three">
        <Select label="Nə keçir?" name="line-type" value={form.type} onChange={set('type')} options={opts(INFRA_TYPE)} />
        <Select label="Otaq" name="line-room" value={form.roomId} onChange={set('roomId')} empty="Seçilməyib" options={(home.data?.rooms ?? []).map(r => [r.id, r.name])} />
        <Select label={performer ? 'İş (mütləq)' : 'İş'} name="line-work" value={form.workId} onChange={set('workId')} empty={performer ? 'İşi seçin' : 'Seçilməyib'} options={myWorks.map(w => [w.id, w.title])} />
      </div>
      <div className="field-grid">
        <Field label="Qısa ad" name="line-label" value={form.label} onChange={set('label')} placeholder="məs. Mətbəx rozetka xətti" />
        {role === 'owner' ? <Select label="Mənbə" name="line-source" value={form.source} onChange={set('source')} options={[['owner', INFRA_SOURCE.owner], ['plan', INFRA_SOURCE.plan]]} />
          : <div className="field"><span>Mənbə</span><p className="rl-hint">{role === 'technician' ? INFRA_SOURCE.specialist : INFRA_SOURCE.worker} (avtomatik)</p></div>}
      </div>
      <Field label="Qeyd" name="line-notes"><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes')(e.target.value)} placeholder="məs. Döşəmədən 30 sm hündürlükdə, rozetkaya qədər üfüqi" /></Field>
      <div className="field"><span>Foto</span>
        <div className="hp-thumbs">{allPhotos.map(p => <button key={p.id} type="button" className={form.mediaId === p.id ? 'on' : ''} onClick={() => { set('mediaId')(p.id); setPoints([]); }}><img src={p.url} alt="" loading="lazy" /></button>)}</div>
        <MediaUpload target={performer ? { workId: form.workId || undefined } : { homeId, ...(form.workId ? { workId: form.workId } : {}), ...(form.roomId ? { roomId: form.roomId } : {}) }} videos={false} label="Yeni foto" onDone={m => { setExtra(e => [...m, ...e]); if (m[0]) { set('mediaId')(m[0].id); setPoints([]); } }} />
        {performer && !form.workId && <small className="rl-hint">Usta kimi yalnız öz işinizə aid qeyd edə bilərsiniz — əvvəlcə işi seçin.</small>}
      </div>
      {photo && <>
        <p className="rl-hint"><b>Fotonun üzərinə toxunun</b> — naqil və ya borunun keçdiyi yerləri ardıcıl göstərin.</p>
        <PhotoMap photo={photo} items={[]} draft={{ points, color: INFRA_COLOR[form.type] }} onTap={p => setPoints(ps => [...ps, p].slice(0, 200))} />
        <div className="hp-actions"><button type="button" className="button button-quiet sm-btn-sm" disabled={!points.length} onClick={() => setPoints(ps => ps.slice(0, -1))}><Undo2 size={14} />Geri al</button><button type="button" className="button button-quiet sm-btn-sm" disabled={!points.length} onClick={() => setPoints([])}><Eraser size={14} />Təmizlə</button><small>{points.length} nöqtə</small></div>
      </>}
    </div>
  </Modal>;
}
