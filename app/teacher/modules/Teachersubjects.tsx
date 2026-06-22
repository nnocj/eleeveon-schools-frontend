"use client";

/**
 * app/teacher/modules/Teachersubjects.tsx
 * ---------------------------------------------------------
 * TEACHER MY SUBJECTS
 * ---------------------------------------------------------
 * Teacher-only subject workspace.
 *
 * This file does NOT use DexieCrudPage because teachers should not edit
 * official subject records and should not work with raw IDs.
 *
 * What it does:
 * - Detects the signed-in teacher.
 * - Shows only subjects assigned to that teacher through classSubjects.
 * - Groups the teacher's assigned class-subject records by subject.
 * - Shows the classes, periods, learners, curriculum/pathway context and quick actions.
 * - Provides mobile-first card/table/summary views.
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
} from "../../lib/db";

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

type TeacherSubjectRow = {
  subjectId: number;
  subjectRow?: Subject;
  subjectName: string;
  subjectCode?: string;
  description?: string;
  credits?: number;
  category?: string;
  active: boolean;
  classLinks: TeacherClassMini[];
  classCount: number;
  learnerCount: number;
  periods: string[];
  academicStructures: string[];
  curriculums: string[];
  pathways: string[];
};

type TeacherClassMini = {
  classSubjectId: number;
  classId: number;
  className: string;
  classCode?: string;
  level?: string;
  learnerCount: number;
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

// ======================================================
// COMPONENT
// ======================================================

export default function Teachersubjects({ navigate }: Props) {
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
  const [categoryFilter, setCategoryFilter] = useState("all");
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
      );

      setSubjects(
        subjectRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter((row: any) => subjectIds.has(idOf(row.id)))
          .filter(isActiveRow)
          .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
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
      console.error("Failed to load teacher subjects:", error);
      clearData();
      showToast("error", "Failed to load your teacher subjects.");
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

  const learnerCountForClass = (classId: number) => {
    const studentIds = new Set<string>();

    for (const enrollment of enrollments as any[]) {
      if (!sameId(enrollment.classId, classId)) continue;
      if (!(isActiveRow(enrollment) || safeLower(enrollment.status) === "active")) continue;
      studentIds.add(String(enrollment.studentId));
    }

    return students.filter((student: any) => studentIds.has(String(student.id))).length;
  };

  // ======================================================
  // BUILD TEACHER SUBJECT ROWS
  // ======================================================

  const teacherSubjects = useMemo<TeacherSubjectRow[]>(() => {
    const grouped = new Map<number, TeacherSubjectRow>();

    for (const classSubject of classSubjects as any[]) {
      const subjectId = idOf(classSubject.subjectId);
      if (!subjectId) continue;

      const subject = subjectMap.get(subjectId) as any;
      const classRow = classMap.get(idOf(classSubject.classId)) as any;
      const period = periodMap.get(idOf(classSubject.academicPeriodId)) as any;
      const structure = structureMap.get(idOf(classSubject.academicStructureId)) as any;
      const curriculumSubject = curriculumSubjectMap.get(idOf(classSubject.curriculumSubjectId)) as any;
      const curriculum = curriculumSubject ? curriculumMap.get(idOf(curriculumSubject.curriculumId)) as any : undefined;
      const pathway = curriculumSubject?.pathwayId ? pathwayMap.get(idOf(curriculumSubject.pathwayId)) as any : undefined;

      const classMini: TeacherClassMini = {
        classSubjectId: idOf(classSubject.id),
        classId: idOf(classSubject.classId),
        className: classRow?.name || `Class ${idOf(classSubject.classId)}`,
        classCode: classRow?.code,
        level: classRow?.level,
        learnerCount: learnerCountForClass(idOf(classSubject.classId)),
        academicPeriodName: period?.name || "All Periods",
        academicStructureName: structure?.name || "Unknown Structure",
        curriculumName: curriculum?.name || "No Curriculum",
        pathwayName: pathway?.name || "No Pathway",
      };

      if (!grouped.has(subjectId)) {
        grouped.set(subjectId, {
          subjectId,
          subjectRow: subject,
          subjectName: classSubject.name || subject?.name || `Subject ${subjectId}`,
          subjectCode: classSubject.code || subject?.code,
          description: subject?.description,
          credits: Number(subject?.credits || 0),
          category: subject?.category,
          active: subject?.active !== false,
          classLinks: [],
          classCount: 0,
          learnerCount: 0,
          periods: [],
          academicStructures: [],
          curriculums: [],
          pathways: [],
        });
      }

      const current = grouped.get(subjectId)!;
      current.classLinks.push(classMini);
      current.classCount = current.classLinks.length;
      current.learnerCount += classMini.learnerCount;
      current.periods = unique([...current.periods, classMini.academicPeriodName]);
      current.academicStructures = unique([...current.academicStructures, classMini.academicStructureName]);
      current.curriculums = unique([...current.curriculums, classMini.curriculumName]);
      current.pathways = unique([...current.pathways, classMini.pathwayName]);
    }

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        classLinks: row.classLinks.sort((a, b) => a.className.localeCompare(b.className)),
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [
    classSubjects,
    subjectMap,
    classMap,
    periodMap,
    structureMap,
    curriculumSubjectMap,
    curriculumMap,
    pathwayMap,
    enrollments,
    students,
  ]);

  const categoryOptions = useMemo(() => {
    return unique(teacherSubjects.map((row) => row.category || ""));
  }, [teacherSubjects]);

  const periodOptions = useMemo(() => {
    return unique(teacherSubjects.flatMap((row) => row.periods));
  }, [teacherSubjects]);

  const filteredSubjects = useMemo(() => {
    const term = search.trim().toLowerCase();

    return teacherSubjects.filter((row) => {
      const haystack = [
        row.subjectName,
        row.subjectCode,
        row.category,
        row.description,
        row.periods.join(" "),
        row.curriculums.join(" "),
        row.pathways.join(" "),
        ...row.classLinks.map((link) => `${link.className} ${link.classCode || ""} ${link.level || ""}`),
      ]
        .join(" ")
        .toLowerCase();

      const searchOk = !term || haystack.includes(term);
      const categoryOk = categoryFilter === "all" || sameId(row.category, categoryFilter);
      const periodOk = periodFilter === "all" || row.periods.includes(periodFilter);

      return searchOk && categoryOk && periodOk;
    });
  }, [teacherSubjects, search, categoryFilter, periodFilter]);

  const totalClasses = useMemo(
    () => teacherSubjects.reduce((sum, row) => sum + row.classCount, 0),
    [teacherSubjects]
  );

  const totalLearners = useMemo(
    () => teacherSubjects.reduce((sum, row) => sum + row.learnerCount, 0),
    [teacherSubjects]
  );

  const totalCredits = useMemo(
    () => teacherSubjects.reduce((sum, row) => sum + Number(row.credits || 0), 0),
    [teacherSubjects]
  );

  const busiestSubject = useMemo(() => {
    return [...teacherSubjects].sort((a, b) => b.learnerCount - a.learnerCount)[0];
  }, [teacherSubjects]);

  // ======================================================
  // STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="ts-page" style={{ "--ts-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ts-state-card">
          <div className="ts-spinner" />
          <h2>Loading your subjects...</h2>
          <p>Checking your teacher profile, assigned subjects, classes and learners.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="ts-page" style={{ "--ts-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ts-state-card">
          <h2>Sign in required</h2>
          <p>You must sign in before viewing your subjects.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ts-page" style={{ "--ts-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ts-state-card">
          <h2>Select a branch first</h2>
          <p>Your subjects are loaded from the active school branch context.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="ts-page" style={{ "--ts-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ts-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">
            ✕
          </button>
        </section>
      )}

      <section className="ts-hero">
        <div className="ts-hero-left">
          <div className="ts-hero-icon">📘</div>
          <div className="ts-title-wrap">
            <p>Teacher Workspace</p>
            <h2>My Subjects</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="ts-hero-actions">
          <div className="ts-view-switch">
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

          <button type="button" className="ts-ghost-btn" onClick={load}>
            Refresh
          </button>
          <button type="button" className="ts-primary-btn" onClick={() => navigate?.("assessmentEntry")}>
            Enter Scores
          </button>
        </div>
      </section>

      {!teacherId && (
        <section className="ts-warning-card red">
          Your signed-in account could not be matched to a teacher record in this branch. Make sure the teacher record has the correct email or user ID.
        </section>
      )}

      <section className="ts-filter-card">
        <label>
          <span>Search subjects or classes</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject, class, code, category..."
          />
        </label>

        <label>
          <span>Category</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
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

      <section className="ts-summary-grid" aria-label="Teacher subject summary">
        <SummaryCard label="Subjects" value={teacherSubjects.length} icon="📘" />
        <SummaryCard label="Class Links" value={totalClasses} icon="🏫" />
        <SummaryCard label="Learners" value={totalLearners} icon="🧑‍🎓" />
        <SummaryCard label="Credits" value={totalCredits || "—"} icon="⭐" />
        <SummaryCard label="Showing" value={filteredSubjects.length} icon="🔎" />
      </section>

      {viewMode === "summary" && (
        <section className="ts-analysis-grid">
          <article className="ts-analysis-card">
            <span>Assigned subjects</span>
            <strong>{teacherSubjects.length}</strong>
            <p>Only subjects connected to your class-subject assignments are shown.</p>
          </article>

          <article className="ts-analysis-card">
            <span>Class links</span>
            <strong>{totalClasses}</strong>
            <p>Total classes where you teach one or more assigned subjects.</p>
          </article>

          <article className="ts-analysis-card">
            <span>Busiest subject</span>
            <strong>{busiestSubject?.subjectName || "None"}</strong>
            <p>{busiestSubject ? `${busiestSubject.learnerCount} learner references across ${busiestSubject.classCount} class(es).` : "No assigned subject found."}</p>
          </article>

          <article className="ts-analysis-card">
            <span>Filters showing</span>
            <strong>{filteredSubjects.length}</strong>
            <p>Subjects currently visible after search, category and period filters.</p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <section className="ts-table-card">
          <div className="ts-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Credits</th>
                  <th>Classes</th>
                  <th>Learners</th>
                  <th>Periods</th>
                  <th>Curriculum</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredSubjects.map((row) => (
                  <tr key={row.subjectId}>
                    <td>
                      <strong>{row.subjectName}</strong>
                      <span>{row.subjectCode || "No code"}</span>
                    </td>
                    <td>{row.category || "—"}</td>
                    <td>{row.credits || "—"}</td>
                    <td>
                      <div className="ts-mini-chip-row">
                        {row.classLinks.slice(0, 4).map((link) => (
                          <Chip key={link.classSubjectId} tone="blue">
                            {link.className}
                          </Chip>
                        ))}
                        {row.classLinks.length > 4 && <Chip tone="gray">+{row.classLinks.length - 4}</Chip>}
                      </div>
                    </td>
                    <td>{row.learnerCount}</td>
                    <td>{row.periods.join(", ") || "All periods"}</td>
                    <td>{row.curriculums.join(", ") || "No curriculum"}</td>
                    <td>
                      <div className="ts-table-actions">
                        <button type="button" onClick={() => navigate?.("assessmentEntry")}>
                          Scores
                        </button>
                        <button type="button" onClick={() => navigate?.("assignments")}>
                          Assignments
                        </button>
                        <button type="button" onClick={() => navigate?.("courseOutline")}>
                          Outline
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredSubjects.length && <div className="ts-empty-table">No subject matches your filters.</div>}
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ts-card-grid">
          {filteredSubjects.map((row) => (
            <article key={row.subjectId} className="ts-subject-card">
              <div className="ts-subject-head">
                <div className="ts-subject-icon">📘</div>
                <div>
                  <h3>{row.subjectName}</h3>
                  <p>{row.subjectCode || "No code"} {row.category ? `· ${row.category}` : ""}</p>
                </div>
                <Chip tone={row.active ? "green" : "gray"}>{row.active ? "Active" : "Inactive"}</Chip>
              </div>

              {row.description && <p className="ts-description">{row.description}</p>}

              <div className="ts-subject-stats">
                <span>
                  <b>{row.classCount}</b>
                  Classes
                </span>
                <span>
                  <b>{row.learnerCount}</b>
                  Learners
                </span>
                <span>
                  <b>{row.credits || "—"}</b>
                  Credits
                </span>
              </div>

              <section className="ts-class-list">
                {row.classLinks.map((link) => (
                  <div key={link.classSubjectId} className="ts-class-row">
                    <div>
                      <strong>{link.className}</strong>
                      <span>
                        {link.classCode || "No code"} {link.level ? `· ${link.level}` : ""} · {link.academicPeriodName}
                      </span>
                    </div>
                    <Chip tone="blue">{link.learnerCount} learners</Chip>
                  </div>
                ))}
              </section>

              <div className="ts-subject-meta">
                {row.periods.map((period) => (
                  <span key={period}>{period}</span>
                ))}
                {row.curriculums.map((curriculum) => (
                  <span key={curriculum}>{curriculum}</span>
                ))}
                {row.pathways.map((pathway) => (
                  <span key={pathway}>{pathway}</span>
                ))}
              </div>

              <div className="ts-card-actions">
                <button type="button" onClick={() => navigate?.("assessmentEntry")}>
                  Enter Scores
                </button>
                <button type="button" onClick={() => navigate?.("assignments")}>
                  Assignments
                </button>
                <button type="button" onClick={() => navigate?.("courseOutline")}>
                  Course Outline
                </button>
                <button type="button" onClick={() => navigate?.("lessonNotes")}>
                  Lesson Notes
                </button>
              </div>
            </article>
          ))}

          {!filteredSubjects.length && (
            <section className="ts-empty-card">
              <div className="ts-empty-icon">📘</div>
              <h3>No subjects found</h3>
              <p>
                {teacherId
                  ? "No assigned subject matched your search or filter."
                  : "Your teacher profile could not be identified, so assigned subjects cannot be loaded."}
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
    <article className="ts-summary-card">
      <div className="ts-summary-icon">{icon}</div>
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
  return <span className={`ts-chip ${tone}`}>{children}</span>;
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes tsSpin { to { transform: rotate(360deg); } }

.ts-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ts-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.ts-page *,
.ts-page *::before,
.ts-page *::after { box-sizing: border-box; }

.ts-page button,
.ts-page input,
.ts-page select {
  font: inherit;
  max-width: 100%;
}

.ts-page input,
.ts-page select {
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

.ts-state-card {
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

.ts-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ts-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ts-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ts-primary) 18%, transparent);
  border-top-color: var(--ts-primary);
  animation: tsSpin .8s linear infinite;
}

.ts-toast {
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

.ts-toast.success { background: #dcfce7; color: #166534; }
.ts-toast.error { background: #fee2e2; color: #991b1b; }
.ts-toast.info { background: #dbeafe; color: #1d4ed8; }

.ts-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

.ts-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .18), transparent 20rem),
    linear-gradient(135deg, var(--ts-primary), #0f172a 76%);
  box-shadow: 0 22px 55px rgba(15, 23, 42, .16);
  overflow: hidden;
}

.ts-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.ts-hero-icon {
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

.ts-title-wrap {
  min-width: 0;
}

.ts-title-wrap p,
.ts-title-wrap h2,
.ts-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ts-title-wrap p {
  margin: 0 0 2px;
  color: rgba(255, 255, 255, .82);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ts-title-wrap h2 {
  margin: 0;
  font-size: clamp(22px, 6vw, 34px);
  font-weight: 1000;
  letter-spacing: -.07em;
  line-height: 1;
}

.ts-title-wrap span {
  margin-top: 4px;
  color: rgba(255, 255, 255, .82);
  font-size: 12px;
  font-weight: 750;
}

.ts-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.ts-view-switch {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .12);
  border: 1px solid rgba(255, 255, 255, .2);
}

.ts-view-switch button {
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

.ts-view-switch button.active {
  background: #fff;
  color: #0f172a;
}

.ts-primary-btn,
.ts-ghost-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ts-primary-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.ts-ghost-btn {
  border: 1px solid rgba(255, 255, 255, .24);
  background: rgba(255, 255, 255, .13);
  color: #fff;
}

.ts-filter-card,
.ts-warning-card,
.ts-summary-card,
.ts-subject-card,
.ts-table-card,
.ts-analysis-card,
.ts-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
  overflow: hidden;
}

.ts-warning-card {
  margin-top: 10px;
  padding: 13px;
  color: #7f1d1d;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.55;
}

.ts-warning-card.red {
  border-color: rgba(239, 68, 68, .18);
  background: rgba(239, 68, 68, .06);
}

.ts-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
}

.ts-filter-card label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.ts-filter-card label span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.ts-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.ts-summary-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
}

.ts-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--ts-primary) 12%, #fff);
}

.ts-summary-card div:last-child { min-width: 0; }

.ts-summary-card strong,
.ts-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ts-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ts-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.ts-card-grid,
.ts-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.ts-subject-card,
.ts-analysis-card,
.ts-table-card,
.ts-empty-card {
  padding: 13px;
}

.ts-subject-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.ts-subject-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: color-mix(in srgb, var(--ts-primary) 12%, #fff);
}

.ts-subject-head > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.ts-subject-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ts-subject-head p,
.ts-description {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.5;
}

.ts-description {
  margin-top: 12px;
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
}

.ts-subject-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.ts-subject-stats span {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.ts-subject-stats b {
  display: block;
  color: #0f172a;
  font-size: 20px;
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.05em;
  margin-bottom: 4px;
}

.ts-class-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.ts-class-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
}

.ts-class-row div {
  min-width: 0;
}

.ts-class-row strong,
.ts-class-row span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ts-class-row strong {
  font-size: 13px;
  font-weight: 1000;
}

.ts-class-row span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

.ts-subject-meta,
.ts-mini-chip-row,
.ts-card-actions,
.ts-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.ts-subject-meta {
  margin-top: 12px;
}

.ts-subject-meta span {
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

.ts-card-actions {
  margin-top: 12px;
}

.ts-card-actions button,
.ts-table-actions button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ts-primary) 10%, #fff);
  color: var(--ts-primary);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
}

.ts-card-actions button:first-child,
.ts-table-actions button:first-child {
  background: var(--ts-primary);
  color: #fff;
}

.ts-chip {
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

.ts-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ts-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ts-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ts-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.ts-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ts-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.ts-table-card {
  margin-top: 10px;
}

.ts-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, .18);
}

.ts-table-scroll table {
  width: 100%;
  min-width: 1060px;
  border-collapse: collapse;
  background: #fff;
}

.ts-table-scroll th,
.ts-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  vertical-align: top;
  text-align: left;
  font-size: 13px;
}

.ts-table-scroll th {
  background: #f8fafc;
  color: #334155;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.ts-table-scroll td strong,
.ts-table-scroll td span {
  display: block;
}

.ts-table-scroll td strong {
  font-weight: 1000;
}

.ts-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.ts-empty-table {
  padding: 22px;
  text-align: center;
  color: var(--muted, #64748b);
  font-weight: 850;
}

.ts-analysis-card span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ts-analysis-card strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(22px, 7vw, 30px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.ts-analysis-card p {
  margin: 8px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ts-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 220px;
  text-align: center;
  border-style: dashed;
}

.ts-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--ts-primary) 12%, #fff);
  font-size: 28px;
}

.ts-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.ts-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

@media (min-width: 680px) {
  .ts-page { padding: 12px; }

  .ts-filter-card {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, .8fr) minmax(0, .8fr);
  }

  .ts-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .ts-card-grid,
  .ts-analysis-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .ts-page { padding: 16px; }

  .ts-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ts-analysis-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .ts-page { padding: 6px; }

  .ts-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .ts-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .ts-view-switch,
  .ts-ghost-btn,
  .ts-primary-btn {
    width: 100%;
  }

  .ts-view-switch {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ts-summary-grid {
    gap: 6px;
  }

  .ts-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .ts-subject-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .ts-subject-card,
  .ts-analysis-card,
  .ts-table-card,
  .ts-empty-card {
    border-radius: 20px;
    padding: 11px;
  }
}
`;
