"use client";

/**
 * Eleeveon Center Support: responsive WhatsApp-inspired multimedia messaging.
 * Server-confirmed delivery only. Uses private Supabase signed attachment URLs.
 * Old Dexie feedback records are left intact; the separate support API is now authoritative.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supportApi, type SupportConversation, type SupportMessage, type SupportAttachment } from "../../lib/support/supportApi";

type Props = {
  isDeveloper: boolean;
  accountId: string;
  schoolId?: string | null;
  branchId?: string | null;
  membershipId?: string | null;
  userId?: string | null;
  role?: string | null;
  schoolName?: string | null;
  branchName?: string | null;
};

const CATEGORIES = [
  { value: "support_request", label: "Support" },
  { value: "bug", label: "Bug report" },
  { value: "billing_question", label: "Billing" },
  { value: "feature_request", label: "Feature request" },
  { value: "suggestion", label: "Suggestion" },
  { value: "complaint", label: "Complaint" },
  { value: "general_feedback", label: "General feedback" },
];
const STATUSES = ["submitted", "acknowledged", "under_review", "in_progress", "planned", "resolved", "closed"];
const MAX_ATTACHMENTS = 6;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
function friendly(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); }
function time(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
}
function day(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}
function niceSize(size: number) { return size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`; }

function MediaDisplay({ asset }: { asset: SupportAttachment }) {
  if (!asset.url) return <div className="esc-attachment-unavailable">Attachment temporarily unavailable. Refresh the conversation.</div>;
  if (asset.kind === "image") return <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.name}`}><img className="esc-image" src={asset.url} alt={asset.name}/></a>;
  if (asset.kind === "video") return <video className="esc-video" src={asset.url} controls preload="metadata" playsInline/>;
  if (asset.kind === "audio") return <div className="esc-audio"><span aria-hidden>🎙</span><audio src={asset.url} controls preload="metadata"/><small>{asset.name}</small></div>;
  return <a className="esc-file" href={asset.url} target="_blank" rel="noreferrer"><span aria-hidden>📄</span><span><b>{asset.name}</b><small>{niceSize(asset.sizeBytes)}</small></span><span aria-hidden>↗</span></a>;
}

export default function EleeveonSupportChat({ isDeveloper, accountId, schoolId, branchId, membershipId, userId, schoolName }: Props) {
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selected, setSelected] = useState("");
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [opened, setOpened] = useState<SupportConversation | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [newChat, setNewChat] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("support_request");
  const [openingText, setOpeningText] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [refreshTime, setRefreshTime] = useState(0);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const refreshInFlight = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const refresh = useCallback(async (quiet = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!quiet) setLoading(true);
    try {
      const list = await supportApi.list();
      setConversations(list.conversations || []);
      const currentId = selectedRef.current;
      if (currentId) {
        const result = await supportApi.open(currentId);
        if (selectedRef.current === currentId) {
          setOpened(result.conversation);
          setThread(result.messages || []);
        }
      }
      setRefreshTime(Date.now());
      if (!quiet) setError("");
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "Could not load support conversations.");
    } finally { refreshInFlight.current = false; if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, accountId, isDeveloper]);
  useEffect(() => {
    const interval = window.setInterval(() => { if (!document.hidden && navigator.onLine && !sending) void refresh(true); }, 8000);
    const onFocus = () => { if (navigator.onLine) void refresh(true); };
    const onOnline = () => { setOffline(false); void refresh(true); };
    const onOffline = () => setOffline(true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [refresh, sending]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [selected, thread.length]);
  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const visible = useMemo(() => conversations.filter(c => {
    if (filter === "open" && ["resolved", "closed"].includes(c.status)) return false;
    if (filter !== "open" && filter !== "all" && c.status !== filter) return false;
    const q = search.toLowerCase().trim();
    return !q || `${c.subject} ${c.description} ${c.organizationName || ""} ${c.type}`.toLowerCase().includes(q);
  }).sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt).getTime() - new Date(a.lastMessage?.createdAt || a.updatedAt).getTime()), [conversations, filter, search]);
  const title = opened?.subject || conversations.find(c => c.id === selected)?.subject || "Eleeveon Support";

  async function openConversation(id: string) {
    setSelected(id); selectedRef.current = id;
    setMobileOpen(true); setInfo(""); setError("");
    setMessage(""); setFiles([]); setThread([]); setOpened(null);
    setLoading(true);
    try {
      const data = await supportApi.open(id);
      setOpened(data.conversation); setThread(data.messages);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open this conversation."); }
    finally { setLoading(false); }
  }

  async function createConversation() {
    if (!subject.trim() || !openingText.trim() || busy) return;
    setBusy(true); setError(""); setInfo("");
    try {
      const { conversation } = await supportApi.create({
        subject: subject.trim(), body: openingText.trim(), type: category,
        schoolId: schoolId || undefined, branchId: branchId || undefined,
        membershipId: membershipId || undefined, name: schoolName || undefined,
      });
      setNewChat(false); setSubject(""); setOpeningText("");
      await openConversation(conversation.id);
      await refresh(true);
      setInfo("Conversation started. Your message is saved on the server.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start your conversation."); }
    finally { setBusy(false); }
  }

  function addFiles(next: FileList | File[]) {
    const accepted = Array.from(next);
    const tooLarge = accepted.find(item => item.size > MAX_FILE_BYTES);
    if (tooLarge) { setError(`${tooLarge.name} is larger than 15 MB. Choose a smaller file.`); return; }
    setFiles(previous => [...previous, ...accepted].slice(0, MAX_ATTACHMENTS));
    setError("");
  }

  async function sendMessage() {
    if (!selected || (!message.trim() && !files.length) || sending) return;
    const typed = message.trim(); const toSend = [...files];
    setSending(true); setError(""); setInfo("");
    try {
      if (!toSend.length) await supportApi.send(selected, typed, undefined, crypto.randomUUID());
      else {
        for (let index = 0; index < toSend.length; index++) {
          await supportApi.send(selected, index === 0 ? typed : "", toSend[index], crypto.randomUUID());
        }
      }
      setMessage(""); setFiles([]);
      const detail = await supportApi.open(selected);
      setThread(detail.messages); setOpened(detail.conversation);
      void refresh(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Message was not sent. You can retry."); }
    finally { setSending(false); }
  }

  async function startRecording() {
    if (recording) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Voice recording is not supported in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const options = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"].find(mime => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, options ? { mimeType: options } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const mime = recorder.mimeType.split(";")[0] || "audio/webm";
        const extension = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const file = new File(chunks, `voice-${Date.now()}.${extension}`, { type: mime });
        if (file.size) addFiles([file]);
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        setRecording(false);
      };
      recorderRef.current = recorder; recorder.start(); setRecording(true); setError("");
    } catch (cause) {
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
      setError(cause instanceof Error ? cause.message : "Microphone access failed.");
    }
  }
  function stopRecording() { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); }
  async function changeStatus(value: string) {
    if (!selected || !isDeveloper) return;
    setBusy(true); setError("");
    try { await supportApi.status(selected, value); await refresh(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the status."); }
    finally { setBusy(false); }
  }

  const intro: SupportMessage | null = opened ? {
    id: `${opened.id}-opening`, feedbackId: opened.id, body: opened.description,
    authorType: "school", internal: false, createdAt: opened.createdAt, attachments: [],
  } : null;
  const fullThread = intro ? [intro, ...thread] : thread;

  return <section className="esc" aria-label="Eleeveon support conversations">
    <style>{`
      .esc{color:var(--text,#17212f);--esc-primary:var(--ba-primary,var(--primary-color,#128c7e));--esc-border:var(--border,rgba(120,137,156,.24));--esc-surface:var(--surface,var(--card-bg,#fff));--esc-muted:var(--surface-muted,rgba(120,137,156,.10));font-size:13px}
      .esc button,.esc input,.esc textarea,.esc select{font:inherit;color:inherit}
      .esc button{cursor:pointer}.esc button:disabled{opacity:.55;cursor:wait}
      .esc-layout{height:min(76vh,750px);min-height:440px;border:1px solid var(--esc-border);border-radius:15px;overflow:hidden;display:grid;grid-template-columns:minmax(230px,32%) minmax(0,1fr);background:var(--esc-surface)}
      .esc-sidebar{min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--esc-border);background:var(--esc-surface)}
      .esc-side-header{padding:13px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--esc-border)}
      .esc-side-header strong{font-size:15px}.esc-header-buttons{display:flex;gap:5px}
      .esc-square{min-width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--esc-border);background:var(--esc-muted);border-radius:10px}
      .esc-search{width:calc(100% - 24px);margin:12px 12px 6px;border:1px solid var(--esc-border);border-radius:10px;padding:10px;background:var(--esc-surface)}
      .esc-filter{margin:0 12px 10px;padding:8px;border:1px solid var(--esc-border);border-radius:9px;background:var(--esc-surface)}
      .esc-inbox{overflow:auto;flex:1;min-height:0}.esc-item{width:100%;border:0!important;text-align:left;display:flex;gap:10px;padding:12px;background:transparent;align-items:flex-start;border-bottom:1px solid var(--esc-border)!important}
      .esc-item:hover,.esc-item.selected{background:var(--esc-muted)!important}.esc-avatar{width:39px;height:39px;border-radius:50%;background:color-mix(in srgb,var(--esc-primary) 18%,transparent);color:var(--esc-primary);display:grid;place-items:center;font-weight:800;flex-shrink:0}
      .esc-item-info{min-width:0;flex:1}.esc-item-name{display:flex;justify-content:space-between;align-items:center;gap:6px}.esc-item-name b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.esc-item-name small{white-space:nowrap;opacity:.6;font-size:10px}
      .esc-item-sub{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;opacity:.7;margin-top:4px}.esc-item-kind{font-size:10px;opacity:.65;margin-top:5px}
      .esc-chat{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--esc-muted)}
      .esc-chat-header{padding:11px 12px;background:var(--esc-surface);border-bottom:1px solid var(--esc-border);display:flex;align-items:center;gap:9px;min-height:58px}
      .esc-chat-head-info{min-width:0;flex:1}.esc-chat-head-info b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.esc-chat-head-info small{display:block;opacity:.65;margin-top:3px}
      .esc-chat-header select{max-width:140px;background:var(--esc-surface);border:1px solid var(--esc-border);border-radius:8px;padding:7px;font-size:11px}
      .esc-messages{flex:1;min-height:0;overflow:auto;padding:16px clamp(12px,2.4vw,24px)}
      .esc-message{display:flex;margin:8px 0}.esc-message.mine{justify-content:flex-end}.esc-bubble{max-width:min(88%,480px);background:var(--esc-surface);border:1px solid var(--esc-border);border-radius:12px 12px 12px 3px;padding:10px 12px;word-break:break-word;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,.035)}
      .esc-message.mine .esc-bubble{background:color-mix(in srgb,var(--esc-primary) 13%,var(--esc-surface));border-radius:12px 12px 3px 12px}.esc-bubble-label{font-size:10px;font-weight:750;color:var(--esc-primary);margin-bottom:5px}.esc-stamp{display:block;text-align:right;font-size:10px;opacity:.55;margin-top:6px}
      .esc-compose{background:var(--esc-surface);border-top:1px solid var(--esc-border);padding:10px;display:flex;align-items:flex-end;gap:7px}
      .esc-compose textarea{flex:1;min-width:0;resize:none;max-height:120px;min-height:40px;border:1px solid var(--esc-border);border-radius:12px;padding:10px;background:var(--esc-surface)}
      .esc-send{height:40px;min-width:43px;border:none;color:#fff!important;background:var(--esc-primary);border-radius:11px;font-weight:750}
      .esc-selected-files{background:var(--esc-surface);display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border-top:1px solid var(--esc-border)}
      .esc-selected-files button{border:1px solid var(--esc-border);border-radius:99px;background:var(--esc-muted);padding:5px 9px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .esc-banner{padding:8px 12px;background:var(--esc-surface);border-bottom:1px solid var(--esc-border);font-size:12px}.esc-banner.error{color:#b91c1c}.esc-banner.info{color:var(--esc-primary)}
      .esc-empty{margin:auto;display:grid;place-items:center;gap:10px;text-align:center;padding:20px;color:var(--text-muted,#64748b)}
      .esc-image{max-width:100%;max-height:300px;border-radius:9px;object-fit:contain}.esc-video{max-width:100%;width:min(310px,100%);border-radius:9px}.esc-audio{display:grid;gap:4px}.esc-audio audio{max-width:100%;width:250px}.esc-audio small{opacity:.7}
      .esc-file{display:flex;gap:8px;align-items:center;padding:10px;margin:5px 0;border:1px solid var(--esc-border);border-radius:10px;color:inherit;text-decoration:none}.esc-file span:nth-child(2){display:grid;gap:2px;overflow:hidden}.esc-file b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}.esc-file small{opacity:.6}.esc-attachment-unavailable{font-size:11px;opacity:.7}
      .esc-compose-form{padding:14px;display:grid;gap:11px}.esc-compose-form input,.esc-compose-form select,.esc-compose-form textarea{width:100%;padding:10px;border:1px solid var(--esc-border);border-radius:10px;background:var(--esc-surface);box-sizing:border-box}
      .esc-compose-form label{display:grid;gap:5px;font-size:12px}.esc-primary-button{background:var(--esc-primary);color:#fff!important;border:0;border-radius:10px;padding:10px 16px;font-weight:700}.esc-secondary-button{border:1px solid var(--esc-border);background:var(--esc-surface);border-radius:10px;padding:9px 12px}
      .esc-back{display:none}.esc-footer-note{font-size:10px;opacity:.55;padding:8px 12px;border-top:1px solid var(--esc-border)}
      @media(max-width:680px){.esc-layout{display:block;height:min(79dvh,760px);min-height:430px}.esc-sidebar{height:100%;border-right:0;display:flex}.esc-chat{height:100%;display:none}.esc-layout.mobile-chat .esc-sidebar{display:none}.esc-layout.mobile-chat .esc-chat{display:flex}.esc-back{display:grid}.esc-bubble{max-width:90%}.esc-compose{gap:5px;padding:7px}.esc-square{min-width:35px}.esc-chat-header select{max-width:108px}.esc-messages{padding:11px}.esc-side-header{padding:10px}}
    `}</style>
    <div className={`esc-layout ${mobileOpen ? "mobile-chat" : ""}`}>
      <aside className="esc-sidebar">
        <div className="esc-side-header"><strong>{isDeveloper ? "School conversations" : "Eleeveon Support"}</strong><div className="esc-header-buttons">
          <button className="esc-square" title="Refresh" onClick={() => void refresh()} disabled={loading}>↻</button>
          {!isDeveloper && <button className="esc-primary-button" onClick={() => { setNewChat(true); setMobileOpen(true); }}>+ New</button>}
        </div></div>
        <input className="esc-search" placeholder="Search conversations" aria-label="Search conversations" value={search} onChange={e => setSearch(e.target.value)}/>
        <select className="esc-filter" aria-label="Filter conversations" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All conversations</option><option value="open">Open conversations</option>
          {STATUSES.map(value => <option key={value} value={value}>{friendly(value)}</option>)}
        </select>
        <div className="esc-inbox">{visible.length ? visible.map(c => <button key={c.id} className={`esc-item ${selected === c.id ? "selected" : ""}`} onClick={() => void openConversation(c.id)}>
          <span className="esc-avatar">{(isDeveloper ? c.organizationName : c.subject)?.slice(0, 1).toUpperCase() || "E"}</span>
          <span className="esc-item-info"><span className="esc-item-name"><b>{isDeveloper ? c.organizationName || c.subject : c.subject}</b><small>{day(c.lastMessage?.createdAt || c.updatedAt)}</small></span>
            <span className="esc-item-sub">{c.lastMessage?.body || c.description}</span><span className="esc-item-kind">{friendly(c.status)} · {friendly(c.type)}</span></span>
        </button>) : <div className="esc-empty"><span>💬</span><span>{loading ? "Loading conversations…" : "No conversations yet"}</span></div>}</div>
        <div className="esc-footer-note">{offline ? "Offline — reconnect to send messages" : `Online · ${refreshTime ? `refreshed ${time(new Date(refreshTime).toISOString())}` : "checking"}`}</div>
      </aside>
      <div className="esc-chat">
        {newChat && !isDeveloper ? <>
          <div className="esc-chat-header"><button className="esc-square esc-back" onClick={() => { setNewChat(false); setMobileOpen(false); }}>←</button><div className="esc-chat-head-info"><b>New conversation</b><small>Start a conversation with Eleeveon</small></div></div>
          <div className="esc-compose-form"><label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            <label>Subject<input value={subject} maxLength={180} onChange={e => setSubject(e.target.value)} placeholder="What do you need help with?"/></label>
            <label>Your message<textarea rows={6} value={openingText} onChange={e => setOpeningText(e.target.value)} placeholder="Explain the issue or question…"/></label>
            <div style={{ display: "flex", gap: 8 }}><button className="esc-secondary-button" onClick={() => setNewChat(false)}>Cancel</button><button className="esc-primary-button" disabled={busy || !subject.trim() || !openingText.trim() || offline} onClick={() => void createConversation()}>{busy ? "Starting…" : "Start conversation"}</button></div>
          </div>
        </> : selected && opened ? <>
          <div className="esc-chat-header"><button className="esc-square esc-back" aria-label="Back to conversations" onClick={() => setMobileOpen(false)}>←</button><span className="esc-avatar" aria-hidden>💬</span>
            <div className="esc-chat-head-info"><b>{title}</b><small>{isDeveloper ? opened.organizationName || opened.accountId : "Eleeveon Support"} · {friendly(opened.status)}</small></div>
            {isDeveloper && <select value={opened.status} aria-label="Ticket status" disabled={busy} onChange={e => void changeStatus(e.target.value)}>{STATUSES.map(value => <option key={value} value={value}>{friendly(value)}</option>)}</select>}
          </div>
          <div className="esc-messages">{fullThread.map((item, index) => {
            const mine = isDeveloper ? item.authorType === "platform" : item.authorType !== "platform";
            const previous = fullThread[index - 1];
            const showDay = index === 0 || day(previous.createdAt) !== day(item.createdAt);
            return <React.Fragment key={item.id}>
              {showDay && <div style={{ textAlign: "center", margin: "14px auto", opacity: .55, fontSize: 11 }}>{day(item.createdAt)}</div>}
              <div className={`esc-message ${mine ? "mine" : ""}`}><div className="esc-bubble">
                <div className="esc-bubble-label">{mine ? "You" : item.authorType === "platform" ? "Eleeveon" : opened.organizationName || "School"}</div>
                {item.body ? <div>{item.body}</div> : null}
                {(item.attachments || []).map((asset, i) => <MediaDisplay key={`${item.id}-${i}`} asset={asset}/>)}
                <span className="esc-stamp">{time(item.createdAt)} · Sent</span>
              </div></div>
            </React.Fragment>;
          })}<div ref={endRef}/></div>
          {files.length ? <div className="esc-selected-files">{files.map((file, i) => <button key={`${file.name}-${i}`} title="Remove attachment" disabled={sending} onClick={() => setFiles(current => current.filter((_, index) => index !== i))}>📎 {file.name} ({niceSize(file.size)}) ×</button>)}</div> : null}
          {recording && <div className="esc-banner info">🎙 Recording voice note… Select Stop when finished.</div>}
          <div className="esc-compose">
            <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" multiple hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}/>
            <button className="esc-square" title="Attach images, videos or files" aria-label="Attach files" disabled={sending || recording} onClick={() => fileRef.current?.click()}>＋</button>
            <button className="esc-square" title={recording ? "Stop recording" : "Record voice note"} aria-label={recording ? "Stop voice recording" : "Record voice note"} disabled={sending} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? "■" : "🎙"}</button>
            <textarea rows={1} placeholder={offline ? "Offline — reconnect to send" : "Type a message"} value={message} disabled={sending} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}/>
            <button className="esc-send" disabled={sending || offline || recording || (!message.trim() && !files.length)} onClick={() => void sendMessage()}>{sending ? "…" : "➤"}</button>
          </div>
        </> : <div className="esc-empty"><span style={{ fontSize: 32 }}>💬</span><b>{isDeveloper ? "Select a school conversation" : "Continue a conversation with Eleeveon"}</b><span>Messages, voice notes, photos, videos and files stay together in one chat.</span>
          {!isDeveloper && <button className="esc-primary-button" onClick={() => { setNewChat(true); setMobileOpen(true); }}>+ Start a conversation</button>}
        </div>}
      </div>
    </div>
    {error && <div className="esc-banner error" role="alert">{error} <button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {info && <div className="esc-banner info" role="status">{info} <button onClick={() => setInfo("")} aria-label="Dismiss message">×</button></div>}
  </section>;
}
