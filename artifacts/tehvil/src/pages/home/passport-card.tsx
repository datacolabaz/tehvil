import { useState } from 'react';
import { Link } from 'wouter';
import { BellRing, Calculator, CheckCircle2, Circle, Download, Info, Search } from 'lucide-react';
import { useCreateServiceInterest, useGetHomeCosts, useGetHomePassport, useListMyReminders, type HomeCosts } from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Modal, toast } from '@/components/home/ui';
import { WORK_CATEGORY, day, dayTime, money } from '@/lib/home/labels';

/** What the passport contains. The percent counts filled sections only — it is not a rating of the home. */
export function PassportCard({ homeId }: { homeId: string }) {
  const q = useGetHomePassport(homeId);
  const [open, setOpen] = useState(false);
  if (!q.data) return null;
  const p = q.data;
  const shown = open ? p.sections : p.sections.slice(0, 6);
  return <section className="surface hp-section hp-passport" data-testid="passport-card">
    <div className="hp-pass-top">
      <div><h2>Evin pasportu</h2><small>{p.lastChangeAt ? `Son dəyişiklik: ${dayTime(p.lastChangeAt)}` : 'Hələ məlumat yoxdur'}</small></div>
      <div className="hp-pass-meter" aria-label={`Məlumat tamlığı ${p.percent}%`}><b data-testid="passport-percent">{p.percent}%</b><span>məlumat tamlığı · {p.filledSections}/{p.totalSections} bölmə</span><div><i style={{ width: `${p.percent}%` }} /></div></div>
    </div>
    <div className="hp-pass-grid">{shown.map(s => <Link key={s.key} href={s.path} className={`hp-pass-row ${s.filled ? 'on' : ''}`} data-testid={`passport-${s.key}`}>
      {s.filled ? <CheckCircle2 size={15} /> : <Circle size={15} />}<span><b>{s.label}</b><small>{s.filled ? `${s.count} qeyd` : 'Məlumat yoxdur'} · {s.hint}</small></span>
    </Link>)}</div>
    {p.sections.length > 6 && <button type="button" className="sm-link-btn" onClick={() => setOpen(!open)}>{open ? 'Daha az göstər' : `Bütün ${p.sections.length} bölmə`}</button>}
    <div className="hp-pass-sources" aria-label="Məlumatın mənbəyi">
      <span><i className="s-owner" />Ev sahibi və ailə daxil edib: <b>{p.sources.owner}</b></span>
      <span><i className="s-pro" />Podratçı daxil edib: <b>{p.sources.contractor}</b></span>
      <span><i className="s-doc" />Sənəd əlavə olunub: <b>{p.sources.documented}</b></span>
      <span><i className="s-spec" />Yoxlanılıb (dəvətli şəxs): <b>{p.sources.specialist}</b></span>
    </div>
    <div className="hp-pass-inspect"><span><b>Texniki yoxlama hesabatı</b><small>Varsa, “Sənədlər”ə yükləyin. Yoxlama sifarişi hələ yoxdur.</small></span><InterestButton kind="inspection" homeId={homeId} /></div>
    <p className="rl-hint"><Info size={13} className="sm-ii" /> Tamlıq faizi yalnız bölmələrin doldurulduğunu göstərir — evin texniki vəziyyətinin, təhlükəsizliyinin və ya keyfiyyətinin qiymətləndirilməsi deyil. Pasport rəsmi sertifikat deyil.</p>
  </section>;
}

/** Upcoming service dates and warranty ends for this home. Shown in the app only. */
export function HomeReminders({ homeId }: { homeId: string }) {
  const q = useListMyReminders();
  const list = (q.data ?? []).filter(r => r.homeId === homeId);
  if (!list.length) return null;
  return <section className="surface hp-section hp-reminders" data-testid="home-reminders">
    <h2><BellRing size={15} className="sm-ii" /> Xatırlatmalar</h2>
    <ul>{list.map(r => <li key={`${r.kind}-${r.equipmentId}`} className={r.overdue ? 'late' : ''}><Link href={`/homes/${homeId}/equipment`}><b>{r.title}</b><small>{r.overdue ? `Vaxtı keçib: ${day(r.dueDate)}` : day(r.dueDate)}</small></Link></li>)}</ul>
    <small className="rl-hint">Xatırlatmalar yalnız saytda görünür — SMS, WhatsApp və ya e-poçt göndərilmir.</small>
  </section>;
}

function csv(costs: HomeCosts, homeName: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: (string | number)[][] = [['Ev', 'Bölmə', 'Ad', 'Valyuta', 'Məbləğ', 'Say']];
  costs.byCategory.forEach(c => rows.push([homeName, 'Faktiki (işlər)', WORK_CATEGORY[c.key] ?? c.key, c.currency, c.total, c.count]));
  costs.estimates.forEach(e => {
    if (e.estimatedTotal != null) rows.push([homeName, 'Smeta (təxmini)', e.name, 'AZN', e.estimatedTotal, 1]);
    if (e.spentTotal != null) rows.push([homeName, 'Smeta xərc jurnalı', e.name, 'AZN', e.spentTotal, 1]);
  });
  return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
}

/** Costs: the actual amounts entered on works, and estimates saved in the home — never mixed into one number. */
export function HomeCostsCard({ homeId, homeName }: { homeId: string; homeName: string }) {
  const q = useGetHomeCosts(homeId);
  if (!q.data) return null;
  const c = q.data;
  const download = () => {
    const blob = new Blob([csv(c, homeName)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tehvil-xercler-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const empty = !c.byCurrency.length && !c.estimates.length;
  return <section className="surface hp-section hp-costs" data-testid="home-costs">
    <div className="section-head"><h2><Calculator size={15} className="sm-ii" /> Xərclər</h2>{!empty && <button type="button" className="sm-link-btn" onClick={download} data-testid="button-costs-csv"><Download size={13} />CSV yüklə</button>}</div>
    {empty ? <p className="rl-hint">Hələ xərc qeyd olunmayıb. İş əlavə edərkən “Əlavə məlumat” bölməsində məbləği yazın, ilkin hesablama üçün isə <Link href="/smeta/new">AI Smeta</Link> hazırlayın.</p> : <>
      <div className="hp-cost-totals">{c.byCurrency.map(x => <div key={x.currency}><small>Faktiki xərc ({x.count} iş)</small><b>{money(x.total, x.currency)}</b></div>)}
        {!c.byCurrency.length && <div><small>Faktiki xərc</small><b className="muted">Məlumat yoxdur</b></div>}</div>
      {c.byCategory.length > 0 && <ul className="hp-cost-cats">{c.byCategory.map(x => {
        const max = Math.max(...c.byCategory.filter(y => y.currency === x.currency).map(y => y.total)) || 1;
        return <li key={`${x.key}-${x.currency}`}><span>{WORK_CATEGORY[x.key] ?? x.key}</span><div><i style={{ width: `${Math.max(4, (x.total / max) * 100)}%` }} /></div><b>{money(x.total, x.currency)}</b></li>;
      })}</ul>}
      {c.estimates.length > 0 && <div className="hp-cost-est"><small>Smetalar (təxmini, faktiki xərcə qatılmır)</small>{c.estimates.map(e => <p key={e.id} className="hp-kvline"><span><b>{e.name}</b></span><small>Smeta: {e.estimatedTotal != null ? money(e.estimatedTotal, 'AZN') : '—'} · smetanın xərc jurnalı: {e.spentTotal != null ? money(e.spentTotal, 'AZN') : '—'}</small></p>)}</div>}
      {c.worksWithoutCost > 0 && <small className="rl-hint">{c.worksWithoutCost} görülmüş işdə məbləğ yazılmayıb.</small>}
    </>}
  </section>;
}

const INTEREST: Record<string, { title: string; text: string }> = {
  inspection: { title: 'Müstəqil texniki yoxlama', text: 'Bu xidmət hələ yoxdur: sifariş və ödəniş qəbul olunmur. Marağınızı bildirsəniz, mütəxəssis şəbəkəsi qurulanda sizinlə əlaqə saxlayacağıq. Artıq əlinizdə olan yoxlama hesabatını “Sənədlər” bölməsinə yükləyə bilərsiniz.' },
  handover: { title: 'Tikinti şirkəti üçün rəqəmsal təhvil', text: 'Yeni mənzilləri alıcıya pasportla təhvil vermək üçün kommersiya təklifi hələ hazırlanır. Hazırda ev sahibi sizi konkret evə və ya işə dəvət edə bilər. Marağınızı bildirin — əlaqə saxlayaq.' },
};

export function InterestButton({ kind, homeId, label }: { kind: 'inspection' | 'handover'; homeId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const send = useCreateServiceInterest();
  const info = INTEREST[kind];
  return <>
    <button type="button" className="button button-secondary sm-btn-sm" onClick={() => setOpen(true)} data-testid={`button-interest-${kind}`}><Search size={14} />{label ?? 'Marağınızı bildirin'}</button>
    <Modal open={open} onClose={() => setOpen(false)} eyebrow="Hazırlanır" title={info.title}
      footer={done ? undefined : <button type="button" className="button button-primary" disabled={send.isPending} data-testid="button-send-interest" onClick={() => send.mutate({ data: { kind, homeId: homeId ?? null, contact: contact.trim(), note: note.trim() } }, { onSuccess: () => { setDone(true); toast('Qeyd olundu'); } })}>Marağımı bildir</button>}>
      {done ? <p className="hp-text">Təşəkkür edirik — qeyd olundu. Heç nə sifariş edilmədi və ödəniş tələb olunmur.</p> : <div className="rl-form">
        <p className="rl-hint">{info.text}</p>
        <label className="field"><span>Əlaqə (istəyə bağlı)</span><input value={contact} onChange={e => setContact(e.target.value)} maxLength={200} placeholder="Telefon və ya e-poçt" /></label>
        <label className="field"><span>Qeyd (istəyə bağlı)</span><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></label>
      </div>}
    </Modal>
  </>;
}

/** Landing-page "Marağınızı bildirin" target. */
export function InterestPage({ kind }: { kind: string }) {
  const k = kind === 'handover' ? 'handover' : 'inspection';
  return <>
    <PageHeading eyebrow="Hazırlanır" title={INTEREST[k].title} description={INTEREST[k].text} />
    <InterestButton kind={k} />
  </>;
}
