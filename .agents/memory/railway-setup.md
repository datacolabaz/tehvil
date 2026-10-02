---
name: Railway setup constraints
description: Current Railway configuration rules and branch separation for this shared workspace.
---

Use the documented IaC or service-dashboard setup for new Railway services, not legacy Config as Code.

**Why:** During Railway preparation, official documentation stated new services could not opt into railway.json/railway.toml, despite older monorepo docs still describing their auto-detection. Existing legacy support ends on 2026-12-01. Trust the current configuration-specific documentation.

**How to apply:** Check Railway's current docs before changing deployment setup. Frontend/backend branches retain the shared pnpm workspace; service source settings select the branch and service-specific commands. Do not create a full-project IaC graph that could remove unrelated database/bucket resources.