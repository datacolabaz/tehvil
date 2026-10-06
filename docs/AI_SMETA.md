# AI Smeta

AI Smeta turns Təhvil from a photo handover tool into renovation management:
an AI-assisted initial measurement and estimate, budget control against real
spending, change orders and client approval.

The working rule behind every screen: **AI proposes, the contractor reviews,
corrects and approves, the client only sees the approved (sent) version.**
AI output is always labelled as a proposal ("AI təklifi", "≈", "Yoxlanmalıdır")
and never presented as an exact measurement.

The UI lives in the web app (`artifacts/tehvil`). It reuses the existing design
system (`index.css` tokens and classes such as `.surface`, `.button`, `.field`,
`.eyebrow`, `.aside-panel`), the existing app shell, Wouter routing and Clerk
auth. Module-specific styles are in `src/smeta.css` and are all prefixed `sm-`.

Projects are stored in PostgreSQL through the API server (`artifacts/api-server`,
`/api/smeta/*`), and client share links are served by public, token-keyed
endpoints (`/api/shared-estimates/*`). See [Persistence and share links](#persistence-and-share-links).
AI services and SMS/e-mail delivery are still mocked; the sections below list
exactly where they plug in.

## Routes

| Route | Access | Page |
| --- | --- | --- |
| `/smeta` | Signed in (`Protected`) | `SmetaDashboardPage` – portfolio, stats, AI insight, pending actions, templates |
| `/smeta/new` | Signed in | `NewEstimatePage` – 4-step wizard. Supports `?template=<id>` and `?source=drawing` |
| `/smeta/:projectId` | Signed in | `EstimateDetailPage` – header, actions, 7 tabs. Active tab is kept in `?tab=` |
| `/smeta/:projectId/print` | Signed in | `EstimatePrintPage` – printable estimate, opens the print dialog (PDF) |
| `/estimate/:publicToken` | **Public** | `PublicEstimatePage` – client view, approval, revision request, change decisions |

Tab ids for `?tab=`: `summary`, `estimate`, `drawing`, `changes`, `expenses`,
`photos`, `documents`.

The nav entry "AI Smeta" (with a "Yeni" badge) and a promo card on the existing
dashboard are added in `src/App.tsx`. The i18n keys `smeta`, `newBadge` and
`smetaPromo` are in `src/lib/i18n.ts`; the module's own copy is Azerbaijani only.
The module pages are lazy-loaded so they are not part of the main bundle.

Demo data: the seeded project `narimanov-2-otaq` ("Nərimanov, 2 otaqlı mənzil")
has an estimate total of exactly **24 860 AZN**, actual spending of 8 940 AZN and
1 240 AZN of approved changes. Its public link is `/estimate/nrm-7f3k2q9d`.

Demo projects are **browser-only** and are never written to the database
(localStorage `tehvil-smeta-demo-v1`, marked `demo: true`). They contain a
fabricated client approval, fake phone numbers and a fixed, guessable share
token, none of which should exist as real records or as a working public link
on the server. Seeding them per user on the server would also put sample rows
into every new contractor account and make "reset demo" a destructive server
operation. Instead:

- A contractor with no saved projects sees the demo projects, labelled
  "· Demo", so the module is not empty on first visit.
- Once they have their own projects the demos are hidden; "Demo layihələri
  göstər / gizlət" on the dashboard toggles them (`tehvil-smeta-show-demo`).
- Demo projects stay fully interactive. Edits, sending and the public page
  (`/estimate/nrm-7f3k2q9d`, including approval) run locally through the same
  code paths and response shape as server projects.
- "Demo məlumatlarını sıfırla" restores the seed data and only touches demos.

## Files

### Domain layer – `src/lib/smeta/`

| File | Purpose |
| --- | --- |
| `types.ts` | Typed models: `Project`, `Estimate`, `EstimateSection`, `EstimateLineItem`, `Measurement`, `Drawing`, `ChangeOrder`, `Expense`, `Receipt`, `PhotoEvidence`, `EstimateShare`, `ClientApproval`, `ExportJob`, `SmartTemplate`, … |
| `calc.ts` | All money maths (see formulas below). Pure functions, rounded to 2 decimals |
| `catalog.ts` | Work categories, labels, default waste %, quality factors, the line-item generator used by the wizard (`generateSections`), smart templates (`TEMPLATES`) |
| `mock-data.ts` | Seed projects (`createSeedProjects`), the sample floor plan and its measurements, the default contractor profile |
| `store.ts` | Client store (`useSyncExternalStore`) and all mutations (`smeta.*`). Loads and saves server projects through the generated API client; keeps demo projects in localStorage |
| `shared.ts` | `useSharedEstimate(token)` for the public page: fetches `/api/shared-estimates/:token` (or builds the same shape locally for demo links) and exposes approve / revision / change-order actions |
| `ai.ts` | Mock AI services: drawing takeoff, receipt extraction, market price refresh, budget insights, scenarios, assistant |
| `export.ts` | Excel workbook definition (6 sheets) and print/PDF entry point |
| `xlsx.ts` | Small zero-dependency `.xlsx` writer (stored zip + SpreadsheetML) |
| `format.ts` | Azerbaijani formatting: `num`, `qty`, `azn` ("24 860 AZN"), `signedAzn`, `pct`, `dateAz` ("06 oktyabr 2026"), number parsing with decimal comma |

### Components – `src/components/smeta/`

| File | Purpose |
| --- | --- |
| `ui.tsx` | Module primitives: status/confidence/source pills, `Modal`, `Drawer`, toasts (`toast`, `SmetaToaster`), `NumberInput`, `DropMenu`, skeletons |
| `estimate-table.tsx` | Interactive estimate table: inline editing, per-line waste and margin, approve AI lines, refresh market price, duplicate/delete with undo, sections, project costs, sticky totals bar, mobile cards |
| `takeoff-tab.tsx` | "Çertyoj və ölçülər": SVG floor plan, drawing upload and analysis steps, measurement review (edit/approve), apply measurements to estimate quantities |
| `summary-tab.tsx` | "Xülasə": finance cards, plan vs actual vs forecast, insights, cost breakdown, scenarios |
| `changes-tab.tsx` | "Dəyişikliklər": change order timeline and form (financial impact, photos, client decision) |
| `expenses-tab.tsx` | "Xərclər": variance cards, expense table, expense form with receipt upload and AI prefill |
| `photos-tab.tsx` | "Foto sübutlar": grouping by phase/room/date/work package, client visibility |
| `documents-tab.tsx` | "Sənədlər": Excel/PDF, payment schedule, share link, client decisions |
| `send-modal.tsx` | "Sifarişçiyə göndər" flow and success state |
| `assistant-drawer.tsx` | "AI Smeta köməkçisi" drawer (Phase 2) |
| `scenarios.tsx` | Ekonom / Standart / Premium comparison (Phase 2) |
| `export-actions.ts` | `runExport` – runs an export, records it, shows the toast |

### Pages – `src/pages/smeta/`

`dashboard-page.tsx`, `new-estimate-page.tsx`, `estimate-page.tsx`,
`public-estimate-page.tsx`, `print-page.tsx`.

## Formulas (`calc.ts`)

Per line item:

```
materialTotal = quantity × materialUnitPrice
laborTotal    = quantity × laborUnitPrice
rowSubtotal   = materialTotal + laborTotal + additionalCost
wasteAmount   = materialTotal × wastePercentage
marginAmount  = (rowSubtotal + wasteAmount) × marginPercentage   (line override or project default)
rowTotal      = rowSubtotal + wasteAmount + marginAmount
```

Estimate and budget:

```
estimateTotal    = Σ rowTotal + Σ project-level costs
agreedBudget     = estimateTotal + approved change orders
remainingBudget  = estimateTotal − actualSpending
budgetVariance   = actualSpending − estimateTotal
forecastFinal    = actualSpending + agreedBudget × (1 − completion)
clientFinalTotal = sent estimate total + approved change orders
```

Budget health: forecast more than 2% over the agreed budget is "Büdcəni keçir".
Any overrun, or a category whose material purchases exceed plan by more than 3%,
is "Diqqət tələb edir".

## Versioning and the client view

- The contractor always edits the live `project.estimate`; edits are saved to the
  server as drafts and are never visible to the client.
- "Sifarişçiyə göndər" calls `POST /api/smeta/projects/:id/share`. The server
  stores a row in `smeta_estimate_versions` with the internal snapshot (estimate,
  project costs, margin) and a separately computed **public snapshot**, and the
  public page renders only that public snapshot. The detail page shows a
  "hələ göndərilməyib" banner while there are unsent edits.
- Sending again after edits creates a new version (v2 → v3) and requires a new
  client approval. Sending again without edits keeps the version and only
  refreshes the validity (the company profile's default, otherwise 30 days). The share token stays the same, so a saved link
  always shows the latest sent version.
- Editing an approved line after the client approved it marks it "Dəyişdirilib".
- Change orders never modify the base estimate. They are added to the final total
  only when approved (by the contractor recording the decision, or by the client on
  the public page).

## What is real and what is mocked

| Area | Status |
| --- | --- |
| Calculations, totals, budget forecast, scenarios | Real (client-side, deterministic) |
| Estimate editing, measurements, change orders, expenses, payment schedule, versioning | Real. **Persisted in PostgreSQL** per contractor (Clerk user) |
| Share links, client approval, revision requests, client change-order decisions | Real. Public token endpoints, validity (company default, otherwise 30 days) enforced by the server, audit fields stored |
| Demo projects (Nərimanov, …) | Browser-only by design (see Routes) |
| Excel export | Real `.xlsx` generated in the browser (6 sheets) |
| PDF export | Browser print of `/smeta/:id/print` ("PDF kimi saxla") |
| Drawing takeoff (`analyzeDrawing`) | **Mock** – always returns the sample Nərimanov plan |
| Receipt OCR (`extractReceipt`) | **Mock** – returns a plausible suggestion |
| Market prices (`fetchMarketPrice`) | **Mock** – small deterministic drift |
| AI assistant (`askAssistant`) | **Rule-based mock** over the project data |
| Sending SMS / e-mail | **Not implemented** – behind `SmetaNotifier`; the default logs the event. The contractor copies the link from the send dialog |
| Uploaded photos / receipt images | Metadata is saved; the files are object URLs for the current session only (`objectPath` is reserved for App Storage / S3) |

## Integration points

All are marked in code with `TODO(api)`, `TODO(ai)` or `TODO(notify)`.

### Notifications – `artifacts/api-server/src/lib/smetaNotifications.ts`

`SmetaNotifier` has three events: `estimateSent` (with the share URL, client
phone and e-mail), `estimateApproved` (only when the contractor ticked "notify
on approve") and `revisionRequested`. The default `logNotifier` writes a log line
with the phone number masked. Register an SMS / e-mail implementation with
`setSmetaNotifier(...)` at startup. Calls are fire-and-forget, so a failing
provider never fails the HTTP request.

### Files – receipts and photos

Only metadata is stored (`smeta_receipts`, `smeta_photos`, `object_path` is null).
Upload through the existing presigned-URL flow (`/api/storage/uploads/request-url`)
and save the returned path in `objectPath`.

## Persistence and share links

### Database – `lib/db/src/schema/smeta.ts`

Core entities are relational; only versioned snapshots and small
client-generated structures (drawing geometry, price/quantity source,
included/excluded lists, export history) are JSON. Child tables use the
composite key `(project_id, id)` because the client generates child ids, and
they all cascade on project delete.

| Table | Contents |
| --- | --- |
| `smeta_projects` | Project + estimate header: `owner_user_id` (Clerk user), address, client, contractor profile, default margin, `status`, `estimate_version`, `valid_until` |
| `smeta_estimate_sections` | Sections (category, order) |
| `smeta_line_items` | Line items: quantity, unit prices, waste/margin ratios, status, AI confidence, price/quantity source |
| `smeta_project_costs` | Project-level costs (transport, debris removal, …) |
| `smeta_measurements` | Takeoff measurements and their review status |
| `smeta_change_orders` | Change orders with deltas, status and `decided_by` (`contractor` / `client`) |
| `smeta_expenses`, `smeta_receipts` | Actual spending and receipt metadata (OCR suggestion as JSON) |
| `smeta_photos` | Photo evidence metadata (phase, room, client visibility) |
| `smeta_payment_milestones` | Payment schedule |
| `smeta_estimate_versions` | One row per sent version: internal snapshot, public snapshot, total, sender, time |
| `smeta_shares` | One link per project: unguessable `token`, sent version, client contact, message, `expires_at`, `revoked_at` |
| `smeta_client_approvals` | Approvals: version, name, phone, consent, total, IP address, user agent, time (one per version) |
| `smeta_revision_requests` | Client revision requests with IP address and user agent |

Money is `numeric(14,2)`, quantities `numeric(14,3)`, unit prices
`numeric(14,4)` and ratios `numeric(7,4)`, all returned as numbers by the API.

### API – `lib/api-spec/openapi.yaml` (tag `smeta`)

Authenticated (Clerk session; every route checks `owner_user_id`, other users
get 404):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/smeta/projects` | List the contractor's projects |
| POST | `/api/smeta/projects` | Create (server assigns the id unless a new UUID is given) |
| GET | `/api/smeta/projects/:projectId` | Read one |
| PUT | `/api/smeta/projects/:projectId` | Save the whole project document |
| DELETE | `/api/smeta/projects/:projectId` | Delete with all child rows |
| POST | `/api/smeta/projects/:projectId/share` | Send: new version if changed, create or reuse the link, extend validity (company default, otherwise 30 days) |
| DELETE | `/api/smeta/projects/:projectId/share` | Revoke the link (the next send issues a new token). No UI yet |

Public (no auth, keyed by the share token, `Cache-Control: no-store`):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/shared-estimates/:token` | Sent version only: public snapshot, live client-visible change orders, payment amounts, approval state |
| POST | `/api/shared-estimates/:token/approve` | `{ version, name, phone, consent: true }`; stores IP and user agent |
| POST | `/api/shared-estimates/:token/revision` | `{ version, name, message }` |
| POST | `/api/shared-estimates/:token/change-orders/:changeOrderId/decision` | Client approves or rejects a pending change order |

Rules enforced on the server:

- **Ownership:** every contractor route loads the project with
  `owner_user_id = getAuth(req).userId`.
- **Server-controlled fields:** `PUT` replaces the editable document (sections,
  lines, costs, measurements, change orders, expenses, photos, payments) in one
  transaction. Status, version, validity, share, approvals and revision requests
  are ignored in the body. Change orders decided by the client cannot be changed
  or deleted by the contractor.
- **No draft or margin leaks:** the public snapshot is built server-side when
  sending (`smetaCalc.ts`). Each line carries only all-in amounts, with waste
  folded into material and margin folded into material, labour and additional
  cost. The internal snapshot, ratios, price sources, expenses, owner and audit
  fields are never part of a public response, and responses are parsed through
  the generated Zod schema.
- **Validity:** a link resolves only while `revoked_at IS NULL AND expires_at > now()`
  (the company profile's `default_validity_days`, otherwise 30 days, from the
  last send). Expired or revoked links return 404. The public snapshot also
  freezes the public-safe company header at send time; see
  [CONTRACTOR_ONBOARDING.md](./CONTRACTOR_ONBOARDING.md).
- **Stale actions:** approval and revision requests must name the version the
  client saw. Older versions get 409, approving twice is idempotent, and a
  revision request after approval gets 409.
- **Abuse limits:** reads are limited to 120/min per IP and writes to 10 per
  10 minutes per IP and token (in memory, per API process). Bodies are validated
  against the OpenAPI schemas.

Tokens are 24 random bytes (base64url, 32 characters), stored in a unique column
so the contractor can see and resend the same link. Request logs redact the
token from `/shared-estimates/` URLs.

### Frontend – `store.ts`

The pages still only use the hooks (`useSmetaProjects`, `useSmetaProject`,
`useSmetaLoading`, `useSmetaSyncStatus`, …) and `smeta.*` actions.

- Projects load once per session; switching the Clerk user clears the store.
- Every mutation updates local state immediately and schedules a debounced
  (600 ms) `PUT` of the whole project. Saves are sequential per project, and a
  response never overwrites newer local edits. Pending saves are flushed when
  the tab is hidden, and the browser warns before closing with unsaved changes.
- The estimate header shows "Saxlanılır… / Yadda saxlanılıb / Saxlanılmadı"
  with a retry button.
- `createProject` and `shareEstimate` are awaited; the wizard and send dialog
  show progress and error toasts.
- The public page uses `useSharedEstimate`, which handles loading, missing or
  expired links (400/404), 409 (reloads to show the current state) and 429.

### Setup

1. `DATABASE_URL` must point at the PostgreSQL database (already required by the
   API).
2. Create the new tables once, from an environment connected to that database,
   and review the plan before confirming:

   ```sh
   pnpm --filter @workspace/db run push
   ```

   The change only adds `smeta_*` tables, so drizzle-kit should not propose
   dropping anything. If it does, stop and investigate. The schema was verified
   with `drizzle-kit push` against an empty local PGlite database only.
3. Optional: `PUBLIC_APP_URL` (already used for CORS and Clerk) is also used to
   build share links. Without it the link uses the forwarded host of the request.
4. Railway: no new variables or services. Deploy the API (`backend` branch) and
   the frontend (`frontend` branch) as described in `deploy/RAILWAY.md`, and run
   the push in step 2 **before** the new API version takes traffic. The frontend
   proxy streams `/api` bodies (project saves allow up to 2 MB) and passes
   Railway's `X-Forwarded-For` through, so the rate limit and the IP stored on
   approvals use the client address.

### Known limitations

- Saves send the whole document (last write wins). Two tabs editing the same
  project can overwrite each other's edits; add an `updatedAt` precondition if
  that becomes a problem.
- The rate limiter is in memory, so limits apply per API replica and reset on
  restart.
- Share tokens are stored in plain text (unlike passport share hashes) so the
  link can be shown again. Anyone with database read access can open active
  links.
- No UI for revoking a link yet (the API exists).
- Photos and receipt files are not uploaded yet (metadata only).

### AI – `ai.ts`

| Function | Replace with |
| --- | --- |
| `analyzeDrawing(file, onStep)` | Takeoff service (PDF/DWG/image → rooms, areas, perimeters, openings with confidence). Keep returning `Measurement[]` with `status: 'suggested'` so the review flow stays mandatory |
| `extractReceipt(file)` | Receipt OCR (vendor, date, total, VAT, category guess) |
| `fetchMarketPrice(item)` | Supplier price feed / scraper with source and date |
| `askAssistant(project, prompt)` | LLM call with `projectContext(project)` as grounding; keep answers hedged |
| `budgetInsights`, `portfolioInsight`, `priceScenarios` | Can stay rule-based or move server-side |

### Export – `export.ts`, `print-page.tsx`

The Excel file is generated client-side and is complete. For signed, archived
documents add `POST /api/smeta/:id/exports` that renders the PDF server-side
(for example headless Chromium on the print route) and stores the file.
`ExportJob` already has a `status` field for queued/ready jobs.

## Decisions for the product owner

- Whether the client view should show line-level prices or section totals only
  (currently each line shows its all-in total; margin and waste are never shown
  separately and are not sent to the browser).
- SMS / e-mail provider for sending links and approval notifications.
- Payment schedule percentages (default 30/30/30/10) and the change-order policy text.
- Default margin (15%) and waste percentages per category (`catalog.ts`).
- Whether the module should be translated to Russian/English like the rest of the app.
- Retention and signature requirements for client approvals (legal weight).
