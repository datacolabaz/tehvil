---
name: GitHub workflow-path permissions
description: Why source uploads can succeed while a snapshot containing Actions definitions fails.
---

Repository admin/push permissions do not imply workflow-file write permission. Do not diagnose a bulk Git tree 404 as an expired connection without isolating workflow paths.

**Why:** A controlled comparison accepted the changed source tree when only `.github/workflows` entries were removed; the same tree with those entries failed. Reauthorization context declared read/profile and repo scopes, not workflow. A fresh grant of those same declared scopes cannot add workflow permission.

**How to apply:** Keep prepared CI definitions locally and ship identical activation templates outside the workflow path, with explicit manual/workflow-capable activation instructions. Never claim GitHub Actions are active before the real workflow-path files exist and runs pass. Avoid repeated full-snapshot retries or asking for raw tokens. Source delivery uses develop plus review, not an implicit production release.