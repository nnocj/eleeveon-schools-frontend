"use client";

/**
 * permissions.tsx
 * ---------------------------------------------------------
 * ACCOUNT PERMISSION MATRIX
 * ---------------------------------------------------------
 *
 * Updated for the new access architecture:
 * - Backend remains source of truth through /permissions/matrix.
 * - Matrix is also cached into local Dexie permissionRules for offline access.
 * - If the backend cannot load, local cached permissionRules are used.
 * - Role columns still match the Prisma PermissionRule fields:
 *   owner, admin, branch, teacher, student, parent, accountant.
 */

import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/api/apiClient";
import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { db } from "../lib/db";

type RoleKey =
  | "owner"
  | "admin"
  | "branch"
  | "teacher"
  | "student"
  | "parent"
  | "accountant";

type PermissionValue =
  | "yes"
  | "no"
  | "limited"
  | "own"
  | "view"
  | "class"
  | "children"
  | "pay/view";

type PermissionRule = {
  id?: string;
  accountId?: string;
  moduleKey: string;
  moduleLabel: string;
  owner: string;
  admin: string;
  branch: string;
  teacher: string;
  student: string;
  parent: string;
  accountant: string;
  locked?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const columns: readonly [RoleKey, string, string][] = [
  ["owner", "Owner", "Super admin / account owner"],
  ["admin", "School Admin", "School-level administrator"],
  ["branch", "Branch Admin", "Branch-level administrator"],
  ["accountant", "Accountant", "Finance and payment access"],
  ["teacher", "Teacher", "Teacher portal access"],
  ["student", "Student", "Student portal access"],
  ["parent", "Parent", "Parent portal access"],
] as const;

const valueOptions: PermissionValue[] = [
  "yes",
  "no",
  "limited",
  "own",
  "view",
  "class",
  "children",
  "pay/view",
];

const valueLabels: Record<string, string> = {
  yes: "Full access",
  no: "No access",
  limited: "Limited",
  own: "Own records only",
  view: "View only",
  class: "Assigned class",
  children: "Linked children",
  "pay/view": "Pay / view",
};

function normalizeRule(rule: PermissionRule, accountId?: string | null): PermissionRule {
  return {
    ...rule,
    id: rule.id || `${accountId || "local"}:${rule.moduleKey}`,
    accountId: rule.accountId || accountId || undefined,
    owner: rule.owner || "yes",
    admin: rule.admin || "no",
    branch: rule.branch || "no",
    teacher: rule.teacher || "no",
    student: rule.student || "no",
    parent: rule.parent || "no",
    accountant: rule.accountant || "no",
    locked: Boolean(rule.locked),
  };
}

async function cacheRules(accountId: string | null | undefined, rows: PermissionRule[]) {
  if (!accountId) return;

  const table = (db as any).permissionRules;
  if (!table?.bulkPut) return;

  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    ...normalizeRule(row, accountId),
    accountId,
    updatedAt: row.updatedAt || now,
  }));

  await table.bulkPut(payload);
}

async function readCachedRules(accountId: string | null | undefined): Promise<PermissionRule[]> {
  if (!accountId) return [];

  const table = (db as any).permissionRules;
  if (!table?.toArray) return [];

  const rows = (await table.toArray()) as PermissionRule[];
  return rows
    .filter((row) => row.accountId === accountId)
    .map((row) => normalizeRule(row, accountId))
    .sort((a, b) => a.moduleLabel.localeCompare(b.moduleLabel));
}

export default function PermissionsPage() {
  const { settings } = useSettings();
  const { user, accountId } = useAccount();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const editable = user?.role === "super_admin";

  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<"cloud" | "local" | "empty">("empty");

  const load = async () => {
    try {
      setLoading(true);

      const rows = await apiClient<PermissionRule[]>("/permissions/matrix");
      const normalized = (rows || []).map((row) => normalizeRule(row, accountId));

      setRules(normalized);
      setSource("cloud");
      await cacheRules(accountId, normalized);
    } catch (error: any) {
      const cached = await readCachedRules(accountId);

      if (cached.length) {
        setRules(cached);
        setSource("local");
      } else {
        setRules([]);
        setSource("empty");
        alert(error?.message || "Failed to load permissions");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const stats = useMemo(() => {
    return {
      modules: rules.length,
      editable: rules.filter((rule) => !rule.locked).length,
      locked: rules.filter((rule) => rule.locked).length,
      allowed: rules.reduce(
        (sum, rule) =>
          sum + columns.filter(([key]) => rule[key] && rule[key] !== "no").length,
        0
      ),
    };
  }, [rules]);

  const updateRule = (moduleKey: string, role: RoleKey, value: string) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.moduleKey === moduleKey ? { ...rule, [role]: value } : rule
      )
    );
  };

  const save = async () => {
    if (!editable) return;

    try {
      setSaving(true);

      const rows = await apiClient<PermissionRule[]>("/permissions/matrix", {
        method: "PATCH",
        body: { rules },
      });

      const normalized = (rows || []).map((row) => normalizeRule(row, accountId));
      setRules(normalized);
      setSource("cloud");
      await cacheRules(accountId, normalized);
      alert("Permissions saved successfully");
    } catch (error: any) {
      await cacheRules(accountId, rules);
      setSource("local");
      alert(error?.message || "Failed to save permissions online. Local cache was updated.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="perm-page" style={{ "--perm-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="perm-state">Loading permissions...</section>
      </main>
    );
  }

  return (
    <main className="perm-page" style={{ "--perm-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="perm-hero">
        <div>
          <p>Access Control</p>
          <h2>Permissions</h2>
          <span>
            This matrix controls what each portal can expose for this account. Permission rules are cached locally for offline checks.
          </span>
          <div className="perm-chip-row">
            <span className={`perm-source ${source}`}>{source === "cloud" ? "Cloud synced" : source === "local" ? "Local cache" : "No rules"}</span>
            {!editable && <span className="perm-source locked">Read only</span>}
          </div>
        </div>

        <div className="perm-actions">
          <button type="button" className="light" onClick={load} disabled={saving}>
            Refresh
          </button>

          {editable && (
            <button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Permissions"}
            </button>
          )}
        </div>
      </section>

      <section className="perm-summary">
        <div>
          <strong>{stats.modules}</strong>
          <span>Modules</span>
        </div>
        <div>
          <strong>{stats.editable}</strong>
          <span>Editable</span>
        </div>
        <div>
          <strong>{stats.locked}</strong>
          <span>Locked</span>
        </div>
        <div>
          <strong>{stats.allowed}</strong>
          <span>Allowed Cells</span>
        </div>
      </section>

      <section className="perm-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Module</th>
              {columns.map(([key, label, title]) => (
                <th key={key} title={title}>{label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rules.map((row) => (
              <tr key={row.moduleKey}>
                <td>
                  <strong>{row.moduleLabel}</strong>
                  <span>{row.moduleKey}</span>
                  {row.locked && <small>Locked</small>}
                </td>

                {columns.map(([key]) => (
                  <td key={key}>
                    {editable && !row.locked && key !== "owner" ? (
                      <select
                        value={row[key] || "no"}
                        onChange={(event) =>
                          updateRule(row.moduleKey, key, event.target.value)
                        }
                        title={valueLabels[row[key]] || row[key]}
                      >
                        {valueOptions.map((option) => (
                          <option key={option} value={option}>
                            {valueLabels[option] || option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      render(row[key])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {!rules.length && (
          <section className="perm-empty">
            <h3>No permission rules found</h3>
            <p>Refresh after your backend seeds the permission matrix for this account.</p>
          </section>
        )}
      </section>
    </main>
  );
}

function render(value: string) {
  if (value === "yes") return <span className="yes">✓</span>;
  if (value === "no") return <span className="no">—</span>;
  return <span className="limited">{valueLabels[value] || value}</span>;
}

const css = `
.perm-page{display:grid;gap:10px;color:var(--text,#0f172a)}
.perm-hero,.perm-table-wrap,.perm-state,.perm-summary{background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 14px 34px rgba(15,23,42,.055);border-radius:24px}
.perm-hero{padding:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--perm-primary) 12%,#fff),#fff 65%);display:grid;gap:12px}
.perm-hero p{margin:0;color:var(--perm-primary);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
.perm-hero h2{margin:3px 0 0;font-size:clamp(24px,8vw,36px);font-weight:1000;letter-spacing:-.06em}
.perm-hero span{display:block;margin-top:5px;color:#64748b;font-size:13px;line-height:1.5;font-weight:750}
.perm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.perm-actions button,.perm-hero button{border:0;border-radius:999px;min-height:42px;padding:0 16px;background:var(--perm-primary);color:#fff;font-weight:950;cursor:pointer}
.perm-actions button.light{background:rgba(37,99,235,.1);color:var(--perm-primary)}
.perm-actions button:disabled,.perm-hero button:disabled{opacity:.6;cursor:not-allowed}
.perm-chip-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.perm-source{display:inline-flex;align-items:center;min-height:25px;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:950;background:rgba(59,130,246,.12);color:#2563eb}
.perm-source.cloud{background:rgba(34,197,94,.12);color:#16a34a}
.perm-source.local{background:rgba(245,158,11,.14);color:#b45309}
.perm-source.empty,.perm-source.locked{background:rgba(107,114,128,.12);color:#4b5563}
.perm-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px}
.perm-summary div{min-width:0;border-radius:18px;background:#f8fafc;padding:10px}
.perm-summary strong,.perm-summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.perm-summary strong{font-size:20px;font-weight:1000}
.perm-summary span{margin-top:3px;color:#64748b;font-size:11px;font-weight:850}
.perm-table-wrap{overflow:auto;position:relative}
table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px}
th,td{padding:12px;border-bottom:1px solid rgba(148,163,184,.16);text-align:center;font-size:12px;vertical-align:middle}
th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:#fff;font-weight:950;z-index:1;min-width:230px}
th{color:#475569;text-transform:uppercase;font-size:10px;letter-spacing:.06em;background:#fff;position:sticky;top:0;z-index:2}
th:first-child{z-index:3}
td:first-child strong,td:first-child span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
td:first-child strong{font-size:13px;color:#0f172a}
td:first-child span{margin-top:3px;color:#94a3b8;font-size:10px;font-weight:850}
td:first-child small{display:inline-flex;margin-top:5px;border-radius:999px;background:rgba(100,116,139,.12);color:#64748b;padding:4px 7px;font-size:9px;text-transform:uppercase}
.yes,.no,.limited{display:inline-flex;align-items:center;justify-content:center;min-height:26px;border-radius:999px;padding:4px 8px;font-weight:950}
.yes{background:rgba(34,197,94,.12);color:#16a34a}
.no{background:rgba(100,116,139,.1);color:#94a3b8}
.limited{background:rgba(245,158,11,.14);color:#b45309;font-size:10px;text-transform:uppercase;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
select{width:100%;min-width:110px;border:1px solid rgba(148,163,184,.28);border-radius:999px;background:#fff;padding:7px 8px;font-size:11px;font-weight:850;color:#0f172a}
.perm-state{padding:24px;text-align:center;color:#64748b;font-weight:900}
.perm-empty{padding:28px;text-align:center;color:#64748b}
.perm-empty h3{margin:0;color:#0f172a;font-size:18px;font-weight:1000}
.perm-empty p{margin:6px 0 0;font-size:13px;line-height:1.5}
@media(min-width:760px){.perm-hero{grid-template-columns:minmax(0,1fr) auto;align-items:center}.perm-summary{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;
