"use client";

/**
 * StudentEnrollment.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL STUDENT CLASS ENROLLMENT MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: studentEnrollments
 *
 * ACTUAL DB MODEL REMINDER
 * ---------------------------------------------------------
 * export interface StudentEnrollment extends BaseSync {
 *   branchId: number;
 *   studentId: number;
 *   classId: number;
 *   academicStructureId: number;
 *   academicPeriodId: number;
 *   startDate: string;
 *   endDate?: string;
 *   status: "active" | "completed" | "promoted" | "withdrawn";
 * }
 *
 * Important:
 * - There is NO active field on StudentEnrollment.
 * - Status uses promoted, NOT transferred.
 * - academicStructureId and startDate are required.
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * Active School -> Active Branch -> Student -> Class -> AcademicStructure -> AcademicPeriod
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Class,
  Student,
  StudentEnrollment,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type EnrollmentStatus = "active" | "completed" | "promoted" | "withdrawn";

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
  studentName: string;
  admissionNumber?: string;
  className: string;
  academicStructureName: string;
  academicPeriodName: string;
  studentCurrentClassName: string;
};

// ======================================================
// DATE HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

// ======================================================
// COMPONENT
// ======================================================

export default function StudentEnrollmentsPage() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

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

  const [form, setForm] = useState<FormState>({
    studentId: undefined,
    classId: undefined,
    academicStructureId: undefined,
    academicPeriodId: settings?.currentAcademicPeriodId,
    startDate: todayISO(),
    endDate: "",
    status: "active",
    updateStudentCurrentClass: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
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

      setRows(enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted));

      setStudents(
        studentRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn"
        )
      );

      setClasses(
        classRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );

      setAcademicStructures(
        structureRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setPeriods(
        periodRows
          .filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
    } catch (error) {
      console.error("Failed to load student enrollments:", error);
      alert("Failed to load student enrollments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const studentMap = useMemo(
    () => new Map(students.map(row => [row.id, row])),
    [students]
  );

  const classMap = useMemo(
    () => new Map(classes.map(row => [row.id, row])),
    [classes]
  );

  const structureMap = useMemo(
    () => new Map(academicStructures.map(row => [row.id, row])),
    [academicStructures]
  );

  const periodMap = useMemo(
    () => new Map(periods.map(row => [row.id, row])),
    [periods]
  );

  const filteredPeriodsForForm = useMemo(() => {
    if (!form.academicStructureId) return periods;
    return periods.filter(row => row.academicStructureId === form.academicStructureId);
  }, [periods, form.academicStructureId]);

  const filteredPeriodsForFilter = useMemo(() => {
    if (!filterStructureId) return periods;
    return periods.filter(row => row.academicStructureId === filterStructureId);
  }, [periods, filterStructureId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<EnrollmentView[]>(() => {
    return rows.map(row => {
      const student = studentMap.get(row.studentId);
      const classRow = classMap.get(row.classId);
      const structure = structureMap.get(row.academicStructureId);
      const period = periodMap.get(row.academicPeriodId);
      const currentClass = student?.currentClassId ? classMap.get(student.currentClassId) : undefined;

      return {
        row,
        studentName: student?.fullName || `Student #${row.studentId}`,
        admissionNumber: student?.admissionNumber,
        className: classRow?.name || `Class #${row.classId}`,
        academicStructureName: structure?.name || `Structure #${row.academicStructureId}`,
        academicPeriodName: period?.name || `Period #${row.academicPeriodId}`,
        studentCurrentClassName: currentClass?.name || "No current class",
      };
    });
  }, [rows, studentMap, classMap, structureMap, periodMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
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
    return {
      total: rows.length,
      active: rows.filter(row => row.status === "active").length,
      completed: rows.filter(row => row.status === "completed").length,
      promoted: rows.filter(row => row.status === "promoted").length,
      withdrawn: rows.filter(row => row.status === "withdrawn").length,
      enrolledStudents: new Set(rows.filter(row => row.status === "active").map(row => row.studentId)).size,
    };
  }, [rows]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before enrolling students.");
      return;
    }

    const selectedPeriod = settings?.currentAcademicPeriodId
      ? periods.find(row => row.id === settings.currentAcademicPeriodId)
      : undefined;

    setEditMode(false);
    setForm({
      studentId: undefined,
      classId: filterClassId,
      academicStructureId: filterStructureId || selectedPeriod?.academicStructureId,
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
    if (!branchId) return "Select a branch first";
    if (!form.studentId) return "Select student";
    if (!form.classId) return "Select class";
    if (!form.academicStructureId) return "Select academic structure";
    if (!form.academicPeriodId) return "Select academic period";
    if (!form.startDate) return "Select start date";

    const selectedPeriod = periodMap.get(Number(form.academicPeriodId));

    if (selectedPeriod && selectedPeriod.academicStructureId !== Number(form.academicStructureId)) {
      return "Selected academic period does not belong to the selected academic structure";
    }

    if (form.endDate && form.endDate < form.startDate) {
      return "End date cannot be before start date";
    }

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      return (
        row.studentId === Number(form.studentId) &&
        row.classId === Number(form.classId) &&
        row.academicStructureId === Number(form.academicStructureId) &&
        row.academicPeriodId === Number(form.academicPeriodId) &&
        !row.isDeleted
      );
    });

    if (duplicate) {
      return "This student is already enrolled in this class for this academic period";
    }

    const activeClassInSamePeriod = rows.find(row => {
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
        branchId,
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
          studentId: payload.studentId,
          classId: payload.classId,
          academicStructureId: payload.academicStructureId,
          academicPeriodId: payload.academicPeriodId,
          startDate: payload.startDate,
          endDate: payload.endDate,
          status: payload.status,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.studentEnrollments.add(payload);
      }

      if (form.updateStudentCurrentClass && form.studentId && form.classId && form.status === "active") {
        await db.students.update(Number(form.studentId), {
          currentClassId: Number(form.classId),
          updatedAt: Date.now(),
        });
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
      updatedAt: Date.now(),
    });

    await load();
  };

  const setStatus = async (row: StudentEnrollment, status: EnrollmentStatus) => {
    if (!row.id) return;

    const patch: Partial<StudentEnrollment> = {
      status,
      updatedAt: Date.now(),
    };

    if ((status === "completed" || status === "promoted" || status === "withdrawn") && !row.endDate) {
      patch.endDate = todayISO();
    }

    await db.studentEnrollments.update(row.id, patch);

    if (status === "active") {
      await db.students.update(row.studentId, {
        currentClassId: row.classId,
        updatedAt: Date.now(),
      });
    }

    await load();
  };

  const syncCurrentClass = async (row: StudentEnrollment) => {
    await db.students.update(row.studentId, {
      currentClassId: row.classId,
      updatedAt: Date.now(),
    });

    await load();
  };

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  const statusTone = (status?: EnrollmentStatus): "green" | "blue" | "orange" | "red" | "gray" => {
    if (status === "completed") return "blue";
    if (status === "promoted") return "orange";
    if (status === "withdrawn") return "red";
    if (status === "active" || !status) return "green";
    return "gray";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading student enrollments...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Student enrollments belong to a branch. Select a school and branch first.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Student Enrollments</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing class enrollments in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Enroll Student
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Enrollment Records</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.active}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Completed</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.completed}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Promoted</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.promoted}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Enrolled Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.enrolledStudents}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input
          placeholder="Search student, admission number, class, period..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterClassId || ""}
          onChange={e => setFilterClassId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Classes</option>
          {classes.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterStructureId || ""}
          onChange={e => {
            setFilterStructureId(Number(e.target.value) || undefined);
            setFilterPeriodId(undefined);
          }}
          style={input}
        >
          <option value="">All Academic Structures</option>
          {academicStructures.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.level}
            </option>
          ))}
        </select>

        <select
          value={filterPeriodId || ""}
          onChange={e => setFilterPeriodId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Academic Periods</option>
          {filteredPeriodsForFilter.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          style={input}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="promoted">Promoted</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;
          const currentClassMatches = item.studentCurrentClassName === item.className;

          return (
            <div key={row.id} style={card}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{item.studentName}</div>
                    {item.admissionNumber && <span style={badge("gray")}>{item.admissionNumber}</span>}
                    <span style={badge(statusTone(row.status))}>{row.status}</span>
                  </div>

                  <div style={{ marginTop: 7, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                    {item.className} • {item.academicStructureName} • {item.academicPeriodName}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge(currentClassMatches ? "green" : "orange")}>
                      Current class: {item.studentCurrentClassName}
                    </span>
                    <span style={badge("blue")}>Start: {row.startDate}</span>
                    <span style={badge(row.endDate ? "gray" : "orange")}>
                      End: {row.endDate || "Open"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {!currentClassMatches && row.status === "active" && (
                    <button style={ghostButton} onClick={() => syncCurrentClass(row)}>
                      Sync Current Class
                    </button>
                  )}
                  {row.status !== "active" && (
                    <button style={ghostButton} onClick={() => setStatus(row, "active")}>
                      Mark Active
                    </button>
                  )}
                  {row.status !== "completed" && (
                    <button style={ghostButton} onClick={() => setStatus(row, "completed")}>
                      Complete
                    </button>
                  )}
                  {row.status !== "promoted" && (
                    <button style={ghostButton} onClick={() => setStatus(row, "promoted")}>
                      Promote
                    </button>
                  )}
                  <button style={ghostButton} onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(row)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No student enrollment records found in this branch.
          </div>
        )}
      </div>

      {/* DRAWER */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              width: "min(620px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit Enrollment" : "Enroll Student"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Create or update a student's class enrollment record.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Student</label>
                <select
                  value={form.studentId || ""}
                  onChange={e => updateForm({ studentId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Student</option>
                  {students.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.fullName} {row.admissionNumber ? `• ${row.admissionNumber}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Class</label>
                <select
                  value={form.classId || ""}
                  onChange={e => updateForm({ classId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Class</option>
                  {classes.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Academic Structure</label>
                <select
                  value={form.academicStructureId || ""}
                  onChange={e =>
                    updateForm({
                      academicStructureId: Number(e.target.value) || undefined,
                      academicPeriodId: undefined,
                    })
                  }
                  style={input}
                >
                  <option value="">Select Academic Structure</option>
                  {academicStructures.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} • {row.level}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Academic Period</label>
                <select
                  value={form.academicPeriodId || ""}
                  onChange={e => {
                    const periodId = Number(e.target.value) || undefined;
                    const period = periodId ? periodMap.get(periodId) : undefined;
                    updateForm({
                      academicPeriodId: periodId,
                      academicStructureId: period?.academicStructureId || form.academicStructureId,
                      startDate: period?.startDate || form.startDate,
                      endDate: form.endDate || period?.endDate || "",
                    });
                  }}
                  style={input}
                >
                  <option value="">Select Academic Period</option>
                  {filteredPeriodsForForm.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Start Date</label>
                  <input
                    type="date"
                    value={form.startDate || ""}
                    onChange={e => updateForm({ startDate: e.target.value })}
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>End Date</label>
                  <input
                    type="date"
                    value={form.endDate || ""}
                    onChange={e => updateForm({ endDate: e.target.value })}
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Status</label>
                <select
                  value={form.status}
                  onChange={e => updateForm({ status: e.target.value as EnrollmentStatus })}
                  style={input}
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="promoted">Promoted</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>

              <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                <input
                  type="checkbox"
                  checked={!!form.updateStudentCurrentClass}
                  onChange={e => updateForm({ updateStudentCurrentClass: e.target.checked })}
                />
                Also update student's current class when status is active
              </label>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Enroll Student"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
