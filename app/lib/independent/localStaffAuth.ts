/** Local staff credential foundation for Independent installations.
 * Important: browser IndexedDB provides no tamper-resistant authorization boundary.
 * Native encrypted storage and trusted local API enforcement remain required before release.
 * No Eleeveon server requests are made by this module.
 */
export type LocalRole = 'owner' | 'branch_admin' | 'teacher';
export type LocalStaffPublic = { id: string; accountId: string; displayName: string; role: LocalRole; active: boolean };
type StaffRecord = LocalStaffPublic & { salt: number[]; verifier: number[]; iterations: number; failed: number; lockedUntil: number; createdAt: number };
export type LocalSession = { readonly id: string; readonly accountId: string; readonly displayName: string; readonly role: LocalRole; readonly authenticatedAt: number; readonly expiresAt: number };
const DB_NAME = 'eleeveon-independent-auth-v1';
const STORE = 'staff';
const ITERATIONS = 310_000;
const SESSION_MS = 12 * 60 * 60 * 1000;
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
function publicStaff(user:StaffRecord):LocalStaffPublic {const {id,accountId,displayName,role,active}=user;return {id,accountId,displayName,role,active};}
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
  if(await isLocalOwnerProvisioned(args.accountId)) throw new Error('Local owner already provisioned');
  const salt=crypto.getRandomValues(new Uint8Array(24));
  const user:StaffRecord={id:crypto.randomUUID(),accountId:args.accountId,displayName:args.displayName.trim(),role:'owner',active:true,salt:[...salt],verifier:[...await derive(args.password,salt)],iterations:ITERATIONS,failed:0,lockedUntil:0,createdAt:Date.now()};
  // Not safe for concurrent first-owner provisioning without a native process lock.
  await write(user);return publicStaff(user);
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
  session={id:user.id,accountId:user.accountId,displayName:user.displayName,role:user.role,authenticatedAt:Date.now(),expiresAt:Date.now()+SESSION_MS};
  return session;
}
export function currentLocalSession():LocalSession|null {
  if(!session || session.expiresAt<=Date.now()){session=null;return null;}
  return session;
}
export function requireLocalSession(accountId:string, roles:LocalRole[]=[]):LocalSession {
  const current=currentLocalSession();
  if(!current||current.accountId!==accountId||(roles.length && !roles.includes(current.role)))throw new Error('Local authorization required');
  return current;
}
export function lockLocalSession():void {session=null;}
