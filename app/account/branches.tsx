"use client";

/**
 * branches.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE BRANCH MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: branches
 *
 * Branch belongs to a School.
 * This page works within the selected account + school context:
 *
 * Active Account -> Active School -> Branches
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school required.
 * - All reads/writes are scoped by accountId + schoolId.
 * - Branches from other schools are never shown.
 * - Soft delete only.
 * - Mobile-first cards and drawer UI.
 * - Account/dashboard shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import { SyncStatus } from "../lib/constants/syncStatus";

import {
  db,
  AcademicStructure,
  Branch,
  Class,
  School,
  Student,
  Subject,
  Teacher,
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
  schoolId?: number;
  name: string;
  code?: string;
  logo?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  photo?: string;
  bannerImage?: string;
  active?: boolean;
};

type BranchView = {
  row: Branch;
  schoolName: string;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  subjectCount: number;
  structureCount: number;
  totalUsage: number;
};

const emptyForm = (schoolId?: number): FormState => ({
  schoolId,
  name: "",
  code: "",
  logo: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  photo: "",
  bannerImage: "",
  active: true,
});

// ======================================================
// COMPONENT
// ======================================================

export default function BranchesPage() {
  const router = useRouter();

  const {
    accountId,
    loading: accountLoading,
    authenticated,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchoolId,
    activeSchool,
    activeBranchId,
    setActiveBranchId,
    refreshInstitution,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Branch[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "current">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(schoolId));

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
    }
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const clearData = () => {
    setRows([]);
    setSchools([]);
    setStudents([]);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setAcademicStructures([]);
  };

  const sameAccount = (row: TenantRow) => row.accountId === accountId && !row.isDeleted;

  const sameSchool = (row: TenantRow) =>
    row.accountId === accountId && row.schoolId === schoolId && !row.isDeleted;

  const load = async () => {
    if (!authenticated || !accountId || !schoolId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        branchRows,
        schoolRows,
        studentRows,
        teacherRows,
        classRows,
        subjectRows,
        structureRows,
      ] = await Promise.all([
        db.branches.toArray(),
        db.schools.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicStructures.toArray(),
      ]);

      const scopedBranches = branchRows
        .filter((row) => sameSchool(row))
        .sort((a, b) => a.name.localeCompare(b.name));

      const branchIds = new Set(
        scopedBranches.map((row) => row.id).filter(Boolean) as number[]
      );

      setSchools(
        schoolRows
          .filter(sameAccount)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setRows(scopedBranches);

      setStudents(
        studentRows.filter(
          (row) =>
            sameSchool(row) &&
            row.status !== "withdrawn" &&
            !!row.branchId &&
            branchIds.has(row.branchId)
        )
      );

      setTeachers(
        teacherRows.filter(
          (row) => sameSchool(row) && !!row.branchId && branchIds.has(row.branchId)
        )
      );

      setClasses(
        classRows.filter(
          (row) => sameSchool(row) && !!row.branchId && branchIds.has(row.branchId)
        )
      );

      setSubjects(
        subjectRows.filter(
          (row) => sameSchool(row) && !!row.branchId && branchIds.has(row.branchId)
        )
      );

      setAcademicStructures(
        structureRows.filter(
          (row) => sameSchool(row) && !!row.branchId && branchIds.has(row.branchId)
        )
      );
    } catch (error) {
      console.error("Failed to load branches:", error);
      clearData();
      alert("Failed to load branches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const schoolMap = useMemo(
    () => new Map(schools.map((row) => [row.id, row])),
    [schools]
  );

  const branchCounts = useMemo(() => {
    const map = new Map<number, Omit<BranchView, "row" | "schoolName" | "totalUsage">>();

    rows.forEach((branch) => {
      if (!branch.id) return;

      map.set(branch.id, {
        studentCount: 0,
        teacherCount: 0,
        classCount: 0,
        subjectCount: 0,
        structureCount: 0,
      });
    });

    students.forEach((row) => {
      const count = map.get(row.branchId);
      if (count) count.studentCount += 1;
    });

    teachers.forEach((row) => {
      const count = map.get(row.branchId);
      if (count) count.teacherCount += 1;
    });

    classes.forEach((row) => {
      const count = map.get(row.branchId);
      if (count) count.classCount += 1;
    });

    subjects.forEach((row) => {
      const count = map.get(row.branchId);
      if (count) count.subjectCount += 1;
    });

    academicStructures.forEach((row) => {
      const count = map.get(row.branchId);
      if (count) count.structureCount += 1;
    });

    return map;
  }, [rows, students, teachers, classes, subjects, academicStructures]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<BranchView[]>(() => {
    return rows.map((row) => {
      const counts = branchCounts.get(row.id || 0);
      const school = schoolMap.get(row.schoolId);
      const studentCount = counts?.studentCount || 0;
      const teacherCount = counts?.teacherCount || 0;
      const classCount = counts?.classCount || 0;
      const subjectCount = counts?.subjectCount || 0;
      const structureCount = counts?.structureCount || 0;

      return {
        row,
        schoolName: school?.name || activeSchool?.name || "Selected School",
        studentCount,
        teacherCount,
        classCount,
        subjectCount,
        structureCount,
        totalUsage: studentCount + teacherCount + classCount + subjectCount + structureCount,
      };
    });
  }, [rows, branchCounts, schoolMap, activeSchool]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "current" && activeBranchId !== row.id) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.phone || ""}
          ${row.email || ""}
          ${row.address || ""}
          ${row.city || ""}
          ${item.schoolName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [viewRows, search, filterStatus, activeBranchId]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      inactive: rows.filter((row) => row.active === false).length,
      students: students.length,
      teachers: teachers.length,
      classes: classes.length,
      subjects: subjects.length,
      structures: academicStructures.length,
    };
  }, [rows, students.length, teachers.length, classes.length, subjects.length, academicStructures.length]);

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

  const handleImageUpload = async (
    field: "logo" | "photo" | "bannerImage",
    file?: File
  ) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const requireContext = () => {
    if (!authenticated || !accountId) {
      alert("Sign in first.");
      return false;
    }

    if (!schoolId) {
      alert("Select or create a school first before creating a branch.");
      return false;
    }

    return true;
  };

  const openCreate = () => {
    if (!requireContext()) return;

    setEditMode(false);
    setForm(emptyForm(schoolId));
    setDrawerOpen(true);
  };

  const openEdit = (row: Branch) => {
    setEditMode(true);

    setForm({
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      code: row.code || "",
      logo: row.logo || "",
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      city: row.city || "",
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
    if (!schoolId) return "Select or create a school first";
    if (!form.schoolId) return "Selected school is missing";

    if (Number(form.schoolId) !== Number(schoolId)) {
      return "This branch must belong to the currently selected school";
    }

    if (!form.name.trim()) return "Enter branch name";

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      const sameSchool = Number(row.schoolId) === Number(schoolId);
      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        form.code?.trim() &&
        row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return sameSchool && (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) return "A branch with this name or code already exists under the selected school";

    return null;
  };

  const save = async () => {
    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    if (!authenticated || !accountId || !schoolId) return;

    try {
      setSaving(true);

      const existing = editMode && form.id ? rows.find((row) => row.id === form.id) : undefined;

      const payload = prepareSyncData(
        {
          accountId,
          schoolId: Number(schoolId),
          name: form.name.trim(),
          code: form.code?.trim() || undefined,
          logo: form.logo || undefined,
          phone: form.phone?.trim() || undefined,
          email: form.email?.trim() || undefined,
          address: form.address?.trim() || undefined,
          city: form.city?.trim() || undefined,
          photo: form.photo || undefined,
          bannerImage: form.bannerImage || undefined,
          active: form.active !== false,
        },
        existing
      ) as Branch;

      let savedBranchId = form.id;

      if (editMode && form.id) {
        await db.branches.update(form.id, {
          accountId: payload.accountId,
          schoolId: Number(schoolId),
          cloudId: payload.cloudId,
          createdAt: payload.createdAt,
          name: payload.name,
          code: payload.code,
          logo: payload.logo,
          phone: payload.phone,
          email: payload.email,
          address: payload.address,
          city: payload.city,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        } as Partial<Branch>);
      } else {
        const id = await db.branches.add(payload);
        savedBranchId = Number(id);
      }

      await refreshInstitution();

      if (savedBranchId && !activeBranchId) {
        await setActiveBranchId(savedBranchId);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save branch:", error);
      alert("Failed to save branch");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const counts = branchCounts.get(id);
    const totalUsage =
      (counts?.studentCount || 0) +
      (counts?.teacherCount || 0) +
      (counts?.classCount || 0) +
      (counts?.subjectCount || 0) +
      (counts?.structureCount || 0);

    if (totalUsage) {
      const proceed = confirm(
        `This branch has related records (${totalUsage} total usage count). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this branch?")) {
      return;
    }

    await db.branches.update(id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Branch>);

    if (activeBranchId === id) {
      await setActiveBranchId(null);
    }

    await refreshInstitution();
    await load();
  };

  const toggleActive = async (row: Branch) => {
    if (!row.id) return;

    await db.branches.update(row.id, {
      active: row.active === false,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Branch>);

    if (activeBranchId === row.id && row.active !== false) {
      await setActiveBranchId(null);
    }

    await refreshInstitution();
    await load();
  };

  const switchBranch = async (branchId?: number) => {
    if (!branchId) return;
    await setActiveBranchId(branchId);
    await refreshInstitution();
    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="br-page" style={{ "--br-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="br-state-card">
          <div className="br-spinner" />
          <h2>Opening branches...</h2>
          <p>Checking account, selected school, branches, students, teachers, classes and structures.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="br-page" style={{ "--br-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="br-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing branches.</p>
        </section>
      </main>
    );
  }

  if (!schoolId) {
    return (
      <main className="br-page" style={{ "--br-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="br-state-card">
          <h2>Select a school first</h2>
          <p>Branches belong to a school. Create or select a school before managing branches.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="br-page" style={{ "--br-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="br-hero">
        <div className="br-hero-left">
          <div className="br-hero-icon">🏢</div>
          <div className="br-title-wrap">
            <p>School Campuses</p>
            <h2>Branches</h2>
            <span>{activeSchool?.name || schoolMap.get(schoolId)?.name || "Selected school"}</span>
          </div>
        </div>

        <button type="button" className="br-primary-btn" onClick={openCreate}>
          + Create Branch
        </button>
      </section>

      <section className="br-context-card">
        <div>
          <p>Active School Context</p>
          <h3>{activeSchool?.name || schoolMap.get(schoolId)?.name || "Selected School"}</h3>
          <span>Only branches under this school are shown here.</span>
        </div>
        <div className="br-pill-row">
          <Chip tone="blue">School ID: {schoolId}</Chip>
          <Chip tone="green">Account Scoped</Chip>
          <Chip tone="orange">{activeBranchId ? "Branch selected" : "No branch selected"}</Chip>
        </div>
      </section>

      <section className="br-summary-grid" aria-label="Branch summary">
        <SummaryCard label="Branches" value={summary.total} icon="🏢" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Students" value={summary.students} icon="🧑‍🎓" />
        <SummaryCard label="Teachers" value={summary.teachers} icon="👨‍🏫" />
        <SummaryCard label="Classes" value={summary.classes} icon="🏷" />
        <SummaryCard label="Structures" value={summary.structures} icon="🧩" />
      </section>

      <section className="br-filter-card">
        <input
          placeholder="Search branch, code, phone, email, city..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value as "all" | "active" | "inactive" | "current")}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="current">Current Branch</option>
        </select>
      </section>

      <section className="br-list">
        {filteredRows.map((item) => {
          const row = item.row;
          const isCurrentBranch = activeBranchId === row.id;

          return (
            <article key={row.id} className={`br-entity-card ${isCurrentBranch ? "current" : ""}`}>
              {(row.bannerImage || row.photo) && (
                <div
                  className="br-card-banner"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.44), rgba(15,23,42,.08)), url(${row.bannerImage || row.photo})`,
                  }}
                />
              )}

              <div className="br-card-body">
                <div className="br-card-top">
                  <Avatar name={row.name} photo={row.logo} primary={primary} />

                  <div className="br-card-main">
                    <h3>{row.name}</h3>
                    <p>{item.schoolName} · {row.city || "No city"}</p>
                    <div className="br-chip-row">
                      {row.code && <Chip tone="gray">{row.code}</Chip>}
                      <Chip tone={row.active === false ? "red" : "green"}>
                        {row.active === false ? "Inactive" : "Active"}
                      </Chip>
                      {isCurrentBranch && <Chip tone="blue">Current branch</Chip>}
                    </div>
                  </div>
                </div>

                {(row.address || row.phone || row.email) && (
                  <div className="br-contact-card">
                    {row.address && <p>{row.address}</p>}
                    <div className="br-chip-row compact">
                      {row.phone && <Chip tone="gray">{row.phone}</Chip>}
                      {row.email && <Chip tone="gray">{row.email}</Chip>}
                    </div>
                  </div>
                )}

                <div className="br-stat-grid">
                  <MiniStat label="Students" value={item.studentCount} />
                  <MiniStat label="Teachers" value={item.teacherCount} />
                  <MiniStat label="Classes" value={item.classCount} />
                  <MiniStat label="Subjects" value={item.subjectCount} />
                  <MiniStat label="Structures" value={item.structureCount} />
                </div>

                <div className="br-action-row">
                  {!isCurrentBranch && row.active !== false && (
                    <button type="button" className="primary-soft" onClick={() => switchBranch(row.id)}>
                      Switch
                    </button>
                  )}
                  <button type="button" onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button type="button" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => remove(row.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No branches found for the selected school." />}
      </section>

      {drawerOpen && (
        <div className="br-drawer-layer">
          <button type="button" className="br-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="br-drawer">
            <div className="br-drawer-head">
              <div>
                <p>Branch Setup</p>
                <h2>{editMode ? "Edit Branch" : "Create Branch"}</h2>
                <span>
                  This branch will be saved under {activeSchool?.name || schoolMap.get(schoolId)?.name || "the selected school"}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="br-form-grid">
              <section className="br-school-card">
                <span>Selected School</span>
                <strong>{activeSchool?.name || schoolMap.get(schoolId)?.name || "Selected School"}</strong>
              </section>

              <Field label="Branch Name">
                <input
                  value={form.name}
                  onChange={(event) => updateForm({ name: event.target.value })}
                  placeholder="e.g. Main Campus, East Legon Branch"
                />
              </Field>

              <div className="br-form-two">
                <Field label="Branch Code">
                  <input
                    value={form.code || ""}
                    onChange={(event) => updateForm({ code: event.target.value })}
                    placeholder="e.g. MAIN, ELG"
                  />
                </Field>

                <Field label="City">
                  <input
                    value={form.city || ""}
                    onChange={(event) => updateForm({ city: event.target.value })}
                    placeholder="e.g. Accra, Tema"
                  />
                </Field>
              </div>

              <div className="br-form-two">
                <Field label="Phone">
                  <input
                    value={form.phone || ""}
                    onChange={(event) => updateForm({ phone: event.target.value })}
                    placeholder="Phone number"
                  />
                </Field>

                <Field label="Email">
                  <input
                    value={form.email || ""}
                    onChange={(event) => updateForm({ email: event.target.value })}
                    placeholder="Email address"
                  />
                </Field>
              </div>

              <Field label="Address">
                <textarea
                  value={form.address || ""}
                  onChange={(event) => updateForm({ address: event.target.value })}
                  placeholder="Branch address"
                  rows={3}
                />
              </Field>

              <Check label="Active" checked={form.active !== false} onChange={(checked) => updateForm({ active: checked })} />

              <Field label="Branch Logo">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("logo", event.target.files?.[0])} />
                {form.logo && <img src={form.logo} alt="Branch logo" className="br-preview-logo" />}
              </Field>

              <Field label="Branch Photo">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
                {form.photo && <img src={form.photo} alt="Branch" className="br-preview-photo" />}
              </Field>

              <Field label="Branch Banner Image">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("bannerImage", event.target.files?.[0])} />
                {form.bannerImage && <img src={form.bannerImage} alt="Branch banner" className="br-preview-banner" />}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="br-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Branch"}
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
    <article className="br-summary-card">
      <div className="br-summary-icon">{icon}</div>
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
      className="br-avatar"
      style={{
        background: photo
          ? `#fff url(${photo}) center/contain no-repeat`
          : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
      }}
    >
      {!photo && name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" }) {
  return <span className={`br-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="br-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="br-empty-card">
      <div className="br-empty-icon">🏢</div>
      <h3>No branches found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="br-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="br-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes brSpin {
  to { transform: rotate(360deg); }
}

.br-page {
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

.br-page *,
.br-page *::before,
.br-page *::after {
  box-sizing: border-box;
}

.br-page button,
.br-page input,
.br-page select,
.br-page textarea {
  font: inherit;
  max-width: 100%;
}

.br-page input,
.br-page select,
.br-page textarea {
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

.br-page textarea {
  padding: 12px;
  min-height: 94px;
  resize: vertical;
}

.br-page img {
  max-width: 100%;
}

.br-state-card {
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

.br-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.br-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.br-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--br-primary) 18%, transparent);
  border-top-color: var(--br-primary);
  animation: brSpin .8s linear infinite;
}

.br-primary-btn,
.br-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--br-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.br-primary-btn:disabled,
.br-save-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.br-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--br-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.br-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.br-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--br-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--br-primary) 28%, transparent);
  font-size: 22px;
}

.br-title-wrap {
  min-width: 0;
}

.br-title-wrap p,
.br-title-wrap h2,
.br-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.br-title-wrap p {
  margin: 0 0 2px;
  color: var(--br-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.br-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.br-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.br-context-card {
  min-width: 0;
  margin-top: 8px;
  padding: 12px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  overflow: hidden;
}

.br-context-card div:first-child {
  min-width: 0;
}

.br-context-card p {
  margin: 0;
  color: var(--br-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.br-context-card h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.br-context-card span {
  display: block;
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.br-pill-row {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.br-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.br-summary-card {
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

.br-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--br-primary) 12%, #fff);
}

.br-summary-card div:last-child {
  min-width: 0;
}

.br-summary-card strong,
.br-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.br-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.br-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.br-filter-card {
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

.br-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.br-entity-card,
.br-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: linear-gradient(135deg, #fff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.br-entity-card.current {
  border-color: color-mix(in srgb, var(--br-primary) 42%, rgba(148, 163, 184, .2));
  box-shadow: 0 18px 44px color-mix(in srgb, var(--br-primary) 10%, transparent);
}

.br-card-banner {
  height: 86px;
  background-size: cover;
  background-position: center;
}

.br-card-body {
  padding: 13px;
}

.br-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.br-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 20px;
  color: #fff;
  font-weight: 1000;
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 24px rgba(15, 23, 42, .12);
}

.br-card-main {
  min-width: 0;
  flex: 1;
}

.br-card-main h3,
.br-card-main p {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.br-card-main h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.035em;
}

.br-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.br-chip-row,
.br-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.br-chip-row.compact {
  margin-top: 7px;
}

.br-chip {
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

.br-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.br-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.br-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.br-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.br-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }

.br-contact-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 17px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .12);
  overflow: hidden;
}

.br-contact-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.br-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.br-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .13);
  overflow: hidden;
}

.br-mini-stat strong,
.br-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.br-mini-stat strong {
  font-size: 18px;
  font-weight: 1000;
}

.br-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.br-action-row button {
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

.br-action-row button.primary-soft {
  color: var(--br-primary);
  background: color-mix(in srgb, var(--br-primary) 10%, #fff);
  border-color: color-mix(in srgb, var(--br-primary) 18%, rgba(148, 163, 184, .2));
}

.br-action-row button.danger {
  color: #dc2626;
  background: rgba(239, 68, 68, .08);
  border-color: rgba(239, 68, 68, .12);
}

.br-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  padding: 22px;
  text-align: center;
  border-style: dashed;
}

.br-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--br-primary) 12%, #fff);
  font-size: 28px;
}

.br-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.br-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.br-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.br-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, .52);
}

.br-drawer {
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

.br-drawer-head {
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

.br-drawer-head div {
  min-width: 0;
}

.br-drawer-head p {
  margin: 0;
  color: var(--br-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.br-drawer-head h2,
.br-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.br-drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.br-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.br-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 15px;
  background: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.br-form-grid {
  display: grid;
  gap: 12px;
}

.br-school-card {
  min-width: 0;
  padding: 12px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .14);
  overflow: hidden;
}

.br-school-card span,
.br-school-card strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.br-school-card span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.br-school-card strong {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 1000;
}

.br-form-two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.br-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.br-field > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.br-check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .14);
  font-weight: 850;
}

.br-check input {
  width: 18px;
  min-height: 18px;
  flex: 0 0 auto;
}

.br-preview-logo {
  width: 94px;
  height: 82px;
  border-radius: 16px;
  margin-top: 8px;
  object-fit: contain;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .2);
}

.br-preview-photo {
  width: 94px;
  height: 82px;
  border-radius: 16px;
  margin-top: 8px;
  object-fit: cover;
}

.br-preview-banner {
  width: 100%;
  height: 126px;
  border-radius: 16px;
  margin-top: 8px;
  object-fit: cover;
}

.br-save-btn {
  width: 100%;
}

@media (min-width: 680px) {
  .br-page {
    padding: 12px;
  }

  .br-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .br-filter-card {
    grid-template-columns: minmax(0, 1fr) minmax(180px, .45fr);
  }

  .br-form-two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .br-stat-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .br-page {
    padding: 16px;
  }

  .br-summary-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .br-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .br-page {
    padding: 6px;
  }

  .br-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .br-primary-btn {
    width: 100%;
  }

  .br-context-card {
    align-items: stretch;
  }

  .br-summary-grid {
    gap: 6px;
  }

  .br-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .br-entity-card,
  .br-empty-card {
    border-radius: 20px;
  }

  .br-card-body {
    padding: 11px;
  }

  .br-card-top {
    align-items: flex-start;
  }

  .br-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .br-action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .br-action-row button {
    width: 100%;
    padding: 0 8px;
  }

  .br-action-row button.danger {
    grid-column: 1 / -1;
  }

  .br-drawer {
    width: min(96vw, 560px);
    padding: 12px;
  }
}
`;
