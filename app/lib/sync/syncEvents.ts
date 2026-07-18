/**
 * app/lib/sync/syncEvents.ts
 * --------------------------------------------------------------------------
 * Sync/local-write helpers for selective revisions and cross-tab delivery.
 *
 * Phase 10:
 * - Branch Settings save publishes schoolBranchSettings exactly once;
 * - the selective revision wakes SettingsContext;
 * - the legacy browser event wakes PortalAppearanceRuntime;
 * - a debounced sync request is scheduled after the local Dexie commit.
 */

import {
  type DataChangeMetadata,
  normalizeChangedTables,
  publishDataEvent,
} from "../events/dataEvents";

import {
  broadcastDataEvent,
  startCrossTabDataEvents,
} from "../events/crossTabEvents";

export const SYNC_REQUESTED_EVENT =
  "eleeveon:sync-requested";

export const BRANCH_SETTINGS_UPDATED_EVENT =
  "school-branch-settings-updated";

export type SyncRequestDetail = {
  accountId?: string | null;
  changedTables: string[];
  reason?: string;
  requestedAt: number;
};

let scheduledSyncTimer:
  ReturnType<typeof setTimeout> | null =
  null;

function publishAndBroadcast(input: {
  source:
    | "sync-pull-completed"
    | "sync-push-completed"
    | "local-write"
    | "manual";
  accountId?: string | null;
  changedTables?: readonly string[];
  metadata?: DataChangeMetadata;
}) {
  const changedTables =
    normalizeChangedTables(input.changedTables);

  if (changedTables.length === 0) return null;

  startCrossTabDataEvents();

  const event = publishDataEvent({
    source: input.source,
    accountId: input.accountId,
    changedTables,
    metadata: input.metadata,
  });

  broadcastDataEvent(event);
  return event;
}

export function scheduleSyncRequest(input: {
  accountId?: string | null;
  changedTables?: readonly string[];
  reason?: string;
  delayMs?: number;
}) {
  if (typeof window === "undefined") return;

  const changedTables =
    normalizeChangedTables(input.changedTables);

  if (!changedTables.length) return;

  if (scheduledSyncTimer) {
    clearTimeout(scheduledSyncTimer);
  }

  scheduledSyncTimer = setTimeout(() => {
    scheduledSyncTimer = null;

    const detail: SyncRequestDetail = {
      accountId: input.accountId,
      changedTables,
      reason: input.reason,
      requestedAt: Date.now(),
    };

    /**
     * SyncBootstrap/SyncProvider may listen to this event and call their normal
     * guarded sync method. The event does not execute sync inside a page module,
     * so lock, online, auth and generation protections remain centralized.
     */
    window.dispatchEvent(
      new CustomEvent<SyncRequestDetail>(
        SYNC_REQUESTED_EVENT,
        { detail },
      ),
    );
  }, Math.max(0, Number(input.delayMs ?? 120)));
}

export function publishSyncPullCompleted(input: {
  accountId: string;
  changedTables?: readonly string[];
}) {
  return publishAndBroadcast({
    source: "sync-pull-completed",
    accountId: input.accountId,
    changedTables: input.changedTables,
  });
}

export function publishSyncPushCompleted(input: {
  accountId: string;
  changedTables?: readonly string[];
}) {
  return publishAndBroadcast({
    source: "sync-push-completed",
    accountId: input.accountId,
    changedTables: input.changedTables,
  });
}

export function publishLocalWrite(input: {
  accountId?: string | null;
  changedTables?: readonly string[];
  metadata?: DataChangeMetadata;
  scheduleSync?: boolean;
  syncReason?: string;
}) {
  const event = publishAndBroadcast({
    source: "local-write",
    accountId: input.accountId,
    changedTables: input.changedTables,
    metadata: input.metadata,
  });

  if (event && input.scheduleSync !== false) {
    scheduleSyncRequest({
      accountId: input.accountId,
      changedTables: event.changedTables,
      reason:
        input.syncReason ||
        input.metadata?.reason ||
        "local-write",
    });
  }

  return event;
}

export function publishManualDataRefresh(input: {
  accountId?: string | null;
  changedTables?: readonly string[];
  metadata?: DataChangeMetadata;
}) {
  return publishAndBroadcast({
    source: "manual",
    accountId: input.accountId,
    changedTables: input.changedTables,
    metadata: input.metadata,
  });
}

/**
 * Single authoritative post-commit notification for Branch Settings.
 *
 * Call this only after schoolBranchSettings and its media ownership updates
 * have completed successfully in Dexie.
 */
export function publishBranchSettingsSaved(input: {
  accountId: string;
  schoolId: number;
  branchId: number;
  localId?: number | null;
}) {
  const changedTables = [
    "schoolBranchSettings",
  ] as const;

  const event = publishLocalWrite({
    accountId: input.accountId,
    changedTables,
    scheduleSync: true,
    syncReason: "branch-settings-saved",
    metadata: {
      reason: "branch-settings-saved",
      schoolId: input.schoolId,
      branchId: input.branchId,
      localId: input.localId,
      scheduleSync: true,
    },
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(
        BRANCH_SETTINGS_UPDATED_EVENT,
        {
          detail: {
            accountId: input.accountId,
            schoolId: input.schoolId,
            branchId: input.branchId,
            localId: input.localId || null,
            changedTables: [
              "schoolBranchSettings",
            ],
            eventId: event?.eventId || null,
            at: Date.now(),
          },
        },
      ),
    );
  }

  return event;
}