/**
 * app/lib/excel/excelValidation.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — GENERIC VALIDATION ENGINE
 * --------------------------------------------------------------------------
 *
 * Shared validation pipeline for spreadsheet imports.
 *
 * Responsibilities:
 * - apply column mappings;
 * - coerce generic field types;
 * - enforce required fields;
 * - call destination-provided validators;
 * - detect duplicate values inside uploaded files;
 * - produce row-level errors/warnings before any database mutation.
 *
 * Database validation belongs in the domain-specific importer.
 */

import type {
  ExcelColumnMapping,
  ExcelDuplicateGroup,
  ExcelFieldDefinition,
  ExcelMappedRecord,
  ExcelProcessedRow,
  ExcelSheetRecords,
  ExcelSourceColumn,
  ExcelValidationIssue,
  ExcelValidationOptions,
  ExcelValidationResult,
} from "./excelTypes";

import {
  coerceExcelValue,
  isCoercionValid,
  isExcelCellEmpty,
  mappedRecordIsEmpty,
  normalizedComparisonValue,
} from "./excelUtils";

import {
  mapSourceRecord,
  validateColumnMappings,
} from "./excelColumnMapper";

function asIssues(
  value:
    | ExcelValidationIssue
    | ExcelValidationIssue[]
    | null
    | undefined,
): ExcelValidationIssue[] {
  if (!value) return [];

  return Array.isArray(value)
    ? value
    : [value];
}

function fieldByKey(
  fields: ExcelFieldDefinition[],
): Map<string, ExcelFieldDefinition> {
  return new Map(
    fields.map(
      (field) => [
        field.key,
        field,
      ],
    ),
  );
}

function sourceColumnForMapping(
  records: ExcelSheetRecords,
  mapping: ExcelColumnMapping,
): ExcelSourceColumn | undefined {
  return records.columns.find(
    (column) =>
      column.index ===
        mapping.sourceIndex ||
      column.header ===
        mapping.sourceHeader,
  );
}

function genericTypeIssue(
  field: ExcelFieldDefinition,
  value: unknown,
  context: {
    rowNumber: number;
    mapping: ExcelColumnMapping;
    sourceColumn?: ExcelSourceColumn;
  },
): ExcelValidationIssue {
  return {
    code: "invalid_field_type",
    severity: "error",
    rowNumber: context.rowNumber,
    columnIndex:
      context.sourceColumn?.index,
    sourceHeader:
      context.mapping.sourceHeader,
    targetKey: field.key,
    value,
    message:
      `"${field.label}" contains a value that cannot be read as ${field.dataType}.`,
  };
}

export function findDuplicateValues(
  rows: ExcelProcessedRow[],
  key: string,
): ExcelDuplicateGroup[] {
  const values =
    new Map<
      string,
      {
        displayValue: string;
        rows: number[];
      }
    >();

  rows.forEach((row) => {
    const raw =
      row.data[key];

    const normalized =
      normalizedComparisonValue(raw);

    if (!normalized) return;

    const existing =
      values.get(normalized);

    if (existing) {
      existing.rows.push(
        row.rowNumber,
      );
    } else {
      values.set(normalized, {
        displayValue:
          String(raw ?? ""),
        rows: [row.rowNumber],
      });
    }
  });

  return Array.from(
    values.entries(),
  )
    .filter(
      ([, group]) =>
        group.rows.length > 1,
    )
    .map(
      ([normalized, group]) => ({
        key,
        value:
          group.displayValue ||
          normalized,
        rowNumbers:
          group.rows,
      }),
    );
}

/**
 * Converts one mapped source row into destination values and validates it.
 */
export function processExcelRow(
  args: {
    rowNumber: number;
    sourceRecord: Record<string, any>;
    records: ExcelSheetRecords;
    mappings: ExcelColumnMapping[];
    fields: ExcelFieldDefinition[];
    options?: ExcelValidationOptions;
  },
): ExcelProcessedRow {
  const {
    rowNumber,
    sourceRecord,
    records,
    mappings,
    fields,
    options,
  } = args;

  const issues: ExcelValidationIssue[] =
    [];

  const definitions =
    fieldByKey(fields);

  const rawMapped =
    mapSourceRecord(
      sourceRecord,
      mappings,
    );

  const mapped: ExcelMappedRecord =
    {};

  mappings.forEach((mapping) => {
    const definition =
      definitions.get(
        mapping.targetKey,
      );

    if (!definition) return;

    const sourceColumn =
      sourceColumnForMapping(
        records,
        mapping,
      );

    const rawValue =
      rawMapped[
        mapping.targetKey
      ];

    const context = {
      rowNumber,
      sourceColumn,
      mapping,
      sourceRecord,
    };

    let transformedValue: unknown =
      rawValue;

    if (definition.transform) {
      try {
        transformedValue =
          definition.transform(
            rawValue,
            context,
          );
      } catch (error) {
        issues.push({
          code: "field_transform_failed",
          severity: "error",
          rowNumber,
          columnIndex:
            sourceColumn?.index,
          sourceHeader:
            mapping.sourceHeader,
          targetKey:
            definition.key,
          value: rawValue,
          message:
            error instanceof Error
              ? error.message
              : `Failed to transform "${definition.label}".`,
        });
      }
    } else {
      transformedValue =
        coerceExcelValue(
          rawValue,
          definition.dataType ||
            "unknown",
        );
    }

    mapped[
      definition.key
    ] = transformedValue;

    if (
      options?.validateTypes !==
        false &&
      !definition.transform &&
      !isCoercionValid(
        rawValue,
        transformedValue,
        definition.dataType ||
          "unknown",
      )
    ) {
      issues.push(
        genericTypeIssue(
          definition,
          rawValue,
          {
            rowNumber,
            mapping,
            sourceColumn,
          },
        ),
      );
    }
  });

  if (
    options?.validateRequired !==
    false
  ) {
    fields
      .filter(
        (field) =>
          field.required,
      )
      .forEach((field) => {
        if (
          isExcelCellEmpty(
            mapped[field.key],
          )
        ) {
          const mapping =
            mappings.find(
              (item) =>
                item.targetKey ===
                field.key,
            );

          issues.push({
            code: "required_value_missing",
            severity: "error",
            rowNumber,
            columnIndex:
              mapping
                ? sourceColumnForMapping(
                    records,
                    mapping,
                  )?.index
                : undefined,
            sourceHeader:
              mapping?.sourceHeader,
            targetKey:
              field.key,
            message:
              `"${field.label}" is required.`,
          });
        }
      });
  }

  fields.forEach((field) => {
    if (!field.validate) return;

    const mapping =
      mappings.find(
        (item) =>
          item.targetKey === field.key,
      );

    const sourceColumn =
      mapping
        ? sourceColumnForMapping(
            records,
            mapping,
          )
        : undefined;

    try {
      const customIssues =
        asIssues(
          field.validate(
            mapped[field.key],
            {
              rowNumber,
              sourceColumn,
              mapping,
              sourceRecord,
              mappedRecord:
                mapped,
            },
          ),
        );

      customIssues.forEach(
        (issue) => {
          issues.push({
            ...issue,
            rowNumber:
              issue.rowNumber ??
              rowNumber,
            columnIndex:
              issue.columnIndex ??
              sourceColumn?.index,
            sourceHeader:
              issue.sourceHeader ??
              mapping?.sourceHeader,
            targetKey:
              issue.targetKey ??
              field.key,
          });
        },
      );
    } catch (error) {
      issues.push({
        code: "custom_validation_failed",
        severity: "error",
        rowNumber,
        columnIndex:
          sourceColumn?.index,
        sourceHeader:
          mapping?.sourceHeader,
        targetKey:
          field.key,
        value:
          mapped[field.key],
        message:
          error instanceof Error
            ? error.message
            : `Validation failed for "${field.label}".`,
      });
    }
  });

  return {
    rowNumber,
    source:
      sourceRecord,
    data: mapped,
    issues,
    valid:
      !issues.some(
        (issue) =>
          issue.severity ===
          "error",
      ),
  };
}

export function validateExcelRecords(
  records: ExcelSheetRecords,
  mappings: ExcelColumnMapping[],
  fields: ExcelFieldDefinition[],
  options?: ExcelValidationOptions,
): ExcelValidationResult {
  const mappingValidation =
    validateColumnMappings(
      mappings,
      fields,
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

  let processed =
    records.records.map(
      (sourceRecord, index) =>
        processExcelRow({
          rowNumber:
            records.rowNumbers[
              index
            ] ?? index + 2,
          sourceRecord,
          records,
          mappings,
          fields,
          options,
        }),
    );

  if (
    options?.skipEmptyMappedRows !==
    false
  ) {
    processed =
      processed.filter(
        (row) =>
          !mappedRecordIsEmpty(
            row.data,
          ),
      );
  }

  const uniqueKeys =
    options?.uniqueKeys || [];

  uniqueKeys.forEach((key) => {
    const duplicates =
      findDuplicateValues(
        processed,
        key,
      );

    duplicates.forEach(
      (duplicate) => {
        duplicate.rowNumbers.forEach(
          (rowNumber) => {
            const row =
              processed.find(
                (item) =>
                  item.rowNumber ===
                  rowNumber,
              );

            if (!row) return;

            row.issues.push({
              code: "duplicate_import_value",
              severity: "error",
              rowNumber,
              targetKey: key,
              value:
                row.data[key],
              message:
                `"${duplicate.value}" appears more than once in this workbook.`,
            });

            row.valid = false;
          },
        );
      },
    );
  });

  const issues =
    processed.flatMap(
      (row) => row.issues,
    );

  const invalidRows =
    processed.filter(
      (row) => !row.valid,
    ).length;

  const warningRows =
    processed.filter(
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
      processed.length,

    validRows:
      processed.length -
      invalidRows,

    invalidRows,

    warningRows,

    rows: processed,

    issues,
  };
}

/**
 * Allows domain-specific importers to add database-level validation issues
 * after the generic workbook validation has completed.
 *
 * Example later:
 * - duplicate admission number already exists in Dexie;
 * - student ID not found;
 * - assessment score exceeds configured maxScore;
 * - class does not belong to selected branch.
 */
export function addExcelRowIssue<T>(
  row: ExcelProcessedRow<T>,
  issue: ExcelValidationIssue,
): ExcelProcessedRow<T> {
  const issues = [
    ...row.issues,
    issue,
  ];

  return {
    ...row,
    issues,
    valid:
      !issues.some(
        (item) =>
          item.severity ===
          "error",
      ),
  };
}

export function rebuildValidationSummary<T>(
  rows: ExcelProcessedRow<T>[],
  additionalIssues: ExcelValidationIssue[] = [],
): ExcelValidationResult<T> {
  const rowIssues =
    rows.flatMap(
      (row) => row.issues,
    );

  const issues = [
    ...additionalIssues,
    ...rowIssues,
  ];

  const invalidRows =
    rows.filter(
      (row) => !row.valid,
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

  return {
    valid:
      invalidRows === 0 &&
      !additionalIssues.some(
        (issue) =>
          issue.severity ===
          "error",
      ),

    totalRows: rows.length,

    validRows:
      rows.length -
      invalidRows,

    invalidRows,

    warningRows,

    rows,

    issues,
  };
}