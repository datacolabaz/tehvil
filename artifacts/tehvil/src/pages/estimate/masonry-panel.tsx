import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calculator, CheckCircle2, ChevronDown, Info, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { api, errorText } from '@/lib/finance/api';
import { estimateKey, type Estimate, type MasonryMethod, type MasonrySettings, type MasonrySpec, type MortarTotal, type UnitMaterial, type UnitTotal, type WallKind, type WallsView, type GroupTotal } from '@/lib/estimate/api';

/*
 * Stage 2: masonry per floor from the confirmed walls. The person chooses the material for each wall kind (or one
 * wall), its size, single / double, joints, reserve and the mortar recipe; the server calculates (lib/wallsCalc.ts)
 * and every number can be traced back to the wall it came from.
 */

const uid = () => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** 1 234,5 — space between thousands, comma for decimals. */
export const nf = (v: number | null | undefined, d = 2) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const [i, f] = (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).split('.');
  const frac = (f ?? '').replace(/0+$/, '');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${frac ? `,${frac}` : ''}`;
};
export const int = (v: number) => nf(Math.round(v), 0);
const KINDS: WallKind[] = ['external', 'internal', 'partition'];
const METHODS: MasonryMethod[] = ['single', 'double', 'auto'];

export function MasonryPanel({ e, w }: { e: Estimate; w: WallsView }) {
  const qc = useQueryClient();
  const [st, setSt] = useState<MasonrySettings>(w.masonry);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (!dirty) setSt(w.masonry); }, [w.masonry, dirty]);
  const set = (fn: (s: MasonrySettings) => MasonrySettings) => { setSt(fn); setDirty(true); };
  const setSpec = (id: string, p: Partial<MasonrySpec>) => set((s) => ({ ...s, specs: s.specs.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const save = async () => {
    setBusy(true); setErr('');
    try { await api(`/ai-estimates/${e.id}/masonry`, 'PUT', { masonry: st }); setDirty(false); await qc.invalidateQueries({ queryKey: estimateKey(e.id) }); } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const addSpec = (k: UnitMaterial) => {
    const m = w.unitMaterials.find((x) => x.key === k)!;
    const spec: MasonrySpec = { id: uid(), name: m.label, material: k, l: m.l, h: m.h, w: m.w, jointH: m.joint, jointV: m.joint, method: 'auto', reservePct: 5, binder: m.binder };
    set((s) => {
      // The first material goes to every wall kind that has none yet — the person can change it right below.
      const byKind = { ...s.byKind };
      for (const kd of KINDS) if (!byKind[kd]) byKind[kd] = spec.id;
      return { ...s, specs: [...s.specs, spec], byKind };
    });
  };
  const removeSpec = (id: string) => set((s) => ({
    ...s, specs: s.specs.filter((x) => x.id !== id),
    byKind: Object.fromEntries(Object.entries(s.byKind).map(([k, v]) => [k, v === id ? null : v])) as MasonrySettings['byKind'],
    byWall: Object.fromEntries(Object.entries(s.byWall).filter(([, v]) => v !== id)),
  }));
  const kindsPresent = KINDS.filter((k) => w.floors.some((f) => f.walls.some((x) => x.kind === k)));
  const confirmed = w.floors.filter((f) => f.confirmed);
  const c = w.masonryCalc;
  const m = st.mortar;
  const setM = (p: Partial<typeof m>) => set((s) => ({ ...s, mortar: { ...s.mortar, ...p } }));

  if (!w.floors.length) return null;
  return <section className="es-section mp" data-testid="mp-panel">
    <h2 className="es-h2"><Calculator size={18} />Hörgü hesabı</h2>
    {!confirmed.length
      ? <p className="wr-hint" data-testid="mp-wait">Hesablama yalnız təsdiqlənmiş mərtəbələr üçün aparılır. Yuxarıda ölçüləri yoxlayıb mərtəbəni təsdiqləyin.</p>
      : <>
        <div className="mp-block">
          <h3>1. Hörgü materialları</h3>
          <p className="wr-hint">Materialı seçin, ölçüsünü yoxlayın. “Tək daş” — divarın qalınlığı boyunca bir daş, “qoşa daş” — iki daş; “qalınlığa görə” cərgə sayını çertyojdakı qalınlıqdan götürür.</p>
          {st.specs.map((s) => <SpecCard key={s.id} s={s} info={w.unitMaterials.find((x) => x.key === s.material)} methods={w.methodLabels} onChange={(p) => setSpec(s.id, p)} onRemove={() => removeSpec(s.id)} />)}
          <label className="mp-add"><Plus size={15} /><select value="" onChange={(x) => x.target.value && addSpec(x.target.value as UnitMaterial)} data-testid="mp-add-spec" aria-label="Material əlavə et">
            <option value="">{st.specs.length ? 'Başqa material əlavə et…' : 'Material seçin…'}</option>
            {w.unitMaterials.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select></label>
        </div>

        {st.specs.length > 0 && <div className="mp-block">
          <h3>2. Hansı divar nədən hörülür</h3>
          <div className="wr-grid">{kindsPresent.map((k) => <label key={k} className="fn-field"><span>{w.kindLabels[k]}</span>
            <select value={st.byKind[k] ?? ''} onChange={(x) => set((s) => ({ ...s, byKind: { ...s.byKind, [k]: x.target.value || null } }))} data-testid={`mp-kind-${k}`}>
              <option value="">— seçin —</option>{st.specs.map((s) => <option key={s.id} value={s.id}>{specLabel(s, w.methodLabels)}</option>)}
            </select></label>)}</div>
          <p className="wr-hint">Ayrı bir divar başqa materialdandırsa, aşağıda mərtəbənin divar siyahısında dəyişin.</p>
        </div>}

        <div className="mp-block">
          <h3>3. Hörgü məhlulu</h3>
          <div className="mp-row"><span>Sement : qum</span><div className="wr-seg">{[3, 4, 5].map((n) => <button key={n} className={m.ratioSand === n ? 'on' : ''} onClick={() => setM({ ratioSand: n })} data-testid={`mp-ratio-${n}`}>1 : {n}</button>)}</div></div>
          <div className="mp-row"><span>Məhlulun həcmi</span><div className="wr-seg">
            <button className={m.mode === 'geometry' ? 'on' : ''} onClick={() => setM({ mode: 'geometry' })} data-testid="mp-mode-geometry">Tikişlərdən hesabla</button>
            <button className={m.mode === 'norm' ? 'on' : ''} onClick={() => setM({ mode: 'norm' })} data-testid="mp-mode-norm">Öz göstəricim</button></div></div>
          {m.mode === 'norm' && <Num label="1 m³ hörgüyə məhlul" unit="m³" v={m.normM3PerM3} onChange={(v) => setM({ normM3PerM3: v })} testid="mp-norm" hint="Layihədə və ya normada yazılan rəqəm. Yazılmasa, məhlul hesablanmır." />}
          <div className="wr-grid">
            <Num label="Sement kisəsi" unit="kq" v={m.cementBagKg} onChange={(v) => setM({ cementBagKg: v ?? 40 })} testid="mp-bag" />
            <Num label="Məhlula ehtiyat" unit="%" v={m.reservePct} onChange={(v) => setM({ reservePct: v ?? 0 })} testid="mp-mreserve" />
          </div>
          <details className="mp-more"><summary>Texniki əmsallar (fərziyyə, dəyişdirilə bilər)</summary><div className="wr-grid">
            <Num label="Quru həcm əmsalı" v={m.dryFactor} onChange={(v) => setM({ dryFactor: v ?? 1.3 })} testid="mp-dry" hint="1 m³ yaş məhlula neçə m³ quru sement və qum" />
            <Num label="Sementin sıxlığı" unit="kq/m³" v={m.cementDensity} onChange={(v) => setM({ cementDensity: v ?? 1300 })} testid="mp-cd" />
            <Num label="Qumun sıxlığı" unit="kq/m³" v={m.sandDensity} onChange={(v) => setM({ sandDensity: v ?? 1600 })} testid="mp-sd" />
          </div></details>
        </div>

        {err && <p className="es-msg" role="alert">{err}</p>}
        <div className="wr-actions"><button className="button button-primary" onClick={() => void save()} disabled={busy || !dirty} data-testid="mp-save">{busy ? <LoaderCircle className="spin" size={15} /> : <Calculator size={15} />}{dirty ? 'Hesabla' : 'Hesablanıb'}</button>
          {dirty && <span className="wr-dirty">Dəyişikliklər hələ hesablanmayıb.</span>}</div>

        <div className={`wr-status ${c.final ? 'done' : ''}`} data-testid="mp-final">{c.final
          ? <><CheckCircle2 size={18} /><span><b>Hörgü hesabı hazırdır.</b> Bütün mərtəbələr təsdiqlənib, bütün divarlar hesablanıb.</span></>
          : <><AlertTriangle size={18} /><span><b>İlkin nəticə — yekun deyil.</b> {c.issues.length} məsələ qalıb.</span></>}</div>
        {c.issues.length > 0 && <div className="wr-issues" data-testid="mp-issues"><ul>{c.issues.slice(0, 10).map((x, i) => <li key={i}>{x}</li>)}</ul>{c.issues.length > 10 && <small>və daha {c.issues.length - 10}</small>}</div>}

        {c.floors.filter((f) => f.confirmed).map((f) => <FloorResult key={f.floorId} f={f} w={w} st={st}
          onWallSpec={(wallId, spec) => set((s) => { const byWall = { ...s.byWall }; if (spec) byWall[wallId] = spec; else delete byWall[wallId]; return { ...s, byWall }; })} />)}

        {c.floors.filter((f) => f.confirmed).length > 1 && <div className="mp-floor mp-house" data-testid="mp-house">
          <h3>Bütün ev{!c.final && <em> · yalnız təsdiqlənmiş mərtəbələr</em>}</h3>
          <Groups g={c.house.groups} labels={w.kindLabels} />
          <Units u={c.house.units} />
          <Mortar m={c.house.mortar} bag={m.cementBagKg} />
          <p className="wr-hint">Ev üzrə say və kisələr cəmdən bir dəfə yuxarı yuvarlaqlaşdırılır, ona görə mərtəbələrin cəmindən bir az az ola bilər.</p>
        </div>}

        <details className="mp-more" data-testid="mp-assumptions"><summary><Info size={14} />Hesablama qaydaları və fərziyyələr</summary><ul>{c.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
      </>}
  </section>;
}

const specLabel = (s: MasonrySpec, methods: Record<MasonryMethod, string>) => `${s.name}${s.l && s.w && s.h ? ` ${s.l}×${s.w}×${s.h}` : ''} · ${methods[s.method].toLowerCase()}`;

function SpecCard({ s, info, methods, onChange, onRemove }: { s: MasonrySpec; info?: { note: string; binder: string }; methods: Record<MasonryMethod, string>; onChange: (p: Partial<MasonrySpec>) => void; onRemove: () => void }) {
  return <div className="wr-wall" data-testid="mp-spec">
    <div className="wr-wall-head"><input className="wr-name" value={s.name} onChange={(x) => onChange({ name: x.target.value })} aria-label="Materialın adı" />
      <button className="icon-button" aria-label="Materialı sil" onClick={onRemove} data-testid="mp-spec-remove"><Trash2 size={15} /></button></div>
    {info && <p className="wr-hint">{info.note}</p>}
    <div className="wr-grid">
      <Num label="Uzunluq" unit="mm" v={s.l} onChange={(v) => onChange({ l: v })} testid="mp-l" need />
      <Num label="En (qalınlıq boyunca)" unit="mm" v={s.w} onChange={(v) => onChange({ w: v })} testid="mp-w" need />
      <Num label="Hündürlük" unit="mm" v={s.h} onChange={(v) => onChange({ h: v })} testid="mp-h" need />
      <Num label={s.binder === 'glue' ? 'Yapışqan (üfüqi)' : 'Üfüqi tikiş'} unit="mm" v={s.jointH} onChange={(v) => onChange({ jointH: v ?? 0 })} testid="mp-jh" />
      <Num label={s.binder === 'glue' ? 'Yapışqan (şaquli)' : 'Şaquli tikiş'} unit="mm" v={s.jointV} onChange={(v) => onChange({ jointV: v ?? 0 })} testid="mp-jv" />
      <Num label="Ehtiyat (kəsim, qırılma)" unit="%" v={s.reservePct} onChange={(v) => onChange({ reservePct: v ?? 0 })} testid="mp-reserve" />
    </div>
    <div className="wr-seg" role="radiogroup" aria-label="Hörgü üsulu">{METHODS.map((k) => <button key={k} role="radio" aria-checked={s.method === k} className={s.method === k ? 'on' : ''} onClick={() => onChange({ method: k })} data-testid={`mp-method-${k}`}>{methods[k]}</button>)}</div>
  </div>;
}

export function Num({ label, unit, v, onChange, testid, hint, need }: { label: string; unit?: string; v: number | null; onChange: (v: number | null) => void; testid: string; hint?: string; need?: boolean }) {
  const [t, setT] = useState(v == null ? '' : String(v).replace('.', ','));
  useEffect(() => { const cur = t.replace(',', '.'); if ((v == null && cur !== '') || (v != null && Number(cur) !== v)) setT(v == null ? '' : String(v).replace('.', ',')); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const bad = t.trim() !== '' && !(Number(t.replace(',', '.')) >= 0);
  return <label className={`wr-p ${need && v == null ? 'missing' : ''}`} data-testid={testid}><span>{label}</span>
    <span className="wr-in"><input inputMode="decimal" value={t} aria-invalid={bad} onChange={(x) => { setT(x.target.value); const s = x.target.value.trim().replace(',', '.'); if (!s) onChange(null); else if (Number(s) >= 0) onChange(Number(s)); }} />{unit && <em>{unit}</em>}</span>
    {need && v == null && <small className="wr-src risk">Yazın — ölçüsüz say hesablanmır</small>}
    {hint && <small className="wr-src">{hint}</small>}
    {bad && <small className="wr-bad">Rəqəm yazın</small>}
  </label>;
}

function FloorResult({ f, w, st, onWallSpec }: { f: WallsView['masonryCalc']['floors'][number]; w: WallsView; st: MasonrySettings; onWallSpec: (wallId: string, spec: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const STATUS: Record<string, string> = { 'no-material': 'material seçilməyib', 'no-size': 'materialın ölçüsü yoxdur', 'no-norm': 'məhlul göstəricisi yoxdur', error: 'ölçüləri yoxlayın' };
  return <div className="mp-floor" data-testid="mp-floor">
    <h3>{f.name} <em>· hörgü hündürlüyü {nf(f.height)} m</em>{!f.complete && <span className="mp-badge">natamam</span>}</h3>
    <Groups g={f.groups} labels={w.kindLabels} />
    <Units u={f.units} />
    <Mortar m={f.mortar} bag={st.mortar.cementBagKg} />
    <button className="mp-toggle" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="mp-walls-toggle"><ChevronDown size={15} className={open ? 'rot' : ''} />Divarlar üzrə hesab ({f.walls.length})</button>
    {open && <div className="mp-walls">{f.walls.map((x) => {
      const own = st.byWall[x.wallId] ?? '';
      return <div key={x.wallId} className={`mp-wall ${x.status}`} data-testid="mp-wall-row">
        <div className="mp-wall-head"><b>{x.name}</b><small>{w.kindLabels[x.kind]}</small>
          <select value={own} onChange={(s) => onWallSpec(x.wallId, s.target.value || null)} aria-label={`${x.name}: material`} data-testid="mp-wall-spec">
            <option value="">{w.kindLabels[x.kind]} üçün seçilən</option>{st.specs.map((s) => <option key={s.id} value={s.id}>{specLabel(s, w.methodLabels)}</option>)}
          </select></div>
        <p className="mp-trace">L {nf(x.L)}{x.deduct ? ` − ${nf(x.deduct, 3)} = ${nf(x.Leff, 3)}` : ''} m × H {nf(x.H)} m = {nf(x.gross)} m² − boşluqlar {nf(x.openings)} m² = <b>{nf(x.net)} m²</b> · qalınlıq {nf(x.T * 100, 1)} sm → {nf(x.volume, 3)} m³</p>
        {x.status === 'ok'
          ? <p className="mp-trace">{x.rows === 1 ? 'Tək' : x.rows === 2 ? 'Qoşa' : `${x.rows} cərgə`} hörgü · <b>{nf(x.units, 1)} ədəd</b> (ehtiyatsız) · məhlul {nf(x.mortarM3, 3)} m³{x.binder === 'glue' ? ' (yapışqan)' : ''}</p>
          : <p className="mp-trace risk">Hesablanmadı: {STATUS[x.status]}</p>}
        {x.notes.map((n, i) => <p key={i} className={`mp-note ${n.startsWith('Künclər') ? '' : 'warn'}`}>{n}</p>)}
      </div>;
    })}</div>}
  </div>;
}

function Groups({ g, labels }: { g: GroupTotal[]; labels: Record<WallKind, string> }) {
  if (!g.length) return null;
  return <div className="mp-table-wrap"><table className="mp-table" data-testid="mp-groups"><thead><tr><th>Divarlar</th><th>Ümumi, m²</th><th>Boşluqlar, m²</th><th>Xalis, m²</th><th>Həcm, m³</th></tr></thead>
    <tbody>{g.map((x) => <tr key={x.kind}><td>{labels[x.kind]} <small>({x.walls})</small></td><td>{nf(x.gross)}</td><td>{nf(x.openings)}</td><td><b>{nf(x.net)}</b></td><td>{nf(x.volume, 3)}</td></tr>)}
      {g.length > 1 && <tr className="sum"><td>Cəmi</td><td>{nf(g.reduce((s, x) => s + x.gross, 0))}</td><td>{nf(g.reduce((s, x) => s + x.openings, 0))}</td><td><b>{nf(g.reduce((s, x) => s + x.net, 0))}</b></td><td>{nf(g.reduce((s, x) => s + x.volume, 0), 3)}</td></tr>}</tbody></table></div>;
}
function Units({ u }: { u: UnitTotal[] }) {
  if (!u.length) return null;
  return <ul className="mp-list" data-testid="mp-units">{u.map((x) => <li key={x.specId}><span><b>{x.name}</b><small>{x.size}</small></span><span><b data-testid="mp-unit-count">{int(x.units)} ədəd</b><small>{nf(x.unitsRaw, 1)} + {nf(x.reservePct, 1)}% ehtiyat</small></span></li>)}</ul>;
}
function Mortar({ m, bag }: { m: MortarTotal | null; bag: number }) {
  if (!m) return null;
  return <ul className="mp-list mortar" data-testid="mp-mortar">
    {m.wetM3 > 0 && <>
      <li><span><b>Hörgü məhlulu</b><small>{nf(m.wetM3, 3)} m³ + ehtiyat = {nf(m.reserveM3, 3)} m³</small></span><span><b>{nf(m.reserveM3, 2)} m³</b></span></li>
      <li><span><b>Sement</b><small>{nf(m.cementKg, 0)} kq</small></span><span><b data-testid="mp-cement">{int(m.cementBags)} kisə × {nf(bag)} kq</b></span></li>
      <li><span><b>Qum</b><small>≈ {nf(m.sandTon, 2)} ton</small></span><span><b data-testid="mp-sand">{nf(m.sandM3, 2)} m³</b></span></li></>}
    {m.glueM3 > 0 && <li><span><b>Yapışqan (qazbeton)</b><small>sement-qum hesablanmır — məhsulun sərfiyyatına baxın</small></span><span><b>{nf(m.glueM3, 3)} m³</b></span></li>}
  </ul>;
}
