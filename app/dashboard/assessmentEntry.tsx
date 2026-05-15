"use client";

/**
 * AssessmentEntries.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL CLASS-SUBJECT ASSESSMENT ENTRY ENGINE
 * ---------------------------------------------------------
 *
 * DB-safe rewrite for current db.ts.
 *
 * Source of truth:
 * ClassSubject -> AssessmentApplicability -> AssessmentStructureItems -> AssessmentEntry
 *
 * Important DB notes:
 * - Uses active school/branch context.
 * - ClassSubject is the academic delivery context.
 * - AssessmentApplicability activates a structure/grading system for a ClassSubject.
 * - AssessmentEntry does NOT have assessmentApplicabilityId.
 * - StudentEnrollment requires academicStructureId + academicPeriodId + status.
 */

import React, { useEffect, useMemo, useState } from "react";

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
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

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

const toNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const scoreKey = (studentId?: number, itemId?: number) => `${studentId || 0}-${itemId || 0}`;

// ======================================================
// COMPONENT
// ======================================================

export default function AssessmentEntriesPage() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const schoolId = settings?.schoolId || activeSchool?.id;
  const primary = settings?.primaryColor || "var(--primary-color)";

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
  // LOAD DATA
  // ======================================================

  const load = async () => {
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
        studentRows.filter(row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn")
      );
      setClasses(classRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setSubjects(subjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setTeachers(teacherRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAcademicStructures(academicStructureRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setPeriods(periodRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setOrganizations(organizationRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setCurriculums(curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setPathways(pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setCurriculumSubjects(curriculumSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setClassSubjects(
        classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setApplicabilities(
        applicabilityRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setStructures(
        structureRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setItems(itemRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false));
      setEntries(entryRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setGradings(
        gradingRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setRules(ruleRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false));
      setEnrollments(enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted));
    } catch (error) {
      console.error("Failed to load assessment entries:", error);
      alert("Failed to load assessment entries");
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

  const classMap = useMemo(() => new Map(classes.map(row => [row.id, row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map(row => [row.id, row])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map(row => [row.id, row])), [teachers]);
  const structureMap = useMemo(
    () => new Map(academicStructures.map(row => [row.id, row])),
    [academicStructures]
  );
  const periodMap = useMemo(() => new Map(periods.map(row => [row.id, row])), [periods]);
  const orgMap = useMemo(() => new Map(organizations.map(row => [row.id, row])), [organizations]);
  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map(row => [row.id, row])),
    [curriculumSubjects]
  );
  const curriculumMap = useMemo(() => new Map(curriculums.map(row => [row.id, row])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map(row => [row.id, row])), [pathways]);

  // ======================================================
  // CLASS SUBJECT OPTIONS
  // ======================================================

  const classSubjectOptions = useMemo<ClassSubjectOption[]>(() => {
    return classSubjects
      .map(row => {
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
      .filter(option => option.id > 0)
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
    return classSubjectOptions.find(option => option.id === classSubjectId);
  }, [classSubjectOptions, classSubjectId]);

  const currentClassSubject = selectedOption?.row;

  // ======================================================
  // APPLICABILITY / STRUCTURE / GRADING
  // ======================================================

  const applicability = useMemo(() => {
    if (!classSubjectId) return undefined;

    return applicabilities.find(row => row.classSubjectId === classSubjectId && row.active !== false);
  }, [applicabilities, classSubjectId]);

  const assessmentStructure = useMemo(() => {
    if (!applicability?.assessmentStructureId) return undefined;
    return structures.find(row => row.id === applicability.assessmentStructureId);
  }, [structures, applicability]);

  const structureItems = useMemo(() => {
    if (!applicability?.assessmentStructureId) return [];

    return items
      .filter(row => row.assessmentStructureId === applicability.assessmentStructureId && row.active !== false)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [items, applicability]);

  const gradingSystem = useMemo(() => {
    if (!applicability?.gradingSystemId) return undefined;
    return gradings.find(row => row.id === applicability.gradingSystemId);
  }, [gradings, applicability]);

  const gradeRules = useMemo(() => {
    if (!gradingSystem?.id) return [];

    return rules
      .filter(row => row.gradingSystemId === gradingSystem.id && row.active !== false)
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
      .map(student => {
        const enrollment = enrollments.find(row => {
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
      .filter(entry => {
        if (entry.classSubjectId !== currentClassSubject.id) return false;
        if (entry.classId !== currentClassSubject.classId) return false;
        if (entry.subjectId !== currentClassSubject.subjectId) return false;
        if (entry.academicStructureId !== currentClassSubject.academicStructureId) return false;
        if (entry.academicPeriodId !== (currentClassSubject.academicPeriodId || 0)) return false;
        if (entry.assessmentStructureId !== applicability.assessmentStructureId) return false;
        if (applicability.gradingSystemId && entry.gradingSystemId !== applicability.gradingSystemId) return false;
        return true;
      })
      .forEach(entry => {
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

      const matchedRule = gradeRules.find(rule => {
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
    const entered = Object.values(scores).filter(value => value !== "" && value !== undefined).length;
    const completion = expected ? Math.round((entered / expected) * 100) : 0;

    return { expected, entered, completion };
  }, [filteredStudentRows, structureItems, scores]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const updateScore = (studentId: number, item: AssessmentStructureItem, value: string) => {
    if (value === "") {
      setScores(prev => ({ ...prev, [scoreKey(studentId, item.id)]: "" }));
      return;
    }

    const num = Number(value);
    if (Number.isNaN(num)) return;

    const sanitized = Math.max(0, Math.min(num, Number(item.maxScore || 100)));

    setScores(prev => ({ ...prev, [scoreKey(studentId, item.id)]: sanitized }));
  };

  const startSession = () => {
    if (!activeBranchId) {
      alert("Select a branch first");
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

      const existing = entries.filter(entry => {
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

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading assessment engine...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Assessment entries belong to a branch. Select a school and branch first.
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
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Assessment Entries</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Entering assessment scores in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={ghostButton} onClick={load} type="button">
            Refresh
          </button>
          <button style={button} onClick={startSession} type="button">
            {sessionStarted ? "Session Active" : "Start Session"}
          </button>
          <button
            style={{ ...button, opacity: !sessionStarted || saving ? 0.6 : 1 }}
            onClick={saveEntries}
            disabled={!sessionStarted || saving}
            type="button"
          >
            {saving ? "Saving..." : "Save Scores"}
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
          gap: 12,
        }}
      >
        <select
          style={input}
          value={classSubjectId}
          onChange={e => {
            setClassSubjectId(Number(e.target.value));
            setSessionStarted(false);
          }}
        >
          <option value={0}>Select Class Subject</option>
          {classSubjectOptions.map(option => (
            <option key={option.id} value={option.id}>
              {option.display}
            </option>
          ))}
        </select>

        <input
          style={input}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student or admission number..."
        />
      </div>

      {/* SELECTED CONTEXT */}
      {selectedOption && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{selectedOption.subjectName}</h3>
              <div style={{ marginTop: 6, opacity: 0.68, fontSize: 13 }}>
                {selectedOption.className} • {selectedOption.academicStructureName} • {selectedOption.academicPeriodName}
              </div>
              <div style={{ marginTop: 6, opacity: 0.68, fontSize: 13 }}>
                {selectedOption.curriculumName} • {selectedOption.pathwayName} • {selectedOption.teacherName}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {applicability ? <span style={badge("green")}>Applicability Ready</span> : <span style={badge("red")}>No Applicability</span>}
              {assessmentStructure && <span style={badge("blue")}>{assessmentStructure.name}</span>}
              {gradingSystem && <span style={badge("purple")}>{gradingSystem.name}</span>}
              <span style={badge("gray")}>{organizationName}</span>
            </div>
          </div>
        </div>
      )}

      {/* WARNINGS */}
      {classSubjectId > 0 && !applicability && (
        <div
          style={{
            ...card,
            marginTop: 16,
            border: "1px solid rgba(239,68,68,0.18)",
            background: "rgba(239,68,68,0.06)",
          }}
        >
          No active assessment applicability is configured for this class subject. Go to Assessment Applicability first.
        </div>
      )}

      {applicability && !structureItems.length && (
        <div
          style={{
            ...card,
            marginTop: 16,
            border: "1px solid rgba(245,158,11,0.18)",
            background: "rgba(245,158,11,0.07)",
          }}
        >
          The selected assessment structure has no active assessment items.
        </div>
      )}

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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{filteredStudentRows.length}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Assessment Items</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{structureItems.length}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Grade Rules</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{gradeRules.length}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Entered Scores</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{completionStats.entered}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Completion</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{completionStats.completion}%</div>
        </div>
      </div>

      {/* SCORE GRID */}
      {sessionStarted && (
        <div style={{ ...card, marginTop: 20, overflowX: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Score Entry</h3>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Scores are saved against ClassSubject, AssessmentStructureItem, student, class, subject and academic period.
              </div>
            </div>

            <span style={badge(completionStats.completion === 100 ? "green" : "orange")}>
              {completionStats.completion}% complete
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  Student
                </th>
                {structureItems.map(item => (
                  <th key={item.id} style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)", textAlign: "center" }}>
                    {item.name}
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                      Max {item.maxScore} • {item.weight}%
                    </div>
                  </th>
                ))}
                <th style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)", textAlign: "center" }}>
                  Raw Total
                </th>
                <th style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)", textAlign: "center" }}>
                  % / Weighted
                </th>
                <th style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)", textAlign: "center" }}>
                  Grade
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredStudentRows.map(({ student }) => {
                const result = computedResults[String(student.id)];

                return (
                  <tr key={student.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.04)", minWidth: 220 }}>
                      <div style={{ fontWeight: 850 }}>{student.fullName}</div>
                      <div style={{ marginTop: 3, opacity: 0.62, fontSize: 12 }}>
                        {student.admissionNumber || "No admission number"}
                      </div>
                    </td>

                    {structureItems.map(item => (
                      <td key={item.id} style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.04)", textAlign: "center" }}>
                        <input
                          style={{
                            width: 90,
                            padding: 9,
                            borderRadius: 12,
                            border: "1px solid rgba(0,0,0,0.16)",
                            outline: "none",
                            background: "var(--surface)",
                            color: "var(--text)",
                            textAlign: "center",
                            fontWeight: 800,
                          }}
                          type="number"
                          min={0}
                          max={item.maxScore}
                          value={scores[scoreKey(student.id, item.id)] ?? ""}
                          onChange={e => updateScore(Number(student.id), item, e.target.value)}
                        />
                      </td>
                    ))}

                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.04)", textAlign: "center", fontWeight: 850 }}>
                      {result?.rawTotal ?? 0}
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.04)", textAlign: "center", fontWeight: 850 }}>
                      {result?.percentage ?? 0}%
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.04)", textAlign: "center", fontWeight: 850 }}>
                      <span style={badge(result?.grade ? "green" : "gray")}>
                        {result?.grade || "-"}
                      </span>
                      {result?.remark && (
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{result.remark}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredStudentRows.length && (
            <div style={{ textAlign: "center", padding: 24, opacity: 0.72 }}>
              No active students found for this class subject and period.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
