# AI Smeta

AI Smeta turns Təhvil from a photo handover tool into renovation management:
an AI-assisted initial measurement and estimate, budget control against real
spending, change orders and client approval.

The working rule behind every screen: **AI proposes, the contractor reviews,
corrects and approves, the client only sees the approved (sent) version.**
AI output is always labelled as a proposal ("AI təklifi", "≈", "Yoxlanmalıdır")
and never presented as an exact measurement.

The module lives entirely in the web app (`artifacts/tehvil`). It reuses the
existing design system (`index.css` tokens and classes such as `.surface`,
`.button`, `.field`, `.eyebrow`, `.aside-panel`), the existing app shell,
Wouter routing and Clerk auth. Module-specific styles are in `src/smeta.css`
and are all prefixed `sm-`.

Everything currently runs on the client with mock data. The sections below list
exactly where the backend, AI and export services plug in.

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
"Demo məlumatlarını sıfırla" on the dashboard restores the seed data.

## Files

### Domain layer – `src/lib/smeta/`

| File | Purpose |
| --- | --- |
| `types.ts` | Typed models: `Project`, `Estimate`, `EstimateSection`, `EstimateLineItem`, `Measurement`, `Drawing`, `ChangeOrder`, `Expense`, `Receipt`, `PhotoEvidence`, `EstimateShare`, `ClientApproval`, `ExportJob`, `SmartTemplate`, … |
| `calc.ts` | All money maths (see formulas below). Pure functions, rounded to 2 decimals |
| `catalog.ts` | Work categories, labels, default waste %, quality factors, the line-item generator used by the wizard (`generateSections`), smart templates (`TEMPLATES`) |
| `mock-data.ts` | Seed projects (`createSeedProjects`), the sample floor plan and its measurements, the default contractor profile |
| `store.ts` | Client store (`useSyncExternalStore` + localStorage `tehvil-smeta-v1`) and all mutations (`smeta.*`). Contains the `SmetaRepository` seam |
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

- The contractor always edits the live `project.estimate`.
- `smeta.shareEstimate` freezes a snapshot (`share.snapshot`, plus project costs
  and margin) and the public page renders **only** that snapshot. Unsent edits are
  never visible to the client; the detail page shows a "hələ göndərilməyib" banner.
- Sending again after edits creates a new version (v2 → v3) and requires a new
  client approval. The share token stays the same, so a saved link always shows
  the latest sent version.
- Editing an approved line after the client approved it marks it "Dəyişdirilib".
- Change orders never modify the base estimate. They are added to the final total
  only when approved (by the contractor recording the decision, or by the client on
  the public page).

## What is real and what is mocked

| Area | Status |
| --- | --- |
| Calculations, totals, budget forecast, scenarios | Real (client-side, deterministic) |
| Estimate editing, measurements, change orders, expenses, photos, versioning, approval flow | Real UI and logic. **Persisted only in this browser's localStorage** |
| Excel export | Real `.xlsx` generated in the browser (6 sheets) |
| PDF export | Browser print of `/smeta/:id/print` ("PDF kimi saxla") |
| Drawing takeoff (`analyzeDrawing`) | **Mock** – always returns the sample Nərimanov plan |
| Receipt OCR (`extractReceipt`) | **Mock** – returns a plausible suggestion |
| Market prices (`fetchMarketPrice`) | **Mock** – small deterministic drift |
| AI assistant (`askAssistant`) | **Rule-based mock** over the project data |
| Sending SMS / e-mail, share links across devices | **Not implemented** – the link only works in the same browser |
| Uploaded photos / receipt images | Object URLs, kept for the current session only |

## Integration points

All are marked in code with `TODO(api)` or `TODO(ai)`.

### Persistence – `store.ts`

Replace `localRepository` with an HTTP repository. Components only use the hooks
(`useSmetaProjects`, `useSmetaProject`, `useSharedProject`) and `smeta.*`
actions, so the swap stays inside this file. Suggested endpoints, following the
existing `lib/api-spec` (OpenAPI → Orval) and `lib/db` (Drizzle) setup:

```
GET    /api/smeta/projects
POST   /api/smeta/projects
GET    /api/smeta/projects/:id
PATCH  /api/smeta/projects/:id/estimate          line/section edits
POST   /api/smeta/projects/:id/measurements/apply
POST   /api/smeta/projects/:id/change-orders
PATCH  /api/smeta/projects/:id/change-orders/:coId
POST   /api/smeta/projects/:id/expenses          (multipart: receipt)
POST   /api/smeta/projects/:id/photos            (multipart)
POST   /api/smeta/projects/:id/share             creates token + snapshot, sends SMS/e-mail
GET    /api/estimate/:token                      public, snapshot only
POST   /api/estimate/:token/approve              public; store name, phone, IP, timestamp, version
POST   /api/estimate/:token/revision             public
POST   /api/estimate/:token/change-orders/:coId  public; client decision
```

The public endpoints must return only the frozen snapshot and client-visible
change orders and photos – never internal costs, expenses or margins per line.
`useFirstLoad` (an artificial skeleton delay) should be replaced by real query state.

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
  separately).
- Payment schedule percentages (default 30/30/30/10) and the change-order policy text.
- Default margin (15%) and waste percentages per category (`catalog.ts`).
- Whether the module should be translated to Russian/English like the rest of the app.
- Retention and signature requirements for client approvals (legal weight).
