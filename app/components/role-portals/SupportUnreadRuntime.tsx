"use client";
/** App-wide Eleeveon Center unread count; no message plaintext in events or badges. */
import { useEffect } from "react";
import { useAccount } from "../../context/account-context";
import { supportApi } from "../../lib/support/supportApi";
import { setEleeveonAppUnreadBadge } from "../../lib/support/appBadge";

export const SUPPORT_UNREAD_EVENT = "eleeveon:support-unread";
export const SUPPORT_UNREAD_REFRESH = "eleeveon:support-unread-refresh";
export default function SupportUnreadRuntime() {
  const { accountId, user } = useAccount() as any;
  useEffect(() => {
    let disposed = false, pending = false;
    const publish = (total: number) => {
      if (disposed) return;
      window.dispatchEvent(new CustomEvent(SUPPORT_UNREAD_EVENT, { detail: { total } }));
      void setEleeveonAppUnreadBadge(total);
    };
    if (!accountId || !user?.id) {
      publish(0);
      return () => { disposed = true; };
    }
    const refresh = async () => {
      if (disposed || pending || document.hidden || !navigator.onLine) return;
      pending = true;
      try { const result = await supportApi.unread(); publish(Math.max(0, Number(result.total) || 0)); }
      catch { /* Keep previous count when offline or unauthorized; never invent zero. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    window.addEventListener(SUPPORT_UNREAD_REFRESH, focus);
    const visibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true; clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      window.removeEventListener(SUPPORT_UNREAD_REFRESH, focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [accountId, user?.id]);
  return null;
}
