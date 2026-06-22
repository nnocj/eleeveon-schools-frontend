/**
 * app/lib/sync/syncTables.ts
 * ---------------------------------------------------------
 * Eleeveon Schools sync table registry.
 * ---------------------------------------------------------
 * Backward-compatible with your existing app:
 * - SYNC_TABLES is still exported.
 * - SyncTableName is still exported.
 * - isSyncTable(...) is still exported.
 *
 * Media asset fix:
 * - mediaAssets is LOCAL-FIRST and browser-pushable because it stores safe
 *   media metadata/references used by normal offline CRUD records.
 * - mediaAssetBlobs is intentionally NOT pushable because it stores heavy
 *   local Blob/File data that must not travel through normal SyncRecord JSON.
 * - mediaAssetBlobs should be handled by a dedicated media upload pipeline.
 *
 * Upgrade added:
 * - LOCAL_FIRST_SYNC_TABLES: normal Dexie school data that can push + pull.
 * - BACKEND_CACHE_TABLES: cloud-owned platform records cached locally for UI.
 * - BACKEND_ONLY_TABLES: sensitive/server-only records that must not be pushed.
 * - LOCAL_ONLY_TABLES: browser-only Dexie records that must never be pushed.
 *
 * Wallet/payout update:
 * - schoolPayoutSettings, paymentSettlements and withdrawalRequests are local-first
 *   so Branch Admin wallet/payout pages can save and push from the browser.
 */

// ======================================================
// LOCAL-FIRST SCHOOL DATA TABLES
// These are synced through SyncRecord payloads.
// ======================================================
export const LOCAL_FIRST_SYNC_TABLES = [
  // Core school structure
  "schools",
  "branches",
  "academicStructures",
  "academicPeriods",
  "organizations",

  // People
  "students",
  "teachers",
  "parents",
  "studentParents",

  // Academic structure
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

  // Assessment + grading
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
  "studentReportSnapshots",
  "studentPromotions",

  // Finance - local school operations
  "feeStructures",
  "payments",
  "incomes",
  "expenses",

  // Currency
  "currencies",
  "schoolCurrencySettings",

  // Payment gateway / transactions created from the app UI.
  // Provider webhook events are listed separately as backend-owned.
  "paymentIntents",
  "paymentTransactions",
  "paymentRefunds",

  // Branch wallet / payout settings.
  // These are local-first because Branch Admin can configure payout destination
  // and request withdrawals while offline. Backend/provider verification can
  // later update the same records through sync.
  "schoolPayoutSettings",
  "paymentSettlements",
  "withdrawalRequests",

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

  // Calendar / scheduling
  "calendarEvents",
  "calendarEventParticipants",
  "calendarEventReminders",
  "calendarEventResponses",
  "scheduleTimetables",
  "scheduleSessions",
  "scheduleResources",
  "scheduleConflicts",

  // Settings
  "schoolBranchSettings",

  // Media metadata only.
  // This table is safe to push because it should contain IDs, ownership,
  // mime type, dimensions, sizes, preview thumbnail, remote URL/status, etc.
  // It must NOT contain the full binary Blob/File payload.
  "mediaAssets",
] as const;

export type LocalFirstSyncTableName = (typeof LOCAL_FIRST_SYNC_TABLES)[number];

// ======================================================
// BACKEND-OWNED CACHE TABLES
// These can be pulled/refreshed into Dexie for UI display,
// but should NOT be pushed by normal offline CRUD.
// ======================================================
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
  "paymentProviderEvents",
] as const;

export type BackendCacheTableName = (typeof BACKEND_CACHE_TABLES)[number];

// ======================================================
// BACKEND-ONLY / SENSITIVE TABLES
// These must never be freely pushed from the browser.
// Some may be cached partially, but secrets/hashes must stay server-side.
// ======================================================
export const BACKEND_ONLY_TABLES = [
  "userSessions",
  "apiKeys",
] as const;

export type BackendOnlyTableName = (typeof BACKEND_ONLY_TABLES)[number];

// ======================================================
// LOCAL-ONLY TABLES
// These are Dexie/browser-only support tables.
// They must never be pushed through normal JSON SyncRecord payloads.
// ======================================================
export const LOCAL_ONLY_TABLES = [
  "mediaAssetBlobs",
] as const;

export type LocalOnlyTableName = (typeof LOCAL_ONLY_TABLES)[number];

// ======================================================
// BACKWARD-COMPATIBLE EXPORTS
// ======================================================
export type SyncTableName = LocalFirstSyncTableName;

/**
 * Kept for existing code. This is intentionally local-first only.
 */
export const SYNC_TABLES: SyncTableName[] = [...LOCAL_FIRST_SYNC_TABLES];

/**
 * Explicit push table list. Use this in pushSync.
 */
export const PUSH_SYNC_TABLES: SyncTableName[] = [...LOCAL_FIRST_SYNC_TABLES];

/**
 * Pull accepts both local-first SyncRecord records and safe backend cache records.
 */
export const PULL_SYNC_TABLES = [
  ...LOCAL_FIRST_SYNC_TABLES,
  ...BACKEND_CACHE_TABLES,
] as const;

export type PullSyncTableName = (typeof PULL_SYNC_TABLES)[number];

export const SYNC_TABLE_SET = new Set<string>(SYNC_TABLES);
export const PUSH_SYNC_TABLE_SET = new Set<string>(PUSH_SYNC_TABLES);
export const LOCAL_FIRST_SYNC_TABLE_SET = new Set<string>(LOCAL_FIRST_SYNC_TABLES);
export const BACKEND_CACHE_TABLE_SET = new Set<string>(BACKEND_CACHE_TABLES);
export const BACKEND_ONLY_TABLE_SET = new Set<string>(BACKEND_ONLY_TABLES);
export const LOCAL_ONLY_TABLE_SET = new Set<string>(LOCAL_ONLY_TABLES);
export const PULL_SYNC_TABLE_SET = new Set<string>(PULL_SYNC_TABLES as readonly string[]);

export function isSyncTable(tableName: string): tableName is SyncTableName {
  return SYNC_TABLE_SET.has(tableName);
}

export function isLocalFirstSyncTable(tableName: string): tableName is LocalFirstSyncTableName {
  return LOCAL_FIRST_SYNC_TABLE_SET.has(tableName);
}

export function isPushSyncTable(tableName: string): tableName is SyncTableName {
  return PUSH_SYNC_TABLE_SET.has(tableName);
}

export function isPullSyncTable(tableName: string): tableName is PullSyncTableName {
  return PULL_SYNC_TABLE_SET.has(tableName);
}

export function isBackendCacheTable(tableName: string): tableName is BackendCacheTableName {
  return BACKEND_CACHE_TABLE_SET.has(tableName);
}

export function isBackendOnlyTable(tableName: string): tableName is BackendOnlyTableName {
  return BACKEND_ONLY_TABLE_SET.has(tableName);
}

export function isLocalOnlyTable(tableName: string): tableName is LocalOnlyTableName {
  return LOCAL_ONLY_TABLE_SET.has(tableName);
}

/**
 * Old name kept so old imports do not break.
 */
export const BACKEND_DRIVEN_TABLES = BACKEND_CACHE_TABLES;
export type BackendDrivenTableName = BackendCacheTableName;
export const BACKEND_DRIVEN_TABLE_SET = BACKEND_CACHE_TABLE_SET;
export function isBackendDrivenTable(tableName: string): tableName is BackendDrivenTableName {
  return isBackendCacheTable(tableName);
}

export function getSyncTables(options?: { include?: readonly string[]; exclude?: readonly string[] }) {
  let tables = [...SYNC_TABLES] as string[];

  if (options?.include?.length) {
    const include = new Set(options.include);
    tables = tables.filter((table) => include.has(table));
  }

  if (options?.exclude?.length) {
    const exclude = new Set(options.exclude);
    tables = tables.filter((table) => !exclude.has(table));
  }

  return tables as SyncTableName[];
}
