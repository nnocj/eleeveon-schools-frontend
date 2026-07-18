/**
 * reports/broadsheet-templates/index.ts
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — BROADSHEET TEMPLATE REGISTRY
 * ---------------------------------------------------------
 *
 * Phase 2 foundation registry.
 *
 * The eight definitions are available immediately for Branch Settings.
 * Components are optional until their visual files are implemented. This lets
 * the project compile during the phased migration instead of importing files
 * that do not exist yet.
 */

import ClassicBroadsheetTemplate from "./ClassicBroadsheetTemplate";
import ModernBroadsheetTemplate from "./ModernBroadsheetTemplate";
import CompactBroadsheetTemplate from "./CompactBroadsheetTemplate";
import ExecutiveBroadsheetTemplate from "./ExecutiveBroadsheetTemplate";

import type {
  BroadsheetKind,
  BroadsheetTemplateCode,
  BroadsheetTemplateComponent,
  BroadsheetTemplateDefinition,
  BroadsheetTemplateRegistryItem,
} from "./broadsheet-template-types";

import {
  DEFAULT_BROADSHEET_TEMPLATE_CODE,
} from "./broadsheet-template-types";

import { normalizeBroadsheetKey } from "./broadsheet-template-utils";

export * from "./broadsheet-template-types";
export * from "./broadsheet-template-utils";

// ======================================================
// DEFINITIONS
// ======================================================

const ALL_KINDS: BroadsheetKind[] = ["subject", "class", "annual"];

export const BROADSHEET_TEMPLATE_DEFINITIONS: BroadsheetTemplateRegistryItem[] = [
  {
    code: "broadsheet_classic",
    layoutKey: "broadsheet_classic",
    name: "Classic Broadsheet",
    description:
      "Formal bordered academic table with strong print readability.",
    tone: "classic",
    supportedKinds: ALL_KINDS,
    orientation: "landscape",
    paperSize: "A4",
    density: "compact",
    aliases: ["classic", "default", "formal", "traditional"],
    fileName: "ClassicBroadsheetTemplate.tsx",
    isDefault: true,
    active: true,
    component: ClassicBroadsheetTemplate,
  },
  {
    code: "broadsheet_modern",
    layoutKey: "broadsheet_modern",
    name: "Modern Broadsheet",
    description:
      "Clean contemporary layout with soft summary cards and refined tables.",
    tone: "modern",
    supportedKinds: ALL_KINDS,
    orientation: "landscape",
    paperSize: "A4",
    density: "comfortable",
    aliases: ["modern", "clean", "modern_clean"],
    fileName: "ModernBroadsheetTemplate.tsx",
    active: true,
    component: ModernBroadsheetTemplate,
  },
  {
    code: "broadsheet_compact",
    layoutKey: "broadsheet_compact",
    name: "Compact Broadsheet",
    description:
      "Dense paper-efficient layout for large classes and many subjects.",
    tone: "compact",
    supportedKinds: ALL_KINDS,
    orientation: "landscape",
    paperSize: "A4",
    density: "compact",
    aliases: ["compact", "print", "space_saving", "dense"],
    fileName: "CompactBroadsheetTemplate.tsx",
    active: true,
    component: CompactBroadsheetTemplate,
  },
  {
    code: "broadsheet_executive",
    layoutKey: "broadsheet_executive",
    name: "Executive Broadsheet",
    description:
      "Premium leadership-focused presentation with prominent academic summaries.",
    tone: "executive",
    supportedKinds: ALL_KINDS,
    orientation: "landscape",
    paperSize: "A4",
    density: "comfortable",
    aliases: ["executive", "premium", "leadership", "management"],
    fileName: "ExecutiveBroadsheetTemplate.tsx",
    active: true,
    component: ExecutiveBroadsheetTemplate,
  },
  {
    code: "broadsheet_minimal",
    layoutKey: "broadsheet_minimal",
    name: "Minimal Broadsheet",
    description:
      "Low-ink understated design with only essential lines and fields.",
    tone: "minimal",
    supportedKinds: ALL_KINDS,
    orientation: "landscape",
    paperSize: "A4",
    density: "compact",
    aliases: ["minimal", "simple", "low_ink", "plain"],
    fileName: "MinimalBroadsheetTemplate.tsx",
    active: true,
  },
  {
    code: "broadsheet_cambridge",
    layoutKey: "broadsheet_cambridge",
    name: "Cambridge Broadsheet",
    description:
      "International examination-board inspired structure for clear candidate results.",
    tone: "cambridge",
    supportedKinds: ALL_KINDS,
    orientation: "landscape",
    paperSize: "A4",
    density: "compact",
    aliases: ["cambridge", "international", "candidate", "exam_board"],
    fileName: "CambridgeBroadsheetTemplate.tsx",
    active: true,
  },
  {
    code: "broadsheet_university",
    layoutKey: "broadsheet_university",
    name: "University Broadsheet",
    description:
      "Registrar-style academic record suitable for tertiary and credit-based programmes.",
    tone: "university",
    supportedKinds: ALL_KINDS,
    orientation: "landscape",
    paperSize: "A4",
    density: "compact",
    aliases: ["university", "tertiary", "registrar", "credits"],
    fileName: "UniversityBroadsheetTemplate.tsx",
    active: true,
  },
  {
    code: "broadsheet_analytics",
    layoutKey: "broadsheet_analytics",
    name: "Analytics Broadsheet",
    description:
      "Insight-led design emphasizing performance, trends and decision statistics.",
    tone: "analytics",
    supportedKinds: ALL_KINDS,
    orientation: "landscape",
    paperSize: "A4",
    density: "comfortable",
    aliases: ["analytics", "insights", "trends", "dashboard"],
    fileName: "AnalyticsBroadsheetTemplate.tsx",
    active: true,
  },
];

// ======================================================
// COMPONENT REGISTRATION
// ======================================================

/**
 * Components are registered by visual template modules as they are built.
 * Phase 4 will register Classic; later phases register the remaining seven.
 */
const componentRegistry = new Map<string, BroadsheetTemplateComponent>([
  ["broadsheet_classic", ClassicBroadsheetTemplate],
  ["broadsheet_modern", ModernBroadsheetTemplate],
  ["broadsheet_compact", CompactBroadsheetTemplate],
  ["broadsheet_executive", ExecutiveBroadsheetTemplate],
]);

export function registerBroadsheetTemplateComponent(
  codeOrLayoutKey: BroadsheetTemplateCode,
  component: BroadsheetTemplateComponent,
) {
  const definition = getBroadsheetTemplateDefinition(codeOrLayoutKey);
  componentRegistry.set(normalizeBroadsheetKey(definition.code), component);
  componentRegistry.set(normalizeBroadsheetKey(definition.layoutKey), component);
  for (const alias of definition.aliases || []) {
    componentRegistry.set(normalizeBroadsheetKey(alias), component);
  }
  return component;
}

export function unregisterBroadsheetTemplateComponent(
  codeOrLayoutKey: BroadsheetTemplateCode,
) {
  const definition = getBroadsheetTemplateDefinition(codeOrLayoutKey);
  const keys = [definition.code, definition.layoutKey, ...(definition.aliases || [])];
  for (const key of keys) componentRegistry.delete(normalizeBroadsheetKey(key));
}

// ======================================================
// REGISTRY VIEW
// ======================================================

export const BROADSHEET_TEMPLATE_REGISTRY: BroadsheetTemplateRegistryItem[] =
  BROADSHEET_TEMPLATE_DEFINITIONS.map((definition) => ({
    ...definition,
    get component() {
      return componentRegistry.get(normalizeBroadsheetKey(definition.code));
    },
  }));

// ======================================================
// RESOLVERS
// ======================================================

export function getBroadsheetTemplateDefinition(
  codeOrLayoutKey?: BroadsheetTemplateCode | null,
): BroadsheetTemplateDefinition {
  const key = normalizeBroadsheetKey(
    codeOrLayoutKey || DEFAULT_BROADSHEET_TEMPLATE_CODE,
  );

  return (
    BROADSHEET_TEMPLATE_DEFINITIONS.find((definition) => {
      const candidates = [
        definition.code,
        definition.layoutKey,
        ...(definition.aliases || []),
      ].map(normalizeBroadsheetKey);
      return candidates.includes(key);
    }) || BROADSHEET_TEMPLATE_DEFINITIONS[0]
  );
}

export function getBroadsheetTemplateRegistryItem(
  codeOrLayoutKey?: BroadsheetTemplateCode | null,
): BroadsheetTemplateRegistryItem {
  const definition = getBroadsheetTemplateDefinition(codeOrLayoutKey);
  return {
    ...definition,
    component: componentRegistry.get(normalizeBroadsheetKey(definition.code)),
  };
}

export function getBroadsheetTemplateComponent(
  codeOrLayoutKey?: BroadsheetTemplateCode | null,
): BroadsheetTemplateComponent | undefined {
  const definition = getBroadsheetTemplateDefinition(codeOrLayoutKey);
  return componentRegistry.get(normalizeBroadsheetKey(definition.code));
}

export const resolveBroadsheetTemplateComponent =
  getBroadsheetTemplateComponent;

export function isBroadsheetTemplateDefined(
  codeOrLayoutKey?: BroadsheetTemplateCode | null,
): boolean {
  const key = normalizeBroadsheetKey(codeOrLayoutKey);
  if (!key) return false;
  return BROADSHEET_TEMPLATE_DEFINITIONS.some((definition) =>
    [definition.code, definition.layoutKey, ...(definition.aliases || [])]
      .map(normalizeBroadsheetKey)
      .includes(key),
  );
}

export function isBroadsheetTemplateImplemented(
  codeOrLayoutKey?: BroadsheetTemplateCode | null,
): boolean {
  return !!getBroadsheetTemplateComponent(codeOrLayoutKey);
}

export function getBroadsheetTemplatesForKind(
  kind: BroadsheetKind,
): BroadsheetTemplateRegistryItem[] {
  return BROADSHEET_TEMPLATE_DEFINITIONS.filter((definition) =>
    definition.supportedKinds.includes(kind),
  ).map((definition) => ({
    ...definition,
    component: componentRegistry.get(normalizeBroadsheetKey(definition.code)),
  }));
}

export function getImplementedBroadsheetTemplates(
  kind?: BroadsheetKind,
): BroadsheetTemplateRegistryItem[] {
  const source = kind
    ? getBroadsheetTemplatesForKind(kind)
    : BROADSHEET_TEMPLATE_REGISTRY;
  return source.filter((item) => !!item.component);
}

export function getPendingBroadsheetTemplates(
  kind?: BroadsheetKind,
): BroadsheetTemplateRegistryItem[] {
  const source = kind
    ? getBroadsheetTemplatesForKind(kind)
    : BROADSHEET_TEMPLATE_REGISTRY;
  return source.filter((item) => !item.component);
}

export function getDefaultBroadsheetTemplate(
  kind?: BroadsheetKind,
): BroadsheetTemplateRegistryItem {
  const source = kind
    ? getBroadsheetTemplatesForKind(kind)
    : BROADSHEET_TEMPLATE_REGISTRY;
  return source.find((item) => item.isDefault) || source[0];
}