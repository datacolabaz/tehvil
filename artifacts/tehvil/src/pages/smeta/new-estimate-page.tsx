import { useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, Info, LayoutTemplate, LoaderCircle, PencilRuler, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { Button, PageHeading } from '@/components/kit';
import { Scenarios } from '@/components/smeta/scenarios';
import { ConfidenceChip, SmetaToaster, toast } from '@/components/smeta/ui';
import { TAKEOFF_STEPS, analyzeDrawing } from '@/lib/smeta/ai';
import { estimateTotals, round2, sectionTotals } from '@/lib/smeta/calc';
import { CATEGORY_HINT, CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_PACKAGES, PROPERTY_LABEL, QUALITY_LABEL, RENOVATION_LABEL, TEMPLATES, forecastDays, generateSections, guessRoomKind, roomMeasurements, type GeneratorContext, type RoomInput, type RoomKind } from '@/lib/smeta/catalog';
import { addDaysISO, azn, num, parseNumber, todayISO, uid } from '@/lib/smeta/format';
import { DEFAULT_CONTRACTOR } from '@/lib/smeta/mock-data';
import { smeta } from '@/lib/smeta/store';
import type { Drawing, Measurement, Project, PropertyKind, QualityLevel, RenovationKind, WorkCategory } from '@/lib/smeta/types';

type Source = 'drawing' | 'manual' | 'template';
const STEPS = ['Layihə məlumatları', 'Məlumat mənbəyi', 'İş paketlərini seçin', 'İlkin smeta'];
const ROOM_KIND_LABEL: Record<RoomKind, string> = { living: 'Qonaq otağı', bed: 'Yataq otağı', kitchen: 'Mətbəx', bath: 'Hamam / WC', hall: 'Dəhliz', office: 'Ofis sahəsi', other: 'Digər' };

interface InfoForm { name: string; propertyKind: PropertyKind; address: string; area: string; renovationKind: RenovationKind; quality: QualityLevel; startDate: string; endDate: string; clientName: string; clientPhone: string }

function initial() {
  const q = new URLSearchParams(window.location.search);
  const tpl = TEMPLATES.find(t => t.id === q.get('template'));
  const source: Source | null = tpl ? 'template' : q.get('source') === 'drawing' ? 'drawing' : null;
  return { tpl, source };
}

export function NewEstimatePage() {
  const [, navigate] = useLocation();
  const init = useMemo(initial, []);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [info, setInfo] = useState<InfoForm>(() => ({
    name: '', propertyKind: init.tpl?.propertyKind ?? 'menzil', address: '', area: init.tpl ? num(init.tpl.rooms.reduce((s, r) => s + r.area, 0)) : '',
    renovationKind: init.tpl?.renovationKind ?? 'standart', quality: 'standart', startDate: addDaysISO(todayISO(), 14), endDate: addDaysISO(todayISO(), 74), clientName: '', clientPhone: '',
  }));
  const [source, setSource] = useState<Source | null>(init.source);
  const [templateId, setTemplateId] = useState<string | null>(init.tpl?.id ?? null);
  const [rooms, setRooms] = useState<RoomInput[]>(() => init.tpl ? init.tpl.rooms.map(r => ({ ...r, id: uid('r') })) : []);
  const [drawing, setDrawing] = useState<{ drawing: Drawing; measurements: Measurement[] } | null>(null);
  const [packages, setPackages] = useState<Set<WorkCategory>>(() => new Set(init.tpl?.packages ?? DEFAULT_PACKAGES.standart));
  const [packagesTouched, setPackagesTouched] = useState(!!init.tpl);
  const [margin, setMargin] = useState(15);
  const [tried, setTried] = useState(false);

  const set = <K extends keyof InfoForm>(k: K, v: InfoForm[K]) => {
    setInfo(i => ({ ...i, [k]: v }));
    if (k === 'renovationKind' && !packagesTouched) setPackages(new Set(DEFAULT_PACKAGES[v as RenovationKind]));
  };
  const area = parseNumber(info.area) ?? 0;
  const validRooms = rooms.filter(r => r.name.trim() && r.area > 0);
  const roomSum = round2(validRooms.reduce((s, r) => s + r.area, 0));

  const ctx: GeneratorContext = useMemo(() => {
    const fromDrawing = source === 'drawing' && !!drawing;
    return {
      rooms: validRooms, quality: info.quality, fromDrawing,
      measurementByRoom: Object.fromEntries(validRooms.map(r => [r.id, fromDrawing ? drawing!.measurements.find(m => m.roomId === r.id)?.id ?? `m-${r.id}` : `m-${r.id}`])),
      wallMeasurementId: fromDrawing ? 'm-walls' : undefined, perimeterMeasurementId: fromDrawing ? 'm-perimeter' : undefined,
    };
  }, [rooms, info.quality, source, drawing]);
  const preview = useMemo(() => new Map(generateSections(CATEGORY_ORDER, ctx).map(s => [s.category, s])), [ctx]);
  const sections = useMemo(() => generateSections(CATEGORY_ORDER.filter(c => packages.has(c)), ctx), [ctx, packages]);
  const projectCosts = useMemo(() => {
    const t = estimateTotals({ id: 'x', version: 1, createdAt: '', validUntil: '', sections }, [], margin / 100);
    return [
      { id: uid('pc'), label: 'Material daşınması və yükləmə', amount: Math.round(t.material * 0.025 / 10) * 10 },
      { id: uid('pc'), label: 'Layihə koordinasiyası', amount: Math.round((t.material + t.labor) * 0.02 / 10) * 10 },
    ].filter(c => c.amount > 0);
  }, [sections, margin]);
  const estimate = useMemo(() => ({ id: uid('est'), version: 1, createdAt: new Date().toISOString(), validUntil: addDaysISO(todayISO(), 30), sections }), [sections]);
  const totals = estimateTotals(estimate, projectCosts, margin / 100);

  const errors = {
    name: !info.name.trim() ? 'Layihənin adını daxil edin' : '',
    area: area <= 0 ? 'Ümumi sahəni m² ilə daxil edin' : '',
    endDate: info.startDate && info.endDate && info.endDate < info.startDate ? 'Bitiş tarixi başlanğıcdan əvvəl ola bilməz' : '',
    source: !source ? 'Məlumat mənbəyini seçin' : source === 'drawing' && !drawing ? 'Çertyoj yükləyin və ya başqa mənbə seçin' : source === 'template' && !templateId ? 'Şablon seçin' : !validRooms.length ? 'Ən azı bir otaq və sahəsini daxil edin' : '',
    packages: !packages.size ? 'Ən azı bir iş paketi seçin' : !sections.length ? 'Seçilmiş paketlər bu otaqlar üçün iş yaratmır' : '',
  };
  const stepValid = [!errors.name && !errors.area && !errors.endDate, !errors.source, !errors.packages, true];
  const go = (n: number) => { setStep(n); setReached(r => Math.max(r, n)); setTried(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const next = () => { if (!stepValid[step]) { setTried(true); return; } go(step + 1); };
  const err = (msg: string) => tried && msg ? <small role="alert" className="sm-field-error">{msg}</small> : null;

  const chooseTemplate = (id: string) => {
    const t = TEMPLATES.find(x => x.id === id)!;
    setTemplateId(id);
    setRooms(t.rooms.map(r => ({ ...r, id: uid('r') })));
    setPackages(new Set(t.packages)); setPackagesTouched(true);
    setInfo(i => ({ ...i, propertyKind: t.propertyKind, renovationKind: t.renovationKind, area: i.area || num(t.rooms.reduce((s, r) => s + r.area, 0)) }));
    toast(`“${t.title}” şablonu tətbiq edildi`);
  };
  const chooseSource = (s: Source) => {
    setSource(s);
    if (s === 'manual' && !rooms.length) setRooms([{ id: uid('r'), name: 'Qonaq otağı', area: 0, kind: 'living' }]);
    if (s === 'drawing' && drawing) setRooms(roomsFromDrawing(drawing.measurements));
  };
  const updateRoom = (id: string, patch: Partial<RoomInput>) => {
    setRooms(rs => rs.map(r => r.id === id ? { ...r, ...patch, kind: patch.name !== undefined && source !== 'drawing' ? guessRoomKind(patch.name) === 'other' ? r.kind : guessRoomKind(patch.name) : patch.kind ?? r.kind } : r));
    if (drawing && patch.area !== undefined) setDrawing(d => d && ({ ...d, measurements: d.measurements.map(m => m.roomId === id ? { ...m, value: patch.area!, status: 'edited' as const } : m) }));
  };

  const create = () => {
    const now = new Date().toISOString();
    const district = info.address.split(',').map(s => s.trim()).find(s => s && !/^bakı$/i.test(s))?.replace(/\s+r-nu$/i, '') ?? 'Bakı';
    const fromDrawing = source === 'drawing' && drawing;
    const p: Project = {
      id: uid('sm'), name: info.name.trim(), district, address: info.address.trim() || 'Ünvan qeyd edilməyib', propertyKind: info.propertyKind, renovationKind: info.renovationKind, quality: info.quality,
      areaM2: area, startDate: info.startDate, endDate: info.endDate, client: { name: info.clientName.trim() || 'Sifarişçi', phone: info.clientPhone.trim() },
      contractor: DEFAULT_CONTRACTOR, completion: 0, defaultMarginPercentage: margin / 100, projectCosts, estimate, status: 'draft',
      changeOrders: [], expenses: [], receipts: [], photos: [],
      drawing: fromDrawing ? drawing.drawing : undefined,
      measurements: fromDrawing ? drawing.measurements : roomMeasurements(validRooms, 'manual'),
      approvals: [], revisionRequests: [],
      payments: [
        { id: uid('pm'), title: 'Avans', share: 0.3, condition: 'Smeta təsdiqləndikdə və işə başlamazdan əvvəl', status: 'planned' },
        { id: uid('pm'), title: 'Kobud işlər', share: 0.4, condition: 'Gizli işlər foto ilə təhvil verildikdə', status: 'planned' },
        { id: uid('pm'), title: 'Yekun təhvil', share: 0.3, condition: 'Yekun təhvil aktı təsdiqləndikdə', status: 'planned' },
      ],
      included: CATEGORY_ORDER.filter(c => packages.has(c)).map(c => CATEGORY_LABEL[c]),
      excluded: ['Mebel və məişət texnikası', 'Dekor elementləri', 'Bina idarəsinin icazə rüsumları'].concat(packages.has('metbex') ? [] : ['Mətbəx mebeli']),
      exports: [], createdAt: now, updatedAt: now,
    };
    smeta.createProject(p);
    toast('Smeta yaradıldı — sətirləri yoxlayın');
    navigate(`/smeta/${p.id}?tab=${fromDrawing ? 'drawing' : 'estimate'}`);
  };

  const days = area > 0 ? forecastDays(area, info.renovationKind, info.quality) : 0;
  const tempProject = { estimate, projectCosts, defaultMarginPercentage: margin / 100, quality: info.quality, areaM2: area || roomSum, renovationKind: info.renovationKind } as Project;

  return <>
    <PageHeading eyebrow="AI Smeta" title="Yeni smeta yarat" description="AI ilkin ölçü və smeta təklif edir — siz yoxlayır, düzəldir və təsdiqləyirsiniz. Sifarişçi yalnız təsdiqlənmiş versiyanı görür." />
    <nav className="sm-stepper" aria-label="Addımlar">
      {STEPS.map((s, i) => <button key={s} type="button" className={`sm-step ${step === i ? 'active' : ''} ${i < step || (i <= reached && i !== step) ? 'done' : ''}`} aria-current={step === i ? 'step' : undefined} disabled={i > reached} onClick={() => go(i)}>
        <span>{i < reached && i !== step ? <Check size={13} /> : `0${i + 1}`}</span>{s}
      </button>)}
    </nav>

    <div className="sm-wizard">
      <section className="surface sm-wizard-card" aria-labelledby="step-title">
        <div className="form-section-title"><span>0{step + 1}</span><h2 id="step-title">{STEPS[step]}</h2></div>

        {step === 0 && <>
          <p className="sm-wizard-lead">Bu məlumatlar smetanın başlığında və sifarişçiyə göndərilən sənəddə görünəcək.</p>
          <div className="field-grid">
            <label className="field full"><span>Layihənin adı<i> *</i></span><input value={info.name} onChange={e => set('name', e.target.value)} placeholder="Məs.: Nərimanov, 2 otaqlı mənzil" aria-invalid={tried && !!errors.name} data-testid="input-smeta-name" />{err(errors.name)}</label>
            <label className="field"><span>Obyekt növü</span><select value={info.propertyKind} onChange={e => set('propertyKind', e.target.value as PropertyKind)}>{(Object.keys(PROPERTY_LABEL) as PropertyKind[]).map(k => <option key={k} value={k}>{PROPERTY_LABEL[k]}</option>)}</select></label>
            <label className="field"><span>Ümumi sahə, m²<i> *</i></span><input inputMode="decimal" value={info.area} onChange={e => set('area', e.target.value)} placeholder="Məs.: 65" aria-invalid={tried && !!errors.area} />{err(errors.area)}</label>
            <label className="field full"><span>Ünvan</span><input value={info.address} onChange={e => set('address', e.target.value)} placeholder="Məs.: Bakı, Nərimanov r-nu, Təbriz küç. 44" /></label>
            <label className="field"><span>Təmir növü</span><select value={info.renovationKind} onChange={e => set('renovationKind', e.target.value as RenovationKind)}>{(Object.keys(RENOVATION_LABEL) as RenovationKind[]).map(k => <option key={k} value={k}>{RENOVATION_LABEL[k]}</option>)}</select></label>
            <label className="field"><span>Keyfiyyət səviyyəsi</span><select value={info.quality} onChange={e => set('quality', e.target.value as QualityLevel)}>{(Object.keys(QUALITY_LABEL) as QualityLevel[]).map(k => <option key={k} value={k}>{QUALITY_LABEL[k]}</option>)}</select></label>
            <label className="field"><span>Planlaşdırılan başlanğıc tarixi</span><input type="date" value={info.startDate} onChange={e => set('startDate', e.target.value)} /></label>
            <label className="field"><span>Planlaşdırılan bitiş tarixi</span><input type="date" value={info.endDate} min={info.startDate} onChange={e => set('endDate', e.target.value)} aria-invalid={tried && !!errors.endDate} />{err(errors.endDate)}</label>
            <label className="field"><span>Sifarişçi adı</span><input value={info.clientName} onChange={e => set('clientName', e.target.value)} autoComplete="off" /></label>
            <label className="field"><span>Sifarişçinin telefon nömrəsi</span><input type="tel" value={info.clientPhone} onChange={e => set('clientPhone', e.target.value)} placeholder="+994 50 123 45 67" /></label>
          </div>
        </>}

        {step === 1 && <>
          <p className="sm-wizard-lead">Otaqlar və sahələr iş həcmini müəyyən edir. Hər mənbədən sonra ölçüləri yoxlaya və düzəldə bilərsiniz.</p>
          <div className="sm-choices" role="radiogroup" aria-label="Məlumat mənbəyi">
            <Choice selected={source === 'drawing'} onClick={() => chooseSource('drawing')} icon={<Upload size={19} />} title="Çertyoj yüklə" text="PDF, JPG, PNG — AI otaqları və ölçüləri təklif edir" />
            <Choice selected={source === 'manual'} onClick={() => chooseSource('manual')} icon={<PencilRuler size={19} />} title="Ölçüləri əl ilə daxil et" text="Otaqları və sahələri özünüz yazın" />
            <Choice selected={source === 'template'} onClick={() => chooseSource('template')} icon={<LayoutTemplate size={19} />} title="Hazır təmir şablonundan başla" text="Tipik iş həcmi və orta ölçülər" />
          </div>
          {source === 'drawing' && <DrawingStep drawing={drawing} onResult={r => { setDrawing(r); setRooms(roomsFromDrawing(r.measurements)); if (!info.area) set('area', num(r.measurements.filter(m => m.roomId).reduce((s, m) => s + m.value, 0))); }} onClear={() => { setDrawing(null); setRooms([]); }} />}
          {source === 'template' && <div style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10, fontSize: 11 }}>Ağıllı şablonlar</div>
            <div className="sm-templates">{TEMPLATES.map(t => <button key={t.id} type="button" className={`sm-template ${templateId === t.id ? 'selected' : ''}`} aria-pressed={templateId === t.id} onClick={() => chooseTemplate(t.id)}>
              <strong>{t.title}</strong><small>{t.description}</small><em>{t.rooms.length} zona · {num(t.rooms.reduce((s, r) => s + r.area, 0))} m² · {t.packages.length} paket</em>
            </button>)}</div>
          </div>}
          {source && (source !== 'drawing' || drawing) && (source !== 'template' || templateId) && <RoomsEditor rooms={rooms} source={source} drawing={drawing} onChange={updateRoom} onAdd={() => setRooms(rs => [...rs, { id: uid('r'), name: '', area: 0, kind: 'other' }])} onRemove={id => setRooms(rs => rs.filter(r => r.id !== id))} roomSum={roomSum} area={area} />}
          {err(errors.source)}
        </>}

        {step === 2 && <>
          <p className="sm-wizard-lead">Miqdarlar otaq sahələrindən hesablanır, qiymətlər {QUALITY_LABEL[info.quality].toLowerCase()} səviyyəsi üçün orta bazar qiymətləridir.</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <button type="button" className="sm-link-btn" onClick={() => { setPackages(new Set(DEFAULT_PACKAGES[info.renovationKind])); setPackagesTouched(true); }}><Sparkles size={13} />{RENOVATION_LABEL[info.renovationKind]} təmir üçün tövsiyə olunan</button>
            <button type="button" className="sm-link-btn" onClick={() => { setPackages(new Set(CATEGORY_ORDER)); setPackagesTouched(true); }}>Hamısını seç</button>
            <button type="button" className="sm-link-btn" onClick={() => { setPackages(new Set()); setPackagesTouched(true); }}>Seçimi təmizlə</button>
          </div>
          <div className="sm-packages">{CATEGORY_ORDER.map(c => {
            const s = preview.get(c);
            const sel = packages.has(c);
            const first = s?.items[0];
            return <button key={c} type="button" className={`sm-package ${sel ? 'selected' : ''}`} aria-pressed={sel} onClick={() => { setPackages(ps => { const n = new Set(ps); if (n.has(c)) n.delete(c); else n.add(c); return n; }); setPackagesTouched(true); }}>
              <span className="sm-package-box"><Check size={13} /></span>
              <span><strong>{CATEGORY_LABEL[c]}</strong><small>{CATEGORY_HINT[c]}</small>{first && <small>≈ {num(first.quantity)} {first.unit} · {s!.items.length} iş</small>}</span>
              <span className="sm-package-price">{s ? <><b>≈ {azn(sectionTotals(s, margin / 100).rowsTotal)}</b><small>ilkin qiymət</small></> : <small>Uyğun otaq yoxdur</small>}</span>
            </button>;
          })}</div>
          {err(errors.packages)}
        </>}

        {step === 3 && <>
          <p className="sm-wizard-lead">Rəqəmlər ilkin təklifdir. Smeta yaradıldıqdan sonra hər sətri yoxlayıb düzəldə bilərsiniz; sifarişçi yalnız təsdiqlədiyiniz versiyanı görəcək.</p>
          <div className="sm-summary-list">
            <div><span>Materiallar</span><b>{azn(totals.material)}</b></div>
            <div><span>İşçilik</span><b>{azn(totals.labor)}</b></div>
            <div><span>Əlavə xərclər <small className="sm-muted">({projectCosts.map(c => c.label.toLowerCase()).join(', ')})</small></span><b>{azn(totals.additional + totals.projectCosts)}</b></div>
            <div><span>Ehtiyat / tullantı <small className="sm-muted">(kateqoriya üzrə 5–15%)</small></span><b>{azn(totals.waste)}</b></div>
            <div><span className="sm-inline-pct">Podratçı marjası
              <input className="sm-cell-input r num" style={{ width: 58, border: '1px solid #dcded3', background: '#fff' }} inputMode="decimal" aria-label="Podratçı marjası, faizlə" value={margin} onChange={e => { const v = parseNumber(e.target.value); if (v !== null && v >= 0 && v <= 60) setMargin(v); }} />%</span><b>{azn(totals.margin)}</b></div>
            <div className="total"><span>Ümumi məbləğ</span><b>{azn(totals.total)}</b></div>
          </div>
          <div className="sm-ai-notice" role="note" style={{ marginTop: 14 }}><AlertTriangle size={15} aria-hidden /><span>{source === 'drawing' ? 'Miqdarlar AI tərəfindən aşkar edilən ölçülərə əsaslanır. Smetaya keçdikdən sonra “Çertyoj və ölçülər” bölməsində ölçüləri yoxlayın.' : 'Miqdarlar daxil etdiyiniz otaq sahələrinə əsaslanır. Divar və plintus kimi törəmə ölçülər təxminidir.'}</span></div>
          <div className="eyebrow" style={{ margin: '20px 0 10px', fontSize: 11 }}>Alternativ keyfiyyət variantları</div>
          <Scenarios project={tempProject} />
        </>}

        <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid #e8e5dc' }}>
          {step > 0 ? <Button variant="secondary" onClick={() => go(step - 1)}><ArrowLeft size={16} />Geri</Button> : <Button variant="quiet" onClick={() => navigate('/smeta')}>Ləğv et</Button>}
          {step < 3 ? <Button onClick={next} testId="button-wizard-next">Davam et<ArrowRight size={16} /></Button> : <Button onClick={create} testId="button-create-estimate"><CheckCircle2 size={16} />Smeta yarat</Button>}
        </div>
      </section>

      <aside className="sm-wizard-aside">
        <div className="sm-live-total" aria-live="polite">
          <span className="eyebrow">İlkin smeta</span>
          <strong className="num">{validRooms.length && packages.size ? azn(totals.total) : '—'}</strong>
          <p>{validRooms.length ? 'Seçimlərə əsasən təxmini məbləğ. Son qiymət yoxlamadan sonra dəqiqləşir.' : 'Otaqları daxil etdikdən sonra təxmini məbləğ burada görünəcək.'}</p>
          <dl>
            <dt>Ümumi sahə</dt><dd>{area ? `${num(area)} m²` : '—'}</dd>
            <dt>Otaqlar</dt><dd>{validRooms.length ? `${validRooms.length} · ${num(roomSum)} m²` : '—'}</dd>
            <dt>İş paketləri</dt><dd>{packages.size}</dd>
            <dt>Təxmini müddət</dt><dd>{days ? `${days} gün` : '—'}</dd>
          </dl>
        </div>
        <div className="aside-panel">
          <div className="eyebrow">Necə işləyir</div>
          <ul className="sm-list" style={{ marginTop: 8 }}>
            <li><Sparkles size={14} aria-hidden />AI ölçü və smeta təklif edir</li>
            <li><PencilRuler size={14} aria-hidden />Siz yoxlayır və düzəldirsiniz</li>
            <li><CheckCircle2 size={14} aria-hidden />Sifarişçi yalnız təsdiqlənmiş versiyanı görür</li>
          </ul>
        </div>
      </aside>
    </div>
    <SmetaToaster />
  </>;
}

function roomsFromDrawing(ms: Measurement[]): RoomInput[] {
  return ms.filter(m => m.kind === 'area' && m.roomId).map(m => ({ id: m.roomId!, name: m.name, area: m.value, kind: guessRoomKind(m.name) }));
}

function Choice({ selected, onClick, icon, title, text }: { selected: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) {
  return <button type="button" role="radio" aria-checked={selected} className={`sm-choice ${selected ? 'selected' : ''}`} onClick={onClick}>
    <span className="sm-choice-icon">{icon}</span><strong>{title}</strong><small>{text}</small><span className="sm-choice-check"><Check size={12} /></span>
  </button>;
}

function DrawingStep({ drawing, onResult, onClear }: { drawing: { drawing: Drawing; measurements: Measurement[] } | null; onResult: (r: { drawing: Drawing; measurements: Measurement[] }) => void; onClear: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const run = async (f: File) => {
    if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) { toast('Yalnız PDF, JPG və ya PNG faylı yükləyin'); return; }
    if (f.size > 25 * 1024 * 1024) { toast('Fayl 25 MB-dan böyük olmamalıdır'); return; }
    setFile(f); setStep(0);
    try { onResult(await analyzeDrawing(f, setStep)); }
    catch { toast('Çertyoju analiz etmək mümkün olmadı. Ölçüləri əl ilə daxil edin.'); }
    finally { setStep(null); }
  };
  if (step !== null) return <div className="sm-file-row" aria-live="polite" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><LoaderCircle size={18} className="spin" color="#5f7d6c" /><div style={{ flex: 1, minWidth: 0 }}><strong>{file?.name}</strong><small>AI çertyoju analiz edir…</small></div></div>
    <div className="sm-steps-list">{TAKEOFF_STEPS.map((s, i) => <div key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>{i < step ? <CheckCircle2 size={15} /> : i === step ? <LoaderCircle size={15} className="spin" /> : <span style={{ width: 15 }} />}{s}</div>)}</div>
  </div>;
  if (drawing) {
    const rooms = drawing.measurements.filter(m => m.roomId);
    return <>
      <div className="sm-file-row"><FileText size={20} aria-hidden /><div><strong>{drawing.drawing.fileName}</strong><small>AI {rooms.length} otaq, {drawing.drawing.openings.filter(o => o.kind === 'door').length} qapı və {drawing.drawing.openings.filter(o => o.kind === 'window').length} pəncərə aşkar etdi · miqyas {drawing.drawing.scale}</small></div><button type="button" className="sm-link-btn" onClick={() => { setFile(null); onClear(); }}>Başqa fayl</button></div>
      <div className="sm-ai-notice" role="note" style={{ marginTop: 12, marginBottom: 0 }}><AlertTriangle size={15} aria-hidden /><span>AI ölçüləri ilkin təklif kimi yaradıb. “Yoxlanmalıdır” işarəli ölçüləri çertyojla müqayisə edin.</span></div>
    </>;
  }
  return <label className={`sm-drop ${drag ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void run(f); }}>
    <input type="file" accept=".pdf,.png,.jpg,.jpeg" aria-label="Çertyoj faylı seçin" onChange={e => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = ''; }} data-testid="input-drawing" />
    <span className="sm-drop-icon"><Upload size={22} /></span>
    <strong>PDF, JPG və ya PNG yükləyin</strong>
    <span>AI çertyojdakı otaqları və əsas ölçüləri təklif edəcək</span>
    <small><AlertTriangle size={12} />Son nəticəni təsdiqləməzdən əvvəl mütləq yoxlayın</small>
  </label>;
}

function RoomsEditor({ rooms, source, drawing, onChange, onAdd, onRemove, roomSum, area }: { rooms: RoomInput[]; source: Source; drawing: { measurements: Measurement[] } | null; onChange: (id: string, patch: Partial<RoomInput>) => void; onAdd: () => void; onRemove: (id: string) => void; roomSum: number; area: number }) {
  const diff = area > 0 ? Math.abs(roomSum - area) / area : 0;
  return <div style={{ marginTop: 18 }}>
    <div className="section-head"><div className="eyebrow" style={{ fontSize: 11 }}>{source === 'drawing' ? 'Aşkar edilən otaqlar' : 'Otaqlar və sahələr'}</div><span className="sm-muted" style={{ fontSize: 12 }}>Cəmi {num(roomSum)} m²{area ? ` · ümumi sahə ${num(area)} m²` : ''}</span></div>
    <div className="sm-rooms-edit">{rooms.map(r => {
      const m = drawing?.measurements.find(x => x.roomId === r.id);
      return <div className="sm-room-row" key={r.id}>
        <input aria-label="Otağın adı" value={r.name} onChange={e => onChange(r.id, { name: e.target.value })} placeholder="Otağın adı" />
        <input aria-label={`${r.name || 'Otaq'}: sahə, m²`} inputMode="decimal" defaultValue={r.area ? num(r.area) : ''} placeholder="m²" onChange={e => { const v = parseNumber(e.target.value); if (v !== null && v >= 0) onChange(r.id, { area: v }); }} />
        {m ? <span className="room-kind">{m.status === 'edited' ? <span className="sm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Düzəldilib</span> : <ConfidenceChip confidence={m.confidence} />}</span>
          : <select className="room-kind" aria-label="Otağın növü" value={r.kind} onChange={e => onChange(r.id, { kind: e.target.value as RoomKind })} style={{ minHeight: 39, padding: '0 8px', border: '1px solid #dcded3', borderRadius: 10, background: '#fffef9', color: '#2b483e' }}>{(Object.keys(ROOM_KIND_LABEL) as RoomKind[]).map(k => <option key={k} value={k}>{ROOM_KIND_LABEL[k]}</option>)}</select>}
        <button type="button" className="icon-button" aria-label={`${r.name || 'Otağı'} sil`} onClick={() => onRemove(r.id)}><Trash2 size={15} /></button>
      </div>;
    })}</div>
    <button type="button" className="sm-link-btn" style={{ marginTop: 10 }} onClick={onAdd}><Plus size={13} />Otaq əlavə et</button>
    {diff > 0.15 && roomSum > 0 && <p className="sm-muted" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, margin: '10px 0 0' }}><Info size={13} aria-hidden style={{ flex: '0 0 auto', marginTop: 1 }} />Otaqların cəmi ümumi sahədən {Math.round(diff * 100)}% fərqlənir. Divar qalınlığı və eyvan nəzərə alınmayıbsa, bu normaldır — yenə də yoxlayın.</p>}
  </div>;
}
