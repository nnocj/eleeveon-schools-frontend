/** Eleeveon Schools Platform V2 database metadata. */
// Separate Independent and Cloud Dexie databases on the same PWA origin.
export const APP_DB_NAME = (typeof window !== "undefined" &&
  window.location.pathname.startsWith("/independent/workspace")
  ? (() => { const selector = new URLSearchParams(window.location.search).get('license');
      if (!selector) return "EleeveonIndependentDB";
      try {const old=localStorage.getItem('eleeveon_independent_browser_license_v1'); if(old){const payload=JSON.parse(JSON.parse(old).envelope.payload);if(String(payload.licenseId||payload.id)===selector)return "EleeveonIndependentDB";}}catch{}
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(selector)) throw new Error('Invalid Independent licence selector');
      return `EleeveonIndependentDB_${selector}`;
    })() : "EleeveonDB");

/**
 * Version 3 activates the assessment hierarchy runtime migration.
 * Version 2 may already exist on development devices, so the hierarchy data
 * repair must not be attached retroactively to version 2.
 */
export const APP_DB_VERSION = 3 as const;
export const APP_DB_PREVIOUS_VERSION = 2 as const;

export const APP_DB_MIGRATION_NAME =
  "v3-assessment-hierarchy-foundation" as const;

export const RECOVERY_DB_NAME = (APP_DB_NAME === 'EleeveonDB' || APP_DB_NAME === 'EleeveonIndependentDB' ? 'EleeveonRecoveryDB' : `${APP_DB_NAME}_Recovery`) as string;
export const RECOVERY_DB_VERSION = 1 as const;
export const RECOVERY_BACKUP_STORE = "backups" as const;

export const DATABASE_BOOTSTRAP_CHANNEL =
  `eleeveon-database-bootstrap-${APP_DB_NAME}` as string;
