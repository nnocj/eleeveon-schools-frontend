"use client";

/**
 * StudentAttendance.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE STUDENT ATTENDANCE PAGE
 * ---------------------------------------------------------
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch
 * -> Academic Structure -> Academic Period -> Class -> Enrolled Students
 *
 * Student list is resolved from StudentEnrollment, not merely
 * from Student.currentClassId.
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Attendance saves update existing rows instead of blindly deleting other tenant rows.
 * - Mobile-first attendance cards and bulk actions.
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
  Attendance,
  Class,
  Student,
  StudentEnrollment,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { SyncStatus } from "../lib/constants/syncStatus";

// ======================================================
// TYPES
// ======================================================

type AttendanceStatus = "present" | "absent" | "late";
type AttendanceFilter = "all" | AttendanceStatus | "unmarked";
type AttendanceMap = Record<number, AttendanceStatus>;

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type StudentRow = {
  student: Student;
  enrollment: StudentEnrollment;
  existingAttendance?: Attendance;
};

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

function statusTone(status?: AttendanceStatus): "green" | "red" | "orange" | "gray" {
  if (status === "present") return "green";
  if (status === "absent") return "red";
  if (status === "late") return "orange";
  return "gray";
}

function statusLabel(status?: AttendanceStatus) {
  if (!status) return "Unmarked";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ======================================================
// COMPONENT
// ======================================================

export default function StudentAttendance() {
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
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("all");
  const [statusMap, setStatusMap] = useState<AttendanceMap>({});

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
    setStudents([]);
    setClasses([]);
    setAcademicStructures([]);
    setPeriods([]);
    setEnrollments([]);
    setAttendanceRows([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

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

      setEnrollments(enrollmentRows.filter(sameTenant));
      setAttendanceRows(attendanceData.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load student attendance:", error);
      clearData();
      alert("Failed to load student attendance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // DEFAULT CURRENT ACADEMIC CONTEXT
  // ======================================================

  useEffect(() => {
    if (!academicStructureId && settings?.currentAcademicStructureId) {
      setAcademicStructureId(settings.currentAcademicStructureId);
    }

    if (!academicPeriodId && settings?.currentAcademicPeriodId) {
      setAcademicPeriodId(settings.currentAcademicPeriodId);
    }
  }, [academicStructureId, academicPeriodId, settings?.currentAcademicStructureId, settings?.currentAcademicPeriodId]);

  // ======================================================
  // MAPS + DERIVED DATA
  // ======================================================

  const studentMap = useMemo(() => new Map(students.map((row) => [row.id, row])), [students]);
  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return periods;
    return periods.filter((row) => row.academicStructureId === academicStructureId);
  }, [periods, academicStructureId]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<number>();

    enrollments.forEach((row) => {
      if (row.status !== "active") return;
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      ids.add(row.classId);
    });

    return ids;
  }, [enrollments, academicStructureId, academicPeriodId]);

  const availableClasses = useMemo(() => {
    if (!academicStructureId && !academicPeriodId) return classes;
    return classes.filter((row) => row.id && availableClassIds.has(row.id));
  }, [classes, availableClassIds, academicStructureId, academicPeriodId]);

  const attendanceKeyMap = useMemo(() => {
    const map = new Map<number, Attendance>();

    attendanceRows.forEach((row) => {
      if (!classId || !academicStructureId || !academicPeriodId || !date) return;
      if (row.classId !== classId) return;
      if (row.academicStructureId !== academicStructureId) return;
      if (row.academicPeriodId !== academicPeriodId) return;
      if (row.date !== date) return;
      map.set(row.studentId, row);
    });

    return map;
  }, [attendanceRows, classId, academicStructureId, academicPeriodId, date]);

  const studentRows = useMemo<StudentRow[]>(() => {
    if (!classId || !academicStructureId || !academicPeriodId) return [];

    return enrollments
      .filter((row) => {
        return (
          row.classId === classId &&
          row.academicStructureId === academicStructureId &&
          row.academicPeriodId === academicPeriodId &&
          row.status === "active" &&
          !row.isDeleted
        );
      })
      .map((enrollment) => {
        const student = studentMap.get(enrollment.studentId);
        if (!student) return undefined;
        return {
          student,
          enrollment,
          existingAttendance: student.id ? attendanceKeyMap.get(student.id) : undefined,
        };
      })
      .filter(Boolean) as StudentRow[];
  }, [enrollments, classId, academicStructureId, academicPeriodId, studentMap, attendanceKeyMap]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return studentRows.filter(({ student }) => {
      const sid = student.id || 0;
      const status = statusMap[sid];

      if (attendanceFilter === "unmarked" && status) return false;
      if (["present", "absent", "late"].includes(attendanceFilter) && status !== attendanceFilter) {
        return false;
      }

      if (!query) return true;

      return `${student.fullName} ${student.admissionNumber || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [studentRows, search, attendanceFilter, statusMap]);

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
      .filter((row) => {
        return (
          row.classId === classId &&
          row.academicStructureId === academicStructureId &&
          row.academicPeriodId === academicPeriodId &&
          row.date === date
        );
      })
      .forEach((row) => {
        next[row.studentId] = row.status as AttendanceStatus;
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
    const unmarked = Math.max(0, total - marked);
    const completion = total ? Math.round((marked / total) * 100) : 0;

    return { total, marked, present, absent, late, unmarked, completion };
  }, [filteredStudents, statusMap]);

  const fullSummary = useMemo(() => {
    const total = studentRows.length;
    const marked = studentRows.filter(({ student }) => !!statusMap[student.id || 0]).length;
    const completion = total ? Math.round((marked / total) * 100) : 0;
    return { total, marked, completion };
  }, [studentRows, statusMap]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const setStudentStatus = (studentId: number, status: AttendanceStatus) => {
    setStatusMap((prev) => ({ ...prev, [studentId]: status }));
  };

  const clearStudentStatus = (studentId: number) => {
    setStatusMap((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  };

  const markAll = (status: AttendanceStatus) => {
    const next: AttendanceMap = {};
    filteredStudents.forEach(({ student }) => {
      if (student.id) next[student.id] = status;
    });
    setStatusMap((prev) => ({ ...prev, ...next }));
  };

  const clearShown = () => {
    setStatusMap((prev) => {
      const next = { ...prev };
      filteredStudents.forEach(({ student }) => {
        if (student.id) delete next[student.id];
      });
      return next;
    });
  };

  const saveAttendance = async () => {
    if (!authenticated || !accountId) return alert("Sign in first");
    if (!schoolId) return alert("Select school first");
    if (!branchId) return alert("Select branch first");
    if (!classId) return alert("Select class");
    if (!academicStructureId) return alert("Select academic structure");
    if (!academicPeriodId) return alert("Select academic period");
    if (!date) return alert("Select date");

    try {
      setSaving(true);

      for (const { student } of studentRows) {
        const sid = student.id;
        if (!sid) continue;

        const status = statusMap[sid];
        const existing = attendanceKeyMap.get(sid);

        if (existing?.id && !status) {
          await db.attendance.update(existing.id, {
            isDeleted: true,
            synced: SyncStatus.PENDING,
            updatedAt: Date.now(),
          } as Partial<Attendance>);
          continue;
        }

        if (!status) continue;

        if (existing?.id) {
          await db.attendance.update(existing.id, {
            accountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
            studentId: sid,
            classId,
            academicStructureId,
            academicPeriodId,
            date,
            status,
            isDeleted: false,
            synced: SyncStatus.PENDING,
            updatedAt: Date.now(),
          } as Partial<Attendance>);
        } else {
          const payload = prepareSyncData({
            accountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
            studentId: sid,
            classId,
            academicStructureId,
            academicPeriodId,
            date,
            status,
          }) as Attendance;

          await db.attendance.add(payload);
        }
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
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="sat-page" style={{ "--sat-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sat-state-card">
          <div className="sat-spinner" />
          <h2>Opening attendance...</h2>
          <p>Checking account, branch, academic context, enrollments, and attendance records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sat-page" style={{ "--sat-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sat-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before recording attendance.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="sat-page" style={{ "--sat-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sat-state-card">
          <h2>Select a branch first</h2>
          <p>Student attendance belongs to one active school branch.</p>
          <button type="button" className="sat-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="sat-page" style={{ "--sat-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sat-hero">
        <div className="sat-hero-left">
          <div className="sat-hero-icon">📅</div>
          <div className="sat-title-wrap">
            <p>Daily Register</p>
            <h2>Student Attendance</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" onClick={saveAttendance} disabled={saving} className="sat-primary-btn">
          {saving ? "Saving..." : "Save Attendance"}
        </button>
      </section>

      <section className="sat-context-card">
        <div>
          <p>Register Context</p>
          <h3>{classId ? classMap.get(classId)?.name || "Selected Class" : "Select a class"}</h3>
          <span>{date} · {fullSummary.marked}/{fullSummary.total} marked · {fullSummary.completion}% complete</span>
        </div>
        <div className="sat-pill-row">
          <Chip tone="blue">Enrollment-based</Chip>
          <Chip tone={fullSummary.completion === 100 && fullSummary.total > 0 ? "green" : "orange"}>{fullSummary.completion}% Done</Chip>
        </div>
      </section>

      <section className="sat-filter-card">
        <select
          value={academicStructureId || ""}
          onChange={(event) => {
            setAcademicStructureId(Number(event.target.value) || undefined);
            setAcademicPeriodId(undefined);
            setClassId(undefined);
          }}
        >
          <option value="">Select Academic Structure</option>
          {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.level}</option>)}
        </select>

        <select
          value={academicPeriodId || ""}
          onChange={(event) => {
            setAcademicPeriodId(Number(event.target.value) || undefined);
            setClassId(undefined);
          }}
        >
          <option value="">Select Academic Period</option>
          {filteredPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={classId || ""} onChange={(event) => setClassId(Number(event.target.value) || undefined)}>
          <option value="">Select Class</option>
          {availableClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search student or admission number..."
        />

        <select value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value as AttendanceFilter)}>
          <option value="all">All Students</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="late">Late</option>
          <option value="unmarked">Unmarked</option>
        </select>
      </section>

      <section className="sat-summary-grid" aria-label="Attendance summary">
        <SummaryCard label="Students" value={summary.total} icon="🎓" />
        <SummaryCard label="Marked" value={summary.marked} icon="✅" />
        <SummaryCard label="Present" value={summary.present} icon="🟢" />
        <SummaryCard label="Absent" value={summary.absent} icon="🔴" />
        <SummaryCard label="Late" value={summary.late} icon="🟠" />
        <SummaryCard label="Unmarked" value={summary.unmarked} icon="⚪" />
        <SummaryCard label="Completion" value={`${summary.completion}%`} icon="📊" />
      </section>

      <section className="sat-action-card">
        <button type="button" onClick={() => markAll("present")}>Mark Shown Present</button>
        <button type="button" onClick={() => markAll("absent")}>Mark Shown Absent</button>
        <button type="button" onClick={() => markAll("late")}>Mark Shown Late</button>
        <button type="button" className="danger" onClick={clearShown}>Clear Shown</button>
      </section>

      <section className="sat-list">
        {filteredStudents.map(({ student }) => {
          const sid = student.id || 0;
          const current = statusMap[sid];

          return (
            <article key={student.id} className="sat-student-card">
              <div className="sat-student-top">
                <div
                  className="sat-avatar"
                  style={{
                    background: student.photo
                      ? `url(${student.photo}) center/cover`
                      : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
                  }}
                >
                  {!student.photo && student.fullName.slice(0, 1).toUpperCase()}
                </div>

                <div className="sat-student-main">
                  <h3>{student.fullName}</h3>
                  <p>{student.admissionNumber || "No admission number"}</p>
                  <div className="sat-chip-row">
                    <Chip tone={statusTone(current)}>{statusLabel(current)}</Chip>
                    {student.gender && <Chip tone="gray">{student.gender}</Chip>}
                  </div>
                </div>
              </div>

              <div className="sat-status-grid">
                <button type="button" className={`present ${current === "present" ? "active" : ""}`} onClick={() => setStudentStatus(sid, "present")}>Present</button>
                <button type="button" className={`absent ${current === "absent" ? "active" : ""}`} onClick={() => setStudentStatus(sid, "absent")}>Absent</button>
                <button type="button" className={`late ${current === "late" ? "active" : ""}`} onClick={() => setStudentStatus(sid, "late")}>Late</button>
                <button type="button" className="clear" onClick={() => clearStudentStatus(sid)}>Clear</button>
              </div>
            </article>
          );
        })}

        {!filteredStudents.length && (
          <EmptyCard text={classId ? "No students match the current filter." : "Select academic structure, period, and class to load enrolled students."} />
        )}
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="sat-summary-card">
      <div className="sat-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`sat-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="sat-empty-card">
      <div className="sat-empty-icon">📅</div>
      <h3>No students loaded</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes satSpin { to { transform: rotate(360deg); } }

.sat-page {
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
.sat-page *, .sat-page *::before, .sat-page *::after { box-sizing: border-box; }
.sat-page button, .sat-page input, .sat-page select, .sat-page textarea { font: inherit; max-width: 100%; }
.sat-page img { max-width: 100%; }
.sat-page input,
.sat-page select,
.sat-page textarea {
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

.sat-state-card {
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
.sat-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.sat-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.sat-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--sat-primary) 18%, transparent); border-top-color: var(--sat-primary); animation: satSpin .8s linear infinite; }

.sat-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--sat-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.sat-primary-btn:disabled { opacity: .55; cursor: not-allowed; }

.sat-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sat-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.sat-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.sat-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--sat-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--sat-primary) 28%, transparent); font-size: 22px; }
.sat-title-wrap { min-width: 0; }
.sat-title-wrap p, .sat-title-wrap h2, .sat-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sat-title-wrap p { margin: 0 0 2px; color: var(--sat-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sat-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.sat-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.sat-context-card,
.sat-filter-card,
.sat-action-card,
.sat-student-card,
.sat-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  padding: 13px;
}
.sat-context-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sat-primary) 10%, #fff), #fff 68%);
}
.sat-context-card p { margin: 0; color: var(--sat-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sat-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.sat-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.sat-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }
.sat-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }

.sat-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.sat-summary-card {
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
.sat-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--sat-primary) 12%, #fff); }
.sat-summary-card div:last-child { min-width: 0; }
.sat-summary-card strong, .sat-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sat-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.sat-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.sat-action-card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.sat-action-card button {
  min-height: 42px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.sat-action-card button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.13); }

.sat-list { display: grid; gap: 10px; margin-top: 10px; }
.sat-student-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.sat-student-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.sat-avatar { width: 54px; height: 54px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.sat-student-main { min-width: 0; flex: 1; }
.sat-student-main h3, .sat-student-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.sat-student-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.sat-student-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.sat-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.sat-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sat-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.sat-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.sat-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.sat-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.sat-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.sat-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.sat-status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.sat-status-grid button {
  min-height: 42px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, .24);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.sat-status-grid button.present.active { border-color: rgba(34,197,94,.45); background: rgba(34,197,94,.14); color: #16a34a; }
.sat-status-grid button.absent.active { border-color: rgba(239,68,68,.45); background: rgba(239,68,68,.14); color: #dc2626; }
.sat-status-grid button.late.active { border-color: rgba(245,158,11,.45); background: rgba(245,158,11,.16); color: #b45309; }
.sat-status-grid button.clear { color: #64748b; }
.sat-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.sat-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--sat-primary) 12%, #fff); font-size: 28px; }
.sat-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.sat-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

@media (min-width: 680px) {
  .sat-page { padding: 12px; }
  .sat-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sat-summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .sat-action-card { display: flex; flex-wrap: wrap; }
  .sat-action-card button { padding: 0 14px; }
  .sat-status-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .sat-page { padding: 16px; }
  .sat-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .sat-summary-grid { grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .sat-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .sat-page { padding: 6px; }
  .sat-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .sat-primary-btn { width: 100%; }
  .sat-context-card, .sat-filter-card, .sat-action-card, .sat-student-card, .sat-empty-card { border-radius: 20px; padding: 11px; }
  .sat-summary-grid { gap: 6px; }
  .sat-summary-card { padding: 10px; border-radius: 19px; }
  .sat-summary-card strong { font-size: 16px; }
  .sat-action-card { grid-template-columns: 1fr; }
  .sat-avatar { width: 50px; height: 50px; flex-basis: 50px; }
}
`;
