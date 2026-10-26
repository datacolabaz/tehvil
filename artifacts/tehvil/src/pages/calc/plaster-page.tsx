import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calculator, Info, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { az } from '@/lib/calc/construction';
import type { Opening } from '@/lib/calc/masonry';
import { clearState, loadState, saveState, type CalcRecord, type MaterialListItem } from '@/lib/calc/materials';
import { defaultMix, mixTotals, PLASTER_MATERIALS, plasterLabel, plasterWall, type MixTotals, type PlasterMaterial, type PlasterMix, type PlasterResult, type PlasterWall } from '@/lib/calc/plaster';
import { Faq, Frame, NOTE, NumInput, Seg, ShareBar, SITE, useSeo } from './calc-pages';
import { MaterialList, OpeningsEditor, newKey, num, numOrNull, type OpeningS } from './walls-kit';
import './calc.css';

/*
 * /suvaq-kalkulyator — plaster for any number of walls: internal / external, one or both sides, openings off each side,
 * reveals only when asked. Material settings (consumption, bag, reserve, prices, cement-sand ratio) per material.
 */

interface WallS { key: string; name: string; length: string; height: string; kind: 'internal' | 'external'; sides: '1' | '2'; thickness: string; material: PlasterMaterial; openings: OpeningS[]; reveals: boolean; revealDepth: string }
interface MixS { consumption: string; bag: string; reserve: string; price: string; priceUnit: 'bag' | 'kg'; mode: 'dry' | 'site'; ratio: string; dryFactor: string; cementDensity: string; sandDensity: string; cementBag: string; cementPrice: string; sandPrice: string; sandUnit: 'm3' | 'ton' }
interface State { walls: WallS[]; mixes: Record<PlasterMaterial, MixS> }

const mixS = (m: PlasterMaterial): MixS => { const d = defaultMix(m); return { consumption: d.consumption == null ? '' : String(d.consumption).replace('.', ','), bag: String(d.bagKg), reserve: String(d.reservePct), price: '', priceUnit: 'bag', mode: 'dry', ratio: String(d.ratioSand), dryFactor: String(d.dryFactor).replace('.', ','), cementDensity: String(d.cementDensity), sandDensity: String(d.sandDensity), cementBag: String(d.cementBagKg), cementPrice: '', sandPrice: '', sandUnit: 'm3' }; };
const newWall = (i: number, from?: WallS): WallS => from
  ? { ...from, key: newKey(), name: `Divar ${i}`, length: '', openings: [] }
  : { key: newKey(), name: 'Divar 1', length: '', height: '', kind: 'internal', sides: '1', thickness: '15', material: 'gypsum', openings: [], reveals: false, revealDepth: '20' };
const fresh = (): State => ({ walls: [newWall(1)], mixes: { cement_sand: mixS('cement_sand'), gypsum: mixS('gypsum'), custom: mixS('custom') } });

const toWall = (w: WallS): PlasterWall => ({
  length: num(w.length), height: num(w.height), kind: w.kind, sides: w.sides === '2' ? 2 : 1, thicknessMm: num(w.thickness), material: w.material,
  openings: w.openings.map((o): Opening => ({ kind: o.kind, count: num(o.count), width: num(o.width), height: num(o.height) })),
  revealDepthCm: w.reveals ? num(w.revealDepth) : null,
});
const toMix = (m: MixS): PlasterMix => ({
  consumption: numOrNull(m.consumption), bagKg: num(m.bag), reservePct: numOrNull(m.reserve) ?? 0, price: numOrNull(m.price), priceUnit: m.priceUnit, mode: m.mode,
  ratioSand: num(m.ratio), dryFactor: num(m.dryFactor), cementDensity: num(m.cementDensity), sandDensity: num(m.sandDensity), cementBagKg: num(m.cementBag),
  cementPrice: numOrNull(m.cementPrice), sandPrice: numOrNull(m.sandPrice), sandPriceUnit: m.sandUnit,
});
const KIND = { internal: 'Daxili', external: 'Xarici' } as const;

const FAQ: [string, string][] = [
  ['Suvaq üçün neçə kisə lazımdır?', 'Suvanacaq sahə × qalınlıq (mm) × sərfiyyat (kq/m² hər 1 mm-ə) = quru qarışığın kütləsi. Ehtiyat əlavə edilir və kisənin çəkisinə (25 və ya 30 kq) bölünüb yuxarı yuvarlaqlaşdırılır. Məsələn, 15 m², 15 mm gips (0,9 kq/m²/mm): 202,5 kq, 10% ehtiyatla 222,75 kq — 30 kq-lıq 8 kisə.'],
  ['Hər iki tərəf seçəndə nə dəyişir?', 'Divarın xalis sahəsi (boşluqlar çıxılmaqla) iki dəfə götürülür — hər tərəfdən qapı və pəncərələr ayrıca çıxılır. Pəncərə və qapı yanları avtomatik əlavə edilmir; istəsəniz “Boşluqların yanlarını da suva” seçin.'],
  ['Sement-qum suvağı yerində qarışdırılırsa?', '“Yerində qarışdırılır” seçin: yaş məhlulun həcmi quru həcm əmsalına (standart 1,3) vurulur və sement : qum nisbətinə (məs. 1 : 3) bölünür. Sementin və qumun töküm sıxlığı ilə kütlə tapılır. Bu əmsallar fərziyyədir və dəyişdirilə bilər.'],
  ['Sərfiyyatı haradan bilim?', 'Kisənin üzərində və ya məhsulun texniki vərəqində “1 mm qalınlıq üçün 1 m²-ə kq” göstərilir. Kalkulyatorda tipik dəyər yazılıb, amma o, fərziyyə kimi işarələnib — öz məhsulunuzun rəqəmini yazın.'],
];

export function PlasterPage() {
  useSeo('/suvaq-kalkulyator', 'Suvaq kalkulyatoru: sahə, kisə, sement və qum — Tehvil.az', 'Daxili və xarici divarların suvağını hesablayın: bir və ya iki tərəf, qapı və pəncərələr çıxılır, gips və sement-qum suvağı üçün quru qarışıq, kisə sayı, sement və qum.', FAQ);
  const [st, setSt] = useState<State>(() => { const s = loadState<State>('plaster'); return s?.walls?.length ? { ...fresh(), ...s, mixes: { ...fresh().mixes, ...s.mixes } } : fresh(); });
  const [checked, setChecked] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const totalsRef = useRef<HTMLElement>(null);
  useEffect(() => { saveState('plaster', st); }, [st]);
  const mixes = useMemo(() => ({ cement_sand: toMix(st.mixes.cement_sand), gypsum: toMix(st.mixes.gypsum), custom: toMix(st.mixes.custom) }), [st.mixes]);
  const results = useMemo(() => st.walls.map((w) => plasterWall(toWall(w), mixes[w.material])), [st.walls, mixes]);
  const used = [...new Set(st.walls.map((w) => w.material))];
  const per = (filter: (w: WallS) => boolean) => used.map((m) => mixTotals(m, results.filter((_, i) => st.walls[i].material === m && filter(st.walls[i])), mixes[m])).filter((t) => t.area > 0);
  const all = per(() => true), inside = per((w) => w.kind === 'internal'), outside = per((w) => w.kind === 'external');
  const setWall = (key: string, p: Partial<WallS>) => setSt((s) => ({ ...s, walls: s.walls.map((w) => (w.key === key ? { ...w, ...p } : w)) }));
  const setMix = (m: PlasterMaterial, p: Partial<MixS>) => setSt((s) => ({ ...s, mixes: { ...s.mixes, [m]: { ...s.mixes[m], ...p } } }));
  const okCount = results.filter((r) => r.ok).length;
  const totalCost = all.some((t) => t.cost != null) ? all.reduce((s, t) => s + (t.cost ?? 0), 0) : null;

  const materials: MaterialListItem[] = all.flatMap((t): MaterialListItem[] => t.site
    ? [{ name: 'Sement', qty: t.site.cementBags, unit: 'kisə', unitPrice: mixes.cement_sand.cementPrice, cost: mixes.cement_sand.cementPrice == null ? null : t.site.cementBags * mixes.cement_sand.cementPrice, expenseCategory: 'concrete', note: `${az(t.site.cementKg, 0)} kq, ${mixes.cement_sand.cementBagKg} kq-lıq` },
      { name: 'Qum', qty: mixes.cement_sand.sandPriceUnit === 'ton' ? t.site.sandTon : t.site.sandM3, unit: mixes.cement_sand.sandPriceUnit === 'ton' ? 'ton' : 'm³', unitPrice: mixes.cement_sand.sandPrice, cost: mixes.cement_sand.sandPrice == null ? null : (mixes.cement_sand.sandPriceUnit === 'ton' ? t.site.sandTon : t.site.sandM3) * mixes.cement_sand.sandPrice, expenseCategory: 'building_materials' }]
    : t.bags != null ? [{ name: `${plasterLabel(t.material)} (quru qarışıq)`, qty: t.bags, unit: 'kisə', unitPrice: mixes[t.material].price, cost: t.cost, expenseCategory: 'building_materials', note: `${az(t.dryKgReserve, 1)} kq, ${mixes[t.material].bagKg} kq-lıq` }] : []);
  const record: CalcRecord = { calculator: 'plaster', stage: 'plaster', createdAt: new Date().toISOString(), inputs: { walls: st.walls.map(toWall), mixes }, materials, assumptions: all.flatMap((t) => t.assumptions) };
  const text = [
    'Suvaq hesabı (Tehvil.az)',
    ...st.walls.map((w, i) => { const r = results[i]; return r.ok ? `${w.name} (${KIND[w.kind].toLowerCase()}, ${w.sides} tərəf, ${w.thickness} mm): ${az(r.area)} m², ${az(r.volume, 3)} m³` : `${w.name}: məlumat tam deyil`; }),
    ...record.materials.map((m) => `• ${m.name}: ${az(m.qty, m.unit === 'kisə' ? 0 : 2)} ${m.unit}${m.cost != null ? ` — ${az(m.cost)} AZN` : ''}`),
    totalCost != null ? `Təxmini xərc: ${az(totalCost)} AZN` : 'Qiymət daxil edilməyib',
    NOTE, `${SITE}/suvaq-kalkulyator`,
  ].join('\n');

  return <Frame current="plaster">
    <section className="cx-hero"><h1 data-testid="cx-title">Suvaq kalkulyatoru</h1><p>Divarları əlavə edin: daxili və ya xarici, bir və ya iki tərəf, qapı və pəncərələr. Sahə, suvağın həcmi, quru qarışıq, kisə sayı və xərc dərhal hesablanır.</p></section>
    <div className="cx-walls">
      {st.walls.map((w, i) => <WallCard key={w.key} w={w} r={results[i]} site={w.material === 'cement_sand' && st.mixes.cement_sand.mode === 'site'} checked={checked} canRemove={st.walls.length > 1} onChange={(p) => setWall(w.key, p)} onRemove={() => setSt((s) => ({ ...s, walls: s.walls.filter((x) => x.key !== w.key) }))} />)}
    </div>
    <div className="cx-actions">
      <button type="button" className="button button-secondary" onClick={() => setSt((s) => ({ ...s, walls: [...s.walls, newWall(s.walls.length + 1, s.walls[s.walls.length - 1])] }))} data-testid="pw-add-wall"><Plus size={16} />Divar əlavə et</button>
      <button type="button" className="button button-primary" onClick={() => { setChecked(true); totalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} data-testid="pw-calc"><Calculator size={16} />Hesabla</button>
      {confirmClear
        ? <><button type="button" className="button button-secondary" onClick={() => { clearState('plaster'); setSt(fresh()); setChecked(false); setConfirmClear(false); }} data-testid="pw-clear-yes">Bəli, hamısını təmizlə</button><button type="button" className="text-link" onClick={() => setConfirmClear(false)}>Ləğv et</button></>
        : <button type="button" className="button button-quiet" onClick={() => setConfirmClear(true)} data-testid="pw-clear"><RotateCcw size={16} />Təmizlə</button>}
    </div>

    {used.map((m) => <MixCard key={m} material={m} s={st.mixes[m]} onChange={(p) => setMix(m, p)} />)}

    <section className="cx-card cx-totals" ref={totalsRef} aria-labelledby="pw-tot-h" data-testid="pw-totals">
      <h2 id="pw-tot-h">Ümumi yekun</h2>
      {okCount === 0 ? <p className="cx-small">Ən azı bir divarın ölçülərini yazın.</p> : <>
        <div className="cx-groups">
          <Group title="Daxili divarlar" totals={inside} testid="pw-inside" />
          <Group title="Xarici divarlar" totals={outside} testid="pw-outside" />
          <Group title="Hamısı" totals={all} testid="pw-all" main />
        </div>
        <MaterialList items={materials} testid="pw-list" />
        <div className="cx-result"><div><small>Ümumi təxmini xərc</small><b className={totalCost == null ? 'na' : ''} data-testid="pw-t-total">{totalCost == null ? 'Qiymət daxil edilməyib' : `${az(totalCost)} AZN`}</b>{totalCost != null && all.some((t) => t.missingPrice) && <em>bəzi materialların qiyməti daxil edilməyib</em>}</div></div>
        <details className="cx-assume" open><summary>Hesablamanın fərziyyələri</summary><ul>{[...new Set(all.flatMap((t) => t.assumptions))].map((a) => <li key={a}>{a}</li>)}</ul></details>
      </>}
      {checked && okCount < st.walls.length && <p className="cx-warn" role="alert"><AlertTriangle size={15} />{st.walls.length - okCount} divarda məlumat çatışmır — həmin divarın altındakı qırmızı qeydlərə baxın.</p>}
      <p className="cx-note"><Info size={15} />{NOTE}</p>
      {okCount > 0 && <ShareBar text={text} />}
    </section>
    <Faq items={FAQ} />
  </Frame>;
}

function Group({ title, totals, testid, main }: { title: string; totals: MixTotals[]; testid: string; main?: boolean }) {
  const area = totals.reduce((s, t) => s + t.area, 0), vol = totals.reduce((s, t) => s + t.volume, 0);
  const kg = totals.some((t) => t.dryKgReserve != null) ? totals.reduce((s, t) => s + (t.dryKgReserve ?? 0), 0) : null;
  return <div className={`cx-group ${main ? 'main' : ''}`} data-testid={testid}>
    <h3>{title}</h3>
    {area === 0 ? <p className="cx-small">yoxdur</p> : <dl>
      <div><dt>Suvanacaq sahə</dt><dd data-testid={`${testid}-area`}>{az(area)} m²</dd></div>
      <div><dt>Suvağın həcmi</dt><dd>{az(vol, 3)} m³</dd></div>
      {totals.map((t) => <div key={t.material}><dt>{plasterLabel(t.material)}</dt><dd data-testid={`${testid}-${t.material}`}>{t.site ? `sement ${t.site.cementBags} kisə, qum ${az(t.site.sandM3, 2)} m³` : t.dryKgReserve == null ? 'sərfiyyat yazılmayıb' : `${az(t.dryKgReserve, 1)} kq · ${t.bags} kisə`}</dd></div>)}
      {kg != null && totals.length > 1 && <div><dt>Quru qarışıq, cəmi</dt><dd>{az(kg / 1000, 3)} ton</dd></div>}
    </dl>}
  </div>;
}

function MixCard({ material, s, onChange }: { material: PlasterMaterial; s: MixS; onChange: (p: Partial<MixS>) => void }) {
  const info = PLASTER_MATERIALS.find((m) => m.key === material)!;
  const site = material === 'cement_sand' && s.mode === 'site';
  const bagChoices = ['25', '30'];
  return <section className="cx-card cx-mix" aria-label={`${info.label}: material`} data-testid={`pw-mix-${material}`}>
    <h2>{info.label}: material və qiymət</h2>
    {material === 'cement_sand' && <div className="cx-field"><span>Necə alınır?</span><Seg value={s.mode} onChange={(v) => onChange({ mode: v })} label="Qarışıq" testid="pw-mode" options={[['dry', 'Hazır quru qarışıq (kisə)'], ['site', 'Yerində: sement + qum']]} /></div>}
    {!site ? <>
      <NumInput label="Sərfiyyat, kq/m² hər 1 mm-ə" value={s.consumption} onChange={(v) => onChange({ consumption: v })} unit="kq" testid={`pw-cons-${material}`} placeholder="məhsulun vərəqindən" />
      <small className="cx-hint">{info.note}</small>
      <div className="cx-field"><span>Kisənin çəkisi</span>
        <div className="cx-chips">{bagChoices.map((b) => <button key={b} type="button" className={s.bag === b ? 'on' : ''} onClick={() => onChange({ bag: b })} data-testid={`pw-bag-${material}-${b}`}>{b} kq</button>)}<button type="button" className={!bagChoices.includes(s.bag) ? 'on' : ''} onClick={() => onChange({ bag: bagChoices.includes(s.bag) ? '' : s.bag })}>Başqa</button></div>
        {!bagChoices.includes(s.bag) && <NumInput label="Kisə" value={s.bag} onChange={(v) => onChange({ bag: v })} unit="kq" testid={`pw-bagkg-${material}`} />}
      </div>
      <div className="cx-row2">
        <NumInput label={s.priceUnit === 'bag' ? 'Bir kisənin qiyməti' : '1 kq qiyməti'} value={s.price} onChange={(v) => onChange({ price: v })} unit="AZN" testid={`pw-price-${material}`} placeholder="istəyə bağlı" />
        <div className="cx-field"><span>Qiymət</span><Seg value={s.priceUnit} onChange={(v) => onChange({ priceUnit: v })} label="Qiymətin vahidi" testid={`pw-pu-${material}`} options={[['bag', 'kisə'], ['kg', 'kq']]} /></div>
      </div>
    </> : <>
      <div className="cx-row2">
        <NumInput label="Sement : qum = 1 :" value={s.ratio} onChange={(v) => onChange({ ratio: v })} testid="pw-ratio" />
        <NumInput label="Quru həcm əmsalı" value={s.dryFactor} onChange={(v) => onChange({ dryFactor: v })} testid="pw-dryfactor" />
      </div>
      <small className="cx-hint">Yaş məhlulun 1 m³-i üçün təxminən 1,3 m³ quru sement və qum lazımdır (qarışanda həcm azalır). Bu, fərziyyədir — öz təcrübənizə görə dəyişin.</small>
      <div className="cx-row2">
        <NumInput label="Sementin sıxlığı" value={s.cementDensity} onChange={(v) => onChange({ cementDensity: v })} unit="kq/m³" testid="pw-cdens" />
        <NumInput label="Qumun sıxlığı" value={s.sandDensity} onChange={(v) => onChange({ sandDensity: v })} unit="kq/m³" testid="pw-sdens" />
      </div>
      <div className="cx-row2">
        <NumInput label="Sement kisəsi" value={s.cementBag} onChange={(v) => onChange({ cementBag: v })} unit="kq" testid="pw-cbag" />
        <NumInput label="Bir kisə sementin qiyməti" value={s.cementPrice} onChange={(v) => onChange({ cementPrice: v })} unit="AZN" testid="pw-cprice" placeholder="istəyə bağlı" />
      </div>
      <div className="cx-row2">
        <NumInput label={s.sandUnit === 'm3' ? '1 m³ qumun qiyməti' : '1 ton qumun qiyməti'} value={s.sandPrice} onChange={(v) => onChange({ sandPrice: v })} unit="AZN" testid="pw-sprice" placeholder="istəyə bağlı" />
        <div className="cx-field"><span>Qum</span><Seg value={s.sandUnit} onChange={(v) => onChange({ sandUnit: v })} label="Qumun vahidi" testid="pw-su" options={[['m3', 'm³'], ['ton', 'ton']]} /></div>
      </div>
    </>}
    <NumInput label="Ehtiyat" value={s.reserve} onChange={(v) => onChange({ reserve: v })} unit="%" testid={`pw-reserve-${material}`} />
  </section>;
}

function WallCard({ w, r, site, checked, canRemove, onChange, onRemove }: { w: WallS; r: PlasterResult; site: boolean; checked: boolean; canRemove: boolean; onChange: (p: Partial<WallS>) => void; onRemove: () => void }) {
  const touched = !!(w.length || w.height) || checked;
  return <section className="cx-card cx-wall" aria-label={w.name} data-testid="pw-wall">
    <div className="cx-wall-head">
      <input className="cx-wall-name" value={w.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Divarın adı" />
      {canRemove && <button type="button" className="button button-quiet" onClick={onRemove} data-testid="pw-remove-wall"><Trash2 size={15} />Divarı sil</button>}
    </div>
    <div className="cx-row2">
      <NumInput label="Uzunluq" value={w.length} onChange={(v) => onChange({ length: v })} unit="m" testid="pw-length" placeholder="5" />
      <NumInput label="Hündürlük" value={w.height} onChange={(v) => onChange({ height: v })} unit="m" testid="pw-height" placeholder="3" />
    </div>
    <div className="cx-row2">
      <div className="cx-field"><span>Divar</span><Seg value={w.kind} onChange={(v) => onChange({ kind: v })} label="Divarın növü" testid="pw-kind" options={[['internal', 'Daxili'], ['external', 'Xarici']]} /></div>
      <div className="cx-field"><span>Suvanacaq tərəf</span><Seg value={w.sides} onChange={(v) => onChange({ sides: v })} label="Tərəflər" testid="pw-sides" options={[['1', 'Bir tərəf'], ['2', 'Hər iki tərəf']]} /></div>
    </div>
    <div className="cx-field"><span>Suvaq materialı</span>
      <div className="cx-mats" role="radiogroup" aria-label="Suvaq materialı">{PLASTER_MATERIALS.map((m) => <button key={m.key} type="button" role="radio" aria-checked={w.material === m.key} className={w.material === m.key ? 'on' : ''} onClick={() => onChange({ material: m.key })} data-testid={`pw-mat-${m.key}`}>{m.label}</button>)}</div>
    </div>
    <NumInput label="Suvağın qalınlığı" value={w.thickness} onChange={(v) => onChange({ thickness: v })} unit="mm" testid="pw-thickness" />
    <OpeningsEditor openings={w.openings} onChange={(o) => onChange({ openings: o })} testid="pw" />
    {w.openings.length > 0 && <div className="cx-field">
      <label className="cx-check"><input type="checkbox" checked={w.reveals} onChange={(e) => onChange({ reveals: e.target.checked })} data-testid="pw-reveals" />Boşluqların yanlarını və üstünü də suva</label>
      {w.reveals && <NumInput label="Yan səthin dərinliyi" value={w.revealDepth} onChange={(v) => onChange({ revealDepth: v })} unit="sm" testid="pw-reveal-depth" />}
    </div>}
    <div className="cx-wall-res" aria-live="polite" data-testid="pw-res">
      {r.ok || r.grossArea > 0 ? <dl>
        <div><dt>Ümumi divar sahəsi</dt><dd>{az(r.grossArea)} m²</dd></div>
        <div><dt>Boşluqlar (bir tərəf)</dt><dd>{az(r.openingsArea)} m²</dd></div>
        <div><dt>Xalis sahə (bir tərəf)</dt><dd data-testid="pw-net">{az(r.netArea)} m²</dd></div>
        {r.ok && <>
          {r.revealArea > 0 && <div><dt>Boşluqların yanları</dt><dd>{az(r.revealArea)} m²</dd></div>}
          <div className="big"><dt>Suvanacaq sahə ({w.sides === '2' ? 'iki tərəf' : 'bir tərəf'})</dt><dd data-testid="pw-area">{az(r.area)} m²</dd></div>
          <div><dt>Qalınlıq</dt><dd>{w.thickness} mm</dd></div>
          <div><dt>Suvağın həcmi</dt><dd data-testid="pw-volume">{az(r.volume, 3)} m³</dd></div>
          {!site && <div><dt>Quru qarışıq (ehtiyatsız)</dt><dd data-testid="pw-kg">{r.dryKg == null ? '—' : `${az(r.dryKg, 1)} kq`}</dd></div>}
        </>}
      </dl> : null}
      {touched && r.errors.map((e) => <p key={e} className="cx-err" role="alert" data-testid="pw-error">{e}</p>)}
      {!site && r.warnings.map((e) => <p key={e} className="cx-warn"><AlertTriangle size={14} />{e}</p>)}
    </div>
  </section>;
}
