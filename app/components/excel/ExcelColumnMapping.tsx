"use client";

/**
 * app/components/excel/ExcelColumnMapping.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — COLUMN MAPPING UI
 * --------------------------------------------------------------------------
 *
 * Generic UI for mapping source spreadsheet columns to Eleeveon fields.
 *
 * Used especially for external spreadsheets where schools have their own
 * header names/order.
 */

import {
  useMemo,
} from "react";

import type {
  ExcelColumnMapping,
  ExcelFieldDefinition,
  ExcelSourceColumn,
} from "../../lib/excel/excelTypes";

import {
  setColumnMapping,
} from "../../lib/excel/excelColumnMapper";

export interface ExcelColumnMappingProps {
  columns: ExcelSourceColumn[];

  fields: ExcelFieldDefinition[];

  mappings: ExcelColumnMapping[];

  onChange: (
    mappings: ExcelColumnMapping[],
  ) => void;

  disabled?: boolean;

  title?: string;

  description?: string;

  showConfidence?: boolean;

  className?: string;
}

function confidenceText(
  confidence?: number,
) {
  if (
    confidence ===
      undefined ||
    !Number.isFinite(
      confidence,
    )
  ) {
    return null;
  }

  if (
    confidence >= 0.95
  ) {
    return "Strong match";
  }

  if (
    confidence >= 0.8
  ) {
    return "Likely match";
  }

  if (
    confidence >= 0.65
  ) {
    return "Possible match";
  }

  return "Manual review";
}

export default function ExcelColumnMapping({
  columns,
  fields,
  mappings,
  onChange,
  disabled = false,
  title = "Match spreadsheet columns",
  description =
    "Tell Eleeveon what each spreadsheet column represents. Unneeded columns can be ignored.",
  showConfidence = true,
  className = "",
}: ExcelColumnMappingProps) {
  const fieldByKey =
    useMemo(
      () =>
        new Map(
          fields.map(
            (field) => [
              field.key,
              field,
            ],
          ),
        ),
      [fields],
    );

  const mappedTargets =
    useMemo(
      () =>
        new Set(
          mappings.map(
            (mapping) =>
              mapping.targetKey,
          ),
        ),
      [mappings],
    );

  const requiredFields =
    fields.filter(
      (field) =>
        field.required,
    );

  const missingRequired =
    requiredFields.filter(
      (field) =>
        !mappedTargets.has(
          field.key,
        ),
    );

  return (
    <section
      className={[
        "excel-column-mapping",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="excel-column-mapping-head">
        <div>
          <h3>
            {title}
          </h3>

          <p>
            {description}
          </p>
        </div>

        <div className="excel-mapping-count">
          {
            mappings.length
          }{" "}
          mapped
        </div>
      </div>

      {missingRequired.length >
        0 && (
        <div className="excel-mapping-warning">
          <strong>
            Required mapping
          </strong>

          <span>
            Map{" "}
            {missingRequired
              .map(
                (field) =>
                  field.label,
              )
              .join(", ")}
            .
          </span>
        </div>
      )}

      <div className="excel-mapping-list">
        {columns.map(
          (column) => {
            const mapping =
              mappings.find(
                (item) =>
                  item.sourceIndex ===
                    column.index ||
                  item.sourceHeader ===
                    column.header,
              );

            const selectedField =
              mapping
                ? fieldByKey.get(
                    mapping.targetKey,
                  )
                : undefined;

            const confidence =
              confidenceText(
                mapping?.confidence,
              );

            return (
              <div
                key={`${column.index}-${column.header}`}
                className="excel-mapping-row"
              >
                <div className="excel-source-column">
                  <span className="excel-column-letter">
                    {
                      column.columnLetter
                    }
                  </span>

                  <div>
                    <strong>
                      {
                        column.header
                      }
                    </strong>

                    <small>
                      Spreadsheet
                      column
                    </small>
                  </div>
                </div>

                <div className="excel-mapping-arrow">
                  →
                </div>

                <div className="excel-target-column">
                  <select
                    value={
                      selectedField?.key ||
                      ""
                    }
                    disabled={
                      disabled
                    }
                    onChange={(
                      event,
                    ) => {
                      const key =
                        event
                          .currentTarget
                          .value;

                      const field =
                        fields.find(
                          (
                            item,
                          ) =>
                            item.key ===
                            key,
                        );

                      const next =
                        setColumnMapping(
                          mappings,
                          column,
                          field ||
                            null,
                          {
                            replaceExistingTarget:
                              true,
                          },
                        );

                      onChange(
                        next,
                      );
                    }}
                  >
                    <option value="">
                      Ignore this
                      column
                    </option>

                    {fields.map(
                      (
                        field,
                      ) => {
                        const mappedElsewhere =
                          mappings.some(
                            (
                              item,
                            ) =>
                              item.targetKey ===
                                field.key &&
                              item.sourceIndex !==
                                column.index,
                          );

                        return (
                          <option
                            key={
                              field.key
                            }
                            value={
                              field.key
                            }
                            disabled={
                              mappedElsewhere
                            }
                          >
                            {
                              field.label
                            }
                            {field.required
                              ? " *"
                              : ""}
                          </option>
                        );
                      },
                    )}
                  </select>

                  {selectedField && (
                    <div className="excel-target-meta">
                      {selectedField.description && (
                        <span>
                          {
                            selectedField.description
                          }
                        </span>
                      )}

                      {showConfidence &&
                        mapping?.automatic &&
                        confidence && (
                          <small>
                            {
                              confidence
                            }
                          </small>
                        )}
                    </div>
                  )}
                </div>
              </div>
            );
          },
        )}
      </div>

      {!columns.length && (
        <div className="excel-empty-mapping">
          No spreadsheet
          columns were found.
        </div>
      )}

      <style jsx>{`
        .excel-column-mapping {
          width: 100%;
          min-width: 0;
        }

        .excel-column-mapping-head {
          display: flex;
          align-items:
            flex-start;
          justify-content:
            space-between;
          gap: 16px;
          margin-bottom: 14px;
        }

        .excel-column-mapping-head h3 {
          margin: 0;
          font-size: 15px;
          line-height: 1.25;
          color:
            var(
              --eds-text,
              #172033
            );
        }

        .excel-column-mapping-head p {
          margin: 5px 0 0;
          max-width: 720px;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
          font-size: 12px;
          line-height: 1.5;
        }

        .excel-mapping-count {
          flex: 0 0 auto;
          padding: 6px 9px;
          border-radius: 999px;
          background:
            var(
              --eds-surface-soft,
              #f1f5f9
            );
          color:
            var(
              --eds-text-muted,
              #475569
            );
          font-size: 11px;
          font-weight: 700;
        }

        .excel-mapping-warning {
          margin-bottom: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: #fff8e6;
          color: #8a5a00;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          font-size: 12px;
          line-height: 1.4;
        }

        .excel-mapping-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .excel-mapping-row {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            28px
            minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          padding: 11px;
          border: 1px solid
            var(
              --eds-border,
              #e2e8f0
            );
          border-radius: 14px;
          background:
            var(
              --eds-surface,
              #ffffff
            );
        }

        .excel-source-column {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .excel-column-letter {
          flex: 0 0 auto;
          width: 30px;
          height: 30px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          background:
            var(
              --eds-surface-soft,
              #f1f5f9
            );
          color:
            var(
              --eds-text-muted,
              #475569
            );
          font-size: 11px;
          font-weight: 800;
        }

        .excel-source-column div,
        .excel-target-column {
          min-width: 0;
        }

        .excel-source-column strong {
          display: block;
          overflow: hidden;
          text-overflow:
            ellipsis;
          white-space: nowrap;
          font-size: 12px;
          color:
            var(
              --eds-text,
              #172033
            );
        }

        .excel-source-column small {
          display: block;
          margin-top: 2px;
          font-size: 10px;
          color:
            var(
              --eds-text-muted,
              #94a3b8
            );
        }

        .excel-mapping-arrow {
          text-align: center;
          color:
            var(
              --eds-text-muted,
              #94a3b8
            );
        }

        .excel-target-column select {
          width: 100%;
          min-height: 38px;
          border: 1px solid
            var(
              --eds-border,
              #d8e0ea
            );
          border-radius: 10px;
          padding: 0 10px;
          background:
            var(
              --eds-surface,
              #ffffff
            );
          color:
            var(
              --eds-text,
              #172033
            );
          font: inherit;
          font-size: 12px;
          outline: none;
        }

        .excel-target-column select:focus {
          border-color:
            var(
              --eds-accent,
              #315efb
            );
        }

        .excel-target-meta {
          margin-top: 4px;
          display: flex;
          justify-content:
            space-between;
          gap: 8px;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
          font-size: 10px;
        }

        .excel-target-meta span {
          overflow: hidden;
          text-overflow:
            ellipsis;
          white-space: nowrap;
        }

        .excel-target-meta small {
          flex: 0 0 auto;
          font-size: 10px;
          font-weight: 700;
        }

        .excel-empty-mapping {
          padding: 24px;
          border: 1px dashed
            var(
              --eds-border,
              #cbd5e1
            );
          border-radius: 14px;
          text-align: center;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
          font-size: 12px;
        }

        @media (
          max-width: 640px
        ) {
          .excel-column-mapping-head {
            flex-direction:
              column;
          }

          .excel-mapping-row {
            grid-template-columns:
              1fr;
          }

          .excel-mapping-arrow {
            display: none;
          }

          .excel-source-column {
            padding-bottom: 4px;
          }
        }
      `}</style>
    </section>
  );
}