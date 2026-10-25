# Gündəlik qeyd: material, iş və ödənişlər (25.10.2026)

## Nə dəyişdi
- **"İş əlavə et" pəncərəsinin adı "Gündəlik qeyd əlavə et" oldu** (`pages/home/quick-work.tsx`). Köhnə sahələrin hamısı qalır: qeyd tarixi, görülən iş, qısa təsvir, foto/video/fayl, kamera, əlavə məlumat (otaq, növ, usta, zəmanət).
- **Forma "Material və işlər" bölməsi əlavə olundu.** Bu bölmə yalnız evin sahibinə və üzvünə görünür. Hər sətirdə bunlar var:
  - ad, kateqoriya, miqdar, vahid;
  - vahid qiymət, ümumi məbləğ;
  - qeyd və "Ödənilib / Ödənilməyib".
- **Məbləğ:** miqdar və qiymət yazılıbsa, məbləğ miqdar × qiymət kimi özü hesablanır. Miqdar bilinmirsə, ümumi məbləği əl ilə yazmaq olar. Günün cəmi, material və işçilik, ödənilməmiş hissə canlı yenilənir.
- **"Evimin xərcləri" səhifəsində üç əsas düymə var:** "Qaimə çək və ya yüklə", "Əl ilə xərc əlavə et", "Görülən işi qeyd et". Üçü də eyni formu açır.
- **Kateqoriyalar:**
  - Material: Beton və sement, Armatur və metal, Taxta və qəlib, Elektrik materialları, Santexnika materialları, Digər materiallar.
  - İş və ödənişlər: Usta və fəhlə haqqı, Texnika və nəqliyyat, Digər işlər (yeni), Layihələndirmə, Digər xərclər.
  - Köhnə açarlar köhnə qeydlərdə işləməyə davam edir.

## Qaimə
1. Şəkil və ya PDF yüklənir. Fayl qeydə bağlanır, SHA-256 hesablanır.
2. AI qaimədən bunları oxuyur: satıcı, tarix, sətirlər (ad, miqdar, vahid, qiymət, cəm, kateqoriya təklifi), endirim, vergi, yekun.
3. **Heç nə avtomatik xərc olmur.** Sətirlər yoxlama üçün göstərilir. İstifadəçi düzəldir, sətir əlavə edib silir, kateqoriyanı dəyişir və **"Xərclərə əlavə et"** düyməsini basır.
4. **Tarix:** qaimədəki tarix seçilmiş tarixdən fərqlidirsə, iki düymə çıxır: "Qaimənin tarixi" və ya "Seçdiyim tarix". Seçim edilməyincə yadda saxlamaq olmur, tarix səssizcə dəyişdirilmir.
5. **Oxunmayan məbləğ uydurulmur.** Sətir qırmızı göstərilir və "məbləği yazın" deyilir.
   - Zəif oxunan sətir sarı rənglə göstərilir.
   - Qaimədəki sətir cəmi miqdar × qiymətlə uyğun gəlmirsə, xəbərdarlıq çıxır.
   - Qaimənin yekunu sətirlərin cəmi ilə uyğun gəlmirsə, xəbərdarlıq çıxır, məbləğ dəyişdirilmir.
6. **AI qoşulmayıbsa** (`AI_API_KEY` yoxdur) bu açıq yazılır. Qaimənin şəkli yenə qeydə bağlanır, sətirləri istifadəçi özü yazır. Saxta oxuma yoxdur.

## Verilənlər bazası (yalnız əlavələr)
- `finance_expense_items.category`, `finance_expense_items.note`: hər sətrin öz kateqoriyası və qeydi.
- `finance_expenses.entry_id`: bir gündəlik qeydin xərcləri. Ödənilən və ödənilməyən sətirlər iki ayrı xərc olur.
- `finance_expenses.work_id`: həmin gün görülən iş (`work_records`). **İş qeydinin öz məbləği boş qalır**, pul yalnız jurnalda saxlanır və iki dəfə sayılmır.
- **API:**
  - `POST /home-projects/:id/daily-entries`: hamısı bir tranzaksiyada. Miqdar × qiymət serverdə yenidən hesablanır, eyni sorğu iki dəfə saxlanmır, qaimə ikinci dəfə istifadə olunmur, başqa evin işi bağlanmır.
  - `POST /home-projects/:id/expenses/:id/mark-paid`: qalan məbləği ödəniş kimi yazır.
- **Kateqoriya cəmləri sətirlər üzrə hesablanır** (`expenseSlices`). Endirim, vergi və ya sətirsiz xərc xərcin öz kateqoriyasına yazılır. Bölünmüş hissələrin cəmi həmişə xərcin yekununa bərabərdir.

## Ödənilib / Ödənilməyib
- "Ödənilib" sətirləri üçün ödəniş qeydi yaranır.
- "Ödənilməyib" sətirləri borc kimi görünür: maliyyə səhifəsində borc, xərc səhifəsində **"Ödənilməyib"** rəqəmi, filtr və xərcin detalında **"Ödənildi kimi qeyd et"**.
- Ödənilmiş xərcin məbləği sonradan artırılırsa, fərq "Qismən ödənilib" kimi görünür.

## Excel (`Evimin xərcləri` → Excel)
- **Bütün xərclər:** hər material və iş sətri ayrı sətirdir.
  - Sütunlar: Tarix, Ev layihəsi, Qeyd ID-si, Məhsul və ya iş, Kateqoriya, Miqdar, Vahid, Vahid qiymət, Ümumi məbləğ, Ödəniş statusu, Satıcı, Qeyd, Qaimə və ya fayl identifikatoru.
  - Köməkçi sütunlar: Ay, Qeydin statusu, Qrup.
  - Ümumi məbləğ `=ROUND(F*H;2)` düsturudur. Endirim və vergi ayrıca düzəliş sətridir.
- **Günlər üzrə, Aylar üzrə, Kateqoriyalar üzrə xərclər:** Material, Usta və işlər, Digər, Cəmi, O cümlədən ödənilməyib. Hamısı Bütün xərclər vərəqi üzərində `SUMIFS` düsturlarıdır.
- **Ümumi xülasə:** ümumi xərc, material, işçilik, digər, ödənilməyib, büdcə, qalan.

## Testlər
- **API `daily-e2e` (37/37):**
  - üç məhsul əl ilə;
  - server miqdar × qiyməti yoxlayır, məbləğsiz sətir rədd edilir;
  - miqdar dəyişir, yekun yenilənir;
  - qaimə → AI → yoxlama → təsdiq: ikinci dəfə olmur, təsdiqdən əvvəl heç nə yazılmır;
  - eyni gün material və işçilik, işə bağlanır, işin öz məbləği yoxdur;
  - ödənilməmiş xərc borcda görünür, sonra ödənilir;
  - başqa hesab qeyd edə bilmir;
  - Excel: sətirlər, cəmlər, düsturlar, tarix filtri.
- **Brauzer `daily-flow`** (telefon, 8 ssenari və ev səhifəsi): hamısı keçir.
- **Regressiya:** finance 80, books 26, estimate 55, stages 28, home 193, history 23, integrity 30, invite 35, unit 19. Brauzer: hf, hh, fn, fi, two-flow.
- **Excel faylları LibreOffice ilə yenidən hesablandı:** 105 və 79 düstur, xəta yoxdur.
