"use client";

/**
 * app/branch-admin/modules/SchoolPayoutSettings.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOL/BRANCH PAYOUT SETTINGS V3
 * ---------------------------------------------------------
 * Golden Standard compact rewrite.
 *
 * Updates in this version:
 * - Removed the large analytics/summary cards.
 * - Removed even the compact status row; status now appears inside the top preview.
 * - Bank/Momo fields are intelligent:
 *   - Bank selected: only bank fields show.
 *   - Momo selected: only momo fields show.
 * - Advanced fields moved to More:
 *   - settlement mode
 *   - settlement schedule
 *   - Paystack subaccount code
 *   - contact email/phone
 *   - active/inactive status
 * - Main form is now only payment destination fields; advanced/meta fields live in More.
 *
 * Workspace source fix:
 * - Resolves the active school/branch from eleeveon_open_workspace first.
 * - Falls back to active membership, ActiveBranchContext, settings, then storage.
 * - Prevents stale branch payout settings after role/workspace switching.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import {
  createLocal,
  listActiveLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type AnyRow = Record<string, any>;
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type PayoutForm = {
  id: string;
  settlementMode: "direct_subaccount" | "platform_wallet";
  preferredMethod: "bank" | "momo";
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  momoNetwork: string;
  momoNumber: string;
  momoName: string;
  paystackSubaccountCode: string;
  settlementSchedule: "manual" | "daily" | "weekly" | "monthly";
  contactEmail: string;
  contactPhone: string;
  active: boolean;
  note: string;
};

const emptyForm: PayoutForm = {
  id: "",
  settlementMode: "platform_wallet",
  preferredMethod: "bank",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  momoNetwork: "mtn",
  momoNumber: "",
  momoName: "",
  paystackSubaccountCode: "",
  settlementSchedule: "manual",
  contactEmail: "",
  contactPhone: "",
  active: true,
  note: "",
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow | null) {
  return row?.id ?? row?.payload?.id;
}

function cleanId(value: unknown): string {
  if (value === undefined || value === null) return "";
  const normalized = String(value).trim();
  return normalized && normalized !== "0" ? normalized : "";
}

function sameScope(
  row: AnyRow,
  accountId?: string | null,
  schoolId?: string,
  branchId?: string,
) {
  if (!row || row.isDeleted === true) return false;
  if (accountId && row.accountId && row.accountId !== accountId) return false;
  if (schoolId && String(row.schoolId ?? "") !== String(schoolId ?? ""))
    return false;
  if (branchId && String(row.branchId ?? "") !== String(branchId ?? ""))
    return false;
  return true;
}

function statusTone(status: string): Tone {
  if (status === "inactive") return "red";
  if (status === "verified") return "green";
  if (status === "active") return "blue";
  return "gray";
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`ps-chip ${tone}`}>{children}</span>;
}

function destinationLabel(form: PayoutForm) {
  if (form.preferredMethod === "bank") {
    return (
      [form.bankName, form.bankAccountName, form.bankAccountNumber]
        .filter(Boolean)
        .join(" · ") || "Bank payout not set"
    );
  }

  return (
    [form.momoNetwork?.toUpperCase(), form.momoName, form.momoNumber]
      .filter(Boolean)
      .join(" · ") || "Momo payout not set"
  );
}

function State({
  primary,
  title,
  text: body,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="ps-page"
      style={{ "--ps-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="ps-state">
        <div className="ps-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

// PAYOUT_SETTINGS_COMPACT_VERSION: v3-no-main-cards-intelligent-bank-momo-fields
export default function SchoolPayoutSettingsPage() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeMembership } = useActiveMembership() as any;
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } =
    useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";
  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = useMemo(
    () =>
      cleanId(openWorkspace?.schoolId) ||
      cleanId(openWorkspace?.membership?.schoolId) ||
      cleanId(openWorkspace?.membership?.school?.id) ||
      cleanId(activeMembership?.schoolId) ||
      cleanId(activeMembership?.school?.id) ||
      cleanId(activeSchoolId) ||
      cleanId(activeSchool?.id) ||
      cleanId(settings?.schoolId) ||
      cleanId(safeStorageRead("activeSchoolId")),
    [
      activeMembership?.school?.id,
      activeMembership?.schoolId,
      activeSchool?.id,
      activeSchoolId,
      openWorkspace?.membership?.school?.id,
      openWorkspace?.membership?.schoolId,
      openWorkspace?.schoolId,
      settings?.schoolId,
    ],
  );

  const branchId = useMemo(
    () =>
      cleanId(openWorkspace?.branchId) ||
      cleanId(openWorkspace?.membership?.branchId) ||
      cleanId(openWorkspace?.membership?.schoolBranchId) ||
      cleanId(openWorkspace?.membership?.branch?.id) ||
      cleanId(activeMembership?.branchId) ||
      cleanId(activeMembership?.schoolBranchId) ||
      cleanId(activeMembership?.branch?.id) ||
      cleanId(activeBranchId) ||
      cleanId(activeBranch?.id) ||
      cleanId(settings?.branchId) ||
      cleanId(safeStorageRead("activeBranchId")),
    [
      activeBranch?.id,
      activeBranchId,
      activeMembership?.branch?.id,
      activeMembership?.branchId,
      activeMembership?.schoolBranchId,
      openWorkspace?.branchId,
      openWorkspace?.membership?.branch?.id,
      openWorkspace?.membership?.branchId,
      openWorkspace?.membership?.schoolBranchId,
      settings?.branchId,
    ],
  );

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [form, setForm] = useState<PayoutForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function load() {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const settingRows = await listActiveLocal<AnyRow>(
        "schoolPayoutSettings" as any,
      ).catch(() => []);
      const scoped = settingRows.filter((row) =>
        sameScope(row, accountId, schoolId, branchId),
      );
      const current = scoped[0];

      setRows(scoped);
      setForm(
        current
          ? {
              id: cleanId(idOf(current)),
              settlementMode: current.settlementMode || "platform_wallet",
              preferredMethod: current.preferredMethod || "bank",
              bankName: text(current.bankName),
              bankAccountName: text(current.bankAccountName),
              bankAccountNumber: text(current.bankAccountNumber),
              momoNetwork: text(current.momoNetwork, "mtn"),
              momoNumber: text(current.momoNumber),
              momoName: text(current.momoName),
              paystackSubaccountCode: text(current.paystackSubaccountCode),
              settlementSchedule: current.settlementSchedule || "manual",
              contactEmail: text(current.contactEmail),
              contactPhone: text(current.contactPhone),
              active: current.active !== false,
              note: text(current.note),
            }
          : emptyForm,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    activeMembership?.role,
    activeMembership?.schoolId,
    activeMembership?.branchId,
    activeMembership?.schoolBranchId,
    openWorkspace?.openedAt,
    openWorkspace?.membershipId,
    dataRevision,
  ]);

  const status = useMemo(() => {
    if (!form.active) return "inactive";
    if (form.paystackSubaccountCode) return "verified";
    return "active";
  }, [form.active, form.paystackSubaccountCode]);

  const preview = useMemo(() => destinationLabel(form), [form]);

  async function save() {
    if (!accountId || !schoolId || !branchId) return;

    if (
      form.preferredMethod === "bank" &&
      (!form.bankName || !form.bankAccountName || !form.bankAccountNumber)
    ) {
      return setMessage("Enter bank name, account name and account number.");
    }

    if (
      form.preferredMethod === "momo" &&
      (!form.momoNetwork || !form.momoNumber || !form.momoName)
    ) {
      return setMessage("Enter momo network, momo name and momo number.");
    }

    setSaving(true);

    try {
      const payload = {
        accountId: String(accountId),
        schoolId,
        branchId,
        ...form,
        active: form.active,
        status,
        isDeleted: false,
      } as AnyRow;

      if (form.id)
        await updateLocal("schoolPayoutSettings" as any, form.id, payload);
      else await createLocal("schoolPayoutSettings" as any, payload);

      setMessage("");
      await load();
    } catch (e: any) {
      setMessage(e?.message || "Failed to save payout settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return (
      <State
        primary={primary}
        title="Opening payout settings..."
        text="Loading branch payout destination."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State primary={primary} title="Redirecting..." text="Sign in first." />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <State
        primary={primary}
        title="Select branch context"
        text="Payout settings are branch-scoped."
      />
    );
  }

  return (
    <main
      className="ps-page"
      style={{ "--ps-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section className="ps-search-card" aria-label="Payout settings actions">
        <span
          className={`status-dot-mini ${status === "inactive" ? "gray" : "green"}`}
        />

        <label className="ps-search">
          <span>{form.preferredMethod === "bank" ? "🏦" : "📱"}</span>
          <input
            value={`${preview} · ${status}`}
            readOnly
            aria-label="Current payout destination"
          />
        </label>

        <button
          type="button"
          className="ps-add-inline"
          onClick={save}
          disabled={saving}
        >
          {saving ? "..." : "Save"}
        </button>

        <button
          type="button"
          className="ps-filter-button"
          onClick={load}
          title="Refresh"
          aria-label="Refresh payout settings"
        >
          ↻
        </button>

        <button
          type="button"
          className="ps-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {message ? (
        <section className="ps-inline-error">{message}</section>
      ) : null}

      <section className="ps-form-card">
        <div className="ps-method-toggle">
          <button
            type="button"
            className={form.preferredMethod === "bank" ? "active" : ""}
            onClick={() => setForm({ ...form, preferredMethod: "bank" })}
          >
            🏦 Bank
          </button>
          <button
            type="button"
            className={form.preferredMethod === "momo" ? "active" : ""}
            onClick={() => setForm({ ...form, preferredMethod: "momo" })}
          >
            📱 Momo
          </button>
        </div>

        <div className="ps-form-grid">
          {form.preferredMethod === "bank" ? (
            <>
              <label>
                <span>Bank Name</span>
                <input
                  value={form.bankName}
                  onChange={(event) =>
                    setForm({ ...form, bankName: event.target.value })
                  }
                  placeholder="e.g. GCB Bank"
                />
              </label>

              <label>
                <span>Account Name</span>
                <input
                  value={form.bankAccountName}
                  onChange={(event) =>
                    setForm({ ...form, bankAccountName: event.target.value })
                  }
                  placeholder="Account holder"
                />
              </label>

              <label>
                <span>Account Number</span>
                <input
                  value={form.bankAccountNumber}
                  onChange={(event) =>
                    setForm({ ...form, bankAccountNumber: event.target.value })
                  }
                  placeholder="Bank account number"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Momo Network</span>
                <select
                  value={form.momoNetwork}
                  onChange={(event) =>
                    setForm({ ...form, momoNetwork: event.target.value })
                  }
                >
                  <option value="mtn">MTN</option>
                  <option value="telecel">Telecel</option>
                  <option value="airteltigo">AirtelTigo</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                <span>Momo Name</span>
                <input
                  value={form.momoName}
                  onChange={(event) =>
                    setForm({ ...form, momoName: event.target.value })
                  }
                  placeholder="Registered momo name"
                />
              </label>

              <label>
                <span>Momo Number</span>
                <input
                  value={form.momoNumber}
                  onChange={(event) =>
                    setForm({ ...form, momoNumber: event.target.value })
                  }
                  placeholder="Momo number"
                />
              </label>
            </>
          )}
        </div>

        <div className="ps-actions">
          <button type="button" onClick={() => setMoreOpen(true)}>
            Advanced
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving..." : "Save Payout Settings"}
          </button>
        </div>
      </section>

      {moreOpen ? (
        <More
          form={form}
          setForm={setForm}
          status={status}
          rows={rows}
          close={() => setMoreOpen(false)}
          refresh={load}
        />
      ) : null}
    </main>
  );
}

function More({
  form,
  setForm,
  status,
  rows,
  close,
  refresh,
}: {
  form: PayoutForm;
  setForm: React.Dispatch<React.SetStateAction<PayoutForm>>;
  status: string;
  rows: AnyRow[];
  close: () => void;
  refresh: () => void;
}) {
  return (
    <div className="ps-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ps-sheet small">
        <div className="ps-sheet-head">
          <div>
            <h2>Advanced</h2>
            <p>Settlement, subaccount, status and contact details.</p>
          </div>
          <button type="button" onClick={close}>
            ✕
          </button>
        </div>

        <section className="ps-mini-info">
          <article>
            <span>Status</span>
            <b>{status}</b>
          </article>
          <article>
            <span>Records</span>
            <b>{rows.length}</b>
          </article>
          <article>
            <span>Subaccount</span>
            <b>{form.paystackSubaccountCode ? "Set" : "Not set"}</b>
          </article>
        </section>

        <div className="ps-form-grid sheet">
          <label>
            <span>Settlement Mode</span>
            <select
              value={form.settlementMode}
              onChange={(event) =>
                setForm({
                  ...form,
                  settlementMode: event.target
                    .value as PayoutForm["settlementMode"],
                })
              }
            >
              <option value="platform_wallet">Platform wallet first</option>
              <option value="direct_subaccount">
                Direct Paystack subaccount
              </option>
            </select>
          </label>

          <label>
            <span>Settlement Schedule</span>
            <select
              value={form.settlementSchedule}
              onChange={(event) =>
                setForm({
                  ...form,
                  settlementSchedule: event.target
                    .value as PayoutForm["settlementSchedule"],
                })
              }
            >
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>

          <label className="wide">
            <span>Paystack Subaccount Code</span>
            <input
              value={form.paystackSubaccountCode}
              onChange={(event) =>
                setForm({ ...form, paystackSubaccountCode: event.target.value })
              }
              placeholder="ACCT_xxx"
            />
          </label>

          <label>
            <span>Contact Email</span>
            <input
              value={form.contactEmail}
              onChange={(event) =>
                setForm({ ...form, contactEmail: event.target.value })
              }
              placeholder="finance@email.com"
            />
          </label>

          <label>
            <span>Contact Phone</span>
            <input
              value={form.contactPhone}
              onChange={(event) =>
                setForm({ ...form, contactPhone: event.target.value })
              }
              placeholder="024..."
            />
          </label>

          <label>
            <span>Status</span>
            <select
              value={form.active ? "active" : "inactive"}
              onChange={(event) =>
                setForm({ ...form, active: event.target.value === "active" })
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <label className="wide">
            <span>Note</span>
            <textarea
              value={form.note}
              onChange={(event) =>
                setForm({ ...form, note: event.target.value })
              }
              placeholder="Optional note for payout review"
            />
          </label>
        </div>

        <div className="ps-sheet-actions">
          <button
            type="button"
            onClick={() => {
              refresh();
              close();
            }}
          >
            Refresh
          </button>
          <button type="button" className="primary" onClick={close}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}
.ps-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ps-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}
.ps-page *,.ps-page *::before,.ps-page *::after{box-sizing:border-box;min-width:0}
.ps-page button,.ps-page input,.ps-page select,.ps-page textarea{font:inherit;max-width:100%}
.ps-page button{-webkit-tap-highlight-color:transparent}
.ps-page input,.ps-page select,.ps-page textarea{width:100%;min-height:40px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:15px;padding:0 11px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}
.ps-page textarea{min-height:82px;padding:11px;resize:vertical;line-height:1.45}
.ps-page input:focus,.ps-page select:focus,.ps-page textarea:focus{border-color:color-mix(in srgb,var(--ps-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ps-primary) 12%,transparent)}
.ps-state,.ps-search-card,.ps-form-card,.ps-sheet{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ps-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}
.ps-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ps-primary) 18%,transparent);border-top-color:var(--ps-primary);animation:spin .8s linear infinite}
.ps-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}
.ps-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}
.ps-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}
.ps-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:42px;padding:0 10px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.ps-search span{font-size:16px}
.ps-search input{min-height:40px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:13px}
.ps-icon-button,.ps-filter-button,.ps-add-inline{width:40px;height:40px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:17px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}
.ps-add-inline{width:auto;min-width:52px;padding:0 12px;border-color:var(--ps-primary);background:var(--ps-primary);color:#fff;font-size:12px;box-shadow:0 12px 28px color-mix(in srgb,var(--ps-primary) 22%,transparent)}
.ps-add-inline:disabled{opacity:.65;cursor:not-allowed}
.ps-filter-button{background:color-mix(in srgb,var(--ps-primary) 8%,var(--card-bg,#fff));color:var(--ps-primary)}
.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}
.status-dot-mini.green{background:#22c55e}
.status-dot-mini.gray{background:var(--muted,#64748b)}
.ps-inline-error{max-width:760px;margin:10px auto 0;padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;background:rgba(239,68,68,.12);color:#991b1b}
.ps-compact-status{max-width:760px;margin:9px auto 0;display:flex;align-items:center;gap:7px;overflow-x:auto;padding:0 1px}
.ps-compact-status>span{flex:0 0 auto;font-size:11px;font-weight:1000;color:var(--muted,#64748b);text-transform:uppercase;letter-spacing:.07em}
.ps-compact-status small{flex:0 0 auto;color:var(--muted,#64748b);font-size:11px;font-weight:800}
.ps-chip{max-width:100%;display:inline-flex;align-items:center;min-height:23px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}
.ps-chip.green{background:rgba(34,197,94,.12);color:#16a34a}
.ps-chip.red{background:rgba(239,68,68,.12);color:#dc2626}
.ps-chip.orange{background:rgba(245,158,11,.14);color:#b45309}
.ps-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}
.ps-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}
.ps-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}
.ps-form-card{max-width:720px;margin:8px auto 0;padding:8px;border-radius:22px;display:grid;gap:8px}
.ps-method-toggle{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--ps-primary) 8%,transparent);border:1px solid var(--border,rgba(0,0,0,.10))}
.ps-method-toggle button{min-height:34px;border:0;border-radius:999px;background:transparent;color:var(--muted,#64748b);font-size:11px;font-weight:1000;cursor:pointer}
.ps-method-toggle button.active{background:var(--ps-primary);color:#fff;box-shadow:0 10px 22px color-mix(in srgb,var(--ps-primary) 20%,transparent)}
.ps-form-grid{display:grid;grid-template-columns:1fr;gap:7px}
.ps-form-grid.sheet{margin-top:10px}
.ps-form-grid label{display:grid;gap:5px}
.ps-form-grid label.wide{grid-column:1/-1}
.ps-form-grid span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.07em}
.ps-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.ps-actions button,.ps-sheet-actions button{min-height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 14px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}
.ps-actions button.primary,.ps-sheet-actions button.primary{border-color:var(--ps-primary);background:var(--ps-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ps-primary) 25%,transparent)}
.ps-actions button:disabled{opacity:.65;cursor:not-allowed}
.ps-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}
.ps-sheet{width:min(620px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}
.ps-sheet.small{width:min(520px,100%)}
@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}
.ps-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:10px}
.ps-sheet-head h2{margin:0;color:var(--text,#111827);font-size:20px;font-weight:1000;letter-spacing:-.05em}
.ps-sheet-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.45;font-weight:750}
.ps-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}
.ps-mini-info{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
.ps-mini-info article{padding:9px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);border:1px solid var(--border,rgba(0,0,0,.08))}
.ps-mini-info span{display:block;color:var(--muted,#64748b);font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.07em}
.ps-mini-info b{display:block;margin-top:4px;font-size:12px;font-weight:1000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:capitalize}
.ps-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}
@media (min-width:680px){.ps-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ps-search-card{grid-template-columns:auto minmax(0,1fr) auto 44px 44px;max-width:760px;margin-left:auto;margin-right:auto}.ps-form-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ps-form-grid.sheet{grid-template-columns:repeat(2,minmax(0,1fr))}.ps-sheet-backdrop{place-items:center;padding:18px}.ps-sheet{border-radius:28px;padding:18px}}
@media (max-width:520px){.ps-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ps-search-card{gap:6px}.ps-icon-button,.ps-filter-button{width:39px;height:39px}.ps-add-inline{min-width:49px}.ps-actions,.ps-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ps-actions button,.ps-sheet-actions button{width:100%}.ps-mini-info{grid-template-columns:1fr}}
`;
