"use client";

/**
 * programs.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE PROGRAM MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: programs
 * Supporting tables:
 * - organizations
 * - curriculums
 * - studentCurriculums
 *
 * Program belongs to a Branch.
 * Curriculum may optionally link to Program through programId.
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first program cards and drawer UI.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  Curriculum,
  Organization,
  Program,
  StudentCurriculum,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  organizationId?: number;
  name: string;
  code?: string;
  photo?: string;
  bannerImage?: string;
  awardType?: string;
  durationYears?: number;
  description?: string;
  active?: boolean;
};

type ProgramView = {
  row: Program;
  organizationName: string;
  curriculumCount: number;
  studentCurriculumCount: number;
};

const emptyForm: FormState = {
  organizationId: undefined,
  name: "",
  code: "",
  photo: "",
  bannerImage: "",
  awardType: "",
  durationYears: undefined,
  description: "",
  active: true,
};

// ======================================================
// COMPONENT
// ======================================================

export default function ProgramsPage() {
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
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Program[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);

  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setRows([]);
    setOrganizations([]);
    setCurriculums([]);
    setStudentCurriculums([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [programRows, organizationRows, curriculumRows, studentCurriculumRows] =
        await Promise.all([
          db.programs.toArray(),
          db.organizations.toArray(),
          db.curriculums.toArray(),
          db.studentCurriculums.toArray(),
        ]);

      setRows(programRows.filter(sameTenant));

      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setCurriculums(curriculumRows.filter(sameTenant));
      setStudentCurriculums(studentCurriculumRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load programs:", error);
      clearData();
      alert("Failed to load programs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const organizationMap = useMemo(
    () => new Map(organizations.map((row) => [row.id, row])),
    [organizations]
  );

  const curriculumMap = useMemo(
    () => new Map(curriculums.map((row) => [row.id, row])),
    [curriculums]
  );

  const curriculumCountMap = useMemo(() => {
    const map = new Map<number, number>();

    curriculums.forEach((row) => {
      if (!row.programId) return;
      map.set(row.programId, (map.get(row.programId) || 0) + 1);
    });

    return map;
  }, [curriculums]);

  const studentCurriculumCountMap = useMemo(() => {
    const map = new Map<number, number>();

    studentCurriculums.forEach((studentCurriculum) => {
      const curriculum = curriculumMap.get(studentCurriculum.curriculumId);
      if (!curriculum?.programId) return;

      map.set(curriculum.programId, (map.get(curriculum.programId) || 0) + 1);
    });

    return map;
  }, [studentCurriculums, curriculumMap]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ProgramView[]>(() => {
    return rows.map((row) => {
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const id = row.id || 0;

      return {
        row,
        organizationName: organization?.name || "No organization",
        curriculumCount: curriculumCountMap.get(id) || 0,
        studentCurriculumCount: studentCurriculumCountMap.get(id) || 0,
      };
    });
  }, [rows, organizationMap, curriculumCountMap, studentCurriculumCountMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.awardType || ""}
          ${row.durationYears || ""}
          ${row.description || ""}
          ${item.organizationName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [viewRows, search, filterOrganizationId, filterStatus]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      inactive: rows.filter((row) => row.active === false).length,
      curriculums: curriculums.filter((row) => row.programId).length,
      students: studentCurriculums.length,
    };
  }, [rows, curriculums, studentCurriculums]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (field: "photo" | "bannerImage", file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }

    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;

    setEditMode(false);
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (row: Program) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      code: row.code || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      awardType: row.awardType || "",
      durationYears: row.durationYears,
      description: row.description || "",
      active: row.active ?? true,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
    if (!form.name.trim()) return "Enter program name";
    if (form.durationYears !== undefined && Number(form.durationYears) < 0) {
      return "Duration years cannot be negative";
    }

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        !!form.code?.trim() &&
        row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) return "A program with this name or code already exists in this branch";

    return null;
  };

  const save = async () => {
    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        awardType: form.awardType?.trim() || undefined,
        durationYears: form.durationYears == null ? undefined : Number(form.durationYears),
        description: form.description?.trim() || undefined,
        active: form.active !== false,
      }) as Program;

      if (editMode && form.id) {
        await db.programs.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        await db.programs.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save program:", error);
      alert("Failed to save program");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: ProgramView) => {
    const row = item.row;
    if (!row.id) return;

    const totalUsage = item.curriculumCount + item.studentCurriculumCount;

    if (totalUsage) {
      const proceed = confirm(
        `This program is used by ${item.curriculumCount} curriculum(s) and ${item.studentCurriculumCount} student curriculum record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this program?")) {
      return;
    }

    await db.programs.update(row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: Program) => {
    if (!row.id) return;

    await db.programs.update(row.id, {
      active: row.active === false,
      updatedAt: Date.now(),
    });

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="prog-page" style={{ "--prog-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="prog-state-card">
          <div className="prog-spinner" />
          <h2>Opening programs...</h2>
          <p>Checking account, branch, organizations, programs, curriculums, and student curriculum records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="prog-page" style={{ "--prog-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="prog-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing programs.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="prog-page" style={{ "--prog-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="prog-state-card">
          <h2>Select a branch first</h2>
          <p>Programs belong to one active school branch.</p>
          <button type="button" className="prog-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="prog-page" style={{ "--prog-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="prog-hero">
        <div className="prog-hero-left">
          <div className="prog-hero-icon">🎓</div>
          <div className="prog-title-wrap">
            <p>Academic Identity</p>
            <h2>Programs</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="prog-primary-btn" onClick={openCreate}>
          + Create Program
        </button>
      </section>

      <section className="prog-summary-grid" aria-label="Program summary">
        <SummaryCard label="Programs" value={summary.total} icon="🎓" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Inactive" value={summary.inactive} icon="⏸️" />
        <SummaryCard label="Linked Curriculums" value={summary.curriculums} icon="📚" />
        <SummaryCard label="Student Records" value={summary.students} icon="👥" />
      </section>

      <section className="prog-filter-card">
        <input
          placeholder="Search program, code, award type, organization..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterOrganizationId || ""} onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}>
          <option value="">All Organizations</option>
          {organizations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {row.type}
            </option>
          ))}
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </section>

      <section className="prog-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="prog-entity-card">
              {row.bannerImage && (
                <div
                  className="prog-card-banner"
                  style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.44), rgba(15,23,42,.08)), url(${row.bannerImage})` }}
                />
              )}

              <div className="prog-card-body">
                <div className="prog-card-top">
                  <Avatar name={row.name} photo={row.photo} primary={primary} />

                  <div className="prog-card-main">
                    <h3>{row.name}</h3>
                    <p>{item.organizationName}{row.durationYears ? ` · ${row.durationYears} year(s)` : ""}</p>

                    <div className="prog-chip-row">
                      {row.code && <Chip tone="gray">{row.code}</Chip>}
                      {row.awardType && <Chip tone="blue">{row.awardType}</Chip>}
                      <Chip tone={row.active === false ? "red" : "green"}>
                        {row.active === false ? "Inactive" : "Active"}
                      </Chip>
                    </div>
                  </div>
                </div>

                {row.description && <p className="prog-description">{row.description}</p>}

                <div className="prog-stat-grid">
                  <MiniStat label="Curriculums" value={item.curriculumCount} />
                  <MiniStat label="Student Records" value={item.studentCurriculumCount} />
                  <MiniStat label="Duration" value={row.durationYears ? `${row.durationYears} yr(s)` : "-"} />
                </div>

                <div className="prog-action-row">
                  <button type="button" onClick={() => toggleActive(row)}>{row.active === false ? "Activate" : "Deactivate"}</button>
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(item)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No programs found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="prog-drawer-layer">
          <button type="button" className="prog-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="prog-drawer">
            <div className="prog-drawer-head">
              <div>
                <p>Program Setup</p>
                <h2>{editMode ? "Edit Program" : "Create Program"}</h2>
                <span>
                  Program will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="prog-form-grid">
              <Field label="Program Name">
                <input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="e.g. Basic Education, JHS Programme" />
              </Field>

              <div className="prog-form-two">
                <Field label="Program Code">
                  <input value={form.code || ""} onChange={(event) => updateForm({ code: event.target.value })} placeholder="e.g. BASIC, JHS" />
                </Field>

                <Field label="Duration Years">
                  <input type="number" value={form.durationYears ?? ""} onChange={(event) => updateForm({ durationYears: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Years" />
                </Field>
              </div>

              <Field label="Award Type">
                <input value={form.awardType || ""} onChange={(event) => updateForm({ awardType: event.target.value })} placeholder="e.g. Basic Education Certificate, Diploma" />
              </Field>

              <Field label="Organization / Department">
                <select value={form.organizationId || ""} onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}>
                  <option value="">No organization</option>
                  {organizations.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.type}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Description">
                <textarea value={form.description || ""} onChange={(event) => updateForm({ description: event.target.value })} placeholder="Program description" rows={4} />
              </Field>

              <label className="prog-check">
                <input type="checkbox" checked={form.active !== false} onChange={(event) => updateForm({ active: event.target.checked })} />
                <span>Active</span>
              </label>

              <Field label="Program Photo">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
                {form.photo && <img src={form.photo} alt="Program" className="prog-preview-photo" />}
              </Field>

              <Field label="Program Banner Image">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("bannerImage", event.target.files?.[0])} />
                {form.bannerImage && <img src={form.bannerImage} alt="Program banner" className="prog-preview-banner" />}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="prog-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Program"}
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

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="prog-summary-card">
      <div className="prog-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div
      className="prog-avatar"
      style={{ background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))` }}
    >
      {!photo && name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`prog-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="prog-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="prog-empty-card">
      <div className="prog-empty-icon">🎓</div>
      <h3>No programs found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="prog-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes progSpin { to { transform: rotate(360deg); } }

.prog-page {
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
.prog-page *, .prog-page *::before, .prog-page *::after { box-sizing: border-box; }
.prog-page button, .prog-page input, .prog-page select, .prog-page textarea { font: inherit; max-width: 100%; }
.prog-page img { max-width: 100%; }
.prog-page input,
.prog-page select,
.prog-page textarea {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}
.prog-page textarea { padding-top: 10px; resize: vertical; }

.prog-state-card {
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
.prog-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.prog-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.prog-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--prog-primary) 18%, transparent); border-top-color: var(--prog-primary); animation: progSpin .8s linear infinite; }

.prog-primary-btn,
.prog-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--prog-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.prog-save-btn { width: 100%; }
.prog-primary-btn:disabled,
.prog-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.prog-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--prog-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.prog-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.prog-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--prog-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--prog-primary) 28%, transparent); font-size: 22px; }
.prog-title-wrap { min-width: 0; }
.prog-title-wrap p, .prog-title-wrap h2, .prog-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prog-title-wrap p { margin: 0 0 2px; color: var(--prog-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.prog-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.prog-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.prog-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.prog-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.prog-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--prog-primary) 12%, #fff); }
.prog-summary-card div:last-child { min-width: 0; }
.prog-summary-card strong, .prog-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prog-summary-card strong { font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.prog-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.prog-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); }
.prog-list { display: grid; gap: 10px; margin-top: 10px; }
.prog-entity-card,
.prog-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.prog-card-banner { height: 92px; background-size: cover; background-position: center; }
.prog-card-body { padding: 13px; }
.prog-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.prog-avatar { width: 58px; height: 58px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.prog-card-main { min-width: 0; flex: 1; }
.prog-card-main h3, .prog-card-main p, .prog-description { display: block; overflow: hidden; text-overflow: ellipsis; }
.prog-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.prog-card-main p, .prog-description { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.prog-description { margin-top: 9px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: normal; }
.prog-chip-row, .prog-action-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.prog-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prog-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.prog-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.prog-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.prog-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.prog-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.prog-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.prog-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.prog-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .13); overflow: hidden; }
.prog-mini-stat strong, .prog-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prog-mini-stat strong { font-size: 17px; font-weight: 1000; }
.prog-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.prog-action-row button { min-height: 40px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.prog-action-row button.danger { color: #dc2626; background: rgba(239, 68, 68, .08); border-color: rgba(239, 68, 68, .12); }
.prog-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.prog-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--prog-primary) 12%, #fff); font-size: 28px; }
.prog-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.prog-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.prog-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.prog-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.prog-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 600px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.prog-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.prog-drawer-head div { min-width: 0; }
.prog-drawer-head p { margin: 0; color: var(--prog-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.prog-drawer-head h2, .prog-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.prog-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.prog-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.prog-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.prog-form-grid { display: grid; gap: 12px; }
.prog-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.prog-field { display: grid; gap: 6px; min-width: 0; }
.prog-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.prog-check { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.prog-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.prog-preview-photo { width: 94px; height: 82px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.prog-preview-banner { width: 100%; height: 126px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.prog-save-btn { width: 100%; }

@media (min-width: 680px) {
  .prog-page { padding: 12px; }
  .prog-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .prog-filter-card { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .prog-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .prog-page { padding: 16px; }
  .prog-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .prog-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .prog-page { padding: 6px; }
  .prog-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .prog-primary-btn { width: 100%; }
  .prog-summary-grid { gap: 6px; }
  .prog-summary-card { padding: 10px; border-radius: 19px; }
  .prog-entity-card, .prog-empty-card { border-radius: 20px; }
  .prog-card-body { padding: 11px; }
  .prog-card-top { align-items: flex-start; }
  .prog-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .prog-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .prog-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .prog-action-row button { width: 100%; padding: 0 8px; }
  .prog-action-row button.danger { grid-column: 1 / -1; }
  .prog-drawer { width: min(96vw, 600px); padding: 12px; }
}
`;
