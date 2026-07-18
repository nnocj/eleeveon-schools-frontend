"use client";

/**
 * app/branch-admin/modules/TeacherAttendance.tsx
 * ---------------------------------------------------------
 * ELEEVEON TEACHER ATTENDANCE V3
 * ---------------------------------------------------------
 * Golden Standard Module.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this attendance register from accidentally using stale school/branch
 *   context left behind by another role or portal
 * - all attendance reads and writes now use the resolved workspace
 *   schoolId and branchId
 *
 * Golden UI behavior:
 * - removes the old large hero/header block
 * - removes the dedicated context, summary, and action-card strips from the main screen
 * - uses the Students.tsx compact search/action row pattern
 * - filter controls live in a bottom sheet
 * - table, analytics, refresh, bulk clock-in, bulk clock-out, and clear actions live under More
 * - card view uses compact teacher rows so desktop and mobile stay dense and professional
 * - table headers and surfaces use theme variables for dark-mode support
 *
 * Data behavior intentionally preserved:
 * - teacher list is resolved from active branch-scoped Teacher records
 * - teacher attendance uses real DB fields only: teacherId, date, clockIn, clockOut
 * - save updates existing teacherAttendance rows instead of replacing tenant rows
 * - empty clock-in/clock-out soft-archives only that teacher's selected-date attendance
 * - createLocal(...) creates local attendance records
 * - updateLocal(...) updates existing local attendance records
 * - softDeleteLocal(...) clears attendance records safely
 * - manual synced/version/updatedAt fields are intentionally avoided
 *
 * DB focus:
 * - teacherAttendance
 * - teachers
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import { db, type Teacher, type TeacherAttendance } from "../../lib/db/db";
import { createLocal, softDeleteLocal, updateLocal } from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type TeacherStatus = "present" | "incomplete" | "not_marked";
type TeacherStatusFilter = TeacherStatus | "all";
type AttendanceMap = Record<number, { clockIn: string; clockOut: string }>;

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstLocalId(...values: unknown[]) {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId")
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId")
  );
}


type TeacherRow = {
  id: number;
  teacher: Teacher;
  existingAttendance?: TeacherAttendance;
  clockIn: string;
  clockOut: string;
  status: TeacherStatus;
  hours: number;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);

const idOf = (value: any) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  const status = String(row?.status || "").toLowerCase();
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  if (["inactive", "deleted", "archived", "suspended"].includes(status)) return false;
  return true;
};

function formatRole(role?: Teacher["role"] | string) {
  if (!role) return "Teacher";
  return String(role)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function teacherStatus(row?: { clockIn?: string; clockOut?: string }): TeacherStatus {
  if (row?.clockIn && row?.clockOut) return "present";
  if (row?.clockIn || row?.clockOut) return "incomplete";
  return "not_marked";
}

function statusTone(status?: TeacherStatus): "green" | "red" | "orange" | "gray" {
  if (status === "present") return "green";
  if (status === "incomplete") return "orange";
  return "gray";
}

function statusLabel(status?: TeacherStatus) {
  if (status === "present") return "Present";
  if (status === "incomplete") return "Incomplete";
  return "Not Marked";
}

function calculateHours(clockIn?: string, clockOut?: string) {
  if (!clockIn || !clockOut) return 0;
  const [ih, im] = clockIn.split(":").map(Number);
  const [oh, om] = clockOut.split(":").map(Number);
  if (![ih, im, oh, om].every(Number.isFinite)) return 0;
  const start = ih * 60 + im;
  const end = oh * 60 + om;
  if (end <= start) return 0;
  return Math.round(((end - start) / 60) * 10) / 10;
}

function dateText(value?: string | number | null) {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div
      className="ba-avatar"
      style={{
        background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {!photo && String(name || "T").slice(0, 1).toUpperCase()}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

export default function TeacherAttendance() {
  const dataRevision = useDataRevision();

  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, activeBranch, activeBranchId, loading: contextLoading } = useActiveBranch();
  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedWorkspaceSchoolId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeSchoolId,
    activeSchool: activeSchool as any,
    settings: settings as any,
  });

  const branchId = selectedWorkspaceBranchId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeBranchId,
    activeBranch: activeBranch as any,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<TeacherAttendance[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Teacher["role"] | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TeacherStatusFilter>("all");
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    else if (!schoolId || !branchId) router.replace("/account");
  }, [accountLoading, contextLoading, authenticated, accountId, schoolId, branchId, router]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast((current) => (current?.message === message ? null : current)), 4200);
  };

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
      const [teacherRows, attendanceData] = await Promise.all([
        tableSafe("teachers")?.toArray?.() || [],
        tableSafe("teacherAttendance")?.toArray?.() || [],
      ]);

      setTeachers(
        (teacherRows as Teacher[])
          .filter((row: any) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) => String(a.fullName || "").localeCompare(String(b.fullName || "")))
      );

      setAttendanceRows((attendanceData as TeacherAttendance[]).filter((row) => sameTenant(row as TenantRow)));
    } catch (error) {
      console.error("Failed to load teacher attendance:", error);
      clearData();
      showToast("error", "Failed to load teacher attendance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading, contextLoading,
    dataRevision,
  ]);

  const attendanceKeyMap = useMemo(() => {
    const map = new Map<number, TeacherAttendance>();
    attendanceRows.forEach((row: any) => {
      if (row.date !== date || row.isDeleted) return;
      const teacherId = idOf(row.teacherId);
      if (teacherId) map.set(teacherId, row);
    });
    return map;
  }, [attendanceRows, date]);

  useEffect(() => {
    const next: AttendanceMap = {};
    attendanceRows
      .filter((row: any) => row.date === date && !row.isDeleted)
      .forEach((row: any) => {
        const teacherId = idOf(row.teacherId);
        if (teacherId) {
          next[teacherId] = {
            clockIn: row.clockIn || "",
            clockOut: row.clockOut || "",
          };
        }
      });
    setAttendanceMap(next);
  }, [attendanceRows, date]);

  const roles = useMemo(() => {
    const set = new Set<Teacher["role"]>();
    teachers.forEach((row: any) => row.role && set.add(row.role));
    return Array.from(set).sort((a, b) => formatRole(a).localeCompare(formatRole(b)));
  }, [teachers]);

  const teacherRows = useMemo<TeacherRow[]>(() => {
    return teachers.map((teacher: any) => {
      const id = idOf(teacher.id);
      const current = attendanceMap[id] || { clockIn: "", clockOut: "" };
      const existingAttendance = attendanceKeyMap.get(id);
      const status = teacherStatus(current);
      return {
        id,
        teacher,
        existingAttendance,
        clockIn: current.clockIn,
        clockOut: current.clockOut,
        status,
        hours: calculateHours(current.clockIn, current.clockOut),
      };
    });
  }, [attendanceKeyMap, attendanceMap, teachers]);

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return teacherRows.filter(({ teacher, status }) => {
      const teacherAny: any = teacher;
      if (roleFilter !== "all" && teacherAny.role !== roleFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!query) return true;
      return `${teacherAny.fullName || ""} ${teacherAny.email || ""} ${teacherAny.phone || ""} ${teacherAny.qualification || ""} ${teacherAny.role || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [roleFilter, search, statusFilter, teacherRows]);

  const summary = useMemo(() => {
    const total = filteredTeachers.length;
    const present = filteredTeachers.filter((row) => row.status === "present").length;
    const incomplete = filteredTeachers.filter((row) => row.status === "incomplete").length;
    const notMarked = filteredTeachers.filter((row) => row.status === "not_marked").length;
    const marked = present + incomplete;
    const completion = total ? Math.round((marked / total) * 100) : 0;
    const totalHours = Math.round(filteredTeachers.reduce((sum, row) => sum + row.hours, 0) * 10) / 10;
    return { total, marked, present, incomplete, notMarked, completion, totalHours };
  }, [filteredTeachers]);

  const fullSummary = useMemo(() => {
    const total = teacherRows.length;
    const present = teacherRows.filter((row) => row.status === "present").length;
    const incomplete = teacherRows.filter((row) => row.status === "incomplete").length;
    const notMarked = teacherRows.filter((row) => row.status === "not_marked").length;
    const marked = present + incomplete;
    const completion = total ? Math.round((marked / total) * 100) : 0;
    const totalHours = Math.round(teacherRows.reduce((sum, row) => sum + row.hours, 0) * 10) / 10;
    return { total, present, incomplete, notMarked, marked, completion, totalHours };
  }, [teacherRows]);

  const countsByStatus = useMemo(
    () => [
      { label: "Present", value: fullSummary.present },
      { label: "Incomplete", value: fullSummary.incomplete },
      { label: "Not Marked", value: fullSummary.notMarked },
    ],
    [fullSummary]
  );

  const countsByRole = useMemo(() => {
    const map = new Map<string, number>();
    teacherRows.forEach(({ teacher }) => {
      const label = formatRole((teacher as any).role);
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [teacherRows]);

  const activeFilterCount = useMemo(() => [roleFilter, statusFilter].filter((value) => value !== "all").length, [roleFilter, statusFilter]);

  const updateTeacherAttendance = (teacherId: number, field: "clockIn" | "clockOut", value: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [teacherId]: {
        clockIn: prev[teacherId]?.clockIn || "",
        clockOut: prev[teacherId]?.clockOut || "",
        [field]: value,
      },
    }));
  };

  const clockInTeacher = (teacherId: number) => updateTeacherAttendance(teacherId, "clockIn", currentTime());
  const clockOutTeacher = (teacherId: number) => updateTeacherAttendance(teacherId, "clockOut", currentTime());

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
      filteredTeachers.forEach(({ id }) => {
        if (id) next[id] = { clockIn: next[id]?.clockIn || time, clockOut: next[id]?.clockOut || "" };
      });
      return next;
    });
  };

  const markAllClockOut = () => {
    const time = currentTime();
    setAttendanceMap((prev) => {
      const next = { ...prev };
      filteredTeachers.forEach(({ id }) => {
        if (id) next[id] = { clockIn: next[id]?.clockIn || "", clockOut: next[id]?.clockOut || time };
      });
      return next;
    });
  };

  const clearShown = () => {
    setAttendanceMap((prev) => {
      const next = { ...prev };
      filteredTeachers.forEach(({ id }) => {
        if (id) delete next[id];
      });
      return next;
    });
  };

  const clearFilters = () => {
    setRoleFilter("all");
    setStatusFilter("all");
  };

  const saveAttendance = async () => {
    if (!authenticated || !accountId) return showToast("error", "Sign in first.");
    if (!schoolId) return showToast("error", "Select school first.");
    if (!branchId) return showToast("error", "Select branch first.");
    if (!date) return showToast("error", "Select date.");

    try {
      setSaving(true);
      for (const { id: teacherId } of teacherRows) {
        if (!teacherId) continue;

        const row = attendanceMap[teacherId];
        const existing = attendanceKeyMap.get(teacherId);
        const shouldClear = !row || (!row.clockIn && !row.clockOut);

        if ((existing as any)?.id && shouldClear) {
          await softDeleteLocal("teacherAttendance", Number((existing as any).id));
          continue;
        }

        if (shouldClear) continue;

        const payload: Partial<TeacherAttendance> = {
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
          teacherId,
          date,
          clockIn: row.clockIn || undefined,
          clockOut: row.clockOut || undefined,
          isDeleted: false,
          active: true,
        } as Partial<TeacherAttendance>;

        if ((existing as any)?.id) await updateLocal("teacherAttendance", Number((existing as any).id), payload);
        else await createLocal("teacherAttendance", payload as unknown as TeacherAttendance);
      }

      await load();
      showToast("success", "Teacher attendance saved successfully.");
    } catch (error) {
      console.error("Failed to save teacher attendance:", error);
      showToast("error", "Failed to save teacher attendance.");
    } finally {
      setSaving(false);
    }
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return <State primary={primary} title="Opening Teacher Attendance..." text="Checking account, branch, active teachers, and attendance records." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing teacher attendance." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>No branch workspace selected</h2>
          <p>Teacher attendance belongs to the selected branch-admin workspace. Use Select Role again if the wrong branch is active.</p>
          <button type="button" className="ba-state-button" onClick={() => router.push("/account")}>Go to Account Setup</button>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      )}

      <section className="ba-search-card" aria-label="Teacher attendance search and actions">
        <span className={`module-dot ${summary.completion === 100 && summary.total > 0 ? "green" : summary.marked ? "orange" : "gray"}`} title={`${summary.completion}% complete`} />

        <label className="ba-search">
          <span>⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search teachers..." aria-label="Search teachers" />
        </label>

        <button type="button" className="ba-save-inline" onClick={saveAttendance} disabled={saving} aria-label="Save attendance">
          {saving ? "…" : "✓"}
        </button>

        <button type="button" className={`ba-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      <section className="ba-register-line" aria-label="Teacher attendance register context">
        <span>{date || "No date"}</span>
        <b>{summary.marked}/{summary.total} marked</b>
        <span>{summary.totalHours} hour(s)</span>
        <span>{summary.completion}% complete</span>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {roleFilter !== "all" && <button type="button" onClick={() => setRoleFilter("all")}>Role: {formatRole(roleFilter)} ×</button>}
          {statusFilter !== "all" && <button type="button" onClick={() => setStatusFilter("all")}>Status: {statusLabel(statusFilter)} ×</button>}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="Attendance Breakdown" rows={countsByStatus} total={Math.max(1, fullSummary.total)} />
          <AnalysisCard title="Teachers by Role" rows={countsByRole} total={Math.max(1, fullSummary.total)} />
          <article className="ba-analysis"><span>Total Hours</span><strong>{fullSummary.totalHours}</strong><p>Total completed work hours based on clock-in and clock-out times for this date.</p></article>
          <article className="ba-analysis"><span>Completion</span><strong>{fullSummary.completion}%</strong><p>Marked teachers divided by all active teachers in this branch.</p></article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView rows={filteredTeachers} date={date} updateTeacherAttendance={updateTeacherAttendance} clockInTeacher={clockInTeacher} clockOutTeacher={clockOutTeacher} clearTeacherAttendance={clearTeacherAttendance} />
      )}

      {viewMode === "cards" && (
        <section className="teacher-list">
          {filteredTeachers.map((row) => (
            <TeacherRowItem
              key={String(row.id)}
              row={row}
              primary={primary}
              updateTeacherAttendance={updateTeacherAttendance}
              clockInTeacher={clockInTeacher}
              clockOutTeacher={clockOutTeacher}
              clearTeacherAttendance={clearTeacherAttendance}
            />
          ))}

          {!filteredTeachers.length && <Empty icon="🕒" title="No teachers found" text="No active teachers were found in this branch or for the selected filters." />}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          date={date}
          setDate={setDate}
          roles={roles}
          roleFilter={roleFilter}
          statusFilter={statusFilter}
          setRoleFilter={setRoleFilter}
          setStatusFilter={setStatusFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          summary={summary}
          setViewMode={(mode) => { setViewMode(mode); setMoreOpen(false); }}
          onClockIn={() => { markAllClockIn(); setMoreOpen(false); }}
          onClockOut={() => { markAllClockOut(); setMoreOpen(false); }}
          onClear={() => { clearShown(); setMoreOpen(false); }}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function TeacherRowItem({
  row,
  primary,
  updateTeacherAttendance,
  clockInTeacher,
  clockOutTeacher,
  clearTeacherAttendance,
}: {
  row: TeacherRow;
  primary: string;
  updateTeacherAttendance: (teacherId: number, field: "clockIn" | "clockOut", value: string) => void;
  clockInTeacher: (teacherId: number) => void;
  clockOutTeacher: (teacherId: number) => void;
  clearTeacherAttendance: (teacherId: number) => void;
}) {
  const teacherAny: any = row.teacher;

  return (
    <article className="teacher-row">
      <div className="teacher-row-main">
        <Avatar name={teacherAny.fullName} photo={teacherAny.photo} primary={primary} />
        <span className="teacher-main">
          <strong>{teacherAny.fullName || "Unnamed teacher"}</strong>
          <small>{formatRole(teacherAny.role)}{teacherAny.phone ? ` · ${teacherAny.phone}` : ""}</small>
          <em>{teacherAny.email || teacherAny.qualification || "No contact provided"}</em>
        </span>
        <span className="teacher-side">
          <span className={`status-dot-mini ${statusTone(row.status)}`} title={statusLabel(row.status)} aria-label={statusLabel(row.status)} />
          <i>{row.hours ? `${row.hours}h` : "—"}</i>
        </span>
      </div>

      <div className="time-row">
        <label>
          <span>In</span>
          <input type="time" value={row.clockIn} onChange={(event) => updateTeacherAttendance(row.id, "clockIn", event.target.value)} />
        </label>
        <label>
          <span>Out</span>
          <input type="time" value={row.clockOut} onChange={(event) => updateTeacherAttendance(row.id, "clockOut", event.target.value)} />
        </label>
      </div>

      <div className="teacher-actions">
        <button type="button" onClick={() => clockInTeacher(row.id)}>Clock In</button>
        <button type="button" onClick={() => clockOutTeacher(row.id)}>Clock Out</button>
        <button type="button" className="danger" onClick={() => clearTeacherAttendance(row.id)}>Clear</button>
      </div>
    </article>
  );
}

function TableView({
  rows,
  date,
  updateTeacherAttendance,
  clockInTeacher,
  clockOutTeacher,
  clearTeacherAttendance,
}: {
  rows: TeacherRow[];
  date: string;
  updateTeacherAttendance: (teacherId: number, field: "clockIn" | "clockOut", value: string) => void;
  clockInTeacher: (teacherId: number) => void;
  clockOutTeacher: (teacherId: number) => void;
  clearTeacherAttendance: (teacherId: number) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Teachers ({rows.length})</th>
              <th>Role</th>
              <th>Contact</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Hours</th>
              <th>Existing Row</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, teacher, existingAttendance, clockIn, clockOut, hours, status }) => {
              const teacherAny: any = teacher;
              return (
                <tr key={String(id)}>
                  <td><strong>{teacherAny.fullName}</strong><span>{teacherAny.qualification || "No qualification"}</span></td>
                  <td>{formatRole(teacherAny.role)}</td>
                  <td><strong>{teacherAny.phone || "—"}</strong><span>{teacherAny.email || "No email"}</span></td>
                  <td><input type="time" value={clockIn} onChange={(event) => updateTeacherAttendance(id, "clockIn", event.target.value)} /></td>
                  <td><input type="time" value={clockOut} onChange={(event) => updateTeacherAttendance(id, "clockOut", event.target.value)} /></td>
                  <td>{hours}</td>
                  <td>{(existingAttendance as any)?.id ? `Saved · ${dateText((existingAttendance as any).updatedAt)}` : `New · ${date}`}</td>
                  <td><Chip tone={statusTone(status)}>{statusLabel(status)}</Chip></td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => clockInTeacher(id)}>Clock In</button>
                      <button type="button" onClick={() => clockOutTeacher(id)}>Clock Out</button>
                      <button type="button" className="ba-delete" onClick={() => clearTeacherAttendance(id)}>Clear</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="ba-empty-table">No teachers match this register/filter.</div>}
      </div>
    </section>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function FilterSheet({
  date,
  setDate,
  roles,
  roleFilter,
  statusFilter,
  setRoleFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  date: string;
  setDate: (value: string) => void;
  roles: Teacher["role"][];
  roleFilter: Teacher["role"] | "all";
  statusFilter: TeacherStatusFilter;
  setRoleFilter: (value: Teacher["role"] | "all") => void;
  setStatusFilter: (value: TeacherStatusFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div><h2>Filters</h2><p>Choose the date, role, and attendance status for this register.</p></div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-form compact">
          <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>
            <span>Role</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as Teacher["role"] | "all")}>
              <option value="all">All roles</option>
              {roles.map((role) => <option key={String(role)} value={String(role)}>{formatRole(role)}</option>)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TeacherStatusFilter)}>
              <option value="all">All teachers</option>
              <option value="present">Present</option>
              <option value="incomplete">Incomplete</option>
              <option value="not_marked">Not Marked</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>Clear</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  summary,
  setViewMode,
  onClockIn,
  onClockOut,
  onClear,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  summary: { total: number; marked: number; present: number; incomplete: number; notMarked: number; completion: number; totalHours: number };
  setViewMode: (mode: ViewMode) => void;
  onClockIn: () => void;
  onClockOut: () => void;
  onClear: () => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div><h2>More</h2><p>{summary.marked} of {summary.total} teacher record(s) marked · {summary.totalHours} hour(s).</p></div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}><span>☰</span><b>List view</b><small>Compact teacher attendance rows</small></button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}><span>☷</span><b>Table view</b><small>Dense register for laptop work</small></button>
          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}><span>◔</span><b>Analytics</b><small>Status, role, hours and completion</small></button>
          <button type="button" onClick={onClockIn}><span>↘</span><b>Clock in shown</b><small>Set clock-in time for visible teachers</small></button>
          <button type="button" onClick={onClockOut}><span>↗</span><b>Clock out shown</b><small>Set clock-out time for visible teachers</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local teacher attendance records</small></button>
          <button type="button" className="danger" onClick={onClear}><span>⌫</span><b>Clear shown</b><small>Clear visible unsaved clock times</small></button>
        </div>
      </section>
    </div>
  );
}

function AnalysisCard({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>
      <div className="ba-analysis-list">
        {rows.map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <section key={row.label}>
              <div><b>{row.label}</b><small>{row.value} · {share}%</small></div>
              <div className="ba-progress"><i style={{ width: `${Math.max(4, share)}%` }} /></div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *, .ba-page *::before, .ba-page *::after { box-sizing: border-box; min-width: 0; }
.ba-page button, .ba-page input, .ba-page select, .ba-page textarea { font: inherit; max-width: 100%; }
.ba-page button { -webkit-tap-highlight-color: transparent; }
.ba-page input, .ba-page select, .ba-page textarea {
  width: 100%; min-height: 44px; border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px; padding: 0 12px; background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827)); outline: none; font-weight: 750;
}
.ba-page input:focus, .ba-page select:focus, .ba-page textarea:focus {
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}

.ba-state, .ba-search-card, .ba-table-card, .ba-analysis, .ba-empty, .ba-sheet, .teacher-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state { min-height: min(420px, calc(100dvh - 32px)); width: min(520px,100%); margin: 0 auto; display:grid; place-items:center; align-content:center; gap:10px; padding:22px; border-radius:28px; text-align:center; }
.ba-spinner { width:38px; height:38px; border-radius:999px; border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent); border-top-color:var(--ba-primary); animation:spin .8s linear infinite; }
.ba-state h2 { margin:0; font-size:22px; font-weight:1000; letter-spacing:-.04em; }
.ba-state p { max-width:34rem; margin:0; color:var(--muted,#64748b); font-size:13px; line-height:1.6; }
.ba-state-button { min-height:42px; border:0; border-radius:999px; padding:0 16px; background:var(--ba-primary); color:#fff; font-weight:950; cursor:pointer; }

.ba-toast { position:sticky; top:8px; z-index:40; display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; padding:12px 14px; border-radius:18px; font-size:13px; font-weight:850; box-shadow:0 18px 40px rgba(15,23,42,.12); }
.ba-toast.success { background:rgba(34,197,94,.14); color:#166534; }
.ba-toast.error { background:rgba(239,68,68,.12); color:#991b1b; }
.ba-toast.info { background:rgba(59,130,246,.13); color:#1d4ed8; }
.ba-toast button { border:0; background:transparent; color:currentColor; font-weight:1000; cursor:pointer; }

.ba-search-card { display:grid; grid-template-columns:auto minmax(0,1fr) auto auto auto; gap:8px; align-items:center; margin-top:2px; padding:8px; border-radius:24px; }
.module-dot { width:10px; height:10px; display:inline-block; border-radius:999px; background:var(--muted,#64748b); box-shadow:0 0 0 4px color-mix(in srgb,currentColor 10%,transparent); margin-left:4px; }
.module-dot.green { background:#22c55e; } .module-dot.orange { background:#f59e0b; } .module-dot.gray { background:#94a3b8; }
.ba-search { min-width:0; display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:8px; min-height:44px; padding:0 11px; border-radius:18px; background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent); }
.ba-search span { color:var(--muted,#64748b); font-size:17px; font-weight:1000; }
.ba-search input { min-height:42px; border:0; padding:0; border-radius:0; background:transparent; box-shadow:none; font-size:14px; }
.ba-icon-button, .ba-filter-button, .ba-save-inline { width:42px; height:42px; border:1px solid var(--border,rgba(0,0,0,.10)); border-radius:999px; display:grid; place-items:center; background:var(--card-bg, var(--surface, var(--bg, transparent))); color:var(--text,#111827); font-size:18px; font-weight:1000; cursor:pointer; box-shadow:0 10px 22px rgba(15,23,42,.045); }
.ba-save-inline { border-color:var(--ba-primary); background:var(--ba-primary); color:#fff; font-size:20px; box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent); }
.ba-save-inline:disabled { opacity:.7; cursor:not-allowed; }
.ba-filter-button { position:relative; background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff)); color:var(--ba-primary); }
.ba-filter-button.active { background:var(--ba-primary); color:#fff; border-color:var(--ba-primary); }
.ba-filter-button b { position:absolute; top:-4px; right:-4px; min-width:19px; height:19px; display:grid; place-items:center; border-radius:999px; background:#ef4444; color:#fff; font-size:10px; border:2px solid var(--card-bg,#fff); }
.ba-slider-icon { width:21px; height:21px; fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }

.ba-register-line { display:flex; align-items:center; gap:7px; overflow-x:auto; padding:8px 1px 0; color:var(--muted,#64748b); scrollbar-width:none; }
.ba-register-line::-webkit-scrollbar { display:none; }
.ba-register-line span, .ba-register-line b { flex:0 0 auto; min-height:27px; display:inline-flex; align-items:center; border-radius:999px; padding:0 9px; background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent); font-size:11px; font-weight:900; white-space:nowrap; }
.ba-register-line b { color:var(--ba-primary); background:color-mix(in srgb,var(--ba-primary) 11%,transparent); }

.ba-filter-chips { display:flex; gap:7px; overflow-x:auto; padding:8px 1px 0; scrollbar-width:none; }
.ba-filter-chips::-webkit-scrollbar { display:none; }
.ba-filter-chips button { flex:0 0 auto; min-height:31px; border:0; border-radius:999px; padding:0 10px; background:color-mix(in srgb,var(--ba-primary) 11%,transparent); color:var(--ba-primary); font-size:11px; font-weight:950; white-space:nowrap; cursor:pointer; }

.teacher-list { display:grid; grid-template-columns:minmax(0,1fr); gap:7px; margin-top:10px; }
.teacher-row { width:100%; display:grid; gap:8px; padding:10px; border-radius:22px; text-align:left; transition:transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease); }
.teacher-row:hover { transform:translateY(-1px); border-color:color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10))); box-shadow:0 16px 34px rgba(15,23,42,.07); }
.teacher-row-main { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; }
.ba-avatar { width:48px; height:48px; flex:0 0 auto; display:grid; place-items:center; border-radius:18px; color:#fff; font-size:17px; font-weight:1000; box-shadow:0 12px 24px rgba(15,23,42,.12); }
.teacher-main, .teacher-main strong, .teacher-main small, .teacher-main em { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.teacher-main strong { color:var(--text,#111827); font-size:14px; font-weight:1000; letter-spacing:-.02em; }
.teacher-main small { margin-top:3px; color:var(--muted,#64748b); font-size:12px; font-weight:850; font-style:normal; }
.teacher-main em { margin-top:3px; color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827)); font-size:11px; font-weight:750; font-style:normal; }
.teacher-side { display:grid; justify-items:end; gap:6px; flex:0 0 auto; }
.teacher-side i { color:var(--muted,#64748b); font-style:normal; font-size:11px; font-weight:1000; line-height:1; }
.status-dot-mini { width:10px; height:10px; display:inline-block; border-radius:999px; background:var(--muted,#64748b); box-shadow:0 0 0 4px color-mix(in srgb,currentColor 10%,transparent); }
.status-dot-mini.green { background:#22c55e; } .status-dot-mini.orange { background:#f59e0b; } .status-dot-mini.gray { background:#94a3b8; }
.time-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
.time-row label { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:6px; min-width:0; }
.time-row label span { color:var(--muted,#64748b); font-size:10px; font-weight:1000; text-transform:uppercase; letter-spacing:.07em; }
.time-row input { min-height:36px; border-radius:14px; font-size:12px; font-weight:850; }
.teacher-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
.teacher-actions button { min-height:34px; border:1px solid var(--border,rgba(0,0,0,.10)); border-radius:999px; padding:0 9px; background:var(--surface,#fff); color:var(--text,#111827); font-size:11px; font-weight:950; cursor:pointer; }
.teacher-actions button:first-child { background:var(--ba-primary); color:#fff; border-color:var(--ba-primary); }
.teacher-actions button.danger { color:var(--muted,#64748b); background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); border-color:color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10))); }

.ba-chip { max-width:100%; display:inline-flex; align-items:center; min-height:24px; padding:3px 8px; border-radius:999px; font-size:10px; font-weight:950; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-transform:capitalize; }
.ba-chip.green { background:rgba(34,197,94,.12); color:#16a34a; }
.ba-chip.red { background:rgba(239,68,68,.12); color:#dc2626; }
.ba-chip.blue { background:rgba(59,130,246,.12); color:#2563eb; }
.ba-chip.gray { background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color:var(--muted,#64748b); }
.ba-chip.orange { background:rgba(245,158,11,.14); color:#b45309; }
.ba-chip.purple { background:rgba(147,51,234,.12); color:#7e22ce; }

.ba-table-card { margin-top:10px; padding:0; border-radius:22px; overflow:hidden; }
.ba-table-scroll { width:100%; max-width:100%; overflow-x:auto; }
.ba-table-scroll table { width:100%; min-width:1120px; border-collapse:collapse; background:var(--card-bg, var(--surface, var(--bg, transparent))); }
.ba-table-scroll th, .ba-table-scroll td { padding:10px; border-bottom:1px solid var(--border,rgba(0,0,0,.08)); vertical-align:top; text-align:left; font-size:13px; }
.ba-table-scroll th { background:var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent))))); color:var(--table-header-text, var(--muted, var(--text))); font-size:11px; font-weight:1000; text-transform:uppercase; letter-spacing:.07em; }
.ba-table-scroll td strong, .ba-table-scroll td span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ba-table-scroll td span { margin-top:3px; color:var(--muted, var(--text)); font-size:11px; }
.ba-table-scroll input { min-height:36px; border-radius:13px; font-size:12px; }
.ba-table-actions { display:flex; flex-wrap:nowrap; gap:7px; }
.ba-table-actions button { min-height:34px; border:1px solid var(--border,rgba(0,0,0,.10)); border-radius:999px; padding:0 10px; background:var(--surface,#fff); color:var(--text,#111827); font-size:11px; font-weight:950; cursor:pointer; white-space:nowrap; }
.ba-table-actions button:first-child { background:var(--ba-primary); color:#fff; border-color:var(--ba-primary); }
.ba-table-actions .ba-delete { color:var(--muted,#64748b); background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); border-color:color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10))); }
.ba-empty-table { padding:22px; text-align:center; color:var(--muted,#64748b); font-weight:850; }

.ba-analysis-grid { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; margin-top:10px; }
.ba-analysis { padding:13px; border-radius:24px; }
.ba-analysis span { color:var(--muted, var(--text)); font-size:11px; font-weight:950; text-transform:uppercase; letter-spacing:.08em; }
.ba-analysis strong { display:block; margin-top:8px; font-size:clamp(22px,7vw,30px); line-height:1; font-weight:1000; letter-spacing:-.06em; overflow-wrap:anywhere; }
.ba-analysis p { margin:8px 0 0; color:var(--muted,#64748b); font-size:12px; line-height:1.5; }
.ba-analysis-list { display:grid; gap:10px; margin-top:12px; }
.ba-analysis-list section { display:grid; gap:6px; padding:10px; border-radius:16px; background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent); }
.ba-analysis-list section > div:first-child { display:flex; justify-content:space-between; gap:10px; }
.ba-analysis-list b, .ba-analysis-list small { font-size:12px; }
.ba-analysis-list small { color:var(--muted,#64748b); font-weight:850; }
.ba-progress { height:8px; border-radius:999px; background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent); overflow:hidden; }
.ba-progress i { display:block; height:100%; border-radius:inherit; background:var(--ba-primary); }
.ba-empty { display:grid; place-items:center; align-content:center; gap:8px; min-height:220px; text-align:center; border-style:dashed; margin-top:10px; padding:18px; border-radius:24px; }
.ba-empty-icon { width:56px; height:56px; display:grid; place-items:center; border-radius:22px; background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)); font-size:28px; }
.ba-empty h3 { margin:0; font-size:18px; font-weight:1000; }
.ba-empty p { margin:0; color:var(--muted,#64748b); font-size:13px; line-height:1.6; }

.ba-sheet-backdrop { position:fixed; inset:0; z-index:70; display:grid; place-items:end center; padding:10px; background:rgba(15,23,42,.50); backdrop-filter:blur(10px); }
.ba-sheet { width:min(640px,100%); max-height:min(86dvh,720px); overflow-y:auto; border-radius:28px; padding:14px; }
.ba-sheet.small { width:min(520px,100%); }
.ba-sheet-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding-bottom:12px; }
.ba-sheet-head h2 { margin:0; color:var(--text,#111827); font-size:20px; font-weight:1000; letter-spacing:-.05em; }
.ba-sheet-head p { margin:5px 0 0; color:var(--muted,#64748b); font-size:12px; line-height:1.5; }
.ba-sheet-head button { width:38px; height:38px; border:1px solid var(--border,rgba(0,0,0,.10)); border-radius:999px; background:var(--surface,#fff); color:var(--text,#111827); font-weight:1000; cursor:pointer; }
.ba-form { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; }
.ba-form label { display:grid; gap:6px; }
.ba-form span { color:var(--muted, var(--text)); font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.06em; }
.ba-sheet-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
.ba-sheet-actions button { min-height:40px; border:1px solid var(--border,rgba(0,0,0,.10)); border-radius:999px; padding:0 14px; background:var(--surface,#fff); color:var(--text,#111827); font-size:12px; font-weight:950; cursor:pointer; }
.ba-sheet-actions .primary { background:var(--ba-primary); color:#fff; border-color:var(--ba-primary); }
.ba-menu-list { display:grid; gap:8px; }
.ba-menu-list button { width:100%; display:grid; grid-template-columns:auto minmax(0,1fr); column-gap:10px; row-gap:2px; align-items:center; min-height:56px; border:1px solid var(--border,rgba(0,0,0,.10)); border-radius:18px; padding:10px; background:var(--surface,#fff); color:var(--text,#111827); text-align:left; cursor:pointer; }
.ba-menu-list button > span { grid-row:1 / span 2; width:34px; height:34px; display:grid; place-items:center; border-radius:14px; background:color-mix(in srgb,var(--ba-primary) 10%,transparent); color:var(--ba-primary); font-weight:1000; }
.ba-menu-list b { font-size:13px; font-weight:1000; }
.ba-menu-list small { color:var(--muted, var(--text)); font-size:11px; font-weight:750; }
.ba-menu-list button.active { border-color:color-mix(in srgb,var(--ba-primary) 34%,var(--border,rgba(0,0,0,.10))); background:color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff)); }
.ba-menu-list button.danger > span { background:rgba(239,68,68,.10); color:#dc2626; }

@media (min-width:680px) {
  .ba-page { padding:calc(12px * var(--local-density-scale,1)); }
  .teacher-list { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .ba-analysis-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .ba-sheet-backdrop { place-items:center; padding:18px; }
  .ba-form.compact { grid-template-columns:repeat(3,minmax(0,1fr)); }
}
@media (min-width:1040px) {
  .ba-page { padding:calc(16px * var(--local-density-scale,1)); }
  .teacher-list { grid-template-columns:repeat(3,minmax(0,1fr)); max-width:1180px; }
  .ba-analysis-grid { grid-template-columns:repeat(4,minmax(0,1fr)); }
}
@media (max-width:520px) {
  .ba-page { padding:calc(6px * var(--local-density-scale,1)); }
  .ba-search-card { grid-template-columns:auto minmax(0,1fr) auto auto auto; gap:6px; padding:7px; border-radius:22px; }
  .ba-icon-button, .ba-filter-button, .ba-save-inline { width:40px; height:40px; }
  .teacher-actions { grid-template-columns:1fr; }
  .time-row { grid-template-columns:1fr; }
  .ba-sheet { border-radius:24px; }
}
`;
