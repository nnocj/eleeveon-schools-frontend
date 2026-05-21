"use client";

/**
 * accountUsers.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE ACCOUNT USERS OVERVIEW
 * ---------------------------------------------------------
 *
 * Purpose:
 * - Prepare account-level access-control UI.
 * - Explain future user roles clearly.
 * - Keep the page safe inside the account shell.
 *
 * Rules:
 * - Signed-in account required.
 * - School/branch are optional here.
 * - Read-only / future-ready for now.
 * - Mobile-first cards.
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

type RoleCard = {
  title: string;
  text: string;
  icon: string;
  tone: "green" | "blue" | "purple" | "orange" | "gray";
  access: string[];
};

type RoadmapItem = {
  title: string;
  description: string;
  icon: string;
  tone: "green" | "blue" | "purple" | "orange" | "gray";
};

// ======================================================
// COMPONENT
// ======================================================

export default function AccountUsersPage() {
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

  const roles = useMemo<RoleCard[]>(() => {
    return [
      {
        title: "Account Owner",
        text: "Full control over schools, branches, billing, users, sync, and account settings.",
        icon: "👑",
        tone: "purple",
        access: ["All schools", "All branches", "Billing", "Users"],
      },
      {
        title: "School Admin",
        text: "Can manage selected school setup, school-level configuration, and branches.",
        icon: "🏫",
        tone: "blue",
        access: ["Selected school", "Branches", "Setup", "Reports"],
      },
      {
        title: "Branch Admin",
        text: "Can manage daily operations inside assigned school branches.",
        icon: "🏢",
        tone: "green",
        access: ["Assigned branch", "Students", "Teachers", "Daily work"],
      },
      {
        title: "Support User",
        text: "Can be added later for limited support, monitoring, or setup assistance.",
        icon: "🛠",
        tone: "orange",
        access: ["Limited support", "Monitoring", "Setup help", "No billing"],
      },
    ];
  }, []);

  const roadmap = useMemo<RoadmapItem[]>(() => {
    return [
      {
        title: "Invite by email",
        description: "Send account invitations to admins, staff, and support users.",
        icon: "✉️",
        tone: "blue",
      },
      {
        title: "Role permissions",
        description: "Control which modules each role can view, create, update, or delete.",
        icon: "🔐",
        tone: "purple",
      },
      {
        title: "Branch assignment",
        description: "Limit users to one branch, many branches, or the whole account.",
        icon: "🏢",
        tone: "green",
      },
      {
        title: "Device sessions",
        description: "Track trusted devices and remove access when a device is lost.",
        icon: "📱",
        tone: "orange",
      },
    ];
  }, []);

  // ======================================================
  // STATES
  // ======================================================

  if (loading) {
    return (
      <main className="au-page" style={{ "--au-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="au-state-card">
          <div className="au-spinner" />
          <h2>Opening account users...</h2>
          <p>Checking account access and current institutional context.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="au-page" style={{ "--au-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="au-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing account users.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="au-page" style={{ "--au-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="au-hero">
        <div className="au-hero-left">
          <div className="au-hero-icon">👥</div>
          <div className="au-title-wrap">
            <p>Access Control</p>
            <h2>Account Users</h2>
            <span>Prepare owners, admins, branch users, and support access.</span>
          </div>
        </div>

        <button type="button" className="au-primary-btn" disabled>
          Invite Coming Soon
        </button>
      </section>

      <section className="au-context-card">
        <div>
          <p>Current Workspace</p>
          <h3>{account?.name || "Account Workspace"}</h3>
          <span>{user?.email || user?.fullName || "Signed-in user"}</span>
        </div>

        <div className="au-pill-row">
          <Chip tone="blue">Account Scoped</Chip>
          <Chip tone={activeSchoolId ? "green" : "orange"}>
            {activeSchool?.name || "No school selected"}
          </Chip>
          <Chip tone={activeBranchId ? "green" : "orange"}>
            {activeBranch?.name || "No branch selected"}
          </Chip>
        </div>
      </section>

      <section className="au-summary-grid" aria-label="Account users summary">
        <SummaryCard label="Schools" value={schools?.length || 0} icon="🏫" />
        <SummaryCard label="Branches" value={allBranches?.length || 0} icon="🏢" />
        <SummaryCard label="Current User" value="Signed in" icon="🔐" />
        <SummaryCard label="User Invites" value="Soon" icon="✉️" />
      </section>

      <section className="au-section-card">
        <div className="au-section-head">
          <div>
            <p>Role Model</p>
            <h3>Recommended account roles</h3>
          </div>
        </div>

        <div className="au-role-grid">
          {roles.map((role) => (
            <article key={role.title} className="au-role-card">
              <div className="au-role-top">
                <div className="au-role-icon">{role.icon}</div>
                <div>
                  <h4>{role.title}</h4>
                  <Chip tone={role.tone}>Future role</Chip>
                </div>
              </div>

              <p>{role.text}</p>

              <div className="au-access-list">
                {role.access.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="au-section-card">
        <div className="au-section-head with-action">
          <div>
            <p>User Invitation</p>
            <h3>Future login/auth integration</h3>
          </div>

          <button type="button" onClick={() => router.push("/account")}>Setup Center</button>
        </div>

        <div className="au-invite-card">
          <div className="au-invite-icon">🚧</div>
          <div>
            <h4>Invite User Coming Soon</h4>
            <p>
              This section is ready for future login/auth integration. Later, it can connect to
              Supabase, Firebase Auth, Clerk, NextAuth, or your own account-user table.
            </p>
            <button type="button" disabled>
              Invite User Coming Soon
            </button>
          </div>
        </div>
      </section>

      <section className="au-section-card">
        <div className="au-section-head">
          <div>
            <p>Implementation Roadmap</p>
            <h3>What this page can support later</h3>
          </div>
        </div>

        <div className="au-roadmap-grid">
          {roadmap.map((item) => (
            <article key={item.title} className="au-roadmap-card">
              <div className="au-roadmap-icon">{item.icon}</div>
              <div>
                <h4>{item.title}</h4>
                <p>{item.description}</p>
                <Chip tone={item.tone}>Planned</Chip>
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
    <article className="au-summary-card">
      <div className="au-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`au-chip ${tone}`}>{children}</span>;
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes auSpin {
  to { transform: rotate(360deg); }
}

.au-page {
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

.au-page *,
.au-page *::before,
.au-page *::after {
  box-sizing: border-box;
}

.au-page button,
.au-page input,
.au-page select,
.au-page textarea {
  font: inherit;
  max-width: 100%;
}

.au-state-card {
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

.au-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.au-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.au-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--au-primary) 18%, transparent);
  border-top-color: var(--au-primary);
  animation: auSpin .8s linear infinite;
}

.au-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--au-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.au-primary-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.au-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--au-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.au-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.au-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--au-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--au-primary) 28%, transparent);
  font-size: 22px;
}

.au-title-wrap {
  min-width: 0;
}

.au-title-wrap p,
.au-title-wrap h2,
.au-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.au-title-wrap p,
.au-context-card p,
.au-section-head p {
  margin: 0;
  color: var(--au-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.au-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.au-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.au-context-card,
.au-section-card {
  min-width: 0;
  margin-top: 10px;
  padding: 12px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.au-context-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.au-context-card div:first-child {
  min-width: 0;
}

.au-context-card h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.au-context-card span {
  display: block;
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.au-pill-row {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.au-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.au-summary-card {
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

.au-summary-icon,
.au-role-icon,
.au-invite-icon,
.au-roadmap-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--au-primary) 12%, #fff);
  font-size: 20px;
}

.au-summary-card div:last-child {
  min-width: 0;
}

.au-summary-card strong,
.au-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.au-summary-card strong {
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.au-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.au-section-head {
  min-width: 0;
  margin-bottom: 10px;
}

.au-section-head.with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.au-section-head h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.au-section-head button,
.au-invite-card button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  background: var(--au-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.au-invite-card button:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.au-role-grid,
.au-roadmap-grid {
  display: grid;
  gap: 8px;
}

.au-role-card,
.au-invite-card,
.au-roadmap-card {
  min-width: 0;
  padding: 12px;
  border-radius: 19px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .12);
  overflow: hidden;
}

.au-role-top,
.au-invite-card,
.au-roadmap-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.au-role-top div:last-child,
.au-invite-card div:last-child,
.au-roadmap-card div:last-child {
  min-width: 0;
}

.au-role-card h4,
.au-invite-card h4,
.au-roadmap-card h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.au-role-card p,
.au-invite-card p,
.au-roadmap-card p {
  margin: 8px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 720;
}

.au-access-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.au-access-list span {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .78);
  color: #475569;
  font-size: 10px;
  font-weight: 900;
}

.au-chip {
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

.au-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.au-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.au-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.au-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.au-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.au-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

@media (min-width: 680px) {
  .au-page {
    padding: 12px;
  }

  .au-summary-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .au-role-grid,
  .au-roadmap-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .au-page {
    padding: 16px;
  }

  .au-role-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .au-roadmap-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .au-page {
    padding: 6px;
  }

  .au-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .au-primary-btn {
    width: 100%;
  }

  .au-context-card {
    align-items: stretch;
  }

  .au-summary-grid {
    gap: 6px;
  }

  .au-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .au-invite-card,
  .au-roadmap-card {
    flex-direction: column;
  }
}
`;
