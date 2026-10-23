# Maliyyə, AI qaimə oxuma və foto mərhələləri (24.10.2026)

## 1. Audit — nə var idi

| Ehtiyac | Mövcud idi | Qərar |
|---|---|---|
| Ev pasportu, otaqlar, rollar | `homes`, `home_rooms`, `home_members` (owner / member / contributor / viewer), `homeAccess.ts` | Dəyişmədi. Maliyyə öz icazə səviyyəsini bunun üzərində qurur |
| Mərhələlər, foto, GPS, dəvət linki | `work_records`, `home_media`, `stage_photo_invites` | Dəyişmədi. Foto mərhələsi ayrıca cədvəldə (aşağıda) |
| Kommunikasiya xətləri | `infrastructure_items` (foto üzərində xətt, mənbə, yoxlanma) | Dəyişmədi; Excel hesabatına daxil edildi |
| Avadanlıq və zəmanət | `equipment` (marka, model, seriya, zəmanət, növbəti servis) | Dəyişmədi |
| “AI smeta” | Qayda əsaslı hesablama (`smeta_*`, `repair_estimates`). Kodda **heç bir AI inteqrasiyası yox idi** | Smeta qorunur; layihə istəyə görə smetaya bağlanır və plan / fakt müqayisəsi göstərilir |
| Köhnə “renovation projects” modulu (`/projects`, ödəniş cədvəli) | Evə bağlı deyil, ödənişlər yalnız plan | Toxunulmadı. Yeni maliyyə evə bağlıdır (`/home-projects`) |
| Ödəniş / bank | Yoxdur | Ödənişlər insanların qeydidir; heç yerdə “bank təsdiqi” göstərilmir |

## 2. Model (`lib/db/src/schema/finance.ts`)
- **Ev** uzunmüddətli pasportdur. **Layihə** (`home_projects`) bir tikinti və ya təmir dövrüdür. Bir evin bir neçə layihəsi ola bilər.
- `finance_parties` — podratçı, usta, təchizatçı. Müqavilə məbləği olan tərəf müqavilə üzrə, olmayan qaimələr üzrə hesablaşır.
- `finance_budget_versions` — v1 ilkin büdcədir. Hər təsdiqlənmiş əlavə iş və hər səbəbli düzəliş yeni versiya əlavə edir; köhnə versiyalar silinmir.
- `finance_change_orders` — təklif → (izah istənilib) → təsdiq / rədd.
- `finance_expenses` + `finance_expense_items` — faktiki xərc. Yalnız `approved` olanlar yekuna düşür.
- `finance_payments` — ödəniş / avans / geri qaytarma. Statuslar: qeyd edilib / alan təsdiqləyib / mübahisəli / ləğv edilib.
- `finance_invoices` — fayl, AI-nin oxuduğu (`ai_result`) və insanın təsdiqlədiyi (`confirmed`) ayrı saxlanılır.
- Pul `numeric(14,2)` kimi saxlanılır, server qəpiklə (tam ədəd) hesablayır. Heç nə silinmir: səhv qeyd səbəblə ləğv edilir. Təsdiqlənmiş qeydin dəyişməsi səbəb tələb edir və əvvəlki / yeni dəyər `home_audit`-ə yazılır.

## 3. Hesablama qaydaları (`financeCore.computeLedger`)
- **Faktiki xərc** = təsdiqlənmiş xərclərin cəmi. Ödəniş və avans bura düşmür.
- **Tərəfin öhdəliyi** = müqavilə + təsdiqlənmiş əlavə işlər; müqaviləsizdirsə: təsdiqlənmiş qaimələri (avansdan ödənənlər istisna).
- **Hesaba sayılan ödəniş** = ödəniş + avans − geri qaytarılan − həmin tərəfin avansından üçüncü tərəfə alınmış materiallar. **Qalıq** = öhdəlik − hesaba sayılan.
- **Avans qalığı** = verilən avans − ondan ödənmiş təsdiqlənmiş xərclər.
- Nümunə: 10 000 avans, podratçı ondan 6 000 material alır → faktiki xərc **6 000** (16 000 yox), avans qalığı 4 000, 8 000-lik müqavilədən 4 000 qalır. Testdə yoxlanılıb.
- Mübahisəli və ləğv edilmiş ödənişlər ödənilmiş sayılmır. Paneldə hər rəqəmin “necə hesablanır” izahı açılır.
- Xəbərdarlıqlar (saxtakarlıq iddiası deyil, yalnız “yoxlayın”): büdcə aşılıb, qərar gözləyən əlavə iş, 500 AZN-dən böyük sübutsuz ödəniş, avans aşılıb, artıq ödəniş, hesab uyğunsuzluğu, gələcək tarix, qeyri-adi vahid qiyməti (eyni material üzrə medianın ±50%-i).

## 4. Rollar
| | Ev sahibi / üzv | Podratçı (dəvət linki ilə qoşulub) | Usta (dəvət ilə) | Başqası |
|---|---|---|---|---|
| Panel və bütün layihə | ✓ | ✓ (eyni rəqəmlər) | yalnız öz hesabı | 404 |
| Xərc / qaimə əlavə etmək | ✓ (dərhal təsdiqlənir) | ✓ (təsdiq gözləyir) | yalnız öz hesabına | — |
| Təsdiq, ödəniş qeydi, əlavə işə qərar | ✓ | — | — | — |
| Əlavə iş təklifi | ✓ | ✓ | ✓ | — |
| Ödənişi təsdiq / etiraz | — | öz ödənişləri | öz ödənişləri | — |
| Excel, AI sual | ✓ | ✓ | — | — |

Dəvəti qəbul edən podratçı evə “məlumat əlavə edə bilər”, usta isə “yalnız baxa bilər” rolu ilə qoşulur (mövcud rol aşağı salınmır). Qaimə və sübut faylları (`phase = finance`) yalnız evi idarə edənlərə və layihənin tərəflərinə açılır, ev fotoları arasında görünmür, ayrıca silinmir.

## 5. AI (Anthropic Claude, yalnız serverdə)
- Açar: Railway backend-də `ANTHROPIC_API_KEY` (istəyə görə `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`). Açar brauzerə getmir. Açar yoxdursa, hər şey əl ilə işləyir və UI bunu açıq deyir.
- **Qaimə:** foto və ya PDF → model yalnız görünəni “tool” formatında qaytarır: satıcı, nömrə, çap və əl ilə yazılmış tarix ayrı-ayrı, sətirlər, cəmlər, hər sahə üçün əminlik, oxunmayan hissələr. Tarix oxunmursa `null` olur. Formada insan tarix mənbəyini seçir (çap / əl yazısı / bu gün / özü). Zəif oxunan sahələr sarı göstərilir. Hesab uyğun gəlmirsə, xəbərdarlıq çıxır, məbləğ dəyişdirilmir.
- **Dublikat:** eyni fayl (SHA-256), eyni satıcı + nömrə, eyni satıcı + tarix + məbləğ. Avtomatik birləşdirilmir; oxşar, amma fərqli məbləğ dublikat sayılmır.
- **Sual ver:** model serverin hesabladığı yekunları və layihənin qeydlərini alır (ev ünvanı göndərilmir). Cavabla birlikdə istinad etdiyi qeydləri qaytarır; mövcud olmayan id-lər süzülür.
- Limit: istifadəçi başına saatda 60 qaimə, 40 sual.

## 6. Foto mərhələləri (`media_stage_tags`, `lib/photoStageAi.ts`)
- Hər yeni foto (hesabla və ya dəvət linki ilə) saxlanılandan sonra növbəyə düşür. Worker növbəni bazadan götürür (`FOR UPDATE SKIP LOCKED`): restart və bir neçə instansda təhlükəsizdir. AI xətası fotonun yüklənməsinə təsir etmir: 3 cəhddən sonra “alınmadı” olur, sonra yenidən cəhd etmək olar.
- 21 mərhələ (promptdakı siyahı) + otaq və kommunikasiya növü təklifi, əminlik, görünən əlamət (1 cümlə). Model görünməyən mərhələni təxmin etmir, tarixi və keyfiyyəti qiymətləndirmir. Bilmirsə, nəticə “Müəyyən edilməyib” olur.
- Statuslar: AI təklif edib / təsdiqlənib / dəyişdirilib / müəyyən edilməyib. Əminlik 0.7-dən aşağıdırsa, foto “Mərhələni təsdiqlə” siyahısına düşür; bir toxunuşla təsdiqlənir və ya dəyişdirilir. AI nəticəsi ilə insan qərarı ayrı sütunlardadır. Yeni analiz insan qərarını üstələmir. Düzəlişlər audit jurnalına yazılır; model onlardan avtomatik öyrədilmir.
- “Fotoları mərhələlər üzrə təşkil et” köhnə fotoları fonda analiz edir; gedişat göstərilir. Eyni fayl ikinci dəfə AI-yə göndərilmir (SHA-256), foto başına bir qeyd var (unique).
- Səhifə: `/homes/:id/foto-merheleler` — mərhələ üzrə qalereya (tarix sırası ilə), kommunikasiya növü və otaq filtrləri.

## 7. Excel (`GET /home-projects/:id/export.xlsx`)
10 vərəq: Layihə yekunu, Gündəlik xərclər, Materiallar, Usta və podratçı hesabları, Ödəniş tarixçəsi, Kateqoriya üzrə xərclər, Kommunikasiya xətləri, Tikinti tarixçəsi, Büdcə dəyişiklikləri, Qaimələr. Rəqəmlər saytdakı hesablamadan gəlir. Siyahıların cəmi canlı `SUMIFS` düsturlarıdır (təsdiqlənmiş qeydlər üzrə). Testdə Excel və sayt rəqəmləri müqayisə olunub.

## 8. Qəbul meyarları

| # | Meyar | Nəticə |
|---|---|---|
| 1 | Mövcud funksiyalar işləyir | işləyir — home 193, invite 35, history 23, integrity 30 test; brauzer axınları keçir. Realtor e2e-də 6 test əvvəldən də (dəyişiklikdən əvvəl) düşürdü |
| 2 | Pasport foto, sənəd və maliyyəni birləşdirir | qismən — eyni evdə bölmələr kimi; pasportun ümumi səhifəsində maliyyə xülasəsi hələ yoxdur |
| 3 | Mobil foto düzgün layihəyə | işləyir (mövcud) |
| 4 | Qeydiyyatsız link yalnız icazəli əməliyyat | işləyir (mövcud) |
| 5 | Tarixçə tarix və kateqoriyaya görə filtr | qismən — foto mərhələ / kommunikasiya / otaq, xərclər tarix və kateqoriya üzrə filtrlənir; xərc + foto + ödəniş vahid zaman xətti yalnız Excel-dədir |
| 6 | Kommunikasiya fotosu otaqla | işləyir (mövcud + AI təklifi) |
| 7 | Xətti plan üzərində işarələmək | qismən — mövcud foto üzərində xətt çəkmə; ayrıca plan redaktoru yoxdur |
| 8 | AI qaimədən formanı doldurur | işləyir — test modeli ilə yoxlanılıb; real Claude açarı ilə hələ yoxlanmayıb |
| 9 | Əl yazısı tarixi göstərilir və təsdiqlənir | işləyir (test modeli ilə) |
| 10 | Təsdiqlənmiş xərc düzgün tarixli hesabatda | işləyir |
| 11 | Dublikat xəbərdarlığı | işləyir |
| 12 | Avans və xərc ikiqat sayılmır | işləyir |
| 13 | Ödəniş, xərc, borc ayrı | işləyir |
| 14 | Ev sahibi və podratçı eyni rəqəmləri görür | işləyir |
| 15 | Təsdiqlənməmiş əlavə iş büdcəni dəyişmir | işləyir |
| 16 | Maliyyə dəyişikliklərinin tarixçəsi | işləyir |
| 17 | Excel = sayt | işləyir |
| 18 | AI hesabatı real bazaya əsaslanır | işləyir (test modeli ilə) |
| 19 | Pasportun seçilmiş hissəsi paylaşılır | işləyir (mövcud); maliyyə heç bir paylaşıma düşmür |
| 20 | Avadanlıq və zəmanət | işləyir (mövcud) |
| 21 | İcazəsiz istifadəçi daxil ola bilmir | işləyir |
| 22 | Yükləmə uğurlu / uğursuz | işləyir |

## 9. Hələ yoxdur
- Pasportun yeni sahibə ötürülməsi (mərhələ 7).
- Maliyyə xülasəsinin pasportun ümumi səhifəsində göstərilməsi; xərc + foto + ödənişin saytda vahid zaman xətti.
- Ayrıca mərtəbə planı redaktoru.
- Bildirişlər (push / SMS / e-poçt).
- Offline növbə.

## 10. Testlər
- `finance-e2e` 80/80, `stages-e2e` 28/28 (Anthropic API test serveri ilə: sorğunun formatı, açarın serverdə qalması, xəta və təkrar cəhd).
- Brauzer `fn-flow` (telefon + desktop): layihə, podratçı, avans, qaimə şəkli → AI → yoxlama → xərc, panel, Excel, sual, podratçının dəvəti və təsdiq, foto mərhələləri.
