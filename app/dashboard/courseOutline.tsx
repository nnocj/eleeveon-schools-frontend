"use client";

/**
 * CourseOutline.tsx
 * -----------------------------------------------------
 * STUDENT ACADEMIC COURSE OUTLINE ENGINE
 *
 * This is a student-facing academic map generated from:
 * - Student Curriculum assignment
 * - Curriculum Subjects configuration
 * - Academic Period structure
 * - Subject Offerings (runtime delivery layer)
 *
 * It replaces static class-based subject views with a dynamic
 * curriculum-driven academic plan.
 *
 * CORE PURPOSE:
 * - Show what student SHOULD take per period
 * - Show progression structure (future-ready)
 * - Provide foundation for registration, transcripts, and audits
 * -----------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Student,
  StudentCurriculum,
  Curriculum,
  CurriculumSubject,
  Subject,
  AcademicPeriod,
} from "../lib/db";

import { useSettings } from "../context/settings-context";

// ======================================================
// COMPONENT
// ======================================================

export default function CourseOutline() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;

  // ======================================================
  // STATE
  // ======================================================

  const [students, setStudents] = useState<Student[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);

  const [loading, setLoading] = useState(true);

  // ======================================================
  // FILTER STATE (ADMIN/VIEW MODE)
  // ======================================================

  const [selectedStudentId, setSelectedStudentId] = useState<number | "">("");

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [
      st,
      sc,
      c,
      cs,
      sub,
      p,
    ] = await Promise.all([
      db.students.toArray(),
      db.studentCurriculums.toArray(),
      db.curriculums.toArray(),
      db.curriculumSubjects.toArray(),
      db.subjects.toArray(),
      db.academicPeriods.toArray(),
    ]);

    setStudents(st.filter(x => !x.isDeleted));
    setStudentCurriculums(sc.filter(x => !x.isDeleted));
    setCurriculums(c.filter(x => !x.isDeleted));
    setCurriculumSubjects(cs.filter(x => !x.isDeleted));
    setSubjects(sub.filter(x => !x.isDeleted));
    setPeriods(p.filter(x => !x.isDeleted));

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const studentMap = useMemo(() => {
    return new Map(students.map(s => [s.id, s.fullName]));
  }, [students]);

  const curriculumMap = useMemo(() => {
    return new Map(curriculums.map(c => [c.id, c.name]));
  }, [curriculums]);

  const subjectMap = useMemo(() => {
    return new Map(subjects.map(s => [s.id, s.name]));
  }, [subjects]);

  const periodMap = useMemo(() => {
    return new Map(periods.map(p => [p.id, p.name]));
  }, [periods]);

  // ======================================================
  // SELECTED STUDENT CONTEXT
  // ======================================================

  const activeStudentCurriculum = useMemo(() => {
    if (!selectedStudentId) return null;

    return studentCurriculums.find(
      sc =>
        sc.studentId === Number(selectedStudentId) &&
        sc.active &&
        !sc.isDeleted
    );
  }, [selectedStudentId, studentCurriculums]);

  // ======================================================
  // GENERATED OUTLINE
  // ======================================================

  const outline = useMemo(() => {
    if (!activeStudentCurriculum) return [];

    const curriculumId = activeStudentCurriculum.curriculumId;

    const rows = curriculumSubjects.filter(cs =>
      cs.curriculumId === curriculumId && !cs.isDeleted
    );

    // group by academic period
    const grouped: Record<string, CurriculumSubject[]> = {};

    rows.forEach(r => {
      const key = String(r.academicPeriodId || "unassigned");

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });

    return Object.entries(grouped).sort((a, b) => {
      const pa = periods.find(p => String(p.id) === a[0])?.order || 0;
      const pb = periods.find(p => String(p.id) === b[0])?.order || 0;
      return pa - pb;
    });
  }, [activeStudentCurriculum, curriculumSubjects, periods]);

  // ======================================================
  // STYLES (CONSISTENT DESIGN SYSTEM)
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

  const headerBox: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const primary: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  };

  const pill: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 20,
    background: "rgba(0,0,0,0.06)",
    display: "inline-block",
    marginLeft: 6,
  };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return <div style={container}>Loading course outline...</div>;
  }

  // ======================================================
  // EMPTY STATE
  // ======================================================

  if (!selectedStudentId) {
    return (
      <div style={container}>
        <div style={headerBox}>
          <div>
            <h2 style={{ margin: 0 }}>Course Outline</h2>
            <p style={{ margin: 0, opacity: 0.6 }}>
              Student curriculum progression view
            </p>
          </div>
        </div>

        <div style={{ ...card, marginTop: 20 }}>
          <p>Select a student to generate academic outline</p>

          <select
            style={input}
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(Number(e.target.value))}
          >
            <option value="">Select Student</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={headerBox}>
        <div>
          <h2 style={{ margin: 0 }}>Course Outline</h2>
          <p style={{ margin: 0, opacity: 0.6 }}>
            {studentMap.get(Number(selectedStudentId))} •{" "}
            {activeStudentCurriculum
              ? curriculumMap.get(activeStudentCurriculum.curriculumId)
              : "No curriculum assigned"}
          </p>
        </div>

        <select
          style={input}
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(Number(e.target.value))}
        >
          {students.map(s => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
      </div>

      {/* OUTLINE */}
      <div style={{ marginTop: 20 }}>
        {outline.length === 0 && (
          <div style={card}>
            No curriculum structure found for this student
          </div>
        )}

        {outline.map(([periodId, items]) => (
          <div key={periodId} style={card}>

            <h4 style={{ marginBottom: 10 }}>
              {periodMap.get(Number(periodId)) || "Unassigned Period"}
            </h4>

            {items.map(item => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid rgba(0,0,0,0.05)",
                }}
              >
                <div>
                  {subjectMap.get(item.subjectId)}
                  <span style={pill}>
                    {item.type || "core"}
                  </span>
                </div>

                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  Credits: {item.credits || "-"} | Pass:{" "}
                  {item.minimumPassScore || "N/A"}
                </div>
              </div>
            ))}

          </div>
        ))}
      </div>

    </div>
  );
}