/**
 * app/lib/excel/assessments/protectedAssessmentWorkbook.ts
 * Protected Eleeveon assessment XLSX writer.
 * Requires: npm install exceljs
 *
 * Keeps the original template's column positions and metadata keys intact,
 * so parseControlledAssessmentWorkbook continues to work unchanged.
 * Workbook protection is for accidental edits, NOT a security boundary.
 */

import type { ExcelExportWorkbook, ExcelExportSheet } from "../excelTypes";

const NAVY = "19345C";
const BLUE = "DDEBFF";
const GREY = "EDF0F4";
const GREEN = "E5F5E9";
const AMBER = "FFF1CF";
const WHITE = "FFFFFF";
const BORDER = "D6DEE9";

function safeName(name: string, fallback: string) {
  return String(name || fallback).replace(/[\\/*?:\[\]]/g, "-").slice(0, 31) || fallback;
}

function asCellValue(value: unknown): string | number | boolean | Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  return String(value);
}

export async function downloadProtectedAssessmentWorkbook(definition: ExcelExportWorkbook): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("Assessment Excel export is available in the browser only.");
  }

  // Loaded only when exporting; avoids adding ExcelJS to the initial portal bundle.
  const imported = await import("exceljs");
  const ExcelJS = imported.default ?? imported;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Eleeveon Schools";
  workbook.subject = "Protected assessment entry";
  workbook.created = new Date();

  for (const [sheetIndex, definitionSheet] of definition.sheets.entries()) {
    const isMetadata = definitionSheet.name === "_Eleeveon_Metadata";
    const sheet = workbook.addWorksheet(
      safeName(definitionSheet.name, `Sheet${sheetIndex + 1}`),
      { views: [{ state: "frozen", xSplit: isMetadata ? 0 : 3, ySplit: 1 }] },
    );

    const preamble = definitionSheet.preambleRows ?? [];
    for (const row of preamble) sheet.addRow(row.map(asCellValue));
    if (preamble.length) {
      for (let i = 0; i < Math.max(0, definitionSheet.preambleSpacing ?? 1); i++) sheet.addRow([]);
    }

    const headerNumber = sheet.rowCount + 1;
    sheet.addRow(definitionSheet.columns.map((column) => column.header));
    sheet.views = [{ state: "frozen", xSplit: isMetadata ? 0 : 3, ySplit: headerNumber }];

    for (const [rowIndex, record] of definitionSheet.rows.entries()) {
      sheet.addRow(definitionSheet.columns.map((column) =>
        asCellValue(column.value ? column.value(record, rowIndex) : (record as Record<string, unknown>)[column.key]),
      ));
    }

    definitionSheet.columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = Math.max(10, column.width ?? 16);
    });

    sheet.eachRow((row: any, number: number) => {
      row.height = number === headerNumber ? 29 : 23;
      row.eachCell({ includeEmpty: true }, (cell: any, col: number) => {
        cell.border = {
          bottom: { style: "hair", color: { argb: BORDER } },
        };
        cell.alignment = { vertical: "middle", wrapText: number <= headerNumber };
        cell.protection = { locked: true };

        if (number === headerNumber) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
          cell.font = { color: { argb: WHITE }, bold: true };
        } else if (number < headerNumber) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: number === 1 ? BLUE : GREY } };
          if (number === 1) cell.font = { bold: true, size: 14, color: { argb: NAVY } };
          else if (String(row.getCell(1).value ?? "").toLowerCase() === "instructions") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER } };
          }
        } else if (!isMetadata) {
          if (col <= 3) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
            cell.font = { color: { argb: NAVY } };
          } else {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
            cell.protection = { locked: false };
            cell.alignment = { horizontal: "center", vertical: "middle" };
            cell.numFmt = "0.##";
          }
        }
      });
    });

    if (!isMetadata) {
      // Student UUID remains at A, preserving the existing parser's mapping,
      // but is not shown to teachers.
      sheet.getColumn(1).hidden = true;
      const lastRow = sheet.rowCount;
      if (lastRow > headerNumber) {
        for (let columnNumber = 4; columnNumber <= definitionSheet.columns.length; columnNumber++) {
          const column = definitionSheet.columns[columnNumber - 1];
          const maximum = /\((\d+(?:\.\d+)?)\)\s*$/.exec(column.header);
          if (!maximum) continue;
          const maxScore = Number(maximum[1]);
          if (!Number.isFinite(maxScore)) continue;
          sheet.getColumn(columnNumber).eachCell({ includeEmpty: true }, (cell: any, rowNumber: number) => {
            if (rowNumber <= headerNumber) return;
            cell.dataValidation = {
              type: "decimal", operator: "between", allowBlank: true,
              formulae: [0, maxScore], showErrorMessage: true,
              errorTitle: "Invalid assessment score",
              error: `Enter a number from 0 to ${maxScore}.`,
            };
          });
        }
      }
    } else {
      // Excel "veryHidden" hides the metadata tab in the normal Unhide menu.
      // It is still recoverable and must be independently validated on import.
      sheet.state = "veryHidden";
    }

    await sheet.protect("eleeveon-template", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      insertRows: false,
      deleteRows: false,
      insertColumns: false,
      deleteColumns: false,
      sort: false,
      autoFilter: false,
    });
  }

  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = definition.fileName.endsWith(".xlsx") ? definition.fileName : `${definition.fileName}.xlsx`;
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
