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
};

type TokenLikeResponse = {
  token?: string;
  accessToken?: string;
  access_token?: string;
};

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;

  if (!token || typeof token !== "string") {
    throw new Error("Invalid auth token.");
  }

  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getStoredAuthUser<T = any>(): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredAuthUser(user: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearStoredAuthUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_USER_KEY);
}

export function getStoredAuthAccount<T = any>(): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(AUTH_ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredAuthAccount(account: unknown) {
  if (typeof window === "undefined") return;

  if (!account) {
    localStorage.removeItem(AUTH_ACCOUNT_KEY);
    return;
  }

  localStorage.setItem(AUTH_ACCOUNT_KEY, JSON.stringify(account));
}

export function clearStoredAuthAccount() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_ACCOUNT_KEY);
}

export function clearAuthSession() {
  clearAuthToken();
  clearStoredAuthUser();
  clearStoredAuthAccount();
}

export function extractAuthToken(data: TokenLikeResponse | null | undefined) {
  return data?.token || data?.accessToken || data?.access_token || null;
}

export async function apiClient<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const token = options.token ?? getAuthToken();
  const url = path.startsWith("http")
    ? path
    : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
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
      typeof data === "string"
        ? data
        : Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message ||
          data?.error ||
          `API request failed with status ${response.status}`;

    if (response.status === 401 && typeof window !== "undefined") {
      clearAuthSession();
    }

    throw new Error(message);
  }

  return data as T;
}