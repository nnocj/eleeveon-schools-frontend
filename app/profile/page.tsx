"use client";

import { useEffect, useState } from "react";
import OwnerAccountProfile from "../owner/AccountProfile";
import WorkspaceAppUserProfile from "../components/profile/WorkspaceAppUserProfile";
import { useAccount } from "../context/account-context";

function selectedRole(): string {
  if (typeof window === "undefined") return "";
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const value = storage.getItem("eleeveon_open_workspace");
      if (!value) continue;
      const ws = JSON.parse(value);
      return String(ws?.role || ws?.membership?.role || "").trim().toLowerCase();
    } catch {}
  }
  return "";
}

/** Display route only. Backend MUST enforce owner-only Account permissions. */
export default function ProfilePage() {
  const { user, loading } = useAccount() as any;
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { setRole(selectedRole()); }, [user?.id]);
  if (loading || role === null) return <main style={{padding:20}}>Opening profile…</main>;
  // Owner is the sole Account identity. Other selected roles get AppUser-only.
  const isOwnerRole = role === "super_admin" || role === "owner" || role === "school_owner";
  return isOwnerRole ? <OwnerAccountProfile /> : <WorkspaceAppUserProfile />;
}
