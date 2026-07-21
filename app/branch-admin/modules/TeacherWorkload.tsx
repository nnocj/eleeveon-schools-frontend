"use client";

/**
 * app/branch-admin/modules/TeacherWorkload.tsx
 * ---------------------------------------------------------
 * TEACHER WORKLOAD - ANALYTICS MODULE
 * ---------------------------------------------------------
 * Purpose:
 * - Shows teaching load, sessions, hours, subjects, classes, and free/loaded teachers.
 * - Used by TeacherTimetable.tsx as a commercial-grade scheduling analytics view.
 *
 * Sync behavior:
 * - Read-only module. Parent page loads records from Dexie/sync tables.
 *
 * Design standard:
 * - Uses the same "ba-" UI style and neutral professional styling.
 */

import React, { useMemo } from "react";

type AnyRow = Record<string, any>;

type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idOf(row?: AnyRow) {
  return row?.id;
}

function cleanId(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rowName(row?: AnyRow) {
  return String(
    row?.fullName ||
      row?.name ||
      row?.title ||
      row?.label ||
      row?.email ||
      "Unnamed",
  ).trim();
}

function startMinute(row: AnyRow) {
  return n(row?.startMinute ?? row?.start ?? row?.startTimeMinute);
}

function endMinute(row: AnyRow) {
  return (
    n(row?.endMinute ?? row?.end ?? row?.endTimeMinute) || startMinute(row) + 60
  );
}

function sessionTeacherId(session: AnyRow) {
  return cleanId(session.teacherId ?? session.teacherId ?? session.staffId);
}

function sessionClassId(session: AnyRow) {
  return cleanId(session.classId ?? session.classLocalId);
}

function sessionSubjectId(session: AnyRow) {
  return cleanId(session.subjectId ?? session.subjectLocalId);
}

function teacherName(teachers: AnyRow[], teacherId: any) {
  const row = teachers.find(
    (item) => String(idOf(item) ?? "") === String(teacherId ?? ""),
  );
  return rowName(row || {});
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="ba-mini">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function workloadTone(hours: number): Tone {
  if (hours >= 28) return "orange";
  if (hours >= 18) return "green";
  if (hours > 0) return "blue";
  return "gray";
}

export function TeacherWorkload({
  teachers,
  sessions,
  conflicts,
}: {
  teachers: AnyRow[];
  sessions: AnyRow[];
  conflicts: AnyRow[];
}) {
  const rows = useMemo(() => {
    return teachers
      .map((teacher) => {
        const teacherId = cleanId(idOf(teacher));
        const teacherSessions = sessions.filter(
          (session) => sessionTeacherId(session) === teacherId,
        );
        const minutes = teacherSessions.reduce(
          (sum, session) =>
            sum + Math.max(0, endMinute(session) - startMinute(session)),
          0,
        );
        const hours = Math.round((minutes / 60) * 10) / 10;
        const subjectCount = new Set(
          teacherSessions.map(sessionSubjectId).filter(Boolean),
        ).size;
        const classCount = new Set(
          teacherSessions.map(sessionClassId).filter(Boolean),
        ).size;
        const conflictCount = conflicts.filter(
          (conflict) =>
            cleanId(conflict.teacherId || conflict.teacherId) === teacherId,
        ).length;

        return {
          id: teacherId,
          name: rowName(teacher),
          sessions: teacherSessions.length,
          hours,
          subjectCount,
          classCount,
          conflictCount,
        };
      })
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  }, [conflicts, sessions, teachers]);

  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const activeTeachers = rows.filter((row) => row.sessions > 0).length;
  const freeTeachers = rows.filter((row) => row.sessions === 0).length;
  const averageHours = activeTeachers
    ? Math.round((totalHours / activeTeachers) * 10) / 10
    : 0;

  return (
    <section className="ba-section">
      <div className="ba-head">
        <div>
          <p>Teacher Workload</p>
          <h3>Teaching load and availability</h3>
        </div>
        <Chip tone="blue">{rows.length} teacher(s)</Chip>
      </div>

      <div className="ba-mini-grid ba-workload-summary">
        <MiniStat
          label="Total Teaching Hours"
          value={`${totalHours.toFixed(1)}h`}
        />
        <MiniStat
          label="Average Active Load"
          value={`${averageHours.toFixed(1)}h`}
        />
        <MiniStat label="Active Teachers" value={activeTeachers} />
        <MiniStat label="Free Teachers" value={freeTeachers} />
      </div>

      <div className="ba-list">
        {rows.map((row) => (
          <article key={String(row.id || row.name)} className="ba-card">
            <div className="ba-card-top">
              <div className="ba-avatar">👨‍🏫</div>
              <div className="ba-card-main">
                <h3>{row.name}</h3>
                <p>
                  {row.sessions} session(s) · {row.hours.toFixed(1)} teaching
                  hour(s)
                </p>
                <div className="ba-chip-row">
                  <Chip tone={workloadTone(row.hours)}>
                    {row.hours.toFixed(1)}h load
                  </Chip>
                  <Chip>{row.subjectCount} subject(s)</Chip>
                  <Chip>{row.classCount} class(es)</Chip>
                  {row.conflictCount ? (
                    <Chip tone="orange">{row.conflictCount} conflict(s)</Chip>
                  ) : (
                    <Chip tone="green">No conflicts</Chip>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}

        {!rows.length ? (
          <section className="ba-empty">
            <div>👨‍🏫</div>
            <h3>No teachers found</h3>
            <p>Add teachers to view workload analytics.</p>
          </section>
        ) : null}
      </div>
    </section>
  );
}

export function TeacherLoadAnalytics({
  teachers,
  sessions,
}: {
  teachers: AnyRow[];
  sessions: AnyRow[];
}) {
  const rows = useMemo(() => {
    return teachers
      .map((teacher) => {
        const teacherId = cleanId(idOf(teacher));
        const teacherSessions = sessions.filter(
          (session) => sessionTeacherId(session) === teacherId,
        );
        const minutes = teacherSessions.reduce(
          (sum, session) =>
            sum + Math.max(0, endMinute(session) - startMinute(session)),
          0,
        );
        return {
          label: teacherName(teachers, teacherId),
          value: Math.round((minutes / 60) * 10) / 10,
        };
      })
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [sessions, teachers]);

  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <article className="ba-breakdown">
      <strong>Hours Per Teacher</strong>
      <div className="ba-analytics-list">
        {rows.map((row) => {
          const width = Math.max(4, Math.round((row.value / max) * 100));
          return (
            <section key={row.label}>
              <div>
                <span>{row.label}</span>
                <b>{row.value.toFixed(1)}h</b>
              </div>
              <div className="ba-bar">
                <i style={{ width: `${width}%` }} />
              </div>
            </section>
          );
        })}
        {!rows.length ? <p>No workload data available.</p> : null}
      </div>
    </article>
  );
}
