/**
 * app/lib/sync/runSync.ts
 * --------------------------------------------------------------------------
 * Eleeveon Schools single-flight synchronization runner.
 *
 * Every same-tab trigger joins one shared Promise:
 * - startup;
 * - login;
 * - role selection;
 * - reconnect;
 * - focus;
 * - visibility resume;
 * - timer;
 * - manual refresh;
 * - future backend notifications.
 *
 * Cross-tab concurrency remains protected by the account/environment-scoped
 * lock from syncStorage.ts.
 */

import { pullSync } from "./pullSync";
import { pushSync } from "./pushSync";

import {
  assertAccountId,
  getAccountId,
  getDeviceId,
  isOnline,
  setBootstrapCompleted,
  setLastSyncError,
  setLastSyncOkAt,
  type SyncResult,
} from "./syncConfig";

import {
  acquireSyncLock,
  releaseSyncLock,
} from "./syncStorage";

import { refreshPlatformCache } from "./platformCache";
import { registerSyncDevice } from "./syncDevices";

export type SyncTrigger =
  | "startup"
  | "login"
  | "role-selection"
  | "online"
  | "focus"
  | "visibility"
  | "timer"
  | "manual"
  | "backend-notification"
  | "local-write"
  | "unknown";

export type RunSyncOptions = {
  includePlatformCache?: boolean;
  pullLimit?: number;
  pullTableNames?: string[];
  trigger?: SyncTrigger;
};

export type SyncListener = (
  result: SyncResult | null,
  syncing: boolean,
) => void;

let activeSyncPromise: Promise<SyncResult> | null = null;
let activeAccountId: string | null = null;
let activeOptions: RunSyncOptions | null = null;
let lastResult: SyncResult | null = null;

const listeners = new Set<SyncListener>();

function emit() {
  const syncing = Boolean(activeSyncPromise);

  for (const listener of listeners) {
    try {
      listener(lastResult, syncing);
    } catch (error) {
      console.error("[sync] listener failed", error);
    }
  }
}

function createFailedResult(
  message: string,
  startedAt: number,
): SyncResult {
  return {
    ok: false,
    pushed: 0,
    pulled: 0,
    errors: [message],
    startedAt,
    finishedAt: Date.now(),
  };
}

export function isSyncRunning() {
  return Boolean(activeSyncPromise);
}

export function getActiveSyncPromise() {
  return activeSyncPromise;
}

export function getSyncingAccountId() {
  return activeAccountId;
}

export function getActiveSyncOptions() {
  return activeOptions;
}

export function getLastSyncResult() {
  return lastResult;
}

export function subscribeToSync(listener: SyncListener) {
  listeners.add(listener);
  listener(lastResult, Boolean(activeSyncPromise));

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Public single-flight entry point.
 *
 * The first caller starts the operation. All later callers in the same tab
 * receive the exact same Promise and therefore the exact same result.
 *
 * The first caller's options govern the active run. Global/bootstrap callers
 * should request includePlatformCache=true where platform data is required.
 */
export function runSync(
  options: RunSyncOptions = {},
): Promise<SyncResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeOptions = { ...options };

  activeSyncPromise = performSync(activeOptions).finally(() => {
    activeSyncPromise = null;
    activeAccountId = null;
    activeOptions = null;
    emit();
  });

  emit();
  return activeSyncPromise;
}

async function performSync(
  options: RunSyncOptions,
): Promise<SyncResult> {
  const startedAt = Date.now();

  if (!isOnline()) {
    lastResult = createFailedResult(
      "Device is offline.",
      startedAt,
    );
    return lastResult;
  }

  let accountId: string;

  try {
    accountId = assertAccountId();
  } catch (error: any) {
    lastResult = createFailedResult(
      error?.message || String(error),
      startedAt,
    );
    return lastResult;
  }

  activeAccountId = accountId;
  emit();

  const lockOwner = [
    getDeviceId(),
    startedAt,
    Math.random().toString(36).slice(2, 9),
  ].join(":");

  if (!acquireSyncLock({ accountId, owner: lockOwner })) {
    lastResult = createFailedResult(
      "This account is already syncing in another Eleeveon tab.",
      startedAt,
    );
    return lastResult;
  }

  try {
    await registerSyncDevice({
      silent: true,
    }).catch(() => undefined);

    assertAccountUnchanged(
      accountId,
      "before synchronization started",
    );

    const push = await pushSync({ accountId });

    assertAccountUnchanged(
      accountId,
      "before pull synchronization",
    );

    const pull = await pullSync({
      accountId,
      limit: options.pullLimit,
      tableNames: options.pullTableNames,
    });

    let cacheUpdated = pull.cacheUpdated || 0;
    const cacheErrors: string[] = [];

    if (options.includePlatformCache) {
      assertAccountUnchanged(
        accountId,
        "before platform cache refresh",
      );

      const cache = await refreshPlatformCache({
        silent: true,
      });

      cacheUpdated += cache.updated;
      cacheErrors.push(...cache.errors);
    }

    const completionErrors = pull.completed
      ? []
      : ["Pull synchronization did not complete all pages."];

    const errors = [
      ...push.errors,
      ...pull.errors,
      ...cacheErrors,
      ...completionErrors,
    ];

    const finishedAt = Date.now();

    lastResult = {
      ok: errors.length === 0,
      pushed: push.pushed,
      pulled: pull.pulled,
      errors,
      startedAt,
      finishedAt,
      conflicts: Number(push.conflicts || 0),
      cacheUpdated,
      pullPages: pull.pages,
      pullCompleted: pull.completed,
      pullCursorBefore: pull.cursorBefore || undefined,
      pullCursorAfter: pull.cursorAfter || undefined,
      trigger: options.trigger || "unknown",
    } as SyncResult;

    if (lastResult.ok && pull.completed) {
      setLastSyncOkAt(finishedAt, accountId);
      setLastSyncError(null, accountId);
      setBootstrapCompleted(true, accountId);
    } else {
      setBootstrapCompleted(false, accountId);
      setLastSyncError(
        errors[0] || "Sync failed",
        accountId,
      );
    }

    emit();
    return lastResult;
  } catch (error: any) {
    lastResult = {
      ok: false,
      pushed: 0,
      pulled: 0,
      errors: [error?.message || String(error)],
      startedAt,
      finishedAt: Date.now(),
      pullCompleted: false,
      trigger: options.trigger || "unknown",
    } as SyncResult;

    setBootstrapCompleted(false, accountId);
    setLastSyncError(
      lastResult.errors[0] || "Sync failed",
      accountId,
    );

    emit();
    return lastResult;
  } finally {
    releaseSyncLock(accountId, lockOwner);
  }
}

function assertAccountUnchanged(
  accountId: string,
  stage: string,
) {
  if (getAccountId() !== accountId) {
    throw new Error(
      `Active account changed ${stage}.`,
    );
  }
}