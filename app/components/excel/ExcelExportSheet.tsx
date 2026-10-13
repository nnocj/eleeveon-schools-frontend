"use client";

/**
 * app/components/excel/ExcelExportSheet.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — EXPORT / TEMPLATE ACTION SHEET
 * --------------------------------------------------------------------------
 *
 * Generic reusable sheet for:
 * - Download template
 * - Export current records
 * - Export register
 * - Export term totals
 * - Export assessment sheet
 *
 * The caller supplies the actual export actions.
 */

import type {
  ReactNode,
} from "react";

import {
  useEffect,
} from "react";

import { createPortal } from "react-dom";

export interface ExcelExportAction {
  key: string;

  title: string;

  description?: string;

  badge?: string;

  disabled?: boolean;

  onClick: () =>
    | void
    | Promise<void>;
}

export interface ExcelExportSheetProps {
  open: boolean;

  onClose: () => void;

  title?: string;

  subtitle?: string;

  actions: ExcelExportAction[];

  busyKey?: string | null;

  headerContent?: ReactNode;

  footerContent?: ReactNode;

  className?: string;
}

export default function ExcelExportSheet({
  open,
  onClose,
  title = "Excel",
  subtitle =
    "Choose what you want to download.",
  actions,
  busyKey = null,
  headerContent,
  footerContent,
  className = "",
}: ExcelExportSheetProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key ===
          "Escape" &&
        !busyKey
      ) {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, [
    busyKey,
    onClose,
    open,
  ]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        paddingTop:
          "calc(var(--eds-shell-top-offset, 0px) + var(--portal-header-height, 48px) + 10px)",
        paddingRight: "10px",
        paddingBottom:
          "calc(82px + env(safe-area-inset-bottom, 0px))",
        paddingLeft: "10px",
        overflow: "hidden",
      }}
      className={[
        "excel-export-overlay",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
            event.currentTarget &&
          !busyKey
        ) {
          onClose();
        }
      }}
    >
      <section
        style={{
          width: "min(560px, calc(100vw - 20px))",
          maxWidth: "100%",
          maxHeight: "calc(100% - 4px)",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          margin: 0,
        }}
        className="excel-export-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="excel-export-header">
          <div>
            <h2>
              {title}
            </h2>

            <p>
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            aria-label="Close"
            className="excel-export-close"
            disabled={
              Boolean(
                busyKey,
              )
            }
            onClick={
              onClose
            }
          >
            ×
          </button>
        </header>

        {headerContent && (
          <div className="excel-export-extra">
            {
              headerContent
            }
          </div>
        )}

        <div className="excel-export-actions">
          {actions.map(
            (action) => {
              const busy =
                busyKey ===
                action.key;

              const blocked =
                Boolean(
                  busyKey,
                ) &&
                !busy;

              return (
                <button
                  key={
                    action.key
                  }
                  type="button"
                  className="excel-export-action"
                  disabled={
                    action.disabled ||
                    blocked ||
                    busy
                  }
                  onClick={async () => {
                    await action.onClick();
                  }}
                >
                  <span className="excel-export-icon">
                    {busy
                      ? "…"
                      : "XLS"}
                  </span>

                  <span className="excel-export-copy">
                    <span className="excel-export-title-row">
                      <strong>
                        {
                          action.title
                        }
                      </strong>

                      {action.badge && (
                        <small>
                          {
                            action.badge
                          }
                        </small>
                      )}
                    </span>

                    {action.description && (
                      <span className="excel-export-description">
                        {
                          action.description
                        }
                      </span>
                    )}
                  </span>

                  <span className="excel-export-chevron">
                    →
                  </span>
                </button>
              );
            },
          )}
        </div>

        {footerContent && (
          <footer className="excel-export-footer">
            {
              footerContent
            }
          </footer>
        )}

        <style jsx>{`
        .excel-export-overlay {
          --eds-bg: var(--bg, var(--background, #f7f8fb));
          --eds-surface: var(--surface, var(--card, var(--card-bg, #ffffff)));
          --eds-surface-soft: var(
            --surface-2,
            var(
              --muted-surface,
              color-mix(in srgb, var(--eds-surface) 92%, var(--eds-text) 8%)
            )
          );
          --eds-text: var(--text, var(--foreground, #172033));
          --eds-text-muted: var(
            --muted,
            var(
              --muted-foreground,
              color-mix(in srgb, var(--eds-text) 62%, transparent)
            )
          );
          --eds-border: var(
            --border,
            color-mix(in srgb, var(--eds-text) 14%, transparent)
          );
          --eds-accent: var(--primary-color, #2563eb);
          --eds-accent-soft: color-mix(
            in srgb,
            var(--eds-accent) 12%,
            var(--eds-surface)
          );
          color-scheme: light dark;
          color: var(--eds-text);
          position: fixed;
          top: calc(
            var(--eds-shell-top-offset, 0px) +
            var(--portal-header-height, 48px)
          );
          right: 0;
          bottom: calc(
            64px +
            env(safe-area-inset-bottom, 0px)
          );
          left: 0;
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 12px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.48);
          backdrop-filter: blur(5px);
        }

        .excel-export-overlay *,
        .excel-export-overlay *::before,
        .excel-export-overlay *::after {
          box-sizing: border-box;
        }

        .excel-export-overlay button,
        .excel-export-overlay input,
        .excel-export-overlay select,
        .excel-export-overlay textarea {
          font: inherit;
        }

        .excel-export-overlay input,
        .excel-export-overlay select,
        .excel-export-overlay textarea {
          background: var(--eds-surface);
          color: var(--eds-text);
          border-color: var(--eds-border);
        }

        .excel-export-overlay input::placeholder,
        .excel-export-overlay textarea::placeholder {
          color: var(--eds-text-muted);
          opacity: 1;
        }

        .excel-export-overlay select option {
          background: var(--eds-surface);
          color: var(--eds-text);
        }

        .excel-export-overlay strong,
        .excel-export-overlay h1,
        .excel-export-overlay h2,
        .excel-export-overlay h3 {
          color: var(--eds-text);
        }

        .excel-export-overlay small,
        .excel-export-overlay p {
          color: var(--eds-text-muted);
        }

        .excel-export-sheet {
          width: min(560px, calc(100vw - 24px));
          max-width: 100%;
          max-height: min(720px, calc(100% - 8px));
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--eds-border, #e2e8f0);
          border-radius: 22px;
          background: var(--eds-bg, #f7f8fa);
          color: var(--eds-text, #172033);
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26);
        }

        .excel-export-header {
          flex: 0 0 auto;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 17px;
          border-bottom: 1px solid var(--eds-border, #e2e8f0);
          background: var(--eds-surface, #ffffff);
        }

        .excel-export-header h2 {
          margin: 0;
          font-size: 17px;
          color: var(--eds-text, #172033);
        }

        .excel-export-header p {
          margin: 4px 0 0;
          font-size: 11px;
          line-height: 1.45;
          color: var(--eds-text-muted, #64748b);
        }

        .excel-export-header button {
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          border: 1px solid var(--eds-border, #e2e8f0);
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: var(--eds-surface-soft, #f1f5f9);
          color: var(--eds-text, #172033);
          cursor: pointer;
          font-size: 21px;
        }

        .excel-export-header button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .excel-export-extra {
          flex: 0 0 auto;
          padding: 14px 16px 0;
          background: var(--eds-bg, #f7f8fa);
        }

        .excel-export-actions {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 14px 16px;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .excel-export-action {
          width: 100%;
          min-height: 68px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 11px;
          border: 1px solid var(--eds-border, #e2e8f0);
          border-radius: 15px;
          padding: 11px;
          background: var(--eds-surface, #ffffff);
          color: var(--eds-text, #172033);
          text-align: left;
          cursor: pointer;
        }

        .excel-export-action:hover:not(:disabled) {
          border-color: var(--eds-accent, #315efb);
        }

        .excel-export-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .excel-export-icon {
          flex: 0 0 auto;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: var(--eds-accent-soft, #edf2ff);
          color: var(--eds-accent, #315efb);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }

        .excel-export-copy {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .excel-export-title-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
        }

        .excel-export-title-row strong {
          min-width: 0;
          overflow-wrap: anywhere;
          font-size: 12px;
        }

        .excel-export-title-row small {
          flex: 0 0 auto;
          padding: 3px 6px;
          border-radius: 999px;
          background: var(--eds-surface-soft, #f1f5f9);
          color: var(--eds-text-muted, #64748b);
          font-size: 9px;
          font-weight: 700;
        }

        .excel-export-description {
          font-size: 10px;
          line-height: 1.45;
          color: var(--eds-text-muted, #64748b);
        }

        .excel-export-chevron {
          flex: 0 0 auto;
          color: var(--eds-text-muted, #94a3b8);
        }

        .excel-export-footer {
          flex: 0 0 auto;
          padding: 0 16px 16px;
          border-top: 1px solid var(--eds-border, #e2e8f0);
          background: var(--eds-surface, #ffffff);
        }

        @media (min-width: 980px) {
          .excel-export-overlay {
            left: var(--portal-content-left, 0px);
            bottom: 0;
            padding: 20px;
          }
        }

        @media (max-width: 520px) {
          .excel-export-overlay {
            padding: 10px;
          }

          .excel-export-sheet {
            width: calc(100vw - 20px);
            max-height: calc(100% - 4px);
            border-radius: 20px;
          }

          .excel-export-header {
            padding: 15px 14px 12px;
          }

          .excel-export-actions {
            padding: 12px 14px;
          }

          .excel-export-footer {
            padding: 0 14px 12px;
          }
        }

        @media (prefers-color-scheme: dark) {
          .excel-export-overlay {
            background: rgba(2, 6, 23, 0.7);
          }
        }
      `}</style>
      </section>
    </div>
    ),
    document.body,
  );
}
