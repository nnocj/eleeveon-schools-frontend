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
import type {LocalSession} from "../../lib/independent/localStaffAuth";
import type {OfflineLicenseClaims} from "../../lib/independent/offlineLicense";
import IndependentBackupPanel from './IndependentBackupPanel';
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
 * invent local APIs for online-only features. External requests are blocked by
 * the Electron application. This stage is for controlled local verification.
 */
export default function IndependentOriginalPortalHost({session,license,onLock}:{session:LocalSession;license:OfflineLicenseClaims;onLock:()=>void}) {
 const [confirmed,setConfirmed]=useState(false);
 const [toolsOpen,setToolsOpen]=useState(false);
 const [readiness,setReadiness]=useState<DatabaseReadiness|null>(null);
 const [checkingDb,setCheckingDb]=useState(false);
 const previewEnabled = process.env.NEXT_PUBLIC_ELEEVEON_PORTAL_COMPAT_PREVIEW === "1";
 const lock=useCallback(()=>{setConfirmed(false);onLock();},[onLock]);
 if (!previewEnabled) return <section role="alert" className="m-8 rounded-xl border p-5">Original portal compatibility preview is disabled in this build. This is not a commercially approved offline portal.</section>;
 if (session.accountId !== license.accountId || session.expiresAt<=Date.now())
   return <section role="alert">Local session does not match the verified Independent license.</section>;
 return <div className="min-h-dvh">
  <div className="sticky top-0 z-[9999] flex flex-wrap items-center justify-between gap-2 border-b border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-950">
    <span><strong>Independent development runtime</strong> · {session.displayName} · {session.role} · School records local · Eleeveon Hub and account services optional online</span>
    <div className="flex gap-2"><button type="button" onClick={()=>setConfirmed(v=>!v)} className="rounded border px-3 py-1">{confirmed?'Hide portal':'Open original portal (test)'}</button><button type="button" onClick={()=>setToolsOpen(v=>!v)} className="rounded border px-3 py-1">{toolsOpen?"Close local backup tools":"Local backup tools"}</button><button type="button" onClick={lock} className="rounded border px-3 py-1">Lock</button></div>
  </div>
  <IndependentOnlineServices accountId={license.accountId}/>
  {toolsOpen && session.role==='owner' && <section className="mx-auto my-4 max-w-3xl rounded-xl border p-5"><h2 className="font-semibold">Owner-only local database recovery tools</h2><p className="my-2 text-sm">Backup files cover IndexedDB data, not external media directories. Never restore while other application windows are open.</p><button className="mb-3 rounded border px-3 py-2" disabled={checkingDb} onClick={()=>{setCheckingDb(true);void checkIndependentSchoolDatabase().then(setReadiness).finally(()=>setCheckingDb(false));}}>Check EleeveonDB</button>{readiness?.available && <><IndependentBackupPanel databaseName={APP_DB_NAME} accountId={license.accountId}/><IndependentRestorePanel databaseName={APP_DB_NAME} accountId={license.accountId}/></>}{readiness && !readiness.available && <p role="alert">{readiness.reason}</p>}</section>}
  {!confirmed ? <section className="mx-auto mt-12 max-w-xl rounded-xl border p-6"><h1 className="text-xl font-bold">Original Eleeveon Schools portals</h1><p className="mt-3">This screen mounts your unchanged portal components under the locally verified session. It is a development integration check; backend-only actions such as paid billing, credential issuance, account changes, and certain school modules do not yet have local services. Do not test with live student records.</p><button className="mt-5 rounded bg-blue-700 px-4 py-3 font-semibold text-white" onClick={()=>setConfirmed(true)}>Open my original {session.role.replace('_',' ')} portal</button></section> :
   <DatabaseBootstrap>
    <IndependentAccountProvider session={session} onLock={lock}>
     <SettingsProvider>
      <ActiveBranchProvider>
       <IndependentActiveMembershipProvider session={session}>
        <WindowChromeProvider>
         <SubscriptionProvider accountId={session.accountId} authenticated={true} autoRefresh={false}>
          <ThemeProvider>
           <PortalAppearanceRuntime>
            <LocalAppearanceRuntime>
             <IndependentRealtimeProvider>
              <SyncBootstrapProvider>
               <SyncProvider>
                <OfflineSyncStatus/>
                {session.role==='owner'?<OwnerPortal/>:session.role==='branch_admin'?<BranchPortal/>:<TeacherPortal/>}
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
   </DatabaseBootstrap>}
 </div>;
}
