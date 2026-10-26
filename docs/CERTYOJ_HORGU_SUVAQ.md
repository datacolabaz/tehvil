# Çertyojdan hörgü və suvaq — 1-ci mərhələ (27.10.2026)

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

## Növbəti mərhələlər
- **2:** hər mərtəbə üçün hörgü. Tək/qoşa daş, kəsişmələrin çıxılması, mişardaşı, məhlul → sement 40 kq və qum.
- **3:** suvaq. Daxili/xarici, tərəflər, gips ayrıca.
- **4:** qiymətlər, smeta bölmələri, Excel, "PDF kimi saxla".
