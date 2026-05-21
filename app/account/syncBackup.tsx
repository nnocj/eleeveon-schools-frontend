"use client";

/**
 * syncBackup.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE SYNC & BACKUP PAGE
 * ---------------------------------------------------------
 *
 * Purpose:
 * - Monitor offline/online status.
 * - Show account-scoped local data counts.
 * - Detect pending/unsynced local records.
 * - Run the real sync engine manually.
 * - Prepare future backup/restore pipeline.
 *
 * Uses:
 * - app/lib/sync/syncEngine.ts -> runSync()
 * - Dexie local database tables.
 *
 * Rules:
 * - Signed-in account required.
 * - School/branch are optional here.
 * - Reads are scoped by accountId.
 * - Mobile-first cards.
 * - Account-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import { db } from "../lib/db";
import { runSync } from "../lib/sync/syncEngine";
import { SyncStatus } from "../lib/constants/syncStatus";
import { useSyncBootstrap } from "../context/sync-bootstrap-context";

// ======================================================
// TYPES
// ======================================================

type CountState = {
  schools: number;
  branches: number;
  students: number;
  teachers: number;
  payments: number;
  classes: number;
  subjects: number;
  settings: number;
};

type PendingState = {
  schools: number;
  branches: number;
  students: number;
  teachers: number;
  payments: number;
  classes: number;
  subjects: number;
  settings: number;
  total: number;
};

type SyncRunState = {
  ok?: boolean;
  pushed: number;
  pulled: number;
  errors: string[];
  ranAt?: number;
};

type PipelineItem = {
  title: string;
  description: string;
  icon: string;
  tone: "green" | "blue" | "purple" | "orange" | "gray" | "red";
};

const emptyCounts: CountState = {
  schools: 0,
  branches: 0,
  students: 0,
  teachers: 0,
  payments: 0,
  classes: 0,
  subjects: 0,
  settings: 0,
};

const emptyPending: PendingState = {
  schools: 0,
  branches: 0,
  students: 0,
  teachers: 0,
  payments: 0,
  classes: 0,
  subjects: 0,
  settings: 0,
  total: 0,
};

function isPending(row: { synced?: SyncStatus | string; isDeleted?: boolean }) {
  return row.synced === SyncStatus.PENDING || row.synced === "pending";
}

function formatTime(value?: number) {
  if (!value) return "Never";

  return new Date(value).toLocaleString("en-GH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ======================================================
// COMPONENT
// ======================================================

export default function SyncBackupPage() {
  const {
    accountId,
    authenticated,
    user,
    account,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeBranch,
    activeSchoolId,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const { autoSyncEnabled, setAutoSyncEnabled } = useSyncBootstrap();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [counts, setCounts] = useState<CountState>(emptyCounts);
  const [pending, setPending] = useState<PendingState>(emptyPending);
  const [lastRun, setLastRun] = useState<SyncRunState>({ pushed: 0, pulled: 0, errors: [] });

  // ======================================================
  // ONLINE STATUS
  // ======================================================

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);

    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ======================================================
  // LOAD ACCOUNT-SCOPED LOCAL DATA
  // ======================================================

  const clearData = () => {
    setCounts(emptyCounts);
    setPending(emptyPending);
  };

  const countActive = <T extends { accountId?: string; isDeleted?: boolean }>(rows: T[]) =>
    rows.filter((row) => row.accountId === accountId && !row.isDeleted).length;

  const countPending = <T extends { accountId?: string; synced?: SyncStatus | string; isDeleted?: boolean }>(rows: T[]) =>
    rows.filter((row) => row.accountId === accountId && isPending(row)).length;

  const load = async () => {
    if (!authenticated || !accountId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        schools,
        branches,
        students,
        teachers,
        payments,
        classes,
        subjects,
        schoolBranchSettings,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.payments.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.schoolBranchSettings.toArray(),
      ]);

      const nextCounts: CountState = {
        schools: countActive(schools),
        branches: countActive(branches),
        students: countActive(students),
        teachers: countActive(teachers),
        payments: countActive(payments),
        classes: countActive(classes),
        subjects: countActive(subjects),
        settings: countActive(schoolBranchSettings),
      };

      const nextPendingBase = {
        schools: countPending(schools),
        branches: countPending(branches),
        students: countPending(students),
        teachers: countPending(teachers),
        payments: countPending(payments),
        classes: countPending(classes),
        subjects: countPending(subjects),
        settings: countPending(schoolBranchSettings),
      };

      const nextPending: PendingState = {
        ...nextPendingBase,
        total: Object.values(nextPendingBase).reduce((sum, value) => sum + value, 0),
      };

      setCounts(nextCounts);
      setPending(nextPending);
    } catch (error) {
      console.error("Failed to load sync backup data:", error);
      clearData();
      alert("Failed to load sync backup data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId]);

  // ======================================================
  // RUN SYNC
  // ======================================================

  const runManualSync = async () => {
    if (!authenticated || !accountId) {
      alert("Sign in first.");
      return;
    }

    if (!isOnline) {
      alert("Device is offline. Connect to the internet before syncing.");
      return;
    }

    try {
      setSyncing(true);

      const result = await runSync();

      setLastRun({
        ok: result.ok,
        pushed: result.pushed,
        pulled: result.pulled,
        errors: result.errors,
        ranAt: Date.now(),
      });

      await load();
    } catch (error: any) {
      setLastRun({
        ok: false,
        pushed: 0,
        pulled: 0,
        errors: [error?.message || String(error)],
        ranAt: Date.now(),
      });
    } finally {
      setSyncing(false);
    }
  };

  // ======================================================
  // VIEW DATA
  // ======================================================

  const totalRecords = useMemo(
    () => Object.values(counts).reduce((sum, value) => sum + value, 0),
    [counts]
  );

  const pipeline = useMemo<PipelineItem[]>(() => {
    return [
      {
        title: "Prepare local data",
        description: "Each table uses accountId and sync metadata so records can be pushed safely.",
        icon: "🧩",
        tone: "blue",
      },
      {
        title: "Detect unsynced records",
        description: "Records marked as pending are counted here before upload.",
        icon: "🔎",
        tone: pending.total ? "orange" : "green",
      },
      {
        title: "Push local changes",
        description: "runSync() calls pushSync() first to send local changes to your backend.",
        icon: "⬆️",
        tone: "purple",
      },
      {
        title: "Pull cloud updates",
        description: "runSync() then calls pullSync() to bring server updates back to the device.",
        icon: "⬇️",
        tone: "blue",
      },
      {
        title: "Cloud backup",
        description: "Use your backend as the account-level backup source for new devices.",
        icon: "☁️",
        tone: "gray",
      },
      {
        title: "Restore from backup",
        description: "After login, pullSync() can repopulate local Dexie data for the account.",
        icon: "♻️",
        tone: "green",
      },
    ];
  }, [pending.total]);

  const baseLoading = accountLoading || settingsLoading || contextLoading || loading;

  // ======================================================
  // STATES
  // ======================================================

  if (baseLoading) {
    return (
      <main className="sb-page" style={{ "--sb-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sb-state-card">
          <div className="sb-spinner" />
          <h2>Opening sync center...</h2>
          <p>Checking account context, local records, and pending sync data.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sb-page" style={{ "--sb-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sb-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing sync and backup status.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="sb-page" style={{ "--sb-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sb-hero">
        <div className="sb-hero-left">
          <div className="sb-hero-icon">☁️</div>
          <div className="sb-title-wrap">
            <p>Offline First</p>
            <h2>Sync & Backup</h2>
            <span>Monitor offline mode, local records, pending sync, and cloud readiness.</span>
          </div>
        </div>

        <button
          type="button"
          className="sb-primary-btn"
          onClick={runManualSync}
          disabled={syncing || !isOnline}
        >
          {syncing ? "Syncing..." : "Run Sync"}
        </button>
        <label className="sb-auto-toggle">
        <input
          type="checkbox"
          checked={autoSyncEnabled}
          onChange={(event) => setAutoSyncEnabled(event.target.checked)}
        />
        Auto Sync
      </label>
      </section>

      <section className="sb-context-card">
        <div>
          <p>Current Workspace</p>
          <h3>{account?.name || "Account Workspace"}</h3>
          <span>{user?.email || user?.fullName || "Signed-in user"}</span>
        </div>

        <div className="sb-pill-row">
          <Chip tone={isOnline ? "green" : "red"}>
            ● {isOnline ? "Online - Sync Ready" : "Offline - Local Mode"}
          </Chip>
          <Chip tone="blue">Account Scoped</Chip>
          <Chip tone={activeSchoolId ? "green" : "orange"}>
            {activeSchool?.name || "No school selected"}
          </Chip>
          <Chip tone={activeBranchId ? "green" : "orange"}>
            {activeBranch?.name || "No branch selected"}
          </Chip>
        </div>
      </section>

      <section className="sb-summary-grid" aria-label="Sync summary">
        <SummaryCard label="Local Records" value={totalRecords} icon="💾" />
        <SummaryCard label="Pending Sync" value={pending.total} icon="⏳" />
        <SummaryCard label="Last Pushed" value={lastRun.pushed} icon="⬆️" />
        <SummaryCard label="Last Pulled" value={lastRun.pulled} icon="⬇️" />
        <SummaryCard label="Last Sync" value={formatTime(lastRun.ranAt)} icon="🕒" />
      </section>

      <section className="sb-section-card">
        <div className="sb-section-head">
          <div>
            <p>Local Data</p>
            <h3>Account-scoped record counts</h3>
          </div>
          <Chip tone="blue">{totalRecords} records</Chip>
        </div>

        <div className="sb-record-grid">
          <MiniStat label="Schools" value={counts.schools} icon="🏫" pending={pending.schools} />
          <MiniStat label="Branches" value={counts.branches} icon="🏢" pending={pending.branches} />
          <MiniStat label="Students" value={counts.students} icon="🧑‍🎓" pending={pending.students} />
          <MiniStat label="Teachers" value={counts.teachers} icon="👨‍🏫" pending={pending.teachers} />
          <MiniStat label="Classes" value={counts.classes} icon="🏷" pending={pending.classes} />
          <MiniStat label="Subjects" value={counts.subjects} icon="📘" pending={pending.subjects} />
          <MiniStat label="Payments" value={counts.payments} icon="💳" pending={pending.payments} />
          <MiniStat label="Settings" value={counts.settings} icon="⚙️" pending={pending.settings} />
        </div>
      </section>

      <section className="sb-section-card">
        <div className="sb-section-head">
          <div>
            <p>Sync Result</p>
            <h3>Latest manual sync run</h3>
          </div>
          <Chip tone={lastRun.ok === false ? "red" : lastRun.ok ? "green" : "gray"}>
            {lastRun.ok === undefined ? "Not run" : lastRun.ok ? "Success" : "Failed"}
          </Chip>
        </div>

        <div className="sb-result-grid">
          <MiniResult label="Pushed" value={lastRun.pushed} icon="⬆️" />
          <MiniResult label="Pulled" value={lastRun.pulled} icon="⬇️" />
          <MiniResult label="Errors" value={lastRun.errors.length} icon="⚠️" />
        </div>

        {!!lastRun.errors.length && (
          <div className="sb-error-list">
            {lastRun.errors.map((error, index) => (
              <div key={`${error}-${index}`}>{error}</div>
            ))}
          </div>
        )}
      </section>

      <section className="sb-section-card">
        <div className="sb-section-head with-action">
          <div>
            <p>Sync Pipeline</p>
            <h3>Current and future backup flow</h3>
          </div>

          <button type="button" onClick={runManualSync} disabled={syncing || !isOnline}>
            {syncing ? "Syncing..." : "Run Sync"}
          </button>
        </div>

        <div className="sb-pipeline-grid">
          {pipeline.map((item) => (
            <article key={item.title} className="sb-pipeline-card">
              <div className="sb-pipeline-icon">{item.icon}</div>
              <div>
                <h4>{item.title}</h4>
                <p>{item.description}</p>
                <Chip tone={item.tone}>Ready</Chip>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="sb-summary-card">
      <div className="sb-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function MiniStat({ label, value, icon, pending }: { label: string; value: number; icon: string; pending: number }) {
  return (
    <article className="sb-mini-stat">
      <div className="sb-mini-icon">{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
      <Chip tone={pending ? "orange" : "green"}>{pending ? `${pending} pending` : "synced"}</Chip>
    </article>
  );
}

function MiniResult({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <article className="sb-mini-result">
      <div className="sb-mini-icon">{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`sb-chip ${tone}`}>{children}</span>;
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes sbSpin {
  to { transform: rotate(360deg); }
}

.sb-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.sb-page *,
.sb-page *::before,
.sb-page *::after {
  box-sizing: border-box;
}

.sb-page button,
.sb-page input,
.sb-page select,
.sb-page textarea {
  font: inherit;
  max-width: 100%;
}

.sb-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.sb-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sb-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.sb-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--sb-primary) 18%, transparent);
  border-top-color: var(--sb-primary);
  animation: sbSpin .8s linear infinite;
}

.sb-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--sb-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.sb-primary-btn:disabled,
.sb-section-head button:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.sb-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sb-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.sb-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.sb-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--sb-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--sb-primary) 28%, transparent);
  font-size: 22px;
}

.sb-title-wrap {
  min-width: 0;
}

.sb-title-wrap p,
.sb-title-wrap h2,
.sb-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-title-wrap p,
.sb-context-card p,
.sb-section-head p {
  margin: 0;
  color: var(--sb-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sb-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.sb-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sb-context-card,
.sb-section-card {
  min-width: 0;
  margin-top: 10px;
  padding: 12px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.sb-context-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.sb-context-card div:first-child {
  min-width: 0;
}

.sb-context-card h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-context-card span {
  display: block;
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-pill-row {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.sb-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.sb-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}

.sb-summary-icon,
.sb-pipeline-icon,
.sb-mini-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--sb-primary) 12%, #fff);
  font-size: 20px;
}

.sb-summary-card div:last-child {
  min-width: 0;
}

.sb-summary-card strong,
.sb-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-summary-card strong {
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sb-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.sb-section-head {
  min-width: 0;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.sb-section-head h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.sb-section-head button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  background: var(--sb-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.sb-record-grid,
.sb-result-grid,
.sb-pipeline-grid {
  display: grid;
  gap: 8px;
}

.sb-mini-stat,
.sb-mini-result,
.sb-pipeline-card,
.sb-error-list div {
  min-width: 0;
  padding: 11px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .12);
  overflow: hidden;
}

.sb-mini-stat,
.sb-mini-result {
  display: grid;
  gap: 4px;
}

.sb-mini-stat strong,
.sb-mini-stat span,
.sb-mini-result strong,
.sb-mini-result span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-mini-stat strong,
.sb-mini-result strong {
  font-size: 20px;
  font-weight: 1000;
}

.sb-mini-stat span,
.sb-mini-result span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.sb-pipeline-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sb-pipeline-card div:last-child {
  min-width: 0;
}

.sb-pipeline-card h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 1000;
}

.sb-pipeline-card p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
  font-weight: 720;
}

.sb-error-list {
  display: grid;
  gap: 7px;
  margin-top: 9px;
}

.sb-error-list div {
  color: #dc2626;
  background: rgba(239, 68, 68, .08);
  border-color: rgba(239, 68, 68, .14);
  font-size: 12px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.sb-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/**
 * CSS:
 */

.sb-auto-toggle {
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .24);
  font-size: 12px;
  font-weight: 950;
}

.sb-auto-toggle input {
  width: 17px;
  height: 17px;
}




.sb-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.sb-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.sb-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.sb-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.sb-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.sb-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

@media (min-width: 680px) {
  .sb-page {
    padding: 12px;
  }

  .sb-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sb-record-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .sb-result-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sb-pipeline-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .sb-page {
    padding: 16px;
  }

  .sb-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .sb-pipeline-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .sb-page {
    padding: 6px;
  }

  .sb-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .sb-primary-btn {
    width: 100%;
  }

  .sb-context-card {
    align-items: stretch;
  }

  .sb-summary-grid {
    gap: 6px;
  }

  .sb-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .sb-record-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sb-pipeline-card {
    flex-direction: column;
  }
}
`;
