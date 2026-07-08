import type React from "react";

import CumulativeTranscriptClassic from "./CumulativeTranscriptClassic";
import CumulativeTranscriptOfficial from "./CumulativeTranscriptOfficial";
import CumulativeTranscriptModern from "./CumulativeTranscriptModern";
import CumulativeTranscriptCompact from "./CumulativeTranscriptCompact";

export type CumulativeTranscriptTemplateCode =
  | "cumulative_transcript_classic"
  | "cumulative_transcript_official"
  | "cumulative_transcript_modern"
  | "cumulative_transcript_compact"
  | string;

export type CumulativeTranscriptTemplateRegistryItem = {
  name: string;
  code: CumulativeTranscriptTemplateCode;
  layoutKey: CumulativeTranscriptTemplateCode;
  description: string;
  reportType: "cumulative_transcript";
  orientation: "portrait" | "landscape";
  paperSize: "A4" | "Letter";
  density: "compact" | "comfortable" | "spacious";
  isDefault?: boolean;
  active?: boolean;
  component: React.ComponentType<any>;
};

export const CUMULATIVE_TRANSCRIPT_TEMPLATE_REGISTRY: CumulativeTranscriptTemplateRegistryItem[] = [
  {
    name: "Cumulative Transcript Classic",
    code: "cumulative_transcript_classic",
    layoutKey: "cumulative_transcript_classic",
    description: "Formal school-friendly cumulative transcript with period-by-period academic records.",
    reportType: "cumulative_transcript",
    orientation: "portrait",
    paperSize: "A4",
    density: "comfortable",
    isDefault: true,
    active: true,
    component: CumulativeTranscriptClassic,
  },
  {
    name: "Cumulative Transcript Official",
    code: "cumulative_transcript_official",
    layoutKey: "cumulative_transcript_official",
    description: "Registrar-style official academic records layout inspired by university transcript structure.",
    reportType: "cumulative_transcript",
    orientation: "portrait",
    paperSize: "A4",
    density: "compact",
    active: true,
    component: CumulativeTranscriptOfficial,
  },
  {
    name: "Cumulative Transcript Modern",
    code: "cumulative_transcript_modern",
    layoutKey: "cumulative_transcript_modern",
    description: "Clean modern cumulative transcript with summary metrics and readable period cards.",
    reportType: "cumulative_transcript",
    orientation: "portrait",
    paperSize: "A4",
    density: "comfortable",
    active: true,
    component: CumulativeTranscriptModern,
  },
  {
    name: "Cumulative Transcript Compact",
    code: "cumulative_transcript_compact",
    layoutKey: "cumulative_transcript_compact",
    description: "Print-efficient dense transcript for schools that need to save paper.",
    reportType: "cumulative_transcript",
    orientation: "portrait",
    paperSize: "A4",
    density: "compact",
    active: true,
    component: CumulativeTranscriptCompact,
  },
];

export function getCumulativeTranscriptTemplateRegistryItem(codeOrLayoutKey?: string | null) {
  const key = String(codeOrLayoutKey || "").trim();
  return (
    CUMULATIVE_TRANSCRIPT_TEMPLATE_REGISTRY.find(
      (item) => item.code === key || item.layoutKey === key
    ) || CUMULATIVE_TRANSCRIPT_TEMPLATE_REGISTRY[0]
  );
}

export function resolveCumulativeTranscriptTemplateComponent(codeOrLayoutKey?: string | null) {
  return getCumulativeTranscriptTemplateRegistryItem(codeOrLayoutKey).component;
}

export {
  CumulativeTranscriptClassic,
  CumulativeTranscriptOfficial,
  CumulativeTranscriptModern,
  CumulativeTranscriptCompact,
};
