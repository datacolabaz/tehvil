# "Evimin tikinti tarixçəsi" — sadələşdirilmiş foto gündəliyi (27.10.2026)

## Nə dəyişdi
- **İlk ekran:** evə daxil olanda (`/homes/:id`) ilk ekran **"Evimin tikinti tarixçəsi"** olur. Orada bunlar var:
  - evin adı və ünvanı;
  - cari mərhələ (ev sahibi seçir);
  - böyük **"Şəkil çək"** düyməsi və "Qalereyadan seç"; foto cari mərhələyə düşür;
  - mərhələ kartları;
  - son fotolar.
- **Evin menyusu 10 bölmədən 3-ə endi:** "Tikinti tarixçəsi", "Usta və ailəni dəvət et", "Digər məlumatlar".
- **Köhnə bölmələr silinmədi.** Hamısı öz ünvanında işləyir və "Digər məlumatlar" (`/homes/:id/diger`) səhifəsindən açılır:
  - Ümumi məlumat (`/umumi`, əvvəl `/homes/:id` idi);
  - Mərhələlər — ətraflı (`/tarixce`: sıralama, video, ustanın "tamamlandı" bildirişinin yoxlanışı, protokol);
  - Fotoları AI ilə təşkil et;
  - Otaqlar, İşlər, Texniki məlumatlar, Materiallar;
  - Maliyyə, Sənədlər, Dəyişikliklər jurnalı.
- **Yeni ev** yaradılanda tikinti tarixçəsi açılır. Boş evdə **"Fərdi ev / villa şablonu ilə başla"** düyməsi bir toxunuşla 9 mərhələ yaradır. "Öz mərhələmi əlavə edim" də var.
- **"AI Smeta" və "Evimin xərcləri"** dəyişməyib.

## Mərhələ şablonları
**Əsas 9 mərhələ:**
1. Fundament
2. Fundamentin izolyasiyası
3. Kolonlar və rigellər
4. Xarici və daxili divarlar
5. Elektrik xətləri
6. Su və kanalizasiya
7. İsti döşəmə
8. Suvaq
9. Astar, şpaklyovka və sonrakı işlər

**Əlavə şablonlar:** Dam, Hidroizolyasiya, Pəncərələr və qapılar.

**Hər şablonda:**
- tapşırıqdakı izah mətni;
- foto siyahısı ("Nəyin şəklini çəkmək olar"; hamısı istəyə bağlıdır, çəkilən foto işarələnir);
- texniki söz üçün sadə izah, məsələn: "Rigel — kolonları birləşdirən üfüqi konstruksiya".

**Mərhələlərlə nə etmək olar:**
- gizlətmək (fotoları qalır);
- geri qaytarmaq;
- əlavə etmək.

Kod: `artifacts/api-server/src/lib/buildTemplates.ts`.

## Status
- **"Başlanmayıb":** mərhələdə foto yoxdur.
- **"Foto əlavə edilib":** foto var. Bu, işin tamamlandığı demək deyil.
- **"Tamamlanıb":** yalnız ev sahibi (və ya evi idarə edən ailə üzvü) "Tamamlandı kimi işarələ" ilə qoyur, geri qaytarmaq olar.
- Ustanın "tamamlandı" bildirişi kartda ayrıca yazılır ("Usta “tamamlandı” bildirib — yoxlayın").

## Foto axını
1. "Şəkil çək" basılır və telefonun kamerası açılır (`capture="environment"`).
2. Foto avtomatik cari mərhələyə yüklənir.
3. "Foto əlavə edildi" təsdiqi göstərilir.
4. Bir toxunuşla, istəyə bağlı olaraq seçmək olar:
   - hansı foto (şablon siyahısından);
   - mərtəbə (son seçilən yadda qalır);
   - otaq;
   - qeyd.

**Avtomatik saxlanılanlar:**
- fayl, yüklənmə vaxtı və cihazın çəkilmə vaxtı;
- ev, mərhələ, kim əlavə edib;
- SHA-256.

**GPS:** yalnız "Məkanı da qeyd et" seçiləndə saxlanılır (standart: söndürülüb). İcazə olmasa, foto yenə yüklənir, saxta koordinat yaradılmır.

**Yükləmə xətası:**
- aydın mesaj göstərilir, internet yoxdursa ayrıca deyilir;
- "Yenidən cəhd et" düyməsi olur.

**Kamera açılmırsa:** "Qalereyadan seç" ilə telefonda çəkilmiş şəkil seçilir. Ekranda bunun izahı var.

**Mərtəbələr:** mərhələ açılanda fotolar mərtəbələr üzrə tablara ayrılır (Zirzəmi, 1-ci, 2-ci, …, Dam). 1-ci və 2-ci mərtəbənin fotoları qarışmır.

**Mərhələnin qeydi:** ev sahibi yazır, məsələn kolonların sayı və ya divarın materialı.

## Giriş və icazələr (mövcud sistem üzərində)
- **Ev sahibi və ailə üzvü (idarə edən):**
  - hər şeyi edir;
  - fotonu silə bilir: foto gizlədilir, faylı saxlanılır, jurnalda qeyd olunur;
  - fotonu başqa mərhələyə köçürə bilir.
- **Hesabla dəvət olunan usta ("contributor", Paylaşım səhifəsindən):**
  - mərhələləri görür, foto əlavə edir, **yalnız öz fotosunun** qeydlərini dəyişir;
  - silə bilmir;
  - cari mərhələni, statusu və evin məlumatlarını dəyişə bilmir.
- **Hesabsız foto linki:**
  - bir mərhələ üçün (əvvəlki kimi) və ya **bütün tikinti üçün** (yeni) ola bilər;
  - bütün tikinti linkində usta mərhələni özü seçir (cari mərhələ əvvəlcədən seçilib), mərtəbə, foto növü və qeyd əlavə edə bilir;
  - link yalnız evin adını və mərhələ adlarını göstərir, ünvanı və digər məlumatları yox;
  - status dəyişmək olmur, başqa evin mərhələsinə foto əlavə etmək olmur;
  - müddəti, limiti, QR kodu və ləğvi var;
  - fotonu kimin göndərdiyi ("Usta Elçin (link)") ev sahibinə görünür.
- **Başqa istifadəçi:** heç nə görmür (404).

## Verilənlər bazası (yalnız əlavələr, heç nə silinmir)
- `homes.current_work_id`: cari mərhələ.
- `work_records.template_key`, `work_records.hidden_at`.
- `home_media.floor_level` (0 zirzəmi, 1–9, 10 dam), `room_kind`, `shot_key`.
- `stage_photo_invites.work_id` artıq boş ola bilir (bütün tikinti linki).

  Bu dəyişiklik `lib/db/sql/manual.sql` faylındadır. Fayl təkrar icra oluna bilər və `build-schema-sql` onu `schema.sql`-in sonuna əlavə edir. Server başlayanda tətbiq olunur.

## API
- `GET /homes/:id/diary`: ekranın bütün məlumatı.
- `POST /homes/:id/diary/template`: şablon mərhələləri yaradır.
- `POST /homes/:id/diary/stages`: bir mərhələ əlavə edir.
- `PUT /homes/:id/diary/current`: cari mərhələni seçir.
- `PATCH /homes/:id/diary/stages/:workId`: `hidden`, `done`, `note`.
- `PATCH /homes/:id/diary/photos/:mediaId`: mərtəbə, otaq, foto növü, qeyd, mərhələ.
- `DELETE /homes/:id/diary/photos/:mediaId`: fotonu silir.
- `POST /homes/:id/photo-invites`: bütün tikinti linki.

## Testlər
- **API** (`diary-e2e`): 49/49. Yoxlananlar: şablon, cari mərhələ, foto, mərtəbələr, usta icazələri, hər iki link növü, gizlətmə, tamamlama, silmə, köhnə evlər.
- **Brauzer** (`diary-flow`, telefon 390 px və kompüter 1280 px), 10 ssenarinin hamısı:
  - kamera və qalereya, bir mərhələyə bir neçə foto;
  - GPS-siz yükləmə;
  - mərtəbələrin ayrılması;
  - linklə usta;
  - hesabla usta;
  - yükləmə xətası və təkrar cəhd;
  - silmə və tamamlama;
  - köhnə bölmələr.
- **Reqressiya:**
  - API: `home-e2e` 193, `stages-e2e` 28, `invite-e2e` 35, `history-e2e` 23, `integrity-e2e` 30;
  - brauzer: `hf-flow`, `hh-flow`, `fi-flow`, `daily-flow`, `two-flow`;
  - build.
- **Əvvəldən uğursuz olan testlər:** `home-flow` və `pt-flow` (giriş səhifəsinin köhnə yoxlamaları) main-də də eyni cür uğursuzdur, bu dəyişikliklə əlaqəsi yoxdur.

## Məhdudiyyətlər
- Mərhələ avtomatik müəyyən edilmir; cari mərhələni ev sahibi seçir. AI ilə təşkil "Digər məlumatlar"da qalır.
- Foto silinəndə fayl yaddaşda qalır, hər yerdə gizlədilir. Tam silmə tələb olunarsa, ayrıca əlavə ediləcək.
- Kamera icazəsi brauzerin özündədir; sayt yalnız qalereya yolunu təklif edir.
