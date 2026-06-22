"use client";

/**
 * app/branch-admin/modules/Classes.tsx
 * Eleeveon Classes V2.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin module from accidentally using stale school/branch
 *   context left behind by another role or portal
 * - all create/update/media/query operations now use the resolved workspace
 *   schoolId and branchId
 *
 * Upgraded to match the Students.tsx golden standard:
 * - no duplicate module hero/header block
 * - compact search + inline add + slider filter + more menu
 * - filters and advanced views moved into sheets
 * - cards, table and analytics follow the same ba-* pattern
 * - createLocal/updateLocal/softDeleteLocal/listActiveLocal preserved
 * - class photos/banners use mediaAssets instead of storing Base64 in class records
 * - reloads resolve images by ownerTable + ownerLocalId + fieldKey to prevent media bleed
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  type Class,
  type ClassSubject,
  type Organization,
  type Student,
  type StudentEnrollment,
} from "../../lib/db";

import {
  createLocal,
  updateLocal,
  softDeleteLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";
import {
  MediaOwners,
  MediaFieldKeys,
  attachMediaAssetToOwner,
  createMediaSessionKey as createSharedMediaSessionKey,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  revokeMediaObjectUrl,
  saveImageAsset,
} from "../../lib/media/mediaAssetUtils";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
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


type FormState = {
  id?: number;
  organizationId: string;
  name: string;
  code: string;
  level: string;
  photo: string;
  photoMediaId?: number;
  bannerImage: string;
  bannerImageMediaId?: number;
  capacity: string;
  active: boolean;
};

type ClassView = {
  id: number;
  row: Class;
  photoUrl?: string;
  bannerImageUrl?: string;
  organizationName: string;
  studentCount: number;
  subjectCount: number;
  capacity: number;
  capacityUsed: number;
  overCapacity: boolean;
  active: boolean;
};

const emptyForm: FormState = {
  organizationId: "",
  name: "",
  code: "",
  level: "",
  photo: "",
  photoMediaId: undefined,
  bannerImage: "",
  bannerImageMediaId: undefined,
  capacity: "",
  active: true,
};

const idOf = (value: any) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

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

const statusLabel = (active: boolean) => (active ? "Active" : "Inactive");

function statusTone(
  active: boolean,
  overCapacity?: boolean,
): "green" | "red" | "blue" | "orange" | "gray" {
  if (overCapacity) return "orange";
  return active ? "green" : "gray";
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

const CLASS_MEDIA_OWNER_TABLE = MediaOwners.CLASSES;
const createClassMediaSessionKey = () =>
  createSharedMediaSessionKey(CLASS_MEDIA_OWNER_TABLE);
const mediaKey = (classId: number, field: "photo" | "bannerImage") =>
  `${CLASS_MEDIA_OWNER_TABLE}:${classId}:${field}`;

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
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
        String(name || "CL")
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

export default function ClassesPage() {
  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<
    Record<string, string>
  >({});

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "inactive" | "full"
  >("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ClassView | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const mediaSessionKeyRef = useRef(createClassMediaSessionKey());
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!schoolId || !branchId) router.replace("/account");
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
    Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
    setRows([]);
    setOrganizations([]);
    setStudents([]);
    setEnrollments([]);
    setClassSubjects([]);
    setMediaPreviewUrls({});
  };

  const resolveClassMediaUrls = async (classRows: Class[]) => {
    const next: Record<string, string> = {};

    await Promise.all(
      classRows.map(async (classRow: any) => {
        const classId = idOf(classRow.id);
        if (!classId) return;

        const resolveOwnedAssetUrl = async (
          fieldKey: string,
          fallbackMediaId?: number | string | null,
        ) => {
          const ownedAsset = await getOwnerFieldMediaAsset({
            accountId: accountId || undefined,
            ownerTable: CLASS_MEDIA_OWNER_TABLE,
            ownerLocalId: classId,
            ownerCloudId: classRow.cloudId || undefined,
            fieldKey,
          });

          if (ownedAsset?.id) {
            const url = await getMediaObjectUrl(Number(ownedAsset.id));
            if (url) return url;
          }

          const fallbackId = idOf(fallbackMediaId);
          if (!fallbackId) return "";

          const fallbackAsset =
            await tableSafe("mediaAssets")?.get?.(fallbackId);
          const belongsToThisClass =
            fallbackAsset &&
            !fallbackAsset.isDeleted &&
            fallbackAsset.active !== false &&
            fallbackAsset.accountId === accountId &&
            fallbackAsset.ownerTable === CLASS_MEDIA_OWNER_TABLE &&
            fallbackAsset.fieldKey === fieldKey &&
            sameId(fallbackAsset.ownerLocalId, classId);

          if (!belongsToThisClass) return "";
          return getMediaObjectUrl(fallbackId);
        };

        try {
          const photoUrl = await resolveOwnedAssetUrl(
            MediaFieldKeys.PHOTO,
            classRow.photoMediaId,
          );
          if (photoUrl) next[mediaKey(classId, "photo")] = photoUrl;

          const bannerUrl = await resolveOwnedAssetUrl(
            MediaFieldKeys.BANNER,
            classRow.bannerImageMediaId,
          );
          if (bannerUrl) next[mediaKey(classId, "bannerImage")] = bannerUrl;
        } catch (error) {
          console.error("Failed to resolve class media:", classId, error);
        }
      }),
    );

    setMediaPreviewUrls((current) => {
      Object.values(current).forEach((url) => {
        if (!Object.values(next).includes(url)) revokeMediaObjectUrl(url);
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
        organizationRows,
        studentRows,
        enrollmentRows,
        classSubjectRows,
      ] = await Promise.all([
        tableSafe("classes")?.toArray?.() || [],
        listActiveLocal("organizations", {
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
        } as any),
        listActiveLocal("students", {
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
        } as any),
        tableSafe("studentEnrollments")?.toArray?.() || [],
        tableSafe("classSubjects")?.toArray?.() || [],
      ]);

      const scopedClasses = (classRows as Class[])
        .filter((row) => sameTenant(row as TenantRow))
        .sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        );

      setRows(scopedClasses);
      await resolveClassMediaUrls(scopedClasses);

      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setStudents(
        (studentRows as Student[]).filter(
          (row: any) =>
            sameTenant(row as TenantRow) && row.status !== "withdrawn",
        ),
      );
      setEnrollments(
        (enrollmentRows as StudentEnrollment[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setClassSubjects(
        (classSubjectRows as ClassSubject[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error("Failed to load classes:", error);
      clearData();
      showToast("error", "Failed to load classes.");
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
  ]);

  useEffect(() => {
    return () => {
      Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
    };
  }, [mediaPreviewUrls]);

  const organizationMap = useMemo(() => {
    const map = new Map<number, Organization>();
    organizations.forEach((row: any) => map.set(idOf(row.id), row));
    return map;
  }, [organizations]);

  const activeEnrollmentCounts = useMemo(() => {
    const map = new Map<number, number>();
    enrollments.forEach((enrollment: any) => {
      if (enrollment.status !== "active") return;
      const classId = idOf(enrollment.classId);
      if (!classId) return;
      map.set(classId, (map.get(classId) || 0) + 1);
    });
    return map;
  }, [enrollments]);

  const fallbackCurrentClassCounts = useMemo(() => {
    const map = new Map<number, number>();
    students.forEach((student: any) => {
      const classId = idOf(student.currentClassId);
      if (!classId) return;
      map.set(classId, (map.get(classId) || 0) + 1);
    });
    return map;
  }, [students]);

  const classSubjectCounts = useMemo(() => {
    const map = new Map<number, number>();
    classSubjects.forEach((classSubject: any) => {
      if (classSubject.active === false) return;
      const classId = idOf(classSubject.classId);
      if (!classId) return;
      map.set(classId, (map.get(classId) || 0) + 1);
    });
    return map;
  }, [classSubjects]);

  const viewRows = useMemo<ClassView[]>(() => {
    return rows.map((row: any) => {
      const id = idOf(row.id);
      const organization = row.organizationId
        ? (organizationMap.get(idOf(row.organizationId)) as any)
        : undefined;
      const studentCount =
        activeEnrollmentCounts.get(id) ||
        fallbackCurrentClassCounts.get(id) ||
        0;
      const subjectCount = classSubjectCounts.get(id) || 0;
      const capacity = Number(row.capacity || 0);
      const capacityUsed = capacity
        ? Math.min(100, Math.round((studentCount / capacity) * 100))
        : 0;

      return {
        id,
        row,
        photoUrl:
          mediaPreviewUrls[mediaKey(id, "photo")] ||
          safeRecordMediaValue(row.photo),
        bannerImageUrl:
          mediaPreviewUrls[mediaKey(id, "bannerImage")] ||
          safeRecordMediaValue(row.bannerImage),
        organizationName: organization?.name || "No organization",
        studentCount,
        subjectCount,
        capacity,
        capacityUsed,
        overCapacity: !!capacity && studentCount > capacity,
        active: isActiveRow(row),
      };
    });
  }, [
    activeEnrollmentCounts,
    classSubjectCounts,
    fallbackCurrentClassCounts,
    mediaPreviewUrls,
    organizationMap,
    rows,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row: any = item.row;

        if (
          filterOrganizationId !== "all" &&
          !sameId(row.organizationId, filterOrganizationId)
        )
          return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;
        if (
          filterStatus === "full" &&
          !item.overCapacity &&
          item.capacityUsed < 100
        )
          return false;

        if (!query) return true;

        return `${row.name} ${row.code || ""} ${row.level || ""} ${item.organizationName} ${row.capacity || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) =>
        String((a.row as any).name || "").localeCompare(
          String((b.row as any).name || ""),
        ),
      );
  }, [filterOrganizationId, filterStatus, search, viewRows]);

  const summary = useMemo(
    () => ({
      total: viewRows.length,
      active: viewRows.filter((item) => item.active).length,
      inactive: viewRows.filter((item) => !item.active).length,
      students: viewRows.reduce((sum, item) => sum + item.studentCount, 0),
      classSubjects: viewRows.reduce((sum, item) => sum + item.subjectCount, 0),
      fullOrOver: viewRows.filter(
        (item) => item.overCapacity || item.capacityUsed >= 100,
      ).length,
      showing: filteredRows.length,
    }),
    [filteredRows.length, viewRows],
  );

  const activeFilterCount = useMemo(() => {
    return [filterOrganizationId, filterStatus].filter(
      (value) => value !== "all",
    ).length;
  }, [filterOrganizationId, filterStatus]);

  const countsByOrganization = useMemo(
    () => groupedCounts(viewRows, (item) => item.organizationName),
    [viewRows],
  );
  const countsByLevel = useMemo(
    () =>
      groupedCounts(viewRows, (item) =>
        String((item.row as any).level || "No level"),
      ),
    [viewRows],
  );
  const countsByCapacity = useMemo(
    () => [
      {
        label: "Healthy",
        value: viewRows.filter(
          (item) => item.capacity && item.capacityUsed < 80,
        ).length,
      },
      {
        label: "Near Full",
        value: viewRows.filter(
          (item) =>
            item.capacity && item.capacityUsed >= 80 && item.capacityUsed < 100,
        ).length,
      },
      {
        label: "Full / Over",
        value: viewRows.filter(
          (item) => item.overCapacity || item.capacityUsed >= 100,
        ).length,
      },
      {
        label: "No Capacity Set",
        value: viewRows.filter((item) => !item.capacity).length,
      },
    ],
    [viewRows],
  );

  const updateForm = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleImageUpload = async (
    field: "photo" | "bannerImage",
    file?: File,
  ) => {
    if (!file) return;

    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return;
    }

    try {
      const ownerTempKey = form.id ? undefined : mediaSessionKeyRef.current;
      const isPhoto = field === "photo";

      const result = await saveImageAsset(file, {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        ownerTable: CLASS_MEDIA_OWNER_TABLE,
        ownerLocalId: form.id || undefined,
        ownerTempKey,
        fieldKey: isPhoto ? MediaFieldKeys.PHOTO : MediaFieldKeys.BANNER,
        variant: isPhoto ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateForm({
        [field]: result.previewUrl,
        [isPhoto ? "photoMediaId" : "bannerImageMediaId"]: result.assetId,
      } as Partial<FormState>);

      showToast(
        "success",
        isPhoto ? "Class photo optimized." : "Class banner optimized.",
      );
    } catch (error: any) {
      console.error("Failed to process class image:", error);
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
    mediaSessionKeyRef.current = createClassMediaSessionKey();
    setForm({
      ...emptyForm,
      organizationId:
        filterOrganizationId !== "all" ? filterOrganizationId : "",
    });
    setModalOpen(true);
  };

  const openEdit = (row: Class) => {
    const item = row as any;
    mediaSessionKeyRef.current = createClassMediaSessionKey();
    setSelectedItem(null);
    setForm({
      id: idOf(item.id),
      organizationId: item.organizationId ? String(item.organizationId) : "",
      name: item.name || "",
      code: item.code || "",
      level: item.level || "",
      photo:
        mediaPreviewUrls[mediaKey(idOf(item.id), "photo")] ||
        safeRecordMediaValue(item.photo) ||
        "",
      photoMediaId: item.photoMediaId ? Number(item.photoMediaId) : undefined,
      bannerImage:
        mediaPreviewUrls[mediaKey(idOf(item.id), "bannerImage")] ||
        safeRecordMediaValue(item.bannerImage) ||
        "",
      bannerImageMediaId: item.bannerImageMediaId
        ? Number(item.bannerImageMediaId)
        : undefined,
      capacity: item.capacity == null ? "" : String(item.capacity),
      active: isActiveRow(item),
    });
    setModalOpen(true);
  };

  const clearFilters = () => {
    setFilterOrganizationId("all");
    setFilterStatus("all");
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId) return "Select a school first.";
    if (!branchId) return "Select a branch first.";
    if (!form.name.trim()) return "Enter class name.";

    if (form.organizationId && !organizationMap.get(idOf(form.organizationId)))
      return "Selected organization is not in this branch.";
    if (form.capacity !== "" && Number(form.capacity) < 0)
      return "Capacity cannot be negative.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;
      const sameName = safeLower(row.name) === safeLower(form.name);
      const sameCode =
        !!form.code.trim() && safeLower(row.code) === safeLower(form.code);
      return sameName || sameCode;
    });

    if (duplicate) return "A class with this name or code already exists.";
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

      const payload: Partial<Class> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        organizationId: form.organizationId
          ? Number(form.organizationId)
          : undefined,
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        level: form.level.trim() || undefined,
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue(form.bannerImage),
        bannerImageMediaId: form.bannerImageMediaId || undefined,
        capacity: form.capacity === "" ? undefined : Number(form.capacity),
        active: form.active,
        status: form.active ? "active" : "inactive",
        isDeleted: false,
      } as Partial<Class>;

      const savedClass =
        form.id && existing
          ? await updateLocal("classes", Number(form.id), payload)
          : await createLocal("classes", payload as unknown as Class);

      const savedClassId = Number(
        typeof savedClass === "number"
          ? savedClass
          : (savedClass as any)?.id || form.id || 0,
      );

      if (savedClassId) {
        await Promise.all(
          [form.photoMediaId, form.bannerImageMediaId]
            .filter(Boolean)
            .map((assetId) =>
              attachMediaAssetToOwner({
                assetId: Number(assetId),
                ownerTable: CLASS_MEDIA_OWNER_TABLE,
                ownerLocalId: savedClassId,
                ownerTempKey: mediaSessionKeyRef.current,
              }),
            ),
        );
      }

      mediaSessionKeyRef.current = createClassMediaSessionKey();
      setModalOpen(false);
      showToast("success", "Class saved.");
      await load();
    } catch (error) {
      console.error("Failed to save class:", error);
      showToast("error", "Failed to save class.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: ClassView) => {
    const row: any = item.row;
    const id = idOf(row.id);
    if (!id) return;

    const warning =
      item.studentCount || item.subjectCount
        ? `"${row.name}" has ${item.studentCount} active student(s) and ${item.subjectCount} class subject(s). Delete anyway?`
        : `Delete "${row.name}"?`;

    if (!window.confirm(warning)) return;

    await softDeleteLocal("classes", Number(id));
    setSelectedItem(null);
    showToast("success", "Class deleted.");
    await load();
  };

  const toggleActive = async (item: ClassView) => {
    const row: any = item.row;
    const id = idOf(row.id);
    if (!id) return;

    await updateLocal("classes", id, {
      active: !item.active,
      status: !item.active ? "active" : "inactive",
      isDeleted: false,
    } as unknown as Partial<Class>);

    setSelectedItem(null);
    showToast(
      "success",
      item.active ? "Class deactivated." : "Class activated.",
    );
    await load();
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Classes..."
        text="Checking account, branch, classes, enrollments, students, and class subject delivery."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing classes."
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
          <p>Classes belong to the selected branch-admin workspace. Use Select Role again if the wrong branch is active.</p>
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

      <section className="ba-search-card" aria-label="Class search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search classes..."
            aria-label="Search classes"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add class"
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

          {filterStatus !== "all" && (
            <button type="button" onClick={() => setFilterStatus("all")}>
              Status:{" "}
              {filterStatus === "full" ? "Full / Over Capacity" : filterStatus}{" "}
              ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Classes by Organization"
            rows={countsByOrganization}
            total={summary.total}
          />
          <AnalysisCard
            title="Classes by Level"
            rows={countsByLevel}
            total={summary.total}
          />
          <AnalysisCard
            title="Capacity Health"
            rows={countsByCapacity}
            total={summary.total}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>
              Class record(s) currently match your search and filter conditions.
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
        />
      )}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <ClassListItem
              key={String(item.id)}
              item={item}
              primary={primary}
              onOpen={() => setSelectedItem(item)}
            />
          ))}

          {!filteredRows.length && (
            <Empty
              icon="🏷️"
              title="No classes found"
              text="Create class groupings such as Basic 1, Basic 5, JHS 1, Nursery 2, SHS 1 Science, or any branch class."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          organizations={organizations}
          filterOrganizationId={filterOrganizationId}
          filterStatus={filterStatus}
          setFilterOrganizationId={setFilterOrganizationId}
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
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <ClassModal
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

function ClassListItem({
  item,
  primary,
  onOpen,
}: {
  item: ClassView;
  primary: string;
  onOpen: () => void;
}) {
  const row: any = item.row;

  return (
    <button type="button" className="student-row" onClick={onOpen}>
      <Avatar
        name={row.name}
        photo={item.photoUrl || safeRecordMediaValue(row.photo)}
        primary={primary}
      />

      <span className="student-main">
        <strong>{row.name || "Unnamed class"}</strong>
        <small>
          {item.organizationName}
          {row.level ? ` · ${row.level}` : ""}
          {row.code ? ` · ${row.code}` : ""}
        </small>
        <em>
          {item.studentCount} student{item.studentCount === 1 ? "" : "s"} ·{" "}
          {item.subjectCount} subject
          {item.subjectCount === 1 ? "" : "s"}
          {item.capacity
            ? ` · ${item.studentCount}/${item.capacity} capacity`
            : ""}
        </em>
      </span>

      <span className="student-side">
        <span
          className={`status-dot-mini ${statusTone(item.active, item.overCapacity)}`}
          title={item.overCapacity ? "Over capacity" : statusLabel(item.active)}
          aria-label={
            item.overCapacity ? "Over capacity" : statusLabel(item.active)
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
  organizations,
  filterOrganizationId,
  filterStatus,
  setFilterOrganizationId,
  setFilterStatus,
  clearFilters,
  onClose,
}: {
  organizations: Organization[];
  filterOrganizationId: string;
  filterStatus: "all" | "active" | "inactive" | "full";
  setFilterOrganizationId: (value: string) => void;
  setFilterStatus: (value: "all" | "active" | "inactive" | "full") => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>
              Choose only what you need. The class list updates after applying.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Organization</span>
            <select
              value={filterOrganizationId}
              onChange={(event) => setFilterOrganizationId(event.target.value)}
            >
              <option value="all">All organizations</option>
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
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value as any)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="full">Full / Over Capacity</option>
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
    students: number;
    classSubjects: number;
    fullOrOver: number;
    showing: number;
  };
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
            <small>Simple class records</small>
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
            <small>Organization, level and capacity summaries</small>
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
  remove,
  toggleActive,
  onClose,
}: {
  item: ClassView;
  openEdit: (row: Class) => void;
  remove: (item: ClassView) => void;
  toggleActive: (item: ClassView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{row.name || "Class"}</h2>
            <p>
              {item.organizationName} ·{" "}
              {item.overCapacity ? "Over capacity" : statusLabel(item.active)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close class actions"
          >
            ✕
          </button>
        </div>

        <div className="student-detail-strip">
          <span>
            <b>Students</b>
            {item.studentCount}
          </span>
          <span>
            <b>Subjects</b>
            {item.subjectCount}
          </span>
          <span>
            <b>Capacity</b>
            {item.capacity
              ? `${item.studentCount}/${item.capacity}`
              : "Not set"}
          </span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item.row)}>
            <span>✎</span>
            <b>Edit class</b>
            <small>
              Update class name, level, organization, capacity and images
            </small>
          </button>

          <button type="button" onClick={() => toggleActive(item)}>
            <span>{item.active ? "⏸" : "✓"}</span>
            <b>{item.active ? "Deactivate" : "Activate"}</b>
            <small>
              {item.active
                ? "Mark this class as inactive"
                : "Restore this class as active"}
            </small>
          </button>

          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this class locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openEdit,
  remove,
  toggleActive,
}: {
  rows: ClassView[];
  openEdit: (row: Class) => void;
  remove: (item: ClassView) => void;
  toggleActive: (item: ClassView) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Classes ({rows.length})</th>
              <th>Code</th>
              <th>Level</th>
              <th>Organization</th>
              <th>Students</th>
              <th>Subjects</th>
              <th>Capacity</th>
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
                      {item.overCapacity ? "Over capacity" : "Class grouping"}
                    </span>
                  </td>
                  <td>{row.code || "—"}</td>
                  <td>{row.level || "—"}</td>
                  <td>{item.organizationName}</td>
                  <td>{item.studentCount}</td>
                  <td>{item.subjectCount}</td>
                  <td>
                    {item.capacity
                      ? `${item.studentCount}/${item.capacity}`
                      : "Not set"}
                    {item.capacity ? (
                      <span>{item.capacityUsed}% used</span>
                    ) : null}
                  </td>
                  <td>
                    <Chip tone={statusTone(item.active, item.overCapacity)}>
                      {item.overCapacity
                        ? "Over Capacity"
                        : statusLabel(item.active)}
                    </Chip>
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
          <div className="ba-empty-table">No class matches your filters.</div>
        )}
      </div>
    </section>
  );
}

function ClassModal({
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
  setModalOpen: (open: boolean) => void;
  updateForm: (patch: Partial<FormState>) => void;
  handleImageUpload: (field: "photo" | "bannerImage", file?: File) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Class" : "Add Class"}</h2>
            <p>
              Classes are academic groupings used by enrollments, class
              subjects, attendance, reports, and broadsheets.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close class form"
          >
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Class</h3>
          <div className="ba-form">
            <label>
              <span>Class Name</span>
              <input
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="e.g. Basic 5, JHS 1, Nursery 2"
              />
            </label>

            <label>
              <span>Class Code</span>
              <input
                value={form.code}
                onChange={(event) => updateForm({ code: event.target.value })}
                placeholder="e.g. B5, JHS1"
              />
            </label>

            <label>
              <span>Level</span>
              <input
                value={form.level}
                onChange={(event) => updateForm({ level: event.target.value })}
                placeholder="e.g. Primary, JHS, SHS"
              />
            </label>

            <label>
              <span>Organization / Department</span>
              <select
                value={form.organizationId}
                onChange={(event) =>
                  updateForm({ organizationId: event.target.value })
                }
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
              <span>Capacity</span>
              <input
                type="number"
                value={form.capacity}
                onChange={(event) =>
                  updateForm({ capacity: event.target.value })
                }
                placeholder="Maximum number of students"
              />
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
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Images</h3>
          <div className="ba-form two">
            <label>
              <span>Class Photo</span>
              <div className="ba-media-actions">
                <label className="ba-media-button">
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleImageUpload("photo", event.target.files?.[0])
                    }
                    hidden
                  />
                </label>
              </div>
              <small className="ba-media-hint">
                Upload a class image. It is optimized and saved as a media asset
                instead of a large Base64 field.
              </small>
              {form.photo && (
                <img
                  src={form.photo}
                  alt="Class preview"
                  className="ba-preview-photo"
                />
              )}
            </label>

            <label>
              <span>Class Banner Image</span>
              <div className="ba-media-actions">
                <label className="ba-media-button">
                  Upload Banner
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleImageUpload("bannerImage", event.target.files?.[0])
                    }
                    hidden
                  />
                </label>
              </div>
              <small className="ba-media-hint">
                Upload a banner for this class. The banner is compressed
                separately for sync-friendly storage.
              </small>
              {form.bannerImage && (
                <img
                  src={form.bannerImage}
                  alt="Class banner preview"
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
            {saving ? "Saving..." : form.id ? "Save Changes" : "Add Class"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(rows: ClassView[], keyFn: (item: ClassView) => string) {
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

.ba-page *,
.ba-page *::before,
.ba-page *::after {
  box-sizing: border-box;
  min-width: 0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea {
  font: inherit;
  max-width: 100%;
}

.ba-page button {
  -webkit-tap-highlight-color: transparent;
}

.ba-page input,
.ba-page select,
.ba-page textarea {
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

.ba-page input:focus,
.ba-page select:focus,
.ba-page textarea:focus {
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}

.ba-state,
.ba-search-card,
.ba-summary-line,
.ba-card,
.ba-table-card,
.ba-analysis,
.ba-empty,
.ba-sheet,
.ba-modal,
.student-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
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

.ba-state-button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: var(--ba-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.ba-toast {
  position: sticky;
  top: 8px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15,23,42,.12);
}

.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; }
.ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; }
.ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }

.ba-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

/* Compact search/action strip. The page intentionally has no duplicate title header. */
.ba-topbar,
.ba-title,
.ba-topbar-actions {
  display: none;
}

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

.ba-search span {
  color: var(--muted,#64748b);
  font-size: 17px;
  font-weight: 1000;
}

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

.ba-summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 20px;
}

.ba-summary-line div {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.ba-summary-line strong {
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-summary-line span,
.ba-summary-line p {
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
}

.ba-summary-line p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-filter-chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 8px 1px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-filter-chips::-webkit-scrollbar {
  display: none;
}

.ba-filter-chips button {
  flex: 0 0 auto;
  min-height: 31px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  cursor: pointer;
}

.ba-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.student-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 22px;
  text-align: left;
  cursor: pointer;
  transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease);
}

.student-row:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 16px 34px rgba(15,23,42,.07);
}

.ba-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fff;
  font-size: 17px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}

.student-main,
.student-main strong,
.student-main small,
.student-main em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-main strong {
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.student-main small {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
  font-style: normal;
}

.student-main em {
  margin-top: 3px;
  color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827));
  font-size: 11px;
  font-weight: 750;
  font-style: normal;
}

.student-side {
  display: grid;
  justify-items: end;
  gap: 6px;
  flex: 0 0 auto;
}

.student-side i {
  color: var(--muted,#64748b);
  font-style: normal;
  font-size: 18px;
  font-weight: 1000;
  line-height: 1;
}

.ba-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); }
.ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.status-dot-mini {
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 999px;
  background: var(--muted,#64748b);
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent);
}

.status-dot-mini.green { background: #22c55e; }
.status-dot-mini.red { background: #ef4444; }
.status-dot-mini.blue { background: #3b82f6; }
.status-dot-mini.orange { background: #f59e0b; }
.status-dot-mini.gray { background: var(--muted,#64748b); }

.status-sheet-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 8px;
}

.status-sheet-grid span {
  display: grid;
  gap: 5px;
  padding: 11px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.status-sheet-grid b {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.status-sheet-grid em {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text,#111827);
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.ba-sheet-backdrop,
.ba-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15,23,42,.50);
  backdrop-filter: blur(12px);
}

.ba-sheet {
  width: min(760px, 100%);
  max-height: min(88dvh, 760px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px 28px 22px 22px;
  box-shadow: 0 30px 90px rgba(15,23,42,.32);
  animation: sheetIn .18s var(--ease);
}

.ba-sheet.small {
  width: min(520px, 100%);
}

@keyframes sheetIn {
  from { transform: translateY(16px); opacity: .7; }
  to { transform: translateY(0); opacity: 1; }
}

.ba-sheet-head,
.ba-sheet-profile {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
}

.ba-sheet-head h2,
.ba-sheet-profile h2,
.ba-modal-head h2 {
  margin: 0;
  color: var(--text,#111827);
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-sheet-head p,
.ba-sheet-profile p,
.ba-modal-head p {
  margin: 5px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 750;
}

.ba-sheet-head button,
.ba-sheet-profile button,
.ba-modal-head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-weight: 1000;
  cursor: pointer;
  flex: 0 0 auto;
}

.ba-sheet-actions,
.ba-modal-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent);
}

.ba-sheet-actions button,
.ba-modal-actions button {
  min-height: 42px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-sheet-actions button.primary,
.ba-modal-actions button:last-child {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-modal-actions button:disabled {
  opacity: .65;
  cursor: not-allowed;
}

.ba-menu-list {
  display: grid;
  gap: 8px;
}

.ba-menu-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0,1fr);
  column-gap: 10px;
  align-items: center;
  min-height: 58px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 18px;
  padding: 9px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  text-align: left;
  cursor: pointer;
}

.ba-menu-list button span {
  grid-row: span 2;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 10%, transparent);
  color: var(--ba-primary);
  font-weight: 1000;
}

.ba-menu-list button b,
.ba-menu-list button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-menu-list button b {
  font-size: 13px;
  font-weight: 1000;
}

.ba-menu-list button small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
}

.ba-menu-list button.active {
  border-color: color-mix(in srgb, var(--ba-primary) 34%, var(--border,rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--surface,#fff));
}

.ba-menu-list button.danger span {
  background: color-mix(in srgb, #dc2626 10%, transparent);
  color: #dc2626;
}

.ba-menu-list button.danger b {
  color: #991b1b;
}

.student-detail-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 7px;
  margin-bottom: 10px;
}

.student-detail-strip span {
  display: block;
  padding: 9px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent);
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-detail-strip b {
  display: block;
  margin-bottom: 3px;
  color: var(--text,#111827);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.ba-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ba-form.two {
  grid-template-columns: minmax(0,1fr);
}

.ba-form.compact {
  gap: 9px;
}

.ba-form label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.ba-form span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.ba-form .wide {
  grid-column: 1 / -1;
}

.ba-form-section {
  padding: 12px 0;
  border-top: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-form-section:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.ba-form-section h3 {
  margin: 0 0 10px;
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.ba-page input[type="file"] {
  padding: 10px;
  font-size: 12px;
}

.ba-page textarea {
  min-height: 92px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}


.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.ba-media-button {
  width: auto;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  background: var(--ba-primary);
  color: #fff !important;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0 !important;
  text-transform: none !important;
  cursor: pointer;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button input {
  display: none;
}

.ba-media-hint {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
}

.ba-preview-photo {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-preview-banner {
  width: 100%;
  height: 130px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-modal {
  width: min(980px, 100%);
  max-height: min(92dvh, 900px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}

.ba-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 14px;
}

.ba-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0,1fr);
  gap: 10px;
  margin-top: 10px;
}

.ba-analysis,
.ba-table-card,
.ba-empty {
  padding: 13px;
  border-radius: 24px;
}

.ba-analysis span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ba-analysis strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(22px,7vw,30px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.ba-analysis p {
  margin: 8px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ba-analysis-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.ba-analysis-list section {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
}

.ba-analysis-list section > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.ba-analysis-list b,
.ba-analysis-list small {
  font-size: 12px;
}

.ba-analysis-list small {
  color: var(--muted,#64748b);
  font-weight: 850;
}

.ba-progress {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb,var(--muted,#64748b) 18%,transparent);
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
  background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));
  font-size: 28px;
}

.ba-empty h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.ba-empty p {
  margin: 0;
  color: var(--muted,#64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-table-card {
  margin-top: 10px;
}

.ba-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-table-scroll table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, var(--bg, transparent)));
}

.ba-table-scroll th,
.ba-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border,rgba(0,0,0,.08));
  vertical-align: top;
  text-align: left;
  font-size: 13px;
}

.ba-table-scroll th {
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent)))));
  color: var(--table-header-text, var(--muted, var(--text)));
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.ba-table-scroll td strong,
.ba-table-scroll td span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-table-scroll td span {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 11px;
}

.ba-table-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 7px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-table-actions::-webkit-scrollbar {
  display: none;
}

.ba-table-actions button {
  flex: 0 0 auto;
  min-height: 34px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 10px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.ba-table-actions button:first-child {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}

.ba-delete,
.ba-table-actions button.ba-delete {
  color: #991b1b;
  background: color-mix(in srgb,#dc2626 7%,var(--surface,#fff));
  border-color: color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)));
}

.ba-empty-table {
  padding: 22px;
  text-align: center;
  color: var(--muted,#64748b);
  font-weight: 850;
}

@media (min-width: 680px) {
  .ba-page {
    padding: calc(12px * var(--local-density-scale,1));
    padding-bottom: 44px;
  }

  .ba-search-card {
    grid-template-columns: minmax(0,1fr) 48px 48px 48px;
  }

  .ba-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .student-row {
    border-radius: 24px;
    padding: 12px;
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-form {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-form.two {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-modal-backdrop,
  .ba-sheet-backdrop {
    place-items: center;
    padding: 18px;
  }

  .ba-sheet {
    border-radius: 28px;
    padding: 18px;
  }

  .ba-modal {
    padding: 18px;
  }

}

@media (min-width: 1040px) {
  .ba-page {
    padding: calc(16px * var(--local-density-scale,1));
    padding-bottom: 48px;
  }

  .ba-search-card,
  .ba-summary-line,
  .ba-list,
  .ba-analysis-grid,
  .ba-table-card,
  .ba-filter-chips {
    max-width: 1180px;
    margin-left: auto;
    margin-right: auto;
  }

  .ba-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(4, minmax(0,1fr));
  }

  .ba-current-filter {
    grid-column: span 2;
  }

  .ba-form {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }

  .ba-form.two {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

}

@media (max-width: 520px) {
  .ba-page {
    padding: calc(7px * var(--local-density-scale,1));
    padding-bottom: max(38px, env(safe-area-inset-bottom));
  }

  .ba-title h1 {
    font-size: 28px;
  }

  .ba-icon-button,
  .ba-filter-button,
  .ba-add-inline {
    width: 40px;
    height: 40px;
  }

  .ba-summary-line {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .student-detail-strip {
    grid-template-columns: minmax(0,1fr);
  }

  .ba-sheet,
  .ba-modal {
    border-radius: 24px 24px 18px 18px;
    padding: 12px;
  }

  .ba-sheet-actions,
  .ba-modal-actions {
    display: grid;
    grid-template-columns: minmax(0,1fr);
  }

  .ba-sheet-actions button,
  .ba-modal-actions button {
    width: 100%;
  }
}


/* Class page additions that sit on top of the Students golden-standard ba-* CSS. */
.ba-form.two {
  grid-template-columns: minmax(0,1fr);
}

@media (min-width: 680px) {
  .ba-form.two {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }
}

`;
