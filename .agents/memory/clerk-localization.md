---
name: Azerbaijani Clerk localization
description: Custom AZ auth strings and interpolation validation.
---

Use an explicit Azerbaijani locale resource rather than inheriting English or substituting Turkish.

**Why:** The installed official localization package provides Russian and English but not Azerbaijani. Overriding only auth headings leaves email/password labels, action buttons and errors in English.

**How to apply:** Localize the entire active sign-in/sign-up surface and its global fields/errors. When validating templates, preserve interpolation variable names and expressions but allow quoted fallback link labels inside expressions to be translated; comparing whole placeholder strings rejects valid localized legal links.