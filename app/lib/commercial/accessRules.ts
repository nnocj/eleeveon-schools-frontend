/** Stage 2 canonical, side-effect-free browser access rules.
 * Backend entitlements remain authoritative; these rules mirror read-time expiry
 * to avoid permitting stale browser snapshots. Never use this as server security.
 */
export type AccessState = 'active'|'trial'|'grace'|'past_due'|'expired'|'suspended'|'cancelled'|'unknown';
export type AccessAction = 'read'|'write'|'export'|'billing';
export type Deployment = 'connected'|'offline';
export type SyncMode = 'full'|'platform_only'|'disabled';

export function normalizeDeployment(value: unknown): Deployment {
  const v = String(value ?? '').toLowerCase();
  return ['offline','offline_local','independent_essentials','independent_multi_device','independent_essential','independent_multidevice'].includes(v) ? 'offline' : 'connected';
}
export function normalizeSyncPolicy(value: unknown): SyncMode {
  return value === 'full' || value === 'platform_only' ? value : 'disabled';
}
export function parseExpiry(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(n) ? n : NaN;
}
export function deriveStatus(input: {status?: string|null;validUntil?: unknown;graceEndsAt?: unknown}, now = Date.now()): AccessState {
  const state = String(input.status ?? 'unknown').toLowerCase() as AccessState;
  if (state === 'suspended' || state === 'cancelled' || state === 'expired') return state;
  if (!['active','trial','grace','past_due'].includes(state)) return 'unknown';
  const until = parseExpiry(input.validUntil);
  const grace = parseExpiry(input.graceEndsAt);
  if (Number.isNaN(until) || Number.isNaN(grace)) return 'unknown';
  if (until !== null && now >= until) {
    if (grace !== null && now < grace) return 'grace';
    return 'expired';
  }
  if (state === 'grace' && grace !== null && now >= grace) return 'expired';
  return state;
}
/** Read/export policy is intentionally non-destructive for expired users.
 * Suspended/cancelled accounts are denied protected data access. Backend decides
 * exact operations; clients must not infer a right to server-side mutation. */
export function allowLocalAction(state: AccessState, action: AccessAction): boolean {
  if (action === 'billing') return true;
  if (state === 'suspended' || state === 'cancelled' || state === 'unknown') return false;
  if (action === 'write') return state === 'active' || state === 'trial' || state === 'grace';
  return true;
}
export function canUseFeature(state: AccessState, features: Record<string,boolean> | undefined, key: string): boolean {
  return allowLocalAction(state,'write') && features?.[key] === true;
}
export function withinResourceLimit(state: AccessState, limit: number|null|undefined, used: number, increase = 1): boolean {
  if (!allowLocalAction(state,'write')) return false;
  if (!Number.isFinite(used) || !Number.isFinite(increase) || used < 0 || increase < 0) return false;
  if (limit == null) return true;
  return Number.isFinite(limit) && limit >= 0 && used + increase <= limit;
}
