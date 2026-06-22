/**
 * app/lib/scheduling/schedule-factory.ts
 * ---------------------------------------------------------
 * Timetable/scheduling record factories.
 */

import type {
  ScheduleConflict,
  ScheduleConflictSeverity,
  ScheduleConflictType,
  ScheduleDayOfWeek,
  ScheduleResource,
  ScheduleResourceType,
  ScheduleScopeType,
  ScheduleSession,
  ScheduleSessionType,
  ScheduleTimetable,
  ScheduleTimetableType,
} from "../db";
import { SYNC_STATUS_VALUE } from "../sync/syncConfig";

import { getSchedulingDeviceId } from "../calendar/calendar-factory";

function now() {
  return Date.now();
}

export type CreateScheduleTimetableInput = {
  accountId: string;
  schoolId: number;
  branchId: number;

  name: string;
  description?: string;

  timetableType: ScheduleTimetableType;
  scopeType: ScheduleScopeType;
  scopeId?: number | null;

  academicStructureId?: number | null;
  academicPeriodId?: number | null;

  classId?: number | null;
  teacherLocalId?: number | null;

  effectiveFrom?: number | null;
  effectiveTo?: number | null;

  isDefault?: boolean;

  createdByUserId?: number | string | null;
  createdByRole?: string;
};

export function createScheduleTimetableRecord(
  input: CreateScheduleTimetableInput
): ScheduleTimetable {
  const timestamp = now();

  return {
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,

    name: input.name.trim(),
    description: input.description?.trim(),

    timetableType: input.timetableType,
    scopeType: input.scopeType,
    scopeId: input.scopeId ?? null,

    academicStructureId: input.academicStructureId ?? null,
    academicPeriodId: input.academicPeriodId ?? null,

    classId: input.classId ?? null,
    teacherLocalId: input.teacherLocalId ?? null,

    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,

    status: "draft",
    active: true,
    isDefault: input.isDefault ?? false,

    createdByUserId: input.createdByUserId ?? null,
    createdByRole: input.createdByRole,

    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deviceId: getSchedulingDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
  };
}

export type CreateScheduleSessionInput = {
  accountId: string;
  schoolId: number;
  branchId: number;

  timetableId: number;

  sessionType: ScheduleSessionType;
  dayOfWeek: ScheduleDayOfWeek;
  startMinute: number;
  endMinute: number;

  title?: string;
  description?: string;

  classId?: number | null;
  subjectId?: number | null;
  classSubjectId?: number | null;
  teacherLocalId?: number | null;

  resourceId?: number | null;
  roomName?: string;
  location?: string;

  color?: string;

  effectiveFrom?: number | null;
  effectiveTo?: number | null;
};

export function createScheduleSessionRecord(
  input: CreateScheduleSessionInput
): ScheduleSession {
  const timestamp = now();

  return {
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,

    timetableId: input.timetableId,

    sessionType: input.sessionType,
    dayOfWeek: input.dayOfWeek,

    startMinute: input.startMinute,
    endMinute: input.endMinute,

    title: input.title?.trim(),
    description: input.description?.trim(),

    classId: input.classId ?? null,
    subjectId: input.subjectId ?? null,
    classSubjectId: input.classSubjectId ?? null,
    teacherLocalId: input.teacherLocalId ?? null,

    resourceId: input.resourceId ?? null,
    roomName: input.roomName?.trim(),
    location: input.location?.trim(),

    color: input.color,

    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,

    active: true,
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deviceId: getSchedulingDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
  };
}

export type CreateScheduleResourceInput = {
  accountId: string;
  schoolId: number;
  branchId: number;

  name: string;
  resourceType: ScheduleResourceType;

  description?: string;
  capacity?: number | null;
  location?: string;

  scopeType?: ScheduleScopeType;
  scopeId?: number | null;
};

export function createScheduleResourceRecord(
  input: CreateScheduleResourceInput
): ScheduleResource {
  const timestamp = now();

  return {
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,

    name: input.name.trim(),
    resourceType: input.resourceType,

    description: input.description?.trim(),
    capacity: input.capacity ?? null,
    location: input.location?.trim(),

    scopeType: input.scopeType,
    scopeId: input.scopeId ?? null,

    active: true,
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deviceId: getSchedulingDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
  };
}

export type CreateScheduleConflictInput = {
  accountId: string;
  schoolId: number;
  branchId: number;

  conflictType: ScheduleConflictType;
  severity: ScheduleConflictSeverity;

  title: string;
  description?: string;

  eventIdA?: number | null;
  eventIdB?: number | null;

  sessionIdA?: number | null;
  sessionIdB?: number | null;

  resourceId?: number | null;

  teacherLocalId?: number | null;
  classId?: number | null;
  studentLocalId?: number | null;

  conflictStartAt?: number | null;
  conflictEndAt?: number | null;

  dayOfWeek?: ScheduleDayOfWeek;
  startMinute?: number | null;
  endMinute?: number | null;
};

export function createScheduleConflictRecord(
  input: CreateScheduleConflictInput
): ScheduleConflict {
  const timestamp = now();

  return {
    accountId: input.accountId,
    schoolId: input.schoolId,
    branchId: input.branchId,

    conflictType: input.conflictType,
    severity: input.severity,
    status: "open",

    title: input.title.trim(),
    description: input.description?.trim(),

    eventIdA: input.eventIdA ?? null,
    eventIdB: input.eventIdB ?? null,

    sessionIdA: input.sessionIdA ?? null,
    sessionIdB: input.sessionIdB ?? null,

    resourceId: input.resourceId ?? null,

    teacherLocalId: input.teacherLocalId ?? null,
    classId: input.classId ?? null,
    studentLocalId: input.studentLocalId ?? null,

    conflictStartAt: input.conflictStartAt ?? null,
    conflictEndAt: input.conflictEndAt ?? null,

    dayOfWeek: input.dayOfWeek,
    startMinute: input.startMinute ?? null,
    endMinute: input.endMinute ?? null,

    detectedAt: timestamp,

    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deviceId: getSchedulingDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
  };
}
