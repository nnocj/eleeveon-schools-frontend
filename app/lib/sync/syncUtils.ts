// lib/sync/syncUtils.ts
import { db } from "../db";
import { syncTable } from "./syncEngine";

// ---------------- DEVICE ID ----------------
export const getDeviceId = () => {
  if (typeof window === "undefined") return "server";

  let id = localStorage.getItem("deviceId");

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }

  return id;
};

// ---------------- PREPARE DATA ----------------
export const prepareSyncData = (data: any, existing?: any) => {
  return {
    ...data,
    updatedAt: Date.now(),
    version: existing ? existing.version + 1 : 1,
    deviceId: getDeviceId(),
    synced: "pending",
    isDeleted: data.isDeleted ?? false,
  };
};

// ---------------- CONFLICT RESOLUTION ----------------
export function resolveConflict(local: any, remote: any) {
  if (!local) return remote;
  if (!remote) return local;

  // VERSION FIRST
  if ((remote.version ?? 0) > (local.version ?? 0)) return remote;
  if ((local.version ?? 0) > (remote.version ?? 0)) return local;

  // TIMESTAMP NEXT
  if ((remote.updatedAt ?? 0) > (local.updatedAt ?? 0)) return remote;
  if ((local.updatedAt ?? 0) > (remote.updatedAt ?? 0)) return local;

  // FINAL TIE BREAKER
  return remote.deviceId > local.deviceId ? remote : local;
}

// ---------------- TABLE LIST ----------------
const TABLES = ["students", "scores", "classes"] as const;

// ---------------- PUSH ----------------
export async function pushChanges() {
  for (const tableName of TABLES) {
    const table = (db as any)[tableName];

    try {
      const pending = await table
        .where("synced")
        .equals("pending")
        .limit(100) // 🔥 batching
        .toArray();

      if (!pending.length) continue;

      const res = await fetch(`/api/sync/${tableName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pending),
      });

      if (!res.ok) throw new Error("Push failed");

      const serverData = await res.json();

      await syncTable(tableName, serverData);

    } catch (err) {
      console.error(`❌ Push failed (${tableName})`, err);
    }
  }
}

// ---------------- PULL ----------------
export async function pullChanges() {
  for (const tableName of TABLES) {
    try {
      const res = await fetch(`/api/sync/${tableName}`);

      if (!res.ok) throw new Error("Pull failed");

      const remoteData = await res.json();

      if (!Array.isArray(remoteData)) continue;

      await syncTable(tableName, remoteData);

    } catch (err) {
      console.error(`❌ Pull failed (${tableName})`, err);
    }
  }
}

// ---------------- AUTO SYNC ----------------
let syncRunning = false;

export function startAutoSync() {
  if (syncRunning) return; // 🔥 prevent duplicates
  syncRunning = true;

  setInterval(async () => {
    if (!navigator.onLine) {
      console.log("📴 Offline - skipping sync");
      return;
    }

    try {
      await pushChanges();
      await pullChanges();

      console.log("✅ Sync complete");
    } catch (err) {
      console.error("❌ Sync cycle failed", err);
    }
  }, 10000);
}