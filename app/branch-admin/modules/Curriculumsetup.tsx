"use client";

/**
 * app/branch-admin/modules/Curriculumsetup.tsx
 * ---------------------------------------------------------
 * ELEEVEON CURRICULUM SETUP V3
 * ---------------------------------------------------------
 * Golden Standard Module
 *
 * Purpose:
 * - Manage curriculums only.
 * - Pathway logic intentionally removed; pathways belong in CurriculumPathways.tsx.
 * - Branch scoped, offline first, mobile first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin academic setup page from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all reads and writes now use the resolved workspace schoolId and branchId
 *
 * Data:
 * - curriculums
 * - academicStructures
 * - programs
 * - organizations
 * - curriculumPathways, curriculumSubjects, studentCurriculums are read only for usage counts.
 *
 * Sync behavior:
 * - createLocal(...) for creation
 * - updateLocal(...) for edits/status changes
 * - softDeleteLocal(...) for local soft delete
 * - listActiveLocal(...) for active lookup tables
 *
 * Golden UI behavior:
 * - no duplicate hero/header block inside module
 * - compact search + inline add + slider filter + More menu
 * - filters live in a sheet
 * - table/analytics live under More
 * - large screens show more compact cards per row
 * - table headers use Students.tsx theme-safe variables for dark mode
 * - table actions stay horizontal and no-wrap
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSettings } from "../../context/settings-context";
import {
  db,
  type AcademicStructure,
  type Curriculum,
  type CurriculumPathway,
  type CurriculumSubject,
  type Organization,
  type Program,
  type StudentCurriculum,
} from "../../lib/db/db";
import {
  createLocal,
  listActiveLocal,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import {
  softDeleteOwnerFieldAssets,
  MediaOwners,
  commitMediaAssetsToOwner,
  createMediaSessionKey,
  saveImageAsset,
} from "../../lib/media/mediaAssetUtils";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type CurriculumView = {
  id: string;
  row: Curriculum;
  academicStructureName: string;
  programName: string;
  organizationName: string;
  pathwayCount: number;
  subjectCount: number;
  studentCount: number;
  active: boolean;
  locked: boolean;
};

type FormState = {
  id?: string;
  academicStructureId: string;
  programId: string;
  organizationId: string;
  name: string;
  code: string;
  description: string;
  curriculumVersion: string;
  totalCredits: string;
  durationPeriods: string;
  effectiveFrom: string;
  effectiveTo: string;
  photo: string;
  photoMediaId?: string;
  bannerImage: string;
  bannerImageMediaId?: string;
  active: boolean;
  locked: boolean;
};

const CURRICULUM_MEDIA_OWNER_TABLE = MediaOwners.CURRICULUMS;

const emptyForm: FormState = {
  academicStructureId: "",
  programId: "",
  organizationId: "",
  name: "",
  code: "",
  description: "",
  curriculumVersion: "",
  totalCredits: "",
  durationPeriods: "",
  effectiveFrom: "",
  effectiveTo: "",
  photo: "",
  photoMediaId: undefined,
  bannerImage: "",
  bannerImageMediaId: undefined,
  active: true,
  locked: false,
};

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "").trim();
  if (!media || media.startsWith("blob:") || media.startsWith("data:"))
    return undefined;
  return media;
};

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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
  const status = safeLower(row?.status);
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  if (["inactive", "deleted", "archived", "suspended"].includes(status))
    return false;
  return true;
};

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

const periodText = (from?: string, to?: string) => {
  if (!from && !to) return "Not set";
  if (from && to) return `${timeText(from)} → ${timeText(to)}`;
  return from ? `From ${timeText(from)}` : `Until ${timeText(to)}`;
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

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span>
      <b>{value}</b>
      {label}
    </span>
  );
}

export default function Curriculumsetup() {
  const dataRevision = useBranchTableRevision([
    "curriculums",
    "academicStructures",
    "programs",
    "organizations",
    "curriculumPathways",
    "curriculumSubjects",
    "studentCurriculums",
    "mediaAssets",
    "mediaBlobs",
  ]);
  const mediaSessionKeyRef = useRef(
    createMediaSessionKey(CURRICULUM_MEDIA_OWNER_TABLE),
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
  const [rows, setRows] = useState<Curriculum[]>([]);
  const resolvedMediaById = useEntityMediaUrls({
    accountId,
    ownerTable: "curriculums",
    rows: rows,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "bannerImage", mediaIdKey: "bannerImageMediaId" },
    ],
  });
  const [academicStructures, setAcademicStructures] = useState<
    AcademicStructure[]
  >([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<
    CurriculumSubject[]
  >([]);
  const [studentCurriculums, setStudentCurriculums] = useState<
    StudentCurriculum[]
  >([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterAcademicStructureId, setFilterAcademicStructureId] =
    useState("all");
  const [filterProgramId, setFilterProgramId] = useState("all");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "inactive" | "locked"
  >("active");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CurriculumView | null>(null);
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
      () =>
        setToast((current) => (current?.message === message ? null : current)),
      4200,
    );
  };

  const clearData = () => {
    setRows([]);
    setAcademicStructures([]);
    setPrograms([]);
    setOrganizations([]);
    setPathways([]);
    setCurriculumSubjects([]);
    setStudentCurriculums([]);
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
        curriculumRows,
        academicStructureRows,
        programRows,
        organizationRows,
        pathwayRows,
        curriculumSubjectRows,
        studentCurriculumRows,
      ] = await Promise.all([
        tableSafe("curriculums")?.toArray?.() || [],
        listActiveLocal("academicStructures", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("programs", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("organizations", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        tableSafe("curriculumPathways")?.toArray?.() || [],
        tableSafe("curriculumSubjects")?.toArray?.() || [],
        tableSafe("studentCurriculums")?.toArray?.() || [],
      ]);

      setRows(
        (curriculumRows as Curriculum[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setAcademicStructures(
        (academicStructureRows as AcademicStructure[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setPrograms(
        (programRows as Program[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setPathways(
        (pathwayRows as CurriculumPathway[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setCurriculumSubjects(
        (curriculumSubjectRows as CurriculumSubject[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setStudentCurriculums(
        (studentCurriculumRows as StudentCurriculum[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load curriculums.");
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

  const academicStructureMap = useMemo(
    () => new Map(academicStructures.map((row: any) => [idOf(row.id), row])),
    [academicStructures],
  );
  const programMap = useMemo(
    () => new Map(programs.map((row: any) => [idOf(row.id), row])),
    [programs],
  );
  const organizationMap = useMemo(
    () => new Map(organizations.map((row: any) => [idOf(row.id), row])),
    [organizations],
  );

  const usage = useMemo(() => {
    const pathwayMap = new Map<string, number>();
    const subjectMap = new Map<string, number>();
    const studentMap = new Map<string, number>();

    pathways.forEach((row: any) => {
      const id = idOf(row.curriculumId);
      if (id) pathwayMap.set(id, (pathwayMap.get(id) || 0) + 1);
    });

    curriculumSubjects.forEach((row: any) => {
      const id = idOf(row.curriculumId);
      if (id) subjectMap.set(id, (subjectMap.get(id) || 0) + 1);
    });

    studentCurriculums.forEach((row: any) => {
      const id = idOf(row.curriculumId);
      if (id) studentMap.set(id, (studentMap.get(id) || 0) + 1);
    });

    return { pathwayMap, subjectMap, studentMap };
  }, [curriculumSubjects, pathways, studentCurriculums]);

  const viewRows = useMemo<CurriculumView[]>(
    () =>
      rows.map((row: any) => {
        const id = idOf(row.id);
        const academicStructure = academicStructureMap.get(
          idOf(row.academicStructureId),
        );
        const program = programMap.get(idOf(row.programId));
        const organization = organizationMap.get(idOf(row.organizationId));

        return {
          id,
          row,
          academicStructureName:
            academicStructure?.name || "No academic structure",
          programName: program?.name || "No program",
          organizationName: organization?.name || "No organization",
          pathwayCount: usage.pathwayMap.get(id) || 0,
          subjectCount: usage.subjectMap.get(id) || 0,
          studentCount: usage.studentMap.get(id) || 0,
          active: isActiveRow(row),
          locked: row.locked === true,
        };
      }),
    [academicStructureMap, organizationMap, programMap, rows, usage],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return viewRows
      .filter((item) => {
        const row: any = item.row;
        if (
          filterAcademicStructureId !== "all" &&
          !sameId(row.academicStructureId, filterAcademicStructureId)
        )
          return false;
        if (
          filterProgramId !== "all" &&
          !sameId(row.programId, filterProgramId)
        )
          return false;
        if (
          filterOrganizationId !== "all" &&
          !sameId(row.organizationId, filterOrganizationId)
        )
          return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;
        if (filterStatus === "locked" && !item.locked) return false;
        if (!term) return true;
        return `${row.name} ${row.code || ""} ${row.description || ""} ${row.curriculumVersion || ""} ${item.academicStructureName} ${item.programName} ${item.organizationName}`
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) =>
        String((a.row as any).name || "").localeCompare(
          String((b.row as any).name || ""),
        ),
      );
  }, [
    filterAcademicStructureId,
    filterOrganizationId,
    filterProgramId,
    filterStatus,
    search,
    viewRows,
  ]);

  const summary = useMemo(
    () => ({
      total: viewRows.length,
      active: viewRows.filter((item) => item.active).length,
      inactive: viewRows.filter((item) => !item.active).length,
      locked: viewRows.filter((item) => item.locked).length,
      pathways: viewRows.reduce((sum, item) => sum + item.pathwayCount, 0),
      subjects: viewRows.reduce((sum, item) => sum + item.subjectCount, 0),
      students: viewRows.reduce((sum, item) => sum + item.studentCount, 0),
      showing: filteredRows.length,
    }),
    [filteredRows.length, viewRows],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        filterAcademicStructureId,
        filterProgramId,
        filterOrganizationId,
        filterStatus,
      ].filter((value) => value !== "all" && value !== "active").length,
    [
      filterAcademicStructureId,
      filterOrganizationId,
      filterProgramId,
      filterStatus,
    ],
  );

  const countsByAcademicStructure = useMemo(
    () => groupedCounts(viewRows, (item) => item.academicStructureName),
    [viewRows],
  );
  const countsByProgram = useMemo(
    () => groupedCounts(viewRows, (item) => item.programName),
    [viewRows],
  );
  const countsByStatus = useMemo(
    () =>
      groupedCounts(viewRows, (item) =>
        item.locked ? "Locked" : item.active ? "Active" : "Inactive",
      ),
    [viewRows],
  );

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
        ownerTable: CURRICULUM_MEDIA_OWNER_TABLE,
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

  const clearFilters = () => {
    setFilterAcademicStructureId("all");
    setFilterProgramId("all");
    setFilterOrganizationId("all");
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
    mediaSessionKeyRef.current = createMediaSessionKey(
      CURRICULUM_MEDIA_OWNER_TABLE,
    );
    setSelectedItem(null);
    setForm({
      ...emptyForm,
      academicStructureId:
        filterAcademicStructureId !== "all"
          ? filterAcademicStructureId
          : academicStructures[0]?.id
            ? String(academicStructures[0].id)
            : "",
      programId: filterProgramId !== "all" ? filterProgramId : "",
      organizationId:
        filterOrganizationId !== "all" ? filterOrganizationId : "",
    });
    setModalOpen(true);
  };

  const openEdit = (item: CurriculumView) => {
    const row: any = item.row;
    setSelectedItem(null);
    setForm({
      id: item.id,
      academicStructureId: row.academicStructureId
        ? String(row.academicStructureId)
        : "",
      programId: row.programId ? String(row.programId) : "",
      organizationId: row.organizationId ? String(row.organizationId) : "",
      name: row.name || "",
      code: row.code || "",
      description: row.description || "",
      curriculumVersion: row.curriculumVersion || "",
      totalCredits: row.totalCredits == null ? "" : String(row.totalCredits),
      durationPeriods:
        row.durationPeriods == null ? "" : String(row.durationPeriods),
      effectiveFrom: row.effectiveFrom || "",
      effectiveTo: row.effectiveTo || "",
      photo: row.photo || "",
      photoMediaId: row.photoMediaId ? String(row.photoMediaId) : undefined,
      bannerImage: row.bannerImage || "",
      bannerImageMediaId: row.bannerImageMediaId
        ? String(row.bannerImageMediaId)
        : undefined,
      active: item.active,
      locked: item.locked,
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId || !branchId) return "Select a school branch first.";
    if (!form.academicStructureId) return "Select academic structure.";
    if (!form.name.trim()) return "Enter curriculum name.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;
      const sameName = safeLower(row.name) === safeLower(form.name);
      const sameCode =
        !!form.code.trim() && safeLower(row.code) === safeLower(form.code);
      return sameName || sameCode;
    });

    if (duplicate)
      return "A curriculum with this name or code already exists in this branch.";
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
      const payload: Partial<Curriculum> = {
        accountId: String(accountId),
        schoolId: schoolId,
        branchId: branchId,
        academicStructureId: idOf(form.academicStructureId),
        programId: form.programId ? idOf(form.programId) : undefined,
        organizationId: form.organizationId
          ? idOf(form.organizationId)
          : undefined,
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        curriculumVersion: form.curriculumVersion.trim() || undefined,
        totalCredits:
          form.totalCredits === "" ? undefined : Number(form.totalCredits),
        durationPeriods:
          form.durationPeriods === ""
            ? undefined
            : Number(form.durationPeriods),
        effectiveFrom: form.effectiveFrom || undefined,
        effectiveTo: form.effectiveTo || undefined,
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue(form.bannerImage),
        bannerImageMediaId: form.bannerImageMediaId || undefined,
        active: form.active,
        locked: form.locked,
        isDeleted: false,
      } as Partial<Curriculum>;

      const savedCurriculum =
        form.id && existing
          ? await updateLocal("curriculums", String(form.id), payload)
          : await createLocal("curriculums", payload as Curriculum);

      const savedCurriculumId = idOf(
        (savedCurriculum as any)?.id || form.id || 0,
      );

      if (savedCurriculumId) {
        await commitMediaAssetsToOwner({
          accountId: String(accountId),
          ownerTable: CURRICULUM_MEDIA_OWNER_TABLE,
          ownerId: savedCurriculumId,

          ownerTempKey: mediaSessionKeyRef.current,
          assets: [
            { assetId: form.photoMediaId, fieldKey: "photo" },
            { assetId: form.bannerImageMediaId, fieldKey: "bannerImage" },
          ],
        });
      }

      mediaSessionKeyRef.current = createMediaSessionKey(
        CURRICULUM_MEDIA_OWNER_TABLE,
      );
      setModalOpen(false);
      showToast("success", "Curriculum saved.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not save curriculum.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CurriculumView) => {
    if (!item.id) return;
    try {
      await updateLocal("curriculums", item.id, {
        active: !item.active,
        isDeleted: false,
      } as Partial<Curriculum>);
      setSelectedItem(null);
      showToast(
        "success",
        item.active ? "Curriculum deactivated." : "Curriculum activated.",
      );
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not update curriculum status.");
    }
  };

  const toggleLocked = async (item: CurriculumView) => {
    if (!item.id) return;
    try {
      await updateLocal("curriculums", item.id, {
        locked: !item.locked,
        isDeleted: false,
      } as Partial<Curriculum>);
      setSelectedItem(null);
      showToast(
        "success",
        item.locked ? "Curriculum unlocked." : "Curriculum locked.",
      );
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not update curriculum lock.");
    }
  };

  const remove = async (item: CurriculumView) => {
    const totalUsage =
      item.pathwayCount + item.subjectCount + item.studentCount;
    const ok = window.confirm(
      totalUsage
        ? `"${(item.row as any).name}" has ${totalUsage} linked record(s). Delete anyway?`
        : `Delete "${(item.row as any).name}"?`,
    );
    if (!ok) return;
    try {
      await Promise.all(
        ["photo", "bannerImage"].map((fieldKey) =>
          softDeleteOwnerFieldAssets({
            accountId: String(accountId),

            ownerTable: "curriculums",

            ownerId: idOf(item.id) || undefined,

            fieldKey,
          }),
        ),
      );

      await softDeleteLocal("curriculums", item.id);
      setSelectedItem(null);
      showToast("success", "Curriculum deleted.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not delete curriculum.");
    }
  };

  if (accountLoading || settingsLoading || contextLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Curriculum Setup..."
        text="Checking branch context, academic structures, programs, organizations, and curriculums."
      />
    );
  }

  if (!authenticated || !accountId)
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing curriculums."
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
          <p>Curriculums belong to one active school branch.</p>
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
        aria-label="Curriculum search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search curriculums..."
            aria-label="Search curriculums"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add curriculum"
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
          {filterAcademicStructureId !== "all" && (
            <button
              type="button"
              onClick={() => setFilterAcademicStructureId("all")}
            >
              Structure:{" "}
              {(
                academicStructureMap.get(idOf(filterAcademicStructureId)) as any
              )?.name || filterAcademicStructureId}{" "}
              ×
            </button>
          )}
          {filterProgramId !== "all" && (
            <button type="button" onClick={() => setFilterProgramId("all")}>
              Program:{" "}
              {(programMap.get(idOf(filterProgramId)) as any)?.name ||
                filterProgramId}{" "}
              ×
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
          {filterStatus !== "active" && (
            <button type="button" onClick={() => setFilterStatus("active")}>
              Status: {filterStatus} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Curriculums by Academic Structure"
            rows={countsByAcademicStructure}
            total={summary.total}
          />
          <AnalysisCard
            title="Curriculums by Program"
            rows={countsByProgram}
            total={summary.total}
          />
          <AnalysisCard
            title="Curriculums by Status"
            rows={countsByStatus}
            total={summary.total}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>Curriculum record(s) currently match your search and filters.</p>
          </article>
          <article className="ba-analysis">
            <span>Links</span>
            <strong>
              {summary.pathways + summary.subjects + summary.students}
            </strong>
            <p>
              {summary.pathways} pathway links · {summary.subjects} subject
              links · {summary.students} student links.
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          openEdit={openEdit}
          toggleActive={toggleActive}
          toggleLocked={toggleLocked}
          remove={remove}
        />
      )}

      {viewMode === "cards" && (
        <section className="ba-grid">
          {filteredRows.map((item) => (
            <CurriculumCard
              key={String(item.id)}
              item={item}
              onOpen={() => setSelectedItem(item)}
            />
          ))}
          {!filteredRows.length && (
            <Empty
              icon="📚"
              title="No curriculums found"
              text="Create curriculum frameworks for this branch, then manage pathways on the separate pathways page."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          academicStructures={academicStructures}
          programs={programs}
          organizations={organizations}
          filterAcademicStructureId={filterAcademicStructureId}
          filterProgramId={filterProgramId}
          filterOrganizationId={filterOrganizationId}
          filterStatus={filterStatus}
          setFilterAcademicStructureId={setFilterAcademicStructureId}
          setFilterProgramId={setFilterProgramId}
          setFilterOrganizationId={setFilterOrganizationId}
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
          toggleActive={toggleActive}
          toggleLocked={toggleLocked}
          remove={remove}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <CurriculumModal
          form={form}
          saving={saving}
          academicStructures={academicStructures}
          programs={programs}
          organizations={organizations}
          updateForm={updateForm}
          handleImageUpload={handleImageUpload}
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

function CurriculumCard({
  item,
  onOpen,
}: {
  item: CurriculumView;
  onOpen: () => void;
}) {
  const row: any = item.row;
  return (
    <button type="button" className="curriculum-row" onClick={onOpen}>
      <span className="curriculum-icon">📚</span>
      <span className="curriculum-main">
        <strong>{row.name || "Unnamed curriculum"}</strong>
        <small>
          {item.academicStructureName}
          {row.code ? ` · ${row.code}` : ""}
        </small>
        <em>
          {item.pathwayCount} pathways · {item.subjectCount} subjects ·{" "}
          {item.studentCount} students
        </em>
      </span>
      <span className="curriculum-side">
        <span
          className={`status-dot-mini ${item.locked ? "orange" : item.active ? "green" : "gray"}`}
          title={item.locked ? "Locked" : item.active ? "Active" : "Inactive"}
        />
        <i>⋯</i>
      </span>
    </button>
  );
}

function TableView({
  rows,
  openEdit,
  toggleActive,
  toggleLocked,
  remove,
}: {
  rows: CurriculumView[];
  openEdit: (item: CurriculumView) => void;
  toggleActive: (item: CurriculumView) => void;
  toggleLocked: (item: CurriculumView) => void;
  remove: (item: CurriculumView) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Curriculums ({rows.length})</th>
              <th>Code</th>
              <th>Academic Structure</th>
              <th>Program</th>
              <th>Organization</th>
              <th>Version</th>
              <th>Duration</th>
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
                    <span>
                      {row.description ||
                        periodText(row.effectiveFrom, row.effectiveTo)}
                    </span>
                  </td>
                  <td>{row.code || "—"}</td>
                  <td>{item.academicStructureName}</td>
                  <td>{item.programName}</td>
                  <td>{item.organizationName}</td>
                  <td>{row.curriculumVersion || "—"}</td>
                  <td>
                    {row.durationPeriods
                      ? `${row.durationPeriods} period(s)`
                      : "—"}
                  </td>
                  <td>
                    {item.pathwayCount} P · {item.subjectCount} S ·{" "}
                    {item.studentCount} St
                  </td>
                  <td>
                    <Chip
                      tone={
                        item.locked ? "orange" : item.active ? "green" : "gray"
                      }
                    >
                      {item.locked
                        ? "Locked"
                        : item.active
                          ? "Active"
                          : "Inactive"}
                    </Chip>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item)}>
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
            No curriculum matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function FilterSheet(props: {
  academicStructures: AcademicStructure[];
  programs: Program[];
  organizations: Organization[];
  filterAcademicStructureId: string;
  filterProgramId: string;
  filterOrganizationId: string;
  filterStatus: "all" | "active" | "inactive" | "locked";
  setFilterAcademicStructureId: (value: string) => void;
  setFilterProgramId: (value: string) => void;
  setFilterOrganizationId: (value: string) => void;
  setFilterStatus: (value: "all" | "active" | "inactive" | "locked") => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose only what you need. The page updates after applying.</p>
          </div>
          <button type="button" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="ba-form compact">
          <label>
            <span>Academic Structure</span>
            <select
              value={props.filterAcademicStructureId}
              onChange={(e) =>
                props.setFilterAcademicStructureId(e.target.value)
              }
            >
              <option value="all">All structures</option>
              {props.academicStructures.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Program</span>
            <select
              value={props.filterProgramId}
              onChange={(e) => props.setFilterProgramId(e.target.value)}
            >
              <option value="all">All programs</option>
              {props.programs.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
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
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={props.filterStatus}
              onChange={(e) => props.setFilterStatus(e.target.value as any)}
            >
              <option value="active">Active</option>
              <option value="all">All</option>
              <option value="inactive">Inactive</option>
              <option value="locked">Locked</option>
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
    </div>
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
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views are here so the main page stays simple.</p>
          </div>
          <button type="button" onClick={onClose}>
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
            <small>Compact curriculum cards</small>
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense laptop work view</small>
          </button>
          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Structure, program and status summary</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch records</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function ActionSheet({
  item,
  openEdit,
  toggleActive,
  toggleLocked,
  remove,
  onClose,
}: {
  item: CurriculumView;
  openEdit: (item: CurriculumView) => void;
  toggleActive: (item: CurriculumView) => void;
  toggleLocked: (item: CurriculumView) => void;
  remove: (item: CurriculumView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{row.name || "Curriculum"}</h2>
            <p>
              {item.academicStructureName} ·{" "}
              {item.active ? "Active" : "Inactive"}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="student-detail-strip">
          <span>
            <b>Pathways</b>
            {item.pathwayCount}
          </span>
          <span>
            <b>Subjects</b>
            {item.subjectCount}
          </span>
          <span>
            <b>Students</b>
            {item.studentCount}
          </span>
        </div>
        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item)}>
            <span>✎</span>
            <b>Edit curriculum</b>
            <small>Update academic structure, name, dates and settings</small>
          </button>
          <button type="button" onClick={() => toggleActive(item)}>
            <span>{item.active ? "⏸" : "✓"}</span>
            <b>{item.active ? "Deactivate" : "Activate"}</b>
            <small>Change active status</small>
          </button>
          <button type="button" onClick={() => toggleLocked(item)}>
            <span>{item.locked ? "🔓" : "🔒"}</span>
            <b>{item.locked ? "Unlock" : "Lock"}</b>
            <small>Protect or allow edits</small>
          </button>
          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this curriculum locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function CurriculumModal({
  form,
  saving,
  academicStructures,
  programs,
  organizations,
  updateForm,
  handleImageUpload,
  setModalOpen,
  save,
}: {
  form: FormState;
  saving: boolean;
  academicStructures: AcademicStructure[];
  programs: Program[];
  organizations: Organization[];
  updateForm: (patch: Partial<FormState>) => void;
  handleImageUpload: (
    field: "photo" | "bannerImage",
    file?: File,
  ) => void | Promise<void>;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Curriculum" : "Add Curriculum"}</h2>
            <p>
              Curriculums are branch academic frameworks. Manage pathways
              separately.
            </p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)}>
            ✕
          </button>
        </div>
        <section className="ba-form-section">
          <h3>Curriculum</h3>
          <div className="ba-form">
            <label>
              <span>Name</span>
              <input
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="e.g. GES JHS Curriculum"
              />
            </label>
            <label>
              <span>Code</span>
              <input
                value={form.code}
                onChange={(e) => updateForm({ code: e.target.value })}
                placeholder="e.g. GES-JHS"
              />
            </label>
            <label>
              <span>Version</span>
              <input
                value={form.curriculumVersion}
                onChange={(e) =>
                  updateForm({ curriculumVersion: e.target.value })
                }
                placeholder="e.g. 2026"
              />
            </label>
            <label>
              <span>Academic Structure</span>
              <select
                value={form.academicStructureId}
                onChange={(e) =>
                  updateForm({ academicStructureId: e.target.value })
                }
              >
                <option value="">Select structure</option>
                {academicStructures.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Program</span>
              <select
                value={form.programId}
                onChange={(e) => updateForm({ programId: e.target.value })}
              >
                <option value="">No program</option>
                {programs.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Organization</span>
              <select
                value={form.organizationId}
                onChange={(e) => updateForm({ organizationId: e.target.value })}
              >
                <option value="">No organization</option>
                {organizations.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Total Credits</span>
              <input
                type="number"
                value={form.totalCredits}
                onChange={(e) => updateForm({ totalCredits: e.target.value })}
              />
            </label>
            <label>
              <span>Duration Periods</span>
              <input
                type="number"
                value={form.durationPeriods}
                onChange={(e) =>
                  updateForm({ durationPeriods: e.target.value })
                }
              />
            </label>
            <label>
              <span>Effective From</span>
              <input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => updateForm({ effectiveFrom: e.target.value })}
              />
            </label>
            <label>
              <span>Effective To</span>
              <input
                type="date"
                value={form.effectiveTo}
                onChange={(e) => updateForm({ effectiveTo: e.target.value })}
              />
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
            <label>
              <span>Lock</span>
              <select
                value={form.locked ? "locked" : "open"}
                onChange={(e) =>
                  updateForm({ locked: e.target.value === "locked" })
                }
              >
                <option value="open">Open</option>
                <option value="locked">Locked</option>
              </select>
            </label>
            <label>
              <span>Curriculum Photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handleImageUpload("photo", e.target.files?.[0])
                }
              />
              {form.photo && (
                <img
                  src={form.photo}
                  alt="Curriculum preview"
                  className="ba-media-preview"
                />
              )}
            </label>
            <label>
              <span>Banner Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handleImageUpload("bannerImage", e.target.files?.[0])
                }
              />
              {form.bannerImage && (
                <img
                  src={form.bannerImage}
                  alt="Curriculum banner preview"
                  className="ba-media-preview banner"
                />
              )}
            </label>
            <label className="wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="Describe this curriculum."
              />
            </label>
          </div>
        </section>
        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Add Curriculum"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(
  rows: CurriculumView[],
  keyFn: (item: CurriculumView) => string,
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
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page textarea{min-height:92px;padding-top:10px;resize:vertical}.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal,.curriculum-row{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}.ba-toast.error{background:rgba(239,68,68,.12);color:#991b1b}.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{flex:0 0 42px;border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin-top:10px}.curriculum-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.curriculum-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 32%,var(--border,rgba(0,0,0,.10)));box-shadow:0 18px 34px rgba(15,23,42,.07)}.curriculum-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 13%,var(--card-bg,#fff));font-size:22px;flex:0 0 auto}.curriculum-main{display:grid;gap:2px}.curriculum-main strong,.curriculum-main small,.curriculum-main em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.curriculum-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.curriculum-main small{color:var(--muted,#64748b);font-size:12px;font-weight:850}.curriculum-main em{color:var(--muted,#64748b);font-size:11px;font-style:normal;font-weight:750}.curriculum-side{display:flex;align-items:center;gap:9px;color:var(--muted,#64748b)}.curriculum-side i{font-style:normal;font-weight:1000}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-block;box-shadow:0 0 0 4px color-mix(in srgb,currentColor 12%,transparent)}.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.status-dot-mini.orange{background:#f59e0b;color:#f59e0b}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-table-card{margin-top:10px;padding:0;border-radius:24px;overflow:hidden}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10))}.ba-table-scroll table{width:100%;min-width:1240px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px;color:var(--text,#111827)}.ba-table-scroll th{background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,var(--surface,#fff)));color:var(--table-header-text,var(--muted,#64748b));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td strong{font-weight:1000}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;align-items:center;gap:7px;flex-wrap:nowrap;white-space:nowrap}.ba-table-actions button{flex:0 0 auto;min-height:34px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--card-bg,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer}.ba-table-actions button:first-child{background:var(--ba-primary);color:#fff}.ba-table-actions .ba-delete{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));border:1px solid color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10)))}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis{padding:14px;border-radius:24px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;border-radius:24px;padding:13px}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--card-bg,#fff));font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop,.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-sheet,.ba-modal{width:min(760px,100%);max-height:min(92dvh,900px);overflow-y:auto;border-radius:28px;padding:14px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 30px 90px rgba(15,23,42,.35)}.ba-sheet.small{width:min(460px,100%)}.ba-sheet-head,.ba-modal-head,.ba-sheet-profile{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}.ba-sheet-head h2,.ba-modal-head h2,.ba-sheet-profile h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p,.ba-modal-head p,.ba-sheet-profile p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-sheet-head button,.ba-modal-head button,.ba-sheet-profile button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form.compact{margin-top:4px}.ba-form-section{margin-top:10px}.ba-form-section h3{margin:0 0 10px;font-size:13px;font-weight:1000;color:var(--muted,#64748b);text-transform:uppercase;letter-spacing:.08em}.ba-form label{display:grid;gap:6px}.ba-form label span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-form .wide{grid-column:1/-1}.ba-sheet-actions,.ba-modal-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}.ba-sheet-actions button,.ba-modal-actions button{min-height:40px;border:0;border-radius:999px;padding:0 14px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-sheet-actions button.primary,.ba-modal-actions button:last-child{background:var(--ba-primary);color:#fff}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;row-gap:2px;align-items:center;padding:11px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);text-align:left;cursor:pointer}.ba-menu-list button span{grid-row:1/3;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b{font-size:13px;font-weight:1000}.ba-menu-list button small{color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff;box-shadow:0 12px 26px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-menu-list button.active span{background:rgba(255,255,255,.18);color:#fff}.ba-menu-list button.active small{color:rgba(255,255,255,.82)}.ba-menu-list button.danger span{background:color-mix(in srgb,var(--muted,#64748b) 10%,transparent);color:var(--muted,#64748b)}.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:10px}.student-detail-strip span{display:grid;gap:2px;padding:9px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);font-size:12px;font-weight:850}.student-detail-strip b{color:var(--muted,#64748b);font-size:10px;text-transform:uppercase;letter-spacing:.06em}.ba-media-preview{width:72px;height:72px;object-fit:cover;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10));margin-top:6px}.ba-media-preview.banner{width:100%;height:120px}.ba-modal{width:min(960px,100%)}@media (min-width:680px){.ba-page{padding:12px}.ba-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop,.ba-modal-backdrop{place-items:center;padding:18px}.ba-sheet,.ba-modal{padding:18px}}@media (min-width:1040px){.ba-page{padding:16px}.ba-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (min-width:1320px){.ba-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (min-width:1640px){.ba-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}@media (max-width:520px){.ba-page{padding:6px}.ba-search-card{gap:6px;padding:7px;border-radius:22px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:40px;height:40px}.ba-grid{gap:7px}.ba-analysis,.ba-table-card,.ba-empty,.ba-modal,.ba-sheet{border-radius:20px;padding:11px}.student-detail-strip{grid-template-columns:1fr}.ba-modal-actions,.ba-sheet-actions{display:grid;grid-template-columns:1fr}.ba-modal-actions button,.ba-sheet-actions button{width:100%}}
`;
