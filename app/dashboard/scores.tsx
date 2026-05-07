"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";
import { calculateFinalScore } from "../lib/calculations/scoring";
import { getGrade } from "../lib/calculations/grading";
import { SyncStatus } from "../lib/constants/syncStatus";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

export default function Scores() {
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "#2f6fed";
  const isDark = settings?.theme === "dark";

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [system, setSystem] = useState<any>(null);

  const [inputs, setInputs] = useState<Record<number, any>>({});

  // ================= LOAD STATIC =================
  useEffect(() => {
    const load = async () => {
      const [cls, sub, sys] = await Promise.all([
        db.classes.toArray(),
        db.subjects.toArray(),
        db.settings.toArray(),
      ]);

      setClasses(cls || []);
      setSubjects(sub || []);
      setSystem(sys?.[0] || null);
    };

    load();
  }, []);

  // ================= LOAD STUDENTS =================
  const handleClassChange = async (value: string) => {
    setClassId(value);

    if (!value) {
      setStudents([]);
      return;
    }

    const sys = system || (await db.settings.toArray())[0];

    const all = await db.students
      .where("classId")
      .equals(Number(value))
      .toArray();

    if (!all.length) {
      setStudents([]);
      return;
    }

    const filtered = all.filter((s) => {
      const yearOk =
        !sys?.academicYear || s.academicYear === sys.academicYear;
      const termOk = !sys?.currentTerm || s.term === sys.currentTerm;
      return yearOk && termOk;
    });

    setStudents(filtered.length ? filtered : all);
  };

  // ================= INPUT =================
  const handleChange = (
    studentId: number,
    field: "classTest" | "project" | "exam",
    value: number
  ) => {
    setInputs((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  };

  // ================= COMPUTE =================
  const compute = (studentId: number) => {
    const data = inputs[studentId] || {};

    const classTest = Number(data.classTest || 0);
    const project = Number(data.project || 0);
    const exam = Number(data.exam || 0);

    const total = calculateFinalScore(classTest, project, exam);
    const grade = getGrade(total);

    return { classTest, project, exam, total, grade };
  };

  // ================= VALIDATION =================
  const clamp = (v: number) => {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(100, v));
  };

  // ================= SAVE =================
  const saveScore = async (studentId: number) => {
    if (!classId || !subjectId) {
      alert("Please select both class and subject");
      return;
    }

    const sys = system || (await db.settings.toArray())[0];

    if (!sys?.academicYear || !sys?.currentTerm) {
      alert("System not configured properly");
      return;
    }

    const { classTest, project, exam } = compute(studentId);

    const safeTotal = calculateFinalScore(
      clamp(classTest),
      clamp(project),
      clamp(exam)
    );

    const grade = getGrade(safeTotal);

    const payload = prepareSyncData({
      studentId,
      classId: Number(classId),
      subjectId: Number(subjectId),

      classTest: clamp(classTest),
      project: clamp(project),
      exam: clamp(exam),

      ca: clamp(classTest + project),
      total: safeTotal,
      grade,

      academicYear: sys.academicYear,
      term: sys.currentTerm,

      synced: SyncStatus.PENDING,
    });

    const existing = await db.scores
      .where({
        studentId,
        subjectId: Number(subjectId),
        classId: Number(classId),
        academicYear: sys.academicYear,
        term: sys.currentTerm,
      })
      .first();

    if (existing?.id) {
      await db.scores.update(existing.id, payload);
    } else {
      await db.scores.add(payload);
    }

    alert("Score saved successfully");
  };

  // ================= STYLES =================
  const cardStyle: React.CSSProperties = {
    padding: 12,
    borderRadius: 10,
    border: `1px solid ${isDark ? "#2a2f3a" : "#e5e5e5"}`,
    background: isDark ? "#161a22" : "#fff",
    color: isDark ? "#fff" : "#111",
  };

  const inputStyle: React.CSSProperties = {
    padding: 10,
    border: `1px solid ${isDark ? "#2a2f3a" : "#ddd"}`,
    borderRadius: 6,
    fontSize: 14,
    background: isDark ? "#0f1115" : "#fff",
    color: isDark ? "#fff" : "#111",
  };

  const smallInput: React.CSSProperties = {
    ...inputStyle,
    padding: "8px 6px",
    fontSize: 13,
  };

  const buttonStyle: React.CSSProperties = {
    marginTop: 8,
    padding: "9px 10px",
    fontSize: 13,
    borderRadius: 6,
    border: "none",
    background: primary,
    color: "#fff",
    cursor: "pointer",
    width: "100%",
  };

  // ================= UI =================
  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ fontSize: 18 }}>Score Entry</h2>

      {/* FILTERS */}
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        <select
          value={classId}
          onChange={(e) => handleClassChange(e.target.value)}
          style={inputStyle}
        >
          <option value="">Select Class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          style={inputStyle}
        >
          <option value="">Select Subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* STUDENTS */}
      <div style={{ display: "grid", gap: 12 }}>
        {students.map((s) => {
          const { total, grade } = compute(s.id);

          return (
            <div key={s.id} style={cardStyle}>
              <b>{s.fullName}</b>

              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Class:{" "}
                {classes.find((c) => c.id === s.classId)?.name || "Unknown"}{" "}
                | Term: {system?.currentTerm || "N/A"} | Year:{" "}
                {system?.academicYear || "N/A"}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <input
                  type="number"
                  placeholder="CT"
                  style={smallInput}
                  onChange={(e) =>
                    handleChange(s.id, "classTest", Number(e.target.value))
                  }
                />

                <input
                  type="number"
                  placeholder="Proj"
                  style={smallInput}
                  onChange={(e) =>
                    handleChange(s.id, "project", Number(e.target.value))
                  }
                />

                <input
                  type="number"
                  placeholder="Exam"
                  style={smallInput}
                  onChange={(e) =>
                    handleChange(s.id, "exam", Number(e.target.value))
                  }
                />
              </div>

              <div style={{ marginTop: 6 }}>
                Total: <b>{total.toFixed(1)}</b> | Grade: <b>{grade}</b>
              </div>

              <button onClick={() => saveScore(s.id)} style={buttonStyle}>
                Save Score
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}