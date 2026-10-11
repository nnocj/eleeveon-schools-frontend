/**
 * app/lib/excel/excelWorkbook.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — WORKBOOK READER / WRITER
 * --------------------------------------------------------------------------
 *
 * Shared browser-compatible workbook infrastructure.
 *
 * Responsibilities:
 * - read .xlsx/.xls files;
 * - expose sheets as simple matrices;
 * - extract source columns and records;
 * - create downloadable .xlsx workbooks;
 * - support reusable Eleeveon templates.
 *
 * This file is intentionally domain-agnostic.
 */

import * as XLSX from "xlsx";

import type {
  ExcelCellValue,
  ExcelExportSheet,
  ExcelExportWorkbook,
  ExcelParsedSheet,
  ExcelRawRow,
  ExcelReadOptions,
  ExcelSheetInfo,
  ExcelSheetRecords,
  ExcelSourceColumn,
  ParsedExcelWorkbook,
} from "./excelTypes";

import {
  excelColumnLetter,
  isExcelRowEmpty,
  normalizeExcelCell,
  normalizeExcelHeader,
  safeExcelFileName,
  safeExcelSheetName,
  trimExcelString,
} from "./excelUtils";

function normalizeMatrix(
  rows: unknown[][],
  options?: {
    trimStrings?: boolean;
  },
): ExcelRawRow[] {
  return rows.map((row) =>
    row.map((cell) =>
      normalizeExcelCell(cell, {
        trimStrings: options?.trimStrings,
      }),
    ),
  );
}

function worksheetToRows(
  worksheet: XLSX.WorkSheet,
): ExcelRawRow[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    worksheet,
    {
      header: 1,
      defval: null,
      raw: true,
      blankrows: true,
    },
  );

  return normalizeMatrix(rows, {
    trimStrings: true,
  });
}

function rowColumnCount(rows: ExcelRawRow[]): number {
  return rows.reduce(
    (largest, row) => Math.max(largest, row.length),
    0,
  );
}

export function workbookSheetInfo(
  workbook: XLSX.WorkBook,
): ExcelSheetInfo[] {
  return workbook.SheetNames.map((name, index) => {
    const worksheet = workbook.Sheets[name];
    const rows = worksheet
      ? worksheetToRows(worksheet)
      : [];

    return {
      name,
      index,
      rowCount: rows.length,
      columnCount: rowColumnCount(rows),
      hidden:
        workbook.Workbook?.Sheets?.[index]?.Hidden ===
        1,
    };
  });
}

export function parseExcelArrayBuffer(
  buffer: ArrayBuffer,
  options?: {
    fileName?: string;
  },
): ParsedExcelWorkbook {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellText: false,
    cellNF: false,
  });

  const sheets: ExcelParsedSheet[] =
    workbook.SheetNames.map((name, index) => {
      const worksheet = workbook.Sheets[name];

      const rows = worksheet
        ? worksheetToRows(worksheet)
        : [];

      return {
        name,
        index,
        rows,
        rowCount: rows.length,
        columnCount: rowColumnCount(rows),
      };
    });

  return {
    fileName: options?.fileName,
    sheetNames: [...workbook.SheetNames],
    sheets,
  };
}

export async function parseExcelFile(
  file: File,
): Promise<ParsedExcelWorkbook> {
  if (!file) {
    throw new Error("No Excel file was provided.");
  }

  const supported =
    /\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name);

  if (!supported) {
    throw new Error(
      "Unsupported file type. Please choose an Excel workbook.",
    );
  }

  const buffer = await file.arrayBuffer();

  return parseExcelArrayBuffer(buffer, {
    fileName: file.name,
  });
}

export function getParsedSheet(
  workbook: ParsedExcelWorkbook,
  sheetNameOrIndex?: string | number,
): ExcelParsedSheet | undefined {
  if (
    sheetNameOrIndex === undefined ||
    sheetNameOrIndex === null
  ) {
    return workbook.sheets[0];
  }

  if (typeof sheetNameOrIndex === "number") {
    return workbook.sheets[sheetNameOrIndex];
  }

  return workbook.sheets.find(
    (sheet) => sheet.name === sheetNameOrIndex,
  );
}

export function discoverSourceColumns(
  headerRow: ExcelRawRow,
): ExcelSourceColumn[] {
  const usedHeaders = new Map<string, number>();

  return headerRow.map((value, index) => {
    let header = trimExcelString(value);

    if (!header) {
      header = `Column ${excelColumnLetter(index)}`;
    }

    /**
     * Duplicate spreadsheet headers are legal in the real world.
     * Internally we make them distinct so records are not overwritten.
     *
     * Example:
     * Score
     * Score (2)
     */
    const normalizedBase =
      normalizeExcelHeader(header);

    const seen =
      usedHeaders.get(normalizedBase) || 0;

    usedHeaders.set(normalizedBase, seen + 1);

    if (seen > 0) {
      header = `${header} (${seen + 1})`;
    }

    return {
      index,
      header,
      normalizedHeader: normalizeExcelHeader(header),
      columnLetter: excelColumnLetter(index),
    };
  });
}

export function sheetToRecords(
  sheet: ExcelParsedSheet,
  options?: ExcelReadOptions,
): ExcelSheetRecords {
  const headerRowIndex =
    Math.max(0, options?.headerRowIndex ?? 0);

  const dataRowOffset =
    Math.max(0, options?.dataRowOffset ?? 0);

  const skipEmptyRows =
    options?.skipEmptyRows !== false;

  const trimStrings =
    options?.trimStrings !== false;

  const headerRow =
    sheet.rows[headerRowIndex] || [];

  const columns =
    discoverSourceColumns(headerRow);

  const records: Record<
    string,
    ExcelCellValue
  >[] = [];

  const rowNumbers: number[] = [];

  const dataStartIndex =
    headerRowIndex + 1 + dataRowOffset;

  for (
    let rowIndex = dataStartIndex;
    rowIndex < sheet.rows.length;
    rowIndex += 1
  ) {
    const rawRow =
      sheet.rows[rowIndex] || [];

    if (
      skipEmptyRows &&
      isExcelRowEmpty(rawRow)
    ) {
      continue;
    }

    const record: Record<
      string,
      ExcelCellValue
    > = {};

    columns.forEach((column) => {
      record[column.header] =
        normalizeExcelCell(
          rawRow[column.index],
          {
            trimStrings,
          },
        );
    });

    records.push(record);

    /**
     * Excel displays rows starting at 1.
     */
    rowNumbers.push(rowIndex + 1);
  }

  return {
    sheetName: sheet.name,
    headerRowIndex,
    columns,
    records,
    rowNumbers,
  };
}

/**
 * Attempts to detect a likely header row.
 *
 * The scoring strategy prefers rows with:
 * - multiple non-empty cells;
 * - text-like values;
 * - mostly unique values.
 *
 * This is intentionally generic. Domain-specific modules can override the
 * result when they know their template format.
 */
export function detectLikelyHeaderRow(
  sheet: ExcelParsedSheet,
  options?: {
    searchRows?: number;
    minimumNonEmptyCells?: number;
  },
): number {
  const searchRows =
    Math.max(
      1,
      options?.searchRows ?? 15,
    );

  const minimumNonEmptyCells =
    Math.max(
      1,
      options?.minimumNonEmptyCells ?? 2,
    );

  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  const maxRows = Math.min(
    sheet.rows.length,
    searchRows,
  );

  for (
    let index = 0;
    index < maxRows;
    index += 1
  ) {
    const row = sheet.rows[index] || [];

    const values = row
      .map((value) => trimExcelString(value))
      .filter(Boolean);

    if (
      values.length < minimumNonEmptyCells
    ) {
      continue;
    }

    const uniqueCount =
      new Set(
        values.map(normalizeExcelHeader),
      ).size;

    const textCount = row.filter(
      (value) =>
        typeof value === "string" &&
        value.trim(),
    ).length;

    const duplicatePenalty =
      values.length - uniqueCount;

    const score =
      values.length * 3 +
      textCount * 2 -
      duplicatePenalty * 3 -
      index * 0.15;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function exportSheetMatrix<T>(
  definition: ExcelExportSheet<T>,
): {
  worksheet: XLSX.WorkSheet;
  headerRowIndex: number;
} {
  const preambleRows =
    definition.preambleRows || [];

  const spacing =
    Math.max(
      0,
      definition.preambleSpacing ?? 1,
    );

  const matrix: ExcelRawRow[] = [];

  preambleRows.forEach((row) => {
    matrix.push(row);
  });

  if (preambleRows.length) {
    for (
      let index = 0;
      index < spacing;
      index += 1
    ) {
      matrix.push([]);
    }
  }

  const headerRowIndex =
    matrix.length;

  matrix.push(
    definition.columns.map(
      (column) => column.header,
    ),
  );

  definition.rows.forEach(
    (row, rowIndex) => {
      matrix.push(
        definition.columns.map((column) => {
          if (column.value) {
            return column.value(
              row,
              rowIndex,
            );
          }

          return (
            row as Record<string, unknown>
          )[column.key] as ExcelCellValue;
        }),
      );
    },
  );

  const worksheet =
    XLSX.utils.aoa_to_sheet(matrix);

  worksheet["!cols"] =
    definition.columns.map((column) => ({
      wch: Math.max(
        8,
        column.width ??
          Math.min(
            40,
            Math.max(
              column.header.length + 2,
              12,
            ),
          ),
      ),
    }));

  /**
   * SheetJS Community Edition does not guarantee full freeze-pane support
   * across every writer/reader combination, so the property is attached in
   * a non-invasive way. Excel-compatible readers may honor it.
   */
  if (definition.freezeHeader) {
    (worksheet as any)["!freeze"] = {
      xSplit: 0,
      ySplit: headerRowIndex + 1,
      topLeftCell: `A${headerRowIndex + 2}`,
      activePane: "bottomLeft",
      state: "frozen",
    };
  }

  return {
    worksheet,
    headerRowIndex,
  };
}

export function buildExcelWorkbook(
  definition: ExcelExportWorkbook,
): XLSX.WorkBook {
  const workbook =
    XLSX.utils.book_new();

  const usedSheetNames =
    new Set<string>();

  definition.sheets.forEach(
    (sheet, index) => {
      let sheetName =
        safeExcelSheetName(
          sheet.name,
          `Sheet${index + 1}`,
        );

      const originalSheetName =
        sheetName;

      let duplicateNumber = 2;

      while (
        usedSheetNames.has(
          sheetName.toLowerCase(),
        )
      ) {
        const suffix =
          ` ${duplicateNumber}`;

        sheetName =
          `${originalSheetName.slice(
            0,
            Math.max(
              1,
              31 - suffix.length,
            ),
          )}${suffix}`;

        duplicateNumber += 1;
      }

      usedSheetNames.add(
        sheetName.toLowerCase(),
      );

      const { worksheet } =
        exportSheetMatrix(sheet);

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        sheetName,
      );
    },
  );

  return workbook;
}

export function writeExcelWorkbookArray(
  definition: ExcelExportWorkbook,
): ArrayBuffer {
  const workbook =
    buildExcelWorkbook(definition);

  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
  });
}

export function downloadExcelWorkbook(
  definition: ExcelExportWorkbook,
): void {
  if (typeof window === "undefined") {
    throw new Error(
      "Excel download is only available in the browser.",
    );
  }

  const workbook =
    buildExcelWorkbook(definition);

  const fileName =
    safeExcelFileName(
      definition.fileName,
    );

  XLSX.writeFile(workbook, fileName, {
    compression: true,
  });
}