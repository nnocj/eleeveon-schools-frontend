'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {activateBrowserLicense} from '../../lib/independent/browserLicense';
import {apiRequest,extractToken,saveAuthToken} from '../../lib/platformApi';
import type {OfflineLicenseClaims} from '../../lib/independent/offlineLicense';
export default function IndependentBrowserActivation({onActivated}:{onActivated:(claims:OfflineLicenseClaims)=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[key,setKey]=useState(''),[licenseId,setLicenseId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [scanOpen,setScanOpen]=useState(false),[scanError,setScanError]=useState('');
 const videoRef=useRef<HTMLVideoElement|null>(null);
 const streamRef=useRef<MediaStream|null>(null);
 const activeRef=useRef(false);
 function stopScan(){activeRef.current=false;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setScanOpen(false);}
 function acceptQr(raw:string){
  let payload:any;
  try{payload=JSON.parse(raw);}catch{throw new Error('Not an Eleeveon activation QR.');}
  if(payload?.type!=='eleeveon-independent-activation'||payload?.version!==1||
     typeof payload.licenseId!=='string'||typeof payload.licenseKey!=='string'||
     typeof payload.accountId!=='string'||!payload.licenseId||!payload.licenseKey||!payload.accountId)
   throw new Error('Invalid Eleeveon activation QR.');
  setLicenseId(payload.licenseId);setKey(payload.licenseKey);setScanError('');stopScan();
  // The authenticated owner account is still checked against the licence on submit.
 }
 useEffect(()=>()=>{activeRef.current=false;streamRef.current?.getTracks().forEach(t=>t.stop());},[]);
 async function startScan(){
  setScanError('');
  const Detector=(window as any).BarcodeDetector;
  if(!Detector){setScanError('This browser does not support camera QR scanning. Use manual entry or a supported browser.');return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
   streamRef.current=stream;activeRef.current=true;setScanOpen(true);
   // The video is mounted after setScanOpen renders.
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   const video=videoRef.current;if(!video){stopScan();throw new Error('Camera preview unavailable');}
   video.srcObject=stream;await video.play();
   const detector=new Detector({formats:['qr_code']});
   const loop=async()=>{
    if(!activeRef.current)return;
    try{const codes=await detector.detect(video);if(codes.length){acceptQr(String(codes[0].rawValue||''));return;}}
    catch(e){if(activeRef.current){setScanError(e instanceof Error?e.message:'QR scan failed');stopScan();}return;}
    if(activeRef.current)requestAnimationFrame(()=>void loop());
   };void loop();
  }catch(e){stopScan();setScanError(e instanceof Error?e.message:'Camera access failed');}
 }
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const auth=await apiRequest<any>('/auth/login',{method:'POST',body:JSON.stringify({email:email.trim().toLowerCase(),password})});
  const token=extractToken(auth);if(!token||!auth.user?.accountId)throw new Error('Owner authentication failed');
  const memberships=[...(auth.user?.memberships||[]),...(auth.memberships||[])];
  if(!['owner','super_admin'].includes(String(auth.user?.role||''))&&!memberships.some((m:any)=>m.accountId===auth.user.accountId&&m.active!==false&&['owner','super_admin'].includes(String(m.role))))throw new Error('Only an account owner may activate Independent');
  saveAuthToken(token);
  const claims=await activateBrowserLicense({licenseKey:key.trim(),licenseId:licenseId.trim(),accountId:auth.user.accountId});setPassword('');setKey('');onActivated(claims);
 }catch(err){setError(err instanceof Error?err.message:'Activation failed');}finally{setBusy(false);}}
 return <main className="min-h-dvh grid place-items-center p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-xl border p-6 grid gap-3"><h1 className="text-xl font-semibold">Activate Independent on this PWA</h1><p className="text-sm">Sign in as the commercial account owner. Your school records and staff will remain in this browser's local storage.</p><input required type="email" autoComplete="username" placeholder="Owner email" className="rounded border p-3" value={email} onChange={e=>setEmail(e.target.value)}/><input required type="password" autoComplete="current-password" placeholder="Owner account password" className="rounded border p-3" value={password} onChange={e=>setPassword(e.target.value)}/><div className="grid gap-2"><button type="button" className="rounded border p-3" onClick={()=>scanOpen?stopScan():void startScan()}>{scanOpen?'Stop camera':'Scan activation QR'}</button>
 {scanOpen&&<video ref={videoRef} muted playsInline className="w-full rounded border" />}
 {scanError&&<p role="alert" className="text-sm text-red-600">{scanError}</p>}
 <p className="text-xs">Scan the QR displayed in Owner Billing to fill the licence ID and key. You must still sign in as the correct owner. Manual entry remains available.</p></div><input required placeholder="Paid licence ID" className="rounded border p-3" value={licenseId} onChange={e=>setLicenseId(e.target.value)}/><input required type="password" placeholder="Licence activation key" className="rounded border p-3" value={key} onChange={e=>setKey(e.target.value)}/><button disabled={busy} className="rounded bg-blue-700 p-3 text-white">{busy?'Verifying…':'Activate this browser'}</button>{error&&<p role="alert" className="text-red-600">{error}</p>}<p className="text-xs">Browser profiles are not tamper-proof devices. Clearing site data can require reactivation. Do not use private browsing.</p></form></main>;
}
