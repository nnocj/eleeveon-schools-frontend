'use client';
import {useEffect,useRef,useState,type FormEvent,type ChangeEvent} from 'react';
import {activateBrowserLicense} from '../../lib/independent/browserLicense';
import {apiRequest,extractToken,saveAuthToken} from '../../lib/platformApi';
import type {OfflineLicenseClaims} from '../../lib/independent/offlineLicense';
import jsQR from 'jsqr';

type QRPayload = {type:string;version:number;accountId:string;licenseId:string;licenseKey:string};
function decodeQr(raw:string):QRPayload {
  let p:unknown;
  try {p=JSON.parse(raw);} catch {throw new Error('This is not an Eleeveon activation QR.');}
  if(!p || typeof p!=='object')throw new Error('Invalid activation QR.');
  const v=p as Record<string,unknown>;
  if(v.type!=='eleeveon-independent-activation'||v.version!==1||
     !['accountId','licenseId','licenseKey'].every(k=>typeof v[k]==='string' && (v[k] as string).trim().length>0))
    throw new Error('This QR is not a valid Eleeveon Independent activation code.');
  return v as QRPayload;
}
function scanCanvas(canvas:HTMLCanvasElement):string|null {
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  return jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data ?? null;
}
export default function IndependentBrowserActivation({onActivated}:{onActivated:(claims:OfflineLicenseClaims)=>void}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[key,setKey]=useState(''),[licenseId,setLicenseId]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[scanOpen,setScanOpen]=useState(false),[scanError,setScanError]=useState('');
  const videoRef=useRef<HTMLVideoElement|null>(null),streamRef=useRef<MediaStream|null>(null),activeRef=useRef(false);
  const canvasRef=useRef<HTMLCanvasElement|null>(null),frameRef=useRef<number|null>(null),scanningRef=useRef(false);
  const [scanHint,setScanHint]=useState('');
  function stopScan(){
    activeRef.current=false;
    if(frameRef.current!==null){cancelAnimationFrame(frameRef.current);frameRef.current=null;}
    streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
    if(videoRef.current)videoRef.current.srcObject=null;
    setScanOpen(false);
  }
  function acceptQr(raw:string){
    const payload=decodeQr(raw);
    setLicenseId(payload.licenseId);setKey(payload.licenseKey);
    setScanError('');setScanHint('QR scanned. Sign in as the matching commercial owner to activate.');stopScan();
  }
  useEffect(()=>()=>{
    activeRef.current=false;
    if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
  },[]);
  async function startScan(){
    stopScan();setScanError('');setScanHint('');
    if(!navigator.mediaDevices?.getUserMedia){setScanError('Camera access is unavailable. Use HTTPS and allow camera permissions, or choose a QR image below.');return;}
    try{
      let stream:MediaStream;
      try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});}
      catch{stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});}
      streamRef.current=stream;activeRef.current=true;setScanOpen(true);
      const video=videoRef.current;
      if(!video){stopScan();throw new Error('Camera preview unavailable.');}
      video.srcObject=stream;await video.play();
      const canvas=canvasRef.current;
      if(!canvas){stopScan();throw new Error('QR scanner unavailable.');}
      let last=0;
      const loop=(now:number)=>{
        if(!activeRef.current)return;
        frameRef.current=requestAnimationFrame(loop);
        if(scanningRef.current||now-last<160||video.readyState<2)return;
        last=now;scanningRef.current=true;
        try{
          const width=Math.min(video.videoWidth,960);
          if(!width)return;
          canvas.width=width;canvas.height=Math.round(width*video.videoHeight/video.videoWidth);
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          ctx?.drawImage(video,0,0,canvas.width,canvas.height);
          const value=scanCanvas(canvas);
          if(value)acceptQr(value);
        }catch(e){setScanError(e instanceof Error?e.message:'QR scan failed.');stopScan();}
        finally{scanningRef.current=false;}
      };
      frameRef.current=requestAnimationFrame(loop);
    }catch(e){stopScan();setScanError(e instanceof Error?e.message:'Camera access failed. Check permissions or scan a saved QR image.');}
  }
  async function scanImage(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    setScanError('');setScanHint('');
    try{
      const bitmap=await createImageBitmap(file);
      try{
        const canvas=document.createElement('canvas');
        const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d',{willReadFrequently:true})?.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const raw=scanCanvas(canvas);
        if(!raw)throw new Error('No QR code was found in this image. Try a clearer picture.');
        acceptQr(raw);
      }finally{bitmap.close();}
    }catch(err){setScanError(err instanceof Error?err.message:'Could not read the QR image.');}
  }
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      const auth=await apiRequest<any>('/auth/login',{method:'POST',body:JSON.stringify({email:email.trim().toLowerCase(),password})});
      const token=extractToken(auth);
      if(!token||!auth.user?.accountId)throw new Error('Owner authentication failed');
      const memberships=[...(auth.user?.memberships||[]),...(auth.memberships||[])];
      if(!['owner','super_admin'].includes(String(auth.user?.role||'')) &&
        !memberships.some((m:any)=>m.accountId===auth.user.accountId&&m.active!==false&&['owner','super_admin'].includes(String(m.role))))
        throw new Error('Only an account owner may activate Independent');
      saveAuthToken(token);
      const claims=await activateBrowserLicense({licenseKey:key.trim(),licenseId:licenseId.trim(),accountId:auth.user.accountId});
      setPassword('');setKey('');onActivated(claims);
    }catch(err){setError(err instanceof Error?err.message:'Activation failed');}
    finally{setBusy(false);}
  }
  return <main className="min-h-dvh grid place-items-center p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-xl border p-6 grid gap-3">
    <h1 className="text-xl font-semibold">Activate Independent on this device</h1>
    <p className="text-sm">Sign in as the commercial account owner. School records and staff remain in this device's local storage.</p>
    <input required type="email" autoComplete="username" placeholder="Owner email" className="rounded border p-3" value={email} onChange={e=>setEmail(e.target.value)}/>
    <input required type="password" autoComplete="current-password" placeholder="Owner account password" className="rounded border p-3" value={password} onChange={e=>setPassword(e.target.value)}/>
    <div className="grid gap-2">
      <button type="button" className="rounded border p-3" onClick={()=>scanOpen?stopScan():void startScan()}>{scanOpen?'Stop camera':'Scan activation QR with camera'}</button>
      <video ref={videoRef} autoPlay muted playsInline className={scanOpen ? 'w-full rounded border' : 'hidden'} aria-label="QR scanning camera preview"/>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true"/>
      <label className="rounded border p-3 text-center cursor-pointer">Scan QR from photo or screenshot
        <input type="file" accept="image/*" onChange={e=>void scanImage(e)} className="sr-only" aria-label="Choose QR image"/>
      </label>
      {scanError&&<p role="alert" className="text-sm text-red-600">{scanError}</p>}
      {scanHint&&<p role="status" className="text-sm text-green-700">{scanHint}</p>}
      <p className="text-xs">On Android or iPhone, use the rear camera or choose a saved QR image. On the same phone, save the QR privately and use the image option. Camera access requires HTTPS and permission. Manual entry remains available.</p>
    </div>
    <input required placeholder="Paid licence ID" autoComplete="off" className="rounded border p-3" value={licenseId} onChange={e=>setLicenseId(e.target.value)}/>
    <input required type="password" placeholder="Licence activation key" autoComplete="off" className="rounded border p-3" value={key} onChange={e=>setKey(e.target.value)}/>
    <button disabled={busy} className="rounded bg-blue-700 p-3 text-white">{busy?'Verifying…':'Activate this device'}</button>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    <p className="text-xs">This QR contains a sensitive licence key. Do not share screenshots or store them in public photo libraries. Browser profiles are not tamper-proof devices. Do not use private browsing.</p>
  </form></main>;
}
