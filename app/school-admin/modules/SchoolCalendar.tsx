"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { db } from "../../lib/db/db";
import { listCalendarEvents } from "../../lib/calendar";

type AnyRow = Record<string, any>;

type ViewMode = "calendar" | "cards" | "table" | "analytics";
type CalendarMode = "month" | "week" | "day" | "year";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

const now = () => Date.now();

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row: AnyRow) {
  return row?.id ?? row?.localId ?? row?.cloudId;
}

function cleanId(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  return row && row.isDeleted !== true && (!row.accountId || !accountId || row.accountId === accountId);
}

function schoolIdOf(row: AnyRow) {
  return cleanId(row?.schoolId ?? row?.schoolLocalId ?? row?.payload?.schoolId);
}

function branchIdOf(row: AnyRow) {
  return cleanId(row?.branchId ?? row?.branchLocalId ?? row?.payload?.branchId);
}

function isSchoolBranch(row: AnyRow, accountId?: string | null, schoolId?: number | null) {
  return sameAccount(row, accountId) && schoolIdOf(row) === Number(schoolId || 0);
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

function branchName(branches: AnyRow[], branchId: any) {
  const branch = branches.find((item: AnyRow) => Number(item.id || item.localId) === Number(branchId));
  return branch?.name || branch?.branchName || "School-level";
}

function eventsForDate(events: AnyRow[], date: Date) {
  return events.filter((event: AnyRow) => {
    const time = eventTime(event);
    return time && sameDay(new Date(time), date);
  });
}

function eventsForMonth(events: AnyRow[], year: number, month: number) {
  return events.filter((event: AnyRow) => {
    const time = eventTime(event);
    if (!time) return false;
    const date = new Date(time);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

function monthName(index: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(2026, index, 1));
}

function uniqueRows(rows: AnyRow[]) {
  const seen = new Set<string>();

  return rows.filter((row: AnyRow, index: number) => {
    const key = String(rowId(row) || index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`sc-chip ${tone}`}>{children}</span>;
}

function SummaryCard({
  label,
  value,
  icon,
  warning,
  positive,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  warning?: boolean;
  positive?: boolean;
}) {
  return (
    <article className={`sc-summary ${warning ? "warning" : ""} ${positive ? "positive" : ""}`}>
      <div>{icon}</div>
      <section>
        <strong>{value}</strong>
        <span>{label}</span>
      </section>
    </article>
  );
}

function EmptyCard({ text: title }: { text: string }) {
  return (
    <section className="sc-empty">
      <div>📌</div>
      <h3>No records</h3>
      <p>{title}</p>
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
    <section className="sc-toolbar">
      <div className="sc-tabs">
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
    <div className="sc-calendar-mode-tabs">
      {modes.map((item) => (
        <button
          type="button"
          key={item.key}
          className={mode === item.key ? "active" : ""}
          onClick={() => setMode(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function SchoolCalendar() {
  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = Number(activeSchoolId || activeSchool?.id || settings?.schoolId || 0);
  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<AnyRow[]>([]);
  const [events, setEvents] = useState<AnyRow[]>([]);
  const [view, setView] = useState<ViewMode>("calendar");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [query, setQuery] = useState("");
  const [branchId, setBranchId] = useState("all");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [notice, setNotice] = useState("");

  

  useEffect(() => {
    if (!accountLoading && !contextLoading && (!authenticated || !accountId)) {
      router.replace("/login");
    }
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  async function load() {
    if (!accountId || !schoolId) {
      setLoading(false);
      setNotice("No active school was found for this school admin calendar.");
      return;
    }

    setLoading(true);
    setNotice("");

    try {
      const branchRows = (await safeArray<AnyRow>("branches")).filter((row: AnyRow) =>
        isSchoolBranch(row, accountId, schoolId)
      );

      setBranches(branchRows);

      const branchIds = new Set<number>(
        branchRows
          .map((branch: AnyRow) => cleanId(idOf(branch)))
          .filter(Boolean)
      );

      const eventsFromCalendarApi: AnyRow[] = [];

      for (const branch of branchRows) {
        const id = cleanId(idOf(branch));
        if (!id) continue;

        try {
          const rows = (await listCalendarEvents({
            accountId,
            schoolId,
            branchId: id,
          })) as AnyRow[];

          eventsFromCalendarApi.push(...rows);
        } catch {
          // Keep loading from local fallback tables below.
        }
      }

      const localCalendarRows = [
        ...(await safeArray<AnyRow>("calendarEvents")),
        ...(await safeArray<AnyRow>("events")),
        ...(await safeArray<AnyRow>("schoolCalendarEvents")),
        ...(await safeArray<AnyRow>("branchCalendarEvents")),
      ];

      const localSchoolRows = localCalendarRows
        .filter((event: AnyRow) => sameAccount(event, accountId))
        .filter((event: AnyRow) => {
          const eSchoolId = schoolIdOf(event);
          const eBranchId = branchIdOf(event);
          return eSchoolId === schoolId || branchIds.has(eBranchId);
        });

      const allEvents = uniqueRows([...eventsFromCalendarApi, ...localSchoolRows])
        .filter((event: AnyRow) => event?.isDeleted !== true)
        .filter((event: AnyRow) => eventStatus(event) !== "cancelled")
        .map((event: AnyRow) => {
          const bId = branchIdOf(event);
          return {
            ...event,
            branchId: bId || event.branchId,
            schoolId: schoolIdOf(event) || schoolId,
          };
        });

      setEvents(allEvents);

      if (!branchRows.length) {
        setNotice("No branches were found under this school yet.");
      } else if (!allEvents.length) {
        setNotice("Branches were found, but no school calendar events were found yet.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, schoolId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    return events
      .filter((event: AnyRow) => branchId === "all" || Number(event.branchId) === Number(branchId))
      .filter((event: AnyRow) => {
        if (!q) return true;
        return `${eventTitle(event)} ${event.description || ""} ${eventType(event)} ${eventPriority(event)} ${branchName(branches, event.branchId)}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a: AnyRow, b: AnyRow) => eventTime(a) - eventTime(b));
  }, [branches, events, query, branchId]);

  const summary = useMemo(
    () => ({
      events: events.length,
      branches: branches.length,
      upcoming: events.filter((event: AnyRow) => eventTime(event) >= now()).length,
      meetings: events.filter((event: AnyRow) => eventType(event) === "meeting").length,
      exams: events.filter((event: AnyRow) => ["exam", "assessment"].includes(eventType(event))).length,
      urgent: events.filter((event: AnyRow) => ["urgent", "high"].includes(eventPriority(event))).length,
    }),
    [branches.length, events]
  );

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
      <main className="sc-page" style={{ "--sc-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sc-state">
          <h2>Opening school calendar...</h2>
          <p>Loading events from every branch under this school.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="sc-page" style={{ "--sc-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sc-hero">
        <div className="sc-hero-left">
          <div className="sc-icon">📅</div>
          <div className="sc-title">
            <p>School Admin Calendar</p>
            <h2>School Calendar</h2>
            <span>{activeSchool?.name || "School"} · All branch calendars combined in one view</span>
          </div>
        </div>

        <div className="sc-actions">
          <button className="sc-btn" type="button" onClick={() => setFocusDate(new Date())}>
            Today
          </button>
          <button className="sc-btn" type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </section>

      {notice ? <section className="sc-notice">{notice}</section> : null}

      <section className="sc-summary-grid">
        <SummaryCard label="School Events" value={summary.events} icon="📅" />
        <SummaryCard label="Branches Covered" value={summary.branches} icon="🏫" />
        <SummaryCard label="Upcoming" value={summary.upcoming} icon="⏭️" positive />
        <SummaryCard label="Meetings" value={summary.meetings} icon="🤝" />
        <SummaryCard label="Exams" value={summary.exams} icon="📝" />
        <SummaryCard label="Urgent/High" value={summary.urgent} icon="⚠️" warning={summary.urgent > 0} />
      </section>

      <Toolbar view={view} setView={setView} count={filtered.length} />

      <section className="sc-filter">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search school calendar events..." />

        <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="all">All Branches</option>
          {branches.map((branch: AnyRow) => (
            <option key={String(idOf(branch))} value={String(idOf(branch))}>
              {branch.name || branch.branchName || `Branch ${idOf(branch)}`}
            </option>
          ))}
        </select>

        <button className="sc-btn" type="button" onClick={load}>
          Reload
        </button>
      </section>

      {view === "calendar" ? (
        <section className="sc-calendar-panel">
          <div className="sc-calendar-head">
            <div>
              <p>Actual School Calendar</p>
              <h3>{currentTitle}</h3>
            </div>

            <div className="sc-calendar-head-actions">
              <CalendarModeSwitch mode={calendarMode} setMode={setCalendarMode} />

              <div className="sc-calendar-nav">
                <button type="button" onClick={moveBack}>
                  ←
                </button>
                <button type="button" onClick={() => setFocusDate(new Date())}>
                  Today
                </button>
                <button type="button" onClick={moveNext}>
                  →
                </button>
              </div>
            </div>
          </div>

          {calendarMode === "month" ? (
            <MonthCalendar
              date={focusDate}
              events={filtered}
              branches={branches}
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
              branches={branches}
              onSelectDay={(date) => {
                setFocusDate(date);
                setCalendarMode("day");
              }}
            />
          ) : null}

          {calendarMode === "day" ? (
            <DayCalendar date={focusDate} events={filtered} branches={branches} />
          ) : null}

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
        <section className="sc-section sc-breakdown-grid">
          {branches.map((branch: AnyRow) => {
            const id = cleanId(idOf(branch));
            const count = events.filter((event: AnyRow) => Number(event.branchId) === id).length;
            const share = events.length ? Math.round((count / events.length) * 100) : 0;

            return (
              <article className="sc-breakdown" key={String(idOf(branch))}>
                <strong>{branch.name || branch.branchName || `Branch ${id}`}</strong>
                <div className="sc-bar">
                  <div style={{ width: `${share}%` }} />
                </div>
                <div className="sc-chip-row">
                  <Chip tone="blue">{count} event(s)</Chip>
                  <Chip>{share}% of school calendar</Chip>
                </div>
              </article>
            );
          })}

          {!branches.length ? <EmptyCard text="No branches found for this school." /> : null}
        </section>
      ) : null}

      {view === "table" ? (
        <section className="sc-panel">
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((event: AnyRow) => (
                  <tr key={String(rowId(event))}>
                    <td>{branchName(branches, event.branchId)}</td>
                    <td>
                      <strong>{eventTitle(event)}</strong>
                      <br />
                      <span>{event.description || "-"}</span>
                    </td>
                    <td>{eventType(event)}</td>
                    <td>{dateLabel(event.startAt || event.startDate || event.date)}</td>
                    <td>{dateLabel(event.endAt || event.endDate)}</td>
                    <td>
                      <Chip tone={statusTone(eventStatus(event))}>{eventStatus(event)}</Chip>
                    </td>
                  </tr>
                ))}

                {!filtered.length ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyCard text="No school calendar events found." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "cards" ? (
        <section className="sc-section">
          <div className="sc-list">
            {filtered.map((event: AnyRow) => (
              <article key={String(rowId(event))} className="sc-card">
                <div className="sc-card-top">
                  <div className="sc-avatar">📅</div>
                  <div className="sc-card-main">
                    <h3>{eventTitle(event)}</h3>
                    <p>
                      {branchName(branches, event.branchId)} · {dateLabel(event.startAt || event.startDate || event.date)}
                    </p>
                    <div className="sc-chip-row">
                      <Chip tone="blue">{eventType(event)}</Chip>
                      <Chip tone={priorityTone(eventPriority(event))}>{eventPriority(event)}</Chip>
                      <Chip tone={statusTone(eventStatus(event))}>{eventStatus(event)}</Chip>
                    </div>
                  </div>
                </div>

                {event.description ? <p className="sc-message">{event.description}</p> : null}
              </article>
            ))}

            {!filtered.length ? <EmptyCard text="No school calendar events found." /> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function EventPill({
  event,
  branches,
  compact = false,
}: {
  event: AnyRow;
  branches: AnyRow[];
  compact?: boolean;
}) {
  return (
    <article className={`sc-event-pill ${compact ? "compact" : ""}`}>
      <strong>{compact ? eventTitle(event) : `${shortTime(event.startAt || event.startDate || event.date)} · ${eventTitle(event)}`}</strong>
      {!compact ? <span>{branchName(branches, event.branchId)}</span> : null}
    </article>
  );
}

function MonthCalendar({
  date,
  events,
  branches,
  onSelectDay,
}: {
  date: Date;
  events: AnyRow[];
  branches: AnyRow[];
  onSelectDay: (date: Date) => void;
}) {
  const days = getMonthGridDays(date);
  const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <section className="sc-month-calendar">
      <div className="sc-week-labels">
        {weekLabels.map((label) => (
          <strong key={label}>{label}</strong>
        ))}
      </div>

      <div className="sc-month-grid">
        {days.map((day) => {
          const dayEvents = eventsForDate(events, day);
          const isCurrentMonth = day.getMonth() === date.getMonth();

          return (
            <button
              type="button"
              key={day.toISOString()}
              className={`sc-month-day ${isCurrentMonth ? "" : "muted"} ${sameDay(day, new Date()) ? "today" : ""}`}
              onClick={() => onSelectDay(day)}
            >
              <span>{day.getDate()}</span>

              <div>
                {dayEvents.slice(0, 3).map((event: AnyRow) => (
                  <EventPill key={String(rowId(event))} event={event} branches={branches} compact />
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
  branches,
  onSelectDay,
}: {
  date: Date;
  events: AnyRow[];
  branches: AnyRow[];
  onSelectDay: (date: Date) => void;
}) {
  const days = getWeekDays(date);

  return (
    <section className="sc-week-grid">
      {days.map((day) => {
        const dayEvents = eventsForDate(events, day);

        return (
          <article key={day.toISOString()} className={`sc-week-day ${sameDay(day, new Date()) ? "today" : ""}`}>
            <button type="button" onClick={() => onSelectDay(day)}>
              <strong>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</strong>
              <span>{day.getDate()}</span>
            </button>

            <div className="sc-day-events">
              {dayEvents.map((event: AnyRow) => (
                <EventPill key={String(rowId(event))} event={event} branches={branches} />
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
  branches,
}: {
  date: Date;
  events: AnyRow[];
  branches: AnyRow[];
}) {
  const dayEvents = eventsForDate(events, date).sort((a: AnyRow, b: AnyRow) => eventTime(a) - eventTime(b));

  return (
    <section className="sc-day-view">
      {dayEvents.map((event: AnyRow) => (
        <article key={String(rowId(event))} className="sc-day-event">
          <time>{shortTime(event.startAt || event.startDate || event.date)}</time>

          <div>
            <h3>{eventTitle(event)}</h3>
            <p>
              {branchName(branches, event.branchId)} · {eventType(event)} · {eventStatus(event)}
            </p>
            {event.description ? <span>{event.description}</span> : null}
          </div>
        </article>
      ))}

      {!dayEvents.length ? <EmptyCard text="No school event is scheduled for this day." /> : null}
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
    <section className="sc-year-grid">
      {Array.from({ length: 12 }, (_unused: unknown, monthIndex: number) => {
        const monthEvents = eventsForMonth(events, year, monthIndex);

        return (
          <button key={monthIndex} type="button" className="sc-year-month" onClick={() => onSelectMonth(monthIndex)}>
            <strong>{monthName(monthIndex)}</strong>
            <span>{monthEvents.length} event(s)</span>
            <div className="sc-mini-dots">
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
.sc-page{min-height:100dvh;padding:10px;padding-bottom:32px;background:radial-gradient(circle at top left,color-mix(in srgb,var(--sc-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111);font-family:var(--font-family,system-ui);font-size:var(--font-size,14px);overflow-x:hidden}
.sc-page *{box-sizing:border-box}
.sc-page button,.sc-page input,.sc-page select,.sc-page textarea{font:inherit;max-width:100%}
.sc-page input,.sc-page select,.sc-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.1)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--text,#111);font-weight:750}
.sc-state,.sc-card,.sc-panel,.sc-summary,.sc-toolbar,.sc-filter,.sc-empty,.sc-breakdown,.sc-calendar-panel,.sc-notice{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.sc-state{min-height:360px;display:grid;place-items:center;align-content:center;gap:10px;border-radius:28px;text-align:center;padding:22px}
.sc-state h2{margin:0;font-weight:1000}
.sc-state p,.sc-card p,.sc-title span,.sc-mini span{color:var(--muted,#64748b)}
.sc-hero{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:28px;background:linear-gradient(135deg,var(--card-bg,var(--surface,#fff)),color-mix(in srgb,var(--sc-primary) 7%,var(--card-bg,#fff)));border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 18px 46px rgba(15,23,42,.07)}
.sc-hero-left{min-width:0;display:flex;align-items:center;gap:10px}
.sc-icon,.sc-avatar{display:grid;place-items:center;background:var(--sc-primary);color:#fff;box-shadow:0 12px 26px color-mix(in srgb,var(--sc-primary) 28%,transparent)}
.sc-icon{width:48px;height:48px;border-radius:18px;font-size:22px}
.sc-avatar{width:56px;height:56px;border-radius:19px;font-size:22px;flex:0 0 auto}
.sc-title{min-width:0}
.sc-title p{margin:0;color:var(--sc-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.sc-title h2{margin:0;font-size:clamp(20px,5vw,30px);font-weight:1000;letter-spacing:-.06em}
.sc-title span{display:block;font-size:12px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-actions{display:flex;gap:8px}
.sc-btn,.sc-primary{min-height:42px;border-radius:999px;padding:0 14px;font-weight:950;cursor:pointer}
.sc-btn{border:1px solid var(--border,rgba(0,0,0,.1));background:var(--surface,#fff);color:var(--text,#111)}
.sc-primary{border:0;background:var(--sc-primary);color:#fff}
.sc-notice{margin-top:10px;border-radius:20px;padding:11px 13px;background:#fff7ed;color:#9a3412;border-color:#fed7aa;font-size:12px;font-weight:900;line-height:1.45}
.sc-summary-grid,.sc-list,.sc-breakdown-grid{display:grid;gap:8px}
.sc-summary-grid{margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
.sc-summary{display:flex;gap:10px;align-items:center;padding:12px;border-radius:22px;min-width:0}
.sc-summary.warning{background:linear-gradient(135deg,rgba(245,158,11,.12),var(--card-bg,#fff))}
.sc-summary.positive{background:linear-gradient(135deg,rgba(34,197,94,.12),var(--card-bg,#fff))}
.sc-summary>div:first-child{width:36px;height:36px;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--sc-primary) 12%,var(--surface,#fff))}
.sc-summary strong,.sc-summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-summary strong{font-size:18px;font-weight:1000}
.sc-summary span{font-size:11px;font-weight:850;color:var(--muted,#64748b)}
.sc-toolbar,.sc-filter,.sc-panel,.sc-calendar-panel{margin-top:10px;padding:10px;border-radius:24px}
.sc-toolbar{display:flex;justify-content:space-between;gap:8px;align-items:center}
.sc-tabs{display:flex;flex-wrap:wrap;gap:4px;width:100%;padding:4px;border-radius:22px;background:color-mix(in srgb,var(--sc-primary) 7%,var(--surface,#fff))}
.sc-tabs button{border:0;border-radius:999px;min-height:38px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;text-transform:capitalize;padding:0 12px;display:inline-flex;align-items:center;gap:6px}
.sc-tabs button.active{background:var(--sc-primary);color:#fff;box-shadow:0 10px 22px color-mix(in srgb,var(--sc-primary) 22%,transparent)}
.sc-filter{display:grid;grid-template-columns:1fr;gap:8px}
.sc-section{margin-top:16px}
.sc-card,.sc-breakdown,.sc-empty{border-radius:24px;padding:13px;overflow:hidden}
.sc-card-top{display:flex;gap:10px}
.sc-card-main{min-width:0;flex:1}
.sc-card h3{margin:0;font-size:18px;font-weight:1000}
.sc-chip-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.sc-chip{display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;text-transform:capitalize}
.sc-chip.green{background:rgba(34,197,94,.14);color:#16a34a}
.sc-chip.red{background:rgba(239,68,68,.14);color:#ef4444}
.sc-chip.blue{background:rgba(59,130,246,.15);color:#2563eb}
.sc-chip.orange{background:rgba(245,158,11,.16);color:#d97706}
.sc-chip.purple{background:rgba(147,51,234,.15);color:#9333ea}
.sc-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}
.sc-table-wrap{overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}
.sc-table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,#fff)}
.sc-table th,.sc-table td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));text-align:left;vertical-align:top}
.sc-table th{font-size:11px;color:var(--muted,#64748b);text-transform:uppercase}
.sc-empty{display:grid;place-items:center;align-content:center;min-height:190px;text-align:center;border-style:dashed}
.sc-empty div{font-size:28px}
.sc-empty h3{margin:8px 0 0}
.sc-empty p{margin:5px 0 0;color:var(--muted,#64748b)}
.sc-message{margin:10px 0 0;padding:12px;border-radius:18px;background:rgba(245,158,11,.14);color:#92400e;font-weight:850}
.sc-bar{height:8px;margin-top:12px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);overflow:hidden}
.sc-bar div{height:100%;background:var(--sc-primary)}
.sc-calendar-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
.sc-calendar-head p{margin:0;color:var(--sc-primary);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
.sc-calendar-head h3{margin:2px 0 0;font-size:clamp(18px,5vw,26px);font-weight:1000;letter-spacing:-.04em}
.sc-calendar-head-actions{display:grid;gap:8px;justify-items:end}
.sc-calendar-mode-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--sc-primary) 7%,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.08))}
.sc-calendar-mode-tabs button{border:0;border-radius:999px;min-height:34px;padding:0 12px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer}
.sc-calendar-mode-tabs button.active{background:var(--sc-primary);color:#fff}
.sc-calendar-nav{display:flex;gap:6px}
.sc-calendar-nav button{min-height:38px;border:1px solid var(--border,rgba(0,0,0,.1));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111);font-weight:950;padding:0 12px;cursor:pointer}
.sc-week-labels{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin-bottom:5px}
.sc-week-labels strong{padding:8px;text-align:center;color:var(--muted,#64748b);font-size:11px;text-transform:uppercase}
.sc-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.sc-month-day{min-height:116px;text-align:left;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:16px;background:var(--surface,#fff);padding:8px;cursor:pointer;overflow:hidden}
.sc-month-day:hover{border-color:color-mix(in srgb,var(--sc-primary) 45%,var(--border,rgba(0,0,0,.1)))}
.sc-month-day>span{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:999px;font-weight:1000;font-size:12px;color:var(--text,#111)}
.sc-month-day.today>span{background:var(--sc-primary);color:#fff}
.sc-month-day.muted{opacity:.48}
.sc-month-day small{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:10px;font-weight:950}
.sc-event-pill{display:grid;gap:1px;margin-top:5px;padding:6px 7px;border-radius:12px;background:color-mix(in srgb,var(--sc-primary) 12%,var(--surface,#fff));border:1px solid color-mix(in srgb,var(--sc-primary) 14%,transparent);overflow:hidden}
.sc-event-pill strong{font-size:11px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-event-pill span{font-size:10px;color:var(--muted,#64748b);font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-event-pill.compact{padding:4px 6px}
.sc-event-pill.compact strong{font-size:10px}
.sc-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.sc-week-day{min-height:240px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:18px;background:var(--surface,#fff);padding:8px;overflow:hidden}
.sc-week-day.today{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--sc-primary) 60%,transparent)}
.sc-week-day>button{width:100%;border:0;background:transparent;display:flex;align-items:center;justify-content:space-between;padding:4px;cursor:pointer}
.sc-week-day>button strong{font-size:12px;text-transform:uppercase;color:var(--muted,#64748b)}
.sc-week-day>button span{display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:color-mix(in srgb,var(--sc-primary) 10%,transparent);font-weight:1000}
.sc-day-events{display:grid;gap:6px;margin-top:6px}
.sc-day-events p{margin:8px 0;color:var(--muted,#64748b);font-size:12px;text-align:center}
.sc-day-view{display:grid;gap:8px}
.sc-day-event{display:grid;grid-template-columns:88px 1fr;gap:10px;padding:12px;border-radius:18px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08))}
.sc-day-event time{font-weight:1000;color:var(--sc-primary)}
.sc-day-event h3{margin:0;font-size:16px;font-weight:1000}
.sc-day-event p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:850}
.sc-day-event span{display:block;margin-top:8px;font-size:12px;line-height:1.45;color:var(--text,#111)}
.sc-year-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sc-year-month{min-height:112px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:18px;background:var(--surface,#fff);text-align:left;padding:12px;cursor:pointer}
.sc-year-month strong{display:block;font-size:16px;font-weight:1000}
.sc-year-month span{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:12px;font-weight:850}
.sc-mini-dots{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}
.sc-mini-dots i{width:7px;height:7px;border-radius:999px;background:var(--sc-primary)}
@media(min-width:680px){.sc-summary-grid{grid-template-columns:repeat(3,1fr)}.sc-filter{grid-template-columns:1fr 190px 150px}.sc-year-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(min-width:1040px){.sc-page{padding:16px}.sc-summary-grid{grid-template-columns:repeat(6,1fr)}.sc-list,.sc-breakdown-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:760px){.sc-month-calendar,.sc-week-grid{overflow-x:auto}.sc-week-labels,.sc-month-grid{min-width:760px}.sc-week-grid{grid-template-columns:repeat(7,160px)}.sc-calendar-head{display:grid}.sc-calendar-head-actions{justify-items:stretch}.sc-calendar-nav,.sc-calendar-mode-tabs{width:100%}.sc-calendar-nav button,.sc-calendar-mode-tabs button{flex:1}.sc-day-event{grid-template-columns:1fr}.sc-year-grid{grid-template-columns:1fr}}
@media(max-width:520px){.sc-page{padding:6px}.sc-hero{flex-direction:column;align-items:stretch;border-radius:22px}.sc-actions{display:grid}.sc-btn,.sc-primary{width:100%}.sc-toolbar{flex-direction:column;align-items:stretch}.sc-tabs{width:100%}.sc-tabs button{flex:1;justify-content:center}}
`;
