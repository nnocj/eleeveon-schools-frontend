/**
 * app/lib/excel/attendance/attendanceExcelValidator.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ATTENDANCE VALIDATION
 * --------------------------------------------------------------------------
 *
 * Responsibilities:
 * - student matching;
 * - daily status/date validation;
 * - term-total normalization;
 * - duplicate detection;
 * - class enrollment validation;
 * - preview-ready row preparation.
 *
 * No database mutations happen here.
 */

import type {
  ExcelSourceRecord,
  ExcelValidationIssue,
} from "../excelTypes";

import type {
  AttendanceExcelDailyRecord,
  AttendanceExcelDailyValidationResult,
  AttendanceExcelEnrollmentReference,
  AttendanceExcelImportContext,
  AttendanceExcelNormalizedDailyRecord,
  AttendanceExcelNormalizedTermRecord,
  AttendanceExcelPreparedDailyRow,
  AttendanceExcelPreparedTermRow,
  AttendanceExcelStudentMatch,
  AttendanceExcelStudentReference,
  AttendanceExcelTermRecord,
  AttendanceExcelTermValidationResult,
} from "./attendanceExcelTypes";

import { normalizeSchoolDate } from "../excelDate";

import {
  normalizeAttendanceStatus,
} from "./attendanceExcelParser";

// ======================================================
// HELPERS
// ======================================================

function text(value: unknown) {
  return String(
    value ?? "",
  ).trim();
}

function normalizedText(
  value: unknown,
) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compactText(
  value: unknown,
) {
  return normalizedText(
    value,
  ).replace(
    /[^a-z0-9]/g,
    "",
  );
}

function sameId(
  a: unknown,
  b: unknown,
) {
  const left =
    text(a);

  const right =
    text(b);

  return (
    Boolean(left) &&
    Boolean(right) &&
    left === right
  );
}

function integer(
  value: unknown,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(number),
  );
}

function attendancePercent(
  present: number,
  opened: number,
) {
  if (
    opened <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (present / opened) *
          100,
      ),
    ),
  );
}

function blankSource():
  ExcelSourceRecord {
  return {};
}

// ======================================================
// ENROLLMENT
// ======================================================

function studentIsInContext(
  studentId: string,
  context: AttendanceExcelImportContext,
  enrollments: AttendanceExcelEnrollmentReference[],
  students: AttendanceExcelStudentReference[],
) {
  const activeEnrollment =
    enrollments.some(
      (row) =>
        !row.isDeleted &&
        normalizedText(
          row.status ||
            "active",
        ) === "active" &&
        sameId(
          row.studentId,
          studentId,
        ) &&
        sameId(
          row.classId,
          context.classId,
        ) &&
        sameId(
          row.academicStructureId,
          context.academicStructureId,
        ) &&
        (
          !row.academicPeriodId ||
          sameId(
            row.academicPeriodId,
            context.academicPeriodId,
          )
        ),
    );

  if (
    activeEnrollment
  ) {
    return true;
  }

  /**
   * Same fallback used by StudentAttendance.tsx:
   * student.currentClassId.
   */
  return students.some(
    (student) =>
      sameId(
        student.id,
        studentId,
      ) &&
      !student.isDeleted &&
      !["graduated", "transferred", "withdrawn"].includes(normalizedText((student as any).status)) &&
      sameId(
        student.currentClassId,
        context.classId,
      ),
  );
}

// ======================================================
// STUDENT MATCHING
// ======================================================

export function matchAttendanceStudent(
  record: {
    studentId?: string;
    admissionNumber?: string;
    studentName?: string;
  },
  students: AttendanceExcelStudentReference[],
): AttendanceExcelStudentMatch {
  const suppliedId =
    text(record.studentId);

  if (suppliedId) {
    const student =
      students.find(
        (candidate) =>
          !candidate.isDeleted &&
          sameId(
            candidate.id,
            suppliedId,
          ),
      );

    if (student) {
      const admission = compactText(record.admissionNumber);
      if (admission && compactText(student.admissionNumber) !== admission) {
        return { matched: false, reason: "none", issue: {
          code: "attendance.student_identity_conflict",
          message: "The admission number disagrees with the protected student ID.",
          severity: "error", targetKey: "admissionNumber",
        }};
      }
      if (record.studentName && normalizedText(student.fullName) !== normalizedText(record.studentName)) {
        return { matched: false, reason: "none", issue: {
          code: "attendance.student_name_conflict",
          message: "The student name disagrees with the protected student ID.",
          severity: "error", targetKey: "studentName",
        }};
      }
      return {
        matched: true,
        reason:
          "student-id",
        student,
      };
    }
  }

  // A supplied internal ID is authoritative. Never fall back to names if
  // it no longer identifies a student in this tenant.
  if (suppliedId) {
    return {
      matched: false,
      reason: "none",
      issue: {
        code: "attendance.student_id_not_found",
        message: "The protected Eleeveon student identifier does not match a student in this branch.",
        severity: "error",
        targetKey: "studentId",
      },
    };
  }

  const admissionNumber =
    compactText(
      record.admissionNumber,
    );

  if (admissionNumber) {
    const matches =
      students.filter(
        (candidate) =>
          !candidate.isDeleted &&
          compactText(
            candidate.admissionNumber,
          ) ===
            admissionNumber,
      );

    if (
      matches.length === 1
    ) {
      return {
        matched: true,
        reason:
          "admission-number",
        student:
          matches[0],
      };
    }

    if (
      matches.length > 1
    ) {
      return {
        matched: false,
        reason: "none",

        issue: {
          code:
            "attendance.ambiguous_admission_number",

          message:
            `Admission Number "${record.admissionNumber}" matches more than one student.`,

          severity: "error",

          targetKey:
            "admissionNumber",

          value:
            record.admissionNumber,
        },
      };
    }
  }

  const studentName =
    normalizedText(
      record.studentName,
    );

  if (studentName) {
    const matches =
      students.filter(
        (candidate) =>
          !candidate.isDeleted &&
          normalizedText(
            candidate.fullName,
          ) ===
            studentName,
      );

    if (
      matches.length === 1
    ) {
      return {
        matched: true,
        reason:
          "student-name",
        student:
          matches[0],
      };
    }

    if (
      matches.length > 1
    ) {
      return {
        matched: false,
        reason: "none",

        issue: {
          code:
            "attendance.ambiguous_student_name",

          message:
            `Student name "${record.studentName}" matches more than one student. Use Admission Number or Eleeveon Student ID.`,

          severity: "error",

          targetKey:
            "studentName",

          value:
            record.studentName,
        },
      };
    }
  }

  return {
    matched: false,
    reason: "none",

    issue: {
      code:
        "attendance.student_not_found",

      message:
        `Student "${record.studentName || record.admissionNumber || record.studentId || "Unknown"}" could not be matched.`,

      severity: "error",
    },
  };
}

// ======================================================
// DAILY VALIDATION
// ======================================================

export function validateDailyAttendanceImport(args: {
  records: AttendanceExcelDailyRecord[];

  rowNumbers: number[];

  context: AttendanceExcelImportContext;

  students: AttendanceExcelStudentReference[];

  enrollments?: AttendanceExcelEnrollmentReference[];

  statusAliases?: Record<
    string,
    "present" | "absent" | "late"
  >;
}): AttendanceExcelDailyValidationResult {
  const {
    records,
    rowNumbers,
    context,
    students,
    enrollments = [],
    statusAliases,
  } = args;

  const preparedRows:
    AttendanceExcelPreparedDailyRow[] =
    [];

  const identityMap =
    new Map<
      string,
      number[]
    >();

  records.forEach(
    (record, index) => {
      const rowNumber =
        rowNumbers[index] ??
        index + 2;

      const issues:
        ExcelValidationIssue[] =
        [];

      const match =
        matchAttendanceStudent(
          record,
          students,
        );

      if (match.issue) {
        issues.push({
          ...match.issue,
          rowNumber,
        });
      }

      const studentId =
        match.student?.id ||
        "";

      if (
        match.matched &&
        studentId &&
        !studentIsInContext(
          studentId,
          context,
          enrollments,
          students,
        )
      ) {
        issues.push({
          code:
            "attendance.student_not_in_class",

          message:
            "The matched student is not enrolled in the selected class/academic context.",

          severity:
            "error",

          rowNumber,

          targetKey:
            "studentName",

          value:
            record.studentName,
        });
      }

      const date =
        text(
          record.date ||
            context.date,
        );

      if (normalizeSchoolDate(date).status !== "valid") {
        issues.push({
          code:
            "attendance.invalid_date",

          message:
            "Attendance Date is required and must be a valid YYYY-MM-DD date.",

          severity:
            "error",

          rowNumber,

          targetKey: "date",

          value:
            record.date,
        });
      }

      const status =
        normalizeAttendanceStatus(
          record.status,
          statusAliases,
        );

      if (!status) {
        issues.push({
          code:
            "attendance.invalid_status",

          message:
            `Attendance status "${record.status || ""}" is invalid. Use Present, Absent or Late.`,

          severity:
            "error",

          rowNumber,

          targetKey:
            "status",

          value:
            record.status,
        });
      }

      const normalized:
        AttendanceExcelNormalizedDailyRecord =
        {
          studentId,

          admissionNumber:
            record.admissionNumber ||
            match.student
              ?.admissionNumber,

          studentName:
            match.student
              ?.fullName ||
            record.studentName ||
            "",

          date,

          status:
            status ||
            "present",
        };

      const prepared:
        AttendanceExcelPreparedDailyRow =
        {
          rowNumber,

          source:
            blankSource(),

          data:
            normalized,

          issues,

          valid:
            !issues.some(
              (issue) =>
                issue.severity ===
                "error",
            ),

          studentMatch:
            match,
        };

      preparedRows.push(
        prepared,
      );

      if (
        studentId &&
        date
      ) {
        const key =
          `${studentId}::${date}`;

        const rows =
          identityMap.get(key) ||
          [];

        rows.push(
          preparedRows.length - 1,
        );

        identityMap.set(
          key,
          rows,
        );
      }
    },
  );

  /**
   * Detect same student/date more than once in the imported file.
   */
  identityMap.forEach(
    (indexes) => {
      if (
        indexes.length < 2
      ) {
        return;
      }

      indexes.forEach(
        (index) => {
          const row =
            preparedRows[index];

          row.issues.push({
            code:
              "attendance.duplicate_daily_record",

            message:
              "This student/date appears more than once in the imported attendance file.",

            severity:
              "error",

            rowNumber:
              row.rowNumber,
          });

          row.valid = false;
        },
      );
    },
  );

  const issues =
    preparedRows.flatMap(
      (row) =>
        row.issues,
    );

  const invalidRows =
    preparedRows.filter(
      (row) =>
        !row.valid,
    ).length;

  const warningRows =
    preparedRows.filter(
      (row) =>
        row.issues.some(
          (issue) =>
            issue.severity ===
            "warning",
        ),
    ).length;

  return {
    valid:
      invalidRows === 0,

    totalRows:
      preparedRows.length,

    validRows:
      preparedRows.length -
      invalidRows,

    invalidRows,

    warningRows,

    rows:
      preparedRows,

    issues,
  };
}

// ======================================================
// TERM TOTAL VALIDATION
// ======================================================

export function validateTermAttendanceImport(args: {
  records: AttendanceExcelTermRecord[];

  rowNumbers: number[];

  context: AttendanceExcelImportContext;

  students: AttendanceExcelStudentReference[];

  enrollments?: AttendanceExcelEnrollmentReference[];
}): AttendanceExcelTermValidationResult {
  const {
    records,
    rowNumbers,
    context,
    students,
    enrollments = [],
  } = args;

  const preparedRows:
    AttendanceExcelPreparedTermRow[] =
    [];

  const studentMap =
    new Map<
      string,
      number[]
    >();

  records.forEach(
    (record, index) => {
      const rowNumber =
        rowNumbers[index] ??
        index + 2;

      const issues:
        ExcelValidationIssue[] =
        [];

      const match =
        matchAttendanceStudent(
          record,
          students,
        );

      if (match.issue) {
        issues.push({
          ...match.issue,
          rowNumber,
        });
      }

      const studentId =
        match.student?.id ||
        "";

      if (
        match.matched &&
        studentId &&
        !studentIsInContext(
          studentId,
          context,
          enrollments,
          students,
        )
      ) {
        issues.push({
          code:
            "attendance.student_not_in_class",

          message:
            "The matched student is not enrolled in the selected class/academic context.",

          severity:
            "error",

          rowNumber,
        });
      }

      const daysOpened =
        integer(
          record.daysOpened,
        );

      const daysPresent =
        integer(
          record.daysPresent,
        );

      const timesLate =
        integer(
          record.timesLate,
        );

      if (
        daysPresent >
        daysOpened
      ) {
        issues.push({
          code:
            "attendance.present_exceeds_opened",

          message:
            "Days Present cannot be greater than Days Opened.",

          severity:
            "error",

          rowNumber,

          targetKey:
            "daysPresent",

          value:
            record.daysPresent,
        });
      }

      const daysAbsent =
        Math.max(
          0,
          daysOpened -
            daysPresent,
        );

      /**
       * Do not trust spreadsheet calculations.
       * Recalculate using the same basic rule as StudentAttendance.tsx.
       */
      const percent =
        attendancePercent(
          daysPresent,
          daysOpened,
        );

      const normalized:
        AttendanceExcelNormalizedTermRecord =
        {
          studentId,

          admissionNumber:
            record.admissionNumber ||
            match.student
              ?.admissionNumber,

          studentName:
            match.student
              ?.fullName ||
            record.studentName ||
            "",

          daysOpened,

          daysPresent,

          daysAbsent,

          timesLate,

          attendancePercent:
            percent,
        };

      preparedRows.push({
        rowNumber,

        source:
          blankSource(),

        data:
          normalized,

        issues,

        valid:
          !issues.some(
            (issue) =>
              issue.severity ===
              "error",
          ),

        studentMatch:
          match,
      });

      if (studentId) {
        const list =
          studentMap.get(
            studentId,
          ) || [];

        list.push(
          preparedRows.length - 1,
        );

        studentMap.set(
          studentId,
          list,
        );
      }
    },
  );

  /**
   * One term summary per student/context.
   */
  studentMap.forEach(
    (indexes) => {
      if (
        indexes.length < 2
      ) {
        return;
      }

      indexes.forEach(
        (index) => {
          const row =
            preparedRows[index];

          row.issues.push({
            code:
              "attendance.duplicate_term_summary",

            message:
              "This student appears more than once in the term attendance file.",

            severity:
              "error",

            rowNumber:
              row.rowNumber,
          });

          row.valid = false;
        },
      );
    },
  );

  const issues =
    preparedRows.flatMap(
      (row) =>
        row.issues,
    );

  const invalidRows =
    preparedRows.filter(
      (row) =>
        !row.valid,
    ).length;

  const warningRows =
    preparedRows.filter(
      (row) =>
        row.issues.some(
          (issue) =>
            issue.severity ===
            "warning",
        ),
    ).length;

  return {
    valid:
      invalidRows === 0,

    totalRows:
      preparedRows.length,

    validRows:
      preparedRows.length -
      invalidRows,

    invalidRows,

    warningRows,

    rows:
      preparedRows,

    issues,
  };
}
