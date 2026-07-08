"use client";

/**
 * reports/components/CumulativeReportBook.tsx
 * ---------------------------------------------------------
 * Compatibility wrapper.
 *
 * The real implementation lives in reports/cumulative-book/CumulativeReportBook.tsx
 * so book pages, helpers and types stay grouped together.
 */

export { default } from "../cumulative-book/CumulativeReportBook";
export type {
  CumulativeReportBookDataset,
  CumulativeReportBookProps,
  CumulativeReportBookSettings,
  CumulativeBookPeriodDataset,
} from "../cumulative-book/cumulative-book-types";
