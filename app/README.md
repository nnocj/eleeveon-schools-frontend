# Eleeveon Schools Components Upgrade

Drop this `components` folder into `app/components`.

## What changed

- `SyncBootstrap.tsx`
  - Keeps the same public behavior and context dependencies.
  - Adds safe upgraded sync support for device registration and platform cache refresh.
  - Uses dynamic imports so the app does not crash if an older sync folder is temporarily present.

- `SyncStatusStrip.tsx`
  - Keeps the same UI purpose.
  - Adds optional diagnostics from the upgraded sync layer: pending records, conflicts, errors, and last sync.

- `payments/payment-utils.ts`
  - Safer JSON handling for empty/non-JSON backend responses.
  - Supports more token key names.
  - Adds `getPaymentRedirectUrl()` to support both old and upgraded billing response shapes.

- `payments/PaymentCheckout.tsx`
  - Keeps the same props and route behavior.
  - Redirects correctly whether the backend returns `authorizationUrl` at the root or inside provider/payment objects.

## Compatibility notes

The role portal components were preserved to avoid breaking existing dashboard imports. This upgrade is designed to work with the upgraded Prisma, db.ts, sync folder, and backend source while keeping the current frontend stable.


Compact Print — easiest next; same structure but tighter.
Bordered Traditional — close to Classic Formal, just stronger borders/table styling.
Modern Clean — cleaner cards, softer spacing.
Letterhead Premium — branding-heavy header.
Side Profile — student photo/profile emphasis.
Cambridge — international academic style.
IB — clean international layout.
Kindergarten — softer early-years design.
Montessori — calm spacious early-years design.
University Transcript — transcript-style academic record.

Best approach: build one template at a time from Classic Formal, changing layout/styling only, not logic.