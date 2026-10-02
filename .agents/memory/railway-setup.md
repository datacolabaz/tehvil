---
name: Railway setup constraints
description: Current Railway configuration constraints and approved environment-based deployment model.
---

Use the documented IaC or service-dashboard setup for new Railway services, not legacy Config as Code.

**Why:** During Railway preparation, official documentation stated new services could not opt into railway.json/railway.toml, despite older monorepo docs still describing their auto-detection. Existing legacy support ends on 2026-12-01. Trust the current configuration-specific documentation.

**How to apply:** Check Railway's current docs before changing deployment setup. Keep the shared pnpm workspace available to both service builds. Do not create a full-project IaC graph that could remove unrelated database/bucket resources.

Environment releases deliberately keep frontend and backend contracts together rather than treating permanent branch separation as a service boundary.

**Why:** Frontend and backend contracts change together in this product; the user approved an environment-based release model to avoid incompatible deployments.

**How to apply:** Follow the deployment policy in replit.md and deploy/RAILWAY.md rather than restoring split release branches merely to mirror separate services. Source delivery is not production-release approval.