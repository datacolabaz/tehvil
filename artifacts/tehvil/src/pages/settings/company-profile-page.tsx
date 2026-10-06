import { Link } from 'wouter';
import { useUser } from '@clerk/react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Loading, PageHeading } from '@/components/kit';
import { CompanyProfileForm } from '@/components/contractor/company-profile-form';
import { SmetaToaster, toast } from '@/components/smeta/ui';
import { useContractorAccount } from '@/lib/contractor/account';
import { PLANS, isPlanId } from '@/lib/entitlements';

export function CompanyProfilePage() {
  const { account, status } = useContractorAccount();
  const { user } = useUser();
  if (!account) return status === 'error'
    ? <div className="ct-alert" role="alert">Profil yüklənmədi. Səhifəni yeniləyin.</div>
    : <Loading t={() => 'Yüklənir'} />;
  const p = account.profile;
  const name = p?.companyName || 'Şirkət adı';
  return <>
    <PageHeading eyebrow="Tənzimləmələr" title="Şirkət profili" description="Sifarişçiyə göndərdiyiniz smetanın başlığı və yeni smetalar üçün standart şərtlər." />
    <div className="ct-settings">
      <CompanyProfileForm
        key={p?.updatedAt ?? 'new'}
        variant="full" profile={p}
        seed={{ phone: account.onboarding.phone, email: user?.primaryEmailAddress?.emailAddress }}
        submitLabel="Yadda saxla" submitIcon={<CheckCircle2 size={16} />}
        onSaved={() => toast('Şirkət profili yadda saxlanıldı')}
      />
      <aside className="ct-sticky">
        <div className="aside-panel">
          <div className="eyebrow">Sifarişçi belə görəcək</div>
          <div className="ct-company" style={{ marginTop: 12 }}>
            <span className="ct-company-logo">{p?.logoUrl ? <img src={p.logoUrl} alt="" /> : name.charAt(0).toUpperCase()}</span>
            <div><div className="ct-company-name">{name}</div><div className="ct-company-contacts">{p?.phone && <span>{p.phone}</span>}{p?.city && <span>{p.city}</span>}</div></div>
          </div>
          <div className="ct-record">
            <span>Bu smeta {name} tərəfindən Təhvil vasitəsilə hazırlanıb.</span>
            <span><ShieldCheck size={13} aria-hidden />Smeta və təsdiq tarixçəsi Təhvil-də qeydə alınıb.</span>
          </div>
          <p className="ct-hint" style={{ marginTop: 12 }}>Profil sonrakı göndərişlərdə tətbiq olunur. Artıq göndərilmiş versiyalar göndəriş anındakı məlumatı saxlayır.</p>
        </div>
        <div className="aside-panel">
          <div className="eyebrow">Plan</div>
          <h3 style={{ margin: '6px 0' }}>{isPlanId(account.plan.id) ? PLANS[account.plan.id].name : account.plan.id}</h3>
          <Link href="/settings/plan" className="sm-link-btn">Planları müqayisə et</Link>
        </div>
      </aside>
    </div>
    <SmetaToaster />
  </>;
}
