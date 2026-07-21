"use client";

/**
 * app/branch-admin/modules/ClassSubjects.tsx
 * ---------------------------------------------------------
 * Eleeveon Class Subjects V4.
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
 * Golden-standard upgrade:
 * - Rebuilt to follow the Students.tsx compact golden UI pattern.
 * - Removed the large hero/header, old toolbar, permanent filter grid, and summary strip.
 * - Main screen is now search + inline add + slider filter + more menu.
 * - Card view is now class-first: the user selects a class before seeing its subjects.
 * - Subject records remain normal atomic ClassSubject rows; only the default UI is scoped by class.
 * - Table and analytics live under More so the default screen stays clean.
 * - Uses createLocal/updateLocal/softDeleteLocal/listActiveLocal for sync-safe writes and reads.
 * - Uses mediaAssets/mediaBlobs via saveImageAsset(...) instead of storing Base64 images on records.
 * - Photo and banner uploads support Upload and Take Photo through shared media/camera helpers.
 * - Styling uses ba-* theme variables for system theme and dark mode support.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSettings } from "../../context/settings-context";
import {
  db,
  type AcademicPeriod,
  type AcademicStructure,
  type AssessmentApplicability,
  type AssessmentEntry,
  type Class,
  type ClassSubject,
  type CurriculumSubject,
  type CurriculumSubjectType,
  type Subject,
  type Teacher,
} from "../../lib/db/db";

import {
  createLocal,
  updateLocal,
  softDeleteLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";
import {
  softDeleteOwnerFieldAssets,
  attachCameraStreamToVideo,
  commitMediaAssetsToOwner,
  captureImageFileFromVideo,
  createMediaSessionKey,
  getCameraUnavailableMessage,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  isCameraApiAvailable,
  MediaFieldKeys,
  openCameraStream,
  revokeMediaObjectUrl,
  saveImageAsset,
  stopCameraStream,
  type CameraFacingMode,
} from "../../lib/media/mediaAssetUtils";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
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

export default function ClassSubjectsPage() {
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
      Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
      stopCurrentCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaPreviewUrls]);

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
      const ownerTempKey = form.id ? undefined : mediaSessionKeyRef.current;
      const result = await saveImageAsset(file, {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        ownerTable: CLASS_SUBJECT_MEDIA_OWNER_TABLE,
        ownerId: form.id || undefined,
        ownerTempKey,
        fieldKey:
          field === "photo"
            ? MediaFieldKeys.PHOTO
            : CLASS_SUBJECT_BANNER_FIELD_KEY,
        variant: field === "photo" ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateForm({
        [field]: result.previewUrl,
        [`${field}MediaId`]: result.assetId,
      } as Partial<FormState>);

      showToast(
        "success",
        field === "photo"
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

  const openCreate = () => {
    if (!requireTenant()) return;
    mediaSessionKeyRef.current = createMediaSessionKey(
      CLASS_SUBJECT_MEDIA_OWNER_TABLE,
    );
    setSelectedItem(null);
    setForm({
      ...makeEmptyForm(settings),
      classId: selectedClassId || "",
    });
    setModalOpen(true);
  };

  const openEdit = (row: ClassSubject) => {
    const item: any = row;
    mediaSessionKeyRef.current = createMediaSessionKey(
      CLASS_SUBJECT_MEDIA_OWNER_TABLE,
      idOf(item.id) || "existing",
    );
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
      type: item.type || "core",
      compulsory: item.compulsory ?? true,
      elective: item.elective ?? false,
      photo:
        mediaPreviewUrls[mediaKey(idOf(item.id), "photo")] ||
        safeRecordMediaValue(item.photo) ||
        "",
      photoMediaId: item.photoMediaId ? String(item.photoMediaId) : undefined,
      bannerImage:
        mediaPreviewUrls[mediaKey(idOf(item.id), "bannerImage")] ||
        safeRecordMediaValue(item.bannerImage) ||
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
      const payload: Partial<ClassSubject> = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
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
        type: form.type,
        compulsory: !!form.compulsory,
        elective: !!form.elective,
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue(form.bannerImage),
        bannerImageMediaId: form.bannerImageMediaId || undefined,
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

      const savedClassSubjectId = idOf(
        typeof savedClassSubject === "number"
          ? savedClassSubject
          : (savedClassSubject as any)?.id || form.id || 0,
      );

      if (savedClassSubjectId) {
        await commitMediaAssetsToOwner({
          accountId,
          ownerTable: CLASS_SUBJECT_MEDIA_OWNER_TABLE,
          ownerId: savedClassSubjectId,

          ownerTempKey: mediaSessionKeyRef.current,
          assets: [
            { assetId: form.photoMediaId, fieldKey: MediaFieldKeys.PHOTO },
            {
              assetId: form.bannerImageMediaId,
              fieldKey: CLASS_SUBJECT_BANNER_FIELD_KEY,
            },
          ],
        });
      }

      mediaSessionKeyRef.current = createMediaSessionKey(
        CLASS_SUBJECT_MEDIA_OWNER_TABLE,
      );
      setModalOpen(false);
      showToast("success", "Class subject saved.");
      await load();
    } catch (error) {
      console.error("Failed to save class subject:", error);
      showToast("error", "Failed to save class subject.");
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
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
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
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
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
    </div>
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
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
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
    </div>
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
    <div className="ba-modal-backdrop">
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
    </div>
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
    <div
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
    </div>
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

`;
