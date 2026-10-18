import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, LoaderCircle, Plus, Search, UserPlus, X } from 'lucide-react';
import {
  addWorkParticipant, useCreateWork, useGetHomeOverview, useListHomePerformers, useListHomes,
  type ParticipantInputRole, type WorkInput, type WorkerRef,
} from '@workspace/api-client-react';
import { Field } from '@/components/kit';
import { Modal, WorkerSearch, toast } from '@/components/home/ui';
import { QUICK_CATEGORIES, WORK_CATEGORY, clearDraft, loadDraft, refreshHomeData, saveDraft, today } from '@/lib/home/labels';
import { uploadHomeMedia } from '@/lib/home/upload';

type Master = { key: string; name: string; workerId?: string; phone?: string; registered?: boolean };
type Draft = { category: string; title: string; roomId: string; date: string; done: boolean; materials: string; note: string; masters: Master[] };
const empty = (category = '', roomId = ''): Draft => ({ category, title: '', roomId, date: today(), done: true, materials: '', note: '', masters: [] });

/**
 * "Görülən işi əlavə et" — the short, phone-first form: what, where, when, photo, who.
 * Materials and a note are optional; everything else (status flow, details) lives on the work page.
 */
export function QuickWorkModal({ homeId: fixedHome, roomId, category, equipmentId, onClose, onSaved }: { homeId?: string; roomId?: string; category?: string; equipmentId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const homes = useListHomes({ query: { enabled: !fixedHome, queryKey: ['/api/homes'] } });
  const [homeId, setHomeId] = useState(fixedHome ?? '');
  const home = useGetHomeOverview(homeId, { query: { enabled: !!homeId, queryKey: [`/api/homes/${homeId}`] } });
  const performers = useListHomePerformers(homeId, { query: { enabled: !!homeId, queryKey: [`/api/homes/${homeId}/performers`] } });
  const create = useCreateWork();
  const qc = useQueryClient();
  const draftKey = `work:${homeId || 'any'}`;
  const [f, setF] = useState<Draft>(() => (!roomId && !category && !equipmentId && loadDraft<Draft>(draftKey)) || empty(category, roomId));
  const [photos, setPhotos] = useState<File[]>([]);
  const [adding, setAdding] = useState<'' | 'new' | 'search'>('');
  const [newMaster, setNewMaster] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { saveDraft(draftKey, f); }, [f, draftKey]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(o => ({ ...o, [k]: v }));
  const role = home.data?.home.myRole;
  const performer = role === 'performer';
  const addMaster = (m: Master) => setF(o => (o.masters.some(x => x.key === m.key) ? o : { ...o, masters: [...o.masters, m] }));
  const choosable = (homes.data ?? []).filter(h => h.myRole !== 'viewer' && h.myRole !== 'contributor');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!homeId) { setError('Hansı evdə iş görüldüyünü seçin.'); return; }
    if (!f.category) { setError('Hansı işin görüldüyünü seçin.'); return; }
    setBusy(true); setError('');
    const roomName = home.data?.rooms.find(r => r.id === f.roomId)?.name;
    const title = (f.title.trim() || `${WORK_CATEGORY[f.category]}${roomName ? ` — ${roomName}` : ''}`).slice(0, 200);
    const data: WorkInput = {
      title, category: f.category as WorkInput['category'], kind: equipmentId ? 'maintenance' : 'renovation', roomId: f.roomId || null, equipmentId: equipmentId ?? null,
      startDate: f.date || null, endDate: f.done ? f.date || null : null, status: f.done ? 'completed' : 'in_progress', materials: f.materials.trim(), description: f.note.trim(),
    };
    try {
      const work = await create.mutateAsync({ homeId, data });
      const problems: string[] = [];
      if (photos.length) {
        try { await uploadHomeMedia(photos, { workId: work.id, phase: f.done ? 'after' : 'during' }); }
        catch { problems.push('foto'); }
      }
      for (const [i, m] of f.masters.entries()) {
        const r = (i === 0 ? 'lead' : 'assistant') as ParticipantInputRole;
        try {
          await addWorkParticipant(work.id, m.workerId ? { workerId: m.workerId, role: r } : { placeholder: { name: m.name, phone: m.phone ?? '' }, role: r });
        } catch { problems.push(m.name); }
      }
      clearDraft(draftKey);
      void refreshHomeData(qc);
      toast(problems.length ? `İş əlavə olundu. Alınmadı: ${problems.join(', ')} — iş səhifəsindən yenidən cəhd edin.` : 'Görülən iş əlavə olundu');
      onSaved(work.id);
    } catch { setError('İş əlavə olunmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.'); }
    finally { setBusy(false); }
  };

  return <Modal open onClose={onClose} eyebrow={home.data?.home.name ?? 'Görülən iş'} title="Görülən işi əlavə et" wide
    footer={<button type="submit" form="quick-work" className="button button-primary hp-big" disabled={busy} data-testid="button-save-work">{busy && <LoaderCircle className="spin" size={15} />}{busy ? 'Saxlanılır…' : 'Yadda saxla'}</button>}>
    <form id="quick-work" className="rl-form hp-quick" onSubmit={e => { void submit(e); }}>
      {!fixedHome && <div className="field"><span>Hansı evdə?</span>
        {choosable.length ? <div className="hp-chipset">{choosable.map(h => <button key={h.id} type="button" className={homeId === h.id ? 'on' : ''} onClick={() => { setHomeId(h.id); set('roomId', ''); }}>{h.name}</button>)}</div>
          : <p className="rl-hint">İş əlavə edə biləcəyiniz ev yoxdur. Ev sahibi sizi işə dəvət etdikdə həmin ev burada görünəcək.</p>}
      </div>}

      <div className="field"><span>Hansı iş görülüb?</span>
        <div className="hp-chipset big">{QUICK_CATEGORIES.map(c => <button key={c} type="button" className={f.category === c ? 'on' : ''} onClick={() => set('category', c)} data-testid={`chip-cat-${c}`}>{WORK_CATEGORY[c]}</button>)}</div>
      </div>
      {f.category && <Field label={f.category === 'other' ? 'İşin adı' : 'Qısa ad (istəyə bağlı)'} name="work-title" value={f.title} onChange={v => set('title', v)} placeholder={f.category === 'other' ? 'məs. Tavanın düzəldilməsi' : `məs. ${WORK_CATEGORY[f.category]} — mətbəx`} />}

      {!!home.data?.rooms.length && <div className="field"><span>Harada görülüb?</span>
        <div className="hp-chipset">{[{ id: '', name: 'Bütün ev' }, ...home.data.rooms].map(r => <button key={r.id || 'all'} type="button" className={f.roomId === r.id ? 'on' : ''} onClick={() => set('roomId', r.id)}>{r.name}</button>)}</div>
      </div>}

      <div className="field-grid">
        <Field label="Nə vaxt görülüb?" name="work-date" type="date" value={f.date} onChange={v => set('date', v)} />
        <div className="field"><span>İş bitib?</span><div className="rl-seg" role="radiogroup" aria-label="İş bitib?">
          <button type="button" role="radio" aria-checked={f.done} className={f.done ? 'on' : ''} onClick={() => set('done', true)}>Bəli, bitib</button>
          <button type="button" role="radio" aria-checked={!f.done} className={!f.done ? 'on' : ''} onClick={() => set('done', false)}>Hələ davam edir</button>
        </div></div>
      </div>

      <div className="field"><span>İşin fotosu</span>
        <div className="hp-upload-btns">
          <label className="button button-secondary"><input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" data-testid="input-work-photos" onChange={e => setPhotos(p => [...p, ...Array.from(e.target.files ?? [])].slice(0, 20))} /><ImagePlus size={15} />Foto seç</label>
          <label className="button button-quiet"><input type="file" hidden accept="image/*" capture="environment" onChange={e => setPhotos(p => [...p, ...Array.from(e.target.files ?? [])].slice(0, 20))} /><Camera size={15} />Kamera</label>
        </div>
        {photos.length > 0 && <div className="hp-chipset">{photos.map((p, i) => <span key={i} className="hp-tag">{p.name}<button type="button" aria-label="Sil" onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}><X size={12} /></button></span>)}</div>}
        <small className="rl-hint">Divar bağlanmazdan əvvəl naqil və boruların fotosunu çəkin — gələcəkdə yerini tapmaq asan olacaq.</small>
      </div>

      {!performer && homeId && <div className="field"><span>İşi kim görüb?</span>
        <div className="hp-chipset">
          {f.masters.map(m => <span key={m.key} className="hp-tag on">{m.name}{!m.registered && <small> (hesabı yoxdur)</small>}<button type="button" aria-label="Çıxar" onClick={() => set('masters', f.masters.filter(x => x.key !== m.key))}><X size={12} /></button></span>)}
          {(performers.data ?? []).filter(p => !f.masters.some(m => m.workerId === p.worker.id)).slice(0, 8).map(p => <button key={p.worker.id} type="button" onClick={() => addMaster({ key: p.worker.id, workerId: p.worker.id, name: p.worker.displayName, registered: p.worker.registered })}><Plus size={12} />{p.worker.displayName}</button>)}
          <button type="button" onClick={() => setAdding(adding === 'search' ? '' : 'search')}><Search size={12} />Hesabı olan usta</button>
          <button type="button" onClick={() => setAdding(adding === 'new' ? '' : 'new')} data-testid="button-new-master"><UserPlus size={12} />Hesabı olmayan usta</button>
        </div>
        {adding === 'search' && <WorkerSearch exclude={f.masters.map(m => m.workerId ?? '')} onPick={(w: WorkerRef) => { addMaster({ key: w.id, workerId: w.id, name: w.displayName, registered: true }); setAdding(''); }} />}
        {adding === 'new' && <div className="hp-inline-new">
          <Field label="Ad, soyad" name="master-name" value={newMaster.name} onChange={v => setNewMaster({ ...newMaster, name: v })} />
          <Field label="Telefon (yalnız siz görürsünüz)" name="master-phone" type="tel" value={newMaster.phone} onChange={v => setNewMaster({ ...newMaster, phone: v })} />
          <button type="button" className="button button-secondary" disabled={newMaster.name.trim().length < 2} data-testid="button-add-master" onClick={() => { addMaster({ key: `new-${Date.now()}`, name: newMaster.name.trim(), phone: newMaster.phone.trim() }); setNewMaster({ name: '', phone: '' }); setAdding(''); }}>Əlavə et</button>
          <small className="rl-hint">Usta sonra hesab yaratsa, ona link göndərib bu qeydi onun hesabına bağlaya bilərsiniz.</small>
        </div>}
        {f.masters.length === 0 && <small className="rl-hint">İstəyə bağlıdır. Bir neçə usta seçə bilərsiniz.</small>}
      </div>}

      <Field label="İstifadə edilən materiallar (istəyə bağlı)" name="work-materials"><textarea rows={2} maxLength={3000} value={f.materials} onChange={e => set('materials', e.target.value)} placeholder="məs. Kabel 3×2.5, 20 m" /></Field>
      <Field label="Qeyd (istəyə bağlı)" name="work-note"><textarea rows={2} maxLength={6000} value={f.note} onChange={e => set('note', e.target.value)} /></Field>
      {error && <p className="sm-field-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
