/**
 * app/lib/sync/syncTables.ts
 * --------------------------------------------------------------------------
 * Complete Eleeveon Schools synchronization table registry.
 *
 * Design guarantees:
 * - every Dexie table in the current database schema is classified exactly once;
 * - LOCAL_FIRST_SYNC_TABLES may push and pull through SyncRecord;
 * - BACKEND_CACHE_TABLES may be pulled/refreshed but never pushed by normal CRUD;
 * - BACKEND_ONLY_TABLES contain sensitive/server-authoritative records;
 * - LOCAL_ONLY_TABLES never leave this browser database;
 * - mediaAssets contains safe metadata only;
 * - mediaBlobs contains Blob/File data and is always local-only;
 * - database protection stores are always local-only;
 * - backward-compatible exports remain available.
 *
 * IMPORTANT:
 * When a new Dexie table is added, add it to ALL_KNOWN_DEXIE_TABLES and exactly
 * one classification list. validateSyncTableRegistry() will report omissions,
 * duplicates, and unknown names during development.
 */

// ============================================================================
// COMPLETE CURRENT DEXIE TABLE INVENTORY
// Keep this list aligned with EleeveonDatabase table declarations.
// ============================================================================

export const ALL_KNOWN_DEXIE_TABLES = [
  // Local-first school data
  "schools",
  "branches",
  "academicStructures",
  "academicPeriods",
  "organizations",

  "students",
  "teachers",
  "parents",
  "studentParents",

  "classes",
  "subjects",
  "programs",
  "curriculums",
  "curriculumPathways",
  "curriculumSubjects",
  "classSubjects",
  "subjectPrerequisites",
  "studentCurriculums",
  "subjectOfferings",
  "assignments",
  "classTeachers",
  "studentEnrollments",

  "gradingSystems",
  "gradeRules",
  "assessmentStructures",
  "assessmentStructureItems",
  "assessmentApplicabilities",
  "assessmentComponents",
  "assessmentEntries",
  "computedResults",

  "attendance",
  "teacherAttendance",

  "reportCards",
  "reportCardItems",
  "reportCardTemplates",
  "reportCardTemplateSettings",
  "reportCardTemplateAssignments",
  "studentReportSnapshots",
  "studentPromotions",

  "feeStructures",
  "payments",
  "incomes",
  "expenses",

  "currencies",
  "schoolCurrencySettings",

  "paymentIntents",
  "paymentTransactions",
  "paymentRefunds",
  "paymentSettlements",
  "withdrawalRequests",
  "schoolPayoutSettings",

  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",

  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",

  "announcements",
  "announcementRecipients",
  "messageThreads",
  "messages",
  "communicationLogs",
  "notificationTemplates",

  "schoolBranchSettings",

  "mediaAssets",
  "mediaBlobs",

  "calendarEvents",
  "calendarEventParticipants",
  "calendarEventReminders",
  "calendarEventResponses",

  "scheduleTimetables",
  "scheduleSessions",
  "scheduleResources",
  "scheduleConflicts",

  // Backend/platform cache and sensitive tables
  "appUsers",
  "userMemberships",
  "permissionRules",
  "accounts",
  "userSessions",
  "subscriptionPlans",
  "accountSubscriptions",
  "invoices",
  "appPayments",
  "billingEvents",
  "syncDevices",
  "syncConflicts",
  "apiClients",
  "apiKeys",
  "webhooks",
  "webhookLogs",
  "integrationMappings",
  "auditLogs",
  "backgroundJobs",
  "storageUsages",
  "accountFeatureFlags",
  "accountSystemSettings",
  "notificationDeliveryLogs",
  "paymentProviderEvents",

  // Local database protection/recovery stores
  "migrationJournal",
  "databaseRecoveryBackups",
  "syncQuarantine",
] as const;

export type KnownDexieTableName =
  (typeof ALL_KNOWN_DEXIE_TABLES)[number];

// ============================================================================
// LOCAL-FIRST SCHOOL DATA
// These tables use normal browser CRUD and SyncRecord push + pull.
// ============================================================================

export const LOCAL_FIRST_SYNC_TABLES = [
  // Core school structure
  "schools",
  "branches",
  "academicStructures",
  "academicPeriods",
  "organizations",

  // People and relationships
  "students",
  "teachers",
  "parents",
  "studentParents",

  // Academic setup and delivery
  "classes",
  "subjects",
  "programs",
  "curriculums",
  "curriculumPathways",
  "curriculumSubjects",
  "classSubjects",
  "subjectPrerequisites",
  "studentCurriculums",
  "subjectOfferings",
  "assignments",
  "classTeachers",
  "studentEnrollments",

  // Assessment and grading
  "gradingSystems",
  "gradeRules",
  "assessmentStructures",
  "assessmentStructureItems",
  "assessmentApplicabilities",
  "assessmentComponents",
  "assessmentEntries",
  "computedResults",

  // Attendance
  "attendance",
  "teacherAttendance",

  // Reporting
  "reportCards",
  "reportCardItems",
  "reportCardTemplates",
  "reportCardTemplateSettings",
  "reportCardTemplateAssignments",
  "studentReportSnapshots",
  "studentPromotions",

  // Finance
  "feeStructures",
  "payments",
  "incomes",
  "expenses",

  // Currency
  "currencies",
  "schoolCurrencySettings",

  // App-created payment records
  // Provider webhook events remain backend-owned and are listed separately.
  "paymentIntents",
  "paymentTransactions",
  "paymentRefunds",

  // Wallet, settlement and payout
  "paymentSettlements",
  "withdrawalRequests",
  "schoolPayoutSettings",

  // Student fee invoicing
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",

  // Payroll
  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",

  // Communications
  "announcements",
  "announcementRecipients",
  "messageThreads",
  "messages",
  "communicationLogs",
  "notificationTemplates",

  // Settings
  "schoolBranchSettings",

  // Safe media metadata only
  "mediaAssets",

  // Calendar
  "calendarEvents",
  "calendarEventParticipants",
  "calendarEventReminders",
  "calendarEventResponses",

  // Timetables and resources
  "scheduleTimetables",
  "scheduleSessions",
  "scheduleResources",
  "scheduleConflicts",
] as const satisfies readonly KnownDexieTableName[];

export type LocalFirstSyncTableName =
  (typeof LOCAL_FIRST_SYNC_TABLES)[number];

// ============================================================================
// BACKEND-OWNED CACHE TABLES
// Safe server-authoritative records cached in Dexie for UI/startup.
// They may be pulled/refreshed but never pushed through normal local-first CRUD.
// ============================================================================

export const BACKEND_CACHE_TABLES = [
  "appUsers",
  "userMemberships",
  "permissionRules",
  "accounts",

  "subscriptionPlans",
  "accountSubscriptions",
  "invoices",
  "appPayments",
  "billingEvents",

  "syncDevices",
  "syncConflicts",

  "apiClients",
  "webhooks",
  "webhookLogs",
  "integrationMappings",

  "auditLogs",
  "backgroundJobs",
  "storageUsages",

  "accountFeatureFlags",
  "accountSystemSettings",
  "notificationDeliveryLogs",

  // Payment-provider webhook/event records are backend authoritative.
  "paymentProviderEvents",
] as const satisfies readonly KnownDexieTableName[];

export type BackendCacheTableName =
  (typeof BACKEND_CACHE_TABLES)[number];

// ============================================================================
// BACKEND-ONLY / SENSITIVE TABLES
// These stores may exist in Dexie for tightly controlled compatibility, but
// secret/hash-bearing rows must never be normally pushed or broadly cached.
// ============================================================================

export const BACKEND_ONLY_TABLES = [
  "userSessions",
  "apiKeys",
] as const satisfies readonly KnownDexieTableName[];

export type BackendOnlyTableName =
  (typeof BACKEND_ONLY_TABLES)[number];

// ============================================================================
// LOCAL-ONLY TABLES
// Browser-only data, binary blobs, migrations, backups and quarantine.
// These must never enter SyncRecord JSON or platform-cache responses.
// ============================================================================

export const LOCAL_ONLY_TABLES = [
  // Binary media payloads
  "mediaBlobs",

  // Database upgrade/recovery infrastructure
  "migrationJournal",
  "databaseRecoveryBackups",

  // Invalid push/pull records retained for diagnosis and repair
  "syncQuarantine",
] as const satisfies readonly KnownDexieTableName[];

export type LocalOnlyTableName =
  (typeof LOCAL_ONLY_TABLES)[number];

// ============================================================================
// SYNC DIRECTION EXPORTS
// ============================================================================

/**
 * Backward-compatible name used by older local CRUD and synchronization code.
 * It intentionally contains only local-first tables.
 */
export type SyncTableName =
  LocalFirstSyncTableName;

export const SYNC_TABLES: SyncTableName[] = [
  ...LOCAL_FIRST_SYNC_TABLES,
];

/**
 * Explicit browser-push allow-list.
 */
export const PUSH_SYNC_TABLES: SyncTableName[] = [
  ...LOCAL_FIRST_SYNC_TABLES,
];

/**
 * Normal SyncRecord pulls are local-first.
 * Safe platform cache records may also be accepted by the frontend pull/apply
 * pipeline when the backend includes them.
 */
export const PULL_SYNC_TABLES = [
  ...LOCAL_FIRST_SYNC_TABLES,
  ...BACKEND_CACHE_TABLES,
] as const;

export type PullSyncTableName =
  (typeof PULL_SYNC_TABLES)[number];

/**
 * All tables that may be returned to the browser through either normal pull or
 * explicit platform-cache/bootstrap responses.
 */
export const BROWSER_READABLE_TABLES = [
  ...LOCAL_FIRST_SYNC_TABLES,
  ...BACKEND_CACHE_TABLES,
] as const;

export type BrowserReadableTableName =
  (typeof BROWSER_READABLE_TABLES)[number];

/**
 * Tables that must never be included in a browser push request.
 */
export const NEVER_PUSH_TABLES = [
  ...BACKEND_CACHE_TABLES,
  ...BACKEND_ONLY_TABLES,
  ...LOCAL_ONLY_TABLES,
] as const;

export type NeverPushTableName =
  (typeof NEVER_PUSH_TABLES)[number];

// ============================================================================
// SETS
// ============================================================================

export const KNOWN_DEXIE_TABLE_SET =
  new Set<string>(
    ALL_KNOWN_DEXIE_TABLES,
  );

export const SYNC_TABLE_SET =
  new Set<string>(
    SYNC_TABLES,
  );

export const PUSH_SYNC_TABLE_SET =
  new Set<string>(
    PUSH_SYNC_TABLES,
  );

export const LOCAL_FIRST_SYNC_TABLE_SET =
  new Set<string>(
    LOCAL_FIRST_SYNC_TABLES,
  );

export const BACKEND_CACHE_TABLE_SET =
  new Set<string>(
    BACKEND_CACHE_TABLES,
  );

export const BACKEND_ONLY_TABLE_SET =
  new Set<string>(
    BACKEND_ONLY_TABLES,
  );

export const LOCAL_ONLY_TABLE_SET =
  new Set<string>(
    LOCAL_ONLY_TABLES,
  );

export const PULL_SYNC_TABLE_SET =
  new Set<string>(
    PULL_SYNC_TABLES,
  );

export const BROWSER_READABLE_TABLE_SET =
  new Set<string>(
    BROWSER_READABLE_TABLES,
  );

export const NEVER_PUSH_TABLE_SET =
  new Set<string>(
    NEVER_PUSH_TABLES,
  );

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isKnownDexieTable(
  tableName: string,
): tableName is KnownDexieTableName {
  return KNOWN_DEXIE_TABLE_SET.has(
    tableName,
  );
}

export function isSyncTable(
  tableName: string,
): tableName is SyncTableName {
  return SYNC_TABLE_SET.has(
    tableName,
  );
}

export function isLocalFirstSyncTable(
  tableName: string,
): tableName is LocalFirstSyncTableName {
  return LOCAL_FIRST_SYNC_TABLE_SET.has(
    tableName,
  );
}

export function isPushSyncTable(
  tableName: string,
): tableName is SyncTableName {
  return PUSH_SYNC_TABLE_SET.has(
    tableName,
  );
}

export function isPullSyncTable(
  tableName: string,
): tableName is PullSyncTableName {
  return PULL_SYNC_TABLE_SET.has(
    tableName,
  );
}

export function isBrowserReadableTable(
  tableName: string,
): tableName is BrowserReadableTableName {
  return BROWSER_READABLE_TABLE_SET.has(
    tableName,
  );
}

export function isBackendCacheTable(
  tableName: string,
): tableName is BackendCacheTableName {
  return BACKEND_CACHE_TABLE_SET.has(
    tableName,
  );
}

export function isBackendOnlyTable(
  tableName: string,
): tableName is BackendOnlyTableName {
  return BACKEND_ONLY_TABLE_SET.has(
    tableName,
  );
}

export function isLocalOnlyTable(
  tableName: string,
): tableName is LocalOnlyTableName {
  return LOCAL_ONLY_TABLE_SET.has(
    tableName,
  );
}

export function isNeverPushTable(
  tableName: string,
): tableName is NeverPushTableName {
  return NEVER_PUSH_TABLE_SET.has(
    tableName,
  );
}

// ============================================================================
// BACKWARD-COMPATIBLE BACKEND-DRIVEN NAMES
// ============================================================================

export const BACKEND_DRIVEN_TABLES =
  BACKEND_CACHE_TABLES;

export type BackendDrivenTableName =
  BackendCacheTableName;

export const BACKEND_DRIVEN_TABLE_SET =
  BACKEND_CACHE_TABLE_SET;

export function isBackendDrivenTable(
  tableName: string,
): tableName is BackendDrivenTableName {
  return isBackendCacheTable(
    tableName,
  );
}

// ============================================================================
// FILTER HELPERS
// ============================================================================

export function getSyncTables(
  options?: {
    include?: readonly string[];
    exclude?: readonly string[];
  },
) {
  let tables =
    [...SYNC_TABLES] as string[];

  if (options?.include?.length) {
    const include =
      new Set(
        options.include,
      );

    tables =
      tables.filter(
        (table) =>
          include.has(table),
      );
  }

  if (options?.exclude?.length) {
    const exclude =
      new Set(
        options.exclude,
      );

    tables =
      tables.filter(
        (table) =>
          !exclude.has(table),
      );
  }

  return tables as SyncTableName[];
}

export function getPullSyncTables(
  options?: {
    include?: readonly string[];
    exclude?: readonly string[];
  },
) {
  let tables =
    [...PULL_SYNC_TABLES] as string[];

  if (options?.include?.length) {
    const include =
      new Set(
        options.include,
      );

    tables =
      tables.filter(
        (table) =>
          include.has(table),
      );
  }

  if (options?.exclude?.length) {
    const exclude =
      new Set(
        options.exclude,
      );

    tables =
      tables.filter(
        (table) =>
          !exclude.has(table),
      );
  }

  return tables as PullSyncTableName[];
}

// ============================================================================
// REGISTRY INTEGRITY VALIDATION
// ============================================================================

export type SyncTableRegistryValidation = {
  ok: boolean;
  missingTables: string[];
  multiplyClassifiedTables: string[];
  unknownClassifiedTables: string[];
  duplicateEntriesWithinLists: Record<string, string[]>;
  classificationByTable: Record<string, string[]>;
};

function duplicateValues(
  values: readonly string[],
) {
  const seen =
    new Set<string>();

  const duplicates =
    new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  return [...duplicates].sort();
}

/**
 * Verifies that every known Dexie table is present in exactly one primary
 * classification and that no classification references an unknown table.
 *
 * Safe to call during DatabaseBootstrap, tests, or development startup.
 */
export function validateSyncTableRegistry():
  SyncTableRegistryValidation {
  const classifications = {
    localFirst:
      LOCAL_FIRST_SYNC_TABLES as readonly string[],
    backendCache:
      BACKEND_CACHE_TABLES as readonly string[],
    backendOnly:
      BACKEND_ONLY_TABLES as readonly string[],
    localOnly:
      LOCAL_ONLY_TABLES as readonly string[],
  };

  const classificationByTable:
    Record<string, string[]> = {};

  for (
    const [
      classification,
      tables,
    ] of Object.entries(
      classifications,
    )
  ) {
    for (const table of tables) {
      (
        classificationByTable[
          table
        ] ||= []
      ).push(
        classification,
      );
    }
  }

  const known =
    new Set<string>(
      ALL_KNOWN_DEXIE_TABLES,
    );

  const classified =
    Object.keys(
      classificationByTable,
    );

  const missingTables =
    [...known]
      .filter(
        (table) =>
          !classificationByTable[
            table
          ],
      )
      .sort();

  const multiplyClassifiedTables =
    classified
      .filter(
        (table) =>
          classificationByTable[
            table
          ].length !== 1,
      )
      .sort();

  const unknownClassifiedTables =
    classified
      .filter(
        (table) =>
          !known.has(table),
      )
      .sort();

  const duplicateEntriesWithinLists =
    Object.fromEntries(
      Object.entries(
        classifications,
      ).map(
        ([
          name,
          tables,
        ]) => [
          name,
          duplicateValues(
            tables,
          ),
        ],
      ),
    );

  const hasInternalDuplicates =
    Object.values(
      duplicateEntriesWithinLists,
    ).some(
      (duplicates) =>
        duplicates.length > 0,
    );

  return {
    ok:
      missingTables.length === 0 &&
      multiplyClassifiedTables.length ===
        0 &&
      unknownClassifiedTables.length ===
        0 &&
      !hasInternalDuplicates,
    missingTables,
    multiplyClassifiedTables,
    unknownClassifiedTables,
    duplicateEntriesWithinLists,
    classificationByTable,
  };
}

/**
 * Throws a detailed startup error when the registry and Dexie schema drift.
 */
export function assertValidSyncTableRegistry() {
  const result =
    validateSyncTableRegistry();

  if (result.ok) {
    return result;
  }

  const details = [
    result.missingTables.length
      ? `Missing: ${result.missingTables.join(", ")}`
      : "",
    result.multiplyClassifiedTables.length
      ? `Multiply classified: ${result.multiplyClassifiedTables.join(", ")}`
      : "",
    result.unknownClassifiedTables.length
      ? `Unknown: ${result.unknownClassifiedTables.join(", ")}`
      : "",
    ...Object.entries(
      result.duplicateEntriesWithinLists,
    )
      .filter(
        (
          [, duplicates],
        ) =>
          duplicates.length > 0,
      )
      .map(
        ([
          listName,
          duplicates,
        ]) =>
          `Duplicates in ${listName}: ${duplicates.join(", ")}`,
      ),
  ]
    .filter(Boolean)
    .join(" | ");

  throw new Error(
    `Invalid synchronization table registry. ${details}`,
  );
}

/**
 * Optional non-throwing development warning.
 */
export function warnIfSyncTableRegistryInvalid() {
  const result =
    validateSyncTableRegistry();

  if (
    !result.ok &&
    typeof console !==
      "undefined"
  ) {
    console.error(
      "[syncTables] Registry validation failed:",
      result,
    );
  }

  return result;
}