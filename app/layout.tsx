"use client";

/**
 * app/layout.tsx
 * ---------------------------------------------------------
 * ROOT PROVIDER + THEME ENGINE
 * ---------------------------------------------------------
 *
 * Provider order matters:
 * SettingsProvider loads branding/theme/default academic settings.
 * ActiveBranchProvider then controls the active campus/branch.
 */

import { useEffect } from "react";
import { SettingsProvider, useSettings } from "./context/settings-context";
import { ActiveBranchProvider } from "./context/active-branch-context";

// ======================================================
// COLOR UTILITY
// ======================================================

function darken(hex: string, factor: number) {
  let col = hex.replace("#", "");

  if (col.length === 3) {
    col = col
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(col, 16);

  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);

  return `rgb(${r}, ${g}, ${b})`;
}

// ======================================================
// THEME ENGINE
// ======================================================

function updateMetaThemeColor(color: string) {
  //for my app header color on mobile browsers
  let meta = document.querySelector("meta[name='theme-color']");

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", color);
}

function applyTheme(settings: any) {
  const root = document.documentElement;

  const primary = settings?.primaryColor || "#2f6fed";
  const isDark = settings?.theme === "dark";

  root.style.setProperty("--primary-color", primary);

  const darkBg = darken(primary, 0.25);
  const darkerBg = darken(primary, 0.15);

  updateMetaThemeColor(isDark ? darkBg : primary);

  if (isDark) {
    root.style.setProperty("--bg", darkBg);
    root.style.setProperty("--surface", darkerBg);
    root.style.setProperty("--text", "#ffffff");
    root.style.setProperty("--border", "rgba(255,255,255,0.14)");
    root.style.setProperty("--card-bg", darkerBg);
  } else {
    root.style.setProperty("--bg", "#f7f8fb");
    root.style.setProperty("--surface", "#ffffff");
    root.style.setProperty("--text", "#111111");
    root.style.setProperty("--border", "rgba(0,0,0,0.10)");
    root.style.setProperty("--card-bg", "#ffffff");
  }

  if (settings?.fontFamily) {
    root.style.setProperty("--font-family", settings.fontFamily);
  }

  const fontSize =
    typeof settings?.fontSize === "number"
      ? `${settings.fontSize}px`
      : settings?.fontSize === "large"
      ? "18px"
      : settings?.fontSize === "small"
      ? "12px"
      : "14px";

  root.style.fontSize = fontSize;

  if (settings?.schoolName) {
    document.title = `${settings.schoolName} - Assessment System`;
  }


  
}

// ======================================================
// WRAPPER
// ======================================================

function AppWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings);
  }, [settings]);

  return <>{children}</>;
}

// ======================================================
// ROOT LAYOUT
// ======================================================

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Eleeveon School Management</title>

        <meta
          name="description"
          content="Offline-first school management system"
        />

        <meta name="theme-color" content="#2f6fed" />
        <meta name="background-color" content="#f7f8fb" />

        <link rel="manifest" href="/manifest.json" />
      </head>

      <body
        style={{
          margin: 0,
          background: "var(--bg)",
          color: "var(--text)",
          fontFamily: "var(--font-family, system-ui)",
          transition: "background 0.3s ease, color 0.3s ease",
        }}
      >
        <SettingsProvider>
          <ActiveBranchProvider>
            <AppWrapper>{children}</AppWrapper>
          </ActiveBranchProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}