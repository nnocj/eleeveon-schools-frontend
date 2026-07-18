/**
 * app/branch-admin/modules/Organizations.tsx
 * ---------------------------------------------------------
 * ELEEVEON ORGANIZATIONS V3
 * ---------------------------------------------------------
 * Golden Standard Module.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin academic setup page from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all reads and writes now use the resolved workspace schoolId and branchId
 *
 * Data behavior:
 * - Branch scoped and account scoped
 * - Offline first with syncUtils
 * - createLocal(...) for creation
 * - updateLocal(...) for edits and activate/deactivate
 * - softDeleteLocal(...) for deletion
 * - Keeps linked-record awareness before delete
 *
 * Golden UI behavior:
 * - No duplicate hero/header block inside the module
 * - Compact search + inline add + slider filter + More menu
 * - Filters live in a sheet
 * - Table and analytics live under More
 * - Cards use compact row-style actions instead of loud delete UI
 * - Table actions stay horizontal/no-wrap on laptop and desktop
 * - Table headers use theme variables for dark mode
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import {
  db,
  type AssessmentStructure,
  type Class,
  type Curriculum,
  type Expense,
  type Income,
  type Organization,
  type Student,
  type Subject,
  type Teacher,
} from "../../lib/db/db";
import {
  createLocal,
  updateLocal,
  softDeleteLocal,
} from "../../lib/sync/syncUtils";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import {
  softDeleteOwnerFieldAssets,
  MediaOwners,
  commitMediaAssetsToOwner,
  createMediaSessionKey,
  saveImageAsset,



} from "../../lib/media/mediaAssetUtils";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";

type OrganizationType =
  | "department"
  | "faculty"
  | "house"
  | "club"
  | "committee"
  | "administration";

type TenantRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
};

type FormState = {
  id?: number;
  parentOrganizationId: string;
  name: string;
  type: OrganizationType;
  description: string;
  photo: string;
  photoMediaId?: number;
  bannerImage: string;
  bannerImageMediaId?: number;
  active: boolean;
};

type OrganizationView = {
  id: number;
  row: Organization;
  parentName: string;
  childrenCount: number;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  subjectCount: number;
  curriculumCount: number;
  incomeCount: number;
  expenseCount: number;
  financeCount: number;
  assessmentStructureCount: number;
  totalUsage: number;
  active: boolean;
};

const ORGANIZATION_MEDIA_OWNER_TABLE = MediaOwners.ORGANIZATIONS;

const organizationTypes: OrganizationType[] = [
  "department",
  "faculty",
  "house",
  "club",
  "committee",
  "administration",
];

const emptyForm: FormState = {
  parentOrganizationId: "",
  name: "",
  type: "department",
  description: "",
  photo: "",
  photoMediaId: undefined,
  bannerImage: "",
  bannerImageMediaId: undefined,
  active: true,
};

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "").trim();
  if (!media || media.startsWith("blob:") || media.startsWith("data:")) return undefined;
  return media;
};

const idOf = (value: any) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
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

function firstLocalId(...values: unknown[]) {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId")
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
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId")
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
  if (["inactive", "deleted", "deleted", "suspended"].includes(status))
    return false;
  return true;
};

const typeLabel = (type?: string) => {
  if (!type) return "Organization";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const typeTone = (
  type?: OrganizationType,
): "green" | "blue" | "gray" | "orange" | "purple" => {
  if (type === "department") return "blue";
  if (type === "faculty") return "purple";
  if (type === "house") return "green";
  if (type === "club") return "orange";
  if (type === "committee") return "gray";
  return "blue";
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

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <article className="ba-summary">
      <div className="ba-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
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

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <b>{value}</b>
      {label}
    </span>
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
        String(name || "OR")
          .slice(0, 2)
          .toUpperCase()}
    </div>
  );
}

export default function Organizations() {
  const { activeSchool, activeBranch } = useActiveBranch();
  const dataRevision = useBranchTableRevision(["organizations", "students", "teachers", "classes", "subjects", "curriculums", "incomes", "expenses", "assessmentStructures", "mediaAssets", "mediaBlobs"]);
  const mediaSessionKeyRef = useRef(createMediaSessionKey(ORGANIZATION_MEDIA_OWNER_TABLE));
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
  const [rows, setRows] = useState<Organization[]>([]);
  const mediaById = useEntityMediaUrls({
    accountId,
    ownerTable: ORGANIZATION_MEDIA_OWNER_TABLE,
    rows,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "bannerImage", mediaIdKey: "bannerImageMediaId" },
    ],
  });
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [assessmentStructures, setAssessmentStructures] = useState<
    AssessmentStructure[]
  >([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterParentId, setFilterParentId] = useState("all");
  const [filterType, setFilterType] = useState<"all" | OrganizationType>("all");
  const [filterStatus, setFilterStatus] = useState("active");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrganizationView | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4200);
  };

  const clearData = () => {
    setRows([]);
    setStudents([]);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setCurriculums([]);
    setIncomes([]);
    setExpenses([]);
    setAssessmentStructures([]);
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
        organizationRows,
        studentRows,
        teacherRows,
        classRows,
        subjectRows,
        curriculumRows,
        incomeRows,
        expenseRows,
        assessmentStructureRows,
      ] = await Promise.all([
        tableSafe("organizations")?.toArray?.() || [],
        tableSafe("students")?.toArray?.() || [],
        tableSafe("teachers")?.toArray?.() || [],
        tableSafe("classes")?.toArray?.() || [],
        tableSafe("subjects")?.toArray?.() || [],
        tableSafe("curriculums")?.toArray?.() || [],
        tableSafe("incomes")?.toArray?.() || [],
        tableSafe("expenses")?.toArray?.() || [],
        tableSafe("assessmentStructures")?.toArray?.() || [],
      ]);

      setRows(
        (organizationRows as Organization[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setStudents(
        (studentRows as Student[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setTeachers(
        (teacherRows as Teacher[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setClasses(
        (classRows as Class[]).filter((row) => sameTenant(row as TenantRow)),
      );
      setSubjects(
        (subjectRows as Subject[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setCurriculums(
        (curriculumRows as Curriculum[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setIncomes(
        (incomeRows as Income[]).filter((row) => sameTenant(row as TenantRow)),
      );
      setExpenses(
        (expenseRows as Expense[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setAssessmentStructures(
        (assessmentStructureRows as AssessmentStructure[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load organizations.");
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

  const organizationMap = useMemo(() => {
    const map = new Map<number, Organization>();
    rows.forEach((row: any) => map.set(idOf(row.id), row));
    return map;
  }, [rows]);

  const availableParents = useMemo(() => {
    return rows
      .filter((row: any) => {
        if (form.id && sameId(row.id, form.id)) return false;
        return isActiveRow(row);
      })
      .sort((a: any, b: any) =>
        String(a.name || "").localeCompare(String(b.name || "")),
      );
  }, [rows, form.id]);

  const viewRows = useMemo<OrganizationView[]>(() => {
    return rows.map((row: any) => {
      const id = idOf(row.id);
      const parent = row.parentOrganizationId
        ? organizationMap.get(idOf(row.parentOrganizationId))
        : undefined;

      const childrenCount = rows.filter(
        (child: any) => idOf(child.parentOrganizationId) === id,
      ).length;
      const studentCount = students.filter(
        (item: any) => idOf(item.organizationId) === id,
      ).length;
      const teacherCount = teachers.filter(
        (item: any) => idOf(item.organizationId) === id,
      ).length;
      const classCount = classes.filter(
        (item: any) => idOf(item.organizationId) === id,
      ).length;
      const subjectCount = subjects.filter(
        (item: any) => idOf(item.organizationId) === id,
      ).length;
      const curriculumCount = curriculums.filter(
        (item: any) => idOf(item.organizationId) === id,
      ).length;
      const incomeCount = incomes.filter(
        (item: any) => idOf(item.organizationId) === id,
      ).length;
      const expenseCount = expenses.filter(
        (item: any) => idOf(item.organizationId) === id,
      ).length;
      const financeCount = incomeCount + expenseCount;
      const assessmentStructureCount = assessmentStructures.filter(
        (item: any) => idOf(item.organizationId) === id,
      ).length;

      return {
        id,
        row,
        parentName: (parent as any)?.name || "No parent",
        childrenCount,
        studentCount,
        teacherCount,
        classCount,
        subjectCount,
        curriculumCount,
        incomeCount,
        expenseCount,
        financeCount,
        assessmentStructureCount,
        totalUsage:
          childrenCount +
          studentCount +
          teacherCount +
          classCount +
          subjectCount +
          curriculumCount +
          financeCount +
          assessmentStructureCount,
        active: isActiveRow(row),
      };
    });
  }, [
    assessmentStructures,
    classes,
    curriculums,
    expenses,
    incomes,
    organizationMap,
    rows,
    students,
    subjects,
    teachers,
  ]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row: any = item.row;
        const parentOk =
          filterParentId === "all" ||
          sameId(row.parentOrganizationId, filterParentId);
        const typeOk = filterType === "all" || row.type === filterType;
        const statusOk =
          filterStatus === "all" ||
          (filterStatus === "active" ? item.active : !item.active);

        const haystack =
          `${row.name} ${row.type} ${row.description || ""} ${item.parentName}`.toLowerCase();
        return (
          parentOk && typeOk && statusOk && (!term || haystack.includes(term))
        );
      })
      .sort((a, b) => {
        const typeCompare = String((a.row as any).type || "").localeCompare(
          String((b.row as any).type || ""),
        );
        if (typeCompare !== 0) return typeCompare;
        return String((a.row as any).name || "").localeCompare(
          String((b.row as any).name || ""),
        );
      });
  }, [filterParentId, filterStatus, filterType, search, viewRows]);

  const summary = useMemo(
    () => ({
      total: viewRows.length,
      active: viewRows.filter((item) => item.active).length,
      inactive: viewRows.filter((item) => !item.active).length,
      departments: viewRows.filter(
        (item) => (item.row as any).type === "department",
      ).length,
      housesClubs: viewRows.filter((item) =>
        ["house", "club"].includes((item.row as any).type),
      ).length,
      linkedRecords: viewRows.reduce((sum, item) => sum + item.totalUsage, 0),
    }),
    [viewRows],
  );

  const countsByType = useMemo(() => {
    const map = new Map<string, number>();
    viewRows.forEach((item) => {
      const key = typeLabel((item.row as any).type);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [viewRows]);

  const countsByUsage = useMemo(() => {
    return viewRows
      .map((item) => ({
        label: (item.row as any).name || "Organization",
        value: item.totalUsage,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [viewRows]);

  const activeFilterCount = useMemo(() => {
    return [filterParentId, filterType, filterStatus].filter(
      (value) => value !== "all" && value !== "active",
    ).length;
  }, [filterParentId, filterStatus, filterType]);

  const hierarchyRows = useMemo(() => {
    return viewRows.filter(
      (item) => !idOf((item.row as any).parentOrganizationId),
    );
  }, [viewRows]);

  const childrenOf = (parentId: number) =>
    viewRows
      .filter(
        (item) => idOf((item.row as any).parentOrganizationId) === parentId,
      )
      .sort((a, b) =>
        String((a.row as any).name || "").localeCompare(
          String((b.row as any).name || ""),
        ),
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
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        ownerTable: ORGANIZATION_MEDIA_OWNER_TABLE,
        ownerLocalId: form.id || undefined,
        ownerTempKey: form.id ? undefined : mediaSessionKeyRef.current,
        fieldKey: field,
        variant: field === "photo" ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateForm({
        [field]: result.previewUrl,
        [field === "photo" ? "photoMediaId" : "bannerImageMediaId"]: result.assetId,
      } as Partial<FormState>);

      showToast("info", `${field === "photo" ? "Photo" : "Banner"} prepared. Save to attach and upload it.`);
    } catch (error: any) {
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const requireContext = () => {
    if (!authenticated || !accountId) {
      showToast("error", "Sign in first.");
      return false;
    }

    if (!schoolId || !branchId) {
      showToast("error", "Select a school branch first.");
      return false;
    }

    return true;
  };

  const openCreate = () => {
    if (!requireContext()) return;
    mediaSessionKeyRef.current = createMediaSessionKey(ORGANIZATION_MEDIA_OWNER_TABLE);
    setForm({
      ...emptyForm,
      type: filterType === "all" ? "department" : filterType,
      parentOrganizationId: filterParentId !== "all" ? filterParentId : "",
    });
    setModalOpen(true);
  };

  const openEdit = (item: OrganizationView) => {
    const row: any = item.row;

    setSelectedItem(null);
    setForm({
      id: idOf(row.id),
      parentOrganizationId: row.parentOrganizationId
        ? String(row.parentOrganizationId)
        : "",
      name: row.name || "",
      type: (row.type || "department") as OrganizationType,
      description: row.description || "",
      photo: mediaById[idOf(row.id)]?.photo || safeRecordMediaValue(row.photo) || "",
      photoMediaId: row.photoMediaId ? Number(row.photoMediaId) : undefined,
      bannerImage: mediaById[idOf(row.id)]?.bannerImage || safeRecordMediaValue(row.bannerImage) || "",
      bannerImageMediaId: row.bannerImageMediaId ? Number(row.bannerImageMediaId) : undefined,
      active: item.active,
    });

    setModalOpen(true);
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId || !branchId) return "Select a school branch first.";
    if (!form.name.trim()) return "Enter organization name.";
    if (!form.type) return "Select organization type.";

    if (
      form.parentOrganizationId &&
      form.id &&
      sameId(form.parentOrganizationId, form.id)
    ) {
      return "An organization cannot be its own parent.";
    }

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;

      return (
        safeLower(row.name) === safeLower(form.name) &&
        row.type === form.type &&
        sameId(row.parentOrganizationId || 0, form.parentOrganizationId || 0)
      );
    });

    if (duplicate)
      return "An organization with this name, type and parent already exists.";

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

      const payload: Partial<Organization> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        parentOrganizationId: form.parentOrganizationId
          ? idOf(form.parentOrganizationId)
          : undefined,
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || undefined,
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue(form.bannerImage),
        bannerImageMediaId: form.bannerImageMediaId || undefined,
        active: form.active,
        status: form.active ? "active" : "inactive",
        isDeleted: false,
      } as unknown as Partial<Organization>;

      const savedOrganization =
        form.id && existing
          ? await updateLocal("organizations", Number(form.id), payload)
          : await createLocal("organizations", payload as unknown as Organization);

      const savedOrganizationId = Number((savedOrganization as any)?.id || form.id || 0);

      if (savedOrganizationId) {
        await commitMediaAssetsToOwner({
          accountId: String(accountId),
          ownerTable: ORGANIZATION_MEDIA_OWNER_TABLE,
          ownerLocalId: savedOrganizationId,
          ownerCloudId: (savedOrganization as any)?.cloudId || (existing as any)?.cloudId,
          ownerTempKey: mediaSessionKeyRef.current,
          assets: [
            { assetId: form.photoMediaId, fieldKey: "photo" },
            { assetId: form.bannerImageMediaId, fieldKey: "bannerImage" },
          ],
        });
      }

      mediaSessionKeyRef.current = createMediaSessionKey(ORGANIZATION_MEDIA_OWNER_TABLE);
      setModalOpen(false);
      showToast("success", "Organization saved.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not save organization.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: OrganizationView) => {
    const row: any = item.row;
    if (!row.id) return;

    try {
      await updateLocal("organizations", Number(row.id), {
        active: !item.active,
        status: !item.active ? "active" : "inactive",
        isDeleted: false,
      } as unknown as Partial<Organization>);
      showToast(
        "success",
        item.active ? "Organization deactivated." : "Organization activated.",
      );
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not update organization status.");
    }
  };

  const remove = async (item: OrganizationView) => {
    const row: any = item.row;
    const id = idOf(row.id);
    if (!id) return;

    const warning = item.totalUsage
      ? `"${row.name}" has ${item.totalUsage} linked record(s). Delete anyway?`
      : `Delete "${row.name}"?`;

    if (!window.confirm(warning)) return;

    try {

      await Promise.all(

        ["photo", "bannerImage"].map((fieldKey) =>

          softDeleteOwnerFieldAssets({

            accountId: String(accountId),

            ownerTable: "organizations",

            ownerLocalId: Number(id),

            fieldKey,

          }),

        ),

      );

      await softDeleteLocal("organizations", Number(id));
      setSelectedItem(null);
      showToast("success", "Organization deleted.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not delete organization.");
    }
  };

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <div className="ba-spinner" />
          <h2>Loading Organizations...</h2>
          <p>
            Preparing branch structure, departments, houses, clubs, and linked
            records.
          </p>
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
          <button type="button" onClick={() => setToast(null)}>
            ✕
          </button>
        </section>
      )}

      <section className="ba-hero">
        <div className="ba-hero-left">
          <div className="ba-hero-icon">🏛️</div>
          <div className="ba-title">
            <p>Branch Structure</p>
            <h2>Organizations</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="ba-hero-actions">
          <div className="ba-switch">
            <button
              type="button"
              className={viewMode === "cards" ? "active" : ""}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={viewMode === "table" ? "active" : ""}
              onClick={() => setViewMode("table")}
            >
              Table
            </button>
            <button
              type="button"
              className={viewMode === "summary" ? "active" : ""}
              onClick={() => setViewMode("summary")}
            >
              Summary
            </button>
          </div>

          <button type="button" className="ba-ghost" onClick={load}>
            Refresh
          </button>

          <button type="button" className="ba-primary" onClick={openCreate}>
            New Organization
          </button>
        </div>
      </section>

      <section
        className="ba-search-card"
        aria-label="Organization search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search organizations..."
            aria-label="Search organizations"
          />
        </label>
        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add organization"
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

      {!authenticated || !accountId || !schoolId || !branchId ? (
        <section className="ba-warning">
          Select an active school branch and make sure you are signed in before
          creating organizations.
        </section>
      ) : null}

      {(activeFilterCount > 0 || filterStatus !== "active") && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {filterParentId !== "all" && (
            <button type="button" onClick={() => setFilterParentId("all")}>
              Parent:{" "}
              {filterParentId === "0"
                ? "No parent"
                : (organizationMap.get(idOf(filterParentId)) as any)?.name ||
                  filterParentId}{" "}
              ×
            </button>
          )}
          {filterType !== "all" && (
            <button type="button" onClick={() => setFilterType("all")}>
              Type: {typeLabel(filterType)} ×
            </button>
          )}
          {filterStatus !== "active" && (
            <button type="button" onClick={() => setFilterStatus("active")}>
              Status: {filterStatus} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" ? (
        <section className="ba-analysis-grid organization-analysis-grid">
          <AnalysisCard
            title="Organizations by Type"
            rows={countsByType}
            total={summary.total}
          />
          <AnalysisCard
            title="Linked Record Impact"
            rows={countsByUsage}
            total={Math.max(summary.linkedRecords, 1)}
          />
          <article className="ba-analysis hierarchy-panel">
            <span>Hierarchy</span>
            <strong>{hierarchyRows.length}</strong>
            <p>Top-level organizations and their direct children.</p>
            <div className="hierarchy-list">
              {hierarchyRows.map((item) => {
                const childRows = childrenOf(item.id);
                return (
                  <section key={String(item.id)}>
                    <div>
                      <b>{(item.row as any).name}</b>
                      <small>{childRows.length} child organization(s)</small>
                    </div>
                    {childRows.length ? (
                      <ul>
                        {childRows.slice(0, 6).map((child) => (
                          <li key={String(child.id)}>
                            {(child.row as any).name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
              {!hierarchyRows.length ? <p>No hierarchy found.</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      {viewMode === "table" ? (
        <TableView
          rows={filteredRows}
          openEdit={openEdit}
          toggleActive={toggleActive}
          remove={remove}
        />
      ) : null}

      {viewMode === "cards" ? (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <OrganizationListItem
              key={String(item.id)}
              item={item}
              photo={mediaById[item.id]?.photo || safeRecordMediaValue((item.row as any).photo)}
              primary={primary}
              onOpen={() => setSelectedItem(item)}
            />
          ))}
          {!filteredRows.length ? (
            <Empty
              icon="🏛️"
              title="No organizations found"
              text="Create departments, houses, clubs, committees, faculties, or administrative units for this branch."
            />
          ) : null}
        </section>
      ) : null}

      {filterOpen ? (
        <FilterSheet
          rows={rows}
          filterParentId={filterParentId}
          filterType={filterType}
          filterStatus={filterStatus}
          setFilterParentId={setFilterParentId}
          setFilterType={setFilterType}
          setFilterStatus={setFilterStatus}
          clearFilters={() => {
            setFilterParentId("all");
            setFilterType("all");
            setFilterStatus("active");
          }}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
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
      ) : null}

      {selectedItem ? (
        <ActionSheet
          item={selectedItem}
          openEdit={openEdit}
          toggleActive={toggleActive}
          remove={remove}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}

      {modalOpen ? (
        <div className="ba-modal-backdrop">
          <form className="ba-modal" onSubmit={save}>
            <div className="ba-modal-head">
              <div>
                <h2>{form.id ? "Edit Organization" : "New Organization"}</h2>
                <p>
                  Manage departments, houses, clubs, committees, faculties, and
                  administrative units.
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="ba-form">
              <label>
                <span>Organization Name</span>
                <input
                  value={form.name}
                  onChange={(event) => updateForm({ name: event.target.value })}
                  placeholder="e.g. Mathematics Department, Red House"
                />
              </label>

              <label>
                <span>Type</span>
                <select
                  value={form.type}
                  onChange={(event) =>
                    updateForm({ type: event.target.value as OrganizationType })
                  }
                >
                  {organizationTypes.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Parent Organization</span>
                <select
                  value={form.parentOrganizationId}
                  onChange={(event) =>
                    updateForm({ parentOrganizationId: event.target.value })
                  }
                >
                  <option value="">No parent</option>
                  {availableParents.map((row: any) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {row.name} · {typeLabel(row.type)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Status</span>
                <select
                  value={form.active ? "active" : "inactive"}
                  onChange={(event) =>
                    updateForm({ active: event.target.value === "active" })
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
                  onChange={(event) =>
                    updateForm({ description: event.target.value })
                  }
                  placeholder="Brief description of this organization."
                />
              </label>

              <label>
                <span>Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    handleImageUpload("photo", event.target.files?.[0])
                  }
                />
                {form.photo ? (
                  <img
                    src={form.photo}
                    alt="Organization preview"
                    className="ba-preview-photo"
                  />
                ) : null}
              </label>

              <label>
                <span>Banner Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    handleImageUpload("bannerImage", event.target.files?.[0])
                  }
                />
                {form.bannerImage ? (
                  <img
                    src={form.bannerImage}
                    alt="Organization banner preview"
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
                {saving
                  ? "Saving..."
                  : form.id
                    ? "Save Changes"
                    : "Create Organization"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
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

function OrganizationListItem({
  item,
  photo,
  primary,
  onOpen,
}: {
  item: OrganizationView;
  photo?: string;
  primary: string;
  onOpen: () => void;
}) {
  const row: any = item.row;
  return (
    <button
      type="button"
      className="student-row organization-row"
      onClick={onOpen}
    >
      <Avatar name={row.name} photo={photo} primary={primary} />
      <span className="student-main">
        <strong>{row.name || "Unnamed organization"}</strong>
        <small>
          {typeLabel(row.type)} · Parent: {item.parentName}
        </small>
        <em>
          {item.totalUsage
            ? `${item.totalUsage} linked record(s)`
            : row.description || "No linked records yet"}
        </em>
      </span>
      <span className="student-side">
        <span
          className={`status-dot-mini ${item.active ? "green" : "gray"}`}
          title={item.active ? "Active" : "Inactive"}
          aria-label={item.active ? "Active" : "Inactive"}
        />
        <i>⋯</i>
      </span>
    </button>
  );
}

function FilterSheet({
  rows,
  filterParentId,
  filterType,
  filterStatus,
  setFilterParentId,
  setFilterType,
  setFilterStatus,
  clearFilters,
  onClose,
}: {
  rows: Organization[];
  filterParentId: string;
  filterType: "all" | OrganizationType;
  filterStatus: string;
  setFilterParentId: (value: string) => void;
  setFilterType: (value: "all" | OrganizationType) => void;
  setFilterStatus: (value: string) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose only what you need. The list updates after applying.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>
        <div className="ba-form compact">
          <label>
            <span>Parent</span>
            <select
              value={filterParentId}
              onChange={(event) => setFilterParentId(event.target.value)}
            >
              <option value="all">All parents</option>
              <option value="0">No parent</option>
              {rows.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Type</span>
            <select
              value={filterType}
              onChange={(event) =>
                setFilterType(event.target.value as "all" | OrganizationType)
              }
            >
              <option value="all">All types</option>
              {organizationTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
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
            <small>Compact organization records</small>
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
            <small>Types, hierarchy and linked usage</small>
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
  remove,
  onClose,
}: {
  item: OrganizationView;
  openEdit: (item: OrganizationView) => void;
  toggleActive: (item: OrganizationView) => void;
  remove: (item: OrganizationView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{row.name || "Organization"}</h2>
            <p>
              {typeLabel(row.type)} · {item.active ? "Active" : "Inactive"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close organization actions"
          >
            ✕
          </button>
        </div>
        <div className="student-detail-strip">
          <span>
            <b>Parent</b>
            {item.parentName}
          </span>
          <span>
            <b>Linked</b>
            {item.totalUsage}
          </span>
          <span>
            <b>Children</b>
            {item.childrenCount}
          </span>
        </div>
        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item)}>
            <span>✎</span>
            <b>Edit organization</b>
            <small>Update name, type, parent, media and description</small>
          </button>
          <button type="button" onClick={() => toggleActive(item)}>
            <span>{item.active ? "⏸" : "✓"}</span>
            <b>{item.active ? "Deactivate" : "Activate"}</b>
            <small>Change active status without deleting</small>
          </button>
          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this organization locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openEdit,
  toggleActive,
  remove,
}: {
  rows: OrganizationView[];
  openEdit: (item: OrganizationView) => void;
  toggleActive: (item: OrganizationView) => void;
  remove: (item: OrganizationView) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Organizations ({rows.length})</th>
              <th>Type</th>
              <th>Parent</th>
              <th>Children</th>
              <th>Students</th>
              <th>Teachers</th>
              <th>Classes</th>
              <th>Subjects</th>
              <th>Finance</th>
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
                    <span>{row.description || "No description"}</span>
                  </td>
                  <td>
                    <Chip tone={typeTone(row.type)}>{typeLabel(row.type)}</Chip>
                  </td>
                  <td>{item.parentName}</td>
                  <td>{item.childrenCount}</td>
                  <td>{item.studentCount}</td>
                  <td>{item.teacherCount}</td>
                  <td>{item.classCount}</td>
                  <td>{item.subjectCount}</td>
                  <td>{item.financeCount}</td>
                  <td>
                    <Chip tone={item.active ? "green" : "gray"}>
                      {item.active ? "Active" : "Inactive"}
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
        {!rows.length ? (
          <div className="ba-empty-table">
            No organization matches your filters.
          </div>
        ) : null}
      </div>
    </section>
  );
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
        {rows.slice(0, 9).map((row) => {
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

const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.ba-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow-x: hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after {
  box-sizing: border-box;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea {
  font: inherit;
  max-width: 100%;
}

.ba-page input,
.ba-page select,
.ba-page textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #111827);
  outline: none;
  font-weight: 750;
}

.ba-page input,
.ba-page select {
  min-height: 43px;
}

.ba-page textarea {
  min-height: 92px;
  padding-top: 10px;
  resize: vertical;
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(520px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.ba-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent);
  border-top-color: var(--ba-primary);
  animation: spin .8s linear infinite;
}

.ba-state h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-toast {
  position: sticky;
  top: 8px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15, 23, 42, .12);
}

.ba-toast.success { background: #dcfce7; color: #166534; }
.ba-toast.error { background: #fee2e2; color: #991b1b; }
.ba-toast.info { background: #dbeafe; color: #1d4ed8; }

.ba-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

.ba-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .18), transparent 20rem),
    linear-gradient(135deg, var(--ba-primary), #0f172a 76%);
  box-shadow: 0 22px 55px rgba(15, 23, 42, .16);
  overflow: hidden;
}

.ba-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.ba-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: rgba(255, 255, 255, .16);
  border: 1px solid rgba(255, 255, 255, .2);
  color: #fff;
  font-size: 22px;
}

.ba-title {
  min-width: 0;
}

.ba-title p,
.ba-title h2,
.ba-title span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-title p {
  margin: 0 0 2px;
  color: rgba(255, 255, 255, .82);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ba-title h2 {
  margin: 0;
  font-size: clamp(22px, 6vw, 34px);
  font-weight: 1000;
  letter-spacing: -.07em;
  line-height: 1;
}

.ba-title span {
  margin-top: 4px;
  color: rgba(255, 255, 255, .82);
  font-size: 12px;
  font-weight: 750;
}

.ba-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.ba-switch {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .12);
  border: 1px solid rgba(255, 255, 255, .2);
}

.ba-switch button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: transparent;
  color: rgba(255, 255, 255, .72);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-switch button.active {
  background: var(--surface, #fff);
  color: var(--text, #111827);
}

.ba-primary,
.ba-ghost {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-primary {
  border: 0;
  background: var(--surface, #fff);
  color: var(--text, #111827);
}

.ba-ghost {
  border: 1px solid rgba(255, 255, 255, .24);
  background: rgba(255, 255, 255, .13);
  color: #fff;
}

.ba-filter,
.ba-summary,
.ba-card,
.ba-table-card,
.ba-analysis,
.ba-empty,
.ba-modal,
.ba-warning {
  min-width: 0;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
  overflow: hidden;
}

.ba-warning {
  margin-top: 10px;
  padding: 13px;
  color: #7f1d1d;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.55;
  border-color: rgba(239, 68, 68, .18);
  background: rgba(239, 68, 68, .06);
}

.ba-filter {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
}

.ba-filter label,
.ba-form label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.ba-filter span,
.ba-form span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.ba-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.ba-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
}

.ba-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--ba-primary) 12%, #fff);
}

.ba-summary strong,
.ba-summary span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-summary strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-summary span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.ba-grid,
.ba-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.ba-card,
.ba-analysis,
.ba-table-card,
.ba-empty {
  padding: 13px;
}

.organization-card {
  padding: 0;
}

.organization-card .ba-card-head,
.organization-card .ba-mini-chips,
.organization-card .ba-description,
.organization-card .ba-stats,
.organization-card .ba-meta,
.organization-card .ba-actions {
  margin-left: 13px;
  margin-right: 13px;
}

.organization-card .ba-card-head {
  margin-top: 13px;
}

.organization-card .ba-actions {
  margin-bottom: 13px;
}

.organization-banner {
  height: 104px;
  background-size: cover;
  background-position: center;
}

.ba-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.ba-avatar,
.ba-card-icon {
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 19px;
  color: #fff;
  font-size: 13px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15, 23, 42, .12);
}

.ba-card-icon {
  color: var(--ba-primary);
  background: color-mix(in srgb, var(--ba-primary) 12%, #fff);
}

.ba-card-head > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.ba-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-card p,
.ba-description {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.5;
}

.ba-description {
  margin-top: 12px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
}

.ba-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.ba-stats span {
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
  min-width: 0;
  overflow: hidden;
}

.ba-stats b {
  display: block;
  color: var(--text, #111827);
  font-size: 20px;
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.05em;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-meta,
.ba-actions,
.ba-mini-chips,
.ba-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.ba-meta {
  margin-top: 12px;
}

.ba-mini-chips {
  margin-top: 12px;
}

.ba-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}

.ba-actions {
  margin-top: 12px;
}

.ba-actions button,
.ba-table-actions button,
.ba-modal-actions button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 10%, #fff);
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
}

.ba-actions button:first-child,
.ba-table-actions button:first-child,
.ba-modal-actions button:last-child {
  background: var(--ba-primary);
  color: #fff;
}

.ba-actions button.danger,
.ba-table-actions button.danger {
  color: var(--muted,#64748b);
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  border-color: color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10)));
}

.ba-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ba-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.ba-table-card {
  margin-top: 10px;
}

.ba-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, .18);
}

.ba-table-scroll table {
  width: 100%;
  min-width: 1180px;
  border-collapse: collapse;
  background: var(--surface, #fff);
}

.ba-table-scroll th,
.ba-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  vertical-align: top;
  text-align: left;
  font-size: 13px;
}

.ba-table-scroll th {
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
  color: #334155;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.ba-table-scroll td strong,
.ba-table-scroll td span {
  display: block;
}

.ba-table-scroll td strong {
  font-weight: 1000;
}

.ba-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.ba-empty-table {
  padding: 22px;
  text-align: center;
  color: var(--muted, #64748b);
  font-weight: 850;
}

.ba-analysis span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ba-analysis strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(22px, 7vw, 30px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.ba-analysis p {
  margin: 8px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ba-analysis-list,
.hierarchy-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.ba-analysis-list section,
.hierarchy-list section {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
}

.ba-analysis-list section > div:first-child,
.hierarchy-list section > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.ba-analysis-list b,
.ba-analysis-list small,
.hierarchy-list b,
.hierarchy-list small,
.hierarchy-list li {
  font-size: 12px;
}

.ba-analysis-list small,
.hierarchy-list small {
  color: var(--muted, #64748b);
  font-weight: 850;
}

.hierarchy-list ul {
  margin: 0;
  padding-left: 18px;
  color: #475569;
}

.ba-progress {
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.ba-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ba-primary);
}

.ba-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 220px;
  text-align: center;
  border-style: dashed;
}

.ba-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--ba-primary) 12%, #fff);
  font-size: 28px;
}

.ba-empty h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.ba-empty p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15, 23, 42, .58);
  backdrop-filter: blur(12px);
}

.ba-modal {
  width: min(960px, 100%);
  max-height: min(92dvh, 900px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  box-shadow: 0 30px 90px rgba(15, 23, 42, .35);
}

.ba-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 14px;
}

.ba-modal-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-modal-head p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ba-modal-head button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text, #111827);
  font-weight: 1000;
  cursor: pointer;
}

.ba-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ba-form .wide {
  grid-column: 1 / -1;
}

.ba-preview-photo {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, .22);
}

.ba-preview-banner {
  width: 100%;
  height: 130px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, .22);
}

.ba-modal-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, #fff 70%, transparent);
}

.ba-modal-actions button:first-child {
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text, #111827);
}

@media (min-width: 680px) {
  .ba-page {
    padding: 12px;
  }

  .organization-filter {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, .8fr) minmax(0, .8fr) minmax(0, .8fr);
  }

  .ba-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ba-grid,
  .ba-analysis-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ba-form {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ba-modal-backdrop {
    place-items: center;
    padding: 18px;
  }

  .ba-modal {
    padding: 18px;
  }
}

@media (min-width: 1040px) {
  .ba-page {
    padding: 16px;
  }

  .organization-summary-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .ba-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .organization-analysis-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .ba-page {
    padding: 6px;
  }

  .ba-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .ba-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .ba-switch,
  .ba-ghost,
  .ba-primary {
    width: 100%;
  }

  .ba-switch {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ba-summary-grid {
    gap: 6px;
  }

  .ba-summary {
    padding: 10px;
    border-radius: 19px;
  }

  .ba-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .ba-card,
  .ba-analysis,
  .ba-table-card,
  .ba-empty,
  .ba-modal {
    border-radius: 20px;
    padding: 11px;
  }

  .organization-card {
    padding: 0;
  }

  .organization-card .ba-card-head,
  .organization-card .ba-mini-chips,
  .organization-card .ba-description,
  .organization-card .ba-stats,
  .organization-card .ba-meta,
  .organization-card .ba-actions {
    margin-left: 11px;
    margin-right: 11px;
  }
}


/* Golden Standard overrides copied from Students.tsx density and theme rules. */
.ba-hero,.ba-filter,.ba-summary-grid,.ba-grid{display:none!important}
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827)}
.ba-search-card,.student-row,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px;color:var(--input-text,var(--text,#111827))}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-list{display:grid!important;gap:7px;margin-top:10px}.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.student-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 28%,var(--border,rgba(0,0,0,.10)))}.student-main{display:grid;gap:2px;min-width:0}.student-main strong,.student-main small,.student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.student-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.student-main small{color:var(--muted,#64748b);font-size:12px;font-weight:800}.student-main em{color:var(--muted,#64748b);font-size:11px;font-style:normal;font-weight:750}.student-side{display:grid;justify-items:end;gap:8px;color:var(--muted,#64748b)}.student-side i{font-style:normal;font-weight:1000}.status-dot-mini{width:9px;height:9px;border-radius:999px;display:block;box-shadow:0 0 0 4px color-mix(in srgb,currentColor 12%,transparent)}.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-sheet-backdrop{position:fixed;inset:0;z-index:90;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-sheet{width:min(620px,100%);max-height:min(86dvh,760px);overflow:auto;border-radius:28px;padding:14px;color:var(--text,#111827)}.ba-sheet.small{width:min(460px,100%)}.ba-sheet-head,.ba-sheet-profile{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.ba-sheet-head h2,.ba-sheet-profile h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p,.ba-sheet-profile p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-sheet-head button,.ba-sheet-profile button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-sheet-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.ba-sheet-actions button{min-height:42px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-weight:950;cursor:pointer}.ba-sheet-actions button.primary{background:var(--ba-primary);color:#fff}.ba-form.compact{display:grid;gap:10px}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"icon title" "icon text";align-items:center;column-gap:10px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:10px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);text-align:left;cursor:pointer}.ba-menu-list button span{grid-area:icon;width:34px;height:34px;border-radius:14px;display:grid;place-items:center;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b{grid-area:title;font-size:13px;font-weight:1000}.ba-menu-list button small{grid-area:text;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{border-color:var(--ba-primary);background:color-mix(in srgb,var(--ba-primary) 12%,var(--card-bg,#fff))}.ba-menu-list button.active span{background:var(--ba-primary);color:#fff}.ba-menu-list button.danger span{background:color-mix(in srgb,var(--muted,#64748b) 10%,transparent);color:var(--muted,#64748b)}.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:10px}.student-detail-strip span{display:grid;gap:2px;padding:9px;border-radius:15px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:800;overflow:hidden}.student-detail-strip b{color:var(--text,#111827);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.ba-table-card{margin-top:10px;padding:0;border-radius:24px;overflow:hidden}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border:0;border-radius:0}.ba-table-scroll table{width:100%;min-width:1180px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.10));vertical-align:middle;text-align:left;color:var(--text,#111827);font-size:13px}.ba-table-scroll th{background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex!important;flex-wrap:nowrap!important;align-items:center;gap:6px;white-space:nowrap;min-width:max-content}.ba-table-actions button{flex:0 0 auto;min-height:32px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--card-bg,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer}.ba-table-actions button:first-child{background:var(--ba-primary);color:#fff}.ba-table-actions button.ba-delete{color:var(--muted,#64748b)!important;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff))!important;border:1px solid color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10)))!important}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis-list section,.hierarchy-list section{background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-progress{background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent)}.ba-progress i{background:var(--ba-primary)}.ba-modal-actions{background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}
@media(min-width:680px){.ba-page{padding:12px}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form.compact{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1040px){.ba-page{padding:16px}.ba-list{max-width:1180px;margin-left:auto;margin-right:auto}.organization-analysis-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:520px){.ba-page{padding:6px}.ba-search-card{grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;padding:7px;border-radius:21px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:40px;height:40px}.student-detail-strip{grid-template-columns:1fr}.ba-sheet{border-radius:24px;padding:12px}}


/* Golden desktop card density for Organizations.
   The list stays one column on phones, then scales up like the Students golden layout
   so large screens show more compact records instead of oversized full-width cards. */
.organization-row {
  min-height: 76px;
}

.organization-row .ba-avatar {
  width: 48px;
  height: 48px;
  flex-basis: 48px;
}

@media (min-width: 680px) {
  .ba-list {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    max-width: 1180px;
    margin-left: auto;
    margin-right: auto;
  }
}

@media (min-width: 1040px) {
  .ba-list {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}

@media (min-width: 1360px) {
  .ba-list {
    max-width: 1320px;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 679px) {
  .ba-list {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}
`;
