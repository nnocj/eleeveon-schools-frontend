"use client";

/**
 * app/student/modules/Mysubjects.tsx
 * ---------------------------------------------------------
 * ELEEVEON STUDENT MY SUBJECTS V1
 * ---------------------------------------------------------
 * Student-scoped, offline-first, mobile-first, theme-safe.
 *
 * Purpose:
 * - Show only subjects assigned to the logged-in student's current/active class.
 * - Use the selected student membership from ActiveMembershipContext.
 * - Keep this as a learner view: no create, edit, delete, or admin controls.
 *
 * Data sources:
 * - students
 * - studentEnrollments
 * - classes
 * - classSubjects
 * - subjects
 * - teachers
 * - assignments
 * - assessmentEntries
 * - computedResults
 * - attendance
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db } from "../../lib/db";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type FilterMode = "all" | "core" | "elective" | "withTeacher" | "withScores";

type SubjectView = {
  id: number;
  subjectId: number;
  classSubjectId: number;
  row: AnyRow;
  classSubject?: AnyRow;
  teacher?: AnyRow;
  teacherName: string;
  className: string;
  category: string;
  credits: number | string;
  assignments: number;
  scores: AnyRow[];
  latestScore?: AnyRow;
  computed?: AnyRow;
  average: number | null;
  grade: string;
  active: boolean;
};

const HIDDEN_DASHBOARD_KEYS = new Set(["studentDashboard"]);

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idOf(value: any) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value?.id ?? value?.localId ?? value?.payload?.id ?? value);
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

function sameScope(row: AnyRow, accountId?: string | null, schoolId?: number | null, branchId?: number | null) {
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
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", year: "numeric" }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

function categoryLabel(value?: string) {
  const raw = String(value || "academic").trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).replaceAll("_", " ") : "Academic";
}

function categoryTone(value?: string): Tone {
  const raw = String(value || "").toLowerCase();
  if (raw === "core") return "green";
  if (raw === "elective") return "orange";
  if (raw === "technical") return "purple";
  if (raw === "vocational") return "blue";
  return "gray";
}

function scorePercent(row?: AnyRow) {
  if (!row) return null;
  const score = n(row.score ?? row.total ?? row.average ?? row.percentage);
  const max = n(row.maxScore || row.totalScore || 100) || 100;
  if (!score) return 0;
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)));
}

function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : Promise.resolve([]);
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ms-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="ms-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="ms-empty">
      <div>📘</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

export default function Mysubjects() {
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
  const [filter, setFilter] = useState<FilterMode>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState<SubjectView | null>(null);

  const [student, setStudent] = useState<AnyRow | null>(null);
  const [enrollments, setEnrollments] = useState<AnyRow[]>([]);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [subjects, setSubjects] = useState<AnyRow[]>([]);
  const [classSubjects, setClassSubjects] = useState<AnyRow[]>([]);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [assignments, setAssignments] = useState<AnyRow[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AnyRow[]>([]);
  const [computedResults, setComputedResults] = useState<AnyRow[]>([]);
  const [attendance, setAttendance] = useState<AnyRow[]>([]);

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
      const [studentRows, enrollmentRows, classRows, subjectRows, classSubjectRows, teacherRows, assignmentRows, entryRows, resultRows, attendanceRows] = await Promise.all([
        safeArray("students"),
        safeArray("studentEnrollments"),
        safeArray("classes"),
        safeArray("subjects"),
        safeArray("classSubjects"),
        safeArray("teachers"),
        safeArray("assignments"),
        safeArray("assessmentEntries"),
        safeArray("computedResults"),
        safeArray("attendance"),
      ]);

      const scoped = (rows: AnyRow[]) => rows.filter((row) => sameScope(row, accountId, schoolId || undefined, branchId || undefined));
      const activeStudent = scoped(studentRows as AnyRow[]).find((row) => sameId(row.id, studentId)) || null;
      const scopedEnrollments = scoped(enrollmentRows as AnyRow[]).filter((row) => sameId(row.studentId, studentId));

      setStudent(activeStudent);
      setEnrollments(scopedEnrollments);
      setClasses(scoped(classRows as AnyRow[]));
      setSubjects(scoped(subjectRows as AnyRow[]));
      setClassSubjects(scoped(classSubjectRows as AnyRow[]));
      setTeachers(scoped(teacherRows as AnyRow[]));
      setAssignments(scoped(assignmentRows as AnyRow[]));
      setAssessmentEntries(scoped(entryRows as AnyRow[]).filter((row) => sameId(row.studentId, studentId)));
      setComputedResults(scoped(resultRows as AnyRow[]).filter((row) => sameId(row.studentId, studentId)));
      setAttendance(scoped(attendanceRows as AnyRow[]).filter((row) => sameId(row.studentId, studentId)));
    } catch (error) {
      console.error("Failed to load my subjects:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, studentId, schoolId, branchId, accountLoading, settingsLoading]);

  const classMap = useMemo(() => new Map(classes.map((row) => [idOf(row), row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((row) => [idOf(row), row])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((row) => [idOf(row), row])), [teachers]);

  const activeEnrollment = useMemo(() => {
    return (
      enrollments.find((row) => String(row.status || "active").toLowerCase() === "active" && activeRow(row)) ||
      [...enrollments].sort((a, b) => n(b.updatedAt || b.createdAt) - n(a.updatedAt || a.createdAt))[0] ||
      null
    );
  }, [enrollments]);

  const activeClassIds = useMemo(() => {
    const ids = new Set<number>();
    if (student?.currentClassId) ids.add(idOf(student.currentClassId));
    enrollments.filter(activeRow).forEach((row) => {
      const id = idOf(row.classId);
      if (id) ids.add(id);
    });
    if (!ids.size && activeEnrollment?.classId) ids.add(idOf(activeEnrollment.classId));
    return ids;
  }, [activeEnrollment, enrollments, student]);

  const subjectRows = useMemo<SubjectView[]>(() => {
    const assignedClassSubjects = classSubjects
      .filter(activeRow)
      .filter((row) => activeClassIds.has(idOf(row.classId)));

    const unique = new Map<number, SubjectView>();

    assignedClassSubjects.forEach((classSubject) => {
      const subjectId = idOf(classSubject.subjectId);
      if (!subjectId) return;
      const subject = subjectMap.get(subjectId);
      if (!subject || !activeRow(subject)) return;

      const teacher = classSubject.teacherId ? teacherMap.get(idOf(classSubject.teacherId)) : undefined;
      const classRow = classMap.get(idOf(classSubject.classId));
      const subjectScores = assessmentEntries.filter((entry) => sameId(entry.subjectId, subjectId));
      const computed = computedResults
        .filter((row) => sameId(row.subjectId, subjectId))
        .sort((a, b) => n(b.updatedAt || b.createdAt) - n(a.updatedAt || a.createdAt))[0];
      const latestScore = [...subjectScores].sort((a, b) => n(b.updatedAt || b.createdAt) - n(a.updatedAt || a.createdAt))[0];
      const average = computed ? n(computed.average ?? computed.percentage ?? computed.total) : subjectScores.length ? Math.round(subjectScores.reduce((sum, row) => sum + (scorePercent(row) || 0), 0) / subjectScores.length) : null;
      const subjectAssignments = assignments.filter((row) => sameId(row.subjectId, subjectId) && activeClassIds.has(idOf(row.classId)));

      const viewRow: SubjectView = {
        id: subjectId,
        subjectId,
        classSubjectId: idOf(classSubject),
        row: subject,
        classSubject,
        teacher,
        teacherName: teacher ? rowName(teacher) : "No teacher assigned",
        className: classRow ? rowName(classRow) : "Current class",
        category: text(classSubject.type || subject.category, "academic"),
        credits: classSubject.credits ?? subject.credits ?? "—",
        assignments: subjectAssignments.length,
        scores: subjectScores,
        latestScore,
        computed,
        average,
        grade: text(computed?.grade || latestScore?.grade, "—"),
        active: activeRow(classSubject) && activeRow(subject),
      };

      if (!unique.has(subjectId)) unique.set(subjectId, viewRow);
    });

    return [...unique.values()].sort((a, b) => rowName(a.row).localeCompare(rowName(b.row)));
  }, [activeClassIds, assessmentEntries, assignments, classMap, classSubjects, computedResults, subjectMap, teacherMap]);

  const filteredRows = useMemo(() => {
    const q = query.toLowerCase().trim();
    return subjectRows.filter((item) => {
      if (filter === "core" && String(item.category).toLowerCase() !== "core") return false;
      if (filter === "elective" && String(item.category).toLowerCase() !== "elective") return false;
      if (filter === "withTeacher" && !item.teacher) return false;
      if (filter === "withScores" && !item.scores.length && !item.computed) return false;
      if (!q) return true;
      return [rowName(item.row), item.teacherName, item.className, item.category, item.grade, item.credits].join(" ").toLowerCase().includes(q);
    });
  }, [filter, query, subjectRows]);

  const summary = useMemo(() => {
    const attendanceTotal = attendance.length;
    const present = attendance.filter((row) => String(row.status || "").toLowerCase() === "present").length;
    const attendancePercent = attendanceTotal ? Math.round((present / attendanceTotal) * 100) : 0;
    const averages = subjectRows.map((row) => row.average).filter((value): value is number => typeof value === "number");
    const overallAverage = averages.length ? Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length) : 0;

    return {
      subjects: subjectRows.length,
      shown: filteredRows.length,
      withTeacher: subjectRows.filter((row) => row.teacher).length,
      assignments: subjectRows.reduce((sum, row) => sum + row.assignments, 0),
      scored: subjectRows.filter((row) => row.scores.length || row.computed).length,
      attendancePercent,
      attendanceTotal,
      overallAverage,
      className: activeEnrollment?.classId ? rowName(classMap.get(idOf(activeEnrollment.classId))) : student?.currentClassId ? rowName(classMap.get(idOf(student.currentClassId))) : "No active class",
    };
  }, [activeEnrollment, attendance, classMap, filteredRows.length, student, subjectRows]);

  const activeFilterCount = filter !== "all" ? 1 : 0;

  function openRoute(key: string) {
    try {
      window.dispatchEvent(new CustomEvent("role-portal:navigate", { detail: { key } }));
      window.dispatchEvent(new CustomEvent("portal:navigate", { detail: key }));
    } catch {
      // Optional shell event fallback.
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening my subjects..." text="Loading your enrollment, class subjects, teachers and recent scores." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing your subjects." />;
  }

  if (!studentId) {
    return <State primary={primary} title="No student profile selected" text="Choose a student role from the role selector so your subjects can be loaded safely." />;
  }

  return (
    <main className="ms-page" style={{ "--ms-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ms-search-card" aria-label="My subjects search and actions">
        <span className={`status-dot-mini ${summary.subjects ? "green" : "gray"}`} title={`${summary.subjects} assigned subject(s)`} />

        <label className="ms-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search my subjects..." aria-label="Search my subjects" />
        </label>

        <button type="button" className={`ms-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ms-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {(query.trim() || filter !== "all") && (
        <section className="ms-filter-chips" aria-label="Active filters">
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
          {filter !== "all" && <button type="button" onClick={() => setFilter("all")}>Filter: {filter.replaceAll("with", "with ")} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} /> : null}
      {view === "table" ? <TableView rows={filteredRows} onOpen={setSelected} /> : null}

      {view === "cards" ? (
        <section className="ms-list">
          {filteredRows.map((item) => <SubjectCard key={String(item.subjectId)} item={item} onOpen={() => setSelected(item)} />)}
          {!filteredRows.length ? (
            <Empty title="No subjects found" text={summary.subjects ? "Clear search or filters to show your assigned subjects." : "Your assigned subjects will appear after your class subjects are set by the branch."} />
          ) : null}
        </section>
      ) : null}

      {filterOpen ? <FilterSheet filter={filter} setFilter={setFilter} onClose={() => setFilterOpen(false)} /> : null}
      {moreOpen ? <MoreSheet view={view} setView={(mode) => { setView(mode); setMoreOpen(false); }} summary={summary} onRefresh={async () => { setMoreOpen(false); await load(); }} onClose={() => setMoreOpen(false)} /> : null}
      {selected ? <SubjectSheet item={selected} onClose={() => setSelected(null)} openRoute={openRoute} /> : null}
    </main>
  );
}

function State({ primary, title, text: body }: { primary: string; title: string; text: string }) {
  return (
    <main className="ms-page" style={{ "--ms-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ms-state"><div className="ms-spinner" /><h2>{title}</h2><p>{body}</p></section>
    </main>
  );
}

function SubjectCard({ item, onOpen }: { item: SubjectView; onOpen: () => void }) {
  return (
    <button type="button" className="subject-row" onClick={onOpen}>
      <span className="subject-avatar">📘</span>
      <span className="subject-main">
        <strong>{rowName(item.row)}</strong>
        <small>{item.teacherName} · {item.className}</small>
        <em>{categoryLabel(item.category)} · {item.assignments} assignment(s) · Avg {item.average ?? "—"}</em>
      </span>
      <span className="subject-side">
        <Chip tone={categoryTone(item.category)}>{item.grade !== "—" ? item.grade : item.credits}</Chip>
        <i>›</i>
      </span>
    </button>
  );
}

function TableView({ rows, onOpen }: { rows: SubjectView[]; onOpen: (row: SubjectView) => void }) {
  return (
    <section className="ms-table-card">
      <div className="ms-table-scroll">
        <table>
          <thead><tr><th>Subjects ({rows.length})</th><th>Teacher</th><th>Class</th><th>Category</th><th>Credits</th><th>Assignments</th><th>Average</th><th>Grade</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={String(item.subjectId)}>
                <td><strong>{rowName(item.row)}</strong><span>{item.row.code || item.row.description || "Assigned subject"}</span></td>
                <td>{item.teacherName}</td>
                <td>{item.className}</td>
                <td><Chip tone={categoryTone(item.category)}>{categoryLabel(item.category)}</Chip></td>
                <td>{item.credits}</td>
                <td>{item.assignments}</td>
                <td>{item.average ?? "—"}</td>
                <td>{item.grade}</td>
                <td><div className="ms-table-actions"><button type="button" onClick={() => onOpen(item)}>View</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <div className="ms-empty-table">No assigned subject matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary }: { summary: AnyRow }) {
  const rows = [
    { label: "With Teacher", value: summary.withTeacher },
    { label: "With Scores", value: summary.scored },
  ];

  return (
    <section className="ms-analysis-grid">
      <article className="ms-analysis"><span>Subjects</span><strong>{summary.subjects}</strong><p>{summary.shown} shown for {summary.className}.</p></article>
      <article className="ms-analysis"><span>Attendance</span><strong>{summary.attendancePercent}%</strong><p>{summary.attendanceTotal} attendance record(s) found.</p></article>
      <article className="ms-analysis"><span>Assignments</span><strong>{summary.assignments}</strong><p>Assigned work connected to your class subjects.</p></article>
      <article className="ms-analysis"><span>Average</span><strong>{summary.overallAverage || "—"}</strong><p>Based on available scores/results.</p></article>
      <article className="ms-analysis wide"><span>Subject Readiness</span><strong>{summary.subjects}</strong><div className="ms-analysis-list">{rows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="ms-progress"><i style={{ width: `${Math.max(5, Math.round((row.value / Math.max(1, summary.subjects)) * 100))}%` }} /></div></section>)}</div></article>
    </section>
  );
}

function FilterSheet({ filter, setFilter, onClose }: { filter: FilterMode; setFilter: (value: FilterMode) => void; onClose: () => void }) {
  return (
    <div className="ms-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ms-sheet small">
        <div className="ms-sheet-head"><div><h2>Filters</h2><p>Show a smaller set of your assigned subjects.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ms-form compact">
          <label><span>Subject Filter</span><select value={filter} onChange={(event) => setFilter(event.target.value as FilterMode)}><option value="all">All subjects</option><option value="core">Core subjects</option><option value="elective">Elective subjects</option><option value="withTeacher">With teacher</option><option value="withScores">With scores/results</option></select></label>
        </div>
        <div className="ms-sheet-actions"><button type="button" onClick={() => setFilter("all")}>Reset</button><button type="button" className="primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ms-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ms-sheet small">
        <div className="ms-sheet-head"><div><h2>More</h2><p>Views and refresh are kept here so the page stays compact.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ms-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>Cards</b><small>{summary.subjects} assigned subject(s)</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table</b><small>Subject, teacher, scores and class</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.attendancePercent}% attendance · {summary.assignments} assignments</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local student subject data</small></button>
        </div>
      </section>
    </div>
  );
}

function SubjectSheet({ item, onClose, openRoute }: { item: SubjectView; onClose: () => void; openRoute: (key: string) => void }) {
  const latestPercent = scorePercent(item.latestScore);
  return (
    <div className="ms-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ms-sheet">
        <div className="ms-sheet-head"><div><h2>{rowName(item.row)}</h2><p>{item.teacherName} · {item.className}</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ms-detail-grid">
          <article><span>Category</span><b>{categoryLabel(item.category)}</b></article>
          <article><span>Credits</span><b>{item.credits}</b></article>
          <article><span>Assignments</span><b>{item.assignments}</b></article>
          <article><span>Average</span><b>{item.average ?? "—"}</b></article>
          <article><span>Grade</span><b>{item.grade}</b></article>
          <article><span>Latest Score</span><b>{latestPercent == null ? "—" : `${latestPercent}%`}</b></article>
        </div>
        <div className="ms-description">
          <h3>About this subject</h3>
          <p>{item.row.description || "No subject description has been added yet."}</p>
        </div>
        <div className="ms-sheet-actions">
          <button type="button" onClick={() => openRoute("myAssignments")}>Assignments</button>
          <button type="button" onClick={() => openRoute("myResults")}>Results</button>
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.ms-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ms-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ms-page *,.ms-page *::before,.ms-page *::after{box-sizing:border-box;min-width:0}.ms-page button,.ms-page input,.ms-page select{font:inherit;max-width:100%}.ms-page button{-webkit-tap-highlight-color:transparent}.ms-page input,.ms-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ms-page input:focus,.ms-page select:focus{border-color:color-mix(in srgb,var(--ms-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ms-primary) 12%,transparent)}.ms-state,.ms-search-card,.subject-row,.ms-table-card,.ms-analysis,.ms-empty,.ms-sheet{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ms-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ms-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ms-primary) 18%,transparent);border-top-color:var(--ms-primary);animation:spin .8s linear infinite}.ms-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ms-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ms-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ms-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ms-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ms-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ms-icon-button,.ms-filter-button{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ms-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ms-filter-button{position:relative;background:color-mix(in srgb,var(--ms-primary) 8%,var(--card-bg,#fff));color:var(--ms-primary)}.ms-filter-button.active{background:var(--ms-primary);color:#fff;border-color:var(--ms-primary)}.ms-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.gray{background:var(--muted,#64748b)}.ms-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ms-filter-chips::-webkit-scrollbar{display:none}.ms-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ms-primary) 11%,transparent);color:var(--ms-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ms-list{display:grid;gap:8px;margin-top:10px}.subject-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.subject-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--ms-primary) 12%,var(--surface,#fff));font-size:22px}.subject-main,.subject-main strong,.subject-main small,.subject-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.subject-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.subject-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.subject-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.subject-side{display:flex;align-items:center;gap:7px}.subject-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.ms-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ms-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ms-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ms-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ms-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ms-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ms-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ms-table-card,.ms-analysis,.ms-empty{padding:13px;border-radius:24px}.ms-table-card,.ms-analysis-grid{margin-top:10px}.ms-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ms-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.ms-table-scroll th,.ms-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.ms-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--ms-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ms-table-scroll td strong,.ms-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ms-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ms-table-actions{display:flex;gap:7px;overflow-x:auto}.ms-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--ms-primary);border-radius:999px;padding:0 12px;background:var(--ms-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.ms-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ms-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ms-analysis span,.ms-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ms-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ms-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ms-analysis-list{display:grid;gap:10px;margin-top:12px}.ms-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ms-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ms-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ms-progress i{display:block;height:100%;border-radius:inherit;background:var(--ms-primary)}.ms-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.ms-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ms-primary) 12%,var(--surface,#fff));font-size:28px}.ms-empty h3{margin:0;font-size:18px;font-weight:1000}.ms-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ms-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ms-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.ms-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.ms-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ms-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ms-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ms-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.ms-form{display:grid;gap:10px}.ms-form label{display:grid;gap:6px}.ms-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ms-menu-list{display:grid;gap:8px}.ms-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ms-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ms-primary) 10%,transparent);color:var(--ms-primary);font-weight:1000}.ms-menu-list button b,.ms-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ms-menu-list button b{font-size:13px;font-weight:1000}.ms-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ms-menu-list button.active{border-color:color-mix(in srgb,var(--ms-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ms-primary) 8%,var(--surface,#fff))}.ms-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ms-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ms-sheet-actions button.primary{border-color:var(--ms-primary);background:var(--ms-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ms-primary) 25%,transparent)}.ms-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ms-detail-grid article{padding:12px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ms-detail-grid span,.ms-detail-grid b{display:block}.ms-detail-grid span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ms-detail-grid b{margin-top:5px;font-size:16px;font-weight:1000}.ms-description{margin-top:10px;padding:12px;border-radius:18px;background:color-mix(in srgb,var(--ms-primary) 7%,transparent)}.ms-description h3{margin:0 0 6px;font-size:14px;font-weight:1000}.ms-description p{margin:0;color:var(--muted,#64748b);font-size:12px;line-height:1.6}@media (min-width:680px){.ms-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ms-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px}.ms-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.subject-row{border-radius:24px;padding:12px}.ms-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ms-analysis.wide{grid-column:span 2}.ms-sheet-backdrop{place-items:center;padding:18px}.ms-sheet{border-radius:28px;padding:18px}}@media (min-width:1040px){.ms-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ms-search-card,.ms-list,.ms-analysis-grid,.ms-table-card,.ms-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.ms-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ms-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ms-analysis.wide{grid-column:span 2}}@media (max-width:520px){.ms-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ms-icon-button,.ms-filter-button{width:40px;height:40px}.subject-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.subject-side{grid-column:1/-1;justify-content:flex-end}.ms-sheet{border-radius:24px 24px 18px 18px;padding:12px}.ms-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ms-sheet-actions button{width:100%}}
`;
