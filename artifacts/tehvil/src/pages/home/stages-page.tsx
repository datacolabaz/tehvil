import { useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Camera, ChevronDown, ClipboardCheck, Film, ImagePlus, LoaderCircle, MapPin, MapPinOff, Plus, Share2, RotateCcw, Check } from 'lucide-react';
import {
  createProtocol, reorderHomeWorks, useCreateWork, useListHomeMedia, useListHomeProtocols, useListWorks,
  type HomeMedia, type WorkSummary,
} from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, Modal, Pill, Skeleton } from '@/components/home/ui';
import { copy, type Lang, type TKey } from '@/lib/i18n';
import { STAGE_PRESETS } from '@/lib/i18n-history';
import { refreshHomeData, today } from '@/lib/home/labels';
import { UploadError, uploadHomeMedia } from '@/lib/home/upload';
import { photoMeta } from '@/lib/protocol/model';
import { useHome, HomeMissing } from './home-pages';
import './stages.css';

const lang = (): Lang => { try { return (localStorage.getItem('tehvil-language') as Lang) || 'az'; } catch { return 'az'; } };
const tr = (k: TKey) => String((copy[lang()] as unknown as Record<string, unknown>)[k] ?? (copy.az as unknown as Record<string, unknown>)[k]);
const MONTHS: Record<Lang, string[]> = {
  az: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'],
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
/** "21 okt 2026, 10:35" in Baku time, the same in every browser. */
const fmt = (iso?: string | null, withTime = true) => {
  if (!iso) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Baku' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${parts.day} ${MONTHS[lang()][Number(parts.month) - 1]} ${parts.year}${withTime ? `, ${parts.hour}:${parts.minute}` : ''}`;
};
const dayOnly = (d?: string | null) => (d ? fmt(`${d}T08:00:00Z`, false) : '');
const GPS_KEY = 'tehvil-record-gps';
const readGpsPref = () => { try { return localStorage.getItem(GPS_KEY) === 'on'; } catch { return false; } };
const isVideo = (m: { contentType: string }) => m.contentType.startsWith('video/');
const isImage = (m: { contentType: string }) => m.contentType.startsWith('image/');
const PROTOCOL_TYPE: Record<string, 'apartment' | 'house' | 'other'> = { apartment: 'apartment', house: 'house', villa: 'house' };

/** One position fix with the person's permission; denied, unavailable or slow → null (the upload goes on). */
function devicePosition(): Promise<{ lat: number; lon: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (v: { lat: number; lon: number } | null) => resolve(v);
    const timer = setTimeout(() => done(null), 7000);
    navigator.geolocation.getCurrentPosition((p) => { clearTimeout(timer); done({ lat: p.coords.latitude, lon: p.coords.longitude }); }, () => { clearTimeout(timer); done(null); }, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 6500 });
  });
}
/** Video length from the file itself; unknown → null. */
function videoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video'); const url = URL.createObjectURL(file);
    const end = (n: number | null) => { URL.revokeObjectURL(url); resolve(n); };
    v.preload = 'metadata'; v.onloadedmetadata = () => end(Number.isFinite(v.duration) ? v.duration : null); v.onerror = () => end(null); v.src = url;
    setTimeout(() => end(null), 8000);
  });
}

/** Stages in the order the owner set; without one, by date and then by when they were added. */
export function orderStages(works: WorkSummary[]) {
  return [...works].sort((a, b) => {
    const ao = a.sortOrder ?? null, bo = b.sortOrder ?? null;
    if (ao !== null && bo !== null && ao !== bo) return ao - bo;
    if (ao !== null && bo === null) return -1;
    if (ao === null && bo !== null) return 1;
    return (a.startDate ?? a.createdAt.slice(0, 10)).localeCompare(b.startDate ?? b.createdAt.slice(0, 10)) || a.createdAt.localeCompare(b.createdAt);
  });
}

export function MediaFacts({ m }: { m: HomeMedia }) {
  const g = m.gps as { lat: number; lon: number } | null | undefined;
  return <dl className="st-facts" data-testid="media-facts">
    {m.takenAt ? <div><dt>{tr('hTaken')}</dt><dd>{fmt(m.takenAt)} <small>({tr('hDeviceData')})</small></dd></div> : null}
    <div><dt>{tr('hUploaded')}</dt><dd>{fmt(m.createdAt)}</dd></div>
    <div><dt>{tr('hLocation')}</dt><dd>{m.hasGps ? <span className="st-gps on" data-testid="gps-yes"><MapPin size={12} />{tr('hGpsRecorded')}{g ? <a href={`https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=18/${g.lat}/${g.lon}`} target="_blank" rel="noopener noreferrer"> · {g.lat.toFixed(5)}, {g.lon.toFixed(5)}</a> : null}</span> : <span className="st-gps" data-testid="gps-no"><MapPinOff size={12} />{tr('hNoLocation')}</span>}</dd></div>
  </dl>;
}

type Item = { id: string; name: string; state: 'uploading' | 'done' | 'error'; error?: string; file: File; kind: 'camera' | 'gallery' | 'video' };
let seq = 0;

function StageCard({ w, media, homeId, canEdit, open, toggle, first, last, move, gps }: { w: WorkSummary; media: HomeMedia[]; homeId: string; canEdit: boolean; open: boolean; toggle: () => void; first: boolean; last: boolean; move: (d: -1 | 1) => void; gps: boolean }) {
  const qc = useQueryClient();
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null); const vid = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<Item[]>([]);
  const photos = media.filter(isImage); const videos = media.filter(isVideo);
  const cover = photos[0];
  const refresh = () => { void qc.invalidateQueries({ queryKey: [`/api/homes/${homeId}/media`] }); void refreshHomeData(qc); };
  const send = async (it: Item) => {
    setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, state: 'uploading', error: '' } : x)));
    try {
      if (it.kind === 'video') {
        const s = await videoSeconds(it.file);
        if (s !== null && s > 61) throw new UploadError('Video 60 saniyədən uzundur. Qısa video seçin.');
      }
      const meta = it.kind === 'video' ? { takenAt: null, gps: null } : await photoMeta(it.file);
      const device = gps && !meta.gps ? await devicePosition() : null;
      const location = meta.gps ? { gps: meta.gps, gpsSource: 'exif' } : device ? { gps: device, gpsSource: 'device' } : null;
      const takenAt = meta.takenAt ?? (it.kind === 'camera' ? new Date().toISOString() : null);
      await uploadHomeMedia([it.file], { workId: w.id, phase: 'during', ...(takenAt ? { takenAt, takenSource: meta.takenAt ? 'exif' : 'camera' } : {}), ...(location ? { clientMeta: location } : {}) });
      setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, state: 'done' } : x)));
      setTimeout(() => setQueue((q) => q.filter((x) => x.id !== it.id)), 2500);
      refresh();
    } catch (e) {
      const detail = (e as { data?: { error?: string } })?.data?.error;
      setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, state: 'error', error: e instanceof UploadError ? e.message : detail || tr('hUploadFailed') } : x)));
    }
  };
  const pick = (list: FileList | null, kind: Item['kind']) => {
    const files = Array.from(list ?? []).slice(0, 10);
    const items = files.map((file) => ({ id: `u${++seq}`, name: file.name, state: 'uploading' as const, file, kind }));
    setQueue((q) => [...q, ...items]);
    if (!open) toggle();
    void (async () => { for (const it of items) await send(it); })();
  };
  return <li className={`st-stage ${open ? 'open' : ''}`} data-testid="stage">
    <span className="st-dot" aria-hidden="true" />
    <div className="st-card">
      <button type="button" className="st-head" onClick={toggle} aria-expanded={open} data-testid="stage-toggle">
        <span className="st-thumb">{cover ? <img src={cover.url} alt="" loading="lazy" /> : <Camera size={20} />}</span>
        <span className="st-main">
          <b data-testid="stage-title">{w.title}</b>
          <small>{w.startDate ? dayOnly(w.startDate) : ''}{w.endDate && w.endDate !== w.startDate ? ` — ${dayOnly(w.endDate)}` : ''}</small>
          <span className="st-badges"><span data-testid="stage-count">{photos.length} {tr('hPhotos')}</span>{videos.length > 0 && <span><Film size={12} />{videos.length}</span>}{media.some((m) => m.hasGps) && <span className="st-gps on"><MapPin size={12} />GPS</span>}</span>
        </span>
        <ChevronDown size={18} className="st-chev" />
      </button>
      {w.description && <p className="st-desc">{w.description}</p>}
      {canEdit && <div className="st-actions">
        <button type="button" className="button button-primary st-big" onClick={() => cam.current?.click()} data-testid="stage-camera"><Camera size={18} />{tr('hTakePhoto')}</button>
        <button type="button" className="button button-secondary st-big" onClick={() => gal.current?.click()} data-testid="stage-gallery"><ImagePlus size={18} />{tr('hUploadPhoto')}</button>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files, 'camera'); e.target.value = ''; }} data-testid="stage-camera-input" />
        <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => { pick(e.target.files, 'gallery'); e.target.value = ''; }} data-testid="stage-gallery-input" />
        <input ref={vid} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { pick(e.target.files, 'video'); e.target.value = ''; }} data-testid="stage-video-input" />
      </div>}
      {queue.length > 0 && <ul className="st-queue" aria-live="polite">{queue.map((q) => <li key={q.id} className={q.state} data-testid={`upload-${q.state}`}>
        {q.state === 'uploading' ? <><LoaderCircle size={14} className="spin" />{tr('hUploading')}</> : q.state === 'done' ? <><Check size={14} />{tr('hPhotoAdded')}</> : <><span>{q.error}</span><button type="button" className="sm-link-btn" onClick={() => void send(q)} data-testid="upload-retry"><RotateCcw size={12} />{tr('hRetry')}</button></>}
      </li>)}</ul>}
      {open && <div className="st-body">
        {!media.length ? <p className="st-empty">{tr('hNoPhotos')}</p>
          : <ul className="st-media">{media.map((m) => <li key={m.id}>
            {isVideo(m) ? <video src={m.url} controls preload="metadata" /> : <a href={m.url} target="_blank" rel="noopener noreferrer"><img src={m.url} alt={m.caption || w.title} loading="lazy" /></a>}
            <MediaFacts m={m} />
          </li>)}</ul>}
        <div className="st-more">
          {canEdit && <button type="button" className="sm-link-btn" onClick={() => vid.current?.click()} data-testid="stage-video"><Film size={13} />{tr('hAddVideo')} <small>(≤60 s, ≤50 MB)</small></button>}
          <Link href={`/works/${w.id}`} className="sm-link-btn">{tr('hEditStage')}</Link>
          {canEdit && <span className="st-move"><button type="button" className="icon-button" disabled={first} onClick={() => move(-1)} aria-label={tr('hMoveUp')} data-testid="stage-up"><ArrowUp size={14} /></button><button type="button" className="icon-button" disabled={last} onClick={() => move(1)} aria-label={tr('hMoveDown')} data-testid="stage-down"><ArrowDown size={14} /></button></span>}
        </div>
      </div>}
    </div>
  </li>;
}

function AddStage({ homeId, used, onClose, onAdded }: { homeId: string; used: string[]; onClose: () => void; onAdded: (id: string) => void }) {
  const create = useCreateWork();
  const [name, setName] = useState(''); const [preset, setPreset] = useState<(typeof STAGE_PRESETS)[number] | null>(null);
  const [date, setDate] = useState(today()); const [err, setErr] = useState('');
  const l = lang();
  const save = async (p = preset, n = name) => {
    const title = (p ? p[l] : n).trim();
    if (title.length < 2) return setErr(tr('hStageName'));
    setErr('');
    try {
      const w = await create.mutateAsync({ homeId, data: { title, category: (p?.category ?? 'general') as never, kind: (p?.kind ?? 'construction') as never, startDate: date || null, status: date && date > today() ? 'planned' : 'completed', description: '' } });
      onAdded(w.id);
    } catch (e) { setErr((e as { data?: { error?: string } })?.data?.error ?? tr('hUploadFailed')); }
  };
  return <Modal open onClose={onClose} title={tr('hAddStage')} footer={<button type="button" className="button button-primary st-big" disabled={create.isPending || (!preset && name.trim().length < 2)} onClick={() => void save()} data-testid="stage-save">{create.isPending && <LoaderCircle size={15} className="spin" />}{tr('hAddStage')}</button>}>
    <div className="st-presets" role="radiogroup" aria-label={tr('hStageName')}>{STAGE_PRESETS.map((p) => <button key={p.key} type="button" role="radio" aria-checked={preset?.key === p.key} className={`${preset?.key === p.key ? 'on' : ''} ${used.includes(p[l]) ? 'used' : ''}`} onClick={() => { setPreset(p); setName(''); }} data-testid={`preset-${p.key}`}>{p[l]}</button>)}</div>
    <label className="field"><span>{tr('hOwnStage')}</span><input value={name} onChange={(e) => { setName(e.target.value); setPreset(null); }} placeholder="…" data-testid="stage-name" /></label>
    <label className="field"><span>{tr('hStageDate')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="stage-date" /></label>
    {err && <p className="ai-error">{err}</p>}
  </Modal>;
}

/** Home history: construction and renovation stages as a timeline, photo first. Separate from the room-by-room handover protocol. */
export function HomeStagesPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const works = useListWorks(homeId);
  const media = useListHomeMedia(homeId);
  const protocols = useListHomeProtocols(homeId, { query: { queryKey: [`/api/homes/${homeId}/protocols`], retry: false } });
  const qc = useQueryClient(); const [, go] = useLocation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [gps, setGps] = useState(readGpsPref());
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const stages = useMemo(() => orderStages(works.data ?? []), [works.data]);
  if (home.isLoading || works.isLoading) return <Skeleton rows={4} />;
  if (!home.data) return <HomeMissing />;
  const h = home.data.home; const p = h.permissions;
  const canEdit = p.addWorks;
  const byWork = (id: string) => (media.data ?? []).filter((m) => m.workId === id);
  const setGpsPref = async (on: boolean) => {
    setGps(on); try { localStorage.setItem(GPS_KEY, on ? 'on' : 'off'); } catch { /* per-device preference only */ }
    if (on) { const pos = await devicePosition(); if (!pos) setErr(`${tr('hNoLocation')}: GPS icazəsi verilməyib və ya əlçatan deyil. Fotolar yenə yüklənəcək.`); else setErr(''); }
  };
  const move = async (i: number, d: -1 | 1) => {
    const ids = stages.map((s) => s.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { const r = await reorderHomeWorks(homeId, { ids }); qc.setQueryData([`/api/homes/${homeId}/works`], r); } catch { setErr('Sıra dəyişmədi. Yenidən cəhd edin.'); }
  };
  const newProtocol = async () => {
    setBusy('protocol'); setErr('');
    try {
      const d = await createProtocol({ role: 'seller', propertyType: PROTOCOL_TYPE[h.propertyType] ?? 'other', address: [h.address, h.district, h.city].filter(Boolean).join(', ') || h.name, homeId });
      void qc.invalidateQueries({ queryKey: [`/api/homes/${homeId}/protocols`] }); void qc.invalidateQueries({ queryKey: ['/api/protocols'] });
      go(`/protokol/${(d as unknown as { protocol: { id: string } }).protocol.id}`);
    } catch (e) { setErr((e as { data?: { error?: string } })?.data?.error ?? 'Protokol yaradılmadı.'); setBusy(''); }
  };
  return <div className="st-page" data-testid="stages-page">
    <PageHeading eyebrow={h.name} title={tr('hHistory')} description="Tikinti və təmir mərhələləri foto ilə, tarix ardıcıllığında. Otaq-otaq təhvil yoxlaması ayrıca — təhvil protokolundadır."
      action={canEdit ? <button type="button" className="button button-primary" onClick={() => setAdding(true)} data-testid="stage-add"><Plus size={16} />{tr('hAddStage')}</button> : undefined} />
    <div className="st-tools">
      {canEdit && <label className="st-gps-toggle"><input type="checkbox" checked={gps} onChange={(e) => void setGpsPref(e.target.checked)} data-testid="gps-toggle" /><MapPin size={14} />{tr('hRecordLocation')}</label>}
      {p.manageSharing && <Link href={`/homes/${homeId}/sharing`} className="button button-secondary" data-testid="stage-share"><Share2 size={15} />{tr('hShareHistory')}</Link>}
      {p.edit && <button type="button" className="button button-secondary" disabled={busy === 'protocol'} onClick={() => void newProtocol()} data-testid="stage-protocol"><ClipboardCheck size={15} />{tr('hCreateProtocol')}</button>}
    </div>
    {err && <p className="ai-warn" data-testid="stages-warn">{err}</p>}
    {(protocols.data ?? []).length > 0 && <div className="st-protocols" data-testid="home-protocols">{protocols.data!.map((x) => <Link key={x.id} href={`/protokol/${x.id}`} className="st-proto"><ClipboardCheck size={15} /><span>{tr('hViewProtocol')} · № {x.number}</span><Pill small tone={x.status === 'finalized' || x.status === 'approved' ? 'ok' : 'info'}>{x.status === 'finalized' ? 'PDF' : x.status === 'approved' ? '✓' : '…'}</Pill></Link>)}</div>}
    {!stages.length ? <Empty icon={<Camera size={28} />} title={tr('hNoHistory')} text="Mərhələni seçin və ilk fotonu çəkin — qalan məlumatı sonra da yaza bilərsiniz."
      action={canEdit ? <div className="st-presets inline">{STAGE_PRESETS.slice(0, 6).map((ps) => <button key={ps.key} type="button" onClick={() => setAdding(true)}>{ps[lang()]}</button>)}<button type="button" className="button button-primary" onClick={() => setAdding(true)} data-testid="stage-add-empty"><Plus size={15} />{tr('hFirstPhoto')}</button></div> : undefined} />
      : <ol className="st-timeline" data-testid="timeline">{stages.map((w, i) => <StageCard key={w.id} w={w} media={byWork(w.id)} homeId={homeId} canEdit={canEdit} open={openId === w.id} toggle={() => setOpenId(openId === w.id ? null : w.id)} first={i === 0} last={i === stages.length - 1} move={(d) => void move(i, d)} gps={gps} />)}</ol>}
    <p className="st-note">{tr('hEvidenceNote')} Video: hər ev üçün 5-ə qədər, hər biri ≤60 saniyə və ≤50 MB. Pro plan {tr('hComingSoon')} — hazırda bütün imkanlar pulsuzdur.</p>
    {adding && <AddStage homeId={homeId} used={stages.map((s) => s.title)} onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); setOpenId(id); void refreshHomeData(qc); void qc.invalidateQueries({ queryKey: [`/api/homes/${homeId}/works`] }); }} />}
  </div>;
}
