/**
 * app/lib/excel/assessments/assessmentExcelValidator.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ASSESSMENT VALIDATION
 * --------------------------------------------------------------------------
 *
 * Validates:
 * - Eleeveon workbook context;
 * - student matching;
 * - enrollment/class context;
 * - assessment item IDs;
 * - score numeric values;
 * - score <= maxScore;
 * - duplicate score cells;
 * - locked AssessmentEntry protection.
 *
 * No mutations happen here.
 */

import type {
  ExcelSourceRecord,
  ExcelValidationIssue,
} from "../excelTypes";

import type {
  AssessmentExcelContext,
  AssessmentExcelEnrollmentReference,
  AssessmentExcelExistingEntry,
  AssessmentExcelImportOptions,
  AssessmentExcelMetadata,
  AssessmentExcelNormalizedScore,
  AssessmentExcelParsedImport,
  AssessmentExcelPreparedScoreRow,
  AssessmentExcelProjectedColumn,
  AssessmentExcelStudentMatch,
  AssessmentExcelStudentReference,
  AssessmentExcelValidationResult,
} from "./assessmentExcelTypes";

// ======================================================
// HELPERS
// ======================================================

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(
  value: unknown,
) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compact(
  value: unknown,
) {
  return normalized(
    value,
  ).replace(
    /[^a-z0-9]/g,
    "",
  );
}

function sameId(
  left: unknown,
  right: unknown,
) {
  return (
    text(left) ===
    text(right)
  );
}

function emptySource():
  ExcelSourceRecord {
  return {};
}

// ======================================================
// METADATA VALIDATION
// ======================================================

export function validateAssessmentWorkbookContext(
  metadata: AssessmentExcelMetadata | undefined,
  context: AssessmentExcelContext,
): ExcelValidationIssue[] {
  if (!metadata) {
    /**
     * External workbooks legitimately have no metadata.
     */
    return [];
  }

  const issues:
    ExcelValidationIssue[] = [];

  const checks: Array<{
    key: string;
    expected: string | undefined;
    actual: string | undefined;
    label: string;
  }> = [
    {
      key: "accountId",
      expected:
        context.accountId,
      actual:
        metadata.accountId,
      label: "account",
    },
    {
      key: "schoolId",
      expected:
        context.schoolId,
      actual:
        metadata.schoolId,
      label: "school",
    },
    {
      key: "branchId",
      expected:
        context.branchId,
      actual:
        metadata.branchId,
      label: "branch",
    },
    {
      key: "classSubjectId",
      expected:
        context.classSubjectId,
      actual:
        metadata.classSubjectId,
      label:
        "class subject",
    },
    {
      key: "classId",
      expected:
        context.classId,
      actual:
        metadata.classId,
      label: "class",
    },
    {
      key: "subjectId",
      expected:
        context.subjectId,
      actual:
        metadata.subjectId,
      label: "subject",
    },
    {
      key:
        "academicStructureId",
      expected:
        context.academicStructureId,
      actual:
        metadata.academicStructureId,
      label:
        "academic structure",
    },
    {
      key:
        "academicPeriodId",
      expected:
        context.academicPeriodId,
      actual:
        metadata.academicPeriodId,
      label:
        "academic period",
    },
    {
      key:
        "assessmentStructureId",
      expected:
        context.assessmentStructureId,
      actual:
        metadata.assessmentStructureId,
      label:
        "assessment structure",
    },
  ];

  checks.forEach(
    (check) => {
      if (
        check.expected &&
        check.actual &&
        !sameId(
          check.expected,
          check.actual,
        )
      ) {
        issues.push({
          code:
            `assessment.metadata_${check.key}_mismatch`,

          message:
            `This workbook belongs to a different ${check.label}.`,

          severity:
            "error",

          targetKey:
            check.key,

          value:
            check.actual,
        });
      }
    },
  );

  if (
    metadata.templateVersion !==
    1
  ) {
    issues.push({
      code:
        "assessment.unsupported_template_version",

      message:
        `Assessment workbook version "${metadata.templateVersion}" is not supported.`,

      severity:
        "error",
    });
  }

  return issues;
}

// ======================================================
// STUDENT MATCHING
// ======================================================

export function matchAssessmentStudent(
  record: {
    studentId?: string;
    admissionNumber?: string;
    studentName?: string;
  },
  students: AssessmentExcelStudentReference[],
  options: AssessmentExcelImportOptions = {},
): AssessmentExcelStudentMatch {
  const suppliedId =
    text(record.studentId);

  if (suppliedId) {
    const student =
      students.find(
        (candidate) =>
          !candidate.isDeleted &&
          sameId(candidate.id, suppliedId),
      );

    // A supplied internal identifier is authoritative. Never silently
    // fall back to an admission number or name if it is invalid.
    if (!student) {
      return {
        matched: false,
        reason: "none",
        issue: {
          code: "assessment.student_id_not_found",
          message: "The workbook student identifier does not match a student in this class. Re-export the sheet or review its identity columns.",
          severity: "error",
        },
      };
    }

    const suppliedAdmission = compact(record.admissionNumber);
    if (suppliedAdmission && suppliedAdmission !== compact(student.admissionNumber)) {
      return {
        matched: false,
        reason: "none",
        issue: {
          code: "assessment.student_identity_conflict",
          message: "The student identifier and admission number refer to different values. Do not import until the identity is reviewed.",
          severity: "error",
        },
      };
    }

    const suppliedName = normalized(record.studentName);
    if (suppliedName && suppliedName !== normalized(student.fullName)) {
      return {
        matched: false,
        reason: "none",
        issue: {
          code: "assessment.student_name_conflict",
          message: "The student name was changed or does not match the student identifier. Review the workbook before importing.",
          severity: "error",
        },
      };
    }

    return { matched: true, reason: "student-id", student };
  }

  const admissionNumber =
    compact(
      record.admissionNumber,
    );

  if (admissionNumber) {
    const matches =
      students.filter(
        (candidate) =>
          !candidate.isDeleted &&
          compact(
            candidate.admissionNumber,
          ) ===
            admissionNumber,
      );

    if (
      matches.length === 1
    ) {
      const student = matches[0];
      if (record.studentName && normalized(record.studentName) !== normalized(student.fullName)) {
        return {
          matched: false,
          reason: "none",
          issue: {
            code: "assessment.admission_name_conflict",
            message: "Admission number and student name disagree. Review the row before importing.",
            severity: "error",
          },
        };
      }
      return { matched: true, reason: "admission-number", student };
    }

    if (
      matches.length > 1
    ) {
      return {
        matched: false,
        reason: "none",

        issue: {
          code:
            "assessment.ambiguous_admission_number",

          message:
            `Admission Number "${record.admissionNumber}" matches more than one student.`,

          severity:
            "error",
        },
      };
    }
  }

  // If an admission number was explicitly supplied but not found, a
  // matching name is not enough to safely identify the student.
  if (admissionNumber) {
    return {
      matched: false,
      reason: "none",
      issue: {
        code: "assessment.admission_number_not_found",
        message: `Admission number "${record.admissionNumber}" did not match a student. Review it rather than matching by name.`,
        severity: "error",
      },
    };
  }

  if (
    options.allowNameMatch !==
    false
  ) {
    const name =
      normalized(
        record.studentName,
      );

    if (name) {
      const matches =
        students.filter(
          (candidate) =>
            !candidate.isDeleted &&
            normalized(
              candidate.fullName,
            ) ===
              name,
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
              "assessment.ambiguous_student_name",

            message:
              `Student name "${record.studentName}" matches more than one student. Use Admission Number or Eleeveon Student ID.`,

            severity:
              "error",
          },
        };
      }
    }
  }

  return {
    matched: false,
    reason: "none",

    issue: {
      code:
        "assessment.student_not_found",

      message:
        `Student "${record.studentName || record.admissionNumber || record.studentId || "Unknown"}" could not be matched.`,

      severity:
        "error",
    },
  };
}

// ======================================================
// ENROLLMENT CHECK
// ======================================================

function studentBelongsToAssessmentContext(
  studentId: string,
  context: AssessmentExcelContext,
  enrollments: AssessmentExcelEnrollmentReference[],
) {
  return enrollments.some(
    (enrollment) =>
      !enrollment.isDeleted &&
      normalized(
        enrollment.status ||
          "active",
      ) === "active" &&
      sameId(
        enrollment.studentId,
        studentId,
      ) &&
      sameId(
        enrollment.classId,
        context.classId,
      ) &&
      sameId(
        enrollment.academicStructureId,
        context.academicStructureId,
      ) &&
      (
        !enrollment.academicPeriodId ||
        sameId(
          enrollment.academicPeriodId,
          context.academicPeriodId,
        )
      ),
  );
}

// ======================================================
// EXISTING ENTRY MATCH
// ======================================================

function findExistingEntry(
  entries: AssessmentExcelExistingEntry[],
  args: {
    studentId: string;
    itemId: string;
    context: AssessmentExcelContext;
  },
) {
  return entries.find(
    (entry) =>
      !entry.isDeleted &&
      sameId(
        entry.studentId,
        args.studentId,
      ) &&
      sameId(
        entry.classSubjectId,
        args.context.classSubjectId,
      ) &&
      sameId(
        entry.classId,
        args.context.classId,
      ) &&
      sameId(
        entry.subjectId,
        args.context.subjectId,
      ) &&
      sameId(
        entry.academicStructureId,
        args.context.academicStructureId,
      ) &&
      sameId(
        entry.academicPeriodId,
        args.context.academicPeriodId,
      ) &&
      sameId(
        entry.assessmentStructureId,
        args.context.assessmentStructureId,
      ) &&
      sameId(
        entry.assessmentStructureItemId,
        args.itemId,
      ),
  );
}

// ======================================================
// MASTER VALIDATION
// ======================================================

export function validateAssessmentExcelImport(args: {
  parsed:
    AssessmentExcelParsedImport;

  context:
    AssessmentExcelContext;

  projectedColumns:
    AssessmentExcelProjectedColumn[];

  students:
    AssessmentExcelStudentReference[];

  enrollments?:
    AssessmentExcelEnrollmentReference[];

  existingEntries?:
    AssessmentExcelExistingEntry[];

  options?:
    AssessmentExcelImportOptions;
}): AssessmentExcelValidationResult {
  const {
    parsed,
    context,
    projectedColumns,
    students,
    enrollments = [],
    existingEntries = [],
    options = {},
  } = args;

  const globalIssues =
    validateAssessmentWorkbookContext(
      parsed.metadata,
      context,
    );

  const projectedById =
    new Map(
      projectedColumns.map(
        (column) => [
          column.itemId,
          column,
        ],
      ),
    );

  if (parsed.kind === "eleeveon-assessment") {
    if (!parsed.metadata) {
      globalIssues.push({
        code: "assessment.missing_controlled_metadata",
        message: "The controlled workbook metadata is missing. Re-export the assessment sheet.",
        severity: "error",
      });
    }
    if (!parsed.metadataColumns.length) {
      globalIssues.push({
        code: "assessment.missing_assessment_columns",
        message: "This workbook has no registered assessment columns.",
        severity: "error",
      });
    }
    const mappedItems = new Set<string>();
    for (const column of parsed.metadataColumns) {
      const current = projectedById.get(column.itemId);
      if (!current || mappedItems.has(column.itemId) ||
          Number(column.maxScore) !== Number(current.maxScore)) {
        globalIssues.push({
          code: "assessment.changed_assessment_metadata",
          message: `An assessment item is missing, duplicated or has a changed score limit (${column.label || column.itemId}). Download a new sheet.`,
          severity: "error",
        });
      }
      mappedItems.add(column.itemId);
    }
    if (parsed.metadataColumns.length !== projectedColumns.length ||
        projectedColumns.some((column) => !mappedItems.has(column.itemId))) {
      globalIssues.push({
        code: "assessment.changed_assessment_structure",
        message: "The assessment structure has changed since this sheet was exported. Download a new sheet.",
        severity: "error",
      });
    }
  }

  const rows:
    AssessmentExcelPreparedScoreRow[] =
    [];

  const logicalCells =
    new Map<
      string,
      number[]
    >();

  parsed.scoreRecords.forEach(
    (
      record,
      index,
    ) => {
      const issues:
        ExcelValidationIssue[] =
        [];

      const match =
        matchAssessmentStudent(
          record,
          students,
          options,
        );

      if (match.issue) {
        issues.push({
          ...match.issue,
          rowNumber:
            record.rowNumber,
          columnIndex:
            record.columnIndex,
        });
      }

      const studentId =
        match.student?.id ||
        "";

      if (
        match.matched &&
        studentId &&
        enrollments.length &&
        !studentBelongsToAssessmentContext(
          studentId,
          context,
          enrollments,
        )
      ) {
        issues.push({
          code:
            "assessment.student_not_enrolled",

          message:
            "The matched student is not actively enrolled in this class and academic period.",

          severity:
            "error",

          rowNumber:
            record.rowNumber,

          columnIndex:
            record.columnIndex,
        });
      }

      const projected =
        projectedById.get(
          record.assessmentStructureItemId,
        );

      if (!projected) {
        issues.push({
          code:
            "assessment.item_not_editable",

          message:
            `Assessment item "${record.assessmentLabel || record.assessmentStructureItemId}" is not part of the current editable assessment projection.`,

          severity:
            "error",

          rowNumber:
            record.rowNumber,

          columnIndex:
            record.columnIndex,

          value:
            record.assessmentStructureItemId,
        });
      }

      const maxScore =
        Math.max(
          1,
          Number(
            projected?.maxScore ??
            record.maxScore ??
            100,
          ),
        );

      const weight =
        Number(
          projected?.weight ??
          record.weight ??
          0,
        );

      if (
        !record.blank &&
        (
          record.score ===
            undefined ||
          !Number.isFinite(
            Number(
              record.score,
            ),
          )
        )
      ) {
        issues.push({
          code:
            "assessment.invalid_score",

          message:
            `Score for "${record.assessmentLabel || "assessment"}" must be a valid number.`,

          severity:
            "error",

          rowNumber:
            record.rowNumber,

          columnIndex:
            record.columnIndex,

          value:
            record.score,
        });
      }

      if (
        !record.blank &&
        record.score !==
          undefined &&
        Number(record.score) < 0
      ) {
        issues.push({
          code:
            "assessment.score_below_zero",

          message:
            "Assessment score cannot be below zero.",

          severity:
            "error",

          rowNumber:
            record.rowNumber,

          columnIndex:
            record.columnIndex,

          value:
            record.score,
        });
      }

      if (
        !record.blank &&
        record.score !==
          undefined &&
        Number(record.score) >
          maxScore
      ) {
        issues.push({
          code:
            "assessment.score_exceeds_maximum",

          message:
            `Score cannot exceed ${maxScore}.`,

          severity:
            "error",

          rowNumber:
            record.rowNumber,

          columnIndex:
            record.columnIndex,

          value:
            record.score,
        });
      }

      const existingEntry =
        studentId
          ? findExistingEntry(
              existingEntries,
              {
                studentId,

                itemId:
                  record.assessmentStructureItemId,

                context,
              },
            )
          : undefined;

      const locked =
        Boolean(
          existingEntry?.locked,
        );

      if (locked) {
        issues.push({
          code:
            "assessment.entry_locked",

          message:
            `The existing "${record.assessmentLabel || "assessment"}" score is locked and cannot be changed by import.`,

          severity:
            options.lockedEntrySeverity ||
            "error",

          rowNumber:
            record.rowNumber,

          columnIndex:
            record.columnIndex,
        });
      }

      const normalizedScore:
        AssessmentExcelNormalizedScore =
        {
          studentId,

          admissionNumber:
            match.student
              ?.admissionNumber ||
            record.admissionNumber,

          studentName:
            match.student
              ?.fullName ||
            record.studentName ||
            "",

          assessmentStructureItemId:
            record.assessmentStructureItemId,

          assessmentLabel:
            projected?.label ||
            record.assessmentLabel,

          score:
            record.blank
              ? undefined
              : Number(
                  record.score,
                ),

          blank:
            record.blank,

          maxScore,

          weight,
        };

      rows.push({
        rowNumber:
          record.rowNumber,

        source:
          emptySource(),

        data:
          normalizedScore,

        issues,

        valid:
          !issues.some(
            (issue) =>
              issue.severity ===
              "error",
          ),

        studentMatch:
          match,

        existingEntry,

        locked,
      });

      if (
        studentId &&
        record.assessmentStructureItemId
      ) {
        const key =
          `${studentId}::${record.assessmentStructureItemId}`;

        const occurrences =
          logicalCells.get(
            key,
          ) || [];

        occurrences.push(
          index,
        );

        logicalCells.set(
          key,
          occurrences,
        );
      }
    },
  );

  // ====================================================
  // DUPLICATE LOGICAL CELLS
  // ====================================================

  logicalCells.forEach(
    (indexes) => {
      if (
        indexes.length < 2
      ) {
        return;
      }

      indexes.forEach(
        (index) => {
          const row =
            rows[index];

          if (!row) {
            return;
          }

          row.issues.push({
            code:
              "assessment.duplicate_score_cell",

            message:
              "This student and assessment item appear more than once in the workbook.",

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

  const rowIssues =
    rows.flatMap(
      (row) =>
        row.issues,
    );

  const issues = [
    ...globalIssues,
    ...rowIssues,
  ];

  const invalidRows =
    rows.filter(
      (row) =>
        !row.valid,
    ).length;

  const warningRows =
    rows.filter(
      (row) =>
        row.issues.some(
          (issue) =>
            issue.severity ===
            "warning",
        ),
    ).length;

  const hasGlobalError =
    globalIssues.some(
      (issue) =>
        issue.severity ===
        "error",
    );

  return {
    valid:
      !hasGlobalError &&
      invalidRows === 0,

    totalRows:
      rows.length,

    validRows:
      rows.length -
      invalidRows,

    invalidRows,

    warningRows,

    rows,

    issues,
  };
}
