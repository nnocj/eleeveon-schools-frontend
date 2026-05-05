"use client";

import { useEffect, useState } from "react";
import { db, TermType } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

type Status = "present" | "absent" | "late";

export default function StudentAttendance() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  const [attendanceMap, setAttendanceMap] = useState<
    Record<number, Status>
  >({});

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [date, setDate] = useState("");

  // ================= LOAD =================
  const load = async () => {
    const [cls, stu] = await Promise.all([
      db.classes.toArray(),
      db.students.toArray(),
    ]);

    setClasses(cls);
    setStudents(stu);
  };

  useEffect(() => {
    load();
  }, []);

  // ================= FILTER STUDENTS =================
  const getStudentsByClass = () => {
    if (!selectedClassId) return [];

    return students.filter(
      (s) => Number(s.classId) === Number(selectedClassId)
    );
  };

  // ================= LOAD ATTENDANCE (FIXED CONTEXT MATCH) =================
  const loadAttendanceForDay = async () => {
    if (!selectedClassId || !date) return;

    const classStudents = getStudentsByClass();

    const map: Record<number, Status> = {};

    for (const student of classStudents) {
      const record = await db.attendance
        .where("studentId")
        .equals(student.id)
        .and((a) => a.date === date)
        .first();

      if (record?.status) {
        map[student.id] = record.status as Status;
      }
    }

    setAttendanceMap(map);
  };

  useEffect(() => {
    loadAttendanceForDay();
  }, [selectedClassId, date]);

  // ================= TOGGLE =================
  const toggleAttendance = (studentId: number, status: Status) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  // ================= SAVE =================
  const saveAttendance = async () => {
    if (!selectedClassId || !date) {
      alert("Select class and date");
      return;
    }

    const classStudents = getStudentsByClass();

    await db.transaction("rw", db.attendance, async () => {
      for (const student of classStudents) {
        const status = attendanceMap[student.id] || "absent";

        const existing = await db.attendance
          .where("studentId")
          .equals(student.id)
          .and((a) => a.date === date)
          .first();

        const payload = prepareSyncData({
          studentId: student.id,
          classId: student.classId,

          date,
          status,

          // 🔥 CRITICAL FIX: USE STUDENT DATA, NOT SYSTEM
          academicYear: student.academicYear,
          term: student.term as TermType,

          synced: "pending" as any,
        });

        if (existing?.id) {
          await db.attendance.update(existing.id, payload);
        } else {
          await db.attendance.add(payload);
        }
      }
    });

    alert("Attendance saved successfully ✅");
  };

  // ================= COLOR =================
  const getColor = (status?: Status) => {
    if (status === "present") return "green";
    if (status === "absent") return "red";
    if (status === "late") return "orange";
    return "#eee";
  };

  // ================= UI =================
  return (
    <div style={{ padding: 20 }}>
      <h2>Student Attendance</h2>

      {/* SELECTORS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
        >
          <option value="">Select Class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <hr />

      {/* STUDENTS */}
      {selectedClassId &&
        getStudentsByClass().map((student) => {
          const status = attendanceMap[student.id];

          return (
            <div
              key={student.id}
              style={{
                border: `2px solid ${getColor(status)}`,
                padding: 10,
                marginBottom: 8,
                borderRadius: 6,
                background: status ? `${getColor(status)}15` : "#fff",
              }}
            >
              <b>{student.fullName}</b>

              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Class:{" "}
                {classes.find((c) => c.id === student.classId)?.name}
                {" | "}
                Year: {student.academicYear} | Term: {student.term}
              </div>

              <div style={{ marginTop: 6 }}>
                <button
                  onClick={() =>
                    toggleAttendance(student.id, "present")
                  }
                  style={{
                    background:
                      status === "present" ? "green" : "#eee",
                    color: status === "present" ? "#fff" : "#000",
                    marginRight: 5,
                    padding: "6px 10px",
                    border: "none",
                    borderRadius: 4,
                  }}
                >
                  Present
                </button>

                <button
                  onClick={() =>
                    toggleAttendance(student.id, "absent")
                  }
                  style={{
                    background:
                      status === "absent" ? "red" : "#eee",
                    color: status === "absent" ? "#fff" : "#000",
                    marginRight: 5,
                    padding: "6px 10px",
                    border: "none",
                    borderRadius: 4,
                  }}
                >
                  Absent
                </button>

                <button
                  onClick={() =>
                    toggleAttendance(student.id, "late")
                  }
                  style={{
                    background:
                      status === "late" ? "orange" : "#eee",
                    color: status === "late" ? "#fff" : "#000",
                    padding: "6px 10px",
                    border: "none",
                    borderRadius: 4,
                  }}
                >
                  Late
                </button>
              </div>
            </div>
          );
        })}

      {selectedClassId && (
        <button
          onClick={saveAttendance}
          style={{
            marginTop: 15,
            padding: "10px 14px",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: 6,
          }}
        >
          Save Attendance
        </button>
      )}
    </div>
  );
}