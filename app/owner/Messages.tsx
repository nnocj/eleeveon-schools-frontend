"use client";

/**
 * app/owner/modules/OwnerMessages.tsx
 * ---------------------------------------------------------
 * ELEEVEON OWNER MESSAGES V3
 * ---------------------------------------------------------
 * Golden Standard Module.
 * Account-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Rebuilt from the Branch Admin Messages golden standard:
 * - no old hero/header block
 * - compact search + inline compose + slider filter + More menu
 * - folder/role filters moved into a bottom sheet
 * - cards/list view uses compact golden rows instead of large dashboard cards
 * - table and analytics live under the More menu
 * - thread actions live in an action sheet to save vertical space
 * - compose drawer targets only school admins, branch admins and accountants with school/branch context and backend-hydrated names
 * - archive, restore, reply and soft-delete use syncUtils where available
 * - table headers and all surfaces use ba-* theme variables for dark mode
 *
 * Tables used:
 * - messageThreads
 * - messages
 * - users / accountUsers, hydrated from platform API when available
 * - userMemberships / memberships, hydrated from platform API when available
 * - schools
 * - branches
 *
 * Sync behavior:
 * - createLocal(...) creates threads and messages
 * - updateLocal(...) archives/restores/replies while preserving sync metadata
 * - softDeleteLocal(...) soft-deletes threads and linked messages
 * - no manual synced/version/updatedAt fields are written directly here
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { db } from "../lib/db/db";
import { apiRequest } from "../lib/platformApi";
import { createLocal, softDeleteLocal, updateLocal } from "../lib/sync/syncUtils";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type FolderFilter = "inbox" | "sent" | "archived" | "all";
type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type Contact = {
  key: string;
  id: string | number;
  name: string;
  role: string;
  roleGroup: "school_admin" | "branch_admin" | "accountant";
  email?: string;
  phone?: string;
  schoolId?: number;
  branchId?: number;
  schoolName?: string;
  branchName?: string;
};

type ComposeState = {
  subject: string;
  body: string;
  recipientUserId: string;
  roleFilter: string;
  schoolFilter: string;
  branchFilter: string;
};

const OWNER_CONTACT_ROLES = ["admin", "school_admin", "branch_admin", "accountant"];
const ROLE_OPTIONS = [
  { value: "all", label: "All authority contacts" },
  { value: "school_admin", label: "School admins" },
  { value: "branch_admin", label: "Branch admins" },
  { value: "accountant", label: "Accountants" },
];

const emptyForm: ComposeState = {
  subject: "",
  body: "",
  recipientUserId: "",
  roleFilter: "all",
  schoolFilter: "all",
  branchFilter: "all",
};

const now = () => Date.now();

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idOf(row?: AnyRow) {
  return row?.id ?? row?.localId ?? row?.cloudId;
}

function cleanId(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function sameId(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function userIdOf(row?: AnyRow) {
  return row?.id ?? row?.localId ?? row?.userId ?? row?.accountUserId;
}

function membershipUserId(row?: AnyRow) {
  return row?.userLocalId ?? row?.userId ?? row?.accountUserId ?? row?.accountUserLocalId;
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

function rowName(row?: AnyRow, fallback = "Unnamed") {
  return text(
    row?.fullName ||
      row?.displayName ||
      row?.name ||
      [row?.firstName, row?.middleName, row?.lastName].filter(Boolean).join(" ") ||
      row?.title ||
      row?.label ||
      row?.email ||
      row?.phone,
    fallback
  );
}

function emailOf(row?: AnyRow) {
  return String(row?.email || row?.user?.email || row?.appUser?.email || row?.accountUser?.email || "").trim();
}

function phoneOf(row?: AnyRow) {
  return String(row?.phone || row?.user?.phone || row?.appUser?.phone || row?.accountUser?.phone || "").trim();
}

function userFromMembership(row?: AnyRow) {
  return row?.user || row?.appUser || row?.accountUser || row?.profile || row?.payload?.user || null;
}

function displayNameForContact(user: AnyRow | undefined, membership: AnyRow, role: string) {
  const nestedUser = userFromMembership(membership);
  const fallback = roleLabel(role);
  return text(
    rowName(user, "") ||
      rowName(nestedUser, "") ||
      rowName(membership, "") ||
      emailOf(user) ||
      emailOf(nestedUser) ||
      emailOf(membership),
    fallback
  );
}

function roleGroupOf(value: any): "school_admin" | "branch_admin" | "accountant" | "other" {
  const role = String(value || "").toLowerCase();
  if (role === "admin" || role === "school_admin") return "school_admin";
  if (role === "branch_admin") return "branch_admin";
  if (role === "accountant") return "accountant";
  return "other";
}

function roleLabel(value: any) {
  const group = roleGroupOf(value);
  if (group === "school_admin") return "School admin";
  if (group === "branch_admin") return "Branch admin";
  if (group === "accountant") return "Accountant";
  return text(value, "user").replaceAll("_", " ");
}

function roleFilterMatches(value: any, filter: string) {
  return filter === "all" || roleGroupOf(value) === filter;
}

function dateLabel(value?: number | string | null) {
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

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function normalizeArray(payload: any): AnyRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.memberships)) return payload.memberships;
  if (Array.isArray(payload?.data?.users)) return payload.data.users;
  if (Array.isArray(payload?.data?.memberships)) return payload.data.memberships;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

async function apiArray(paths: string[]): Promise<AnyRow[]> {
  for (const path of paths) {
    try {
      const payload = await apiRequest(path);
      const rows = normalizeArray(payload);
      if (rows.length) return rows;
    } catch {
      // Offline-first page: silently fall back to Dexie cache if the backend route is unavailable.
    }
  }
  return [];
}

function mergeByKey(rows: AnyRow[], keyFn: (row: AnyRow) => string) {
  const map = new Map<string, AnyRow>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const existing = map.get(key);
    map.set(key, { ...(existing || {}), ...row });
  }
  return Array.from(map.values());
}

async function resolveOwnerContext(accountId?: string | null) {
  const [memberships, users] = await Promise.all([
    safeArray("userMemberships").then(async (rows) => (rows.length ? rows : safeArray("memberships"))),
    safeArray("users").then(async (rows) => (rows.length ? rows : safeArray("accountUsers"))),
  ]);

  const activeEmail =
    typeof window !== "undefined"
      ? String(localStorage.getItem("email") || localStorage.getItem("userEmail") || "").toLowerCase()
      : "";

  const membership = (memberships as AnyRow[]).find((row) =>
    ["owner", "admin", "super_admin"].includes(String(row.role || "").toLowerCase()) &&
    sameAccount(row, accountId)
  );

  const user = (users as AnyRow[]).find(
    (row) =>
      sameId(userIdOf(row), membershipUserId(membership)) ||
      Boolean(activeEmail && String(row.email || "").toLowerCase() === activeEmail) ||
      Boolean(membership?.email && String(row.email || "").toLowerCase() === String(membership.email).toLowerCase())
  );

  return {
    owner: { ...(membership || {}), ...(user || {}), role: membership?.role || "owner" },
    user,
    membership,
  };
}

function threadTitle(thread: AnyRow) {
  return text(thread.subject || thread.title, "No subject");
}

function folderOf(thread: AnyRow): FolderFilter {
  const folder = String(thread.folder || "inbox").toLowerCase();
  if (["inbox", "sent", "archived"].includes(folder)) return folder as FolderFilter;
  return "inbox";
}

function latestTime(thread: AnyRow) {
  return n(thread.lastMessageAt || thread.updatedAt || thread.createdAt);
}

function messagePreview(value: any) {
  return text(value, "No message preview.");
}

function threadScopeLabel(thread: AnyRow) {
  const roles = Array.isArray(thread.participantRoles)
    ? thread.participantRoles.map(roleLabel).filter(Boolean)
    : String(thread.participantRoles || "").split(/[\s,]+/).filter(Boolean).map(roleLabel);
  const visibleRoles = Array.from(new Set(roles.filter((role) => role.toLowerCase() !== "owner")));
  const scope = [schoolIdOf(thread) ? `School ${schoolIdOf(thread)}` : "", branchIdOf(thread) ? `Branch ${branchIdOf(thread)}` : ""].filter(Boolean).join(" · ");
  return [visibleRoles.join(", "), scope].filter(Boolean).join(" · ") || "Authority contact";
}

function folderTone(folder: FolderFilter): Tone {
  if (folder === "sent") return "green";
  if (folder === "archived") return "orange";
  if (folder === "inbox") return "blue";
  return "gray";
}

function roleTone(role?: string): Tone {
  const value = String(role || "").toLowerCase();
  if (value === "branch_admin") return "blue";
  if (value === "school_admin" || value === "admin") return "purple";
  if (value === "accountant") return "orange";
  return "gray";
}

function isOwnerThread(thread: AnyRow, accountId?: string | null, ownerUserId?: any) {
  if (!sameAccount(thread, accountId)) return false;

  const roles = Array.isArray(thread.participantRoles)
    ? thread.participantRoles.join(" ")
    : String(thread.participantRoles || "");

  const participants = Array.isArray(thread.participantUserIds)
    ? thread.participantUserIds.map(String)
    : String(thread.participantUserIds || "").split(",");

  return (
    roles.toLowerCase().includes("owner") ||
    String(thread.createdByRole || "").toLowerCase() === "owner" ||
    sameId(thread.ownerUserId, ownerUserId) ||
    participants.includes(String(ownerUserId || ""))
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ title = "No messages", text: body }: { title?: string; text: string }) {
  return (
    <section className="ba-empty">
      <div>💬</div>
      <h3>{title}</h3>
      <p>{body}</p>
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

export default function OwnerMessagesPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("cards");

  const [owner, setOwner] = useState<AnyRow | null>(null);
  const [schools, setSchools] = useState<AnyRow[]>([]);
  const [branches, setBranches] = useState<AnyRow[]>([]);
  const [threads, setThreads] = useState<AnyRow[]>([]);
  const [messages, setMessages] = useState<AnyRow[]>([]);
  const [users, setUsers] = useState<AnyRow[]>([]);
  const [memberships, setMemberships] = useState<AnyRow[]>([]);

  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<FolderFilter>("inbox");
  const [roleFilter, setRoleFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");

  const [drawer, setDrawer] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState<AnyRow | null>(null);
  const [activeThread, setActiveThread] = useState<AnyRow | null>(null);

  const [messageText, setMessageText] = useState("");
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);
  const [form, setForm] = useState<ComposeState>(emptyForm);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  function showToast(tone: ToastTone, message: string) {
    setToast({ tone, message });
    window.setTimeout(() => setToast((current) => (current?.message === message ? null : current)), 4200);
  }

  async function load() {
    if (!accountId) {
      setThreads([]);
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const ctx = await resolveOwnerContext(accountId);
      const ownerUserId = userIdOf(ctx.user || ctx.owner);

      const [schoolRows, branchRows, threadRows, messageRows, localUserRows, localMembershipRows, apiUserRows, apiMembershipRows] = await Promise.all([
        safeArray("schools"),
        safeArray("branches"),
        safeArray("messageThreads"),
        safeArray("messages"),
        safeArray("users").then(async (rows) => (rows.length ? rows : safeArray("accountUsers"))),
        safeArray("userMemberships").then(async (rows) => (rows.length ? rows : safeArray("memberships"))),
        apiArray(["/accounts/users", "/account/users", "/users", "/owner/users"]),
        apiArray(["/accounts/memberships", "/account/memberships", "/memberships", "/owner/memberships"]),
      ]);

      const userRows = mergeByKey([...(localUserRows as AnyRow[]), ...(apiUserRows as AnyRow[])], (row) =>
        String(userIdOf(row) || emailOf(row)).toLowerCase()
      );
      const membershipRows = mergeByKey([...(localMembershipRows as AnyRow[]), ...(apiMembershipRows as AnyRow[])], (row) =>
        String(row.id || row.localId || `${membershipUserId(row)}-${row.role}-${row.schoolId || 0}-${row.branchId || 0}`)
      );

      const ownedSchools = (schoolRows as AnyRow[]).filter((row) => sameAccount(row, accountId));
      const schoolIds = new Set(ownedSchools.map((row) => Number(idOf(row))).filter(Boolean));
      const ownedBranches = (branchRows as AnyRow[]).filter(
        (row) => sameAccount(row, accountId) && (!schoolIds.size || schoolIds.has(Number(row.schoolId)))
      );

      setOwner(ctx.owner);
      setSchools(ownedSchools);
      setBranches(ownedBranches);
      setThreads(
        (threadRows as AnyRow[])
          .filter((row) => isOwnerThread(row, accountId, ownerUserId))
          .filter((row) => row.isDeleted !== true)
      );
      setMessages((messageRows as AnyRow[]).filter((row) => sameAccount(row, accountId)));
      setUsers(userRows as AnyRow[]);
      setMemberships((membershipRows as AnyRow[]).filter((row) => sameAccount(row, accountId)));
    } catch (error) {
      console.error("Failed to load owner messages:", error);
      showToast("error", "Failed to load owner messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, accountLoading, settingsLoading]);

  const contacts = useMemo<Contact[]>(() => {
    const schoolMap = new Map(schools.map((school) => [Number(idOf(school)), rowName(school)]));
    const branchMap = new Map(branches.map((branch) => [Number(idOf(branch)), rowName(branch)]));
    const rows = memberships
      .filter((membership) => OWNER_CONTACT_ROLES.includes(String(membership.role || "").toLowerCase()))
      .map((membership) => {
        const nestedUser = userFromMembership(membership);
        const membershipEmail = emailOf(membership) || emailOf(nestedUser);
        const user =
          users.find((item) => sameId(userIdOf(item), membershipUserId(membership))) ||
          users.find((item) => Boolean(membershipEmail && emailOf(item).toLowerCase() === membershipEmail.toLowerCase())) ||
          nestedUser ||
          undefined;

        const id = userIdOf(user) || membershipUserId(membership) || membershipEmail;
        const schoolId = schoolIdOf(membership);
        const branchId = branchIdOf(membership);

        const rawRole = String(membership.role || user?.role || "user").toLowerCase();
        const roleGroup = roleGroupOf(rawRole);
        const key = `${id || membership.email || rawRole}-${roleGroup}-${schoolId || 0}-${branchId || 0}`;

        return {
          key,
          id,
          name: displayNameForContact(user, membership, rawRole),
          role: rawRole,
          roleGroup: roleGroup === "other" ? "school_admin" : roleGroup,
          email: emailOf(user) || emailOf(membership),
          phone: phoneOf(user) || phoneOf(membership),
          schoolId,
          branchId,
          schoolName: schoolMap.get(schoolId),
          branchName: branchMap.get(branchId),
        };
      })
      .filter((contact) => contact.id);

    const seen = new Set<string>();
    return rows.filter((contact) => {
      const key = contact.key;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [branches, memberships, schools, users]);

  const visibleContacts = useMemo(() => {
    return contacts.filter((contact) => {
      if (!roleFilterMatches(contact.roleGroup, form.roleFilter)) return false;
      if (form.schoolFilter !== "all" && String(contact.schoolId || 0) !== String(form.schoolFilter)) return false;
      if (form.branchFilter !== "all" && String(contact.branchId || 0) !== String(form.branchFilter)) return false;
      return true;
    });
  }, [contacts, form.branchFilter, form.roleFilter, form.schoolFilter]);

  const composeBranches = useMemo(() => {
    if (form.schoolFilter === "all") return branches;
    return branches.filter((branch) => String(branch.schoolId || 0) === String(form.schoolFilter));
  }, [branches, form.schoolFilter]);

  const threadRows = useMemo(() => {
    const q = query.toLowerCase().trim();
    return [...threads]
      .filter((thread) => folder === "all" || folderOf(thread) === folder)
      .filter((thread) => {
        if (roleFilter === "all") return true;
        const roles = Array.isArray(thread.participantRoles)
          ? thread.participantRoles
          : String(thread.participantRoles || "").split(/[\s,]+/);
        return roles.some((role: any) => roleFilterMatches(role, roleFilter));
      })
      .filter((thread) => schoolFilter === "all" || String(schoolIdOf(thread) || 0) === String(schoolFilter))
      .filter((thread) => branchFilter === "all" || String(branchIdOf(thread) || 0) === String(branchFilter))
      .filter((thread) => {
        if (!q) return true;
        return [thread.subject, thread.title, thread.lastMessage, thread.status, thread.folder, thread.participantRoles]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => latestTime(b) - latestTime(a));
  }, [branchFilter, folder, query, roleFilter, schoolFilter, threads]);

  const threadMessages = useMemo(() => {
    if (!activeThread?.id) return [];
    return messages
      .filter((message) => Number(message.threadId) === Number(activeThread.id))
      .sort((a, b) => n(a.createdAt || a.sentAt) - n(b.createdAt || b.sentAt));
  }, [activeThread, messages]);

  const summary = useMemo(
    () => ({
      threads: threads.length,
      inbox: threads.filter((thread) => folderOf(thread) === "inbox").length,
      sent: threads.filter((thread) => folderOf(thread) === "sent").length,
      unread: messages.filter((message) => !message.readAt && String(message.direction || "").toLowerCase() === "inbound").length,
      archived: threads.filter((thread) => folderOf(thread) === "archived").length,
      contacts: contacts.length,
      showing: threadRows.length,
      schools: schools.length,
      branches: branches.length,
    }),
    [branches.length, contacts.length, messages, schools.length, threadRows.length, threads]
  );

  const activeFilterCount = useMemo(() => {
    return [folder !== "inbox", roleFilter !== "all", schoolFilter !== "all", branchFilter !== "all"].filter(Boolean).length;
  }, [branchFilter, folder, roleFilter, schoolFilter]);

  function openCompose() {
    setForm(emptyForm);
    setDrawer(true);
  }

  async function sendNew() {
    if (!accountId) return showToast("error", "Account context is required.");
    if (!form.subject.trim() || !form.body.trim() || !form.recipientUserId) {
      return showToast("error", "Subject, message and recipient are required.");
    }

    const recipient = contacts.find((contact) => contact.key === form.recipientUserId);
    if (!recipient) return showToast("error", "Select a valid recipient.");

    setSaving(true);

    try {
      const createdThread = (await createLocal("messageThreads" as any, {
        accountId: String(accountId),
        schoolId: Number(recipient.schoolId || 0),
        branchId: Number(recipient.branchId || 0),
        subject: form.subject.trim(),
        participantUserIds: [String(userIdOf(owner || {})), String(recipient.id)].filter(Boolean),
        participantRoles: ["owner", recipient.roleGroup],
        ownerUserId: userIdOf(owner || {}),
        folder: "sent",
        status: "open",
        lastMessage: form.body.trim(),
        lastMessageAt: now(),
        createdByRole: "owner",
        active: true,
        isDeleted: false,
      } as AnyRow)) as AnyRow | undefined;

      const threadId = cleanId(createdThread?.id);
      if (!threadId) throw new Error("Could not create message thread.");

      await createLocal("messages" as any, {
        accountId: String(accountId),
        schoolId: Number(recipient.schoolId || 0),
        branchId: Number(recipient.branchId || 0),
        threadId,
        senderRole: "owner",
        ownerUserId: userIdOf(owner || {}),
        recipientUserId: String(recipient.id),
        recipientRole: recipient.roleGroup,
        body: form.body.trim(),
        direction: "outbound",
        status: "sent",
        sentAt: now(),
        active: true,
        isDeleted: false,
      } as AnyRow);

      setDrawer(false);
      setForm(emptyForm);
      await load();
      showToast("success", "Message sent successfully.");
    } catch (error: any) {
      console.error("Failed to send owner message:", error);
      showToast("error", error?.message || "Failed to send message.");
    } finally {
      setSaving(false);
    }
  }

  async function reply() {
    if (!accountId) return showToast("error", "Account context is required.");
    if (!activeThread?.id || !messageText.trim()) return;

    const threadId = cleanId(activeThread.id);
    if (!threadId) return;

    const outgoing = messageText.trim();
    setSaving(true);

    try {
      await createLocal("messages" as any, {
        accountId: String(accountId),
        schoolId: Number(activeThread.schoolId || 0),
        branchId: Number(activeThread.branchId || 0),
        threadId,
        senderRole: "owner",
        ownerUserId: userIdOf(owner || {}),
        body: outgoing,
        direction: "outbound",
        status: "sent",
        sentAt: now(),
        active: true,
        isDeleted: false,
      } as AnyRow);

      const updatedThread = (await updateLocal("messageThreads" as any, threadId, {
        lastMessage: outgoing,
        lastMessageAt: now(),
        folder: "sent",
      } as AnyRow)) as AnyRow | undefined;

      setMessageText("");
      await load();
      if (updatedThread?.id) setActiveThread(updatedThread);
      else setActiveThread((current) => (current ? { ...current, lastMessage: outgoing, lastMessageAt: now(), folder: "sent" } : current));
      showToast("success", "Reply sent.");
    } catch (error: any) {
      console.error("Failed to reply:", error);
      showToast("error", error?.message || "Failed to send reply.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveThread(thread: AnyRow) {
    const id = cleanId(thread.id || thread.localId);
    if (!id) return;
    try {
      await updateLocal("messageThreads" as any, id, { folder: "archived" } as AnyRow);
      setSelectedThread(null);
      await load();
      showToast("success", "Thread archived.");
    } catch (error: any) {
      showToast("error", error?.message || "Failed to archive thread.");
    }
  }

  async function restoreThread(thread: AnyRow) {
    const id = cleanId(thread.id || thread.localId);
    if (!id) return;
    try {
      await updateLocal("messageThreads" as any, id, { folder: "inbox" } as AnyRow);
      setSelectedThread(null);
      await load();
      showToast("success", "Thread restored.");
    } catch (error: any) {
      showToast("error", error?.message || "Failed to restore thread.");
    }
  }

  async function deleteThread(thread: AnyRow) {
    const id = cleanId(thread.id || thread.localId);
    if (!id) return;
    const ok = window.confirm(`Delete "${threadTitle(thread)}"? This will sync as a soft delete.`);
    if (!ok) return;

    try {
      await softDeleteLocal("messageThreads" as any, id);
      for (const message of messages.filter((item) => Number(item.threadId) === Number(id))) {
        const messageId = cleanId(message.id || message.localId);
        if (messageId) await softDeleteLocal("messages" as any, messageId);
      }
      if (activeThread && cleanId(activeThread.id) === id) setActiveThread(null);
      setSelectedThread(null);
      await load();
      showToast("success", "Thread deleted.");
    } catch (error: any) {
      showToast("error", error?.message || "Failed to delete thread.");
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <div className="ba-spinner" />
          <h2>Opening owner messages...</h2>
          <p>Loading account conversations, schools, branches and owner contacts.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <div className="ba-spinner" />
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing owner messages.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast ? (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      ) : null}

      <section className="ba-search-card" aria-label="Owner messages search and actions">
        <span className={`status-dot-mini ${summary.unread ? "orange" : summary.threads ? "green" : "gray"}`} title={`${summary.threads} thread(s)`} />

        <label className="ba-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search owner messages..." aria-label="Search messages" />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCompose} aria-label="Compose message">+</button>

        <button type="button" className={`ba-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {(folder !== "inbox" || roleFilter !== "all" || schoolFilter !== "all" || branchFilter !== "all" || query.trim()) && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {folder !== "inbox" && <button type="button" onClick={() => setFolder("inbox")}>Folder: {folder} ×</button>}
          {roleFilter !== "all" && <button type="button" onClick={() => setRoleFilter("all")}>Role: {roleLabel(roleFilter)} ×</button>}
          {schoolFilter !== "all" && <button type="button" onClick={() => setSchoolFilter("all")}>School ×</button>}
          {branchFilter !== "all" && <button type="button" onClick={() => setBranchFilter("all")}>Branch ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} threads={threads} contacts={contacts} /> : null}

      {view === "table" ? (
        <TableView rows={threadRows} openThread={setActiveThread} selectThread={setSelectedThread} archiveThread={archiveThread} restoreThread={restoreThread} deleteThread={deleteThread} />
      ) : null}

      {view === "cards" ? (
        <section className="ba-list">
          {threadRows.map((thread) => (
            <ThreadListItem key={String(idOf(thread))} thread={thread} onOpen={() => setSelectedThread(thread)} />
          ))}
          {!threadRows.length ? <EmptyCard text="No owner message threads found." /> : null}
        </section>
      ) : null}

      {filterOpen ? (
        <FilterSheet
          folder={folder}
          roleFilter={roleFilter}
          schoolFilter={schoolFilter}
          branchFilter={branchFilter}
          schools={schools}
          branches={branches}
          setFolder={setFolder}
          setRoleFilter={setRoleFilter}
          setSchoolFilter={(value) => { setSchoolFilter(value); setBranchFilter("all"); }}
          setBranchFilter={setBranchFilter}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(mode) => { setView(mode); setMoreOpen(false); }}
          summary={summary}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}

      {selectedThread ? (
        <ActionSheet
          thread={selectedThread}
          openThread={(thread) => { setActiveThread(thread); setSelectedThread(null); }}
          archiveThread={archiveThread}
          restoreThread={restoreThread}
          deleteThread={deleteThread}
          onClose={() => setSelectedThread(null)}
        />
      ) : null}

      {activeThread ? (
        <ConversationDrawer
          thread={activeThread}
          threadMessages={threadMessages}
          messageText={messageText}
          setMessageText={setMessageText}
          saving={saving}
          reply={reply}
          close={() => setActiveThread(null)}
        />
      ) : null}

      {drawer ? (
        <ComposeDrawer
          contacts={contacts}
          visibleContacts={visibleContacts}
          schools={schools}
          composeBranches={composeBranches}
          form={form}
          setForm={setForm}
          saving={saving}
          sendNew={sendNew}
          close={() => setDrawer(false)}
        />
      ) : null}
    </main>
  );
}

function ThreadListItem({ thread, onOpen }: { thread: AnyRow; onOpen: () => void }) {
  const folder = folderOf(thread);
  return (
    <button type="button" className="thread-row" onClick={onOpen}>
      <span className="thread-avatar">💬</span>
      <span className="thread-main">
        <strong>{threadTitle(thread)}</strong>
        <small>{threadScopeLabel(thread)}</small>
        <em>{messagePreview(thread.lastMessage)} · {dateLabel(thread.lastMessageAt || thread.updatedAt || thread.createdAt)}</em>
      </span>
      <span className="thread-side">
        <Chip tone={folderTone(folder)}>{folder}</Chip>
        <i>⋯</i>
      </span>
    </button>
  );
}

function FilterSheet({
  folder,
  roleFilter,
  schoolFilter,
  branchFilter,
  schools,
  branches,
  setFolder,
  setRoleFilter,
  setSchoolFilter,
  setBranchFilter,
  onClose,
}: {
  folder: FolderFilter;
  roleFilter: string;
  schoolFilter: string;
  branchFilter: string;
  schools: AnyRow[];
  branches: AnyRow[];
  setFolder: (value: FolderFilter) => void;
  setRoleFilter: (value: string) => void;
  setSchoolFilter: (value: string) => void;
  setBranchFilter: (value: string) => void;
  onClose: () => void;
}) {
  const scopedBranches = schoolFilter === "all" ? branches : branches.filter((branch) => String(branch.schoolId || 0) === String(schoolFilter));
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose message folder and contact role.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Folder</span>
            <select value={folder} onChange={(event) => setFolder(event.target.value as FolderFilter)}>
              <option value="inbox">Inbox</option>
              <option value="sent">Sent</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>

          <label>
            <span>Role</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={() => { setFolder("inbox"); setRoleFilter("all"); setSchoolFilter("all"); setBranchFilter("all"); }}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  view,
  setView,
  summary,
  onRefresh,
  onClose,
}: {
  view: ViewMode;
  setView: (value: ViewMode) => void;
  summary: AnyRow;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the owner inbox remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>
            <span>☰</span><b>List view</b><small>Compact owner message threads</small>
          </button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}>
            <span>☷</span><b>Table view</b><small>Dense laptop-friendly thread list</small>
          </button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}>
            <span>◔</span><b>Analytics</b><small>{summary.threads} thread(s), {summary.contacts} contacts</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span><b>Refresh</b><small>Reload local owner messages</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function ActionSheet({
  thread,
  openThread,
  archiveThread,
  restoreThread,
  deleteThread,
  onClose,
}: {
  thread: AnyRow;
  openThread: (thread: AnyRow) => void;
  archiveThread: (thread: AnyRow) => void;
  restoreThread: (thread: AnyRow) => void;
  deleteThread: (thread: AnyRow) => void;
  onClose: () => void;
}) {
  const folder = folderOf(thread);
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{threadTitle(thread)}</h2>
            <p>{dateLabel(thread.lastMessageAt || thread.updatedAt || thread.createdAt)} · {folder}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close thread actions">✕</button>
        </div>

        <p className="thread-preview">{messagePreview(thread.lastMessage)}</p>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openThread(thread)}>
            <span>↗</span><b>Open conversation</b><small>Read messages and reply</small>
          </button>
          {folder === "archived" ? (
            <button type="button" onClick={() => restoreThread(thread)}><span>↩</span><b>Restore</b><small>Move this thread back to inbox</small></button>
          ) : (
            <button type="button" onClick={() => archiveThread(thread)}><span>🗄</span><b>Archive</b><small>Move this thread out of inbox</small></button>
          )}
          <button type="button" className="danger" onClick={() => deleteThread(thread)}>
            <span>⌫</span><b>Delete</b><small>Soft delete this thread and messages</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openThread,
  selectThread,
  archiveThread,
  restoreThread,
  deleteThread,
}: {
  rows: AnyRow[];
  openThread: (thread: AnyRow) => void;
  selectThread: (thread: AnyRow) => void;
  archiveThread: (thread: AnyRow) => void;
  restoreThread: (thread: AnyRow) => void;
  deleteThread: (thread: AnyRow) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Messages ({rows.length})</th>
              <th>Updated</th>
              <th>Folder</th>
              <th>Status</th>
              <th>Last Message</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((thread) => {
              const folder = folderOf(thread);
              return (
                <tr key={String(idOf(thread))}>
                  <td><strong>{threadTitle(thread)}</strong><span>{messagePreview(thread.lastMessage).slice(0, 70)}</span></td>
                  <td>{dateLabel(thread.lastMessageAt || thread.updatedAt || thread.createdAt)}</td>
                  <td><Chip tone={folderTone(folder)}>{folder}</Chip></td>
                  <td><Chip>{thread.status || "open"}</Chip></td>
                  <td>{messagePreview(thread.lastMessage).slice(0, 120)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openThread(thread)}>Open</button>
                      <button type="button" onClick={() => selectThread(thread)}>More</button>
                      {folder === "archived" ? (
                        <button type="button" onClick={() => restoreThread(thread)}>Restore</button>
                      ) : (
                        <button type="button" onClick={() => archiveThread(thread)}>Archive</button>
                      )}
                      <button type="button" className="ba-delete" onClick={() => deleteThread(thread)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <div className="ba-empty-table">No owner message thread matches your search/filter.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, threads, contacts }: { summary: AnyRow; threads: AnyRow[]; contacts: Contact[] }) {
  const folders: FolderFilter[] = ["inbox", "sent", "archived"];
  const roles = ["admin", "school_admin", "branch_admin", "accountant"];

  return (
    <section className="ba-analysis-grid">
      <article className="ba-analysis"><span>Threads</span><strong>{summary.threads}</strong><p>Total owner-visible message thread(s).</p></article>
      <article className="ba-analysis"><span>Unread</span><strong>{summary.unread}</strong><p>Inbound message(s) not marked as read.</p></article>
      <article className="ba-analysis"><span>Contacts</span><strong>{summary.contacts}</strong><p>School, branch and finance users the owner can message.</p></article>
      <article className="ba-analysis"><span>Scope</span><strong>{summary.schools}</strong><p>{summary.branches} branch(es) under this owner account.</p></article>

      {folders.map((name) => {
        const count = threads.filter((thread) => folderOf(thread) === name).length;
        const percent = threads.length ? Math.round((count / threads.length) * 100) : 0;
        return (
          <article className="ba-analysis" key={name}>
            <span>{name}</span>
            <strong>{count}</strong>
            <div className="ba-progress"><i style={{ width: `${Math.max(4, percent)}%` }} /></div>
            <p>{percent}% of all owner message threads.</p>
          </article>
        );
      })}

      {roles.map((role) => {
        const count = contacts.filter((contact) => contact.role === role).length;
        const percent = contacts.length ? Math.round((count / contacts.length) * 100) : 0;
        return (
          <article className="ba-analysis" key={role}>
            <span>{roleLabel(role)}</span>
            <strong>{count}</strong>
            <div className="ba-progress"><i style={{ width: `${Math.max(4, percent)}%` }} /></div>
            <p>{percent}% of available owner contacts.</p>
          </article>
        );
      })}
    </section>
  );
}

function ConversationDrawer({
  thread,
  threadMessages,
  messageText,
  setMessageText,
  saving,
  reply,
  close,
}: {
  thread: AnyRow;
  threadMessages: AnyRow[];
  messageText: string;
  setMessageText: (value: string) => void;
  saving: boolean;
  reply: () => void | Promise<void>;
  close: () => void;
}) {
  return (
    <div className="ba-drawer-layer">
      <button className="ba-drawer-overlay" type="button" onClick={close} aria-label="Close conversation" />
      <aside className="ba-drawer">
        <div className="ba-drawer-head">
          <div>
            <p>Conversation</p>
            <h2>{threadTitle(thread)}</h2>
            <span>{threadMessages.length} message(s)</span>
          </div>
          <button type="button" onClick={close}>✕</button>
        </div>

        <section className="ba-list">
          {threadMessages.map((message) => (
            <article key={String(idOf(message))} className={`message-bubble ${message.direction === "outbound" ? "outbound" : "inbound"}`}>
              <div className="ba-chip-row">
                <Chip tone={message.direction === "outbound" ? "green" : "blue"}>{message.direction || "message"}</Chip>
                <Chip>{dateLabel(message.sentAt || message.createdAt)}</Chip>
              </div>
              <p>{message.body}</p>
            </article>
          ))}
          {!threadMessages.length ? <EmptyCard text="No messages in this thread." /> : null}
        </section>

        <section className="ba-form-card">
          <textarea value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a reply..." />
          <div className="ba-drawer-actions">
            <button className="ba-btn" type="button" onClick={close}>Close</button>
            <button className="ba-primary" type="button" disabled={saving || !messageText.trim()} onClick={reply}>
              {saving ? "Sending..." : "Send Reply"}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function ComposeDrawer({
  contacts,
  visibleContacts,
  schools,
  composeBranches,
  form,
  setForm,
  saving,
  sendNew,
  close,
}: {
  contacts: Contact[];
  visibleContacts: Contact[];
  schools: AnyRow[];
  composeBranches: AnyRow[];
  form: ComposeState;
  setForm: (value: ComposeState) => void;
  saving: boolean;
  sendNew: () => void | Promise<void>;
  close: () => void;
}) {
  return (
    <div className="ba-drawer-layer">
      <button className="ba-drawer-overlay" type="button" onClick={close} aria-label="Close compose" />
      <aside className="ba-drawer">
        <div className="ba-drawer-head">
          <div>
            <p>Compose</p>
            <h2>New Owner Message</h2>
            <span>{contacts.length} available owner contact(s)</span>
          </div>
          <button type="button" onClick={close}>✕</button>
        </div>

        <section className="ba-form-card">
          <div className="ba-form-grid">
            <label>
              <span>Role Filter</span>
              <select value={form.roleFilter} onChange={(event) => setForm({ ...form, roleFilter: event.target.value, recipientUserId: "" })}>
              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label>
              <span>School Filter</span>
              <select value={form.schoolFilter} onChange={(event) => setForm({ ...form, schoolFilter: event.target.value, branchFilter: "all", recipientUserId: "" })}>
                <option value="all">All schools</option>
                {schools.map((school) => <option key={String(idOf(school))} value={String(idOf(school))}>{rowName(school)}</option>)}
              </select>
            </label>

            <label>
              <span>Branch Filter</span>
              <select value={form.branchFilter} onChange={(event) => setForm({ ...form, branchFilter: event.target.value, recipientUserId: "" })}>
                <option value="all">All branches</option>
                {composeBranches.map((branch) => <option key={String(idOf(branch))} value={String(idOf(branch))}>{rowName(branch)}</option>)}
              </select>
            </label>

            <label>
              <span>Recipient</span>
              <select value={form.recipientUserId} onChange={(event) => setForm({ ...form, recipientUserId: event.target.value })}>
                <option value="">Select recipient</option>
                {visibleContacts.map((contact) => (
                  <option key={contact.key} value={contact.key}>
                    {text(contact.name, roleLabel(contact.roleGroup))} · {roleLabel(contact.roleGroup)}{contact.schoolName ? ` · ${contact.schoolName}` : ""}{contact.branchName ? ` · ${contact.branchName}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">
              <span>Subject</span>
              <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Message subject" />
            </label>

            <label className="wide">
              <span>Message</span>
              <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Write your message..." />
            </label>
          </div>

          <p className="ba-hint">{visibleContacts.length} contact(s) match these authority filters.</p>
        </section>

        <div className="ba-drawer-actions">
          <button className="ba-btn" type="button" onClick={close}>Cancel</button>
          <button className="ba-primary" type="button" disabled={saving} onClick={sendNew}>
            {saving ? "Sending..." : "Send"}
          </button>
        </div>
      </aside>
    </div>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page textarea{min-height:130px;padding:12px;resize:vertical;line-height:1.55}.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.thread-row,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-form-card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}.ba-toast.error{background:rgba(239,68,68,.12);color:#991b1b}.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.ba-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-list{display:grid;gap:7px;margin-top:10px}.thread-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:var(--text,#111827);transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.thread-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 28%,var(--border,rgba(0,0,0,.10)));box-shadow:0 15px 34px rgba(15,23,42,.07)}.thread-avatar{width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:var(--ba-primary);color:#fff;font-size:19px;box-shadow:0 10px 22px color-mix(in srgb,var(--ba-primary) 21%,transparent)}.thread-main{display:grid;gap:2px}.thread-main strong,.thread-main small,.thread-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.thread-main strong{font-size:14px;font-weight:1000;letter-spacing:-.02em;color:var(--text,#111827)}.thread-main small{color:var(--muted,#64748b);font-size:12px;font-weight:800}.thread-main em{color:var(--muted,#64748b);font-size:11px;font-style:normal;font-weight:750}.thread-side{display:grid;justify-items:end;gap:5px}.thread-side i{font-style:normal;color:var(--muted,#64748b);font-weight:1000}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-table-card{margin-top:10px;padding:10px;border-radius:24px;overflow:hidden}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ba-table-scroll table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827)}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px;color:var(--text,#111827)}.ba-table-scroll th{background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,var(--surface,#fff)));color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;flex-wrap:wrap;gap:7px}.ba-table-actions button,.ba-btn,.ba-primary,.ba-delete{min-height:34px;border-radius:999px;padding:0 10px;font-size:11px;font-weight:950;cursor:pointer}.ba-btn,.ba-table-actions button{border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111827)}.ba-primary,.ba-table-actions button:first-child{border:0;background:var(--ba-primary);color:#fff}.ba-primary:disabled{opacity:.6;cursor:not-allowed}.ba-delete,.ba-table-actions .ba-delete{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));border:1px solid color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10)))}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis,.ba-empty{padding:13px;border-radius:24px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-progress{height:8px;margin-top:12px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.ba-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-sheet{width:min(760px,100%);max-height:min(92dvh,820px);overflow-y:auto;border-radius:28px;padding:14px}.ba-sheet.small{width:min(520px,100%)}.ba-sheet-head,.ba-sheet-profile{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:2px 2px 14px}.ba-sheet-head h2,.ba-sheet-profile h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p,.ba-sheet-profile p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-sheet-head button,.ba-sheet-profile button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-form{display:grid;gap:10px}.ba-form label{display:grid;gap:6px}.ba-form span,.ba-form-grid label span{color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}.ba-sheet-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.ba-sheet-actions button{min-height:38px;border-radius:999px;border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111827);font-weight:950;padding:0 14px}.ba-sheet-actions button.primary{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;row-gap:2px;align-items:center;text-align:left;padding:11px;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111827);cursor:pointer}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 35%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 9%,var(--surface,#fff))}.ba-menu-list button.danger{background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827)}.ba-menu-list span{grid-row:1/3;width:34px;height:34px;display:grid;place-items:center;border-radius:13px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list b{font-size:13px;font-weight:1000}.ba-menu-list small{color:var(--muted,#64748b);font-size:11px;font-weight:750}.thread-preview{margin:0 0 10px;padding:12px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--text,#111827);font-size:13px;line-height:1.55}.ba-drawer-layer{position:fixed;inset:0;z-index:80}.ba-drawer-overlay{position:absolute;inset:0;border:0;background:rgba(15,23,42,.52)}.ba-drawer{position:absolute;right:0;top:0;bottom:0;width:min(94vw,720px);max-width:100vw;overflow-y:auto;overflow-x:hidden;background:var(--bg,#f7f8fb);color:var(--text,#111827);padding:14px;box-shadow:var(--shell-shadow,-24px 0 70px rgba(15,23,42,.22))}.ba-drawer-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:6px 0 12px;background:var(--bg,#f7f8fb)}.ba-drawer-head p{margin:0;color:var(--ba-primary);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.ba-drawer-head h2{margin:2px 0 0;font-size:22px;font-weight:1000;letter-spacing:-.05em}.ba-drawer-head span{margin-top:3px;display:block;color:var(--muted,#64748b);font-size:12px;font-weight:750}.ba-drawer-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-form-card{margin-top:10px;padding:12px;border-radius:22px}.ba-form-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ba-form-grid label{display:grid;gap:6px}.ba-form-grid .wide{grid-column:1/-1}.ba-drawer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.message-bubble{max-width:min(560px,100%);padding:12px;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.message-bubble.outbound{margin-left:auto;background:color-mix(in srgb,var(--ba-primary) 9%,var(--card-bg,var(--surface,#fff)))}.message-bubble p{margin:8px 0 0;color:var(--text,#111827);font-size:13px;line-height:1.55;white-space:pre-wrap}.ba-chip-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:0}@media(min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1))}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop{place-items:center;padding:18px}}@media(min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1))}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr));max-width:1180px;margin-left:auto;margin-right:auto}.ba-list,.ba-table-card{max-width:1180px;margin-left:auto;margin-right:auto}}@media(max-width:520px){.ba-page{padding:calc(6px * var(--local-density-scale,1))}.ba-search-card{grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:6px;padding:7px;border-radius:22px}.ba-add-inline,.ba-icon-button,.ba-filter-button{width:39px;height:39px}.thread-row{border-radius:20px;padding:9px}.thread-avatar{width:39px;height:39px}.thread-main strong{font-size:13px}.thread-main small,.thread-main em{font-size:11px}.ba-table-card,.ba-analysis,.ba-empty{border-radius:20px;padding:11px}.ba-drawer-actions{grid-template-columns:minmax(0,1fr)}.ba-drawer{width:min(96vw,720px);padding:12px}.ba-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}}
`;
