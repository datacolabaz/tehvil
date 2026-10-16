import { Link } from 'wouter';
import { ArrowUpRight, Eye, FilePlus2, MapPin, MessageCircle, QrCode, ShieldCheck, Users } from 'lucide-react';
import { useListPropertyPassports } from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, Pill, RealtorToaster, Skeleton, TrustBadge, TrustLadder } from '@/components/realtor/ui';
import { COPY, PASSPORT_STATUS, facts, num, price, type Trust } from '@/lib/realtor/labels';

export function RealtorPassportsPage() {
  const passports = useListPropertyPassports();
  const list = passports.data ?? [];
  const published = list.filter(p => p.status === 'published');
  return <>
    <PageHeading eyebrow={COPY.certified} title="Mənzil Təhvil Pasportları" description="Təmir işləri, fotolar, podratçı təsdiqi və ev sahibi qəbulu — QR kod, link və PDF ilə alıcıya yoxlanıla bilən şəkildə." action={<Link href="/realtor/passports/new" className="button button-primary" data-testid="button-create-passport"><FilePlus2 size={16} />Pasport yarat</Link>} />
    {passports.isLoading ? <Skeleton rows={3} /> : !list.length ? <div className="rl-passport-intro surface">
      <div>
        <div className="eyebrow"><ShieldCheck size={13} className="sm-ii" /> Yalnız Təhvil-də olan üstünlük</div>
        <h2 className="font-display">Hər mənzili “Təhvil Sertifikatlı Mənzil” kimi təqdim edin</h2>
        <p>{COPY.triad}. Alıcı QR kodu skan edir və təmir tarixçəsini, əvvəl/sonra fotolarını, podratçı təsdiqini və ev sahibinin qəbulunu görür — login olmadan.</p>
        <Link href="/realtor/passports/new" className="button button-primary"><FilePlus2 size={16} />İlk pasportu yarat</Link>
      </div>
      <TrustLadder level="basic" />
    </div> : <>
      <div className="rl-passport-summary">
        <span><b>{published.length}</b> dərc olunub</span>
        <span><b>{published.filter(p => p.trustLevel === 'handover').length}</b> Təhvil təsdiqli</span>
        <span><b>{num(list.reduce((s, p) => s + p.stats.views, 0))}</b> baxış</span>
        <span><b>{num(list.reduce((s, p) => s + p.stats.qrScans, 0))}</b> QR skan</span>
      </div>
      <div className="rl-listing-grid">{list.map(p => <Link key={p.id} href={`/realtor/passports/${p.id}`} className={`rl-listing rl-passport-card ${p.trustLevel}`} data-testid={`card-passport-${p.id}`}>
        <div className="rl-listing-cover">{p.photos[0] ? <img src={p.photos[0].url} alt="" loading="lazy" /> : <ShieldCheck size={30} />}
          <div className="rl-listing-badges"><Pill small tone={p.status === 'published' ? 'ok' : p.status === 'draft' ? 'warn' : 'neutral'}>{PASSPORT_STATUS[p.status]}</Pill></div>
        </div>
        <div className="rl-listing-body">
          <TrustBadge level={p.trustLevel as Trust} size="sm" />
          <h3>{p.title}</h3>
          <div className="sm-card-meta"><span><MapPin size={12} />{facts(p)}</span></div>
          <div className="rl-price">{price(p.price, p.currency)}</div>
          <div className="rl-listing-meta"><span>{p.works.length} iş</span><span><Eye size={12} />{num(p.stats.views)}</span><span><QrCode size={12} />{p.stats.qrScans}</span><span><MessageCircle size={12} />{p.stats.whatsappClicks}</span><span><Users size={12} />{p.stats.leads}</span></div>
          <span className="text-link rl-open">Pasportu idarə et<ArrowUpRight size={14} /></span>
        </div>
      </Link>)}</div>
    </>}
    <RealtorToaster />
  </>;
}
