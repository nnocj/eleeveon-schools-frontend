import { readSharedAccessToken, writeSharedAccessToken, clearSharedAccessToken } from "../auth/sharedAccessToken";
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

const AUTH_TOKEN_KEY = "eleeveon_auth_token";
const AUTH_USER_KEY = "eleeveon_auth_user";
const AUTH_ACCOUNT_KEY = "eleeveon_auth_account";

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ApiOptions = {
  method?: ApiMethod;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
};

type TokenLikeResponse = {
  token?: string;
  accessToken?: string;
  access_token?: string;
};

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function buildApiUrl(path: string): string {
  const normalizedPath = String(path || "").trim();

  if (!normalizedPath) {
    throw new Error("API path is required.");
  }

  if (isAbsoluteUrl(normalizedPath)) {
    return normalizedPath;
  }

  return `${API_BASE_URL}${
    normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`
  }`;
}

function shouldSendJsonBody(method: ApiMethod, body: unknown): boolean {
  if (body === undefined || body === null) return false;
  return method !== "GET";
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;

  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
}

function buildHeaders(
  token: string | null,
  body: unknown,
  customHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(customHeaders || {}),
  };

  const hasContentType = Object.keys(headers).some(
    (key) => key.toLowerCase() === "content-type",
  );

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (!hasContentType && body !== undefined && body !== null && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function parseApiResponse(text: string): unknown {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractApiErrorMessage(
  data: any,
  status: number,
): string {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (Array.isArray(data?.message)) {
    return data.message.filter(Boolean).join(", ");
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }

  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error.trim();
  }

  return `API request failed with status ${status}.`;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return readSharedAccessToken();
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;

  const normalized = String(token || "").trim();

  if (!normalized) {
    throw new Error("Invalid auth token.");
  }

  writeSharedAccessToken(normalized);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  clearSharedAccessToken();
}

export function getStoredAuthUser<T = any>(): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredAuthUser(user: unknown): void {
  if (typeof window === "undefined") return;

  if (!user) {
    window.localStorage.removeItem(AUTH_USER_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearStoredAuthUser(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_USER_KEY);
}

export function getStoredAuthAccount<T = any>(): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredAuthAccount(account: unknown): void {
  if (typeof window === "undefined") return;

  if (!account) {
    window.localStorage.removeItem(AUTH_ACCOUNT_KEY);
    return;
  }

  window.localStorage.setItem(
    AUTH_ACCOUNT_KEY,
    JSON.stringify(account),
  );
}

export function clearStoredAuthAccount(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_ACCOUNT_KEY);
}

export function clearAuthSession(): void {
  clearAuthToken();
  clearStoredAuthUser();
  clearStoredAuthAccount();
}

export function extractAuthToken(
  data: TokenLikeResponse | null | undefined,
): string | null {
  return (
    data?.token ||
    data?.accessToken ||
    data?.access_token ||
    null
  );
}

export async function apiClient<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const method: ApiMethod = options.method || "GET";
  const token = options.token ?? getAuthToken();
  const url = buildApiUrl(path);

  const requestBody = shouldSendJsonBody(method, options.body)
    ? serializeBody(options.body)
    : undefined;

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: buildHeaders(
        token,
        options.body,
        options.headers,
      ),
      body: requestBody,
      signal: options.signal,
      credentials: options.credentials || "include",
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "Unknown network error.";

    const networkError = new Error(
      `Could not reach the Eleeveon API at ${url}. ${detail}`,
    ) as Error & { isNetworkError: boolean };
    networkError.isNetworkError = true;
    throw networkError;
  }

  // A short-lived access token may expire while the durable browser session
  // remains valid. Renew once, then retry the original request. Never retry
  // login/refresh/logout requests or explicit caller-provided tokens.
  if (response.status === 401 && options.token === undefined &&
      !/^\/auth\/(login|register|refresh|logout)(?:\?|$)/.test(path)) {
    const { renewAccessToken } = await import("../auth/renewAccessToken");
    const renewed = await renewAccessToken(API_BASE_URL);
    if (renewed && renewed !== token) {
      return apiClient<T>(path, { ...options, token: renewed });
    }
  }

  const text = await response.text();
  const data = parseApiResponse(text) as any;

  if (!response.ok) {
    const message = extractApiErrorMessage(
      data,
      response.status,
    );

    // A 401 can mean an expired short-lived access token, not revoked identity.
    // The account/session coordinator decides whether to renew or sign out.
    const error = new Error(`${message} [${method} ${url}]`) as Error & { status: number; statusCode: number };
    error.status = response.status;
    error.statusCode = response.status;
    throw error;
  }

  return data as T;
}
