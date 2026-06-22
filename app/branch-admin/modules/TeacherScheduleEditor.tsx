"use client";

/**
 * app/branch-admin/modules/TeacherScheduleEditor.tsx
 * ---------------------------------------------------------
 * TEACHER SCHEDULE EDITOR - OFFLINE-FIRST FORM MODULE
 * ---------------------------------------------------------
 * Purpose:
 * - Drawer form used by TeacherTimetable.tsx to create, edit, duplicate, and move teacher timetable sessions.
 * - Supports repeat days so one teacher lesson/routine can be applied across multiple days.
 *
 * Tables affected by parent page:
 * - scheduleTimetables
 * - scheduleSessions
 * - scheduleConflicts
 *
 * Sync behavior:
 * - This component does not write directly to Dexie.
 * - Parent page performs createLocal(...), updateLocal(...), and softDeleteLocal(...), so prepareSyncData and prepareSoftDelete are applied safely.
 *
 * Design standard:
 * - Uses the polished Eleeveon "ba-" UI style shared by Calendar and timetable pages.
 */

import React from "react";

type AnyRow = Record<string, any>;

type TeacherScheduleForm = {
  id: number;
  sourceId: number;
  timetableName: string;
  timetableId: string;
  dayOfWeek: string;
  repeatDays: string[];
  sessionType: string;
  title: string;
  startTime: string;
  endTime: string;
  classId: string;
  subjectId: string;
  teacherLocalId: string;
  resourceId: string;
  roomName: string;
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};
const SHORT_DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function idOf(row?: AnyRow) {
  return row?.id ?? row?.localId ?? row?.cloudId;
}

function rowName(row?: AnyRow) {
  return String(row?.fullName || row?.name || row?.title || row?.label || row?.email || "Unnamed").trim();
}

export function TeacherScheduleEditor({
  open,
  mode,
  saving,
  message,
  activeBranchName,
  form,
  setForm,
  timetables,
  selectedTimetableId,
  classes,
  subjects,
  teachers,
  resources,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit" | "duplicate" | "move";
  saving: boolean;
  message: string;
  activeBranchName: string;
  form: TeacherScheduleForm;
  setForm: React.Dispatch<React.SetStateAction<TeacherScheduleForm>>;
  timetables: AnyRow[];
  selectedTimetableId: number | "";
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  function toggleRepeatDay(day: string) {
    setForm((current) => {
      const existing = Array.isArray(current.repeatDays) ? current.repeatDays : [];
      const hasDay = existing.includes(day);
      const nextDays = hasDay ? existing.filter((item) => item !== day) : [...existing, day];
      const cleanDays = nextDays.length ? nextDays : [current.dayOfWeek || "monday"];

      return {
        ...current,
        repeatDays: cleanDays,
        dayOfWeek: cleanDays[0] || "monday",
      };
    });
  }

  const title =
    mode === "edit"
      ? "Edit Teacher Session"
      : mode === "duplicate"
      ? "Duplicate Teacher Session"
      : mode === "move"
      ? "Move Teacher Session"
      : "New Teacher Session";

  const buttonText = saving
    ? "Saving..."
    : mode === "edit"
    ? "Save Changes"
    : mode === "duplicate"
    ? "Save Duplicate"
    : mode === "move"
    ? "Move Session"
    : "Save Session";

  return (
    <div className="ba-drawer-layer">
      <button className="ba-drawer-overlay" type="button" onClick={onClose} />

      <aside className="ba-drawer" aria-label={title}>
        <div className="ba-drawer-head">
          <div>
            <p>{mode === "create" ? "New Session" : mode}</p>
            <h2>{title}</h2>
            <span>{activeBranchName || "Assigned branch"}</span>
          </div>

          <button type="button" onClick={onClose} aria-label="Close editor">
            ✕
          </button>
        </div>

        {message ? <div className="ba-message">{message}</div> : null}

        <section className="ba-form-card">
          <div className="ba-form-grid">
            <label className="wide">
              <span>Use Existing Timetable</span>
              <select
                value={form.timetableId || selectedTimetableId}
                onChange={(event) => setForm((current) => ({ ...current, timetableId: event.target.value }))}
              >
                <option value="">Create / Use Default</option>
                {timetables.map((timetable: AnyRow) => (
                  <option key={String(idOf(timetable))} value={String(idOf(timetable))}>
                    {timetable.name || timetable.title || "Teacher Timetable"}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">
              <span>New Timetable Name if needed</span>
              <input
                value={form.timetableName}
                onChange={(event) => setForm((current) => ({ ...current, timetableName: event.target.value }))}
                placeholder="Teacher Timetable"
              />
            </label>

            <label>
              <span>Main Day</span>
              <select
                value={form.dayOfWeek}
                onChange={(event) => {
                  const nextDay = event.target.value;
                  setForm((current) => ({
                    ...current,
                    dayOfWeek: nextDay,
                    repeatDays: Array.from(new Set([nextDay, ...(current.repeatDays || [])])),
                  }));
                }}
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {DAY_LABELS[day]}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">
              <span>{form.id ? "Apply changes across days" : "Repeat across days"}</span>
              <div className="ba-day-picker">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={(form.repeatDays || []).includes(day) ? "active" : ""}
                    onClick={() => toggleRepeatDay(day)}
                  >
                    {SHORT_DAY_LABELS[day]}
                  </button>
                ))}
              </div>
              <small className="ba-help-text">
                Select multiple days for repeated teacher lessons, assemblies, routines, or recurring periods.
              </small>
            </label>

            <label>
              <span>Session Type</span>
              <select
                value={form.sessionType}
                onChange={(event) => setForm((current) => ({ ...current, sessionType: event.target.value }))}
              >
                <option value="lesson">Lesson</option>
                <option value="exam">Exam</option>
                <option value="meeting">Meeting</option>
                <option value="break">Break</option>
                <option value="activity">Activity</option>
              </select>
            </label>

            <label>
              <span>Start</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
              />
            </label>

            <label>
              <span>End</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
              />
            </label>

            <label className="wide">
              <span>Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Optional custom title"
              />
            </label>

            <label>
              <span>Teacher</span>
              <select
                value={form.teacherLocalId}
                onChange={(event) => setForm((current) => ({ ...current, teacherLocalId: event.target.value }))}
              >
                <option value="">No teacher</option>
                {teachers.map((row: AnyRow) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {rowName(row)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Class</span>
              <select
                value={form.classId}
                onChange={(event) => setForm((current) => ({ ...current, classId: event.target.value }))}
              >
                <option value="">No class</option>
                {classes.map((row: AnyRow) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {row.name || row.className || "Class"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Subject</span>
              <select
                value={form.subjectId}
                onChange={(event) => setForm((current) => ({ ...current, subjectId: event.target.value }))}
              >
                <option value="">No subject</option>
                {subjects.map((row: AnyRow) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {row.name || row.subjectName || "Subject"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Resource</span>
              <select
                value={form.resourceId}
                onChange={(event) => setForm((current) => ({ ...current, resourceId: event.target.value }))}
              >
                <option value="">No resource</option>
                {resources.map((row: AnyRow) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {row.name || row.roomName || "Resource"}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">
              <span>Room name if no resource</span>
              <input
                value={form.roomName}
                onChange={(event) => setForm((current) => ({ ...current, roomName: event.target.value }))}
              />
            </label>
          </div>
        </section>

        <div className="ba-drawer-actions">
          <button className="ba-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="ba-primary" type="button" disabled={saving} onClick={onSave}>
            {buttonText}
          </button>
        </div>
      </aside>
    </div>
  );
}
