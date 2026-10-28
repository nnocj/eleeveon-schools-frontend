"use client";
import {createPortal} from "react-dom";

/**
 * app/branch-admin/modules/SubjectSetup.tsx
 * --------------------------------------------------------------------------
 * Unified Eleeveon Subject Setup workspace.
 *
 * This single file directly owns:
 * - subject catalogue CRUD and media;
 * - curriculum-subject attachment and configuration;
 * - prerequisite/corequisite/recommended rules;
 * - class-subject setup, teacher assignment and media;
 * - usage counts, filters, cards, tables, analytics, sheets and forms;
 * - branch-scoped offline-first reads and sync-safe writes.
 *
 * It does not import the former Subjects.tsx, CurriculumSubjects.tsx,
 * SubjectPrerequisites.tsx or ClassSubjects.tsx modules.
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  type AcademicPeriod,
  type AcademicStructure,
  type AssessmentApplicability,
  type AssessmentEntry,
  type Class,
  type ClassSubject,
  type Curriculum,
  type CurriculumPathway,
  type CurriculumSubject,
  type CurriculumSubjectType,
  type Organization,
  type Subject,
  type SubjectOffering,
  type SubjectPrerequisite,
  type Teacher,
} from "../../lib/db/db";

import {
  createLocal,
  listActiveLocal,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";

import {
  attachCameraStreamToVideo,
  captureImageFileFromVideo,
  commitMediaAssetsToOwner,
  createMediaSessionKey,
  getCameraUnavailableMessage,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  isCameraApiAvailable,
  MediaFieldKeys,
  MediaOwners,
  openCameraStream,
  revokeMediaObjectUrl,
  saveImageAsset,
  softDeleteOwnerFieldAssets,
  stopCameraStream,
  type CameraFacingMode,
} from "../../lib/media/mediaAssetUtils";

type SubjectSetupMode =
  | "subjects"
  | "curriculum"
  | "prerequisites"
  | "classes";



/** Render all sheets, editors and previews above the portal chrome. */
const eleeveonFullscreenOverlayCss = String.raw`
.eleeveon-modal-root{position:fixed;inset:0;z-index:2147483000;pointer-events:none;isolation:isolate}
.eleeveon-modal-root>.ba-sheet-backdrop,
.eleeveon-modal-root>.ba-modal-backdrop,
.eleeveon-modal-root>.cs-overlay {
 position:fixed!important;inset:0!important;top:0!important;left:0!important;right:0!important;bottom:0!important;
 width:100vw!important;height:100dvh!important;min-width:0!important;max-width:none!important;max-height:none!important;
 margin:0!important;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))!important;
 box-sizing:border-box!important;z-index:1!important;pointer-events:auto!important;
 display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;
 background:rgba(10,18,32,.66)!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;
}
.eleeveon-modal-root>.ba-sheet-backdrop>.ba-sheet,
.eleeveon-modal-root>.ba-modal-backdrop>.ba-modal,
.eleeveon-modal-root>.ba-modal-backdrop>.ba-camera-modal,
.eleeveon-modal-root>.cs-overlay>.cs-modal,
.eleeveon-modal-root>.cs-overlay>.cs-sheet {
 position:relative!important;z-index:2!important;display:block!important;box-sizing:border-box!important;
 top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;margin:0!important;
 width:min(1100px,100%)!important;max-width:100%!important;min-width:0!important;
 height:auto!important;max-height:calc(100dvh - 24px)!important;min-height:0!important;
 overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain!important;
 border-radius:18px!important;border:1px solid var(--border,rgba(148,163,184,.24))!important;
 color:var(--text,#111827)!important;background:var(--card-bg,var(--surface,#fff))!important;
 box-shadow:0 24px 75px rgba(0,0,0,.34)!important;scrollbar-width:thin;
}
.eleeveon-modal-root>.ba-sheet-backdrop>.ba-sheet.small,
.eleeveon-modal-root>.ba-sheet-backdrop>.ba-sheet.compact,
.eleeveon-modal-root>.cs-overlay>.cs-sheet {width:min(680px,100%)!important}
.eleeveon-modal-root :is(.ba-sheet-head,.ba-modal-head,.cs-sheet-head){
 position:sticky!important;top:0!important;z-index:9!important;flex-shrink:0!important;
 padding-top:9px!important;padding-bottom:11px!important;
 background:var(--card-bg,var(--surface,#fff))!important;
 border-bottom:1px solid var(--border,rgba(148,163,184,.18))!important;
}
.eleeveon-modal-root :is(.ba-sheet-actions,.ba-modal-actions,.ba-sheet-footer,.cs-sheet-actions,.cs-modal-actions){
 position:sticky!important;bottom:0!important;z-index:9!important;
 padding:12px 4px max(10px,env(safe-area-inset-bottom))!important;
 margin-top:16px!important;background:var(--card-bg,var(--surface,#fff))!important;
 border-top:1px solid var(--border,rgba(148,163,184,.18))!important;
}
.eleeveon-modal-root :is(.ba-sheet,.ba-modal,.cs-modal,.cs-sheet) :is(input,select,textarea,button){max-width:100%}
.eleeveon-modal-root :is(.ba-sheet,.ba-modal,.cs-modal,.cs-sheet){font-family:var(--font-family,system-ui,sans-serif);font-size:13px}
.eleeveon-modal-root :is(.ba-sheet,.ba-modal,.cs-modal,.cs-sheet) :is(input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),select,textarea){
 box-sizing:border-box;min-height:41px;max-width:100%;padding:9px 11px;border-radius:10px;
 color:var(--text,#111827);background:var(--input-bg,var(--surface,#fff));
 border:1px solid var(--input-border,var(--border,rgba(148,163,184,.3)));font:inherit;
}
.eleeveon-modal-root :is(.ba-sheet,.ba-modal,.cs-modal,.cs-sheet) :is(textarea){min-height:90px;resize:vertical}
.eleeveon-modal-root :is(.ba-sheet,.ba-modal,.cs-modal,.cs-sheet) :is(input[type="file"]){width:100%;padding:9px}
.eleeveon-modal-root :is(.ba-sheet,.ba-modal,.cs-modal,.cs-sheet) :is(button){cursor:pointer}
.eleeveon-modal-root :is(.ba-sheet,.ba-modal,.cs-modal,.cs-sheet) :is(button,input,select,textarea):focus-visible{outline:2px solid var(--ba-primary,var(--primary-color,#2563eb));outline-offset:2px}
.eleeveon-modal-root :is(.ba-modal-head,.ba-sheet-head,.cs-sheet-head) button {flex-shrink:0;min-width:36px;min-height:36px}
.eleeveon-modal-root .cs-overlay>.cs-backdrop {position:absolute!important;inset:0!important;z-index:0!important;background:transparent!important}
.eleeveon-modal-root>.cs-menu-overlay>.cs-menu{
 position:relative!important;z-index:2!important;inset:auto!important;top:auto!important;left:auto!important;right:auto!important;
 transform:none!important;display:grid!important;gap:5px!important;box-sizing:border-box!important;
 width:min(460px,100%)!important;max-width:100%!important;max-height:calc(100dvh - 24px)!important;overflow-y:auto!important;
 padding:14px!important;border-radius:18px!important;background:var(--card-bg,var(--surface,#fff))!important;
 box-shadow:0 24px 75px rgba(0,0,0,.34)!important;
}
@media(max-width:640px){
 .eleeveon-modal-root>.ba-sheet-backdrop,.eleeveon-modal-root>.ba-modal-backdrop,.eleeveon-modal-root>.cs-overlay{padding:0!important}
 .eleeveon-modal-root>.ba-sheet-backdrop>.ba-sheet,
 .eleeveon-modal-root>.ba-modal-backdrop>.ba-modal,
 .eleeveon-modal-root>.ba-modal-backdrop>.ba-camera-modal,
 .eleeveon-modal-root>.cs-overlay>.cs-modal,
 .eleeveon-modal-root>.cs-overlay>.cs-sheet{
  width:100vw!important;height:100dvh!important;max-height:100dvh!important;max-width:100vw!important;
  padding:12px!important;border-radius:0!important;
 }
 .eleeveon-modal-root>.cs-menu-overlay>.cs-menu{width:calc(100vw - 20px)!important}
 .eleeveon-modal-root :is(.ba-sheet-actions,.ba-modal-actions,.ba-sheet-footer,.cs-sheet-actions,.cs-modal-actions){
  display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important;gap:8px!important
 }
 .eleeveon-modal-root :is(.ba-sheet-actions,.ba-modal-actions,.ba-sheet-footer,.cs-sheet-actions,.cs-modal-actions)>button{flex:1 1 125px;min-height:42px}
}
`;
function EleeveonFullscreenOverlay({children}:{children:React.ReactNode}){
 const [target,setTarget]=React.useState<HTMLElement|null>(null);
 const [theme,setTheme]=React.useState<React.CSSProperties>({});
 React.useEffect(()=>{
  const page=document.querySelector<HTMLElement>(".role-shell .app-content .ba-page, .role-shell .app-content .cs-page, .role-shell .app-content .subject-setup-root, .ba-page, .cs-page");
  if(page){const cs=window.getComputedStyle(page);const vars:Record<string,string>={};
   for(const key of ["--ba-primary","--cs-primary","--cs-surface","--cs-text","--cs-border"]){const v=cs.getPropertyValue(key).trim();if(v)vars[key]=v;}
   setTheme(vars as React.CSSProperties);
  }
  setTarget(document.body);
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";
  return()=>{document.body.style.overflow=previous;};
 },[]);
 return target?createPortal(<div className="eleeveon-modal-root" style={theme}><style>{eleeveonFullscreenOverlayCss}</style>{children}</div>,target):null;
}

const SUBJECT_SETUP_MODE_KEY =
  "eleeveon_subject_setup_mode";

function readSubjectSetupMode():
  SubjectSetupMode {
  if (typeof window === "undefined") {
    return "subjects";
  }

  try {
    const stored =
      window.localStorage.getItem(
        SUBJECT_SETUP_MODE_KEY,
      );

    return stored === "curriculum" ||
      stored === "prerequisites" ||
      stored === "classes"
      ? stored
      : "subjects";
  } catch {
    return "subjects";
  }
}


const SubjectsModule = (() => {
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type SubjectCategory =
  | "academic"
  | "technical"
  | "vocational"
  | "elective"
  | "core";
type SubjectStatusFilter = "all" | "active" | "inactive";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type FormState = {
  id?: string;
  organizationId: string;
  name: string;
  code: string;
  description: string;
  photo: string;
  photoMediaId?: string;
  bannerImage: string;
  bannerImageMediaId?: string;
  credits: string;
  category: SubjectCategory;
  active: boolean;
};

type SubjectView = {
  id: string;
  row: Subject;
  organizationName: string;
  curriculumUseCount: number;
  classSubjectUseCount: number;
  totalUsage: number;
  active: boolean;
};

const SUBJECT_MEDIA_OWNER_TABLE = MediaOwners.SUBJECTS;

const categories: SubjectCategory[] = [
  "academic",
  "core",
  "elective",
  "technical",
  "vocational",
];

const emptyForm: FormState = {
  organizationId: "",
  name: "",
  code: "",
  description: "",
  photo: "",
  photoMediaId: undefined,
  bannerImage: "",
  bannerImageMediaId: undefined,
  credits: "",
  category: "academic",
  active: true,
};

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "").trim();
  if (!media || media.startsWith("blob:") || media.startsWith("data:"))
    return undefined;
  return media;
};

const idOf = (v: any): string => {
  if (v === undefined || v === null) return "";
  return String(v).trim();
};

const cleanId = (value: unknown): string => {
  const normalized = idOf(value);
  return normalized && normalized !== "0" ? normalized : "";
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstLocalId(...values: unknown[]): string {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed && parsed !== "0") return parsed;
  }

  return "";
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (v: any) =>
  String(v || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  if (["inactive", "deleted", "archived", "suspended"].includes(status))
    return false;
  return true;
};

const categoryLabel = (category?: string) => {
  if (!category) return "Academic";
  return category.charAt(0).toUpperCase() + category.slice(1);
};

function categoryTone(
  category?: SubjectCategory,
): "green" | "blue" | "gray" | "orange" | "purple" {
  if (category === "core") return "green";
  if (category === "elective") return "orange";
  if (category === "technical") return "purple";
  if (category === "vocational") return "blue";
  return "gray";
}

const timeText = (v?: string | number | null) => {
  if (!v) return "Not set";
  const t = typeof v === "number" ? v : new Date(v).getTime();
  if (!Number.isFinite(t)) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(t));
  } catch {
    return "Not set";
  }
};

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`status-dot-mini ${active ? "green" : "gray"}`}
      title={active ? "Active" : "Inactive"}
      aria-label={active ? "Active" : "Inactive"}
    />
  );
}

function Avatar({
  name,
  photo,
  primary,
}: {
  name: string;
  photo?: string;
  primary: string;
}) {
  return (
    <div
      className="ba-avatar"
      style={{
        background: photo
          ? `url(${photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {!photo &&
        String(name || "SB")
          .slice(0, 2)
          .toUpperCase()}
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function SubjectsWorkspace() {
  const dataRevision = useBranchTableRevision([
    "subjects",
    "organizations",
    "curriculumSubjects",
    "classSubjects",
    "mediaAssets",
    "mediaBlobs",
  ]);
  const mediaSessionKeyRef = useRef(
    createMediaSessionKey(SUBJECT_MEDIA_OWNER_TABLE),
  );
  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const workspace = useBranchWorkspaceScope();
  const {
    accountId,
    schoolId,
    branchId,
    membership: activeMembership,
    authenticated,
    restoring: accountLoading,
    branchLoading: contextLoading,
    ready: workspaceReady,
    error: workspaceError,
  } = workspace;

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Subject[]>([]);
  const mediaById = useEntityMediaUrls({
    accountId,
    ownerTable: SUBJECT_MEDIA_OWNER_TABLE,
    rows,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "bannerImage", mediaIdKey: "bannerImageMediaId" },
    ],
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<
    CurriculumSubject[]
  >([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  useEffect(() => {
    setViewMode(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
  }, []);
  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterCategory, setFilterCategory] = useState<"all" | SubjectCategory>(
    "all",
  );
  const [filterStatus, setFilterStatus] =
    useState<SubjectStatusFilter>("active");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const subjectSetupToolbar = {
    add: () => openCreate(),
    search: (query: string) => setSearch(query),
    filter: () => setFilterOpen(true),
    print: () => window.print(),
    more: () => setMoreOpen(true),
  };
  useRegisterBranchWorkspaceToolbar("setupWorkspace", subjectSetupToolbar);
  useRegisterBranchWorkspaceToolbar("subjectSetup", subjectSetupToolbar);
  const [selectedItem, setSelectedItem] = useState<SubjectView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    // Missing branch workspace is handled locally so the selected-role flow is not broken.
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(
      () => setToast((c) => (c?.message === message ? null : c)),
      4200,
    );
  };

  const clearData = () => {
    setRows([]);
    setOrganizations([]);
    setCurriculumSubjects([]);
    setClassSubjects([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [
        subjectRows,
        organizationRows,
        curriculumSubjectRows,
        classSubjectRows,
      ] = await Promise.all([
        tableSafe("subjects")?.toArray?.() || [],
        listActiveLocal("organizations", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        tableSafe("curriculumSubjects")?.toArray?.() || [],
        tableSafe("classSubjects")?.toArray?.() || [],
      ]);

      setRows(
        (subjectRows as Subject[])
          .filter((r) => sameTenant(r as TenantRow))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setCurriculumSubjects(
        (curriculumSubjectRows as CurriculumSubject[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
      setClassSubjects(
        (classSubjectRows as ClassSubject[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
    } catch (error) {
      console.error("Failed to load subjects:", error);
      clearData();
      showToast("error", "Failed to load subjects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    dataRevision,
  ]);

  const organizationMap = useMemo(
    () => new Map(organizations.map((r: any) => [idOf(r.id), r])),
    [organizations],
  );

  const curriculumSubjectCountMap = useMemo(() => {
    const map = new Map<string, number>();
    curriculumSubjects.forEach((r: any) => {
      const id = idOf(r.subjectId);
      if (id) map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [curriculumSubjects]);

  const classSubjectCountMap = useMemo(() => {
    const map = new Map<string, number>();
    classSubjects.forEach((r: any) => {
      const id = idOf(r.subjectId);
      if (id) map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [classSubjects]);

  const viewRows = useMemo<SubjectView[]>(() => {
    return rows.map((row: any) => {
      const id = idOf(row.id);
      const organization = row.organizationId
        ? (organizationMap.get(idOf(row.organizationId)) as any)
        : undefined;
      const curriculumUseCount = curriculumSubjectCountMap.get(id) || 0;
      const classSubjectUseCount = classSubjectCountMap.get(id) || 0;
      return {
        id,
        row,
        organizationName: organization?.name || "No organization",
        curriculumUseCount,
        classSubjectUseCount,
        totalUsage: curriculumUseCount + classSubjectUseCount,
        active: isActiveRow(row),
      };
    });
  }, [classSubjectCountMap, curriculumSubjectCountMap, organizationMap, rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return viewRows
      .filter((item) => {
        const row: any = item.row;
        if (
          filterOrganizationId !== "all" &&
          !sameId(row.organizationId, filterOrganizationId)
        )
          return false;
        if (filterCategory !== "all" && row.category !== filterCategory)
          return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;
        if (!q) return true;
        return `${row.name} ${row.code || ""} ${row.description || ""} ${row.category || ""} ${row.credits || ""} ${item.organizationName}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) =>
        String((a.row as any).name || "").localeCompare(
          String((b.row as any).name || ""),
        ),
      );
  }, [filterCategory, filterOrganizationId, filterStatus, search, viewRows]);

  const summary = useMemo(
    () => ({
      total: viewRows.length,
      active: viewRows.filter((i) => i.active).length,
      inactive: viewRows.filter((i) => !i.active).length,
      curriculumUsage: curriculumSubjects.length,
      classUsage: classSubjects.length,
      core: viewRows.filter((i) => (i.row as any).category === "core").length,
      showing: filteredRows.length,
    }),
    [
      classSubjects.length,
      curriculumSubjects.length,
      filteredRows.length,
      viewRows,
    ],
  );

  const countsByCategory = useMemo(
    () =>
      groupedCounts(viewRows, (i) => categoryLabel((i.row as any).category)),
    [viewRows],
  );
  const countsByOrganization = useMemo(
    () => groupedCounts(viewRows, (i) => i.organizationName),
    [viewRows],
  );
  const countsByUsage = useMemo(
    () =>
      viewRows
        .map((i) => ({
          label: (i.row as any).name || "Subject",
          value: i.totalUsage,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
    [viewRows],
  );

  const activeFilterCount = useMemo(() => {
    return [filterOrganizationId, filterCategory, filterStatus].filter(
      (v) => v !== "all" && v !== "active",
    ).length;
  }, [filterCategory, filterOrganizationId, filterStatus]);

  const updateForm = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleImageUpload = async (
    field: "photo" | "bannerImage",
    file?: File,
  ) => {
    if (!file || !accountId || !schoolId || !branchId) return;

    try {
      const result = await saveImageAsset(file, {
        accountId: String(accountId),
        schoolId: schoolId,
        branchId: branchId,
        ownerTable: SUBJECT_MEDIA_OWNER_TABLE,
        ownerId: form.id || undefined,
        ownerTempKey: form.id ? undefined : mediaSessionKeyRef.current,
        fieldKey: field,
        variant: field === "photo" ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateForm({
        [field]: result.previewUrl,
        [field === "photo" ? "photoMediaId" : "bannerImageMediaId"]:
          result.assetId,
      } as Partial<FormState>);

      showToast(
        "info",
        `${field === "photo" ? "Photo" : "Banner"} prepared. Save to attach and upload it.`,
      );
    } catch (error: any) {
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;
    mediaSessionKeyRef.current = createMediaSessionKey(
      SUBJECT_MEDIA_OWNER_TABLE,
    );
    setForm({
      ...emptyForm,
      organizationId:
        filterOrganizationId !== "all" ? filterOrganizationId : "",
      category: filterCategory === "all" ? "academic" : filterCategory,
      active: filterStatus !== "inactive",
    });
    setModalOpen(true);
  };

  const openEdit = (row: Subject) => {
    const subject: any = row;
    setSelectedItem(null);
    setForm({
      id: idOf(subject.id),
      organizationId: subject.organizationId
        ? String(subject.organizationId)
        : "",
      name: subject.name || "",
      code: subject.code || "",
      description: subject.description || "",
      photo:
        mediaById[idOf(subject.id)]?.photo ||
        safeRecordMediaValue(subject.photo) ||
        "",
      photoMediaId: subject.photoMediaId
        ? String(subject.photoMediaId)
        : undefined,
      bannerImage:
        mediaById[idOf(subject.id)]?.bannerImage ||
        safeRecordMediaValue(subject.bannerImage) ||
        "",
      bannerImageMediaId: subject.bannerImageMediaId
        ? String(subject.bannerImageMediaId)
        : undefined,
      credits: subject.credits == null ? "" : String(subject.credits),
      category: subject.category || "academic",
      active: isActiveRow(subject),
    });
    setModalOpen(true);
  };

  const clearFilters = () => {
    setFilterOrganizationId("all");
    setFilterCategory("all");
    setFilterStatus("active");
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId) return "Select a school first.";
    if (!branchId) return "Select a branch first.";
    if (!form.name.trim()) return "Enter subject name.";
    if (form.organizationId && !organizationMap.get(idOf(form.organizationId)))
      return "Selected organization is not in this branch.";
    if (form.credits && Number(form.credits) < 0)
      return "Credits cannot be negative.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;
      const sameName = safeLower(row.name) === safeLower(form.name);
      const sameCode =
        !!form.code.trim() && safeLower(row.code) === safeLower(form.code);
      return sameName || sameCode;
    });
    if (duplicate) return "A subject with this name or code already exists.";
    return "";
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }
    if (!authenticated || !accountId || !schoolId || !branchId) return;

    try {
      setSaving(true);
      const existing = form.id
        ? rows.find((row: any) => sameId(row.id, form.id))
        : undefined;
      const payload = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        organizationId: form.organizationId
          ? String(form.organizationId)
          : undefined,
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue(form.bannerImage),
        bannerImageMediaId: form.bannerImageMediaId || undefined,
        credits: form.credits === "" ? undefined : Number(form.credits),
        category: form.category || "academic",
        active: form.active,
        status: form.active ? "active" : "inactive",
        isDeleted: false,
      } as unknown as Partial<Subject>;

      const savedSubject =
        form.id && existing
          ? await updateLocal("subjects", String(form.id), payload)
          : await createLocal("subjects", payload as Subject);

      const savedSubjectId = idOf((savedSubject as any)?.id || form.id || 0);

      if (savedSubjectId) {
        await commitMediaAssetsToOwner({
          accountId: String(accountId),
          ownerTable: SUBJECT_MEDIA_OWNER_TABLE,
          ownerId: savedSubjectId,

          ownerTempKey: mediaSessionKeyRef.current,
          assets: [
            { assetId: form.photoMediaId, fieldKey: "photo" },
            { assetId: form.bannerImageMediaId, fieldKey: "bannerImage" },
          ],
        });
      }

      mediaSessionKeyRef.current = createMediaSessionKey(
        SUBJECT_MEDIA_OWNER_TABLE,
      );
      setModalOpen(false);
      showToast("success", "Subject saved.");
      await load();
    } catch (error) {
      console.error("Failed to save subject:", error);
      showToast("error", "Failed to save subject.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: SubjectView) => {
    const row: any = item.row;
    const id = idOf(row.id);
    if (!id) return;
    const warning = item.totalUsage
      ? `"${row.name}" is used in ${item.curriculumUseCount} curriculum subject(s) and ${item.classSubjectUseCount} class subject(s). Delete anyway?`
      : `Delete "${row.name}"?`;
    if (!window.confirm(warning)) return;

    await Promise.all(
      ["photo", "bannerImage"].map((fieldKey) =>
        softDeleteOwnerFieldAssets({
          accountId: String(accountId),

          ownerTable: "subjects",

          ownerId: cleanId(id) || undefined,

          fieldKey,
        }),
      ),
    );

    await softDeleteLocal("subjects", String(id));
    setSelectedItem(null);
    showToast("success", "Subject deleted.");
    await load();
  };

  const toggleActive = async (item: SubjectView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;
    await updateLocal("subjects", String(id), {
      active: !item.active,
      status: !item.active ? "active" : "inactive",
      isDeleted: false,
    } as unknown as Partial<Subject>);
    setSelectedItem(null);
    showToast(
      "success",
      item.active ? "Subject deactivated." : "Subject activated.",
    );
    await load();
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Subjects..."
        text="Checking account, branch, subjects, organizations, curriculum links, and class delivery links."
      />
    );
  }

  if (!authenticated || !accountId)
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing subjects."
      />
    );

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Subjects belong to one active school branch.</p>
          <button
            type="button"
            className="ba-state-button"
            onClick={() => router.push("/account")}
          >
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </section>
      )}

      <section
        className="ba-search-card"
        aria-label="Subject search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subjects..."
            aria-label="Search subjects"
          />
        </label>
        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add subject"
        >
          +
        </button>
        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>
        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {(activeFilterCount > 0 || search.trim()) && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {search.trim() && (
            <button type="button" onClick={() => setSearch("")}>
              Search: {search} ×
            </button>
          )}
          {filterOrganizationId !== "all" && (
            <button
              type="button"
              onClick={() => setFilterOrganizationId("all")}
            >
              Organization:{" "}
              {(organizationMap.get(idOf(filterOrganizationId)) as any)?.name ||
                filterOrganizationId}{" "}
              ×
            </button>
          )}
          {filterCategory !== "all" && (
            <button type="button" onClick={() => setFilterCategory("all")}>
              Category: {categoryLabel(filterCategory)} ×
            </button>
          )}
          {filterStatus !== "active" && (
            <button type="button" onClick={() => setFilterStatus("active")}>
              Status: {filterStatus === "all" ? "All" : "Inactive"} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <SummaryView
          summary={summary}
          countsByCategory={countsByCategory}
          countsByOrganization={countsByOrganization}
          countsByUsage={countsByUsage}
        />
      )}
      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          openEdit={openEdit}
          remove={remove}
          toggleActive={toggleActive}
        />
      )}
      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <SubjectListItem
              key={String(item.id)}
              item={item}
              photo={
                mediaById[item.id]?.photo ||
                safeRecordMediaValue((item.row as any).photo)
              }
              primary={primary}
              onOpen={() => setSelectedItem(item)}
            />
          ))}
          {!filteredRows.length && (
            <Empty
              icon="📘"
              title="No subjects found"
              text="Create reusable subject identities such as Mathematics, English Language, Creative Arts, Computing, or Science."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          organizations={organizations}
          filterOrganizationId={filterOrganizationId}
          filterCategory={filterCategory}
          filterStatus={filterStatus}
          setFilterOrganizationId={setFilterOrganizationId}
          setFilterCategory={setFilterCategory}
          setFilterStatus={setFilterStatus}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
      {selectedItem && (
        <ActionSheet
          item={selectedItem}
          openEdit={openEdit}
          remove={remove}
          toggleActive={toggleActive}
          onClose={() => setSelectedItem(null)}
        />
      )}
      {modalOpen && (
        <SubjectModal
          form={form}
          saving={saving}
          organizations={organizations}
          setModalOpen={setModalOpen}
          updateForm={updateForm}
          handleImageUpload={handleImageUpload}
          save={save}
        />
      )}
    </main>
  );
}

function State({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function SubjectListItem({
  item,
  photo,
  primary,
  onOpen,
}: {
  item: SubjectView;
  photo?: string;
  primary: string;
  onOpen: () => void;
}) {
  const row: any = item.row;
  return (
    <button type="button" className="subject-row" onClick={onOpen}>
      <Avatar name={row.name} photo={photo} primary={primary} />
      <span className="subject-main">
        <strong>{row.name || "Unnamed subject"}</strong>
        <small>
          {item.organizationName}
          {row.code ? ` · ${row.code}` : ""}
        </small>
        <em>
          {categoryLabel(row.category)} · {row.credits ?? "—"} credits ·{" "}
          {item.totalUsage} linked
        </em>
      </span>
      <span className="subject-side">
        <StatusDot active={item.active} />
        <i>⋯</i>
      </span>
    </button>
  );
}

function TableView({
  rows,
  openEdit,
  remove,
  toggleActive,
}: {
  rows: SubjectView[];
  openEdit: (row: Subject) => void;
  remove: (item: SubjectView) => void;
  toggleActive: (item: SubjectView) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-head">
        <h3>Subjects ({rows.length})</h3>
      </div>
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Organization</th>
              <th>Category</th>
              <th>Credits</th>
              <th>Links</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const row: any = item.row;
              return (
                <tr key={String(item.id)}>
                  <td>
                    <strong>{row.name}</strong>
                    <span>{row.code || row.description || "No code"}</span>
                  </td>
                  <td>{item.organizationName}</td>
                  <td>
                    <Chip tone={categoryTone(row.category)}>
                      {categoryLabel(row.category)}
                    </Chip>
                  </td>
                  <td>{row.credits ?? "—"}</td>
                  <td>
                    {item.curriculumUseCount} curriculum ·{" "}
                    {item.classSubjectUseCount} class
                  </td>
                  <td>
                    <span className="ba-inline-status">
                      <StatusDot active={item.active} />
                      {item.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item.row)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => toggleActive(item)}>
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => remove(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="ba-empty-table">No subject matches your filters.</div>
        )}
      </div>
    </section>
  );
}

function SummaryView({
  summary,
  countsByCategory,
  countsByOrganization,
  countsByUsage,
}: {
  summary: any;
  countsByCategory: { label: string; value: number }[];
  countsByOrganization: { label: string; value: number }[];
  countsByUsage: { label: string; value: number }[];
}) {
  return (
    <section className="ba-analysis-grid">
      <article className="ba-analysis ba-current-filter">
        <span>Current Filter</span>
        <strong>{summary.showing}</strong>
        <p>
          Subject record(s) currently match your search and filter conditions.
        </p>
      </article>
      <article className="ba-analysis">
        <span>Active Subjects</span>
        <strong>{summary.active}</strong>
        <p>
          {summary.inactive} inactive · {summary.core} core · {summary.total}{" "}
          total.
        </p>
      </article>
      <article className="ba-analysis">
        <span>Usage Links</span>
        <strong>{summary.curriculumUsage + summary.classUsage}</strong>
        <p>
          {summary.curriculumUsage} curriculum links · {summary.classUsage}{" "}
          class delivery links.
        </p>
      </article>
      <AnalysisCard
        title="Subjects by Category"
        rows={countsByCategory}
        total={summary.total}
      />
      <AnalysisCard
        title="Subjects by Organization"
        rows={countsByOrganization}
        total={summary.total}
      />
      <AnalysisCard
        title="Most Used Subjects"
        rows={countsByUsage}
        total={Math.max(summary.curriculumUsage + summary.classUsage, 1)}
      />
    </section>
  );
}

function FilterSheet(props: {
  organizations: Organization[];
  filterOrganizationId: string;
  filterCategory: "all" | SubjectCategory;
  filterStatus: SubjectStatusFilter;
  setFilterOrganizationId: (v: string) => void;
  setFilterCategory: (v: "all" | SubjectCategory) => void;
  setFilterStatus: (v: SubjectStatusFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <EleeveonFullscreenOverlay><section className="ba-sheet-backdrop" onClick={props.onClose}>
      <div className="ba-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ba-sheet-head">
          <div>
            <h3>Filter Subjects</h3>
            <p>Keep the page clean while narrowing records.</p>
          </div>
          <button type="button" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="ba-sheet-form">
          <label>
            <span>Organization</span>
            <select
              value={props.filterOrganizationId}
              onChange={(e) => props.setFilterOrganizationId(e.target.value)}
            >
              <option value="all">All organizations</option>
              {props.organizations.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                  {row.type ? ` · ${row.type}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select
              value={props.filterCategory}
              onChange={(e) => props.setFilterCategory(e.target.value as any)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={props.filterStatus}
              onChange={(e) =>
                props.setFilterStatus(e.target.value as SubjectStatusFilter)
              }
            >
              <option value="active">Active only</option>
              <option value="all">All status</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
        </div>
        <div className="ba-sheet-actions">
          <button type="button" onClick={props.clearFilters}>
            Reset
          </button>
          <button type="button" onClick={props.onClose}>
            Apply
          </button>
        </div>
      </div>
    </section></EleeveonFullscreenOverlay>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <EleeveonFullscreenOverlay><section className="ba-sheet-backdrop" onClick={onClose}>
      <div className="ba-sheet compact" onClick={(e) => e.stopPropagation()}>
        <div className="ba-sheet-head">
          <div>
            <h3>More</h3>
            <p>Views and quick actions.</p>
          </div>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="ba-more-list">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
          >
            ▦ Cards
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
          >
            ☷ Table
          </button>
          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            📊 Analytics
          </button>
          <button type="button" onClick={onRefresh}>
            ↻ Refresh
          </button>
        </div>
      </div>
    </section></EleeveonFullscreenOverlay>
  );
}

function ActionSheet({
  item,
  openEdit,
  remove,
  toggleActive,
  onClose,
}: {
  item: SubjectView;
  openEdit: (row: Subject) => void;
  remove: (item: SubjectView) => void;
  toggleActive: (item: SubjectView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;
  return (
    <EleeveonFullscreenOverlay><section className="ba-sheet-backdrop" onClick={onClose}>
      <div className="ba-sheet compact" onClick={(e) => e.stopPropagation()}>
        <div className="ba-sheet-head">
          <div>
            <h3>{row.name || "Subject"}</h3>
            <p>
              {item.organizationName} · {categoryLabel(row.category)} ·{" "}
              {item.totalUsage} linked
            </p>
          </div>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="ba-more-list">
          <button type="button" onClick={() => openEdit(item.row)}>
            Edit subject
          </button>
          <button type="button" onClick={() => toggleActive(item)}>
            {item.active ? "Deactivate" : "Activate"}
          </button>
          <button type="button" className="danger" onClick={() => remove(item)}>
            Delete subject
          </button>
        </div>
      </div>
    </section></EleeveonFullscreenOverlay>
  );
}

function SubjectModal({
  form,
  saving,
  organizations,
  setModalOpen,
  updateForm,
  handleImageUpload,
  save,
}: {
  form: FormState;
  saving: boolean;
  organizations: Organization[];
  setModalOpen: (v: boolean) => void;
  updateForm: (patch: Partial<FormState>) => void;
  handleImageUpload: (field: "photo" | "bannerImage", file?: File) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <EleeveonFullscreenOverlay><div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Subject" : "New Subject"}</h2>
            <p>
              Subjects are reusable academic identities attached later to
              curriculum rules and class delivery.
            </p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)}>
            ✕
          </button>
        </div>
        <div className="ba-form">
          <label>
            <span>Subject Name</span>
            <input
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder="e.g. Mathematics"
            />
          </label>
          <label>
            <span>Subject Code</span>
            <input
              value={form.code}
              onChange={(e) => updateForm({ code: e.target.value })}
              placeholder="e.g. MATH"
            />
          </label>
          <label>
            <span>Credits</span>
            <input
              type="number"
              value={form.credits}
              onChange={(e) => updateForm({ credits: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label>
            <span>Category</span>
            <select
              value={form.category}
              onChange={(e) =>
                updateForm({ category: e.target.value as SubjectCategory })
              }
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Organization / Department</span>
            <select
              value={form.organizationId}
              onChange={(e) => updateForm({ organizationId: e.target.value })}
            >
              <option value="">No organization</option>
              {organizations.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                  {row.type ? ` · ${row.type}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={form.active ? "active" : "inactive"}
              onChange={(e) =>
                updateForm({ active: e.target.value === "active" })
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="wide">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              placeholder="Brief subject description"
            />
          </label>
          <label>
            <span>Subject Photo</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload("photo", e.target.files?.[0])}
            />
            {form.photo ? (
              <img
                src={form.photo}
                alt="Subject preview"
                className="ba-preview-photo"
              />
            ) : null}
          </label>
          <label className="wide">
            <span>Subject Banner</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                handleImageUpload("bannerImage", e.target.files?.[0])
              }
            />
            {form.bannerImage ? (
              <img
                src={form.bannerImage}
                alt="Subject banner preview"
                className="ba-preview-banner"
              />
            ) : null}
          </label>
        </div>
        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create Subject"}
          </button>
        </div>
      </form>
    </div></EleeveonFullscreenOverlay>
  );
}

function groupedCounts(
  rows: SubjectView[],
  keyFn: (item: SubjectView) => string,
) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; value: number }[];
  total: number;
}) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>
      <div className="ba-analysis-list">
        {rows.slice(0, 8).map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <section key={row.label}>
              <div>
                <b>{row.label}</b>
                <small>
                  {row.value} · {share}%
                </small>
              </div>
              <div className="ba-progress">
                <i style={{ width: `${Math.max(4, share)}%` }} />
              </div>
            </section>
          );
        })}
        {!rows.length ? <p>No data available.</p> : null}
      </div>
    </article>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}
.ba-page{min-height:100dvh;width:100%;max-width:100%;padding:8px;padding-bottom:max(28px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page input,.ba-page select,.ba-page textarea{width:100%;border:1px solid var(--border,rgba(148,163,184,.28));border-radius:15px;padding:0 12px;background:var(--surface,#fff);color:var(--text,#111827);outline:none;font-weight:750}.ba-page input,.ba-page select{min-height:43px}.ba-page textarea{min-height:92px;padding-top:10px;resize:vertical}.ba-state{min-height:min(420px,calc(100dvh - 32px));display:grid;place-items:center;align-content:center;gap:10px;width:min(520px,100%);margin:0 auto;padding:22px;border-radius:28px;background:var(--surface,#fff);border:1px solid var(--border,rgba(148,163,184,.22));box-shadow:0 24px 60px rgba(15,23,42,.08);text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-toast{position:sticky;top:8px;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:#dcfce7;color:#166534}.ba-toast.error{background:#fee2e2;color:#991b1b}.ba-toast.info{background:#dbeafe;color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}

.ba-icon-button,
.ba-filter-button,
.ba-add-inline {
  width: 42px;
  height: 42px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 18px;
  font-weight: 1000;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(15,23,42,.045);
}
.ba-add-inline {
  flex: 0 0 42px;
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 25px;
  line-height: 1;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}
.ba-search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  padding: 8px;
  border-radius: 24px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}
.ba-search {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 11px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}
.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input {
  min-height: 42px;
  border: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14px;
}
.ba-slider-icon {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ba-filter-button {
  position: relative;
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary);
}
.ba-filter-button.active {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}
.ba-filter-button b {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 19px;
  height: 19px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  border: 2px solid var(--card-bg,#fff);
}
.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none;-ms-overflow-style:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-list{display:grid;gap:7px;margin-top:10px}.subject-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:22px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);box-shadow:0 12px 28px rgba(15,23,42,.045);text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.subject-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}.ba-avatar{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;color:#fff;font-size:13px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.12)}.subject-main,.subject-main strong,.subject-main small,.subject-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.subject-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.subject-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850;font-style:normal}.subject-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.subject-side{display:grid;justify-items:end;gap:6px;flex:0 0 auto}.subject-side i{color:var(--muted,#64748b);font-style:normal;font-size:18px;font-weight:1000;line-height:1}.status-dot-mini{width:10px;height:10px;display:inline-block;border-radius:999px;background:var(--muted,#64748b);box-shadow:0 0 0 4px color-mix(in srgb,currentColor 10%,transparent)}.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.ba-inline-status{display:inline-flex;align-items:center;gap:8px;font-weight:850;color:var(--muted,#64748b)}
.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}
.ba-empty,.ba-table-card,.ba-analysis,.ba-modal,.ba-sheet{min-width:0;border-radius:24px;background:var(--surface,#fff);border:1px solid var(--border,rgba(148,163,184,.2));box-shadow:0 16px 40px rgba(15,23,42,.055);overflow:hidden}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;padding:18px;text-align:center;border-style:dashed}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,#fff);font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-table-card{padding:11px}.ba-table-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.ba-table-head h3{margin:0;font-size:15px;font-weight:1000}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(148,163,184,.18))}.ba-table-scroll table{width:100%;min-width:980px;border-collapse:collapse;background:var(--surface,#fff)}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(148,163,184,.16));vertical-align:top;text-align:left;font-size:13px}.ba-table-scroll th{background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td strong{font-weight:1000}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;align-items:center;gap:6px;flex-wrap:nowrap}.ba-table-actions button,.ba-sheet-actions button,.ba-modal-actions button{min-height:34px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer;white-space:nowrap}.ba-table-actions button:first-child,.ba-sheet-actions button:last-child,.ba-modal-actions button:last-child{background:var(--ba-primary);color:#fff}.ba-table-actions button.danger,.ba-more-list button.danger{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff))}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}
.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-analysis{padding:13px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}
.ba-sheet-backdrop{position:fixed;inset:0;z-index:70;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.48);backdrop-filter:blur(10px)}.ba-sheet{width:min(560px,100%);max-height:86dvh;padding:14px;border-radius:28px;overflow-y:auto}.ba-sheet.compact{width:min(420px,100%)}.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ba-sheet-head h3{margin:0;font-size:18px;font-weight:1000;letter-spacing:-.04em}.ba-sheet-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px}.ba-sheet-head button,.ba-modal-head button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-sheet-form{display:grid;gap:10px}.ba-sheet-form label,.ba-form label{display:grid;gap:6px}.ba-sheet-form span,.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-sheet-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.ba-more-list{display:grid;gap:8px}.ba-more-list button{min-height:44px;border:1px solid var(--border,rgba(148,163,184,.18));border-radius:18px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:950;cursor:pointer;text-align:left;padding:0 12px}.ba-more-list button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}
.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-modal{width:min(900px,100%);max-height:min(92dvh,900px);overflow-y:auto;padding:14px;border-radius:28px;box-shadow:0 30px 90px rgba(15,23,42,.35)}.ba-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}.ba-modal-head h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-modal-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form .wide{grid-column:1/-1}.ba-preview-photo{width:96px;height:96px;object-fit:cover;border-radius:22px;border:1px solid var(--border,rgba(148,163,184,.22))}.ba-preview-banner{width:100%;height:130px;object-fit:cover;border-radius:22px;border:1px solid var(--border,rgba(148,163,184,.22))}.ba-modal-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--surface,#fff) 70%,transparent)}.ba-modal-actions button:first-child{background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827)}
@media (min-width: 680px){.ba-page{padding:12px;padding-bottom:44px}.ba-search-card{grid-template-columns:minmax(0,1fr) 48px 48px 48px}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.subject-row{border-radius:24px;padding:12px}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-modal-backdrop,.ba-sheet-backdrop{place-items:center;padding:18px}.ba-modal{padding:18px}}
@media (min-width: 1040px){.ba-page{padding:16px;padding-bottom:48px}.ba-search-card,.ba-list,.ba-analysis-grid,.ba-table-card,.ba-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ba-current-filter{grid-column:span 2}.ba-form{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width: 520px){.ba-page{padding:6px}.ba-search-card{grid-template-columns:minmax(0,1fr) 42px 42px 42px;gap:6px;padding:7px;border-radius:22px}.ba-add-inline,.ba-filter-button,.ba-icon-button{width:42px;height:42px}.subject-row{border-radius:19px;padding:9px}.ba-avatar{width:42px;height:42px;border-radius:16px}.ba-table-actions{gap:4px}.ba-table-actions button{padding:0 8px;font-size:10px}.ba-analysis,.ba-table-card,.ba-empty,.ba-modal,.ba-sheet{border-radius:20px;padding:11px}}
@media (min-width:980px){
  .ba-modal-backdrop,
  .ba-sheet-backdrop{
    top:var(--eds-shell-top-offset,0px);
    right:0;
    bottom:0;
    left:var(--portal-content-left,0px);
    width:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }
  .ba-modal,
  .ba-sheet{
    min-width:0;
    max-width:calc(100vw - var(--portal-content-left,0px) - 20px);
  }
}

`;

  return SubjectsWorkspace;
})();

const CurriculumSubjectsModule = (() => {
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type SubjectType = "core" | "elective" | "optional";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type CurriculumSubjectView = {
  id: string;
  row: CurriculumSubject;
  curriculumName: string;
  curriculumCode: string;
  subjectName: string;
  subjectCode: string;
  pathwayName: string;
  organizationName: string;
  prerequisiteCount: number;
  classCount: number;
  offeringCount: number;
  active: boolean;
};

type FormState = {
  id?: string;
  curriculumId: string;
  subjectId: string;
  pathwayId: string;
  organizationId: string;
  type: SubjectType;
  credits: string;
  contactHours: string;
  minimumPassScore: string;
  orderIndex: string;
  active: boolean;
};

const emptyForm: FormState = {
  curriculumId: "",
  subjectId: "",
  pathwayId: "",
  organizationId: "",
  type: "core",
  credits: "",
  contactHours: "",
  minimumPassScore: "",
  orderIndex: "",
  active: true,
};

const idOf = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

const sameId = (a: unknown, b: unknown) => idOf(a) === idOf(b);

const safeLower = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .trim();

const tableSafe = (name: string) => (db as any)[name];

const numberOrUndefined = (value: string) => {
  const clean = String(value || "").trim();
  if (!clean) return undefined;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  return !["inactive", "deleted", "archived", "suspended"].includes(status);
};

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`cs-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="cs-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <section className="cs-empty">
      <div className="cs-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <span>
      <b>{value}</b>
      {label}
    </span>
  );
}

function groupedCounts<T>(
  rows: T[],
  getLabel: (row: T) => string,
): Array<{ label: string; value: number }> {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = getLabel(row) || "Not set";
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function CurriculumSubjectsWorkspace() {
  const dataRevision = useBranchTableRevision([
    "curriculumSubjects",
    "curriculums",
    "curriculumPathways",
    "subjects",
    "organizations",
    "subjectPrerequisites",
    "classSubjects",
    "subjectOfferings",
  ]);

  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const workspace = useBranchWorkspaceScope();
  const {
    accountId,
    schoolId,
    branchId,
    authenticated,
    restoring: accountLoading,
    branchLoading: contextLoading,
    ready: workspaceReady,
    error: workspaceError,
  } = workspace;

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const { loading, setLoading } = useBackgroundLoader();

  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [prerequisites, setPrerequisites] = useState<SubjectPrerequisite[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [offerings, setOfferings] = useState<SubjectOffering[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  useEffect(() => {
    setViewMode(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
  }, []);
  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState("all");
  const [filterPathwayId, setFilterPathwayId] = useState("all");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterType, setFilterType] = useState<"all" | SubjectType>("all");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "inactive"
  >("active");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const subjectSetupToolbar = {
    add: () => openCreate(),
    search: (query: string) => setSearch(query),
    filter: () => setFilterOpen(true),
    print: () => window.print(),
    more: () => setMoreOpen(true),
  };
  useRegisterBranchWorkspaceToolbar("setupWorkspace", subjectSetupToolbar);
  useRegisterBranchWorkspaceToolbar("subjectSetup", subjectSetupToolbar);
  const [selectedItem, setSelectedItem] =
    useState<CurriculumSubjectView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    router,
  ]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(
      () =>
        setToast((current) =>
          current?.message === message ? null : current,
        ),
      4200,
    );
  };

  const clearData = () => {
    setRows([]);
    setCurriculums([]);
    setPathways([]);
    setSubjects([]);
    setOrganizations([]);
    setPrerequisites([]);
    setClassSubjects([]);
    setOfferings([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        curriculumSubjectRows,
        curriculumRows,
        pathwayRows,
        subjectRows,
        organizationRows,
        prerequisiteRows,
        classSubjectRows,
        offeringRows,
      ] = await Promise.all([
        tableSafe("curriculumSubjects")?.toArray?.() || [],
        listActiveLocal("curriculums", {
          accountId,
          schoolId,
          branchId,
        } as any),
        tableSafe("curriculumPathways")?.toArray?.() || [],
        listActiveLocal("subjects", {
          accountId,
          schoolId,
          branchId,
        } as any),
        listActiveLocal("organizations", {
          accountId,
          schoolId,
          branchId,
        } as any),
        tableSafe("subjectPrerequisites")?.toArray?.() || [],
        tableSafe("classSubjects")?.toArray?.() || [],
        tableSafe("subjectOfferings")?.toArray?.() || [],
      ]);

      setRows(
        (curriculumSubjectRows as CurriculumSubject[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort(
            (a: any, b: any) =>
              Number(a.orderIndex ?? Number.MAX_SAFE_INTEGER) -
              Number(b.orderIndex ?? Number.MAX_SAFE_INTEGER),
          ),
      );

      setCurriculums(
        (curriculumRows as Curriculum[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setPathways(
        (pathwayRows as CurriculumPathway[])
          .filter((row) => sameTenant(row as TenantRow))
          .filter((row) => isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );

      setSubjects(
        (subjectRows as Subject[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setPrerequisites(
        (prerequisiteRows as SubjectPrerequisite[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setClassSubjects(
        (classSubjectRows as ClassSubject[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setOfferings(
        (offeringRows as SubjectOffering[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load curriculum subjects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    dataRevision,
  ]);

  const curriculumMap = useMemo(
    () => new Map(curriculums.map((row: any) => [idOf(row.id), row])),
    [curriculums],
  );

  const pathwayMap = useMemo(
    () => new Map(pathways.map((row: any) => [idOf(row.id), row])),
    [pathways],
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map((row: any) => [idOf(row.id), row])),
    [subjects],
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((row: any) => [idOf(row.id), row])),
    [organizations],
  );

  const usage = useMemo(() => {
    const prerequisiteMap = new Map<string, number>();
    const classMap = new Map<string, number>();
    const offeringMap = new Map<string, number>();

    prerequisites.forEach((row: any) => {
      const id = idOf(row.curriculumSubjectId);
      if (id) prerequisiteMap.set(id, (prerequisiteMap.get(id) || 0) + 1);
    });

    classSubjects.forEach((row: any) => {
      const id = idOf(row.curriculumSubjectId);
      if (id) classMap.set(id, (classMap.get(id) || 0) + 1);
    });

    offerings.forEach((row: any) => {
      const id = idOf(row.curriculumSubjectId);
      if (id) offeringMap.set(id, (offeringMap.get(id) || 0) + 1);
    });

    return { prerequisiteMap, classMap, offeringMap };
  }, [prerequisites, classSubjects, offerings]);

  const viewRows = useMemo<CurriculumSubjectView[]>(
    () =>
      rows.map((row: any) => {
        const id = idOf(row.id);
        const curriculum = curriculumMap.get(idOf(row.curriculumId));
        const subject = subjectMap.get(idOf(row.subjectId));
        const pathway = pathwayMap.get(idOf(row.pathwayId));
        const organization = organizationMap.get(idOf(row.organizationId));

        return {
          id,
          row,
          curriculumName: curriculum?.name || "Unknown curriculum",
          curriculumCode: curriculum?.code || "",
          subjectName: subject?.name || "Unknown subject",
          subjectCode: subject?.code || "",
          pathwayName: pathway?.name || "All pathways",
          organizationName: organization?.name || "No organization",
          prerequisiteCount: usage.prerequisiteMap.get(id) || 0,
          classCount: usage.classMap.get(id) || 0,
          offeringCount: usage.offeringMap.get(id) || 0,
          active: isActiveRow(row),
        };
      }),
    [rows, curriculumMap, subjectMap, pathwayMap, organizationMap, usage],
  );

  const availablePathways = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter((row: any) =>
      sameId(row.curriculumId, form.curriculumId),
    );
  }, [form.curriculumId, pathways]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row: any = item.row;

        if (
          filterCurriculumId !== "all" &&
          !sameId(row.curriculumId, filterCurriculumId)
        )
          return false;

        if (
          filterPathwayId !== "all" &&
          !sameId(row.pathwayId, filterPathwayId)
        )
          return false;

        if (
          filterOrganizationId !== "all" &&
          !sameId(row.organizationId, filterOrganizationId)
        )
          return false;

        if (filterType !== "all" && row.type !== filterType) return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;

        if (!term) return true;

        return `${item.subjectName} ${item.subjectCode} ${item.curriculumName} ${item.curriculumCode} ${item.pathwayName} ${item.organizationName} ${row.type || ""}`
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        const order =
          Number((a.row as any).orderIndex ?? Number.MAX_SAFE_INTEGER) -
          Number((b.row as any).orderIndex ?? Number.MAX_SAFE_INTEGER);
        return order || a.subjectName.localeCompare(b.subjectName);
      });
  }, [
    viewRows,
    search,
    filterCurriculumId,
    filterPathwayId,
    filterOrganizationId,
    filterType,
    filterStatus,
  ]);

  const summary = useMemo(
    () => ({
      total: viewRows.length,
      active: viewRows.filter((item) => item.active).length,
      inactive: viewRows.filter((item) => !item.active).length,
      core: viewRows.filter((item) => item.row.type === "core").length,
      elective: viewRows.filter((item) => item.row.type === "elective").length,
      optional: viewRows.filter((item) => item.row.type === "optional").length,
      credits: viewRows.reduce(
        (sum, item) => sum + Number(item.row.credits || 0),
        0,
      ),
      showing: filteredRows.length,
    }),
    [viewRows, filteredRows.length],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        filterCurriculumId,
        filterPathwayId,
        filterOrganizationId,
        filterType,
        filterStatus,
      ].filter((value) => value !== "all" && value !== "active").length,
    [
      filterCurriculumId,
      filterPathwayId,
      filterOrganizationId,
      filterType,
      filterStatus,
    ],
  );

  const countsByCurriculum = useMemo(
    () => groupedCounts(viewRows, (item) => item.curriculumName),
    [viewRows],
  );

  const countsByType = useMemo(
    () =>
      groupedCounts(viewRows, (item) => {
        const type = item.row.type || "core";
        return type.charAt(0).toUpperCase() + type.slice(1);
      }),
    [viewRows],
  );

  const countsByPathway = useMemo(
    () => groupedCounts(viewRows, (item) => item.pathwayName),
    [viewRows],
  );

  const updateForm = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const clearFilters = () => {
    setFilterCurriculumId("all");
    setFilterPathwayId("all");
    setFilterOrganizationId("all");
    setFilterType("all");
    setFilterStatus("active");
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;

    setSelectedItem(null);
    setForm({
      ...emptyForm,
      curriculumId:
        filterCurriculumId !== "all"
          ? filterCurriculumId
          : idOf(curriculums[0]?.id),
      pathwayId:
        filterPathwayId !== "all" ? filterPathwayId : "",
      organizationId:
        filterOrganizationId !== "all" ? filterOrganizationId : "",
      type: filterType !== "all" ? filterType : "core",
      orderIndex: String(viewRows.length + 1),
    });
    setModalOpen(true);
  };

  const openEdit = (item: CurriculumSubjectView) => {
    const row: any = item.row;
    setSelectedItem(null);
    setForm({
      id: item.id,
      curriculumId: idOf(row.curriculumId),
      subjectId: idOf(row.subjectId),
      pathwayId: idOf(row.pathwayId),
      organizationId: idOf(row.organizationId),
      type: row.type || "core",
      credits: row.credits == null ? "" : String(row.credits),
      contactHours:
        row.contactHours == null ? "" : String(row.contactHours),
      minimumPassScore:
        row.minimumPassScore == null ? "" : String(row.minimumPassScore),
      orderIndex: row.orderIndex == null ? "" : String(row.orderIndex),
      active: item.active,
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId || !branchId) return "Select a school branch first.";
    if (!form.curriculumId) return "Select a curriculum.";
    if (!form.subjectId) return "Select a subject.";

    const selectedPathway = pathways.find((row: any) =>
      sameId(row.id, form.pathwayId),
    );

    if (
      selectedPathway &&
      !sameId((selectedPathway as any).curriculumId, form.curriculumId)
    ) {
      return "The selected pathway does not belong to this curriculum.";
    }

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;

      return (
        sameId(row.curriculumId, form.curriculumId) &&
        sameId(row.subjectId, form.subjectId) &&
        sameId(row.pathwayId || "", form.pathwayId || "")
      );
    });

    if (duplicate) {
      return "This subject is already attached to the selected curriculum and pathway.";
    }

    const passScore = numberOrUndefined(form.minimumPassScore);
    if (passScore !== undefined && (passScore < 0 || passScore > 100)) {
      return "Minimum pass score must be between 0 and 100.";
    }

    for (const [label, value] of [
      ["Credits", form.credits],
      ["Contact hours", form.contactHours],
      ["Order", form.orderIndex],
    ] as const) {
      const parsed = numberOrUndefined(value);
      if (parsed !== undefined && parsed < 0) return `${label} cannot be negative.`;
    }

    return "";
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }

    try {
      setSaving(true);

      const existing = form.id
        ? rows.find((row: any) => sameId(row.id, form.id))
        : undefined;

      const payload: Partial<CurriculumSubject> = {
        accountId: String(accountId),
        schoolId: String(schoolId),
        branchId: String(branchId),
        curriculumId: form.curriculumId,
        subjectId: form.subjectId,
        pathwayId: form.pathwayId || undefined,
        organizationId: form.organizationId || undefined,
        type: form.type,
        credits: numberOrUndefined(form.credits),
        contactHours: numberOrUndefined(form.contactHours),
        minimumPassScore: numberOrUndefined(form.minimumPassScore),
        orderIndex: numberOrUndefined(form.orderIndex),
        active: form.active,
        isDeleted: false,
      };

      if (form.id && existing) {
        await updateLocal("curriculumSubjects", form.id, payload);
      } else {
        await createLocal(
          "curriculumSubjects",
          payload as CurriculumSubject,
        );
      }

      setModalOpen(false);
      setForm(emptyForm);
      showToast("success", "Curriculum subject saved.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not save curriculum subject.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CurriculumSubjectView) => {
    if (!item.id) return;

    try {
      await updateLocal("curriculumSubjects", item.id, {
        active: !item.active,
        isDeleted: false,
      } as Partial<CurriculumSubject>);

      setSelectedItem(null);
      showToast(
        "success",
        item.active
          ? "Curriculum subject deactivated."
          : "Curriculum subject activated.",
      );
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not update curriculum subject status.");
    }
  };

  const remove = async (item: CurriculumSubjectView) => {
    const usageTotal =
      item.prerequisiteCount + item.classCount + item.offeringCount;

    const ok = window.confirm(
      usageTotal
        ? `"${item.subjectName}" has ${usageTotal} linked record(s). Delete anyway?`
        : `Delete "${item.subjectName}" from ${item.curriculumName}?`,
    );

    if (!ok) return;

    try {
      await softDeleteLocal("curriculumSubjects", item.id);
      setSelectedItem(null);
      showToast("success", "Curriculum subject deleted.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not delete curriculum subject.");
    }
  };

  if (
    accountLoading ||
    settingsLoading ||
    contextLoading ||
    (!workspaceReady && !workspaceError)
  ) {
    return (
      <div className="cs-state">
        <span className="cs-spinner" />
        <p>Preparing curriculum subjects…</p>
        <Styles primary={primary} />
      </div>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <div className="cs-state">
        <h3>Sign-in required</h3>
        <p>Please sign in to manage curriculum subjects.</p>
        <Styles primary={primary} />
      </div>
    );
  }

  if (!schoolId || !branchId || workspaceError) {
    return (
      <div className="cs-state">
        <h3>Branch workspace required</h3>
        <p>
          {workspaceError ||
            "Select a school branch before opening curriculum subjects."}
        </p>
        <Styles primary={primary} />
      </div>
    );
  }

  return (
    <div className="cs-root">
      <Styles primary={primary} />

      <div className="cs-toolbar">
        <label className="cs-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search curriculum subjects..."
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </label>

        <button
          type="button"
          className="cs-icon-button cs-primary"
          onClick={openCreate}
          aria-label="Add curriculum subject"
          title="Add curriculum subject"
        >
          +
        </button>

        <button
          type="button"
          className="cs-icon-button"
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? (
            <b className="cs-action-badge">{activeFilterCount}</b>
          ) : null}
        </button>

        <div className="cs-more-wrap">
          <button
            type="button"
            className="cs-icon-button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-label="More options"
            title="More"
          >
            ⋯
          </button>

          {moreOpen ? (
            <>
              <EleeveonFullscreenOverlay>
                <div className="cs-overlay cs-menu-overlay" role="dialog" aria-modal="true" aria-label="More subject setup actions">
                  <button
                    type="button"
                    className="cs-backdrop"
                    onClick={() => setMoreOpen(false)}
                    aria-label="Close menu"
                  />
                  <div className="cs-menu">
                <button
                  type="button"
                  className={viewMode === "cards" ? "active" : ""}
                  onClick={() => {
                    setViewMode("cards");
                    setMoreOpen(false);
                  }}
                >
                  <span>▦</span> Card view
                </button>
                <button
                  type="button"
                  className={viewMode === "table" ? "active" : ""}
                  onClick={() => {
                    setViewMode("table");
                    setMoreOpen(false);
                  }}
                >
                  <span>☷</span> Table view
                </button>
                <button
                  type="button"
                  className={viewMode === "summary" ? "active" : ""}
                  onClick={() => {
                    setViewMode("summary");
                    setMoreOpen(false);
                  }}
                >
                  <span>◔</span> Analytics
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    load();
                    setMoreOpen(false);
                  }}
                >
                  <span>↻</span> Refresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearFilters();
                    setSearch("");
                    setMoreOpen(false);
                  }}
                >
                  <span>×</span> Reset view
                </button>
                  </div>
                </div>
              </EleeveonFullscreenOverlay>
            </>
          ) : null}
        </div>
      </div>

      {(search ||
        activeFilterCount > 0 ||
        viewMode === "table" ||
        viewMode === "summary") && (
        <div className="cs-compact-summary">
          <MiniStat label="total" value={summary.total} />
          <MiniStat label="showing" value={summary.showing} />
          <MiniStat label="active" value={summary.active} />
          <MiniStat label="credits" value={summary.credits} />
        </div>
      )}

      {loading ? (
        <div className="cs-loading-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="cs-skeleton" key={index} />
          ))}
        </div>
      ) : !filteredRows.length ? (
        <Empty
          icon="📚"
          title={viewRows.length ? "No matching subjects" : "No curriculum subjects"}
          text={
            viewRows.length
              ? "Change your search or filters to see more records."
              : "Attach subjects to a curriculum to define its academic content."
          }
        />
      ) : viewMode === "cards" ? (
        <div className="cs-grid">
          {filteredRows.map((item) => {
            const row: any = item.row;
            const initials = item.subjectName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase();

            return (
              <article className="cs-card" key={item.id}>
                <button
                  type="button"
                  className="cs-card-main"
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="cs-avatar">{initials || "S"}</div>

                  <div className="cs-card-copy">
                    <div className="cs-card-heading">
                      <div>
                        <h3>{item.subjectName}</h3>
                        <p>
                          {item.subjectCode || "No code"} ·{" "}
                          {item.curriculumName}
                        </p>
                      </div>
                      <span
                        className={`cs-status-dot ${
                          item.active ? "active" : "inactive"
                        }`}
                        title={item.active ? "Active" : "Inactive"}
                      />
                    </div>

                    <div className="cs-chips">
                      <Chip
                        tone={
                          row.type === "core"
                            ? "blue"
                            : row.type === "elective"
                              ? "purple"
                              : "orange"
                        }
                      >
                        {row.type || "core"}
                      </Chip>
                      {row.pathwayId ? (
                        <Chip tone="gray">{item.pathwayName}</Chip>
                      ) : (
                        <Chip tone="green">All pathways</Chip>
                      )}
                    </div>

                    <div className="cs-metrics">
                      <MiniStat label="credits" value={row.credits ?? "—"} />
                      <MiniStat
                        label="hours"
                        value={row.contactHours ?? "—"}
                      />
                      <MiniStat
                        label="pass"
                        value={
                          row.minimumPassScore == null
                            ? "—"
                            : `${row.minimumPassScore}%`
                        }
                      />
                    </div>
                  </div>
                </button>

                <div className="cs-card-actions">
                  <button type="button" onClick={() => openEdit(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedItem(item)}
                  >
                    More
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : viewMode === "table" ? (
        <div className="cs-table-wrap">
          <table className="cs-table">
            <thead>
              <tr>
                <th>Subject ({filteredRows.length})</th>
                <th>Curriculum</th>
                <th>Pathway</th>
                <th>Type</th>
                <th>Credits</th>
                <th>Hours</th>
                <th>Pass score</th>
                <th>Status</th>
                <th className="cs-actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => {
                const row: any = item.row;
                return (
                  <tr key={item.id}>
                    <td>
                      <b>{item.subjectName}</b>
                      <small>{item.subjectCode || "No subject code"}</small>
                    </td>
                    <td>
                      {item.curriculumName}
                      <small>{item.curriculumCode || "No code"}</small>
                    </td>
                    <td>{item.pathwayName}</td>
                    <td>
                      <Chip
                        tone={
                          row.type === "core"
                            ? "blue"
                            : row.type === "elective"
                              ? "purple"
                              : "orange"
                        }
                      >
                        {row.type || "core"}
                      </Chip>
                    </td>
                    <td>{row.credits ?? "—"}</td>
                    <td>{row.contactHours ?? "—"}</td>
                    <td>
                      {row.minimumPassScore == null
                        ? "—"
                        : `${row.minimumPassScore}%`}
                    </td>
                    <td>
                      <Chip tone={item.active ? "green" : "red"}>
                        {item.active ? "Active" : "Inactive"}
                      </Chip>
                    </td>
                    <td className="cs-table-actions">
                      <button type="button" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                      >
                        More
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="cs-analytics">
          <div className="cs-stat-grid">
            <article>
              <b>{summary.total}</b>
              <span>Total subjects</span>
            </article>
            <article>
              <b>{summary.active}</b>
              <span>Active</span>
            </article>
            <article>
              <b>{summary.core}</b>
              <span>Core</span>
            </article>
            <article>
              <b>{summary.elective}</b>
              <span>Elective</span>
            </article>
            <article>
              <b>{summary.optional}</b>
              <span>Optional</span>
            </article>
            <article>
              <b>{summary.credits}</b>
              <span>Total credits</span>
            </article>
          </div>

          <div className="cs-analysis-grid">
            <AnalysisCard title="By curriculum" rows={countsByCurriculum} />
            <AnalysisCard title="By type" rows={countsByType} />
            <AnalysisCard title="By pathway" rows={countsByPathway} />
          </div>
        </section>
      )}

      {filterOpen ? (
        <EleeveonFullscreenOverlay><div className="cs-overlay">
          <button
            type="button"
            className="cs-backdrop"
            onClick={() => setFilterOpen(false)}
            aria-label="Close filters"
          />
          <aside className="cs-sheet">
            <div className="cs-sheet-head">
              <div>
                <h3>Filter curriculum subjects</h3>
                <p>Limit records by academic context and status.</p>
              </div>
              <button type="button" onClick={() => setFilterOpen(false)}>
                ×
              </button>
            </div>

            <div className="cs-form-grid single">
              <label>
                <span>Curriculum</span>
                <select
                  value={filterCurriculumId}
                  onChange={(event) => setFilterCurriculumId(event.target.value)}
                >
                  <option value="all">All curriculums</option>
                  {curriculums.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Pathway</span>
                <select
                  value={filterPathwayId}
                  onChange={(event) => setFilterPathwayId(event.target.value)}
                >
                  <option value="all">All pathways</option>
                  {pathways.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Organization</span>
                <select
                  value={filterOrganizationId}
                  onChange={(event) =>
                    setFilterOrganizationId(event.target.value)
                  }
                >
                  <option value="all">All organizations</option>
                  {organizations.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Subject type</span>
                <select
                  value={filterType}
                  onChange={(event) =>
                    setFilterType(event.target.value as "all" | SubjectType)
                  }
                >
                  <option value="all">All types</option>
                  <option value="core">Core</option>
                  <option value="elective">Elective</option>
                  <option value="optional">Optional</option>
                </select>
              </label>

              <label>
                <span>Status</span>
                <select
                  value={filterStatus}
                  onChange={(event) =>
                    setFilterStatus(
                      event.target.value as "all" | "active" | "inactive",
                    )
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>

            <div className="cs-sheet-actions">
              <button
                type="button"
                className="cs-secondary-button"
                onClick={clearFilters}
              >
                Reset
              </button>
              <button
                type="button"
                className="cs-primary-button"
                onClick={() => setFilterOpen(false)}
              >
                Apply filters
              </button>
            </div>
          </aside>
        </div></EleeveonFullscreenOverlay>
      ) : null}

      {modalOpen ? (
        <EleeveonFullscreenOverlay><div className="cs-overlay">
          <button
            type="button"
            className="cs-backdrop"
            onClick={() => !saving && setModalOpen(false)}
            aria-label="Close form"
          />
          <section className="cs-modal">
            <form onSubmit={save}>
              <div className="cs-sheet-head">
                <div>
                  <h3>
                    {form.id
                      ? "Edit curriculum subject"
                      : "Add curriculum subject"}
                  </h3>
                  <p>
                    Define how this subject belongs to the selected curriculum.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !saving && setModalOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="cs-form-grid">
                <label>
                  <span>
                    Curriculum <b>*</b>
                  </span>
                  <select
                    value={form.curriculumId}
                    onChange={(event) =>
                      updateForm({
                        curriculumId: event.target.value,
                        pathwayId: "",
                      })
                    }
                    required
                  >
                    <option value="">Select curriculum</option>
                    {curriculums.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {row.code ? ` · ${row.code}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>
                    Subject <b>*</b>
                  </span>
                  <select
                    value={form.subjectId}
                    onChange={(event) =>
                      updateForm({ subjectId: event.target.value })
                    }
                    required
                  >
                    <option value="">Select subject</option>
                    {subjects.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {row.code ? ` · ${row.code}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Pathway</span>
                  <select
                    value={form.pathwayId}
                    onChange={(event) =>
                      updateForm({ pathwayId: event.target.value })
                    }
                    disabled={!form.curriculumId}
                  >
                    <option value="">All pathways</option>
                    {availablePathways.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    Leave blank when the subject applies to every pathway.
                  </small>
                </label>

                <label>
                  <span>Organization</span>
                  <select
                    value={form.organizationId}
                    onChange={(event) =>
                      updateForm({ organizationId: event.target.value })
                    }
                  >
                    <option value="">No organization</option>
                    {organizations.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Subject type</span>
                  <select
                    value={form.type}
                    onChange={(event) =>
                      updateForm({ type: event.target.value as SubjectType })
                    }
                  >
                    <option value="core">Core</option>
                    <option value="elective">Elective</option>
                    <option value="optional">Optional</option>
                  </select>
                </label>

                <label>
                  <span>Order</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.orderIndex}
                    onChange={(event) =>
                      updateForm({ orderIndex: event.target.value })
                    }
                    placeholder="1"
                  />
                </label>

                <label>
                  <span>Credits</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.credits}
                    onChange={(event) =>
                      updateForm({ credits: event.target.value })
                    }
                    placeholder="3"
                  />
                </label>

                <label>
                  <span>Contact hours</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.contactHours}
                    onChange={(event) =>
                      updateForm({ contactHours: event.target.value })
                    }
                    placeholder="40"
                  />
                </label>

                <label>
                  <span>Minimum pass score (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.minimumPassScore}
                    onChange={(event) =>
                      updateForm({ minimumPassScore: event.target.value })
                    }
                    placeholder="50"
                  />
                </label>

                <label className="cs-toggle-row">
                  <span>
                    <b>Active</b>
                    <small>Available for class and assessment setup.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) =>
                      updateForm({ active: event.target.checked })
                    }
                  />
                </label>
              </div>

              <div className="cs-modal-actions">
                <button
                  type="button"
                  className="cs-secondary-button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cs-primary-button"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save subject"}
                </button>
              </div>
            </form>
          </section>
        </div></EleeveonFullscreenOverlay>
      ) : null}

      {selectedItem ? (
        <EleeveonFullscreenOverlay><div className="cs-overlay">
          <button
            type="button"
            className="cs-backdrop"
            onClick={() => setSelectedItem(null)}
            aria-label="Close details"
          />
          <aside className="cs-sheet">
            <div className="cs-sheet-head">
              <div>
                <h3>{selectedItem.subjectName}</h3>
                <p>{selectedItem.curriculumName}</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)}>
                ×
              </button>
            </div>

            <div className="cs-detail-hero">
              <div className="cs-avatar large">
                {selectedItem.subjectName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div>
                <h4>{selectedItem.subjectName}</h4>
                <p>{selectedItem.subjectCode || "No subject code"}</p>
              </div>
            </div>

            <div className="cs-detail-grid">
              <div>
                <span>Curriculum</span>
                <b>{selectedItem.curriculumName}</b>
              </div>
              <div>
                <span>Pathway</span>
                <b>{selectedItem.pathwayName}</b>
              </div>
              <div>
                <span>Organization</span>
                <b>{selectedItem.organizationName}</b>
              </div>
              <div>
                <span>Type</span>
                <b>{selectedItem.row.type || "core"}</b>
              </div>
              <div>
                <span>Credits</span>
                <b>{selectedItem.row.credits ?? "Not set"}</b>
              </div>
              <div>
                <span>Contact hours</span>
                <b>{selectedItem.row.contactHours ?? "Not set"}</b>
              </div>
              <div>
                <span>Minimum pass</span>
                <b>
                  {selectedItem.row.minimumPassScore == null
                    ? "Not set"
                    : `${selectedItem.row.minimumPassScore}%`}
                </b>
              </div>
              <div>
                <span>Order</span>
                <b>{selectedItem.row.orderIndex ?? "Not set"}</b>
              </div>
            </div>

            <div className="cs-usage">
              <MiniStat
                label="prerequisites"
                value={selectedItem.prerequisiteCount}
              />
              <MiniStat label="classes" value={selectedItem.classCount} />
              <MiniStat label="offerings" value={selectedItem.offeringCount} />
            </div>

            <div className="cs-sheet-action-list">
              <button type="button" onClick={() => openEdit(selectedItem)}>
                <span>✎</span>
                <div>
                  <b>Edit subject settings</b>
                  <small>Update curriculum rules and academic values.</small>
                </div>
              </button>

              <button
                type="button"
                onClick={() => toggleActive(selectedItem)}
              >
                <span>{selectedItem.active ? "○" : "●"}</span>
                <div>
                  <b>{selectedItem.active ? "Deactivate" : "Activate"}</b>
                  <small>
                    {selectedItem.active
                      ? "Hide it from active academic setup."
                      : "Make it available for academic setup."}
                  </small>
                </div>
              </button>

              <button
                type="button"
                className="danger"
                onClick={() => remove(selectedItem)}
              >
                <span>⌫</span>
                <div>
                  <b>Delete curriculum subject</b>
                  <small>Soft delete this link while preserving sync history.</small>
                </div>
              </button>
            </div>
          </aside>
        </div></EleeveonFullscreenOverlay>
      ) : null}

      {toast ? (
        <div className={`cs-toast ${toast.tone}`}>{toast.message}</div>
      ) : null}
    </div>
  );
}

function AnalysisCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <article className="cs-analysis-card">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="cs-bars">
          {rows.slice(0, 10).map((row) => (
            <div className="cs-bar-row" key={row.label}>
              <div>
                <span>{row.label}</span>
                <b>{row.value}</b>
              </div>
              <i>
                <em style={{ width: `${(row.value / max) * 100}%` }} />
              </i>
            </div>
          ))}
        </div>
      ) : (
        <p className="cs-muted">No records available.</p>
      )}
    </article>
  );
}

function Styles({ primary }: { primary: string }) {
  return (
    <style jsx global>{`
      .cs-root {
        --cs-primary: ${primary};
        --cs-bg: var(--background, #f7f8fb);
        --cs-surface: var(--card, #ffffff);
        --cs-surface-2: color-mix(in srgb, var(--cs-surface) 94%, var(--cs-primary));
        --cs-text: var(--foreground, #172033);
        --cs-muted: color-mix(in srgb, var(--cs-text) 62%, transparent);
        --cs-border: color-mix(in srgb, var(--cs-text) 13%, transparent);
        --cs-soft-primary: color-mix(in srgb, var(--cs-primary) 11%, transparent);
        color: var(--cs-text);
        width: 100%;
        min-width: 0;
      }

      .cs-root *,
      .cs-root *::before,
      .cs-root *::after {
        box-sizing: border-box;
      }

      .cs-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto auto;
        gap: 8px;
        align-items: center;
        margin-bottom: 10px;
      }

      .cs-search {
        min-width: 0;
        height: 42px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 11px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 13px;
        box-shadow: 0 5px 18px rgba(15, 23, 42, 0.04);
      }

      .cs-search > span {
        font-size: 21px;
        line-height: 1;
        color: var(--cs-muted);
        transform: translateY(-1px);
      }

      .cs-search input {
        width: 100%;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        color: var(--cs-text);
        font: inherit;
        font-size: 14px;
      }

      .cs-search button,
      .cs-sheet-head > button {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--cs-muted);
        font-size: 20px;
        cursor: pointer;
      }

      .cs-icon-button {
        position: relative;
        width: 42px;
        height: 42px;
        border-radius: 13px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        color: var(--cs-text);
        font: inherit;
        font-size: 23px;
        line-height: 1;
        display: grid;
        place-items: center;
        cursor: pointer;
        box-shadow: 0 5px 18px rgba(15, 23, 42, 0.04);
      }

      .cs-icon-button:hover {
        background: var(--cs-surface-2);
      }

      .cs-icon-button.cs-primary {
        background: var(--cs-primary);
        color: #fff;
        border-color: var(--cs-primary);
      }

      .cs-slider-icon {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
      }

      .cs-action-badge {
        position: absolute;
        right: -4px;
        top: -4px;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border-radius: 9px;
        display: grid;
        place-items: center;
        background: #ef4444;
        color: #fff;
        font-size: 10px;
        border: 2px solid var(--cs-surface);
      }

      .cs-more-wrap {
        position: relative;
      }

      .cs-menu-backdrop {
        position: fixed;
        inset: 0;
        z-index: 30;
        border: 0;
        background: transparent;
      }

      .cs-menu {
        position: absolute;
        z-index: 31;
        right: 0;
        top: calc(100% + 7px);
        width: 210px;
        padding: 7px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 14px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.16);
      }

      .cs-menu button {
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--cs-text);
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border-radius: 9px;
        cursor: pointer;
        text-align: left;
        font: inherit;
        font-size: 13px;
      }

      .cs-menu button:hover,
      .cs-menu button.active {
        background: var(--cs-soft-primary);
        color: var(--cs-primary);
      }

      .cs-menu hr {
        border: 0;
        border-top: 1px solid var(--cs-border);
        margin: 5px 0;
      }

      .cs-compact-summary,
      .cs-usage {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-bottom: 10px;
      }

      .cs-compact-summary > span,
      .cs-usage > span {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        padding: 6px 9px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 999px;
        color: var(--cs-muted);
        font-size: 11px;
      }

      .cs-compact-summary b,
      .cs-usage b {
        color: var(--cs-text);
        font-size: 13px;
      }

      .cs-grid,
      .cs-loading-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 10px;
      }

      .cs-card {
        min-width: 0;
        overflow: hidden;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 16px;
        box-shadow: 0 7px 24px rgba(15, 23, 42, 0.045);
      }

      .cs-card-main {
        width: 100%;
        border: 0;
        background: transparent;
        color: inherit;
        display: flex;
        align-items: flex-start;
        gap: 11px;
        padding: 13px;
        text-align: left;
        cursor: pointer;
      }

      .cs-avatar {
        flex: 0 0 auto;
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border-radius: 13px;
        background: var(--cs-soft-primary);
        color: var(--cs-primary);
        font-size: 13px;
        font-weight: 800;
      }

      .cs-avatar.large {
        width: 52px;
        height: 52px;
        border-radius: 16px;
        font-size: 16px;
      }

      .cs-card-copy {
        min-width: 0;
        flex: 1;
      }

      .cs-card-heading {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      .cs-card h3,
      .cs-analysis-card h3,
      .cs-sheet h3,
      .cs-modal h3,
      .cs-detail-hero h4 {
        margin: 0;
        color: var(--cs-text);
      }

      .cs-card h3 {
        font-size: 14px;
        line-height: 1.25;
      }

      .cs-card-heading p,
      .cs-sheet-head p,
      .cs-detail-hero p {
        margin: 3px 0 0;
        color: var(--cs-muted);
        font-size: 11px;
      }

      .cs-status-dot {
        width: 8px;
        height: 8px;
        margin-top: 4px;
        border-radius: 50%;
        background: #94a3b8;
        box-shadow: 0 0 0 3px color-mix(in srgb, #94a3b8 15%, transparent);
      }

      .cs-status-dot.active {
        background: #22c55e;
        box-shadow: 0 0 0 3px color-mix(in srgb, #22c55e 15%, transparent);
      }

      .cs-status-dot.inactive {
        background: #ef4444;
        box-shadow: 0 0 0 3px color-mix(in srgb, #ef4444 15%, transparent);
      }

      .cs-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 9px;
      }

      .cs-chip {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        padding: 3px 7px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        text-transform: capitalize;
        white-space: nowrap;
      }

      .cs-chip.green {
        color: #15803d;
        background: color-mix(in srgb, #22c55e 12%, transparent);
      }
      .cs-chip.red {
        color: #dc2626;
        background: color-mix(in srgb, #ef4444 12%, transparent);
      }
      .cs-chip.blue {
        color: #2563eb;
        background: color-mix(in srgb, #3b82f6 12%, transparent);
      }
      .cs-chip.gray {
        color: var(--cs-muted);
        background: color-mix(in srgb, var(--cs-text) 7%, transparent);
      }
      .cs-chip.orange {
        color: #c2410c;
        background: color-mix(in srgb, #f97316 12%, transparent);
      }
      .cs-chip.purple {
        color: #7c3aed;
        background: color-mix(in srgb, #8b5cf6 12%, transparent);
      }

      .cs-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin-top: 10px;
      }

      .cs-metrics > span {
        min-width: 0;
        padding: 6px;
        border-radius: 9px;
        background: color-mix(in srgb, var(--cs-text) 3.5%, transparent);
        color: var(--cs-muted);
        display: flex;
        flex-direction: column;
        font-size: 9px;
      }

      .cs-metrics b {
        color: var(--cs-text);
        font-size: 12px;
      }

      .cs-card-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        padding: 8px 10px;
        border-top: 1px solid var(--cs-border);
      }

      .cs-card-actions button,
      .cs-table-actions button {
        border: 0;
        background: transparent;
        color: var(--cs-primary);
        padding: 5px 7px;
        border-radius: 7px;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }

      .cs-card-actions button:hover,
      .cs-table-actions button:hover {
        background: var(--cs-soft-primary);
      }

      .cs-skeleton {
        height: 155px;
        border-radius: 16px;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--cs-text) 5%, transparent),
          color-mix(in srgb, var(--cs-text) 9%, transparent),
          color-mix(in srgb, var(--cs-text) 5%, transparent)
        );
        background-size: 220% 100%;
        animation: cs-shimmer 1.25s infinite linear;
      }

      @keyframes cs-shimmer {
        to {
          background-position: -220% 0;
        }
      }

      .cs-empty,
      .cs-state {
        min-height: 260px;
        display: grid;
        place-items: center;
        align-content: center;
        text-align: center;
        padding: 30px;
        border: 1px dashed var(--cs-border);
        border-radius: 18px;
        background: var(--cs-surface);
        color: var(--cs-text);
      }

      .cs-empty-icon {
        font-size: 32px;
      }

      .cs-empty h3,
      .cs-state h3 {
        margin: 9px 0 4px;
      }

      .cs-empty p,
      .cs-state p {
        max-width: 460px;
        margin: 0;
        color: var(--cs-muted);
        font-size: 13px;
      }

      .cs-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid var(--cs-border);
        border-top-color: var(--cs-primary);
        border-radius: 50%;
        animation: cs-spin 0.75s linear infinite;
      }

      @keyframes cs-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .cs-table-wrap {
        width: 100%;
        overflow: auto;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 15px;
      }

      .cs-table {
        width: 100%;
        min-width: 970px;
        border-collapse: collapse;
        font-size: 12px;
      }

      .cs-table th {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 10px;
        background: color-mix(in srgb, var(--cs-surface) 94%, var(--cs-primary));
        color: var(--cs-muted);
        font-size: 10px;
        text-align: left;
        text-transform: uppercase;
        letter-spacing: 0.045em;
        white-space: nowrap;
      }

      .cs-table td {
        padding: 10px;
        border-top: 1px solid var(--cs-border);
        vertical-align: middle;
      }

      .cs-table td b,
      .cs-table td small {
        display: block;
      }

      .cs-table td small {
        margin-top: 2px;
        color: var(--cs-muted);
        font-size: 10px;
      }

      .cs-actions-column,
      .cs-table-actions {
        text-align: right !important;
        white-space: nowrap;
      }

      .cs-analytics {
        display: grid;
        gap: 10px;
      }

      .cs-stat-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
      }

      .cs-stat-grid article {
        padding: 12px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 13px;
      }

      .cs-stat-grid b {
        display: block;
        color: var(--cs-primary);
        font-size: 20px;
      }

      .cs-stat-grid span {
        color: var(--cs-muted);
        font-size: 10px;
      }

      .cs-analysis-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .cs-analysis-card {
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 15px;
      }

      .cs-analysis-card h3 {
        font-size: 13px;
        margin-bottom: 12px;
      }

      .cs-bars {
        display: grid;
        gap: 10px;
      }

      .cs-bar-row > div {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        color: var(--cs-muted);
        font-size: 10px;
      }

      .cs-bar-row > div span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cs-bar-row > div b {
        color: var(--cs-text);
      }

      .cs-bar-row i {
        display: block;
        height: 6px;
        margin-top: 4px;
        overflow: hidden;
        border-radius: 99px;
        background: color-mix(in srgb, var(--cs-text) 8%, transparent);
      }

      .cs-bar-row em {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--cs-primary);
      }

      .cs-muted {
        color: var(--cs-muted);
        font-size: 12px;
      }

      .cs-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        justify-content: flex-end;
        align-items: stretch;
      }

      .cs-backdrop {
        position: absolute;
        inset: 0;
        border: 0;
        background: rgba(15, 23, 42, 0.48);
        backdrop-filter: blur(2px);
      }

      .cs-sheet,
      .cs-modal {
        position: relative;
        z-index: 1;
        width: min(430px, 100%);
        height: 100%;
        overflow: auto;
        background: var(--cs-surface);
        color: var(--cs-text);
        box-shadow: -18px 0 60px rgba(15, 23, 42, 0.2);
        padding: 18px;
      }

      .cs-modal {
        width: min(760px, 100%);
      }

      .cs-modal form {
        min-height: 100%;
        display: flex;
        flex-direction: column;
      }

      .cs-sheet-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--cs-border);
      }

      .cs-sheet-head h3 {
        font-size: 16px;
      }

      .cs-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 13px;
        padding: 16px 0;
      }

      .cs-form-grid.single {
        grid-template-columns: 1fr;
      }

      .cs-form-grid label {
        min-width: 0;
        display: grid;
        gap: 6px;
        align-content: start;
      }

      .cs-form-grid label > span {
        color: var(--cs-text);
        font-size: 11px;
        font-weight: 700;
      }

      .cs-form-grid label > span > b {
        color: #ef4444;
      }

      .cs-form-grid input:not([type="checkbox"]),
      .cs-form-grid select {
        width: 100%;
        min-width: 0;
        height: 42px;
        border: 1px solid var(--cs-border);
        border-radius: 11px;
        background: var(--cs-surface);
        color: var(--cs-text);
        padding: 0 11px;
        outline: 0;
        font: inherit;
        font-size: 13px;
      }

      .cs-form-grid input:focus,
      .cs-form-grid select:focus {
        border-color: var(--cs-primary);
        box-shadow: 0 0 0 3px var(--cs-soft-primary);
      }

      .cs-form-grid label > small {
        color: var(--cs-muted);
        font-size: 10px;
        line-height: 1.35;
      }

      .cs-toggle-row {
        grid-column: 1 / -1;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 12px;
        border: 1px solid var(--cs-border);
        border-radius: 12px;
      }

      .cs-toggle-row > span {
        display: grid;
        gap: 2px;
      }

      .cs-toggle-row small {
        color: var(--cs-muted);
        font-size: 10px;
        font-weight: 400;
      }

      .cs-toggle-row input {
        width: 38px;
        height: 20px;
        accent-color: var(--cs-primary);
      }

      .cs-sheet-actions,
      .cs-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: auto;
        padding-top: 14px;
        border-top: 1px solid var(--cs-border);
      }

      .cs-primary-button,
      .cs-secondary-button {
        min-height: 40px;
        padding: 0 15px;
        border-radius: 11px;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .cs-primary-button {
        border: 1px solid var(--cs-primary);
        background: var(--cs-primary);
        color: #fff;
      }

      .cs-secondary-button {
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        color: var(--cs-text);
      }

      .cs-primary-button:disabled,
      .cs-secondary-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .cs-detail-hero {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 0;
      }

      .cs-detail-hero h4 {
        font-size: 15px;
      }

      .cs-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 14px;
      }

      .cs-detail-grid > div {
        min-width: 0;
        padding: 10px;
        border: 1px solid var(--cs-border);
        border-radius: 11px;
        background: color-mix(in srgb, var(--cs-text) 2.5%, transparent);
      }

      .cs-detail-grid span,
      .cs-detail-grid b {
        display: block;
      }

      .cs-detail-grid span {
        color: var(--cs-muted);
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .cs-detail-grid b {
        margin-top: 3px;
        overflow: hidden;
        color: var(--cs-text);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cs-sheet-action-list {
        display: grid;
        gap: 7px;
        margin-top: 13px;
      }

      .cs-sheet-action-list > button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 11px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        color: var(--cs-text);
        border-radius: 12px;
        text-align: left;
        cursor: pointer;
      }

      .cs-sheet-action-list > button:hover {
        background: var(--cs-surface-2);
      }

      .cs-sheet-action-list > button > span {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 9px;
        background: var(--cs-soft-primary);
        color: var(--cs-primary);
        font-weight: 800;
      }

      .cs-sheet-action-list b,
      .cs-sheet-action-list small {
        display: block;
      }

      .cs-sheet-action-list b {
        font-size: 12px;
      }

      .cs-sheet-action-list small {
        margin-top: 2px;
        color: var(--cs-muted);
        font-size: 10px;
      }

      .cs-sheet-action-list > button.danger {
        color: #dc2626;
      }

      .cs-sheet-action-list > button.danger > span {
        color: #dc2626;
        background: color-mix(in srgb, #ef4444 11%, transparent);
      }

      .cs-toast {
        position: fixed;
        z-index: 1500;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        max-width: min(92vw, 520px);
        padding: 10px 14px;
        border-radius: 11px;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 16px 45px rgba(15, 23, 42, 0.24);
      }

      .cs-toast.success {
        background: #15803d;
      }

      .cs-toast.error {
        background: #dc2626;
      }

      .cs-toast.info {
        background: #2563eb;
      }

      @media (max-width: 900px) {
        .cs-stat-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .cs-analysis-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 620px) {
        .cs-toolbar {
          grid-template-columns: minmax(0, 1fr) auto auto auto;
          gap: 6px;
        }

        .cs-search,
        .cs-icon-button {
          height: 40px;
        }

        .cs-icon-button {
          width: 40px;
          border-radius: 12px;
        }

        .cs-grid,
        .cs-loading-grid {
          grid-template-columns: 1fr;
        }

        .cs-form-grid {
          grid-template-columns: 1fr;
        }

        .cs-toggle-row {
          grid-column: auto;
        }

        .cs-stat-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .cs-sheet,
        .cs-modal {
          width: 100%;
          padding: 15px;
        }
      }
    `}</style>
  );
}

  return CurriculumSubjectsWorkspace;
})();

const SubjectPrerequisitesModule = (() => {
type RuleType = "prerequisite" | "corequisite" | "recommended";
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type StatusFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | RuleType;

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type PrerequisiteForm = {
  id?: string;
  curriculumSubjectId: string;
  prerequisiteSubjectId: string;
  minimumGrade: string;
  minimumScore: string;
  type: RuleType;
  groupCode: string;
  active: boolean;
};

type CurriculumSubjectOption = {
  id: string;
  row: CurriculumSubject;
  curriculumId: string;
  subjectId: string;
  pathwayId: string;
  label: string;
  shortLabel: string;
  curriculumName: string;
  subjectName: string;
  subjectCode: string;
  pathwayName: string;
};

type PrerequisiteViewRow = {
  id: string;
  row: SubjectPrerequisite;
  owner?: CurriculumSubjectOption;
  prerequisite?: CurriculumSubjectOption;
  ownerLabel: string;
  prerequisiteLabel: string;
  curriculumName: string;
  pathwayName: string;
  type: RuleType;
  typeLabel: string;
  minimumGrade: string;
  minimumScore: string;
  groupCode: string;
  active: boolean;
};

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const emptyForm = (): PrerequisiteForm => ({
  curriculumSubjectId: "",
  prerequisiteSubjectId: "",
  minimumGrade: "",
  minimumScore: "",
  type: "prerequisite",
  groupCode: "",
  active: true,
});

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstLocalId(...values: unknown[]): string {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed && parsed !== "0") return parsed;
  }
  return "";
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (value: any) =>
  String(value || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  if (!row || row.isDeleted) return false;
  if (row.active === false) return false;
  const status = safeLower(row.status);
  return !["inactive", "deleted", "archived", "suspended"].includes(status);
};

const timeText = (value?: string | number | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return String(value);
  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(time));
  } catch {
    return String(value);
  }
};

const numberText = (value: any) =>
  new Intl.NumberFormat("en-GH", { maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );

function typeLabel(type?: string) {
  if (type === "corequisite") return "Corequisite";
  if (type === "recommended") return "Recommended";
  return "Prerequisite";
}

function typeIcon(type?: string) {
  if (type === "corequisite") return "🔄";
  if (type === "recommended") return "💡";
  return "🔐";
}

function typeTone(type?: string): "green" | "orange" | "purple" {
  if (type === "corequisite") return "purple";
  if (type === "recommended") return "orange";
  return "green";
}

function ruleShortText(row: PrerequisiteViewRow) {
  const parts = [
    row.typeLabel,
    row.minimumGrade ? `Grade ${row.minimumGrade}` : "",
    row.minimumScore ? `${row.minimumScore}%` : "",
    row.groupCode ? `Group ${row.groupCode}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "No condition set";
}

function groupedCounts<T>(rows: T[], labeler: (row: T) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = labeler(row) || "Unknown";
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function SubjectPrerequisitesWorkspace() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount() as any;
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();
  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedWorkspaceSchoolId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeSchoolId,
    activeSchool: activeSchool as any,
    settings: settings as any,
  });

  const branchId = selectedWorkspaceBranchId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeBranchId,
    activeBranch: activeBranch as any,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  useEffect(() => {
    setViewMode(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
  }, []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [curriculumFilter, setCurriculumFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");

  const [rules, setRules] = useState<SubjectPrerequisite[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<
    CurriculumSubject[]
  >([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const subjectSetupToolbar = {
    add: () => openCreate(),
    search: (query: string) => setSearch(query),
    filter: () => setFilterOpen(true),
    print: () => window.print(),
    more: () => setMoreOpen(true),
  };
  useRegisterBranchWorkspaceToolbar("setupWorkspace", subjectSetupToolbar);
  useRegisterBranchWorkspaceToolbar("subjectSetup", subjectSetupToolbar);
  const [selectedRule, setSelectedRule] = useState<PrerequisiteViewRow | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PrerequisiteForm>(emptyForm());
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(
      () =>
        setToast((current) => (current?.message === message ? null : current)),
      4200,
    );
  };

  const clearData = () => {
    setRules([]);
    setCurriculumSubjects([]);
    setCurriculums([]);
    setSubjects([]);
    setPathways([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [
        ruleRows,
        curriculumSubjectRows,
        curriculumRows,
        subjectRows,
        pathwayRows,
      ] = await Promise.all([
        tableSafe("subjectPrerequisites")?.toArray?.() || [],
        listActiveLocal("curriculumSubjects", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("curriculums", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("subjects", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("curriculumPathways", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
      ]);

      setRules(
        (ruleRows as SubjectPrerequisite[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort(
            (a: any, b: any) =>
              String(a.curriculumSubjectId || "").localeCompare(
                String(b.curriculumSubjectId || ""),
              ) || String(a.type || "").localeCompare(String(b.type || "")),
          ),
      );

      setCurriculumSubjects(
        (curriculumSubjectRows as CurriculumSubject[]).sort(
          (a: any, b: any) => {
            const byCurriculum = String(a.curriculumId || "").localeCompare(
              String(b.curriculumId || ""),
            );
            return (
              byCurriculum ||
              Number(a.orderIndex || 0) - Number(b.orderIndex || 0)
            );
          },
        ),
      );
      setCurriculums(
        (curriculumRows as Curriculum[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setSubjects(
        (subjectRows as Subject[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setPathways(
        (pathwayRows as CurriculumPathway[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
    } catch (error) {
      console.error("Failed to load subject prerequisites:", error);
      clearData();
      showToast("error", "Failed to load subject prerequisite rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    dataRevision,
  ]);

  const curriculumMap = useMemo(
    () => new Map(curriculums.map((row: any) => [idOf(row.id), row])),
    [curriculums],
  );
  const subjectMap = useMemo(
    () => new Map(subjects.map((row: any) => [idOf(row.id), row])),
    [subjects],
  );
  const pathwayMap = useMemo(
    () => new Map(pathways.map((row: any) => [idOf(row.id), row])),
    [pathways],
  );

  const curriculumSubjectOptions = useMemo<CurriculumSubjectOption[]>(() => {
    return curriculumSubjects
      .map((row: any) => {
        const id = idOf(row.id);
        if (!id) return undefined;
        const curriculum = curriculumMap.get(idOf(row.curriculumId)) as any;
        const subject = subjectMap.get(idOf(row.subjectId)) as any;
        const pathway = pathwayMap.get(idOf(row.pathwayId)) as any;
        const curriculumName = curriculum?.name || "Unknown curriculum";
        const subjectName = subject?.name || "Unknown subject";
        const subjectCode = subject?.code || "";
        const pathwayName = pathway?.name || "No pathway";
        return {
          id,
          row,
          curriculumId: idOf(row.curriculumId),
          subjectId: idOf(row.subjectId),
          pathwayId: idOf(row.pathwayId),
          curriculumName,
          subjectName,
          subjectCode,
          pathwayName,
          shortLabel: `${subjectName}${subjectCode ? ` (${subjectCode})` : ""}`,
          label: `${curriculumName} · ${subjectName}${subjectCode ? ` (${subjectCode})` : ""} · ${pathwayName}`,
        };
      })
      .filter(Boolean) as CurriculumSubjectOption[];
  }, [curriculumSubjects, curriculumMap, pathwayMap, subjectMap]);

  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjectOptions.map((row) => [row.id, row])),
    [curriculumSubjectOptions],
  );

  const selectedOwnerOption = useMemo(() => {
    const ownerId = idOf(form.curriculumSubjectId);
    return ownerId ? curriculumSubjectMap.get(ownerId) : undefined;
  }, [curriculumSubjectMap, form.curriculumSubjectId]);

  const prerequisiteOptions = useMemo(() => {
    if (!selectedOwnerOption) return curriculumSubjectOptions;
    return curriculumSubjectOptions.filter(
      (option) =>
        !sameId(option.id, selectedOwnerOption.id) &&
        sameId(option.curriculumId, selectedOwnerOption.curriculumId),
    );
  }, [curriculumSubjectOptions, selectedOwnerOption]);

  const groupCodes = useMemo(
    () =>
      Array.from(
        new Set(
          rules
            .map((row: any) => String(row.groupCode || "").trim())
            .filter(Boolean),
        ),
      ).sort(),
    [rules],
  );

  const viewRows = useMemo<PrerequisiteViewRow[]>(() => {
    return rules.map((row: any) => {
      const id = idOf(row.id);
      const owner = curriculumSubjectMap.get(idOf(row.curriculumSubjectId));
      const prerequisite = curriculumSubjectMap.get(
        idOf(row.prerequisiteSubjectId),
      );
      const type = (row.type || "prerequisite") as RuleType;
      return {
        id,
        row,
        owner,
        prerequisite,
        ownerLabel:
          owner?.shortLabel || `Curriculum Subject #${row.curriculumSubjectId}`,
        prerequisiteLabel:
          prerequisite?.shortLabel ||
          `Curriculum Subject #${row.prerequisiteSubjectId}`,
        curriculumName: owner?.curriculumName || "Unknown curriculum",
        pathwayName: owner?.pathwayName || "No pathway",
        type,
        typeLabel: typeLabel(type),
        minimumGrade: row.minimumGrade || "",
        minimumScore: row.minimumScore == null ? "" : String(row.minimumScore),
        groupCode: row.groupCode || "",
        active: isActiveRow(row),
      };
    });
  }, [curriculumSubjectMap, rules]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return viewRows.filter((rule) => {
      const haystack = [
        rule.ownerLabel,
        rule.prerequisiteLabel,
        rule.curriculumName,
        rule.pathwayName,
        rule.typeLabel,
        rule.minimumGrade,
        rule.minimumScore,
        rule.groupCode,
      ]
        .join(" ")
        .toLowerCase();
      const searchOk = !term || haystack.includes(term);
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" ? rule.active : !rule.active);
      const typeOk = typeFilter === "all" || rule.type === typeFilter;
      const curriculumOk =
        curriculumFilter === "all" ||
        sameId(rule.owner?.curriculumId, curriculumFilter);
      const groupOk = groupFilter === "all" || rule.groupCode === groupFilter;
      return searchOk && statusOk && typeOk && curriculumOk && groupOk;
    });
  }, [
    curriculumFilter,
    groupFilter,
    search,
    statusFilter,
    typeFilter,
    viewRows,
  ]);

  const activeRules = viewRows.filter((rule) => rule.active);
  const archivedRules = viewRows.length - activeRules.length;
  const prerequisiteRules = viewRows.filter(
    (rule) => rule.type === "prerequisite",
  ).length;
  const corequisiteRules = viewRows.filter(
    (rule) => rule.type === "corequisite",
  ).length;
  const recommendedRules = viewRows.filter(
    (rule) => rule.type === "recommended",
  ).length;
  const groupedRules = viewRows.filter((rule) => !!rule.groupCode).length;

  const activeFilterCount = useMemo(
    () =>
      [curriculumFilter, typeFilter, statusFilter, groupFilter].filter(
        (value) => value !== "all",
      ).length,
    [curriculumFilter, groupFilter, statusFilter, typeFilter],
  );
  const countsByCurriculum = useMemo(
    () => groupedCounts(viewRows, (row) => row.curriculumName),
    [viewRows],
  );
  const countsByType = useMemo(
    () => groupedCounts(viewRows, (row) => row.typeLabel),
    [viewRows],
  );
  const countsByStatus = useMemo(
    () =>
      groupedCounts(viewRows, (row) => (row.active ? "Active" : "Inactive")),
    [viewRows],
  );
  const countsByGroup = useMemo(
    () =>
      groupedCounts(
        viewRows.filter((row) => !!row.groupCode),
        (row) => row.groupCode,
      ),
    [viewRows],
  );

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const clearFilters = () => {
    setCurriculumFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setGroupFilter("all");
  };

  const updateForm = (patch: Partial<PrerequisiteForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const openCreate = () => {
    if (!requireTenant()) return;
    const firstOption = curriculumSubjectOptions[0];
    setSelectedRule(null);
    setForm({
      ...emptyForm(),
      curriculumSubjectId: firstOption ? String(firstOption.id) : "",
      prerequisiteSubjectId: "",
    });
    setModalOpen(true);
  };

  const openEdit = (row: PrerequisiteViewRow | SubjectPrerequisite) => {
    const item: any = "row" in row ? row.row : row;
    setSelectedRule(null);
    setForm({
      id: idOf(item.id),
      curriculumSubjectId: String(item.curriculumSubjectId || ""),
      prerequisiteSubjectId: String(item.prerequisiteSubjectId || ""),
      minimumGrade: item.minimumGrade || "",
      minimumScore: item.minimumScore == null ? "" : String(item.minimumScore),
      type: (item.type || "prerequisite") as RuleType,
      groupCode: item.groupCode || "",
      active: isActiveRow(item),
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!form.curriculumSubjectId)
      return "Select the subject being controlled.";
    if (!form.prerequisiteSubjectId)
      return "Select the required or related subject.";
    const ownerId = idOf(form.curriculumSubjectId);
    const requiredId = idOf(form.prerequisiteSubjectId);
    if (!ownerId || !requiredId) return "Select valid curriculum subjects.";
    if (ownerId === requiredId) return "A subject cannot require itself.";
    const owner = curriculumSubjectMap.get(ownerId);
    const required = curriculumSubjectMap.get(requiredId);
    if (!owner)
      return "The controlled subject is not available in this branch.";
    if (!required)
      return "The required subject is not available in this branch.";
    if (!sameId(owner.curriculumId, required.curriculumId))
      return "Subject prerequisite rules must stay inside the same curriculum.";
    if (form.minimumScore.trim()) {
      const parsed = Number(form.minimumScore);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
        return "Minimum score must be between 0 and 100.";
    }
    const duplicate = rules.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return (
        sameId(row.curriculumSubjectId, ownerId) &&
        sameId(row.prerequisiteSubjectId, requiredId) &&
        safeLower(row.type || "prerequisite") ===
          safeLower(form.type || "prerequisite") &&
        !row.isDeleted
      );
    });
    if (duplicate) return "This subject relationship already exists.";
    return "";
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!requireTenant()) return;
    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }
    try {
      setSaving(true);
      const existing = form.id
        ? rules.find((row: any) => sameId(row.id, form.id))
        : undefined;
      const payload: Partial<SubjectPrerequisite> = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        curriculumSubjectId: idOf(form.curriculumSubjectId),
        prerequisiteSubjectId: idOf(form.prerequisiteSubjectId),
        minimumGrade: form.minimumGrade.trim() || undefined,
        minimumScore:
          form.minimumScore.trim() === ""
            ? undefined
            : Number(form.minimumScore),
        type: form.type || "prerequisite",
        groupCode: form.groupCode.trim() || undefined,
        active: form.active,
        isDeleted: false,
      } as Partial<SubjectPrerequisite>;
      if (form.id && existing)
        await updateLocal("subjectPrerequisites", String(form.id), payload);
      else
        await createLocal(
          "subjectPrerequisites",
          payload as SubjectPrerequisite,
        );
      setModalOpen(false);
      showToast(
        "success",
        form.id
          ? "Subject prerequisite updated."
          : "Subject prerequisite created.",
      );
      await load();
    } catch (error) {
      console.error("Failed to save subject prerequisite:", error);
      showToast("error", "Failed to save subject prerequisite.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (row: PrerequisiteViewRow) => {
    const confirmed = window.confirm(
      `Archive this ${row.typeLabel.toLowerCase()} rule?\n\n${row.ownerLabel} → ${row.prerequisiteLabel}`,
    );
    if (!confirmed) return;
    await softDeleteLocal("subjectPrerequisites", row.id);
    setSelectedRule(null);
    showToast("success", "Subject prerequisite archived.");
    await load();
  };

  const duplicateRule = async (row: PrerequisiteViewRow) => {
    if (!requireTenant()) return;
    try {
      await createLocal("subjectPrerequisites", {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        curriculumSubjectId: idOf(row.row.curriculumSubjectId),
        prerequisiteSubjectId: idOf(row.row.prerequisiteSubjectId),
        minimumGrade: row.row.minimumGrade,
        minimumScore: row.row.minimumScore,
        type: row.row.type || "prerequisite",
        groupCode: row.row.groupCode ? `${row.row.groupCode} Copy` : undefined,
        active: false,
        isDeleted: false,
      } as SubjectPrerequisite);
      setSelectedRule(null);
      showToast("success", "Rule duplicated as inactive.");
      await load();
    } catch (error) {
      console.error("Failed to duplicate subject prerequisite:", error);
      showToast("error", "Failed to duplicate rule.");
    }
  };

  const toggleActive = async (row: PrerequisiteViewRow) => {
    await updateLocal("subjectPrerequisites", row.id, {
      active: !row.active,
      isDeleted: false,
    } as Partial<SubjectPrerequisite>);
    setSelectedRule(null);
    showToast("success", row.active ? "Rule deactivated." : "Rule activated.");
    await load();
  };

  if (loading || accountLoading || settingsLoading || contextLoading)
    return (
      <State
        primary={primary}
        title="Opening Subject Prerequisites..."
        text="Checking curriculums, curriculum subjects, pathways and prerequisite rules."
      />
    );
  if (!authenticated || !accountId)
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing subject prerequisites."
      />
    );

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Subject prerequisite rules belong to one active school branch.</p>
          <button
            type="button"
            className="ba-state-button"
            onClick={() => router.push("/account")}
          >
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </section>
      )}

      <section
        className="ba-search-card"
        aria-label="Subject prerequisite search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject prerequisites..."
            aria-label="Search subject prerequisites"
          />
        </label>
        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add subject prerequisite"
        >
          +
        </button>
        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>
        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {!curriculumSubjectOptions.length && (
        <section className="ba-warning">
          Add curriculum subjects first. Prerequisite rules must connect
          subjects that already exist inside a curriculum.
        </section>
      )}

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {curriculumFilter !== "all" && (
            <button type="button" onClick={() => setCurriculumFilter("all")}>
              Curriculum:{" "}
              {(curriculumMap.get(idOf(curriculumFilter)) as any)?.name ||
                curriculumFilter}{" "}
              ×
            </button>
          )}
          {typeFilter !== "all" && (
            <button type="button" onClick={() => setTypeFilter("all")}>
              Type: {typeLabel(typeFilter)} ×
            </button>
          )}
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusFilter === "active" ? "Active" : "Inactive"} ×
            </button>
          )}
          {groupFilter !== "all" && (
            <button type="button" onClick={() => setGroupFilter("all")}>
              Group: {groupFilter} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Rules by Curriculum"
            rows={countsByCurriculum}
            total={viewRows.length}
          />
          <AnalysisCard
            title="Rules by Type"
            rows={countsByType}
            total={viewRows.length}
          />
          <AnalysisCard
            title="Rules by Status"
            rows={countsByStatus}
            total={viewRows.length}
          />
          <AnalysisCard
            title="Grouped Rules"
            rows={countsByGroup}
            total={groupedRules}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{filteredRows.length}</strong>
            <p>
              {activeRules.length} active · {archivedRules} inactive ·{" "}
              {prerequisiteRules} prerequisites · {corequisiteRules}{" "}
              corequisites · {recommendedRules} recommended.
            </p>
          </article>
        </section>
      )}
      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          openEdit={openEdit}
          duplicateRule={duplicateRule}
          archive={archive}
          toggleActive={toggleActive}
        />
      )}
      {viewMode === "cards" && (
        <section className="ba-list prerequisite-list">
          {filteredRows.map((rule) => (
            <RuleListRow
              key={String(rule.id)}
              rule={rule}
              onOpen={() => setSelectedRule(rule)}
            />
          ))}
          {!filteredRows.length && (
            <Empty
              icon="🔗"
              title="No prerequisite rules found"
              text="Create rules that connect subjects as prerequisites, corequisites or recommended preparation."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          curriculums={curriculums}
          groupCodes={groupCodes}
          curriculumFilter={curriculumFilter}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          groupFilter={groupFilter}
          setCurriculumFilter={setCurriculumFilter}
          setTypeFilter={setTypeFilter}
          setStatusFilter={setStatusFilter}
          setGroupFilter={setGroupFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
      {selectedRule && (
        <ActionSheet
          rule={selectedRule}
          openEdit={openEdit}
          duplicateRule={duplicateRule}
          archive={archive}
          toggleActive={toggleActive}
          onClose={() => setSelectedRule(null)}
        />
      )}
      {modalOpen && (
        <RuleModal
          form={form}
          saving={saving}
          curriculumSubjectOptions={curriculumSubjectOptions}
          prerequisiteOptions={prerequisiteOptions}
          selectedOwnerOption={selectedOwnerOption}
          updateForm={updateForm}
          setModalOpen={setModalOpen}
          save={save}
        />
      )}
    </main>
  );
}

function State({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function RuleListRow({
  rule,
  onOpen,
}: {
  rule: PrerequisiteViewRow;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="student-row prerequisite-row"
      onClick={onOpen}
    >
      <span className={`prerequisite-icon ${rule.type}`}>
        {typeIcon(rule.type)}
      </span>
      <span className="student-main">
        <strong>{rule.ownerLabel}</strong>
        <small>
          {rule.typeLabel}: {rule.prerequisiteLabel}
        </small>
        <em>
          {rule.curriculumName} · {rule.pathwayName} · {ruleShortText(rule)}
        </em>
      </span>
      <span className="student-side">
        <span
          className={`status-dot-mini ${rule.active ? "green" : "gray"}`}
          title={rule.active ? "Active" : "Inactive"}
          aria-label={rule.active ? "Active" : "Inactive"}
        />
        <i>⋯</i>
      </span>
    </button>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function FilterSheet(props: {
  curriculums: Curriculum[];
  groupCodes: string[];
  curriculumFilter: string;
  typeFilter: TypeFilter;
  statusFilter: StatusFilter;
  groupFilter: string;
  setCurriculumFilter: (value: string) => void;
  setTypeFilter: (value: TypeFilter) => void;
  setStatusFilter: (value: StatusFilter) => void;
  setGroupFilter: (value: string) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <EleeveonFullscreenOverlay><div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>
              Filter subject prerequisite rules by curriculum, type, status and
              group.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close filters"
          >
            ✕
          </button>
        </div>
        <div className="ba-form compact">
          <label>
            <span>Curriculum</span>
            <select
              value={props.curriculumFilter}
              onChange={(event) =>
                props.setCurriculumFilter(event.target.value)
              }
            >
              <option value="all">All curriculums</option>
              {props.curriculums.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Rule Type</span>
            <select
              value={props.typeFilter}
              onChange={(event) =>
                props.setTypeFilter(event.target.value as TypeFilter)
              }
            >
              <option value="all">All rule types</option>
              <option value="prerequisite">Prerequisite</option>
              <option value="corequisite">Corequisite</option>
              <option value="recommended">Recommended</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={props.statusFilter}
              onChange={(event) =>
                props.setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive / Archived</option>
            </select>
          </label>
          <label>
            <span>Group Code</span>
            <select
              value={props.groupFilter}
              onChange={(event) => props.setGroupFilter(event.target.value)}
            >
              <option value="all">All groups</option>
              {props.groupCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ba-sheet-actions">
          <button type="button" onClick={props.clearFilters}>
            Clear
          </button>
          <button type="button" className="primary" onClick={props.onClose}>
            Apply
          </button>
        </div>
      </section>
    </div></EleeveonFullscreenOverlay>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <EleeveonFullscreenOverlay><div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views are here so the main page stays simple.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="ba-menu-list">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
          >
            <span>☰</span>
            <b>List view</b>
            <small>Compact prerequisite rule cards</small>
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense records for laptop work</small>
          </button>
          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Curriculum, type, status and group summaries</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch rules</small>
          </button>
        </div>
      </section>
    </div></EleeveonFullscreenOverlay>
  );
}

function ActionSheet({
  rule,
  openEdit,
  duplicateRule,
  archive,
  toggleActive,
  onClose,
}: {
  rule: PrerequisiteViewRow;
  openEdit: (row: PrerequisiteViewRow | SubjectPrerequisite) => void;
  duplicateRule: (row: PrerequisiteViewRow) => void | Promise<void>;
  archive: (row: PrerequisiteViewRow) => void | Promise<void>;
  toggleActive: (row: PrerequisiteViewRow) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <EleeveonFullscreenOverlay><div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{rule.ownerLabel}</h2>
            <p>
              {rule.typeLabel}: {rule.prerequisiteLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rule actions"
          >
            ✕
          </button>
        </div>
        <div className="student-detail-strip">
          <span>
            <b>Type</b>
            {rule.typeLabel}
          </span>
          <span>
            <b>Grade</b>
            {rule.minimumGrade || "—"}
          </span>
          <span>
            <b>Score</b>
            {rule.minimumScore || "—"}
          </span>
        </div>
        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(rule)}>
            <span>✎</span>
            <b>Edit rule</b>
            <small>Update subject relationship, type and conditions</small>
          </button>
          <button type="button" onClick={() => toggleActive(rule)}>
            <span>{rule.active ? "⏸" : "▶"}</span>
            <b>{rule.active ? "Deactivate" : "Activate"}</b>
            <small>
              {rule.active
                ? "Keep rule but stop applying it"
                : "Make rule available again"}
            </small>
          </button>
          <button type="button" onClick={() => duplicateRule(rule)}>
            <span>⧉</span>
            <b>Duplicate rule</b>
            <small>Create an inactive copy for adjustment</small>
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => archive(rule)}
          >
            <span>⌫</span>
            <b>Archive</b>
            <small>Soft delete this prerequisite rule locally</small>
          </button>
        </div>
      </section>
    </div></EleeveonFullscreenOverlay>
  );
}

function TableView({
  rows,
  openEdit,
  duplicateRule,
  archive,
  toggleActive,
}: {
  rows: PrerequisiteViewRow[];
  openEdit: (row: PrerequisiteViewRow | SubjectPrerequisite) => void;
  duplicateRule: (row: PrerequisiteViewRow) => void | Promise<void>;
  archive: (row: PrerequisiteViewRow) => void | Promise<void>;
  toggleActive: (row: PrerequisiteViewRow) => void | Promise<void>;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rules ({rows.length})</th>
              <th>Requires / Related</th>
              <th>Curriculum</th>
              <th>Pathway</th>
              <th>Type</th>
              <th>Minimum</th>
              <th>Group</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rule) => {
              const row: any = rule.row;
              return (
                <tr key={String(rule.id)}>
                  <td>
                    <strong>{rule.ownerLabel}</strong>
                    <span>Controlled subject</span>
                  </td>
                  <td>
                    {rule.prerequisiteLabel}
                    <span>Required / related subject</span>
                  </td>
                  <td>{rule.curriculumName}</td>
                  <td>{rule.pathwayName}</td>
                  <td>
                    <Chip tone={typeTone(rule.type)}>{rule.typeLabel}</Chip>
                  </td>
                  <td>
                    {rule.minimumGrade || rule.minimumScore ? (
                      <span>
                        {rule.minimumGrade || "—"} · {rule.minimumScore || "—"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{rule.groupCode || "—"}</td>
                  <td>
                    <Chip tone={rule.active ? "green" : "gray"}>
                      {rule.active ? "Active" : "Inactive"}
                    </Chip>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(rule)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => toggleActive(rule)}>
                        {rule.active ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" onClick={() => duplicateRule(rule)}>
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="ba-delete"
                        onClick={() => archive(rule)}
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="ba-empty-table">
            No subject prerequisite rule matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function RuleModal(props: {
  form: PrerequisiteForm;
  saving: boolean;
  curriculumSubjectOptions: CurriculumSubjectOption[];
  prerequisiteOptions: CurriculumSubjectOption[];
  selectedOwnerOption?: CurriculumSubjectOption;
  updateForm: (patch: Partial<PrerequisiteForm>) => void;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void | Promise<void>;
}) {
  const selectedType = props.form.type || "prerequisite";
  return (
    <EleeveonFullscreenOverlay><div className="ba-modal-backdrop" role="dialog" aria-modal="true">
      <section className="ba-modal">
        <div className="ba-sheet-head">
          <div>
            <h2>{props.form.id ? "Edit Subject Rule" : "Add Subject Rule"}</h2>
            <p>
              Define prerequisite, corequisite or recommended subject
              relationships.
            </p>
          </div>
          <button
            type="button"
            onClick={() => props.setModalOpen(false)}
            aria-label="Close form"
          >
            ✕
          </button>
        </div>
        <form className="ba-form compact" onSubmit={props.save}>
          <label>
            <span>Subject being controlled</span>
            <select
              value={props.form.curriculumSubjectId}
              onChange={(event) =>
                props.updateForm({
                  curriculumSubjectId: event.target.value,
                  prerequisiteSubjectId: "",
                })
              }
              required
            >
              <option value="">Select curriculum subject</option>
              {props.curriculumSubjectOptions.map((option) => (
                <option key={String(option.id)} value={String(option.id)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Required / related subject</span>
            <select
              value={props.form.prerequisiteSubjectId}
              onChange={(event) =>
                props.updateForm({ prerequisiteSubjectId: event.target.value })
              }
              required
            >
              <option value="">Select required subject</option>
              {props.prerequisiteOptions.map((option) => (
                <option key={String(option.id)} value={String(option.id)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Rule type</span>
            <select
              value={selectedType}
              onChange={(event) =>
                props.updateForm({ type: event.target.value as RuleType })
              }
            >
              <option value="prerequisite">Prerequisite</option>
              <option value="corequisite">Corequisite</option>
              <option value="recommended">Recommended</option>
            </select>
          </label>
          <label>
            <span>Group code</span>
            <input
              value={props.form.groupCode}
              onChange={(event) =>
                props.updateForm({ groupCode: event.target.value })
              }
              placeholder="Optional e.g. ALT-A"
            />
          </label>
          <label>
            <span>Minimum grade</span>
            <input
              value={props.form.minimumGrade}
              onChange={(event) =>
                props.updateForm({ minimumGrade: event.target.value })
              }
              placeholder="e.g. C6, B3, Pass"
            />
          </label>
          <label>
            <span>Minimum score</span>
            <input
              type="number"
              value={props.form.minimumScore}
              onChange={(event) =>
                props.updateForm({ minimumScore: event.target.value })
              }
              placeholder="e.g. 50"
              min="0"
              max="100"
            />
          </label>
          {props.selectedOwnerOption && (
            <section className="ba-form-note">
              <strong>Curriculum locked:</strong> related subjects are limited
              to {props.selectedOwnerOption.curriculumName}.
            </section>
          )}
          <label className="ba-check">
            <input
              type="checkbox"
              checked={props.form.active}
              onChange={(event) =>
                props.updateForm({ active: event.target.checked })
              }
            />
            <span>Active rule</span>
          </label>
          <div className="ba-modal-actions">
            <button type="button" onClick={() => props.setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={props.saving}>
              {props.saving
                ? "Saving..."
                : props.form.id
                  ? "Save Changes"
                  : "Create Rule"}
            </button>
          </div>
        </form>
      </section>
    </div></EleeveonFullscreenOverlay>
  );
}

function AnalysisCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; count: number }[];
  total: number;
}) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{numberText(total)}</strong>
      <div className="ba-analysis-bars">
        {rows.slice(0, 6).map((row) => {
          const percent = total ? Math.round((row.count / total) * 100) : 0;
          return (
            <div key={row.label} className="ba-analysis-row">
              <p>
                <b>{row.label}</b>
                <em>{row.count}</em>
              </p>
              <div className="ba-bar">
                <i style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
        {!rows.length && <p className="ba-analysis-empty">No data yet.</p>}
      </div>
    </article>
  );
}

const css = `
@keyframes baSpin{to{transform:rotate(360deg)}}
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page input:focus,.ba-page select:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.ba-warning,.student-row,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:baSpin .8s linear infinite}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}.ba-toast{position:sticky;top:8px;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:10px;max-width:1180px;margin:0 auto 8px;padding:10px 12px;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10));background:var(--card-bg,var(--surface,#fff));box-shadow:0 16px 36px rgba(15,23,42,.08);font-size:12px;font-weight:900}.ba-toast.success{color:#16a34a}.ba-toast.error{color:#dc2626}.ba-toast.info{color:var(--ba-primary)}.ba-toast button{width:28px;height:28px;border:0;border-radius:999px;background:color-mix(in srgb,currentColor 10%,transparent);color:currentColor;font-weight:1000;cursor:pointer}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) 42px 42px 42px;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:20px;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-warning{margin-top:8px;padding:10px 12px;border-radius:18px;background:rgba(245,158,11,.12);color:#92400e;border-color:rgba(245,158,11,.22);font-size:12px;font-weight:800;line-height:1.5}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-list{display:grid;gap:8px;margin-top:10px}.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease);color:var(--text,#111827)}.student-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}.prerequisite-icon{width:48px;height:48px;border-radius:18px;display:grid;place-items:center;background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));color:var(--ba-primary);font-size:20px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.08)}.prerequisite-icon.corequisite{background:rgba(147,51,234,.12);color:#7e22ce}.prerequisite-icon.recommended{background:rgba(245,158,11,.14);color:#b45309}.student-main,.student-main strong,.student-main small,.student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.student-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.student-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.student-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.student-side{display:grid;justify-items:end;gap:5px}.student-side i{font-style:normal;font-weight:1000;color:var(--muted,#64748b)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.green{background:#22c55e}.status-dot-mini.gray{background:var(--muted,#64748b)}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-table-card{margin-top:10px;border-radius:24px;overflow:hidden}.ba-table-scroll{width:100%;overflow:auto}table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:middle}th{position:sticky;top:0;z-index:1;background:var(--table-header-bg,color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)));color:var(--table-header-text,var(--text,#111827));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}td{font-size:13px;color:var(--text,#111827)}td strong,td span{display:block}.ba-table-actions{display:flex;align-items:center;gap:6px;white-space:nowrap}.ba-table-actions button{min-height:32px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 10px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:900;cursor:pointer}.ba-table-actions .ba-delete{border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#dc2626}.ba-empty-table{padding:18px;text-align:center;color:var(--muted,#64748b);font-size:13px;font-weight:800}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis{padding:12px;border-radius:22px}.ba-analysis>span{display:block;color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis>strong{display:block;margin-top:6px;font-size:28px;font-weight:1000;letter-spacing:-.06em}.ba-analysis>p{margin:6px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:800;line-height:1.5}.ba-analysis-bars{display:grid;gap:8px;margin-top:10px}.ba-analysis-row p{display:flex;justify-content:space-between;gap:10px;margin:0 0 4px}.ba-analysis-row b,.ba-analysis-row em{font-size:11px;font-weight:900;font-style:normal}.ba-bar{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);overflow:hidden}.ba-bar i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-analysis-empty{margin:0;color:var(--muted,#64748b);font-size:12px}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:210px;margin-top:10px;padding:22px;border-radius:24px;border-style:dashed;text-align:center}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop,.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ba-sheet,.ba-modal{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.ba-sheet.small{width:min(520px,100%)}.ba-modal{width:min(680px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.ba-sheet-head,.ba-sheet-profile{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ba-sheet-head h2,.ba-sheet-profile h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p,.ba-sheet-profile p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ba-sheet-head button,.ba-sheet-profile button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.ba-form.compact{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ba-form label{display:grid;gap:6px;min-width:0}.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-form-note{padding:10px 12px;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 9%,transparent);border:1px solid color-mix(in srgb,var(--ba-primary) 16%,transparent);font-size:12px;line-height:1.5;color:var(--text,#111827)}.ba-check{display:flex!important;align-items:center!important;gap:9px!important;min-height:44px;padding:10px 12px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 6%,transparent)}.ba-check input{width:auto;min-height:auto}.ba-check span{text-transform:none!important;letter-spacing:0!important;font-size:12px!important;color:var(--text,#111827)!important}.ba-sheet-actions,.ba-modal-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ba-modal-actions button,.ba-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-modal-actions button.primary,.ba-sheet-actions button.primary{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}.ba-modal-actions button:disabled{opacity:.65;cursor:not-allowed}.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.student-detail-strip span{display:grid;gap:4px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.student-detail-strip b{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ba-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b,.ba-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-menu-list button b{font-size:13px;font-weight:1000}.ba-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 8%,var(--surface,#fff))}.ba-menu-list button.danger span{background:rgba(239,68,68,.10);color:#dc2626}.ba-menu-list button.danger b{color:#dc2626}@media (min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ba-search-card{grid-template-columns:minmax(0,1fr) 48px 48px 48px}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop,.ba-modal-backdrop{place-items:center;padding:18px}.ba-sheet,.ba-modal{border-radius:28px;padding:18px}.ba-form.compact{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form-note,.ba-check,.ba-modal-actions{grid-column:1/-1}}@media (min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ba-search-card,.ba-list,.ba-table-card,.ba-analysis-grid,.ba-filter-chips,.ba-warning{max-width:1180px;margin-left:auto;margin-right:auto}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ba-current-filter{grid-column:span 2}}@media (max-width:520px){.ba-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ba-search-card{grid-template-columns:minmax(0,1fr) 40px 40px 40px;gap:6px;padding:6px;border-radius:22px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:40px;height:40px}.student-detail-strip{grid-template-columns:1fr}.ba-sheet-actions,.ba-modal-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ba-sheet-actions button,.ba-modal-actions button{width:100%}}
@media (min-width:980px){
  .ba-modal-backdrop,
  .ba-sheet-backdrop{
    top:var(--eds-shell-top-offset,0px);
    right:0;
    bottom:0;
    left:var(--portal-content-left,0px);
    width:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }
  .ba-modal,
  .ba-sheet{
    min-width:0;
    max-width:calc(100vw - var(--portal-content-left,0px) - 20px);
  }
}

`;

  return SubjectPrerequisitesWorkspace;
})();

const ClassSubjectsModule = (() => {
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type StatusFilter = "all" | "active" | "inactive" | "locked" | "unassigned";
type SubjectTypeFilter = "all" | CurriculumSubjectType;
type CameraField = "photo" | "bannerImage";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstPermanentId(...values: unknown[]): string {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed) return parsed;
  }

  return "";
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstPermanentId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstPermanentId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

type SettingsLike = {
  currentAcademicStructureId?: unknown;
  currentAcademicPeriodId?: unknown;
};

function readOptionalPositiveId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readClassSubjectSettings(value: unknown): SettingsLike | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  return {
    currentAcademicStructureId: record.currentAcademicStructureId,
    currentAcademicPeriodId: record.currentAcademicPeriodId,
  };
}

type FormState = {
  id?: string;
  classId: string;
  subjectId: string;
  curriculumSubjectId: string;
  academicStructureId: string;
  academicPeriodId: string;
  teacherId: string;
  name: string;
  code: string;
  credits: string;
  contactHours: string;
  orderIndex: string;
  type: CurriculumSubjectType;
  compulsory: boolean;
  elective: boolean;
  photo: string;
  photoMediaId?: string;
  bannerImage: string;
  bannerImageMediaId?: string;
  active: boolean;
  locked: boolean;
};

type ClassSubjectView = {
  id: string;
  row: ClassSubject;
  photoUrl?: string;
  bannerImageUrl?: string;
  className: string;
  subjectName: string;
  subjectCode: string;
  teacherName: string;
  teacherPhoto?: string;
  structureName: string;
  periodName: string;
  curriculumLabel: string;
  applicabilityCount: number;
  entryCount: number;
  active: boolean;
  locked: boolean;
};

type ClassSubjectClassView = {
  id: string;
  row: Class;
  name: string;
  code: string;
  level: string;
  subjectCount: number;
  activeSubjectCount: number;
  unassignedCount: number;
  lockedCount: number;
  rulesCount: number;
  entriesCount: number;
  updatedAt?: number | string | null;
};

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const cleanId = (value: unknown): string => {
  const parsed = idOf(value);
  return parsed && parsed !== "0" && parsed !== "undefined" && parsed !== "null"
    ? parsed
    : "";
};

const savedEntityId = (result: unknown, fallback?: unknown): string => {
  if (typeof result === "string" || typeof result === "number") {
    return cleanId(result);
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    return cleanId(
      record.id ||
        record.localId ||
        record.cloudId ||
        record.entityId ||
        record.recordId,
    );
  }

  return cleanId(fallback);
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (value: any) =>
  String(value || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];

const CLASS_SUBJECT_MEDIA_OWNER_TABLE = "classSubjects";
const CLASS_SUBJECT_MEDIA_ENTITY_LABEL = "Class Subject";
const CLASS_SUBJECT_BANNER_FIELD_KEY = "bannerImage";

const makeEmptyForm = (settings?: unknown): FormState => {
  const resolvedSettings = readClassSubjectSettings(settings);

  const currentAcademicStructureId = readOptionalPositiveId(
    resolvedSettings?.currentAcademicStructureId,
  );

  const currentAcademicPeriodId = readOptionalPositiveId(
    resolvedSettings?.currentAcademicPeriodId,
  );

  return {
    classId: "",
    subjectId: "",
    curriculumSubjectId: "",
    academicStructureId: currentAcademicStructureId
      ? String(currentAcademicStructureId)
      : "",
    academicPeriodId: currentAcademicPeriodId
      ? String(currentAcademicPeriodId)
      : "",
    teacherId: "",
    name: "",
    code: "",
    credits: "",
    contactHours: "",
    orderIndex: "",
    type: "core" as CurriculumSubjectType,
    compulsory: true,
    elective: false,
    photo: "",
    photoMediaId: undefined,
    bannerImage: "",
    bannerImageMediaId: undefined,
    active: true,
    locked: false,
  };
};

const isActiveRow = (row: any) => !row?.isDeleted && row?.active !== false;

const mediaKey = (classSubjectId: string, field: CameraField) =>
  `${CLASS_SUBJECT_MEDIA_OWNER_TABLE}:${classSubjectId}:${field}`;

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
};

const typeLabel = (value?: string) => {
  if (!value) return "Core";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

function typeTone(
  value?: string,
): "green" | "blue" | "purple" | "orange" | "gray" {
  if (value === "elective") return "blue";
  if (value === "optional") return "orange";
  if (value === "core") return "green";
  return "gray";
}

function statusTone(
  item: ClassSubjectView,
): "green" | "red" | "orange" | "gray" {
  if (item.locked) return "orange";
  return item.active ? "green" : "red";
}

const timeText = (value?: string | number | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
};

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Avatar({
  name,
  photo,
  primary,
}: {
  name: string;
  photo?: string;
  primary: string;
}) {
  return (
    <div
      className="ba-avatar"
      style={{
        background: photo
          ? `url(${photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {!photo &&
        String(name || "CS")
          .slice(0, 2)
          .toUpperCase()}
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function ClassSubjectsWorkspace() {
  const dataRevision = useBranchTableRevision([
    "classSubjects",
    "classes",
    "subjects",
    "teachers",
    "academicStructures",
    "academicPeriods",
    "curriculumSubjects",
    "assessmentApplicabilities",
    "assessmentEntries",
    "mediaAssets",
    "mediaBlobs",
  ]);
  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const workspace = useBranchWorkspaceScope();
  const {
    accountId,
    schoolId,
    branchId,
    membership: activeMembership,
    authenticated,
    restoring: accountLoading,
    branchLoading: contextLoading,
    ready: workspaceReady,
    error: workspaceError,
  } = workspace;

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ClassSubject[]>([]);
  const resolvedMediaById = useEntityMediaUrls({
    accountId,
    ownerTable: "classSubjects",
    rows: rows,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "bannerImage", mediaIdKey: "bannerImageMediaId" },
    ],
  });
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<
    AcademicStructure[]
  >([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<
    CurriculumSubject[]
  >([]);
  const [applicabilities, setApplicabilities] = useState<
    AssessmentApplicability[]
  >([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<
    Record<string, string>
  >({});

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  useEffect(() => {
    setViewMode(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
  }, []);
  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState("all");
  const [filterStructureId, setFilterStructureId] = useState("all");
  const [filterPeriodId, setFilterPeriodId] = useState("all");
  const [filterTeacherId, setFilterTeacherId] = useState("all");
  const [filterType, setFilterType] = useState<SubjectTypeFilter>("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const subjectSetupToolbar = {
    add: () => openCreate(),
    search: (query: string) => setSearch(query),
    filter: () => setFilterOpen(true),
    print: () => window.print(),
    more: () => setMoreOpen(true),
  };
  useRegisterBranchWorkspaceToolbar("setupWorkspace", subjectSetupToolbar);
  useRegisterBranchWorkspaceToolbar("subjectSetup", subjectSetupToolbar);
  const [selectedItem, setSelectedItem] = useState<ClassSubjectView | null>(
    null,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => makeEmptyForm(settings));
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  const mediaSessionKeyRef = useRef(
    createMediaSessionKey(CLASS_SUBJECT_MEDIA_OWNER_TABLE),
  );
  const uploadedMediaAssetIds = useRef<Partial<Record<CameraField, string>>>(
    {},
  );
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraField, setCameraField] = useState<CameraField>("photo");
  const [cameraFacing, setCameraFacing] =
    useState<CameraFacingMode>("environment");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraCapturing, setCameraCapturing] = useState(false);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    // Missing branch workspace is handled locally so the selected-role flow is not broken.
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(
      () =>
        setToast((current) => (current?.message === message ? null : current)),
      4200,
    );
  };

  const stopCurrentCamera = () => {
    stopCameraStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  };

  const clearData = () => {
    Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
    setRows([]);
    setClasses([]);
    setSubjects([]);
    setTeachers([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setCurriculumSubjects([]);
    setApplicabilities([]);
    setEntries([]);
    setMediaPreviewUrls({});
  };

  const resolveClassSubjectMediaUrls = async (
    classSubjectRows: ClassSubject[],
  ) => {
    const next: Record<string, string> = {};

    await Promise.all(
      classSubjectRows.map(async (classSubject: any) => {
        const classSubjectId = idOf(classSubject.id);
        if (!classSubjectId) return;

        const resolveOwnedAssetUrl = async (
          fieldKey: string,
          fallbackMediaId?: string | string | null,
        ) => {
          const ownedAsset = await getOwnerFieldMediaAsset({
            accountId: accountId || undefined,
            ownerTable: CLASS_SUBJECT_MEDIA_OWNER_TABLE,
            ownerId: classSubjectId,

            fieldKey,
          });

          if (ownedAsset?.id) {
            const url = await getMediaObjectUrl(String(ownedAsset.id));
            if (url) return url;
          }

          const fallbackId = idOf(fallbackMediaId);
          if (!fallbackId) return "";

          const fallbackAsset =
            await tableSafe("mediaAssets")?.get?.(fallbackId);
          const belongsToThisRecord =
            fallbackAsset &&
            !fallbackAsset.isDeleted &&
            fallbackAsset.active !== false &&
            fallbackAsset.accountId === accountId &&
            fallbackAsset.ownerTable === CLASS_SUBJECT_MEDIA_OWNER_TABLE &&
            fallbackAsset.fieldKey === fieldKey &&
            sameId(fallbackAsset.ownerId, classSubjectId);

          if (!belongsToThisRecord) return "";
          return getMediaObjectUrl(fallbackId);
        };

        try {
          const photoUrl = await resolveOwnedAssetUrl(
            MediaFieldKeys.PHOTO,
            classSubject.photoMediaId,
          );
          if (photoUrl) next[mediaKey(classSubjectId, "photo")] = photoUrl;

          const bannerUrl = await resolveOwnedAssetUrl(
            CLASS_SUBJECT_BANNER_FIELD_KEY,
            classSubject.bannerImageMediaId,
          );
          if (bannerUrl)
            next[mediaKey(classSubjectId, "bannerImage")] = bannerUrl;
        } catch (error) {
          console.error(
            "Failed to resolve class subject media:",
            classSubjectId,
            error,
          );
        }
      }),
    );

    setMediaPreviewUrls((current) => {
      Object.values(current).forEach((url) => {
        if (!(Object.values(next) as string[]).includes(url as string))
          revokeMediaObjectUrl(url as string);
      });
      return next;
    });
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [
        classRows,
        subjectRows,
        teacherRows,
        structureRows,
        periodRows,
        curriculumRows,
        classSubjectRows,
        applicabilityRows,
        entryRows,
      ] = await Promise.all([
        listActiveLocal("classes", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("subjects", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("teachers", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("academicStructures", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("academicPeriods", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("curriculumSubjects", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        tableSafe("classSubjects")?.toArray?.() || [],
        tableSafe("assessmentApplicabilities")?.toArray?.() || [],
        tableSafe("assessmentEntries")?.toArray?.() || [],
      ]);

      const scopedClassSubjects = (classSubjectRows as ClassSubject[])
        .filter((r) => sameTenant(r as TenantRow))
        .sort(
          (a: any, b: any) =>
            Number(b.updatedAt || 0) - Number(a.updatedAt || 0),
        );

      setClasses(
        (classRows as Class[])
          .filter((r) => sameTenant(r as TenantRow) && isActiveRow(r))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setSubjects(
        (subjectRows as Subject[])
          .filter((r) => sameTenant(r as TenantRow) && isActiveRow(r))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setTeachers(
        (teacherRows as Teacher[])
          .filter((r) => sameTenant(r as TenantRow) && isActiveRow(r))
          .sort((a: any, b: any) =>
            String(a.fullName || "").localeCompare(String(b.fullName || "")),
          ),
      );
      setAcademicStructures(
        (structureRows as AcademicStructure[])
          .filter((r) => sameTenant(r as TenantRow) && isActiveRow(r))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setAcademicPeriods(
        (periodRows as AcademicPeriod[])
          .filter((r) => sameTenant(r as TenantRow) && isActiveRow(r))
          .sort(
            (a: any, b: any) => Number(a.order || 0) - Number(b.order || 0),
          ),
      );
      setCurriculumSubjects(
        (curriculumRows as CurriculumSubject[])
          .filter((r) => sameTenant(r as TenantRow) && isActiveRow(r))
          .sort(
            (a: any, b: any) =>
              Number(a.orderIndex || 0) - Number(b.orderIndex || 0),
          ),
      );
      setRows(scopedClassSubjects);
      await resolveClassSubjectMediaUrls(scopedClassSubjects);
      setApplicabilities(
        (applicabilityRows as AssessmentApplicability[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
      setEntries(
        (entryRows as AssessmentEntry[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
    } catch (error) {
      console.error("Failed to load class subjects:", error);
      clearData();
      showToast("error", "Failed to load class subjects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    dataRevision,
  ]);

  useEffect(() => {
    return () => {
      stopCurrentCamera();
    };
    // Camera shutdown only. Media URLs are managed by the media resolver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;

    const startCamera = async () => {
      try {
        setCameraStarting(true);
        stopCurrentCamera();

        const stream = await openCameraStream({
          facingMode: cameraFacing,
          width: 1280,
          height: 720,
        });

        if (cancelled) {
          stopCameraStream(stream);
          return;
        }

        cameraStreamRef.current = stream;

        if (cameraVideoRef.current) {
          await attachCameraStreamToVideo(cameraVideoRef.current, stream);
        }
      } catch (error: any) {
        console.error("Failed to open class subject camera:", error);
        showToast("error", error?.message || getCameraUnavailableMessage());
        setCameraOpen(false);
      } finally {
        if (!cancelled) setCameraStarting(false);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCurrentCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, cameraFacing]);

  const classMap = useMemo(
    () => new Map(classes.map((r: any) => [idOf(r.id), r])),
    [classes],
  );
  const subjectMap = useMemo(
    () => new Map(subjects.map((r: any) => [idOf(r.id), r])),
    [subjects],
  );
  const teacherMap = useMemo(
    () => new Map(teachers.map((r: any) => [idOf(r.id), r])),
    [teachers],
  );
  const structureMap = useMemo(
    () => new Map(academicStructures.map((r: any) => [idOf(r.id), r])),
    [academicStructures],
  );
  const periodMap = useMemo(
    () => new Map(academicPeriods.map((r: any) => [idOf(r.id), r])),
    [academicPeriods],
  );
  const curriculumMap = useMemo(
    () => new Map(curriculumSubjects.map((r: any) => [idOf(r.id), r])),
    [curriculumSubjects],
  );

  const availablePeriods = useMemo(() => {
    return academicPeriods.filter(
      (period: any) =>
        !form.academicStructureId ||
        sameId(period.academicStructureId, form.academicStructureId),
    );
  }, [academicPeriods, form.academicStructureId]);

  const availableCurriculumSubjects = useMemo(() => {
    return curriculumSubjects.filter(
      (row: any) => !form.subjectId || sameId(row.subjectId, form.subjectId),
    );
  }, [curriculumSubjects, form.subjectId]);

  const applicabilityCounts = useMemo(() => {
    const map = new Map<string, number>();
    applicabilities.forEach((row: any) => {
      const classSubjectId = idOf(row.classSubjectId);
      if (classSubjectId)
        map.set(classSubjectId, (map.get(classSubjectId) || 0) + 1);
    });
    return map;
  }, [applicabilities]);

  const entryCounts = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((row: any) => {
      const classSubjectId = idOf(row.classSubjectId);
      if (classSubjectId)
        map.set(classSubjectId, (map.get(classSubjectId) || 0) + 1);
    });
    return map;
  }, [entries]);

  const viewRows = useMemo<ClassSubjectView[]>(
    () =>
      rows.map((row: any) => {
        const id = idOf(row.id);
        const classData: any = classMap.get(idOf(row.classId));
        const subject: any = subjectMap.get(idOf(row.subjectId));
        const teacher: any = row.teacherId
          ? teacherMap.get(idOf(row.teacherId))
          : undefined;
        const structure: any = structureMap.get(idOf(row.academicStructureId));
        const period: any = row.academicPeriodId
          ? periodMap.get(idOf(row.academicPeriodId))
          : undefined;
        const curriculum: any = row.curriculumSubjectId
          ? curriculumMap.get(idOf(row.curriculumSubjectId))
          : undefined;
        const curriculumSubject: any = curriculum?.subjectId
          ? subjectMap.get(idOf(curriculum.subjectId))
          : undefined;

        return {
          id,
          row,
          photoUrl:
            resolvedMediaById[id]?.photo ||
            mediaPreviewUrls[mediaKey(id, "photo")] ||
            safeRecordMediaValue(row.photo),
          bannerImageUrl:
            resolvedMediaById[id]?.bannerImage ||
            mediaPreviewUrls[mediaKey(id, "bannerImage")] ||
            safeRecordMediaValue(row.bannerImage),
          className: classData?.name || "Unknown Class",
          subjectName: row.name || subject?.name || "Unknown Subject",
          subjectCode: row.code || subject?.code || "",
          teacherName: teacher?.fullName || "Unassigned",
          teacherPhoto: teacher?.photo,
          structureName: structure?.name || "Unknown Structure",
          periodName: period?.name || "All Periods",
          curriculumLabel:
            curriculumSubject?.name ||
            (curriculum
              ? `Curriculum Subject #${curriculum.id}`
              : "No curriculum link"),
          applicabilityCount: applicabilityCounts.get(id) || 0,
          entryCount: entryCounts.get(id) || 0,
          active: isActiveRow(row),
          locked: !!row.locked,
        };
      }),
    [
      applicabilityCounts,
      classMap,
      curriculumMap,
      entryCounts,
      mediaPreviewUrls,
      periodMap,
      resolvedMediaById,
      rows,
      structureMap,
      subjectMap,
      teacherMap,
    ],
  );

  const classListRows = useMemo<ClassSubjectClassView[]>(() => {
    return classes
      .map((classRow: any) => {
        const classId = idOf(classRow.id);
        const subjectsForClass = viewRows.filter((item) =>
          sameId((item.row as any).classId, classId),
        );

        return {
          id: classId,
          row: classRow,
          name: classRow.name || "Unnamed class",
          code: classRow.code || "",
          level: classRow.level || "",
          subjectCount: subjectsForClass.length,
          activeSubjectCount: subjectsForClass.filter((item) => item.active)
            .length,
          unassignedCount: subjectsForClass.filter(
            (item) => !(item.row as any).teacherId,
          ).length,
          lockedCount: subjectsForClass.filter((item) => item.locked).length,
          rulesCount: subjectsForClass.reduce(
            (sum, item) => sum + item.applicabilityCount,
            0,
          ),
          entriesCount: subjectsForClass.reduce(
            (sum, item) => sum + item.entryCount,
            0,
          ),
          updatedAt: classRow.updatedAt || classRow.createdAt,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, viewRows]);

  const selectedClass = useMemo(() => {
    if (!selectedClassId) return null;
    return (
      classListRows.find((item) => sameId(item.id, selectedClassId)) || null
    );
  }, [classListRows, selectedClassId]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return viewRows
      .filter((item) => {
        const row: any = item.row;
        if (selectedClassId && !sameId(row.classId, selectedClassId))
          return false;
        if (filterClassId !== "all" && !sameId(row.classId, filterClassId))
          return false;
        if (
          filterStructureId !== "all" &&
          !sameId(row.academicStructureId, filterStructureId)
        )
          return false;
        if (
          filterPeriodId !== "all" &&
          !sameId(row.academicPeriodId, filterPeriodId)
        )
          return false;
        if (
          filterTeacherId !== "all" &&
          !sameId(row.teacherId, filterTeacherId)
        )
          return false;
        if (filterType !== "all" && row.type !== filterType) return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;
        if (filterStatus === "locked" && !item.locked) return false;
        if (filterStatus === "unassigned" && !!row.teacherId) return false;
        if (!query) return true;
        return `${item.className} ${item.subjectName} ${item.subjectCode} ${item.teacherName} ${item.structureName} ${item.periodName} ${item.curriculumLabel} ${row.type || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort(
        (a, b) =>
          a.className.localeCompare(b.className) ||
          a.subjectName.localeCompare(b.subjectName),
      );
  }, [
    filterClassId,
    filterPeriodId,
    filterStatus,
    filterStructureId,
    filterTeacherId,
    filterType,
    search,
    selectedClassId,
    viewRows,
  ]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      active: viewRows.filter((row) => row.active).length,
      inactive: viewRows.filter((row) => !row.active).length,
      locked: viewRows.filter((row) => row.locked).length,
      teachersAssigned: viewRows.filter((row) => !!(row.row as any).teacherId)
        .length,
      unassigned: viewRows.filter((row) => !(row.row as any).teacherId).length,
      withApplicability: viewRows.filter((row) => row.applicabilityCount > 0)
        .length,
      withEntries: viewRows.filter((row) => row.entryCount > 0).length,
      showing: filteredRows.length,
    }),
    [filteredRows.length, rows.length, viewRows],
  );

  const activeFilterCount = useMemo(() => {
    return [
      filterClassId,
      filterStructureId,
      filterPeriodId,
      filterTeacherId,
      filterType,
      filterStatus,
    ].filter((value) => value !== "all").length;
  }, [
    filterClassId,
    filterPeriodId,
    filterStatus,
    filterStructureId,
    filterTeacherId,
    filterType,
  ]);

  const filteredClassListRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query || selectedClassId) return classListRows;

    return classListRows.filter((item) =>
      `${item.name} ${item.code} ${item.level} ${item.subjectCount}`
        .toLowerCase()
        .includes(query),
    );
  }, [classListRows, search, selectedClassId]);

  const countsByClass = useMemo(
    () => groupedCounts(viewRows, (item) => item.className),
    [viewRows],
  );
  const countsByType = useMemo(
    () => groupedCounts(viewRows, (item) => typeLabel((item.row as any).type)),
    [viewRows],
  );
  const countsByStructure = useMemo(
    () => groupedCounts(viewRows, (item) => item.structureName),
    [viewRows],
  );
  const countsByTeacher = useMemo(
    () => groupedCounts(viewRows, (item) => item.teacherName),
    [viewRows],
  );

  useEffect(() => {
    if (!form.curriculumSubjectId) return;
    const curriculumSubject: any = curriculumMap.get(
      idOf(form.curriculumSubjectId),
    );
    if (!curriculumSubject) return;
    setForm((current) => {
      const inferredType = (current.type ||
        curriculumSubject.type ||
        "core") as CurriculumSubjectType;
      return {
        ...current,
        subjectId: curriculumSubject.subjectId
          ? String(curriculumSubject.subjectId)
          : current.subjectId,
        credits:
          current.credits ||
          (curriculumSubject.credits == null
            ? ""
            : String(curriculumSubject.credits)),
        contactHours:
          current.contactHours ||
          (curriculumSubject.contactHours == null
            ? ""
            : String(curriculumSubject.contactHours)),
        type: inferredType,
        compulsory: inferredType !== "elective",
        elective: inferredType === "elective",
      };
    });
  }, [curriculumMap, form.curriculumSubjectId]);

  const updateForm = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleImageUpload = async (field: CameraField, file?: File) => {
    if (!file) return;

    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return;
    }

    try {
      const isPhoto = field === "photo";

      // Stage both create and edit uploads. Existing owner media is untouched
      // until the class subject itself saves successfully.
      const result = await saveImageAsset(file, {
        accountId,
        schoolId,
        branchId,
        ownerTable: CLASS_SUBJECT_MEDIA_OWNER_TABLE,
        ownerId: undefined,
        ownerTempKey: mediaSessionKeyRef.current,
        fieldKey: isPhoto
          ? MediaFieldKeys.PHOTO
          : CLASS_SUBJECT_BANNER_FIELD_KEY,
        variant: isPhoto ? "avatar" : "cover",
        replaceExisting: true,
      });

      const uploadedAssetId = cleanId(result.assetId);
      if (!uploadedAssetId) {
        throw new Error(
          "The image was processed but no media asset ID was created.",
        );
      }

      uploadedMediaAssetIds.current = {
        ...uploadedMediaAssetIds.current,
        [field]: uploadedAssetId,
      };

      updateForm({
        [field]: result.previewUrl,
        [isPhoto ? "photoMediaId" : "bannerImageMediaId"]: uploadedAssetId,
      } as Partial<FormState>);

      showToast(
        "success",
        isPhoto
          ? "Class subject photo optimized."
          : "Class subject banner optimized.",
      );
    } catch (error: any) {
      console.error("Failed to process class subject image:", error);
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCameraForField = (field: CameraField) => {
    if (!requireTenant()) return;

    if (!isCameraApiAvailable()) {
      showToast("error", getCameraUnavailableMessage());
      return;
    }

    setCameraField(field);
    setCameraOpen(true);
  };

  const closeCamera = () => {
    stopCurrentCamera();
    setCameraOpen(false);
    setCameraCapturing(false);
    setCameraStarting(false);
  };

  const captureCameraPhoto = async () => {
    if (!cameraVideoRef.current) {
      showToast("error", "Camera preview is not ready yet.");
      return;
    }

    try {
      setCameraCapturing(true);
      const file = await captureImageFileFromVideo(cameraVideoRef.current, {
        fileName: `${cameraField}-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        quality: 0.88,
        maxWidth: cameraField === "photo" ? 900 : 1440,
        maxHeight: cameraField === "photo" ? 900 : 900,
      });

      await handleImageUpload(cameraField, file);
      closeCamera();
    } catch (error: any) {
      console.error("Failed to capture class subject image:", error);
      showToast("error", error?.message || "Failed to capture photo.");
    } finally {
      setCameraCapturing(false);
    }
  };

  const clearFilters = () => {
    setFilterClassId("all");
    setFilterStructureId("all");
    setFilterPeriodId("all");
    setFilterTeacherId("all");
    setFilterType("all");
    setFilterStatus("all");
  };

  const nextClassSubjectOrder = (classId: string) => {
    const relevant = rows.filter((row: any) =>
      sameId(row.classId, classId) &&
      sameId(row.academicStructureId, form.academicStructureId) &&
      sameId(row.academicPeriodId || "", form.academicPeriodId || "") &&
      !row.isDeleted
    );

    return Math.max(0, ...relevant.map((row: any) => Number(row.orderIndex || 0))) + 1;
  };

  const openCreate = () => {
    if (!requireTenant()) return;
    mediaSessionKeyRef.current = createMediaSessionKey(
      CLASS_SUBJECT_MEDIA_OWNER_TABLE,
    );
    uploadedMediaAssetIds.current = {};
    setSelectedItem(null);
    const initial = makeEmptyForm(settings);
    const classId = selectedClassId || "";
    setForm({
      ...initial,
      classId,
      orderIndex: classId
        ? String(
            Math.max(
              0,
              ...rows
                .filter((row: any) => sameId(row.classId, classId) && !row.isDeleted)
                .map((row: any) => Number(row.orderIndex || 0)),
            ) + 1,
          )
        : "1",
    });
    setModalOpen(true);
  };

  const openEdit = (row: ClassSubject) => {
    const item: any = row;
    mediaSessionKeyRef.current = createMediaSessionKey(
      CLASS_SUBJECT_MEDIA_OWNER_TABLE,
    );
    uploadedMediaAssetIds.current = {};
    setSelectedItem(null);
    setForm({
      id: idOf(item.id),
      classId: item.classId ? String(item.classId) : "",
      subjectId: item.subjectId ? String(item.subjectId) : "",
      curriculumSubjectId: item.curriculumSubjectId
        ? String(item.curriculumSubjectId)
        : "",
      academicStructureId: item.academicStructureId
        ? String(item.academicStructureId)
        : "",
      academicPeriodId: item.academicPeriodId
        ? String(item.academicPeriodId)
        : "",
      teacherId: item.teacherId ? String(item.teacherId) : "",
      name: item.name || "",
      code: item.code || "",
      credits: item.credits == null ? "" : String(item.credits),
      contactHours: item.contactHours == null ? "" : String(item.contactHours),
      orderIndex: item.orderIndex == null ? "" : String(item.orderIndex),
      type: item.type || "core",
      compulsory: item.compulsory ?? true,
      elective: item.elective ?? false,
      photo:
        resolvedMediaById[idOf(item.id)]?.photo ||
        mediaPreviewUrls[mediaKey(idOf(item.id), "photo")] ||
        "",
      photoMediaId: item.photoMediaId ? String(item.photoMediaId) : undefined,
      bannerImage:
        resolvedMediaById[idOf(item.id)]?.bannerImage ||
        mediaPreviewUrls[mediaKey(idOf(item.id), "bannerImage")] ||
        "",
      bannerImageMediaId: item.bannerImageMediaId
        ? String(item.bannerImageMediaId)
        : undefined,
      active: item.active !== false,
      locked: !!item.locked,
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId) return "Select a school first.";
    if (!branchId) return "Select a branch first.";
    if (!form.classId) return "Select a class.";
    if (!form.subjectId) return "Select a subject.";
    if (!form.curriculumSubjectId) return "Select a curriculum subject.";
    if (!form.academicStructureId) return "Select an academic structure.";
    if (form.credits !== "" && Number(form.credits) < 0)
      return "Credits cannot be negative.";
    if (form.contactHours !== "" && Number(form.contactHours) < 0)
      return "Contact hours cannot be negative.";
    if (form.orderIndex !== "") {
      const order = Number(form.orderIndex);
      if (!Number.isFinite(order) || order < 0)
        return "Report order must be zero or greater.";
    }

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return (
        sameId(row.classId, form.classId) &&
        sameId(row.subjectId, form.subjectId) &&
        sameId(row.academicStructureId, form.academicStructureId) &&
        sameId(row.academicPeriodId || 0, form.academicPeriodId || 0) &&
        !row.isDeleted
      );
    });

    if (duplicate)
      return "This class subject already exists for the selected class, structure, and period.";
    return "";
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }
    if (!authenticated || !accountId || !schoolId || !branchId) return;

    try {
      setSaving(true);

      const existing = form.id
        ? rows.find((row: any) => sameId(row.id, form.id))
        : undefined;

      // Keep the currently committed media references in the record. Newly
      // selected files remain staged and are attached only after this write.
      const payload: Partial<ClassSubject> = {
        accountId,
        schoolId,
        branchId,
        classId: idOf(form.classId) || undefined,
        subjectId: idOf(form.subjectId) || undefined,
        curriculumSubjectId: String(form.curriculumSubjectId),
        academicStructureId: idOf(form.academicStructureId) || undefined,
        academicPeriodId: form.academicPeriodId
          ? String(form.academicPeriodId)
          : undefined,
        teacherId: form.teacherId || undefined,
        name: form.name.trim() || undefined,
        code: form.code.trim() || undefined,
        credits: form.credits === "" ? undefined : Number(form.credits),
        contactHours:
          form.contactHours === "" ? undefined : Number(form.contactHours),
        orderIndex:
          form.orderIndex === ""
            ? nextClassSubjectOrder(form.classId)
            : Number(form.orderIndex),
        type: form.type,
        compulsory: !!form.compulsory,
        elective: !!form.elective,
        photo: safeRecordMediaValue((existing as any)?.photo),
        photoMediaId: (existing as any)?.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue((existing as any)?.bannerImage),
        bannerImageMediaId:
          (existing as any)?.bannerImageMediaId || undefined,
        active: form.active !== false,
        locked: !!form.locked,
        isDeleted: false,
      } as Partial<ClassSubject>;

      const savedClassSubject =
        form.id && existing
          ? await updateLocal("classSubjects", String(form.id), payload)
          : await createLocal(
              "classSubjects",
              payload as unknown as ClassSubject,
            );

      const savedClassSubjectId = savedEntityId(savedClassSubject, form.id);

      if (!savedClassSubjectId) {
        throw new Error(
          "The class subject was saved, but its permanent ID could not be resolved for image attachment.",
        );
      }

      const stagedPhotoId = cleanId(uploadedMediaAssetIds.current.photo);
      const stagedBannerId = cleanId(
        uploadedMediaAssetIds.current.bannerImage,
      );

      const committedMedia = await commitMediaAssetsToOwner({
        accountId,
        ownerTable: CLASS_SUBJECT_MEDIA_OWNER_TABLE,
        ownerId: savedClassSubjectId,
        ownerTempKey: mediaSessionKeyRef.current,
        assets: [
          {
            assetId: stagedPhotoId || undefined,
            fieldKey: MediaFieldKeys.PHOTO,
          },
          {
            assetId: stagedBannerId || undefined,
            fieldKey: CLASS_SUBJECT_BANNER_FIELD_KEY,
          },
        ],
      });

      const committedPhotoId = committedMedia.find(
        (item) => item.fieldKey === MediaFieldKeys.PHOTO,
      )?.assetId;
      const committedBannerId = committedMedia.find(
        (item) => item.fieldKey === CLASS_SUBJECT_BANNER_FIELD_KEY,
      )?.assetId;

      if (committedPhotoId || committedBannerId) {
        await updateLocal("classSubjects", savedClassSubjectId, {
          photoMediaId:
            committedPhotoId ||
            (existing as any)?.photoMediaId ||
            undefined,
          bannerImageMediaId:
            committedBannerId ||
            (existing as any)?.bannerImageMediaId ||
            undefined,
          photo: safeRecordMediaValue((existing as any)?.photo),
          bannerImage: safeRecordMediaValue((existing as any)?.bannerImage),
        } as Partial<ClassSubject>);
      }

      uploadedMediaAssetIds.current = {};
      mediaSessionKeyRef.current = createMediaSessionKey(
        CLASS_SUBJECT_MEDIA_OWNER_TABLE,
      );
      setModalOpen(false);
      showToast("success", "Class subject saved.");
      await load();
    } catch (error: any) {
      console.error("Failed to save class subject:", error);
      showToast(
        "error",
        error?.message || "Failed to save class subject.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: ClassSubjectView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;
    const ok = window.confirm(
      item.applicabilityCount || item.entryCount
        ? `This class subject has ${item.applicabilityCount} assessment rule(s) and ${item.entryCount} entry record(s). Delete anyway?`
        : `Delete ${item.subjectName} for ${item.className}?`,
    );
    if (!ok) return;

    await Promise.all(
      ["photo", "bannerImage"].map((fieldKey) =>
        softDeleteOwnerFieldAssets({
          accountId: String(accountId),

          ownerTable: "classSubjects",

          ownerId: idOf(id) || undefined,

          fieldKey,
        }),
      ),
    );

    await softDeleteLocal("classSubjects", String(id));
    setSelectedItem(null);
    showToast("success", "Class subject deleted.");
    await load();
  };

  const toggleActive = async (item: ClassSubjectView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;
    await updateLocal("classSubjects", id, {
      active: !item.active,
      isDeleted: false,
    } as unknown as Partial<ClassSubject>);
    setSelectedItem(null);
    showToast(
      "success",
      item.active ? "Class subject deactivated." : "Class subject activated.",
    );
    await load();
  };

  const toggleLocked = async (item: ClassSubjectView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;
    await updateLocal("classSubjects", id, {
      locked: !item.locked,
    } as unknown as Partial<ClassSubject>);
    setSelectedItem(null);
    showToast(
      "success",
      item.locked ? "Class subject unlocked." : "Class subject locked.",
    );
    await load();
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Class Subjects..."
        text="Checking account, branch, classes, curriculum subjects, teachers, and assessment links."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing class subjects."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>No branch workspace selected</h2>
          <p>
            Class subjects belong to the selected branch-admin workspace. Use
            Select Role again if the wrong branch is active.
          </p>
          <button
            type="button"
            className="ba-state-button"
            onClick={() => router.push("/account")}
          >
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </section>
      )}

      <section
        className="ba-search-card"
        aria-label="Class subject search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            placeholder={
              selectedClassId ? "Search subjects..." : "Search classes..."
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search class subjects"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add class subject"
        >
          +
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {filterClassId !== "all" && (
            <button type="button" onClick={() => setFilterClassId("all")}>
              Class:{" "}
              {(classMap.get(idOf(filterClassId)) as any)?.name ||
                filterClassId}{" "}
              ×
            </button>
          )}
          {filterStructureId !== "all" && (
            <button type="button" onClick={() => setFilterStructureId("all")}>
              Structure:{" "}
              {(structureMap.get(idOf(filterStructureId)) as any)?.name ||
                filterStructureId}{" "}
              ×
            </button>
          )}
          {filterPeriodId !== "all" && (
            <button type="button" onClick={() => setFilterPeriodId("all")}>
              Period:{" "}
              {(periodMap.get(idOf(filterPeriodId)) as any)?.name ||
                filterPeriodId}{" "}
              ×
            </button>
          )}
          {filterTeacherId !== "all" && (
            <button type="button" onClick={() => setFilterTeacherId("all")}>
              Teacher:{" "}
              {(teacherMap.get(idOf(filterTeacherId)) as any)?.fullName ||
                filterTeacherId}{" "}
              ×
            </button>
          )}
          {filterType !== "all" && (
            <button type="button" onClick={() => setFilterType("all")}>
              Type: {typeLabel(filterType)} ×
            </button>
          )}
          {filterStatus !== "all" && (
            <button type="button" onClick={() => setFilterStatus("all")}>
              Status: {filterStatus} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="By Class"
            rows={countsByClass}
            total={summary.total}
          />
          <AnalysisCard
            title="By Type"
            rows={countsByType}
            total={summary.total}
          />
          <AnalysisCard
            title="By Structure"
            rows={countsByStructure}
            total={summary.total}
          />
          <AnalysisCard
            title="Teacher Assignment"
            rows={countsByTeacher}
            total={summary.total}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>
              Class subject record(s) currently match your search and filter
              conditions.
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          openEdit={openEdit}
          remove={remove}
          toggleActive={toggleActive}
          toggleLocked={toggleLocked}
        />
      )}

      {viewMode === "cards" && !selectedClassId && (
        <section className="ba-list class-picker-list">
          {filteredClassListRows.map((item) => (
            <ClassSubjectClassItem
              key={String(item.id)}
              item={item}
              primary={primary}
              onOpen={() => {
                setSelectedClassId(String(item.id));
                setFilterClassId("all");
                setSearch("");
              }}
            />
          ))}

          {!filteredClassListRows.length && (
            <Empty
              icon="🏫"
              title="No classes found"
              text="Create a class first, then assign curriculum subjects to it."
            />
          )}
        </section>
      )}

      {viewMode === "cards" && selectedClassId && (
        <>
          <ClassSubjectClassHeader
            selectedClass={selectedClass}
            subjectCount={filteredRows.length}
            onBack={() => {
              setSelectedClassId("");
              setSearch("");
            }}
          />

          <section className="ba-list">
            {filteredRows.map((item) => (
              <ClassSubjectListItem
                key={String(item.id)}
                item={item}
                primary={primary}
                onOpen={() => setSelectedItem(item)}
              />
            ))}

            {!filteredRows.length && (
              <Empty
                icon="📖"
                title="No subjects for this class"
                text="Use the plus button to add a class subject for the selected class."
              />
            )}
          </section>
        </>
      )}

      {filterOpen && (
        <FilterSheet
          classes={classes}
          teachers={teachers}
          academicStructures={academicStructures}
          academicPeriods={academicPeriods}
          filterClassId={filterClassId}
          filterStructureId={filterStructureId}
          filterPeriodId={filterPeriodId}
          filterTeacherId={filterTeacherId}
          filterType={filterType}
          filterStatus={filterStatus}
          setFilterClassId={setFilterClassId}
          setFilterStructureId={setFilterStructureId}
          setFilterPeriodId={setFilterPeriodId}
          setFilterTeacherId={setFilterTeacherId}
          setFilterType={setFilterType}
          setFilterStatus={setFilterStatus}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          summary={summary}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {selectedItem && (
        <ActionSheet
          item={selectedItem}
          openEdit={openEdit}
          remove={remove}
          toggleActive={toggleActive}
          toggleLocked={toggleLocked}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <ClassSubjectModal
          form={form}
          saving={saving}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          academicStructures={academicStructures}
          availablePeriods={availablePeriods}
          availableCurriculumSubjects={availableCurriculumSubjects}
          subjectMap={subjectMap}
          setModalOpen={setModalOpen}
          updateForm={updateForm}
          handleImageUpload={handleImageUpload}
          openCameraForField={openCameraForField}
          save={save}
        />
      )}

      {cameraOpen && (
        <CameraCaptureModal
          field={cameraField}
          videoRef={cameraVideoRef}
          starting={cameraStarting}
          capturing={cameraCapturing}
          facing={cameraFacing}
          setFacing={setCameraFacing}
          capture={captureCameraPhoto}
          close={closeCamera}
          entityLabel={CLASS_SUBJECT_MEDIA_ENTITY_LABEL}
        />
      )}
    </main>
  );
}

function State({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function ClassSubjectClassItem({
  item,
  primary,
  onOpen,
}: {
  item: ClassSubjectClassView;
  primary: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="class-subject-row class-picker-row"
      onClick={onOpen}
    >
      <Avatar
        name={item.name}
        photo={safeRecordMediaValue((item.row as any).photo)}
        primary={primary}
      />

      <span className="class-subject-main">
        <strong>{item.name}</strong>
        <small>
          {item.subjectCount} subject{item.subjectCount === 1 ? "" : "s"}
          {item.code ? ` · ${item.code}` : ""}
          {item.level ? ` · ${item.level}` : ""}
        </small>
        <em>
          {item.unassignedCount ? `${item.unassignedCount} unassigned · ` : ""}
          {item.lockedCount ? `${item.lockedCount} locked · ` : ""}
          {item.rulesCount} rule link{item.rulesCount === 1 ? "" : "s"}
        </em>
      </span>

      <span className="class-subject-side">
        <span
          className={`status-dot-mini ${item.subjectCount ? "green" : "gray"}`}
          title={item.subjectCount ? "Has subjects" : "No subjects yet"}
        />
        <i>›</i>
      </span>
    </button>
  );
}

function ClassSubjectClassHeader({
  selectedClass,
  subjectCount,
  onBack,
}: {
  selectedClass: ClassSubjectClassView | null;
  subjectCount: number;
  onBack: () => void;
}) {
  return (
    <section className="class-subject-context-card">
      <button type="button" className="class-subject-back" onClick={onBack}>
        ← Classes
      </button>
      <div>
        <strong>{selectedClass?.name || "Selected class"}</strong>
        <small>
          {subjectCount} subject{subjectCount === 1 ? "" : "s"}
          {selectedClass?.code ? ` · ${selectedClass.code}` : ""}
          {selectedClass?.level ? ` · ${selectedClass.level}` : ""}
        </small>
      </div>
    </section>
  );
}

function ClassSubjectListItem({
  item,
  primary,
  onOpen,
}: {
  item: ClassSubjectView;
  primary: string;
  onOpen: () => void;
}) {
  const row: any = item.row;
  return (
    <button type="button" className="class-subject-row" onClick={onOpen}>
      <Avatar
        name={item.subjectName}
        photo={item.photoUrl || safeRecordMediaValue(row.photo)}
        primary={primary}
      />

      <span className="class-subject-main">
        <strong>{item.subjectName}</strong>
        <small>
          {item.className}
          {item.subjectCode ? ` · ${item.subjectCode}` : ""}
        </small>
        <em>
          {item.teacherName} · {item.periodName} · {typeLabel(row.type)}
        </em>
      </span>

      <span className="class-subject-side">
        <span
          className={`status-dot-mini ${statusTone(item)}`}
          title={item.locked ? "Locked" : item.active ? "Active" : "Inactive"}
          aria-label={
            item.locked ? "Locked" : item.active ? "Active" : "Inactive"
          }
        />
        <i>⋯</i>
      </span>
    </button>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function FilterSheet({
  classes,
  teachers,
  academicStructures,
  academicPeriods,
  filterClassId,
  filterStructureId,
  filterPeriodId,
  filterTeacherId,
  filterType,
  filterStatus,
  setFilterClassId,
  setFilterStructureId,
  setFilterPeriodId,
  setFilterTeacherId,
  setFilterType,
  setFilterStatus,
  clearFilters,
  onClose,
}: {
  classes: Class[];
  teachers: Teacher[];
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  filterClassId: string;
  filterStructureId: string;
  filterPeriodId: string;
  filterTeacherId: string;
  filterType: SubjectTypeFilter;
  filterStatus: StatusFilter;
  setFilterClassId: (value: string) => void;
  setFilterStructureId: (value: string) => void;
  setFilterPeriodId: (value: string) => void;
  setFilterTeacherId: (value: string) => void;
  setFilterType: (value: SubjectTypeFilter) => void;
  setFilterStatus: (value: StatusFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <EleeveonFullscreenOverlay><div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>
              Choose only what you need. The class subject list updates after
              applying.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Class</span>
            <select
              value={filterClassId}
              onChange={(event) => setFilterClassId(event.target.value)}
            >
              <option value="all">All classes</option>
              {classes.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Structure</span>
            <select
              value={filterStructureId}
              onChange={(event) => setFilterStructureId(event.target.value)}
            >
              <option value="all">All structures</option>
              {academicStructures.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Period</span>
            <select
              value={filterPeriodId}
              onChange={(event) => setFilterPeriodId(event.target.value)}
            >
              <option value="all">All periods</option>
              {academicPeriods.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Teacher</span>
            <select
              value={filterTeacherId}
              onChange={(event) => setFilterTeacherId(event.target.value)}
            >
              <option value="all">All teachers</option>
              {teachers.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.fullName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Type</span>
            <select
              value={filterType as string}
              onChange={(event) =>
                setFilterType(event.target.value as SubjectTypeFilter)
              }
            >
              <option value="all">All types</option>
              <option value="core">Core</option>
              <option value="elective">Elective</option>
              <option value="optional">Optional</option>
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={filterStatus}
              onChange={(event) =>
                setFilterStatus(event.target.value as StatusFilter)
              }
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="locked">Locked</option>
              <option value="unassigned">Unassigned Teacher</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>
            Clear
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Apply
          </button>
        </div>
      </section>
    </div></EleeveonFullscreenOverlay>
  );
}

function MoreSheet({
  viewMode,
  summary,
  setViewMode,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  summary: {
    total: number;
    active: number;
    inactive: number;
    locked: number;
    teachersAssigned: number;
    unassigned: number;
    showing: number;
  };
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <EleeveonFullscreenOverlay><div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>
              {summary.showing} of {summary.total} class subject record(s)
              shown.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
          >
            <span>☰</span>
            <b>List view</b>
            <small>Compact class-subject records</small>
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense records for laptop work</small>
          </button>
          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Class, type, structure and teacher summaries</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch records</small>
          </button>
        </div>
      </section>
    </div></EleeveonFullscreenOverlay>
  );
}

function ActionSheet({
  item,
  openEdit,
  remove,
  toggleActive,
  toggleLocked,
  onClose,
}: {
  item: ClassSubjectView;
  openEdit: (row: ClassSubject) => void;
  remove: (item: ClassSubjectView) => void;
  toggleActive: (item: ClassSubjectView) => void;
  toggleLocked: (item: ClassSubjectView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;
  return (
    <EleeveonFullscreenOverlay><div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{item.subjectName}</h2>
            <p>
              {item.className} · {item.teacherName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close class subject actions"
          >
            ✕
          </button>
        </div>

        <div className="detail-strip">
          <span>
            <b>Type</b>
            {typeLabel(row.type)}
          </span>
          <span>
            <b>Rules</b>
            {item.applicabilityCount}
          </span>
          <span>
            <b>Entries</b>
            {item.entryCount}
          </span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item.row)}>
            <span>✎</span>
            <b>Edit class subject</b>
            <small>
              Update class, subject, teacher, period, media and flags
            </small>
          </button>
          <button type="button" onClick={() => toggleActive(item)}>
            <span>{item.active ? "⏸" : "✓"}</span>
            <b>{item.active ? "Deactivate" : "Activate"}</b>
            <small>
              {item.active
                ? "Pause this class subject"
                : "Mark this class subject active"}
            </small>
          </button>
          <button type="button" onClick={() => toggleLocked(item)}>
            <span>{item.locked ? "🔓" : "🔒"}</span>
            <b>{item.locked ? "Unlock" : "Lock"}</b>
            <small>
              {item.locked ? "Allow changes again" : "Prevent normal editing"}
            </small>
          </button>
          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this class subject locally</small>
          </button>
        </div>
      </section>
    </div></EleeveonFullscreenOverlay>
  );
}

function TableView({
  rows,
  openEdit,
  remove,
  toggleActive,
  toggleLocked,
}: {
  rows: ClassSubjectView[];
  openEdit: (row: ClassSubject) => void;
  remove: (item: ClassSubjectView) => void;
  toggleActive: (item: ClassSubjectView) => void;
  toggleLocked: (item: ClassSubjectView) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Class Subjects ({rows.length})</th>
              <th>Class</th>
              <th>Teacher</th>
              <th>Structure</th>
              <th>Period</th>
              <th>Type</th>
              <th>Rules</th>
              <th>Entries</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const row: any = item.row;
              return (
                <tr key={String(item.id)}>
                  <td>
                    <strong>{item.subjectName}</strong>
                    <span>{item.subjectCode || item.curriculumLabel}</span>
                  </td>
                  <td>{item.className}</td>
                  <td>{item.teacherName}</td>
                  <td>{item.structureName}</td>
                  <td>{item.periodName}</td>
                  <td>
                    <Chip tone={typeTone(row.type)}>{typeLabel(row.type)}</Chip>
                  </td>
                  <td>{item.applicabilityCount}</td>
                  <td>{item.entryCount}</td>
                  <td>
                    <Chip tone={item.active ? "green" : "red"}>
                      {item.active ? "Active" : "Inactive"}
                    </Chip>
                    <span>{item.locked ? "Locked" : "Unlocked"}</span>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item.row)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => toggleActive(item)}>
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" onClick={() => toggleLocked(item)}>
                        {item.locked ? "Unlock" : "Lock"}
                      </button>
                      <button
                        type="button"
                        className="ba-delete"
                        onClick={() => remove(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="ba-empty-table">
            No class subject matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function ClassSubjectModal({
  form,
  saving,
  classes,
  subjects,
  teachers,
  academicStructures,
  availablePeriods,
  availableCurriculumSubjects,
  subjectMap,
  setModalOpen,
  updateForm,
  handleImageUpload,
  openCameraForField,
  save,
}: {
  form: FormState;
  saving: boolean;
  classes: Class[];
  subjects: Subject[];
  teachers: Teacher[];
  academicStructures: AcademicStructure[];
  availablePeriods: AcademicPeriod[];
  availableCurriculumSubjects: CurriculumSubject[];
  subjectMap: Map<string, Subject>;
  setModalOpen: (open: boolean) => void;
  updateForm: (patch: Partial<FormState>) => void;
  handleImageUpload: (field: CameraField, file?: File) => void | Promise<void>;
  openCameraForField: (field: CameraField) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <EleeveonFullscreenOverlay><div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Class Subject" : "Add Class Subject"}</h2>
            <p>
              Connect a class, subject, curriculum rule, academic period, and
              teacher into one delivery context.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close class subject form"
          >
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Delivery Context</h3>
          <div className="ba-form">
            <label>
              <span>Class</span>
              <select
                value={form.classId}
                onChange={(e) => updateForm({ classId: e.target.value })}
              >
                <option value="">Select class</option>
                {classes.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subject</span>
              <select
                value={form.subjectId}
                onChange={(e) =>
                  updateForm({
                    subjectId: e.target.value,
                    curriculumSubjectId: "",
                  })
                }
              >
                <option value="">Select subject</option>
                {subjects.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name}
                    {row.code ? ` · ${row.code}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Curriculum Subject</span>
              <select
                value={form.curriculumSubjectId}
                onChange={(e) =>
                  updateForm({ curriculumSubjectId: e.target.value })
                }
              >
                <option value="">Select curriculum subject</option>
                {availableCurriculumSubjects.map((row: any) => {
                  const subject: any = subjectMap.get(idOf(row.subjectId));
                  return (
                    <option key={String(row.id)} value={String(row.id)}>
                      {subject?.name || "Subject"} · {row.type || "core"}
                      {row.credits ? ` · ${row.credits} credits` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span>Teacher</span>
              <select
                value={form.teacherId}
                onChange={(e) => updateForm({ teacherId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {teachers.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.fullName}
                    {row.role ? ` · ${row.role}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Academic Timing</h3>
          <div className="ba-form two">
            <label>
              <span>Academic Structure</span>
              <select
                value={form.academicStructureId}
                onChange={(e) =>
                  updateForm({
                    academicStructureId: e.target.value,
                    academicPeriodId: "",
                  })
                }
              >
                <option value="">Select structure</option>
                {academicStructures.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name}
                    {row.level ? ` · ${row.level}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Academic Period</span>
              <select
                value={form.academicPeriodId}
                onChange={(e) =>
                  updateForm({ academicPeriodId: e.target.value })
                }
              >
                <option value="">All periods / not specific</option>
                {availablePeriods.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Overrides and Flags</h3>
          <div className="ba-form">
            <label>
              <span>Display Name Override</span>
              <input
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="Optional subject name override"
              />
            </label>
            <label>
              <span>Code Override</span>
              <input
                value={form.code}
                onChange={(e) => updateForm({ code: e.target.value })}
                placeholder="Optional code"
              />
            </label>
            <label>
              <span>Credits</span>
              <input
                type="number"
                value={form.credits}
                onChange={(e) => updateForm({ credits: e.target.value })}
                placeholder="Credits"
              />
            </label>
            <label>
              <span>Contact Hours</span>
              <input
                type="number"
                value={form.contactHours}
                onChange={(e) => updateForm({ contactHours: e.target.value })}
                placeholder="Hours"
              />
            </label>
            <label>
              <span>Report Order</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.orderIndex}
                onChange={(e) => updateForm({ orderIndex: e.target.value })}
                placeholder="e.g. 1"
              />
              <small>Lower numbers appear first on report cards and broadsheets.</small>
            </label>
            <label>
              <span>Type</span>
              <select
                value={form.type as string}
                onChange={(e) => {
                  const type = e.target.value as CurriculumSubjectType;
                  updateForm({
                    type,
                    elective: type === "elective",
                    compulsory: type !== "elective",
                  });
                }}
              >
                <option value="core">Core</option>
                <option value="elective">Elective</option>
                <option value="optional">Optional</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                value={form.active ? "active" : "inactive"}
                onChange={(e) =>
                  updateForm({ active: e.target.value === "active" })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="ba-check-grid">
            <label className="ba-check">
              <input
                type="checkbox"
                checked={!!form.compulsory}
                onChange={(e) => updateForm({ compulsory: e.target.checked })}
              />
              <span>Compulsory</span>
            </label>
            <label className="ba-check">
              <input
                type="checkbox"
                checked={!!form.elective}
                onChange={(e) => updateForm({ elective: e.target.checked })}
              />
              <span>Elective</span>
            </label>
            <label className="ba-check">
              <input
                type="checkbox"
                checked={!!form.locked}
                onChange={(e) => updateForm({ locked: e.target.checked })}
              />
              <span>Locked</span>
            </label>
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Media</h3>
          <div className="ba-form two">
            <label>
              <span>Subject Photo</span>
              <div className="ba-media-actions">
                <label className="ba-media-button">
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleImageUpload("photo", e.target.files?.[0])
                    }
                    hidden
                  />
                </label>
                <button
                  type="button"
                  className="ba-media-button secondary"
                  onClick={() => openCameraForField("photo")}
                >
                  Take Photo
                </button>
              </div>
              <small className="ba-media-hint">
                Upload from files or take a quick camera photo. The image is
                optimized and saved as a media asset.
              </small>
              {form.photo && (
                <img
                  src={form.photo}
                  alt="Subject preview"
                  className="ba-preview-photo"
                />
              )}
            </label>

            <label>
              <span>Banner Image</span>
              <div className="ba-media-actions">
                <label className="ba-media-button">
                  Upload Banner
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleImageUpload("bannerImage", e.target.files?.[0])
                    }
                    hidden
                  />
                </label>
                <button
                  type="button"
                  className="ba-media-button secondary"
                  onClick={() => openCameraForField("bannerImage")}
                >
                  Take Photo
                </button>
              </div>
              <small className="ba-media-hint">
                Upload from files or use the camera. The banner is compressed
                separately so sync records stay small.
              </small>
              {form.bannerImage && (
                <img
                  src={form.bannerImage}
                  alt="Subject banner preview"
                  className="ba-preview-banner"
                />
              )}
            </label>
          </div>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : form.id
                ? "Save Changes"
                : "Add Class Subject"}
          </button>
        </div>
      </form>
    </div></EleeveonFullscreenOverlay>
  );
}

function CameraCaptureModal({
  field,
  videoRef,
  starting,
  capturing,
  facing,
  setFacing,
  capture,
  close,
  entityLabel,
}: {
  field: CameraField;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  starting: boolean;
  capturing: boolean;
  facing: CameraFacingMode;
  setFacing: (value: CameraFacingMode) => void;
  capture: () => void | Promise<void>;
  close: () => void;
  entityLabel: string;
}) {
  const title =
    field === "photo"
      ? `Take ${entityLabel} Photo`
      : `Take ${entityLabel} Banner Photo`;
  return (
    <EleeveonFullscreenOverlay><div
      className="ba-modal-backdrop camera-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <section className="ba-camera-modal">
        <div className="ba-modal-head">
          <div>
            <h2>{title}</h2>
            <p>
              Use the live camera preview, then capture. The image will still be
              compressed and saved as a media asset.
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close camera">
            ✕
          </button>
        </div>
        <div className="ba-camera-preview">
          <video ref={videoRef} autoPlay muted playsInline />
          {starting && (
            <span className="ba-camera-loading">Opening camera...</span>
          )}
        </div>
        <div className="ba-camera-actions">
          <button
            type="button"
            className="ba-camera-secondary"
            onClick={() =>
              setFacing(facing === "environment" ? "user" : "environment")
            }
            disabled={starting || capturing}
          >
            Switch Camera
          </button>
          <button
            type="button"
            className="ba-camera-secondary"
            onClick={close}
            disabled={capturing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ba-camera-primary"
            onClick={capture}
            disabled={starting || capturing}
          >
            {capturing ? "Capturing..." : "Capture Photo"}
          </button>
        </div>
      </section>
    </div></EleeveonFullscreenOverlay>
  );
}

function groupedCounts(
  rows: ClassSubjectView[],
  keyFn: (item: ClassSubjectView) => string,
) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; value: number }[];
  total: number;
}) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>
      <div className="ba-analysis-list">
        {rows.slice(0, 8).map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <section key={row.label}>
              <div>
                <b>{row.label}</b>
                <small>
                  {row.value} · {share}%
                </small>
              </div>
              <div className="ba-progress">
                <i style={{ width: `${Math.max(4, share)}%` }} />
              </div>
            </section>
          );
        })}
        {!rows.length && <p>No data available.</p>}
      </div>
    </article>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *, .ba-page *::before, .ba-page *::after { box-sizing: border-box; min-width: 0; }
.ba-page button, .ba-page input, .ba-page select, .ba-page textarea { font: inherit; max-width: 100%; }
.ba-page button { -webkit-tap-highlight-color: transparent; }
.ba-page input, .ba-page select, .ba-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827));
  outline: none;
  font-weight: 750;
}
.ba-page textarea { min-height: 92px; padding: 12px; resize: vertical; line-height: 1.55; }
.ba-page input:focus, .ba-page select:focus, .ba-page textarea:focus {
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}

.ba-state, .ba-search-card, .ba-table-card, .ba-analysis, .ba-empty, .ba-sheet, .ba-modal, .ba-camera-modal, .class-subject-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}
.ba-state { min-height: min(420px, calc(100dvh - 32px)); width: min(520px, 100%); margin: 0 auto; display: grid; place-items: center; align-content: center; gap: 10px; padding: 22px; border-radius: 28px; text-align: center; }
.ba-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent); border-top-color: var(--ba-primary); animation: spin .8s linear infinite; }
.ba-state h2 { margin: 0; font-size: 22px; font-weight: 1000; letter-spacing: -.04em; }
.ba-state p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.ba-state-button { min-height: 42px; border: 0; border-radius: 999px; padding: 0 16px; background: var(--ba-primary); color: #fff; font-weight: 950; cursor: pointer; }

.ba-toast { position: sticky; top: 8px; z-index: 40; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; padding: 12px 14px; border-radius: 18px; font-size: 13px; font-weight: 850; box-shadow: 0 18px 40px rgba(15,23,42,.12); }
.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; }
.ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; }
.ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }
.ba-toast button { border: 0; background: transparent; color: currentColor; font-weight: 1000; cursor: pointer; }

.ba-search-card { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 8px; align-items: center; margin-top: 2px; padding: 8px; border-radius: 24px; }
.ba-search { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; min-height: 44px; padding: 0 11px; border-radius: 18px; background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent); }
.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input { min-height: 42px; border: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 14px; }
.ba-icon-button, .ba-filter-button, .ba-add-inline { width: 42px; height: 42px; border: 1px solid var(--border, rgba(0,0,0,.10)); border-radius: 999px; display: grid; place-items: center; background: var(--card-bg, var(--surface,#fff)); color: var(--text,#111827); font-size: 18px; font-weight: 1000; cursor: pointer; box-shadow: 0 10px 22px rgba(15,23,42,.045); }
.ba-add-inline { flex: 0 0 42px; border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; font-size: 25px; line-height: 1; box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent); }
.ba-filter-button { position: relative; background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff)); color: var(--ba-primary); }
.ba-filter-button.active { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-filter-button b { position: absolute; top: -4px; right: -4px; min-width: 19px; height: 19px; display: grid; place-items: center; border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; border: 2px solid var(--card-bg,#fff); }
.ba-slider-icon { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }

.ba-filter-chips { display: flex; gap: 7px; overflow-x: auto; padding: 8px 1px 0; scrollbar-width: none; -ms-overflow-style: none; }
.ba-filter-chips::-webkit-scrollbar { display: none; }
.ba-filter-chips button { flex: 0 0 auto; min-height: 31px; border: 0; border-radius: 999px; padding: 0 10px; background: color-mix(in srgb, var(--ba-primary) 11%, transparent); color: var(--ba-primary); font-size: 11px; font-weight: 950; white-space: nowrap; cursor: pointer; }

.ba-list { display: grid; gap: 7px; margin-top: 10px; }
.class-subject-row { width: 100%; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 10px; border-radius: 22px; text-align: left; cursor: pointer; transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease); }
.class-subject-row:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10))); box-shadow: 0 16px 34px rgba(15,23,42,.07); }
.ba-avatar { width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; color: #fff; font-size: 15px; font-weight: 1000; box-shadow: 0 12px 24px rgba(15,23,42,.12); }
.class-subject-main, .class-subject-main strong, .class-subject-main small, .class-subject-main em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.class-subject-main strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.02em; }
.class-subject-main small { margin-top: 3px; color: var(--muted,#64748b); font-size: 12px; font-weight: 850; font-style: normal; }
.class-subject-main em { margin-top: 3px; color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827)); font-size: 11px; font-weight: 750; font-style: normal; }
.class-subject-side { display: grid; justify-items: end; gap: 6px; flex: 0 0 auto; }
.class-subject-side i { color: var(--muted,#64748b); font-style: normal; font-size: 18px; font-weight: 1000; line-height: 1; }
.status-dot-mini { width: 10px; height: 10px; display: inline-block; border-radius: 999px; background: var(--muted,#64748b); box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent); }
.status-dot-mini.green { background: #22c55e; }
.status-dot-mini.red { background: #ef4444; }
.status-dot-mini.orange { background: #f59e0b; }
.status-dot-mini.gray { background: #64748b; }

.ba-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; }
.ba-chip.green { background:rgba(34,197,94,.12); color:#16a34a; }
.ba-chip.red { background:rgba(239,68,68,.12); color:#dc2626; }
.ba-chip.blue { background:rgba(59,130,246,.12); color:#2563eb; }
.ba-chip.gray { background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color:var(--muted,#64748b); }
.ba-chip.orange { background:rgba(245,158,11,.14); color:#b45309; }
.ba-chip.purple { background:rgba(147,51,234,.12); color:#7e22ce; }

.ba-table-card { margin-top: 10px; padding: 10px; border-radius: 24px; }
.ba-table-scroll { width: 100%; max-width: 100%; overflow-x: auto; border-radius: 18px; border: 1px solid var(--border,rgba(0,0,0,.08)); }
.ba-table-scroll table { width: 100%; min-width: 1120px; border-collapse: collapse; background: var(--card-bg,var(--surface,#fff)); }
.ba-table-scroll th, .ba-table-scroll td { padding: 10px; border-bottom: 1px solid var(--border,rgba(0,0,0,.08)); vertical-align: top; text-align: left; font-size: 13px; }
.ba-table-scroll th { background: color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,#fff)); color: var(--muted,#64748b); font-size: 11px; font-weight: 1000; text-transform: uppercase; letter-spacing: .07em; }
.ba-table-scroll td strong, .ba-table-scroll td span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-table-scroll td span { margin-top: 3px; color: var(--muted,#64748b); font-size: 11px; }
.ba-table-actions { display: flex; flex-wrap: nowrap; gap: 7px; }
.ba-table-actions button { min-height: 34px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 10px; background: var(--surface,#fff); color: var(--text,#111827); font-size: 11px; font-weight: 950; cursor: pointer; white-space: nowrap; }
.ba-table-actions button:first-child { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-table-actions .ba-delete { color: var(--muted,#64748b); background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); border-color: color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10))); }
.ba-empty-table { padding: 22px; text-align: center; color: var(--muted,#64748b); font-weight: 850; }

.ba-analysis-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 10px; margin-top: 10px; }
.ba-analysis { padding: 13px; border-radius: 24px; }
.ba-analysis span { color: var(--muted,#64748b); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .08em; }
.ba-analysis strong { display: block; margin-top: 8px; font-size: clamp(22px,7vw,30px); line-height: 1; font-weight: 1000; letter-spacing: -.06em; overflow-wrap: anywhere; }
.ba-analysis p { margin: 8px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; }
.ba-analysis-list { display: grid; gap: 10px; margin-top: 12px; }
.ba-analysis-list section { display: grid; gap: 6px; padding: 10px; border-radius: 16px; background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent); }
.ba-analysis-list section > div:first-child { display: flex; justify-content: space-between; gap: 10px; }
.ba-analysis-list b, .ba-analysis-list small { font-size: 12px; }
.ba-analysis-list small { color: var(--muted,#64748b); font-weight: 850; }
.ba-progress { height: 8px; border-radius: 999px; background: color-mix(in srgb,var(--muted,#64748b) 18%,transparent); overflow: hidden; }
.ba-progress i { display: block; height: 100%; border-radius: inherit; background: var(--ba-primary); }

.ba-empty { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 220px; padding: 18px; text-align: center; border-radius: 24px; border-style: dashed; }
.ba-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)); font-size: 28px; }
.ba-empty h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.ba-empty p { margin: 0; color: var(--muted,#64748b); font-size: 13px; line-height: 1.6; }

.ba-sheet-backdrop, .ba-modal-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; padding: 10px; background: rgba(15,23,42,.58); backdrop-filter: blur(12px); }
.ba-sheet { width: min(640px, 100%); max-height: min(86dvh, 780px); overflow-y: auto; border-radius: 28px; padding: 14px; }
.ba-sheet.small { width: min(520px, 100%); }
.ba-sheet-head, .ba-modal-head, .ba-sheet-profile { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 4px 2px 14px; }
.ba-sheet-head h2, .ba-modal-head h2, .ba-sheet-profile h2 { margin: 0; font-size: 20px; font-weight: 1000; letter-spacing: -.05em; color: var(--text,#111827); }
.ba-sheet-head p, .ba-modal-head p, .ba-sheet-profile p { margin: 5px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; }
.ba-sheet-head button, .ba-modal-head button, .ba-sheet-profile button { width: 38px; height: 38px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; background: var(--surface,#fff); color: var(--text,#111827); font-weight: 1000; cursor: pointer; }
.ba-sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
.ba-sheet-actions button, .ba-modal-actions button { min-height: 42px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 14px; background: var(--surface,#fff); color: var(--text,#111827); font-size: 12px; font-weight: 950; cursor: pointer; }
.ba-sheet-actions .primary, .ba-modal-actions button:last-child { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-modal-actions button:disabled { opacity: .6; cursor: not-allowed; }
.ba-menu-list { display: grid; gap: 8px; }
.ba-menu-list button { width: 100%; min-height: 60px; display: grid; grid-template-columns: auto minmax(0,1fr); column-gap: 10px; align-items: center; text-align: left; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 18px; padding: 10px; background: var(--surface,#fff); color: var(--text,#111827); cursor: pointer; }
.ba-menu-list button.active { border-color: color-mix(in srgb, var(--ba-primary) 45%, var(--border,rgba(0,0,0,.10))); background: color-mix(in srgb, var(--ba-primary) 8%, var(--surface,#fff)); }
.ba-menu-list button.danger { color: var(--muted,#64748b); background: color-mix(in srgb,var(--muted,#64748b) 6%,var(--surface,#fff)); }
.ba-menu-list button span { grid-row: span 2; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 14px; background: color-mix(in srgb,var(--ba-primary) 10%,transparent); color: var(--ba-primary); font-size: 16px; }
.ba-menu-list button b, .ba-menu-list button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-menu-list button b { font-size: 13px; font-weight: 1000; }
.ba-menu-list button small { color: var(--muted,#64748b); font-size: 11px; font-weight: 750; }
.detail-strip { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-bottom: 12px; }
.detail-strip span { display: grid; gap: 3px; padding: 10px; border-radius: 16px; background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent); color: var(--muted,#64748b); font-size: 11px; font-weight: 800; }
.detail-strip b { color: var(--text,#111827); font-size: 12px; font-weight: 1000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ba-form-section { margin-top: 12px; padding: 12px; border: 1px solid var(--border,rgba(0,0,0,.08)); border-radius: 22px; background: color-mix(in srgb,var(--muted,#64748b) 4%,transparent); }
.ba-form-section h3 { margin: 0 0 10px; font-size: 13px; font-weight: 1000; letter-spacing: -.02em; color: var(--text,#111827); }
.ba-form { display: grid; grid-template-columns: minmax(0,1fr); gap: 10px; }
.ba-form.two { grid-template-columns: minmax(0,1fr); }
.ba-form.compact { gap: 8px; }
.ba-form label { display: grid; gap: 6px; }
.ba-form label.wide { grid-column: 1 / -1; }
.ba-form label > span, .ba-media-hint { color: var(--muted,#64748b); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.ba-check-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; margin-top: 10px; }
.ba-check { min-height: 44px; display: flex !important; align-items: center; gap: 9px; padding: 10px; border-radius: 16px; background: var(--surface,#fff); border: 1px solid var(--border,rgba(0,0,0,.08)); }
.ba-check input { width: 18px; min-height: 18px; accent-color: var(--ba-primary); }
.ba-check span { color: var(--text,#111827) !important; font-size: 12px !important; font-weight: 900 !important; text-transform: none !important; letter-spacing: 0 !important; }
.ba-modal { width: min(980px, 100%); max-height: min(92dvh, 900px); overflow-y: auto; padding: 14px; border-radius: 28px; box-shadow: 0 30px 90px rgba(15,23,42,.35); }
.ba-modal-actions { position: sticky; bottom: -14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 14px -14px -14px; padding: 12px 14px; background: color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 94%,transparent); border-top: 1px solid var(--border,rgba(0,0,0,.08)); backdrop-filter: blur(10px); }
.ba-media-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ba-media-button { width: auto !important; min-height: 38px; display: inline-flex !important; align-items: center; justify-content: center; border: 1px solid var(--ba-primary); border-radius: 999px; padding: 0 12px; background: var(--ba-primary); color: #fff !important; font-size: 12px !important; font-weight: 950 !important; text-transform: none !important; letter-spacing: 0 !important; cursor: pointer; }
.ba-media-button.secondary { background: var(--surface,#fff); color: var(--ba-primary) !important; }
.ba-media-hint { display: block; margin-top: 5px; line-height: 1.4; text-transform: none; letter-spacing: 0; font-weight: 750; }
.ba-preview-photo { width: 84px; height: 84px; margin-top: 8px; border-radius: 22px; object-fit: cover; border: 1px solid var(--border,rgba(0,0,0,.10)); }
.ba-preview-banner { width: 100%; max-height: 160px; margin-top: 8px; border-radius: 20px; object-fit: cover; border: 1px solid var(--border,rgba(0,0,0,.10)); }
.ba-camera-modal { width: min(720px, 100%); padding: 14px; border-radius: 28px; }
.ba-camera-preview { position: relative; overflow: hidden; border-radius: 22px; background: #020617; aspect-ratio: 16/10; }
.ba-camera-preview video { width: 100%; height: 100%; object-fit: cover; display: block; }
.ba-camera-loading { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-weight: 900; background: rgba(2,6,23,.45); }
.ba-camera-actions { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 12px; }
.ba-camera-actions button { min-height: 42px; border-radius: 999px; padding: 0 14px; font-size: 12px; font-weight: 950; cursor: pointer; }
.ba-camera-primary { border: 0; background: var(--ba-primary); color: #fff; }
.ba-camera-secondary { border: 1px solid var(--border,rgba(0,0,0,.10)); background: var(--surface,#fff); color: var(--text,#111827); }

.class-picker-list { margin-top: 10px; }
.class-picker-row .class-subject-side i { font-size: 22px; line-height: 1; }
.class-subject-context-card {
  display: grid;
  grid-template-columns: auto minmax(0,1fr);
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 22px;
  background: var(--card-bg,var(--surface,#fff));
  border: 1px solid var(--border,rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}
.class-subject-context-card strong,
.class-subject-context-card small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.class-subject-context-card strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.025em; }
.class-subject-context-card small { margin-top: 2px; color: var(--muted,#64748b); font-size: 12px; font-weight: 850; }
.class-subject-back {
  width: auto;
  min-height: 38px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 12px;
  background: color-mix(in srgb,var(--ba-primary) 9%,var(--card-bg,#fff));
  color: var(--ba-primary);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

@media (min-width: 680px) {
  .ba-page { padding: calc(12px * var(--local-density-scale,1)); }
  .ba-list { grid-template-columns: repeat(2, minmax(0,1fr)); align-items: start; }
  .ba-analysis-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .ba-form, .ba-form.two, .ba-form.compact { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .ba-check-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .ba-camera-actions { grid-template-columns: 1fr 1fr 1.2fr; }
}

@media (min-width: 1040px) {
  .ba-page { padding: calc(16px * var(--local-density-scale,1)); }
  .ba-list { grid-template-columns: repeat(3, minmax(280px, 1fr)); max-width: 1180px; }
  .ba-search-card, .ba-filter-chips, .ba-analysis-grid, .ba-table-card { max-width: 1180px; }
  .ba-analysis-grid { grid-template-columns: repeat(4,minmax(0,1fr)); }
}

@media (max-width: 520px) {
  .ba-page { padding: calc(6px * var(--local-density-scale,1)); }
  .ba-search-card { gap: 6px; padding: 7px; border-radius: 22px; }
  .ba-icon-button, .ba-filter-button, .ba-add-inline { width: 40px; height: 40px; }
  .class-subject-row { padding: 9px; border-radius: 20px; }
  .ba-avatar { width: 46px; height: 46px; border-radius: 17px; }
  .class-subject-main strong { font-size: 13px; }
  .class-subject-main small { font-size: 11px; }
  .class-subject-main em { font-size: 10.5px; }
  .detail-strip { grid-template-columns: 1fr; }
  .ba-modal, .ba-sheet, .ba-camera-modal { border-radius: 24px; padding: 12px; }
  .ba-modal-actions { margin: 12px -12px -12px; padding: 10px 12px; }
}


/* ======================================================
   GOLDEN THEME MODAL VISIBILITY FIX
   ------------------------------------------------------
   Keeps the More/List/Table/Summary modal readable in
   dark mode, light mode, and custom branch themes.
====================================================== */

.ba-sheet,
.ba-modal,
.ba-drawer,
.ba-panel {
  color: var(--text, #111827);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary-color, #2563eb) 8%, transparent), transparent 20rem),
    var(--card-bg, var(--surface, #ffffff));
  border-color: var(--border, rgba(0,0,0,.12));
}

.ba-sheet-head,
.ba-modal-head,
.ba-drawer-head,
.ba-panel-head {
  color: var(--text, #111827);
}

.ba-sheet-head h2,
.ba-modal-head h2,
.ba-drawer-head h2,
.ba-panel-head h2 {
  color: var(--text, #111827);
}

.ba-sheet-head p,
.ba-modal-head p,
.ba-drawer-head p,
.ba-panel-head p {
  color: var(--muted, #64748b);
}

.ba-sheet-head button,
.ba-modal-head button,
.ba-drawer-head button,
.ba-panel-head button,
.ba-close,
.ba-close-button {
  color: var(--text, #111827) !important;
  background: color-mix(in srgb, var(--card-bg, var(--surface, #ffffff)) 92%, var(--primary-color, #2563eb) 8%) !important;
  border: 1px solid var(--border, rgba(0,0,0,.14)) !important;
  box-shadow: 0 10px 24px rgba(15,23,42,.08);
}

.ba-sheet-head button:hover,
.ba-modal-head button:hover,
.ba-drawer-head button:hover,
.ba-panel-head button:hover,
.ba-close:hover,
.ba-close-button:hover {
  color: #ffffff !important;
  background: var(--primary-color, #2563eb) !important;
  border-color: var(--primary-color, #2563eb) !important;
}

.ba-menu-list,
.ba-view-list,
.ba-more-list {
  color: var(--text, #111827);
}

.ba-menu-list button,
.ba-view-list button,
.ba-more-list button {
  color: var(--text, #111827) !important;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--card-bg, var(--surface, #ffffff)) 96%, var(--primary-color, #2563eb) 4%),
      var(--card-bg, var(--surface, #ffffff))
    ) !important;
  border: 1px solid var(--border, rgba(0,0,0,.12)) !important;
  box-shadow: 0 10px 24px rgba(15,23,42,.05);
}

.ba-menu-list button:hover,
.ba-view-list button:hover,
.ba-more-list button:hover {
  background: color-mix(in srgb, var(--primary-color, #2563eb) 9%, var(--card-bg, var(--surface, #ffffff))) !important;
  border-color: color-mix(in srgb, var(--primary-color, #2563eb) 32%, var(--border, rgba(0,0,0,.12))) !important;
}

.ba-menu-list button.active,
.ba-view-list button.active,
.ba-more-list button.active,
.ba-menu-list button[aria-pressed="true"],
.ba-view-list button[aria-pressed="true"],
.ba-more-list button[aria-pressed="true"] {
  color: var(--text, #111827) !important;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 13%, var(--card-bg, var(--surface, #ffffff))) !important;
  border-color: color-mix(in srgb, var(--primary-color, #2563eb) 42%, var(--border, rgba(0,0,0,.12))) !important;
}

.ba-menu-list button span,
.ba-view-list button span,
.ba-more-list button span {
  color: var(--primary-color, #2563eb) !important;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 12%, transparent) !important;
}

.ba-menu-list button b,
.ba-view-list button b,
.ba-more-list button b,
.ba-menu-list button strong,
.ba-view-list button strong,
.ba-more-list button strong {
  color: var(--text, #111827) !important;
}

.ba-menu-list button small,
.ba-view-list button small,
.ba-more-list button small,
.ba-menu-list button em,
.ba-view-list button em,
.ba-more-list button em {
  color: var(--muted, #64748b) !important;
}

.ba-sheet-actions button,
.ba-modal-actions button,
.ba-drawer-actions button {
  color: var(--text, #111827);
  background: color-mix(in srgb, var(--muted, #64748b) 8%, var(--card-bg, var(--surface, #ffffff)));
  border-color: var(--border, rgba(0,0,0,.12));
}

.ba-sheet-actions button.primary,
.ba-modal-actions button.primary,
.ba-drawer-actions button.primary {
  color: #ffffff;
  background: var(--primary-color, #2563eb);
  border-color: var(--primary-color, #2563eb);
}
@media (min-width:980px){
  .ba-modal-backdrop,
  .ba-sheet-backdrop{
    top:var(--eds-shell-top-offset,0px);
    right:0;
    bottom:0;
    left:var(--portal-content-left,0px);
    width:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }
  .ba-modal,
  .ba-sheet{
    min-width:0;
    max-width:calc(100vw - var(--portal-content-left,0px) - 20px);
  }
}

`;

  return ClassSubjectsWorkspace;
})();

const SUBJECT_SETUP_AREAS: Array<{
  key: SubjectSetupMode;
  title: string;
  short: string;
  description: string;
  icon: string;
}> = [
  {
    key: "subjects",
    title: "Subjects",
    short: "Catalogue",
    description:
      "Create and manage the branch subject catalogue.",
    icon: "S",
  },
  {
    key: "curriculum",
    title: "Curriculum",
    short: "Attachments",
    description:
      "Attach subjects to curriculums and pathways.",
    icon: "C",
  },
  {
    key: "prerequisites",
    title: "Rules",
    short: "Prerequisites",
    description:
      "Configure prerequisite, corequisite and recommended rules.",
    icon: "R",
  },
  {
    key: "classes",
    title: "Classes",
    short: "Assignments",
    description:
      "Assign subjects and teachers to classes and periods.",
    icon: "A",
  },
];

export default function SubjectSetup() {
  const [mode, setMode] =
    useState<SubjectSetupMode>(
      "subjects",
    );

  const [ready, setReady] =
    useState(false);

  useEffect(() => {
    setMode(
      readSubjectSetupMode(),
    );
    setReady(true);
  }, []);

  const changeMode = (
    next: SubjectSetupMode,
  ) => {
    setMode(next);

    try {
      window.localStorage.setItem(
        SUBJECT_SETUP_MODE_KEY,
        next,
      );
    } catch {
      // Local storage is optional.
    }
  };

  const activeArea =
    SUBJECT_SETUP_AREAS.find(
      (area) => area.key === mode,
    ) ?? SUBJECT_SETUP_AREAS[0];

  const ActiveWorkspace =
    mode === "curriculum"
      ? CurriculumSubjectsModule
      : mode === "prerequisites"
        ? SubjectPrerequisitesModule
        : mode === "classes"
          ? ClassSubjectsModule
          : SubjectsModule;

  return (
    <main
      className="subject-setup-root"
      data-mode={mode}
    >
      <style>
        {subjectSetupShellCss}
      </style>

      <section
        className="subject-setup-command"
        aria-label="Subject setup workspace"
      >
        <div className="subject-setup-command-copy">
          <strong>
            Subject Setup
          </strong>

          <small>
            {activeArea.description}
          </small>
        </div>

        <div
          className="subject-setup-mode-switch"
          role="tablist"
          aria-label="Subject setup areas"
        >
          {SUBJECT_SETUP_AREAS.map(
            (area) => (
              <button
                key={area.key}
                type="button"
                role="tab"
                aria-selected={
                  mode === area.key
                }
                className={
                  mode === area.key
                    ? "active"
                    : ""
                }
                onClick={() =>
                  changeMode(area.key)
                }
                title={area.description}
              >
                <span
                  className="subject-setup-tab-icon"
                  aria-hidden="true"
                >
                  {area.icon}
                </span>

                <span>
                  <strong>
                    {area.title}
                  </strong>
                  <small>
                    {area.short}
                  </small>
                </span>
              </button>
            ),
          )}
        </div>
      </section>

      <section
        className="subject-setup-workspace"
        role="tabpanel"
        aria-label={activeArea.title}
      >
        {ready ? (
          <ActiveWorkspace />
        ) : (
          <section className="subject-setup-boot">
            Opening subject setup…
          </section>
        )}
      </section>
      <style>{subjectSetupStudentsParityCss}</style>
    </main>
  );
}

const subjectSetupStudentsParityCss = `
/* STUDENTS V2 parity: compact full-width cards, table headers and actions. */
.subject-setup-root{width:100%;max-width:none;min-width:0;gap:5px!important}
.subject-setup-root .subject-setup-command{margin:0!important;padding:5px!important;border-radius:12px!important;box-shadow:none!important}
.subject-setup-root .subject-setup-command-copy{display:none!important}
.subject-setup-root .subject-setup-mode-switch{width:100%;gap:4px!important}
.subject-setup-root .subject-setup-mode-switch button{padding:6px 8px!important;box-shadow:none!important}
.subject-setup-root .subject-setup-mode-switch small{display:none!important}
.subject-setup-root .ba-page,.subject-setup-root .cs-page{
 width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
 padding:5px!important;margin:0!important;overflow-x:clip!important;
 background:var(--bg,var(--background,#f2f4f7))!important;
}
/* Main controls are registered in the shared portal toolbar, not duplicated. */
.role-shell.branch-workspace-layout .subject-setup-root .ba-search-card,
.role-shell.branch-workspace-layout .subject-setup-root .cs-toolbar,
.subject-setup-root .ba-filter-chips,.subject-setup-root .cs-compact-summary{display:none!important}
.subject-setup-root .ba-list,.subject-setup-root .cs-grid {width:100%!important;max-width:none!important;margin:2px 0!important;display:grid!important;gap:9px!important;grid-template-columns:minmax(0,1fr)!important}
.subject-setup-root .ba-list > :is(.subject-row,.student-row,.class-subject-row),
.subject-setup-root .cs-grid > .cs-card {
 position:relative!important;box-sizing:border-box!important;min-width:0!important;width:100%!important;max-width:none!important;
 margin:0!important;padding:10px!important;border-radius:13px!important;box-shadow:none!important;
 background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%)!important;
 border:1px solid color-mix(in srgb,var(--border,#d4dae3) 85%,var(--text,#182235) 15%)!important;
 color:var(--text,#182235)!important;
}
.subject-setup-root .ba-list > :is(.subject-row,.student-row,.class-subject-row)::before{display:none!important}
.subject-setup-root :is(.subject-main,.student-main,.class-subject-main,.cs-card-copy){min-width:0!important}
.subject-setup-root :is(.subject-main,.student-main,.class-subject-main,.cs-card-copy) strong{font-size:13px!important;font-weight:850!important;color:var(--text,#182235)!important}
.subject-setup-root :is(.subject-main,.student-main,.class-subject-main,.cs-card-copy) :is(small,em){font-size:11px!important;color:var(--muted,#64748b)!important}
.subject-setup-root :is(.ba-avatar,.cs-card-avatar){width:40px!important;height:40px!important;border-radius:12px!important;box-shadow:none!important}
.subject-setup-root :is(.ba-table-card,.cs-table-wrap) {
 box-sizing:border-box!important;width:100%!important;max-width:none!important;min-width:0!important;
 margin:2px 0!important;padding:4px!important;border-radius:13px!important;box-shadow:none!important;
 background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%)!important;
 border:1px solid var(--border,#d4dae3)!important;
}
.subject-setup-root :is(.ba-table-scroll,.cs-table-wrap){max-width:100%!important;overflow-x:auto!important;overscroll-behavior-x:contain!important;scrollbar-width:thin}
.subject-setup-root :is(.ba-table-scroll table,.cs-table){width:100%!important;max-width:none!important;min-width:780px!important;border-collapse:collapse!important;background:var(--card-bg,var(--surface,#fff))!important}
.subject-setup-root :is(.ba-table-scroll th,.ba-table-scroll td,.cs-table th,.cs-table td){padding:9px 10px!important;font-size:12px!important;vertical-align:middle!important;border-bottom:1px solid var(--border,rgba(148,163,184,.2))!important}
.subject-setup-root :is(.ba-table-scroll thead th,.cs-table thead th){position:sticky!important;top:0!important;z-index:2!important;text-transform:uppercase!important;letter-spacing:.045em!important;font-size:10px!important;font-weight:850!important;color:var(--muted,#64748b)!important;background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 85%,var(--text,#182235) 15%)!important}
.subject-setup-root :is(.ba-table-scroll tbody tr,.cs-table tbody tr):nth-child(even){background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 90%,var(--text,#182235) 10%)!important}
.subject-setup-root :is(.ba-table-scroll tbody tr,.cs-table tbody tr):hover{background:color-mix(in srgb,var(--primary-color,#2563eb) 5%,var(--surface,#fff))!important}
.subject-setup-root :is(.ba-table-actions button,.cs-table-actions button){min-height:32px!important;padding:0 9px!important;border-radius:999px!important;box-shadow:none!important;font-size:11px!important}
@media(min-width:680px){.subject-setup-root .ba-list,.subject-setup-root .cs-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(min-width:1040px){.subject-setup-root .ba-list,.subject-setup-root .cs-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
@media(max-width:639px){.subject-setup-root .ba-page,.subject-setup-root .cs-page{padding:3px!important}.subject-setup-root .ba-list,.subject-setup-root .cs-grid{gap:7px!important;grid-template-columns:minmax(0,1fr)!important}}
`;

const subjectSetupShellCss = `
.subject-setup-root {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: grid;
  gap: 10px;
  overflow-x: clip;
  overflow-y: visible;
  color:
    var(
      --eds-text,
      var(--text, #111827)
    );
}

.subject-setup-command {
  position: relative;
  z-index: 5;
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(15,23,42,.09))
    );
  border-radius:
    var(--eds-radius-card, 16px);
  background:
    color-mix(
      in srgb,
      var(
        --eds-header-bg,
        var(--surface, #ffffff)
      ) 96%,
      transparent
    );
  box-shadow:
    var(
      --eds-shadow-soft,
      0 8px 22px rgba(15,23,42,.06)
    );
  backdrop-filter:
    blur(14px)
    saturate(1.06);
  -webkit-backdrop-filter:
    blur(14px)
    saturate(1.06);
}

.subject-setup-command-copy {
  min-width: 0;
  flex: 1;
}

.subject-setup-command-copy strong,
.subject-setup-command-copy small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.subject-setup-command-copy strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );
  font-size: 13px;
  font-weight: 900;
}

.subject-setup-command-copy small {
  margin-top: 3px;
  color:
    var(
      --eds-text-muted,
      var(--muted, #667085)
    );
  font-size: 9px;
  font-weight: 650;
}

.subject-setup-mode-switch {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns:
    repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border:
    1px solid
    var(
      --eds-divider,
      var(--border, rgba(15,23,42,.08))
    );
  border-radius:
    var(--eds-radius-control, 13px);
  background:
    var(
      --eds-surface-sunken,
      color-mix(
        in srgb,
        var(--surface, #ffffff) 82%,
        var(--bg, #f4f7fb)
      )
    );
}

.subject-setup-mode-switch button {
  min-width: 105px;
  min-height: 40px;
  display: grid;
  grid-template-columns:
    27px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  padding: 4px 7px;
  border: 1px solid transparent;
  border-radius:
    calc(
      var(--eds-radius-control, 13px)
      - 3px
    );
  background: transparent;
  color:
    var(
      --eds-text,
      var(--text, #111827)
    );
  text-align: left;
  cursor: pointer;
}

.subject-setup-mode-switch button:hover {
  background:
    var(
      --eds-primary-softer,
      color-mix(
        in srgb,
        var(--primary-color, #2563eb) 7%,
        transparent
      )
    );
}

.subject-setup-mode-switch button.active {
  background:
    var(
      --eds-surface-raised,
      var(--surface, #ffffff)
    );
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  border-color:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 25%,
      var(--eds-border, transparent)
    );
  box-shadow:
    var(
      --eds-shadow-soft,
      0 4px 12px rgba(15,23,42,.07)
    );
}

.subject-setup-tab-icon {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background:
    var(
      --eds-primary-soft,
      color-mix(
        in srgb,
        var(--primary-color, #2563eb) 13%,
        transparent
      )
    );
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 10px;
  font-weight: 950;
}

.subject-setup-mode-switch
button > span:last-child {
  min-width: 0;
}

.subject-setup-mode-switch strong,
.subject-setup-mode-switch small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.subject-setup-mode-switch strong {
  color: inherit;
  font-size: 9.5px;
  font-weight: 850;
}

.subject-setup-mode-switch small {
  margin-top: 2px;
  color:
    var(
      --eds-text-muted,
      var(--muted, #667085)
    );
  font-size: 7.5px;
  font-weight: 650;
}

.subject-setup-workspace {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: auto;
  max-height: none;
  overflow-x: clip;
  overflow-y: visible;
}

.subject-setup-workspace > * {
  min-width: 0;
  max-width: 100%;
}

.subject-setup-boot {
  min-height: 180px;
  display: grid;
  place-items: center;
  border:
    1px solid
    var(--eds-border, rgba(15,23,42,.09));
  border-radius:
    var(--eds-radius-card, 16px);
  background:
    var(--eds-surface, #ffffff);
  color:
    var(--eds-text-muted, #667085);
  font-size: 11px;
  font-weight: 800;
}

@media (max-width: 1100px) {
  .subject-setup-command {
    align-items: stretch;
    flex-direction: column;
    gap: 7px;
  }

  .subject-setup-mode-switch {
    width: 100%;
  }

  .subject-setup-mode-switch button {
    min-width: 0;
  }
}

@media (max-width: 620px) {
  .subject-setup-mode-switch {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 430px) {
  .subject-setup-command {
    padding: 8px;
  }

  .subject-setup-command-copy small {
    white-space: normal;
    line-height: 1.35;
  }

  .subject-setup-mode-switch button {
    grid-template-columns:
      24px minmax(0, 1fr);
    gap: 5px;
  }

  .subject-setup-tab-icon {
    width: 24px;
    height: 24px;
    border-radius: 8px;
  }

  .subject-setup-mode-switch small {
    display: none;
  }
}


`;
