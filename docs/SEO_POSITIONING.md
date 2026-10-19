# Təhvil.az — yeni mövqeləndirmə və SEO yenilənməsi (19.10.2026)

Mövqe: **ev təhvil-təslim və AI smeta platforması**. Marketplace, ERP/CRM, usta tapmaq, podratçılıq və ya ümumi layihə idarəetmə proqramı kimi təqdim olunmur.

## Dəyişdirilən səhifələr və metadata

| Səhifə | Dəyişiklik |
|---|---|
| `/` (index.html + landing-page.tsx) | Yeni title, description, OG/Twitter, H1, iki H2 modul bloku, JSON-LD (WebSite, Organization, WebApplication — yalnız real funksiyalar), JS-siz ilkin HTML məzmunu |
| 4 köhnə bələdçi | CTA və düymələr yeni mövqeyə uyğun, “Digər bələdçilər” 6 səhifəyə link verir, Article JSON-LD |
| 2 yeni bələdçi | `/menzil-tehvil-teslim-akti.html`, `/evin-bazar-deyeri-ve-tikinti-smetasi.html` |
| `/terms.html` | §1 iki xidmət və hesablamaların təxmini xarakteri; description |
| `/privacy.html` | Ev məlumatları, fayllar, AI smeta məlumatları, ortaq müqayisə bazası; description — **hüquqi yoxlama tələb edir** |
| Realtor modulu | “Təhvil Sertifikatlı Mənzil” → “Təhvil pasportlu mənzil” (sertifikat/zəmanət iddiası yoxdur) |
| ru/en mətnləri | Köhnə təmir-podratçı mövqeyindən yeni mövqeyə |

## Yeni title, description, H1 (ana səhifə)

- **Title:** Ev təhvil-təslim və AI smeta — Təhvil.az
- **Description:** Evin otaqlarını, avadanlığını, qüsurlarını və dəyişikliklərini foto ilə qeydə alın. Elan linkindən təxmini bazar dəyəri, memarlıq layihəsindən ilkin tikinti smetası.
- **H1:** Evinizi qeydə alın. Dəyərini və xərclərini əvvəlcədən hesablayın.

## İndekslənmə

- `server.mjs`: yalnız `/` indekslənir; bütün SPA marşrutlarına (o cümlədən gizli paylaşım/dəvət linkləri, `/w/`, `/p/`, naməlum URL-lər) `X-Robots-Tag: noindex, nofollow`. Statik bələdçilər, robots.txt, sitemap.xml başlıqsız.
- `robots.txt`: `/api/`, `/h/s/`, `/invite/`, `/invites/`, `/p/confirm/`, `/share/`, `/estimate/` bağlıdır.
- `sitemap.xml`: `/`, 6 bələdçi, privacy, terms; sign-in/sign-up çıxarıldı.

## Silinməyən, köhnəlmiş ola biləcək elementlər

- Köhnə layihə modulu (`/projects`, `/dashboard`) və podratçı təmir smetası — işlək, noindex, ana səhifədə ön planda deyil.
- `/workers` profilləri, Realtor `/p/` — noindex.
- Podratçı mövzulu bələdçilər (razılaşma, əlavə işlər) — faydalı məzmun, sitemap-də aşağı prioritet.
- ru/en köhnə landing strukturu (mətnlər yenilənib).

## Hələ həll olunmamış

- Ümumi otaq inventarı (yalnız avadanlıq reyestri var), rəsmi PDF təhvil aktı şablonu (yalnız paylaşım səhifəsinin çapı/PDF), elandan təmir xərci hesablanması — hazır kimi göstərilmir.
- SPA naməlum URL-lər üçün 404 yox, 200 + noindex qaytarır (soft-404).
- Landing JS ilə render olunur; axtarış sistemləri üçün index.html-də ilkin HTML var.

## Xarici hesab tələb edənlər / gözləmə

- Google Search Console və Bing Webmaster Tools: domeni təsdiqləmək, sitemap göndərmək, ana səhifə və bələdçilər üçün yenidən indeksləmə istəmək, “Coverage/Pages” hesabatında köhnə URL-ləri yoxlamaq.
- `site:tehvil.az` axtarışında heç bir nəticə tapılmadı — hesab girişi olmadan indeks vəziyyəti təsdiqlənməyib.
- Yeni title/description-un axtarış nəticələrində görünməsi təkrar crawl-dan asılıdır (adətən günlərdən həftələrə qədər).

## Testlər

SEO lint (lang, title/description uzunluğu, tək H1, canonical, JSON-LD, sitemap, daxili linklər) OK; ev API 193/193; dəyər+smeta API 33/33; Realtor ALL PASSED; brauzer p0–p3, pasport, home-first OK; typecheck və build uğurlu.
