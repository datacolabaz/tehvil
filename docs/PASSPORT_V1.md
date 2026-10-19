# Ev pasportu — 1-ci versiya

Prioritet (sahibin qərarı): **ev pasportu, gizli kommunikasiyaların foto arxivi, təmir tarixçəsi, satış üçün paylaşım.**
Büdcə və texniki xidmət mövcud modullar üzərində əlavə olundu. Heç yerdə rəsmi sertifikat və ya keyfiyyət zəmanəti iddiası yoxdur.
Bu versiya `feature/home-first` (PR #9) üzərində qurulub.

## 1. Artıq mövcud olanlar (dəyişdirilmədən istifadə olundu)

| Funksiya | Harada |
|---|---|
| Ev, otaq, iş, foto/video/PDF, dəyişikliklər jurnalı | `homes`, `home_rooms`, `work_records`, `home_media`, `home_audit` |
| Gizli xətlər: foto üzərində xətt (polyline), mənbə, otaq, iş, yoxlama | `infrastructure_items` (points, source, verified_at) |
| Qüsur → düzəliş → yoxlama qeydləri | `work_notes` (kind: defect, fix, inspection) |
| Avadanlıq, quraşdırma, zəmanət, servis işləri | `equipment` + `work_records.equipment_id` |
| Seçilmiş məlumatla, müddətli, ləğv olunan link; QR | `home_shares` (token yalnız hash kimi saxlanır) |
| Büdcə: smeta, xərc jurnalı, qəbzlər, əlavə işlər, ödəniş mərhələləri | AI Smeta modulu (`smeta_*` cədvəlləri) |
| Podratçının konkret işə dəvət olunması | `work_participants`, dəvət linkləri |

## 2. Əlavə olunanlar

- **Ana səhifə (Azərbaycan dili):**
  - Header: Xidmətlər, Necə işləyir, Evini sat, Podratçılar, Daxil ol, Qeydiyyat; mobil menyu.
  - Hero: "Evinizin bütün tarixçəsi bir yerdə."
  - 7 xidmət kartı: hər birində **"İşləyir"** və ya **"Hazırlanır"** statusu.
  - "Niyə lazımdır?", "Pasportlu ev" bloku (zəmanət olmadığı yazılıb), təmir zamanı 5 addım.
  - 5 auditoriya ssenarisi, "Nümunə · real ev deyil" etiketli pasport görünüşü, FAQ (təhlükəsizlik, yaratma, paylaşım, yoxlama, qiymət), son CTA, footer.
  - Rus və ingilis dilində köhnə ana səhifə qalıb.
- **Pasport kartı** (evin "Ümumi məlumat" səhifəsində, `GET /homes/:id/passport`):
  - 13 bölmə: ümumi məlumat, otaqlar, təmir tarixçəsi, foto arxivi, elektrik, su/kanalizasiya, istilik/qaz/ventilyasiya, sayğac/internet, materiallar, avadanlıq, zəmanət, sənədlər, texniki xidmət.
  - Hər bölmə ya qeyd sayını, ya da **"Məlumat yoxdur"** göstərir.
  - Faiz = doldurulmuş bölmə / bütün bölmə. "Keyfiyyət qiyməti deyil" yazılıb.
  - Mənbələr: ev sahibi daxil edib, podratçı daxil edib, sənəd əlavə olunub, yoxlanılıb.
  - Son dəyişiklik tarixi.
- **Naməlum faktlar:** sahə, otaq sayı, mərtəbə və tikinti ili boşdursa, "Məlumat yoxdur" görünür; sistem heç nə uydurmur.
- **Gizli kommunikasiyalar:**
  - Axtarış: başlıq, qeyd, otaq, iş və növ üzrə.
  - Hər qeyddə mənbə və tarix göstərilir.
  - İş formasında elektrik, santexnika və istilik seçiləndə "suvaqdan əvvəl foto çəkin" xatırlatması çıxır.
- **Satış üçün paylaşım:**
  - "Satış üçün (alıcıya)" hazır seçimi: görülmüş işlər, fotolar, xətlər, avadanlıq.
  - **Ünvan susmaya görə gizlidir.** Sənədlər bir-bir seçilir: yalnız seçilən sənəd həmin linklə açılır, başqa linklə açılmır, link bağlananda da açılmır.
  - Alıcı səhifəsində:
    - məqsəd və son yenilənmə vaxtı;
    - zəmanət olmadığı barədə qeyd;
    - hər işdə kim daxil edib, "Sənəd əlavə olunub" nişanı, qüsur → düzəliş tarixçəsi;
    - avadanlığın son və növbəti xidməti;
    - sənədlər;
    - **"Çap et / PDF kimi saxla"** düyməsi: brauzerin çapı ilə, real məlumatdan; çapda düymələr gizlənir.
  - Xərc, telefonlar və servis əlaqəsi heç vaxt göstərilmir.
- **Texniki xidmət:**
  - Avadanlıqda növbəti xidmət tarixi və servis şirkəti; son xidmət tarixi servis işlərindən hesablanır.
  - Xatırlatmalar (`GET /me/reminders`): 30 gün içində və ya vaxtı keçmiş xidmət, 60 gün içində bitən zəmanət. Evdə, "Bildirişlər"də və zəngin sayında görünür.
  - **Yalnız saytda**: SMS, WhatsApp və e-poçt göndərilmir və bu, ekranda yazılıb.
- **Xərclər** (`GET /homes/:id/costs`, yalnız ev üzvləri):
  - İşlərdəki faktiki xərc valyuta və kateqoriya üzrə cəmlənir, kateqoriya qrafiki var.
  - Evə bağlı smetanın təxmini cəmi və xərc jurnalı ayrıca göstərilir, faktiki xərcə qatılmır.
  - Məbləği yazılmamış işlərin sayı göstərilir. CSV ixrac var.
- **Texniki yoxlama, tikinti şirkətləri üçün təhvil:** sifariş yoxdur. **"Marağınızı bildirin"** forması `service_interests` cədvəlinə yazır (`POST /service-interests`); heç nə sifariş edilmir və ödəniş alınmır.
- **Dürüst etiketlər:**
  - Əvvəl "Mütəxəssis təsdiqləyib" yazılırdı. İndi "Yoxlanılıb", "Yoxlama qeydi var" yazılır.
  - Səbəb: Təhvil.az yoxlayan şəxsin peşəkarlığını təsdiqləmir. Yoxlamanı ev sahibinin "Redaktə edə bilər" girişi verdiyi şəxs edir.
  - Paylaşım səviyyəsi "təsdiqlənmiş işlər" yox, "görülmüş işlər" adlanır.

## 3. Migration (yalnız əlavə)

```
equipment.next_service_at   date  NULL
equipment.service_contact   text  DEFAULT ''
service_interests           yeni cədvəl (user_id, kind, home_id → homes ON DELETE SET NULL, contact, note, created_at)
home_shares.scope (jsonb)   yeni açarlar: includeAddress, documentIds, purpose
```
`apply-schema` iki dəfə işlədildi: idempotentdir.

**Köhnə paylaşım linkləri:** scope-da yeni açarlar olmadığı üçün əvvəlki kimi işləyir: ünvan görünür, sənəd açılmır. Bu, API testi ilə yoxlanıb. **Yeni linklərdə** ünvan yalnız işarələnəndə görünür.

## 4. Yoxlamalar

| Yoxlama | Nəticə |
|---|---|
| API testi `home-e2e` (yeni 19-cu bölmə daxil) | **193/193** |
| Brauzer: pasport axını `pp-flow` (telefon 390px + desktop 1366px) | **51/51** |
| Brauzer: home-first axını `hf-flow` | **63/63** |
| Köhnə səhifələr (smeta, dashboard, realtor, layihələr) | açılır, JS xətası yoxdur |
| Realtor e2e (təmiz baza) | ALL PASSED |
| `pnpm run build` | uğurlu |

19-cu bölmənin yoxladıqları: tamlıq faizi real məlumatdan hesablanır; yad hesab və dəvətli usta pasportu görmür; xatırlatmalar yalnız sahibinə görünür. Satış linki ilə bağlı: ünvan gizlidir, saxta və iş sənədi ID-ləri atılır, seçilən sənəd açılır, başqası açılmır, link bağlananda sənəd də bağlanır. Həmçinin: köhnə linklər əvvəlki kimi işləyir; xərclər məxfidir; maraq qeydi yalnız öz evinə yazılır.

## 5. Əlavə API, servis və ya tərəfdaşlıq tələb edənlər

- **SMS, WhatsApp, e-poçt xatırlatması:** göndərmə servisi və istifadəçinin razılığı lazımdır. Hazırda yoxdur və gizlədilmir.
- **Müstəqil texniki yoxlama sifarişi:** real mütəxəssis şəbəkəsi, müqavilə və məsuliyyət şərtləri lazımdır. İndi yalnız maraq qeydi var.
- **Tikinti şirkətləri üçün B2B təhvil:**
  - Kommersiya təklifi, abunə və ödəniş mexanizmi lazımdır. Ödəniş axını yaradılmayıb.
  - Hazırda podratçı ev sahibinin dəvəti ilə işə qoşulur.
  - Pasportu yeni sahibə ötürmə (owner transfer) hələ yoxdur.
- **Server tərəfində PDF faylı:** indi brauzerin çapı ilə PDF alınır. Ayrıca PDF generatoru əlavə kitabxana tələb edir.
- **Mütəxəssisin peşəkarlığının yoxlanması:** sənəd və ya lisenziya yoxlaması prosesi yoxdur. Ona görə "Mütəxəssis yoxlayıb" yazılmır.
- **Maraq qeydlərinə baxış:** yalnız bazadan (`service_interests`). Admin ekranı yoxdur.

## 6. Manual yoxlama ssenarisi

1. Çıxış edin və ana səhifəni telefonda açın. 7 kart olmalı, yalnız "Müstəqil texniki yoxlama" "Hazırlanır" statusunda olmalıdır. Menyu düyməsini, FAQ-ı və "Marağınızı bildirin"i yoxlayın.
2. Daxil olun, ev əlavə edin. Pasport kartında boş bölmələr "Məlumat yoxdur" göstərməlidir.
3. Elektrik işi əlavə edin (xərc və material ilə), sonra "Texniki məlumatlar"da ventil əlavə edib "ventil" axtarın. Faiz artmalıdır.
4. Avadanlıq əlavə edin, növbəti xidmət tarixini keçmiş tarix qoyun. Evdə və "Bildirişlər"də xatırlatma görünməlidir.
5. "Xərclər" kartında CSV yükləyin.
6. Sənədlərə iki PDF yükləyin. "Paylaşım və giriş" → "Satış üçün" → yalnız birini işarələyin → link yaradın.
7. Linki gizli pəncərədə açın:
   - Ünvan, xərc, servis əlaqəsi və ikinci sənəd görünməməlidir; birinci sənəd açılmalıdır.
   - "Çap et / PDF kimi saxla" düyməsini yoxlayın.
8. Linki bağlayın: sənəd artıq açılmamalıdır.
