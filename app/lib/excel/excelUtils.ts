/**
 * app/lib/excel/excelUtils.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — SHARED UTILITIES
 * --------------------------------------------------------------------------
 *
 * Generic helpers for:
 * - cell normalization;
 * - header normalization;
 * - Excel column letters;
 * - primitive coercion;
 * - safe filenames;
 * - empty-row detection;
 * - comparison and matching.
 *
 * No student, attendance or assessment-specific rules belong here.
 */

import type {
  ExcelCellValue,
  ExcelFieldDataType,
  ExcelRawRow,
} from "./excelTypes";

export function excelString(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString();
  }

  return String(value);
}

export function trimExcelString(value: unknown): string {
  return excelString(value).trim();
}

/**
 * Normalizes user-provided Excel headers for matching.
 *
 * Examples:
 *
 * "Admission No."      -> "admission no"
 * "STUDENT_NAME"       -> "student name"
 * " Student   Name "   -> "student name"
 * "E-mail Address"     -> "e mail address"
 */
export function normalizeExcelHeader(value: unknown): string {
  return trimExcelString(value)
    .toLowerCase()
    .replace(/[_/\\|]+/g, " ")
    .replace(/[()[\]{}]+/g, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/[.,:;!?'"`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * More aggressive normalization used for fuzzy comparisons.
 *
 * "Admission No." -> "admissionno"
 */
export function compactExcelHeader(value: unknown): string {
  return normalizeExcelHeader(value).replace(/[^a-z0-9]+/g, "");
}

export function isExcelCellEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;

  if (typeof value === "string") {
    return value.trim() === "";
  }

  return false;
}

export function isExcelRowEmpty(row: ExcelRawRow): boolean {
  return row.every(isExcelCellEmpty);
}

export function normalizeExcelCell(
  value: unknown,
  options?: {
    trimStrings?: boolean;
  },
): ExcelCellValue {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    return options?.trimStrings === false ? value : value.trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value).trim();
}

/**
 * Converts zero-based numeric column indexes into Excel letters.
 *
 * 0  -> A
 * 25 -> Z
 * 26 -> AA
 */
export function excelColumnLetter(index: number): string {
  let number = Math.max(0, Math.floor(index)) + 1;
  let result = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    result =
      String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }

  return result;
}

export function safeExcelSheetName(
  value: unknown,
  fallback = "Sheet1",
): string {
  const raw = trimExcelString(value) || fallback;

  /**
   * Excel sheet names:
   * - cannot contain \ / ? * [ ] :
   * - cannot exceed 31 characters.
   */
  const cleaned = raw
    .replace(/[\\/?*\[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);

  return cleaned || fallback;
}

export function safeExcelFileName(
  value: unknown,
  fallback = "eleeveon-export.xlsx",
): string {
  let fileName = trimExcelString(value);

  if (!fileName) fileName = fallback;

  fileName = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    fileName += ".xlsx";
  }

  return fileName;
}

export function toExcelNumber(
  value: unknown,
): number | undefined {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const normalized = String(value)
    .trim()
    .replace(/,/g, "");

  if (!normalized) return undefined;

  const number = Number(normalized);

  return Number.isFinite(number) ? number : undefined;
}

export function toExcelInteger(
  value: unknown,
): number | undefined {
  const number = toExcelNumber(value);
  if (number === undefined) return undefined;

  return Number.isInteger(number)
    ? number
    : Math.round(number);
}

export function toExcelBoolean(
  value: unknown,
): boolean | undefined {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = normalizeExcelHeader(value);

  if (
    [
      "true",
      "yes",
      "y",
      "1",
      "active",
      "enabled",
      "on",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "no",
      "n",
      "0",
      "inactive",
      "disabled",
      "off",
    ].includes(normalized)
  ) {
    return false;
  }

  return undefined;
}

/**
 * Excel serial date conversion.
 *
 * XLSX may return actual Date values depending on parsing configuration,
 * but old spreadsheets may still expose serial numbers.
 */
export function excelSerialToDate(
  serial: number,
): Date | undefined {
  if (!Number.isFinite(serial)) return undefined;

  /**
   * Excel's serial-date epoch effectively maps through 1899-12-30
   * when accounting for its historic 1900 leap-year behavior.
   */
  const excelEpoch = Date.UTC(1899, 11, 30);

  const milliseconds =
    excelEpoch + serial * 24 * 60 * 60 * 1000;

  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime())
    ? undefined
    : date;
}

export function toExcelDate(
  value: unknown,
): Date | undefined {
  if (!value && value !== 0) return undefined;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? undefined
      : value;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  const text = String(value).trim();
  if (!text) return undefined;

  /**
   * Explicit YYYY-MM-DD parsing avoids timezone shifting.
   */
  const isoDateOnly =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (isoDateOnly) {
    const [, year, month, day] = isoDateOnly;

    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
    );

    return Number.isNaN(date.getTime())
      ? undefined
      : date;
  }

  const timestamp = Date.parse(text);

  if (!Number.isFinite(timestamp)) return undefined;

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? undefined
    : date;
}

export function toISODateString(
  value: unknown,
): string | undefined {
  const date = toExcelDate(value);
  if (!date) return undefined;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(
    2,
    "0",
  );
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function toISODateTimeString(
  value: unknown,
): string | undefined {
  const date = toExcelDate(value);
  if (!date) return undefined;

  return date.toISOString();
}

export function looksLikeEmail(value: unknown): boolean {
  const text = trimExcelString(value);
  if (!text) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

/**
 * Generic phone normalization.
 *
 * We intentionally do not impose Ghana-only rules here because this
 * shared library should remain globally reusable.
 */
export function normalizeExcelPhone(
  value: unknown,
): string {
  const raw = trimExcelString(value);
  if (!raw) return "";

  const hasLeadingPlus = raw.startsWith("+");

  const digits = raw.replace(/\D/g, "");

  return hasLeadingPlus && digits
    ? `+${digits}`
    : digits;
}

export function coerceExcelValue(
  value: unknown,
  dataType: ExcelFieldDataType = "unknown",
): unknown {
  if (isExcelCellEmpty(value)) {
    return undefined;
  }

  switch (dataType) {
    case "string":
      return trimExcelString(value);

    case "id":
      return trimExcelString(value);

    case "email":
      return trimExcelString(value).toLowerCase();

    case "phone":
      return normalizeExcelPhone(value);

    case "number":
      return toExcelNumber(value);

    case "integer":
      return toExcelInteger(value);

    case "boolean":
      return toExcelBoolean(value);

    case "date":
      return toISODateString(value);

    case "datetime":
      return toISODateTimeString(value);

    case "unknown":
    default:
      return normalizeExcelCell(value);
  }
}

export function isCoercionValid(
  originalValue: unknown,
  coercedValue: unknown,
  dataType: ExcelFieldDataType = "unknown",
): boolean {
  if (isExcelCellEmpty(originalValue)) return true;

  switch (dataType) {
    case "number":
    case "integer":
    case "boolean":
    case "date":
    case "datetime":
      return coercedValue !== undefined;

    case "email":
      return looksLikeEmail(originalValue);

    case "string":
    case "phone":
    case "id":
    case "unknown":
    default:
      return true;
  }
}

export function normalizedComparisonValue(
  value: unknown,
): string {
  if (isExcelCellEmpty(value)) return "";

  if (value instanceof Date) {
    return value.toISOString();
  }

  return trimExcelString(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function uniqueNonEmptyStrings(
  values: unknown[],
): string[] {
  return Array.from(
    new Set(
      values
        .map(trimExcelString)
        .filter(Boolean),
    ),
  );
}

export function mappedRecordIsEmpty(
  record: Record<string, unknown>,
): boolean {
  return Object.values(record).every(isExcelCellEmpty);
}

export function sourceRecordIsEmpty(
  record: Record<string, unknown>,
): boolean {
  return Object.values(record).every(isExcelCellEmpty);
}