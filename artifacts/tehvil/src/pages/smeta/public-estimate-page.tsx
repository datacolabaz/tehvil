import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { CheckCircle2, ChevronRight, CircleMinus, CirclePlus, FileWarning, Info, MessageSquareText, Printer, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/kit';
import { CompanyHeader } from '@/components/contractor/company-header';
import { PROPERTY_LABEL, RENOVATION_LABEL } from '@/lib/smeta/catalog';
import { azn, dateAz, num, signedAzn, qty } from '@/lib/smeta/format';
import { useSharedEstimate, type SharedEstimate } from '@/lib/smeta/shared';
import { ChangeStatusPill } from '@/components/smeta/changes-tab';
import { Modal, SmetaToaster, toast } from '@/components/smeta/ui';

type Shared = ReturnType<typeof useSharedEstimate>;

const statusOf = (e: unknown) => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : 0);
function actionError(e: unknown) {
  const status = statusOf(e);
  if (status === 409) return 'Podratçı smetanın yeni versiyasını göndərib. Səhifə yeniləndi — zəhmət olmasa yenidən nəzərdən keçirin.';
  if (status === 429) return 'Çox sayda sorğu göndərildi. Bir neçə dəqiqə sonra yenidən cəhd edin.';
  if (status === 404) return 'Link etibarsızdır və ya müddəti bitib.';
  return 'Göndərmək alınmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.';
}

export function PublicEstimatePage({ token }: { token: string }) {
  const shared = useSharedEstimate(token);
  const d = shared.data;
  useEffect(() => { document.title = d ? `${d.project.name} — smeta | Təhvil` : 'Smeta | Təhvil'; }, [d?.project.name]);

  return <div className="sm-public">
    <div className="sm-public-bar"><div>
      <Link href="/" className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></Link>
      {d && <span className="sm-muted" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>Smeta sənədi · v{d.estimate.version}<button type="button" className="icon-button no-print" aria-label="Çap et" onClick={() => window.print()}><Printer size={16} /></button></span>}
    </div></div>
    {shared.status === 'loading' ? <div className="sm-public-wrap" aria-busy="true" aria-label="Smeta yüklənir"><div className="sm-skel-card" style={{ height: 160, marginBottom: 16 }} /><div className="sm-skel-card tall" /></div>
      : d ? <PublicEstimate data={d} shared={shared} />
      : shared.status === 'error' ? <div className="sm-public-wrap"><div className="sm-empty surface"><div className="empty-illustration"><FileWarning size={28} /></div><h3>Smetanı yükləmək alınmadı</h3><p>İnternet bağlantısını yoxlayıb yenidən cəhd edin.</p><Button variant="secondary" onClick={() => { void shared.retry(); }}><RotateCcw size={15} />Yenidən cəhd et</Button></div></div>
      : <div className="sm-public-wrap"><div className="sm-empty surface"><div className="empty-illustration"><FileWarning size={28} /></div><h3>Link etibarsızdır və ya müddəti bitib</h3><p>Paylaşım linkləri məhdud müddət aktiv olur. Yeni link üçün podratçınızla əlaqə saxlayın.</p></div></div>}
    <SmetaToaster />
  </div>;
}

function PublicEstimate({ data: d, shared }: { data: SharedEstimate; shared: Shared }) {
  const snap = d.estimate;
  const company = d.company ?? { name: d.contractor.company || d.contractor.name, phone: d.contractor.phone || undefined, services: [] };
  const [approveOpen, setApproveOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [deciding, setDeciding] = useState<string | null>(null);
  const pct = (v: number) => `${snap.total > 0 ? (v / snap.total) * 100 : 0}%`;
  const toggle = (id: string) => setOpenSections(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setDeciding(id);
    try { await shared.decideChange(id, decision); toast(decision === 'approved' ? 'Dəyişiklik təsdiqləndi' : 'Dəyişiklik rədd edildi'); }
    catch (e) { toast(actionError(e)); }
    finally { setDeciding(null); }
  };

  return <main className="sm-public-wrap">
    {d.approval && <div className="sm-approved-banner" role="status"><CheckCircle2 size={20} aria-hidden /><span>Bu smetanı <b>{dateAz(d.approval.approvedAt)}</b> tarixində təsdiqləmisiniz ({d.approval.name}). Sonrakı dəyişikliklər ayrıca təsdiqinizə göndəriləcək.</span></div>}
    {d.revisionRequestedAt && <div className="sm-unsent" role="status"><MessageSquareText size={16} aria-hidden /><span>Düzəliş sorğunuz podratçıya göndərilib. Yeni versiya hazır olduqda bu link vasitəsilə görə biləcəksiniz.</span></div>}

    <section className="sm-public-hero">
      <div className="surface" style={{ padding: 22 }}>
        <CompanyHeader company={company} />
        <div className="eyebrow" style={{ marginTop: 18 }}>Təmir smetası · {d.project.district}</div>
        <h1>{d.project.name}</h1>
        <p>{d.message}</p>
        <div className="sm-doc-meta">
          <span className="sm-tag">Versiya {snap.version}</span>
          <span className="sm-tag">Tarix: {dateAz(snap.sentAt)}</span>
          <span className="sm-tag">Etibarlıdır: {dateAz(snap.validUntil)}</span>
          <span className="sm-tag">{PROPERTY_LABEL[d.project.propertyKind]} · {qty(d.project.areaM2)} m² · {RENOVATION_LABEL[d.project.renovationKind]} təmir</span>
        </div>
      </div>
      <div className="sm-public-total">
        <span className="eyebrow">Ümumi məbləğ</span>
        <strong className="num" data-testid="text-public-total">{azn(snap.total)}</strong>
        <dl>
          <dt>Materiallar</dt><dd>{azn(snap.split.material)}</dd>
          <dt>İşçilik</dt><dd>{azn(snap.split.labor)}</dd>
          <dt>Əlavə xərclər</dt><dd>{azn(snap.split.other)}</dd>
          {d.approvedChangesTotal !== 0 && <><dt>Təsdiqlənmiş dəyişikliklər</dt><dd>{signedAzn(d.approvedChangesTotal)}</dd></>}
          {d.approvedChangesTotal !== 0 && <div className="final" style={{ display: 'contents' }}><dt>Yekun</dt><dd>{azn(d.finalTotal)}</dd></div>}
        </dl>
      </div>
    </section>

    <div className="sm-public-grid">
      <div className="sm-public-main">
        <section className="surface sm-panel" aria-labelledby="pub-split">
          <div className="eyebrow">Məbləğ necə formalaşıb</div>
          <h2 id="pub-split">Material və işçilik bölgüsü</h2>
          <div className="sm-split-bar" aria-hidden><span style={{ width: pct(snap.split.material) }} /><span style={{ width: pct(snap.split.labor) }} /><span style={{ width: pct(snap.split.other) }} /></div>
          <div className="sm-split-legend">
            <div><span><i style={{ background: '#21473d' }} />Materiallar</span><b className="num">{azn(snap.split.material)}</b></div>
            <div><span><i style={{ background: '#c28e68' }} />İşçilik</span><b className="num">{azn(snap.split.labor)}</b></div>
            <div><span><i style={{ background: '#9db3a5' }} />Əlavə xərclər</span><b className="num">{azn(snap.split.other)}</b></div>
          </div>
          <p className="sm-muted" style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.55 }}>Materiallara kəsim və tullantı üçün ehtiyat daxildir. Əlavə xərclər daşınma, tullantıların çıxarılması və koordinasiyanı əhatə edir.</p>
        </section>

        <section aria-labelledby="pub-sections">
          <div className="section-head" style={{ margin: '4px 0 10px' }}><div><div className="eyebrow">İş həcmi</div><h2 id="pub-sections" style={{ margin: '4px 0 0', fontSize: 18, color: '#26463c' }}>İş bölmələri</h2></div><button type="button" className="sm-link-btn" onClick={() => setOpenSections(openSections.size ? new Set() : new Set(snap.sections.map(s => s.id)))}>{openSections.size ? 'Hamısını bağla' : 'Hamısını aç'}</button></div>
          {snap.sections.map(s => {
            const open = openSections.has(s.id);
            return <div className="sm-acc" key={s.id}>
              <button type="button" className="sm-acc-head" aria-expanded={open} aria-controls={`acc-${s.id}`} onClick={() => toggle(s.id)}><ChevronRight size={16} aria-hidden /><span>{s.title}<br /><small>{s.items.length} iş</small></span><b className="num">{azn(s.total)}</b></button>
              {open && <div className="sm-acc-body" id={`acc-${s.id}`}>{s.items.map(it => <div className="sm-pub-line" key={it.id}>
                <strong>{it.name}</strong><b className="num">{azn(it.total, 'auto')}</b>
                <small>{it.zone} · {qty(it.quantity)} {it.unit} · <em>Miqdar: {it.quantityLabel}</em></small>
                <small>Material {azn(it.materialTotal, 'auto')} · İşçilik {azn(it.laborTotal, 'auto')}{it.additionalTotal ? ` · Əlavə ${azn(it.additionalTotal, 'auto')}` : ''}</small>
              </div>)}</div>}
            </div>;
          })}
          {snap.projectCosts.length > 0 && <div className="sm-acc"><div className="sm-acc-head" style={{ cursor: 'default' }}><span>Layihə üzrə əlavə xərclər<br /><small>{snap.projectCosts.map(c => c.label).join(', ')}</small></span><b className="num">{azn(snap.projectCostsTotal)}</b></div></div>}
        </section>

        <div className="sm-two-col" style={{ marginBottom: 0 }}>
          <section className="surface sm-panel"><div className="eyebrow">Daxildir</div><h2>Smetaya daxil olanlar</h2><ul className="sm-list inc">{d.project.included.map(x => <li key={x}><CirclePlus size={15} aria-hidden />{x}</li>)}</ul></section>
          <section className="surface sm-panel"><div className="eyebrow">Daxil deyil</div><h2>Smetaya daxil olmayanlar</h2><ul className="sm-list exc">{d.project.excluded.map(x => <li key={x}><CircleMinus size={15} aria-hidden />{x}</li>)}</ul></section>
        </div>

        {d.changeOrders.length > 0 && <section className="surface sm-panel" aria-labelledby="pub-changes">
          <div className="eyebrow">Əlavə işlər</div><h2 id="pub-changes">Dəyişikliklər</h2>
          {d.changeOrders.map(c => <div className="sm-pub-change" key={c.id}>
            <div className="sm-pub-change-head"><div><strong>{c.title}</strong> <ChangeStatusPill status={c.status} /></div><b className="num" style={{ color: '#21473d', whiteSpace: 'nowrap' }}>{signedAzn(c.impact)}</b></div>
            <p>{c.reason} · {dateAz(c.date)}</p>
            {c.status === 'pending' && <div className="sm-pub-change-actions">
              <Button disabled={deciding === c.id} onClick={() => { void decide(c.id, 'approved'); }}><CheckCircle2 size={14} />Təsdiq et</Button>
              <Button variant="secondary" disabled={deciding === c.id} onClick={() => { void decide(c.id, 'rejected'); }}>Rədd et</Button>
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
          <strong style={{ display: 'block', margin: '8px 0 4px', color: '#21473d', font: '700 26px var(--app-font-serif)' }} className="num">{azn(snap.total)}</strong>
          <p className="sm-muted" style={{ margin: '0 0 14px', fontSize: 12 }}>Versiya {snap.version} · {dateAz(snap.validUntil)} tarixinədək etibarlıdır</p>
          {d.approval ? <div className="sm-note" style={{ background: '#e0ece3', color: '#2f5f48' }}><CheckCircle2 size={16} aria-hidden /><span>Təsdiqlənib · {dateAz(d.approval.approvedAt)}</span></div> : <>
            <Button onClick={() => setApproveOpen(true)} testId="button-client-approve"><CheckCircle2 size={16} />Təsdiq et</Button>
            <Button variant="secondary" onClick={() => setReviseOpen(true)} testId="button-client-revise"><MessageSquareText size={16} />Düzəliş istə</Button>
          </>}
        </div>

        <div className="surface sm-panel">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Podratçı</div>
          <div className="sm-contractor"><span className="sm-avatar">{d.contractor.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span><div><strong>{d.contractor.name}</strong><small>{[company.name !== d.contractor.name ? company.name : '', company.phone ?? d.contractor.phone].filter(Boolean).join(' · ')}</small></div></div>
          {company.services.length > 0 && <div className="ct-chips" style={{ marginTop: 12 }} aria-label="Xidmətlər">{company.services.map(s => <span key={s} className="sm-tag">{s}</span>)}</div>}
          {company.paymentTermsNote && <p className="sm-muted" style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.55 }}>{company.paymentTermsNote}</p>}
        </div>

        <div className="surface sm-panel">
          <div className="eyebrow">Ödəniş qrafiki</div>
          <h2 style={{ marginBottom: 6 }}>Mərhələlər üzrə</h2>
          <div className="sm-schedule">{d.payments.map((m, i) => <div key={m.id}><span className="n">{i + 1}</span><div><strong>{m.title}</strong><small>{m.condition}</small></div><b className="num">{azn(m.amount)}<small>{Math.round(m.share * 100)}%</small></b></div>)}</div>
          {d.approvedChangesTotal !== 0 && <p className="sm-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>Təsdiqlənmiş dəyişikliklər daxil olmaqla {azn(d.finalTotal)} üzrə.</p>}
        </div>
      </aside>
    </div>

    <ApproveModal open={approveOpen} onClose={() => setApproveOpen(false)} shared={shared} defaultName={d.client.name} defaultPhone={d.client.phone} total={snap.total} version={snap.version} />
    <ReviseModal open={reviseOpen} onClose={() => setReviseOpen(false)} shared={shared} defaultName={d.client.name} />
  </main>;
}

function ApproveModal({ open, onClose, shared, defaultName, defaultPhone, total, version }: { open: boolean; onClose: () => void; shared: Shared; defaultName: string; defaultPhone: string; total: number; version: number }) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [checked, setChecked] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = { name: name.trim().length < 2 ? 'Adınızı daxil edin' : '', phone: phone.replace(/\D/g, '').length < 9 || !/^[+0-9 ()-]+$/.test(phone.trim()) ? 'Telefon nömrəsini tam daxil edin' : '', checked: !checked ? 'Təsdiq üçün bu qeydi işarələyin' : '' };
  const submit = async () => {
    setTried(true);
    if (errors.name || errors.phone || errors.checked || busy) return;
    setBusy(true);
    try {
      await shared.approve({ name: name.trim(), phone: phone.trim() });
      toast('Smeta təsdiqləndi. Podratçıya bildiriş göndərildi.');
      onClose();
    } catch (e) { toast(actionError(e)); if (statusOf(e) === 409) onClose(); }
    finally { setBusy(false); }
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="sm-field-error">{errors[k]}</small> : null;
  return <Modal open={open} onClose={onClose} eyebrow={`Versiya ${version} · ${azn(total)}`} title="Smetanı təsdiq edin" footer={<><Button variant="secondary" onClick={onClose}>Ləğv et</Button><Button onClick={() => { void submit(); }} disabled={busy} testId="button-confirm-approve"><CheckCircle2 size={15} />Smetanı təsdiq edirəm</Button></>}>
    <label className="field"><span>Ad, soyad<i> *</i></span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" aria-invalid={tried && !!errors.name} />{err('name')}</label>
    <label className="field"><span>Telefon<i> *</i></span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="+994 50 123 45 67" aria-invalid={tried && !!errors.phone} />{err('phone')}</label>
    <label className="sm-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Smetanı və göstərilən iş həcmini nəzərdən keçirdim.</label>
    {err('checked')}
  </Modal>;
}

function ReviseModal({ open, onClose, shared, defaultName }: { open: boolean; onClose: () => void; shared: Shared; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = { name: name.trim().length < 2 ? 'Adınızı daxil edin' : '', message: message.trim().length < 5 ? 'Hansı düzəlişi istədiyinizi qısa yazın' : '' };
  const submit = async () => {
    setTried(true);
    if (errors.name || errors.message || busy) return;
    setBusy(true);
    try {
      await shared.requestRevision({ name: name.trim(), message: message.trim() });
      toast('Düzəliş sorğunuz podratçıya göndərildi');
      setMessage(''); setTried(false);
      onClose();
    } catch (e) { toast(actionError(e)); if (statusOf(e) === 409) onClose(); }
    finally { setBusy(false); }
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <small role="alert" className="sm-field-error">{errors[k]}</small> : null;
  return <Modal open={open} onClose={onClose} eyebrow="Sifarişçi rəyi" title="Düzəliş istə" footer={<><Button variant="secondary" onClick={onClose}>Ləğv et</Button><Button onClick={() => { void submit(); }} disabled={busy}><MessageSquareText size={15} />Sorğunu göndər</Button></>}>
    <label className="field"><span>Ad, soyad<i> *</i></span><input value={name} onChange={e => setName(e.target.value)} aria-invalid={tried && !!errors.name} />{err('name')}</label>
    <label className="field"><span>Nəyi dəyişmək istəyirsiniz?<i> *</i></span><textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} maxLength={1500} placeholder="Məs.: Hamam üçün isti döşəmənin qiymətini ayrıca görmək istəyirəm." aria-invalid={tried && !!errors.message} />{err('message')}</label>
  </Modal>;
}
