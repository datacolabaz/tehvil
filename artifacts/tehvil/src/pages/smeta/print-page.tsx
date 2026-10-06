import { Fragment, useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/kit';
import { changeImpact, changeTotals, lineTotals, projectTotals, round2 } from '@/lib/smeta/calc';
import { PROPERTY_LABEL, QUALITY_LABEL, RENOVATION_LABEL } from '@/lib/smeta/catalog';
import { CHANGE_STATUS_LABEL } from '@/lib/smeta/export';
import { azn, dateAz, dateTimeAz, num, signedAzn, qty } from '@/lib/smeta/format';
import { ESTIMATE_STATUS_LABEL, hasUnsentChanges, useSmetaProject } from '@/lib/smeta/store';

/**
 * Print-optimised estimate. "PDF ixrac et" opens this route and the browser's
 * "Save as PDF" produces the file.
 * TODO(api): replace with a server-rendered PDF (e.g. headless Chromium) for signed archives.
 */
export function EstimatePrintPage({ projectId }: { projectId: string }) {
  const p = useSmetaProject(projectId);
  useEffect(() => {
    if (!p) return;
    document.title = `Smeta — ${p.name} — v${p.estimate.version}`;
    const t = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(t);
  }, [p?.id]);

  if (!p) return <div className="sm-print-page"><div className="sm-empty surface"><h3>Smeta tapılmadı</h3><Link href="/smeta" className="button button-primary"><ArrowLeft size={16} />AI Smeta</Link></div></div>;

  const t = projectTotals(p);
  const ct = changeTotals(p.changeOrders);
  const finalTotal = round2(t.total + ct.approved);
  const approval = p.approvals.find(a => a.estimateVersion === p.estimate.version);
  const draft = !p.share || hasUnsentChanges(p);
  const clientPart = (v: number, m: number) => round2(v * (1 + m));
  let material = 0, labor = 0;
  for (const it of p.estimate.sections.flatMap(s => s.items)) { const l = lineTotals(it, p.defaultMarginPercentage); material += clientPart(l.materialTotal + l.wasteAmount, l.marginPercentage); labor += clientPart(l.laborTotal, l.marginPercentage); }
  material = round2(material); labor = round2(labor);

  return <div className="sm-print-page">
    <div className="sm-print-toolbar">
      <Link href={`/smeta/${p.id}?tab=documents`} className="button button-secondary"><ArrowLeft size={16} />Smetaya qayıt</Link>
      <span className="sm-muted" style={{ fontSize: 13 }}>Çap pəncərəsində “PDF kimi saxla” seçin</span>
      <Button onClick={() => window.print()}><Printer size={16} />Çap et / PDF</Button>
    </div>
    <article className="sm-print-sheet">
      <div className="sm-print-head"><span className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></span><span className="eyebrow">Təmir smetası · v{p.estimate.version}</span></div>
      <div className="eyebrow" style={{ marginTop: 18, fontSize: 11 }}>{PROPERTY_LABEL[p.propertyKind]} · {RENOVATION_LABEL[p.renovationKind]} təmir · {QUALITY_LABEL[p.quality]} keyfiyyət</div>
      <h2>{p.name}</h2>
      <div style={{ color: '#6d7c72' }}>{p.address} · {qty(p.areaM2)} m² · Plan: {dateAz(p.startDate)} — {dateAz(p.endDate)}</div>

      <div className="sm-print-parties">
        <div><span>Sifarişçi</span><b>{p.client.name}</b><b style={{ fontWeight: 500 }}>{p.client.phone}{p.client.email ? ` · ${p.client.email}` : ''}</b></div>
        <div><span>Podratçı</span><b>{p.contractor.company}</b><b style={{ fontWeight: 500 }}>{p.contractor.name} · {p.contractor.phone}</b></div>
        <div><span>Status</span><b>{draft ? (p.share ? `Yenilənmiş qaralama — sifarişçi v${p.share.snapshot.version} versiyasını görür` : 'Qaralama — sifarişçiyə göndərilməyib') : approval ? `Sifarişçi təsdiq edib · ${dateAz(approval.approvedAt)}` : ESTIMATE_STATUS_LABEL[p.status]}</b><b style={{ fontWeight: 500 }}>Etibarlıdır: {dateAz(p.estimate.validUntil)}</b></div>
      </div>

      <h3>Xülasə</h3>
      <table className="sm-print-table"><tbody>
        <tr><td>Materiallar (ehtiyat daxil)</td><td className="r">{azn(material, 2)}</td></tr>
        <tr><td>İşçilik</td><td className="r">{azn(labor, 2)}</td></tr>
        <tr><td>Əlavə xərclər</td><td className="r">{azn(round2(t.total - material - labor), 2)}</td></tr>
        <tr className="tot"><td>Smeta üzrə cəmi</td><td className="r">{azn(t.total, 2)}</td></tr>
        {ct.approved !== 0 && <><tr><td>Təsdiqlənmiş dəyişikliklər</td><td className="r">{signedAzn(ct.approved)}</td></tr><tr className="tot"><td>Yekun məbləğ</td><td className="r">{azn(finalTotal, 2)}</td></tr></>}
      </tbody></table>

      <h3>Detallı iş cədvəli</h3>
      <table className="sm-print-table">
        <thead><tr><th>№</th><th>İşin adı</th><th>Otaq / Zona</th><th className="r">Miqdar</th><th className="r">Material</th><th className="r">İşçilik</th><th className="r">Cəmi, AZN</th></tr></thead>
        <tbody>{p.estimate.sections.map((s, si) => <Fragment key={s.id}>
          <tr className="cat"><td colSpan={7}>{String(si + 1).padStart(2, '0')}. {s.title}</td></tr>
          {s.items.map((it, ii) => { const l = lineTotals(it, p.defaultMarginPercentage); return <tr key={it.id}>
            <td>{si + 1}.{ii + 1}</td><td>{it.name}</td><td>{it.zone}</td><td className="r">{qty(it.quantity)} {it.unit}</td>
            <td className="r">{num(clientPart(l.materialTotal + l.wasteAmount, l.marginPercentage), 2)}</td><td className="r">{num(clientPart(l.laborTotal, l.marginPercentage), 2)}</td><td className="r"><b>{num(l.rowTotal, 2)}</b></td>
          </tr>; })}
        </Fragment>)}
          {p.projectCosts.map(c => <tr key={c.id}><td /><td colSpan={5}>{c.label}</td><td className="r">{num(c.amount, 2)}</td></tr>)}
          <tr className="tot"><td colSpan={6}>Cəmi</td><td className="r">{num(t.total, 2)}</td></tr>
        </tbody>
      </table>

      <div className="sm-print-cols">
        <div>
          <h3>Ödəniş qrafiki</h3>
          <table className="sm-print-table"><tbody>{p.payments.map(m => <tr key={m.id}><td>{m.title}<br /><span style={{ color: '#79877e' }}>{m.condition}</span></td><td className="r">{Math.round(m.share * 100)}%</td><td className="r">{azn(round2(finalTotal * m.share))}</td></tr>)}</tbody></table>
        </div>
        <div>
          <h3>Şərtlər və istisnalar</h3>
          <div><b>Daxildir:</b> {p.included.join('; ')}.</div>
          <div style={{ marginTop: 6 }}><b>Daxil deyil:</b> {p.excluded.join('; ')}.</div>
        </div>
      </div>

      {p.changeOrders.some(c => c.status !== 'draft') && <>
        <h3>Dəyişikliklər</h3>
        <table className="sm-print-table"><tbody>{p.changeOrders.filter(c => c.status !== 'draft').map(c => <tr key={c.id}><td>DS-{String(c.number).padStart(2, '0')} · {c.title}</td><td>{CHANGE_STATUS_LABEL[c.status]}</td><td className="r">{signedAzn(changeImpact(c))}</td></tr>)}</tbody></table>
      </>}

      <h3>Dəyişikliklərin idarə olunması</h3>
      <p style={{ margin: 0, lineHeight: 1.6 }}>Bu smeta ilkin ölçü və razılaşdırılmış iş həcmi əsasında hazırlanıb. Smetada olmayan hər iş və ya material dəyişikliyi ayrıca dəyişiklik sifarişi kimi rəsmiləşdirilir, sifarişçi təsdiq etdikdən sonra icra olunur və yekun məbləğə ayrıca əlavə edilir.</p>

      <div className="sm-signs"><div>Sifarişçi: {p.client.name}</div><div>Podratçı: {p.contractor.name}</div></div>
      <div className="sm-print-foot"><span>Smeta v{p.estimate.version} · Yaradılıb: {dateTimeAz(new Date())}</span><span>Təhvil · tehvil.az</span></div>
    </article>
  </div>;
}
