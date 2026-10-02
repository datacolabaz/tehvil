# Təhvil: partner and distribution architecture

## Status and product entry point

This is an accepted **architecture extension**, not a claim that partner dashboards, designer permissions, paid packages or commissions are running. The current app still implements owner/contractor/viewer project records and manual renovation-payment tracking. No schema migration, billing provider, automatic payout or new project access is enabled by this document.

Entry point: apartment purchased → designer selected → contractor selected → materials selected → **before the first renovation payment**, agree included/excluded work, material responsibility, changes, handovers, payment conditions and warranty. Position Təhvil as a shared agreement record, not a tool for one party to control the other.

Distribution priorities: interior designers, turnkey companies, project managers/technical supervisors, showrooms and advisers serving remote owners. These are acquisition segments, not automatic application permissions. Education/checklists, showroom QR placements and remote-owner progress are channels; external market statistics and sample prices are not runtime configuration.

## Keep the current deployment and application boundaries

- Keep the pnpm workspace, Express API, PostgreSQL/Drizzle and generated OpenAPI clients.
- Keep `main` production / `develop` staging, separate frontend/API services per environment, and separate private R2 buckets/databases/Clerk configuration.
- Extend the existing API as a modular monolith first. Do not add a partner microservice or deploy a worker before there is actual background work.
- Put future partner schemas in a focused `lib/db` schema module; put partner policies, attribution and rewards in focused API modules; define contracts in `lib/api-spec/openapi.yaml` before codegen.
- Keep project evidence and any future design documents private. Store object metadata/paths in PostgreSQL and bytes in private storage, never in referral reporting.
- Introduce schema changes through reviewed, versioned migrations, staging validation and a verified backup. This architecture does not authorize production writes.

## Two distinct identities

**Partner identity** describes acquisition and commercial rewards. **Project membership** describes access to one explicitly invited project. Neither implies the other.

MVP partner types: `referral` and `solution` only. Channel/trust types, public directories, leaderboards, complex tiers, multi-level referrals and automatic payouts are deferred.

An account can have a partner profile and also be a project owner/contractor on unrelated projects. Resolve partner-account access and project-participant access separately on every request. Never derive project membership from a referral code, business name, commission, organisation membership or commercial admin role.

| Identity / context | Allowed | Denied by default |
|---|---|---|
| Referral partner | Own referral link/QR, aggregate conversions, own earnings/credits | Customer identities and all project data |
| Solution partner | Own workspace/reward statistics; project work only through an explicit project invitation | Automatic access to clients or referral-generated projects |
| Future designer membership | Approved design/scope views, permitted reference files, feedback, relevant handover evidence | Budget, payments, receipts, owner contact/address, full passport, approval of financial changes |
| Existing owner/contractor/viewer | Current explicitly granted project role | Partner financial/admin permissions |
| Partner operations admin | Partner onboarding, fraud review, commission controls, credits and masked reports | Private project media, completed-record edits, automatic cash payouts |

**Do not alias `designer` to the current `viewer`.** The existing viewer is a general project observer, not a financial/privacy-safe designer projection. A designer role requires its own API capabilities and serializers before it can be offered.

For a designer, use project-scoped capabilities such as `design.read`, `design.attach`, `scope.read`, `change.comment` and `handover.read`. Owner/contractor approval authority stays unchanged. Access to a file requires both the invited project context and the file's permitted purpose; do not unlock all media because the user can inspect a handover.

Redaction must happen in the API response, not by hiding UI fields. A future designer dashboard, project header, audit feed and PDF export must all use the same restricted projection. Partner APIs must not call the existing full project/passport serializers.

## Proposed domain model — not yet deployed

| Entity | Purpose and important constraints |
|---|---|
| PartnerProfile | Nullable linked account, business name, `referral`/`solution`, unique opaque referral code, `invited/active/suspended/terminated`, lifecycle timestamps |
| PartnerAttribution | Partner, opaque visitor reference, later bound owner account, bounded source/campaign, attribution/expiry timestamps, `active/converted/expired/invalidated`; immutable first valid attribution |
| PartnerConversion | Internal owner/project/purchase references, package/configuration version, `pending/approved/cancelled`; one conversion per confirmed package purchase |
| PartnerCommissionLedger | Conversion, exact monetary amount/currency, state, reason, availability/approval/payment/cancellation timestamps; one base commission per conversion |
| PartnerProjectCredit | Partner, credit type, signed integer amount, source event, optional expiry/use references; uniquely issued and atomically redeemed |
| PackagePurchase | Separate from renovation payment records; verified provider purchase/event references, package, payment/refund state, amount/currency and policy snapshot |
| PartnerAudit / delivery outbox | Append-only admin/reward events and transactional delivery; no raw customer PII/media in payloads |
| Future design document/revision | Project-scoped private object, uploader, immutable revision, purpose and explicit scope-item references |

Keep internal foreign keys for integrity, but never expose them in partner reports as navigable project/customer identifiers. Keep financial/reward records when a project is archived; do not cascade-delete financial history with project removal.

Use database uniqueness for referral codes, purchase/provider-event identities, conversion commissions, attribution binding and reward-source identities. Account for nullable/unbound attribution records explicitly; application-side “check then insert” alone is insufficient.

Use exact money arithmetic (integer minor units or decimal-safe operations) and store currency explicitly. Do not calculate commissions with floating-point rounding or overwrite historical amounts when package configuration changes.

## Attribution and QR flow

Future public route: `/p/{partnerCode}?source={channel}&campaign={placement}`. Derive the origin from the configured app URL; do not assume an unprovisioned production domain.

1. API validates that the partner code exists and is active; public responses reveal no partner/customer private information.
2. Create an opaque anonymous visitor reference in a Secure, HttpOnly, SameSite cookie and store attribution server-side. Use same-origin frontend/API routing.
3. Keep the **first valid** referral for a default **30-day** window; later links cannot overwrite it. Expired, invalidated or suspended attributions cannot create new conversions. Resolve concurrent attempts transactionally.
4. Bind attribution to a newly registered, authenticated owner through an idempotent server operation. A URL parameter or client-supplied user/project ID cannot claim a conversion.
5. Preserve attribution across registration, login and project creation. No durable dependence on browser localStorage alone.
6. Normalize/allowlist sources (`qr/link/direct/email/other`) and bound campaign input. A QR must resolve to the same active partner's URL and identify its placement.
7. Rate-limit anonymous opens, deduplicate events and filter obvious automated traffic. QR scans/link opens are analytics, never payout eligibility.

An authenticated existing account cannot be presented as a newly acquired owner. Prevent self-referrals against the linked partner identity. Any same-phone/email/payment-pattern fraud checks must use justified, minimal protected data; do not collect raw payment instruments or expose these checks to partners.

Track `qr_scan`, `referral_link_opened`, `signup_completed`, `project_created`, `paid_project_purchased`, `commission_pending`, `commission_approved`, `commission_paid` and `commission_cancelled`. Business events must be server-derived/idempotent. Do not put account names, addresses, contact data, media or project titles in analytics.

## Package payments are not renovation payments

Existing payment rows record money exchanged between owner and contractor manually. They are **never proof of a Təhvil package purchase** and never generate referral commission.

Billing is a separate integration decision. Until an approved payment provider, verified webhook adapter and purchase lifecycle exist, do not activate checkout, earnings promises or paid-conversion events. Client success pages, an owner's “sent” button or a free project are not payment confirmation.

`Start`, `Secure` and `Remote` packages are proposed configurable products. Prices, fixed commission amounts, currencies, refund periods and entitlement limits need approval before activation; the attachment's sample ranges and pilot offers are not final commercial terms.

## Referral commission lifecycle

Eligibility requires all of: valid attribution → genuinely new owner → new project → paid package purchase → verified payment → refund/cancellation waiting period completed.

Exactly one pending commission may be created after verified payment. It cannot be approved/payable before the configured waiting period, eligibility review and fraud checks. Do not create commission on clicks, signup, free projects, duplicate/recurring payment events, self-referrals or suspicious accounts.

Ledger states: `pending → approved → payable → paid`, with `on_hold` and `cancelled` branches. Acquisition `tracked` is an event/conversion concept, not a payout balance. Every transition records an authorised actor/system event and reason.

- Snapshot the fixed per-package commission rule when the purchase is confirmed.
- Enforce provider-event and purchase uniqueness in one transaction; webhook retries/reordering cannot duplicate money or credits.
- Refund before payout cancels eligibility and records reversal. Refund/chargeback after payout requires an audited recovery/negative adjustment and finance review; never erase a paid record.
- Hold fraud-flagged commissions. Releasing a hold requires review, not a partner UI action.
- Suspension stops new attribution/conversions immediately and places unfinished rewards under review; do not silently delete previously earned history.
- Regenerating a referral code invalidates the old code for new captures; existing eligible attributions remain explicit, reviewable records.
- Manual finance reconciliation marks payout paid with a unique reference. No automatic payout, payout request interface or stored bank details in the MVP architecture.

## Solution rewards

Solution partners receive product value: client portal, pilot slots and project credits, **not cash commission**. A solution partner's project participation is still an explicit owner invitation; the current one-contractor-per-project rule stays intact.

Completion rewards must be based on a real qualifying project completion event and review policy, not a button click, arbitrary milestone or referral signup. Uniquely identify the source project/event so retries/reopening cannot issue duplicate credits.

Keep a credit ledger. Issuance, expiry, revocation and consumption are auditable. Redemption is atomic, scoped to the authenticated partner and bound once to a project/entitlement; concurrent requests cannot overspend the same credit. Pilot limits/duration and completion reward quantities are configurable approved policy, not hardcoded promises.

Organisation/team seats, branded passports, Professional status, priority support and richer workspaces are later extensions; do not invent current company-wide permissions.

## Partner/admin API and UX contracts

Future contract groups:

- Public referral resolution/capture.
- Authenticated current-account attribution binding.
- Partner self-service profile, link/QR and **masked aggregate** statistics, ledger and credit views.
- Separately authorised partner operations/admin lifecycle and finance-reviewed ledger transitions.
- Verified provider purchase webhooks and an idempotent reward processor.
- Separately authorised designer/project capabilities, documents and feedback.

Do not accept `partnerId` from a query/body as proof that a caller owns that profile. Resolve the profile from the authenticated identity. Enforce pagination, export authorisation, rate limits and suspension checks server-side.

Partner reports may show counts, conversion rate, package/status/date, pending/approved/paid earnings and available credits. They must not show owner full name/phone/address, contractor identity, project title, private project IDs/links, scope, changes, revisions, timelines, payment receipts, media or passports. Downloads/exports obey the same restrictions as JSON.

Administrators may create/approve/suspend profiles, regenerate codes, review masked attribution/funnels and fraud flags, hold/approve/cancel commissions, add internal notes, grant credits and export controlled reports. Commercial administration is not a bypass around project/media authorisation.

Keep AZ/RU/EN labels, states, errors and notifications in the existing localization system. Preserve original user-authored records. Use real empty/loading/error states; no sample earnings, customers or live-availability claims masquerading as real data.

## Rollout order and acceptance gates

1. Implement profiles, active referral resolution, persistent attribution and masked partner reports; commercial/reward issuance remains disabled.
2. Add the separate designer capability/projection model, private design revisions/references and feedback only after negative access tests pass.
3. Add configurable pilot slots and audited solution credit issuance/redemption.
4. Add approved package billing, verified purchases/refunds, idempotent commission processing and admin review.
5. Consider additional partner types, payout requests, organisations and branded output only after real pilot evidence.

Before enabling each module, test:

- Unique code and downloadable QR resolve to the correct active partner; suspension/code rotation cannot create new conversions through stale links.
- First valid 30-day attribution survives signup/project creation, handles expiration/concurrent capture, rejects existing-owner/self-referrals and cannot be supplied for another account.
- Link/signup/free-project/manual renovation payments never issue commission; one verified purchase issues exactly one pending record.
- Duplicate/out-of-order webhooks, refunds, chargebacks and holds cannot duplicate or prematurely pay rewards.
- Partner A cannot read partner B's dashboard/export/ledger; no partner profile alone grants any project or media access.
- Designer scope/evidence access cannot expose finances, PII, receipts, unrelated media, audit details or full passports.
- Admin partner permissions cannot alter completed project records or grant private media access.
- Credits issue once, consume once under concurrency, respect expiry and cannot be spent by another account.
- Same restrictions apply to direct API calls, frontend routes, reports, downloads and exports.

Pilot metrics: agreed scope/exclusions, change-order use, photo handovers, owner acceptance, repeat use and willingness to pay. Collect aggregate measures without exposing customer records to acquisition partners.