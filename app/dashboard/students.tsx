"use client";

import { useEffect, useState } from "react";
import { db, Student } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

export default function Students() {
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [classId, setClassId] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  // ================= LOAD (FIXED) =================
  const load = async () => {
    const [
      studentsData,
      classesData,
      attendanceData,
      settingsData,
    ] = await Promise.all([
      db.students.toArray(),
      db.classes.toArray(),
      db.attendance.toArray(),
      db.settings.toArray(),
    ]);

    const sys = settingsData?.[0] || settings;

    const academicYear = sys?.academicYear || "";
    const currentTerm = sys?.currentTerm || "";

    // 🔥 FILTER STUDENTS SAFELY
    let filteredStudents = studentsData;

    if (academicYear) {
      filteredStudents = filteredStudents.filter(
        (s) =>
          !s.academicYear ||
          s.academicYear === academicYear
      );
    }

    if (currentTerm) {
      filteredStudents = filteredStudents.filter(
        (s) =>
          !s.term ||
          s.term === currentTerm
      );
    }

    // 🔥 FALLBACK
    if (filteredStudents.length === 0) {
      filteredStudents = studentsData;
    }

    // 🔥 FILTER ATTENDANCE
    let filteredAttendance = attendanceData;

    if (academicYear) {
      filteredAttendance = filteredAttendance.filter(
        (a) =>
          !a.academicYear ||
          a.academicYear === academicYear
      );
    }

    if (currentTerm) {
      filteredAttendance = filteredAttendance.filter(
        (a) =>
          !a.term ||
          a.term === currentTerm
      );
    }

    setStudents(filteredStudents);
    setClasses(classesData);
    setAttendance(filteredAttendance);
    setSettings(sys || null);
  };

  useEffect(() => {
    load();

    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  // ================= ATTENDANCE =================
  const getAttendanceSummary = (studentId: number | undefined) => {
    if (!studentId) return { present: 0, total: 0, percent: 0 };

    const records = attendance.filter((a) => a.studentId === studentId);

    const present = records.filter((r) => r.status === "present").length;
    const total = records.length;

    return {
      present,
      total,
      percent: total === 0 ? 0 : (present / total) * 100,
    };
  };

  // ================= ADD STUDENT =================
  const addStudent = async () => {
    if (!fullName || !classId) return;

    const sysFromDB = await db.settings.toArray();
    const current = sysFromDB?.[0] || settings;

    await db.students.add(
      prepareSyncData({
        fullName,
        age: Number(age || 0),
        parentName,
        parentPhone,
        classId: Number(classId),

        academicYear: current?.academicYear || "",
        term: current?.currentTerm || "",

        status: "active",
      })
    );

    setFullName("");
    setAge("");
    setParentName("");
    setParentPhone("");
    setClassId("");

    load();
  };

  // ================= CLASS RESOLVER =================
  const getClassName = (id: number | undefined) => {
    if (!id) return "No Class";
    return classes.find((c) => Number(c.id) === Number(id))?.name || "No Class";
  };

  // ================= UI =================
  return (
    <div style={{ padding: 20 }}>
      <h2>Students</h2>

      {/* FORM */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 300,
        }}
      >
        <input
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <input
          placeholder="Age"
          value={age}
          onChange={(e) => setAge(e.target.value)}
        />

        <input
          placeholder="Parent Name"
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
        />

        <input
          placeholder="Parent Phone"
          value={parentPhone}
          onChange={(e) => setParentPhone(e.target.value)}
        />

        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select Class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button onClick={addStudent}>Add Student</button>
      </div>

      <hr />

      {/* LIST */}
      {students.map((s) => {
        if (!s.id) return null;

        const summary = getAttendanceSummary(s.id);

        return (
          <div
            key={s.id}
            style={{
              border: "1px solid #ddd",
              padding: 10,
              marginBottom: 10,
              borderRadius: 6,
            }}
          >
            <b>{s.fullName}</b>
            <br />

            Age: {s.age}
            <br />

            Parent: {s.parentName} ({s.parentPhone})
            <br />

            Class: {getClassName(s.classId)}
            <br />

            {/* 🔥 TRUTH FROM SYSTEM ONLY */}
            Year: {settings?.academicYear || "N/A"} | Term: {settings?.currentTerm || "N/A"}
            <br />

            {/* ATTENDANCE */}
            <div style={{ marginTop: 5, color: "#333" }}>
              Attendance: {summary.present} / {summary.total} (
              {summary.percent.toFixed(1)}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}