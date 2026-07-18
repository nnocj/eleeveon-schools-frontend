"use client";

/**
 * app/student/modules/Myattendance.tsx
 * ---------------------------------------------------------
 * ELEEVEON STUDENT MY ATTENDANCE V1
 * ---------------------------------------------------------
 * Student-scoped, offline-first, mobile-first, theme-safe.
 *
 * Purpose:
 * - Let the logged-in student view only their own attendance records.
 * - Use the selected student membership from ActiveMembershipContext.
 * - Keep this as a learner view: no marking, no saving, no bulk actions.
 *
 * Built from the Branch Admin StudentAttendance golden pattern, but converted
 * into a read-only student workspace:
 * - compact search + slider filter + More sheet
 * - cards, table and analytics views
 * - filters for class, academic structure, academic period, status and date
 * - no create/update/delete operations
 * - all records scoped to active studentLocalId
 *
 * Data sources:
 * - students
 * - studentEnrollments
 * - classes
 * - academicStructures
 * - academicPeriods
 * - attendance
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  type AcademicPeriod,
  type AcademicStructure,
  type Attendance,
  type Class,
  type Student,
  type StudentEnrollment,
} from "../../lib/db/db";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "summary";
type AttendanceStatus = "present" | "absent" | "late";
type AttendanceFilter = "all" | AttendanceStatus;
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type AttendanceView = {
  id: number;
  row: Attendance;
  className: string;
  structureName: string;
  periodName: string;
  date: string;
  status: AttendanceStatus;
};

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function idOf(value: any) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value?.id ?? value?.localId ?? value?.payload?.id ?? value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function sameId(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function activeRow(row: AnyRow) {
  const status = String(row?.status || "").toLowerCase();
  return row?.isDeleted !== true && row?.active !== false && !["deleted", "archived", "inactive", "disabled", "withdrawn"].includes(status);
}

function sameScope(row: TenantRow, accountId?: string | null, schoolId?: number | null, branchId?: number | null) {
  if (!row || row.isDeleted === true) return false;
  if (accountId && row.accountId && row.accountId !== accountId) return false;
  if (schoolId && row.schoolId && Number(row.schoolId) !== Number(schoolId)) return false;
  if (branchId && row.branchId && Number(row.branchId) !== Number(branchId)) return false;
  return true;
}

function rowName(row?: AnyRow | null) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
}

function dateLabel(value?: number | string | null) {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(time));
  } catch {
    return String(value);
  }
}

function statusLabel(status?: string) {
  const raw = String(status || "").toLowerCase();
  if (raw === "present") return "Present";
  if (raw === "absent") return "Absent";
  if (raw === "late") return "Late";
  return "Unknown";
}

function statusTone(status?: string): Tone {
  const raw = String(status || "").toLowerCase();
  if (raw === "present") return "green";
  if (raw === "absent") return "red";
  if (raw === "late") return "orange";
  return "gray";
}

function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : Promise.resolve([]);
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ma-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="ma-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Empty({ title, text: body }: { title: string; text: string }) {
  return (
    <section className="ma-empty">
      <div>📅</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

export default function Myattendance() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeMembership, activeStudentId } = useActiveMembership();

  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";
  const schoolId = idOf(activeMembership?.schoolId || settings?.schoolId);
  const branchId = idOf(activeMembership?.branchId || settings?.branchId);
  const studentId = idOf(activeStudentId || activeMembership?.studentLocalId);

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceFilter>("all");
  const [classFilter, setClassFilter] = useState("all");
  const [structureFilter, setStructureFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState<AttendanceView | null>(null);

  const [student, setStudent] = useState<Student | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<Attendance[]>([]);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function load() {
    if (!authenticated || !accountId || !studentId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [studentRows, enrollmentRows, classRows, structureRows, periodRows, attendanceData] = await Promise.all([
        safeArray<Student>("students"),
        safeArray<StudentEnrollment>("studentEnrollments"),
        safeArray<Class>("classes"),
        safeArray<AcademicStructure>("academicStructures"),
        safeArray<AcademicPeriod>("academicPeriods"),
        safeArray<Attendance>("attendance"),
      ]);

      const scoped = <T extends TenantRow>(rows: T[]) => rows.filter((row) => sameScope(row, accountId, schoolId || undefined, branchId || undefined));

      const activeStudent = scoped(studentRows as any[]).find((row) => sameId((row as any).id, studentId)) || null;

      setStudent(activeStudent as Student | null);
      setEnrollments(scoped(enrollmentRows as any[]).filter((row: any) => sameId(row.studentId, studentId)) as StudentEnrollment[]);
      setClasses(scoped(classRows as any[]).filter(activeRow as any).sort((a: any, b: any) => rowName(a).localeCompare(rowName(b))) as Class[]);
      setAcademicStructures(scoped(structureRows as any[]).filter(activeRow as any).sort((a: any, b: any) => rowName(a).localeCompare(rowName(b))) as AcademicStructure[]);
      setPeriods(scoped(periodRows as any[]).filter(activeRow as any).sort((a: any, b: any) => n((a as any).order) - n((b as any).order)) as AcademicPeriod[]);
      setAttendanceRows(scoped(attendanceData as any[]).filter((row: any) => sameId(row.studentId, studentId)) as Attendance[]);
    } catch (error) {
      console.error("Failed to load my attendance:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, studentId, schoolId, branchId, accountLoading, settingsLoading]);

  const classMap = useMemo(() => new Map(classes.map((row: any) => [idOf(row), row])), [classes]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row: any) => [idOf(row), row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(periods.map((row: any) => [idOf(row), row])), [periods]);

  const currentEnrollment = useMemo(() => {
    return (
      enrollments.find((row: any) => String(row.status || "active").toLowerCase() === "active" && activeRow(row as any)) ||
      [...enrollments].sort((a: any, b: any) => n(b.updatedAt || b.createdAt) - n(a.updatedAt || a.createdAt))[0] ||
      null
    );
  }, [enrollments]);

  const attendanceViews = useMemo<AttendanceView[]>(() => {
    return attendanceRows
      .filter(activeRow as any)
      .map((row: any) => {
        const classRow = classMap.get(idOf(row.classId));
        const structure = structureMap.get(idOf(row.academicStructureId));
        const period = periodMap.get(idOf(row.academicPeriodId));
        return {
          id: idOf(row),
          row,
          className: classRow ? rowName(classRow) : row.classId ? `Class #${row.classId}` : "Class not set",
          structureName: structure ? rowName(structure) : row.academicStructureId ? `Structure #${row.academicStructureId}` : "Structure not set",
          periodName: period ? rowName(period) : row.academicPeriodId ? `Period #${row.academicPeriodId}` : "Period not set",
          date: text(row.date, "Not set"),
          status: String(row.status || "present").toLowerCase() as AttendanceStatus,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendanceRows, classMap, periodMap, structureMap]);

  const availableClasses = useMemo(() => {
    const ids = new Set<number>();
    attendanceRows.forEach((row: any) => {
      const id = idOf(row.classId);
      if (id) ids.add(id);
    });
    enrollments.forEach((row: any) => {
      const id = idOf(row.classId);
      if (id) ids.add(id);
    });
    if ((student as any)?.currentClassId) ids.add(idOf((student as any).currentClassId));
    return classes.filter((row: any) => ids.has(idOf(row)));
  }, [attendanceRows, classes, enrollments, student]);

  const filteredRows = useMemo(() => {
    const q = query.toLowerCase().trim();
    const start = fromDate ? new Date(fromDate).getTime() : 0;
    const end = toDate ? new Date(toDate).getTime() : 0;

    return attendanceViews.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (classFilter !== "all" && !sameId((item.row as any).classId, classFilter)) return false;
      if (structureFilter !== "all" && !sameId((item.row as any).academicStructureId, structureFilter)) return false;
      if (periodFilter !== "all" && !sameId((item.row as any).academicPeriodId, periodFilter)) return false;

      const itemTime = new Date(item.date).getTime();
      if (fromDate && Number.isFinite(itemTime) && itemTime < start) return false;
      if (toDate && Number.isFinite(itemTime) && itemTime > end) return false;

      if (!q) return true;
      return [item.className, item.structureName, item.periodName, item.date, item.status].join(" ").toLowerCase().includes(q);
    });
  }, [attendanceViews, classFilter, fromDate, periodFilter, query, statusFilter, structureFilter, toDate]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const present = filteredRows.filter((row) => row.status === "present").length;
    const absent = filteredRows.filter((row) => row.status === "absent").length;
    const late = filteredRows.filter((row) => row.status === "late").length;
    const attendanceRate = total ? Math.round((present / total) * 100) : 0;
    const className = currentEnrollment?.classId
      ? rowName(classMap.get(idOf(currentEnrollment.classId)))
      : (student as any)?.currentClassId
        ? rowName(classMap.get(idOf((student as any).currentClassId)))
        : "No active class";

    return {
      total,
      allRecords: attendanceViews.length,
      present,
      absent,
      late,
      attendanceRate,
      className,
      studentName: student ? rowName(student as any) : "Student",
    };
  }, [attendanceViews.length, classMap, currentEnrollment, filteredRows, student]);

  const activeFilterCount = useMemo(
    () => [statusFilter !== "all", classFilter !== "all", structureFilter !== "all", periodFilter !== "all", fromDate, toDate].filter(Boolean).length,
    [classFilter, fromDate, periodFilter, statusFilter, structureFilter, toDate]
  );

  function clearFilters() {
    setStatusFilter("all");
    setClassFilter("all");
    setStructureFilter("all");
    setPeriodFilter("all");
    setFromDate("");
    setToDate("");
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening my attendance..." text="Loading your attendance records and academic context." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing your attendance." />;
  }

  if (!studentId) {
    return <State primary={primary} title="No student profile selected" text="Choose a student role from the role selector so your attendance can be loaded safely." />;
  }

  return (
    <main className="ma-page" style={{ "--ma-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ma-search-card" aria-label="My attendance search and actions">
        <span className={`status-dot-mini ${summary.attendanceRate >= 80 ? "green" : summary.total ? "orange" : "gray"}`} title={`${summary.attendanceRate}% attendance`} />

        <label className="ma-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search my attendance..." aria-label="Search my attendance" />
        </label>

        <button type="button" className={`ma-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ma-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {(query.trim() || activeFilterCount > 0) && (
        <section className="ma-filter-chips" aria-label="Active attendance filters">
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
          {statusFilter !== "all" && <button type="button" onClick={() => setStatusFilter("all")}>Status: {statusLabel(statusFilter)} ×</button>}
          {classFilter !== "all" && <button type="button" onClick={() => setClassFilter("all")}>Class filter ×</button>}
          {structureFilter !== "all" && <button type="button" onClick={() => setStructureFilter("all")}>Structure filter ×</button>}
          {periodFilter !== "all" && <button type="button" onClick={() => setPeriodFilter("all")}>Period filter ×</button>}
          {fromDate && <button type="button" onClick={() => setFromDate("")}>From: {fromDate} ×</button>}
          {toDate && <button type="button" onClick={() => setToDate("")}>To: {toDate} ×</button>}
        </section>
      )}

      {view === "summary" ? <AnalyticsView summary={summary} /> : null}
      {view === "table" ? <TableView rows={filteredRows} onOpen={setSelected} /> : null}

      {view === "cards" ? (
        <section className="ma-list">
          {filteredRows.map((item) => <AttendanceCard key={String(item.id || `${item.date}-${item.status}`)} item={item} onOpen={() => setSelected(item)} />)}
          {!filteredRows.length ? (
            <Empty
              title="No attendance records found"
              text={summary.allRecords ? "Clear search or filters to show your attendance records." : "Your attendance will appear after your teachers or branch admin mark the register."}
            />
          ) : null}
        </section>
      ) : null}

      {filterOpen ? (
        <FilterSheet
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          structureFilter={structureFilter}
          setStructureFilter={setStructureFilter}
          periodFilter={periodFilter}
          setPeriodFilter={setPeriodFilter}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
          classes={availableClasses}
          academicStructures={academicStructures}
          periods={periods}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(mode) => { setView(mode); setMoreOpen(false); }}
          summary={summary}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}

      {selected ? <AttendanceSheet item={selected} onClose={() => setSelected(null)} /> : null}
    </main>
  );
}

function State({ primary, title, text: body }: { primary: string; title: string; text: string }) {
  return (
    <main className="ma-page" style={{ "--ma-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ma-state"><div className="ma-spinner" /><h2>{title}</h2><p>{body}</p></section>
    </main>
  );
}

function AttendanceCard({ item, onOpen }: { item: AttendanceView; onOpen: () => void }) {
  return (
    <button type="button" className="attendance-row" onClick={onOpen}>
      <span className={`attendance-avatar ${statusTone(item.status)}`}>{item.status === "present" ? "P" : item.status === "absent" ? "A" : "L"}</span>
      <span className="attendance-main">
        <strong>{dateLabel(item.date)}</strong>
        <small>{item.className}</small>
        <em>{item.structureName} · {item.periodName}</em>
      </span>
      <span className="attendance-side">
        <Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip>
        <i>›</i>
      </span>
    </button>
  );
}

function TableView({ rows, onOpen }: { rows: AttendanceView[]; onOpen: (row: AttendanceView) => void }) {
  return (
    <section className="ma-table-card">
      <div className="ma-table-scroll">
        <table>
          <thead><tr><th>Attendance ({rows.length})</th><th>Class</th><th>Structure</th><th>Period</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={String(item.id || `${item.date}-${item.status}`)}>
                <td><strong>{dateLabel(item.date)}</strong><span>{item.date}</span></td>
                <td>{item.className}</td>
                <td>{item.structureName}</td>
                <td>{item.periodName}</td>
                <td><Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip></td>
                <td><div className="ma-table-actions"><button type="button" onClick={() => onOpen(item)}>View</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <div className="ma-empty-table">No attendance record matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary }: { summary: AnyRow }) {
  const rows = [
    { label: "Present", value: summary.present, tone: "green" },
    { label: "Absent", value: summary.absent, tone: "red" },
    { label: "Late", value: summary.late, tone: "orange" },
  ];

  return (
    <section className="ma-analysis-grid">
      <article className="ma-analysis"><span>Attendance Rate</span><strong>{summary.attendanceRate}%</strong><p>{summary.present} present out of {summary.total} shown record(s).</p></article>
      <article className="ma-analysis"><span>Total Records</span><strong>{summary.total}</strong><p>{summary.allRecords} total attendance record(s) available.</p></article>
      <article className="ma-analysis"><span>Current Class</span><strong>{summary.className}</strong><p>Based on your current or latest enrollment.</p></article>
      <article className="ma-analysis wide"><span>Breakdown</span><strong>{summary.total}</strong><div className="ma-analysis-list">{rows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="ma-progress"><i style={{ width: `${Math.max(5, Math.round((row.value / Math.max(1, summary.total)) * 100))}%` }} /></div></section>)}</div></article>
    </section>
  );
}

function FilterSheet({
  statusFilter,
  setStatusFilter,
  classFilter,
  setClassFilter,
  structureFilter,
  setStructureFilter,
  periodFilter,
  setPeriodFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  classes,
  academicStructures,
  periods,
  clearFilters,
  onClose,
}: {
  statusFilter: AttendanceFilter;
  setStatusFilter: (value: AttendanceFilter) => void;
  classFilter: string;
  setClassFilter: (value: string) => void;
  structureFilter: string;
  setStructureFilter: (value: string) => void;
  periodFilter: string;
  setPeriodFilter: (value: string) => void;
  fromDate: string;
  setFromDate: (value: string) => void;
  toDate: string;
  setToDate: (value: string) => void;
  classes: Class[];
  academicStructures: AcademicStructure[];
  periods: AcademicPeriod[];
  clearFilters: () => void;
  onClose: () => void;
}) {
  const filteredPeriods = structureFilter === "all" ? periods : periods.filter((row: any) => sameId(row.academicStructureId, structureFilter));

  return (
    <div className="ma-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ma-sheet">
        <div className="ma-sheet-head"><div><h2>Filters</h2><p>Show a smaller set of your attendance records.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ma-form compact">
          <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AttendanceFilter)}><option value="all">All statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option></select></label>
          <label><span>Class</span><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">All classes</option>{classes.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
          <label><span>Academic Structure</span><select value={structureFilter} onChange={(event) => { setStructureFilter(event.target.value); setPeriodFilter("all"); }}><option value="all">All structures</option>{academicStructures.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
          <label><span>Academic Period</span><select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option value="all">All periods</option>{filteredPeriods.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
          <label><span>From Date</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label><span>To Date</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        </div>
        <div className="ma-sheet-actions"><button type="button" onClick={clearFilters}>Reset</button><button type="button" className="primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ma-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ma-sheet small">
        <div className="ma-sheet-head"><div><h2>More</h2><p>Views and refresh are kept here so the page stays compact.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ma-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>Cards</b><small>{summary.total} shown attendance record(s)</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table</b><small>Dense date and status history</small></button>
          <button type="button" className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}><span>◔</span><b>Analytics</b><small>{summary.attendanceRate}% attendance rate</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local attendance records</small></button>
        </div>
      </section>
    </div>
  );
}

function AttendanceSheet({ item, onClose }: { item: AttendanceView; onClose: () => void }) {
  return (
    <div className="ma-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ma-sheet small">
        <div className="ma-sheet-head"><div><h2>{dateLabel(item.date)}</h2><p>{item.className}</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ma-detail-grid">
          <article><span>Status</span><b><Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip></b></article>
          <article><span>Date</span><b>{item.date}</b></article>
          <article><span>Class</span><b>{item.className}</b></article>
          <article><span>Structure</span><b>{item.structureName}</b></article>
          <article><span>Period</span><b>{item.periodName}</b></article>
          <article><span>Record</span><b>#{item.id || "local"}</b></article>
        </div>
        <div className="ma-description"><h3>Note</h3><p>This is a read-only attendance record. Only teachers or branch administrators can change attendance.</p></div>
        <div className="ma-sheet-actions"><button type="button" className="primary" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}
.ma-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ma-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ma-page *,.ma-page *::before,.ma-page *::after{box-sizing:border-box;min-width:0}.ma-page button,.ma-page input,.ma-page select{font:inherit;max-width:100%}.ma-page button{-webkit-tap-highlight-color:transparent}.ma-page input,.ma-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ma-page input:focus,.ma-page select:focus{border-color:color-mix(in srgb,var(--ma-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ma-primary) 12%,transparent)}.ma-state,.ma-search-card,.attendance-row,.ma-table-card,.ma-analysis,.ma-empty,.ma-sheet{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ma-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ma-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ma-primary) 18%,transparent);border-top-color:var(--ma-primary);animation:spin .8s linear infinite}.ma-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ma-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ma-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ma-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ma-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ma-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ma-icon-button,.ma-filter-button{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ma-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ma-filter-button{position:relative;background:color-mix(in srgb,var(--ma-primary) 8%,var(--card-bg,#fff));color:var(--ma-primary)}.ma-filter-button.active{background:var(--ma-primary);color:#fff;border-color:var(--ma-primary)}.ma-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.ma-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ma-filter-chips::-webkit-scrollbar{display:none}.ma-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ma-primary) 11%,transparent);color:var(--ma-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ma-list{display:grid;gap:8px;margin-top:10px}.attendance-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.attendance-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;font-size:16px;font-weight:1000;color:#fff}.attendance-avatar.green{background:#16a34a}.attendance-avatar.red{background:#dc2626}.attendance-avatar.orange{background:#b45309}.attendance-avatar.gray{background:#64748b}.attendance-main,.attendance-main strong,.attendance-main small,.attendance-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attendance-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.attendance-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.attendance-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.attendance-side{display:flex;align-items:center;gap:7px}.attendance-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.ma-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ma-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ma-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ma-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ma-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ma-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ma-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ma-table-card,.ma-analysis,.ma-empty{padding:13px;border-radius:24px}.ma-table-card,.ma-analysis-grid{margin-top:10px}.ma-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ma-table-scroll table{width:100%;min-width:820px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.ma-table-scroll th,.ma-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.ma-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--ma-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ma-table-scroll td strong,.ma-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ma-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ma-table-actions{display:flex;gap:7px;overflow-x:auto}.ma-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--ma-primary);border-radius:999px;padding:0 12px;background:var(--ma-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.ma-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ma-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ma-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ma-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ma-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ma-analysis-list{display:grid;gap:10px;margin-top:12px}.ma-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ma-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ma-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ma-progress i{display:block;height:100%;border-radius:inherit;background:var(--ma-primary)}.ma-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.ma-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ma-primary) 12%,var(--surface,#fff));font-size:28px}.ma-empty h3{margin:0;font-size:18px;font-weight:1000}.ma-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ma-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ma-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.ma-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.ma-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ma-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ma-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ma-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.ma-form{display:grid;gap:10px}.ma-form label{display:grid;gap:6px}.ma-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ma-menu-list{display:grid;gap:8px}.ma-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ma-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ma-primary) 10%,transparent);color:var(--ma-primary);font-weight:1000}.ma-menu-list button b,.ma-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ma-menu-list button b{font-size:13px;font-weight:1000}.ma-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ma-menu-list button.active{border-color:color-mix(in srgb,var(--ma-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ma-primary) 8%,var(--surface,#fff))}.ma-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ma-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ma-sheet-actions button.primary{border-color:var(--ma-primary);background:var(--ma-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ma-primary) 25%,transparent)}.ma-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ma-detail-grid article{padding:12px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ma-detail-grid span,.ma-detail-grid b{display:block}.ma-detail-grid span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ma-detail-grid b{margin-top:5px;font-size:14px;font-weight:1000}.ma-description{margin-top:10px;padding:12px;border-radius:18px;background:color-mix(in srgb,var(--ma-primary) 7%,transparent)}.ma-description h3{margin:0 0 6px;font-size:14px;font-weight:1000}.ma-description p{margin:0;color:var(--muted,#64748b);font-size:12px;line-height:1.6}@media (min-width:680px){.ma-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ma-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px}.ma-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.attendance-row{border-radius:24px;padding:12px}.ma-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ma-analysis.wide{grid-column:span 2}.ma-form.compact{grid-template-columns:repeat(2,minmax(0,1fr))}.ma-sheet-backdrop{place-items:center;padding:18px}.ma-sheet{border-radius:28px;padding:18px}}@media (min-width:1040px){.ma-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ma-search-card,.ma-list,.ma-analysis-grid,.ma-table-card,.ma-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.ma-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ma-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ma-analysis.wide{grid-column:span 2}}@media (max-width:520px){.ma-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ma-icon-button,.ma-filter-button{width:40px;height:40px}.attendance-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.attendance-side{grid-column:1/-1;justify-content:flex-end}.ma-sheet{border-radius:24px 24px 18px 18px;padding:12px}.ma-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ma-sheet-actions button{width:100%}}
`;
