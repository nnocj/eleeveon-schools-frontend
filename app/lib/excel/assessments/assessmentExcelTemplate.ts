/**
 * app/lib/excel/assessments/assessmentExcelTemplate.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ASSESSMENT TEMPLATE GENERATOR
 * --------------------------------------------------------------------------
 *
 * Generates a controlled Eleeveon assessment workbook.
 *
 * Workbook:
 *
 * Sheet 1: Assessment Entry
 *   Eleeveon Student ID
 *   Admission Number
 *   Student Name
 *   <projected editable assessment columns...>
 *
 * Sheet 2: _Eleeveon_Metadata
 *   deterministic context and item-ID metadata.
 *
 * IMPORTANT:
 * The caller must supply projectedColumns from the SAME editable projection
 * used by AssessmentEntries.tsx.
 */

import type {
  ExcelExportColumn,
  ExcelExportWorkbook,
} from "../excelTypes";

import {
  downloadExcelWorkbook,
} from "../excelWorkbook";

import type {
  AssessmentExcelContext,
  AssessmentExcelMetadata,
  AssessmentExcelProjectedColumn,
  AssessmentExcelStudentReference,
} from "./assessmentExcelTypes";

// ======================================================
// TYPES
// ======================================================

interface AssessmentTemplateRow
  extends Record<string, string | number | undefined> {
  studentId: string;
  admissionNumber: string;
  studentName: string;
}

interface MetadataRow {
  key: string;
  value: string | number;
}

// ======================================================
// HELPERS
// ======================================================

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safeFilePart(value: unknown) {
  return text(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function scoreColumnKey(itemId: string) {
  return `score:${itemId}`;
}

function scoreHeader(
  column: AssessmentExcelProjectedColumn,
) {
  const label =
    column.compactLabel ||
    column.label;

  if (
    Number.isFinite(column.maxScore)
  ) {
    return `${label} (${column.maxScore})`;
  }

  return label;
}

function metadataFromContext(
  context: AssessmentExcelContext,
  sheetName: string,
): AssessmentExcelMetadata {
  return {
    templateKind:
      "eleeveon-assessment",

    templateVersion: 1,

    generatedAt:
      new Date().toISOString(),

    accountId:
      context.accountId,

    schoolId:
      context.schoolId,

    branchId:
      context.branchId,

    classSubjectId:
      context.classSubjectId,

    classId:
      context.classId,

    subjectId:
      context.subjectId,

    academicStructureId:
      context.academicStructureId,

    academicPeriodId:
      context.academicPeriodId,

    assessmentStructureId:
      context.assessmentStructureId,

    gradingStructureId:
      context.gradingStructureId,

    organizationId:
      context.organizationId,

    sheetName,
  };
}

function metadataRows(
  metadata: AssessmentExcelMetadata,
  projectedColumns: AssessmentExcelProjectedColumn[],
): MetadataRow[] {
  const rows: MetadataRow[] = [
    {
      key: "templateKind",
      value: metadata.templateKind,
    },
    {
      key: "templateVersion",
      value: metadata.templateVersion,
    },
    {
      key: "generatedAt",
      value: metadata.generatedAt || "",
    },

    {
      key: "accountId",
      value: metadata.accountId,
    },
    {
      key: "schoolId",
      value: metadata.schoolId,
    },
    {
      key: "branchId",
      value: metadata.branchId,
    },

    {
      key: "classSubjectId",
      value: metadata.classSubjectId,
    },
    {
      key: "classId",
      value: metadata.classId,
    },
    {
      key: "subjectId",
      value: metadata.subjectId,
    },

    {
      key: "academicStructureId",
      value: metadata.academicStructureId,
    },
    {
      key: "academicPeriodId",
      value: metadata.academicPeriodId,
    },

    {
      key: "assessmentStructureId",
      value: metadata.assessmentStructureId,
    },

    {
      key: "gradingStructureId",
      value: metadata.gradingStructureId || "",
    },

    {
      key: "organizationId",
      value: metadata.organizationId || "",
    },

    {
      key: "sheetName",
      value: metadata.sheetName,
    },
  ];

  /**
   * Three identity columns come before assessment score columns.
   *
   * 0 = Student ID
   * 1 = Admission Number
   * 2 = Student Name
   *
   * Therefore the first assessment column starts at index 3.
   */
  projectedColumns.forEach(
    (column, index) => {
      const sheetColumnIndex =
        index + 3;

      const prefix =
        `assessmentColumn.${sheetColumnIndex}`;

      rows.push(
        {
          key: `${prefix}.itemId`,
          value: column.itemId,
        },
        {
          key: `${prefix}.label`,
          value: column.label,
        },
        {
          key: `${prefix}.maxScore`,
          value: column.maxScore,
        },
        {
          key: `${prefix}.weight`,
          value: column.weight ?? 0,
        },
      );
    },
  );

  return rows;
}

// ======================================================
// TEMPLATE GENERATOR
// ======================================================

export function buildAssessmentExcelTemplate(args: {
  context: AssessmentExcelContext;

  students: AssessmentExcelStudentReference[];

  projectedColumns: AssessmentExcelProjectedColumn[];

  /**
   * Optional existing scores:
   *
   * studentId -> itemId -> score
   *
   * Allows the same generator to export an existing mark sheet.
   */
  scores?: Record<
    string,
    Record<string, number | undefined>
  >;

  fileName?: string;
}): ExcelExportWorkbook {
  const {
    context,
    students,
    projectedColumns,
    scores = {},
  } = args;

  if (!projectedColumns.length) {
    throw new Error(
      "Cannot build an assessment workbook because there are no editable assessment columns.",
    );
  }

  const assessmentSheetName =
    "Assessment Entry";

  const metadata =
    metadataFromContext(
      context,
      assessmentSheetName,
    );

  const columns: ExcelExportColumn<AssessmentTemplateRow>[] =
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

      ...projectedColumns.map(
        (
          column,
        ): ExcelExportColumn<AssessmentTemplateRow> => ({
          key:
            scoreColumnKey(
              column.itemId,
            ),

          header:
            scoreHeader(column),

          width: Math.max(
            12,
            Math.min(
              28,
              (
                column.compactLabel ||
                column.label
              ).length + 5,
            ),
          ),
        }),
      ),
    ];

  const rows:
    AssessmentTemplateRow[] =
    students.map((student) => {
      const row:
        AssessmentTemplateRow =
        {
          studentId:
            student.id,

          admissionNumber:
            student.admissionNumber ||
            "",

          studentName:
            student.fullName,
        };

      projectedColumns.forEach(
        (column) => {
          const score =
            scores[
              student.id
            ]?.[
              column.itemId
            ];

          row[
            scoreColumnKey(
              column.itemId,
            )
          ] =
            score === undefined
              ? ""
              : score;
        },
      );

      return row;
    });

  const metadataData =
    metadataRows(
      metadata,
      projectedColumns,
    );

  const fileParts = [
    "Eleeveon Assessment",
    context.className,
    context.subjectName ||
      context.subjectCode,
    context.academicPeriodName,
  ]
    .map(safeFilePart)
    .filter(Boolean);

  return {
    fileName:
      args.fileName ||
      `${fileParts.join(" - ") || "Eleeveon Assessment"}.xlsx`,

    sheets: [
      {
        name:
          assessmentSheetName,

        preambleRows: [
          [
            "ELEEVEON ASSESSMENT ENTRY",
          ],

          context.schoolName
            ? [
                "School",
                context.schoolName,
              ]
            : [],

          context.branchName
            ? [
                "Branch",
                context.branchName,
              ]
            : [],

          context.className
            ? [
                "Class",
                context.className,
              ]
            : [],

          context.subjectName
            ? [
                "Subject",
                context.subjectName,
              ]
            : [],

          context.academicPeriodName
            ? [
                "Academic Period",
                context.academicPeriodName,
              ]
            : [],

          [
            "Instructions",
            "Enter scores only in the assessment columns. Do not rename or reorder columns when using this Eleeveon template.",
          ],
        ].filter(
          (row) =>
            row.length > 0,
        ),

        preambleSpacing: 1,

        freezeHeader: true,

        columns,

        rows,
      },

      {
        name:
          "_Eleeveon_Metadata",

        freezeHeader: true,

        columns: [
          {
            key: "key",
            header: "Key",
            width: 40,
          },
          {
            key: "value",
            header: "Value",
            width: 50,
          },
        ],

        rows:
          metadataData,
      },
    ],
  };
}

// ======================================================
// DOWNLOAD
// ======================================================

export function downloadAssessmentExcelTemplate(
  args: Parameters<
    typeof buildAssessmentExcelTemplate
  >[0],
) {
  return downloadExcelWorkbook(
    buildAssessmentExcelTemplate(args),
  );
}