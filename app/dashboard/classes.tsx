"use client";

/**
 * classes.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE CLASS MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: classes
 *
 * Class is the institutional academic grouping used by:
 * - StudentEnrollment
 * - ClassSubject
 * - AssessmentEntry
 * - Attendance
 * - Report cards and broadsheets
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first cards and drawer UI.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  Class,
  Organization,
  Student,
  StudentEnrollment,
  ClassSubject,
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
  level?: string;
  photo?: string;
  bannerImage?: string;
  capacity?: number;
  active?: boolean;
};

type ClassView = {
  row: Class;
  organizationName: string;
  studentCount: number;
  subjectCount: number;
  capacityUsed: number;
  overCapacity: boolean;
};

const emptyForm = (): FormState => ({
  organizationId: undefined,
  name: "",
  code: "",
  level: "",
  photo: "",
  bannerImage: "",
  capacity: undefined,
  active: true,
});

// ======================================================
// COMPONENT
// ======================================================

export default function ClassesPage() {
  const router = useRouter();

  const {
    accountId,
    loading: accountLoading,
    authenticated,
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

  const [rows, setRows] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "full">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  // ======================================================
  // AUTH PROTECTION
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

  const clearData = () => {
    setRows([]);
    setOrganizations([]);
    setStudents([]);
    setEnrollments([]);
    setClassSubjects([]);
  };

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        classRows,
        organizationRows,
        studentRows,
        enrollmentRows,
        classSubjectRows,
      ] = await Promise.all([
        db.classes.toArray(),
        db.organizations.toArray(),
        db.students.toArray(),
        db.studentEnrollments.toArray(),
        db.classSubjects.toArray(),
      ]);

      setRows(classRows.filter(sameTenant));
      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setStudents(
        studentRows.filter((row) => sameTenant(row) && row.status !== "withdrawn")
      );
      setEnrollments(enrollmentRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load classes:", error);
      clearData();
      alert("Failed to load classes");
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

  const activeEnrollmentCounts = useMemo(() => {
    const map = new Map<number, number>();

    enrollments.forEach((enrollment) => {
      if (enrollment.status !== "active") return;
      map.set(enrollment.classId, (map.get(enrollment.classId) || 0) + 1);
    });

    return map;
  }, [enrollments]);

  const fallbackCurrentClassCounts = useMemo(() => {
    const map = new Map<number, number>();

    students.forEach((student) => {
      if (!student.currentClassId) return;
      map.set(student.currentClassId, (map.get(student.currentClassId) || 0) + 1);
    });

    return map;
  }, [students]);

  const classSubjectCounts = useMemo(() => {
    const map = new Map<number, number>();

    classSubjects.forEach((classSubject) => {
      if (classSubject.active === false) return;
      map.set(classSubject.classId, (map.get(classSubject.classId) || 0) + 1);
    });

    return map;
  }, [classSubjects]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ClassView[]>(() => {
    return rows.map((row) => {
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const studentCount =
        activeEnrollmentCounts.get(row.id || 0) || fallbackCurrentClassCounts.get(row.id || 0) || 0;
      const subjectCount = classSubjectCounts.get(row.id || 0) || 0;
      const capacity = Number(row.capacity || 0);
      const capacityUsed = capacity ? Math.min(100, Math.round((studentCount / capacity) * 100)) : 0;

      return {
        row,
        organizationName: organization?.name || "No organization",
        studentCount,
        subjectCount,
        capacityUsed,
        overCapacity: !!capacity && studentCount > capacity,
      };
    });
  }, [rows, organizationMap, activeEnrollmentCounts, fallbackCurrentClassCounts, classSubjectCounts]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "full" && !item.overCapacity && item.capacityUsed < 100) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.level || ""}
          ${item.organizationName}
          ${row.capacity || ""}
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
      students: viewRows.reduce((sum, item) => sum + item.studentCount, 0),
      classSubjects: viewRows.reduce((sum, item) => sum + item.subjectCount, 0),
      fullOrOver: viewRows.filter((item) => item.overCapacity || item.capacityUsed >= 100).length,
    };
  }, [rows, viewRows]);

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
    setForm(emptyForm());
    setDrawerOpen(true);
  };

  const openEdit = (row: Class) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      code: row.code || "",
      level: row.level || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      capacity: row.capacity,
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
    if (!form.name.trim()) return "Enter class name";
    if (form.capacity !== undefined && Number(form.capacity) < 0) return "Capacity cannot be negative";

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        form.code?.trim() &&
        row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) return "A class with this name or code already exists";
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
        level: form.level?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        capacity: form.capacity == null ? undefined : Number(form.capacity),
        active: form.active !== false,
      }) as Class;

      if (editMode && form.id) {
        await db.classes.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        await db.classes.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save class:", error);
      alert("Failed to save class");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const studentCount = activeEnrollmentCounts.get(id) || fallbackCurrentClassCounts.get(id) || 0;
    const subjectCount = classSubjectCounts.get(id) || 0;

    if (studentCount || subjectCount) {
      const proceed = confirm(
        `This class has ${studentCount} active student(s) and ${subjectCount} class subject(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this class?")) {
      return;
    }

    await db.classes.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: Class) => {
    if (!row.id) return;

    await db.classes.update(row.id, {
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
      <main className="cl-page" style={{ "--cl-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cl-state-card">
          <div className="cl-spinner" />
          <h2>Opening classes...</h2>
          <p>Checking account, school, branch, classes, students and subject delivery data.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="cl-page" style={{ "--cl-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cl-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing classes.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="cl-page" style={{ "--cl-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cl-state-card">
          <h2>Select a branch first</h2>
          <p>Classes belong to one active school branch.</p>
          <button type="button" className="cl-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="cl-page" style={{ "--cl-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="cl-hero">
        <div className="cl-hero-left">
          <div className="cl-hero-icon">🏷</div>
          <div className="cl-title-wrap">
            <p>Academic Grouping</p>
            <h2>Classes</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="cl-primary-btn" onClick={openCreate}>
          + Create Class
        </button>
      </section>

      <section className="cl-summary-grid" aria-label="Class summary">
        <SummaryCard label="Total Classes" value={summary.total} icon="🏷" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Students Assigned" value={summary.students} icon="🧑‍🎓" />
        <SummaryCard label="Class Subjects" value={summary.classSubjects} icon="📚" />
        <SummaryCard label="Full / Over" value={summary.fullOrOver} icon="⚠️" />
      </section>

      <section className="cl-filter-card">
        <input
          placeholder="Search class, code, level, organization..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterOrganizationId || ""}
          onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}
        >
          <option value="">All Organizations</option>
          {organizations.map((row) => (
            <option key={row.id} value={row.id}>{row.name} • {row.type}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value as any)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="full">Full / Over Capacity</option>
        </select>
      </section>

      <section className="cl-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="cl-entity-card">
              {row.bannerImage && (
                <div
                  className="cl-card-banner"
                  style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.44), rgba(15,23,42,.08)), url(${row.bannerImage})` }}
                />
              )}

              <div className="cl-card-body">
                <div className="cl-card-top">
                  <Avatar name={row.name} photo={row.photo} primary={primary} />

                  <div className="cl-card-main">
                    <h3>{row.name}</h3>
                    <p>{item.organizationName}</p>
                    <div className="cl-chip-row">
                      {row.code && <Chip tone="gray">{row.code}</Chip>}
                      {row.level && <Chip tone="blue">{row.level}</Chip>}
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      {item.overCapacity && <Chip tone="orange">Over capacity</Chip>}
                    </div>
                  </div>
                </div>

                <div className="cl-stat-grid">
                  <MiniStat label="Students" value={item.studentCount} />
                  <MiniStat label="Subjects" value={item.subjectCount} />
                  <MiniStat label="Capacity" value={row.capacity || "-"} />
                </div>

                {!!row.capacity && (
                  <div className="cl-capacity-wrap">
                    <div className="cl-capacity-track">
                      <span
                        className={item.overCapacity ? "over" : ""}
                        style={{ width: `${item.capacityUsed}%` }}
                      />
                    </div>
                    <p>Capacity: {item.studentCount}/{row.capacity}</p>
                  </div>
                )}

                <div className="cl-action-row">
                  <button type="button" onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(row.id)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No classes found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="cl-drawer-layer">
          <button type="button" className="cl-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="cl-drawer">
            <div className="cl-drawer-head">
              <div>
                <p>Class Setup</p>
                <h2>{editMode ? "Edit Class" : "Create Class"}</h2>
                <span>
                  This class will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="cl-form-grid">
              <Field label="Class Name">
                <input
                  value={form.name}
                  onChange={(event) => updateForm({ name: event.target.value })}
                  placeholder="e.g. Basic 5, JHS 1, Nursery 2"
                />
              </Field>

              <div className="cl-form-two">
                <Field label="Class Code">
                  <input
                    value={form.code || ""}
                    onChange={(event) => updateForm({ code: event.target.value })}
                    placeholder="e.g. B5, JHS1"
                  />
                </Field>

                <Field label="Level">
                  <input
                    value={form.level || ""}
                    onChange={(event) => updateForm({ level: event.target.value })}
                    placeholder="e.g. Primary, JHS, SHS"
                  />
                </Field>
              </div>

              <Field label="Organization / Department">
                <select
                  value={form.organizationId || ""}
                  onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}
                >
                  <option value="">No organization</option>
                  {organizations.map((row) => (
                    <option key={row.id} value={row.id}>{row.name} • {row.type}</option>
                  ))}
                </select>
              </Field>

              <Field label="Capacity">
                <input
                  type="number"
                  value={form.capacity ?? ""}
                  onChange={(event) =>
                    updateForm({ capacity: event.target.value === "" ? undefined : Number(event.target.value) })
                  }
                  placeholder="Maximum number of students"
                />
              </Field>

              <Check label="Active" checked={form.active !== false} onChange={(checked) => updateForm({ active: checked })} />

              <Field label="Class Photo">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
                {form.photo && <img src={form.photo} alt="Class" className="cl-preview-photo" />}
              </Field>

              <Field label="Class Banner Image">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("bannerImage", event.target.files?.[0])} />
                {form.bannerImage && <img src={form.bannerImage} alt="Class Banner" className="cl-preview-banner" />}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="cl-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Class"}
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
    <article className="cl-summary-card">
      <div className="cl-summary-icon">{icon}</div>
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
      className="cl-avatar"
      style={{
        background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
      }}
    >
      {!photo && name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" }) {
  return <span className={`cl-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cl-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="cl-empty-card">
      <div className="cl-empty-icon">🏷</div>
      <h3>No classes found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="cl-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="cl-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes clSpin {
  to { transform: rotate(360deg); }
}

.cl-page {
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

.cl-page *,
.cl-page *::before,
.cl-page *::after {
  box-sizing: border-box;
}

.cl-page button,
.cl-page input,
.cl-page select,
.cl-page textarea {
  font: inherit;
  max-width: 100%;
}

.cl-page input,
.cl-page select {
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

.cl-page img {
  max-width: 100%;
}

.cl-state-card {
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

.cl-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.cl-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.cl-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--cl-primary) 18%, transparent);
  border-top-color: var(--cl-primary);
  animation: clSpin .8s linear infinite;
}

.cl-primary-btn,
.cl-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--cl-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.cl-primary-btn:disabled,
.cl-save-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.cl-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--cl-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.cl-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.cl-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--cl-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--cl-primary) 28%, transparent);
  font-size: 22px;
}

.cl-title-wrap {
  min-width: 0;
}

.cl-title-wrap p,
.cl-title-wrap h2,
.cl-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cl-title-wrap p {
  margin: 0 0 2px;
  color: var(--cl-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.cl-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.cl-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.cl-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.cl-summary-card {
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

.cl-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--cl-primary) 12%, #fff);
}

.cl-summary-card div:last-child {
  min-width: 0;
}

.cl-summary-card strong,
.cl-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cl-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.cl-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.cl-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
}

.cl-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.cl-entity-card,
.cl-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: linear-gradient(135deg, #fff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.cl-card-banner {
  height: 86px;
  background-size: cover;
  background-position: center;
}

.cl-card-body {
  padding: 13px;
}

.cl-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.cl-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 20px;
  color: #fff;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15, 23, 42, .12);
}

.cl-card-main {
  min-width: 0;
  flex: 1;
}

.cl-card-main h3,
.cl-card-main p {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cl-card-main h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.035em;
}

.cl-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.cl-chip-row,
.cl-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.cl-chip {
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

.cl-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.cl-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.cl-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.cl-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.cl-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }

.cl-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.cl-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .13);
  overflow: hidden;
}

.cl-mini-stat strong,
.cl-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cl-mini-stat strong {
  font-size: 18px;
  font-weight: 1000;
}

.cl-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.cl-capacity-wrap {
  margin-top: 11px;
}

.cl-capacity-track {
  height: 9px;
  border-radius: 999px;
  background: rgba(148, 163, 184, .22);
  overflow: hidden;
}

.cl-capacity-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--cl-primary);
}

.cl-capacity-track span.over {
  background: #f59e0b;
}

.cl-capacity-wrap p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

.cl-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.cl-action-row button.danger {
  color: #dc2626;
  background: rgba(239, 68, 68, .08);
  border-color: rgba(239, 68, 68, .12);
}

.cl-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  padding: 22px;
  text-align: center;
  border-style: dashed;
}

.cl-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--cl-primary) 12%, #fff);
  font-size: 28px;
}

.cl-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.cl-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.cl-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.cl-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, .52);
}

.cl-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 560px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: -24px 0 70px rgba(15, 23, 42, .22);
}

.cl-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--surface, #fff);
}

.cl-drawer-head div {
  min-width: 0;
}

.cl-drawer-head p {
  margin: 0;
  color: var(--cl-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.cl-drawer-head h2,
.cl-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cl-drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.cl-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.cl-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 15px;
  background: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.cl-form-grid {
  display: grid;
  gap: 12px;
}

.cl-form-two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.cl-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.cl-field > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.cl-check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .14);
  font-weight: 850;
}

.cl-check input {
  width: 18px;
  min-height: 18px;
  flex: 0 0 auto;
}

.cl-preview-photo {
  width: 94px;
  height: 82px;
  border-radius: 16px;
  margin-top: 8px;
  object-fit: cover;
}

.cl-preview-banner {
  width: 100%;
  height: 126px;
  border-radius: 16px;
  margin-top: 8px;
  object-fit: cover;
}

.cl-save-btn {
  width: 100%;
}

@media (min-width: 680px) {
  .cl-page {
    padding: 12px;
  }

  .cl-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .cl-filter-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cl-form-two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .cl-page {
    padding: 16px;
  }

  .cl-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .cl-filter-card {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }

  .cl-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .cl-page {
    padding: 6px;
  }

  .cl-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .cl-primary-btn {
    width: 100%;
  }

  .cl-summary-grid {
    gap: 6px;
  }

  .cl-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .cl-entity-card,
  .cl-empty-card {
    border-radius: 20px;
  }

  .cl-card-body {
    padding: 11px;
  }

  .cl-card-top {
    align-items: flex-start;
  }

  .cl-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .cl-action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cl-action-row button {
    width: 100%;
    padding: 0 8px;
  }

  .cl-action-row button.danger {
    grid-column: 1 / -1;
  }

  .cl-drawer {
    width: min(96vw, 560px);
    padding: 12px;
  }
}
`;
