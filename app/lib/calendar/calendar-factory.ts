/**
 * app/lib/calendar/calendar-factory.ts
 * ---------------------------------------------------------
 * Calendar record factories.
 * ---------------------------------------------------------
 *
 * These helpers create clean BaseSync-compatible objects for
 * the calendar tables declared in db.ts.
 */

import type {
  CalendarEvent,
  CalendarEventParticipant,
  CalendarEventReminder,
  CalendarEventResponse,
  CalendarEventType,
  CalendarParticipantType,
  CalendarReminderChannel,
  CalendarResponseStatus,
  CalendarVisibility,
  ScheduleScopeType,
} from "../db";
import { SYNC_STATUS_VALUE } from "../sync/syncConfig";

function now() {
  return Date.now();
}

export function getSchedulingDeviceId() {
  if (typeof window === "undefined") return "server";

  const key = "eleeveon_device_id";
  const existing = window.localStorage.getItem(key);

  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(key, generated);
  return generated;
}

export type CreateCalendarEventInput = {
  accountId: string;
  schoolId: number;
  branchId: number;

  scopeType: ScheduleScopeType;
  scopeId?: number | null;

  title: string;
  description?: string;

  eventType?: CalendarEventType;
  visibility?: CalendarVisibility;

  startAt: number;
  endAt: number;
  allDay?: boolean;

  timezone?: string;
  location?: string;
  onlineMeetingUrl?: string;

  classId?: number | null;
  subjectId?: number | null;
  classSubjectId?: number | null;
  teacherLocalId?: number | null;
  studentLocalId?: number | null;
  parentLocalId?: number | null;
  academicStructureId?: number | null;
  academicPeriodId?: number | null;

  recurrenceRule?: string;
  recurrenceEndAt?: number | null;
  parentEventId?: number | null;

  announcementId?: number | null;
  messageThreadId?: number | null;

  color?: string;
  priority?: "low" | "normal" | "high" | "urgent";

  createdByUserId?: number | string | null;
  createdByRole?: string;
};

export function createCalendarEventRecord(
  input: CreateCalendarEventInput
): CalendarEvent {
  const timestamp = now();

  return {
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,

    scopeType: input.scopeType,
    scopeId: input.scopeId ?? null,

    title: input.title.trim(),
    description: input.description?.trim(),

    eventType: input.eventType || "general",
    status: "scheduled",
    visibility: input.visibility || "branch",

    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,

    timezone: input.timezone,
    location: input.location?.trim(),
    onlineMeetingUrl: input.onlineMeetingUrl?.trim(),

    classId: input.classId ?? null,
    subjectId: input.subjectId ?? null,
    classSubjectId: input.classSubjectId ?? null,
    teacherLocalId: input.teacherLocalId ?? null,
    studentLocalId: input.studentLocalId ?? null,
    parentLocalId: input.parentLocalId ?? null,
    academicStructureId: input.academicStructureId ?? null,
    academicPeriodId: input.academicPeriodId ?? null,

    recurrenceRule: input.recurrenceRule,
    recurrenceEndAt: input.recurrenceEndAt ?? null,
    parentEventId: input.parentEventId ?? null,

    announcementId: input.announcementId ?? null,
    messageThreadId: input.messageThreadId ?? null,

    color: input.color,
    priority: input.priority || "normal",

    createdByUserId: input.createdByUserId ?? null,
    createdByRole: input.createdByRole,

    active: true,
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deviceId: getSchedulingDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
  };
}

export type CreateCalendarParticipantInput = {
  accountId: string;
  schoolId: number;
  branchId: number;

  eventId: number;
  participantType: CalendarParticipantType;
  participantId?: number | null;
  userLocalId?: number | null;

  role?: string;
  displayName?: string;
  email?: string;
  phone?: string;

  responseStatus?: CalendarResponseStatus;
  responseNote?: string;
  respondedAt?: number | null;

  required?: boolean;
  canEdit?: boolean;
};

export function createCalendarParticipantRecord(
  input: CreateCalendarParticipantInput
): CalendarEventParticipant {
  const timestamp = now();

  return {
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,

    eventId: input.eventId,
    participantType: input.participantType,
    participantId: input.participantId ?? null,
    userLocalId: input.userLocalId ?? null,

    role: input.role,
    displayName: input.displayName?.trim(),
    email: input.email?.trim().toLowerCase(),
    phone: input.phone?.trim(),

    responseStatus: input.responseStatus || "pending",
    responseNote: input.responseNote,
    respondedAt: input.respondedAt ?? null,

    required: input.required ?? true,
    canEdit: input.canEdit ?? false,

    active: true,
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deviceId: getSchedulingDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
  };
}

export type CreateCalendarReminderInput = {
  accountId: string;
  schoolId: number;
  branchId: number;

  eventId: number;
  participantId?: number | null;

  channel: CalendarReminderChannel;
  minutesBefore: number;
  scheduledAt?: number;
};

export function createCalendarReminderRecord(
  input: CreateCalendarReminderInput
): CalendarEventReminder {
  const timestamp = now();

  return {
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,

    eventId: input.eventId,
    participantId: input.participantId ?? null,

    channel: input.channel,
    minutesBefore: Math.max(0, Number(input.minutesBefore || 0)),
    scheduledAt: input.scheduledAt,

    status: "pending",
    active: true,
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deviceId: getSchedulingDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
  };
}

export type CreateCalendarResponseInput = {
  accountId: string;
  schoolId: number;
  branchId: number;

  eventId: number;
  participantId?: number | null;

  userLocalId?: number | null;
  participantType?: CalendarParticipantType;

  responseStatus: CalendarResponseStatus;
  note?: string;
};

export function createCalendarResponseRecord(
  input: CreateCalendarResponseInput
): CalendarEventResponse {
  const timestamp = now();

  return {
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,

    eventId: input.eventId,
    participantId: input.participantId ?? null,

    userLocalId: input.userLocalId ?? null,
    participantType: input.participantType,

    responseStatus: input.responseStatus,
    note: input.note?.trim(),
    respondedAt: timestamp,

    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deviceId: getSchedulingDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
  };
}
