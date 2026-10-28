import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { api, azDate, azn, errorText } from '@/lib/finance/api';
import type { Agreement } from '@/lib/finance/agreements';
import '../home/stages.css';
import './work-entry.css';

/**
 * The tradesperson's page (no account): this agreement only — plan, payments, paid and left. Each payment can be
 * confirmed ("Aldım") or disputed with a short note; the owner sees both. Nothing else of the home is shown.
 */
const cents = (s: string | null | undefined) => Math.round(Number(s ?? 0) * 100);
const ST: Record<string, string> = { paid: 'Ödənilib', partial: 'Qismən', overdue: 'Vaxtı keçib', upcoming: 'Gözlənilir' };

export function AgreementLinkPage({ token }: { token: string }) {
  const [a, setA] = useState<Agreement | null>(null);
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(''); const [disputing, setDisputing] = useState<string | null>(null); const [note, setNote] = useState('');
  useEffect(() => { api<Agreement>(`/agreement-links/${token}`).then(setA).catch((e) => setErr(errorText(e))).finally(() => setLoading(false)); }, [token]);
  const answer = async (id: string, status: 'confirmed' | 'disputed') => {
    setBusy(id); setErr('');
    try { setA(await api<Agreement>(`/agreement-links/${token}/payments/${id}`, 'POST', { status, note: status === 'disputed' ? note.trim() : '' })); setDisputing(null); setNote(''); }
    catch (e) { setErr(errorText(e)); } finally { setBusy(''); }
  };
  if (loading) return <div className="fi-page"><LoaderCircle className="spin" size={28} /></div>;
  if (!a) return <div className="fi-page" data-testid="agl-invalid"><div className="fi-card"><h1>Link işləmir</h1><p>{err || 'Link etibarsızdır və ya ev sahibi onu bağlayıb.'}</p></div></div>;
  return <div className="fi-page agl" data-testid="agl-page">
    <div className="fi-brand"><img src="/favicon.svg" alt="" width={22} height={22} />Tehvil.az</div>
    <div className="fi-card">
      <small className="fi-home">Razılaşma · {a.contractorName}</small>
      <h1 data-testid="agl-title">{a.title}</h1>
      <p className="we-hint">{a.basisLabel}{a.rate && a.units ? ` · ${String(Number(a.units)).replace('.', ',')} ${a.unit} × ${azn(cents(a.rate))}` : ''}{a.startDate ? ` · ${azDate(a.startDate)}` : ''}{a.endDate ? ` – ${azDate(a.endDate)}` : ''}</p>
      <div className="agl-figs">
        <div><small>Razılaşma</small><b data-testid="agl-total">{azn(cents(a.summary.total))}</b></div>
        <div><small>Ödənilib</small><b data-testid="agl-paid">{azn(cents(a.summary.paid))}</b></div>
        <div><small>Qalıb</small><b data-testid="agl-left">{azn(cents(a.summary.remaining))}</b></div>
      </div>

      {a.plan.length > 0 && <><h2>Ödəniş planı</h2><ol className="we-plan-list">{a.plan.map((r, i) => <li key={r.id ?? i} className={r.status}>
        <span><b>{r.label || 'Ödəniş'}</b><small>{r.dueDate ? azDate(r.dueDate) : 'tarixsiz'}</small></span><span className="we-amt">{azn(cents(r.amount))}</span><em className={`we-st ${r.status}`}>{ST[r.status ?? 'upcoming']}</em>
      </li>)}</ol></>}

      <h2>Ödənişlər</h2>
      {!a.payments.length ? <p className="we-hint">Hələ ödəniş qeyd olunmayıb.</p>
        : <ul className="we-pays agl-pays">{a.payments.map((p) => <li key={p.id} data-testid="agl-payment">
          <span><b>{azDate(p.date)}</b></span><span className="we-amt">{azn(cents(p.amount))}</span>
          {p.status === 'confirmed' ? <em className="we-st paid"><CheckCircle2 size={12} />Siz təsdiqlədiniz</em>
            : p.status === 'disputed' ? <em className="we-st overdue"><AlertTriangle size={12} />Etirazınız: {p.counterpartyNote}</em>
              : disputing === p.id ? <div className="agl-dispute">
                <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nə düz deyil? məs. 450 AZN aldım, 500 yox" data-testid="agl-note" />
                <div className="we-actions"><button type="button" className="button button-secondary" onClick={() => setDisputing(null)}>Geri</button>
                  <button type="button" className="button button-primary" disabled={!!busy || !note.trim()} onClick={() => void answer(p.id, 'disputed')} data-testid="agl-dispute-send">Göndər</button></div>
              </div>
                : <div className="we-actions agl-btns">
                  <button type="button" className="button button-primary" disabled={!!busy} onClick={() => void answer(p.id, 'confirmed')} data-testid="agl-confirm">{busy === p.id ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={15} />}Aldım</button>
                  <button type="button" className="button button-quiet" disabled={!!busy} onClick={() => { setDisputing(p.id); setNote(''); }} data-testid="agl-dispute">Düz deyil</button>
                </div>}
        </li>)}</ul>}
      {err && <p className="fi-err" role="alert">{err}</p>}
    </div>
    <p className="fi-legal">Bu səhifədə yalnız sizinlə olan razılaşma görünür. Ev sahibi “Aldım” və ya etirazınızı görür. Hesab lazım deyil.</p>
  </div>;
}
