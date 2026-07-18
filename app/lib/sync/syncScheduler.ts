/**
 * app/lib/sync/syncScheduler.ts
 * --------------------------------------------------------------------------
 * Central synchronization scheduler.
 *
 * Responsibilities:
 * - debounce rapid local writes;
 * - merge table names and options from many callers;
 * - trigger the existing single-flight runSync();
 * - expose immediate triggers for login, role selection, manual refresh, and
 *   backend notifications;
 * - never start a competing synchronization operation.
 */

import type {
  RunSyncOptions,
  SyncTrigger,
} from "./runSync";

export type ScheduleSyncOptions = {
  delayMs?: number;
  trigger?: SyncTrigger;
  includePlatformCache?: boolean;
  pullTableNames?: readonly string[];
  pullLimit?: number;
  forceImmediate?: boolean;
};

type PendingSchedule = {
  trigger: SyncTrigger;
  includePlatformCache: boolean;
  pullTableNames: Set<string>;
  pullLimit?: number;
};

const DEFAULT_LOCAL_WRITE_DELAY_MS = 900;
const MIN_DELAY_MS = 100;
const MAX_DELAY_MS = 10_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: PendingSchedule | null = null;
let lastScheduledAt = 0;

function normalizeTables(
  tables?: readonly string[],
) {
  return [...new Set(
    (tables || [])
      .map((table) => String(table || "").trim())
      .filter(Boolean),
  )];
}

function mergeSchedule(
  options: ScheduleSyncOptions,
) {
  if (!pending) {
    pending = {
      trigger: options.trigger || "unknown",
      includePlatformCache:
        options.includePlatformCache === true,
      pullTableNames: new Set(
        normalizeTables(options.pullTableNames),
      ),
      pullLimit: options.pullLimit,
    };

    return;
  }

  // A more explicit later trigger may replace an unknown/local-write trigger.
  if (
    options.trigger &&
    (
      pending.trigger === "unknown" ||
      pending.trigger === "local-write"
    )
  ) {
    pending.trigger = options.trigger;
  }

  pending.includePlatformCache =
    pending.includePlatformCache ||
    options.includePlatformCache === true;

  for (
    const table of
    normalizeTables(options.pullTableNames)
  ) {
    pending.pullTableNames.add(table);
  }

  if (
    options.pullLimit !== undefined
  ) {
    pending.pullLimit = Math.max(
      pending.pullLimit || 0,
      options.pullLimit,
    );
  }
}

async function executePendingSync() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const scheduled = pending;
  pending = null;

  if (!scheduled) return null;

  /**
   * Dynamic import avoids a static circular dependency:
   * runSync -> pushSync -> syncUtils -> syncScheduler.
   */
  const { runSync } = await import("./runSync");

  const options: RunSyncOptions = {
    trigger: scheduled.trigger,
    includePlatformCache:
      scheduled.includePlatformCache,
    pullLimit: scheduled.pullLimit,
    pullTableNames:
      scheduled.pullTableNames.size > 0
        ? [...scheduled.pullTableNames]
        : undefined,
  };

  return runSync(options);
}

export function scheduleSync(
  options: ScheduleSyncOptions = {},
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  mergeSchedule(options);
  lastScheduledAt = Date.now();

  if (options.forceImmediate) {
    void executePendingSync().catch((error) => {
      console.error(
        "[sync-scheduler] immediate sync failed",
        error,
      );
    });

    return;
  }

  const delayMs = Math.min(
    MAX_DELAY_MS,
    Math.max(
      MIN_DELAY_MS,
      Number(
        options.delayMs ??
          DEFAULT_LOCAL_WRITE_DELAY_MS,
      ),
    ),
  );

  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    void executePendingSync().catch((error) => {
      console.error(
        "[sync-scheduler] scheduled sync failed",
        error,
      );
    });
  }, delayMs);
}

export function scheduleLocalWriteSync(
  tableName: string,
  options?: {
    delayMs?: number;
  },
) {
  scheduleSync({
    delayMs:
      options?.delayMs ??
      DEFAULT_LOCAL_WRITE_DELAY_MS,
    trigger: "local-write",
    pullTableNames: [tableName],
  });
}

export function triggerSyncNow(
  options: Omit<
    ScheduleSyncOptions,
    "forceImmediate" | "delayMs"
  > = {},
) {
  scheduleSync({
    ...options,
    forceImmediate: true,
  });
}

export function triggerLoginSync() {
  triggerSyncNow({
    trigger: "login",
    includePlatformCache: true,
  });
}

export function triggerRoleSelectionSync(
  tables?: readonly string[],
) {
  triggerSyncNow({
    trigger: "role-selection",
    includePlatformCache: true,
    pullTableNames: tables,
  });
}

export function triggerManualSync(
  options?: {
    includePlatformCache?: boolean;
    pullTableNames?: readonly string[];
  },
) {
  triggerSyncNow({
    trigger: "manual",
    includePlatformCache:
      options?.includePlatformCache ??
      true,
    pullTableNames:
      options?.pullTableNames,
  });
}

export function cancelScheduledSync() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  pending = null;
}

export function flushScheduledSync() {
  return executePendingSync();
}

export function getSyncSchedulerState() {
  return {
    scheduled: Boolean(timer || pending),
    lastScheduledAt,
    pendingTrigger:
      pending?.trigger || null,
    pendingTables:
      pending
        ? [...pending.pullTableNames]
        : [],
  };
}