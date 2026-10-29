/**
 * app/lib/sync/syncSuccessTimestamps.ts
 * Store completed push/pull timestamps for the current browser, per account.
 * Records no successes on its own: runSync.ts calls markSuccessfulSyncPhase
 * only after the corresponding network phase finishes successfully.
 */

export type SyncSuccessTimestamps = {
  lastPushAt: number | null;
  lastPullAt: number | null;
};

export const SYNC_SUCCESS_TIMESTAMPS_EVENT =
  "eleeveon:sync-success-timestamps-updated";

function storageKey(accountId: string): string {
  return `eleeveon:sync-success-times:v1:${encodeURIComponent(accountId)}`;
}

function validTimestamp(value: unknown): number | null {
  const date = typeof value === "number" ? value : Number(value);
  return Number.isFinite(date) && date > 0 && date <= Date.now() + 60_000
    ? date
    : null;
}

export function getSyncSuccessTimestamps(
  accountId?: string | null,
): SyncSuccessTimestamps {
  const empty: SyncSuccessTimestamps = {
    lastPushAt: null,
    lastPullAt: null,
  };

  if (!accountId || typeof window === "undefined") return empty;

  try {
    const stored = window.localStorage.getItem(storageKey(accountId));
    if (!stored) return empty;
    const data = JSON.parse(stored) as Partial<SyncSuccessTimestamps>;
    return {
      lastPushAt: validTimestamp(data.lastPushAt),
      lastPullAt: validTimestamp(data.lastPullAt),
    };
  } catch {
    return empty;
  }
}

export function markSuccessfulSyncPhase(
  accountId: string,
  phase: "push" | "pull",
  finishedAt = Date.now(),
): void {
  if (!accountId || typeof window === "undefined") return;
  const at = validTimestamp(finishedAt);
  if (at === null) return;

  const previous = getSyncSuccessTimestamps(accountId);
  const next: SyncSuccessTimestamps = {
    ...previous,
    ...(phase === "push" ? { lastPushAt: at } : { lastPullAt: at }),
  };

  try {
    window.localStorage.setItem(storageKey(accountId), JSON.stringify(next));
  } catch (error) {
    console.warn("[sync] Could not persist successful sync timestamp", error);
  }

  window.dispatchEvent(new CustomEvent(SYNC_SUCCESS_TIMESTAMPS_EVENT, {
    detail: { accountId, phase, finishedAt: at },
  }));
}
