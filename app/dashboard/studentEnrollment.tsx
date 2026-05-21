"use client";

/**
 * StudentEnrollment.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE STUDENT CLASS ENROLLMENT MANAGEMENT
 * ---------------------------------------------------------
 *
 * DB table: studentEnrollments
 *
 * Actual DB model reminder:
 * - There is NO active field on StudentEnrollment.
 * - Status uses promoted, NOT transferred.
 * - academicStructureId and startDate are required.
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch
 * -> Student -> Class -> AcademicStructure -> AcademicPeriod
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Prevent duplicate enrollment for the same student/class/period.
 * - Prevent more than one active enrollment in the same academic period.
 * - Mobile-first enrollment cards and responsive drawer.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Class,
  Student,
  StudentEnrollment,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { SyncStatus } from "../lib/constants/syncStatus";

// ======================================================
// TYPES
// ======================================================

type EnrollmentStatus = "active" | "completed" | "promoted" | "withdrawn";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  studentId?: number;
  classId?: number;
  academicStructureId?: number;
  academicPeriodId?: number;
  startDate: string;
  endDate?: string;
  status: EnrollmentStatus;
  updateStudentCurrentClass?: boolean;
};

type EnrollmentView = {
  row: StudentEnrollment;
  student?: Student;
  studentName: string;
  admissionNumber?: string;
  className: string;
  academicStructureName: string;
  academicPeriodName: string;
  studentCurrentClassName: string;
  currentClassMatches: boolean;
};

// ======================================================
// DATE HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm: FormState = {
  studentId: undefined,
  classId: undefined,
  academicStructureId: undefined,
  academicPeriodId: undefined,
  startDate: todayISO(),
  endDate: "",
  status: "active",
  updateStudentCurrentClass: true,
};

function statusTone(status?: EnrollmentStatus): "green" | "blue" | "orange" | "red" | "gray" {
  if (status === "completed") return "blue";
  if (status === "promoted") return "orange";
  if (status === "withdrawn") return "red";
  if (status === "active" || !status) return "green";
  return "gray";
}

function statusLabel(status?: EnrollmentStatus) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ======================================================
// COMPONENT
// ======================================================

export default function StudentEnrollmentsPage() {
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

  const [rows, setRows] = useState<StudentEnrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);

  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterStructureId, setFilterStructureId] = useState<number | undefined>();
  const [filterPeriodId, setFilterPeriodId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | EnrollmentStatus>("all");

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
    setClasses([]);
    setAcademicStructures([]);
    setPeriods([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [enrollmentRows, studentRows, classRows, structureRows, periodRows] =
        await Promise.all([
          db.studentEnrollments.toArray(),
          db.students.toArray(),
          db.classes.toArray(),
          db.academicStructures.toArray(),
          db.academicPeriods.toArray(),
        ]);

      setRows(enrollmentRows.filter(sameTenant));

      setStudents(
        studentRows
          .filter((row) => sameTenant(row) && row.status !== "withdrawn" && row.status !== "graduated")
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAcademicStructures(
        structureRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setPeriods(
        periodRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
    } catch (error) {
      console.error("Failed to load student enrollments:", error);
      clearData();
      alert("Failed to load student enrollments");
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

  const studentMap = useMemo(() => new Map(students.map((row) => [row.id, row])), [students]);
  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row) => [row.id, row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(periods.map((row) => [row.id, row])), [periods]);

  const filteredPeriodsForForm = useMemo(() => {
    if (!form.academicStructureId) return periods;
    return periods.filter((row) => row.academicStructureId === form.academicStructureId);
  }, [periods, form.academicStructureId]);

  const filteredPeriodsForFilter = useMemo(() => {
    if (!filterStructureId) return periods;
    return periods.filter((row) => row.academicStructureId === filterStructureId);
  }, [periods, filterStructureId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<EnrollmentView[]>(() => {
    return rows.map((row) => {
      const student = studentMap.get(row.studentId);
      const classRow = classMap.get(row.classId);
      const structure = structureMap.get(row.academicStructureId);
      const period = periodMap.get(row.academicPeriodId);
      const currentClass = student?.currentClassId ? classMap.get(student.currentClassId) : undefined;
      const className = classRow?.name || `Class #${row.classId}`;
      const studentCurrentClassName = currentClass?.name || "No current class";

      return {
        row,
        student,
        studentName: student?.fullName || `Student #${row.studentId}`,
        admissionNumber: student?.admissionNumber,
        className,
        academicStructureName: structure?.name || `Structure #${row.academicStructureId}`,
        academicPeriodName: period?.name || `Period #${row.academicPeriodId}`,
        studentCurrentClassName,
        currentClassMatches: student?.currentClassId === row.classId,
      };
    });
  }, [rows, studentMap, classMap, structureMap, periodMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterClassId && row.classId !== filterClassId) return false;
        if (filterStructureId && row.academicStructureId !== filterStructureId) return false;
        if (filterPeriodId && row.academicPeriodId !== filterPeriodId) return false;
        if (filterStatus !== "all" && row.status !== filterStatus) return false;

        if (!query) return true;

        return `
          ${item.studentName}
          ${item.admissionNumber || ""}
          ${item.className}
          ${item.academicStructureName}
          ${item.academicPeriodName}
          ${item.studentCurrentClassName}
          ${row.status || ""}
          ${row.startDate || ""}
          ${row.endDate || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const byClass = a.className.localeCompare(b.className);
        if (byClass !== 0) return byClass;
        return a.studentName.localeCompare(b.studentName);
      });
  }, [viewRows, search, filterClassId, filterStructureId, filterPeriodId, filterStatus]);

  const summary = useMemo(() => {
    const active = rows.filter((row) => row.status === "active");
    const activeStudents = new Set(active.map((row) => row.studentId)).size;
    const classCoverage = classes.length
      ? Math.round((new Set(active.map((row) => row.classId)).size / classes.length) * 100)
      : 0;

    return {
      total: rows.length,
      active: active.length,
      completed: rows.filter((row) => row.status === "completed").length,
      promoted: rows.filter((row) => row.status === "promoted").length,
      withdrawn: rows.filter((row) => row.status === "withdrawn").length,
      enrolledStudents: activeStudents,
      classCoverage,
    };
  }, [rows, classes.length]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
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

    const selectedPeriod = settings?.currentAcademicPeriodId
      ? periods.find((row) => row.id === settings.currentAcademicPeriodId)
      : undefined;

    setEditMode(false);
    setForm({
      ...emptyForm,
      classId: filterClassId,
      academicStructureId: filterStructureId || selectedPeriod?.academicStructureId || settings?.currentAcademicStructureId,
      academicPeriodId: filterPeriodId || settings?.currentAcademicPeriodId,
      startDate: selectedPeriod?.startDate || todayISO(),
      endDate: "",
      status: "active",
      updateStudentCurrentClass: true,
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: StudentEnrollment) => {
    setEditMode(true);
    setForm({
      id: row.id,
      studentId: row.studentId,
      classId: row.classId,
      academicStructureId: row.academicStructureId,
      academicPeriodId: row.academicPeriodId,
      startDate: row.startDate,
      endDate: row.endDate || "",
      status: row.status,
      updateStudentCurrentClass: false,
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
    if (!form.studentId) return "Select student";
    if (!form.classId) return "Select class";
    if (!form.academicStructureId) return "Select academic structure";
    if (!form.academicPeriodId) return "Select academic period";
    if (!form.startDate) return "Select start date";

    const selectedStudent = studentMap.get(form.studentId);
    if (!selectedStudent) return "Selected student is not in this branch";

    const selectedClass = classMap.get(form.classId);
    if (!selectedClass) return "Selected class is not in this branch";

    const selectedStructure = structureMap.get(form.academicStructureId);
    if (!selectedStructure) return "Selected academic structure is not in this branch";

    const selectedPeriod = periodMap.get(form.academicPeriodId);
    if (!selectedPeriod) return "Selected academic period is not in this branch";

    if (selectedPeriod.academicStructureId !== Number(form.academicStructureId)) {
      return "Selected academic period does not belong to the selected academic structure";
    }

    if (form.endDate && form.endDate < form.startDate) {
      return "End date cannot be before start date";
    }

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      return (
        row.studentId === Number(form.studentId) &&
        row.classId === Number(form.classId) &&
        row.academicStructureId === Number(form.academicStructureId) &&
        row.academicPeriodId === Number(form.academicPeriodId) &&
        !row.isDeleted
      );
    });

    if (duplicate) return "This student is already enrolled in this class for this academic period";

    const activeClassInSamePeriod = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      return (
        row.studentId === Number(form.studentId) &&
        row.academicStructureId === Number(form.academicStructureId) &&
        row.academicPeriodId === Number(form.academicPeriodId) &&
        row.status === "active" &&
        !row.isDeleted
      );
    });

    if (activeClassInSamePeriod && form.status === "active") {
      return "This student already has an active class enrollment for this academic period";
    }

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
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        studentId: Number(form.studentId),
        classId: Number(form.classId),
        academicStructureId: Number(form.academicStructureId),
        academicPeriodId: Number(form.academicPeriodId),
        startDate: form.startDate,
        endDate: form.endDate?.trim() || undefined,
        status: form.status,
      }) as StudentEnrollment;

      if (editMode && form.id) {
        await db.studentEnrollments.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        } as Partial<StudentEnrollment>);
      } else {
        await db.studentEnrollments.add(payload);
      }

      if (form.updateStudentCurrentClass && form.studentId && form.classId && form.status === "active") {
        await db.students.update(Number(form.studentId), {
          currentClassId: Number(form.classId),
          synced: SyncStatus.PENDING,
          updatedAt: Date.now(),
        } as Partial<Student>);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save student enrollment:", error);
      alert("Failed to save student enrollment");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: StudentEnrollment) => {
    if (!row.id) return;
    if (!confirm("Delete this student enrollment record?")) return;

    await db.studentEnrollments.update(row.id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<StudentEnrollment>);

    await load();
  };

  const setStatus = async (row: StudentEnrollment, status: EnrollmentStatus) => {
    if (!row.id) return;

    const patch: Partial<StudentEnrollment> = {
      status,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    };

    if ((status === "completed" || status === "promoted" || status === "withdrawn") && !row.endDate) {
      patch.endDate = todayISO();
    }

    if (status === "active") {
      patch.endDate = undefined;
    }

    await db.studentEnrollments.update(row.id, patch);

    if (status === "active") {
      await db.students.update(row.studentId, {
        currentClassId: row.classId,
        synced: SyncStatus.PENDING,
        updatedAt: Date.now(),
      } as Partial<Student>);
    }

    await load();
  };

  const syncCurrentClass = async (row: StudentEnrollment) => {
    await db.students.update(row.studentId, {
      currentClassId: row.classId,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Student>);

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="sen-page" style={{ "--sen-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sen-state-card">
          <div className="sen-spinner" />
          <h2>Opening student enrollments...</h2>
          <p>Checking account, branch, students, classes, academic structures, and periods.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sen-page" style={{ "--sen-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sen-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing student enrollments.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="sen-page" style={{ "--sen-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sen-state-card">
          <h2>Select a branch first</h2>
          <p>Student enrollments belong to one active school branch.</p>
          <button type="button" className="sen-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="sen-page" style={{ "--sen-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sen-hero">
        <div className="sen-hero-left">
          <div className="sen-hero-icon">📋</div>
          <div className="sen-title-wrap">
            <p>Class Placement</p>
            <h2>Student Enrollments</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="sen-primary-btn" onClick={openCreate}>
          + Enroll Student
        </button>
      </section>

      <section className="sen-context-card">
        <div>
          <p>Enrollment Scope</p>
          <h3>{summary.enrolledStudents} active student(s)</h3>
          <span>{summary.active} active enrollment(s) across {classes.length} class(es)</span>
        </div>
        <div className="sen-pill-row">
          <Chip tone="blue">Same Tenant</Chip>
          <Chip tone="green">Branch Scoped</Chip>
          <Chip tone={summary.classCoverage >= 60 ? "green" : "orange"}>{summary.classCoverage}% Class Coverage</Chip>
        </div>
      </section>

      <section className="sen-summary-grid" aria-label="Student enrollment summary">
        <SummaryCard label="Records" value={summary.total} icon="📌" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Completed" value={summary.completed} icon="🎯" />
        <SummaryCard label="Promoted" value={summary.promoted} icon="🚀" />
        <SummaryCard label="Withdrawn" value={summary.withdrawn} icon="🚪" />
        <SummaryCard label="Active Students" value={summary.enrolledStudents} icon="🎓" />
      </section>

      <section className="sen-filter-card">
        <input
          placeholder="Search student, admission number, class, period..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterClassId || ""} onChange={(event) => setFilterClassId(Number(event.target.value) || undefined)}>
          <option value="">All Classes</option>
          {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select
          value={filterStructureId || ""}
          onChange={(event) => {
            setFilterStructureId(Number(event.target.value) || undefined);
            setFilterPeriodId(undefined);
          }}
        >
          <option value="">All Academic Structures</option>
          {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.level}</option>)}
        </select>

        <select value={filterPeriodId || ""} onChange={(event) => setFilterPeriodId(Number(event.target.value) || undefined)}>
          <option value="">All Academic Periods</option>
          {filteredPeriodsForFilter.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="promoted">Promoted</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </section>

      <section className="sen-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="sen-enrollment-card">
              <div className="sen-card-top">
                <div
                  className="sen-avatar"
                  style={{
                    background: item.student?.photo
                      ? `url(${item.student.photo}) center/cover`
                      : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
                  }}
                >
                  {!item.student?.photo && item.studentName.slice(0, 1).toUpperCase()}
                </div>

                <div className="sen-card-main">
                  <h3>{item.studentName}</h3>
                  <p>{item.admissionNumber || "No admission number"}</p>
                  <div className="sen-chip-row">
                    <Chip tone={statusTone(row.status)}>{statusLabel(row.status)}</Chip>
                    <Chip tone={item.currentClassMatches ? "green" : "orange"}>
                      Current class: {item.studentCurrentClassName}
                    </Chip>
                  </div>
                </div>
              </div>

              <div className="sen-enrollment-body">
                <div className="sen-class-line">
                  <strong>{item.className}</strong>
                  <span>{item.academicStructureName} · {item.academicPeriodName}</span>
                </div>

                <div className="sen-mini-grid">
                  <MiniStat label="Start Date" value={row.startDate} />
                  <MiniStat label="End Date" value={row.endDate || "Open"} />
                </div>
              </div>

              <div className="sen-action-row">
                {!item.currentClassMatches && row.status === "active" && (
                  <button type="button" onClick={() => syncCurrentClass(row)}>Sync Current Class</button>
                )}
                {row.status !== "active" && <button type="button" onClick={() => setStatus(row, "active")}>Mark Active</button>}
                {row.status !== "completed" && <button type="button" onClick={() => setStatus(row, "completed")}>Complete</button>}
                {row.status !== "promoted" && <button type="button" onClick={() => setStatus(row, "promoted")}>Promote</button>}
                {row.status !== "withdrawn" && <button type="button" onClick={() => setStatus(row, "withdrawn")}>Withdraw</button>}
                <button type="button" onClick={() => openEdit(row)}>Edit</button>
                <button type="button" className="danger" onClick={() => remove(row)}>Delete</button>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No student enrollment records found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="sen-drawer-layer">
          <button type="button" aria-label="Close drawer" className="sen-drawer-overlay" onClick={() => setDrawerOpen(false)} />

          <aside className="sen-drawer">
            <div className="sen-drawer-head">
              <div>
                <p>Student Enrollment</p>
                <h2>{editMode ? "Edit Enrollment" : "Enroll Student"}</h2>
                <span>
                  Enrollment will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="sen-form-grid">
              <Field label="Student">
                <select value={form.studentId || ""} onChange={(event) => updateForm({ studentId: Number(event.target.value) || undefined })}>
                  <option value="">Select Student</option>
                  {students.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.fullName} {row.admissionNumber ? `· ${row.admissionNumber}` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Class">
                <select value={form.classId || ""} onChange={(event) => updateForm({ classId: Number(event.target.value) || undefined })}>
                  <option value="">Select Class</option>
                  {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <Field label="Academic Structure">
                <select
                  value={form.academicStructureId || ""}
                  onChange={(event) => updateForm({ academicStructureId: Number(event.target.value) || undefined, academicPeriodId: undefined })}
                >
                  <option value="">Select Academic Structure</option>
                  {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.level}</option>)}
                </select>
              </Field>

              <Field label="Academic Period">
                <select
                  value={form.academicPeriodId || ""}
                  onChange={(event) => {
                    const periodId = Number(event.target.value) || undefined;
                    const period = periodId ? periodMap.get(periodId) : undefined;
                    updateForm({
                      academicPeriodId: periodId,
                      academicStructureId: period?.academicStructureId || form.academicStructureId,
                      startDate: period?.startDate || form.startDate,
                      endDate: form.endDate || period?.endDate || "",
                    });
                  }}
                >
                  <option value="">Select Academic Period</option>
                  {filteredPeriodsForForm.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <div className="sen-form-two">
                <Field label="Start Date">
                  <input type="date" value={form.startDate || ""} onChange={(event) => updateForm({ startDate: event.target.value })} />
                </Field>

                <Field label="End Date">
                  <input type="date" value={form.endDate || ""} onChange={(event) => updateForm({ endDate: event.target.value })} />
                </Field>
              </div>

              <Field label="Status">
                <select value={form.status} onChange={(event) => updateForm({ status: event.target.value as EnrollmentStatus })}>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="promoted">Promoted</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </Field>

              <label className="sen-check">
                <input
                  type="checkbox"
                  checked={!!form.updateStudentCurrentClass}
                  onChange={(event) => updateForm({ updateStudentCurrentClass: event.target.checked })}
                />
                <span>Also update student's current class when status is active</span>
              </label>

              <button type="button" onClick={save} disabled={saving} className="sen-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Enroll Student"}
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
    <article className="sen-summary-card">
      <div className="sen-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`sen-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sen-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="sen-empty-card">
      <div className="sen-empty-icon">📋</div>
      <h3>No enrollments found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="sen-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes senSpin { to { transform: rotate(360deg); } }

.sen-page {
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
.sen-page *, .sen-page *::before, .sen-page *::after { box-sizing: border-box; }
.sen-page button, .sen-page input, .sen-page select, .sen-page textarea { font: inherit; max-width: 100%; }
.sen-page img { max-width: 100%; }
.sen-page input,
.sen-page select,
.sen-page textarea {
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

.sen-state-card {
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
.sen-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.sen-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.sen-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--sen-primary) 18%, transparent); border-top-color: var(--sen-primary); animation: senSpin .8s linear infinite; }

.sen-primary-btn,
.sen-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--sen-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.sen-save-btn { width: 100%; }
.sen-primary-btn:disabled,
.sen-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.sen-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sen-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.sen-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.sen-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--sen-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--sen-primary) 28%, transparent); font-size: 22px; }
.sen-title-wrap { min-width: 0; }
.sen-title-wrap p, .sen-title-wrap h2, .sen-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sen-title-wrap p { margin: 0 0 2px; color: var(--sen-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sen-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.sen-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.sen-context-card,
.sen-filter-card,
.sen-enrollment-card,
.sen-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  padding: 13px;
}
.sen-context-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sen-primary) 10%, #fff), #fff 68%);
}
.sen-context-card p { margin: 0; color: var(--sen-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sen-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.sen-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.sen-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }
.sen-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }

.sen-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.sen-summary-card {
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
.sen-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--sen-primary) 12%, #fff); }
.sen-summary-card div:last-child { min-width: 0; }
.sen-summary-card strong, .sen-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sen-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.sen-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.sen-list { display: grid; gap: 10px; margin-top: 10px; }
.sen-enrollment-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.sen-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.sen-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.sen-card-main { min-width: 0; flex: 1; }
.sen-card-main h3, .sen-card-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.sen-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.sen-card-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.sen-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.sen-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sen-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.sen-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.sen-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.sen-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.sen-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.sen-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.sen-enrollment-body { margin-top: 12px; }
.sen-class-line { min-width: 0; padding: 11px; border-radius: 18px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); }
.sen-class-line strong, .sen-class-line span { display: block; overflow: hidden; text-overflow: ellipsis; }
.sen-class-line strong { font-size: 14px; font-weight: 1000; }
.sen-class-line span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.sen-mini-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 8px; }
.sen-mini-stat { min-width: 0; padding: 10px; border-radius: 17px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); }
.sen-mini-stat strong, .sen-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sen-mini-stat strong { font-size: 13px; font-weight: 1000; }
.sen-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.sen-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.sen-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.sen-action-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.13); }
.sen-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.sen-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--sen-primary) 12%, #fff); font-size: 28px; }
.sen-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.sen-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.sen-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.sen-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.sen-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.sen-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.sen-drawer-head div { min-width: 0; }
.sen-drawer-head p { margin: 0; color: var(--sen-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sen-drawer-head h2, .sen-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.sen-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.sen-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.sen-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.sen-form-grid { display: grid; gap: 12px; }
.sen-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.sen-field { display: grid; gap: 6px; min-width: 0; }
.sen-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.sen-check { display: flex; align-items: flex-start; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.sen-check input { width: 18px; min-height: 18px; flex: 0 0 auto; margin-top: 1px; }

@media (min-width: 680px) {
  .sen-page { padding: 12px; }
  .sen-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sen-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sen-mini-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sen-action-row { display: flex; flex-wrap: wrap; }
  .sen-action-row button { padding: 0 14px; }
  .sen-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .sen-page { padding: 16px; }
  .sen-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .sen-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .sen-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .sen-page { padding: 6px; }
  .sen-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .sen-primary-btn { width: 100%; }
  .sen-context-card, .sen-filter-card, .sen-enrollment-card, .sen-empty-card { border-radius: 20px; padding: 11px; }
  .sen-summary-grid { gap: 6px; }
  .sen-summary-card { padding: 10px; border-radius: 19px; }
  .sen-summary-card strong { font-size: 16px; }
  .sen-avatar { width: 50px; height: 50px; flex-basis: 50px; }
  .sen-action-row { grid-template-columns: 1fr; }
  .sen-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
