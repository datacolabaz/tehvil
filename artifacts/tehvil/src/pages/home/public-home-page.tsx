import { useState } from 'react';
import { BadgeCheck, Boxes, Cable, ClipboardCheck, DoorOpen, HardHat, Lock, MapPin, ShieldCheck } from 'lucide-react';
import { useGetPublicHome, useGetSharedHome, type PublicHome } from '@workspace/api-client-react';
import { Pill, Skeleton } from '@/components/home/ui';
import { EQUIP_CATEGORY, INFRA_COLOR, INFRA_SOURCE, INFRA_TYPE, PART_ROLE, PROPERTY, STAGE, WORK_CATEGORY, WORK_KIND, day, range } from '@/lib/home/labels';

export function PublicHomePage({ publicId }: { publicId: string }) {
  const q = useGetPublicHome(publicId, { query: { retry: false, queryKey: [`/api/public/homes/${publicId}`] } });
  return <PublicFrame label="Evin rəqəmsal pasportu">{q.isLoading ? <Skeleton rows={3} /> : q.data ? <HomeView h={q.data} /> : <Gone text="Bu evin səhifəsi ictimai deyil və ya mövcud deyil." />}</PublicFrame>;
}

export function SharedHomePage({ token }: { token: string }) {
  const q = useGetSharedHome(token, { query: { retry: false, queryKey: [`/api/public/home-shares/${token}`] } });
  return <PublicFrame label="Paylaşılan ev pasportu">{q.isLoading ? <Skeleton rows={3} /> : q.data ? <HomeView h={q.data} shared /> : <Gone text="Bu paylaşım linki aktiv deyil — ləğv edilib və ya müddəti bitib. Ev sahibindən yeni link istəyin." />}</PublicFrame>;
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
    <section className="surface hp-pub-hero">
      {h.coverUrl ? <img src={h.coverUrl} alt="" className="hp-pub-cover" /> : <div className="hp-pub-cover ph"><DoorOpen size={40} /></div>}
      <div>
        {shared && h.shareLabel && <Pill small tone="info">{h.shareLabel}</Pill>}
        <h1 className="font-display">{h.name}</h1>
        <p><MapPin size={13} className="sm-ii" /> {[h.address, h.district, h.city].filter(Boolean).join(', ')}</p>
        <dl className="hp-facts">
          <div><dt>Növ</dt><dd>{PROPERTY[h.propertyType] ?? h.propertyType}</dd></div>
          <div><dt>Sahə</dt><dd>{h.areaM2 ? `${h.areaM2} m²` : '—'}</dd></div>
          <div><dt>Otaq</dt><dd>{h.roomCount ?? '—'}</dd></div>
          <div><dt>Tikinti ili</dt><dd>{h.builtYear ?? '—'}</dd></div>
          <div><dt>Mərhələ</dt><dd>{STAGE[h.stage]}</dd></div>
        </dl>
        {h.works.length > 0 && <p className="hp-pub-summary"><ClipboardCheck size={15} /><b>{h.works.length}</b> iş qeydi{shared ? '' : ' — hamısı ev sahibi tərəfindən qəbul edilib'}{shared ? ` · ${confirmed} qəbul edilib` : ''}</p>}
      </div>
    </section>
    {h.rooms.length > 0 && <section className="surface hp-section"><h2>Otaqlar</h2><div className="hp-chips">{h.rooms.map(r => <span key={r} className="hp-chip">{r}</span>)}</div></section>}
    {h.works.length > 0 && <section className="surface hp-section"><h2>Tikinti və təmir tarixçəsi</h2>
      <ol className="hp-pub-works">{h.works.map(w => <li key={w.id}>
        <div className="hp-pub-work-head"><b>{w.title}</b>{w.confirmed ? <Pill small tone="ok" icon={<ClipboardCheck size={11} />}>Ev sahibi qəbul edib</Pill> : <Pill small tone="neutral">Qəbul gözləyir</Pill>}{w.inspected && <Pill small tone="ok" icon={<ShieldCheck size={11} />}>Mütəxəssis yoxlayıb</Pill>}</div>
        <small>{[WORK_CATEGORY[w.category], WORK_KIND[w.kind], w.roomName, range(w.startDate, w.endDate)].filter(Boolean).join(' · ')}</small>
        {w.description && <p className="hp-text">{w.description}</p>}
        {w.materials && <p className="hp-text"><b>Materiallar:</b> {w.materials}</p>}
        {w.performers.length > 0 && <p className="hp-pub-perf"><HardHat size={13} />{w.performers.map((p, i) => <span key={i}>{i > 0 && ', '}{p.profilePublic ? <a href={`/w/${p.id}`}>{p.displayName}</a> : p.displayName} <small>({PART_ROLE[p.role] ?? p.role})</small></span>)}</p>}
        {w.photos.length > 0 && <div className="hp-pub-photos">{w.photos.map(u => <button key={u} type="button" onClick={() => setPhoto(u)}><img src={u} alt="" loading="lazy" /></button>)}</div>}
      </li>)}</ol></section>}
    {h.equipment.length > 0 && <section className="surface hp-section"><h2><Boxes size={15} className="sm-ii" /> Avadanlıqlar</h2>{h.equipment.map(e => <div key={e.id} className="hp-kvline"><b>{e.name}</b><small>{[EQUIP_CATEGORY[e.category], e.brand, e.model, e.roomName, e.installedAt ? `quraşdırılıb ${day(e.installedAt)}` : '', e.warrantyUntil ? `zəmanət ${day(e.warrantyUntil)}-dək` : ''].filter(Boolean).join(' · ')}</small></div>)}</section>}
    {h.infrastructure.length > 0 && <section className="surface hp-section"><h2><Cable size={15} className="sm-ii" /> Kommunikasiya xətləri</h2>
      <div className="hp-pub-infra">{h.infrastructure.map(i => <article key={i.id} className="hp-line">
        <header><i style={{ background: INFRA_COLOR[i.type] }} /><b>{INFRA_TYPE[i.type]}</b>{i.verified && <Pill small tone="ok" icon={<BadgeCheck size={11} />}>Mütəxəssis təsdiqləyib</Pill>}</header>
        {i.label && <p><strong>{i.label}</strong></p>}{i.notes && <p className="hp-text">{i.notes}</p>}<small>{[INFRA_SOURCE[i.source], i.roomName].filter(Boolean).join(' · ')}</small>
        {i.mediaUrl && <div className="hp-photomap small"><img src={i.mediaUrl} alt="" /><svg viewBox="0 0 100 100" preserveAspectRatio="none">{i.points.length > 1 && <polyline points={i.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={INFRA_COLOR[i.type]} strokeWidth={1} vectorEffect="non-scaling-stroke" />}</svg></div>}
      </article>)}</div>
      <p className="rl-hint">Qazma və ya sökmədən əvvəl xətlərin yerini yerində yoxlayın.</p></section>}
    {!h.works.length && !h.equipment.length && !h.infrastructure.length && <p className="rl-hint">Ev sahibi bu səhifədə yalnız əsas məlumatı göstərir.</p>}
    {photo && <div className="hp-lightbox" role="dialog" aria-modal="true" onClick={() => setPhoto(null)}><img src={photo} alt="" /></div>}
  </>;
}
