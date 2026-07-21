/**
 * app/lib/calendar/calendar-service.ts
 * ---------------------------------------------------------
 * Calendar Dexie service.
 */

import { db } from "../db/db";
import type {
  CalendarEvent,
  CalendarEventParticipant,
  CalendarEventReminder,
  CalendarResponseStatus,
} from "../db/db";

import {
  createCalendarEventRecord,
  createCalendarParticipantRecord,
  createCalendarReminderRecord,
  createCalendarResponseRecord,
  type CreateCalendarEventInput,
  type CreateCalendarParticipantInput,
  type CreateCalendarReminderInput,
} from "./calendar-factory";

import {
  calculateReminderScheduledAt,
  eventsOverlap,
  isEventActive,
  isValidEventRange,
} from "./calendar-utils";
import { SYNC_STATUS_VALUE } from "../sync/syncConfig";

function now() {
  return Date.now();
}

function nextVersion(current?: number) {
  return Number(current || 0) + 1;
}

export async function createCalendarEvent(input: {
  event: CreateCalendarEventInput;
  participants?: Omit<CreateCalendarParticipantInput, "accountId" | "schoolId" | "branchId" | "eventId">[];
  reminders?: Omit<CreateCalendarReminderInput, "accountId" | "schoolId" | "branchId" | "eventId" | "scheduledAt">[];
}) {
  if (!isValidEventRange(input.event.startAt, input.event.endAt)) {
    throw new Error("Calendar event end time must be after start time.");
  }

  const eventRecord = createCalendarEventRecord(input.event);
  const eventId = await db.calendarEvents.add(eventRecord);

  const event = {
    ...eventRecord,
    id: String(eventId),
  };

  for (const participant of input.participants || []) {
    await db.calendarEventParticipants.add(
      createCalendarParticipantRecord({
        ...participant,
        accountId: input.event.accountId,
        schoolId: input.event.schoolId,
        branchId: input.event.branchId,
        eventId: String(eventId),
      })
    );
  }

  for (const reminder of input.reminders || []) {
    const scheduledAt = calculateReminderScheduledAt(event, reminder);

    await db.calendarEventReminders.add(
      createCalendarReminderRecord({
        ...reminder,
        accountId: input.event.accountId,
        schoolId: input.event.schoolId,
        branchId: input.event.branchId,
        eventId: String(eventId),
        scheduledAt,
      })
    );
  }

  return event;
}

export async function listCalendarEvents(input: {
  accountId: string;
  schoolId?: string;
  branchId?: string;
  startAt?: number;
  endAt?: number;
  includeDeleted?: boolean;
}) {
  let rows = await db.calendarEvents
    .where("accountId")
    .equals(input.accountId)
    .toArray();

  rows = rows.filter((event) => {
    if (!input.includeDeleted && event.isDeleted) return false;
    if (input.schoolId && String(event.schoolId) !== String(input.schoolId)) return false;
    if (input.branchId && String(event.branchId) !== String(input.branchId)) return false;

    if (input.startAt !== undefined && input.endAt !== undefined) {
      return eventsOverlap(event, {
        startAt: input.startAt,
        endAt: input.endAt,
      } as CalendarEvent);
    }

    return true;
  });

  return rows.sort((a, b) => a.startAt - b.startAt);
}

export async function getCalendarEventBundle(eventId: string) {
  const [event, participants, reminders, responses] = await Promise.all([
    db.calendarEvents.get(eventId),
    db.calendarEventParticipants.where("eventId").equals(eventId).toArray(),
    db.calendarEventReminders.where("eventId").equals(eventId).toArray(),
    db.calendarEventResponses.where("eventId").equals(eventId).toArray(),
  ]);

  return {
    event,
    participants,
    reminders,
    responses,
  };
}

export async function updateCalendarEvent(
  eventId: string,
  patch: Partial<CalendarEvent>
) {
  const existing = await db.calendarEvents.get(eventId);

  if (!existing) {
    throw new Error("Calendar event not found.");
  }

  if (
    (patch.startAt !== undefined || patch.endAt !== undefined) &&
    !isValidEventRange(patch.startAt ?? existing.startAt, patch.endAt ?? existing.endAt)
  ) {
    throw new Error("Calendar event end time must be after start time.");
  }

  await db.calendarEvents.update(eventId, {
    ...patch,
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });

  return db.calendarEvents.get(eventId);
}

export async function cancelCalendarEvent(eventId: string, reason?: string) {
  return updateCalendarEvent(eventId, {
    status: "cancelled",
    description: reason,
    active: false,
  });
}

export async function softDeleteCalendarEvent(eventId: string) {
  const existing = await db.calendarEvents.get(eventId);

  if (!existing) {
    throw new Error("Calendar event not found.");
  }

  await db.calendarEvents.update(eventId, {
    isDeleted: true,
    active: false,
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });
}

export async function respondToCalendarEvent(input: {
  accountId: string;
  schoolId: string;
  branchId: string;
  eventId: string;
  participantId?: string | null;
  userId?: string | null;
  responseStatus: CalendarResponseStatus;
  note?: string;
}) {
  const response = createCalendarResponseRecord(input);

  const responseId = await db.calendarEventResponses.add(response);

  if (input.participantId) {
    const participant = await db.calendarEventParticipants.get(input.participantId);

    if (participant) {
      await db.calendarEventParticipants.update(input.participantId, {
        responseStatus: input.responseStatus,
        responseNote: input.note,
        respondedAt: now(),
        updatedAt: now(),
        version: nextVersion(participant.version),
        synced: SYNC_STATUS_VALUE.PENDING,
      });
    }
  }

  return {
    ...response,
    id: Number(responseId),
  };
}

export async function listPendingCalendarReminders(input: {
  accountId: string;
  beforeOrAt?: number;
}) {
  const beforeOrAt = input.beforeOrAt ?? now();

  const reminders = await db.calendarEventReminders
    .where("accountId")
    .equals(input.accountId)
    .toArray();

  return reminders
    .filter((reminder) => {
      if (reminder.isDeleted || reminder.active === false) return false;
      if (reminder.status !== "pending") return false;
      return Number(reminder.scheduledAt || 0) <= beforeOrAt;
    })
    .sort((a, b) => Number(a.scheduledAt || 0) - Number(b.scheduledAt || 0));
}

export async function markCalendarReminderSent(reminderId: string) {
  const reminder = await db.calendarEventReminders.get(reminderId);

  if (!reminder) {
    throw new Error("Calendar reminder not found.");
  }

  await db.calendarEventReminders.update(reminderId, {
    status: "sent",
    sentAt: now(),
    updatedAt: now(),
    version: nextVersion(reminder.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });
}

export async function detectCalendarEventOverlaps(input: {
  accountId: string;
  schoolId: string;
  branchId?: string;
  candidate: Pick<CalendarEvent, "startAt" | "endAt" | "teacherId" | "classId">;
  excludeEventId?: string;
}) {
  const events = await listCalendarEvents({
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,
    startAt: input.candidate.startAt,
    endAt: input.candidate.endAt,
  });

  return events.filter((event) => {
    if (input.excludeEventId && event.id === input.excludeEventId) return false;
    if (!isEventActive(event)) return false;
    if (!eventsOverlap(event, input.candidate as CalendarEvent)) return false;

    const sameTeacher =
      input.candidate.teacherId &&
      event.teacherId &&
      String(input.candidate.teacherId) === String(event.teacherId);

    const sameClass =
      input.candidate.classId &&
      event.classId &&
      String(input.candidate.classId) === String(event.classId);

    return Boolean(sameTeacher || sameClass);
  });
}
