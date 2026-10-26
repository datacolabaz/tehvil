# Tikinti kalkulyatorları (26.10.2026)

Girişsiz açılan dörd səhifə var: `/armatur-konvertor`, `/taxta-kalkulyator`, `/horgu-kalkulyator`, `/suvaq-kalkulyator`.
- **Harada görünür:** ana səhifədə "Pulsuz tikinti kalkulyatorları" bloku, girişdən sonra menyuda "Digər", hər səhifənin yuxarısında keçidlər.
- **Hesablama:** yalnız proqram kodunda, deterministikdir (`src/lib/calc/*.ts`). AI istifadə olunmur.
- **Qiymətlər:** istifadəçi özü yazır. Layihədəki ilkin qiymət bazası təsdiqlənmədiyi üçün istifadə edilmir. Qiymət yoxdursa, "Qiymət daxil edilməyib" yazılır.

## Fayllar
- `src/lib/calc/construction.ts`: armatur, taxta, rəqəm formatı. **Dəyişməyib.**
- `src/lib/calc/masonry.ts`: hörgü (yeni).
- `src/lib/calc/plaster.ts`: suvaq (yeni).
- `src/lib/calc/materials.ts`: ortaq nəticə forması (`MaterialListItem`, `CalcRecord`) və brauzer yaddaşı.
- `src/lib/calc/masonry-plaster.test.ts`: 20 test. Bütün kalkulyator testləri: `pnpm --filter @workspace/tehvil test`, 27/27.
- `src/pages/calc/masonry-page.tsx`, `plaster-page.tsx`, `walls-kit.tsx` (qapı/pəncərə redaktoru, material siyahısı).
- `src/pages/calc/calc-pages.tsx`: ortaq hissələr yalnız ixrac olundu (səhifə çərçivəsi, xana, seçim, paylaşım, FAQ, SEO). Yuxarı menyuya 2 keçid, ana səhifə blokuna 2 kart əlavə edildi. Armatur və taxta hesabı dəyişməyib.
- `src/pages/calc/calc.css`: yeni üslublar faylın sonunda.
- `src/App.tsx`: 2 marşrut və 2 menyu bəndi. `public/sitemap.xml`: 2 ünvan.

## Hörgü
- **Materiallar:** qırmızı kərpic (250×120×65), ağ silikat kərpic (250×120×88), **mişardaşı**, qazbeton bloku (600×200×200, 3 mm yapışqan), xüsusi ölçü. Ölçülər redaktə olunur, mm və ya sm ilə.
- **Mişardaşının standart ölçüsü yoxdur.** Uzunluq, hündürlük və eni istifadəçi yazır; ölçü yazılmasa, say hesablanmır və ölçü soruşulur.
- **Düsturlar** (L, H, W materialın ölçüsü; j tikiş; T divarın qalınlığı; hamısı metrlə):
  - Ümumi sahə = uzunluq × hündürlük.
  - Boşluqlar = Σ say × en × hündürlük.
  - Xalis sahə = ümumi sahə − boşluqlar. Boşluqlar divardan böyük və ya ona bərabərdirsə, xəta verilir.
  - Xalis həcm = xalis sahə × T.
  - Bir üz üzrə say = xalis sahə / ((L + j) × (H + j)).
  - Qalınlıq boyunca cərgə sayı = (T + j) / (W + j). Bu, tam ədəddən ±0,15 fərqlənirsə, material divara "düşür".
  - Material düşürsə: say = bir üz üzrə say × cərgə.
  - Düşmürsə: istifadəçiyə xəbərdarlıq edilir, seçimi dəyişdirilmir. Say həcmə görə hesablanır: xalis sahə × (T + j) / ((L + j)(H + j)(W + j)), və "təxmini" işarələnir. Hər iki yoxlama ekranda görünür.
  - Ehtiyatla say = yuxarı yuvarlaqlaşdırılmış (say × (1 + ehtiyat / 100)).
  - Məhlul = xalis həcm − hörülən materialın həcmi (L·H·W × say). Bu, üfüqi, şaquli və daxili tikişlərin həcmidir. Material divardan qalındırsa, məhlul göstərilmir. Boşluqlu kərpic, kəsim və itki nəzərə alınmır, nəticə təxminidir.
  - Xərc = ehtiyatla say × bir ədədin qiyməti + məhlul m³ × 1 m³ qiyməti.
- **Bir neçə divar:** hər divarın öz materialı, ölçüləri və boşluqları var. Yekun hər divarın yuvarlaqlaşdırılmış sayını material və ölçü üzrə toplayır. Tam olmayan divarlar yekuna düşmür, sayı göstərilir.
- **Nümunələr:**
  - Qırmızı kərpic, 12 sm divar, 10 mm tikiş: 1 m²-ə 51,3 ədəd.
  - 5×3 m, 25 sm divar: 1 538 ədəd, 5% ehtiyatla 1 616; məhlul 0,75 m³.
  - Mişardaşı 400×200×200, 20 sm divar, xalis 13,11 m²: 160 ədəd (5% ehtiyatla).

## Suvaq
- **Hər divar üçün:** uzunluq, hündürlük, daxili və ya xarici, bir və ya hər iki tərəf, qalınlıq (15 mm), material, qapı və pəncərələr. Boşluqların yan səthləri yalnız istifadəçi istəsə və dərinliyini yazsa əlavə edilir.
- **Düsturlar:**
  - Xalis sahə = uzunluq × hündürlük − boşluqlar.
  - Faktiki sahə = xalis sahə × tərəflərin sayı + yan səthlər. Yan səthlər bir dəfə sayılır: Σ say × (2 × hündürlük + en) × dərinlik.
  - Həcm = faktiki sahə × qalınlıq / 1000.
  - Quru qarışıq = faktiki sahə × qalınlıq (mm) × sərfiyyat (kq/m²/mm).
  - Ehtiyatla = quru qarışıq × (1 + ehtiyat / 100). Kisə sayı = yuxarı yuvarlaqlaşdırılmış (ehtiyatla kütlə / kisənin çəkisi). Bu, materialın ümumi kütləsi üzrə bir dəfə hesablanır.
- **Sərfiyyat:** gips üçün 0,9, hazır sement-qum üçün 1,7 kq/m²/mm yazılıb. Hər ikisi ekranda **fərziyyə** kimi göstərilir; "Öz qarışığım" üçün sərfiyyat yazılmasa, kütlə və kisə hesablanmır.
- **Sement-qum, yerində qarışdırılır:**
  - Quru həcm = yaş həcm (ehtiyatla) × quru həcm əmsalı (1,3).
  - Sement həcmi = quru həcm / (1 + N); qum həcmi = quru həcm × N / (1 + N). Nisbət 1 : N.
  - Sementin kütləsi töküm sıxlığı ilə hesablanır (1 300 kq/m³), qumun da (1 600 kq/m³).
  - Sement 50 kq-lıq kisələrlə.
  - Bütün əmsallar ekranda fərziyyə kimi göstərilir və dəyişdirilə bilir.
- **Yekun:** daxili divarlar, xarici divarlar və hamısı ayrıca.
- **Qiymətlər:** qarışıq kisə və ya kq ilə; sement kisə ilə; qum m³ və ya ton ilə. Vahidlər qarışdırılmır.
- **Nümunə:** 15 m², 15 mm gips: 0,225 m³; 202,5 kq; 10% ehtiyatla 222,75 kq, yəni 30 kq-lıq 8 kisə və ya 25 kq-lıq 9 kisə.

## Gələcək inteqrasiya
- **Strukturlaşdırılmış nəticə:** hər iki kalkulyator nəticəni `CalcRecord` kimi qurur. Burada hesablamanın növü, tikinti mərhələsi (`masonry` / `plaster`, foto mərhələlərinin açarları ilə eyni), tarix, daxil edilən ölçülər, material siyahısı və fərziyyələr var.
- **Material siyahısı** "Evimin xərcləri" sətrinin formasındadır: ad, miqdar, vahid, vahid qiymət, kateqoriya. Gələcəkdə "Smetaya / xərclərə əlavə et" və ya "evin mərhələsinə bağla" bunu yenidən hesablamadan qəbul edə bilər.
- **Hazırda** nəticə yalnız istifadəçinin brauzerində saxlanılır ("Təmizlə" ilə silinir). Verilənlər bazasına yazılmır, yeni cədvəl yaradılmayıb.

## Testlər
- **Unit:** 27/27. Armatur və taxta 7, hörgü 12, suvaq 8.
- **Brauzer, telefon 390 px** (`calc2-flow`): 49/49. Yoxlananlar:
  - 5 material, mişardaşı ölçüsüz say göstərmir və ölçü soruşur;
  - mm/sm çevirmə, qapı çıxılması, tikiş dəyişikliyi, qalınlıq uyğunsuzluğu xəbərdarlığı;
  - bir neçə divar, silmə, qiymət yoxdursa və varsa;
  - mənfi və sıfır ölçünün rədd edilməsi, böyük boşluğun rədd edilməsi;
  - yeniləmədən sonra məlumatın qalması, "Təmizlə";
  - suvaqda 15 və 20 mm, bir və iki tərəf, yan səthlər, daxili və xarici, sement-qum nisbəti, 25 və 30 kq kisələr;
  - səhifənin telefon ekranına sığması.
- **Mövcud kalkulyatorlar** (`calc-flow`, 26 yoxlama) dəyişmədən keçir. Ana səhifə və xərclər testi (`two-flow`) keçir.
- **Build:** `vite build` uğurlu, `tsc --noEmit` xətasız. Layihədə ayrıca lint əmri yoxdur.
