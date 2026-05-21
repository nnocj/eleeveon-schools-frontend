"use client";

/**
 * schools.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE SCHOOL MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: schools
 *
 * Purpose:
 * - Create and manage school profiles under the signed-in account.
 * - Show true school-level analytics per school.
 * - Keep page-level analytics as account portfolio overview.
 *
 * Production rules:
 * - Signed-in account required.
 * - Reads/writes are account scoped.
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
  AcademicPeriod,
  AcademicStructure,
  Branch,
  Class,
  ClassSubject,
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
  name: string;
  logo?: string;
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  photo?: string;
  bannerImage?: string;
  galleryImages?: string[];
};

type SchoolView = {
  row: School;
  branchCount: number;
  activeBranchCount: number;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  subjectCount: number;
  academicStructureCount: number;
  academicPeriodCount: number;
  classSubjectCount: number;
  branchNames: string[];
  completeness: number;
};

const emptyForm = (): FormState => ({
  name: "",
  logo: "",
  motto: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  photo: "",
  bannerImage: "",
  galleryImages: [],
});

// ======================================================
// COMPONENT
// ======================================================

export default function SchoolsPage() {
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
    setActiveSchoolId,
    refreshInstitution,
    loading: contextLoading,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "current" | "ready" | "needs_branch">("all");

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
    }
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const clearData = () => {
    setRows([]);
    setBranches([]);
    setStudents([]);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setClassSubjects([]);
  };

  const sameAccount = (row: TenantRow) => row.accountId === accountId && !row.isDeleted;

  const load = async () => {
    if (!authenticated || !accountId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        schoolRows,
        branchRows,
        studentRows,
        teacherRows,
        classRows,
        subjectRows,
        structureRows,
        periodRows,
        classSubjectRows,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.classSubjects.toArray(),
      ]);

      setRows(
        schoolRows
          .filter(sameAccount)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setBranches(branchRows.filter(sameAccount));
      setStudents(studentRows.filter((row) => sameAccount(row) && row.status !== "withdrawn"));
      setTeachers(teacherRows.filter(sameAccount));
      setClasses(classRows.filter(sameAccount));
      setSubjects(subjectRows.filter(sameAccount));
      setAcademicStructures(structureRows.filter(sameAccount));
      setAcademicPeriods(periodRows.filter(sameAccount));
      setClassSubjects(classSubjectRows.filter(sameAccount));
    } catch (error) {
      console.error("Failed to load schools:", error);
      clearData();
      alert("Failed to load schools");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId]);

  // ======================================================
  // SCHOOL-SPECIFIC VIEW MODEL
  // ======================================================

  const viewRows = useMemo<SchoolView[]>(() => {
    return rows.map((row) => {
      const schoolBranches = branches.filter((branch) => branch.schoolId === row.id);
      const activeBranches = schoolBranches.filter((branch) => branch.active !== false);
      const branchIds = new Set(
        schoolBranches.map((branch) => branch.id).filter(Boolean) as number[]
      );

      const schoolStudents = students.filter((student) => branchIds.has(student.branchId));
      const schoolTeachers = teachers.filter((teacher) => branchIds.has(teacher.branchId));
      const schoolClasses = classes.filter((classRow) => branchIds.has(classRow.branchId));
      const schoolSubjects = subjects.filter((subject) => branchIds.has(subject.branchId));
      const schoolStructures = academicStructures.filter((structure) => branchIds.has(structure.branchId));
      const schoolPeriods = academicPeriods.filter((period) => branchIds.has(period.branchId));
      const schoolClassSubjects = classSubjects.filter((classSubject) => branchIds.has(classSubject.branchId));

      const completenessChecks = [
        !!row.name,
        !!row.logo,
        !!row.motto,
        !!row.phone || !!row.email,
        !!row.address,
        schoolBranches.length > 0,
        schoolStudents.length > 0,
        schoolTeachers.length > 0,
        schoolClasses.length > 0,
        schoolSubjects.length > 0,
      ];

      const completeness = Math.round(
        (completenessChecks.filter(Boolean).length / completenessChecks.length) * 100
      );

      return {
        row,
        branchCount: schoolBranches.length,
        activeBranchCount: activeBranches.length,
        studentCount: schoolStudents.length,
        teacherCount: schoolTeachers.length,
        classCount: schoolClasses.length,
        subjectCount: schoolSubjects.length,
        academicStructureCount: schoolStructures.length,
        academicPeriodCount: schoolPeriods.length,
        classSubjectCount: schoolClassSubjects.length,
        branchNames: schoolBranches.map((branch) => branch.name).slice(0, 4),
        completeness,
      };
    });
  }, [rows, branches, students, teachers, classes, subjects, academicStructures, academicPeriods, classSubjects]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterStatus === "current" && activeSchoolId !== row.id) return false;
        if (filterStatus === "ready" && item.completeness < 70) return false;
        if (filterStatus === "needs_branch" && item.branchCount > 0) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.motto || ""}
          ${row.phone || ""}
          ${row.email || ""}
          ${row.address || ""}
          ${row.website || ""}
          ${item.branchNames.join(" ")}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [viewRows, search, filterStatus, activeSchoolId]);

  // ======================================================
  // PORTFOLIO INSIGHTS
  // ======================================================

  const portfolio = useMemo(() => {
    const activeBranches = branches.filter((branch) => branch.active !== false);
    const schoolsWithBranches = viewRows.filter((item) => item.branchCount > 0).length;
    const schoolsReadyForOperations = viewRows.filter((item) => item.completeness >= 70).length;
    const unassignedSchools = viewRows.filter((item) => item.branchCount === 0).length;

    return {
      schools: rows.length,
      activeBranches: activeBranches.length,
      schoolsWithBranches,
      schoolsReadyForOperations,
      unassignedSchools,
    };
  }, [rows, branches, viewRows]);

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

  const handleGalleryUpload = async (files?: FileList | null) => {
    if (!files?.length) return;

    const images = await Promise.all(Array.from(files).map(fileToBase64));

    setForm((prev) => ({
      ...prev,
      galleryImages: [...(prev.galleryImages || []), ...images],
    }));
  };

  const removeGalleryImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      galleryImages: (prev.galleryImages || []).filter((_, i) => i !== index),
    }));
  };

  const requireAccount = () => {
    if (!authenticated || !accountId) {
      alert("Sign in first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireAccount()) return;

    setEditMode(false);
    setForm(emptyForm());
    setDrawerOpen(true);
  };

  const openEdit = (row: School) => {
    setEditMode(true);

    setForm({
      id: row.id,
      name: row.name,
      logo: row.logo || "",
      motto: row.motto || "",
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      website: row.website || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      galleryImages: row.galleryImages || [],
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!form.name.trim()) return "Enter school name";

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;
      return row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
    });

    if (duplicate) return "A school with this name already exists";

    return null;
  };

  const save = async () => {
    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    if (!authenticated || !accountId) return;

    try {
      setSaving(true);

      const existing = editMode && form.id ? rows.find((row) => row.id === form.id) : undefined;

      const payload = prepareSyncData(
        {
          accountId,
          name: form.name.trim(),
          logo: form.logo || undefined,
          motto: form.motto?.trim() || undefined,
          phone: form.phone?.trim() || undefined,
          email: form.email?.trim() || undefined,
          address: form.address?.trim() || undefined,
          website: form.website?.trim() || undefined,
          photo: form.photo || undefined,
          bannerImage: form.bannerImage || undefined,
          galleryImages: form.galleryImages || [],
        },
        existing
      ) as School;

      let savedSchoolId = form.id;

      if (editMode && form.id) {
        await db.schools.update(form.id, {
          accountId: payload.accountId,
          cloudId: payload.cloudId,
          createdAt: payload.createdAt,
          name: payload.name,
          logo: payload.logo,
          motto: payload.motto,
          phone: payload.phone,
          email: payload.email,
          address: payload.address,
          website: payload.website,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          galleryImages: payload.galleryImages,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        } as Partial<School>);
      } else {
        const id = await db.schools.add(payload);
        savedSchoolId = Number(id);
      }

      await refreshInstitution();

      if (savedSchoolId && !activeSchoolId) {
        await setActiveSchoolId(savedSchoolId);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save school:", error);
      alert("Failed to save school");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const schoolView = viewRows.find((item) => item.row.id === id);
    const branchCount = schoolView?.branchCount || 0;

    if (branchCount) {
      const proceed = confirm(`This school has ${branchCount} branch(es). Delete anyway?`);
      if (!proceed) return;
    } else if (!confirm("Delete this school?")) {
      return;
    }

    await db.schools.update(id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<School>);

    if (activeSchoolId === id) {
      await setActiveSchoolId(null);
    }

    await refreshInstitution();
    await load();
  };

  const makeActiveSchool = async (id?: number) => {
    if (!id) return;
    await setActiveSchoolId(id);
    await refreshInstitution();
    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="sc-page" style={{ "--sc-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sc-state-card">
          <div className="sc-spinner" />
          <h2>Opening schools...</h2>
          <p>Checking account, school profiles, branches, students, teachers and academic data.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sc-page" style={{ "--sc-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sc-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing schools.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="sc-page" style={{ "--sc-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sc-hero">
        <div className="sc-hero-left">
          <div className="sc-hero-icon">🏫</div>
          <div className="sc-title-wrap">
            <p>Institution Identity</p>
            <h2>Schools</h2>
            <span>Manage school profiles, branding, and school-level reach.</span>
          </div>
        </div>

        <button type="button" className="sc-primary-btn" onClick={openCreate}>
          + Create School
        </button>
      </section>

      <section className="sc-summary-grid" aria-label="School portfolio summary">
        <SummaryCard label="School Profiles" value={portfolio.schools} icon="🏫" />
        <SummaryCard label="Active Branches" value={portfolio.activeBranches} icon="🏢" />
        <SummaryCard label="With Branches" value={portfolio.schoolsWithBranches} icon="✅" />
        <SummaryCard label="Ready" value={portfolio.schoolsReadyForOperations} icon="🚀" />
        <SummaryCard label="Needs Branch" value={portfolio.unassignedSchools} icon="⚠️" />
      </section>

      <section className="sc-filter-card">
        <input
          placeholder="Search school, motto, phone, email, website, branch..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value as "all" | "current" | "ready" | "needs_branch")}
        >
          <option value="all">All Schools</option>
          <option value="current">Current School</option>
          <option value="ready">Ready Schools</option>
          <option value="needs_branch">Needs Branch Setup</option>
        </select>
      </section>

      <section className="sc-list">
        {filteredRows.map((item) => {
          const row = item.row;
          const isActiveSchool = activeSchoolId === row.id;

          return (
            <article key={row.id} className={`sc-entity-card ${isActiveSchool ? "current" : ""}`}>
              {(row.bannerImage || row.photo) && (
                <div
                  className="sc-card-banner"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.58), rgba(15,23,42,.14)), url(${row.bannerImage || row.photo})`,
                  }}
                />
              )}

              <div className="sc-card-body">
                <div className="sc-card-top">
                  <Avatar name={row.name} photo={row.logo} primary={primary} />

                  <div className="sc-card-main">
                    <h3>{row.name}</h3>
                    {row.motto ? <p className="motto">“{row.motto}”</p> : <p>No motto added</p>}

                    <div className="sc-chip-row">
                      {isActiveSchool && <Chip tone="blue">Current school</Chip>}
                      <Chip tone={item.completeness >= 70 ? "green" : "orange"}>
                        {item.completeness}% complete
                      </Chip>
                    </div>
                  </div>
                </div>

                {(row.address || row.website || row.phone || row.email) && (
                  <div className="sc-contact-card">
                    {row.address && <p>{row.address}</p>}
                    <div className="sc-chip-row compact">
                      {row.website && <Chip tone="gray">{row.website}</Chip>}
                      {row.phone && <Chip tone="gray">{row.phone}</Chip>}
                      {row.email && <Chip tone="gray">{row.email}</Chip>}
                    </div>
                  </div>
                )}

                <div className="sc-stat-grid">
                  <MiniStat label="Branches" value={item.branchCount} />
                  <MiniStat label="Active" value={item.activeBranchCount} />
                  <MiniStat label="Students" value={item.studentCount} />
                  <MiniStat label="Teachers" value={item.teacherCount} />
                  <MiniStat label="Classes" value={item.classCount} />
                  <MiniStat label="Subjects" value={item.subjectCount} />
                </div>

                <div className="sc-extra-row">
                  <Chip tone="gray">{item.academicStructureCount} structures</Chip>
                  <Chip tone="gray">{item.academicPeriodCount} periods</Chip>
                  <Chip tone="orange">{item.classSubjectCount} class subjects</Chip>
                </div>

                {!!item.branchNames.length && (
                  <div className="sc-branch-names">
                    Branches: {item.branchNames.join(", ")}
                    {item.branchCount > item.branchNames.length ? "..." : ""}
                  </div>
                )}

                <div className="sc-action-row">
                  {!isActiveSchool && (
                    <button type="button" className="primary-soft" onClick={() => makeActiveSchool(row.id)}>
                      Switch
                    </button>
                  )}
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(row.id)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No schools found under this account." />}
      </section>

      {drawerOpen && (
        <div className="sc-drawer-layer">
          <button type="button" className="sc-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="sc-drawer">
            <div className="sc-drawer-head">
              <div>
                <p>School Profile</p>
                <h2>{editMode ? "Edit School" : "Create School"}</h2>
                <span>Define the official institutional identity and branding for this account.</span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="sc-form-grid">
              <Field label="School Name">
                <input
                  value={form.name}
                  onChange={(event) => updateForm({ name: event.target.value })}
                  placeholder="Official school name"
                />
              </Field>

              <Field label="Motto">
                <input
                  value={form.motto || ""}
                  onChange={(event) => updateForm({ motto: event.target.value })}
                  placeholder="School motto"
                />
              </Field>

              <div className="sc-form-two">
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

              <Field label="Website">
                <input
                  value={form.website || ""}
                  onChange={(event) => updateForm({ website: event.target.value })}
                  placeholder="Website"
                />
              </Field>

              <Field label="Address">
                <textarea
                  value={form.address || ""}
                  onChange={(event) => updateForm({ address: event.target.value })}
                  placeholder="School address"
                  rows={3}
                />
              </Field>

              <ImageField
                label="School Logo"
                value={form.logo}
                alt="School logo"
                fit="contain"
                onChange={(file) => handleImageUpload("logo", file)}
              />

              <ImageField
                label="School Photo"
                value={form.photo}
                alt="School"
                fit="cover"
                onChange={(file) => handleImageUpload("photo", file)}
              />

              <ImageField
                label="School Banner Image"
                value={form.bannerImage}
                alt="School banner"
                fit="cover"
                wide
                onChange={(file) => handleImageUpload("bannerImage", file)}
              />

              <Field label="School Gallery">
                <input type="file" accept="image/*" multiple onChange={(event) => handleGalleryUpload(event.target.files)} />

                {!!form.galleryImages?.length && (
                  <div className="sc-gallery-grid">
                    {form.galleryImages.map((image, index) => (
                      <div key={`${image}-${index}`} className="sc-gallery-item">
                        <img src={image} alt={`Gallery ${index + 1}`} />
                        <button type="button" onClick={() => removeGalleryImage(index)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="sc-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create School"}
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
    <article className="sc-summary-card">
      <div className="sc-summary-icon">{icon}</div>
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
      className="sc-avatar"
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
  return <span className={`sc-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sc-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="sc-empty-card">
      <div className="sc-empty-icon">🏫</div>
      <h3>No schools found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="sc-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ImageField({
  label,
  value,
  alt,
  fit,
  wide,
  onChange,
}: {
  label: string;
  value?: string;
  alt: string;
  fit: "contain" | "cover";
  wide?: boolean;
  onChange: (file?: File) => void;
}) {
  return (
    <Field label={label}>
      <input type="file" accept="image/*" onChange={(event) => onChange(event.target.files?.[0])} />
      {value && (
        <img
          src={value}
          alt={alt}
          className={wide ? "sc-preview-banner" : "sc-preview-photo"}
          style={{ objectFit: fit }}
        />
      )}
    </Field>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes scSpin {
  to { transform: rotate(360deg); }
}

.sc-page {
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

.sc-page *,
.sc-page *::before,
.sc-page *::after {
  box-sizing: border-box;
}

.sc-page button,
.sc-page input,
.sc-page select,
.sc-page textarea {
  font: inherit;
  max-width: 100%;
}

.sc-page input,
.sc-page select,
.sc-page textarea {
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

.sc-page textarea {
  padding: 12px;
  min-height: 94px;
  resize: vertical;
}

.sc-page img {
  max-width: 100%;
}

.sc-state-card {
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

.sc-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sc-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.sc-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--sc-primary) 18%, transparent);
  border-top-color: var(--sc-primary);
  animation: scSpin .8s linear infinite;
}

.sc-primary-btn,
.sc-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--sc-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.sc-primary-btn:disabled,
.sc-save-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.sc-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sc-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.sc-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.sc-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--sc-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--sc-primary) 28%, transparent);
  font-size: 22px;
}

.sc-title-wrap {
  min-width: 0;
}

.sc-title-wrap p,
.sc-title-wrap h2,
.sc-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-title-wrap p {
  margin: 0 0 2px;
  color: var(--sc-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sc-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.sc-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sc-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.sc-summary-card {
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

.sc-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--sc-primary) 12%, #fff);
}

.sc-summary-card div:last-child {
  min-width: 0;
}

.sc-summary-card strong,
.sc-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.sc-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.sc-filter-card {
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

.sc-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.sc-entity-card,
.sc-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: linear-gradient(135deg, #fff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.sc-entity-card.current {
  border-color: color-mix(in srgb, var(--sc-primary) 42%, rgba(148, 163, 184, .2));
  box-shadow: 0 18px 44px color-mix(in srgb, var(--sc-primary) 10%, transparent);
}

.sc-card-banner {
  height: 104px;
  background-size: cover;
  background-position: center;
}

.sc-card-body {
  padding: 13px;
}

.sc-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.sc-avatar {
  width: 60px;
  height: 60px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 20px;
  color: #fff;
  font-weight: 1000;
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 24px rgba(15, 23, 42, .12);
}

.sc-card-main {
  min-width: 0;
  flex: 1;
}

.sc-card-main h3,
.sc-card-main p {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sc-card-main h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.035em;
}

.sc-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.sc-card-main p.motto {
  font-style: italic;
}

.sc-chip-row,
.sc-action-row,
.sc-extra-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.sc-chip-row.compact {
  margin-top: 7px;
}

.sc-chip {
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

.sc-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.sc-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.sc-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.sc-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.sc-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }

.sc-contact-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 17px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .12);
  overflow: hidden;
}

.sc-contact-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.sc-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.sc-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .13);
  overflow: hidden;
}

.sc-mini-stat strong,
.sc-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-mini-stat strong {
  font-size: 18px;
  font-weight: 1000;
}

.sc-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.sc-branch-names {
  margin-top: 8px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  overflow-wrap: anywhere;
}

.sc-action-row button {
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

.sc-action-row button.primary-soft {
  color: var(--sc-primary);
  background: color-mix(in srgb, var(--sc-primary) 10%, #fff);
  border-color: color-mix(in srgb, var(--sc-primary) 18%, rgba(148, 163, 184, .2));
}

.sc-action-row button.danger {
  color: #dc2626;
  background: rgba(239, 68, 68, .08);
  border-color: rgba(239, 68, 68, .12);
}

.sc-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  padding: 22px;
  text-align: center;
  border-style: dashed;
}

.sc-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--sc-primary) 12%, #fff);
  font-size: 28px;
}

.sc-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.sc-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.sc-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.sc-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, .52);
}

.sc-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 580px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: -24px 0 70px rgba(15, 23, 42, .22);
}

.sc-drawer-head {
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

.sc-drawer-head div {
  min-width: 0;
}

.sc-drawer-head p {
  margin: 0;
  color: var(--sc-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sc-drawer-head h2,
.sc-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sc-drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.sc-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.sc-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 15px;
  background: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.sc-form-grid {
  display: grid;
  gap: 12px;
}

.sc-form-two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.sc-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.sc-field > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.sc-preview-photo {
  width: 120px;
  height: 86px;
  border-radius: 16px;
  margin-top: 8px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .2);
}

.sc-preview-banner {
  width: 100%;
  height: 126px;
  border-radius: 16px;
  margin-top: 8px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .2);
}

.sc-gallery-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.sc-gallery-item {
  position: relative;
  min-width: 0;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, .2);
}

.sc-gallery-item img {
  width: 100%;
  height: 90px;
  display: block;
  object-fit: cover;
}

.sc-gallery-item button {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  background: rgba(220, 38, 38, .92);
  color: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.sc-save-btn {
  width: 100%;
}

@media (min-width: 680px) {
  .sc-page {
    padding: 12px;
  }

  .sc-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sc-filter-card {
    grid-template-columns: minmax(0, 1fr) minmax(180px, .45fr);
  }

  .sc-form-two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sc-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sc-gallery-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .sc-page {
    padding: 16px;
  }

  .sc-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .sc-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .sc-page {
    padding: 6px;
  }

  .sc-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .sc-primary-btn {
    width: 100%;
  }

  .sc-summary-grid {
    gap: 6px;
  }

  .sc-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .sc-entity-card,
  .sc-empty-card {
    border-radius: 20px;
  }

  .sc-card-body {
    padding: 11px;
  }

  .sc-card-top {
    align-items: flex-start;
  }

  .sc-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sc-action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sc-action-row button {
    width: 100%;
    padding: 0 8px;
  }

  .sc-action-row button.danger {
    grid-column: 1 / -1;
  }

  .sc-drawer {
    width: min(96vw, 580px);
    padding: 12px;
  }
}
`;
