import { ShieldCheck } from 'lucide-react';
import type { SharedEstimateCompany } from '@workspace/api-client-react';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * Contractor header on the public estimate. Uses only the public-safe company
 * snapshot frozen at send time. Deliberately no "verified" wording: Təhvil
 * records the estimate and approval history, it does not vet contractors.
 */
export function CompanyHeader({ company }: { company: SharedEstimateCompany }) {
  const logo = company.logoUrl ? `${base}${company.logoUrl}` : null;
  const ig = company.instagram?.replace(/^@/, '');
  return <div className="ct-company-block" data-testid="public-company">
    <div className="ct-company">
      <span className="ct-company-logo">{logo ? <img src={logo} alt={`${company.name} loqosu`} /> : company.name.charAt(0).toUpperCase()}</span>
      <div>
        <div className="ct-company-name">{company.name}</div>
        <div className="ct-company-contacts">
          {company.phone && <a href={`tel:${company.phone.replace(/[^+\d]/g, '')}`}>{company.phone}</a>}
          {company.email && <a href={`mailto:${company.email}`}>{company.email}</a>}
          {(company.city || company.serviceArea) && <span>{[company.city, company.serviceArea].filter(Boolean).join(' · ')}</span>}
          {company.website && <a href={href(company.website)} target="_blank" rel="noopener noreferrer nofollow">{company.website.replace(/^https?:\/\//i, '')}</a>}
          {ig && <a href={`https://instagram.com/${encodeURIComponent(ig)}`} target="_blank" rel="noopener noreferrer nofollow">@{ig}</a>}
        </div>
      </div>
    </div>
    <div className="ct-record">
      <span data-testid="text-prepared-by">Bu smeta {company.name} tərəfindən Təhvil vasitəsilə hazırlanıb.</span>
      <span><ShieldCheck size={13} aria-hidden />Smeta və təsdiq tarixçəsi Təhvil-də qeydə alınıb.</span>
    </div>
  </div>;
}
