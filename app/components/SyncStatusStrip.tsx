"use client";

/**
 * app/components/SyncStatusStrip.tsx
 * ---------------------------------------------------------
 * PLATFORM-READY SYNC STATUS STRIP
 * ---------------------------------------------------------
 * Backward compatible with sync-bootstrap-context, but enhanced for the
 * upgraded sync engine by showing diagnostics when available.
 */

import React, { useEffect, useState } from "react";
import { useSyncBootstrap } from "../context/sync-bootstrap-context";

type LocalDiagnostics = {
  pending?: number;
  errors?: number;
  conflicts?: number;
  lastSyncAt?: number | null;
  lastSyncOkAt?: number | null;
  lastSyncError?: string | null;
};

function formatTime(value?: number | null) {
  if (!value) return "Never";

  return new Date(value).toLocaleString("en-GH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadDiagnostics(): Promise<LocalDiagnostics | null> {
  try {
    const mod = await import("../lib/sync/syncDiagnostics");
    if (typeof mod.getSyncDiagnostics !== "function") return null;
    return await mod.getSyncDiagnostics();
  } catch {
    return null;
  }
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

  const [diagnostics, setDiagnostics] = useState<LocalDiagnostics | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const data = await loadDiagnostics();
      if (!cancelled) setDiagnostics(data);
    };

    refresh();
    const timer = window.setInterval(refresh, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, pushed, pulled, lastSyncedAt]);

  const conflictCount = diagnostics?.conflicts || 0;
  const pendingCount = diagnostics?.pending || 0;
  const syncErrorCount = diagnostics?.errors || 0;

  const tone =
    conflictCount > 0
      ? "purple"
      : status === "success"
      ? "green"
      : status === "failed" || syncErrorCount > 0
      ? "red"
      : status === "offline"
      ? "orange"
      : status === "syncing" || status === "checking"
      ? "blue"
      : "gray";

  const title =
    conflictCount > 0
      ? "Sync conflicts need review"
      : status === "syncing" || status === "checking"
      ? "Syncing account data..."
      : status === "success"
      ? "Account data synced"
      : status === "failed"
      ? "Sync needs attention"
      : status === "offline"
      ? "Offline mode"
      : "Sync ready";

  const firstError = errors[0] || diagnostics?.lastSyncError || "";

  return (
    <section className="sync-strip" aria-live="polite">
      <style>{css}</style>

      <div className={`sync-dot ${tone}`} />

      <div className="sync-copy">
        <strong>{title}</strong>
        <span>
          Pushed {pushed} · Pulled {pulled} · Pending {pendingCount} · Conflicts {conflictCount} · Last sync: {formatTime(lastSyncedAt || diagnostics?.lastSyncOkAt || diagnostics?.lastSyncAt)}
        </span>
        {!!firstError && <small>{firstError}</small>}
      </div>

      <label className="sync-toggle" title="Enable or disable automatic background sync">
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
.sync-dot.purple { background: #7c3aed; }

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