"use client";

/**
 * app/branch-admin/Calendar.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH CALENDAR V3
 * ---------------------------------------------------------
 * Golden Standard Module.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this scheduling page from accidentally using stale school/branch
 *   context left behind by another role or portal
 * - all timetable/calendar reads and writes now use the resolved workspace
 *   schoolId and branchId
 *
 * Golden UI behavior:
 * - no duplicate module hero/header block
 * - compact search + inline add + slider filter + more menu
 * - filters moved into a bottom sheet
 * - calendar, cards, table, and analytics live under the More menu
 * - Month, Week, Day, and Year calendar modes are preserved
 * - multi-day events still show on every affected day
 * - table headers use theme variables for dark mode support
 * - delete/cancel actions use calm neutral styling
 *
 * Data behavior:
 * - calendarEvents are branch scoped by accountId + schoolId + branchId
 * - createLocal(...) creates events and reminders
 * - updateLocal(...) edits/cancels events
 * - softDeleteLocal(...) sync-safe deletes events
 * - manual sync/version fields are intentionally not written here
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import type { CalendarEvent, CalendarEventReminder } from "../../lib/db";
import {
  createLocal,
  getSyncTable,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

type AnyRow = Record<string, any>;

type ViewMode = "calendar" | "cards" | "table" | "analytics";
type CalendarMode = "month" | "week" | "day" | "year";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

const now = () => Date.now();

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function cleanId(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstLocalId(...values: unknown[]) {
  for (const value of values) {
    const parsed = cleanId(value);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId")
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId")
  );
}


function dateValue(value?: number | string | null) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value?: number | string | null, withTime = true) {
  const time = dateValue(value);
  if (!time) return "Not set";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

function shortTime(value?: number | string | null) {
  const time = dateValue(value);
  if (!time) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "—";
  }
}

function monthTitle(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(value);
}

function dayTitle(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "2-digit",
    year: "numeric",
  }).format(value);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function daysBetween(start: Date, end: Date) {
  const startDay = startOfDay(start).getTime();
  const endDay = startOfDay(end).getTime();
  return Math.round((endDay - startDay) / 86_400_000);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date: Date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function addMonths(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

function addYears(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() + amount);
  return copy;
}

function startOfMonthGrid(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfWeek(first);
}

function getMonthGridDays(date: Date) {
  const start = startOfMonthGrid(date);
  return Array.from({ length: 42 }, (_unused: unknown, index: number) => addDays(start, index));
}

function getWeekDays(date: Date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_unused: unknown, index: number) => addDays(start, index));
}

function eventTime(row: AnyRow) {
  return dateValue(row.startAt || row.startDate || row.date || row.createdAt);
}

function eventEndTime(row: AnyRow) {
  return dateValue(row.endAt || row.endDate || row.startAt || row.date || row.createdAt);
}

function eventTitle(row: AnyRow) {
  return text(row.title || row.name || row.eventName, "Untitled event");
}

function eventType(row: AnyRow) {
  return text(row.eventType || row.type || row.category, "event");
}

function eventPriority(row: AnyRow) {
  return String(row.priority || "normal").toLowerCase();
}

function eventStatus(row: AnyRow) {
  return String(row.status || "scheduled").toLowerCase();
}

function priorityTone(priority?: string): Tone {
  const value = String(priority || "").toLowerCase();
  if (value === "urgent") return "red";
  if (value === "high") return "orange";
  if (value === "low") return "gray";
  return "blue";
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["done", "completed", "held", "active", "scheduled"].includes(value)) return "green";
  if (["cancelled", "failed"].includes(value)) return "red";
  if (["draft", "pending"].includes(value)) return "orange";
  return "blue";
}

function rowId(row: AnyRow) {
  return row.id ?? row.localId ?? row.cloudId ?? `${row.branchId || "branch"}-${eventTime(row)}-${eventTitle(row)}`;
}

function dayRange(date: Date) {
  const start = startOfDay(date).getTime();
  const end = addDays(startOfDay(date), 1).getTime();
  return { start, end };
}

function eventRange(row: AnyRow) {
  const start = eventTime(row);
  const rawEnd = eventEndTime(row) || start;
  const end = Math.max(rawEnd, start + 1);
  return { start, end };
}

function eventOverlapsDate(row: AnyRow, date: Date) {
  const range = eventRange(row);
  if (!range.start) return false;
  const day = dayRange(date);
  return range.start < day.end && range.end > day.start;
}

function eventStartsOnDate(row: AnyRow, date: Date) {
  const start = eventTime(row);
  return !!start && sameDay(new Date(start), date);
}

function eventEndsOnDate(row: AnyRow, date: Date) {
  const end = eventEndTime(row);
  if (!end) return eventStartsOnDate(row, date);
  return sameDay(new Date(Math.max(0, end - 1)), date);
}

function eventDurationDays(row: AnyRow) {
  const range = eventRange(row);
  if (!range.start) return 1;

  let count = 0;
  let cursor = startOfDay(new Date(range.start));
  const guardEnd = addDays(startOfDay(new Date(range.end)), 2);

  while (cursor.getTime() < guardEnd.getTime()) {
    if (eventOverlapsDate(row, cursor)) count += 1;
    cursor = addDays(cursor, 1);
    if (count > 370) break;
  }

  return Math.max(1, count);
}

function eventDayIndex(row: AnyRow, date: Date) {
  const start = eventTime(row);
  if (!start) return 1;
  return Math.max(1, daysBetween(new Date(start), date) + 1);
}

function occurrenceSegment(row: AnyRow, date?: Date) {
  if (!date || eventDurationDays(row) <= 1) return "single";
  const starts = eventStartsOnDate(row, date);
  const ends = eventEndsOnDate(row, date);
  if (starts && ends) return "single";
  if (starts) return "start";
  if (ends) return "end";
  return "middle";
}

function occurrenceLabel(row: AnyRow, date?: Date) {
  const total = eventDurationDays(row);
  if (!date || total <= 1) return "";
  const segment = occurrenceSegment(row, date);
  if (segment === "start") return `Starts · Day 1/${total}`;
  if (segment === "end") return `Ends · Day ${eventDayIndex(row, date)}/${total}`;
  return `Continues · Day ${eventDayIndex(row, date)}/${total}`;
}

function eventsForDate(events: AnyRow[], date: Date) {
  return events.filter((event: AnyRow) => eventOverlapsDate(event, date));
}

function eventsForMonth(events: AnyRow[], year: number, month: number) {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  return events.filter((event: AnyRow) => {
    const range = eventRange(event);
    if (!range.start) return false;
    return range.start < monthEnd.getTime() && range.end > monthStart.getTime();
  });
}

function monthName(index: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(2026, index, 1));
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

function SummaryCard({
  label,
  value,
  icon,
  positive,
  warning,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`ba-summary ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div>{icon}</div>
      <section>
        <strong>{value}</strong>
        <span>{label}</span>
      </section>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="ba-mini">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ title = "No records", text }: { title?: string; text: string }) {
  return (
    <section className="ba-empty">
      <div>📌</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function Toolbar({
  view,
  setView,
  count,
}: {
  view: ViewMode;
  setView: (value: ViewMode) => void;
  count: number;
}) {
  const views: { key: ViewMode; label: string; icon: string }[] = [
    { key: "calendar", label: "Calendar", icon: "📅" },
    { key: "cards", label: "Cards", icon: "▦" },
    { key: "table", label: "Table", icon: "☷" },
    { key: "analytics", label: "Analytics", icon: "📊" },
  ];

  return (
    <section className="ba-toolbar">
      <div className="ba-tabs">
        {views.map((item) => (
          <button
            key={item.key}
            type="button"
            className={view === item.key ? "active" : ""}
            onClick={() => setView(item.key)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <Chip>{count} shown</Chip>
    </section>
  );
}

function CalendarModeSwitch({
  mode,
  setMode,
}: {
  mode: CalendarMode;
  setMode: (value: CalendarMode) => void;
}) {
  const modes: { key: CalendarMode; label: string }[] = [
    { key: "month", label: "Month" },
    { key: "week", label: "Week" },
    { key: "day", label: "Day" },
    { key: "year", label: "Year" },
  ];

  return (
    <div className="ba-calendar-mode-tabs">
      {modes.map((item) => (
        <button
          key={item.key}
          type="button"
          className={mode === item.key ? "active" : ""}
          onClick={() => setMode(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function Calendar() {
  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();
  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedWorkspaceSchoolId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeSchoolId,
    activeSchool: activeSchool as any,
    settings: settings as any,
  });

  const branchId = selectedWorkspaceBranchId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeBranchId,
    activeBranch: activeBranch as any,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("calendar");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [events, setEvents] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateScope, setDateScope] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const emptyForm = {
    id: 0,
    title: "",
    description: "",
    eventType: "branch_event",
    visibility: "branch",
    startAt: "",
    endAt: "",
    location: "",
    priority: "normal",
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  async function load() {
    if (!accountId || !schoolId || !branchId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const table = getSyncTable("calendarEvents");
      const rows = ((await table.toArray()) || []) as CalendarEvent[];

      setEvents(
        rows
          .filter((event: AnyRow) => {
            if (event?.isDeleted === true) return false;
            if (String(event.accountId || "") !== String(accountId)) return false;
            if (Number(event.schoolId || 0) !== Number(schoolId)) return false;
            if (Number(event.branchId || 0) !== Number(branchId)) return false;
            return true;
          })
          .sort((a: AnyRow, b: AnyRow) => eventTime(a) - eventTime(b))
      );
    } catch (error) {
      console.error("Failed to load branch calendar:", error);
      setMessage("Failed to load branch calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, schoolId, branchId]);

  function resetForm() {
    setForm(emptyForm);
    setMessage("");
  }

  function toDateTimeLocal(value?: number | string | null) {
    const time = dateValue(value);
    if (!time) return "";

    const date = new Date(time);
    const offsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(time - offsetMs).toISOString().slice(0, 16);
  }

  function openCreate() {
    resetForm();
    setDrawer(true);
  }

  function openEdit(event: AnyRow) {
    setMessage("");
    setForm({
      id: cleanId(event.id || event.localId),
      title: eventTitle(event),
      description: String(event.description || ""),
      eventType: String(event.eventType || "branch_event"),
      visibility: String(event.visibility || "branch"),
      startAt: toDateTimeLocal(event.startAt),
      endAt: toDateTimeLocal(event.endAt),
      location: String(event.location || ""),
      priority: String(event.priority || "normal"),
    });
    setDrawer(true);
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const today = new Date();
    const weekStart = startOfWeek(focusDate).getTime();
    const weekEnd = addDays(startOfWeek(focusDate), 7).getTime();
    const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1).getTime();
    const monthEnd = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 1).getTime();

    return events
      .filter((event: AnyRow) => type === "all" || eventType(event) === type)
      .filter((event: AnyRow) => statusFilter === "all" || eventStatus(event) === statusFilter)
      .filter((event: AnyRow) => priorityFilter === "all" || eventPriority(event) === priorityFilter)
      .filter((event: AnyRow) => {
        if (locationFilter === "with_location") return !!String(event.location || "").trim();
        if (locationFilter === "no_location") return !String(event.location || "").trim();
        return true;
      })
      .filter((event: AnyRow) => {
        const range = eventRange(event);
        if (!range.start) return dateScope === "all";

        if (dateScope === "today") return eventOverlapsDate(event, today);
        if (dateScope === "upcoming") return range.end >= now() && eventStatus(event) !== "cancelled";
        if (dateScope === "past") return range.end < now();
        if (dateScope === "multi_day") return eventDurationDays(event) > 1;
        if (dateScope === "focus_week") return range.start < weekEnd && range.end > weekStart;
        if (dateScope === "focus_month") return range.start < monthEnd && range.end > monthStart;

        return true;
      })
      .filter((event: AnyRow) => {
        if (!q) return true;
        return `${eventTitle(event)} ${event.description || ""} ${event.location || ""} ${eventType(event)} ${eventStatus(event)} ${eventPriority(event)}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a: AnyRow, b: AnyRow) => eventTime(a) - eventTime(b));
  }, [dateScope, events, focusDate, locationFilter, priorityFilter, query, statusFilter, type]);

  const filtersActive =
    !!query.trim() ||
    type !== "all" ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    dateScope !== "all" ||
    locationFilter !== "all";

  const activeFilterCount = useMemo(
    () => [type, statusFilter, priorityFilter, dateScope, locationFilter].filter((value) => value !== "all").length,
    [dateScope, locationFilter, priorityFilter, statusFilter, type]
  );

  function clearFilters() {
    setQuery("");
    setType("all");
    setStatusFilter("all");
    setPriorityFilter("all");
    setDateScope("all");
    setLocationFilter("all");
  }

  const summary = useMemo(() => {
    return {
      total: events.length,
      upcoming: events.filter((event: AnyRow) => eventTime(event) >= now() && eventStatus(event) !== "cancelled").length,
      today: events.filter((event: AnyRow) => eventOverlapsDate(event, new Date())).length,
      meetings: events.filter((event: AnyRow) => eventType(event) === "meeting").length,
      exams: events.filter((event: AnyRow) => eventType(event) === "exam" || eventType(event) === "assessment").length,
      urgent: events.filter((event: AnyRow) => eventPriority(event) === "urgent" || eventPriority(event) === "high").length,
    };
  }, [events]);

  async function save() {
    setMessage("");

    if (!form.title.trim()) {
      setMessage("Event title is required.");
      return;
    }

    const start = new Date(form.startAt).getTime();
    const end = new Date(form.endAt).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      setMessage("Please enter a valid start and end time.");
      return;
    }

    if (!accountId || !schoolId || !branchId) {
      setMessage("Assigned branch context is required.");
      return;
    }

    setSaving(true);

    try {
      const eventPayload: Partial<CalendarEvent> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        scopeType: "branch",
        scopeId: Number(branchId),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        eventType: form.eventType as CalendarEvent["eventType"],
        status: "scheduled",
        visibility: form.visibility as CalendarEvent["visibility"],
        startAt: start,
        endAt: end,
        allDay: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
        location: form.location.trim() || undefined,
        priority: form.priority as CalendarEvent["priority"],
        createdByRole: "branch_admin",
        active: true,
        isDeleted: false,
      };

      const editingId = cleanId(form.id);

      if (editingId) {
        await updateLocal("calendarEvents", editingId, eventPayload as Partial<CalendarEvent>);
      } else {
        const createdEvent = (await createLocal("calendarEvents", eventPayload as CalendarEvent)) as CalendarEvent | undefined;
        const eventId = cleanId(createdEvent?.id);

        if (eventId) {
          const reminders: Partial<CalendarEventReminder>[] = [
            { channel: "in_app", minutesBefore: 60, status: "pending", active: true },
            { channel: "in_app", minutesBefore: 1440, status: "pending", active: true },
          ];

          for (const reminder of reminders) {
            await createLocal("calendarEventReminders", {
              accountId,
              schoolId: Number(schoolId),
              branchId: Number(branchId),
              eventId,
              channel: reminder.channel || "in_app",
              minutesBefore: Number(reminder.minutesBefore || 60),
              scheduledAt: Math.max(0, start - Number(reminder.minutesBefore || 60) * 60_000),
              status: reminder.status || "pending",
              active: true,
              isDeleted: false,
            } as CalendarEventReminder);
          }
        }
      }

      setDrawer(false);
      resetForm();
      await load();
    } catch (error: any) {
      console.error("Failed to save event:", error);
      setMessage(error?.message || "Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelEvent(event: AnyRow) {
    const id = cleanId(event.id || event.localId);
    if (!id) return;

    try {
      await updateLocal("calendarEvents", id, {
        status: "cancelled",
        active: false,
      } as Partial<CalendarEvent>);

      await load();
    } catch (error: any) {
      console.error("Failed to cancel event:", error);
      setMessage(error?.message || "Failed to cancel event.");
    }
  }

  async function deleteEvent(event: AnyRow) {
    const id = cleanId(event.id || event.localId);
    if (!id) return;

    const ok = window.confirm(`Delete "${eventTitle(event)}"? This will remove it from the calendar and sync the deletion safely.`);
    if (!ok) return;

    try {
      await softDeleteLocal("calendarEvents", id);
      await load();
    } catch (error: any) {
      console.error("Failed to delete event:", error);
      setMessage(error?.message || "Failed to delete event.");
    }
  }

  function moveBack() {
    if (calendarMode === "year") setFocusDate((date: Date) => addYears(date, -1));
    else if (calendarMode === "month") setFocusDate((date: Date) => addMonths(date, -1));
    else if (calendarMode === "week") setFocusDate((date: Date) => addDays(date, -7));
    else setFocusDate((date: Date) => addDays(date, -1));
  }

  function moveNext() {
    if (calendarMode === "year") setFocusDate((date: Date) => addYears(date, 1));
    else if (calendarMode === "month") setFocusDate((date: Date) => addMonths(date, 1));
    else if (calendarMode === "week") setFocusDate((date: Date) => addDays(date, 7));
    else setFocusDate((date: Date) => addDays(date, 1));
  }

  const currentTitle =
    calendarMode === "year"
      ? String(focusDate.getFullYear())
      : calendarMode === "day"
      ? dayTitle(focusDate)
      : calendarMode === "week"
      ? `${dateLabel(startOfWeek(focusDate).getTime(), false)} - ${dateLabel(addDays(startOfWeek(focusDate), 6).getTime(), false)}`
      : monthTitle(focusDate);

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Opening calendar...</h2>
          <p>Loading branch events and reminders.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {message ? <section className="ba-toast error">{message}<button type="button" onClick={() => setMessage("")}>✕</button></section> : null}

      <section className="ba-search-card" aria-label="Calendar search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search calendar..."
            aria-label="Search calendar events"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Add event">
          +
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount || query.trim() ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      {(filtersActive || view !== "calendar") && (
        <section className="ba-filter-chips" aria-label="Active calendar filters">
          {view !== "calendar" ? <button type="button" onClick={() => setView("calendar")}>View: {view} ×</button> : null}
          {type !== "all" ? <button type="button" onClick={() => setType("all")}>Type: {type.replaceAll("_", " ")} ×</button> : null}
          {statusFilter !== "all" ? <button type="button" onClick={() => setStatusFilter("all")}>Status: {statusFilter} ×</button> : null}
          {priorityFilter !== "all" ? <button type="button" onClick={() => setPriorityFilter("all")}>Priority: {priorityFilter} ×</button> : null}
          {dateScope !== "all" ? <button type="button" onClick={() => setDateScope("all")}>Date: {dateScope.replaceAll("_", " ")} ×</button> : null}
          {locationFilter !== "all" ? <button type="button" onClick={() => setLocationFilter("all")}>Location: {locationFilter.replaceAll("_", " ")} ×</button> : null}
        </section>
      )}

      {view === "calendar" ? (
        <section className="ba-calendar-panel golden-calendar-panel">
          <div className="ba-calendar-head">
            <div>
              <p>Branch Calendar</p>
              <h3>{currentTitle}</h3>
              <span className="ba-calendar-subtitle">
                {filtered.length} event(s) · {activeBranch?.name || "Assigned branch"}
              </span>
            </div>

            <div className="ba-calendar-head-actions">
              <CalendarModeSwitch mode={calendarMode} setMode={setCalendarMode} />
              <div className="ba-calendar-nav">
                <button type="button" onClick={moveBack}>←</button>
                <button type="button" onClick={() => setFocusDate(new Date())}>Today</button>
                <button type="button" onClick={moveNext}>→</button>
              </div>
            </div>
          </div>

          {calendarMode === "month" ? (
            <MonthCalendar
              date={focusDate}
              events={filtered}
              onSelectDay={(date) => {
                setFocusDate(date);
                setCalendarMode("day");
              }}
            />
          ) : null}

          {calendarMode === "week" ? (
            <WeekCalendar
              date={focusDate}
              events={filtered}
              onSelectDay={(date) => {
                setFocusDate(date);
                setCalendarMode("day");
              }}
            />
          ) : null}

          {calendarMode === "day" ? <DayCalendar date={focusDate} events={filtered} /> : null}

          {calendarMode === "year" ? (
            <YearCalendar
              date={focusDate}
              events={filtered}
              onSelectMonth={(monthIndex) => {
                setFocusDate(new Date(focusDate.getFullYear(), monthIndex, 1));
                setCalendarMode("month");
              }}
            />
          ) : null}
        </section>
      ) : null}

      {view === "analytics" ? (
        <section className="ba-analysis-grid ba-breakdown-grid">
          {[
            { label: "Total Events", value: summary.total },
            { label: "Upcoming", value: summary.upcoming },
            { label: "Today", value: summary.today },
            { label: "Meetings", value: summary.meetings },
            { label: "Exams", value: summary.exams },
            { label: "Urgent", value: summary.urgent },
          ].map((item) => (
            <article key={item.label} className="ba-breakdown ba-analysis">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.label === "Total Events" ? "All branch calendar records." : "Filtered from current branch events."}</p>
            </article>
          ))}

          {["branch_event", "meeting", "exam", "assessment", "fee_deadline", "holiday"].map((key) => {
            const count = events.filter((event: AnyRow) => eventType(event) === key).length;
            const share = events.length ? Math.round((count / events.length) * 100) : 0;
            return (
              <article key={key} className="ba-breakdown">
                <strong>{key.replaceAll("_", " ")}</strong>
                <div className="ba-bar"><div style={{ width: `${share}%` }} /></div>
                <div className="ba-chip-row"><Chip tone="blue">{count}</Chip><Chip>{share}%</Chip></div>
              </article>
            );
          })}
        </section>
      ) : null}

      {view === "table" ? (
        <section className="ba-panel">
          <div className="ba-table-wrap">
            <table className="ba-table">
              <thead>
                <tr>
                  <th>Events ({filtered.length})</th>
                  <th>Type</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Duration</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((event: AnyRow) => (
                  <tr key={String(rowId(event))}>
                    <td><strong>{eventTitle(event)}</strong><span>{event.description || "—"}</span></td>
                    <td>{eventType(event).replaceAll("_", " ")}</td>
                    <td>{dateLabel(event.startAt)}</td>
                    <td>{dateLabel(event.endAt)}</td>
                    <td>{eventDurationDays(event)} day(s)</td>
                    <td>{event.location || "—"}</td>
                    <td><Chip tone={statusTone(eventStatus(event))}>{eventStatus(event)}</Chip></td>
                    <td>
                      <div className="ba-table-actions">
                        <button type="button" onClick={() => openEdit(event)}>Edit</button>
                        {eventStatus(event) !== "cancelled" ? <button type="button" onClick={() => cancelEvent(event)}>Cancel</button> : null}
                        <button type="button" className="ba-delete" onClick={() => deleteEvent(event)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? <tr><td colSpan={8}><EmptyCard text="No calendar events found." /></td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "cards" ? (
        <section className="ba-list calendar-list">
          {filtered.map((event: AnyRow) => (
            <article key={String(rowId(event))} className="calendar-row">
              <div className="calendar-date-badge">
                <strong>{new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(new Date(eventTime(event) || Date.now()))}</strong>
                <span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(eventTime(event) || Date.now()))}</span>
              </div>

              <span className="calendar-main">
                <strong>{eventTitle(event)}</strong>
                <small>{dateLabel(event.startAt)} · {event.location || "No location"}</small>
                <em>{eventType(event).replaceAll("_", " ")} · {eventDurationDays(event)} day(s)</em>
              </span>

              <span className="calendar-side">
                <span className={`status-dot-mini ${statusTone(eventStatus(event))}`} title={eventStatus(event)} />
                <button type="button" onClick={() => openEdit(event)} aria-label="Edit event">⋯</button>
              </span>
            </article>
          ))}
          {!filtered.length ? <EmptyCard text="No calendar events found." /> : null}
        </section>
      ) : null}

      {filterOpen ? (
        <FilterSheet
          query={query}
          type={type}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
          dateScope={dateScope}
          locationFilter={locationFilter}
          setQuery={setQuery}
          setType={setType}
          setStatusFilter={setStatusFilter}
          setPriorityFilter={setPriorityFilter}
          setDateScope={setDateScope}
          setLocationFilter={setLocationFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          calendarMode={calendarMode}
          setView={(nextView) => { setView(nextView); setMoreOpen(false); }}
          setCalendarMode={(nextMode) => { setCalendarMode(nextMode); setView("calendar"); setMoreOpen(false); }}
          onToday={() => { setFocusDate(new Date()); setView("calendar"); setMoreOpen(false); }}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}

      {drawer ? (
        <div className="ba-drawer-layer">
          <button className="ba-drawer-overlay" type="button" onClick={() => setDrawer(false)} />
          <aside className="ba-drawer">
            <div className="ba-drawer-head">
              <div>
                <p>{form.id ? "Edit Event" : "New Event"}</p>
                <h2>{form.id ? "Update Branch Event" : "Branch Calendar Event"}</h2>
                <span>{activeBranch?.name || "Assigned branch"}</span>
              </div>
              <button type="button" onClick={() => { setDrawer(false); resetForm(); }}>✕</button>
            </div>

            {message ? <div className="ba-message">{message}</div> : null}

            <section className="ba-form-card">
              <div className="ba-form-grid">
                <label className="wide"><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
                <label><span>Type</span><select value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })}><option value="branch_event">Branch Event</option><option value="meeting">Meeting</option><option value="exam">Exam</option><option value="assessment">Assessment</option><option value="fee_deadline">Fee Deadline</option><option value="holiday">Holiday</option></select></label>
                <label><span>Priority</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label>
                <label><span>Start</span><input type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></label>
                <label><span>End</span><input type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} /></label>
                <label className="wide"><span>Location</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
                <label className="wide"><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              </div>
            </section>

            <div className="ba-drawer-actions">
              <button className="ba-btn" type="button" onClick={() => { setDrawer(false); resetForm(); }}>Cancel</button>
              <button className="ba-primary" type="button" disabled={saving} onClick={save}>{saving ? "Saving..." : form.id ? "Save Changes" : "Save Event"}</button>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function FilterSheet({
  query,
  type,
  statusFilter,
  priorityFilter,
  dateScope,
  locationFilter,
  setQuery,
  setType,
  setStatusFilter,
  setPriorityFilter,
  setDateScope,
  setLocationFilter,
  clearFilters,
  onClose,
}: {
  query: string;
  type: string;
  statusFilter: string;
  priorityFilter: string;
  dateScope: string;
  locationFilter: string;
  setQuery: (value: string) => void;
  setType: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setPriorityFilter: (value: string) => void;
  setDateScope: (value: string) => void;
  setLocationFilter: (value: string) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div><h2>Calendar Filters</h2><p>Filter branch events without crowding the main calendar.</p></div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>
        <div className="ba-form compact">
          <label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, location, description..." /></label>
          <label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All Types</option><option value="branch_event">Branch Event</option><option value="meeting">Meeting</option><option value="exam">Exam</option><option value="assessment">Assessment</option><option value="fee_deadline">Fee Deadline</option><option value="holiday">Holiday</option></select></label>
          <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All Statuses</option><option value="scheduled">Scheduled</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option><option value="draft">Draft</option><option value="pending">Pending</option></select></label>
          <label><span>Priority</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All Priorities</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label>
          <label><span>Date Scope</span><select value={dateScope} onChange={(event) => setDateScope(event.target.value)}><option value="all">All Dates</option><option value="today">Today</option><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="multi_day">Multi-day</option><option value="focus_week">Current Week View</option><option value="focus_month">Current Month View</option></select></label>
          <label><span>Location</span><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option value="all">All Locations</option><option value="with_location">With Location</option><option value="no_location">No Location</option></select></label>
        </div>
        <div className="ba-sheet-actions"><button type="button" onClick={clearFilters}>Clear</button><button type="button" className="primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({
  view,
  calendarMode,
  setView,
  setCalendarMode,
  onToday,
  onRefresh,
  onClose,
}: {
  view: ViewMode;
  calendarMode: CalendarMode;
  setView: (value: ViewMode) => void;
  setCalendarMode: (value: CalendarMode) => void;
  onToday: () => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div><h2>More</h2><p>Calendar views and quick actions.</p></div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>
        <div className="ba-menu-list">
          {(["calendar", "cards", "table", "analytics"] as ViewMode[]).map((mode) => (
            <button key={mode} type="button" className={view === mode ? "active" : ""} onClick={() => setView(mode)}><span>{mode === "calendar" ? "📅" : mode === "cards" ? "☰" : mode === "table" ? "☷" : "◔"}</span><b>{mode === "cards" ? "List" : mode.charAt(0).toUpperCase() + mode.slice(1)}</b><small>{mode === "calendar" ? "Month, week, day and year" : mode === "analytics" ? "Summary breakdowns" : "Alternative event view"}</small></button>
          ))}
          {(["month", "week", "day", "year"] as CalendarMode[]).map((mode) => (
            <button key={mode} type="button" className={calendarMode === mode && view === "calendar" ? "active" : ""} onClick={() => setCalendarMode(mode)}><span>↳</span><b>{mode.charAt(0).toUpperCase() + mode.slice(1)} calendar</b><small>Switch calendar mode</small></button>
          ))}
          <button type="button" onClick={onToday}><span>◎</span><b>Today</b><small>Return to today</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local branch events</small></button>
        </div>
      </section>
    </div>
  );
}

function EventPill({
  event,
  compact = false,
  occurrenceDate,
}: {
  event: AnyRow;
  compact?: boolean;
  occurrenceDate?: Date;
}) {
  const totalDays = eventDurationDays(event);
  const segment = occurrenceSegment(event, occurrenceDate);
  const label = occurrenceLabel(event, occurrenceDate);
  const title = compact
    ? eventTitle(event)
    : `${shortTime(event.startAt || event.startDate || event.date)} · ${eventTitle(event)}`;

  return (
    <article className={`ba-event-pill ${compact ? "compact" : ""} ${totalDays > 1 ? "multi" : ""} ${segment}`}>
      <strong>{title}</strong>
      {!compact ? <span>{eventType(event)} · {eventPriority(event)}</span> : null}
      {label ? <small>{label}</small> : null}
    </article>
  );
}

function MonthCalendar({
  date,
  events,
  onSelectDay,
}: {
  date: Date;
  events: AnyRow[];
  onSelectDay: (date: Date) => void;
}) {
  const days = getMonthGridDays(date);
  const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <section className="ba-month-calendar">
      <div className="ba-week-labels">
        {weekLabels.map((label) => (
          <strong key={label}>{label}</strong>
        ))}
      </div>

      <div className="ba-month-grid">
        {days.map((day) => {
          const dayEvents = eventsForDate(events, day);
          const isCurrentMonth = day.getMonth() === date.getMonth();

          return (
            <button
              type="button"
              key={day.toISOString()}
              className={`ba-month-day ${isCurrentMonth ? "" : "muted"} ${sameDay(day, new Date()) ? "today" : ""}`}
              onClick={() => onSelectDay(day)}
            >
              <span>{day.getDate()}</span>

              <div>
                {dayEvents.slice(0, 3).map((event: AnyRow) => (
                  <EventPill key={`${String(rowId(event))}-${dayKey(day)}`} event={event} compact occurrenceDate={day} />
                ))}

                {dayEvents.length > 3 ? <small>+{dayEvents.length - 3} more</small> : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WeekCalendar({
  date,
  events,
  onSelectDay,
}: {
  date: Date;
  events: AnyRow[];
  onSelectDay: (date: Date) => void;
}) {
  const days = getWeekDays(date);

  return (
    <section className="ba-week-grid">
      {days.map((day) => {
        const dayEvents = eventsForDate(events, day);

        return (
          <article key={day.toISOString()} className={`ba-week-day ${sameDay(day, new Date()) ? "today" : ""}`}>
            <button type="button" onClick={() => onSelectDay(day)}>
              <strong>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</strong>
              <span>{day.getDate()}</span>
            </button>

            <div className="ba-day-events">
              {dayEvents.map((event: AnyRow) => (
                <EventPill key={`${String(rowId(event))}-${dayKey(day)}`} event={event} occurrenceDate={day} />
              ))}

              {!dayEvents.length ? <p>No events</p> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function DayCalendar({
  date,
  events,
}: {
  date: Date;
  events: AnyRow[];
}) {
  const dayEvents = eventsForDate(events, date).sort((a: AnyRow, b: AnyRow) => eventTime(a) - eventTime(b));

  return (
    <section className="ba-day-view">
      {dayEvents.map((event: AnyRow) => (
        <article key={String(rowId(event))} className="ba-day-event">
          <time>{shortTime(event.startAt || event.startDate || event.date)}</time>

          <div>
            <h3>{eventTitle(event)}</h3>
            <p>
              {eventType(event)} · {eventStatus(event)} · {event.location || "No location"}
            </p>
            {occurrenceLabel(event, date) ? <small className="ba-span-note">{occurrenceLabel(event, date)}</small> : null}
            {event.description ? <span>{event.description}</span> : null}
          </div>
        </article>
      ))}

      {!dayEvents.length ? <EmptyCard text="No event is scheduled for this day." /> : null}
    </section>
  );
}

function YearCalendar({
  date,
  events,
  onSelectMonth,
}: {
  date: Date;
  events: AnyRow[];
  onSelectMonth: (monthIndex: number) => void;
}) {
  const year = date.getFullYear();

  return (
    <section className="ba-year-grid">
      {Array.from({ length: 12 }, (_unused: unknown, monthIndex: number) => {
        const monthEvents = eventsForMonth(events, year, monthIndex);

        return (
          <button key={monthIndex} type="button" className="ba-year-month" onClick={() => onSelectMonth(monthIndex)}>
            <strong>{monthName(monthIndex)}</strong>
            <span>{monthEvents.length} event(s)</span>
            <div className="ba-mini-dots">
              {monthEvents.slice(0, 10).map((event: AnyRow) => (
                <i key={String(rowId(event))} />
              ))}
            </div>
          </button>
        );
      })}
    </section>
  );
}

const css = `

.ba-search-card,.calendar-row,.ba-sheet{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}
.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}
.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}
.ba-add-inline{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}
.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}
.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-calendar-subtitle{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.calendar-list{max-width:1180px;margin-left:auto;margin-right:auto}.calendar-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px}.calendar-date-badge{width:48px;height:48px;display:grid;place-items:center;align-content:center;border-radius:17px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));color:var(--ba-primary);line-height:1}.calendar-date-badge strong{font-size:17px;font-weight:1000}.calendar-date-badge span{font-size:10px;font-weight:950;text-transform:uppercase}.calendar-main{display:block;min-width:0}.calendar-main strong,.calendar-main small,.calendar-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.calendar-main strong{font-size:14px;font-weight:1000;color:var(--text,#111)}.calendar-main small{margin-top:2px;color:var(--muted,#64748b);font-size:12px;font-weight:800}.calendar-main em{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-style:normal;font-weight:750}.calendar-side{display:flex;align-items:center;gap:9px}.calendar-side button{width:32px;height:32px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 10%,transparent);color:var(--text,#111);font-weight:1000;cursor:pointer}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-block;background:var(--muted,#64748b);box-shadow:0 0 0 3px color-mix(in srgb,currentColor 12%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.red{background:#ef4444}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.blue{background:#3b82f6}.status-dot-mini.gray{background:var(--muted,#64748b)}
.ba-table td span{display:block;margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;gap:7px;flex-wrap:nowrap;align-items:center}.ba-table-actions button{min-height:34px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111);padding:0 10px;font-size:11px;font-weight:950;cursor:pointer}.ba-table-actions button:first-child{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}.ba-table th{color:var(--muted,#64748b)!important;background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,var(--surface,#fff)))!important}.ba-table td{color:var(--text,#111)!important}
.ba-sheet-backdrop{position:fixed;inset:0;z-index:90;display:grid;align-items:end;background:rgba(15,23,42,.45);padding:10px}.ba-sheet{width:min(720px,100%);max-height:min(82dvh,760px);overflow:auto;margin:0 auto;border-radius:28px;padding:14px;color:var(--text,#111)}.ba-sheet.small{width:min(520px,100%)}.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ba-sheet-head h2{margin:0;font-size:21px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750;line-height:1.5}.ba-sheet-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111);font-weight:1000;cursor:pointer}.ba-form.compact{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ba-form label{display:grid;gap:6px}.ba-form label span{color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}.ba-sheet-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.ba-sheet-actions button{min-height:42px;border-radius:999px;border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111);font-weight:950;cursor:pointer}.ba-sheet-actions button.primary{border:0;background:var(--ba-primary);color:#fff}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;row-gap:2px;align-items:center;text-align:left;padding:11px;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111);cursor:pointer}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 48%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff))}.ba-menu-list span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list b{font-size:13px;font-weight:1000}.ba-menu-list small{color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-analysis-grid{display:grid;gap:10px;margin-top:10px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:26px;line-height:1;font-weight:1000;letter-spacing:-.06em}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}
@media(min-width:680px){.ba-form.compact{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1040px){.calendar-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:520px){.ba-search-card{grid-template-columns:minmax(0,1fr) auto auto auto;padding:7px;border-radius:22px}.ba-save-inline,.ba-add-inline,.ba-filter-button,.ba-icon-button{width:40px;height:40px}.calendar-row{border-radius:20px;padding:9px}.ba-table-actions{flex-wrap:nowrap}.ba-calendar-head{display:grid}.ba-calendar-head-actions{justify-items:stretch}.ba-calendar-mode-tabs,.ba-calendar-nav{width:100%}.ba-calendar-mode-tabs button,.ba-calendar-nav button{flex:1}}

.ba-page{min-height:100dvh;width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(32px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}
.ba-page *{box-sizing:border-box}
.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%;min-width:0}
.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111));outline:none;font-weight:750}
.ba-page textarea{min-height:120px;padding:12px;resize:vertical;line-height:1.55}
.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(480px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:var(--shell-shadow,0 24px 60px rgba(15,23,42,.08));text-align:center}
.ba-state h2{margin:0;font-size:22px;letter-spacing:-.04em;font-weight:1000}
.ba-state p{margin:0;color:var(--muted,#64748b);line-height:1.6}
.ba-hero{display:flex;align-items:stretch;justify-content:space-between;gap:10px;padding:12px;border-radius:28px;background:radial-gradient(circle at 18% 8%,color-mix(in srgb,var(--ba-primary) 16%,transparent),transparent 20rem),linear-gradient(135deg,var(--card-bg,var(--surface,#fff)),color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,#fff)) 72%);border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 18px 46px rgba(15,23,42,.07);overflow:hidden}
.ba-hero-left{min-width:0;display:flex;align-items:center;gap:10px;flex:1}
.ba-icon,.ba-avatar{display:grid;place-items:center;background:var(--ba-primary);color:#fff;box-shadow:0 12px 26px color-mix(in srgb,var(--ba-primary) 28%,transparent)}
.ba-icon{width:48px;height:48px;flex:0 0 auto;border-radius:18px;font-size:22px}
.ba-avatar{width:56px;height:56px;border-radius:19px;font-size:22px;flex:0 0 auto}
.ba-title{min-width:0}
.ba-title p,.ba-title h2,.ba-title span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba-title p{margin:0 0 2px;color:var(--ba-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.ba-title h2{margin:0;color:var(--text,#111);font-size:clamp(20px,5vw,30px);font-weight:1000;letter-spacing:-.06em;line-height:1}
.ba-title span{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:750}
.ba-actions,.ba-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.ba-btn,.ba-primary,.ba-delete{min-height:42px;border-radius:999px;padding:0 14px;font-weight:950;cursor:pointer}
.ba-btn{border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111)}
.ba-btn:disabled{opacity:.55;cursor:not-allowed}
.ba-primary{border:0;background:var(--ba-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}
.ba-delete{border:1px solid var(--border,rgba(0,0,0,.10));background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111);box-shadow:none}
.ba-delete:hover{background:color-mix(in srgb,var(--muted,#64748b) 13%,var(--surface,#fff));border-color:color-mix(in srgb,var(--muted,#64748b) 28%,var(--border,rgba(0,0,0,.10)))}
.ba-summary-grid,.ba-list,.ba-mini-grid,.ba-breakdown-grid{display:grid;gap:8px}
.ba-summary-grid{margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
.ba-summary,.ba-card,.ba-panel,.ba-toolbar,.ba-filter,.ba-empty,.ba-breakdown,.ba-calendar-panel{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-summary{min-width:0;display:flex;align-items:center;gap:10px;padding:12px;border-radius:22px;overflow:hidden}
.ba-summary.positive{background:linear-gradient(135deg,rgba(34,197,94,.10),var(--card-bg,var(--surface,#fff)))}
.ba-summary.warning{background:linear-gradient(135deg,rgba(245,158,11,.10),var(--card-bg,var(--surface,#fff)))}
.ba-summary>div:first-child{width:36px;height:36px;flex:0 0 auto;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff))}
.ba-summary section{min-width:0}
.ba-summary strong,.ba-summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba-summary strong{font-size:18px;font-weight:1000;letter-spacing:-.05em;color:var(--text,#111)}
.ba-summary span{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:850}
.ba-toolbar,.ba-filter,.ba-panel,.ba-calendar-panel{margin-top:10px;padding:10px;border-radius:24px}
.ba-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ba-tabs{display:flex;flex-wrap:wrap;gap:4px;width:100%;padding:4px;border-radius:22px;background:var(--shell-section-bg,color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff)));border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-tabs button{min-width:0;min-height:38px;border:0;border-radius:999px;padding:0 12px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ba-tabs button.active{background:var(--ba-primary);color:#fff}
.ba-filter{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0;overflow:hidden}
.ba-filter>*{min-width:0}
.ba-filter-rich{grid-template-columns:repeat(auto-fit,minmax(138px,1fr));align-items:center}
.ba-filter-rich input{grid-column:1/-1}
.ba-section{margin-top:16px}
.ba-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.ba-head p{margin:0;color:var(--ba-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.ba-head h3{margin:2px 0 0;color:var(--text,#111);font-size:19px;font-weight:1000;letter-spacing:-.04em}
.ba-list{margin-top:10px}
.ba-card,.ba-breakdown,.ba-empty{min-width:0;border-radius:24px;padding:13px;overflow:hidden}
.ba-card-top{display:flex;align-items:flex-start;gap:10px}
.ba-card-main{min-width:0;flex:1}
.ba-card-main h3{margin:0;color:var(--text,#111);font-size:18px;font-weight:1000;letter-spacing:-.04em}
.ba-card-main p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750;line-height:1.4;overflow-wrap:anywhere;word-break:break-word}
.ba-chip-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}
.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}
.ba-chip.green{background:rgba(34,197,94,.14);color:#16a34a}
.ba-chip.red{background:rgba(239,68,68,.14);color:#ef4444}
.ba-chip.blue{background:rgba(59,130,246,.15);color:#2563eb}
.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}
.ba-chip.orange{background:rgba(245,158,11,.16);color:#d97706}
.ba-chip.purple{background:rgba(147,51,234,.15);color:#9333ea}
.ba-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px}
.ba-mini{min-width:0;padding:9px;border-radius:17px;background:color-mix(in srgb,var(--muted,#64748b) 9%,transparent);border:1px solid var(--border,rgba(0,0,0,.08));overflow:hidden}
.ba-mini strong,.ba-mini span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba-mini strong{color:var(--text,#111);font-size:13px;font-weight:1000}
.ba-mini span{margin-top:2px;color:var(--muted,#64748b);font-size:10px;font-weight:850}
.ba-table-wrap{width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}
.ba-table th,.ba-table td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));text-align:left;vertical-align:top;color:var(--text,#111);font-size:13px;min-width:0}
.ba-table td:nth-child(1),.ba-table td:nth-child(6){max-width:240px;overflow-wrap:anywhere;word-break:break-word}
.ba-table th{color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em;background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,#fff))}
.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:190px;text-align:center;border-style:dashed}
.ba-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}
.ba-empty h3{margin:0;color:var(--text,#111);font-size:18px;font-weight:1000}
.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}
.ba-message{margin:10px 0;padding:12px;border-radius:18px;background:rgba(245,158,11,.14);color:#92400e;font-size:13px;font-weight:900}
.ba-breakdown strong{color:var(--text,#111);font-size:16px;font-weight:1000}
.ba-bar{height:8px;margin-top:12px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);overflow:hidden}
.ba-bar div{height:100%;background:var(--ba-primary);border-radius:inherit}
.ba-calendar-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;min-width:0;overflow:hidden}
.ba-calendar-head>div{min-width:0}
.ba-calendar-head p{margin:0;color:var(--ba-primary);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
.ba-calendar-head h3{margin:2px 0 0;font-size:clamp(18px,5vw,26px);font-weight:1000;letter-spacing:-.04em}
.ba-calendar-head-actions{display:grid;gap:8px;justify-items:end;min-width:0}
.ba-calendar-mode-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.08));min-width:0;max-width:100%}
.ba-calendar-mode-tabs button{border:0;border-radius:999px;min-height:34px;padding:0 12px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer}
.ba-calendar-mode-tabs button.active{background:var(--ba-primary);color:#fff}
.ba-calendar-nav{display:flex;gap:6px;min-width:0;max-width:100%;flex-wrap:wrap}
.ba-calendar-nav button{min-height:38px;border:1px solid var(--border,rgba(0,0,0,.1));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111);font-weight:950;padding:0 12px;cursor:pointer}
.ba-week-labels{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin-bottom:5px}
.ba-week-labels strong{padding:8px;text-align:center;color:var(--muted,#64748b);font-size:11px;text-transform:uppercase}
.ba-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.ba-month-day{min-height:116px;text-align:left;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:16px;background:var(--surface,#fff);padding:8px;cursor:pointer;overflow:hidden}
.ba-month-day:hover{border-color:color-mix(in srgb,var(--ba-primary) 45%,var(--border,rgba(0,0,0,.1)))}
.ba-month-day>span{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:999px;font-weight:1000;font-size:12px;color:var(--text,#111)}
.ba-month-day.today>span{background:var(--ba-primary);color:#fff}
.ba-month-day.muted{opacity:.48}
.ba-month-day small{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:10px;font-weight:950}
.ba-event-pill{display:grid;gap:1px;margin-top:5px;padding:6px 7px;border-radius:12px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));border:1px solid color-mix(in srgb,var(--ba-primary) 14%,transparent);overflow:hidden}
.ba-event-pill strong{font-size:11px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ba-event-pill span{font-size:10px;color:var(--muted,#64748b);font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ba-event-pill.compact{padding:4px 6px}
.ba-event-pill.compact strong{font-size:10px}
.ba-event-pill.multi{position:relative;background:linear-gradient(135deg,color-mix(in srgb,var(--ba-primary) 18%,var(--surface,#fff)),color-mix(in srgb,var(--ba-primary) 8%,var(--surface,#fff)));border-color:color-mix(in srgb,var(--ba-primary) 32%,transparent)}
.ba-event-pill.multi.start{border-top-right-radius:8px;border-bottom-right-radius:8px}
.ba-event-pill.multi.middle{border-radius:8px;border-left:4px solid var(--ba-primary)}
.ba-event-pill.multi.end{border-top-left-radius:8px;border-bottom-left-radius:8px}
.ba-event-pill small{font-size:9px;color:var(--ba-primary);font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ba-span-note{display:inline-flex!important;width:max-content;max-width:100%;margin-top:8px;padding:4px 8px;border-radius:999px;background:color-mix(in srgb,var(--ba-primary) 12%,transparent);color:var(--ba-primary)!important;font-size:11px!important;font-weight:1000!important}
.ba-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.ba-week-day{min-height:240px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:18px;background:var(--surface,#fff);padding:8px;overflow:hidden}
.ba-week-day.today{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--ba-primary) 60%,transparent)}
.ba-week-day>button{width:100%;border:0;background:transparent;display:flex;align-items:center;justify-content:space-between;padding:4px;cursor:pointer}
.ba-week-day>button strong{font-size:12px;text-transform:uppercase;color:var(--muted,#64748b)}
.ba-week-day>button span{display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);font-weight:1000}
.ba-day-events{display:grid;gap:6px;margin-top:6px}
.ba-day-events p{margin:8px 0;color:var(--muted,#64748b);font-size:12px;text-align:center}
.ba-day-view{display:grid;gap:8px}
.ba-day-event{display:grid;grid-template-columns:88px 1fr;gap:10px;padding:12px;border-radius:18px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-day-event time{font-weight:1000;color:var(--ba-primary)}
.ba-day-event h3{margin:0;font-size:16px;font-weight:1000}
.ba-day-event p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:850}
.ba-day-event span{display:block;margin-top:8px;font-size:12px;line-height:1.45;color:var(--text,#111)}
.ba-year-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.ba-year-month{min-height:112px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:18px;background:var(--surface,#fff);text-align:left;padding:12px;cursor:pointer}
.ba-year-month strong{display:block;font-size:16px;font-weight:1000}
.ba-year-month span{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:12px;font-weight:850}
.ba-mini-dots{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}
.ba-mini-dots i{width:7px;height:7px;border-radius:999px;background:var(--ba-primary)}
.ba-drawer-layer{position:fixed;inset:0;z-index:80}
.ba-drawer-overlay{position:absolute;inset:0;border:0;background:rgba(15,23,42,.52)}
.ba-drawer{position:absolute;right:0;top:0;bottom:0;width:min(94vw,720px);max-width:100vw;overflow-y:auto;overflow-x:hidden;background:var(--bg,#f7f8fb);color:var(--text,#111);padding:14px;box-shadow:var(--shell-shadow,-24px 0 70px rgba(15,23,42,.22))}
.ba-drawer-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:6px 0 12px;background:var(--bg,#f7f8fb)}
.ba-drawer-head p{margin:0;color:var(--ba-primary);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.ba-drawer-head h2{margin:2px 0 0;color:var(--text,#111);font-size:22px;font-weight:1000;letter-spacing:-.05em}
.ba-drawer-head span{margin-top:3px;display:block;color:var(--muted,#64748b);font-size:12px;font-weight:750}
.ba-drawer-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111);font-weight:1000;cursor:pointer}
.ba-form-card{margin-top:10px;padding:12px;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10))}
.ba-form-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}
.ba-form-grid label{min-width:0;display:grid;gap:6px}
.ba-form-grid label span{color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
.ba-form-grid .wide{grid-column:1/-1}
.ba-drawer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
@media(min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1))}.ba-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-filter{grid-template-columns:minmax(0,1fr) 190px 150px}.ba-filter-rich{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));align-items:center}.ba-filter-rich input{grid-column:span 2}.ba-mini-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-year-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1))}.ba-summary-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.ba-filter-rich{grid-template-columns:repeat(auto-fit,minmax(132px,1fr))}.ba-filter-rich input{grid-column:span 2}.ba-list,.ba-breakdown-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.ba-month-calendar,.ba-week-grid{overflow-x:auto}.ba-week-labels,.ba-month-grid{min-width:760px}.ba-week-grid{grid-template-columns:repeat(7,160px)}.ba-calendar-head{display:grid}.ba-calendar-head-actions{justify-items:stretch}.ba-calendar-nav,.ba-calendar-mode-tabs{width:100%}.ba-calendar-nav button,.ba-calendar-mode-tabs button{flex:1}.ba-day-event{grid-template-columns:1fr}.ba-year-grid{grid-template-columns:1fr}}

.ba-location-safe{min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
.ba-card,.ba-mini,.ba-breakdown,.ba-calendar-panel,.ba-table-wrap{min-width:0;max-width:100%}
.ba-row-actions{min-width:0}
.ba-row-actions .ba-btn,.ba-row-actions .ba-delete{white-space:nowrap}
@media(max-width:760px){.ba-filter-rich{grid-template-columns:1fr}.ba-filter-rich input{grid-column:1/-1}.ba-filter-rich .ba-btn,.ba-filter-rich .ba-primary{width:100%}.ba-calendar-head h3{white-space:normal;overflow-wrap:anywhere}.ba-table td:nth-child(1),.ba-table td:nth-child(6){max-width:180px}}

@media(max-width:520px){.ba-page{padding:calc(6px * var(--local-density-scale,1))}.ba-hero{flex-direction:column;border-radius:22px;padding:10px}.ba-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ba-btn,.ba-primary{width:100%}.ba-summary-grid{gap:6px}.ba-summary{padding:10px;border-radius:19px}.ba-toolbar{align-items:stretch;flex-direction:column;border-radius:20px}.ba-tabs{width:100%}.ba-tabs button{flex:1;justify-content:center}.ba-card,.ba-empty,.ba-breakdown{border-radius:20px;padding:11px}.ba-avatar{width:52px;height:52px;flex-basis:52px}.ba-mini-grid{grid-template-columns:repeat(1,minmax(0,1fr))}.ba-drawer-actions{grid-template-columns:minmax(0,1fr)}.ba-drawer{width:min(96vw,720px);padding:12px}}
`;
