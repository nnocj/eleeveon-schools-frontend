// ======================================================
// FILE 4: app/account/ownerProfile.tsx
// ======================================================

"use client";

/**
 * ownerProfile.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST REAL OWNER PROFILE PAGE
 * ---------------------------------------------------------
 *
 * Backend:
 * - GET /api/account/profile
 * - PATCH /api/account/profile
 *
 * Auth:
 * - Sends JWT from browser storage as Bearer token.
 * - The API route reads accountId from JWT, not from the form.
 */

import React, { useEffect, useMemo, useState } from "react";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

type OwnerProfileForm = {
  ownerName: string;
  businessName: string;
  phone: string;
  email: string;
  address: string;
};

type ProfileRow = {
  label: string;
  value: string;
  icon: string;
  tone: "green" | "blue" | "purple" | "orange" | "gray";
};

const emptyForm: OwnerProfileForm = {
  ownerName: "",
  businessName: "",
  phone: "",
  email: "",
  address: "",
};

function getAuthToken() {
  if (typeof window === "undefined") return "";

  return (
    window.localStorage.getItem("token") ||
    window.localStorage.getItem("authToken") ||
    window.localStorage.getItem("accessToken") ||
    window.localStorage.getItem("eleeveon-token") ||
    window.sessionStorage.getItem("token") ||
    window.sessionStorage.getItem("authToken") ||
    window.sessionStorage.getItem("accessToken") ||
    ""
  );
}

export default function OwnerProfilePage() {
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
    loading: contextLoading,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const baseLoading = accountLoading || settingsLoading || contextLoading;

  const [form, setForm] = useState<OwnerProfileForm>(emptyForm);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | undefined>();

  const loading = baseLoading || profileLoading;

  const update = (patch: Partial<OwnerProfileForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const loadProfile = async () => {
    if (!authenticated || !accountId) {
      setProfileLoading(false);
      return;
    }

    const token = getAuthToken();

    if (!token) {
      setForm({
        ...emptyForm,
        ownerName: user?.fullName || "",
        businessName: account?.name || "",
        email: user?.email || "",
      });
      setProfileLoading(false);
      return;
    }

    try {
      setProfileLoading(true);

      const res = await fetch("/api/account/profile", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load owner profile");
      }

      const data = await res.json();
      const profile = data.profile;

      setForm({
        ownerName: profile?.ownerName || user?.fullName || "",
        businessName: profile?.businessName || account?.name || "",
        phone: profile?.phone || "",
        email: profile?.email || user?.email || "",
        address: profile?.address || "",
      });

      setSavedAt(profile?.updatedAt);
    } catch (error) {
      console.error("Failed to load owner profile:", error);
      setForm({
        ...emptyForm,
        ownerName: user?.fullName || "",
        businessName: account?.name || "",
        email: user?.email || "",
      });
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId]);

  const completion = useMemo(() => {
    const checks = [
      !!form.ownerName.trim(),
      !!form.businessName.trim(),
      !!form.phone.trim(),
      !!form.email.trim(),
      !!form.address.trim(),
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form]);

  const profileRows = useMemo<ProfileRow[]>(() => {
    return [
      {
        label: "Owner Name",
        value: form.ownerName || user?.fullName || "Not set",
        icon: "👤",
        tone: form.ownerName ? "green" : "orange",
      },
      {
        label: "Business Name",
        value: form.businessName || account?.name || "Not set",
        icon: "🏢",
        tone: form.businessName ? "green" : "orange",
      },
      {
        label: "Phone",
        value: form.phone || "Not set",
        icon: "📞",
        tone: form.phone ? "green" : "gray",
      },
      {
        label: "Email",
        value: form.email || user?.email || "Not set",
        icon: "✉️",
        tone: form.email ? "green" : "gray",
      },
    ];
  }, [form, user, account]);

  const save = async () => {
    if (!authenticated || !accountId) {
      alert("Sign in first.");
      return;
    }

    if (!form.ownerName.trim()) {
      alert("Enter the account owner name.");
      return;
    }

    const token = getAuthToken();

    if (!token) {
      alert("Missing login token. Please log out and sign in again.");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to save profile");
      }

      setSavedAt(data.profile?.updatedAt);
      alert("Owner profile saved successfully.");
    } catch (error: any) {
      console.error("Failed to save owner profile:", error);
      alert(error?.message || "Failed to save owner profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="op-page" style={{ "--op-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="op-state-card">
          <div className="op-spinner" />
          <h2>Opening owner profile...</h2>
          <p>Checking account identity and loading owner profile from backend.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="op-page" style={{ "--op-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="op-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before editing the owner profile.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="op-page" style={{ "--op-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="op-hero">
        <div className="op-hero-left">
          <div className="op-hero-icon">👤</div>
          <div className="op-title-wrap">
            <p>Account Ownership</p>
            <h2>Owner Profile</h2>
            <span>Store client or business details for billing, ownership, and support.</span>
          </div>
        </div>

        <button type="button" className="op-primary-btn" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </section>

      <section className="op-context-card">
        <div>
          <p>Current Workspace</p>
          <h3>{account?.name || form.businessName || "Account Workspace"}</h3>
          <span>{user?.email || form.email || "Signed-in user"}</span>
        </div>

        <div className="op-pill-row">
          <Chip tone="blue">Backend Controlled</Chip>
          <Chip tone={activeSchoolId ? "green" : "orange"}>
            {activeSchool?.name || "No school selected"}
          </Chip>
          <Chip tone={activeBranchId ? "green" : "orange"}>
            {activeBranch?.name || "No branch selected"}
          </Chip>
        </div>
      </section>

      <section className="op-summary-grid" aria-label="Owner profile summary">
        <SummaryCard label="Profile Complete" value={`${completion}%`} icon="✅" />
        <SummaryCard label="Owner" value={form.ownerName || "Not set"} icon="👤" />
        <SummaryCard label="Business" value={form.businessName || account?.name || "Not set"} icon="🏢" />
        <SummaryCard label="Storage" value="Backend" icon="☁️" />
      </section>

      <section className="op-section-card">
        <div className="op-section-head">
          <div>
            <p>Profile Preview</p>
            <h3>Owner information</h3>
          </div>
          {savedAt && <Chip tone="green">Saved</Chip>}
        </div>

        <div className="op-row-grid">
          {profileRows.map((row) => (
            <ProfileItem key={row.label} row={row} />
          ))}
        </div>

        {form.address && (
          <div className="op-address-card">
            <strong>Billing / Business Address</strong>
            <p>{form.address}</p>
          </div>
        )}
      </section>

      <section className="op-section-card">
        <div className="op-section-head">
          <div>
            <p>Edit Profile</p>
            <h3>Owner and business details</h3>
          </div>
        </div>

        <div className="op-form-grid">
          <div className="op-form-two">
            <Field label="Owner Name">
              <input
                value={form.ownerName}
                onChange={(event) => update({ ownerName: event.target.value })}
                placeholder="Account owner name"
              />
            </Field>

            <Field label="Business Name">
              <input
                value={form.businessName}
                onChange={(event) => update({ businessName: event.target.value })}
                placeholder="Business or client name"
              />
            </Field>
          </div>

          <div className="op-form-two">
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(event) => update({ phone: event.target.value })}
                placeholder="Phone number"
              />
            </Field>

            <Field label="Email">
              <input
                value={form.email}
                onChange={(event) => update({ email: event.target.value })}
                placeholder="Email address"
              />
            </Field>
          </div>

          <Field label="Address">
            <textarea
              value={form.address}
              onChange={(event) => update({ address: event.target.value })}
              placeholder="Billing or business address"
              rows={3}
            />
          </Field>

          <button type="button" className="op-save-btn" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="op-summary-card">
      <div className="op-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function ProfileItem({ row }: { row: ProfileRow }) {
  return (
    <article className="op-profile-item">
      <div className="op-profile-icon">{row.icon}</div>
      <div>
        <strong>{row.label}</strong>
        <span>{row.value}</span>
      </div>
      <Chip tone={row.tone}>{row.value === "Not set" ? "Missing" : "Set"}</Chip>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="op-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`op-chip ${tone}`}>{children}</span>;
}

const css = `
@keyframes opSpin { to { transform: rotate(360deg); } }
.op-page { min-height: 100dvh; width: 100%; max-width: 100%; min-width: 0; padding: 8px; padding-bottom: max(28px, env(safe-area-inset-bottom)); background: var(--bg, #f8fafc); color: var(--text, #0f172a); font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); overflow-x: hidden; }
.op-page *, .op-page *::before, .op-page *::after { box-sizing: border-box; }
.op-page button, .op-page input, .op-page select, .op-page textarea { font: inherit; max-width: 100%; }
.op-page input, .op-page select, .op-page textarea { width: 100%; min-height: 43px; border: 1px solid rgba(148, 163, 184, .28); border-radius: 15px; padding: 0 12px; background: var(--surface, #fff); color: var(--text, #0f172a); outline: none; font-weight: 750; }
.op-page textarea { padding: 12px; min-height: 94px; resize: vertical; }
.op-state-card { min-height: min(420px, calc(100dvh - 32px)); display: grid; place-items: center; align-content: center; gap: 10px; width: min(460px, 100%); margin: 0 auto; padding: 22px; border-radius: 28px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .22); box-shadow: 0 24px 60px rgba(15, 23, 42, .08); text-align: center; }
.op-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.op-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.op-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--op-primary) 18%, transparent); border-top-color: var(--op-primary); animation: opSpin .8s linear infinite; }
.op-primary-btn, .op-save-btn { min-height: 46px; border: 0; border-radius: 999px; padding: 0 18px; background: var(--op-primary); color: #fff; font-weight: 950; cursor: pointer; }
.op-primary-btn:disabled, .op-save-btn:disabled { opacity: .55; cursor: not-allowed; }
.op-hero { display: flex; align-items: stretch; justify-content: space-between; gap: 10px; padding: 12px; border-radius: 28px; background: linear-gradient(135deg, color-mix(in srgb, var(--op-primary) 12%, #fff), #fff 64%); border: 1px solid rgba(148, 163, 184, .22); box-shadow: 0 18px 46px rgba(15, 23, 42, .07); overflow: hidden; }
.op-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.op-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--op-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--op-primary) 28%, transparent); font-size: 22px; }
.op-title-wrap { min-width: 0; }
.op-title-wrap p, .op-title-wrap h2, .op-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op-title-wrap p, .op-context-card p, .op-section-head p { margin: 0; color: var(--op-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.op-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.op-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.op-context-card, .op-section-card { min-width: 0; margin-top: 10px; padding: 12px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.op-context-card { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.op-context-card div:first-child { min-width: 0; }
.op-context-card h3 { margin: 3px 0 0; font-size: 18px; font-weight: 1000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op-context-card span { display: block; margin-top: 2px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op-pill-row, .op-section-head { display: flex; gap: 7px; flex-wrap: wrap; }
.op-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.op-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.op-summary-icon, .op-profile-icon { width: 38px; height: 38px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--op-primary) 12%, #fff); font-size: 20px; }
.op-summary-card div:last-child { min-width: 0; }
.op-summary-card strong, .op-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.op-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }
.op-section-head { min-width: 0; margin-bottom: 10px; align-items: flex-start; justify-content: space-between; }
.op-section-head h3 { margin: 3px 0 0; font-size: 18px; font-weight: 1000; letter-spacing: -.03em; }
.op-row-grid, .op-form-grid { display: grid; gap: 8px; }
.op-profile-item, .op-address-card { min-width: 0; padding: 11px; border-radius: 18px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); overflow: hidden; }
.op-profile-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.op-profile-item strong, .op-profile-item span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op-profile-item strong, .op-address-card strong { font-size: 13px; font-weight: 1000; }
.op-profile-item span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.op-address-card { margin-top: 8px; }
.op-address-card p { margin: 5px 0 0; color: var(--muted, #64748b); font-size: 12px; line-height: 1.5; font-weight: 720; overflow-wrap: anywhere; }
.op-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.op-field { display: grid; gap: 6px; min-width: 0; }
.op-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.op-save-btn { width: 100%; }
.op-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.op-chip.green { background: rgba(34,197,94,.12); color: #16a34a; } .op-chip.red { background: rgba(239,68,68,.12); color: #dc2626; } .op-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; } .op-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; } .op-chip.orange { background: rgba(245,158,11,.14); color: #b45309; } .op-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
@media (min-width: 680px) { .op-page { padding: 12px; } .op-summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .op-row-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .op-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1040px) { .op-page { padding: 16px; } }
@media (max-width: 520px) { .op-page { padding: 6px; } .op-hero { flex-direction: column; border-radius: 22px; padding: 10px; } .op-primary-btn { width: 100%; } .op-context-card { align-items: stretch; } .op-summary-grid { gap: 6px; } .op-summary-card { padding: 10px; border-radius: 19px; } .op-profile-item { grid-template-columns: auto minmax(0, 1fr); } .op-profile-item .op-chip { grid-column: 2; justify-self: start; } }
`;
