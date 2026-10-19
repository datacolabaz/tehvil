import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, ChevronDown, Download, ExternalLink, Hammer, Info, Plus, Printer, Save, Trash2 } from 'lucide-react';
import {
  useCreateRepairEstimate, useDeleteRepairEstimate, useGetPriceBase, useGetRepairEstimate, useListRepairEstimates, useUpdateRepairEstimate,
} from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, Pill, Skeleton } from '@/components/home/ui';
import { fmtNum } from '@/lib/build/estimate';
import { buildXlsx, downloadBlob, type XCell } from '@/lib/smeta/xlsx';
import {
  CONDITION_LABEL, LEVEL_LABEL, ROOM_KIND_LABEL, TIER_LABEL, buildEstimate, defaultFloor, defaultInput, defaultReserve, defaultScope, defaultWindows, newRoom, roomsFor,
  type Condition, type Level, type Money, type Part, type PriceBaseLike, type RepairInput, type RepairResult, type RoomIn, type RoomKind, type Scope, type Tier,
} from '@/lib/repair/engine';
import './ai.css';

const az = (n: number) => fmtNum(Math.round(n));
const azn = (n: number) => `${az(n)} AZN`;
const range = (m: Money) => (m.low === m.high ? azn(m.typical) : `${az(m.low)} – ${az(m.high)} AZN`);
const num = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const SCOPE_LABEL: Record<keyof Scope, string> = {
  demolition: 'Söküntü', electrical: 'Elektrik xətləri', plumbing: 'Su və kanalizasiya xətləri', plaster: 'Divar suvağı', putty: 'Şpaklyovka', paint: 'Rəngləmə',
  screed: 'Döşəmə styajkası / tarazlama', floors: 'Laminat və plintus', tiles: 'Kafel və hidroizolyasiya', doors: 'Daxili qapılar', sanitary: 'Sanitar avadanlıq', lighting: 'İşıqlandırma', cleanup: 'Tullantı, daşınma, təmizlik',
};
interface Saved { input: RepairInput; result?: RepairResult }

/** Homeowner repair estimate: new (no id) or a saved one. */
export function RepairEstimatePage({ id }: { id?: string }) {
  const prices = useGetPriceBase();
  const saved = useGetRepairEstimate(id ?? '', { query: { enabled: !!id, queryKey: [`/api/repair-estimates/${id}`] } });
  if (prices.isLoading || (id && saved.isLoading)) return <Skeleton rows={5} />;
  if (!prices.data) return <Empty icon={<Hammer size={28} />} title="Qiymət bazası açılmadı" text="Bir az sonra yenidən cəhd edin." />;
  if (id && !saved.data) return <Empty icon={<Hammer size={28} />} title="Smeta tapılmadı" text="Link səhvdir və ya bu smeta başqa hesaba aiddir." />;
  const data = saved.data?.data as unknown as Saved | undefined;
  return <Calculator key={id ?? 'new'} id={id} name={saved.data?.name ?? 'Təmir smetası'} initial={data?.input ?? defaultInput()} base={prices.data as unknown as PriceBaseLike} />;
}

function Calculator({ id, name: savedName, initial, base }: { id?: string; name: string; initial: RepairInput; base: PriceBaseLike }) {
  const [input, setInput] = useState<RepairInput>(initial);
  const [name, setName] = useState(savedName);
  const [dirty, setDirty] = useState(false);
  const [quick, setQuick] = useState({ rooms: '2', area: String(Math.round(initial.rooms.reduce((s, r) => s + r.area, 0)) || 70) });
  const result = useMemo(() => buildEstimate(input, base), [input, base]);
  const create = useCreateRepairEstimate();
  const update = useUpdateRepairEstimate();
  const remove = useDeleteRepairEstimate();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty && id) e.preventDefault(); }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty, id]);

  const change = (p: Partial<RepairInput>) => { setInput((x) => ({ ...x, ...p })); setDirty(true); };
  const setLevel = (level: Level, condition = input.condition) => change({ level, condition, scope: defaultScope(level, condition), reservePct: defaultReserve(level, condition) });
  const setRoom = (rid: string, p: Partial<RoomIn>) => change({ rooms: input.rooms.map((r) => (r.id === rid ? { ...r, ...p } : r)) });
  const payload = () => ({ name: name.trim() || 'Təmir smetası', data: { input, result } as unknown as Record<string, unknown> });
  const save = () => {
    if (id) update.mutate({ estimateId: id, data: payload() }, { onSuccess: () => { setDirty(false); void qc.invalidateQueries({ queryKey: ['/api/repair-estimates'] }); } });
    else create.mutate({ data: payload() }, { onSuccess: (e) => { void qc.invalidateQueries({ queryKey: ['/api/repair-estimates'] }); setLocation(`/ai-smeta/temir/${e.id}`); } });
  };
  const area = result.area;

  return <>
    <PageHeading eyebrow="AI Smeta · Təmir" title="Mənzil və ya ev təmirinin smetası" description="Otaqları və işləri seçin — material miqdarı istehsalçı normaları ilə, qiymətlər mənbəli qiymət bazasından hesablanır. Hər rəqəmin haradan gəldiyi görünür." />

    <section className="surface hp-section" data-testid="rp-property">
      <h2>1. Mənzil</h2>
      <div className="field-grid three">
        <label className="field"><span>Vəziyyəti</span><select value={input.condition} onChange={(e) => setLevel(input.level, e.target.value as Condition)} data-testid="rp-condition">{(Object.keys(CONDITION_LABEL) as Condition[]).map((k) => <option key={k} value={k}>{CONDITION_LABEL[k]}</option>)}</select></label>
        <label className="field"><span>Təmirin həcmi</span><select value={input.level} onChange={(e) => setLevel(e.target.value as Level)} data-testid="rp-level">{(Object.keys(LEVEL_LABEL) as Level[]).map((k) => <option key={k} value={k}>{LEVEL_LABEL[k]}</option>)}</select></label>
        <label className="field"><span>Material səviyyəsi</span><select value={input.tier} onChange={(e) => change({ tier: e.target.value as Tier })} data-testid="rp-tier">{(Object.keys(TIER_LABEL) as Tier[]).map((k) => <option key={k} value={k}>{TIER_LABEL[k]}</option>)}</select></label>
        <label className="field"><span>Tavan hündürlüyü, m</span><input inputMode="decimal" value={input.ceilingHeight} onChange={(e) => change({ ceilingHeight: num(e.target.value) })} data-testid="rp-height" /></label>
        <label className="field"><span>Mərtəbə</span><input inputMode="numeric" value={input.floorNo} onChange={(e) => change({ floorNo: Math.max(1, Math.round(num(e.target.value))) })} data-testid="rp-floorno" /></label>
        <label className="rl-check"><input type="checkbox" checked={input.lift} onChange={(e) => change({ lift: e.target.checked })} data-testid="rp-lift" /><span>Yük lifti var</span></label>
      </div>
      <div className="ai-quick">
        <label className="field"><span>Otaq sayı</span><select value={quick.rooms} onChange={(e) => setQuick({ ...quick, rooms: e.target.value })} data-testid="rp-quick-rooms">{['1', '2', '3', '4'].map((n) => <option key={n} value={n}>{n} otaqlı</option>)}</select></label>
        <label className="field"><span>Ümumi sahə, m²</span><input inputMode="decimal" value={quick.area} onChange={(e) => setQuick({ ...quick, area: e.target.value })} data-testid="rp-quick-area" /></label>
        <button type="button" className="button button-secondary" onClick={() => change({ rooms: roomsFor(Number(quick.rooms), num(quick.area)), doors: Number(quick.rooms) + 1 })} data-testid="rp-quick-apply">Otaqları yarat</button>
      </div>
      <small className="rl-hint">Otaqlar tipik Bakı planına görə bölünür — aşağıda sahələri öz mənzilinizə uyğun düzəldin.</small>
    </section>

    <section className="surface hp-section" data-testid="rp-rooms">
      <h2>2. Otaqlar <small className="ai-sub">· cəmi {fmtNum(area)} m²</small></h2>
      <p className="rl-hint">Uzunluq və eni yazsanız, divar sahəsi dəqiq hesablanır; yazmasanız, otaq 1:1,5 nisbətində fərz edilir.</p>
      <div className="rp-rooms">
        {input.rooms.map((r) => <div key={r.id} className="rp-room" data-testid="rp-room">
          <input className="hp-input rp-room-name" value={r.name} onChange={(e) => setRoom(r.id, { name: e.target.value })} aria-label="Otağın adı" />
          <label className="ai-cell"><span>Növ</span><select value={r.kind} onChange={(e) => { const k = e.target.value as RoomKind; setRoom(r.id, { kind: k, floor: defaultFloor(k), windows: defaultWindows(k) }); }}>{(Object.keys(ROOM_KIND_LABEL) as RoomKind[]).map((k) => <option key={k} value={k}>{ROOM_KIND_LABEL[k]}</option>)}</select></label>
          <label className="ai-cell"><span>Sahə, m²</span><input inputMode="decimal" value={r.length && r.width ? fmtNum(r.length * r.width) : r.area || ''} disabled={!!(r.length && r.width)} onChange={(e) => setRoom(r.id, { area: num(e.target.value) })} data-testid="rp-room-area" /></label>
          <label className="ai-cell"><span>Uzunluq × en, m</span><span className="rp-lw"><input inputMode="decimal" value={r.length ?? ''} placeholder="—" onChange={(e) => setRoom(r.id, { length: e.target.value ? num(e.target.value) : null })} aria-label="Uzunluq" /><input inputMode="decimal" value={r.width ?? ''} placeholder="—" onChange={(e) => setRoom(r.id, { width: e.target.value ? num(e.target.value) : null })} aria-label="En" /></span></label>
          <label className="ai-cell"><span>Pəncərə</span><input inputMode="numeric" value={r.windows} onChange={(e) => setRoom(r.id, { windows: Math.max(0, Math.round(num(e.target.value))) })} /></label>
          <label className="ai-cell"><span>Döşəmə</span><select value={r.floor} onChange={(e) => setRoom(r.id, { floor: e.target.value as RoomIn['floor'] })}><option value="laminate">Laminat</option><option value="tile">Kafel / metlax</option><option value="none">Dəyişmir</option></select></label>
          <label className="ai-cell"><span>Tavan</span><select value={r.ceiling} onChange={(e) => setRoom(r.id, { ceiling: e.target.value as RoomIn['ceiling'] })}><option value="paint">Rəngləmə</option><option value="drywall">Asma tavan</option><option value="none">Dəyişmir</option></select></label>
          <button type="button" className="icon-button" aria-label="Otağı sil" onClick={() => change({ rooms: input.rooms.filter((x) => x.id !== r.id) })}><Trash2 size={14} /></button>
        </div>)}
      </div>
      <button type="button" className="sm-link-btn" onClick={() => change({ rooms: [...input.rooms, newRoom('other', 10)] })} data-testid="rp-add-room"><Plus size={13} />Otaq əlavə et</button>
    </section>

    <section className="surface hp-section" data-testid="rp-scope">
      <h2>3. İşlər</h2>
      <div className="rp-scope">{(Object.keys(SCOPE_LABEL) as (keyof Scope)[]).map((k) => <label key={k} className="rl-check"><input type="checkbox" checked={input.scope[k]} onChange={(e) => change({ scope: { ...input.scope, [k]: e.target.checked } })} data-testid={`rp-scope-${k}`} /><span>{SCOPE_LABEL[k]}</span></label>)}</div>
      <div className="field-grid three">
        {input.scope.plaster && <label className="field"><span>Suvağın orta qalınlığı, mm</span><input inputMode="numeric" value={input.plasterMm} onChange={(e) => change({ plasterMm: num(e.target.value) })} data-testid="rp-plaster-mm" /></label>}
        {input.scope.screed && input.condition === 'shell' && <label className="field"><span>Styajkanın qalınlığı, mm</span><input inputMode="numeric" value={input.screedMm} onChange={(e) => change({ screedMm: num(e.target.value) })} /></label>}
        {input.scope.doors && <label className="field"><span>Daxili qapı sayı</span><input inputMode="numeric" value={input.doors} onChange={(e) => change({ doors: Math.max(0, Math.round(num(e.target.value))) })} data-testid="rp-doors" /></label>}
        <label className="field"><span>Gözlənilməz xərclər ehtiyatı, %</span><input inputMode="numeric" value={input.reservePct} onChange={(e) => change({ reservePct: num(e.target.value) })} data-testid="rp-reserve" /></label>
      </div>
    </section>

    <Result r={result} input={input} />

    <section className="surface hp-section hp-noprint" data-testid="rp-save">
      <div className="ai-row"><input className="hp-input" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} aria-label="Smetanın adı" />
        <button type="button" className="button button-primary" onClick={save} disabled={create.isPending || update.isPending} data-testid="rp-save-btn"><Save size={15} />{id ? (dirty ? 'Yadda saxla' : 'Saxlanıb') : 'Yadda saxla'}</button></div>
      <div className="hp-actions">
        <button type="button" className="button button-secondary" onClick={() => exportXlsx(name, input, result)} data-testid="rp-xlsx"><Download size={15} />Excel</button>
        <button type="button" className="button button-secondary" onClick={() => window.print()}><Printer size={15} />Çap et / PDF</button>
        <Link href="/ai-smeta/qiymetler" className="button button-quiet"><BookOpen size={15} />Qiymət bazası</Link>
        {id && <button type="button" className="button button-quiet" onClick={() => remove.mutate({ estimateId: id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: ['/api/repair-estimates'] }); setLocation('/ai-smeta/temir'); } })}><Trash2 size={15} />Sil</button>}
      </div>
    </section>
    {!id && <SavedList />}
  </>;
}

function Result({ r, input }: { r: RepairResult; input: RepairInput }) {
  const t = r.totals;
  // On a phone the sections start folded: the totals come first, details on demand.
  const [wide] = useState(() => typeof window === 'undefined' || window.innerWidth > 700);
  return <section className="surface hp-section ai-result" data-testid="rp-result">
    <h2>4. Smeta</h2>
    <div className="ai-range">
      <div><small>Ümumi (ehtiyat {t.reservePct}% daxil)</small><b className="big" data-testid="rp-total">{range(t)}</b>{t.low !== t.high && <small>orta qiymətlərlə: {azn(t.typical)}</small>}</div>
      <div><small>1 m² üçün</small><b data-testid="rp-perm2">{range(t.perM2)}</b><small>{fmtNum(r.area)} m²</small></div>
      <div><small>Material · İşçilik · Xidmət</small><b>{azn(t.material.typical)} · {azn(t.labor.typical)} · {azn(t.service.typical)}</b><small>ehtiyat: {azn(t.reserve.typical)}</small></div>
    </div>
    {t.low === t.high && t.typical > 0 && <p className="rl-hint">Hər mövqe üçün bazada hələlik bir qiymət var — buna görə aralıq yoxdur. Bazaya təchizatçı qiymətləri əlavə olunduqca aşağı və yuxarı hədd görünəcək.</p>}
    {r.warnings.map((w) => <p key={w} className="ai-warn" data-testid="rp-warning"><AlertTriangle size={14} />{w}</p>)}
    <div className="rp-badges"><Pill tone={r.preliminaryShare > 50 ? 'warn' : 'neutral'}>{r.preliminaryShare}% yoxlanmamış ilkin qiymət</Pill>{r.missing.length > 0 && <Pill tone="warn">{r.missing.length} mövqe qiymətsiz</Pill>}{r.staleCount > 0 && <Pill tone="warn">{r.staleCount} köhnəlmiş qiymət</Pill>}</div>
    {r.benchmark && <div className="rp-bench" data-testid="rp-bench"><Info size={15} /><p>Müqayisə üçün: {r.benchmark.source} {TIER_LABEL[input.tier].toLowerCase()} tam təmiri <b>{az(r.benchmark.perM2)} AZN/m²</b> elan edir — bu sahə üçün ≈ {azn(r.benchmark.total)}. {r.benchmark.note} <a href={r.benchmark.url} target="_blank" rel="noopener noreferrer">Mənbə ({r.benchmark.date})<ExternalLink size={11} /></a></p></div>}

    {r.sections.map((s) => <details key={s.id} className="rp-sec" open={wide} data-testid="rp-section">
      <summary><b>{s.title}</b><span>{range(s.cost)}</span><ChevronDown size={15} /></summary>
      {s.lines.map((l) => <div key={l.id} className="rp-line" data-testid="rp-line">
        <div className="rp-line-head"><span><b>{l.name}</b><small>{l.zone} · {fmtNum(l.qty)} {l.unit} — {l.formula}</small></span><span className="rp-line-cost">{l.missing ? <Pill small tone="warn">qiymət yoxdur: {l.missing}</Pill> : null}{range(l.cost)}</span></div>
        <table className="rp-parts"><tbody>{l.parts.map((p) => <PartRow key={p.code} p={p} />)}</tbody></table>
      </div>)}
    </details>)}

    <details className="rp-norms" data-testid="rp-norms"><summary><b>Normalar, fərziyyələr və mənbələr</b><ChevronDown size={15} /></summary>
      <h3>Material sərfi</h3>
      <ul>{r.norms.map((n) => <li key={n.id}>{n.text} — {n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer">{n.source}<ExternalLink size={11} /></a> : <i>{n.source}</i>}{!n.checked && <Pill small tone="warn">yoxlanmalı</Pill>}</li>)}</ul>
      <h3>Hesablama qaydaları</h3>
      <ul>{r.rules.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="rl-hint">Qiymətlər: Təhvil-in açıq qiymət bazası, {r.priceDate}. Hər qiymətin mənbəyini <Link href="/ai-smeta/qiymetler">qiymət bazasında</Link> görə bilərsiniz. Smeta ilkin hesablamadır — podratçının yerində ölçməsini və konkret məhsul seçimini əvəz etmir. Daxil deyil: mebel, məişət texnikası, kondisioner, çilçıraqların özü, dizayn layihəsi.</p>
    </details>
  </section>;
}

function PartRow({ p }: { p: Part }) {
  return <tr className={p.price ? '' : 'missing'}>
    <td><span>{p.label}</span>{p.how && <small>{p.how}</small>}</td>
    <td className="num">{fmtNum(p.qty)} {p.unit}</td>
    <td className="num">{p.price ? (p.price.low === p.price.high ? `${fmtNum(p.price.median)}` : `${fmtNum(p.price.low)}–${fmtNum(p.price.high)}`) : '—'}<small>{p.price ? `AZN/${p.unit}` : ''}</small></td>
    <td className="num"><b>{p.cost ? range(p.cost) : 'qiymət yoxdur'}</b>
      <small>{p.price ? [p.price.verified ? `${p.price.count} mənbə` : 'ilkin, yoxlanmayıb', p.price.stale ? 'köhnəlib' : '', p.price.fallback ? `${p.price.fallback === 'any' ? 'ümumi' : p.price.fallback} qiyməti` : ''].filter(Boolean).join(' · ') : ''}</small></td>
  </tr>;
}

function SavedList() {
  const list = useListRepairEstimates();
  if (list.isLoading || !(list.data ?? []).length) return null;
  return <section className="surface hp-section">
    <h2>Saxlanmış smetalarım</h2>
    <ul className="ai-history">{list.data!.map((e) => <li key={e.id}><Link href={`/ai-smeta/temir/${e.id}`}><b>{e.name}</b><small>{e.area ? `${fmtNum(e.area)} m² · ` : ''}{new Date(e.updatedAt).toLocaleDateString('az-AZ')}</small></Link><span>{e.total ? (e.totalLow != null && e.totalHigh != null && e.totalLow !== e.totalHigh ? `${az(e.totalLow)} – ${az(e.totalHigh)} AZN` : azn(e.total)) : '—'}</span></li>)}</ul>
  </section>;
}

function exportXlsx(name: string, input: RepairInput, r: RepairResult) {
  const rows: XCell[][] = [
    [{ v: name, s: 'title' }],
    [`${fmtNum(r.area)} m² · ${CONDITION_LABEL[input.condition]} · ${LEVEL_LABEL[input.level]} · ${TIER_LABEL[input.tier]} · qiymətlər: ${r.priceDate}`],
    [],
    ['Bölmə', 'İş / material', 'Miqdar', 'Vahid', 'Necə hesablanıb', 'Qiymət (aşağı)', 'Qiymət (orta)', 'Qiymət (yuxarı)', 'Məbləğ (orta)', 'Qiymətin vəziyyəti'].map((v) => ({ v, s: 'header' as const })),
  ];
  for (const s of r.sections) for (const l of s.lines) {
    rows.push([{ v: s.title, s: 'bold' }, { v: `${l.name} — ${l.zone}`, s: 'bold' }, l.qty, l.unit, l.formula, null, null, null, { v: l.cost.typical, s: 'moneyBold' }, '']);
    for (const p of l.parts) rows.push(['', `  ${p.label}`, p.qty, p.unit, p.how, p.price ? { v: p.price.low, s: 'money' } : null, p.price ? { v: p.price.median, s: 'money' } : null, p.price ? { v: p.price.high, s: 'money' } : null, p.cost ? { v: p.cost.typical, s: 'money' } : 'qiymət yoxdur',
      p.price ? [p.price.verified ? `${p.price.count} mənbə` : 'ilkin, yoxlanmayıb', p.price.stale ? 'köhnəlib' : '', p.price.fallback ? 'başqa səviyyənin qiyməti' : ''].filter(Boolean).join(', ') : 'bazada yoxdur']);
  }
  rows.push([], ['', { v: 'Material', s: 'bold' }, null, null, null, null, null, null, { v: r.totals.material.typical, s: 'moneyBold' }],
    ['', { v: 'İşçilik', s: 'bold' }, null, null, null, null, null, null, { v: r.totals.labor.typical, s: 'moneyBold' }],
    ['', { v: 'Xidmətlər', s: 'bold' }, null, null, null, null, null, null, { v: r.totals.service.typical, s: 'moneyBold' }],
    ['', { v: `Ehtiyat ${r.totals.reservePct}%`, s: 'bold' }, null, null, null, null, null, null, { v: r.totals.reserve.typical, s: 'moneyBold' }],
    ['', { v: 'Cəmi (orta)', s: 'bold' }, null, null, null, { v: r.totals.low, s: 'moneyBold' }, { v: r.totals.typical, s: 'moneyBold' }, { v: r.totals.high, s: 'moneyBold' }, { v: r.totals.typical, s: 'moneyBold' }], [],
    [{ v: 'Normalar', s: 'bold' }], ...r.norms.map((n) => ['', n.text, null, null, n.source + (n.url ? ` — ${n.url}` : ''), null, null, null, null, n.checked ? '' : 'yoxlanmalı']),
    [{ v: 'Xəbərdarlıqlar', s: 'bold' }], ...r.warnings.map((w) => ['', w]));
  downloadBlob(buildXlsx([{ name: 'Təmir smetası', rows, widths: [24, 52, 10, 10, 50, 13, 13, 13, 15, 26], freezeRow: 4 }]), `temir-smetasi-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
