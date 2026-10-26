import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calculator, Info, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { az, parseNum } from '@/lib/calc/construction';
import { MASONRY_MATERIALS, masonryTotals, masonryWall, materialLabel, type MasonryMaterial, type MasonryResult, type MasonryWall, type Opening } from '@/lib/calc/masonry';
import { clearState, loadState, saveState, type CalcRecord, type MaterialListItem } from '@/lib/calc/materials';
import { Faq, Frame, NOTE, NumInput, Seg, ShareBar, SITE, useSeo } from './calc-pages';
import { MaterialList, OpeningsEditor, newKey, num, numOrNull, type OpeningS } from './walls-kit';
import './calc.css';

/*
 * /horgu-kalkulyator — masonry for any number of walls. Mişardaşı is its own material (its size always comes from the
 * person). Results per wall and in total; the inputs stay in this browser until "Təmizlə".
 */

type SizeUnit = 'mm' | 'sm';
interface WallS {
  key: string; name: string; length: string; height: string; thickness: string;
  material: MasonryMaterial; sizeUnit: SizeUnit; l: string; h: string; w: string; joint: string; reserve: string;
  openings: OpeningS[]; unitPrice: string; mortarPrice: string;
}
const sizeOf = (m: MasonryMaterial) => MASONRY_MATERIALS.find((x) => x.key === m)!.size;
const newWall = (i: number, from?: WallS): WallS => from
  ? { ...from, key: newKey(), name: `Divar ${i}`, length: '', height: from.height, openings: [] }
  : { key: newKey(), name: 'Divar 1', length: '', height: '', thickness: '25', material: 'red_brick', sizeUnit: 'mm', l: '250', h: '65', w: '120', joint: '10', reserve: '5', openings: [], unitPrice: '', mortarPrice: '' };
const THICK = ['10', '15', '20', '25', '30'];

function toInput(w: WallS): MasonryWall {
  const k = w.sizeUnit === 'sm' ? 10 : 1;
  const mm = (s: string) => { const v = numOrNull(s); return v == null ? null : v * k; };
  return {
    length: num(w.length), height: num(w.height), thicknessCm: num(w.thickness), material: w.material,
    unit: { l: mm(w.l), h: mm(w.h), w: mm(w.w) }, jointMm: num(w.joint), reservePct: num(w.reserve),
    openings: w.openings.map((o): Opening => ({ kind: o.kind, count: num(o.count), width: num(o.width), height: num(o.height) })),
    unitPrice: numOrNull(w.unitPrice), mortarPrice: numOrNull(w.mortarPrice),
  };
}

const FAQ: [string, string][] = [
  ['Mişardaşının sayı necə hesablanır?', 'Mişardaşının uzunluğunu, hündürlüyünü və enini özünüz yazırsınız (daşlar karxanaya görə fərqlənir). Bir daş tikişlə birlikdə divarın (uzunluq + tikiş) × (hündürlük + tikiş) hissəsini tutur. Xalis divar sahəsi bu rəqəmə bölünür, divarın qalınlığı boyunca neçə daş sığırsa, ona vurulur, sonra ehtiyat faizi əlavə edilib yuxarı yuvarlaqlaşdırılır. Ölçü yazılmasa, say hesablanmır.'],
  ['1 m² hörgüyə neçə kərpic gedir?', '250 × 120 × 65 mm kərpic, 10 mm tikişlə, 12 sm (yarım kərpic) divarda 1 m²-ə təxminən 51 kərpic, 25 sm (bir kərpic) divarda 103 kərpic gedir.'],
  ['Məhlulun həcmi necə tapılır?', 'Xalis hörgü həcmindən hörülən kərpic və ya daşların öz həcmi çıxılır — qalan üfüqi, şaquli və daxili tikişlərdir. Boşluqlu kərpicin dəlikləri, kəsimlər və itki nəzərə alınmır, ona görə nəticə təxminidir.'],
  ['Divarın qalınlığı materialın eninə uyğun gəlmirsə?', 'Məsələn, 12 sm kərpiclə 20 sm divar. Kalkulyator xəbərdarlıq edir, seçiminizi dəyişmir və sayı həcmə görə təxmini hesablayır.'],
  ['Qiymət yazmasam?', 'Material sayı hesablanır, xərc isə “Qiymət daxil edilməyib” kimi göstərilir — qiymət uydurulmur.'],
];

export function MasonryPage() {
  useSeo('/horgu-kalkulyator', 'Hörgü kalkulyatoru: mişardaşı, kərpic, qazbeton — Tehvil.az', 'Mişardaşı, qırmızı və silikat kərpic, qazbeton bloku üçün divar hörgüsünün sayını, məhlulunu və xərcini hesablayın. Bir neçə divar, qapı və pəncərələr çıxılır.', FAQ);
  const [walls, setWalls] = useState<WallS[]>(() => loadState<WallS[]>('masonry') ?? [newWall(1)]);
  const [checked, setChecked] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const totalsRef = useRef<HTMLElement>(null);
  useEffect(() => { saveState('masonry', walls); }, [walls]);
  const inputs = useMemo(() => walls.map(toInput), [walls]);
  const results = useMemo(() => inputs.map(masonryWall), [inputs]);
  const totals = useMemo(() => masonryTotals(inputs, results), [inputs, results]);
  const set = (key: string, p: Partial<WallS>) => setWalls((ws) => ws.map((w) => (w.key === key ? { ...w, ...p } : w)));
  const pickMaterial = (w: WallS, m: MasonryMaterial) => {
    const s = sizeOf(m);
    set(w.key, { material: m, sizeUnit: 'mm', l: s.l?.toString() ?? '', h: s.h?.toString() ?? '', w: s.w?.toString() ?? '', joint: m === 'aerated' ? '3' : w.material === 'aerated' ? '10' : w.joint });
  };

  const materials: MaterialListItem[] = [
    ...totals.byMaterial.map((m) => ({ name: `${m.label} ${m.size} mm`, qty: m.pieces, unit: 'ədəd', unitPrice: null, cost: m.priced ? m.unitCost : null, expenseCategory: 'building_materials' as const, note: 'ehtiyatla' })),
    ...(totals.mortarM3 > 0 ? [{ name: 'Hörgü məhlulu (təxmini)', qty: totals.mortarM3, unit: 'm³', unitPrice: null, cost: totals.mortarCost, expenseCategory: 'concrete' as const }] : []),
  ];
  const record: CalcRecord = { calculator: 'masonry', stage: 'masonry', createdAt: new Date().toISOString(), inputs, materials, assumptions: results.flatMap((r) => r.assumptions) };
  const text = [
    'Hörgü hesabı (Tehvil.az)',
    ...walls.map((w, i) => { const r = results[i]; return r.ok && r.piecesWithReserve != null ? `${w.name}: ${materialLabel(w.material)}, xalis ${az(r.netArea)} m², ${r.piecesWithReserve} ədəd (${w.reserve}% ehtiyatla), məhlul ≈ ${r.mortarM3 == null ? '—' : az(r.mortarM3, 3)} m³` : `${w.name}: məlumat tam deyil`; }),
    ...record.materials.map((m) => `• ${m.name}: ${az(m.qty, m.unit === 'ədəd' ? 0 : 3)} ${m.unit}${m.cost != null ? ` — ${az(m.cost)} AZN` : ''}`),
    totals.total != null ? `Təxmini xərc: ${az(totals.total)} AZN` : 'Qiymət daxil edilməyib',
    NOTE, `${SITE}/horgu-kalkulyator`,
  ].join('\n');

  return <Frame current="masonry">
    <section className="cx-hero"><h1 data-testid="cx-title">Hörgü kalkulyatoru</h1><p>Hər divar üçün materialı seçin — mişardaşı, qırmızı və ya ağ silikat kərpic, qazbeton və ya öz ölçünüz. Ölçüləri yazın, qapı və pəncərələri əlavə edin: say, məhlul və xərc dərhal hesablanır.</p></section>
    <div className="cx-walls">
      {walls.map((w, i) => <WallCard key={w.key} w={w} r={results[i]} checked={checked} canRemove={walls.length > 1}
        onChange={(p) => set(w.key, p)} onMaterial={(m) => pickMaterial(w, m)} onRemove={() => setWalls((ws) => ws.filter((x) => x.key !== w.key))} />)}
    </div>
    <div className="cx-actions">
      <button type="button" className="button button-secondary" onClick={() => setWalls((ws) => [...ws, newWall(ws.length + 1, ws[ws.length - 1])])} data-testid="mw-add-wall"><Plus size={16} />Divar əlavə et</button>
      <button type="button" className="button button-primary" onClick={() => { setChecked(true); totalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} data-testid="mw-calc"><Calculator size={16} />Hesabla</button>
      {confirmClear
        ? <><button type="button" className="button button-secondary" onClick={() => { clearState('masonry'); setWalls([newWall(1)]); setChecked(false); setConfirmClear(false); }} data-testid="mw-clear-yes">Bəli, hamısını təmizlə</button><button type="button" className="text-link" onClick={() => setConfirmClear(false)}>Ləğv et</button></>
        : <button type="button" className="button button-quiet" onClick={() => setConfirmClear(true)} data-testid="mw-clear"><RotateCcw size={16} />Təmizlə</button>}
    </div>

    <section className="cx-card cx-totals" ref={totalsRef} aria-labelledby="mw-tot-h" data-testid="mw-totals">
      <h2 id="mw-tot-h">Ümumi yekun</h2>
      {totals.walls === 0 ? <p className="cx-small">Ən azı bir divarın ölçülərini və materialın ölçüsünü yazın.</p> : <>
        <div className="cx-facts">
          <div><small>Divarlar</small><b data-testid="mw-t-walls">{totals.walls}</b>{totals.incomplete > 0 && <em>{totals.incomplete} divar tam deyil</em>}</div>
          <div><small>Xalis sahə</small><b data-testid="mw-t-area">{az(totals.netArea)} m²</b><em>boşluqlar: {az(totals.openingsArea)} m²</em></div>
          <div><small>Xalis həcm</small><b>{az(totals.netVolume, 3)} m³</b></div>
          <div><small>Məhlul (təxmini)</small><b data-testid="mw-t-mortar">{az(totals.mortarM3, 3)} m³</b></div>
        </div>
        <MaterialList items={materials} testid="mw-list" />
        <div className="cx-result">
          <div><small>Material xərci</small><b className={totals.unitCost == null ? 'na' : ''} data-testid="mw-t-unitcost">{totals.unitCost == null ? 'Qiymət daxil edilməyib' : `${az(totals.unitCost)} AZN`}</b>{totals.unitCost != null && totals.unpricedWalls > 0 && <em>{totals.unpricedWalls} divarda qiymət yoxdur</em>}</div>
          <div><small>Məhlul xərci</small><b className={totals.mortarCost == null ? 'na' : ''}>{totals.mortarCost == null ? 'Qiymət daxil edilməyib' : `${az(totals.mortarCost)} AZN`}</b></div>
          <div><small>Ümumi təxmini xərc</small><b className={totals.total == null ? 'na' : ''} data-testid="mw-t-total">{totals.total == null ? 'Qiymət daxil edilməyib' : `${az(totals.total)} AZN`}</b></div>
        </div>
      </>}
      {checked && totals.incomplete > 0 && <p className="cx-warn" role="alert"><AlertTriangle size={15} />{totals.incomplete} divarda məlumat çatışmır — həmin divarın altındakı qırmızı qeydlərə baxın.</p>}
      <p className="cx-note"><Info size={15} />{NOTE}</p>
      {totals.walls > 0 && <ShareBar text={text} />}
    </section>
    <Faq items={FAQ} />
  </Frame>;
}

function WallCard({ w, r, checked, canRemove, onChange, onMaterial, onRemove }: {
  w: WallS; r: MasonryResult; checked: boolean; canRemove: boolean;
  onChange: (p: Partial<WallS>) => void; onMaterial: (m: MasonryMaterial) => void; onRemove: () => void;
}) {
  const mat = MASONRY_MATERIALS.find((m) => m.key === w.material)!;
  const touched = !!(w.length || w.height) || checked;
  const custom = !THICK.includes(w.thickness);
  return <section className="cx-card cx-wall" aria-label={w.name} data-testid="mw-wall">
    <div className="cx-wall-head">
      <input className="cx-wall-name" value={w.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Divarın adı" />
      {canRemove && <button type="button" className="button button-quiet" onClick={onRemove} data-testid="mw-remove-wall"><Trash2 size={15} />Divarı sil</button>}
    </div>
    <div className="cx-row2">
      <NumInput label="Uzunluq" value={w.length} onChange={(v) => onChange({ length: v })} unit="m" testid="mw-length" placeholder="5" />
      <NumInput label="Hündürlük" value={w.height} onChange={(v) => onChange({ height: v })} unit="m" testid="mw-height" placeholder="3" />
    </div>
    <div className="cx-field"><span>Hörgü materialı</span>
      <div className="cx-mats" role="radiogroup" aria-label="Hörgü materialı">{MASONRY_MATERIALS.map((m) => <button key={m.key} type="button" role="radio" aria-checked={w.material === m.key} className={`${w.material === m.key ? 'on' : ''} ${m.key === 'misar' ? 'misar' : ''}`} onClick={() => onMaterial(m.key)} data-testid={`mw-mat-${m.key}`}>{m.label}</button>)}</div>
      <small className="cx-hint">{mat.note}</small>
    </div>
    <div className="cx-field"><span>{w.material === 'misar' ? 'Mişardaşının ölçüsü' : 'Materialın ölçüsü'}</span>
      <Seg value={w.sizeUnit} onChange={(u) => { const k = u === 'sm' ? 0.1 : 10; const c = (s: string) => { const v = numOrNull(s); return v == null ? s : String(+(v * k).toFixed(2)).replace('.', ','); }; onChange({ sizeUnit: u, l: c(w.l), h: c(w.h), w: c(w.w) }); }} label="Ölçü vahidi" testid="mw-unit" options={[['mm', 'mm'], ['sm', 'sm']]} />
    </div>
    <div className="cx-row3">
      <NumInput label="Uzunluq" value={w.l} onChange={(v) => onChange({ l: v })} unit={w.sizeUnit} testid="mw-l" placeholder={w.material === 'misar' ? 'ölçün' : ''} />
      <NumInput label="Hündürlük" value={w.h} onChange={(v) => onChange({ h: v })} unit={w.sizeUnit} testid="mw-h" placeholder={w.material === 'misar' ? 'ölçün' : ''} />
      <NumInput label="En" value={w.w} onChange={(v) => onChange({ w: v })} unit={w.sizeUnit} testid="mw-w" placeholder={w.material === 'misar' ? 'ölçün' : ''} />
    </div>
    <div className="cx-field"><span>Divarın qalınlığı</span>
      <div className="cx-chips">{THICK.map((t) => <button key={t} type="button" className={w.thickness === t ? 'on' : ''} onClick={() => onChange({ thickness: t })} data-testid={`mw-t-${t}`}>{t} sm</button>)}
        <button type="button" className={custom ? 'on' : ''} onClick={() => onChange({ thickness: custom ? w.thickness : '' })} data-testid="mw-t-custom">Başqa</button></div>
      {custom && <NumInput label="Qalınlıq" value={w.thickness} onChange={(v) => onChange({ thickness: v })} unit="sm" testid="mw-thickness" />}
    </div>
    <div className="cx-row2">
      <NumInput label="Tikişin qalınlığı" value={w.joint} onChange={(v) => onChange({ joint: v })} unit="mm" testid="mw-joint" />
      <NumInput label="Ehtiyat" value={w.reserve} onChange={(v) => onChange({ reserve: v })} unit="%" testid="mw-reserve" />
    </div>
    <OpeningsEditor openings={w.openings} onChange={(o) => onChange({ openings: o })} testid="mw" />
    <div className="cx-row2">
      <NumInput label="Bir ədədin qiyməti" value={w.unitPrice} onChange={(v) => onChange({ unitPrice: v })} unit="AZN" testid="mw-price" placeholder="istəyə bağlı" />
      <NumInput label="Məhlul, 1 m³ qiyməti" value={w.mortarPrice} onChange={(v) => onChange({ mortarPrice: v })} unit="AZN" testid="mw-mortar-price" placeholder="istəyə bağlı" />
    </div>

    <div className="cx-wall-res" aria-live="polite" data-testid="mw-res">
      {r.ok || r.netArea > 0 ? <dl>
        <div><dt>Ümumi divar sahəsi</dt><dd>{az(r.grossArea)} m²</dd></div>
        <div><dt>Qapı və pəncərələr</dt><dd data-testid="mw-openings-area">{az(r.openingsArea)} m²</dd></div>
        <div><dt>Xalis hörgü sahəsi</dt><dd data-testid="mw-net-area">{az(r.netArea)} m²</dd></div>
        <div><dt>Xalis hörgü həcmi</dt><dd>{az(r.netVolume, 3)} m³</dd></div>
        {r.pieces != null && <>
          <div><dt>Say (ehtiyatsız){!r.fits && ' · təxmini'}</dt><dd>{az(r.pieces, 1)} ədəd</dd></div>
          <div><dt>Ehtiyat</dt><dd>{w.reserve}%</dd></div>
          <div className="big"><dt>{materialLabel(w.material)}, ehtiyatla</dt><dd data-testid="mw-pieces">{r.piecesWithReserve} ədəd</dd></div>
          <div><dt>Məhlul (təxmini)</dt><dd data-testid="mw-mortar">{r.mortarM3 == null ? '—' : `${az(r.mortarM3, 3)} m³`}</dd></div>
          <div><dt>Yoxlama: sahəyə / həcmə görə</dt><dd>{az(r.byArea, 1)} / {az(r.byVolume, 1)}</dd></div>
          <div><dt>Təxmini xərc</dt><dd data-testid="mw-cost">{r.total == null ? 'Qiymət daxil edilməyib' : `${az(r.total)} AZN`}</dd></div>
        </>}
      </dl> : null}
      {touched && r.errors.map((e) => <p key={e} className="cx-err" role="alert" data-testid="mw-error">{e}</p>)}
      {r.warnings.map((e) => <p key={e} className="cx-warn" data-testid="mw-warning"><AlertTriangle size={14} />{e}</p>)}
      {r.assumptions.length > 0 && <details className="cx-assume"><summary>Hesablamanın fərziyyələri</summary><ul>{r.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>}
    </div>
  </section>;
}
