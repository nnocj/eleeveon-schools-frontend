"use client";

/**
 * app/branch-admin/page.tsx
 * BRANCH ADMIN — ENTER SCORES + ATTENDANCE WORKSPACE
 * Six direct destinations, Enter Scores as home; Student Attendance in Reports.
 * Other module source files and DB tables are left untouched.
 * Existing branch-scoped sync and workspace settings remain in place.
 */
import React, { useEffect, useRef } from "react";
import RolePortalShell, { type RoleNavSection } from "../components/role-portals/RolePortalShell";
import { BRANCH_ADMIN_ROLES } from "../lib/auth/roleRedirect";
import LocalSettings from "../components/role-portals/LocalSettings";
import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";
import { runSync } from "../lib/sync/syncEngine";

// Main report-focused destinations
import Students from "./modules/Students";
import Teachers from "./modules/Teachers";
import Parents from "./modules/Parents";
import Classes from "./modules/Classes";
import TermFeesRequirements from "./modules/finance/TermFeesRequirements";
import Expenses from "./modules/Expenses";
import Incomes from "./modules/Incomes";
import AssessmentEntries from "./modules/AssessmentEntries";
import StudentReports from "./modules/reports/StudentReports";
import Broadsheets from "./modules/reports/Broadsheets";
import ReportRemarks from "./modules/ReportRemarks";
import StudentAttendance from "./modules/StudentAttendance";
import { BranchReportZoomProvider, BranchReportZoomControls } from "../components/role-portals/shell/BranchReportPreview";

// Existing academic setup editors; included in one Setup workspace.
import AcademicSystems from "./modules/AcademicSystems";
import Organizations from "./modules/Organizations";
import ReportCardSettings from "./modules/ReportCardSettings";
import CurriculumSystems from "./modules/CurriculumSystems";
import SubjectSetup from "./modules/SubjectSetup";
import AssessmentSystems from "./modules/AssessmentSystems";
import Assessmentapplicability from "./modules/Assessmentapplicability";
import GradingSystems from "./modules/ZRGradingSystems";
import Branchsettings from "./modules/Branchsettings";
import Usersroles from "./modules/Usersroles";

type RouteProps = { navigate: (key: string) => void };

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {

  membership?: Record<string, any> | null;

  schoolId?: string | null;

  branchId?: string | null;

  role?: string | null;

};

function safeRead(key: string) {

  if (typeof window === "undefined") return null;

  try {

    return (

      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)

    );

  } catch {

    return null;

  }

}

function safeJson<T>(key: string): T | null {

  const raw = safeRead(key);

  if (!raw) return null;

  try {

    return JSON.parse(raw) as T;

  } catch {

    return null;

  }

}

function toPositiveNumber(value: unknown): number | null {

  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;

}

function firstPositiveNumber(...values: unknown[]) {

  for (const value of values) {

    const parsed = toPositiveNumber(value);

    if (parsed) return parsed;

  }

  return null;

}

function readOpenWorkspaceSession() {

  return safeJson<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);

}

function readStoredActiveMembership() {

  return safeJson<Record<string, any>>("activeMembership");

}

function selectedWorkspaceSchoolId(args: {

  activeSchoolId?: any;

  activeSchool?: any;

  settings?: any;

}) {

  const workspace = readOpenWorkspaceSession();

  const membership = workspace?.membership || readStoredActiveMembership();

  return firstPositiveNumber(

    // Live provider state is authoritative.

    args.activeSchoolId,

    args.activeSchool?.id,

    args.settings?.schoolId,

    // Stored values are recovery fallbacks only.

    workspace?.schoolId,

    membership?.schoolId,

    membership?.school?.id,

    safeRead("activeSchoolId"),

  );

}

function selectedWorkspaceBranchId(args: {

  activeBranchId?: any;

  activeBranch?: any;

  settings?: any;

}) {

  const workspace = readOpenWorkspaceSession();

  const membership = workspace?.membership || readStoredActiveMembership();

  return firstPositiveNumber(

    // Live provider state is authoritative.

    args.activeBranchId,

    args.activeBranch?.id,

    args.settings?.branchId,

    // Stored values are recovery fallbacks only.

    workspace?.branchId,

    membership?.branchId,

    membership?.schoolBranchId,

    membership?.branch?.id,

    safeRead("activeBranchId"),

  );

}

function BranchAdminLocalSettingsPage() {

  const { accountId } = useAccount();

  const { settings } = useSettings();

  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } =

    useActiveBranch();

  return (

    <LocalSettings

      portalName="Branch Admin Portal"

      roleKey="branch-admin"

      accountId={accountId}

      schoolId={selectedWorkspaceSchoolId({

        activeSchoolId,

        activeSchool,

        settings,

      })}

      branchId={selectedWorkspaceBranchId({

        activeBranchId,

        activeBranch,

        settings,

      })}

      primaryColor={settings?.primaryColor || "var(--primary-color, #2563eb)"}

      branchFontSize={(settings as any)?.fontSize}

      inline={true}

    />

  );

}

// REPORTS — ONE WORKSPACE, CONTEXTUAL ACTIONS
// ======================================================

type ReportsView = "reports" | "broadsheets" | "remarks" | "attendance";

function BranchReportsWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<ReportsView>("reports");
  // Normalize mixed component prop signatures for the shared route contract.
  // A module that does not use `navigate` can safely ignore this prop.
  const CurrentView: React.ComponentType<RouteProps> =
    view === "broadsheets"
      ? Broadsheets
      : view === "remarks"
        ? ReportRemarks
        : view === "attendance"
          ? StudentAttendance
          : StudentReports;

  return (
    <BranchReportZoomProvider>
      <div className="ba-workspace-wrapper ba-reports-workspace">
        <style>{branchWorkspaceCss}</style>
        <div className="ba-contextual-actions ba-report-subtabs report-no-print" aria-label="Report views">
          <div className="ba-report-subtab-list" role="group" aria-label="Select report view">
            {([
              ["reports", "Report Cards"],
              ["broadsheets", "Broadsheets"],
              ["remarks", "Remarks"],
              ["attendance", "Attendance"],
            ] as const).map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={view === key ? "is-active" : ""}
                aria-pressed={view === key}
                onClick={() => {
                  setView(key);
                  // Switch report categories at the top without disturbing
                  // the persistent portal navigation or browser scroll.
                  const pane = document.querySelector<HTMLElement>(
                    ".role-shell.workspace-locked-scroll .app-content",
                  );
                  if (pane) pane.scrollTop = 0;
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {(view === "reports" || view === "broadsheets") && <BranchReportZoomControls />}
        </div>
        <CurrentView {...props} />
      </div>
    </BranchReportZoomProvider>
  );
}

// ======================================================
// FINANCE — FEES / EXPENSES / PAYROLL
// Existing branch-scoped modules are rendered without modifying their internals.
// ======================================================

type FinanceView = "notices" | "tracking" | "incomes" | "expenses";

function BranchFinanceWorkspace(_props: RouteProps) {
  const [view, setView] = React.useState<FinanceView>("notices");
  return (
    <div className="ba-workspace-wrapper ba-finance-workspace">
      <style>{branchWorkspaceCss}</style>
      <div className="ba-contextual-actions ba-report-subtabs ba-finance-subtabs report-no-print" aria-label="Finance workspaces">
        <div className="ba-report-subtab-list ba-finance-subtab-list" role="group" aria-label="Finance sections">
          {([
            ["notices", "Term Notices"],
            ["tracking", "Student Tracking"],
            ["incomes", "Incomes"],
            ["expenses", "Expenses"],
          ] as const).map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={view === key}
              className={view === key ? "is-active" : ""}
              onClick={() => {
                setView(key);
                const pane = document.querySelector<HTMLElement>(
                  ".role-shell.workspace-locked-scroll .app-content",
                );
                if (pane) pane.scrollTop = 0;
              }}
            >{label}</button>
          ))}
        </div>
      </div>
      {/* Mount one workspace at a time so the shared toolbar belongs to the active tab. */}
      {view === "expenses" ? (
        <Expenses />
      ) : view === "incomes" ? (
        <Incomes />
      ) : (
        <TermFeesRequirements key={view} mode={view} />
      )}
    </div>
  );
}

// ======================================================
// SETUP — FIRST-PASS UNIFIED WORKSPACE
// Existing editors remain functional until their fields are
// progressively merged into independent-save form sections.
// ======================================================

type SetupEditor = {
  key: string;
  label: string;
  Component: React.ComponentType<any>;
};

type SetupSection = {
  title: string;
  description: string;
  editors: SetupEditor[];
};

const SETUP_SECTIONS: SetupSection[] = [
  {
    title: "Organizations",
    description: "Set up the organizations and academic divisions of this branch",
    editors: [
      { key: "organizations", label: "Organizations", Component: Organizations },
    ],
  },
  {
    title: "Academic System",
    description: "Configure academic years, terms and periods",
    editors: [
      { key: "academicSystems", label: "Academic systems", Component: AcademicSystems },
    ],
  },
  {
    title: "Classes",
    description: "Create and manage classes in this branch",
    editors: [
      { key: "classes", label: "Classes", Component: Classes },
    ],
  },
  {
    title: "Curriculum and Subjects",
    description: "Configure curricula and their available subjects",
    editors: [
      { key: "curriculumSystems", label: "Curriculum", Component: CurriculumSystems },
      { key: "subjectSetup", label: "Subjects", Component: SubjectSetup },
    ],
  },
  {
    title: "Assessment System",
    description: "Set up assessment structures, items and applicability",
    editors: [
      { key: "assessmentSystems", label: "Assessment structure", Component: AssessmentSystems },
      { key: "assessmentApplicability", label: "Applicability", Component: Assessmentapplicability },
    ],
  },
  {
    title: "Grading System",
    description: "Manage grading structures, grades and rules",
    editors: [
      { key: "gradingSystems", label: "Grading rules", Component: GradingSystems },
    ],
  },
  {
    title: "Report Configuration",
    description: "Configure report cards and reporting preferences",
    editors: [
      { key: "reportCardSettings", label: "Report card settings", Component: ReportCardSettings },
    ],
  },
  {
    title: "Branch Preferences",
    description: "Manage branch identity, branding and operational preferences",
    editors: [
      { key: "branchSettings", label: "Branch settings", Component: Branchsettings },
    ],
  },
  {
    title: "Access",
    description: "Manage users, roles and access permissions",
    editors: [
      { key: "usersRoles", label: "Users & roles", Component: Usersroles },
    ],
  },
];

function BranchSetupWorkspace(props: RouteProps) {
  // All sections start collapsed, and editing begins only on a deliberate tap.
  const [openSection, setOpenSection] = React.useState<string | null>(null);
  const [openedEditor, setOpenedEditor] = React.useState<string | null>(null);

  function toggleSection(section: SetupSection) {
    if (openSection === section.title) {
      setOpenSection(null);
      setOpenedEditor(null);
    } else {
      setOpenSection(section.title);
      setOpenedEditor(section.editors[0]?.key ?? null);
    }
  }

  return (
    <div className="ba-setup-page">
      <style>{branchWorkspaceCss}</style>
      {SETUP_SECTIONS.map((section, index) => {
        const isOpen = openSection === section.title;
        const sectionId = `ba-setup-section-${index}`;
        const ActiveEditor = section.editors.find((editor) => editor.key === openedEditor)?.Component;
        return (
          <section className={`ba-setup-section ${isOpen ? "is-open" : ""}`} key={section.title}>
            <button
              type="button"
              className="ba-setup-section-toggle"
              aria-expanded={isOpen}
              aria-controls={sectionId}
              onClick={() => toggleSection(section)}
            >
              <span className="ba-setup-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="ba-setup-heading-text">
                <strong>{section.title}</strong>
                <small>{section.description}</small>
              </span>
              <span className="ba-setup-chevron" aria-hidden="true">{isOpen ? "⌃" : "⌄"}</span>
            </button>
            {isOpen && (
              <div className="ba-setup-expanded" id={sectionId}>
                {section.editors.length > 1 && (
                  <div className="ba-contextual-actions" aria-label={`${section.title} editors`}>
                    {section.editors.map((editor) => (
                      <button
                        type="button"
                        key={editor.key}
                        className={openedEditor === editor.key ? "is-active" : ""}
                        aria-pressed={openedEditor === editor.key}
                        onClick={() => setOpenedEditor(editor.key)}
                      >
                        {editor.label}
                      </button>
                    ))}
                  </div>
                )}
                {ActiveEditor ? (
                  <div className="ba-inline-editor" key={openedEditor}>
                    <ActiveEditor {...props} />
                  </div>
                ) : (
                  <div className="ba-setup-empty-section">
                    <p>Report presentation settings are being consolidated. Existing reporting tools remain available in Reports.</p>
                    <button type="button" onClick={() => props.navigate("reportsWorkspace")}>Open Reports</button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const branchWorkspaceCss = `
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
/* Failsafe for custom report templates not yet updated to respect mobilePreview. */
.ba-reports-workspace .src-mobile-toolbar,
.ba-reports-workspace .bs-viewer-toolbar { display:none!important; }

@media print {
 .ba-reports-workspace .ba-report-subtabs { display:none!important; }
 .ba-reports-workspace .student-reports-page .ba-print-card { overflow:visible!important; }
}

/* FINANCE subtabs use exactly the same dimensions, surfaces and active
   state as the Reports contextual subtabs; no separate finance treatment. */
.ba-finance-workspace { width:100%; max-width:none; min-width:0; margin:0; padding:0; }
.ba-finance-workspace .ba-report-subtabs {
  display:flex; align-items:center; gap:6px; flex-wrap:nowrap;
  min-width:0; width:100%; margin:0; padding:4px 0 5px;
  position:sticky; top:0; z-index:22;
  background:var(--eds-shell-bg,var(--bg,var(--surface,#fff)));
  border-bottom:1px solid var(--border,rgba(15,23,42,.10));
  backdrop-filter:blur(12px);
}
.ba-finance-workspace .ba-report-subtab-list {
  display:flex; flex:1 1 auto; min-width:0; gap:4px;
  overflow-x:auto; scrollbar-width:thin; overscroll-behavior-x:contain;
  white-space:nowrap;
}
.ba-finance-workspace .ba-report-subtab-list button {
  flex:0 0 auto; min-height:31px; border-radius:7px;
  padding:4px 9px; font-size:11px;
}
@media(max-width:640px) {
  .ba-finance-workspace .ba-report-subtabs {
    display:flex; flex-direction:column; align-items:stretch; gap:5px;
    width:100%; min-width:0; padding-bottom:5px;
  }
  .ba-finance-workspace .ba-report-subtab-list {
    display:flex; width:100%; min-width:0; flex:0 0 auto;
    overflow-x:auto; padding-bottom:1px;
  }
  .ba-finance-workspace .ba-report-subtab-list button {
    font-size:11px; padding:4px 9px;
  }
}
@media print { .ba-finance-workspace .ba-report-subtabs { display:none!important; } }

.ba-setup-page { display:grid; gap:8px; padding-top:1px; }
.ba-setup-intro { padding:2px 2px 8px; }
.ba-setup-intro h2 { margin:0; font-size:21px; color:var(--text,#111827); }
.ba-setup-intro p { margin:5px 0 0; font-size:12px; line-height:1.5; color:var(--muted,#64748b); }
.ba-setup-section { min-width:0; overflow:hidden; border:1px solid var(--border,rgba(0,0,0,.12)); border-radius:13px; background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%); box-shadow:none; }
.ba-setup-section.is-open { border-color:color-mix(in srgb,var(--primary-color,#2563eb) 38%,var(--border,rgba(0,0,0,.1))); }
.ba-setup-section-toggle { display:flex; width:100%; min-height:58px; align-items:center; gap:10px; text-align:left; padding:10px 12px; border:0; color:var(--text,#111827); background:transparent; cursor:pointer; font:inherit; }
.ba-setup-section-toggle:hover, .ba-setup-section.is-open .ba-setup-section-toggle { background:color-mix(in srgb,var(--primary-color,#2563eb) 5%,var(--surface,#fff)); }
.ba-setup-section-toggle:focus-visible, .ba-contextual-actions button:focus-visible, .ba-setup-empty-section button:focus-visible { outline:2px solid var(--primary-color,#2563eb); outline-offset:-2px; }
.ba-setup-number { display:grid; place-items:center; flex:0 0 32px; width:32px; height:32px; border-radius:8px; background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff)); color:var(--text,#111827); font-weight:800; font-size:11px; }
.ba-setup-heading-text { display:grid; flex:1 1 0; min-width:0; gap:3px; }
.ba-setup-heading-text strong { font-size:13px; font-weight:780; line-height:1.3; }
.ba-setup-heading-text small { font-size:11px; line-height:1.35; font-weight:450; color:var(--muted,#64748b); }
.ba-setup-chevron { flex:0 0 22px; text-align:center; font-size:22px; font-weight:700; color:var(--muted,#64748b); }
.ba-setup-expanded { padding:12px; border-top:1px solid var(--border,rgba(0,0,0,.1)); min-width:0; }
.ba-contextual-actions { display:flex; flex-wrap:wrap; gap:7px; margin:0 0 10px; }
.ba-contextual-actions button, .ba-setup-empty-section button { min-height:34px; padding:7px 11px; border-radius:9px; border:1px solid var(--border,rgba(0,0,0,.14)); background:var(--surface,#fff); color:var(--text,#111827); cursor:pointer; font:inherit; font-size:12px; font-weight:700; }
.ba-contextual-actions button.is-active { border-color:var(--primary-color,#2563eb); background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff)); }
.ba-inline-editor { min-width:0; }
.ba-setup-empty-section { display:grid; gap:10px; }
.ba-setup-empty-section p { margin:0; color:var(--muted,#64748b); font-size:12px; }
.ba-setup-empty-section button { justify-self:start; }
@media (max-width:540px) { .ba-setup-expanded { padding:9px; } .ba-setup-section-toggle { padding:8px 9px; } }
`;

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "Workspaces",
    defaultOpen: true,
    items: [
      { key: "assessmentEntries", label: "Enter Scores", icon: "📝" },
      { key: "reportsWorkspace", label: "Reports", icon: "📄" },
      { key: "students", label: "Students", icon: "👥" },
      { key: "teachers", label: "Teachers", icon: "👩‍🏫" },
      { key: "financeWorkspace", label: "Finance", icon: "💰" },
      { key: "setupWorkspace", label: "Setup", icon: "⚙️" },
    ],
  },
];

// ======================================================

// Main routes + legacy contextual routes used by existing modules.
// Finance now has its own contextual workspace; transport, teacher attendance
// and communication modules remain outside this compact Branch Admin layout.
// Student Attendance lives in Reports.
const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  assessmentEntries: AssessmentEntries,
  reportsWorkspace: BranchReportsWorkspace,
  students: Students,
  classes: Classes, // Legacy/contextual route; class setup stays under Setup.
  financeWorkspace: BranchFinanceWorkspace,
  teachers: Teachers,
  setupWorkspace: BranchSetupWorkspace,

  // Kept for any existing contextual calls to navigate("...").
  parents: Parents,
  expenses: Expenses,
  incomes: Incomes,
  fees: BranchFinanceWorkspace,
  studentReports: StudentReports,
  broadsheets: Broadsheets,
  reportRemarks: ReportRemarks,
  studentAttendance: StudentAttendance,
  academicSystems: AcademicSystems,
  organizations: Organizations,
  reportCardSettings: ReportCardSettings,
  curriculumSystems: CurriculumSystems,
  subjectSetup: SubjectSetup,
  assessmentSystems: AssessmentSystems,
  assessmentApplicability: Assessmentapplicability,
  gradingSystems: GradingSystems,
  branchSettings: Branchsettings,
  usersRoles: Usersroles,
  localSettings: BranchAdminLocalSettingsPage,
};

export default function BranchAdminPage() {

  const { authenticated, accountId, loading: accountLoading } = useAccount();

  const { activeSchoolId, activeBranchId } = useActiveBranch();

  const lastRoleEntrySyncKeyRef = useRef<string | null>(null);

  /**

   * Request fresh branch data when this selected workspace opens.

   *

   * This does not create a competing operation. Phase 5 runSync() returns the

   * currently active shared Promise when startup, focus, visibility, online,

   * timer, or another role-entry trigger is already synchronizing.

   */

  useEffect(() => {

    if (

      accountLoading ||

      !authenticated ||

      !accountId ||

      !activeSchoolId ||

      !activeBranchId

    ) {

      return;

    }

    const syncKey = [accountId, activeSchoolId, activeBranchId].join(":");

    if (lastRoleEntrySyncKeyRef.current === syncKey) {

      return;

    }

    lastRoleEntrySyncKeyRef.current = syncKey;

    void runSync({

      includePlatformCache: true,

      trigger: "role-selection",

    }).catch((error) => {

      console.error("[branch-admin] role-entry sync failed", error);

    });

  }, [

    accountLoading,

    authenticated,

    accountId,

    activeSchoolId,

    activeBranchId,

  ]);

  return (

    <RolePortalShell

      portalTitle="Branch Admin Portal"

      portalSubtitle="Enter scores, student attendance and reports"

      homeKey="assessmentEntries"

      allowedRoles={BRANCH_ADMIN_ROLES}

      navSections={NAV_SECTIONS}
      navigationMode="branch-workspace"

      routes={ROUTES}

      lockedContext={true}

      requireSchool={true}

      requireBranch={true}

    />

  );

}
