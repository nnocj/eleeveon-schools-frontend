/**
 * Phase 1: read-only discovery of the authenticated account's deployment.
 * This module does not authorize portal access, persist credentials, or route users.
 * Existing Independent offline license and local-session checks remain in force.
 */
export type DeploymentMembership = {
  id: string;
  role: string;
  schoolId: string | null;
  branchId: string | null;
  teacherId: string | null;
  isDefault: boolean;
};

export type DeploymentEntitlement = {
  status: string;
  source: string;
  licenseModel: string;
  deploymentMode: string;
  syncPolicy: string;
  planId: string | null;
  perpetualLicenseId: string | null;
  features: unknown;
  version: number;
};

export type DeploymentContext = {
  schemaVersion: 1;
  accountId: string;
  userId: string;
  activeMembershipId: string | null;
  memberships: DeploymentMembership[];
  entitlement: DeploymentEntitlement | null;
  routingReady: false;
};

export class DeploymentDiscoveryError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'DeploymentDiscoveryError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function optionalId(value: unknown): value is string | null {
  return value === null || nonempty(value);
}

/** Fail closed on malformed responses, unknown schema versions, or routing enablement. */
export function parseDeploymentContext(value: unknown): DeploymentContext {
  if (!record(value) || value.schemaVersion !== 1 ||
      !nonempty(value.accountId) || !nonempty(value.userId) ||
      !optionalId(value.activeMembershipId) || !Array.isArray(value.memberships) ||
      value.memberships.length === 0 || value.routingReady !== false) {
    throw new DeploymentDiscoveryError(0, 'Unexpected deployment discovery response.');
  }
  for (const m of value.memberships) {
    if (!record(m) || !nonempty(m.id) || !nonempty(m.role) ||
        !optionalId(m.schoolId) || !optionalId(m.branchId) ||
        !optionalId(m.teacherId) || typeof m.isDefault !== 'boolean') {
      throw new DeploymentDiscoveryError(0, 'Invalid membership in deployment response.');
    }
  }
  const e = value.entitlement;
  if (e !== null && (!record(e) || !nonempty(e.status) ||
      !nonempty(e.source) || !nonempty(e.licenseModel) ||
      !nonempty(e.deploymentMode) || !nonempty(e.syncPolicy) ||
      !optionalId(e.planId) || !optionalId(e.perpetualLicenseId) ||
      typeof e.version !== 'number' || !Number.isFinite(e.version) ||
      !Object.prototype.hasOwnProperty.call(e, 'features'))) {
    throw new DeploymentDiscoveryError(0, 'Invalid entitlement in deployment response.');
  }
  return value as DeploymentContext;
}

/**
 * Only call with the existing authenticated session's token and configured API origin.
 * No automatic invocation: integrate only after the backend feature flag is enabled in staging.
 */
export async function discoverDeploymentContext(
  apiBaseUrl: string,
  accessToken: string,
  options: { signal?: AbortSignal } = {},
): Promise<DeploymentContext> {
  if (!nonempty(accessToken) || !nonempty(apiBaseUrl)) {
    throw new DeploymentDiscoveryError(0, 'Missing API configuration or authenticated session.');
  }
  const base = new URL(apiBaseUrl);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' &&
      (base.hostname === 'localhost' || base.hostname === '127.0.0.1'))) {
    throw new DeploymentDiscoveryError(0, 'Deployment discovery requires a secure API origin.');
  }
  const url = new URL(`${base.pathname.replace(/\/$/, '')}/auth/deployment-context`, base.origin);
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    signal: options.signal,
  });
  if (!response.ok) {
    throw new DeploymentDiscoveryError(response.status,
      response.status === 401 || response.status === 403
        ? 'Deployment discovery is unavailable for this session.'
        : 'Deployment discovery could not be completed.');
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new DeploymentDiscoveryError(0, 'Invalid JSON from deployment discovery.'); }
  return parseDeploymentContext(payload);
}
