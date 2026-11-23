/**
 * Eleeveon Schools effective synchronization policy.
 *
 * Commercial records are never checked directly by runSync. The backend
 * resolves subscriptions, perpetual licences, trials, private offers and
 * developer overrides into this small execution contract.
 */

export type EffectiveSyncMode =
  | "full"
  | "hybrid"
  | "offline"
  | "developer"
  | "read_only";

export type EffectiveSyncPolicy = {
  accountId: string;
  mode: EffectiveSyncMode;

  allowPush: boolean;
  allowPull: boolean;
  allowPlatformCache: boolean;
  allowDeviceRegistration: boolean;
  allowWorkspaceBootstrap: boolean;

  /**
   * Local writes remain allowed in hybrid/offline mode. Read-only mode should
   * also be enforced by mutationGuard, not only by runSync.
   */
  allowLocalMutations: boolean;

  reason: string;
  entitlementVersion?: number;
  resolvedAt: number;
  expiresAt?: number | null;
};

export type SyncExecutionPlan = {
  policy: EffectiveSyncPolicy;
  shouldPush: boolean;
  shouldPull: boolean;
  shouldRefreshPlatformCache: boolean;
  shouldRegisterDevice: boolean;
};

export const FALLBACK_READ_ONLY_POLICY = (
  accountId: string,
  reason = "Effective sync policy is unavailable.",
): EffectiveSyncPolicy => ({
  accountId,
  mode: "read_only",
  allowPush: false,
  allowPull: false,
  allowPlatformCache: true,
  allowDeviceRegistration: true,
  allowWorkspaceBootstrap: false,
  allowLocalMutations: false,
  reason,
  resolvedAt: Date.now(),
});

export function createSyncExecutionPlan(
  policy: EffectiveSyncPolicy,
  options?: {
    includePlatformCache?: boolean;
  },
): SyncExecutionPlan {
  return {
    policy,
    shouldPush: policy.allowPush,
    shouldPull: policy.allowPull,
    shouldRefreshPlatformCache:
      policy.allowPlatformCache &&
      options?.includePlatformCache === true,
    shouldRegisterDevice:
      policy.allowDeviceRegistration,
  };
}

export function syncModeLabel(
  mode: EffectiveSyncMode,
): string {
  switch (mode) {
    case "full":
      return "Full Sync";
    case "hybrid":
      return "Hybrid Sync";
    case "offline":
      return "Offline";
    case "developer":
      return "Developer";
    case "read_only":
      return "Read-only";
  }
}
