"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";
import { calculateFinalScore } from "../lib/calculations/scoring";
import { getGrade } from "../lib/calculations/grading";
import { SyncStatus } from "../lib/constants/syncStatus";

export default function TeacherScores() {
  const teacherId = 1; // 🔥 replace with auth later

  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);

  const [students, setStudents] = useState<any[]>([]);
  const [inputs, setInputs] = useState<any>({});

  // Load assignments for this teacher
  const loadAssignments = async () => {
    const data = await db.assignments
      .where("teacherId")
      .equals(teacherId)
      .toArray();

    const classes = await db.classes.toArray();
    const subjects = await db.subjects.toArray();

    // enrich data
    const enriched = data.map((a) => ({
      ...a,
      className: classes.find((c) => c.id === a.classId)?.name,
      term: classes.find((c) => c.id === a.classId)?.term,
      subjectName: subjects.find((s) => s.id === a.subjectId)?.name,
    }));

    setAssignments(enriched);
  };

  useEffect(() => {
    loadAssignments();
  }, []);

  const selectAssignment = async (value: string) => {
    const a = assignments.find((x) => x.id === Number(value));
    setSelectedAssignment(a);

    if (a) {
      const students = await db.students
        .where("classId")
        .equals(a.classId)
        .toArray();

      setStudents(students);
    }
  };

  const handleChange = (studentId: number, field: string, value: number) => {
    setInputs((prev: any) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  };

  const saveScore = async (studentId: number) => {
    const data = inputs[studentId] || {};

    const classTest = Number(data.classTest || 0);
    const project = Number(data.project || 0);
    const exam = Number(data.exam || 0);

    const total = calculateFinalScore(classTest, project, exam);
    const grade = getGrade(total);

    await db.scores.add({
      studentId,
      subjectId: selectedAssignment.subjectId,
      classTest,
      project,
      exam,
      ca: classTest + project,
      total,
      grade,
      synced: SyncStatus.PENDING,
    });

    alert("Saved");
  };

  return (
    <div style={{ padding: 10 }}>
      <h2>Teacher Score Entry</h2>

      {/* ASSIGNMENT SELECT */}
      <select onChange={(e) => selectAssignment(e.target.value)}>
        <option value="">Select Class & Subject</option>

        {assignments.map((a) => (
          <option key={a.id} value={a.id}>
            {a.className} ({a.term}) - {a.subjectName}
          </option>
        ))}
      </select>

      <hr />

      {/* STUDENTS */}
      {students.map((s) => {
        const data = inputs[s.id] || {};

        const classTest = Number(data.classTest || 0);
        const project = Number(data.project || 0);
        const exam = Number(data.exam || 0);

        const total = calculateFinalScore(classTest, project, exam);
        const grade = getGrade(total);

        return (
          <div key={s.id} style={{ marginBottom: 20, border: "1px solid #ccc", padding: 10 }}>
            <b>{s.fullName}</b>

            <div style={{ display: "flex", gap: 5 }}>
              <input
                placeholder="Class Test"
                onChange={(e) =>
                  handleChange(s.id, "classTest", Number(e.target.value))
                }
              />

              <input
                placeholder="Project"
                onChange={(e) =>
                  handleChange(s.id, "project", Number(e.target.value))
                }
              />

              <input
                placeholder="Exam"
                onChange={(e) =>
                  handleChange(s.id, "exam", Number(e.target.value))
                }
              />
            </div>

            {/* 🔥 LIVE CALC */}
            <div>
              Total: <b>{total.toFixed(2)}</b> | Grade: <b>{grade}</b>
            </div>

            <button onClick={() => saveScore(s.id)}>Save</button>
          </div>
        );
      })}
    </div>
  );
}