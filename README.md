# Təhvil

Mobile-first renovation project records for homeowners and contractors, in Azerbaijani, Russian and English.

## Implemented MVP

- Clerk sign-in and account-backed, expiring contractor/viewer invitations
- Project dashboards, rooms and explicit included/excluded scope items
- Draft editing, preserved scope versions and two-party scope approval
- Change orders with cost/date impact and decisions by the other participant
- Milestone handovers with private photo/video/PDF evidence
- Structured revisions, contractor replies and owner resolution
- Manual payment schedules, receipt attachments and separate sent/received confirmation
- Append-only application audit timeline
- Printable renovation passport (use the browser's **Save as PDF**)
- Expiring, revocable read-only summary links; financial information is opt-in
- Read-only project archiving

**Not a marketplace, payment processor, escrow service, legal adviser or legal e-signature system.** In-app approvals are project audit records. Files in public passport summaries are intentionally omitted; evidence remains available only to authenticated project participants.

## Stack and repository

- TypeScript, pnpm workspaces, React/Vite, TanStack Query and Wouter
- Express API, PostgreSQL/Drizzle
- Replit-managed Clerk and private App Storage
- External Clerk and Cloudflare R2 private evidence storage for Railway
- OpenAPI contract with generated React hooks and Zod validation

```text
artifacts/tehvil/          Web application
artifacts/api-server/     API and access rules
lib/api-spec/openapi.yaml API source of truth
lib/api-client-react/     Generated hooks and same-origin fetch client
lib/api-zod/              Generated runtime schemas
lib/db/                   Database schema
```

## Development

Use Node.js 24 and pnpm. Install dependencies with `pnpm install`.

On Replit, start the existing artifact workflows. They inject ports and paths:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/tehvil run dev
```

For development outside the managed workflows, supply `PORT` and `BASE_PATH` to Vite. Serve the web frontend and `/api` (including `/api/__clerk`) through the same origin. The configured Replit-managed Clerk proxy and App Storage are workspace services; replacing them for another host requires deliberate provider configuration.

Required configuration names, **never values in source control**:

- `DATABASE_URL`
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PROXY_URL` when the managed proxy is configured
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`
- `PORT` for each service; `BASE_PATH` for the web artifact

Apply development schema changes:

```sh
pnpm --filter @workspace/db run push
```

Regenerate the API after changing OpenAPI:

```sh
pnpm --filter @workspace/api-spec run codegen
```

Validate and build:

```sh
pnpm run typecheck
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/tehvil run build
pnpm --filter @workspace/api-server run build
```

## Security and limitations

Project membership and role checks are enforced by the API, not only the UI. Evidence uploads are limited to allowlisted raster images, videos and PDFs, at most 50 MiB. Upload records are bound to the signed-in user, expire and can be attached only once; stored size/type are checked before attachment. Media reads require project membership.

Share tokens and invitation tokens are hashed in PostgreSQL. Public summary shares expire after seven days and can be revoked. Financial values, receipt notes, private media paths and audit details are omitted by default.

This is an MVP, not a compliance certification or malware-scanning service. The broader product brief's warranty-document management, change-order document attachments, clarification discussion threads, payment disputes, invitation management and bulk/template entry remain follow-up work. Warranty duration on scope items and milestone/revision/payment evidence are supported now.

## Railway

Deploy separate frontend/API Railway services from the **same branch per environment**: `main` for production, `develop` for staging. Use `feature/*` branches for changes and reviewed `hotfix/*` branches for urgent fixes. Legacy `frontend`/`backend` branches are not deployment sources and are not automatically deleted.

Production and staging have separate PostgreSQL databases, private Cloudflare R2 buckets and Clerk configuration. The browser never receives database or R2 credentials. See [deploy/RAILWAY.md](deploy/RAILWAY.md) for topology, commands, variables, provider setup, CI/release checks and migration boundaries.

CI definitions are prepared, not yet activated in GitHub: the source-upload connection lacks workflow-file permission. Exact templates and activation instructions are included in [deploy/github-actions/](deploy/github-actions/README.md). Do not treat a source push as a passed GitHub Actions run or production release.

## Partner architecture

The accepted [partner/distribution architecture](deploy/PARTNER-ARCHITECTURE.md) separates Referral/Solution partner identity from explicit project membership, defines restricted future designer capabilities, server-side first-valid 30-day attribution, private reporting, verified package-purchase commissions and audited solution project credits.

This is an architecture extension, **not implemented partner dashboards, billing, commissions or designer access**. Manual renovation payments do not generate commercial commissions. No database or production infrastructure changes are made by adopting this design.