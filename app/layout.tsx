"use client";

import { useEffect } from "react";
import { SettingsProvider, useSettings } from "./context/settings-context";

// ================= THEME ENGINE =================
function applyTheme(settings: any) {
  const root = document.documentElement;

  const primary = settings?.primaryColor || "#2f6fed";
  const isDark = settings?.theme === "dark";

  // ================= BRAND COLORS =================
  root.style.setProperty("--primary-color", primary);

  // create dark version of brand color (used for backgrounds)
  const darkBg = darken(primary, 0.25);
  const darkerBg = darken(primary, 0.15);

  // ================= BACKGROUND SYSTEM =================
  if (isDark) {
    root.style.setProperty("--bg", darkBg);
    root.style.setProperty("--surface", darkerBg);
    root.style.setProperty("--text", "#ffffff");
  } else {
    root.style.setProperty("--bg", "#f7f8fb");
    root.style.setProperty("--surface", "#ffffff");
    root.style.setProperty("--text", "#111111");
  }

  // ================= FONT SIZE =================
  const fontSize =
    settings?.fontSize === "large"
      ? "18px"
      : settings?.fontSize === "small"
      ? "12px"
      : "14px";

  root.style.fontSize = fontSize;

  // ================= TITLE =================
  if (settings?.schoolName) {
    document.title = `${settings.schoolName} - Assessment System`;
  }
}

// ================= COLOR UTILITY =================
function darken(hex: string, factor: number) {
  let col = hex.replace("#", "");

  if (col.length === 3) {
    col = col.split("").map((c) => c + c).join("");
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

// ================= WRAPPER =================
function AppWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings);
  }, [settings]);

  return <>{children}</>;
}

// ================= ROOT LAYOUT =================
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "var(--bg)",
          color: "var(--text)",
          transition: "all 0.3s ease",
        }}
      >
        <SettingsProvider>
          <AppWrapper>{children}</AppWrapper>
        </SettingsProvider>
      </body>
    </html>
  );
}