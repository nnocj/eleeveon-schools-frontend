/** Browser/PWA app icon badge. Call ONLY with a server-authoritative unread count. */
export async function setEleeveonAppUnreadBadge(unreadCount: number): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    const count = Number.isFinite(unreadCount) ? Math.max(0, Math.floor(unreadCount)) : 0;
    if (count === 0 && nav.clearAppBadge) {
      await nav.clearAppBadge();
      return true;
    }
    if (count > 0 && nav.setAppBadge) {
      await nav.setAppBadge(count);
      return true;
    }
  } catch { /* Unsupported or denied by this platform. */ }
  return false;
}
