/**
 * app/lib/excel/excelColumnMapper.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — GENERIC COLUMN MAPPING ENGINE
 * --------------------------------------------------------------------------
 *
 * Turns arbitrary spreadsheet headers into destination-field mappings.
 *
 * Example:
 *
 * Source workbook:
 *   "Name of Pupil"
 *   "Index Number"
 *   "Sex"
 *
 * Destination fields:
 *   fullName
 *   admissionNumber
 *   gender
 *
 * The destination-specific module supplies field definitions and aliases.
 * This shared engine performs matching only.
 */

import type {
  ExcelColumnMapping,
  ExcelColumnMappingSuggestion,
  ExcelFieldDefinition,
  ExcelMappedRecord,
  ExcelMappingValidationResult,
  ExcelSheetRecords,
  ExcelSourceColumn,
  ExcelSourceRecord,
  ExcelValidationIssue,
} from "./excelTypes";

import {
  compactExcelHeader,
  normalizeExcelHeader,
} from "./excelUtils";

function fieldMatchValues(
  field: ExcelFieldDefinition,
): string[] {
  return [
    field.key,
    field.label,
    ...(field.aliases || []),
  ]
    .map(normalizeExcelHeader)
    .filter(Boolean);
}

function compactFieldMatchValues(
  field: ExcelFieldDefinition,
): string[] {
  return [
    field.key,
    field.label,
    ...(field.aliases || []),
  ]
    .map(compactExcelHeader)
    .filter(Boolean);
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeExcelHeader(value)
      .split(" ")
      .filter(Boolean),
  );
}

function tokenSimilarity(
  left: string,
  right: string,
): number {
  const a = tokenSet(left);
  const b = tokenSet(right);

  if (!a.size || !b.size) return 0;

  let intersection = 0;

  a.forEach((token) => {
    if (b.has(token)) {
      intersection += 1;
    }
  });

  const union =
    new Set([...a, ...b]).size;

  return union
    ? intersection / union
    : 0;
}

export function scoreColumnAgainstField(
  source: ExcelSourceColumn,
  field: ExcelFieldDefinition,
): {
  confidence: number;
  reason:
    | "exact"
    | "normalized"
    | "alias"
    | "partial"
    | "none";
} {
  const sourceRaw =
    source.header.trim().toLowerCase();

  const sourceNormalized =
    normalizeExcelHeader(source.header);

  const sourceCompact =
    compactExcelHeader(source.header);

  const fieldKeyRaw =
    field.key.trim().toLowerCase();

  const fieldLabelRaw =
    field.label.trim().toLowerCase();

  if (
    sourceRaw === fieldKeyRaw ||
    sourceRaw === fieldLabelRaw
  ) {
    return {
      confidence: 1,
      reason: "exact",
    };
  }

  const normalizedValues =
    fieldMatchValues(field);

  if (
    normalizedValues.includes(
      sourceNormalized,
    )
  ) {
    const isAlias =
      ![
        normalizeExcelHeader(field.key),
        normalizeExcelHeader(field.label),
      ].includes(sourceNormalized);

    return {
      confidence: isAlias ? 0.97 : 0.99,
      reason: isAlias
        ? "alias"
        : "normalized",
    };
  }

  const compactValues =
    compactFieldMatchValues(field);

  if (
    sourceCompact &&
    compactValues.includes(sourceCompact)
  ) {
    return {
      confidence: 0.94,
      reason: "normalized",
    };
  }

  let bestPartial = 0;

  normalizedValues.forEach((candidate) => {
    if (!candidate) return;

    if (
      sourceNormalized.includes(candidate) ||
      candidate.includes(sourceNormalized)
    ) {
      const shortest =
        Math.min(
          sourceNormalized.length,
          candidate.length,
        );

      const longest =
        Math.max(
          sourceNormalized.length,
          candidate.length,
        );

      if (shortest && longest) {
        bestPartial = Math.max(
          bestPartial,
          shortest / longest,
        );
      }
    }

    bestPartial = Math.max(
      bestPartial,
      tokenSimilarity(
        sourceNormalized,
        candidate,
      ),
    );
  });

  if (bestPartial >= 0.65) {
    return {
      confidence: Math.min(
        0.89,
        Math.max(0.65, bestPartial),
      ),
      reason: "partial",
    };
  }

  return {
    confidence: 0,
    reason: "none",
  };
}

export function suggestColumnMappings(
  sourceColumns: ExcelSourceColumn[],
  targetFields: ExcelFieldDefinition[],
  options?: {
    minimumConfidence?: number;
    preventDuplicateTargets?: boolean;
  },
): ExcelColumnMappingSuggestion[] {
  const minimumConfidence =
    options?.minimumConfidence ?? 0.65;

  const preventDuplicateTargets =
    options?.preventDuplicateTargets !== false;

  const claimedTargets =
    new Set<string>();

  return sourceColumns.map(
    (sourceColumn) => {
      const scored = targetFields
        .map((targetField) => ({
          targetField,
          ...scoreColumnAgainstField(
            sourceColumn,
            targetField,
          ),
        }))
        .filter(
          (candidate) =>
            candidate.confidence >=
            minimumConfidence,
        )
        .sort(
          (a, b) =>
            b.confidence -
            a.confidence,
        );

      const chosen = scored.find(
        (candidate) =>
          !preventDuplicateTargets ||
          !claimedTargets.has(
            candidate.targetField.key,
          ),
      );

      if (!chosen) {
        return {
          sourceColumn,
          targetField: undefined,
          confidence: 0,
          reason: "none",
        };
      }

      if (preventDuplicateTargets) {
        claimedTargets.add(
          chosen.targetField.key,
        );
      }

      return {
        sourceColumn,
        targetField:
          chosen.targetField,
        confidence:
          chosen.confidence,
        reason: chosen.reason,
      };
    },
  );
}

export function suggestionsToMappings(
  suggestions: ExcelColumnMappingSuggestion[],
): ExcelColumnMapping[] {
  return suggestions
    .filter(
      (
        suggestion,
      ): suggestion is ExcelColumnMappingSuggestion & {
        targetField: ExcelFieldDefinition;
      } => Boolean(suggestion.targetField),
    )
    .map((suggestion) => ({
      sourceIndex:
        suggestion.sourceColumn.index,

      sourceHeader:
        suggestion.sourceColumn.header,

      targetKey:
        suggestion.targetField.key,

      targetLabel:
        suggestion.targetField.label,

      confidence:
        suggestion.confidence,

      automatic: true,
    }));
}

export function autoMapExcelColumns(
  sourceColumns: ExcelSourceColumn[],
  targetFields: ExcelFieldDefinition[],
  options?: {
    minimumConfidence?: number;
  },
): ExcelColumnMapping[] {
  return suggestionsToMappings(
    suggestColumnMappings(
      sourceColumns,
      targetFields,
      options,
    ),
  );
}

export function validateColumnMappings(
  mappings: ExcelColumnMapping[],
  targetFields: ExcelFieldDefinition[],
): ExcelMappingValidationResult {
  const issues: ExcelValidationIssue[] =
    [];

  const targetCount =
    new Map<string, number>();

  mappings.forEach((mapping) => {
    targetCount.set(
      mapping.targetKey,
      (targetCount.get(
        mapping.targetKey,
      ) || 0) + 1,
    );
  });

  const duplicateTargetKeys =
    Array.from(targetCount.entries())
      .filter(
        ([, count]) => count > 1,
      )
      .map(([key]) => key);

  duplicateTargetKeys.forEach(
    (targetKey) => {
      issues.push({
        code: "duplicate_target_mapping",
        severity: "error",
        targetKey,
        message:
          `More than one spreadsheet column is mapped to "${targetKey}".`,
      });
    },
  );

  const mappedTargetKeys =
    new Set(
      mappings.map(
        (mapping) =>
          mapping.targetKey,
      ),
    );

  const missingRequiredFields =
    targetFields.filter(
      (field) =>
        field.required &&
        !mappedTargetKeys.has(field.key),
    );

  missingRequiredFields.forEach(
    (field) => {
      issues.push({
        code: "required_field_not_mapped",
        severity: "error",
        targetKey: field.key,
        message:
          `Required field "${field.label}" has not been mapped.`,
      });
    },
  );

  const validTargetKeys =
    new Set(
      targetFields.map(
        (field) => field.key,
      ),
    );

  mappings.forEach((mapping) => {
    if (
      !validTargetKeys.has(
        mapping.targetKey,
      )
    ) {
      issues.push({
        code: "unknown_target_field",
        severity: "error",
        sourceHeader:
          mapping.sourceHeader,
        targetKey:
          mapping.targetKey,
        message:
          `Mapped destination field "${mapping.targetKey}" does not exist.`,
      });
    }
  });

  return {
    valid:
      !issues.some(
        (issue) =>
          issue.severity === "error",
      ),

    issues,
    missingRequiredFields,
    duplicateTargetKeys,
  };
}

export function mapSourceRecord(
  sourceRecord: ExcelSourceRecord,
  mappings: ExcelColumnMapping[],
): ExcelMappedRecord {
  const mapped: ExcelMappedRecord = {};

  mappings.forEach((mapping) => {
    mapped[mapping.targetKey] =
      sourceRecord[
        mapping.sourceHeader
      ];
  });

  return mapped;
}

export function mapSheetRecords(
  records: ExcelSheetRecords,
  mappings: ExcelColumnMapping[],
): {
  rowNumber: number;
  source: ExcelSourceRecord;
  data: ExcelMappedRecord;
}[] {
  return records.records.map(
    (source, index) => ({
      rowNumber:
        records.rowNumbers[index] ??
        index + 2,

      source,

      data: mapSourceRecord(
        source,
        mappings,
      ),
    }),
  );
}

/**
 * Utility used when a user manually changes one mapping in the UI.
 *
 * A destination field should normally be mapped only once, so when
 * `replaceExistingTarget` is true the previous mapping to that target is removed.
 */
export function setColumnMapping(
  current: ExcelColumnMapping[],
  sourceColumn: ExcelSourceColumn,
  targetField:
    | ExcelFieldDefinition
    | null
    | undefined,
  options?: {
    replaceExistingTarget?: boolean;
  },
): ExcelColumnMapping[] {
  const replaceExistingTarget =
    options?.replaceExistingTarget !== false;

  let next = current.filter(
    (mapping) =>
      mapping.sourceIndex !==
      sourceColumn.index,
  );

  if (!targetField) {
    return next;
  }

  if (replaceExistingTarget) {
    next = next.filter(
      (mapping) =>
        mapping.targetKey !==
        targetField.key,
    );
  }

  next.push({
    sourceIndex:
      sourceColumn.index,

    sourceHeader:
      sourceColumn.header,

    targetKey:
      targetField.key,

    targetLabel:
      targetField.label,

    confidence: 1,

    automatic: false,
  });

  return next.sort(
    (a, b) =>
      a.sourceIndex -
      b.sourceIndex,
  );
}