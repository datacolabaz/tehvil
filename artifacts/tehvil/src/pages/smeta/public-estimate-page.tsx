import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { CheckCircle2, ChevronRight, CircleMinus, CirclePlus, FileWarning, Info, MessageSquareText, Printer, ShieldCheck, Star } from 'lucide-react';
import { Button } from '@/components/kit';
import { changeImpact, changeTotals, lineTotals, projectTotals, round2 } from '@/lib/smeta/calc';
import { PROPERTY_LABEL, RENOVATION_LABEL } from '@/lib/smeta/catalog';
import { azn, dateAz, num, signedAzn } from '@/lib/smeta/format';
import { smeta, useSharedProject } from '@/lib/smeta/store';
import type { Estimate, EstimateSection, Project } from '@/lib/smeta/types';
import { ChangeStatusPill } from '@/components/smeta/changes-tab';
import { Modal, SmetaToaster, toast } from '@/components/smeta/ui';

/** Client-facing split: margin is spread over material, labor and extras so the parts add up to the total. */
function clientSplit(estimate: Estimate, total: number, projectCosts: number, margin: number) {
  let material = 0, labor = 0;
  for (const it of estimate.sections.flatMap(s => s.items)) {
    const l = lineTotals(it, margin);
    material += (l.materialTotal + l.wasteAmount) * (1 + l.marginPercentage);
    labor += l.laborTotal * (1 + l.marginPercentage);
  }
  material = round2(material); labor = round2(labor);
  return { material, labor, other: round2(total - material - labor), projectCosts };
}

const sectionClientTotal = (s: EstimateSection, margin: number) => round2(s.items.reduce((sum, it) => sum + lineTotals(it, margin).rowTotal, 0));

export function PublicEstimatePage({ token }: { token: string }) {
  const p = useSharedProject(token);
  useEffect(() => { document.title = p ? `${p.name} — smeta | Təhvil` : 'Smeta | Təhvil'; }, [p]);

  return <div className="sm-public">
    <div className="sm-public-bar"><div>
      <Link href="/" className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></Link>
      {p?.share && <span className="sm-muted" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>Smeta sənədi · v{p.share.snapshot.version}<button type="button" className="icon-button no-print" aria-label="Çap et" onClick={() => window.print()}><Printer size={16} /></button></span>}
    </div></div>
    {p?.share ? <PublicEstimate project={p} token={token} /> : <div className="sm-public-wrap"><div className="sm-empty surface"><div className="empty-illustration"><FileWarning size={28} /></div><h3>Link etibarsızdır və ya müddəti bitib</h3><p>Paylaşım linkləri 30 gün aktiv olur. Yeni link üçün podratçınızla əlaqə saxlayın.</p></div></div>}
    <SmetaToaster />
  </div>;
}

function PublicEstimate({ project: p, token }: { project: Project; token: string }) {
  const share = p.share!;
  const snap = share.snapshot;
  const [approveOpen, setApproveOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const totals = projectTotals({ ...p, estimate: snap, projectCosts: share.snapshotProjectCosts, defaultMarginPercentage: share.snapshotMargin });
  const split = clientSplit(snap, totals.total, totals.projectCosts, share.snapshotMargin);
  const ct = changeTotals(p.changeOrders);
  const finalTotal = round2(totals.total + ct.approved);
  const approval = p.approvals.find(a => a.estimateVersion === snap.version);
  const revision = !approval ? [...p.revisionRequests].reverse().find(r => r.estimateVersion === snap.version) : undefined;
  const visibleChanges = p.changeOrders.filter(c => c.status !== 'draft').sort((a, b) => b.date.localeCompare(a.date));
  const pct = (v: number) => `${totals.total > 0 ? (v / totals.total) * 100 : 0}%`;
  const toggle = (id: string) => setOpenSections(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return <main className="sm-public-wrap">
    {approval && <div className="sm-approved-banner" role="status"><CheckCircle2 size={20} aria-hidden /><span>Bu smetanı <b>{dateAz(approval.approvedAt)}</b> tarixində təsdiqləmisiniz ({approval.name}). Sonrakı dəyişikliklər ayrıca təsdiqinizə göndəriləcək.</span></div>}
    {revision && <div className="sm-unsent" role="status"><MessageSquareText size={16} aria-hidden /><span>Düzəliş sorğunuz podratçıya göndərilib. Yeni versiya hazır olduqda bu link vasitəsilə görə biləcəksiniz.</span></div>}

    <section className="sm-public-hero">
      <div className="surface" style={{ padding: 22 }}>
        <div className="eyebrow">Təmir smetası · {p.district}</div>
        <h1>{p.name}</h1>
        <p>{share.message}</p>
        <div className="sm-doc-meta">
          <span className="sm-tag">Versiya {snap.version}</span>
          <span className="sm-tag">Tarix: {dateAz(share.createdAt)}</span>
          <span className="sm-tag">Etibarlıdır: {dateAz(snap.validUntil)}</span>
          <span className="sm-tag">{PROPERTY_LABEL[p.propertyKind]} · {num(p.areaM2)} m² · {RENOVATION_LABEL[p.renovationKind]} təmir</span>
        </div>
      </div>
      <div className="sm-public-total">
        <span className="eyebrow">Ümumi məbləğ</span>
        <strong className="num" data-testid="text-public-total">{azn(totals.total)}</strong>
        <dl>
          <dt>Materiallar</dt><dd>{azn(split.material)}</dd>
          <dt>İşçilik</dt><dd>{azn(split.labor)}</dd>
          <dt>Əlavə xərclər</dt><dd>{azn(split.other)}</dd>
          {ct.approved !== 0 && <><dt>Təsdiqlənmiş dəyişikliklər</dt><dd>{signedAzn(ct.approved)}</dd></>}
          {ct.approved !== 0 && <div className="final" style={{ display: 'contents' }}><dt>Yekun</dt><dd>{azn(finalTotal)}</dd></div>}
        </dl>
      </div>
    </section>

    <div className="sm-public-grid">
      <div className="sm-public-main">
        <section className="surface sm-panel" aria-labelledby="pub-split">
          <div className="eyebrow">Məbləğ necə formalaşıb</div>
          <h2 id="pub-split">Material və işçilik bölgüsü</h2>
          <div className="sm-split-bar" aria-hidden><span style={{ width: pct(split.material) }} /><span style={{ width: pct(split.labor) }} /><span style={{ width: pct(split.other) }} /></div>
          <div className="sm-split-legend">
            <div><span><i style={{ background: '#21473d' }} />Materiallar</span><b className="num">{azn(split.material)}</b></div>
            <div><span><i style={{ background: '#c28e68' }} />İşçilik</span><b className="num">{azn(split.labor)}</b></div>
            <div><span><i style={{ background: '#9db3a5' }} />Əlavə xərclər</span><b className="num">{azn(split.other)}</b></div>
          </div>
          <p className="sm-muted" style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.55 }}>Materiallara kəsim və tullantı üçün ehtiyat daxildir. Əlavə xərclər daşınma, tullantıların çıxarılması və koordinasiyanı əhatə edir.</p>
        </section>

        <section aria-labelledby="pub-sections">
          <div className="section-head" style={{ margin: '4px 0 10px' }}><div><div className="eyebrow">İş həcmi</div><h2 id="pub-sections" style={{ margin: '4px 0 0', fontSize: 18, color: '#26463c' }}>İş bölmələri</h2></div><button type="button" className="sm-link-btn" onClick={() => setOpenSections(openSections.size ? new Set() : new Set(snap.sections.map(s => s.id)))}>{openSections.size ? 'Hamısını bağla' : 'Hamısını aç'}</button></div>
          {snap.sections.map(s => {
            const open = openSections.has(s.id);
            return <div className="sm-acc" key={s.id}>
              <button type="button" className="sm-acc-head" aria-expanded={open} aria-controls={`acc-${s.id}`} onClick={() => toggle(s.id)}><ChevronRight size={16} aria-hidden /><span>{s.title}<br /><small>{s.items.length} iş</small></span><b className="num">{azn(sectionClientTotal(s, share.snapshotMargin))}</b></button>
              {open && <div className="sm-acc-body" id={`acc-${s.id}`}>{s.items.map(it => {
                const l = lineTotals(it, share.snapshotMargin);
                const k = 1 + l.marginPercentage;
                return <div className="sm-pub-line" key={it.id}>
                  <strong>{it.name}</strong><b className="num">{azn(l.rowTotal, 'auto')}</b>
                  <small>{it.zone} · {num(it.quantity)} {it.unit} · <em>Miqdar: {it.quantitySource.label}</em></small>
                  <small>Material {azn(round2((l.materialTotal + l.wasteAmount) * k), 'auto')} · İşçilik {azn(round2(l.laborTotal * k), 'auto')}{it.additionalCost ? ` · Əlavə ${azn(round2(it.additionalCost * k), 'auto')}` : ''}</small>
                </div>;
              })}</div>}
            </div>;
          })}
          {share.snapshotProjectCosts.length > 0 && <div className="sm-acc"><div className="sm-acc-head" style={{ cursor: 'default' }}><span>Layihə üzrə əlavə xərclər<br /><small>{share.snapshotProjectCosts.map(c => c.label).join(', ')}</small></span><b className="num">{azn(totals.projectCosts)}</b></div></div>}
        </section>

        <div className="sm-two-col" style={{ marginBottom: 0 }}>
          <section className="surface sm-panel"><div className="eyebrow">Daxildir</div><h2>Smetaya daxil olanlar</h2><ul className="sm-list inc">{p.included.map(x => <li key={x}><CirclePlus size={15} aria-hidden />{x}</li>)}</ul></section>
          <section className="surface sm-panel"><div className="eyebrow">Daxil deyil</div><h2>Smetaya daxil olmayanlar</h2><ul className="sm-list exc">{p.excluded.map(x => <li key={x}><CircleMinus size={15} aria-hidden />{x}</li>)}</ul></section>
        </div>

        {visibleChanges.length > 0 && <section className="surface sm-panel" aria-labelledby="pub-changes">
          <div className="eyebrow">Əlavə işlər</div><h2 id="pub-changes">Dəyişikliklər</h2>
          {visibleChanges.map(c => <div className="sm-pub-change" key={c.id}>
            <div className="sm-pub-change-head"><div><strong>{c.title}</strong> <ChangeStatusPill status={c.status} /></div><b className="num" style={{ color: '#21473d', whiteSpace: 'nowrap' }}>{signedAzn(changeImpact(c))}</b></div>
            <p>{c.reason} · {dateAz(c.date)}</p>
            {c.status === 'pending' && <div className="sm-pub-change-actions">
              <Button onClick={() => { smeta.decideChangeByClient(token, c.id, 'approved'); toast('Dəyişiklik təsdiqləndi'); }}><CheckCircle2 size={14} />Təsdiq et</Button>
              <Button variant="secondary" onClick={() => { smeta.decideChangeByClient(token, c.id, 'rejected'); toast('Dəyişiklik rədd edildi'); }}>Rədd et</Button>
            </div>}
          </div>)}
        </section>}

        <section className="surface sm-panel" aria-labelledby="pub-policy">
          <div className="eyebrow">Qaydalar</div><h2 id="pub-policy">Dəyişiklik qaydası</h2>
          <ul className="sm-list">
            <li><Info size={15} aria-hidden />Smetada olmayan hər iş və ya material dəyişikliyi ayrıca dəyişiklik sifarişi kimi qeydə alınır.</li>
            <li><Info size={15} aria-hidden />Hər dəyişiklikdə səbəb, maliyyə təsiri və foto göstərilir; iş yalnız sizin təsdiqinizdən sonra başlayır.</li>
            <li><Info size={15} aria-hidden />Təsdiqlənmiş dəyişikliklər yekun məbləğə ayrıca sətir kimi əlavə olunur, əsas smeta dəyişmir.</li>
          </ul>
        </section>

        <div className="sm-note"><ShieldCheck size={16} aria-hidden /><span>Bu smeta ilkin ölçü və razılaşdırılmış iş həcmi əsasında hazırlanıb. Sonradan təsdiqlənən dəyişikliklər ayrıca qeydə alınacaq.</span></div>
      </div>

      <aside className="sm-public-side">
        <div className="surface sm-decision">
          <div className="eyebrow">Qərarınız</div>
          <strong style={{ display: 'block', margin: '8px 0 4px', color: '#21473d', font: '700 26px var(--app-font-serif)' }} className="num">{azn(totals.total)}</strong>
          <p className="sm-muted" style={{ margin: '0 0 14px', fontSize: 12 }}>Versiya {snap.version} · {dateAz(snap.validUntil)} tarixinədək etibarlıdır</p>
          {approval ? <div className="sm-note" style={{ background: '#e0ece3', color: '#2f5f48' }}><CheckCircle2 size={16} aria-hidden /><span>Təsdiqlənib · {dateAz(approval.approvedAt)}</span></div> : <>
            <Button onClick={() => setApproveOpen(true)} testId="button-client-approve"><CheckCircle2 size={16} />Təsdiq et</Button>
            <Button variant="secondary" onClick={() => setReviseOpen(true)} testId="button-client-revise"><MessageSquareText size={16} />Düzəliş istə</Button>
          </>}
        </div>

        <div className="surface sm-panel">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Podratçı</div>
          <div className="sm-contractor"><span className="sm-avatar">{p.contractor.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span><div><strong>{p.contractor.name}</strong><small>{p.contractor.company} · {p.contractor.phone}</small></div></div>
          <div className="sm-contractor-stats">
            <div><b>{p.contractor.experienceYears}</b><small>il təcrübə</small></div>
            <div><b>{p.contractor.completedProjects}</b><small>layihə</small></div>
            <div><b><Star size={13} aria-hidden style={{ verticalAlign: -1, color: '#c28e68' }} /> {num(p.contractor.rating, 1)}</b><small>reytinq</small></div>
          </div>
        </div>

        <div className="surface sm-panel">
          <div className="eyebrow">Ödəniş qrafiki</div>
          <h2 style={{ marginBottom: 6 }}>Mərhələlər üzrə</h2>
          <div className="sm-schedule">{p.payments.map((m, i) => <div key={m.id}><span className="n">{i + 1}</span><div><strong>{m.title}</strong><small>{m.condition}</small></div><b className="num">{azn(round2(totals.total * m.share))}<small>{Math.round(m.share * 100)}%</small></b></div>)}</div>
        </div>
      </aside>
    </div>

    <ApproveModal open={approveOpen} onClose={() => setApproveOpen(false)} token={token} defaultName={p.client.name} defaultPhone={p.client.phone} total={totals.total} version={snap.version} />
    <ReviseModal open={reviseOpen} onClose={() => setReviseOpen(false)} token={token} defaultName={p.client.name} />
  </main>;
}

function ApproveModal({ open, onClose, token, defaultName, defaultPhone, total, version }: { open: boolean; onClose: () => void; token: string; defaultName: string; defaultPhone: string; total: number; version: number }) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [checked, setChecked] = useState(false);
  const [tried, setTried] = useState(false);
  const errors = { name: !name.trim() ? 'Adınızı daxil edin' : '', phone: phone.replace(/\D/g, '').length < 9 ? 'Telefon nömrəsini tam daxil edin' : '', checked: !checked ? 'Təsdiq üçün bu qeydi işarələyin' : '' };
  const submit = () => {
    setTried(true);
    if (errors.name || errors.phone || errors.checked) return;
    // TODO(api): POST /estimate/:token/approve — store signer, IP and timestamp server-side.
    smeta.approveByClient(token, { name: name.trim(), phone: phone.trim() });
    toast('Smeta təsdiqləndi. Podratçıya bildiriş göndərildi.');
    onClose();
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="sm-field-error">{errors[k]}</small> : null;
  return <Modal open={open} onClose={onClose} eyebrow={`Versiya ${version} · ${azn(total)}`} title="Smetanı təsdiq edin" footer={<><Button variant="secondary" onClick={onClose}>Ləğv et</Button><Button onClick={submit} testId="button-confirm-approve"><CheckCircle2 size={15} />Smetanı təsdiq edirəm</Button></>}>
    <label className="field"><span>Ad, soyad<i> *</i></span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" aria-invalid={tried && !!errors.name} />{err('name')}</label>
    <label className="field"><span>Telefon<i> *</i></span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="+994 50 123 45 67" aria-invalid={tried && !!errors.phone} />{err('phone')}</label>
    <label className="sm-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Smetanı və göstərilən iş həcmini nəzərdən keçirdim.</label>
    {err('checked')}
  </Modal>;
}

function ReviseModal({ open, onClose, token, defaultName }: { open: boolean; onClose: () => void; token: string; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState('');
  const [tried, setTried] = useState(false);
  const errors = { name: !name.trim() ? 'Adınızı daxil edin' : '', message: message.trim().length < 5 ? 'Hansı düzəlişi istədiyinizi qısa yazın' : '' };
  const submit = () => {
    setTried(true);
    if (errors.name || errors.message) return;
    smeta.requestRevision(token, { name: name.trim(), message: message.trim() });
    toast('Düzəliş sorğunuz podratçıya göndərildi');
    setMessage(''); setTried(false);
    onClose();
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="sm-field-error">{errors[k]}</small> : null;
  return <Modal open={open} onClose={onClose} eyebrow="Sifarişçi rəyi" title="Düzəliş istə" footer={<><Button variant="secondary" onClick={onClose}>Ləğv et</Button><Button onClick={submit}><MessageSquareText size={15} />Sorğunu göndər</Button></>}>
    <label className="field"><span>Ad, soyad<i> *</i></span><input value={name} onChange={e => setName(e.target.value)} aria-invalid={tried && !!errors.name} />{err('name')}</label>
    <label className="field"><span>Nəyi dəyişmək istəyirsiniz?<i> *</i></span><textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} placeholder="Məs.: Hamam üçün isti döşəmənin qiymətini ayrıca görmək istəyirəm." aria-invalid={tried && !!errors.message} />{err('message')}</label>
  </Modal>;
}
