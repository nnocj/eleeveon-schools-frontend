/**
 * app/lib/excel/attendance/attendanceExcelImporter.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ATTENDANCE OFFLINE-FIRST IMPORTER
 * --------------------------------------------------------------------------
 *
 * Writes validated attendance data into the existing Eleeveon tables:
 *
 * Daily attendance
 *   -> attendance
 *
 * Term totals
 *   -> studentAttendanceSummaries
 *
 * IMPORTANT:
 * - no direct backend HTTP calls;
 * - use createLocal/updateLocal;
 * - existing records are updated rather than duplicated;
 * - daily identity:
 *     studentId + classId + structureId + periodId + date
 * - term identity:
 *     studentId + classId + structureId + periodId
 */

import {
  db,
} from "../../db/db";

import {
  createLocal,
  updateLocal,
} from "../../sync/syncUtils";

import type {
  ExcelValidationIssue,
} from "../excelTypes";

import type {
  AttendanceExcelDailyValidationResult,
  AttendanceExcelEnrollmentReference,
  AttendanceExcelExistingDaily,
  AttendanceExcelExistingTermSummary,
  AttendanceExcelImportContext,
  AttendanceExcelImportResult,
  AttendanceExcelImportRowResult,
  AttendanceExcelStudentReference,
  AttendanceExcelTermValidationResult,
} from "./attendanceExcelTypes";

// ======================================================
// HELPERS
// ======================================================

function idOf(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const result =
    String(value).trim();

  if (
    !result ||
    result === "0" ||
    result === "null" ||
    result === "undefined"
  ) {
    return "";
  }

  return result;
}

function sameId(
  left: unknown,
  right: unknown,
) {
  return (
    idOf(left) ===
    idOf(right)
  );
}

function text(
  value: unknown,
) {
  return String(
    value ?? "",
  ).trim();
}

function importError(
  rowNumber: number,
  message: string,
): ExcelValidationIssue {
  return {
    code:
      "attendance.import_failed",

    message,

    severity:
      "error",

    rowNumber,
  };
}

// ======================================================
// REFERENCE DATA
// ======================================================

export async function getAttendanceExcelReferenceData(
  context: AttendanceExcelImportContext,
): Promise<{
  students: AttendanceExcelStudentReference[];

  enrollments: AttendanceExcelEnrollmentReference[];

  dailyAttendance: AttendanceExcelExistingDaily[];

  termSummaries: AttendanceExcelExistingTermSummary[];
}> {
  const [
    studentRows,
    enrollmentRows,
    attendanceRows,
    summaryRows,
  ] = await Promise.all([
    db.students.toArray(),

    db.studentEnrollments.toArray(),

    db.attendance.toArray(),

    db.studentAttendanceSummaries.toArray(),
  ]);

  const students:
    AttendanceExcelStudentReference[] =
    studentRows
      .filter(
        (row: any) =>
          !row.isDeleted &&
          row.active !== false &&
          sameId(
            row.accountId,
            context.accountId,
          ) &&
          sameId(
            row.schoolId,
            context.schoolId,
          ) &&
          sameId(
            row.branchId,
            context.branchId,
          ),
      )
      .map(
        (row: any) => ({
          id:
            idOf(row.id),

          fullName:
            row.fullName,

          admissionNumber:
            row.admissionNumber,

          currentClassId:
            idOf(
              row.currentClassId,
            ) || undefined,

          active:
            row.active,

          isDeleted:
            row.isDeleted,
        }),
      );

  const enrollments:
    AttendanceExcelEnrollmentReference[] =
    enrollmentRows
      .filter(
        (row: any) =>
          !row.isDeleted &&
          sameId(
            row.accountId,
            context.accountId,
          ) &&
          sameId(
            row.schoolId,
            context.schoolId,
          ) &&
          sameId(
            row.branchId,
            context.branchId,
          ),
      )
      .map(
        (row: any) => ({
          id:
            idOf(row.id),

          studentId:
            idOf(
              row.studentId,
            ),

          classId:
            idOf(
              row.classId,
            ),

          academicStructureId:
            idOf(
              row.academicStructureId,
            ),

          academicPeriodId:
            idOf(
              row.academicPeriodId,
            ) || undefined,

          status:
            row.status,

          isDeleted:
            row.isDeleted,
        }),
      );

  const dailyAttendance:
    AttendanceExcelExistingDaily[] =
    attendanceRows
      .filter(
        (row: any) =>
          !row.isDeleted &&
          sameId(
            row.accountId,
            context.accountId,
          ) &&
          sameId(
            row.schoolId,
            context.schoolId,
          ) &&
          sameId(
            row.branchId,
            context.branchId,
          ) &&
          sameId(
            row.classId,
            context.classId,
          ) &&
          sameId(
            row.academicStructureId,
            context.academicStructureId,
          ) &&
          sameId(
            row.academicPeriodId,
            context.academicPeriodId,
          ),
      )
      .map(
        (row: any) => ({
          id:
            idOf(row.id),

          studentId:
            idOf(
              row.studentId,
            ),

          classId:
            idOf(
              row.classId,
            ),

          academicStructureId:
            idOf(
              row.academicStructureId,
            ),

          academicPeriodId:
            idOf(
              row.academicPeriodId,
            ),

          date:
            text(row.date),

          status:
            row.status,

          isDeleted:
            row.isDeleted,
        }),
      );

  const termSummaries:
    AttendanceExcelExistingTermSummary[] =
    summaryRows
      .filter(
        (row: any) =>
          !row.isDeleted &&
          sameId(
            row.accountId,
            context.accountId,
          ) &&
          sameId(
            row.schoolId,
            context.schoolId,
          ) &&
          sameId(
            row.branchId,
            context.branchId,
          ) &&
          sameId(
            row.classId,
            context.classId,
          ) &&
          sameId(
            row.academicStructureId,
            context.academicStructureId,
          ) &&
          sameId(
            row.academicPeriodId,
            context.academicPeriodId,
          ),
      )
      .map(
        (row: any) => ({
          id:
            idOf(row.id),

          studentId:
            idOf(
              row.studentId,
            ),

          classId:
            idOf(
              row.classId,
            ),

          academicStructureId:
            idOf(
              row.academicStructureId,
            ),

          academicPeriodId:
            idOf(
              row.academicPeriodId,
            ),

          daysOpened:
            row.daysOpened,

          daysPresent:
            row.daysPresent,

          daysAbsent:
            row.daysAbsent,

          timesLate:
            row.timesLate,

          attendancePercent:
            row.attendancePercent,

          isDeleted:
            row.isDeleted,
        }),
      );

  return {
    students,
    enrollments,
    dailyAttendance,
    termSummaries,
  };
}

// ======================================================
// DAILY LOOKUP
// ======================================================

function findExistingDaily(
  rows: AttendanceExcelExistingDaily[],
  args: {
    studentId: string;
    date: string;
    context: AttendanceExcelImportContext;
  },
) {
  return rows.find(
    (row) =>
      !row.isDeleted &&
      sameId(
        row.studentId,
        args.studentId,
      ) &&
      sameId(
        row.classId,
        args.context.classId,
      ) &&
      sameId(
        row.academicStructureId,
        args.context
          .academicStructureId,
      ) &&
      sameId(
        row.academicPeriodId,
        args.context
          .academicPeriodId,
      ) &&
      text(
        row.date,
      ) === args.date,
  );
}

// ======================================================
// TERM LOOKUP
// ======================================================

function findExistingTermSummary(
  rows: AttendanceExcelExistingTermSummary[],
  args: {
    studentId: string;
    context: AttendanceExcelImportContext;
  },
) {
  return rows.find(
    (row) =>
      !row.isDeleted &&
      sameId(
        row.studentId,
        args.studentId,
      ) &&
      sameId(
        row.classId,
        args.context.classId,
      ) &&
      sameId(
        row.academicStructureId,
        args.context
          .academicStructureId,
      ) &&
      sameId(
        row.academicPeriodId,
        args.context
          .academicPeriodId,
      ),
  );
}

// ======================================================
// DAILY IMPORT
// ======================================================

export async function importDailyAttendance(
  validation: AttendanceExcelDailyValidationResult,
  context: AttendanceExcelImportContext,
  existingRows?: AttendanceExcelExistingDaily[],
): Promise<AttendanceExcelImportResult> {
  const attendanceRows =
    existingRows ||
    (
      await getAttendanceExcelReferenceData(
        context,
      )
    ).dailyAttendance;

  const results:
    AttendanceExcelImportRowResult[] =
    [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (
    const row of
    validation.rows
  ) {
    if (!row.valid) {
      skipped += 1;

      results.push({
        rowNumber:
          row.rowNumber,

        action:
          "skipped",

        studentId:
          row.data.studentId,

        studentName:
          row.data.studentName,

        date:
          row.data.date,

        issues:
          row.issues,
      });

      continue;
    }

    try {
      const existing =
        findExistingDaily(
          attendanceRows,
          {
            studentId:
              row.data.studentId,

            date:
              row.data.date,

            context,
          },
        );

      const payload = {
        accountId:
          context.accountId,

        schoolId:
          context.schoolId,

        branchId:
          context.branchId,

        studentId:
          row.data.studentId,

        classId:
          context.classId,

        academicStructureId:
          context.academicStructureId,

        academicPeriodId:
          context.academicPeriodId,

        date:
          row.data.date,

        status:
          row.data.status,

        isDeleted:
          false,
      };

      if (existing) {
        await updateLocal(
          "attendance",
          existing.id,
          payload as any,
        );

        existing.status =
          row.data.status;

        updated += 1;

        results.push({
          rowNumber:
            row.rowNumber,

          action:
            "updated",

          studentId:
            row.data.studentId,

          studentName:
            row.data.studentName,

          date:
            row.data.date,

          recordId:
            existing.id,

          issues:
            row.issues,
        });

        continue;
      }

      const createdRecord =
        await createLocal(
          "attendance",
          payload as any,
        );

      const possibleId =
        typeof createdRecord ===
        "string"
          ? createdRecord
          : (
              createdRecord as any
            )?.id;

      attendanceRows.push({
        id:
          idOf(possibleId) ||
          `pending:${row.data.studentId}:${row.data.date}`,

        studentId:
          row.data.studentId,

        classId:
          context.classId,

        academicStructureId:
          context.academicStructureId,

        academicPeriodId:
          context.academicPeriodId,

        date:
          row.data.date,

        status:
          row.data.status,

        isDeleted:
          false,
      });

      created += 1;

      results.push({
        rowNumber:
          row.rowNumber,

        action:
          "created",

        studentId:
          row.data.studentId,

        studentName:
          row.data.studentName,

        date:
          row.data.date,

        recordId:
          idOf(
            possibleId,
          ) || undefined,

        issues:
          row.issues,
      });
    } catch (error) {
      failed += 1;

      const message =
        error instanceof Error
          ? error.message
          : "Failed to import attendance.";

      results.push({
        rowNumber:
          row.rowNumber,

        action:
          "failed",

        studentId:
          row.data.studentId,

        studentName:
          row.data.studentName,

        date:
          row.data.date,

        issues: [
          ...row.issues,
          importError(
            row.rowNumber,
            message,
          ),
        ],

        error:
          message,
      });
    }
  }

  return {
    mode:
      "daily",

    totalRows:
      validation.rows.length,

    created,
    updated,
    skipped,
    failed,

    rows:
      results,
  };
}

// ======================================================
// TERM TOTAL IMPORT
// ======================================================

export async function importTermAttendance(
  validation: AttendanceExcelTermValidationResult,
  context: AttendanceExcelImportContext,
  existingRows?: AttendanceExcelExistingTermSummary[],
): Promise<AttendanceExcelImportResult> {
  const summaryRows =
    existingRows ||
    (
      await getAttendanceExcelReferenceData(
        context,
      )
    ).termSummaries;

  const results:
    AttendanceExcelImportRowResult[] =
    [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (
    const row of
    validation.rows
  ) {
    if (!row.valid) {
      skipped += 1;

      results.push({
        rowNumber:
          row.rowNumber,

        action:
          "skipped",

        studentId:
          row.data.studentId,

        studentName:
          row.data.studentName,

        issues:
          row.issues,
      });

      continue;
    }

    try {
      const existing =
        findExistingTermSummary(
          summaryRows,
          {
            studentId:
              row.data.studentId,

            context,
          },
        );

      /**
       * This payload deliberately matches the existing
       * StudentAttendance.tsx term-total save shape.
       */
      const payload = {
        accountId:
          context.accountId,

        schoolId:
          context.schoolId,

        branchId:
          context.branchId,

        studentId:
          row.data.studentId,

        classId:
          context.classId,

        academicStructureId:
          context.academicStructureId,

        academicPeriodId:
          context.academicPeriodId,

        entryMode:
          "manual",

        daysOpened:
          row.data.daysOpened,

        daysPresent:
          row.data.daysPresent,

        daysAbsent:
          row.data.daysAbsent,

        timesLate:
          row.data.timesLate,

        attendancePercent:
          row.data
            .attendancePercent,

        active: true,

        isDeleted:
          false,
      };

      if (existing) {
        await updateLocal(
          "studentAttendanceSummaries",
          existing.id,
          payload as any,
        );

        existing.daysOpened =
          row.data.daysOpened;

        existing.daysPresent =
          row.data.daysPresent;

        existing.daysAbsent =
          row.data.daysAbsent;

        existing.timesLate =
          row.data.timesLate;

        existing.attendancePercent =
          row.data
            .attendancePercent;

        updated += 1;

        results.push({
          rowNumber:
            row.rowNumber,

          action:
            "updated",

          studentId:
            row.data.studentId,

          studentName:
            row.data.studentName,

          recordId:
            existing.id,

          issues:
            row.issues,
        });

        continue;
      }

      const createdRecord =
        await createLocal(
          "studentAttendanceSummaries",
          payload as any,
        );

      const possibleId =
        typeof createdRecord ===
        "string"
          ? createdRecord
          : (
              createdRecord as any
            )?.id;

      summaryRows.push({
        id:
          idOf(possibleId) ||
          `pending:${row.data.studentId}`,

        studentId:
          row.data.studentId,

        classId:
          context.classId,

        academicStructureId:
          context.academicStructureId,

        academicPeriodId:
          context.academicPeriodId,

        daysOpened:
          row.data.daysOpened,

        daysPresent:
          row.data.daysPresent,

        daysAbsent:
          row.data.daysAbsent,

        timesLate:
          row.data.timesLate,

        attendancePercent:
          row.data
            .attendancePercent,

        isDeleted:
          false,
      });

      created += 1;

      results.push({
        rowNumber:
          row.rowNumber,

        action:
          "created",

        studentId:
          row.data.studentId,

        studentName:
          row.data.studentName,

        recordId:
          idOf(
            possibleId,
          ) || undefined,

        issues:
          row.issues,
      });
    } catch (error) {
      failed += 1;

      const message =
        error instanceof Error
          ? error.message
          : "Failed to import term attendance.";

      results.push({
        rowNumber:
          row.rowNumber,

        action:
          "failed",

        studentId:
          row.data.studentId,

        studentName:
          row.data.studentName,

        issues: [
          ...row.issues,

          importError(
            row.rowNumber,
            message,
          ),
        ],

        error:
          message,
      });
    }
  }

  return {
    mode:
      "termTotals",

    totalRows:
      validation.rows.length,

    created,
    updated,
    skipped,
    failed,

    rows:
      results,
  };
}