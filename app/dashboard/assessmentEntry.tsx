"use client";

/**
 * AssessmentEntries.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE CLASS-SUBJECT ASSESSMENT ENTRY ENGINE
 * ---------------------------------------------------------
 *
 * Source of truth:
 * ClassSubject -> AssessmentApplicability -> AssessmentStructureItems -> AssessmentEntry
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - ClassSubject is the academic delivery context.
 * - AssessmentEntry is linked by classSubjectId / assessmentStructureId / gradingSystemId.
 * - Mobile-first cards; score table scrolls internally only.
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
  AssessmentApplicability,
  AssessmentEntry,
  AssessmentStructure,
  AssessmentStructureItem,
  Class,
  ClassSubject,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  GradeRule,
  GradingSystem,
  Organization,
  Student,
  StudentEnrollment,
  Subject,
  Teacher,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type ScoreMap = Record<string, number | "">;

type ResultMap = Record<
  string,
  {
    rawTotal: number;
    weightedTotal: number;
    percentage: number;
    grade?: string;
    remark?: string;
    gpa?: number;
  }
>;

type ClassSubjectOption = {
  id: number;
  row: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  academicStructureName: string;
  academicPeriodName: string;
  curriculumName: string;
  pathwayName: string;
  organizationId?: number;
  display: string;
};

type StudentRow = {
  student: Student;
  enrollment?: StudentEnrollment;
};

// ======================================================
// HELPERS
// ======================================================

const scoreKey = (studentId?: number, itemId?: number) => `${studentId || 0}-${itemId || 0}`;

// ======================================================
// COMPONENT
// ======================================================

export default function AssessmentEntriesPage() {
  const router = useRouter();

  const {
    accountId,
    loading: accountLoading,
    authenticated,
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
  const [sessionStarted, setSessionStarted] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);

  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [applicabilities, setApplicabilities] = useState<AssessmentApplicability[]>([]);
  const [structures, setStructures] = useState<AssessmentStructure[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [gradings, setGradings] = useState<GradingSystem[]>([]);
  const [rules, setRules] = useState<GradeRule[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);

  const [classSubjectId, setClassSubjectId] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [scores, setScores] = useState<ScoreMap>({});

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

  const clearData = () => {
    setStudents([]);
    setClasses([]);
    setSubjects([]);
    setTeachers([]);
    setAcademicStructures([]);
    setPeriods([]);
    setOrganizations([]);
    setCurriculums([]);
    setPathways([]);
    setCurriculumSubjects([]);
    setClassSubjects([]);
    setApplicabilities([]);
    setStructures([]);
    setItems([]);
    setEntries([]);
    setGradings([]);
    setRules([]);
    setEnrollments([]);
    setScores({});
    setSessionStarted(false);
  };

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        studentRows,
        classRows,
        subjectRows,
        teacherRows,
        academicStructureRows,
        periodRows,
        organizationRows,
        curriculumRows,
        pathwayRows,
        curriculumSubjectRows,
        classSubjectRows,
        applicabilityRows,
        structureRows,
        itemRows,
        entryRows,
        gradingRows,
        ruleRows,
        enrollmentRows,
      ] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.teachers.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.organizations.toArray(),
        db.curriculums.toArray(),
        db.curriculumPathways.toArray(),
        db.curriculumSubjects.toArray(),
        db.classSubjects.toArray(),
        db.assessmentApplicabilities.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentEntries.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
        db.studentEnrollments.toArray(),
      ]);

      setStudents(
        studentRows
          .filter(sameTenant)
          .filter((row) => row.status !== "withdrawn")
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );
      setClasses(classRows.filter(sameTenant));
      setSubjects(subjectRows.filter(sameTenant));
      setTeachers(teacherRows.filter(sameTenant));
      setAcademicStructures(academicStructureRows.filter(sameTenant));
      setPeriods(periodRows.filter(sameTenant));
      setOrganizations(organizationRows.filter(sameTenant));
      setCurriculums(curriculumRows.filter(sameTenant));
      setPathways(pathwayRows.filter(sameTenant));
      setCurriculumSubjects(curriculumSubjectRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter((row) => sameTenant(row) && row.active !== false));
      setApplicabilities(applicabilityRows.filter((row) => sameTenant(row) && row.active !== false));
      setStructures(structureRows.filter((row) => sameTenant(row) && row.active !== false));
      setItems(itemRows.filter((row) => sameTenant(row) && row.active !== false));
      setEntries(entryRows.filter(sameTenant));
      setGradings(gradingRows.filter((row) => sameTenant(row) && row.active !== false));
      setRules(ruleRows.filter((row) => sameTenant(row) && row.active !== false));
      setEnrollments(enrollmentRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load assessment entries:", error);
      clearData();
      alert("Failed to load assessment entries");
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

  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((row) => [row.id, row])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((row) => [row.id, row])), [teachers]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row) => [row.id, row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(periods.map((row) => [row.id, row])), [periods]);
  const orgMap = useMemo(() => new Map(organizations.map((row) => [row.id, row])), [organizations]);
  const curriculumSubjectMap = useMemo(() => new Map(curriculumSubjects.map((row) => [row.id, row])), [curriculumSubjects]);
  const curriculumMap = useMemo(() => new Map(curriculums.map((row) => [row.id, row])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map((row) => [row.id, row])), [pathways]);

  // ======================================================
  // CLASS SUBJECT OPTIONS
  // ======================================================

  const classSubjectOptions = useMemo<ClassSubjectOption[]>(() => {
    return classSubjects
      .map((row) => {
        const classRow = classMap.get(row.classId);
        const subject = subjectMap.get(row.subjectId);
        const teacher = row.teacherId ? teacherMap.get(row.teacherId) : undefined;
        const academicStructure = structureMap.get(row.academicStructureId);
        const period = row.academicPeriodId ? periodMap.get(row.academicPeriodId) : undefined;
        const curriculumSubject = curriculumSubjectMap.get(row.curriculumSubjectId);
        const curriculum = curriculumSubject ? curriculumMap.get(curriculumSubject.curriculumId) : undefined;
        const pathway = curriculumSubject?.pathwayId ? pathwayMap.get(curriculumSubject.pathwayId) : undefined;

        const subjectName = row.name || subject?.name || "Unknown Subject";
        const subjectCode = row.code || subject?.code;
        const className = classRow?.name || "Unknown Class";
        const academicPeriodName = period?.name || "All Periods";

        return {
          id: row.id || 0,
          row,
          className,
          subjectName,
          subjectCode,
          teacherName: teacher?.fullName || "No teacher assigned",
          academicStructureName: academicStructure?.name || "Unknown academic structure",
          academicPeriodName,
          curriculumName: curriculum?.name || "No curriculum",
          pathwayName: pathway?.name || "No pathway",
          organizationId: curriculumSubject?.organizationId,
          display: `${className} • ${subjectName}${subjectCode ? ` (${subjectCode})` : ""} • ${academicPeriodName}`,
        };
      })
      .filter((option) => option.id > 0)
      .sort((a, b) => a.display.localeCompare(b.display));
  }, [
    classSubjects,
    classMap,
    subjectMap,
    teacherMap,
    structureMap,
    periodMap,
    curriculumSubjectMap,
    curriculumMap,
    pathwayMap,
  ]);

  const selectedOption = useMemo(() => {
    return classSubjectOptions.find((option) => option.id === classSubjectId);
  }, [classSubjectOptions, classSubjectId]);

  const currentClassSubject = selectedOption?.row;

  // ======================================================
  // APPLICABILITY / STRUCTURE / GRADING
  // ======================================================

  const applicability = useMemo(() => {
    if (!classSubjectId) return undefined;
    return applicabilities.find((row) => row.classSubjectId === classSubjectId && row.active !== false);
  }, [applicabilities, classSubjectId]);

  const assessmentStructure = useMemo(() => {
    if (!applicability?.assessmentStructureId) return undefined;
    return structures.find((row) => row.id === applicability.assessmentStructureId);
  }, [structures, applicability]);

  const structureItems = useMemo(() => {
    if (!applicability?.assessmentStructureId) return [];

    return items
      .filter((row) => row.assessmentStructureId === applicability.assessmentStructureId && row.active !== false)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [items, applicability]);

  const gradingSystem = useMemo(() => {
    if (!applicability?.gradingSystemId) return undefined;
    return gradings.find((row) => row.id === applicability.gradingSystemId);
  }, [gradings, applicability]);

  const gradeRules = useMemo(() => {
    if (!gradingSystem?.id) return [];

    return rules
      .filter((row) => row.gradingSystemId === gradingSystem.id && row.active !== false)
      .sort((a, b) => Number(b.minScore || 0) - Number(a.minScore || 0));
  }, [rules, gradingSystem]);

  const organizationName = useMemo(() => {
    if (!applicability?.organizationId) return "No organization";
    return orgMap.get(applicability.organizationId)?.name || "Unknown organization";
  }, [applicability, orgMap]);

  // ======================================================
  // STUDENTS FOR SELECTED CLASS SUBJECT
  // ======================================================

  const studentRows = useMemo<StudentRow[]>(() => {
    if (!currentClassSubject) return [];

    const periodId = currentClassSubject.academicPeriodId;

    return students
      .map((student) => {
        const enrollment = enrollments.find((row) => {
          if (row.studentId !== student.id) return false;
          if (row.classId !== currentClassSubject.classId) return false;
          if (row.academicStructureId !== currentClassSubject.academicStructureId) return false;
          if (periodId && row.academicPeriodId !== periodId) return false;
          return row.status === "active";
        });

        return enrollment ? { student, enrollment } : undefined;
      })
      .filter(Boolean) as StudentRow[];
  }, [students, enrollments, currentClassSubject]);

  const filteredStudentRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return studentRows;

    return studentRows.filter(({ student }) => {
      return `${student.fullName} ${student.admissionNumber || ""}`.toLowerCase().includes(query);
    });
  }, [studentRows, search]);

  // ======================================================
  // SCORE HYDRATION
  // ======================================================

  useEffect(() => {
    if (!currentClassSubject || !applicability) {
      setScores({});
      setSessionStarted(false);
      return;
    }

    const nextScores: ScoreMap = {};

    entries
      .filter((entry) => {
        if (entry.classSubjectId !== currentClassSubject.id) return false;
        if (entry.classId !== currentClassSubject.classId) return false;
        if (entry.subjectId !== currentClassSubject.subjectId) return false;
        if (entry.academicStructureId !== currentClassSubject.academicStructureId) return false;
        if (entry.academicPeriodId !== (currentClassSubject.academicPeriodId || 0)) return false;
        if (entry.assessmentStructureId !== applicability.assessmentStructureId) return false;
        if (applicability.gradingSystemId && entry.gradingSystemId !== applicability.gradingSystemId) return false;
        return true;
      })
      .forEach((entry) => {
        nextScores[scoreKey(entry.studentId, entry.assessmentStructureItemId)] = Number(entry.score);
      });

    setScores(nextScores);
    setSessionStarted(false);
  }, [entries, currentClassSubject, applicability]);

  // ======================================================
  // COMPUTED RESULTS
  // ======================================================

  const computedResults = useMemo<ResultMap>(() => {
    const result: ResultMap = {};

    for (const { student } of filteredStudentRows) {
      let rawTotal = 0;
      let weightedTotal = 0;
      let maxTotal = 0;

      for (const item of structureItems) {
        const value = scores[scoreKey(student.id, item.id)];
        const score = value === "" || value == null ? 0 : Number(value);
        const maxScore = Math.max(1, Number(item.maxScore || 100));
        const weight = Number(item.weight || 0);

        rawTotal += score;
        maxTotal += maxScore;
        weightedTotal += (score / maxScore) * weight;
      }

      const percentage = structureItems.length
        ? Number(weightedTotal.toFixed(2))
        : maxTotal
        ? Number(((rawTotal / maxTotal) * 100).toFixed(2))
        : 0;

      const matchedRule = gradeRules.find((rule) => {
        return percentage >= Number(rule.minScore) && percentage <= Number(rule.maxScore);
      });

      result[String(student.id)] = {
        rawTotal: Number(rawTotal.toFixed(2)),
        weightedTotal: Number(weightedTotal.toFixed(2)),
        percentage,
        grade: matchedRule?.grade,
        remark: matchedRule?.remark,
        gpa: matchedRule?.gpa,
      };
    }

    return result;
  }, [filteredStudentRows, structureItems, scores, gradeRules]);

  const completionStats = useMemo(() => {
    const expected = filteredStudentRows.length * structureItems.length;
    const entered = Object.values(scores).filter((value) => value !== "" && value !== undefined).length;
    const completion = expected ? Math.round((entered / expected) * 100) : 0;

    return { expected, entered, completion };
  }, [filteredStudentRows, structureItems, scores]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const updateScore = (studentId: number, item: AssessmentStructureItem, value: string) => {
    if (value === "") {
      setScores((prev) => ({ ...prev, [scoreKey(studentId, item.id)]: "" }));
      return;
    }

    const num = Number(value);
    if (Number.isNaN(num)) return;

    const sanitized = Math.max(0, Math.min(num, Number(item.maxScore || 100)));
    setScores((prev) => ({ ...prev, [scoreKey(studentId, item.id)]: sanitized }));
  };

  const startSession = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a branch first");
      return;
    }

    if (!currentClassSubject) {
      alert("Select class subject");
      return;
    }

    if (!applicability) {
      alert("No assessment applicability configured for this class subject");
      return;
    }

    if (!structureItems.length) {
      alert("The selected assessment structure has no active items");
      return;
    }

    if (!filteredStudentRows.length) {
      alert("No active student enrollment found for this class subject and period");
      return;
    }

    setSessionStarted(true);
  };

  const saveEntries = async () => {
    if (!sessionStarted) {
      alert("Start session first");
      return;
    }

    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a branch first");
      return;
    }

    if (!currentClassSubject || !applicability) {
      alert("Select a valid class subject with assessment applicability");
      return;
    }

    try {
      setSaving(true);

      const academicPeriodId = currentClassSubject.academicPeriodId || 0;
      const payload: AssessmentEntry[] = [];

      for (const { student } of filteredStudentRows) {
        const result = computedResults[String(student.id)];

        for (const item of structureItems) {
          const key = scoreKey(student.id, item.id);
          const score = scores[key];

          if (score === "" || score == null) continue;

          payload.push(
            prepareSyncData({
              accountId,
              schoolId,
              branchId,
              classSubjectId: currentClassSubject.id,
              organizationId: applicability.organizationId || selectedOption?.organizationId,
              academicStructureId: currentClassSubject.academicStructureId,
              academicPeriodId,
              gradingSystemId: applicability.gradingSystemId,
              assessmentStructureId: applicability.assessmentStructureId,
              assessmentStructureItemId: item.id || 0,
              studentId: student.id || 0,
              classId: currentClassSubject.classId,
              subjectId: currentClassSubject.subjectId,
              score: Number(score),
              grade: result?.grade,
              remark: result?.remark,
              published: false,
              locked: false,
              active: true,
            }) as AssessmentEntry
          );
        }
      }

      const existing = entries.filter((entry) => {
        if (entry.classSubjectId !== currentClassSubject.id) return false;
        if (entry.classId !== currentClassSubject.classId) return false;
        if (entry.subjectId !== currentClassSubject.subjectId) return false;
        if (entry.academicStructureId !== currentClassSubject.academicStructureId) return false;
        if (entry.academicPeriodId !== academicPeriodId) return false;
        if (entry.assessmentStructureId !== applicability.assessmentStructureId) return false;
        if (applicability.gradingSystemId && entry.gradingSystemId !== applicability.gradingSystemId) return false;
        return true;
      });

      for (const entry of existing) {
        if (!entry.id) continue;
        await db.assessmentEntries.delete(entry.id);
      }

      if (payload.length) {
        await db.assessmentEntries.bulkAdd(payload);
      }

      await load();
      alert("Scores saved successfully");
    } catch (error) {
      console.error("Failed to save entries:", error);
      alert("Failed to save scores");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="ae-page" style={{ "--ae-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ae-state-card">
          <div className="ae-spinner" />
          <h2>Opening assessment engine...</h2>
          <p>Checking account, branch, class subjects, applicability, and score records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="ae-page" style={{ "--ae-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ae-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before entering assessment scores.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ae-page" style={{ "--ae-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ae-state-card">
          <h2>Select a branch first</h2>
          <p>Assessment entries belong to one active school branch.</p>
          <button type="button" className="ae-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="ae-page" style={{ "--ae-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ae-hero">
        <div className="ae-hero-left">
          <div className="ae-hero-icon">📝</div>
          <div className="ae-title-wrap">
            <p>Score Entry</p>
            <h2>Assessment Entries</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="ae-hero-actions">
          <button type="button" className="ae-ghost-btn" onClick={load}>Refresh</button>
          <button type="button" className="ae-primary-btn" onClick={startSession}>{sessionStarted ? "Session Active" : "Start Session"}</button>
          <button type="button" className="ae-primary-btn" onClick={saveEntries} disabled={!sessionStarted || saving}>{saving ? "Saving..." : "Save Scores"}</button>
        </div>
      </section>

      <section className="ae-filter-card">
        <select
          value={classSubjectId}
          onChange={(event) => {
            setClassSubjectId(Number(event.target.value));
            setSessionStarted(false);
          }}
        >
          <option value={0}>Select Class Subject</option>
          {classSubjectOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.display}</option>
          ))}
        </select>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search student or admission number..."
        />
      </section>

      {selectedOption && (
        <section className="ae-context-card">
          <div className="ae-card-top">
            <div className="ae-context-main">
              <div className="ae-context-icon">📖</div>
              <div>
                <h3>{selectedOption.subjectName}</h3>
                <p>{selectedOption.className} · {selectedOption.academicStructureName} · {selectedOption.academicPeriodName}</p>
                <span>{selectedOption.curriculumName} · {selectedOption.pathwayName} · {selectedOption.teacherName}</span>
              </div>
            </div>
          </div>

          <div className="ae-chip-row">
            {applicability ? <Chip tone="green">Applicability Ready</Chip> : <Chip tone="red">No Applicability</Chip>}
            {assessmentStructure && <Chip tone="blue">{assessmentStructure.name}</Chip>}
            {gradingSystem && <Chip tone="purple">{gradingSystem.name}</Chip>}
            <Chip tone="gray">{organizationName}</Chip>
          </div>
        </section>
      )}

      {classSubjectId > 0 && !applicability && (
        <section className="ae-warning-card red">
          No active assessment applicability is configured for this class subject. Go to Assessment Applicability first.
        </section>
      )}

      {applicability && !structureItems.length && (
        <section className="ae-warning-card orange">
          The selected assessment structure has no active assessment items.
        </section>
      )}

      <section className="ae-summary-grid" aria-label="Score entry summary">
        <SummaryCard label="Students" value={filteredStudentRows.length} icon="🧑‍🎓" />
        <SummaryCard label="Items" value={structureItems.length} icon="🧩" />
        <SummaryCard label="Grade Rules" value={gradeRules.length} icon="🏅" />
        <SummaryCard label="Entered" value={completionStats.entered} icon="✍️" />
        <SummaryCard label="Completion" value={`${completionStats.completion}%`} icon="✅" />
      </section>

      {!classSubjectOptions.length && (
        <section className="ae-empty-card">
          <div className="ae-empty-icon">📖</div>
          <h3>No class subjects available</h3>
          <p>Create Class Subjects and Assessment Applicability before entering scores.</p>
        </section>
      )}

      {!sessionStarted && classSubjectOptions.length > 0 && (
        <section className="ae-empty-card compact">
          <div className="ae-empty-icon">▶️</div>
          <h3>Start a score entry session</h3>
          <p>Select a class subject, confirm applicability, then start the session to enter scores.</p>
        </section>
      )}

      {sessionStarted && (
        <section className="ae-score-shell">
          <div className="ae-score-head">
            <div>
              <h3>Score Entry</h3>
              <p>Scores are saved against ClassSubject, AssessmentStructureItem, student, class, subject and academic period.</p>
            </div>
            <Chip tone={completionStats.completion === 100 ? "green" : "orange"}>{completionStats.completion}% complete</Chip>
          </div>

          <div className="ae-table-scroll" aria-label="Scrollable score entry table">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  {structureItems.map((item) => (
                    <th key={item.id}>
                      {item.name}
                      <span>Max {item.maxScore} · {item.weight}%</span>
                    </th>
                  ))}
                  <th>Raw Total</th>
                  <th>% / Weighted</th>
                  <th>Grade</th>
                </tr>
              </thead>

              <tbody>
                {filteredStudentRows.map(({ student }) => {
                  const result = computedResults[String(student.id)];

                  return (
                    <tr key={student.id}>
                      <td className="ae-student-cell">
                        <strong>{student.fullName}</strong>
                        <span>{student.admissionNumber || "No admission number"}</span>
                      </td>

                      {structureItems.map((item) => (
                        <td key={item.id}>
                          <input
                            className="ae-score-input"
                            type="number"
                            min={0}
                            max={item.maxScore}
                            value={scores[scoreKey(student.id, item.id)] ?? ""}
                            onChange={(event) => updateScore(Number(student.id), item, event.target.value)}
                          />
                        </td>
                      ))}

                      <td className="ae-center strong">{result?.rawTotal ?? 0}</td>
                      <td className="ae-center strong">{result?.percentage ?? 0}%</td>
                      <td className="ae-center">
                        <Chip tone={result?.grade ? "green" : "gray"}>{result?.grade || "-"}</Chip>
                        {result?.remark && <span className="ae-remark">{result.remark}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filteredStudentRows.length && (
              <div className="ae-empty-table">No active students found for this class subject and period.</div>
            )}
          </div>
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
    <article className="ae-summary-card">
      <div className="ae-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ae-chip ${tone}`}>{children}</span>;
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes aeSpin {
  to { transform: rotate(360deg); }
}

.ae-page {
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

.ae-page *,
.ae-page *::before,
.ae-page *::after {
  box-sizing: border-box;
}

.ae-page button,
.ae-page input,
.ae-page select,
.ae-page textarea {
  font: inherit;
  max-width: 100%;
}

.ae-page input,
.ae-page select {
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

.ae-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.ae-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ae-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ae-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ae-primary) 18%, transparent);
  border-top-color: var(--ae-primary);
  animation: aeSpin .8s linear infinite;
}

.ae-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--ae-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.ae-primary-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.ae-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--ae-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.ae-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.ae-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--ae-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--ae-primary) 28%, transparent);
  font-size: 22px;
}

.ae-title-wrap {
  min-width: 0;
}

.ae-title-wrap p,
.ae-title-wrap h2,
.ae-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ae-title-wrap p {
  margin: 0 0 2px;
  color: var(--ae-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ae-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.ae-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.ae-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.ae-ghost-btn {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ae-filter-card,
.ae-context-card,
.ae-warning-card,
.ae-score-shell,
.ae-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
  overflow: hidden;
}

.ae-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
}

.ae-context-card,
.ae-warning-card,
.ae-score-shell {
  margin-top: 10px;
  padding: 13px;
}

.ae-warning-card {
  color: #7f1d1d;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.55;
}

.ae-warning-card.red {
  border-color: rgba(239, 68, 68, .18);
  background: rgba(239, 68, 68, .06);
}

.ae-warning-card.orange {
  color: #92400e;
  border-color: rgba(245, 158, 11, .18);
  background: rgba(245, 158, 11, .07);
}

.ae-card-top,
.ae-context-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.ae-context-main {
  flex: 1 1 auto;
}

.ae-context-main > div:last-child {
  min-width: 0;
}

.ae-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: color-mix(in srgb, var(--ae-primary) 12%, #fff);
}

.ae-context-main h3,
.ae-context-main p,
.ae-context-main span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ae-context-main h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.035em;
}

.ae-context-main p,
.ae-context-main span {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.ae-chip-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ae-chip {
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

.ae-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ae-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ae-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ae-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.ae-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ae-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.ae-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.ae-summary-card {
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

.ae-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--ae-primary) 12%, #fff);
}

.ae-summary-card div:last-child {
  min-width: 0;
}

.ae-summary-card strong,
.ae-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ae-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ae-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.ae-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  margin-top: 10px;
  padding: 22px;
  text-align: center;
  border-style: dashed;
}

.ae-empty-card.compact {
  min-height: 170px;
}

.ae-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--ae-primary) 12%, #fff);
  font-size: 28px;
}

.ae-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.ae-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ae-score-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.ae-score-head div {
  min-width: 0;
}

.ae-score-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ae-score-head p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.ae-table-scroll {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, .18);
}

.ae-table-scroll table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  background: #fff;
}

.ae-table-scroll th,
.ae-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  vertical-align: middle;
}

.ae-table-scroll th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #334155;
  text-align: center;
  font-size: 12px;
  font-weight: 1000;
  white-space: nowrap;
}

.ae-table-scroll th:first-child,
.ae-table-scroll td:first-child {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fff;
  text-align: left;
  min-width: 220px;
  max-width: 260px;
}

.ae-table-scroll th:first-child {
  z-index: 3;
  background: #f8fafc;
}

.ae-table-scroll th span,
.ae-student-cell span,
.ae-remark {
  display: block;
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.ae-student-cell strong {
  display: block;
  font-size: 13px;
  font-weight: 950;
}

.ae-score-input {
  width: 84px !important;
  min-height: 38px !important;
  border-radius: 12px !important;
  padding: 0 8px !important;
  text-align: center;
  font-weight: 900 !important;
}

.ae-center {
  text-align: center;
}

.ae-center.strong {
  font-weight: 950;
}

.ae-empty-table {
  padding: 22px;
  text-align: center;
  color: var(--muted, #64748b);
  font-weight: 850;
}

@media (min-width: 680px) {
  .ae-page {
    padding: 12px;
  }

  .ae-filter-card {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, .7fr);
  }

  .ae-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .ae-page {
    padding: 16px;
  }

  .ae-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .ae-page {
    padding: 6px;
  }

  .ae-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .ae-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .ae-ghost-btn,
  .ae-primary-btn {
    width: 100%;
  }

  .ae-summary-grid {
    gap: 6px;
  }

  .ae-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .ae-context-card,
  .ae-warning-card,
  .ae-score-shell,
  .ae-empty-card {
    border-radius: 20px;
    padding: 11px;
  }

  .ae-score-head {
    flex-direction: column;
  }

  .ae-table-scroll th:first-child,
  .ae-table-scroll td:first-child {
    min-width: 180px;
    max-width: 200px;
  }

  .ae-score-input {
    width: 74px !important;
  }
}
`;
