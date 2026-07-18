"use client";

/**
 * app/components/LocalAppearanceRuntime.tsx
 * --------------------------------------------------------------------------
 * Applies the exact working LocalSettings display palette after shared role
 * branding. Dark surfaces are derived from the protected shared primary colour
 * with the original 0.25 and 0.15 factors.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";

import {
  useActiveMembership,
} from "../context/active-membership-context";

import {
  useSettings,
} from "../context/settings-context";

import {
  useTheme,
} from "../context/theme-context";

import {
  applyLocalPortalSettings,
  DEFAULT_LOCAL_PORTAL_SETTINGS,
  getLocalSettingsStorageKey,
  LOCAL_APPEARANCE_APPLIED_EVENT,
  LOCAL_SETTINGS_CHANGED_EVENT,
  readLocalPortalSettings,
  resolveLocalAppearance,
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

const LocalAppearanceRuntimeContext =
  createContext<
    LocalAppearanceRuntimeValue | null
  >(null);

function positiveNumber(
  value: unknown,
) {
  const parsed = Number(value);

  return Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

export function useLocalAppearanceRuntime() {
  const context =
    useContext(
      LocalAppearanceRuntimeContext,
    );

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
  const {
    activeMembership,
    activeRole,
  } = useActiveMembership();

  const settingsContext =
    useSettings();
  const theme =
    useTheme();

  const accountId =
    String(
      activeMembership?.accountId ||
        settingsContext.loadedFor
          ?.accountId ||
        "",
    ) || null;

  const schoolId =
    positiveNumber(
      activeMembership?.schoolId ||
        settingsContext.loadedFor
          ?.schoolId,
    );

  const branchId =
    positiveNumber(
      activeMembership?.branchId ||
        settingsContext.loadedFor
          ?.branchId,
    );

  const roleKey =
    String(
      activeRole ||
        activeMembership?.role ||
        settingsContext.loadedFor
          ?.role ||
        "portal",
    );

  const storageKey =
    useMemo(
      () =>
        getLocalSettingsStorageKey({
          accountId,
          schoolId,
          branchId,
          roleKey,
        }),
      [
        accountId,
        schoolId,
        branchId,
        roleKey,
      ],
    );

  const sharedSettings =
    settingsContext.effectiveSettings as
      | Record<string, any>
      | null;

  const sharedDefaultMode =
    String(
      sharedSettings?.appearanceMode ||
        sharedSettings?.theme ||
        sharedSettings?.mode ||
        theme.mode ||
        "light",
    );

  const sharedPrimaryColor =
    String(
      sharedSettings?.primaryColor ||
        theme.primaryColor ||
        "var(--primary-color, #2f6fed)",
    );

  const sharedFontSize =
    sharedSettings?.fontSize ||
    theme.fontSize ||
    16;

  const [settings, setSettings] =
    useState<LocalPortalSettings>(
      DEFAULT_LOCAL_PORTAL_SETTINGS,
    );

  const [ready, setReady] =
    useState(false);

  const lastAppliedSignatureRef =
    useRef<string | null>(null);

  const apply = useCallback(
    (
      preferred?:
        | LocalPortalSettings
        | null,
    ) => {
      const next =
        preferred ||
        readLocalPortalSettings(
          storageKey,
        );

      const result =
        applyLocalPortalSettings(
          next,
          {
            sharedDefaultMode,
            sharedPrimaryColor,
            sharedFontSize,
          },
        );

      const signature = JSON.stringify({
        storageKey,
        settings: result.settings,
        resolvedMode: result.resolvedMode,
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
      setReady((current) => current || true);

      const shouldAnnounce =
        lastAppliedSignatureRef.current !== signature;
      lastAppliedSignatureRef.current = signature;

      if (
        shouldAnnounce &&
        typeof window !== "undefined"
      ) {
        window.dispatchEvent(
          new CustomEvent(
            LOCAL_APPEARANCE_APPLIED_EVENT,
            {
              detail: {
                storageKey,
                settings:
                  result.settings,
                resolvedMode:
                  result.resolvedMode,
                appearanceKey:
                  theme.appliedFor
                    ?.key ||
                  null,
                at: Date.now(),
              },
            },
          ),
        );
      }

      return result;
    },
    [
      storageKey,
      sharedDefaultMode,
      sharedPrimaryColor,
      sharedFontSize,
      theme.appliedFor?.key,
    ],
  );

  const refresh =
    useCallback(() => {
      apply();
    }, [apply]);

  /**
   * Shared branding is applied first by PortalAppearanceRuntime/ThemeContext.
   * Reapply the local display layer whenever that exact shared identity changes.
   */
  useEffect(() => {
    if (!theme.ready) {
      setReady((current) => current ? false : current);
      return;
    }

    apply();
  }, [
    theme.ready,
    theme.appliedFor?.key,
    settingsContext.loadedFor?.key,
    apply,
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined"
    ) {
      return;
    }

    const handleLocalChange = (
      event: Event,
    ) => {
      const custom =
        event as CustomEvent<{
          storageKey?: string;
          settings?: LocalPortalSettings;
        }>;

      if (
        custom.detail?.storageKey &&
        custom.detail.storageKey !==
          storageKey
      ) {
        return;
      }

      apply(
        custom.detail?.settings ||
          null,
      );
    };

    const handleStorage = (
      event: StorageEvent,
    ) => {
      if (
        event.key === storageKey
      ) {
        apply();
      }
    };

    const handleThemeRefresh =
      () => apply();

    window.addEventListener(
      LOCAL_SETTINGS_CHANGED_EVENT,
      handleLocalChange,
    );
    window.addEventListener(
      "storage",
      handleStorage,
    );
    window.addEventListener(
      "eleeveon:theme-refresh",
      handleThemeRefresh,
    );

    return () => {
      window.removeEventListener(
        LOCAL_SETTINGS_CHANGED_EVENT,
        handleLocalChange,
      );
      window.removeEventListener(
        "storage",
        handleStorage,
      );
      window.removeEventListener(
        "eleeveon:theme-refresh",
        handleThemeRefresh,
      );
    };
  }, [
    storageKey,
    apply,
  ]);

  const value =
    useMemo<
      LocalAppearanceRuntimeValue
    >(
      () => ({
        ready,
        storageKey,
        settings,
        resolvedMode:
          resolveLocalAppearance(
            settings.appearanceMode,
            sharedDefaultMode,
          ),
        refresh,
      }),
      [
        ready,
        storageKey,
        settings,
        sharedDefaultMode,
        refresh,
      ],
    );

  return (
    <LocalAppearanceRuntimeContext.Provider
      value={value}
    >
      {children}
    </LocalAppearanceRuntimeContext.Provider>
  );
}