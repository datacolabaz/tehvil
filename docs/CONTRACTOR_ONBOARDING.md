# Contractor acquisition and onboarding

How a renovation contractor finds Təhvil, signs up, sets up a company profile and
sends a first estimate. It builds on AI Smeta ([AI_SMETA.md](./AI_SMETA.md)).

Demo path: `/podratcilar-ucun` → sign-up → onboarding (3 questions, company
profile) → `/smeta/new?guide=1` → estimate page → send to client → the client
approves on `/estimate/:token` → the `/smeta` checklist shows the approval.

## Routes

| Route | Access | Page |
| --- | --- | --- |
| `/podratcilar-ucun` | Public | Contractor landing: hero, how it works, 6 benefits, before/after, pricing, demo form |
| `/podratcilar-ucun/qeydiyyat` | Public (signed-in users go to `/onboarding`) | Step 1 "Təhvil-ə qoşulun" |
| `/podratcilar-ucun/qeydiyyat/sso-callback` | Public | Google OAuth return URL |
| `/onboarding` | Signed in | Steps 2–4. Legacy accounts are sent to `/smeta` |
| `/settings/company-profile` | Signed in (app shell) | Full company profile and estimate defaults |
| `/settings/plan` | Signed in (app shell) | Current plan and pricing cards |

The landing is linked from the main landing nav and footer ("Podratçılar üçün"),
the static boot HTML in `index.html` and `public/sitemap.xml`. The sidebar has
"Şirkət profili" and "Plan" when no renovation project is open.

Nobody is forced through onboarding: only the contractor sign-up flow leads to
`/onboarding`. The old `/sign-up` page is unchanged.

## Sign-up and Clerk

Clerk stays the identity provider and Təhvil never sees or stores passwords. The
contractor form (`pages/contractors/signup-page.tsx`) uses Clerk's classic
`useSignUp` (`@clerk/react/legacy`) so it can match the design system:

1. `signUp.create` with e-mail, password, first/last name and
   `unsafeMetadata: { signupIntent: 'contractor', phone, termsAcceptedAt }`.
   If the instance rejects the name fields (`form_param_unknown`), it retries
   without them.
2. Clerk requires e-mail verification on this instance, so the form switches to
   a 6-digit code step (`prepareEmailAddressVerification` /
   `attemptEmailAddressVerification`), then calls `setActive`.
3. Name, phone and consent time are also kept in `sessionStorage` for the next
   page. `/onboarding` sends them to `PUT /api/contractor/onboarding`. The server
   records `terms_accepted_at` and `signup_source` once and never overwrites them.

Clerk errors are mapped to Azerbaijani messages. The form includes
`<div id="clerk-captcha" />` because the instance uses bot protection.

**Google** is shown only when the Clerk instance has `oauth_google` enabled. This
is read at runtime from Clerk's environment
(`userSettings.socialProviderStrategies`), so turning Google off in the Clerk
dashboard hides the button. Google sign-up still requires the terms checkbox, and
it uses `authenticateWithRedirect`, returning through the SSO callback route to
`/onboarding`. The phone is then asked in step 2.

Phone sign-in is disabled in Clerk, so the phone is profile data, not an
identifier.

## Onboarding

| Step | Content | Saved to |
| --- | --- | --- |
| 1 | Name, phone, e-mail, password, terms | Clerk + `contractor_accounts` |
| 2 | Business type, monthly projects, main challenge (+ phone if missing) | `contractor_accounts` |
| 3 | Company name, logo, phone, e-mail, city, Instagram, website, services. CTA "İlk smetamı yarat" | `contractor_company_profiles` |
| 4 | 3-step first-project checklist with %, button "Yeni smeta yarat" | `onboarding_status = completed` |

"Sonra tamamlayaram" marks onboarding `skipped` and goes to `/smeta`. The step is
stored, so a reload resumes where the user left.

In the wizard (`/smeta/new?guide=1`) and on the created estimate's page, a strip
shows the 3 first-project steps. The estimate page offers "Sifarişçiyə göndər"
until the estimate is shared.

## Activation checklist

`components/contractor/activation-checklist.tsx`, shown on top of `/smeta`:
"İlk layihənizi hazırlayın", "x / 5 tamamlandı".

| Item | Done when (computed by the server from real data) |
| --- | --- |
| Şirkət profilini tamamlayın | Profile has a name, phone (9+ characters) and city |
| İlk smetanı yaradın | At least one saved AI Smeta project |
| Sifarişçi əlavə edin | A project has a client phone with 9+ digits |
| Smetanı paylaşın | A share link exists |
| İlk foto sübutu əlavə edin | A project has a photo |

Each item links to the page that completes it. The checklist can be dismissed
(×) and reopened ("İlk layihə planı · x / 5"); the state is stored on the
server. It shows the reward text until the first client approval, then a short
"approved" message. Legacy accounts do not see it.

## Company profile

Stored per Clerk user in `contractor_company_profiles`. Fields: name, logo,
description, phone, e-mail, city, service area, website, Instagram, services
(suggested chips plus custom), team members, and estimate defaults: payment
schedule preset (`30-40-30`, `50-50`, `30-30-30-10`, `100-end`), payment note,
link validity (7–90 days), waste % (blank keeps the per-category defaults) and
margin %.

**Defaults feed new estimates** (`lib/contractor/options.ts → estimateDefaults`):
margin, waste, validity (`validUntil` and the share link expiry) and the payment
schedule. The estimate's contractor block comes from the profile and the Clerk
name. The made-up experience, project count and rating fields are now always 0
and are no longer displayed.

**Logo**: uploaded with the existing evidence upload flow (`requestUploadUrl` →
PUT to object storage), then `PUT /api/contractor/company-profile/logo` claims
the upload row. That route checks the owner, expiry, declared type (PNG, JPEG or
WebP) and size against the stored object. The private object is served publicly
only through `GET /api/company-logos/:profileId`, with cache-busting `?v=` and
`nosniff`/sandbox headers. SVG is not accepted.

**Cover image**: not implemented. The public estimate header is compact and the
design system has no cover-image slot. It can be added to the same table later.

### Public estimate header

When an estimate is sent, the server freezes a public-safe copy of the profile
into the share snapshot: name, logo URL, phone, e-mail, city, service area,
website, Instagram, services and payment note. Team members, defaults and ids are
never included. Old links (before this change) fall back to the live profile,
then to the contractor name and phone.

The header always says:

- "Bu smeta [Şirkət adı] tərəfindən Təhvil vasitəsilə hazırlanıb."
- "Smeta və təsdiq tarixçəsi Təhvil-də qeydə alınıb."

Təhvil does not vet contractors, so nothing says "verified" or similar.

## Plans and entitlements

`artifacts/tehvil/src/lib/entitlements.ts` is the single place for plans, features
and limits.

| Plan | Limits and features |
| --- | --- |
| Başlanğıc | 1 active project, basic estimate, share link, PDF |
| Peşəkar | Multiple projects, Excel export, change orders, expense tracking, photo evidence, company branding, team members |
| Biznes | Peşəkar + roles, advanced reports, custom branding, priority support |

Prices are not public ("Qiymət üçün əlaqə saxlayın"). There is no billing: the
plan lives in `contractor_accounts.plan` and is changed manually (set
`plan_source = 'manual'`).

**Soft gating (default)**: `ENFORCEMENT = 'soft'`. A gated action still works. At
most once per feature every `NUDGE_COOLDOWN_DAYS` (7), a dialog explains which
plan includes it, with "İndilik davam et" and "Peşəkar plana keçin", which opens
the lead form. Set `ENFORCEMENT = 'hard'` to block instead.

Gates: new project beyond the limit (wizard), Excel export, change orders,
expenses, photo evidence and team members. **Demo projects are never gated.**
While the account is loading or unavailable, nothing is gated.

**Existing users are not locked out**: when the account row is first created, a
user with AI Smeta projects, renovation projects or project participation gets
`plan = pesekar`, `plan_source = legacy`, `onboarding_status = skipped`, no
checklist and no nudges.

**Value nudge**: after the first real estimate is sent on Başlanğıc, the send
dialog shows once: "İlk smetanız hazırdır. Excel export və dəyişiklik
idarəetməsini açmaq üçün Peşəkar plana keçin."

## Demo and lead requests

`DemoRequestForm` (landing `#demo`, pricing "Əlaqə saxla", upgrade dialog, plan
page) collects: name, company, phone, monthly projects, main challenge (list or
free text), preferred contact time. The success text comes from the server: "Müraciətiniz
qeydə alındı. Təhvil komandası sizinlə əlaqə saxlayacaq."

`POST /api/demo-requests` is public. It validates the input (phone: 9–15 digits),
limits each IP to 5 requests per 10 minutes, ignores bots that fill the hidden
`website` field (returns 201 without storing), links the Clerk user when signed
in, stores the row in `lead_requests` and calls the `LeadSink`.

**CRM integration point**: `artifacts/api-server/src/lib/leadSink.ts`. The default
sink logs a masked notice. Call `setLeadSink()` at startup with a sink that sends
to the CRM, Slack or e-mail (`TODO(crm)`). Sink errors are logged and never fail
the request.

## Analytics

`artifacts/tehvil/src/lib/analytics.ts`: typed events, one `AnalyticsSink`.
Development logs `[analytics]` to the console and keeps the last 50 events in
`window.__tehvilAnalytics()`. Production uses a no-op sink until a vendor is
connected with `setAnalyticsSink` in `main.tsx`. Properties never contain names,
phones, e-mails or tokens.

| Event | Fired in |
| --- | --- |
| `contractor_landing_viewed` | Landing mount |
| `contractor_signup_started` | First focus or submit of the sign-up form, Google click |
| `contractor_signup_completed` | After `setActive` (e-mail) or on `/onboarding` after Google |
| `onboarding_completed` | "Yeni smeta yarat" in step 4, or skip (`skipped: true`) |
| `company_profile_completed` | Profile saved and complete (onboarding or settings) |
| `estimate_created` | `smeta.createProject` |
| `estimate_shared` | `smeta.shareEstimate` |
| `estimate_client_viewed` | Public page, once per token and version |
| `estimate_client_approved` | Client approval (public page) |
| `change_order_created` | `smeta.addChangeOrder` |
| `change_order_approved` | Contractor records approval, or the client approves on the public page |
| `expense_added` | `smeta.addExpense` |
| `photo_evidence_added` | `smeta.addPhoto` |
| `export_started` / `export_completed` | `runExport` (Excel, PDF) |
| `upgrade_clicked` | Upgrade dialog, value nudge, pricing cards, plan page |
| `demo_requested` | Lead form success |

## Data model and API

Tables (`lib/db/src/schema/contractor.ts`):

- `contractor_accounts`: one row per Clerk user, created lazily on the first
  `GET /api/contractor/account`. Holds onboarding answers, consent time, plan and
  checklist state.
- `contractor_company_profiles`: one row per user (unique `owner_user_id`).
- `lead_requests`: demo requests, with IP and user agent for abuse review.

Endpoints (`lib/api-spec/openapi.yaml`, tag `contractor`):

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/contractor/account` | Signed in. Account, plan, checklist facts, usage, profile |
| PUT | `/api/contractor/onboarding` | Signed in |
| PUT | `/api/contractor/checklist` | Signed in. `{ dismissed }` |
| PUT | `/api/contractor/company-profile` | Signed in. Upsert |
| PUT / DELETE | `/api/contractor/company-profile/logo` | Signed in |
| GET | `/api/company-logos/:profileId` | Public |
| POST | `/api/demo-requests` | Public, rate-limited |

Every signed-in route works only on the caller's own rows. `GET /api/shared-estimates/:token`
now also returns `company`.

## Language

All contractor pages are written in Azerbaijani and marked `lang="az"`. RU and EN
users see the Azerbaijani pages (the product's primary market). Only the new nav
labels ("Şirkət profili", "Plan", "Podratçılar üçün") are in `i18n.ts` for all
three languages. Translating the contractor pages means moving the copy in
`lib/contractor/landing-content.ts` and the page files into `i18n.ts`.

## Mocks and placeholders

- Landing product preview: a labelled sample ("Nümunə layihə"), not live data.
- No logos, testimonials or usage numbers anywhere.
- Plans: no billing or checkout. The plan is changed manually in the database.
- Leads: stored and logged; no CRM yet (`LeadSink`).
- Analytics: no vendor yet (`setAnalyticsSink`).

## Deploying

1. **Before deploying the backend**, create the new tables:
   `pnpm --filter @workspace/db run push` against the production `DATABASE_URL`.
   This adds `contractor_accounts`, `contractor_company_profiles` and
   `lead_requests` and changes no existing table. On Windows the default drizzle
   config fails with "No schema files found"; run it from Linux or CI.
2. Deploy the API, then the web app. Without step 1 the account and lead
   endpoints return 500, and the web app then hides the checklist and gates.
3. Existing users get their account row (as legacy) the first time they open
   the app after the deploy.
4. Optional: in Clerk, keep e-mail verification and bot protection on. Turning
   Google off hides the Google button automatically.
