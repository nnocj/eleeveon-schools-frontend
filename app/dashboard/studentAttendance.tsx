"use client";

/**
 * StudentAttendance.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL STUDENT ATTENDANCE PAGE
 * ---------------------------------------------------------
 *
 * DB-safe, school/branch-context-aware rewrite.
 *
 * Expected architecture:
 * Active School -> Active Branch -> Academic Structure -> Academic Period -> Class -> Students
 *
 * Student list is resolved from StudentEnrollment, not merely from Student.currentClassId.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Attendance,
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

type AttendanceStatus = "present" | "absent" | "late";
type AttendanceMap = Record<number, AttendanceStatus>;

type StudentRow = {
  student: Student;
  enrollment: StudentEnrollment;
};

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

// ======================================================
// COMPONENT
// ======================================================

export default function StudentAttendance() {
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

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<Attendance[]>([]);

  const [academicStructureId, setAcademicStructureId] = useState<number | undefined>(
    settings?.currentAcademicStructureId
  );
  const [academicPeriodId, setAcademicPeriodId] = useState<number | undefined>(
    settings?.currentAcademicPeriodId
  );
  const [classId, setClassId] = useState<number | undefined>();
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [statusMap, setStatusMap] = useState<AttendanceMap>({});

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [studentRows, classRows, structureRows, periodRows, enrollmentRows, attendanceData] =
        await Promise.all([
          db.students.toArray(),
          db.classes.toArray(),
          db.academicStructures.toArray(),
          db.academicPeriods.toArray(),
          db.studentEnrollments.toArray(),
          db.attendance.toArray(),
        ]);

      setStudents(
        studentRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn"
        )
      );

      setClasses(
        classRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );

      setAcademicStructures(
        structureRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );

      setPeriods(
        periodRows
          .filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );

      setEnrollments(enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAttendanceRows(attendanceData.filter(row => row.branchId === branchId && !row.isDeleted));
    } catch (error) {
      console.error("Failed to load student attendance:", error);
      alert("Failed to load student attendance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // MAPS
  // ======================================================

  const studentMap = useMemo(() => new Map(students.map(row => [row.id, row])), [students]);

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return periods;
    return periods.filter(row => row.academicStructureId === academicStructureId);
  }, [periods, academicStructureId]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<number>();

    enrollments.forEach(row => {
      if (row.status !== "active") return;
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      ids.add(row.classId);
    });

    return ids;
  }, [enrollments, academicStructureId, academicPeriodId]);

  const availableClasses = useMemo(() => {
    if (!academicStructureId && !academicPeriodId) return classes;
    return classes.filter(row => row.id && availableClassIds.has(row.id));
  }, [classes, availableClassIds, academicStructureId, academicPeriodId]);

  const studentRows = useMemo<StudentRow[]>(() => {
    if (!classId || !academicStructureId || !academicPeriodId) return [];

    return enrollments
      .filter(row => {
        return (
          row.classId === classId &&
          row.academicStructureId === academicStructureId &&
          row.academicPeriodId === academicPeriodId &&
          row.status === "active" &&
          !row.isDeleted
        );
      })
      .map(enrollment => {
        const student = studentMap.get(enrollment.studentId);
        if (!student) return undefined;
        return { student, enrollment };
      })
      .filter(Boolean) as StudentRow[];
  }, [enrollments, classId, academicStructureId, academicPeriodId, studentMap]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return studentRows;

    return studentRows.filter(({ student }) =>
      `${student.fullName} ${student.admissionNumber || ""}`.toLowerCase().includes(query)
    );
  }, [studentRows, search]);

  // ======================================================
  // HYDRATE ATTENDANCE FOR SELECTED DATE
  // ======================================================

  useEffect(() => {
    if (!classId || !academicStructureId || !academicPeriodId || !date) {
      setStatusMap({});
      return;
    }

    const next: AttendanceMap = {};

    attendanceRows
      .filter(row => {
        return (
          row.classId === classId &&
          row.academicStructureId === academicStructureId &&
          row.academicPeriodId === academicPeriodId &&
          row.date === date
        );
      })
      .forEach(row => {
        next[row.studentId] = row.status;
      });

    setStatusMap(next);
  }, [attendanceRows, classId, academicStructureId, academicPeriodId, date]);

  // ======================================================
  // SUMMARY
  // ======================================================

  const summary = useMemo(() => {
    const total = filteredStudents.length;
    const present = filteredStudents.filter(({ student }) => statusMap[student.id || 0] === "present").length;
    const absent = filteredStudents.filter(({ student }) => statusMap[student.id || 0] === "absent").length;
    const late = filteredStudents.filter(({ student }) => statusMap[student.id || 0] === "late").length;
    const marked = present + absent + late;
    const completion = total ? Math.round((marked / total) * 100) : 0;

    return { total, marked, present, absent, late, completion };
  }, [filteredStudents, statusMap]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const setStudentStatus = (studentId: number, status: AttendanceStatus) => {
    setStatusMap(prev => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status: AttendanceStatus) => {
    const next: AttendanceMap = {};
    filteredStudents.forEach(({ student }) => {
      if (student.id) next[student.id] = status;
    });
    setStatusMap(prev => ({ ...prev, ...next }));
  };

  const saveAttendance = async () => {
    if (!classId) return alert("Select class");
    if (!academicStructureId) return alert("Select academic structure");
    if (!academicPeriodId) return alert("Select academic period");
    if (!date) return alert("Select date");

    try {
      setSaving(true);

      const existing = attendanceRows.filter(row => {
        return (
          row.classId === classId &&
          row.academicStructureId === academicStructureId &&
          row.academicPeriodId === academicPeriodId &&
          row.date === date
        );
      });

      for (const row of existing) {
        if (row.id) await db.attendance.delete(row.id);
      }

      const payload = filteredStudents
        .filter(({ student }) => !!student.id && !!statusMap[student.id])
        .map(({ student }) =>
          prepareSyncData({
            branchId,
            studentId: student.id || 0,
            classId,
            academicStructureId,
            academicPeriodId,
            date,
            status: statusMap[student.id || 0],
          }) as Attendance
        );

      if (payload.length) {
        await db.attendance.bulkAdd(payload);
      }

      await load();
      alert("Attendance saved successfully");
    } catch (error) {
      console.error("Failed to save attendance:", error);
      alert("Failed to save attendance");
    } finally {
      setSaving(false);
    }
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

  const statusButton = (active: boolean, tone: "green" | "red" | "orange"): React.CSSProperties => {
    const colors = {
      green: { bg: "rgba(34,197,94,0.14)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.14)", color: "#dc2626" },
      orange: { bg: "rgba(245,158,11,0.16)", color: "#b45309" },
    }[tone];

    return {
      padding: "9px 12px",
      borderRadius: 999,
      border: active ? `2px solid ${colors.color}` : "1px solid rgba(0,0,0,0.10)",
      background: active ? colors.bg : "var(--surface)",
      color: active ? colors.color : "var(--text)",
      fontWeight: 850,
      cursor: "pointer",
    };
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
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

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading student attendance...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Student attendance belongs to a branch. Select a school and branch first.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Student Attendance</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Recording attendance in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={saveAttendance} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : "Save Attendance"}
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <select
          value={academicStructureId || ""}
          onChange={e => {
            setAcademicStructureId(Number(e.target.value) || undefined);
            setAcademicPeriodId(undefined);
            setClassId(undefined);
          }}
          style={input}
        >
          <option value="">Select Academic Structure</option>
          {academicStructures.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.level}
            </option>
          ))}
        </select>

        <select
          value={academicPeriodId || ""}
          onChange={e => {
            setAcademicPeriodId(Number(e.target.value) || undefined);
            setClassId(undefined);
          }}
          style={input}
        >
          <option value="">Select Academic Period</option>
          {filteredPeriods.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={classId || ""}
          onChange={e => setClassId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">Select Class</option>
          {availableClasses.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student or admission number..."
          style={input}
        />
      </div>

      {/* SUMMARY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Marked</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.marked}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Present</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.present}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Absent</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.absent}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Completion</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.completion}%</div>
        </div>
      </div>

      {/* BULK ACTIONS */}
      <div style={{ ...card, marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={ghostButton} onClick={() => markAll("present")}>Mark All Present</button>
        <button style={ghostButton} onClick={() => markAll("absent")}>Mark All Absent</button>
        <button style={ghostButton} onClick={() => markAll("late")}>Mark All Late</button>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredStudents.map(({ student }) => {
          const sid = student.id || 0;
          const current = statusMap[sid];

          return (
            <div key={student.id} style={card}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 16,
                      background: student.photo
                        ? `url(${student.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 46px",
                    }}
                  >
                    {!student.photo && student.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 900 }}>{student.fullName}</div>
                    <div style={{ marginTop: 4, display: "flex", gap: 7, flexWrap: "wrap" }}>
                      <span style={badge("gray")}>{student.admissionNumber || "No admission no."}</span>
                      {current && <span style={badge(current === "present" ? "green" : current === "absent" ? "red" : "orange")}>{current}</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setStudentStatus(sid, "present")}
                    style={statusButton(current === "present", "green")}
                  >
                    Present
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentStatus(sid, "absent")}
                    style={statusButton(current === "absent", "red")}
                  >
                    Absent
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentStatus(sid, "late")}
                    style={statusButton(current === "late", "orange")}
                  >
                    Late
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredStudents.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            Select academic structure, period, and class to load enrolled students.
          </div>
        )}
      </div>
    </div>
  );
}
