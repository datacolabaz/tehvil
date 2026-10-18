# Evin rəqəmsal pasportu və usta iş tarixçəsi

Təhvil.az-ın yeni əsas modulu. Mövcud funksiyalar (təmir layihələri, AI Smeta, Realtor paneli, Clerk auth, fayl yükləmə) dəyişmədən qalır; modul yalnız **əlavə** cədvəllər, endpointlər və səhifələrlə qurulub.

## 1. Arxitektura

Üç əsas obyekt:

| Obyekt | Cədvəl | Qeyd |
|---|---|---|
| Ev | `homes` | Bütün məlumatın mərkəzi. `public_id` — daimi QR identifikatoru |
| İş qeydi | `work_records` | Bir konkret tikinti / təmir / quraşdırma / servis işi |
| İcraçı | `workers` | `kind`: `individual` (fərdi usta), `team` (briqada), `company` (şirkət). `status`: `active`, `placeholder` (ev sahibinin daxil etdiyi qeydiyyatsız usta), `merged` |

Əlaqələr:

- `work_participants` — kim, **hansı işdə, hansı rolda** (`lead`, `team_lead`, `team_member`, `assistant`, `supervisor`, `inspector`) və hansı statusda (`invited`, `accepted`, `declined`, `removed`, `recorded`). `via_team_id` — üzv komanda adından əlavə olunubsa.
- `worker_memberships` — komanda/şirkət üzvlüyü zamanla (`invited`, `active`, `left`, `removed`, `declined`). **Üzvlük işdə iştirak demək deyil**; ayrılan üzvün keçmiş iştirakları silinmir.
- `home_members` — evə hesab səviyyəsində giriş: `owner`, `technician`, `viewer`. İcraçılar evə bura yox, konkret işə bağlanır.
- `home_rooms`, `home_media` (foto/video, `phase`: before/during/after/hidden/other), `work_notes` (note/defect/fix/inspection), `work_approvals` (dəyişməz status tarixçəsi), `infrastructure_items` (foto üzərində xətt, `source` + `verified_at`), `equipment` (otaq, quraşdırma işi → quraşdıran ustalar avtomatik), `home_invitations` (hash-lənmiş link tokenləri), `home_shares` (ləğv edilə bilən gizli linklər + scope), `home_audit`, `worker_reviews`.

Ev tarixçəsi və usta tarixçəsi **eyni** `work_participants` sətirlərindən qurulur: ev tərəfindən — evin işləri üzrə; usta tərəfindən — `worker_id = usta OR via_team_id = komanda` üzrə bütün evlərdə.

### Backend fayllar

- `lib/db/src/schema/home.ts` — cədvəllər
- `artifacts/api-server/src/lib/homeAccess.ts` — rol və icazə qatı (hər route buradan soruşur)
- `artifacts/api-server/src/lib/homeDtos.ts`, `workerProfile.ts`, `homeMedia.ts` — DTO, profil görünürlüğü, fayl yükləmə/oxuma icazəsi
- `artifacts/api-server/src/routes/homes.ts`, `works.ts`, `workers.ts` (auth tələb edir), `homePublic.ts` (QR, paylaşım linki, dəvət önizləməsi, usta profili, media — girişsiz)
- `lib/api-spec/openapi.yaml` — 43 yeni path, 73 sxem (`# >>> HOME-PASSPORT` blokları; `lib/api-spec/gen-home-spec.py` ilə yaradılır, sonra `pnpm --filter @workspace/api-spec run codegen`)

### Frontend fayllar

- `artifacts/tehvil/src/pages/home/*` — səhifələr, `components/home/ui.tsx`, `lib/home/{labels,upload}.ts`, `home.css` (mobil-first)
- `App.tsx` — yeni marşrutlar və naviqasiya; daxil olmuş istifadəçi `/` → `/homes`

Naviqasiya: **Mənim evlərim**, **Mənim işlərim**, **Ustalar və briqadalar**, **Dəvətlər və təsdiqlər** (Dəvətlər / Təsdiq gözləyən qeydlər), mövcud İş sahəsi (layihələr), AI Smeta, Realtor paneli. Ev açılanda: Ev profili, Tikinti və təmir tarixçəsi, Otaqlar, Kommunikasiya xəritəsi, Avadanlıqlar, Ustalar və briqadalar, QR və paylaşım, Audit jurnalı.

Marşrutlar: `/homes`, `/homes/:id[/history|/rooms|/rooms/:roomId|/map|/equipment|/performers|/sharing|/audit]`, `/works/:id`, `/my-works`, `/workers`, `/workers/:id`, `/invitations`, `/approvals`; girişsiz: `/h/:publicId` (QR), `/h/s/:token` (gizli link), `/w/:workerId` (usta profili), `/invite/:token`.

## 2. İcazələr (backend-də yoxlanılır)

| Rol | Nə edə bilər |
|---|---|
| Ev sahibi | Hər şey: ev/otaq redaktəsi, iş yaratmaq, icraçı dəvət/qeyd/çıxarmaq, işi qəbul / düzəliş istəmək / yenidən açmaq, paylaşım, audit, arxiv |
| Texniki mütəxəssis | Bütün texniki məlumatı görür, yoxlama qeydi yazır (işi “yoxlanılıb” edir), kommunikasiya xəttini təsdiqləyir, audit görür. Ev profilini və paylaşımı dəyişə bilməz |
| Ailə üzvü | Baxır, təsdiqlənmiş işə rəy yaza bilər |
| Fərdi usta | Yalnız iştirak etdiyi işləri və evin adını görür (ünvan yox). Foto/qeyd əlavə edir; `lead`/`team_lead` rolunda işi başladır və tamamlandı kimi işarələyir. Qəbul edilmiş işi dəyişə bilməz |
| Briqada rəhbəri / şirkət nümayəndəsi | Komanda adından işə qoşulur; yalnız **aktiv** üzvləri işə əlavə edir (üzv özü təsdiqləyir) |
| Administrator | `ADMIN_USER_IDS` — ustanın şəxsiyyətini ayrıca yoxladığını qeyd edir |

Əlaqəsiz istifadəçi evə/işə müraciət edəndə 404 alır (mövcudluq sızdırılmır). Bütün dəyişikliklər `home_audit`-a yazılır (telefon/VÖEN dəyərləri yazılmır). Təsdiqdən sonrakı dəyişiklik ayrıca `work.updated_after_confirmation` kimi qeyd olunur. Mütəxəssis təsdiqindən sonra xətt dəyişsə, təsdiq avtomatik sıfırlanır.

### Məxfilik

- Ustanın telefonu/e-poçtu yalnız: özünə, idarə edənə, açıq göstərməyi seçibsə hamıya, və ya ustanın işlədiyi evin sahibi/texniki mütəxəssisinə görünür. VÖEN heç vaxt açıq göstərilmir.
- QR (`public_id`) gizli deyil və yalnız ev sahibinin seçdiyi səviyyəni göstərir (`off`/`basic`/`history`; ünvan, fotolar, avadanlıq ayrıca açılır). Kommunikasiya xəritəsi, “gizli xətlər” fotoları, materiallar, telefonlar, audit QR-da heç vaxt göstərilmir.
- Gizli link — ayrıca təsadüfi token (bazada yalnız SHA-256 hash), müddətli, istənilən vaxt ləğv olunur, açılma sayı saxlanılır. `selected` — seçilmiş otaq/iş/avadanlıq; `technical` — bütün texniki məlumat və xəritə.
- Usta profilində açıq tarixçə: yalnız ev sahibinin qəbul etdiyi, `public` işlər, ev `show_on_worker_profiles` icazə veribsə; ünvansız.
- Qeydiyyatsız ustanın ev sahibinin yazdığı adı açıq səhifələrdə “Qeydiyyatsız icraçı” kimi göstərilir.
- Share/invite tokenləri server loglarında `[redacted]` olur.

### Dəvət və qeydiyyatsız usta

1. Ev sahibi qeydiyyatlı ustanı axtarıb dəvət edir → `invited` → usta “Dəvətlər”də təsdiqləyir → `accepted`.
2. Qeydiyyatsız usta: ev sahibi ad/telefonla qeyd edir → `placeholder` profil, iştirak `recorded`, “Qeydiyyatsız” nişanı.
3. “Profilə bağlamaq üçün link” → usta linki açır, qeydiyyatdan keçir/daxil olur, qısa profil yaradır → həmin placeholder-in qeydləri onun profilinə keçir (dəvət olunduğu iş `accepted`, digərləri `invited` — özü təsdiqləyir), placeholder `merged`. **Eyni adlı profillər heç vaxt avtomatik birləşdirilmir.** Link 14 gün, bir dəfəlik.

### Statuslar ayrı-ayrıdır

Dəvət (`home_invitations.status`), iştirak (`work_participants.status`), işin icrası (`planned → in_progress → completed`), ev sahibi qəbulu (`confirmed` / `revision`), mütəxəssis yoxlaması (`inspected_at`), profil (`registered`), şəxsiyyət yoxlaması (`identity_verified_at`). Nişanlar yalnız real hadisədən sonra görünür.

## 3. Miqrasiya (məlumat silinmir)

Yalnız yeni cədvəllər əlavə olunur; mövcud cədvəllərə toxunulmur. `lib/db/sql/schema.sql` yenidən yaradılıb (`pnpm --filter @workspace/db run build-schema-sql` — yeni skript), əvvəlki bütün sətirlər saxlanılıb.

Railway-də:

```bash
DATABASE_URL='<Railway public DB URL>' pnpm --filter @workspace/db run apply-schema
```

Skript idempotentdir (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, constraint-lər `DO ... EXCEPTION` bloklarında); heç nə silmir.

## 4. Mühit dəyişənləri

Yeni məcburi dəyişən yoxdur. İstəyə görə: `ADMIN_USER_IDS` (vergüllə Clerk user id-ləri) — “Şəxsiyyət yoxlanılıb” nişanı üçün. `PUBLIC_APP_URL` QR/dəvət/paylaşım linklərində istifadə olunur (artıq var).

## 5. Testlər

- API ssenariləri (114 yoxlama, hamısı keçir): ev/otaq, 3 profil növü (VÖEN-siz), komanda dəvəti, qeydiyyatlı ustanın dəvəti və təsdiqi, foto fazaları, tamamlama → ev sahibi qəbulu, düzəliş üçün səbəb tələbi, placeholder + link ilə bağlanma və adla avtomatik birləşmənin olmaması, komanda üzvünün işə əlavəsi və komandadan ayrıldıqdan sonra tarixçənin qalması, ev və usta tarixçəsinin eyni məlumatdan qurulması, kommunikasiya xətti (mənbə məcburi təyini, koordinat məhdudlaşdırılması, mütəxəssis təsdiqi, dəyişəndə sıfırlanma), avadanlıq + quraşdıran + servis tarixçəsi, rəylər (yalnız qəbuldan sonra, təkrar yox, etiraz), QR səviyyələri, gizli link scope və ləğv, icazə/məxfilik yoxlamaları, audit, Smeta bağlantısı (başqasının Smeta layihəsi bağlanmır), arxiv.
- Köhnə Realtor e2e (təmiz bazada) — xətasız.
- Mobil (390px) UI axını: ev yaratmaq → otaq → iş → foto → dəvət linki → foto üzərində toxunaraq xətt çəkmək → paylaşım linki → yeni usta linkdən qəbul edir və profil yaradır → tamamlayır → ev sahibi qəbul edir. Bütün səhifələr 390px və 1366px-də üfüqi daşmasız, JS xətasız.
- AI Smeta, layihələr, realtor səhifələri regresiya (yüklənir, xəta yoxdur).
- `pnpm run build` (typecheck + build) — uğurlu.

## 6. Hələ edilməyənlər / məhdudiyyətlər

- Telefon/e-poçt **təsdiqi** (SMS/OTP) yoxdur — ona görə “Əlaqə təsdiqlənib” nişanı göstərilmir.
- Şəxsiyyət yoxlaması üçün admin UI yoxdur — yalnız API (`POST /api/admin/workers/{id}/identity`).
- Rəyin admin tərəfindən gizlədilməsi üçün UI yoxdur (`hidden_at` sahəsi hazırdır).
- Bildirişlər (e-poçt/WhatsApp) göndərilmir — dəvətlər tətbiq daxilində “Dəvətlər”də görünür, link əl ilə paylaşılır.
- Kommunikasiya xəritəsi foto üzərində xətlərdir; 3D/CAD/BIM yoxdur (tələb olunmayıb).
- Smeta bağlantısı birtərəflidir (iş → Smeta layihəsi); Smeta tərəfdə əks link yoxdur.
- Rate limit prosess daxilindədir (mövcud realtor modulundakı kimi).

## 7. Yoxlama addımları (deploydan sonra)

1. `apply-schema` işlədin, sonra backend və frontend deploy.
2. Daxil olun → “Mənim evlərim” açılmalıdır; ev yaradın, otaq və iş əlavə edin.
3. İşdə “Əlavə et → Dəvət linki” → linki başqa hesabla açın → profil yaradıb qəbul edin → həmin hesabda “Mənim işlərim”də iş görünməlidir.
4. İkinci hesabla foto əlavə edib “Tamamlandı” → birinci hesabda “Təsdiq gözləyən qeydlər” → qəbul edin.
5. “QR və paylaşım” → QR-ı telefonla skan edin (girişsiz) → yalnız seçilən məlumat görünməlidir; gizli link yaradın, açın, ləğv edin, yenidən açın (açılmamalıdır).
6. AI Smeta və Realtor panelinin əvvəlki kimi işlədiyini yoxlayın.
