"use client";
import {useEffect,useState,type ReactNode} from 'react';
import IndependentLocalSignIn from './IndependentLocalSignIn';
import {getIndependentNativeBridge} from '../../lib/independent/nativeBridge';
import {ELEEVEON_RUNTIME} from '../../lib/independent/runtimeMode';
import {verifyOfflineLicense,type OfflineLicenseClaims} from '../../lib/independent/offlineLicense';
import {currentLocalSession,lockLocalSession,type LocalSession} from '../../lib/independent/localStaffAuth';

type State = {status:'loading'|'blocked'|'signin'|'signedin'; message?:string; license?:OfflineLicenseClaims};
/** Fail-closed Independent starter. Do not render Cloud portals or use Cloud tokens.
 * This is a native integration gate and backup workspace, NOT a complete school portal.
 * Local database authorization, staff provisioning and native bridges are still required.
 */
export default function IndependentRuntimeShell({children: _children}:{children:ReactNode}) {
 const [state,setState]=useState<State>({status:'loading'});
 const [session,setSession]=useState<LocalSession|null>(null);
 useEffect(()=>{
  let active=true;
  (async()=>{try{
    const bridge=getIndependentNativeBridge();
    if(!bridge) throw new Error('Independent native installation bridge is missing. Install the properly licensed native edition; a PWA alone is not sufficient.');
    if(ELEEVEON_RUNTIME==='cloud') throw new Error('Not an Independent build');
    const [installationId, accountId, envelope, publicKeys]=await Promise.all([bridge.getInstallationId(),bridge.getLicensedAccountId(),bridge.loadOfflineLicense(),bridge.loadPinnedIssuerPublicKeys()]);
    if(!envelope) throw new Error('No signed Independent license is installed');
    const license=await verifyOfflineLicense({envelope,publicKeys,expectedAccountId:accountId,expectedInstallationId:installationId,expectedEdition:ELEEVEON_RUNTIME,appMajorVersion:1});
    if(active) setState({status:'signin',license});
  }catch(e){if(active)setState({status:'blocked',message:e instanceof Error?e.message:'Independent licensing unavailable'});}})();
  return()=>{active=false;lockLocalSession();};
 },[]);
 if(state.status==='loading') return <main className="min-h-dvh grid place-items-center p-6"><p>Verifying installed offline license…</p></main>;
 if(state.status==='blocked'||!state.license)return <main className="min-h-dvh grid place-items-center bg-zinc-100 p-6 dark:bg-zinc-950"><section role="alert" className="max-w-lg rounded-2xl border bg-white p-6 dark:bg-zinc-900"><h1 className="text-xl font-semibold">Independent installation not ready</h1><p className="mt-3 text-sm">{state.message}</p><p className="mt-3 text-xs text-zinc-500">No school records were changed. This build will not fall back to Cloud authentication.</p></section></main>;
 if(!session || !currentLocalSession())return <IndependentLocalSignIn accountId={state.license.accountId} onAuthenticated={s=>{setSession(s);setState(v=>({...v,status:'signedin'}));}}/>;
 return <main className="min-h-dvh bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"><div className="mx-auto max-w-3xl space-y-4"><header className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Eleeveon Schools · Independent</h1><p className="text-sm text-zinc-500">Offline local installation · {session.displayName}</p></div><button className="rounded-lg border px-4 py-2" onClick={()=>{lockLocalSession();setSession(null);}}>Lock</button></header><div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Local sign-in and license verification foundation only. The school portals are intentionally not exposed until the native database authorization and first-owner provisioning are integrated.</div><p className="text-sm text-zinc-600 dark:text-zinc-300">Encrypted folder-backup component is included in the package but is not activated until the school database name and authorization checks are wired into the native runtime. No automatic or unsafe restore is performed.</p></div></main>;
}
