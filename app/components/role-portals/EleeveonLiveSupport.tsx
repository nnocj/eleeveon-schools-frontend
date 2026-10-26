"use client";

/** In-conversation calls: permission-gated media, WebRTC, TURN-backed signalling. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { supportApi, type SupportCallSignal } from "../../lib/support/supportApi";

type Mode = "idle" | "incoming" | "calling" | "connected";
type Props = { conversationId: string; open: boolean; onClose: () => void };

function browserMediaCapability() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { calling: false, screen: false, secure: false };
  }
  const secure = window.isSecureContext;
  return {
    secure,
    calling: secure && typeof RTCPeerConnection !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function",
    screen: secure && typeof navigator.mediaDevices?.getDisplayMedia === "function",
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") return "Permission was declined or blocked. Check your browser's camera, microphone or screen-sharing permissions.";
  if (error.name === "NotFoundError") return "No suitable camera, microphone or screen source was found on this device.";
  if (error.name === "InvalidStateError") return "Start screen sharing directly from this call window while it is active and focused.";
  return error.message || fallback;
}

export default function EleeveonLiveSupport({ conversationId, open, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<SupportCallSignal | null>(null);
  const [screen, setScreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [capability, setCapability] = useState({ calling: false, screen: false, secure: false });
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const shared = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const session = useRef("");
  const seen = useRef(new Set<string>());
  const since = useRef(Date.now() - 2500);
  const queuedIce = useRef<RTCIceCandidateInit[]>([]);
  const modeRef = useRef<Mode>("idle");
  modeRef.current = mode;

  useEffect(() => { setCapability(browserMediaCapability()); }, []);
  const attachLocal = () => { if (localRef.current) localRef.current.srcObject = stream.current; };
  const attachRemote = () => { if (remoteRef.current) remoteRef.current.srcObject = remoteStream.current; };
  useEffect(() => { attachLocal(); attachRemote(); }, [mode, videoEnabled, remoteHasVideo]);

  const closeMedia = useCallback(() => {
    shared.current?.getTracks().forEach(track => track.stop());
    shared.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    pc.current?.close();
    pc.current = null;
    remoteStream.current?.getTracks().forEach(track => track.stop());
    remoteStream.current = null;
    queuedIce.current = [];
    session.current = "";
    if (localRef.current) localRef.current.srcObject = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
    setScreen(false); setMuted(false); setVideoEnabled(false); setRemoteHasVideo(false);
    setMode("idle"); setPending(null);
  }, []);

  useEffect(() => {
    closeMedia();
    seen.current.clear();
    since.current = Date.now() - 2500;
  }, [conversationId, closeMedia]);
  useEffect(() => () => { closeMedia(); }, [closeMedia]);

  const issue = useCallback(async (kind: string, payload: unknown = {}) => {
    if (session.current) await supportApi.sendSignal(conversationId, kind, session.current, payload);
  }, [conversationId]);

  async function initPeer(withCamera: boolean) {
    const available = browserMediaCapability();
    if (!available.calling) throw new Error(available.secure
      ? "This browser cannot start a WebRTC call. Try Chrome, Edge or Firefox on a desktop computer."
      : "Calls need HTTPS or localhost. Open Eleeveon Schools over its secure website.");
    const config = await supportApi.callConfig();
    if (!config.iceServers.length) throw new Error("Live calling is not configured yet. Check the Eleeveon call settings on Render.");
    const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: withCamera });
    stream.current = media;
    setVideoEnabled(withCamera);
    const peer = new RTCPeerConnection({ iceServers: config.iceServers });
    pc.current = peer;
    media.getTracks().forEach(track => peer.addTrack(track, media));
    // Pre-negotiate video on voice-only calls, enabling later screen sharing
    // without adding a brand-new m-line in the middle of the call.
    if (!withCamera) peer.addTransceiver("video", { direction: "sendrecv" });
    peer.onicecandidate = event => {
      if (event.candidate) void issue("ice", event.candidate.toJSON()).catch(() => setError("The network is having trouble connecting this call."));
    };
    peer.ontrack = event => {
      if (!remoteStream.current) remoteStream.current = new MediaStream();
      remoteStream.current.addTrack(event.track);
      if (event.track.kind === "video") setRemoteHasVideo(true);
      attachRemote();
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setMode("connected");
      if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        setError("The connection was interrupted. Try calling again or check your network.");
      }
    };
    attachLocal();
    return peer;
  }

  async function begin(video: boolean) {
    setError("");
    session.current = crypto.randomUUID();
    try {
      const peer = await initPeer(video);
      await peer.setLocalDescription(await peer.createOffer());
      await issue("offer", { sdp: peer.localDescription?.sdp, type: "offer", video });
      setMode("calling");
    } catch (cause) {
      const message = errorMessage(cause, "The call could not start.");
      closeMedia(); setError(message);
    }
  }

  async function accept() {
    if (!pending) return;
    setError("");
    session.current = pending.sessionId;
    try {
      const peer = await initPeer(Boolean(pending.payload?.video));
      await peer.setRemoteDescription({ type: "offer", sdp: String(pending.payload?.sdp || "") });
      for (const item of queuedIce.current.splice(0)) await peer.addIceCandidate(item);
      await peer.setLocalDescription(await peer.createAnswer());
      await issue("answer", { sdp: peer.localDescription?.sdp, type: "answer" });
      setPending(null);
      // The remote connection is not established until ICE reaches connected.
      setMode("calling");
    } catch (cause) {
      const message = errorMessage(cause, "The call could not be answered.");
      closeMedia(); setError(message);
    }
  }

  async function handle(signal: SupportCallSignal) {
    if (seen.current.has(signal.id)) return;
    seen.current.add(signal.id);
    if (signal.kind === "offer" && modeRef.current === "idle") {
      if (Date.now() - new Date(signal.createdAt).getTime() > 30000) return;
      setPending(signal); setMode("incoming"); return;
    }
    if (signal.sessionId !== session.current) return;
    if (signal.kind === "answer" && pc.current && !pc.current.remoteDescription) {
      await pc.current.setRemoteDescription({ type: "answer", sdp: String(signal.payload?.sdp || "") });
      for (const candidate of queuedIce.current.splice(0)) await pc.current.addIceCandidate(candidate);
    } else if (signal.kind === "ice") {
      const candidate = signal.payload as RTCIceCandidateInit;
      if (pc.current?.remoteDescription) await pc.current.addIceCandidate(candidate);
      else queuedIce.current.push(candidate);
    } else if (signal.kind === "end" || signal.kind === "decline") {
      closeMedia();
      setError(signal.kind === "decline" ? "The call was declined." : "The call has ended.");
    }
  }

  useEffect(() => {
    let alive = true;
    let running = false;
    const poll = async () => {
      if (!alive || running || document.hidden) return;
      running = true;
      try {
        const response = await supportApi.signals(conversationId, since.current);
        for (const signal of response.signals) { if (!alive) break; await handle(signal); }
        since.current = Date.now() - 3500;
      } catch { /* Poll again: failed signalling should not unmount the chat. */ }
      finally { running = false; }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 2000);
    return () => { alive = false; clearInterval(interval); };
  }, [conversationId]);

  async function stop() { try { await issue("end"); } catch { /* Local stop still succeeds. */ } closeMedia(); onClose(); }
  async function decline() {
    if (pending) try { await supportApi.sendSignal(conversationId, "decline", pending.sessionId, {}); } catch { /* ignored */ }
    closeMedia(); onClose();
  }

  async function shareScreen() {
    if (!pc.current || modeRef.current !== "connected") {
      setError("Connect a voice or video call before sharing your screen."); return;
    }
    const mediaDevices = navigator.mediaDevices;
    if (!window.isSecureContext || typeof mediaDevices?.getDisplayMedia !== "function") {
      setError("Screen sharing isn't available in this browser or app. Open Eleeveon Schools in desktop Chrome or Edge over HTTPS, or send a screenshot using +.");
      return;
    }
    setError("");
    let capture: MediaStream | null = null;
    try {
      // Triggered directly by the Share screen button: user activation is required.
      capture = await mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = capture.getVideoTracks()[0];
      const sender = pc.current.getSenders().find(item => item.track?.kind === "video")
        ?? pc.current.getTransceivers().find(item => item.receiver.track.kind === "video")?.sender;
      if (!track || !sender) throw new Error("This connection can't accept screen video. Please restart the call and try again.");
      await sender.replaceTrack(track);
      shared.current = capture;
      setScreen(true);
      track.onended = () => { void unshare(); };
    } catch (cause) {
      capture?.getTracks().forEach(track => track.stop());
      setError(errorMessage(cause, "Screen sharing could not start."));
    }
  }

  async function unshare() {
    const videoSender = pc.current?.getSenders().find(item => item.track?.kind === "video")
      ?? pc.current?.getTransceivers().find(item => item.receiver.track.kind === "video")?.sender;
    const camera = stream.current?.getVideoTracks()[0] ?? null;
    try { if (videoSender) await videoSender.replaceTrack(camera); }
    catch { setError("Could not restore your camera after sharing."); }
    shared.current?.getTracks().forEach(track => track.stop());
    shared.current = null;
    setScreen(false);
  }

  // Polling stays mounted even when the call sheet is closed, so incoming calls appear.
  return <div className={`els ${open || mode === "incoming" ? "els-open" : ""}`} aria-label="Live Eleeveon assistance">
    <style>{`
      .els{font-size:13px}.els button{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:10px 14px;border:1px solid var(--border,#d4e1e2);border-radius:13px;background:var(--surface,#fff);color:inherit;font-weight:650}.els button:focus-visible{outline:2px solid var(--dashboard-primary,#147c78);outline-offset:2px}.els button.primary{background:var(--dashboard-primary,#147c78);color:#fff;border-color:transparent}.els button.end{color:#fff;background:#b7354e;border-color:transparent}.els button:disabled{opacity:.5;cursor:not-allowed}
      .els-open::before{content:"";position:fixed;inset:0;z-index:2147480000;background:rgba(15,31,42,.44);backdrop-filter:blur(3px)}.els-modal{position:fixed;z-index:2147480001;top:50%;left:50%;transform:translate(-50%,-50%);width:min(700px,calc(100vw - 24px));max-height:min(88dvh,720px);overflow-y:auto;border:1px solid var(--border,#d4e1e2);border-radius:21px;background:var(--surface,#fff);padding:clamp(13px,2vw,20px);box-shadow:0 24px 60px #102e3240}.els-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.els-head strong{font-size:15px}.els-head button{width:35px;height:35px;min-height:35px;padding:0}.els-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}.els-video{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:15px 0}.els-video>div{position:relative;min-width:0;border-radius:16px;overflow:hidden;background:#142c3c}.els-video video{height:clamp(135px,22dvh,240px);width:100%;object-fit:contain;display:block}.els-video label{position:absolute;bottom:8px;left:9px;color:#fff;background:#0c2237aa;border-radius:7px;padding:4px 7px;font-size:10px}.els-status{font-size:12px;line-height:1.55;color:var(--muted,#667b89);margin:6px 0}.els-error{color:#b32642;background:color-mix(in srgb,#f4b8c2 20%,var(--surface,#fff));border:1px solid #df9daf55;padding:10px;border-radius:10px;line-height:1.5}.els-supported{font-size:11px;margin-top:12px;padding:10px;border-radius:11px;background:color-mix(in srgb,var(--dashboard-primary,#147c78) 7%,var(--surface,#fff));color:var(--text,#364b55)}
      @media(max-width:560px){.els-modal{width:calc(100vw - 14px);max-height:89dvh}.els-video{grid-template-columns:1fr}.els-video video{height:125px}.els-actions button{flex:1}}
    `}</style>
    {(open || mode === "incoming") && <div className="els-modal" role="dialog" aria-modal="false" aria-label="Live assistance call">
      <header className="els-head"><strong>Live assistance</strong><button type="button" aria-label="Close call panel" onClick={() => { onClose(); if (mode === "idle") setPending(null); }}>✕</button></header>
      <p className="els-status">{mode === "incoming" ? "Incoming call · choose whether to join" : mode === "calling" ? "Connecting your call…" : mode === "connected" ? "Connected · you can speak and share your screen" : "Talk or share your screen with Eleeveon Support."}</p>
      {!!error && <p className="els-error" role="alert">{error}</p>}
      {(mode === "connected" || mode === "calling") && <div className="els-video">
        <div><video ref={remoteRef} autoPlay playsInline/><label>{remoteHasVideo ? "Other participant" : "Other participant · audio"}</label></div>
        <div><video ref={localRef} autoPlay muted playsInline/><label>{videoEnabled ? "You" : "You · audio"}</label></div>
      </div>}
      {mode === "incoming" ? <div className="els-actions"><button className="primary" onClick={() => void accept()} disabled={!capability.calling}>Accept call</button><button onClick={() => void decline()}>Decline</button></div>
        : mode === "idle" ? <div className="els-actions"><button className="primary" disabled={!capability.calling} onClick={() => void begin(false)}>☎ Voice call</button><button disabled={!capability.calling} onClick={() => void begin(true)}>▣ Video call</button></div>
        : <div className="els-actions">
            <button onClick={() => { stream.current?.getAudioTracks().forEach(track => track.enabled = muted); setMuted(value => !value); }}>{muted ? "Unmute" : "Mute"}</button>
            <button disabled={!screen && (mode !== "connected" || !capability.screen)} onClick={() => void (screen ? unshare() : shareScreen())}>{screen ? "■ Stop sharing" : "▣ Share screen"}</button>
            <button className="end" onClick={() => void stop()}>End call</button>
          </div>}
      {!capability.calling && <p className="els-supported">Calls need a supported browser, a secure HTTPS connection and microphone access.</p>}
      {!capability.screen && <p className="els-supported">Screen sharing is not supported here. Open the web app in desktop Chrome or Edge, or attach a screenshot using +. Voice and video may still work.</p>}
      {capability.screen && mode === "connected" && !screen && <p className="els-status" style={{marginTop:12}}>You choose which tab, window or screen to share. Sharing stops when you select Stop or end the call.</p>}
    </div>}
  </div>;
}
