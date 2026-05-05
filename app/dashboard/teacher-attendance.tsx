"use client";

import { useEffect, useState } from "react";
import { db, Teacher } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

interface TeacherAttendance {
  id?: number;
  teacherId: number;
  date: string;
  clockIn?: string;
  clockOut?: string;
}

export default function TeacherAttendancePage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendance, setAttendance] = useState<TeacherAttendance[]>([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const load = async () => {
    setTeachers(await db.teachers.toArray());
    setAttendance(await db.teacherAttendance.toArray());
  };

  useEffect(() => {
    load();
  }, []);

  // ---------------- CLOCK IN ----------------
  const clockIn = async (teacherId: number) => {
    const now = new Date().toISOString();

    const todayRecord = await db.teacherAttendance
      .where({ teacherId, date: selectedDate })
      .first();

    if (todayRecord?.clockIn) {
      alert("Already clocked in today");
      return;
    }

    if (todayRecord) {
      await db.teacherAttendance.update(todayRecord.id!, {
        clockIn: now,
      });
    } else {
      await db.teacherAttendance.add(prepareSyncData({
        teacherId,
        date: selectedDate,
        clockIn: now,
      }));
    }

    load();
  };

  // ---------------- CLOCK OUT ----------------
  const clockOut = async (teacherId: number) => {
    const now = new Date().toISOString();

    const todayRecord = await db.teacherAttendance
      .where({ teacherId, date: selectedDate })
      .first();

    if (!todayRecord?.clockIn) {
      alert("Teacher has not clocked in yet");
      return;
    }

    if (todayRecord?.clockOut) {
      alert("Already clocked out today");
      return;
    }

    await db.teacherAttendance.update(todayRecord.id!, {
      clockOut: now,
    });

    load();
  };

  // ---------------- HELPERS ----------------
  const getTodayRecord = (teacherId: number) =>
    attendance.find(
      (a) => a.teacherId === teacherId && a.date === selectedDate
    );

  const formatTime = (iso?: string) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleTimeString();
  };

  // ---------------- UI ----------------
  return (
    <div style={{ padding: 20 }}>
      <h2>Teacher Attendance (Clock System)</h2>

      {/* DATE SELECT */}
      <div style={{ marginBottom: 10 }}>
        <label>Select Date: </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <hr />

      {/* TEACHER LIST */}
      {teachers.map((t) => {
        const record = getTodayRecord(t.id!);

        return (
          <div
            key={t.id}
            style={{
              border: "1px solid #ddd",
              padding: 10,
              marginBottom: 10,
              borderRadius: 6,
            }}
          >
            <b>{t.fullName}</b> <br />

            <div style={{ marginTop: 5 }}>
              <b>Clock In:</b> {formatTime(record?.clockIn)} <br />
              <b>Clock Out:</b> {formatTime(record?.clockOut)}
            </div>

            {/* ACTIONS */}
            <div style={{ marginTop: 10 }}>
              <button onClick={() => clockIn(t.id!)}>
                Clock In
              </button>

              <button
                onClick={() => clockOut(t.id!)}
                style={{ marginLeft: 10 }}
              >
                Clock Out
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}