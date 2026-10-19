import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, Download, ExternalLink, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useAddPriceQuote, useGetPriceBase, useImportPrices, useRemovePriceQuote } from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, Pill, Skeleton } from '@/components/home/ui';
import { fmtNum } from '@/lib/build/estimate';
import { downloadBlob } from '@/lib/smeta/xlsx';
import { TIER_LABEL, type PriceAgg, type PriceBaseLike, type PriceItem, type Tier } from '@/lib/repair/engine';
import './ai.css';

const CAT: Record<string, string> = { sokuntu: 'Söküntü', elektrik: 'Elektrik', santexnika: 'Santexnika', divar: 'Divarlar', boya: 'Boya', dosheme: 'Döşəmə', kafel: 'Kafel', tavan: 'Tavan', qapi: 'Qapılar', isiqlandirma: 'İşıqlandırma', sanitar: 'Sanitar', temizlik: 'Xidmətlər' };
const KIND: Record<string, string> = { material: 'Material', labor: 'İşçilik', service: 'Xidmət' };
const SRC: Record<string, string> = { supplier: 'təchizatçı', contractor: 'podratçı', published: 'açıq mənbə', preliminary: 'ilkin, yoxlanmayıb' };
const TIERS: Tier[] = ['ekonom', 'standart', 'premium'];
const today = () => new Date().toISOString().slice(0, 10);

/** The open price base: every price with its source and date. Price administrators can add prices here. */
export function PriceBasePage() {
  const q = useGetPriceBase();
  const [filter, setFilter] = useState('');
  if (q.isLoading) return <Skeleton rows={6} />;
  if (!q.data) return <Empty icon={<BookOpen size={28} />} title="Qiymət bazası açılmadı" text="Bir az sonra yenidən cəhd edin." />;
  const base = q.data as unknown as PriceBaseLike & { admin: boolean };
  const items = base.items.filter((i) => !filter || `${i.name} ${i.code} ${CAT[i.category] ?? ''}`.toLocaleLowerCase('az').includes(filter.toLocaleLowerCase('az')));
  const checked = base.items.filter((i) => TIERS.some((t) => i.tiers[t]?.verified)).length;
  const priced = base.items.filter((i) => TIERS.some((t) => i.tiers[t])).length;
  return <>
    <PageHeading eyebrow="AI Smeta" title="Qiymət bazası" description="Təmir smetasında istifadə olunan bütün qiymətlər: hər birinin mənbəyi, tarixi və aşağı / orta / yuxarı həddi." />
    <div className="ai-honest"><AlertTriangle size={15} /><p>{base.items.length} mövqedən {priced}-nin qiyməti var, {checked}-i təchizatçı və ya podratçı qiyməti ilə yoxlanıb. “İlkin, yoxlanmayıb” qiymətlər Təhvil-in 06.10.2026 tarixli başlanğıc cədvəlidir; yoxlanmış qiymət əlavə olunanda avtomatik onu əvəz edir. Qiyməti {base.staleDays} gündən köhnə olan mövqe “köhnəlib” kimi işarələnir.</p></div>
    {base.admin && <AdminPanel items={base.items} />}
    <section className="surface hp-section" data-testid="price-table">
      <div className="ai-row"><Search size={15} /><input className="hp-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Axtar: suvaq, laminat, elektrik…" aria-label="Axtar" /></div>
      <div className="ai-table-wrap"><table className="ai-table pb-table">
        <thead><tr><th>Mövqe</th><th>Vahid</th>{TIERS.map((t) => <th key={t} className="num">{TIER_LABEL[t]}</th>)}<th>Mənbə</th></tr></thead>
        <tbody>{items.map((i) => <ItemRow key={i.code} i={i} admin={base.admin} />)}</tbody>
      </table></div>
    </section>
  </>;
}

function Cell({ a }: { a: PriceAgg | null }) {
  if (!a) return <td className="num muted">—</td>;
  return <td className="num"><b>{a.low === a.high ? fmtNum(a.median) : `${fmtNum(a.low)}–${fmtNum(a.high)}`}</b>
    <small>{a.verified ? `${a.count} mənbə` : 'ilkin'}{a.stale ? ' · köhnəlib' : ''}{a.fallback ? ` · ${a.fallback === 'any' ? 'ümumi' : a.fallback}` : ''}</small></td>;
}

function ItemRow({ i, admin }: { i: PriceItem; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const remove = useRemovePriceQuote();
  const qc = useQueryClient();
  const sources = useMemo(() => {
    const seen = new Map<string, PriceAgg['sources'][number] & { tier: string }>();
    for (const t of TIERS) for (const s of i.tiers[t]?.sources ?? []) if (!seen.has(s.id)) seen.set(s.id, { ...s, tier: i.tiers[t]?.fallback ? (i.tiers[t]!.fallback as string) : t });
    return [...seen.values()];
  }, [i]);
  return <>
    <tr data-testid={`price-${i.code}`}>
      <td><b>{i.name}</b><small>{CAT[i.category] ?? i.category} · {KIND[i.kind]}{i.pack ? ` · ${fmtNum(i.pack.size)} ${i.pack.unit}` : ''} · <code>{i.code}</code></small></td>
      <td>{i.unit}</td>
      {TIERS.map((t) => <Cell key={t} a={i.tiers[t]} />)}
      <td>{sources.length ? <button type="button" className="sm-link-btn" onClick={() => setOpen(!open)}>{sources.length} qiymət</button> : <Pill small tone="warn">qiymət yoxdur</Pill>}</td>
    </tr>
    {open && <tr className="pb-sources"><td colSpan={6}><ul>{sources.map((s) => <li key={s.id}>
      <b>{fmtNum(s.price)} AZN</b> · {s.name}{s.url && <> · <a href={s.url} target="_blank" rel="noopener noreferrer">link<ExternalLink size={11} /></a></>} · {s.date} · {SRC[s.kind] ?? s.kind}{s.note ? ` · ${s.note}` : ''}
      {admin && s.kind !== 'preliminary' && <button type="button" className="icon-button" aria-label="Qiyməti geri götür" onClick={() => remove.mutate({ quoteId: s.id }, { onSuccess: () => void qc.invalidateQueries({ queryKey: ['/api/prices'] }) })}><Trash2 size={13} /></button>}
    </li>)}</ul></td></tr>}
  </>;
}

function AdminPanel({ items }: { items: PriceItem[] }) {
  const qc = useQueryClient();
  const add = useAddPriceQuote({ mutation: { meta: { silent: true } } });
  const imp = useImportPrices({ mutation: { meta: { silent: true } } });
  const [f, setF] = useState({ itemCode: items[0]?.code ?? '', tier: 'standart', price: '', sourceKind: 'supplier', sourceName: '', sourceUrl: '', observedAt: today(), note: '' });
  const [msg, setMsg] = useState('');
  const [csv, setCsv] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['/api/prices'] });
  const err = (e: unknown) => setMsg((e as { data?: { error?: string } })?.data?.error ?? 'Saxlamaq alınmadı');
  const template = () => {
    const lines = ['kod;səviyyə;qiymət;mənbə növü;mənbə adı;link;tarix;qeyd', ...items.map((i) => `${i.code};standart;;supplier;;;${today()};${i.name}${i.pack ? ` (${i.pack.size} ${i.pack.unit})` : ''} — ${i.unit}`)];
    downloadBlob(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `tehvil-qiymet-shablonu-${today()}.csv`);
  };
  return <section className="surface hp-section" data-testid="price-admin">
    <h2>Qiymət əlavə et <small className="ai-sub">· administrator</small></h2>
    <form className="field-grid three" onSubmit={(e) => { e.preventDefault(); setMsg(''); add.mutate({ data: { ...f, tier: f.tier as never, sourceKind: f.sourceKind as never, price: Number(f.price.replace(',', '.')), sourceUrl: f.sourceUrl || null } }, { onSuccess: () => { setMsg('Qiymət əlavə olundu.'); setF({ ...f, price: '', note: '' }); refresh(); }, onError: err }); }}>
      <label className="field"><span>Mövqe</span><select value={f.itemCode} onChange={(e) => setF({ ...f, itemCode: e.target.value })} data-testid="pa-item">{items.map((i) => <option key={i.code} value={i.code}>{i.name} ({i.unit})</option>)}</select></label>
      <label className="field"><span>Səviyyə</span><select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} data-testid="pa-tier"><option value="ekonom">Ekonom</option><option value="standart">Standart</option><option value="premium">Premium</option><option value="any">Hamısı üçün</option></select></label>
      <label className="field"><span>Qiymət, AZN</span><input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} data-testid="pa-price" /></label>
      <label className="field"><span>Mənbə növü</span><select value={f.sourceKind} onChange={(e) => setF({ ...f, sourceKind: e.target.value })}><option value="supplier">Təchizatçı / mağaza</option><option value="contractor">Podratçı təklifi</option><option value="published">Açıq dərc olunmuş</option></select></label>
      <label className="field"><span>Mənbənin adı</span><input value={f.sourceName} onChange={(e) => setF({ ...f, sourceName: e.target.value })} placeholder="Mağaza, filial və ya şirkət" data-testid="pa-source" /></label>
      <label className="field"><span>Link (varsa)</span><input value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} placeholder="https://" /></label>
      <label className="field"><span>Tarix</span><input type="date" value={f.observedAt} onChange={(e) => setF({ ...f, observedAt: e.target.value })} data-testid="pa-date" /></label>
      <label className="field"><span>Qeyd</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Marka, ölçü, endirim və s." /></label>
      <div className="field"><span>&nbsp;</span><button type="submit" className="button button-primary" disabled={add.isPending || !f.price || f.sourceName.trim().length < 2} data-testid="pa-add"><Plus size={15} />Əlavə et</button></div>
    </form>
    <h3>CSV ilə toplu əlavə</h3>
    <p className="rl-hint">Sütunlar: kod; səviyyə (ekonom/standart/premium/any); qiymət; mənbə növü (supplier/contractor/published); mənbə adı; link; tarix (İİİİ-AA-GG); qeyd. Şablonda bütün mövqelərin kodu var.</p>
    <div className="hp-actions"><button type="button" className="button button-secondary" onClick={template} data-testid="pa-template"><Download size={15} />Şablonu yüklə</button>
      <label className="button button-secondary"><Upload size={15} />CSV seç<input type="file" accept=".csv,.txt" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); e.target.value = ''; }} /></label></div>
    <textarea className="hp-input" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="və ya CSV mətnini buraya yapışdırın" data-testid="pa-csv" />
    <button type="button" className="button button-primary" disabled={!csv.trim() || imp.isPending} onClick={() => { setMsg(''); imp.mutate({ data: { csv } }, { onSuccess: (r) => { setMsg(`${r.added} qiymət əlavə olundu.${r.errors.length ? ` ${r.errors.length} sətir qəbul olunmadı: ${r.errors.slice(0, 5).join('; ')}` : ''}`); if (r.added) { setCsv(''); refresh(); } }, onError: err }); }} data-testid="pa-import">İdxal et</button>
    {msg && <p className="ai-warn ai-ok" data-testid="pa-msg">{msg}</p>}
  </section>;
}
