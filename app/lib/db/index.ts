/**
 * app/lib/db/index.ts
 * --------------------------------------------------------------------------
 * Eleeveon Schools database public API.
 *
 * Application code should import database values from "@/app/lib/db" or the
 * equivalent relative path. This keeps one Dexie singleton and one startup
 * contract across the entire PWA.
 */

export * from "./db";
export * from "./db-version";
export * from "./db-migrations";
export * from "./db-backup";
export * from "./db-health";