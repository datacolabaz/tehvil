import { Link } from 'wouter';
import { ArrowRight, Calculator, Camera, History, Plus, Wallet } from 'lucide-react';
import { azn, useBooks } from '@/lib/finance/api';
import { useEstimates } from '@/lib/estimate/api';
import './expenses.css';

/** Signed-in start: the same two tools as the landing, with what the person already has in each. */
export function StartPage() {
  const books = useBooks();
  const est = useEstimates();
  const b = books.data?.books ?? [];
  const e = est.data ?? [];
  const total = b.reduce((s, x) => s + x.total, 0), month = b.reduce((s, x) => s + x.month, 0);
  return <div className="st2">
    <h1 className="font-display ex-title">Nə edək?</h1>
    <div className="st2-tools">
      <section className="st2-tool" data-testid="start-smeta">
        <span className="l2-icon"><Calculator size={24} /></span>
        <h2>AI Smeta</h2>
        <p>Layihəni yüklə, tikinti materiallarını və təxmini xərcləri hesabla.</p>
        {e.length > 0 && <ul className="st2-list">{e.slice(0, 3).map((x) => <li key={x.id}><Link href={`/smeta-ai/${x.id}`}>{x.name}</Link><small>{x.status === 'questions' ? `${x.openQuestions} sual gözləyir` : x.itemCount ? `${x.itemCount} sətir` : 'hazırlanır'}</small></li>)}</ul>}
        <Link href="/smeta-ai/yeni" className="button button-primary st2-cta" data-testid="start-smeta-cta"><Plus size={18} />Smeta yarat</Link>
        {e.length > 3 && <Link href="/smeta-ai" className="text-link">Bütün smetalar ({e.length})</Link>}
      </section>
      <section className="st2-tool" data-testid="start-expenses">
        <span className="l2-icon"><Wallet size={24} /></span>
        <h2>Evimin xərcləri</h2>
        <p>Xərclərini qeyd et, büdcəni və indiyə qədər nə qədər pul xərclədiyini gör.</p>
        {b.length > 0 && <div className="st2-sum"><span><small>Ümumi</small><b>{azn(total)}</b></span><span><small>Bu ay</small><b>{azn(month)}</b></span></div>}
        <Link href="/xercler?add=1" className="button button-primary st2-cta" data-testid="start-expenses-cta"><Camera size={18} />Xərc əlavə et</Link>
        {b.length > 0 && <Link href="/xercler" className="text-link">Xərclərə bax<ArrowRight size={14} /></Link>}
      </section>
    </div>
    <Link href="/homes" className="l2-history"><History size={16} />Evimin tarixçəsi — tikinti fotoları mərhələlər üzrə<ArrowRight size={14} /></Link>
  </div>;
}
