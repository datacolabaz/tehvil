import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, LoaderCircle, PaintRoller } from 'lucide-react';
import { api, errorText } from '@/lib/finance/api';
import { estimateKey, type Estimate, type FloorPlaster, type PlasterSettings, type PlasterSystem, type PlasterTotal, type Sides, type WallKind, type WallsView } from '@/lib/estimate/api';
import { int, nf, Num } from './masonry-panel';

/*
 * Stage 3: internal and external plaster per floor from the confirmed walls. The person chooses which faces are
 * plastered (per wall kind or per wall), thickness and material (cement-sand or gypsum) for each; the server
 * calculates (lib/wallsPlaster.ts). Internal and external quantities stay separate; the grand total comes last.
 */

const KINDS: WallKind[] = ['external', 'internal', 'partition'];

export function PlasterPanel({ e, w }: { e: Estimate; w: WallsView }) {
  const qc = useQueryClient();
  const [st, setSt] = useState<PlasterSettings>(w.plaster);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (!dirty) setSt(w.plaster); }, [w.plaster, dirty]);
  const set = (fn: (s: PlasterSettings) => PlasterSettings) => { setSt(fn); setDirty(true); };
  const save = async () => {
    setBusy(true); setErr('');
    try { await api(`/ai-estimates/${e.id}/plaster`, 'PUT', { plaster: st }); setDirty(false); await qc.invalidateQueries({ queryKey: estimateKey(e.id) }); } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const kinds = KINDS.filter((k) => w.floors.some((f) => f.walls.some((x) => x.kind === k)));
  const hasExternal = kinds.includes('external');
  const c = w.plasterCalc;
  const setSides = (k: WallKind, p: Partial<Sides>) => set((s) => ({ ...s, sides: { ...s.sides, [k]: { ...s.sides[k], ...p } } }));
  const setSys = (sys: 'internal' | 'external', p: Partial<PlasterSystem>) => set((s) => ({ ...s, [sys]: { ...s[sys], ...p } }));

  if (!w.floors.length) return null;
  return <section className="es-section mp" data-testid="pp-panel">
    <h2 className="es-h2"><PaintRoller size={18} />Suvaq hesabı</h2>
    {!w.floors.some((f) => f.confirmed)
      ? <p className="wr-hint" data-testid="pp-wait">Suvaq yalnız təsdiqlənmiş mərtəbələr üçün hesablanır. Yuxarıda ölçüləri yoxlayıb mərtəbəni təsdiqləyin.</p>
      : <>
        <div className="mp-block">
          <h3>1. Hansı üzlər suvaqlanır</h3>
          {kinds.map((k) => <div key={k} className="mp-row" data-testid={`pp-sides-${k}`}><span>{w.kindLabels[k]}</span>
            {k === 'external'
              ? <div className="pp-sides">
                <Toggle label="İçəri üz" on={st.sides.external.inner > 0} onChange={(v) => setSides('external', { inner: v ? 1 : 0 })} testid="pp-ext-inner" />
                <Toggle label="Fasad" on={st.sides.external.facade > 0} onChange={(v) => setSides('external', { facade: v ? 1 : 0 })} testid="pp-ext-facade" /></div>
              : <div className="wr-seg">{[0, 1, 2].map((n) => <button key={n} className={st.sides[k].inner === n ? 'on' : ''} onClick={() => setSides(k, { inner: n })} data-testid={`pp-${k}-${n}`}>{n === 0 ? 'Suvaqlanmır' : n === 1 ? '1 tərəf' : '2 tərəf'}</button>)}</div>}
          </div>)}
          <p className="wr-hint">Ayrı bir divar üçün aşağıda, mərtəbənin divar siyahısında dəyişmək olar.</p>
        </div>

        <SystemCard title="2. Daxili suvaq" sys={st.internal} labels={w.plasterMaterials} onChange={(p) => setSys('internal', p)} prefix="pp-in" />
        {hasExternal && <SystemCard title="3. Xarici suvaq (fasad)" sys={st.external} labels={w.plasterMaterials} onChange={(p) => setSys('external', p)} prefix="pp-out" />}

        <details className="mp-more"><summary>Sement və qum: texniki əmsallar (fərziyyə, dəyişdirilə bilər)</summary><div className="wr-grid">
          <Num label="Sement kisəsi" unit="kq" v={st.cementBagKg} onChange={(v) => set((s) => ({ ...s, cementBagKg: v ?? 40 }))} testid="pp-bag" />
          <Num label="Quru həcm əmsalı" v={st.dryFactor} onChange={(v) => set((s) => ({ ...s, dryFactor: v ?? 1.3 }))} testid="pp-dry" />
          <Num label="Sementin sıxlığı" unit="kq/m³" v={st.cementDensity} onChange={(v) => set((s) => ({ ...s, cementDensity: v ?? 1300 }))} testid="pp-cd" />
          <Num label="Qumun sıxlığı" unit="kq/m³" v={st.sandDensity} onChange={(v) => set((s) => ({ ...s, sandDensity: v ?? 1600 }))} testid="pp-sd" />
        </div></details>

        {err && <p className="es-msg" role="alert">{err}</p>}
        <div className="wr-actions"><button className="button button-primary" onClick={() => void save()} disabled={busy || !dirty} data-testid="pp-save">{busy ? <LoaderCircle className="spin" size={15} /> : <PaintRoller size={15} />}{dirty ? 'Hesabla' : 'Hesablanıb'}</button>
          {dirty && <span className="wr-dirty">Dəyişikliklər hələ hesablanmayıb.</span>}</div>

        <div className={`wr-status ${c.final ? 'done' : ''}`} data-testid="pp-final">{c.final
          ? <><CheckCircle2 size={18} /><span><b>Suvaq hesabı hazırdır.</b> Bütün mərtəbələr təsdiqlənib.</span></>
          : <><AlertTriangle size={18} /><span><b>İlkin nəticə — yekun deyil.</b> {c.issues.length} məsələ qalıb.</span></>}</div>
        {c.issues.length > 0 && <div className="wr-issues" data-testid="pp-issues"><ul>{c.issues.slice(0, 10).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}

        {c.floors.filter((f) => f.confirmed).map((f) => <FloorPlasterView key={f.floorId} f={f} w={w} st={st}
          onWall={(id, s) => set((x) => { const byWall = { ...x.byWall }; if (s) byWall[id] = s; else delete byWall[id]; return { ...x, byWall }; })} />)}

        {c.floors.filter((f) => f.confirmed).length > 0 && (c.house.internal || c.house.external) && <div className="mp-floor mp-house" data-testid="pp-house">
          <h3>Bütün ev{!c.final && <em> · yalnız təsdiqlənmiş mərtəbələr</em>}</h3>
          <Total t={c.house.internal} title="Daxili suvaq" bag={st.cementBagKg} testid="pp-house-in" />
          <Total t={c.house.external} title="Xarici suvaq (fasad)" bag={st.cementBagKg} testid="pp-house-out" />
          <ul className="mp-list mortar" data-testid="pp-grand"><li><span><b>Ümumi suvaq sahəsi</b></span><span><b>{nf(c.house.total.area)} m²</b></span></li>
            {c.house.total.cementKg > 0 && <li><span><b>Sement, cəmi</b><small>{nf(c.house.total.cementKg, 0)} kq</small></span><span><b data-testid="pp-grand-cement">{int(c.house.total.cementBags)} kisə × {nf(st.cementBagKg)} kq</b></span></li>}
            {c.house.total.sandM3 > 0 && <li><span><b>Qum, cəmi</b><small>≈ {nf(c.house.total.sandTon)} ton</small></span><span><b>{nf(c.house.total.sandM3)} m³</b></span></li>}
            {c.house.total.gypsumKg > 0 && <li><span><b>Gips, cəmi</b><small>{nf(c.house.total.gypsumKg, 0)} kq</small></span><span><b>{int(c.house.total.gypsumBags)} kisə</b></span></li>}</ul>
          <p className="wr-hint">Hörgü məhlulunun sementi və qumu bura daxil deyil — onlar “Hörgü hesabı”ndadır.</p>
        </div>}

        <details className="mp-more" data-testid="pp-assumptions"><summary><Info size={14} />Hesablama qaydaları və fərziyyələr</summary><ul>{c.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
      </>}
  </section>;
}

function Toggle({ label, on, onChange, testid }: { label: string; on: boolean; onChange: (v: boolean) => void; testid: string }) {
  return <label className={`pp-toggle ${on ? 'on' : ''}`} data-testid={testid}><input type="checkbox" checked={on} onChange={(x) => onChange(x.target.checked)} />{label}</label>;
}

function SystemCard({ title, sys, labels, onChange, prefix }: { title: string; sys: PlasterSystem; labels: Record<string, string>; onChange: (p: Partial<PlasterSystem>) => void; prefix: string }) {
  return <div className="mp-block" data-testid={prefix}>
    <h3>{title}</h3>
    <div className="wr-seg">{(['cement_sand', 'gypsum'] as const).map((m) => <button key={m} className={sys.material === m ? 'on' : ''} onClick={() => onChange({ material: m })} data-testid={`${prefix}-${m}`}>{labels[m]}</button>)}</div>
    <div className="wr-grid">
      <Num label="Qalınlıq" unit="mm" v={sys.thicknessMm} onChange={(v) => onChange({ thicknessMm: v ?? 15 })} testid={`${prefix}-thick`} />
      {sys.material === 'gypsum' && <>
        <Num label="Sərfiyyat" unit="kq/m²/mm" v={sys.consumption} onChange={(v) => onChange({ consumption: v })} testid={`${prefix}-cons`} need hint="Gips üçün tipik 0,8–1,0 — məhsulun texniki vərəqindəki rəqəmi yazın" />
        <Num label="Kisə" unit="kq" v={sys.bagKg} onChange={(v) => onChange({ bagKg: v ?? 30 })} testid={`${prefix}-gbag`} /></>}
      <Num label="Ehtiyat" unit="%" v={sys.reservePct} onChange={(v) => onChange({ reservePct: v ?? 0 })} testid={`${prefix}-reserve`} />
      <Num label="Boşluqların yan səthi" unit="sm" v={sys.revealCm} onChange={(v) => onChange({ revealCm: v && v > 0 ? v : null })} testid={`${prefix}-reveal`} hint="Dərinliyi yazsanız, qapı-pəncərənin yanları və üstü əlavə olunur" />
    </div>
    {sys.material === 'cement_sand'
      ? <div className="mp-row"><span>Sement : qum</span><div className="wr-seg">{[2, 3, 4].map((n) => <button key={n} className={sys.ratioSand === n ? 'on' : ''} onClick={() => onChange({ ratioSand: n })} data-testid={`${prefix}-ratio-${n}`}>1 : {n}</button>)}</div></div>
      : <p className="wr-hint">Gips suvağı üçün sement və qum hesablanmır — gips qarışığının kütləsi və kisə sayı göstərilir.</p>}
  </div>;
}

function Total({ t, title, bag, testid }: { t: PlasterTotal | null; title: string; bag: number; testid: string }) {
  if (!t) return null;
  return <ul className="mp-list" data-testid={testid}>
    <li><span><b>{title}</b><small>{t.material === 'gypsum' ? 'gips' : 'sement-qum'}, {nf(t.thicknessMm)} mm · {nf(t.volumeM3, 3)} m³ + ehtiyat = {nf(t.reserveM3, 3)} m³</small></span><span><b data-testid={`${testid}-area`}>{nf(t.area)} m²</b></span></li>
    {t.cementBags != null && <li><span><b>Sement</b><small>{nf(t.cementKg, 0)} kq</small></span><span><b data-testid={`${testid}-cement`}>{int(t.cementBags)} kisə × {nf(bag)} kq</b></span></li>}
    {t.sandM3 != null && <li><span><b>Qum</b><small>≈ {nf(t.sandTon)} ton</small></span><span><b>{nf(t.sandM3)} m³</b></span></li>}
    {t.material === 'gypsum' && <li><span><b>Gips qarışığı</b><small>{t.gypsumKg == null ? 'sərfiyyat yazılmayıb' : `${nf(t.gypsumKg, 0)} kq`}</small></span><span><b data-testid={`${testid}-gypsum`}>{t.gypsumBags == null ? '—' : `${int(t.gypsumBags)} kisə`}</b></span></li>}
  </ul>;
}

function FloorPlasterView({ f, w, st, onWall }: { f: FloorPlaster; w: WallsView; st: PlasterSettings; onWall: (id: string, s: Sides | null) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="mp-floor" data-testid="pp-floor">
    <h3>{f.name}</h3>
    {f.byKind.length > 0 && <div className="mp-table-wrap"><table className="mp-table"><thead><tr><th>Divarlar</th><th>Daxili suvaq, m²</th><th>Fasad, m²</th></tr></thead>
      <tbody>{f.byKind.map((k) => <tr key={k.kind}><td>{w.kindLabels[k.kind]}</td><td>{nf(k.innerArea)}</td><td>{k.kind === 'external' ? nf(k.facadeArea) : '—'}</td></tr>)}</tbody></table></div>}
    <Total t={f.internal} title="Daxili suvaq" bag={st.cementBagKg} testid="pp-in-total" />
    <Total t={f.external} title="Xarici suvaq (fasad)" bag={st.cementBagKg} testid="pp-out-total" />
    <button className="mp-toggle" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="pp-walls-toggle"><ChevronDown size={15} className={open ? 'rot' : ''} />Divarlar üzrə hesab ({f.walls.length})</button>
    {open && <div className="mp-walls">{f.walls.map((x) => {
      const own = st.byWall[x.wallId];
      const key = own ? `${own.inner}-${own.facade}` : '';
      const options: [string, string][] = x.kind === 'external'
        ? [['1-1', 'İçəri üz və fasad'], ['1-0', 'Yalnız içəri üz'], ['0-1', 'Yalnız fasad'], ['0-0', 'Suvaqlanmır']]
        : [['2-0', '2 tərəf'], ['1-0', '1 tərəf'], ['0-0', 'Suvaqlanmır']];
      return <div key={x.wallId} className={`mp-wall ${x.status === 'error' ? 'error' : ''}`} data-testid="pp-wall-row">
        <div className="mp-wall-head"><b>{x.name}</b><small>{w.kindLabels[x.kind]}</small>
          <select value={key} onChange={(s) => { const v = s.target.value; onWall(x.wallId, v ? { inner: Number(v.split('-')[0]), facade: Number(v.split('-')[1]) } : null); }} aria-label={`${x.name}: suvaqlanan üzlər`} data-testid="pp-wall-sides">
            <option value="">{w.kindLabels[x.kind]} üçün seçilən</option>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
        {x.inner > 0 && <p className="mp-trace">Daxili: ({nf(x.innerLen, 3)} m × {nf(x.innerH)} m − boşluqlar {nf(x.openings)} m²){x.inner > 1 ? ' × 2 tərəf' : ''}{x.innerReveal ? ` + yan səthlər ${nf(x.innerReveal)} m²` : ''} = <b>{nf(x.innerArea)} m²</b></p>}
        {x.facade > 0 && <p className="mp-trace">Fasad: {nf(x.facadeLen, 3)} m × {nf(x.facadeH)} m − boşluqlar {nf(x.openings)} m²{x.facadeReveal ? ` + yan səthlər ${nf(x.facadeReveal)} m²` : ''} = <b>{nf(x.facadeArea)} m²</b></p>}
        {x.notes.map((n, i) => <p key={i} className={`mp-note ${x.status === 'error' ? 'warn' : ''}`}>{n}</p>)}
      </div>;
    })}</div>}
  </div>;
}
