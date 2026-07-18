"use client";

/**
 * app/providers.tsx
 * --------------------------------------------------------------------------
 * Global provider order with role-aware appearance readiness.
 *
 * Important dependency note:
 * ActiveBranchProvider currently consumes SettingsContext, so SettingsProvider
 * must remain outside ActiveBranchProvider until that older dependency is
 * removed. PortalAppearanceRuntime explicitly hydrates Settings from the active
 * membership, giving the desired role-aware behavior without a provider cycle.
 * LocalAppearanceRuntime then layers the exact historical LocalSettings
 * light/dark palette plus device-only density, motion and text-size preferences
 * over the resolved shared branding.
 */

import type {
  ReactNode,
} from "react";

import AppUpdateManager from "./components/AppUpdateManager";
import DatabaseBootstrap from "./components/DatabaseBootstrap";
import PortalAppearanceRuntime from "./components/PortalAppearanceRuntime";
import LocalAppearanceRuntime from "./components/LocalAppearanceRuntime";
import SyncBootstrap from "./components/SyncBootstrap";

import {
  AccountProvider,
} from "./context/account-context";

import {
  ActiveBranchProvider,
} from "./context/active-branch-context";

import {
  ActiveMembershipProvider,
} from "./context/active-membership-context";

import {
  RealtimeProvider,
} from "./context/realtime-context";

import {
  SettingsProvider,
} from "./context/settings-context";

import {
  SyncBootstrapProvider,
} from "./context/sync-bootstrap-context";

import {
  SyncProvider,
} from "./context/sync-context";

import {
  ThemeProvider,
} from "./context/theme-context";

import {
  useDatabase,
} from "./context/database-context";

function DatabaseReadyRuntime() {
  const database = useDatabase();

  if (!database.ready) {
    return null;
  }

  return (
    <>
      <AppUpdateManager />
      <SyncBootstrap />
    </>
  );
}

export default function Providers({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DatabaseBootstrap>
      <AccountProvider>
        <SettingsProvider>
          <ActiveBranchProvider>
            <ActiveMembershipProvider>
              <ThemeProvider>
                <PortalAppearanceRuntime>
                  <LocalAppearanceRuntime>
                    <RealtimeProvider>
                    <SyncBootstrapProvider>
                      <SyncProvider>
                        <DatabaseReadyRuntime />
                        {children}
                      </SyncProvider>
                    </SyncBootstrapProvider>
                    </RealtimeProvider>
                  </LocalAppearanceRuntime>
                </PortalAppearanceRuntime>
              </ThemeProvider>
            </ActiveMembershipProvider>
          </ActiveBranchProvider>
        </SettingsProvider>
      </AccountProvider>
    </DatabaseBootstrap>
  );
}