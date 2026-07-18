/**
 * app/lib/calendar/calendar-utils.ts
 * ---------------------------------------------------------
 * Pure calendar utilities.
 */

import type {
  CalendarEvent,
  CalendarEventReminder,
  CalendarEventStatus,
} from "../db/db";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function isValidEventRange(startAt: number, endAt: number) {
  return Number.isFinite(startAt) && Number.isFinite(endAt) && startAt < endAt;
}

export function eventsOverlap(
  a: Pick<CalendarEvent, "startAt" | "endAt">,
  b: Pick<CalendarEvent, "startAt" | "endAt">
) {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

export function eventContainsTime(
  event: Pick<CalendarEvent, "startAt" | "endAt">,
  timestamp: number
) {
  return timestamp >= event.startAt && timestamp <= event.endAt;
}

export function isEventActive(event: Pick<CalendarEvent, "active" | "isDeleted" | "status">) {
  return event.isDeleted !== true && event.active !== false && event.status !== "cancelled";
}

export function isEventUpcoming(event: Pick<CalendarEvent, "startAt" | "status" | "active" | "isDeleted">) {
  return isEventActive(event) && event.startAt >= Date.now();
}

export function isEventPast(event: Pick<CalendarEvent, "endAt">) {
  return event.endAt < Date.now();
}

export function getEventDurationMinutes(event: Pick<CalendarEvent, "startAt" | "endAt">) {
  if (!isValidEventRange(event.startAt, event.endAt)) return 0;
  return Math.round((event.endAt - event.startAt) / MINUTE);
}

export function calculateReminderScheduledAt(
  event: Pick<CalendarEvent, "startAt">,
  reminder: Pick<CalendarEventReminder, "minutesBefore">
) {
  return event.startAt - reminder.minutesBefore * MINUTE;
}

export function formatCalendarDateTime(timestamp?: number, locale?: string) {
  if (!timestamp) return "Not set";

  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "Not set";
  }
}

export function formatCalendarDate(timestamp?: number, locale?: string) {
  if (!timestamp) return "Not set";

  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return "Not set";
  }
}

export function startOfDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function startOfWeek(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfWeek(timestamp = Date.now()) {
  return startOfWeek(timestamp) + 7 * DAY - 1;
}

export function startOfMonth(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfMonth(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function normalizeEventStatus(status?: string): CalendarEventStatus {
  const clean = String(status || "").toLowerCase();

  if (clean === "draft") return "draft";
  if (clean === "confirmed") return "confirmed";
  if (clean === "cancelled") return "cancelled";
  if (clean === "postponed") return "postponed";
  if (clean === "completed") return "completed";

  return "scheduled";
}

export function groupEventsByDay(events: CalendarEvent[]) {
  return events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
    const date = new Date(event.startAt);
    const key = date.toISOString().slice(0, 10);

    groups[key] ||= [];
    groups[key].push(event);

    return groups;
  }, {});
}
