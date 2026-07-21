"use client";

/**
 * reports/components/AnnualBroadsheet.tsx
 * ---------------------------------------------------------
 * ANNUAL BROADSHEET — COMPATIBILITY WRAPPER
 * ---------------------------------------------------------
 *
 * Keeps the existing AnnualBroadsheet public API intact while delegating
 * rendering, template resolution, preview controls and print behavior to
 * the shared BroadsheetCard router.
 *
 * The annual dataset remains sourced from the cumulative report engine.
 */

import React from "react";

import BroadsheetCard from "./BroadsheetCard";

import type { AnnualBroadsheet as AnnualBroadsheetData } from "../engine/cumulative-report-types";
import type { ReportHeaderData } from "../engine/report-types";

import type {
  BroadsheetTemplateDefinition,
  BroadsheetTemplateRecord,
  BroadsheetTemplateSettings,
} from "../broadsheet-templates";

export type AnnualBroadsheetProps = {
  broadsheet?: AnnualBroadsheetData | null;
  header: ReportHeaderData;

  template?: BroadsheetTemplateRecord | BroadsheetTemplateDefinition | null;
  settings?: BroadsheetTemplateSettings | null;

  compact?: boolean;
  showWatermark?: boolean;
  pageBreakAfter?: boolean;
  mobilePreview?: boolean;
  generatedAt?: string | number | Date;
  pageNumber?: number;
  totalPages?: number;

  className?: string;
  emptyMessage?: string;
};

export default function AnnualBroadsheet({
  broadsheet,
  header,
  template,
  settings,
  compact = false,
  showWatermark = true,
  pageBreakAfter = true,
  mobilePreview = true,
  generatedAt,
  pageNumber,
  totalPages,
  className,
  emptyMessage,
}: AnnualBroadsheetProps) {
  return (
    <BroadsheetCard
      kind="annual"
      dataset={broadsheet}
      header={header}
      template={template}
      settings={settings}
      compact={compact}
      showWatermark={showWatermark}
      pageBreakAfter={pageBreakAfter}
      mobilePreview={mobilePreview}
      generatedAt={generatedAt}
      pageNumber={pageNumber}
      totalPages={totalPages}
      className={className}
      emptyMessage={emptyMessage}
    />
  );
}
