import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronDown, ImagePlus, LoaderCircle, Plus, X } from 'lucide-react';
import {
  addWorkParticipant, useCreateWork, useGetHomeOverview, useListHomePerformers, useListHomes,
  type ParticipantInputRole, type WorkInput,
} from '@workspace/api-client-react';
import { Field } from '@/components/kit';
import { Modal, toast } from '@/components/home/ui';
import { CURRENCY, QUICK_CATEGORIES, WORK_CATEGORY, clearDraft, loadDraft, refreshHomeData, saveDraft, today } from '@/lib/home/labels';
import { uploadHomeMedia } from '@/lib/home/upload';

type Doer = { key: string; name: string; workerId?: string; phone?: string; kind?: 'individual' | 'company'; note?: string };
type Draft = {
  title: string; date: string; done: boolean; description: string; category: string; roomId: string; materials: string;
  doers: Doer[]; cost: string; currency: string; warranty: string;
};
const empty = (p: { category?: string; roomId?: string; title?: string } = {}): Draft => ({
  title: p.title ?? '', date: today(), done: true, description: '', category: p.category ?? '', roomId: p.roomId ?? '', materials: '', doers: [], cost: '', currency: 'AZN', warranty: '',
});

/**
 * "İş əlavə et": the minimum is the home, a name and a date (photos, files and a short description welcome).
 * Everything else — room, kind of work, materials, who did it, cost, warranty — is optional and folded away.
 * Old works can be entered with their real date; the date it was added is stored separately.
 */
export function QuickWorkModal({ homeId: fixedHome, roomId, category, equipmentId, smetaProjectId, title, onClose, onSaved }: {
  homeId?: string; roomId?: string; category?: string; equipmentId?: string; smetaProjectId?: string; title?: string; onClose: () => void; onSaved: (id: string) => void;
}) {
  const homes = useListHomes({ query: { enabled: !fixedHome, queryKey: ['/api/homes'] } });
  const [homeId, setHomeId] = useState(fixedHome ?? '');
  const home = useGetHomeOverview(homeId, { query: { enabled: !!homeId, queryKey: [`/api/homes/${homeId}`] } });
  const performers = useListHomePerformers(homeId, { query: { enabled: !!homeId, queryKey: [`/api/homes/${homeId}/performers`] } });
  const create = useCreateWork();
  const qc = useQueryClient();
  const prefilled = !!(roomId || category || equipmentId || smetaProjectId || title);
  const draftKey = `work:${homeId || 'any'}`;
  const [f, setF] = useState<Draft>(() => (!prefilled && loadDraft<Draft>(draftKey)) || empty({ category, roomId, title }));
  const [more, setMore] = useState(prefilled);
  const [files, setFiles] = useState<File[]>([]);
  const [doer, setDoer] = useState<Doer>({ key: '', name: '', phone: '', kind: 'individual', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!prefilled) saveDraft(draftKey, f); }, [f, draftKey, prefilled]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(o => ({ ...o, [k]: v }));
  const performer = home.data?.home.myRole === 'performer';
  const canPickHome = (homes.data ?? []).filter(h => h.myRole !== 'viewer');
  const addDoer = (d: Doer) => setF(o => (o.doers.some(x => x.key === d.key) ? o : { ...o, doers: [...o.doers, d] }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!homeId) { setError('İşin hansı evdə görüldüyünü seçin.'); return; }
    const roomName = home.data?.rooms.find(r => r.id === f.roomId)?.name;
    const name = f.title.trim() || (f.category ? `${WORK_CATEGORY[f.category]}${roomName ? ` — ${roomName}` : ''}` : '');
    if (name.length < 2) { setError('İşin adını yazın, məsələn “Kondisioner quraşdırıldı”.'); return; }
    const cost = f.cost.trim() ? Number(f.cost.replace(',', '.')) : null;
    if (cost != null && (Number.isNaN(cost) || cost < 0)) { setError('Xərci rəqəmlə yazın.'); return; }
    setBusy(true); setError('');
    const data: WorkInput = {
      title: name.slice(0, 200), category: (f.category || 'other') as WorkInput['category'], kind: equipmentId ? 'maintenance' : 'renovation',
      roomId: f.roomId || null, equipmentId: equipmentId ?? null, startDate: f.date || null, endDate: f.done ? f.date || null : null,
      status: f.done ? 'completed' : 'planned', description: f.description.trim(), materials: f.materials.trim(),
      ...(performer ? {} : { cost, currency: f.currency as WorkInput['currency'], warrantyNote: f.warranty.trim() }),
      ...(smetaProjectId ? { smetaProjectId } : {}),
    };
    try {
      const work = await create.mutateAsync({ homeId, data });
      const problems: string[] = [];
      if (files.length) {
        try { await uploadHomeMedia(files, { workId: work.id, phase: f.done ? 'after' : 'before' }); }
        catch { problems.push('fayllar'); }
      }
      for (const [i, d] of f.doers.entries()) {
        const role = (i === 0 ? 'lead' : 'assistant') as ParticipantInputRole;
        try {
          await addWorkParticipant(work.id, d.workerId
            ? { workerId: d.workerId, role, note: d.note ?? '' }
            : { placeholder: { name: d.name, phone: d.phone ?? '', kind: d.kind ?? 'individual' }, role, note: d.note ?? '' });
        } catch { problems.push(d.name); }
      }
      clearDraft(draftKey);
      void refreshHomeData(qc);
      toast(problems.length ? `İş əlavə olundu. Alınmadı: ${problems.join(', ')} — iş səhifəsindən yenidən cəhd edin.` : 'İş əlavə olundu');
      onSaved(work.id);
    } catch { setError('İş əlavə olunmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.'); }
    finally { setBusy(false); }
  };

  return <Modal open onClose={onClose} eyebrow={home.data?.home.name ?? 'İş tarixçəsi'} title="İş əlavə et" wide
    footer={<button type="submit" form="quick-work" className="button button-primary hp-big" disabled={busy} data-testid="button-save-work">{busy && <LoaderCircle className="spin" size={15} />}{busy ? 'Saxlanılır…' : 'Yadda saxla'}</button>}>
    <form id="quick-work" className="rl-form hp-quick" onSubmit={e => { void submit(e); }}>
      {!fixedHome && <div className="field"><span>Hansı ev?</span>
        {canPickHome.length ? <div className="hp-chipset">{canPickHome.map(h => <button key={h.id} type="button" className={homeId === h.id ? 'on' : ''} onClick={() => { setHomeId(h.id); set('roomId', ''); }} data-testid={`chip-home-${h.id}`}>{h.name}</button>)}</div>
          : <p className="rl-hint">Əvvəlcə ev əlavə edin.</p>}
      </div>}

      <Field label="Nə edildi?" name="work-title" value={f.title} onChange={v => set('title', v)} placeholder="məs. Mətbəxdə su xətti dəyişdirildi" />
      <div className="field-grid">
        <Field label="Nə vaxt?" name="work-date" type="date" value={f.date} onChange={v => set('date', v)} />
        <div className="field"><span>Vəziyyət</span><div className="rl-seg" role="radiogroup" aria-label="Vəziyyət">
          <button type="button" role="radio" aria-checked={f.done} className={f.done ? 'on' : ''} onClick={() => set('done', true)}>Görülüb</button>
          <button type="button" role="radio" aria-checked={!f.done} className={!f.done ? 'on' : ''} onClick={() => set('done', false)}>Planlaşdırılır</button>
        </div></div>
      </div>
      <small className="rl-hint">Köhnə işi də yaza bilərsiniz — sadəcə əsl tarixini seçin.</small>
      <Field label="Qısa təsvir" name="work-description"><textarea rows={2} maxLength={6000} value={f.description} onChange={e => set('description', e.target.value)} placeholder="məs. Köhnə metal borular plastiklə əvəzləndi" /></Field>

      <div className="field"><span>Foto və fayllar</span>
        <div className="hp-upload-btns">
          <label className="button button-secondary"><input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf" data-testid="input-work-photos" onChange={e => { const l = Array.from(e.target.files ?? []); setFiles(p => [...p, ...l].slice(0, 20)); e.target.value = ''; }} /><ImagePlus size={15} />Foto və ya fayl</label>
          <label className="button button-quiet"><input type="file" hidden accept="image/*" capture="environment" onChange={e => { const l = Array.from(e.target.files ?? []); setFiles(p => [...p, ...l].slice(0, 20)); e.target.value = ''; }} /><Camera size={15} />Kamera</label>
        </div>
        {files.length > 0 && <div className="hp-chipset">{files.map((p, i) => <span key={i} className="hp-tag">{p.name}<button type="button" aria-label="Sil" onClick={() => setFiles(ps => ps.filter((_, j) => j !== i))}><X size={12} /></button></span>)}</div>}
        <small className="rl-hint">Foto, video və ya PDF (qəbz, zəmanət). Divarlar bağlanmazdan əvvəl xətlərin fotosu xüsusilə dəyərlidir.</small>
      </div>

      <button type="button" className={`hp-more ${more ? 'open' : ''}`} onClick={() => setMore(!more)} aria-expanded={more} data-testid="button-more"><ChevronDown size={15} />Əlavə məlumat (istəyə bağlı): otaq, növ, material, usta, xərc, zəmanət</button>
      {more && <div className="hp-more-body">
        {!!home.data?.rooms.length && <div className="field"><span>Otaq və ya zona</span>
          <div className="hp-chipset">{[{ id: '', name: 'Bütün ev' }, ...home.data.rooms].map(r => <button key={r.id || 'all'} type="button" className={f.roomId === r.id ? 'on' : ''} onClick={() => set('roomId', r.id)}>{r.name}</button>)}</div>
        </div>}
        <div className="field"><span>İşin növü</span>
          <div className="hp-chipset">{QUICK_CATEGORIES.map(c => <button key={c} type="button" className={f.category === c ? 'on' : ''} onClick={() => set('category', f.category === c ? '' : c)} data-testid={`chip-cat-${c}`}>{WORK_CATEGORY[c]}</button>)}</div>
        </div>
        <Field label="Material və avadanlıq" name="work-materials"><textarea rows={2} maxLength={3000} value={f.materials} onChange={e => set('materials', e.target.value)} placeholder="məs. PPR boru 20 mm, Baxi kombi Eco 4s" /></Field>

        {!performer && <div className="field"><span>İşi kim görüb?</span>
          <div className="hp-chipset">
            {f.doers.map(d => <span key={d.key} className="hp-tag on">{d.name}{d.phone ? <small> · {d.phone}</small> : null}<button type="button" aria-label="Çıxar" onClick={() => set('doers', f.doers.filter(x => x.key !== d.key))}><X size={12} /></button></span>)}
            {(performers.data ?? []).filter(p => !f.doers.some(d => d.workerId === p.worker.id)).slice(0, 6).map(p => <button key={p.worker.id} type="button" onClick={() => addDoer({ key: p.worker.id, workerId: p.worker.id, name: p.worker.displayName })}><Plus size={12} />{p.worker.displayName}</button>)}
          </div>
          <div className="hp-inline-new">
            <div className="rl-seg" role="radiogroup" aria-label="Usta və ya şirkət">
              <button type="button" role="radio" aria-checked={doer.kind === 'individual'} className={doer.kind === 'individual' ? 'on' : ''} onClick={() => setDoer({ ...doer, kind: 'individual' })}>Usta</button>
              <button type="button" role="radio" aria-checked={doer.kind === 'company'} className={doer.kind === 'company' ? 'on' : ''} onClick={() => setDoer({ ...doer, kind: 'company' })}>Şirkət</button>
            </div>
            <div className="field-grid">
              <Field label={doer.kind === 'company' ? 'Şirkətin adı' : 'Ustanın adı'} name="master-name" value={doer.name} onChange={v => setDoer({ ...doer, name: v })} />
              <Field label="Telefon" name="master-phone" type="tel" value={doer.phone ?? ''} onChange={v => setDoer({ ...doer, phone: v })} />
            </div>
            <Field label="Qeyd" name="master-note" value={doer.note ?? ''} onChange={v => setDoer({ ...doer, note: v })} placeholder="məs. Tövsiyə edirəm, zəmanət verdi" />
            <button type="button" className="button button-secondary" disabled={doer.name.trim().length < 2} data-testid="button-add-master" onClick={() => { addDoer({ ...doer, key: `new-${Date.now()}`, name: doer.name.trim(), phone: doer.phone?.trim(), note: doer.note?.trim() }); setDoer({ key: '', name: '', phone: '', kind: 'individual', note: '' }); }}><Plus size={14} />Əlavə et</button>
            <small className="rl-hint">Ustanın Təhvil-də hesabı olmasına ehtiyac yoxdur. Bu məlumat sizin qeydinizdir; heç bir hesaba avtomatik bağlanmır və telefonu yalnız evə girişi olanlar görür.</small>
          </div>
        </div>}

        {!performer && <>
          <div className="field-grid">
            <Field label="Xərc" name="work-cost" type="number" min="0" step="0.01" value={f.cost} onChange={v => set('cost', v)} placeholder="məs. 450" />
            <label className="field"><span>Valyuta</span><select value={f.currency} onChange={e => set('currency', e.target.value)} data-testid="select-currency">{CURRENCY.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          </div>
          <Field label="Zəmanət" name="work-warranty" value={f.warranty} onChange={v => set('warranty', v)} placeholder="məs. 2 il, 2026-cı ilin mayına qədər" />
          <small className="rl-hint">Xərc və zəmanət yalnız evə girişi olanlara görünür; paylaşımda göstərilmir.</small>
        </>}
      </div>}
      {error && <p className="sm-field-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
