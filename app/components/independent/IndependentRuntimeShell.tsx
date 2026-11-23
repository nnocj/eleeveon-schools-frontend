'use client';
import {useEffect,useState,type ReactNode} from 'react';
import IndependentOriginalPortalHost from './IndependentOriginalPortalHost';
import IndependentBrowserActivation from './IndependentBrowserActivation';
import {readVerifiedBrowserLicense,independentWorkspaceUrl,listVerifiedBrowserLicenses} from '../../lib/independent/browserLicense';
import type {OfflineLicenseClaims} from '../../lib/independent/offlineLicense';
import {restoreVerifiedIndependentIdentity,type VerifiedIndependentIdentity} from '../../lib/auth/independentVerifiedIdentity';
import {performAtomicLogout} from '../../lib/auth/logout';
import {revalidateIndependentIdentity} from '../../lib/auth/revalidateIndependentIdentity';

/** Independent uses the same central identity, with a signed grant for offline use.
 * No second local password and no implicit owner provisioning.
 */
export default function IndependentRuntimeShell({children}:{children?:ReactNode}) {
 const [license,setLicense]=useState<OfflineLicenseClaims|null>(null);
 const [identity,setIdentity]=useState<VerifiedIndependentIdentity|null>(null);
 const [state,setState]=useState<'loading'|'activate'|'ready'|'signin'|'blocked'>('loading');
 const [error,setError]=useState('');
 useEffect(()=>{let alive=true;(async()=>{try {
   if(new URLSearchParams(window.location.search).get('activate')==='1'){if(alive)setState('activate');return;}
   const verified=await readVerifiedBrowserLicense();
   if(!alive)return;
   if(!verified){setState('activate');return;}
   setLicense(verified.claims);
   const restored=await restoreVerifiedIndependentIdentity();
   if(!alive)return;
   if(!restored){setState('signin');return;}
   const validation=await revalidateIndependentIdentity(restored);
   if(!alive)return;
   if(validation==='revoked'){setError('Membership or installation authorization was revoked online.');setState('blocked');return;}
   if(validation==='signin-required' && navigator.onLine){setState('signin');return;}
   setIdentity(restored);setState('ready');
 }catch(e){if(alive){setError(e instanceof Error?e.message:'Authorization unavailable');setState('blocked');}}})();return()=>{alive=false;};},[]);
 if(state==='loading')return <main className="min-h-dvh grid place-items-center p-6">Verifying Independent authorization…</main>;
 if(state==='blocked')return <main role="alert" className="p-6"><h1 className="text-xl font-semibold">Independent authorization unavailable</h1><p>{error}</p><p>School records have not been modified.</p></main>;
 if(state==='activate')return <IndependentBrowserActivation onActivated={async claims=>{const all=await listVerifiedBrowserLicenses();const found=all.find(x=>x.claims.accountId===claims.accountId && String(x.claims.licenseId)===String(claims.licenseId));if(!found)throw new Error('Activated licence not found');window.location.replace(independentWorkspaceUrl(found.selector));}}/>;
 if(state==='signin')return <main className="mx-auto max-w-lg p-6"><h1 className="text-xl font-semibold">Central sign-in required</h1><p className="my-3">Sign in once with your Eleeveon email and password while online to enroll this installation for offline access. No additional Independent password is required.</p><a className="underline" href="/login">Continue to Eleeveon sign-in</a></main>;
 if(!license||!identity)return null;
 return <IndependentOriginalPortalHost identity={identity} license={license} onLogout={()=>void performAtomicLogout({redirectTo:'/login'})}/>;
}
