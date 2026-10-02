import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Plus, WalletCards } from 'lucide-react';
import type { PaymentItem } from '@workspace/api-client-react';
import { Button, Field, PageHeading, QuerySection, Status, date, money, type T } from '@/components/kit';
import { FilePicker, MediaList, useEvidenceUpload } from '@/components/evidence';

export function PaymentsPage(p: any) {
  const { t, payments, id, createPayment, markSent, confirmReceived, lang, refreshCore, notify, isOwner, isContractor } = p as Record<string, any> & { t: T };
  const canWrite = isOwner;
  const upload = useEvidenceUpload();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', dueCondition: '', dueDate: '' });
  const [sending, setSending] = useState<string | null>(null);
  const [sendForm, setSendForm] = useState<{ note: string; files: File[] }>({ note: '', files: [] });
  const [busy, setBusy] = useState(false);
  const list: PaymentItem[] = payments.data || [];
  const submit = (e: FormEvent) => { e.preventDefault(); createPayment.mutate({ projectId: id, data: { title: form.title, amount: Number(form.amount), dueCondition: form.dueCondition || null, dueDate: form.dueDate || null } }, { onSuccess: () => { setOpen(false); setForm({ title: '', amount: '', dueCondition: '', dueDate: '' }); refreshCore(); notify(t('created')); } }); };
  const sendMarked = async (item: PaymentItem) => {
    setBusy(true);
    try {
      const media = await upload(sendForm.files);
      markSent.mutate({ paymentId: item.id, data: { note: sendForm.note || null, media } }, { onSuccess: () => { setSending(null); setSendForm({ note: '', files: [] }); refreshCore(); notify(t('sent')); }, onSettled: () => setBusy(false) });
    } catch { setBusy(false); }
  };
  return <><PageHeading eyebrow={t('eyManual')} title={t('payments')} description={t('manualPayment')} action={canWrite ? <Button onClick={() => setOpen(!open)} testId="button-add-payment"><Plus size={16} />{t('addPayment')}</Button> : undefined} />
    <div className="notice manual-notice"><WalletCards size={19} /><span>{t('manualPayment')}</span></div>
    {open && <form className="surface form-card compact-form" onSubmit={submit}><div className="field-grid"><Field label={t('paymentTitle')} name="payment-title" required value={form.title} onChange={v => setForm({ ...form, title: v })} /><Field label={t('amount')} name="payment-amount" type="number" min="0" required value={form.amount} onChange={v => setForm({ ...form, amount: v })} /></div><Field label={t('dueCondition')} name="due-condition" value={form.dueCondition} onChange={v => setForm({ ...form, dueCondition: v })} /><Field label={t('dueDate')} name="due-date" type="date" value={form.dueDate} onChange={v => setForm({ ...form, dueDate: v })} /><div className="inline-actions"><Button variant="secondary" onClick={() => setOpen(false)}>{t('cancel')}</Button><Button type="submit" disabled={createPayment.isPending}>{t('save')}</Button></div></form>}
    <QuerySection q={payments} t={t}><div className="payment-list">{list.map(item => <article className="payment-row surface" key={item.id} data-testid={`row-payment-${item.id}`}>
      <div className="payment-badge"><WalletCards size={19} /></div>
      <div className="payment-title"><span className="eyebrow">{item.dueCondition || date(item.dueDate, lang)}</span><h3>{item.title}</h3>{item.note && <p>{item.note}</p>}<MediaList media={item.media} projectId={id} t={t} /></div>
      <strong className="payment-amount">{money(item.amount)} <small>{item.currency}</small></strong><Status value={item.status} t={t} />
      <div className="payment-actions">
        {isOwner && (item.status === 'due' || item.status === 'planned') && sending !== item.id && <Button variant="secondary" onClick={() => { setSending(item.id); setSendForm({ note: '', files: [] }); }} testId={`button-mark-sent-${item.id}`}><ArrowUpRight size={14} />{t('markSent')}</Button>}
        {isContractor && item.status === 'marked_sent' && <Button disabled={confirmReceived.isPending} onClick={() => confirmReceived.mutate({ paymentId: item.id, data: { note: null } }, { onSuccess: () => { refreshCore(); notify(t('received')); } })} testId={`button-confirm-${item.id}`}><Check size={14} />{t('confirmReceived')}</Button>}
      </div>
      {sending === item.id && <div className="payment-send-form"><Field label={t('markSentNote')} name={`sent-note-${item.id}`}><textarea value={sendForm.note} onChange={e => setSendForm({ ...sendForm, note: e.target.value })} /></Field><FilePicker files={sendForm.files} onChange={files => setSendForm({ ...sendForm, files })} t={t} label={t('receipt')} tip={t('receiptTip')} testId={`receipt-${item.id}`} /><div className="inline-actions"><Button variant="quiet" onClick={() => setSending(null)}>{t('cancel')}</Button><Button disabled={busy || markSent.isPending} onClick={() => { void sendMarked(item); }}><ArrowUpRight size={14} />{t('markSent')}</Button></div></div>}
    </article>)}{!list.length && <div className="empty-projects compact-empty"><div className="empty-illustration"><WalletCards size={32} /></div><h2 className="font-display">{t('empty')}</h2>{canWrite && <Button onClick={() => setOpen(true)}><Plus size={16} />{t('addPayment')}</Button>}</div>}</div></QuerySection></>;
}
