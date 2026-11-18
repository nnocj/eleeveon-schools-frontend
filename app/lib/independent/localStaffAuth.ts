/** Local staff credential foundation for Independent installations.
 * Important: browser IndexedDB provides no tamper-resistant authorization boundary.
 * Browser IndexedDB is not a tamper-resistant authorization boundary; assess data encryption and role isolation before release.
 * No Eleeveon server requests are made by this module.
 */
export type LocalRole = 'owner' | 'branch_admin' | 'teacher';
export type LocalStaffPublic = { id: string; accountId: string; displayName: string; role: LocalRole; active: boolean; schoolId?: string; branchId?: string };
type StaffRecord = LocalStaffPublic & { salt: number[]; verifier: number[]; iterations: number; failed: number; lockedUntil: number; createdAt: number };
export type LocalSession = { readonly id: string; readonly accountId: string; readonly displayName: string; readonly role: LocalRole; readonly authenticatedAt: number; readonly expiresAt: number; readonly schoolId?: string; readonly branchId?: string };
const DB_NAME = 'eleeveon-independent-auth-v1';
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
function publicStaff(user:StaffRecord):LocalStaffPublic {const {id,accountId,displayName,role,active,schoolId,branchId}=user;return {id,accountId,displayName,role,active,schoolId,branchId};}
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
  session={id:user.id,accountId:user.accountId,displayName:user.displayName,role:user.role,authenticatedAt:Date.now(),expiresAt:Number.MAX_SAFE_INTEGER,schoolId:user.schoolId,branchId:user.branchId};
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
export async function createLocalStaff(args:{accountId:string;displayName:string;password:string;role:'branch_admin'|'teacher';schoolId:string;branchId:string}):Promise<LocalStaffPublic>{
 requireLocalSession(args.accountId,['owner']);
 if(!args.schoolId||!args.branchId)throw new Error('Select a school and branch');
 if(!args.displayName.trim())throw new Error('Staff name is required');
 if(!validPassword(args.password))throw new Error('Password must be at least 12 characters');
 const salt=crypto.getRandomValues(new Uint8Array(24));
 const record:StaffRecord={id:crypto.randomUUID(),accountId:args.accountId,displayName:args.displayName.trim(),role:args.role,schoolId:args.schoolId,branchId:args.branchId,active:true,salt:[...salt],verifier:[...await derive(args.password,salt)],iterations:ITERATIONS,failed:0,lockedUntil:0,createdAt:Date.now()};
 const d=await openDb();try{await new Promise<void>((resolve,reject)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).add(record);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}finally{d.close();}
 return publicStaff(record);
}
export async function setLocalStaffActive(accountId:string,id:string,active:boolean):Promise<void>{
 requireLocalSession(accountId,['owner']);
 const d=await openDb();try{await new Promise<void>((resolve,reject)=>{const t=d.transaction(STORE,'readwrite');const store=t.objectStore(STORE);const request=store.get(id);request.onsuccess=()=>{const record=request.result as StaffRecord|undefined;if(!record||record.accountId!==accountId||record.role==='owner'){t.abort();return;}store.put({...record,active});};request.onerror=()=>t.abort();t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error??new Error('Unable to change staff status'));t.onabort=()=>reject(new Error('Staff not found or owner account protected'));});}finally{d.close();}
}
