# Material və xidmət ayrıca, ustalarla razılaşmalar (28.10.2026)

## İki fərqli forma ("Evimin xərcləri")
- **"Əl ilə xərc əlavə et"** yalnız material alışı üçündür:
  - alış tarixi, satıcı;
  - sətirlərdə miqdar, vahid, vahid qiymət və ümumi məbləğ.

  Burada iş adı, fotolar və "İş və ya xidmət haqqı" düyməsi yoxdur. Usta və texnika xərcləri "Görülən işi qeyd et" ilə yazılır.
- **"Görülən işi qeyd et"** xidmət üçündür:
  - hansı iş görülür: siyahıdan seçilir (qazıntı, fundament, armatur, qəlib, hörgü, dam, elektrik, santexnika, istilik, suvaq, şap, kafel, boya, pəncərə-qapı, izolyasiya, qaynaq, fəhlə, daşınma, texnika, layihə/topoqrafiya, təmizlik və ya "başqa iş"); adı dəqiqləşdirmək olar;
  - usta və ya briqada, telefon;
  - hesablama: **saatlıq, günlük, aylıq** (neçə × qiymət) və ya **bütün iş üçün razılaşma** (ümumi məbləğ);
  - ödəniş: **tam ödənildi, qismən** (bu gün ödənilən; qalan "ödənilməyib" kimi görünür) və ya **hələ ödənilməyib**;
  - qeyd və işin fotosu.
- **Ev səhifəsindəki "Gündəlik qeyd"** (material və işlər bir gündə) əvvəlki kimi qalır.

## Uzunmüddətli iş: razılaşma və ödəniş planı
- **Yaradılması:** "Görülən işi qeyd et" formasında **"Uzunmüddətli iş — ödəniş planı ilə"** seçilir. Başlanğıc və bitmə tarixi və ödəniş planı yazılır.
- **"Planı hazırla" düyməsi:** ay sayını və hissələri (ayın əvvəli / ortası / sonu) seçəndə sətirlər tarixləri ilə yaranır.
  - Məbləğləri siz yazırsınız.
  - Son sətir **"qalan məbləğ"** olur və avtomatik hesablanır.
  - Aylar başlanğıc tarixindən sayılır, heç bir tarix işin başlanğıcından əvvələ düşmür.
- **Nümunə:** 2 aylıq iş, 4 000 AZN. Plan: 1000 / 500 / 1000 / 300 / 400 / qalan 800.
- **Plan yoxlanır:** cəmi razılaşmadan çoxdursa və ya pulun bir hissəsi plana düşməyibsə, xəbərdarlıq çıxır.
- **Ödənişlər:** hər real ödəniş **adi xərcdir** (Usta və fəhlə haqqı, xidmət sətri). Günə, aya, büdcəyə və Excel-ə bir dəfə düşür.
  - Ödəniş qalan məbləğdən çox ola bilməz.
  - Eyni sorğu iki dəfə göndərilsə, ödəniş ikinci dəfə yazılmır.
- **Plan sətirlərinin statusu:** ödənişlər plana sıra ilə yazılır: "Ödənilib", "Qismən", "Vaxtı keçib", "Gözlənilir".
- **Kart:** "Ustalarla razılaşmalar" kartında razılaşma, ödənilən, qalan, növbəti ödəniş, vaxtı keçən məbləğ və ustanın etirazları görünür.
- **Ödəniş etmək:**
  - kartdan "Ödəniş et" ilə (növbəti planlı məbləğ hazır yazılır);
  - və ya "Görülən işi qeyd et" → "Uzunmüddətli işə ödənişdir?" seçimi ilə.
- **Dəyişmək:**
  - iş artanda məbləğ və plan dəyişdirilir, amma məbləğ artıq ödəniləndən az ola bilməz;
  - razılaşmanı bağlamaq və yenidən açmaq olar.

## Usta ilə paylaşım
- **Link:** "Ustaya link yarat" hesabsız link verir: `/razilasma/<token>` (bazada yalnız SHA-256 saxlanılır). Kopyalamaq və ya WhatsApp ilə göndərmək olar.
- **Usta yalnız bu razılaşmanı görür:** iş, hesablama, ümumi məbləğ, ödənilən, qalan, plan və ödənişlər. Evin digər xərclərini, ünvanı, ev sahibinin qeydlərini və telefonu görmür.
- **Hər ödəniş üçün:** **"Aldım"** basa bilər və ya **"Düz deyil"** basıb qeyd yazar (qeyd məcburidir, məs. "450 aldım, 500 yox").
- **Ev sahibi görür:** "Usta təsdiqlədi" və ya "Usta etiraz edib: …" yazısını, linkin açılıb-açılmadığını. Bunlar jurnalda da qeyd olunur.
- **Linki bağlamaq:** ev sahibi istədiyi vaxt bağlayır və link daha açılmır.

## Texniki
- **Baza** (yalnız əlavələr):
  - yeni cədvəllər `work_agreements` və `work_agreement_plan`;
  - `finance_expenses.agreement_id`;
  - `finance_payments.counterparty_note` (ustanın qeydi).

  Ustanın cavabı mövcud `finance_payments.status` sahəsinə yazılır (`confirmed` / `disputed`).
- **API:**
  - `GET/POST /home-projects/:id/agreements`, `GET/PUT /home-projects/:id/agreements/:aid`;
  - `POST .../payments`, `POST/DELETE .../share`;
  - ictimai: `GET /agreement-links/:token`, `POST /agreement-links/:token/payments/:paymentId`.
- **Kod:**
  - `lib/agreements.ts`: plan hesabı, təmiz modul;
  - `routes/agreements.ts`;
  - veb: `pages/expenses/work-entry.tsx`, `agreement-link-page.tsx`.

## Testlər
- **Unit:** 46/46 (5 yeni; sizin nümunə: 4 000, plan, qalan 800, vaxtı keçən, qismən).
- **API** (`agreements-e2e`): 26/26.
- **Brauzer, telefon** (`wf-flow`):
  - material forması;
  - qazıntı 100 + su çəni 200 = 300;
  - günlük 5 × 60 qismən;
  - 2 aylıq razılaşma, plan, ödənişlər;
  - ustanın linki, "Aldım" və etiraz;
  - qalıqdan çox ödənişin rədd edilməsi.
- **Reqressiya:** `daily-flow`, `svc-flow`, `budget-flow`, `xl-flow`, `two-flow`, `daily-e2e` 37, `finance-e2e` 80, `books-e2e` 26, `home-e2e` 193.
