# Owner + Developer Portal Drop-in Files

This package separates the two roles that were previously mixed inside `app/account`:

- `app/developer` = platform creator / SaaS owner. Controls subscription packs, client accounts, platform invoices, support, sync diagnostics, system health, and audit logs.
- `app/owner` = school owner / super admin. Controls only their own schools, branches, users, roles, permissions, billing, subscription, invoices, payments, profile, backup, and settings.

## Drop-in notes

1. Copy the `app/owner` folder into your project.
2. Copy the `app/developer` folder into your project.
3. Copy `app/components/role-portals/RolePortalShell.tsx` if you do not already have the latest one.
4. Replace your `app/lib/auth/roleRedirect.ts` with the included updated file.

## Important

The owner pages are adapted from your previous `app/account` files and now live under `app/owner`.
The developer pages are fresh platform-level files and do not import from `app/dashboard/*`.
