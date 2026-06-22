"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { db } from "../../lib/db";
import {
  listOpenScheduleConflicts,
  listScheduleResources,
  listSessionsForBranch,
  listTimetables,
  formatMinuteRange,
} from "../../lib/scheduling";

type AnyRow = Record<string, any>;

type ViewMode = "timetable" | "cards" | "table" | "analytics";
type TimetableMode = "week" | "day" | "teacher" | "class" | "room";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow) {
  return row?.id ?? row?.localId ?? row?.cloudId;
}

function cleanId(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  return row && row.isDeleted !== true && (!row.accountId || !accountId || row.accountId === accountId);
}

function schoolIdOf(row: AnyRow) {
  return cleanId(row?.schoolId ?? row?.schoolLocalId ?? row?.payload?.schoolId);
}

function branchIdOf(row: AnyRow) {
  return cleanId(row?.branchId ?? row?.branchLocalId ?? row?.payload?.branchId);
}

function isSchoolRow(row: AnyRow, accountId?: string | null, schoolId?: number | null) {
  return sameAccount(row, accountId) && schoolIdOf(row) === Number(schoolId || 0);
}

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function rowName(row?: AnyRow) {
  return text(row?.fullName || row?.name || row?.title || row?.email, "Unnamed");
}

function sessionTitle(row: AnyRow) {
  return text(row?.title || row?.sessionType || row?.type || row?.subjectName, "Timetable session");
}

function sessionDay(row: AnyRow) {
  const value = text(row?.dayOfWeek || row?.day || row?.weekday, "Monday");
  const match = DAYS.find((day) => day.toLowerCase() === value.toLowerCase());
  return match || value;
}

function dayIndex(day: string) {
  const index = DAYS.findIndex((item) => item.toLowerCase() === day.toLowerCase());
  return index === -1 ? 99 : index;
}

function startMinute(row: AnyRow) {
  return n(row?.startMinute ?? row?.start ?? row?.startTimeMinute);
}

function endMinute(row: AnyRow) {
  const end = n(row?.endMinute ?? row?.end ?? row?.endTimeMinute);
  return end || startMinute(row) + 60;
}

function sessionTime(row: AnyRow) {
  try {
    return formatMinuteRange(startMinute(row), endMinute(row));
  } catch {
    return `${startMinute(row)} - ${endMinute(row)}`;
  }
}

function branchName(branches: AnyRow[], branchId: any) {
  const branch = branches.find((item) => Number(idOf(item)) === Number(branchId));
  return branch?.name || branch?.branchName || "Branch";
}

function className(classes: AnyRow[], classId: any) {
  const row = classes.find((item) => Number(idOf(item)) === Number(classId));
  return row?.name || row?.className || "No class";
}

function subjectName(subjects: AnyRow[], subjectId: any) {
  const row = subjects.find((item) => Number(idOf(item)) === Number(subjectId));
  return row?.name || row?.subjectName || "No subject";
}

function teacherName(teachers: AnyRow[], teacherId: any) {
  const row = teachers.find((item) => Number(idOf(item)) === Number(teacherId));
  return rowName(row || {});
}

function resourceName(resources: AnyRow[], session: AnyRow) {
  const row = resources.find((item) => Number(idOf(item)) === Number(session.resourceId));
  return row?.name || row?.roomName || session.roomName || session.room || "No room";
}

function sessionTeacherId(session: AnyRow) {
  return cleanId(session.teacherLocalId ?? session.teacherId ?? session.staffId);
}

function sessionClassId(session: AnyRow) {
  return cleanId(session.classId ?? session.classLocalId);
}

function sessionSubjectId(session: AnyRow) {
  return cleanId(session.subjectId ?? session.subjectLocalId);
}

function sessionResourceId(session: AnyRow) {
  return cleanId(session.resourceId ?? session.roomId ?? session.roomLocalId);
}

function sessionBranchId(session: AnyRow) {
  return cleanId(session.branchId ?? session.branchLocalId);
}

function uniqueRows(rows: AnyRow[]) {
  const seen = new Set<string>();

  return rows.filter((row, index) => {
    const key = String(idOf(row) || `${sessionBranchId(row)}-${sessionDay(row)}-${startMinute(row)}-${sessionTitle(row)}-${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortSessions(rows: AnyRow[]) {
  return [...rows].sort((a, b) => {
    return (
      sessionBranchId(a) - sessionBranchId(b) ||
      dayIndex(sessionDay(a)) - dayIndex(sessionDay(b)) ||
      startMinute(a) - startMinute(b) ||
      sessionTitle(a).localeCompare(sessionTitle(b))
    );
  });
}

function toneForConflict(severity?: string): Tone {
  const value = String(severity || "").toLowerCase();
  if (["critical", "high", "urgent"].includes(value)) return "red";
  if (["medium", "warning"].includes(value)) return "orange";
  return "blue";
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`bt-chip ${tone}`}>{children}</span>;
}

function SummaryCard({
  label,
  value,
  icon,
  warning,
  positive,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  warning?: boolean;
  positive?: boolean;
}) {
  return (
    <article className={`bt-summary ${warning ? "warning" : ""} ${positive ? "positive" : ""}`}>
      <div>{icon}</div>
      <section>
        <strong>{value}</strong>
        <span>{label}</span>
      </section>
    </article>
  );
}

function EmptyCard({ text: title }: { text: string }) {
  return (
    <section className="bt-empty">
      <div>📌</div>
      <h3>No records</h3>
      <p>{title}</p>
    </section>
  );
}

function Toolbar({
  view,
  setView,
  count,
}: {
  view: ViewMode;
  setView: (value: ViewMode) => void;
  count: number;
}) {
  const views: { key: ViewMode; label: string; icon: string }[] = [
    { key: "timetable", label: "Timetable", icon: "🗓️" },
    { key: "cards", label: "Cards", icon: "▦" },
    { key: "table", label: "Table", icon: "☷" },
    { key: "analytics", label: "Analytics", icon: "📊" },
  ];

  return (
    <section className="bt-toolbar">
      <div className="bt-tabs">
        {views.map((item) => (
          <button
            key={item.key}
            type="button"
            className={view === item.key ? "active" : ""}
            onClick={() => setView(item.key)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <Chip>{count} shown</Chip>
    </section>
  );
}

function TimetableModeSwitch({
  mode,
  setMode,
}: {
  mode: TimetableMode;
  setMode: (value: TimetableMode) => void;
}) {
  const modes: { key: TimetableMode; label: string }[] = [
    { key: "week", label: "Week" },
    { key: "day", label: "Day" },
    { key: "teacher", label: "Teacher" },
    { key: "class", label: "Class" },
    { key: "room", label: "Room" },
  ];

  return (
    <div className="bt-mode-tabs">
      {modes.map((item) => (
        <button
          key={item.key}
          type="button"
          className={mode === item.key ? "active" : ""}
          onClick={() => setMode(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function BranchTimetableOverview() {
  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = Number(activeSchoolId || activeSchool?.id || settings?.schoolId || 0);
  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [branches, setBranches] = useState<AnyRow[]>([]);
  const [sessions, setSessions] = useState<AnyRow[]>([]);
  const [timetables, setTimetables] = useState<AnyRow[]>([]);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [subjects, setSubjects] = useState<AnyRow[]>([]);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [resources, setResources] = useState<AnyRow[]>([]);
  const [conflicts, setConflicts] = useState<AnyRow[]>([]);
  const [view, setView] = useState<ViewMode>("timetable");
  const [timetableMode, setTimetableMode] = useState<TimetableMode>("week");
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [query, setQuery] = useState("");
  const [branchId, setBranchId] = useState("all");

  useEffect(() => {
    if (!accountLoading && !contextLoading && (!authenticated || !accountId)) {
      router.replace("/login");
    }
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  async function load() {
    if (!accountId || !schoolId) {
      setLoading(false);
      setNotice("No active school was found for this timetable overview.");
      return;
    }

    setLoading(true);
    setNotice("");

    try {
      const [branchRows, classRows, subjectRows, teacherRows] = await Promise.all([
        safeArray<AnyRow>("branches"),
        safeArray<AnyRow>("classes"),
        safeArray<AnyRow>("subjects"),
        safeArray<AnyRow>("teachers"),
      ]);

      const schoolBranches = branchRows.filter((row: AnyRow) =>
        isSchoolRow(row, accountId, schoolId)
      );

      const branchIds = new Set<number>(
        schoolBranches
          .map((branch: AnyRow) => cleanId(idOf(branch)))
          .filter(Boolean)
      );

      setBranches(schoolBranches);
      setClasses(classRows.filter((row: AnyRow) => isSchoolRow(row, accountId, schoolId) || branchIds.has(branchIdOf(row))));
      setSubjects(subjectRows.filter((row: AnyRow) => sameAccount(row, accountId) && (schoolIdOf(row) === schoolId || branchIds.has(branchIdOf(row)) || !schoolIdOf(row))));
      setTeachers(teacherRows.filter((row: AnyRow) => isSchoolRow(row, accountId, schoolId) || branchIds.has(branchIdOf(row))));

      const allSessions: AnyRow[] = [];
      const allTimetables: AnyRow[] = [];
      const allResources: AnyRow[] = [];
      const allConflicts: AnyRow[] = [];

      for (const branch of schoolBranches) {
        const id = cleanId(idOf(branch));
        if (!id) continue;

        try {
          const [sessionRows, timetableRows, resourceRows, conflictRows] = await Promise.all([
            listSessionsForBranch({ accountId, schoolId, branchId: id }),
            listTimetables({ accountId, schoolId, branchId: id }),
            listScheduleResources({ accountId, schoolId, branchId: id }),
            listOpenScheduleConflicts({ accountId, schoolId, branchId: id }),
          ]);

          allSessions.push(...(sessionRows as AnyRow[]));
          allTimetables.push(...(timetableRows as AnyRow[]));
          allResources.push(...(resourceRows as AnyRow[]));
          allConflicts.push(...(conflictRows as AnyRow[]));
        } catch {
          // Keep loading local fallback data below.
        }
      }

      const localSessions = [
        ...(await safeArray<AnyRow>("timetableSessions")),
        ...(await safeArray<AnyRow>("scheduleSessions")),
        ...(await safeArray<AnyRow>("classSessions")),
        ...(await safeArray<AnyRow>("sessions")),
      ]
        .filter((row: AnyRow) => sameAccount(row, accountId))
        .filter((row: AnyRow) => schoolIdOf(row) === schoolId || branchIds.has(branchIdOf(row)));

      const localTimetables = [
        ...(await safeArray<AnyRow>("timetables")),
        ...(await safeArray<AnyRow>("schoolTimetables")),
        ...(await safeArray<AnyRow>("branchTimetables")),
      ]
        .filter((row: AnyRow) => sameAccount(row, accountId))
        .filter((row: AnyRow) => schoolIdOf(row) === schoolId || branchIds.has(branchIdOf(row)));

      const localResources = [
        ...(await safeArray<AnyRow>("scheduleResources")),
        ...(await safeArray<AnyRow>("resources")),
        ...(await safeArray<AnyRow>("rooms")),
      ]
        .filter((row: AnyRow) => sameAccount(row, accountId))
        .filter((row: AnyRow) => schoolIdOf(row) === schoolId || branchIds.has(branchIdOf(row)) || !schoolIdOf(row));

      const visibleSessions = uniqueRows([...allSessions, ...localSessions])
        .filter((row: AnyRow) => row?.isDeleted !== true)
        .map((row: AnyRow) => ({
          ...row,
          branchId: branchIdOf(row) || row.branchId,
          schoolId: schoolIdOf(row) || schoolId,
        }));

      setSessions(visibleSessions);
      setTimetables(uniqueRows([...allTimetables, ...localTimetables]).filter((row: AnyRow) => row?.isDeleted !== true));
      setResources(uniqueRows([...allResources, ...localResources]).filter((row: AnyRow) => row?.isDeleted !== true));
      setConflicts(uniqueRows(allConflicts).filter((row: AnyRow) => row?.isDeleted !== true));

      if (!schoolBranches.length) {
        setNotice("No branches were found under this school yet.");
      } else if (!visibleSessions.length) {
        setNotice("Branches were found, but no timetable sessions were found yet.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, schoolId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    return sortSessions(
      sessions
        .filter((session: AnyRow) => branchId === "all" || Number(sessionBranchId(session)) === Number(branchId))
        .filter((session: AnyRow) => {
          if (!q) return true;

          return [
            sessionTitle(session),
            sessionDay(session),
            session.sessionType,
            session.roomName,
            branchName(branches, sessionBranchId(session)),
            className(classes, sessionClassId(session)),
            subjectName(subjects, sessionSubjectId(session)),
            teacherName(teachers, sessionTeacherId(session)),
            resourceName(resources, session),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        })
    );
  }, [branches, branchId, classes, query, resources, sessions, subjects, teachers]);

  const summary = useMemo(
    () => ({
      branches: branches.length,
      timetables: timetables.length,
      sessions: filtered.length,
      teachers: new Set(filtered.map((session: AnyRow) => sessionTeacherId(session)).filter(Boolean)).size,
      classes: new Set(filtered.map((session: AnyRow) => sessionClassId(session)).filter(Boolean)).size,
      rooms: new Set(filtered.map((session: AnyRow) => sessionResourceId(session) || text(session.roomName)).filter(Boolean)).size,
      conflicts: conflicts.length,
    }),
    [branches.length, conflicts.length, filtered, timetables.length]
  );

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <main className="bt-page" style={{ "--bt-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="bt-state">
          <h2>Opening timetable overview...</h2>
          <p>Loading timetable sessions, teachers, classes, rooms and conflicts across all branches.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="bt-page" style={{ "--bt-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="bt-hero">
        <div className="bt-hero-left">
          <div className="bt-icon">🗓️</div>
          <div className="bt-title">
            <p>School Admin Monitoring</p>
            <h2>Timetable Overview</h2>
            <span>{activeSchool?.name || "School"} · All branch timetables in one workspace</span>
          </div>
        </div>

        <div className="bt-actions">
          <button className="bt-btn" type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </section>

      {notice ? <section className="bt-notice">{notice}</section> : null}

      <section className="bt-summary-grid">
        <SummaryCard label="Branches" value={summary.branches} icon="🏫" />
        <SummaryCard label="Timetables" value={summary.timetables} icon="🗂️" />
        <SummaryCard label="Sessions" value={summary.sessions} icon="📚" positive />
        <SummaryCard label="Teachers" value={summary.teachers} icon="👨‍🏫" />
        <SummaryCard label="Classes" value={summary.classes} icon="🏛️" />
        <SummaryCard label="Open Conflicts" value={summary.conflicts} icon="⚠️" warning={summary.conflicts > 0} />
      </section>

      <Toolbar view={view} setView={setView} count={filtered.length} />

      <section className="bt-filter">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions, teacher, class, subject, room..." />

        <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="all">All Branches</option>
          {branches.map((branch: AnyRow) => (
            <option key={String(idOf(branch))} value={String(idOf(branch))}>
              {branch.name || branch.branchName || `Branch ${idOf(branch)}`}
            </option>
          ))}
        </select>

        <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)}>
          {DAYS.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>

        <button className="bt-btn" type="button" onClick={load}>
          Reload
        </button>
      </section>

      {conflicts.length > 0 ? (
        <section className="bt-section">
          <div className="bt-conflict-head">
            <div>
              <p>Schedule Warnings</p>
              <h3>{conflicts.length} open conflict(s)</h3>
            </div>
            <Chip tone="red">Needs review</Chip>
          </div>

          <div className="bt-list">
            {conflicts.slice(0, 4).map((conflict: AnyRow, index: number) => (
              <article className="bt-card" key={String(idOf(conflict) || index)}>
                <div className="bt-card-top">
                  <div className="bt-avatar">⚠️</div>
                  <div className="bt-card-main">
                    <h3>{conflict.title || "Schedule conflict"}</h3>
                    <p>{conflict.description || "Conflict detected"}</p>
                    <div className="bt-chip-row">
                      <Chip tone={toneForConflict(conflict.severity)}>{conflict.severity || "warning"}</Chip>
                      <Chip tone="orange">{conflict.conflictType || "conflict"}</Chip>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view === "timetable" ? (
        <section className="bt-timetable-panel">
          <div className="bt-timetable-head">
            <div>
              <p>Actual Timetable</p>
              <h3>
                {timetableMode === "week"
                  ? "Weekly School Timetable"
                  : timetableMode === "day"
                  ? `${selectedDay} Timetable`
                  : timetableMode === "teacher"
                  ? "Teacher Timetables"
                  : timetableMode === "class"
                  ? "Class Timetables"
                  : "Room Timetables"}
              </h3>
            </div>

            <TimetableModeSwitch mode={timetableMode} setMode={setTimetableMode} />
          </div>

          {timetableMode === "week" ? (
            <WeekTimetable sessions={filtered} branches={branches} classes={classes} subjects={subjects} teachers={teachers} resources={resources} />
          ) : null}

          {timetableMode === "day" ? (
            <DayTimetable
              day={selectedDay}
              sessions={filtered}
              branches={branches}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}

          {timetableMode === "teacher" ? (
            <GroupedTimetable
              title="Teacher"
              sessions={filtered}
              getGroupKey={(session) => String(sessionTeacherId(session) || "none")}
              getGroupLabel={(session) => teacherName(teachers, sessionTeacherId(session)) || "No teacher"}
              branches={branches}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}

          {timetableMode === "class" ? (
            <GroupedTimetable
              title="Class"
              sessions={filtered}
              getGroupKey={(session) => String(sessionClassId(session) || "none")}
              getGroupLabel={(session) => className(classes, sessionClassId(session))}
              branches={branches}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}

          {timetableMode === "room" ? (
            <GroupedTimetable
              title="Room"
              sessions={filtered}
              getGroupKey={(session) => String(sessionResourceId(session) || session.roomName || "none")}
              getGroupLabel={(session) => resourceName(resources, session)}
              branches={branches}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}
        </section>
      ) : null}

      {view === "analytics" ? (
        <section className="bt-section bt-breakdown-grid">
          <AnalyticsCard
            title="Sessions by Branch"
            rows={branches.map((branch: AnyRow) => ({
              label: branch.name || branch.branchName || `Branch ${idOf(branch)}`,
              value: filtered.filter((session: AnyRow) => sessionBranchId(session) === cleanId(idOf(branch))).length,
            }))}
          />

          <AnalyticsCard
            title="Sessions by Day"
            rows={DAYS.map((day) => ({
              label: day,
              value: filtered.filter((session: AnyRow) => sessionDay(session) === day).length,
            }))}
          />

          <AnalyticsCard
            title="Teacher Load"
            rows={Array.from(
              filtered.reduce((map: Map<string, number>, session: AnyRow) => {
                const name = teacherName(teachers, sessionTeacherId(session));
                map.set(name, (map.get(name) || 0) + 1);
                return map;
              }, new Map<string, number>())
            )
              .map(([label, value]) => ({ label, value }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 12)}
          />

          <AnalyticsCard
            title="Class Load"
            rows={Array.from(
              filtered.reduce((map: Map<string, number>, session: AnyRow) => {
                const name = className(classes, sessionClassId(session));
                map.set(name, (map.get(name) || 0) + 1);
                return map;
              }, new Map<string, number>())
            )
              .map(([label, value]) => ({ label, value }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 12)}
          />
        </section>
      ) : null}

      {view === "table" ? (
        <section className="bt-panel">
          <div className="bt-table-wrap">
            <table className="bt-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Session</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Room</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((session: AnyRow, index: number) => (
                  <tr key={String(idOf(session) || index)}>
                    <td>{branchName(branches, sessionBranchId(session))}</td>
                    <td>{sessionDay(session)}</td>
                    <td>{sessionTime(session)}</td>
                    <td>
                      <strong>{sessionTitle(session)}</strong>
                    </td>
                    <td>{className(classes, sessionClassId(session))}</td>
                    <td>{subjectName(subjects, sessionSubjectId(session))}</td>
                    <td>{teacherName(teachers, sessionTeacherId(session))}</td>
                    <td>{resourceName(resources, session)}</td>
                  </tr>
                ))}

                {!filtered.length ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyCard text="No timetable sessions found." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "cards" ? (
        <section className="bt-section">
          <div className="bt-list">
            {filtered.map((session: AnyRow, index: number) => (
              <SessionCard
                key={String(idOf(session) || index)}
                session={session}
                branches={branches}
                classes={classes}
                subjects={subjects}
                teachers={teachers}
                resources={resources}
              />
            ))}

            {!filtered.length ? <EmptyCard text="No timetable sessions found." /> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function SessionCard({
  session,
  branches,
  classes,
  subjects,
  teachers,
  resources,
}: {
  session: AnyRow;
  branches: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
}) {
  return (
    <article className="bt-card">
      <div className="bt-card-top">
        <div className="bt-avatar">📚</div>
        <div className="bt-card-main">
          <h3>{sessionTitle(session)}</h3>
          <p>
            {branchName(branches, sessionBranchId(session))} · {sessionDay(session)} · {sessionTime(session)}
          </p>
          <div className="bt-chip-row">
            <Chip tone="blue">{session.sessionType || "session"}</Chip>
            <Chip>{className(classes, sessionClassId(session))}</Chip>
            <Chip tone="purple">{teacherName(teachers, sessionTeacherId(session))}</Chip>
            <Chip tone="orange">{resourceName(resources, session)}</Chip>
          </div>
        </div>
      </div>

      <div className="bt-mini-grid">
        <div className="bt-mini">
          <strong>{subjectName(subjects, sessionSubjectId(session))}</strong>
          <span>Subject</span>
        </div>
        <div className="bt-mini">
          <strong>{className(classes, sessionClassId(session))}</strong>
          <span>Class</span>
        </div>
        <div className="bt-mini">
          <strong>{resourceName(resources, session)}</strong>
          <span>Room / Resource</span>
        </div>
      </div>
    </article>
  );
}

function SessionBlock({
  session,
  branches,
  classes,
  subjects,
  teachers,
  resources,
  compact = false,
}: {
  session: AnyRow;
  branches: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  compact?: boolean;
}) {
  return (
    <article className={`bt-session-block ${compact ? "compact" : ""}`}>
      <strong>{compact ? sessionTitle(session) : `${sessionTime(session)} · ${sessionTitle(session)}`}</strong>
      <span>
        {subjectName(subjects, sessionSubjectId(session))} · {className(classes, sessionClassId(session))}
      </span>
      {!compact ? (
        <small>
          {teacherName(teachers, sessionTeacherId(session))} · {branchName(branches, sessionBranchId(session))} · {resourceName(resources, session)}
        </small>
      ) : null}
    </article>
  );
}

function WeekTimetable({
  sessions,
  branches,
  classes,
  subjects,
  teachers,
  resources,
}: {
  sessions: AnyRow[];
  branches: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
}) {
  return (
    <section className="bt-week-grid">
      {DAYS.map((day) => {
        const daySessions = sortSessions(sessions.filter((session: AnyRow) => sessionDay(session) === day));

        return (
          <article key={day} className="bt-week-day">
            <div className="bt-week-day-head">
              <strong>{SHORT_DAYS[day]}</strong>
              <span>{daySessions.length}</span>
            </div>

            <div className="bt-week-day-body">
              {daySessions.map((session: AnyRow, index: number) => (
                <SessionBlock
                  key={String(idOf(session) || index)}
                  session={session}
                  branches={branches}
                  classes={classes}
                  subjects={subjects}
                  teachers={teachers}
                  resources={resources}
                  compact
                />
              ))}

              {!daySessions.length ? <p>No sessions</p> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function DayTimetable({
  day,
  sessions,
  branches,
  classes,
  subjects,
  teachers,
  resources,
}: {
  day: string;
  sessions: AnyRow[];
  branches: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
}) {
  const daySessions = sortSessions(sessions.filter((session: AnyRow) => sessionDay(session) === day));

  return (
    <section className="bt-day-view">
      {daySessions.map((session: AnyRow, index: number) => (
        <article key={String(idOf(session) || index)} className="bt-day-session">
          <time>{sessionTime(session)}</time>
          <div>
            <h3>{sessionTitle(session)}</h3>
            <p>
              {subjectName(subjects, sessionSubjectId(session))} · {className(classes, sessionClassId(session))} ·{" "}
              {teacherName(teachers, sessionTeacherId(session))}
            </p>
            <span>
              {branchName(branches, sessionBranchId(session))} · {resourceName(resources, session)}
            </span>
          </div>
        </article>
      ))}

      {!daySessions.length ? <EmptyCard text={`No timetable sessions found for ${day}.`} /> : null}
    </section>
  );
}

function GroupedTimetable({
  title,
  sessions,
  getGroupKey,
  getGroupLabel,
  branches,
  classes,
  subjects,
  teachers,
  resources,
}: {
  title: string;
  sessions: AnyRow[];
  getGroupKey: (session: AnyRow) => string;
  getGroupLabel: (session: AnyRow) => string;
  branches: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: AnyRow[] }>();

    sessions.forEach((session: AnyRow) => {
      const key = getGroupKey(session);
      const label = getGroupLabel(session);
      const current = map.get(key) || { label, rows: [] };
      current.rows.push(session);
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [getGroupKey, getGroupLabel, sessions]);

  return (
    <section className="bt-grouped-view">
      {groups.map((group) => (
        <article className="bt-group-card" key={group.label}>
          <div className="bt-group-head">
            <div>
              <p>{title}</p>
              <h3>{group.label}</h3>
            </div>
            <Chip tone="blue">{group.rows.length} session(s)</Chip>
          </div>

          <div className="bt-group-days">
            {DAYS.map((day) => {
              const dayRows = sortSessions(group.rows.filter((session: AnyRow) => sessionDay(session) === day));

              return (
                <section key={day} className="bt-group-day">
                  <strong>{SHORT_DAYS[day]}</strong>

                  <div>
                    {dayRows.map((session: AnyRow, index: number) => (
                      <SessionBlock
                        key={String(idOf(session) || index)}
                        session={session}
                        branches={branches}
                        classes={classes}
                        subjects={subjects}
                        teachers={teachers}
                        resources={resources}
                      />
                    ))}

                    {!dayRows.length ? <p>—</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </article>
      ))}

      {!groups.length ? <EmptyCard text="No grouped timetable records found." /> : null}
    </section>
  );
}

function AnalyticsCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const cleanRows = rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(...cleanRows.map((row) => row.value), 1);

  return (
    <article className="bt-breakdown">
      <strong>{title}</strong>

      <div className="bt-analytics-list">
        {cleanRows.map((row) => {
          const width = Math.max(4, Math.round((row.value / max) * 100));

          return (
            <section key={row.label}>
              <div>
                <span>{row.label}</span>
                <b>{row.value}</b>
              </div>
              <div className="bt-bar">
                <i style={{ width: `${width}%` }} />
              </div>
            </section>
          );
        })}

        {!cleanRows.length ? <p>No data available.</p> : null}
      </div>
    </article>
  );
}

const css = `
.bt-page{min-height:100dvh;padding:10px;padding-bottom:32px;background:radial-gradient(circle at top left,color-mix(in srgb,var(--bt-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111);font-family:var(--font-family,system-ui);font-size:var(--font-size,14px);overflow-x:hidden}
.bt-page *{box-sizing:border-box}
.bt-page button,.bt-page input,.bt-page select,.bt-page textarea{font:inherit;max-width:100%}
.bt-page input,.bt-page select,.bt-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.1)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--text,#111);font-weight:750}
.bt-state,.bt-card,.bt-panel,.bt-summary,.bt-toolbar,.bt-filter,.bt-empty,.bt-breakdown,.bt-timetable-panel,.bt-notice{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.bt-state{min-height:360px;display:grid;place-items:center;align-content:center;gap:10px;border-radius:28px;text-align:center;padding:22px}
.bt-state h2{margin:0;font-weight:1000}
.bt-state p,.bt-card p,.bt-title span,.bt-mini span{color:var(--muted,#64748b)}
.bt-hero{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:28px;background:linear-gradient(135deg,var(--card-bg,var(--surface,#fff)),color-mix(in srgb,var(--bt-primary) 7%,var(--card-bg,#fff)));border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 18px 46px rgba(15,23,42,.07)}
.bt-hero-left{min-width:0;display:flex;align-items:center;gap:10px}
.bt-icon,.bt-avatar{display:grid;place-items:center;background:var(--bt-primary);color:#fff;box-shadow:0 12px 26px color-mix(in srgb,var(--bt-primary) 28%,transparent)}
.bt-icon{width:48px;height:48px;border-radius:18px;font-size:22px}
.bt-avatar{width:56px;height:56px;border-radius:19px;font-size:22px;flex:0 0 auto}
.bt-title{min-width:0}
.bt-title p{margin:0;color:var(--bt-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.bt-title h2{margin:0;font-size:clamp(20px,5vw,30px);font-weight:1000;letter-spacing:-.06em}
.bt-title span{display:block;font-size:12px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-actions{display:flex;gap:8px}
.bt-btn,.bt-primary{min-height:42px;border-radius:999px;padding:0 14px;font-weight:950;cursor:pointer}
.bt-btn{border:1px solid var(--border,rgba(0,0,0,.1));background:var(--surface,#fff);color:var(--text,#111)}
.bt-primary{border:0;background:var(--bt-primary);color:#fff}
.bt-notice{margin-top:10px;border-radius:20px;padding:11px 13px;background:#fff7ed;color:#9a3412;border-color:#fed7aa;font-size:12px;font-weight:900;line-height:1.45}
.bt-summary-grid,.bt-list,.bt-mini-grid,.bt-breakdown-grid{display:grid;gap:8px}
.bt-summary-grid{margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
.bt-summary{display:flex;gap:10px;align-items:center;padding:12px;border-radius:22px;min-width:0}
.bt-summary.warning{background:linear-gradient(135deg,rgba(245,158,11,.12),var(--card-bg,#fff))}
.bt-summary.positive{background:linear-gradient(135deg,rgba(34,197,94,.12),var(--card-bg,#fff))}
.bt-summary>div:first-child{width:36px;height:36px;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--bt-primary) 12%,var(--surface,#fff))}
.bt-summary strong,.bt-summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-summary strong{font-size:18px;font-weight:1000}
.bt-summary span{font-size:11px;font-weight:850;color:var(--muted,#64748b)}
.bt-toolbar,.bt-filter,.bt-panel,.bt-timetable-panel{margin-top:10px;padding:10px;border-radius:24px}
.bt-toolbar{display:flex;justify-content:space-between;gap:8px;align-items:center}
.bt-tabs{display:flex;flex-wrap:wrap;gap:4px;width:100%;padding:4px;border-radius:22px;background:color-mix(in srgb,var(--bt-primary) 7%,var(--surface,#fff))}
.bt-tabs button{border:0;border-radius:999px;min-height:38px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;text-transform:capitalize;padding:0 12px;display:inline-flex;align-items:center;gap:6px}
.bt-tabs button.active{background:var(--bt-primary);color:#fff;box-shadow:0 10px 22px color-mix(in srgb,var(--bt-primary) 22%,transparent)}
.bt-filter{display:grid;grid-template-columns:1fr;gap:8px}
.bt-section{margin-top:16px}
.bt-card,.bt-breakdown,.bt-empty{border-radius:24px;padding:13px;overflow:hidden}
.bt-card-top{display:flex;gap:10px}
.bt-card-main{min-width:0;flex:1}
.bt-card h3{margin:0;font-size:18px;font-weight:1000}
.bt-chip-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.bt-chip{display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;text-transform:capitalize}
.bt-chip.green{background:rgba(34,197,94,.14);color:#16a34a}
.bt-chip.red{background:rgba(239,68,68,.14);color:#ef4444}
.bt-chip.blue{background:rgba(59,130,246,.15);color:#2563eb}
.bt-chip.orange{background:rgba(245,158,11,.16);color:#d97706}
.bt-chip.purple{background:rgba(147,51,234,.15);color:#9333ea}
.bt-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}
.bt-mini-grid{grid-template-columns:repeat(1,1fr);margin-top:10px}
.bt-mini{padding:9px;border-radius:17px;background:color-mix(in srgb,var(--muted,#64748b) 9%,transparent);border:1px solid var(--border,rgba(0,0,0,.08))}
.bt-mini strong,.bt-mini span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-mini strong{font-weight:1000}
.bt-mini span{font-size:10px;font-weight:850}
.bt-table-wrap{overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}
.bt-table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,#fff)}
.bt-table th,.bt-table td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));text-align:left;vertical-align:top}
.bt-table th{font-size:11px;color:var(--muted,#64748b);text-transform:uppercase}
.bt-empty{display:grid;place-items:center;align-content:center;min-height:190px;text-align:center;border-style:dashed}
.bt-empty div{font-size:28px}
.bt-empty h3{margin:8px 0 0}
.bt-empty p{margin:5px 0 0;color:var(--muted,#64748b)}
.bt-conflict-head,.bt-timetable-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
.bt-conflict-head p,.bt-timetable-head p,.bt-group-head p{margin:0;color:var(--bt-primary);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
.bt-conflict-head h3,.bt-timetable-head h3,.bt-group-head h3{margin:2px 0 0;font-size:clamp(18px,5vw,24px);font-weight:1000;letter-spacing:-.04em}
.bt-mode-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--bt-primary) 7%,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.08))}
.bt-mode-tabs button{border:0;border-radius:999px;min-height:34px;padding:0 12px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer}
.bt-mode-tabs button.active{background:var(--bt-primary);color:#fff}
.bt-week-grid{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:8px;overflow-x:auto}
.bt-week-day{min-height:250px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:18px;background:var(--surface,#fff);padding:8px}
.bt-week-day-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.bt-week-day-head strong{font-size:12px;text-transform:uppercase;color:var(--muted,#64748b)}
.bt-week-day-head span{display:grid;place-items:center;min-width:28px;height:28px;border-radius:999px;background:color-mix(in srgb,var(--bt-primary) 12%,transparent);font-size:12px;font-weight:1000}
.bt-week-day-body{display:grid;gap:6px}
.bt-week-day-body p{margin:8px 0;text-align:center;color:var(--muted,#64748b);font-size:12px}
.bt-session-block{display:grid;gap:2px;padding:8px;border-radius:14px;background:color-mix(in srgb,var(--bt-primary) 10%,var(--surface,#fff));border:1px solid color-mix(in srgb,var(--bt-primary) 16%,transparent);overflow:hidden}
.bt-session-block strong{font-size:12px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-session-block span,.bt-session-block small{font-size:11px;color:var(--muted,#64748b);font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-session-block.compact{padding:6px}
.bt-session-block.compact strong{font-size:11px}
.bt-day-view{display:grid;gap:8px}
.bt-day-session{display:grid;grid-template-columns:110px 1fr;gap:10px;padding:12px;border-radius:18px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08))}
.bt-day-session time{font-weight:1000;color:var(--bt-primary)}
.bt-day-session h3{margin:0;font-size:16px;font-weight:1000}
.bt-day-session p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:850}
.bt-day-session span{display:block;margin-top:8px;font-size:12px;line-height:1.45;color:var(--text,#111)}
.bt-grouped-view{display:grid;gap:10px}
.bt-group-card{padding:12px;border-radius:22px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08))}
.bt-group-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px}
.bt-group-days{display:grid;gap:8px}
.bt-group-day{display:grid;grid-template-columns:56px 1fr;gap:8px;align-items:start;padding:8px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.bt-group-day>strong{font-size:12px;color:var(--muted,#64748b);text-transform:uppercase}
.bt-group-day>div{display:grid;gap:6px}
.bt-group-day p{margin:0;color:var(--muted,#64748b)}
.bt-analytics-list{display:grid;gap:10px;margin-top:12px}
.bt-analytics-list section{display:grid;gap:6px}
.bt-analytics-list section>div:first-child{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:900}
.bt-bar{height:9px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);overflow:hidden}
.bt-bar i{display:block;height:100%;border-radius:inherit;background:var(--bt-primary)}
.bt-analytics-list p{margin:0;color:var(--muted,#64748b);font-size:12px}
@media(min-width:680px){.bt-summary-grid{grid-template-columns:repeat(3,1fr)}.bt-filter{grid-template-columns:1fr 190px 160px 120px}.bt-mini-grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:1040px){.bt-page{padding:16px}.bt-summary-grid{grid-template-columns:repeat(6,1fr)}.bt-list,.bt-breakdown-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:760px){.bt-timetable-head,.bt-conflict-head{display:grid}.bt-mode-tabs{width:100%}.bt-mode-tabs button{flex:1}.bt-week-grid{grid-template-columns:repeat(7,160px)}.bt-day-session{grid-template-columns:1fr}.bt-group-head{display:grid}.bt-group-day{grid-template-columns:1fr}}
@media(max-width:520px){.bt-page{padding:6px}.bt-hero{flex-direction:column;align-items:stretch;border-radius:22px}.bt-actions{display:grid}.bt-btn,.bt-primary{width:100%}.bt-toolbar{flex-direction:column;align-items:stretch}.bt-tabs{width:100%}.bt-tabs button{flex:1;justify-content:center}}
`;
