'use client';
import React,{useEffect} from 'react';
import dynamic from 'next/dynamic';
import DatabaseBootstrap from '../DatabaseBootstrap';
import {VerifiedIndependentAccountProvider} from '../../context/account-context';
import {SettingsProvider} from '../../context/settings-context';
import {ActiveBranchProvider} from '../../context/active-branch-context';
import {VerifiedIndependentMembershipProvider} from '../../context/active-membership-context';
import {WindowChromeProvider} from '../../context/window-chrome-context';
import {ThemeProvider} from '../../context/theme-context';
import PortalAppearanceRuntime from '../PortalAppearanceRuntime';
import LocalAppearanceRuntime from '../LocalAppearanceRuntime';
import {IndependentRealtimeProvider} from '../../context/realtime-context';
import {SyncBootstrapProvider,useSyncBootstrap} from '../../context/sync-bootstrap-context';
import {SyncProvider} from '../../context/sync-context';
import {SubscriptionProvider} from '../../context/subscription-context';
import type {VerifiedIndependentIdentity} from '../../lib/auth/independentVerifiedIdentity';
import type {OfflineLicenseClaims} from '../../lib/independent/offlineLicense';

const OwnerPortal=dynamic(()=>import('../../owner/page'),{ssr:false});
const BranchPortal=dynamic(()=>import('../../branch-admin/page'),{ssr:false});
const TeacherPortal=dynamic(()=>import('../../teacher/page'),{ssr:false});
function OfflineStatus(){const {markSyncOffline}=useSyncBootstrap();useEffect(()=>{markSyncOffline();},[markSyncOffline]);return null;}
/** No local credential or LocalSession. Online-only operations still need API authorization.
 * Existing school database is opened by DatabaseBootstrap; no migrations or deletion here.
 */
export default function IndependentOriginalPortalHost({identity,license,onLogout}:{identity:VerifiedIndependentIdentity;license:OfflineLicenseClaims;onLogout:()=>void}){
 const membership=identity.membership;
 if(identity.accountId!==license.accountId||identity.edition!==license.edition)return <main role="alert">Independent identity and licence do not match.</main>;
 if(identity.edition==='independent_essentials'&&membership.role==='teacher')return <main role="alert">Teacher portal is unavailable on Independent Essentials.</main>;
 return <DatabaseBootstrap>
  <VerifiedIndependentAccountProvider identity={identity} onLogout={onLogout}>
   <SettingsProvider><ActiveBranchProvider>
    <VerifiedIndependentMembershipProvider membership={membership}>
     <WindowChromeProvider>
      <SubscriptionProvider accountId={identity.accountId} authenticated={true} autoRefresh={false}>
       <ThemeProvider><PortalAppearanceRuntime><LocalAppearanceRuntime>
        <IndependentRealtimeProvider><SyncBootstrapProvider><SyncProvider>
         <OfflineStatus/>
         {membership.role==='super_admin'?<OwnerPortal/>:membership.role==='branch_admin'?<BranchPortal/>:membership.role==='teacher'?<TeacherPortal/>:<main role="alert">This membership cannot access an Independent portal.</main>}
        </SyncProvider></SyncBootstrapProvider></IndependentRealtimeProvider>
       </LocalAppearanceRuntime></PortalAppearanceRuntime></ThemeProvider>
      </SubscriptionProvider>
     </WindowChromeProvider>
    </VerifiedIndependentMembershipProvider>
   </ActiveBranchProvider></SettingsProvider>
  </VerifiedIndependentAccountProvider>
 </DatabaseBootstrap>;
}
