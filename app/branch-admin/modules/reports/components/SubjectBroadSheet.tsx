"use client";

/**
 * reports/components/SubjectBroadSheet.tsx
 * ---------------------------------------------------------
 * SUBJECT BROADSHEET — COMPATIBILITY WRAPPER
 * ---------------------------------------------------------
 *
 * Keeps the existing SubjectBroadSheet public API intact while delegating
 * rendering, template resolution, preview controls and print behavior to
 * the shared BroadsheetCard router.
 *
 * Existing consumers may continue passing:
 * - header
 * - broadsheet
 * - compact
 * - pageBreakAfter
 * - mobilePreview
 *
 * New template-aware consumers may additionally pass:
 * - template
 * - settings
 * - showWatermark
 * - generatedAt
 * - pageNumber / totalPages
 */

import React from "react";

import BroadsheetCard from "./BroadsheetCard";

import type {
  ComputedSubjectBroadsheet,
  ReportHeaderData,
} from "../engine/report-types";

import type {
  BroadsheetTemplateDefinition,
  BroadsheetTemplateRecord,
  BroadsheetTemplateSettings,
} from "../broadsheet-templates";

export type SubjectBroadSheetProps = {
  broadsheet?: ComputedSubjectBroadsheet | null;
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

export default function SubjectBroadSheet({
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
}: SubjectBroadSheetProps) {
  return (
    <BroadsheetCard
      kind="subject"
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