"use client";

/**
 * app/components/excel/ExcelImportErrors.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — IMPORT ISSUES
 * --------------------------------------------------------------------------
 *
 * Generic error/warning/info renderer for Excel validation issues.
 */

import {
  useMemo,
  useState,
} from "react";

import type {
  ExcelValidationIssue,
  ExcelValidationSeverity,
} from "../../lib/excel/excelTypes";

export interface ExcelImportErrorsProps {
  issues: ExcelValidationIssue[];

  title?: string;

  maxVisible?: number;

  showSeverityFilters?: boolean;

  className?: string;
}

function severityLabel(
  severity: ExcelValidationSeverity,
) {
  switch (severity) {
    case "error":
      return "Error";

    case "warning":
      return "Warning";

    case "info":
    default:
      return "Info";
  }
}

export default function ExcelImportErrors({
  issues,
  title = "Import issues",
  maxVisible = 12,
  showSeverityFilters = true,
  className = "",
}: ExcelImportErrorsProps) {
  const [
    filter,
    setFilter,
  ] = useState<
    | "all"
    | ExcelValidationSeverity
  >("all");

  const [
    expanded,
    setExpanded,
  ] = useState(false);

  const counts =
    useMemo(
      () => ({
        error:
          issues.filter(
            (issue) =>
              issue.severity ===
              "error",
          ).length,

        warning:
          issues.filter(
            (issue) =>
              issue.severity ===
              "warning",
          ).length,

        info:
          issues.filter(
            (issue) =>
              issue.severity ===
              "info",
          ).length,
      }),
      [issues],
    );

  const filtered =
    useMemo(
      () =>
        filter === "all"
          ? issues
          : issues.filter(
              (issue) =>
                issue.severity ===
                filter,
            ),
      [
        filter,
        issues,
      ],
    );

  const visible =
    expanded
      ? filtered
      : filtered.slice(
          0,
          maxVisible,
        );

  if (!issues.length) {
    return null;
  }

  return (
    <section
      className={[
        "excel-import-errors",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="excel-errors-head">
        <div>
          <h3>
            {title}
          </h3>

          <p>
            Review these items
            before completing the
            import.
          </p>
        </div>

        <span className="excel-errors-total">
          {
            issues.length
          }
        </span>
      </div>

      {showSeverityFilters && (
        <div className="excel-error-filters">
          <button
            type="button"
            className={
              filter === "all"
                ? "active"
                : ""
            }
            onClick={() =>
              setFilter(
                "all",
              )
            }
          >
            All{" "}
            <span>
              {
                issues.length
              }
            </span>
          </button>

          <button
            type="button"
            className={[
              filter ===
              "error"
                ? "active"
                : "",
              "error",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() =>
              setFilter(
                "error",
              )
            }
          >
            Errors{" "}
            <span>
              {
                counts.error
              }
            </span>
          </button>

          <button
            type="button"
            className={[
              filter ===
              "warning"
                ? "active"
                : "",
              "warning",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() =>
              setFilter(
                "warning",
              )
            }
          >
            Warnings{" "}
            <span>
              {
                counts.warning
              }
            </span>
          </button>

          {counts.info >
            0 && (
            <button
              type="button"
              className={
                filter ===
                "info"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setFilter(
                  "info",
                )
              }
            >
              Info{" "}
              <span>
                {
                  counts.info
                }
              </span>
            </button>
          )}
        </div>
      )}

      <div className="excel-issues-list">
        {visible.map(
          (
            issue,
            index,
          ) => (
            <article
              key={`${issue.code}-${issue.rowNumber ?? "global"}-${issue.columnIndex ?? "none"}-${index}`}
              className={`excel-issue ${issue.severity}`}
            >
              <div className="excel-issue-badge">
                {severityLabel(
                  issue.severity,
                )}
              </div>

              <div className="excel-issue-copy">
                <strong>
                  {
                    issue.message
                  }
                </strong>

                <div className="excel-issue-meta">
                  {issue.rowNumber !==
                    undefined && (
                    <span>
                      Row{" "}
                      {
                        issue.rowNumber
                      }
                    </span>
                  )}

                  {issue.sourceHeader && (
                    <span>
                      {
                        issue.sourceHeader
                      }
                    </span>
                  )}

                  {issue.targetKey && (
                    <span>
                      Field:{" "}
                      {
                        issue.targetKey
                      }
                    </span>
                  )}

                  {issue.value !==
                    undefined &&
                    issue.value !==
                      null &&
                    String(
                      issue.value,
                    ).trim() !==
                      "" && (
                      <span>
                        Value:{" "}
                        {String(
                          issue.value,
                        )}
                      </span>
                    )}
                </div>
              </div>
            </article>
          ),
        )}
      </div>

      {filtered.length >
        maxVisible && (
        <button
          type="button"
          className="excel-errors-toggle"
          onClick={() =>
            setExpanded(
              (value) =>
                !value,
            )
          }
        >
          {expanded
            ? "Show fewer"
            : `Show all ${filtered.length}`}
        </button>
      )}

      <style jsx>{`
        .excel-import-errors {
          width: 100%;
        }

        .excel-errors-head {
          display: flex;
          align-items:
            flex-start;
          justify-content:
            space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .excel-errors-head h3 {
          margin: 0;
          font-size: 14px;
          color:
            var(
              --eds-text,
              #172033
            );
        }

        .excel-errors-head p {
          margin: 4px 0 0;
          font-size: 11px;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
        }

        .excel-errors-total {
          min-width: 28px;
          height: 28px;
          padding: 0 7px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background:
            var(
              --eds-surface-soft,
              #f1f5f9
            );
          font-size: 11px;
          font-weight: 800;
        }

        .excel-error-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 10px;
        }

        .excel-error-filters button {
          min-height: 30px;
          border: 1px solid
            var(
              --eds-border,
              #e2e8f0
            );
          border-radius: 999px;
          padding: 0 10px;
          background:
            var(
              --eds-surface,
              #ffffff
            );
          color:
            var(
              --eds-text-muted,
              #64748b
            );
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
        }

        .excel-error-filters button.active {
          border-color:
            var(
              --eds-text,
              #172033
            );
          color:
            var(
              --eds-text,
              #172033
            );
        }

        .excel-error-filters span {
          margin-left: 4px;
          opacity: 0.75;
        }

        .excel-issues-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .excel-issue {
          display: flex;
          align-items:
            flex-start;
          gap: 10px;
          padding: 10px 11px;
          border-radius: 12px;
          border: 1px solid
            var(
              --eds-border,
              #e2e8f0
            );
          background:
            var(
              --eds-surface,
              #ffffff
            );
        }

        .excel-issue.error {
          border-color:
            #ffd3cf;
          background:
            #fff8f7;
        }

        .excel-issue.warning {
          border-color:
            #f8dfa5;
          background:
            #fffaf0;
        }

        .excel-issue.info {
          border-color:
            #d7e4ff;
          background:
            #f7f9ff;
        }

        .excel-issue-badge {
          flex: 0 0 auto;
          padding: 4px 6px;
          border-radius: 7px;
          background:
            var(
              --eds-surface-soft,
              #f1f5f9
            );
          font-size: 9px;
          font-weight: 800;
          text-transform:
            uppercase;
          letter-spacing: 0.04em;
        }

        .excel-issue.error
          .excel-issue-badge {
          color: #b42318;
          background: #ffe9e7;
        }

        .excel-issue.warning
          .excel-issue-badge {
          color: #8a5a00;
          background: #fff0c7;
        }

        .excel-issue.info
          .excel-issue-badge {
          color: #315efb;
          background: #e9efff;
        }

        .excel-issue-copy {
          min-width: 0;
          flex: 1;
        }

        .excel-issue-copy strong {
          display: block;
          font-size: 11px;
          line-height: 1.45;
          color:
            var(
              --eds-text,
              #172033
            );
        }

        .excel-issue-meta {
          margin-top: 4px;
          display: flex;
          flex-wrap: wrap;
          gap: 5px 10px;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
          font-size: 10px;
        }

        .excel-errors-toggle {
          margin-top: 10px;
          min-height: 34px;
          border: 0;
          border-radius: 10px;
          padding: 0 12px;
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
      `}</style>
    </section>
  );
}