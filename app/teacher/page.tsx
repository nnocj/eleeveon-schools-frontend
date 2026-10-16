"use client";
/** app/teacher/page.tsx — V32 reports share the exact Branch Admin sub-navigation and zoom layout. */
import React, { useState } from "react";
import RolePortalShell, { type RoleNavSection } from "../components/role-portals/RolePortalShell";
import { TEACHER_ROLES } from "../lib/auth/roleRedirect";
import Assessmententry from "./modules/Assessmententry";
import Teacherreports from "./modules/Teacherreports";
import Teacherbroadsheets from "./modules/Teacherbroadsheets";
import Teacherremarks from "./modules/Teacherremarks";
import Attendance from "./modules/Attendance";
import Teacherstudents from "./modules/Teacherstudents";
import { BranchReportZoomProvider, BranchReportZoomControls } from "../components/role-portals/shell/BranchReportPreview";
import { useTeacherWorkspaceAccess } from "../hooks/useTeacherWorkspaceAccess";

type RouteProps = { navigate: (key: string) => void };
type ReportView = "reports" | "broadsheets" | "remarks" | "attendance";

function ReportsWorkspace(props: RouteProps) {
  const [view, setView] = useState<ReportView>("reports");
  const access = useTeacherWorkspaceAccess();
  const isClassTeacher = access.classTeacherClassIds.size > 0;
  const available: Array<{ key: ReportView; label: string; Component: React.ComponentType<any> }> = [
    { key: "reports", label: "Report Cards", Component: Teacherreports },
    { key: "broadsheets", label: "Broadsheets", Component: Teacherbroadsheets },
    ...(isClassTeacher ? [
      { key: "remarks" as const, label: "Remarks", Component: Teacherremarks },
      { key: "attendance" as const, label: "Attendance", Component: Attendance },
    ] : []),
  ];
  const current = available.find((item) => item.key === view) || available[0];
  const CurrentView = current.Component;
  return (
    <BranchReportZoomProvider>
      <div className="ba-workspace-wrapper ba-reports-workspace teacher-reports-workspace">
        <style>{reportCss}</style>
        <div className="ba-contextual-actions ba-report-subtabs report-no-print" aria-label="Report views">
          <div className="ba-report-subtab-list" role="group" aria-label="Select report view">
            {available.map((item) => (
              <button type="button" key={item.key} className={current.key === item.key ? "is-active" : ""}
                aria-pressed={current.key === item.key} onClick={() => {
                  setView(item.key);
                  const pane = document.querySelector<HTMLElement>(".role-shell.workspace-locked-scroll .app-content");
                  if (pane) pane.scrollTop = 0;
                }}>{item.label}</button>
            ))}
          </div>
          {(current.key === "reports" || current.key === "broadsheets") && <BranchReportZoomControls />}
        </div>
        {!access.ready ? (
          <div className="teacher-portal-report-loading" role="status">Loading teacher assignments…</div>
        ) : !access.permitted ? (
          <div className="teacher-portal-report-loading" role="status">An active teacher membership is required.</div>
        ) : (
          <CurrentView {...props} />
        )}
      </div>
    </BranchReportZoomProvider>
  );
}

const reportCss = `
/* V32: identical Reports subnavigation structure and style to Branch Admin. */
.role-shell.branch-workspace-layout .ba-v7-nav .ba-v7-tool[aria-label="Add in Reports"]{display:none!important}

.ba-workspace-wrapper, .ba-setup-page { min-width:0; width:100%; }
/* V14: report previews start immediately below the subtabs; full available width. */
.ba-reports-workspace { width:100%; max-width:none; min-width:0; margin:0; padding:0; }
.ba-reports-workspace .ba-report-subtabs {
  display:flex; align-items:center; gap:6px; flex-wrap:nowrap;
  min-width:0; width:100%; margin:0; padding:4px 0 5px;
  position:sticky; top:0; z-index:22;
  background:var(--eds-shell-bg,var(--bg,var(--surface,#fff)));
  border-bottom:1px solid var(--border,rgba(15,23,42,.10));
  backdrop-filter:blur(12px);
}
.ba-report-subtab-list { display:flex; flex:1 1 auto; min-width:0; gap:4px;
  overflow-x:auto; scrollbar-width:thin; overscroll-behavior-x:contain; white-space:nowrap; }
.ba-reports-workspace .ba-report-subtab-list button { flex:0 0 auto; min-height:31px;
  border-radius:7px; padding:4px 9px; font-size:11px; }
.ba-global-report-zoom { flex:0 0 auto; display:flex; align-items:center; gap:3px;
  margin-left:auto; white-space:nowrap; }
.ba-global-report-zoom button,.ba-global-report-zoom select {
  box-sizing:border-box; height:31px; min-height:31px; border:1px solid var(--border,rgba(0,0,0,.14));
  border-radius:7px; background:var(--surface,#fff); color:var(--text,#111827); font:inherit;
  font-size:12px; font-weight:650; padding:0 5px; cursor:pointer;
}
.ba-global-report-zoom button { width:29px; min-width:29px; font-size:19px; }
.ba-global-report-zoom select { width:103px; max-width:103px; }
.ba-reports-workspace > .student-reports-page,
.ba-reports-workspace > .ba-page { width:100%!important; max-width:none!important; min-width:0;
  padding:0!important; margin:0!important; background:transparent; }
.ba-reports-workspace .student-reports-page .ba-print-card { width:100%; max-width:none;
  margin:0!important; padding:0!important; border:0!important; border-radius:0!important;
  background:transparent!important; overflow:visible; box-shadow:none!important; }
.ba-reports-workspace .student-reports-page .ba-print-zone { width:100%; padding:0!important; }
.ba-reports-workspace .ba-print-head,
.ba-reports-workspace .ba-report-toolbar { display:none!important; }
/* V15 — mobile has dedicated full-width tab row, then a right-aligned zoom row. */
@media(max-width:640px) {
 .ba-reports-workspace .ba-report-subtabs {
   display:flex; flex-direction:column; align-items:stretch;
   gap:5px; width:100%; min-width:0; padding-bottom:5px;
 }
 .ba-reports-workspace .ba-report-subtab-list {
   display:flex; width:100%; min-width:0; flex:0 0 auto;
   overflow-x:auto; padding-bottom:1px;
 }
 .ba-reports-workspace .ba-report-subtab-list button {
   font-size:11px; padding:4px 9px;
 }
 .ba-reports-workspace .ba-global-report-zoom {
   display:flex; width:100%; flex:0 0 auto; justify-content:flex-end;
   margin:0; padding:0;
 }
 .ba-reports-workspace .ba-global-report-zoom button {
   height:32px; width:34px; min-width:34px;
 }
 .ba-reports-workspace .ba-global-report-zoom select {
   height:32px; width:100px; max-width:100px; font-size:12px;
 }
}

/* Match Branch Admin's final contextual-button cascade, including zoom buttons. */
.ba-contextual-actions button, .ba-setup-empty-section button { min-height:34px; padding:7px 11px; border-radius:9px; border:1px solid var(--border,rgba(0,0,0,.14)); background:var(--surface,#fff); color:var(--text,#111827); cursor:pointer; font:inherit; font-size:12px; font-weight:700; }
.ba-contextual-actions button.is-active { border-color:var(--primary-color,#2563eb); background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff)); }
.teacher-portal-report-loading {min-height:190px;display:grid;place-items:center;padding:22px;
  color:var(--muted,#64748b);font-size:13px;text-align:center;}
/* Keep Report Cards and Broadsheets on the same full-width preview canvas. */
@media print {.ba-reports-workspace .ba-report-subtabs{display:none!important}}
`;

export const NAV_SECTIONS: RoleNavSection[] = [{ title: "Teaching", defaultOpen: true, items: [
  { key: "assessmentEntry", label: "Enter Scores", icon: "📝" },
  { key: "reportsWorkspace", label: "Reports", icon: "📄" },
  { key: "teacherStudents", label: "Students", icon: "👥" },
]}];
const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  assessmentEntry: Assessmententry,
  reportsWorkspace: ReportsWorkspace,
  teacherStudents: Teacherstudents,
};
export default function TeacherPage() {
  return <RolePortalShell portalTitle="Teacher Portal" portalSubtitle="Enter scores, reports and students"
    homeKey="assessmentEntry" allowedRoles={TEACHER_ROLES} navSections={NAV_SECTIONS}
    navigationMode="branch-workspace" routes={ROUTES} lockedContext={true}
    requireSchool={true} requireBranch={true} />;
}
