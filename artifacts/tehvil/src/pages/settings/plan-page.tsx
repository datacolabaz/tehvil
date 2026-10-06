import { useLocation } from 'wouter';
import { Info } from 'lucide-react';
import { Loading, PageHeading } from '@/components/kit';
import { PricingCards } from '@/components/contractor/pricing';
import { track } from '@/lib/analytics';
import { useContractorAccount } from '@/lib/contractor/account';
import { openUpgradeLead } from '@/lib/contractor/upgrade';
import { ENFORCEMENT, PLANS, isPlanId } from '@/lib/entitlements';

export function PlanPage() {
  const { account, status } = useContractorAccount();
  const [, navigate] = useLocation();
  if (!account) return status === 'error' ? <div className="ct-alert" role="alert">Plan məlumatı yüklənmədi. Səhifəni yeniləyin.</div> : <Loading t={() => 'Yüklənir'} />;
  const plan = isPlanId(account.plan.id) ? account.plan.id : null;
  const limit = plan ? PLANS[plan].limits.activeProjects : null;
  return <>
    <PageHeading eyebrow="Tənzimləmələr" title="Plan" description={plan ? `Cari plan: ${PLANS[plan].name}${limit ? ` · ${account.usage.smetaProjects} / ${limit} aktiv layihə` : ''}` : undefined} />
    {account.plan.source === 'legacy' && <div className="ct-alert info" role="note" style={{ marginBottom: 16 }}><Info size={15} aria-hidden />Planlar tətbiq olunmazdan əvvəl qoşulduğunuz üçün hesabınızda Peşəkar imkanlar açıq saxlanılıb.</div>}
    {ENFORCEMENT === 'soft' && plan === 'baslangic' && <div className="ct-alert info" role="note" style={{ marginBottom: 16 }}><Info size={15} aria-hidden />Peşəkar funksiyaları hazırda sınaq qaydasında istifadə edə bilərsiniz. Davamlı istifadə üçün komandamızla əlaqə saxlayın.</div>}
    <PricingCards current={plan} onStart={() => navigate('/smeta/new')} onContact={p => { track('upgrade_clicked', { plan: p, source: 'plan_page' }); openUpgradeLead(p, 'plan_page'); }} />
    <p className="ct-note">Onlayn ödəniş hələ yoxdur. Plan dəyişikliyi Təhvil komandası ilə razılaşdırıldıqdan sonra hesabınıza tətbiq olunur.</p>
  </>;
}
