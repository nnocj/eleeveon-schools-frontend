/** Stage 4: account-scoped, advisory client student-capacity check.
 * Only the backend can ultimately enforce quotas across devices.
 */
import { db } from "../db/db";
import { readEntitlementCache } from "../subscription/entitlementCache";

export interface StudentCapacity {
  accountId: string;
  usedLocal: number;
  usedServer: number | null;
  effectiveUsed: number;
  limit: number | null;
  remaining: number | null;
  verified: boolean;
  reason: string;
}

export async function readStudentCapacity(accountId: string): Promise<StudentCapacity> {
  if (!accountId) throw new Error("An account is required to check capacity.");
  const students = await db.students.toArray();
  const active = students.filter((row: any) => row.accountId === accountId && !row.isDeleted);
  const usedLocal = new Set(active.map((row: any) => String(row.id || "")).filter(Boolean)).size;
  const cached = readEntitlementCache(accountId);
  const now = Date.now();
  const snapshot = cached?.value?.snapshot;
  const matching = snapshot?.accountId === accountId;
  const status = String(snapshot?.status || "").toLowerCase();
  const validUntil = snapshot?.validUntil ? Date.parse(snapshot.validUntil) : null;
  const graceEnds = snapshot?.graceEndsAt ? Date.parse(snapshot.graceEndsAt) : null;
  const inDate = (validUntil === null || (!Number.isNaN(validUntil) && validUntil > now)) ||
    (status === "grace" && graceEnds !== null && !Number.isNaN(graceEnds) && graceEnds > now);
  const verified = Boolean(cached && matching && cached.expiresAt > now && inDate &&
    ["active", "trial", "grace"].includes(status));
  const raw = snapshot?.limits?.students;
  const limit = verified && typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null;
  const remoteRaw = cached?.value?.usage?.students;
  const usedServer = verified && typeof remoteRaw === "number" && Number.isFinite(remoteRaw) && remoteRaw >= 0
    ? Math.floor(remoteRaw) : null;
  // Conservative preview: the server snapshot may not yet include local pending additions.
  const effectiveUsed = Math.max(usedLocal, usedServer ?? 0);
  const remaining = limit === null ? null : Math.max(0, limit - effectiveUsed);
  return {
    accountId, usedLocal, usedServer, effectiveUsed, limit, remaining, verified,
    reason: !verified ? "Capacity not verified: reconnect and refresh the entitlement. The server will decide on sync."
      : limit === null ? "No student ceiling configured for this account."
      : `${remaining} student place(s) available based on the latest cached entitlement and local records.`,
  };
}

export async function assertLocalStudentCapacity(accountId: string, extra = 1): Promise<StudentCapacity> {
  const capacity = await readStudentCapacity(accountId);
  // Never treat missing or stale cache as proof of entitlement. Offline data may still be
  // saved provisionally; the backend checks authorization and quota when it syncs.
  if (capacity.verified && capacity.limit !== null && capacity.effectiveUsed + extra > capacity.limit) {
    throw new Error(`Student limit of ${capacity.limit} reached. ${capacity.effectiveUsed} students are recorded. Update existing students or choose a larger package.`);
  }
  return capacity;
}
