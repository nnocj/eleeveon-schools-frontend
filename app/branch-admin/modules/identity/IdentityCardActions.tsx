"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { db } from "../../../lib/db/db";
import { identityApi, type IdentityCardResult, type IdentityTarget } from "./identityApi";

export default function IdentityCardActions({subjectId,subjectType,schoolId,branchId,name,detail,photoUrl}:
  IdentityTarget & {name:string;detail?:string;photoUrl?:string}) {
  const target: IdentityTarget={subjectId,subjectType,schoolId,branchId};
  const [card,setCard]=useState<IdentityCardResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [open,setOpen]=useState(false);
  const [qr,setQr]=useState("");
  const [schoolName,setSchoolName]=useState("School Identification");
  const [accent,setAccent]=useState("#174777");
  useEffect(()=>{let stopped=false;
    Promise.all([db.schools.get(schoolId),db.identityCredentialDesignSettings.toArray()]).then(([school,designs])=>{
      if(stopped)return;
      if(school?.name)setSchoolName(school.name);
      const settings=designs.find(d=>!d.isDeleted&&d.active!==false&&String(d.schoolId)===schoolId&&String(d.branchId||"")===branchId&&d.isDefault&&(!d.subjectType||d.subjectType==="all"||d.subjectType===subjectType))
        ||designs.find(d=>!d.isDeleted&&d.active!==false&&String(d.schoolId)===schoolId&&String(d.branchId||"")===branchId);
      if(settings?.primaryColor)setAccent(settings.primaryColor);
    }).catch(()=>{});return()=>{stopped=true}
  },[schoolId,branchId,subjectType]);
  useEffect(()=>{let cancelled=false;
    identityApi.get(target).then(res=>{if(!cancelled)setCard(res)}).catch(()=>{if(!cancelled)setCard({status:"not_issued"})});
    return ()=>{cancelled=true};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[subjectId,subjectType,schoolId,branchId]);
  useEffect(()=>{let disposed=false;
    if (!card?.verificationUrl) {setQr("");return;}
    QRCode.toDataURL(card.verificationUrl,{width:240,margin:2,errorCorrectionLevel:"M"})
      .then(url=>{if(!disposed)setQr(url)}).catch(()=>{if(!disposed)setError("QR image could not be generated.")});
    return ()=>{disposed=true};
  },[card?.verificationUrl]);
  async function issue(replace=false){setBusy(true);setError("");try{setCard(await identityApi.issue(target,replace));setOpen(true)}catch(e:any){setError(e?.message||"Connect to the internet and synchronize this person before issuing an ID.")}finally{setBusy(false)}}
  async function revoke(){if(!window.confirm("Revoke this card? Its QR link will stop verifying."))return;
    setBusy(true);setError("");try{await identityApi.revoke(target);setCard({status:"revoked"});setOpen(false)}catch(e:any){setError(e?.message||"Could not revoke ID.")}finally{setBusy(false)}}
  function printCard(){window.print()}
  const hasCard=Boolean(card?.verificationUrl&&card.status==="active");
  return <>
    <button type="button" onClick={()=>hasCard?setOpen(true):void issue()} disabled={busy}>
      <span>▣</span><b>{busy?"Working...":hasCard?"View ID Card":"Generate ID"}</b>
      <small>{hasCard?"View verification QR, print or replace":"Issue a verifiable student or teacher ID"}</small>
    </button>
    {hasCard&&<button type="button" onClick={()=>void issue(true)} disabled={busy}>
      <span>↻</span><b>Replace ID</b><small>Immediately invalidate the previous QR code</small>
    </button>}
    {hasCard&&<button type="button" onClick={()=>void revoke()} disabled={busy}>
      <span>⊘</span><b>Revoke ID</b><small>Disable public verification of this credential</small>
    </button>}
    {error&&<p role="alert" style={{color:"#b91c1c",fontSize:12}}>{error}</p>}
    {open&&hasCard&&typeof document!=="undefined"&&createPortal(<div className="eleeveon-card-backdrop" role="dialog" aria-modal="true" aria-label="ID card preview">
      <style>{`
        .eleeveon-card-backdrop{position:fixed;inset:0;z-index:2147483000;background:#020617b8;display:grid;place-items:center;padding:12px;overflow:auto}
        .eleeveon-card-panel{width:min(100%,480px);background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);padding:14px;border-radius:14px}
        .eleeveon-card-panel button{cursor:pointer;padding:9px;border:1px solid var(--border,#cbd5e1);border-radius:7px;background:var(--surface,#fff);color:var(--text,#111827)}
        .eleeveon-id-paper{width:350px;max-width:100%;margin:auto;border:1px solid #bccbd9;border-radius:13px;overflow:hidden;background:white;color:#172237;print-color-adjust:exact;-webkit-print-color-adjust:exact}
        .eleeveon-id-top{background:#174777;color:#fff;padding:12px;text-align:center;font-size:14px;font-weight:800}
        .eleeveon-id-core{display:flex;gap:10px;padding:12px;align-items:center}
        .eleeveon-id-core img.photo{width:66px;height:82px;object-fit:cover;border-radius:6px;background:#e2e8f0}
        .eleeveon-id-core img.qr{width:88px;height:88px;object-fit:contain}
        @media print{body *{visibility:hidden!important}.eleeveon-id-paper,.eleeveon-id-paper *{visibility:visible!important}.eleeveon-id-paper{position:fixed;top:0;left:0;max-width:none!important;box-shadow:none!important}@page{margin:7mm}}
      `}</style>
      <section className="eleeveon-card-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><strong>ID Card Preview</strong><button type="button" onClick={()=>setOpen(false)}>✕ Close</button></div>
        <article className="eleeveon-id-paper">
          <div className="eleeveon-id-top" style={{background:accent}}>{schoolName.toUpperCase()}<br/><small>{subjectType.toUpperCase()} ID</small></div>
          <div className="eleeveon-id-core">
            {photoUrl?<img className="photo" src={photoUrl} alt="Cardholder"/>:<div style={{width:66,height:82,display:"grid",placeItems:"center",background:"#e2e8f0"}}>◉</div>}
            <div style={{flex:1,minWidth:0}}><b style={{display:"block",fontSize:13}}>{name}</b><small>{detail||subjectType}</small><br/><small>Valid to: {card.expiresAt?new Date(card.expiresAt).toLocaleDateString():"Not set"}</small></div>
            {qr&&<img className="qr" src={qr} alt="Public verification QR code"/>}
          </div>
          <div style={{background:"#e5edf5",padding:7,textAlign:"center",fontSize:10}}>Scan QR to verify online · Powered by Eleeveon Schools</div>
        </article>
        <p style={{fontSize:11,opacity:.8}}>Verification requires internet access. The card design is a basic layout; branch designs can be routed through the existing credential template registry.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
          <button type="button" onClick={printCard}>Print ID</button>
          <button type="button" onClick={()=>navigator.clipboard?.writeText(card.verificationUrl||"")}>Copy verification link</button>
          <button type="button" onClick={()=>setOpen(false)}>Done</button>
        </div>
      </section>
    </div>,document.body)}
  </>;
}
