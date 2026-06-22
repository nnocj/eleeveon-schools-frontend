"use client";

/**
 * app/context/theme-context.tsx
 * ---------------------------------------------------------
 * ELEEVEON THEME ENGINE
 * ---------------------------------------------------------
 *
 * Central place where branch/school theme settings control the whole app.
 *
 * Usage in app/layout.tsx:
 *
 * <SettingsProvider>
 *   <ActiveBranchProvider>
 *     <ThemeProvider>
 *       {children}
 *     </ThemeProvider>
 *   </ActiveBranchProvider>
 * </SettingsProvider>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSettings } from "./settings-context";
import { useActiveBranch } from "./active-branch-context";

import { db, SchoolBranchSetting } from "../lib/db";

// ======================================================
// TYPES
// ======================================================

type ThemeMode = "light" | "dark";

type ThemeState = {
  loading: boolean;
  mode: ThemeMode;
  primaryColor: string;
  fontFamily: string;
  fontSize: number;
  logo?: string;
  branchSettings: SchoolBranchSetting | null;
  refreshTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeState | null>(null);

// ======================================================
// HELPERS
// ======================================================

function formSafeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function sameId(a: unknown, b: unknown) {
  return String(a ?? "") === String(b ?? "");
}

function darken(hex: string, factor = 0.35) {
  let col = (hex || "#2563eb").replace("#", "");

  if (col.startsWith("rgb")) return hex || "#2563eb";

  if (col.length === 3) {
    col = col
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(col, 16);
  if (!Number.isFinite(num)) return "#1e293b";

  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);

  return `rgb(${r}, ${g}, ${b})`;
}

function lighten(hex: string, amount = 0.94) {
  let col = (hex || "#2563eb").replace("#", "");

  if (col.startsWith("rgb")) return "#f8fafc";

  if (col.length === 3) {
    col = col
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(col, 16);
  if (!Number.isFinite(num)) return "#f8fafc";

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);

  return `rgb(${nr}, ${ng}, ${nb})`;
}

function getContrastTextColor(hex: string) {
  let col = (hex || "#ffffff").replace("#", "");

  if (col.startsWith("rgb")) return "#ffffff";

  if (col.length === 3) {
    col = col
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(col, 16);
  if (!Number.isFinite(num)) return "#ffffff";

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 140 ? "#111827" : "#ffffff";
}

function setCssVariable(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function setFavicon(icon?: string) {
  if (!icon) return;

  const link: HTMLLinkElement =
    document.querySelector("link[rel~='icon']") || document.createElement("link");

  link.rel = "icon";
  link.href = icon;
  document.head.appendChild(link);
}

// ======================================================
// PROVIDER
// ======================================================

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, loading: settingsLoading } = useSettings() as any;

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: branchLoading,
  } = useActiveBranch() as any;

  const schoolId = formSafeNumber(activeSchoolId || activeSchool?.id || settings?.schoolId);
  const branchId = formSafeNumber(activeBranchId || activeBranch?.id || settings?.branchId);

  const [loading, setLoading] = useState(true);
  const [branchSettings, setBranchSettings] = useState<SchoolBranchSetting | null>(null);

  const refreshTheme = useCallback(async () => {
    if (!schoolId || !branchId) {
      setBranchSettings(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const rows = await db.schoolBranchSettings.toArray();

      const exactAccountRow =
        rows.find((row: any) => {
          if (row.isDeleted) return false;
          if (settings?.accountId && row.accountId && row.accountId !== settings.accountId) {
            return false;
          }

          return sameId(row.schoolId, schoolId) && sameId(row.branchId, branchId);
        }) || null;

      const fallbackRow =
        exactAccountRow ||
        rows.find(
          (row: any) =>
            !row.isDeleted &&
            sameId(row.schoolId, schoolId) &&
            sameId(row.branchId, branchId)
        ) ||
        null;

      setBranchSettings(fallbackRow);
    } catch (error) {
      console.error("Failed to load branch theme settings:", error);
      setBranchSettings(null);
    } finally {
      setLoading(false);
    }
  }, [schoolId, branchId, settings?.accountId]);

  useEffect(() => {
    if (settingsLoading || branchLoading) return;
    refreshTheme();
  }, [settingsLoading, branchLoading, refreshTheme]);

  useEffect(() => {
    const handleThemeUpdate = () => refreshTheme();

    window.addEventListener("school-branch-settings-updated", handleThemeUpdate);
    window.addEventListener("storage", handleThemeUpdate);

    return () => {
      window.removeEventListener("school-branch-settings-updated", handleThemeUpdate);
      window.removeEventListener("storage", handleThemeUpdate);
    };
  }, [refreshTheme]);

  const effectiveTheme = useMemo(() => {
    const primaryColor =
      branchSettings?.primaryColor ||
      settings?.primaryColor ||
      "#2563eb";

    const fontFamily =
      branchSettings?.fontFamily ||
      settings?.fontFamily ||
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const fontSize = Number(
      branchSettings?.fontSize ||
        settings?.fontSize ||
        16
    );

    const mode = ((branchSettings?.theme || settings?.theme || "light") as ThemeMode);

    const logo =
      branchSettings?.logo ||
      activeBranch?.logo ||
      activeBranch?.photo ||
      activeSchool?.logo ||
      activeSchool?.photo ||
      settings?.logo ||
      settings?.schoolLogo ||
      undefined;

    return {
      primaryColor,
      fontFamily,
      fontSize,
      mode,
      logo,
    };
  }, [branchSettings, settings, activeBranch, activeSchool]);

  useEffect(() => {
    const primaryColor = effectiveTheme.primaryColor || "#2563eb";
    const fontFamily =
      effectiveTheme.fontFamily ||
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const fontSize = Number(effectiveTheme.fontSize || 16);
    const mode = effectiveTheme.mode || "light";

    const root = document.documentElement;

    root.setAttribute("data-theme", mode);

    setCssVariable("--primary-color", primaryColor);
    setCssVariable("--dashboard-primary", primaryColor);
    setCssVariable("--theme-primary", primaryColor);

    setCssVariable("--font-family", fontFamily);
    setCssVariable("--font-size", `${fontSize}px`);

    document.body.style.fontFamily = fontFamily;
    document.body.style.fontSize = `${fontSize}px`;

    if (mode === "dark") {
      const bg = darken(primaryColor, 0.24);
      const surface = darken(primaryColor, 0.31);
      const card = darken(primaryColor, 0.38);
      const soft = "rgba(255,255,255,.08)";
      const hover = "rgba(255,255,255,.11)";
      const border = "rgba(255,255,255,.16)";
      const text = getContrastTextColor(bg);

      setCssVariable("--bg", bg);
      setCssVariable("--surface", surface);
      setCssVariable("--card", card);
      setCssVariable("--text", text);
      setCssVariable("--muted", "rgba(255,255,255,.72)");
      setCssVariable("--border", border);

      setCssVariable("--shell-sidebar-bg", surface);
      setCssVariable("--shell-section-bg", soft);
      setCssVariable("--shell-hover-bg", hover);
      setCssVariable("--shell-menu-bg", card);
      setCssVariable("--shell-header-bg", "rgba(15,23,42,.72)");
      setCssVariable("--shell-shadow", "0 24px 70px rgba(0,0,0,.38)");

      setCssVariable("--input-bg", "rgba(255,255,255,.09)");
      setCssVariable("--input-text", "#ffffff");
      setCssVariable("--input-border", border);
    } else {
      const bg = "#f8fafc";
      const surface = "#ffffff";
      const soft = lighten(primaryColor, 0.94);
      const hover = lighten(primaryColor, 0.88);
      const border = "rgba(148,163,184,.22)";

      setCssVariable("--bg", bg);
      setCssVariable("--surface", surface);
      setCssVariable("--card", "#ffffff");
      setCssVariable("--text", "#0f172a");
      setCssVariable("--muted", "#64748b");
      setCssVariable("--border", border);

      setCssVariable("--shell-sidebar-bg", "#ffffff");
      setCssVariable("--shell-section-bg", soft);
      setCssVariable("--shell-hover-bg", hover);
      setCssVariable("--shell-menu-bg", "#ffffff");
      setCssVariable(
        "--shell-header-bg",
        "color-mix(in srgb, var(--bg, #f8fafc) 93%, white)"
      );
      setCssVariable("--shell-shadow", "0 24px 70px rgba(15,23,42,.22)");

      setCssVariable("--input-bg", "#ffffff");
      setCssVariable("--input-text", "#0f172a");
      setCssVariable("--input-border", border);
    }

    setFavicon(effectiveTheme.logo);
  }, [effectiveTheme]);

  const value = useMemo<ThemeState>(
    () => ({
      loading,
      mode: effectiveTheme.mode,
      primaryColor: effectiveTheme.primaryColor,
      fontFamily: effectiveTheme.fontFamily,
      fontSize: effectiveTheme.fontSize,
      logo: effectiveTheme.logo,
      branchSettings,
      refreshTheme,
    }),
    [loading, effectiveTheme, branchSettings, refreshTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ======================================================
// HOOK
// ======================================================

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    return {
      loading: false,
      mode: "light" as ThemeMode,
      primaryColor: "#2563eb",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 16,
      logo: undefined,
      branchSettings: null,
      refreshTheme: async () => {},
    };
  }

  return context;
}
