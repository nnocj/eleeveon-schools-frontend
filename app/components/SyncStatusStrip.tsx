// ======================================================
// FILE 3: app/components/SyncStatusStrip.tsx
// ======================================================

"use client";

/**
 * SyncStatusStrip.tsx
 * ---------------------------------------------------------
 * OPTIONAL SMALL STATUS STRIP
 * ---------------------------------------------------------
 *
 * Place inside account/page.tsx or dashboard/page.tsx if you want users
 * to see initial sync/autosync status.
 */

import React from "react";
import { useSyncBootstrap } from "../context/sync-bootstrap-context";

function formatTime(value?: number) {
  if (!value) return "Never";

  return new Date(value).toLocaleString("en-GH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SyncStatusStrip() {
  const {
    status,
    pushed,
    pulled,
    errors,
    lastSyncedAt,
    autoSyncEnabled,
    setAutoSyncEnabled,
  } = useSyncBootstrap();

  const tone =
    status === "success"
      ? "green"
      : status === "failed"
      ? "red"
      : status === "offline"
      ? "orange"
      : status === "syncing" || status === "checking"
      ? "blue"
      : "gray";

  return (
    <section className="sync-strip">
      <style>{css}</style>

      <div className={`sync-dot ${tone}`} />

      <div className="sync-copy">
        <strong>
          {status === "syncing" || status === "checking"
            ? "Syncing account data..."
            : status === "success"
            ? "Account data synced"
            : status === "failed"
            ? "Sync needs attention"
            : status === "offline"
            ? "Offline mode"
            : "Sync ready"}
        </strong>
        <span>
          Pushed {pushed} · Pulled {pulled} · Last sync: {formatTime(lastSyncedAt)}
        </span>
        {!!errors.length && <small>{errors[0]}</small>}
      </div>

      <label className="sync-toggle">
        <input
          type="checkbox"
          checked={autoSyncEnabled}
          onChange={(event) => setAutoSyncEnabled(event.target.checked)}
        />
        <span>Auto</span>
      </label>
    </section>
  );
}

const css = `
.sync-strip {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 18px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 10px 24px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.sync-dot {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.sync-dot.green { background: #16a34a; }
.sync-dot.red { background: #dc2626; }
.sync-dot.orange { background: #f59e0b; }
.sync-dot.blue { background: #2563eb; }
.sync-dot.gray { background: #64748b; }

.sync-copy {
  min-width: 0;
  flex: 1;
}

.sync-copy strong,
.sync-copy span,
.sync-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-copy strong {
  font-size: 12px;
  font-weight: 950;
}

.sync-copy span,
.sync-copy small {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.sync-copy small {
  color: #dc2626;
}

.sync-toggle {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 950;
  color: var(--text, #0f172a);
}

.sync-toggle input {
  width: 16px;
  height: 16px;
}

@media (max-width: 520px) {
  .sync-strip {
    align-items: flex-start;
  }

  .sync-copy strong,
  .sync-copy span,
  .sync-copy small {
    white-space: normal;
  }
}
`;







// ======================================================
// FILE 7: OPTIONAL UPDATE syncBackup.tsx MANUAL/AUTO CONTROL
// ======================================================

/**
 * Since syncBackup.tsx was already built with manual Run Sync,
 * add this import:
 *
 * 
 *
 * Then inside component:
 *
 * 
 *
 * Then add this toggle near the Run Sync button:
 */

/*

*/

