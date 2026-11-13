"use client";
/** Separate online sign-in; never promotes this token to the local school session. */
let onlineToken: string | null = null;
let accountScope: string | null = null;
const listeners=new Set<()=>void>();
export function readOnlineServicesToken(){return onlineToken;}
export function onlineServicesAccount(){return accountScope;}
export function setOnlineServicesSession(token:string, accountId:string){
 if(!token||!accountId)throw Error('Invalid online session');
 onlineToken=token;accountScope=accountId;listeners.forEach(fn=>fn());
}
export function clearOnlineServicesSession(){onlineToken=null;accountScope=null;listeners.forEach(fn=>fn());}
export function subscribeOnlineServicesSession(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};}
