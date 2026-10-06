import { Camera, CheckCircle2, Clock3, FilePlus2 } from 'lucide-react';
import { Pill } from '@/components/smeta/ui';
import { azn } from '@/lib/smeta/format';
import { PREVIEW_PROJECT as P } from '@/lib/contractor/landing-content';

/** Static illustration of the product with a clearly labelled sample project. */
export function ProductPreview() {
  const spentPct = Math.round((P.actual / P.planned) * 100);
  return <div className="ct-preview" role="img" aria-label={`Nümunə layihə: ${P.name}, smeta ${azn(P.total)}, sifarişçi təsdiqləyib`}>
    <span className="ct-preview-tag">Nümunə layihə</span>
    <div className="ct-preview-card">
      <div className="ct-preview-row">
        <div><small>{P.name} · {P.area} m²</small><small>Smeta v{P.version}</small></div>
        <Pill tone="ok" icon={<CheckCircle2 size={13} aria-hidden />}>Sifarişçi təsdiqləyib</Pill>
      </div>
      <div className="ct-preview-total num" style={{ marginTop: 10 }}>{azn(P.total)}</div>
      <small>Təsdiq: {P.approvedBy} · {P.approvedAt}</small>
    </div>
    <div className="ct-preview-grid">
      <div className="ct-preview-card">
        <small>Büdcə: plan və fakt</small>
        <div className="ct-bar" aria-hidden><span style={{ width: `${spentPct}%` }} /></div>
        <div className="ct-preview-row"><small>Fakt {azn(P.actual)}</small><small>{spentPct}%</small></div>
      </div>
      <div className="ct-preview-card">
        <small><FilePlus2 size={12} aria-hidden style={{ verticalAlign: -2 }} /> Əlavə iş №{P.change.number}</small>
        <strong style={{ display: 'block', margin: '6px 0' }}>{P.change.title}</strong>
        <div className="ct-preview-row"><small>+{azn(P.change.amount)}</small><Pill small tone="warn" icon={<Clock3 size={11} aria-hidden />}>Təsdiq gözləyir</Pill></div>
      </div>
    </div>
    <div className="ct-preview-card">
      <div className="ct-preview-row"><small><Camera size={12} aria-hidden style={{ verticalAlign: -2 }} /> Foto sübut · {P.photo.stage}</small><small>{P.photo.count} foto</small></div>
      <div className="ct-photos" aria-hidden><span>Əvvəl</span><span>Proses</span><span>Nəticə</span></div>
    </div>
  </div>;
}
