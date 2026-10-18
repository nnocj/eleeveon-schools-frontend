/**
 * Eleeveon Phase 4 — defensive offline role-switch preflight.
 * A cached route is required for full-document offline navigation.
 * This is an availability check, NOT an authentication grant.
 * A cached HTML response alone cannot guarantee all dynamic JS chunks are available;
 * full cold-start verification is part of the release hardening phase.
 */
const IDENTITY_KEYS = [
  "eleeveon_open_workspace", "activeMembership", "activeMembershipId",
  "activeRole", "activeSchoolId", "activeBranchId",
  "activeTeacherId", "activeStudentId", "activeParentId",
] as const;

type IdentityKey = typeof IDENTITY_KEYS[number];
export type WorkspaceStorageSnapshot = Record<IdentityKey, string | null>;

export function captureWorkspaceStorage(): WorkspaceStorageSnapshot {
  const snapshot = {} as WorkspaceStorageSnapshot;
  for (const key of IDENTITY_KEYS) {
    try { snapshot[key] = typeof window === "undefined" ? null :
      (window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)); }
    catch { snapshot[key] = null; }
  }
  return snapshot;
}

export function restoreWorkspaceStorage(snapshot: WorkspaceStorageSnapshot): void {
  if (typeof window === "undefined") return;
  for (const key of IDENTITY_KEYS) {
    try {
      if (snapshot[key] == null) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, snapshot[key]!);
        window.sessionStorage.setItem(key, snapshot[key]!);
      }
    } catch { /* storage might be disabled */ }
  }
}

/** Call before changing membership and before a document navigation. */
export async function assertSwitchTargetAvailable(targetPath: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!targetPath.startsWith("/") || targetPath.startsWith("//")) {
    throw new Error("Invalid workspace destination.");
  }
  if (navigator.onLine) return;
  if (!("caches" in window)) {
    throw new Error("Offline role switching is unavailable in this browser. Keep your current workspace open.");
  }
  const url = new URL(targetPath, window.location.origin).href;
  try {
    // Workbox may store the navigation as a full URL. Check both variants.
    const cached = await window.caches.match(url, { ignoreSearch: true }) ||
      await window.caches.match(targetPath, { ignoreSearch: true });
    if (!cached || !cached.ok ||
        !(cached.headers.get("content-type") || "").includes("text/html")) {
      throw new Error(
        "This role's portal has not been prepared for offline opening. " +
        "Open it once while online, then try switching offline.",
      );
    }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Could not verify the offline destination. Your current role is unchanged.");
  }
}
