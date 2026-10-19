import { useState } from 'react';
import { Link } from 'wouter';
import { Search } from 'lucide-react';
import { useListEquipment, useListHomeMedia, useListInfrastructure, useListWorks } from '@workspace/api-client-react';
import { EQUIP_CATEGORY, INFRA_SOURCE, INFRA_TYPE, WORK_CATEGORY, WORK_STATUS, day } from '@/lib/home/labels';

type Hit = { key: string; kind: string; title: string; detail: string; href: string; date: string | null };

/**
 * One search box over the whole home: works, hidden lines and technical notes, equipment and documents.
 * Matches text, room, system type (e.g. "elektrik", "su") and dates (e.g. "2023").
 */
export function HomeSearch({ homeId }: { homeId: string }) {
  const [q, setQ] = useState('');
  const works = useListWorks(homeId, { query: { enabled: q.trim().length > 1, queryKey: [`/api/homes/${homeId}/works`] } });
  const infra = useListInfrastructure(homeId, { query: { enabled: q.trim().length > 1, queryKey: [`/api/homes/${homeId}/infrastructure`] } });
  const equip = useListEquipment(homeId, { query: { enabled: q.trim().length > 1, queryKey: [`/api/homes/${homeId}/equipment`] } });
  const media = useListHomeMedia(homeId, { query: { enabled: q.trim().length > 1, queryKey: [`/api/homes/${homeId}/media`] } });
  const needle = q.trim().toLocaleLowerCase('az');
  const has = (...v: (string | null | undefined)[]) => v.some(x => (x ?? '').toLocaleLowerCase('az').includes(needle));
  const hits: Hit[] = needle.length < 2 ? [] : [
    ...(works.data ?? []).filter(w => has(w.title, w.description, w.materials, w.roomName, WORK_CATEGORY[w.category], w.startDate, w.startDate ? day(w.startDate) : '')).map(w => ({ key: `w${w.id}`, kind: 'İş', title: w.title, detail: [WORK_CATEGORY[w.category], w.roomName, WORK_STATUS[w.status]].filter(Boolean).join(' · '), href: `/works/${w.id}`, date: w.startDate })),
    ...(infra.data ?? []).filter(i => has(i.label, i.notes, i.roomName, INFRA_TYPE[i.type], i.workTitle, i.createdAt.slice(0, 10))).map(i => ({ key: `i${i.id}`, kind: 'Texniki məlumat', title: i.label || INFRA_TYPE[i.type], detail: [INFRA_TYPE[i.type], i.roomName, INFRA_SOURCE[i.source]].filter(Boolean).join(' · '), href: `/homes/${homeId}/map?type=${i.type}`, date: i.createdAt.slice(0, 10) })),
    ...(equip.data ?? []).filter(e => has(e.name, e.brand, e.model, e.roomName, EQUIP_CATEGORY[e.category], e.installedAt, e.notes)).map(e => ({ key: `e${e.id}`, kind: 'Avadanlıq', title: e.name, detail: [EQUIP_CATEGORY[e.category], e.brand, e.roomName].filter(Boolean).join(' · '), href: `/homes/${homeId}/equipment`, date: e.installedAt })),
    ...(media.data ?? []).filter(m => m.phase === 'document' && has(m.caption, m.originalName, m.createdAt.slice(0, 10))).map(m => ({ key: `d${m.id}`, kind: 'Sənəd', title: m.caption || m.originalName, detail: m.originalName, href: `/homes/${homeId}/documents`, date: m.createdAt.slice(0, 10) })),
  ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 25);
  const loading = needle.length > 1 && (works.isLoading || infra.isLoading || equip.isLoading || media.isLoading);
  return <section className="surface hp-section" data-testid="home-search">
    <label className="hp-search"><Search size={15} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Evdə axtar: otaq, sistem (elektrik, su…), il, avadanlıq…" aria-label="Evdə axtar" data-testid="input-home-search" /></label>
    {needle.length > 1 && (loading ? <p className="rl-hint">Axtarılır…</p> : !hits.length ? <p className="rl-hint">Uyğun qeyd tapılmadı.</p>
      : <ul className="hp-search-hits">{hits.map(h => <li key={h.key}><Link href={h.href}><small className="hp-hit-kind">{h.kind}</small><b>{h.title}</b><small>{[h.detail, h.date ? day(h.date) : ''].filter(Boolean).join(' · ')}</small></Link></li>)}</ul>)}
  </section>;
}
