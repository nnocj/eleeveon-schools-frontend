/**
 * app/lib/excel/students/studentExcelParser.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — STUDENT PARSER / COLUMN MAPPING
 * --------------------------------------------------------------------------
 *
 * Responsibilities:
 * - defines student destination fields;
 * - knows common school spreadsheet header aliases;
 * - extracts student records from a parsed worksheet;
 * - automatically maps spreadsheet columns;
 * - allows caller-supplied mappings to override automatic mappings.
 *
 * IMPORTANT:
 * - this file performs NO Dexie writes;
 * - shared workbook/mapping utilities remain under app/lib/excel;
 * - student-specific interpretation remains here.
 */

import type {
  ExcelColumnMapping,
  ExcelFieldDefinition,
  ExcelParsedSheet,
  ExcelSourceRecord,
} from "../excelTypes";

import {
  autoMapExcelColumns,
} from "../excelColumnMapper";

import {
  detectLikelyHeaderRow,
  sheetToRecords,
} from "../excelWorkbook";

import type {
  PrepareStudentExcelOptions,
  StudentExcelRecord,
} from "./studentExcelTypes";

// ======================================================
// BASIC NORMALIZATION
// ======================================================

function text(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function optionalText(value: unknown) {
  const result = text(value);
  return result || undefined;
}

function numberOrUndefined(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return undefined;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : undefined;
}

function normalizeGender(value: unknown) {
  const normalized = text(value).toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (
    [
      "m",
      "male",
      "boy",
    ].includes(normalized)
  ) {
    return "Male";
  }

  if (
    [
      "f",
      "female",
      "girl",
    ].includes(normalized)
  ) {
    return "Female";
  }

  return text(value);
}

function normalizeStatus(value: unknown) {
  const normalized = text(value).toLowerCase();

  if (!normalized) {
    return "active";
  }

  if (
    [
      "active",
      "current",
      "enrolled",
    ].includes(normalized)
  ) {
    return "active";
  }

  if (
    [
      "withdrawn",
      "withdraw",
      "left",
    ].includes(normalized)
  ) {
    return "withdrawn";
  }

  if (
    [
      "graduated",
      "graduate",
    ].includes(normalized)
  ) {
    return "graduated";
  }

  if (
    [
      "transferred",
      "transfer",
    ].includes(normalized)
  ) {
    return "transferred";
  }

  return normalized;
}

function normalizeDate(value: unknown) {
  if (
    value === null ||
    value === undefined
  ) {
    return undefined;
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      return undefined;
    }

    return value
      .toISOString()
      .slice(0, 10);
  }

  /**
   * Excel serial date fallback.
   *
   * Typical modern Excel serial dates fall well inside
   * this range.
   */
  if (typeof value === "number") {
    if (
      value > 20_000 &&
      value < 80_000
    ) {
      const excelEpoch = Date.UTC(
        1899,
        11,
        30,
      );

      const parsed = new Date(
        excelEpoch +
          value * 86_400_000,
      );

      if (
        Number.isFinite(
          parsed.getTime(),
        )
      ) {
        return parsed
          .toISOString()
          .slice(0, 10);
      }
    }
  }

  const raw = text(value);

  if (!raw) {
    return undefined;
  }

  /**
   * Already normalized ISO date.
   */
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
  ) {
    return raw;
  }

  const parsed = new Date(raw);

  if (
    !Number.isFinite(
      parsed.getTime(),
    )
  ) {
    /**
     * Preserve the original text.
     *
     * The validator is responsible for reporting that
     * it could not be interpreted as a date.
     */
    return raw;
  }

  return parsed
    .toISOString()
    .slice(0, 10);
}

// ======================================================
// STUDENT DESTINATION FIELD DEFINITIONS
// ======================================================

/**
 * These are the canonical fields available to the student
 * import column-mapping screen.
 *
 * External spreadsheets can use completely different headers.
 * aliases allow Eleeveon to suggest mappings automatically.
 */
export const STUDENT_EXCEL_FIELDS: ExcelFieldDefinition[] = [
  {
    key: "fullName",
    label: "Student Name",

    aliases: [
      "student",
      "student name",
      "student full name",
      "full name",
      "fullname",
      "name",
      "learner",
      "learner name",
      "pupil",
      "pupil name",
      "child name",
    ],

    required: true,

    dataType: "string",

    description:
      "Student's full name.",

    transform: (value) =>
      text(value),
  },

  {
    key: "admissionNumber",
    label: "Admission Number",

    aliases: [
      "admission no",
      "admission no.",
      "admission number",
      "admission #",
      "admission id",
      "student id",
      "student number",
      "student no",
      "student no.",
      "student code",
      "index number",
      "index no",
      "index no.",
      "learner id",
      "pupil id",
    ],

    dataType: "string",

    description:
      "School admission/student identifier.",

    transform: optionalText,
  },

  {
    key: "gender",
    label: "Gender",

    aliases: [
      "gender",
      "sex",
    ],

    dataType: "string",

    transform: normalizeGender,
  },

  {
    key: "dateOfBirth",
    label: "Date of Birth",

    aliases: [
      "date of birth",
      "birth date",
      "birthdate",
      "dob",
      "d.o.b",
      "d.o.b.",
    ],

    dataType: "date",

    transform: normalizeDate,
  },

  {
    key: "age",
    label: "Age",

    aliases: [
      "age",
      "student age",
      "learner age",
      "pupil age",
    ],

    dataType: "integer",

    transform: numberOrUndefined,
  },

  {
    key: "parentName",
    label: "Parent / Guardian Name",

    aliases: [
      "parent",
      "parent name",
      "guardian",
      "guardian name",
      "parent guardian",
      "parent/guardian",
      "parent / guardian",
      "parent or guardian",
      "father name",
      "mother name",
    ],

    dataType: "string",

    transform: optionalText,
  },

  {
    key: "parentPhone",
    label: "Parent Phone",

    aliases: [
      "parent phone",
      "parent telephone",
      "parent mobile",
      "guardian phone",
      "guardian telephone",
      "guardian mobile",
      "phone",
      "telephone",
      "contact",
      "contact number",
      "contact no",
      "contact no.",
      "mobile",
      "mobile number",
    ],

    dataType: "phone",

    transform: optionalText,
  },

  {
    key: "parentEmail",
    label: "Parent Email",

    aliases: [
      "parent email",
      "guardian email",
      "email",
      "email address",
    ],

    dataType: "email",

    transform: optionalText,
  },

  {
    key: "address",
    label: "Address",

    aliases: [
      "address",
      "home address",
      "residential address",
      "residence",
      "location",
    ],

    dataType: "string",

    transform: optionalText,
  },

  {
    key: "className",
    label: "Class",

    aliases: [
      "class",
      "class name",
      "current class",
      "form",
      "grade",
      "level",
      "stream",
    ],

    dataType: "string",

    transform: optionalText,
  },

  {
    key: "classCode",
    label: "Class Code",

    aliases: [
      "class code",
      "class id",
      "class number",
      "class no",
      "class no.",
    ],

    dataType: "string",

    transform: optionalText,
  },

  {
    key: "status",
    label: "Status",

    aliases: [
      "status",
      "student status",
      "enrollment status",
      "enrolment status",
    ],

    dataType: "string",

    transform: normalizeStatus,
  },
];

// ======================================================
// RECORD MAPPING
// ======================================================

function mappedRecordFromSource(
  source: ExcelSourceRecord,
  mappings: ExcelColumnMapping[],
  rowNumber: number,
): StudentExcelRecord {
  const target: StudentExcelRecord = {};

  for (const mapping of mappings) {
    const field =
      STUDENT_EXCEL_FIELDS.find(
        (item) =>
          item.key ===
          mapping.targetKey,
      );

    if (!field) {
      continue;
    }

    const sourceValue =
      source[
        mapping.sourceHeader
      ];

    const transformed =
      field.transform
        ? field.transform(
            sourceValue,
            {
              rowNumber,

              mapping,

              sourceRecord:
                source,
            },
          )
        : sourceValue;

    (
      target as Record<
        string,
        unknown
      >
    )[field.key] =
      transformed;
  }

  return target;
}

// ======================================================
// PREPARE STUDENT SHEET
// ======================================================

export function prepareStudentSheetRecords(
  sheet: ExcelParsedSheet,
  options: PrepareStudentExcelOptions = {},
) {
  /**
   * Caller may explicitly select a header row.
   *
   * Otherwise use the shared automatic header detector.
   */
  const headerRowIndex =
    options.headerRowIndex ??
    detectLikelyHeaderRow(sheet);

  const extracted =
    sheetToRecords(
      sheet,
      {
        headerRowIndex,

        skipEmptyRows:
          options.skipEmptyRows ??
          true,

        trimStrings: true,
      },
    );

  /**
   * IMPORTANT:
   *
   * autoMapExcelColumns() already returns ExcelColumnMapping[].
   *
   * The previous version incorrectly treated the result as
   * ExcelColumnMappingSuggestion[], which caused:
   *
   * Property 'targetField' does not exist on type
   * 'ExcelColumnMapping'
   *
   * and:
   *
   * Property 'sourceColumn' does not exist on type
   * 'ExcelColumnMapping'
   */
  const mappings: ExcelColumnMapping[] =
    options.mappings?.length
      ? options.mappings
      : autoMapExcelColumns(
          extracted.columns,
          STUDENT_EXCEL_FIELDS,
        );

  const records =
    extracted.records.map(
      (
        source,
        index,
      ) => {
        const rowNumber =
          extracted.rowNumbers[
            index
          ] ??
          headerRowIndex +
            index +
            2;

        return mappedRecordFromSource(
          source,
          mappings,
          rowNumber,
        );
      },
    );

  return {
    sheetName:
      extracted.sheetName,

    headerRowIndex:
      extracted.headerRowIndex,

    columns:
      extracted.columns,

    sourceRecords:
      extracted.records,

    records,

    rowNumbers:
      extracted.rowNumbers,

    mappings,
  };
}