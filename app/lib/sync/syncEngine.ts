import { pullSync } from "./pullSync";
import { pushSync } from "./pushSync";
import { isOnline, SyncResult } from "./syncConfig";

let syncing = false;

export async function runSync(): Promise<SyncResult> {
  if (syncing) {
    return {
      ok: false,
      pushed: 0,
      pulled: 0,
      errors: ["Sync already running."],
    };
  }

  if (!isOnline()) {
    return {
      ok: false,
      pushed: 0,
      pulled: 0,
      errors: ["Device is offline."],
    };
  }

  syncing = true;

  try {
    const push = await pushSync();
    const pull = await pullSync();

    const errors = [...push.errors, ...pull.errors];

    return {
      ok: errors.length === 0,
      pushed: push.pushed,
      pulled: pull.pulled,
      errors,
    };
  } catch (error: any) {
    return {
      ok: false,
      pushed: 0,
      pulled: 0,
      errors: [error?.message || String(error)],
    };
  } finally {
    syncing = false;
  }
}

export function startAutoSync(intervalMs = 60_000) {
  if (typeof window === "undefined") return () => {};

  const sync = () => {
    if (navigator.onLine) {
      runSync().catch(console.error);
    }
  };

  window.addEventListener("online", sync);

  const interval = window.setInterval(sync, intervalMs);

  return () => {
    window.removeEventListener("online", sync);
    window.clearInterval(interval);
  };
}