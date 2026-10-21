# Ev tarixçəsi + Təhvil protokolu (21.10.2026)

Mövqe: **Tehvil.az — evin tikintidən təhvilə qədər rəqəmsal tarixçəsi.** İki əlaqəli, amma qarışdırılmayan modul:
- **Ev tarixçəsi** — tikinti və təmir mərhələləri timeline kimi (`/homes/:id/tarixce`).
- **Təhvil protokolu** — açar günü otaq-otaq yoxlama (`/protokol/:id`), dəyişməyib.

## 1. Audit — nə var idi, nə istifadə olundu

| Ehtiyac | Mövcud idi | Qərar |
|---|---|---|
| Ev, giriş/rollar | `homes`, `home_members` (owner/member/contributor/viewer), backend-də `homePermissions` | Dəyişmədi |
| Mərhələ | `work_records` (başlıq, `start_date`/`end_date`, təsvir, `kind=construction`) | **Mərhələ = iş qeydi.** Paralel cədvəl yaradılmadı. Yalnız `sort_order` əlavə olundu |
| Foto / video | `home_media` (foto, MP4/MOV/WebM ≤50 MB, PDF), presigned yükləmə | Saxlanıldı; çəkilmə vaxtı, GPS, SHA-256 əlavə olundu |
| Paylaşım | `home_shares`: yalnız baxış, seçilmiş məlumat, müddətli, ləğv olunan, token hash; ünvan susmaya görə gizli; `/h/s/:token` hesabsız | Dəyişmədi; foto faktları (vaxt, GPS nişanı) əlavə olundu |
| Təhvil protokolu | `handover_protocols` və s. | Dəyişmədi; `home_id` ilə evə bağlana bilir |
| Ödəniş / Pro | Yoxdur | Saxta plan qurulmadı; Pro “tezliklə” |

## 2. Əlavə olunanlar
- **Tarixçə səhifəsi:**
  - Mərhələlər yuxarıdan aşağı göstərilir, sahibin seçdiyi sıra ilə; sıra seçilməyibsə, tarixə görə.
  - Kartda: ad, tarix, foto sayı, ilk fotonun önizləməsi, video sayı, GPS nişanı.
  - Kart açılanda bütün foto və videolar, hər birinin altında: çəkilib (cihazın məlumatı), yüklənib (server), məkan.
- **Mərhələ əlavə et:** 12 hazır mərhələ (Təməl … Təhvil günü) və ya öz adınız + tarix. Yeni mərhələ dərhal açılır.
- **Foto:** hər mərhələdə böyük “Foto çək” (arxa kamera) və ayrıca “Şəkil yüklə” (qalereya, çoxlu) düyməsi.
  - Vəziyyətlər: Yüklənir / Şəkil uğurla əlavə edildi / Yükləmə uğursuz oldu + “Yenidən cəhd et”.
- **Video:** ev başına 5-ə qədər (`HOME_VIDEO_LIMIT`), ≤50 MB (server), ≤60 saniyə (brauzerdə yoxlanılır; müddəti oxunmayan fayl buraxılır).
- **Məkan:** “Məkanı qeyd et” — cihaz üzrə seçim, brauzer icazəsi istənir.
  - İcazə yoxdursa və ya GPS alınmırsa, yükləmə dayanmır, ekranda aydın qeyd göstərilir.
  - Foto faylında EXIF GPS varsa, o da götürülür (`gpsSource: exif|device`).
- **Sıra:** ↑↓ ilə dəyişdirilir; `POST /homes/:id/works/order` yalnız evi idarə edənlər üçündür, id-lər həmin evə aid olmalıdır.
- **Ev ↔ protokol:**
  - Tarixçədən “Təhvil protokolu yarat”: ünvan avtomatik doldurulur, `home_id` bağlanır. Yalnız evi redaktə edə bilən üçün.
  - Protokolda “Bu evin tikinti tarixçəsi” keçidi var. Tarixçədə bağlı protokolların siyahısı göstərilir.
  - Dəvət linki ilə baxan şəxs `home_id`-ni görmür.
- **Naviqasiya:** “Ev tarixçəsi” (/homes) və “Təhvil protokolu” (/protokollar) ilk iki bənddir. Daxil olan istifadəçi /homes-a düşür, yeni ev yaradılandan sonra tarixçəsi açılır.
- **Landing:**
  - Yeni başlıq; rollar dəyişmir (Satıcı / Alıcı / Rieltor).
  - CTA-lar: “Tarixçəni başlat” və “Təhvil protokolu yarat”.
  - Nümunə kartda iki tab var: **Tarixçə** (mərhələ, son foto, GPS, Foto çək / Şəkil yüklə, keçidlər) və **Təhvil protokolu** (köhnə kart dəyişməyib).
  - “İki modul” bölməsi, Pulsuz / Pro bölməsi (qiymətsiz), FAQ-da GPS və tarixin nəyi sübut etmədiyi izah olunur.
- **i18n:** `lib/i18n-history.ts` — AZ / RU / EN mətnlər mövcud `copy` sisteminə qoşulub.

## 3. GPS və vaxt — nə göstərilir
| Məlumat | Mənbə | Kim görür |
|---|---|---|
| Yüklənib | Server vaxtı | Hamı (paylaşımda da) |
| Çəkilib | EXIF və ya kamera anı — “cihazın məlumatı” | Hamı |
| GPS koordinatları | EXIF və ya icazə ilə cihaz | Yalnız hesabda (evin üzvləri və işin iştirakçıları) |
| “GPS qeydə alınıb” nişanı | — | Paylaşım linki / QR |

Heç biri dəyişdirilməz sübut kimi təqdim olunmur. Yoxdursa “Məkan məlumatı yoxdur” göstərilir, heç nə uydurulmur.

## 4. Pulsuz / Pro və qiymət tövsiyəsi
Pilotda hər şey pulsuzdur; ödəniş sistemi yoxdur. Qiymət fərziyyələrinin müqayisəsi:
- **Bir ev üçün birdəfəlik (2–4 AZN)** satıcı/rieltor üçün daha təbiidir: ev tikilir və ya satılır, sonra istifadə dayanır. Ödəniş anı aydındır (məsələn, tarixçəni alıcıya paylaşmaq və ya video limitini açmaq).
- **Aylıq (3–5 AZN)** yalnız bir neçə evi paralel aparan rieltor/podratçı üçün məntiqlidir və onlarla ayrıca yoxlanmalıdır.
- **Tövsiyə:** əvvəl birdəfəlik “ev başına Pro” (video və foto limitləri artır) sınansın, aylıq paket isə yalnız təkrar istifadə edən rieltorlara təklif edilsin. Video saxlama xərci (ev başına 5×50 MB = 250 MB-a qədər) real S3 qiyməti ilə hesablanmalıdır.

## 5. Migration (additiv)
`home_media`: `taken_at`, `taken_source`, `client_meta`, `sha256` · `work_records.sort_order` · `handover_protocols.home_id`.

## 6. Hələ yoxdur
- Real ödəniş və Pro (provayder yoxdur).
- Brauzerdə video sıxılması.
- Offline növbə (zəif internetdə xəta + “Yenidən cəhd et” var, offline saxlama yoxdur).
- Paylaşım linkində GPS koordinatları (qəsdən göstərilmir).
