"use client";

/**
 * app/branch-admin/modules/Announcements.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH ANNOUNCEMENTS V3
 * ---------------------------------------------------------
 * Golden Standard Module.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin communication page from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all communication reads and writes now use the resolved workspace
 *   schoolId and branchId
 *
 * Golden UI behavior:
 * - no duplicate module hero/header block
 * - compact search + inline add + slider filter + more menu
 * - filters moved into a bottom sheet
 * - cards/list view uses compact Students.tsx-style rows instead of large cards
 * - table and analytics live under the More menu
 * - summary is shown inside analytics, not as a permanent main-screen strip
 * - drawer/form remains mobile-first and theme-safe
 * - table headers use theme variables so dark mode/system theme remains readable
 *
 * Tables used:
 * - announcements
 * - announcementRecipients
 * - communicationLogs
 * - teachers
 * - parents
 * - students
 * - userMemberships / memberships
 * - users / accountUsers
 *
 * Sync behavior:
 * - createLocal(...) creates announcements and recipients
 * - updateLocal(...) edits existing announcements
 * - softDeleteLocal(...) archives announcements and linked recipients
 * - reads/writes stay scoped by accountId + schoolId + branchId
 * - no manual synced/version/updatedAt fields are written directly here
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db } from "../../lib/db/db";
import { createLocal, softDeleteLocal, updateLocal } from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type ViewMode = "cards" | "table" | "analytics";
type ToastTone = "success" | "error" | "info";
type AnyRow = Record<string, any>;
type Audience = "teachers" | "parents" | "students" | "accountants" | "whole_branch";
type Channel = "in_app" | "email" | "sms" | "whatsapp";
type DrawerMode = "create" | "edit";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type FormState = {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  priority: string;
  status: string;
  channels: Channel[];
};

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "teachers", label: "Teachers" },
  { value: "parents", label: "Parents" },
  { value: "students", label: "Students" },
  { value: "accountants", label: "Accountants" },
  { value: "whole_branch", label: "Whole Branch" },
];

const CHANNELS: Channel[] = ["in_app", "email", "sms", "whatsapp"];

const emptyForm: FormState = {
  id: 0,
  title: "",
  body: "",
  audience: "teachers",
  priority: "normal",
  status: "sent",
  channels: ["in_app"],
};

const now = () => Date.now();

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow) {
  return row?.id ?? row?.localId ?? row?.cloudId;
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


function dateLabel(value?: number | string) {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
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

function isBranchRow(row: AnyRow, accountId?: string | null, schoolId?: number | null, branchId?: number | null) {
  if (!sameAccount(row, accountId)) return false;
  return schoolIdOf(row) === Number(schoolId || 0) && branchIdOf(row) === Number(branchId || 0);
}

function isTargetedToBranch(row: AnyRow, branchId?: number | null) {
  const ids = Array.isArray(row?.targetBranchIds) ? row.targetBranchIds : [];
  return ids.map(Number).includes(Number(branchId || 0));
}

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function rowName(row?: AnyRow) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
}

function normalizeAudience(value: any): Audience {
  const raw = String(value || "teachers").toLowerCase();
  return ["teachers", "parents", "students", "accountants", "whole_branch"].includes(raw) ? (raw as Audience) : "teachers";
}

function normalizeChannels(value: any): Channel[] {
  const raw = Array.isArray(value)
    ? value
    : String(value || "in_app")
        .split(",")
        .map((item) => item.trim());

  const clean = raw.filter((item: any) => CHANNELS.includes(item)) as Channel[];
  return clean.length ? clean : ["in_app"];
}

function priorityTone(priority?: string): Tone {
  const value = String(priority || "normal").toLowerCase();
  if (value === "urgent") return "red";
  if (value === "high") return "orange";
  if (value === "low") return "gray";
  return "blue";
}

function statusTone(status?: string): Tone {
  const value = String(status || "sent").toLowerCase();
  if (value === "draft") return "gray";
  if (value === "scheduled") return "orange";
  if (value === "failed") return "red";
  return "green";
}

function audienceLabel(value?: any) {
  return normalizeAudience(value).replaceAll("_", " ");
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
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

export default function Announcements() {
  const dataRevision = useDataRevision();

  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, activeBranch, activeBranchId, loading: contextLoading } = useActiveBranch();
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

  const { loading, setLoading } = useBackgroundLoader();
  const [view, setView] = useState<ViewMode>("cards");
  const [announcements, setAnnouncements] = useState<AnyRow[]>([]);
  const [recipients, setRecipients] = useState<AnyRow[]>([]);
  const [logs, setLogs] = useState<AnyRow[]>([]);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [parents, setParents] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [memberships, setMemberships] = useState<AnyRow[]>([]);
  const [users, setUsers] = useState<AnyRow[]>([]);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    else if (!schoolId || !branchId) router.replace("/account");
  }, [accountLoading, contextLoading, authenticated, accountId, schoolId, branchId, router]);

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast((current) => (current?.message === message ? null : current)), 4200);
  };

  async function load() {
    if (!accountId || !schoolId || !branchId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [ann, rec, log, tea, par, stu, memRaw, usrRaw] = await Promise.all([
        safeArray("announcements"),
        safeArray("announcementRecipients"),
        safeArray("communicationLogs"),
        safeArray("teachers"),
        safeArray("parents"),
        safeArray("students"),
        safeArray("userMemberships").then(async (rows) => (rows.length ? rows : safeArray("memberships"))),
        safeArray("users").then(async (rows) => (rows.length ? rows : safeArray("accountUsers"))),
      ]);

      setAnnouncements(
        (ann as AnyRow[])
          .filter((row) => isBranchRow(row, accountId, schoolId, branchId) || isTargetedToBranch(row, branchId))
          .filter((row) => row?.isDeleted !== true)
      );
      setRecipients((rec as AnyRow[]).filter((row) => isBranchRow(row, accountId, schoolId, branchId)).filter((row) => row?.isDeleted !== true));
      setLogs((log as AnyRow[]).filter((row) => isBranchRow(row, accountId, schoolId, branchId)).filter((row) => row?.isDeleted !== true));
      setTeachers((tea as AnyRow[]).filter((row) => isBranchRow(row, accountId, schoolId, branchId)));
      setParents((par as AnyRow[]).filter((row) => isBranchRow(row, accountId, schoolId, branchId)));
      setStudents((stu as AnyRow[]).filter((row) => isBranchRow(row, accountId, schoolId, branchId)));
      setMemberships((memRaw as AnyRow[]).filter((row) => isBranchRow(row, accountId, schoolId, branchId)));
      setUsers(usrRaw as AnyRow[]);
    } catch (error) {
      console.error("Failed to load announcements:", error);
      showToast("error", "Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, schoolId, branchId, accountLoading, settingsLoading, contextLoading,
    dataRevision,
  ]);

  const candidates = useMemo(() => {
    const rows: AnyRow[] = [];

    if (form.audience === "teachers" || form.audience === "whole_branch") {
      teachers.forEach((teacher) => rows.push({ role: "teacher", name: rowName(teacher), email: teacher.email, phone: teacher.phone, userId: teacher.userId, profileId: teacher.id }));
    }

    if (form.audience === "parents" || form.audience === "whole_branch") {
      parents.forEach((parent) => rows.push({ role: "parent", name: rowName(parent), email: parent.email, phone: parent.phone, userId: parent.userId, profileId: parent.id }));
    }

    if (form.audience === "students" || form.audience === "whole_branch") {
      students.forEach((student) => rows.push({ role: "student", name: rowName(student), email: student.email, phone: student.phone, userId: student.userId, profileId: student.id }));
    }

    if (form.audience === "accountants" || form.audience === "whole_branch") {
      memberships
        .filter((membership) => String(membership.role || "").toLowerCase() === "accountant")
        .forEach((membership) => {
          const user =
            users.find((item) => String(item.id || item.localId) === String(membership.userId || membership.userLocalId || membership.accountUserId)) ||
            users.find((item) => item.email && membership.email && String(item.email).toLowerCase() === String(membership.email).toLowerCase());
          rows.push({ role: "accountant", name: rowName(user || membership), email: user?.email || membership.email, phone: user?.phone || membership.phone, userId: user?.id || user?.localId });
        });
    }

    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = String(row.userId || row.email || row.phone || `${row.role}-${row.profileId}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return row.name || row.email || row.phone;
    });
  }, [form.audience, memberships, parents, students, teachers, users]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    return announcements
      .filter((announcement) => status === "all" || String(announcement.status || "sent") === status)
      .filter((announcement) => audienceFilter === "all" || normalizeAudience(announcement.audience || announcement.targetRole) === audienceFilter)
      .filter((announcement) => priorityFilter === "all" || String(announcement.priority || "normal") === priorityFilter)
      .filter((announcement) => {
        if (!q) return true;
        return [
          announcement.title,
          announcement.body,
          announcement.message,
          announcement.audience,
          announcement.status,
          announcement.priority,
          normalizeChannels(announcement.channels || announcement.channel).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => n(b.sentAt || b.publishAt || b.createdAt) - n(a.sentAt || a.publishAt || a.createdAt));
  }, [announcements, audienceFilter, priorityFilter, query, status]);

  const summary = useMemo(
    () => ({
      total: announcements.length,
      shown: filtered.length,
      sent: announcements.filter((row) => String(row.status || "sent") === "sent").length,
      draft: announcements.filter((row) => String(row.status || "") === "draft").length,
      scheduled: announcements.filter((row) => String(row.status || "") === "scheduled").length,
      urgent: announcements.filter((row) => ["urgent", "high"].includes(String(row.priority || ""))).length,
      recipients: recipients.length,
      failed: logs.filter((log) => String(log.status || "").toLowerCase().includes("fail")).length,
    }),
    [announcements, filtered.length, logs, recipients]
  );

  const audienceCounts = useMemo(
    () => AUDIENCES.map((audience) => ({ label: audience.label, value: announcements.filter((item) => normalizeAudience(item.audience || item.targetRole) === audience.value).length })),
    [announcements]
  );

  const statusCounts = useMemo(
    () => [
      { label: "Sent", value: summary.sent },
      { label: "Draft", value: summary.draft },
      { label: "Scheduled", value: summary.scheduled },
      { label: "Failed Logs", value: summary.failed },
    ],
    [summary]
  );

  const activeFilterCount = useMemo(() => {
    return [status, audienceFilter, priorityFilter].filter((item) => item !== "all").length;
  }, [audienceFilter, priorityFilter, status]);

  function openCreate() {
    setDrawerMode("create");
    setForm(emptyForm);
    setDrawer(true);
  }

  function openEdit(announcement: AnyRow) {
    setDrawerMode("edit");
    setForm({
      id: cleanId(announcement.id || announcement.localId),
      title: String(announcement.title || ""),
      body: String(announcement.body || announcement.message || ""),
      audience: normalizeAudience(announcement.audience || announcement.targetRole),
      priority: String(announcement.priority || "normal"),
      status: String(announcement.status || "sent"),
      channels: normalizeChannels(announcement.channels || announcement.channel),
    });
    setDrawer(true);
  }

  function toggleChannel(channel: Channel) {
    setForm((current) => {
      const channels = current.channels.includes(channel) ? current.channels.filter((item) => item !== channel) : [...current.channels, channel];
      return { ...current, channels: channels.length ? channels : ["in_app"] };
    });
  }

  async function replaceRecipients(announcementId: number) {
    const existing = recipients.filter((recipient) => Number(recipient.announcementId) === Number(announcementId));

    for (const recipient of existing) {
      const id = cleanId(recipient.id || recipient.localId);
      if (id) await softDeleteLocal("announcementRecipients" as any, id);
    }

    for (const recipient of candidates) {
      await createLocal("announcementRecipients" as any, {
        accountId: String(accountId),
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        announcementId,
        recipientUserId: recipient.userId || undefined,
        role: recipient.role,
        email: recipient.email || undefined,
        phone: recipient.phone || undefined,
        status: form.status === "sent" ? "delivered" : form.status,
        deliveredAt: form.status === "sent" ? now() : undefined,
        isDeleted: false,
      } as AnyRow);
    }
  }

  async function save() {
    if (!accountId || !schoolId || !branchId) return showToast("error", "Assigned branch context is required.");
    if (!form.title.trim() || !form.body.trim()) return showToast("error", "Title and message are required.");
    if (!candidates.length) return showToast("error", "No recipients found for this audience.");

    setSaving(true);

    try {
      const payload: AnyRow = {
        accountId: String(accountId),
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        title: form.title.trim(),
        body: form.body.trim(),
        message: form.body.trim(),
        audience: form.audience,
        targetRole: form.audience,
        targetRoles: [form.audience],
        targetBranchIds: [Number(branchId)],
        channels: form.channels,
        channel: form.channels.join(","),
        priority: form.priority,
        status: form.status,
        publishAt: now(),
        sentAt: form.status === "sent" ? now() : undefined,
        createdBy: "branch_admin",
        active: true,
        isDeleted: false,
      };

      let announcementId = cleanId(form.id);

      if (drawerMode === "edit" && announcementId) {
        await updateLocal("announcements" as any, announcementId, payload);
      } else {
        const created = (await createLocal("announcements" as any, payload)) as AnyRow | undefined;
        announcementId = cleanId(created?.id);
      }

      if (announcementId) await replaceRecipients(announcementId);

      setDrawer(false);
      setForm(emptyForm);
      showToast("success", drawerMode === "edit" ? "Announcement updated." : "Announcement saved.");
      await load();
    } catch (error: any) {
      console.error("Failed to save announcement:", error);
      showToast("error", error?.message || "Failed to save announcement.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnouncement(announcement: AnyRow) {
    const id = cleanId(announcement.id || announcement.localId);
    if (!id) return;

    const ok = window.confirm(`Delete "${announcement.title || "announcement"}"?`);
    if (!ok) return;

    try {
      await softDeleteLocal("announcements" as any, id);

      const linked = recipients.filter((recipient) => Number(recipient.announcementId) === Number(id));
      for (const recipient of linked) {
        const recipientId = cleanId(recipient.id || recipient.localId);
        if (recipientId) await softDeleteLocal("announcementRecipients" as any, recipientId);
      }

      showToast("success", "Announcement deleted.");
      await load();
    } catch (error: any) {
      console.error("Failed to delete announcement:", error);
      showToast("error", error?.message || "Failed to delete announcement.");
    }
  }

  const clearFilters = () => {
    setStatus("all");
    setAudienceFilter("all");
    setPriorityFilter("all");
  };

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return <State primary={primary} title="Opening announcements..." text="Loading branch notices and recipients." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing announcements." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>No branch workspace selected</h2>
          <p>Announcements belong to the selected branch-admin workspace. Use Select Role again if the wrong branch is active.</p>
          <button type="button" className="ba-state-button" onClick={() => router.push("/account")}>Go to Account Setup</button>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      )}

      <section className="ba-search-card" aria-label="Announcements search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search announcements..." aria-label="Search announcements" />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="New announcement">+</button>

        <button type="button" className={`ba-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {status !== "all" && <button type="button" onClick={() => setStatus("all")}>Status: {status} ×</button>}
          {audienceFilter !== "all" && <button type="button" onClick={() => setAudienceFilter("all")}>Audience: {audienceLabel(audienceFilter)} ×</button>}
          {priorityFilter !== "all" && <button type="button" onClick={() => setPriorityFilter("all")}>Priority: {priorityFilter} ×</button>}
        </section>
      )}

      {view === "analytics" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="Announcements by Audience" rows={audienceCounts} total={Math.max(1, summary.total)} />
          <AnalysisCard title="Status Overview" rows={statusCounts} total={Math.max(1, summary.total)} />
          <article className="ba-analysis"><span>Recipients</span><strong>{summary.recipients}</strong><p>Recipient records generated for branch announcements.</p></article>
          <article className="ba-analysis"><span>Current Filter</span><strong>{summary.shown}</strong><p>Announcement record(s) currently match your search and filters.</p></article>
        </section>
      )}

      {view === "table" && <TableView rows={filtered} openEdit={openEdit} deleteAnnouncement={deleteAnnouncement} />}

      {view === "cards" && (
        <section className="ba-list">
          {filtered.map((announcement) => (
            <AnnouncementListItem key={String(idOf(announcement))} announcement={announcement} openEdit={openEdit} deleteAnnouncement={deleteAnnouncement} />
          ))}

          {!filtered.length && <Empty icon="📣" title="No announcements found" text="Create branch announcements for teachers, parents, students, accountants, or the whole branch." />}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          status={status}
          audienceFilter={audienceFilter}
          priorityFilter={priorityFilter}
          setStatus={setStatus}
          setAudienceFilter={setAudienceFilter}
          setPriorityFilter={setPriorityFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          view={view}
          summary={summary}
          setView={(mode) => { setView(mode); setMoreOpen(false); }}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {drawer && (
        <AnnouncementDrawer
          mode={drawerMode}
          form={form}
          setForm={setForm}
          candidatesCount={candidates.length}
          saving={saving}
          toggleChannel={toggleChannel}
          save={save}
          onClose={() => setDrawer(false)}
          branchName={activeBranch?.name || "Assigned branch"}
        />
      )}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function AnnouncementListItem({ announcement, openEdit, deleteAnnouncement }: { announcement: AnyRow; openEdit: (row: AnyRow) => void; deleteAnnouncement: (row: AnyRow) => void }) {
  return (
    <article className="announcement-row">
      <div className="announcement-avatar">📣</div>

      <span className="announcement-main">
        <strong>{announcement.title || "Untitled announcement"}</strong>
        <small>{dateLabel(announcement.sentAt || announcement.publishAt || announcement.createdAt)} · {audienceLabel(announcement.audience || announcement.targetRole)}</small>
        <em>{text(announcement.body || announcement.message, "No message").slice(0, 115)}</em>
      </span>

      <span className="announcement-side">
        <span className={`status-dot-mini ${statusTone(announcement.status)}`} title={String(announcement.status || "sent")} />
        <button type="button" onClick={() => openEdit(announcement)} aria-label="Edit announcement">✎</button>
        <button type="button" className="danger" onClick={() => deleteAnnouncement(announcement)} aria-label="Delete announcement">⌫</button>
      </span>
    </article>
  );
}

function TableView({ rows, openEdit, deleteAnnouncement }: { rows: AnyRow[]; openEdit: (row: AnyRow) => void; deleteAnnouncement: (row: AnyRow) => void }) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Announcements ({rows.length})</th>
              <th>Date</th>
              <th>Audience</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Channels</th>
              <th>Message</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((announcement) => (
              <tr key={String(idOf(announcement))}>
                <td><strong>{announcement.title || "Untitled"}</strong><span>{announcement.createdBy || "Branch admin"}</span></td>
                <td>{dateLabel(announcement.sentAt || announcement.publishAt || announcement.createdAt)}</td>
                <td>{audienceLabel(announcement.audience || announcement.targetRole)}</td>
                <td><Chip tone={priorityTone(announcement.priority)}>{announcement.priority || "normal"}</Chip></td>
                <td><Chip tone={statusTone(announcement.status)}>{announcement.status || "sent"}</Chip></td>
                <td>{normalizeChannels(announcement.channels || announcement.channel).join(", ")}</td>
                <td>{text(announcement.body || announcement.message).slice(0, 120)}</td>
                <td>
                  <div className="ba-table-actions">
                    <button type="button" onClick={() => openEdit(announcement)}>Edit</button>
                    <button type="button" className="ba-delete" onClick={() => deleteAnnouncement(announcement)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="ba-empty-table">No announcement matches your filters.</div>}
      </div>
    </section>
  );
}

function FilterSheet({ status, audienceFilter, priorityFilter, setStatus, setAudienceFilter, setPriorityFilter, clearFilters, onClose }: { status: string; audienceFilter: string; priorityFilter: string; setStatus: (value: string) => void; setAudienceFilter: (value: string) => void; setPriorityFilter: (value: string) => void; clearFilters: () => void; onClose: () => void }) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div><h2>Filters</h2><p>Choose announcement status, audience, and priority.</p></div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-form compact">
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="sent">Sent</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="failed">Failed</option></select></label>
          <label><span>Audience</span><select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)}><option value="all">All audiences</option>{AUDIENCES.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}</select></label>
          <label><span>Priority</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label>
        </div>

        <div className="ba-sheet-actions"><button type="button" onClick={clearFilters}>Clear</button><button type="button" className="primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({ view, summary, setView, onRefresh, onClose }: { view: ViewMode; summary: { total: number; shown: number; sent: number; draft: number; scheduled: number; urgent: number; recipients: number; failed: number }; setView: (value: ViewMode) => void; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div><h2>More</h2><p>Views and refresh actions are here to keep the page compact.</p></div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact announcement rows</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense laptop view</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.shown}/{summary.total} shown · {summary.recipients} recipients</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local branch announcements</small></button>
        </div>
      </section>
    </div>
  );
}

function AnnouncementDrawer({ mode, form, setForm, candidatesCount, saving, toggleChannel, save, onClose, branchName }: { mode: DrawerMode; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; candidatesCount: number; saving: boolean; toggleChannel: (channel: Channel) => void; save: () => void | Promise<void>; onClose: () => void; branchName: string }) {
  return (
    <div className="ba-drawer-layer" role="dialog" aria-modal="true">
      <button className="ba-drawer-overlay" type="button" onClick={onClose} aria-label="Close drawer" />

      <aside className="ba-drawer">
        <div className="ba-drawer-head">
          <div><p>{mode === "edit" ? "Edit Announcement" : "New Announcement"}</p><h2>Broadcast Notice</h2><span>{branchName}</span></div>
          <button type="button" onClick={onClose} aria-label="Close announcement form">✕</button>
        </div>

        <section className="ba-form-card">
          <div className="ba-form-grid">
            <label className="wide"><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Announcement title" /></label>
            <label><span>Audience</span><select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as Audience })}>{AUDIENCES.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}</select></label>
            <label><span>Priority</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label>
            <label><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="sent">Send now</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option></select></label>
            <label className="wide"><span>Message</span><textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Write the message..." /></label>
          </div>

          <div className="ba-channel-row">
            {CHANNELS.map((channel) => <button key={channel} type="button" className={form.channels.includes(channel) ? "active" : ""} onClick={() => toggleChannel(channel)}>{channel.replaceAll("_", " ")}</button>)}
          </div>

          <p className="ba-hint">{candidatesCount} recipient(s) match this audience.</p>
        </section>

        <div className="ba-drawer-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Saving..." : mode === "edit" ? "Update" : "Save"}</button></div>
      </aside>
    </div>
  );
}

function AnalysisCard({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>
      <div className="ba-analysis-list">
        {rows.map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return <section key={row.label}><div><b>{row.label}</b><small>{row.value} · {share}%</small></div><div className="ba-progress"><i style={{ width: `${Math.max(4, share)}%` }} /></div></section>;
        })}
        {!rows.length && <p>No data available.</p>}
      </div>
    </article>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page textarea{min-height:130px;padding:12px;resize:vertical;line-height:1.55}.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.announcement-row,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal,.ba-form-card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}.ba-toast.error{background:rgba(239,68,68,.12);color:#991b1b}.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{flex:0 0 42px;border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none;-ms-overflow-style:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-list{display:grid;gap:7px;margin-top:10px}.announcement-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.announcement-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 28%,var(--border,rgba(0,0,0,.10)))}.announcement-avatar{width:44px;height:44px;display:grid;place-items:center;border-radius:17px;background:color-mix(in srgb,var(--ba-primary) 14%,var(--card-bg,#fff));font-size:22px}.announcement-main{display:grid;gap:2px;min-width:0}.announcement-main strong,.announcement-main small,.announcement-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.announcement-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.025em}.announcement-main small{color:var(--muted,#64748b);font-size:11px;font-weight:850}.announcement-main em{color:var(--muted,#64748b);font-size:11px;font-style:normal;line-height:1.35}.announcement-side{display:flex;align-items:center;gap:6px}.announcement-side button{width:31px;height:31px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:12px;font-weight:1000;cursor:pointer}.announcement-side button.danger,.ba-delete{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));border-color:color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10)))}.status-dot-mini{width:10px;height:10px;display:inline-block;border-radius:999px;background:var(--muted,#64748b);box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 13%,transparent)}.status-dot-mini.green{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.13)}.status-dot-mini.red{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.13)}.status-dot-mini.orange{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.15)}.status-dot-mini.gray{background:var(--muted,#64748b)}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-table-card{margin-top:10px;padding:10px;border-radius:24px}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ba-table-scroll table{width:100%;min-width:1080px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px;color:var(--text,#111827)}.ba-table-scroll th{background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,var(--surface,#fff)));color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;flex-wrap:wrap;gap:7px}.ba-table-actions button{min-height:34px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 10px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;cursor:pointer}.ba-table-actions button:first-child{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis{padding:13px;border-radius:24px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere;color:var(--text,#111827)}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;padding:13px;border-radius:24px}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}.ba-empty h3{margin:0;color:var(--text,#111827);font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop{position:fixed;inset:0;z-index:70;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(10px)}.ba-sheet{width:min(760px,100%);max-height:min(88dvh,720px);overflow-y:auto;padding:14px;border-radius:28px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827)}.ba-sheet.small{width:min(520px,100%)}.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:2px 2px 14px}.ba-sheet-head h2{margin:0;color:var(--text,#111827);font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-sheet-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form.compact{gap:9px}.ba-form label{display:grid;gap:6px}.ba-form span,.ba-form-grid span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.ba-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 72%,transparent)}.ba-sheet-actions button,.ba-drawer-actions button{min-height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 12px;background:var(--surface,#fff);color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-sheet-actions button.primary,.ba-drawer-actions button.primary{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;gap:2px 10px;align-items:center;min-height:58px;padding:10px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ba-menu-list button>span{grid-row:1/3;width:36px;height:36px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list b{font-size:13px;font-weight:1000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-menu-list small{color:var(--muted,#64748b);font-size:11px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 42%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 8%,var(--surface,#fff))}.ba-drawer-layer{position:fixed;inset:0;z-index:80}.ba-drawer-overlay{position:absolute;inset:0;border:0;background:rgba(15,23,42,.52)}.ba-drawer{position:absolute;right:0;top:0;bottom:0;width:min(94vw,720px);max-width:100vw;overflow-y:auto;overflow-x:hidden;background:var(--bg,#f7f8fb);color:var(--text,#111827);padding:14px;box-shadow:var(--shell-shadow,-24px 0 70px rgba(15,23,42,.22))}.ba-drawer-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:6px 0 12px;background:var(--bg,#f7f8fb)}.ba-drawer-head p{margin:0;color:var(--ba-primary);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.ba-drawer-head h2{margin:2px 0 0;color:var(--text,#111827);font-size:22px;font-weight:1000;letter-spacing:-.05em}.ba-drawer-head span{margin-top:3px;display:block;color:var(--muted,#64748b);font-size:12px;font-weight:750}.ba-drawer-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-form-card{margin-top:10px;padding:12px;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10))}.ba-form-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ba-form-grid label{display:grid;gap:6px}.ba-form-grid .wide{grid-column:1/-1}.ba-channel-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.ba-channel-row button{min-height:36px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 12px;background:var(--surface,#fff);color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer;text-transform:capitalize}.ba-channel-row button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}.ba-hint{margin:10px 0 0;padding:11px;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 8%,transparent);color:var(--text,#111827);font-size:12px;font-weight:850}.ba-drawer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}@media(min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1))}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop{place-items:center;padding:18px}.ba-search-card{grid-template-columns:minmax(0,1fr) auto auto auto}}@media(min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1))}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:520px){.ba-page{padding:calc(6px * var(--local-density-scale,1))}.ba-search-card{grid-template-columns:minmax(0,1fr) auto auto auto;border-radius:21px;padding:7px;gap:6px}.ba-add-inline,.ba-icon-button,.ba-filter-button{width:39px;height:39px}.announcement-row{border-radius:20px;padding:9px;gap:8px}.announcement-avatar{width:40px;height:40px;border-radius:15px}.announcement-side button{display:none}.ba-table-card,.ba-analysis,.ba-empty{border-radius:20px;padding:11px}.ba-sheet,.ba-drawer{border-radius:22px 22px 0 0}.ba-drawer{width:100vw;padding:12px}.ba-drawer-actions{grid-template-columns:minmax(0,1fr)}}
`;
