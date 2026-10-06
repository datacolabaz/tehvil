import { CheckCircle2, Copy, Download, ExternalLink, FileImage, FileSpreadsheet, FileText, Link2, MessageSquareText, ReceiptText, Send } from 'lucide-react';
import { Button } from '@/components/kit';
import { clientFinalTotal, projectTotals, round2 } from '@/lib/smeta/calc';
import { azn, dateAz, dateTimeAz } from '@/lib/smeta/format';
import type { Project } from '@/lib/smeta/types';
import { runExport } from './export-actions';
import { copyText, publicEstimateUrl } from './send-modal';
import { Pill } from './ui';

const MILESTONE = { paid: { label: 'Ödənilib', tone: 'ok' }, due: { label: 'Ödəniş vaxtıdır', tone: 'warn' }, planned: { label: 'Planlaşdırılıb', tone: 'neutral' } } as const;

export function DocumentsTab({ project: p, onSend }: { project: Project; onSend: () => void }) {
  const total = clientFinalTotal(projectTotals(p).total, p.changeOrders);
  const expired = p.share ? new Date(p.share.expiresAt).getTime() < Date.now() : false;
  const decisions = [
    ...p.approvals.map(a => ({ at: a.approvedAt, node: <><Pill small tone="ok" icon={<CheckCircle2 size={12} aria-hidden />}>Təsdiq edildi</Pill><div><strong>{a.name} smetanın v{a.estimateVersion} versiyasını təsdiqləyib</strong><small>{dateTimeAz(a.approvedAt)} · {a.phone} · {azn(a.total)} · iş həcmi ilə tanış olduğunu təsdiqləyib</small></div></> })),
    ...p.revisionRequests.map(r => ({ at: r.createdAt, node: <><Pill small tone="warn" icon={<MessageSquareText size={12} aria-hidden />}>Düzəliş istənilib</Pill><div><strong>{r.name}, v{r.estimateVersion}: “{r.message}”</strong><small>{dateTimeAz(r.createdAt)}</small></div></> })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return <div className="sm-two-col" style={{ alignItems: 'start' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="surface sm-panel" aria-labelledby="docs-title">
        <div className="section-head"><div><div className="eyebrow">Sənədlər</div><h2 id="docs-title">Hesabatlar və fayllar</h2></div></div>
        <div className="sm-docs">
          <div className="sm-doc surface"><span className="sm-doc-icon xlsx"><FileSpreadsheet size={18} /></span><div><strong>Smeta hesabatı (Excel)</strong><small>6 vərəq: Xülasə, Detallı smeta, Material siyahısı, İşçilik planı, Dəyişikliklər, Plan-fakt müqayisəsi</small></div><Button variant="secondary" onClick={() => runExport(p, 'xlsx')}><Download size={15} />Yüklə</Button></div>
          <div className="sm-doc surface"><span className="sm-doc-icon pdf"><FileText size={18} /></span><div><strong>Smeta sənədi (PDF)</strong><small>Tərəflər, xülasə, detallı cədvəl, ödəniş qrafiki, şərtlər və imza yeri</small></div><Button variant="secondary" onClick={() => runExport(p, 'pdf')}><ExternalLink size={15} />Aç</Button></div>
          {p.drawing && <div className="sm-doc surface"><span className="sm-doc-icon"><FileImage size={18} /></span><div><strong>{p.drawing.fileName}</strong><small>Çertyoj · miqyas {p.drawing.scale} · {dateAz(p.drawing.uploadedAt)}</small></div><Pill small tone="info">AI analiz edib</Pill></div>}
          <div className="sm-doc surface"><span className="sm-doc-icon"><ReceiptText size={18} /></span><div><strong>Qəbzlər</strong><small>{p.receipts.length} fayl · Xərclər bölməsində</small></div><span className="sm-muted" style={{ fontSize: 12 }}>{p.expenses.length} xərc</span></div>
        </div>
        {p.exports.length > 0 && <>
          <div className="eyebrow" style={{ margin: '18px 0 8px', fontSize: 11 }}>İxrac tarixçəsi</div>
          <div className="sm-aside-list">{p.exports.slice(0, 6).map(x => <div key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '6px 0', borderTop: '1px solid #eeebe2' }}>{x.kind === 'xlsx' ? <FileSpreadsheet size={14} color="#3d725a" aria-hidden /> : <FileText size={14} color="#a04e43" aria-hidden />}<span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.fileName}</span><small className="sm-muted">{dateTimeAz(x.createdAt)}</small></div>)}</div>
        </>}
      </section>

      <section className="surface sm-panel" aria-labelledby="pay-title">
        <div className="section-head"><div><div className="eyebrow">Sifarişçi ilə razılaşma</div><h2 id="pay-title">Ödəniş qrafiki</h2></div><b className="num" style={{ color: '#21473d' }}>{azn(total)}</b></div>
        <div className="sm-schedule">{p.payments.map((m, i) => <div key={m.id}><span className="n">{i + 1}</span><div><strong>{m.title}</strong><small>{m.condition}</small></div><b className="num">{azn(round2(total * m.share))}<small>{Math.round(m.share * 100)}% · <Pill small tone={MILESTONE[m.status].tone}>{MILESTONE[m.status].label}</Pill></small></b></div>)}</div>
        <p className="sm-muted" style={{ margin: '10px 0 0', fontSize: 12 }}>Məbləğlər təsdiqlənmiş smeta və təsdiqlənmiş dəyişikliklər əsasında hesablanır.</p>
      </section>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="surface sm-panel" aria-labelledby="share-title">
        <div className="section-head"><div><div className="eyebrow">Paylaşım</div><h2 id="share-title">Sifarişçi linki</h2></div>{p.share && <Pill small tone={expired ? 'risk' : 'ok'}>{expired ? 'Müddəti bitib' : 'Aktiv'}</Pill>}</div>
        {p.share ? <>
          <p className="sm-muted" style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.55 }}>{p.share.clientName} · v{p.share.snapshot.version} · {expired ? 'müddəti bitib' : `${dateAz(p.share.expiresAt)} tarixinədək aktivdir`}</p>
          <div className="sm-copy-row" style={{ marginTop: 0 }}><input readOnly value={publicEstimateUrl(p.share.token)} aria-label="Paylaşım linki" onFocus={e => e.target.select()} /><button type="button" className="icon-button" aria-label="Linki kopyala" onClick={() => { void copyText(publicEstimateUrl(p.share!.token)); }}><Copy size={16} /></button></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <a className="button button-secondary" href={publicEstimateUrl(p.share.token)} target="_blank" rel="noreferrer"><ExternalLink size={15} />Sifarişçi görünüşü</a>
            <Button variant="quiet" onClick={onSend}><Send size={15} />Yenidən göndər</Button>
          </div>
        </> : <><p className="sm-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>Smeta hələ sifarişçi ilə paylaşılmayıb.</p><Button onClick={onSend}><Link2 size={15} />Smeta linkini yarat</Button></>}
      </section>

      <section className="surface sm-panel" aria-labelledby="decisions-title">
        <div className="section-head"><div><div className="eyebrow">Tarixçə</div><h2 id="decisions-title">Sifarişçi qərarları</h2></div></div>
        {decisions.length ? <div className="sm-insights">{decisions.map((d, i) => <div className="sm-insight" key={i} style={{ gridTemplateColumns: '1fr' }}><div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>{d.node}</div></div>)}</div>
          : <p className="sm-muted" style={{ margin: 0, fontSize: 13 }}>Sifarişçi hələ qərar verməyib.</p>}
      </section>
    </div>
  </div>;
}
