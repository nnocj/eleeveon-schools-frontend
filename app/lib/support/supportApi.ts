"use client";
/** Server-authoritative support API: never use school SyncRecord for cross-account messages. */
import { getApiBaseUrl, getAuthToken } from "../sync/syncConfig";

export type SupportAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "video" | "audio" | "document";
  url: string | null;
};
export type SupportMessage = {
  id: string;
  feedbackId: string;
  authorType: string;
  authorUserId?: string | null;
  body: string;
  attachments?: SupportAttachment[];
  internal: boolean;
  createdAt: string;
};
export type SupportConversation = {
  id: string;
  accountId?: string | null;
  subject: string;
  description: string;
  type: string;
  status: string;
  priority?: string;
  organizationName?: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: { body: string; createdAt: string; authorType: string } | null;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl();
  const token = getAuthToken();
  if (!base) throw new Error("The Eleeveon API address is not configured.");
  if (!token) throw new Error("Your session is unavailable. Please sign in again.");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(!(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const raw = await response.text();
  let parsed: any = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { message: raw }; }
  if (!response.ok) {
    const message = parsed?.message || parsed?.error || `Support request failed (${response.status}).`;
    throw new Error(Array.isArray(message) ? message.join("; ") : String(message));
  }
  return parsed as T;
}

export const supportApi = {
  list: () => request<{ conversations: SupportConversation[]; meta?: {
    inboxScope: "platform" | "account";
    platformConfigured: boolean;
    platformAccountMatches: boolean;
    conversationCount: number;
  } }>("/support/conversations"),
  open: (id: string) => request<{ conversation: SupportConversation; messages: SupportMessage[] }>(`/support/conversations/${encodeURIComponent(id)}`),
  create: (data: { subject: string; body: string; type: string; schoolId?: string; branchId?: string; membershipId?: string; name?: string }) =>
    request<{ conversation: SupportConversation }>("/support/conversations", { method: "POST", body: JSON.stringify(data) }),
  send: (id: string, body: string, file?: File, clientId?: string) => {
    const form = new FormData();
    form.append("body", body);
    if (file) form.append("file", file, file.name);
    if (clientId) form.append("clientId", clientId);
    return request<{ message: SupportMessage }>(`/support/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: form });
  },
  status: (id: string, status: string) => request<{ conversation: SupportConversation }>(`/support/conversations/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
