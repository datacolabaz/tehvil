---
name: Runtime dependency validation
description: Installed package versions do not prove which optimized dependencies the browser serves.
---

After changing runtime dependency versions, verify the browser actually loads the matching versions; a workflow restart alone does not establish that.

**Why:** Vite retained optimized React DOM code from an older version even though the app's installed React and React DOM versions matched. Typechecks and production builds passed while development preview failed.

**How to apply:** When package resolution looks correct but runtime reports incompatible libraries, inspect the served dependency bundle and optimized-dependency cache before changing package pins again.