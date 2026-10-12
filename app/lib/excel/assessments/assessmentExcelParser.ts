/**
 * app/lib/excel/assessments/assessmentExcelParser.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ASSESSMENT PARSER
 * --------------------------------------------------------------------------
 *
 * Supports:
 * 1. Controlled Eleeveon assessment workbooks.
 * 2. External school assessment spreadsheets.
 *
 * Controlled workbooks use _Eleeveon_Metadata so assessment columns are
 * resolved by AssessmentStructureItem.id rather than by label.
 *
 * External spreadsheets require the caller to provide projected columns
 * and/or manually confirmed mappings.
 */

import type {
  ExcelColumnMapping,
  ExcelFieldDefinition,
  ExcelParsedSheet,
  ExcelSourceColumn,
  ParsedExcelWorkbook,
} from "../excelTypes";

import {
  autoMapExcelColumns,
} from "../excelColumnMapper";

import {
  detectLikelyHeaderRow,
  getParsedSheet,
  sheetToRecords,
} from "../excelWorkbook";

import {
  normalizeExcelHeader,
  toExcelNumber,
} from "../excelUtils";

import type {
  AssessmentExcelMetadata,
  AssessmentExcelMetadataColumn,
  AssessmentExcelParsedImport,
  AssessmentExcelProjectedColumn,
  AssessmentExcelScoreRecord,
} from "./assessmentExcelTypes";

// ======================================================
// IDENTITY FIELDS
// ======================================================

export const ASSESSMENT_STUDENT_FIELDS: ExcelFieldDefinition[] =
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
        "student number",
        "student no",
        "index number",
        "index no",
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
  ];

// ======================================================
// HELPERS
// ======================================================

function text(value: unknown) {
  return String(value ?? "").trim();
}

function valueFromMapping(
  source: Record<string, unknown>,
  mappings: ExcelColumnMapping[],
  key: string,
) {
  const mapping =
    mappings.find(
      (item) =>
        item.targetKey === key,
    );

  if (!mapping) {
    return undefined;
  }

  return source[
    mapping.sourceHeader
  ];
}

// ======================================================
// METADATA PARSING
// ======================================================

function metadataMapFromSheet(
  sheet: ExcelParsedSheet,
) {
  const map =
    new Map<string, string>();

  /**
   * Metadata sheet is generated as:
   * Key | Value
   */
  const rows =
    sheet.rows;

  for (
    let index = 1;
    index < rows.length;
    index += 1
  ) {
    const row =
      rows[index] || [];

    const key =
      text(row[0]);

    if (!key) {
      continue;
    }

    map.set(
      key,
      text(row[1]),
    );
  }

  return map;
}

export function parseAssessmentWorkbookMetadata(
  workbook: ParsedExcelWorkbook,
): {
  metadata?: AssessmentExcelMetadata;
  columns: AssessmentExcelMetadataColumn[];
} {
  const metadataSheet =
    getParsedSheet(
      workbook,
      "_Eleeveon_Metadata",
    );

  if (!metadataSheet) {
    return {
      metadata: undefined,
      columns: [],
    };
  }

  const map =
    metadataMapFromSheet(
      metadataSheet,
    );

  if (
    map.get("templateKind") !==
    "eleeveon-assessment"
  ) {
    return {
      metadata: undefined,
      columns: [],
    };
  }

  const metadata:
    AssessmentExcelMetadata =
    {
      templateKind:
        "eleeveon-assessment",

      templateVersion: 1,

      generatedAt:
        map.get("generatedAt") ||
        undefined,

      accountId:
        map.get("accountId") ||
        "",

      schoolId:
        map.get("schoolId") ||
        "",

      branchId:
        map.get("branchId") ||
        "",

      classSubjectId:
        map.get(
          "classSubjectId",
        ) || "",

      classId:
        map.get("classId") ||
        "",

      subjectId:
        map.get("subjectId") ||
        "",

      academicStructureId:
        map.get(
          "academicStructureId",
        ) || "",

      academicPeriodId:
        map.get(
          "academicPeriodId",
        ) || "",

      assessmentStructureId:
        map.get(
          "assessmentStructureId",
        ) || "",

      gradingStructureId:
        map.get(
          "gradingStructureId",
        ) || undefined,

      organizationId:
        map.get(
          "organizationId",
        ) || undefined,

      sheetName:
        map.get("sheetName") ||
        "Assessment Entry",
    };

  const columnIndexes =
    new Set<number>();

  map.forEach(
    (_, key) => {
      const match =
        /^assessmentColumn\.(\d+)\.itemId$/.exec(
          key,
        );

      if (match) {
        columnIndexes.add(
          Number(match[1]),
        );
      }
    },
  );

  const columns:
    AssessmentExcelMetadataColumn[] =
    Array.from(columnIndexes)
      .sort(
        (a, b) =>
          a - b,
      )
      .map((sheetColumnIndex) => {
        const prefix =
          `assessmentColumn.${sheetColumnIndex}`;

        return {
          sheetColumnIndex,

          itemId:
            map.get(
              `${prefix}.itemId`,
            ) || "",

          label:
            map.get(
              `${prefix}.label`,
            ) || "",

          maxScore:
            Number(
              map.get(
                `${prefix}.maxScore`,
              ) || 0,
            ),

          weight:
            Number(
              map.get(
                `${prefix}.weight`,
              ) || 0,
            ),
        };
      })
      .filter(
        (column) =>
          Boolean(
            column.itemId,
          ),
      );

  return {
    metadata,
    columns,
  };
}

// ======================================================
// CONTROLLED WORKBOOK
// ======================================================

export function parseControlledAssessmentWorkbook(args: {
  workbook: ParsedExcelWorkbook;

  /**
   * Normally metadata.sheetName is used.
   */
  sheetName?: string;

  /**
   * Explicit header row can be supplied by the UI.
   */
  headerRowIndex?: number;
}): AssessmentExcelParsedImport {
  const metadataResult =
    parseAssessmentWorkbookMetadata(
      args.workbook,
    );

  if (!metadataResult.metadata) {
    throw new Error(
      "This workbook does not contain valid Eleeveon assessment metadata.",
    );
  }

  const sheet =
    getParsedSheet(
      args.workbook,
      args.sheetName ||
        metadataResult.metadata
          .sheetName,
    );

  if (!sheet) {
    throw new Error(
      "The assessment-entry worksheet referenced by this workbook could not be found.",
    );
  }

  const headerRowIndex =
    args.headerRowIndex ??
    detectLikelyHeaderRow(
      sheet,
    );

  const extracted =
    sheetToRecords(
      sheet,
      {
        headerRowIndex,
        skipEmptyRows: true,
        trimStrings: true,
      },
    );

  const mappings =
    autoMapExcelColumns(
      extracted.columns,
      ASSESSMENT_STUDENT_FIELDS,
    );

  const scoreRecords:
    AssessmentExcelScoreRecord[] =
    [];

  extracted.records.forEach(
    (
      source,
      recordIndex,
    ) => {
      const rowNumber =
        extracted.rowNumbers[
          recordIndex
        ] ??
        recordIndex +
          headerRowIndex +
          2;

      const studentId =
        text(
          valueFromMapping(
            source,
            mappings,
            "studentId",
          ),
        ) || undefined;

      const admissionNumber =
        text(
          valueFromMapping(
            source,
            mappings,
            "admissionNumber",
          ),
        ) || undefined;

      const studentName =
        text(
          valueFromMapping(
            source,
            mappings,
            "studentName",
          ),
        ) || undefined;

      metadataResult.columns.forEach(
        (column) => {
          const sourceColumn =
            extracted.columns.find(
              (candidate) =>
                candidate.index ===
                column.sheetColumnIndex,
            );

          if (!sourceColumn) {
            return;
          }

          const raw =
            source[
              sourceColumn.header
            ];

          const blank =
            raw === null ||
            raw === undefined ||
            text(raw) === "";

          const score =
            blank
              ? undefined
              : toExcelNumber(raw);

          scoreRecords.push({
            studentId,
            admissionNumber,
            studentName,

            assessmentStructureItemId:
              column.itemId,

            assessmentLabel:
              column.label,

            score,

            blank,

            maxScore:
              column.maxScore,

            weight:
              column.weight,

            rowNumber,

            columnIndex:
              column.sheetColumnIndex,
          });
        },
      );
    },
  );

  return {
    kind:
      "eleeveon-assessment",

    sheetName:
      sheet.name,

    headerRowIndex,

    metadata:
      metadataResult.metadata,

    metadataColumns:
      metadataResult.columns,

    mappings,

    scoreRecords,
  };
}

// ======================================================
// EXTERNAL WORKBOOK
// ======================================================

/**
 * External spreadsheets do not have Eleeveon metadata.
 *
 * The UI/caller supplies the active assessment context and the currently
 * projected editable assessment columns.
 *
 * Assessment columns are matched by normalized visible labels. Any uncertain
 * mapping should be confirmed by the UI before import.
 */
export function parseExternalAssessmentSheet(args: {
  sheet: ExcelParsedSheet;

  projectedColumns: AssessmentExcelProjectedColumn[];

  headerRowIndex?: number;

  identityMappings?: ExcelColumnMapping[];

  /**
   * Optional manually-confirmed map:
   *
   * source column index -> AssessmentStructureItem.id
   */
  assessmentColumnMappings?: Record<number, string>;
}): AssessmentExcelParsedImport {
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
    args.identityMappings?.length
      ? args.identityMappings
      : autoMapExcelColumns(
          extracted.columns,
          ASSESSMENT_STUDENT_FIELDS,
        );

  const identityIndexes =
    new Set(
      mappings.map(
        (mapping) =>
          mapping.sourceIndex,
      ),
    );

  const projectedById =
    new Map(
      args.projectedColumns.map(
        (column) => [
          column.itemId,
          column,
        ],
      ),
    );

  const metadataColumns:
    AssessmentExcelMetadataColumn[] =
    [];

  extracted.columns.forEach(
    (sourceColumn) => {
      if (
        identityIndexes.has(
          sourceColumn.index,
        )
      ) {
        return;
      }

      const manuallyMappedId =
        args.assessmentColumnMappings?.[
          sourceColumn.index
        ];

      let projected =
        manuallyMappedId
          ? projectedById.get(
              manuallyMappedId,
            )
          : undefined;

      if (!projected) {
        const normalized =
          normalizeExcelHeader(
            sourceColumn.header,
          );

        const matches =
          args.projectedColumns.filter(
            (column) => {
              const possibleLabels = [
                column.label,
                column.compactLabel,
                ...(column.pathLabels ||
                  []),
              ]
                .filter(Boolean)
                .map(
                  normalizeExcelHeader,
                );

              return possibleLabels.some(
                (label) =>
                  normalized ===
                    label ||
                  normalized.startsWith(
                    `${label} `,
                  ),
              );
            },
          );

        if (
          matches.length === 1
        ) {
          projected =
            matches[0];
        }
      }

      if (!projected) {
        return;
      }

      metadataColumns.push({
        sheetColumnIndex:
          sourceColumn.index,

        itemId:
          projected.itemId,

        label:
          projected.label,

        maxScore:
          projected.maxScore,

        weight:
          projected.weight,
      });
    },
  );

  const scoreRecords:
    AssessmentExcelScoreRecord[] =
    [];

  extracted.records.forEach(
    (
      source,
      recordIndex,
    ) => {
      const rowNumber =
        extracted.rowNumbers[
          recordIndex
        ] ??
        recordIndex +
          headerRowIndex +
          2;

      const studentId =
        text(
          valueFromMapping(
            source,
            mappings,
            "studentId",
          ),
        ) || undefined;

      const admissionNumber =
        text(
          valueFromMapping(
            source,
            mappings,
            "admissionNumber",
          ),
        ) || undefined;

      const studentName =
        text(
          valueFromMapping(
            source,
            mappings,
            "studentName",
          ),
        ) || undefined;

      metadataColumns.forEach(
        (column) => {
          const sourceColumn =
            extracted.columns.find(
              (candidate) =>
                candidate.index ===
                column.sheetColumnIndex,
            );

          if (!sourceColumn) {
            return;
          }

          const raw =
            source[
              sourceColumn.header
            ];

          const blank =
            raw === null ||
            raw === undefined ||
            text(raw) === "";

          scoreRecords.push({
            studentId,
            admissionNumber,
            studentName,

            assessmentStructureItemId:
              column.itemId,

            assessmentLabel:
              column.label,

            score:
              blank
                ? undefined
                : toExcelNumber(
                    raw,
                  ),

            blank,

            maxScore:
              column.maxScore,

            weight:
              column.weight,

            rowNumber,

            columnIndex:
              sourceColumn.index,
          });
        },
      );
    },
  );

  return {
    kind:
      "external-assessment",

    sheetName:
      extracted.sheetName,

    headerRowIndex,

    metadata:
      undefined,

    metadataColumns,

    mappings,

    scoreRecords,
  };
}