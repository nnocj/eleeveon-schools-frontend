"use client";

/**
 * accountSettings.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE ACCOUNT SETTINGS OVERVIEW
 * ---------------------------------------------------------
 *
 * Purpose:
 * - View account-wide app preferences.
 * - View current school/branch context.
 * - Show future account settings areas without breaking mobile UI.
 *
 * Rules:
 * - Signed-in account required.
 * - School/branch are optional on account setup pages.
 * - Read-only overview for now.
 * - Account-shell safe: no horizontal overflow.
 */

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type SettingRow = {
  label: string;
  value: string;
  icon: string;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
};

type FutureSetting = {
  title: string;
  description: string;
  icon: string;
  status: "planned" | "recommended" | "security";
};

// ======================================================
// COMPONENT
// ======================================================

export default function AccountSettingsPage() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    user,
    account,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeBranch,
    activeSchoolId,
    activeBranchId,
    schools,
    allBranches,
    loading: contextLoading,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const loading = accountLoading || settingsLoading || contextLoading;

  const settingsRows = useMemo<SettingRow[]>(() => {
    return [
      {
        label: "Primary Color",
        value: settings?.primaryColor || "Default",
        icon: "🎨",
        tone: "blue",
      },
      {
        label: "Theme",
        value: settings?.theme || "Light",
        icon: "🌓",
        tone: "purple",
      },
      {
        label: "Font Family",
        value: settings?.fontFamily || "System",
        icon: "🔤",
        tone: "gray",
      },
      {
        label: "Active School",
        value: activeSchool?.name || "None selected",
        icon: "🏫",
        tone: activeSchoolId ? "green" : "orange",
      },
      {
        label: "Active Branch",
        value: activeBranch?.name || "None selected",
        icon: "🏢",
        tone: activeBranchId ? "green" : "orange",
      },
    ];
  }, [settings, activeSchool, activeBranch, activeSchoolId, activeBranchId]);

  const accountRows = useMemo<SettingRow[]>(() => {
    return [
      {
        label: "Account Workspace",
        value: account?.name || "Account Workspace",
        icon: "🧩",
        tone: "blue",
      },
      {
        label: "Signed-in User",
        value: user?.email || user?.fullName || "Signed in user",
        icon: "👤",
        tone: "green",
      },
      {
        label: "School Profiles",
        value: String(schools?.length || 0),
        icon: "🏫",
        tone: "purple",
      },
      {
        label: "Branches",
        value: String(allBranches?.length || 0),
        icon: "🏢",
        tone: "orange",
      },
    ];
  }, [account, user, schools, allBranches]);

  const futureSettings = useMemo<FutureSetting[]>(() => {
    return [
      {
        title: "Default theme",
        description: "Allow account owners to choose the default appearance for all account users.",
        icon: "🌓",
        status: "recommended",
      },
      {
        title: "Default currency",
        description: "Set the currency used across billing, fees, income, and expenses.",
        icon: "💵",
        status: "recommended",
      },
      {
        title: "Subscription limits",
        description: "Control plan limits for schools, branches, students, users, and storage.",
        icon: "📦",
        status: "planned",
      },
      {
        title: "User permissions",
        description: "Define account-level role permissions and access boundaries.",
        icon: "🔐",
        status: "security",
      },
      {
        title: "Cloud sync settings",
        description: "Manage backup behavior, device sync rules, and offline data recovery.",
        icon: "☁️",
        status: "planned",
      },
      {
        title: "Account security",
        description: "Add security policies for sessions, devices, and sensitive account actions.",
        icon: "🛡️",
        status: "security",
      },
    ];
  }, []);

  // ======================================================
  // STATES
  // ======================================================

  if (loading) {
    return (
      <main className="as-page" style={{ "--as-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="as-state-card">
          <div className="as-spinner" />
          <h2>Opening account settings...</h2>
          <p>Checking account preferences and current institutional context.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="as-page" style={{ "--as-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="as-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing account settings.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="as-page" style={{ "--as-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="as-hero">
        <div className="as-hero-left">
          <div className="as-hero-icon">⚙️</div>
          <div className="as-title-wrap">
            <p>Account Preferences</p>
            <h2>Account Settings</h2>
            <span>View account-wide preferences and current institutional context.</span>
          </div>
        </div>
      </section>

      <section className="as-context-card">
        <div>
          <p>Current Workspace</p>
          <h3>{account?.name || "Account Workspace"}</h3>
          <span>{user?.email || user?.fullName || "Signed-in user"}</span>
        </div>

        <div className="as-pill-row">
          <Chip tone="blue">Account Scoped</Chip>
          <Chip tone={activeSchoolId ? "green" : "orange"}>
            {activeSchoolId ? "School selected" : "No school"}
          </Chip>
          <Chip tone={activeBranchId ? "green" : "orange"}>
            {activeBranchId ? "Branch selected" : "No branch"}
          </Chip>
        </div>
      </section>

      <section className="as-summary-grid" aria-label="Account summary">
        <SummaryCard label="Schools" value={schools?.length || 0} icon="🏫" />
        <SummaryCard label="Branches" value={allBranches?.length || 0} icon="🏢" />
        <SummaryCard label="Theme" value={settings?.theme || "Light"} icon="🌓" />
        <SummaryCard label="Status" value="Signed in" icon="🔐" />
      </section>

      <section className="as-section-card">
        <div className="as-section-head">
          <div>
            <p>App Preferences</p>
            <h3>Current settings</h3>
          </div>
        </div>

        <div className="as-row-grid">
          {settingsRows.map((row) => (
            <SettingItem key={row.label} row={row} />
          ))}
        </div>
      </section>

      <section className="as-section-card">
        <div className="as-section-head">
          <div>
            <p>Account Context</p>
            <h3>Workspace overview</h3>
          </div>
        </div>

        <div className="as-row-grid">
          {accountRows.map((row) => (
            <SettingItem key={row.label} row={row} />
          ))}
        </div>
      </section>

      <section className="as-section-card">
        <div className="as-section-head with-action">
          <div>
            <p>Recommended Later</p>
            <h3>Account settings roadmap</h3>
          </div>

          <button type="button" onClick={() => router.push("/account")}>
            Setup Center
          </button>
        </div>

        <div className="as-future-grid">
          {futureSettings.map((item) => (
            <article key={item.title} className="as-future-card">
              <div className="as-future-icon">{item.icon}</div>
              <div>
                <h4>{item.title}</h4>
                <p>{item.description}</p>
                <Chip tone={item.status === "security" ? "red" : item.status === "recommended" ? "blue" : "gray"}>
                  {item.status}
                </Chip>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="as-summary-card">
      <div className="as-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function SettingItem({ row }: { row: SettingRow }) {
  return (
    <article className="as-setting-item">
      <div className="as-setting-icon">{row.icon}</div>
      <div>
        <strong>{row.label}</strong>
        <span>{row.value}</span>
      </div>
      <Chip tone={row.tone || "gray"}>Current</Chip>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`as-chip ${tone}`}>{children}</span>;
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes asSpin {
  to { transform: rotate(360deg); }
}

.as-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.as-page *,
.as-page *::before,
.as-page *::after {
  box-sizing: border-box;
}

.as-page button,
.as-page input,
.as-page select,
.as-page textarea {
  font: inherit;
  max-width: 100%;
}

.as-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.as-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.as-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.as-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--as-primary) 18%, transparent);
  border-top-color: var(--as-primary);
  animation: asSpin .8s linear infinite;
}

.as-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--as-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.as-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.as-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--as-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--as-primary) 28%, transparent);
  font-size: 22px;
}

.as-title-wrap {
  min-width: 0;
}

.as-title-wrap p,
.as-title-wrap h2,
.as-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-title-wrap p,
.as-context-card p,
.as-section-head p {
  margin: 0;
  color: var(--as-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.as-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.as-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.as-context-card,
.as-section-card {
  min-width: 0;
  margin-top: 10px;
  padding: 12px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.as-context-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.as-context-card div:first-child {
  min-width: 0;
}

.as-context-card h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-context-card span {
  display: block;
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-pill-row {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.as-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.as-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}

.as-summary-icon,
.as-setting-icon,
.as-future-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--as-primary) 12%, #fff);
}

.as-summary-card div:last-child {
  min-width: 0;
}

.as-summary-card strong,
.as-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-summary-card strong {
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.as-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.as-section-head {
  min-width: 0;
  margin-bottom: 10px;
}

.as-section-head.with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.as-section-head h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.as-section-head button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  background: var(--as-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.as-row-grid,
.as-future-grid {
  display: grid;
  gap: 8px;
}

.as-setting-item,
.as-future-card {
  min-width: 0;
  padding: 11px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .12);
  overflow: hidden;
}

.as-setting-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.as-setting-item strong,
.as-setting-item span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-setting-item strong {
  font-size: 13px;
  font-weight: 1000;
}

.as-setting-item span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.as-future-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.as-future-card div:last-child {
  min-width: 0;
}

.as-future-card h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.as-future-card p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
  font-weight: 720;
}

.as-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.as-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.as-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.as-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.as-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.as-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.as-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

@media (min-width: 680px) {
  .as-page {
    padding: 12px;
  }

  .as-summary-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .as-row-grid,
  .as-future-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .as-page {
    padding: 16px;
  }

  .as-future-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .as-page {
    padding: 6px;
  }

  .as-hero {
    border-radius: 22px;
    padding: 10px;
  }

  .as-context-card {
    align-items: stretch;
  }

  .as-summary-grid {
    gap: 6px;
  }

  .as-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .as-setting-item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .as-setting-item .as-chip {
    grid-column: 2;
    justify-self: start;
  }
}
`;
