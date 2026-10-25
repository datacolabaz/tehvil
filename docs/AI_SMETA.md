# İki funksiya: AI Smeta və Evimin xərcləri (25.10.2026)

## 1. Audit və qərarlar
- **Mövcud olan:** ev pasportu, foto tarixçəsi, təhvil protokolu, kirayə, rieltor, köhnə "AI smeta". Köhnə smeta əslində qayda əsaslı idi və armatur hesablamırdı.
- **Maliyyə (PR #32):** podratçı, ödəniş, avans, AI qaimə oxuma.
- **Əsas interfeys sadələşdi:**
  - Landing və girişdən sonrakı başlanğıc səhifəsində yalnız iki alət var: **AI Smeta** və **Evimin xərcləri**. "Evimin tarixçəsi" kiçik keçid kimi qalır.
  - Menyu: AI Smeta, Evimin xərcləri, Evimin tarixçəsi. Təhvil protokolu, kirayə, iş tarixçəsi və köhnə smeta **"Digər"** altındadır.
  - Heç nə silinməyib, bütün köhnə linklər işləyir.
- **Evimin xərcləri** mövcud maliyyə mühərrikinin sadə üzüdür:
  - Hər evin bir xərc jurnalı var: evin ilk layihəsi.
  - Podratçı, avans və borclar "Ətraflı" keçidindədir.
- **Xərc kateqoriyaları** promptdakı 10 kateqoriyadır.
  - Köhnə açarlar köhnə qeydlərdə etibarlı qalır, amma yenilərdə təklif edilmir.
  - Smeta müqayisəsində köhnə açarlar yenilərinə uyğunlaşdırılır.

## 2. Evimin xərcləri
- `/xercler`. Ev yoxdursa, ev və jurnal bir addımda yaradılır. Yalnız ad tələb olunur; tarix, yer və büdcə istəyə bağlıdır. Valyuta AZN-dir.
- **"Xərc əlavə et" üç yol verir:**
  - **Şəkil çək** — kamera açılır.
  - **Şəkil və ya fayl yüklə** — JPG, PNG, WebP, PDF.
  - **Əl ilə** — məbləğ, ad, kateqoriya, tarix, qeyd.
- **Qəbz:**
  - AI satıcını, tarixi (çap və əl yazısı ayrı), sətirləri və cəmləri oxuyur.
  - Zəif oxunan sahə sarı rənglə göstərilir.
  - Rəqəmlər uyğun gəlmirsə, xəbərdarlıq çıxır; məbləğ dəyişdirilmir.
  - Dublikat xəbərdarlığı var.
  - AI oxuya bilməsə, məbləği özünüz yazırsınız.
- **Yuxarıda dörd göstərici:** ümumi xərc, bu ay, büdcə, büdcədən qalan. Büdcə yoxdursa "—" göstərilir, heç nə uydurulmur.
- **Filtr:** bu gün, bu həftə, bu ay, bu il, istənilən aralıq, kateqoriya.
- **Xərcin detalı:** orijinal qəbz, qeyd, sətirlər, dəyişiklik tarixçəsi. Tarixçədə nə əvvəl idi, nə oldu və səbəb görünür. Təsdiqlənmiş xərc səbəbsiz dəyişmir.
- **Excel** (`?view=journal`, istəyə görə tarix aralığı ilə):
  - Vərəqlər: Ümumi xülasə, Bütün xərclər, Kateqoriyalar üzrə, Aylıq xərclər, Smeta və faktiki (smeta bağlıdırsa), Qəbzlər və əlavə məlumat.
  - Bütün xərclər vərəqinin sütunları: Qeyd ID, Tarix, Ev layihəsi, Xərcin adı, Kateqoriya, Miqdar, Vahid, Məbləğ, Valyuta, Satıcı, Qeyd, Qəbzə istinad.
  - Cəmlər `SUMIFS` / `COUNTIFS` düsturlarıdır.
  - Excel-dəki dəyişikliklər sayta yazılmır.

## 3. AI Smeta
- **Axın:** `/smeta-ai/yeni` → ad və növ (fərdi ev, təmir, əlavə tikili, yalnız beton/armatur, digər); sahə, mərtəbə, yer istəyə bağlı → fayllar → AI analizi (fonda) → suallar → smeta cədvəli → Excel.
- **Fayllar:**
  - PDF, JPG, PNG, WebP çertyojlar; XLSX və CSV material siyahısı.
  - **DWG, DXF, IFC hələ oxunmur.** Brauzerdə də, serverdə də aydın mesajla rədd edilir və PDF kimi yükləmək təklif olunur.
- **Xidmətlər bir-birindən ayrıdır:**
  - `drawingAi.ts` — çertyoj analizi. Claude yalnız elementləri və ölçüləri qaytarır: hər dəyər üçün əminlik və harada oxunduğu. Mümkün olmayan dəyər (məs. 999 m) etibarlı sayılmır.
  - `estimateEngine.ts` — hesablama. Təmiz funksiyalardır, AI yoxdur, unit testləri var.
  - `questionsFor` — sual mexanizmi.
  - `tableImport.ts` — Excel/CSV oxuma.
  - `estimateExport.ts` — Excel ixracı.
  - Model `ANTHROPIC_MODEL` ilə dəyişdirilir.
- **Hesablama:**
  - **Fundament:** Σ seqment × en × hündürlük − kəsişmələr × en² × hündürlük. Künclər iki dəfə sayılmır. Yoxlama: 10×8 m üzük, en 0,5, hündürlük 1 → 17 m³.
  - **Kolon, rigel, monolit döşəmə** (boşluqlar çıxılır) və **beton divar.**
  - **Rigel üçün fərziyyə:** uzunluq kolonlar arası, hündürlük plitədən aşağı götürülür. Bu açıq yazılıb.
  - **Armatur:** uzununa çubuqlar, xamutlar, plitə və divar torları; kütlə d²/162 kq/m. Üst-üstə düşmə hər standart çubuq uzunluğundan bir əlavə olunur (40d, dəyişdirilə bilər). Ankerləmə və qarmaqlar da nəzərə alınır. Nəticə yalnız istifadə olunan diametrlər üzrə, kq və ton ilə göstərilir.
  - **Qəlib:** səth m². Dikt m² və vərəq sayı ilə; vərəq ölçüsü, qalınlığı və istifadə sayı seçilir.
  - **Taxta (3×10, 5×10), yanmış məftil, katinka** yalnız istifadəçinin və ya mühəndisin norması ilə hesablanır. Norma yoxdursa, sətir "Dəqiqləşdirilməlidir" qalır.
  - **Beton ehtiyatı və armatur kəsim itkisi** ayrıca sətirlərdir, əsas miqdara əlavə edilmir.
- **Suallar:**
  - Yalnız hesablamaya təsir edən və etibarlı oxunmayan dəyərlər soruşulur: yoxdur, əminlik < 0,6, təxmini.
  - Cavab yolları:
    - variant düyməsi;
    - öz dəyəriniz;
    - **"Bilmirəm, layihədən müəyyən etməyə çalış"** — AI məhz həmin dəyəri yenidən axtarır, tapmasa sətir "Dəqiqləşdirilməlidir" qalır;
    - **"Mühəndisə soruşmaq üçün işarələ"**.
- **Statuslar:** Çertyojdan müəyyən edilib, İstifadəçi tərəfindən təsdiqlənib, Təxmini hesablanıb, Dəqiqləşdirilməlidir, Mühəndis yoxlaması tələb olunur, Mühəndisin siyahısından, Əl ilə əlavə edilib.
  - Yalnız memarlıq planı varsa, armatur həmişə "Mühəndis yoxlaması tələb olunur" olur.
- **Smeta cədvəli:**
  - Miqdarı düzəltmək olar: səbəb soruşulur, hesablanan dəyər yanında qalır.
  - Vahid qiymət, yeni sətir, sətri silmək və geri qaytarmaq mümkündür.
  - Sətir açılanda düstur, ölçülər və fərziyyələr görünür.
  - "Ölçülər və elementlər" bölməsində hər ölçünün mənbəyi var. Siz dəyişdiyiniz ölçünü AI yenidən oxuyanda dəyişmir.
- **Versiyalar:** analiz, cavablar, düzəliş və hər Excel ixracı versiya kimi saxlanılır; köhnə versiyaya baxmaq olur.
- **Excel**, 7 vərəq: Ümumi smeta, Beton hesablamaları, Armatur hesablamaları, Qəlib və taxta, Digər materiallar, Ölçülər və izah, Dəqiqləşdirilməli məsələlər.
  - Məbləğ, cəm, kq/m (`d^2/162`), kütlə və diametr üzrə yekun düsturdur.
  - Yuxarıda layihə adı, tarix və versiya yazılır.

## 4. Smeta və faktiki xərclər
- Smeta bir evin xərc jurnalına bağlanır. Müqayisə kateqoriyalar üzrədir: Smetada / Faktiki / Fərq.
  - Uyğunluq: beton → Beton və sement; armatur → Armatur və metal; qəlib və taxta → Taxta və qəlib; digər → Tikinti materialları.
- **Ustanın smetası (XLSX/CSV):**
  - Sətirlərin kateqoriyası açar sözlərlə təklif edilir.
  - Yalnız siz təsdiqlədikdən sonra müqayisəyə daxil olur.

## 5. Təhlükəsizlik
- Smeta yalnız sahibinə görünür; başqasına 404 qaytarılır. Çertyoj faylları yalnız sahibə açılır.
- Qəbzlər yalnız evi idarə edənlərə və layihənin tərəflərinə açılır.
- API açarı yalnız serverdədir.
- Yükləmələr eyni yoxlamadan keçir: fayl təzədir, başqa yerə bağlanmayıb, bu istifadəçinindir, ölçü və tip uyğundur, SHA-256 hesablanır.
- Limitlər: saatda 20 çertyoj analizi, 60 qəbz.

## 6. Testlər
- **Hesablama mühərriki:** `pnpm --filter @workspace/api-server test` — 16/16. Bunlara daxildir:
  - sadə fundament və müxtəlif seqmentlər;
  - künclərdə ikiqat sayılmama;
  - kolon, rigel, döşəmə, divar;
  - Ø8–Ø18 kütləsi və üst-üstə düşmə;
  - taxtanın sayı və m³-i; dikt sahəsi və vərəqləri;
  - çatışmayan ölçü, sual seçimi, mühəndis işarəsi;
  - düzəliş, qiymət, norma.
- **API testləri:**
  - `estimate-e2e` 55/55 — Anthropic API-ni təqlid edən test serveri ilə;
  - `books-e2e` 26/26, `finance-e2e` 80/80, `stages-e2e` 28/28;
  - regressiya: home 193, invite 35, history 23, integrity 30.
- **Brauzer `two-flow`** (telefon və desktop): landing, başlanğıc, menyu, ev yaratma, əl ilə xərc, qəbzdən xərc, detal və tarixçə, filtr, Excel, AI Smeta (DWG rədd, suallar, cədvəl, qiymət, izah, bağlama, Excel).
- **Excel faylları LibreOffice ilə yenidən hesablandı:** smeta 36 düstur, jurnal 12 düstur, xəta yoxdur.
- **Köhnə landing testləri:** `hh-flow` və `hf-flow` yeniləndi. `pt-flow`-un köhnə protokol landing yoxlamaları (4) artıq aktual deyil, çünki landing dəyişdi.

## 7. Konfiqurasiya tələb edən
- `ANTHROPIC_API_KEY` (Railway backend). Açar olmadan:
  - xərclər əl ilə işləyir;
  - smetada elementlər və ölçülər əl ilə daxil edilir, hesablama, Excel və müqayisə tam işləyir.
- Real Claude ilə real çertyoj və qəbz hələ sınanmayıb. Açar əlavə ediləndən sonra bir neçə real layihə ilə yoxlanmalıdır.

## 8. Sonrakı mərhələyə qalanlar
- DWG, DXF, IFC oxuyucu.
- PDF ixracı.
- Region üzrə qiymət bazası və təchizatçı qiymətləri.
- Səsli xərc qeydi.
- Video arxivi (Pro).
- Excel-dən sayta idxal.
- Çertyoj üzərində elementlərin vizual işarələnməsi.
- Monolit döşəmə torunun çubuq-çubuq düzülüşü (indi sahə üzrə təxminidir və belə də göstərilir).
