// lib/sync/syncEngine.ts
import { db } from "../db";
import { resolveConflict } from "./syncUtils";

// 🔥 SAFELY GET TABLE (Dexie typing fix)
function getTable(tableName: string): any {
  return (db as any)[tableName];
}

// 🔥 CORE SYNC FUNCTION
export async function syncTable(
  tableName: string,
  remoteData: any[]
) {
  const table = getTable(tableName);

  if (!table) {
    console.error(`❌ Table ${tableName} not found`);
    return;
  }

  await db.transaction("rw", table, async () => {
    for (const remote of remoteData) {
      try {
        if (!remote?.id) continue;

        const local = await table.get(remote.id);

        // ---------------- INSERT ----------------
        if (!local) {
          await table.put({
            ...remote,
            synced: "synced",
          });
          continue;
        }

        // ---------------- RESOLVE ----------------
        const resolved = resolveConflict(local, remote);

        await table.put({
          ...resolved,
          synced: "synced",
        });

      } catch (err) {
        console.error("❌ Sync row error:", err, remote);
      }
    }
  });
}