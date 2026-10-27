"use client";
import { useEffect, useState } from "react";
import { supportApi } from "./supportApi";
/** Lightweight number for portal navigation and account drawer. */
export function useSupportUnread() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const receive = (event: Event) => {
      const n = Number((event as CustomEvent<{total:number}>).detail?.total);
      if (active && Number.isFinite(n)) setUnread(Math.max(0, Math.floor(n)));
    };
    const load = async () => {
      try { const res = await supportApi.unread(); if (active) setUnread(Math.max(0, Number(res.total) || 0)); }
      catch { /* Keep latest valid count. */ }
    };
    window.addEventListener("eleeveon:support-unread", receive);
    void load();
    return () => { active = false; window.removeEventListener("eleeveon:support-unread", receive); };
  }, []);
  return unread;
}
