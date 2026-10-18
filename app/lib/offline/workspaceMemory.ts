/**
 * Eleeveon Schools — per-membership last-module memory (Phase 1).
 *
 * Navigation memory is a UI preference, NOT authorization or authentication.
 * No account, school or role is ever granted access based on this storage.
 * Never store student records or credentials here.
 */

const PREFIX = "eleeveon:last-module:v1:";

export type SavedWorkspaceModule = {
  accountId: string;
  membershipId: string;
  moduleKey: string;
  openedAt: number;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function storageKey(accountId: string, membershipId: string): string {
  return `${PREFIX}${encodeURIComponent(accountId)}:${encodeURIComponent(membershipId)}`;
}

/** Returns null when the account, membership or stored value is unavailable. */
export function readLastWorkspaceModule(
  accountId: string | null | undefined,
  membershipId: string | null | undefined,
): string | null {
  if (typeof window === "undefined") return null;
  const account = clean(accountId);
  const membership = clean(membershipId);
  if (!account || !membership) return null;

  try {
    const raw = window.localStorage.getItem(storageKey(account, membership));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedWorkspaceModule>;
    if (
      saved.accountId !== account ||
      saved.membershipId !== membership ||
      typeof saved.moduleKey !== "string"
    ) return null;
    return clean(saved.moduleKey) || null;
  } catch {
    return null;
  }
}

/** Call only after normal portal navigation has already been authorized. */
export function rememberLastWorkspaceModule(
  accountId: string | null | undefined,
  membershipId: string | null | undefined,
  moduleKey: string,
): void {
  if (typeof window === "undefined") return;
  const account = clean(accountId);
  const membership = clean(membershipId);
  const module = clean(moduleKey);
  if (!account || !membership || !module) return;

  const saved: SavedWorkspaceModule = {
    accountId: account,
    membershipId: membership,
    moduleKey: module,
    openedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(storageKey(account, membership), JSON.stringify(saved));
  } catch {
    // Browsers may restrict storage. Navigation continues without persistence.
  }
}

export function clearLastWorkspaceModule(
  accountId: string | null | undefined,
  membershipId: string | null | undefined,
): void {
  if (typeof window === "undefined") return;
  const account = clean(accountId);
  const membership = clean(membershipId);
  if (!account || !membership) return;
  try {
    window.localStorage.removeItem(storageKey(account, membership));
  } catch {}
}
