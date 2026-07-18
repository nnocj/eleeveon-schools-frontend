"use client";

/**
 * reports/components/ClassBroadSheet.tsx
 * ---------------------------------------------------------
 * CLASS BROADSHEET — COMPATIBILITY WRAPPER
 * ---------------------------------------------------------
 *
 * Keeps the existing ClassBroadSheet public API intact while delegating
 * rendering, template resolution, preview controls and print behavior to
 * the shared BroadsheetCard router.
 */

import React from "react";

import BroadsheetCard from "./BroadsheetCard";

import type {
  ComputedClassBroadsheet,
  ReportHeaderData,
} from "../engine/report-types";

import type {
  BroadsheetTemplateDefinition,
  BroadsheetTemplateRecord,
  BroadsheetTemplateSettings,
} from "../broadsheet-templates";

export type ClassBroadSheetProps = {
  broadsheet?: ComputedClassBroadsheet | null;
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

export default function ClassBroadSheet({
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
}: ClassBroadSheetProps) {
  return (
    <BroadsheetCard
      kind="class"
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