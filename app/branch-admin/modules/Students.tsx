"use client";

/**
 * app/branch-admin/modules/Students.tsx
 * Eleeveon Students V2.
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
 * Data behavior intentionally preserved and upgraded:
 * - createLocal(...) for student creation
 * - updateLocal(...) for edits and status changes
 * - softDeleteLocal(...) for local soft delete
 * - listActiveLocal(...) for active lookup tables
 * - saveImageAsset(...) for photos so large Base64 files are not stored inside student records
 * - photoMediaId / coverPhotoMediaId carry local media references for sync-safe records
 *
 * Media behavior rebuilt from the shared local-first media system:
 * - selected images are compressed and stored once in mediaAssets/mediaBlobs
 * - student records save small media IDs instead of full image strings
 * - old photo/coverPhoto fields remain as backward-compatible fallbacks for list display only
 * - every create/edit upload is staged under one unique ownerTempKey until Save
 * - createLocal string, number and object return shapes are all resolved safely
 * - staged media is committed only after the permanent student ID is known
 * - the student row is then updated with the exact committed photoMediaId/coverPhotoMediaId
 * - edit uploads do not replace the currently saved student image before Save
 * - photo and cover fields support Upload and real Take Photo camera capture
 * - media owner/session keys use shared mediaAssetUtils helpers so this page cannot save under teacher/parent ownership
 *
 * Compact mobile-first UI:
 * - removes the duplicate Students / Branch / School header block
 * - keeps the + add action beside search and removes the floating add button
 * - uses the horizontal slider filter icon and keeps table/analytics under More
 * - replaces large status chips with compact status dots
 * - removes duplicate module-level connection and summary strips
 * - shows the filtered count only where it is useful, such as Students (2) in table view
 * - keeps cards, tables and sheets responsive and theme-safe
 *
 * Exact Branch Settings action-system rebuild:
 * - discards the former Students-specific toolbar/button imitation styles
 * - copies the Branch Settings search strip, primary action, filter and More treatments directly
 * - + Add uses the same filled branch-primary background, border and shadow as Branch Settings Save
 * - inactive Filter uses the same soft primary tint; active Filter uses the same filled primary treatment
 * - More uses the same neutral card/surface background, border and shadow
 * - Upload, Apply, Save, Done and Capture use the same Branch Settings primary-action values
 * - Camera, Cancel, Close and other secondary actions use the same neutral/outlined hierarchy
 * - all action colors resolve from --ba-primary so Branch Settings theme changes flow into Students
 *
 * Integrated enrollment workflow:
 * - new students can receive their initial class/structure/period enrollment during creation
 * - existing students manage enrollment history directly from the student action sheet
 * - active enrollment automatically synchronizes student.currentClassId
 * - duplicate and one-active-enrollment-per-period rules are preserved
 *
 * Student map view:
 * - adds Map under More without changing the compact main toolbar
 * - maps only the already branch-scoped, searched and filtered student rows
 * - uses shared map privacy/coordinate adapters and preserves approximate locations
 * - clusters nearby students and lets SchoolMap own marker selection, details, and location editing
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "../../context/settings-context";
import {
  db,
  type AcademicPeriod,
  type AcademicStructure,
  type Branch,
  type Class,
  type Organization,
  type Parent,
  type Student,
  type StudentEnrollment,
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
  MediaOwners,
  MediaFieldKeys,
  attachCameraStreamToVideo,
  commitMediaAssetsToOwner,
  captureImageFileFromVideo,
  createMediaSessionKey,
  getCameraUnavailableMessage,
  resolveOwnerMediaUrl,
  isCameraApiAvailable,
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
import {
  SchoolMap,
  type MapCreateRequest,
  type MapLocationUpdateRequest,
} from "../../components/maps";
import { genericEntityToMarker, type MapMarker } from "../../lib/maps";
type ViewMode = "cards" | "table" | "map" | "summary";
type ToastTone = "success" | "error" | "info";
type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn";
type EnrollmentStatus = "active" | "completed" | "promoted" | "withdrawn";
type CameraField = "photo" | "coverPhoto";
type ProximityLayer = "branch" | "student" | "teacher" | "parent";

type StudentCreateDefaults = {
  latitude?: number;
  longitude?: number;
};

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

type FormState = {
  id?: string;
  organizationId: string;
  currentClassId: string;
  enrollmentAcademicStructureId: string;
  enrollmentAcademicPeriodId: string;
  enrollmentStartDate: string;
  admissionNumber: string;
  fullName: string;
  gender: string;
  age: string;
  dateOfBirth: string;
  photo: string;
  photoMediaId?: string;
  coverPhoto: string;
  coverPhotoMediaId?: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  address: string;
  latitude: string;
  longitude: string;
  accuracyMeters: string;
  locationLabel: string;
  formattedAddress: string;
  locationType: "home" | "boarding" | "pickup_point" | "dropoff_point" | "workplace" | "other";
  locationSource: "manual" | "device_gps" | "geocoded" | "imported";
  locationPrecision: "exact" | "approximate" | "area_only";
  locationCapturedAt?: number;
  mapVisible: boolean;
  locationConsentGiven: boolean;
  locationConsentAt?: number;
  locationRestricted: boolean;
  status: StudentStatus;
};

type EnrollmentFormState = {
  id?: string;
  studentId: string;
  classId: string;
  academicStructureId: string;
  academicPeriodId: string;
  startDate: string;
  endDate: string;
  status: EnrollmentStatus;
};

type StudentView = {
  id: string;
  row: Student;
  photoUrl?: string;
  coverPhotoUrl?: string;
  className: string;
  organizationName: string;
  enrollmentCount: number;
  activeEnrollment?: StudentEnrollment;
  active: boolean;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyEnrollmentForm: EnrollmentFormState = {
  studentId: "",
  classId: "",
  academicStructureId: "",
  academicPeriodId: "",
  startDate: todayISO(),
  endDate: "",
  status: "active",
};

const emptyForm: FormState = {
  organizationId: "",
  currentClassId: "",
  enrollmentAcademicStructureId: "",
  enrollmentAcademicPeriodId: "",
  enrollmentStartDate: todayISO(),
  admissionNumber: "",
  fullName: "",
  gender: "",
  age: "",
  dateOfBirth: "",
  photo: "",
  photoMediaId: undefined,
  coverPhoto: "",
  coverPhotoMediaId: undefined,
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  address: "",
  latitude: "",
  longitude: "",
  accuracyMeters: "",
  locationLabel: "",
  formattedAddress: "",
  locationType: "home",
  locationSource: "manual",
  locationPrecision: "exact",
  locationCapturedAt: undefined,
  mapVisible: true,
  locationConsentGiven: false,
  locationConsentAt: undefined,
  locationRestricted: false,
  status: "active",
};

const idOf = (v: any): string => {
  if (v === undefined || v === null) return "";
  return String(v).trim();
};

/**
 * syncUtils create/update helpers may return:
 * - the permanent ID directly as a string;
 * - a numeric ID;
 * - the saved record;
 * - an object containing id/localId.
 *
 * Media cannot be committed until this resolves to the real student ID.
 */
const savedEntityId = (
  result: unknown,
  fallback?: unknown,
): string => {
  if (
    typeof result === "string" ||
    typeof result === "number"
  ) {
    return cleanId(result);
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    return firstLocalId(
      record.id,
      record.localId,
      record.studentId,
      fallback,
    );
  }

  return cleanId(fallback);
};

const cleanId = (value: unknown): string => {
  const normalized = idOf(value);
  return normalized && normalized !== "0" ? normalized : "";
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (v: any) =>
  String(v || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) =>
  !row?.isDeleted &&
  !["withdrawn", "deleted", "archived", "inactive"].includes(
    safeLower(row?.status),
  );

const statusLabel = (s?: StudentStatus) =>
  !s ? "Active" : s.charAt(0).toUpperCase() + s.slice(1);

function statusTone(
  s?: StudentStatus,
): "green" | "red" | "blue" | "orange" | "gray" {
  if (!s || s === "active") return "green";
  if (s === "graduated") return "blue";
  if (s === "transferred") return "orange";
  if (s === "withdrawn") return "red";
  return "gray";
}

function enrollmentStatusTone(
  status?: EnrollmentStatus,
): "green" | "red" | "blue" | "orange" | "gray" {
  if (!status || status === "active") return "green";
  if (status === "completed") return "blue";
  if (status === "promoted") return "orange";
  if (status === "withdrawn") return "red";
  return "gray";
}

function enrollmentStatusLabel(status?: EnrollmentStatus) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
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

const mediaKey = (studentId: string, field: "photo" | "coverPhoto") =>
  `students:${studentId}:${field}`;

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
};

const STUDENT_MEDIA_OWNER_TABLE = MediaOwners.STUDENTS;
const STUDENT_MEDIA_ENTITY_LABEL = "Student";

const makeMediaSessionKey = () =>
  createMediaSessionKey(STUDENT_MEDIA_OWNER_TABLE);

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function getReadableTextColor(color: string) {
  const value = String(color || "").trim();

  if (!value.startsWith("#")) {
    return "#fff";
  }

  let hex = value.slice(1);

  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((character) => character + character)
      .join("");
  }

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return "#fff";
  }

  const numeric = Number.parseInt(hex, 16);
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness > 155 ? "#111827" : "#ffffff";
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
        background: photo ? `url(${photo}) center/cover` : primary,
        color: photo ? "#ffffff" : getReadableTextColor(primary),
        borderColor: photo
          ? "transparent"
          : `color-mix(in srgb, ${primary} 76%, transparent)`,
      }}
    >
      {!photo &&
        String(name || "S")
          .slice(0, 1)
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

export default function StudentsPage() {
  const dataRevision = useBranchTableRevision([
    "students",
    "teachers",
    "parents",
    "branches",
    "classes",
    "organizations",
    "academicStructures",
    "academicPeriods",
    "studentEnrollments",
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
  const primaryText = getReadableTextColor(primary);

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const resolvedMediaById = useEntityMediaUrls({
    accountId,
    ownerTable: "students",
    rows: rows,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "coverPhoto", mediaIdKey: "coverPhotoMediaId" },
    ],
  });
  const [classes, setClasses] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<
    Record<string, string>
  >({});

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState("all");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | StudentStatus>(
    "all",
  );
  const [filterGender, setFilterGender] = useState("all");

  // Student is the page's primary layer, so it alone is visible initially.
  const [visibleMapLayers, setVisibleMapLayers] = useState<
    Record<ProximityLayer, boolean>
  >({
    branch: false,
    student: true,
    teacher: false,
    parent: false,
  });

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StudentView | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [enrollmentStudentId, setEnrollmentStudentId] = useState<string | null>(null);
  const [enrollmentEditorOpen, setEnrollmentEditorOpen] = useState(false);
  const [enrollmentForm, setEnrollmentForm] = useState<EnrollmentFormState>(emptyEnrollmentForm);
  const [enrollmentSaving, setEnrollmentSaving] = useState(false);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);
  const mediaSessionKey = useRef(makeMediaSessionKey());
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
    else if (!schoolId || !branchId) router.replace("/account");
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
    (!row.accountId || sameId(row.accountId, accountId)) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  // Comparison layers follow the proven Owner Branches map approach:
  // account-safe first, then tolerant school/branch matching.
  const sameAccount = (row: TenantRow) =>
    (!row.accountId || sameId(row.accountId, accountId)) &&
    !row.isDeleted;

  const sameSchool = (row: TenantRow) =>
    !row.schoolId || sameId(row.schoolId, schoolId);

  const sameBranch = (row: TenantRow) =>
    !row.branchId || sameId(row.branchId, branchId);

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(
      () => setToast((c) => (c?.message === message ? null : c)),
      4200,
    );
  };

  const stopCurrentCamera = () => {
    stopCameraStream(cameraStreamRef.current);
    cameraStreamRef.current = null;

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
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
        fileName: `student-${cameraField}-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        quality: 0.88,
        maxWidth: cameraField === "photo" ? 900 : 1440,
        maxHeight: cameraField === "photo" ? 900 : 900,
      });

      await handleImageUpload(cameraField, file);
      closeCamera();
    } catch (error: any) {
      console.error("Failed to capture student image:", error);
      showToast("error", error?.message || "Failed to capture photo.");
    } finally {
      setCameraCapturing(false);
    }
  };

  const clearData = () => {
    Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
    setRows([]);
    setBranches([]);
    setTeachers([]);
    setParents([]);
    setClasses([]);
    setOrganizations([]);
    setAcademicStructures([]);
    setPeriods([]);
    setEnrollments([]);
    setMediaPreviewUrls({});
  };

  const resolveStudentMediaUrls = async (studentRows: Student[]) => {
    const next: Record<string, string> = {};

    await Promise.all(
      studentRows.map(async (student: any) => {
        const studentId = idOf(student.id);
        if (!studentId) return;

        try {
          const photoUrl = await resolveOwnerMediaUrl({
            accountId: accountId || undefined,
            ownerTable: STUDENT_MEDIA_OWNER_TABLE,
            ownerId: studentId,

            fieldKey: MediaFieldKeys.PHOTO,
            fallbackAssetId: student.photoMediaId,
          });
          if (photoUrl) next[mediaKey(studentId, "photo")] = photoUrl;

          const coverPhotoUrl = await resolveOwnerMediaUrl({
            accountId: accountId || undefined,
            ownerTable: STUDENT_MEDIA_OWNER_TABLE,
            ownerId: studentId,

            fieldKey: MediaFieldKeys.COVER_PHOTO,
            fallbackAssetId: student.coverPhotoMediaId,
          });
          if (coverPhotoUrl)
            next[mediaKey(studentId, "coverPhoto")] = coverPhotoUrl;
        } catch (error) {
          console.error("Failed to resolve student media:", studentId, error);
        }
      }),
    );

    // Do not revoke list preview URLs during a reload. In practice, revoking
    // blob URLs while React still has list rows mounted can make the browser
    // temporarily paint the newly uploaded image in other rows. The shared
    // media utility now returns stable data URLs for images, so replacing the
    // map is enough. Cleanup still runs when the page unmounts.
    setMediaPreviewUrls(next);
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
        studentRows,
        teacherRows,
        parentRows,
        branchRows,
        classRows,
        organizationRows,
        structureRows,
        periodRows,
        enrollmentRows,
      ] = await Promise.all([
        tableSafe("students")?.toArray?.() || [],
        tableSafe("teachers")?.toArray?.() || [],
        tableSafe("parents")?.toArray?.() || [],
        tableSafe("branches")?.toArray?.() || [],
        listActiveLocal("classes", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("organizations", {
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
        tableSafe("studentEnrollments")?.toArray?.() || [],
      ]);

      const scopedStudents = (studentRows as Student[])
        .filter((r) => sameTenant(r as TenantRow))
        .sort((a: any, b: any) =>
          String(a.fullName || "").localeCompare(String(b.fullName || "")),
        );

      setRows(scopedStudents);
      await resolveStudentMediaUrls(scopedStudents);

      setTeachers(
        (teacherRows as Teacher[])
          .filter(
            (row: any) =>
              sameAccount(row as TenantRow) &&
              sameSchool(row as TenantRow) &&
              sameBranch(row as TenantRow) &&
              row.active !== false &&
              !["deleted", "archived", "inactive"].includes(
                safeLower(row.status),
              ),
          )
          .sort((a: any, b: any) =>
            String(a.fullName || a.name || "").localeCompare(
              String(b.fullName || b.name || ""),
            ),
          ),
      );

      setParents(
        (parentRows as Parent[])
          .filter(
            (row: any) =>
              sameAccount(row as TenantRow) &&
              sameSchool(row as TenantRow) &&
              sameBranch(row as TenantRow) &&
              row.active !== false &&
              !["deleted", "archived", "inactive"].includes(
                safeLower(row.status),
              ),
          )
          .sort((a: any, b: any) =>
            String(a.fullName || a.name || "").localeCompare(
              String(b.fullName || b.name || ""),
            ),
          ),
      );

      // Branches are school-scoped rather than branch-scoped because the purpose
      // is to compare students with every campus belonging to the selected school.
      setBranches(
        (branchRows as Branch[])
          .filter(
            (row: any) =>
              sameAccount(row as TenantRow) &&
              sameSchool(row as TenantRow) &&
              row.active !== false &&
              !["deleted", "archived", "inactive"].includes(
                safeLower(row.status),
              ),
          )
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );

      setClasses(
        (classRows as Class[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setAcademicStructures(
        (structureRows as AcademicStructure[])
          .filter((row: any) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );

      setPeriods(
        (periodRows as AcademicPeriod[])
          .filter((row: any) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0)),
      );

      setEnrollments(
        (enrollmentRows as StudentEnrollment[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load students.");
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
    };
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
        console.error("Failed to open student camera:", error);
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
  const organizationMap = useMemo(
    () => new Map(organizations.map((r: any) => [idOf(r.id), r])),
    [organizations],
  );
  const structureMap = useMemo(
    () => new Map(academicStructures.map((r: any) => [idOf(r.id), r])),
    [academicStructures],
  );
  const periodMap = useMemo(
    () => new Map(periods.map((r: any) => [idOf(r.id), r])),
    [periods],
  );

  const filteredPeriodsForStudentForm = useMemo(() => {
    if (!form.enrollmentAcademicStructureId) return periods;
    return periods.filter((row: any) =>
      sameId(row.academicStructureId, form.enrollmentAcademicStructureId),
    );
  }, [form.enrollmentAcademicStructureId, periods]);

  const filteredPeriodsForEnrollmentForm = useMemo(() => {
    if (!enrollmentForm.academicStructureId) return periods;
    return periods.filter((row: any) =>
      sameId(row.academicStructureId, enrollmentForm.academicStructureId),
    );
  }, [enrollmentForm.academicStructureId, periods]);

  const enrollmentMap = useMemo(() => {
    const m = new Map<string, StudentEnrollment[]>();
    enrollments.forEach((r: any) => {
      const sid = idOf(r.studentId);
      if (!sid) return;
      const list = m.get(sid) || [];
      list.push(r);
      m.set(sid, list);
    });
    return m;
  }, [enrollments]);

  const viewRows = useMemo<StudentView[]>(
    () =>
      rows.map((row: any) => {
        const id = idOf(row.id);
        const studentEnrollments = enrollmentMap.get(id) || [];
        const activeEnrollment = studentEnrollments.find(
          (i: any) => i.status === "active",
        );
        const classData: any = classMap.get(
          idOf((activeEnrollment as any)?.classId || row.currentClassId),
        );
        const organization: any = organizationMap.get(idOf(row.organizationId));

        return {
          id,
          row,
          photoUrl:
            resolvedMediaById[id]?.photo ||
            mediaPreviewUrls[mediaKey(id, "photo")] ||
            safeRecordMediaValue(row.photo),
          coverPhotoUrl:
            resolvedMediaById[id]?.coverPhoto ||
            mediaPreviewUrls[mediaKey(id, "coverPhoto")] ||
            safeRecordMediaValue(row.coverPhoto),
          className: classData?.name || "No class assigned",
          organizationName: organization?.name || "No organization",
          enrollmentCount: studentEnrollments.length,
          activeEnrollment,
          active: isActiveRow(row),
        };
      }),
    [
      classMap,
      enrollmentMap,
      mediaPreviewUrls,
      organizationMap,
      resolvedMediaById,
      rows,
    ],
  );

  const enrollmentManagerItem = useMemo(
    () =>
      enrollmentStudentId
        ? viewRows.find((item) => sameId(item.id, enrollmentStudentId)) || null
        : null,
    [enrollmentStudentId, viewRows],
  );

  const managedEnrollments = useMemo(() => {
    if (!enrollmentStudentId) return [] as StudentEnrollment[];
    return [...(enrollmentMap.get(enrollmentStudentId) || [])].sort((a: any, b: any) => {
      const left = String(a.startDate || a.updatedAt || a.createdAt || "");
      const right = String(b.startDate || b.updatedAt || b.createdAt || "");
      return right.localeCompare(left);
    });
  }, [enrollmentMap, enrollmentStudentId]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row: any = item.row;

        if (filterClassId !== "all") {
          const activeClassId = idOf(
            (item.activeEnrollment as any)?.classId || row.currentClassId,
          );
          if (!sameId(activeClassId, filterClassId)) return false;
        }

        if (
          filterOrganizationId !== "all" &&
          !sameId(row.organizationId, filterOrganizationId)
        )
          return false;
        if (filterStatus !== "all" && row.status !== filterStatus) return false;
        if (filterGender !== "all" && row.gender !== filterGender) return false;

        if (!q) return true;

        return `${row.fullName} ${row.admissionNumber || ""} ${row.gender || ""} ${row.parentName || ""} ${
          row.parentPhone || ""
        } ${row.parentEmail || ""} ${row.address || ""} ${row.status || ""} ${item.className} ${
          item.organizationName
        }`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) =>
        String((a.row as any).fullName || "").localeCompare(
          String((b.row as any).fullName || ""),
        ),
      );
  }, [
    filterClassId,
    filterGender,
    filterOrganizationId,
    filterStatus,
    search,
    viewRows,
  ]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((r: any) => r.status === "active" || !r.status)
        .length,
      graduated: rows.filter((r: any) => r.status === "graduated").length,
      transferred: rows.filter((r: any) => r.status === "transferred").length,
      withdrawn: rows.filter((r: any) => r.status === "withdrawn").length,
      withClass: new Set(
        enrollments
          .filter((r: any) => r.status === "active")
          .map((r: any) => r.studentId),
      ).size,
      showing: filteredRows.length,
    }),
    [enrollments, filteredRows.length, rows],
  );

  const activeFilterCount = useMemo(() => {
    return [
      filterClassId,
      filterOrganizationId,
      filterStatus,
      filterGender,
    ].filter((v) => v !== "all").length;
  }, [filterClassId, filterGender, filterOrganizationId, filterStatus]);

  const genderOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r: any) => r.gender).filter(Boolean)),
      ) as string[],
    [rows],
  );
  const countsByClass = useMemo(
    () => groupedCounts(viewRows, (i) => i.className),
    [viewRows],
  );
  const countsByOrganization = useMemo(
    () => groupedCounts(viewRows, (i) => i.organizationName),
    [viewRows],
  );
  const countsByStatus = useMemo(
    () => groupedCounts(viewRows, (i) => statusLabel((i.row as any).status)),
    [viewRows],
  );
  const countsByGender = useMemo(
    () =>
      groupedCounts(viewRows, (i) =>
        String((i.row as any).gender || "Not set"),
      ),
    [viewRows],
  );

  const studentMarkers = useMemo<MapMarker[]>(() => {
    if (!visibleMapLayers.student) return [];

    return filteredRows.reduce<MapMarker[]>((markers, item) => {
      const row: any = item.row;

      const marker = genericEntityToMarker(
        {
          ...row,
          id: item.id,
          photo: item.photoUrl || row.photo,
        },
        {
          entityType: "student",
          layerId: "proximity",
          icon: "student",
          imageUrl: item.photoUrl,
          subtitle: [
            item.className,
            row.admissionNumber || null,
            row.locationLabel || row.formattedAddress || row.address || null,
          ]
            .filter(Boolean)
            .join(" · "),
          privacy: {
            allowRestricted: true,
            requireConsent: false,
          },
        },
      );

      if (!marker) return markers;

      markers.push({
        ...marker,
        description: row.parentPhone
          ? `Parent: ${row.parentPhone}`
          : row.parentName
            ? `Parent: ${row.parentName}`
            : item.organizationName,
        metadata: {
          ...(marker.metadata || {}),
          studentId: item.id,
          className: item.className,
          organizationName: item.organizationName,
          admissionNumber: row.admissionNumber || null,
          markerRole: "student",
          markerColor: "#2563eb",
        },
      });

      return markers;
    }, []);
  }, [filteredRows, visibleMapLayers.student]);

  const branchMarkers = useMemo<MapMarker[]>(() => {
    if (!visibleMapLayers.branch) return [];

    return branches.reduce<MapMarker[]>((markers, branch: any) => {
      if (branch.mapVisible === false) return markers;

      const marker = genericEntityToMarker(
        {
          ...branch,
          id: idOf(branch.id),
          photo: branch.logo || branch.photo,
        },
        {
          entityType: "branch",
          layerId: "proximity",
          icon: "school",
          imageUrl: safeRecordMediaValue(branch.logo || branch.photo),
          subtitle: [
            branch.locationLabel ||
              branch.formattedAddress ||
              branch.address,
            branch.city,
          ]
            .filter(Boolean)
            .join(" · "),
          privacy: {
            allowRestricted: true,
            requireConsent: false,
          },
        },
      );

      if (!marker) return markers;

      markers.push({
        ...marker,
        description:
          branch.phone ||
          branch.email ||
          "School branch building",
        metadata: {
          ...(marker.metadata || {}),
          branchId: idOf(branch.id),
          markerRole: "branch-building",
          markerColor: "#7c3aed",
        },
      });

      return markers;
    }, []);
  }, [branches, visibleMapLayers.branch]);

  const comparisonPeopleMarkers = useMemo<MapMarker[]>(() => {
    const markers: MapMarker[] = [];

    const appendPeople = (
      sourceRows: any[],
      entityType: "teacher" | "parent",
      icon: "teacher" | "parent",
      markerColor: string,
    ) => {
      const visible =
        entityType === "teacher"
          ? visibleMapLayers.teacher
          : visibleMapLayers.parent;

      if (!visible) return;

      sourceRows.forEach((row: any) => {
        if (row.mapVisible === false) return;

        const marker = genericEntityToMarker(row, {
          entityType,
          layerId: "proximity",
          icon,
          imageUrl: safeRecordMediaValue(row.photo),
          subtitle: [
            row.locationLabel ||
              row.formattedAddress ||
              row.address,
            branches.find((branch: any) =>
              sameId(branch.id, row.branchId),
            )?.name,
          ]
            .filter(Boolean)
            .join(" · "),
          privacy: {
            allowRestricted: true,
            requireConsent: false,
          },
        });

        if (!marker) return;

        markers.push({
          ...marker,
          metadata: {
            ...(marker.metadata || {}),
            [`${entityType}Id`]: idOf(row.id),
            branchId: idOf(row.branchId),
            markerRole: entityType,
            markerColor,
          },
        });
      });
    };

    appendPeople(
      teachers as any[],
      "teacher",
      "teacher",
      "#16a34a",
    );
    appendPeople(
      parents as any[],
      "parent",
      "parent",
      "#ea580c",
    );

    return markers;
  }, [
    branches,
    parents,
    teachers,
    visibleMapLayers.parent,
    visibleMapLayers.teacher,
  ]);

  // Visibility is controlled by the compact buttons above the map.
  // Every returned marker uses the same layer ID. Student markers establish
  // that layer when SchoolMap mounts, while the other entity buttons only
  // decide which additional markers are included.
  const proximityMarkers = useMemo(
    () => [
      ...branchMarkers,
      ...studentMarkers,
      ...comparisonPeopleMarkers,
    ],
    [branchMarkers, comparisonPeopleMarkers, studentMarkers],
  );

  const updateForm = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleImageUpload = async (
    field: "photo" | "coverPhoto",
    file?: File,
  ) => {
    if (!file) return;

    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return;
    }

    try {
      const result = await saveImageAsset(file, {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        ownerTable: STUDENT_MEDIA_OWNER_TABLE,

        /*
         * Always stage under the form session. For edits this preserves the
         * currently committed image until the user presses Save.
         */
        ownerId: undefined,
        ownerTempKey: mediaSessionKey.current,
        fieldKey:
          field === "photo" ? MediaFieldKeys.PHOTO : MediaFieldKeys.COVER_PHOTO,
        variant: field === "photo" ? "avatar" : "cover",
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
        [`${field}MediaId`]: uploadedAssetId,
      } as Partial<FormState>);

      showToast(
        "success",
        field === "photo"
          ? "Student photo optimized."
          : "Cover photo optimized.",
      );
    } catch (error: any) {
      console.error("Failed to process student image:", error);
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

  const defaultEnrollmentSelection = () => {
    const configuredPeriodId = cleanId(settings?.currentAcademicPeriodId);
    const configuredStructureId = cleanId(settings?.currentAcademicStructureId);
    const configuredPeriod: any = configuredPeriodId
      ? periodMap.get(configuredPeriodId)
      : undefined;

    const structureId =
      cleanId(configuredPeriod?.academicStructureId) ||
      (configuredStructureId && structureMap.has(configuredStructureId)
        ? configuredStructureId
        : "") ||
      (academicStructures.length === 1 ? cleanId((academicStructures[0] as any)?.id) : "");

    const matchingPeriods = structureId
      ? periods.filter((row: any) => sameId(row.academicStructureId, structureId))
      : periods;

    const selectedPeriod: any =
      configuredPeriod ||
      (matchingPeriods.length === 1 ? matchingPeriods[0] : undefined);

    return {
      academicStructureId: structureId,
      academicPeriodId: cleanId(selectedPeriod?.id),
      startDate: selectedPeriod?.startDate || todayISO(),
    };
  };

  const openCreate = (defaults?: StudentCreateDefaults) => {
    if (!requireTenant()) return;

    mediaSessionKey.current = makeMediaSessionKey();
    uploadedMediaAssetIds.current = {};

    const hasMapCoordinate =
      Number.isFinite(defaults?.latitude) &&
      Number.isFinite(defaults?.longitude);
    const enrollmentDefaults = defaultEnrollmentSelection();

    setForm({
      ...emptyForm,
      currentClassId: filterClassId !== "all" ? filterClassId : "",
      enrollmentAcademicStructureId: enrollmentDefaults.academicStructureId,
      enrollmentAcademicPeriodId: enrollmentDefaults.academicPeriodId,
      enrollmentStartDate: enrollmentDefaults.startDate,
      organizationId:
        filterOrganizationId !== "all" ? filterOrganizationId : "",
      status: filterStatus !== "all" ? filterStatus : "active",
      latitude: hasMapCoordinate ? String(defaults?.latitude) : "",
      longitude: hasMapCoordinate ? String(defaults?.longitude) : "",
      locationSource: "manual",
      locationCapturedAt: hasMapCoordinate ? Date.now() : undefined,
      mapVisible: true,
    });
    setModalOpen(true);
  };

  const handleCreateAtLocation = (request: MapCreateRequest) => {
    if (request.entityType !== "student") return;

    openCreate({
      latitude: request.coordinate.latitude,
      longitude: request.coordinate.longitude,
    });
  };

  const handleMapLocationUpdate = async (
    request: MapLocationUpdateRequest,
  ) => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      throw new Error("Sign in and select a school branch first.");
    }

    const entityType = String(request.marker.entityType || "");
    const metadata = request.marker.metadata || {};

    const target =
      entityType === "student"
        ? {
            table: "students",
            id: cleanId(metadata.studentId || request.marker.id),
            label: "Student",
          }
        : entityType === "teacher"
          ? {
              table: "teachers",
              id: cleanId(metadata.teacherId || request.marker.id),
              label: "Teacher",
            }
          : entityType === "parent"
            ? {
                table: "parents",
                id: cleanId(metadata.parentId || request.marker.id),
                label: "Parent",
              }
            : entityType === "branch"
              ? {
                  table: "branches",
                  id: cleanId(metadata.branchId || request.marker.id),
                  label: "Branch",
                }
              : null;

    if (!target?.id) {
      throw new Error("The selected map item could not be identified.");
    }

    await updateLocal(target.table as any, target.id, {
      latitude: request.coordinate.latitude,
      longitude: request.coordinate.longitude,
      locationSource: "manual",
      locationCapturedAt: Date.now(),
      mapVisible: true,
      isDeleted: false,
    } as any);

    showToast("success", `${target.label} location updated.`);
    await load();
  };

  const openEdit = (row: Student) => {
    const s: any = row;
    const studentId = idOf(s.id);
    const resolvedPhoto =
      resolvedMediaById[studentId]?.photo ||
      mediaPreviewUrls[mediaKey(studentId, "photo")] ||
      "";
    const resolvedCoverPhoto =
      resolvedMediaById[studentId]?.coverPhoto ||
      mediaPreviewUrls[mediaKey(studentId, "coverPhoto")] ||
      "";
    const activeEnrollment: any = (enrollmentMap.get(studentId) || []).find(
      (item: any) => item.status === "active" && !item.isDeleted,
    );

    mediaSessionKey.current = makeMediaSessionKey();
    uploadedMediaAssetIds.current = {};
    setSelectedItem(null);
    setForm({
      id: studentId,
      organizationId: s.organizationId ? String(s.organizationId) : "",
      currentClassId: activeEnrollment?.classId
        ? String(activeEnrollment.classId)
        : s.currentClassId
          ? String(s.currentClassId)
          : "",
      enrollmentAcademicStructureId: "",
      enrollmentAcademicPeriodId: "",
      enrollmentStartDate: todayISO(),
      admissionNumber: s.admissionNumber || "",
      fullName: s.fullName || "",
      gender: s.gender || "",
      age: s.age == null ? "" : String(s.age),
      dateOfBirth: s.dateOfBirth || "",
      // Edit safety: do not hydrate the edit form from raw row.photo/row.coverPhoto.
      // Those legacy fields may already be stale or wrong on corrupted student rows.
      // The list can still display legacy fallback, but edit/save should only use
      // media resolved by student owner + local id + field key or a new upload.
      photo: resolvedPhoto,
      photoMediaId: s.photoMediaId ? String(s.photoMediaId) : undefined,
      coverPhoto: resolvedCoverPhoto,
      coverPhotoMediaId: s.coverPhotoMediaId
        ? String(s.coverPhotoMediaId)
        : undefined,
      parentName: s.parentName || "",
      parentPhone: s.parentPhone || "",
      parentEmail: s.parentEmail || "",
      address: s.address || "",
      latitude: s.latitude == null ? "" : String(s.latitude),
      longitude: s.longitude == null ? "" : String(s.longitude),
      accuracyMeters:
        s.accuracyMeters == null ? "" : String(s.accuracyMeters),
      locationLabel: s.locationLabel || "",
      formattedAddress: s.formattedAddress || "",
      locationType: s.locationType || "home",
      locationSource: s.locationSource || "manual",
      locationPrecision: s.locationPrecision || "exact",
      locationCapturedAt: s.locationCapturedAt || undefined,
      mapVisible: s.mapVisible !== false,
      locationConsentGiven: Boolean(s.locationConsentGiven),
      locationConsentAt: s.locationConsentAt || undefined,
      locationRestricted: Boolean(s.locationRestricted),
      status: s.status || "active",
    });
    setModalOpen(true);
  };

  const resolveStudentRecord = async (studentId: string): Promise<Student | undefined> => {
    const normalizedId = cleanId(studentId);
    if (!normalizedId) return undefined;

    const direct = await db.students.get(normalizedId).catch(() => undefined);
    if (direct) return direct;

    const byCloudId = await db.students
      .where("cloudId")
      .equals(normalizedId)
      .first()
      .catch(() => undefined);
    if (byCloudId) return byCloudId;

    return db.students
      .where("localId")
      .equals(normalizedId)
      .first()
      .catch(() => undefined);
  };

  const syncStudentCurrentClass = async (studentId: string, classId: string) => {
    const student = await resolveStudentRecord(studentId);
    const localStudentId = cleanId((student as any)?.id) || cleanId(studentId);

    if (!student || !localStudentId) {
      throw new Error("The selected student record could not be resolved locally.");
    }

    await updateLocal("students", localStudentId, {
      currentClassId: cleanId(classId) || null,
      status: (student as any).status === "graduated" ? "active" : (student as any).status,
    } as unknown as Partial<Student>);
  };

  const validateEnrollmentDraft = (
    draft: EnrollmentFormState,
    options: { studentId?: string; ignoreId?: string } = {},
  ) => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId) return "Select a school first.";
    if (!branchId) return "Select a branch first.";

    const studentId = cleanId(options.studentId || draft.studentId);
    if (!studentId) return "Select student.";
    if (!draft.classId) return "Select class.";
    if (!draft.academicStructureId) return "Select academic structure.";
    if (!draft.academicPeriodId) return "Select academic period.";
    if (!draft.startDate) return "Select start date.";

    const selectedStudent = rows.find((row: any) => sameId(row.id, studentId));
    if (!selectedStudent) return "Selected student is not in this branch.";
    if (!classMap.get(idOf(draft.classId))) return "Selected class is not in this branch.";
    if (!structureMap.get(idOf(draft.academicStructureId)))
      return "Selected academic structure is not in this branch.";

    const selectedPeriod: any = periodMap.get(idOf(draft.academicPeriodId));
    if (!selectedPeriod) return "Selected academic period is not in this branch.";
    if (!sameId(selectedPeriod.academicStructureId, draft.academicStructureId))
      return "Selected academic period does not belong to the selected academic structure.";
    if (draft.endDate && draft.endDate < draft.startDate)
      return "End date cannot be before start date.";

    const ignoredId = cleanId(options.ignoreId || draft.id);
    const duplicate = enrollments.find((row: any) => {
      if (ignoredId && sameId(row.id, ignoredId)) return false;
      return (
        sameId(row.studentId, studentId) &&
        sameId(row.classId, draft.classId) &&
        sameId(row.academicStructureId, draft.academicStructureId) &&
        sameId(row.academicPeriodId, draft.academicPeriodId) &&
        !row.isDeleted
      );
    });
    if (duplicate)
      return "This student is already enrolled in this class for this academic period.";

    const activeClassInSamePeriod = enrollments.find((row: any) => {
      if (ignoredId && sameId(row.id, ignoredId)) return false;
      return (
        sameId(row.studentId, studentId) &&
        sameId(row.academicStructureId, draft.academicStructureId) &&
        sameId(row.academicPeriodId, draft.academicPeriodId) &&
        row.status === "active" &&
        !row.isDeleted
      );
    });
    if (activeClassInSamePeriod && draft.status === "active")
      return "This student already has an active class enrollment for this academic period.";

    return "";
  };

  const openEnrollmentManager = (item: StudentView) => {
    setSelectedItem(null);
    setEnrollmentEditorOpen(false);
    setEnrollmentStudentId(item.id);
  };

  const openEnrollmentCreate = (item?: StudentView | null) => {
    const target = item || enrollmentManagerItem;
    if (!target) return;
    const defaults = defaultEnrollmentSelection();
    const row: any = target.row;

    setEnrollmentForm({
      ...emptyEnrollmentForm,
      studentId: target.id,
      classId: cleanId((target.activeEnrollment as any)?.classId || row.currentClassId),
      academicStructureId: defaults.academicStructureId,
      academicPeriodId: defaults.academicPeriodId,
      startDate: defaults.startDate,
      status: "active",
    });
    setEnrollmentEditorOpen(true);
  };

  const openEnrollmentEdit = (row: StudentEnrollment) => {
    const item: any = row;
    setEnrollmentForm({
      id: cleanId(item.id),
      studentId: cleanId(item.studentId),
      classId: cleanId(item.classId),
      academicStructureId: cleanId(item.academicStructureId),
      academicPeriodId: cleanId(item.academicPeriodId),
      startDate: item.startDate || todayISO(),
      endDate: item.endDate || "",
      status: (item.status || "active") as EnrollmentStatus,
    });
    setEnrollmentEditorOpen(true);
  };

  const saveEnrollment = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const error = validateEnrollmentDraft(enrollmentForm);
    if (error) {
      showToast("error", error);
      return;
    }
    if (!authenticated || !accountId || !schoolId || !branchId) return;

    try {
      setEnrollmentSaving(true);
      const studentId = cleanId(enrollmentForm.studentId);
      const classId = cleanId(enrollmentForm.classId);
      const payload: Partial<StudentEnrollment> = {
        accountId,
        schoolId,
        branchId,
        studentId: studentId || undefined,
        classId: classId || undefined,
        academicStructureId: cleanId(enrollmentForm.academicStructureId) || undefined,
        academicPeriodId: cleanId(enrollmentForm.academicPeriodId) || undefined,
        startDate: enrollmentForm.startDate,
        endDate:
          enrollmentForm.status === "active"
            ? undefined
            : enrollmentForm.endDate.trim() || undefined,
        status: enrollmentForm.status,
        isDeleted: false,
      } as Partial<StudentEnrollment>;

      if (enrollmentForm.id) {
        await updateLocal("studentEnrollments", enrollmentForm.id, payload);
      } else {
        await createLocal("studentEnrollments", payload as unknown as StudentEnrollment);
      }

      if (enrollmentForm.status === "active" && studentId && classId) {
        await syncStudentCurrentClass(studentId, classId);
      }

      setEnrollmentEditorOpen(false);
      showToast("success", "Student enrollment saved.");
      await load();
    } catch (error: any) {
      console.error("Failed to save student enrollment:", error);
      showToast("error", error?.message || "Failed to save student enrollment.");
    } finally {
      setEnrollmentSaving(false);
    }
  };

  const setEnrollmentStatus = async (
    row: StudentEnrollment,
    status: EnrollmentStatus,
  ) => {
    const item: any = row;
    const id = cleanId(item.id);
    if (!id) return;

    if (status === "active") {
      const draft: EnrollmentFormState = {
        id,
        studentId: cleanId(item.studentId),
        classId: cleanId(item.classId),
        academicStructureId: cleanId(item.academicStructureId),
        academicPeriodId: cleanId(item.academicPeriodId),
        startDate: item.startDate || todayISO(),
        endDate: "",
        status: "active",
      };
      const error = validateEnrollmentDraft(draft, { ignoreId: id });
      if (error) {
        showToast("error", error);
        return;
      }
    }

    try {
      const patch: Partial<StudentEnrollment> = { status } as Partial<StudentEnrollment>;
      if (status === "active") {
        patch.endDate = undefined;
      } else if (!item.endDate) {
        patch.endDate = todayISO();
      }

      await updateLocal("studentEnrollments", id, patch);
      if (status === "active") {
        await syncStudentCurrentClass(String(item.studentId), String(item.classId));
      }

      showToast("success", `Enrollment marked as ${enrollmentStatusLabel(status)}.`);
      await load();
    } catch (error: any) {
      console.error("Failed to update enrollment status:", error);
      showToast("error", error?.message || "Failed to update enrollment status.");
    }
  };

  const syncEnrollmentCurrentClass = async (row: StudentEnrollment) => {
    const item: any = row;
    try {
      await syncStudentCurrentClass(String(item.studentId), String(item.classId));
      showToast("success", "Student current class updated from the active enrollment.");
      await load();
    } catch (error: any) {
      console.error("Failed to sync current class:", error);
      showToast("error", error?.message || "Failed to sync current class.");
    }
  };

  const removeEnrollment = async (row: StudentEnrollment) => {
    const item: any = row;
    const id = cleanId(item.id);
    if (!id) return;
    if (!window.confirm("Delete this student enrollment record?")) return;

    await softDeleteLocal("studentEnrollments", id);
    showToast("success", "Student enrollment deleted.");
    await load();
  };

  const clearFilters = () => {
    setFilterClassId("all");
    setFilterOrganizationId("all");
    setFilterStatus("all");
    setFilterGender("all");
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId) return "Select a school first.";
    if (!branchId) return "Select a branch first.";
    if (!form.fullName.trim()) return "Enter student full name.";
    if (form.age !== "" && Number(form.age) < 0)
      return "Age cannot be negative.";

    const hasLatitude = form.latitude.trim() !== "";
    const hasLongitude = form.longitude.trim() !== "";

    if (hasLatitude !== hasLongitude)
      return "Enter both latitude and longitude, or leave both empty.";

    if (hasLatitude && hasLongitude) {
      const latitude = Number(form.latitude);
      const longitude = Number(form.longitude);

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
        return "Latitude must be a number between -90 and 90.";

      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
        return "Longitude must be a number between -180 and 180.";
    }

    if (
      form.accuracyMeters.trim() !== "" &&
      (!Number.isFinite(Number(form.accuracyMeters)) ||
        Number(form.accuracyMeters) < 0)
    )
      return "Location accuracy must be zero or greater.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return (
        !!form.admissionNumber.trim() &&
        safeLower(row.admissionNumber) === safeLower(form.admissionNumber) &&
        !row.isDeleted
      );
    });

    if (duplicate)
      return "A student with this admission number already exists in this branch.";
    if (form.currentClassId && !classMap.get(idOf(form.currentClassId)))
      return "Selected class is not in this branch.";
    if (form.organizationId && !organizationMap.get(idOf(form.organizationId)))
      return "Selected organization is not in this branch.";

    if (!form.id && form.currentClassId) {
      if (form.status !== "active")
        return "Initial enrollment requires the student status to be Active, or leave the class unassigned.";
      if (!form.enrollmentAcademicStructureId)
        return "Select academic structure for the initial enrollment.";
      if (!form.enrollmentAcademicPeriodId)
        return "Select academic period for the initial enrollment.";
      if (!form.enrollmentStartDate)
        return "Select enrollment start date.";
      if (!structureMap.get(idOf(form.enrollmentAcademicStructureId)))
        return "Selected academic structure is not in this branch.";
      const initialPeriod: any = periodMap.get(idOf(form.enrollmentAcademicPeriodId));
      if (!initialPeriod)
        return "Selected academic period is not in this branch.";
      if (!sameId(initialPeriod.academicStructureId, form.enrollmentAcademicStructureId))
        return "Selected academic period does not belong to the selected academic structure.";
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

    if (!authenticated || !accountId || !schoolId || !branchId) return;

    try {
      setSaving(true);

      const existing = form.id
        ? rows.find((row: any) => sameId(row.id, form.id))
        : undefined;

      const payload: Partial<Student> = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        organizationId: form.organizationId
          ? String(form.organizationId)
          : undefined,
        currentClassId: form.currentClassId
          ? String(form.currentClassId)
          : undefined,
        admissionNumber: form.admissionNumber.trim() || undefined,
        fullName: form.fullName.trim(),
        gender: form.gender.trim() || undefined,
        age: form.age === "" ? undefined : Number(form.age),
        dateOfBirth: form.dateOfBirth || undefined,
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        coverPhoto: safeRecordMediaValue(form.coverPhoto),
        coverPhotoMediaId: form.coverPhotoMediaId || undefined,
        parentName: form.parentName.trim() || undefined,
        parentPhone: form.parentPhone.trim() || undefined,
        parentEmail: form.parentEmail.trim() || undefined,
        address: form.address.trim() || undefined,
        latitude:
          form.latitude.trim() === "" ? undefined : Number(form.latitude),
        longitude:
          form.longitude.trim() === "" ? undefined : Number(form.longitude),
        accuracyMeters:
          form.accuracyMeters.trim() === ""
            ? undefined
            : Number(form.accuracyMeters),
        locationLabel: form.locationLabel.trim() || undefined,
        formattedAddress: form.formattedAddress.trim() || undefined,
        locationType: form.locationType,
        locationSource: form.locationSource,
        locationPrecision: form.locationPrecision,
        locationCapturedAt:
          form.latitude.trim() && form.longitude.trim()
            ? form.locationCapturedAt || Date.now()
            : undefined,
        mapVisible: form.mapVisible,
        locationConsentGiven: form.locationConsentGiven,
        locationConsentAt: form.locationConsentGiven
          ? form.locationConsentAt || Date.now()
          : undefined,
        locationRestricted: form.locationRestricted,
        status: form.status || "active",
        active: true,
        isDeleted: false,
      } as Partial<Student>;

      const savedStudent =
        form.id && existing
          ? await updateLocal(
              "students",
              String(form.id),
              payload,
            )
          : await createLocal(
              "students",
              payload as unknown as Student,
            );

      const savedStudentId = savedEntityId(
        savedStudent,
        form.id,
      );

      if (!savedStudentId) {
        throw new Error(
          "The student record was saved, but its permanent ID could not be resolved for image attachment.",
        );
      }

      const stagedPhotoId =
        cleanId(
          uploadedMediaAssetIds.current.photo,
        );

      const stagedCoverPhotoId =
        cleanId(
          uploadedMediaAssetIds.current.coverPhoto,
        );

      const committedMedia =
        await commitMediaAssetsToOwner({
          accountId,
          ownerTable:
            STUDENT_MEDIA_OWNER_TABLE,
          ownerId: savedStudentId,
          ownerTempKey:
            mediaSessionKey.current,
          assets: [
            {
              assetId:
                stagedPhotoId ||
                undefined,
              fieldKey:
                MediaFieldKeys.PHOTO,
            },
            {
              assetId:
                stagedCoverPhotoId ||
                undefined,
              fieldKey:
                MediaFieldKeys.COVER_PHOTO,
            },
          ],
        });

      const committedPhotoId =
        committedMedia.find(
          (item) =>
            item.fieldKey ===
            MediaFieldKeys.PHOTO,
        )?.assetId;

      const committedCoverPhotoId =
        committedMedia.find(
          (item) =>
            item.fieldKey ===
            MediaFieldKeys.COVER_PHOTO,
        )?.assetId;

      /*
       * Persist the exact committed media IDs back onto the student record.
       * This is intentionally a second small local-first update because the
       * owner ID does not exist until after createLocal() completes.
       */
      if (
        committedPhotoId ||
        committedCoverPhotoId
      ) {
        await updateLocal(
          "students",
          savedStudentId,
          {
            photoMediaId:
              committedPhotoId ||
              form.photoMediaId ||
              existing?.photoMediaId ||
              undefined,
            coverPhotoMediaId:
              committedCoverPhotoId ||
              form.coverPhotoMediaId ||
              existing?.coverPhotoMediaId ||
              undefined,

            /*
             * New media is resolved from mediaAssets/mediaBlobs. Do not store
             * data/blob preview strings in the student sync record.
             */
            photo:
              safeRecordMediaValue(
                existing?.photo,
              ),
            coverPhoto:
              safeRecordMediaValue(
                existing?.coverPhoto,
              ),
          } as Partial<Student>,
        );
      }

      let initialEnrollmentCreated = false;
      if (!existing && form.currentClassId) {
        const initialEnrollment: Partial<StudentEnrollment> = {
          accountId,
          schoolId,
          branchId,
          studentId: savedStudentId,
          classId: cleanId(form.currentClassId) || undefined,
          academicStructureId:
            cleanId(form.enrollmentAcademicStructureId) || undefined,
          academicPeriodId: cleanId(form.enrollmentAcademicPeriodId) || undefined,
          startDate: form.enrollmentStartDate,
          status: "active",
          isDeleted: false,
        };

        await createLocal(
          "studentEnrollments",
          initialEnrollment as unknown as StudentEnrollment,
        );
        await syncStudentCurrentClass(savedStudentId, form.currentClassId);
        initialEnrollmentCreated = true;
      }

      uploadedMediaAssetIds.current = {};
      mediaSessionKey.current = makeMediaSessionKey();
      setModalOpen(false);
      showToast(
        "success",
        initialEnrollmentCreated
          ? "Student saved and enrolled in the selected academic period."
          : "Student saved.",
      );
      await load();
    } catch (error: any) {
      console.error(
        "Failed to save student and media:",
        error,
      );
      showToast(
        "error",
        error?.message ||
          "Failed to save student.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: StudentView) => {
    const row: any = item.row;
    const id = idOf(row.id);
    if (!id) return;

    const ok = window.confirm(
      item.enrollmentCount
        ? `"${row.fullName}" has ${item.enrollmentCount} enrollment record(s). Delete anyway?`
        : `Delete "${row.fullName}"?`,
    );

    if (!ok) return;

    await Promise.all(
      ["photo", "coverPhoto"].map((fieldKey) =>
        softDeleteOwnerFieldAssets({
          accountId: String(accountId),

          ownerTable: "students",

          ownerId: cleanId(id) || undefined,

          fieldKey,
        }),
      ),
    );

    await softDeleteLocal("students", String(id));
    setSelectedItem(null);
    showToast("success", "Student deleted.");
    await load();
  };

  const setStatus = async (item: StudentView, status: StudentStatus) => {
    const id = idOf((item.row as any).id);
    if (!id) return;

    await updateLocal("students", id, {
      status,
      active: status === "active",
      isDeleted: false,
    } as unknown as Partial<Student>);

    setSelectedItem(null);
    showToast("success", `Student marked as ${statusLabel(status)}.`);
    await load();
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Students..."
        text="Checking account, branch, classes, organizations, enrollments, and student records."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing students."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page students-page"
        style={
          {
            "--ba-primary": primary,
            "--ba-primary-text": primaryText,
          } as React.CSSProperties
        }
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>No branch workspace selected</h2>
          <p>
            Students belong to the selected branch-admin workspace. Use Select
            Role again if the wrong branch is active.
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
      className="ba-page students-page"
      style={
        {
          "--ba-primary": primary,
          "--ba-primary-text": primaryText,
        } as React.CSSProperties
      }
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
        aria-label="Student search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students..."
            aria-label="Search students"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline settings-save-button"
          onClick={() => openCreate()}
          aria-label="Add student"
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
              Status: {statusLabel(filterStatus)} ×
            </button>
          )}
          {filterGender !== "all" && (
            <button type="button" onClick={() => setFilterGender("all")}>
              Gender: {filterGender} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Students by Class"
            rows={countsByClass}
            total={summary.total}
          />
          <AnalysisCard
            title="Students by Organization"
            rows={countsByOrganization}
            total={summary.total}
          />
          <AnalysisCard
            title="Students by Status"
            rows={countsByStatus}
            total={summary.total}
          />
          <AnalysisCard
            title="Students by Gender"
            rows={countsByGender}
            total={summary.total}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>
              Student record(s) currently match your search and filter
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
          setStatus={setStatus}
        />
      )}

      {viewMode === "map" && (
        <section className="students-map-view" aria-label="Student proximity map">
          <div className="students-map-toolbar" aria-label="Map layers">
            <CompactMapLayerToggle
              label="Branch"
              tone="branch"
              count={branches.length}
              checked={visibleMapLayers.branch}
              onChange={(checked) =>
                setVisibleMapLayers((current) => ({
                  ...current,
                  branch: checked,
                }))
              }
            />
            <CompactMapLayerToggle
              label="Student"
              tone="student"
              count={filteredRows.length}
              checked={visibleMapLayers.student}
              onChange={(checked) =>
                setVisibleMapLayers((current) => ({
                  ...current,
                  student: checked,
                }))
              }
            />
            <CompactMapLayerToggle
              label="Teacher"
              tone="teacher"
              count={teachers.length}
              checked={visibleMapLayers.teacher}
              onChange={(checked) =>
                setVisibleMapLayers((current) => ({
                  ...current,
                  teacher: checked,
                }))
              }
            />
            <CompactMapLayerToggle
              label="Parent"
              tone="parent"
              count={parents.length}
              checked={visibleMapLayers.parent}
              onChange={(checked) =>
                setVisibleMapLayers((current) => ({
                  ...current,
                  parent: checked,
                }))
              }
            />
          </div>

          <SchoolMap
            markers={proximityMarkers}
            height="min(68vh, 720px)"
            searchable={false}
            filterable={false}
            showLegend={false}
            cluster
            fitMarkers
            allowCreateAtLocation
            createEntityTypes={["student"]}
            onCreateAtLocation={handleCreateAtLocation}
            allowLocationEditing
            onLocationUpdate={handleMapLocationUpdate}
            emptyView={
              <div className="students-map-empty">
                <span aria-hidden="true">⌖</span>
                <strong>No visible mapped locations</strong>
                <small>
                  Keep Student enabled, add student coordinates, or turn on
                  Branch, Teacher, and Parent comparison layers.
                </small>
              </div>
            }
          />
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <StudentListItem
              key={String(item.id)}
              item={item}
              primary={primary}
              onOpen={() => setSelectedItem(item)}
            />
          ))}

          {!filteredRows.length && (
            <Empty
              icon="🎓"
              title="No students found"
              text="Add student records for this branch, assign classes, connect parent information, and track enrollment history."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          classes={classes}
          organizations={organizations}
          genderOptions={genderOptions}
          filterClassId={filterClassId}
          filterOrganizationId={filterOrganizationId}
          filterStatus={filterStatus}
          filterGender={filterGender}
          setFilterClassId={setFilterClassId}
          setFilterOrganizationId={setFilterOrganizationId}
          setFilterStatus={setFilterStatus}
          setFilterGender={setFilterGender}
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
          setStatus={setStatus}
          manageEnrollment={openEnrollmentManager}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <StudentModal
          form={form}
          saving={saving}
          classes={classes}
          organizations={organizations}
          academicStructures={academicStructures}
          filteredPeriodsForForm={filteredPeriodsForStudentForm}
          periodMap={periodMap}
          activeEnrollment={
            form.id
              ? (enrollmentMap.get(form.id) || []).find(
                  (row: any) => row.status === "active" && !row.isDeleted,
                )
              : undefined
          }
          setModalOpen={setModalOpen}
          updateForm={updateForm}
          handleImageUpload={handleImageUpload}
          openCameraForField={openCameraForField}
          save={save}
        />
      )}

      {enrollmentManagerItem && (
        <EnrollmentManagerSheet
          item={enrollmentManagerItem}
          enrollments={managedEnrollments}
          classMap={classMap}
          structureMap={structureMap}
          periodMap={periodMap}
          primary={primary}
          openCreate={() => openEnrollmentCreate(enrollmentManagerItem)}
          openEdit={openEnrollmentEdit}
          setStatus={setEnrollmentStatus}
          syncCurrentClass={syncEnrollmentCurrentClass}
          remove={removeEnrollment}
          onClose={() => {
            setEnrollmentEditorOpen(false);
            setEnrollmentStudentId(null);
          }}
        />
      )}

      {enrollmentEditorOpen && enrollmentManagerItem && (
        <EnrollmentEditorModal
          student={enrollmentManagerItem}
          form={enrollmentForm}
          saving={enrollmentSaving}
          classes={classes}
          academicStructures={academicStructures}
          filteredPeriodsForForm={filteredPeriodsForEnrollmentForm}
          periodMap={periodMap}
          updateForm={(patch) =>
            setEnrollmentForm((current) => ({ ...current, ...patch }))
          }
          save={saveEnrollment}
          onClose={() => setEnrollmentEditorOpen(false)}
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
          entityLabel={STUDENT_MEDIA_ENTITY_LABEL}
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
      className="ba-page students-page"
      style={
        {
          "--ba-primary": primary,
          "--ba-primary-text": getReadableTextColor(primary),
        } as React.CSSProperties
      }
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

function StudentListItem({
  item,
  primary,
  onOpen,
}: {
  item: StudentView;
  primary: string;
  onOpen: () => void;
}) {
  const row: any = item.row;

  return (
    <button type="button" className="student-row" onClick={onOpen}>
      <Avatar name={row.fullName} photo={item.photoUrl} primary={primary} />

      <span className="student-main">
        <strong>{row.fullName || "Unnamed student"}</strong>
        <small>
          {item.className}
          {row.admissionNumber ? ` · ${row.admissionNumber}` : ""}
        </small>
        <em>
          {row.parentPhone
            ? `Parent: ${row.parentPhone}`
            : row.parentName
              ? `Parent: ${row.parentName}`
              : item.organizationName}
        </em>
      </span>

      <span className="student-side">
        <span
          className={`status-dot-mini ${statusTone(row.status)}`}
          title={statusLabel(row.status)}
          aria-label={statusLabel(row.status)}
        />
        <i>⋯</i>
      </span>
    </button>
  );
}

function CompactMapLayerToggle({
  label,
  tone,
  count,
  checked,
  onChange,
}: {
  label: string;
  tone: ProximityLayer;
  count: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`students-map-toggle ${tone} ${checked ? "active" : ""}`}
      aria-pressed={checked}
      aria-label={`${checked ? "Hide" : "Show"} ${label.toLowerCase()} locations`}
      title={`${label}: ${count} loaded record${count === 1 ? "" : "s"}`}
      onClick={() => onChange(!checked)}
    >
      <i aria-hidden="true" />
      <span>{label}</span>
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
  organizations,
  genderOptions,
  filterClassId,
  filterOrganizationId,
  filterStatus,
  filterGender,
  setFilterClassId,
  setFilterOrganizationId,
  setFilterStatus,
  setFilterGender,
  clearFilters,
  onClose,
}: {
  classes: Class[];
  organizations: Organization[];
  genderOptions: string[];
  filterClassId: string;
  filterOrganizationId: string;
  filterStatus: "all" | StudentStatus;
  filterGender: string;
  setFilterClassId: (value: string) => void;
  setFilterOrganizationId: (value: string) => void;
  setFilterStatus: (value: "all" | StudentStatus) => void;
  setFilterGender: (value: string) => void;
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
            <span>Class</span>
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
            >
              <option value="all">All classes</option>
              {classes.map((r: any) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Organization</span>
            <select
              value={filterOrganizationId}
              onChange={(e) => setFilterOrganizationId(e.target.value)}
            >
              <option value="all">All organizations</option>
              {organizations.map((r: any) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {r.name}
                  {r.type ? ` · ${r.type}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as "all" | StudentStatus)
              }
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="graduated">Graduated</option>
              <option value="transferred">Transferred</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </label>

          <label>
            <span>Gender</span>
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
            >
              <option value="all">All gender</option>
              {genderOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
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
            <small>Simple student records</small>
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
            className={viewMode === "map" ? "active" : ""}
            onClick={() => setViewMode("map")}
          >
            <span>⌖</span>
            <b>Map view</b>
            <small>See filtered students with saved locations</small>
          </button>

          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Class, gender, status and organization summaries</small>
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
  setStatus,
  manageEnrollment,
  onClose,
}: {
  item: StudentView;
  openEdit: (row: Student) => void;
  remove: (item: StudentView) => void;
  setStatus: (item: StudentView, status: StudentStatus) => void;
  manageEnrollment: (item: StudentView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{row.fullName || "Student"}</h2>
            <p>
              {item.className} · {statusLabel(row.status)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close student actions"
          >
            ✕
          </button>
        </div>

        <div className="student-detail-strip">
          <span>
            <b>Admission</b>
            {row.admissionNumber || "Not set"}
          </span>
          <span>
            <b>Parent</b>
            {row.parentPhone || row.parentName || "Not set"}
          </span>
          <span>
            <b>Enrollments</b>
            {item.enrollmentCount}
          </span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item.row)}>
            <span>✎</span>
            <b>Edit student</b>
            <small>Update profile, parent, location and photos</small>
          </button>

          <button type="button" onClick={() => manageEnrollment(item)}>
            <span>⇄</span>
            <b>Manage enrollment</b>
            <small>Class placement, academic period, status and history</small>
          </button>

          {row.status !== "active" && (
            <button type="button" onClick={() => setStatus(item, "active")}>
              <span>✓</span>
              <b>Activate</b>
              <small>Mark this student as active</small>
            </button>
          )}

          {row.status !== "graduated" && (
            <button type="button" onClick={() => setStatus(item, "graduated")}>
              <span>🎯</span>
              <b>Graduate</b>
              <small>Mark this student as graduated</small>
            </button>
          )}

          {row.status !== "transferred" && (
            <button
              type="button"
              onClick={() => setStatus(item, "transferred")}
            >
              <span>↗</span>
              <b>Transfer</b>
              <small>Mark this student as transferred</small>
            </button>
          )}

          {row.status !== "withdrawn" && (
            <button type="button" onClick={() => setStatus(item, "withdrawn")}>
              <span>⏸</span>
              <b>Withdraw</b>
              <small>Mark this student as withdrawn</small>
            </button>
          )}

          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this student locally</small>
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
  setStatus,
}: {
  rows: StudentView[];
  openEdit: (row: Student) => void;
  remove: (item: StudentView) => void;
  setStatus: (item: StudentView, status: StudentStatus) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Students ({rows.length})</th>
              <th>Admission No.</th>
              <th>Class</th>
              <th>Organization</th>
              <th>Gender</th>
              <th>Age</th>
              <th>Parent</th>
              <th>Phone</th>
              <th>Enrollments</th>
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
                    <strong>{row.fullName}</strong>
                    <span>{row.address || "No address"}</span>
                  </td>
                  <td>{row.admissionNumber || "—"}</td>
                  <td>{item.className}</td>
                  <td>{item.organizationName}</td>
                  <td>{row.gender || "—"}</td>
                  <td>{row.age ?? "—"}</td>
                  <td>{row.parentName || "—"}</td>
                  <td>{row.parentPhone || "—"}</td>
                  <td>{item.enrollmentCount}</td>
                  <td>
                    <Chip tone={statusTone(row.status)}>
                      {statusLabel(row.status)}
                    </Chip>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item.row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatus(item, "active")}
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatus(item, "graduated")}
                      >
                        Graduate
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
          <div className="ba-empty-table">No student matches your filters.</div>
        )}
      </div>
    </section>
  );
}

function StudentModal({
  form,
  saving,
  classes,
  organizations,
  academicStructures,
  filteredPeriodsForForm,
  periodMap,
  activeEnrollment,
  setModalOpen,
  updateForm,
  handleImageUpload,
  openCameraForField,
  save,
}: {
  form: FormState;
  saving: boolean;
  classes: Class[];
  organizations: Organization[];
  academicStructures: AcademicStructure[];
  filteredPeriodsForForm: AcademicPeriod[];
  periodMap: Map<string, AcademicPeriod>;
  activeEnrollment?: StudentEnrollment;
  setModalOpen: (open: boolean) => void;
  updateForm: (patch: Partial<FormState>) => void;
  handleImageUpload: (
    field: "photo" | "coverPhoto",
    file?: File,
  ) => void | Promise<void>;
  openCameraForField: (field: CameraField) => void;
  save: (event?: React.FormEvent) => void;
}) {
  const [locating, setLocating] = useState(false);

  const captureCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      window.alert("Location access is not available on this device or browser.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const capturedAt = position.timestamp || Date.now();

        updateForm({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? String(Math.round(position.coords.accuracy))
            : "",
          locationSource: "device_gps",
          locationCapturedAt: capturedAt,
          mapVisible: true,
        });

        setLocating(false);
      },
      (error) => {
        setLocating(false);

        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access or enter the coordinates manually."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Your current location could not be determined."
              : error.code === error.TIMEOUT
                ? "Location capture timed out. Please try again."
                : "Location capture failed.";

        window.alert(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      },
    );
  };

  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Student" : "Add Student"}</h2>
            <p>Student will be saved under the selected school branch.</p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close student form"
          >
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Student</h3>
          <div className="ba-form">
            <label>
              <span>Full Name</span>
              <input
                value={form.fullName}
                onChange={(e) => updateForm({ fullName: e.target.value })}
                placeholder="Student full name"
              />
            </label>

            <label>
              <span>Admission Number</span>
              <input
                value={form.admissionNumber}
                onChange={(e) =>
                  updateForm({ admissionNumber: e.target.value })
                }
                placeholder="Admission number"
              />
            </label>

            <label>
              <span>Gender</span>
              <select
                value={form.gender}
                onChange={(e) => updateForm({ gender: e.target.value })}
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label>
              <span>Date of Birth</span>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => updateForm({ dateOfBirth: e.target.value })}
              />
            </label>

            <label>
              <span>Age</span>
              <input
                type="number"
                value={form.age}
                onChange={(e) => updateForm({ age: e.target.value })}
                placeholder="Age"
              />
            </label>

            <label>
              <span>Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  updateForm({ status: e.target.value as StudentStatus })
                }
              >
                <option value="active">Active</option>
                <option value="graduated">Graduated</option>
                <option value="transferred">Transferred</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </label>
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Academic</h3>
          <div className="ba-form two">
            <label>
              <span>{form.id ? "Current Class" : "Class / Initial Enrollment"}</span>
              <select
                value={form.currentClassId}
                disabled={Boolean(form.id && activeEnrollment)}
                onChange={(e) => updateForm({ currentClassId: e.target.value })}
              >
                <option value="">No class assigned</option>
                {classes.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
              {form.id && activeEnrollment ? (
                <small className="ba-field-hint">
                  Current class is controlled by the active enrollment. Use Manage Enrollment from the student actions to change it.
                </small>
              ) : !form.id ? (
                <small className="ba-field-hint">
                  Leave blank to create the student without enrolling them yet.
                </small>
              ) : null}
            </label>

            <label>
              <span>Organization / House / Department</span>
              <select
                value={form.organizationId}
                onChange={(e) => updateForm({ organizationId: e.target.value })}
              >
                <option value="">No organization</option>
                {organizations.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name}
                    {r.type ? ` · ${r.type}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {!form.id && form.currentClassId && (
              <>
                <label>
                  <span>Academic Structure</span>
                  <select
                    value={form.enrollmentAcademicStructureId}
                    onChange={(e) =>
                      updateForm({
                        enrollmentAcademicStructureId: e.target.value,
                        enrollmentAcademicPeriodId: "",
                      })
                    }
                  >
                    <option value="">Select academic structure</option>
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
                    value={form.enrollmentAcademicPeriodId}
                    onChange={(e) => {
                      const periodId = e.target.value;
                      const period: any = periodId
                        ? periodMap.get(idOf(periodId))
                        : undefined;
                      updateForm({
                        enrollmentAcademicPeriodId: periodId,
                        enrollmentAcademicStructureId: period?.academicStructureId
                          ? String(period.academicStructureId)
                          : form.enrollmentAcademicStructureId,
                        enrollmentStartDate:
                          period?.startDate || form.enrollmentStartDate,
                      });
                    }}
                  >
                    <option value="">Select academic period</option>
                    {filteredPeriodsForForm.map((row: any) => (
                      <option key={String(row.id)} value={String(row.id)}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Enrollment Start Date</span>
                  <input
                    type="date"
                    value={form.enrollmentStartDate}
                    onChange={(e) =>
                      updateForm({ enrollmentStartDate: e.target.value })
                    }
                  />
                </label>

                <div className="ba-inline-info">
                  <b>Initial enrollment</b>
                  <span>
                    Saving this student will also create an active enrollment for the selected class and academic period.
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Parent / Guardian</h3>
          <div className="ba-form">
            <label>
              <span>Parent / Guardian Name</span>
              <input
                value={form.parentName}
                onChange={(e) => updateForm({ parentName: e.target.value })}
                placeholder="Parent / guardian name"
              />
            </label>

            <label>
              <span>Parent Phone</span>
              <input
                value={form.parentPhone}
                onChange={(e) => updateForm({ parentPhone: e.target.value })}
                placeholder="Parent phone"
              />
            </label>

            <label>
              <span>Parent Email</span>
              <input
                value={form.parentEmail}
                onChange={(e) => updateForm({ parentEmail: e.target.value })}
                placeholder="Parent email"
              />
            </label>

            <label className="wide">
              <span>Address</span>
              <textarea
                value={form.address}
                onChange={(e) => updateForm({ address: e.target.value })}
                placeholder="Student address"
              />
            </label>
          </div>
        </section>

        <section className="ba-form-section">
          <div className="ba-section-heading-row">
            <div>
              <h3>Map Location</h3>
              <p>
                Add the student&apos;s approved home, boarding, pickup, or
                drop-off location.
              </p>
            </div>

            <button
              type="button"
              className="ba-media-button secondary"
              onClick={captureCurrentLocation}
              disabled={locating}
            >
              {locating ? "Getting location..." : "Use Current Location"}
            </button>
          </div>

          <div className="ba-form two">
            <label>
              <span>Latitude</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="-90"
                max="90"
                value={form.latitude}
                onChange={(e) =>
                  updateForm({
                    latitude: e.target.value,
                    locationSource: "manual",
                  })
                }
                placeholder="e.g. 5.603717"
              />
            </label>

            <label>
              <span>Longitude</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="-180"
                max="180"
                value={form.longitude}
                onChange={(e) =>
                  updateForm({
                    longitude: e.target.value,
                    locationSource: "manual",
                  })
                }
                placeholder="e.g. -0.186964"
              />
            </label>

            <label>
              <span>Location Label</span>
              <input
                value={form.locationLabel}
                onChange={(e) =>
                  updateForm({ locationLabel: e.target.value })
                }
                placeholder="e.g. Student home or Dansoman pickup point"
              />
            </label>

            <label>
              <span>Location Type</span>
              <select
                value={form.locationType}
                onChange={(e) =>
                  updateForm({
                    locationType: e.target.value as FormState["locationType"],
                  })
                }
              >
                <option value="home">Home</option>
                <option value="boarding">Boarding</option>
                <option value="pickup_point">Pickup point</option>
                <option value="dropoff_point">Drop-off point</option>
                <option value="workplace">Workplace</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label>
              <span>Location Precision</span>
              <select
                value={form.locationPrecision}
                onChange={(e) =>
                  updateForm({
                    locationPrecision:
                      e.target.value as FormState["locationPrecision"],
                  })
                }
              >
                <option value="exact">Exact</option>
                <option value="approximate">Approximate</option>
                <option value="area_only">Area only</option>
              </select>
            </label>

            <label>
              <span>Accuracy in Metres</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.accuracyMeters}
                onChange={(e) =>
                  updateForm({ accuracyMeters: e.target.value })
                }
                placeholder="Filled automatically when using GPS"
              />
            </label>

            <label className="wide">
              <span>Formatted Location Address</span>
              <textarea
                value={form.formattedAddress}
                onChange={(e) =>
                  updateForm({ formattedAddress: e.target.value })
                }
                placeholder="Readable address or directions for this map point"
              />
            </label>
          </div>

          <div className="ba-location-options">
            <label className="ba-check-row">
              <input
                type="checkbox"
                checked={form.mapVisible}
                onChange={(e) =>
                  updateForm({ mapVisible: e.target.checked })
                }
              />
              <span>
                <strong>Show on student map</strong>
                <small>
                  The point can appear to authorized users within the branch.
                </small>
              </span>
            </label>

            <label className="ba-check-row">
              <input
                type="checkbox"
                checked={form.locationConsentGiven}
                onChange={(e) =>
                  updateForm({
                    locationConsentGiven: e.target.checked,
                    locationConsentAt: e.target.checked
                      ? form.locationConsentAt || Date.now()
                      : undefined,
                  })
                }
              />
              <span>
                <strong>Location consent recorded</strong>
                <small>
                  Confirm that the school is permitted to store this location.
                </small>
              </span>
            </label>

            <label className="ba-check-row">
              <input
                type="checkbox"
                checked={form.locationRestricted}
                onChange={(e) =>
                  updateForm({ locationRestricted: e.target.checked })
                }
              />
              <span>
                <strong>Restricted location</strong>
                <small>
                  Mark this point as sensitive for stricter access controls.
                </small>
              </span>
            </label>
          </div>

          {(form.latitude || form.longitude) && (
            <div className="ba-location-captured">
              <span>Coordinate source: {form.locationSource.replace("_", " ")}</span>
              {form.locationCapturedAt ? (
                <small>
                  Captured {new Date(form.locationCapturedAt).toLocaleString()}
                </small>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  updateForm({
                    latitude: "",
                    longitude: "",
                    accuracyMeters: "",
                    locationCapturedAt: undefined,
                    locationSource: "manual",
                  })
                }
              >
                Clear coordinates
              </button>
            </div>
          )}
        </section>

        <section className="ba-form-section">
          <h3>Photos</h3>
          <div className="ba-form two">
            <label>
              <span>Student Photo</span>
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
                  alt="Student preview"
                  className="ba-preview-photo"
                />
              )}
            </label>

            <label>
              <span>Cover Photo</span>
              <div className="ba-media-actions">
                <label className="ba-media-button">
                  Upload Cover
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleImageUpload("coverPhoto", e.target.files?.[0])
                    }
                    hidden
                  />
                </label>

                <button
                  type="button"
                  className="ba-media-button secondary"
                  onClick={() => openCameraForField("coverPhoto")}
                >
                  Take Photo
                </button>
              </div>
              <small className="ba-media-hint">
                Upload from files or use the camera. The cover is compressed
                separately so sync records stay small.
              </small>
              {form.coverPhoto && (
                <img
                  src={form.coverPhoto}
                  alt="Student cover preview"
                  className="ba-preview-banner"
                />
              )}
            </label>
          </div>
        </section>

        <div className="ba-modal-actions">
          <button
            type="button"
            className="ba-cancel-button"
            onClick={() => setModalOpen(false)}
          >
            Cancel
          </button>
          <button type="submit" className="ba-save-button" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Add Student"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EnrollmentManagerSheet({
  item,
  enrollments,
  classMap,
  structureMap,
  periodMap,
  primary,
  openCreate,
  openEdit,
  setStatus,
  syncCurrentClass,
  remove,
  onClose,
}: {
  item: StudentView;
  enrollments: StudentEnrollment[];
  classMap: Map<string, Class>;
  structureMap: Map<string, AcademicStructure>;
  periodMap: Map<string, AcademicPeriod>;
  primary: string;
  openCreate: () => void;
  openEdit: (row: StudentEnrollment) => void;
  setStatus: (row: StudentEnrollment, status: EnrollmentStatus) => void;
  syncCurrentClass: (row: StudentEnrollment) => void;
  remove: (row: StudentEnrollment) => void;
  onClose: () => void;
}) {
  const student: any = item.row;
  const activeEnrollment: any = enrollments.find(
    (row: any) => row.status === "active" && !row.isDeleted,
  );

  return (
    <div className="ba-sheet-backdrop enrollment-manager-layer" role="dialog" aria-modal="true">
      <section className="ba-sheet enrollment-manager-sheet">
        <div className="ba-sheet-profile">
          <div className="enrollment-manager-profile">
            <Avatar name={student.fullName || "Student"} photo={item.photoUrl} primary={primary} />
            <div>
              <h2>{student.fullName || "Student"}</h2>
              <p>{student.admissionNumber || "No admission number"} · {enrollments.length} enrollment{enrollments.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close enrollment manager">✕</button>
        </div>

        <div className="enrollment-manager-current">
          <div>
            <small>Current academic placement</small>
            <strong>
              {activeEnrollment
                ? (classMap.get(idOf(activeEnrollment.classId)) as any)?.name || "Assigned class"
                : "No active enrollment"}
            </strong>
            <span>
              {activeEnrollment
                ? `${(structureMap.get(idOf(activeEnrollment.academicStructureId)) as any)?.name || "Structure"} · ${(periodMap.get(idOf(activeEnrollment.academicPeriodId)) as any)?.name || "Period"}`
                : "Create an enrollment when the student is placed into a class."}
            </span>
          </div>
          <button type="button" className="primary" onClick={openCreate}>+ New Enrollment</button>
        </div>

        <div className="enrollment-history-heading">
          <div>
            <h3>Enrollment History</h3>
            <p>Class placement is managed here; the student profile keeps currentClassId synchronized from active enrollment.</p>
          </div>
        </div>

        <div className="enrollment-history-list">
          {enrollments.map((row: any) => {
            const classRow: any = classMap.get(idOf(row.classId));
            const structure: any = structureMap.get(idOf(row.academicStructureId));
            const period: any = periodMap.get(idOf(row.academicPeriodId));
            const currentClassMatches = sameId(student.currentClassId, row.classId);

            return (
              <article className="enrollment-history-card" key={String(row.id)}>
                <div className="enrollment-history-main">
                  <div>
                    <strong>{classRow?.name || "Unknown class"}</strong>
                    <span>{structure?.name || "Unknown structure"} · {period?.name || "Unknown period"}</span>
                  </div>
                  <Chip tone={enrollmentStatusTone(row.status)}>
                    {enrollmentStatusLabel(row.status)}
                  </Chip>
                </div>

                <div className="enrollment-history-meta">
                  <span><b>Start</b>{row.startDate || "—"}</span>
                  <span><b>End</b>{row.endDate || "Open"}</span>
                  <span><b>Profile class</b>{row.status === "active" ? (currentClassMatches ? "Synced" : "Needs sync") : "Historical"}</span>
                </div>

                <div className="enrollment-history-actions">
                  {row.status === "active" && !currentClassMatches && (
                    <button type="button" onClick={() => syncCurrentClass(row)}>Sync Class</button>
                  )}
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  {row.status !== "active" && (
                    <button type="button" onClick={() => setStatus(row, "active")}>Activate</button>
                  )}
                  {row.status !== "completed" && (
                    <button type="button" onClick={() => setStatus(row, "completed")}>Complete</button>
                  )}
                  {row.status !== "promoted" && (
                    <button type="button" onClick={() => setStatus(row, "promoted")}>Promote</button>
                  )}
                  {row.status !== "withdrawn" && (
                    <button type="button" onClick={() => setStatus(row, "withdrawn")}>Withdraw</button>
                  )}
                  <button type="button" className="danger" onClick={() => remove(row)}>Delete</button>
                </div>
              </article>
            );
          })}

          {!enrollments.length && (
            <div className="enrollment-history-empty">
              <span>⇄</span>
              <strong>No enrollment history yet</strong>
              <small>Add the student&apos;s first class placement without leaving Students.</small>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function EnrollmentEditorModal({
  student,
  form,
  saving,
  classes,
  academicStructures,
  filteredPeriodsForForm,
  periodMap,
  updateForm,
  save,
  onClose,
}: {
  student: StudentView;
  form: EnrollmentFormState;
  saving: boolean;
  classes: Class[];
  academicStructures: AcademicStructure[];
  filteredPeriodsForForm: AcademicPeriod[];
  periodMap: Map<string, AcademicPeriod>;
  updateForm: (patch: Partial<EnrollmentFormState>) => void;
  save: (event?: React.FormEvent) => void;
  onClose: () => void;
}) {
  const row: any = student.row;

  return (
    <div className="ba-modal-backdrop enrollment-editor-layer">
      <form className="ba-modal enrollment-editor-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Enrollment" : "Enroll Student"}</h2>
            <p>{row.fullName || "Student"} · {row.admissionNumber || "No admission number"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close enrollment form">✕</button>
        </div>

        <section className="ba-form-section">
          <h3>Academic Placement</h3>
          <div className="ba-form two">
            <label>
              <span>Class</span>
              <select value={form.classId} onChange={(event) => updateForm({ classId: event.target.value })}>
                <option value="">Select class</option>
                {classes.map((classRow: any) => (
                  <option key={String(classRow.id)} value={String(classRow.id)}>{classRow.name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Academic Structure</span>
              <select
                value={form.academicStructureId}
                onChange={(event) =>
                  updateForm({ academicStructureId: event.target.value, academicPeriodId: "" })
                }
              >
                <option value="">Select academic structure</option>
                {academicStructures.map((structure: any) => (
                  <option key={String(structure.id)} value={String(structure.id)}>
                    {structure.name}{structure.level ? ` · ${structure.level}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Academic Period</span>
              <select
                value={form.academicPeriodId}
                onChange={(event) => {
                  const periodId = event.target.value;
                  const period: any = periodId ? periodMap.get(idOf(periodId)) : undefined;
                  updateForm({
                    academicPeriodId: periodId,
                    academicStructureId: period?.academicStructureId
                      ? String(period.academicStructureId)
                      : form.academicStructureId,
                    startDate: period?.startDate || form.startDate,
                    endDate: form.status === "active" ? "" : form.endDate || period?.endDate || "",
                  });
                }}
              >
                <option value="">Select academic period</option>
                {filteredPeriodsForForm.map((period: any) => (
                  <option key={String(period.id)} value={String(period.id)}>{period.name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) => {
                  const status = event.target.value as EnrollmentStatus;
                  updateForm({
                    status,
                    endDate: status === "active" ? "" : form.endDate,
                  });
                }}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="promoted">Promoted</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </label>

            <label>
              <span>Start Date</span>
              <input type="date" value={form.startDate} onChange={(event) => updateForm({ startDate: event.target.value })} />
            </label>

            <label>
              <span>End Date</span>
              <input
                type="date"
                value={form.endDate}
                disabled={form.status === "active"}
                onChange={(event) => updateForm({ endDate: event.target.value })}
              />
              {form.status === "active" && <small className="ba-field-hint">Active enrollments remain open-ended.</small>}
            </label>
          </div>
        </section>

        <div className="ba-inline-info enrollment-sync-note">
          <b>Automatic class sync</b>
          <span>When an enrollment is saved as Active, Eleeveon automatically updates the student&apos;s current class.</span>
        </div>

        <div className="ba-modal-actions">
          <button type="button" className="ba-cancel-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="ba-save-button" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Enrollment" : "Enroll Student"}
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
      : `Take ${entityLabel} Cover Photo`;

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
  rows: StudentView[],
  keyFn: (item: StudentView) => string,
) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = keyFn(r) || "Unknown";
    m.set(k, (m.get(k) || 0) + 1);
  });

  return Array.from(m.entries())
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
      <strong>{rows.reduce((s, r) => s + r.value, 0)}</strong>

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

.ba-media-hint {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
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
  transition: transform .18s var(--ease), background .18s var(--ease), border-color .18s var(--ease), box-shadow .18s var(--ease), filter .18s var(--ease);
}

.ba-media-button.secondary {
  background: var(--surface, #fff);
  color: var(--ba-primary) !important;
  box-shadow: none;
}

.ba-media-button input {
  display: none;
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


.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.ba-media-button {
  min-height: 40px;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ba-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  text-align: center;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button.secondary {
  background: var(--surface, #fff);
  color: var(--ba-primary);
  box-shadow: none;
}

.ba-media-hint {
  display: block;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
}

.camera-backdrop {
  z-index: 100;
  place-items: center;
}

.ba-camera-modal {
  width: min(720px, 100%);
  max-height: min(92dvh, 880px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}

.ba-camera-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 24px;
  background: #020617;
  border: 1px solid var(--border, rgba(0,0,0,.10));
}

.ba-camera-preview video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: #020617;
}

.ba-camera-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(2,6,23,.72);
  color: #fff;
  font-size: 13px;
  font-weight: 950;
}

.ba-camera-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.ba-camera-actions button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-camera-secondary {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--muted, #64748b) 8%, var(--surface, #fff));
  color: var(--text, #111827);
}

.ba-camera-primary {
  border: 1px solid var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-camera-actions button:disabled {
  opacity: .62;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .ba-media-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ba-media-button,
  .ba-camera-actions button {
    width: 100%;
  }

  .ba-camera-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .ba-camera-modal {
    border-radius: 22px;
    padding: 11px;
  }
}

/* ======================================================
   STUDENTS — BRANCH SETTINGS ACTION SYSTEM
   These declarations intentionally mirror Branchsettings.tsx.
   Do not create a second Students-specific color hierarchy here.
   ====================================================== */

/* Same compact Branch Settings search/action strip. */
.students-page .ba-search-card {
  grid-template-columns: minmax(0, 1fr) auto auto auto;
}

/* The + occupies the Branch Settings Save action slot while retaining its icon label. */
.students-page .settings-save-button {
  width: 42px;
  min-width: 42px;
  padding: 0;
  font-size: 25px;
  letter-spacing: 0;
}

/* Branch Settings primary action: Save / + / Upload / Apply / Done / Capture. */
.students-page .ba-add-inline,
.students-page .ba-modal-actions button:last-child,
.students-page .ba-sheet-actions .primary,
.students-page .ba-state-button,
.students-page .ba-camera-primary,
.students-page .ba-media-button:not(.secondary) {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff !important;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}

/* Branch Settings filter treatment. */
.students-page .ba-filter-button {
  position: relative;
  border-color: var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary) !important;
  box-shadow: 0 10px 22px rgba(15,23,42,.045);
}

.students-page .ba-filter-button.active {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff !important;
}

.students-page .ba-filter-button b {
  border-color: var(--card-bg,#fff);
}

/* Branch Settings More action: neutral card/surface. */
.students-page .ba-icon-button {
  border-color: var(--border, rgba(0,0,0,.10));
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827) !important;
  box-shadow: 0 10px 22px rgba(15,23,42,.045);
}

/* Branch Settings secondary hierarchy. */
.students-page .ba-media-button.secondary,
.students-page .ba-camera-secondary {
  border-color: var(--ba-primary);
  background: var(--surface,#fff);
  color: var(--ba-primary) !important;
  box-shadow: none;
}

.students-page .ba-cancel-button,
.students-page .ba-modal-actions button:not(:last-child),
.students-page .ba-sheet-actions button:not(.primary) {
  border-color: var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--muted,#64748b) 8%, var(--surface,#fff));
  color: var(--text,#111827) !important;
  box-shadow: none;
}

.students-page .ba-add-inline:hover,
.students-page .ba-filter-button.active:hover,
.students-page .ba-modal-actions button:last-child:hover,
.students-page .ba-sheet-actions .primary:hover,
.students-page .ba-state-button:hover,
.students-page .ba-camera-primary:hover,
.students-page .ba-media-button:not(.secondary):hover {
  filter: brightness(.96);
  transform: translateY(-1px);
}

.students-page .ba-filter-button:not(.active):hover {
  background: color-mix(in srgb, var(--ba-primary) 12%, var(--card-bg,#fff));
  transform: translateY(-1px);
}

.students-page .ba-icon-button:hover {
  background: color-mix(in srgb, var(--ba-primary) 4%, var(--card-bg, var(--surface,#fff)));
  transform: translateY(-1px);
}

.students-page .ba-media-button.secondary:hover,
.students-page .ba-camera-secondary:hover {
  background: color-mix(in srgb, var(--ba-primary) 7%, var(--surface,#fff));
  transform: translateY(-1px);
}

.students-page .ba-add-inline:focus-visible,
.students-page .ba-filter-button:focus-visible,
.students-page .ba-icon-button:focus-visible,
.students-page .ba-media-button:focus-visible,
.students-page .ba-camera-primary:focus-visible,
.students-page .ba-camera-secondary:focus-visible,
.students-page .ba-modal-actions button:focus-visible,
.students-page .ba-sheet-actions button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--ba-primary) 28%, transparent);
  outline-offset: 2px;
}

.students-page button:disabled,
.students-page .ba-media-button[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: .58;
  transform: none !important;
  filter: none !important;
  box-shadow: none !important;
}

.students-page .ba-search:focus-within {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}

/* Subtle branch-color accents for records and data surfaces. */
.students-page .student-row {
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--ba-primary) 15%, var(--border, rgba(0,0,0,.10)));
}

.students-page .student-row::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--ba-primary);
  opacity: .78;
}

.students-page .student-row:hover,
.students-page .student-row:focus-within {
  border-color: color-mix(in srgb, var(--ba-primary) 46%, var(--border, rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 5%, var(--card-bg, var(--surface, #fff)));
  box-shadow: 0 14px 30px color-mix(in srgb, var(--ba-primary) 10%, transparent);
}

.students-page .ba-avatar {
  border: 1px solid color-mix(in srgb, var(--ba-primary) 42%, transparent);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.students-page .ba-filter-chips button,
.students-page .ba-chip.blue,
.students-page .ba-chip.purple {
  border-color: color-mix(in srgb, var(--ba-primary) 30%, transparent);
  background: color-mix(in srgb, var(--ba-primary) 10%, var(--card-bg, var(--surface, #fff)));
  color: var(--ba-primary);
}

.students-page .ba-table-scroll th {
  background: color-mix(in srgb, var(--ba-primary) 9%, var(--table-head, var(--card-bg, #fff)));
  color: var(--text, #111827);
}

.students-map-view {
  display: grid;
  gap: 10px;
}

.students-map-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.students-map-toolbar::-webkit-scrollbar {
  display: none;
}

.students-map-toggle {
  --layer-color: #64748b;
  flex: 0 0 auto;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid
    color-mix(
      in srgb,
      var(--layer-color) 24%,
      var(--border, rgba(0,0,0,.10))
    );
  border-radius: 999px;
  padding: 5px 9px;
  background: var(--card-bg, var(--surface, #fff));
  color: var(--muted-text, var(--muted-foreground, #64748b));
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  transition:
    border-color .16s ease,
    background .16s ease,
    color .16s ease,
    opacity .16s ease;
}

.students-map-toggle i {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--layer-color);
  box-shadow:
    0 0 0 3px
    color-mix(in srgb, var(--layer-color) 12%, transparent);
}

.students-map-toggle.active {
  border-color:
    color-mix(
      in srgb,
      var(--layer-color) 45%,
      var(--border, rgba(0,0,0,.10))
    );
  background:
    color-mix(
      in srgb,
      var(--layer-color) 9%,
      var(--card-bg, var(--surface, #fff))
    );
  color: var(--text, #111827);
}

.students-map-toggle:not(.active) {
  opacity: .52;
}

.students-map-toggle.branch { --layer-color: #7c3aed; }
.students-map-toggle.student { --layer-color: #2563eb; }
.students-map-toggle.teacher { --layer-color: #16a34a; }
.students-map-toggle.parent { --layer-color: #ea580c; }


.ba-section-heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.ba-section-heading-row h3 {
  margin: 0;
}

.ba-section-heading-row p {
  margin: 4px 0 0;
  color: var(--ba-muted);
  font-size: 0.78rem;
  line-height: 1.45;
}

.ba-location-options {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.ba-check-row {
  display: flex !important;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ba-border);
  border-radius: 12px;
  background: var(--ba-card);
  cursor: pointer;
}

.ba-check-row input {
  width: 17px !important;
  height: 17px;
  margin-top: 2px;
  flex: 0 0 auto;
}

.ba-check-row > span {
  display: grid;
  gap: 2px;
}

.ba-check-row strong {
  font-size: 0.82rem;
}

.ba-check-row small {
  color: var(--ba-muted);
  font-size: 0.72rem;
  line-height: 1.35;
}

.ba-location-captured {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 10px;
  padding: 9px 11px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--ba-card));
  border: 1px solid color-mix(in srgb, var(--ba-primary) 22%, var(--ba-border));
  font-size: 0.75rem;
}

.ba-location-captured small {
  color: var(--ba-muted);
}

.ba-location-captured button {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--ba-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 640px) {
  .ba-section-heading-row {
    align-items: stretch;
    flex-direction: column;
  }

  .ba-section-heading-row .ba-media-button {
    width: 100%;
  }

  .ba-location-captured button {
    margin-left: 0;
  }
}

/* Integrated student enrollment manager */
.ba-field-hint {
  display: block;
  margin-top: 6px;
  color: var(--muted, #64748b);
  font-size: .74rem;
  line-height: 1.4;
  font-weight: 650;
}

.ba-page select:disabled,
.ba-page input:disabled {
  opacity: .68;
  cursor: not-allowed;
  background: color-mix(in srgb, var(--surface, #fff) 86%, var(--border, rgba(0,0,0,.10)));
}

.ba-inline-info {
  align-self: stretch;
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--ba-primary) 22%, var(--border, rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 7%, var(--card-bg, var(--surface, #fff)));
}

.ba-inline-info b {
  font-size: .8rem;
  color: var(--text, #111827);
}

.ba-inline-info span {
  color: var(--muted, #64748b);
  font-size: .73rem;
  line-height: 1.45;
}

.enrollment-manager-layer {
  z-index: 78;
}

.enrollment-editor-layer {
  z-index: 86;
}

.enrollment-manager-sheet {
  width: min(760px, 100%);
  max-height: min(90dvh, 900px);
  overflow: auto;
}

.enrollment-manager-profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.enrollment-manager-profile .ba-avatar {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
}

.enrollment-manager-current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--ba-primary) 22%, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 7%, var(--card-bg, var(--surface, #fff)));
}

.enrollment-manager-current > div {
  display: grid;
  gap: 3px;
}

.enrollment-manager-current small,
.enrollment-manager-current span {
  color: var(--muted, #64748b);
  font-size: .73rem;
}

.enrollment-manager-current strong {
  font-size: .95rem;
}

.enrollment-manager-current > button {
  min-height: 40px;
  padding: 0 13px;
  border-radius: 13px;
  border: 1px solid var(--ba-primary);
  background: var(--ba-primary);
  color: var(--ba-primary-text, #fff);
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
}

.enrollment-history-heading {
  margin: 16px 0 8px;
}

.enrollment-history-heading h3 {
  margin: 0;
  font-size: .94rem;
}

.enrollment-history-heading p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: .73rem;
  line-height: 1.45;
}

.enrollment-history-list {
  display: grid;
  gap: 9px;
}

.enrollment-history-card {
  padding: 12px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 16px;
  background: var(--card-bg, var(--surface, #fff));
}

.enrollment-history-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.enrollment-history-main > div {
  display: grid;
  gap: 3px;
}

.enrollment-history-main strong {
  font-size: .9rem;
}

.enrollment-history-main span:not(.ba-chip) {
  color: var(--muted, #64748b);
  font-size: .72rem;
}

.enrollment-history-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.enrollment-history-meta span {
  display: grid;
  gap: 2px;
  padding: 7px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--muted, #64748b) 7%, transparent);
  color: var(--muted, #64748b);
  font-size: .7rem;
}

.enrollment-history-meta b {
  color: var(--text, #111827);
  font-size: .67rem;
}

.enrollment-history-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.enrollment-history-actions button {
  min-height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: var(--text, #111827);
  font-weight: 800;
  font-size: .72rem;
  cursor: pointer;
}

.enrollment-history-actions button.danger {
  color: #dc2626;
  border-color: rgba(220,38,38,.2);
  background: rgba(220,38,38,.05);
}

.enrollment-history-empty {
  display: grid;
  place-items: center;
  gap: 5px;
  padding: 24px 14px;
  border: 1px dashed var(--border, rgba(0,0,0,.12));
  border-radius: 16px;
  text-align: center;
}

.enrollment-history-empty > span {
  font-size: 1.45rem;
}

.enrollment-history-empty small {
  color: var(--muted, #64748b);
}

.enrollment-editor-modal {
  width: min(680px, calc(100vw - 20px));
}

.enrollment-sync-note {
  margin: 0 16px 14px;
}

@media (max-width: 640px) {
  .enrollment-manager-current {
    align-items: stretch;
    flex-direction: column;
  }

  .enrollment-manager-current > button {
    width: 100%;
  }

  .enrollment-history-meta {
    grid-template-columns: 1fr;
  }

  .enrollment-history-actions button {
    flex: 1 1 calc(50% - 6px);
  }
}

`;
