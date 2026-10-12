/**
 * app/lib/excel/students/studentExcelValidator.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — STUDENT VALIDATION
 * --------------------------------------------------------------------------
 *
 * Responsibilities:
 * - validate the selected column mapping;
 * - run shared Excel row validation;
 * - normalize student-specific data;
 * - validate student fields;
 * - detect duplicate Admission Numbers inside the workbook;
 * - detect possible matches against existing branch students;
 * - resolve spreadsheet class names/codes against branch classes;
 * - build the preview consumed before import confirmation.
 *
 * IMPORTANT:
 * This file performs NO Dexie/database mutations.
 */

import type {
  ExcelColumnMapping,
  ExcelSheetRecords,
  ExcelSourceColumn,
  ExcelSourceRecord,
  ExcelValidationIssue,
} from "../excelTypes";

import {
  validateColumnMappings,
} from "../excelColumnMapper";

import {
  validateExcelRecords,
} from "../excelValidation";

import {
  STUDENT_EXCEL_FIELDS,
} from "./studentExcelParser";

import type {
  StudentExcelClassOption,
  StudentExcelClassResolution,
  StudentExcelDuplicateMatch,
  StudentExcelExistingStudent,
  StudentExcelImportContext,
  StudentExcelImportOptions,
  StudentExcelNormalizedRecord,
  StudentExcelPreparedRow,
  StudentExcelValidationResult,
} from "./studentExcelTypes";

// ======================================================
// BASIC HELPERS
// ======================================================

function clean(value: unknown) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

function keyText(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Useful for identifiers where formatting punctuation
 * should not affect matching.
 *
 * Example:
 * ST-001
 * ST 001
 * st001
 *
 * all become:
 * st001
 */
function compactKey(value: unknown) {
  return keyText(value).replace(
    /[^a-z0-9]/g,
    "",
  );
}

function cleanEmail(value: unknown) {
  const result =
    clean(value).toLowerCase();

  return result || undefined;
}

function cleanPhone(value: unknown) {
  const result = clean(value);

  return result || undefined;
}

function safeAge(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    clean(value) === ""
  ) {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return undefined;
  }

  return Math.max(
    0,
    Math.round(number),
  );
}

function normalizeGender(value: unknown) {
  const normalized =
    keyText(value);

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

  return clean(value);
}

function normalizeStatus(value: unknown) {
  const normalized =
    keyText(value);

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
      "withdraw",
      "withdrawn",
      "left",
    ].includes(normalized)
  ) {
    return "withdrawn";
  }

  if (
    [
      "graduate",
      "graduated",
    ].includes(normalized)
  ) {
    return "graduated";
  }

  if (
    [
      "transfer",
      "transferred",
    ].includes(normalized)
  ) {
    return "transferred";
  }

  return normalized;
}

function dateOnly(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    if (
      !Number.isFinite(
        value.getTime(),
      )
    ) {
      return undefined;
    }

    return value
      .toISOString()
      .slice(0, 10);
  }

  const raw =
    clean(value);

  if (!raw) {
    return undefined;
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
  ) {
    return raw;
  }

  const parsed =
    new Date(raw);

  if (
    !Number.isFinite(
      parsed.getTime(),
    )
  ) {
    /**
     * Keep invalid original content so validation can tell
     * the user which value could not be understood.
     */
    return raw;
  }

  return parsed
    .toISOString()
    .slice(0, 10);
}

// ======================================================
// STUDENT NORMALIZATION
// ======================================================

export function normalizeStudentExcelRecord(
  input: Record<
    string,
    unknown
  >,
): StudentExcelNormalizedRecord {
  return {
    fullName:
      clean(input.fullName),

    admissionNumber:
      clean(
        input.admissionNumber,
      ) || undefined,

    gender:
      normalizeGender(
        input.gender,
      ),

    age:
      safeAge(input.age),

    dateOfBirth:
      dateOnly(
        input.dateOfBirth,
      ),

    parentName:
      clean(
        input.parentName,
      ) || undefined,

    parentPhone:
      cleanPhone(
        input.parentPhone,
      ),

    parentEmail:
      cleanEmail(
        input.parentEmail,
      ),

    address:
      clean(
        input.address,
      ) || undefined,

    className:
      clean(
        input.className,
      ) || undefined,

    classCode:
      clean(
        input.classCode,
      ) || undefined,

    status:
      normalizeStatus(
        input.status,
      ),
  };
}

// ======================================================
// EXISTING STUDENT DUPLICATE MATCHING
// ======================================================

export function findStudentExcelDuplicate(
  record: StudentExcelNormalizedRecord,
  existingStudents: StudentExcelExistingStudent[],
): StudentExcelDuplicateMatch {
  const admissionNumber =
    compactKey(
      record.admissionNumber,
    );

  /**
   * Admission Number is the strongest duplicate key.
   */
  if (admissionNumber) {
    const student =
      existingStudents.find(
        (item) =>
          !item.isDeleted &&
          compactKey(
            item.admissionNumber,
          ) ===
            admissionNumber,
      );

    if (student) {
      return {
        matched: true,
        reason:
          "admission-number",
        student,
      };
    }
  }

  /**
   * Name is weaker than Admission Number.
   *
   * Only consider it an existing duplicate when exactly
   * one existing active/non-deleted student has the same
   * normalized name.
   *
   * If there are two "John Mensah" students we do not guess.
   */
  const nameKey =
    keyText(
      record.fullName,
    );

  if (nameKey) {
    const matchingNames =
      existingStudents.filter(
        (item) =>
          !item.isDeleted &&
          keyText(
            item.fullName,
          ) ===
            nameKey,
      );

    if (
      matchingNames.length === 1
    ) {
      return {
        matched: true,
        reason: "name",
        student:
          matchingNames[0],
      };
    }
  }

  return {
    matched: false,
    reason: "none",
  };
}

// ======================================================
// CLASS RESOLUTION
// ======================================================

export function resolveStudentExcelClass(
  record: StudentExcelNormalizedRecord,
  context: StudentExcelImportContext,
  classes: StudentExcelClassOption[],
  options: StudentExcelImportOptions = {},
): StudentExcelClassResolution {
  /**
   * A class explicitly chosen by the user in Eleeveon takes
   * priority over spreadsheet class values.
   *
   * This supports schools that keep one spreadsheet per class.
   */
  if (context.classId) {
    const selected =
      classes.find(
        (item) =>
          String(item.id) ===
          String(
            context.classId,
          ),
      );

    return {
      resolved: true,

      classId:
        context.classId,

      className:
        selected?.name ||
        record.className,

      source:
        "selected-class",
    };
  }

  /**
   * Caller may deliberately disable spreadsheet class
   * interpretation.
   */
  if (
    options.resolveSpreadsheetClass ===
    false
  ) {
    return {
      resolved: false,
      source: "none",
    };
  }

  const activeClasses =
    classes.filter(
      (item) =>
        !item.isDeleted &&
        item.active !== false,
    );

  /**
   * Prefer class code because it tends to be less ambiguous.
   */
  const classCode =
    compactKey(
      record.classCode,
    );

  if (classCode) {
    const byCode =
      activeClasses.find(
        (item) =>
          compactKey(
            item.code,
          ) ===
          classCode,
      );

    if (byCode) {
      return {
        resolved: true,

        classId:
          byCode.id,

        className:
          byCode.name,

        source:
          "spreadsheet-class-code",
      };
    }
  }

  /**
   * Otherwise attempt exact normalized name resolution.
   */
  const className =
    keyText(
      record.className,
    );

  if (className) {
    const matches =
      activeClasses.filter(
        (item) =>
          keyText(
            item.name,
          ) ===
          className,
      );

    if (
      matches.length === 1
    ) {
      return {
        resolved: true,

        classId:
          matches[0].id,

        className:
          matches[0].name,

        source:
          "spreadsheet-class-name",
      };
    }

    if (
      matches.length > 1
    ) {
      return {
        resolved: false,

        source: "none",

        issue: {
          code:
            "student.class_ambiguous",

          message:
            `Class "${record.className}" matches more than one class in this branch.`,

          severity:
            options.unknownClassStrategy ===
            "reject-row"
              ? "error"
              : "warning",

          targetKey:
            "className",

          value:
            record.className,
        },
      };
    }
  }

  /**
   * A class value was supplied, but no class could be resolved.
   */
  if (
    record.className ||
    record.classCode
  ) {
    return {
      resolved: false,

      source: "none",

      issue: {
        code:
          "student.class_not_found",

        message:
          `Class "${record.className || record.classCode}" could not be matched to an active class in this branch.`,

        severity:
          options.unknownClassStrategy ===
          "reject-row"
            ? "error"
            : "warning",

        targetKey:
          record.classCode
            ? "classCode"
            : "className",

        value:
          record.className ||
          record.classCode,
      },
    };
  }

  return {
    resolved: false,
    source: "none",
  };
}

// ======================================================
// STUDENT FIELD VALIDATION
// ======================================================

function validateStudentRecord(
  record: StudentExcelNormalizedRecord,
  rowNumber: number,
): ExcelValidationIssue[] {
  const issues:
    ExcelValidationIssue[] = [];

  if (!record.fullName) {
    issues.push({
      code:
        "student.full_name_required",

      message:
        "Student Name is required.",

      severity: "error",

      rowNumber,

      targetKey:
        "fullName",
    });
  }

  if (
    record.age !== undefined &&
    (
      record.age < 0 ||
      record.age > 120
    )
  ) {
    issues.push({
      code:
        "student.invalid_age",

      message:
        "Age must be between 0 and 120.",

      severity: "error",

      rowNumber,

      targetKey:
        "age",

      value:
        record.age,
    });
  }

  if (
    record.parentEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      record.parentEmail,
    )
  ) {
    issues.push({
      code:
        "student.invalid_parent_email",

      message:
        "Parent / guardian email does not look valid.",

      severity:
        "warning",

      rowNumber,

      targetKey:
        "parentEmail",

      value:
        record.parentEmail,
    });
  }

  if (
    record.dateOfBirth
  ) {
    const parsed =
      new Date(
        `${record.dateOfBirth}T00:00:00`,
      );

    if (
      !Number.isFinite(
        parsed.getTime(),
      )
    ) {
      issues.push({
        code:
          "student.invalid_date_of_birth",

        message:
          "Date of Birth could not be interpreted as a valid date.",

        severity:
          "error",

        rowNumber,

        targetKey:
          "dateOfBirth",

        value:
          record.dateOfBirth,
      });
    }
  }

  const allowedStatuses =
    new Set([
      "active",
      "graduated",
      "transferred",
      "withdrawn",
    ]);

  if (
    record.status &&
    !allowedStatuses.has(
      record.status,
    )
  ) {
    issues.push({
      code:
        "student.unknown_status",

      message:
        `Student status "${record.status}" is not one of active, graduated, transferred or withdrawn.`,

      severity:
        "warning",

      rowNumber,

      targetKey:
        "status",

      value:
        record.status,
    });
  }

  return issues;
}

// ======================================================
// DUPLICATES INSIDE THE IMPORT FILE
// ======================================================

function fileDuplicateIssues(
  rows: StudentExcelPreparedRow[],
) {
  const issuesByRow =
    new Map<
      number,
      ExcelValidationIssue[]
    >();

  const admissionMap =
    new Map<
      string,
      number[]
    >();

  for (const row of rows) {
    const key =
      compactKey(
        row.data
          .admissionNumber,
      );

    if (!key) {
      continue;
    }

    const list =
      admissionMap.get(key) ||
      [];

    list.push(
      row.rowNumber,
    );

    admissionMap.set(
      key,
      list,
    );
  }

  for (
    const [
      key,
      rowNumbers,
    ] of admissionMap
  ) {
    if (
      rowNumbers.length < 2
    ) {
      continue;
    }

    for (
      const rowNumber of
      rowNumbers
    ) {
      const list =
        issuesByRow.get(
          rowNumber,
        ) || [];

      list.push({
        code:
          "student.duplicate_admission_number_in_file",

        message:
          "The same Admission Number appears more than once in this spreadsheet.",

        severity:
          "error",

        rowNumber,

        targetKey:
          "admissionNumber",

        value:
          key,
      });

      issuesByRow.set(
        rowNumber,
        list,
      );
    }
  }

  return issuesByRow;
}

// ======================================================
// MASTER STUDENT VALIDATION
// ======================================================

export function validateStudentExcelImport(
  args: {
    sheetName?: string;

    headerRowIndex?: number;

    sourceColumns:
      ExcelSourceColumn[];

    sourceRecords:
      ExcelSourceRecord[];

    mappings:
      ExcelColumnMapping[];

    rowNumbers:
      number[];

    context:
      StudentExcelImportContext;

    existingStudents?:
      StudentExcelExistingStudent[];

    classes?:
      StudentExcelClassOption[];

    options?:
      StudentExcelImportOptions;
  },
): StudentExcelValidationResult {
  const {
    sheetName =
      "Students",

    headerRowIndex = 0,

    sourceColumns,

    sourceRecords,

    mappings,

    rowNumbers,

    context,

    existingStudents = [],

    classes = [],

    options = {},
  } = args;

  // ====================================================
  // VALIDATE COLUMN MAPPING
  // ====================================================

  const mappingValidation =
    validateColumnMappings(
      mappings,
      STUDENT_EXCEL_FIELDS,
    );

  if (
    !mappingValidation.valid
  ) {
    return {
      valid: false,

      totalRows: 0,

      validRows: 0,

      invalidRows: 0,

      warningRows: 0,

      rows: [],

      issues:
        mappingValidation.issues,
    };
  }

  // ====================================================
  // BUILD THE SHARED ExcelSheetRecords CONTRACT
  // ====================================================

  /**
   * IMPORTANT FIX:
   *
   * validateExcelRecords() expects ExcelSheetRecords.
   *
   * The previous student validator passed:
   *
   * sourceRecords
   *
   * which is only ExcelSourceRecord[].
   *
   * That caused:
   *
   * Argument of type 'ExcelSourceRecord[]' is not assignable
   * to parameter of type 'ExcelSheetRecords'.
   */
  const sheetRecords:
    ExcelSheetRecords = {
      sheetName,

      headerRowIndex,

      columns:
        sourceColumns,

      records:
        sourceRecords,

      rowNumbers,
    };

  // ====================================================
  // SHARED GENERIC VALIDATION
  // ====================================================

  const genericValidation =
    validateExcelRecords(
      sheetRecords,
      mappings,
      STUDENT_EXCEL_FIELDS,
      {
        validateRequired:
          true,

        validateTypes:
          true,

        skipEmptyMappedRows:
          true,
      },
    );

  // ====================================================
  // STUDENT-SPECIFIC PREPARATION
  // ====================================================

  const preparedRows:
    StudentExcelPreparedRow[] =
    genericValidation.rows.map(
      (
        row,
        index,
      ) => {
        const rowNumber =
          row.rowNumber ||
          rowNumbers[index] ||
          headerRowIndex +
            index +
            2;

        const normalized =
          normalizeStudentExcelRecord(
            row.data as Record<
              string,
              unknown
            >,
          );

        const issues:
          ExcelValidationIssue[] =
          [
            ...row.issues.map(
              (issue) => ({
                ...issue,

                rowNumber:
                  issue.rowNumber ??
                  rowNumber,
              }),
            ),

            ...validateStudentRecord(
              normalized,
              rowNumber,
            ),
          ];

        // ================================================
        // MATCH EXISTING STUDENT
        // ================================================

        const duplicate =
          findStudentExcelDuplicate(
            normalized,
            existingStudents,
          );

        if (
          duplicate.matched
        ) {
          issues.push({
            code:
              "student.existing_duplicate",

            message:
              duplicate.reason ===
              "admission-number"
                ? "A student with this Admission Number already exists."
                : "A student with this exact name already exists.",

            severity:
              "warning",

            rowNumber,

            targetKey:
              duplicate.reason ===
              "admission-number"
                ? "admissionNumber"
                : "fullName",

            value:
              duplicate.reason ===
              "admission-number"
                ? normalized.admissionNumber
                : normalized.fullName,
          });
        }

        // ================================================
        // RESOLVE CLASS
        // ================================================

        const classResolution =
          resolveStudentExcelClass(
            normalized,
            context,
            classes,
            options,
          );

        if (
          classResolution.issue
        ) {
          issues.push({
            ...classResolution.issue,

            rowNumber,
          });
        }

        return {
          rowNumber,

          source:
            row.source,

          data:
            normalized,

          issues,

          valid:
            !issues.some(
              (issue) =>
                issue.severity ===
                "error",
            ),

          duplicate,

          classResolution,
        };
      },
    );

  // ====================================================
  // FILE-INTERNAL DUPLICATE CHECKS
  // ====================================================

  const duplicateIssues =
    fileDuplicateIssues(
      preparedRows,
    );

  for (
    const row of
    preparedRows
  ) {
    const rowDuplicateIssues =
      duplicateIssues.get(
        row.rowNumber,
      );

    if (
      rowDuplicateIssues?.length
    ) {
      row.issues.push(
        ...rowDuplicateIssues,
      );

      row.valid = false;
    }
  }

  // ====================================================
  // SUMMARY
  // ====================================================

  const allIssues = [
    ...mappingValidation.issues,

    ...preparedRows.flatMap(
      (row) =>
        row.issues,
    ),
  ];

  const validRows =
    preparedRows.filter(
      (row) =>
        row.valid,
    ).length;

  const invalidRows =
    preparedRows.length -
    validRows;

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
      mappingValidation.valid &&
      invalidRows === 0,

    totalRows:
      preparedRows.length,

    validRows,

    invalidRows,

    warningRows,

    rows:
      preparedRows,

    issues:
      allIssues,
  };
}