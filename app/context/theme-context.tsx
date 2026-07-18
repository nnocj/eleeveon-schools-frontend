"use client";

/**
 * app/context/theme-context.tsx
 * --------------------------------------------------------------------------
 * Exact role-scoped appearance engine.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import type { UserMembership } from "../lib/auth/roleRedirect";
import { useActiveMembership } from "./active-membership-context";
import { useSettings } from "./settings-context";
import {
  appearanceIdentityFor,
  appearanceIdentityMatches,
  type AppearanceScope,
} from "../lib/theme/appearanceScope";
import {
  applyAppearanceForRole,
  clearScopedAppearance,
  PLATFORM_APPEARANCE_DEFAULTS,
  type AppliedAppearance,
  type ScopedAppearanceSettings,
} from "../lib/theme/applyScopedAppearance";

export type ThemeState = {
  loading: boolean;
  ready: boolean;
  mode: "light" | "dark";
  primaryColor: string;
  fontFamily: string;
  fontSize: number;
  logo?: string;
  branchSettings: Record<string, any> | null;
  theme: ScopedAppearanceSettings | null;
  effectiveScope: AppearanceScope;
  appliedFor: AppliedAppearance | null;
  refreshTheme: () => Promise<void>;
  applyForMembership: (membership: UserMembership) => Promise<AppliedAppearance | null>;
  resetAppearance: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeMembership } = useActiveMembership();
  const settingsContext = useSettings();
  const [appliedFor, setAppliedFor] = useState<AppliedAppearance | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const resetAppearance = useCallback(() => {
    requestRef.current += 1;
    clearScopedAppearance();
    setAppliedFor(null);
    setLoading(false);
  }, []);

  const applyForMembership = useCallback(async (membership: UserMembership) => {
    const request = ++requestRef.current;
    setLoading(true);
    clearScopedAppearance();

    const resolved = await settingsContext.hydrateSettingsForMembership(membership);
    if (request !== requestRef.current) return null;

    const applied = applyAppearanceForRole({
      role: String(membership.role || ""),
      accountId: String(membership.accountId || "") || null,
      schoolId: Number(membership.schoolId || 0) || null,
      branchId: Number(membership.branchId || 0) || null,
      settings: resolved as ScopedAppearanceSettings | null,
    });

    if (request === requestRef.current) {
      setAppliedFor(applied);
      setLoading(false);
    }
    return applied;
  }, [settingsContext.hydrateSettingsForMembership]);

  const refreshTheme = useCallback(async () => {
    if (!activeMembership) {
      resetAppearance();
      return;
    }
    await applyForMembership(activeMembership);
  }, [activeMembership, applyForMembership, resetAppearance]);

  // Automatic application is intentionally owned by PortalAppearanceRuntime.


  const expectedIdentity = activeMembership
    ? appearanceIdentityFor({
        role: activeMembership.role,
        accountId: activeMembership.accountId,
        schoolId: activeMembership.schoolId,
        branchId: activeMembership.branchId,
      })
    : null;

  const ready = Boolean(
    !loading &&
    activeMembership &&
    appliedFor &&
    appearanceIdentityMatches(appliedFor, expectedIdentity),
  );

  const effective = settingsContext.effectiveSettings as any;
  const value = useMemo<ThemeState>(() => ({
    loading,
    ready,
    mode: appliedFor?.mode || "light",
    primaryColor: appliedFor?.primaryColor || PLATFORM_APPEARANCE_DEFAULTS.primaryColor,
    fontFamily: String(effective?.fontFamily || PLATFORM_APPEARANCE_DEFAULTS.fontFamily),
    fontSize: Number(effective?.fontSize || 16),
    logo: effective?.logo || undefined,
    branchSettings: settingsContext.branchSettings,
    theme: effective || null,
    effectiveScope: appliedFor?.scope || settingsContext.effectiveScope,
    appliedFor,
    refreshTheme,
    applyForMembership,
    resetAppearance,
  }), [
    loading, ready, appliedFor, effective, settingsContext.branchSettings,
    settingsContext.effectiveScope, refreshTheme, applyForMembership, resetAppearance,
  ]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}