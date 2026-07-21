"use client";

/**
 * app/components/LocalAppearanceRuntime.tsx
 * --------------------------------------------------------------------------
 * Applies role-local display preferences after the shared ThemeContext has
 * finished applying the active workspace branding.
 *
 * Ownership:
 * - ThemeContext owns shared branding, primary colour and shared defaults.
 * - This runtime owns the user's local mode override, density, motion and
 *   personal font-size preference.
 *
 * Safety:
 * - waits for the matching active appearance identity before writing CSS;
 * - resets readiness whenever the role-scoped storage identity changes;
 * - keeps the resolved mode from the exact application result;
 * - never replaces the protected shared primary colour.
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

import { useActiveMembership } from "../context/active-membership-context";
import { useSettings } from "../context/settings-context";
import { useTheme } from "../context/theme-context";
import {
  applyLocalPortalSettings,
  DEFAULT_LOCAL_PORTAL_SETTINGS,
  getLocalSettingsStorageKey,
  LOCAL_APPEARANCE_APPLIED_EVENT,
  LOCAL_SETTINGS_CHANGED_EVENT,
  readLocalPortalSettings,
  type LocalPortalSettings,
  type ResolvedAppearanceMode,
} from "../lib/theme/localPortalAppearance";

type LocalAppearanceRuntimeValue = {
  ready: boolean;
  storageKey: string;
  settings: LocalPortalSettings;
  resolvedMode: ResolvedAppearanceMode;
  refresh: () => void;
};

type LocalSettingsChangeDetail = {
  storageKey?: string;
  settings?: LocalPortalSettings;
};

const LocalAppearanceRuntimeContext =
  createContext<LocalAppearanceRuntimeValue | null>(null);

function cleanId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
}

function cleanRole(value: unknown): string {
  return String(value || "portal")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_") || "portal";
}

function resolveSharedMode(value: unknown): ResolvedAppearanceMode {
  return String(value || "")
    .trim()
    .toLowerCase() === "dark"
    ? "dark"
    : "light";
}

function sameIdentityValue(left: unknown, right: unknown): boolean {
  const leftId = cleanId(left);
  const rightId = cleanId(right);

  if (!leftId || !rightId) return true;
  return leftId === rightId;
}

export function useLocalAppearanceRuntime() {
  const context = useContext(LocalAppearanceRuntimeContext);

  if (!context) {
    throw new Error(
      "useLocalAppearanceRuntime must be used inside LocalAppearanceRuntime.",
    );
  }

  return context;
}

export default function LocalAppearanceRuntime({
  children,
}: {
  children: React.ReactNode;
}) {
  const { activeMembership, activeRole } = useActiveMembership();
  const settingsContext = useSettings();
  const theme = useTheme();

  const accountId = cleanId(
    activeMembership?.accountId ?? settingsContext.loadedFor?.accountId,
  );

  const schoolId = cleanId(
    activeMembership?.schoolId ?? settingsContext.loadedFor?.schoolId,
  );

  const branchId = cleanId(
    activeMembership?.branchId ?? settingsContext.loadedFor?.branchId,
  );

  const roleKey = cleanRole(
    activeRole ||
      activeMembership?.role ||
      settingsContext.loadedFor?.role ||
      "portal",
  );

  const storageKey = useMemo(
    () =>
      getLocalSettingsStorageKey({
        accountId,
        schoolId,
        branchId,
        roleKey,
      }),
    [accountId, branchId, roleKey, schoolId],
  );

  const sharedSettings =
    (settingsContext.effectiveSettings as Record<string, any> | null) ||
    (settingsContext.settings as Record<string, any> | null) ||
    null;

  const sharedDefaultMode = resolveSharedMode(
    sharedSettings?.appearanceMode ||
      sharedSettings?.theme ||
      sharedSettings?.mode ||
      theme.mode,
  );

  const sharedPrimaryColor = String(
    sharedSettings?.primaryColor ||
      theme.primaryColor ||
      "var(--primary-color, #2f6fed)",
  ).trim();

  const sharedFontSize =
    sharedSettings?.fontSize ?? theme.fontSize ?? 16;

  const [settings, setSettings] = useState<LocalPortalSettings>(
    DEFAULT_LOCAL_PORTAL_SETTINGS,
  );
  const [resolvedMode, setResolvedMode] =
    useState<ResolvedAppearanceMode>(sharedDefaultMode);
  const [ready, setReady] = useState(false);

  const lastAppliedSignatureRef = useRef<string | null>(null);
  const activeStorageKeyRef = useRef(storageKey);

  const appearanceMatchesWorkspace = useMemo(() => {
    if (!theme.appliedFor) return false;

    return (
      cleanRole(theme.appliedFor.role) === roleKey &&
      sameIdentityValue(theme.appliedFor.accountId, accountId) &&
      sameIdentityValue(theme.appliedFor.schoolId, schoolId) &&
      sameIdentityValue(theme.appliedFor.branchId, branchId)
    );
  }, [accountId, branchId, roleKey, schoolId, theme.appliedFor]);

  const apply = useCallback(
    (preferred?: LocalPortalSettings | null) => {
      const next = preferred || readLocalPortalSettings(storageKey);

      const result = applyLocalPortalSettings(next, {
        sharedDefaultMode,
        sharedPrimaryColor,
        sharedFontSize,
      });

      const signature = JSON.stringify({
        storageKey,
        settings: result.settings,
        resolvedMode: result.resolvedMode,
        sharedDefaultMode,
        sharedPrimaryColor,
        sharedFontSize,
        appearanceKey: theme.appliedFor?.key || null,
      });

      setSettings((current) =>
        current.appearanceMode === result.settings.appearanceMode &&
        current.fontSize === result.settings.fontSize &&
        current.density === result.settings.density &&
        current.reduceMotion === result.settings.reduceMotion
          ? current
          : result.settings,
      );
      setResolvedMode(result.resolvedMode);
      setReady(true);

      if (
        lastAppliedSignatureRef.current !== signature &&
        typeof window !== "undefined"
      ) {
        lastAppliedSignatureRef.current = signature;

        window.dispatchEvent(
          new CustomEvent(LOCAL_APPEARANCE_APPLIED_EVENT, {
            detail: {
              storageKey,
              settings: result.settings,
              resolvedMode: result.resolvedMode,
              appearanceKey: theme.appliedFor?.key || null,
              at: Date.now(),
            },
          }),
        );
      } else {
        lastAppliedSignatureRef.current = signature;
      }

      return result;
    },
    [
      sharedDefaultMode,
      sharedFontSize,
      sharedPrimaryColor,
      storageKey,
      theme.appliedFor?.key,
    ],
  );

  const refresh = useCallback(() => {
    if (!theme.ready || !appearanceMatchesWorkspace) return;
    apply();
  }, [appearanceMatchesWorkspace, apply, theme.ready]);

  /*
   * A role, school or branch change creates a different local-settings scope.
   * Mark the runtime unready immediately so consumers never read preferences
   * from the previously opened workspace while ThemeContext is transitioning.
   */
  useEffect(() => {
    if (activeStorageKeyRef.current === storageKey) return;

    activeStorageKeyRef.current = storageKey;
    lastAppliedSignatureRef.current = null;
    setSettings(DEFAULT_LOCAL_PORTAL_SETTINGS);
    setResolvedMode(sharedDefaultMode);
    setReady(false);
  }, [sharedDefaultMode, storageKey]);

  useEffect(() => {
    if (!theme.ready || !appearanceMatchesWorkspace) {
      setReady(false);
      return;
    }

    apply();
  }, [
    appearanceMatchesWorkspace,
    apply,
    settingsContext.loadedFor?.key,
    theme.appliedFor?.key,
    theme.ready,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleLocalChange = (event: Event) => {
      const custom = event as CustomEvent<LocalSettingsChangeDetail>;

      if (
        custom.detail?.storageKey &&
        custom.detail.storageKey !== storageKey
      ) {
        return;
      }

      if (!theme.ready || !appearanceMatchesWorkspace) return;
      apply(custom.detail?.settings || null);
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea === window.localStorage &&
        event.key === storageKey &&
        theme.ready &&
        appearanceMatchesWorkspace
      ) {
        apply();
      }
    };

    const handleThemeRefresh = () => {
      if (theme.ready && appearanceMatchesWorkspace) apply();
    };

    window.addEventListener(
      LOCAL_SETTINGS_CHANGED_EVENT,
      handleLocalChange,
    );
    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      "eleeveon:theme-refresh",
      handleThemeRefresh,
    );

    return () => {
      window.removeEventListener(
        LOCAL_SETTINGS_CHANGED_EVENT,
        handleLocalChange,
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        "eleeveon:theme-refresh",
        handleThemeRefresh,
      );
    };
  }, [
    appearanceMatchesWorkspace,
    apply,
    storageKey,
    theme.ready,
  ]);

  const value = useMemo<LocalAppearanceRuntimeValue>(
    () => ({
      ready,
      storageKey,
      settings,
      resolvedMode,
      refresh,
    }),
    [ready, refresh, resolvedMode, settings, storageKey],
  );

  return (
    <LocalAppearanceRuntimeContext.Provider value={value}>
      {children}
    </LocalAppearanceRuntimeContext.Provider>
  );
}