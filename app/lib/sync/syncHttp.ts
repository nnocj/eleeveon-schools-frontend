/**
 * app/lib/sync/syncHttp.ts
 * ---------------------------------------------------------
 * Small auth-aware fetch client for sync.
 */

import { getApiBaseUrl, getAuthToken } from "./syncConfig";
import { IS_INDEPENDENT_RUNTIME, isIndependentPwaRoute } from "../independent/runtimeMode";
import { getAccountId } from "./syncConfig";
import { resolveSyncPolicy } from "./resolveSyncPolicy";

type SyncHttpOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  headers?: Record<string, string>;
};

export async function syncHttp<T>(endpoint: string, options: SyncHttpOptions = {}): Promise<T> {
  if (IS_INDEPENDENT_RUNTIME || isIndependentPwaRoute()) throw new Error(`Cloud sync endpoint ${endpoint} is prohibited in Independent mode`);
  // Enforce account-scoped transport permissions even if a caller bypasses runSync.
  // /sync/policy itself is exempt so that the policy resolver can fetch it.
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Network synchronization is unavailable offline.");
  const route = endpoint.split("?")[0].replace(/\/+$/, "");
  // A workspace bootstrap contains school data. It is NEVER a platform-cache
  // request. Check the server-resolved entitlement before making the POST.
  // Do not use the permissive offline/read-only fallback for this decision.
  if (route === "/sync/workspace-bootstrap") {
    const accountId = getAccountId();
    if (!accountId) throw new Error("Workspace bootstrap blocked: no active account.");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Cloud workspace bootstrap unavailable offline. Existing local records remain unchanged.");
    }
    const policy = await resolveSyncPolicy(accountId, { forceRefresh: true, online: true });
    if (!policy.allowWorkspaceBootstrap || policy.mode === "hybrid" || policy.mode === "offline") {
      throw new Error("Cloud workspace bootstrap is unavailable for this account. Independent accounts use local school records. Local records remain unchanged.");
    }
  }
  if (route === "/sync/push" || route === "/sync/pull") {
    const accountId = getAccountId();
    if (!accountId) throw new Error("Cloud sync blocked: account is not selected.");
    const policy = await resolveSyncPolicy(accountId);
    const allowed = route === "/sync/push" ? policy.allowPush : policy.allowPull;
    if (!allowed || policy.mode === "offline" || policy.mode === "hybrid" || policy.mode === "read_only" && route === "/sync/push") {
      throw new Error(`Cloud ${route} blocked by account sync policy (${policy.mode}).`);
    }
  }
  const baseUrl = getApiBaseUrl();
  const token = getAuthToken();
  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Sync request failed with status ${response.status}`;
    throw new Error(Array.isArray(message) ? message.join(", ") : String(message));
  }

  return data as T;
}
