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

  // ================= LOAD ATTENDANCE =================
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
    if (status === "present") return "#16a34a";
    if (status === "absent") return "#dc2626";
    if (status === "late") return "#f59e0b";
    return "#e5e7eb";
  };

  // ================= UI =================
  return (
    <div
      style={{
        padding: 20,
        color: "#111", // ✅ FIX TEXT VISIBILITY
        background: "#f5f5f5", // ✅ FIX WHITE SCREEN ISSUE
        minHeight: "100vh",
      }}
    >
      <h2 style={{ color: "#111" }}>Student Attendance</h2>

      {/* SELECTORS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          style={{
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ccc",
            color: "#111",
            background: "#fff",
          }}
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
          style={{
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ccc",
            color: "#111",
            background: "#fff",
          }}
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
                background: "#fff", // ✅ FIX VISIBILITY
                color: "#111", // ✅ FIX TEXT
              }}
            >
              <b style={{ color: "#111" }}>{student.fullName}</b>

              <div
                style={{
                  fontSize: 12,
                  color: "#333", // FIXED FROM OPACITY ISSUE
                  marginTop: 4,
                }}
              >
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
                      status === "present" ? "#16a34a" : "#eee",
                    color: status === "present" ? "#fff" : "#111",
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
                      status === "absent" ? "#dc2626" : "#eee",
                    color: status === "absent" ? "#fff" : "#111",
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
                      status === "late" ? "#f59e0b" : "#eee",
                    color: status === "late" ? "#fff" : "#111",
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