/**
 * app/lib/sync/syncIntegrity.ts
 * --------------------------------------------------------------------------
 * Phase 17 synchronization integrity checks and local quarantine.
 *
 * Invalid records are never written into normal application tables.
 *
 * UUID contract:
 * - localId is the permanent client-generated entity UUID;
 * - cloudId is the Prisma SyncRecord UUID;
 * - accountId, schoolId, branchId and relationship IDs are string IDs;
 * - quarantine preserves UUID strings without numeric coercion.
 */

import { db } from "../db/db";

import type {
  SyncPullRecord,
  SyncPushRecord,
} from "./syncConfig";

import {
  isPullSyncTable,
  isPushSyncTable,
} from "./syncTables";

export type SyncIntegritySource =
  | "push"
  | "pull"
  | "health-check"
  | "manual";

export type SyncIntegrityIssue = {
  code: string;
  message: string;
  field?: string;
};

export type SyncIntegrityResult<T> = {
  ok: boolean;
  record?: T;
  issues: SyncIntegrityIssue[];
};

export type QuarantineInput = {
  source: SyncIntegritySource;
  accountId?: string | null;
  tableName?: string | null;

  /**
   * Permanent UUID of the local-first entity.
   */
  localId?: string | null;

  /**
   * Prisma SyncRecord UUID.
   */
  cloudId?: string | null;

  /**
   * Temporary compatibility aliases for callers not yet migrated.
   */
  entityId?: string | null;
  id?: string | null;

  reason: string;
  payload?: unknown;
};

const SCHOOL_REQUIRED_TABLES = new Set([
  "branches",
  "academicStructures",
  "academicPeriods",
  "programs",
  "curriculums",
  "curriculumPathways",
  "curriculumSubjects",
  "subjectPrerequisites",
  "gradingSystems",
  "gradeRules",
  "assessmentStructures",
  "assessmentStructureItems",
  "reportCardTemplates",
  "reportCardTemplateSettings",
  "reportCardTemplateAssignments",
  "feeStructures",
  "schoolCurrencySettings",
  "schoolPayoutSettings",
]);

const BRANCH_REQUIRED_TABLES = new Set([
  "students",
  "teachers",
  "parents",
  "studentParents",
  "classes",
  "classSubjects",
  "classTeachers",
  "studentCurriculums",
  "subjectOfferings",
  "assignments",
  "studentEnrollments",
  "assessmentApplicabilities",
  "assessmentComponents",
  "assessmentEntries",
  "computedResults",
  "attendance",
  "teacherAttendance",
  "reportCards",
  "reportCardItems",
  "studentReportSnapshots",
  "studentPromotions",
  "payments",
  "incomes",
  "expenses",
  "paymentIntents",
  "paymentTransactions",
  "paymentRefunds",
  "paymentSettlements",
  "withdrawalRequests",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",
  "schoolBranchSettings",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanString(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || undefined;
}

function isUuid(value: unknown) {
  const clean = cleanString(value);
  return Boolean(clean && UUID_PATTERN.test(clean));
}

function validPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function validTimestamp(value: unknown) {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number > 0 &&
    number <= Date.now() + 24 * 60 * 60 * 1000
  );
}

function isPlainJsonObject(
  value: unknown,
): value is Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function isJsonSafe(
  value: unknown,
  seen = new Set<object>(),
): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "undefined") {
    return false;
  }

  if (
    typeof value === "bigint" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return false;
  }

  if (
    typeof Blob !== "undefined" &&
    value instanceof Blob
  ) {
    return false;
  }

  if (
    typeof File !== "undefined" &&
    value instanceof File
  ) {
    return false;
  }

  if (value instanceof Date) {
    return true;
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return false;
    }

    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.every((item) =>
        isJsonSafe(item, seen),
      );
    }

    if (!isPlainJsonObject(value)) {
      return false;
    }

    return Object.values(value).every(
      (item) =>
        item !== undefined &&
        isJsonSafe(item, seen),
    );
  }

  return false;
}

function tenantIssues(
  tableName: string,
  payload: Record<string, any>,
  accountId: string,
) {
  const issues: SyncIntegrityIssue[] = [];

  if (cleanString(payload.accountId) !== accountId) {
    issues.push({
      code: "PAYLOAD_ACCOUNT_MISMATCH",
      field: "payload.accountId",
      message:
        "Payload accountId does not match the active account.",
    });
  }

  const requiresSchool =
    SCHOOL_REQUIRED_TABLES.has(tableName) ||
    BRANCH_REQUIRED_TABLES.has(tableName);

  if (
    requiresSchool &&
    !isUuid(payload.schoolId)
  ) {
    issues.push({
      code: "MISSING_SCHOOL_ID",
      field: "payload.schoolId",
      message:
        `${tableName} requires a valid school UUID.`,
    });
  }

  if (
    BRANCH_REQUIRED_TABLES.has(tableName) &&
    !isUuid(payload.branchId)
  ) {
    issues.push({
      code: "MISSING_BRANCH_ID",
      field: "payload.branchId",
      message:
        `${tableName} requires a valid branch UUID.`,
    });
  }

  return issues;
}

export function validatePushRecord(
  input: unknown,
  activeAccountId: string,
): SyncIntegrityResult<SyncPushRecord> {
  const issues: SyncIntegrityIssue[] = [];
  const record = input as SyncPushRecord;
  const tableName =
    cleanString(record?.tableName);
  const accountId =
    cleanString(record?.accountId);

  if (
    !tableName ||
    !isPushSyncTable(tableName)
  ) {
    issues.push({
      code: "TABLE_NOT_PUSHABLE",
      field: "tableName",
      message:
        `${tableName || "Unknown table"} is not browser-pushable.`,
    });
  }

  if (!accountId) {
    issues.push({
      code: "MISSING_ACCOUNT_ID",
      field: "accountId",
      message:
        "The synchronization record has no accountId.",
    });
  } else if (accountId !== activeAccountId) {
    issues.push({
      code: "ACCOUNT_MISMATCH",
      field: "accountId",
      message:
        "The synchronization record belongs to another account.",
    });
  }

  if (!isUuid(record?.localId)) {
    issues.push({
      code: "INVALID_LOCAL_ID",
      field: "localId",
      message:
        "The synchronization record has no valid permanent local UUID.",
    });
  }

  if (
    record?.cloudId != null &&
    cleanString(record.cloudId) &&
    !isUuid(record.cloudId)
  ) {
    issues.push({
      code: "INVALID_CLOUD_ID",
      field: "cloudId",
      message:
        "The synchronization record cloudId is not a valid UUID.",
    });
  }

  if (!validPositiveNumber(record?.version)) {
    issues.push({
      code: "INVALID_VERSION",
      field: "version",
      message:
        "The synchronization version must be a positive number.",
    });
  }

  if (!validTimestamp(record?.updatedAt)) {
    issues.push({
      code: "INVALID_TIMESTAMP",
      field: "updatedAt",
      message:
        "The synchronization timestamp is missing or invalid.",
    });
  }

  if (
    !isPlainJsonObject(record?.payload) ||
    !isJsonSafe(record.payload)
  ) {
    issues.push({
      code: "INVALID_JSON_PAYLOAD",
      field: "payload",
      message:
        "The synchronization payload is not a valid JSON object.",
    });
  } else if (tableName && accountId) {
    issues.push(
      ...tenantIssues(
        tableName,
        record.payload,
        activeAccountId,
      ),
    );
  }

  return {
    ok: issues.length === 0,
    record:
      issues.length
        ? undefined
        : record,
    issues,
  };
}

export function validatePullRecord(
  input: unknown,
  activeAccountId: string,
): SyncIntegrityResult<SyncPullRecord> {
  const issues: SyncIntegrityIssue[] = [];
  const record = input as SyncPullRecord;
  const tableName =
    cleanString(record?.tableName);
  const accountId =
    cleanString(record?.accountId);

  if (
    !tableName ||
    !isPullSyncTable(tableName)
  ) {
    issues.push({
      code: "TABLE_NOT_PULLABLE",
      field: "tableName",
      message:
        `${tableName || "Unknown table"} is not allowed in pull synchronization.`,
    });
  }

  if (
    !accountId ||
    accountId !== activeAccountId
  ) {
    issues.push({
      code: "ACCOUNT_MISMATCH",
      field: "accountId",
      message:
        "Pulled record accountId does not match the active account.",
    });
  }

  if (!isUuid(record?.localId)) {
    issues.push({
      code: "INVALID_LOCAL_ID",
      field: "localId",
      message:
        "Pulled record has no valid permanent local UUID.",
    });
  }

  if (!isUuid(record?.cloudId)) {
    issues.push({
      code: "MISSING_CLOUD_ID",
      field: "cloudId",
      message:
        "Pulled record has no valid stable cloud UUID.",
    });
  }

  if (!validPositiveNumber(record?.version)) {
    issues.push({
      code: "INVALID_VERSION",
      field: "version",
      message:
        "Pulled record version is missing or invalid.",
    });
  }

  if (!validTimestamp(record?.updatedAt)) {
    issues.push({
      code: "INVALID_TIMESTAMP",
      field: "updatedAt",
      message:
        "Pulled record timestamp is missing or invalid.",
    });
  }

  if (
    !isPlainJsonObject(record?.payload) ||
    !isJsonSafe(record.payload)
  ) {
    issues.push({
      code: "INVALID_JSON_PAYLOAD",
      field: "payload",
      message:
        "Pulled payload is not a valid JSON object.",
    });
  } else if (tableName && accountId) {
    issues.push(
      ...tenantIssues(
        tableName,
        record.payload,
        activeAccountId,
      ),
    );
  }

  return {
    ok: issues.length === 0,
    record:
      issues.length
        ? undefined
        : record,
    issues,
  };
}

export function integrityReason(
  issues: readonly SyncIntegrityIssue[],
) {
  return issues
    .map(
      (issue) =>
        `${issue.code}: ${issue.message}`,
    )
    .join(" | ");
}

export async function quarantineSyncRecord(
  input: QuarantineInput,
) {
  const table =
    (db as any).syncQuarantine;

  if (!table) {
    console.error(
      "[sync-integrity] syncQuarantine table is unavailable",
      input,
    );

    return undefined;
  }

  const localId =
    cleanString(
      input.localId ??
        input.entityId,
    );

  const cloudId =
    cleanString(
      input.cloudId ??
        input.id,
    );

  return table.add({
    accountId:
      cleanString(input.accountId),

    tableName:
      cleanString(input.tableName) ||
      "unknown",

    /**
     * Keep both current names and compatibility aliases while older local
     * databases or diagnostics pages may still read entityId/id.
     */
    localId,
    cloudId,
    entityId: localId,
    id: cloudId,

    reason:
      input.reason,

    payload:
      input.payload,

    source:
      input.source,

    quarantinedAt:
      Date.now(),
  });
}