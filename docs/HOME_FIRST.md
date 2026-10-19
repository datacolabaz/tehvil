# Ev mərkəzli Təhvil (home-first)

Təhvil marketplace deyil. Mərkəzdə **ev** dayanır: *Ev əlavə et → iş və foto → tarixçə → paylaş*.
Bir nəfər tək başına istifadə edə bilər — usta qeydiyyatı, təsdiq və ya rol seçimi tələb olunmur.

## 1. Audit (başlanğıc vəziyyət)

| Sahə | Nə var idi | Qərar |
|---|---|---|
| Evlər, otaqlar, işlər, media, texniki xətlər, avadanlıq, paylaşım linkləri, audit jurnalı | `homes`, `rooms`, `work_records`, `home_media`, `infrastructure_items`, `equipment`, `home_shares`, `home_audit` | Saxlanıldı və təkrar istifadə olundu; paralel cədvəl yaradılmadı |
| Usta kataloqu, reytinq/rəylər, sifariş/bid, Realtor paneli, köhnə təmir layihələri (`projects`), müqavilə/escrow | Kod və məlumat mövcuddur | **Silinmədi.** Əsas menyudan çıxarıldı; marşrutlar işləyir, “Parametrlər”dən açılır |
| Məcburi rol seçimi (“Ev sahibi / Usta”) | Birinci girişdə | Çıxarıldı |
| AI Smeta | `artifacts/tehvil/src/lib/smeta/ai.ts` — **qayda əsaslı hesablama, heç bir AI modeli çağırılmır** | İşlək saxlanıldı; evə bağlana bilər. Yeni AI inteqrasiyası əlavə edilmədi |

## 2. Görülən işlər

**Naviqasiya (desktop və mobil):** `+ Ev əlavə et`, Evlərim, İş tarixçəsi, AI Smeta; altda Parametrlər və Çıxış. Dəvətlər üst paneldəki zəngdə (“Bildirişlər”) və evin “Paylaşım və giriş” bölməsindədir. “Əlavə xidmətlər” başlığı yoxdur.

**Ev bölmələri:** Ümumi məlumat · Otaqlar · İşlər və tarixçə · Texniki məlumatlar · Materiallar və avadanlıqlar · Sənədlər · Paylaşım və giriş.

**Ev əlavə etmək:** yalnız ad məcburidir. Formada “Ev əlavə etmək mülkiyyətin rəsmi təsdiqi deyil” yazılıb.

**İş qeydi:** minimum — ev, “Nə edildi?”, tarix, qısa təsvir, foto/PDF. “Əlavə məlumat” açılanda: otaq, növ, materiallar, işi görən (usta və ya şirkət: ad, telefon, qeyd), xərc + valyuta (AZN/USD/EUR), zəmanət qeydi.
- İşin tarixi (`start_date`) əlavə olunma tarixindən (`created_at`) ayrıdır; keçmiş tarix olar.
- Ev sahibinin/idarəçinin öz qeydi dərhal “Görülüb” olur — heç kimin “təsdiqini gözləmir”.
- Hər işdə “kim əlavə edib · nə vaxt” göstərilir. “Usta iştirakını təsdiqləyib”, “Ev sahibi qəbul edib”, “Mütəxəssis yoxlayıb” nişanları **yalnız real əməliyyat olanda** görünür.
- Reytinq/rəy bölmələri iş və usta səhifələrindən gizlədildi (məlumat silinmədi).

**İşi görən şəxs:** sərbəst mətn, qeydiyyat tələb olunmur, heç bir hesaba ad və ya telefona görə avtomatik bağlanmır. Hesabı olan şəxs işə yalnız konkret iş/ev üçün dəvət linki ilə qoşulur.

**İş tarixçəsi:** bütün əlçatan evlərin işləri eyni `work_records` məlumatından; ev və il süzgəci; “İş əlavə et”.

**Texniki məlumatlar:** zona/otaq üzrə foto + başlıq + izah; yeni növlər: sayğac, ventil/kran, elektrik lövhəsi. CAD yoxdur. Səhifədə “yoxlanmış mühəndis planı deyil” yazılıb.

**Sənədlər:** PDF və ya şəkil (`home_media.phase = 'document'`). Sənədlər və bütün PDF-lər QR səhifəsində və paylaşım linkində **heç vaxt** açılmır (backend-də `isVisual` yoxlaması).

**Materiallar və avadanlıqlar:** avadanlıq kartları + işlərdə yazılmış materialların siyahısı.

**AI Smeta:** smeta evə bağlanır (`smeta_projects.home_id`). Smeta tarixçəyə avtomatik düşmür; “Bu smetadan iş yarat” yalnız istifadəçi basanda, əvvəlcədən doldurulmuş forma açır. Təxmini qiymət (smeta) faktiki xərcdən (`work_records.cost`) ayrıdır.

**İcazələr (backend-də yoxlanılır):**
- *İdarə edir* (owner/member) — hər şey; paylaşımı yalnız ev sahibi idarə edir.
- *Redaktə edə bilər* (contributor) — iş, foto, texniki məlumat əlavə edir və dəyişir; üzvləri və paylaşımı dəyişə bilməz.
- *Yalnız baxa bilər* (viewer).
- Xərc, zəmanət və telefon yalnız ev üzvlərinə görünür; işə dəvət olunan usta və paylaşım linki bunları görmür.

**Paylaşım:** susmaya görə məxfi. Linklər seçilmiş məlumatla, müddətli, istənilən vaxt bağlanır; token təsadüfi və bazada hash kimi saxlanır. “Paylaşım və giriş” səhifəsində: kimin girişi var, linklər, QR, “Dəyişikliklər tarixçəsi”. Bu hüquqi e-imza deyil.

## 3. Migration (yalnız əlavə, dağıdıcı deyil)

```
work_records.cost          numeric(14,2)  NULL
work_records.currency      varchar(3)     DEFAULT 'AZN'
work_records.warranty_note text           DEFAULT ''
smeta_projects.home_id     uuid           NULL   (FK yoxdur — smeta silinməsin)
```
Tətbiq: `DATABASE_URL=… pnpm --filter @workspace/db run apply-schema` (idempotentdir, mövcud sətirlərə toxunmur).

**Köhnə təmir layihələri (`projects`):** silinmir, avtomatik evə köçürülmür. “Parametrlər → Köhnə təmir layihələri” ilə açılır. Evə köçürmə gələcəkdə yalnız istifadəçinin öz əməliyyatı ilə (layihə → ev, mərhələlər → işlər, sübut fotoları → media) edilməlidir — avtomatik birləşmə məlumat sahibliyini səhv sala bilər.

## 4. Yoxlamalar

- API testi (`home-e2e`): **164/164** — tək istifadəçi evi, keçmiş tarixli iş, xərc/zəmanət, şirkət qeydi, PDF və sənədin QR/link/yad şəxsə bağlı olması, paylaşımda xərc/telefonun gizlənməsi, contributor hüquqları, audit, smeta bağlama/ayırma (iş yaratmadan).
- Brauzer axını (`hf-flow`, telefon 390px + desktop 1366px): **63/63** — rol seçiminin olmaması, yalnız adla ev, menyu tərkibi, bölmə sırası, keçmiş iş + foto + PDF + qeydiyyatsız usta, eyni məlumatın evdə və İş tarixçəsində görünməsi, süzgəclər, sayğac, sənəd, materiallar, smeta, paylaşım/dəvət, parametrlər, üfüqi sürüşmə yoxdur, JS xətası yoxdur.
- Köhnə səhifələr (smeta, dashboard, realtor, layihələr) açılır, xəta yoxdur; Realtor e2e təmiz bazada: **ALL PASSED**.
- `pnpm run build` (typecheck + build bütün paketlər): uğurlu.

## 5. Məhdudiyyətlər

- AI Smeta real AI deyil — qayda əsaslı hesablamadır (UI-da belə təqdim olunmalıdır).
- Köhnə `projects` → ev köçürməsi hələ yoxdur (yalnız plan).
- Sənədlər üçün ayrıca “kim görə bilər” seçimi yoxdur — bütün ev üzvləri görür.
- Usta profili, rəylər və Realtor modulu kodda qalır; əsas axından kənardır.
- İngilis/rus tərcümələri yeni mətnlərin hamısını əhatə etmir (əsas dil Azərbaycan dilidir).

## 6. Manual yoxlama ssenarisi

1. Yeni hesabla daxil ol → “Evinin məlumatları bir yerdə.” → “İlk evini əlavə et” → yalnız ad yaz → saxla.
2. Menyuda yalnız Ev əlavə et / Evlərim / İş tarixçəsi / AI Smeta / Parametrlər / Çıxış olduğunu yoxla.
3. “İş əlavə et” → 2019-cu il tarixi, foto + PDF, “Əlavə məlumat” → şirkət adı və telefon, xərc → saxla. İş “Görülüb”, “Siz əlavə etmisiniz · bu gün” görünməlidir.
4. İş tarixçəsi → ikinci ev əlavə et → ev və il süzgəcini yoxla.
5. Texniki məlumatlar → “Sayğac” əlavə et. Sənədlər → PDF yüklə.
6. AI Smeta-da smeta yarat → evin “Ümumi məlumat” səhifəsində “Saxla” → iş yaranmadığını yoxla → “Bu smetadan iş yarat”.
7. Paylaşım və giriş → “Redaktə edə bilər” dəvəti → başqa hesabla qəbul et; o hesab paylaşımı dəyişə bilməməlidir.
8. Paylaşım linki yarat → gizli pəncərədə aç → xərc, telefon və sənəd görünməməlidir → linki bağla → açılmamalıdır.
