"use client";

/**
 * app/hooks/useRealtimeStatus.ts
 * --------------------------------------------------------------------------
 * Convenience hook for portal/status components.
 */

import { useRealtime } from "../context/realtime-context";

export function useRealtimeStatus() {
  return useRealtime();
}

export default useRealtimeStatus;