import { useState } from 'react';
import { FileText, LoaderCircle, Paperclip, Plus, ReceiptText, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/kit';
import { extractReceipt } from '@/lib/smeta/ai';
import { planVsActual, round2, sumExpenses } from '@/lib/smeta/calc';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/smeta/catalog';
import { PAYMENT_STATUS_LABEL } from '@/lib/smeta/export';
import { azn, dateAz, num, parseNumber, signedAzn, todayISO, uid } from '@/lib/smeta/format';
import { smeta } from '@/lib/smeta/store';
import type { ExpenseKind, PaymentStatus, Project, Receipt, ReceiptSuggestion, WorkCategory } from '@/lib/smeta/types';
import { DropItem, DropMenu, Modal, Pill, toast } from './ui';

const KIND_LABEL: Record<ExpenseKind, string> = { material: 'Material', labor: 'İşçilik', other: 'Digər' };
const PAY_TONE: Record<PaymentStatus, 'ok' | 'warn' | 'risk'> = { paid: 'ok', partial: 'warn', unpaid: 'risk' };

function VarianceCard({ title, planned, actual, completion }: { title: string; planned: number; actual: number; completion: number }) {
  const diff = round2(actual - planned);
  const expected = round2(planned * completion / 100);
  return <div className="surface sm-var-card">
    <div className="eyebrow">Plan və fakt</div>
    <h3>{title}</h3>
    <div className="sm-var-nums">
      <div><small>Planlanan</small><b className="num">{azn(planned)}</b></div>
      <div><small>Faktiki</small><b className="num">{azn(actual)}</b></div>
      <div><small>Fərq</small><b className={`num ${diff > 0 ? 'over' : 'under'}`}>{signedAzn(diff)}</b></div>
    </div>
    <div className="sm-budget-bar" style={{ marginTop: 14 }} role="img" aria-label={`Planın ${planned > 0 ? Math.round(actual / planned * 100) : 0}%-i xərclənib`}><span style={{ width: `${Math.min(100, planned > 0 ? actual / planned * 100 : 0)}%` }} /></div>
    <p className="sm-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>Planın {planned > 0 ? Math.round(actual / planned * 100) : 0}%-i xərclənib. İcra səviyyəsinə ({completion}%) görə gözlənilən: ~{azn(expected)}.</p>
  </div>;
}

export function ExpensesTab({ project: p }: { project: Project }) {
  const [filter, setFilter] = useState<ExpenseKind | 'all'>('all');
  const [open, setOpen] = useState(false);
  const pva = planVsActual(p);
  const items = p.estimate.sections.flatMap(s => s.items);
  const list = [...p.expenses].filter(e => filter === 'all' || e.kind === filter).sort((a, b) => b.date.localeCompare(a.date));
  const total = sumExpenses(list);

  return <>
    <div className="sm-variance">
      <VarianceCard title="Material xərcləri" planned={pva.plannedMaterial} actual={pva.actualMaterial} completion={p.completion} />
      <VarianceCard title="İşçilik xərcləri" planned={pva.plannedLabor} actual={pva.actualLabor} completion={p.completion} />
    </div>

    <div className="sm-filters">
      <div className="sm-seg" role="group" aria-label="Xərc növü">
        {(['all', 'material', 'labor', 'other'] as const).map(k => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'all' ? 'Hamısı' : KIND_LABEL[k]}</button>)}
      </div>
      <span className="sm-muted" style={{ fontSize: 13 }}>{list.length} xərc · {azn(total, 'auto')}</span>
      <span className="sm-spacer" style={{ flex: 1 }} />
      <Button onClick={() => setOpen(true)} testId="button-add-expense"><Plus size={16} />Xərc əlavə et</Button>
    </div>

    {list.length ? <div className="sm-table-card">
      <table className="sm-data-table" style={{ minWidth: 960 }}>
        <thead><tr><th>Tarix</th><th>Kateqoriya</th><th>Təsvir</th><th>Təchizatçı / Usta</th><th className="r">Məbləğ</th><th>Ödəniş statusu</th><th>Qəbz</th><th>Əlaqəli smeta sətri</th></tr></thead>
        <tbody>{list.map(e => {
          const r = p.receipts.find(x => x.id === e.receiptId);
          const line = items.find(i => i.id === e.lineItemId);
          return <tr key={e.id}>
            <td style={{ whiteSpace: 'nowrap' }}>{dateAz(e.date)}</td>
            <td>{CATEGORY_LABEL[e.category]}<small>{KIND_LABEL[e.kind]}</small></td>
            <td>{e.description}</td>
            <td>{e.vendor}</td>
            <td className="r num" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{azn(e.amount, 'auto')}</td>
            <td><DropMenu align="start" trigger={<button type="button" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }} aria-label={`Ödəniş statusu: ${PAYMENT_STATUS_LABEL[e.paymentStatus]}. Dəyişmək üçün seçin`}><Pill small tone={PAY_TONE[e.paymentStatus]}>{PAYMENT_STATUS_LABEL[e.paymentStatus]}</Pill></button>}>
              {(['paid', 'partial', 'unpaid'] as PaymentStatus[]).map(s => <DropItem key={s} onSelect={() => smeta.setExpenseStatus(p.id, e.id, s)}>{PAYMENT_STATUS_LABEL[s]}</DropItem>)}
            </DropMenu></td>
            <td>{r ? (r.previewUrl ? <a className="sm-receipt" href={r.previewUrl} target="_blank" rel="noreferrer" title={r.fileName}><Paperclip size={13} aria-hidden />Bax</a> : <span className="sm-receipt" title={r.fileName}><FileText size={13} aria-hidden />{r.fileType === 'pdf' ? 'PDF' : 'Foto'}</span>) : <span className="sm-muted" style={{ fontSize: 12 }}>Yoxdur</span>}</td>
            <td>{line ? <>{line.name}<small>{line.zone}</small></> : <span className="sm-muted" style={{ fontSize: 12 }}>Əlaqələndirilməyib</span>}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr><td colSpan={4} style={{ fontWeight: 700, color: '#2f5145' }}>Cəmi</td><td className="r num" style={{ fontWeight: 800, color: '#21473d', whiteSpace: 'nowrap' }}>{azn(total, 'auto')}</td><td colSpan={3} /></tr></tfoot>
      </table>
    </div> : <div className="sm-empty surface"><div className="empty-illustration"><ReceiptText size={28} /></div><h3>Hələ xərc daxil edilməyib</h3><p>Material alışlarını və usta ödənişlərini əlavə edin — plan-fakt müqayisəsi avtomatik yenilənəcək.</p><Button onClick={() => setOpen(true)}><Plus size={16} />Xərc əlavə et</Button></div>}

    <ExpenseModal project={p} open={open} onClose={() => setOpen(false)} />
  </>;
}

type AiKey = 'vendor' | 'date' | 'amount' | 'category' | 'kind';

function ExpenseModal({ project: p, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState<ExpenseKind>('material');
  const [category, setCategory] = useState<WorkCategory>('elektrik');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [pay, setPay] = useState<PaymentStatus>('paid');
  const [lineId, setLineId] = useState('');
  const [file, setFile] = useState<{ file: File; url: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [suggestion, setSuggestion] = useState<ReceiptSuggestion | null>(null);
  const [aiFields, setAiFields] = useState<Set<AiKey>>(new Set());
  const [tried, setTried] = useState(false);
  const lines = p.estimate.sections.filter(s => s.category === category).flatMap(s => s.items);
  const parsed = parseNumber(amount);
  const errors = { description: !description.trim() ? 'Xərcin təsvirini daxil edin' : '', vendor: !vendor.trim() ? 'Təchizatçı və ya ustanı göstərin' : '', amount: parsed === null || parsed <= 0 ? 'Məbləğ sıfırdan böyük olmalıdır' : '' };
  const touched = (k: AiKey) => setAiFields(s => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; });
  const reset = () => { setDate(todayISO()); setKind('material'); setDescription(''); setVendor(''); setAmount(''); setPay('paid'); setLineId(''); setFile(null); setSuggestion(null); setAiFields(new Set()); setTried(false); };
  const close = () => { reset(); onClose(); };

  const readReceipt = async () => {
    if (!file) return;
    setReading(true);
    try {
      const s = await extractReceipt(file.file);
      setSuggestion(s);
      setVendor(s.merchant); setDate(s.date); setAmount(num(s.total, 2)); setCategory(s.category); setKind(s.kind); setLineId('');
      if (!description.trim()) setDescription(`${CATEGORY_LABEL[s.category].replace(' işləri', '')} materialları`);
      setAiFields(new Set<AiKey>(['vendor', 'date', 'amount', 'category', 'kind']));
      toast('Qəbz oxundu — AI təkliflərini yoxlayın');
    } catch { toast('Qəbzi oxumaq mümkün olmadı. Məlumatları əl ilə daxil edin.'); }
    finally { setReading(false); }
  };

  const save = () => {
    setTried(true);
    if (errors.description || errors.vendor || errors.amount) return;
    const receipt: Receipt | undefined = file ? { id: uid('rc'), fileName: file.file.name, fileType: file.file.type === 'application/pdf' ? 'pdf' : 'image', uploadedAt: new Date().toISOString(), previewUrl: file.url, aiSuggestion: suggestion ?? undefined } : undefined;
    smeta.addExpense(p.id, { date, kind, category, description: description.trim(), vendor: vendor.trim(), amount: round2(parsed!), paymentStatus: pay, lineItemId: lineId || undefined }, receipt);
    toast('Xərc əlavə edildi');
    close();
  };

  const ai = (k: AiKey) => aiFields.has(k);
  const tag = (k: AiKey) => ai(k) ? <span className="sm-ai-tag"><Sparkles size={10} aria-hidden />AI təklifi</span> : null;
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="sm-field-error">{errors[k]}</small> : null;

  return <Modal open={open} onClose={close} eyebrow="Xərclər" title="Xərc əlavə et" wide footer={<><Button variant="secondary" onClick={close}>Ləğv et</Button><Button onClick={save}>Xərci yadda saxla</Button></>}>
    {file ? <div className="sm-receipt-preview">
      {file.file.type.startsWith('image/') ? <img src={file.url} alt="Qəbzin önizləməsi" /> : <span className="pdf">PDF</span>}
      <div><strong>{file.file.name}</strong><small className="sm-muted">{num(file.file.size / 1024, 0)} KB{suggestion ? ` · AI etibarlılığı ${Math.round(suggestion.confidence * 100)}%` : ''}</small></div>
      <button type="button" className="icon-button" aria-label="Qəbzi sil" onClick={() => { setFile(null); setSuggestion(null); setAiFields(new Set()); }}><Trash2 size={15} /></button>
    </div> : <label className="sm-drop" style={{ minHeight: 120, marginTop: 0 }}>
      <input type="file" accept="image/*,application/pdf" aria-label="Qəbz faylı seçin" onChange={e => { const f = e.target.files?.[0]; if (f) setFile({ file: f, url: URL.createObjectURL(f) }); e.target.value = ''; }} />
      <ReceiptText size={22} color="#3b5d50" aria-hidden /><strong>Qəbz yükləyin</strong><span>Şəkil və ya PDF — istəyə bağlı</span>
    </label>}
    <Button variant="secondary" onClick={() => { void readReceipt(); }} disabled={!file || reading} className="full-button" testId="button-ai-receipt">{reading ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{reading ? 'Qəbz oxunur…' : 'AI ilə qəbzdən məlumatı doldur'}</Button>
    {suggestion && <div className="sm-ai-notice" role="note" style={{ marginTop: 12 }}><Sparkles size={15} aria-hidden /><span>“AI təklifi” ilə işarələnmiş sahələr qəbzdən avtomatik doldurulub. Saxlamazdan əvvəl məbləği və tarixi qəbzlə müqayisə edin.</span></div>}

    <div className="field-grid" style={{ marginTop: 6 }}>
      <label className={`field ${ai('date') ? 'sm-ai-field' : ''}`}><span>Tarix</span>{tag('date')}<input type="date" value={date} onChange={e => { setDate(e.target.value); touched('date'); }} /></label>
      <label className={`field ${ai('kind') ? 'sm-ai-field' : ''}`}><span>Xərc növü</span>{tag('kind')}<select value={kind} onChange={e => { setKind(e.target.value as ExpenseKind); touched('kind'); }}>{(['material', 'labor', 'other'] as ExpenseKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
      <label className={`field ${ai('category') ? 'sm-ai-field' : ''}`}><span>Kateqoriya</span>{tag('category')}<select value={category} onChange={e => { setCategory(e.target.value as WorkCategory); setLineId(''); touched('category'); }}>{CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
      <label className={`field ${ai('amount') ? 'sm-ai-field' : ''}`}><span>Məbləğ, AZN<i> *</i></span>{tag('amount')}<input inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); touched('amount'); }} placeholder="0,00" aria-invalid={tried && !!errors.amount} />{err('amount')}</label>
      <label className="field full"><span>Təsvir<i> *</i></span><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Məs.: Kabel və rozetkalar, 2-ci partiya" aria-invalid={tried && !!errors.description} />{err('description')}</label>
      <label className={`field ${ai('vendor') ? 'sm-ai-field' : ''}`}><span>Təchizatçı / Usta<i> *</i></span>{tag('vendor')}<input value={vendor} onChange={e => { setVendor(e.target.value); touched('vendor'); }} aria-invalid={tried && !!errors.vendor} />{err('vendor')}</label>
      <label className="field"><span>Ödəniş statusu</span><select value={pay} onChange={e => setPay(e.target.value as PaymentStatus)}>{(['paid', 'partial', 'unpaid'] as PaymentStatus[]).map(s => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}</select></label>
      <label className="field full"><span>Əlaqəli smeta sətri</span><select value={lineId} onChange={e => setLineId(e.target.value)} disabled={!lines.length}><option value="">{lines.length ? 'Seçilməyib' : 'Bu kateqoriyada smeta sətri yoxdur'}</option>{lines.map(l => <option key={l.id} value={l.id}>{l.name} · {l.zone}</option>)}</select></label>
    </div>
  </Modal>;
}
