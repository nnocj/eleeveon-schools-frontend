'use client';
/** Hub-wide backgrounds, verified E2EE devices, interactive QR/code pairing and history transfer. */
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {QRCodeSVG} from 'qrcode.react';
import {supportApi} from '../../lib/support/supportApi';
import {ownPublicDevice,readTrust,saveTrust,signHubDeviceProof,type PublicSupportDevice} from '../../lib/support/supportCrypto';
import {transferAllHubHistory,type HistoryTransferProgress} from '../../lib/support/supportDeviceTransfer';
import type {HubBackground} from '../../lib/support/useHubAppearance';

type Props={onClose:()=>void;accountId:string;userId:string;conversationId?:string;images:HubBackground[];selectedId:string;
  select:(id:string)=>void|Promise<void>;addUpload:(file:File)=>Promise<void>;removeUpload:(id:string)=>Promise<void>;
  reload:()=>Promise<void>;error?:string};
type DeviceStatus={id:string;fingerprint:string;deviceName?:string|null;status:'linked'|'pending'|'revoked';linkedAt:string|null};
type NewLink={id:string;code:string;qrPayload:string;expiresAt:string;targetDeviceId:string;targetFingerprint:string};
type Lookup={id:string;targetDeviceId:string;targetFingerprint:string;deviceName:string;challenge:string;expiresAt:string};
const PROOF='ELEEVEON_HUB_PAIR_V1';
export default function HubSettingsPanel(props:Props){
 const [tab,setTab]=useState<'backgrounds'|'devices'>('backgrounds');
 const [devices,setDevices]=useState<DeviceStatus[]>([]);
 const [publicKeys,setPublicKeys]=useState<(PublicSupportDevice&{revoked?:boolean})[]>([]);
 const [mine,setMine]=useState<(PublicSupportDevice&{fingerprint:string})|null>(null);
 const [pending,setPending]=useState<NewLink|null>(null);
 const [lookup,setLookup]=useState<Lookup|null>(null);
 const [approvedLink,setApprovedLink]=useState<Lookup|null>(null);
 const [code,setCode]=useState('');
 const [fingerprintInput,setFingerprintInput]=useState('');
 const [verifyId,setVerifyId]=useState('');
 const [verifyInput,setVerifyInput]=useState('');
 const [status,setStatus]=useState('');
 const [progress,setProgress]=useState<HistoryTransferProgress|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const cancelTransfer=useRef(false);
 const scanStream=useRef<MediaStream|null>(null);
 const [scanning,setScanning]=useState(false);
 const [mounted,setMounted]=useState(false);
 const ownStatus=devices.find(d=>d.id===mine?.id)?.status;
 const closeCamera=()=>{scanStream.current?.getTracks().forEach(t=>t.stop());scanStream.current=null;setScanning(false);};
 useEffect(()=>{setMounted(true);return()=>{cancelTransfer.current=true;closeCamera();setMounted(false);};},[]);
 useEffect(()=>{
   const key=`eleeveon:hub:approved-link:${props.accountId}:${props.userId}`;
   try { const raw=sessionStorage.getItem(key);if(!raw)return;const cached=JSON.parse(raw) as Lookup;
     if(cached?.id && cached?.targetDeviceId && cached?.challenge){setApprovedLink(cached);setLookup(cached);}
   }catch{}
 },[props.accountId,props.userId]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')props.onClose();};document.addEventListener('keydown',onKey);
   const prior=document.body.style.overflow;document.body.style.overflow='hidden';
   return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=prior;};},[props.onClose]);
 const refreshDevices=async()=>{
   if(!props.accountId||!props.userId)return;
   const pub=await ownPublicDevice(props.accountId,props.userId);
   saveTrust(props.accountId,props.userId,[{...pub,accountId:props.accountId,userId:props.userId}]);
   await supportApi.registerKey({id:pub.id,encryptionPublicJwk:pub.encryptionPublicJwk,signingPublicJwk:pub.signingPublicJwk});
   const [listed,keys]=await Promise.all([supportApi.devices(),supportApi.keys(props.conversationId||undefined)]);
   setMine({...pub,accountId:props.accountId,userId:props.userId});setDevices(listed.devices);setPublicKeys(keys.devices);
 };
 useEffect(()=>{if(tab==='devices')void refreshDevices().catch(e=>setError(e instanceof Error?e.message:'Could not load devices.'));},[tab,props.accountId,props.userId,props.conversationId]);
 useEffect(()=>{if(!pending)return;let active=true;
   const check=async()=>{try{const r=await supportApi.linkStatus(pending.id);if(!active)return;
     if(r.status==='approved'||r.status==='completed'){setStatus('Your device has been approved. Verify the original device fingerprint below, then open a conversation.');void refreshDevices();}
     if(r.status==='expired'||r.status==='cancelled'){setStatus('This pairing request expired. Create another.');setPending(null);}
   }catch{/* Retry when the network returns. */}};
   void check();const timer=window.setInterval(()=>void check(),4000);
   return()=>{active=false;clearInterval(timer);};
 },[pending?.id]);
 const execute=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Unable to complete this action.');}finally{setBusy(false);}};
 const upload=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];e.target.value='';if(file)await execute(async()=>{await props.addUpload(file);setStatus('Background uploaded and synchronized.');});};
 const choose=async(id:string)=>execute(async()=>{await props.select(id);setStatus('Background saved across your Hub.');});
 const start=async()=>execute(async()=>{if(!mine)await refreshDevices();const pub=await ownPublicDevice(props.accountId,props.userId);
   const response=await supportApi.linkStart(pub.id);setPending(response);setStatus('Open Hub Settings on an existing trusted device. Scan this QR or enter the 10-digit code there.');});
 const searchCode=async(value?:string)=>execute(async()=>{
   const input=(value||code).replace(/\s/g,'');if(!/^\d{10}$/.test(input))throw new Error('Enter the ten-digit code shown on the new device.');
   const match=await supportApi.linkLookup(input);setCode(input);setLookup(match);setApprovedLink(null);setFingerprintInput('');setStatus('Compare the full fingerprint displayed on the new device before approving.');
 });
 const approveAndTransfer=async()=>execute(async()=>{
   if(!mine||!lookup)throw new Error('Open a valid pairing request first.');
   if(approvedLink?.id!==lookup.id){
     const match=fingerprintInput.replace(/\s/g,'').toUpperCase();
     if(match!==lookup.targetFingerprint.replace(/\s/g,'').toUpperCase())throw new Error('Fingerprint mismatch. Compare it directly with the NEW device before approval.');
     const signing=`${PROOF}|${lookup.id}|${lookup.targetDeviceId}|${lookup.challenge}|${code}`;
     const signature=await signHubDeviceProof(props.accountId,props.userId,signing);
     await supportApi.linkApprove(lookup.id,{code,sourceDeviceId:mine.id,signature});
     setApprovedLink(lookup);
     try{sessionStorage.setItem(`eleeveon:hub:approved-link:${props.accountId}:${props.userId}`,JSON.stringify(lookup));}catch{}
   }
   await refreshDevices();
   const keys=await supportApi.keys();const target=keys.devices.find(d=>d.id===lookup.targetDeviceId);
   if(!target||target.fingerprint!==lookup.targetFingerprint)throw new Error('Target encryption key changed. History transfer was stopped.');
   setStatus('Device approved. Transferring available historical encryption keys…');cancelTransfer.current=false;
   const result=await transferAllHubHistory(props.accountId,props.userId,lookup.id,target,setProgress,()=>cancelTransfer.current);
   const completeProof=`${PROOF}|complete|${lookup.id}|${target.id}|${lookup.challenge}`;
   const completeSig=await signHubDeviceProof(props.accountId,props.userId,completeProof);
   await supportApi.linkComplete(lookup.id,mine.id,completeSig);
   setStatus(`Linked. ${result.transferred} historical keys delivered; ${result.skipped} unavailable to this source device. You can open the new device.`);
   // Keep the approved link for idempotent retries: history transfer can be interrupted and restarted.
   setApprovedLink(lookup);
 });
 const verify=async(key:PublicSupportDevice)=>execute(async()=>{
   if(verifyInput.replace(/\s/g,'').toUpperCase()!==key.fingerprint.replace(/\s/g,'').toUpperCase())throw new Error('Fingerprint does not match. Confirm it directly with your trusted device.');
   saveTrust(props.accountId,props.userId,[key]);setVerifyInput('');setVerifyId('');setStatus('Device identity verified on this browser.');
   window.dispatchEvent(new Event('eleeveon:hub:keys-reviewed'));
 });
 const revoke=async(id:string)=>execute(async()=>{
   if(!mine||mine.id===id)throw new Error('Current device cannot revoke itself here.');
   if(!window.confirm('Revoke this device? It will stop receiving NEW encrypted messages. Previously decrypted content cannot be erased remotely.'))return;
   const signature=await signHubDeviceProof(props.accountId,props.userId,`${PROOF}|revoke|${id}|${mine.id}`);
   await supportApi.revokeDevice(id,mine.id,signature);await refreshDevices();setStatus('Device revoked.');
 });
 const readQr=(value:string)=>{const matched=/^eleeveon-hub-link:v1:[0-9a-f-]{36}:(\d{10})$/i.exec(value.trim());return matched?.[1]||(/^\d{10}$/.test(value.trim())?value.trim():null);};
 const scan=async()=>execute(async()=>{
   const Scanner=(window as any).BarcodeDetector;
   if(!Scanner)throw new Error('QR scanning is not supported by this browser. Enter the 10-digit code instead.');
   const scanner=new Scanner({formats:['qr_code']});
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});scanStream.current=stream;setScanning(true);
   const video=document.createElement('video');video.srcObject=stream;video.playsInline=true;await video.play();
   const begun=Date.now();
   const loop=async()=>{while(scanStream.current===stream&&Date.now()-begun<45000){const found=await scanner.detect(video).catch(()=>[]);
     const codeFound=found.map((entry:any)=>readQr(String(entry.rawValue||''))).find(Boolean);
     if(codeFound){setCode(codeFound);closeCamera();void searchCode(codeFound);break;}
     await new Promise(r=>setTimeout(r,200));}
     closeCamera();};void loop();
 });
 const view=(<div className="hub-settings-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)props.onClose();}}>
  <section role="dialog" aria-modal="true" aria-label="Hub Settings" className="hub-settings-dialog">
   <style>{`
    .hub-settings-backdrop{position:fixed;inset:0;z-index:2147480000;display:grid;place-items:center;padding:12px;background:#091d29b8;backdrop-filter:blur(7px)}
    .hub-settings-dialog{width:min(940px,100%);height:min(840px,calc(100dvh - 24px));min-height:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border,#dce4e9);border-radius:19px;background:var(--surface,#fff);color:var(--text,#223340);box-shadow:0 28px 90px #0004;font:inherit;font-size:13px}
    .hub-settings-dialog *{box-sizing:border-box}.hub-settings-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border,#dce4e9)}.hub-settings-head strong{font-size:15px}
    .hub-settings-dialog button,.hub-settings-dialog input{font:inherit;color:inherit}.hub-settings-dialog button{cursor:pointer}.hub-settings-dialog button:disabled{opacity:.45;cursor:not-allowed}.hub-settings-close{border:1px solid var(--border,#ddd);background:var(--surface,#fff);border-radius:9px;width:36px;height:36px;font-size:20px}
    .hub-settings-tabs{display:flex;gap:8px;padding:10px 14px 0}.hub-settings-tabs button{border:0;background:transparent;border-radius:10px;padding:9px 12px;font-weight:700}.hub-settings-tabs .active{background:color-mix(in srgb,var(--dashboard-primary,#128578) 13%,var(--surface,#fff))}
    .hub-settings-body{overflow-y:auto;flex:1;min-height:0;padding:15px}.hub-settings-body p{color:var(--muted,#65737d);line-height:1.6;font-size:12px}.hub-settings-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0}.hub-settings-actions button,.hub-settings-actions label,.hub-device-card button{border:1px solid var(--border,#dae3e7);background:var(--surface,#fff);padding:9px 12px;border-radius:10px;font-size:12px;font-weight:650}
    .hub-settings-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:10px}.hub-background-choice{min-width:0;position:relative;border:1px solid var(--border,#ddd);border-radius:12px;overflow:hidden;background:var(--surface,#fff)}.hub-background-choice.selected{border:2px solid var(--dashboard-primary,#127f74)}.hub-background-choice>button{width:100%;border:0;background:none;text-align:left;padding:0}.hub-background-choice .preview{height:95px;width:100%;display:block;object-fit:cover;background:linear-gradient(120deg,#d3e9e2,#d8d4be)}.hub-background-choice span{display:block;padding:8px 9px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hub-background-choice .remove{position:absolute;right:3px;top:3px;border:0;background:#fff;color:#9d1935;border-radius:8px;padding:4px 8px}
    .hub-device-card{border:1px solid var(--border,#dce4e9);border-radius:13px;padding:13px;margin:11px 0;background:var(--surface,#fff)}.hub-device-card strong{display:block;margin-bottom:8px}.hub-device-card small{display:block;color:var(--muted,#687880);margin:5px 0}.hub-device-card code{display:block;word-break:break-all;line-height:1.7;font-size:11px;background:var(--surface-secondary,#f3f6f6);padding:8px;border-radius:8px}.hub-device-card input{width:100%;max-width:480px;margin:8px 0;padding:10px;border:1px solid var(--border,#ddd);border-radius:9px;background:var(--surface,#fff)}.hub-device-card button{margin:5px 6px 0 0}.hub-settings-status{background:color-mix(in srgb,var(--dashboard-primary,#128578) 7%,var(--surface,#fff));border-radius:10px;padding:11px;margin:9px 0;font-size:12px}.hub-settings-error{color:#a52341;border:1px solid #d98293;padding:10px;border-radius:10px;margin:9px 0}.hub-qr{display:inline-grid;padding:14px;border-radius:13px;background:#fff;color:#121212;margin:10px 0}.hub-big-code{font:700 27px ui-monospace,monospace;letter-spacing:3px;word-break:break-word}.hub-settings-warning{padding:10px;border-left:3px solid #b68822;background:color-mix(in srgb,#ffd374 13%,var(--surface,#fff));font-size:12px;margin:10px 0;line-height:1.6}
    @media(max-width:600px){.hub-settings-backdrop{padding:0}.hub-settings-dialog{width:100%;height:100dvh;border-radius:0}.hub-settings-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}
   `}</style>
   <header className="hub-settings-head"><strong>Hub settings</strong><button className="hub-settings-close" type="button" onClick={props.onClose} aria-label="Close Hub settings">×</button></header>
   <nav className="hub-settings-tabs" aria-label="Settings categories"><button type="button" className={tab==='backgrounds'?'active':''} onClick={()=>setTab('backgrounds')}>Backgrounds</button><button type="button" className={tab==='devices'?'active':''} onClick={()=>setTab('devices')}>Linked devices & keys</button></nav>
   <div className="hub-settings-body">
   {tab==='backgrounds'?<>
     <p>Choose one background for Chat, Updates, Surveys, Access, and the entire Hub. Public images are discovered automatically at deployment; your private uploads are synchronized across your signed-in devices.</p>
     <div className="hub-settings-actions"><label htmlFor="hub-upload-background">＋ Upload background</label><input id="hub-upload-background" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={upload} style={{display:'none'}}/><button type="button" onClick={()=>void execute(props.reload)} disabled={busy}>↻ Refresh gallery</button></div>
     <div className="hub-settings-gallery">{props.images.map(image=><div key={image.id} className={`hub-background-choice ${image.id===props.selectedId?'selected':''}`}>
       <button type="button" aria-pressed={image.id===props.selectedId} onClick={()=>void choose(image.id)}>{image.url?<img src={image.url} className="preview" loading="lazy" alt={image.name}/>:<div className="preview"/>}<span>{image.id===props.selectedId?'✓ ':''}{image.name}</span></button>
       {image.source==='uploaded'&&<button type="button" className="remove" aria-label={`Delete ${image.name}`} onClick={()=>void execute(()=>props.removeUpload(image.id))}>×</button>}</div>)}</div>
   </>:<>
     <p>Link a second browser or phone using a temporary QR or numeric code. An existing trusted device must approve it and transfer historical encryption keys before the new device can read older messages.</p>
     <div className="hub-settings-actions"><button type="button" disabled={busy} onClick={()=>void execute(refreshDevices)}>↻ Refresh devices</button></div>
     {mine&&<div className="hub-device-card"><strong>This device · {ownStatus||'Checking'}</strong><small>{mine.id}</small><code>{mine.fingerprint}</code></div>}
     {ownStatus==='pending'&&<div className="hub-device-card"><strong>Get a linking code (new device)</strong><p>Leave this screen open, then use your original trusted device to approve.</p>
       {!pending?<button type="button" disabled={busy} onClick={()=>void start()}>Generate QR and numeric code</button>:<><div className="hub-qr"><QRCodeSVG value={pending.qrPayload} size={168}/></div><div className="hub-big-code">{pending.code}</div><small>Expires {new Date(pending.expiresAt).toLocaleTimeString()}</small><code>{pending.targetFingerprint}</code><button type="button" onClick={()=>void execute(async()=>{await supportApi.linkCancel(pending.id);setPending(null);})}>Cancel pairing</button></>}
     </div>}
     {ownStatus==='linked'&&<div className="hub-device-card"><strong>Link another device (original trusted device)</strong><p>Enter the code shown on your new device. You must verify its full fingerprint before approval.</p>
       <input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="10-digit code" inputMode="numeric" maxLength={10} aria-label="Link code"/>
       <button type="button" disabled={busy||code.length!==10} onClick={()=>void searchCode()}>Find device</button><button type="button" disabled={busy||scanning} onClick={()=>void scan()}>{scanning?'Scanning…':'Scan QR'}</button>{scanning&&<button type="button" onClick={closeCamera}>Stop scan</button>}
       {lookup&&<div className="hub-device-card"><strong>Approve {lookup.deviceName}</strong><small>New device: {lookup.targetDeviceId}</small><code>{lookup.targetFingerprint}</code><p>Enter the exact fingerprint shown on the new device. This prevents silently trusting a substituted key.</p>
       {approvedLink?.id!==lookup.id&&<input aria-label="New device fingerprint" value={fingerprintInput} onChange={e=>setFingerprintInput(e.target.value)} placeholder="Full fingerprint from the new device"/>}
       <button type="button" disabled={busy} onClick={()=>void approveAndTransfer()}>{approvedLink?.id===lookup.id?'Retry historical key transfer':'Approve and transfer previous conversations'}</button>
       {approvedLink?.id===lookup.id&&<button type="button" onClick={()=>{setApprovedLink(null);setLookup(null);try{sessionStorage.removeItem(`eleeveon:hub:approved-link:${props.accountId}:${props.userId}`);}catch{}}}>Hide completed link</button>}
       {progress&&<><small>{progress.conversations} conversations · {progress.processed} examined · {progress.transferred} keys delivered · {progress.skipped} unavailable</small>{busy&&!progress.done&&<button type="button" onClick={()=>{cancelTransfer.current=true;setStatus('Stopping history transfer after the current request…');}}>Stop transfer</button>}</>}
       </div>}
     </div>}
     <div className="hub-settings-warning">Historical access requires an existing device capable of reading those messages. If it has lost its keys, those messages cannot be recovered through the server. Revocation cannot remotely erase messages previously decrypted on another device.</div>
     {props.conversationId&&publicKeys.filter(k=>k.userId!==props.userId).map(key=>{
       const verified=readTrust(props.accountId,props.userId)[key.id]===key.fingerprint;
       return <div className="hub-device-card" key={key.id}><strong>Conversation participant · {key.userId}</strong><code>{key.fingerprint}</code>
         <small>{verified?'✓ Verified here':'Not verified here. Compare using a separate trusted channel.'}</small>
         {verifyId===key.id?<><input value={verifyInput} onChange={e=>setVerifyInput(e.target.value)} placeholder="Enter matching fingerprint" aria-label="Participant fingerprint"/><button type="button" onClick={()=>void verify(key)}>Confirm matching fingerprint</button><button type="button" onClick={()=>setVerifyId('')}>Cancel</button></>:<button type="button" onClick={()=>{setVerifyId(key.id);setVerifyInput('');}}>Verify participant key</button>}
       </div>;
     })}
     {devices.filter(d=>d.status!=='revoked').map(d=>{
       const key=publicKeys.find(k=>k.id===d.id);const verified=key&&readTrust(props.accountId,props.userId)[key.id]===key.fingerprint;
       return <div className="hub-device-card" key={d.id}><strong>{d.deviceName||'Device'} {d.id===mine?.id?'· This device':''} · {d.status}</strong><small>{d.id}</small><code>{d.fingerprint}</code>
         {key&&d.id!==mine?.id&&<><small>{verified?'✓ Verified here':'Fingerprint not verified on this browser'}</small>
           {verifyId===d.id?<><input value={verifyInput} onChange={e=>setVerifyInput(e.target.value)} aria-label="Full fingerprint to verify" placeholder="Compare and enter the full fingerprint"/><button type="button" onClick={()=>void verify(key)}>Confirm fingerprint</button><button type="button" onClick={()=>{setVerifyId('');setVerifyInput('');}}>Cancel</button></>:<button type="button" onClick={()=>{setVerifyId(d.id);setVerifyInput('');}}>Verify key</button>}
           {d.status==='linked'&&ownStatus==='linked'&&<button type="button" disabled={busy} onClick={()=>void revoke(d.id)}>Revoke device</button>}
         </>}
       </div>;
     })}
   </>}
   {status&&<div className="hub-settings-status" role="status">{status}</div>}
   {(error||props.error)&&<div className="hub-settings-error" role="alert">{error||props.error}</div>}
   </div>
  </section>
 </div>);
 return mounted?createPortal(view,document.body):null;
}
