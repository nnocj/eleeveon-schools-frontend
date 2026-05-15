"use client";

/**
 * teacherAttendance.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL TEACHER ATTENDANCE PAGE
 * ---------------------------------------------------------
 *
 * DB-safe, school/branch-context-aware rewrite.
 *
 * Expected architecture:
 * Active School -> Active Branch -> Teachers -> Teacher Attendance
 *
 * IMPORTANT:
 * TeacherAttendance in db.ts only supports:
 * - branchId
 * - teacherId
 * - date
 * - clockIn?
 * - clockOut?
 *
 * So this page does NOT use fake fields like:
 * - staffId
 * - subjectSpecialization
 * - departmentName
 * - status
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Teacher,
  TeacherAttendance,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type AttendanceMap = Record<
  number,
  {
    clockIn: string;
    clockOut: string;
  }
>;

type TeacherStatus = "present" | "incomplete" | "not_marked";

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

const currentTime = () => {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
};

const formatRole = (role?: Teacher["role"]) => {
  if (!role) return "Teacher";
  return role
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getTeacherStatus = (row?: { clockIn?: string; clockOut?: string }): TeacherStatus => {
  if (row?.clockIn && row?.clockOut) return "present";
  if (row?.clockIn || row?.clockOut) return "incomplete";
  return "not_marked";
};

// ======================================================
// COMPONENT
// ======================================================

export default function TeacherAttendancePage() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<TeacherAttendance[]>([]);

  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Teacher["role"] | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TeacherStatus | "all">("all");
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>({});

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [teacherRows, teacherAttendanceRows] = await Promise.all([
        db.teachers.toArray(),
        db.teacherAttendance.toArray(),
      ]);

      setTeachers(
        teacherRows
          .filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setAttendanceRows(
        teacherAttendanceRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load teacher attendance:", error);
      alert("Failed to load teacher attendance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // HYDRATE ATTENDANCE FOR SELECTED DATE
  // ======================================================

  useEffect(() => {
    if (!date) {
      setAttendanceMap({});
      return;
    }

    const next: AttendanceMap = {};

    attendanceRows
      .filter(row => row.date === date)
      .forEach(row => {
        next[row.teacherId] = {
          clockIn: row.clockIn || "",
          clockOut: row.clockOut || "",
        };
      });

    setAttendanceMap(next);
  }, [attendanceRows, date]);

  // ======================================================
  // DERIVED DATA
  // ======================================================

  const roles = useMemo(() => {
    const set = new Set<Teacher["role"]>();
    teachers.forEach(row => {
      if (row.role) set.add(row.role);
    });
    return Array.from(set);
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return teachers.filter(teacher => {
      const row = attendanceMap[teacher.id || 0];
      const status = getTeacherStatus(row);

      const matchesSearch = !query
        ? true
        : `${teacher.fullName} ${teacher.email || ""} ${teacher.phone || ""} ${teacher.qualification || ""}`
            .toLowerCase()
            .includes(query);

      const matchesRole = roleFilter === "all" ? true : teacher.role === roleFilter;
      const matchesStatus = statusFilter === "all" ? true : status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [teachers, search, roleFilter, statusFilter, attendanceMap]);

  const summary = useMemo(() => {
    const total = filteredTeachers.length;

    const present = filteredTeachers.filter(teacher => {
      const row = attendanceMap[teacher.id || 0];
      return getTeacherStatus(row) === "present";
    }).length;

    const incomplete = filteredTeachers.filter(teacher => {
      const row = attendanceMap[teacher.id || 0];
      return getTeacherStatus(row) === "incomplete";
    }).length;

    const notMarked = filteredTeachers.filter(teacher => {
      const row = attendanceMap[teacher.id || 0];
      return getTeacherStatus(row) === "not_marked";
    }).length;

    const marked = present + incomplete;
    const completion = total ? Math.round((marked / total) * 100) : 0;

    return {
      total,
      marked,
      present,
      incomplete,
      notMarked,
      completion,
    };
  }, [filteredTeachers, attendanceMap]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const updateTeacherAttendance = (
    teacherId: number,
    field: "clockIn" | "clockOut",
    value: string
  ) => {
    setAttendanceMap(prev => ({
      ...prev,
      [teacherId]: {
        clockIn: prev[teacherId]?.clockIn || "",
        clockOut: prev[teacherId]?.clockOut || "",
        [field]: value,
      },
    }));
  };

  const clockInTeacher = (teacherId: number) => {
    updateTeacherAttendance(teacherId, "clockIn", currentTime());
  };

  const clockOutTeacher = (teacherId: number) => {
    updateTeacherAttendance(teacherId, "clockOut", currentTime());
  };

  const clearTeacherAttendance = (teacherId: number) => {
    setAttendanceMap(prev => {
      const next = { ...prev };
      delete next[teacherId];
      return next;
    });
  };

  const markAllClockIn = () => {
    const time = currentTime();

    setAttendanceMap(prev => {
      const next = { ...prev };

      filteredTeachers.forEach(teacher => {
        if (!teacher.id) return;
        next[teacher.id] = {
          clockIn: next[teacher.id]?.clockIn || time,
          clockOut: next[teacher.id]?.clockOut || "",
        };
      });

      return next;
    });
  };

  const markAllClockOut = () => {
    const time = currentTime();

    setAttendanceMap(prev => {
      const next = { ...prev };

      filteredTeachers.forEach(teacher => {
        if (!teacher.id) return;
        next[teacher.id] = {
          clockIn: next[teacher.id]?.clockIn || "",
          clockOut: next[teacher.id]?.clockOut || time,
        };
      });

      return next;
    });
  };

  const clearAllVisible = () => {
    setAttendanceMap(prev => {
      const next = { ...prev };

      filteredTeachers.forEach(teacher => {
        if (teacher.id) delete next[teacher.id];
      });

      return next;
    });
  };

  const saveAttendance = async () => {
    if (!date) return alert("Select date");

    try {
      setSaving(true);

      const visibleTeacherIds = new Set(
        filteredTeachers
          .map(teacher => teacher.id)
          .filter(Boolean) as number[]
      );

      const existing = attendanceRows.filter(row => {
        return row.date === date && visibleTeacherIds.has(row.teacherId);
      });

      for (const row of existing) {
        if (row.id) await db.teacherAttendance.delete(row.id);
      }

      const payload = filteredTeachers
        .filter(teacher => {
          const id = teacher.id || 0;
          const row = attendanceMap[id];
          return !!id && !!row && (!!row.clockIn || !!row.clockOut);
        })
        .map(teacher => {
          const id = teacher.id || 0;
          const row = attendanceMap[id];

          return prepareSyncData({
            branchId,
            teacherId: id,
            date,
            clockIn: row.clockIn || undefined,
            clockOut: row.clockOut || undefined,
          }) as TeacherAttendance;
        });

      if (payload.length) {
        await db.teacherAttendance.bulkAdd(payload);
      }

      await load();
      alert("Teacher attendance saved successfully");
    } catch (error) {
      console.error("Failed to save teacher attendance:", error);
      alert("Failed to save teacher attendance");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const timeButton: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 850,
    cursor: "pointer",
  };

  const timeInput: React.CSSProperties = {
    width: 112,
    padding: "9px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 800,
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  const statusBadge = (status: TeacherStatus): React.CSSProperties => {
    if (status === "present") return badge("green");
    if (status === "incomplete") return badge("orange");
    return badge("gray");
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading teacher attendance...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Teacher attendance belongs to a branch. Select a school and branch from the sidebar before managing teacher attendance.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Teacher Attendance</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing teacher attendance in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={saveAttendance} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : "Save Attendance"}
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />

        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as Teacher["role"] | "all")}
          style={input}
        >
          <option value="all">All Roles</option>
          {roles.map(role => (
            <option key={role} value={role}>
              {formatRole(role)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as TeacherStatus | "all")}
          style={input}
        >
          <option value="all">All Statuses</option>
          <option value="present">Present</option>
          <option value="incomplete">Incomplete</option>
          <option value="not_marked">Not Marked</option>
        </select>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search teacher, email, phone, qualification..."
          style={input}
        />
      </div>

      {/* SUMMARY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Teachers</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Marked</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.marked}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Present</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.present}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Incomplete</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.incomplete}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Completion</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.completion}%</div>
        </div>
      </div>

      {/* BULK ACTIONS */}
      <div style={{ ...card, marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={ghostButton} onClick={markAllClockIn}>Clock In Visible</button>
        <button style={ghostButton} onClick={markAllClockOut}>Clock Out Visible</button>
        <button style={ghostButton} onClick={clearAllVisible}>Clear Visible</button>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredTeachers.map(teacher => {
          const tid = teacher.id || 0;
          const row = attendanceMap[tid];
          const status = getTeacherStatus(row);

          return (
            <div key={teacher.id} style={card}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 16,
                      background: teacher.photo
                        ? `url(${teacher.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 46px",
                    }}
                  >
                    {!teacher.photo && teacher.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 900 }}>{teacher.fullName}</div>
                    <div style={{ marginTop: 4, display: "flex", gap: 7, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{formatRole(teacher.role)}</span>
                      {teacher.qualification && <span style={badge("gray")}>{teacher.qualification}</span>}
                      {teacher.phone && <span style={badge("gray")}>{teacher.phone}</span>}
                      <span style={statusBadge(status)}>
                        {status === "present"
                          ? "Present"
                          : status === "incomplete"
                            ? "Incomplete"
                            : "Not Marked"}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="time"
                    value={row?.clockIn || ""}
                    onChange={e => updateTeacherAttendance(tid, "clockIn", e.target.value)}
                    style={timeInput}
                    title="Clock in"
                  />

                  <input
                    type="time"
                    value={row?.clockOut || ""}
                    onChange={e => updateTeacherAttendance(tid, "clockOut", e.target.value)}
                    style={timeInput}
                    title="Clock out"
                  />

                  <button type="button" onClick={() => clockInTeacher(tid)} style={timeButton}>
                    Clock In
                  </button>

                  <button type="button" onClick={() => clockOutTeacher(tid)} style={timeButton}>
                    Clock Out
                  </button>

                  <button type="button" onClick={() => clearTeacherAttendance(tid)} style={timeButton}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredTeachers.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No active teachers found in this branch or for the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}
