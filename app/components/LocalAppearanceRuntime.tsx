"use client";

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
  applyEleeveonDesignTokens,
  createEleeveonDesignTokens,
  type EleeveonDensity,
} from "../lib/design";
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
  resolvedMode?: ResolvedAppearanceMode;
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
  return String(value || "").trim().toLowerCase() === "dark"
    ? "dark"
    : "light";
}

function sameIdentityValue(left: unknown, right: unknown): boolean {
  const leftId = cleanId(left);
  const rightId = cleanId(right);
  if (!leftId || !rightId) return true;
  return leftId === rightId;
}

/**
 * Eleeveon brand accent is independent of the personal light/dark choice.
 * The design-token generator also writes accent tokens, so do this AFTER
 * both appearance/token passes. Both light and dark use the same brand.
 *
 * Do not change surface/background/text tokens here: those belong to the
 * user's selected appearance mode.
 */
function applyWorkspaceBrandAccent(primaryColor: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const color = primaryColor.trim() || "#2f6fed";
  const compact = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)
    ? color.slice(1)
    : "";
  const hex = compact.length === 3
    ? compact.split("").map((part) => part + part).join("")
    : compact;
  const number = hex ? Number.parseInt(hex, 16) : null;
  const brightness = number === null ? 0 :
    (((number >> 16) & 255) * 299 + ((number >> 8) & 255) * 587 +
      (number & 255) * 114) / 1000;
  const brandText = brightness > 155 ? "#111827" : "#ffffff";
  const accentTokens: Record<string, string> = {
    "--ba-primary": color,
    "--ba-primary-text": brandText,
    "--eds-primary-text": brandText,
    "--primary-color": color,
    "--dashboard-primary": color,
    "--branch-primary": color,
    "--accent-color": color,
    "--eds-primary": color,
    "--eds-brand-primary": color,
    "--eds-primary-soft": `color-mix(in srgb, ${color} 15%, transparent)`,
    "--eds-primary-softer": `color-mix(in srgb, ${color} 8%, transparent)`,
  };

  for (const [name, value] of Object.entries(accentTokens)) {
    // A theme-specific stylesheet must not reset the role brand in light mode.
    root.style.setProperty(name, value, "important");
  }
}

function publishWindowAppearance(
  mode: ResolvedAppearanceMode,
  primaryColor: string,
  settings: LocalPortalSettings,
  sharedFontSize: unknown,
) {
  if (typeof document === "undefined") return;

  const density = String(
    settings.density || "comfortable",
  ) as EleeveonDensity;

  const tokens = createEleeveonDesignTokens({
    mode,
    density:
      density === "compact" ||
      density === "spacious"
        ? density
        : "comfortable",
    reduceMotion: Boolean(settings.reduceMotion),
    primaryColor,
    fontSize: Number(settings.fontSize || sharedFontSize || 16),
    textureIntensity: 1,
  });

  applyEleeveonDesignTokens(
    document.documentElement,
    tokens,
  );

  // The token generator may reset --eds-primary for the selected mode.
  // Reassert the workspace accent after BOTH light and dark token passes.
  applyWorkspaceBrandAccent(primaryColor);

  const root = document.documentElement;
  const computed =
    getComputedStyle(
      document.documentElement,
    );

  const windowColor =
    computed
      .getPropertyValue(
        "--eds-header-bg",
      )
      .trim() ||
    (mode === "dark"
      ? "#111a2b"
      : "#f8fafc");

  root.dataset.appearanceMode = mode;
  root.dataset.edsReady = "true";
  root.style.setProperty(
    "--window-chrome-fallback",
    windowColor,
  );

  let meta =
    document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]:not([media])',
    );

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  meta.content = windowColor;
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
    activeRole || activeMembership?.role || settingsContext.loadedFor?.role || "portal",
  );

  const storageKey = useMemo(
    () => getLocalSettingsStorageKey({ accountId, schoolId, branchId, roleKey }),
    [accountId, branchId, roleKey, schoolId],
  );

  const sharedSettings =
    (settingsContext.effectiveSettings as Record<string, any> | null) ||
    (settingsContext.settings as Record<string, any> | null) ||
    null;

  const sharedDefaultMode = resolveSharedMode(
    sharedSettings?.appearanceMode || sharedSettings?.theme || sharedSettings?.mode || theme.mode,
  );
  const sharedFontSize = sharedSettings?.fontSize ?? theme.fontSize ?? 16;

  const [settings, setSettings] = useState<LocalPortalSettings>(DEFAULT_LOCAL_PORTAL_SETTINGS);
  const [resolvedMode, setResolvedMode] = useState<ResolvedAppearanceMode>(sharedDefaultMode);
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

  // The Students module obtains the institutional primary colour directly
  // from SettingsContext. Do the same here ONLY when settings have been
  // hydrated for this exact school/branch. Previously theme.appliedFor won
  // even when it still held the Eleeveon default blue.
  const selectedSettingsMatch = Boolean(
    settingsContext.ready &&
    settingsContext.loadedFor &&
    settingsContext.effectiveScope === "branch" &&
    cleanRole(settingsContext.loadedFor.role) === roleKey &&
    cleanId(settingsContext.loadedFor.accountId) === accountId &&
    cleanId(settingsContext.loadedFor.schoolId) === schoolId &&
    cleanId(settingsContext.loadedFor.branchId) === branchId,
  );

  const resolvedBranchColor = selectedSettingsMatch
    ? String(sharedSettings?.primaryColor || settingsContext.branchSettings?.primaryColor || "").trim()
    : "";

  const sharedPrimaryColor =
    resolvedBranchColor ||
    (theme.ready && appearanceMatchesWorkspace
      ? String(theme.primaryColor || theme.appliedFor?.primaryColor || "").trim()
      : "") ||
    (settingsContext.ready && settingsContext.effectiveScope !== "branch"
      ? String(sharedSettings?.primaryColor || "").trim()
      : "") ||
    "#2f6fed";

  const apply = useCallback(
    (
      preferred?:
        LocalPortalSettings | null,
      source:
        "bootstrap" |
        "explicit" |
        "storage" |
        "shared-refresh" =
          "bootstrap",
    ) => {
      const next = preferred || readLocalPortalSettings(storageKey);
      const result = applyLocalPortalSettings(next, {
        sharedDefaultMode,
        sharedPrimaryColor,
        sharedFontSize,
      });

      publishWindowAppearance(
        result.resolvedMode,
        sharedPrimaryColor,
        result.settings,
        sharedFontSize,
      );

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

      if (lastAppliedSignatureRef.current !== signature && typeof window !== "undefined") {
        lastAppliedSignatureRef.current = signature;
        window.dispatchEvent(
          new CustomEvent("eleeveon:appearance-design-bridge", {
            detail: {
              resolvedMode: result.resolvedMode,
              density: result.settings.density,
              reduceMotion: result.settings.reduceMotion,
              fontSize: result.settings.fontSize,
              appearanceMode:
                result.settings.appearanceMode,
              source,
              storageKey,
              at: Date.now(),
            },
          }),
        );

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
    [sharedDefaultMode, sharedFontSize, sharedPrimaryColor, storageKey, theme.appliedFor?.key],
  );

  const refresh = useCallback(() => {
    if (!theme.ready || !appearanceMatchesWorkspace) return;
    apply();
  }, [appearanceMatchesWorkspace, apply, theme.ready]);

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
      // A previous workspace may have written !important brand values.
      // Release them while the next workspace is being resolved.
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        for (const token of [
          "--primary-color", "--dashboard-primary", "--branch-primary",
          "--accent-color", "--ba-primary", "--ba-primary-text",
          "--eds-primary", "--eds-brand-primary", "--eds-primary-text",
          "--eds-primary-soft", "--eds-primary-softer",
        ]) {
          if (root.style.getPropertyPriority(token) === "important") {
            root.style.removeProperty(token);
          }
        }
      }
      return;
    }
    apply();
  }, [appearanceMatchesWorkspace, apply, settingsContext.loadedFor?.key, theme.appliedFor?.key, theme.ready]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleLocalChange = (
      event: Event,
    ) => {
      const custom =
        event as CustomEvent<
          LocalSettingsChangeDetail
        >;

      if (
        custom.detail?.storageKey &&
        custom.detail.storageKey !==
          storageKey
      ) {
        return;
      }

      /*
       * This is an explicit user selection. Do not wait for another nav click,
       * ThemeContext refresh or route remount. The exact storage key is enough
       * authority to apply it immediately.
       */
      apply(
        custom.detail?.settings ||
          readLocalPortalSettings(
            storageKey,
          ),
        "explicit",
      );
    };

    const handleLocalRefresh = (
      event: Event,
    ) => {
      const custom =
        event as CustomEvent<
          LocalSettingsChangeDetail
        >;

      if (
        custom.detail?.storageKey &&
        custom.detail.storageKey !==
          storageKey
      ) {
        return;
      }

      apply(
        custom.detail?.settings ||
          readLocalPortalSettings(
            storageKey,
          ),
        "explicit",
      );
    };

    const handleStorage = (
      event: StorageEvent,
    ) => {
      if (
        event.storageArea ===
          window.localStorage &&
        event.key === storageKey &&
        theme.ready &&
        appearanceMatchesWorkspace
      ) {
        apply(null, "storage");
      }
    };

    const handleSharedAppearance =
      () => {
        if (
          theme.ready &&
          appearanceMatchesWorkspace
        ) {
          apply(
            null,
            "shared-refresh",
          );
        }
      };

    window.addEventListener(
      LOCAL_SETTINGS_CHANGED_EVENT,
      handleLocalChange,
    );

    window.addEventListener(
      "eleeveon:local-appearance-refresh",
      handleLocalRefresh,
    );

    window.addEventListener(
      "storage",
      handleStorage,
    );

    window.addEventListener(
      "eleeveon:shared-theme-applied",
      handleSharedAppearance,
    );

    return () => {
      window.removeEventListener(
        LOCAL_SETTINGS_CHANGED_EVENT,
        handleLocalChange,
      );

      window.removeEventListener(
        "eleeveon:local-appearance-refresh",
        handleLocalRefresh,
      );

      window.removeEventListener(
        "storage",
        handleStorage,
      );

      window.removeEventListener(
        "eleeveon:shared-theme-applied",
        handleSharedAppearance,
      );
    };
  }, [
    appearanceMatchesWorkspace,
    apply,
    storageKey,
    theme.ready,
  ]);

  const value = useMemo<LocalAppearanceRuntimeValue>(
    () => ({ ready, storageKey, settings, resolvedMode, refresh }),
    [ready, refresh, resolvedMode, settings, storageKey],
  );

  return (
    <LocalAppearanceRuntimeContext.Provider value={value}>
      {children}
    </LocalAppearanceRuntimeContext.Provider>
  );
}
