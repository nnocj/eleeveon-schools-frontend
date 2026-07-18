"use client";

/**
 * app/components/settings/OfflineDataRemovalCard.tsx
 * --------------------------------------------------------------------------
 * Explicit destructive action for removing one account's offline data.
 *
 * This is separate from normal logout.
 */

import {
  useMemo,
  useState,
} from "react";

import { useAccount } from "../../context/account-context";
import { performAtomicLogout } from "../../lib/auth/logout";
import { useOfflineAccountData } from "../../hooks/useOfflineAccountData";

function formatBytes(value: number) {
  if (!value) return "0 B";

  if (value < 1024) {
    return `${value} B`;
  }

  const kb = value / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(
    kb / 1024
  ).toFixed(2)} MB`;
}

export default function OfflineDataRemovalCard() {
  const {
    accountId,
    account,
  } = useAccount() as any;

  const {
    summary,
    loading,
    removing,
    error,
    refresh,
    remove,
  } = useOfflineAccountData(
    accountId,
  );

  const [open, setOpen] =
    useState(false);

  const [confirmed, setConfirmed] =
    useState(false);

  const [confirmationText, setConfirmationText] =
    useState("");

  const requiredPhrase =
    "REMOVE OFFLINE DATA";

  const canRemove =
    confirmed &&
    confirmationText.trim() ===
      requiredPhrase &&
    !removing;

  const warnings = useMemo(
    () => [
      {
        label:
          "Pending records",
        value:
          summary?.pendingRecords ??
          0,
        danger:
          (
            summary?.pendingRecords ??
            0
          ) > 0,
      },
      {
        label:
          "Failed records",
        value:
          summary?.failedRecords ??
          0,
        danger:
          (
            summary?.failedRecords ??
            0
          ) > 0,
      },
      {
        label:
          "Conflicts",
        value:
          summary?.conflictRecords ??
          0,
        danger:
          (
            summary?.conflictRecords ??
            0
          ) > 0,
      },
      {
        label:
          "Unsynced media",
        value:
          summary?.unsyncedMedia ??
          0,
        danger:
          (
            summary?.unsyncedMedia ??
            0
          ) > 0,
      },
    ],
    [summary],
  );

  const handleRemove =
    async () => {
      if (!canRemove) return;

      const result =
        await remove();

      if (!result) return;

      /**
       * Logout after removal prevents the currently authenticated account from
       * immediately downloading the deleted offline data again.
       */
      await performAtomicLogout({
        redirectTo: "/login",
      });
    };

  return (
    <section className="offline-removal-card">
      <style>{css}</style>

      <div className="offline-removal-head">
        <div>
          <span>
            Device storage
          </span>
          <h3>
            Remove this account’s offline data from this device
          </h3>
          <p>
            Normal logout keeps offline school records. Use this action only
            when you deliberately want to erase the local copy for{" "}
            <strong>
              {account?.name ||
                accountId ||
                "this account"}
            </strong>.
          </p>
        </div>

        <button
          type="button"
          className="danger-outline"
          onClick={() => {
            setOpen(true);
            void refresh();
          }}
          disabled={
            !accountId ||
            loading
          }
        >
          {loading
            ? "Checking…"
            : "Review and remove"}
        </button>
      </div>

      {open && (
        <div
          className="offline-removal-overlay"
          role="presentation"
        >
          <section
            className="offline-removal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="offline-removal-title"
          >
            <header>
              <div>
                <span>
                  Destructive action
                </span>
                <h2 id="offline-removal-title">
                  Review offline data before removal
                </h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() =>
                  setOpen(false)
                }
                disabled={removing}
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            {loading && (
              <p className="status-line">
                Checking this account’s local records…
              </p>
            )}

            {error && (
              <p className="error-line">
                {error}
              </p>
            )}

            {summary && (
              <>
                <div className="warning-grid">
                  {warnings.map(
                    (item) => (
                      <article
                        key={
                          item.label
                        }
                        className={
                          item.danger
                            ? "danger"
                            : ""
                        }
                      >
                        <strong>
                          {item.value}
                        </strong>
                        <span>
                          {item.label}
                        </span>
                      </article>
                    ),
                  )}
                </div>

                <div className="sync-summary">
                  <div>
                    <span>
                      Last successful sync
                    </span>
                    <strong>
                      {
                        summary.lastSuccessfulSyncLabel
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Local media size
                    </span>
                    <strong>
                      {formatBytes(
                        summary.mediaBlobBytes,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Total local records
                    </span>
                    <strong>
                      {
                        summary.totalRecords
                      }
                    </strong>
                  </div>
                </div>

                {summary.lastSyncError && (
                  <p className="last-error">
                    Last sync error:{" "}
                    {summary.lastSyncError}
                  </p>
                )}

                {(
                  summary.pendingRecords >
                    0 ||
                  summary.failedRecords >
                    0 ||
                  summary.unsyncedMedia >
                    0
                ) && (
                  <div className="critical-warning">
                    Some local information may not exist in the cloud. Removing
                    it can permanently lose pending school records or media.
                  </div>
                )}

                <details>
                  <summary>
                    View affected tables
                  </summary>

                  <div className="table-list">
                    {summary.tables.map(
                      (table) => (
                        <div
                          key={
                            table.tableName
                          }
                        >
                          <strong>
                            {
                              table.tableName
                            }
                          </strong>
                          <span>
                            {table.total} records ·{" "}
                            {table.pending} pending ·{" "}
                            {table.failed} failed
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </details>

                <label className="confirm-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) =>
                      setConfirmed(
                        event.target
                          .checked,
                      )
                    }
                  />
                  <span>
                    I understand that this deletes only this account’s offline
                    data from this device and cannot restore unsynced records.
                  </span>
                </label>

                <label className="phrase-field">
                  <span>
                    Type{" "}
                    <strong>
                      {requiredPhrase}
                    </strong>{" "}
                    to continue
                  </span>
                  <input
                    value={
                      confirmationText
                    }
                    onChange={(event) =>
                      setConfirmationText(
                        event.target
                          .value,
                      )
                    }
                    autoComplete="off"
                  />
                </label>
              </>
            )}

            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setOpen(false)
                }
                disabled={removing}
              >
                Cancel
              </button>

              <button
                type="button"
                className="danger"
                disabled={
                  !summary ||
                  !canRemove
                }
                onClick={() => {
                  void handleRemove();
                }}
              >
                {removing
                  ? "Removing…"
                  : "Remove offline data"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

const css = `
.offline-removal-card {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 22px;
  background: var(--surface, #fff);
  padding: 16px;
}

.offline-removal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.offline-removal-head > div {
  min-width: 0;
}

.offline-removal-head span,
.offline-removal-dialog header span {
  display: block;
  color: #dc2626;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.offline-removal-head h3 {
  margin: 4px 0 6px;
  font-size: 16px;
  color: var(--text, #111827);
}

.offline-removal-head p {
  margin: 0;
  max-width: 720px;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.55;
}

.danger-outline,
.offline-removal-dialog button {
  min-height: 40px;
  border-radius: 13px;
  padding: 0 14px;
  font-weight: 900;
  cursor: pointer;
}

.danger-outline {
  flex: 0 0 auto;
  border: 1px solid rgba(220,38,38,.28);
  background: rgba(220,38,38,.07);
  color: #dc2626;
}

.offline-removal-overlay {
  position: fixed;
  inset: 0;
  z-index: 7000;
  padding: 16px;
  display: grid;
  place-items: center;
  background: rgba(15,23,42,.62);
  overflow: auto;
}

.offline-removal-dialog {
  width: min(720px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  border-radius: 24px;
  padding: 18px;
  background: var(--surface, #fff);
  color: var(--text, #111827);
  box-shadow: 0 30px 90px rgba(15,23,42,.28);
}

.offline-removal-dialog header,
.offline-removal-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.offline-removal-dialog header h2 {
  margin: 4px 0 0;
  font-size: 20px;
}

.close-button {
  width: 38px;
  padding: 0 !important;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: inherit;
}

.warning-grid {
  margin: 18px 0 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.warning-grid article {
  min-width: 0;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--bg, #f8fafc);
}

.warning-grid article.danger {
  border-color: rgba(220,38,38,.25);
  background: rgba(220,38,38,.06);
}

.warning-grid strong,
.warning-grid span {
  display: block;
}

.warning-grid strong {
  font-size: 22px;
}

.warning-grid span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

.sync-summary {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.sync-summary div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--bg, #f8fafc);
}

.sync-summary span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 800;
}

.sync-summary strong {
  text-align: right;
  font-size: 12px;
}

.critical-warning,
.last-error,
.error-line,
.status-line {
  margin: 10px 0;
  border-radius: 14px;
  padding: 11px 12px;
  font-size: 12px;
  line-height: 1.5;
}

.critical-warning,
.error-line,
.last-error {
  background: rgba(220,38,38,.08);
  color: #b91c1c;
}

.status-line {
  background: var(--bg, #f8fafc);
  color: var(--muted, #64748b);
}

details {
  margin: 12px 0;
}

details summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.table-list {
  margin-top: 8px;
  max-height: 180px;
  overflow: auto;
  display: grid;
  gap: 5px;
}

.table-list div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 11px;
  background: var(--bg, #f8fafc);
}

.table-list strong,
.table-list span {
  font-size: 11px;
}

.table-list span {
  color: var(--muted, #64748b);
  text-align: right;
}

.confirm-check {
  margin: 14px 0;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 12px;
  line-height: 1.5;
}

.confirm-check input {
  margin-top: 3px;
}

.phrase-field {
  display: grid;
  gap: 6px;
}

.phrase-field span {
  color: var(--muted, #64748b);
  font-size: 12px;
}

.phrase-field input {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--border, rgba(0,0,0,.12));
  border-radius: 13px;
  padding: 0 12px;
  background: var(--input-bg, #fff);
  color: var(--text, #111827);
  font: inherit;
}

.offline-removal-dialog footer {
  margin-top: 18px;
  justify-content: flex-end;
}

.offline-removal-dialog footer .secondary {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: inherit;
}

.offline-removal-dialog footer .danger {
  border: 0;
  background: #dc2626;
  color: #fff;
}

.offline-removal-dialog button:disabled {
  opacity: .55;
  cursor: not-allowed;
}

@media (max-width: 680px) {
  .offline-removal-head {
    align-items: stretch;
    flex-direction: column;
  }

  .danger-outline {
    width: 100%;
  }

  .warning-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }

  .offline-removal-dialog footer {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
`;