import { Link } from 'wouter';
import { ArrowRight, Building2, Calculator, HardHat, Info } from 'lucide-react';
import { PageHeading } from '@/components/kit';
import './ai.css';

/** AI Smeta: two separate modes whose results are never mixed, plus the older contractor tool. */
export function AiSmetaHomePage() {
  return <>
    <PageHeading eyebrow="AI Smeta" title="Ev almaq və ya tikdirmək istəyirsiniz? Dəyərini əvvəlcədən hesablayın." description="İki ayrı hesablama: hazır əmlakın bazar dəyəri və yeni tikilinin tikinti büdcəsi. Nəticələr bir-birinə qarışdırılmır." />
    <div className="ai-modes">
      <Link href="/ai-smeta/bazar" className="ai-mode surface" data-testid="mode-market">
        <span className="ai-mode-icon"><Building2 size={22} /></span>
        <h2>Elan linkindən evin bazar dəyərini hesabla</h2>
        <p>Bina.az və ya digər portalın elan linkini, ya da elanın mətnini daxil edin. Dəyər oxşar real elanlarla müqayisə edilir.</p>
        <ul><li>Aralıq, mərkəzi təxmin və AZN/m²</li><li>İstifadə olunan elanlar linkləri ilə</li><li>Etibarlılıq və çatışmayan məlumatlar</li></ul>
        <span className="ai-mode-cta">Elan üzrə bazar dəyərini hesabla<ArrowRight size={15} /></span>
      </Link>
      <Link href="/ai-smeta/tikinti" className="ai-mode surface" data-testid="mode-build">
        <span className="ai-mode-icon"><HardHat size={22} /></span>
        <h2>Memarın layihəsini yüklə və tikinti smetasını hesabla</h2>
        <p>PDF çertyoj, şəkil və ya XLSX/CSV iş həcmləri cədvəli. Ölçüləri yoxlayırsınız, qiymətləri öz mənbənizdən daxil edirsiniz.</p>
        <ul><li>13 bölmə: bünövrədən qapı-pəncərəyə</li><li>Hər sətirdə vahid, miqdar, qiymət mənbəyi</li><li>Excel və PDF ixrac</li></ul>
        <span className="ai-mode-cta">Layihədən tikinti smetası hazırla<ArrowRight size={15} /></span>
      </Link>
    </div>
    <div className="ai-honest"><Info size={15} /><p>“AI Smeta” açıq qaydalara əsaslanan hesablamadır — süni intellekt modeli işə salınmır. Hər rəqəmin mənbəyi və fərziyyəsi nəticədə göstərilir.</p></div>
    <Link href="/smeta" className="ai-legacy surface" data-testid="mode-renovation"><Calculator size={18} /><span><b>Podratçılar üçün təmir smetası</b><small>Mövcud mənzil təmiri üçün iş həcmi, sifarişçi təsdiqi, xərclər və ödənişlər</small></span><ArrowRight size={15} /></Link>
  </>;
}
