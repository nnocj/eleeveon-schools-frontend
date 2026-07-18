/**
 * Eleeveon Schools database version metadata.
 *
 * Version 38 was the final schema before the database-protection foundation.
 * Version 39 added local-only migration, recovery, health and quarantine tools.
 *
 * Version 40 adds Phase 16 media hardening:
 * - canonical ownerIdentityKey metadata;
 * - identityVersion metadata;
 * - exact account + owner table + field matching;
 * - cloud/temp/device-local identity migration support;
 * - media integrity inspection and repair support.
 *
 * IMPORTANT:
 * APP_DB_NAME remains "EleeveonDB" so existing offline school data opens and
 * migrates in place. Changing the database name would create a separate empty
 * IndexedDB database.
 */

export const APP_DB_NAME =
  "EleeveonDB" as const;

export const APP_DB_PREVIOUS_VERSION =
  39 as const;

export const APP_DB_VERSION =
  40 as const;

export const APP_DB_MIGRATION_NAME =
  "v40-media-identity-hardening" as const;

export const RECOVERY_DB_NAME =
  "EleeveonRecoveryDB" as const;

export const RECOVERY_DB_VERSION =
  1 as const;

export const RECOVERY_BACKUP_STORE =
  "backups" as const;

export const DATABASE_BOOTSTRAP_CHANNEL =
  "eleeveon-database-bootstrap" as const;