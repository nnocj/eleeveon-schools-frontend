"use client";

/**
 * app/context/theme-context.tsx
 * --------------------------------------------------------------------------
 * Exact role-scoped appearance engine.
 *
 * Live appearance upgrade:
 * - PortalAppearanceRuntime remains responsible for workspace hydration.
 * - ThemeContext now reacts whenever SettingsContext publishes new effective
 *   appearance values for the currently active role/workspace.
 * - Fresh branch settings update appliedFor and document CSS variables without
 *   requiring a role switch, page reload, or full workspace bootstrap.
 * - SettingsContext values take precedence over stale appliedFor values.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  applyForMembership: (
    membership: UserMembership,
  ) => Promise<AppliedAppearance | null>;
  resetAppearance: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

function textValue(value: unknown, fallback: string) {
  const parsed = String(value ?? "").trim();
  return parsed || fallback;
}

function optionalId(value: unknown): string | null {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedMode(value: unknown): "light" | "dark" {
  return String(value || "").toLowerCase() === "dark" ? "dark" : "light";
}

function appearanceSignature(settings: Record<string, any> | null | undefined) {
  if (!settings) return "none";

  return JSON.stringify({
    id: settings.id ?? null,
    accountId: settings.accountId ?? null,
    schoolId: settings.schoolId ?? null,
    branchId: settings.branchId ?? null,
    primaryColor: settings.primaryColor ?? null,
    theme: settings.theme ?? settings.mode ?? null,
    fontFamily: settings.fontFamily ?? null,
    fontSize: settings.fontSize ?? null,
    logo: settings.logo ?? null,
    logoMediaId: settings.logoMediaId ?? null,
    updatedAt: settings.updatedAt ?? null,
    version: settings.version ?? null,
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeMembership } = useActiveMembership();
  const settingsContext = useSettings();

  const [appliedFor, setAppliedFor] =
    useState<AppliedAppearance | null>(null);
  const [loading, setLoading] = useState(true);

  const requestRef = useRef(0);
  const liveApplicationRef = useRef<string | null>(null);

  const effective =
    (settingsContext.effectiveSettings as Record<string, any> | null) || null;

  const resetAppearance = useCallback(() => {
    requestRef.current += 1;
    liveApplicationRef.current = null;
    clearScopedAppearance();
    setAppliedFor(null);
    setLoading(false);
  }, []);

  const applyForMembership = useCallback(
    async (membership: UserMembership) => {
      const request = ++requestRef.current;
      setLoading(true);

      /*
       * This explicit refresh is used for first entry, role switching and manual
       * refreshes. Clearing here is safe because PortalAppearanceRuntime gates
       * the first portal render for the new appearance identity.
       */
      clearScopedAppearance();

      try {
        const resolved =
          await settingsContext.hydrateSettingsForMembership(membership);

        if (request !== requestRef.current) return null;

        const applied = applyAppearanceForRole({
          role: String(membership.role || ""),
          accountId: optionalId(membership.accountId),
          schoolId: optionalId(membership.schoolId),
          branchId: optionalId(membership.branchId),
          settings: resolved as ScopedAppearanceSettings | null,
        });

        if (request === requestRef.current) {
          liveApplicationRef.current = null;
          setAppliedFor(applied);
          setLoading(false);
        }

        return applied;
      } catch (error) {
        if (request === requestRef.current) {
          setLoading(false);
        }
        throw error;
      }
    },
    [settingsContext.hydrateSettingsForMembership],
  );

  const refreshTheme = useCallback(async () => {
    if (!activeMembership) {
      resetAppearance();
      return;
    }

    await applyForMembership(activeMembership);
  }, [activeMembership, applyForMembership, resetAppearance]);

  const expectedIdentity = useMemo(
    () =>
      activeMembership
        ? appearanceIdentityFor({
            role: activeMembership.role,
            accountId: activeMembership.accountId,
            schoolId: activeMembership.schoolId,
            branchId: activeMembership.branchId,
          })
        : null,
    [
      activeMembership?.role,
      activeMembership?.accountId,
      activeMembership?.schoolId,
      activeMembership?.branchId,
    ],
  );

  const effectiveSignature = useMemo(
    () => appearanceSignature(effective),
    [effective],
  );

  /*
   * Live settings application
   * ------------------------------------------------------------------------
   * SettingsContext updates effectiveSettings immediately after Branch Settings
   * saves. Previously appliedFor remained unchanged until refreshTheme() or a
   * membership change. RolePortalShell then received the stale theme value.
   *
   * Apply the already-hydrated effective settings directly for the active
   * membership. Do not clear the current appearance first; this is an in-place
   * update and should not flash or unmount the portal.
   */
  useEffect(() => {
    if (!activeMembership || !effective || !expectedIdentity) return;

    const liveKey = `${expectedIdentity.key}::${effectiveSignature}`;
    if (liveApplicationRef.current === liveKey) return;

    const effectiveAccountId =
      textValue(effective.accountId, "") ||
      textValue(activeMembership.accountId, "");

    const effectiveSchoolId =
      textValue(effective.schoolId, "") ||
      textValue(activeMembership.schoolId, "");

    const effectiveBranchId =
      textValue(effective.branchId, "") ||
      textValue(activeMembership.branchId, "");

    /*
     * Prevent settings from a previously opened workspace being applied to the
     * new role while contexts are transitioning.
     */
    if (
      expectedIdentity.accountId &&
      effectiveAccountId &&
      expectedIdentity.accountId !== effectiveAccountId
    ) {
      return;
    }

    if (
      expectedIdentity.schoolId &&
      effectiveSchoolId &&
      String(expectedIdentity.schoolId) !== effectiveSchoolId
    ) {
      return;
    }

    if (
      expectedIdentity.branchId &&
      effectiveBranchId &&
      String(expectedIdentity.branchId) !== effectiveBranchId
    ) {
      return;
    }

    const applied = applyAppearanceForRole({
      role: String(activeMembership.role || ""),
      accountId: optionalId(activeMembership.accountId),
      schoolId: optionalId(activeMembership.schoolId),
      branchId: optionalId(activeMembership.branchId),
      settings: effective as ScopedAppearanceSettings,
    });

    liveApplicationRef.current = liveKey;
    setAppliedFor(applied);
    setLoading(false);
  }, [
    activeMembership,
    expectedIdentity,
    effective,
    effectiveSignature,
  ]);

  /*
   * Remove appearance from a signed-out/no-membership state. The request counter
   * invalidates any older hydration still in flight.
   */
  useEffect(() => {
    if (activeMembership) return;

    requestRef.current += 1;
    liveApplicationRef.current = null;
    clearScopedAppearance();
    setAppliedFor(null);
    setLoading(false);
  }, [activeMembership]);

  const ready = Boolean(
    !loading &&
      activeMembership &&
      appliedFor &&
      appearanceIdentityMatches(appliedFor, expectedIdentity),
  );

  /*
   * Effective settings are intentionally first. This gives a just-saved branch
   * value immediate precedence while appliedFor is being republished.
   */
  const mode = normalizedMode(
    effective?.theme ?? effective?.mode ?? appliedFor?.mode,
  );

  const primaryColor = textValue(
    effective?.primaryColor,
    appliedFor?.primaryColor ||
      PLATFORM_APPEARANCE_DEFAULTS.primaryColor,
  );

  const fontFamily = textValue(
    effective?.fontFamily,
    PLATFORM_APPEARANCE_DEFAULTS.fontFamily,
  );

  const fontSize = numberValue(
    effective?.fontSize,
    16,
  );

  const value = useMemo<ThemeState>(
    () => ({
      loading,
      ready,
      mode,
      primaryColor,
      fontFamily,
      fontSize,
      logo: effective?.logo || undefined,
      branchSettings: settingsContext.branchSettings,
      theme: effective as ScopedAppearanceSettings | null,
      effectiveScope:
        appliedFor?.scope || settingsContext.effectiveScope,
      appliedFor,
      refreshTheme,
      applyForMembership,
      resetAppearance,
    }),
    [
      loading,
      ready,
      mode,
      primaryColor,
      fontFamily,
      fontSize,
      effective,
      settingsContext.branchSettings,
      settingsContext.effectiveScope,
      appliedFor,
      refreshTheme,
      applyForMembership,
      resetAppearance,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}