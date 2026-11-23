import { writeSharedAccessToken } from "./sharedAccessToken";

/**
 * Cookie-based, single-flight online renewal. The server must issue a secure,
 * HttpOnly, SameSite refresh cookie at login and implement POST /auth/refresh.
 * No refresh secret is stored in JavaScript-accessible browser storage.
 * If the server has not enabled this contract, existing 401 handling remains.
 */
let pending: Promise<string | null> | null = null;

export function renewAccessToken(apiBaseUrl: string): Promise<string | null> {
  if (typeof window === "undefined" || !navigator.onLine) return Promise.resolve(null);
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const payload = await response.json() as { accessToken?: string; token?: string };
      const token = payload.accessToken || payload.token;
      if (!token || typeof token !== "string") return null;
      writeSharedAccessToken(token);
      return token;
    } catch {
      // A network outage is not proof that a session was revoked.
      return null;
    }
  })().finally(() => { pending = null; });
  return pending;
}
