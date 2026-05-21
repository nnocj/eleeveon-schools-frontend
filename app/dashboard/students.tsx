"use client";

/**
 * Students.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE STUDENT MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: students
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch -> Students
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Soft delete only.
 * - Mobile-first cards and responsive drawer.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SyncStatus } from "../lib/constants/syncStatus";
import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  Class,
  Organization,
  Student,
  StudentEnrollment,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  organizationId?: number;
  currentClassId?: number;
  admissionNumber?: string;
  fullName: string;
  gender?: string;
  age?: number;
  dateOfBirth?: string;
  photo?: string;
  coverPhoto?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  address?: string;
  status?: StudentStatus;
};

type StudentView = {
  row: Student;
  className: string;
  organizationName: string;
  enrollmentCount: number;
  activeEnrollment?: StudentEnrollment;
};

const emptyForm: FormState = {
  organizationId: undefined,
  currentClassId: undefined,
  admissionNumber: "",
  fullName: "",
  gender: "",
  age: undefined,
  dateOfBirth: "",
  photo: "",
  coverPhoto: "",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  address: "",
  status: "active",
};

function statusTone(status?: StudentStatus): "green" | "red" | "blue" | "orange" | "gray" {
  if (!status || status === "active") return "green";
  if (status === "graduated") return "blue";
  if (status === "transferred") return "orange";
  if (status === "withdrawn") return "red";
  return "gray";
}

function statusLabel(status?: StudentStatus) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ======================================================
// COMPONENT
// ======================================================

export default function StudentsPage() {
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

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);

  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | StudentStatus>("all");
  const [filterGender, setFilterGender] = useState<"all" | string>("all");

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
    setClasses([]);
    setOrganizations([]);
    setEnrollments([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

      const [studentRows, classRows, organizationRows, enrollmentRows] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.organizations.toArray(),
        db.studentEnrollments.toArray(),
      ]);

      setRows(
        studentRows
          .filter(sameTenant)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setEnrollments(enrollmentRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load students:", error);
      clearData();
      alert("Failed to load students");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);

  const organizationMap = useMemo(
    () => new Map(organizations.map((row) => [row.id, row])),
    [organizations]
  );

  const enrollmentMap = useMemo(() => {
    const map = new Map<number, StudentEnrollment[]>();

    enrollments.forEach((row) => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });

    return map;
  }, [enrollments]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<StudentView[]>(() => {
    return rows.map((row) => {
      const studentEnrollments = enrollmentMap.get(row.id || 0) || [];
      const activeEnrollment = studentEnrollments.find((item) => item.status === "active");
      const resolvedClassId = activeEnrollment?.classId || row.currentClassId;
      const classData = resolvedClassId ? classMap.get(resolvedClassId) : undefined;
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;

      return {
        row,
        className: classData?.name || "No class assigned",
        organizationName: organization?.name || "No organization",
        enrollmentCount: studentEnrollments.length,
        activeEnrollment,
      };
    });
  }, [rows, enrollmentMap, classMap, organizationMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterClassId) {
          const activeClassId = item.activeEnrollment?.classId || row.currentClassId;
          if (activeClassId !== filterClassId) return false;
        }

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus !== "all" && row.status !== filterStatus) return false;
        if (filterGender !== "all" && row.gender !== filterGender) return false;

        if (!query) return true;

        return `
          ${row.fullName}
          ${row.admissionNumber || ""}
          ${row.gender || ""}
          ${row.parentName || ""}
          ${row.parentPhone || ""}
          ${row.parentEmail || ""}
          ${row.address || ""}
          ${row.status || ""}
          ${item.className}
          ${item.organizationName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.fullName.localeCompare(b.row.fullName));
  }, [viewRows, search, filterClassId, filterOrganizationId, filterStatus, filterGender]);

  const statusCounts = useMemo(() => {
    return {
      active: rows.filter((row) => row.status === "active" || !row.status).length,
      graduated: rows.filter((row) => row.status === "graduated").length,
      transferred: rows.filter((row) => row.status === "transferred").length,
      withdrawn: rows.filter((row) => row.status === "withdrawn").length,
      withClass: new Set(enrollments.filter((row) => row.status === "active").map((row) => row.studentId)).size,
    };
  }, [rows, enrollments]);

  const genderOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.gender).filter(Boolean))) as string[];
  }, [rows]);

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

  const handleImageUpload = async (field: "photo" | "coverPhoto", file?: File) => {
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

  const openEdit = (row: Student) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      currentClassId: row.currentClassId,
      admissionNumber: row.admissionNumber || "",
      fullName: row.fullName,
      gender: row.gender || "",
      age: row.age,
      dateOfBirth: row.dateOfBirth || "",
      photo: row.photo || "",
      coverPhoto: row.coverPhoto || "",
      parentName: row.parentName || "",
      parentPhone: row.parentPhone || "",
      parentEmail: row.parentEmail || "",
      address: row.address || "",
      status: row.status || "active",
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId) return "Select a school first";
    if (!branchId) return "Select a branch first";
    if (!form.fullName.trim()) return "Enter student full name";

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      const sameAdmission =
        form.admissionNumber?.trim() &&
        row.admissionNumber?.trim().toLowerCase() === form.admissionNumber.trim().toLowerCase();

      return !!sameAdmission && !row.isDeleted;
    });

    if (duplicate) return "A student with this admission number already exists in this branch";

    if (form.currentClassId && !classMap.get(Number(form.currentClassId))) {
      return "Selected class is not in this branch";
    }

    if (form.organizationId && !organizationMap.get(Number(form.organizationId))) {
      return "Selected organization is not in this branch";
    }

    return null;
  };

  const save = async () => {
    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    if (!authenticated || !accountId || !schoolId || !branchId) return;

    try {
      setSaving(true);

      const existing = editMode && form.id ? rows.find((row) => row.id === form.id) : undefined;

      const payload = prepareSyncData(
        {
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
          organizationId: form.organizationId ? Number(form.organizationId) : undefined,
          currentClassId: form.currentClassId ? Number(form.currentClassId) : undefined,
          admissionNumber: form.admissionNumber?.trim() || undefined,
          fullName: form.fullName.trim(),
          gender: form.gender?.trim() || undefined,
          age: form.age == null ? undefined : Number(form.age),
          dateOfBirth: form.dateOfBirth || undefined,
          photo: form.photo || undefined,
          coverPhoto: form.coverPhoto || undefined,
          parentName: form.parentName?.trim() || undefined,
          parentPhone: form.parentPhone?.trim() || undefined,
          parentEmail: form.parentEmail?.trim() || undefined,
          address: form.address?.trim() || undefined,
          status: form.status || "active",
        },
        existing
      ) as Student;

      if (editMode && form.id) {
        await db.students.update(form.id, {
          accountId: payload.accountId,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          cloudId: payload.cloudId,
          createdAt: payload.createdAt,
          organizationId: payload.organizationId,
          currentClassId: payload.currentClassId,
          admissionNumber: payload.admissionNumber,
          fullName: payload.fullName,
          gender: payload.gender,
          age: payload.age,
          dateOfBirth: payload.dateOfBirth,
          photo: payload.photo,
          coverPhoto: payload.coverPhoto,
          parentName: payload.parentName,
          parentPhone: payload.parentPhone,
          parentEmail: payload.parentEmail,
          address: payload.address,
          status: payload.status,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        } as Partial<Student>);
      } else {
        await db.students.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save student:", error);
      alert("Failed to save student");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const enrollmentCount = enrollmentMap.get(id)?.length || 0;

    if (enrollmentCount) {
      const proceed = confirm(
        `This student has ${enrollmentCount} enrollment record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this student?")) {
      return;
    }

    await db.students.update(id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Student>);

    await load();
  };

  const setStatus = async (row: Student, status: StudentStatus) => {
    if (!row.id) return;

    await db.students.update(row.id, {
      status,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Student>);

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <main className="stu-page" style={{ "--stu-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="stu-state-card">
          <div className="stu-spinner" />
          <h2>Opening students...</h2>
          <p>Checking account, branch, classes, organizations, enrollments, and student records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="stu-page" style={{ "--stu-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="stu-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing students.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="stu-page" style={{ "--stu-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="stu-state-card">
          <h2>Select a branch first</h2>
          <p>Students belong to one active school branch.</p>
          <button type="button" className="stu-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="stu-page" style={{ "--stu-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="stu-hero">
        <div className="stu-hero-left">
          <div className="stu-hero-icon">🎓</div>
          <div className="stu-title-wrap">
            <p>People Records</p>
            <h2>Students</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="stu-primary-btn" onClick={openCreate}>
          + Add Student
        </button>
      </section>

      <section className="stu-context-card">
        <div>
          <p>Student Scope</p>
          <h3>{statusCounts.active} active student(s)</h3>
          <span>{rows.length} total student record(s) in this branch</span>
        </div>
        <div className="stu-pill-row">
          <Chip tone="blue">Same Tenant</Chip>
          <Chip tone="green">Branch Scoped</Chip>
          <Chip tone="purple">{statusCounts.withClass} With Class</Chip>
        </div>
      </section>

      <section className="stu-summary-grid" aria-label="Student summary">
        <SummaryCard label="Total Students" value={rows.length} icon="👥" />
        <SummaryCard label="Active" value={statusCounts.active} icon="✅" />
        <SummaryCard label="Graduated" value={statusCounts.graduated} icon="🎯" />
        <SummaryCard label="Transferred" value={statusCounts.transferred} icon="🔁" />
        <SummaryCard label="Withdrawn" value={statusCounts.withdrawn} icon="🚪" />
        <SummaryCard label="With Class" value={statusCounts.withClass} icon="🏫" />
      </section>

      <section className="stu-filter-card">
        <input
          placeholder="Search name, admission number, parent, class..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterClassId || ""}
          onChange={(event) => setFilterClassId(Number(event.target.value) || undefined)}
        >
          <option value="">All Classes</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterOrganizationId || ""}
          onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}
        >
          <option value="">All Organizations</option>
          {organizations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {row.type}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value as "all" | StudentStatus)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="graduated">Graduated</option>
          <option value="transferred">Transferred</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <select value={filterGender} onChange={(event) => setFilterGender(event.target.value)}>
          <option value="all">All Gender</option>
          {genderOptions.map((gender) => (
            <option key={gender} value={gender}>
              {gender}
            </option>
          ))}
        </select>
      </section>

      <section className="stu-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="stu-card">
              {row.coverPhoto && (
                <div
                  className="stu-cover"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.46), rgba(15,23,42,.08)), url(${row.coverPhoto})`,
                  }}
                />
              )}

              <div className="stu-card-inner">
                <div className="stu-card-top">
                  <div
                    className="stu-avatar"
                    style={{
                      background: row.photo
                        ? `url(${row.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
                    }}
                  >
                    {!row.photo && row.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="stu-main-info">
                    <h3>{row.fullName}</h3>
                    <p>{item.className} · {item.organizationName}</p>

                    <div className="stu-chip-row">
                      {row.admissionNumber && <Chip tone="gray">{row.admissionNumber}</Chip>}
                      <Chip tone={statusTone(row.status)}>{statusLabel(row.status)}</Chip>
                      {row.gender && <Chip tone="blue">{row.gender}</Chip>}
                      <Chip tone="purple">{item.enrollmentCount} enrollment(s)</Chip>
                    </div>
                  </div>
                </div>

                <div className="stu-info-grid">
                  <MiniStat label="Parent" value={row.parentName || "No parent"} />
                  <MiniStat label="Phone" value={row.parentPhone || "No phone"} />
                  <MiniStat label="Email" value={row.parentEmail || "No email"} />
                </div>

                {row.address && <p className="stu-address">{row.address}</p>}

                <div className="stu-action-row">
                  {row.status !== "active" && (
                    <button type="button" onClick={() => setStatus(row, "active")}>
                      Activate
                    </button>
                  )}
                  {row.status !== "graduated" && (
                    <button type="button" onClick={() => setStatus(row, "graduated")}>
                      Graduate
                    </button>
                  )}
                  {row.status !== "transferred" && (
                    <button type="button" onClick={() => setStatus(row, "transferred")}>
                      Transfer
                    </button>
                  )}
                  {row.status !== "withdrawn" && (
                    <button type="button" onClick={() => setStatus(row, "withdrawn")}>
                      Withdraw
                    </button>
                  )}
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

        {!filteredRows.length && <EmptyCard text="No students found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="stu-drawer-layer">
          <button type="button" aria-label="Close drawer" className="stu-drawer-overlay" onClick={() => setDrawerOpen(false)} />

          <aside className="stu-drawer">
            <div className="stu-drawer-head">
              <div>
                <p>Student Record</p>
                <h2>{editMode ? "Edit Student" : "Add Student"}</h2>
                <span>
                  Student will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="stu-form-grid">
              <Field label="Full Name">
                <input
                  value={form.fullName}
                  onChange={(event) => updateForm({ fullName: event.target.value })}
                  placeholder="Student full name"
                />
              </Field>

              <div className="stu-form-two">
                <Field label="Admission Number">
                  <input
                    value={form.admissionNumber || ""}
                    onChange={(event) => updateForm({ admissionNumber: event.target.value })}
                    placeholder="Admission number"
                  />
                </Field>

                <Field label="Gender">
                  <select
                    value={form.gender || ""}
                    onChange={(event) => updateForm({ gender: event.target.value || undefined })}
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
              </div>

              <div className="stu-form-two">
                <Field label="Date of Birth">
                  <input
                    type="date"
                    value={form.dateOfBirth || ""}
                    onChange={(event) => updateForm({ dateOfBirth: event.target.value })}
                  />
                </Field>

                <Field label="Age">
                  <input
                    type="number"
                    value={form.age ?? ""}
                    onChange={(event) => updateForm({ age: event.target.value === "" ? undefined : Number(event.target.value) })}
                    placeholder="Age"
                  />
                </Field>
              </div>

              <Field label="Current Class">
                <select
                  value={form.currentClassId || ""}
                  onChange={(event) => updateForm({ currentClassId: Number(event.target.value) || undefined })}
                >
                  <option value="">No class assigned</option>
                  {classes.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Organization / House / Department">
                <select
                  value={form.organizationId || ""}
                  onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}
                >
                  <option value="">No organization</option>
                  {organizations.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.type}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={form.status || "active"}
                  onChange={(event) => updateForm({ status: event.target.value as StudentStatus })}
                >
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="transferred">Transferred</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </Field>

              <section className="stu-sub-card">
                <h3>Parent / Guardian Information</h3>

                <div className="stu-form-grid compact">
                  <Field label="Parent / Guardian Name">
                    <input
                      value={form.parentName || ""}
                      onChange={(event) => updateForm({ parentName: event.target.value })}
                      placeholder="Parent / guardian name"
                    />
                  </Field>

                  <div className="stu-form-two">
                    <Field label="Parent Phone">
                      <input
                        value={form.parentPhone || ""}
                        onChange={(event) => updateForm({ parentPhone: event.target.value })}
                        placeholder="Parent phone"
                      />
                    </Field>

                    <Field label="Parent Email">
                      <input
                        value={form.parentEmail || ""}
                        onChange={(event) => updateForm({ parentEmail: event.target.value })}
                        placeholder="Parent email"
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <Field label="Address">
                <textarea
                  value={form.address || ""}
                  onChange={(event) => updateForm({ address: event.target.value })}
                  placeholder="Student address"
                  rows={3}
                />
              </Field>

              <div className="stu-form-two">
                <FileField
                  label="Student Photo"
                  value={form.photo}
                  alt="Student"
                  onChange={(file) => handleImageUpload("photo", file)}
                />

                <FileField
                  label="Cover Photo"
                  value={form.coverPhoto}
                  alt="Student cover"
                  wide
                  onChange={(file) => handleImageUpload("coverPhoto", file)}
                />
              </div>

              <button type="button" onClick={save} disabled={saving} className="stu-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Add Student"}
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
    <article className="stu-summary-card">
      <div className="stu-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`stu-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stu-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="stu-empty-card">
      <div className="stu-empty-icon">🎓</div>
      <h3>No students found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="stu-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FileField({
  label,
  value,
  alt,
  wide,
  onChange,
}: {
  label: string;
  value?: string;
  alt: string;
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
          className={wide ? "stu-preview wide" : "stu-preview"}
        />
      )}
    </Field>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes stuSpin { to { transform: rotate(360deg); } }

.stu-page {
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
.stu-page *, .stu-page *::before, .stu-page *::after { box-sizing: border-box; }
.stu-page button, .stu-page input, .stu-page select, .stu-page textarea { font: inherit; max-width: 100%; }
.stu-page img { max-width: 100%; }
.stu-page input,
.stu-page select,
.stu-page textarea {
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
.stu-page textarea {
  min-height: 92px;
  padding: 12px;
  resize: vertical;
}
.stu-page input[type="file"] {
  padding: 10px;
  font-size: 12px;
}

.stu-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.stu-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.stu-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.stu-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--stu-primary) 18%, transparent); border-top-color: var(--stu-primary); animation: stuSpin .8s linear infinite; }

.stu-primary-btn,
.stu-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--stu-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.stu-save-btn { width: 100%; }
.stu-primary-btn:disabled,
.stu-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.stu-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--stu-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.stu-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.stu-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--stu-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--stu-primary) 28%, transparent); font-size: 22px; }
.stu-title-wrap { min-width: 0; }
.stu-title-wrap p, .stu-title-wrap h2, .stu-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stu-title-wrap p { margin: 0 0 2px; color: var(--stu-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.stu-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.stu-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.stu-context-card,
.stu-filter-card,
.stu-card,
.stu-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}
.stu-context-card {
  padding: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--stu-primary) 10%, #fff), #fff 68%);
}
.stu-context-card p { margin: 0; color: var(--stu-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.stu-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.stu-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.stu-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }

.stu-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.stu-summary-card {
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
.stu-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--stu-primary) 12%, #fff); }
.stu-summary-card div:last-child { min-width: 0; }
.stu-summary-card strong, .stu-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stu-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.stu-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.stu-filter-card {
  padding: 13px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.stu-list { display: grid; gap: 10px; margin-top: 10px; }
.stu-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.stu-cover { height: 90px; background-size: cover; background-position: center; }
.stu-card-inner { padding: 13px; }
.stu-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.stu-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.stu-main-info { min-width: 0; flex: 1; }
.stu-main-info h3, .stu-main-info p { display: block; overflow: hidden; text-overflow: ellipsis; }
.stu-main-info h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.stu-main-info p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.stu-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.stu-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stu-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.stu-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.stu-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.stu-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.stu-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.stu-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.stu-info-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 12px; }
.stu-mini-stat { min-width: 0; padding: 10px; border-radius: 17px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); }
.stu-mini-stat strong, .stu-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stu-mini-stat strong { font-size: 13px; font-weight: 1000; }
.stu-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.stu-address { margin: 10px 0 0; padding: 10px; border-radius: 17px; background: rgba(148, 163, 184, .08); color: var(--muted, #64748b); font-size: 12px; line-height: 1.5; font-weight: 700; }
.stu-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.stu-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.stu-action-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.13); }
.stu-empty-card { padding: 13px; display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.stu-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--stu-primary) 12%, #fff); font-size: 28px; }
.stu-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.stu-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.stu-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.stu-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.stu-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.stu-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.stu-drawer-head div { min-width: 0; }
.stu-drawer-head p { margin: 0; color: var(--stu-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.stu-drawer-head h2, .stu-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.stu-drawer-head h2 { margin: 2px 0 0; font-size: 24px; font-weight: 1000; letter-spacing: -.05em; }
.stu-drawer-head span { margin-top: 5px; color: var(--muted, #64748b); font-size: 12px; line-height: 1.4; font-weight: 700; }
.stu-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border-radius: 999px; border: 1px solid rgba(148, 163, 184, .24); background: var(--surface, #fff); color: var(--text, #0f172a); font-weight: 1000; cursor: pointer; }
.stu-form-grid { display: grid; gap: 12px; }
.stu-form-grid.compact { gap: 10px; }
.stu-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.stu-field { display: grid; gap: 6px; min-width: 0; }
.stu-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.stu-sub-card { padding: 12px; border-radius: 19px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .14); }
.stu-sub-card h3 { margin: 0 0 10px; font-size: 15px; font-weight: 1000; }
.stu-preview { width: 92px; height: 84px; border-radius: 16px; margin-top: 8px; object-fit: cover; display: block; border: 1px solid rgba(148, 163, 184, .24); }
.stu-preview.wide { width: 100%; max-width: 260px; }

@media (max-width: 390px) {
  .stu-page { padding: 6px; }
  .stu-hero { padding: 10px; border-radius: 24px; flex-wrap: wrap; }
  .stu-hero-icon { width: 42px; height: 42px; border-radius: 16px; }
  .stu-hero .stu-primary-btn { width: 100%; }
  .stu-summary-grid { grid-template-columns: minmax(0, 1fr); }
  .stu-card-top { flex-direction: column; }
  .stu-action-row { grid-template-columns: minmax(0, 1fr); }
}

@media (min-width: 560px) {
  .stu-page { padding: 14px; }
  .stu-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stu-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stu-info-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stu-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stu-action-row { display: flex; flex-wrap: wrap; justify-content: flex-end; }
  .stu-action-row button { padding: 0 14px; }
}

@media (min-width: 980px) {
  .stu-page { padding: 18px; }
  .stu-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .stu-filter-card { grid-template-columns: minmax(260px, 1.4fr) repeat(4, minmax(150px, 1fr)); }
  .stu-card-inner { padding: 16px; }
  .stu-card-top { align-items: center; }
}
`;
