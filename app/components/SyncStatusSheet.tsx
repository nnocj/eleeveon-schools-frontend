"use client";

/**
 * app/components/SyncStatusSheet.tsx
 * --------------------------------------------------------------------------
 * User-facing system status, recovery, and refresh panel.
 */

import {
  useSystemStatus,
} from "../hooks/useSystemStatus";

import {
  useSyncContext,
} from "../context/sync-context";

import SyncStatusStrip from "./SyncStatusStrip";

function formatTime(
  value?: number | null,
) {
  if (!value) return "Never";

  return new Date(
    value,
  ).toLocaleString(
    "en-GH",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}

function StatusRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?:
    | "neutral"
    | "good"
    | "warning"
    | "danger";
}) {
  return (
    <div className="system-status-row">
      <span>
        {label}
      </span>
      <strong
        data-tone={tone}
      >
        {value}
      </strong>
    </div>
  );
}

export default function SyncStatusSheet() {
  const {
    statusSheetOpen,
    closeStatusSheet,
  } = useSyncContext();

  const {
    status,
    actionState,
    actions,
  } = useSystemStatus();

  if (!statusSheetOpen) {
    return null;
  }

  const busy =
    Boolean(
      actionState.activeAction,
    );

  const actionItems = [
    {
      key: "refresh-data",
      label: "Refresh data",
      note: "Push and pull now",
      action:
        actions.refreshData,
    },
    {
      key: "retry-failed",
      label:
        "Retry failed records",
      note:
        `${status.failedChanges} currently failed`,
      action:
        actions.retryFailedRecords,
    },
    {
      key: "reconnect-live",
      label:
        "Reconnect live updates",
      note:
        status.realtimeStatus,
      action:
        actions.reconnectRealtime,
    },
    {
      key: "check-update",
      label:
        "Check for app update",
      note:
        status.updateAvailable
          ? "Update detected"
          : status
              .applicationVersion
              .appVersion,
      action:
        actions.checkForAppUpdate,
    },
    {
      key: "export-backup",
      label:
        "Export offline backup",
      note:
        "Save local account data",
      action:
        actions.exportOfflineBackup,
    },
    {
      key: "repair-media",
      label:
        "Repair media records",
      note:
        "Check mixed or orphaned media",
      action:
        actions.repairMediaRecords,
    },
    {
      key: "remove-offline",
      label:
        "Remove offline account data",
      note:
        "Separate from logout",
      action: () => {
        closeStatusSheet();
        actions.openOfflineRemoval();
      },
      danger: true,
    },
  ];

  return (
    <div
      className="system-status-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          closeStatusSheet();
        }
      }}
    >
      <style>{css}</style>

      <aside
        className="system-status-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-status-title"
      >
        <header>
          <div>
            <span>
              System status
            </span>
            <h2
              id="system-status-title"
            >
              Data, connection and device
            </h2>
          </div>

          <button
            type="button"
            className="system-close"
            onClick={
              closeStatusSheet
            }
            aria-label="Close system status"
          >
            ✕
          </button>
        </header>

        <section className="system-status-summary">
          <SyncStatusStrip />
        </section>

        <section className="system-status-grid">
          <StatusRow
            label="Connection"
            value={
              status.online
                ? "Online"
                : "Offline"
            }
            tone={
              status.online
                ? "good"
                : "warning"
            }
          />

          <StatusRow
            label="Live updates"
            value={
              status
                .realtimeConnected
                ? "Connected"
                : status
                    .realtimeStatus
            }
            tone={
              status
                .realtimeConnected
                ? "good"
                : "warning"
            }
          />

          <StatusRow
            label="Last successful push"
            value={formatTime(
              status
                .lastSuccessfulPush,
            )}
          />

          <StatusRow
            label="Last successful pull"
            value={formatTime(
              status
                .lastSuccessfulPull,
            )}
          />

          <StatusRow
            label="Pending changes"
            value={
              status.pendingChanges
            }
            tone={
              status.pendingChanges
                ? "warning"
                : "good"
            }
          />

          <StatusRow
            label="Failed changes"
            value={
              status.failedChanges
            }
            tone={
              status.failedChanges
                ? "danger"
                : "good"
            }
          />

          <StatusRow
            label="Database version"
            value={`${
              status.databaseVersion ??
              "—"
            } / ${
              status.targetDatabaseVersion
            }`}
            tone={
              status.databaseVersion ===
              status.targetDatabaseVersion
                ? "good"
                : "warning"
            }
          />

          <StatusRow
            label="Application version"
            value={
              status
                .applicationVersion
                .appVersion
            }
          />

          <StatusRow
            label="Application update"
            value={
              status.updateAvailable
                ? "Available"
                : "Up to date"
            }
            tone={
              status.updateAvailable
                ? "warning"
                : "good"
            }
          />

          <StatusRow
            label="Current account"
            value={
              status.currentAccountName ||
              status.currentAccountId ||
              "None"
            }
          />

          <StatusRow
            label="Current branch"
            value={
              status.currentBranchName ||
              "None"
            }
          />
        </section>

        {status.lastSyncError && (
          <div className="system-error">
            <strong>
              Sync needs attention
            </strong>
            <span>
              {
                status.lastSyncError
              }
            </span>
          </div>
        )}

        {actionState.actionError && (
          <div className="system-error">
            {
              actionState.actionError
            }
          </div>
        )}

        {actionState.actionMessage && (
          <div className="system-success">
            {
              actionState.actionMessage
            }
          </div>
        )}

        <section className="system-actions">
          <div className="system-section-title">
            Actions
          </div>

          {actionItems.map(
            (item) => (
              <button
                key={item.key}
                type="button"
                className={
                  item.danger
                    ? "danger"
                    : ""
                }
                disabled={
                  busy &&
                  actionState
                    .activeAction !==
                    item.key
                }
                onClick={() => {
                  void item.action();
                }}
              >
                <span>
                  <strong>
                    {
                      actionState
                        .activeAction ===
                      item.key
                        ? "Working…"
                        : item.label
                    }
                  </strong>
                  <small>
                    {item.note}
                  </small>
                </span>
                <b>›</b>
              </button>
            ),
          )}
        </section>
      </aside>
    </div>
  );
}

const css = `
.system-status-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  justify-content: flex-end;
  background: rgba(15,23,42,.48);
  backdrop-filter: blur(4px);
}

.system-status-sheet {
  width: min(430px, 100%);
  height: 100%;
  overflow: auto;
  padding: 18px;
  background: var(--surface, #fff);
  color: var(--text, #111827);
  box-shadow: -18px 0 55px rgba(15,23,42,.18);
}

.system-status-sheet header {
  position: sticky;
  top: -18px;
  z-index: 2;
  margin: -18px -18px 16px;
  padding: 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.09));
  background: var(--surface, #fff);
}

.system-status-sheet header span,
.system-section-title {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.system-status-sheet h2 {
  margin: 4px 0 0;
  font-size: 19px;
}

.system-close {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 12px;
  background: var(--surface, #fff);
  color: inherit;
  cursor: pointer;
}

.system-status-summary {
  margin-bottom: 14px;
}

.system-status-summary .sync-strip {
  box-shadow: none;
  background: var(--bg, #f8fafc);
}

.system-status-grid {
  display: grid;
  gap: 6px;
}

.system-status-row {
  min-height: 42px;
  padding: 9px 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 13px;
  background: var(--bg, #f8fafc);
}

.system-status-row span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 800;
}

.system-status-row strong {
  max-width: 58%;
  text-align: right;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.system-status-row strong[data-tone="good"] {
  color: #15803d;
}

.system-status-row strong[data-tone="warning"] {
  color: #b45309;
}

.system-status-row strong[data-tone="danger"] {
  color: #dc2626;
}

.system-error,
.system-success {
  margin-top: 12px;
  padding: 11px 12px;
  display: grid;
  gap: 3px;
  border-radius: 13px;
  font-size: 12px;
  line-height: 1.45;
}

.system-error {
  color: #b91c1c;
  background: rgba(220,38,38,.08);
}

.system-success {
  color: #166534;
  background: rgba(22,163,74,.08);
}

.system-actions {
  margin-top: 18px;
  display: grid;
  gap: 7px;
}

.system-section-title {
  margin-bottom: 2px;
}

.system-actions button {
  width: 100%;
  min-height: 54px;
  border: 1px solid var(--border, rgba(0,0,0,.09));
  border-radius: 15px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  background: var(--surface, #fff);
  color: inherit;
  cursor: pointer;
}

.system-actions button:hover {
  background: var(--bg, #f8fafc);
}

.system-actions button.danger {
  color: #dc2626;
  border-color: rgba(220,38,38,.24);
  background: rgba(220,38,38,.04);
}

.system-actions button:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.system-actions button span {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.system-actions button strong {
  font-size: 13px;
}

.system-actions button small {
  color: var(--muted, #64748b);
  font-size: 11px;
}

.system-actions button > b {
  font-size: 20px;
  color: var(--muted, #64748b);
}
`;