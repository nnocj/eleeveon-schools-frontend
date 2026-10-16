"use client";
/** app/teacher/page.tsx — Teacher Portal V28, Branch Admin-style three-tab navigation. */
import React, {useState} from "react";
import RolePortalShell,{type RoleNavSection} from "../components/role-portals/RolePortalShell";
import {TEACHER_ROLES} from "../lib/auth/roleRedirect";
import Assessmententry from "./modules/Assessmententry";
import Teacherreports from "./modules/Teacherreports";
import Teacherbroadsheets from "./modules/Teacherbroadsheets";
import Teacherremarks from "./modules/Teacherremarks";
import Attendance from "./modules/Attendance";
import Teacherstudents from "./modules/Teacherstudents";
import {BranchReportZoomProvider,BranchReportZoomControls} from "../components/role-portals/shell/BranchReportPreview";
import {useTeacherWorkspaceAccess} from "../hooks/useTeacherWorkspaceAccess";

type RouteProps={navigate:(key:string)=>void};
type ReportView="reports"|"broadsheets"|"remarks"|"attendance";
function ReportsWorkspace(props:RouteProps){
 const [view,setView]=useState<ReportView>("reports");
 const access=useTeacherWorkspaceAccess();
 const isClassTeacher=access.classTeacherClassIds.size>0;
 const available: {key:ReportView;label:string;Component:React.ComponentType<any>}[]=[
  {key:"reports",label:"Report Cards",Component:Teacherreports},
  {key:"broadsheets",label:"Broadsheets",Component:Teacherbroadsheets},
  ...(isClassTeacher?[{key:"remarks" as const,label:"Remarks",Component:Teacherremarks},{key:"attendance" as const,label:"Attendance",Component:Attendance}]:[]),
 ];
 const current=available.find(item=>item.key===view)||available[0];
 const CurrentView=current.Component;
 return <BranchReportZoomProvider><section className="teacher-reports-workspace">
   <style>{reportCss}</style>
   <div className="teacher-report-tabs report-no-print" role="group" aria-label="Report views">
    <div className="teacher-report-tab-list">{available.map(item=><button type="button" key={item.key} aria-pressed={current.key===item.key} className={current.key===item.key?"active":""} onClick={()=>{setView(item.key);document.querySelector<HTMLElement>(".role-shell.workspace-locked-scroll .app-content")?.scrollTo({top:0});}}>{item.label}</button>)}</div>
    {(current.key==="reports"||current.key==="broadsheets")&&<BranchReportZoomControls/>}
   </div>
   {!access.ready?<div className="teacher-report-state">Loading teacher assignments…</div>:!access.permitted?<div className="teacher-report-state">A linked teacher membership is required.</div>:<CurrentView {...props}/>}
 </section></BranchReportZoomProvider>;
}
const reportCss=`
/* Reports use their own report-specific controls; generic Add/Print is not exposed. */
.role-shell.branch-workspace-layout .ba-v7-nav .ba-v7-tool[aria-label="Add in Reports"]{display:none!important}
.teacher-reports-workspace{width:100%;min-width:0}.teacher-report-tabs{position:sticky;top:0;z-index:25;display:flex;align-items:center;min-width:0;gap:5px;padding:5px 0;background:var(--bg,var(--surface,#fff));border-bottom:1px solid var(--border,rgba(15,23,42,.1));backdrop-filter:blur(14px)}.teacher-report-tab-list{display:flex;gap:4px;flex:1 1 auto;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}.teacher-report-tab-list button{flex:0 0 auto;padding:7px 9px;min-height:32px;background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--border,rgba(15,23,42,.12));border-radius:7px;font-size:11px;cursor:pointer}.teacher-report-tab-list button.active{background:var(--primary-color,#2563eb);border-color:transparent;color:#fff}.teacher-report-state{padding:20px;text-align:center;color:var(--muted,#64748b)}.teacher-reports-workspace .student-reports-page,.teacher-reports-workspace .ba-page{width:100%!important;max-width:none!important;min-width:0;padding:0!important;background:transparent!important}.teacher-reports-workspace .ba-print-head{display:none!important}
@media(max-width:640px){.teacher-report-tabs{flex-wrap:wrap}.teacher-report-tabs .ba-global-report-zoom{margin-left:auto}}
`;
export const NAV_SECTIONS:RoleNavSection[]=[{title:"Teaching",defaultOpen:true,items:[
 {key:"assessmentEntry",label:"Enter Scores",icon:"📝"},
 {key:"reportsWorkspace",label:"Reports",icon:"📄"},
 {key:"teacherStudents",label:"Students",icon:"👥"},
]}];
const ROUTES:Record<string,React.ComponentType<RouteProps>>={
 assessmentEntry:Assessmententry,
 reportsWorkspace:ReportsWorkspace,
 teacherStudents:Teacherstudents,
};
export default function TeacherPage(){return <RolePortalShell
 portalTitle="Teacher Portal" portalSubtitle="Enter scores, reports and students"
 homeKey="assessmentEntry" allowedRoles={TEACHER_ROLES} navSections={NAV_SECTIONS}
 navigationMode="branch-workspace" routes={ROUTES} lockedContext={true}
 requireSchool={true} requireBranch={true}/>} 
