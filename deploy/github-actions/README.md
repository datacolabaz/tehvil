# Activate GitHub Actions

The current GitHub connection can upload repository code but its declared OAuth scopes do not include `workflow`. Requests containing `.github/workflows/*` return 404; the otherwise identical source update succeeds without those files. Reauthorizing the same declared scope set will not add the missing permission.

Therefore source delivery includes these exact workflow templates under `deploy/github-actions/`. This folder **does not activate GitHub Actions**.

Using your own GitHub browser session, copy the templates on `develop`:

- `deploy/github-actions/ci.yml` → `.github/workflows/ci.yml`
- `deploy/github-actions/security-check.yml` → `.github/workflows/security-check.yml`

Alternatively use a separately authorised workflow-capable GitHub connection. Never paste tokens into chat or commit credentials.

Commit on `develop`, check both Actions runs, then require `CI / verify` and `Repository security / repository-audit` as branch-protection checks before a production merge. Do not enable unattended production releases based on missing/unverified CI.

The local workspace also retains the intended `.github/workflows` definitions. Keep templates and active definitions identical when updating them.