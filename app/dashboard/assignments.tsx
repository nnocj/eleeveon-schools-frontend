"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ================= COLOR UTILITIES =================
function tintColor(hex: string, amount = 0.9) {
  let col = hex.replace("#", "");

  if (col.length === 3) {
    col = col.split("").map((c) => c + c).join("");
  }

  const num = parseInt(col, 16);

  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.min(255, Math.floor(r + (255 - r) * amount));
  g = Math.min(255, Math.floor(g + (255 - g) * amount));
  b = Math.min(255, Math.floor(b + (255 - b) * amount));

  return `rgb(${r}, ${g}, ${b})`;
}

function darken(hex: string, factor = 0.4) {
  let col = hex.replace("#", "");

  if (col.length === 3) {
    col = col.split("").map((c) => c + c).join("");
  }

  const num = parseInt(col, 16);

  let r = Math.floor(((num >> 16) & 255) * factor);
  let g = Math.floor(((num >> 8) & 255) * factor);
  let b = Math.floor((num & 255) * factor);

  return `rgb(${r}, ${g}, ${b})`;
}

// ================= CARD STYLE =================
function getCardStyle(primary: string, isDark: boolean, type: "subject" | "class") {
  const bg =
    type === "class"
      ? isDark
        ? darken(primary, 0.25)
        : tintColor(primary, 0.92)
      : isDark
      ? "rgba(255,255,255,0.05)"
      : "#fff";

  const border =
    type === "class"
      ? isDark
        ? darken(primary, 0.4)
        : primary
      : "#ddd";

  return {
    border: `1px solid ${border}`,
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
    background: bg,
    color: isDark ? "#fff" : "#111",
  } as React.CSSProperties;
}

// ================= COMPONENT =================
export default function Assignments() {
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "#2f6fed";
  const isDark = settings?.theme === "dark";

  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [classTeacherId, setClassTeacherId] = useState("");
  const [classTeacherClassId, setClassTeacherClassId] = useState("");

  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [classTeachers, setClassTeachers] = useState<any[]>([]);

  const load = async () => {
    setTeachers(await db.teachers.toArray());
    setClasses(await db.classes.toArray());
    setSubjects(await db.subjects.toArray());
    setAssignments(await db.assignments.toArray());
    setClassTeachers(await db.classTeachers.toArray());
  };

  useEffect(() => {
    load();
  }, []);

  // ================= SUBJECT ASSIGNMENT =================
  const addAssignment = async () => {
    if (!teacherId || !classId || !subjectId) {
      alert("Please select all fields");
      return;
    }

    const existing = await db.assignments
      .filter(
        (a) =>
          a.teacherId === Number(teacherId) &&
          a.classId === Number(classId) &&
          a.subjectId === Number(subjectId)
      )
      .first();

    if (existing) {
      alert("This assignment already exists");
      return;
    }

    await db.assignments.add(
      prepareSyncData({
        teacherId: Number(teacherId),
        classId: Number(classId),
        subjectId: Number(subjectId),
      })
    );

    setTeacherId("");
    setClassId("");
    setSubjectId("");

    load();
  };

  // ================= CLASS TEACHER =================
  const assignClassTeacher = async () => {
    if (!classTeacherId || !classTeacherClassId) {
      alert("Select teacher and class");
      return;
    }

    const existing = await db.classTeachers
      .where("classId")
      .equals(Number(classTeacherClassId))
      .first();

    if (existing) {
      alert("This class already has a class teacher");
      return;
    }

    await db.classTeachers.add(
      prepareSyncData({
        teacherId: Number(classTeacherId),
        classId: Number(classTeacherClassId),
      })
    );

    setClassTeacherId("");
    setClassTeacherClassId("");

    load();
  };

  return (
    <div style={{ padding: 10 }}>
      <h2>Assignments</h2>

      {/* ================= SUBJECT ASSIGNMENT ================= */}
      <h3>📘 Subject Teacher Assignment</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Select Teacher</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName}
            </option>
          ))}
        </select>

        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select Class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">Select Subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button onClick={addAssignment}>Assign Subject</button>
      </div>

      {/* ================= SUBJECT LIST ================= */}
      <h3 style={{ marginTop: 25 }}>📚 Subject Assignments</h3>

      {assignments.length === 0 && <p>No subject assignments yet</p>}

      {assignments.map((a) => {
        const teacher = teachers.find((t) => t.id === a.teacherId);
        const cls = classes.find((c) => c.id === a.classId);
        const subject = subjects.find((s) => s.id === a.subjectId);

        return (
          <div key={a.id} style={getCardStyle(primary, isDark, "subject")}>
            <strong>{teacher?.fullName}</strong>
            <div>Class: {cls?.name}</div>
            <div>Subject: {subject?.name}</div>
          </div>
        );
      })}

      <hr />

      {/* ================= CLASS TEACHER ================= */}
      <h3>🏫 Class Teacher Assignment</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
        <select value={classTeacherId} onChange={(e) => setClassTeacherId(e.target.value)}>
          <option value="">Select Teacher</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName}
            </option>
          ))}
        </select>

        <select
          value={classTeacherClassId}
          onChange={(e) => setClassTeacherClassId(e.target.value)}
        >
          <option value="">Select Class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button onClick={assignClassTeacher}>Assign Class Teacher</button>
      </div>

      {/* ================= CLASS TEACHER LIST ================= */}
      <h3 style={{ marginTop: 25 }}>🏅 Class Teachers</h3>

      {classTeachers.length === 0 && <p>No class teachers assigned yet</p>}

      {classTeachers.map((ct) => {
        const teacher = teachers.find((t) => t.id === ct.teacherId);
        const cls = classes.find((c) => c.id === ct.classId);

        return (
          <div key={ct.id} style={getCardStyle(primary, isDark, "class")}>
            <strong>{teacher?.fullName}</strong>
            <div>Role: Class Teacher</div>
            <div>Class: {cls?.name}</div>
          </div>
        );
      })}
    </div>
  );
}