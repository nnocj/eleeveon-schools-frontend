"use client";

/**
 * teacherAttendance.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE TEACHER ATTENDANCE PAGE
 * ---------------------------------------------------------
 *
 * DB table: teacherAttendance
 * Supporting table: teachers
 *
 * Actual DB model reminder:
 * TeacherAttendance supports:
 * - schoolId
 * - branchId
 * - teacherId
 * - date
 * - clockIn?
 * - clockOut?
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch -> Teachers -> Teacher Attendance
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Saves one row per teacher per selected date.
 * - No fake fields like staffId, departmentName, status, subjectSpecialization.
 * - Mobile-first attendance cards and responsive controls.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import { db, Teacher, TeacherAttendance } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

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

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

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
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getTeacherStatus = (row?: { clockIn?: string; clockOut?: string }): TeacherStatus => {
  if (row?.clockIn && row?.clockOut) return "present";
  if (row?.clockIn || row?.clockOut) return "incomplete";
  return "not_marked";
};

function statusTone(status: TeacherStatus): "green" | "orange" | "gray" {
  if (status === "present") return "green";
  if (status === "incomplete") return "orange";
  return "gray";
}

function statusLabel(status: TeacherStatus) {
  if (status === "present") return "Present";
  if (status === "incomplete") return "Incomplete";
  return "Not Marked";
}

// ======================================================
// COMPONENT
// ======================================================

export default function TeacherAttendancePage() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

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
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setTeachers([]);
    setAttendanceRows([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [teacherRows, teacherAttendanceRows] = await Promise.all([
        db.teachers.toArray(),
        db.teacherAttendance.toArray(),
      ]);

      setTeachers(
        teacherRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setAttendanceRows(teacherAttendanceRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load teacher attendance:", error);
      clearData();
      alert("Failed to load teacher attendance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

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
      .filter((row) => row.date === date)
      .forEach((row) => {
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
    teachers.forEach((row) => {
      if (row.role) set.add(row.role);
    });
    return Array.from(set);
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return teachers.filter((teacher) => {
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

    const present = filteredTeachers.filter((teacher) => {
      const row = attendanceMap[teacher.id || 0];
      return getTeacherStatus(row) === "present";
    }).length;

    const incomplete = filteredTeachers.filter((teacher) => {
      const row = attendanceMap[teacher.id || 0];
      return getTeacherStatus(row) === "incomplete";
    }).length;

    const notMarked = filteredTeachers.filter((teacher) => {
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
    setAttendanceMap((prev) => ({
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
    setAttendanceMap((prev) => {
      const next = { ...prev };
      delete next[teacherId];
      return next;
    });
  };

  const markAllClockIn = () => {
    const time = currentTime();

    setAttendanceMap((prev) => {
      const next = { ...prev };

      filteredTeachers.forEach((teacher) => {
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

    setAttendanceMap((prev) => {
      const next = { ...prev };

      filteredTeachers.forEach((teacher) => {
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
    setAttendanceMap((prev) => {
      const next = { ...prev };

      filteredTeachers.forEach((teacher) => {
        if (teacher.id) delete next[teacher.id];
      });

      return next;
    });
  };

  const saveAttendance = async () => {
    if (!date) {
      alert("Select date");
      return;
    }

    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return;
    }

    try {
      setSaving(true);

      const visibleTeacherIds = new Set(
        filteredTeachers
          .map((teacher) => teacher.id)
          .filter(Boolean) as number[]
      );

      const existing = attendanceRows.filter((row) => {
        return row.date === date && visibleTeacherIds.has(row.teacherId);
      });

      for (const row of existing) {
        if (row.id) {
          await db.teacherAttendance.update(row.id, {
            isDeleted: true,
            updatedAt: Date.now(),
          } as Partial<TeacherAttendance>);
        }
      }

      const payload = filteredTeachers
        .filter((teacher) => {
          const id = teacher.id || 0;
          const row = attendanceMap[id];
          return !!id && !!row && (!!row.clockIn || !!row.clockOut);
        })
        .map((teacher) => {
          const id = teacher.id || 0;
          const row = attendanceMap[id];

          return prepareSyncData({
            accountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
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
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="tat-page" style={{ "--tat-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tat-state-card">
          <div className="tat-spinner" />
          <h2>Opening teacher attendance...</h2>
          <p>Checking account, branch, teachers, and attendance records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="tat-page" style={{ "--tat-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tat-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing teacher attendance.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="tat-page" style={{ "--tat-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tat-state-card">
          <h2>Select a branch first</h2>
          <p>Teacher attendance belongs to one active school branch.</p>
          <button type="button" className="tat-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="tat-page" style={{ "--tat-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="tat-hero">
        <div className="tat-hero-left">
          <div className="tat-hero-icon">🕒</div>
          <div className="tat-title-wrap">
            <p>Staff Attendance</p>
            <h2>Teacher Attendance</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" onClick={saveAttendance} disabled={saving} className="tat-primary-btn">
          {saving ? "Saving..." : "Save Attendance"}
        </button>
      </section>

      <section className="tat-context-card">
        <div>
          <p>Attendance Scope</p>
          <h3>{summary.marked} marked teacher(s)</h3>
          <span>{summary.total} visible teacher(s) for {date || "selected date"}</span>
        </div>
        <div className="tat-pill-row">
          <Chip tone="blue">Same Tenant</Chip>
          <Chip tone="green">Branch Scoped</Chip>
          <Chip tone={summary.completion >= 70 ? "green" : "orange"}>{summary.completion}% Completion</Chip>
        </div>
      </section>

      <section className="tat-filter-card">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />

        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as Teacher["role"] | "all")}
        >
          <option value="all">All Roles</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {formatRole(role)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TeacherStatus | "all")}
        >
          <option value="all">All Statuses</option>
          <option value="present">Present</option>
          <option value="incomplete">Incomplete</option>
          <option value="not_marked">Not Marked</option>
        </select>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search teacher, email, phone, qualification..."
        />
      </section>

      <section className="tat-summary-grid" aria-label="Teacher attendance summary">
        <SummaryCard label="Teachers" value={summary.total} icon="👥" />
        <SummaryCard label="Marked" value={summary.marked} icon="📝" />
        <SummaryCard label="Present" value={summary.present} icon="✅" />
        <SummaryCard label="Incomplete" value={summary.incomplete} icon="⚠️" />
        <SummaryCard label="Not Marked" value={summary.notMarked} icon="⭕" />
        <SummaryCard label="Completion" value={`${summary.completion}%`} icon="📊" />
      </section>

      <section className="tat-bulk-card">
        <button type="button" onClick={markAllClockIn}>Clock In Visible</button>
        <button type="button" onClick={markAllClockOut}>Clock Out Visible</button>
        <button type="button" onClick={clearAllVisible}>Clear Visible</button>
      </section>

      <section className="tat-list">
        {filteredTeachers.map((teacher) => {
          const tid = teacher.id || 0;
          const row = attendanceMap[tid];
          const status = getTeacherStatus(row);

          return (
            <article key={teacher.id} className="tat-teacher-card">
              <div className="tat-teacher-top">
                <div
                  className="tat-avatar"
                  style={{
                    background: teacher.photo
                      ? `url(${teacher.photo}) center/cover`
                      : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
                  }}
                >
                  {!teacher.photo && teacher.fullName.slice(0, 1).toUpperCase()}
                </div>

                <div className="tat-teacher-main">
                  <h3>{teacher.fullName}</h3>
                  <p>{teacher.email || teacher.phone || "No contact provided"}</p>
                  <div className="tat-chip-row">
                    <Chip tone="blue">{formatRole(teacher.role)}</Chip>
                    {teacher.qualification && <Chip tone="gray">{teacher.qualification}</Chip>}
                    {teacher.phone && <Chip tone="gray">{teacher.phone}</Chip>}
                    <Chip tone={statusTone(status)}>{statusLabel(status)}</Chip>
                  </div>
                </div>
              </div>

              <div className="tat-time-grid">
                <label>
                  <span>Clock In</span>
                  <input
                    type="time"
                    value={row?.clockIn || ""}
                    onChange={(event) => updateTeacherAttendance(tid, "clockIn", event.target.value)}
                  />
                </label>

                <label>
                  <span>Clock Out</span>
                  <input
                    type="time"
                    value={row?.clockOut || ""}
                    onChange={(event) => updateTeacherAttendance(tid, "clockOut", event.target.value)}
                  />
                </label>
              </div>

              <div className="tat-action-row">
                <button type="button" onClick={() => clockInTeacher(tid)}>Clock In</button>
                <button type="button" onClick={() => clockOutTeacher(tid)}>Clock Out</button>
                <button type="button" className="danger" onClick={() => clearTeacherAttendance(tid)}>Clear</button>
              </div>
            </article>
          );
        })}

        {!filteredTeachers.length && <EmptyCard text="No active teachers found in this branch or for the selected filters." />}
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="tat-summary-card">
      <div className="tat-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" }) {
  return <span className={`tat-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="tat-empty-card">
      <div className="tat-empty-icon">🕒</div>
      <h3>No teacher attendance records</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes tatSpin { to { transform: rotate(360deg); } }

.tat-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}
.tat-page *, .tat-page *::before, .tat-page *::after { box-sizing: border-box; }
.tat-page button, .tat-page input, .tat-page select { font: inherit; max-width: 100%; }
.tat-page input,
.tat-page select {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}

.tat-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.tat-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.tat-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.tat-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--tat-primary) 18%, transparent); border-top-color: var(--tat-primary); animation: tatSpin .8s linear infinite; }

.tat-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--tat-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.tat-primary-btn:disabled { opacity: .55; cursor: not-allowed; }

.tat-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tat-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.tat-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.tat-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--tat-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--tat-primary) 28%, transparent); font-size: 22px; }
.tat-title-wrap { min-width: 0; }
.tat-title-wrap p, .tat-title-wrap h2, .tat-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tat-title-wrap p { margin: 0 0 2px; color: var(--tat-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.tat-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.tat-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.tat-context-card,
.tat-filter-card,
.tat-bulk-card,
.tat-teacher-card,
.tat-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  padding: 13px;
}
.tat-context-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tat-primary) 10%, #fff), #fff 68%);
}
.tat-context-card p { margin: 0; color: var(--tat-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.tat-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.tat-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.tat-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }

.tat-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.tat-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.tat-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}
.tat-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--tat-primary) 12%, #fff); }
.tat-summary-card div:last-child { min-width: 0; }
.tat-summary-card strong, .tat-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tat-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.tat-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.tat-bulk-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.tat-bulk-card button,
.tat-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.tat-list { display: grid; gap: 10px; margin-top: 10px; }
.tat-teacher-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.tat-teacher-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.tat-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.tat-teacher-main { min-width: 0; flex: 1; }
.tat-teacher-main h3, .tat-teacher-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.tat-teacher-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.tat-teacher-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.tat-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.tat-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tat-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.tat-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.tat-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.tat-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.tat-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.tat-time-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 12px; }
.tat-time-grid label { display: grid; gap: 6px; }
.tat-time-grid label span { color: var(--muted, #64748b); font-size: 10px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.tat-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.tat-action-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.13); }
.tat-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.tat-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--tat-primary) 12%, #fff); font-size: 28px; }
.tat-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.tat-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

@media (max-width: 390px) {
  .tat-page { padding: 6px; }
  .tat-hero { padding: 10px; border-radius: 24px; flex-wrap: wrap; }
  .tat-hero-icon { width: 42px; height: 42px; border-radius: 16px; }
  .tat-hero .tat-primary-btn { width: 100%; }
  .tat-summary-grid { grid-template-columns: minmax(0, 1fr); }
  .tat-teacher-top { flex-direction: column; }
  .tat-action-row { grid-template-columns: minmax(0, 1fr); }
}

@media (min-width: 560px) {
  .tat-page { padding: 14px; }
  .tat-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tat-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tat-bulk-card { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tat-time-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tat-action-row { display: flex; flex-wrap: wrap; justify-content: flex-end; }
  .tat-action-row button { padding: 0 14px; }
}

@media (min-width: 980px) {
  .tat-page { padding: 18px; }
  .tat-filter-card { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .tat-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .tat-teacher-card { padding: 16px; }
  .tat-teacher-top { align-items: center; }
}
`;
