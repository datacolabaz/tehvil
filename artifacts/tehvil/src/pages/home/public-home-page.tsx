import { useState } from 'react';
import { AlertTriangle, BadgeCheck, Boxes, Cable, CheckCircle2, ClipboardCheck, DoorOpen, FileText, HardHat, Info, Lock, MapPin, Printer, ShieldCheck, Wrench } from 'lucide-react';
import { useGetPublicHome, useGetSharedHome, type PublicHome } from '@workspace/api-client-react';
import { Pill, Skeleton } from '@/components/home/ui';
import { EQUIP_CATEGORY, INFRA_COLOR, INFRA_SOURCE, INFRA_TYPE, NOTE_KIND, PART_ROLE, PROPERTY, STAGE, WORK_CATEGORY, WORK_KIND, day, dayTime, range } from '@/lib/home/labels';

/** Who entered a record — shown next to every work so a reader can judge it. */
const SOURCE: Record<string, string> = { owner: 'Ev sahibi daxil edib', member: 'Ev sahibi tərəfi daxil edib', contributor: 'Ev sahibinin giriş verdiyi şəxs daxil edib', technician: 'Ev sahibinin giriş verdiyi şəxs daxil edib', performer: 'Podratçı daxil edib' };
const NoData = () => <span className="hp-nodata">Məlumat yoxdur</span>;

export function PublicHomePage({ publicId }: { publicId: string }) {
  const q = useGetPublicHome(publicId, { query: { retry: false, queryKey: [`/api/public/homes/${publicId}`] } });
  return <PublicFrame label="Evin məlumatları">{q.isLoading ? <Skeleton rows={3} /> : q.data ? <HomeView h={q.data} /> : <Gone text="Bu evin səhifəsi ictimai deyil və ya mövcud deyil." />}</PublicFrame>;
}

export function SharedHomePage({ token }: { token: string }) {
  const q = useGetSharedHome(token, { query: { retry: false, queryKey: [`/api/public/home-shares/${token}`] } });
  return <PublicFrame label="Paylaşılan ev məlumatları">{q.isLoading ? <Skeleton rows={3} /> : q.data ? <HomeView h={q.data} shared /> : <Gone text="Bu paylaşım linki aktiv deyil — ləğv edilib və ya müddəti bitib. Ev sahibindən yeni link istəyin." />}</PublicFrame>;
}

function PublicFrame({ label, children }: { label: string; children: React.ReactNode }) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <div className="hp-public"><header className="hp-public-head"><a href={`${base}/`} className="brand"><span className="brand-mark">t.</span><span>Təhvil</span></a><span className="eyebrow">{label}</span></header>
    <main className="hp-public-main">{children}</main>
    <footer className="hp-public-foot"><ShieldCheck size={14} />Məlumatlar ev sahibinin, ustaların və mütəxəssislərin Təhvil-dəki qeydlərinə əsaslanır. Təsdiqlər hesab səviyyəsində qeyd olunur; bu, hüquqi sertifikat və ya ekspertiza deyil.</footer></div>;
}

function Gone({ text }: { text: string }) {
  return <div className="surface hp-section hp-gone"><Lock size={26} /><p>{text}</p></div>;
}

function HomeView({ h, shared }: { h: PublicHome; shared?: boolean }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const confirmed = h.works.filter(w => w.confirmed).length;
  return <>
    {shared && <section className="surface hp-pub-banner" data-testid="shared-banner">
      <div><b>{h.purpose === 'sale' ? 'Satış üçün paylaşılan ev pasportu' : 'Ev sahibinin paylaşdığı məlumatlar'}</b>
        <small>{h.lastChangeAt ? `Məlumatlar son dəfə ${dayTime(h.lastChangeAt)} yenilənib` : `Yenilənib: ${dayTime(h.updatedAt)}`} · yalnız ev sahibinin seçdiyi hissə</small></div>
      <button type="button" className="button button-secondary sm-btn-sm hp-noprint" onClick={() => window.print()} data-testid="button-print"><Printer size={14} />Çap et / PDF kimi saxla</button>
    </section>}
    {shared && <div className="hp-pub-disclaimer"><Info size={15} /><p>Bu səhifə rəsmi sertifikat, ekspertiza və ya evin keyfiyyətinə zəmanət deyil. Evin qüsursuz olduğunu, qiymətini və ya satışın nəticəsini təsdiq etmir. Hər qeydin yanında onu kimin daxil etdiyi, sənəd əlavə olunub-olunmadığı və yoxlanılıb-yoxlanılmadığı göstərilir.</p></div>}
    <section className="surface hp-pub-hero">
      {h.coverUrl ? <img src={h.coverUrl} alt="" className="hp-pub-cover" /> : <div className="hp-pub-cover ph"><DoorOpen size={40} /></div>}
      <div>
        {shared && h.shareLabel && <Pill small tone="info">{h.shareLabel}</Pill>}
        <h1 className="font-display">{h.name}</h1>
        {[h.address, h.district, h.city].some(Boolean) && <p><MapPin size={13} className="sm-ii" /> {[h.address, h.district, h.city].filter(Boolean).join(', ')}</p>}
        <dl className="hp-facts">
          <div><dt>Növ</dt><dd>{PROPERTY[h.propertyType] ?? h.propertyType}</dd></div>
          <div><dt>Sahə</dt><dd>{h.areaM2 ? `${h.areaM2} m²` : <NoData />}</dd></div>
          <div><dt>Otaq</dt><dd>{h.roomCount ?? <NoData />}</dd></div>
          <div><dt>Tikinti ili</dt><dd>{h.builtYear ?? <NoData />}</dd></div>
          <div><dt>Mərhələ</dt><dd>{STAGE[h.stage]}</dd></div>
        </dl>
        {h.works.length > 0 && <p className="hp-pub-summary"><ClipboardCheck size={15} /><b>{h.works.length}</b> görülən iş{shared ? '' : ' — ev sahibinin qeydləri'}{shared ? ` · ${confirmed} görülüb` : ''}</p>}
      </div>
    </section>
    {h.rooms.length > 0 && <section className="surface hp-section"><h2>Otaqlar</h2><div className="hp-chips">{h.rooms.map(r => <span key={r} className="hp-chip">{r}</span>)}</div></section>}
    {h.works.length > 0 && <section className="surface hp-section"><h2>İş tarixçəsi</h2>
      <ol className="hp-pub-works">{h.works.map(w => <li key={w.id}>
        <div className="hp-pub-work-head"><b>{w.title}</b>{w.confirmed ? <Pill small tone="ok" icon={<ClipboardCheck size={11} />}>Görülüb</Pill> : <Pill small tone="neutral">Ev sahibinin qəbulunu gözləyir</Pill>}{w.hasDocuments && <Pill small tone="info" icon={<FileText size={11} />}>Sənəd əlavə olunub</Pill>}{w.inspected && <Pill small tone="ok" icon={<ShieldCheck size={11} />}>Yoxlama qeydi var</Pill>}</div>
        <small>{[WORK_CATEGORY[w.category], WORK_KIND[w.kind], w.roomName, range(w.startDate, w.endDate)].filter(Boolean).join(' · ')}</small>
        <small className="hp-pub-source">{SOURCE[w.source] ?? 'Ev sahibi daxil edib'} · qeyd yenilənib {day(w.updatedAt)}</small>
        {w.description && <p className="hp-text">{w.description}</p>}
        {w.materials && <p className="hp-text"><b>Materiallar:</b> {w.materials}</p>}
        {w.performers.length > 0 && <p className="hp-pub-perf"><HardHat size={13} />{w.performers.map((p, i) => <span key={i}>{i > 0 && ', '}{p.profilePublic ? <a href={`/w/${p.id}`}>{p.displayName}</a> : p.displayName} <small>({PART_ROLE[p.role] ?? p.role})</small></span>)}</p>}
        {w.notes.length > 0 && <ul className="hp-pub-notes">{w.notes.map((n, i) => <li key={i} className={`k-${n.kind}`}>{n.kind === 'defect' ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}<span><b>{NOTE_KIND[n.kind] ?? n.kind}</b> · {day(n.createdAt)}<br />{n.body}</span></li>)}</ul>}
        {w.photos.length > 0 && <div className="hp-pub-photos">{w.photos.map(u => <button key={u} type="button" onClick={() => setPhoto(u)}><img src={u} alt="" loading="lazy" /></button>)}</div>}
      </li>)}</ol></section>}
    {h.equipment.length > 0 && <section className="surface hp-section"><h2><Boxes size={15} className="sm-ii" /> Avadanlıqlar</h2>{h.equipment.map(e => <div key={e.id} className="hp-kvline"><b>{e.name}</b><small>{[EQUIP_CATEGORY[e.category], e.brand, e.model, e.roomName, e.installedAt ? `quraşdırılıb ${day(e.installedAt)}` : '', e.warrantyUntil ? `zəmanət ${day(e.warrantyUntil)}-dək` : ''].filter(Boolean).join(' · ')}</small>
      <small><Wrench size={11} className="sm-ii" /> Son xidmət: {e.lastServiceAt ? day(e.lastServiceAt) : 'məlumat yoxdur'}{e.nextServiceAt ? ` · növbəti: ${day(e.nextServiceAt)}` : ''}</small></div>)}</section>}
    {h.infrastructure.length > 0 && <section className="surface hp-section"><h2><Cable size={15} className="sm-ii" /> Evdəki sistemlər</h2>
      <div className="hp-pub-infra">{h.infrastructure.map(i => <article key={i.id} className="hp-line">
        <header><i style={{ background: INFRA_COLOR[i.type] }} /><b>{INFRA_TYPE[i.type]}</b>{i.verified && <Pill small tone="ok" icon={<BadgeCheck size={11} />}>Yoxlanılıb</Pill>}</header>
        {i.label && <p><strong>{i.label}</strong></p>}{i.notes && <p className="hp-text">{i.notes}</p>}<small>{[INFRA_SOURCE[i.source], i.roomName, `qeyd: ${day(i.createdAt)}`].filter(Boolean).join(' · ')}</small>
        {i.mediaUrl && <div className="hp-photomap small"><img src={i.mediaUrl} alt="" /><svg viewBox="0 0 100 100" preserveAspectRatio="none">{i.points.length > 1 && <polyline points={i.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={INFRA_COLOR[i.type]} strokeWidth={1} vectorEffect="non-scaling-stroke" />}</svg></div>}
      </article>)}</div>
      <p className="rl-hint">Divarı deşməzdən əvvəl naqil və boruların yerini yerində yoxlayın.</p></section>}
    {h.documents.length > 0 && <section className="surface hp-section"><h2><FileText size={15} className="sm-ii" /> Sənədlər</h2>
      <ul className="hp-docs">{h.documents.map(d => <li key={d.id} className="surface"><a href={d.url} target="_blank" rel="noreferrer" className="hp-doc"><FileText size={20} /><span><b>{d.title}</b><small>Əlavə olunub: {day(d.createdAt)}</small></span></a></li>)}</ul>
      <p className="rl-hint">Sənədləri ev sahibi yükləyib. Təhvil.az onların məzmununu yoxlamır.</p></section>}
    {!h.works.length && !h.equipment.length && !h.infrastructure.length && !h.documents.length && <p className="rl-hint">Ev sahibi burada yalnız evin ümumi məlumatlarını göstərir.</p>}
    {photo && <div className="hp-lightbox" role="dialog" aria-modal="true" onClick={() => setPhoto(null)}><img src={photo} alt="" /></div>}
  </>;
}
