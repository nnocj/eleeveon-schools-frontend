"use client";

/**
 * app/context/database-context.tsx
 * --------------------------------------------------------------------------
 * Shared database startup state.
 *
 * DatabaseBootstrap owns this state. Consumers may read it, but they must not
 * open, close, migrate, or replace the Dexie singleton themselves.
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type {
  DatabaseHealthReport,
  ExternalDatabaseBackup,
} from "../lib/db";

export type DatabaseStatus =
  | "idle"
  | "backing-up"
  | "opening"
  | "upgrading"
  | "validating"
  | "ready"
  | "blocked"
  | "error";

export type DatabaseState = {
  status: DatabaseStatus;
  ready: boolean;
  opening: boolean;
  upgrading: boolean;
  blocked: boolean;
  currentVersion?: number;
  targetVersion: number;
  error?: string;
  backup?: ExternalDatabaseBackup | null;
  health?: DatabaseHealthReport | null;
  retry: () => Promise<void>;
};

const missingProviderState: DatabaseState = {
  status: "idle",
  ready: false,
  opening: false,
  upgrading: false,
  blocked: false,
  currentVersion: undefined,
  targetVersion: 0,
  error: "DatabaseProvider is not mounted.",
  retry: async () => undefined,
};

const DatabaseContext = createContext<DatabaseState | null>(null);

export function DatabaseProvider({
  value,
  children,
}: {
  value: DatabaseState;
  children: ReactNode;
}) {
  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase(): DatabaseState {
  const value = useContext(DatabaseContext);

  if (!value) {
    throw new Error(
      "useDatabase must be used inside DatabaseBootstrap/DatabaseProvider.",
    );
  }

  return value;
}

/**
 * Optional reader for infrastructure code that can tolerate the provider not
 * being mounted yet. Normal pages should use useDatabase().
 */
export function useOptionalDatabase(): DatabaseState {
  return useContext(DatabaseContext) ?? missingProviderState;
}