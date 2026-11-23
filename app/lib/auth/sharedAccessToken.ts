/** Shared access-token compatibility layer for the two historical API clients.
 * This is not an offline authorization proof or a refresh-token store.
 */
const KEYS = ["eleeveon_auth_token", "eleeveonToken", "accessToken", "token", "authToken", "eleeveon_access_token"] as const;
export function readSharedAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  for (const key of KEYS) {
    try { const value = window.localStorage.getItem(key); if (value) return value; } catch { /* unavailable */ }
  }
  return null;
}
export function writeSharedAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  const value = token.trim();
  if (!value) throw new Error("Invalid access token");
  for (const key of KEYS) window.localStorage.setItem(key, value);
}
export function clearSharedAccessToken(): void {
  if (typeof window === "undefined") return;
  for (const key of KEYS) {
    try { window.localStorage.removeItem(key); window.sessionStorage.removeItem(key); } catch { /* unavailable */ }
  }
}
