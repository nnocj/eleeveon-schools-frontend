"use client";

/**
 * app/account/page.tsx
 * ---------------------------------------------------------
 * ACCOUNT / OWNER WORKSPACE SHELL
 * ---------------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import SchoolsPage from "./schools";
import BranchesPage from "./branches";
import BillingPage from "./billing";
import AccountUsersPage from "./accountUsers";
import OwnerProfilePage from "./ownerProfile";
import SyncBackupPage from "./syncBackup";
import AccountSettingsPage from "./accountSettings";

type AccountTab =
  | "schools"
  | "branches"
  | "billing"
  | "users"
  | "profile"
  | "sync"
  | "settings";

const NAV_SECTIONS: {
  title: string;
  items: { key: AccountTab; label: string; icon: string }[];
}[] = [
  {
    title: "Institution Setup",
    items: [
      { key: "schools", label: "Schools", icon: "🏫" },
      { key: "branches", label: "Branches", icon: "🏢" },
    ],
  },
  {
    title: "Account",
    items: [
      { key: "billing", label: "Billing", icon: "💳" },
      { key: "users", label: "Account Users", icon: "👥" },
      { key: "profile", label: "Owner Profile", icon: "👤" },
    ],
  },
  {
    title: "System",
    items: [
      { key: "sync", label: "Sync & Backup", icon: "☁️" },
      { key: "settings", label: "Account Settings", icon: "⚙️" },
    ],
  },
];

const LABELS: Record<AccountTab, string> = {
  schools: "Schools",
  branches: "Branches",
  billing: "Billing",
  users: "Account Users",
  profile: "Owner Profile",
  sync: "Sync & Backup",
  settings: "Account Settings",
};

const GROUPS: Record<AccountTab, string> = {
  schools: "Institution Setup",
  branches: "Institution Setup",
  billing: "Account",
  users: "Account",
  profile: "Account",
  sync: "System",
  settings: "System",
};

export default function AccountPage() {
  const router = useRouter();
  const { settings } = useSettings();

  const {
    activeSchool,
    activeBranch,
    activeSchoolId,
    activeBranchId,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color)";

  const [tab, setTab] = useState<AccountTab>("schools");
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 820;
      setIsMobile(mobile);

      if (mobile) {
        setSidebarCompact(false);
      }
    };

    check();

    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);

    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const activeContextReady = !!activeSchoolId && !!activeBranchId;

  const activeLabel = LABELS[tab];
  const activeGroup = GROUPS[tab];

  const sidebarWidth = sidebarCompact && !isMobile ? 76 : 292;

  const ActiveComponent = useMemo(() => {
    const map: Record<AccountTab, React.ComponentType> = {
      schools: SchoolsPage,
      branches: BranchesPage,
      billing: BillingPage,
      users: AccountUsersPage,
      profile: OwnerProfilePage,
      sync: SyncBackupPage,
      settings: AccountSettingsPage,
    };

    return map[tab] || SchoolsPage;
  }, [tab]);

  const navigate = (nextTab: AccountTab) => {
    setTab(nextTab);

    if (isMobile) {
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goDashboard = () => {
    router.push("/dashboard");
  };

  const statusPill: React.CSSProperties = {
    padding: sidebarCompact && !isMobile ? "9px 0" : "9px 10px",
    borderRadius: 999,
    background: isOnline
      ? "rgba(34,197,94,0.14)"
      : "rgba(239,68,68,0.14)",
    color: isOnline ? "#86efac" : "#fca5a5",
    fontSize: 12,
    fontWeight: 850,
    display: "flex",
    justifyContent: sidebarCompact && !isMobile ? "center" : "flex-start",
    alignItems: "center",
    gap: 8,
  };

  const contextPill: React.CSSProperties = {
    padding: sidebarCompact && !isMobile ? "9px 0" : "9px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    fontSize: 12,
    fontWeight: 850,
    display: "flex",
    justifyContent: sidebarCompact && !isMobile ? "center" : "flex-start",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-family, system-ui)",
        display: "flex",
      }}
    >
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 80,
          }}
        />
      )}

      <aside
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          height: "100vh",
          position: isMobile ? "fixed" : "sticky",
          top: 0,
          left: 0,
          zIndex: 100,
          transform: isMobile
            ? sidebarOpen
              ? "translateX(0)"
              : "translateX(-105%)"
            : "translateX(0)",
          transition: "width 220ms ease, transform 220ms ease",
          background: "#0f172a",
          color: "#fff",
          padding: sidebarCompact && !isMobile ? 12 : 16,
          boxSizing: "border-box",
          overflowY: "auto",
          overflowX: "hidden",
          boxShadow: "8px 0 30px rgba(0,0,0,0.18)",
        }}
      >
        <div
          onClick={() => navigate("schools")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              sidebarCompact && !isMobile ? "center" : "space-between",
            gap: 12,
            cursor: "pointer",
            marginBottom: 18,
          }}
        >
          {sidebarCompact && !isMobile ? (
            <div
              title="Account Workspace"
              style={{
                width: 46,
                height: 46,
                borderRadius: 16,
                background: primary,
                display: "grid",
                placeItems: "center",
                fontSize: 22,
                fontWeight: 950,
              }}
            >
              🧭
            </div>
          ) : (
            <>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>
                  Account
                </h3>
                <small style={{ opacity: 0.7, fontSize: 12 }}>
                  Owner workspace
                </small>
              </div>

              {isMobile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSidebarOpen(false);
                  }}
                  style={{
                    border: "none",
                    background: "rgba(255,255,255,0.10)",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "8px 10px",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  ✕
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
          <div style={contextPill} title={activeSchool?.name || "No active school"}>
            <span>🏫</span>
            {(!sidebarCompact || isMobile) && (
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeSchool?.name || "No school selected"}
              </span>
            )}
          </div>

          <div style={contextPill} title={activeBranch?.name || "No active branch"}>
            <span>🏢</span>
            {(!sidebarCompact || isMobile) && (
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeBranch?.name || "No branch selected"}
              </span>
            )}
          </div>

          <div style={statusPill}>
            <span>●</span>
            {(!sidebarCompact || isMobile) && (
              <span>{isOnline ? "Online - Sync Ready" : "Offline - Local Mode"}</span>
            )}
          </div>

          {!isMobile && (
            <button
              type="button"
              onClick={() => setSidebarCompact((prev) => !prev)}
              style={{
                marginTop: 4,
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 12,
                padding: sidebarCompact ? "10px 0" : "10px 12px",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                justifyContent: sidebarCompact ? "center" : "space-between",
                alignItems: "center",
                fontWeight: 850,
              }}
            >
              <span>{sidebarCompact ? "☰" : "⇤"}</span>
              {!sidebarCompact && <span>Slim sidebar</span>}
            </button>
          )}
        </div>

        <div style={{ display: "grid", gap: sidebarCompact ? 14 : 18 }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <div
                style={{
                  fontSize: sidebarCompact && !isMobile ? 10 : 11,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: sidebarCompact && !isMobile ? 0 : 0.7,
                  opacity: 0.52,
                  margin:
                    sidebarCompact && !isMobile ? "0 0 8px" : "0 8px 8px",
                  textAlign: sidebarCompact && !isMobile ? "center" : "left",
                }}
              >
                {sidebarCompact && !isMobile
                  ? section.title.slice(0, 3)
                  : section.title}
              </div>

              <nav style={{ display: "grid", gap: 7 }}>
                {section.items.map((item) => {
                  const active = tab === item.key;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => navigate(item.key)}
                      title={sidebarCompact && !isMobile ? item.label : undefined}
                      style={{
                        width: "100%",
                        border: "none",
                        borderRadius: 14,
                        padding:
                          sidebarCompact && !isMobile ? "12px 0" : "11px 12px",
                        background: active ? primary : "transparent",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          sidebarCompact && !isMobile ? "center" : "flex-start",
                        gap: 10,
                        fontWeight: active ? 950 : 750,
                        textAlign: "left",
                        opacity: active ? 1 : 0.82,
                        transition: "all 180ms ease",
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{item.icon}</span>

                      {(!sidebarCompact || isMobile) && (
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: isMobile ? 12 : 20,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gap: 18,
          }}
        >
          <header
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 24,
              padding: isMobile ? 14 : 18,
              boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  style={{
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 12,
                    background: "var(--surface)",
                    color: "var(--text)",
                    padding: "9px 11px",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  ☰
                </button>
              )}

              <div>
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.62,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  {activeGroup}
                </div>

                <h1
                  style={{
                    margin: 0,
                    fontSize: isMobile ? 22 : 28,
                    fontWeight: 950,
                    letterSpacing: -0.6,
                  }}
                >
                  {activeLabel}
                </h1>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => router.push("/")}
                style={{
                  border: "1px solid rgba(0,0,0,0.10)",
                  borderRadius: 14,
                  padding: "11px 14px",
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontWeight: 850,
                  cursor: "pointer",
                }}
              >
                Home
              </button>

              <button
                type="button"
                onClick={goDashboard}
                disabled={!activeContextReady}
                style={{
                  border: "none",
                  borderRadius: 14,
                  padding: "12px 16px",
                  background: primary,
                  color: "#fff",
                  fontWeight: 900,
                  cursor: activeContextReady ? "pointer" : "not-allowed",
                  opacity: activeContextReady ? 1 : 0.55,
                  boxShadow: "0 12px 24px rgba(0,0,0,0.16)",
                }}
              >
                Enter Dashboard
              </button>
            </div>
          </header>

          <ActiveComponent />
        </div>
      </main>
    </div>
  );
}