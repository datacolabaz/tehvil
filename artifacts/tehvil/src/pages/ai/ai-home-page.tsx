import { Link } from 'wouter';
import { ArrowRight, Hammer, HardHat, Info } from 'lucide-react';
import { PageHeading } from '@/components/kit';
import './ai.css';

/** AI Smeta: repair and construction cost estimates. */
export function AiSmetaHomePage() {
  return <>
    <PageHeading eyebrow="AI Smeta" title="Təmir etmək və ya ev tikdirmək istəyirsiniz? Xərcləri əvvəlcədən hesablayın." description="İki ayrı smeta: mövcud mənzilin və ya evin təmiri, memarlıq layihəsindən isə yeni tikili." />
    <div className="ai-modes">
      <Link href="/smeta" className="ai-mode surface" data-testid="mode-renovation">
        <span className="ai-mode-icon"><Hammer size={22} /></span>
        <h2>Mənzil və ya ev təmiri smetası</h2>
        <p>Otaqlar üzrə iş həcmləri, material və işçilik ayrıca. Smetanı sifarişçi ilə razılaşdırın, xərcləri və ödənişləri izləyin.</p>
        <ul><li>Otaq-otaq iş siyahısı və miqdarlar</li><li>Material və işçilik ayrıca, qiymətin mənbəyi ilə</li><li>Sifarişçi təsdiqi, xərclər və ödənişlər</li></ul>
        <span className="ai-mode-cta">Təmir smetası hazırla<ArrowRight size={15} /></span>
      </Link>
      <Link href="/ai-smeta/tikinti" className="ai-mode surface" data-testid="mode-build">
        <span className="ai-mode-icon"><HardHat size={22} /></span>
        <h2>Memarın layihəsini yüklə və tikinti smetasını hesabla</h2>
        <p>PDF çertyoj, şəkil və ya XLSX/CSV iş həcmləri cədvəli. Ölçüləri yoxlayırsınız, qiymətləri öz mənbənizdən daxil edirsiniz.</p>
        <ul><li>13 bölmə: bünövrədən qapı-pəncərəyə</li><li>Hər sətirdə vahid, miqdar, qiymət mənbəyi</li><li>Excel və PDF ixrac</li></ul>
        <span className="ai-mode-cta">Layihədən tikinti smetası hazırla<ArrowRight size={15} /></span>
      </Link>
    </div>
    <div className="ai-honest"><Info size={15} /><p>“AI Smeta” açıq qaydalara əsaslanan hesablamadır — süni intellekt modeli işə salınmır. Hər rəqəmin mənbəyi və fərziyyəsi smetada göstərilir; qiyməti olmayan iş uydurulmur.</p></div>
  </>;
}
