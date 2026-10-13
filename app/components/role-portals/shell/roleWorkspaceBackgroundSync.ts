
/**
 * app/components/role-portals/shell/roleWorkspaceBackgroundSync.ts
 * ------------------------------------------------------------------
 * ELEEVEON NON-BLOCKING ROLE WORKSPACE PREPARATION
 * ------------------------------------------------------------------
 *
 * Responsibilities:
 * - Prepare authorized school/branch records after portal entry.
 * - Never block portal navigation.
 * - Reuse previously completed workspace downloads.
 * - Avoid duplicate same-workspace bootstrap operations.
 * - Avoid competing with an account sync already running.
 * - Serialize workspace bootstrap requests in this browser tab.
 * - Skip queued work for workspaces no longer selected.
 * - Support retries when called again after reconnection.
 *
 * Note:
 * The global account sync and the workspace bootstrap still need
 * a shared scheduling/locking mechanism for full concurrency safety.
 * This helper is the first, non-blocking integration stage.
 */

import type {
  UserMembership,
} from "../../../lib/auth/roleRedirect";

import {
  appearanceScopeForRole,
} from "../../../lib/theme/appearanceScope";

import {
  getAccountId,
} from "../../../lib/sync/syncConfig";

import {
  getActiveSyncPromise,
} from "../../../lib/sync/runSync";

import {
  bootstrapSelectedWorkspace,
} from "../../../lib/sync/workspaceBootstrap";

import {
  membershipKey,
  readOpenWorkspaceSession,
} from "./rolePortalWorkspace";

const activeJobs = new Map<string, Promise<void>>();

let bootstrapQueue: Promise<void> = Promise.resolve();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function workspaceKey(
  accountId: string,
  membership: UserMembership,
): string {
  return [
    accountId,
    membershipKey(membership),
    clean(membership.role),
    clean(membership.schoolId),
    clean(membership.branchId),
  ].join("|");
}

function isCurrentWorkspace(
  accountId: string,
  membership: UserMembership,
): boolean {
  if (getAccountId() !== accountId) {
    return false;
  }

  const opened = readOpenWorkspaceSession();

  if (!opened?.membership) {
    return false;
  }

  const openedAccountId = clean(
    opened.membership.accountId,
  );

  if (
    openedAccountId &&
    openedAccountId !== accountId
  ) {
    return false;
  }

  return (
    workspaceKey(
      accountId,
      opened.membership,
    ) ===
    workspaceKey(
      accountId,
      membership,
    )
  );
}

function isConnected(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.onLine
  );
}

export function prepareRoleWorkspaceInBackground(
  membership: UserMembership,
): Promise<void> {
  const scope = appearanceScopeForRole(
    membership.role,
  );

  if (
    scope !== "school" &&
    scope !== "branch"
  ) {
    return Promise.resolve();
  }

  const accountId = getAccountId();

  if (!accountId) {
    return Promise.resolve();
  }

  if (
    membership.accountId &&
    clean(membership.accountId) !== accountId
  ) {
    return Promise.resolve();
  }

  const key = workspaceKey(
    accountId,
    membership,
  );

  const existing = activeJobs.get(key);

  if (existing) {
    return existing;
  }

  const job = bootstrapQueue
    .catch(() => undefined)
    .then(async () => {
      if (
        !isConnected() ||
        !isCurrentWorkspace(
          accountId,
          membership,
        )
      ) {
        return;
      }

      const runningAccountSync =
        getActiveSyncPromise();

      if (runningAccountSync) {
        await runningAccountSync.catch(
          () => undefined,
        );
      }

      if (
        !isConnected() ||
        !isCurrentWorkspace(
          accountId,
          membership,
        )
      ) {
        return;
      }

      await bootstrapSelectedWorkspace(
        membership,
        {
          allowCached: true,
          force: false,
        },
      );
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.warn(
        "[Eleeveon] Background workspace download:",
        message,
      );
    })
    .finally(() => {
      activeJobs.delete(key);
    });

  activeJobs.set(key, job);

  bootstrapQueue = job.then(
    () => undefined,
    () => undefined,
  );

  return job;
}
