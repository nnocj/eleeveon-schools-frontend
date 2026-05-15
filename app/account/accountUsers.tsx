"use client";

import React from "react";
import { useSettings } from "../context/settings-context";

export default function AccountUsersPage() {
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color)";

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const roles = [
    {
      title: "Account Owner",
      text: "Full control over schools, branches, billing, users and account settings.",
      icon: "👑",
    },
    {
      title: "School Admin",
      text: "Can manage selected school setup, branches and school-level configuration.",
      icon: "🏫",
    },
    {
      title: "Branch Admin",
      text: "Can manage daily operations inside assigned school branches.",
      icon: "🏢",
    },
    {
      title: "Support User",
      text: "Can be added later for limited support, monitoring or setup assistance.",
      icon: "🛠",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>
          Account Users
        </h2>
        <p style={{ marginTop: 6, opacity: 0.68, fontWeight: 650 }}>
          Prepare account-level access control for owners, admins and support users.
        </p>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
        }}
      >
        {roles.map((role) => (
          <div key={role.title} style={card}>
            <div style={{ fontSize: 30 }}>{role.icon}</div>
            <h3 style={{ margin: "12px 0 6px", fontSize: 18, fontWeight: 950 }}>
              {role.title}
            </h3>
            <p style={{ margin: 0, opacity: 0.7, lineHeight: 1.55, fontSize: 13 }}>
              {role.text}
            </p>
          </div>
        ))}
      </section>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>
          User Invitation
        </h3>

        <p style={{ marginTop: 8, opacity: 0.7, lineHeight: 1.6 }}>
          This section is ready for future login/auth integration. Later, you can
          connect it to Supabase, Firebase Auth, Clerk, NextAuth, or your own user table.
        </p>

        <button
          type="button"
          style={{
            marginTop: 12,
            border: "none",
            borderRadius: 14,
            padding: "12px 16px",
            background: primary,
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Invite User Coming Soon
        </button>
      </div>
    </div>
  );
}