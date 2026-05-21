"use client";

/**
 * app/account/page.tsx
 * ---------------------------------------------------------
 * SECURE ACCOUNT SETUP CENTER
 * ---------------------------------------------------------
 *
 * Rules:
 * - User must be signed in.
 * - accountId is required.
 * - School/branch are NOT required here yet.
 * - This page is for creating/managing schools, branches,
 *   account users, billing, profile, backup, and account settings.
 * - Uses a WhatsApp-like setup center instead of a dashboard sidebar.
 * - Mobile-first and safe for small screens.
 * - No horizontal page scrollbar: every tab is contained inside the shell.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useSyncBootstrap } from "../context/sync-bootstrap-context";
import SyncStatusStrip from "../components/SyncStatusStrip";

import SchoolsPage from "./schools";
import BranchesPage from "./branches";
import BillingPage from "./billing";
import AccountUsersPage from "./accountUsers";
import OwnerProfilePage from "./ownerProfile";
import SyncBackupPage from "./syncBackup";
import AccountSettingsPage from "./accountSettings";

// ======================================================
// TYPES
// ======================================================

type AccountTool =
  | "home"
  | "schools"
  | "branches"
  | "billing"
  | "users"
  | "profile"
  | "sync"
  | "settings";

// ======================================================
// SETUP TOOLS
// ======================================================

const SETUP_TOOLS: {
  key: Exclude<AccountTool, "home">;
  title: string;
  description: string;
  icon: string;
  group: "Institution" | "Account" | "System";
  priority: "required" | "important" | "optional";
}[] = [
  {
    key: "schools",
    title: "Schools",
    description: "Create and manage school profiles under this account.",
    icon: "🏫",
    group: "Institution",
    priority: "required",
  },
  {
    key: "branches",
    title: "Branches",
    description: "Create campuses or branches after your school profile exists.",
    icon: "🏢",
    group: "Institution",
    priority: "required",
  },
  {
    key: "users",
    title: "Account Users",
    description: "Manage admins, staff, and users who can access this account.",
    icon: "👥",
    group: "Account",
    priority: "important",
  },
  {
    key: "profile",
    title: "Owner Profile",
    description: "Update account owner details and contact information.",
    icon: "👤",
    group: "Account",
    priority: "important",
  },
  {
    key: "billing",
    title: "Billing",
    description: "Manage subscription, invoices, and payment records.",
    icon: "💳",
    group: "Account",
    priority: "optional",
  },
  {
    key: "sync",
    title: "Sync & Backup",
    description: "Check offline sync, backup, and local device status.",
    icon: "☁️",
    group: "System",
    priority: "important",
  },
  {
    key: "settings",
    title: "Account Settings",
    description: "Control security, preferences, and account-level settings.",
    icon: "⚙️",
    group: "System",
    priority: "optional",
  },
];

const TOOL_LABELS: Record<AccountTool, string> = {
  home: "Account Setup",
  schools: "Schools",
  branches: "Branches",
  billing: "Billing",
  users: "Account Users",
  profile: "Owner Profile",
  sync: "Sync & Backup",
  settings: "Account Settings",
};

const TOOL_GROUPS: Record<AccountTool, string> = {
  home: "Setup Center",
  schools: "Institution",
  branches: "Institution",
  billing: "Account",
  users: "Account",
  profile: "Account",
  sync: "System",
  settings: "System",
};

const TOOL_COMPONENTS: Record<Exclude<AccountTool, "home">, React.ComponentType<any>> = {
  schools: SchoolsPage,
  branches: BranchesPage,
  billing: BillingPage,
  users: AccountUsersPage,
  profile: OwnerProfilePage,
  sync: SyncBackupPage,
  settings: AccountSettingsPage,
};

// ======================================================
// PAGE
// ======================================================

export default function AccountPage() {
  const router = useRouter();

  const {
    accountId,
    user,
    account,
    logout,
    loading: accountLoading,
    authenticated,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeBranch,
    activeSchoolId,
    activeBranchId,
    schools,
    allBranches,
    loading: branchContextLoading,
  } = useActiveBranch();

  const { initialSyncing, initialSyncDone } = useSyncBootstrap();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [activeTool, setActiveTool] = useState<AccountTool>("home");
  const [moreOpen, setMoreOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // ======================================================
  // AUTH GATE
  // ======================================================

  useEffect(() => {
    if (accountLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
    }
  }, [accountLoading, authenticated, accountId, router]);

  // ======================================================
  // BRANDING
  // ======================================================

  useEffect(() => {
    if (settings?.fontFamily) {
      document.documentElement.style.setProperty("--font-family", settings.fontFamily);
    }

    if (settings?.primaryColor) {
      document.documentElement.style.setProperty("--primary-color", settings.primaryColor);
    }
  }, [settings?.fontFamily, settings?.primaryColor]);

  // ======================================================
  // ONLINE STATUS
  // ======================================================

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);

    updateOnline();

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  // ======================================================
  // ACTIVE COMPONENT
  // ======================================================

  const ActiveComponent = useMemo(() => {
    if (activeTool === "home") return null;
    return TOOL_COMPONENTS[activeTool];
  }, [activeTool]);

  const activeLabel = TOOL_LABELS[activeTool];
  const activeGroup = TOOL_GROUPS[activeTool];

  const checking = accountLoading || settingsLoading || initialSyncing;
  const canOpenDashboard = !initialSyncing && !!activeSchoolId && !!activeBranchId;

  const openTool = (tool: AccountTool) => {
    setActiveTool(tool);
    setMoreOpen(false);
    setContextOpen(false);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goBackHome = () => {
    openTool("home");
  };

  //goDashboard does not open the context drawer while sync is still pulling data:
  const goDashboard = () => {
  if (initialSyncing) {
    setContextOpen(true);
    setMoreOpen(false);
    return;
  }

  if (canOpenDashboard) {
    router.push("/dashboard");
    return;
  }

  setContextOpen(true);
  setMoreOpen(false);
};

  // ======================================================
  // SAFE STATES
  // ======================================================

  if (checking) {
    return (
      <main style={safeStyles.centerPage}>
        <style>{css}</style>
        <section style={safeStyles.loadingCard}>
          <div style={safeStyles.spinner} />
          <h2 style={safeStyles.loadingTitle}>Opening account setup...</h2>
          <p style={safeStyles.mutedText}>Checking your signed-in account.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main style={safeStyles.centerPage}>
        <style>{css}</style>
        <section style={safeStyles.loadingCard}>
          <h2 style={safeStyles.loadingTitle}>Account locked</h2>
          <p style={safeStyles.mutedText}>Redirecting you to sign in...</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // RENDER
  // ======================================================

  return (
    <main
      style={
        {
          ...safeStyles.page,
          "--account-primary": primary,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>

      {contextOpen && (
        <button
          aria-label="Close account context"
          className="account-overlay"
          onClick={() => {
            setContextOpen(false);
            setMoreOpen(false);
          }}
        />
      )}

      <aside className={`account-context-drawer ${contextOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <div>
            <p>Account Context</p>
            <h2>Current Setup</h2>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={() => setContextOpen(false)}
            aria-label="Close context drawer"
          >
            ✕
          </button>
        </div>

        <section className="drawer-card big">
          <div className="drawer-avatar" style={{ background: primary }}>
            {account?.name?.[0] || user?.fullName?.[0] || user?.email?.[0] || "A"}
          </div>

          <div>
            <strong>{account?.name || "Account Workspace"}</strong>
            <span>{user?.email}</span>
          </div>
        </section>

        <section className="drawer-grid">
          <div>
            <strong>{schools?.length || 0}</strong>
            <span>Schools</span>
          </div>

          <div>
            <strong>{allBranches?.length || 0}</strong>
            <span>Branches</span>
          </div>
        </section>

        <section className="drawer-card">
          <label>Active School</label>
          <strong>{activeSchool?.name || "No active school yet"}</strong>
          <span>{activeSchoolId ? `School ID: ${activeSchoolId}` : "Create/select a school first"}</span>
        </section>

        <section className="drawer-card">
          <label>Active Branch</label>
          <strong>{activeBranch?.name || "No active branch yet"}</strong>
          <span>{activeBranchId ? `Branch ID: ${activeBranchId}` : "Create/select a branch first"}</span>
        </section>

        <button
          type="button"
          className="drawer-action"
          onClick={goDashboard}
          disabled={initialSyncing || !canOpenDashboard || branchContextLoading}
        >
          {initialSyncing
            ? "Syncing account data..."
            : canOpenDashboard
            ? "Open Dashboard"
            : "Create/select branch first"}
        </button>

        <button type="button" className="drawer-danger" onClick={logout}>
          Logout
        </button>
      </aside>

      <section className="account-shell">
        <header className="account-header">
          <button
            type="button"
            className="icon-btn primary"
            onClick={activeTool === "home" ? goDashboard : goBackHome}
            aria-label={activeTool === "home" ? "Open dashboard" : "Back to account setup"}
          >
            {activeTool === "home" ? "☰" : "‹"}
          </button>

          <div className="header-title">
            <strong>{activeLabel}</strong>
            <span>{activeGroup}</span>
          </div>

          <div className="more-wrap">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-label="More actions"
            >
              ⋮
            </button>

            {moreOpen && (
              <div className="more-menu">
                {activeTool !== "home" && (
                  <button type="button" onClick={goBackHome}>
                    Setup center
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setContextOpen(true);
                    setMoreOpen(false);
                  }}
                >
                  Account context
                </button>

                <button type="button" onClick={goDashboard}>
                  Open dashboard
                </button>

                <button type="button" onClick={() => openTool("settings")}>
                  Account settings
                </button>

                <button type="button" className="danger" onClick={logout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <section className="account-main">
          {activeTool === "home" ? (
            <>
              <section className="account-hero">
                <div className="hero-left">
                  <div className="hero-avatar" style={{ background: primary }}>
                    {account?.name?.[0] || user?.fullName?.[0] || user?.email?.[0] || "A"}
                  </div>

                  <div>
                    <p>Signed in account</p>
                    <h1>{account?.name || "Account Setup"}</h1>
                    <span>{user?.email}</span>
                  </div>
                </div>

                <div className="hero-status">
                  <span className={isOnline ? "online" : "offline"}>
                    ● {isOnline ? "Online" : "Offline"}
                  </span>
                  <span>🔐 Signed in</span>
                </div>
                
              </section>
              <section style={{ marginBottom: 10 }}>
                <SyncStatusStrip />
              </section>

              <section className="setup-summary">
                <button type="button" onClick={() => openTool("schools")}>
                  <strong>{schools?.length || 0}</strong>
                  <span>Schools</span>
                </button>

                <button type="button" onClick={() => openTool("branches")}>
                  <strong>{allBranches?.length || 0}</strong>
                  <span>Branches</span>
                </button>

                <button type="button" onClick={goDashboard}>
                  <strong>{canOpenDashboard ? "Ready" : "Setup"}</strong>
                  <span>Dashboard</span>
                </button>
              </section>

              <section className="current-context-card">
                <div>
                  <p>Current workspace</p>
                  <strong>{activeSchool?.name || "No school selected yet"}</strong>
                  <span>{activeBranch?.name || "No branch selected yet"}</span>
                </div>

                <button type="button" onClick={() => setContextOpen(true)}>
                  View
                </button>
              </section>

              <section className="tool-groups">
                {(["Institution", "Account", "System"] as const).map((group) => {
                  const groupTools = SETUP_TOOLS.filter((tool) => tool.group === group);

                  return (
                    <div key={group} className="tool-group">
                      <h2>{group}</h2>

                      <div className="tool-grid">
                        {groupTools.map((tool) => (
                          <button
                            key={tool.key}
                            type="button"
                            className="tool-card"
                            onClick={() => openTool(tool.key)}
                          >
                            <span className="tool-icon">{tool.icon}</span>

                            <span className="tool-copy">
                              <strong>{tool.title}</strong>
                              <small>{tool.description}</small>
                            </span>

                            <span className={`tool-badge ${tool.priority}`}>
                              {tool.priority}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            </>
          ) : (
            <section className="tool-panel">
              <div className="panel-head">
                <button type="button" className="back-pill" onClick={goBackHome}>
                  ← Setup Center
                </button>

                <div>
                  <p>{activeGroup}</p>
                  <h1>{activeLabel}</h1>
                </div>
              </div>

              <div className="panel-body">
                <div className="panel-body-inner">{ActiveComponent && <ActiveComponent />}</div>
              </div>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}

// ======================================================
// SAFE STYLES
// ======================================================

const safeStyles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    width: "100%",
    maxWidth: "100vw",
    minWidth: 0,
    overflowX: "hidden",
    background: "var(--bg, #f8fafc)",
    color: "var(--text, #0f172a)",
    fontFamily: "var(--font-family, system-ui)",
  },

  centerPage: {
    minHeight: "100dvh",
    width: "100%",
    maxWidth: "100vw",
    minWidth: 0,
    overflowX: "hidden",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "var(--bg, #f8fafc)",
    color: "var(--text, #0f172a)",
    fontFamily: "var(--font-family, system-ui)",
  },

  loadingCard: {
    width: "min(430px, 100%)",
    maxWidth: "100%",
    borderRadius: 26,
    padding: 24,
    background: "var(--card, #ffffff)",
    border: "1px solid rgba(148,163,184,0.25)",
    boxShadow: "0 24px 60px rgba(15,23,42,0.10)",
    textAlign: "center",
    overflow: "hidden",
  },

  loadingTitle: {
    margin: "12px 0 6px",
    fontSize: 20,
    fontWeight: 950,
  },

  mutedText: {
    margin: 0,
    color: "var(--muted, #64748b)",
    fontSize: 14,
    lineHeight: 1.6,
  },

  spinner: {
    width: 36,
    height: 36,
    margin: "0 auto",
    borderRadius: "50%",
    border: "4px solid rgba(37,99,235,0.18)",
    borderTopColor: "var(--account-primary, #2563eb)",
    animation: "spin 0.8s linear infinite",
  },
};

const css = `
@keyframes spin {
  to { transform: rotate(360deg); }
}

html,
body {
  max-width: 100%;
  overflow-x: hidden;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

.account-shell {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

.account-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  border: 0;
  background: rgba(15,23,42,.5);
}

.account-header {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: 48px;
  max-width: 100%;
  padding: 5px 8px;
  background: color-mix(in srgb, var(--bg, #f8fafc) 93%, white);
  border-bottom: 1px solid rgba(148,163,184,.18);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: visible;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(148,163,184,.25);
  border-radius: 14px;
  background: #fff;
  color: #0f172a;
  font-size: 19px;
  font-weight: 950;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.icon-btn.primary {
  background: var(--account-primary);
  color: #fff;
  border-color: transparent;
}

.header-title {
  min-width: 0;
  flex: 1;
}

.header-title strong,
.header-title span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-title strong {
  font-size: 14px;
  font-weight: 950;
  line-height: 1.1;
}

.header-title span {
  margin-top: 1px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.1;
}

.more-wrap {
  position: relative;
  flex: 0 0 auto;
}

.more-menu {
  position: absolute;
  top: 42px;
  right: 0;
  width: min(230px, calc(100vw - 18px));
  border-radius: 18px;
  padding: 8px;
  background: #fff;
  border: 1px solid rgba(148,163,184,.22);
  box-shadow: 0 24px 60px rgba(15,23,42,.18);
  display: grid;
  gap: 4px;
  z-index: 60;
  overflow: hidden;
}

.more-menu button {
  min-height: 40px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  text-align: left;
  padding: 0 12px;
  font-weight: 850;
  cursor: pointer;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-menu button:hover {
  background: #f1f5f9;
}

.more-menu .danger {
  color: #dc2626;
}

.account-main {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  flex: 1 1 auto;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  overflow-x: hidden;
}

.account-main *,
.account-main *::before,
.account-main *::after {
  box-sizing: border-box;
  max-width: 100%;
}

.account-main button,
.account-main input,
.account-main select,
.account-main textarea {
  font: inherit;
  max-width: 100%;
}

.account-main img,
.account-main svg,
.account-main canvas,
.account-main video {
  max-width: 100%;
  height: auto;
}

.account-main table {
  max-width: 100%;
}

.account-hero {
  min-width: 0;
  max-width: 100%;
  border-radius: 24px;
  padding: 14px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--account-primary) 20%, transparent), transparent 36%),
    #fff;
  border: 1px solid rgba(148,163,184,.2);
  box-shadow: 0 12px 34px rgba(15,23,42,.07);
  display: grid;
  gap: 14px;
  overflow: hidden;
}

.hero-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.hero-avatar,
.drawer-avatar {
  width: 46px;
  height: 46px;
  border-radius: 18px;
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 950;
  flex: 0 0 auto;
}

.hero-left div:last-child {
  min-width: 0;
}

.account-hero p,
.panel-head p,
.drawer-head p,
.current-context-card p {
  margin: 0;
  color: var(--account-primary);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.account-hero h1 {
  margin: 2px 0 0;
  font-size: clamp(22px, 7vw, 36px);
  line-height: 1.04;
  letter-spacing: -.04em;
  overflow-wrap: anywhere;
}

.account-hero span,
.current-context-card span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-status {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-status span {
  margin: 0;
  border-radius: 999px;
  padding: 8px 10px;
  background: #f1f5f9;
  color: #334155;
  font-size: 12px;
  font-weight: 900;
}

.hero-status .online {
  color: #16a34a;
  background: rgba(34,197,94,.12);
}

.hero-status .offline {
  color: #dc2626;
  background: rgba(239,68,68,.1);
}

.setup-summary {
  min-width: 0;
  max-width: 100%;
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  overflow: hidden;
}

.setup-summary button {
  min-width: 0;
  max-width: 100%;
  min-height: 74px;
  border: 1px solid rgba(148,163,184,.18);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 10px 26px rgba(15,23,42,.05);
  cursor: pointer;
  text-align: left;
  padding: 12px;
  overflow: hidden;
}

.setup-summary strong,
.setup-summary span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.setup-summary strong {
  font-size: 18px;
  font-weight: 950;
}

.setup-summary span {
  margin-top: 4px;
  font-size: 11px;
  color: #64748b;
  font-weight: 850;
}

.current-context-card {
  min-width: 0;
  max-width: 100%;
  margin-top: 10px;
  border-radius: 24px;
  padding: 14px;
  background: #fff;
  border: 1px solid rgba(148,163,184,.2);
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.current-context-card div {
  min-width: 0;
  flex: 1;
}

.current-context-card strong {
  display: block;
  margin-top: 3px;
  font-size: 15px;
  font-weight: 950;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.current-context-card button {
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  background: var(--account-primary);
  color: #fff;
  min-height: 38px;
  padding: 0 16px;
  font-weight: 950;
  cursor: pointer;
}

.tool-groups {
  min-width: 0;
  max-width: 100%;
  margin-top: 14px;
  display: grid;
  gap: 14px;
  overflow: hidden;
}

.tool-group {
  min-width: 0;
  max-width: 100%;
}

.tool-group h2 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 950;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.tool-grid {
  min-width: 0;
  max-width: 100%;
  display: grid;
  gap: 8px;
}

.tool-card {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 76px;
  border: 1px solid rgba(148,163,184,.2);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 10px 26px rgba(15,23,42,.05);
  padding: 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}

.tool-card:hover {
  border-color: color-mix(in srgb, var(--account-primary) 45%, rgba(148,163,184,.2));
}

.tool-icon {
  width: 42px;
  height: 42px;
  border-radius: 17px;
  display: grid;
  place-items: center;
  background: #f1f5f9;
  font-size: 20px;
  flex: 0 0 auto;
}

.tool-copy {
  min-width: 0;
}

.tool-copy strong,
.tool-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-copy strong {
  color: #0f172a;
  font-size: 14px;
  font-weight: 950;
  white-space: nowrap;
}

.tool-copy small {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tool-badge {
  border-radius: 999px;
  padding: 6px 8px;
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  white-space: nowrap;
}

.tool-badge.required {
  background: rgba(239,68,68,.1);
  color: #dc2626;
}

.tool-badge.important {
  background: rgba(37,99,235,.1);
  color: var(--account-primary);
}

.tool-badge.optional {
  background: rgba(100,116,139,.12);
  color: #475569;
}

.tool-panel {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  display: grid;
  gap: 10px;
  overflow-x: hidden;
}

.panel-head {
  min-width: 0;
  max-width: 100%;
  border-radius: 24px;
  padding: 12px;
  background: #fff;
  border: 1px solid rgba(148,163,184,.2);
  box-shadow: 0 10px 26px rgba(15,23,42,.05);
  display: grid;
  gap: 10px;
  overflow: hidden;
}

.back-pill {
  justify-self: start;
  max-width: 100%;
  border: 0;
  border-radius: 999px;
  min-height: 36px;
  padding: 0 14px;
  background: rgba(37,99,235,.1);
  color: var(--account-primary);
  font-weight: 950;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-head div {
  min-width: 0;
}

.panel-head h1 {
  margin: 2px 0 0;
  font-size: clamp(22px, 7vw, 34px);
  line-height: 1.06;
  letter-spacing: -.04em;
  overflow-wrap: anywhere;
}

.panel-body {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.panel-body-inner {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.panel-body-inner > * {
  min-width: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
}

.panel-body *,
.panel-body *::before,
.panel-body *::after {
  box-sizing: border-box;
  max-width: 100%;
}

.panel-body button,
.panel-body input,
.panel-body select,
.panel-body textarea {
  font: inherit;
  max-width: 100%;
}

.panel-body img,
.panel-body svg,
.panel-body canvas,
.panel-body video {
  max-width: 100%;
  height: auto;
}

.panel-body table {
  max-width: 100%;
}

.panel-body [style*="width"] {
  max-width: 100%;
}

.panel-body [style*="min-width"] {
  min-width: 0;
}

.account-context-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  width: min(92vw, 380px);
  max-width: 100vw;
  height: 100dvh;
  padding: 16px;
  background: #fff;
  color: #0f172a;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  transform: translateX(105%);
  transition: transform .22s ease;
  box-shadow: 0 24px 70px rgba(15,23,42,.22);
}

.account-context-drawer.open {
  transform: translateX(0);
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  justify-content: space-between;
  margin-bottom: 16px;
}

.drawer-head div {
  min-width: 0;
}

.drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  letter-spacing: -.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-card,
.drawer-grid div {
  min-width: 0;
  max-width: 100%;
  border-radius: 22px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid rgba(148,163,184,.2);
  overflow: hidden;
}

.drawer-card {
  margin-bottom: 12px;
}

.drawer-card.big {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer-card.big div:last-child {
  min-width: 0;
}

.drawer-card label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #64748b;
  font-weight: 900;
}

.drawer-card strong,
.drawer-card span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.drawer-card strong {
  font-size: 15px;
  font-weight: 950;
}

.drawer-card span {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}

.drawer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
  max-width: 100%;
}

.drawer-grid strong,
.drawer-grid span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-grid strong {
  font-size: 22px;
  font-weight: 950;
}

.drawer-grid span {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}

.drawer-action,
.drawer-danger {
  width: 100%;
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  font-weight: 950;
  cursor: pointer;
  margin-top: 8px;
}

.drawer-action {
  background: var(--account-primary);
  color: #fff;
}

.drawer-action:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.drawer-danger {
  background: rgba(239,68,68,.1);
  color: #dc2626;
}

@media (min-width: 760px) {
  .account-main {
    padding: 14px;
  }

  .account-hero {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1120px) {
  .account-main {
    width: min(1180px, 100%);
    max-width: 100%;
    margin: 0 auto;
    padding: 18px;
  }

  .tool-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .account-header {
    min-height: 46px;
    padding: 5px 6px;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 13px;
    font-size: 18px;
  }

  .account-main {
    padding: 6px;
  }

  .account-hero,
  .current-context-card,
  .tool-card,
  .panel-head {
    border-radius: 20px;
  }

  .setup-summary {
    grid-template-columns: 1fr;
  }

  .current-context-card {
    align-items: stretch;
    flex-direction: column;
  }

  .current-context-card button {
    width: 100%;
  }

  .tool-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .tool-badge {
    grid-column: 2;
    justify-self: start;
  }

  .account-context-drawer {
    width: min(94vw, 380px);
    padding: 12px;
  }

  .drawer-grid {
    grid-template-columns: 1fr;
  }
}
`;
