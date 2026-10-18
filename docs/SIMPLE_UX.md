# Sadə istifadə təcrübəsi — hesabat

Məqsəd: adi ev sahibi və usta ilk dəfə daxil olanda nə etməli olduğunu başa düşsün. Texniki anlayışlar kodda qalır, interfeysdə sadə Azərbaycan dili.

## 1. Nə araşdırıldı

Giriş/qeydiyyat (Clerk), ana səhifə, menyu, ev əlavə etmə, iş qeydi forması, usta dəvəti, foto yükləmə, evdəki sistemlər, paylaşım/QR, rollar və icazələr (server), Smeta AI, Realtor paneli, köhnə təmir layihələri.

## 2. Aşkar edilən problemlər

- İnterfeysdə texniki terminlər: “icraçı”, “qeydiyyatsız”, “kommunikasiya xəritəsi”, “audit jurnalı”, “texniki mütəxəssis”, “iş qeydi”, “QR və paylaşım”.
- Menyu hamıya eyni idi (11+ bənd): ev sahibi usta bölmələrini, usta ev sahibi bölmələrini, hamı köhnə “İş sahəsi”ni görürdü.
- Ana səhifə və giriş ekranı köhnə məhsulu (podratçı ilə layihə) təsvir edirdi.
- Ev əlavə etmək bir dəfəyə 11 sahə istəyirdi; şəkil ayrıca addım idi.
- İş forması uzun idi (15 sahə, mətn yazmaq lazım idi), foto və usta formadan sonra ayrıca əlavə olunurdu.
- Ev səviyyəsində yalnız owner / technician / viewer var idi — “evi idarə edən, amma giriş verə bilməyən üzv” yox idi.
- Usta üçün konkret işdə ayrıca icazə (foto, qeyd, redaktə) yox idi — hamısı rola bağlı idi.
- Telefonda faza düymələri ekrandan daşırdı; düymələr kiçik idi; yarımçıq forma bağlananda itirdi.
- Paylaşım forması “səviyyə + scope” anlayışları ilə idi; paylaşım linki üçün QR yox idi.

## 3. Nə dəyişdi

**Terminlər** (`artifacts/tehvil/src/lib/home/labels.ts`, səhifələr): Evlərim, Evin məlumatları, Görülən iş, Təmir tarixçəsi, Usta və şirkətlər, Briqada / Briqadir, Evdəki sistemlər, Avadanlıqlar, Məlumatları paylaş, QR kodla baxış, Ev sahibi / Ev üzvü / Məlumat əlavə edə bilər / Yalnız baxa bilər, Baxım və təmir, Ustanı işə əlavə et, Hesabı yoxdur, Dəyişikliklər tarixçəsi. Xəta mesajları sadə dildə (“Foto yüklənmədi. Yenidən cəhd edin.”).

**Menyu hesaba görə** (`App.tsx`, yeni `GET /api/me/roles`):
- Hamı: **Evimi əlavə et** düyməsi, Evlərim, Təmir tarixçəsi, Usta və şirkətlər, Mənə göndərilən dəvətlər (sayğacla).
- Usta hesabı olanlar: əlavə “Usta hesabı” bölməsi — İşlərim, Tamamlanmış işlər. “İşlərim” səhifəsində: Yeni iş əlavə et, Foto əlavə et, İşə usta əlavə et.
- “Əlavə xidmətlər”: AI Smeta, Realtor paneli; köhnə “Təmir layihələri” yalnız layihəsi olanlara.
- Evin içində: Evin məlumatları, Təmir tarixçəsi, Otaqlar, Evdəki sistemlər, Avadanlıqlar, Usta və şirkətlər, Məlumatları paylaş (yalnız sahib), Dəyişikliklər tarixçəsi.

**İlk giriş**: “Xoş gəlmisiniz!” — iki seçim: *Ev sahibiyəm* / *Ustayam, briqadirəm və ya şirkətəm*. Ana səhifə və giriş mətnləri evə uyğunlaşdırıldı.

**Ev əlavə etmək — mərhələli**: 1-ci addım: ad, növ (Mənzil / Həyət evi / Digər), ünvan və şəkil (istəyə bağlı). 2-ci addım: “Növbəti addımlar” siyahısı — Otaqlar, İlk görülən iş, Elektrik sistemi, Su və kanalizasiya, İstilik və soyutma, Avadanlıqlar; hər biri bir cümlə izahla, heç biri məcburi deyil, gizlədilə bilər.

**Görülən işi əlavə et — qısa forma** (`pages/home/quick-work.tsx`): hazır düymələr (Elektrik işi, Santexnika, Su izolyasiyası, Suvaq, Boya, Döşəmə, Qapı və pəncərə, İstilik sistemi, Kondisioner, Digər — siyahı bir yerdə saxlanılır, yeni növ əlavə etmək asandır), harada (otaq düymələri), nə vaxt (bu gün), “İş bitib?”, foto və kamera, işi kim görüb (bu evin ustaları bir toxunuşla, hesabı olan ustanın axtarışı, hesabı olmayan usta — ad və telefon), material və qeyd istəyə bağlı. Ad avtomatik qurulur (“Elektrik işi — Mətbəx”). Bir neçə usta seçmək olur. Yarımçıq forma brauzerdə saxlanılır.

**Rollar və icazələr (serverdə yoxlanılır)**:
- Platforma: `user`, `staff` (`STAFF_USER_IDS`), `system` (avtomatik proseslər üçün audit identikliyi, giriş deyil).
- Ev: `owner`, `member`, `contributor`, `viewer`. Üzv evi idarə edir, amma giriş verə, paylaşa, arxivləyə bilmir. Köhnə `technician` qeydləri `contributor` kimi oxunur — məlumat dəyişdirilmir.
- Usta/briqada/şirkət profilləri platforma rollarından ayrıdır; briqada üzvləri avtomatik işə düşmür.
- Hər işdə hər usta üçün: **Foto əlavə edə bilər**, **Qeyd yaza bilər**, **İşin məlumatını dəyişə bilər**, və “İşdə iştirakını təsdiqləyib” statusu. Ev sahibi/üzv iş səhifəsində dəyişir; usta öz icazəsini dəyişə bilməz.
- Staff: ustanın şəxsiyyət yoxlaması, mübahisəli rəyi gizlətmək (`POST /api/staff/reviews/{id}/hide`).

**Paylaşım**: “Nəyi paylaşırsınız?” siyahısı — Evin ümumi məlumatları, Seçilmiş otaqlar, Seçilmiş təmir işləri, Avadanlıqlar, Evin texniki sistemləri, Fotolar, Tam məlumatlar (xəbərdarlıqla). Müddət (7/30/90 gün və ya bağlayana qədər), “Linki bağla”, linkin öz QR kodu, WhatsApp ilə göndərmə. Evin QR kodu ayrıca: skan edən yalnız ev sahibinin seçdiyini görür.

**Mobil**: düymələr ≥44px, böyük seçim düymələri, telefonda daşma aradan qaldırıldı, statistik kartlar azaldıldı (boş evdə göstərilmir).

**Yeni API**: `GET /api/me/roles`, `GET /api/me/home-works`, `POST /api/staff/reviews/{id}/hide`; `PATCH /works/{id}/participants/{pid}` icazə sahələri; iş “bitib” statusu ilə yaradıla bilir; yeni iş növləri `waterproofing`, `doors_windows`.

**Baza**: `work_participants` cədvəlinə 3 sütun (`can_add_media`, `can_add_notes` default true, `can_edit` boş = rola görə). Yalnız `ADD COLUMN IF NOT EXISTS` — mövcud məlumat dəyişmir.

## 4. Testlər

- API: 136 yoxlama (əvvəlki 114 + yeni: üzv/yalnız baxa bilər icazələri, bitmiş işin qeydi, usta üzrə icazələr və server tərəfində foto bloku, öz icazəsini dəyişə bilməmək, menyu rolları, staff, bütün evlərin tarixçəsi) — hamısı keçdi.
- Brauzer, telefon (390px): ilk giriş → ev (növ, ünvan, şəkil) → növbəti addımlar → otaqlar → qısa iş forması (düymələr, 2 foto, hesabı olmayan usta, material) → yarımçıq formanın bərpası → link ilə usta dəvəti və profil yaratma → icazəni söndürmə (usta artıq foto yükləyə bilmir) → menyunun hesaba görə dəyişməsi → seçilmiş paylaşım + QR → linki bağlama. Desktop (1366px) əsas ekranlar. Bütün ev ekranları hər iki ölçüdə üfüqi daşmasız, JS xətasız.
- Regresiya: Realtor e2e (təmiz bazada, 53 yoxlama), AI Smeta, layihələr, realtor səhifələri yüklənir və xətasızdır; `pnpm run build` uğurlu.

## 5. Qalan işlər

- SMS ilə telefon təsdiqi və SMS bildirişləri (provayder seçilməlidir).
- Staff üçün ayrıca ekran (hazırda API ilə).
- Əlavə dillər: ev modulu hələ yalnız Azərbaycan dilindədir (menyu ru/en tərcümə olunub).
- Köhnə “Təmir layihələri” modulunun mətnləri dəyişdirilməyib (işlək funksiya, yalnız layihəsi olanlara görünür).

## 6. Məlumatların qorunması

- Bütün icazələr serverdə yoxlanılır; gizlədilmiş düymə təhlükəsizlik sayılmır (testlər birbaşa API ilə yoxlayır).
- Əlaqəsiz şəxs evə müraciət edəndə 404 alır; ustanın telefonu yalnız onunla işləyən ev sahibinə/üzvə görünür.
- Paylaşım linkləri təsadüfi tokenlə, bazada yalnız hash; müddətli və bağlanan; QR-da həssas məlumat yoxdur; tokenlər loglarda gizlədilir.
- Yarımçıq formalar yalnız istifadəçinin öz brauzerində saxlanılır (serverə getmir).
- Miqrasiya yalnız əlavədir; heç bir məlumat silinmir və ya dəyişdirilmir.
