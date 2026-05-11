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
} from "../../lib/db";

import { useSettings } from "../../context/settings-context";

// ======================================================
// COMPONENT
// ======================================================

export default function CumulativeReportsPage() {
  const { settings } = useSettings();

  const primary =
    settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [structures, setStructures] = useState<AssessmentStructure[]>([]);

  // ======================================================
  // FILTERS
  // ======================================================

  const [classId, setClassId] = useState<number>(0);
  const [subjectId, setSubjectId] = useState<number>(0);

  // ======================================================
  // LOAD (GLOBAL — NO BRANCH FILTERING)
// ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [
        st,
        cl,
        sb,
        pr,
        en,
        it,
        str,
      ] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicPeriods.toArray(),
        db.assessmentEntries.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentStructures.toArray(),
      ]);

      setStudents(st.filter(x => !x.isDeleted));
      setClasses(cl.filter(x => !x.isDeleted));
      setSubjects(sb.filter(x => !x.isDeleted));
      setPeriods(pr.filter(x => !x.isDeleted));
      setEntries(en.filter(x => !x.isDeleted));
      setItems(it.filter(x => !x.isDeleted));
      setStructures(str.filter(x => !x.isDeleted));
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
  // FILTER STUDENTS
  // ======================================================

  const filteredStudents = useMemo(() => {
    if (!classId) return [];

    return students.filter(
      s => Number(s.currentClassId) === Number(classId)
    );
  }, [students, classId]);

  // ======================================================
  // FILTER ENTRIES (ALL PERIODS INCLUDED → CUMULATIVE)
// ======================================================

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      return (
        Number(e.classId) === Number(classId) &&
        Number(e.subjectId) === Number(subjectId)
      );
    });
  }, [entries, classId, subjectId]);

  // ======================================================
  // GROUP BY STUDENT (CUMULATIVE TOTAL)
// ======================================================

  const cumulativeMap = useMemo(() => {
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
  // PERIOD COUNT (FOR AVERAGE NORMALIZATION)
// ======================================================

  const periodCount = useMemo(() => {
    const unique = new Set(
      filteredEntries.map(e => e.academicPeriodId)
    );

    return unique.size || 1;
  }, [filteredEntries]);

  // ======================================================
  // UI
  // ======================================================

  if (loading) {
    return <div style={{ padding: 20 }}>Loading cumulative report...</div>;
  }

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>

      {/* HEADER */}
      <h2>Cumulative Academic Report</h2>

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
      </div>

      {/* TABLE */}
      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 700 }}>
          <thead>
            <tr>
              <th>Student</th>
              <th>Cumulative Total</th>
              <th>Average</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {filteredStudents.map(s => {
              const total = cumulativeMap[s.id!] || 0;

              const average =
                periodCount > 0
                  ? (total / periodCount).toFixed(2)
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
                      color:
                        status === "PASS"
                          ? "green"
                          : "red",
                    }}
                  >
                    {status}
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