"use client";
import React,{useCallback,useEffect,useRef,useState} from "react";
import {supportApi,type SupportCallSignal} from "../../lib/support/supportApi";
type Mode="idle"|"incoming"|"calling"|"connected";
export default function EleeveonLiveSupport({conversationId,open,onClose}:{conversationId:string;open:boolean;onClose:()=>void}){
 const [mode,setMode]=useState<Mode>("idle"),[error,setError]=useState(""),[pending,setPending]=useState<SupportCallSignal|null>(null),[screen,setScreen]=useState(false),[muted,setMuted]=useState(false);
 const [videoEnabled,setVideoEnabled]=useState(false);
 const pc=useRef<RTCPeerConnection|null>(null),stream=useRef<MediaStream|null>(null),shared=useRef<MediaStream|null>(null);
 const localRef=useRef<HTMLVideoElement|null>(null),remoteRef=useRef<HTMLVideoElement|null>(null);
 const remoteStream=useRef<MediaStream|null>(null);
 const session=useRef(""),seen=useRef(new Set<string>()),since=useRef(Date.now()-2500),queuedIce=useRef<RTCIceCandidateInit[]>([]);
 const modeRef=useRef<Mode>("idle");modeRef.current=mode;
 const attachLocal=()=>{if(localRef.current)localRef.current.srcObject=stream.current;};
 const attachRemote=()=>{if(remoteRef.current)remoteRef.current.srcObject=remoteStream.current;};
 useEffect(()=>{attachLocal();attachRemote();},[mode]);
 const closeMedia=useCallback(()=>{
   shared.current?.getTracks().forEach(t=>t.stop());shared.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
   pc.current?.close();pc.current=null;remoteStream.current?.getTracks().forEach(t=>t.stop());remoteStream.current=null;
   queuedIce.current=[];session.current="";setScreen(false);setMuted(false);setVideoEnabled(false);
   if(localRef.current)localRef.current.srcObject=null;if(remoteRef.current)remoteRef.current.srcObject=null;
   setMode("idle");setPending(null);
 },[]);
 useEffect(()=>{closeMedia();seen.current.clear();since.current=Date.now()-1500;},[conversationId,closeMedia]);
 useEffect(()=>()=>{closeMedia();},[closeMedia]);
 const issue=useCallback(async(kind:string,payload:any={})=>{if(session.current)await supportApi.sendSignal(conversationId,kind,session.current,payload);},[conversationId]);
 async function initPeer(withCamera:boolean){
   const config=await supportApi.callConfig();
   if(!config.iceServers.length)throw new Error("Live calls are not configured. Add TURN/STUN settings on Render.");
   const media=await navigator.mediaDevices.getUserMedia({audio:true,video:withCamera});stream.current=media;setVideoEnabled(withCamera);
   const peer=new RTCPeerConnection({iceServers:config.iceServers});pc.current=peer;
   media.getTracks().forEach(track=>peer.addTrack(track,media));
   if(!withCamera)peer.addTransceiver("video",{direction:"sendrecv"});
   peer.onicecandidate=e=>{if(e.candidate)void issue("ice",e.candidate.toJSON()).catch(()=>setError("Network signalling failed."));};
   peer.ontrack=e=>{if(!remoteStream.current)remoteStream.current=new MediaStream();remoteStream.current.addTrack(e.track);attachRemote();};
   peer.onconnectionstatechange=()=>{
     if(peer.connectionState==="connected")setMode("connected");
     if(["disconnected","failed"].includes(peer.connectionState))setError("The connection was interrupted. Try calling again.");
   };
   attachLocal();return peer;
 }
 async function begin(video:boolean){
   setError("");session.current=crypto.randomUUID();try{
    const peer=await initPeer(video);
    await peer.setLocalDescription(await peer.createOffer());
    await issue("offer",{sdp:peer.localDescription?.sdp,type:"offer",video});
    setMode("calling");
   }catch(e){setError(e instanceof Error?e.message:"Could not start call.");closeMedia();}
 }
 async function accept(){
   if(!pending)return;
   setError("");session.current=pending.sessionId;
   try{
     const peer=await initPeer(Boolean(pending.payload?.video));
     await peer.setRemoteDescription({type:"offer",sdp:String(pending.payload?.sdp||"")});
     for(const c of queuedIce.current.splice(0))await peer.addIceCandidate(c);
     await peer.setLocalDescription(await peer.createAnswer());
     await issue("answer",{sdp:peer.localDescription?.sdp,type:"answer"});
     setPending(null);setMode("connected");
   }catch(e){setError(e instanceof Error?e.message:"Could not accept call.");closeMedia();}
 }
 async function handle(signal:SupportCallSignal){
   if(seen.current.has(signal.id))return;seen.current.add(signal.id);
   if(signal.kind==="offer"&&modeRef.current==="idle"){
     if(Date.now()-new Date(signal.createdAt).getTime()>30000)return;
     setPending(signal);setMode("incoming");return;
   }
   if(signal.sessionId!==session.current)return;
   if(signal.kind==="answer"&&pc.current&&!pc.current.remoteDescription){
     await pc.current.setRemoteDescription({type:"answer",sdp:String(signal.payload?.sdp||"")});
     for(const c of queuedIce.current.splice(0))await pc.current.addIceCandidate(c);
     setMode("connected");
   } else if(signal.kind==="ice"){
     const ice=signal.payload as RTCIceCandidateInit;
     if(pc.current?.remoteDescription)await pc.current.addIceCandidate(ice);
     else queuedIce.current.push(ice);
   } else if(["end","decline"].includes(signal.kind)){
     closeMedia();setError(signal.kind==="decline"?"Call declined.":"Call ended.");
   }
 }
 useEffect(()=>{
   let alive=true,busy=false;
   const poll=async()=>{
    if(!alive||busy||document.hidden)return;busy=true;
    try{const r=await supportApi.signals(conversationId,since.current);
      for(const sig of r.signals){if(!alive)break;await handle(sig);}
      // Small overlap prevents missing records with identical millisecond timestamps.
      since.current=Date.now()-3500;
    }catch{/* The next poll retries. */}finally{busy=false;}
   };
   void poll();const timer=window.setInterval(()=>void poll(),2000);
   return()=>{alive=false;clearInterval(timer);};
 },[conversationId]);
 async function stop(){try{await issue("end");}catch{}closeMedia();}
 async function decline(){if(pending)try{await supportApi.sendSignal(conversationId,"decline",pending.sessionId,{});}catch{}closeMedia();}
 async function shareScreen(){
   if(!pc.current) {setError("Start or accept a call before sharing your screen.");return;}
   try{
     const media=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});shared.current=media;
     const track=media.getVideoTracks()[0];
     const sender=pc.current.getSenders().find(s=>s.track?.kind==="video") || pc.current.getSenders().find(s=>s.track===null);
     if(!sender)throw new Error("The call cannot receive a screen track. Try starting a video call.");
     await sender.replaceTrack(track);setScreen(true);
     track.onended=()=>{void unshare();};
   }catch(e){setError(e instanceof Error?e.message:"Screen sharing was cancelled.");}
 }
 async function unshare(){
   const sender=pc.current?.getSenders().find(s=>s.track?.kind==="video");
   const camera=stream.current?.getVideoTracks()[0]||null;
   if(sender)await sender.replaceTrack(camera);
   shared.current?.getTracks().forEach(t=>t.stop());shared.current=null;setScreen(false);
 }
 // A hidden signalling listener remains mounted to surface incoming invitations.
 return <div className="els" aria-label="Live assistance">
  <style>{`.els{font-size:12px}.els button{cursor:pointer;padding:9px 11px;border:1px solid var(--border,#ccd8dc);border-radius:10px;background:var(--surface,#fff);color:inherit}.els button.primary{background:var(--dashboard-primary,#087f7b);color:#fff;border-color:transparent}.els-actions{display:flex;gap:7px;flex-wrap:wrap}.els-modal{position:absolute;z-index:50;top:68px;right:10px;left:10px;max-width:640px;margin:auto;border:1px solid var(--border,#ccd8dc);border-radius:16px;background:var(--surface,#fff);padding:14px;box-shadow:0 12px 40px #0003}.els-video{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}.els-video video{min-height:130px;max-height:260px;width:100%;background:#122330;border-radius:12px;object-fit:contain}.els-status{color:var(--muted,#678);font-size:11px;margin:8px 0}.els-error{color:#b62343;margin:8px 0}@media(max-width:550px){.els-modal{left:4px;right:4px}.els-video video{min-height:100px}}`}</style>
 {(open||mode==="incoming")&&<div className="els-modal" role="dialog" aria-label="Eleeveon live support call">
   <div className="els-actions" style={{justifyContent:"space-between"}}><strong>Live Eleeveon Support</strong><button onClick={()=>{onClose();if(mode==="idle")setPending(null);}}>✕</button></div>
   <p className="els-status">{mode==="incoming"?"Incoming support call — your permission is required.":mode==="calling"?"Calling…":mode==="connected"?"Live session connected":"Voice, video and screen sharing work with your permission."}</p>
   {error&&<p className="els-error" role="alert">{error}</p>}
   {(mode==="connected"||mode==="calling")&&<div className="els-video"><video ref={localRef} autoPlay muted playsInline/><video ref={remoteRef} autoPlay playsInline/></div>}
   {mode==="incoming"?<div className="els-actions"><button className="primary" onClick={()=>void accept()}>Accept call</button><button onClick={()=>void decline()}>Decline</button></div>:
     mode==="idle"?<div className="els-actions"><button className="primary" onClick={()=>void begin(false)}>☎ Voice call</button><button onClick={()=>void begin(true)}>📹 Video call</button></div>:
     <div className="els-actions"><button onClick={()=>{stream.current?.getAudioTracks().forEach(t=>t.enabled=muted);setMuted(v=>!v);}}>{muted?"Unmute":"Mute"}</button><button onClick={()=>void (screen?unshare():shareScreen())}>{screen?"Stop sharing":"▣ Share screen"}</button><button onClick={()=>void stop()}>End call</button></div>}
   <p className="els-status">Your microphone, camera and screen are only shared after your permission. No remote computer control is enabled.</p>
  </div>}
 </div>;
}
