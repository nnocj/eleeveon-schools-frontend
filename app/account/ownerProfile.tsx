"use client";

import React, { useState } from "react";
import { useSettings } from "../context/settings-context";

export default function OwnerProfilePage() {
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color)";

  const [form, setForm] = useState({
    ownerName: "",
    businessName: "",
    phone: "",
    email: "",
    address: "",
  });

  const update = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
    boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 850,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>
          Owner Profile
        </h2>
        <p style={{ marginTop: 6, opacity: 0.68, fontWeight: 650 }}>
          Store client or business details for billing, ownership and support.
        </p>
      </div>

      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 14,
          }}
        >
          <div>
            <label style={label}>Owner Name</label>
            <input
              value={form.ownerName}
              onChange={(e) => update({ ownerName: e.target.value })}
              placeholder="Account owner name"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Business Name</label>
            <input
              value={form.businessName}
              onChange={(e) => update({ businessName: e.target.value })}
              placeholder="Business or client name"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Phone</label>
            <input
              value={form.phone}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder="Phone number"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Email</label>
            <input
              value={form.email}
              onChange={(e) => update({ email: e.target.value })}
              placeholder="Email address"
              style={input}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={label}>Address</label>
          <textarea
            value={form.address}
            onChange={(e) => update({ address: e.target.value })}
            placeholder="Billing or business address"
            rows={3}
            style={{ ...input, resize: "vertical" }}
          />
        </div>

        <button
          type="button"
          style={{
            marginTop: 16,
            border: "none",
            borderRadius: 14,
            padding: "12px 16px",
            background: primary,
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
          onClick={() => alert("Profile saving will be connected when account DB table is added.")}
        >
          Save Profile
        </button>
      </div>
    </div>
  );
}