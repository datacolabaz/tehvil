import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, Copy, Info, Printer, Ruler, Share2 } from 'lucide-react';
import {
  az, convertRebar, parseNum, piecesFor, REBAR_DIAMETERS, rebarFacts, timber, timberCost,
  type LenUnit, type PriceBasis, type RebarUnit,
} from '@/lib/calc/construction';
import './calc.css';

/*
 * Public construction calculators (no sign-in): /armatur-konvertor and /taxta-kalkulyator.
 * Results update as you type; copy, WhatsApp and print; FAQ and schema.org markup for search.
 */

export const NOTE = 'Nəticələr təxminidir. Real sifarişdə ölçü, marka və tədarükçü məlumatı təsdiqlənməlidir.';
export const SITE = 'https://tehvil.az';

/* ------------------------------------------------------------ page frame */

export function useSeo(path: string, title: string, description: string, faq: [string, string][]) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const meta = (sel: string, attr: string, key: string, value: string) => {
      let el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(sel);
      const created = !el;
      if (!el) { el = document.createElement(sel.startsWith('link') ? 'link' : 'meta') as HTMLMetaElement; el.setAttribute(attr, key); document.head.appendChild(el); }
      const old = el.getAttribute(sel.startsWith('link') ? 'href' : 'content');
      el.setAttribute(sel.startsWith('link') ? 'href' : 'content', value);
      return () => { if (created) el!.remove(); else if (old != null) el!.setAttribute(sel.startsWith('link') ? 'href' : 'content', old); };
    };
    const undo = [
      meta('meta[name="description"]', 'name', 'description', description),
      meta('meta[property="og:title"]', 'property', 'og:title', title),
      meta('meta[property="og:description"]', 'property', 'og:description', description),
      meta('meta[property="og:url"]', 'property', 'og:url', `${SITE}${path}`),
      meta('link[rel="canonical"]', 'rel', 'canonical', `${SITE}${path}`),
    ];
    const ld = document.createElement('script');
    ld.type = 'application/ld+json'; ld.dataset.calc = path;
    ld.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebApplication', name: title, url: `${SITE}${path}`, inLanguage: 'az', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', isAccessibleForFree: true, description, publisher: { '@id': `${SITE}/#org` } },
        { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Tehvil.az', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: title, item: `${SITE}${path}` }] },
      ],
    });
    document.head.appendChild(ld);
    window.scrollTo(0, 0);
    return () => { document.title = prevTitle; undo.forEach((f) => f()); ld.remove(); };
  }, [path, title, description, faq]);
}

export function Frame({ current, children }: { current: 'rebar' | 'timber' | 'masonry' | 'plaster'; children: ReactNode }) {
  return <div className="cx-page">
    <header className="cx-top">
      <Link href="/" className="cx-brand"><img src="/favicon.svg" alt="" width="28" height="28" />Tehvil.az</Link>
      <nav aria-label="Kalkulyatorlar">
        <Link href="/armatur-konvertor" className={current === 'rebar' ? 'on' : ''}>Armatur</Link>
        <Link href="/taxta-kalkulyator" className={current === 'timber' ? 'on' : ''}>Taxta</Link>
        <Link href="/horgu-kalkulyator" className={current === 'masonry' ? 'on' : ''}>Hörgü</Link>
        <Link href="/suvaq-kalkulyator" className={current === 'plaster' ? 'on' : ''}>Suvaq</Link>
      </nav>
    </header>
    <main className="cx-main">{children}</main>
    <footer className="cx-foot">
      <p>Tikintinin bütün material və iş xərclərini saxlamaq, AI ilə çertyojdan smeta çıxarmaq üçün:</p>
      <div><Link href="/sign-up?redirect=/smeta-ai/yeni" className="button button-secondary">AI Smeta</Link><Link href="/sign-up?redirect=/xercler?add=1" className="button button-secondary">Evimin xərcləri</Link></div>
    </footer>
  </div>;
}

export function NumInput({ label, value, onChange, unit, testid, placeholder }: { label: string; value: string; onChange: (v: string) => void; unit?: string; testid: string; placeholder?: string }) {
  const bad = Number.isNaN(parseNum(value) as number) || (parseNum(value) ?? 0) < 0;
  return <label className={`cx-field ${bad ? 'bad' : ''}`}><span>{label}</span>
    <span className="cx-input"><input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testid} aria-invalid={bad} />{unit && <em>{unit}</em>}</span>
    {bad && <small>Rəqəm yazın, məs. 12,5</small>}
  </label>;
}

export function Seg<T extends string>({ value, options, onChange, label, testid }: { value: T; options: [NoInfer<T>, string][]; onChange: (v: NoInfer<T>) => void; label: string; testid: string }) {
  return <div className="cx-seg" role="radiogroup" aria-label={label}>{options.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)} data-testid={`${testid}-${k}`}>{l}</button>)}</div>;
}

/** Copy, WhatsApp, print. The text is what the person sees, line by line. */
export function ShareBar({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt('Kopyalayın:', text); } };
  return <div className="cx-share" data-testid="cx-share">
    <button type="button" className="button button-secondary" onClick={copy} data-testid="cx-copy">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Kopyalandı' : 'Kopyala'}</button>
    <a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" data-testid="cx-whatsapp"><Share2 size={16} />WhatsApp</a>
    <button type="button" className="button button-secondary" onClick={() => window.print()} data-testid="cx-print"><Printer size={16} />Çap et</button>
  </div>;
}

export function Faq({ items }: { items: [string, string][] }) {
  return <section className="cx-faq" aria-labelledby="cx-faq-h"><h2 id="cx-faq-h">Tez-tez verilən suallar</h2>
    {items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
  </section>;
}

/* ---------------------------------------------------------------- rebar */

const REBAR_FAQ: [string, string][] = [
  ['1 metr armatur neçə kiloqramdır?', 'Diametrin kvadratı 162-yə bölünür: kq/m = d² / 162. Məsələn, Ø12 üçün 144 / 162 = 0,889 kq/m. Standart cədvəldə bu dəyər yuvarlaqlaşdırılıb 0,888 kq/m göstərilir.'],
  ['1 ton 12-lik armatur neçə metrdir?', 'Düsturla 1000 / 0,889 ≈ 1 125 metr, standart cədvəl dəyəri ilə (0,888 kq/m) ≈ 1 126 metr. Bu, 12 metrlik təxminən 94 çubuqdur.'],
  ['Niyə düsturla cədvəl arasında kiçik fərq var?', 'Cədvəl dəyərləri poladın sıxlığı (7 850 kq/m³) ilə hesablanıb yuvarlaqlaşdırılır. Fərq 1%-dən azdır. Real çəki zavod və profildən asılı olaraq bir neçə faiz dəyişə bilər, ona görə sifarişdə tədarükçünün çəkisini yoxlayın.'],
  ['12 metr, yoxsa 11,7 metr?', 'Bazarda çubuqlar adətən 12 m, bəzən 11,7 m satılır. Uzunluğu seçin — çubuq sayı ona görə hesablanır.'],
];

export function RebarPage() {
  useSeo('/armatur-konvertor', 'Armatur konvertoru: ton, metr və çubuq sayı — Tehvil.az', 'Armaturun diametrinə görə 1 metrin çəkisini, 1 tonun neçə metr və neçə çubuq olduğunu dərhal hesablayın. Ø6–Ø32 üçün cədvəl.', REBAR_FAQ);
  const [d, setD] = useState(12);
  const [unit, setUnit] = useState<RebarUnit>('ton');
  const [value, setValue] = useState('1');
  const [bar, setBar] = useState<'12' | '11.7'>('12');
  const L = Number(bar);
  const f = rebarFacts(d, L);
  const v = parseNum(value);
  const r = v != null && !Number.isNaN(v) ? convertRebar(d, v, unit, L) : null;
  const text = [
    `Armatur Ø${d} mm`,
    `1 metr: ${az(f.kgPerM, 3)} kq (cədvəl: ${az(f.tableKgPerM, 3)} kq)`,
    `1 ton: ${az(f.metresPerTon, 0)} m · ${az(f.barsPerTon, 1)} ədəd ${az(L, L % 1 ? 1 : 0)} m-lik çubuq`,
    ...(r ? [`${unit === 'ton' ? `${az(v!, 3)} ton` : unit === 'metr' ? `${az(v!, 1)} m` : `${az(v!, 0)} ədəd`} = ${az(r.tons, 3)} ton (${az(r.kg, 1)} kq) = ${az(r.metres, 1)} m = ${az(r.bars, 1)} çubuq`] : []),
    NOTE, `${SITE}/armatur-konvertor`,
  ].join('\n');
  return <Frame current="rebar">
    <section className="cx-hero"><h1 data-testid="cx-title">Armatur konvertoru</h1><p>Diametri seçin: 1 metrin çəkisi, 1 tonun neçə metr və neçə çubuq olduğu dərhal görünür. Ton, metr və ya çubuq sayı yazın — qalan ikisi hesablanır.</p></section>
    <div className="cx-grid">
      <section className="cx-card" aria-label="Hesablama">
        <div className="cx-field"><span>Diametr</span>
          <div className="cx-chips" role="radiogroup" aria-label="Diametr">{REBAR_DIAMETERS.map((x) => <button key={x} type="button" role="radio" aria-checked={d === x} className={d === x ? 'on' : ''} onClick={() => setD(x)} data-testid={`cx-d-${x}`}>Ø{x}</button>)}</div>
        </div>
        <div className="cx-field"><span>Çubuğun uzunluğu</span><Seg value={bar} onChange={setBar} label="Çubuğun uzunluğu" testid="cx-bar" options={[['12', '12 m'], ['11.7', '11,7 m']]} /></div>
        <div className="cx-facts" data-testid="cx-facts">
          <div><small>1 metrin çəkisi</small><b data-testid="cx-kgm">{az(f.kgPerM, 3)} kq</b><em>cədvəl: {az(f.tableKgPerM, 3)} kq</em></div>
          <div><small>1 ton</small><b data-testid="cx-mton">{az(f.metresPerTon, 0)} m</b><em>cədvəllə: {az(1000 / (f.tableKgPerM ?? f.kgPerM), 0)} m</em></div>
          <div><small>{az(L, L % 1 ? 1 : 0)} m-lik 1 çubuq</small><b data-testid="cx-bar-kg">{az(f.barKg, 2)} kq</b></div>
          <div><small>1 tonda çubuq</small><b data-testid="cx-bars-ton">{az(f.barsPerTon, 1)} ədəd</b><em>tam: {Math.floor(f.barsPerTon)}</em></div>
        </div>
        <div className="cx-field"><span>Nə bilirsiniz?</span><Seg value={unit} onChange={setUnit} label="Vahid" testid="cx-unit" options={[['ton', 'Ton'], ['metr', 'Metr'], ['eded', 'Çubuq sayı']]} /></div>
        <NumInput label={unit === 'ton' ? 'Neçə ton?' : unit === 'metr' ? 'Neçə metr?' : 'Neçə çubuq?'} value={value} onChange={setValue} unit={unit === 'ton' ? 'ton' : unit === 'metr' ? 'm' : 'ədəd'} testid="cx-value" />
        <div className="cx-result" aria-live="polite" data-testid="cx-result">
          {r ? <>
            <div><small>Çəki</small><b data-testid="cx-r-ton">{az(r.tons, 3)} ton</b><em>{az(r.kg, 1)} kq</em></div>
            <div><small>Uzunluq</small><b data-testid="cx-r-m">{az(r.metres, 1)} m</b></div>
            <div><small>{az(L, L % 1 ? 1 : 0)} m-lik çubuq</small><b data-testid="cx-r-bars">{az(r.bars, 1)} ədəd</b><em>alış üçün: {Math.ceil(r.bars - 1e-9)}</em></div>
          </> : <p>Miqdarı yazın.</p>}
        </div>
        <p className="cx-note"><Info size={15} />{NOTE}</p>
        <ShareBar text={text} />
      </section>
      <section className="cx-card cx-table-card" aria-labelledby="cx-tab-h"><h2 id="cx-tab-h">Tez baxış: Ø6–Ø32</h2>
        <table className="cx-table" data-testid="cx-table">
          <thead><tr><th>Ø, mm</th><th>kq/m</th><th>1 ton, m</th><th>{az(L, L % 1 ? 1 : 0)} m çubuq, kq</th><th>1 tonda çubuq</th></tr></thead>
          <tbody>{REBAR_DIAMETERS.map((x) => { const g = rebarFacts(x, L); return <tr key={x} className={x === d ? 'on' : ''} onClick={() => setD(x)}><td>Ø{x}</td><td>{az(g.kgPerM, 3)}</td><td>{az(g.metresPerTon, 0)}</td><td>{az(g.barKg, 2)}</td><td>{az(g.barsPerTon, 1)}</td></tr>; })}</tbody>
        </table>
        <p className="cx-small">Düstur: kq/m = d² / 162. Cədvəl dəyərləri (ГОСТ 5781) “cədvəl” kimi ayrıca göstərilir; fərq 1%-dən azdır.</p>
      </section>
    </div>
    <Faq items={REBAR_FAQ} />
  </Frame>;
}

/* --------------------------------------------------------------- timber */

const SECTIONS: [number, number][] = [[2, 3], [2, 4], [3, 4], [3, 10], [4, 10], [5, 5], [5, 10], [5, 15], [2.5, 15]];
const LENGTHS = [2, 3, 4, 4.5, 6];
const TIMBER_FAQ: [string, string][] = [
  ['1 kub taxtada neçə ədəd var?', 'Bir taxtanın həcmini tapın (en × qalınlıq × uzunluq, metrlə) və 1-i ona bölün. Məsələn, 5×10 sm, 6 m taxta 0,03 m³-dir: 1 / 0,03 ≈ 33,3, yəni 1 kubda 33 tam ədəd var.'],
  ['3×10 taxtanın bir ədədi neçə kubdur?', '3 m uzunluqda: 0,03 × 0,10 × 3 = 0,009 m³. Üz sahəsi (en × uzunluq) 0,10 × 3 = 0,3 m²-dir.'],
  ['Lazım olan ədədi necə hesablayıram?', 'Aşağıdakı “Neçə ədəd lazımdır?” bölməsində lazım olan m³ və ya m² yazın — ədəd yuxarı yuvarlaqlaşdırılır.'],
  ['Qiymət kubla verilib, bir ədəd neçəyədir?', 'Qiyməti “m³ qiyməti” kimi yazın: bir ədədin qiyməti = m³ qiyməti × bir taxtanın həcmi. Ümumi məbləğ də hesablanır.'],
];

export function TimberPage() {
  useSeo('/taxta-kalkulyator', 'Taxta kalkulyatoru: kub (m³), kvadrat (m²) və ədəd — Tehvil.az', 'Taxtanın en, qalınlıq və uzunluğuna görə bir ədədin və ümumi həcmi (m³), üz sahəsini (m²), lazım olan ədədi və qiyməti hesablayın. 3×10, 5×10 və digər ölçülər.', TIMBER_FAQ);
  const [sec, setSec] = useState<LenUnit>('sm');
  const [w, setW] = useState('10'); const [t, setT] = useState('3');
  const [len, setLen] = useState('3'); const [lenUnit, setLenUnit] = useState<LenUnit>('m');
  const [count, setCount] = useState('1');
  const [need, setNeed] = useState(''); const [needUnit, setNeedUnit] = useState<'m3' | 'm2'>('m3');
  const [price, setPrice] = useState(''); const [basis, setBasis] = useState<PriceBasis>('m3');
  const num = (s: string) => { const v = parseNum(s); return v == null || Number.isNaN(v) ? NaN : v; };
  const n = num(count);
  const r = useMemo(() => timber({ width: num(w), thickness: num(t), sectionUnit: sec, length: num(len), lengthUnit: lenUnit, count: Number.isNaN(n) ? 0 : n }), [w, t, sec, len, lenUnit, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const needV = num(need);
  const pieces = r && !Number.isNaN(needV) ? piecesFor(needV, needUnit === 'm3' ? r.pieceM3 : r.pieceM2) : null;
  const priceV = num(price);
  const cost = r && !Number.isNaN(priceV) && !Number.isNaN(n) ? timberCost(r, n, priceV, basis) : null;
  const setPreset = ([a, b]: [number, number]) => { setSec('sm'); setT(String(a).replace('.', ',')); setW(String(b).replace('.', ',')); };
  const secLabel = `${w}×${t} ${sec === 'sm' ? 'sm' : sec}`;
  const text = r ? [
    `Taxta ${t}×${w} ${sec === 'sm' ? 'sm' : sec}, uzunluq ${len} ${lenUnit === 'sm' ? 'sm' : lenUnit}, ${count} ədəd`,
    `1 ədəd: ${az(r.pieceM3, 4)} m³ · ${az(r.pieceM2, 3)} m²`,
    `Cəmi: ${az(r.totalM3, 3)} m³ · ${az(r.totalM2, 2)} m²`,
    ...(pieces ? [`${az(needV, 3)} ${needUnit === 'm3' ? 'm³' : 'm²'} üçün: ${pieces} ədəd`] : []),
    ...(cost ? [`Qiymət: 1 ədəd ${az(cost.perPiece)} AZN, cəmi ${az(cost.total)} AZN`] : []),
    NOTE, `${SITE}/taxta-kalkulyator`,
  ].join('\n') : '';
  return <Frame current="timber">
    <section className="cx-hero"><h1 data-testid="cx-title">Taxta kalkulyatoru</h1><p>Ölçünü seçin və ya yazın: bir taxtanın və ümumi həcm (m³), üz sahəsi (m²), lazım olan ədəd və qiymət dərhal hesablanır.</p></section>
    <div className="cx-grid">
      <section className="cx-card" aria-label="Hesablama">
        <div className="cx-field"><span>Hazır ölçülər (qalınlıq × en, sm)</span>
          <div className="cx-chips">{SECTIONS.map((p) => { const on = sec === 'sm' && num(t) === p[0] && num(w) === p[1]; return <button key={p.join('x')} type="button" className={on ? 'on' : ''} onClick={() => setPreset(p)} data-testid={`cx-sec-${p[0]}x${p[1]}`}>{String(p[0]).replace('.', ',')}×{p[1]}</button>; })}</div>
        </div>
        <div className="cx-field"><span>En və qalınlığın vahidi</span><Seg value={sec} onChange={setSec} label="Vahid" testid="cx-secunit" options={[['mm', 'mm'], ['sm', 'sm'], ['m', 'm']]} /></div>
        <div className="cx-row2">
          <NumInput label="Qalınlıq" value={t} onChange={setT} unit={sec} testid="cx-thick" />
          <NumInput label="En" value={w} onChange={setW} unit={sec} testid="cx-width" />
        </div>
        <div className="cx-field"><span>Uzunluq</span>
          <div className="cx-chips">{LENGTHS.map((x) => <button key={x} type="button" className={lenUnit === 'm' && num(len) === x ? 'on' : ''} onClick={() => { setLenUnit('m'); setLen(String(x).replace('.', ',')); }} data-testid={`cx-len-${x}`}>{String(x).replace('.', ',')} m</button>)}</div>
        </div>
        <div className="cx-row2">
          <NumInput label="Uzunluq" value={len} onChange={setLen} unit={lenUnit} testid="cx-len" />
          <div className="cx-field"><span>Vahid</span><Seg value={lenUnit} onChange={setLenUnit} label="Uzunluğun vahidi" testid="cx-lenunit" options={[['mm', 'mm'], ['sm', 'sm'], ['m', 'm']]} /></div>
        </div>
        <NumInput label="Ədəd" value={count} onChange={setCount} unit="ədəd" testid="cx-count" />
        <div className="cx-result" aria-live="polite" data-testid="cx-result">
          {r ? <>
            <div><small>1 ədədin həcmi</small><b data-testid="cx-piece-m3">{az(r.pieceM3, 4)} m³</b></div>
            <div><small>Ümumi həcm</small><b data-testid="cx-total-m3">{az(r.totalM3, 3)} m³</b></div>
            <div><small>1 ədədin üz sahəsi</small><b data-testid="cx-piece-m2">{az(r.pieceM2, 3)} m²</b></div>
            <div><small>Ümumi üz sahəsi</small><b data-testid="cx-total-m2">{az(r.totalM2, 2)} m²</b></div>
            <div><small>1 kubda</small><b data-testid="cx-per-m3">{az(1 / r.pieceM3, 1)} ədəd</b><em>tam: {Math.floor(1 / r.pieceM3 + 1e-9)}</em></div>
          </> : <p>En, qalınlıq və uzunluğu yazın.</p>}
        </div>
        <details className="cx-more" open={!!need}><summary>Neçə ədəd lazımdır?</summary>
          <div className="cx-row2">
            <NumInput label="Lazım olan" value={need} onChange={setNeed} unit={needUnit === 'm3' ? 'm³' : 'm²'} testid="cx-need" placeholder="məs. 1" />
            <div className="cx-field"><span>Nə ilə?</span><Seg value={needUnit} onChange={setNeedUnit} label="Vahid" testid="cx-needunit" options={[['m3', 'm³'], ['m2', 'm²']]} /></div>
          </div>
          {pieces ? <p className="cx-answer" data-testid="cx-pieces">{secLabel}: <b>{pieces} ədəd</b> lazımdır (yuxarı yuvarlaqlaşdırılıb)</p> : null}
        </details>
        <details className="cx-more" open={!!price}><summary>Qiymət</summary>
          <div className="cx-row2">
            <NumInput label={basis === 'm3' ? '1 m³ qiyməti' : '1 ədəd qiyməti'} value={price} onChange={setPrice} unit="AZN" testid="cx-price" placeholder="məs. 450" />
            <div className="cx-field"><span>Qiymət nəyə görə?</span><Seg value={basis} onChange={setBasis} label="Qiymət" testid="cx-basis" options={[['m3', 'm³'], ['piece', 'ədəd']]} /></div>
          </div>
          {cost && price ? <p className="cx-answer" data-testid="cx-cost">1 ədəd: <b>{az(cost.perPiece)} AZN</b> · cəmi ({count} ədəd): <b data-testid="cx-cost-total">{az(cost.total)} AZN</b>{basis === 'piece' ? <> · 1 m³: {az(cost.perM3)} AZN</> : null}</p> : null}
        </details>
        <p className="cx-note"><Info size={15} />{NOTE}</p>
        {r && <ShareBar text={text} />}
      </section>
      <section className="cx-card cx-table-card" aria-labelledby="cx-how-h"><h2 id="cx-how-h"><Ruler size={17} />Necə hesablanır</h2>
        <ul className="cx-how">
          <li><b>Həcm</b> = en × qalınlıq × uzunluq (hamısı metrlə)</li>
          <li><b>Üz sahəsi</b> = en × uzunluq (geniş tərəf)</li>
          <li><b>Lazım olan ədəd</b> = lazım olan m³ (və ya m²) ÷ bir ədədin m³-i (m²-i), yuxarı yuvarlaqlaşdırılır</li>
          <li><b>Qiymət</b>: m³ qiyməti × bir ədədin həcmi = bir ədədin qiyməti</li>
        </ul>
        <p className="cx-small">Nümunə: 3×10 sm, 3 m → 0,03 × 0,10 × 3 = 0,009 m³; üz sahəsi 0,10 × 3 = 0,3 m².</p>
      </section>
    </div>
    <Faq items={TIMBER_FAQ} />
  </Frame>;
}

/* --------------------------------------------------------- landing blocks */

/** Two blocks for the home page: a live mini-result and a link to each calculator. */
export function CalcBlocks() {
  const f = rebarFacts(12);
  return <section className="cx-blocks wrap" aria-labelledby="cx-blocks-h" data-testid="cx-blocks">
    <h2 id="cx-blocks-h" className="font-display">Pulsuz tikinti kalkulyatorları</h2>
    <div className="cx-blocks-grid">
      <Link href="/armatur-konvertor" className="cx-block" data-testid="cx-block-rebar">
        <b>Armatur konvertoru</b><span>Ton ↔ metr ↔ çubuq sayı, Ø6–Ø32 cədvəli</span><em>Ø12: 1 ton ≈ {az(f.metresPerTon, 0)} m · {az(f.barsPerTon, 0)} çubuq</em><ArrowRight size={16} />
      </Link>
      <Link href="/taxta-kalkulyator" className="cx-block" data-testid="cx-block-timber">
        <b>Taxta kalkulyatoru</b><span>3×10, 5×10 və istənilən ölçü: m³, m², ədəd, qiymət</span><em>3×10 sm, 3 m: 0,009 m³ · 0,3 m²</em><ArrowRight size={16} />
      </Link>
      <Link href="/horgu-kalkulyator" className="cx-block" data-testid="cx-block-masonry">
        <b>Hörgü kalkulyatoru</b><span>Mişardaşı, qırmızı və silikat kərpic, qazbeton: say, məhlul, xərc</span><em>Bir neçə divar, qapı və pəncərələr çıxılır</em><ArrowRight size={16} />
      </Link>
      <Link href="/suvaq-kalkulyator" className="cx-block" data-testid="cx-block-plaster">
        <b>Suvaq kalkulyatoru</b><span>Sement-qum və gips: sahə, quru qarışıq, kisə, sement və qum</span><em>Bir və ya iki tərəf, daxili və xarici divarlar</em><ArrowRight size={16} />
      </Link>
    </div>
  </section>;
}
