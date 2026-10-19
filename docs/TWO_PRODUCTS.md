# Təhvil.az — iki məhsul: Evin texniki pasportu və AI Smeta

Plan istifadəçi tərəfindən təsdiqləndikdən sonra mərhələlərlə icra olundu; hər mərhələ ayrıca test edildi.

## Hazır / qismən hazır / xarici servis tələb edir

| Funksiya | Vəziyyət | Qeyd |
|---|---|---|
| **A. Evin texniki pasportu** | | |
| Ev, otaqlar, sistemlər, gizli xətlər (foto üzərində işarə), materiallar, avadanlıq, işlər, foto/video/qəbz/sənəd | ✅ Hazır | Əvvəlki mərhələlərdən; dəyişdirilmədən saxlanıldı |
| “Hazırda diqqət tələb edənlər” | ✅ Hazır | Həll olunmamış problemlər, “təmir lazımdır” otaqlar, düzəliş istənən / planlaşdırılan işlər, vaxtı keçmiş xidmət, bitən zəmanət. Yalnız daxil edilmiş qeydlərdən yaranır — texniki yoxlama deyil |
| Son dəyişiklik: nə vaxt, kim, nə | ✅ Hazır | Dəyişikliklər jurnalından |
| Bütün ev üzrə axtarış (otaq, sistem, il, avadanlıq, sənəd) | ✅ Hazır | |
| Məlumat mənbəyi (ev sahibi, usta, podratçı, yoxlayıcı) | ✅ Hazır | “Mütəxəssis” sözü işlədilmir — Təhvil.az peşəkarlığı yoxlamır |
| **B1. Elan üzrə bazar dəyəri** | | |
| Linkdən oxuma (Bina.az, Tap.az, Yeniemlak.az və b.) | ✅ Hazır | Yalnız göstərilən bir səhifə; robots.txt-ə əməl olunur; `VALUATION_LINK_FETCH=off` ilə söndürülür |
| Link oxunmayanda mətn və ya əl ilə daxiletmə | ✅ Hazır | |
| Hesablamadan əvvəl düzəliş | ✅ Hazır | Avtomatik oxunan sahələr işarələnir |
| Müqayisəli analiz | 🟡 Qismən | Real elanlarla: istifadəçinin əlavə etdiyi və Təhvil bazasındakı (son 180 gün): server tərəfindən linkdən oxunan və dəyişdirilməyən, və ya istifadəçinin portal linki ilə köçürdüyü — “istifadəçi köçürüb” etiketi, hər elan bir dəfə, ağlabatan qiymət/sahə, gündə 30 limit, digərlərindən 2 dəfədən çox fərqlənən istifadə olunmur. Baza boş başlayır → ilk vaxtlar tez-tez “kifayət qədər məlumat yoxdur” |
| Nəticə: aralıq, mərkəzi təxmin, AZN/m², elanlar (linklə), amillər, mənbə və tarix, etibarlılıq, çatışmayanlar, fərziyyələr | ✅ Hazır | 3-dən az oxşar elan → rəqəm verilmir |
| Faktiki satış qiymətləri | ⛔ Xarici məlumat lazımdır | Açıq mənbə yoxdur — yalnız elan qiymətləri, açıq etiketlə |
| **B2. Layihədən tikinti smetası** | | |
| PDF | 🟡 Qismən | Mətn qatından sahə, miqyas, mərtəbə, hündürlük, otaq sahələri (səhifə və kontekstlə). Vektor xətlər və skan oxunmur — açıq yazılır |
| JPG/PNG | 🟡 Qismən | Yüklənir, ölçü oxunmur (görüntü tanıma modeli lazımdır) |
| XLSX/CSV | ✅ Hazır | İş həcmləri və qiymətlər; hər sətrin mənbəyi “fayl, sətir N” |
| DWG/DXF, IFC/RVT | ⛔ Kitabxana/lisenziya lazımdır | Aydın imtina və alternativ |
| 13 bölmə, formulalar, vahid, miqdar, məbləğ, mənbə, etibarlılıq | ✅ Hazır | Ölçü çatmayanda miqdar boş qalır |
| Vahid qiymətlər | ⛔ Qiymət bazası yoxdur | Yalnız istifadəçi/podratçı və ya cədvəldən; uydurulmur |
| İqtisadi / orta / premium; aşağı-əsas-yüksək ssenari | ✅ Hazır | Yalnız müvafiq qiymət daxil edildikdə; əks halda “orta” qiymət istifadə olunur və göstərilir |
| Torpaq, layihə, qoşulma və s. | ✅ Hazır | Ayrıca bölmə, tikinti büdcəsinə daxil edilmir |
| Excel / PDF ixrac | ✅ Hazır | PDF brauzerin çapı ilə |
| **C. Ana səhifə** | ✅ Hazır | Yalnız iki xidmət ön planda, brifdəki başlıq və düymələr; nümunələr “Demo” etiketli. Rus/ingilis dilində köhnə səhifə qalır |

## Mövcud funksiyalarda düzəldilənlər (Mərhələ 0)

AI Smeta-da (podratçı təmir smetası) saxta nəticələr çıxarıldı:
- “AI çertyoju analiz edir” — hər fayla eyni nümunə ölçüləri qaytarırdı → indi PDF mətni həqiqətən oxunur, şəkil/skan üçün “oxunmur”.
- “Qəbz oxundu” — məbləği fayl ölçüsündən uydururdu → silindi, fayl sübut kimi əlavə olunur.
- “Qiyməti yenilə” — təsadüfi “bazar qiyməti” → silindi.
- Kataloq qiymətləri “Bazar qiymətləri, Bakı” və bugünkü tarixlə göstərilirdi → “Təhvil-in ilkin qiymət cədvəli, 06.10.2026, yoxlanmayıb”.
- Keyfiyyət ssenarilərinin sabit əmsalları açıq yazılır; köməkçi “qaydalara əsaslanır” kimi işarələnib.

Testlərin tapdığı xətalar: elan mətnində “Mərtəbə: 7/16 … 185 000 AZN” qiyməti 16 185 000 kimi oxunurdu (Realtor importunda da) — düzəldildi; cədvəldə “İşçilik” sütunu böyük “İ” səbəbindən tanınmırdı — düzəldildi.

## Migration (yalnız əlavə)

Yeni cədvəllər: `listing_snapshots`, `valuations`, `construction_estimates`. Mövcud cədvəllərə toxunulmayıb. Backend start zamanı sxemi avtomatik tətbiq edir (dağıdıcı deyil).

## Testlər

| Test | Nəticə |
|---|---|
| Ev pasportu API | 193/193 |
| Bazar dəyəri + tikinti smetası API | 33/33 (link, robots qadağası, dəstəklənməyən sayt, 404, mətn, az müqayisə, hesablama riyaziyyatı, USD çevirmə, hovuz qaydaları, gizlilik, böyük faylın rəddi) |
| Realtor (təmiz baza) | ALL PASSED |
| Brauzer: Mərhələ 0 | 9/9 |
| Brauzer: bazar dəyəri | 20/20 |
| Brauzer: tikinti smetası | 32/32 (6 format, formulalar, cəmlər, ssenari, saxlama, Excel, icazə) |
| Brauzer: ana səhifə + pasport | 20/20 |
| Brauzer: əvvəlki axınlar | 63/63 + 49/49 |
| Köhnə səhifələr | açılır, JS xətası yoxdur |
| `pnpm run build` | uğurlu |

## Riskler və açıq məsələlər

- Elan saytlarının istifadə şərtləri hüquqi yoxlama tələb edir; sayt bloklasa — mətn yapışdırma.
- Müqayisə bazası istifadə ilə böyüyür; əvvəlcə etibarlılıq aşağı olacaq.
- Tikinti formulaları ilkin hesablamadır, konstruktiv hesabı əvəz etmir.
- Elan və smeta faylları serverdə saxlanılmır (yalnız çıxarılan məlumat və fayl adı).
