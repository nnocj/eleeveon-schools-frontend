/**
 * app/lib/excel/assessments/assessmentExcelImporter.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ASSESSMENT OFFLINE-FIRST IMPORTER
 * --------------------------------------------------------------------------
 *
 * Writes validated scores into the existing assessmentEntries table using
 * the same offline-first mutation utilities used by AssessmentEntries.tsx.
 *
 * Existing unlocked score:
 *   -> updateLocal()
 *
 * New score:
 *   -> createLocal()
 *
 * Blank controlled-template score with existing unlocked entry:
 *   -> softDeleteLocal()
 *
 * Locked score:
 *   -> never mutated.
 */

import {
  db,
} from "../../db/db";

import {
  createLocal,
  softDeleteLocal,
  updateLocal,
} from "../../sync/syncUtils";

import type {
  ExcelValidationIssue,
} from "../excelTypes";

import type {
  AssessmentExcelContext,
  AssessmentExcelExistingEntry,
  AssessmentExcelGradeRule,
  AssessmentExcelImportOptions,
  AssessmentExcelImportResult,
  AssessmentExcelImportRowResult,
  AssessmentExcelProjectedColumn,
  AssessmentExcelStudentCalculation,
  AssessmentExcelValidationResult,
} from "./assessmentExcelTypes";

// ======================================================
// HELPERS
// ======================================================

function text(value: unknown) {
  return String(value ?? "").trim();
}

function idOf(value: unknown) {
  const result =
    text(value);

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

function createdId(
  result: unknown,
) {
  if (
    typeof result ===
      "string" ||
    typeof result ===
      "number"
  ) {
    return idOf(result);
  }

  if (
    result &&
    typeof result ===
      "object"
  ) {
    const value =
      result as Record<
        string,
        unknown
      >;

    return (
      idOf(value.id) ||
      idOf(value.localId) ||
      idOf(value.cloudId)
    );
  }

  return "";
}

function importError(
  rowNumber: number,
  message: string,
): ExcelValidationIssue {
  return {
    code:
      "assessment.import_failed",

    message,

    severity:
      "error",

    rowNumber,
  };
}

// ======================================================
// REFERENCE DATA
// ======================================================

export async function getAssessmentExcelExistingEntries(
  context: AssessmentExcelContext,
): Promise<
  AssessmentExcelExistingEntry[]
> {
  const rows =
    await db.assessmentEntries.toArray();

  return rows
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
          row.classSubjectId,
          context.classSubjectId,
        ) &&
        sameId(
          row.classId,
          context.classId,
        ) &&
        sameId(
          row.subjectId,
          context.subjectId,
        ) &&
        sameId(
          row.academicStructureId,
          context.academicStructureId,
        ) &&
        sameId(
          row.academicPeriodId,
          context.academicPeriodId,
        ) &&
        sameId(
          row.assessmentStructureId,
          context.assessmentStructureId,
        ),
    )
    .map(
      (row: any) => ({
        id:
          idOf(row.id),

        accountId:
          idOf(
            row.accountId,
          ),

        schoolId:
          idOf(
            row.schoolId,
          ),

        branchId:
          idOf(
            row.branchId,
          ),

        classSubjectId:
          idOf(
            row.classSubjectId,
          ),

        organizationId:
          idOf(
            row.organizationId,
          ) || undefined,

        academicStructureId:
          idOf(
            row.academicStructureId,
          ),

        academicPeriodId:
          idOf(
            row.academicPeriodId,
          ),

        gradingStructureId:
          idOf(
            row.gradingStructureId,
          ) || undefined,

        assessmentStructureId:
          idOf(
            row.assessmentStructureId,
          ),

        assessmentStructureItemId:
          idOf(
            row.assessmentStructureItemId,
          ),

        studentId:
          idOf(
            row.studentId,
          ),

        classId:
          idOf(
            row.classId,
          ),

        subjectId:
          idOf(
            row.subjectId,
          ),

        score:
          Number(
            row.score,
          ),

        grade:
          row.grade,

        remark:
          row.remark,

        published:
          row.published,

        locked:
          row.locked,

        active:
          row.active,

        isDeleted:
          row.isDeleted,
      }),
    );
}

// ======================================================
// GRADE LOOKUP
// ======================================================

function findGradeRule(
  percentage: number,
  rules: AssessmentExcelGradeRule[],
) {
  return [...rules]
    .sort(
      (a, b) =>
        (a.order ?? 0) -
        (b.order ?? 0),
    )
    .find(
      (rule) =>
        percentage >=
          Number(
            rule.minScore,
          ) &&
        percentage <=
          Number(
            rule.maxScore,
          ),
    );
}

// ======================================================
// CALCULATIONS
// ======================================================

export function calculateAssessmentExcelStudents(args: {
  validation:
    AssessmentExcelValidationResult;

  projectedColumns:
    AssessmentExcelProjectedColumn[];

  gradeRules?: AssessmentExcelGradeRule[];
}): AssessmentExcelStudentCalculation[] {
  const {
    validation,
    projectedColumns,
    gradeRules = [],
  } = args;

  const byStudent =
    new Map<
      string,
      Map<string, number>
    >();

  validation.rows.forEach(
    (row) => {
      if (
        !row.data.studentId ||
        row.data.blank ||
        row.data.score ===
          undefined
      ) {
        return;
      }

      let scores =
        byStudent.get(
          row.data.studentId,
        );

      if (!scores) {
        scores =
          new Map<
            string,
            number
          >();

        byStudent.set(
          row.data.studentId,
          scores,
        );
      }

      scores.set(
        row.data
          .assessmentStructureItemId,
        Number(
          row.data.score,
        ),
      );
    },
  );

  return Array.from(
    byStudent.entries(),
  ).map(
    (
      [
        studentId,
        scores,
      ],
    ) => {
      let rawTotal = 0;
      let weightedTotal = 0;

      projectedColumns.forEach(
        (column) => {
          const score =
            scores.get(
              column.itemId,
            );

          if (
            score === undefined
          ) {
            return;
          }

          const maxScore =
            Math.max(
              1,
              Number(
                column.maxScore ||
                100,
              ),
            );

          const weight =
            Number(
              column.weight ||
              0,
            );

          rawTotal +=
            score;

          weightedTotal +=
            (
              score /
              maxScore
            ) *
            weight;
        },
      );

      /**
       * This mirrors the existing AssessmentEntries behavior where the
       * weighted total is effectively the assessment percentage.
       */
      const percentage =
        weightedTotal;

      const rule =
        findGradeRule(
          percentage,
          gradeRules,
        );

      return {
        studentId,

        rawTotal,

        weightedTotal,

        percentage,

        grade:
          rule?.grade,

        remark:
          rule?.remark,

        gpa:
          rule?.gpa,
      };
    },
  );
}

// ======================================================
// IMPORT
// ======================================================

export async function importAssessmentExcel(
  validation: AssessmentExcelValidationResult,
  context: AssessmentExcelContext,
  options: AssessmentExcelImportOptions = {},
  args?: {
    projectedColumns?: AssessmentExcelProjectedColumn[];
    gradeRules?: AssessmentExcelGradeRule[];
    existingEntries?: AssessmentExcelExistingEntry[];
  },
): Promise<AssessmentExcelImportResult> {
  const updateExisting =
    options.updateExisting !==
    false;

  const clearExistingWhenBlank =
    options.clearExistingWhenBlank !==
    false;

  const existingEntries =
    args?.existingEntries ||
    await getAssessmentExcelExistingEntries(
      context,
    );

  const projectedColumns =
    args?.projectedColumns ||
    [];

  const calculations =
    calculateAssessmentExcelStudents(
      {
        validation,

        projectedColumns,

        gradeRules:
          args?.gradeRules ||
          [],
      },
    );

  const calculationByStudent =
    new Map(
      calculations.map(
        (calculation) => [
          calculation.studentId,
          calculation,
        ],
      ),
    );

  const results:
    AssessmentExcelImportRowResult[] =
    [];

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (
    const row of
    validation.rows
  ) {
    if (
      !row.valid ||
      row.locked
    ) {
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

        assessmentStructureItemId:
          row.data
            .assessmentStructureItemId,

        assessmentLabel:
          row.data
            .assessmentLabel,

        score:
          row.data.score,

        entryId:
          row.existingEntry
            ?.id,

        issues:
          row.issues,
      });

      continue;
    }

    try {
      const existing =
        row.existingEntry;

      // ==================================================
      // BLANK SCORE
      // ==================================================

      if (
        row.data.blank
      ) {
        if (
          existing &&
          clearExistingWhenBlank
        ) {
          if (
            existing.locked
          ) {
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

              assessmentStructureItemId:
                row.data
                  .assessmentStructureItemId,

              assessmentLabel:
                row.data
                  .assessmentLabel,

              entryId:
                existing.id,

              issues:
                row.issues,
            });

            continue;
          }

          await softDeleteLocal(
            "assessmentEntries",
            existing.id,
          );

          existing.isDeleted =
            true;

          deleted += 1;

          results.push({
            rowNumber:
              row.rowNumber,

            action:
              "deleted",

            studentId:
              row.data.studentId,

            studentName:
              row.data.studentName,

            assessmentStructureItemId:
              row.data
                .assessmentStructureItemId,

            assessmentLabel:
              row.data
                .assessmentLabel,

            entryId:
              existing.id,

            issues:
              row.issues,
          });

          continue;
        }

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

          assessmentStructureItemId:
            row.data
              .assessmentStructureItemId,

          assessmentLabel:
            row.data
              .assessmentLabel,

          issues:
            row.issues,
        });

        continue;
      }

      // ==================================================
      // SCORE PAYLOAD
      // ==================================================

      const calculation =
        calculationByStudent.get(
          row.data.studentId,
        );

      /**
       * Payload mirrors AssessmentEntries.tsx.
       */
      const payload = {
        accountId:
          context.accountId,

        schoolId:
          context.schoolId,

        branchId:
          context.branchId,

        classSubjectId:
          context.classSubjectId,

        organizationId:
          context.organizationId,

        academicStructureId:
          context.academicStructureId,

        academicPeriodId:
          context.academicPeriodId,

        gradingStructureId:
          context.gradingStructureId,

        assessmentStructureId:
          context.assessmentStructureId,

        assessmentStructureItemId:
          row.data
            .assessmentStructureItemId,

        studentId:
          row.data.studentId,

        classId:
          context.classId,

        subjectId:
          context.subjectId,

        score:
          Number(
            row.data.score,
          ),

        grade:
          calculation?.grade,

        remark:
          calculation?.remark,

        published:
          false,

        locked:
          false,

        active:
          true,

        isDeleted:
          false,
      };

      // ==================================================
      // UPDATE
      // ==================================================

      if (existing) {
        if (
          !updateExisting
        ) {
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

            assessmentStructureItemId:
              row.data
                .assessmentStructureItemId,

            assessmentLabel:
              row.data
                .assessmentLabel,

            score:
              row.data.score,

            entryId:
              existing.id,

            issues:
              row.issues,
          });

          continue;
        }

        await updateLocal(
          "assessmentEntries",
          existing.id,
          payload as any,
        );

        existing.score =
          Number(
            row.data.score,
          );

        existing.grade =
          calculation?.grade;

        existing.remark =
          calculation?.remark;

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

          assessmentStructureItemId:
            row.data
              .assessmentStructureItemId,

          assessmentLabel:
            row.data
              .assessmentLabel,

          score:
            row.data.score,

          entryId:
            existing.id,

          issues:
            row.issues,
        });

        continue;
      }

      // ==================================================
      // CREATE
      // ==================================================

      const result =
        await createLocal(
          "assessmentEntries",
          payload as any,
        );

      const entryId =
        createdId(result);

      existingEntries.push({
        id:
          entryId ||
          `pending:${row.data.studentId}:${row.data.assessmentStructureItemId}`,

        accountId:
          context.accountId,

        schoolId:
          context.schoolId,

        branchId:
          context.branchId,

        classSubjectId:
          context.classSubjectId,

        organizationId:
          context.organizationId,

        academicStructureId:
          context.academicStructureId,

        academicPeriodId:
          context.academicPeriodId,

        gradingStructureId:
          context.gradingStructureId,

        assessmentStructureId:
          context.assessmentStructureId,

        assessmentStructureItemId:
          row.data
            .assessmentStructureItemId,

        studentId:
          row.data.studentId,

        classId:
          context.classId,

        subjectId:
          context.subjectId,

        score:
          Number(
            row.data.score,
          ),

        grade:
          calculation?.grade,

        remark:
          calculation?.remark,

        published:
          false,

        locked:
          false,

        active:
          true,

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

        assessmentStructureItemId:
          row.data
            .assessmentStructureItemId,

        assessmentLabel:
          row.data
            .assessmentLabel,

        score:
          row.data.score,

        entryId:
          entryId ||
          undefined,

        issues:
          row.issues,
      });
    } catch (error) {
      failed += 1;

      const message =
        error instanceof Error
          ? error.message
          : "Failed to import assessment score.";

      results.push({
        rowNumber:
          row.rowNumber,

        action:
          "failed",

        studentId:
          row.data.studentId,

        studentName:
          row.data.studentName,

        assessmentStructureItemId:
          row.data
            .assessmentStructureItemId,

        assessmentLabel:
          row.data
            .assessmentLabel,

        score:
          row.data.score,

        entryId:
          row.existingEntry
            ?.id,

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
    totalScoreCells:
      validation.rows.length,

    created,
    updated,
    deleted,
    skipped,
    failed,

    studentsProcessed:
      new Set(
        validation.rows
          .map(
            (row) =>
              row.data.studentId,
          )
          .filter(Boolean),
      ).size,

    calculations,

    rows:
      results,
  };
}