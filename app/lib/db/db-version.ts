/** Eleeveon Schools Platform V2 database metadata. */
export function resolveNormalDatabaseName(): string {
  if (typeof window === "undefined") return "EleeveonDB";
  const account = localStorage.getItem("eleeveon_account_id");
  if (!account || localStorage.getItem("eleeveon_local_workspace_account") !== account) return "EleeveonDB";
  try {
    const legacy = JSON.parse(localStorage.getItem("eleeveon_independent_browser_license_v1") || "null");
    if (legacy?.accountId === account) return "EleeveonIndependentDB";
    const records = JSON.parse(localStorage.getItem("eleeveon_independent_browser_licenses_v2") || "[]");
    const matches = records.filter((r: {accountId:string}) => r.accountId === account);
    if (matches.length === 1) {
      const payload = JSON.parse(matches[0].envelope.payload);
      const id = String(payload.licenseId || payload.id || "");
      if (/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return `EleeveonIndependentDB_${id}`;
    }
    if (matches.length > 1) throw new Error("Multiple installed licences require explicit data reconciliation");
  } catch (error) { throw error; }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(account)) throw new Error("Invalid account database selector");
  return `EleeveonIndependentDB_account_${account}`;
}

// Separate Independent and Cloud Dexie databases on the same PWA origin.
export const APP_DB_NAME = (typeof window !== "undefined" &&
  window.location.pathname.startsWith("/independent/workspace")
  ? (() => { const selector = new URLSearchParams(window.location.search).get('license');
      if (!selector) return "EleeveonIndependentDB";
      try {const old=localStorage.getItem('eleeveon_independent_browser_license_v1'); if(old){const payload=JSON.parse(JSON.parse(old).envelope.payload);if(String(payload.licenseId||payload.id)===selector)return "EleeveonIndependentDB";}}catch{}
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(selector)) throw new Error('Invalid Independent licence selector');
      return `EleeveonIndependentDB_${selector}`;
    })() : resolveNormalDatabaseName());

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
