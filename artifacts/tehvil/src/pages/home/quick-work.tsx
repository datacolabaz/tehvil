import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Camera, ChevronDown, FileText, ImagePlus, Info, LoaderCircle, Plus, ReceiptText, Sparkles, X } from 'lucide-react';
import {
  addWorkParticipant, useCreateWork, useGetHomeOverview, useListHomePerformers, useListHomes,
  type ParticipantInputRole, type WorkInput,
} from '@workspace/api-client-react';
import { Field } from '@/components/kit';
import { Modal, toast } from '@/components/home/ui';
import { CURRENCY, QUICK_CATEGORIES, WORK_CATEGORY, clearDraft, loadDraft, refreshHomeData, saveDraft, today } from '@/lib/home/labels';
import { uploadHomeMedia } from '@/lib/home/upload';
import { api, azDate, azn, booksKey, errorText, financeKey, newKey, putFile, shrinkImage, type Finance, type Invoice } from '@/lib/finance/api';
import { DayTotals, LinesEditor, lineCents, lineKind, lineProblem, newLine, type DayLine } from '@/components/daily/lines-editor';

type Doer = { key: string; name: string; workerId?: string; phone?: string; kind?: 'individual' | 'company'; note?: string };
type Draft = {
  title: string; date: string; done: boolean; description: string; category: string; roomId: string; materials: string;
  doers: Doer[]; cost: string; currency: string; warranty: string;
  lines: DayLine[]; vendorName: string;
};
const empty = (p: { category?: string; roomId?: string; title?: string } = {}): Draft => ({
  title: p.title ?? '', date: today(), done: true, description: '', category: p.category ?? '', roomId: p.roomId ?? '', materials: '', doers: [], cost: '', currency: 'AZN', warranty: '',
  lines: [], vendorName: '',
});
export type DailyMode = 'work' | 'manual' | 'receipt';
type Receipt = { invoice: Invoice; mediaUrl: string | null; pdf: boolean; aiDate: string | null; aiDateLabel: string; total: string | null; dateChoice: 'receipt' | 'mine' | null; discount: string; tax: string };

/**
 * "Gündəlik qeyd əlavə et" (formerly "İş əlavə et"): one form for a day on site — materials bought, work done and fees paid.
 *  - Görülən iş: name, date, short description, photos / files / camera, optional details (room, kind, who did it, warranty).
 *  - Material və ya iş sətirləri: name, category, quantity, unit, unit price, total (= quantity × price), note, paid / not paid.
 *    Lines go to the home's expense journal; the work record itself carries no cost, so nothing is counted twice.
 *  - Qaimə: a photo or PDF is read by AI into lines, shown for review, and only saved when the person presses "Xərclərə əlavə et".
 *    A receipt date that differs from the chosen date is offered, never applied silently.
 */
export function QuickWorkModal(p: Parameters<typeof DailyEntryModal>[0]) { return <DailyEntryModal {...p} />; }

export function DailyEntryModal({ homeId: fixedHome, roomId, category, equipmentId, smetaProjectId, title, mode = 'work', heading, receiptFile, invoice: pendingInvoice, onClose, onSaved }: {
  homeId?: string; roomId?: string; category?: string; equipmentId?: string; smetaProjectId?: string; title?: string;
  mode?: DailyMode; heading?: string; receiptFile?: File; invoice?: Invoice;
  onClose: () => void; onSaved: (workId: string | null, homeId: string) => void;
}) {
  const homes = useListHomes({ query: { enabled: !fixedHome, queryKey: ['/api/homes'] } });
  const [homeId, setHomeId] = useState(fixedHome ?? '');
  const home = useGetHomeOverview(homeId, { query: { enabled: !!homeId, queryKey: [`/api/homes/${homeId}`] } });
  const performers = useListHomePerformers(homeId, { query: { enabled: !!homeId, queryKey: [`/api/homes/${homeId}/performers`] } });
  const create = useCreateWork();
  const qc = useQueryClient();
  const prefilled = !!(roomId || category || equipmentId || smetaProjectId || title || receiptFile || pendingInvoice);
  const draftKey = `day:${homeId || 'any'}`;
  const startLines = () => (mode === 'manual' ? [newLine()] : mode === 'work' ? [newLine({ kind: 'service', category: 'labor' })] : []);
  const fresh = (): Draft => ({ ...empty({ category, roomId, title }), lines: startLines() });
  const [f, setF] = useState<Draft>(() => {
    const d = (!prefilled && loadDraft<Draft>(draftKey)) || empty({ category, roomId, title });
    return { ...empty(), ...d, lines: d.lines?.length ? d.lines : (mode === 'manual' ? [newLine()] : mode === 'work' && !prefilled ? [newLine({ kind: 'service', category: 'labor' })] : []) };
  });
  // A draft left from an earlier, unsaved form is never restored silently: the person sees it and can clear it.
  const [restored, setRestored] = useState<null | { lines: number; date: string }>(() => {
    if (prefilled) return null;
    const d = loadDraft<Draft>(draftKey);
    const n = d?.lines?.filter(l => l.name?.trim() || l.lineTotal || l.quantity || l.unitPrice).length ?? 0;
    return d && (n || d.title?.trim() || d.description?.trim()) ? { lines: n, date: d.date } : null;
  });
  const startOver = () => { clearDraft(draftKey); setF(fresh()); setFiles([]); setRestored(null); };
  const [more, setMore] = useState(!!(roomId || category || equipmentId || smetaProjectId || title));
  const [files, setFiles] = useState<File[]>([]);
  const [doer, setDoer] = useState<Doer>({ key: '', name: '', phone: '', kind: 'individual', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [reading, setReading] = useState<'' | 'upload' | 'read'>('');
  const [readNote, setReadNote] = useState('');
  const [key] = useState(newKey);
  const workRef = useRef<string | null>(null);
  const projectRef = useRef<string | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);
  useEffect(() => { if (!prefilled) saveDraft(draftKey, { ...f, lines: f.lines.map(({ weak, receiptTotal, ...l }) => l) }); }, [f, draftKey, prefilled]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(o => ({ ...o, [k]: v }));
  const role = home.data?.home.myRole;
  const performer = role === 'performer';
  const finance = role === 'owner' || role === 'member';
  const canPickHome = (homes.data ?? []).filter(h => h.myRole !== 'viewer');
  const addDoer = (d: Doer) => setF(o => (o.doers.some(x => x.key === d.key) ? o : { ...o, doers: [...o.doers, d] }));

  const book = async () => {
    if (projectRef.current) return projectRef.current;
    const r = await api<{ projectId: string }>(`/homes/${homeId}/expense-book`, 'POST', {});
    projectRef.current = r.projectId; return r.projectId;
  };

  /* ---------- receipt: upload → AI → lines for review */
  const applyInvoice = (inv: Invoice, fin: Finance) => {
    const media = fin.media.find(m => m.id === inv.mediaId);
    const ai = inv.aiResult;
    const aiDate = ai?.handwrittenDate ?? ai?.printedDate ?? null;
    setReceipt({ invoice: inv, mediaUrl: media?.url ?? null, pdf: media?.contentType === 'application/pdf', aiDate, aiDateLabel: ai?.handwrittenDate ? 'Qaimədə əl ilə yazılmış tarix' : 'Qaimədəki tarix', total: ai?.total ?? null, dateChoice: null, discount: ai?.discount ?? '', tax: ai?.tax ?? '' });
    if (!ai) { setReadNote(inv.status === 'failed' ? 'Qaimə oxunmadı. Sətirləri və məbləği özünüz yazın — qaimənin şəkli qeydə bağlanacaq.' : 'AI oxuma qoşulmayıb. Sətirləri özünüz yazın — qaimənin şəkli qeydə bağlanacaq.'); if (!f.lines.length) set('lines', [newLine()]); return; }
    const low = (k: string) => (ai.confidence?.[k] ?? 1) < 0.6;
    const lines = ai.items.map(i => newLine({
      name: i.name === '—' ? '' : i.name, category: i.category ?? ai.suggestedCategory ?? 'building_materials', quantity: i.quantity ?? '', unit: i.unit ?? '', unitPrice: i.unitPrice ?? '',
      lineTotal: i.quantity && i.unitPrice ? '' : i.lineTotal ?? '', receiptTotal: i.lineTotal, weak: i.confidence < 0.6, paid: true,
    }));
    setF(o => ({ ...o, lines: [...o.lines.filter(l => l.name || l.lineTotal || l.quantity), ...(lines.length ? lines : [newLine({ lineTotal: ai.total && !low('total') ? ai.total : '' })])], vendorName: o.vendorName || ai.vendor || '' }));
    setReadNote(`AI qaimədən ${ai.items.length} sətir oxudu. Hər sətri yoxlayın, səhvləri düzəldin, sonra “Xərclərə əlavə et” düyməsini basın.${ai.unreadable.length ? ` Oxunmayan: ${ai.unreadable.join(', ')}.` : ''}${low('total') ? ' Yekun məbləğ zəif oxunub.' : ''}`);
  };
  const waitRead = async (pid: string, id: string) => {
    setReading('read');
    for (let i = 0; i < 45 && !cancelled.current; i++) {
      const fin = await api<Finance>(`/home-projects/${pid}/finance`);
      const inv = fin.invoices.find(x => x.id === id);
      if (inv && inv.status !== 'reading') { applyInvoice(inv, fin); break; }
      await new Promise(r => setTimeout(r, 2000));
    }
    setReading('');
  };
  const uploadReceipt = async (file: File | undefined) => {
    if (!file || !homeId) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) { setError('Qaimə üçün şəkil (JPG, PNG, WebP) və ya PDF seçin.'); return; }
    try {
      setReading('upload');
      const pid = await book();
      const desc = await putFile(await shrinkImage(file));
      const r = await api<{ id: string }>(`/home-projects/${pid}/invoices`, 'POST', { file: desc });
      await waitRead(pid, r.id);
    } catch (e) { setReading(''); setError(e instanceof Error && !(e as { data?: unknown }).data ? e.message : errorText(e, 'Qaimə yüklənmədi. Yenidən cəhd edin.')); }
  };
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !homeId || !finance) return;
    if (receiptFile) { started.current = true; void uploadReceipt(receiptFile); }
    else if (pendingInvoice) { started.current = true; void book().then(pid => waitRead(pid, pendingInvoice.id)); }
  }, [homeId, finance]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- save */
  const lines = f.lines.filter(l => l.name.trim() || l.quantity || l.unitPrice || l.lineTotal);
  const bad = lines.map(lineProblem).find(Boolean);
  const adj = (v: string | undefined) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
  const discountC = adj(receipt?.discount), taxC = adj(receipt?.tax);
  const dayTotal = lines.reduce((s, l) => s + (lineCents(l) ?? 0), 0) - discountC + taxC;
  const dateOpen = !!(receipt?.aiDate && receipt.aiDate !== f.date && receipt.dateChoice == null);
  const receiptDiff = receipt?.total && lines.length && Math.round(Number(receipt.total) * 100) !== dayTotal;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!homeId) { setError('Qeydin hansı evə aid olduğunu seçin.'); return; }
    const roomName = home.data?.rooms.find(r => r.id === f.roomId)?.name;
    const name = f.title.trim() || (f.category ? `${WORK_CATEGORY[f.category]}${roomName ? ` — ${roomName}` : ''}` : '');
    const wantsWork = name.length > 0 || files.length > 0 || !finance;
    if (wantsWork && name.length < 2) { setError(files.length && finance ? 'Fotolar görülən işə bağlanır — işin adını yazın, məsələn “Armatur bağlandı”.' : 'Görülən işi qısa yazın, məsələn “Kondisioner quraşdırıldı”.'); return; }
    if (!wantsWork && !lines.length) { setError('Görülən işi yazın və ya ən azı bir material / iş sətri əlavə edin.'); return; }
    if (bad) { setError('Sətirləri yoxlayın: hər sətirdə ad və məbləğ olmalıdır.'); return; }
    if (dateOpen) { setError('Qaimədəki tarixlə seçdiyiniz tarix fərqlidir — hansını yazaq, seçin.'); return; }
    const cost = !finance && f.cost.trim() ? Number(f.cost.replace(',', '.')) : null;
    if (cost != null && (Number.isNaN(cost) || cost < 0)) { setError('Xərci rəqəmlə yazın.'); return; }
    setBusy(true); setError('');
    const problems: string[] = [];
    try {
      let workId = workRef.current;
      if (wantsWork && !workId) {
        const data: WorkInput = {
          title: name.slice(0, 200), category: (f.category || 'other') as WorkInput['category'], kind: equipmentId ? 'maintenance' : 'renovation',
          roomId: f.roomId || null, equipmentId: equipmentId ?? null, startDate: f.date || null, endDate: f.done ? f.date || null : null,
          status: f.done ? 'completed' : 'planned', description: f.description.trim(), materials: f.materials.trim(),
          ...(performer ? {} : { cost, currency: f.currency as WorkInput['currency'], warrantyNote: f.warranty.trim() }),
          ...(smetaProjectId ? { smetaProjectId } : {}),
        };
        const work = await create.mutateAsync({ homeId, data });
        workId = work.id; workRef.current = work.id;
        if (files.length) {
          try { await uploadHomeMedia(files, { workId: work.id, phase: f.done ? 'after' : 'before' }); setFiles([]); }
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
      }
      let saved: { total: string; unpaid: string } | null = null;
      if (lines.length) {
        const pid = await book();
        const date = receipt?.dateChoice === 'receipt' && receipt.aiDate ? receipt.aiDate : f.date;
        try {
          saved = await api<{ total: string; unpaid: string }>(`/home-projects/${pid}/daily-entries`, 'POST', {
            date, description: name.slice(0, 300), vendorName: f.vendorName.trim(), note: f.description.trim().slice(0, 2000), roomId: f.roomId || null,
            workId, invoiceId: receipt?.invoice.id ?? null, discount: discountC ? (discountC / 100).toFixed(2) : null, tax: taxC ? (taxC / 100).toFixed(2) : null, dateSource: receipt ? (receipt.dateChoice === 'receipt' ? (receipt.aiDateLabel.includes('əl ilə') ? 'handwritten' : 'printed') : 'manual') : undefined,
            lines: lines.map(l => ({ name: l.name.trim(), category: l.category, kind: lineKind(l), quantity: l.quantity || null, unit: l.unit, unitPrice: l.unitPrice || null, lineTotal: l.lineTotal || null, note: l.note, paid: l.paid })),
            idempotencyKey: key,
          });
        } catch (x) {
          // The work is saved; keep the form open so the lines can be sent again without a second work.
          setError(`${workId ? 'Görülən iş saxlanıldı, amma xərclər əlavə olunmadı: ' : ''}${errorText(x)}`); setBusy(false);
          void refreshHomeData(qc); return;
        }
        await Promise.all([qc.invalidateQueries({ queryKey: financeKey(pid) }), qc.invalidateQueries({ queryKey: booksKey })]);
      }
      clearDraft(draftKey);
      void refreshHomeData(qc);
      const money = saved ? ` · ${azn(Math.round(Number(saved.total) * 100))} xərclərə əlavə olundu${Number(saved.unpaid) > 0 ? `, ${azn(Math.round(Number(saved.unpaid) * 100))} ödənilməyib` : ''}` : '';
      toast(`${problems.length ? `Qeyd saxlanıldı. Alınmadı: ${problems.join(', ')} — iş səhifəsindən yenidən cəhd edin.` : 'Gündəlik qeyd saxlanıldı'}${money}`);
      onSaved(workId, homeId);
    } catch { setError('Qeyd saxlanılmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.'); }
    finally { setBusy(false); }
  };

  const saveLabel = lines.length && !f.title.trim() && !files.length ? 'Xərclərə əlavə et' : 'Yadda saxla';
  return <Modal open onClose={onClose} eyebrow={home.data?.home.name ?? 'Gündəlik qeyd'} title={heading ?? 'Gündəlik qeyd əlavə et'} wide
    footer={<>{lines.length > 0 && <span className="dl-foot-total">Cəmi: <b>{azn(dayTotal)}</b></span>}<button type="submit" form="quick-work" className="button button-primary hp-big" disabled={busy || !!reading} data-testid="button-save-work">{busy && <LoaderCircle className="spin" size={15} />}{busy ? 'Saxlanılır…' : saveLabel}</button></>}>
    <form id="quick-work" className="rl-form hp-quick" onSubmit={e => { void submit(e); }}>
      {restored && <div className="dl-restored" role="status" data-testid="day-restored">
        <Info size={16} /><span>Əvvəl başlayıb yadda saxlamadığınız qeyd bərpa olundu{restored.date ? ` (tarix: ${azDate(restored.date)})` : ''}{restored.lines ? ` — ${restored.lines} sətir` : ''}. Yeni qeyd üçün təmizləyin.</span>
        <button type="button" className="button button-primary" onClick={startOver} data-testid="day-start-over">Təmizlə, yenidən başla</button>
        <button type="button" className="button button-quiet" onClick={() => setRestored(null)} data-testid="day-keep-draft">Davam et</button>
      </div>}
      {!fixedHome && <div className="field"><span>Hansı ev?</span>
        {canPickHome.length ? <div className="hp-chipset">{canPickHome.map(h => <button key={h.id} type="button" className={homeId === h.id ? 'on' : ''} onClick={() => { setHomeId(h.id); set('roomId', ''); projectRef.current = null; }} data-testid={`chip-home-${h.id}`}>{h.name}</button>)}</div>
          : <p className="rl-hint">Əvvəlcə ev əlavə edin.</p>}
      </div>}

      <div className="field-grid">
        <Field label="Qeyd tarixi" name="work-date" type="date" value={f.date} onChange={v => { set('date', v); setReceipt(r => r && { ...r, dateChoice: null }); }} />
        <div className="field"><span>Vəziyyət</span><div className="rl-seg" role="radiogroup" aria-label="Vəziyyət">
          <button type="button" role="radio" aria-checked={f.done} className={f.done ? 'on' : ''} onClick={() => set('done', true)}>Görülüb</button>
          <button type="button" role="radio" aria-checked={!f.done} className={!f.done ? 'on' : ''} onClick={() => set('done', false)}>Planlaşdırılır</button>
        </div></div>
      </div>
      <small className="rl-hint">Köhnə günü də yaza bilərsiniz — sadəcə əsl tarixini seçin.</small>

      <Field label={finance ? 'Görülən iş (istəyə bağlı)' : 'Nə edildi?'} name="work-title" value={f.title} onChange={v => set('title', v)} placeholder="məs. Fundament üçün qazıntı aparıldı" />
      <Field label="Qısa təsvir" name="work-description"><textarea rows={2} maxLength={6000} value={f.description} onChange={e => set('description', e.target.value)} placeholder="məs. Armatur bağlandı, sabah beton töküləcək" /></Field>

      <div className="field"><span>İşin foto və faylları</span>
        <div className="hp-upload-btns">
          <label className="button button-secondary"><input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf" data-testid="input-work-photos" onChange={e => { const l = Array.from(e.target.files ?? []); setFiles(p => [...p, ...l].slice(0, 20)); e.target.value = ''; }} /><ImagePlus size={15} />Foto, video və ya fayl</label>
          <label className="button button-quiet"><input type="file" hidden accept="image/*" capture="environment" onChange={e => { const l = Array.from(e.target.files ?? []); setFiles(p => [...p, ...l].slice(0, 20)); e.target.value = ''; }} /><Camera size={15} />Kamera</label>
        </div>
        {files.length > 0 && <div className="hp-chipset">{files.map((p, i) => <span key={i} className="hp-tag">{p.name}<button type="button" aria-label="Sil" onClick={() => setFiles(ps => ps.filter((_, j) => j !== i))}><X size={12} /></button></span>)}</div>}
        <small className="rl-hint">Görülən işin foto və videosu. Divarlar bağlanmazdan əvvəl xətlərin fotosu xüsusilə dəyərlidir.</small>
      </div>

      {finance && <section className="dl-section" aria-labelledby="dl-h">
        <div className="dl-head"><h3 id="dl-h">Material və işlər</h3>
          <button type="button" className="button button-secondary" onClick={() => receiptInput.current?.click()} disabled={!!reading} data-testid="button-receipt">{reading ? <LoaderCircle className="spin" size={15} /> : <ReceiptText size={15} />}Qaimə çək və ya yüklə</button>
          <input ref={receiptInput} type="file" hidden accept="image/*,application/pdf" onChange={e => { void uploadReceipt(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-receipt" />
        </div>
        {reading && <p className="fn-reading" role="status"><LoaderCircle className="spin" size={15} />{reading === 'upload' ? 'Qaimə yüklənir…' : 'AI qaiməni oxuyur — adətən 5–20 saniyə.'}</p>}
        {receipt && <div className="dl-receipt" data-testid="day-receipt">
          {receipt.mediaUrl && (receipt.pdf ? <a className="fn-pdf" href={receipt.mediaUrl} target="_blank" rel="noreferrer"><FileText size={20} />Qaiməni aç (PDF)</a> : <a href={receipt.mediaUrl} target="_blank" rel="noreferrer"><img src={receipt.mediaUrl} alt="Qaimə" /></a>)}
          <div>
            {readNote && <p className={receipt.invoice.aiResult ? 'fn-ai-note' : 'fn-note'}>{receipt.invoice.aiResult ? <Sparkles size={14} /> : <Info size={14} />}{readNote}</p>}
            <label className="fn-field"><span>Satıcı</span><input value={f.vendorName} onChange={e => set('vendorName', e.target.value)} data-testid="day-vendor" /></label>
            <div className="fn-grid2">
              <label className="fn-field"><span>Endirim, AZN</span><input inputMode="decimal" value={receipt.discount} onChange={e => setReceipt(r => r && { ...r, discount: e.target.value })} placeholder="0" data-testid="day-discount" /></label>
              <label className="fn-field"><span>Vergi (ƏDV), AZN</span><input inputMode="decimal" value={receipt.tax} onChange={e => setReceipt(r => r && { ...r, tax: e.target.value })} placeholder="0" data-testid="day-tax" /></label>
            </div>
          </div>
        </div>}
        {dateOpen && <div className="dl-date" role="alert" data-testid="day-date-choice"><CalendarDays size={16} />
          <span>{receipt!.aiDateLabel}: <b>{azDate(receipt!.aiDate)}</b>. Seçdiyiniz tarix: <b>{azDate(f.date)}</b>. Hansını yazaq?</span>
          <button type="button" className="button button-primary" onClick={() => setReceipt(r => r && { ...r, dateChoice: 'receipt' })} data-testid="day-date-receipt">Qaimənin tarixi</button>
          <button type="button" className="button button-secondary" onClick={() => setReceipt(r => r && { ...r, dateChoice: 'mine' })} data-testid="day-date-mine">Seçdiyim tarix</button>
        </div>}
        {receipt?.dateChoice === 'receipt' && receipt.aiDate && <p className="fn-note"><CalendarDays size={14} />Xərc qaimənin tarixi ilə yazılacaq: {azDate(receipt.aiDate)}</p>}
        <LinesEditor lines={f.lines} onChange={l => set('lines', l)} />
        <DayTotals lines={lines} discount={discountC} tax={taxC} />
        {receiptDiff ? <p className="fn-mismatch" role="alert" data-testid="day-receipt-diff"><AlertTriangle size={14} /><span>Qaimədə yekun {receipt!.total} AZN-dir, sətirlərin cəmi isə {(dayTotal / 100).toFixed(2)} AZN. Məbləğ avtomatik dəyişdirilmir — qaimə ilə yoxlayın.</span></p> : null}
        {!lines.length && !receipt && <small className="rl-hint">Həmin gün alınan materialları, usta və fəhlə haqqını, texnika və daşınmanı sətir-sətir yazın. Hər sətir evin xərc jurnalına və Excel-ə düşür.</small>}
      </section>}

      <button type="button" className={`hp-more ${more ? 'open' : ''}`} onClick={() => setMore(!more)} aria-expanded={more} data-testid="button-more"><ChevronDown size={15} />Əlavə məlumat (istəyə bağlı): otaq, işin növü, usta, zəmanət</button>
      {more && <div className="hp-more-body">
        {!!home.data?.rooms.length && <div className="field"><span>Otaq və ya zona</span>
          <div className="hp-chipset">{[{ id: '', name: 'Bütün ev' }, ...home.data.rooms].map(r => <button key={r.id || 'all'} type="button" className={f.roomId === r.id ? 'on' : ''} onClick={() => set('roomId', r.id)}>{r.name}</button>)}</div>
        </div>}
        <div className="field"><span>İşin növü</span>
          <div className="hp-chipset">{QUICK_CATEGORIES.map(c => <button key={c} type="button" className={f.category === c ? 'on' : ''} onClick={() => set('category', f.category === c ? '' : c)} data-testid={`chip-cat-${c}`}>{WORK_CATEGORY[c]}</button>)}</div>
          {['electrical', 'plumbing', 'heating', 'hvac'].includes(f.category) && <small className="hp-tip" data-testid="hint-hidden-lines">Xatırlatma: suvaq və üzlük işlərindən əvvəl xətlərin fotosunu çəkin — sonra “Texniki məlumatlar”da foto üzərində yerini göstərə bilərsiniz.</small>}
        </div>
        <Field label="Material və avadanlıq (mətn)" name="work-materials"><textarea rows={2} maxLength={3000} value={f.materials} onChange={e => set('materials', e.target.value)} placeholder="məs. PPR boru 20 mm, Baxi kombi Eco 4s" /></Field>
        {finance && !receipt && <label className="field"><span>Satıcı və ya usta (istəyə bağlı)</span><input value={f.vendorName} onChange={e => set('vendorName', e.target.value)} placeholder="məs. Bakı Tikinti Materialları" data-testid="day-vendor-manual" /></label>}

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
          {!finance && <div className="field-grid">
            <Field label="Xərc" name="work-cost" type="number" min="0" step="0.01" value={f.cost} onChange={v => set('cost', v)} placeholder="məs. 450" />
            <label className="field"><span>Valyuta</span><select value={f.currency} onChange={e => set('currency', e.target.value)} data-testid="select-currency">{CURRENCY.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          </div>}
          <Field label="Zəmanət" name="work-warranty" value={f.warranty} onChange={v => set('warranty', v)} placeholder="məs. 2 il, 2026-cı ilin mayına qədər" />
          <small className="rl-hint">{finance ? 'İşin dəyərini yuxarıda “Material və işlər” bölməsində sətir kimi yazın (məs. “Usta haqqı”) — belə o, xərc jurnalına bir dəfə düşür.' : 'Xərc və zəmanət yalnız evə girişi olanlara görünür; paylaşımda göstərilmir.'}</small>
        </>}
      </div>}
      {error && <p className="sm-field-error" role="alert" data-testid="day-error">{error}</p>}
    </form>
  </Modal>;
}
