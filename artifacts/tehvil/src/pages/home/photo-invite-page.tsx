import { useEffect, useRef, useState } from 'react';
import { Camera, Check, CheckCircle2, ImagePlus, LoaderCircle, MapPin, PlayCircle, RotateCcw, WifiOff } from 'lucide-react';
import { addInvitePhoto, requestInviteUploadUrl, setInviteStageStatus, useGetPhotoInvite, type PhotoInvitePreview } from '@workspace/api-client-react';
import { PhotoError, photoMeta, preparePhoto } from '@/lib/protocol/model';
import { floorLabel, FLOORS } from '@/lib/home/floors';
import { ROOM_KIND } from '@/lib/finance/api';
import './stages.css';
import './diary.css';

type LinkStage = { id: string; title: string; status?: string; hint: string | null; shots: { key: string; label: string }[]; perFloor: boolean; perRoom: boolean };
type Preview = PhotoInvitePreview & { scope?: 'stage' | 'home'; stage?: LinkStage; stages?: LinkStage[]; currentWorkId?: string | null };
const ROOMS = ['living', 'bedroom', 'kitchen', 'bathroom', 'toilet', 'hall', 'balcony', 'utility', 'exterior', 'other'];

const STATUS: Record<string, string> = { planned: 'Başlanmayıb', in_progress: 'Davam edir', completed: 'Yoxlanış gözləyir', revision: 'Düzəliş tələb olunur', confirmed: 'Qəbul edilib' };
const errText = (e: unknown, fallback: string) => {
  if (e instanceof PhotoError) return e.message;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'İnternet bağlantısı yoxdur. Bağlantı bərpa olunanda “Yüklə” düyməsinə yenidən basın.';
  return (e as { data?: { error?: string } })?.data?.error ?? fallback;
};
function devicePosition(): Promise<{ lat: number; lon: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 7000);
    navigator.geolocation.getCurrentPosition((p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); }, () => { clearTimeout(t); resolve(null); }, { maximumAge: 60_000, timeout: 6500 });
  });
}

/**
 * The page behind a photo invitation link: no account, no menus, no choosing a home or stage — the link knows both.
 * Foto çək → look at it → Yenidən çək or Yüklə. Success is shown only after the server saved the photo.
 */
export function PhotoInvitePage({ token }: { token: string }) {
  const q = useGetPhotoInvite(token, { query: { queryKey: [`/api/photo-invites/${token}`], retry: false } });
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ f: File; url: string; camera: boolean } | null>(null);
  const [note, setNote] = useState(''); const [showNote, setShowNote] = useState(false);
  const [gps, setGps] = useState(false);
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle'); const [err, setErr] = useState('');
  const [info, setInfo] = useState<Preview | null>(null); const [count, setCount] = useState(0);
  const [stageId, setStageId] = useState<string>('');
  const [floor, setFloor] = useState<number | null>(null); const [room, setRoom] = useState<string | null>(null); const [shot, setShot] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  // One upload per picked photo: a retry or a double tap reuses the same server upload.
  const pending = useRef<{ objectPath: string; originalName: string; contentType: string; size: number } | null>(null);
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);
  useEffect(() => { if (q.data) { const p = q.data as Preview; setInfo(p); if (p.scope === 'home' && !stageId) setStageId(p.currentWorkId && p.stages?.some((x) => x.id === p.currentWorkId) ? p.currentWorkId : ''); } }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <div className="fi-page"><LoaderCircle className="spin" size={28} /></div>;
  if (!q.data || !info) return <div className="fi-page" data-testid="fi-invalid"><div className="fi-card"><h1>Link işləmir</h1><p>Link etibarsızdır, müddəti bitib və ya ev sahibi onu ləğv edib. Ev sahibindən yeni link istəyin.</p></div></div>;
  const full = info.remaining === 0;
  const homeLink = info.scope === 'home';
  const stage: LinkStage | undefined = homeLink ? info.stages?.find((x) => x.id === stageId) : info.stage;
  const pick = (list: FileList | null, camera: boolean) => {
    const f = list?.[0]; if (!f) return;
    if (file) URL.revokeObjectURL(file.url);
    pending.current = null; setErr(''); setState('idle');
    setFile({ f, url: URL.createObjectURL(f), camera });
  };
  const upload = async () => {
    if (!file || state === 'uploading') return;
    setState('uploading'); setErr('');
    try {
      const meta = await photoMeta(file.f);
      const prepared = await preparePhoto(file.f);
      if (!pending.current) {
        const u = await requestInviteUploadUrl(token, { name: prepared.name, size: prepared.size, contentType: prepared.type });
        const put = await fetch(u.uploadURL, { method: 'PUT', headers: { 'Content-Type': prepared.type }, body: prepared }).catch(() => null);
        if (!put?.ok) throw new PhotoError(navigator.onLine ? 'Foto yüklənmədi. Yenidən cəhd edin.' : 'İnternet bağlantısı yoxdur. Bağlantı bərpa olunanda yenidən cəhd edin.');
        pending.current = { objectPath: u.objectPath, originalName: prepared.name, contentType: prepared.type, size: prepared.size };
      }
      // Location only if the person ticked it — not even the photo's own GPS otherwise.
      const location = gps ? (meta.gps ? { gps: meta.gps, gpsSource: 'exif' } : await devicePosition().then((p) => (p ? { gps: p, gpsSource: 'device' } : null))) : null;
      const takenAt = meta.takenAt ?? (file.camera ? new Date().toISOString() : null);
      const tags = { ...(homeLink ? { workId: stageId } : {}), ...(floor != null ? { floorLevel: floor } : {}), ...(room ? { roomKind: room } : {}), ...(shot ? { shotKey: shot } : {}) };
      const r = await addInvitePhoto(token, { file: pending.current, note: note.trim(), ...(takenAt ? { takenAt, takenSource: meta.takenAt ? 'exif' : 'camera' } : {}), ...(location ? { clientMeta: location } : {}), ...tags } as never);
      setCount((c) => c + (r.duplicate ? 0 : 1));
      setInfo({ ...info, uploadCount: r.uploadCount, remaining: info.remaining == null ? null : Math.max(0, info.remaining - (r.duplicate ? 0 : 1)) });
      setState('done'); URL.revokeObjectURL(file.url); setFile(null); setNote(''); setShowNote(false); setShot(null); pending.current = null;
    } catch (e) { setState('error'); setErr(errText(e, 'Foto yüklənmədi. Yenidən cəhd edin.')); }
  };
  const setStatus = async (action: 'start' | 'complete') => {
    setStatusBusy(true); setErr('');
    try { setInfo(await setInviteStageStatus(token, { action })); } catch (e) { setErr(errText(e, 'Status dəyişmədi.')); } finally { setStatusBusy(false); }
  };

  return <div className="fi-page" data-testid="fi-page">
    <div className="fi-brand"><img src="/favicon.svg" alt="" width={22} height={22} />Tehvil.az</div>
    <div className="fi-card">
      <small className="fi-home" data-testid="fi-home">{info.homeName}</small>
      {homeLink ? <>
        <h1 data-testid="fi-stage">Tikinti tarixçəsi</h1>
        <label className="field"><span>Hansı mərhələnin şəklini çəkirsiniz?</span>
          <select value={stageId} onChange={(e) => { setStageId(e.target.value); setShot(null); }} data-testid="fi-stage-select"><option value="">— mərhələni seçin —</option>{info.stages?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
      </> : <>
        <h1 data-testid="fi-stage">{info.stageTitle} mərhələsi</h1>
        <span className="fi-status">{STATUS[info.stageStatus] ?? info.stageStatus}</span>
      </>}
      {stage?.hint && <p className="fi-hint">{stage.hint}</p>}

      {state === 'done' && !file && <div className="fi-ok" role="status" data-testid="fi-success"><CheckCircle2 size={22} /><b>Foto uğurla əlavə edildi.</b>{count > 1 && <small>Bu səhifədən {count} foto göndərdiniz.</small>}</div>}

      {!file ? <>
        {full ? <p className="fi-err">Bu link üçün foto limiti dolub. Ev sahibindən yeni link istəyin.</p> : homeLink && !stageId ? <p className="fi-hint" data-testid="fi-pick-stage">Əvvəlcə yuxarıdan mərhələni seçin.</p> : <div className="fi-btns">
          <button type="button" className="button button-primary fi-big" onClick={() => cam.current?.click()} data-testid="fi-camera"><Camera size={22} />{state === 'done' ? 'Daha bir foto çək' : 'Foto çək'}</button>
          <button type="button" className="button button-secondary fi-big" onClick={() => gal.current?.click()} data-testid="fi-gallery"><ImagePlus size={20} />Şəkil yüklə</button>
        </div>}
      </> : <div className="fi-preview" data-testid="fi-preview">
        <img src={file.url} alt="Önbaxış" />
        {showNote ? <label className="field"><span>Qeyd (istəyə bağlı)</span><textarea className="hp-input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="məs. şimal divarı, armatur 12 mm" data-testid="fi-note" /></label>
          : <button type="button" className="sm-link-btn" onClick={() => setShowNote(true)} data-testid="fi-add-note">+ Qeyd əlavə et — istəyə bağlı</button>}
        {stage && stage.shots.length > 0 && <TagChips label="Nəyin şəklidir? (istəyə bağlı)" value={shot} set={setShot} items={stage.shots.map((x) => [x.key, x.label])} testid="fi-shot" />}
        {stage?.perFloor && <TagChips label="Mərtəbə (istəyə bağlı)" value={floor == null ? null : String(floor)} set={(v) => setFloor(v == null ? null : Number(v))} items={FLOORS.map((f) => [String(f), floorLabel(f)])} testid="fi-floor" />}
        {stage?.perRoom && <TagChips label="Otaq (istəyə bağlı)" value={room} set={setRoom} items={ROOMS.map((r) => [r, ROOM_KIND[r]])} testid="fi-room" />}
        <label className="fi-gps"><input type="checkbox" checked={gps} onChange={(e) => setGps(e.target.checked)} data-testid="fi-gps" /><MapPin size={14} />Məkanı əlavə et (istəyə bağlı)</label>
        <div className="fi-btns two">
          <button type="button" className="button button-secondary fi-big" disabled={state === 'uploading'} onClick={() => (file.camera ? cam : gal).current?.click()} data-testid="fi-retake"><RotateCcw size={18} />{file.camera ? 'Yenidən çək' : 'Başqasını seç'}</button>
          <button type="button" className="button button-primary fi-big" disabled={state === 'uploading'} onClick={() => void upload()} data-testid="fi-upload">{state === 'uploading' ? <><LoaderCircle size={18} className="spin" />Yüklənir…</> : <><Check size={18} />Yüklə</>}</button>
        </div>
      </div>}
      {err && <p className="fi-err" role="alert" data-testid="fi-error">{!navigator.onLine && <WifiOff size={14} />}{err}</p>}

      {!homeLink && info.permission === 'photos_status' && <div className="fi-status-box" data-testid="fi-status-box">
        <b>Mərhələnin vəziyyəti</b>
        <div className="fi-btns two">
          <button type="button" className="button button-secondary" disabled={statusBusy || !['planned', 'revision'].includes(info.stageStatus)} onClick={() => void setStatus('start')} data-testid="fi-start"><PlayCircle size={16} />Başladı</button>
          <button type="button" className="button button-secondary" disabled={statusBusy || !['planned', 'in_progress', 'revision'].includes(info.stageStatus)} onClick={() => void setStatus('complete')} data-testid="fi-complete"><CheckCircle2 size={16} />Tamamlandı</button>
        </div>
        <small>“Tamamlandı” mərhələni ev sahibinin yoxlanışına göndərir. Qəbul qərarını yalnız ev sahibi verir.</small>
      </div>}

      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files, true); e.target.value = ''; }} data-testid="fi-camera-input" />
      <input ref={gal} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files, false); e.target.value = ''; }} data-testid="fi-gallery-input" />
    </div>
    <p className="fi-legal">Hesab lazım deyil. Foto yalnız bu evin {homeLink ? 'seçdiyiniz' : 'bu'} mərhələsinə əlavə olunur; başqa məlumat görünmür, heç nəyi silmək və dəyişmək olmur. Yüklənmə vaxtını server qeyd edir. Kamera açılmırsa, “Şəkil yüklə” ilə qalereyadan seçin.</p>
  </div>;
}

function TagChips({ label, value, set, items, testid }: { label: string; value: string | null; set: (v: string | null) => void; items: [string, string][]; testid: string }) {
  return <div className="dy-chips" role="radiogroup" aria-label={label} data-testid={testid}><span>{label}</span>
    <div>{items.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => set(value === k ? null : k)} data-testid={`${testid}-${k}`}>{l}</button>)}</div></div>;
}
