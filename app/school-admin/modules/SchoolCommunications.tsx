"use client";

/**
 * app/school-admin/modules/Schoolcommunications.tsx
 * ---------------------------------------------------------
 * SCHOOL ADMIN — COMMUNICATIONS
 * ---------------------------------------------------------
 *
 * Strategic hierarchy:
 * - School admin communicates to branch admins / selected branches.
 * - Branch admins then communicate to teachers, parents, students and accountants.
 *
 * This page:
 * - Creates branch-level announcements for branch admins.
 * - Shows branch communication coverage.
 * - Tracks recipients, acknowledgements and communication logs.
 * - Provides card, table and analytics views.
 *
 * It does NOT bypass branch admin to message parents/students directly.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import { db } from "../../lib/db/db";

// ======================================================
// TYPES
// ======================================================

type ViewMode = "cards" | "table" | "analytics";
type StatusFilter = "all" | "draft" | "sent" | "scheduled" | "archived";
type Priority = "low" | "normal" | "high" | "urgent";
type Channel = "in_app" | "email" | "sms" | "whatsapp";

type TenantRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | null;
  branchId?: number | null;
  isDeleted?: boolean;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
  version?: number;
  synced?: any;
};

type Branch = TenantRow & {
  name?: string;
  code?: string;
  location?: string;
  status?: string;
};

type AppUser = TenantRow & {
  id?: number;
  localId?: number;
  title?: string;
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
};

type UserMembership = TenantRow & {
  id?: number;
  localId?: number;
  userId?: number | string | null;
  userLocalId?: number | null;
  accountUserId?: number | null;
  email?: string;
  fullName?: string;
  role?: string;
  status?: string;
};

type Announcement = TenantRow & {
  title?: string;
  body?: string;
  message?: string;
  summary?: string;
  audience?: string;
  targetRole?: string;
  targetRoles?: string[];
  targetBranchIds?: number[];
  channels?: Channel[];
  channel?: string;
  priority?: Priority;
  status?: string;
  publishAt?: number | string;
  sentAt?: number | string;
  expiresAt?: number | string;
  createdBy?: string;
};

type AnnouncementRecipient = TenantRow & {
  announcementId?: number;
  recipientUserId?: number | string | null;
  userLocalId?: number | null;
  branchId?: number | null;
  role?: string;
  email?: string;
  phone?: string;
  status?: string;
  deliveredAt?: number | string;
  readAt?: number | string;
  acknowledgedAt?: number | string;
};

type CommunicationLog = TenantRow & {
  announcementId?: number;
  messageId?: number;
  channel?: string;
  status?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientName?: string;
  error?: string;
  event?: string;
  provider?: string;
  sentAt?: number | string;
  deliveredAt?: number | string;
};

type BranchAdmin = {
  branchId?: number;
  branchName: string;
  userId?: number;
  fullName: string;
  email: string;
  phone: string;
  active: boolean;
};

type BranchCommunication = {
  branchId?: number;
  branchName: string;
  branchCode: string;
  adminCount: number;
  announcementCount: number;
  sentCount: number;
  unreadCount: number;
  acknowledgedCount: number;
  failedLogs: number;
  lastMessageAt: number;
  acknowledgementRate: number;
};

type FormState = {
  title: string;
  body: string;
  priority: Priority;
  status: "draft" | "sent" | "scheduled";
  publishAt: string;
  selectedBranchIds: string[];
  channels: Channel[];
};

type Breakdown = {
  name: string;
  count: number;
};

// ======================================================
// CONSTANTS
// ======================================================

const DEFAULT_FORM: FormState = {
  title: "",
  body: "",
  priority: "normal",
  status: "sent",
  publishAt: "",
  selectedBranchIds: [],
  channels: ["in_app"],
};

const CHANNEL_OPTIONS: { value: Channel; label: string; icon: string }[] = [
  { value: "in_app", label: "In-app", icon: "🔔" },
  { value: "email", label: "Email", icon: "✉️" },
  { value: "sms", label: "SMS", icon: "💬" },
  { value: "whatsapp", label: "WhatsApp", icon: "🟢" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

// ======================================================
// HELPERS
// ======================================================

const now = () => Date.now();

function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) if (anyDb[name]) return anyDb[name];
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  if (!table?.toArray) return [];
  return table.toArray();
}

function sameSchool(row: TenantRow, accountId?: string | null, schoolId?: number | null) {
  if (!row || row.isDeleted) return false;
  return (row.accountId || accountId) === accountId && Number(row.schoolId ?? schoolId) === Number(schoolId);
}

function normalizeText(value?: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function dateValue(value?: number | string) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: number | string) {
  const date = dateValue(value);
  if (!date) return "Not set";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "Not set";
  }
}

function userIdOf(user?: AppUser) {
  return user?.id || user?.localId;
}

function membershipUserId(membership?: UserMembership) {
  return String(membership?.userLocalId || membership?.userId || membership?.accountUserId || "");
}

function respectfulName(input: { title?: string; fullName?: string; name?: string; email?: string }) {
  const title = String(input.title || "").trim();
  const name = String(input.fullName || input.name || input.email || "User").trim();

  if (!title) return name;

  const normalized = title.replace(/\.$/, "").toLowerCase();
  const lower = name.toLowerCase();

  if (lower.startsWith(`${normalized} `) || lower.startsWith(`${normalized}. `)) return name;
  return `${title} ${name}`;
}

function priorityTone(priority?: string): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  if (priority === "urgent") return "red";
  if (priority === "high") return "orange";
  if (priority === "low") return "gray";
  return "blue";
}

function statusTone(status?: string): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  const s = String(status || "").toLowerCase();
  if (s.includes("sent") || s.includes("delivered") || s.includes("published")) return "green";
  if (s.includes("fail") || s.includes("error")) return "red";
  if (s.includes("sched")) return "blue";
  if (s.includes("draft")) return "gray";
  if (s.includes("archiv")) return "purple";
  return "orange";
}

function announcementBody(row: Announcement) {
  return row.body || row.message || row.summary || "";
}

function announcementDate(row: Announcement) {
  return dateValue(row.sentAt || row.publishAt || row.updatedAt || row.createdAt);
}

// ======================================================
// COMPONENT
// ======================================================

export default function SchoolCommunications() {
  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, loading: contextLoading } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [recipients, setRecipients] = useState<AnnouncementRecipient[]>([]);
  const [logs, setLogs] = useState<CommunicationLog[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId && !settings?.schoolId) {
      router.replace("/owner");
    }
  }, [accountLoading, contextLoading, authenticated, accountId, activeSchoolId, settings?.schoolId, router]);

  const load = async () => {
    if (!authenticated || !accountId || !schoolId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        branchRows,
        userRows,
        membershipRows,
        announcementRows,
        recipientRows,
        logRows,
      ] = await Promise.all([
        db.branches.toArray(),
        tableToArray<AppUser>("users", "accountUsers", "appUsers"),
        tableToArray<UserMembership>("userMemberships", "memberships"),
        tableToArray<Announcement>("announcements"),
        tableToArray<AnnouncementRecipient>("announcementRecipients"),
        tableToArray<CommunicationLog>("communicationLogs"),
      ]);

      const scopedBranches = branchRows
        .filter((row: Branch) => sameSchool(row, accountId, Number(schoolId)) && row.active !== false)
        .sort((a: Branch, b: Branch) => String(a.name || "").localeCompare(String(b.name || ""))) as Branch[];

      const branchIds = new Set(scopedBranches.map((branch) => branch.id).filter(Boolean) as number[]);

      const scopedMemberships = membershipRows.filter(
        (row) =>
          row.role === "branch_admin" &&
          sameSchool(row, accountId, Number(schoolId)) &&
          row.branchId &&
          branchIds.has(Number(row.branchId))
      );

      const scopedUsers = userRows.filter((row) => {
        if (row.isDeleted) return false;
        if (row.accountId && row.accountId !== accountId) return false;
        if (row.schoolId && Number(row.schoolId) !== Number(schoolId)) return false;

        return scopedMemberships.some(
          (membership) =>
            String(userIdOf(row) || "") === membershipUserId(membership) ||
            Boolean(row.email && membership.email && row.email.toLowerCase() === membership.email.toLowerCase())
        );
      });

      setBranches(scopedBranches);
      setMemberships(scopedMemberships);
      setUsers(scopedUsers);
      setAnnouncements(announcementRows.filter((row) => sameSchool(row, accountId, Number(schoolId))));
      setRecipients(recipientRows.filter((row) => sameSchool(row, accountId, Number(schoolId))));
      setLogs(logRows.filter((row) => sameSchool(row, accountId, Number(schoolId))));
    } catch (error) {
      console.error("Failed to load school communications:", error);
      alert("Failed to load school communications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId]);

  const branchMap = useMemo(() => new Map(branches.map((branch) => [Number(branch.id), branch])), [branches]);

  const branchAdmins = useMemo<BranchAdmin[]>(() => {
    return memberships
      .map((membership) => {
        const user =
          users.find((row) => String(userIdOf(row) || "") === membershipUserId(membership)) ||
          users.find((row) => Boolean(row.email && membership.email && row.email.toLowerCase() === membership.email.toLowerCase()));

        const branch = branchMap.get(Number(membership.branchId));
        const active = membership.active !== false && membership.status !== "inactive" && user?.active !== false && user?.status !== "inactive";

        return {
          branchId: Number(membership.branchId) || undefined,
          branchName: branch?.name || `Branch #${membership.branchId || "Unknown"}`,
          userId: userIdOf(user),
          fullName: respectfulName({
            title: user?.title,
            fullName: user?.fullName || user?.name || membership.fullName,
            email: user?.email || membership.email,
          }),
          email: normalizeEmail(user?.email || membership.email),
          phone: normalizeText(user?.phone),
          active,
        };
      })
      .sort((a, b) => a.branchName.localeCompare(b.branchName) || a.fullName.localeCompare(b.fullName));
  }, [memberships, users, branchMap]);

  const filteredAnnouncements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return announcements
      .filter((item) => {
        const status = String(item.status || "sent").toLowerCase();

        if (statusFilter !== "all" && status !== statusFilter) return false;

        if (!query) return true;

        return `${item.title} ${announcementBody(item)} ${item.priority} ${item.status} ${item.channel} ${(item.channels || []).join(" ")}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => announcementDate(b) - announcementDate(a));
  }, [announcements, search, statusFilter]);

  const branchCommunication = useMemo<BranchCommunication[]>(() => {
    return branches.map((branch) => {
      const branchId = Number(branch.id);

      const branchRecipients = recipients.filter((row) => Number(row.branchId) === branchId);
      const branchAnnouncements = announcements.filter((item) => {
        const targets = item.targetBranchIds || [];
        return Number(item.branchId) === branchId || targets.includes(branchId);
      });

      const branchLogs = logs.filter((row) => Number(row.branchId) === branchId);
      const acknowledged = branchRecipients.filter((row) => row.acknowledgedAt).length;
      const delivered = branchRecipients.filter((row) => row.deliveredAt || row.readAt || row.acknowledgedAt).length;
      const unread = Math.max(0, branchRecipients.length - delivered);
      const failedLogs = branchLogs.filter((log) => String(log.status || "").toLowerCase().includes("fail")).length;
      const dates = [
        ...branchAnnouncements.map(announcementDate),
        ...branchRecipients.map((row) => dateValue(row.acknowledgedAt || row.readAt || row.deliveredAt || row.updatedAt || row.createdAt)),
        ...branchLogs.map((row) => dateValue(row.sentAt || row.deliveredAt || row.updatedAt || row.createdAt)),
      ].filter(Boolean);

      const adminCount = branchAdmins.filter((admin) => admin.branchId === branchId && admin.active).length;

      return {
        branchId,
        branchName: branch.name || `Branch #${branch.id}`,
        branchCode: branch.code || "",
        adminCount,
        announcementCount: branchAnnouncements.length,
        sentCount: branchRecipients.length,
        unreadCount: unread,
        acknowledgedCount: acknowledged,
        failedLogs,
        lastMessageAt: dates.length ? Math.max(...dates) : 0,
        acknowledgementRate: branchRecipients.length ? (acknowledged / branchRecipients.length) * 100 : 0,
      };
    }).sort((a, b) => b.lastMessageAt - a.lastMessageAt || a.branchName.localeCompare(b.branchName));
  }, [branches, announcements, recipients, logs, branchAdmins]);

  const filteredBranchCommunication = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return branchCommunication;

    return branchCommunication.filter((row) =>
      `${row.branchName} ${row.branchCode}`.toLowerCase().includes(query)
    );
  }, [branchCommunication, search]);

  const summary = useMemo(() => {
    const sent = announcements.filter((item) => String(item.status || "sent").toLowerCase() === "sent").length;
    const draft = announcements.filter((item) => String(item.status || "").toLowerCase() === "draft").length;
    const scheduled = announcements.filter((item) => String(item.status || "").toLowerCase() === "scheduled").length;
    const urgent = announcements.filter((item) => item.priority === "urgent" || item.priority === "high").length;
    const acknowledged = recipients.filter((row) => row.acknowledgedAt).length;
    const delivered = recipients.filter((row) => row.deliveredAt || row.readAt || row.acknowledgedAt).length;
    const failed = logs.filter((log) => String(log.status || "").toLowerCase().includes("fail")).length;
    const acknowledgementRate = recipients.length ? (acknowledged / recipients.length) * 100 : 0;
    const branchesWithoutAdmin = branches.filter((branch) => !branchAdmins.some((admin) => admin.branchId === branch.id && admin.active)).length;

    return {
      announcements: announcements.length,
      sent,
      draft,
      scheduled,
      urgent,
      recipients: recipients.length,
      delivered,
      acknowledged,
      failed,
      acknowledgementRate,
      branchAdmins: branchAdmins.filter((admin) => admin.active).length,
      branchesWithoutAdmin,
    };
  }, [announcements, recipients, logs, branches, branchAdmins]);

  const breakdowns = useMemo(() => {
    const status: Breakdown[] = [
      { name: "Sent", count: summary.sent },
      { name: "Draft", count: summary.draft },
      { name: "Scheduled", count: summary.scheduled },
      { name: "Urgent / High", count: summary.urgent },
    ].filter((item) => item.count > 0);

    const channels = new Map<string, number>();
    announcements.forEach((item) => {
      const itemChannels = item.channels?.length ? item.channels : [String(item.channel || "in_app")];
      itemChannels.forEach((channel) => channels.set(channel, (channels.get(channel) || 0) + 1));
    });

    const channelBreakdown = Array.from(channels.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const branchBreakdown = branchCommunication
      .map((row) => ({ name: row.branchName, count: row.announcementCount }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);

    return { status, channelBreakdown, branchBreakdown };
  }, [summary, announcements, branchCommunication]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const toggleBranch = (branchId: string) => {
    setForm((current) => {
      const exists = current.selectedBranchIds.includes(branchId);
      return {
        ...current,
        selectedBranchIds: exists
          ? current.selectedBranchIds.filter((id) => id !== branchId)
          : [...current.selectedBranchIds, branchId],
      };
    });
  };

  const toggleChannel = (channel: Channel) => {
    setForm((current) => {
      const exists = current.channels.includes(channel);
      return {
        ...current,
        channels: exists
          ? current.channels.filter((item) => item !== channel)
          : [...current.channels, channel],
      };
    });
  };

  const openCreate = () => {
    setForm({
      ...DEFAULT_FORM,
      selectedBranchIds: branches.map((branch) => String(branch.id || "")).filter(Boolean),
    });
    setMessage("");
    setDrawerOpen(true);
  };

  const validate = () => {
    if (!form.title.trim()) return "Announcement title is required.";
    if (!form.body.trim()) return "Announcement message is required.";
    if (!form.selectedBranchIds.length) return "Select at least one branch.";
    if (!form.channels.length) return "Select at least one communication channel.";
    if (form.status === "scheduled" && !form.publishAt) return "Select a scheduled date and time.";
    return "";
  };

  const saveAnnouncement = async () => {
    const error = validate();

    if (error) {
      setMessage(error);
      return;
    }

    const announcementTable = getTable<Announcement>("announcements");
    const recipientTable = getTable<AnnouncementRecipient>("announcementRecipients");
    const logTable = getTable<CommunicationLog>("communicationLogs");

    if (!announcementTable) {
      setMessage("No announcements table was found in db.ts.");
      return;
    }

    try {
      setSaving(true);

      const selectedBranchIds = form.selectedBranchIds.map(Number).filter(Boolean);
      const publishTime = form.status === "scheduled" ? new Date(form.publishAt).getTime() : now();

      const announcementPayload: Partial<Announcement> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: undefined,
        title: normalizeText(form.title),
        body: form.body.trim(),
        message: form.body.trim(),
        audience: "branch_admins",
        targetRole: "branch_admin",
        targetRoles: ["branch_admin"],
        targetBranchIds: selectedBranchIds,
        channels: form.channels,
        channel: form.channels.join(","),
        priority: form.priority,
        status: form.status,
        publishAt: publishTime,
        sentAt: form.status === "sent" ? now() : undefined,
        createdBy: "school_admin",
        isDeleted: false,
        createdAt: now(),
        updatedAt: now(),
        version: 1,
        synced: "pending" as any,
      };

      const announcementId = await announcementTable.add(announcementPayload as any);

      if (recipientTable) {
        const targetAdmins = branchAdmins.filter((admin) => admin.branchId && selectedBranchIds.includes(admin.branchId) && admin.active);

        for (const admin of targetAdmins) {
          await recipientTable.add({
            accountId,
            schoolId: Number(schoolId),
            branchId: admin.branchId,
            announcementId: Number(announcementId),
            recipientUserId: admin.userId,
            userLocalId: admin.userId,
            role: "branch_admin",
            email: admin.email || undefined,
            phone: admin.phone || undefined,
            status: form.status === "sent" ? "delivered" : form.status,
            deliveredAt: form.status === "sent" ? now() : undefined,
            isDeleted: false,
            createdAt: now(),
            updatedAt: now(),
            version: 1,
            synced: "pending" as any,
          } as any);
        }
      }

      if (logTable) {
        for (const branchId of selectedBranchIds) {
          for (const channel of form.channels) {
            await logTable.add({
              accountId,
              schoolId: Number(schoolId),
              branchId,
              announcementId: Number(announcementId),
              channel,
              status: form.status === "sent" ? "queued" : form.status,
              event: "school_admin_to_branch_admin",
              provider: channel === "in_app" ? "local" : "external",
              sentAt: form.status === "sent" ? now() : undefined,
              isDeleted: false,
              createdAt: now(),
              updatedAt: now(),
              version: 1,
              synced: "pending" as any,
            } as any);
          }
        }
      }

      setDrawerOpen(false);
      await load();
    } catch (error: any) {
      console.error("Failed to save announcement:", error);
      setMessage(error?.message || "Failed to save announcement.");
    } finally {
      setSaving(false);
    }
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="sc-page" style={{ "--sc-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sc-state-card">
          <div className="sc-spinner" />
          <h2>Opening communications...</h2>
          <p>Loading branch admins, announcements and delivery logs.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId || !schoolId) {
    return (
      <main className="sc-page" style={{ "--sc-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sc-state-card">
          <h2>Assigned school required</h2>
          <p>Please sign in with a school-admin account assigned to a school.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="sc-page" style={{ "--sc-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sc-hero">
        <div className="sc-hero-left">
          <div className="sc-hero-icon">📢</div>
          <div className="sc-title-wrap">
            <p>School Communications</p>
            <h2>Communications</h2>
            <span>{activeSchool?.name || "Assigned school"} · School admin to branch admins</span>
          </div>
        </div>

        <div className="sc-hero-actions">
          <button type="button" className="sc-ghost-btn" onClick={load}>Refresh</button>
          <button type="button" className="sc-primary-btn" onClick={openCreate}>New Notice</button>
        </div>
      </section>

      <section className="sc-context-grid">
        <article>
          <div className="sc-context-icon">🧭</div>
          <div>
            <span>Communication hierarchy</span>
            <strong>School admin → branch admins</strong>
            <p>Branch admins handle onward communication to teachers, parents, students and accountants.</p>
          </div>
        </article>

        <article>
          <div className="sc-context-icon">🛡️</div>
          <div>
            <span>Coverage</span>
            <strong>{summary.branchAdmins} active branch admin(s)</strong>
            <p>{summary.branchesWithoutAdmin} branch(es) do not currently have an active branch admin.</p>
          </div>
        </article>
      </section>

      <section className="sc-summary-grid">
        <SummaryCard label="Announcements" value={summary.announcements} icon="📢" />
        <SummaryCard label="Sent" value={summary.sent} icon="✅" positive />
        <SummaryCard label="Drafts" value={summary.draft} icon="📝" />
        <SummaryCard label="Scheduled" value={summary.scheduled} icon="⏰" />
        <SummaryCard label="Acknowledged" value={summary.acknowledged} icon="👍" positive />
        <SummaryCard label="Failed Logs" value={summary.failed} icon="⚠️" warning={summary.failed > 0} />
      </section>

      <section className="sc-toolbar">
        <div className="sc-view-tabs">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>Cards</button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>Table</button>
          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>Analytics</button>
        </div>
        <Chip tone="gray">{viewMode === "table" ? filteredAnnouncements.length : filteredBranchCommunication.length} shown</Chip>
      </section>

      <section className="sc-filter-card">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search branch, title, message, status..."
        />

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
          <option value="all">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="archived">Archived</option>
        </select>

        <button type="button" onClick={openCreate}>New Notice</button>
      </section>

      {viewMode === "analytics" && (
        <>
          <Breakdown title="Announcement Status" items={breakdowns.status} />
          <Breakdown title="Channels Used" items={breakdowns.channelBreakdown} />
          <Breakdown title="Announcements by Branch" items={breakdowns.branchBreakdown} />
        </>
      )}

      {viewMode === "table" && (
        <section className="sc-table-card">
          <div className="sc-section-head">
            <div>
              <p>Announcement Register</p>
              <h3>School-to-Branch Notices</h3>
            </div>
            <Chip tone="blue">Branch admin audience</Chip>
          </div>

          <div className="sc-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Channels</th>
                  <th>Branches</th>
                  <th>Recipients</th>
                  <th>Message</th>
                </tr>
              </thead>

              <tbody>
                {filteredAnnouncements.map((item) => {
                  const branchCount = item.targetBranchIds?.length || (item.branchId ? 1 : 0);
                  const recipientCount = recipients.filter((row) => row.announcementId === item.id).length;

                  return (
                    <tr key={item.id || item.title}>
                      <td>{formatDate(item.sentAt || item.publishAt || item.createdAt)}</td>
                      <td><strong>{item.title || "Untitled"}</strong></td>
                      <td><Chip tone={priorityTone(item.priority)}>{item.priority || "normal"}</Chip></td>
                      <td><Chip tone={statusTone(item.status)}>{item.status || "sent"}</Chip></td>
                      <td>{(item.channels || [item.channel || "in_app"]).join(", ")}</td>
                      <td>{branchCount || "All/Not set"}</td>
                      <td>{recipientCount}</td>
                      <td>{announcementBody(item).slice(0, 90) || "-"}</td>
                    </tr>
                  );
                })}

                {!filteredAnnouncements.length && (
                  <tr>
                    <td colSpan={8}><EmptyCard text="No announcement matches your filters." /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="sc-section">
          <div className="sc-section-head">
            <div>
              <p>Branch Coverage</p>
              <h3>Communication by Branch</h3>
            </div>
            <Chip tone="gray">{filteredBranchCommunication.length} branch(es)</Chip>
          </div>

          <div className="sc-list">
            {filteredBranchCommunication.map((row) => (
              <article key={row.branchId || row.branchName} className="sc-card">
                <div className="sc-card-top">
                  <div className="sc-avatar">🏫</div>
                  <div className="sc-card-main">
                    <h3>{row.branchName}</h3>
                    <p>{row.branchCode || "No code"} · {row.adminCount} active branch admin(s)</p>
                    <div className="sc-chip-row">
                      <Chip tone={row.adminCount > 0 ? "green" : "red"}>{row.adminCount > 0 ? "Admin ready" : "No branch admin"}</Chip>
                      <Chip tone={row.failedLogs > 0 ? "red" : "green"}>{row.failedLogs} failed log(s)</Chip>
                      <Chip tone={row.acknowledgementRate >= 70 ? "green" : row.acknowledgementRate > 0 ? "orange" : "gray"}>{Math.round(row.acknowledgementRate)}% acknowledged</Chip>
                    </div>
                  </div>
                </div>

                <div className="sc-mini-grid">
                  <MiniStat label="Announcements" value={row.announcementCount} />
                  <MiniStat label="Recipients" value={row.sentCount} />
                  <MiniStat label="Unread" value={row.unreadCount} />
                  <MiniStat label="Acknowledged" value={row.acknowledgedCount} />
                  <MiniStat label="Failed Logs" value={row.failedLogs} />
                  <MiniStat label="Last Activity" value={formatDate(row.lastMessageAt)} />
                </div>
              </article>
            ))}

            {!filteredBranchCommunication.length && (
              <EmptyCard text="No branch communication record matches your filters." />
            )}
          </div>
        </section>
      )}

      {drawerOpen && (
        <div className="sc-drawer-layer">
          <button type="button" className="sc-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="sc-drawer">
            <div className="sc-drawer-head">
              <div>
                <p>New Notice</p>
                <h2>School-to-Branch Notice</h2>
                <span>{activeSchool?.name || "Assigned school"}</span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            {message && <section className="sc-message">{message}</section>}

            <section className="sc-form-card">
              <div className="sc-section-head">
                <div>
                  <p>Message</p>
                  <h3>Notice details</h3>
                </div>
              </div>

              <div className="sc-note">
                <strong>Hierarchy reminder</strong>
                <span>This notice goes to branch admins. Branch admins handle teacher, parent, student and accountant communication.</span>
              </div>

              <div className="sc-form-grid">
                <label className="wide">
                  <span>Title</span>
                  <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Example: End of term reporting reminder" />
                </label>

                <label>
                  <span>Priority</span>
                  <select value={form.priority} onChange={(event) => updateForm("priority", event.target.value as Priority)}>
                    {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>

                <label>
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => updateForm("status", event.target.value as FormState["status"])}>
                    <option value="sent">Send / queue now</option>
                    <option value="draft">Save as draft</option>
                    <option value="scheduled">Schedule</option>
                  </select>
                </label>

                {form.status === "scheduled" && (
                  <label className="wide">
                    <span>Schedule Date</span>
                    <input type="datetime-local" value={form.publishAt} onChange={(event) => updateForm("publishAt", event.target.value)} />
                  </label>
                )}

                <label className="wide">
                  <span>Message</span>
                  <textarea value={form.body} onChange={(event) => updateForm("body", event.target.value)} placeholder="Write the instruction or information for branch admins..." />
                </label>
              </div>
            </section>

            <section className="sc-form-card">
              <div className="sc-section-head">
                <div>
                  <p>Branches</p>
                  <h3>Target branches</h3>
                </div>
                <button type="button" className="sc-small-btn" onClick={() => updateForm("selectedBranchIds", branches.map((branch) => String(branch.id || "")).filter(Boolean))}>Select All</button>
              </div>

              <div className="sc-select-grid">
                {branches.map((branch) => {
                  const selected = form.selectedBranchIds.includes(String(branch.id));
                  const adminCount = branchAdmins.filter((admin) => admin.branchId === branch.id && admin.active).length;

                  return (
                    <button key={branch.id} type="button" className={`sc-select-card ${selected ? "active" : ""}`} onClick={() => toggleBranch(String(branch.id))}>
                      <strong>{branch.name || `Branch #${branch.id}`}</strong>
                      <span>{adminCount} branch admin(s)</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="sc-form-card">
              <div className="sc-section-head">
                <div>
                  <p>Channels</p>
                  <h3>Delivery channels</h3>
                </div>
              </div>

              <div className="sc-select-grid channels">
                {CHANNEL_OPTIONS.map((channel) => {
                  const selected = form.channels.includes(channel.value);

                  return (
                    <button key={channel.value} type="button" className={`sc-select-card ${selected ? "active" : ""}`} onClick={() => toggleChannel(channel.value)}>
                      <strong>{channel.icon} {channel.label}</strong>
                      <span>{channel.value === "in_app" ? "Always available" : "Requires provider setup"}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="sc-drawer-actions">
              <button type="button" className="sc-ghost-btn" onClick={() => setDrawerOpen(false)}>Cancel</button>
              <button type="button" className="sc-primary-btn" disabled={saving} onClick={saveAnnouncement}>{saving ? "Saving..." : "Save Notice"}</button>
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

function SummaryCard({
  label,
  value,
  icon,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`sc-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div className="sc-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sc-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`sc-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="sc-empty-card">
      <div className="sc-empty-icon">📢</div>
      <h3>No communication data</h3>
      <p>{text}</p>
    </section>
  );
}

function Breakdown({ title, items }: { title: string; items: Breakdown[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="sc-section">
      <div className="sc-section-head">
        <div>
          <p>Analytics</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{total} total</Chip>
      </div>

      <div className="sc-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="sc-breakdown-card">
            <div className="sc-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone="blue">{item.count}</Chip>
            </div>

            <div className="sc-bar-track">
              <div style={{ width: `${total ? Math.round((item.count / total) * 100) : 0}%` }} />
            </div>

            <div className="sc-chip-row">
              <Chip tone="gray">{total ? Math.round((item.count / total) * 100) : 0}%</Chip>
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} found.`} />}
      </div>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes scSpin { to { transform: rotate(360deg); } }

.sc-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--sc-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.sc-page *,
.sc-page *::before,
.sc-page *::after {
  box-sizing: border-box;
}

.sc-page button,
.sc-page input,
.sc-page select,
.sc-page textarea {
  font: inherit;
  max-width: 100%;
}

.sc-page input,
.sc-page select,
.sc-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111111));
  outline: none;
  font-weight: 750;
}

.sc-page textarea {
  min-height: 150px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}

.sc-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.sc-state-card h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sc-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.sc-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--sc-primary) 18%, transparent);
  border-top-color: var(--sc-primary);
  animation: scSpin .8s linear infinite;
}

.sc-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--sc-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--sc-primary) 7%, var(--card-bg, #fff)) 72%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.sc-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.sc-hero-icon,
.sc-context-icon,
.sc-avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  background: var(--sc-primary);
  color: #fff;
}

.sc-hero-icon {
  width: 48px;
  height: 48px;
  border-radius: 18px;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--sc-primary) 28%, transparent);
  font-size: 22px;
}

.sc-title-wrap {
  min-width: 0;
}

.sc-title-wrap p,
.sc-title-wrap h2,
.sc-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-title-wrap p {
  margin: 0 0 2px;
  color: var(--sc-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sc-title-wrap h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.sc-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sc-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.sc-ghost-btn,
.sc-primary-btn,
.sc-filter-card button,
.sc-drawer-actions button,
.sc-small-btn {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
}

.sc-ghost-btn,
.sc-filter-card button,
.sc-small-btn {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: var(--text, #111111);
}

.sc-primary-btn {
  border: 0;
  background: var(--sc-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--sc-primary) 25%, transparent);
}

.sc-context-grid,
.sc-summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.sc-context-grid article,
.sc-summary-card,
.sc-toolbar,
.sc-filter-card,
.sc-table-card,
.sc-card,
.sc-breakdown-card,
.sc-empty-card,
.sc-form-card {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.sc-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
}

.sc-context-icon {
  width: 42px;
  height: 42px;
  border-radius: 16px;
  font-size: 20px;
}

.sc-context-grid span,
.sc-section-head p {
  display: block;
  color: var(--sc-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sc-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sc-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.sc-summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sc-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.sc-summary-card.positive {
  background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card-bg, var(--surface, #fff)));
}

.sc-summary-card.warning {
  background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card-bg, var(--surface, #fff)));
}

.sc-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--sc-primary) 12%, var(--surface, #fff));
}

.sc-summary-card div:last-child {
  min-width: 0;
}

.sc-summary-card strong,
.sc-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-summary-card strong {
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.sc-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.sc-toolbar,
.sc-filter-card,
.sc-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.sc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sc-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--sc-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sc-view-tabs button {
  min-width: 0;
  min-height: 35px;
  border: 0;
  border-radius: 999px;
  padding: 0 9px;
  background: transparent;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.sc-view-tabs button.active {
  background: var(--sc-primary);
  color: #fff;
}

.sc-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.sc-section {
  margin-top: 16px;
}

.sc-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.sc-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sc-list,
.sc-breakdown-grid,
.sc-select-grid {
  display: grid;
  gap: 10px;
}

.sc-card,
.sc-breakdown-card,
.sc-empty-card,
.sc-form-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.sc-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sc-avatar {
  width: 56px;
  height: 56px;
  border-radius: 19px;
  font-size: 22px;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}

.sc-card-main {
  min-width: 0;
  flex: 1;
}

.sc-card-main h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sc-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.sc-chip-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.sc-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.sc-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.sc-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.sc-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.sc-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.sc-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.sc-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.sc-mini-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.sc-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08));
  overflow: hidden;
}

.sc-mini-stat strong,
.sc-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-mini-stat strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.sc-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.sc-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.sc-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.sc-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--sc-primary);
}

.sc-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sc-table-scroll table {
  width: 100%;
  min-width: 1040px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, #fff));
}

.sc-table-scroll th,
.sc-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  text-align: left;
  vertical-align: top;
  color: var(--text, #111111);
  font-size: 13px;
}

.sc-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--sc-primary) 6%, var(--card-bg, #fff));
}

.sc-table-scroll td strong {
  display: block;
}

.sc-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.sc-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--sc-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.sc-empty-card h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
}

.sc-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.sc-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.sc-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15,23,42,.52);
}

.sc-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 700px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg, #f7f8fb);
  color: var(--text, #111111);
  padding: 14px;
  box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}

.sc-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--bg, #f7f8fb);
}

.sc-drawer-head div {
  min-width: 0;
}

.sc-drawer-head p {
  margin: 0;
  color: var(--sc-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sc-drawer-head h2,
.sc-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sc-drawer-head h2 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.sc-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sc-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #111111);
  font-weight: 1000;
  cursor: pointer;
}

.sc-message {
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(245,158,11,.14);
  color: #f59e0b;
  font-size: 13px;
  font-weight: 900;
}

.sc-note {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--sc-primary) 8%, var(--surface, #fff));
  border: 1px solid color-mix(in srgb, var(--sc-primary) 18%, var(--border, rgba(0,0,0,.10)));
}

.sc-note strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.sc-note span {
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 750;
}

.sc-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
}

.sc-form-grid label {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.sc-form-grid label span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.sc-form-grid .wide {
  grid-column: 1 / -1;
}

.sc-select-grid {
  grid-template-columns: minmax(0, 1fr);
}

.sc-select-card {
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: 4px;
  padding: 11px;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: var(--text, #111111);
  cursor: pointer;
  text-align: left;
}

.sc-select-card.active {
  border-color: color-mix(in srgb, var(--sc-primary) 48%, var(--border, rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--sc-primary) 10%, var(--surface, #fff));
}

.sc-select-card strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.sc-select-card span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

.sc-drawer-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

@media (min-width: 680px) {
  .sc-page { padding: calc(12px * var(--local-density-scale, 1)); }
  .sc-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sc-context-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sc-filter-card { grid-template-columns: minmax(0, 1fr) 190px 150px; }
  .sc-mini-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sc-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sc-select-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sc-select-grid.channels { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .sc-page { padding: calc(16px * var(--local-density-scale, 1)); }
  .sc-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .sc-list, .sc-breakdown-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .sc-page { padding: calc(6px * var(--local-density-scale, 1)); }
  .sc-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .sc-hero-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
  .sc-ghost-btn, .sc-primary-btn { width: 100%; }
  .sc-summary-grid { gap: 6px; }
  .sc-summary-card { padding: 10px; border-radius: 19px; }
  .sc-summary-card strong { font-size: 16px; }
  .sc-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .sc-view-tabs { width: 100%; }
  .sc-card, .sc-empty-card, .sc-breakdown-card, .sc-form-card { border-radius: 20px; padding: 11px; }
  .sc-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .sc-mini-grid { grid-template-columns: repeat(1, minmax(0, 1fr)); }
  .sc-drawer-actions { grid-template-columns: minmax(0, 1fr); }
  .sc-drawer { width: min(96vw, 700px); padding: 12px; }
}
`;
