import { Fragment, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, LoaderCircle, MoreHorizontal, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/kit';
import { fetchMarketPrice, isPriceStale } from '@/lib/smeta/ai';
import { lineTotals, projectTotals, sectionTotals } from '@/lib/smeta/calc';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/smeta/catalog';
import { azn, dateAz, num, pct } from '@/lib/smeta/format';
import { smeta } from '@/lib/smeta/store';
import type { EstimateLineItem, EstimateSection, Project, Unit } from '@/lib/smeta/types';
import { DropItem, DropLabel, DropMenu, DropSep, LineStatusPill, NumberInput, SourceTag, toast } from './ui';

const UNITS: Unit[] = ['m²', 'm', 'ədəd', 'kisə', 'xidmət', 'komplekt', 'litr'];

function useLineActions(p: Project) {
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const refresh = async (it: EstimateLineItem) => {
    setRefreshing(s => new Set(s).add(it.id));
    try {
      const { price, reference } = await fetchMarketPrice(it);
      smeta.refreshPrice(p.id, it.id, price, reference);
      toast(price === it.materialUnitPrice ? 'Bazar qiyməti dəyişməyib' : `Bazar qiyməti yeniləndi: ${num(it.materialUnitPrice, 2)} → ${num(price, 2)} AZN`);
    } finally {
      setRefreshing(s => { const n = new Set(s); n.delete(it.id); return n; });
    }
  };
  const remove = (it: EstimateLineItem) => {
    const undo = smeta.deleteLine(p.id, it.id);
    toast(`“${it.name}” silindi`, undo ? { label: 'Geri qaytar', run: undo } : undefined);
  };
  return { refreshing, refresh, remove, duplicate: (it: EstimateLineItem) => { smeta.duplicateLine(p.id, it.id); toast('Sətrin surəti yaradıldı'); } };
}

export function EstimateTable({ project: p }: { project: Project }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const actions = useLineActions(p);
  const totals = projectTotals(p);
  const aiCount = p.estimate.sections.flatMap(s => s.items).filter(i => i.status === 'ai' || i.status === 'draft').length;
  const missingCats = CATEGORY_ORDER.filter(c => !p.estimate.sections.some(s => s.category === c));
  const q = query.trim().toLocaleLowerCase('az');
  const sections = useMemo(() => p.estimate.sections.map(s => ({ s, items: q ? s.items.filter(i => `${i.name} ${i.zone}`.toLocaleLowerCase('az').includes(q)) : s.items })).filter(x => !q || x.items.length), [p.estimate.sections, q]);
  const toggle = (id: string) => setCollapsed(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allCollapsed = collapsed.size >= p.estimate.sections.length;
  const addLine = (sectionId: string) => { smeta.addLine(p.id, sectionId); setCollapsed(c => { const n = new Set(c); n.delete(sectionId); return n; }); toast('Yeni iş əlavə edildi — adını və qiymətlərini daxil edin'); };
  const lastPriceUpdate = p.estimate.sections.flatMap(s => s.items).filter(i => i.materialUnitPrice > 0).map(i => i.priceSource.updatedAt).sort().pop();

  return <div>
    <div className="sm-table-toolbar">
      <label className="sm-search"><Search size={15} aria-hidden /><span className="sm-sr">İş axtar</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="İş və ya zona axtar" />{query && <button type="button" className="icon-button" style={{ width: 22, height: 22 }} aria-label="Axtarışı təmizlə" onClick={() => setQuery('')}><X size={13} /></button>}</label>
      <label className="sm-inline-pct" title="Layihə üzrə standart podratçı marjası. Ayrı-ayrı sətirlər üçün “Ətraflı” bölməsində dəyişdirilə bilər."><SlidersHorizontal size={15} aria-hidden />Podratçı marjası
        <NumberInput label="Layihə üzrə podratçı marjası, faizlə" value={Math.round(p.defaultMarginPercentage * 1000) / 10} max={60} onCommit={v => smeta.updateProject(p.id, { defaultMarginPercentage: v / 100 })} />%</label>
      <span className="sm-spacer" />
      {lastPriceUpdate && <span className="sm-muted" style={{ fontSize: 12 }}>Qiymətlər son dəfə: {dateAz(lastPriceUpdate)}</span>}
      <button type="button" className="sm-link-btn" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(p.estimate.sections.map(s => s.id)))}>{allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}{allCollapsed ? 'Hamısını aç' : 'Hamısını bağla'}</button>
      {aiCount > 0 && <Button variant="secondary" className="sm-btn-sm" onClick={() => { smeta.approveLines(p.id); toast(`${aiCount} sətir yoxlanılmış kimi təsdiqləndi`); }}><Check size={14} />Yoxladım, təsdiqlə ({aiCount})</Button>}
      <DropMenu trigger={<button type="button" className="button button-primary sm-btn-sm" data-testid="button-add-line"><Plus size={14} />Yeni iş əlavə et</button>}>
        <DropLabel>Bölmə seçin</DropLabel>
        {p.estimate.sections.map(s => <DropItem key={s.id} onSelect={() => addLine(s.id)}>{s.title}</DropItem>)}
        {missingCats.length > 0 && <><DropSep /><DropLabel>Yeni bölmə</DropLabel>{missingCats.map(c => <DropItem key={c} icon={<Plus size={13} />} onSelect={() => { const sid = smeta.addSection(p.id, c); smeta.addLine(p.id, sid); toast(`“${CATEGORY_LABEL[c]}” bölməsi əlavə edildi`); }}>{CATEGORY_LABEL[c]}</DropItem>)}</>}
      </DropMenu>
    </div>

    {!sections.length && <div className="sm-empty"><h3>{q ? 'Axtarışa uyğun iş tapılmadı' : 'Smetada hələ iş yoxdur'}</h3><p>{q ? 'Başqa açar söz yoxlayın.' : '“Yeni iş əlavə et” düyməsi ilə bölmə və iş əlavə edin.'}</p></div>}

    {sections.length > 0 && <div className="sm-table-wrap desktop-only" role="region" aria-label="Detallı smeta cədvəli" tabIndex={0}>
      <table className="sm-table">
        <colgroup><col style={{ width: 54 }} /><col style={{ width: 240 }} /><col style={{ width: 122 }} /><col style={{ width: 86 }} /><col style={{ width: 84 }} /><col style={{ width: 104 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col style={{ width: 84 }} /><col style={{ width: 104 }} /><col style={{ width: 112 }} /><col style={{ width: 112 }} /></colgroup>
        <thead><tr><th className="stick-1">Bölmə</th><th className="stick-2">İşin adı</th><th>Otaq / Zona</th><th>Vahid</th><th className="r">Miqdar</th><th className="r">Material vahid qiyməti</th><th className="r">Material məbləği</th><th className="r">İşçilik vahid qiyməti</th><th className="r">İşçilik məbləği</th><th className="r">Əlavə xərc</th><th className="r">Cəmi</th><th>Status</th><th><span className="sm-sr">Əməliyyatlar</span></th></tr></thead>
        <tbody>
          {sections.map(({ s, items }) => {
            const si = p.estimate.sections.indexOf(s) + 1;
            const st = sectionTotals(s, p.defaultMarginPercentage);
            const open = !collapsed.has(s.id) || !!q;
            return <Fragment key={s.id}>
              <tr className="cat"><td colSpan={13}><button type="button" className="sm-cat-toggle" aria-expanded={open} onClick={() => toggle(s.id)}><ChevronDown size={16} aria-hidden /><span className="num" style={{ color: '#987651', font: '12px var(--app-font-mono)' }}>{String(si).padStart(2, '0')}</span>{s.title}<small>{s.items.length} iş</small><b>{azn(st.rowsTotal, 'auto')}</b></button></td></tr>
              {open && items.map((it, ii) => <LineRow key={it.id} p={p} it={it} code={`${String(si).padStart(2, '0')}.${ii + 1}`} open={detail === it.id} onDetail={() => setDetail(d => d === it.id ? null : it.id)} actions={actions} />)}
              {open && !q && <tr className="sub"><td colSpan={6}><button type="button" className="sm-link-btn" onClick={() => addLine(s.id)}><Plus size={13} />Bu bölməyə iş əlavə et</button></td><td className="r money"><b>{num(st.material, 2)}</b></td><td /><td className="r money"><b>{num(st.labor, 2)}</b></td><td className="r money">{num(st.additional, 2)}</td><td className="r money"><b>{num(st.rowsTotal, 2)}</b></td><td colSpan={2} className="sm-muted">Bölmə cəmi · ehtiyat {num(st.waste, 0)} · marja {num(st.margin, 0)}</td></tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div>}

    <div className="sm-cards-mobile">{sections.map(({ s, items }) => <MobileSection key={s.id} p={p} s={s} items={items} open={!collapsed.has(s.id) || !!q} onToggle={() => toggle(s.id)} onAdd={() => addLine(s.id)} actions={actions} />)}</div>

    <div className="sm-legend" aria-hidden><span><i style={{ background: '#c28e68' }} />AI təklifi — podratçı yoxlamalıdır</span><span><i style={{ background: '#6f9a80' }} />Sifarişçi təsdiqindən sonra dəyişdirilib</span><span>Cəmi = material + işçilik + əlavə xərc + ehtiyat + marja</span></div>

    <ProjectCosts p={p} />

    <div className="sm-totals-bar" role="status" aria-live="polite" aria-label="Smeta yekunları">
      <div><small>Materiallar</small><b>{azn(totals.material, 'auto')}</b></div>
      <div><small>İşçilik</small><b>{azn(totals.labor, 'auto')}</b></div>
      <div className="optional"><small>Əlavə xərclər</small><b>{azn(totals.additional + totals.projectCosts, 'auto')}</b></div>
      <div className="optional"><small>Ehtiyat / tullantı</small><b>{azn(totals.waste, 'auto')}</b></div>
      <div className="optional"><small>Podratçı marjası</small><b>{azn(totals.margin, 'auto')}</b></div>
      <div className="grand"><small>Ümumi məbləğ</small><b data-testid="text-estimate-total">{azn(totals.total, 'auto')}</b></div>
    </div>
  </div>;
}

type Actions = ReturnType<typeof useLineActions>;

function LineRow({ p, it, code, open, onDetail, actions }: { p: Project; it: EstimateLineItem; code: string; open: boolean; onDetail: () => void; actions: Actions }) {
  const l = lineTotals(it, p.defaultMarginPercentage);
  const upd = (patch: Parameters<typeof smeta.updateLine>[2]) => smeta.updateLine(p.id, it.id, patch);
  const stale = isPriceStale(it);
  return <>
    <tr className={`item ${it.status}`}>
      <td className="sm-muted num stick-1" style={{ font: '12px var(--app-font-mono)' }}>{code}</td>
      <td className="stick-2"><input className="sm-cell-input name" aria-label="İşin adı" value={it.name} onChange={e => upd({ name: e.target.value })} /><div className="sm-cell-sub sm-muted" style={{ fontSize: 11 }} title="Miqdarın mənbəyi">{it.quantitySource.label}</div></td>
      <td><input className="sm-cell-input" aria-label="Otaq / Zona" value={it.zone} onChange={e => upd({ zone: e.target.value })} /></td>
      <td><select className="sm-cell-input" aria-label="Vahid" value={it.unit} onChange={e => upd({ unit: e.target.value as Unit })}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></td>
      <td><NumberInput label={`${it.name}: miqdar`} value={it.quantity} onCommit={v => upd({ quantity: v })} /></td>
      <td><NumberInput label={`${it.name}: material vahid qiyməti`} value={it.materialUnitPrice} fraction={2} onCommit={v => upd({ materialUnitPrice: v })} />{it.materialUnitPrice > 0 && <div className="sm-cell-sub" style={{ justifyContent: 'flex-end' }}><SourceTag source={it.priceSource} />{stale && <span title={`Son yenilənmə: ${dateAz(it.priceSource.updatedAt)}`} style={{ color: '#8a6a35', fontSize: 11, fontWeight: 700 }}>· köhnə</span>}</div>}</td>
      <td className="r money">{num(l.materialTotal, 2)}</td>
      <td><NumberInput label={`${it.name}: işçilik vahid qiyməti`} value={it.laborUnitPrice} fraction={2} onCommit={v => upd({ laborUnitPrice: v })} /></td>
      <td className="r money">{num(l.laborTotal, 2)}</td>
      <td><NumberInput label={`${it.name}: əlavə xərc`} value={it.additionalCost} fraction={2} onCommit={v => upd({ additionalCost: v })} /></td>
      <td className="r total num" title={`Ara cəm ${num(l.rowSubtotal, 2)} + ehtiyat ${num(l.wasteAmount, 2)} + marja ${num(l.marginAmount, 2)} AZN`}>{num(l.rowTotal, 2)}</td>
      <td><LineStatusPill status={it.status} /></td>
      <td><div className="sm-row-actions">
        {(it.status === 'ai' || it.status === 'draft') && <button type="button" className="icon-button" aria-label="Yoxladım, təsdiqlə" title="Yoxladım, təsdiqlə" onClick={() => smeta.approveLines(p.id, [it.id])}><Check size={15} /></button>}
        {it.materialUnitPrice > 0 && <button type="button" className="icon-button" aria-label="Qiyməti yenilə" title="Qiyməti yenilə (bazar qiyməti)" disabled={actions.refreshing.has(it.id)} onClick={() => { void actions.refresh(it); }}>{actions.refreshing.has(it.id) ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}</button>}
        <button type="button" className="icon-button" aria-label="Ətraflı: ehtiyat, marja, mənbə" aria-expanded={open} title="Ətraflı" onClick={onDetail}><SlidersHorizontal size={15} /></button>
        <DropMenu trigger={<button type="button" className="icon-button" aria-label="Digər əməliyyatlar"><MoreHorizontal size={16} /></button>}>
          <DropItem icon={<Copy size={14} />} onSelect={() => actions.duplicate(it)}>Surətini çıxar</DropItem>
          {it.materialUnitPrice > 0 && <DropItem icon={<RefreshCw size={14} />} onSelect={() => { void actions.refresh(it); }}>Qiyməti yenilə</DropItem>}
          <DropSep />
          <DropItem icon={<Trash2 size={14} />} onSelect={() => actions.remove(it)}>Sətri sil</DropItem>
        </DropMenu>
      </div></td>
    </tr>
    {open && <tr className="sm-row-detail"><td colSpan={13}><LineDetail p={p} it={it} /></td></tr>}
  </>;
}

function LineDetail({ p, it }: { p: Project; it: EstimateLineItem }) {
  const l = lineTotals(it, p.defaultMarginPercentage);
  const upd = (patch: Parameters<typeof smeta.updateLine>[2]) => smeta.updateLine(p.id, it.id, patch);
  return <div className="sm-row-detail-inner">
    <label>Ehtiyat / tullantı<span className="sm-inline-pct"><NumberInput label="Ehtiyat faizi" value={Math.round(it.wastePercentage * 1000) / 10} max={40} onCommit={v => upd({ wastePercentage: v / 100 })} />% · {num(l.wasteAmount, 2)} AZN</span></label>
    <label>Podratçı marjası<span className="sm-inline-pct"><NumberInput label="Bu sətir üçün marja faizi" value={Math.round(l.marginPercentage * 1000) / 10} max={60} onCommit={v => upd({ marginPercentage: v / 100 })} />%{it.marginPercentage !== null ? <button type="button" className="sm-link-btn" onClick={() => upd({ marginPercentage: null })}>Layihə standartı ({pct(p.defaultMarginPercentage)})</button> : <span className="sm-muted">layihə standartı</span>}</span></label>
    <label>Miqdarın mənbəyi<p>{it.quantitySource.label}</p></label>
    <label>Qiymət mənbəyi<p><SourceTag source={it.priceSource} />{it.priceSource.reference ? ` · ${it.priceSource.reference}` : ''}<br />Son yenilənmə: {dateAz(it.priceSource.updatedAt)}</p></label>
    <label>Hesablama<p className="num">{num(l.rowSubtotal, 2)} + {num(l.wasteAmount, 2)} + {num(l.marginAmount, 2)} = <b>{num(l.rowTotal, 2)} AZN</b></p></label>
  </div>;
}

function MobileSection({ p, s, items, open, onToggle, onAdd, actions }: { p: Project; s: EstimateSection; items: EstimateLineItem[]; open: boolean; onToggle: () => void; onAdd: () => void; actions: Actions }) {
  const st = sectionTotals(s, p.defaultMarginPercentage);
  return <div className="sm-acc" style={{ marginBottom: 8 }}>
    <button type="button" className="sm-acc-head" aria-expanded={open} onClick={onToggle}><ChevronRight size={16} aria-hidden /><span>{s.title}<br /><small>{s.items.length} iş</small></span><b>{azn(st.rowsTotal)}</b></button>
    {open && <div className="sm-acc-body">{items.map(it => {
      const l = lineTotals(it, p.defaultMarginPercentage);
      const upd = (patch: Parameters<typeof smeta.updateLine>[2]) => smeta.updateLine(p.id, it.id, patch);
      return <div className="sm-line-card" key={it.id}>
        <div className="sm-line-card-head"><div><input className="sm-cell-input name" aria-label="İşin adı" value={it.name} onChange={e => upd({ name: e.target.value })} /><div className="sm-muted" style={{ fontSize: 12, padding: '2px 7px' }}>{it.zone} · {it.quantitySource.label}</div></div><LineStatusPill status={it.status} /></div>
        <div className="sm-line-card-grid">
          <label>Miqdar, {it.unit}<NumberInput label="Miqdar" value={it.quantity} onCommit={v => upd({ quantity: v })} /></label>
          <label>Əlavə xərc<NumberInput label="Əlavə xərc" value={it.additionalCost} fraction={2} onCommit={v => upd({ additionalCost: v })} /></label>
          <label>Material qiyməti<NumberInput label="Material vahid qiyməti" value={it.materialUnitPrice} fraction={2} onCommit={v => upd({ materialUnitPrice: v })} /></label>
          <label>İşçilik qiyməti<NumberInput label="İşçilik vahid qiyməti" value={it.laborUnitPrice} fraction={2} onCommit={v => upd({ laborUnitPrice: v })} /></label>
        </div>
        {it.materialUnitPrice > 0 && <div style={{ marginTop: 8 }}><SourceTag source={it.priceSource} withDate /></div>}
        <div className="sm-line-card-foot"><span className="sm-muted" style={{ fontSize: 12 }}>Material {num(l.materialTotal, 0)} · İşçilik {num(l.laborTotal, 0)}</span><b className="num">{azn(l.rowTotal, 'auto')}</b></div>
        <div className="sm-row-actions" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
          {(it.status === 'ai' || it.status === 'draft') && <button type="button" className="sm-link-btn" onClick={() => smeta.approveLines(p.id, [it.id])}><Check size={13} />Təsdiqlə</button>}
          {it.materialUnitPrice > 0 && <button type="button" className="icon-button" aria-label="Qiyməti yenilə" disabled={actions.refreshing.has(it.id)} onClick={() => { void actions.refresh(it); }}>{actions.refreshing.has(it.id) ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}</button>}
          <button type="button" className="icon-button" aria-label="Surətini çıxar" onClick={() => actions.duplicate(it)}><Copy size={15} /></button>
          <button type="button" className="icon-button" aria-label="Sətri sil" onClick={() => actions.remove(it)}><Trash2 size={15} /></button>
        </div>
      </div>;
    })}<button type="button" className="sm-link-btn" style={{ marginTop: 10 }} onClick={onAdd}><Plus size={13} />İş əlavə et</button></div>}
  </div>;
}

function ProjectCosts({ p }: { p: Project }) {
  const total = p.projectCosts.reduce((s, c) => s + c.amount, 0);
  return <div className="surface sm-project-costs">
    <div className="section-head"><div><div className="eyebrow">Layihə səviyyəsində</div><h3 style={{ marginTop: 4 }}>Əlavə xərclər</h3></div><b className="num" style={{ color: '#21473d' }}>{azn(total, 'auto')}</b></div>
    {p.projectCosts.map(c => <div className="sm-cost-row" key={c.id}>
      <input className="sm-cell-input" aria-label="Xərcin adı" value={c.label} onChange={e => smeta.setProjectCost(p.id, c.id, { label: e.target.value })} />
      <NumberInput label={`${c.label}: məbləğ`} value={c.amount} fraction={2} onCommit={v => smeta.setProjectCost(p.id, c.id, { amount: v })} />
      <button type="button" className="icon-button" aria-label={`${c.label} xərcini sil`} onClick={() => smeta.removeProjectCost(p.id, c.id)}><Trash2 size={14} /></button>
    </div>)}
    <button type="button" className="sm-link-btn" style={{ marginTop: 6 }} onClick={() => smeta.addProjectCost(p.id)}><Plus size={13} />Xərc əlavə et</button>
    <p className="sm-muted" style={{ margin: '8px 0 0', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><Sparkles size={12} aria-hidden />Daşınma, mühafizə və koordinasiya kimi bütün layihəyə aid xərclər marjasız əlavə olunur.</p>
  </div>;
}
