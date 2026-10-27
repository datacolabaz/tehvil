# Çertyojdan hörgü və suvaq (1-ci və 2-ci mərhələ, 27.10.2026)

AI Smeta-da yeni növ var: **"Hörgü və suvaq (çertyojdan)"** (`kind = masonry_plaster`). 1-ci mərhələdə çertyoj yüklənir, səhifələr seçilir, AI ölçüləri oxuyur və istifadəçi hər mərtəbəni yoxlayıb təsdiqləyir. Hesablama (hörgü, suvaq, qiymət, Excel/PDF) növbəti mərhələlərdədir.

## Axın
1. **Smeta yarat:** "Nə hesablayırıq?" → "Hörgü və suvaq (çertyojdan)", PDF və ya şəkil. Düymə "Yarat və səhifələri seç" olur. Avtomatik oxuma başlamır.
2. **Səhifə seçimi:** PDF-in səhifələri kiçik şəkillər kimi göstərilir (brauzerdə, pdf.js). Ən çox 12 səhifə seçilir. AI-yə **yalnız seçilən səhifələr** göndərilir (serverdə `pdf-lib` ilə ayrılır). 12 səhifədən çox PDF səhifə seçilmədən oxunmur, istifadəçidən seçim istənilir.
3. **AI oxuması:** mərtəbələr, hər mərtəbənin hündürlüyü (döşəmədən döşəməyə) və plitənin qalınlığı; divarlar (xarici, daxili, arakəsmə), uzunluq, qalınlıq, kəsişmələrin sayı; qapı və pəncərələr (say, en, hündürlük). AI **heç nə hesablamır**, yalnız oxuyur.
4. **Yoxlama:** hər dəyərin yanında mənbəyi yazılır:
   - **Çertyojdan:** ölçü çertyojda yazılıb. Səhifə və yeri göstərilir.
   - **Təxmini — yoxlayın:** AI-nin əminliyi 0,6-dan aşağıdır və ya ölçünü miqyasla ölçüb. "Düzdür" düyməsi ilə qəbul edilir və ya düzəldilir.
   - **Yoxdur — yazın:** oxunmayıb və ya mümkün deyil (məs. 999 m divar).
   - **Siz yazmısınız:** istifadəçi dəyişib və ya qəbul edib.
5. **Təsdiq:** mərtəbə yalnız yoxlanmalı ölçü qalmayanda təsdiqlənir. Server də bunu yoxlayır (400). Hamısı təsdiqlənənə qədər "Nəticə hələ yekun deyil" yazılır və status `questions` qalır. Hamısı təsdiqlənəndə status `ready` olur və versiya (`walls-ok`) saxlanılır. "Təsdiqi geri al" ilə geri qaytarmaq olar.

## Qaydalar
- **Mümkün aralıqlar:**
  - mərtəbə 2–6 m, plitə 0–0,5 m;
  - divar 0,2–100 m, qalınlıq 5–100 sm, kəsişmə 0–20;
  - boşluq: say 1–50, en 0,3–6 m, hündürlük 0,3–4 m.
  
  Bu aralıqdan kənar dəyər "yoxdur" sayılır.
- **Həndəsə yoxlaması:** hörgü hündürlüyü (mərtəbə − plitə) 1,5 m-dən böyük olmalıdır. Boşluqlar divarın sahəsindən böyük ola bilməz.
- **İstifadəçinin dəyərləri:** müştəri tərəfi dəyəri "çertyojdan" kimi göndərə bilməz. Dəyişmiş hər dəyər "Siz yazmısınız" olur.
- **Yenidən oxuma:** istifadəçinin yazdığı dəyərlər, əl ilə əlavə edilən divar və mərtəbələr saxlanılır. Mərtəbənin təsdiqi yalnız orada nəsə dəyişəndə düşür.
- **Sement:** kisə standart olaraq **40 kq**-dır, mövcud suvaq kalkulyatorunda da.

## Kod
- **API:**
  - `src/lib/wallsModel.ts`: model, sanitizasiya, birləşdirmə, yoxlama, redaktə;
  - `src/lib/wallsAi.ts`: AI aləti `record_walls`, səhifə ayırma;
  - `routes/aiEstimates.ts`: `PUT /ai-estimates/:id/pages`, `PUT /ai-estimates/:id/walls`, analiz.
- **Veb:** `src/pages/estimate/walls-review.tsx`, `walls.css`.
- **DB:** sxem dəyişməyib. Məlumat `ai_estimates.doc.walls` içindədir.

## Testlər
- **Unit:** API 25/25 (6 yeni), kalkulyator 27/27.
- **API e2e** (`walls-e2e`): 29/29.
- **Brauzer** (`walls-flow`, 1280 və 390 px): 48/48.
- **Reqressiya:** `estimate-e2e` 55/55, `two-flow`, `calc2-flow`.
- **Qeyd:** AI cavabı test serverində saxtalaşdırılıb. Real Gemini ilə yoxlama canlı mühitdə aparılmalıdır.

## 2-ci mərhələ: hörgü hesabı
Ölçülərin altında "Hörgü hesabı" bölməsi var. Hesablama yalnız **təsdiqlənmiş mərtəbələr** üçün aparılır. Bütün mərtəbələr təsdiqlənməyibsə və hər divar hesablanmayıbsa, nəticə "İlkin nəticə — yekun deyil" kimi göstərilir. Hesablamanı server aparır (`src/lib/wallsCalc.ts`), AI iştirak etmir. Eyni giriş həmişə eyni nəticəni verir.

**İstifadəçi nəyi seçir:**
- Bir neçə hörgü materialı: mişardaşı, qırmızı və silikat kərpic, beton blok, qazbeton və ya digər. Hər birinin ölçüsü (mm), üfüqi və şaquli tikişi, hörgü üsulu (tək daş, qoşa daş və ya qalınlığa görə) və ehtiyatı ayrıca yazılır. **Mişardaşının standart ölçüsü yoxdur**, ölçü yazılmayana qədər sayı hesablanmır.
- Hər divar növü (xarici, daxili, arakəsmə) üçün material. Ayrıca divar üçün başqa material seçmək olar.
- Məhlul:
  - sement : qum = 1:3, 1:4 (standart) və ya 1:5;
  - məhlulun həcmi tikişlərdən hesablanır və ya "1 m³ hörgüyə məhlul" göstəricisi ilə; göstərici seçilib yazılmayıbsa, məhlul hesablanmır;
  - sement kisəsi 40 kq, ehtiyat 5%;
  - texniki əmsallar (quru həcm 1,3; sementin sıxlığı 1300, qumunku 1600 kq/m³) fərziyyə kimi göstərilir və dəyişdirilə bilir.

**Düsturlar** (metrlə):
- Hörgü hündürlüyü: H = mərtəbə hündürlüyü − plitə.
- Künclər:
  - Xarici divarın uzunluğu fasadın xarici ölçüsüdür. Hər küncdə (ən çox 2) divarın qalınlığının yarısı çıxılır: L_eff = L − künc × T / 2. Belə olanda küncdəki hissə iki divarda sayılmır.
  - Daxili divar və arakəsmədə uzunluq divarlar arasındakı xalis məsafədir, heç nə çıxılmır.
- Sahə və həcm:
  - Ümumi sahə = L_eff × H. Boşluqlar = Σ say × en × hündürlük.
  - Xalis sahə = ümumi sahə − boşluqlar. Həcm = xalis sahə × T.
- Cərgə sayı (divarın qalınlığı boyunca): tək daşda 1, qoşa daşda 2. "Qalınlığa görə" seçiləndə = round((T + jv) / (W + jv)). Tam ədəddən ±0,15-dən çox fərqlənirsə, xəbərdarlıq verilir.
- Hörgünün qalınlığı Tm = cərgə × W + (cərgə − 1) × jv. Çertyojdakı qalınlıqdan 3 sm-dən çox fərqlənirsə, xəbərdarlıq verilir. İstifadəçinin seçimi dəyişdirilmir.
- Say = xalis sahə / ((L + jv)(H + jh)) × cərgə. Mərtəbədə hər material üçün say ehtiyatla birlikdə **bir dəfə** yuxarı yuvarlaqlaşdırılır.
- Məhlul (tikişlərdən) = xalis sahə × Tm − say × L·H·W.
- Sement və qum:
  - quru həcm = məhlul × (1 + ehtiyat) × 1,3;
  - sement = quru / (1 + N) × 1300 kq → 40 kq-lıq kisə (yuxarı yuvarlaqlaşdırılır);
  - qum = quru × N / (1 + N) m³, tonla da göstərilir.
- Qazbeton yapışqanla hörülür: tikiş həcmi "yapışqan" kimi göstərilir, onun üçün sement və qum hesablanmır.
- Ev üzrə yekun cəmdən bir dəfə yuvarlaqlaşdırılır, ona görə mərtəbələrin cəmindən bir az az ola bilər.

**Nəticə** hər mərtəbə üçün göstərilir:
- divar növü üzrə ümumi, boşluq və xalis sahə, həcm;
- material üzrə say (ehtiyatsız və ehtiyatla);
- məhlul, sement kisəsi, qum.

Hər divarın hesabı açılıb baxıla bilir ("L 10 m × H 3 m − boşluqlar …"), xəbərdarlıqları ilə birlikdə. Mərtəbələrin cəmi "Bütün ev" bölməsində verilir.

**API:** `PUT /ai-estimates/:id/masonry {masonry}`. Parametrlər `ai_estimates.doc.walls.masonry` içində saxlanılır, nəticə hər oxunuşda yenidən hesablanır (`walls.masonryCalc`). Divarlar düzəldiləndə və çertyoj yenidən oxunanda parametrlər saxlanılır.

**Testlər (2-ci mərhələ):**
- Unit: 9 yeni test, əllə hesablanmış nümunələrlə. Məsələn, 10 m xarici divar, 25 sm, 2 künc, 1,5×1,5 m pəncərə, qoşa kərpic: xalis 27 m², 2 769,2 ədəd, ehtiyatla 2 908, məhlul 1,35 m³, 12 kisə sement. API unit testləri cəmi 34/34.
- `masonry-e2e`: 26/26. Brauzer (`masonry-flow`, 1280 və 390 px): 46/46.

## Növbəti mərhələlər
- **3:** suvaq. Daxili/xarici, tərəflər, gips ayrıca.
- **4:** qiymətlər, smeta bölmələri, Excel, "PDF kimi saxla".
