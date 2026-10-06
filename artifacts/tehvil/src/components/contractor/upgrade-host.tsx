import { Sparkles } from 'lucide-react';
import { Button } from '@/components/kit';
import { Modal } from '@/components/smeta/ui';
import { track } from '@/lib/analytics';
import { useUpgradeRequests } from '@/lib/contractor/upgrade';
import { FEATURE_LABEL, PLANS } from '@/lib/entitlements';
import { DemoRequestForm } from './demo-request';

/** Renders plan notes requested by `gateFeature` / `openUpgradeLead`. Mount once inside the app shell. */
export function UpgradeHost() {
  const [request, setRequest] = useUpgradeRequests();
  const close = () => setRequest(null);
  if (!request) return null;

  if (request.kind === 'lead') {
    return <Modal open onClose={close} eyebrow={`${PLANS[request.plan].name} plan`} title="Plana keçid üçün müraciət">
      <p className="ct-hint" style={{ marginBottom: 12 }}>Onlayn ödəniş hələ yoxdur. Müraciət göndərin, Təhvil komandası şərtləri sizinlə razılaşdırsın.</p>
      <DemoRequestForm source={request.source === 'pricing' ? 'pricing' : request.source} interestedPlan={request.plan} onDone={close} compact />
    </Modal>;
  }

  const plan = PLANS[request.plan];
  const feature = FEATURE_LABEL[request.feature];
  return <Modal open onClose={close} eyebrow={`${plan.name} plan`} title={`${feature} ${plan.name} planına daxildir`} footer={<>
    <Button variant="secondary" onClick={close} testId="button-upgrade-later">{request.blocked ? 'Bağla' : 'İndilik davam et'}</Button>
    <Button onClick={() => {
      track('upgrade_clicked', { plan: request.plan, feature: request.feature, source: 'upgrade' });
      setRequest({ kind: 'lead', plan: request.plan, source: 'upgrade', feature: request.feature });
    }} testId="button-upgrade"><Sparkles size={15} />{plan.name} plana keçin</Button>
  </>}>
    <div className="ct-upgrade">
      <p>{request.blocked
        ? `Bu funksiya cari planınızda bağlıdır. ${plan.name} planına keçdikdən sonra istifadə edə bilərsiniz.`
        : `Hazırda bu funksiyanı sınaq qaydasında istifadə edə bilərsiniz. Davamlı istifadə üçün ${plan.name} planına keçin.`}</p>
      <ul className="sm-list">{plan.highlights.slice(0, 5).map(h => <li key={h}>{h}</li>)}</ul>
    </div>
  </Modal>;
}
