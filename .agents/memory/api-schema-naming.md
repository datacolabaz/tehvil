---
name: API request schema naming
description: Orval's generated Zod and TypeScript exports can collide for inline request bodies.
---

Use explicitly named component schemas for new request bodies, with names distinct from generated operation body identifiers.

**Why:** This workspace exports both generated Zod validators and generated types. An inline body caused both generators to export the same operation-body name, failing the shared library build.

**How to apply:** Before using new generated hooks, run codegen and the shared-library build together. If the failure is a duplicate exported operation body, name the input component rather than patching generated files.