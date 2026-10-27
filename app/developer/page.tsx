
"use client";

/**
 * app/developer/page.tsx
 * Developer Portal — EXACT Branch Admin V7 shell layout.
 * The six MAIN destinations are horizontal workspace tabs on desktop and
 * the single-row selector / optional card grid on mobile.
 * No Developer Dashboard/Home. Grouped platform modules remain available as
 * contextual subtabs. All original module imports and legacy route keys stay.
 *
 * The critical shared-shell switch is:
 *   navigationMode="branch-workspace"
 * The shared shell owns the header, online status, Hub, account avatar,
 * Add / Filter / Print / More toolbar and main mobile cards.
 * No school or branch is required because this portal is platform-scoped.
 *
 * Self-contained: does not require installing a WorkspaceSubtabs helper.
 */
import React from "react";
import RolePortalShell, { type RoleNavSection } from "../components/role-portals/RolePortalShell";
import type { AppRole } from "../lib/auth/roleRedirect";

import DeveloperPlans from "./modules/DeveloperPlans";
import DeveloperSubscriptions from "./modules/DeveloperSubscriptions";
import DeveloperAccounts from "./modules/DeveloperAccounts";
import DeveloperInvoices from "./modules/DeveloperInvoices";
import DeveloperPayments from "./modules/DeveloperPayments";
import DeveloperSystemHealth from "./modules/DeveloperSystemHealth";
import DeveloperSettings from "./modules/DeveloperSettings";
import DeveloperTeam from "./modules/DeveloperTeam";
import DeveloperFeatureFlags from "./modules/DeveloperFeatureFlags";
import DeveloperBackups from "./modules/DeveloperBackups";
import DeveloperIntegrations from "./modules/DeveloperIntegrations";
import DeveloperErrorReports from "./modules/DeveloperErrorReports";
import DeveloperReleases from "./modules/DeveloperReleases";
import DeveloperDatabaseTools from "./modules/DeveloperDatabaseTools";
import DeveloperDatabaseStudio from "./modules/DeveloperDatabaseStudio";
import DeveloperDatabaseDesigner from "./modules/DeveloperDatabaseDesigner";
import DeveloperSqlConsole from "./modules/DeveloperSqlConsole";

type RouteProps = { navigate: (key: string) => void };

// Reuse the exact compact contextual-subtab classes/spacing used by Branch
// Admin's Finance/Reports workspaces. The MAIN nav still comes from
// BranchWorkspaceNavigation through RolePortalShell.
type Subtab<K extends string> = { key: K; label: string };
function DeveloperSubtabs<K extends string>({
  label, value, onChange, tabs,
}: {
  label: string;
  value: K;
  onChange: (key: K) => void;
  tabs: readonly Subtab<K>[];
}) {
  return (
    <div className="ba-workspace-wrapper ba-finance-workspace ed-dev-subtabs">
      <style>{developerSubtabStyles}</style>
      <div className="ba-contextual-actions ba-finance-subtabs" aria-label={label}>
        <div className="ba-finance-subtab-list" role="group" aria-label={label}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={tab.key === value}
              className={tab.key === value ? "is-active" : ""}
              onClick={() => {
                if (tab.key === value) return;
                onChange(tab.key);
                const pane = document.querySelector<HTMLElement>(
                  ".role-shell.workspace-locked-scroll .app-content",
                );
                if (pane) pane.scrollTop = 0;
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const developerSubtabStyles = `
.ed-dev-subtabs { width:100%;max-width:none;min-width:0;margin:0;padding:0; }
.ed-dev-subtabs .ba-finance-subtabs {
 display:flex;align-items:center;width:100%;min-width:0;margin:0 0 8px;
 padding:4px 0 5px;position:sticky;top:0;z-index:22;
 background:var(--eds-shell-bg,var(--bg,var(--surface,#fff)));
 border-bottom:1px solid var(--border,rgba(15,23,42,.10));
 backdrop-filter:blur(12px);
}
.ed-dev-subtabs .ba-finance-subtab-list {
 display:flex;align-items:center;gap:4px;min-width:0;width:100%;
 overflow-x:auto;white-space:nowrap;scrollbar-width:thin;
}
.ed-dev-subtabs .ba-finance-subtab-list button {
 flex:0 0 auto;min-height:31px;border:1px solid transparent;
 border-radius:7px;padding:4px 11px;background:transparent;
 color:var(--text,#172033);font:inherit;font-size:11px;font-weight:700;
 cursor:pointer;
}
.ed-dev-subtabs .ba-finance-subtab-list button.is-active {
 background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff));
 border-color:color-mix(in srgb,var(--primary-color,#2563eb) 25%,var(--border,#d4dae3));
}
.ed-dev-subtabs button:focus-visible {
 outline:2px solid var(--primary-color,#2563eb);outline-offset:2px;
}
@media print {.ed-dev-subtabs .ba-finance-subtabs {display:none!important;}}
`;

type SaasView = "plans" | "subscriptions" | "accounts" | "featureFlags";
type BillingView = "invoices" | "payments";
type HealthView = "systemHealth" | "errorReports" | "databaseTools";
type ToolsView = "databaseStudio" | "databaseDesigner" | "sqlConsole" | "backups" | "integrations" | "releases";

function SaasWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<SaasView>("plans");
  const Current: React.ComponentType<any> =
    view === "subscriptions" ? DeveloperSubscriptions :
    view === "accounts" ? DeveloperAccounts :
    view === "featureFlags" ? DeveloperFeatureFlags : DeveloperPlans;
  return (
    <div className="eds-platform-workspace">
      <DeveloperSubtabs<SaasView> value={view} onChange={setView} label="SaaS control" tabs={[
        { key: "plans", label: "Plans & Packages" },
        { key: "subscriptions", label: "Active Subscriptions" },
        { key: "accounts", label: "Customer Accounts" },
        { key: "featureFlags", label: "Feature Flags" },
      ]} />
      <Current {...props} />
    </div>
  );
}

function BillingWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<BillingView>("invoices");
  const Current: React.ComponentType<any> = view === "payments" ? DeveloperPayments : DeveloperInvoices;
  return (
    <div className="eds-platform-workspace">
      <DeveloperSubtabs<BillingView> value={view} onChange={setView} label="Platform billing" tabs={[
        { key: "invoices", label: "Invoices" }, { key: "payments", label: "Payments" },
      ]} />
      <Current {...props} />
    </div>
  );
}

function HealthWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<HealthView>("systemHealth");
  const Current: React.ComponentType<any> =
    view === "errorReports" ? DeveloperErrorReports :
    view === "databaseTools" ? DeveloperDatabaseTools : DeveloperSystemHealth;
  return (
    <div className="eds-platform-workspace">
      <DeveloperSubtabs<HealthView> value={view} onChange={setView} label="Platform diagnostics" tabs={[
        { key: "systemHealth", label: "System Health" },
        { key: "errorReports", label: "Error Reports" },
        { key: "databaseTools", label: "Database Health" },
      ]} />
      <Current {...props} />
    </div>
  );
}

function DeveloperToolsWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<ToolsView>("databaseStudio");
  const Current: React.ComponentType<any> =
    view === "databaseDesigner" ? DeveloperDatabaseDesigner :
    view === "sqlConsole" ? DeveloperSqlConsole :
    view === "backups" ? DeveloperBackups :
    view === "integrations" ? DeveloperIntegrations :
    view === "releases" ? DeveloperReleases : DeveloperDatabaseStudio;
  return (
    <div className="eds-platform-workspace">
      <DeveloperSubtabs<ToolsView> value={view} onChange={setView} label="Developer tools" tabs={[
        { key: "databaseStudio", label: "Database Studio" },
        { key: "databaseDesigner", label: "Database Designer" },
        { key: "sqlConsole", label: "Safe SQL Console" },
        { key: "backups", label: "Backup & Restore" },
        { key: "integrations", label: "API & Integrations" },
        { key: "releases", label: "Release Manager" },
      ]} />
      <Current {...props} />
    </div>
  );
}

export const NAV_SECTIONS: RoleNavSection[] = [{
  title: "Workspaces", defaultOpen: true,
  items: [
    { key: "saasWorkspace", label: "SaaS Control", icon: "📦" },
    { key: "developerTeam", label: "Platform Team", icon: "👥" },
    { key: "billingWorkspace", label: "Billing", icon: "💳" },
    { key: "healthWorkspace", label: "Diagnostics", icon: "🩺" },
    { key: "developerToolsWorkspace", label: "Developer Tools", icon: "🛠️" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ],
}];

const ROUTES: Record<string, React.ComponentType<any>> = {
  saasWorkspace: SaasWorkspace,
  developerTeam: DeveloperTeam,
  billingWorkspace: BillingWorkspace,
  healthWorkspace: HealthWorkspace,
  developerToolsWorkspace: DeveloperToolsWorkspace,
  settings: DeveloperSettings,

  // Preserve legacy navigate("...") calls inside existing developer modules.
  plans: DeveloperPlans,
  subscriptions: DeveloperSubscriptions,
  accounts: DeveloperAccounts,
  featureFlags: DeveloperFeatureFlags,
  invoices: DeveloperInvoices,
  payments: DeveloperPayments,
  systemHealth: DeveloperSystemHealth,
  errorReports: DeveloperErrorReports,
  databaseTools: DeveloperDatabaseTools,
  databaseStudio: DeveloperDatabaseStudio,
  databaseDesigner: DeveloperDatabaseDesigner,
  sqlConsole: DeveloperSqlConsole,
  backups: DeveloperBackups,
  integrations: DeveloperIntegrations,
  releases: DeveloperReleases,
};

export default function DeveloperPage() {
  return (
    <RolePortalShell
      portalTitle="Developer Portal"
      portalSubtitle="Platform operations, customers, billing and technical tools"
      homeKey="saasWorkspace"
      allowedRoles={["developer", "platform_team"] as AppRole[]}
      navSections={NAV_SECTIONS}
      navigationMode="branch-workspace"
      routes={ROUTES}
      lockedContext={false}
      requireSchool={false}
      requireBranch={false}
    />
  );
}
