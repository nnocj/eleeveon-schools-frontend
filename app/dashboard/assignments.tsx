"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

type Tab = "subject" | "class";

export default function Assignments() {
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "#2f6fed";

  // ================= TAB + FORM STATE =================
  const [tab, setTab] = useState<Tab>("subject");

  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);

  // ================= SUBJECT STATE =================
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  // ================= CLASS TEACHER STATE =================
  const [classTeacherId, setClassTeacherId] = useState("");
  const [classTeacherClassId, setClassTeacherClassId] = useState("");

  // ================= DATA =================
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [classTeachers, setClassTeachers] = useState<any[]>([]);

  const load = async () => {
    const [t, c, s, a, ct] = await Promise.all([
      db.teachers.toArray(),
      db.classes.toArray(),
      db.subjects.toArray(),
      db.assignments.toArray(),
      db.classTeachers.toArray(),
    ]);

    setTeachers(t);
    setClasses(c);
    setSubjects(s);
    setAssignments(a);
    setClassTeachers(ct);
  };

  useEffect(() => {
    load();
  }, []);

  // ================= SUBJECT ASSIGN =================
  const addAssignment = async () => {
    if (!teacherId || !classId || !subjectId) {
      alert("Select all fields");
      return;
    }

    const exists = await db.assignments
      .filter(
        (a) =>
          a.teacherId === Number(teacherId) &&
          a.classId === Number(classId) &&
          a.subjectId === Number(subjectId)
      )
      .first();

    if (exists) {
      alert("Already assigned");
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
    setShowSubjectForm(false);
    load();
  };

  // ================= CLASS TEACHER =================
  const assignClassTeacher = async () => {
    if (!classTeacherId || !classTeacherClassId) {
      alert("Select all fields");
      return;
    }

    const exists = await db.classTeachers
      .where("classId")
      .equals(Number(classTeacherClassId))
      .first();

    if (exists) {
      alert("Class already has a class teacher");
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
    setShowClassForm(false);
    load();
  };

  // ================= STYLES =================
  const tabButton = (active: boolean): React.CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.1)",
    cursor: "pointer",
    background: active ? primary : "transparent",
    color: active ? "#fff" : "#111",
  });

  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "var(--surface)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    width: "100%",
  };

  const button: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: primary,
    color: "#fff",
  };

  const secondaryButton: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    cursor: "pointer",
    background: "transparent",
  };

  // ================= UI =================
  return (
    <div style={{ padding: 20 }}>
      <h2>Assignments</h2>

      {/* ================= TABS ================= */}
      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <button style={tabButton(tab === "subject")} onClick={() => setTab("subject")}>
          Subject
        </button>

        <button style={tabButton(tab === "class")} onClick={() => setTab("class")}>
          Class Teacher
        </button>
      </div>

      {/* ================= SUBJECT TAB ================= */}
      {tab === "subject" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Subject Assignment</h3>

            <button
              style={button}
              onClick={() => setShowSubjectForm(!showSubjectForm)}
            >
              {showSubjectForm ? "Close" : "+ Add"}
            </button>
          </div>

          {/* FORM (ONLY WHEN OPEN) */}
          {showSubjectForm && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 350 }}>
              <select style={input} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Select Teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>

              <select style={input} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select Class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select style={input} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Select Subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button style={button} onClick={addAssignment}>
                Save Assignment
              </button>
            </div>
          )}

          {/* LIST */}
          <div style={{ marginTop: 20 }}>
            {assignments.map((a) => (
              <div key={a.id} style={card}>
                <b>{teachers.find((t) => t.id === a.teacherId)?.fullName}</b>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {classes.find((c) => c.id === a.classId)?.name} •{" "}
                  {subjects.find((s) => s.id === a.subjectId)?.name}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ================= CLASS TAB ================= */}
      {tab === "class" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Class Teacher</h3>

            <button
              style={button}
              onClick={() => setShowClassForm(!showClassForm)}
            >
              {showClassForm ? "Close" : "+ Add"}
            </button>
          </div>

          {/* FORM (ONLY WHEN OPEN) */}
          {showClassForm && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 350 }}>
              <select style={input} value={classTeacherId} onChange={(e) => setClassTeacherId(e.target.value)}>
                <option value="">Select Teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>

              <select style={input} value={classTeacherClassId} onChange={(e) => setClassTeacherClassId(e.target.value)}>
                <option value="">Select Class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <button style={button} onClick={assignClassTeacher}>
                Save Class Teacher
              </button>
            </div>
          )}

          {/* LIST */}
          <div style={{ marginTop: 20 }}>
            {classTeachers.map((ct) => (
              <div key={ct.id} style={card}>
                <b>{teachers.find((t) => t.id === ct.teacherId)?.fullName}</b>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  Class: {classes.find((c) => c.id === ct.classId)?.name}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}