"use client";

import { useEffect } from "react";

/**
 * Register the existing next-pwa-generated /sw.js on every browser entry.
 * The registration is not tied to Dexie readiness, login or network calls.
 * No skipWaiting, cache deletion, database reset or automatic reload.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const register = async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration("/");
        if (cancelled || existing) return;
        if (navigator.onLine === false) return;
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        // A missing worker must not prevent the school portal from rendering.
        console.warn("[eleeveon:pwa] Service worker registration unavailable", error);
      }
    };
    void register();
    const onOnline = () => { void register(); };
    window.addEventListener("online", onOnline);
    return () => { cancelled = true; window.removeEventListener("online", onOnline); };
  }, []);
  return null;
}
