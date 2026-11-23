import type { SchoolArchive } from "./archive";
import { captureSchoolDatabase } from "./databaseSnapshot";
import { assertDriveSnapshotIsolation } from "./driveIsolation";

// Explicit school-data allowlist. Identity, license, sessions, credentials, billing
// and platform cache are never included in Google Drive school backups.
const SCHOOL_STORES = new Set([
  "schools", "branches", "academicStructures", "academicPeriods", "organizations",
  "students", "teachers", "parents", "studentParents", "classes", "subjects",
  "programs", "curriculums", "curriculumPathways", "curriculumSubjects",
  "classSubjects", "subjectPrerequisites", "studentCurriculums", "subjectOfferings",
  "assignments", "classTeachers", "studentEnrollments", "assessmentApplicabilities",
  "gradingSystems", "gradeRules", "assessmentStructures", "assessmentStructureItems",
  "assessmentComponents", "assessmentEntries", "computedResults", "attendance",
  "teacherAttendance", "reportCards", "reportCardItems", "studentReportSnapshots",
  "studentPromotions", "feeStructures", "payments", "income", "expenses",
  "currencies", "schoolCurrencySettings", "studentFeeInvoices",
  "studentFeeInvoiceItems", "studentFeePayments", "staffPayrollProfiles",
  "payrollRuns", "payrollItems", "staffPaymentRecords", "announcements",
  "announcementRecipients", "messageThreads", "messages", "communicationLogs",
  "notificationTemplates", "schoolBranchSettings", "calendarEvents",
  "calendarEventParticipants", "calendarEventReminders", "calendarEventResponses",
  "scheduleTimetables", "scheduleSessions", "scheduleResources", "scheduleConflicts",
  "mediaAssets", "mediaBlobs"
]);

/**
 * A deliberately conservative export: a school record MUST carry the verified
 * accountId. Rows without one cannot be safely attributed to a tenant and
 * block the backup rather than being silently lost or leaked.
 *
 * This is NOT a restore implementation and is NOT live multi-device sync.
 */
export async function captureAccountScopedSchoolBackup(
  databaseName: string,
  verifiedAccountId: string
): Promise<SchoolArchive> {
  if (!verifiedAccountId || !/^[\w.:-]{1,160}$/.test(verifiedAccountId)) {
    throw new Error("A verified account identity is required before backup.");
  }
  const source = await captureSchoolDatabase(databaseName, verifiedAccountId);
  const schoolTables = source.tables.filter(table => SCHOOL_STORES.has(table.name));
  if (!schoolTables.length) throw new Error("No recognized school-data stores exist in this database.");
  const excludedPopulated = source.tables.filter(t => !SCHOOL_STORES.has(t.name) && t.rows.length > 0).map(t => t.name);
  const snapshot: SchoolArchive = {
    ...source,
    tables: schoolTables,
    notes: [
      "Account-bound school-data-only encrypted backup; platform and identity stores excluded",
      "Not a full IndexedDB backup; excluded populated stores: " + (excludedPopulated.join(", ") || "none"),
      "Restore not supported by this drop-in; external server-only media not included"
    ]
  };
  assertDriveSnapshotIsolation(snapshot, verifiedAccountId);
  const recordCount = schoolTables.reduce((n, t) => n + t.rows.length, 0);
  if (!recordCount) throw new Error("No account-bound school records available to back up.");
  return snapshot;
}
