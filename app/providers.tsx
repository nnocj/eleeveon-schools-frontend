"use client";

import type {
  ReactNode,
} from "react";

import AppUpdateManager from "./components/AppUpdateManager";
import DatabaseBootstrap from "./components/DatabaseBootstrap";
import LocalAppearanceRuntime from "./components/LocalAppearanceRuntime";
import PortalAppearanceRuntime from "./components/PortalAppearanceRuntime";
import SyncBootstrap from "./components/SyncBootstrap";
import WindowChromeRuntime from "./components/window/WindowChromeRuntime";
import WindowTitleBar from "./components/window/WindowTitleBar";

import {
  SubscriptionBootstrap,
} from "./components/subscription/SubscriptionBootstrap";

import {
  AccountProvider,
  useAccount,
} from "./context/account-context";

import {
  ActiveBranchProvider,
} from "./context/active-branch-context";

import {
  ActiveMembershipProvider,
  useActiveMembership,
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

import {
  WindowChromeProvider,
} from "./context/window-chrome-context";

function SubscriptionAccessRuntime({
  children,
}: {
  children: ReactNode;
}) {
  const accountContext =
    useAccount();

  const membershipContext =
    useActiveMembership();

  const accountId =
    accountContext.account?.id ??
    accountContext.accountId ??
    membershipContext
      .activeMembership
      ?.accountId ??
    null;

  const authenticated =
    Boolean(
      accountId &&
      membershipContext
        .activeMembership,
    );

  return (
    <SubscriptionBootstrap
      accountId={accountId}
      authenticated={authenticated}
    >
      {children}
    </SubscriptionBootstrap>
  );
}

function DatabaseReadyRuntime() {
  const database =
    useDatabase();

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

function CloudProviders({
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
              <WindowChromeProvider>
                <SubscriptionAccessRuntime>
                  <ThemeProvider>
                    <PortalAppearanceRuntime>
                      <LocalAppearanceRuntime>
                        <WindowChromeRuntime />
                        <WindowTitleBar />

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
                </SubscriptionAccessRuntime>
              </WindowChromeProvider>
            </ActiveMembershipProvider>
          </ActiveBranchProvider>
        </SettingsProvider>
      </AccountProvider>
    </DatabaseBootstrap>
  );
}


// Independent builds never mount Cloud AccountProvider, SubscriptionBootstrap,
// RealtimeProvider, SyncBootstrap, or the cloud update manager.
import { IS_INDEPENDENT_RUNTIME } from './lib/independent/runtimeMode';
import IndependentRuntimeShell from './components/independent/IndependentRuntimeShell';

export default function Providers({children}:{children: ReactNode}) {
  if (IS_INDEPENDENT_RUNTIME) return <IndependentRuntimeShell>{children}</IndependentRuntimeShell>;
  return <CloudProviders>{children}</CloudProviders>;
}
