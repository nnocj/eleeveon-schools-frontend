"use client";

/**
 * AcademicProgress.tsx
 * -----------------------------------------------------
 * STUDENT ACADEMIC PROGRESS ENGINE
 *
 * PURPOSE:
 * Tracks and visualizes a student's academic performance
 * across their curriculum journey.
 *
 * CORE METRICS:
 * - GPA (computed / future engine hook)
 * - Credits earned vs required
 * - Completion percentage
 * - Failed courses
 * - Retake tracking (future engine)
 *
 * DATA SOURCES:
 * - StudentCurriculum
 * - CurriculumSubjects
 * - ComputedResults / Scores (future integration)
 *
 * NOTE:
 * This is NOT class-based. It is curriculum-driven.
 * -----------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Student,
  StudentCurriculum,
  CurriculumSubject,
  Subject,
  ComputedResult,
} from "../lib/db";

import { useSettings } from "../context/settings-context";

// ======================================================
// COMPONENT
// ======================================================

export default function AcademicProgress() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;

  // ======================================================
  // STATE
  // ======================================================

  const [students, setStudents] = useState<Student[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [results, setResults] = useState<ComputedResult[]>([]);

  const [loading, setLoading] = useState(true);

  // ======================================================
  // FILTER
  // ======================================================

  const [studentId, setStudentId] = useState<number | "">("");

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [
      st,
      sc,
      cs,
      sub,
      res,
    ] = await Promise.all([
      db.students.toArray(),
      db.studentCurriculums.toArray(),
      db.curriculumSubjects.toArray(),
      db.subjects.toArray(),
      db.computedResults.toArray(),
    ]);

    setStudents(st.filter(x => !x.isDeleted));
    setStudentCurriculums(sc.filter(x => !x.isDeleted));
    setCurriculumSubjects(cs.filter(x => !x.isDeleted));
    setSubjects(sub.filter(x => !x.isDeleted));
    setResults(res.filter(x => !x.isDeleted));

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const subjectMap = useMemo(() => {
    return new Map(subjects.map(s => [s.id, s.name]));
  }, [subjects]);

  // ======================================================
  // ACTIVE CURRICULUM
  // ======================================================

  const activeCurriculum = useMemo(() => {
    if (!studentId) return null;

    return studentCurriculums.find(
      sc => sc.studentId === Number(studentId) && sc.active && !sc.isDeleted
    );
  }, [studentId, studentCurriculums]);

  // ======================================================
  // CURRICULUM TOTAL REQUIREMENTS
  // ======================================================

  const curriculumStats = useMemo(() => {
    if (!activeCurriculum) return null;

    const subjectsInCurriculum = curriculumSubjects.filter(
      cs =>
        cs.curriculumId === activeCurriculum.curriculumId &&
        !cs.isDeleted
    );

    const totalCredits = subjectsInCurriculum.reduce(
      (sum, s) => sum + (s.credits || 0),
      0
    );

    return {
      totalSubjects: subjectsInCurriculum.length,
      totalCredits,
    };
  }, [activeCurriculum, curriculumSubjects]);

  // ======================================================
  // STUDENT PERFORMANCE (MOCKABLE ENGINE READY)
  // ======================================================

  const studentResults = useMemo(() => {
    if (!studentId) return [];

    return results.filter(r => r.studentId === Number(studentId));
  }, [results, studentId]);

  const passed = studentResults.filter(r => (r.average || 0) >= 50);
  const failed = studentResults.filter(r => (r.average || 0) < 50);

  // ======================================================
  // CALCULATIONS (ENGINE READY PLACEHOLDERS)
  // ======================================================

  const totalCreditsEarned = passed.reduce((sum, r) => sum + 3, 0); // placeholder
  const completion =
    curriculumStats?.totalCredits
      ? (totalCreditsEarned / curriculumStats.totalCredits) * 100
      : 0;

  const gpa = useMemo(() => {
    if (studentResults.length === 0) return 0;

    const total = studentResults.reduce((sum, r) => sum + (r.gpa || 0), 0);
    return total / studentResults.length;
  }, [studentResults]);

  // ======================================================
  // STYLES
  // ======================================================

  const container: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "var(--surface)",
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  const statBox: React.CSSProperties = {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    background: "rgba(0,0,0,0.03)",
  };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return <div style={container}>Loading academic progress...</div>;
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={{ marginBottom: 15 }}>
        <h2 style={{ margin: 0 }}>Academic Progress</h2>
        <p style={{ margin: 0, opacity: 0.6 }}>
          GPA • Credits • Completion • Performance Tracking
        </p>
      </div>

      {/* STUDENT SELECT */}
      <select
        style={{ ...input, width: 300, marginBottom: 15 }}
        value={studentId}
        onChange={(e) => setStudentId(Number(e.target.value))}
      >
        <option value="">Select Student</option>
        {students.map(s => (
          <option key={s.id} value={s.id}>
            {s.fullName}
          </option>
        ))}
      </select>

      {/* STATS */}
      {studentId && (
        <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>

          <div style={statBox}>
            <b>GPA</b>
            <div>{gpa.toFixed(2)}</div>
          </div>

          <div style={statBox}>
            <b>Completion</b>
            <div>{completion.toFixed(1)}%</div>
          </div>

          <div style={statBox}>
            <b>Passed</b>
            <div>{passed.length}</div>
          </div>

          <div style={statBox}>
            <b>Failed</b>
            <div>{failed.length}</div>
          </div>

        </div>
      )}

      {/* DETAILS */}
      {studentId && (
        <div style={card}>

          <h4 style={{ marginTop: 0 }}>Performance Breakdown</h4>

          {studentResults.length === 0 && (
            <p style={{ opacity: 0.6 }}>
              No results available yet
            </p>
          )}

          {studentResults.map(r => (
            <div
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid rgba(0,0,0,0.05)",
              }}
            >
              <div>
                {subjectMap.get(r.subjectId) || "Unknown Subject"}
              </div>

              <div>
                <b>{r.average?.toFixed(1) || 0}</b>{" "}
                <span style={{ opacity: 0.6 }}>
                  ({r.grade})
                </span>
              </div>
            </div>
          ))}

        </div>
      )}

      {/* CURRICULUM INFO */}
      {curriculumStats && (
        <div style={card}>
          <b>Curriculum Requirements</b>

          <div style={{ marginTop: 8 }}>
            Subjects: {curriculumStats.totalSubjects} <br />
            Credits Required: {curriculumStats.totalCredits}
          </div>
        </div>
      )}

    </div>
  );
}