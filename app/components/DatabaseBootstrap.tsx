"use client";

/**
 * app/components/DatabaseBootstrap.tsx
 * --------------------------------------------------------------------------
 * Centralized Eleeveon Schools database startup.
 *
 * Startup order:
 * 1. Create the Phase 1 recovery backup when an older database exists.
 * 2. Open the one exported Dexie singleton.
 * 3. Let Dexie run any required migration.
 * 4. Validate the opened database.
 * 5. Publish ready=true.
 *
 * Account, settings, membership, portal, and sync providers are mounted only
 * after this component has completed successfully.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  APP_DB_VERSION,
  DATABASE_BOOTSTRAP_CHANNEL,
  checkDatabaseHealth,
  closeAppDatabase,
  createPreUpgradeBackup,
  db,
  getAppDatabaseVersion,
  openAppDatabase,
  type DatabaseHealthReport,
  type ExternalDatabaseBackup,
} from "../lib/db";

import {
  DatabaseProvider,
  type DatabaseState,
  type DatabaseStatus,
} from "../context/database-context";

type DatabaseChannelMessage =
  | {
      type: "PLEASE_CLOSE_DATABASE";
      targetVersion: number;
      requestId: string;
      at: number;
    }
  | {
      type: "DATABASE_CONNECTION_CLOSED";
      requestId?: string;
      at: number;
    }
  | {
      type: "DATABASE_READY";
      version: number;
      at: number;
    };

const BLOCKED_RETRY_DELAY_MS = 650;
const BLOCKED_MAX_WAIT_MS = 12_000;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "Unknown local database error.");
}

function makeRequestId() {
  return `db-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function DatabaseBootstrap({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<DatabaseStatus>("idle");
  const [error, setError] = useState<string>();
  const [backup, setBackup] = useState<ExternalDatabaseBackup | null>(null);
  const [health, setHealth] = useState<DatabaseHealthReport | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number>();

  const statusRef = useRef<DatabaseStatus>("idle");
  const mountedRef = useRef(false);
  const runningRef = useRef<Promise<void> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const blockedSinceRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const upgradeExpectedRef = useRef(false);

  const updateStatus = useCallback((nextStatus: DatabaseStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const bootstrap = useCallback(async () => {
    if (runningRef.current) return runningRef.current;

    clearRetryTimer();

    const task = (async () => {
      setError(undefined);
      setHealth(null);
      blockedSinceRef.current = null;

      try {
        updateStatus("backing-up");
        const createdBackup = await createPreUpgradeBackup();

        if (!mountedRef.current) return;

        setBackup(createdBackup);
        upgradeExpectedRef.current = Boolean(
          createdBackup &&
            createdBackup.sourceVersion < createdBackup.targetVersion,
        );

        updateStatus(upgradeExpectedRef.current ? "upgrading" : "opening");
        await openAppDatabase();

        if (!mountedRef.current) return;

        setCurrentVersion(getAppDatabaseVersion());
        updateStatus("validating");

        const report = await checkDatabaseHealth(db);

        if (!mountedRef.current) return;

        setHealth(report);

        const errors = report.issues.filter(
          (issue) => issue.severity === "error",
        );

        if (!report.ok || errors.length > 0) {
          throw new Error(
            errors.map((issue) => issue.message).join(" ") ||
              "Database validation failed.",
          );
        }

        setCurrentVersion(db.verno);
        updateStatus("ready");

        channelRef.current?.postMessage({
          type: "DATABASE_READY",
          version: db.verno,
          at: Date.now(),
        } satisfies DatabaseChannelMessage);
      } catch (caught) {
        if (!mountedRef.current) return;

        const message = errorMessage(caught);
        const isBlocked =
          statusRef.current === "blocked" ||
          /blocked|versionchange|version change/i.test(message);

        setError(
          isBlocked
            ? "Another Eleeveon tab is still using an older database connection. That tab has been asked to close and reload."
            : message,
        );
        updateStatus(isBlocked ? "blocked" : "error");
      }
    })().finally(() => {
      runningRef.current = null;
    });

    runningRef.current = task;
    return task;
  }, [clearRetryTimer, updateStatus]);

  const requestOlderTabsToClose = useCallback(() => {
    const requestId = makeRequestId();

    channelRef.current?.postMessage({
      type: "PLEASE_CLOSE_DATABASE",
      targetVersion: APP_DB_VERSION,
      requestId,
      at: Date.now(),
    } satisfies DatabaseChannelMessage);

    return requestId;
  }, []);

  const scheduleBlockedRetry = useCallback(() => {
    clearRetryTimer();

    const blockedSince = blockedSinceRef.current ?? Date.now();
    blockedSinceRef.current = blockedSince;

    if (Date.now() - blockedSince >= BLOCKED_MAX_WAIT_MS) {
      updateStatus("blocked");
      setError(
        "The database upgrade is still blocked. Close any other Eleeveon tabs or installed-app windows, then choose Retry safely.",
      );
      return;
    }

    retryTimerRef.current = window.setTimeout(() => {
      closeAppDatabase();
      void bootstrap();
    }, BLOCKED_RETRY_DELAY_MS);
  }, [bootstrap, clearRetryTimer]);

  useEffect(() => {
    mountedRef.current = true;

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(DATABASE_BOOTSTRAP_CHANNEL);
      channelRef.current = channel;

      channel.onmessage = (event: MessageEvent<DatabaseChannelMessage>) => {
        const message = event.data;
        if (!message?.type) return;

        if (message.type === "PLEASE_CLOSE_DATABASE") {
          closeAppDatabase();

          channel.postMessage({
            type: "DATABASE_CONNECTION_CLOSED",
            requestId: message.requestId,
            at: Date.now(),
          } satisfies DatabaseChannelMessage);

          // This is the older tab/window. Reload it so it joins the newest
          // application build and opens the upgraded schema cleanly.
          window.setTimeout(() => {
            window.location.reload();
          }, 250);

          return;
        }

        if (
          message.type === "DATABASE_CONNECTION_CLOSED" &&
          statusRef.current === "blocked"
        ) {
          scheduleBlockedRetry();
        }
      };
    }

    const handleBlocked = () => {
      if (!mountedRef.current) return;

      updateStatus("blocked");
      setError(
        "Another Eleeveon tab is using an older local database version. Asking it to close its connection…",
      );

      requestOlderTabsToClose();
      scheduleBlockedRetry();
    };

    const handleVersionChange = () => {
      // A newer tab/build needs this tab's connection. Close immediately.
      closeAppDatabase();

      channelRef.current?.postMessage({
        type: "DATABASE_CONNECTION_CLOSED",
        at: Date.now(),
      } satisfies DatabaseChannelMessage);

      if (!mountedRef.current) return;

      updateStatus("blocked");
      setError(
        "A newer Eleeveon database version is ready. Reloading this tab safely…",
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 250);
    };

    db.on("blocked", handleBlocked);
    db.on("versionchange", handleVersionChange);

    void bootstrap();

    return () => {
      mountedRef.current = false;
      clearRetryTimer();

      db.on("blocked").unsubscribe(handleBlocked);
      db.on("versionchange").unsubscribe(handleVersionChange);

      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [
    bootstrap,
    clearRetryTimer,
    requestOlderTabsToClose,
    scheduleBlockedRetry,
    updateStatus,
  ]);

  const value = useMemo<DatabaseState>(
    () => ({
      status,
      ready: status === "ready",
      opening: ["backing-up", "opening", "validating"].includes(status),
      upgrading: status === "upgrading",
      blocked: status === "blocked",
      currentVersion,
      targetVersion: APP_DB_VERSION,
      error,
      backup,
      health,
      retry: async () => {
        closeAppDatabase();
        await bootstrap();
      },
    }),
    [backup, bootstrap, currentVersion, error, health, status],
  );

  return (
    <DatabaseProvider value={value}>
      {value.ready ? (
        children
      ) : (
        <DatabaseStartupScreen state={value} />
      )}
    </DatabaseProvider>
  );
}

function DatabaseStartupScreen({ state }: { state: DatabaseState }) {
  const waiting = !["blocked", "error"].includes(state.status);

  const title =
    state.status === "backing-up"
      ? "Protecting offline data…"
      : state.status === "upgrading"
        ? "Upgrading local database…"
        : state.status === "opening"
          ? "Opening Eleeveon…"
          : state.status === "validating"
            ? "Checking local data…"
            : state.status === "blocked"
              ? "Closing an older database connection…"
              : state.status === "error"
                ? "Local database needs attention"
                : "Preparing Eleeveon…";

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        {waiting && <div style={styles.spinner} />}

        <h1 style={styles.title}>{title}</h1>

        <p style={styles.text}>
          {state.error ||
            "Eleeveon is preparing the offline database without deleting your school records."}
        </p>

        <div style={styles.meta}>
          <span>Required version</span>
          <strong>{state.targetVersion}</strong>
          <span>Opened version</span>
          <strong>{state.currentVersion ?? "—"}</strong>
        </div>

        {state.backup?.status === "completed" && (
          <p style={styles.backup}>
            Recovery backup protected{" "}
            {state.backup.recordCount.toLocaleString()} record(s).
          </p>
        )}

        {(state.status === "blocked" || state.status === "error") && (
          <button
            type="button"
            style={styles.button}
            onClick={() => void state.retry()}
          >
            Retry safely
          </button>
        )}
      </section>

      <style>{`
        @keyframes eleeveon-db-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "#f6f8fc",
    color: "#0f172a",
  },
  card: {
    width: "min(500px, 100%)",
    padding: 26,
    borderRadius: 24,
    background: "#fff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 24px 70px rgba(15,23,42,.10)",
    textAlign: "center",
  },
  spinner: {
    width: 42,
    height: 42,
    margin: "0 auto 16px",
    borderRadius: 999,
    border: "4px solid #dbeafe",
    borderTopColor: "#2563eb",
    animation: "eleeveon-db-spin .8s linear infinite",
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: "-.03em",
  },
  text: {
    margin: "10px 0 0",
    color: "#64748b",
    lineHeight: 1.6,
    fontSize: 13,
  },
  meta: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 7,
    padding: 12,
    borderRadius: 14,
    background: "#f8fafc",
    textAlign: "left",
    fontSize: 12,
  },
  backup: {
    margin: "14px 0 0",
    padding: 10,
    borderRadius: 12,
    background: "#ecfdf5",
    color: "#166534",
    fontWeight: 750,
    fontSize: 12,
  },
  button: {
    marginTop: 18,
    minHeight: 44,
    padding: "0 18px",
    border: 0,
    borderRadius: 999,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  },
};