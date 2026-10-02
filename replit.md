# Təhvil

Mobile-first renovation records for homeowners and contractors in Azerbaijani, Russian and English.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (managed workflow supplies its port)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Start `artifacts/tehvil: web` and `artifacts/api-server: API Server`; managed workflows inject `PORT`/`BASE_PATH`.
- Required services: PostgreSQL, Replit-managed Clerk and private App Storage. Never commit credentials.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: generated Zod 3 schemas with Orval's version explicitly aligned to the catalog
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/tehvil` — responsive frontend and AZ/RU/EN copy
- `artifacts/api-server` — API, Clerk proxy, access rules and private media
- `lib/api-spec/openapi.yaml` — contract source of truth
- `lib/db/src/schema/renovation.ts` — database tables
- `README.md` — setup, implemented MVP and remaining broader-brief work

## Architecture decisions

- Clerk uses same-origin session cookies through the managed proxy, not a separate browser bearer-token scheme.
- Calendar dates stay ISO date strings; timestamps use ISO date-time strings.
- Accepted work is preserved; scope changes create a new version or a change order.
- Public passport links expose a sanitized summary, not private evidence. Finances are opt-in.
- One accepted contractor per project keeps the owner/contractor approval model unambiguous.
- Partner/commercial identity must stay separate from project membership. No referral, credit or partner-admin status grants access to customer projects.
- Future designer access needs restricted capabilities and API projections; do not alias the existing viewer role to designer.
- See `deploy/PARTNER-ARCHITECTURE.md` for the accepted Referral/Solution architecture, privacy boundaries and staged rollout. These extensions are not live features.

## Product

Agreed scope, explicit exclusions, change approvals, evidence-based milestone handover, revisions, manual payment records, timeline and printable renovation passport.

## User preferences

User requested this product's updated source be pushed to `datacolabaz/tehvil`; use `develop` and a review PR rather than implicitly releasing production.
Deployment target is Railway: one monorepo, `main` for production and `develop` for staging. Frontend and API are separate services built from the same environment branch.
Cloudflare R2 private buckets are the Railway media provider. Production and staging must use separate databases, buckets and credentials; only the backend receives database/R2 secrets.
Keep the existing pnpm workspace and Drizzle ORM. Do not relocate artifact folders or replace the database merely to match an example repository tree.
Language changes must synchronize every existing interface, including Clerk forms, buttons, statuses, notifications and footer. Preserve user-authored records in their original language.
Use the navbar's Təhvil wordmark consistently; the user prefers its Manrope typeface and requests a stronger hero weight and no comma after “addımı”.
Keep the MVP free of marketplace, payment processing/escrow, SİMA, legal advice and claims of legal electronic signature.

## Gotchas

- Run API codegen before consuming contract changes; build shared libraries before checking the API against new DB exports.
- Production publishing is a separate action from sending the source to GitHub.
- App Storage files and the database are not included in a GitHub source push.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
