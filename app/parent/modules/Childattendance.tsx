"use client";

/**
 * app/parent/modules/Childattendance.tsx
 * ---------------------------------------------------------
 * PARENT PORTAL — CHILD ATTENDANCE
 * ---------------------------------------------------------
 *
 * Parent-scoped attendance module:
 * - No school selector.
 * - No branch selector.
 * - Uses active parent membership.
 * - Shows only attendance for children linked to the logged-in parent.
 *
 * UI:
 * - Cards / Table / Analytics view switching.
 * - Mobile-first.
 * - Dark-mode safe.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  Attendance,
  Class,
  db,
  Parent,
  Student,
  StudentEnrollment,
  StudentParent,
} from "../../lib/db/db";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type ViewMode = "cards" | "table" | "analytics";
type DateFilter = "all" | "today" | "week" | "month" | "custom";

type AttendanceStatus = Attendance["status"] | string;

type AttendanceView = {
  row: Attendance;
  student?: Student;
  className: string;
  status: AttendanceStatus;
  date: string;
  timeIn?: string;
  timeOut?: string;
  note?: string;
};

type ChildAttendanceSummary = {
  student: Student;
  className: string;
  records: AttendanceView[];
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
};

type Breakdown = {
  name: string;
  count: number;
  percentage?: number;
};

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

const startOfWeekISO = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.setDate(diff));
  return start.toISOString().slice(0, 10);
};

const startOfMonthISO = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const dateValue = (value?: string) => {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
};

const niceDate = (value?: string) => {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
};

const textOrDash = (value?: string | number | null) => {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
};

const statusLabel = (status?: AttendanceStatus) =>
  String(status || "unknown").replaceAll("_", " ");

const statusTone = (status?: AttendanceStatus): "green" | "red" | "blue" | "gray" | "orange" | "purple" => {
  if (status === "present") return "green";
  if (status === "absent") return "red";
  if (status === "late") return "orange";
  if (status === "excused") return "blue";
  return "gray";
};

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total || 0)) * 100);
}

// ======================================================
// COMPONENT
// ======================================================

export default function Childattendance() {
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

  const membershipContext = useActiveMembership() as any;

  const activeMembership = membershipContext?.activeMembership;
  const activeParentId =
    membershipContext?.activeParentId ||
    activeMembership?.parentLocalId ||
    undefined;

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);

  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [classFilter, setClassFilter] = useState<number | "all">("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [fromDate, setFromDate] = useState(startOfMonthISO());
  const [toDate, setToDate] = useState(todayISO());

  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

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
      router.replace("/owner");
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
    setParents([]);
    setStudentParents([]);
    setStudents([]);
    setClasses([]);
    setEnrollments([]);
    setAttendance([]);
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
        parentRows,
        studentParentRows,
        studentRows,
        classRows,
        enrollmentRows,
        attendanceRows,
      ] = await Promise.all([
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.students.toArray(),
        db.classes.toArray(),
        db.studentEnrollments.toArray(),
        db.attendance.toArray(),
      ]);

      const scopedParents = parentRows.filter(sameTenant);
      const scopedStudentParents = studentParentRows.filter(sameTenant);
      const scopedStudents = studentRows.filter(sameTenant);

      const parentIds = new Set<number>();

      if (activeParentId) parentIds.add(Number(activeParentId));
      if (activeMembership?.parentLocalId) parentIds.add(Number(activeMembership.parentLocalId));

      const userEmail = String((activeMembership as any)?.email || "").toLowerCase();
      scopedParents
        .filter((parent) => userEmail && String(parent.email || "").toLowerCase() === userEmail)
        .forEach((parent) => {
          if (parent.id) parentIds.add(parent.id);
        });

      const linkedStudentParents = scopedStudentParents.filter(
        (link) => !parentIds.size || parentIds.has(link.parentId)
      );

      const childIds = new Set<number>(linkedStudentParents.map((link) => link.studentId));
      const childRows = scopedStudents.filter((student) => student.id && childIds.has(student.id));

      setParents(parentIds.size ? scopedParents.filter((parent) => parent.id && parentIds.has(parent.id)) : scopedParents);
      setStudentParents(linkedStudentParents);
      setStudents(childRows);
      setClasses(classRows.filter((row) => sameTenant(row) && row.active !== false));
      setEnrollments(enrollmentRows.filter(sameTenant).filter((row) => childIds.has(row.studentId)));
      setAttendance(attendanceRows.filter(sameTenant).filter((row) => childIds.has(row.studentId)));
    } catch (error) {
      console.error("Failed to load child attendance:", error);
      clearData();
      alert("Failed to load child attendance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, activeParentId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const studentMap = useMemo(() => new Map(students.map((row) => [row.id, row])), [students]);
  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);

  const childClassMap = useMemo(() => {
    const map = new Map<number, number>();

    students.forEach((student) => {
      if (student.id && student.currentClassId) map.set(student.id, student.currentClassId);
    });

    enrollments
      .filter((enrollment) => enrollment.status === "active")
      .forEach((enrollment) => {
        map.set(enrollment.studentId, enrollment.classId);
      });

    return map;
  }, [students, enrollments]);

  const attendanceViews = useMemo<AttendanceView[]>(() => {
    return attendance
      .map((row) => {
        const student = studentMap.get(row.studentId);
        const classId = (row as any).classId || (student?.id ? childClassMap.get(student.id) : undefined);
        const klass = classId ? classMap.get(classId) : undefined;

        return {
          row,
          student,
          className: klass?.name || "No class assigned",
          status: row.status,
          date: row.date,
          timeIn: (row as any).timeIn,
          timeOut: (row as any).timeOut,
          note: (row as any).remarks,
        };
      })
      .sort((a, b) => dateValue(b.date) - dateValue(a.date) || (a.student?.fullName || "").localeCompare(b.student?.fullName || ""));
  }, [attendance, studentMap, classMap, childClassMap]);

  const filteredAttendance = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = todayISO();
    const weekStart = startOfWeekISO();
    const monthStart = startOfMonthISO();

    return attendanceViews.filter((item) => {
      const studentId = item.student?.id;
      const classId = studentId ? childClassMap.get(studentId) : undefined;

      if (studentFilter !== "all" && studentId !== studentFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (classFilter !== "all" && classId !== classFilter) return false;

      if (dateFilter === "today" && item.date !== today) return false;
      if (dateFilter === "week" && (item.date < weekStart || item.date > today)) return false;
      if (dateFilter === "month" && (item.date < monthStart || item.date > today)) return false;
      if (dateFilter === "custom") {
        if (fromDate && item.date < fromDate) return false;
        if (toDate && item.date > toDate) return false;
      }

      if (!query) return true;

      return `
        ${item.student?.fullName || ""}
        ${item.student?.admissionNumber || ""}
        ${item.className}
        ${item.status}
        ${item.date}
        ${item.note || ""}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [
    attendanceViews,
    search,
    studentFilter,
    statusFilter,
    classFilter,
    dateFilter,
    fromDate,
    toDate,
    childClassMap,
  ]);

  const childSummaries = useMemo<ChildAttendanceSummary[]>(() => {
    return students
      .map((student) => {
        const classId = student.id ? childClassMap.get(student.id) : undefined;
        const className = classId ? classMap.get(classId)?.name || "Class" : "No class assigned";
        const records = filteredAttendance.filter((item) => item.student?.id === student.id);

        const present = records.filter((item) => item.status === "present").length;
        const absent = records.filter((item) => item.status === "absent").length;
        const late = records.filter((item) => item.status === "late").length;
        const excused = records.filter((item) => item.status === "excused").length;
        const total = records.length;
        const rate = percentage(present + late + excused, total);

        return {
          student,
          className,
          records,
          present,
          absent,
          late,
          excused,
          total,
          rate,
        };
      })
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
  }, [students, filteredAttendance, childClassMap, classMap]);

  const selectedChild = useMemo(() => {
    if (!selectedStudentId) return null;
    return childSummaries.find((child) => child.student.id === selectedStudentId) || null;
  }, [selectedStudentId, childSummaries]);

  const summary = useMemo(() => {
    const present = filteredAttendance.filter((item) => item.status === "present").length;
    const absent = filteredAttendance.filter((item) => item.status === "absent").length;
    const late = filteredAttendance.filter((item) => item.status === "late").length;
    const excused = filteredAttendance.filter((item) => item.status === "excused").length;
    const total = filteredAttendance.length;

    return {
      children: students.length,
      records: total,
      present,
      absent,
      late,
      excused,
      rate: percentage(present + late + excused, total),
    };
  }, [filteredAttendance, students.length]);

  const statusBreakdown = useMemo<Breakdown[]>(() => {
    const statuses = ["present", "absent", "late", "excused"];
    return statuses.map((status) => {
      const count = filteredAttendance.filter((item) => item.status === status).length;
      return {
        name: status,
        count,
        percentage: percentage(count, filteredAttendance.length),
      };
    }).filter((item) => item.count > 0);
  }, [filteredAttendance]);

  const childBreakdown = useMemo<Breakdown[]>(() => {
    return childSummaries.map((child) => ({
      name: child.student.fullName,
      count: child.total,
      percentage: child.rate,
    })).sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0));
  }, [childSummaries]);

  const classBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredAttendance.forEach((item) => {
      const existing = map.get(item.className) || { name: item.className, count: 0 };
      existing.count += 1;
      map.set(item.className, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredAttendance]);

  const uniqueStatuses = useMemo(() => {
    return Array.from(new Set(attendanceViews.map((item) => item.status).filter(Boolean)));
  }, [attendanceViews]);

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="patt-page" style={{ "--patt-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="patt-state-card">
          <div className="patt-spinner" />
          <h2>Opening attendance...</h2>
          <p>Checking parent profile, linked children, classes and attendance records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="patt-page" style={{ "--patt-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="patt-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing child attendance.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="patt-page" style={{ "--patt-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="patt-state-card">
          <h2>Assigned school branch required</h2>
          <p>Your parent portal must be linked to a school branch before attendance can be shown.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="patt-page" style={{ "--patt-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="patt-hero">
        <div className="patt-hero-left">
          <div className="patt-hero-icon">📅</div>
          <div className="patt-title-wrap">
            <p>Parent Monitoring</p>
            <h2>Child Attendance</h2>
            <span>
              {activeSchool?.name || "School"} · {activeBranch?.name || "Branch"}
            </span>
          </div>
        </div>

        <div className="patt-hero-actions">
          <button type="button" className="patt-ghost-btn" onClick={load}>
            Refresh
          </button>
        </div>
      </section>

      <section className="patt-context-grid">
        <article>
          <div className="patt-context-icon">👨‍👩‍👧</div>
          <div>
            <span>Linked Children</span>
            <strong>{students.length}</strong>
            <p>Only attendance for your linked children appears here.</p>
          </div>
        </article>

        <article>
          <div className="patt-context-icon">🏫</div>
          <div>
            <span>School Branch</span>
            <strong>{activeBranch?.name || "Assigned branch"}</strong>
            <p>Attendance is locked to your child’s branch.</p>
          </div>
        </article>
      </section>

      <section className="patt-summary-grid" aria-label="Attendance summary">
        <SummaryCard label="Children" value={summary.children} icon="🧒" />
        <SummaryCard label="Records" value={summary.records} icon="🧾" />
        <SummaryCard label="Present" value={summary.present} icon="✅" positive />
        <SummaryCard label="Absent" value={summary.absent} icon="❌" danger={summary.absent > 0} />
        <SummaryCard label="Late" value={summary.late} icon="⏰" warning={summary.late > 0} />
        <SummaryCard label="Rate" value={`${summary.rate}%`} icon="📊" positive={summary.rate >= 90} warning={summary.rate > 0 && summary.rate < 70} />
      </section>

      <section className="patt-toolbar">
        <div className="patt-view-tabs">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            Cards
          </button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Table
          </button>
          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
            Analytics
          </button>
        </div>

        <Chip tone="gray">{filteredAttendance.length} record(s)</Chip>
      </section>

      <section className="patt-filter-card">
        <input
          placeholder="Search child, class, date, note..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
          <option value="all">All Children</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName}
              {student.admissionNumber ? ` • ${student.admissionNumber}` : ""}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AttendanceStatus | "all")}>
          <option value="all">All Statuses</option>
          {uniqueStatuses.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>

        <select value={classFilter} onChange={(event) => setClassFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
          <option value="all">All Classes</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)}>
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="custom">Custom Range</option>
        </select>

        {dateFilter === "custom" && (
          <>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </>
        )}
      </section>

      {viewMode === "analytics" && (
        <>
          <BreakdownSection title="Attendance by Child" items={childBreakdown} tone="purple" showPercentage />
          <BreakdownSection title="Status Breakdown" items={statusBreakdown} tone="blue" showPercentage />
          <BreakdownSection title="Class Breakdown" items={classBreakdown} tone="green" />
        </>
      )}

      {viewMode === "table" && (
        <section className="patt-table-card">
          <div className="patt-section-head">
            <div>
              <p>Parent Attendance Register</p>
              <h3>Attendance Table</h3>
            </div>
            <Chip tone="blue">Parent Scoped</Chip>
          </div>

          <div className="patt-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Note</th>
                </tr>
              </thead>

              <tbody>
                {filteredAttendance.map((item) => (
                  <tr key={item.row.id}>
                    <td>{niceDate(item.date)}</td>
                    <td>
                      <strong>{item.student?.fullName || "Student"}</strong>
                      <span>{item.student?.admissionNumber || "No admission number"}</span>
                    </td>
                    <td>{item.className}</td>
                    <td><Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip></td>
                    <td>{textOrDash(item.timeIn)}</td>
                    <td>{textOrDash(item.timeOut)}</td>
                    <td>{textOrDash(item.note)}</td>
                  </tr>
                ))}

                {!filteredAttendance.length && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyCard text="No attendance records were found for your linked children under the selected filters." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="patt-section">
          <div className="patt-section-head">
            <div>
              <p>Child Attendance Overview</p>
              <h3>Attendance by Child</h3>
            </div>
            <Chip tone="gray">{childSummaries.length} child(ren)</Chip>
          </div>

          <div className="patt-list">
            {childSummaries.map((child) => (
              <article key={child.student.id} className="patt-card">
                <div className="patt-card-top">
                  <div className="patt-avatar">
                    {child.student.photo ? (
                      <img src={child.student.photo} alt={child.student.fullName} />
                    ) : (
                      child.student.fullName.slice(0, 1).toUpperCase()
                    )}
                  </div>

                  <div className="patt-card-main">
                    <h3>{child.student.fullName}</h3>
                    <p>
                      {child.student.admissionNumber || "No admission number"} · {child.className}
                    </p>

                    <div className="patt-chip-row">
                      <Chip tone={child.rate >= 90 ? "green" : child.rate >= 70 ? "blue" : child.rate > 0 ? "orange" : "gray"}>
                        {child.rate}% attendance
                      </Chip>
                      <Chip tone="green">{child.present} present</Chip>
                      {child.absent > 0 && <Chip tone="red">{child.absent} absent</Chip>}
                      {child.late > 0 && <Chip tone="orange">{child.late} late</Chip>}
                    </div>
                  </div>
                </div>

                <div className="patt-mini-grid">
                  <MiniStat label="Records" value={child.total} />
                  <MiniStat label="Present" value={child.present} />
                  <MiniStat label="Absent" value={child.absent} />
                  <MiniStat label="Excused" value={child.excused} />
                </div>

                <div className="patt-action-row">
                  <button type="button" onClick={() => setSelectedStudentId(child.student.id || null)}>
                    View Attendance
                  </button>
                </div>
              </article>
            ))}

            {!childSummaries.length && (
              <EmptyCard text="No linked children or attendance records were found." />
            )}
          </div>
        </section>
      )}

      {selectedChild && (
        <div className="patt-drawer-layer">
          <button type="button" className="patt-drawer-overlay" aria-label="Close attendance details" onClick={() => setSelectedStudentId(null)} />

          <aside className="patt-drawer">
            <div className="patt-drawer-head">
              <div>
                <p>Attendance Details</p>
                <h2>{selectedChild.student.fullName}</h2>
                <span>{selectedChild.className} · {activeBranch?.name || "Branch"}</span>
              </div>
              <button type="button" onClick={() => setSelectedStudentId(null)}>✕</button>
            </div>

            <section className="patt-drawer-grid">
              <MiniStat label="Attendance Rate" value={`${selectedChild.rate}%`} />
              <MiniStat label="Present" value={selectedChild.present} />
              <MiniStat label="Absent" value={selectedChild.absent} />
              <MiniStat label="Late" value={selectedChild.late} />
            </section>

            <section className="patt-drawer-section">
              <h3>Recent Attendance</h3>
              <div className="patt-line-list">
                {selectedChild.records.map((item) => (
                  <div key={item.row.id}>
                    <span>{niceDate(item.date)} · {item.className}</span>
                    <strong>{statusLabel(item.status)}</strong>
                  </div>
                ))}

                {!selectedChild.records.length && (
                  <div>
                    <span>No attendance records found for this child.</span>
                    <strong>-</strong>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({
  label,
  value,
  icon,
  positive = false,
  warning = false,
  danger = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <article className={`patt-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""} ${danger ? "danger" : ""}`}>
      <div className="patt-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function BreakdownSection({
  title,
  items,
  tone,
  showPercentage = false,
}: {
  title: string;
  items: Breakdown[];
  tone: "green" | "blue" | "purple" | "orange";
  showPercentage?: boolean;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="patt-section">
      <div className="patt-section-head">
        <div>
          <p>Analytical View</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{items.length} group(s)</Chip>
      </div>

      <div className="patt-breakdown-grid">
        {items.map((item) => {
          const width = showPercentage
            ? Number(item.percentage || 0)
            : percentage(item.count, total);

          return (
            <article key={item.name} className="patt-breakdown-card">
              <div className="patt-breakdown-top">
                <strong>{statusLabel(item.name)}</strong>
                <Chip tone={tone}>{showPercentage ? `${item.percentage || 0}%` : item.count}</Chip>
              </div>

              <div className="patt-bar-track">
                <div style={{ width: `${width}%` }} />
              </div>

              <div className="patt-chip-row">
                <Chip tone="gray">{item.count} record(s)</Chip>
                <Chip tone="gray">{width}%</Chip>
              </div>
            </article>
          );
        })}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available for the selected filters.`} />}
      </div>
    </section>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`patt-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="patt-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="patt-empty-card">
      <div className="patt-empty-icon">📅</div>
      <h3>No attendance data</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes pattSpin { to { transform: rotate(360deg); } }

.patt-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--patt-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 16px);
  overflow-x: hidden;
}

.patt-page *,
.patt-page *::before,
.patt-page *::after {
  box-sizing: border-box;
}

.patt-page button,
.patt-page input,
.patt-page select {
  font: inherit;
  max-width: 100%;
}

.patt-page input,
.patt-page select {
  width: 100%;
  min-height: 43px;
  border: 1px solid var(--input-border, var(--border, rgba(148,163,184,.28)));
  border-radius: 15px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #0f172a));
  outline: none;
  font-weight: 750;
}

.patt-page input:focus,
.patt-page select:focus {
  border-color: var(--patt-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--patt-primary) 12%, transparent);
}

.patt-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.patt-state-card h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.patt-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.patt-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--patt-primary) 18%, transparent);
  border-top-color: var(--patt-primary);
  animation: pattSpin .8s linear infinite;
}

.patt-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--patt-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--patt-primary) 7%, var(--card, #fff)) 72%);
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.patt-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.patt-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--patt-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--patt-primary) 28%, transparent);
  font-size: 22px;
}

.patt-title-wrap {
  min-width: 0;
}

.patt-title-wrap p,
.patt-title-wrap h2,
.patt-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patt-title-wrap p {
  margin: 0 0 2px;
  color: var(--patt-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.patt-title-wrap h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.patt-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.patt-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.patt-ghost-btn,
.patt-action-row button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
}

.patt-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.patt-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--patt-primary) 10%, var(--card, var(--surface, #fff))), var(--card, var(--surface, #fff)) 70%);
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.04);
}

.patt-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--patt-primary);
  color: #fff;
  font-size: 20px;
}

.patt-context-grid article > div:last-child {
  min-width: 0;
}

.patt-context-grid span {
  display: block;
  color: var(--patt-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.patt-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.patt-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.patt-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.patt-summary-card,
.patt-toolbar,
.patt-filter-card,
.patt-table-card,
.patt-breakdown-card,
.patt-card,
.patt-empty-card {
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.patt-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.patt-summary-card.positive {
  background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card, var(--surface, #fff)));
}

.patt-summary-card.warning {
  background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card, var(--surface, #fff)));
}

.patt-summary-card.danger {
  background: linear-gradient(135deg, rgba(239,68,68,.10), var(--card, var(--surface, #fff)));
}

.patt-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--patt-primary) 12%, var(--surface, #fff));
}

.patt-summary-card div:last-child {
  min-width: 0;
}

.patt-summary-card strong,
.patt-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patt-summary-card strong {
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.patt-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.patt-toolbar,
.patt-filter-card,
.patt-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.patt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.patt-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--patt-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.patt-view-tabs button {
  min-width: 0;
  min-height: 35px;
  border: 0;
  border-radius: 999px;
  padding: 0 9px;
  background: transparent;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.patt-view-tabs button.active {
  background: var(--patt-primary);
  color: #fff;
}

.patt-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.patt-section {
  margin-top: 16px;
}

.patt-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.patt-section-head p {
  margin: 0;
  color: var(--patt-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.patt-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.patt-list,
.patt-breakdown-grid {
  display: grid;
  gap: 10px;
}

.patt-card,
.patt-breakdown-card,
.patt-empty-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.patt-card {
  background:
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--patt-primary) 4%, var(--card, #fff)));
}

.patt-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.patt-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 19px;
  background: var(--patt-primary);
  color: #fff;
  font-size: 22px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
  overflow: hidden;
}

.patt-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.patt-card-main {
  min-width: 0;
  flex: 1;
}

.patt-card-main h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.patt-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.patt-chip-row,
.patt-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.patt-chip {
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
  text-transform: capitalize;
}

.patt-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.patt-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.patt-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.patt-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.patt-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.patt-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.patt-mini-grid,
.patt-drawer-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.patt-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.13));
  overflow: hidden;
}

.patt-mini-stat strong,
.patt-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patt-mini-stat strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
}

.patt-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.patt-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.patt-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patt-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.patt-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--patt-primary);
}

.patt-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.patt-table-scroll table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  background: var(--card, var(--surface, #fff));
}

.patt-table-scroll th,
.patt-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(148,163,184,.16));
  text-align: left;
  vertical-align: top;
  color: var(--text, #0f172a);
  font-size: 13px;
}

.patt-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--patt-primary) 6%, var(--card, #fff));
}

.patt-table-scroll td strong,
.patt-table-scroll td span {
  display: block;
}

.patt-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.patt-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.patt-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--patt-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.patt-empty-card h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
}

.patt-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.patt-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.patt-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15,23,42,.52);
}

.patt-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 620px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}

.patt-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--card, var(--surface, #fff));
}

.patt-drawer-head div {
  min-width: 0;
}

.patt-drawer-head p {
  margin: 0;
  color: var(--patt-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.patt-drawer-head h2,
.patt-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.patt-drawer-head h2 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.patt-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.patt-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 1000;
  cursor: pointer;
}

.patt-drawer-section {
  margin-top: 16px;
}

.patt-drawer-section h3 {
  margin: 0 0 10px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
}

.patt-line-list {
  display: grid;
  gap: 7px;
}

.patt-line-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.14));
}

.patt-line-list span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.patt-line-list strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
  text-align: right;
  text-transform: capitalize;
}

@media (min-width: 680px) {
  .patt-page { padding: 12px; }
  .patt-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .patt-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .patt-context-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .patt-page { padding: 16px; }
  .patt-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .patt-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .patt-list,
  .patt-breakdown-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .patt-page { padding: 6px; }
  .patt-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .patt-hero-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
  .patt-ghost-btn { width: 100%; }
  .patt-summary-grid { gap: 6px; }
  .patt-summary-card { padding: 10px; border-radius: 19px; }
  .patt-summary-card strong { font-size: 16px; }
  .patt-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .patt-view-tabs { width: 100%; }
  .patt-card,
  .patt-empty-card,
  .patt-breakdown-card { border-radius: 20px; padding: 11px; }
  .patt-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .patt-mini-grid,
  .patt-drawer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .patt-action-row { display: grid; grid-template-columns: minmax(0, 1fr); }
  .patt-action-row button { width: 100%; }
  .patt-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
