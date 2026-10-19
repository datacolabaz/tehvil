# Ev sahibi üçün təmir smetası və qiymət bazası (20.10.2026)

## Nə edir
`/ai-smeta/temir` — mənzilin vəziyyəti, təmirin həcmi, material səviyyəsi, otaqlar (sahə və ya uzunluq × en, pəncərə, döşəmə və tavan növü) və işlər seçilir. Nəticə:
- bölmə → iş → material/işçilik/xidmət mövqeləri; hər birində miqdar, necə hesablandığı, vahid qiymət (aşağı–yuxarı), məbləğ və qiymətin vəziyyəti;
- material miqdarı istehsalçı normaları ilə (Knauf Rotband, Ceresit CM 11 / CT 17 / CN 68 / CE 40, Caparol) — linklərlə; mənbəsi tapılmayan normalar “yoxlanmalı” kimi işarələnir;
- kisə/qab sayı yuxarı yuvarlaqlaşdırılır; lift yoxdursa mərtəbəyə qaldırma çəkisi hesablanır;
- ehtiyat faizi, 1 m² qiyməti, bir Bakı şirkətinin açıq paket qiyməti ilə müqayisə (mənbə linki ilə);
- qiyməti olmayan mövqe “qiymət yoxdur” qalır və cəmə daxil edilmir;
- saxlama, Excel, çap/PDF.

## Qiymət bazası
`/ai-smeta/qiymetler` — açıq: hər mövqenin ekonom/standart/premium üzrə aşağı/orta/yuxarı qiyməti, mənbələri və tarixləri.
- Cədvəl: `price_quotes` (mövqe kodu, səviyyə, qiymət, mənbə növü/adı/linki, tarix, aktiv). Mövqelərin siyahısı: `artifacts/api-server/src/lib/prices.ts`.
- Yoxlanmış qiymət (təchizatçı, podratçı, açıq mənbə) varsa, ilkin cədvəl istifadə olunmur. Səviyyənin öz qiyməti yoxdursa “any”, sonra “standart” götürülür və göstərilir. 60 gündən köhnə qiymət “köhnəlib”.
- İlkin cədvəl (06.10.2026, yoxlanmayıb) backend ilk dəfə açılanda bir dəfə yüklənir.
- Administrator: `PRICE_ADMIN_EMAILS` (təsdiqlənmiş e-poçt, vergüllə) və ya `PRICE_ADMIN_USER_IDS` (Clerk ID). Səhifədə tək-tək əlavə, CSV idxalı (şablon yüklənir), qiyməti geri götürmə (tarixçədə qalır).

## Testlər
Mühərrik vahid testləri 22/22 · qiymət və smeta API 35/35 · brauzer (telefon + kompüter, administrator) OK · köhnə axınlar OK · build uğurlu.

## Açıq məsələlər
- Təchizatçı qiymətləri daxil edilməyib: Bakı mağazalarının açıq onlayn qiymət kataloqu tapılmadı (robots qadağası və ya ölçüsüz elanlar). Komanda CSV şablonu ilə doldurmalıdır.
- Astar, fuqa, hidroizolyasiya, özüyayılan qarışıq, mərtəbəyə qaldırma və s. üçün hələ heç bir qiymət yoxdur.
- Növbəti mərhələlər: podratçı təklifinin bazayla yoxlanması; çertyoj/şəkildən ölçülərin süni intellektlə oxunması (API açarı lazımdır).
