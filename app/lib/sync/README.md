# Eleeveon Schools Sync Folder

This is a full replacement for `app/lib/sync` designed for the upgraded Eleeveon Schools `db.ts` and platform Prisma schema.

## What stayed backward-compatible

- Existing exports remain available through `index.ts`.
- `SYNC_TABLES`, `SyncTableName`, `isSyncTable`, CRUD helpers, `runSync`, and `useSyncStatus` still work.
- Existing pages that use `createRecord`, `updateRecord`, `deleteRecord`, `useLocalRecords`, or `runSync()` should continue to work.

## What changed

Tables are now grouped into three safer categories:

1. `LOCAL_FIRST_SYNC_TABLES`
   - School operational records pushed and pulled through SyncRecord.
   - Examples: students, teachers, classes, attendance, assessmentEntries, invoices, reports.

2. `BACKEND_CACHE_TABLES`
   - Backend-owned records cached locally for UI.
   - Examples: accounts, subscriptionPlans, accountSubscriptions, appPayments, auditLogs, feature flags, storage usage.

3. `BACKEND_ONLY_TABLES`
   - Sensitive/server-only records that must not be pushed freely from the browser.
   - Examples: userSessions, apiKeys.

## Optional upgraded endpoints

The folder supports optional new backend endpoints, but normal sync will not break if they are not ready yet:

- `POST /sync/bootstrap`
- `POST /sync/platform-cache`
- `POST /sync/devices/register`
- `GET/POST /sync/conflicts`

## Important

Do not add backend-secret tables to `SYNC_TABLES`. Keep secrets such as API key hashes, webhook secret hashes, and refresh token hashes on the backend only.
