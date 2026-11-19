"use client";

import type {
  ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { APP_DB_NAME } from "./lib/db/db-version";

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

import IndependentRuntimeShell from './components/independent/IndependentRuntimeShell';

export default function Providers({children}:{children: ReactNode}) {
  const pathname=usePathname();
  const independent=Boolean(pathname?.startsWith("/independent/workspace"));
  const dbMismatch=APP_DB_NAME !== (independent ? (() => { const selector = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("license") : null; if(!selector)return "EleeveonIndependentDB";try{const old=localStorage.getItem('eleeveon_independent_browser_license_v1');if(old){const payload=JSON.parse(JSON.parse(old).envelope.payload);if(String(payload.licenseId||payload.id)===selector)return "EleeveonIndependentDB";}}catch{}return `EleeveonIndependentDB_${selector}`; })() : "EleeveonDB");
  useEffect(()=>{if(dbMismatch)window.location.reload();},[dbMismatch]);
  if(dbMismatch)return <main className="p-6">Switching school workspace…</main>;
  if (independent) return <IndependentRuntimeShell>{children}</IndependentRuntimeShell>;
  return <CloudProviders>{children}</CloudProviders>;
}
