import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, Check, CheckCircle2, FileUp, Info, LoaderCircle, Pencil, Ruler, Upload, X } from 'lucide-react';
import { Button } from '@/components/kit';
import { TAKEOFF_STEPS, analyzeDrawing } from '@/lib/smeta/ai';
import { quantityFromMeasurements } from '@/lib/smeta/calc';
import { dateAz, num, parseNumber, qty } from '@/lib/smeta/format';
import { smeta } from '@/lib/smeta/store';
import type { Drawing, Measurement, Project } from '@/lib/smeta/types';
import { ConfidenceChip, toast } from './ui';

const S = 70;
const PAD = 48;

export function FloorPlan({ drawing, measurements, selectedRoom, onSelect }: { drawing: Drawing; measurements: Measurement[]; selectedRoom: string | null; onSelect: (roomId: string) => void }) {
  const W = drawing.width * S + PAD * 2;
  const H = drawing.height * S + PAD * 2;
  const X = (m: number) => PAD + m * S;
  const Y = (m: number) => PAD + m * S;
  const byRoom = new Map(measurements.filter(m => m.roomId).map(m => [m.roomId!, m]));
  const topRooms = drawing.rooms.filter(r => r.y === 0).sort((a, b) => a.x - b.x);
  const leftRooms = drawing.rooms.filter(r => r.x === 0).sort((a, b) => a.y - b.y);
  const onKey = (e: KeyboardEvent, id: string) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); } };

  return <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Mənzil planı, ${drawing.rooms.length} otaq. Otağı seçmək üçün üzərinə klikləyin.`}>
    <defs>
      <pattern id="sm-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="rgba(221,200,153,.05)" /><line x1="0" y1="0" x2="0" y2="9" stroke="rgba(221,200,153,.32)" strokeWidth="2" /></pattern>
    </defs>

    {drawing.rooms.map(r => {
      const m = byRoom.get(r.id);
      const review = m?.status === 'suggested' && m.confidence < 0.8;
      return <rect key={r.id} className={`room ${selectedRoom === r.id ? 'selected' : ''} ${review ? 'review' : ''}`} x={X(r.x)} y={Y(r.y)} width={r.w * S} height={r.h * S}
        tabIndex={0} role="button" aria-pressed={selectedRoom === r.id} aria-label={`${r.name}${m ? `, ${qty(m.value)} m²` : ''}${review ? ', yoxlanmalıdır' : ''}`}
        onClick={() => onSelect(r.id)} onKeyDown={e => onKey(e, r.id)} />;
    })}

    {drawing.rooms.map(r => <rect key={`w-${r.id}`} className="wall" x={X(r.x)} y={Y(r.y)} width={r.w * S} height={r.h * S} strokeWidth={3} pointerEvents="none" />)}
    <rect className="wall" x={X(0)} y={Y(0)} width={drawing.width * S} height={drawing.height * S} strokeWidth={7} pointerEvents="none" />

    {drawing.openings.map(o => {
      const x1 = X(o.x1), y1 = Y(o.y1), x2 = X(o.x2), y2 = Y(o.y2);
      if (o.kind === 'window') return <g key={o.id} pointerEvents="none"><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#24483f" strokeWidth={9} /><line className="window" x1={x1} y1={y1} x2={x2} y2={y2} /></g>;
      const r = Math.hypot(x2 - x1, y2 - y1);
      const horizontal = y1 === y2;
      const swing = horizontal ? `M${x1},${y1} L${x1},${y1 - r} A${r},${r} 0 0 1 ${x2},${y2}` : `M${x1},${y1} L${x1 + r},${y1} A${r},${r} 0 0 1 ${x2},${y2}`;
      return <g key={o.id} pointerEvents="none"><line className="door" x1={x1} y1={y1} x2={x2} y2={y2} /><path className="door-swing" d={swing} /></g>;
    })}

    {drawing.rooms.map(r => {
      const m = byRoom.get(r.id);
      const sel = selectedRoom === r.id;
      const cx = X(r.x + r.w / 2), cy = Y(r.y + r.h / 2);
      const small = r.w < 2.6;
      return <g key={`l-${r.id}`}>
        <text className={`label ${sel ? 'sel' : ''}`} x={cx} y={cy - 4} textAnchor="middle" style={small ? { fontSize: 12 } : undefined}>{r.name.replace(' otağı', '')}</text>
        {m && <text className={`label area ${sel ? 'sel' : ''}`} x={cx} y={cy + 15} textAnchor="middle">{m.status === 'suggested' && m.confidence < 0.8 ? '≈ ' : ''}{qty(m.value)} m²</text>}
      </g>;
    })}

    <g pointerEvents="none">
      <line className="dim" x1={X(0)} y1={PAD - 26} x2={X(drawing.width)} y2={PAD - 26} />
      {[0, ...topRooms.map(r => r.x + r.w)].map(x => <line key={`tt-${x}`} className="dim" x1={X(x)} y1={PAD - 31} x2={X(x)} y2={PAD - 21} />)}
      {topRooms.map(r => <text key={`td-${r.id}`} className="dim-text" x={X(r.x + r.w / 2)} y={PAD - 32} textAnchor="middle">{num(r.w, 2)}</text>)}
      <line className="dim" x1={PAD - 26} y1={Y(0)} x2={PAD - 26} y2={Y(drawing.height)} />
      {[0, ...leftRooms.map(r => r.y + r.h)].map(y => <line key={`lt-${y}`} className="dim" x1={PAD - 31} y1={Y(y)} x2={PAD - 21} y2={Y(y)} />)}
      {leftRooms.map(r => <text key={`ld-${r.id}`} className="dim-text" x={PAD - 32} y={Y(r.y + r.h / 2)} textAnchor="middle" transform={`rotate(-90 ${PAD - 32} ${Y(r.y + r.h / 2)})`}>{num(r.h, 2)}</text>)}
      <text className="dim-text" x={X(drawing.width)} y={H - 16} textAnchor="end">{num(drawing.width, 2)} × {num(drawing.height, 2)} m · {drawing.scale}</text>
    </g>
  </svg>;
}

const GROUPS: { title: string; test: (m: Measurement) => boolean }[] = [
  { title: 'Otaqlar', test: m => m.kind === 'area' && !!m.roomId },
  { title: 'Divarlar, uzunluq və hündürlük', test: m => (m.kind === 'area' && !m.roomId) || m.kind === 'length' || m.kind === 'height' },
  { title: 'Qapı və pəncərələr', test: m => m.kind === 'count' },
];

export function TakeoffTab({ project: p }: { project: Project }) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedM, setSelectedM] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pending = p.measurements.filter(m => m.status === 'suggested');
  const preview = useMemo(() => {
    const values = new Map(p.measurements.filter(m => m.status !== 'suggested').map(m => [m.id, m.value]));
    return p.estimate.sections.flatMap(s => s.items).filter(it => { const q = quantityFromMeasurements(it, values); return q !== null && q !== it.quantity; }).length;
  }, [p.measurements, p.estimate]);
  const roomArea = p.measurements.filter(m => m.kind === 'area' && m.roomId).reduce((s, m) => s + m.value, 0);

  const selectRoom = (roomId: string) => {
    setSelectedRoom(roomId);
    const m = p.measurements.find(x => x.roomId === roomId);
    if (m) { setSelectedM(m.id); requestAnimationFrame(() => listRef.current?.querySelector(`[data-mid="${m.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }
  };
  const selectMeasurement = (m: Measurement) => { setSelectedM(m.id); setSelectedRoom(m.roomId ?? null); };
  const apply = () => {
    const n = smeta.applyMeasurements(p.id);
    toast(n ? `${n} smeta sətrinin miqdarı yeniləndi` : 'Smeta artıq təsdiqlənmiş ölçülərə uyğundur');
  };

  return <div className="sm-takeoff">
    <div>
      {p.drawing ? <div className="sm-plan-card">
        <div className="sm-plan-top"><span><i />{p.drawing.fileName.toUpperCase()}</span><span>AI ANALİZİ · {dateAz(p.drawing.uploadedAt).toUpperCase()}</span></div>
        <div className="sm-plan"><FloorPlan drawing={p.drawing} measurements={p.measurements} selectedRoom={selectedRoom} onSelect={selectRoom} /></div>
        <div className="sm-plan-legend">
          <span>{p.drawing.rooms.length} otaq · {qty(roomArea)} m²</span>
          <span><i style={{ background: '#d9c69b' }} />{p.drawing.openings.filter(o => o.kind === 'door').length} qapı</span>
          <span><i style={{ background: '#9ec4d0' }} />{p.drawing.openings.filter(o => o.kind === 'window').length} pəncərə</span>
          <span><i style={{ background: 'repeating-linear-gradient(90deg,#c9a76f 0 3px,transparent 3px 5px)' }} />Ştrixli zona — ölçü yoxlanmalıdır</span>
        </div>
      </div> : <div className="surface sm-empty" style={{ marginTop: 0 }}><div className="empty-illustration"><Ruler size={28} /></div><h3>Bu layihə üçün çertyoj yüklənməyib</h3><p>Ölçülər əl ilə daxil edilib. Çertyoj yükləsəniz, AI otaqları və əsas ölçüləri ilkin təklif kimi aşkar edəcək.</p></div>}
      <DrawingUpload project={p} />
    </div>

    <div className="surface sm-measure-panel" ref={listRef}>
      <div className="eyebrow">AI takeoff</div>
      <h2>AI tərəfindən aşkar edilən ölçülər</h2>
      <p className="sm-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>{p.measurements.length} ölçü · {pending.length ? `${pending.length} ölçü yoxlanmalıdır` : 'hamısı yoxlanılıb'}</p>
      <div className="sm-ai-notice" role="note"><AlertTriangle size={15} aria-hidden /><span>AI ölçüləri ilkin təklif kimi yaradıb. Smetaya əlavə etməzdən əvvəl yoxlayın.</span></div>
      {GROUPS.map(g => {
        const list = p.measurements.filter(g.test);
        if (!list.length) return null;
        return <div className="sm-measure-group" key={g.title}><span className="eyebrow">{g.title}</span>{list.map(m => <MeasurementRow key={m.id} p={p} m={m} selected={selectedM === m.id} onSelect={() => selectMeasurement(m)} />)}</div>;
      })}
      <div className="sm-measure-apply">
        <p>{preview ? <><b style={{ color: '#f2e8c9' }}>{preview} smeta sətri</b> təsdiqlənmiş ölçülərə əsasən yenilənəcək.</> : 'Smeta təsdiqlənmiş ölçülərə uyğundur.'}{pending.length ? ` Yoxlanmamış ${pending.length} ölçü tətbiq olunmayacaq.` : ''} Əl ilə dəyişdirilmiş miqdarlara toxunulmur.</p>
        <Button onClick={apply} disabled={!preview} testId="button-apply-measurements"><CheckCircle2 size={16} />Ölçüləri smetaya tətbiq et</Button>
      </div>
    </div>
  </div>;
}

function MeasurementRow({ p, m, selected, onSelect }: { p: Project; m: Measurement; selected: boolean; onSelect: () => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const parsed = edit === null ? null : parseNumber(edit);
  const valid = parsed !== null && parsed > 0;
  const save = () => {
    if (!valid) return;
    smeta.updateMeasurement(p.id, m.id, { value: parsed!, status: 'edited' });
    setEdit(null);
    toast(`${m.name}: ${qty(parsed!)} ${m.unit} kimi düzəldildi`);
  };
  const statusText = m.status === 'approved' ? 'Təsdiqlənib' : m.status === 'edited' ? 'Əl ilə düzəldilib' : `AI təklifi · ${Math.round(m.confidence * 100)}%`;
  return <div className={`sm-measure ${selected ? 'selected' : ''}`} data-mid={m.id} onClick={onSelect}>
    <button type="button" className="sm-measure-name" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onSelect(); }} aria-pressed={selected}>{m.name}{m.status === 'suggested' && <ConfidenceChip confidence={m.confidence} />}</button>
    <div className="sm-measure-value">{edit !== null
      ? <input autoFocus aria-label={`${m.name}, yeni dəyər (${m.unit})`} aria-invalid={!valid || undefined} value={edit} onClick={e => e.stopPropagation()} onChange={e => setEdit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }} />
      : <span className="num">{qty(m.value)} {m.unit}</span>}</div>
    <div className="sm-measure-src"><Info size={11} aria-hidden className="sm-ii" style={{ marginRight: 4 }} />{m.source}</div>
    <div className="sm-measure-foot" onClick={e => e.stopPropagation()}>
      <span style={{ fontSize: 12, fontWeight: 700, color: m.status === 'suggested' ? '#8a6a35' : '#3d725a' }}>{m.status !== 'suggested' && <Check size={12} aria-hidden className="sm-ii" style={{ marginRight: 3 }} />}{statusText}</span>
      <span className="sm-spacer" />
      {edit !== null ? <>
        <Button variant="secondary" onClick={() => setEdit(null)}><X size={13} />Ləğv et</Button>
        <Button onClick={save} disabled={!valid}><Check size={13} />Yadda saxla</Button>
      </> : <>
        <button type="button" className="button button-secondary" onClick={() => setEdit(String(m.value).replace('.', ','))} aria-label={`${m.name} ölçüsünü düzəlt`}><Pencil size={13} />Düzəlt</button>
        {m.status !== 'approved' && <button type="button" className="button button-primary" onClick={() => { smeta.updateMeasurement(p.id, m.id, { status: 'approved' }); toast(`${m.name} təsdiqləndi`); }} aria-label={`${m.name} ölçüsünü təsdiqlə`}><Check size={13} />Təsdiqlə</button>}
      </>}
    </div>
  </div>;
}

function DrawingUpload({ project: p }: { project: Project }) {
  const [step, setStep] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const run = async (file: File) => {
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) { toast('Yalnız PDF, JPG və ya PNG faylı yükləyin'); return; }
    setStep(0);
    try {
      const { drawing, measurements } = await analyzeDrawing(file, setStep);
      smeta.attachDrawing(p.id, drawing, measurements);
      toast('Çertyoj analiz edildi — ölçüləri yoxlayın');
    } finally { setStep(null); }
  };
  if (step !== null) return <div className="surface" style={{ marginTop: 12, padding: 16 }} aria-live="polite">
    <strong style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2f4d42' }}><LoaderCircle size={16} className="spin" />AI çertyoju analiz edir…</strong>
    <div className="sm-steps-list">{TAKEOFF_STEPS.map((s, i) => <div key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>{i < step ? <CheckCircle2 size={15} /> : i === step ? <LoaderCircle size={15} className="spin" /> : <span style={{ width: 15 }} />}{s}</div>)}</div>
  </div>;
  return <label className={`sm-drop ${drag ? 'dragging' : ''}`} style={{ minHeight: p.drawing ? 120 : 200 }} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void run(f); }}>
    <input type="file" accept=".pdf,.png,.jpg,.jpeg" aria-label="Çertyoj faylı seçin" onChange={e => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = ''; }} />
    {p.drawing ? <><FileUp size={20} color="#3b5d50" aria-hidden /><strong>Yeni versiya yüklə</strong><span>PDF, JPG və ya PNG — yeni ölçülər yenidən yoxlanılmalı olacaq</span></>
      : <><span className="sm-drop-icon"><Upload size={22} /></span><strong>PDF, JPG və ya PNG yükləyin</strong><span>AI çertyojdakı otaqları və əsas ölçüləri təklif edəcək</span><small><AlertTriangle size={12} />Son nəticəni təsdiqləməzdən əvvəl mütləq yoxlayın</small></>}
  </label>;
}
