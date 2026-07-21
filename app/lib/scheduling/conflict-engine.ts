/**
 * app/lib/scheduling/conflict-engine.ts
 * ---------------------------------------------------------
 * Conflict detection engine for calendar and timetable.
 */

import type {
  CalendarEvent,
  ScheduleConflict,
  ScheduleSession,
} from "../db/db";

import { eventsOverlap } from "../calendar/calendar-utils";
import {
  sessionsOverlap,
  sessionMatchesClass,
  sessionMatchesResource,
  sessionMatchesTeacher,
} from "./schedule-utils";

import { createScheduleConflictRecord } from "./schedule-factory";

export type SessionConflictInput = {
  accountId: string;
  schoolId: string;
  branchId: string;
  candidate: ScheduleSession;
  existingSessions: ScheduleSession[];
  excludeSessionId?: string;
};

export function detectSessionConflicts(
  input: SessionConflictInput
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (const existing of input.existingSessions) {
    if (input.excludeSessionId && existing.id === input.excludeSessionId) continue;
    if (existing.isDeleted || existing.active === false) continue;
    if (!sessionsOverlap(input.candidate, existing)) continue;

    if (sessionMatchesTeacher(existing, input.candidate.teacherId)) {
      conflicts.push(
        createScheduleConflictRecord({
          accountId: input.accountId,
          schoolId: input.schoolId,
          branchId: input.branchId,
          conflictType: "teacher_double_booked",
          severity: "critical",
          title: "Teacher double-booked",
          description: "The same teacher has another session at this time.",
          sessionIdA: input.candidate.id ?? null,
          sessionIdB: existing.id ?? null,
          teacherId: input.candidate.teacherId ?? null,
          dayOfWeek: input.candidate.dayOfWeek,
          startMinute: Math.max(input.candidate.startMinute, existing.startMinute),
          endMinute: Math.min(input.candidate.endMinute, existing.endMinute),
        })
      );
    }

    if (sessionMatchesClass(existing, input.candidate.classId)) {
      conflicts.push(
        createScheduleConflictRecord({
          accountId: input.accountId,
          schoolId: input.schoolId,
          branchId: input.branchId,
          conflictType: "class_double_booked",
          severity: "high",
          title: "Class double-booked",
          description: "The same class has another session at this time.",
          sessionIdA: input.candidate.id ?? null,
          sessionIdB: existing.id ?? null,
          classId: input.candidate.classId ?? null,
          dayOfWeek: input.candidate.dayOfWeek,
          startMinute: Math.max(input.candidate.startMinute, existing.startMinute),
          endMinute: Math.min(input.candidate.endMinute, existing.endMinute),
        })
      );
    }

    if (sessionMatchesResource(existing, input.candidate.resourceId)) {
      conflicts.push(
        createScheduleConflictRecord({
          accountId: input.accountId,
          schoolId: input.schoolId,
          branchId: input.branchId,
          conflictType: "resource_double_booked",
          severity: "high",
          title: "Resource double-booked",
          description: "The same room/resource is already in use at this time.",
          sessionIdA: input.candidate.id ?? null,
          sessionIdB: existing.id ?? null,
          resourceId: input.candidate.resourceId ?? null,
          dayOfWeek: input.candidate.dayOfWeek,
          startMinute: Math.max(input.candidate.startMinute, existing.startMinute),
          endMinute: Math.min(input.candidate.endMinute, existing.endMinute),
        })
      );
    }
  }

  return mergeDuplicateConflicts(conflicts);
}

export type CalendarConflictInput = {
  accountId: string;
  schoolId: string;
  branchId: string;
  candidate: CalendarEvent;
  existingEvents: CalendarEvent[];
  excludeEventId?: string;
};

export function detectCalendarConflicts(
  input: CalendarConflictInput
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (const existing of input.existingEvents) {
    if (input.excludeEventId && existing.id === input.excludeEventId) continue;
    if (existing.isDeleted || existing.active === false || existing.status === "cancelled") continue;
    if (!eventsOverlap(input.candidate, existing)) continue;

    if (
      input.candidate.teacherId &&
      existing.teacherId &&
      String(input.candidate.teacherId) === String(existing.teacherId)
    ) {
      conflicts.push(
        createScheduleConflictRecord({
          accountId: input.accountId,
          schoolId: input.schoolId,
          branchId: input.branchId,
          conflictType: "teacher_double_booked",
          severity: "critical",
          title: "Teacher calendar conflict",
          description: "The same teacher has another event at this time.",
          eventIdA: input.candidate.id ?? null,
          eventIdB: existing.id ?? null,
          teacherId: input.candidate.teacherId ?? null,
          conflictStartAt: Math.max(input.candidate.startAt, existing.startAt),
          conflictEndAt: Math.min(input.candidate.endAt, existing.endAt),
        })
      );
    }

    if (
      input.candidate.classId &&
      existing.classId &&
      String(input.candidate.classId) === String(existing.classId)
    ) {
      conflicts.push(
        createScheduleConflictRecord({
          accountId: input.accountId,
          schoolId: input.schoolId,
          branchId: input.branchId,
          conflictType: "class_double_booked",
          severity: "high",
          title: "Class calendar conflict",
          description: "The same class has another event at this time.",
          eventIdA: input.candidate.id ?? null,
          eventIdB: existing.id ?? null,
          classId: input.candidate.classId ?? null,
          conflictStartAt: Math.max(input.candidate.startAt, existing.startAt),
          conflictEndAt: Math.min(input.candidate.endAt, existing.endAt),
        })
      );
    }
  }

  return mergeDuplicateConflicts(conflicts);
}

export function mergeDuplicateConflicts(conflicts: ScheduleConflict[]) {
  const seen = new Set<string>();
  const unique: ScheduleConflict[] = [];

  for (const conflict of conflicts) {
    const key = [
      conflict.conflictType,
      conflict.eventIdA,
      conflict.eventIdB,
      conflict.sessionIdA,
      conflict.sessionIdB,
      conflict.resourceId,
      conflict.teacherId,
      conflict.classId,
      conflict.dayOfWeek,
      conflict.startMinute,
      conflict.endMinute,
      conflict.conflictStartAt,
      conflict.conflictEndAt,
    ].join("|");

    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(conflict);
  }

  return unique;
}
