/**
 * app/lib/sync/syncEngine.ts
 * ---------------------------------------------------------
 * Main sync orchestration engine.
 */

import { pullSync } from "./pullSync";
import { pushSync } from "./pushSync";
import { getAccountId, isOnline, setLastSyncError, setLastSyncOkAt, SyncResult } from "./syncConfig";
import { refreshPlatformCache } from "./platformCache";
import { registerSyncDevice } from "./syncDevices";

let syncing = false;
let lastResult: SyncResult | null = null;
const listeners = new Set<(result: SyncResult | null, syncing: boolean) => void>();

function emit() {
  listeners.forEach((listener) => listener(lastResult, syncing));
}

export function isSyncRunning() {
  return syncing;
}

export function getLastSyncResult() {
  return lastResult;
}

export function subscribeToSync(listener: (result: SyncResult | null, syncing: boolean) => void) {
  listeners.add(listener);
  listener(lastResult, syncing);
  return () => {
    listeners.delete(listener);
  };
}

export async function runSync(options?: { includePlatformCache?: boolean }): Promise<SyncResult> {
  const startedAt = Date.now();

  if (syncing) {
    return {
      ok: false,
      pushed: 0,
      pulled: 0,
      errors: ["Sync already running."],
      startedAt,
      finishedAt: Date.now(),
    };
  }

  if (!isOnline()) {
    return {
      ok: false,
      pushed: 0,
      pulled: 0,
      errors: ["Device is offline."],
      startedAt,
      finishedAt: Date.now(),
    };
  }

  syncing = true;
  emit();

  try {
    await registerSyncDevice({ silent: true }).catch(() => undefined);

    const push = await pushSync();
    const pull = await pullSync();

    let cacheUpdated = pull.cacheUpdated || 0;
    const cacheErrors: string[] = [];

    // Default is false so existing apps do not suddenly depend on a new endpoint.
    // You can call runSync({ includePlatformCache: true }) after backend support is ready.
    if (options?.includePlatformCache) {
      const cache = await refreshPlatformCache({ silent: true });
      cacheUpdated += cache.updated;
      cacheErrors.push(...cache.errors);
    }

    const errors = [...push.errors, ...pull.errors, ...cacheErrors];

    lastResult = {
      ok: errors.length === 0,
      pushed: push.pushed,
      pulled: pull.pulled,
      errors,
      startedAt,
      finishedAt: Date.now(),
      conflicts: Number(push.conflicts || 0),
      cacheUpdated,
    };

    if (lastResult.ok) {
      setLastSyncOkAt(lastResult.finishedAt, getAccountId());
      setLastSyncError(null, getAccountId());
    } else {
      setLastSyncError(errors[0] || "Sync failed", getAccountId());
    }

    return lastResult;
  } catch (error: any) {
    lastResult = {
      ok: false,
      pushed: 0,
      pulled: 0,
      errors: [error?.message || String(error)],
      startedAt,
      finishedAt: Date.now(),
    };

    setLastSyncError(lastResult.errors[0] || "Sync failed", getAccountId());
    return lastResult;
  } finally {
    syncing = false;
    emit();
  }
}

export function startAutoSync(intervalMs = 60_000, options?: { includePlatformCache?: boolean }) {
  if (typeof window === "undefined") return () => {};

  const sync = () => {
    if (navigator.onLine) {
      runSync(options).catch(console.error);
    }
  };

  window.addEventListener("online", sync);
  window.addEventListener("focus", sync);

  const interval = window.setInterval(sync, intervalMs);

  return () => {
    window.removeEventListener("online", sync);
    window.removeEventListener("focus", sync);
    window.clearInterval(interval);
  };
}
