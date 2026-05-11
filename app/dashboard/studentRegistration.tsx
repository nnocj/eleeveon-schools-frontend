"use client";

/**
 * StudentRegistration.tsx
 * -----------------------------------------------------
 * ACADEMIC REGISTRATION ENGINE (TERTIARY + ADVANCED SHS)
 *
 * PURPOSE:
 * Allows students to register for academic periods
 * based on:
 * - CurriculumSubjects configuration
 * - AcademicPeriods structure
 * - Subject Offerings (runtime delivery)
 *
 * FEATURES:
 * - Semester registration
 * - Add / Drop subjects
 * - Elective selection
 * - Core subject enforcement (future engine hook)
 * - Prerequisite validation hook (future engine)
 *
 * IMPORTANT:
 * This replaces class-based registration systems.
 * Everything is now curriculum-driven.
 * -----------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Student,
  StudentCurriculum,
  CurriculumSubject,
  Subject,
  AcademicPeriod,
  SubjectOffering,
} from "../lib/db";

import { useSettings } from "../context/settings-context";

// ======================================================
// COMPONENT
// ======================================================

export default function StudentRegistration() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;

  // ======================================================
  // STATE
  // ======================================================

  const [students, setStudents] = useState<Student[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [offerings, setOfferings] = useState<SubjectOffering[]>([]);

  const [loading, setLoading] = useState(true);

  // ======================================================
  // UI STATE
  // ======================================================

  const [studentId, setStudentId] = useState<number | "">("");
  const [periodId, setPeriodId] = useState<number | "">("");

  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);

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
      p,
      so,
    ] = await Promise.all([
      db.students.toArray(),
      db.studentCurriculums.toArray(),
      db.curriculumSubjects.toArray(),
      db.subjects.toArray(),
      db.academicPeriods.toArray(),
      db.subjectOfferings.toArray(),
    ]);

    setStudents(st.filter(x => !x.isDeleted));
    setStudentCurriculums(sc.filter(x => !x.isDeleted));
    setCurriculumSubjects(cs.filter(x => !x.isDeleted));
    setSubjects(sub.filter(x => !x.isDeleted));
    setPeriods(p.filter(x => !x.isDeleted));
    setOfferings(so.filter(x => !x.isDeleted));

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
  // AVAILABLE SUBJECTS (CURRICULUM + PERIOD)
  // ======================================================

  const availableSubjects = useMemo(() => {
    if (!activeCurriculum || !periodId) return [];

    return curriculumSubjects.filter(cs =>
      cs.curriculumId === activeCurriculum.curriculumId &&
      (!cs.academicPeriodId || cs.academicPeriodId === Number(periodId)) &&
      !cs.isDeleted
    );
  }, [activeCurriculum, periodId, curriculumSubjects]);

  // ======================================================
  // TOGGLE SUBJECT
  // ======================================================

  const toggleSubject = (id: number) => {
    setSelectedSubjects(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  };

  // ======================================================
  // SAVE REGISTRATION
  // ======================================================

  const saveRegistration = async () => {
    if (!studentId || !periodId) {
      alert("Select student and period");
      return;
    }

    if (selectedSubjects.length === 0) {
      alert("No subjects selected");
      return;
    }

    // NOTE:
    // This is intentionally lightweight.
    // Real engine later will enforce:
    // - prerequisites
    // - credit limits
    // - core requirements

    const payload = selectedSubjects.map(subjectId => ({
      branchId,
      studentId: Number(studentId),
      academicPeriodId: Number(periodId),
      subjectId,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      deviceId: "local",
      synced: "pending",
    }));

    await db.subjectOfferings.bulkAdd(payload as any);

    alert("Registration saved");

    setSelectedSubjects([]);
  };

  // ======================================================
  // STYLES (CONSISTENT SYSTEM)
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

  const primary: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  };

  const checkboxRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
  };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return <div style={container}>Loading registration...</div>;
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={{ marginBottom: 15 }}>
        <h2 style={{ margin: 0 }}>Student Registration</h2>
        <p style={{ margin: 0, opacity: 0.6 }}>
          Curriculum-based semester registration engine
        </p>
      </div>

      {/* SELECTORS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>

        <select
          style={input}
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

        <select
          style={input}
          value={periodId}
          onChange={(e) => setPeriodId(Number(e.target.value))}
        >
          <option value="">Select Period</option>
          {periods.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button style={primary} onClick={saveRegistration}>
          Save Registration
        </button>
      </div>

      {/* CURRICULUM INFO */}
      {activeCurriculum && (
        <div style={card}>
          <b>Curriculum:</b>{" "}
          {activeCurriculum.curriculumId}
        </div>
      )}

      {/* AVAILABLE SUBJECTS */}
      <div style={card}>
        <h4 style={{ marginTop: 0 }}>Available Subjects</h4>

        {availableSubjects.length === 0 && (
          <p style={{ opacity: 0.6 }}>No subjects available</p>
        )}

        {availableSubjects.map(cs => (
          <div key={cs.id} style={checkboxRow}>
            <label>
              <input
                type="checkbox"
                checked={selectedSubjects.includes(cs.subjectId)}
                onChange={() => toggleSubject(cs.subjectId)}
              />
              {" "}
              {subjectMap.get(cs.subjectId) || "Unknown Subject"}
            </label>

            <span style={{ fontSize: 12, opacity: 0.6 }}>
              {cs.type || "core"}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}