import { useState } from 'react';
import { Camera, CheckCircle2, ClipboardList, FilePlus2, ImagePlus, MoreHorizontal, Send, Trash2, UserRound, X } from 'lucide-react';
import { Button } from '@/components/kit';
import { changeImpact, changeTotals, projectTotals, round2 } from '@/lib/smeta/calc';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/smeta/catalog';
import { CHANGE_STATUS_LABEL } from '@/lib/smeta/export';
import { azn, dateAz, dateShortAz, num, signedAzn, todayISO } from '@/lib/smeta/format';
import { smeta } from '@/lib/smeta/store';
import type { ChangeOrder, ChangeStatus, Project, WorkCategory } from '@/lib/smeta/types';
import { DropItem, DropMenu, DropSep, Modal, NumberInput, Pill, toast } from './ui';

const STATUS_TONE: Record<ChangeStatus, 'ok' | 'warn' | 'neutral' | 'risk'> = { approved: 'ok', pending: 'warn', draft: 'neutral', rejected: 'risk' };
export const changeCode = (c: ChangeOrder) => `DS-${String(c.number).padStart(2, '0')}`;

export function ChangeStatusPill({ status }: { status: ChangeStatus }) {
  return <Pill small tone={STATUS_TONE[status]}>{CHANGE_STATUS_LABEL[status]}</Pill>;
}

export function ChangesTab({ project: p }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const ct = changeTotals(p.changeOrders);
  const total = projectTotals(p).total;
  const count = (s: ChangeStatus) => p.changeOrders.filter(c => c.status === s).length;
  const list = [...p.changeOrders].sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
  const items = p.estimate.sections.flatMap(s => s.items);

  return <>
    <div className="sm-change-summary">
      <div className="sm-fin"><span className="eyebrow">Təsdiqlənmiş</span><strong className="num">{signedAzn(ct.approved)}</strong><span>{count('approved')} dəyişiklik · yekun {azn(total + ct.approved)}</span></div>
      <div className="sm-fin"><span className="eyebrow">Təsdiq gözləyir</span><strong className="num">{signedAzn(ct.pending)}</strong><span>{count('pending')} dəyişiklik sifarişçidədir</span></div>
      <div className="sm-fin"><span className="eyebrow">Qaralama</span><strong className="num">{signedAzn(ct.draft)}</strong><span>{count('draft')} dəyişiklik göndərilməyib</span></div>
    </div>

    <div className="section-head" style={{ marginBottom: 12 }}>
      <div><div className="eyebrow">Dəyişiklik sifarişləri</div><h2 style={{ margin: '4px 0 0', fontSize: 18, color: '#26463c' }}>Tarixçə</h2></div>
      <Button onClick={() => setOpen(true)} testId="button-new-change"><FilePlus2 size={16} />Yeni dəyişiklik əlavə et</Button>
    </div>

    {list.length ? <div className="sm-timeline">{list.map(c => {
      const impact = changeImpact(c);
      const photos = p.photos.filter(ph => c.photoIds.includes(ph.id));
      const lines = items.filter(i => c.lineItemIds.includes(i.id));
      return <article className="surface sm-change" key={c.id} aria-labelledby={`co-${c.id}`}>
        <div className="sm-change-no"><b>{changeCode(c)}</b><small>{dateShortAz(c.date)}</small></div>
        <div>
          <div className="sm-change-title"><h3 id={`co-${c.id}`}>{c.title}</h3><ChangeStatusPill status={c.status} /></div>
          <p>{c.reason}</p>
          <div className="sm-change-meta">
            <span><UserRound size={12} aria-hidden />{c.requestedBy === 'client' ? 'Sifarişçi' : 'Podratçı'}: {c.requestedByName}</span>
            <span><ClipboardList size={12} aria-hidden />{CATEGORY_LABEL[c.category]}</span>
            <span>{dateAz(c.date)}</span>
          </div>
          {(photos.length > 0 || lines.length > 0) && <div className="sm-change-links">
            {photos.map(ph => <span className="sm-tag" key={ph.id} title={ph.note}><Camera size={12} aria-hidden />Foto: {ph.room}</span>)}
            {lines.map(l => <span className="sm-tag" key={l.id}><ClipboardList size={12} aria-hidden />{l.name}</span>)}
          </div>}
        </div>
        <div className="sm-change-amount">
          <strong className={`num ${impact < 0 ? 'neg' : ''}`}>{signedAzn(impact)}</strong>
          <small>Material {num(c.materialDelta)} · İşçilik {num(c.laborDelta)}{c.additionalCost ? ` · Əlavə ${num(c.additionalCost)}` : ''}</small>
          {c.decidedAt && <small>{c.status === 'approved' ? 'Təsdiqləndi' : 'Rədd edildi'}: {dateAz(c.decidedAt)}{c.decisionNote ? ` · “${c.decisionNote}”` : ''}</small>}
          {c.status === 'draft' && <Button onClick={() => { smeta.setChangeStatus(p.id, c.id, 'pending'); toast('Dəyişiklik sifarişçinin təsdiqinə göndərildi'); }}><Send size={14} />Təsdiqə göndər</Button>}
          {c.status === 'pending' && <DropMenu trigger={<button type="button" className="button button-secondary"><MoreHorizontal size={15} />Qərarı qeyd et</button>}>
            <DropItem icon={<CheckCircle2 size={14} />} onSelect={() => { smeta.setChangeStatus(p.id, c.id, 'approved', 'Podratçı tərəfindən qeyd edildi'); toast('Sifarişçinin təsdiqi qeyd edildi'); }}>Sifarişçi təsdiqlədi</DropItem>
            <DropItem icon={<X size={14} />} onSelect={() => { smeta.setChangeStatus(p.id, c.id, 'rejected', 'Podratçı tərəfindən qeyd edildi'); toast('Dəyişiklik rədd edilmiş kimi qeyd edildi'); }}>Sifarişçi rədd etdi</DropItem>
            <DropSep />
            <DropItem onSelect={() => smeta.setChangeStatus(p.id, c.id, 'draft')}>Qaralamaya qaytar</DropItem>
          </DropMenu>}
        </div>
      </article>;
    })}</div> : <div className="sm-empty surface"><div className="empty-illustration"><FilePlus2 size={28} /></div><h3>Hələ dəyişiklik yoxdur</h3><p>Smeta təsdiqləndikdən sonra əlavə işlər və material dəyişiklikləri burada ayrıca qeydə alınır.</p><Button onClick={() => setOpen(true)}><FilePlus2 size={16} />Yeni dəyişiklik əlavə et</Button></div>}

    <ChangeOrderModal project={p} open={open} onClose={() => setOpen(false)} />
  </>;
}

function ChangeOrderModal({ project: p, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<WorkCategory>(p.estimate.sections[0]?.category ?? 'divar');
  const [lineId, setLineId] = useState('');
  const [requestedBy, setRequestedBy] = useState<'client' | 'contractor'>('client');
  const [material, setMaterial] = useState(0);
  const [labor, setLabor] = useState(0);
  const [extra, setExtra] = useState(0);
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);
  const [tried, setTried] = useState(false);
  const impact = round2(material + labor + extra);
  const total = projectTotals(p).total + changeTotals(p.changeOrders).approved;
  const lines = p.estimate.sections.filter(s => s.category === category).flatMap(s => s.items);
  const errors = { title: !title.trim() ? 'Dəyişikliyin adını daxil edin' : '', reason: !reason.trim() ? 'Səbəbi qısa izah edin' : '', impact: impact === 0 ? 'Maliyyə təsirini daxil edin (mənfi ola bilər)' : '' };
  const reset = () => { setTitle(''); setReason(''); setLineId(''); setMaterial(0); setLabor(0); setExtra(0); setPhotos([]); setTried(false); };
  const close = () => { reset(); onClose(); };
  const submit = (status: ChangeStatus) => {
    setTried(true);
    if (errors.title || errors.reason || errors.impact) return;
    const room = lines.find(l => l.id === lineId)?.zone ?? CATEGORY_LABEL[category];
    const photoIds = photos.map(ph => smeta.addPhoto(p.id, { phase: 'during', date: todayISO(), uploadedBy: p.contractor.name, note: title.trim(), room, category, lineItemId: lineId || undefined, clientVisible: true, url: ph.url }));
    smeta.addChangeOrder(p.id, {
      title: title.trim(), reason: reason.trim(), date: todayISO(), requestedBy, requestedByName: requestedBy === 'client' ? p.client.name : p.contractor.name,
      category, materialDelta: material, laborDelta: labor, additionalCost: extra, status, photoIds, lineItemIds: lineId ? [lineId] : [],
    });
    toast(status === 'pending' ? 'Dəyişiklik sifarişçinin təsdiqinə göndərildi' : 'Dəyişiklik qaralama kimi saxlanıldı');
    close();
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="sm-field-error">{errors[k]}</small> : null;

  return <Modal open={open} onClose={close} eyebrow="Dəyişiklik sifarişi" title="Yeni dəyişiklik əlavə et" wide footer={<>
    <Button variant="secondary" onClick={() => submit('draft')}>Qaralama kimi saxla</Button>
    <Button onClick={() => submit('pending')}><Send size={15} />Sifarişçinin təsdiqinə göndər</Button>
  </>}>
    <div className="field-grid">
      <label className="field full"><span>Dəyişiklik adı<i> *</i></span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Məs.: Qonaq otağında əlavə LED işıqlandırma" aria-invalid={tried && !!errors.title} />{err('title')}</label>
      <label className="field full"><span>Səbəb<i> *</i></span><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Niyə dəyişiklik lazımdır və iş həcminə necə təsir edir?" aria-invalid={tried && !!errors.reason} />{err('reason')}</label>
      <label className="field"><span>Təsir etdiyi iş paketi</span><select value={category} onChange={e => { setCategory(e.target.value as WorkCategory); setLineId(''); }}>{CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
      <label className="field"><span>Əlaqəli smeta sətri</span><select value={lineId} onChange={e => setLineId(e.target.value)} disabled={!lines.length}><option value="">{lines.length ? 'Seçilməyib' : 'Bu paketdə sətir yoxdur'}</option>{lines.map(l => <option key={l.id} value={l.id}>{l.name} · {l.zone}</option>)}</select></label>
      <label className="field"><span>Təşəbbüs edən</span><select value={requestedBy} onChange={e => setRequestedBy(e.target.value as 'client' | 'contractor')}><option value="client">Sifarişçi — {p.client.name}</option><option value="contractor">Podratçı — {p.contractor.name}</option></select></label>
      <div />
      <label className="field"><span>Material fərqi, AZN</span><NumberInput label="Material fərqi, AZN" value={material} min={-1e7} fraction={2} onCommit={setMaterial} /></label>
      <label className="field"><span>İşçilik fərqi, AZN</span><NumberInput label="İşçilik fərqi, AZN" value={labor} min={-1e7} fraction={2} onCommit={setLabor} /></label>
      <label className="field"><span>Əlavə xərc, AZN</span><NumberInput label="Əlavə xərc, AZN" value={extra} min={-1e7} fraction={2} onCommit={setExtra} /></label>
      <div className="field"><span>Foto əlavə et</span>
        <label className="button button-secondary" style={{ position: 'relative', overflow: 'hidden', justifyContent: 'center' }}><ImagePlus size={15} />Foto seç
          <input type="file" accept="image/*" multiple style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Dəyişiklik üçün foto seçin" onChange={e => { const fs = [...(e.target.files ?? [])]; setPhotos(ps => [...ps, ...fs.map(f => ({ url: URL.createObjectURL(f), name: f.name }))]); e.target.value = ''; }} />
        </label>
      </div>
    </div>
    {photos.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{photos.map((ph, i) => <div key={ph.url} style={{ position: 'relative' }}><img src={ph.url} alt={ph.name} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, display: 'block' }} /><button type="button" className="icon-button" aria-label={`${ph.name} fotosunu sil`} style={{ position: 'absolute', top: 2, right: 2, width: 24, height: 24, background: '#fcfbf6' }} onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}><Trash2 size={12} /></button></div>)}</div>}
    {err('impact')}
    <div className="sm-summary-list" style={{ marginTop: 14 }}>
      <div><span>Maliyyə təsiri</span><b className="num">{signedAzn(impact)}</b></div>
      <div><span>Hazırkı razılaşdırılmış məbləğ</span><b className="num">{azn(total)}</b></div>
      <div className="total"><span>Təsdiqlənərsə yeni yekun</span><b className="num">{azn(total + impact)}</b></div>
    </div>
    <p className="sm-muted" style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.5 }}>Dəyişiklik əsas smetanı dəyişmir — sifarişçi təsdiqlədikdən sonra ayrıca qeyd kimi yekuna əlavə olunur.</p>
  </Modal>;
}
