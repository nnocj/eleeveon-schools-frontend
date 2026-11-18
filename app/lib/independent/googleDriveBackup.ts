"use client";
import { encryptSchoolArchive } from "./archive";
import { captureSchoolDatabase } from "./databaseSnapshot";
import { inspectEncryptedBackup, validateSnapshot } from "./backupVerification";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3/files";
type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken(args?: { prompt?: string }): void };
type GoogleWindow = Window & { google?: { accounts?: { oauth2?: { initTokenClient(args: {client_id:string;scope:string;callback:(r:TokenResponse)=>void}):TokenClient } } } };
let scriptPromise: Promise<void> | undefined;
function loadGIS(): Promise<void> {
 if ((window as GoogleWindow).google?.accounts?.oauth2) return Promise.resolve();
 if (!scriptPromise) scriptPromise = new Promise((resolve,reject)=>{
  const s=document.createElement("script");s.src="https://accounts.google.com/gsi/client";s.async=true;
  s.onload=()=>resolve();s.onerror=()=>reject(new Error("Google sign-in could not load. Check connectivity and content security policy."));document.head.appendChild(s);
 });
 return scriptPromise;
}
export async function authorizeDrive():Promise<string> {
 const clientId=process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
 if (!clientId) throw new Error("Configure NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID first.");
 await loadGIS();
 return new Promise((resolve,reject)=>{
  const oauth=(window as GoogleWindow).google?.accounts?.oauth2;
  if(!oauth) {reject(new Error("Google authorization unavailable"));return;}
  const client=oauth.initTokenClient({client_id:clientId,scope:SCOPE,callback:r=>r.access_token?resolve(r.access_token):reject(new Error(r.error_description||r.error||"Authorization cancelled"))});
  client.requestAccessToken({prompt:"consent"});
 });
}
async function checked(res:Response):Promise<Response> {
 if(!res.ok) {const body=(await res.text()).slice(0,300);throw new Error(`Google Drive request failed (${res.status}): ${body}`);}
 return res;
}
function accountTag(accountId:string):string {return accountId.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,100);}
export type DriveBackup = {id:string;name:string;createdTime?:string;size?:string};
export async function listDriveBackups(token:string,accountId:string):Promise<DriveBackup[]> {
 const q="trashed = false and name contains 'eleeveon-"+accountTag(accountId)+"-'";
 const url=new URL(API);url.searchParams.set("q",q);url.searchParams.set("fields","nextPageToken,files(id,name,createdTime,size,mimeType)");url.searchParams.set("page_size","100");url.searchParams.set("orderBy","createdTime desc");
 const result=await (await checked(await fetch(url.toString(),{headers:{Authorization:`Bearer ${token}`}}))).json();
 return (result.files||[]).filter((f:DriveBackup)=>f.name.startsWith(`eleeveon-${accountTag(accountId)}-`)&&f.name.endsWith(".eleeveonbak"));
}
export async function uploadEncryptedDriveBackup(args:{token:string;databaseName:string;accountId:string;passphrase:string}) {
 const snapshot=await captureSchoolDatabase(args.databaseName,args.accountId);
 const expected=validateSnapshot(snapshot,args.databaseName);
 const encrypted=JSON.stringify(await encryptSchoolArchive(snapshot,args.passphrase));
 const name=`eleeveon-${accountTag(args.accountId)}-${snapshot.createdAt.replace(/[:.]/g,"-")}-${crypto.randomUUID().slice(0,8)}.eleeveonbak`;
 const metadata={name,mimeType:"application/octet-stream",description:"Encrypted Eleeveon Schools Independent recovery snapshot"};
 const boundary=`eleeveon_${crypto.randomUUID().replace(/-/g,"")}`;
 const payload=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify(metadata),`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,encrypted,`\r\n--${boundary}--`],{type:`multipart/related; boundary=${boundary}`});
 const response=await checked(await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",{method:"POST",headers:{Authorization:`Bearer ${args.token}`},body:payload}));
 const file=await response.json() as {id:string;name:string};
 // Read the remote bytes back and decrypt; an upload acknowledgment alone is not verification.
 const downloaded=await downloadDriveBackup(args.token,file.id);
 if(downloaded!==encrypted)throw new Error("Drive upload was not byte-for-byte verified; do not rely on this backup.");
 const verified=await inspectEncryptedBackup(downloaded,args.passphrase,args.databaseName);
 if(verified.records!==expected.records||verified.tables!==expected.tables||verified.createdAt!==expected.createdAt)throw new Error("Remote backup verification failed.");
 return {...file,...verified,bytes:new Blob([downloaded]).size};
}
export async function downloadDriveBackup(token:string,id:string):Promise<string> {
 if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("Invalid Drive file ID");
 return (await checked(await fetch(`${API}/${encodeURIComponent(id)}?alt=media`,{headers:{Authorization:`Bearer ${token}`}}))).text();
}
