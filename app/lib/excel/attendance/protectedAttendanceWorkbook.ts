/**
 * Eleeveon attendance XLSX writer. Styling/worksheet locking prevents ordinary
 * accidental changes; import validation is still mandatory for security.
 * The existing parser continues to read the same column order and headers.
 * Requires ExcelJS, already used by the assessment and student exporters.
 */
import type { ExcelExportWorkbook } from "../excelTypes";

const PALETTE = {
  navy: "FF19345C", blue: "FFDDEBFF", grey: "FFEDF0F4",
  green: "FFE5F5E9", amber: "FFFFF1CF", white: "FFFFFFFF",
  border: "FFD6DEE9", ink: "FF19345C",
};

function valueOf(value: unknown): string | number | boolean | Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return value as string | number | boolean;
  }
  return String(value);
}

export async function downloadProtectedAttendanceWorkbook(
  definition: ExcelExportWorkbook,
): Promise<void> {
  if (typeof document === "undefined") throw new Error("Excel export requires a browser.");
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const book = new ExcelJS.Workbook();
  book.creator = "Eleeveon Schools";
  book.subject = "Protected student attendance";

  for (const definitionSheet of definition.sheets) {
    const sheet = book.addWorksheet(definitionSheet.name.slice(0, 31));
    const names = definitionSheet.columns.map(col => col.key);
    const daily = names.includes("status");
    const term = names.includes("daysOpened");
    const firstEditable = term ? 4 : daily ? 5 : 4;
    const preamble = (definitionSheet.preambleRows ?? []).filter(row =>
      !/^(eleeveon\s+(account|school|branch|class|academic)|accountid|schoolid|branchid)/i.test(String(row[0] ?? "")),
    );
    preamble.forEach(row => sheet.addRow(row.map(valueOf)));
    if (preamble.length) {
      for (let i = 0; i < (definitionSheet.preambleSpacing ?? 1); i++) sheet.addRow([]);
    }
    const headerIndex = sheet.rowCount + 1;
    sheet.addRow(definitionSheet.columns.map(col => col.header));
    definitionSheet.rows.forEach((record, index) => sheet.addRow(
      definitionSheet.columns.map(col => valueOf(
        col.value ? col.value(record, index) : (record as Record<string, unknown>)[col.key]
      )),
    ));
    sheet.views = [{ state: "frozen", ySplit: headerIndex, xSplit: 3 }];
    definitionSheet.columns.forEach((col, index) => {
      sheet.getColumn(index + 1).width = Math.max(12, col.width ?? 17);
    });
    // The original UUID remains in hidden A, so shuffled worksheet rows
    // retain stable student identity without displaying internal IDs.
    sheet.getColumn(1).hidden = true;
    sheet.autoFilter = { from: { row: headerIndex, column: 2 }, to: {
      row: headerIndex, column: definitionSheet.columns.length,
    }};
    for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex);
      row.height = rowIndex === headerIndex ? 30 : 23;
      for (let colIndex = 1; colIndex <= definitionSheet.columns.length; colIndex++) {
        const cell = row.getCell(colIndex);
        cell.alignment = { vertical: "middle", wrapText: rowIndex <= headerIndex };
        cell.border = { bottom: { style: "hair", color: { argb: PALETTE.border } } };
        cell.protection = { locked: true };
        let shade = PALETTE.grey;
        if (rowIndex < headerIndex) {
          shade = rowIndex === 1 ? PALETTE.blue :
            /^instructions$/i.test(String(row.getCell(1).value ?? "")) ? PALETTE.amber : PALETTE.grey;
          if (rowIndex === 1) cell.font = { bold: true, color: { argb: PALETTE.ink }, size: 14 };
        } else if (rowIndex === headerIndex) {
          shade = PALETTE.navy;
          cell.font = { bold: true, color: { argb: PALETTE.white } };
        } else {
          const editable = term ? (colIndex === 4 || colIndex === 5 || colIndex === 6) :
            daily ? colIndex === 5 : colIndex >= firstEditable;
          if (editable) {
            shade = PALETTE.green;
            cell.protection = { locked: false };
            cell.alignment = { horizontal: "center", vertical: "middle" };
            const numeric = term;
            if (numeric) cell.numFmt = "0";
            else {
              cell.dataValidation = {
                type: "list", allowBlank: true,
                formulae: ['"P,A,L,Present,Absent,Late"'],
                showErrorMessage: true,
                errorTitle: "Invalid attendance status",
                error: "Enter P, A, L, Present, Absent or Late.",
              };
            }
            if (numeric) cell.dataValidation = {
              type: "whole", operator: "between", allowBlank: true,
              formulae: [0, 366], showErrorMessage: true,
              error: "Enter a whole number from 0 to 366.",
            };
          } else {
            shade = term && colIndex >= 7 ? PALETTE.blue : PALETTE.grey;
            cell.font = { color: { argb: PALETTE.ink } };
          }
          // Term derived values are formulas, not editable manual inputs.
          if (term && colIndex === 7) cell.value = {
            formula: `IF(OR(D${rowIndex}="",E${rowIndex}=""),"",MAX(0,D${rowIndex}-E${rowIndex}))`,
          };
          if (term && colIndex === 8) {
            cell.value = { formula: `IF(OR(D${rowIndex}="",D${rowIndex}=0,E${rowIndex}=""),"",ROUND(E${rowIndex}/D${rowIndex}*100,0))` };
            cell.numFmt = '0"%"';
          }
          // Format preserved identity text with leading zeros.
          if (colIndex === 2) cell.numFmt = "@";
        }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: shade } };
      }
    }
    await sheet.protect("eleeveon-attendance", {
      selectLockedCells: true, selectUnlockedCells: true,
      formatCells: false, formatColumns: false, formatRows: false,
      insertRows: false, deleteRows: false,
      insertColumns: false, deleteColumns: false,
      sort: false, autoFilter: true,
    });
  }
  const buffer = await book.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
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
