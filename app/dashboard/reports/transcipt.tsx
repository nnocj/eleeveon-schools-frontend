"use client";

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Student,
  Subject,
  AssessmentEntry,
  AssessmentStructureItem,
} from "../../lib/db";

import { useSettings } from "../../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type SubjectRow = {
  subjectId: number;
  subjectName: string;
  scores: Record<number, number>;
  total: number;
  average: number;
  grade: string;
  remark: string;
};

// ======================================================
// COMPONENT
// ======================================================

export default function TranscriptPage() {
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color)";

  const [loading, setLoading] = useState(true);

  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);

  const [studentId, setStudentId] = useState<number>(0);

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [st, sb, en, it] = await Promise.all([
      db.students.toArray(),
      db.subjects.toArray(),
      db.assessmentEntries.toArray(),
      db.assessmentStructureItems.toArray(),
    ]);

    setStudents(st.filter(x => !x.isDeleted));
    setSubjects(sb.filter(x => !x.isDeleted));
    setEntries(en.filter(x => !x.isDeleted));
    setItems(it.filter(x => !x.isDeleted));

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // FILTER ENTRIES
  // ======================================================

  const studentEntries = useMemo(() => {
    return entries.filter(e => e.studentId === studentId);
  }, [entries, studentId]);

  // ======================================================
  // BUILD GLOBAL COLUMN SET (IMPORTANT FIX)
  // ======================================================

  const columns = useMemo(() => {
    const map = new Map<number, AssessmentStructureItem>();

    for (const e of studentEntries) {
      const item = items.find(i => i.id === e.assessmentStructureItemId);
      if (item && !map.has(item.id!)) {
        map.set(item.id!, item);
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );
  }, [studentEntries, items]);

  // ======================================================
  // TRANSCRIPT BUILD
  // ======================================================

  const transcript: SubjectRow[] = useMemo(() => {
    const map: Record<number, SubjectRow> = {};

    for (const e of studentEntries) {
      const subjectId = e.subjectId;

      if (!map[subjectId]) {
        map[subjectId] = {
          subjectId,
          subjectName: subjects.find(s => s.id === subjectId)?.name || "Unknown",
          scores: {},
          total: 0,
          average: 0,
          grade: "",
          remark: "",
        };
      }

      const row = map[subjectId];

      row.scores[e.assessmentStructureItemId] = Number(e.score || 0);
      row.total += Number(e.score || 0);
    }

    return Object.values(map).map(row => {
      const count = columns.length || 1;

      row.average = row.total / count;

      row.grade =
        row.average >= 80 ? "A"
        : row.average >= 70 ? "B"
        : row.average >= 60 ? "C"
        : row.average >= 50 ? "D"
        : "F";

      row.remark =
        row.grade === "A" ? "Excellent"
        : row.grade === "B" ? "Very Good"
        : row.grade === "C" ? "Good"
        : row.grade === "D" ? "Pass"
        : "Fail";

      return row;
    });
  }, [studentEntries, subjects, columns]);

  // ======================================================
  // UI
  // ======================================================

  if (loading) {
    return <div style={{ padding: 20 }}>Loading transcript...</div>;
  }

  return (
    <div style={{ padding: 20 }}>

      <h2>Transcript (Dynamic Assessment Matrix)</h2>

      {/* STUDENT SELECT */}
      <select
        value={studentId}
        onChange={(e) => setStudentId(Number(e.target.value))}
      >
        <option value={0}>Select Student</option>
        {students.map(s => (
          <option key={s.id} value={s.id}>
            {s.fullName}
          </option>
        ))}
      </select>

      {/* TABLE */}
      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>

          {/* HEADER */}
          <thead>
            <tr>
              <th>Subject</th>

              {columns.map(col => (
                <th key={col.id}>
                  {col.name}
                </th>
              ))}

              <th>Total</th>
              <th>Average</th>
              <th>Grade</th>
              <th>Remark</th>
            </tr>
          </thead>

          {/* BODY */}
          <tbody>
            {transcript.map(row => (
              <tr key={row.subjectId}>

                {/* SUBJECT */}
                <td>{row.subjectName}</td>

                {/* DYNAMIC SCORES */}
                {columns.map(col => (
                  <td key={col.id}>
                    {row.scores[col.id!] ?? "-"}
                  </td>
                ))}

                {/* SUMMARY */}
                <td>{row.total.toFixed(2)}</td>
                <td>{row.average.toFixed(2)}</td>
                <td style={{ fontWeight: 700 }}>{row.grade}</td>
                <td>{row.remark}</td>

              </tr>
            ))}
          </tbody>

        </table>
      </div>
    </div>
  );
}