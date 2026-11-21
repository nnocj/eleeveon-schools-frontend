/** Local staff credential foundation for Independent installations.
 * Important: browser IndexedDB provides no tamper-resistant authorization boundary.
 * Browser IndexedDB is not a tamper-resistant authorization boundary; assess data encryption and role isolation before release.
 * No Eleeveon server requests are made by this module.
 */
export type LocalRole = 'owner' | 'branch_admin' | 'teacher';
export type LocalGrant = { role: 'branch_admin' | 'teacher'; schoolId: string; branchId: string; teacherId?: string };
export type LocalStaffPublic = { id: string; accountId: string; displayName: string; role: LocalRole; active: boolean; schoolId?: string; branchId?: string; teacherId?: string; grants?: LocalGrant[] };
type StaffRecord = LocalStaffPublic & { salt: number[]; verifier: number[]; iterations: number; failed: number; lockedUntil: number; createdAt: number };
export type LocalSession = { readonly id: string; readonly accountId: string; readonly displayName: string; readonly role: LocalRole; readonly authenticatedAt: number; readonly expiresAt: number; readonly schoolId?: string; readonly branchId?: string; readonly teacherId?: string; readonly grants?: LocalGrant[] };
const DB_NAME = (() => { if(typeof window==='undefined')return 'eleeveon-independent-auth-v1'; const id=new URLSearchParams(window.location.search).get('license'); if(!id)return 'eleeveon-independent-auth-v1'; try{const old=localStorage.getItem('eleeveon_independent_browser_license_v1');if(old){const payload=JSON.parse(JSON.parse(old).envelope.payload);if(String(payload.licenseId||payload.id)===id)return 'eleeveon-independent-auth-v1';}}catch{} if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw new Error('Invalid Independent licence selector'); return `eleeveon-independent-auth-v1_${id}`; })();
const STORE = 'staff';
const ITERATIONS = 310_000;
// No arbitrary inactivity timeout: session remains valid until explicit lock/logout.
// This session is deliberately memory-only; after browser process restart, staff
// must prove identity again with their local password. Never persist a password.
const SESSION_MS = Number.POSITIVE_INFINITY;
const text = new TextEncoder();
let session: LocalSession | null = null;
function bytes(data: number[]): Uint8Array<ArrayBuffer> { return new Uint8Array(data); }
function equalConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i=0; i<a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations = ITERATIONS): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', text.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
  return new Uint8Array(bits);
}
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('Local IndexedDB storage is unavailable');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{const d=request.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error ?? new Error('Cannot open local credential store'));
    request.onblocked=()=>reject(new Error('Close other Eleeveon windows before upgrading the local credential store'));
  });
}
async function readAll():Promise<StaffRecord[]> {
  const db=await openDb();
  try {return await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly');const q=t.objectStore(STORE).getAll();q.onsuccess=()=>resolve(q.result as StaffRecord[]);q.onerror=()=>reject(q.error);});}
  finally {db.close();}
}
async function write(record:StaffRecord):Promise<void> {
  const db=await openDb();
  try {await new Promise<void>((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(record);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error??new Error('Local write aborted'));});}
  finally {db.close();}
}
function validPassword(password:string):boolean {return password.length>=12 && password.length<=256;}
function publicStaff(user:StaffRecord):LocalStaffPublic {const {id,accountId,displayName,role,active,schoolId,branchId,teacherId,grants}=user;return {id,accountId,displayName,role,active,schoolId,branchId,teacherId,grants};}
export async function isLocalOwnerProvisioned(accountId:string):Promise<boolean> {
  return (await readAll()).some(u=>u.accountId===accountId && u.role==='owner' && u.active);
}
/** Only call AFTER independently verifying an offline license and trusted installation identity.
 * In particular, do not expose this operation as unrestricted first-run UI on cloned backups.
 */
export async function provisionFirstLocalOwner(args:{accountId:string;displayName:string;password:string;licenseVerified:boolean}):Promise<LocalStaffPublic> {
  if(!args.licenseVerified) throw new Error('Verified offline license required');
  if(!args.accountId || !args.displayName.trim()) throw new Error('Missing account or staff name');
  if(!validPassword(args.password)) throw new Error('Use a password between 12 and 256 characters');
  const salt=crypto.getRandomValues(new Uint8Array(24));
  // Stable ID plus an atomic readwrite transaction prevents concurrent first-owner
  // registrations from granting two owner credentials for the same account.
  const user:StaffRecord={id:`owner:${args.accountId}`,accountId:args.accountId,displayName:args.displayName.trim(),role:'owner',active:true,salt:[...salt],verifier:[...await derive(args.password,salt)],iterations:ITERATIONS,failed:0,lockedUntil:0,createdAt:Date.now()};
  const db=await openDb();
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      const existing=store.getAll();
      existing.onsuccess=()=>{
        if ((existing.result as StaffRecord[]).some(r=>r.accountId===args.accountId && r.role==='owner')) {
          tx.abort(); return;
        }
        store.add(user);
      };
      existing.onerror=()=>{tx.abort();};
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error ?? new Error('Local owner provisioning failed'));
      tx.onabort=()=>reject(new Error('Local owner already provisioned or registration was interrupted'));
    });
  } finally {db.close();}
  return publicStaff(user);
}
export async function listLocalStaff(accountId:string):Promise<LocalStaffPublic[]> {
  return (await readAll()).filter(u=>u.accountId===accountId).map(publicStaff);
}
export async function signInLocal(args:{accountId:string;id:string;password:string}):Promise<LocalSession> {
  session=null;
  const user=(await readAll()).find(u=>u.id===args.id && u.accountId===args.accountId && u.active);
  if(!user) throw new Error('Incorrect credentials or inactive local account');
  if(user.lockedUntil>Date.now()) throw new Error('This local account is temporarily locked. Try later.');
  const attempt=await derive(args.password,bytes(user.salt),user.iterations);
  if(!equalConstantTime(attempt,bytes(user.verifier))) {
    user.failed+=1;
    if(user.failed>=5){user.failed=0;user.lockedUntil=Date.now()+15*60_000;}
    await write(user);
    throw new Error('Incorrect credentials or inactive local account');
  }
  user.failed=0;user.lockedUntil=0;await write(user);
  session={id:user.id,accountId:user.accountId,displayName:user.displayName,role:user.role,authenticatedAt:Date.now(),expiresAt:Number.MAX_SAFE_INTEGER,schoolId:user.schoolId,branchId:user.branchId,teacherId:user.teacherId,grants:user.grants || (user.role==='owner'?[]:[{role:user.role,schoolId:user.schoolId||'',branchId:user.branchId||''}])};
  return session;
}
export function currentLocalSession():LocalSession|null {
  if(!session){return null;}
  return session;
}
export function requireLocalSession(accountId:string, roles:LocalRole[]=[]):LocalSession {
  const current=currentLocalSession();
  if(!current||current.accountId!==accountId||(roles.length && !roles.includes(current.role)))throw new Error('Local authorization required');
  return current;
}
export function lockLocalSession():void {session=null;}

/** Owner-managed local staff. This store is per browser installation, not a remote identity service.
 * Never expose these methods to unverified Cloud sessions or public onboarding.
 */
export async function createLocalStaff(args:{accountId:string;displayName:string;password:string;role:'branch_admin'|'teacher';schoolId:string;branchId:string;teacherId?:string}):Promise<LocalStaffPublic>{
 const actor=requireLocalSession(args.accountId,['owner','branch_admin']);
 if(actor.role==='branch_admin' && (args.role!=='teacher' || !(await localSessionMemberships(actor)).some(g=>g.role==='branch_admin'&&g.schoolId===args.schoolId&&g.branchId===args.branchId))) throw new Error('Teacher must belong to your authorized branch');
 if(args.role==='teacher'&&!args.teacherId)throw new Error('Select an existing teacher profile');
 if(!args.schoolId||!args.branchId)throw new Error('Select a school and branch');
 if(!args.displayName.trim())throw new Error('Staff name is required');
 if(!validPassword(args.password))throw new Error('Password must be at least 12 characters');
 const salt=crypto.getRandomValues(new Uint8Array(24));
 const record:StaffRecord={id:crypto.randomUUID(),accountId:args.accountId,displayName:args.displayName.trim(),role:args.role,schoolId:args.schoolId,branchId:args.branchId,teacherId:args.teacherId,active:true,salt:[...salt],verifier:[...await derive(args.password,salt)],iterations:ITERATIONS,failed:0,lockedUntil:0,createdAt:Date.now()};
 const d=await openDb();try{await new Promise<void>((resolve,reject)=>{const t=d.transaction(STORE,'readwrite');const store=t.objectStore(STORE);const q=store.getAll();q.onsuccess=()=>{if(args.role==='teacher'&&(q.result as StaffRecord[]).some(r=>r.accountId===args.accountId&&r.role==='teacher'&&r.schoolId===args.schoolId&&r.branchId===args.branchId&&r.teacherId===args.teacherId)){t.abort();return;}store.add(record);};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}finally{d.close();}
 return publicStaff(record);
}
export async function setLocalStaffActive(accountId:string,id:string,active:boolean):Promise<void>{
 const actor=requireLocalSession(accountId,['owner','branch_admin']);
 const allowed:LocalGrant[]|null=actor.role==='owner'?null:await localSessionMemberships(actor);
 const d=await openDb();try{await new Promise<void>((resolve,reject)=>{const t=d.transaction(STORE,'readwrite');const store=t.objectStore(STORE);const request=store.get(id);request.onsuccess=()=>{const record=request.result as StaffRecord|undefined;if(!record||record.accountId!==accountId||record.role==='owner'||(allowed!==null&&(record.role!=='teacher'||!allowed.some((g:LocalGrant)=>g.role==='branch_admin'&&g.schoolId===record.schoolId&&g.branchId===record.branchId)))){t.abort();return;}store.put({...record,active});};request.onerror=()=>t.abort();t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error??new Error('Unable to change staff status'));t.onabort=()=>reject(new Error('Staff not found or owner account protected'));});}finally{d.close();}
}

export async function addLocalStaffGrant(args:{accountId:string;staffId:string;grant:LocalGrant}):Promise<void>{
 requireLocalSession(args.accountId,['owner']);
 if(!args.grant.schoolId || !args.grant.branchId)throw new Error('School and branch required');
 const d=await openDb();try{await new Promise<void>((resolve,reject)=>{
  const tx=d.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);const req=store.get(args.staffId);
  req.onsuccess=()=>{const record=req.result as StaffRecord|undefined;
   if(!record||record.accountId!==args.accountId||!record.active||record.role!==args.grant.role||(record.role==='teacher'&&!args.grant.teacherId)){tx.abort();return;}
   const grants:LocalGrant[]=record.grants || [{role:record.role,schoolId:record.schoolId||'',branchId:record.branchId||'',...(record.teacherId?{teacherId:record.teacherId}:{})}];
   if(!grants.some(g=>g.role===args.grant.role&&g.schoolId===args.grant.schoolId&&g.branchId===args.grant.branchId))
    store.put({...record,grants:[...grants,args.grant]});
  };req.onerror=()=>tx.abort();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Grant failed'));
  tx.onabort=()=>reject(new Error('Staff not found or inactive'));
 });window.dispatchEvent(new Event('independent-grants-changed'));}finally{d.close();}
}
export async function localSessionMemberships(current:LocalSession):Promise<LocalGrant[]>{
 const record=(await readAll()).find(u=>u.id===current.id&&u.accountId===current.accountId&&u.active);
 if(!record)throw new Error('Local staff session is no longer active');
 const primary:LocalGrant[]=record.role==='owner'?[]:[{role:record.role,schoolId:record.schoolId||'',branchId:record.branchId||''}];
 return [...primary.map(g=>({...g,teacherId:record.teacherId})),...(record.grants||[])].filter((g,i,a)=>g.schoolId&&g.branchId&&a.findIndex(x=>x.role===g.role&&x.schoolId===g.schoolId&&x.branchId===g.branchId)===i);
}

/** Bind a legacy local teacher login to an existing profile, without resetting its password. */
export async function linkLocalTeacherProfile(args:{accountId:string;staffId:string;schoolId:string;branchId:string;teacherId:string}):Promise<void>{
 const actor=requireLocalSession(args.accountId,['owner','branch_admin']);
 if(!args.teacherId)throw new Error('Select an existing teacher');
 if(actor.role==='branch_admin'&&!(await localSessionMemberships(actor)).some(g=>g.role==='branch_admin'&&g.schoolId===args.schoolId&&g.branchId===args.branchId))throw new Error('Unauthorized branch');
 const d=await openDb();try{await new Promise<void>((resolve,reject)=>{
 const tx=d.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),q=store.getAll();
 q.onsuccess=()=>{const rows=q.result as StaffRecord[];const user=rows.find(r=>r.id===args.staffId&&r.accountId===args.accountId&&r.role==='teacher'&&r.schoolId===args.schoolId&&r.branchId===args.branchId);
 if(!user||rows.some(r=>r.id!==args.staffId&&r.accountId===args.accountId&&r.role==='teacher'&&r.schoolId===args.schoolId&&r.branchId===args.branchId&&r.teacherId===args.teacherId)){tx.abort();return;}
 store.put({...user,teacherId:args.teacherId,grants:[{role:'teacher',schoolId:args.schoolId,branchId:args.branchId,teacherId:args.teacherId}]});};
 tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Cannot link teacher'));tx.onabort=()=>reject(new Error('Account missing, mismatched, or teacher already linked'));
 });}finally{d.close();}
 window.dispatchEvent(new Event('independent-grants-changed'));
}
