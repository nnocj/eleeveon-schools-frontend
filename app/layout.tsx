/**
 * app/layout.tsx
 * --------------------------------------------------------------------------
 * Eleeveon Schools root layout.
 *
 * Global application infrastructure is centralized in app/providers.tsx:
 * - DatabaseBootstrap and the single Dexie instance;
 * - account, settings, school/branch and membership contexts;
 * - theme runtime;
 * - Phase 5 single-flight SyncBootstrap.
 *
 * Do not start auto-sync or mount duplicate providers in this file.
 */

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import Providers from "./providers";
import GlobalBrandingRuntime from "./components/GlobalBrandingRuntime";

export const metadata: Metadata = {
  title: "Eleeveon School Management",
  description: "Offline-first school management system",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f6fed",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "var(--bg, #f7f8fb)",
          color: "var(--text, #111111)",
          fontFamily:
            "var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
          fontSize: "var(--font-size, 16px)",
          transition: "background .3s ease, color .3s ease",
        }}
      >
        <Providers>
          <GlobalBrandingRuntime />
          {children}
        </Providers>
      </body>
    </html>
  );
}