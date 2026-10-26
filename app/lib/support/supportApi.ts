"use client";
/** Server-authoritative support API: never use school SyncRecord for cross-account messages. */
import { getApiBaseUrl, getAuthToken } from "../sync/syncConfig";
import type { PublicSupportDevice } from "./supportCrypto";

export type SupportAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "video" | "audio" | "document";
  url: string | null;
  encrypted?: boolean;
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
  metadata?: Record<string, unknown> | null;
  submittedByUserId?: string | null;
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

export type SurveyQuestion = { id: string; label: string; type: "text" | "long_text" | "single" | "multiple" | "yes_no" | "rating"; required: boolean; options?: string[] };
export type EleeveonSurvey = { id:string; title:string; description?:string|null; questions:SurveyQuestion[]; targeting?:Record<string,unknown>|null;status:string; completedAt?:string|null; createdAt:string };

export type SupportPresence = {online:boolean;people:{userId:string;activity:string;updatedAt:string}[]};
export type SupportCallSignal = {id:string;feedbackId:string;fromUserId:string;sessionId:string;kind:string;payload:any;createdAt:string};
export type SupportDirectory = { accounts:{id:string;name:string;email?:string|null}[];users:{id:string;fullName:string;email:string}[];
 memberships:{userId:string;role:string;schoolId?:string|null;branchId?:string|null}[]};
export const supportApi = {
  beginDirectUpload:(id:string,messageId:string,sizeBytes:number)=>request<{uploadId:string;signedUrl:string;maxBytes:number}>(`/support/conversations/${encodeURIComponent(id)}/direct-uploads`,{method:"POST",body:JSON.stringify({messageId,sizeBytes})}),
  directory:(accountId?:string)=>request<SupportDirectory>(`/support/directory${accountId?`?accountId=${encodeURIComponent(accountId)}`:""}`),
  invite:(data:{accountId:string;scope:"account"|"user"|"role";userId?:string;role?:string;schoolId?:string;branchId?:string})=>request<{conversation:SupportConversation}>("/support/invitations",{method:"POST",body:JSON.stringify(data)}),
  heartbeat:(id:string,activity:"online"|"typing"|"recording")=>request(`/support/conversations/${encodeURIComponent(id)}/presence`,{method:"POST",body:JSON.stringify({activity})}),
  presence:(id:string)=>request<SupportPresence>(`/support/conversations/${encodeURIComponent(id)}/presence`),
  callConfig:()=>request<{iceServers:RTCIceServer[];turnConfigured:boolean}>("/support/calls/config"),
  sendSignal:(id:string,kind:string,sessionId:string,payload:any)=>request(`/support/conversations/${encodeURIComponent(id)}/call-signals`,{method:"POST",body:JSON.stringify({kind,sessionId,payload})}),
  signals:(id:string,since:number)=>request<{signals:SupportCallSignal[]}>(`/support/conversations/${encodeURIComponent(id)}/call-signals?since=${encodeURIComponent(String(since))}`),
  surveys:()=>request<{surveys:EleeveonSurvey[];platform:boolean}>("/support/surveys"),
  createSurvey:(data:{title:string;description:string;questions:SurveyQuestion[];status:string;targeting:Record<string,unknown>;closesAt:string|null})=>request<{survey:EleeveonSurvey}>("/support/surveys",{method:"POST",body:JSON.stringify(data)}),
  submitSurvey:(id:string,answers:Record<string,string|string[]>)=>request<{response:{id:string}}>(`/support/surveys/${encodeURIComponent(id)}/responses`,{method:"POST",body:JSON.stringify({answers})}),
  surveyResults:(id:string)=>request<{survey:EleeveonSurvey;count:number;responses:{accountId:string;answers:Record<string,string|string[]>}[]}>(`/support/surveys/${encodeURIComponent(id)}/results`),
  surveyStatus:(id:string,status:string)=>request(`/support/surveys/${encodeURIComponent(id)}/status`,{method:"PATCH",body:JSON.stringify({status})}),
  keys: (conversationId?: string) => request<{ devices: (PublicSupportDevice & { revoked?: boolean })[] }>(`/support/keys${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`),
  registerKey: (data: { id: string; encryptionPublicJwk: JsonWebKey; signingPublicJwk: JsonWebKey }) =>
    request<{ device: PublicSupportDevice }>("/support/keys", { method: "POST", body: JSON.stringify(data) }),
  list: () => request<{ conversations: SupportConversation[] }>("/support/conversations"),
  open: (id: string) => request<{ conversation: SupportConversation; messages: SupportMessage[] }>(`/support/conversations/${encodeURIComponent(id)}`),
  create: (data: { subject: string; body: string; type: string; schoolId?: string; branchId?: string; membershipId?: string; name?: string; encrypted?: boolean; conversationId?: string }) =>
    request<{ conversation: SupportConversation }>("/support/conversations", { method: "POST", body: JSON.stringify(data) }),
  send: (id: string, body: string, file?: File, clientId?: string, encrypted = false, uploadId?:string) => {
    const form = new FormData();
    form.append("body", body);
    if (encrypted) form.append("encrypted", "true");
    if (file) form.append("file", file, file.name);
    if (clientId) form.append("clientId", clientId);
    if (uploadId) form.append("uploadId",uploadId);
    return request<{ message: SupportMessage }>(`/support/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: form });
  },
  status: (id: string, status: string) => request<{ conversation: SupportConversation }>(`/support/conversations/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
