'use client';
import { db, type IdentityCredential } from '../db/db';
import { apiRequest } from '../platformApi';
import { readVerifiedBrowserLicense, browserInstallationId } from '../independent/browserLicense';
import type { IdentityCardResult, IdentityTarget } from '../../branch-admin/modules/identity/identityApi';

const DB_NAME='eleeveon_independent_identity_keys_v1';
const STORE='keys';
const B64=(data:Uint8Array)=>btoa(Array.from(data,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const PEM=(data:Uint8Array)=>'-----BEGIN PUBLIC KEY-----\n'+btoa(Array.from(data,b=>String.fromCharCode(b)).join('')).match(/.{1,64}/g)!.join('\n')+'\n-----END PUBLIC KEY-----';
const buf=(u:Uint8Array):ArrayBuffer=>{const b=new Uint8Array(u.length);b.set(u);return b.buffer;};
const openKeys=()=>new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
async function keyStore<T>(mode:IDBTransactionMode, fn:(store:IDBObjectStore,resolve:(v:T)=>void,reject:(e:any)=>void)=>void):Promise<T>{
 const db=await openKeys();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);fn(store,resolve,reject);tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error);};});
}
const getKey=(id:string)=>keyStore<any>('readonly',(s,resolve,reject)=>{const r=s.get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const putKey=(id:string,value:any)=>keyStore<void>('readwrite',(s,resolve,reject)=>{const r=s.put(value,id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});
const account=async()=>{const l=await readVerifiedBrowserLicense();if(!l)throw new Error('A verified Independent licence is required');return l;};
const scopeKey=(licenseId:string,schoolId:string,branchId:string)=>`${licenseId}:${schoolId}:${branchId}`;
const settingsKey=(accountId:string,schoolId:string,branchId:string)=>`eleeveon_identity_policy:${accountId}:${schoolId}:${branchId}`;
export function readLocalIdentityPolicy(accountId:string,schoolId:string,branchId:string){
 const raw=localStorage.getItem(settingsKey(accountId,schoolId,branchId));
 return raw?JSON.parse(raw):{studentMode:'manual',teacherMode:'manual',expiryMonths:12,showClassPublicly:true,showNamePublicly:false};
}
export function saveLocalIdentityPolicy(accountId:string,schoolId:string,branchId:string,policy:any){localStorage.setItem(settingsKey(accountId,schoolId,branchId),JSON.stringify(policy));return policy;}
export async function isIndependentIdentity(accountId?:string):Promise<boolean>{
 const l=await readVerifiedBrowserLicense().catch(()=>null);
 return Boolean(l && (!accountId || l.claims.accountId===accountId));
}
async function provision(target:IdentityTarget){
 const {claims}=await account();
 const school=await db.schools.get(target.schoolId), branch=await db.branches.get(target.branchId);
 if (!school || !branch || school.accountId!==claims.accountId || branch.accountId!==claims.accountId || branch.schoolId!==school.id)throw new Error('School and branch must belong to the activated Independent account');
 const localId=scopeKey(claims.licenseId,target.schoolId,target.branchId);
 let saved=await getKey(localId);
 if (!saved){
  if(!navigator.onLine)throw new Error('First-time ID signing setup requires internet. Existing cards remain accessible offline.');
  const pair=await crypto.subtle.generateKey('Ed25519',false,['sign','verify']);
  const pem=PEM(new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey)));
  // Register before saving: if registration fails, don't create an untrusted offline issuer.
  const registered=await apiRequest<{kid:string}>('/identity/independent/issuer',{method:'POST',body:JSON.stringify({licenseId:claims.licenseId,installationId:browserInstallationId(),schoolId:target.schoolId,branchId:target.branchId,schoolName:school.name,branchName:branch.name,publicKeyPem:pem})});
  saved={kid:registered.kid,privateKey:pair.privateKey,publicKeyPem:pem};await putKey(localId,saved);
 }
 return {saved,claims};
}
async function localRecord(t:IdentityTarget){const {claims}=await account();const rows=await db.identityCredentials.where('subjectId').equals(t.subjectId).toArray().catch(()=>db.identityCredentials.toArray());return rows.filter(x=>x.accountId===claims.accountId&&x.schoolId===t.schoolId&&x.branchId===t.branchId&&x.subjectType===t.subjectType&&x.credentialType==='qr_code'&&x.provider==='eleeveon_independent').sort((a,b)=>(b.generatedAt||0)-(a.generatedAt||0))[0]||null;}
const cardResponse=(r:IdentityCredential|null):IdentityCardResult=>!r?{status:'not_issued'}:{status:r.status==='active'&&r.expiresAt&&r.expiresAt<Date.now()?'expired':r.status as any,issuedAt:new Date(r.generatedAt||Date.now()).toISOString(),expiresAt:r.expiresAt?new Date(r.expiresAt).toISOString():null,verificationUrl:String(r.metadata?.verificationUrl||'')};
export async function localGetCard(t:IdentityTarget){return cardResponse(await localRecord(t));}
export async function localIssueCard(t:IdentityTarget,replace=false,detail?:string){
 const {claims}=await account();
 const person=t.subjectType==='student'?await db.students.get(t.subjectId):await db.teachers.get(t.subjectId);
 if(!person || person.accountId!==claims.accountId || person.schoolId!==t.schoolId || person.branchId!==t.branchId || person.isDeleted || (t.subjectType==='teacher'&&(person as any).active===false) || (t.subjectType==='student'&&['graduated','withdrawn','transferred'].includes(String((person as any).status||''))))throw new Error('Person is not active in this Independent school');
 const policy=readLocalIdentityPolicy(claims.accountId,t.schoolId,t.branchId);
 if((t.subjectType==='student'?policy.studentMode:policy.teacherMode)==='disabled')throw new Error('ID issuance is disabled');
 const existing=await localRecord(t);
 if(existing?.status==='active' && (!existing.expiresAt||existing.expiresAt>Date.now())&&!replace)return cardResponse(existing);
 // Replacing an ID requires online revocation before issuing its successor.
 if(existing?.status==='active'&&replace)await localRevokeCard(t);
 const {saved}=await provision(t);
 const now=Math.floor(Date.now()/1000), expires=new Date(now*1000);expires.setUTCMonth(expires.getUTCMonth()+Math.max(1,Math.min(120,Number(policy.expiryMonths)||12)));
 const cid=crypto.randomUUID();
 const resolvedClass = t.subjectType==='student' && (person as any).currentClassId ? await db.classes.get(String((person as any).currentClassId)) : null;
 const payload={v:1,kid:saved.kid,cid,sid:t.schoolId,bid:t.branchId,typ:t.subjectType,ref:String((person as any).admissionNumber||(person as any).staffNumber||(person as any).employeeNumber||t.subjectId),name:String((person as any).fullName || "").trim(),...(policy.showClassPublicly&&(detail||resolvedClass?.name)?{className:detail||resolvedClass?.name}:{}),iat:now,exp:Math.floor(expires.getTime()/1000)};
 const signedPart='eid1.'+B64(new TextEncoder().encode(JSON.stringify(payload)));
 const signature=await crypto.subtle.sign('Ed25519',saved.privateKey,new TextEncoder().encode(signedPart));
 const verificationUrl=`https://schools.eleeveon.com/verify/${signedPart}.${B64(new Uint8Array(signature))}`;
 const row:IdentityCredential={id:cid,accountId:claims.accountId,schoolId:t.schoolId,branchId:t.branchId,subjectId:t.subjectId,subjectType:t.subjectType,credentialType:'qr_code',status:'active',credentialReference:payload.ref,provider:'eleeveon_independent',generatedAt:now*1000,expiresAt:expires.getTime(),metadata:{verificationUrl,kid:saved.kid,cid},createdAt:Date.now(),updatedAt:Date.now(),version:1,deviceId:browserInstallationId(),createdByDeviceId:browserInstallationId(),updatedByDeviceId:browserInstallationId(),synced:1 as any,isDeleted:false};
 await db.identityCredentials.put(row);return cardResponse(row);
}
export async function localRevokeCard(t:IdentityTarget){
 const existing=await localRecord(t);if(!existing||existing.status!=='active')throw new Error('No active Independent ID');
 const kid=String(existing.metadata?.kid||''),credentialId=String(existing.metadata?.cid||'');
 if(!navigator.onLine)throw new Error('Internet required to revoke or replace an ID publicly. No change was made.');
 await apiRequest('/identity/independent/revoke',{method:'POST',body:JSON.stringify({kid,credentialId})});
 await db.identityCredentials.update(existing.id,{status:'revoked',revokedAt:Date.now(),updatedAt:Date.now()});return {status:'revoked' as const};
}
