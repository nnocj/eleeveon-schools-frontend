/**
 * app/lib/excel/excelImportUtils.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — SHARED IMPORT PREPARATION
 * --------------------------------------------------------------------------
 *
 * Convenience orchestration around:
 *
 * workbook
 *   -> sheet
 *   -> header detection
 *   -> records
 *   -> automatic mapping
 *   -> validation
 *
 * Domain-specific modules remain responsible for:
 * - defining destination fields;
 * - database lookups;
 * - duplicate rules against Dexie;
 * - createLocal/updateLocal;
 * - business-specific validation.
 */

import type {
  ExcelColumnMapping,
  ExcelFieldDefinition,
  ExcelMappingValidationResult,
  ExcelParsedSheet,
  ExcelReadOptions,
  ExcelSheetRecords,
  ExcelValidationOptions,
  ExcelValidationResult,
  ParsedExcelWorkbook,
} from "./excelTypes";

import {
  autoMapExcelColumns,
  validateColumnMappings,
} from "./excelColumnMapper";

import {
  detectLikelyHeaderRow,
  getParsedSheet,
  sheetToRecords,
} from "./excelWorkbook";

import {
  validateExcelRecords,
} from "./excelValidation";

export interface PrepareExcelImportOptions {
  sheetNameOrIndex?: string | number;

  /**
   * Explicit header row.
   *
   * If omitted, the shared layer attempts automatic detection.
   */
  headerRowIndex?: number;

  /**
   * Search depth for automatic header detection.
   */
  headerSearchRows?: number;

  readOptions?: Omit<
    ExcelReadOptions,
    "headerRowIndex"
  >;

  minimumMappingConfidence?: number;
}

export interface PreparedExcelImport {
  sheet: ExcelParsedSheet;
  records: ExcelSheetRecords;
  mappings: ExcelColumnMapping[];
  mappingValidation: ExcelMappingValidationResult;
}

export function prepareExcelImport(
  workbook: ParsedExcelWorkbook,
  fields: ExcelFieldDefinition[],
  options?: PrepareExcelImportOptions,
): PreparedExcelImport {
  const sheet =
    getParsedSheet(
      workbook,
      options?.sheetNameOrIndex,
    );

  if (!sheet) {
    throw new Error(
      "The selected Excel worksheet could not be found.",
    );
  }

  const headerRowIndex =
    options?.headerRowIndex ??
    detectLikelyHeaderRow(
      sheet,
      {
        searchRows:
          options?.headerSearchRows,
      },
    );

  const records =
    sheetToRecords(
      sheet,
      {
        ...options?.readOptions,
        headerRowIndex,
      },
    );

  const mappings =
    autoMapExcelColumns(
      records.columns,
      fields,
      {
        minimumConfidence:
          options?.minimumMappingConfidence,
      },
    );

  const mappingValidation =
    validateColumnMappings(
      mappings,
      fields,
    );

  return {
    sheet,
    records,
    mappings,
    mappingValidation,
  };
}

export function validatePreparedExcelImport(
  prepared: PreparedExcelImport,
  fields: ExcelFieldDefinition[],
  options?: ExcelValidationOptions,
): ExcelValidationResult {
  return validateExcelRecords(
    prepared.records,
    prepared.mappings,
    fields,
    options,
  );
}