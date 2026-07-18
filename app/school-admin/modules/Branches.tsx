"use client";

/**
 * app/school-admin/modules/Branches.tsx
 * ---------------------------------------------------------
 * SCHOOL ADMIN — BRANCHES
 * ---------------------------------------------------------
 *
 * School-scoped branch management.
 *
 * School admin can:
 * - View all branches under the assigned school.
 * - Create/edit branch details.
 * - Activate/deactivate branches.
 * - Search/filter branches.
 * - Switch between card, table and analytics views.
 *
 * School admin cannot:
 * - Switch to another school from here.
 * - Create branches outside the assigned school.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import { db } from "../../lib/db/db";

// ======================================================
// TYPES
// ======================================================

type ViewMode = "cards" | "table" | "analytics";
type BranchFilter = "all" | "active" | "inactive";

type Branch = {
  id?: number;
  localId?: number;
  cloudId?: string | null;
  accountId?: string | null;
  schoolId?: number | null;
  branchId?: number | null;

  name?: string;
  code?: string;
  location?: string;
  address?: string;
  phone?: string;
  email?: string;
  headName?: string;
  headPhone?: string;
  headEmail?: string;

  active?: boolean;
  status?: string;
  isDeleted?: boolean;

  createdAt?: number;
  updatedAt?: number;
  version?: number;
  deviceId?: string;
  synced?: any;
};

type School = {
  id?: number;
  name?: string;
  accountId?: string | null;
  active?: boolean;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  name: string;
  code: string;
  location: string;
  address: string;
  phone: string;
  email: string;
  headName: string;
  headPhone: string;
  headEmail: string;
  active: boolean;
};

type Breakdown = {
  name: string;
  count: number;
};

// ======================================================
// CONSTANTS
// ======================================================

const DEFAULT_FORM: FormState = {
  name: "",
  code: "",
  location: "",
  address: "",
  phone: "",
  email: "",
  headName: "",
  headPhone: "",
  headEmail: "",
  active: true,
};

// ======================================================
// HELPERS
// ======================================================

const now = () => Date.now();

function normalizeText(value?: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value?: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\d+()\-\s]/g, "");
}

function sameSchool(row: Branch, accountId?: string | null, schoolId?: number | null) {
  if (!row || row.isDeleted) return false;
  return (
    (row.accountId || accountId) === accountId &&
    Number(row.schoolId ?? schoolId) === Number(schoolId)
  );
}

function initials(name: string) {
  return String(name || "B")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "B";
}

function branchCodeFromName(name: string) {
  const clean = normalizeText(name);
  if (!clean) return "";

  const letters = clean
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .replace(/[^A-Z0-9]/g, "");

  return letters.slice(0, 6) || clean.slice(0, 3).toUpperCase();
}

function formatDate(value?: number) {
  if (!value) return "Not recorded";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Not recorded";
  }
}

// ======================================================
// COMPONENT
// ======================================================

export default function Branches() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [school, setSchool] = useState<School | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filter, setFilter] = useState<BranchFilter>("all");
  const [search, setSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [message, setMessage] = useState("");

  // ======================================================
  // AUTH
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId && !settings?.schoolId) {
      router.replace("/owner");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    settings?.schoolId,
    router,
  ]);

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    if (!authenticated || !accountId || !schoolId) {
      setBranches([]);
      setSchool(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [schoolRows, branchRows] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
      ]);

      const currentSchool =
        schoolRows.find((row: School) => row.id === Number(schoolId) && row.accountId === accountId && !row.isDeleted) ||
        activeSchool ||
        null;

      const scopedBranches = branchRows
        .filter((row: Branch) => sameSchool(row, accountId, Number(schoolId)))
        .sort((a: Branch, b: Branch) => String(a.name || "").localeCompare(String(b.name || "")));

      setSchool(currentSchool as School | null);
      setBranches(scopedBranches as Branch[]);
    } catch (error) {
      console.error("Failed to load branches:", error);
      alert("Failed to load school branches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId]);

  // ======================================================
  // DERIVED
  // ======================================================

  const filteredBranches = useMemo(() => {
    const query = search.trim().toLowerCase();

    return branches.filter((branch) => {
      const active = branch.active !== false && branch.status !== "inactive";

      if (filter === "active" && !active) return false;
      if (filter === "inactive" && active) return false;

      if (!query) return true;

      return `
        ${branch.name}
        ${branch.code}
        ${branch.location}
        ${branch.address}
        ${branch.phone}
        ${branch.email}
        ${branch.headName}
        ${branch.headPhone}
        ${branch.headEmail}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [branches, filter, search]);

  const summary = useMemo(() => {
    const active = branches.filter((branch) => branch.active !== false && branch.status !== "inactive").length;
    const inactive = branches.length - active;
    const withHead = branches.filter((branch) => normalizeText(branch.headName)).length;
    const withContact = branches.filter((branch) => normalizeText(branch.phone) || normalizeEmail(branch.email)).length;

    return {
      total: branches.length,
      active,
      inactive,
      withHead,
      withContact,
      missingContact: branches.length - withContact,
    };
  }, [branches]);

  const statusBreakdown = useMemo<Breakdown[]>(() => {
    return [
      { name: "Active", count: summary.active },
      { name: "Inactive", count: summary.inactive },
      { name: "With Branch Head", count: summary.withHead },
      { name: "Missing Contact", count: summary.missingContact },
    ].filter((item) => item.count > 0);
  }, [summary]);

  const locationBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, number>();

    branches.forEach((branch) => {
      const location = normalizeText(branch.location) || "No location";
      map.set(location, (map.get(location) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [branches]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => {
      const next = {
        ...current,
        [key]: value,
      };

      if (key === "name" && !current.code.trim()) {
        next.code = branchCodeFromName(String(value));
      }

      return next;
    });

    setMessage("");
  };

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setMessage("");
    setDrawerOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setForm({
      id: branch.id,
      name: branch.name || "",
      code: branch.code || "",
      location: branch.location || "",
      address: branch.address || "",
      phone: branch.phone || "",
      email: branch.email || "",
      headName: branch.headName || "",
      headPhone: branch.headPhone || "",
      headEmail: branch.headEmail || "",
      active: branch.active !== false && branch.status !== "inactive",
    });

    setMessage("");
    setDrawerOpen(true);
  };

  const validate = () => {
    if (!form.name.trim()) return "Branch name is required.";

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Please enter a valid branch email address.";
    }

    if (form.headEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.headEmail.trim())) {
      return "Please enter a valid branch head email address.";
    }

    const duplicate = branches.find((branch) => {
      if (form.id && branch.id === form.id) return false;
      return (
        normalizeText(branch.name).toLowerCase() === normalizeText(form.name).toLowerCase() ||
        Boolean(form.code && branch.code && branch.code.toLowerCase() === form.code.toLowerCase())
      );
    });

    if (duplicate) return "A branch with this name or code already exists.";

    return "";
  };

  const saveBranch = async () => {
    const error = validate();

    if (error) {
      setMessage(error);
      return;
    }

    if (!accountId || !schoolId) {
      setMessage("Assigned school context is required.");
      return;
    }

    try {
      setSaving(true);

      const payload: Partial<Branch> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: form.id,
        name: normalizeText(form.name),
        code: normalizeText(form.code) || branchCodeFromName(form.name),
        location: normalizeText(form.location) || undefined,
        address: normalizeText(form.address) || undefined,
        phone: normalizePhone(form.phone) || undefined,
        email: normalizeEmail(form.email) || undefined,
        headName: normalizeText(form.headName) || undefined,
        headPhone: normalizePhone(form.headPhone) || undefined,
        headEmail: normalizeEmail(form.headEmail) || undefined,
        active: form.active,
        status: form.active ? "active" : "inactive",
        isDeleted: false,
        updatedAt: now(),
        synced: "pending" as any,
      };

      if (form.id) {
        const existing = branches.find((branch) => branch.id === form.id);

        await db.branches.update(form.id, {
          ...payload,
          version: Number(existing?.version || 0) + 1,
        } as any);
      } else {
        const id = await db.branches.add({
          ...payload,
          branchId: undefined,
          createdAt: now(),
          version: 1,
        } as any);

        await db.branches.update(Number(id), {
          branchId: Number(id),
          updatedAt: now(),
        } as any);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save branch:", error);
      setMessage("Failed to save branch. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleBranch = async (branch: Branch) => {
    if (!branch.id) return;

    try {
      const nextActive = !(branch.active !== false && branch.status !== "inactive");

      await db.branches.update(branch.id, {
        active: nextActive,
        status: nextActive ? "active" : "inactive",
        updatedAt: now(),
        version: Number(branch.version || 0) + 1,
        synced: "pending" as any,
      } as any);

      await load();
    } catch (error) {
      console.error("Failed to update branch status:", error);
      alert("Failed to update branch status.");
    }
  };

  // ======================================================
  // STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="sbranches-page" style={{ "--sbranches-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbranches-state-card">
          <div className="sbranches-spinner" />
          <h2>Opening branches...</h2>
          <p>Loading school branches and coverage details.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sbranches-page" style={{ "--sbranches-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbranches-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing branches.</p>
        </section>
      </main>
    );
  }

  if (!schoolId) {
    return (
      <main className="sbranches-page" style={{ "--sbranches-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbranches-state-card">
          <h2>Assigned school required</h2>
          <p>Branches must be managed inside a locked school context.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="sbranches-page" style={{ "--sbranches-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sbranches-hero">
        <div className="sbranches-hero-left">
          <div className="sbranches-hero-icon">🏫</div>
          <div className="sbranches-title-wrap">
            <p>School Overview</p>
            <h2>Branches</h2>
            <span>{school?.name || activeSchool?.name || "Assigned school"} · School scoped</span>
          </div>
        </div>

        <div className="sbranches-hero-actions">
          <button type="button" className="sbranches-ghost-btn" onClick={load}>
            Refresh
          </button>
          <button type="button" className="sbranches-primary-btn" onClick={openCreate}>
            Add Branch
          </button>
        </div>
      </section>

      <section className="sbranches-context-grid">
        <article>
          <div className="sbranches-context-icon">🔒</div>
          <div>
            <span>Locked School</span>
            <strong>{school?.name || activeSchool?.name || "Assigned school"}</strong>
            <p>School admin manages only branches under the assigned school.</p>
          </div>
        </article>

        <article>
          <div className="sbranches-context-icon">📍</div>
          <div>
            <span>Branch Coverage</span>
            <strong>{summary.active} active branch(es)</strong>
            <p>Use this page to keep branch contact and location records clean.</p>
          </div>
        </article>
      </section>

      <section className="sbranches-summary-grid">
        <SummaryCard label="Total Branches" value={summary.total} icon="🏫" />
        <SummaryCard label="Active" value={summary.active} icon="✅" positive />
        <SummaryCard label="Inactive" value={summary.inactive} icon="⛔" warning={summary.inactive > 0} />
        <SummaryCard label="With Head" value={summary.withHead} icon="👤" />
        <SummaryCard label="With Contact" value={summary.withContact} icon="☎️" positive={summary.withContact > 0} />
        <SummaryCard label="Missing Contact" value={summary.missingContact} icon="⚠️" warning={summary.missingContact > 0} />
      </section>

      <section className="sbranches-toolbar">
        <div className="sbranches-view-tabs">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            Cards
          </button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Table
          </button>
          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
            Analytics
          </button>
        </div>

        <Chip tone="gray">{filteredBranches.length} branch(es)</Chip>
      </section>

      <section className="sbranches-filter-card">
        <input
          placeholder="Search branch name, code, location, contact..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filter} onChange={(event) => setFilter(event.target.value as BranchFilter)}>
          <option value="all">All Branches</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>

        <button type="button" onClick={openCreate}>
          Add Branch
        </button>
      </section>

      {viewMode === "analytics" && (
        <>
          <Breakdown title="Branch Status" items={statusBreakdown} />
          <Breakdown title="Branches by Location" items={locationBreakdown} />
        </>
      )}

      {viewMode === "table" && (
        <section className="sbranches-table-card">
          <div className="sbranches-section-head">
            <div>
              <p>Branch Register</p>
              <h3>School Branches</h3>
            </div>
            <Chip tone="blue">School Scoped</Chip>
          </div>

          <div className="sbranches-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Code</th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th>Branch Head</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredBranches.map((branch) => {
                  const active = branch.active !== false && branch.status !== "inactive";

                  return (
                    <tr key={branch.id || branch.name}>
                      <td>
                        <strong>{branch.name || "Unnamed branch"}</strong>
                        <span>{branch.address || "No address"}</span>
                      </td>
                      <td>{branch.code || "-"}</td>
                      <td>{branch.location || "-"}</td>
                      <td>
                        <strong>{branch.phone || "-"}</strong>
                        <span>{branch.email || "No email"}</span>
                      </td>
                      <td>
                        <strong>{branch.headName || "-"}</strong>
                        <span>{branch.headPhone || branch.headEmail || "No head contact"}</span>
                      </td>
                      <td><Chip tone={active ? "green" : "red"}>{active ? "Active" : "Inactive"}</Chip></td>
                      <td>{formatDate(branch.updatedAt || branch.createdAt)}</td>
                      <td>
                        <div className="sbranches-table-actions">
                          <button type="button" onClick={() => openEdit(branch)}>Edit</button>
                          <button type="button" onClick={() => toggleBranch(branch)}>
                            {active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!filteredBranches.length && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyCard text="No branch matches the selected filters." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="sbranches-section">
          <div className="sbranches-section-head">
            <div>
              <p>Branch Register</p>
              <h3>School Branches</h3>
            </div>
            <Chip tone="gray">{filteredBranches.length} branch(es)</Chip>
          </div>

          <div className="sbranches-list">
            {filteredBranches.map((branch) => {
              const active = branch.active !== false && branch.status !== "inactive";

              return (
                <article key={branch.id || branch.name} className="sbranches-card">
                  <div className="sbranches-card-top">
                    <div className="sbranches-avatar">
                      {initials(branch.name || "Branch")}
                    </div>

                    <div className="sbranches-card-main">
                      <h3>{branch.name || "Unnamed branch"}</h3>
                      <p>{branch.location || "No location"} · {branch.code || "No code"}</p>

                      <div className="sbranches-chip-row">
                        <Chip tone={active ? "green" : "red"}>{active ? "Active" : "Inactive"}</Chip>
                        <Chip tone={branch.phone || branch.email ? "blue" : "orange"}>
                          {branch.phone || branch.email ? "Contact ready" : "Missing contact"}
                        </Chip>
                        <Chip tone={branch.headName ? "purple" : "gray"}>
                          {branch.headName ? "Head assigned" : "No branch head"}
                        </Chip>
                      </div>
                    </div>
                  </div>

                  <div className="sbranches-mini-grid">
                    <MiniStat label="Phone" value={branch.phone || "-"} />
                    <MiniStat label="Email" value={branch.email || "-"} />
                    <MiniStat label="Updated" value={formatDate(branch.updatedAt || branch.createdAt)} />
                  </div>

                  <div className="sbranches-detail-box">
                    <strong>{branch.headName || "No branch head recorded"}</strong>
                    <span>{branch.address || "No address recorded"}</span>
                  </div>

                  <div className="sbranches-action-row">
                    <button type="button" onClick={() => openEdit(branch)}>Edit Branch</button>
                    <button type="button" onClick={() => toggleBranch(branch)}>
                      {active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </article>
              );
            })}

            {!filteredBranches.length && (
              <EmptyCard text="No branch matches the selected filters." />
            )}
          </div>
        </section>
      )}

      {drawerOpen && (
        <div className="sbranches-drawer-layer">
          <button type="button" className="sbranches-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="sbranches-drawer">
            <div className="sbranches-drawer-head">
              <div>
                <p>{form.id ? "Edit Branch" : "Add Branch"}</p>
                <h2>Branch Details</h2>
                <span>{school?.name || activeSchool?.name || "Assigned school"}</span>
              </div>

              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            {message && <section className="sbranches-message">{message}</section>}

            <section className="sbranches-form-card">
              <div className="sbranches-section-head">
                <div>
                  <p>Identity</p>
                  <h3>Branch information</h3>
                </div>
              </div>

              <div className="sbranches-form-grid">
                <label>
                  <span>Branch Name</span>
                  <input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    placeholder="Example: East Legon Campus"
                  />
                </label>

                <label>
                  <span>Branch Code</span>
                  <input
                    value={form.code}
                    onChange={(event) => updateForm("code", event.target.value.toUpperCase())}
                    placeholder="Example: ELG"
                  />
                </label>

                <label>
                  <span>Location</span>
                  <input
                    value={form.location}
                    onChange={(event) => updateForm("location", event.target.value)}
                    placeholder="Town / Area"
                  />
                </label>

                <label>
                  <span>Phone</span>
                  <input
                    value={form.phone}
                    onChange={(event) => updateForm("phone", event.target.value)}
                    placeholder="024 000 0000"
                  />
                </label>

                <label>
                  <span>Email</span>
                  <input
                    value={form.email}
                    onChange={(event) => updateForm("email", event.target.value)}
                    placeholder="branch@example.com"
                  />
                </label>

                <label className="wide">
                  <span>Address</span>
                  <input
                    value={form.address}
                    onChange={(event) => updateForm("address", event.target.value)}
                    placeholder="Branch address"
                  />
                </label>
              </div>
            </section>

            <section className="sbranches-form-card">
              <div className="sbranches-section-head">
                <div>
                  <p>Leadership</p>
                  <h3>Branch head contact</h3>
                </div>
              </div>

              <div className="sbranches-form-grid">
                <label>
                  <span>Branch Head Name</span>
                  <input
                    value={form.headName}
                    onChange={(event) => updateForm("headName", event.target.value)}
                    placeholder="Name of branch head"
                  />
                </label>

                <label>
                  <span>Branch Head Phone</span>
                  <input
                    value={form.headPhone}
                    onChange={(event) => updateForm("headPhone", event.target.value)}
                    placeholder="024 000 0000"
                  />
                </label>

                <label className="wide">
                  <span>Branch Head Email</span>
                  <input
                    value={form.headEmail}
                    onChange={(event) => updateForm("headEmail", event.target.value)}
                    placeholder="head@example.com"
                  />
                </label>
              </div>
            </section>

            <section className="sbranches-form-card">
              <label className="sbranches-switch-row">
                <div>
                  <strong>Active branch</strong>
                  <span>Inactive branches remain recorded but should be hidden from active operations.</span>
                </div>

                <button
                  type="button"
                  className={`sbranches-switch ${form.active ? "on" : ""}`}
                  onClick={() => updateForm("active", !form.active)}
                  aria-pressed={form.active}
                >
                  <span />
                </button>
              </label>
            </section>

            <div className="sbranches-drawer-actions">
              <button type="button" className="sbranches-ghost-btn" onClick={() => setDrawerOpen(false)}>
                Cancel
              </button>
              <button type="button" className="sbranches-primary-btn" disabled={saving} onClick={saveBranch}>
                {saving ? "Saving..." : "Save Branch"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({
  label,
  value,
  icon,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`sbranches-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div className="sbranches-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`sbranches-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sbranches-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="sbranches-empty-card">
      <div className="sbranches-empty-icon">🏫</div>
      <h3>No branches found</h3>
      <p>{text}</p>
    </section>
  );
}

function Breakdown({ title, items }: { title: string; items: Breakdown[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="sbranches-section">
      <div className="sbranches-section-head">
        <div>
          <p>Analytics</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{items.length} group(s)</Chip>
      </div>

      <div className="sbranches-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="sbranches-breakdown-card">
            <div className="sbranches-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone="blue">{item.count}</Chip>
            </div>

            <div className="sbranches-bar-track">
              <div style={{ width: `${total ? Math.round((item.count / total) * 100) : 0}%` }} />
            </div>

            <div className="sbranches-chip-row">
              <Chip tone="gray">{total ? Math.round((item.count / total) * 100) : 0}%</Chip>
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available.`} />}
      </div>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes sbranchesSpin { to { transform: rotate(360deg); } }

.sbranches-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--sbranches-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.sbranches-page *,
.sbranches-page *::before,
.sbranches-page *::after {
  box-sizing: border-box;
}

.sbranches-page button,
.sbranches-page input,
.sbranches-page select {
  font: inherit;
  max-width: 100%;
}

.sbranches-page input,
.sbranches-page select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111111));
  outline: none;
  font-weight: 750;
}

.sbranches-page input:focus,
.sbranches-page select:focus {
  border-color: var(--sbranches-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--sbranches-primary) 12%, transparent);
}

.sbranches-page button:disabled {
  opacity: .58;
  cursor: not-allowed;
}

.sbranches-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.sbranches-state-card h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sbranches-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.sbranches-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--sbranches-primary) 18%, transparent);
  border-top-color: var(--sbranches-primary);
  animation: sbranchesSpin .8s linear infinite;
}

.sbranches-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--sbranches-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--sbranches-primary) 7%, var(--card-bg, #fff)) 72%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.sbranches-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.sbranches-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--sbranches-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--sbranches-primary) 28%, transparent);
  font-size: 22px;
}

.sbranches-title-wrap {
  min-width: 0;
}

.sbranches-title-wrap p,
.sbranches-title-wrap h2,
.sbranches-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sbranches-title-wrap p {
  margin: 0 0 2px;
  color: var(--sbranches-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sbranches-title-wrap h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.sbranches-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sbranches-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.sbranches-ghost-btn,
.sbranches-primary-btn,
.sbranches-action-row button,
.sbranches-table-actions button,
.sbranches-drawer-actions button,
.sbranches-filter-card button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
}

.sbranches-ghost-btn,
.sbranches-action-row button,
.sbranches-table-actions button,
.sbranches-filter-card button {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: var(--text, #111111);
}

.sbranches-primary-btn {
  border: 0;
  background: var(--sbranches-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--sbranches-primary) 25%, transparent);
}

.sbranches-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.sbranches-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--sbranches-primary) 10%, var(--card-bg, var(--surface, #fff))), var(--card-bg, var(--surface, #fff)) 70%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.04);
}

.sbranches-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--sbranches-primary);
  color: #fff;
  font-size: 20px;
}

.sbranches-context-grid article > div:last-child {
  min-width: 0;
}

.sbranches-context-grid span {
  display: block;
  color: var(--sbranches-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sbranches-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sbranches-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.sbranches-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.sbranches-summary-card,
.sbranches-toolbar,
.sbranches-filter-card,
.sbranches-table-card,
.sbranches-card,
.sbranches-breakdown-card,
.sbranches-empty-card,
.sbranches-form-card {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.sbranches-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.sbranches-summary-card.positive {
  background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card-bg, var(--surface, #fff)));
}

.sbranches-summary-card.warning {
  background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card-bg, var(--surface, #fff)));
}

.sbranches-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--sbranches-primary) 12%, var(--surface, #fff));
}

.sbranches-summary-card div:last-child {
  min-width: 0;
}

.sbranches-summary-card strong,
.sbranches-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sbranches-summary-card strong {
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.sbranches-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.sbranches-toolbar,
.sbranches-filter-card,
.sbranches-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.sbranches-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sbranches-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--sbranches-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sbranches-view-tabs button {
  min-width: 0;
  min-height: 35px;
  border: 0;
  border-radius: 999px;
  padding: 0 9px;
  background: transparent;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.sbranches-view-tabs button.active {
  background: var(--sbranches-primary);
  color: #fff;
}

.sbranches-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.sbranches-section {
  margin-top: 16px;
}

.sbranches-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.sbranches-section-head p {
  margin: 0;
  color: var(--sbranches-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sbranches-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sbranches-list,
.sbranches-breakdown-grid {
  display: grid;
  gap: 10px;
}

.sbranches-card,
.sbranches-breakdown-card,
.sbranches-empty-card,
.sbranches-form-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.sbranches-card {
  background:
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--sbranches-primary) 4%, var(--card-bg, #fff)));
}

.sbranches-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sbranches-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 19px;
  background: var(--sbranches-primary);
  color: #fff;
  font-size: 20px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
  overflow: hidden;
}

.sbranches-card-main {
  min-width: 0;
  flex: 1;
}

.sbranches-card-main h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sbranches-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.sbranches-chip-row,
.sbranches-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.sbranches-chip {
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
  text-transform: capitalize;
}

.sbranches-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.sbranches-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.sbranches-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.sbranches-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.sbranches-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.sbranches-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.sbranches-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.sbranches-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08));
  overflow: hidden;
}

.sbranches-mini-stat strong,
.sbranches-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sbranches-mini-stat strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.sbranches-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.sbranches-detail-box {
  display: grid;
  gap: 3px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted, #64748b) 8%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sbranches-detail-box strong,
.sbranches-detail-box span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sbranches-detail-box strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.sbranches-detail-box span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sbranches-action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sbranches-action-row button {
  width: 100%;
}

.sbranches-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.sbranches-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sbranches-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.sbranches-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--sbranches-primary);
}

.sbranches-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sbranches-table-scroll table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, #fff));
}

.sbranches-table-scroll th,
.sbranches-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  text-align: left;
  vertical-align: top;
  color: var(--text, #111111);
  font-size: 13px;
}

.sbranches-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--sbranches-primary) 6%, var(--card-bg, #fff));
}

.sbranches-table-scroll td strong,
.sbranches-table-scroll td span {
  display: block;
}

.sbranches-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.sbranches-table-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.sbranches-table-actions button {
  min-height: 32px;
  padding: 0 10px;
  font-size: 12px;
}

.sbranches-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.sbranches-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--sbranches-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.sbranches-empty-card h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
}

.sbranches-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.sbranches-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.sbranches-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15,23,42,.52);
}

.sbranches-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 660px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg, #f7f8fb);
  color: var(--text, #111111);
  padding: 14px;
  box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}

.sbranches-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--bg, #f7f8fb);
}

.sbranches-drawer-head div {
  min-width: 0;
}

.sbranches-drawer-head p {
  margin: 0;
  color: var(--sbranches-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sbranches-drawer-head h2,
.sbranches-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sbranches-drawer-head h2 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.sbranches-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sbranches-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #111111);
  font-weight: 1000;
  cursor: pointer;
}

.sbranches-message {
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(245,158,11,.14);
  color: #f59e0b;
  font-size: 13px;
  font-weight: 900;
}

.sbranches-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
}

.sbranches-form-grid label,
.sbranches-form-card label {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.sbranches-form-grid label span,
.sbranches-form-card label > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.sbranches-form-grid .wide {
  grid-column: 1 / -1;
}

.sbranches-switch-row {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sbranches-switch-row div {
  min-width: 0;
}

.sbranches-switch-row strong {
  display: block;
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.sbranches-switch-row span {
  display: block;
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
  font-weight: 750;
}

.sbranches-switch {
  width: 58px;
  height: 34px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  padding: 4px;
  background: color-mix(in srgb, var(--muted, #64748b) 25%, transparent);
  cursor: pointer;
}

.sbranches-switch span {
  width: 26px;
  height: 26px;
  display: block;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(15,23,42,.16);
  transition: transform .18s ease;
}

.sbranches-switch.on {
  background: var(--sbranches-primary);
}

.sbranches-switch.on span {
  transform: translateX(24px);
}

.sbranches-drawer-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

@media (min-width: 680px) {
  .sbranches-page {
    padding: calc(12px * var(--local-density-scale, 1));
  }

  .sbranches-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sbranches-filter-card {
    grid-template-columns: minmax(0, 1fr) 200px 160px;
  }

  .sbranches-context-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sbranches-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .sbranches-page {
    padding: calc(16px * var(--local-density-scale, 1));
  }

  .sbranches-summary-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .sbranches-list,
  .sbranches-breakdown-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .sbranches-page {
    padding: calc(6px * var(--local-density-scale, 1));
  }

  .sbranches-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .sbranches-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .sbranches-ghost-btn,
  .sbranches-primary-btn {
    width: 100%;
  }

  .sbranches-summary-grid {
    gap: 6px;
  }

  .sbranches-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .sbranches-summary-card strong {
    font-size: 16px;
  }

  .sbranches-toolbar {
    align-items: stretch;
    flex-direction: column;
    border-radius: 20px;
  }

  .sbranches-view-tabs {
    width: 100%;
  }

  .sbranches-card,
  .sbranches-empty-card,
  .sbranches-breakdown-card,
  .sbranches-form-card {
    border-radius: 20px;
    padding: 11px;
  }

  .sbranches-avatar {
    width: 52px;
    height: 52px;
    flex-basis: 52px;
  }

  .sbranches-mini-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .sbranches-action-row,
  .sbranches-drawer-actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .sbranches-drawer {
    width: min(96vw, 660px);
    padding: 12px;
  }
}
`;
