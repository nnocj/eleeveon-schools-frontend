"use client";

/**
 * reports/components/StudentReportCard.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — STUDENT REPORT CARD TEMPLATE ROUTER
 * ---------------------------------------------------------
 *
 * This component renders ONE official student report card by selecting
 * the active visual template.
 *
 * New template system:
 * - The report engine still computes the dataset once.
 * - Branch Settings controls selected template + display settings.
 * - This component only resolves the selected template and routes rendering.
 * - Actual visual designs live in reports/student-report-templates/*.
 *
 * Important:
 * - This file does not compute report results.
 * - This file keeps backward compatibility with old datasets.
 * - If no template/settings are supplied, it falls back to Classic Formal.
 */

import React, { useMemo } from "react";

import type { StudentReportCardDataset } from "../engine/report-types";

import type {
  ReportCardTemplateAssignmentLike,
  ReportCardTemplateLike,
  ReportCardTemplateSettingsLike,
  StudentReportTemplateDefinition,
  StudentReportTemplateSettings,
} from "../shared/ReportTemplateTypes";

import {
  DEFAULT_STUDENT_REPORT_TEMPLATE_CODE,
  mergeStudentReportTemplateSettings,
  normalizeStudentReportTemplateDefinition,
} from "../shared/ReportTemplateTypes";

import {
  getStudentReportTemplateComponent,
  getStudentReportTemplateDefinition,
} from "../student-report-templates";

import { reportTemplateEmptyMessage } from "../shared/ReportTemplateUtils";

// ======================================================
// PROPS
// ======================================================

export type StudentReportCardProps = {
  dataset?: StudentReportCardDataset;

  /**
   * Optional selected template row from Dexie/reportCardTemplates.
   * StudentReports.tsx may pass this directly after resolving branch settings.
   */
  template?: ReportCardTemplateLike | StudentReportTemplateDefinition | null;

  /**
   * Optional selected template settings row from Dexie/reportCardTemplateSettings.
   */
  templateSettings?: ReportCardTemplateSettingsLike | Partial<StudentReportTemplateSettings> | null;

  /**
   * Optional assignment row from Dexie/reportCardTemplateAssignments.
   */
  templateAssignment?: ReportCardTemplateAssignmentLike | null;

  /**
   * Backward-compatible shortcut. If supplied, it overrides templateSettings.
   */
  settings?: Partial<StudentReportTemplateSettings> | null;

  compact?: boolean;
  showWatermark?: boolean;
  pageBreakAfter?: boolean;

  /**
   * When true, templates can show mobile preview controls.
   * Print output remains A4 and unscaled.
   */
  mobilePreview?: boolean;
};

// ======================================================
// HELPERS
// ======================================================

function resolveDynamicTemplate(dataset?: StudentReportCardDataset) {
  const dynamicDataset = dataset as any;

  return (
    dynamicDataset?.template ||
    dynamicDataset?.reportTemplate ||
    dynamicDataset?.reportCardTemplate ||
    dynamicDataset?.selectedTemplate ||
    dynamicDataset?.header?.template ||
    dynamicDataset?.header?.reportTemplate ||
    dynamicDataset?.header?.reportCardTemplate ||
    null
  ) as ReportCardTemplateLike | null;
}

function resolveDynamicTemplateSettings(dataset?: StudentReportCardDataset) {
  const dynamicDataset = dataset as any;

  return (
    dynamicDataset?.templateSettings ||
    dynamicDataset?.reportTemplateSettings ||
    dynamicDataset?.reportCardTemplateSettings ||
    dynamicDataset?.selectedTemplateSettings ||
    dynamicDataset?.header?.templateSettings ||
    dynamicDataset?.header?.reportTemplateSettings ||
    dynamicDataset?.header?.reportCardTemplateSettings ||
    null
  ) as ReportCardTemplateSettingsLike | Partial<StudentReportTemplateSettings> | null;
}

function resolveDynamicTemplateAssignment(dataset?: StudentReportCardDataset) {
  const dynamicDataset = dataset as any;

  return (
    dynamicDataset?.templateAssignment ||
    dynamicDataset?.reportTemplateAssignment ||
    dynamicDataset?.reportCardTemplateAssignment ||
    dynamicDataset?.selectedTemplateAssignment ||
    dynamicDataset?.header?.templateAssignment ||
    dynamicDataset?.header?.reportTemplateAssignment ||
    dynamicDataset?.header?.reportCardTemplateAssignment ||
    null
  ) as ReportCardTemplateAssignmentLike | null;
}

function resolveTemplateCode(args: {
  dataset?: StudentReportCardDataset;
  template?: ReportCardTemplateLike | StudentReportTemplateDefinition | null;
  settings?: ReportCardTemplateSettingsLike | Partial<StudentReportTemplateSettings> | null;
}) {
  const dynamicDataset = args.dataset as any;

  return (
    (args.settings as any)?.templateCode ||
    (args.template as any)?.code ||
    dynamicDataset?.templateCode ||
    dynamicDataset?.template?.code ||
    dynamicDataset?.reportTemplate?.code ||
    dynamicDataset?.reportCardTemplate?.code ||
    dynamicDataset?.templateSettings?.templateCode ||
    dynamicDataset?.reportTemplateSettings?.templateCode ||
    dynamicDataset?.reportCardTemplateSettings?.templateCode ||
    dynamicDataset?.header?.templateCode ||
    dynamicDataset?.header?.template?.code ||
    dynamicDataset?.header?.reportTemplate?.code ||
    dynamicDataset?.header?.reportCardTemplate?.code ||
    DEFAULT_STUDENT_REPORT_TEMPLATE_CODE
  );
}

// ======================================================
// COMPONENT
// ======================================================

export default function StudentReportCard({
  dataset,
  template,
  templateSettings,
  templateAssignment,
  settings,
  compact = false,
  showWatermark = true,
  pageBreakAfter = true,
  mobilePreview = true,
}: StudentReportCardProps) {
  const resolved = useMemo(() => {
    const dynamicTemplate = resolveDynamicTemplate(dataset);
    const dynamicSettings = resolveDynamicTemplateSettings(dataset);
    const dynamicAssignment = resolveDynamicTemplateAssignment(dataset);

    const selectedTemplate =
      (template as ReportCardTemplateLike | null) ||
      dynamicTemplate ||
      null;

    const selectedSettings =
      settings ||
      templateSettings ||
      dynamicSettings ||
      null;

    const selectedAssignment =
      templateAssignment ||
      dynamicAssignment ||
      null;

    const templateCode = resolveTemplateCode({
      dataset,
      template: selectedTemplate,
      settings: selectedSettings,
    });

    const definitionFromRegistry = getStudentReportTemplateDefinition(templateCode);

    const normalizedTemplate = selectedTemplate
      ? normalizeStudentReportTemplateDefinition(selectedTemplate)
      : definitionFromRegistry;

    const resolvedSettings = mergeStudentReportTemplateSettings(
      selectedSettings,
      normalizedTemplate,
      selectedAssignment
    );

    const TemplateComponent = getStudentReportTemplateComponent(
      resolvedSettings.templateCode || normalizedTemplate.code || templateCode
    );

    return {
      template: normalizedTemplate,
      settings: resolvedSettings,
      TemplateComponent,
    };
  }, [dataset, template, templateSettings, templateAssignment, settings]);

  if (!dataset?.header || !dataset?.report) {
    return (
      <div className="src-empty-card report-template-router-empty">
        <style>{css}</style>
        {reportTemplateEmptyMessage(dataset)}
      </div>
    );
  }

  const TemplateComponent = resolved.TemplateComponent;

  return (
    <TemplateComponent
      dataset={dataset}
      template={resolved.template}
      settings={resolved.settings}
      compact={compact}
      showWatermark={showWatermark}
      pageBreakAfter={pageBreakAfter}
      mobilePreview={mobilePreview}
    />
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
.src-empty-card {
  padding: 20px;
  border: 1px dashed #ccc;
  border-radius: 16px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 750;
}
`;
