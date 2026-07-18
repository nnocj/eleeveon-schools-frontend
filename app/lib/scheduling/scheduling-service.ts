/**
 * app/lib/scheduling/scheduling-service.ts
 * ---------------------------------------------------------
 * Timetable/scheduling Dexie service.
 */

import { db } from "../db/db";
import type {
  ScheduleConflict,
  ScheduleResource,
  ScheduleSession,
  ScheduleTimetable,
} from "../db/db";

import {
  createScheduleResourceRecord,
  createScheduleSessionRecord,
  createScheduleTimetableRecord,
  type CreateScheduleResourceInput,
  type CreateScheduleSessionInput,
  type CreateScheduleTimetableInput,
} from "./schedule-factory";

import {
  isSessionActive,
  isValidMinuteRange,
  sortSessionsByDayAndTime,
} from "./schedule-utils";

import { detectSessionConflicts } from "./conflict-engine";
import { SYNC_STATUS_VALUE } from "../sync/syncConfig";

function now() {
  return Date.now();
}

function nextVersion(current?: number) {
  return Number(current || 0) + 1;
}

export async function createTimetable(input: CreateScheduleTimetableInput) {
  const record = createScheduleTimetableRecord(input);
  const id = await db.scheduleTimetables.add(record);

  return {
    ...record,
    id: Number(id),
  };
}

export async function listTimetables(input: {
  accountId: string;
  schoolId?: number;
  branchId?: number;
  includeDeleted?: boolean;
}) {
  let rows = await db.scheduleTimetables
    .where("accountId")
    .equals(input.accountId)
    .toArray();

  rows = rows.filter((row) => {
    if (!input.includeDeleted && row.isDeleted) return false;
    if (input.schoolId && Number(row.schoolId) !== Number(input.schoolId)) return false;
    if (input.branchId && Number(row.branchId) !== Number(input.branchId)) return false;
    return true;
  });

  return rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export async function updateTimetable(
  timetableId: number,
  patch: Partial<ScheduleTimetable>
) {
  const existing = await db.scheduleTimetables.get(timetableId);

  if (!existing) {
    throw new Error("Timetable not found.");
  }

  await db.scheduleTimetables.update(timetableId, {
    ...patch,
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });

  return db.scheduleTimetables.get(timetableId);
}

export async function activateTimetable(timetableId: number) {
  return updateTimetable(timetableId, {
    status: "active",
    active: true,
  });
}

export async function archiveTimetable(timetableId: number) {
  return updateTimetable(timetableId, {
    status: "archived",
    active: false,
  });
}

export async function softDeleteTimetable(timetableId: number) {
  const existing = await db.scheduleTimetables.get(timetableId);

  if (!existing) {
    throw new Error("Timetable not found.");
  }

  await db.scheduleTimetables.update(timetableId, {
    isDeleted: true,
    active: false,
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });
}

export async function addScheduleSession(input: {
  session: CreateScheduleSessionInput;
  checkConflicts?: boolean;
  saveConflicts?: boolean;
}) {
  if (!isValidMinuteRange(input.session.startMinute, input.session.endMinute)) {
    throw new Error("Schedule session end time must be after start time.");
  }

  const candidate = createScheduleSessionRecord(input.session);

  let conflicts: ScheduleConflict[] = [];

  if (input.checkConflicts !== false) {
    const existingSessions = await listSessionsForBranch({
      accountId: input.session.accountId,
      schoolId: input.session.schoolId,
      branchId: input.session.branchId,
    });

    conflicts = detectSessionConflicts({
      accountId: input.session.accountId,
      schoolId: input.session.schoolId,
      branchId: input.session.branchId,
      candidate,
      existingSessions,
    });
  }

  const id = await db.scheduleSessions.add(candidate);
  const savedSession = { ...candidate, id: Number(id) };

  if (conflicts.length && input.saveConflicts !== false) {
    for (const conflict of conflicts) {
      await db.scheduleConflicts.add({
        ...conflict,
        sessionIdA: savedSession.id,
      });
    }
  }

  return {
    session: savedSession,
    conflicts,
  };
}

export async function updateScheduleSession(
  sessionId: number,
  patch: Partial<ScheduleSession>,
  options?: {
    checkConflicts?: boolean;
    saveConflicts?: boolean;
  }
) {
  const existing = await db.scheduleSessions.get(sessionId);

  if (!existing) {
    throw new Error("Schedule session not found.");
  }

  const candidate = {
    ...existing,
    ...patch,
  };

  if (!isValidMinuteRange(candidate.startMinute, candidate.endMinute)) {
    throw new Error("Schedule session end time must be after start time.");
  }

  let conflicts: ScheduleConflict[] = [];

  if (options?.checkConflicts !== false) {
    const existingSessions = await listSessionsForBranch({
      accountId: existing.accountId,
      schoolId: existing.schoolId,
      branchId: existing.branchId,
    });

    conflicts = detectSessionConflicts({
      accountId: existing.accountId,
      schoolId: existing.schoolId,
      branchId: existing.branchId,
      candidate,
      existingSessions,
      excludeSessionId: sessionId,
    });
  }

  await db.scheduleSessions.update(sessionId, {
    ...patch,
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });

  if (conflicts.length && options?.saveConflicts !== false) {
    for (const conflict of conflicts) {
      await db.scheduleConflicts.add({
        ...conflict,
        sessionIdA: sessionId,
      });
    }
  }

  return {
    session: await db.scheduleSessions.get(sessionId),
    conflicts,
  };
}

export async function listSessionsForTimetable(timetableId: number) {
  const rows = await db.scheduleSessions
    .where("timetableId")
    .equals(timetableId)
    .toArray();

  return sortSessionsByDayAndTime(
    rows.filter((session) => isSessionActive(session))
  );
}

export async function listSessionsForBranch(input: {
  accountId: string;
  schoolId: number;
  branchId: number;
}) {
  const rows = await db.scheduleSessions
    .where("accountId")
    .equals(input.accountId)
    .toArray();

  return sortSessionsByDayAndTime(
    rows.filter((session) => {
      if (!isSessionActive(session)) return false;
      return (
        Number(session.schoolId) === Number(input.schoolId) &&
        Number(session.branchId) === Number(input.branchId)
      );
    })
  );
}

export async function softDeleteScheduleSession(sessionId: number) {
  const existing = await db.scheduleSessions.get(sessionId);

  if (!existing) {
    throw new Error("Schedule session not found.");
  }

  await db.scheduleSessions.update(sessionId, {
    isDeleted: true,
    active: false,
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });
}

export async function createScheduleResource(input: CreateScheduleResourceInput) {
  const record = createScheduleResourceRecord(input);
  const id = await db.scheduleResources.add(record);

  return {
    ...record,
    id: Number(id),
  };
}

export async function listScheduleResources(input: {
  accountId: string;
  schoolId?: number;
  branchId?: number;
  includeDeleted?: boolean;
}) {
  let rows = await db.scheduleResources
    .where("accountId")
    .equals(input.accountId)
    .toArray();

  rows = rows.filter((row) => {
    if (!input.includeDeleted && row.isDeleted) return false;
    if (input.schoolId && Number(row.schoolId) !== Number(input.schoolId)) return false;
    if (input.branchId && Number(row.branchId) !== Number(input.branchId)) return false;
    return true;
  });

  return rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export async function updateScheduleResource(
  resourceId: number,
  patch: Partial<ScheduleResource>
) {
  const existing = await db.scheduleResources.get(resourceId);

  if (!existing) {
    throw new Error("Schedule resource not found.");
  }

  await db.scheduleResources.update(resourceId, {
    ...patch,
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });

  return db.scheduleResources.get(resourceId);
}

export async function listOpenScheduleConflicts(input: {
  accountId: string;
  schoolId?: number;
  branchId?: number;
}) {
  let rows = await db.scheduleConflicts
    .where("accountId")
    .equals(input.accountId)
    .toArray();

  rows = rows.filter((row) => {
    if (row.isDeleted) return false;
    if (row.status !== "open") return false;
    if (input.schoolId && Number(row.schoolId) !== Number(input.schoolId)) return false;
    if (input.branchId && Number(row.branchId) !== Number(input.branchId)) return false;
    return true;
  });

  return rows.sort((a, b) => Number(b.detectedAt || 0) - Number(a.detectedAt || 0));
}

export async function resolveScheduleConflict(
  conflictId: number,
  input: {
    resolvedByUserId?: number | string | null;
    resolutionNote?: string;
  }
) {
  const existing = await db.scheduleConflicts.get(conflictId);

  if (!existing) {
    throw new Error("Schedule conflict not found.");
  }

  await db.scheduleConflicts.update(conflictId, {
    status: "resolved",
    resolvedAt: now(),
    resolvedByUserId: input.resolvedByUserId ?? null,
    resolutionNote: input.resolutionNote?.trim(),
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });

  return db.scheduleConflicts.get(conflictId);
}

export async function ignoreScheduleConflict(
  conflictId: number,
  note?: string
) {
  const existing = await db.scheduleConflicts.get(conflictId);

  if (!existing) {
    throw new Error("Schedule conflict not found.");
  }

  await db.scheduleConflicts.update(conflictId, {
    status: "ignored",
    resolutionNote: note?.trim(),
    updatedAt: now(),
    version: nextVersion(existing.version),
    synced: SYNC_STATUS_VALUE.PENDING,
  });

  return db.scheduleConflicts.get(conflictId);
}
