import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, HelpCircle, Layers, LoaderCircle, Sparkles, Wand2, X } from 'lucide-react';
import { PageHeading } from '@/components/kit';
import { Empty, Pill, Skeleton } from '@/components/home/ui';
import { api, azDate, errorText, ROOM_KIND, stagesKey, useStageData, UTILITY, type StageData, type StagePhoto } from '@/lib/finance/api';
import './finance.css';
import './photo-stages.css';

/*
 * Photos grouped by construction stage. AI proposes a stage for every photo; people confirm or change it with one tap.
 * The AI suggestion and the person's decision are shown separately; AI never states a stage as a fact.
 */

const pct = (c: number | null) => (c == null ? '' : `${Math.round(c * 100)}%`);
const when = (p: StagePhoto) => p.takenAt ?? p.uploadedAt;

export function PhotoStagesPage({ homeId }: { homeId: string }) {
  const q = useStageData(homeId);
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [utility, setUtility] = useState<string>('');
  const [room, setRoom] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const d = q.data;
  const label = useMemo(() => new Map((d?.stages ?? []).map((s) => [s.key, s.label])), [d]);
  if (q.isLoading) return <Skeleton rows={4} />;
  if (q.isError || !d) return <Empty icon={<Layers size={28} />} title="Açılmadı" text={errorText(q.error)} />;
  const refresh = () => qc.invalidateQueries({ queryKey: stagesKey(homeId) });
  const analyze = async () => {
    setBusy(true); setMsg('');
    try { const r = await api<{ queued: number }>(`/homes/${homeId}/photo-stages/analyze`, 'POST', { retryFailed: true }); setMsg(r.queued ? `${r.queued} foto analiz növbəsinə alındı. Səhifəni bağlaya bilərsiniz — proses fonda davam edir.` : 'Analiz olunmamış foto yoxdur.'); await refresh(); }
    catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };
  const photos = d.photos.filter((p) => (!utility || p.utility === utility || p.aiUtilities.includes(utility)) && (!room || p.roomKind === room));
  const review = photos.filter((p) => p.needsReview);
  const byStage = new Map<string, StagePhoto[]>();
  for (const p of photos) {
    const k = p.stage ?? (p.stageStatus === 'none' || p.aiStatus === 'queued' || p.aiStatus === 'processing' ? '__pending' : '__unknown');
    byStage.set(k, [...(byStage.get(k) ?? []), p]);
  }
  for (const list of byStage.values()) list.sort((a, b) => when(a).localeCompare(when(b)));
  const pr = d.progress;
  const total = pr.queued + pr.done + pr.failed + pr.skipped + pr.notAnalysed;
  const usedUtilities = [...new Set(d.photos.flatMap((p) => [p.utility, ...p.aiUtilities]).filter((u): u is string => !!u))];
  const usedRooms = [...new Set(d.photos.map((p) => p.roomKind).filter((r): r is string => !!r))];
  const groups = [...d.stages.map((s) => s.key), '__unknown', '__pending'].filter((k) => byStage.get(k)?.length);
  return <div className="ps-page">
    <PageHeading eyebrow="Tikinti tarixçəsi" title="Fotolar mərhələlər üzrə" description="AI hər fotoda görünənə əsasən tikinti mərhələsini təklif edir. Siz bir toxunuşla təsdiqləyir və ya dəyişirsiniz. AI-nin təklifi ilə sizin qərarınız ayrıca saxlanılır." />
    <section className="ps-progress">
      {!d.aiConfigured ? <p className="fn-note"><HelpCircle size={14} />AI analizi hələ qoşulmayıb. Mərhələni hər foto üçün əl ilə seçə bilərsiniz.</p> : <>
        <div className="ps-prog-row">
          <span><b>{pr.done}</b> analiz olunub{pr.queued ? <> · <b>{pr.queued}</b> növbədə</> : null}{pr.failed ? <> · <b>{pr.failed}</b> alınmadı</> : null}{pr.notAnalysed ? <> · <b>{pr.notAnalysed}</b> hələ baxılmayıb</> : null}</span>
          {d.canAnalyze && <button className="button button-primary sm-btn-sm" onClick={analyze} disabled={busy || pr.queued > 0} data-testid="ps-analyze">{busy || pr.queued ? <LoaderCircle className="spin" size={14} /> : <Wand2 size={14} />}Fotoları mərhələlər üzrə təşkil et</button>}
        </div>
        {total > 0 && <div className="fn-bar" role="progressbar" aria-valuenow={pr.done} aria-valuemax={total}><span style={{ width: `${Math.round(((pr.done + pr.failed + pr.skipped) / total) * 100)}%` }} /></div>}
        {msg && <p className="fn-note" role="status">{msg}</p>}
      </>}
    </section>
    {(usedUtilities.length > 0 || usedRooms.length > 0) && <div className="ps-filters">
      {usedUtilities.map((u) => <button key={u} className={utility === u ? 'on' : ''} onClick={() => setUtility(utility === u ? '' : u)}>{UTILITY[u] ?? u}</button>)}
      {usedRooms.map((r) => <button key={r} className={room === r ? 'on' : ''} onClick={() => setRoom(room === r ? '' : r)}>{ROOM_KIND[r] ?? r}</button>)}
    </div>}
    {review.length > 0 && <section className="ps-review" aria-label="Mərhələni təsdiqləyin">
      <h3><Sparkles size={16} />Mərhələni təsdiqlə ({review.length})</h3>
      <div className="ps-review-list">{review.slice(0, 12).map((p) => <PhotoCard key={p.mediaId} p={p} d={d} homeId={homeId} label={label} onDone={refresh} />)}</div>
    </section>}
    {!photos.length ? <Empty icon={<Layers size={28} />} title="Foto yoxdur" text="Tikinti tarixçəsində foto çəkin — AI mərhələni avtomatik təklif edəcək." />
      : <ul className="ps-stages">{groups.map((k) => {
        const list = byStage.get(k)!;
        const name = k === '__unknown' ? 'Müəyyən edilməyib' : k === '__pending' ? 'Analiz gözləyir' : label.get(k) ?? k;
        return <li key={k} className={`ps-stage ${open === k ? 'open' : ''}`}>
          <button className="ps-stage-head" onClick={() => setOpen(open === k ? null : k)} data-testid="ps-stage">
            <span className="ps-cover">{list[list.length - 1] && <img src={list[list.length - 1].url} alt="" loading="lazy" />}</span>
            <span className="ps-stage-text"><b>{name}</b><small>{list.length} foto · {azDate(when(list[0]))}{list.length > 1 ? ` – ${azDate(when(list[list.length - 1]))}` : ''}</small></span>
            <ChevronRight size={18} className="ps-chev" />
          </button>
          {open === k && <div className="ps-grid">{list.map((p) => <PhotoCard key={p.mediaId} p={p} d={d} homeId={homeId} label={label} onDone={refresh} compact />)}</div>}
        </li>;
      })}</ul>}
    <p className="fn-note"><HelpCircle size={14} />AI yalnız fotoda görünəni qiymətləndirir: çəkilmə tarixini, işin keyfiyyətini və ya texniki uyğunluğu müəyyən etmir. Düzəlişləriniz keyfiyyəti ölçmək üçün saxlanılır; model onlardan avtomatik öyrədilmir.</p>
  </div>;
}

function StatusBadge({ p, label }: { p: StagePhoto; label: Map<string, string> }) {
  if (p.aiStatus === 'queued' || p.aiStatus === 'processing') return <Pill small tone="info"><LoaderCircle className="spin" size={11} />Analiz olunur</Pill>;
  if (p.stageStatus === 'confirmed') return <Pill small tone="ok"><Check size={11} />Təsdiqlənib</Pill>;
  if (p.stageStatus === 'changed') return <Pill small tone="ok" title={p.aiStage ? `AI təklifi: ${label.get(p.aiStage)}` : undefined}>Siz dəyişmisiniz</Pill>;
  if (p.stageStatus === 'undetermined') return <Pill small tone="neutral">Müəyyən edilməyib</Pill>;
  if (p.stageStatus === 'ai_suggested') return <Pill small tone={p.needsReview ? 'warn' : 'ai'}><Sparkles size={11} />AI təklifi · {pct(p.aiConfidence)}</Pill>;
  return <Pill small tone="neutral">{p.aiStatus === 'failed' ? 'Analiz alınmadı' : 'Baxılmayıb'}</Pill>;
}

function PhotoCard({ p, d, homeId, label, onDone, compact }: { p: StagePhoto; d: StageData; homeId: string; label: Map<string, string>; onDone: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(false);
  const send = async (body: object) => { setBusy(true); setErr(''); try { await api(`/homes/${homeId}/photo-stages/${p.mediaId}`, 'POST', body); onDone(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  return <figure className={`ps-photo ${compact ? 'compact' : ''}`} data-testid="ps-photo">
    <button className="ps-img" onClick={() => setZoom(true)} aria-label="Böyüt"><img src={p.url} alt={p.caption || 'Foto'} loading="lazy" /></button>
    <figcaption>
      <StatusBadge p={p} label={label} />
      {p.stage && <b className="ps-stage-name">{label.get(p.stage)}</b>}
      {p.aiStage && p.stageStatus === 'changed' && <small>AI təklifi: {label.get(p.aiStage)}</small>}
      {p.aiEvidence && (p.stageStatus === 'ai_suggested' || !compact) && <small className="ps-evidence">{p.aiEvidence}</small>}
      {(p.utility || p.roomKind) && <small>{[p.utility && UTILITY[p.utility], p.roomKind && ROOM_KIND[p.roomKind]].filter(Boolean).join(' · ')}</small>}
      <small>{p.takenAt ? `Çəkilib: ${azDate(p.takenAt)}` : 'Çəkilmə tarixi məlum deyil'} · yüklənib {azDate(p.uploadedAt)}</small>
      {d.canEdit && <div className="ps-actions">
        {p.stageStatus === 'ai_suggested' && p.aiStage && <button className="button button-primary sm-btn-sm" disabled={busy} onClick={() => void send({ action: 'confirm' })} data-testid="ps-confirm"><Check size={13} />Təsdiqlə</button>}
        <select aria-label="Mərhələni seç" value="" disabled={busy} onChange={(e) => { if (e.target.value === '__none') void send({ action: 'undetermined' }); else if (e.target.value) void send({ action: 'set', stage: e.target.value }); }} data-testid="ps-set">
          <option value="">{p.stage ? 'Dəyiş…' : 'Mərhələ seç…'}</option>
          {d.stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          <option value="__none">Müəyyən edilməyib</option>
        </select>
      </div>}
      {err && <small className="form-error">{err}</small>}
    </figcaption>
    {zoom && <div className="hp-lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(false)}><button type="button" className="icon-button" aria-label="Bağla"><X size={20} /></button><img src={p.url} alt="" /></div>}
  </figure>;
}
