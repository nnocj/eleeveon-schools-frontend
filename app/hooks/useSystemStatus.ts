"use client";

/**
 * app/hooks/useSystemStatus.ts
 * --------------------------------------------------------------------------
 * Aggregates status and actions from the existing Phase 1–19 infrastructure.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useAccount,
} from "../context/account-context";

import {
  useActiveBranch,
} from "../context/active-branch-context";

import {
  useDatabase,
} from "../context/database-context";

import {
  useRealtime,
} from "../context/realtime-context";

import {
  useSyncBootstrap,
} from "../context/sync-bootstrap-context";

import {
  useSyncContext,
} from "../context/sync-context";

import {
  compareAppVersions,
  fetchRemoteAppVersion,
  getBundledAppVersion,
  type AppVersionMetadata,
} from "../lib/pwa/appVersion";

import { SyncStatus } from "../lib/constants/syncStatus";

export type SystemStatusSnapshot = {
  online: boolean;
  realtimeStatus: string;
  realtimeConnected: boolean;
  lastSuccessfulPush?: number | null;
  lastSuccessfulPull?: number | null;
  pendingChanges: number;
  failedChanges: number;
  conflicts: number;
  databaseVersion?: number;
  targetDatabaseVersion: number;
  applicationVersion: AppVersionMetadata;
  remoteApplicationVersion?: AppVersionMetadata | null;
  updateAvailable: boolean;
  currentAccountId?: string | null;
  currentAccountName?: string | null;
  currentBranchId?: string | null;
  currentBranchName?: string | null;
  currentSchoolName?: string | null;
  lastSyncError?: string | null;
};

type ActionState = {
  activeAction?: string | null;
  actionError?: string | null;
  actionMessage?: string | null;
};

function numberOrZero(
  value: unknown,
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

async function loadDiagnostics(
  accountId?: string | null,
) {
  try {
    const mod: any =
      await import(
        "../lib/sync/syncDiagnostics"
      );

    if (
      typeof mod.getSyncDiagnostics !==
      "function"
    ) {
      return null;
    }

    return await mod.getSyncDiagnostics(
      accountId
        ? { accountId }
        : undefined,
    );
  } catch {
    return null;
  }
}

async function downloadJson(
  filename: string,
  value: unknown,
) {
  const blob =
    new Blob(
      [
        JSON.stringify(
          value,
          null,
          2,
        ),
      ],
      {
        type:
          "application/json",
      },
    );

  const url =
    URL.createObjectURL(blob);

  try {
    const anchor =
      document.createElement(
        "a",
      );

    anchor.href = url;
    anchor.download =
      filename;

    document.body.appendChild(
      anchor,
    );

    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(
      url,
    );
  }
}

export function useSystemStatus() {
  const {
    accountId,
    account,
  } = useAccount() as any;

  const {
    activeSchool,
    activeBranch,
    activeBranchId,
  } = useActiveBranch();

  const database =
    useDatabase();

  const realtime =
    useRealtime();

  const sync =
    useSyncBootstrap();

  const {
    statusRevision,
    refreshSystemStatus,
  } = useSyncContext();

  const [
    online,
    setOnline,
  ] = useState(
    typeof navigator ===
      "undefined"
      ? true
      : navigator.onLine,
  );

  const [
    diagnostics,
    setDiagnostics,
  ] =
    useState<any>(null);

  const [
    remoteVersion,
    setRemoteVersion,
  ] =
    useState<AppVersionMetadata | null>(
      null,
    );

  const [
    actionState,
    setActionState,
  ] =
    useState<ActionState>({
      activeAction: null,
      actionError: null,
      actionMessage: null,
    });

  const bundledVersion =
    useMemo(
      () =>
        getBundledAppVersion(),
      [],
    );

  const refresh =
    useCallback(
      async () => {
        const [
          nextDiagnostics,
          nextVersion,
        ] =
          await Promise.all([
            loadDiagnostics(
              accountId,
            ),
            navigator.onLine
              ? fetchRemoteAppVersion()
                  .catch(
                    () => null,
                  )
              : Promise.resolve(
                  null,
                ),
          ]);

        setDiagnostics(
          nextDiagnostics,
        );

        if (nextVersion) {
          setRemoteVersion(
            nextVersion,
          );
        }
      },
      [accountId],
    );

  useEffect(() => {
    const updateOnline =
      () => {
        setOnline(
          navigator.onLine,
        );
      };

    window.addEventListener(
      "online",
      updateOnline,
    );

    window.addEventListener(
      "offline",
      updateOnline,
    );

    return () => {
      window.removeEventListener(
        "online",
        updateOnline,
      );

      window.removeEventListener(
        "offline",
        updateOnline,
      );
    };
  }, []);

  useEffect(() => {
    void refresh();

    const timer =
      window.setInterval(
        () => {
          void refresh();
        },
        30_000,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    refresh,
    statusRevision,
    sync.status,
    sync.pushed,
    sync.pulled,
  ]);

  const runAction =
    useCallback(
      async (
        name: string,
        operation:
          () =>
            Promise<
              string | void
            >,
      ) => {
        setActionState({
          activeAction: name,
          actionError: null,
          actionMessage: null,
        });

        try {
          const message =
            await operation();

          setActionState({
            activeAction: null,
            actionError: null,
            actionMessage:
              message ||
              "Completed successfully.",
          });

          refreshSystemStatus();
          await refresh();
        } catch (error: any) {
          setActionState({
            activeAction: null,
            actionError:
              error?.message ||
              String(error),
            actionMessage: null,
          });
        }
      },
      [
        refresh,
        refreshSystemStatus,
      ],
    );

  const refreshData =
    useCallback(
      () =>
        runAction(
          "refresh-data",
          async () => {
            const mod: any =
              await import(
                "../lib/sync/syncEngine"
              );

            if (
              typeof mod.triggerManualSync ===
              "function"
            ) {
              mod.triggerManualSync();
            } else if (
              typeof mod.runSync ===
              "function"
            ) {
              await mod.runSync({
                trigger:
                  "manual",
                includePlatformCache:
                  true,
              });
            } else {
              throw new Error(
                "Manual synchronization is unavailable.",
              );
            }

            return "Data refresh started.";
          },
        ),
      [runAction],
    );

  const retryFailedRecords =
    useCallback(
      () =>
        runAction(
          "retry-failed",
          async () => {
            const dbMod: any =
              await import(
                "../lib/db"
              );

            const db =
              dbMod.db;

            if (!db) {
              throw new Error(
                "Local database is unavailable.",
              );
            }

            let retried = 0;

            for (
              const table of
              db.tables
            ) {
              if (
                [
                  "migrationJournal",
                  "databaseRecoveryBackups",
                ].includes(
                  table.name,
                )
              ) {
                continue;
              }

              const rows =
                await table.toArray();

              const failed =
                rows.filter(
                  (row: any) =>
                    (
                      !accountId ||
                      row.accountId ===
                        accountId
                    ) &&
                    (
                      row.synced ===
                        SyncStatus.FAILED ||
                      row.syncStatus ===
                        SyncStatus.FAILED ||
                      Boolean(
                        row.syncError,
                      )
                    ),
                );

              for (
                const row of
                failed
              ) {
                await table.update(
                  row.id,
                  {
                    synced:
                      SyncStatus.PENDING,
                    syncStatus:
                      SyncStatus.PENDING,
                    syncError:
                      undefined,
                    updatedAt:
                      Date.now(),
                  },
                );

                retried += 1;
              }
            }

            const syncMod: any =
              await import(
                "../lib/sync/syncEngine"
              );

            if (
              retried > 0 &&
              typeof syncMod.triggerManualSync ===
                "function"
            ) {
              syncMod.triggerManualSync();
            }

            return retried
              ? `${retried} failed record(s) queued again.`
              : "No failed records were found.";
          },
        ),
      [
        accountId,
        runAction,
      ],
    );

  const reconnectRealtime =
    useCallback(
      () =>
        runAction(
          "reconnect-live",
          async () => {
            realtime.reconnect();

            return "Reconnecting live updates.";
          },
        ),
      [
        realtime,
        runAction,
      ],
    );

  const checkForAppUpdate =
    useCallback(
      () =>
        runAction(
          "check-update",
          async () => {
            const remote =
              await fetchRemoteAppVersion();

            setRemoteVersion(
              remote,
            );

            window.dispatchEvent(
              new CustomEvent(
                "eleeveon:app-version-changed",
                {
                  detail: {
                    metadata:
                      remote,
                  },
                },
              ),
            );

            const comparison =
              compareAppVersions(
                remote,
                bundledVersion,
              );

            return comparison
              .updateAvailable
              ? "A newer application build was detected."
              : "The application is up to date.";
          },
        ),
      [
        bundledVersion,
        runAction,
      ],
    );

  const exportOfflineBackup =
    useCallback(
      () =>
        runAction(
          "export-backup",
          async () => {
            const mod: any =
              await import(
                "../lib/db"
              );

            const candidates = [
              mod.createExternalDatabaseBackup,
              mod.exportDatabaseBackup,
              mod.createDatabaseBackup,
              mod.createPreUpgradeBackup,
            ];

            const creator =
              candidates.find(
                (value) =>
                  typeof value ===
                  "function",
              );

            let backup: any;

            if (creator) {
              backup =
                await creator({
                  accountId,
                  reason:
                    "manual-system-status-export",
                });
            } else if (
              mod.db
            ) {
              const tables:
                Record<
                  string,
                  unknown[]
                > = {};

              for (
                const table of
                mod.db.tables
              ) {
                const rows =
                  await table.toArray();

                tables[
                  table.name
                ] =
                  accountId
                    ? rows.filter(
                        (row: any) =>
                          !row.accountId ||
                          row.accountId ===
                            accountId,
                      )
                    : rows;
              }

              backup = {
                accountId,
                databaseVersion:
                  database.currentVersion,
                exportedAt:
                  Date.now(),
                tables,
              };
            } else {
              throw new Error(
                "Offline backup export is unavailable.",
              );
            }

            await downloadJson(
              `eleeveon-offline-backup-${Date.now()}.json`,
              backup,
            );

            return "Offline backup exported.";
          },
        ),
      [
        accountId,
        database.currentVersion,
        runAction,
      ],
    );

  const repairMediaRecords =
    useCallback(
      () =>
        runAction(
          "repair-media",
          async () => {
            if (!accountId) {
              throw new Error(
                "No active account is available.",
              );
            }

            const mod: any =
              await import(
                "../lib/media/mediaRepair"
              );

            const repair =
              mod.repairMediaIntegrity ||
              mod.repairMediaRecords;

            if (
              typeof repair !==
              "function"
            ) {
              throw new Error(
                "Media repair is unavailable.",
              );
            }

            const result =
              await repair(
                accountId,
              );

            const repaired =
              numberOrZero(
                result?.repaired ||
                result?.updated ||
                result?.fixed,
              );

            return repaired
              ? `${repaired} media record(s) repaired.`
              : "Media inspection completed.";
          },
        ),
      [
        accountId,
        runAction,
      ],
    );

  const openOfflineRemoval =
    useCallback(() => {
      window.dispatchEvent(
        new CustomEvent(
          "eleeveon:open-offline-data-removal",
        ),
      );
    }, []);

  const updateAvailable =
    remoteVersion
      ? compareAppVersions(
          remoteVersion,
          bundledVersion,
        ).updateAvailable
      : false;

  const status:
    SystemStatusSnapshot = {
    online,
    realtimeStatus:
      realtime.status.status,
    realtimeConnected:
      realtime.connected,
    lastSuccessfulPush:
      diagnostics?.lastPushAt ??
      diagnostics
        ?.lastSuccessfulPush ??
      (
        sync.pushed > 0
          ? sync.lastSyncedAt
          : null
      ),
    lastSuccessfulPull:
      diagnostics?.lastPullAt ??
      diagnostics
        ?.lastSuccessfulPull ??
      (
        sync.pulled > 0
          ? sync.lastSyncedAt
          : null
      ),
    pendingChanges:
      numberOrZero(
        diagnostics?.pending,
      ),
    failedChanges:
      numberOrZero(
        diagnostics?.errors ??
        diagnostics
          ?.failed,
      ),
    conflicts:
      numberOrZero(
        diagnostics?.conflicts ??
        sync.conflicts,
      ),
    databaseVersion:
      database.currentVersion,
    targetDatabaseVersion:
      database.targetVersion,
    applicationVersion:
      bundledVersion,
    remoteApplicationVersion:
      remoteVersion,
    updateAvailable,
    currentAccountId:
      accountId,
    currentAccountName:
      account?.name ||
      null,
    currentBranchId:
      activeBranchId,
    currentBranchName:
      activeBranch?.name ||
      null,
    currentSchoolName:
      activeSchool?.name ||
      null,
    lastSyncError:
      diagnostics?.lastSyncError ||
      sync.errors?.[0] ||
      null,
  };

  return {
    status,
    actionState,
    refresh,
    actions: {
      refreshData,
      retryFailedRecords,
      reconnectRealtime,
      checkForAppUpdate,
      exportOfflineBackup,
      repairMediaRecords,
      openOfflineRemoval,
    },
  };
}

export default useSystemStatus;