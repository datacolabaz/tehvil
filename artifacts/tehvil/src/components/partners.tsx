import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Lang } from '@/lib/i18n';

// Logos are the partners' own official files, loaded from their sites.
// If one fails to load, the tile shows the partner's initial instead.
const partners = [
  { id: 'spotva', name: 'Spotva', domain: 'spotva.co', logo: 'https://spotva.co/apple-icon.png' },
  { id: 'metbuat', name: 'Metbuat', domain: 'metbuat.az', logo: 'https://metbuat.az/apple-touch-icon.png' },
  { id: 'resulio', name: 'Resulio', domain: 'resulio.co', logo: 'https://resulio.co/brand/resulio-icon.png' },
  { id: 'sayt', name: 'Sayt.az', domain: 'sayt.az', logo: 'https://sayt.az/icons/saytaz.svg' },
];

const text: Record<Lang, { eyebrow: string; title: string; visit: string }> = {
  az: { eyebrow: 'Tərəfdaşlar', title: 'Bizimlə birlikdə', visit: 'Sayta keç' },
  ru: { eyebrow: 'Партнёры', title: 'Вместе с нами', visit: 'Перейти на сайт' },
  en: { eyebrow: 'Partners', title: 'Working with us', visit: 'Visit site' },
};

function PartnerLogo({ name, logo }: { name: string; logo: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="partner-mono" aria-hidden="true">{name.charAt(0)}</span>;
  return <img className="partner-img" src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function Partners({ lang }: { lang: Lang }) {
  const c = text[lang];
  return <section className="partners wrap" aria-labelledby="partners-title">
    <div className="partners-head"><div><div className="eyebrow">{c.eyebrow}</div><h2 className="font-display" id="partners-title">{c.title}</h2></div></div>
    <div className="partners-grid">{partners.map((p, i) =>
      <a key={p.id} className="partner-tile" href={'https://' + p.domain} target="_blank" rel="noopener noreferrer" style={{ animationDelay: (i * -1.6) + 's' }} data-testid={'link-partner-' + p.id}>
        <span className="partner-fill" aria-hidden="true"/>
        <span className="partner-corner" aria-hidden="true"><ArrowUpRight size={16}/></span>
        <span className="partner-logo"><PartnerLogo name={p.name} logo={p.logo}/></span>
        <span className="partner-name">{p.name}</span>
        <span className="partner-domain">{p.domain}</span>
        <span className="partner-visit">{c.visit}<ArrowUpRight size={14}/></span>
      </a>)}
    </div>
  </section>;
}
