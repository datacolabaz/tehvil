import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, CheckCircle2, ChevronDown, Copy, EyeOff, HelpCircle, ImagePlus, Info, LoaderCircle, MapPin, MessageCircle, MoreHorizontal, Plus, RotateCcw, Star, Trash2, UserPlus, WifiOff } from 'lucide-react';
import { api, errorText, ROOM_KIND } from '@/lib/finance/api';
import { UploadError, uploadHomeMedia } from '@/lib/home/upload';
import { photoMeta } from '@/lib/protocol/model';
import { floorLabel, FLOORS } from '@/lib/home/floors';
import { Modal, QrCode } from '@/components/home/ui';
import './diary.css';

/*
 * "Evimin tikinti tarixçəsi": the one thing to do now is take a photo of the current stage. Everything else — which
 * shot, floor, room, a note — is optional and can be added after the photo is saved. A photo never marks a stage done;
 * only the owner does.
 */

type Shot = { key: string; label: string };
interface Template { key: string; title: string; hint: string; glossary?: string; shots: Shot[]; perFloor: boolean; perRoom: boolean; core: boolean }
interface Stage {
  id: string; title: string; templateKey: string | null; hint: string | null; glossary: string | null; shots: Shot[]; perFloor: boolean; perRoom: boolean;
  status: string; diaryStatus: 'not_started' | 'photos' | 'done'; awaitingReview: boolean; revision: boolean; hidden: boolean; note: string;
  photoCount: number; lastPhotoUrl: string | null; lastPhotoAt: string | null;
}
interface Photo { id: string; url: string; contentType: string; workId: string; caption: string; createdAt: string; takenAt: string | null; floorLevel: number | null; roomKind: string | null; shotKey: string | null; by: string; viaLink: boolean; mine: boolean; hasGps: boolean }
interface Diary {
  home: { id: string; name: string; address: string; propertyType: string; stage: string };
  role: string; permissions: { manage: boolean; addPhotos: boolean; deletePhotos: boolean; share: boolean };
  currentWorkId: string | null; templates: Template[]; stages: Stage[]; photos: Photo[];
}
const diaryKey = (homeId: string) => ['diary', homeId];

const ROOMS = ['living', 'bedroom', 'kitchen', 'bathroom', 'toilet', 'hall', 'balcony', 'utility', 'exterior', 'other'];
const STATUS = { not_started: 'Başlanmayıb', photos: 'Foto əlavə edilib', done: 'Tamamlanıb' } as const;
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const when = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Baku' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${MONTHS[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute}`;
};
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* per-device convenience only */ } } };

/** One position fix, only when the person turned it on; denied or slow → no location (the photo still goes). */
function devicePosition(): Promise<{ lat: number; lon: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 7000);
    navigator.geolocation.getCurrentPosition((p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); }, () => { clearTimeout(t); resolve(null); }, { maximumAge: 60_000, timeout: 6500 });
  });
}

type Job = { id: string; file: File; camera: boolean; workId: string; single: boolean; state: 'uploading' | 'done' | 'error'; error?: string; mediaId?: string };
let seq = 0;

export function DiaryPage({ homeId }: { homeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: diaryKey(homeId), queryFn: () => api<Diary>(`/homes/${homeId}/diary`) });
  const refresh = () => qc.invalidateQueries({ queryKey: diaryKey(homeId) });
  const [open, setOpen] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tagging, setTagging] = useState<{ mediaId: string; workId: string } | null>(null);
  const [gps, setGps] = useState(() => store.get('tehvil-record-gps') === 'on');
  const [adding, setAdding] = useState(false); const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  const d = q.data;
  const visible = useMemo(() => (d?.stages ?? []).filter((s) => !s.hidden), [d]);
  if (q.isLoading) return <div className="dy-page"><p className="dy-loading"><LoaderCircle className="spin" size={18} />Yüklənir…</p></div>;
  if (!d) return <div className="dy-page"><p className="dy-error" role="alert">{errorText(q.error) || 'Ev tapılmadı və ya baxmaq icazəniz yoxdur.'}</p><Link href="/homes" className="button button-secondary">Mənim evlərim</Link></div>;
  const p = d.permissions;
  const current = visible.find((s) => s.id === d.currentWorkId) ?? null;
  const hidden = d.stages.filter((s) => s.hidden);
  const recent = d.photos.filter((x) => x.contentType.startsWith('image/')).slice(0, 8);

  const send = async (job: Job) => {
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, state: 'uploading', error: '' } : j)));
    try {
      const meta = await photoMeta(job.file);
      const device = gps && !meta.gps ? await devicePosition() : null;
      const location = gps ? (meta.gps ? { gps: meta.gps, gpsSource: 'exif' } : device ? { gps: device, gpsSource: 'device' } : null) : null;
      const takenAt = meta.takenAt ?? (job.camera ? new Date().toISOString() : null);
      const [m] = await uploadHomeMedia([job.file], { workId: job.workId, phase: 'during', ...(takenAt ? { takenAt, takenSource: meta.takenAt ? 'exif' : 'camera' } : {}), ...(location ? { clientMeta: location } : {}) } as never, { videos: false });
      // The floor this person last chose for this home is applied right away; it is shown and can be changed.
      const stage = d.stages.find((s) => s.id === job.workId);
      const lastFloor = store.get(`tehvil-floor-${homeId}`);
      if (m && stage?.perFloor && lastFloor !== null && lastFloor !== '') await api(`/homes/${homeId}/diary/photos/${m.id}`, 'PATCH', { floorLevel: Number(lastFloor) }).catch(() => null);
      setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, state: 'done', mediaId: m?.id } : j)));
      setTimeout(() => setJobs((js) => js.filter((j) => j.id !== job.id)), 4000);
      // Details are offered right away for a single photo; a batch from the gallery can be tagged later, photo by photo.
      if (m && job.single) setTagging({ mediaId: m.id, workId: job.workId });
      await refresh();
    } catch (e) {
      const text = typeof navigator !== 'undefined' && !navigator.onLine ? 'İnternet bağlantısı yoxdur. Bağlantı bərpa olunanda “Yenidən cəhd et” basın — foto itməyib.'
        : e instanceof UploadError ? e.message : errorText(e) || 'Foto yüklənmədi. Yenidən cəhd edin.';
      setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, state: 'error', error: text } : j)));
    }
  };
  const pick = (list: FileList | null, camera: boolean) => {
    const workId = target ?? current?.id;
    setTarget(null);
    if (!workId) return;
    const files = Array.from(list ?? []).slice(0, 10);
    const add = files.map((file) => ({ id: `j${++seq}`, file, camera, workId, single: files.length === 1, state: 'uploading' as const }));
    setJobs((js) => [...js, ...add]);
    setOpen(workId);
    void (async () => { for (const j of add) await send(j); })();
  };
  const shoot = (workId: string | null, camera: boolean) => { setTarget(workId); (camera ? cam : gal).current?.click(); };
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setMsg(''); try { await fn(); await refresh(); } catch (e) { setMsg(errorText(e)); } finally { setBusy(''); } };
  const applyTemplate = () => act('template', () => api(`/homes/${homeId}/diary/template`, 'POST', {}));
  const setCurrent = (id: string | null) => act('current', () => api(`/homes/${homeId}/diary/current`, 'PUT', { workId: id }));
  const toggleGps = async (on: boolean) => {
    setGps(on); store.set('tehvil-record-gps', on ? 'on' : 'off');
    if (on && !(await devicePosition())) setMsg('Məkan icazəsi verilməyib və ya əlçatan deyil. Fotolar yenə yüklənəcək — məkansız.');
  };

  return <div className="dy-page" data-testid="diary-page">
    <header className="dy-head">
      <h1 data-testid="dy-home">{d.home.name}</h1>
      {d.home.address && <small>{d.home.address}</small>}
    </header>

    {!visible.length ? <section className="dy-empty" data-testid="dy-empty">
      <h2>Evin tikinti tarixçəsini foto ilə saxlayın</h2>
      <p>Torpaq, beton və suvaq altında qalacaq hissələrin şəklini vaxtında çəkin — illər sonra hansı xəttin harada olduğunu tapmaq asan olacaq.</p>
      {p.manage ? <>
        <button className="button button-primary dy-big" onClick={() => void applyTemplate()} disabled={!!busy} data-testid="dy-template">{busy === 'template' ? <LoaderCircle className="spin" size={20} /> : <Plus size={20} />}Fərdi ev / villa şablonu ilə başla</button>
        <small>Fundament, izolyasiya, kolonlar, divarlar, elektrik, su, isti döşəmə, suvaq, astar — 9 mərhələ. Uyğun olmayanı sonra gizlədə bilərsiniz.</small>
        <button className="button button-secondary" onClick={() => setAdding(true)} data-testid="dy-add-own">Öz mərhələmi əlavə edim</button>
      </> : <p className="dy-muted">Ev sahibi hələ tikinti mərhələlərini əlavə etməyib.</p>}
    </section> : <>
      <section className="dy-now" data-testid="dy-now">
        <div className="dy-now-head">
          <span>Cari mərhələ</span>
          {p.manage ? <select value={current?.id ?? ''} onChange={(e) => void setCurrent(e.target.value || null)} disabled={busy === 'current'} aria-label="Cari mərhələni seçin" data-testid="dy-current">
            <option value="">— seçin —</option>{visible.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select> : <b>{current?.title ?? 'seçilməyib'}</b>}
        </div>
        {current && <p className="dy-hint">{current.hint}</p>}
        {p.addPhotos && (current ? <div className="dy-shoot">
          <button className="button button-primary dy-camera" onClick={() => shoot(null, true)} data-testid="dy-camera"><Camera size={26} />Şəkil çək</button>
          <button className="button button-secondary dy-big" onClick={() => shoot(null, false)} data-testid="dy-gallery"><ImagePlus size={20} />Qalereyadan seç</button>
        </div> : <p className="dy-muted">{p.manage ? 'Cari mərhələni seçin — “Şəkil çək” fotonu ora əlavə edəcək. Və ya aşağıda mərhələnin özündən şəkil çəkin.' : 'Aşağıdan mərhələni açıb şəkil çəkin.'}</p>)}
        {p.addPhotos && <label className="dy-gps"><input type="checkbox" checked={gps} onChange={(e) => void toggleGps(e.target.checked)} data-testid="dy-gps" /><MapPin size={14} />Məkanı da qeyd et (istəyə bağlı)</label>}
        <Queue jobs={jobs} retry={(j) => void send(j)} />
        <p className="dy-tip">Kamera açılmırsa: brauzerə kamera icazəsi verin və ya “Qalereyadan seç” ilə telefonda çəkilmiş şəkli seçin.</p>
      </section>
      {msg && <p className="dy-error" role="alert" data-testid="dy-msg">{msg}</p>}

      <section className="dy-stages" aria-label="Tikinti mərhələləri">
        <div className="dy-stages-head"><h2>Tikinti mərhələləri</h2>
          <div className="dy-head-actions">
            {p.manage && <button className="button button-quiet sm-btn-sm" onClick={() => setAdding(true)} data-testid="dy-add-stage"><Plus size={15} />Mərhələ</button>}
            {p.manage && <button className="button button-secondary sm-btn-sm" onClick={() => setInviting(true)} data-testid="dy-invite"><UserPlus size={15} />Usta dəvət et</button>}
          </div></div>
        <ol className="dy-list">{visible.map((s) => <StageCard key={s.id} s={s} d={d} homeId={homeId} current={s.id === current?.id} open={open === s.id} toggle={() => setOpen(open === s.id ? null : s.id)}
          shoot={(camera) => shoot(s.id, camera)} onChange={refresh} setCurrent={() => void setCurrent(s.id)} />)}</ol>
        {hidden.length > 0 && <details className="dy-hidden"><summary><EyeOff size={14} />Gizlədilmiş mərhələlər ({hidden.length})</summary>
          <ul>{hidden.map((s) => <li key={s.id}><span>{s.title}{s.photoCount ? ` · ${s.photoCount} foto` : ''}</span>{p.manage && <button className="sm-link-btn" onClick={() => void act(`show-${s.id}`, () => api(`/homes/${homeId}/diary/stages/${s.id}`, 'PATCH', { hidden: false }))} data-testid="dy-unhide">Göstər</button>}</li>)}</ul></details>}
      </section>

      {recent.length > 0 && <section className="dy-recent" data-testid="dy-recent"><h2>Son fotolar</h2>
        <div className="dy-strip">{recent.map((x) => <figure key={x.id}><img src={x.url} alt="" loading="lazy" /><figcaption>{d.stages.find((s) => s.id === x.workId)?.title}{x.floorLevel != null ? ` · ${floorLabel(x.floorLevel)}` : ''}<br />{when(x.createdAt)}</figcaption></figure>)}</div></section>}
    </>}

    <p className="dy-note"><Info size={14} />Fotolar tikinti prosesinin tarixçəsidir; işin keyfiyyətini və ya texniki uyğunluğunu təsdiq etmir. Fotolar yalnız icazə verdiyiniz şəxslərə görünür.</p>
    <Link href={`/homes/${homeId}/diger`} className="dy-other" data-testid="dy-other"><MoreHorizontal size={16} />Digər məlumatlar: ümumi məlumat, otaqlar, sənədlər, maliyyə…</Link>

    <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files, true); e.target.value = ''; }} data-testid="dy-camera-input" />
    <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => { pick(e.target.files, false); e.target.value = ''; }} data-testid="dy-gallery-input" />
    {tagging && <TagSheet homeId={homeId} d={d} mediaId={tagging.mediaId} workId={tagging.workId} onClose={() => { setTagging(null); void refresh(); }} />}
    {adding && <AddStage homeId={homeId} d={d} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void refresh(); }} />}
    {inviting && <InviteSheet homeId={homeId} onClose={() => setInviting(false)} />}
  </div>;
}

function Queue({ jobs, retry }: { jobs: Job[]; retry: (j: Job) => void }) {
  if (!jobs.length) return null;
  const done = jobs.filter((j) => j.state === 'done').length;
  return <ul className="dy-queue" aria-live="polite">
    {done > 0 && <li className="done" data-testid="dy-upload-done"><CheckCircle2 size={16} /><b>{done > 1 ? `${done} foto əlavə edildi` : 'Foto əlavə edildi'}</b></li>}
    {jobs.filter((j) => j.state !== 'done').map((j) => <li key={j.id} className={j.state} data-testid={`dy-upload-${j.state}`}>
      {j.state === 'uploading' ? <><LoaderCircle size={15} className="spin" />Yüklənir…</>
        : <><span>{typeof navigator !== 'undefined' && !navigator.onLine && <WifiOff size={14} />}{j.error}</span><button type="button" className="sm-link-btn" onClick={() => retry(j)} data-testid="dy-retry"><RotateCcw size={13} />Yenidən cəhd et</button></>}
    </li>)}</ul>;
}

function StageCard({ s, d, homeId, current, open, toggle, shoot, onChange, setCurrent }: { s: Stage; d: Diary; homeId: string; current: boolean; open: boolean; toggle: () => void; shoot: (camera: boolean) => void; onChange: () => void; setCurrent: () => void }) {
  const p = d.permissions;
  const photos = d.photos.filter((x) => x.workId === s.id);
  const floors = [...new Set(photos.map((x) => x.floorLevel).filter((f): f is number => f != null))].sort((a, b) => a - b);
  const [floor, setFloor] = useState<number | 'all' | 'none'>('all');
  const [view, setView] = useState<Photo | null>(null);
  const [note, setNote] = useState(s.note); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => setNote(s.note), [s.note]);
  const shown = photos.filter((x) => floor === 'all' || (floor === 'none' ? x.floorLevel == null : x.floorLevel === floor));
  const patch = async (body: object) => { setBusy(true); setErr(''); try { await api(`/homes/${homeId}/diary/stages/${s.id}`, 'PATCH', body); onChange(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  return <li className={`dy-stage ${open ? 'open' : ''} ${s.diaryStatus}`} data-testid="dy-stage">
    <button type="button" className="dy-stage-head" onClick={toggle} aria-expanded={open} data-testid="dy-stage-toggle">
      <span className="dy-thumb">{s.lastPhotoUrl ? <img src={s.lastPhotoUrl} alt="" loading="lazy" /> : <Camera size={20} />}</span>
      <span className="dy-stage-main">
        <b data-testid="dy-stage-title">{s.title}{current && <em className="dy-current-badge"><Star size={11} />cari</em>}</b>
        <span className={`dy-status ${s.diaryStatus}`} data-testid="dy-stage-status">{STATUS[s.diaryStatus]}</span>
        <small>{s.photoCount} foto{s.lastPhotoAt ? ` · son: ${when(s.lastPhotoAt)}` : ''}</small>
        {s.awaitingReview && <small className="dy-flag">Usta “tamamlandı” bildirib — yoxlayın</small>}
        {s.revision && <small className="dy-flag">Düzəliş istənilib</small>}
      </span>
      <ChevronDown size={18} className="dy-chev" />
    </button>
    {open && <div className="dy-body">
      {s.hint && <p className="dy-hint">{s.hint}</p>}
      {s.glossary && <details className="dy-glossary"><summary><HelpCircle size={14} />Bu nədir?</summary><p>{s.glossary}</p></details>}
      {p.addPhotos && <div className="dy-shoot two">
        <button className="button button-primary dy-big" onClick={() => shoot(true)} data-testid="dy-stage-camera"><Camera size={20} />Şəkil çək</button>
        <button className="button button-secondary dy-big" onClick={() => shoot(false)} data-testid="dy-stage-gallery"><ImagePlus size={18} />Qalereyadan</button>
      </div>}
      {s.shots.length > 0 && <div className="dy-shots"><b>Nəyin şəklini çəkmək olar</b><ul>{s.shots.map((sh) => {
        const n = photos.filter((x) => x.shotKey === sh.key).length;
        return <li key={sh.key} className={n ? 'has' : ''}>{n ? <Check size={14} /> : <span className="dy-dot" />}{sh.label}{n ? <small>{n}</small> : null}</li>;
      })}</ul><small className="dy-muted">Hamısı məcburi deyil — evinizdə olmayanı keçin.</small></div>}
      {floors.length > 0 && <div className="dy-floors" role="tablist" aria-label="Mərtəbə">
        <button className={floor === 'all' ? 'on' : ''} onClick={() => setFloor('all')} data-testid="dy-floor-all">Hamısı ({photos.length})</button>
        {floors.map((f) => <button key={f} className={floor === f ? 'on' : ''} onClick={() => setFloor(f)} data-testid={`dy-floor-${f}`}>{floorLabel(f)} ({photos.filter((x) => x.floorLevel === f).length})</button>)}
        {photos.some((x) => x.floorLevel == null) && <button className={floor === 'none' ? 'on' : ''} onClick={() => setFloor('none')}>Mərtəbəsiz</button>}
      </div>}
      {!shown.length ? <p className="dy-muted">{photos.length ? 'Bu seçimdə foto yoxdur.' : 'Hələ foto yoxdur.'}</p>
        : <ul className="dy-grid" data-testid="dy-grid">{shown.map((x) => <li key={x.id}><button type="button" onClick={() => setView(x)} data-testid="dy-photo">
          {x.contentType.startsWith('video/') ? <video src={x.url} preload="metadata" muted /> : <img src={x.url} alt={x.caption || s.title} loading="lazy" />}
          <span>{[x.floorLevel != null ? floorLabel(x.floorLevel) : '', x.roomKind ? ROOM_KIND[x.roomKind] : ''].filter(Boolean).join(' · ')}</span>
        </button></li>)}</ul>}
      {p.manage ? <label className="dy-note-field"><span>Qeyd (istəyə bağlı) — məs. kolonların sayı, divarın materialı</span>
        <textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== s.note && void patch({ note })} data-testid="dy-stage-note" /></label>
        : s.note ? <p className="dy-muted">Qeyd: {s.note}</p> : null}
      {p.manage && <div className="dy-actions">
        {!current && <button className="sm-link-btn" onClick={setCurrent} data-testid="dy-make-current"><Star size={13} />Cari mərhələ et</button>}
        {s.diaryStatus === 'done'
          ? <button className="sm-link-btn" disabled={busy} onClick={() => void patch({ done: false })} data-testid="dy-undone"><RotateCcw size={13} />Tamamlanmayıb</button>
          : <button className="sm-link-btn" disabled={busy} onClick={() => void patch({ done: true })} data-testid="dy-done"><CheckCircle2 size={13} />Tamamlandı kimi işarələ</button>}
        <button className="sm-link-btn" disabled={busy} onClick={() => void patch({ hidden: true })} data-testid="dy-hide"><EyeOff size={13} />Gizlət</button>
        <Link href={`/works/${s.id}`} className="sm-link-btn">Ətraflı</Link>
      </div>}
      {err && <p className="dy-error" role="alert">{err}</p>}
    </div>}
    {view && <PhotoView homeId={homeId} d={d} s={s} x={view} onClose={() => setView(null)} onChange={() => { setView(null); onChange(); }} />}
  </li>;
}

/** After a photo is saved: optional details, one tap each. Nothing here is required. */
function TagSheet({ homeId, d, mediaId, workId, onClose }: { homeId: string; d: Diary; mediaId: string; workId: string; onClose: () => void }) {
  const s = d.stages.find((x) => x.id === workId);
  const remembered = store.get(`tehvil-floor-${homeId}`);
  const [floor, setFloor] = useState<number | null>(s?.perFloor && remembered ? Number(remembered) : null);
  const [room, setRoom] = useState<string | null>(null); const [shot, setShot] = useState<string | null>(null);
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api(`/homes/${homeId}/diary/photos/${mediaId}`, 'PATCH', { floorLevel: floor, roomKind: room, shotKey: shot, ...(note.trim() ? { caption: note.trim() } : {}) });
      if (floor != null) store.set(`tehvil-floor-${homeId}`, String(floor));
      onClose();
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  if (!s) return null;
  return <Modal open onClose={onClose} eyebrow={s.title} title="Foto əlavə edildi"
    footer={<div className="dy-sheet-foot"><button type="button" className="button button-secondary" onClick={onClose} data-testid="dy-tag-skip">Keç</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void save()} data-testid="dy-tag-save">{busy && <LoaderCircle size={15} className="spin" />}Saxla</button></div>}>
    <p className="dy-ok" data-testid="dy-saved"><CheckCircle2 size={18} />Foto “{s.title}” mərhələsinə saxlanıldı. İstəsəniz, aşağıdakıları da qeyd edin — məcburi deyil.</p>
    {s.shots.length > 0 && <Chips label="Nəyin şəklidir?" value={shot} set={setShot} items={s.shots.map((x) => [x.key, x.label])} testid="dy-tag-shot" />}
    {s.perFloor && <Chips label="Mərtəbə" value={floor == null ? null : String(floor)} set={(v) => setFloor(v == null ? null : Number(v))} items={FLOORS.map((f) => [String(f), floorLabel(f)])} testid="dy-tag-floor" />}
    {s.perRoom && <Chips label="Otaq" value={room} set={setRoom} items={ROOMS.map((r) => [r, ROOM_KIND[r]])} testid="dy-tag-room" />}
    <label className="field"><span>Qeyd</span><textarea className="hp-input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="məs. şimal divarı, naqil 2,5 mm" data-testid="dy-tag-note" /></label>
    {err && <p className="dy-error" role="alert">{err}</p>}
  </Modal>;
}

function Chips({ label, value, set, items, testid }: { label: string; value: string | null; set: (v: string | null) => void; items: [string, string][]; testid: string }) {
  return <div className="dy-chips" role="radiogroup" aria-label={label} data-testid={testid}><span>{label}</span>
    <div>{items.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => set(value === k ? null : k)} data-testid={`${testid}-${k}`}>{l}</button>)}</div></div>;
}

function PhotoView({ homeId, d, s, x, onClose, onChange }: { homeId: string; d: Diary; s: Stage; x: Photo; onClose: () => void; onChange: () => void }) {
  const p = d.permissions;
  const canTag = p.manage || x.mine;
  const [floor, setFloor] = useState<string | null>(x.floorLevel == null ? null : String(x.floorLevel));
  const [room, setRoom] = useState<string | null>(x.roomKind); const [shot, setShot] = useState<string | null>(x.shotKey);
  const [note, setNote] = useState(x.caption); const [stage, setStage] = useState(x.workId);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [confirmDel, setConfirmDel] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { await api(`/homes/${homeId}/diary/photos/${x.id}`, 'PATCH', { floorLevel: floor == null ? null : Number(floor), roomKind: room, shotKey: shot, caption: note, ...(stage !== x.workId ? { workId: stage } : {}) }); onChange(); }
    catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  const del = async () => { setBusy(true); setErr(''); try { await api(`/homes/${homeId}/diary/photos/${x.id}`, 'DELETE'); onChange(); } catch (e) { setErr(errorText(e)); setBusy(false); } };
  const shotLabel = s.shots.find((y) => y.key === x.shotKey)?.label;
  return <Modal open onClose={onClose} eyebrow={s.title} title="Foto"
    footer={canTag ? <div className="dy-sheet-foot">
      {p.deletePhotos && (confirmDel ? <button type="button" className="button button-danger" disabled={busy} onClick={() => void del()} data-testid="dy-delete-confirm"><Trash2 size={15} />Bəli, sil</button>
        : <button type="button" className="button button-quiet" onClick={() => setConfirmDel(true)} data-testid="dy-delete"><Trash2 size={15} />Sil</button>)}
      <button type="button" className="button button-primary" disabled={busy} onClick={() => void save()} data-testid="dy-photo-save">{busy && <LoaderCircle size={15} className="spin" />}Saxla</button></div> : undefined}>
    <div className="dy-view">
      {x.contentType.startsWith('video/') ? <video src={x.url} controls /> : <a href={x.url} target="_blank" rel="noopener noreferrer"><img src={x.url} alt={x.caption || s.title} /></a>}
      <dl className="dy-facts">
        <div><dt>Kim əlavə edib</dt><dd data-testid="dy-photo-by">{x.by}{x.viaLink ? ' · dəvət linki' : ''}</dd></div>
        <div><dt>Yüklənib</dt><dd>{when(x.createdAt)}</dd></div>
        {x.takenAt && <div><dt>Çəkilib</dt><dd>{when(x.takenAt)} <small>(cihazın məlumatı)</small></dd></div>}
        <div><dt>Məkan</dt><dd>{x.hasGps ? 'qeyd olunub' : 'qeyd olunmayıb'}</dd></div>
        {!canTag && <>{x.floorLevel != null && <div><dt>Mərtəbə</dt><dd>{floorLabel(x.floorLevel)}</dd></div>}{x.roomKind && <div><dt>Otaq</dt><dd>{ROOM_KIND[x.roomKind]}</dd></div>}{shotLabel && <div><dt>Nə</dt><dd>{shotLabel}</dd></div>}{x.caption && <div><dt>Qeyd</dt><dd>{x.caption}</dd></div>}</>}
      </dl>
      {canTag && <>
        {s.shots.length > 0 && <Chips label="Nəyin şəklidir?" value={shot} set={setShot} items={s.shots.map((y) => [y.key, y.label])} testid="dy-edit-shot" />}
        <Chips label="Mərtəbə" value={floor} set={setFloor} items={FLOORS.map((f) => [String(f), floorLabel(f)])} testid="dy-edit-floor" />
        <Chips label="Otaq" value={room} set={setRoom} items={ROOMS.map((r) => [r, ROOM_KIND[r]])} testid="dy-edit-room" />
        <label className="field"><span>Qeyd</span><textarea className="hp-input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {p.manage && <label className="field"><span>Mərhələ</span><select value={stage} onChange={(e) => setStage(e.target.value)} data-testid="dy-edit-stage">{d.stages.map((y) => <option key={y.id} value={y.id}>{y.title}</option>)}</select></label>}
      </>}
      {confirmDel && <p className="dy-error">Foto tarixçədən silinəcək. Bu əməliyyat jurnalda qeyd olunur.</p>}
      {err && <p className="dy-error" role="alert">{err}</p>}
    </div>
  </Modal>;
}

function AddStage({ homeId, d, onClose, onDone }: { homeId: string; d: Diary; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const have = new Set(d.stages.filter((s) => !s.hidden).map((s) => s.templateKey));
  const add = async (body: object, key: string) => { setBusy(key); setErr(''); try { await api(`/homes/${homeId}/diary/stages`, 'POST', body); onDone(); } catch (e) { setErr(errorText(e)); setBusy(''); } };
  const missingCore = d.templates.filter((t) => t.core && !have.has(t.key));
  return <Modal open onClose={onClose} title="Mərhələ əlavə et">
    <div className="dy-add">{d.templates.filter((t) => !have.has(t.key)).map((t) => <button key={t.key} type="button" className="dy-add-item" disabled={!!busy} onClick={() => void add({ templateKey: t.key }, t.key)} data-testid={`dy-add-${t.key}`}>
      <b>{t.title}</b><small>{t.hint}</small>{busy === t.key && <LoaderCircle size={14} className="spin" />}</button>)}</div>
    {missingCore.length === d.templates.filter((t) => t.core).length && <p className="dy-muted">Və ya bütün fərdi ev şablonunu bir dəfəyə əlavə edin — ana səhifədəki düymə ilə.</p>}
    <label className="field"><span>Öz mərhələniz</span><input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="məs. Hasar, Hovuz" data-testid="dy-own-title" /></label>
    <button type="button" className="button button-primary" disabled={!!busy || title.trim().length < 2} onClick={() => void add({ title: title.trim() }, 'own')} data-testid="dy-own-save">{busy === 'own' && <LoaderCircle size={14} className="spin" />}Əlavə et</button>
    {err && <p className="dy-error" role="alert">{err}</p>}
  </Modal>;
}

/** A no-account link for the whole construction diary; accounts (family, usta) are managed on the sharing page. */
function InviteSheet({ homeId, onClose }: { homeId: string; onClose: () => void }) {
  const [label, setLabel] = useState(''); const [days, setDays] = useState<'7' | '30' | 'none'>('30');
  const [link, setLink] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [copied, setCopied] = useState(false);
  const create = async () => {
    setBusy(true); setErr('');
    try { const r = await api<{ url: string }>(`/homes/${homeId}/photo-invites`, 'POST', { label: label.trim(), expiresInDays: days === 'none' ? null : Number(days) }); setLink(r.url); }
    catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const text = `Salam! Evin tikinti mərhələlərinin şəklini bu linkdən çəkib göndərin (hesab lazım deyil): ${link}`;
  return <Modal open onClose={onClose} title="Usta və ya ailə üzvünü dəvət et"
    footer={link ? <button type="button" className="button button-primary" onClick={onClose}>Hazırdır</button> : <button type="button" className="button button-primary" disabled={busy} onClick={() => void create()} data-testid="dy-invite-create">{busy && <LoaderCircle size={15} className="spin" />}Foto linki yarat</button>}>
    {link ? <div className="dy-invite-made" data-testid="dy-invite-made">
      <p>Linki ustaya göndərin. O, hesab yaratmadan mərhələni seçib şəkil çəkəcək. Evin ünvanını, xərcləri və başqa məlumatları görmür, heç nəyi silə və dəyişə bilmir.</p>
      <QrCode value={link} size={170} label="Foto linki" />
      <div className="dy-link" data-testid="dy-invite-url">{link}</div>
      <div className="dy-sheet-foot">
        <button type="button" className="button button-secondary" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); }}><Copy size={15} />{copied ? 'Kopyalandı' : 'Kopyala'}</button>
        <a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} />WhatsApp</a>
      </div>
    </div> : <>
      <p className="dy-muted">Hesabsız link: yalnız foto əlavə etmək olar — bütün tikinti mərhələlərinə. Linki istədiyiniz vaxt ləğv edə bilərsiniz.</p>
      <label className="field"><span>Kimə (yalnız sizə görünür)</span><input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="məs. Usta Rauf" data-testid="dy-invite-label" /></label>
      <label className="field"><span>Müddət</span><select value={days} onChange={(e) => setDays(e.target.value as never)}><option value="7">7 gün</option><option value="30">30 gün</option><option value="none">Müddətsiz</option></select></label>
      <p className="dy-muted">Hesabı olan usta və ya ailə üzvü üçün: <Link href={`/homes/${homeId}/sharing`}>Usta və ailəni dəvət et</Link> səhifəsi.</p>
    </>}
    {err && <p className="dy-error" role="alert">{err}</p>}
  </Modal>;
}

export function OtherInfoPage({ homeId, member, audit }: { homeId: string; member: boolean; audit: boolean }) {
  const items: [string, string, string][] = [
    ['/umumi', 'Ümumi məlumat', 'Evin pasportu: ünvan, sahə, otaq sayı, QR'],
    ['/tarixce', 'Mərhələlər — ətraflı siyahı', 'Sıralama, video, ustanın “tamamlandı” bildirişlərinin yoxlanışı, təhvil protokolu'],
    ['/foto-merheleler', 'Fotoları AI ilə təşkil et', 'AI hər foto üçün mərhələ təklif edir, siz təsdiqləyirsiniz'],
    ['/rooms', 'Otaqlar', 'Otaqlar və onların vəziyyəti'],
    ['/history', 'İşlər və təmir tarixçəsi', 'Görülən işlər, ustalar, zəmanət'],
    ['/map', 'Texniki məlumatlar', 'Gizli xətlərin xəritəsi: elektrik, su, qaz'],
    ['/equipment', 'Materiallar və avadanlıqlar', 'Kombi, kondisioner, materialların markası'],
    ...(member ? [['/maliyye', 'Maliyyə', 'Evin xərcləri'] as [string, string, string], ['/documents', 'Sənədlər', 'Müqavilə, çek, layihə (məxfi)'] as [string, string, string]] : []),
    ...(audit ? [['/audit', 'Dəyişikliklər jurnalı', 'Kim nəyi nə vaxt əlavə edib və ya silib'] as [string, string, string]] : []),
  ];
  return <div className="dy-page" data-testid="other-page">
    <header className="dy-head"><h1>Digər məlumatlar</h1><small>Evin bütün əvvəlki bölmələri burada qalır — heç nə silinməyib.</small></header>
    <ul className="dy-other-list">{items.map(([path, title, text]) => <li key={path}><Link href={`/homes/${homeId}${path}`} data-testid={`other-${path.slice(1)}`}><b>{title}</b><small>{text}</small></Link></li>)}</ul>
    <Link href={`/homes/${homeId}`} className="button button-secondary"><Camera size={15} />Tikinti tarixçəsinə qayıt</Link>
  </div>;
}

