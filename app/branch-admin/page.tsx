"use client";

/**
 * app/branch-admin/page.tsx
 * BRANCH ADMIN — REPORTS-FIRST WORKSPACE
 * Six direct destinations, Assessments as home, no standalone dashboard.
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
import AssessmentEntries from "./modules/AssessmentEntries";
import StudentReports from "./modules/reports/StudentReports";
import Broadsheets from "./modules/reports/Broadsheets";
import ReportRemarks from "./modules/ReportRemarks";

// Existing academic setup editors; included in one Setup workspace.
import AcademicSystems from "./modules/AcademicSystems";
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

type ReportsView = "reports" | "broadsheets" | "remarks";

function BranchReportsWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<ReportsView>("reports");
  // Normalize mixed component prop signatures for the shared route contract.
  // A module that does not use `navigate` can safely ignore this prop.
  const CurrentView: React.ComponentType<RouteProps> =
    view === "broadsheets"
      ? Broadsheets
      : view === "remarks"
        ? ReportRemarks
        : StudentReports;

  return (
    <div className="ba-workspace-wrapper">
      <style>{branchWorkspaceCss}</style>
      <div className="ba-contextual-actions" aria-label="Report actions">
        {([
          ["reports", "Student reports"],
          ["broadsheets", "Broadsheets"],
          ["remarks", "Remarks"],
        ] as const).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={view === key ? "is-active" : ""}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <CurrentView {...props} />
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
    title: "Academic Period & Branch",
    description: "Academic years, terms and branch details",
    editors: [
      { key: "academicSystems", label: "Academic periods", Component: AcademicSystems },
      { key: "branchSettings", label: "Branch settings", Component: Branchsettings },
    ],
  },
  {
    title: "Curriculum & Subjects",
    description: "Curricula and available subjects",
    editors: [
      { key: "curriculumSystems", label: "Curriculum", Component: CurriculumSystems },
      { key: "subjectSetup", label: "Subjects", Component: SubjectSetup },
    ],
  },
  {
    title: "Assessment Structure",
    description: "Assessment items, weights and applicability",
    editors: [
      { key: "assessmentSystems", label: "Assessment structure", Component: AssessmentSystems },
      { key: "assessmentApplicability", label: "Applicability", Component: Assessmentapplicability },
    ],
  },
  {
    title: "Grading & Calculations",
    description: "Grade rules and grading schemes",
    editors: [
      { key: "gradingSystems", label: "Grading rules", Component: GradingSystems },
    ],
  },
  {
    title: "Report Configuration",
    description: "Report formats and remarks are available in Reports while we consolidate the template settings.",
    editors: [],
  },
  {
    title: "Access & Preferences",
    description: "Staff access and personal display preferences",
    editors: [
      { key: "usersRoles", label: "Users & roles", Component: Usersroles },
      { key: "localSettings", label: "Display settings", Component: BranchAdminLocalSettingsPage },
    ],
  },
];

function BranchSetupWorkspace(props: RouteProps) {
  const [openedEditor, setOpenedEditor] = React.useState<string | null>(null);

  return (
    <div className="ba-setup-page">
      <div className="ba-setup-intro">
        <h2>Setup & Settings</h2>
        <p>Configure your branch for assessments and reports. Changes are saved in their existing editors.</p>
      </div>
      {SETUP_SECTIONS.map((section, index) => (
        <section className="ba-setup-section" key={section.title}>
          <div className="ba-setup-section-head">
            <span className="ba-setup-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </div>
          </div>
          {section.editors.length > 0 && (
            <div className="ba-contextual-actions" aria-label={`${section.title} editors`}>
              {section.editors.map((editor) => (
                <button
                  type="button"
                  key={editor.key}
                  className={openedEditor === editor.key ? "is-active" : ""}
                  aria-expanded={openedEditor === editor.key}
                  onClick={() =>
                    setOpenedEditor((current) =>
                      current === editor.key ? null : editor.key,
                    )
                  }
                >
                  {editor.label}
                </button>
              ))}
            </div>
          )}
          {section.editors.map(({ key, Component }) =>
            openedEditor === key ? (
              <div className="ba-inline-editor" key={key}>
                <Component {...props} />
              </div>
            ) : null,
          )}
        </section>
      ))}
      <style>{branchWorkspaceCss}</style>
    </div>
  );
}

const branchWorkspaceCss = `
.ba-workspace-wrapper, .ba-setup-page { min-width: 0; width: 100%; }
.ba-setup-page { display: grid; gap: 12px; }
.ba-setup-intro { padding: 4px 2px 8px; }
.ba-setup-intro h2, .ba-setup-section h3 { margin: 0; color: var(--text, #111827); }
.ba-setup-intro h2 { font-size: 22px; }
.ba-setup-intro p, .ba-setup-section p { margin: 5px 0 0; font-size: 13px; line-height: 1.5; color: var(--muted, #64748b); }
.ba-setup-section { min-width: 0; padding: 14px; border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 16px; background: var(--surface, #fff); }
.ba-setup-section-head { display: flex; gap: 12px; align-items: flex-start; }
.ba-setup-section h3 { font-size: 15px; }
.ba-setup-number { flex: 0 0 auto; display: grid; place-items: center; min-width: 36px; height: 36px; padding: 4px; border-radius: 10px; background: color-mix(in srgb, var(--primary-color, #2563eb) 10%, var(--surface, #fff)); color: var(--text, #111827); font-weight: 800; font-size: 12px; }
.ba-contextual-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.ba-setup-section .ba-contextual-actions { margin: 12px 0 0 48px; }
.ba-contextual-actions button { min-height: 37px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border, rgba(0,0,0,.14)); background: var(--surface, #fff); color: var(--text, #111827); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; }
.ba-contextual-actions button.is-active { border-color: var(--primary-color, #2563eb); background: color-mix(in srgb, var(--primary-color, #2563eb) 10%, var(--surface, #fff)); }
.ba-contextual-actions button:focus-visible { outline: 3px solid var(--primary-color, #2563eb); outline-offset: 2px; }
.ba-inline-editor { min-width: 0; margin-top: 14px; border-top: 1px solid var(--border, rgba(0,0,0,.1)); padding-top: 14px; }
@media (max-width: 540px) { .ba-setup-section { padding: 10px; } .ba-setup-section .ba-contextual-actions { margin-left: 0; } }
`;

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "Workspaces",
    defaultOpen: true,
    items: [
      { key: "assessmentEntries", label: "Assessments", icon: "📝" },
      { key: "reportsWorkspace", label: "Reports", icon: "📄" },
      { key: "students", label: "Students", icon: "👥" },
      { key: "classes", label: "Classes", icon: "🏫" },
      { key: "teachers", label: "Teachers", icon: "👩‍🏫" },
      { key: "setupWorkspace", label: "Setup", icon: "⚙️" },
    ],
  },
];

// ======================================================

// Main routes + legacy contextual routes used by existing modules.
// No finance, identity, transport, attendance or communication modules
// are imported into this initial reports-focused Branch Admin bundle.
const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  assessmentEntries: AssessmentEntries,
  reportsWorkspace: BranchReportsWorkspace,
  students: Students,
  classes: Classes,
  teachers: Teachers,
  setupWorkspace: BranchSetupWorkspace,

  // Kept for any existing contextual calls to navigate("...").
  parents: Parents,
  studentReports: StudentReports,
  broadsheets: Broadsheets,
  reportRemarks: ReportRemarks,
  academicSystems: AcademicSystems,
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

      portalSubtitle="Assessments, reports and essential school setup"

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

