# Kirayə təhvil-təslimi (rental handover)

Tehvil.az's main product: a rental record with a **move-in** and a **move-out** protocol, a side-by-side comparison and a PDF report. Goal: reduce deposit disputes by recording the flat's condition up front. The system never decides who is at fault and does not guarantee the deposit.

## Model

| Table | Purpose |
|---|---|
| `rentals` | `KR-…` number, address (only required field), property type, landlord/tenant/realtor name+phone, start/end date, monthly rent, deposit, currency, notes, `archived_at` |
| `rental_participants` | user ↔ rental with role `landlord` / `tenant` / `realtor`, `can_edit` |
| `rental_invites` | secure link `/k/<token>` (sha256 hash stored), role, `can_edit`, revocable, single-use, `last_opened_at` |
| `handover_protocols` | `kind` = `sale` / `move_in` / `move_out`, `rental_id`, for move-out `base_protocol_id`, `base_version`, `baseline` (frozen move-in snapshot) |
| `protocol_items` | per room: wall, floor, ceiling, window, door, furniture, appliance, other — condition, quantity, note, on move-out `change` (`unchanged`, `new_damage`, `changed`, `resolved`, `missing`) and `prev_item_id` |
| `protocol_media` | photos with server `created_at` (upload) and device `taken_at` + `taken_source` (`exif`/`camera`) kept separately |

The sale handover (`kind = sale`, seller/buyer, `/protokol/yeni`) still works unchanged.

## Flow

1. `POST /api/rentals` creates the rental, the creator's participant row and the move-in protocol with room/item templates.
2. Move-in: items per room, photos (camera via `capture=environment`, or gallery), meters, keys.
3. Invites: `POST /api/rentals/:id/invites { role, canEdit }`. View-only by default. `GET /api/rental-invites/:token` works without sign-in (read-only); approval requires an account (`POST …/accept`).
4. Submit → version frozen (content hash) → landlord and tenant decide separately (`approved` / `changes`). Each decision stores account, time, IP, user agent, auth level. Not a qualified e-signature.
5. `POST /api/rentals/:id/move-out` (idempotent) copies rooms and items from the move-in's latest submitted version (or live content), keeps the move-in snapshot as `baseline`, re-records meters and keys (counts start at 0).
6. PDF (Azerbaijani, DejaVu): rental block, per item "Girişdə / Çıxışda / Qeyd edilən dəyişiklik", photos Giriş | Çıxış side by side, meters with difference, keys given/returned, each party's approval status ("TƏSDİQLƏMƏYİB" if missing), unique number + version + content hash, neutral disclaimer.

## Security

- Every route checks rental participation server-side; strangers get 404.
- View-only participants cannot add/change items, rooms, media (403).
- Move-in items/rooms copied into a move-out cannot be deleted (409).
- Rental fields can't be changed while a protocol awaits approval (except notes); a rental with an approved protocol cannot be deleted.
- Media are served only through authenticated stream endpoints (or the live invite token), never public URLs.
- Audit history: `protocol_events` for every change; approvals per version.

## File retention

Photos and PDFs are kept as long as the rental exists. Approved protocols are archived, not deleted. Deletion on request via support@tehvil.az (see `public/privacy.html`).

## Admin analytics

`/admin/statistika` → `GET /api/admin/rental-stats`: rentals (total, 30 days), move-in sent/completed, move-out started/completed, PDF reports, photos, users, returning users, landlords with several rentals, weekly new rentals. Access: `TEHVIL_ADMIN_USER_IDS` / `TEHVIL_ADMIN_EMAILS` (or the price admin lists).

## Env

- `TEHVIL_ADMIN_EMAILS` — comma-separated admin e-mails for statistics.
- `PROTOCOL_REQUIRE_PHONE` — when `on`, approving requires a verified phone on the account.
