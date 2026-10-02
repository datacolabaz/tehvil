# Railway deployment

## Branches and services

Use one GitHub monorepo with environment-based releases:

- `main`: production frontend **and** API
- `develop`: staging frontend **and** API
- `feature/*`: changes merged through reviewed pull requests to `develop`
- `hotfix/*`: reviewed production fixes; merge the fix back into `develop`

Frontend and API are **separate services**, not a combined server. Legacy `frontend`/`backend` branches are retained but no longer release sources. Do not change Root Directory to an artifact folder: this existing shared pnpm workspace requires `/` for both service builds. Build filters select the service package; renaming working folders to `apps/web`/`apps/api` is unnecessary.

1. Create Railway environments named exactly `production` and `staging`, either in one project or separate projects. Give each its own private PostgreSQL database.
2. Add API services from `datacolabaz/tehvil`: production uses `main`, staging uses `develop`.
3. Add frontend services from the same repository and the same environment branch.
4. Keep Root Directory `/` on both. Set each service's commands from the table below, or use the optional IaC configuration.
5. Configure the frontend's HTTPS domain. `app.tehvil.az` is the intended production domain, not a domain this repository has provisioned. The gateway can reach the API over Railway private networking; a public `api.tehvil.az` is optional, not required by browser code.
6. Add the variables below. Railway supplies `PORT`; do not hardcode it.
7. Apply the database schema once against Railway PostgreSQL **before** serving application traffic. Use `pnpm --filter @workspace/db run push` from a Railway-connected environment; review any proposed destructive changes. This is not an automated destructive migration at every boot.

The frontend serves the production SPA and forwards `/api` to the API service. The browser uses one origin, so session cookies, evidence downloads and share links do not depend on cross-site cookie behavior.

| Service | Build command | Start command | Health check |
|---|---|---|---|
| frontend | `pnpm run typecheck:libs && PORT=5000 BASE_PATH=/ pnpm --filter @workspace/tehvil run build` | `pnpm --filter @workspace/tehvil run start` | `/healthz` |
| backend | `pnpm run typecheck:libs && pnpm --filter @workspace/api-server run build` | `pnpm --filter @workspace/api-server run start` | `/api/healthz` |

| Environment | Branch | Web | API | Data |
|---|---|---|---|---|
| production | main | tehvil-web | tehvil-api | production PostgreSQL + private R2 bucket |
| staging | develop | tehvil-web-staging | tehvil-api-staging | separate staging PostgreSQL + private R2 bucket |

Only the API connects to PostgreSQL or receives R2 secrets. No worker service is required by the current MVP: PDF output uses browser printing. Add a separate worker only when server-side background work is implemented; do not deploy a nonexistent worker command.

The accepted partner architecture in [PARTNER-ARCHITECTURE.md](PARTNER-ARCHITECTURE.md) remains inside this monorepo/API initially. Attribution and rewards do not grant project membership. Package billing and background reward processing are future modules, not reasons to deploy an empty partner service/worker now.

Set `RAILPACK_INSTALL_COMMAND=pnpm install --frozen-lockfile --prod=false` so build-time dependencies remain available.

### Optional supported Infrastructure as Code

Railway's current documentation says **new services cannot use `railway.json` / `railway.toml` Config as Code**. This repository therefore provides `.railway/railway.ts`, not a deprecated root config.

After authenticating the Railway CLI and linking the intended project/environment:

```sh
railway config plan
# Review the proposed services/branches and every change before confirming:
railway config apply
```

No Railway resource is created by this repository or by the GitHub push. Link the intended `production` or `staging` environment before planning; the configuration rejects other environment names instead of guessing the release branch. The named partial owns only the two app services; database and R2 setup remain explicit. Values marked `preserve()` stay in Railway Variables and are not exported to source. If deploying manually through the dashboard, you do not need to run IaC at all.

## Frontend variables

| Name | Purpose |
|---|---|
| `BACKEND_URL` | API service origin, e.g. a private Railway service URL including its listening port |
| `PUBLIC_APP_URL` | Frontend HTTPS origin, without a trailing slash |
| `VITE_CLERK_PUBLISHABLE_KEY` | Publishable key of the environment's external Clerk instance; available during build |

Leave `VITE_CLERK_PROXY_URL` unset for external Clerk. Do not copy Replit's managed proxy hostname or development configuration to Railway.

## Backend variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Reference to Railway PostgreSQL |
| `PUBLIC_APP_URL` | The same frontend HTTPS origin |
| `CLERK_AUTH_MODE` | `external` |
| `CLERK_PUBLISHABLE_KEY` | Matching external Clerk publishable key |
| `CLERK_SECRET_KEY` | Matching external Clerk secret, entered only in Railway Variables |
| `OBJECT_STORAGE_PROVIDER` | `s3` |
| `R2_ENDPOINT` | Cloudflare account's R2 S3 API endpoint; obtain it from Cloudflare |
| `R2_BUCKET_NAME` | This environment's private bucket name |
| `R2_ACCESS_KEY_ID` | Bucket-scoped R2 S3 access credential |
| `R2_SECRET_ACCESS_KEY` | Bucket-scoped R2 S3 secret credential |
| `R2_REGION` | `auto` |
| `BUCKET_FORCE_PATH_STYLE` | `true` for account-endpoint path-style access |

Create **private Cloudflare R2 buckets**, one per environment. Disable public `r2.dev` access and do not attach a public bucket domain. Create bucket-scoped object read/write S3 credentials, entered only in backend Railway Variables. Never reuse production credentials in staging. `R2_ACCOUNT_ID` is not required by the runtime when `R2_ENDPOINT` is supplied.

Configure each bucket's CORS for that environment's exact frontend HTTPS origin, `PUT` uploads and the `Content-Type` header; optionally expose `ETag`. Never use `*` for production origins.

Uploads use 15-minute presigned PUT URLs issued by the authenticated API. Attachment authorization/metadata checks remain on the backend. Downloads currently stream through permission-checked backend media endpoints, not unsigned public object URLs. This intentionally keeps existing `/api` access controls; redirecting authorized downloads to short-lived signed GET URLs is a future scaling option. The adapter retains legacy `BUCKET_*` fallbacks for compatibility, but new deployments use `R2_*`.

## Clerk and data boundaries

The Replit preview continues to use its current managed Clerk tenant and App Storage. Railway uses externally configured Clerk and a private S3-compatible bucket. No current preview accounts, project data or evidence files are migrated automatically. Changing Clerk tenants changes user identifiers; existing production accounts/data require an explicit migration plan rather than copying database rows blindly.

Configure the Railway frontend domain in the external Clerk production instance and use its matching keys. This repository does not include credentials or claim that a live Railway deployment has been performed.

## CI, releases and migration safety

The prepared GitHub Actions definitions check type safety, unit/fixture tests, production builds and repository security. The current GitHub connection cannot upload workflow-path files; source delivery includes identical activation templates in [github-actions/](github-actions/README.md). **Actions are not active until the templates are placed in `.github/workflows` using workflow-capable authorisation and their runs pass.** Require passing checks and pull-request review on `main` and `develop`. Enable Railway's wait-for-CI setting where available; otherwise explicitly gate releases—auto-deploy alone does not guarantee that CI passed. GitHub Actions does not deploy.

Release flow: `feature/*` → reviewed `develop` → staging verification → reviewed `main` → production. Keep service source branches aligned within each environment.

Keep the existing PostgreSQL/Drizzle schema in `lib/db`. Do not replace it with Prisma merely to copy a sample tree. Review schema diffs against staging before production; take a verified production backup, use one controlled migration operator, and never run concurrent/destructive schema changes at API startup. The current `db push` command is a reviewed initial-setup tool, **not** a complete versioned migration pipeline. Versioned SQL migrations and a dedicated integration-test database remain future work.

Before any push, run `python3 .github/scripts/check-repository.py`. It rejects committed env files/secrets, nonblank env-example values, uploaded user assets and oversized binaries. `.env.example` is a blank reference matrix, not credentials or a runnable production configuration.

## Verification status

The app's core owner/contractor flow is checked in the Replit preview. Production builds and the frontend/API proxy are checked locally. The R2-compatible S3 adapter is checked against an isolated HTTP fixture, **not** against your live Cloudflare account. No production/staging infrastructure, DNS, Clerk tenant or data migration is created by this source update. Before opening the Railway app to users, verify real external Clerk login, R2 CORS, upload/download, access restrictions and share revocation.

Official references:
- https://docs.railway.com/deployments/monorepo
- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
- https://docs.railway.com/infrastructure-as-code