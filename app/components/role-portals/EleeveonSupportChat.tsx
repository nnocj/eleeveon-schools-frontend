"use client";
/**
 * Eleeveon Center — experimental end-to-end encrypted support.
 * Text, voice, images, videos, files encrypted on the browser before sending.
 * Legacy support conversations remain visibly labelled unencrypted.
 * Keys are local browser CryptoKeys; no recovery/Signal ratchet in this version.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  if (a.kind === "audio") return <div className="esc-audio">🎙 <audio controls preload="metadata" src={resolved}/></div>;
  return <a className="esc-attachment" href={resolved} download={a.name}>📎 <span>{a.name}<small>{fileSize(a.sizeBytes)}</small></span> ↓</a>;
}

export default function EleeveonSupportChat({ isDeveloper, accountId, userId, schoolId, branchId, membershipId, schoolName }: Props) {
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
  const [otherPresence, setOtherPresence] = useState("Not in chat");
  const recentTyping = useRef(0);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [online, setOnline] = useState(true);
  const selectedRef = useRef("");
  const refreshBusy = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const decryptedCache = useRef(new Map<string, DisplayMessage>());
  const objectUrls = useRef(new Set<string>());
  const [refreshMark, setRefreshMark] = useState(0);
  const knownActive = devices.filter(d => !d.revoked);
  const trusted = readTrust(accountId, identity);
  const changedDevices = knownActive.filter(d => d.id !== ownId && trusted[d.id] !== d.fingerprint);
  const selectedIsEncrypted = isEncrypted(opened);

  useEffect(() => {
    openingRequest.current += 1; setOpeningId("");
    selectedRef.current = "";
    setSelected(""); setOpened(null); setThread([]); setRendered([]); setConversations([]);
    setDevices([]); setOwnId(""); setReady(false); setDecryptedSubject({}); setReviewKeys(false);
    decryptedCache.current.clear();
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
          await loadKeys(current);
        }
      } else await loadKeys();
      setRefreshMark(Date.now());
      if (!quiet) setError("");
    } catch (cause) { if (!quiet) setError(cause instanceof Error ? cause.message : "Cannot refresh support."); }
    finally { refreshBusy.current = false; if (!quiet) setLoading(false); }
  }, [loadKeys]);
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
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [rendered.length, selected]);
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
  useEffect(() => {
    if (!attachMenuOpen) return;
    const close = (e: PointerEvent) => { if (!attachmentMenuRef.current?.contains(e.target as Node)) setAttachMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [attachMenuOpen]);
  useEffect(() => {
    if (!opened || !identity || !ready) { setRendered([]); return; }
    let cancelled = false;
    const id = opened.id;
    const intro: SupportMessage = { id: `${id}-opening`, feedbackId: id, authorType: "school", body: opened.description,
      createdAt: opened.createdAt, authorUserId: opened.submittedByUserId || null, internal: false, attachments: [] };
    const raw = [...(opened.description?[intro]:[]), ...thread];
    const decoded = async (m: SupportMessage): Promise<DisplayMessage> => {
      // Validate the currently pinned sender key BEFORE reusing decrypted cache.
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
      setNewChat(false);
      setMobileOpen(true);
      setMessage(""); setFiles([]); setAttachMenuOpen(false); setCallOpen(false);
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
      setInfo("Conversation created. When the recipient has enrolled and verified their encryption keys, you can send an encrypted message.");
    }catch(e){setError(e instanceof Error?e.message:"Could not create conversation");}
    finally{setBusy(false);}
  }
  async function recipients(id?: string) {
    if (!ready) throw new Error("Encryption keys have not finished initializing.");
    const keys = await loadKeys(id);
    const active = keys.filter(d => !d.revoked);
    const approved = readTrust(accountId, identity);
    if (!active.some(d => d.id === ownId)) throw new Error("Your current device is missing from the encryption directory.");
    if (!active.some(d => d.userId !== identity)) throw new Error("No other participant has an enrolled device. Eleeveon support must first open Support to register its device.");
    if (active.some(d => d.id !== ownId && approved[d.id] !== d.fingerprint)) {
      setReviewKeys(true);
      throw new Error("Review and verify the participant device fingerprints before encrypting.");
    }
    return active;
  }
  async function createConversation() {
    if (!subject.trim() || !openingText.trim() || busy || !online) return;
    setBusy(true); setError("");
    try {
      const recipientKeys = await recipients();
      const id = crypto.randomUUID();
      const cipher = await encryptPayload(accountId, identity, id, `${id}-opening`, { subject: subject.trim(), body: openingText.trim() }, recipientKeys);
      const { conversation } = await supportApi.create({
        conversationId: id, encrypted: true, subject: "Encrypted support conversation", body: cipher, type: category,
        schoolId: schoolId || undefined, branchId: branchId || undefined,
        membershipId: membershipId || undefined, name: schoolName || undefined,
      });
      setNewChat(false); setSubject(""); setOpeningText("");
      await openConversation(conversation.id); await refresh(true);
      setInfo("Saved");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create conversation."); }
    finally { setBusy(false); }
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
      setFiles([]); setMessage(""); setInfo("Saved");
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
  const title = (opened && decryptedSubject[opened.id]) || opened?.subject || "Eleeveon Support";
  return <section className="esc" aria-label="Eleeveon encrypted support">
    <style>{`
      .esc{color:var(--text,#17212f);--esc-primary:var(--ba-primary,var(--primary-color,#168377));--esc-border:var(--border,rgba(115,130,145,.23));--esc-surface:var(--surface,var(--card-bg,#fff));--esc-muted:var(--surface-muted,rgba(120,137,156,.08));font-size:13px}
      .esc *{box-sizing:border-box}.esc button,.esc input,.esc textarea,.esc select{font:inherit;color:inherit}.esc button{cursor:pointer}.esc button:disabled{opacity:.45;cursor:not-allowed}
      .esc-layout{height:min(79vh,785px);min-height:480px;border:1px solid var(--esc-border);border-radius:15px;overflow:hidden;display:grid;grid-template-columns:minmax(230px,32%) minmax(0,1fr);background:var(--esc-surface)}
      .esc-side{min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--esc-border)}.esc-side-title{display:flex;align-items:center;justify-content:space-between;padding:12px;gap:8px;border-bottom:1px solid var(--esc-border)}.esc-actions{display:flex;gap:5px}
      .esc button.primary,.esc button.secondary,.esc button.icon{border-radius:10px;padding:9px;border:1px solid var(--esc-border);background:var(--esc-surface)}.esc button.primary{color:white;background:var(--esc-primary);border-color:transparent;font-weight:700}.esc button.icon{min-width:36px;height:36px;display:grid;place-items:center;background:var(--esc-muted)}
      .esc-search,.esc-filter{margin:10px 12px 0;padding:10px;border:1px solid var(--esc-border);border-radius:9px;background:var(--esc-surface);width:calc(100% - 24px)}.esc-filter{margin-top:5px;margin-bottom:10px}
      .esc-inbox{flex:1;overflow-y:auto;min-height:0}.esc-thread-btn{display:flex;gap:10px;padding:12px;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--esc-border);align-items:flex-start}.esc-thread-btn.current,.esc-thread-btn:hover{background:var(--esc-muted)}.esc-avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;background:color-mix(in srgb,var(--esc-primary) 15%,transparent);font-weight:800;color:var(--esc-primary)}.esc-thread-main{min-width:0;flex:1}.esc-thread-main strong,.esc-thread-main small,.esc-thread-main em{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.esc-thread-main small{opacity:.64;margin-top:4px}.esc-thread-main em{font-style:normal;font-size:10px;opacity:.7;margin-top:3px}
      .esc-chat{display:flex;flex-direction:column;min-width:0;min-height:0;position:relative;background:linear-gradient(148deg,rgba(115,171,171,.12),transparent 43%),radial-gradient(circle at 12% 18%,rgba(109,152,158,.095) 0 4px,transparent 5px),radial-gradient(circle at 82% 76%,rgba(109,152,158,.075) 0 5px,transparent 6px),var(--esc-muted);background-size:auto,100px 100px,145px 145px,auto}.esc-opening{position:absolute;top:62px;right:14px;z-index:6;background:var(--esc-surface);padding:9px 14px;border:1px solid var(--esc-border);box-shadow:0 6px 22px #0002;border-radius:12px;font-size:12px}.esc-chat-head{background:var(--esc-surface);padding:10px 12px;display:flex;align-items:center;gap:8px;min-height:59px;border-bottom:1px solid var(--esc-border)}.esc-chat-info{flex:1;min-width:0}.esc-chat-info strong,.esc-chat-info small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.esc-chat-info small{font-size:11px;opacity:.7;margin-top:3px}.esc-chat-head select{max-width:135px;font-size:11px;border:1px solid var(--esc-border);background:var(--esc-surface);border-radius:8px;padding:7px}
      .esc-body{overflow:auto;flex:1;min-height:0;padding:16px 14px}.esc-date{text-align:center;font-size:11px;opacity:.55;margin:12px}.esc-row{display:flex;justify-content:flex-start;margin:8px 0}.esc-row.mine{justify-content:flex-end}.esc-bubble{background:var(--esc-surface);padding:10px 12px;border:1px solid var(--esc-border);border-radius:12px 12px 12px 4px;max-width:min(85%,480px);white-space:pre-wrap;word-wrap:break-word}.esc-row.mine .esc-bubble{background:color-mix(in srgb,var(--esc-primary) 13%,var(--esc-surface));border-radius:12px 12px 4px 12px}.esc-bubble small{display:block;opacity:.6;margin-top:7px;font-size:10px;text-align:right}.esc-label{font-size:10px;font-weight:750;color:var(--esc-primary);margin-bottom:5px}
      .esc-media{max-width:100%;max-height:310px;object-fit:contain;border-radius:9px;margin-top:7px}.esc-audio{display:flex;align-items:center;gap:6px;margin-top:6px}.esc-audio audio{width:min(255px,100%);max-width:100%}.esc-attachment{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--esc-border);border-radius:9px;color:inherit;text-decoration:none;margin-top:8px}.esc-attachment span{flex:1;overflow:hidden;overflow-wrap:anywhere}.esc-attachment small{display:block;margin-top:3px;opacity:.6}.esc-unavailable{font-size:11px;opacity:.65;margin-top:8px}.esc-error-text{font-size:11px;color:#be123c;margin-top:5px}
      .esc-attach-wrap{position:relative;flex:0 0 auto}.esc-attach-menu{position:absolute;bottom:calc(100% + 12px);left:0;z-index:30;min-width:190px;padding:8px;display:grid;gap:3px;max-height:min(340px,65vh);overflow-y:auto;background:var(--esc-surface);border:1px solid var(--esc-border);border-radius:14px;box-shadow:0 10px 35px #0003}.esc-attach-menu button{padding:10px;text-align:left;border:0;border-radius:9px;background:transparent}.esc-attach-menu button:hover,.esc-attach-menu button:focus-visible{background:var(--esc-muted)}
      .esc-composer{display:flex;align-items:flex-end;gap:7px;padding:9px;background:var(--esc-surface);border-top:1px solid var(--esc-border)}.esc-composer textarea{flex:1;min-width:0;min-height:41px;resize:vertical;max-height:110px;background:var(--esc-surface);border-radius:11px;border:1px solid var(--esc-border);padding:11px}.esc-files{display:flex;gap:7px;flex-wrap:wrap;padding:8px;background:var(--esc-surface);border-top:1px solid var(--esc-border)}.esc-files button{border:1px solid var(--esc-border);border-radius:99px;padding:5px 9px;background:var(--esc-muted);max-width:100%;text-overflow:ellipsis;overflow:hidden}
      .esc-banner{font-size:12px;padding:9px 11px;background:var(--esc-surface);border-bottom:1px solid var(--esc-border)}.esc-banner.warn{background:rgba(230,160,32,.10)}.esc-banner.error{color:#b91c1c}.esc-banner.success{color:var(--esc-primary)}.esc-banner button{margin-left:9px;text-decoration:underline;border:0;background:transparent}.esc-foot{font-size:10px;opacity:.65;padding:8px 12px;border-top:1px solid var(--esc-border)}.esc-form{padding:16px;display:grid;gap:12px;overflow:auto}.esc-form label{display:grid;gap:5px}.esc-form input,.esc-form textarea,.esc-form select{border:1px solid var(--esc-border);background:var(--esc-surface);border-radius:9px;padding:10px;width:100%}.esc-empty{margin:auto;padding:20px;text-align:center;display:grid;gap:12px;justify-items:center;opacity:.8}.esc-back{display:none}
      .esc-key-panel{background:var(--esc-surface);padding:14px;overflow:auto;max-height:50%;border-bottom:2px solid var(--esc-primary)}.esc-key-item{margin:9px 0;padding:10px;background:var(--esc-muted);border-radius:8px}.esc-fingerprint{word-break:break-word;letter-spacing:.8px;font-family:monospace;font-size:11px}.esc-key-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
      @media(max-width:680px){.esc-layout{display:block;height:min(80dvh,780px);min-height:480px}.esc-side{height:100%;border:0}.esc-chat{height:100%;display:none}.esc-layout.mobile-chat .esc-side{display:none}.esc-layout.mobile-chat .esc-chat{display:flex}.esc-back{display:grid}.esc-bubble{max-width:93%}.esc-body{padding:10px}.esc-chat-head select{max-width:106px}}
    `}</style>
    <div className={`esc-layout ${mobileOpen ? "mobile-chat" : ""}`}>
      <aside className="esc-side">
        <div className="esc-side-title"><strong>{isDeveloper ? "Schools · Support" : "Eleeveon Support"}</strong><div className="esc-actions"><button className="icon" title="Refresh" onClick={() => void refresh()} disabled={loading}>↻</button><button className="primary" onClick={() => { setNewChat(true); setMobileOpen(true); }}>+ New</button></div></div>
        <input className="esc-search" placeholder="Search conversations" value={search} onChange={e => setSearch(e.target.value)}/>
        <select className="esc-filter" value={filter} aria-label="Filter conversations" onChange={e => setFilter(e.target.value)}><option value="all">All conversations</option><option value="open">Open</option>{STATUSES.map(s => <option key={s} value={s}>{readable(s)}</option>)}</select>
        <div className="esc-inbox">{visible.map(c => <button key={c.id} className={`esc-thread-btn ${selected === c.id ? "current" : ""}`} aria-busy={openingId === c.id} disabled={!!openingId && openingId !== c.id} onClick={() => void openConversation(c.id)}>
          <div className="esc-avatar">{(isDeveloper ? c.organizationName : decryptedSubject[c.id] || c.subject || "S")?.slice(0, 1).toUpperCase()}</div><div className="esc-thread-main"><strong>{isDeveloper ? (c.organizationName || "School") : (decryptedSubject[c.id] || (isEncrypted(c) ? "🔒 Encrypted conversation" : c.subject))}</strong><small>{isEncrypted(c) ? "🔒 Encrypted messages" : "⚠ Legacy unencrypted conversation"}</small><em>{openingId === c.id ? "◌ Opening conversation…" : `${readable(c.status)} · ${date(c.lastMessage?.createdAt || c.updatedAt)}`}</em></div></button>)}
          {!visible.length && <div className="esc-empty">No conversations yet.</div>}</div>
        <div className="esc-foot">{online ? "Online" : "Offline"} · {ready ? "Encryption device enrolled" : "Encryption unavailable"}{refreshMark ? ` · ${stamp(new Date(refreshMark).toISOString())}` : ""}</div>
      </aside>
      <div className="esc-chat">
        {openingId && selected && <div className="esc-opening" role="status" aria-live="polite">Preparing conversation…</div>}
        {newChat ? <>
          <div className="esc-chat-head"><button className="icon esc-back" onClick={() => { setNewChat(false); setMobileOpen(false); }}>←</button><div className="esc-chat-info"><strong>New encrypted conversation</strong><small>Only enrolled participant devices can decrypt</small></div><button className="secondary" onClick={() => setReviewKeys(true)}>🔐 Keys</button></div>
          {isDeveloper ? <div className="esc-form">
            <strong>Start a conversation</strong>
            <p>Choose the intended account, user or branch role. The invitation carries no plaintext chat content.</p>
            <label>Account<select value={targetAccount} onChange={e=>{setTargetAccount(e.target.value);setTargetUser("");setTargetRole("");}}><option value="">Choose account…</option>{directory.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.email||a.id}</option>)}</select></label>
            <label>Recipients<select value={targetScope} onChange={e=>setTargetScope(e.target.value as "account"|"user"|"role")}><option value="account">All active account users</option><option value="user">Specific app user</option><option value="role">Role in a school or branch</option></select></label>
            {targetScope==="user"&&<label>App user<select value={targetUser} onChange={e=>setTargetUser(e.target.value)}><option value="">Choose user…</option>{directory.users.map(u=><option value={u.id} key={u.id}>{u.fullName} · {u.email}</option>)}</select></label>}
            {targetScope==="role"&&<><label>Role<select value={targetRole} onChange={e=>setTargetRole(e.target.value)}><option value="">Choose role…</option>{[...new Set(directory.memberships.map(m=>m.role))].map(role=><option key={role} value={role}>{readable(role)}</option>)}</select></label><label>School ID (optional)<select value={targetSchool} onChange={e=>setTargetSchool(e.target.value)}><option value="">All schools</option>{[...new Set(directory.memberships.map(m=>m.schoolId).filter((v):v is string=>!!v))].map(id=><option value={id} key={id}>{id}</option>)}</select></label><label>Branch ID (optional)<select value={targetBranch} onChange={e=>setTargetBranch(e.target.value)}><option value="">All branches</option>{[...new Set(directory.memberships.filter(m=>!targetSchool||m.schoolId===targetSchool).map(m=>m.branchId).filter((v):v is string=>!!v))].map(id=><option value={id} key={id}>{id}</option>)}</select></label></>}
            <button className="primary" disabled={!targetAccount||busy||(targetScope==="user"&&!targetUser)||(targetScope==="role"&&!targetRole)} onClick={()=>void startOutreach()}>{busy?"Creating…":"Open secure conversation"}</button>
          </div> : <div className="esc-form"><label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Subject<input maxLength={180} value={subject} onChange={e => setSubject(e.target.value)} placeholder="What would you like to discuss?"/></label><label>Message<textarea rows={6} value={openingText} onChange={e => setOpeningText(e.target.value)} placeholder="Explain your issue privately…"/></label><div className="esc-key-buttons"><button className="secondary" onClick={() => setNewChat(false)}>Cancel</button><button className="primary" disabled={!ready || !subject.trim() || !openingText.trim() || busy || !online} onClick={() => void createConversation()}>{busy ? "Encrypting…" : "Start encrypted chat"}</button></div></div>}
        </> : selected && opened ? <>
          <div className="esc-chat-head"><button className="icon esc-back" aria-label="Back to conversations" onClick={() => setMobileOpen(false)}>←</button><div className="esc-avatar">🔒</div><div className="esc-chat-info"><strong>{title}</strong><small><span style={{color:otherPresence==="Online in chat"?"#169e67":undefined}}>● {otherPresence}</span> · {readable(opened.status)}</small></div><button className="icon" title="Start voice or video call" aria-label="Start voice or video call" onClick={()=>setCallOpen(true)}>☎</button><button className="icon" title="View encryption keys" onClick={() => setReviewKeys(v => !v)}>🔐</button>{isDeveloper && <select value={opened.status} disabled={busy} onChange={e => void updateStatus(e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{readable(s)}</option>)}</select>}</div>
          {selectedIsEncrypted ? <div className="esc-banner success">🔒 Messages and attachments encrypted on your device. The server cannot read their contents. Key verification is recommended.</div> : <div className="esc-banner warn">⚠ This conversation began without E2EE. Earlier messages may have been stored as plaintext. New replies use encryption.</div>}
          {changedDevices.length > 0 && <div className="esc-banner warn">⚠ New or changed participant keys require verification. <button onClick={() => setReviewKeys(true)}>Review devices</button></div>}
          {reviewKeys && <div className="esc-key-panel"><strong>Device identity fingerprints</strong><p>Verify these fingerprints with participants through a separate trusted channel before approving. The server key directory alone cannot prove identity.</p>{knownActive.map(d => <div className="esc-key-item" key={d.id}><b>{d.id === ownId ? "This device" : d.userId === identity ? "Your other device" : "Conversation participant"}</b><div className="esc-fingerprint">{d.fingerprint}</div><small>{trusted[d.id] === d.fingerprint ? "✓ Approved on this browser" : trusted[d.id] ? "⚠ Key changed—verify carefully" : "New device—verify before sending"}</small></div>)}<div className="esc-key-buttons"><button className="primary" onClick={() => { saveTrust(accountId, identity, knownActive); setTrustRevision(n => n + 1); setReviewKeys(false); setInfo("Device fingerprints approved locally. Remember to verify them out of band."); }}>I verified these keys</button><button className="secondary" onClick={() => setReviewKeys(false)}>Close</button></div></div>}
          <div className="esc-body">{!rendered.length&&<div className="esc-empty" role="status"><strong>Conversation ready</strong><small>No messages yet. Start the conversation when participant encryption keys are available.</small></div>}{rendered.map((m, index) => {
            const mine = isDeveloper ? m.authorType === "platform" : m.authorType !== "platform";
            const prev = rendered[index - 1];
            return <React.Fragment key={m.id}>{(!prev || date(prev.createdAt) !== date(m.createdAt)) && <div className="esc-date">{date(m.createdAt)}</div>}<div className={`esc-row ${mine ? "mine" : ""}`}><div className="esc-bubble"><div className="esc-label">{mine ? "You" : m.authorType === "platform" ? "Eleeveon" : opened.organizationName || "School"}</div>{m.displayBody ? <div>{m.displayBody}</div> : null}{m.displayAttachments.map((a, n) => <AttachmentView key={`${m.id}:${n}`} attachment={a}/>)}{m.error && <div className="esc-error-text">{m.error}</div>}<small>{stamp(m.createdAt)} · {m.decrypted ? "🔒 Saved" : "⚠ Legacy/locked"}</small></div></div></React.Fragment>;
          })}<div ref={bottomRef}/></div>
          {files.length > 0 && <div className="esc-files">{files.map((f, i) => <button key={`${f.name}:${i}`} disabled={busy} onClick={() => setFiles(old => old.filter((_, k) => k !== i))}>📎 {f.name} ({fileSize(f.size)}) ×</button>)}</div>}
          {recording && <div className="esc-banner warn">🎙 Recording… select Stop to finish.</div>}
          <EleeveonLiveSupport key={selected} conversationId={selected} open={callOpen} onClose={()=>setCallOpen(false)}/>
          <div className="esc-composer">
            <input ref={fileRef} type="file" hidden multiple accept="image/*,audio/*,video/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <input ref={imageRef} type="file" hidden accept="image/*" multiple onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <input ref={videoRef} type="file" hidden accept="video/*" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <div ref={attachmentMenuRef} className="esc-attach-wrap">
              {attachMenuOpen && <div className="esc-attach-menu" role="menu" aria-label="Add to chat">
                <button role="menuitem" onClick={() => { cameraRef.current?.click(); setAttachMenuOpen(false); }}>📷 Camera</button>
                <button role="menuitem" onClick={() => { imageRef.current?.click(); setAttachMenuOpen(false); }}>🖼 Photos</button>
                <button role="menuitem" onClick={() => { videoRef.current?.click(); setAttachMenuOpen(false); }}>🎥 Video</button>
                <button role="menuitem" onClick={() => { fileRef.current?.click(); setAttachMenuOpen(false); }}>📎 File / Document</button>
                <button role="menuitem" onClick={() => { setAttachMenuOpen(false); void startRecording(); }}>🎙 Record audio</button>
                <button role="menuitem" onClick={() => { setAttachMenuOpen(false); setCallOpen(true); }}>▣ Live screen share</button>
              </div>}
              <button className="icon" aria-expanded={attachMenuOpen} aria-haspopup="menu" aria-label="Attachment options" title="Attachment options" disabled={busy || recording} onClick={() => setAttachMenuOpen(v => !v)}>＋</button>
            </div><button className="icon" title={recording ? "Stop recording" : "Record voice note"} disabled={busy} onClick={() => recording ? recorderRef.current?.stop() : void startRecording()}>{recording ? "■" : "🎙"}</button><textarea rows={1} placeholder={!ready ? "Setting up encryption…" : online ? "Encrypted message" : "Offline"} value={message} disabled={busy || !ready} onChange={e => { setMessage(e.target.value); recentTyping.current=Date.now(); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}/><button className="primary" disabled={busy || !online || !ready || recording || (!message.trim() && !files.length)} onClick={() => void sendMessage()}>{busy ? "…" : "➤"}</button></div>
        </> : <div className="esc-empty"><strong>🔒 Eleeveon secure support</strong><p>Text, voice notes, images, videos and files in continuing conversations.</p><button className="primary" onClick={() => { setNewChat(true); setMobileOpen(true); }}>New conversation</button>{!ready && <small>Setting up your device encryption…</small>}</div>}
      </div>
    </div>
    {error && <div className="esc-banner error" role="alert">{error} <button onClick={() => setError("")}>Dismiss</button></div>}
    {info && <div className="esc-banner success" role="status">{info} <button onClick={() => setInfo("")}>×</button></div>}
  </section>;
}
