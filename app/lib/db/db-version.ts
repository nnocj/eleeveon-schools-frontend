/** Eleeveon Schools Platform V2 database metadata. */
// Separate Independent and Cloud Dexie databases on the same PWA origin.
export const APP_DB_NAME = (typeof window !== "undefined" &&
  window.location.pathname.startsWith("/independent/workspace")
  ? "EleeveonIndependentDB" : "EleeveonDB");

/**
 * Version 3 activates the assessment hierarchy runtime migration.
 * Version 2 may already exist on development devices, so the hierarchy data
 * repair must not be attached retroactively to version 2.
 */
export const APP_DB_VERSION = 3 as const;
export const APP_DB_PREVIOUS_VERSION = 2 as const;

export const APP_DB_MIGRATION_NAME =
  "v3-assessment-hierarchy-foundation" as const;

export const RECOVERY_DB_NAME = "EleeveonRecoveryDB" as const;
export const RECOVERY_DB_VERSION = 1 as const;
export const RECOVERY_BACKUP_STORE = "backups" as const;

export const DATABASE_BOOTSTRAP_CHANNEL =
  "eleeveon-database-bootstrap" as const;
