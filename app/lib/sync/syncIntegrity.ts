/**
 * app/lib/sync/syncIntegrity.ts
 * --------------------------------------------------------------------------
 * Phase 17 synchronization integrity checks and local quarantine.
 *
 * Invalid records are never written into normal application tables.
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
  localId?: number | null;
  cloudId?: string | null;
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

function cleanString(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || undefined;
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

function isPlainJsonObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonSafe(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "undefined") return false;
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    return false;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) return false;
  if (typeof File !== "undefined" && value instanceof File) return false;
  if (value instanceof Date) return true;

  if (typeof value === "object") {
    if (seen.has(value as object)) return false;
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.every((item) => isJsonSafe(item, seen));
    }

    if (!isPlainJsonObject(value)) return false;

    return Object.values(value).every(
      (item) => item !== undefined && isJsonSafe(item, seen),
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
      message: "Payload accountId does not match the active account.",
    });
  }

  const requiresSchool =
    SCHOOL_REQUIRED_TABLES.has(tableName) ||
    BRANCH_REQUIRED_TABLES.has(tableName);

  if (requiresSchool && !validPositiveNumber(payload.schoolId)) {
    issues.push({
      code: "MISSING_SCHOOL_ID",
      field: "payload.schoolId",
      message: `${tableName} requires a valid schoolId.`,
    });
  }

  if (
    BRANCH_REQUIRED_TABLES.has(tableName) &&
    !validPositiveNumber(payload.branchId)
  ) {
    issues.push({
      code: "MISSING_BRANCH_ID",
      field: "payload.branchId",
      message: `${tableName} requires a valid branchId.`,
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
  const tableName = cleanString(record?.tableName);
  const accountId = cleanString(record?.accountId);

  if (!tableName || !isPushSyncTable(tableName)) {
    issues.push({
      code: "TABLE_NOT_PUSHABLE",
      field: "tableName",
      message: `${tableName || "Unknown table"} is not browser-pushable.`,
    });
  }

  if (!accountId) {
    issues.push({
      code: "MISSING_ACCOUNT_ID",
      field: "accountId",
      message: "The synchronization record has no accountId.",
    });
  } else if (accountId !== activeAccountId) {
    issues.push({
      code: "ACCOUNT_MISMATCH",
      field: "accountId",
      message: "The synchronization record belongs to another account.",
    });
  }

  if (!validPositiveNumber(record?.localId)) {
    issues.push({
      code: "INVALID_LOCAL_ID",
      field: "localId",
      message: "The synchronization record has no valid local ID.",
    });
  }

  if (!validPositiveNumber(record?.version)) {
    issues.push({
      code: "INVALID_VERSION",
      field: "version",
      message: "The synchronization version must be a positive number.",
    });
  }

  if (!validTimestamp(record?.updatedAt)) {
    issues.push({
      code: "INVALID_TIMESTAMP",
      field: "updatedAt",
      message: "The synchronization timestamp is missing or invalid.",
    });
  }

  if (!isPlainJsonObject(record?.payload) || !isJsonSafe(record.payload)) {
    issues.push({
      code: "INVALID_JSON_PAYLOAD",
      field: "payload",
      message: "The synchronization payload is not a valid JSON object.",
    });
  } else if (tableName && accountId) {
    issues.push(...tenantIssues(tableName, record.payload, activeAccountId));
  }

  return {
    ok: issues.length === 0,
    record: issues.length ? undefined : record,
    issues,
  };
}

export function validatePullRecord(
  input: unknown,
  activeAccountId: string,
): SyncIntegrityResult<SyncPullRecord> {
  const issues: SyncIntegrityIssue[] = [];
  const record = input as SyncPullRecord;
  const tableName = cleanString(record?.tableName);
  const accountId = cleanString(record?.accountId);

  if (!tableName || !isPullSyncTable(tableName)) {
    issues.push({
      code: "TABLE_NOT_PULLABLE",
      field: "tableName",
      message: `${tableName || "Unknown table"} is not allowed in pull synchronization.`,
    });
  }

  if (!accountId || accountId !== activeAccountId) {
    issues.push({
      code: "ACCOUNT_MISMATCH",
      field: "accountId",
      message: "Pulled record accountId does not match the active account.",
    });
  }

  if (!validPositiveNumber(record?.version)) {
    issues.push({
      code: "INVALID_VERSION",
      field: "version",
      message: "Pulled record version is missing or invalid.",
    });
  }

  if (!validTimestamp(record?.updatedAt)) {
    issues.push({
      code: "INVALID_TIMESTAMP",
      field: "updatedAt",
      message: "Pulled record timestamp is missing or invalid.",
    });
  }

  if (!cleanString(record?.cloudId)) {
    issues.push({
      code: "MISSING_CLOUD_ID",
      field: "cloudId",
      message: "Pulled record has no stable cloud ID.",
    });
  }

  if (!isPlainJsonObject(record?.payload) || !isJsonSafe(record.payload)) {
    issues.push({
      code: "INVALID_JSON_PAYLOAD",
      field: "payload",
      message: "Pulled payload is not a valid JSON object.",
    });
  } else if (tableName && accountId) {
    issues.push(...tenantIssues(tableName, record.payload, activeAccountId));
  }

  return {
    ok: issues.length === 0,
    record: issues.length ? undefined : record,
    issues,
  };
}

export function integrityReason(issues: readonly SyncIntegrityIssue[]) {
  return issues
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join(" | ");
}

export async function quarantineSyncRecord(input: QuarantineInput) {
  const table = (db as any).syncQuarantine;

  if (!table) {
    console.error(
      "[sync-integrity] syncQuarantine table is unavailable",
      input,
    );
    return undefined;
  }

  return table.add({
    accountId: cleanString(input.accountId),
    tableName: cleanString(input.tableName) || "unknown",
    localId:
      validPositiveNumber(input.localId)
        ? Number(input.localId)
        : undefined,
    cloudId: cleanString(input.cloudId),
    reason: input.reason,
    payload: input.payload,
    source: input.source,
    quarantinedAt: Date.now(),
  });
}
