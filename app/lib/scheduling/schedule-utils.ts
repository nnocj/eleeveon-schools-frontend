/**
 * app/lib/scheduling/schedule-utils.ts
 * ---------------------------------------------------------
 * Pure timetable/scheduling utilities.
 */

import type {
  ScheduleDayOfWeek,
  ScheduleSession,
} from "../db/db";

export const SCHEDULE_DAYS: ScheduleDayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function timeToMinute(time: string): number {
  const [hh, mm] = String(time || "0:0")
    .split(":")
    .map((part) => Number(part));

  const hour = Number.isFinite(hh) ? Math.max(0, Math.min(23, hh)) : 0;
  const minute = Number.isFinite(mm) ? Math.max(0, Math.min(59, mm)) : 0;

  return hour * 60 + minute;
}

export function minuteToTime(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Number(totalMinutes || 0)));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatMinuteRange(startMinute: number, endMinute: number) {
  return `${minuteToTime(startMinute)} - ${minuteToTime(endMinute)}`;
}

export function isValidMinuteRange(startMinute: number, endMinute: number) {
  return (
    Number.isFinite(startMinute) &&
    Number.isFinite(endMinute) &&
    startMinute >= 0 &&
    endMinute <= 24 * 60 &&
    startMinute < endMinute
  );
}

export function sessionsOverlap(
  a: Pick<ScheduleSession, "dayOfWeek" | "startMinute" | "endMinute">,
  b: Pick<ScheduleSession, "dayOfWeek" | "startMinute" | "endMinute">
) {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

export function isSessionActive(
  session: Pick<ScheduleSession, "active" | "isDeleted">
) {
  return session.isDeleted !== true && session.active !== false;
}

export function sortSessionsByDayAndTime<T extends Pick<ScheduleSession, "dayOfWeek" | "startMinute">>(
  rows: T[]
) {
  return [...rows].sort((a, b) => {
    const dayDiff = SCHEDULE_DAYS.indexOf(a.dayOfWeek) - SCHEDULE_DAYS.indexOf(b.dayOfWeek);
    if (dayDiff !== 0) return dayDiff;
    return a.startMinute - b.startMinute;
  });
}

export function groupSessionsByDay(sessions: ScheduleSession[]) {
  return sessions.reduce<Record<ScheduleDayOfWeek, ScheduleSession[]>>((groups, session) => {
    groups[session.dayOfWeek] ||= [];
    groups[session.dayOfWeek].push(session);
    return groups;
  }, {} as Record<ScheduleDayOfWeek, ScheduleSession[]>);
}

export function getSessionDurationMinutes(
  session: Pick<ScheduleSession, "startMinute" | "endMinute">
) {
  if (!isValidMinuteRange(session.startMinute, session.endMinute)) return 0;
  return session.endMinute - session.startMinute;
}

export function sessionMatchesTeacher(
  session: Pick<ScheduleSession, "teacherLocalId">,
  teacherLocalId?: number | null
) {
  return Boolean(
    teacherLocalId &&
      session.teacherLocalId &&
      Number(session.teacherLocalId) === Number(teacherLocalId)
  );
}

export function sessionMatchesClass(
  session: Pick<ScheduleSession, "classId">,
  classId?: number | null
) {
  return Boolean(
    classId &&
      session.classId &&
      Number(session.classId) === Number(classId)
  );
}

export function sessionMatchesResource(
  session: Pick<ScheduleSession, "resourceId">,
  resourceId?: number | null
) {
  return Boolean(
    resourceId &&
      session.resourceId &&
      Number(session.resourceId) === Number(resourceId)
  );
}
