/**
 * Copy and illustrative data for `/podratcilar-ucun`. Azerbaijani only (RU/EN
 * visitors see this page in Azerbaijani). The preview project is a labelled
 * sample, not a customer or a metric.
 */

export const HERO = {
  eyebrow: 'Smetanı göndər. Təsdiqi al. Təmirə nəzarət et.',
  title: 'Təmir biznesinizi Excel və WhatsApp-dan çıxarın.',
  lead: 'Smeta hazırlayın, sifarişçidən rəqəmsal təsdiq alın, əlavə işləri yazılı razılaşdırın və layihəni foto sübutlarla təhvil verin.',
  value: 'Təhvil təmir şirkətlərinə smetanı tez hazırlamağa, sifarişçidən rəqəmsal təsdiq almağa, əlavə işləri yazılı razılaşdırmağa və hər işi foto sübutla təhvil verməyə imkan yaradır.',
  primary: 'Pulsuz smeta yarat',
  secondary: 'Necə işləyir?',
  trust: ['Kredit kartı tələb olunmur', 'İlk layihənizi dəqiqələr içində yaradın', 'Sifarişçi üçün sadə paylaşım linki'],
};

export const PREVIEW_PROJECT = {
  name: 'Yasamal, 3 otaqlı mənzil',
  area: 86,
  version: 2,
  total: 18_450,
  approvedBy: 'Leyla M.',
  approvedAt: '02.10.2026',
  planned: 18_450,
  actual: 11_920,
  change: { number: 2, title: 'Mətbəxə 4 əlavə rozetka', amount: 240 },
  photo: { stage: 'Hamam hidroizolyasiyası', count: 6 },
};

export const FLOW = [
  { title: 'Smeta', text: 'İş paketləri və qiymətlərlə ilkin smeta' },
  { title: 'Sifarişçi təsdiqi', text: 'Link ilə göndərilir, təsdiq tarixi qalır' },
  { title: 'Dəyişikliklər', text: 'Əlavə iş ayrıca məbləğ və təsdiqlə' },
  { title: 'Xərclər', text: 'Material və işçilik planla müqayisədə' },
  { title: 'Foto sübut', text: 'Əvvəl, proses və nəticə fotoları' },
  { title: 'Təhvil', text: 'Şəffaf yekun hesab və tarixçə' },
];

export const BENEFITS = [
  { icon: 'calculator', title: 'Smetanı daha tez hazırlayın', text: 'Hazır iş paketləri, qiymət strukturu və ağıllı hesablamalarla smetanı dəqiqələr içində yaradın.' },
  { icon: 'signature', title: 'Sifarişçidən yazılı təsdiq alın', text: 'Smeta və əlavə işlər paylaşım linki ilə göndərilir, təsdiq tarixçəsi bir yerdə qalır.' },
  { icon: 'changes', title: 'Əlavə işləri nəzarətdə saxlayın', text: 'Sonradan yaranan işlərin məbləğini ayrıca yaradın və sifarişçi təsdiqi olmadan işə başlamayın.' },
  { icon: 'budget', title: 'Büdcə itkisini erkən görün', text: 'Planlanan büdcəni faktiki material və işçilik xərcləri ilə müqayisə edin.' },
  { icon: 'camera', title: 'Foto ilə sübut yaradın', text: 'Hər mərhələnin əvvəl, proses və nəticə fotolarını layihəyə bağlayın.' },
  { icon: 'brand', title: 'Daha peşəkar görünün', text: 'Sifarişçiyə şirkət loqonuz, əlaqə məlumatınız və aydın smeta ilə branded təklif göndərin.' },
] as const;

export const BEFORE = [
  'Excel-də fərqli versiyalar',
  'WhatsApp-da itən razılaşmalar',
  'Şifahi əlavə işlər',
  'Qəbzlər və fotolar ayrı-ayrı yerlərdə',
  'Sifarişçinin “bu qiymət hardan çıxdı?” sualı',
  'Layihə sonunda qarışıq hesablaşma',
];

export const AFTER = [
  'Bir canlı, versiyalı smeta',
  'Rəqəmsal təsdiq tarixi',
  'Əlavə iş üçün ayrıca təsdiq',
  'Xərc, qəbz və foto bir layihədə',
  'Plan-fakt büdcə nəzarəti',
  'Şəffaf yekun təhvil',
];

export const AI_DISCLAIMER = 'AI ilkin ölçü və qiymət təklif edir. Son rəqəmləri siz yoxlayır və təsdiqləyirsiniz; Təhvil smetası hüquqi müqavilə və ya dəqiq hesablama zəmanəti deyil.';
