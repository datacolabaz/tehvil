# Təhvil-təslim protokolu (MVP, 21.10.2026)

## Axın
1. Landing: “Evin təhvil-təslimini rəsmiləşdirin” → rol (Rieltor / Ev sahibi / Alıcı) → “Protokol yarat”. Qeydiyyat yalnız protokol yaradanda və təsdiqləyəndə istənir; giriş səhifəsi istifadəçini eyni addıma qaytarır (`/sign-in?redirect=…`).
2. `/protokol/yeni` — ünvan (məcburi), növ, tarix, satıcı/alıcı/rieltor (məcburi deyil). Otaq şablonları avtomatik yaranır.
3. `/protokol/:id` — mobil iş sahəsi: **Otaqlar** (vəziyyət: yaxşı/qənaətbəxş/qüsurlu, qeyd, “Foto çək” — arxa kamera, “Qalereyadan seç”, önbaxış → qəbul/yenidən çək, yüklənmə statusu, xəta və “Yenidən cəhd et”; qüsurlar ayrıca, fotolu), **Sayğac və açarlar**, **Tərəflər** (dəvət linki, WhatsApp, ləğv), **Təsdiq və PDF**.
4. `/d/:token` — dəvət linki: qeydiyyatsız baxış; təsdiq üçün daxil olub qoşulmaq.
5. Statuslar: Qaralama → Məlumatlar toplanır → Təsdiq gözləyir → Təsdiqlənib → Yekun protokol yaradılıb.

## Qaydalar (serverdə yoxlanılır)
- Rol protokola bağlıdır (`protocol_participants`), hesab tipinə yox; bir protokolda bir şəxs — bir rol.
- Dəvət linki: 24 bayt təsadüfi, bazada yalnız SHA-256; açmaq heç bir hüquq vermir; yalnız bir hesab qoşula bilər; yeni link köhnəni ləğv edir; ləğv edilə bilir.
- Redaktə yalnız “qaralama / toplanır” statusunda. “Təsdiqə göndər” məzmunu versiya kimi dondurur (snapshot + SHA-256). Təsdiq versiya nömrəsi və iz ilə verilir; uyğun gəlmirsə rədd olunur. Düzəliş tələbi redaktəni açır; yeni göndəriş yeni versiyadır; köhnə versiyalar, təsdiqlər və PDF-lər saxlanılır.
- Təsdiq: hesab, tarix-saat, IP, brauzer, təsdiqlənmiş telefon/e-poçt (qismən gizli). `PROTOCOL_REQUIRE_PHONE=on` olsa, yalnız telefonu təsdiqlənmiş hesab təsdiq verə bilər.
- Fotolar: yalnız JPG/PNG (telefonda JPEG-ə çevrilir, ≤2000 px), 15 MB; şəxsi S3; yalnız iştirakçılara və aktiv link sahibinə; noindex.
- Təkrar sorğular: foto təkrar bağlanmır, təkrar təsdiq/göndəriş yeni qeyd yaratmır, eyni linklə təkrar qoşulma zərərsizdir.
- PDF: serverdə (pdfkit + DejaVu, Azərbaycan hərfləri), yalnız versiyanın snapshot-undan; foto, qüsur, sayğac, açar, təsdiqlər, versiya, iz; tam təsdiqlənməyən versiyada “TƏSDİQLƏNMƏYİB”. Şəxsi saxlanılır, yalnız iştirakçılara açılır; yenidən yaradıla bilər.
- Audit: `protocol_events`.

## Testlər
API 74/74 · brauzer (telefon 390 px + kompüter): landing, yaratma, kamera/qalereya/önbaxış/xəta+yenidən cəhd, qüsur, sayğac/açar, dəvət + WhatsApp, linklə qeydiyyatsız baxış, təsdiq, düzəliş tələbi, versiya 2, yekun PDF — OK · köhnə axınlar OK · build OK.
Real iPhone Safari və Android Chrome-da yoxlanmayıb (Chromium mobil emulyasiyası).

## Deploy
Yeni cədvəllər backend start zamanı avtomatik yaranır. Yeni asılılıqlar: `pdfkit`, `dejavu-fonts-ttf` (backend). İstəyə görə: `PROTOCOL_REQUIRE_PHONE=on` (Clerk-də telefonla giriş/SMS aktiv olmalıdır).
