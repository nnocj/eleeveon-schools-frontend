"use client";

/**
 * app/layout.tsx
 * ---------------------------------------------------------
 * ROOT PROVIDER TREE
 * ---------------------------------------------------------
 *
 * Provider order matters:
 * 1. AccountProvider gives authenticated account/user context.
 * 2. SettingsProvider loads global/default branding settings.
 * 3. ActiveBranchProvider controls active school/branch context.
 * 4. ThemeProvider applies global + branch-specific theme settings.
 * 5. ActiveMembershipProvider handles selected role membership context.
 * 6. SyncBootstrapProvider handles first sync state.
 *
 * Theme logic is intentionally NOT kept here anymore.
 * It now lives in:
 * app/context/theme-context.tsx
 *
 * Dynamic browser branding:
 * - Static <head> values remain safe defaults for first paint, PWA install,
 *   crawlers and unauthenticated screens.
 * - GlobalBrandingRuntime is mounted inside the provider tree and becomes the
 *   runtime source of truth for document title, favicon, Apple icon and
 *   theme-color after account/workspace/school context is available.
 * - School-facing roles see their school name/logo in the browser.
 * - Developer/platform roles keep the default Eleeveon title/logo.
 * - Branchsettings does not apply favicon/title side effects.
 */

import React, { useEffect } from "react";

import { AccountProvider } from "./context/account-context";
import { SettingsProvider } from "./context/settings-context";
import { ActiveBranchProvider } from "./context/active-branch-context";
import { ThemeProvider } from "./context/theme-context";
import { ActiveMembershipProvider } from "./context/active-membership-context";
import { SyncBootstrapProvider } from "./context/sync-bootstrap-context";

import SyncBootstrap from "./components/SyncBootstrap";
import GlobalBrandingRuntime from "./components/GlobalBrandingRuntime";

import { startAutoSync } from "./lib/sync/syncEngine";

// ======================================================
// APP RUNTIME
// ======================================================

function AppRuntime({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stopAutoSync = startAutoSync(60_000);

    return () => {
      stopAutoSync();
    };
  }, []);

  return (
    <>
      <GlobalBrandingRuntime />
      {children}
    </>
  );
}

// ======================================================
// ROOT LAYOUT
// ======================================================

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Runtime title is handled by GlobalBrandingRuntime after context loads. */}
        <title>Eleeveon School Management</title>

        <meta
          name="description"
          content="Offline-first school management system"
        />

        <meta name="theme-color" content="#2f6fed" />
        <meta name="background-color" content="#f7f8fb" />

        <link rel="icon" href="/favicon.ico" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>

      <body
        style={{
          margin: 0,
          background: "var(--bg, #f7f8fb)",
          color: "var(--text, #111111)",
          fontFamily:
            "var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
          fontSize: "var(--font-size, 16px)",
          transition: "background 0.3s ease, color 0.3s ease",
        }}
      >
        <AccountProvider>
          <SettingsProvider>
            <ActiveBranchProvider>
              <ThemeProvider>
                <ActiveMembershipProvider>
                  <SyncBootstrapProvider>
                    <AppRuntime>
                      <SyncBootstrap />
                      {children}
                    </AppRuntime>
                  </SyncBootstrapProvider>
                </ActiveMembershipProvider>
              </ThemeProvider>
            </ActiveBranchProvider>
          </SettingsProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
