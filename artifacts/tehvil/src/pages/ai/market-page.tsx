import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, FileText, Info, Link2, LoaderCircle, Minus, PencilLine, Plus, Printer, Search, Trash2 } from 'lucide-react';
import {
  useCreateValuation, useGetValuation, useListValuations, useReadListingLink, useReadListingText,
  type ListingDraft, type ListingInput, type Valuation,
} from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, Pill, Skeleton } from '@/components/home/ui';
import { fmtNum } from '@/lib/build/estimate';
import './ai.css';

const az = (n: number) => fmtNum(n, 0);
const day = (s: string) => { const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const PORTAL: Record<string, string> = { bina: 'Bina.az', tap: 'Tap.az', yeniemlak: 'Yeniemlak.az', other: 'digər portal', link: 'elan linki', text: 'yapışdırılmış mətn', manual: 'əl ilə daxil edilmiş' };
const BUILDING: Record<string, string> = { new: 'Yeni tikili', old: 'Köhnə tikili', house: 'Həyət evi / villa', unknown: 'Məlum deyil' };
const TRI: Record<string, string> = { yes: 'Bəli', no: 'Xeyr', unknown: 'Məlum deyil' };
const CONF: Record<string, [string, 'ok' | 'info' | 'warn' | 'neutral']> = { high: ['Yüksək', 'ok'], medium: ['Orta', 'info'], low: ['Aşağı', 'warn'], none: ['Hesablanmadı', 'neutral'] };

type Form = ListingInput & { found: string[] };
const empty = (): Form => ({ source: 'manual', city: 'Bakı', district: '', areaM2: 0, rooms: null, floor: null, floorsTotal: null, buildingType: 'unknown', renovation: 'unknown', furnished: 'unknown', price: null, currency: 'AZN', title: '', found: [] });
const fromDraft = (d: ListingDraft): Form => ({
  snapshotId: d.snapshotId ?? null, url: d.url ?? null, source: d.source as ListingInput['source'], dealType: (d.fields.dealType as ListingInput['dealType']) ?? 'sale',
  city: d.fields.city ?? '', district: d.fields.district ?? '', areaM2: d.fields.areaM2 ?? 0, rooms: d.fields.rooms ?? null, floor: d.fields.floor ?? null, floorsTotal: d.fields.floorsTotal ?? null,
  buildingType: d.fields.buildingType as ListingInput['buildingType'], renovation: d.fields.renovation as ListingInput['renovation'], furnished: d.fields.furnished as ListingInput['furnished'],
  price: d.fields.price ?? null, currency: (d.fields.currency as ListingInput['currency']) ?? 'AZN', title: d.fields.title ?? '', description: d.fields.description ?? '', found: d.found,
});
const toInput = ({ found: _f, ...rest }: Form): ListingInput => rest;

/** Link → text → manual. Every path ends in the same editable form, so nothing is calculated before the person checks it. */
function ListingReader({ onRead, compact }: { onRead: (f: Form, warnings: string[]) => void; compact?: boolean }) {
  const [mode, setMode] = useState<'link' | 'text' | 'manual'>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  // Errors are shown next to the field, not as a global popup.
  const link = useReadListingLink({ mutation: { meta: { silent: true } } });
  const paste = useReadListingText({ mutation: { meta: { silent: true } } });
  const fail = (e: unknown) => setError((e as { data?: { error?: string } })?.data?.error ?? 'Oxumaq alınmadı. Mətni yapışdırın və ya əl ilə daxil edin.');
  return <div className="ai-reader">
    <div className="rl-seg hp-tabs" role="tablist">
      {([['link', 'Elan linki'], ['text', 'Elanın mətni'], ['manual', 'Əl ilə']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => { setMode(k); setError(''); }}>{l}</button>)}
    </div>
    {mode === 'link' && <form className="ai-row" onSubmit={e => { e.preventDefault(); setError(''); link.mutate({ data: { url: url.trim() } }, { onSuccess: d => onRead(fromDraft(d), d.warnings), onError: fail }); }}>
      <input className="hp-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://bina.az/items/…" inputMode="url" aria-label="Elan linki" data-testid={compact ? 'input-comp-link' : 'input-listing-link'} />
      <button type="submit" className="button button-primary" disabled={url.trim().length < 5 || link.isPending} data-testid={compact ? 'button-comp-link' : 'button-read-link'}>{link.isPending ? <LoaderCircle size={15} className="spin" /> : <Link2 size={15} />}Oxu</button>
    </form>}
    {mode === 'text' && <form className="ai-col" onSubmit={e => { e.preventDefault(); setError(''); paste.mutate({ data: { text } }, { onSuccess: d => onRead(fromDraft(d), d.warnings), onError: fail }); }}>
      <textarea className="hp-input" rows={compact ? 3 : 5} value={text} onChange={e => setText(e.target.value)} placeholder="Elanın başlığını və təsvirini buraya yapışdırın: otaq sayı, sahə, mərtəbə, qiymət, rayon…" aria-label="Elanın mətni" data-testid={compact ? 'input-comp-text' : 'input-listing-text'} />
      <button type="submit" className="button button-primary" disabled={text.trim().length < 10 || paste.isPending} data-testid={compact ? 'button-comp-text' : 'button-read-text'}>{paste.isPending ? <LoaderCircle size={15} className="spin" /> : <FileText size={15} />}Mətndən oxu</button>
    </form>}
    {mode === 'manual' && <button type="button" className="button button-secondary" onClick={() => onRead(empty(), [])} data-testid={compact ? 'button-comp-manual' : 'button-manual'}><PencilLine size={15} />Boş forma aç</button>}
    {error && <p className="ai-error" role="alert"><AlertTriangle size={14} />{error}</p>}
    {mode === 'link' && <small className="rl-hint">Yalnız göstərdiyiniz bir səhifə oxunur və saytın robots.txt qaydalarına əməl olunur. Link oxunmasa, elanın mətnini yapışdırın.</small>}
  </div>;
}

function ListingForm({ f, set, warnings, title }: { f: Form; set: (f: Form) => void; warnings: string[]; title: string }) {
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const tag = (label: string) => f.found.includes(label) ? <span className="ai-found">{f.source === 'link' ? 'elandan' : 'mətndən'}</span> : null;
  const field = (label: string, key: string, el: React.ReactNode) => <label className="field"><span>{label}{tag(key)}</span>{el}</label>;
  return <section className="surface hp-section" data-testid="listing-form">
    <h2>{title}</h2>
    {f.url && <p className="rl-hint"><ExternalLink size={13} className="sm-ii" /> Mənbə: <a href={f.url} target="_blank" rel="noreferrer noopener">{new URL(f.url).hostname}</a> · oxundu: {day(new Date().toISOString())}</p>}
    {warnings.map(w => <p key={w} className="ai-warn"><AlertTriangle size={14} />{w}</p>)}
    <p className="rl-hint">Hesablamadan əvvəl yoxlayın və düzəldin. “elandan” işarəli sahələr avtomatik oxunub.</p>
    <div className="field-grid">
      {field('Şəhər', 'şəhər', <input value={f.city} onChange={e => set({ ...f, city: e.target.value })} data-testid="f-city" />)}
      {field('Rayon / ərazi', 'rayon', <input value={f.district ?? ''} onChange={e => set({ ...f, district: e.target.value })} data-testid="f-district" />)}
      {field('Sahə, m² *', 'sahə', <input inputMode="decimal" value={f.areaM2 || ''} onChange={e => set({ ...f, areaM2: n(e.target.value) ?? 0 })} data-testid="f-area" />)}
      {field('Otaq sayı', 'otaq sayı', <input inputMode="numeric" value={f.rooms ?? ''} onChange={e => set({ ...f, rooms: n(e.target.value) })} data-testid="f-rooms" />)}
      {field('Mərtəbə', 'mərtəbə', <input inputMode="numeric" value={f.floor ?? ''} onChange={e => set({ ...f, floor: n(e.target.value) })} />)}
      {field('Binanın mərtəbə sayı', 'binanın mərtəbə sayı', <input inputMode="numeric" value={f.floorsTotal ?? ''} onChange={e => set({ ...f, floorsTotal: n(e.target.value) })} />)}
      {field('Tikili', 'tikili növü', <select value={f.buildingType ?? 'unknown'} onChange={e => set({ ...f, buildingType: e.target.value as Form['buildingType'] })} data-testid="f-building">{Object.entries(BUILDING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}
      {field('Təmirli', 'təmir vəziyyəti', <select value={f.renovation ?? 'unknown'} onChange={e => set({ ...f, renovation: e.target.value as Form['renovation'] })}>{Object.entries(TRI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}
      {field('Əşyalı', 'əşyalı/əşyasız', <select value={f.furnished ?? 'unknown'} onChange={e => set({ ...f, furnished: e.target.value as Form['furnished'] })}>{Object.entries(TRI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}
      {field('Elan qiyməti', 'elan qiyməti', <div className="ai-row"><input inputMode="decimal" value={f.price ?? ''} onChange={e => set({ ...f, price: n(e.target.value) })} data-testid="f-price" /><select value={f.currency ?? 'AZN'} onChange={e => set({ ...f, currency: e.target.value as Form['currency'] })} aria-label="Valyuta"><option>AZN</option><option>USD</option></select></div>)}
    </div>
  </section>;
}

export function MarketValuePage() {
  const [, setLocation] = useLocation();
  const history = useListValuations();
  const create = useCreateValuation({ mutation: { meta: { silent: true } } });
  const [subject, setSubject] = useState<Form | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [comps, setComps] = useState<Form[]>([]);
  const [compDraft, setCompDraft] = useState<Form | null>(null);
  const [usePool, setUsePool] = useState(true);
  const [usd, setUsd] = useState('1.70');
  const [error, setError] = useState('');
  const run = () => {
    if (!subject || !(subject.areaM2 > 0)) { setError('Sahəni daxil edin — hesablama üçün mütləqdir.'); return; }
    if (!subject.city.trim()) { setError('Şəhəri daxil edin.'); return; }
    setError('');
    create.mutate({ data: { subject: toInput(subject), comparables: comps.map(toInput), usePool, usdRate: Number(usd.replace(',', '.')) || 1.7 } }, {
      onSuccess: v => setLocation(`/ai-smeta/bazar/${v.id}`),
      onError: e => setError((e as { data?: { error?: string } })?.data?.error ?? 'Hesablamaq alınmadı.'),
    });
  };
  return <>
    <PageHeading eyebrow="AI Smeta · Rejim 1" title="Elan üzrə bazar dəyəri" description="Elanın linkini və ya mətnini daxil edin. Dəyər oxşar real elanlarla müqayisə edilərək hesablanır — tikinti smetası ilə qarışdırılmır." />
    <div className="ai-honest"><Info size={15} /><p>Elan qiyməti satış qiyməti deyil. Nəticə rəsmi qiymətləndirmə hesabatı deyil. Kifayət qədər oxşar elan olmasa, rəqəm göstərilmir.</p></div>
    {!subject ? <section className="surface hp-section"><h2>1. Əmlak</h2><ListingReader onRead={(f, w) => { setSubject(f); setWarnings(w); }} /></section>
      : <>
        <ListingForm f={subject} set={setSubject} warnings={warnings} title="1. Əmlakın məlumatları" />
        <section className="surface hp-section" data-testid="comps">
          <h2>2. Müqayisə üçün elanlar</h2>
          <label className="rl-check"><input type="checkbox" checked={usePool} onChange={e => setUsePool(e.target.checked)} data-testid="use-pool" /><span><b>Təhvil bazasındakı elanlardan istifadə et</b><br /><small>Digər istifadəçilərin linklə oxutduğu və dəyişmədiyi real elanlar (son 180 gün). Kim tərəfindən əlavə olunduğu göstərilmir.</small></span></label>
          {comps.length > 0 && <ul className="ai-comp-list">{comps.map((c, i) => <li key={i}><span><b>{c.title || `${c.rooms ?? '?'} otaqlı, ${c.areaM2} m²`}</b><small>{[c.district, c.city, c.price ? `${az(c.price)} ${c.currency}` : 'qiymət yoxdur'].filter(Boolean).join(' · ')}</small></span><button type="button" className="icon-button" aria-label="Sil" onClick={() => setComps(comps.filter((_, j) => j !== i))}><Trash2 size={14} /></button></li>)}</ul>}
          {compDraft ? <div className="ai-comp-draft">
            <ListingForm f={compDraft} set={setCompDraft} warnings={[]} title="Müqayisə elanı" />
            <div className="hp-actions"><button type="button" className="button button-primary" disabled={!(compDraft.areaM2 > 0) || !compDraft.price} onClick={() => { setComps([...comps, compDraft]); setCompDraft(null); }} data-testid="button-add-comp"><Plus size={15} />Əlavə et</button><button type="button" className="button button-quiet" onClick={() => setCompDraft(null)}>Ləğv et</button></div>
          </div> : <details className="ai-add-comp"><summary><Plus size={14} />Özünüz müqayisə elanı əlavə edin</summary><ListingReader compact onRead={f => setCompDraft(f)} /></details>}
        </section>
        <section className="surface hp-section">
          <h2>3. Fərziyyələr</h2>
          <label className="field ai-narrow"><span>1 USD = … AZN</span><input inputMode="decimal" value={usd} onChange={e => setUsd(e.target.value)} /></label>
          <small className="rl-hint">Dollarla verilən elan qiymətləri bu məzənnə ilə çevrilir. Rəsmi məzənnəni AMB-dən yoxlaya bilərsiniz.</small>
        </section>
        {error && <p className="ai-error" role="alert"><AlertTriangle size={14} />{error}</p>}
        <div className="hp-actions"><button type="button" className="button button-primary hp-big" onClick={run} disabled={create.isPending} data-testid="button-calculate">{create.isPending ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}Bazar dəyərini hesabla</button><button type="button" className="button button-quiet" onClick={() => { setSubject(null); setComps([]); }}>Yenidən başla</button></div>
      </>}
    <section className="surface hp-section">
      <h2>Əvvəlki hesablamalarım</h2>
      {history.isLoading ? <Skeleton rows={2} /> : !(history.data ?? []).length ? <p className="rl-hint">Hələ hesablama yoxdur.</p>
        : <ul className="ai-history">{history.data!.map(h => <li key={h.id}><Link href={`/ai-smeta/bazar/${h.id}`}><b>{h.title || 'Əmlak'}</b><small>{[h.district, h.city, day(h.createdAt)].filter(Boolean).join(' · ')}</small></Link><span>{h.central ? `≈ ${az(h.central)} AZN` : <Pill small tone="neutral">Kifayət qədər məlumat yoxdur</Pill>}</span></li>)}</ul>}
    </section>
  </>;
}

const effectIcon = (e: string) => e === 'up' ? <ArrowUp size={14} /> : e === 'down' ? <ArrowDown size={14} /> : <Minus size={14} />;

export function ValuationResultPage({ id }: { id: string }) {
  const q = useGetValuation(id);
  if (q.isLoading) return <Skeleton rows={4} />;
  if (!q.data) return <Empty icon={<Search size={28} />} title="Hesablama tapılmadı" text="Link səhvdir və ya bu hesablama başqa hesaba aiddir." />;
  return <ValuationView v={q.data} />;
}

function ValuationView({ v }: { v: Valuation }) {
  const s = v.subject;
  const [conf, tone] = CONF[v.confidence] ?? CONF.none;
  const used = v.comparables.filter(c => c.used);
  const unused = v.comparables.filter(c => !c.used);
  const sources = [...new Set(used.map(c => PORTAL[c.listing.portal ?? c.listing.source] ?? c.listing.portal ?? c.listing.source))];
  return <>
    <PageHeading eyebrow="AI Smeta · Elan üzrə bazar dəyəri" title={s.title || `${s.rooms ?? ''} otaqlı, ${s.areaM2} m²`} description={[s.district, s.city, s.areaM2 ? `${s.areaM2} m²` : '', s.rooms ? `${s.rooms} otaq` : '', BUILDING[s.buildingType]].filter(Boolean).join(' · ')}
      action={<button type="button" className="button button-secondary hp-noprint" onClick={() => window.print()}><Printer size={15} />Çap et / PDF</button>} />
    <section className="surface hp-section ai-result" data-testid="valuation-result">
      {v.estimate ? <>
        <div className="ai-range"><div><small>Təxmini bazar dəyəri aralığı</small><b data-testid="val-range">{az(v.estimate.low)} – {az(v.estimate.high)} AZN</b></div>
          <div><small>Mərkəzi təxmin</small><b className="big" data-testid="val-central">{az(v.estimate.central)} AZN</b></div>
          <div><small>Təxmini AZN/m²</small><b>{az(v.estimate.perM2Low)} – {az(v.estimate.perM2High)}</b><small>mərkəzi: {az(v.estimate.perM2)}</small></div></div>
        <div className="ai-bar" aria-hidden><i style={{ left: '25%', right: '25%' }} /><em style={{ left: '50%' }} /></div>
      </> : <div className="ai-insufficient" data-testid="val-insufficient"><AlertTriangle size={20} /><div><b>Dəyər hesablanmadı</b><p>{v.confidenceReasons[0]}</p><p className="rl-hint">Eyni rayondan oxşar elanların linklərini “Müqayisə üçün elanlar” bölməsində əlavə edib yenidən hesablayın.</p></div></div>}
      <p className="ai-conf"><span>Etibarlılıq:</span> <Pill small tone={tone}>{conf}</Pill></p>
      <ul className="ai-reasons">{v.confidenceReasons.slice(v.estimate ? 0 : 1).map(r => <li key={r}>{r}</li>)}</ul>
      {v.askingNote && <p className="hp-text">{v.askingNote} Elan qiyməti satış qiyməti deyil.</p>}
    </section>
    {v.factors.length > 0 && <section className="surface hp-section"><h2>Qiymətə təsir edə biləcək amillər</h2><ul className="ai-factors">{v.factors.map(f => <li key={f.text} className={f.effect}>{effectIcon(f.effect)}<span>{f.text}</span></li>)}</ul><small className="rl-hint">Bu amillər rəqəmlə düzəldilmir — yalnız nəzərə alınmalı məqam kimi göstərilir.</small></section>}
    <section className="surface hp-section" data-testid="val-comps">
      <h2>Müqayisədə istifadə olunan elanlar ({used.length})</h2>
      {!used.length ? <p className="rl-hint">Uyğun elan yoxdur.</p> : <div className="ai-table-wrap"><table className="ai-table"><thead><tr><th>Elan</th><th>Ərazi</th><th>Sahə</th><th>Otaq</th><th>Elan qiyməti</th><th>AZN/m²</th><th>Tarix</th></tr></thead>
        <tbody>{used.map(c => <CompRow key={c.listing.id} c={c} />)}</tbody></table></div>}
      {unused.length > 0 && <details className="ai-unused"><summary>İstifadə olunmayan {unused.length} elan</summary><div className="ai-table-wrap"><table className="ai-table"><tbody>{unused.map(c => <CompRow key={c.listing.id} c={c} />)}</tbody></table></div></details>}
    </section>
    <div className="hp-two">
      <section className="surface hp-section"><h2>Çatışmayan məlumatlar</h2>{v.missing.length ? <ul className="ai-reasons">{v.missing.map(m => <li key={m}>{m}</li>)}</ul> : <p className="rl-hint">Əsas məlumatlar daxil edilib.</p>}</section>
      <section className="surface hp-section"><h2>Fərziyyələr və məhdudiyyətlər</h2><ul className="ai-reasons">{v.assumptions.map(a => <li key={a}>{a}</li>)}</ul></section>
    </div>
    <p className="rl-hint ai-sources">Mənbələr: {sources.length ? sources.join(', ') : '—'} · Təhvil bazasında bu şəhər üzrə {v.poolSize} elan · hesablama tarixi {day(v.createdAt)}. Bu, lisenziyalı qiymətləndiricinin rəyi deyil.</p>
    <div className="hp-actions hp-noprint"><Link href="/ai-smeta/bazar" className="button button-secondary">Yeni hesablama</Link></div>
  </>;
}

function CompRow({ c }: { c: Valuation['comparables'][number] }) {
  const l = c.listing;
  return <tr className={c.used ? '' : 'muted'}>
    <td>{l.url ? <a href={l.url} target="_blank" rel="noreferrer noopener">{l.title || 'Elan'}<ExternalLink size={11} /></a> : (l.title || 'Elan')}<small>{c.userAdded ? 'sizin əlavə etdiyiniz' : 'Təhvil bazası'}{c.notes.length ? ` · ${c.notes.join(', ')}` : ''}</small></td>
    <td>{[l.district, l.city].filter(Boolean).join(', ')}</td><td>{l.areaM2 ?? '—'} m²</td><td>{l.rooms ?? '—'}</td>
    <td>{l.price ? `${az(l.price)} ${l.currency}` : '—'}</td><td>{c.pricePerM2 ? az(c.pricePerM2) : '—'}</td><td>{day(l.fetchedAt)}</td>
  </tr>;
}
