/**
 * app/lib/sync/autoSync.ts
 * --------------------------------------------------------------------------
 * Browser lifecycle synchronization triggers.
 *
 * All triggers delegate to the single-flight runner through syncScheduler.
 */

import {
  getAccountId,
  isOnline,
} from "./syncConfig";

import {
  scheduleSync,
  triggerSyncNow,
} from "./syncScheduler";

import type {
  RunSyncOptions,
  SyncTrigger,
} from "./runSync";

export type AutoSyncOptions =
  RunSyncOptions & {
    intervalMs?: number;
    syncOnOnline?: boolean;
    syncOnFocus?: boolean;
    syncOnVisibility?: boolean;
    syncImmediately?: boolean;
    minimumTriggerGapMs?: number;
  };

export function startAutoSync(
  intervalOrOptions:
    | number
    | AutoSyncOptions = 60_000,
  legacyOptions?: RunSyncOptions,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const options: AutoSyncOptions =
    typeof intervalOrOptions === "number"
      ? {
          ...legacyOptions,
          intervalMs: intervalOrOptions,
        }
      : { ...intervalOrOptions };

  const intervalMs = Math.max(
    15_000,
    options.intervalMs ?? 60_000,
  );

  const minimumTriggerGapMs = Math.max(
    0,
    options.minimumTriggerGapMs ?? 1_000,
  );

  let stopped = false;
  let lastTriggerAt = 0;

  const trigger = (
    source: SyncTrigger,
    force = false,
  ) => {
    if (
      stopped ||
      !isOnline() ||
      !getAccountId()
    ) {
      return;
    }

    const now = Date.now();

    if (
      !force &&
      now - lastTriggerAt <
        minimumTriggerGapMs
    ) {
      return;
    }

    lastTriggerAt = now;

    scheduleSync({
      forceImmediate: true,
      trigger: source,
      includePlatformCache:
        options.includePlatformCache,
      pullLimit: options.pullLimit,
      pullTableNames:
        options.pullTableNames,
    });
  };

  const onOnline = () =>
    trigger("online", true);

  const onFocus = () =>
    trigger("focus");

  const onVisibility = () => {
    if (
      document.visibilityState ===
      "visible"
    ) {
      trigger("visibility");
    }
  };

  if (options.syncOnOnline !== false) {
    window.addEventListener(
      "online",
      onOnline,
    );
  }

  if (options.syncOnFocus !== false) {
    window.addEventListener(
      "focus",
      onFocus,
    );
  }

  if (
    options.syncOnVisibility !== false
  ) {
    document.addEventListener(
      "visibilitychange",
      onVisibility,
    );
  }

  const interval =
    window.setInterval(
      () => trigger("timer"),
      intervalMs,
    );

  if (options.syncImmediately) {
    queueMicrotask(() => {
      triggerSyncNow({
        trigger: "startup",
        includePlatformCache:
          options.includePlatformCache,
        pullLimit:
          options.pullLimit,
        pullTableNames:
          options.pullTableNames,
      });
    });
  }

  return () => {
    stopped = true;

    window.removeEventListener(
      "online",
      onOnline,
    );

    window.removeEventListener(
      "focus",
      onFocus,
    );

    document.removeEventListener(
      "visibilitychange",
      onVisibility,
    );

    window.clearInterval(interval);
  };
}