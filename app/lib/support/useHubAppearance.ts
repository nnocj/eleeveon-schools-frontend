'use client';
/** Hub background catalog: build-discovered public images + private server-stored personal uploads. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supportApi } from './supportApi';
export type HubBackground = { id: string; name: string; url: string; source: 'bundled'|'uploaded' };
const VALID = new Set(['image/png','image/jpeg','image/webp','image/avif','image/gif']);
const MAX_BYTES = 6*1024*1024;
const scopedKey=(a:string,u:string)=>`eleeveon:hub:selected-background:${JSON.stringify([a,u])}`;
export function useHubAppearance(accountId:string,userId:string) {
  const [bundled,setBundled] = useState<HubBackground[]>([]);
  const [personal,setPersonal] = useState<HubBackground[]>([]);
  const [selectedId,setSelectedId] = useState('gradient');
  const [error,setError] = useState('');
  const revision=useRef(0);
  const scope = `${accountId}|${userId}`;
  const reload = useCallback(async () => {
    const current=++revision.current;
    try {
      const response=await fetch('/api/hub/backgrounds',{cache:'no-store'});
      if (!response.ok) throw new Error('Cannot load the bundled Hub backgrounds.');
      const data=await response.json();
      const images:HubBackground[] = (Array.isArray(data.images)?data.images:[])
        .filter((row:any)=>typeof row.id==='string' && typeof row.name==='string' && typeof row.url==='string' && row.url.startsWith('/chat-backgroundimages/'))
        .map((row:any)=>({id:row.id,name:row.name,url:row.url,source:'bundled' as const}));
      if(current===revision.current)setBundled(images);
    }catch(cause){if(current===revision.current)setError(cause instanceof Error?cause.message:'Cannot load public backgrounds.');}
    if(!accountId||!userId)return;
    try{
      const data=await supportApi.backgrounds();
      if(current!==revision.current)return;
      setPersonal(data.uploads.filter(x=>!!x.url).map(x=>({id:`personal:${x.id}`,name:x.name,url:x.url!,source:'uploaded' as const})));
      const next=data.selected.kind==='default'?'gradient':data.selected.kind==='builtin'?`public:${data.selected.key}`:`personal:${data.selected.key}`;
      setSelectedId(next);
      try{localStorage.setItem(scopedKey(accountId,userId),next);}catch{}
      setError('');
    }catch(cause){if(current===revision.current)setError(cause instanceof Error?cause.message:'Unable to synchronize Hub appearance.');}
  },[accountId,userId]);
  useEffect(()=>{let saved='gradient';try{saved=localStorage.getItem(scopedKey(accountId,userId))||'gradient';}catch{}setSelectedId(saved);void reload();},[scope,reload]);
  // Signed private URLs expire after 10 minutes. Renew them on focus and periodically.
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void reload();};
    document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
    const interval=window.setInterval(refresh,8*60*1000);
    return()=>{document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);clearInterval(interval);};
  },[reload]);
  const select=useCallback(async(id:string)=>{
    if(!accountId||!userId)throw new Error('Sign in before saving your Hub background.');
    let kind:'default'|'builtin'|'personal'='default';let key='';
    if(id.startsWith('public:')){kind='builtin';key=id.slice(7);}else if(id.startsWith('personal:')){kind='personal';key=id.slice(9);}else if(id!=='gradient')throw new Error('Unknown Hub background.');
    // Remote save first: no falsely-synchronized local choice on a failed request.
    await supportApi.backgroundSelect(kind,key);
    setSelectedId(id);try{localStorage.setItem(scopedKey(accountId,userId),id);}catch{}
  },[accountId,userId]);
  const addUpload=useCallback(async(file:File)=>{
    if(!VALID.has(file.type)||!file.size||file.size>MAX_BYTES)throw new Error('Choose a PNG, JPEG, WebP, AVIF or GIF under 6 MB.');
    const result=await supportApi.backgroundUpload(file);
    await supportApi.backgroundSelect('personal',result.background.id);
    await reload();
  },[reload]);
  const removeUpload=useCallback(async(id:string)=>{
    if(!id.startsWith('personal:'))return;
    await supportApi.backgroundRemove(id.slice(9));
    await reload();
  },[reload]);
  const images=useMemo(()=>[{id:'gradient',name:'Soft colour',url:'',source:'bundled' as const},...bundled,...personal],[bundled,personal]);
  const selected=images.find(x=>x.id===selectedId)||images[0];
  const imageCss=selected.url ? `url(${JSON.stringify(selected.url)})` : 'linear-gradient(125deg,#c0e7e4,#b5c7de 45%,#e6c9b3)';
  return {images,selectedId:selected.id,imageCss,select,addUpload,removeUpload,reload,error,setError};
}
