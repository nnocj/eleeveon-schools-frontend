"use client";

/**
 * organizations.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE ORGANIZATION MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: organizations
 *
 * Organization represents departments, faculties, houses,
 * clubs, committees, and administrative units inside a branch.
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
  AssessmentStructure,
  Class,
  Curriculum,
  Expense,
  Income,
  Organization,
  Student,
  Subject,
  Teacher,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type OrganizationType =
  | "department"
  | "faculty"
  | "house"
  | "club"
  | "committee"
  | "administration";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  parentOrganizationId?: number;
  name: string;
  type: OrganizationType;
  description?: string;
  photo?: string;
  bannerImage?: string;
  active?: boolean;
};

type OrganizationView = {
  row: Organization;
  parentName: string;
  childrenCount: number;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  subjectCount: number;
  curriculumCount: number;
  financeCount: number;
  assessmentStructureCount: number;
  totalUsage: number;
};

const organizationTypes: OrganizationType[] = [
  "department",
  "faculty",
  "house",
  "club",
  "committee",
  "administration",
];

const emptyForm: FormState = {
  parentOrganizationId: undefined,
  name: "",
  type: "department",
  description: "",
  photo: "",
  bannerImage: "",
  active: true,
};

// ======================================================
// HELPERS
// ======================================================

const typeLabel = (type?: string) => {
  if (!type) return "Organization";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const typeTone = (type?: OrganizationType): "green" | "blue" | "gray" | "orange" | "purple" => {
  if (type === "department") return "blue";
  if (type === "faculty") return "purple";
  if (type === "house") return "green";
  if (type === "club") return "orange";
  if (type === "committee") return "gray";
  return "blue";
};

// ======================================================
// COMPONENT
// ======================================================

export default function OrganizationsPage() {
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

  const [rows, setRows] = useState<Organization[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [assessmentStructures, setAssessmentStructures] = useState<AssessmentStructure[]>([]);

  const [search, setSearch] = useState("");
  const [filterParentId, setFilterParentId] = useState<number | undefined>();
  const [filterType, setFilterType] = useState<"all" | OrganizationType>("all");
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
    setStudents([]);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setCurriculums([]);
    setIncomes([]);
    setExpenses([]);
    setAssessmentStructures([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        organizationRows,
        studentRows,
        teacherRows,
        classRows,
        subjectRows,
        curriculumRows,
        incomeRows,
        expenseRows,
        assessmentStructureRows,
      ] = await Promise.all([
        db.organizations.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.curriculums.toArray(),
        db.incomes.toArray(),
        db.expenses.toArray(),
        db.assessmentStructures.toArray(),
      ]);

      setRows(organizationRows.filter(sameTenant));
      setStudents(studentRows.filter(sameTenant));
      setTeachers(teacherRows.filter(sameTenant));
      setClasses(classRows.filter(sameTenant));
      setSubjects(subjectRows.filter(sameTenant));
      setCurriculums(curriculumRows.filter(sameTenant));
      setIncomes(incomeRows.filter(sameTenant));
      setExpenses(expenseRows.filter(sameTenant));
      setAssessmentStructures(assessmentStructureRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load organizations:", error);
      clearData();
      alert("Failed to load organizations");
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
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  );

  const availableParents = useMemo(() => {
    return rows
      .filter((row) => {
        if (editMode && form.id && row.id === form.id) return false;
        return row.active !== false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, editMode, form.id]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<OrganizationView[]>(() => {
    return rows.map((row) => {
      const id = row.id || 0;
      const parent = row.parentOrganizationId
        ? organizationMap.get(row.parentOrganizationId)
        : undefined;

      const childrenCount = rows.filter((child) => child.parentOrganizationId === id).length;
      const studentCount = students.filter((student) => student.organizationId === id).length;
      const teacherCount = teachers.filter((teacher) => teacher.organizationId === id).length;
      const classCount = classes.filter((item) => item.organizationId === id).length;
      const subjectCount = subjects.filter((item) => item.organizationId === id).length;
      const curriculumCount = curriculums.filter((item) => item.organizationId === id).length;
      const financeCount =
        incomes.filter((income) => income.organizationId === id).length +
        expenses.filter((expense) => expense.organizationId === id).length;
      const assessmentStructureCount = assessmentStructures.filter(
        (item) => item.organizationId === id
      ).length;

      return {
        row,
        parentName: parent?.name || "No parent",
        childrenCount,
        studentCount,
        teacherCount,
        classCount,
        subjectCount,
        curriculumCount,
        financeCount,
        assessmentStructureCount,
        totalUsage:
          childrenCount +
          studentCount +
          teacherCount +
          classCount +
          subjectCount +
          curriculumCount +
          financeCount +
          assessmentStructureCount,
      };
    });
  }, [
    rows,
    organizationMap,
    students,
    teachers,
    classes,
    subjects,
    curriculums,
    incomes,
    expenses,
    assessmentStructures,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterParentId && row.parentOrganizationId !== filterParentId) return false;
        if (filterType !== "all" && row.type !== filterType) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.type}
          ${row.description || ""}
          ${item.parentName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (a.row.type !== b.row.type) return a.row.type.localeCompare(b.row.type);
        return a.row.name.localeCompare(b.row.name);
      });
  }, [viewRows, search, filterParentId, filterType, filterStatus]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      departments: rows.filter((row) => row.type === "department").length,
      housesClubs: rows.filter((row) => row.type === "house" || row.type === "club").length,
      linkedRecords: viewRows.reduce((sum, item) => sum + item.totalUsage, 0),
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
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (row: Organization) => {
    setEditMode(true);
    setForm({
      id: row.id,
      parentOrganizationId: row.parentOrganizationId,
      name: row.name,
      type: row.type as OrganizationType,
      description: row.description || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
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
    if (!form.name.trim()) return "Enter organization name";
    if (!form.type) return "Select organization type";

    if (form.parentOrganizationId && form.parentOrganizationId === form.id) {
      return "An organization cannot be its own parent";
    }

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      return (
        row.name.trim().toLowerCase() === form.name.trim().toLowerCase() &&
        row.type === form.type &&
        (row.parentOrganizationId || 0) === Number(form.parentOrganizationId || 0) &&
        !row.isDeleted
      );
    });

    if (duplicate) return "An organization with this name, type and parent already exists";

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
        parentOrganizationId: form.parentOrganizationId
          ? Number(form.parentOrganizationId)
          : undefined,
        name: form.name.trim(),
        type: form.type,
        description: form.description?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        active: form.active !== false,
      }) as Organization;

      if (editMode && form.id) {
        await db.organizations.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        await db.organizations.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save organization:", error);
      alert("Failed to save organization");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: OrganizationView) => {
    if (!item.row.id) return;

    if (item.totalUsage) {
      const proceed = confirm(
        `This organization has ${item.totalUsage} related record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this organization?")) {
      return;
    }

    await db.organizations.update(item.row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: Organization) => {
    if (!row.id) return;

    await db.organizations.update(row.id, {
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
      <main className="org-page" style={{ "--org-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="org-state-card">
          <div className="org-spinner" />
          <h2>Opening organizations...</h2>
          <p>Checking account, branch, organizations, and related records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="org-page" style={{ "--org-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="org-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing organizations.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="org-page" style={{ "--org-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="org-state-card">
          <h2>Select a branch first</h2>
          <p>Organizations belong to one active school branch.</p>
          <button type="button" className="org-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="org-page" style={{ "--org-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="org-hero">
        <div className="org-hero-left">
          <div className="org-hero-icon">🏛️</div>
          <div className="org-title-wrap">
            <p>Branch Structure</p>
            <h2>Organizations</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="org-primary-btn" onClick={openCreate}>
          + Create Organization
        </button>
      </section>

      <section className="org-summary-grid" aria-label="Organization summary">
        <SummaryCard label="Organizations" value={summary.total} icon="🏛️" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Departments" value={summary.departments} icon="📘" />
        <SummaryCard label="Houses / Clubs" value={summary.housesClubs} icon="🎭" />
        <SummaryCard label="Linked Records" value={summary.linkedRecords} icon="🔗" />
      </section>

      <section className="org-filter-card">
        <input
          placeholder="Search organization, type, parent, description..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterParentId || ""} onChange={(event) => setFilterParentId(Number(event.target.value) || undefined)}>
          <option value="">All Parents</option>
          {rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterType} onChange={(event) => setFilterType(event.target.value as "all" | OrganizationType)}>
          <option value="all">All Types</option>
          {organizationTypes.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </section>

      <section className="org-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="org-entity-card">
              {row.bannerImage && (
                <div
                  className="org-card-banner"
                  style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.44), rgba(15,23,42,.08)), url(${row.bannerImage})` }}
                />
              )}

              <div className="org-card-body">
                <div className="org-card-top">
                  <Avatar name={row.name} photo={row.photo} primary={primary} />

                  <div className="org-card-main">
                    <h3>{row.name}</h3>
                    <p>Parent: {item.parentName}</p>

                    <div className="org-chip-row">
                      <Chip tone={typeTone(row.type as OrganizationType)}>{typeLabel(row.type)}</Chip>
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                    </div>
                  </div>
                </div>

                {row.description && <p className="org-description">{row.description}</p>}

                <div className="org-stat-grid">
                  <MiniStat label="Children" value={item.childrenCount} />
                  <MiniStat label="Students" value={item.studentCount} />
                  <MiniStat label="Teachers" value={item.teacherCount} />
                  <MiniStat label="Classes" value={item.classCount} />
                  <MiniStat label="Subjects" value={item.subjectCount} />
                  <MiniStat label="Finance" value={item.financeCount} />
                </div>

                <div className="org-action-row">
                  <button type="button" onClick={() => toggleActive(row)}>{row.active === false ? "Activate" : "Deactivate"}</button>
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(item)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No organizations found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="org-drawer-layer">
          <button type="button" className="org-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="org-drawer">
            <div className="org-drawer-head">
              <div>
                <p>Organization Setup</p>
                <h2>{editMode ? "Edit Organization" : "Create Organization"}</h2>
                <span>
                  This organization will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="org-form-grid">
              <Field label="Organization Name">
                <input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="e.g. Mathematics Department, Red House" />
              </Field>

              <Field label="Type">
                <select value={form.type} onChange={(event) => updateForm({ type: event.target.value as OrganizationType })}>
                  {organizationTypes.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
                </select>
              </Field>

              <Field label="Parent Organization">
                <select value={form.parentOrganizationId || ""} onChange={(event) => updateForm({ parentOrganizationId: Number(event.target.value) || undefined })}>
                  <option value="">No parent</option>
                  {availableParents.map((row) => <option key={row.id} value={row.id}>{row.name} • {typeLabel(row.type)}</option>)}
                </select>
              </Field>

              <Field label="Description">
                <textarea value={form.description || ""} onChange={(event) => updateForm({ description: event.target.value })} placeholder="Brief description" rows={4} />
              </Field>

              <label className="org-check">
                <input type="checkbox" checked={form.active !== false} onChange={(event) => updateForm({ active: event.target.checked })} />
                <span>Active</span>
              </label>

              <Field label="Photo">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
                {form.photo && <img src={form.photo} alt="Organization" className="org-preview-photo" />}
              </Field>

              <Field label="Banner Image">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("bannerImage", event.target.files?.[0])} />
                {form.bannerImage && <img src={form.bannerImage} alt="Organization banner" className="org-preview-banner" />}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="org-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Organization"}
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
    <article className="org-summary-card">
      <div className="org-summary-icon">{icon}</div>
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
      className="org-avatar"
      style={{ background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))` }}
    >
      {!photo && name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`org-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="org-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="org-empty-card">
      <div className="org-empty-icon">🏛️</div>
      <h3>No organizations found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="org-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes orgSpin { to { transform: rotate(360deg); } }

.org-page {
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
.org-page *, .org-page *::before, .org-page *::after { box-sizing: border-box; }
.org-page button, .org-page input, .org-page select, .org-page textarea { font: inherit; max-width: 100%; }
.org-page img { max-width: 100%; }
.org-page input,
.org-page select,
.org-page textarea {
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
.org-page textarea { padding-top: 10px; resize: vertical; }

.org-state-card {
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
.org-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.org-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.org-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--org-primary) 18%, transparent); border-top-color: var(--org-primary); animation: orgSpin .8s linear infinite; }

.org-primary-btn,
.org-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--org-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.org-save-btn { width: 100%; }
.org-primary-btn:disabled,
.org-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.org-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--org-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.org-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.org-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--org-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--org-primary) 28%, transparent); font-size: 22px; }
.org-title-wrap { min-width: 0; }
.org-title-wrap p, .org-title-wrap h2, .org-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.org-title-wrap p { margin: 0 0 2px; color: var(--org-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.org-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.org-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.org-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.org-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.org-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--org-primary) 12%, #fff); }
.org-summary-card div:last-child { min-width: 0; }
.org-summary-card strong, .org-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.org-summary-card strong { font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.org-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.org-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); }
.org-list { display: grid; gap: 10px; margin-top: 10px; }
.org-entity-card,
.org-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.org-card-banner { height: 92px; background-size: cover; background-position: center; }
.org-card-body { padding: 13px; }
.org-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.org-avatar { width: 58px; height: 58px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.org-card-main { min-width: 0; flex: 1; }
.org-card-main h3, .org-card-main p, .org-description { display: block; overflow: hidden; text-overflow: ellipsis; }
.org-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.org-card-main p, .org-description { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.org-description { margin-top: 9px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: normal; }
.org-chip-row, .org-action-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.org-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.org-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.org-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.org-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.org-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.org-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.org-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.org-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.org-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .13); overflow: hidden; }
.org-mini-stat strong, .org-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.org-mini-stat strong { font-size: 17px; font-weight: 1000; }
.org-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.org-action-row button { min-height: 40px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.org-action-row button.danger { color: #dc2626; background: rgba(239, 68, 68, .08); border-color: rgba(239, 68, 68, .12); }
.org-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.org-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--org-primary) 12%, #fff); font-size: 28px; }
.org-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.org-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.org-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.org-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.org-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 600px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.org-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.org-drawer-head div { min-width: 0; }
.org-drawer-head p { margin: 0; color: var(--org-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.org-drawer-head h2, .org-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.org-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.org-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.org-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.org-form-grid { display: grid; gap: 12px; }
.org-field { display: grid; gap: 6px; min-width: 0; }
.org-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.org-check { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.org-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.org-preview-photo { width: 94px; height: 82px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.org-preview-banner { width: 100%; height: 126px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.org-save-btn { width: 100%; }

@media (min-width: 680px) {
  .org-page { padding: 12px; }
  .org-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .org-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .org-page { padding: 16px; }
  .org-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .org-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .org-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .org-page { padding: 6px; }
  .org-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .org-primary-btn { width: 100%; }
  .org-summary-grid { gap: 6px; }
  .org-summary-card { padding: 10px; border-radius: 19px; }
  .org-entity-card, .org-empty-card { border-radius: 20px; }
  .org-card-body { padding: 11px; }
  .org-card-top { align-items: flex-start; }
  .org-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .org-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .org-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .org-action-row button { width: 100%; padding: 0 8px; }
  .org-action-row button.danger { grid-column: 1 / -1; }
  .org-drawer { width: min(96vw, 600px); padding: 12px; }
}
`;
