const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ApiOptions = {
  method?: ApiMethod;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
};

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("eleeveon_auth_token");
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("eleeveon_auth_token", token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("eleeveon_auth_token");
}

export async function apiClient<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const token = options.token || getAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `API request failed with status ${response.status}`
    );
  }

  return data as T;
}