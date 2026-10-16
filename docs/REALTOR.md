# Realtor modulu — “Realtor üçün satış və etibar platforması”

> **Adi CRM yalnız satışı idarə edir. Təhvil satışı idarə edir və mənzilin etibarını sübut edir.**

Siz leadləri, elanları və görüşləri Təhvil.az-da idarə edirsiniz; hər mənzilinizi QR kodlu, foto sübutlu və ev sahibi təsdiqli “Təhvil Sertifikatlı Mənzil” kimi təqdim edirsiniz.

## Bölmələr (`/realtor/*`)

| Bölmə | Yol | Nə edir |
|---|---|---|
| İcmal | `/realtor` | Bugünkü leadlər, gözləyən müştərilər, görüşlər, aktiv elanlar, sertifikatlı mənzil sayı, QR skan; bildirişlər, nəticə paneli, satış qıfı. Profil yoxdursa, onboarding göstərilir. |
| Elanlarım | `/realtor/listings` | Elanlar (Aktiv / Gözləmədə / Satılıb / Arxiv), şəkillər, Tap.az/Bina.az linkləri, “Təhvil Pasportu var/yoxdur” badge-i, hazır təsvir. |
| Leadlər | `/realtor/leads` | Lövhə və siyahı; mənbə, status, büdcə, rayon, otaq, alqı/icarə, növbəti aksiya + vaxt, agent; uyğun elanlar; WhatsApp yazışması. |
| Görüşlər | `/realtor/appointments` | Həftəlik təqvim, status (Planlandı / Baş tutdu / Ləğv edildi / Yenidən planlandı), WhatsApp xatırlatması. |
| Təhvil Sertifikatlı Mənzil | `/realtor/passports` | 5 addımlı pasport wizardı, etibar səviyyəsi, təsdiq linkləri, paylaşım. |
| WhatsApp | `/realtor/whatsapp` | Avtomatik cavab, filtr sualları, follow-up, xatırlatma, Cloud API qoşulması. |
| Profil | `/realtor/profile` | Ad, foto, agentlik, telefon, WhatsApp, Instagram, logo — pasportda görünür. |
| Komanda | `/realtor/team` | Agentlər və hər agentin nəticəsi (lead, görüş, saziş, konversiya). |

Qeydiyyat: landing səhifəsindəki “Realtor kimi başla” → `/sign-up?realtor=1`, qeydiyyatdan sonra `/realtor`-a yönləndirir.

## Qeydiyyatdan sonrakı axın

**Profil → İlk elan → İlk lead → WhatsApp → İlk Təhvil Pasportu → QR paylaşımı → Nəticələr**

- Profil yaradılan kimi “Xoş gəlmisiniz, [Ad]!” pəncərəsi açılır: Elan əlavə et / Lead əlavə et / Təhvil Pasportu yarat.
- Elan, lead və pasport yoxdursa, İcmal boş görünmür: 4 “Başlayın” kartı və 8 addımlı “İlk həftə planı” göstərilir (addımlar real məlumatdan avtomatik işarələnir).
- Elan wizardı: 1) mənzil məlumatı (Tap.az/Bina.az linkindən avtomatik doldurma ilə) → 2) portal linkləri → 3) “Təhvil Pasportu yaratmaq istəyirsiniz?” — “Bəli” birbaşa pasport wizardına aparır.
- Lead forması: mənbə və alqı/icarə düymələri, növbəti aksiya presetləri (“Zəng edəcəyəm”, “Elan göndərəcəyəm”…), “Bu gün 18:00” kimi vaxt seçimi; yaradılanda “Növbəti aksiya: Bu gün 18:00 — …” göstərilir.
- Pasport wizardı mövcud elanı seçməklə başlayır; etibar addımında hədəf səviyyə seçilir (səviyyə təsdiqlərlə avtomatik yüksəlir).
- WhatsApp bağlama: nömrə → rejim → müştəri linki və QR (Instagram bio və elanlar üçün).

### Linkdən avtomatik doldurma

`POST /api/realtor/listings/import` portal səhifəsini oxuyur (OpenGraph, JSON-LD, “3 otaqlı”, “96 m²”, “185 000 AZN” kimi ifadələr) və şəkilləri realtorun media yaddaşına köçürür. Yalnız dəstəklənən portallar açılır (tap.az, bina.az, yeniemlak.az, emlak.az, arenda.az, ev10.az, lalafo.az, unvan.az); hər yönləndirmə yoxlanılır, daxili/özəl IP ünvanlara müraciət bloklanır. Portallar dizaynını dəyişə bilər — tapılmayan sahələri realtor əl ilə doldurur. Real portal səhifələrində hələ sınaqdan keçirilməyib.

## Etibar səviyyələri

1. **Əsas pasport** — məlumatı realtor/ev sahibi yükləyib.
2. **Podratçı təsdiqli** — hər iş üçün podratçı öz linki ilə “Bu işi mən görmüşəm” təsdiqləyib.
3. **Təhvil təsdiqli** — ev sahibi hər işi “sonra” fotolarına baxaraq qəbul edib (ən yüksək səviyyə).

Qaydalar (API-də tətbiq olunur):
- “Sonra” fotosu olmayan işi ev sahibi qəbul edə bilməz.
- Təsdiqlənmiş işin məzmunu (ad, tarix, podratçı, təsvir, material, fotolar) dəyişərsə, həmin işin podratçı və ev sahibi təsdiqi sıfırlanır.
- Link tokenləri bazada yalnız SHA-256 hash kimi saxlanılır; yeni link köhnəni əvəz edir; arxivləmə linkləri bağlayır.
- İctimai səhifə podratçı və ev sahibinin telefonlarını göstərmir.

## İctimai səhifələr (login tələb etmir)

- `/p/{id}` — alıcı pasportu: şəkillər, etibar səviyyəsi, təmir işləri, əvvəl/sonra müqayisəsi, realtor kartı, WhatsApp CTA, sorğu forması (lead kimi düşür), QR.
- `/p/{id}?src=qr` — QR skanı kimi sayılır. `/p/{id}/print` — çap/PDF görünüşü.
- `/p/confirm/contractor/{token}`, `/p/confirm/owner/{token}` — təsdiq səhifələri.
- Şəkillər `/api/realtor-media/{id}` ilə yalnız dərc olunmuş (və ya aktiv təsdiq linki olan) pasportda göstərildikdə ictimaidir.

## WhatsApp

- **Bir kliklə rejim** (heç bir qoşulma lazım deyil): hazır mətnlər (ilk cavab + 5 sual, uyğun elanlar, görüş vaxtı, follow-up, xatırlatma) wa.me linki ilə açılır və yazışmada qeyd olunur.
- **Cloud API rejimi**: server `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN_KEY` ilə konfiqurasiya olunur; realtor Phone number ID və access token daxil edir (şifrələnmiş saxlanılır). Webhook: `/api/whatsapp/webhook`. Bot: yeni lead yaradır → salamlama → alqı/icarə, rayon, büdcə, otaq, vaxt → uyğun elanlar (sertifikatlılar pasport linki ilə) → 3 görüş vaxtı → seçilən vaxtda görüş yaradır, lead “Görüş planlandı” olur, realtora “görüşə hazırdır” bildirişi gedir.
- 24 saatlıq pəncərədən kənar follow-up/xatırlatma üçün Meta-da təsdiqlənmiş şablon adı lazımdır (WhatsApp ayarlarında). Şablon yoxdursa, mesaj realtor üçün “əl ilə göndər” kimi qalır və bildiriş yaranır.

## Planlayıcı

API prosesi hər 5 dəqiqədən bir: vaxtı keçmiş növbəti aksiyalar üçün bildiriş, görüşdən N saat əvvəl müştəriyə xatırlatma, cavab verməyən leadlərə follow-up. Sətirlər şərti `UPDATE … RETURNING` ilə tutulur — bir neçə instansda təkrar göndərilmir. `REALTOR_SCHEDULER=off` ilə söndürülür.

## Verilənlər bazası

Yeni cədvəllər (`lib/db/src/schema/realtor.ts`): `realtor_profiles`, `realtor_media`, `realtor_agents`, `realtor_listings`, `realtor_leads`, `realtor_appointments`, `property_passports`, `passport_works`, `realtor_events`, `realtor_whatsapp_settings`, `realtor_messages`, `realtor_notifications`. Tətbiq: `pnpm --filter @workspace/db run push`.

## Hələ edilməyənlər (növbəti addımlar)

- Agentlərin öz hesabı ilə girişi (indi agentlər agentlik sahibinin hesabında qeyd kimi saxlanılır və onlara iş təyin olunur).
- Mövcud Təhvil təmir layihəsinin qəbul olunmuş mərhələlərini pasporta avtomatik idxal etmək.
- Realtorun öz nömrəsinə WhatsApp bildirişi (indi bildirişlər paneldədir).
- Realtor modulu hələ yalnız Azərbaycan dilindədir (AI Smeta kimi).
