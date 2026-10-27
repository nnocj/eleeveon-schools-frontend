"use client";
/**
 * Eleeveon Hub ciphertext cache (local-only).
 *
 * Deliberately separate from school SyncRecord/PlatformCache: support chats may
 * cross school accounts. The authenticated /support API remains authoritative.
 * NEVER store decrypted message text, private E2EE keys, live signed URLs,
 * upload tokens, or attachment blobs in this cache.
 */
import Dexie, { type Table } from "dexie";
import type { SupportConversation, SupportMessage } from "./supportApi";
import type { PublicSupportDevice } from "./supportCrypto";

export type HubDevice = PublicSupportDevice & { revoked?: boolean };

interface InboxRecord {
  scope: string;
  conversations: SupportConversation[];
  savedAt: number;
}
interface ThreadRecord {
  key: string;
  scope: string;
  conversationId: string;
  conversation: SupportConversation;
  messages: SupportMessage[];
  devices: HubDevice[];
  savedAt: number;
}

class HubCiphertextDatabase extends Dexie {
  inboxes!: Table<InboxRecord, string>;
  threads!: Table<ThreadRecord, string>;
  constructor() {
    super("Eleeveon_Hub_Encrypted_Cache_v1");
    this.version(1).stores({
      inboxes: "&scope",
      threads: "&key, scope, conversationId, savedAt",
    });
  }
}

// Only one instance of this narrowly scoped, local-only cache exists per tab.
// It does not open or migrate EleeveonDatabase and has no SyncRecord writes.
let cache: HubCiphertextDatabase | undefined;
function getDb(): HubCiphertextDatabase {
  return (cache ??= new HubCiphertextDatabase());
}

export function hubScope(
  accountId: string, userId: string, role: string,
  schoolId?: string | null, branchId?: string | null,
): string {
  // Using serialized tuple prevents delimiter ambiguities between user IDs.
  return JSON.stringify([accountId, userId, role, schoolId || "", branchId || ""]);
}

function isE2ee(c: SupportConversation) {
  return c.metadata?.e2ee === true;
}
function safeConversation(c: SupportConversation): SupportConversation {
  return {
    ...c,
    // Keep only the UI flags required for offline display; authorization and
    // full cross-account recipient targeting stay exclusively on the server.
    metadata: {
      e2ee: true,
      ...(typeof c.metadata?.origin === "string" ? { origin: c.metadata.origin } : {}),
      ...(c.metadata?.pendingRecipientKeys === true ? { pendingRecipientKeys: true } : {}),
    },
    // Legacy or accidentally unencrypted descriptions are never cached.
    description: c.description?.startsWith("ELEEVEON_E2EE_V1:") ? c.description : "",
    lastMessage: c.lastMessage && c.lastMessage.body?.startsWith("ELEEVEON_E2EE_V1:")
      ? c.lastMessage : null,
  };
}
function safeMessage(m: SupportMessage): SupportMessage | null {
  if (!m.deletedForEveryone && !m.body?.startsWith("ELEEVEON_E2EE_V1:")) return null;
  return {
    ...m,
    // Signed storage URLs expire and are never persisted for offline reuse.
    attachments: (m.attachments || []).map(a => ({ ...a, url: null })),
  };
}

// Cache failures (quota, blocked IndexedDB, private mode) must never block chat.
export async function hubCachedInbox(scope: string): Promise<SupportConversation[] | null> {
  try { return (await getDb().inboxes.get(scope))?.conversations ?? null; }
  catch { return null; }
}
export async function hubSaveInbox(scope: string, items: SupportConversation[]): Promise<void> {
  try {
    const db = getDb();
    const safeItems = items.filter(isE2ee).slice(0, 300).map(safeConversation);
    await db.inboxes.put({scope, savedAt: Date.now(), conversations: safeItems});
    // The fresh server list decides what this principal may still see. Do not
    // resurrect hidden/deleted chats from a stale thread cache.
    const allowed = new Set(safeItems.map(x => x.id));
    const threads = await db.threads.where("scope").equals(scope).toArray();
    const obsolete = threads.filter(x => !allowed.has(x.conversationId));
    if (obsolete.length) await db.threads.bulkDelete(obsolete.map(x => x.key));
  } catch { /* unavailable or over quota */ }
}
export async function hubCachedThread(scope: string, id: string): Promise<ThreadRecord | null> {
  try { return (await getDb().threads.get(JSON.stringify([scope, id]))) ?? null; }
  catch { return null; }
}
export async function hubSaveThread(
  scope: string, conversation: SupportConversation,
  messages: SupportMessage[], devices?: HubDevice[],
): Promise<void> {
  if (!isE2ee(conversation)) return;
  try {
    const db = getDb();
    const key = JSON.stringify([scope, conversation.id]);
    const existing = await db.threads.get(key);
    // Cache the most recent messages within a 4 MiB ciphertext budget. The
    // server remains authoritative for full chat history and attachment blobs.
    const recent: SupportMessage[] = [];
    let consumed = 0;
    for (let i = messages.length - 1; i >= 0 && recent.length < 350; i--) {
      const safe = safeMessage(messages[i]);
      if (!safe) continue;
      const size = safe.body.length * 2 + 512;
      if (recent.length && consumed + size > 4 * 1024 * 1024) break;
      consumed += size;
      recent.push(safe);
    }
    recent.reverse();
    const cleanConversation = safeConversation(conversation);
    const publicDevices = devices ?? existing?.devices ?? [];
    // Skip unchanged snapshots to avoid rewriting large ciphertext arrays on
    // every 9-second background poll.
    const unchanged = existing &&
      existing.messages.length === recent.length &&
      existing.conversation.updatedAt === cleanConversation.updatedAt &&
      existing.conversation.displayTitle === cleanConversation.displayTitle &&
      existing.conversation.status === cleanConversation.status &&
      JSON.stringify(existing.devices) === JSON.stringify(publicDevices) &&
      existing.messages.every((m, i) =>
        m.id === recent[i].id && m.body === recent[i].body &&
        m.deletedForEveryone === recent[i].deletedForEveryone &&
        m.attachments?.length === recent[i].attachments?.length);
    if (unchanged) return;
    const saved: ThreadRecord = {
      key, scope, conversationId: conversation.id, savedAt: Date.now(),
      conversation: cleanConversation,
      messages: recent,
      devices: publicDevices,
    };
    await db.threads.put(saved);
    // Keep at most 25 threads per authenticated workspace cache scope.
    const entries = await db.threads.where("scope").equals(scope).sortBy("savedAt");
    if (entries.length > 25) {
      await db.threads.bulkDelete(entries.slice(0, entries.length - 25).map(x => x.key));
    }
  } catch { /* cache is optional */ }
}
export async function hubAppendConfirmedMessage(
  scope: string, conversationId: string, message: SupportMessage,
): Promise<void> {
  const record = await hubCachedThread(scope, conversationId);
  if (!record) return;
  const next = [...record.messages.filter(m => m.id !== message.id), message];
  await hubSaveThread(scope, record.conversation, next, record.devices);
}
export async function hubRemoveCachedConversation(scope: string, id: string): Promise<void> {
  try {
    const db = getDb();
    const inbox = await db.inboxes.get(scope);
    if (inbox) await db.inboxes.put({ ...inbox, conversations: inbox.conversations.filter(c => c.id !== id) });
    await db.threads.delete(JSON.stringify([scope, id]));
  } catch { /* cache is optional */ }
}
export async function hubClearScope(scope: string): Promise<void> {
  try {
    const db = getDb();
    await db.inboxes.delete(scope);
    await db.threads.where("scope").equals(scope).delete();
  } catch { /* cache is optional */ }
}
