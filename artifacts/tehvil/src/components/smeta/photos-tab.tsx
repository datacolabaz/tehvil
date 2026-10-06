import { useMemo, useState } from 'react';
import { CalendarDays, Camera, ClipboardList, Eye, EyeOff, ImagePlus, MapPin, UserRound } from 'lucide-react';
import { Button } from '@/components/kit';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/smeta/catalog';
import { dateAz, todayISO } from '@/lib/smeta/format';
import { smeta } from '@/lib/smeta/store';
import type { PhotoEvidence, PhotoPhase, Project, WorkCategory } from '@/lib/smeta/types';
import { Modal, Pill, toast } from './ui';

export const PHASE_LABEL: Record<PhotoPhase, string> = { before: 'Əvvəl', during: 'İş zamanı', after: 'Sonra' };
const PHASE_TONE = { before: 'neutral', during: 'warn', after: 'ok' } as const;
type GroupBy = 'phase' | 'room' | 'date' | 'category';
const GROUP_LABEL: Record<GroupBy, string> = { phase: 'Mərhələ', room: 'Otaq', date: 'Tarix', category: 'İş paketi' };

export function PhotosTab({ project: p }: { project: Project }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('phase');
  const [phase, setPhase] = useState<PhotoPhase | 'all'>('all');
  const [visible, setVisible] = useState<'all' | 'client' | 'hidden'>('all');
  const [open, setOpen] = useState(false);
  const items = p.estimate.sections.flatMap(s => s.items);

  const groups = useMemo(() => {
    const list = p.photos.filter(ph => (phase === 'all' || ph.phase === phase) && (visible === 'all' || (visible === 'client') === ph.clientVisible));
    const key = (ph: PhotoEvidence) => groupBy === 'phase' ? PHASE_LABEL[ph.phase] : groupBy === 'room' ? ph.room : groupBy === 'date' ? dateAz(ph.date) : CATEGORY_LABEL[ph.category];
    const order = (ph: PhotoEvidence) => groupBy === 'phase' ? ['before', 'during', 'after'].indexOf(ph.phase) : groupBy === 'date' ? -new Date(ph.date).getTime() : groupBy === 'category' ? CATEGORY_ORDER.indexOf(ph.category) : 0;
    const sorted = [...list].sort((a, b) => order(a) - order(b) || b.date.localeCompare(a.date));
    const map = new Map<string, PhotoEvidence[]>();
    for (const ph of sorted) map.set(key(ph), [...(map.get(key(ph)) ?? []), ph]);
    return [...map.entries()];
  }, [p.photos, groupBy, phase, visible]);

  return <>
    <div className="sm-filters">
      <div className="sm-seg" role="group" aria-label="Qruplaşdırma">{(Object.keys(GROUP_LABEL) as GroupBy[]).map(g => <button key={g} type="button" aria-pressed={groupBy === g} onClick={() => setGroupBy(g)}>{GROUP_LABEL[g]}</button>)}</div>
      <label className="sm-sr" htmlFor="ph-phase">Mərhələ</label>
      <select id="ph-phase" value={phase} onChange={e => setPhase(e.target.value as PhotoPhase | 'all')}><option value="all">Bütün mərhələlər</option>{(Object.keys(PHASE_LABEL) as PhotoPhase[]).map(k => <option key={k} value={k}>{PHASE_LABEL[k]}</option>)}</select>
      <label className="sm-sr" htmlFor="ph-vis">Görünürlük</label>
      <select id="ph-vis" value={visible} onChange={e => setVisible(e.target.value as typeof visible)}><option value="all">Hamısı</option><option value="client">Sifarişçiyə görünən</option><option value="hidden">Yalnız komanda</option></select>
      <span style={{ flex: 1 }} />
      <Button onClick={() => setOpen(true)} testId="button-add-photo"><ImagePlus size={16} />Foto əlavə et</Button>
    </div>

    {groups.length ? groups.map(([title, list]) => <section className="sm-photo-group" key={title} aria-label={title}>
      <h3>{title}<small>{list.length} foto</small></h3>
      <div className="sm-photo-grid">{list.map(ph => {
        const line = items.find(i => i.id === ph.lineItemId);
        return <article className="sm-photo" key={ph.id}>
          <div className="sm-photo-img">
            {ph.url ? <img src={ph.url} alt={ph.note} /> : <div className={`sm-photo-ph p-${ph.phase}`} role="img" aria-label={`${PHASE_LABEL[ph.phase]}: ${ph.note}`}><Camera size={26} aria-hidden /><small>{ph.room}</small></div>}
            <span className="sm-photo-phase"><Pill small tone={PHASE_TONE[ph.phase]}>{PHASE_LABEL[ph.phase]}</Pill></span>
            <button type="button" className={`sm-photo-vis ${ph.clientVisible ? '' : 'hidden-to-client'}`} aria-pressed={ph.clientVisible} onClick={() => { smeta.togglePhotoVisibility(p.id, ph.id); toast(ph.clientVisible ? 'Foto sifarişçidən gizlədildi' : 'Foto sifarişçiyə görünür'); }} title="Sifarişçi üçün görünürlüyü dəyiş">
              {ph.clientVisible ? <><Eye size={12} aria-hidden />Sifarişçi görür</> : <><EyeOff size={12} aria-hidden />Yalnız komanda</>}
            </button>
          </div>
          <div className="sm-photo-body">
            <p>{ph.note}</p>
            <small><CalendarDays size={12} aria-hidden />{dateAz(ph.date)} · <UserRound size={12} aria-hidden />{ph.uploadedBy}</small>
            <small><MapPin size={12} aria-hidden />{ph.room} · {CATEGORY_LABEL[ph.category]}</small>
            {line && <small><ClipboardList size={12} aria-hidden />{line.name}</small>}
          </div>
        </article>;
      })}</div>
    </section>) : <div className="sm-empty surface"><div className="empty-illustration"><Camera size={28} /></div><h3>{p.photos.length ? 'Filtrə uyğun foto yoxdur' : 'Hələ foto sübut yoxdur'}</h3><p>İşdən əvvəl, iş zamanı və sonra çəkilmiş fotolar hər mərhələnin razılaşdırıldığını sübut edir.</p><Button onClick={() => setOpen(true)}><ImagePlus size={16} />Foto əlavə et</Button></div>}

    <PhotoModal project={p} open={open} onClose={() => setOpen(false)} />
  </>;
}

function PhotoModal({ project: p, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [phase, setPhase] = useState<PhotoPhase>('during');
  const [category, setCategory] = useState<WorkCategory>(p.estimate.sections[0]?.category ?? 'divar');
  const [room, setRoom] = useState('');
  const [note, setNote] = useState('');
  const [lineId, setLineId] = useState('');
  const [visible, setVisible] = useState(true);
  const [tried, setTried] = useState(false);
  const lines = p.estimate.sections.filter(s => s.category === category).flatMap(s => s.items);
  const rooms = [...new Set(p.estimate.sections.flatMap(s => s.items.map(i => i.zone)))];
  const errors = { file: !file ? 'Foto seçin' : '', note: !note.trim() ? 'Qısa qeyd yazın' : '' };
  const close = () => { setFile(null); setNote(''); setRoom(''); setLineId(''); setTried(false); onClose(); };
  const save = () => {
    setTried(true);
    if (errors.file || errors.note) return;
    smeta.addPhoto(p.id, { phase, date: todayISO(), uploadedBy: p.contractor.name, note: note.trim(), room: room.trim() || lines.find(l => l.id === lineId)?.zone || 'Ümumi', category, lineItemId: lineId || undefined, clientVisible: visible, url: file!.url });
    toast('Foto əlavə edildi');
    close();
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="sm-field-error">{errors[k]}</small> : null;
  return <Modal open={open} onClose={close} eyebrow="Foto sübutlar" title="Foto əlavə et" footer={<><Button variant="secondary" onClick={close}>Ləğv et</Button><Button onClick={save}>Yadda saxla</Button></>}>
    {file ? <div className="sm-receipt-preview"><img src={file.url} alt="Seçilmiş foto" /><div><strong>{file.name}</strong></div><button type="button" className="sm-link-btn" onClick={() => setFile(null)}>Dəyiş</button></div>
      : <label className="sm-drop" style={{ minHeight: 120, marginTop: 0 }}><input type="file" accept="image/*" aria-label="Foto seçin" onChange={e => { const f = e.target.files?.[0]; if (f) setFile({ url: URL.createObjectURL(f), name: f.name }); e.target.value = ''; }} /><Camera size={22} color="#3b5d50" aria-hidden /><strong>Foto seçin</strong><span>JPG və ya PNG</span></label>}
    {err('file')}
    <div className="field-grid">
      <label className="field"><span>Mərhələ</span><select value={phase} onChange={e => setPhase(e.target.value as PhotoPhase)}>{(Object.keys(PHASE_LABEL) as PhotoPhase[]).map(k => <option key={k} value={k}>{PHASE_LABEL[k]}</option>)}</select></label>
      <label className="field"><span>Otaq / Zona</span><input list="sm-rooms" value={room} onChange={e => setRoom(e.target.value)} placeholder="Məs.: Hamam" /><datalist id="sm-rooms">{rooms.map(r => <option key={r} value={r} />)}</datalist></label>
      <label className="field"><span>İş paketi</span><select value={category} onChange={e => { setCategory(e.target.value as WorkCategory); setLineId(''); }}>{CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
      <label className="field"><span>Əlaqəli smeta sətri</span><select value={lineId} onChange={e => setLineId(e.target.value)} disabled={!lines.length}><option value="">Seçilməyib</option>{lines.map(l => <option key={l.id} value={l.id}>{l.name} · {l.zone}</option>)}</select></label>
      <label className="field full"><span>Qeyd<i> *</i></span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Məs.: Kafel altı hidroizolyasiya tamamlandı" aria-invalid={tried && !!errors.note} />{err('note')}</label>
    </div>
    <label className="sm-check"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />Sifarişçi bu fotonu görə bilsin</label>
  </Modal>;
}
