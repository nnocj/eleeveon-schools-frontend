"use client";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../lib/api/apiClient";
export default function DriveCallback(){
 const started=useRef(false);const [message,setMessage]=useState("Completing Google Drive connection…");
 useEffect(()=>{if(started.current)return;started.current=true;const q=new URLSearchParams(window.location.search);const code=q.get("code"),state=q.get("state");window.history.replaceState(null,"",window.location.pathname);if(!code||!state||q.has("error")){setMessage("Google authorization cancelled or incomplete. Return to Owner and reconnect.");return;}void apiClient("/drive-connection/complete",{method:"POST",body:{code,state}}).then(()=>setMessage("Google Drive connected. Return to Owner → System → Sync & Backup.")).catch(e=>setMessage(e instanceof Error?e.message:"Connection failed"));},[]);
 return <main className="mx-auto max-w-lg p-8"><h1 className="text-xl font-semibold">Google Drive connection</h1><p role="status" className="my-4">{message}</p><a href="/owner" className="underline">Return to Owner portal</a></main>;
}
