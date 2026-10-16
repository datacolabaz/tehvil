import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AtSign, BadgeCheck, Calendar, Check, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, HardHat, KeyRound, LoaderCircle, MapPin, MessageCircle,
  Phone, Share2, ShieldCheck, X,
} from 'lucide-react';
import {
  recordPublicPassportEvent, useCreatePublicPassportLead, useGetPublicPassport,
  type PublicPassport, type PublicPassportWork, type RealtorMedia,
} from '@workspace/api-client-react';
import { CertifiedSeal, QrCode, TrustLadder } from '@/components/realtor/ui';
import { COPY, DEAL, KIND, PORTAL, dateText, facts, num, price, qrUrl, waUrl, type Trust } from '@/lib/realtor/labels';

export function PublicFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  useEffect(() => { document.body.classList.add('rl-public-body'); return () => document.body.classList.remove('rl-public-body'); }, []);
  return <div className="rl-public">
    <header className="rl-public-top"><a href="/" className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></a><span className="rl-public-tag"><ShieldCheck size={14} />{COPY.verifiedHistory}</span></header>
    <main className={`rl-public-main ${wide ? 'wide' : ''}`}>{children}</main>
    <footer className="rl-public-foot">
      <p><b>Təhvil.az</b> — {COPY.triad}.</p>
      <p>Təsdiqlər Təhvil hesab qeydləridir: podratçı və ev sahibi öz unikal linkləri ilə təsdiqləyib. Bu, hüquqi ekspertiza və ya elektron imza deyil.</p>
    </footer>
  </div>;
}

export function PublicState({ loading, title, text }: { loading?: boolean; title?: string; text?: string }) {
  return <PublicFrame><div className="rl-public-state">{loading ? <LoaderCircle className="spin" size={26} /> : <><ShieldCheck size={30} /><h1 className="font-display">{title}</h1><p>{text}</p></>}</div></PublicFrame>;
}

export function PublicPassportPage({ publicId }: { publicId: string }) {
  const q = useGetPublicPassport(publicId, { query: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity, queryKey: ['public-passport', publicId] } });
  const scanned = useRef(false);
  useEffect(() => {
    if (scanned.current || !q.data) return;
    scanned.current = true;
    if (new URLSearchParams(window.location.search).get('src') === 'qr') void recordPublicPassportEvent(publicId, { kind: 'qr_scan' }).catch(() => undefined);
  }, [q.data, publicId]);
  useEffect(() => { if (q.data) document.title = `${q.data.title} — Təhvil Sertifikatlı Mənzil`; }, [q.data]);
  if (q.isLoading) return <PublicState loading />;
  if (!q.data) return <PublicState title="Pasport tapılmadı" text="Bu link aktiv deyil və ya pasport dərcdən çıxarılıb. Realtordan yeni link istəyin." />;
  return <PublicFrame><PassportView p={q.data} publicId={publicId} /></PublicFrame>;
}

function PassportView({ p, publicId }: { p: PublicPassport; publicId: string }) {
  const level = p.trustLevel as Trust;
  const [lightbox, setLightbox] = useState<{ list: RealtorMedia[]; i: number } | null>(null);
  const contactRef = useRef<HTMLDivElement>(null);
  const wa = p.realtor.whatsapp || p.realtor.phone;
  const waText = `Salam! "${p.title}" (Təhvil Sertifikatlı Mənzil) ilə maraqlanıram: ${p.publicUrl}`;
  const track = (kind: 'whatsapp_click' | 'share') => { void recordPublicPassportEvent(publicId, { kind }).catch(() => undefined); };
  const share = async () => {
    track('share');
    const data = { title: p.title, text: `${p.title} — Təhvil Sertifikatlı Mənzil`, url: p.publicUrl };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(p.publicUrl); alertCopied(); } } catch { /* cancelled */ }
  };
  const [copied, setCopied] = useState(false);
  const alertCopied = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  const confirmed = p.works.filter(w => w.contractorConfirmedAt).length;
  const accepted = p.works.filter(w => w.handoverStatus === 'accepted').length;

  return <>
    <section className="rl-pp-hero">
      <Gallery photos={p.photos} onOpen={i => setLightbox({ list: p.photos, i })} />
      <div className="rl-pp-head">
        <CertifiedSeal level={level} big />
        <div className="eyebrow">{DEAL[p.dealType]} · {KIND[p.propertyKind]}</div>
        <h1 className="font-display">{p.title}</h1>
        <div className="rl-pp-facts"><span><MapPin size={14} />{[p.district, p.address].filter(Boolean).join(', ')}</span>{p.rooms != null && <span>{p.rooms} otaq</span>}{p.areaM2 != null && <span>{num(p.areaM2)} m²</span>}</div>
        <div className="rl-pp-price">{price(p.price, p.currency)}</div>
        <div className="rl-pp-cta">
          {wa && <a className="button button-primary rl-wa" href={waUrl(wa, waText)} target="_blank" rel="noreferrer" onClick={() => track('whatsapp_click')} data-testid="button-contact-realtor"><MessageCircle size={16} />Realtorla əlaqə saxla</a>}
          <button type="button" className="button button-secondary" onClick={() => contactRef.current?.scrollIntoView({ behavior: 'smooth' })}><Phone size={15} />Zəng sifariş et</button>
          <button type="button" className="button button-quiet" onClick={() => { void share(); }}><Share2 size={15} />{copied ? 'Link kopyalandı' : 'Bu pasportu paylaş'}</button>
        </div>
      </div>
    </section>

    <section className={`rl-pp-trust lvl-${level}`}>
      <div>
        <div className="eyebrow">Etibar səviyyəsi {num(level === 'handover' ? 3 : level === 'contractor' ? 2 : 1)}/3</div>
        <h2 className="font-display">{level === 'handover' ? 'Ev sahibi hər mərhələni foto ilə qəbul edib' : level === 'contractor' ? 'Podratçı bütün işləri təsdiqləyib' : 'Təmir tarixçəsi realtor tərəfindən təqdim olunub'}</h2>
        <div className="rl-pp-counts"><span><b>{p.works.length}</b> təmir işi</span><span><b>{confirmed}</b> podratçı təsdiqli</span><span><b>{accepted}</b> ev sahibi qəbul edib</span></div>
      </div>
      <TrustLadder level={level} />
    </section>

    <section className="rl-pp-works">
      <div className="section-head"><div><div className="eyebrow">{COPY.photoHandover}</div><h2 className="font-display">Təmir işləri</h2></div></div>
      {p.works.map((w, i) => <WorkBlock key={w.id} w={w} index={i} open={(list, j) => setLightbox({ list, i: j })} />)}
      {!p.works.length && <p className="rl-hint">Təmir işləri hələ əlavə olunmayıb.</p>}
    </section>

    <section className="rl-pp-bottom" ref={contactRef}>
      <div className="rl-pp-realtor">
        <div className="rl-realtor-card">
          {p.realtor.photoUrl ? <img src={p.realtor.photoUrl} alt="" className="rl-avatar" /> : <span className="rl-avatar ph">{p.realtor.name.charAt(0)}</span>}
          <div><strong>{p.realtor.name}</strong><small>{p.realtor.agency || 'Realtor'}</small></div>
          {p.realtor.logoUrl && <img src={p.realtor.logoUrl} alt="" className="rl-logo" />}
        </div>
        <div className="rl-contact-lines">
          {p.realtor.phone && <a href={`tel:${p.realtor.phone.replace(/\s/g, '')}`}><Phone size={14} />{p.realtor.phone}</a>}
          {wa && <a href={waUrl(wa, waText)} target="_blank" rel="noreferrer" onClick={() => track('whatsapp_click')}><MessageCircle size={14} />WhatsApp</a>}
          {p.realtor.instagram && <a href={`https://instagram.com/${p.realtor.instagram}`} target="_blank" rel="noreferrer"><AtSign size={14} />{p.realtor.instagram}</a>}
        </div>
        {p.listingUrls.length > 0 && <div className="rl-links">{p.listingUrls.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer nofollow"><ExternalLink size={11} />{PORTAL[l.portal]}-da elan</a>)}</div>}
        <LeadForm publicId={publicId} />
      </div>
      <div className="rl-pp-qr">
        <QrCode value={qrUrl(publicId)} size={176} label={COPY.qr} />
        <small>Yenilənib: {dateText(p.updatedAt)}</small>
      </div>
    </section>
    {lightbox && <Lightbox list={lightbox.list} index={lightbox.i} onClose={() => setLightbox(null)} />}
  </>;
}

function Gallery({ photos, onOpen }: { photos: RealtorMedia[]; onOpen: (i: number) => void }) {
  if (!photos.length) return <div className="rl-pp-gallery empty"><ShieldCheck size={40} /></div>;
  return <div className="rl-pp-gallery">
    <button type="button" className="rl-pp-main" onClick={() => onOpen(0)}><img src={photos[0].url} alt="" /></button>
    {photos.length > 1 && <div className="rl-pp-thumbs">{photos.slice(1, 5).map((m, i) => <button type="button" key={m.id} onClick={() => onOpen(i + 1)}><img src={m.url} alt="" loading="lazy" />{i === 3 && photos.length > 5 && <span>+{photos.length - 5}</span>}</button>)}</div>}
  </div>;
}

export function BeforeAfter({ before, after }: { before: RealtorMedia; after: RealtorMedia }) {
  const [pos, setPos] = useState(50);
  return <div className="rl-ba" style={{ ['--pos' as string]: `${pos}%` }}>
    <img src={after.url} alt="Sonra" />
    <div className="rl-ba-before"><img src={before.url} alt="Əvvəl" /></div>
    <span className="rl-ba-label l">Əvvəl</span><span className="rl-ba-label r">Sonra</span>
    <span className="rl-ba-handle" aria-hidden><ChevronLeft size={14} /><ChevronRight size={14} /></span>
    <input type="range" min={0} max={100} value={pos} onChange={e => setPos(Number(e.target.value))} aria-label="Əvvəl və sonra müqayisəsi" />
  </div>;
}

export function WorkBlock({ w, index, open, children }: { w: PublicPassportWork; index: number; open?: (list: RealtorMedia[], i: number) => void; children?: ReactNode }) {
  const all = [...w.beforePhotos, ...w.afterPhotos];
  return <article className={`rl-pp-work ${w.handoverStatus}`}>
    <div className="rl-pp-work-num">{String(index + 1).padStart(2, '0')}</div>
    <div className="rl-pp-work-body">
      <h3>{w.title}</h3>
      <div className="rl-pp-work-meta">
        <span><Calendar size={13} />{w.startDate ? dateText(w.startDate) : '—'} – {w.endDate ? dateText(w.endDate) : '—'}</span>
        {w.contractorName && <span><HardHat size={13} />{w.contractorName}</span>}
      </div>
      <div className="rl-pp-badges">
        {w.contractorConfirmedAt ? <span className="ok"><BadgeCheck size={13} />Podratçı təsdiqləyib · {dateText(w.contractorConfirmedAt)}</span> : <span className="muted"><HardHat size={13} />Podratçı təsdiqi yoxdur</span>}
        {w.handoverStatus === 'accepted' ? <span className="gold"><KeyRound size={13} />Ev sahibi foto ilə qəbul edib · {dateText(w.ownerDecidedAt)}</span>
          : w.handoverStatus === 'revision' ? <span className="warn"><KeyRound size={13} />Ev sahibi düzəliş istəyib</span> : <span className="muted"><KeyRound size={13} />Ev sahibi qəbulu gözlənilir</span>}
      </div>
      {w.description && <p>{w.description}</p>}
      {w.materials && <p className="rl-materials"><b>Materiallar:</b> {w.materials}</p>}
      {w.beforePhotos[0] && w.afterPhotos[0] && <BeforeAfter before={w.beforePhotos[0]} after={w.afterPhotos[0]} />}
      {all.length > 0 && <div className="rl-pp-work-photos">
        {w.beforePhotos.map((m, i) => <button type="button" key={m.id} onClick={() => open?.(all, i)}><img src={m.url} alt="" loading="lazy" /><span>Əvvəl</span></button>)}
        {w.afterPhotos.map((m, i) => <button type="button" key={m.id} onClick={() => open?.(all, w.beforePhotos.length + i)}><img src={m.url} alt="" loading="lazy" /><span className="after">Sonra</span></button>)}
      </div>}
      {children}
    </div>
  </article>;
}

function Lightbox({ list, index, onClose }: { list: RealtorMedia[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI(x => (x + 1) % list.length); if (e.key === 'ArrowLeft') setI(x => (x - 1 + list.length) % list.length); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [list.length, onClose]);
  return <div className="rl-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
    <img src={list[i].url} alt="" onClick={e => e.stopPropagation()} />
    <button type="button" className="rl-lb-close" aria-label="Bağla" onClick={onClose}><X size={20} /></button>
    {list.length > 1 && <><button type="button" className="rl-lb-prev" aria-label="Əvvəlki" onClick={e => { e.stopPropagation(); setI((i - 1 + list.length) % list.length); }}><ChevronLeft size={24} /></button>
      <button type="button" className="rl-lb-next" aria-label="Növbəti" onClick={e => { e.stopPropagation(); setI((i + 1) % list.length); }}><ChevronRight size={24} /></button><span className="rl-lb-count">{i + 1} / {list.length}</span></>}
  </div>;
}

function LeadForm({ publicId }: { publicId: string }) {
  const send = useCreatePublicPassportLead();
  const [f, setF] = useState({ name: '', phone: '', message: '', consent: false });
  const [sent, setSent] = useState(false);
  const submit = (e: FormEvent) => { e.preventDefault(); if (!f.consent) return; send.mutate({ publicId, data: { name: f.name.trim(), phone: f.phone.trim(), message: f.message.trim(), consent: true } }, { onSuccess: () => setSent(true) }); };
  if (sent) return <div className="rl-lead-sent"><CheckCircle2 size={20} /><div><strong>Sorğunuz göndərildi</strong><small>Realtor qısa zamanda sizinlə əlaqə saxlayacaq.</small></div></div>;
  return <form className="rl-lead-form" onSubmit={submit}>
    <div className="eyebrow">Realtorla əlaqə saxla</div>
    <div className="field-grid">
      <label className="field"><span>Adınız</span><input required minLength={2} maxLength={120} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} data-testid="input-lead-name" /></label>
      <label className="field"><span>Telefon</span><input required type="tel" minLength={7} maxLength={32} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+994" data-testid="input-lead-phone" /></label>
    </div>
    <label className="field"><span>Sual (istəyə görə)</span><textarea rows={2} maxLength={1000} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} placeholder="məs. Baxışa nə vaxt gəlmək olar?" /></label>
    <label className="rl-check"><input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} required /><span>Adımın və nömrəmin realtora ötürülməsinə razıyam.</span></label>
    <button type="submit" className="button button-primary" disabled={send.isPending || !f.consent}>{send.isPending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Göndər</button>
    {send.isError && <small className="sm-field-error">Göndərilmədi. Bir az sonra yenidən cəhd edin.</small>}
  </form>;
}

/* ------------------------------------------------------------- printable PDF */

export function PrintPassportPage({ publicId }: { publicId: string }) {
  const q = useGetPublicPassport(publicId, { query: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity, queryKey: ['public-passport', publicId] } });
  const printed = useRef(false);
  useEffect(() => {
    if (!q.data || printed.current) return;
    printed.current = true;
    document.title = `Təhvil pasportu — ${q.data.title}`;
    const imgs = Array.from(document.images);
    void Promise.all(imgs.map(img => (img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = () => r(null); })))).then(() => window.setTimeout(() => window.print(), 400));
  }, [q.data]);
  if (q.isLoading) return <PublicState loading />;
  if (!q.data) return <PublicState title="Pasport tapılmadı" text="PDF yalnız dərc olunmuş pasport üçün yaradılır." />;
  const p = q.data;
  const level = p.trustLevel as Trust;
  return <div className="rl-print">
    <div className="rl-print-bar no-print"><button type="button" className="button button-primary" onClick={() => window.print()}>PDF kimi yadda saxla / çap et</button><small>Çap pəncərəsində “PDF kimi saxla” seçin.</small></div>
    <header className="rl-print-head">
      <div className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></div>
      <div><strong>Mənzil Təhvil Pasportu</strong><small>tehvil.az/p/{p.publicId}</small></div>
    </header>
    <section className="rl-print-hero">
      <div>
        <CertifiedSeal level={level} />
        <h1>{p.title}</h1>
        <p>{DEAL[p.dealType]} · {KIND[p.propertyKind]} · {facts(p)}{p.address ? ` · ${p.address}` : ''}</p>
        <p className="rl-print-price">{price(p.price, p.currency)}</p>
        <TrustLadder level={level} compact />
      </div>
      <div className="rl-print-qr"><QrCode value={qrUrl(p.publicId)} size={150} label={COPY.qr} /></div>
    </section>
    {p.photos[0] && <img className="rl-print-cover" src={p.photos[0].url} alt="" />}
    <h2>Təmir tarixçəsi</h2>
    {p.works.map((w, i) => <section key={w.id} className="rl-print-work">
      <h3>{String(i + 1).padStart(2, '0')}. {w.title}</h3>
      <p className="meta">{w.startDate ? dateText(w.startDate) : '—'} – {w.endDate ? dateText(w.endDate) : '—'}{w.contractorName ? ` · Podratçı: ${w.contractorName}` : ''}</p>
      <p className="meta">{w.contractorConfirmedAt ? `✓ Podratçı təsdiqləyib (${dateText(w.contractorConfirmedAt)})` : '○ Podratçı təsdiqi yoxdur'} · {w.handoverStatus === 'accepted' ? `✓ Ev sahibi foto ilə qəbul edib (${dateText(w.ownerDecidedAt)})` : w.handoverStatus === 'revision' ? '! Ev sahibi düzəliş istəyib' : '○ Ev sahibi qəbulu gözlənilir'}</p>
      {w.description && <p>{w.description}</p>}
      {w.materials && <p><b>Materiallar:</b> {w.materials}</p>}
      <div className="rl-print-photos">{w.beforePhotos.slice(0, 2).map(m => <figure key={m.id}><img src={m.url} alt="" /><figcaption>Əvvəl</figcaption></figure>)}{w.afterPhotos.slice(0, 2).map(m => <figure key={m.id}><img src={m.url} alt="" /><figcaption>Sonra</figcaption></figure>)}</div>
    </section>)}
    <footer className="rl-print-foot">
      <div><strong>{p.realtor.name}</strong>{p.realtor.agency ? ` · ${p.realtor.agency}` : ''}<br />{[p.realtor.phone, p.realtor.whatsapp && p.realtor.whatsapp !== p.realtor.phone ? `WhatsApp: ${p.realtor.whatsapp}` : '', p.realtor.instagram ? `@${p.realtor.instagram}` : ''].filter(Boolean).join(' · ')}</div>
      <small>Təsdiqlər Təhvil hesab qeydləridir; hüquqi ekspertiza və ya elektron imza deyil. Yenilənib: {dateText(p.updatedAt)}</small>
    </footer>
  </div>;
}
