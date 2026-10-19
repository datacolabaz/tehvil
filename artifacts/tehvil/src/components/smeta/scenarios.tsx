import { Info } from 'lucide-react';
import { priceScenarios } from '@/lib/smeta/ai';
import { QUALITY_FACTOR, QUALITY_LABEL } from '@/lib/smeta/catalog';
import { azn } from '@/lib/smeta/format';
import type { Project } from '@/lib/smeta/types';
import { Pill } from './ui';

export function Scenarios({ project: p }: { project: Project }) {
  const list = priceScenarios(p);
  return <>
    <div className="sm-scenarios">{list.map(s => <article key={s.quality} className={`sm-scenario ${s.quality === p.quality ? 'current' : ''}`} aria-current={s.quality === p.quality || undefined}>
      <h3>{s.label}{s.quality === p.quality && <Pill small tone="ok">Cari smeta</Pill>}</h3>
      <dl>
        <dt>Materiallar</dt><dd>{azn(s.material)}</dd>
        <dt>İşçilik</dt><dd>{azn(s.labor)}</dd>
        <dt>Əlavə xərclər</dt><dd>{azn(s.other)}</dd>
        <dt>Təxmini müddət</dt><dd>{s.days} gün</dd>
      </dl>
      <strong className="num"><small>Təxmini cəmi</small>{s.quality === p.quality ? '' : '≈ '}{azn(s.total)}</strong>
    </article>)}</div>
    <p className="sm-pva-note" style={{ marginBottom: 0 }}><Info size={14} aria-hidden /><span>Digər variantlar real qiymət məlumatından deyil, sabit əmsallarla hesablanıb ({(['ekonom', 'standart', 'premium'] as const).map(q => `${QUALITY_LABEL[q]}: material ×${String(QUALITY_FACTOR[q].material).replace('.', ',')}, işçilik ×${String(QUALITY_FACTOR[q].labor).replace('.', ',')}`).join('; ')}). Real fərqi konkret material qiymətləri göstərəcək.</span></p>
  </>;
}
