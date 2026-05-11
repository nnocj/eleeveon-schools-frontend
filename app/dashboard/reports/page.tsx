"use client";

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Student,
  Class,
  Subject,
  AcademicPeriod,
  AssessmentEntry,
  AssessmentStructureItem,
  AssessmentStructure,
  GradingSystem,
} from "../../lib/db";

import { useSettings } from "../../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type ScoreMap = Record<string, number>;

// ======================================================
// COMPONENT
// ======================================================

export default function ReportPage({
  navigate,
}: {
  navigate?: (tab: string) => void;
}) {
  const { settings } = useSettings();

  const primary =
    settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [structures, setStructures] = useState<AssessmentStructure[]>([]);
  const [grading, setGrading] = useState<GradingSystem[]>([]);

  // ======================================================
  // FILTERS
  // ======================================================

  const [classId, setClassId] = useState<number>(0);
  const [subjectId, setSubjectId] = useState<number>(0);
  const [periodId, setPeriodId] = useState<number>(0);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [
        classData,
        subjectData,
        studentData,
        periodData,
        entryData,
        itemData,
        structureData,
        gradingData,
      ] = await Promise.all([
        db.classes.toArray(),
        db.subjects.toArray(),
        db.students.toArray(),
        db.academicPeriods.toArray(),
        db.assessmentEntries.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentStructures.toArray(),
        db.gradingSystems.toArray(),
      ]);

      setClasses(classData.filter(x => !x.isDeleted));
      setSubjects(subjectData.filter(x => !x.isDeleted));
      setStudents(studentData.filter(x => !x.isDeleted));
      setPeriods(periodData.filter(x => !x.isDeleted));
      setEntries(entryData.filter(x => !x.isDeleted));
      setItems(itemData.filter(x => !x.isDeleted));
      setStructures(structureData.filter(x => !x.isDeleted));
      setGrading(gradingData.filter(x => !x.isDeleted));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // FILTERED STUDENTS
  // ======================================================

  const filteredStudents = useMemo(() => {
    if (!classId) return [];

    return students.filter(
      s => Number(s.currentClassId) === Number(classId)
    );
  }, [students, classId]);

  // ======================================================
  // FILTERED ENTRIES
  // ======================================================

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      return (
        Number(e.classId) === Number(classId) &&
        Number(e.subjectId) === Number(subjectId) &&
        Number(e.academicPeriodId) === Number(periodId)
      );
    });
  }, [entries, classId, subjectId, periodId]);

  // ======================================================
  // SCORE MAP
  // ======================================================

  const scoreMap = useMemo(() => {
    const map: Record<number, number> = {};

    for (const e of filteredEntries) {
      if (!map[e.studentId]) {
        map[e.studentId] = 0;
      }

      map[e.studentId] += Number(e.score || 0);
    }

    return map;
  }, [filteredEntries]);

  // ======================================================
  // TOTAL ITEMS
  // ======================================================

  const totalItems = useMemo(() => {
    return items.length;
  }, [items]);

  // ======================================================
  // DASHBOARD TAB NAVIGATION
  // ======================================================

  const goToTranscript = () => {
    navigate?.("transcript");
  };

  const goToCumulative = () => {
    navigate?.("cumulativeReports");
  };

  // ======================================================
  // UI
  // ======================================================

  if (loading) {
    return <div style={{ padding: 20 }}>Loading report...</div>;
  }

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>

      {/* HEADER */}
      <h2>Academic Report Dashboard</h2>

      {/* DASHBOARD TABS (NO ROUTING) */}
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button
          onClick={goToTranscript}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            background: primary,
            color: "#fff",
          }}
        >
          Transcript
        </button>

        <button
          onClick={goToCumulative}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "transparent",
            color: "var(--text)",
          }}
        >
          Cumulative Reports
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          marginTop: 20,
        }}
      >
        <select
          value={classId}
          onChange={e => setClassId(Number(e.target.value))}
        >
          <option value={0}>Select Class</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={subjectId}
          onChange={e => setSubjectId(Number(e.target.value))}
        >
          <option value={0}>Select Subject</option>
          {subjects.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={periodId}
          onChange={e => setPeriodId(Number(e.target.value))}
        >
          <option value={0}>Select Period</option>
          {periods.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* TABLE */}
      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 900 }}>
          <thead>
            <tr>
              <th>Student</th>
              <th>Total Score</th>
              <th>Average</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredStudents.map(s => {
              const total = scoreMap[s.id!] || 0;

              const average =
                totalItems > 0
                  ? (total / totalItems).toFixed(2)
                  : "0";

              const status =
                Number(average) >= 50 ? "PASS" : "FAIL";

              return (
                <tr key={s.id}>
                  <td>{s.fullName}</td>
                  <td>{total}</td>
                  <td>{average}</td>

                  <td
                    style={{
                      fontWeight: 700,
                      color: status === "PASS" ? "green" : "red",
                    }}
                  >
                    {status}
                  </td>

                  <td style={{ fontSize: 12, opacity: 0.7 }}>
                    Use top tabs
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}