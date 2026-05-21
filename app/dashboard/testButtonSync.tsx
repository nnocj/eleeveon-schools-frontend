"use client";

import { runSync } from "../lib/sync/syncEngine";

export default function TestSyncButton() {
  async function handleSync() {
    try {
      const result = await runSync();

      console.log("SYNC RESULT:", result);

      alert(
        `Sync Complete\nPushed: ${result.pushed}\nPulled: ${result.pulled}`
      );
    } catch (error) {
      console.error(error);
      alert("Sync failed");
    }
  }

  return (
    <button
      onClick={handleSync}
      style={{
        padding: 12,
        borderRadius: 10,
        border: "none",
        background: "var(--primary-color)",
        color: "#fff",
        cursor: "pointer",
      }}
    >
      Sync Now
    </button>
  );
}