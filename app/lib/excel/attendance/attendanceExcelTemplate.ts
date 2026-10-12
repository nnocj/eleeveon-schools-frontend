/**
 * app/lib/excel/attendance/attendanceExcelTemplate.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ATTENDANCE TEMPLATE GENERATOR
 * --------------------------------------------------------------------------
 *
 * Generates controlled Eleeveon attendance workbooks.
 *
 * Supported templates:
 *
 * 1. Daily long format
 *    Student ID | Admission Number | Student Name | Date | Status
 *
 * 2. Daily register/grid
 *    Student ID | Admission Number | Student Name | Date1 | Date2 | ...
 *
 * 3. Term totals
 *    Student ID | Admission Number | Student Name |
 *    Days Opened | Days Present | Times Late |
 *    Days Absent | Attendance %
 *
 * IMPORTANT:
 * Days Absent and Attendance % remain derived by Eleeveon during import.
 */

import type {
  ExcelExportColumn,
  ExcelExportWorkbook,
} from "../excelTypes";

import {
  downloadExcelWorkbook,
} from "../excelWorkbook";

import type {
  AttendanceExcelTemplateContext,
  AttendanceExcelTemplateStudent,
} from "./attendanceExcelTypes";

// ======================================================
// HELPERS
// ======================================================

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeFilePart(value: unknown) {
  return safeText(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function metadataRows(
  context: AttendanceExcelTemplateContext,
  templateKind: string,
) {
  const rows: Array<
    Array<string | number | boolean | Date | null | undefined>
  > = [
    ["ELEEVEON ATTENDANCE TEMPLATE"],
    ["Template Type", templateKind],
    ["Template Version", "1"],
  ];

  if (context.schoolName) {
    rows.push([
      "School",
      context.schoolName,
    ]);
  }

  if (context.branchName) {
    rows.push([
      "Branch",
      context.branchName,
    ]);
  }

  if (context.className) {
    rows.push([
      "Class",
      context.className,
    ]);
  }

  if (context.academicStructureName) {
    rows.push([
      "Academic Structure",
      context.academicStructureName,
    ]);
  }

  if (context.academicPeriodName) {
    rows.push([
      "Academic Period",
      context.academicPeriodName,
    ]);
  }

  if (context.accountId) {
    rows.push([
      "Eleeveon Account ID",
      context.accountId,
    ]);
  }

  if (context.schoolId) {
    rows.push([
      "Eleeveon School ID",
      context.schoolId,
    ]);
  }

  if (context.branchId) {
    rows.push([
      "Eleeveon Branch ID",
      context.branchId,
    ]);
  }

  if (context.classId) {
    rows.push([
      "Eleeveon Class ID",
      context.classId,
    ]);
  }

  if (context.academicStructureId) {
    rows.push([
      "Eleeveon Academic Structure ID",
      context.academicStructureId,
    ]);
  }

  if (context.academicPeriodId) {
    rows.push([
      "Eleeveon Academic Period ID",
      context.academicPeriodId,
    ]);
  }

  return rows;
}

function baseFileName(
  context: AttendanceExcelTemplateContext,
  suffix: string,
) {
  const parts = [
    "Eleeveon Attendance",
    context.schoolName,
    context.className,
    suffix,
  ]
    .map(safeFilePart)
    .filter(Boolean);

  return `${parts.join(" - ")}.xlsx`;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateRange(
  startDate: string,
  endDate: string,
) {
  const start = new Date(
    `${startDate}T00:00:00`,
  );

  const end = new Date(
    `${endDate}T00:00:00`,
  );

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() < start.getTime()
  ) {
    throw new Error(
      "Invalid attendance date range.",
    );
  }

  const dates: string[] = [];

  const current = new Date(start);

  while (
    current.getTime() <= end.getTime()
  ) {
    dates.push(isoDate(current));

    current.setDate(
      current.getDate() + 1,
    );
  }

  return dates;
}

// ======================================================
// DAILY LONG TEMPLATE
// ======================================================

interface DailyLongTemplateRow {
  studentId: string;
  admissionNumber: string;
  studentName: string;
  date: string;
  status: string;
}

export function buildDailyAttendanceTemplate(args: {
  context: AttendanceExcelTemplateContext;

  students: AttendanceExcelTemplateStudent[];

  date: string;

  fileName?: string;
}): ExcelExportWorkbook {
  const {
    context,
    students,
    date,
  } = args;

  const rows: DailyLongTemplateRow[] =
    students.map((student) => ({
      studentId: student.id,

      admissionNumber:
        student.admissionNumber || "",

      studentName:
        student.fullName,

      date,

      status: "",
    }));

  return {
    fileName:
      args.fileName ||
      baseFileName(
        context,
        date,
      ),

    sheets: [
      {
        name: "Attendance",

        preambleRows: [
          ...metadataRows(
            context,
            "daily-long",
          ),

          ["Attendance Date", date],

          [
            "Instructions",
            "Enter Present, Absent or Late in the Status column. P, A and L are also accepted.",
          ],
        ],

        preambleSpacing: 1,

        freezeHeader: true,

        columns: [
          {
            key: "studentId",
            header: "Eleeveon Student ID",
            width: 24,
          },
          {
            key: "admissionNumber",
            header: "Admission Number",
            width: 18,
          },
          {
            key: "studentName",
            header: "Student Name",
            width: 28,
          },
          {
            key: "date",
            header: "Date",
            width: 14,
          },
          {
            key: "status",
            header: "Status",
            width: 14,
          },
        ],

        rows,
      },
    ],
  };
}

// ======================================================
// DAILY GRID TEMPLATE
// ======================================================

type DailyGridRow =
  Record<string, string>;

export function buildAttendanceRegisterTemplate(args: {
  context: AttendanceExcelTemplateContext;

  students: AttendanceExcelTemplateStudent[];

  startDate: string;
  endDate: string;

  fileName?: string;
}): ExcelExportWorkbook {
  const {
    context,
    students,
    startDate,
    endDate,
  } = args;

  const dates =
    dateRange(
      startDate,
      endDate,
    );

  const columns: ExcelExportColumn<DailyGridRow>[] =
    [
      {
        key: "studentId",
        header: "Eleeveon Student ID",
        width: 24,
      },
      {
        key: "admissionNumber",
        header: "Admission Number",
        width: 18,
      },
      {
        key: "studentName",
        header: "Student Name",
        width: 28,
      },

      ...dates.map((date) => ({
        key: date,
        header: date,
        width: 12,
      })),
    ];

  const rows: DailyGridRow[] =
    students.map((student) => {
      const row: DailyGridRow = {
        studentId:
          student.id,

        admissionNumber:
          student.admissionNumber || "",

        studentName:
          student.fullName,
      };

      dates.forEach((date) => {
        row[date] = "";
      });

      return row;
    });

  return {
    fileName:
      args.fileName ||
      baseFileName(
        context,
        `${startDate} to ${endDate}`,
      ),

    sheets: [
      {
        name: "Register",

        preambleRows: [
          ...metadataRows(
            context,
            "daily-grid",
          ),

          ["Start Date", startDate],
          ["End Date", endDate],

          [
            "Instructions",
            "Enter P, A or L under each date. Blank cells are ignored during import.",
          ],
        ],

        preambleSpacing: 1,

        freezeHeader: true,

        columns,

        rows,
      },
    ],
  };
}

// ======================================================
// TERM TOTALS TEMPLATE
// ======================================================

interface TermTemplateRow {
  studentId: string;
  admissionNumber: string;
  studentName: string;

  daysOpened: string;
  daysPresent: string;
  timesLate: string;

  daysAbsent: string;
  attendancePercent: string;
}

export function buildTermAttendanceTemplate(args: {
  context: AttendanceExcelTemplateContext;

  students: AttendanceExcelTemplateStudent[];

  fileName?: string;
}): ExcelExportWorkbook {
  const {
    context,
    students,
  } = args;

  const rows: TermTemplateRow[] =
    students.map((student) => ({
      studentId: student.id,

      admissionNumber:
        student.admissionNumber || "",

      studentName:
        student.fullName,

      daysOpened: "",
      daysPresent: "",
      timesLate: "",

      /**
       * These columns are included so the exported workbook is easy
       * for schools to understand, but import recalculates them.
       */
      daysAbsent: "",
      attendancePercent: "",
    }));

  return {
    fileName:
      args.fileName ||
      baseFileName(
        context,
        "Term Totals",
      ),

    sheets: [
      {
        name: "Term Attendance",

        preambleRows: [
          ...metadataRows(
            context,
            "term-totals",
          ),

          [
            "Instructions",
            "Enter Days Opened, Days Present and Times Late. Eleeveon recalculates Days Absent and Attendance % during import.",
          ],
        ],

        preambleSpacing: 1,

        freezeHeader: true,

        columns: [
          {
            key: "studentId",
            header: "Eleeveon Student ID",
            width: 24,
          },
          {
            key: "admissionNumber",
            header: "Admission Number",
            width: 18,
          },
          {
            key: "studentName",
            header: "Student Name",
            width: 28,
          },
          {
            key: "daysOpened",
            header: "Days Opened",
            width: 14,
          },
          {
            key: "daysPresent",
            header: "Days Present",
            width: 14,
          },
          {
            key: "timesLate",
            header: "Times Late",
            width: 12,
          },
          {
            key: "daysAbsent",
            header: "Days Absent",
            width: 14,
          },
          {
            key: "attendancePercent",
            header: "Attendance %",
            width: 16,
          },
        ],

        rows,
      },
    ],
  };
}

// ======================================================
// DOWNLOAD HELPERS
// ======================================================

export function downloadDailyAttendanceTemplate(
  args: Parameters<
    typeof buildDailyAttendanceTemplate
  >[0],
) {
  return downloadExcelWorkbook(
    buildDailyAttendanceTemplate(args),
  );
}

export function downloadAttendanceRegisterTemplate(
  args: Parameters<
    typeof buildAttendanceRegisterTemplate
  >[0],
) {
  return downloadExcelWorkbook(
    buildAttendanceRegisterTemplate(args),
  );
}

export function downloadTermAttendanceTemplate(
  args: Parameters<
    typeof buildTermAttendanceTemplate
  >[0],
) {
  return downloadExcelWorkbook(
    buildTermAttendanceTemplate(args),
  );
}