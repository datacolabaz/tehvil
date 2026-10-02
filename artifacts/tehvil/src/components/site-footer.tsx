import { MessageCircle, Send, Headset } from 'lucide-react';
import type { Lang } from '@/lib/i18n';
import { uiT } from '@/lib/i18n-ui';
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export function SiteFooter({ lang }: { lang: Lang }) {
  const url = `${window.location.origin}${base}/`;
  const text = uiT(lang, 'footerShareText');
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  return <footer className="site-footer no-print" aria-label={uiT(lang, 'footerLabel')}><div className="site-footer-inner">
    <a className="support-link" href="https://wa.me/994503066626" target="_blank" rel="noopener noreferrer" data-testid="link-support-whatsapp"><Headset size={16}/><span><small>{uiT(lang, 'footerSupport')}</small><b>{uiT(lang, 'footerSupportWhatsApp')}</b></span></a>
    <div className="share-group" role="group" aria-label={uiT(lang, 'footerShare')}><span>{uiT(lang, 'footerShare')}</span>
      <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={uiT(lang, 'footerShareWhatsApp')} title={uiT(lang, 'footerShareWhatsApp')} data-testid="link-share-whatsapp"><MessageCircle size={16}/></a>
      <a href={tg} target="_blank" rel="noopener noreferrer" aria-label={uiT(lang, 'footerShareTelegram')} title={uiT(lang, 'footerShareTelegram')} data-testid="link-share-telegram"><Send size={16}/></a></div>
    <small className="footer-rights">© {new Date().getFullYear()} Təhvil. {uiT(lang, 'footerRights')}</small>
  </div></footer>;
}
