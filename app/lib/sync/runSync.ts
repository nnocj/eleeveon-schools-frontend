
/**
 * app/lib/sync/runSync.ts
 * --------------------------------------------------------------------------
 * Entitlement-aware, account-safe synchronization coordinator.
 *
 * - One active sync per tab, with a queued request for different workloads.
 * - Identical requests are single-flight (share one Promise).
 * - Interactive table pulls get priority over queued background pulls.
 * - A background pull yields at a committed page boundary and resumes later.
 * - Filtered pulls never mark the account-wide bootstrap as complete.
 * - Subscription policy, repair of pending records, push-first ordering,
 *   device registration and cross-tab locking are preserved.
 *
 * SECURITY: Backend /sync/pull must enforce selected membership and role
 * scope before profile-limited users are given foreground module requests.
 * Frontend filters are NOT a substitute for backend authorization.
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
  refreshSyncLock,
  releaseSyncLock,
} from "./syncStorage";

import { refreshPlatformCache } from "./platformCache";
import { registerSyncDevice } from "./syncDevices";
import {
  createSyncExecutionPlan,
  syncModeLabel,
  type EffectiveSyncMode,
} from "./syncPolicy";
import { resolveSyncPolicy } from "./resolveSyncPolicy";
import { assertSyncRegistryMatchesDatabase } from "./syncRegistryAudit";
import { repairPendingSyncRecords } from "./pendingRecordRepair";

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

export type SyncPriority = "background" | "normal" | "interactive";

export type RunSyncOptions = {
  includePlatformCache?: boolean;
  pullLimit?: number;
  /** A safe local-first table subset; has its OWN pull cursor. */
  pullTableNames?: string[];
  trigger?: SyncTrigger;
  priority?: SyncPriority;
  refreshPolicy?: boolean;
  /** Repairs legacy pending record metadata before an account-wide push. */
  repairPendingRecords?: boolean;
};

export type SyncListener = (
  result: SyncResult | null,
  syncing: boolean,
) => void;

type RunOutcome = {
  value: SyncResult;
  yielded: boolean;
};

type SyncJob = {
  key: string;
  accountId: string;
  options: RunSyncOptions;
  priority: number;
  sequence: number;
  promise: Promise<SyncResult>;
  resolve: (result: SyncResult) => void;
};

let activeSyncPromise: Promise<SyncResult> | null = null;
let activeJob: SyncJob | null = null;
let activeAccountId: string | null = null;
let activeOptions: RunSyncOptions | null = null;
let activeMode: EffectiveSyncMode | null = null;
let lastResult: SyncResult | null = null;
let registryAudited = false;
let nextSequence = 0;

const jobs: SyncJob[] = [];
const listeners = new Set<SyncListener>();

function report(input: {
  ok: boolean;
  pushed?: number;
  pulled?: number;
  errors?: string[];
  startedAt: number;
}): SyncResult {
  return {
    ok: input.ok,
    pushed: input.pushed ?? 0,
    pulled: input.pulled ?? 0,
    errors: input.errors ?? [],
    startedAt: input.startedAt,
    finishedAt: Date.now(),
  };
}

function emit(): void {
  const syncing = Boolean(activeSyncPromise || activeJob || jobs.length);
  for (const listener of listeners) {
    try {
      listener(lastResult, syncing);
    } catch (error) {
      console.error("[sync] listener failed", error);
    }
  }
}

function normalizeOptions(options: RunSyncOptions): RunSyncOptions {
  return {
    ...options,
    pullTableNames: options.pullTableNames?.length
      ? [...new Set(options.pullTableNames.map((table) => table.trim()).filter(Boolean))].sort()
      : undefined,
    pullLimit: options.pullLimit === undefined
      ? undefined
      : Math.min(2_000, Math.max(1, Math.floor(Number(options.pullLimit) || 500))),
  };
}

function priorityOf(options: RunSyncOptions): number {
  if (options.priority === "interactive") return 3;
  if (options.priority === "normal") return 2;
  if (options.priority === "background") return 1;
  if (options.pullTableNames?.length) return 3;
  if (["manual", "local-write", "role-selection"].includes(options.trigger || "")) return 2;
  return 1;
}

function workKey(accountId: string, options: RunSyncOptions): string {
  // Trigger and priority affect scheduling, not the sync's data semantics.
  return JSON.stringify({
    accountId,
    tables: options.pullTableNames || [],
    cache: options.includePlatformCache === true,
    limit: options.pullLimit || 0,
    refreshPolicy: options.refreshPolicy === true,
    repair: options.repairPendingRecords !== false,
  });
}

function createJob(accountId: string, options: RunSyncOptions): SyncJob {
  let resolve!: (result: SyncResult) => void;
  const promise = new Promise<SyncResult>((settle) => { resolve = settle; });
  return {
    accountId,
    options,
    key: workKey(accountId, options),
    priority: priorityOf(options),
    sequence: nextSequence++,
    promise,
    resolve,
  };
}

function enqueue(accountId: string, options: RunSyncOptions): Promise<SyncResult> {
  const key = workKey(accountId, options);
  if (activeJob?.key === key) return activeJob.promise;
  const existing = jobs.find((job) => job.key === key);
  if (existing) {
    existing.priority = Math.max(existing.priority, priorityOf(options));
    return existing.promise;
  }
  const job = createJob(accountId, options);
  jobs.push(job);
  startNextJob();
  return job.promise;
}

function resumeInBackground(previous: SyncJob): void {
  if (getAccountId() !== previous.accountId) return;
  const options: RunSyncOptions = {
    ...previous.options,
    trigger: "timer",
    priority: "background",
  };
  // This is queued AFTER the foreground work. No new external caller is needed.
  void enqueue(previous.accountId, options);
}

function startNextJob(): void {
  if (activeJob || activeSyncPromise || !jobs.length) return;
  jobs.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
  const job = jobs.shift()!;
  activeJob = job;
  activeAccountId = job.accountId;
  activeOptions = job.options;
  activeMode = null;

  let yielded = false;
  const running = executeSync(job)
    .then((outcome) => {
      yielded = outcome.yielded;
      lastResult = outcome.value;
      return outcome.value;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const value = report({ ok: false, startedAt: Date.now(), errors: [message] });
      lastResult = value;
      setLastSyncError(message);
      return value;
    });

  activeSyncPromise = running.finally(() => {
    job.resolve(lastResult!);
    activeSyncPromise = null;
    activeJob = null;
    activeAccountId = null;
    activeOptions = null;
    activeMode = null;
    if (yielded) resumeInBackground(job);
    startNextJob();
    emit();
  });
  emit();
}

export function runSync(options: RunSyncOptions = {}): Promise<SyncResult> {
  const normalized = normalizeOptions(options);
  const accountId = getAccountId();
  if (!accountId) {
    return Promise.resolve(report({
      ok: false,
      startedAt: Date.now(),
      errors: ["Account session is missing. Sign in again."],
    }));
  }
  return enqueue(accountId, normalized);
}

/**
 * Call from a visible module when its server-authorized records are needed.
 * Example: requestPrioritySync(["students", "assessmentScores"])
 * (Use only table names present in the backend role's allow-list.)
 */
export function requestPrioritySync(tableNames: string[]): Promise<SyncResult> {
  if (!tableNames.length) {
    throw new Error("Priority sync requires at least one local-first table.");
  }
  return runSync({
    pullTableNames: tableNames,
    trigger: "manual",
    priority: "interactive",
    includePlatformCache: false,
    repairPendingRecords: false,
  });
}

export function isSyncRunning(): boolean {
  return Boolean(activeJob || activeSyncPromise || jobs.length);
}
export function getActiveSyncPromise(): Promise<SyncResult> | null {
  return activeSyncPromise;
}
export function getSyncingAccountId(): string | null {
  return activeAccountId;
}
export function getActiveSyncOptions(): RunSyncOptions | null {
  return activeOptions;
}
export function getActiveSyncMode(): EffectiveSyncMode | null {
  return activeMode;
}
export function getLastSyncResult(): SyncResult | null {
  return lastResult;
}
export function subscribeToSync(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(lastResult, isSyncRunning());
  return () => { listeners.delete(listener); };
}

async function executeSync(job: SyncJob): Promise<RunOutcome> {
  const startedAt = Date.now();
  const accountId = job.accountId;
  const options = job.options;
  const filtered = Boolean(options.pullTableNames?.length);

  if (getAccountId() !== accountId) {
    return {
      value: report({ ok: false, startedAt, errors: ["Account changed before queued sync began."] }),
      yielded: false,
    };
  }
  if (!registryAudited) {
    assertSyncRegistryMatchesDatabase();
    registryAudited = true;
  }
  assertAccountId();

  const online = isOnline();
  const policy = await resolveSyncPolicy(accountId, {
    forceRefresh: options.refreshPolicy === true,
    online,
  });
  activeMode = policy.mode;
  emit();
  const plan = createSyncExecutionPlan(policy, options);

  if (policy.mode === "offline") {
    let errors: string[] = [];
    if (online && plan.shouldRefreshPlatformCache && !filtered) {
      const cache = await refreshPlatformCache({ silent: true });
      errors = cache.errors;
    }
    if (errors.length) setLastSyncError(errors.join("; "));
    else setLastSyncError(null);
    return { value: report({ ok: errors.length === 0, startedAt, errors }), yielded: false };
  }

  if (!online) {
    const message = `${syncModeLabel(policy.mode)} requires an internet connection.`;
    setLastSyncError(message);
    return { value: report({ ok: false, startedAt, errors: [message] }), yielded: false };
  }

  const lockOwner = [
    getDeviceId(), startedAt, Math.random().toString(36).slice(2, 9),
  ].join(":");
  if (!acquireSyncLock({ accountId, owner: lockOwner })) {
    return {
      value: report({
        ok: false, startedAt,
        errors: ["This account is already syncing in another Eleeveon tab."],
      }),
      yielded: false,
    };
  }

  try {
    if (plan.shouldRegisterDevice && !filtered) {
      await registerSyncDevice({ silent: true }).catch(() => undefined);
    }
    assertAccountUnchanged(accountId, "before sync");

    // Priority table reads should not wait for a full account-wide push.
    // Pending writes remain in Dexie; the resumed normal job pushes them.
    if (!filtered && plan.shouldPush && options.repairPendingRecords !== false) {
      const repair = await repairPendingSyncRecords();
      if (repair.errors.length) {
        console.warn("[sync] Some pending records could not be repaired", repair);
      }
    }
    const push = plan.shouldPush && !filtered
      ? await pushSync({ accountId })
      : { pushed: 0, errors: [] as string[] };

    assertAccountUnchanged(accountId, "before pull");
    const pull = plan.shouldPull
      ? await pullSync({
          accountId,
          limit: options.pullLimit,
          tableNames: options.pullTableNames,
          onPageApplied: () => {
            assertAccountUnchanged(accountId, "during pull");
            if (!refreshSyncLock({ accountId, owner: lockOwner })) {
              throw new Error("Cross-tab synchronization lock was lost.");
            }
          },
          shouldYield: () =>
            !filtered && jobs.some((queued) =>
              queued.accountId === accountId && queued.priority > job.priority,
            ),
        })
      : {
          pulled: 0, errors: [] as string[], cacheUpdated: 0,
          completed: true, yielded: false,
        };

    const yielded = pull.yielded === true;
    const cacheErrors: string[] = [];
    if (plan.shouldRefreshPlatformCache && !filtered && !yielded) {
      assertAccountUnchanged(accountId, "before platform-cache refresh");
      const cache = await refreshPlatformCache({ silent: true });
      cacheErrors.push(...cache.errors);
    }
    const errors = [
      ...(push.errors || []),
      ...(pull.errors || []),
      ...cacheErrors,
    ];
    if (plan.shouldPull && !pull.completed && !yielded && !errors.length) {
      errors.push("Pull stopped without completing all pages.");
    }
    const ok = errors.length === 0;

    if (ok && !yielded) {
      // Filtered success does NOT mean a complete account-wide bootstrap.
      if (!filtered) {
        setLastSyncOkAt(Date.now());
        if (plan.shouldPull && pull.completed) {
          setBootstrapCompleted(true);
        }
      }
      setLastSyncError(null);
    } else if (yielded && !errors.length) {
      // An intentional yield is not a network failure or a complete sync.
      setLastSyncError(null);
    } else {
      setLastSyncError(errors.join("; "));
    }

    return {
      value: report({
        ok, pushed: push.pushed, pulled: pull.pulled, errors, startedAt,
      }),
      yielded: yielded && ok,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setLastSyncError(message);
    return {
      value: report({ ok: false, startedAt, errors: [message] }),
      yielded: false,
    };
  } finally {
    releaseSyncLock(accountId, lockOwner);
  }
}

function assertAccountUnchanged(expectedAccountId: string, stage: string): void {
  if (getAccountId() !== expectedAccountId) {
    throw new Error(`Account changed ${stage}; synchronization cancelled.`);
  }
}
