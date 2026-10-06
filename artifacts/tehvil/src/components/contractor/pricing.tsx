import { Check } from 'lucide-react';
import { Button } from '@/components/kit';
import { Pill } from '@/components/smeta/ui';
import { PLAN_ORDER, PLANS, PRICE_LABEL, type PlanId } from '@/lib/entitlements';

/**
 * Plan cards. No prices and no checkout: Başlanğıc starts a free account,
 * the paid plans open a contact request.
 */
export function PricingCards({ current, onStart, onContact }: { current?: PlanId | null; onStart: () => void; onContact: (plan: PlanId) => void }) {
  return <div className="ct-pricing">
    {PLAN_ORDER.map(id => {
      const plan = PLANS[id];
      const isCurrent = current === id;
      return <article key={id} className={`ct-plan ${id === 'pesekar' ? 'featured' : ''}`} aria-labelledby={`plan-${id}`} data-testid={`plan-${id}`}>
        <div className="ct-plan-head">
          <h3 id={`plan-${id}`}>{plan.name}</h3>
          {isCurrent ? <Pill small tone="ok">Cari plan</Pill> : id === 'pesekar' ? <Pill small tone="ai">Aktiv podratçılar üçün</Pill> : null}
        </div>
        <div className="ct-plan-price">{id === 'baslangic' ? 'Pulsuz' : PRICE_LABEL}</div>
        <p>{plan.summary}</p>
        <ul>{plan.highlights.map(h => <li key={h}><Check size={15} aria-hidden />{h}</li>)}</ul>
        {id === 'baslangic'
          ? <Button variant={isCurrent ? 'secondary' : 'primary'} disabled={isCurrent} onClick={onStart}>{isCurrent ? 'İstifadə edirsiniz' : 'Pulsuz başla'}</Button>
          : <Button variant={id === 'pesekar' ? 'primary' : 'secondary'} disabled={isCurrent} onClick={() => onContact(id)} testId={`button-contact-${id}`}>{isCurrent ? 'İstifadə edirsiniz' : 'Əlaqə saxlayın'}</Button>}
      </article>;
    })}
  </div>;
}
