"use client";

/**
 * app/owner/modules/OwnerAnnouncements.tsx
 * ---------------------------------------------------------
 * ELEEVEON OWNER ANNOUNCEMENTS V3
 * ---------------------------------------------------------
 * Golden Standard Module.
 * Account-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Rebuilt from the Branch Admin Announcements golden pattern while
 * preserving the Owner authority line: owners broadcast only to school admins and branch admins.
 *
 * Golden UI behavior:
 * - no large hero/header block
 * - compact search + inline add + slider filter + More sheet
 * - filters moved into a bottom sheet
 * - compact announcement rows instead of large dashboard cards
 * - table and analytics live under the More menu
 * - summary appears only inside analytics / More, not as a permanent strip
 * - drawer remains mobile-first, theme-safe, and scope-aware
 * - table headers use theme variables for dark mode/system theme readability
 *
 * Owner functionality:
 * - target only school admins and branch admins to preserve the chain of authority
 * - hide old/broad/bottom-level announcements that target teachers, parents, students, accountants, or everyone
 * - optionally narrow targeting by school and branch
 * - estimate recipients from cached admin memberships before saving
 * - create, edit, duplicate, soft delete announcements
 * - replace linked recipients safely on edit
 * - supports in-app, email, SMS and WhatsApp channel flags
 *
 * Tables used:
 * - announcements
 * - announcementRecipients
 * - schools
 * - branches
 * - userMemberships / memberships
 * - users / accountUsers
 *
 * Sync behavior:
 * - createLocal(...) creates announcements and recipients
 * - updateLocal(...) edits existing announcements
 * - softDeleteLocal(...) archives announcements and linked recipients
 * - no manual sync/version fields are written directly here
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { db } from "../lib/db/db";
import { createLocal, softDeleteLocal, updateLocal } from "../lib/sync/syncUtils";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type ToastTone = "success" | "error" | "info";
type DrawerMode = "create" | "edit" | "duplicate";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type Channel = "in_app" | "email" | "sms" | "whatsapp";
type Audience = "school_admins" | "branch_admins";

type FormState = {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  schoolId: string;
  branchId: string;
  priority: "normal" | "high" | "urgent" | "low";
  status: "sent" | "draft" | "scheduled";
  publishAt: string;
  channels: Channel[];
};

const AUDIENCES: { value: Audience; label: string; note: string }[] = [
  { value: "school_admins", label: "School Admins", note: "School-level admins only" },
  { value: "branch_admins", label: "Branch Admins", note: "Branch administrators only" },
];

const CHANNELS: Channel[] = ["in_app", "email", "sms", "whatsapp"];

const emptyForm: FormState = {
  id: 0,
  title: "",
  body: "",
  audience: "school_admins",
  schoolId: "all",
  branchId: "all",
  priority: "normal",
  status: "sent",
  publishAt: "",
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
  return row?.id ?? row?.localId ?? row?.cloudId ?? row?.payload?.id ?? row?.payload?.localId;
}

function cleanId(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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

function rowName(row?: AnyRow) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
}

function normalizeAudience(value: any): Audience {
  const raw = String(value || "school_admins").toLowerCase();
  return AUDIENCES.some((item) => item.value === raw) ? (raw as Audience) : "school_admins";
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

function audienceLabel(value?: any) {
  const key = normalizeAudience(value);
  return AUDIENCES.find((item) => item.value === key)?.label || key.replaceAll("_", " ");
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

function targetRolesForAudience(audience: Audience) {
  if (audience === "school_admins") return ["admin", "school_admin"];
  if (audience === "branch_admins") return ["branch_admin"];
  return [];
}

const OWNER_ALLOWED_AUDIENCES = new Set<Audience>(["school_admins", "branch_admins"]);
const OWNER_ALLOWED_ROLES = new Set(["admin", "school_admin", "branch_admin"]);

function normalizeRole(value: any) {
  return String(value || "").trim().toLowerCase();
}

function roleListFrom(row: AnyRow) {
  const rawRoles = Array.isArray(row?.targetRoles)
    ? row.targetRoles
    : String(row?.targetRoles || row?.targetRole || row?.role || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return rawRoles.map(normalizeRole).filter(Boolean);
}

function isOwnerCreatedAnnouncement(row: AnyRow) {
  const creator = normalizeRole(row?.createdByRole || row?.createdBy || row?.senderRole || row?.authorRole);
  return creator === "owner";
}

function isOwnerAuthorityAudience(row: AnyRow) {
  const audience = String(row?.audience || "").toLowerCase();
  const targetRole = String(row?.targetRole || "").toLowerCase();

  if (OWNER_ALLOWED_AUDIENCES.has(audience as Audience)) return true;
  if (targetRole === "school_admins" || targetRole === "branch_admins") return true;

  const roles = roleListFrom(row);
  return roles.length > 0 && roles.every((role) => OWNER_ALLOWED_ROLES.has(role));
}

function isOwnerAuthorityAnnouncement(row: AnyRow, accountId?: string | null) {
  if (!sameAccount(row, accountId)) return false;
  if (!isOwnerCreatedAnnouncement(row)) return false;
  if (row?.accountWide === true) return false;
  return isOwnerAuthorityAudience(row);
}

function isOwnerAuthorityRecipient(row: AnyRow, authorityAnnouncementIds: Set<number>, accountId?: string | null) {
  if (!sameAccount(row, accountId)) return false;
  const announcementId = cleanId(row?.announcementId || row?.announcementLocalId || row?.announcementCloudId);
  if (announcementId && authorityAnnouncementIds.size && !authorityAnnouncementIds.has(announcementId)) return false;
  const role = normalizeRole(row?.role || row?.recipientRole || row?.targetRole);
  const audience = normalizeAudience(row?.audience || row?.targetRole);
  return OWNER_ALLOWED_ROLES.has(role) || OWNER_ALLOWED_AUDIENCES.has(audience);
}

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
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

export default function OwnerAnnouncementsPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("cards");
  const [schools, setSchools] = useState<AnyRow[]>([]);
  const [branches, setBranches] = useState<AnyRow[]>([]);
  const [memberships, setMemberships] = useState<AnyRow[]>([]);
  const [users, setUsers] = useState<AnyRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnyRow[]>([]);
  const [recipients, setRecipients] = useState<AnyRow[]>([]);

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
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast((current) => (current?.message === message ? null : current)), 4200);
  };

  async function load() {
    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const [schoolRows, branchRows, membershipRows, fallbackMembershipRows, userRows, fallbackUserRows, announcementRows, recipientRows] = await Promise.all([
        safeArray("schools"),
        safeArray("branches"),
        safeArray("userMemberships"),
        safeArray("memberships"),
        safeArray("users"),
        safeArray("accountUsers"),
        safeArray("announcements"),
        safeArray("announcementRecipients"),
      ]);

      const ownerSchools = (schoolRows as AnyRow[]).filter((row) => sameAccount(row, accountId));
      const schoolIds = new Set(ownerSchools.map((school) => Number(idOf(school))).filter(Boolean));
      const ownerBranches = (branchRows as AnyRow[]).filter((row) => sameAccount(row, accountId)).filter((row) => !schoolIds.size || schoolIds.has(Number(row.schoolId)));
      const mergedMemberships = (membershipRows as AnyRow[]).length ? (membershipRows as AnyRow[]) : (fallbackMembershipRows as AnyRow[]);
      const mergedUsers = (userRows as AnyRow[]).length ? (userRows as AnyRow[]) : (fallbackUserRows as AnyRow[]);

      const ownerAuthorityAnnouncements = (announcementRows as AnyRow[])
        .filter((row) => isOwnerAuthorityAnnouncement(row, accountId))
        .sort((a, b) => n(b.sentAt || b.publishAt || b.createdAt) - n(a.sentAt || a.publishAt || a.createdAt));
      const ownerAuthorityAnnouncementIds = new Set(
        ownerAuthorityAnnouncements
          .map((row) => cleanId(row.id || row.localId))
          .filter(Boolean)
      );

      setSchools(ownerSchools);
      setBranches(ownerBranches);
      setMemberships(mergedMemberships.filter((row) => sameAccount(row, accountId)));
      setUsers(mergedUsers.filter((row) => sameAccount(row, accountId)));
      setAnnouncements(ownerAuthorityAnnouncements);
      setRecipients(
        (recipientRows as AnyRow[]).filter((row) =>
          isOwnerAuthorityRecipient(row, ownerAuthorityAnnouncementIds, accountId)
        )
      );
    } catch (error) {
      console.error("Failed to load owner announcements:", error);
      showToast("error", "Failed to load owner announcements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, accountLoading, settingsLoading]);

  const targetSchools = useMemo(() => {
    if (form.schoolId === "all") return schools;
    return schools.filter((school) => String(idOf(school)) === String(form.schoolId));
  }, [form.schoolId, schools]);

  const targetBranches = useMemo(() => {
    const selectedSchoolIds = new Set(targetSchools.map((school) => Number(idOf(school))).filter(Boolean));
    return branches.filter((branch) => {
      if (form.schoolId !== "all" && !selectedSchoolIds.has(Number(branch.schoolId))) return false;
      if (form.branchId !== "all" && String(idOf(branch)) !== String(form.branchId)) return false;
      return true;
    });
  }, [branches, form.branchId, form.schoolId, targetSchools]);

  const candidateRecipients = useMemo(() => {
    const roles = targetRolesForAudience(form.audience).map((role) => role.toLowerCase());
    const schoolIds = new Set(targetSchools.map((school) => Number(idOf(school))).filter(Boolean));
    const branchIds = new Set(targetBranches.map((branch) => Number(idOf(branch))).filter(Boolean));

    const rows = memberships.filter((membership) => {
      const role = String(membership.role || membership.roleName || "").toLowerCase();
      if (!roles.includes(role)) return false;
      if (form.schoolId !== "all" && !schoolIds.has(Number(membership.schoolId))) return false;
      if (form.branchId !== "all" && !branchIds.has(Number(membership.branchId))) return false;
      return true;
    });

    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = String(row.userId || row.userLocalId || row.accountUserId || row.email || `${row.role}-${row.schoolId}-${row.branchId}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [form.audience, form.branchId, form.schoolId, memberships, targetBranches, targetSchools]);

  const estimatedRecipients = candidateRecipients.length;

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
      schools: schools.length,
      branches: branches.length,
    }),
    [announcements, branches.length, filtered.length, recipients.length, schools.length]
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
      { label: "High/Urgent", value: summary.urgent },
    ],
    [summary]
  );

  const activeFilterCount = useMemo(() => [status, audienceFilter, priorityFilter].filter((item) => item !== "all").length, [audienceFilter, priorityFilter, status]);

  function openCreate() {
    setDrawerMode("create");
    setForm(emptyForm);
    setMessage("");
    setDrawer(true);
  }

  function openEdit(announcement: AnyRow) {
    setDrawerMode("edit");
    setForm({
      id: cleanId(announcement.id || announcement.localId),
      title: String(announcement.title || ""),
      body: String(announcement.body || announcement.message || ""),
      audience: normalizeAudience(announcement.audience || announcement.targetRole),
      schoolId: announcement.targetSchoolIds?.length === 1 ? String(announcement.targetSchoolIds[0]) : announcement.schoolId ? String(announcement.schoolId) : "all",
      branchId: announcement.targetBranchIds?.length === 1 ? String(announcement.targetBranchIds[0]) : announcement.branchId ? String(announcement.branchId) : "all",
      priority: String(announcement.priority || "normal") as FormState["priority"],
      status: String(announcement.status || "sent") as FormState["status"],
      publishAt: announcement.status === "scheduled" && announcement.publishAt ? toLocalDateTime(announcement.publishAt) : "",
      channels: normalizeChannels(announcement.channels || announcement.channel),
    });
    setMessage("");
    setDrawer(true);
  }

  function duplicateAnnouncement(announcement: AnyRow) {
    setDrawerMode("duplicate");
    setForm({
      id: 0,
      title: `${String(announcement.title || "Announcement")} Copy`,
      body: String(announcement.body || announcement.message || ""),
      audience: normalizeAudience(announcement.audience || announcement.targetRole),
      schoolId: announcement.targetSchoolIds?.length === 1 ? String(announcement.targetSchoolIds[0]) : "all",
      branchId: announcement.targetBranchIds?.length === 1 ? String(announcement.targetBranchIds[0]) : "all",
      priority: String(announcement.priority || "normal") as FormState["priority"],
      status: "draft",
      publishAt: "",
      channels: normalizeChannels(announcement.channels || announcement.channel),
    });
    setMessage("");
    setDrawer(true);
  }

  function toggleChannel(channel: Channel) {
    setForm((current) => {
      const channels = current.channels.includes(channel) ? current.channels.filter((item) => item !== channel) : [...current.channels, channel];
      return { ...current, channels: channels.length ? channels : ["in_app"] };
    });
  }

  function validate() {
    if (!accountId) return "Sign in before creating announcements.";
    if (!form.title.trim()) return "Announcement title is required.";
    if (!form.body.trim()) return "Announcement message is required.";
    if (form.status === "scheduled" && !form.publishAt) return "Choose a publish date and time for scheduled announcements.";
    if (!estimatedRecipients) return "No matching school admin or branch admin recipients found for this audience and scope.";
    return "";
  }

  async function replaceRecipients(announcementId: number, targetSchoolIds: number[], targetBranchIds: number[], targetRoles: string[], createdAt: number) {
    const linked = recipients.filter((recipient) => Number(recipient.announcementId) === Number(announcementId));
    for (const recipient of linked) {
      const recipientId = cleanId(recipient.id || recipient.localId);
      if (recipientId) await softDeleteLocal("announcementRecipients" as any, recipientId);
    }

    const roleScope = targetRoles.length ? targetRoles : ["all"];
    const schoolScope = targetSchoolIds.length ? targetSchoolIds : [0];
    const branchScope = targetBranchIds.length ? targetBranchIds : [0];

    for (const schoolId of schoolScope) {
      for (const branchId of branchScope) {
        for (const role of roleScope) {
          await createLocal("announcementRecipients" as any, {
            accountId: String(accountId),
            schoolId,
            branchId,
            announcementId,
            role,
            audience: form.audience,
            channels: form.channels,
            channel: form.channels.join(","),
            status: form.status === "sent" ? "delivered" : form.status,
            deliveredAt: form.status === "sent" ? createdAt : undefined,
            isDeleted: false,
          } as AnyRow);
        }
      }
    }
  }

  async function save() {
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }

    setSaving(true);
    try {
      const targetRoles = targetRolesForAudience(form.audience);
      const targetSchoolIds = form.schoolId === "all" ? schools.map((school) => Number(idOf(school))).filter(Boolean) : [Number(form.schoolId)].filter(Boolean);
      const targetBranchIds = form.branchId === "all" ? targetBranches.map((branch) => Number(idOf(branch))).filter(Boolean) : [Number(form.branchId)].filter(Boolean);
      const createdAt = now();
      const publishAt = form.status === "scheduled" && form.publishAt ? new Date(form.publishAt).getTime() : createdAt;

      const payload: AnyRow = {
        accountId: String(accountId),
        schoolId: targetSchoolIds[0] || 0,
        branchId: targetBranchIds[0] || 0,
        title: form.title.trim(),
        body: form.body.trim(),
        message: form.body.trim(),
        audience: form.audience,
        accountWide: false,
        targetRole: targetRoles[0] || "all",
        targetRoles,
        targetSchoolIds,
        targetBranchIds,
        channels: form.channels,
        channel: form.channels.join(","),
        priority: form.priority,
        status: form.status,
        publishAt,
        sentAt: form.status === "sent" ? createdAt : undefined,
        createdBy: "owner",
        createdByRole: "owner",
        active: true,
        isDeleted: false,
      };

      let announcementId = cleanId(form.id);
      if (drawerMode === "edit" && announcementId) {
        await updateLocal("announcements" as any, announcementId, payload);
      } else {
        const created = (await createLocal("announcements" as any, payload)) as AnyRow | number | undefined;
        announcementId = Number(typeof created === "number" ? created : (created as AnyRow)?.id || 0);
      }

      if (announcementId) await replaceRecipients(announcementId, targetSchoolIds, targetBranchIds, targetRoles, createdAt);

      setDrawer(false);
      setForm(emptyForm);
      showToast("success", drawerMode === "edit" ? "Announcement updated." : drawerMode === "duplicate" ? "Announcement duplicated." : "Announcement saved.");
      await load();
    } catch (error: any) {
      console.error("Failed to save owner announcement:", error);
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
      console.error("Failed to delete owner announcement:", error);
      showToast("error", error?.message || "Failed to delete announcement.");
    }
  }

  const clearFilters = () => {
    setStatus("all");
    setAudienceFilter("all");
    setPriorityFilter("all");
  };

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening owner announcements..." text="Loading account-wide communication records." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing owner announcements." />;
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

      <section className="ba-search-card" aria-label="Owner announcements search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search announcements..." aria-label="Search announcements" />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="New owner announcement">+</button>

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
          <article className="ba-analysis"><span>Account Scope</span><strong>{summary.schools}</strong><p>{summary.branches} branch record(s) available for owner targeting.</p></article>
          <article className="ba-analysis"><span>Recipients</span><strong>{summary.recipients}</strong><p>Recipient rows generated from account-wide announcements.</p></article>
        </section>
      )}

      {view === "table" && <TableView rows={filtered} openEdit={openEdit} duplicateAnnouncement={duplicateAnnouncement} deleteAnnouncement={deleteAnnouncement} />}

      {view === "cards" && (
        <section className="ba-list">
          {filtered.map((announcement) => (
            <AnnouncementListItem
              key={String(idOf(announcement))}
              announcement={announcement}
              openEdit={openEdit}
              duplicateAnnouncement={duplicateAnnouncement}
              deleteAnnouncement={deleteAnnouncement}
            />
          ))}

          {!filtered.length && <Empty icon="📣" title="No announcements found" text="Create owner-level announcements for school admins or branch admins only." />}
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
          schools={schools}
          targetBranches={targetBranches}
          estimatedRecipients={estimatedRecipients}
          targetSchoolsCount={targetSchools.length}
          targetBranchesCount={targetBranches.length}
          saving={saving}
          message={message}
          toggleChannel={toggleChannel}
          save={save}
          onClose={() => setDrawer(false)}
        />
      )}
    </main>
  );
}

function toLocalDateTime(value?: number | string) {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
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

function AnnouncementListItem({ announcement, openEdit, duplicateAnnouncement, deleteAnnouncement }: { announcement: AnyRow; openEdit: (row: AnyRow) => void; duplicateAnnouncement: (row: AnyRow) => void; deleteAnnouncement: (row: AnyRow) => void }) {
  return (
    <article className="announcement-row">
      <div className="announcement-avatar">📣</div>
      <span className="announcement-main">
        <strong>{announcement.title || "Untitled announcement"}</strong>
        <small>{dateLabel(announcement.sentAt || announcement.publishAt || announcement.createdAt)} · {audienceLabel(announcement.audience || announcement.targetRole)}</small>
        <em>{text(announcement.body || announcement.message, "No message").slice(0, 118)}</em>
      </span>
      <span className="announcement-side">
        <span className={`status-dot-mini ${statusTone(announcement.status)}`} title={String(announcement.status || "sent")} />
        <button type="button" onClick={() => openEdit(announcement)} aria-label="Edit announcement">✎</button>
        <button type="button" onClick={() => duplicateAnnouncement(announcement)} aria-label="Duplicate announcement">⧉</button>
        <button type="button" className="danger" onClick={() => deleteAnnouncement(announcement)} aria-label="Delete announcement">⌫</button>
      </span>
    </article>
  );
}

function TableView({ rows, openEdit, duplicateAnnouncement, deleteAnnouncement }: { rows: AnyRow[]; openEdit: (row: AnyRow) => void; duplicateAnnouncement: (row: AnyRow) => void; deleteAnnouncement: (row: AnyRow) => void }) {
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
              <th>Scope</th>
              <th>Message</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((announcement) => (
              <tr key={String(idOf(announcement))}>
                <td><strong>{announcement.title || "Untitled"}</strong><span>{announcement.createdByRole || "owner"}</span></td>
                <td>{dateLabel(announcement.sentAt || announcement.publishAt || announcement.createdAt)}</td>
                <td>{audienceLabel(announcement.audience || announcement.targetRole)}</td>
                <td><Chip tone={priorityTone(announcement.priority)}>{announcement.priority || "normal"}</Chip></td>
                <td><Chip tone={statusTone(announcement.status)}>{announcement.status || "sent"}</Chip></td>
                <td>{scopeLabel(announcement)}</td>
                <td>{text(announcement.body || announcement.message).slice(0, 120)}</td>
                <td>
                  <div className="ba-table-actions">
                    <button type="button" onClick={() => openEdit(announcement)}>Edit</button>
                    <button type="button" onClick={() => duplicateAnnouncement(announcement)}>Copy</button>
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

function scopeLabel(row: AnyRow) {
  const schools = Array.isArray(row.targetSchoolIds) ? row.targetSchoolIds.length : row.schoolId ? 1 : 0;
  const branches = Array.isArray(row.targetBranchIds) ? row.targetBranchIds.length : row.branchId ? 1 : 0;
  if (row.accountWide) return "Account-wide";
  if (schools && branches) return `${schools} school(s), ${branches} branch(es)`;
  if (schools) return `${schools} school(s)`;
  if (branches) return `${branches} branch(es)`;
  return "Account scope";
}

function FilterSheet({ status, audienceFilter, priorityFilter, setStatus, setAudienceFilter, setPriorityFilter, clearFilters, onClose }: { status: string; audienceFilter: string; priorityFilter: string; setStatus: (value: string) => void; setAudienceFilter: (value: string) => void; setPriorityFilter: (value: string) => void; clearFilters: () => void; onClose: () => void }) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div><h2>Filters</h2><p>Choose announcement status, admin audience, and priority.</p></div>
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

function MoreSheet({ view, summary, setView, onRefresh, onClose }: { view: ViewMode; summary: { total: number; shown: number; sent: number; draft: number; scheduled: number; urgent: number; recipients: number; schools: number; branches: number }; setView: (value: ViewMode) => void; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div><h2>More</h2><p>Views and refresh actions are here to keep the page compact.</p></div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>
        <div className="ba-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>{summary.shown}/{summary.total} announcements shown</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense laptop-friendly owner records</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.schools} schools · {summary.branches} branches · {summary.recipients} recipients</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local owner announcements</small></button>
        </div>
      </section>
    </div>
  );
}

function AnnouncementDrawer({ mode, form, setForm, schools, targetBranches, estimatedRecipients, targetSchoolsCount, targetBranchesCount, saving, message, toggleChannel, save, onClose }: { mode: DrawerMode; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; schools: AnyRow[]; targetBranches: AnyRow[]; estimatedRecipients: number; targetSchoolsCount: number; targetBranchesCount: number; saving: boolean; message: string; toggleChannel: (channel: Channel) => void; save: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ba-drawer-layer" role="dialog" aria-modal="true">
      <button className="ba-drawer-overlay" type="button" onClick={onClose} aria-label="Close drawer" />
      <aside className="ba-drawer">
        <div className="ba-drawer-head">
          <div><p>{mode === "edit" ? "Edit Owner Announcement" : mode === "duplicate" ? "Duplicate Announcement" : "New Owner Announcement"}</p><h2>Authority Broadcast</h2><span>{estimatedRecipients} estimated recipient(s)</span></div>
          <button type="button" onClick={onClose} aria-label="Close announcement form">✕</button>
        </div>

        {message && <section className="ba-inline-error">{message}</section>}

        <section className="ba-form-card">
          <div className="ba-form-grid">
            <label className="wide"><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Announcement title" /></label>
            <label><span>Audience</span><select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as Audience })}>{AUDIENCES.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}</select></label>
            <label><span>School Scope</span><select value={form.schoolId} onChange={(event) => setForm({ ...form, schoolId: event.target.value, branchId: "all" })}><option value="all">All Schools</option>{schools.map((school) => <option key={String(idOf(school))} value={String(idOf(school))}>{rowName(school)}</option>)}</select></label>
            <label><span>Branch Scope</span><select value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}><option value="all">All Branches</option>{targetBranches.map((branch) => <option key={String(idOf(branch))} value={String(idOf(branch))}>{rowName(branch)}</option>)}</select></label>
            <label><span>Priority</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as FormState["priority"] })}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label>
            <label><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState["status"] })}><option value="sent">Send now</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option></select></label>
            {form.status === "scheduled" && <label><span>Publish At</span><input type="datetime-local" value={form.publishAt} onChange={(event) => setForm({ ...form, publishAt: event.target.value })} /></label>}
            <label className="wide"><span>Message</span><textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Write the message..." /></label>
          </div>

          <div className="ba-channel-row">
            {CHANNELS.map((channel) => <button key={channel} type="button" className={form.channels.includes(channel) ? "active" : ""} onClick={() => toggleChannel(channel)}>{channel.replaceAll("_", " ")}</button>)}
          </div>

          <p className="ba-hint">Audience: {audienceLabel(form.audience)} · Schools: {form.schoolId === "all" ? targetSchoolsCount : 1} · Branches: {form.branchId === "all" ? targetBranchesCount : 1} · Recipients: {estimatedRecipients}</p>
        </section>

        <div className="ba-drawer-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Saving..." : mode === "edit" ? "Update" : form.status === "sent" ? "Send" : "Save"}</button></div>
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
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page textarea{min-height:130px;padding:12px;resize:vertical;line-height:1.55}.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.announcement-row,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal,.ba-form-card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}.ba-toast.error,.ba-inline-error{background:rgba(239,68,68,.12);color:#991b1b}.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.ba-inline-error{padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;margin-bottom:10px}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{flex:0 0 42px;border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-list{display:grid;gap:7px;margin-top:10px}.announcement-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.announcement-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:22px}.announcement-main,.announcement-main strong,.announcement-main small,.announcement-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.announcement-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.announcement-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.announcement-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.announcement-side{display:flex;align-items:center;gap:5px}.announcement-side button{width:31px;height:31px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:12px;font-weight:1000;cursor:pointer}.announcement-side button.danger{color:#991b1b;background:color-mix(in srgb,#dc2626 7%,var(--surface,#fff));border-color:color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)))}.status-dot-mini{width:10px;height:10px;display:inline-block;border-radius:999px;background:var(--muted,#64748b);box-shadow:0 0 0 4px color-mix(in srgb,currentColor 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.red{background:#ef4444}.status-dot-mini.blue{background:#3b82f6}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-sheet-backdrop,.ba-drawer-layer{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ba-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.ba-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.ba-sheet-head,.ba-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ba-sheet-head h2,.ba-drawer-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p,.ba-drawer-head p,.ba-drawer-head span{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ba-sheet-head button,.ba-drawer-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ba-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b,.ba-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-menu-list button b{font-size:13px;font-weight:1000}.ba-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 8%,var(--surface,#fff))}.ba-sheet-actions,.ba-drawer-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ba-sheet-actions button,.ba-drawer-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-sheet-actions button.primary,.ba-drawer-actions button.primary{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}.ba-drawer-layer{place-items:stretch end;padding:0}.ba-drawer-overlay{position:absolute;inset:0;border:0;background:transparent}.ba-drawer{position:relative;z-index:1;width:min(720px,100%);height:100dvh;overflow-y:auto;background:var(--card-bg,var(--surface,#fff));border-left:1px solid var(--border,rgba(0,0,0,.10));padding:14px;box-shadow:-28px 0 80px rgba(15,23,42,.28)}.ba-form-card{padding:12px;border-radius:24px}.ba-form,.ba-form-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form label,.ba-form-grid label{display:grid;gap:6px;min-width:0}.ba-form span,.ba-form-grid span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-form .wide,.ba-form-grid .wide{grid-column:1/-1}.ba-channel-row{display:flex;gap:7px;overflow-x:auto;margin-top:10px;scrollbar-width:none}.ba-channel-row button{flex:0 0 auto;min-height:34px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 11px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;cursor:pointer;text-transform:capitalize}.ba-channel-row button.active{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff}.ba-hint{margin:9px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:800}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis,.ba-table-card,.ba-empty{padding:13px;border-radius:24px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-table-card{margin-top:10px}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ba-table-scroll table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.ba-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;flex-wrap:nowrap;gap:7px;width:100%;overflow-x:auto;scrollbar-width:none}.ba-table-actions::-webkit-scrollbar{display:none}.ba-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 10px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;cursor:pointer;white-space:nowrap}.ba-table-actions button:first-child{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-delete,.ba-table-actions button.ba-delete{color:#991b1b;background:color-mix(in srgb,#dc2626 7%,var(--surface,#fff));border-color:color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)))}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}@media (min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ba-search-card{grid-template-columns:minmax(0,1fr) 48px 48px 48px}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.announcement-row{border-radius:24px;padding:12px}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form,.ba-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop{place-items:center;padding:18px}.ba-sheet{border-radius:28px;padding:18px}.ba-drawer{padding:18px}}@media (min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ba-search-card,.ba-list,.ba-analysis-grid,.ba-table-card,.ba-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ba-form-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:520px){.ba-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:40px;height:40px}.announcement-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.announcement-side{grid-column:1/-1;justify-content:flex-end}.ba-sheet{border-radius:24px 24px 18px 18px;padding:12px}.ba-sheet-actions,.ba-drawer-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ba-sheet-actions button,.ba-drawer-actions button{width:100%}.ba-drawer{width:100%;padding:12px}.ba-channel-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.ba-channel-row button{width:100%}}
`;
