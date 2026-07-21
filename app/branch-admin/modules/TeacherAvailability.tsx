"use client";

/**
 * app/branch-admin/modules/TeacherAvailability.tsx
 * ---------------------------------------------------------
 * TEACHER AVAILABILITY - READ-ONLY SCHEDULING MODULE
 * ---------------------------------------------------------
 * Purpose:
 * - Shows booked and available teacher time blocks by selected day.
 * - Helps branch admins plan substitutions, meetings, exam supervision, and timetable adjustments.
 *
 * Sync behavior:
 * - Read-only module. Parent page loads local/offline records.
 *
 * Design standard:
 * - Uses the same "ba-" UI style and overflow-safe text handling.
 */

import React, { useMemo } from "react";

type AnyRow = Record<string, any>;

type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

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

function normalizeDay(value: any) {
  const raw = String(value || "monday")
    .toLowerCase()
    .trim();
  return DAYS.includes(raw) ? raw : "monday";
}

function sessionDay(row: AnyRow) {
  return normalizeDay(row?.dayOfWeek || row?.day || row?.weekday);
}

function startMinute(row: AnyRow) {
  return n(row?.startMinute ?? row?.start ?? row?.startTimeMinute);
}

function endMinute(row: AnyRow) {
  return (
    n(row?.endMinute ?? row?.end ?? row?.endTimeMinute) || startMinute(row) + 60
  );
}

function minuteToTime(value: any) {
  const total = Math.max(0, Math.min(1439, n(value)));
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatMinuteRange(start: number, end: number) {
  return `${minuteToTime(start)} - ${minuteToTime(end)}`;
}

function sessionTeacherId(session: AnyRow) {
  return cleanId(session.teacherId ?? session.teacherId ?? session.staffId);
}

function sessionTitle(row: AnyRow) {
  return String(
    row?.title ||
      row?.sessionType ||
      row?.type ||
      row?.subjectName ||
      "Timetable session",
  ).trim();
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

function freeBlocks(
  booked: { start: number; end: number }[],
  dayStart = 7 * 60,
  dayEnd = 17 * 60,
) {
  const sorted = [...booked]
    .map((item) => ({
      start: Math.max(dayStart, item.start),
      end: Math.min(dayEnd, item.end),
    }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start);

  const blocks: { start: number; end: number }[] = [];
  let cursor = dayStart;

  for (const block of sorted) {
    if (block.start > cursor) blocks.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }

  if (cursor < dayEnd) blocks.push({ start: cursor, end: dayEnd });
  return blocks.filter((block) => block.end - block.start >= 20);
}

export function TeacherAvailability({
  teachers,
  sessions,
  selectedDay,
  setSelectedDay,
}: {
  teachers: AnyRow[];
  sessions: AnyRow[];
  selectedDay: string;
  setSelectedDay: (day: string) => void;
}) {
  const rows = useMemo(() => {
    const day = normalizeDay(selectedDay);

    return teachers
      .map((teacher) => {
        const teacherId = cleanId(idOf(teacher));
        const teacherSessions = sessions
          .filter(
            (session) =>
              sessionTeacherId(session) === teacherId &&
              sessionDay(session) === day,
          )
          .sort((a, b) => startMinute(a) - startMinute(b));
        const booked = teacherSessions.map((session) => ({
          start: startMinute(session),
          end: endMinute(session),
        }));
        const free = freeBlocks(booked);

        return {
          id: teacherId,
          name: rowName(teacher),
          sessions: teacherSessions,
          free,
        };
      })
      .sort(
        (a, b) =>
          a.sessions.length - b.sessions.length || a.name.localeCompare(b.name),
      );
  }, [selectedDay, sessions, teachers]);

  return (
    <section className="ba-section">
      <div className="ba-head">
        <div>
          <p>Teacher Availability</p>
          <h3>
            {DAY_LABELS[normalizeDay(selectedDay)]} free and booked blocks
          </h3>
        </div>
        <select
          className="ba-inline-select"
          value={selectedDay}
          onChange={(event) => setSelectedDay(event.target.value)}
        >
          {DAYS.map((day) => (
            <option key={day} value={day}>
              {DAY_LABELS[day]}
            </option>
          ))}
        </select>
      </div>

      <div className="ba-list">
        {rows.map((row) => (
          <article key={String(row.id || row.name)} className="ba-card">
            <div className="ba-card-top">
              <div className="ba-avatar">👨‍🏫</div>
              <div className="ba-card-main">
                <h3>{row.name}</h3>
                <p>{row.sessions.length} booked session(s)</p>
                <div className="ba-chip-row">
                  {row.free.length ? (
                    <Chip tone="green">
                      Available blocks: {row.free.length}
                    </Chip>
                  ) : (
                    <Chip tone="orange">Fully booked</Chip>
                  )}
                  {row.sessions.length ? (
                    <Chip tone="blue">Booked</Chip>
                  ) : (
                    <Chip>No sessions</Chip>
                  )}
                </div>
              </div>
            </div>

            <div className="ba-availability-grid">
              <section>
                <strong>Available</strong>
                <div className="ba-chip-row">
                  {row.free.map((block) => (
                    <Chip
                      key={`${row.id}-${block.start}-${block.end}`}
                      tone="green"
                    >
                      {formatMinuteRange(block.start, block.end)}
                    </Chip>
                  ))}
                  {!row.free.length ? (
                    <Chip tone="gray">No free block</Chip>
                  ) : null}
                </div>
              </section>

              <section>
                <strong>Booked</strong>
                <div className="ba-chip-row">
                  {row.sessions.map((session) => (
                    <Chip
                      key={String(
                        idOf(session) || `${row.id}-${startMinute(session)}`,
                      )}
                      tone="blue"
                    >
                      {formatMinuteRange(
                        startMinute(session),
                        endMinute(session),
                      )}{" "}
                      · {sessionTitle(session)}
                    </Chip>
                  ))}
                  {!row.sessions.length ? (
                    <Chip tone="gray">No booking</Chip>
                  ) : null}
                </div>
              </section>
            </div>
          </article>
        ))}

        {!rows.length ? (
          <section className="ba-empty">
            <div>🕒</div>
            <h3>No teachers found</h3>
            <p>Add teachers to inspect availability.</p>
          </section>
        ) : null}
      </div>
    </section>
  );
}
