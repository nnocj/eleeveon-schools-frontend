"use client";

/**
 * StudentCurriculum.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE STUDENT CURRICULUM PLACEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: studentCurriculums
 * Supporting tables:
 * - students
 * - curriculums
 * - curriculumPathways
 * - academicPeriods
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch
 * -> Student -> Curriculum -> Pathway
 *
 * StudentCurriculum says:
 * "This student is following this curriculum/pathway from this period."
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Prevent duplicate active placements for the same student/curriculum/pathway.
 * - Mobile-first placement cards and responsive drawer.
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
  Curriculum,
  CurriculumPathway,
  Student,
  StudentCurriculum,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { SyncStatus } from "../lib/constants/syncStatus";

// ======================================================
// TYPES
// ======================================================

type PlacementStatus = "active" | "completed" | "withdrawn";
type ActivityFilter = "all" | "active" | "inactive";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  studentId?: number;
  curriculumId?: number;
  pathwayId?: number;
  startAcademicPeriodId?: number;
  endAcademicPeriodId?: number;
  status?: PlacementStatus;
  active?: boolean;
};

type StudentCurriculumView = {
  row: StudentCurriculum;
  student?: Student;
  studentName: string;
  admissionNumber?: string;
  curriculumName: string;
  pathwayName: string;
  startPeriodName: string;
  endPeriodName: string;
};

const emptyForm: FormState = {
  studentId: undefined,
  curriculumId: undefined,
  pathwayId: undefined,
  startAcademicPeriodId: undefined,
  endAcademicPeriodId: undefined,
  status: "active",
  active: true,
};

// ======================================================
// HELPERS
// ======================================================

function statusTone(status?: PlacementStatus): "green" | "blue" | "red" | "gray" {
  if (status === "completed") return "blue";
  if (status === "withdrawn") return "red";
  if (status === "active" || !status) return "green";
  return "gray";
}

function statusLabel(status?: PlacementStatus) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ======================================================
// COMPONENT
// ======================================================

export default function StudentCurriculumPage() {
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

  const [rows, setRows] = useState<StudentCurriculum[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);

  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState<number | undefined>();
  const [filterPathwayId, setFilterPathwayId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | PlacementStatus>("all");
  const [filterActive, setFilterActive] = useState<ActivityFilter>("all");

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
    setCurriculums([]);
    setPathways([]);
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

      const [placementRows, studentRows, curriculumRows, pathwayRows, periodRows] =
        await Promise.all([
          db.studentCurriculums.toArray(),
          db.students.toArray(),
          db.curriculums.toArray(),
          db.curriculumPathways.toArray(),
          db.academicPeriods.toArray(),
        ]);

      setRows(placementRows.filter(sameTenant));

      setStudents(
        studentRows
          .filter((row) => sameTenant(row) && row.status !== "withdrawn" && row.status !== "graduated")
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setCurriculums(
        curriculumRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setPathways(
        pathwayRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setPeriods(
        periodRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
    } catch (error) {
      console.error("Failed to load student curriculum placements:", error);
      clearData();
      alert("Failed to load student curriculum placements");
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
  const curriculumMap = useMemo(() => new Map(curriculums.map((row) => [row.id, row])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map((row) => [row.id, row])), [pathways]);
  const periodMap = useMemo(() => new Map(periods.map((row) => [row.id, row])), [periods]);

  const filteredPathwaysForForm = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter((row) => row.curriculumId === form.curriculumId);
  }, [pathways, form.curriculumId]);

  const filteredPathwaysForFilter = useMemo(() => {
    if (!filterCurriculumId) return pathways;
    return pathways.filter((row) => row.curriculumId === filterCurriculumId);
  }, [pathways, filterCurriculumId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<StudentCurriculumView[]>(() => {
    return rows.map((row) => {
      const student = studentMap.get(row.studentId);
      const curriculum = curriculumMap.get(row.curriculumId);
      const pathway = row.pathwayId ? pathwayMap.get(row.pathwayId) : undefined;
      const startPeriod = row.startAcademicPeriodId ? periodMap.get(row.startAcademicPeriodId) : undefined;
      const endPeriod = row.endAcademicPeriodId ? periodMap.get(row.endAcademicPeriodId) : undefined;

      return {
        row,
        student,
        studentName: student?.fullName || `Student #${row.studentId}`,
        admissionNumber: student?.admissionNumber,
        curriculumName: curriculum?.name || "Unknown curriculum",
        pathwayName: pathway?.name || "No pathway",
        startPeriodName: startPeriod?.name || "No start period",
        endPeriodName: endPeriod?.name || "No end period",
      };
    });
  }, [rows, studentMap, curriculumMap, pathwayMap, periodMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterCurriculumId && row.curriculumId !== filterCurriculumId) return false;
        if (filterPathwayId && row.pathwayId !== filterPathwayId) return false;
        if (filterStatus !== "all" && row.status !== filterStatus) return false;
        if (filterActive === "active" && row.active === false) return false;
        if (filterActive === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${item.studentName}
          ${item.admissionNumber || ""}
          ${item.curriculumName}
          ${item.pathwayName}
          ${item.startPeriodName}
          ${item.endPeriodName}
          ${row.status || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [viewRows, search, filterCurriculumId, filterPathwayId, filterStatus, filterActive]);

  const summary = useMemo(() => {
    const total = rows.length;
    const activePlacements = rows.filter((row) => row.status === "active" && row.active !== false).length;
    const completed = rows.filter((row) => row.status === "completed").length;
    const withdrawn = rows.filter((row) => row.status === "withdrawn").length;
    const inactiveRecords = rows.filter((row) => row.active === false).length;
    const studentsPlaced = new Set(rows.map((row) => row.studentId)).size;
    const curriculumCoverage = curriculums.length ? Math.round((new Set(rows.map((row) => row.curriculumId)).size / curriculums.length) * 100) : 0;

    return { total, activePlacements, completed, withdrawn, inactiveRecords, studentsPlaced, curriculumCoverage };
  }, [rows, curriculums.length]);

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

    setEditMode(false);
    setForm({
      ...emptyForm,
      curriculumId: filterCurriculumId,
      pathwayId: filterPathwayId,
      startAcademicPeriodId: settings?.currentAcademicPeriodId,
      status: "active",
      active: true,
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: StudentCurriculum) => {
    setEditMode(true);
    setForm({
      id: row.id,
      studentId: row.studentId,
      curriculumId: row.curriculumId,
      pathwayId: row.pathwayId,
      startAcademicPeriodId: row.startAcademicPeriodId,
      endAcademicPeriodId: row.endAcademicPeriodId,
      status: row.status || "active",
      active: row.active ?? true,
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
    if (!form.curriculumId) return "Select curriculum";

    const selectedStudent = studentMap.get(form.studentId);
    if (!selectedStudent) return "Selected student is not in this branch";

    const selectedCurriculum = curriculumMap.get(form.curriculumId);
    if (!selectedCurriculum) return "Selected curriculum is not in this branch";

    const selectedPathway = form.pathwayId ? pathwayMap.get(form.pathwayId) : undefined;
    if (selectedPathway && selectedPathway.curriculumId !== form.curriculumId) {
      return "Selected pathway does not belong to the selected curriculum";
    }

    if (
      form.startAcademicPeriodId &&
      form.endAcademicPeriodId &&
      Number(form.endAcademicPeriodId) === Number(form.startAcademicPeriodId) &&
      form.status === "active"
    ) {
      return "An active placement should not have the same start and end period";
    }

    const duplicateActive = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      return (
        row.studentId === Number(form.studentId) &&
        row.curriculumId === Number(form.curriculumId) &&
        Number(row.pathwayId || 0) === Number(form.pathwayId || 0) &&
        row.status === "active" &&
        row.active !== false &&
        !row.isDeleted
      );
    });

    if (duplicateActive && form.status === "active" && form.active !== false) {
      return "This student already has an active placement for this curriculum/pathway";
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
        curriculumId: Number(form.curriculumId),
        pathwayId: form.pathwayId ? Number(form.pathwayId) : undefined,
        startAcademicPeriodId: form.startAcademicPeriodId ? Number(form.startAcademicPeriodId) : undefined,
        endAcademicPeriodId: form.endAcademicPeriodId ? Number(form.endAcademicPeriodId) : undefined,
        status: form.status || "active",
        active: form.active !== false,
      }) as StudentCurriculum;

      if (editMode && form.id) {
        await db.studentCurriculums.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        } as Partial<StudentCurriculum>);
      } else {
        await db.studentCurriculums.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save student curriculum placement:", error);
      alert("Failed to save student curriculum placement");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: StudentCurriculum) => {
    if (!row.id) return;
    if (!confirm("Delete this student curriculum placement?")) return;

    await db.studentCurriculums.update(row.id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<StudentCurriculum>);

    await load();
  };

  const setStatus = async (row: StudentCurriculum, status: PlacementStatus) => {
    if (!row.id) return;

    await db.studentCurriculums.update(row.id, {
      status,
      active: status === "active",
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<StudentCurriculum>);

    await load();
  };

  const toggleActive = async (row: StudentCurriculum) => {
    if (!row.id) return;

    await db.studentCurriculums.update(row.id, {
      active: row.active === false,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<StudentCurriculum>);

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="scu-page" style={{ "--scu-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="scu-state-card">
          <div className="scu-spinner" />
          <h2>Opening student curriculum...</h2>
          <p>Checking account, branch, students, curriculums, pathways, and placements.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="scu-page" style={{ "--scu-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="scu-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing student curriculum placements.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="scu-page" style={{ "--scu-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="scu-state-card">
          <h2>Select a branch first</h2>
          <p>Student curriculum placements belong to one active school branch.</p>
          <button type="button" className="scu-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="scu-page" style={{ "--scu-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="scu-hero">
        <div className="scu-hero-left">
          <div className="scu-hero-icon">🎓</div>
          <div className="scu-title-wrap">
            <p>Curriculum Placement</p>
            <h2>Student Curriculum</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="scu-primary-btn" onClick={openCreate}>
          + Assign Curriculum
        </button>
      </section>

      <section className="scu-context-card">
        <div>
          <p>Placement Scope</p>
          <h3>{summary.studentsPlaced} student(s) placed</h3>
          <span>{summary.activePlacements} active placement(s) across {curriculums.length} curriculum(s)</span>
        </div>
        <div className="scu-pill-row">
          <Chip tone="blue">Same Tenant</Chip>
          <Chip tone="green">Branch Scoped</Chip>
          <Chip tone={summary.curriculumCoverage >= 60 ? "green" : "orange"}>{summary.curriculumCoverage}% Curriculum Coverage</Chip>
        </div>
      </section>

      <section className="scu-summary-grid" aria-label="Student curriculum summary">
        <SummaryCard label="Placements" value={summary.total} icon="📌" />
        <SummaryCard label="Active" value={summary.activePlacements} icon="✅" />
        <SummaryCard label="Completed" value={summary.completed} icon="🎯" />
        <SummaryCard label="Withdrawn" value={summary.withdrawn} icon="🚪" />
        <SummaryCard label="Inactive" value={summary.inactiveRecords} icon="⏸️" />
        <SummaryCard label="Students Placed" value={summary.studentsPlaced} icon="🎓" />
      </section>

      <section className="scu-filter-card">
        <input
          placeholder="Search student, admission number, curriculum, pathway..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterCurriculumId || ""}
          onChange={(event) => {
            setFilterCurriculumId(Number(event.target.value) || undefined);
            setFilterPathwayId(undefined);
          }}
        >
          <option value="">All Curriculums</option>
          {curriculums.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterPathwayId || ""} onChange={(event) => setFilterPathwayId(Number(event.target.value) || undefined)}>
          <option value="">All Pathways</option>
          {filteredPathwaysForFilter.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <select value={filterActive} onChange={(event) => setFilterActive(event.target.value as ActivityFilter)}>
          <option value="all">All Activity</option>
          <option value="active">Active Records</option>
          <option value="inactive">Inactive Records</option>
        </select>
      </section>

      <section className="scu-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="scu-placement-card">
              <div className="scu-card-top">
                <div
                  className="scu-avatar"
                  style={{
                    background: item.student?.photo
                      ? `url(${item.student.photo}) center/cover`
                      : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
                  }}
                >
                  {!item.student?.photo && item.studentName.slice(0, 1).toUpperCase()}
                </div>

                <div className="scu-card-main">
                  <h3>{item.studentName}</h3>
                  <p>{item.admissionNumber || "No admission number"}</p>
                  <div className="scu-chip-row">
                    <Chip tone={statusTone(row.status)}>{statusLabel(row.status)}</Chip>
                    <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive Record" : "Active Record"}</Chip>
                  </div>
                </div>
              </div>

              <div className="scu-placement-body">
                <div className="scu-program-line">
                  <strong>{item.curriculumName}</strong>
                  <span>{item.pathwayName}</span>
                </div>

                <div className="scu-mini-grid">
                  <MiniStat label="Start Period" value={item.startPeriodName} />
                  <MiniStat label="End Period" value={item.endPeriodName} />
                </div>
              </div>

              <div className="scu-action-row">
                {row.status !== "active" && <button type="button" onClick={() => setStatus(row, "active")}>Mark Active</button>}
                {row.status !== "completed" && <button type="button" onClick={() => setStatus(row, "completed")}>Complete</button>}
                {row.status !== "withdrawn" && <button type="button" onClick={() => setStatus(row, "withdrawn")}>Withdraw</button>}
                <button type="button" onClick={() => toggleActive(row)}>{row.active === false ? "Reactivate" : "Deactivate"}</button>
                <button type="button" onClick={() => openEdit(row)}>Edit</button>
                <button type="button" className="danger" onClick={() => remove(row)}>Delete</button>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No student curriculum placements found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="scu-drawer-layer">
          <button type="button" aria-label="Close drawer" className="scu-drawer-overlay" onClick={() => setDrawerOpen(false)} />

          <aside className="scu-drawer">
            <div className="scu-drawer-head">
              <div>
                <p>Student Curriculum</p>
                <h2>{editMode ? "Edit Placement" : "Assign Curriculum"}</h2>
                <span>
                  Placement will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="scu-form-grid">
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

              <Field label="Curriculum">
                <select
                  value={form.curriculumId || ""}
                  onChange={(event) => updateForm({ curriculumId: Number(event.target.value) || undefined, pathwayId: undefined })}
                >
                  <option value="">Select Curriculum</option>
                  {curriculums.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <Field label="Pathway">
                <select value={form.pathwayId || ""} onChange={(event) => updateForm({ pathwayId: Number(event.target.value) || undefined })}>
                  <option value="">No pathway</option>
                  {filteredPathwaysForForm.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <div className="scu-form-two">
                <Field label="Start Academic Period">
                  <select value={form.startAcademicPeriodId || ""} onChange={(event) => updateForm({ startAcademicPeriodId: Number(event.target.value) || undefined })}>
                    <option value="">No start period</option>
                    {periods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </Field>

                <Field label="End Academic Period">
                  <select value={form.endAcademicPeriodId || ""} onChange={(event) => updateForm({ endAcademicPeriodId: Number(event.target.value) || undefined })}>
                    <option value="">No end period</option>
                    {periods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Status">
                <select value={form.status || "active"} onChange={(event) => updateForm({ status: event.target.value as PlacementStatus })}>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </Field>

              <label className="scu-check">
                <input type="checkbox" checked={form.active !== false} onChange={(event) => updateForm({ active: event.target.checked })} />
                <span>Active Record</span>
              </label>

              <button type="button" onClick={save} disabled={saving} className="scu-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Assign Curriculum"}
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
    <article className="scu-summary-card">
      <div className="scu-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`scu-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="scu-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="scu-empty-card">
      <div className="scu-empty-icon">🎓</div>
      <h3>No placements found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="scu-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes scuSpin { to { transform: rotate(360deg); } }

.scu-page {
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
.scu-page *, .scu-page *::before, .scu-page *::after { box-sizing: border-box; }
.scu-page button, .scu-page input, .scu-page select, .scu-page textarea { font: inherit; max-width: 100%; }
.scu-page img { max-width: 100%; }
.scu-page input,
.scu-page select,
.scu-page textarea {
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

.scu-state-card {
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
.scu-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.scu-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.scu-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--scu-primary) 18%, transparent); border-top-color: var(--scu-primary); animation: scuSpin .8s linear infinite; }

.scu-primary-btn,
.scu-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--scu-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.scu-save-btn { width: 100%; }
.scu-primary-btn:disabled,
.scu-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.scu-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--scu-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.scu-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.scu-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--scu-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--scu-primary) 28%, transparent); font-size: 22px; }
.scu-title-wrap { min-width: 0; }
.scu-title-wrap p, .scu-title-wrap h2, .scu-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scu-title-wrap p { margin: 0 0 2px; color: var(--scu-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.scu-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.scu-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.scu-context-card,
.scu-filter-card,
.scu-placement-card,
.scu-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  padding: 13px;
}
.scu-context-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--scu-primary) 10%, #fff), #fff 68%);
}
.scu-context-card p { margin: 0; color: var(--scu-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.scu-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.scu-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.scu-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }
.scu-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }

.scu-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.scu-summary-card {
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
.scu-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--scu-primary) 12%, #fff); }
.scu-summary-card div:last-child { min-width: 0; }
.scu-summary-card strong, .scu-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scu-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.scu-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.scu-list { display: grid; gap: 10px; margin-top: 10px; }
.scu-placement-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.scu-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.scu-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.scu-card-main { min-width: 0; flex: 1; }
.scu-card-main h3, .scu-card-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.scu-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.scu-card-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.scu-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.scu-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scu-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.scu-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.scu-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.scu-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.scu-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.scu-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.scu-placement-body { margin-top: 12px; }
.scu-program-line { min-width: 0; padding: 11px; border-radius: 18px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); }
.scu-program-line strong, .scu-program-line span { display: block; overflow: hidden; text-overflow: ellipsis; }
.scu-program-line strong { font-size: 14px; font-weight: 1000; }
.scu-program-line span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.scu-mini-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 8px; }
.scu-mini-stat { min-width: 0; padding: 10px; border-radius: 17px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); }
.scu-mini-stat strong, .scu-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scu-mini-stat strong { font-size: 13px; font-weight: 1000; }
.scu-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.scu-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.scu-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.scu-action-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.13); }
.scu-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.scu-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--scu-primary) 12%, #fff); font-size: 28px; }
.scu-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.scu-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.scu-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.scu-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.scu-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.scu-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.scu-drawer-head div { min-width: 0; }
.scu-drawer-head p { margin: 0; color: var(--scu-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.scu-drawer-head h2, .scu-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.scu-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.scu-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.scu-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.scu-form-grid { display: grid; gap: 12px; }
.scu-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.scu-field { display: grid; gap: 6px; min-width: 0; }
.scu-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.scu-check { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.scu-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }

@media (min-width: 680px) {
  .scu-page { padding: 12px; }
  .scu-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .scu-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scu-mini-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scu-action-row { display: flex; flex-wrap: wrap; }
  .scu-action-row button { padding: 0 14px; }
  .scu-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .scu-page { padding: 16px; }
  .scu-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .scu-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .scu-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .scu-page { padding: 6px; }
  .scu-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .scu-primary-btn { width: 100%; }
  .scu-context-card, .scu-filter-card, .scu-placement-card, .scu-empty-card { border-radius: 20px; padding: 11px; }
  .scu-summary-grid { gap: 6px; }
  .scu-summary-card { padding: 10px; border-radius: 19px; }
  .scu-summary-card strong { font-size: 16px; }
  .scu-avatar { width: 50px; height: 50px; flex-basis: 50px; }
  .scu-action-row { grid-template-columns: 1fr; }
  .scu-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
