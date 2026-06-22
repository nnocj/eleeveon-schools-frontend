"use client";

/**
 * app/school-admin/modules/Calendar.tsx
 * ---------------------------------------------------------
 * SCHOOL ADMIN — CALENDAR
 * ---------------------------------------------------------
 *
 * School-scoped calendar management.
 *
 * Fixes:
 * - Rewritten from compressed one-line style into readable sections.
 * - Fixes TS7006 by typing callback parameters such as branch rows.
 * - Keeps school-wide calendar behavior.
 * - Keeps cards, table and analytics views.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import { db } from "../../lib/db";
import { createCalendarEvent, listCalendarEvents } from "../../lib/calendar";

// ======================================================
// TYPES
// ======================================================

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type EventFilter = "all" | "school_event" | "meeting" | "holiday" | "deadline";

type SchoolCalendarForm = {
  title: string;
  description: string;
  eventType: EventFilter extends "all" ? never : string;
  startAt: string;
  endAt: string;
  location: string;
  priority: "low" | "normal" | "high" | "urgent";
  branchId: string;
};

type ChipTone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

// ======================================================
// CONSTANTS
// ======================================================

const DEFAULT_FORM: SchoolCalendarForm = {
  title: "",
  description: "",
  eventType: "school_event",
  startAt: "",
  endAt: "",
  location: "",
  priority: "normal",
  branchId: "",
};

const SCHOOL_EVENT_TYPES: EventFilter[] = [
  "school_event",
  "meeting",
  "holiday",
  "deadline",
];

// ======================================================
// HELPERS
// ======================================================

const now = () => Date.now();

function toNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function cleanText(value: unknown, fallback = "") {
  return String(value || "").trim() || fallback;
}

function dateLabel(value?: number | string) {
  const timestamp =
    typeof value === "number" ? value : value ? new Date(value).getTime() : 0;

  if (!timestamp || !Number.isFinite(timestamp)) return "Not set";

  try {
    return new Intl.DateTimeFormat(undefined, {
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

function formatEventType(value?: string) {
  return cleanText(value, "school_event").replaceAll("_", " ");
}

async function safeArray(tableName: string): Promise<AnyRow[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function isSchoolRow(
  row: AnyRow,
  accountId?: string | null,
  schoolId?: number | null,
) {
  return (
    row &&
    !row.isDeleted &&
    (!row.accountId || row.accountId === accountId) &&
    Number(row.schoolId) === Number(schoolId)
  );
}

function userIdOf(row?: AnyRow) {
  return row?.id || row?.localId;
}

function membershipUserId(row?: AnyRow) {
  return String(row?.userLocalId || row?.userId || row?.accountUserId || "");
}

async function resolveSchoolAdminContext(
  accountId?: string | null,
  schoolId?: number | null,
) {
  const [memberships, users] = await Promise.all([
    safeArray("userMemberships").then(async (rows: AnyRow[]) =>
      rows.length ? rows : safeArray("memberships"),
    ),
    safeArray("users").then(async (rows: AnyRow[]) =>
      rows.length ? rows : safeArray("accountUsers"),
    ),
  ]);

  const activeEmail =
    typeof window !== "undefined"
      ? String(
          localStorage.getItem("email") ||
            localStorage.getItem("userEmail") ||
            "",
        ).toLowerCase()
      : "";

  const membership = memberships.find((row: AnyRow) => {
    const role = String(row.role);
    return (
      ["admin", "school_admin"].includes(role) &&
      isSchoolRow(row, accountId, Number(schoolId))
    );
  });

  const user = users.find((row: AnyRow) => {
    const sameUser = String(userIdOf(row) || "") === membershipUserId(membership);
    const sameEmail =
      activeEmail && String(row.email || "").toLowerCase() === activeEmail;

    return sameUser || Boolean(sameEmail);
  });

  return {
    schoolAdmin: {
      ...(membership || {}),
      ...(user || {}),
      role: membership?.role || "admin",
    },
    user,
    membership,
  };
}

// ======================================================
// COMPONENT
// ======================================================

export default function Calendar() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const {
    settings,
    loading: settingsLoading,
  } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [events, setEvents] = useState<AnyRow[]>([]);
  const [branches, setBranches] = useState<AnyRow[]>([]);

  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<EventFilter>("all");

  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState<SchoolCalendarForm>(DEFAULT_FORM);

  // ======================================================
  // AUTH
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    router,
  ]);

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    if (!accountId || !schoolId) {
      setEvents([]);
      setBranches([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      await resolveSchoolAdminContext(accountId, Number(schoolId));

      const branchRows = await safeArray("branches");

      const scopedBranches = branchRows.filter((row: AnyRow) =>
        isSchoolRow(row, accountId, Number(schoolId)),
      );

      const calendarRows = await listCalendarEvents({
        accountId,
        schoolId: Number(schoolId),
      });

      const schoolEvents = (calendarRows as AnyRow[]).filter((event: AnyRow) => {
        const isVisibleToSchool =
          event.scopeType === "school" ||
          event.visibility === "school" ||
          SCHOOL_EVENT_TYPES.includes(event.eventType);

        return (
          !event.isDeleted &&
          event.status !== "cancelled" &&
          isVisibleToSchool
        );
      });

      setBranches(scopedBranches);
      setEvents(schoolEvents);
    } catch (error) {
      console.error("Failed to load school calendar:", error);
      alert("Failed to load school calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, schoolId]);

  // ======================================================
  // DERIVED
  // ======================================================

  const filtered = useMemo(() => {
    const searchText = query.trim().toLowerCase();

    return events
      .filter((event: AnyRow) => {
        const matchesType = type === "all" || event.eventType === type;

        const matchesSearch =
          !searchText ||
          `
            ${event.title}
            ${event.description}
            ${event.location}
          `
            .toLowerCase()
            .includes(searchText);

        return matchesType && matchesSearch;
      })
      .sort((a: AnyRow, b: AnyRow) => toNumber(a.startAt) - toNumber(b.startAt));
  }, [events, query, type]);

  const summary = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return {
      total: events.length,
      upcoming: events.filter((event: AnyRow) => toNumber(event.startAt) >= now())
        .length,
      today: events.filter((event: AnyRow) => {
        const startAt = toNumber(event.startAt);
        return startAt >= todayStart.getTime() && startAt <= todayEnd.getTime();
      }).length,
      branches: branches.length,
      holidays: events.filter((event: AnyRow) => event.eventType === "holiday")
        .length,
      urgent: events.filter((event: AnyRow) =>
        ["urgent", "high"].includes(event.priority),
      ).length,
    };
  }, [events, branches]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const updateForm = <K extends keyof SchoolCalendarForm>(
    key: K,
    value: SchoolCalendarForm[K],
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
  };

  const save = async () => {
    const startAt = new Date(form.startAt).getTime();
    const endAt = new Date(form.endAt).getTime();

    if (
      !form.title.trim() ||
      !Number.isFinite(startAt) ||
      !Number.isFinite(endAt) ||
      startAt >= endAt
    ) {
      alert("Please enter title, valid start and end time.");
      return;
    }

    if (!accountId || !schoolId) {
      alert("School context is required.");
      return;
    }

    try {
      setSaving(true);

      await createCalendarEvent({
        event: {
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(form.branchId || branches[0]?.id || 0),
          scopeType: "school",
          scopeId: Number(schoolId),
          title: cleanText(form.title),
          description: cleanText(form.description),
          eventType: form.eventType as any,
          visibility: "school",
          startAt,
          endAt,
          location: cleanText(form.location),
          priority: form.priority as any,
          createdByRole: "school_admin",
        },
        reminders: [
          {
            channel: "in_app",
            minutesBefore: 1440,
          },
        ],
      });

      setDrawer(false);
      resetForm();
      await load();
    } catch (error) {
      console.error("Failed to save calendar event:", error);
      alert("Failed to save calendar event.");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // STATES
  // ======================================================

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <main
        className="sa-page"
        style={{ "--sa-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>

        <section className="sa-state">
          <h2>Opening school calendar...</h2>
          <p>Loading school-wide events.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main
      className="sa-page"
      style={{ "--sa-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section className="sa-hero">
        <div className="sa-hero-left">
          <div className="sa-icon">📅</div>

          <div className="sa-title">
            <p>School Admin Calendar</p>
            <h2>Calendar</h2>
            <span>{activeSchool?.name || "School"} · School-wide events</span>
          </div>
        </div>

        <div className="sa-actions">
          <button type="button" className="sa-btn" onClick={load}>
            Refresh
          </button>

          <button
            type="button"
            className="sa-primary"
            onClick={() => setDrawer(true)}
          >
            New Event
          </button>
        </div>
      </section>

      <section className="sa-summary-grid">
        <SummaryCard label="Events" value={summary.total} icon="📌" />
        <SummaryCard label="Upcoming" value={summary.upcoming} icon="⏭️" positive />
        <SummaryCard label="Today" value={summary.today} icon="📍" />
        <SummaryCard label="Branches" value={summary.branches} icon="🏫" />
        <SummaryCard label="Holidays" value={summary.holidays} icon="🏖️" />
        <SummaryCard
          label="Urgent/High"
          value={summary.urgent}
          icon="⚠️"
          warning={summary.urgent > 0}
        />
      </section>

      <Toolbar view={view} setView={setView} count={filtered.length} />

      <section className="sa-filter">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search school events..."
        />

        <select
          value={type}
          onChange={(event) => setType(event.target.value as EventFilter)}
        >
          <option value="all">All Types</option>
          <option value="school_event">School Event</option>
          <option value="meeting">Meeting</option>
          <option value="holiday">Holiday</option>
          <option value="deadline">Deadline</option>
        </select>

        <button
          type="button"
          className="sa-primary"
          onClick={() => setDrawer(true)}
        >
          Add
        </button>
      </section>

      {view === "analytics" && (
        <section className="sa-section sa-breakdown-grid">
          {SCHOOL_EVENT_TYPES.map((eventType) => {
            const count = events.filter(
              (event: AnyRow) => event.eventType === eventType,
            ).length;

            const percent = events.length
              ? Math.round((count / events.length) * 100)
              : 0;

            return (
              <article className="sa-breakdown" key={eventType}>
                <strong>{formatEventType(eventType)}</strong>

                <div className="sa-bar">
                  <div style={{ width: `${percent}%` }} />
                </div>

                <div className="sa-chip-row">
                  <Chip tone="blue">{count}</Chip>
                  <Chip>{percent}%</Chip>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {view === "table" && (
        <section className="sa-panel">
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((event: AnyRow) => (
                  <tr key={event.id || event.localId || event.title}>
                    <td>
                      <strong>{event.title}</strong>
                      <br />
                      <span>{event.description || "-"}</span>
                    </td>
                    <td>{formatEventType(event.eventType)}</td>
                    <td>{dateLabel(event.startAt)}</td>
                    <td>{dateLabel(event.endAt)}</td>
                    <td>{event.location || "-"}</td>
                    <td>
                      <Chip tone="green">{event.status || "scheduled"}</Chip>
                    </td>
                  </tr>
                ))}

                {!filtered.length && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyCard text="No school-wide calendar events found." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === "cards" && (
        <section className="sa-section">
          <div className="sa-list">
            {filtered.map((event: AnyRow) => (
              <article
                key={event.id || event.localId || event.title}
                className="sa-card"
              >
                <div className="sa-card-top">
                  <div className="sa-avatar">📅</div>

                  <div className="sa-card-main">
                    <h3>{event.title}</h3>
                    <p>
                      {dateLabel(event.startAt)} ·{" "}
                      {event.location || "No location"}
                    </p>

                    <div className="sa-chip-row">
                      <Chip tone="blue">{formatEventType(event.eventType)}</Chip>
                      <Chip
                        tone={
                          event.priority === "urgent"
                            ? "red"
                            : event.priority === "high"
                              ? "orange"
                              : "gray"
                        }
                      >
                        {event.priority || "normal"}
                      </Chip>
                    </div>
                  </div>
                </div>

                {event.description && (
                  <p className="sa-message">{event.description}</p>
                )}
              </article>
            ))}

            {!filtered.length && (
              <EmptyCard text="No school-wide calendar events found." />
            )}
          </div>
        </section>
      )}

      {drawer && (
        <div className="sa-drawer-layer">
          <button
            type="button"
            className="sa-drawer-overlay"
            aria-label="Close drawer"
            onClick={() => setDrawer(false)}
          />

          <aside className="sa-drawer">
            <div className="sa-drawer-head">
              <div>
                <p>School Calendar</p>
                <h2>New School-wide Event</h2>
              </div>

              <button type="button" onClick={() => setDrawer(false)}>
                ✕
              </button>
            </div>

            <section className="sa-form-card">
              <div className="sa-form-grid">
                <label className="wide">
                  <span>Title</span>
                  <input
                    value={form.title}
                    onChange={(event) => updateForm("title", event.target.value)}
                  />
                </label>

                <label>
                  <span>Anchor Branch</span>
                  <select
                    value={form.branchId}
                    onChange={(event) =>
                      updateForm("branchId", event.target.value)
                    }
                  >
                    <option value="">Use first branch</option>

                    {branches.map((branch: AnyRow) => (
                      <option key={branch.id || branch.localId} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Type</span>
                  <select
                    value={form.eventType}
                    onChange={(event) =>
                      updateForm("eventType", event.target.value)
                    }
                  >
                    <option value="school_event">School Event</option>
                    <option value="meeting">Meeting</option>
                    <option value="holiday">Holiday</option>
                    <option value="deadline">Deadline</option>
                  </select>
                </label>

                <label>
                  <span>Priority</span>
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      updateForm(
                        "priority",
                        event.target.value as SchoolCalendarForm["priority"],
                      )
                    }
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                    <option value="low">Low</option>
                  </select>
                </label>

                <label>
                  <span>Start</span>
                  <input
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(event) =>
                      updateForm("startAt", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>End</span>
                  <input
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(event) => updateForm("endAt", event.target.value)}
                  />
                </label>

                <label className="wide">
                  <span>Location</span>
                  <input
                    value={form.location}
                    onChange={(event) =>
                      updateForm("location", event.target.value)
                    }
                  />
                </label>

                <label className="wide">
                  <span>Description</span>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      updateForm("description", event.target.value)
                    }
                  />
                </label>
              </div>
            </section>

            <div className="sa-drawer-actions">
              <button
                type="button"
                className="sa-btn"
                onClick={() => setDrawer(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="sa-primary"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving..." : "Save Event"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: ChipTone;
}) {
  return <span className={`sa-chip ${tone}`}>{children}</span>;
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
    <article
      className={`sa-summary ${warning ? "warning" : ""} ${
        positive ? "positive" : ""
      }`}
    >
      <div>{icon}</div>

      <section>
        <strong>{value}</strong>
        <span>{label}</span>
      </section>
    </article>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="sa-empty">
      <div>📌</div>
      <h3>No records</h3>
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
  return (
    <section className="sa-toolbar">
      <div className="sa-tabs">
        {(["cards", "table", "analytics"] as ViewMode[]).map((mode) => (
          <button
            type="button"
            key={mode}
            className={view === mode ? "active" : ""}
            onClick={() => setView(mode)}
          >
            {mode}
          </button>
        ))}
      </div>

      <Chip>{count} shown</Chip>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
.sa-page {
  min-height: 100dvh;
  padding: 10px;
  padding-bottom: 32px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--sa-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111);
  font-family: var(--font-family, system-ui);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.sa-page * {
  box-sizing: border-box;
}

.sa-page button,
.sa-page input,
.sa-page select,
.sa-page textarea {
  font: inherit;
  max-width: 100%;
}

.sa-page input,
.sa-page select,
.sa-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.1)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--text, #111);
  font-weight: 750;
}

.sa-page textarea {
  min-height: 120px;
  padding: 12px;
}

.sa-state,
.sa-card,
.sa-panel,
.sa-summary,
.sa-toolbar,
.sa-filter,
.sa-empty,
.sa-breakdown,
.sa-form-card {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.1));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.sa-state {
  min-height: 360px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  border-radius: 28px;
  text-align: center;
  padding: 22px;
}

.sa-state h2 {
  margin: 0;
  font-weight: 1000;
}

.sa-state p,
.sa-card p,
.sa-title span,
.sa-mini span {
  color: var(--muted, #64748b);
}

.sa-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(
    135deg,
    var(--card-bg, var(--surface, #fff)),
    color-mix(in srgb, var(--sa-primary) 7%, var(--card-bg, #fff))
  );
  border: 1px solid var(--border, rgba(0,0,0,.1));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
}

.sa-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sa-icon,
.sa-avatar {
  display: grid;
  place-items: center;
  background: var(--sa-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--sa-primary) 28%, transparent);
}

.sa-icon {
  width: 48px;
  height: 48px;
  border-radius: 18px;
  font-size: 22px;
}

.sa-avatar {
  width: 56px;
  height: 56px;
  border-radius: 19px;
  font-size: 22px;
  flex: 0 0 auto;
}

.sa-title {
  min-width: 0;
}

.sa-title p {
  margin: 0;
  color: var(--sa-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sa-title h2 {
  margin: 0;
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
}

.sa-title span {
  display: block;
  font-size: 12px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sa-actions {
  display: flex;
  gap: 8px;
}

.sa-btn,
.sa-primary {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
}

.sa-btn {
  border: 1px solid var(--border, rgba(0,0,0,.1));
  background: var(--surface, #fff);
  color: var(--text, #111);
}

.sa-primary {
  border: 0;
  background: var(--sa-primary);
  color: #fff;
}

.sa-summary-grid,
.sa-list,
.sa-mini-grid,
.sa-breakdown-grid {
  display: grid;
  gap: 8px;
}

.sa-summary-grid {
  margin-top: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sa-summary {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 22px;
  min-width: 0;
}

.sa-summary.warning {
  background: linear-gradient(135deg, rgba(245,158,11,.12), var(--card-bg, #fff));
}

.sa-summary.positive {
  background: linear-gradient(135deg, rgba(34,197,94,.12), var(--card-bg, #fff));
}

.sa-summary > div:first-child {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--sa-primary) 12%, var(--surface, #fff));
}

.sa-summary strong,
.sa-summary span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sa-summary strong {
  font-size: 18px;
  font-weight: 1000;
}

.sa-summary span {
  font-size: 11px;
  font-weight: 850;
  color: var(--muted, #64748b);
}

.sa-toolbar,
.sa-filter,
.sa-panel {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.sa-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.sa-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sa-primary) 7%, var(--surface, #fff));
}

.sa-tabs button {
  border: 0;
  border-radius: 999px;
  min-height: 35px;
  background: transparent;
  color: var(--muted, #64748b);
  font-weight: 950;
  text-transform: capitalize;
}

.sa-tabs button.active {
  background: var(--sa-primary);
  color: #fff;
}

.sa-filter {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.sa-section {
  margin-top: 16px;
}

.sa-card,
.sa-breakdown,
.sa-empty {
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.sa-card-top {
  display: flex;
  gap: 10px;
}

.sa-card-main {
  min-width: 0;
  flex: 1;
}

.sa-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.sa-chip-row {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.sa-chip {
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  text-transform: capitalize;
}

.sa-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.sa-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.sa-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.sa-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.sa-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }
.sa-chip.gray {
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  color: var(--muted, #64748b);
}

.sa-mini-grid {
  grid-template-columns: repeat(2, 1fr);
  margin-top: 10px;
}

.sa-mini {
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sa-mini strong,
.sa-mini span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sa-mini strong {
  font-weight: 1000;
}

.sa-mini span {
  font-size: 10px;
  font-weight: 850;
}

.sa-table-wrap {
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sa-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: var(--card-bg, #fff);
}

.sa-table th,
.sa-table td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  text-align: left;
  vertical-align: top;
}

.sa-table th {
  font-size: 11px;
  color: var(--muted, #64748b);
  text-transform: uppercase;
}

.sa-empty {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.sa-empty div {
  font-size: 28px;
}

.sa-message {
  margin: 10px 0;
  padding: 12px;
  border-radius: 18px;
  background: rgba(245,158,11,.14);
  color: #f59e0b;
  font-weight: 900;
}

.sa-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.sa-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15,23,42,.52);
}

.sa-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 720px);
  overflow-y: auto;
  background: var(--bg, #f7f8fb);
  padding: 14px;
  box-shadow: -24px 0 70px rgba(15,23,42,.22);
}

.sa-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--bg, #f7f8fb);
}

.sa-drawer-head p {
  margin: 0;
  color: var(--sa-primary);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.sa-drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 1000;
}

.sa-drawer-head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border, rgba(0,0,0,.1));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #111);
  font-weight: 1000;
}

.sa-form-card {
  margin-top: 10px;
  padding: 12px;
  border-radius: 22px;
}

.sa-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 9px;
}

.sa-form-grid label {
  display: grid;
  gap: 6px;
}

.sa-form-grid span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.sa-form-grid .wide {
  grid-column: 1 / -1;
}

.sa-drawer-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.sa-bar {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.sa-bar div {
  height: 100%;
  background: var(--sa-primary);
}

@media (min-width: 680px) {
  .sa-summary-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .sa-filter {
    grid-template-columns: 1fr 190px 150px;
  }

  .sa-mini-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .sa-form-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1040px) {
  .sa-page {
    padding: 16px;
  }

  .sa-summary-grid {
    grid-template-columns: repeat(6, 1fr);
  }

  .sa-list,
  .sa-breakdown-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 520px) {
  .sa-page {
    padding: 6px;
  }

  .sa-hero {
    flex-direction: column;
    align-items: stretch;
    border-radius: 22px;
  }

  .sa-actions {
    display: grid;
  }

  .sa-btn,
  .sa-primary {
    width: 100%;
  }

  .sa-toolbar {
    flex-direction: column;
  }

  .sa-tabs {
    width: 100%;
  }

  .sa-drawer-actions {
    grid-template-columns: 1fr;
  }
}
`;
