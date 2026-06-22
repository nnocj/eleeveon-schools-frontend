/**
 * app/lib/sync/syncHttp.ts
 * ---------------------------------------------------------
 * Small auth-aware fetch client for sync.
 */

import { getApiBaseUrl, getAuthToken } from "./syncConfig";

type SyncHttpOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  headers?: Record<string, string>;
};

export async function syncHttp<T>(endpoint: string, options: SyncHttpOptions = {}): Promise<T> {
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
