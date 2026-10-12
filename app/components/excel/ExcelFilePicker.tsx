"use client";

/**
 * app/components/excel/ExcelFilePicker.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — FILE PICKER
 * --------------------------------------------------------------------------
 *
 * Reusable Excel workbook picker.
 *
 * Responsibilities:
 * - accept .xlsx/.xls/.xlsm/.xlsb files;
 * - support click-to-select;
 * - support drag/drop;
 * - show selected file information;
 * - expose validation errors without parsing workbook contents itself.
 *
 * Domain-agnostic.
 */

import {
  useCallback,
  useRef,
  useState,
} from "react";

export interface ExcelFilePickerProps {
  value?: File | null;

  onChange: (file: File | null) => void;

  disabled?: boolean;

  label?: string;

  description?: string;

  error?: string | null;

  /**
   * Maximum accepted file size in bytes.
   *
   * Defaults to 20 MB.
   */
  maxFileSize?: number;

  className?: string;
}

const DEFAULT_MAX_FILE_SIZE =
  20 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = [
  ".xlsx",
  ".xls",
  ".xlsm",
  ".xlsb",
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes =
    bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(
      kilobytes >= 100 ? 0 : 1,
    )} KB`;
  }

  const megabytes =
    kilobytes / 1024;

  return `${megabytes.toFixed(
    megabytes >= 100 ? 0 : 1,
  )} MB`;
}

function fileExtension(
  fileName: string,
) {
  const index =
    fileName.lastIndexOf(".");

  if (index < 0) {
    return "";
  }

  return fileName
    .slice(index)
    .toLowerCase();
}

export default function ExcelFilePicker({
  value = null,
  onChange,
  disabled = false,
  label = "Choose Excel workbook",
  description =
    "Select an Excel workbook or drag it here.",
  error = null,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  className = "",
}: ExcelFilePickerProps) {
  const inputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const [
    dragging,
    setDragging,
  ] = useState(false);

  const [
    localError,
    setLocalError,
  ] = useState<string | null>(
    null,
  );

  const validateAndSelect =
    useCallback(
      (file: File | null) => {
        setLocalError(null);

        if (!file) {
          onChange(null);
          return;
        }

        const extension =
          fileExtension(
            file.name,
          );

        if (
          !ACCEPTED_EXTENSIONS.includes(
            extension,
          )
        ) {
          setLocalError(
            "Please select an Excel workbook (.xlsx, .xls, .xlsm or .xlsb).",
          );

          return;
        }

        if (
          maxFileSize > 0 &&
          file.size > maxFileSize
        ) {
          setLocalError(
            `This workbook is too large. Maximum size is ${formatBytes(
              maxFileSize,
            )}.`,
          );

          return;
        }

        onChange(file);
      },
      [
        maxFileSize,
        onChange,
      ],
    );

  const openPicker =
    useCallback(() => {
      if (disabled) {
        return;
      }

      inputRef.current?.click();
    }, [disabled]);

  return (
    <div
      className={[
        "excel-file-picker",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={inputRef}
        className="excel-file-picker-input"
        type="file"
        accept=".xlsx,.xls,.xlsm,.xlsb,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        disabled={disabled}
        onChange={(event) => {
          const file =
            event.target.files?.[0] ||
            null;

          validateAndSelect(
            file,
          );

          /**
           * Reset the native value so selecting the same workbook
           * again still fires onChange.
           */
          event.currentTarget.value =
            "";
        }}
      />

      {value ? (
        <div className="excel-file-selected">
          <div className="excel-file-selected-main">
            <div className="excel-file-icon">
              XLS
            </div>

            <div className="excel-file-selected-copy">
              <strong>
                {value.name}
              </strong>

              <span>
                {formatBytes(
                  value.size,
                )}
              </span>
            </div>
          </div>

          <div className="excel-file-selected-actions">
            <button
              type="button"
              className="excel-file-button secondary"
              disabled={disabled}
              onClick={
                openPicker
              }
            >
              Replace
            </button>

            <button
              type="button"
              className="excel-file-button danger"
              disabled={disabled}
              onClick={() =>
                validateAndSelect(
                  null,
                )
              }
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={[
            "excel-file-dropzone",
            dragging
              ? "is-dragging"
              : "",
            disabled
              ? "is-disabled"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={disabled}
          onClick={
            openPicker
          }
          onDragEnter={(
            event,
          ) => {
            event.preventDefault();

            if (!disabled) {
              setDragging(
                true,
              );
            }
          }}
          onDragOver={(
            event,
          ) => {
            event.preventDefault();

            if (!disabled) {
              setDragging(
                true,
              );
            }
          }}
          onDragLeave={(
            event,
          ) => {
            event.preventDefault();

            setDragging(
              false,
            );
          }}
          onDrop={(
            event,
          ) => {
            event.preventDefault();

            setDragging(
              false,
            );

            if (disabled) {
              return;
            }

            const file =
              event.dataTransfer
                .files?.[0] ||
              null;

            validateAndSelect(
              file,
            );
          }}
        >
          <span className="excel-file-dropzone-icon">
            XLS
          </span>

          <span className="excel-file-dropzone-copy">
            <strong>
              {label}
            </strong>

            <span>
              {description}
            </span>

            <small>
              XLSX, XLS, XLSM or
              XLSB · max{" "}
              {formatBytes(
                maxFileSize,
              )}
            </small>
          </span>
        </button>
      )}

      {(error ||
        localError) && (
        <div
          className="excel-file-error"
          role="alert"
        >
          {error ||
            localError}
        </div>
      )}

      <style jsx>{`
        .excel-file-picker {
          width: 100%;
          min-width: 0;
        }

        .excel-file-picker-input {
          display: none;
        }

        .excel-file-dropzone {
          width: 100%;
          min-height: 150px;
          padding: 22px;
          border: 1.5px dashed
            var(
              --eds-border,
              #cbd5e1
            );
          border-radius: 18px;
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
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          text-align: left;
          cursor: pointer;
          transition:
            border-color 0.18s
              ease,
            background 0.18s
              ease,
            transform 0.18s
              ease;
        }

        .excel-file-dropzone:hover,
        .excel-file-dropzone.is-dragging {
          border-color:
            var(
              --eds-accent,
              #315efb
            );
          background:
            var(
              --eds-accent-soft,
              #f5f8ff
            );
        }

        .excel-file-dropzone.is-dragging {
          transform:
            scale(1.005);
        }

        .excel-file-dropzone.is-disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .excel-file-dropzone-icon,
        .excel-file-icon {
          flex: 0 0 auto;
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          background:
            var(
              --eds-accent-soft,
              #edf2ff
            );
          color:
            var(
              --eds-accent,
              #315efb
            );
        }

        .excel-file-dropzone-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .excel-file-dropzone-copy strong {
          font-size: 14px;
        }

        .excel-file-dropzone-copy span {
          font-size: 13px;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
        }

        .excel-file-dropzone-copy small {
          font-size: 11px;
          color:
            var(
              --eds-text-muted,
              #94a3b8
            );
        }

        .excel-file-selected {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content:
            space-between;
          gap: 12px;
          padding: 14px;
          border: 1px solid
            var(
              --eds-border,
              #e2e8f0
            );
          border-radius: 16px;
          background:
            var(
              --eds-surface,
              #ffffff
            );
        }

        .excel-file-selected-main {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .excel-file-selected-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .excel-file-selected-copy strong {
          min-width: 0;
          overflow: hidden;
          text-overflow:
            ellipsis;
          white-space: nowrap;
          font-size: 13px;
        }

        .excel-file-selected-copy span {
          font-size: 11px;
          color:
            var(
              --eds-text-muted,
              #64748b
            );
        }

        .excel-file-selected-actions {
          flex: 0 0 auto;
          display: flex;
          gap: 8px;
        }

        .excel-file-button {
          min-height: 34px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid
            var(
              --eds-border,
              #d8e0ea
            );
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
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
        }

        .excel-file-button.danger {
          color: #b42318;
        }

        .excel-file-button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .excel-file-error {
          margin-top: 8px;
          padding: 10px 12px;
          border-radius: 12px;
          background: #fff1f0;
          color: #b42318;
          font-size: 12px;
          line-height: 1.45;
        }

        @media (
          max-width: 520px
        ) {
          .excel-file-dropzone {
            min-height: 130px;
            padding: 18px;
          }

          .excel-file-selected {
            align-items:
              flex-start;
            flex-direction:
              column;
          }

          .excel-file-selected-actions {
            width: 100%;
          }

          .excel-file-button {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}