"use client";
import {useEffect,useState,type ReactNode} from 'react';
import IndependentLocalSignIn from './IndependentLocalSignIn';
import IndependentFirstOwnerSetup from './IndependentFirstOwnerSetup';
import IndependentBackupPanel from './IndependentBackupPanel';
import IndependentRestorePanel from './IndependentRestorePanel';
import IndependentSchoolWorkspace from './IndependentSchoolWorkspace';
import { APP_DB_NAME } from '../../lib/db/db-version';
import { checkIndependentSchoolDatabase, type DatabaseReadiness } from '../../lib/independent/databaseReadiness';
import {getIndependentNativeBridge} from '../../lib/independent/nativeBridge';
import {ELEEVEON_RUNTIME} from '../../lib/independent/runtimeMode';
import {verifyOfflineLicense,type OfflineLicenseClaims} from '../../lib/independent/offlineLicense';
import {currentLocalSession,lockLocalSession,isLocalOwnerProvisioned,type LocalSession} from '../../lib/independent/localStaffAuth';

type State = {status:'loading'|'blocked'|'signin'|'signedin'; message?:string; license?:OfflineLicenseClaims};
/** Fail-closed Independent starter. Do not render Cloud portals or use Cloud tokens.
 * This is a native integration gate and backup workspace, NOT a complete school portal.
 * Local database authorization, staff provisioning and native bridges are still required.
 */
export default function IndependentRuntimeShell({children: _children}:{children:ReactNode}) {
 const [state,setState]=useState<State>({status:'loading'});
 const [session,setSession]=useState<LocalSession|null>(null);
 const [ownerProvisioned,setOwnerProvisioned]=useState(false);
 const [dbReadiness,setDbReadiness]=useState<DatabaseReadiness|null>(null);
 const [checkingDb,setCheckingDb]=useState(false);
 useEffect(()=>{
  let active=true;
  (async()=>{try{
    const bridge=getIndependentNativeBridge();
    if(!bridge) throw new Error('Independent native installation bridge is missing. Install the properly licensed native edition; a PWA alone is not sufficient.');
    if(ELEEVEON_RUNTIME==='cloud') throw new Error('Not an Independent build');
    const [installationId, accountId, envelope, publicKeys]=await Promise.all([bridge.getInstallationId(),bridge.getLicensedAccountId(),bridge.loadOfflineLicense(),bridge.loadPinnedIssuerPublicKeys()]);
    if(!envelope) throw new Error('No signed Independent license is installed');
    const license=await verifyOfflineLicense({envelope,publicKeys,expectedAccountId:accountId,expectedInstallationId:installationId,expectedEdition:ELEEVEON_RUNTIME,appMajorVersion:1});
    const provisioned=await isLocalOwnerProvisioned(license.accountId);
    if(active){setOwnerProvisioned(provisioned);setState({status:'signin',license});}
  }catch(e){if(active)setState({status:'blocked',message:e instanceof Error?e.message:'Independent licensing unavailable'});}})();
  return()=>{active=false;lockLocalSession();};
 },[]);
 if(state.status==='loading') return <main className="min-h-dvh grid place-items-center p-6"><p>Verifying installed offline license…</p></main>;
 if(state.status==='blocked'||!state.license)return <main className="min-h-dvh grid place-items-center bg-zinc-100 p-6 dark:bg-zinc-950"><section role="alert" className="max-w-lg rounded-2xl border bg-white p-6 dark:bg-zinc-900"><h1 className="text-xl font-semibold">Independent installation not ready</h1><p className="mt-3 text-sm">{state.message}</p><p className="mt-3 text-xs text-zinc-500">No school records were changed. This build will not fall back to Cloud authentication.</p></section></main>;
 if(!ownerProvisioned)return <IndependentFirstOwnerSetup accountId={state.license.accountId} installationVerified={true} onComplete={()=>setOwnerProvisioned(true)}/>;
 if(!session || !currentLocalSession())return <IndependentLocalSignIn accountId={state.license.accountId} onAuthenticated={s=>{setSession(s);setState(v=>({...v,status:'signedin'}));}}/>;
 return <main className="min-h-dvh bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"><div className="mx-auto max-w-3xl space-y-4">
  <header className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Eleeveon Schools · Independent</h1><p className="text-sm text-zinc-500">Verified offline license · {session.displayName} · {session.role}</p></div><button className="rounded-lg border px-4 py-2" onClick={()=>{lockLocalSession();setSession(null);setDbReadiness(null);}}>Lock</button></header>
  <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Independent security workspace. School record workspace uses the real EleeveonDB. Advanced Cloud-dependent portal modules remain disabled until their local authorization and data paths are implemented.</div>
  <IndependentSchoolWorkspace license={state.license} session={session} />
  {session.role === 'owner' && <section className="rounded-xl border p-4 space-y-3"><h2 className="font-semibold">Real school database status</h2><button className="rounded-lg border px-3 py-2 text-sm" disabled={checkingDb} onClick={()=>{setCheckingDb(true);void checkIndependentSchoolDatabase().then(setDbReadiness).finally(()=>setCheckingDb(false));}}>{checkingDb?'Checking…':'Check EleeveonDB'}</button>
    {dbReadiness && <p className="text-sm" role="status">{dbReadiness.available?`Existing database detected: ${dbReadiness.name} (version ${dbReadiness.version}, ${dbReadiness.storeCount} stores)`:`Backup unavailable: ${dbReadiness.reason}`}</p>}
    {dbReadiness?.available && <><IndependentBackupPanel databaseName={APP_DB_NAME} accountId={state.license.accountId} /><IndependentRestorePanel databaseName={APP_DB_NAME} accountId={state.license.accountId} /></>}
  </section>}
  {session.role !== 'owner' && <p className="text-sm text-zinc-500">Only the verified local Owner can access this backup workspace.</p>}
  <p className="text-xs text-zinc-500">A successful backup includes IndexedDB data, not files held outside IndexedDB. Verify the backup separately, retain the passphrase, and do not treat Google Drive file mirroring as live device sync.</p>
 </div></main>;
}
