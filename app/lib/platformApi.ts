import { readSharedAccessToken, writeSharedAccessToken } from "./auth/sharedAccessToken";

/**
 * app/lib/platformApi.ts
 * ---------------------------------------------------------
 * FRONTEND API CLIENT FOR ELEEVEON BACKEND
 * ---------------------------------------------------------
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:4000";

export function getAuthToken() { return readSharedAccessToken() || ""; }
export function saveAuthToken(token?: string | null) {
  if (token) writeSharedAccessToken(token);
}

export function extractToken(data: any) {
  return data?.accessToken || data?.token || data?.access_token || null;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: options.credentials ?? "include",
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
      `Request failed with status ${response.status}`;
    const error = new Error(Array.isArray(message) ? message.join(", ") : message) as Error & { status: number; statusCode: number };
    error.status = response.status;
    error.statusCode = response.status;
    throw error;
  }

  return data as T;
}

export async function apiList<T = any>(path: string) {
  return apiRequest<T[]>(path);
}

export async function apiCreate<T = any>(path: string, body: any) {
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiUpdate<T = any>(path: string, body: any) {
  return apiRequest<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T = any>(path: string) {
  return apiRequest<T>(path, { method: "DELETE" });
}
