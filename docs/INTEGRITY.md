# Sübutların bütövlüyü və yoxlama (21.10.2026)

Məqsəd: fotoların və protokolun **sonradan dəyişdirilib-dəyişdirilmədiyini aşkar etmək**. Sistem fotonun real dünyada nə vaxt/harada çəkildiyini və sənədin hüquqi qüvvəsini təsdiqləmir.

## Fotolar
- Server faylı saxladıqdan sonra özü oxuyur və **SHA-256** hesablayır (`protocol_media.sha256`). Server qəbul vaxtı: `created_at`.
- Cihaz məlumatı ayrıca: `taken_at`/`taken_source` (EXIF və ya kamera), `client_meta.gps` (EXIF GPS, 5 rəqəm). Sübut kimi göstərilmir, ictimai səhifədə yoxdur.
- Silinən foto fiziki silinmir: `deleted_at`, `deleted_by_user_id`, hash saxlanılır; audit `photo_added` / `photo_removed` (hash ilə).
- Köhnə fotoların hash-i ilk göndərişdə hesablanır.

## Manifest (hər versiya)
- “Təsdiqə göndər” zamanı: `{schema, protocolId, number, kind, version, frozenAt, contentHash, content (ünvan, tarix, tərəflər, otaqlar, qüsurlar, sayğaclar, açarlar, qeydlər), photos[{id, sha256, size, contentType, target, receivedAt}]}`.
- **Kanonik JSON** (açarlar sıralanır, boşluq yoxdur) → `manifest_hash`. Eyni məlumat → eyni hash (test açarları qarışdıraraq yoxlayır).
- Təsdiqlər manifestə daxil **deyil** (dövri asılılıq yoxdur). Hər təsdiq `protocol_approvals.manifest_hash` saxlayır. Hər iki tərəf təsdiqləyəndən sonra ayrıca **təsdiqlər qeydi** `{manifestHash, approvals[{role, decision, at, method, manifestHash}]}` → `final_hash`.
- Dəyişiklik → yeni versiya, yeni manifest, yeni kod; köhnə təsdiqlər köhnə versiyada qalır.

## Audit zənciri
- `protocol_events.prev_hash`, `hash` = SHA-256(kanonik `{prevHash, protocolId, userId, action, detail, at}`); protokol üzrə advisory lock zənciri xətti saxlayır. Dəyişikliyi **aşkar etməyə** kömək edir; verilənlər bazasına tam girişi olan şəxs hər şeyi ardıcıl yenidən yaza bilər — buna görə PDF-də çap olunan hash müstəqil müqayisə nöqtəsidir.

## QR və yoxlama səhifəsi
- Hər versiyanın gizli `verify_code`-u var; PDF-də QR → `/v/<kod>` (noindex, robots-da bağlı, 20 sorğu/dəq).
- `GET /api/verify/:kod` yenidən hesablayır: manifest hash-i, hər fotonun faylının SHA-256-sı, PDF faylının hash-i (`pdf_sha256`), təsdiqlər qeydi, audit zənciri. Göstərir: nömrə, status, versiya, tərəflərin rolu üzrə təsdiq statusu, vaxt, üsul, versiya tarixçəsi. **Ad, telefon, ünvan, foto, GPS, istifadəçi ID-si göstərilmir.**

## Gələcək inteqrasiya (qoşulmayıb)
- `lib/integrity.ts → trustServices()`: SİMA elektron imzası və RFC 3161 zaman möhürü `not_configured`. UI və PDF bunu açıq yazır; “elektron imza ilə imzalanıb” və ya “zaman möhürü alınıb” iddiası yoxdur. Qoşmaq üçün SİMA-nın rəsmi partnyor sənədləri, imzalanacaq format və TSA xidməti lazımdır.

## Migration
Yalnız `ADD COLUMN IF NOT EXISTS … DEFAULT` və bir unikal indeks (`verify_code`, NULL-lar icazəlidir). Köhnə versiyalarda manifest boşdur və səhifədə “manifestdən əvvəlki versiya” kimi göstərilir.

## Testlər
`integrity-e2e` 30/30: foto hash = yüklənən baytlar, GPS ayrıca, silinmiş foto tarixçədə, manifest kanonik hash-i müstəqil hesablanır, açar sırası hash-i dəyişmir, təsdiqlər manifestə bağlı, ictimai səhifədə şəxsi məlumat yoxdur, PDF-də QR deşifrə olunur, foto faylı / məzmun / audit hadisəsi / təsdiq vaxtı dəyişdirildikdə uyğunsuzluq aşkarlanır, bərpadan sonra yenidən uyğun, yeni versiyada köhnə QR “yeni versiya var” göstərir.
