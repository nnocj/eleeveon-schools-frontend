'use client';
import {useEffect,useState,type ReactNode} from 'react';
import IndependentLocalSignIn from './IndependentLocalSignIn';
import IndependentFirstOwnerSetup from './IndependentFirstOwnerSetup';
import IndependentOriginalPortalHost from './IndependentOriginalPortalHost';
import IndependentBrowserActivation from './IndependentBrowserActivation';
import {readVerifiedBrowserLicense,selectedLicenseId,independentWorkspaceUrl,listVerifiedBrowserLicenses} from '../../lib/independent/browserLicense';
import type {OfflineLicenseClaims} from '../../lib/independent/offlineLicense';
import {currentLocalSession,lockLocalSession,isLocalOwnerProvisioned,type LocalSession} from '../../lib/independent/localStaffAuth';
/** Same PWA origin as Cloud, but an isolated Independent route/provider tree.
 * Never treat browser localStorage as hardware-backed device attestation.
 */
export default function IndependentRuntimeShell({_children,children}:{_children?:ReactNode;children?:ReactNode}){
 const [license,setLicense]=useState<OfflineLicenseClaims|null>(null);
 const [state,setState]=useState<'loading'|'activate'|'ready'|'blocked'>('loading');
 const [error,setError]=useState('');
 const [session,setSession]=useState<LocalSession|null>(null);
 const [ownerProvisioned,setOwnerProvisioned]=useState(false);
 useEffect(()=>{let alive=true;(async()=>{try{
  const adding=new URLSearchParams(window.location.search).get('activate')==='1';if(adding){setState('activate');return;}const verified=await readVerifiedBrowserLicense();
  if(!alive)return;
  if(!verified){setState('activate');return;}
  setLicense(verified.claims);setOwnerProvisioned(await isLocalOwnerProvisioned(verified.claims.accountId));setState('ready');
 }catch(e){if(alive){setError(e instanceof Error?e.message:'Licence verification failed');setState('blocked');}}})();return()=>{alive=false;lockLocalSession();};},[]);
 if(state==='loading')return <main className="min-h-dvh grid place-items-center p-6">Checking Independent licence…</main>;
 if(state==='blocked')return <main role="alert" className="min-h-dvh grid place-items-center p-6"><div className="max-w-md rounded border p-6"><h1 className="text-xl font-semibold">Independent licence unavailable</h1><p>{error}</p><p className="mt-3 text-sm">No school records were changed. Contact Eleeveon support for authorised recovery.</p></div></main>;
 if(state==='activate')return <IndependentBrowserActivation onActivated={async claims=>{const all=await listVerifiedBrowserLicenses();const found=all.find(x=>x.claims.accountId===claims.accountId && String((x.claims as any).licenseId)===String((claims as any).licenseId)); if(!found)throw new Error('Activated licence was not found');window.location.replace(independentWorkspaceUrl(found.selector));}}/>;
 if(!license)return null;
 if(!ownerProvisioned)return <IndependentFirstOwnerSetup accountId={license.accountId} installationVerified={true} onComplete={()=>setOwnerProvisioned(true)}/>;
 if(!session||!currentLocalSession())return <IndependentLocalSignIn accountId={license.accountId} onAuthenticated={setSession}/>;
 return <IndependentOriginalPortalHost session={session} license={license} onLock={()=>{lockLocalSession();setSession(null);}}/>;
}
