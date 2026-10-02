# Railway deployment

## Branches and services

The GitHub repository has three branches:

- `main`: integrated application source
- `frontend`: frontend deployment branch
- `backend`: API deployment branch

Both deployment branches retain the pnpm workspace and shared libraries. They deploy **separate services**, not a combined server. Do not change the Railway Root Directory to an artifact folder: shared workspace packages live at the repository root.

1. Create a Railway project and PostgreSQL database.
2. Add a GitHub service from `datacolabaz/tehvil`, select branch `backend`.
3. Add another service from the same repository, select branch `frontend`.
4. Keep Root Directory `/` on both. Set each service's commands from the table below, or use the optional IaC configuration.
5. Generate the frontend's public domain. Give the API a domain reachable by the frontend, preferably Railway private networking.
6. Add the variables below. Railway supplies `PORT`; do not hardcode it.
7. Apply the database schema once against Railway PostgreSQL **before** serving application traffic. Use `pnpm --filter @workspace/db run push` from a Railway-connected environment; review any proposed destructive changes. This is not an automated destructive migration at every boot.

The frontend serves the production SPA and forwards `/api` to the API service. The browser uses one origin, so session cookies, evidence downloads and share links do not depend on cross-site cookie behavior.

| Service | Build command | Start command | Health check |
|---|---|---|---|
| frontend | `pnpm run typecheck:libs && PORT=5000 BASE_PATH=/ pnpm --filter @workspace/tehvil run build` | `pnpm --filter @workspace/tehvil run start` | `/healthz` |
| backend | `pnpm run typecheck:libs && pnpm --filter @workspace/api-server run build` | `pnpm --filter @workspace/api-server run start` | `/api/healthz` |

Set `RAILPACK_INSTALL_COMMAND=pnpm install --frozen-lockfile --prod=false` so build-time dependencies remain available.

### Optional supported Infrastructure as Code

Railway's current documentation says **new services cannot use `railway.json` / `railway.toml` Config as Code**. This repository therefore provides `.railway/railway.ts`, not a deprecated root config.

After authenticating the Railway CLI and linking the intended project/environment:

```sh
railway config plan
# Review the proposed services/branches and every change before confirming:
railway config apply
```

No Railway resource is created by this repository or by the GitHub push. The named partial owns only the two app services; database and bucket setup remain explicit. Values marked `preserve()` stay in Railway Variables and are not exported to source. If deploying manually through the dashboard, you do not need to run IaC at all.

## Frontend variables

| Name | Purpose |
|---|---|
| `BACKEND_URL` | API service origin, e.g. a private Railway service URL including its listening port |
| `PUBLIC_APP_URL` | Frontend HTTPS origin, without a trailing slash |
| `VITE_CLERK_PUBLISHABLE_KEY` | Publishable key of the external production Clerk instance; available during build |

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
| `BUCKET_ENDPOINT` | Railway Bucket S3 endpoint |
| `BUCKET_NAME` | Private bucket name |
| `BUCKET_ACCESS_KEY_ID` | Private bucket access credential |
| `BUCKET_SECRET_ACCESS_KEY` | Private bucket secret credential |
| `BUCKET_REGION` | SDK region; defaults to `us-east-1` |
| `BUCKET_FORCE_PATH_STYLE` | Set `true` only if the bucket Credentials tab requires path-style access |

Create a private **Railway Bucket**. Use Railway's credential references/auto-injection instead of putting credentials in GitHub. Configure bucket CORS for the frontend's exact origin, PUT uploads and the `Content-Type` header. Files are uploaded through 15-minute presigned URLs and read only through authenticated project media endpoints.

## Clerk and data boundaries

The Replit preview continues to use its current managed Clerk tenant and App Storage. Railway uses externally configured Clerk and a private S3-compatible bucket. No current preview accounts, project data or evidence files are migrated automatically. Changing Clerk tenants changes user identifiers; existing production accounts/data require an explicit migration plan rather than copying database rows blindly.

Configure the Railway frontend domain in the external Clerk production instance and use its matching keys. This repository does not include credentials or claim that a live Railway deployment has been performed.

## Updating the deployment branches

After integrating changes on `main`, merge them into `frontend` and `backend`. Railway's separate service source settings (or `.railway/railway.ts`) select the correct branch and command; the code stays compatible with the shared pnpm workspace.

## Verification status

The app's core owner/contractor flow is checked in the Replit preview. Production builds and the frontend/API proxy are checked locally. The S3 adapter is checked against an isolated HTTP storage fixture, **not** against your live Railway bucket. Before opening the Railway app to users, verify actual production Clerk login, bucket CORS, upload/download and share revocation on its public domain.

Official references:
- https://docs.railway.com/deployments/monorepo
- https://docs.railway.com/guides/storage-buckets-guide
- https://docs.railway.com/infrastructure-as-code