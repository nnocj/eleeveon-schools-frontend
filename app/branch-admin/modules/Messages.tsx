"use client";

/**
 * app/branch-admin/modules/Messages.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH MESSAGES V3
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
 * - compact search + inline compose + slider filter + more menu
 * - folder filter moved into a bottom sheet
 * - cards/list view uses compact Students.tsx-style rows instead of large cards
 * - table and analytics live under the More menu
 * - thread actions live in an action sheet to save vertical space
 * - table colors use theme variables so dark mode/system theme stays readable
 *
 * Tables used:
 * - messageThreads
 * - messages
 * - userMemberships / memberships
 * - users / accountUsers
 *
 * Sync behavior:
 * - createLocal(...) creates threads and messages
 * - updateLocal(...) archives/restores/replies while preserving sync metadata
 * - softDeleteLocal(...) soft-deletes threads and linked messages
 * - no manual synced/version/updatedAt fields are written directly here
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db, type Message, type MessageThread } from "../../lib/db/db";
import {
  createLocal,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type FolderFilter = "inbox" | "sent" | "archived" | "all";
type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

const now = () => Date.now();

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idOf(row?: AnyRow): string {
  return cleanId(row?.id ?? row?.payload?.id);
}

function cleanId(value: any): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
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

function firstLocalId(...values: unknown[]): string {
  for (const value of values) {
    const parsed = cleanId(value);
    if (parsed) return parsed;
  }

  return "";
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
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
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function sameId(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function schoolIdOf(row: AnyRow) {
  return cleanId(row?.schoolId ?? row?.schoolId ?? row?.payload?.schoolId);
}

function branchIdOf(row: AnyRow) {
  return cleanId(row?.branchId ?? row?.branchId ?? row?.payload?.branchId);
}

function isBranchRow(
  row: AnyRow,
  accountId?: string | null,
  schoolId?: string | null,
  branchId?: string | null,
) {
  if (!row || row.isDeleted) return false;
  const sameAccount =
    !row.accountId || !accountId || row.accountId === accountId;
  return (
    sameAccount &&
    sameId(schoolIdOf(row), schoolId) &&
    sameId(branchIdOf(row), branchId)
  );
}

function rowName(row?: AnyRow) {
  return text(
    row?.fullName || row?.name || row?.title || row?.label || row?.email,
    "Unnamed",
  );
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

function threadTitle(thread: AnyRow) {
  return text(thread.subject || thread.title, "No subject");
}

function folderOf(thread: AnyRow): FolderFilter {
  const folder = String(thread.folder || "inbox").toLowerCase();
  if (["inbox", "sent", "archived"].includes(folder))
    return folder as FolderFilter;
  return "inbox";
}

function latestTime(thread: AnyRow) {
  return n(thread.lastMessageAt || thread.updatedAt || thread.createdAt);
}

function messagePreview(value: any) {
  return text(value, "No message preview.");
}

function folderTone(folder: FolderFilter): Tone {
  if (folder === "sent") return "green";
  if (folder === "archived") return "orange";
  if (folder === "inbox") return "blue";
  return "gray";
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

function EmptyCard({
  title = "No messages",
  text: body,
}: {
  title?: string;
  text: string;
}) {
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

export default function Messages() {
  const dataRevision = useDataRevision();

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

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("cards");
  const [threads, setThreads] = useState<AnyRow[]>([]);
  const [messages, setMessages] = useState<AnyRow[]>([]);
  const [users, setUsers] = useState<AnyRow[]>([]);
  const [memberships, setMemberships] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<FolderFilter>("inbox");
  const [drawer, setDrawer] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState<AnyRow | null>(null);
  const [activeThread, setActiveThread] = useState<AnyRow | null>(null);
  const [messageText, setMessageText] = useState("");
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);
  const [form, setForm] = useState({
    subject: "",
    body: "",
    recipientUserId: "",
  });

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  function showToast(tone: ToastTone, message: string) {
    setToast({ tone, message });
    window.setTimeout(
      () =>
        setToast((current) => (current?.message === message ? null : current)),
      4200,
    );
  }

  async function load() {
    if (!accountId || !schoolId || !branchId) {
      setThreads([]);
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [threadRows, messageRows, userRows, membershipRows] =
        await Promise.all([
          safeArray("messageThreads"),
          safeArray("messages"),
          safeArray("users").then(async (rows) =>
            rows.length ? rows : safeArray("accountUsers"),
          ),
          safeArray("userMemberships").then(async (rows) =>
            rows.length ? rows : safeArray("memberships"),
          ),
        ]);

      setThreads(
        (threadRows as AnyRow[]).filter((row) =>
          isBranchRow(row, accountId, schoolId, branchId),
        ),
      );
      setMessages(
        (messageRows as AnyRow[]).filter((row) =>
          isBranchRow(row, accountId, schoolId, branchId),
        ),
      );
      setUsers(userRows as AnyRow[]);
      setMemberships(
        (membershipRows as AnyRow[]).filter((row) =>
          isBranchRow(row, accountId, schoolId, branchId),
        ),
      );
    } catch (error) {
      console.error("Failed to load messages:", error);
      showToast("error", "Failed to load messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, schoolId, branchId, dataRevision]);

  const contacts = useMemo(() => {
    return memberships
      .map((membership) => {
        const user =
          users.find((item) =>
            sameId(
              item.id,
              membership.userId ||
                membership.userId ||
                membership.accountUserId,
            ),
          ) ||
          users.find(
            (item) =>
              item.email &&
              membership.email &&
              String(item.email).toLowerCase() ===
                String(membership.email).toLowerCase(),
          );

        return {
          id:
            user?.id ||
            membership.userId ||
            membership.userId ||
            membership.accountUserId,
          name: rowName(user || membership),
          role: membership.role || user?.role || "user",
          email: user?.email || membership.email,
          phone: user?.phone || membership.phone,
        };
      })
      .filter((contact) => contact.id && contact.role !== "branch_admin");
  }, [memberships, users]);

  const threadRows = useMemo(() => {
    const q = query.toLowerCase().trim();
    return [...threads]
      .filter((thread) => folder === "all" || folderOf(thread) === folder)
      .filter((thread) => {
        if (!q) return true;
        return [
          thread.subject,
          thread.title,
          thread.lastMessage,
          thread.status,
          thread.folder,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => latestTime(b) - latestTime(a));
  }, [folder, query, threads]);

  const threadMessages = useMemo(() => {
    if (!activeThread?.id) return [];
    return messages
      .filter((message) => String(message.threadId) === String(activeThread.id))
      .sort((a, b) => n(a.createdAt || a.sentAt) - n(b.createdAt || b.sentAt));
  }, [activeThread, messages]);

  const summary = useMemo(
    () => ({
      threads: threads.length,
      inbox: threads.filter((thread) => folderOf(thread) === "inbox").length,
      sent: threads.filter((thread) => folderOf(thread) === "sent").length,
      unread: messages.filter(
        (message) => !message.readAt && message.direction === "inbound",
      ).length,
      archived: threads.filter((thread) => folderOf(thread) === "archived")
        .length,
      contacts: contacts.length,
      showing: threadRows.length,
    }),
    [contacts.length, messages, threadRows.length, threads],
  );

  const activeFilterCount = useMemo(
    () => (folder !== "inbox" ? 1 : 0),
    [folder],
  );

  async function sendNew() {
    if (!accountId || !schoolId || !branchId)
      return showToast("error", "Assigned branch context is required.");
    if (!form.subject.trim() || !form.body.trim() || !form.recipientUserId)
      return showToast("error", "Subject, message and recipient are required.");

    const recipient = contacts.find(
      (contact) => String(contact.id) === String(form.recipientUserId),
    );
    if (!recipient) return showToast("error", "Select a valid recipient.");

    setSaving(true);

    try {
      const safeAccountId = String(accountId);
      const createdThread = (await createLocal("messageThreads", {
        accountId: safeAccountId,
        schoolId: schoolId,
        branchId: branchId,
        subject: form.subject.trim(),
        participantUserIds: [String(form.recipientUserId)],
        participantRoles: [recipient.role],
        folder: "sent",
        status: "open",
        lastMessage: form.body.trim(),
        lastMessageAt: now(),
        active: true,
        isDeleted: false,
      } as unknown as MessageThread)) as AnyRow | undefined;

      const threadId = cleanId(createdThread?.id);
      if (!threadId) throw new Error("Could not create message thread.");

      await createLocal("messages", {
        accountId: safeAccountId,
        schoolId: schoolId,
        branchId: branchId,
        threadId,
        senderRole: "branch_admin",
        recipientUserId: String(form.recipientUserId),
        recipientRole: recipient.role,
        body: form.body.trim(),
        direction: "outbound",
        status: "sent",
        sentAt: now(),
        active: true,
        isDeleted: false,
      } as unknown as Message);

      setDrawer(false);
      setForm({ subject: "", body: "", recipientUserId: "" });
      await load();
      showToast("success", "Message sent successfully.");
    } catch (error: any) {
      console.error("Failed to send message:", error);
      showToast("error", error?.message || "Failed to send message.");
    } finally {
      setSaving(false);
    }
  }

  async function reply() {
    if (!accountId || !schoolId || !branchId)
      return showToast("error", "Assigned branch context is required.");
    if (!activeThread?.id || !messageText.trim()) return;

    const threadId = cleanId(activeThread.id);
    if (!threadId) return;

    setSaving(true);

    try {
      const safeAccountId = String(accountId);
      await createLocal("messages", {
        accountId: safeAccountId,
        schoolId: schoolId,
        branchId: branchId,
        threadId,
        senderRole: "branch_admin",
        body: messageText.trim(),
        direction: "outbound",
        status: "sent",
        sentAt: now(),
        active: true,
        isDeleted: false,
      } as unknown as Message);

      const updatedThread = (await updateLocal("messageThreads", threadId, {
        lastMessage: messageText.trim(),
        lastMessageAt: Date.now(),
        folder: "sent",
      } as unknown as Partial<MessageThread>)) as AnyRow | undefined;

      setMessageText("");
      await load();
      if (updatedThread?.id) setActiveThread(updatedThread);
      showToast("success", "Reply sent.");
    } catch (error: any) {
      console.error("Failed to reply:", error);
      showToast("error", error?.message || "Failed to send reply.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveThread(thread: AnyRow) {
    const id = cleanId(thread.id);
    if (!id) return;
    try {
      await updateLocal("messageThreads", id, {
        folder: "archived",
      } as Partial<MessageThread>);
      setSelectedThread(null);
      await load();
      showToast("success", "Thread archived.");
    } catch (error: any) {
      showToast("error", error?.message || "Failed to archive thread.");
    }
  }

  async function restoreThread(thread: AnyRow) {
    const id = cleanId(thread.id);
    if (!id) return;
    try {
      await updateLocal("messageThreads", id, {
        folder: "inbox",
      } as Partial<MessageThread>);
      setSelectedThread(null);
      await load();
      showToast("success", "Thread restored.");
    } catch (error: any) {
      showToast("error", error?.message || "Failed to restore thread.");
    }
  }

  async function deleteThread(thread: AnyRow) {
    const id = cleanId(thread.id);
    if (!id) return;
    const ok = window.confirm(
      `Delete "${threadTitle(thread)}"? This will sync as a soft delete.`,
    );
    if (!ok) return;
    try {
      await softDeleteLocal("messageThreads", id);
      for (const message of messages.filter(
        (item) => String(item.threadId) === String(id),
      )) {
        const messageId = cleanId(message.id);
        if (messageId) await softDeleteLocal("messages", messageId);
      }
      if (activeThread && cleanId(activeThread.id) === id)
        setActiveThread(null);
      setSelectedThread(null);
      await load();
      showToast("success", "Thread deleted.");
    } catch (error: any) {
      showToast("error", error?.message || "Failed to delete thread.");
    }
  }

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <div className="ba-spinner" />
          <h2>Opening messages...</h2>
          <p>Loading conversations, branch contacts and message history.</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      {toast ? (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </section>
      ) : null}

      <section
        className="ba-search-card"
        aria-label="Messages search and actions"
      >
        <span
          className={`status-dot-mini ${summary.unread ? "orange" : summary.threads ? "green" : "gray"}`}
          title={`${summary.threads} thread(s)`}
        />

        <label className="ba-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages..."
            aria-label="Search messages"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={() => setDrawer(true)}
          aria-label="Compose message"
        >
          +
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {(folder !== "inbox" || query.trim()) && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {folder !== "inbox" && (
            <button type="button" onClick={() => setFolder("inbox")}>
              Folder: {folder} ×
            </button>
          )}
          {query.trim() && (
            <button type="button" onClick={() => setQuery("")}>
              Search: {query.trim()} ×
            </button>
          )}
        </section>
      )}

      {view === "analytics" ? (
        <AnalyticsView summary={summary} threads={threads} />
      ) : null}

      {view === "table" ? (
        <TableView
          rows={threadRows}
          openThread={setActiveThread}
          selectThread={setSelectedThread}
          archiveThread={archiveThread}
          restoreThread={restoreThread}
          deleteThread={deleteThread}
        />
      ) : null}

      {view === "cards" ? (
        <section className="ba-list">
          {threadRows.map((thread) => (
            <ThreadListItem
              key={String(idOf(thread))}
              thread={thread}
              onOpen={() => setSelectedThread(thread)}
            />
          ))}
          {!threadRows.length ? (
            <EmptyCard text="No message threads found." />
          ) : null}
        </section>
      ) : null}

      {filterOpen ? (
        <FilterSheet
          folder={folder}
          setFolder={setFolder}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(mode) => {
            setView(mode);
            setMoreOpen(false);
          }}
          summary={summary}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}

      {selectedThread ? (
        <ActionSheet
          thread={selectedThread}
          openThread={(thread) => {
            setActiveThread(thread);
            setSelectedThread(null);
          }}
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
          activeBranchName={activeBranch?.name || "Assigned branch"}
          contacts={contacts}
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

function ThreadListItem({
  thread,
  onOpen,
}: {
  thread: AnyRow;
  onOpen: () => void;
}) {
  const folder = folderOf(thread);
  return (
    <button type="button" className="thread-row" onClick={onOpen}>
      <span className="thread-avatar">💬</span>
      <span className="thread-main">
        <strong>{threadTitle(thread)}</strong>
        <small>{messagePreview(thread.lastMessage)}</small>
        <em>
          {dateLabel(
            thread.lastMessageAt || thread.updatedAt || thread.createdAt,
          )}
        </em>
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
  setFolder,
  onClose,
}: {
  folder: FolderFilter;
  setFolder: (value: FolderFilter) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which message folder to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>
        <div className="ba-form compact">
          <label>
            <span>Folder</span>
            <select
              value={folder}
              onChange={(event) =>
                setFolder(event.target.value as FolderFilter)
              }
            >
              <option value="inbox">Inbox</option>
              <option value="sent">Sent</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
        <div className="ba-sheet-actions">
          <button type="button" onClick={() => setFolder("inbox")}>
            Reset
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Apply
          </button>
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
            <p>Advanced views stay here so the main inbox remains clean.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="ba-menu-list">
          <button
            type="button"
            className={view === "cards" ? "active" : ""}
            onClick={() => setView("cards")}
          >
            <span>☰</span>
            <b>List view</b>
            <small>Compact message threads</small>
          </button>
          <button
            type="button"
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense laptop-friendly thread list</small>
          </button>
          <button
            type="button"
            className={view === "analytics" ? "active" : ""}
            onClick={() => setView("analytics")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>
              {summary.threads} thread(s), {summary.unread} unread
            </small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch messages</small>
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
            <p>
              {dateLabel(
                thread.lastMessageAt || thread.updatedAt || thread.createdAt,
              )}{" "}
              · {folder}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close thread actions"
          >
            ✕
          </button>
        </div>
        <p className="thread-preview">{messagePreview(thread.lastMessage)}</p>
        <div className="ba-menu-list">
          <button type="button" onClick={() => openThread(thread)}>
            <span>↗</span>
            <b>Open conversation</b>
            <small>Read messages and reply</small>
          </button>
          {folder === "archived" ? (
            <button type="button" onClick={() => restoreThread(thread)}>
              <span>↩</span>
              <b>Restore</b>
              <small>Move this thread back to inbox</small>
            </button>
          ) : (
            <button type="button" onClick={() => archiveThread(thread)}>
              <span>🗄</span>
              <b>Archive</b>
              <small>Move this thread out of inbox</small>
            </button>
          )}
          <button
            type="button"
            className="danger"
            onClick={() => deleteThread(thread)}
          >
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this thread and messages</small>
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
                  <td>
                    <strong>{threadTitle(thread)}</strong>
                    <span>
                      {messagePreview(thread.lastMessage).slice(0, 70)}
                    </span>
                  </td>
                  <td>
                    {dateLabel(
                      thread.lastMessageAt ||
                        thread.updatedAt ||
                        thread.createdAt,
                    )}
                  </td>
                  <td>
                    <Chip tone={folderTone(folder)}>{folder}</Chip>
                  </td>
                  <td>
                    <Chip>{thread.status || "open"}</Chip>
                  </td>
                  <td>{messagePreview(thread.lastMessage).slice(0, 120)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openThread(thread)}>
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => selectThread(thread)}
                      >
                        More
                      </button>
                      {folder === "archived" ? (
                        <button
                          type="button"
                          onClick={() => restoreThread(thread)}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => archiveThread(thread)}
                        >
                          Archive
                        </button>
                      )}
                      <button
                        type="button"
                        className="ba-delete"
                        onClick={() => deleteThread(thread)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? (
          <div className="ba-empty-table">
            No message thread matches your search/filter.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AnalyticsView({
  summary,
  threads,
}: {
  summary: AnyRow;
  threads: AnyRow[];
}) {
  const folders: FolderFilter[] = ["inbox", "sent", "archived"];
  return (
    <section className="ba-analysis-grid">
      <article className="ba-analysis">
        <span>Threads</span>
        <strong>{summary.threads}</strong>
        <p>Total branch-scoped message thread(s).</p>
      </article>
      <article className="ba-analysis">
        <span>Unread</span>
        <strong>{summary.unread}</strong>
        <p>Inbound message(s) not marked as read.</p>
      </article>
      <article className="ba-analysis">
        <span>Contacts</span>
        <strong>{summary.contacts}</strong>
        <p>Available branch users you can message.</p>
      </article>
      <article className="ba-analysis">
        <span>Visible</span>
        <strong>{summary.showing}</strong>
        <p>Thread(s) matching the current search and folder filter.</p>
      </article>
      {folders.map((name) => {
        const count = threads.filter(
          (thread) => folderOf(thread) === name,
        ).length;
        const percent = threads.length
          ? Math.round((count / threads.length) * 100)
          : 0;
        return (
          <article className="ba-analysis" key={name}>
            <span>{name}</span>
            <strong>{count}</strong>
            <div className="ba-progress">
              <i style={{ width: `${Math.max(4, percent)}%` }} />
            </div>
            <p>{percent}% of all message threads.</p>
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
      <button
        className="ba-drawer-overlay"
        type="button"
        onClick={close}
        aria-label="Close conversation"
      />
      <aside className="ba-drawer">
        <div className="ba-drawer-head">
          <div>
            <p>Conversation</p>
            <h2>{threadTitle(thread)}</h2>
            <span>{threadMessages.length} message(s)</span>
          </div>
          <button type="button" onClick={close}>
            ✕
          </button>
        </div>
        <section className="ba-list">
          {threadMessages.map((message) => (
            <article
              key={String(idOf(message))}
              className={`message-bubble ${message.direction === "outbound" ? "outbound" : "inbound"}`}
            >
              <div className="ba-chip-row">
                <Chip
                  tone={message.direction === "outbound" ? "green" : "blue"}
                >
                  {message.direction || "message"}
                </Chip>
                <Chip>{dateLabel(message.sentAt || message.createdAt)}</Chip>
              </div>
              <p>{message.body}</p>
            </article>
          ))}
          {!threadMessages.length ? (
            <EmptyCard text="No messages in this thread." />
          ) : null}
        </section>
        <section className="ba-form-card">
          <textarea
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="Write a reply..."
          />
          <div className="ba-drawer-actions">
            <button className="ba-btn" type="button" onClick={close}>
              Close
            </button>
            <button
              className="ba-primary"
              type="button"
              disabled={saving || !messageText.trim()}
              onClick={reply}
            >
              {saving ? "Sending..." : "Send Reply"}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function ComposeDrawer({
  activeBranchName,
  contacts,
  form,
  setForm,
  saving,
  sendNew,
  close,
}: {
  activeBranchName: string;
  contacts: AnyRow[];
  form: { subject: string; body: string; recipientUserId: string };
  setForm: (value: {
    subject: string;
    body: string;
    recipientUserId: string;
  }) => void;
  saving: boolean;
  sendNew: () => void | Promise<void>;
  close: () => void;
}) {
  return (
    <div className="ba-drawer-layer">
      <button
        className="ba-drawer-overlay"
        type="button"
        onClick={close}
        aria-label="Close compose"
      />
      <aside className="ba-drawer">
        <div className="ba-drawer-head">
          <div>
            <p>Compose</p>
            <h2>New Message</h2>
            <span>{activeBranchName}</span>
          </div>
          <button type="button" onClick={close}>
            ✕
          </button>
        </div>
        <section className="ba-form-card">
          <div className="ba-form-grid">
            <label>
              <span>Recipient</span>
              <select
                value={form.recipientUserId}
                onChange={(event) =>
                  setForm({ ...form, recipientUserId: event.target.value })
                }
              >
                <option value="">Select recipient</option>
                {contacts.map((contact) => (
                  <option
                    key={`${contact.role}-${contact.id}`}
                    value={String(contact.id)}
                  >
                    {contact.name} · {contact.role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subject</span>
              <input
                value={form.subject}
                onChange={(event) =>
                  setForm({ ...form, subject: event.target.value })
                }
                placeholder="Message subject"
              />
            </label>
            <label className="wide">
              <span>Message</span>
              <textarea
                value={form.body}
                onChange={(event) =>
                  setForm({ ...form, body: event.target.value })
                }
                placeholder="Write your message..."
              />
            </label>
          </div>
        </section>
        <div className="ba-drawer-actions">
          <button className="ba-btn" type="button" onClick={close}>
            Cancel
          </button>
          <button
            className="ba-primary"
            type="button"
            disabled={saving}
            onClick={sendNew}
          >
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
