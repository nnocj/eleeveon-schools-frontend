"use client";

/**
 * app/teacher/modules/Teacherclasses.tsx
 * ---------------------------------------------------------
 * TEACHER MY CLASSES
 * ---------------------------------------------------------
 * Teacher-only class workspace.
 *
 * This file does NOT use DexieCrudPage because teachers should not edit
 * official class records and should not manually work with raw IDs.
 *
 * What it does:
 * - Detects the signed-in teacher.
 * - Shows only classes/subjects assigned to that teacher through classSubjects.
 * - Loads active learners from studentEnrollments.
 * - Shows class capacity, enrollment count, subjects taught, periods and context.
 * - Provides mobile-first card/table/summary views.
 * - Lets the teacher jump to related teacher pages through navigate().
 */

import React, { useEffect, useMemo, useState } from "react";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Class,
  ClassSubject,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  Student,
  StudentEnrollment,
  Subject,
  Teacher,
} from "../../lib/db/db";

// ======================================================
// TYPES
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

type ViewMode = "cards" | "table" | "summary";

type TenantRow = {
  accountId?: string;
  schoolId?: number | string;
  branchId?: number | string;
  isDeleted?: boolean;
};

type TeacherClassRow = {
  classId: number;
  classRow?: Class;
  className: string;
  classCode?: string;
  level?: string;
  capacity?: number;
  active: boolean;
  subjects: TeacherSubjectMini[];
  studentCount: number;
  students: Student[];
  periods: string[];
  academicStructures: string[];
};

type TeacherSubjectMini = {
  classSubjectId: number;
  subjectId: number;
  subjectName: string;
  subjectCode?: string;
  academicPeriodName: string;
  academicStructureName: string;
  curriculumName: string;
  pathwayName: string;
};

type ToastTone = "success" | "error" | "info";

// ======================================================
// HELPERS
// ======================================================

const idOf = (value: any) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");

const safeLower = (value: any) => String(value || "").toLowerCase().trim();

const fullNameOf = (row: any) =>
  row?.fullName ||
  row?.name ||
  [row?.firstName, row?.middleName, row?.lastName].filter(Boolean).join(" ") ||
  "Unnamed";

const getActiveStatus = (row: any) => {
  const status = safeLower(row?.status);
  if (!status) return true;
  return !["inactive", "withdrawn", "deleted", "archived", "suspended"].includes(status);
};

const isActiveRow = (row: any) => row?.active !== false && !row?.isDeleted && getActiveStatus(row);

const unique = (values: string[]) =>
  Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const capacityTone = (studentCount: number, capacity?: number) => {
  if (!capacity || capacity <= 0) return "gray";
  const percent = (studentCount / capacity) * 100;
  if (percent >= 100) return "red";
  if (percent >= 80) return "orange";
  return "green";
};

// ======================================================
// COMPONENT
// ======================================================

export default function Teacherclasses({ navigate }: Props) {
  const accountContext = useAccount() as any;
  const { accountId, authenticated, loading: accountLoading, user } = accountContext;

  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const schoolId = idOf(activeSchoolId || activeSchool?.id || settings?.schoolId);
  const branchId = idOf(activeBranchId || activeBranch?.id || settings?.branchId);
  const accountEmail = safeLower(accountContext?.email || user?.email);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");

  const [teacherId, setTeacherId] = useState(0);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);

  // ======================================================
  // HELPERS USING COMPONENT CONTEXT
  // ======================================================

  const sameTenant = (row: TenantRow) => {
    const rowAccountOk = !row.accountId || row.accountId === accountId;
    const rowSchoolOk = !row.schoolId || sameId(row.schoolId, schoolId);
    const rowBranchOk = !row.branchId || sameId(row.branchId, branchId);

    return Boolean(rowAccountOk && rowSchoolOk && rowBranchOk && !row.isDeleted);
  };

  const matchSignedInTeacher = (teacher: Teacher) => {
    const anyTeacher = teacher as any;

    const currentUserId =
      user?.id ||
      user?.localId ||
      user?.userId ||
      user?.teacherId ||
      user?.teacherLocalId ||
      accountContext?.userId ||
      accountContext?.localId;

    const currentTeacherId =
      user?.teacherId ||
      user?.teacherLocalId ||
      accountContext?.teacherId ||
      accountContext?.teacherLocalId;

    if (currentTeacherId && sameId(anyTeacher.id, currentTeacherId)) return true;

    if (currentUserId && sameId(anyTeacher.userId, currentUserId)) return true;
    if (currentUserId && sameId(anyTeacher.accountUserId, currentUserId)) return true;
    if (currentUserId && sameId(anyTeacher.userLocalId, currentUserId)) return true;
    if (currentUserId && sameId(anyTeacher.localUserId, currentUserId)) return true;

    if (accountEmail && safeLower(anyTeacher.email) === accountEmail) return true;
    if (accountEmail && safeLower(anyTeacher.workEmail) === accountEmail) return true;

    return false;
  };

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  const clearData = () => {
    setTeacherId(0);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setClassSubjects([]);
    setStudents([]);
    setEnrollments([]);
    setAcademicStructures([]);
    setPeriods([]);
    setCurriculumSubjects([]);
    setCurriculums([]);
    setPathways([]);
  };

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        teacherRows,
        classRows,
        subjectRows,
        classSubjectRows,
        studentRows,
        enrollmentRows,
        academicStructureRows,
        periodRows,
        curriculumSubjectRows,
        curriculumRows,
        pathwayRows,
      ] = await Promise.all([
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.classSubjects.toArray(),
        db.students.toArray(),
        db.studentEnrollments.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.curriculumSubjects.toArray(),
        db.curriculums.toArray(),
        db.curriculumPathways.toArray(),
      ]);

      const tenantTeachers = teacherRows.filter((row) => sameTenant(row as TenantRow));
      const signedTeacher =
        tenantTeachers.find(matchSignedInTeacher) ||
        tenantTeachers.find((row: any) => sameId(row.id, user?.teacherId || user?.teacherLocalId)) ||
        undefined;

      const signedTeacherId = idOf((signedTeacher as any)?.id);
      setTeacherId(signedTeacherId);

      const teacherClassSubjects = classSubjectRows
        .filter((row) => sameTenant(row as TenantRow))
        .filter(isActiveRow)
        .filter((row: any) => {
          if (!signedTeacherId) return false;
          return (
            sameId(row.teacherId, signedTeacherId) ||
            sameId(row.primaryTeacherId, signedTeacherId) ||
            sameId(row.assignedTeacherId, signedTeacherId)
          );
        });

      const classIds = new Set(teacherClassSubjects.map((row: any) => idOf(row.classId)));
      const subjectIds = new Set(teacherClassSubjects.map((row: any) => idOf(row.subjectId)));

      setTeachers(tenantTeachers);
      setClassSubjects(teacherClassSubjects);

      setClasses(
        classRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter((row: any) => classIds.has(idOf(row.id)))
          .filter(isActiveRow)
          .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );

      setSubjects(
        subjectRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter((row: any) => subjectIds.has(idOf(row.id)))
          .filter(isActiveRow)
      );

      setStudents(
        studentRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter(isActiveRow)
          .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)))
      );

      setEnrollments(enrollmentRows.filter((row) => sameTenant(row as TenantRow)));
      setAcademicStructures(academicStructureRows.filter((row) => sameTenant(row as TenantRow)));
      setPeriods(periodRows.filter((row) => sameTenant(row as TenantRow)));
      setCurriculumSubjects(curriculumSubjectRows.filter((row) => sameTenant(row as TenantRow)));
      setCurriculums(curriculumRows.filter((row) => sameTenant(row as TenantRow)));
      setPathways(pathwayRows.filter((row) => sameTenant(row as TenantRow)));
    } catch (error) {
      console.error("Failed to load teacher classes:", error);
      clearData();
      showToast("error", "Failed to load your teacher classes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || contextLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    contextLoading,
    settingsLoading,
  ]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map((row: any) => [idOf(row.id), row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((row: any) => [idOf(row.id), row])), [subjects]);
  const periodMap = useMemo(() => new Map(periods.map((row: any) => [idOf(row.id), row])), [periods]);
  const structureMap = useMemo(
    () => new Map(academicStructures.map((row: any) => [idOf(row.id), row])),
    [academicStructures]
  );
  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map((row: any) => [idOf(row.id), row])),
    [curriculumSubjects]
  );
  const curriculumMap = useMemo(() => new Map(curriculums.map((row: any) => [idOf(row.id), row])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map((row: any) => [idOf(row.id), row])), [pathways]);

  // ======================================================
  // BUILD TEACHER CLASS ROWS
  // ======================================================

  const teacherClasses = useMemo<TeacherClassRow[]>((() => {
    const grouped = new Map<number, TeacherClassRow>();

    for (const classSubject of classSubjects as any[]) {
      const classId = idOf(classSubject.classId);
      if (!classId) continue;

      const classRow = classMap.get(classId) as any;
      const subject = subjectMap.get(idOf(classSubject.subjectId)) as any;
      const period = periodMap.get(idOf(classSubject.academicPeriodId)) as any;
      const structure = structureMap.get(idOf(classSubject.academicStructureId)) as any;
      const curriculumSubject = curriculumSubjectMap.get(idOf(classSubject.curriculumSubjectId)) as any;
      const curriculum = curriculumSubject ? curriculumMap.get(idOf(curriculumSubject.curriculumId)) as any : undefined;
      const pathway = curriculumSubject?.pathwayId ? pathwayMap.get(idOf(curriculumSubject.pathwayId)) as any : undefined;

      const subjectMini: TeacherSubjectMini = {
        classSubjectId: idOf(classSubject.id),
        subjectId: idOf(classSubject.subjectId),
        subjectName: classSubject.name || subject?.name || "Unknown Subject",
        subjectCode: classSubject.code || subject?.code,
        academicPeriodName: period?.name || "All Periods",
        academicStructureName: structure?.name || "Unknown Structure",
        curriculumName: curriculum?.name || "No Curriculum",
        pathwayName: pathway?.name || "No Pathway",
      };

      if (!grouped.has(classId)) {
        const classStudents = students.filter((student: any) => {
          return enrollments.some((enrollment: any) => {
            if (!sameId(enrollment.studentId, student.id)) return false;
            if (!sameId(enrollment.classId, classId)) return false;
            return isActiveRow(enrollment) || safeLower(enrollment.status) === "active";
          });
        });

        grouped.set(classId, {
          classId,
          classRow,
          className: classRow?.name || `Class ${classId}`,
          classCode: classRow?.code,
          level: classRow?.level,
          capacity: Number(classRow?.capacity || 0),
          active: classRow?.active !== false,
          subjects: [],
          studentCount: classStudents.length,
          students: classStudents,
          periods: [],
          academicStructures: [],
        });
      }

      const current = grouped.get(classId)!;
      current.subjects.push(subjectMini);
      current.periods = unique([...current.periods, subjectMini.academicPeriodName]);
      current.academicStructures = unique([...current.academicStructures, subjectMini.academicStructureName]);
    }

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        subjects: row.subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
      }))
      .sort((a, b) => a.className.localeCompare(b.className));
  }) as any, [
    classSubjects,
    classMap,
    subjectMap,
    periodMap,
    structureMap,
    curriculumSubjectMap,
    curriculumMap,
    pathwayMap,
    students,
    enrollments,
  ]);

  const levelOptions = useMemo(() => {
    return unique(teacherClasses.map((row) => row.level || ""));
  }, [teacherClasses]);

  const periodOptions = useMemo(() => {
    return unique(teacherClasses.flatMap((row) => row.periods));
  }, [teacherClasses]);

  const filteredClasses = useMemo(() => {
    const term = search.trim().toLowerCase();

    return teacherClasses.filter((row) => {
      const haystack = [
        row.className,
        row.classCode,
        row.level,
        row.periods.join(" "),
        row.academicStructures.join(" "),
        ...row.subjects.map((subject) => `${subject.subjectName} ${subject.subjectCode || ""}`),
      ]
        .join(" ")
        .toLowerCase();

      const searchOk = !term || haystack.includes(term);
      const levelOk = levelFilter === "all" || sameId(row.level, levelFilter);
      const periodOk = periodFilter === "all" || row.periods.includes(periodFilter);

      return searchOk && levelOk && periodOk;
    });
  }, [teacherClasses, search, levelFilter, periodFilter]);

  const totalLearners = useMemo(
    () => teacherClasses.reduce((sum, row) => sum + row.studentCount, 0),
    [teacherClasses]
  );

  const totalSubjects = useMemo(
    () => teacherClasses.reduce((sum, row) => sum + row.subjects.length, 0),
    [teacherClasses]
  );

  const averageClassSize = useMemo(
    () => (teacherClasses.length ? Math.round(totalLearners / teacherClasses.length) : 0),
    [teacherClasses, totalLearners]
  );

  const capacityUsed = useMemo(() => {
    const capacity = teacherClasses.reduce((sum, row) => sum + Number(row.capacity || 0), 0);
    if (!capacity) return 0;
    return Math.round((totalLearners / capacity) * 100);
  }, [teacherClasses, totalLearners]);

  // ======================================================
  // STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="tc-page" style={{ "--tc-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tc-state-card">
          <div className="tc-spinner" />
          <h2>Loading your classes...</h2>
          <p>Checking your teacher profile, assigned subjects, class groups and learners.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="tc-page" style={{ "--tc-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tc-state-card">
          <h2>Sign in required</h2>
          <p>You must sign in before viewing your classes.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="tc-page" style={{ "--tc-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tc-state-card">
          <h2>Select a branch first</h2>
          <p>Your classes are loaded from the active school branch context.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="tc-page" style={{ "--tc-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`tc-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">
            ✕
          </button>
        </section>
      )}

      <section className="tc-hero">
        <div className="tc-hero-left">
          <div className="tc-hero-icon">🏫</div>
          <div className="tc-title-wrap">
            <p>Teacher Workspace</p>
            <h2>My Classes</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="tc-hero-actions">
          <div className="tc-view-switch">
            <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
              Cards
            </button>
            <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
              Table
            </button>
            <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>
              Summary
            </button>
          </div>

          <button type="button" className="tc-ghost-btn" onClick={load}>
            Refresh
          </button>
          <button type="button" className="tc-primary-btn" onClick={() => navigate?.("attendance")}>
            Take Attendance
          </button>
        </div>
      </section>

      {!teacherId && (
        <section className="tc-warning-card red">
          Your signed-in account could not be matched to a teacher record in this branch. Make sure the teacher record has the correct email or user ID.
        </section>
      )}

      <section className="tc-filter-card">
        <label>
          <span>Search classes or subjects</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search class, subject, code, level..."
          />
        </label>

        <label>
          <span>Level</span>
          <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <option value="all">All levels</option>
            {levelOptions.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Period</span>
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
            <option value="all">All periods</option>
            {periodOptions.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="tc-summary-grid" aria-label="Teacher class summary">
        <SummaryCard label="Classes" value={teacherClasses.length} icon="🏫" />
        <SummaryCard label="Subjects" value={totalSubjects} icon="📘" />
        <SummaryCard label="Learners" value={totalLearners} icon="🧑‍🎓" />
        <SummaryCard label="Avg Class Size" value={averageClassSize} icon="📊" />
        <SummaryCard label="Capacity Used" value={`${capacityUsed}%`} icon="🪑" />
      </section>

      {viewMode === "summary" && (
        <section className="tc-analysis-grid">
          <article className="tc-analysis-card">
            <span>Assigned classes</span>
            <strong>{teacherClasses.length}</strong>
            <p>Only classes connected to your teacher class-subject assignments are shown.</p>
          </article>

          <article className="tc-analysis-card">
            <span>Assigned subjects</span>
            <strong>{totalSubjects}</strong>
            <p>Total class-subject combinations currently assigned to you.</p>
          </article>

          <article className="tc-analysis-card">
            <span>Visible learners</span>
            <strong>{totalLearners}</strong>
            <p>Counted from active enrollments in your assigned classes.</p>
          </article>

          <article className="tc-analysis-card">
            <span>Filters showing</span>
            <strong>{filteredClasses.length}</strong>
            <p>Classes currently visible after search, level and period filters.</p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <section className="tc-table-card">
          <div className="tc-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Level</th>
                  <th>Subjects</th>
                  <th>Learners</th>
                  <th>Capacity</th>
                  <th>Periods</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredClasses.map((row) => (
                  <tr key={row.classId}>
                    <td>
                      <strong>{row.className}</strong>
                      <span>{row.classCode || "No code"}</span>
                    </td>
                    <td>{row.level || "—"}</td>
                    <td>
                      <div className="tc-mini-chip-row">
                        {row.subjects.slice(0, 4).map((subject) => (
                          <Chip key={subject.classSubjectId} tone="blue">
                            {subject.subjectName}
                          </Chip>
                        ))}
                        {row.subjects.length > 4 && <Chip tone="gray">+{row.subjects.length - 4}</Chip>}
                      </div>
                    </td>
                    <td>{row.studentCount}</td>
                    <td>
                      <Chip tone={capacityTone(row.studentCount, row.capacity)}>
                        {row.capacity ? `${row.studentCount}/${row.capacity}` : "No capacity"}
                      </Chip>
                    </td>
                    <td>{row.periods.join(", ") || "All periods"}</td>
                    <td>
                      <div className="tc-table-actions">
                        <button type="button" onClick={() => navigate?.("attendance")}>
                          Attendance
                        </button>
                        <button type="button" onClick={() => navigate?.("assessmentEntry")}>
                          Scores
                        </button>
                        <button type="button" onClick={() => navigate?.("teacherStudents")}>
                          Students
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredClasses.length && <div className="tc-empty-table">No class matches your filters.</div>}
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="tc-card-grid">
          {filteredClasses.map((row) => (
            <article key={row.classId} className="tc-class-card">
              <div className="tc-class-head">
                <div className="tc-class-icon">🏫</div>
                <div>
                  <h3>{row.className}</h3>
                  <p>{row.classCode || "No code"} {row.level ? `· ${row.level}` : ""}</p>
                </div>
                <Chip tone={row.active ? "green" : "gray"}>{row.active ? "Active" : "Inactive"}</Chip>
              </div>

              <div className="tc-class-stats">
                <span>
                  <b>{row.studentCount}</b>
                  Learners
                </span>
                <span>
                  <b>{row.subjects.length}</b>
                  Subjects
                </span>
                <span>
                  <b>{row.capacity || "—"}</b>
                  Capacity
                </span>
              </div>

              <div className="tc-progress-line">
                <span style={{ width: `${row.capacity ? Math.min(100, Math.round((row.studentCount / row.capacity) * 100)) : 0}%` }} />
              </div>

              <section className="tc-subject-list">
                {row.subjects.map((subject) => (
                  <div key={subject.classSubjectId} className="tc-subject-row">
                    <div>
                      <strong>{subject.subjectName}</strong>
                      <span>
                        {subject.subjectCode || "No code"} · {subject.academicPeriodName}
                      </span>
                    </div>
                    <Chip tone="blue">{subject.academicStructureName}</Chip>
                  </div>
                ))}
              </section>

              <div className="tc-class-meta">
                {row.periods.map((period) => (
                  <span key={period}>{period}</span>
                ))}
                {row.academicStructures.map((structure) => (
                  <span key={structure}>{structure}</span>
                ))}
              </div>

              <div className="tc-card-actions">
                <button type="button" onClick={() => navigate?.("attendance")}>
                  Attendance
                </button>
                <button type="button" onClick={() => navigate?.("assessmentEntry")}>
                  Enter Scores
                </button>
                <button type="button" onClick={() => navigate?.("assignments")}>
                  Assignments
                </button>
                <button type="button" onClick={() => navigate?.("teacherStudents")}>
                  Students
                </button>
              </div>
            </article>
          ))}

          {!filteredClasses.length && (
            <section className="tc-empty-card">
              <div className="tc-empty-icon">📚</div>
              <h3>No classes found</h3>
              <p>
                {teacherId
                  ? "No assigned class matched your search or filter."
                  : "Your teacher profile could not be identified, so assigned classes cannot be loaded."}
              </p>
            </section>
          )}
        </section>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="tc-summary-card">
      <div className="tc-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`tc-chip ${tone}`}>{children}</span>;
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes tcSpin { to { transform: rotate(360deg); } }

.tc-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--tc-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.tc-page *,
.tc-page *::before,
.tc-page *::after { box-sizing: border-box; }

.tc-page button,
.tc-page input,
.tc-page select {
  font: inherit;
  max-width: 100%;
}

.tc-page input,
.tc-page select {
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

.tc-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(520px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.tc-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.tc-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.tc-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--tc-primary) 18%, transparent);
  border-top-color: var(--tc-primary);
  animation: tcSpin .8s linear infinite;
}

.tc-toast {
  position: sticky;
  top: 8px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15, 23, 42, .12);
}

.tc-toast.success { background: #dcfce7; color: #166534; }
.tc-toast.error { background: #fee2e2; color: #991b1b; }
.tc-toast.info { background: #dbeafe; color: #1d4ed8; }

.tc-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

.tc-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .18), transparent 20rem),
    linear-gradient(135deg, var(--tc-primary), #0f172a 76%);
  box-shadow: 0 22px 55px rgba(15, 23, 42, .16);
  overflow: hidden;
}

.tc-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.tc-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: rgba(255, 255, 255, .16);
  border: 1px solid rgba(255, 255, 255, .2);
  color: #fff;
  font-size: 22px;
}

.tc-title-wrap {
  min-width: 0;
}

.tc-title-wrap p,
.tc-title-wrap h2,
.tc-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-title-wrap p {
  margin: 0 0 2px;
  color: rgba(255, 255, 255, .82);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.tc-title-wrap h2 {
  margin: 0;
  font-size: clamp(22px, 6vw, 34px);
  font-weight: 1000;
  letter-spacing: -.07em;
  line-height: 1;
}

.tc-title-wrap span {
  margin-top: 4px;
  color: rgba(255, 255, 255, .82);
  font-size: 12px;
  font-weight: 750;
}

.tc-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.tc-view-switch {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .12);
  border: 1px solid rgba(255, 255, 255, .2);
}

.tc-view-switch button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: transparent;
  color: rgba(255, 255, 255, .72);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.tc-view-switch button.active {
  background: #fff;
  color: #0f172a;
}

.tc-primary-btn,
.tc-ghost-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.tc-primary-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.tc-ghost-btn {
  border: 1px solid rgba(255, 255, 255, .24);
  background: rgba(255, 255, 255, .13);
  color: #fff;
}

.tc-filter-card,
.tc-warning-card,
.tc-summary-card,
.tc-class-card,
.tc-table-card,
.tc-analysis-card,
.tc-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
  overflow: hidden;
}

.tc-warning-card {
  margin-top: 10px;
  padding: 13px;
  color: #7f1d1d;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.55;
}

.tc-warning-card.red {
  border-color: rgba(239, 68, 68, .18);
  background: rgba(239, 68, 68, .06);
}

.tc-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
}

.tc-filter-card label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.tc-filter-card label span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.tc-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.tc-summary-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
}

.tc-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--tc-primary) 12%, #fff);
}

.tc-summary-card div:last-child { min-width: 0; }

.tc-summary-card strong,
.tc-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.tc-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.tc-card-grid,
.tc-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.tc-class-card,
.tc-analysis-card,
.tc-table-card,
.tc-empty-card {
  padding: 13px;
}

.tc-class-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.tc-class-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: color-mix(in srgb, var(--tc-primary) 12%, #fff);
}

.tc-class-head > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.tc-class-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.tc-class-head p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.tc-class-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.tc-class-stats span {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.tc-class-stats b {
  display: block;
  color: #0f172a;
  font-size: 20px;
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.05em;
  margin-bottom: 4px;
}

.tc-progress-line {
  height: 9px;
  margin-top: 12px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.tc-progress-line span {
  display: block;
  height: 100%;
  min-width: 4px;
  background: linear-gradient(90deg, var(--tc-primary), #16a34a);
}

.tc-subject-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.tc-subject-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
}

.tc-subject-row div {
  min-width: 0;
}

.tc-subject-row strong,
.tc-subject-row span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tc-subject-row strong {
  font-size: 13px;
  font-weight: 1000;
}

.tc-subject-row span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

.tc-class-meta,
.tc-mini-chip-row,
.tc-card-actions,
.tc-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.tc-class-meta {
  margin-top: 12px;
}

.tc-class-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}

.tc-card-actions {
  margin-top: 12px;
}

.tc-card-actions button,
.tc-table-actions button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--tc-primary) 10%, #fff);
  color: var(--tc-primary);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
}

.tc-card-actions button:first-child,
.tc-table-actions button:first-child {
  background: var(--tc-primary);
  color: #fff;
}

.tc-chip {
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

.tc-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.tc-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.tc-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.tc-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.tc-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.tc-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.tc-table-card {
  margin-top: 10px;
}

.tc-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, .18);
}

.tc-table-scroll table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: #fff;
}

.tc-table-scroll th,
.tc-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  vertical-align: top;
  text-align: left;
  font-size: 13px;
}

.tc-table-scroll th {
  background: #f8fafc;
  color: #334155;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.tc-table-scroll td strong,
.tc-table-scroll td span {
  display: block;
}

.tc-table-scroll td strong {
  font-weight: 1000;
}

.tc-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.tc-empty-table {
  padding: 22px;
  text-align: center;
  color: var(--muted, #64748b);
  font-weight: 850;
}

.tc-analysis-card span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.tc-analysis-card strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.tc-analysis-card p {
  margin: 8px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.tc-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 220px;
  text-align: center;
  border-style: dashed;
}

.tc-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--tc-primary) 12%, #fff);
  font-size: 28px;
}

.tc-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.tc-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

@media (min-width: 680px) {
  .tc-page { padding: 12px; }

  .tc-filter-card {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, .8fr) minmax(0, .8fr);
  }

  .tc-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .tc-card-grid,
  .tc-analysis-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .tc-page { padding: 16px; }

  .tc-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tc-analysis-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .tc-page { padding: 6px; }

  .tc-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .tc-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .tc-view-switch,
  .tc-ghost-btn,
  .tc-primary-btn {
    width: 100%;
  }

  .tc-view-switch {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tc-summary-grid {
    gap: 6px;
  }

  .tc-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .tc-class-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .tc-class-card,
  .tc-analysis-card,
  .tc-table-card,
  .tc-empty-card {
    border-radius: 20px;
    padding: 11px;
  }
}
`;
