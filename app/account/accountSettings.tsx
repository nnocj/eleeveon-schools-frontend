"use client";

import React from "react";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

export default function AccountSettingsPage() {
  const { settings } = useSettings();
  const { activeSchool, activeBranch } = useActiveBranch();

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const rows = [
    ["Primary Color", settings?.primaryColor || "Default"],
    ["Theme", settings?.theme || "Light"],
    ["Font Family", settings?.fontFamily || "System"],
    ["Active School", activeSchool?.name || "None"],
    ["Active Branch", activeBranch?.name || "None"],
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>
          Account Settings
        </h2>
        <p style={{ marginTop: 6, opacity: 0.68, fontWeight: 650 }}>
          View account-wide preferences and current institutional context.
        </p>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                padding: 14,
                borderRadius: 16,
                background: "rgba(0,0,0,0.025)",
              }}
            >
              <strong>{label}</strong>
              <span style={{ opacity: 0.72, fontWeight: 750 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>
          Recommended Account Settings Later
        </h3>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
            gap: 12,
          }}
        >
          {[
            "Default theme",
            "Default currency",
            "Subscription limits",
            "User permissions",
            "Cloud sync settings",
            "Account security",
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(0,0,0,0.025)",
                fontWeight: 850,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}