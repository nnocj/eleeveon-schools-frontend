/**
 * app/lib/excel/attendance/attendanceExcelParser.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ATTENDANCE PARSER
 * --------------------------------------------------------------------------
 *
 * Supports:
 * - daily long-format attendance;
 * - daily grid/register attendance;
 * - term-total attendance;
 * - configurable mappings for external spreadsheets.
 *
 * No database writes happen here.
 */

import type {
  ExcelColumnMapping,
  ExcelFieldDefinition,
  ExcelParsedSheet,
  ExcelSourceColumn,
  ExcelSourceRecord,
} from "../excelTypes";

import {
  autoMapExcelColumns,
} from "../excelColumnMapper";

import {
  detectLikelyHeaderRow,
  sheetToRecords,
} from "../excelWorkbook";

import {
  normalizeExcelHeader,
  toExcelInteger,
} from "../excelUtils";

import { normalizeSchoolDate } from "../excelDate";

import type {
  AttendanceExcelDailyLayout,
  AttendanceExcelDailyRecord,
  AttendanceExcelParsedDailyImport,
  AttendanceExcelParsedTermImport,
  AttendanceExcelStatus,
  AttendanceExcelTermRecord,
} from "./attendanceExcelTypes";

// ======================================================
// FIELD DEFINITIONS
// ======================================================

export const ATTENDANCE_DAILY_FIELDS: ExcelFieldDefinition[] =
  [
    {
      key: "studentId",
      label: "Eleeveon Student ID",

      aliases: [
        "eleeveon student id",
        "student id",
        "student uuid",
        "learner id",
      ],

      dataType: "id",
    },

    {
      key: "admissionNumber",
      label: "Admission Number",

      aliases: [
        "admission number",
        "admission no",
        "admission no.",
        "index number",
        "index no",
        "student number",
        "student no",
      ],

      dataType: "string",
    },

    {
      key: "studentName",
      label: "Student Name",

      aliases: [
        "student",
        "student name",
        "full name",
        "name",
        "learner",
        "learner name",
        "pupil",
        "pupil name",
      ],

      dataType: "string",
    },

    {
      key: "date",
      label: "Date",

      aliases: [
        "date",
        "attendance date",
        "day",
      ],

      dataType: "date",
    },

    {
      key: "status",
      label: "Status",

      aliases: [
        "status",
        "attendance",
        "attendance status",
        "present absent",
      ],

      dataType: "string",
    },
  ];

export const ATTENDANCE_TERM_FIELDS: ExcelFieldDefinition[] =
  [
    {
      key: "studentId",
      label: "Eleeveon Student ID",

      aliases: [
        "eleeveon student id",
        "student id",
        "student uuid",
        "learner id",
      ],

      dataType: "id",
    },

    {
      key: "admissionNumber",
      label: "Admission Number",

      aliases: [
        "admission number",
        "admission no",
        "admission no.",
        "index number",
        "index no",
        "student number",
        "student no",
      ],

      dataType: "string",
    },

    {
      key: "studentName",
      label: "Student Name",

      aliases: [
        "student",
        "student name",
        "full name",
        "name",
        "learner",
        "learner name",
        "pupil",
        "pupil name",
      ],

      dataType: "string",
    },

    {
      key: "daysOpened",
      label: "Days Opened",

      aliases: [
        "days opened",
        "school days",
        "days school opened",
        "total days",
        "attendance days",
      ],

      dataType: "integer",
    },

    {
      key: "daysPresent",
      label: "Days Present",

      aliases: [
        "days present",
        "present days",
        "present",
      ],

      dataType: "integer",
    },

    {
      key: "daysAbsent",
      label: "Days Absent",

      aliases: [
        "days absent",
        "absent days",
        "absent",
      ],

      dataType: "integer",
    },

    {
      key: "timesLate",
      label: "Times Late",

      aliases: [
        "times late",
        "late",
        "late days",
        "days late",
      ],

      dataType: "integer",
    },

    {
      key: "attendancePercent",
      label: "Attendance %",

      aliases: [
        "attendance percent",
        "attendance percentage",
        "attendance %",
        "percentage",
        "percent",
      ],

      dataType: "number",
    },
  ];

// ======================================================
// STATUS NORMALIZATION
// ======================================================

export function normalizeAttendanceStatus(
  value: unknown,
  aliases?: Record<
    string,
    AttendanceExcelStatus
  >,
): AttendanceExcelStatus | undefined {
  const normalized =
    normalizeExcelHeader(value);

  if (!normalized) {
    return undefined;
  }

  const defaultAliases: Record<
    string,
    AttendanceExcelStatus
  > = {
    p: "present",
    present: "present",
    yes: "present",

    a: "absent",
    absent: "absent",
    no: "absent",

    l: "late",
    late: "late",
    tardy: "late",
  };

  return (
    aliases?.[normalized] ||
    defaultAliases[normalized]
  );
}

// ======================================================
// COMMON HELPERS
// ======================================================

function text(value: unknown) {
  return String(
    value ?? "",
  ).trim();
}

function mappingValue(
  source: ExcelSourceRecord,
  mappings: ExcelColumnMapping[],
  targetKey: string,
) {
  const mapping =
    mappings.find(
      (item) =>
        item.targetKey === targetKey,
    );

  if (!mapping) {
    return undefined;
  }

  return source[
    mapping.sourceHeader
  ];
}

/** Shared school-date normalization: no locale-dependent Date.parse(). */
function parseDate(value: unknown): string | undefined {
  const result = normalizeSchoolDate(value);
  return result.status === "valid" ? result.iso : undefined;
}

// ======================================================
// DATE HEADER DETECTION FOR GRID REGISTER
// ======================================================

export function dateFromAttendanceColumn(
  column: ExcelSourceColumn,
): string | undefined {
  return parseDate(
    column.header,
  );
}

export function detectAttendanceDailyLayout(
  columns: ExcelSourceColumn[],
): AttendanceExcelDailyLayout {
  const dateColumns =
    columns.filter(
      (column) =>
        Boolean(
          dateFromAttendanceColumn(
            column,
          ),
        ),
    );

  /**
   * Multiple date headers strongly indicate a register/grid.
   */
  if (
    dateColumns.length >= 2
  ) {
    return "grid";
  }

  return "long";
}

// ======================================================
// DAILY LONG PARSER
// ======================================================

export function parseDailyAttendanceLong(args: {
  sheet: ExcelParsedSheet;

  headerRowIndex?: number;

  mappings?: ExcelColumnMapping[];

  defaultDate?: string;

  statusAliases?: Record<
    string,
    AttendanceExcelStatus
  >;
}): AttendanceExcelParsedDailyImport {
  const headerRowIndex =
    args.headerRowIndex ??
    detectLikelyHeaderRow(
      args.sheet,
    );

  const extracted =
    sheetToRecords(
      args.sheet,
      {
        headerRowIndex,
        skipEmptyRows: true,
        trimStrings: true,
      },
    );

  const mappings =
    args.mappings?.length
      ? args.mappings
      : autoMapExcelColumns(
          extracted.columns,
          ATTENDANCE_DAILY_FIELDS,
        );

  const records:
    AttendanceExcelDailyRecord[] =
    [];

  const rowNumbers: number[] =
    [];

  extracted.records.forEach(
    (source, index) => {
      const rawStatus =
        mappingValue(
          source,
          mappings,
          "status",
        );

      const status =
        normalizeAttendanceStatus(
          rawStatus,
          args.statusAliases,
        );

      const rawDate =
        mappingValue(
          source,
          mappings,
          "date",
        );

      records.push({
        studentId:
          text(
            mappingValue(
              source,
              mappings,
              "studentId",
            ),
          ) || undefined,

        admissionNumber:
          text(
            mappingValue(
              source,
              mappings,
              "admissionNumber",
            ),
          ) || undefined,

        studentName:
          text(
            mappingValue(
              source,
              mappings,
              "studentName",
            ),
          ) || undefined,

        date:
          parseDate(
            rawDate,
          ) ||
          args.defaultDate,

        status:
          status ||
          (
            text(rawStatus) ||
            undefined
          ),
      });

      rowNumbers.push(
        extracted.rowNumbers[
          index
        ] ??
          index +
            headerRowIndex +
            2,
      );
    },
  );

  return {
    mode: "daily",

    layout: "long",

    sheetName:
      extracted.sheetName,

    headerRowIndex,

    mappings,

    records,

    rowNumbers,
  };
}

// ======================================================
// DAILY GRID PARSER
// ======================================================

export function parseDailyAttendanceGrid(args: {
  sheet: ExcelParsedSheet;

  headerRowIndex?: number;

  mappings?: ExcelColumnMapping[];

  statusAliases?: Record<
    string,
    AttendanceExcelStatus
  >;

  ignoreBlankStatuses?: boolean;
}): AttendanceExcelParsedDailyImport {
  const headerRowIndex =
    args.headerRowIndex ??
    detectLikelyHeaderRow(
      args.sheet,
    );

  const extracted =
    sheetToRecords(
      args.sheet,
      {
        headerRowIndex,
        skipEmptyRows: true,
        trimStrings: true,
      },
    );

  /**
   * Student identity mappings only.
   *
   * Date columns are discovered dynamically from their headers.
   */
  const identityFields =
    ATTENDANCE_DAILY_FIELDS.filter(
      (field) =>
        field.key !== "date" &&
        field.key !== "status",
    );

  const mappings =
    args.mappings?.length
      ? args.mappings
      : autoMapExcelColumns(
          extracted.columns,
          identityFields,
        );

  const dateColumns =
    extracted.columns
      .map((column) => ({
        column,
        date:
          dateFromAttendanceColumn(
            column,
          ),
      }))
      .filter(
        (
          item,
        ): item is {
          column: ExcelSourceColumn;
          date: string;
        } =>
          Boolean(item.date),
      );

  const records:
    AttendanceExcelDailyRecord[] =
    [];

  const rowNumbers: number[] =
    [];

  extracted.records.forEach(
    (source, rowIndex) => {
      const studentId =
        text(
          mappingValue(
            source,
            mappings,
            "studentId",
          ),
        ) || undefined;

      const admissionNumber =
        text(
          mappingValue(
            source,
            mappings,
            "admissionNumber",
          ),
        ) || undefined;

      const studentName =
        text(
          mappingValue(
            source,
            mappings,
            "studentName",
          ),
        ) || undefined;

      const excelRowNumber =
        extracted.rowNumbers[
          rowIndex
        ] ??
        rowIndex +
          headerRowIndex +
          2;

      dateColumns.forEach(
        ({
          column,
          date,
        }) => {
          const rawStatus =
            source[
              column.header
            ];

          const blank =
            text(
              rawStatus,
            ) === "";

          if (
            blank &&
            args.ignoreBlankStatuses !==
              false
          ) {
            return;
          }

          const status =
            normalizeAttendanceStatus(
              rawStatus,
              args.statusAliases,
            );

          records.push({
            studentId,
            admissionNumber,
            studentName,

            date,

            status:
              status ||
              (
                text(rawStatus) ||
                undefined
              ),
          });

          rowNumbers.push(
            excelRowNumber,
          );
        },
      );
    },
  );

  return {
    mode: "daily",

    layout: "grid",

    sheetName:
      extracted.sheetName,

    headerRowIndex,

    mappings,

    records,

    rowNumbers,
  };
}

// ======================================================
// AUTO DAILY PARSER
// ======================================================

export function parseDailyAttendanceSheet(args: {
  sheet: ExcelParsedSheet;

  headerRowIndex?: number;

  mappings?: ExcelColumnMapping[];

  defaultDate?: string;

  statusAliases?: Record<
    string,
    AttendanceExcelStatus
  >;

  ignoreBlankStatuses?: boolean;
}): AttendanceExcelParsedDailyImport {
  const headerRowIndex =
    args.headerRowIndex ??
    detectLikelyHeaderRow(
      args.sheet,
    );

  const extracted =
    sheetToRecords(
      args.sheet,
      {
        headerRowIndex,
        skipEmptyRows: true,
        trimStrings: true,
      },
    );

  const layout =
    detectAttendanceDailyLayout(
      extracted.columns,
    );

  if (
    layout === "grid"
  ) {
    return parseDailyAttendanceGrid({
      ...args,
      headerRowIndex,
    });
  }

  return parseDailyAttendanceLong({
    ...args,
    headerRowIndex,
  });
}

// ======================================================
// TERM TOTALS PARSER
// ======================================================

export function parseTermAttendanceSheet(args: {
  sheet: ExcelParsedSheet;

  headerRowIndex?: number;

  mappings?: ExcelColumnMapping[];
}): AttendanceExcelParsedTermImport {
  const headerRowIndex =
    args.headerRowIndex ??
    detectLikelyHeaderRow(
      args.sheet,
    );

  const extracted =
    sheetToRecords(
      args.sheet,
      {
        headerRowIndex,
        skipEmptyRows: true,
        trimStrings: true,
      },
    );

  const mappings =
    args.mappings?.length
      ? args.mappings
      : autoMapExcelColumns(
          extracted.columns,
          ATTENDANCE_TERM_FIELDS,
        );

  const records:
    AttendanceExcelTermRecord[] =
    extracted.records.map(
      (source) => ({
        studentId:
          text(
            mappingValue(
              source,
              mappings,
              "studentId",
            ),
          ) || undefined,

        admissionNumber:
          text(
            mappingValue(
              source,
              mappings,
              "admissionNumber",
            ),
          ) || undefined,

        studentName:
          text(
            mappingValue(
              source,
              mappings,
              "studentName",
            ),
          ) || undefined,

        daysOpened:
          toExcelInteger(
            mappingValue(
              source,
              mappings,
              "daysOpened",
            ),
          ),

        daysPresent:
          toExcelInteger(
            mappingValue(
              source,
              mappings,
              "daysPresent",
            ),
          ),

        daysAbsent:
          toExcelInteger(
            mappingValue(
              source,
              mappings,
              "daysAbsent",
            ),
          ),

        timesLate:
          toExcelInteger(
            mappingValue(
              source,
              mappings,
              "timesLate",
            ),
          ),

        attendancePercent:
          Number(
            mappingValue(
              source,
              mappings,
              "attendancePercent",
            ),
          ) || undefined,
      }),
    );

  return {
    mode:
      "termTotals",

    sheetName:
      extracted.sheetName,

    headerRowIndex,

    mappings,

    records,

    rowNumbers:
      extracted.rowNumbers,
  };
}
