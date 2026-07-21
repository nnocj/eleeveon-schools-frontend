/**
 * reports/student-report-templates/index.ts
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — STUDENT REPORT TEMPLATE REGISTRY
 * ---------------------------------------------------------
 *
 * Central registry for all student report card templates.
 *
 * Important:
 * - This is a .ts file, so it uses React.createElement instead of JSX.
 * - It never reads dataset.templateCode directly because the current
 *   StudentReportCardDataset type does not define that property.
 * - Template selection comes from settings/template first, then safe dynamic
 *   fallbacks through `as any`.
 */

import React from "react";

import type {
  StudentReportTemplateBaseProps,
  StudentReportTemplateCode,
  StudentReportTemplateComponent,
  StudentReportTemplateDefinition,
  StudentReportTemplateLayoutKey,
} from "../shared/ReportTemplateTypes";

import {
  DEFAULT_STUDENT_REPORT_TEMPLATE_CODE,
  DEFAULT_STUDENT_REPORT_TEMPLATE_DEFINITIONS,
  getStudentReportTemplateDefinitionByCode,
  normalizeTemplateKey,
} from "../shared/ReportTemplateTypes";

import ClassicFormalTemplate from "./ClassicFormalTemplate";
import BorderedTraditionalTemplate from "./BorderedTraditionalTemplate";
import CompactPrintTemplate from "./CompactPrintTemplate";
import ModernCleanTemplate from "./ModernCleanTemplate";
import SideProfileTemplate from "./SideProfileTemplate";
import LetterHeadPremiumTemplate from "./LetterheadPremiumTemplate";
import CambridgeTemplate from "./CambridgeTemplate";
import IBTemplate from "./IBTemplate";
import KindergartenTemplate from "./KindergartenTemplate";
import MontessoriTemplate from "./MontessoriTemplate";
import UniversityTranscriptTemplate from "./UniversityTranscriptTemplate";
// ======================================================
// TEMPORARY FALLBACK COMPONENTS
// ======================================================
//
// Replace these constants with real imports when each template is implemented.
// For now, they safely render Classic Formal so template switching does not
// break the report card.

//const ModernCleanTemplate = ClassicFormalTemplate;
//const CompactPrintTemplate = ClassicFormalTemplate;
//const BorderedTraditionalTemplate = ClassicFormalTemplate;
//const LetterheadPremiumTemplate = ClassicFormalTemplate;
//const SideProfileTemplate = ClassicFormalTemplate;
//const CambridgeTemplate = ClassicFormalTemplate;
//const IBTemplate = ClassicFormalTemplate;
//const KindergartenTemplate = ClassicFormalTemplate;
//const MontessoriTemplate = ClassicFormalTemplate;
//const UniversityTranscriptTemplate = ClassicFormalTemplate;
// ======================================================
// REGISTRY TYPES
// ======================================================

export type StudentReportTemplateRegistryItem =
  StudentReportTemplateDefinition & {
    component: StudentReportTemplateComponent;
    aliases?: string[];
    fileName: string;
  };

// ======================================================
// DEFINITIONS
// ======================================================

export const STUDENT_REPORT_TEMPLATE_DEFINITIONS: StudentReportTemplateDefinition[] =
  DEFAULT_STUDENT_REPORT_TEMPLATE_DEFINITIONS;

// ======================================================
// REGISTRY
// ======================================================

export const STUDENT_REPORT_TEMPLATE_REGISTRY: StudentReportTemplateRegistryItem[] =
  [
    {
      ...getStudentReportTemplateDefinitionByCode("classic_formal"),
      component: ClassicFormalTemplate,
      fileName: "ClassicFormalTemplate.tsx",
      aliases: [
        "classic",
        "classic_formal",
        "classic_ghana",
        "ghana",
        "formal",
        "default",
      ],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("modern_clean"),
      component: ModernCleanTemplate,
      fileName: "ModernCleanTemplate.tsx",
      aliases: ["modern", "clean", "modern_clean", "premium_clean"],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("compact_print"),
      component: CompactPrintTemplate,
      fileName: "CompactPrintTemplate.tsx",
      aliases: [
        "compact",
        "print",
        "compact_print",
        "one_page",
        "space_saving",
      ],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("bordered_traditional"),
      component: BorderedTraditionalTemplate,
      fileName: "BorderedTraditionalTemplate.tsx",
      aliases: ["bordered", "traditional", "bordered_traditional", "boxed"],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("letterhead_premium"),
      component: LetterHeadPremiumTemplate,
      fileName: "LetterHeadPremiumTemplate.tsx",
      aliases: ["letterhead", "premium", "letterhead_premium", "institutional"],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("side_profile"),
      component: SideProfileTemplate,
      fileName: "SideProfileTemplate.tsx",
      aliases: [
        "side",
        "profile",
        "side_profile",
        "identity",
        "student_profile",
      ],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("cambridge"),
      component: CambridgeTemplate,
      fileName: "CambridgeTemplate.tsx",
      aliases: ["cambridge", "cambridge_report", "international_cambridge"],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("ib"),
      component: IBTemplate,
      fileName: "IBTemplate.tsx",
      aliases: ["ib", "international_baccalaureate", "baccalaureate"],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("kindergarten"),
      component: KindergartenTemplate,
      fileName: "KindergartenTemplate.tsx",
      aliases: ["kindergarten", "kg", "early_years", "nursery"],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("montessori"),
      component: MontessoriTemplate,
      fileName: "MontessoriTemplate.tsx",
      aliases: ["montessori", "montessori_report", "narrative"],
    },
    {
      ...getStudentReportTemplateDefinitionByCode("university_transcript"),
      component: UniversityTranscriptTemplate,
      fileName: "UniversityTranscriptTemplate.tsx",
      aliases: [
        "university",
        "transcript",
        "university_transcript",
        "academic_transcript",
        "record",
      ],
    },
  ];

// ======================================================
// RESOLVERS
// ======================================================

function normalizeRegistryKey(value?: string | null) {
  return normalizeTemplateKey(value);
}

export function getStudentReportTemplateRegistryItem(
  codeOrLayoutKey?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | null,
): StudentReportTemplateRegistryItem {
  const key = normalizeRegistryKey(
    codeOrLayoutKey || DEFAULT_STUDENT_REPORT_TEMPLATE_CODE,
  );

  return (
    STUDENT_REPORT_TEMPLATE_REGISTRY.find((item) => {
      const code = normalizeRegistryKey(item.code);
      const layoutKey = normalizeRegistryKey(item.layoutKey);
      const aliases = (item.aliases || []).map(normalizeRegistryKey);

      return code === key || layoutKey === key || aliases.includes(key);
    }) || STUDENT_REPORT_TEMPLATE_REGISTRY[0]
  );
}

export function getStudentReportTemplateComponent(
  codeOrLayoutKey?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | null,
): StudentReportTemplateComponent {
  return getStudentReportTemplateRegistryItem(codeOrLayoutKey).component;
}

export function getStudentReportTemplateDefinition(
  codeOrLayoutKey?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | null,
): StudentReportTemplateDefinition {
  const { component, aliases, fileName, ...definition } =
    getStudentReportTemplateRegistryItem(codeOrLayoutKey);

  return definition;
}

export function getStudentReportTemplateFileName(
  codeOrLayoutKey?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | null,
): string {
  return getStudentReportTemplateRegistryItem(codeOrLayoutKey).fileName;
}

export function isStudentReportTemplateAvailable(
  codeOrLayoutKey?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | null,
) {
  const key = normalizeRegistryKey(codeOrLayoutKey);

  return STUDENT_REPORT_TEMPLATE_REGISTRY.some((item) => {
    const code = normalizeRegistryKey(item.code);
    const layoutKey = normalizeRegistryKey(item.layoutKey);
    const aliases = (item.aliases || []).map(normalizeRegistryKey);

    return code === key || layoutKey === key || aliases.includes(key);
  });
}

export function getImplementedStudentReportTemplates() {
  return STUDENT_REPORT_TEMPLATE_REGISTRY.filter(
    (item) => item.code === "classic_formal",
  );
}

export function getPendingStudentReportTemplates() {
  return STUDENT_REPORT_TEMPLATE_REGISTRY.filter(
    (item) => item.code !== "classic_formal",
  );
}

export function getInternationalStudentReportTemplates() {
  return STUDENT_REPORT_TEMPLATE_REGISTRY.filter((item) =>
    ["cambridge", "ib"].includes(String(item.code)),
  );
}

export function getEarlyYearsStudentReportTemplates() {
  return STUDENT_REPORT_TEMPLATE_REGISTRY.filter((item) =>
    ["kindergarten", "montessori"].includes(String(item.code)),
  );
}

// ======================================================
// RENDER HELPER
// ======================================================

export function resolveStudentReportTemplateCodeFromProps(
  props: StudentReportTemplateBaseProps,
): StudentReportTemplateCode {
  const dynamicDataset = props.dataset as any;

  return (
    props.settings?.templateCode ||
    props.template?.code ||
    dynamicDataset?.templateCode ||
    dynamicDataset?.template?.code ||
    dynamicDataset?.templateSettings?.templateCode ||
    dynamicDataset?.reportTemplate?.code ||
    dynamicDataset?.reportCardTemplate?.code ||
    DEFAULT_STUDENT_REPORT_TEMPLATE_CODE
  );
}

export function renderStudentReportTemplate(
  props: StudentReportTemplateBaseProps,
): React.ReactElement {
  const templateCode = resolveStudentReportTemplateCodeFromProps(props);
  const Template = getStudentReportTemplateComponent(templateCode);

  return React.createElement(Template, props);
}

// ======================================================
// EXPORTS
// ======================================================

export {
  ClassicFormalTemplate,
  ModernCleanTemplate,
  CompactPrintTemplate,
  BorderedTraditionalTemplate,
  LetterHeadPremiumTemplate,
  SideProfileTemplate,
  CambridgeTemplate,
  IBTemplate,
  KindergartenTemplate,
  MontessoriTemplate,
  UniversityTranscriptTemplate,
};
