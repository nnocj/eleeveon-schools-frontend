"use client";

/**
 * app/components/excel/ExcelImportPreview.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — IMPORT PREVIEW
 * --------------------------------------------------------------------------
 *
 * Generic preview component used after parsing/validation and before commit.
 *
 * Caller supplies columns because the component deliberately has no knowledge
 * of Student, Attendance or Assessment records.
 */

import {
  useMemo,
  useState,
} from "react";

import type {
  ExcelProcessedRow,
  ExcelValidationResult,
} from "../../lib/excel/excelTypes";

import ExcelImportErrors from "./ExcelImportErrors";

export interface ExcelImportPreviewColumn<T> {
  key: string;

  label: string;

  width?: number | string;

  render?: (
    row: T,
    processedRow: ExcelProcessedRow<T>,
  ) => React.ReactNode;
}

export interface ExcelImportPreviewProps<T> {
  validation:
    ExcelValidationResult<T>;

  columns:
    ExcelImportPreviewColumn<T>[];

  title?: string;

  description?: string;

  maxRows?: number;

  emptyText?: string;

  showIssues?: boolean;

  className?: string;
}

export default function ExcelImportPreview<T>({
  validation,
  columns,
  title = "Import preview",
  description =
    "Review the data before it is added to Eleeveon.",
  maxRows = 20,
  emptyText =
    "No rows are available to preview.",
  showIssues = true,
  className = "",
}: ExcelImportPreviewProps<T>) {
  const [
    showAll,
    setShowAll,
  ] = useState(false);

  const visibleRows =
    useMemo(
      () =>
        showAll
          ? validation.rows
          : validation.rows.slice(
              0,
              maxRows,
            ),
      [
        maxRows,
        showAll,
        validation.rows,
      ],
    );

  return (
    <section
      className={[
        "excel-import-preview",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="excel-preview-head">
        <div>
          <h3>
            {title}
          </h3>

          <p>
            {description}
          </p>
        </div>
      </div>

      <div className="excel-preview-stats">
        <div>
          <strong>
            {
              validation.totalRows
            }
          </strong>
          <span>
            Rows
          </span>
        </div>

        <div className="success">
          <strong>
            {
              validation.validRows
            }
          </strong>
          <span>
            Ready
          </span>
        </div>

        <div
          className={
            validation.invalidRows
              ? "danger"
              : ""
          }
        >
          <strong>
            {
              validation.invalidRows
            }
          </strong>
          <span>
            Errors
          </span>
        </div>

        <div
          className={
            validation.warningRows
              ? "warning"
              : ""
          }
        >
          <strong>
            {
              validation.warningRows
            }
          </strong>
          <span>
            Warnings
          </span>
        </div>
      </div>

      {validation.rows.length ? (
        <>
          <div className="excel-preview-table-wrap">
            <table className="excel-preview-table">
              <thead>
                <tr>
                  <th className="excel-row-number">
                    Row
                  </th>

                  <th className="excel-row-status">
                    Status
                  </th>

                  {columns.map(
                    (
                      column,
                    ) => (
                      <th
                        key={
                          column.key
                        }
                        style={
                          column.width
                            ? {
                                width:
                                  column.width,
                              }
                            : undefined
                        }
                      >
                        {
                          column.label
                        }
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {visibleRows.map(
                  (
                    row,
                    rowIndex,
                  ) => (
                    <tr
                      key={`${row.rowNumber}-${rowIndex}`}
                      className={
                        row.valid
                          ? ""
                          : "invalid"
                      }
                    >
                      <td className="excel-row-number">
                        {
                          row.rowNumber
                        }
                      </td>

                      <td className="excel-row-status">
                        {row.valid ? (
                          row.issues.some(
                            (
                              issue,
                            ) =>
                              issue.severity ===
                              "warning",
                          ) ? (
                            <span className="preview-status warning">
                              Warning
                            </span>
                          ) : (
                            <span className="preview-status ready">
                              Ready
                            </span>
                          )
                        ) : (
                          <span className="preview-status error">
                            Error
                          </span>
                        )}
                      </td>

                      {columns.map(
                        (
                          column,
                        ) => {
                          const value =
                            (
                              row.data as Record<
                                string,
                                unknown
                              >
                            )[
                              column.key
                            ];

                          return (
                            <td
                              key={
                                column.key
                              }
                            >
                              {column.render
                                ? column.render(
                                    row.data,
                                    row,
                                  )
                                : value ===
                                      null ||
                                    value ===
                                      undefined ||
                                    String(
                                      value,
                                    ) ===
                                      ""
                                ? "—"
                                : String(
                                    value,
                                  )}
                            </td>
                          );
                        },
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {validation.rows.length >
            maxRows && (
            <button
              type="button"
              className="excel-preview-toggle"
              onClick={() =>
                setShowAll(
                  (value) =>
                    !value,
                )
              }
            >
              {showAll
                ? `Show first ${maxRows}`
                : `Show all ${validation.rows.length} rows`}
            </button>
          )}
        </>
      ) : (
        <div className="excel-preview-empty">
          {emptyText}
        </div>
      )}

      {showIssues &&
        validation.issues.length >
          0 && (
          <div className="excel-preview-issues">
            <ExcelImportErrors
              issues={
                validation.issues
              }
            />
          </div>
        )}

      <style jsx>{`
        .excel-import-preview {
          width: 100%;
          min-width: 0;
        }

        .excel-preview-head h3 {
          margin: 0;
          font-size: 15px;
          color:
            var(
              --eds-text,
              #172033
            );
        }

        .excel-preview-head p {
          margin: 4px 0 0;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
          font-size: 12px;
          line-height: 1.5;
        }

        .excel-preview-stats {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 8px;
          margin: 14px 0;
        }

        .excel-preview-stats > div {
          min-width: 0;
          padding: 10px;
          border-radius: 12px;
          background:
            var(
              --eds-surface-soft,
              #f4f6f8
            );
        }

        .excel-preview-stats strong {
          display: block;
          font-size: 17px;
          color:
            var(
              --eds-text,
              #172033
            );
        }

        .excel-preview-stats span {
          display: block;
          margin-top: 2px;
          font-size: 10px;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
        }

        .excel-preview-stats
          .success {
          background: #eefbf4;
        }

        .excel-preview-stats
          .danger {
          background: #fff1f0;
        }

        .excel-preview-stats
          .warning {
          background: #fff8e6;
        }

        .excel-preview-table-wrap {
          width: 100%;
          overflow-x: auto;
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

        .excel-preview-table {
          width: 100%;
          min-width: 620px;
          border-collapse:
            collapse;
          font-size: 11px;
        }

        .excel-preview-table th,
        .excel-preview-table td {
          padding: 9px 10px;
          border-bottom: 1px solid
            var(
              --eds-border,
              #edf0f4
            );
          text-align: left;
          vertical-align: top;
          white-space: nowrap;
        }

        .excel-preview-table th {
          position: sticky;
          top: 0;
          z-index: 1;
          background:
            var(
              --eds-surface-soft,
              #f7f8fa
            );
          color:
            var(
              --eds-text-muted,
              #475569
            );
          font-size: 10px;
          font-weight: 800;
        }

        .excel-preview-table tr.invalid {
          background:
            #fffafa;
        }

        .excel-preview-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .excel-row-number {
          width: 52px;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
        }

        .excel-row-status {
          width: 82px;
        }

        .preview-status {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 800;
        }

        .preview-status.ready {
          background: #e9f9f0;
          color: #18794e;
        }

        .preview-status.warning {
          background: #fff1c9;
          color: #8a5a00;
        }

        .preview-status.error {
          background: #ffe9e7;
          color: #b42318;
        }

        .excel-preview-toggle {
          margin-top: 8px;
          min-height: 34px;
          padding: 0 12px;
          border: 0;
          border-radius: 10px;
          background:
            var(
              --eds-surface-soft,
              #f1f5f9
            );
          color:
            var(
              --eds-text,
              #172033
            );
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
        }

        .excel-preview-empty {
          margin-top: 14px;
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

        .excel-preview-issues {
          margin-top: 18px;
        }

        @media (
          max-width: 600px
        ) {
          .excel-preview-stats {
            grid-template-columns:
              repeat(
                2,
                minmax(
                  0,
                  1fr
                )
              );
          }
        }
      `}</style>
    </section>
  );
}