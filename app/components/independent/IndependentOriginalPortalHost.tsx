"use client";
import React, {useEffect, useState, useCallback} from "react";
import dynamic from "next/dynamic";
import DatabaseBootstrap from "../DatabaseBootstrap";
import {IndependentAccountProvider} from "../../context/account-context";
import {SettingsProvider} from "../../context/settings-context";
import {ActiveBranchProvider} from "../../context/active-branch-context";
import {IndependentActiveMembershipProvider} from "../../context/active-membership-context";
import {WindowChromeProvider} from "../../context/window-chrome-context";
import {ThemeProvider} from "../../context/theme-context";
import PortalAppearanceRuntime from "../PortalAppearanceRuntime";
import LocalAppearanceRuntime from "../LocalAppearanceRuntime";
import {IndependentRealtimeProvider} from "../../context/realtime-context";
import {SyncBootstrapProvider, useSyncBootstrap} from "../../context/sync-bootstrap-context";
import {SyncProvider} from "../../context/sync-context";
import {SubscriptionProvider} from "../../context/subscription-context";
import {localSessionMemberships,type LocalGrant,type LocalSession} from "../../lib/independent/localStaffAuth";
import {IndependentPortalIdentityProvider} from "../../lib/independent/independentPortalContext";
import type {UserMembership} from "../../lib/auth/roleRedirect";
import type {OfflineLicenseClaims} from "../../lib/independent/offlineLicense";
import IndependentBackupPanel from './IndependentBackupPanel';
import IndependentStaffManager from './IndependentStaffManager';
import IndependentRestorePanel from './IndependentRestorePanel';
import IndependentOnlineServices from './IndependentOnlineServices';
import {APP_DB_NAME} from '../../lib/db/db-version';
import {checkIndependentSchoolDatabase,type DatabaseReadiness} from '../../lib/independent/databaseReadiness';

const OwnerPortal = dynamic(()=>import("../../owner/page"),{ssr:false});
const BranchPortal = dynamic(()=>import("../../branch-admin/page"),{ssr:false});
const TeacherPortal = dynamic(()=>import("../../teacher/page"),{ssr:false});
function OfflineSyncStatus() {
 const {markSyncOffline}=useSyncBootstrap();
 useEffect(()=>{markSyncOffline();},[markSyncOffline]);
 return null;
}
/** Mounts original UI components. Does not grant server-side permissions or
 * invent local APIs for online-only features. Independent data sync must be disabled by transport guards. Browser storage is not a secure authorization boundary.
 */
export default function IndependentOriginalPortalHost({session,license,onLock}:{session:LocalSession;license:OfflineLicenseClaims;onLock:()=>void}) {
 const [confirmed,setConfirmed]=useState(true);
 const [grants,setGrants]=useState<LocalGrant[]>([]);
 const [selectedKey,setSelectedKey]=useState('');
 const [grantError,setGrantError]=useState('');
 const reloadGrants=useCallback(()=>{void localSessionMemberships(session).then(setGrants).catch(e=>setGrantError(String(e)));},[session]);
 useEffect(()=>{reloadGrants();window.addEventListener('independent-grants-changed',reloadGrants);return()=>window.removeEventListener('independent-grants-changed',reloadGrants);},[reloadGrants]);
 const teacherPortalAllowed = license.edition === 'independent_multi_device';
 const workspaces=grants.filter(g=>(g.role!=='teacher'||(teacherPortalAllowed && Boolean(g.teacherId)))).map(g=>({...g,key:`${g.role}:${g.schoolId}:${g.branchId}`}));
 const chosen=workspaces.find(g=>g.key===selectedKey)||workspaces[0];
 const effectiveRole = session.role === 'owner' ? 'owner' : (chosen?.role ?? session.role);
 // A signed Essentials licence never entitles this installation to the Teacher Portal.
 // This UI guard is defense in depth, not a replacement for server-side authorization.
 const editionDenied = !teacherPortalAllowed && (session.role === 'teacher' || effectiveRole === 'teacher');
 const membership:UserMembership=chosen?{id:`independent:${session.id}:${chosen.key}`,accountId:session.accountId,role:chosen.role,schoolId:chosen.schoolId,branchId:chosen.branchId,teacherId:chosen.teacherId||null,active:true}:{id:`independent:${session.id}`,accountId:session.accountId,role:session.role==='owner'?'super_admin':session.role,schoolId:session.schoolId||null,branchId:session.branchId||null,teacherId:null,active:true};
 const [toolsOpen,setToolsOpen]=useState(false);
 const [readiness,setReadiness]=useState<DatabaseReadiness|null>(null);
 const [checkingDb,setCheckingDb]=useState(false);

 const lock=useCallback(()=>{setConfirmed(true);onLock();},[onLock]);

 if (editionDenied) return <main role="alert" className="mx-auto max-w-xl p-6"><h1 className="text-xl font-semibold">Teacher Portal unavailable</h1><p className="mt-2">Independent Essentials does not include teacher sign-in. Ask the Branch Admin to share an Excel assessment workbook for completion and import, or upgrade to Independent Multi-device.</p><button type="button" className="mt-4 rounded border px-4 py-2" onClick={lock}>Lock</button></main>;
 if (session.accountId !== license.accountId || session.expiresAt<=Date.now())
   return <section role="alert">Local session does not match the verified Independent license.</section>;
 return <div className="min-h-dvh">
  <div className="sticky top-0 z-[9999] flex flex-wrap items-center justify-between gap-2 border-b border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-950">
    <span><strong>Eleeveon Independent</strong> · {session.displayName} · {session.role} · School records local · Eleeveon Hub and account services optional online</span>
    <div className="flex gap-2"><button type="button" onClick={()=>setToolsOpen(v=>!v)} className="rounded border px-3 py-1">{toolsOpen?"Close local backup tools":"Local backup tools"}</button><button type="button" onClick={lock} className="rounded border px-3 py-1">Lock</button></div>
  </div>
  <IndependentOnlineServices accountId={license.accountId}/>
  {toolsOpen && session.role==='owner' && <section className="mx-auto my-4 max-w-3xl rounded-xl border p-5"><IndependentStaffManager accountId={license.accountId}/><h2 className="mt-6 font-semibold">Owner-only local database recovery tools</h2><p className="my-2 text-sm">Backup files cover IndexedDB data, not external media directories. Never restore while other application windows are open.</p><button className="mb-3 rounded border px-3 py-2" disabled={checkingDb} onClick={()=>{setCheckingDb(true);void checkIndependentSchoolDatabase().then(setReadiness).finally(()=>setCheckingDb(false));}}>Check EleeveonDB</button>{readiness?.available && <><IndependentBackupPanel databaseName={APP_DB_NAME} accountId={license.accountId}/><IndependentRestorePanel databaseName={APP_DB_NAME} accountId={license.accountId}/></>}{readiness && !readiness.available && <p role="alert">{readiness.reason}</p>}</section>}
  {!confirmed ? <section className="mx-auto mt-12 max-w-xl rounded-xl border p-6"><h1 className="text-xl font-bold">Original Eleeveon Schools portals</h1><p className="mt-3">This screen mounts your unchanged portal components under the locally verified session. It is a development integration check; backend-only actions such as paid billing, credential issuance, account changes, and certain school modules do not yet have local services. Do not test with live student records.</p><button className="mt-5 rounded bg-blue-700 px-4 py-3 font-semibold text-white" onClick={()=>setConfirmed(true)}>Open my original {session.role.replace('_',' ')} portal</button></section> :
   <IndependentPortalIdentityProvider value={{session,license}}>
   <DatabaseBootstrap>
    <IndependentAccountProvider session={session} selectedMembership={membership} onLock={lock}>
     <SettingsProvider>
      <ActiveBranchProvider>
       <IndependentActiveMembershipProvider key={membership.id} session={session} selectedMembership={membership}>
        <WindowChromeProvider>
         <SubscriptionProvider accountId={session.accountId} authenticated={true} autoRefresh={false}>
          <ThemeProvider>
           <PortalAppearanceRuntime>
            <LocalAppearanceRuntime>
             <IndependentRealtimeProvider>
              <SyncBootstrapProvider>
               <SyncProvider>
                <OfflineSyncStatus/>
                {effectiveRole==='owner'?<OwnerPortal/>:effectiveRole==='branch_admin'?<BranchPortal/>:<TeacherPortal/>}
               </SyncProvider>
              </SyncBootstrapProvider>
             </IndependentRealtimeProvider>
            </LocalAppearanceRuntime>
           </PortalAppearanceRuntime>
          </ThemeProvider>
         </SubscriptionProvider>
        </WindowChromeProvider>
       </IndependentActiveMembershipProvider>
      </ActiveBranchProvider>
     </SettingsProvider>
    </IndependentAccountProvider>
   </DatabaseBootstrap>
   </IndependentPortalIdentityProvider>}
 </div>;
}
