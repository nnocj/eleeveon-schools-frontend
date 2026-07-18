/**
 * app/lib/auth/sessionGeneration.ts
 * --------------------------------------------------------------------------
 * Monotonic session-generation guard for stale async work.
 */

const STORAGE_KEY = "eleeveon_session_generation";
const LOGOUT_FLAG_KEY = "eleeveon_logout_in_progress";

let memoryGeneration = 0;
let logoutInProgress = false;
const abortControllers = new Set<AbortController>();
const listeners = new Set<(generation: number) => void>();

function readStoredGeneration() {
  if (typeof window === "undefined") return memoryGeneration;
  try {
    const value = Number(
      window.sessionStorage.getItem(STORAGE_KEY) ||
      window.localStorage.getItem(STORAGE_KEY) ||
      0,
    );
    return Number.isFinite(value) && value >= 0 ? value : memoryGeneration;
  } catch {
    return memoryGeneration;
  }
}

function persistGeneration(value: number) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
}

export function getSessionGeneration() {
  memoryGeneration = Math.max(memoryGeneration, readStoredGeneration());
  return memoryGeneration;
}

export function isSessionGenerationCurrent(generation: number) {
  return !isLogoutInProgress() && generation === getSessionGeneration();
}

export function incrementSessionGeneration() {
  memoryGeneration = Math.max(memoryGeneration, readStoredGeneration(), Date.now()) + 1;
  persistGeneration(memoryGeneration);
  for (const listener of listeners) {
    try { listener(memoryGeneration); } catch (error) {
      console.error("[session-generation] listener failed", error);
    }
  }
  return memoryGeneration;
}

export function markLogoutInProgress(value: boolean) {
  logoutInProgress = value;
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(LOGOUT_FLAG_KEY, "true");
    else window.sessionStorage.removeItem(LOGOUT_FLAG_KEY);
  } catch {}
}

export function isLogoutInProgress() {
  if (logoutInProgress) return true;
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(LOGOUT_FLAG_KEY) === "true"; }
  catch { return false; }
}

export function registerSessionAbortController(controller: AbortController) {
  abortControllers.add(controller);
  return () => { abortControllers.delete(controller); };
}

export function abortSessionRequests(reason = "Session invalidated") {
  for (const controller of abortControllers) {
    try { controller.abort(reason); } catch {}
  }
  abortControllers.clear();
}

export function subscribeToSessionGeneration(listener: (generation: number) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}