"use client";
/**
 * Eleeveon Center — shared encrypted support chat.
 * Modern compact workspace, fixed composer and accessible attachment actions.
 * Security details remain available in the device identity panel.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EleeveonLiveSupport from "./EleeveonLiveSupport";
import { supportApi, type SupportDirectory, type SupportAttachment, type SupportConversation, type SupportMessage } from "../../lib/support/supportApi";
import {
  ensureOwnDevice, ownPublicDevice, encryptPayload, decryptPayload,
  encryptAttachment, decryptAttachment, encryptedEnvelope,
  readTrust, saveTrust, parseEnvelope, type PublicSupportDevice, type ClearSupportPayload, type SupportAttachmentManifest,
} from "../../lib/support/supportCrypto";

type Props = {
  isDeveloper: boolean; accountId: string; schoolId?: string | null; branchId?: string | null;
  membershipId?: string | null; userId?: string | null; role?: string | null;
  schoolName?: string | null; branchName?: string | null;
  navigation?: React.ReactNode;
  mobileNavigation?: React.ReactNode;
};
type DisplayAttachment = SupportAttachment & {
  encryptedSourceUrl?:string|null;
  manifest?:SupportAttachmentManifest;
  conversationId?:string;
  messageId?:string;
};
type DisplayMessage = SupportMessage & { displayBody: string; displayAttachments: DisplayAttachment[]; decrypted: boolean; error?: string };
const CATEGORIES = [
  ["support_request", "Support"], ["bug", "Bug report"], ["billing_question", "Billing"],
  ["feature_request", "Feature request"], ["suggestion", "Suggestion"],
  ["complaint", "Complaint"], ["general_feedback", "General feedback"],
] as const;
const STATUSES = ["submitted", "acknowledged", "under_review", "in_progress", "planned", "resolved", "closed"];
const MAX_BYTES = 100 * 1024 * 1024;
function readable(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); }
function stamp(s?: string) { if (!s) return ""; const d = new Date(s); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }); }
function date(s?: string) { if (!s) return ""; const d = new Date(s); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }); }
function fileSize(n: number) { return n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`; }
function isEncrypted(c: SupportConversation | null | undefined) { return c?.metadata?.e2ee === true; }
function AttachmentView({ attachment }: { attachment: DisplayAttachment }) {
  const [resolved,setResolved] = useState<string|null>(attachment.url);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(()=>{setResolved(attachment.url);},[attachment.url]);
  useEffect(()=>()=>{
    // Lazy blob URLs are owned by this attachment; eagerly-prepared URLs
    // are managed by the surrounding conversation component.
    if(attachment.encryptedSourceUrl && resolved?.startsWith("blob:"))URL.revokeObjectURL(resolved);
  },[resolved,attachment.encryptedSourceUrl]);
  const a=attachment;
  if(!resolved && a.encryptedSourceUrl && a.manifest && a.conversationId && a.messageId){
    return <div className="esc-attachment"><span>🔒 {a.name}<small>{fileSize(a.sizeBytes)} · decrypt on demand</small></span>
      <button type="button" disabled={busy} onClick={async()=>{
        setBusy(true);setError("");
        try{const url=await decryptAttachment(a.conversationId!,a.messageId!,a.encryptedSourceUrl!,a.manifest!);setResolved(url);}
        catch(cause){setError(cause instanceof Error?cause.message:"Cannot decrypt this file. Refresh the conversation and retry.");}
        finally{setBusy(false);}
      }}>{busy?"Preparing…":"Open"}</button>{error&&<small role="alert">{error}</small>}</div>;
  }
  if (!resolved) return <div className="esc-unavailable">🔒 Attachment unavailable on this device.</div>;
  if (a.kind === "image") return <a href={resolved} download={a.name} title={a.name}><img className="esc-media" src={resolved} alt={a.name}/></a>;
  if (a.kind === "video") return <video className="esc-media" src={resolved} controls playsInline preload="metadata"/>;
  if (a.kind === "audio") return <div className="esc-audio"><span className="esc-audio-icon" aria-hidden="true">♫</span><div className="esc-audio-player"><strong>Voice message</strong><audio controls preload="metadata" src={resolved} aria-label={`Voice message: ${a.name}`}/></div></div>;
  return <a className="esc-attachment" href={resolved} download={a.name}>📎 <span>{a.name}<small>{fileSize(a.sizeBytes)}</small></span> ↓</a>;
}

export default function EleeveonSupportChat({ isDeveloper, accountId, userId, schoolId, branchId, membershipId, schoolName, navigation, mobileNavigation }: Props) {
  const identity = userId || "";
  const [ready, setReady] = useState(false);
  const [ownId, setOwnId] = useState("");
  const [devices, setDevices] = useState<(PublicSupportDevice & { revoked?: boolean })[]>([]);
  const [reviewKeys, setReviewKeys] = useState(false);
  const [trustRevision, setTrustRevision] = useState(0);
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selected, setSelected] = useState("");
  const [opened, setOpened] = useState<SupportConversation | null>(null);
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [rendered, setRendered] = useState<DisplayMessage[]>([]);
  const [decryptedSubject, setDecryptedSubject] = useState<Record<string, string>>({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [directory, setDirectory] = useState<SupportDirectory>({accounts:[],users:[],memberships:[]});
  const [targetAccount,setTargetAccount] = useState("");
  const [targetScope,setTargetScope] = useState<"account"|"user"|"role">("account");
  const [targetUser,setTargetUser] = useState("");
  const [targetRole,setTargetRole] = useState("");
  const [targetSchool,setTargetSchool] = useState("");
  const [targetBranch,setTargetBranch] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("support_request");
  const [openingText, setOpeningText] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const openingRequest = useRef(0);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [headerMoreOpen, setHeaderMoreOpen] = useState(false);

  const [otherPresence, setOtherPresence] = useState("Not in chat");
  const recentTyping = useRef(0);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [, setInfo] = useState("");
  const [online, setOnline] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [cardMenuId, setCardMenuId] = useState("");
  const [editingCardId, setEditingCardId] = useState("");
  const [editingCardTitle, setEditingCardTitle] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  async function saveCardTitle() {
    const name = editingCardTitle.trim();
    if (!editingCardId || !name || savingCard) return;
    setSavingCard(true);
    try {
      const updated = await supportApi.renameConversation(editingCardId, name);
      setConversations(items => items.map(item => item.id === editingCardId ? { ...item, displayTitle: updated.displayTitle } : item));
      if (opened?.id === editingCardId) setOpened(old => old ? { ...old, displayTitle: updated.displayTitle } : old);
      setEditingCardId(""); setCardMenuId("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rename conversation."); }
    finally { setSavingCard(false); }
  }
  async function removeCard(id: string) {
    if (savingCard || !window.confirm("Remove this conversation from your inbox on all your devices? Other participants will keep their copies.")) return;
    setSavingCard(true);
    try {
      await supportApi.removeConversation(id);
      setConversations(items => items.filter(item => item.id !== id));
      if (selectedRef.current === id) {
        selectedRef.current = ""; setSelected(""); setOpened(null); setThread([]); setRendered([]); setMobileOpen(false);
      }
      setCardMenuId("");
      window.dispatchEvent(new Event("eleeveon:support-unread-refresh"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove conversation."); }
    finally { setSavingCard(false); }
  }

  async function deleteMessageOnServer(messageId: string, scope: "me" | "everyone") {
    if (!selected || deletingId) return;
    if (!window.confirm(scope === "everyone"
      ? "Delete this message for everyone? Its encrypted content will be removed from the service."
      : "Delete this message for you on every signed-in device?")) return;
    setDeletingId(messageId);
    try {
      await supportApi.deleteMessage(selected, messageId, scope);
      const detail = await supportApi.open(selected);
      setOpened(detail.conversation);
      setThread(detail.messages || []);
      if (scope === "everyone") decryptedCache.current.clear();
      window.dispatchEvent(new Event("eleeveon:support-unread-refresh"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete message.");
    } finally { setDeletingId(""); }
  }
  const markOpenedRead = useCallback(async (id: string) => {
    if (typeof document !== "undefined" && document.hidden) return;
    try { await supportApi.markRead(id); window.dispatchEvent(new Event("eleeveon:support-unread-refresh")); }
    catch { /* Read state can retry; never block viewing encrypted messages. */ }
  }, []);
  const selectedRef = useRef("");
  const refreshBusy = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  // Unsent drafts stay in memory per conversation; never cache plaintext in
  // persistent browser storage while using experimental E2EE.
  const drafts = useRef(new Map<string, string>());
  const decryptedCache = useRef(new Map<string, DisplayMessage>());
  const objectUrls = useRef(new Set<string>());
  const [, setRefreshMark] = useState(0);
  const knownActive = devices.filter(d => !d.revoked);
  const trusted = readTrust(accountId, identity);
  const changedDevices = knownActive.filter(d => d.id !== ownId && trusted[d.id] !== d.fingerprint);

  useEffect(() => {
    openingRequest.current += 1; setOpeningId("");
    selectedRef.current = "";
    setSelected(""); setOpened(null); setThread([]); setRendered([]); setConversations([]);
    setDevices([]); setOwnId(""); setReady(false); setDecryptedSubject({}); setReviewKeys(false);
    decryptedCache.current.clear(); drafts.current.clear();
    objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current.clear();
  }, [accountId, identity]);
  useEffect(() => { setOnline(typeof navigator !== "undefined" && navigator.onLine); }, []);
  useEffect(()=>{
    if(!isDeveloper)return;
    let active=true;
    void supportApi.directory(targetAccount||undefined).then(r=>{if(active)setDirectory(r);}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Cannot load recipients");});
    return()=>{active=false;};
  },[isDeveloper,targetAccount]);
  const loadKeys = useCallback(async (conversationId?: string) => {
    const result = await supportApi.keys(conversationId);
    setDevices(result.devices || []);
    return result.devices || [];
  }, []);
  const bootstrap = useCallback(async () => {
    if (!identity || !accountId) return;
    try {
      const local = await ensureOwnDevice(accountId, identity);
      const own = await ownPublicDevice(accountId, identity);
      await supportApi.registerKey({ id: local.id, encryptionPublicJwk: own.encryptionPublicJwk, signingPublicJwk: own.signingPublicJwk });
      // Pin our own device after the backend accepted exactly these public keys.
      saveTrust(accountId, identity, [{ id: own.id, accountId, userId: identity,
        encryptionPublicJwk: own.encryptionPublicJwk, signingPublicJwk: own.signingPublicJwk, fingerprint: own.fingerprint }]);
      setOwnId(local.id);
      await loadKeys();
      setReady(true);
    } catch (cause) {
      setReady(false);
      setError(cause instanceof Error ? cause.message : "Could not initialize encryption keys.");
    }
  }, [accountId, identity, loadKeys]);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  const refresh = useCallback(async (quiet = false) => {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    if (!quiet) setLoading(true);
    try {
      const list = await supportApi.list();
      setConversations(list.conversations || []);
      const current = selectedRef.current;
      if (current) {
        const result = await supportApi.open(current);
        if (current === selectedRef.current) {
          setOpened(result.conversation); setThread(result.messages || []);
          if (typeof document !== "undefined" && !document.hidden) void markOpenedRead(current);
          await loadKeys(current);
        }
      } else await loadKeys();
      setRefreshMark(Date.now());
      if (!quiet) setError("");
    } catch (cause) { if (!quiet) setError(cause instanceof Error ? cause.message : "Cannot refresh support."); }
    finally { refreshBusy.current = false; if (!quiet) setLoading(false); }
  }, [loadKeys, markOpenedRead]);
  useEffect(() => { if (ready) void refresh(); }, [ready, refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden && navigator.onLine && !busy) void refresh(true); }, 9000);
    const focus = () => { if (navigator.onLine && ready) void refresh(true); };
    const connected = () => { setOnline(true); void refresh(true); };
    const disconnected = () => setOnline(false);
    window.addEventListener("focus", focus); window.addEventListener("online", connected); window.addEventListener("offline", disconnected);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, [refresh, ready, busy]);
  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    micRef.current?.getTracks().forEach(t => t.stop());
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => { const pane = messagesRef.current; if (pane) pane.scrollTop = pane.scrollHeight; }, [rendered.length, selected]);
  useEffect(() => {
    if (!selected || !opened) { setOtherPresence("Not in chat"); return; }
    let mounted=true;
    const tick=async()=>{
      if (document.hidden || !navigator.onLine) return;
      const activity = recording ? "recording" : Date.now()-recentTyping.current<3000 ? "typing" : "online";
      try{
        await supportApi.heartbeat(selected,activity);
        const presence=await supportApi.presence(selected);
        if(mounted){const statuses=presence.people.map(p=>p.activity);
          setOtherPresence(statuses.includes("recording")?"Recording audio…":statuses.includes("typing")?"Typing…":presence.online?"Online in chat":"Not in chat");}
      }catch{if(mounted)setOtherPresence("Unavailable");}
    };
    void tick();const timer=window.setInterval(()=>void tick(),3500);
    return()=>{mounted=false;clearInterval(timer);};
  },[selected,opened?.id,recording]);
  // A body portal prevents the attachment menu being clipped by either sidebar or chat.
  function toggleAttachmentMenu() {
    if (attachMenuOpen) { setAttachMenuOpen(false); return; }
    const rect = attachmentMenuRef.current?.getBoundingClientRect();
    if (!rect || typeof window === "undefined") return;
    const width = Math.min(300, Math.max(220, window.innerWidth - 24));
    const height = Math.min(354, window.innerHeight - 24);
    const above = rect.top >= height + 18;
    const top = above ? Math.max(12, rect.top - height - 10) : Math.min(rect.bottom + 10, window.innerHeight - height - 12);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    setMenuPosition({ top: Math.max(12, top), left, width });
    setAttachMenuOpen(true);
  }
  useEffect(() => {
    if (!attachMenuOpen) return;
    const closeOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!attachmentMenuRef.current?.contains(target) && !popoverRef.current?.contains(target)) setAttachMenuOpen(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setAttachMenuOpen(false); };
    const onViewport = (e: Event) => {
      // Scrolling a short mobile menu must not dismiss it.
      if (e.type === "scroll" && popoverRef.current?.contains(e.target as Node)) return;
      setAttachMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", onViewport);
    window.addEventListener("scroll", onViewport, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("scroll", onViewport, true);
    };
  }, [attachMenuOpen]);
  // Keep the input above a phone's virtual keyboard; the message list is the
  // only scrolling pane. Desktop height comes from the Center workspace.
  useEffect(() => {
    const update = () => {
      if (!window.matchMedia("(max-width: 680px)").matches) { setViewportHeight(null); return; }
      const bounds = layoutRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
      setViewportHeight(Math.max(290, Math.min(layoutRef.current?.parentElement?.clientHeight || 900, Math.floor(bottom - bounds.top - 10))));
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [mobileOpen, newChat]);
  useEffect(() => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = "44px";
    el.style.height = `${Math.min(116, Math.max(44, el.scrollHeight))}px`;
  }, [message]);
  useEffect(() => {
    if (!opened || !identity || !ready) { setRendered([]); return; }
    let cancelled = false;
    const id = opened.id;
    const intro: SupportMessage = { id: `${id}-opening`, feedbackId: id, authorType: "school", body: opened.description,
      createdAt: opened.createdAt, authorUserId: opened.submittedByUserId || null, internal: false, attachments: [] };
    const raw = [...(opened.description?[intro]:[]), ...thread];
    const decoded = async (m: SupportMessage): Promise<DisplayMessage> => {
      // Validate the currently pinned sender key BEFORE reusing decrypted cache.
      if (m.deletedForEveryone) return { ...m, displayBody: "Message deleted", displayAttachments: [], decrypted: true };
      if (encryptedEnvelope(m.body)) {
        try {
          const from = parseEnvelope(m.body).fromDeviceId;
          const device = devices.find(d => d.id === from);
          if (!device || (m.authorUserId && m.authorUserId !== device.userId) ||
              readTrust(accountId, identity)[from] !== device.fingerprint) {
            return { ...m, displayBody: "🔒 Verify this sender's device key to read the message.",
              displayAttachments: [], decrypted: false, error: "Device fingerprint not trusted on this browser." };
          }
        } catch { return { ...m, displayBody: "🔒 Invalid encrypted message.", displayAttachments: [], decrypted: false }; }
      }
      const cached = decryptedCache.current.get(`${id}:${m.id}:${m.body}`);
      if (cached) return cached;
      if (!encryptedEnvelope(m.body)) {
        const legacy = { ...m, displayBody: m.body, displayAttachments: m.attachments || [], decrypted: false };
        return legacy;
      }
      try {
        // A server-supplied key must not be trusted merely because a signature validates.
        const fromDeviceId = parseEnvelope(m.body).fromDeviceId;
        const signedBy = devices.find(d => d.id === fromDeviceId);
        const pinned = readTrust(accountId, identity)[fromDeviceId];
        if (!signedBy || (m.authorUserId && signedBy.userId !== m.authorUserId) || !pinned || pinned !== signedBy.fingerprint) throw new Error("Verify this sender's device fingerprint before reading the message.");
        const content: ClearSupportPayload = await decryptPayload(accountId, identity, id, m.id, m.body, devices);
        const displayAttachments: DisplayAttachment[] = [];
        if (content.attachment && m.attachments?.length) {
          const cipher = m.attachments[0];
          let url: string | null = null;
          const lazy = content.attachment.sizeBytes > 8*1024*1024 && Boolean(cipher.url);
          if (cipher.url && !lazy) {
            try {
              url = await decryptAttachment(id, m.id, cipher.url, content.attachment);
              objectUrls.current.add(url);
            } catch { /* keep message readable even if attachment retrieval fails */ }
          }
          displayAttachments.push({ name: content.attachment.name, mimeType: content.attachment.mimeType,
            sizeBytes: content.attachment.sizeBytes, kind: content.attachment.kind, url, encrypted: true,
            ...(lazy?{encryptedSourceUrl:cipher.url,manifest:content.attachment,conversationId:id,messageId:m.id}:{}) });
        }
        const result = { ...m, displayBody: content.body, displayAttachments, decrypted: true };
        decryptedCache.current.set(`${id}:${m.id}:${m.body}`, result);
        if (content.subject && !cancelled) setDecryptedSubject(old => old[id] === content.subject ? old : { ...old, [id]: content.subject! });
        return result;
      } catch (cause) {
        return { ...m, displayBody: "🔒 Unable to decrypt this message on this device.", displayAttachments: [], decrypted: false,
          error: cause instanceof Error ? cause.message : "The encryption keys are unavailable." };
      }
    };
    void Promise.all(raw.map(decoded)).then(result => { if (!cancelled) setRendered(result); });
    return () => { cancelled = true; };
  }, [opened, thread, devices, accountId, identity, ready, trustRevision]);

  const visible = useMemo(() => conversations.filter(c => {
    // Display the complete server-authorized history, including earlier chats.
    // Old messages remain as originally stored; we do not pretend they were E2EE.
    if (filter === "open" && ["resolved", "closed"].includes(c.status)) return false;
    if (filter !== "open" && filter !== "all" && c.status !== filter) return false;
    const q = search.toLowerCase().trim();
    return !q || `${decryptedSubject[c.id] || ""} ${c.subject} ${c.organizationName || ""} ${c.type}`.toLowerCase().includes(q);
  }).sort((a, b) => +new Date(b.lastMessage?.createdAt || b.updatedAt) - +new Date(a.lastMessage?.createdAt || a.updatedAt)), [conversations, filter, search, decryptedSubject]);

  // Prepare the conversation, keys, text and attachment previews BEFORE navigation.
  // A failed request preserves the previously opened chat rather than showing an empty pane.
  async function openConversation(id: string) {
    if (!id || (id === selectedRef.current && opened && !openingId)) return;
    const serial = ++openingRequest.current;
    setOpeningId(id);
    setError("");
    try {
      const [detail, keyResult] = await Promise.all([
        supportApi.open(id), supportApi.keys(id),
      ]);
      const people = keyResult.devices || [];
      const intro: SupportMessage = {
        id: `${id}-opening`, feedbackId: id, authorType: "school",
        authorUserId: detail.conversation.submittedByUserId || null,
        body: detail.conversation.description, attachments: [],
        createdAt: detail.conversation.createdAt, internal: false,
      };
      const subjects: Record<string, string> = {};
      const prepared = await Promise.all([...(detail.conversation.description?[intro]:[]), ...(detail.messages || [])].map(async (m): Promise<DisplayMessage> => {
        if (m.deletedForEveryone) return { ...m, displayBody: "Message deleted", displayAttachments: [], decrypted: true };
        if (!encryptedEnvelope(m.body)) {
          return { ...m, displayBody: m.body, displayAttachments: m.attachments || [], decrypted: false };
        }
        try {
          const sourceId = parseEnvelope(m.body).fromDeviceId;
          const sender = people.find(d => d.id === sourceId);
          const pinned = readTrust(accountId, identity)[sourceId];
          if (!sender || (m.authorUserId && sender.userId !== m.authorUserId) || pinned !== sender.fingerprint) {
            return { ...m, displayBody: "🔒 Verify the sender's device before reading this message.",
              displayAttachments: [], decrypted: false, error: "Device identity requires verification." };
          }
          const content = await decryptPayload(accountId, identity, id, m.id, m.body, people);
          if (content.subject) subjects[id] = content.subject;
          const displayAttachments: DisplayAttachment[] = [];
          if (content.attachment && m.attachments?.length) {
            let url: string | null = null;
            const encryptedUrl=m.attachments[0].url;
            const lazy=content.attachment.sizeBytes>8*1024*1024 && Boolean(encryptedUrl);
            if (encryptedUrl && !lazy) {
              try { url = await decryptAttachment(id, m.id, encryptedUrl, content.attachment); }
              catch { /* The message remains accessible if a media URL expires. */ }
            }
            displayAttachments.push({
              kind: content.attachment.kind, name: content.attachment.name,
              mimeType: content.attachment.mimeType, sizeBytes: content.attachment.sizeBytes,
              url, encrypted: true,
              ...(lazy?{encryptedSourceUrl:encryptedUrl,manifest:content.attachment,conversationId:id,messageId:m.id}:{})
            });
          }
          return { ...m, displayBody: content.body, displayAttachments, decrypted: true };
        } catch (cause) {
          return { ...m, displayBody: "🔒 This message cannot be decrypted on this device.",
            displayAttachments: [], decrypted: false,
            error: cause instanceof Error ? cause.message : "The keys are unavailable." };
        }
      }));
      if (serial !== openingRequest.current) {
        for (const m of prepared) for (const a of m.displayAttachments) {
          if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
        }
        return;
      }
      // Atomic handoff: swap the header, conversation and fully prepared thread together.
      setDevices(people);
      for (const m of prepared) {
        if (m.decrypted) decryptedCache.current.set(`${id}:${m.id}:${m.body}`, m);
        for (const a of m.displayAttachments) if (a.url?.startsWith("blob:")) objectUrls.current.add(a.url);
      }
      setDecryptedSubject(old => ({ ...old, ...subjects }));
      selectedRef.current = id;
      setOpened(detail.conversation);
      setThread(detail.messages || []);
      setRendered(prepared);
      setSelected(id);
      void markOpenedRead(id);
      setNewChat(false);
      setMobileOpen(true);
      setMessage(drafts.current.get(id) || ""); setFiles([]); setAttachMenuOpen(false); setCallOpen(false);
    } catch (cause) {
      if (serial === openingRequest.current) {
        setError(cause instanceof Error ? cause.message : "Could not prepare the conversation. Try again.");
      }
    } finally {
      if (serial === openingRequest.current) setOpeningId("");
    }
  }
  async function startOutreach(){
    if(!isDeveloper||!targetAccount||busy)return;
    setBusy(true);setError("");
    try{
      const response=await supportApi.invite({accountId:targetAccount,scope:targetScope,
        ...(targetScope==="user"?{userId:targetUser}:{}),
        ...(targetScope==="role"?{role:targetRole,schoolId:targetSchool||undefined,branchId:targetBranch||undefined}:{})});
      setNewChat(false);await refresh(true);await openConversation(response.conversation.id);
      setInfo("");
    }catch(e){setError(e instanceof Error?e.message:"Could not create conversation");}
    finally{setBusy(false);}
  }
  async function recipients(id?: string) {
    if (!ready) throw new Error("Encryption keys have not finished initializing.");
    const keys = await loadKeys(id);
    const active = keys.filter(d => !d.revoked);
    const approved = readTrust(accountId, identity);
    if (!active.some(d => d.id === ownId)) throw new Error("Your current device is missing from the encryption directory.");
    if (!active.some(d => d.userId !== identity)) throw new Error("Your message is not sent yet. Eleeveon Support needs to open the Center once to register its device. Refresh keys and retry.");
    if (active.some(d => d.id !== ownId && approved[d.id] !== d.fingerprint)) {
      setReviewKeys(true);
      throw new Error("Review and verify the participant device fingerprints before encrypting.");
    }
    return active;
  }
  async function createConversation() {
    if ((!subject.trim() && !openingText.trim()) || busy || !online || !ready) return;
    setBusy(true); setError("");
    const initialSubject = subject.trim();
    const initialText = openingText.trim();
    const id = crypto.randomUUID();
    try {
      // Persist a PRIVATE, empty E2EE conversation first. Do not send the
      // subject or draft plaintext to the server while recipients lack keys.
      const { conversation } = await supportApi.create({
        conversationId: id, encrypted: true, pending: true,
        subject: "Secure support conversation", body: "", type: category,
        schoolId: schoolId || undefined, branchId: branchId || undefined,
        membershipId: membershipId || undefined, name: schoolName || undefined,
      });
      let delivered = !initialText && !initialSubject;
      let deliveryProblem = "";
      if (!delivered) {
        try {
          const keyResult = await supportApi.keys(conversation.id);
          const active = (keyResult.devices || []).filter(d => !d.revoked);
          const trust = readTrust(accountId, identity);
          if (!active.some(d => d.id === ownId)) {
            throw new Error("Your device key is not yet available. Refresh encryption keys.");
          }
          if (!active.some(d => d.userId !== identity)) {
            throw new Error("Eleeveon Support needs to open the Center once to register its encryption device.");
          }
          if (active.some(d => d.id !== ownId && trust[d.id] !== d.fingerprint)) {
            throw new Error("Verify the other participant's device fingerprints before sending.");
          }
          const firstMessageId = crypto.randomUUID();
          const cipher = await encryptPayload(accountId, identity, conversation.id, firstMessageId,
            { subject: initialSubject || undefined, body: initialText }, active);
          await supportApi.send(conversation.id, cipher, undefined, firstMessageId, true);
          delivered = true;
        } catch (cause) {
          deliveryProblem = cause instanceof Error ? cause.message : "The recipient is not ready for encrypted messages.";
        }
      }
      await refresh(true);
      await openConversation(conversation.id);
      // Keep an unsent opening draft in the composer, not on the server.
      // The user can send after refreshing/verifying recipient device keys.
      if (!delivered) {
        const draft = initialText || (initialSubject ? `Subject: ${initialSubject}` : "");
        drafts.current.set(conversation.id, draft);
        setMessage(draft);
        setError(`Conversation saved. Initial message not sent: ${deliveryProblem}`);
      } else {
        drafts.current.delete(conversation.id);
        setMessage("");
        setError("");
      }
      if (initialSubject) setDecryptedSubject(old => ({ ...old, [conversation.id]: initialSubject }));
      setNewChat(false); setSubject(""); setOpeningText("");
      setInfo("Saved");
    } catch (cause) {
      // A failed create is NOT reported as saved. Draft fields stay intact.
      setError(cause instanceof Error ? cause.message : "Could not create conversation. Nothing was saved.");
    } finally { setBusy(false); }
  }
  function addFiles(next: FileList | File[]) {
    const choices = Array.from(next);
    const tooLarge = choices.find(f => f.size > MAX_BYTES - 100);
    if (tooLarge) { setError(`${tooLarge.name} is too large. Maximum 100 MB including encryption overhead. Larger demonstrations should be compressed before sending.`); return; }
    setFiles(old => [...old, ...choices].slice(0, 6)); setError("");
  }
  async function sendMessage() {
    if (!selected || (!message.trim() && !files.length) || busy || !online) return;
    setBusy(true); setError("");
    const text = message.trim(); const queue = [...files];
    let completed = 0;
    try {
      const recipientKeys = await recipients(selected);
      const all = queue.length ? queue : [null];
      for (const item of all) {
        const mid = crypto.randomUUID();
        let safeFile: File | undefined;
        let uploadId: string | undefined;
        let attachment: ClearSupportPayload["attachment"];
        if (item) { const encrypted = await encryptAttachment(selected, mid, item); safeFile = encrypted.file; attachment = encrypted.manifest; }
        const payload = await encryptPayload(accountId, identity, selected, mid,
          { body: completed === 0 ? text : "", ...(attachment ? { attachment } : {}) }, recipientKeys);
        if(safeFile && safeFile.size > 10*1024*1024){
          const reserved=await supportApi.beginDirectUpload(selected,mid,safeFile.size);
          const upload=await fetch(reserved.signedUrl,{method:"PUT",headers:{"Content-Type":"application/octet-stream"},body:safeFile});
          if(!upload.ok)throw new Error(`Encrypted video upload failed (${upload.status}). Retry the file.`);
          uploadId=reserved.uploadId;
          safeFile=undefined;
        }
        await supportApi.send(selected, payload, safeFile, mid, true,uploadId);
        completed += 1;
      }
      setFiles([]); drafts.current.delete(selected); setMessage(""); setInfo("Saved");
      await refresh();
    } catch (cause) {
      if (completed > 0) {
        setFiles(queue.slice(completed)); setMessage("");
        setError(`${completed} attachment(s) sent. Remaining items were not sent. ${cause instanceof Error ? cause.message : "Retry the remainder."}`);
      } else setError(cause instanceof Error ? cause.message : "Encrypted message not sent. Try again.");
    } finally { setBusy(false); }
  }
  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Voice recording isn't supported in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = stream;
      const supported = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const mime = recorder.mimeType.split(";")[0] || "audio/webm";
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const audio = new File(chunks, `voice-${Date.now()}.${ext}`, { type: mime });
        if (audio.size) addFiles([audio]);
        stream.getTracks().forEach(t => t.stop()); micRef.current = null; setRecording(false);
      };
      recorder.start(); recorderRef.current = recorder; setRecording(true);
    } catch (cause) { micRef.current?.getTracks().forEach(t => t.stop()); setError(cause instanceof Error ? cause.message : "Microphone access denied."); }
  }
  async function updateStatus(next: string) {
    if (!selected || !isDeveloper) return;
    setBusy(true);
    try { await supportApi.status(selected, next); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Status update failed."); }
    finally { setBusy(false); }
  }
  const title = opened?.displayTitle || (opened && decryptedSubject[opened.id]) || opened?.subject || "Eleeveon Support";
  return <section className="esc" aria-label="Eleeveon encrypted support">
    <style>{`
      .esc {--esc-primary:var(--dashboard-primary,var(--ba-primary,#137d79));--esc-line:var(--border,rgba(110,131,145,.22));--esc-surface:var(--surface,var(--card-bg,#fff));--esc-text:var(--text,#1f3040);--esc-mute:color-mix(in srgb,var(--esc-surface) 89%,var(--esc-primary));color:var(--esc-text);font-size:13px;min-height:0;height:100%;isolation:isolate}
      .esc * {box-sizing:border-box}.esc button,.esc input,.esc textarea,.esc select{font:inherit;color:inherit}.esc button{cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .15s ease}.esc button:focus-visible,.esc textarea:focus-visible,.esc input:focus-visible,.esc select:focus-visible{outline:2px solid var(--esc-primary);outline-offset:2px}.esc button:disabled{opacity:.5;cursor:not-allowed}
      .esc-layout{display:grid;grid-template-columns:minmax(220px,29%) minmax(0,1fr);height:100%;min-height:0;min-width:0;border:1px solid var(--esc-line);border-radius:19px;overflow:hidden;background:var(--esc-surface);box-shadow:0 12px 36px rgba(15,50,60,.075)}
      .esc-side{min-width:0;min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--esc-line);background:var(--esc-surface)}
      .esc-side-title{display:flex;align-items:center;justify-content:space-between;padding:13px 13px 11px;gap:9px;min-width:0}.esc-side-title.has-center-tabs{display:block;min-height:49px;padding:7px 9px 5px}.esc-side-title strong{font-size:13px;letter-spacing:-.2px}.esc-actions{display:flex;align-items:center;gap:5px;flex:0 0 auto}.esc-actions button.primary{min-height:37px;padding:9px 8px;font-size:11px}.esc-search-row{display:flex;align-items:center;gap:5px;padding:0 8px 7px;min-width:0}.esc-search-row .esc-search{min-width:0;flex:1;width:auto;margin:0;padding:10px 9px;height:38px}.esc-mobile-nav-in-chat{display:none}
      .esc button.primary,.esc button.secondary,.esc button.icon{border-radius:12px;padding:9px 10px;border:1px solid var(--esc-line);background:var(--esc-surface);display:inline-flex;align-items:center;justify-content:center;gap:5px;line-height:1.1;white-space:nowrap}
      .esc button.primary{color:#fff;background:var(--esc-primary);border-color:transparent;font-weight:720;box-shadow:0 3px 10px color-mix(in srgb,var(--esc-primary) 20%,transparent)}.esc button.primary:hover{filter:brightness(1.08)}.esc button.icon{width:39px;height:39px;padding:0;border-radius:13px;background:var(--esc-mute);flex:0 0 auto;font-size:18px}.esc button.icon:hover{background:color-mix(in srgb,var(--esc-primary) 13%,var(--esc-surface))}
      .esc-search,.esc-filter{margin:0 11px 8px;padding:10px 12px;border:1px solid var(--esc-line);border-radius:11px;background:var(--esc-surface);width:calc(100% - 22px)}.esc-search{margin-top:2px}.esc-filter{margin-bottom:7px}
      .esc-inbox{flex:1;overflow:auto;min-height:0;padding:0 6px 8px;scrollbar-gutter:stable}
      .esc-thread-btn{display:flex;gap:10px;padding:11px 9px;width:100%;text-align:left;background:transparent;border:0;border-radius:12px;margin:2px 0;align-items:center}.esc-thread-btn.current{background:color-mix(in srgb,var(--esc-primary) 12%,var(--esc-surface))}.esc-thread-btn:hover{background:var(--esc-mute)}

      .esc-thread-card{position:relative;border-radius:12px;margin:2px 0}
      .esc-thread-card.current{background:color-mix(in srgb,var(--esc-primary) 12%,var(--esc-surface))}
      .esc-thread-card .esc-thread-btn{margin:0;padding-right:37px}
      .esc-card-menu-trigger{position:absolute;right:6px;top:10px;width:28px;height:30px;border:0;background:transparent;color:var(--esc-text);font-size:22px;border-radius:9px;cursor:pointer;display:grid;place-items:center}
      .esc-card-menu-trigger:hover,.esc-card-menu-trigger[aria-expanded=true]{background:var(--esc-mute)}
      .esc-card-menu{position:absolute;z-index:30;right:5px;top:40px;min-width:175px;padding:5px;background:var(--esc-surface);border:1px solid var(--esc-line);border-radius:12px;box-shadow:0 12px 30px #0002}
      .esc-card-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:11px 12px;border-radius:8px;font-size:12px;color:var(--esc-text);cursor:pointer}
      .esc-card-menu button:hover{background:var(--esc-mute)}
      .esc-card-menu button.esc-card-danger{color:#b32643}
      .esc-card-unread{float:right;border-radius:999px;background:var(--esc-primary);color:#fff;padding:2px 6px;font-size:10px;margin-left:6px}
      .esc-card-edit-backdrop{position:fixed;inset:0;background:#07182b88;z-index:2147481000;display:grid;place-items:center;padding:16px}
      .esc-card-edit-dialog{width:min(420px,100%);background:var(--esc-surface);color:var(--esc-text);border:1px solid var(--esc-line);border-radius:18px;padding:21px;display:grid;gap:13px;box-shadow:0 20px 60px #0004}
      .esc-card-edit-dialog input{width:100%;padding:12px;border:1px solid var(--esc-line);border-radius:10px;background:var(--esc-surface);color:var(--esc-text)}
      .esc-card-edit-dialog footer{display:flex;justify-content:flex-end;gap:9px}
      .esc-avatar{width:40px;height:40px;border-radius:15px;display:grid;place-items:center;flex-shrink:0;background:linear-gradient(145deg,color-mix(in srgb,var(--esc-primary) 16%,var(--esc-surface)),color-mix(in srgb,var(--esc-primary) 7%,var(--esc-surface)));font-weight:800;color:var(--esc-primary);border:1px solid color-mix(in srgb,var(--esc-primary) 15%,transparent)}
      .esc-thread-main{min-width:0;flex:1}.esc-thread-main strong,.esc-thread-main small,.esc-thread-main em{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.esc-thread-main strong{font-size:12px}.esc-thread-main small{opacity:.65;margin-top:4px;font-size:11px}.esc-thread-main em{font-style:normal;font-size:10px;opacity:.6;margin-top:4px}
      .esc-chat{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;position:relative;isolation:isolate;background-color:color-mix(in srgb,var(--esc-surface) 91%,var(--esc-primary));background-image:radial-gradient(ellipse 55% 48% at 1% 4%,color-mix(in srgb,var(--esc-primary) 13%,transparent),transparent 82%),radial-gradient(ellipse 55% 48% at 100% 98%,color-mix(in srgb,#8db9cc 15%,transparent),transparent 81%),radial-gradient(circle at 9px 9px,color-mix(in srgb,var(--esc-primary) 10%,transparent) 1.3px,transparent 1.4px),radial-gradient(circle at 39px 39px,color-mix(in srgb,var(--esc-primary) 6%,transparent) 1.1px,transparent 1.3px);background-size:auto,auto,58px 58px,58px 58px}
      .esc-opening{position:absolute;top:65px;right:12px;z-index:12;background:var(--esc-surface);padding:9px 13px;border:1px solid var(--esc-line);box-shadow:0 6px 24px #0002;border-radius:12px;font-size:11px}
      .esc-chat-head{background:color-mix(in srgb,var(--esc-surface) 94%,var(--esc-primary));padding:10px 13px;display:flex;align-items:center;gap:9px;min-height:65px;flex:0 0 auto;border-bottom:1px solid var(--esc-line);z-index:2}
      .esc-chat-info{flex:1;min-width:0}.esc-chat-info strong,.esc-chat-info small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.esc-chat-info strong{font-size:13px;font-weight:780}.esc-chat-info small{font-size:10.5px;opacity:.7;margin-top:4px}.esc-chat-head select{max-width:119px;font-size:11px;border:1px solid var(--esc-line);background:var(--esc-surface);border-radius:10px;padding:8px}
      .esc-body{overflow:auto;overscroll-behavior:contain;flex:1 1 auto;min-height:0;padding:16px clamp(11px,2vw,26px) 22px;scrollbar-gutter:stable}.esc-date{text-align:center;font-size:10px;width:max-content;margin:15px auto;padding:6px 12px;background:color-mix(in srgb,var(--esc-surface) 85%,transparent);border-radius:999px;border:1px solid var(--esc-line);color:var(--esc-text);opacity:.8}
      .esc-row{display:flex;justify-content:flex-start;margin:10px 0}.esc-row.mine{justify-content:flex-end}.esc-bubble{background:var(--esc-surface);padding:11px 14px;border:1px solid var(--esc-line);border-radius:18px 18px 18px 6px;box-shadow:0 3px 12px rgba(30,60,75,.055);max-width:min(85%,520px);white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.53}
      .esc-row.mine .esc-bubble{background:color-mix(in srgb,var(--esc-primary) 13%,var(--esc-surface));border-color:color-mix(in srgb,var(--esc-primary) 17%,var(--esc-line));border-radius:18px 18px 6px 18px}.esc-bubble small{display:block;opacity:.6;margin-top:7px;font-size:10px;text-align:right;white-space:nowrap}.esc-label{font-size:10px;font-weight:800;color:var(--esc-primary);margin-bottom:5px;letter-spacing:.15px}
      .esc-media{max-width:100%;max-height:330px;object-fit:contain;border-radius:13px;margin-top:8px;display:block;background:color-mix(in srgb,var(--esc-text) 5%,transparent)}.esc-audio{display:flex;align-items:center;gap:11px;margin-top:9px;padding:10px;background:color-mix(in srgb,var(--esc-primary) 8%,var(--esc-surface));border:1px solid var(--esc-line);border-radius:15px;max-width:100%}.esc-audio-icon{display:grid;place-items:center;font-size:22px;font-weight:700;color:var(--esc-primary);background:var(--esc-surface);width:41px;height:41px;border-radius:14px;flex-shrink:0}.esc-audio-player{display:grid;gap:5px;flex:1;min-width:0}.esc-audio-player strong{font-size:10px;opacity:.75}.esc-audio audio{width:min(290px,100%);height:36px;display:block;max-width:100%;accent-color:var(--esc-primary)}
      .esc-attachment{display:flex;gap:11px;align-items:center;padding:11px;border:1px solid var(--esc-line);border-radius:13px;color:inherit;text-decoration:none;margin-top:8px;background:color-mix(in srgb,var(--esc-primary) 5%,var(--esc-surface))}.esc-attachment:hover{background:color-mix(in srgb,var(--esc-primary) 11%,var(--esc-surface))}.esc-attachment span{flex:1;overflow:hidden;overflow-wrap:anywhere}.esc-attachment small{display:block;margin-top:3px;opacity:.6}.esc-unavailable{font-size:11px;opacity:.65;margin-top:8px}.esc-error-text{font-size:11px;color:#b62343;margin-top:5px}
      .esc-attach-wrap{position:relative;flex:0 0 auto}.eleeveon-attach-popover{position:fixed;z-index:2147480000;display:grid;gap:3px;max-height:calc(100dvh - 24px);overflow-y:auto;padding:10px;border-radius:18px;background:var(--surface,var(--card-bg,#fff));color:var(--text,#233241);font-size:13px;border:1px solid var(--border,rgba(120,140,155,.24));box-shadow:0 18px 52px rgba(16,41,54,.23)}.eleeveon-attach-popover strong{font-size:11px;padding:7px 9px;color:var(--text,#233241);opacity:.7}.eleeveon-attach-popover button{display:flex;align-items:center;gap:12px;min-height:44px;width:100%;padding:10px 12px;text-align:left;border:0;border-radius:12px;background:transparent;cursor:pointer;color:inherit;font:inherit}.eleeveon-attach-popover button:hover,.eleeveon-attach-popover button:focus-visible{background:color-mix(in srgb,var(--dashboard-primary,#137d79) 10%,var(--surface,#fff))}.eleeveon-attach-popover .icon-mark{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;font-size:17px;background:color-mix(in srgb,var(--dashboard-primary,#137d79) 11%,var(--surface,#fff))}
      .esc-composer-area{flex:0 0 auto;z-index:3;position:relative;margin-top:auto;background:var(--esc-surface);box-shadow:0 -8px 24px rgba(25,70,75,.05)}.esc-composer{display:flex;align-items:flex-end;gap:7px;padding:11px max(12px,2%);min-height:66px;border-top:1px solid var(--esc-line)}.esc-composer textarea{flex:1;min-width:0;height:44px;min-height:44px;resize:none;max-height:116px;overflow-y:auto;background:color-mix(in srgb,var(--esc-surface) 96%,var(--esc-primary));border-radius:15px;border:1px solid var(--esc-line);padding:12px 13px;line-height:1.45}.esc-composer textarea:focus{outline:2px solid color-mix(in srgb,var(--esc-primary) 36%,transparent);outline-offset:0}.esc-files{display:flex;gap:7px;flex-wrap:wrap;padding:8px 13px 2px;max-height:90px;overflow:auto}.esc-files button{border:1px solid var(--esc-line);border-radius:999px;padding:7px 10px;background:var(--esc-mute);max-width:100%;text-overflow:ellipsis;overflow:hidden}.esc-recording{padding:8px 16px;display:flex;align-items:center;gap:8px;color:var(--esc-primary);font-size:11px;font-weight:700}.esc-recording-dot{width:9px;height:9px;background:#e64e65;border-radius:50%;animation:esc-pulse 1s infinite alternate}@keyframes esc-pulse{to{opacity:.3}}
      .esc-banner{font-size:11px;padding:9px 12px;background:var(--esc-surface);border-bottom:1px solid var(--esc-line)}.esc-banner.warn{background:color-mix(in srgb,#e7b650 10%,var(--esc-surface))}.esc-banner.error{color:#b91c1c}.esc-banner.success{color:var(--esc-primary)}.esc-banner button{margin-left:9px;text-decoration:underline;border:0;background:transparent}.esc-form{padding:clamp(14px,2vw,24px);display:grid;gap:13px;overflow:auto}.esc-form label{display:grid;gap:6px;font-weight:600}.esc-form p{line-height:1.5;opacity:.74;margin:0}.esc-form input,.esc-form textarea,.esc-form select{border:1px solid var(--esc-line);background:var(--esc-surface);border-radius:12px;padding:11px;width:100%}.esc-empty{margin:auto;padding:23px;text-align:center;display:grid;gap:11px;justify-items:center;max-width:380px}.esc-empty strong{font-size:15px}.esc-empty p,.esc-empty small{opacity:.7;line-height:1.6}.esc-back{display:none}
      .esc-key-panel{background:var(--esc-surface);padding:15px;overflow:auto;max-height:52%;border-bottom:2px solid var(--esc-primary)}.esc-key-item{margin:9px 0;padding:10px;background:var(--esc-mute);border-radius:9px}
      .esc-pending-status{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 12px;font-size:11px;background:color-mix(in srgb,var(--esc-primary) 7%,var(--esc-surface));color:var(--esc-text);border-top:1px solid var(--esc-line)}
      .esc-pending-status span{flex:1;min-width:150px}
      .esc-pending-status button{padding:5px 8px;border:1px solid var(--esc-line);border-radius:8px;background:var(--esc-surface);font-size:11px;cursor:pointer}.esc-fingerprint{word-break:break-word;letter-spacing:.7px;font-family:monospace;font-size:11px}.esc-key-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
      .esc-chat-head{position:relative}.esc-more-trigger{font-size:23px!important}.esc-header-more{position:absolute;right:9px;top:calc(100% - 3px);z-index:30;width:min(240px,calc(100vw - 24px));padding:8px;display:grid;gap:4px;border:1px solid var(--esc-line);border-radius:14px;background:var(--esc-surface);box-shadow:0 12px 38px #0003}.esc-header-more button,.esc-header-more label{border:0;border-radius:9px;padding:10px;text-align:left;background:var(--esc-mute);font-size:12px}.esc-header-more label{display:grid;gap:6px}.esc-header-more select{max-width:none;width:100%}.esc-message-delete{display:block;margin:5px 0 0 auto;background:transparent;border:0;text-decoration:underline;text-underline-offset:2px;font-size:10px;opacity:.6;padding:4px}.esc-message-delete:hover{opacity:1}
      @media(max-width:980px) and (min-width:681px){.esc-layout{grid-template-columns:minmax(190px,34%) minmax(0,1fr)}.esc-chat-head{gap:5px;padding:8px}.esc-chat-head select{max-width:92px}.esc-bubble{max-width:94%}}
      @media(max-width:680px){.esc{height:100%;min-height:0}.esc-layout{display:block;height:100%;min-height:0;border-radius:14px}.esc-side{height:100%;border:0}.esc-chat{height:100%;display:none}.esc-layout.mobile-chat .esc-side{display:none}.esc-layout.mobile-chat .esc-chat{display:flex}.esc-back{display:inline-flex}.esc-mobile-nav-in-chat{display:flex;align-items:center;flex:0 0 auto;max-width:77px}.esc-mobile-nav-in-chat select{width:100%;max-width:77px;min-width:52px;padding:7px 3px;font-size:11px}.esc-bubble{max-width:94%}.esc-body{padding:11px 10px 16px}.esc-chat-head{min-height:56px;padding:7px;gap:5px}.esc-chat-head select{max-width:90px}.esc-chat-head .esc-avatar{display:none}.esc-mobile-nav-in-chat{display:none}.esc-chat-head .esc-call-action{display:none}.esc-chat-head .esc-chat-info{min-width:0}.esc-chat-info strong{font-size:11px}.esc-chat-info small{font-size:9px}.esc-composer{padding:9px 8px;gap:5px;min-height:59px}.esc button.icon{height:36px;width:36px}.esc-composer textarea{font-size:16px}.esc-date{margin:10px auto}}
      @media(prefers-reduced-motion:reduce){.esc *, .esc *::before, .esc *::after{animation:none!important;transition:none!important}}
    `}</style>
    <div ref={layoutRef} className={`esc-layout ${mobileOpen ? "mobile-chat" : ""}`} style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}>
      <aside className="esc-side">
        <div className={`esc-side-title ${navigation ? "has-center-tabs" : ""}`}>
          {navigation ?? <strong>{isDeveloper ? "Schools · Support" : "Eleeveon Support"}</strong>}
        </div>
        <div className="esc-search-row">
          <input className="esc-search" aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={e => setSearch(e.target.value)}/>
          <div className="esc-actions"><button className="icon" title="Refresh conversations" aria-label="Refresh conversations" onClick={() => void refresh()} disabled={loading}>↻</button><button className="primary" onClick={() => { setNewChat(true); setMobileOpen(true); }}>+ New</button></div>
        </div>
        <select className="esc-filter" value={filter} aria-label="Filter conversations" onChange={e => setFilter(e.target.value)}><option value="all">All conversations</option><option value="open">Open</option>{STATUSES.map(s => <option key={s} value={s}>{readable(s)}</option>)}</select>
        <div className="esc-inbox">{visible.map(c => <div key={c.id} className={`esc-thread-card ${selected === c.id ? "current" : ""}`}>
          <button type="button" className={`esc-thread-btn ${selected === c.id ? "current" : ""}`} aria-busy={openingId === c.id} disabled={!!openingId && openingId !== c.id} onClick={() => {setCardMenuId("");void openConversation(c.id);}}>
            <div className="esc-avatar">{(c.displayTitle || (isDeveloper ? c.organizationName : decryptedSubject[c.id] || c.subject) || "S").slice(0,1).toUpperCase()}</div>
            <div className="esc-thread-main"><strong>{c.displayTitle || (isDeveloper ? c.organizationName || "School" : decryptedSubject[c.id] || c.subject || "Support conversation")}{Number(c.unreadCount || 0) > 0 && <span aria-label={`${c.unreadCount} unread messages`} className="esc-card-unread">{c.unreadCount! > 99 ? "99+" : c.unreadCount}</span>}</strong><small>{isEncrypted(c) ? "Private conversation" : "Earlier support conversation"}</small><em>{openingId === c.id ? "◌ Opening conversation…" : `${readable(c.status)} · ${date(c.lastMessage?.createdAt || c.updatedAt)}`}</em></div>
          </button>
          <button type="button" className="esc-card-menu-trigger" aria-label="More actions for this conversation" aria-expanded={cardMenuId === c.id} onClick={() => setCardMenuId(old => old === c.id ? "" : c.id)}>⋮</button>
          {cardMenuId === c.id && <div className="esc-card-menu" role="group" aria-label="Conversation actions">
            <button type="button" onClick={() => {setEditingCardTitle(c.displayTitle || decryptedSubject[c.id] || c.subject || "");setEditingCardId(c.id);setCardMenuId("");}}>Edit title</button>
            <button type="button" className="esc-card-danger" disabled={savingCard} onClick={() => void removeCard(c.id)}>Delete conversation</button>
          </div>}
        </div>)}
          {!visible.length && <div className="esc-empty">{loading ? "Loading conversations…" : conversations.length ? "No conversations match these filters." : "No conversations yet."}</div>}</div>

      </aside>
      <div className="esc-chat">
        {openingId && selected && <div className="esc-opening" role="status" aria-live="polite">Preparing conversation…</div>}
        {newChat ? <>
          <div className="esc-chat-head"><button className="icon esc-back" onClick={() => { setNewChat(false); setMobileOpen(false); }}>←</button>{mobileNavigation && <div className="esc-mobile-nav-in-chat">{mobileNavigation}</div>}<div className="esc-chat-info"><strong>New conversation</strong><small>Private messaging</small></div><button className="secondary" onClick={() => setReviewKeys(true)}>🔐 Keys</button></div>
          {reviewKeys && !isDeveloper && <div className="esc-key-panel" role="region" aria-label="Recipient device verification">
            <strong>Recipient devices</strong>
            <p>New encrypted messages require a recipient device. Check fingerprints with the recipient through another trusted method before approving.</p>
            {!knownActive.some(d => d.userId !== identity) && <p>Eleeveon Support has not registered a device yet. They must open Eleeveon Center once.</p>}
            {knownActive.map(d => <div className="esc-key-item" key={d.id}><b>{d.id === ownId ? "This device" : "Other participant"}</b><div className="esc-fingerprint">{d.fingerprint}</div><small>{trusted[d.id] === d.fingerprint ? "Verified on this browser" : "Not verified"}</small></div>)}
            <div className="esc-key-buttons"><button className="secondary" onClick={() => void loadKeys()}>Refresh devices</button><button className="primary" disabled={!knownActive.some(d => d.userId !== identity)} onClick={() => { saveTrust(accountId, identity, knownActive); setTrustRevision(n => n + 1); setReviewKeys(false); }}>I verified these fingerprints</button><button className="secondary" onClick={() => setReviewKeys(false)}>Close</button></div>
          </div>}
          {isDeveloper ? <div className="esc-form">
            <strong>Start a conversation</strong>
            <p>Choose an account, app user, or school role to begin a private conversation.</p>
            <label>Account<select value={targetAccount} onChange={e=>{setTargetAccount(e.target.value);setTargetUser("");setTargetRole("");}}><option value="">Choose account…</option>{directory.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.email||a.id}</option>)}</select></label>
            <label>Recipients<select value={targetScope} onChange={e=>setTargetScope(e.target.value as "account"|"user"|"role")}><option value="account">All active account users</option><option value="user">Specific app user</option><option value="role">Role in a school or branch</option></select></label>
            {targetScope==="user"&&<label>App user<select value={targetUser} onChange={e=>setTargetUser(e.target.value)}><option value="">Choose user…</option>{directory.users.map(u=><option value={u.id} key={u.id}>{u.fullName} · {u.email}</option>)}</select></label>}
            {targetScope==="role"&&<><label>Role<select value={targetRole} onChange={e=>setTargetRole(e.target.value)}><option value="">Choose role…</option>{[...new Set(directory.memberships.map(m=>m.role))].map(role=><option key={role} value={role}>{readable(role)}</option>)}</select></label><label>School ID (optional)<select value={targetSchool} onChange={e=>setTargetSchool(e.target.value)}><option value="">All schools</option>{[...new Set(directory.memberships.map(m=>m.schoolId).filter((v):v is string=>!!v))].map(id=><option value={id} key={id}>{id}</option>)}</select></label><label>Branch ID (optional)<select value={targetBranch} onChange={e=>setTargetBranch(e.target.value)}><option value="">All branches</option>{[...new Set(directory.memberships.filter(m=>!targetSchool||m.schoolId===targetSchool).map(m=>m.branchId).filter((v):v is string=>!!v))].map(id=><option value={id} key={id}>{id}</option>)}</select></label></>}
            <button className="primary" disabled={!targetAccount||busy||(targetScope==="user"&&!targetUser)||(targetScope==="role"&&!targetRole)} onClick={()=>void startOutreach()}>{busy?"Creating…":"Open secure conversation"}</button>
          </div> : <div className="esc-form"><label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Subject<input maxLength={180} value={subject} onChange={e => setSubject(e.target.value)} placeholder="What would you like to discuss?"/></label><label>Message<textarea rows={6} value={openingText} onChange={e => setOpeningText(e.target.value)} placeholder="Explain your issue privately…"/></label><div className="esc-key-buttons"><button className="secondary" onClick={() => setNewChat(false)}>Cancel</button><button className="primary" disabled={!ready || (!subject.trim() && !openingText.trim()) || busy || !online} onClick={() => void createConversation()}>{busy ? "Creating…" : "Start conversation"}</button></div></div>}
        </> : selected && opened ? <>
          <div className="esc-chat-head"><button className="icon esc-back" aria-label="Back to conversations" onClick={() => setMobileOpen(false)}>←</button>{mobileNavigation && <div className="esc-mobile-nav-in-chat">{mobileNavigation}</div>}<div className="esc-avatar">{isEncrypted(opened) ? "🔒" : "💬"}</div><div className="esc-chat-info"><strong>{title}</strong><small><span style={{color:otherPresence==="Online in chat"?"#169e67":undefined}}>● {otherPresence}</span> · {readable(opened.status)}</small></div><button className="icon esc-call-action" title="Start voice or video call" aria-label="Start voice or video call" onClick={()=>setCallOpen(true)}>☎</button><button className="icon esc-more-trigger" aria-label="More conversation actions" aria-expanded={headerMoreOpen} onClick={() => setHeaderMoreOpen(v => !v)}>⋮</button>{headerMoreOpen && <div className="esc-header-more" role="group" aria-label="Conversation actions"><button type="button" onClick={() => {setReviewKeys(v => !v);setHeaderMoreOpen(false);}}>🔐 Device security{changedDevices.length ? " • Review keys" : ""}</button><button type="button" onClick={() => {setCallOpen(true);setHeaderMoreOpen(false);}}>☎ Live call</button>{isDeveloper && <label>Conversation status<select value={opened.status} disabled={busy} onChange={e => {void updateStatus(e.target.value);setHeaderMoreOpen(false);}}>{STATUSES.map(s => <option key={s} value={s}>{readable(s)}</option>)}</select></label>}</div>}</div>


          {reviewKeys && <div className="esc-key-panel"><strong>Device identity fingerprints</strong><p>Verify these fingerprints with participants through a separate trusted channel before approving. The server key directory alone cannot prove identity.</p>{knownActive.map(d => <div className="esc-key-item" key={d.id}><b>{d.id === ownId ? "This device" : d.userId === identity ? "Your other device" : "Conversation participant"}</b><div className="esc-fingerprint">{d.fingerprint}</div><small>{trusted[d.id] === d.fingerprint ? "✓ Approved on this browser" : trusted[d.id] ? "⚠ Key changed—verify carefully" : "New device—verify before sending"}</small></div>)}<div className="esc-key-buttons"><button className="secondary" onClick={() => void loadKeys(selected)}>Refresh devices</button><button className="primary" disabled={!knownActive.some(d => d.userId !== identity)} onClick={() => { saveTrust(accountId, identity, knownActive); setTrustRevision(n => n + 1); setReviewKeys(false); setInfo("Devices verified"); }}>I verified these keys</button><button className="secondary" onClick={() => setReviewKeys(false)}>Close</button></div></div>}
          <div ref={messagesRef} className="esc-body">{!rendered.length&&<div className="esc-empty" role="status"><strong>Conversation ready</strong><small>No messages yet. Start the conversation when participant encryption keys are available.</small></div>}{rendered.map((m, index) => {
            const mine = isDeveloper ? m.authorType === "platform" : m.authorType !== "platform";
            const prev = rendered[index - 1];
            return <React.Fragment key={m.id}>{(!prev || date(prev.createdAt) !== date(m.createdAt)) && <div className="esc-date">{date(m.createdAt)}</div>}<div className={`esc-row ${mine ? "mine" : ""}`}><div className="esc-bubble"><div className="esc-label">{mine ? "You" : m.authorType === "platform" ? "Eleeveon" : opened.organizationName || "School"}</div>{m.displayBody ? <div>{m.displayBody}</div> : null}{m.displayAttachments.map((a, n) => <AttachmentView key={`${m.id}:${n}`} attachment={a}/>)}{m.error && <div className="esc-error-text">{m.error}</div>}<small>{stamp(m.createdAt)} · {(m.decrypted || !encryptedEnvelope(m.body)) ? "Saved" : "Unavailable"}</small>{m.id !== `${selected}-opening` && <div className="esc-message-delete-actions"><button type="button" className="esc-message-delete" disabled={deletingId === m.id} onClick={() => void deleteMessageOnServer(m.id, "me")}>Delete for me</button>{m.authorUserId === identity && !m.deletedForEveryone && <button type="button" className="esc-message-delete" disabled={deletingId === m.id} onClick={() => void deleteMessageOnServer(m.id, "everyone")}>Delete for everyone</button>}</div>}</div></div></React.Fragment>;
          })}</div>
          <div className="esc-composer-area">
          {opened?.metadata?.pendingRecipientKeys === true && <div className="esc-pending-status" role="status"><span>Conversation saved. The first encrypted message is still pending.</span><button type="button" onClick={() => void loadKeys(selected)}>Refresh devices</button><button type="button" onClick={() => setReviewKeys(true)}>Check keys</button></div>}
          {files.length > 0 && <div className="esc-files">{files.map((f, i) => <button key={`${f.name}:${i}`} disabled={busy} onClick={() => setFiles(old => old.filter((_, k) => k !== i))}>📎 {f.name} ({fileSize(f.size)}) ×</button>)}</div>}
          {recording && <div className="esc-recording"><span className="esc-recording-dot"/> Recording voice note · tap stop to attach</div>}
          <EleeveonLiveSupport key={selected} conversationId={selected} open={callOpen} onClose={()=>setCallOpen(false)}/>
          <div className="esc-composer">
            <input ref={fileRef} type="file" hidden multiple accept="image/*,audio/*,video/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <input ref={imageRef} type="file" hidden accept="image/*" multiple onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <input ref={videoRef} type="file" hidden accept="video/*" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <div ref={attachmentMenuRef} className="esc-attach-wrap">
              <button className="icon" aria-expanded={attachMenuOpen} aria-haspopup="menu" aria-label="Attachment options" title="Add an attachment" disabled={busy || recording} onClick={toggleAttachmentMenu}>＋</button>
            </div><button className="icon" title={recording ? "Stop recording" : "Record voice note"} disabled={busy} onClick={() => recording ? recorderRef.current?.stop() : void startRecording()}>{recording ? "■" : "🎙"}</button><textarea ref={messageInputRef} rows={1} aria-label="Message" placeholder={!ready ? "Preparing chat…" : online ? "Type a message…" : "Offline"} value={message} disabled={busy || !ready} onChange={e => { setMessage(e.target.value); if (selectedRef.current) drafts.current.set(selectedRef.current, e.target.value); recentTyping.current=Date.now(); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}/><button className="primary" disabled={busy || !online || !ready || recording || (!message.trim() && !files.length)} onClick={() => void sendMessage()}>{busy ? "…" : "➤"}</button></div>
          </div>
        </> : <div className="esc-empty"><strong>Need a hand?</strong><p>Open a conversation to get help, share a file or speak with Eleeveon Support.</p><button className="primary" onClick={() => { setNewChat(true); setMobileOpen(true); }}>New conversation</button>{!ready && <small>Setting up your device encryption…</small>}</div>}
      </div>
    </div>
    {attachMenuOpen && menuPosition && typeof document !== "undefined" && createPortal(
      <div ref={popoverRef} className="eleeveon-attach-popover" role="menu" aria-label="Add to conversation" style={{ top:menuPosition.top, left:menuPosition.left, width:menuPosition.width }}>
        <strong>ADD TO CONVERSATION</strong>
        <button type="button" role="menuitem" onClick={() => { cameraRef.current?.click(); setAttachMenuOpen(false); }}><span className="icon-mark">📷</span> Camera</button>
        <button type="button" role="menuitem" onClick={() => { imageRef.current?.click(); setAttachMenuOpen(false); }}><span className="icon-mark">▧</span> Photos</button>
        <button type="button" role="menuitem" onClick={() => { videoRef.current?.click(); setAttachMenuOpen(false); }}><span className="icon-mark">▶</span> Video / demonstration</button>
        <button type="button" role="menuitem" onClick={() => { fileRef.current?.click(); setAttachMenuOpen(false); }}><span className="icon-mark">▤</span> File / document</button>
        <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); void startRecording(); }}><span className="icon-mark">♫</span> Record voice note</button>
        <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); setCallOpen(true); }}><span className="icon-mark">▣</span> Live assistance</button>
      </div>, document.body)}
    {editingCardId && <div className="esc-card-edit-backdrop" role="presentation" onMouseDown={e => {if(e.target === e.currentTarget && !savingCard)setEditingCardId("");}}>
      <div className="esc-card-edit-dialog" role="dialog" aria-modal="true" aria-label="Edit conversation title">
        <strong>Edit conversation title</strong>
        <input autoFocus maxLength={100} aria-label="Conversation title" value={editingCardTitle} onChange={e => setEditingCardTitle(e.target.value)} onKeyDown={e => {if(e.key === "Enter")void saveCardTitle();if(e.key === "Escape")setEditingCardId("");}}/>
        <small>This title is saved privately for your account. The encrypted messages stay unchanged.</small>
        <footer><button type="button" disabled={savingCard} onClick={() => setEditingCardId("")}>Cancel</button><button type="button" className="primary" disabled={savingCard || !editingCardTitle.trim()} onClick={() => void saveCardTitle()}>{savingCard ? "Saving…" : "Save title"}</button></footer>
      </div>
    </div>}
    {error && <div className="esc-banner error" role="alert">{error} <button onClick={() => setError("")}>Dismiss</button></div>}

  </section>;
}
