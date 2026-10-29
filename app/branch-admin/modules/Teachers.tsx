"use client";

/**
 * app/branch-admin/modules/Teachers.tsx
 * Eleeveon Teachers V2.
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
 * - createLocal(...) for teacher creation
 * - updateLocal(...) for edits and active/inactive changes
 * - softDeleteLocal(...) for local soft delete
 * - listActiveLocal(...) for active lookup tables
 * - saveImageAsset(...) for photos/signatures so large Base64 files are not stored inside teacher records
 * - photoMediaId / coverPhotoMediaId / signatureMediaId carry local media references for sync-safe records
 *
 * Media behavior:
 * - selected images are compressed and stored once in mediaAssets/mediaBlobs
 * - teacher records save small media IDs instead of full image strings
 * - old photo/coverPhoto/signature fields remain as backward-compatible fallbacks only
 * - ownerTempKey isolates unsaved form uploads so a teacher image cannot bleed into students/parents/classes
 * - new uploads are attached to the teacher after create/update so media can sync separately
 * - photo, cover and signature fields support Upload and real Take Photo camera capture
 * - media owner/session keys use shared mediaAssetUtils helpers so this page cannot save under student/parent ownership
 *
 * Compact mobile-first UI update:
 * - keeps the Students.tsx golden-standard ba-* styling pattern
 * - removed the duplicate module hero/header block
 * - placed the + add action beside search
 * - keeps filters and advanced views inside sheets
 * - keeps cards/table/analytics in the same flow as Students.tsx
 * - keeps table colors tied to existing theme variables for dark mode support
 *
 * Teacher map and location workflow:
 * - adds the same shared SchoolMap view used by Students
 * - saves editable address, coordinates, GPS accuracy, source, precision and privacy/consent fields
 * - supports current-device GPS capture during teacher create/edit
 * - maps only branch-scoped, searched and filtered teachers with visible coordinates
 * - supports creating a teacher from a selected map location
 * - supports moving an existing teacher marker with the shared floating Save/Cancel workflow
 * - lets SchoolMap own marker selection, details, and location editing
 */

import BranchViewportPortal from "../../components/role-portals/shell/BranchViewportPortal";
import React, { useEffect, useMemo, useRef, useState } from "react";
import IdentityCardActions from "./identity/IdentityCardActions";
import IdentityCardBatch from "./identity/IdentityCardBatch";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import { printBranchTable } from "../../components/role-portals/shell/BranchTablePrint";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/platformApi";
import { useSettings } from "../../context/settings-context";
import SignaturePadModal from "../../components/media/SignaturePadModal";
import {
  db,
  type Assignment,
  type ClassSubject,
  type ClassTeacher,
  type Organization,
  type Teacher,
  type TeacherAttendance,
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
type TeacherRole = "teacher" | "head_teacher" | "lecturer" | "principal";
type TeacherStatusFilter = "all" | "active" | "inactive";
type CameraField = "photo" | "coverPhoto" | "signature";

type TeacherCreateDefaults = {
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
  fullName: string;
  gender: string;
  age: string;
  photo: string;
  photoMediaId?: string;
  coverPhoto: string;
  coverPhotoMediaId?: string;
  email: string;
  phone: string;
  relativePhone: string;
  address: string;
  latitude: string;
  longitude: string;
  accuracyMeters: string;
  locationLabel: string;
  formattedAddress: string;
  locationType: "home" | "workplace" | "pickup_point" | "dropoff_point" | "other";
  locationSource: "manual" | "device_gps" | "geocoded" | "imported";
  locationPrecision: "exact" | "approximate" | "area_only";
  locationCapturedAt?: number;
  mapVisible: boolean;
  locationConsentGiven: boolean;
  locationConsentAt?: number;
  locationRestricted: boolean;
  employmentDate: string;
  salary: string;
  role: TeacherRole;
  qualification: string;
  signature: string;
  signatureMediaId?: string;
  active: boolean;
};

type TeacherAuthContact = {
  userId: string;
  email: string;
  phone: string;
  fullName: string;
};

type TeacherView = {
  id: string;
  row: Teacher;
  photoUrl?: string;
  coverPhotoUrl?: string;
  signatureUrl?: string;
  organizationName: string;
  assignmentCount: number;
  classSubjectCount: number;
  classTeacherCount: number;
  attendanceCount: number;
  totalUsage: number;
  active: boolean;
};

const emptyForm: FormState = {
  organizationId: "",
  fullName: "",
  gender: "",
  age: "",
  photo: "",
  photoMediaId: undefined,
  coverPhoto: "",
  coverPhotoMediaId: undefined,
  email: "",
  phone: "",
  relativePhone: "",
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
  employmentDate: "",
  salary: "",
  role: "teacher",
  qualification: "",
  signature: "",
  signatureMediaId: undefined,
  active: true,
};

const idOf = (v: any): string => {
  if (v === undefined || v === null) return "";
  return String(v).trim();
};

const cleanId = (value: unknown): string => {
  const normalized = idOf(value);
  return normalized && normalized !== "0" ? normalized : "";
};

/**
 * Resolve the permanent teacher ID returned by createLocal/updateLocal.
 * The sync helpers may return a string, number, saved record, or object.
 */
const savedEntityId = (
  result: unknown,
  fallback?: unknown,
): string => {
  if (typeof result === "string" || typeof result === "number") {
    return cleanId(result);
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;

    return firstLocalId(
      record.id,
      record.localId,
      record.teacherId,
      fallback,
    );
  }

  return cleanId(fallback);
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (v: any) =>
  String(v || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];
const isActiveRow = (row: any) =>
  !row?.isDeleted &&
  row?.active !== false &&
  !["inactive", "deleted", "archived"].includes(safeLower(row?.status));

function roleLabel(role?: TeacherRole | string) {
  if (role === "head_teacher") return "Head Teacher";
  if (role === "principal") return "Principal";
  if (role === "lecturer") return "Lecturer";
  return "Teacher";
}

function roleTone(
  role?: TeacherRole | string,
): "green" | "blue" | "purple" | "orange" | "gray" {
  if (role === "principal") return "purple";
  if (role === "head_teacher") return "orange";
  if (role === "lecturer") return "blue";
  if (role === "teacher") return "green";
  return "gray";
}

function statusTone(
  active: boolean,
): "green" | "red" | "blue" | "orange" | "gray" {
  return active ? "green" : "red";
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

const moneyText = (v?: string | number | null) => {
  const amount = Number(v || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Not set";
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `GHS ${amount}`;
  }
};

const mediaKey = (
  teacherId: string,
  field: "photo" | "coverPhoto" | "signature",
) => `teachers:${teacherId}:${field}`;

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
};


/**
 * Mirror Users & Roles' authenticated account directory, without mutating
 * local profile records during a read. Teacher links must be explicit and
 * branch-scoped. The teacher's own contact values remain offline fallbacks.
 */
async function linkedTeacherContacts(args: {
  accountId: string;
  schoolId: string;
  branchId: string;
}): Promise<Record<string, TeacherAuthContact>> {
  const array = (value: any): any[] =>
    Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data
    : Array.isArray(value?.items) ? value.items : Array.isArray(value?.rows) ? value.rows : [];

  let remote: any = null;
  try {
    remote = await apiRequest<any>(
      `/accounts/me/users?schoolId=${encodeURIComponent(args.schoolId)}&branchId=${encodeURIComponent(args.branchId)}`,
      { method: "GET" } as any,
    );
  } catch (error) {
    // Offline support: keep using cached auth records when the server is unavailable.
    console.info("Teacher access contacts: using the local auth cache.", error);
  }

  const responseUsers = remote ? [remote?.users, remote?.appUsers, remote?.accountUsers,
    remote?.data?.users, remote?.data?.appUsers, remote?.data?.accountUsers,
    remote?.data, remote?.items, remote?.rows, remote?.results, remote].flatMap(array) : [];
  const responseMemberships = remote ? [remote?.memberships, remote?.userMemberships,
    remote?.data?.memberships, remote?.data?.userMemberships].flatMap(array) : [];

  const [cachedUsers, cachedMemberships] = await Promise.all([
    Promise.all(["appUsers", "accountUsers", "users"].map(async name =>
      await tableSafe(name)?.toArray?.().catch(() => []) || [])),
    Promise.all(["userMemberships", "memberships"].map(async name =>
      await tableSafe(name)?.toArray?.().catch(() => []) || [])),
  ]);
  const users = [...responseUsers, ...cachedUsers.flat()].filter(Boolean);
  const memberships = [
    ...responseMemberships,
    ...responseUsers.flatMap((user: any) => [
      user?.memberships, user?.userMemberships,
      user?.membership ? [user.membership] : [],
      user?.userMembership ? [user.userMembership] : [],
    ].flatMap(array).map((membership: any) => ({
      ...membership, userId: membership.userId || user.id,
      accountId: membership.accountId || user.accountId,
      schoolId: membership.schoolId ?? user.schoolId,
      branchId: membership.branchId ?? user.branchId,
      email: membership.email || user.email,
    }))),
    ...cachedMemberships.flat(),
  ].filter(Boolean);

  const inScope = (entry: any) =>
    (!entry.accountId || String(entry.accountId) === args.accountId) &&
    (!entry.schoolId || String(entry.schoolId) === args.schoolId) &&
    (!entry.branchId || String(entry.branchId) === args.branchId);

  const userById = new Map<string, any>();
  for (const user of users.slice().reverse()) {
    if (user?.id && inScope(user)) userById.set(String(user.id), user);
  }

  const found: Record<string, TeacherAuthContact> = {};
  // Local cached memberships are fallback; remote memberships take precedence.
  for (const membership of memberships.slice().reverse()) {
    if (String(membership?.role || "").toLowerCase() !== "teacher" ||
        !membership?.teacherId || !inScope(membership) || membership.isDeleted) continue;
    const teacherId = String(membership.teacherId);
    const userId = String(membership.userId || membership.accountUserId || "");
    const user = userById.get(userId);
    if (user && !inScope(user)) continue;
    found[teacherId] = {
      userId,
      email: String(user?.email || membership.email || "").trim(),
      phone: String(user?.phone || membership.phone || "").trim(),
      fullName: String(user?.fullName || user?.name || membership.fullName || "").trim(),
    };
  }
  return found;
}

const TEACHER_MEDIA_OWNER_TABLE = MediaOwners.TEACHERS;
const TEACHER_MEDIA_ENTITY_LABEL = "Teacher";

const makeMediaSessionKey = () =>
  createMediaSessionKey(TEACHER_MEDIA_OWNER_TABLE);

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
  // Photo URLs are resolved from the existing offline-first mediaAssets hook.
  // If an image is missing or fails, show a stable initials fallback instead.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const validPhoto = typeof photo === "string" && photo.trim() && failedUrl !== photo;

  return (
    <span
      className="ba-avatar"
      style={{ background: primary }}
      aria-label={name || "Teacher"}
    >
      {validPhoto ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(photo!)}
        />
      ) : (
        String(name || "T").slice(0, 1).toUpperCase()
      )}
    </span>
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

export default function TeachersPage() {
  const dataRevision = useBranchTableRevision([
    "teachers",
    "organizations",
    "assignments",
    "classSubjects",
    "classTeachers",
    "teacherAttendance",
    "mediaAssets",
    "mediaBlobs",
    "appUsers",
    "userMemberships",
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
  const [rows, setRows] = useState<Teacher[]>([]);
  const [teacherAccessContacts, setTeacherAccessContacts] = useState<Record<string, TeacherAuthContact>>({});
  const authContactRequest = useRef(0);
  const resolvedMediaById = useEntityMediaUrls({
    accountId,
    ownerTable: "teachers",
    rows: rows,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "coverPhoto", mediaIdKey: "coverPhotoMediaId" },
      { fieldKey: "signature", mediaIdKey: "signatureMediaId" },
    ],
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [teacherAttendance, setTeacherAttendance] = useState<
    TeacherAttendance[]
  >([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<
    Record<string, string>
  >({});

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterRole, setFilterRole] = useState<"all" | TeacherRole>("all");
  const [filterStatus, setFilterStatus] = useState<TeacherStatusFilter>("all");
  const [filterGender, setFilterGender] = useState("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [batchIdsOpen, setBatchIdsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TeacherView | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  const mediaSessionKey = useRef(makeMediaSessionKey());
  const uploadedMediaAssetIds = useRef<
    Partial<Record<CameraField, string>>
  >({});
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraField, setCameraField] = useState<CameraField>("photo");
  const [cameraFacing, setCameraFacing] =
    useState<CameraFacingMode>("environment");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraCapturing, setCameraCapturing] = useState(false);
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);

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

  const openSignaturePad = () => {
    if (!requireTenant()) return;
    setSignaturePadOpen(true);
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
        fileName: `teacher-${cameraField}-${Date.now()}.jpg`,
        mimeType: cameraField === "signature" ? "image/png" : "image/jpeg",
        quality: cameraField === "signature" ? 0.92 : 0.88,
        maxWidth:
          cameraField === "photo"
            ? 900
            : cameraField === "coverPhoto"
              ? 1440
              : 1000,
        maxHeight:
          cameraField === "photo"
            ? 900
            : cameraField === "coverPhoto"
              ? 900
              : 420,
      });

      await handleImageUpload(cameraField, file);
      closeCamera();
    } catch (error: any) {
      console.error("Failed to capture teacher image:", error);
      showToast("error", error?.message || "Failed to capture photo.");
    } finally {
      setCameraCapturing(false);
    }
  };

  const clearData = () => {
    authContactRequest.current += 1;
    Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
    setTeacherAccessContacts({});
    setRows([]);
    setOrganizations([]);
    setAssignments([]);
    setClassSubjects([]);
    setClassTeachers([]);
    setTeacherAttendance([]);
    setMediaPreviewUrls({});
  };

  const resolveTeacherMediaUrls = async (teacherRows: Teacher[]) => {
    const next: Record<string, string> = {};

    await Promise.all(
      teacherRows.map(async (teacher: any) => {
        const teacherId = idOf(teacher.id);
        if (!teacherId) return;

        try {
          const photoUrl = await resolveOwnerMediaUrl({
            accountId: accountId || undefined,
            ownerTable: TEACHER_MEDIA_OWNER_TABLE,
            ownerId: teacherId,

            fieldKey: MediaFieldKeys.PHOTO,
            fallbackAssetId: teacher.photoMediaId,
          });
          if (photoUrl) next[mediaKey(teacherId, "photo")] = photoUrl;

          const coverPhotoUrl = await resolveOwnerMediaUrl({
            accountId: accountId || undefined,
            ownerTable: TEACHER_MEDIA_OWNER_TABLE,
            ownerId: teacherId,

            fieldKey: MediaFieldKeys.COVER_PHOTO,
            fallbackAssetId: teacher.coverPhotoMediaId,
          });
          if (coverPhotoUrl)
            next[mediaKey(teacherId, "coverPhoto")] = coverPhotoUrl;

          const signatureUrl = await resolveOwnerMediaUrl({
            accountId: accountId || undefined,
            ownerTable: TEACHER_MEDIA_OWNER_TABLE,
            ownerId: teacherId,

            fieldKey: MediaFieldKeys.SIGNATURE,
            fallbackAssetId: teacher.signatureMediaId,
          });
          if (signatureUrl)
            next[mediaKey(teacherId, "signature")] = signatureUrl;
        } catch (error) {
          console.error("Failed resolving teacher media:", teacherId, error);
        }
      }),
    );

    // Do not revoke list preview URLs during a reload. The shared media utility
    // now returns stable data URLs for local images, and replacing the map is
    // enough. This prevents browser blob-url repaint bleed across teacher,
    // student, class, parent and signature rows while React is still mounted.
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
        teacherRows,
        organizationRows,
        assignmentRows,
        classSubjectRows,
        classTeacherRows,
        attendanceRows,
      ] = await Promise.all([
        tableSafe("teachers")?.toArray?.() || [],
        listActiveLocal("organizations", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        tableSafe("assignments")?.toArray?.() || [],
        tableSafe("classSubjects")?.toArray?.() || [],
        tableSafe("classTeachers")?.toArray?.() || [],
        tableSafe("teacherAttendance")?.toArray?.() || [],
      ]);

      const scopedTeachers = (teacherRows as Teacher[])
        .filter((r) => sameTenant(r as TenantRow))
        .sort((a: any, b: any) =>
          String(a.fullName || "").localeCompare(String(b.fullName || "")),
        );

      setRows(scopedTeachers);
      // Load login contacts independently so the offline teacher list opens immediately.
      const contactRequest = ++authContactRequest.current;
      void linkedTeacherContacts({
        accountId: String(accountId), schoolId: String(schoolId), branchId: String(branchId),
      }).then(contacts => {
        if (authContactRequest.current === contactRequest) setTeacherAccessContacts(contacts);
      }).catch(cause => console.warn("Teacher portal contacts could not be resolved", cause));
      await resolveTeacherMediaUrls(scopedTeachers);
      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setAssignments(
        (assignmentRows as Assignment[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
      setClassSubjects(
        (classSubjectRows as ClassSubject[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
      setClassTeachers(
        (classTeacherRows as ClassTeacher[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
      setTeacherAttendance(
        (attendanceRows as TeacherAttendance[]).filter((r) =>
          sameTenant(r as TenantRow),
        ),
      );
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load teachers.");
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
        console.error("Failed to open teacher camera:", error);
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

  const organizationMap = useMemo(
    () => new Map(organizations.map((r: any) => [idOf(r.id), r])),
    [organizations],
  );

  const usageMaps = useMemo(() => {
    const assignmentMap = new Map<string, number>();
    const classSubjectMap = new Map<string, number>();
    const classTeacherMap = new Map<string, number>();
    const attendanceMap = new Map<string, number>();

    assignments.forEach((row: any) => {
      const teacherId = idOf(row.teacherId);
      if (teacherId)
        assignmentMap.set(teacherId, (assignmentMap.get(teacherId) || 0) + 1);
    });
    classSubjects.forEach((row: any) => {
      const teacherId = idOf(row.teacherId);
      if (teacherId)
        classSubjectMap.set(
          teacherId,
          (classSubjectMap.get(teacherId) || 0) + 1,
        );
    });
    classTeachers.forEach((row: any) => {
      const teacherId = idOf(row.teacherId);
      if (teacherId)
        classTeacherMap.set(
          teacherId,
          (classTeacherMap.get(teacherId) || 0) + 1,
        );
    });
    teacherAttendance.forEach((row: any) => {
      const teacherId = idOf(row.teacherId);
      if (teacherId)
        attendanceMap.set(teacherId, (attendanceMap.get(teacherId) || 0) + 1);
    });

    return { assignmentMap, classSubjectMap, classTeacherMap, attendanceMap };
  }, [assignments, classSubjects, classTeachers, teacherAttendance]);

  const viewRows = useMemo<TeacherView[]>(
    () =>
      rows.map((profileRow: any) => {
        const id = idOf(profileRow.id);
        const linked = teacherAccessContacts[id];
        // Show authoritative access contacts without overwriting offline profile data.
        const row: Teacher = linked ? {
          ...profileRow,
          email: linked.email || profileRow.email,
          phone: linked.phone || profileRow.phone,
        } : profileRow;
        const organization: any = row.organizationId
          ? organizationMap.get(idOf(row.organizationId))
          : undefined;
        const assignmentCount = usageMaps.assignmentMap.get(id) || 0;
        const classSubjectCount = usageMaps.classSubjectMap.get(id) || 0;
        const classTeacherCount = usageMaps.classTeacherMap.get(id) || 0;
        const attendanceCount = usageMaps.attendanceMap.get(id) || 0;

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
          signatureUrl:
            resolvedMediaById[id]?.signature ||
            mediaPreviewUrls[mediaKey(id, "signature")] ||
            safeRecordMediaValue(row.signature),
          organizationName: organization?.name || "No organization",
          assignmentCount,
          classSubjectCount,
          classTeacherCount,
          attendanceCount,
          totalUsage:
            assignmentCount +
            classSubjectCount +
            classTeacherCount +
            attendanceCount,
          active: isActiveRow(row),
        };
      }),
    [
      mediaPreviewUrls,
      organizationMap,
      resolvedMediaById,
      rows,
      teacherAccessContacts,
      usageMaps,
    ],
  );

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
        if (filterRole !== "all" && row.role !== filterRole) return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;
        if (filterGender !== "all" && row.gender !== filterGender) return false;
        if (!q) return true;
        return `${row.fullName} ${row.gender || ""} ${row.email || ""} ${row.phone || ""} ${row.relativePhone || ""} ${row.role || ""} ${row.qualification || ""} ${row.salary || ""} ${item.organizationName}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) =>
        String((a.row as any).fullName || "").localeCompare(
          String((b.row as any).fullName || ""),
        ),
      );
  }, [
    filterGender,
    filterOrganizationId,
    filterRole,
    filterStatus,
    search,
    viewRows,
  ]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      active: viewRows.filter((r) => r.active).length,
      inactive: viewRows.filter((r) => !r.active).length,
      teachers: rows.filter((r: any) => r.role === "teacher").length,
      leaders: rows.filter(
        (r: any) => r.role === "head_teacher" || r.role === "principal",
      ).length,
      attendanceRecords: teacherAttendance.length,
      showing: filteredRows.length,
    }),
    [filteredRows.length, rows, teacherAttendance.length, viewRows],
  );

  const activeFilterCount = useMemo(() => {
    return [
      filterOrganizationId,
      filterRole,
      filterStatus,
      filterGender,
    ].filter((value) => value !== "all").length;
  }, [filterGender, filterOrganizationId, filterRole, filterStatus]);

  const genderOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r: any) => r.gender).filter(Boolean)),
      ) as string[],
    [rows],
  );
  const countsByOrganization = useMemo(
    () => groupedCounts(viewRows, (i) => i.organizationName),
    [viewRows],
  );
  const countsByRole = useMemo(
    () => groupedCounts(viewRows, (i) => roleLabel((i.row as any).role)),
    [viewRows],
  );
  const countsByGender = useMemo(
    () =>
      groupedCounts(viewRows, (i) =>
        String((i.row as any).gender || "Not set"),
      ),
    [viewRows],
  );
  const countsByUsage = useMemo(
    () =>
      viewRows
        .map((item) => ({
          label: (item.row as any).fullName || "Teacher",
          value: item.totalUsage,
        }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
    [viewRows],
  );

  const teacherMarkers = useMemo<MapMarker[]>(() => {
    return filteredRows.reduce<MapMarker[]>((markers, item) => {
      const row: any = item.row;

      const marker = genericEntityToMarker(
        {
          ...row,
          id: item.id,
          photo: item.photoUrl || row.photo,
        },
        {
          entityType: "teacher",
          layerId: "teachers",
          icon: "teacher",
          imageUrl: item.photoUrl,
          subtitle: [
            roleLabel(row.role),
            item.organizationName,
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
        description:
          row.phone || row.email || row.qualification || item.organizationName,
        metadata: {
          ...(marker.metadata || {}),
          teacherId: item.id,
          role: row.role,
          organizationName: item.organizationName,
          active: item.active,
        },
      });

      return markers;
    }, []);
  }, [filteredRows]);

  const updateForm = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleImageUpload = async (
    field: "photo" | "coverPhoto" | "signature",
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
        ownerTable: TEACHER_MEDIA_OWNER_TABLE,

        /*
         * Always stage under the current form session. This keeps the existing
         * committed teacher image untouched until Save, including during edits.
         */
        ownerId: undefined,
        ownerTempKey: mediaSessionKey.current,
        fieldKey:
          field === "photo"
            ? MediaFieldKeys.PHOTO
            : field === "coverPhoto"
              ? MediaFieldKeys.COVER_PHOTO
              : MediaFieldKeys.SIGNATURE,
        variant:
          field === "photo"
            ? "avatar"
            : field === "coverPhoto"
              ? "cover"
              : "signature",
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
          ? "Teacher photo optimized."
          : field === "coverPhoto"
            ? "Cover photo optimized."
            : "Signature optimized.",
      );
    } catch (error: any) {
      console.error("Failed to process teacher image:", error);
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const handleSignaturePadSave = async (file: File) => {
    if (!file) return;

    const signatureFile =
      file.type === "image/png" && file.name
        ? file
        : new File(
            [file],
            `teacher-signature-${form.id || "new"}-${Date.now()}.png`,
            {
              type: "image/png",
              lastModified: Date.now(),
            },
          );

    await handleImageUpload("signature", signatureFile);
    setSignaturePadOpen(false);
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = (defaults?: TeacherCreateDefaults) => {
    if (!requireTenant()) return;

    mediaSessionKey.current = makeMediaSessionKey();
    uploadedMediaAssetIds.current = {};

    const hasMapCoordinate =
      Number.isFinite(defaults?.latitude) &&
      Number.isFinite(defaults?.longitude);

    setForm({
      ...emptyForm,
      organizationId:
        filterOrganizationId !== "all" ? filterOrganizationId : "",
      role: filterRole !== "all" ? filterRole : "teacher",
      active: filterStatus === "inactive" ? false : true,
      latitude: hasMapCoordinate ? String(defaults?.latitude) : "",
      longitude: hasMapCoordinate ? String(defaults?.longitude) : "",
      locationSource: "manual",
      locationCapturedAt: hasMapCoordinate ? Date.now() : undefined,
      mapVisible: true,
    });
    setModalOpen(true);
  };

  const handleCreateAtLocation = (request: MapCreateRequest) => {
    if (request.entityType !== "teacher") return;

    openCreate({
      latitude: request.coordinate.latitude,
      longitude: request.coordinate.longitude,
    });
  };

  const handleTeacherLocationUpdate = async (
    request: MapLocationUpdateRequest,
  ) => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      throw new Error(
        "Sign in and select a school branch first.",
      );
    }

    const teacherId = cleanId(
      request.marker.metadata?.teacherId ||
        request.marker.id,
    );

    if (!teacherId) {
      throw new Error(
        "The selected teacher could not be identified.",
      );
    }

    const existingTeacher = rows.find((row: any) =>
      sameId(row.id, teacherId),
    );

    if (!existingTeacher) {
      throw new Error(
        "The selected teacher record was not found.",
      );
    }

    await updateLocal(
      "teachers",
      teacherId,
      {
        latitude: request.coordinate.latitude,
        longitude: request.coordinate.longitude,
        locationSource: "manual",
        locationCapturedAt: Date.now(),
        mapVisible: true,
        isDeleted: false,
      } as Partial<Teacher>,
    );

    showToast(
      "success",
      "Teacher location updated.",
    );

    await load();
  };

  const openEdit = (row: Teacher) => {
    const linked = teacherAccessContacts[idOf(row.id)];
    const t: any = linked ? { ...row, email: linked.email || row.email, phone: linked.phone || row.phone } : row;
    mediaSessionKey.current = makeMediaSessionKey();
    uploadedMediaAssetIds.current = {};
    setSelectedItem(null);
    setForm({
      id: idOf(t.id),
      organizationId: t.organizationId ? String(t.organizationId) : "",
      fullName: t.fullName || "",
      gender: t.gender || "",
      age: t.age == null ? "" : String(t.age),
      photo:
        resolvedMediaById[idOf(t.id)]?.photo ||
        mediaPreviewUrls[mediaKey(idOf(t.id), "photo")] ||
        "",
      photoMediaId: t.photoMediaId ? String(t.photoMediaId) : undefined,
      coverPhoto:
        resolvedMediaById[idOf(t.id)]?.coverPhoto ||
        mediaPreviewUrls[mediaKey(idOf(t.id), "coverPhoto")] ||
        "",
      coverPhotoMediaId: t.coverPhotoMediaId
        ? String(t.coverPhotoMediaId)
        : undefined,
      email: t.email || "",
      phone: t.phone || "",
      relativePhone: t.relativePhone || "",
      address: t.address || "",
      latitude: t.latitude == null ? "" : String(t.latitude),
      longitude: t.longitude == null ? "" : String(t.longitude),
      accuracyMeters:
        t.accuracyMeters == null ? "" : String(t.accuracyMeters),
      locationLabel: t.locationLabel || "",
      formattedAddress: t.formattedAddress || "",
      locationType: t.locationType || "home",
      locationSource: t.locationSource || "manual",
      locationPrecision: t.locationPrecision || "exact",
      locationCapturedAt: t.locationCapturedAt || undefined,
      mapVisible: t.mapVisible !== false,
      locationConsentGiven: Boolean(t.locationConsentGiven),
      locationConsentAt: t.locationConsentAt || undefined,
      locationRestricted: Boolean(t.locationRestricted),
      employmentDate: t.employmentDate || "",
      salary: t.salary == null ? "" : String(t.salary),
      role: t.role || "teacher",
      qualification: t.qualification || "",
      signature:
        resolvedMediaById[idOf(t.id)]?.signature ||
        mediaPreviewUrls[mediaKey(idOf(t.id), "signature")] ||
        "",
      signatureMediaId: t.signatureMediaId
        ? String(t.signatureMediaId)
        : undefined,
      active: isActiveRow(t),
    });
    setModalOpen(true);
  };

  const clearFilters = () => {
    setFilterOrganizationId("all");
    setFilterRole("all");
    setFilterStatus("all");
    setFilterGender("all");
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId) return "Select a school first.";
    if (!branchId) return "Select a branch first.";
    if (!form.fullName.trim()) return "Enter teacher full name.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return "Enter a valid email address.";
    if (!form.role) return "Select teacher role.";
    if (form.age !== "" && Number(form.age) < 0)
      return "Age cannot be negative.";
    if (form.salary !== "" && Number(form.salary) < 0)
      return "Salary cannot be negative.";
    if (form.latitude !== "") {
      const latitude = Number(form.latitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
        return "Latitude must be between -90 and 90.";
    }
    if (form.longitude !== "") {
      const longitude = Number(form.longitude);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
        return "Longitude must be between -180 and 180.";
    }
    if ((form.latitude === "") !== (form.longitude === ""))
      return "Enter both latitude and longitude, or clear both.";
    if (form.organizationId && !organizationMap.get(idOf(form.organizationId)))
      return "Selected organization is not in this branch.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      const sameEmail =
        form.email.trim() && safeLower(row.email) === safeLower(form.email);
      const samePhone =
        form.phone.trim() && safeLower(row.phone) === safeLower(form.phone);
      return (sameEmail || samePhone) && !row.isDeleted;
    });
    if (duplicate)
      return "A teacher with this email or phone already exists in this branch.";
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
      const linked = form.id ? teacherAccessContacts[idOf(form.id)] : undefined;
      if (linked?.userId &&
          (safeLower(linked.email) !== safeLower(form.email) ||
           String(linked.phone || "").trim() !== form.phone.trim())) {
        // Both pages now update the same backend AppUser identity. If the
        // authorization fails, do not save a contradictory local teacher contact.
        if (!form.email.trim()) throw new Error("A linked portal user must keep a login email.");
        await apiRequest(
          `/accounts/me/branch-users/${encodeURIComponent(linked.userId)}/identity`,
          { method: "PATCH", body: JSON.stringify({
            schoolId: String(schoolId), branchId: String(branchId),
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim(),
            fullName: linked.fullName || form.fullName.trim(),
          }) } as any,
        );
      }
      const payload: Partial<Teacher> = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        organizationId: form.organizationId
          ? String(form.organizationId)
          : undefined,
        fullName: form.fullName.trim(),
        gender: form.gender.trim() || undefined,
        age: form.age === "" ? undefined : Number(form.age),
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        coverPhoto: safeRecordMediaValue(form.coverPhoto),
        coverPhotoMediaId: form.coverPhotoMediaId || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        relativePhone: form.relativePhone.trim() || undefined,
        address: form.address.trim() || undefined,
        latitude: form.latitude === "" ? undefined : Number(form.latitude),
        longitude: form.longitude === "" ? undefined : Number(form.longitude),
        accuracyMeters:
          form.accuracyMeters === "" ? undefined : Number(form.accuracyMeters),
        locationLabel: form.locationLabel.trim() || undefined,
        formattedAddress: form.formattedAddress.trim() || undefined,
        locationType: form.locationType,
        locationSource: form.locationSource,
        locationPrecision: form.locationPrecision,
        locationCapturedAt:
          form.latitude !== "" && form.longitude !== ""
            ? form.locationCapturedAt || Date.now()
            : undefined,
        mapVisible: form.mapVisible,
        locationConsentGiven: form.locationConsentGiven,
        locationConsentAt: form.locationConsentGiven
          ? form.locationConsentAt || Date.now()
          : undefined,
        locationRestricted: form.locationRestricted,
        employmentDate: form.employmentDate || undefined,
        salary: form.salary === "" ? undefined : Number(form.salary),
        role: form.role,
        qualification: form.qualification.trim() || undefined,
        signature: safeRecordMediaValue(form.signature),
        signatureMediaId: form.signatureMediaId || undefined,
        active: form.active !== false,
        status: form.active !== false ? "active" : "inactive",
        isDeleted: false,
      } as Partial<Teacher>;

      const savedTeacher =
        form.id && existing
          ? await updateLocal("teachers", String(form.id), payload)
          : await createLocal("teachers", payload as unknown as Teacher);

      const savedTeacherId = savedEntityId(
        savedTeacher,
        form.id,
      );

      if (!savedTeacherId) {
        throw new Error(
          "The teacher record was saved, but its permanent ID could not be resolved for media attachment.",
        );
      }

      const stagedPhotoId = cleanId(
        uploadedMediaAssetIds.current.photo,
      );
      const stagedCoverPhotoId = cleanId(
        uploadedMediaAssetIds.current.coverPhoto,
      );
      const stagedSignatureId = cleanId(
        uploadedMediaAssetIds.current.signature,
      );

      const committedMedia = await commitMediaAssetsToOwner({
        accountId,
        ownerTable: TEACHER_MEDIA_OWNER_TABLE,
        ownerId: savedTeacherId,
        ownerTempKey: mediaSessionKey.current,
        assets: [
          {
            assetId: stagedPhotoId || undefined,
            fieldKey: MediaFieldKeys.PHOTO,
          },
          {
            assetId: stagedCoverPhotoId || undefined,
            fieldKey: MediaFieldKeys.COVER_PHOTO,
          },
          {
            assetId: stagedSignatureId || undefined,
            fieldKey: MediaFieldKeys.SIGNATURE,
          },
        ],
      });

      const committedPhotoId = committedMedia.find(
        (item) => item.fieldKey === MediaFieldKeys.PHOTO,
      )?.assetId;

      const committedCoverPhotoId = committedMedia.find(
        (item) => item.fieldKey === MediaFieldKeys.COVER_PHOTO,
      )?.assetId;

      const committedSignatureId = committedMedia.find(
        (item) => item.fieldKey === MediaFieldKeys.SIGNATURE,
      )?.assetId;

      /*
       * Persist the exact committed IDs onto the teacher record. New media is
       * always resolved through mediaAssets/mediaBlobs, never preview strings.
       */
      if (
        committedPhotoId ||
        committedCoverPhotoId ||
        committedSignatureId
      ) {
        await updateLocal(
          "teachers",
          savedTeacherId,
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
            signatureMediaId:
              committedSignatureId ||
              form.signatureMediaId ||
              existing?.signatureMediaId ||
              undefined,
            photo: safeRecordMediaValue(existing?.photo),
            coverPhoto: safeRecordMediaValue(existing?.coverPhoto),
            signature: safeRecordMediaValue(existing?.signature),
          } as Partial<Teacher>,
        );
      }

      uploadedMediaAssetIds.current = {};
      mediaSessionKey.current = makeMediaSessionKey();
      setModalOpen(false);
      showToast("success", "Teacher saved.");
      await load();
    } catch (error: any) {
      console.error("Failed to save teacher and media:", error);
      showToast(
        "error",
        error?.message || "Failed to save teacher.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: TeacherView) => {
    const row: any = item.row;
    const id = idOf(row.id);
    if (!id) return;
    const ok = window.confirm(
      item.totalUsage
        ? `"${row.fullName}" has ${item.totalUsage} related record(s). Delete anyway?`
        : `Delete "${row.fullName}"?`,
    );
    if (!ok) return;

    await Promise.all(
      ["photo", "coverPhoto", "signature"].map((fieldKey) =>
        softDeleteOwnerFieldAssets({
          accountId: String(accountId),

          ownerTable: "teachers",

          ownerId: cleanId(id) || undefined,

          fieldKey,
        }),
      ),
    );

    await softDeleteLocal("teachers", String(id));
    setSelectedItem(null);
    showToast("success", "Teacher deleted.");
    await load();
  };

  const toggleActive = async (item: TeacherView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;
    await updateLocal("teachers", id, {
      active: !item.active,
      status: !item.active ? "active" : "inactive",
      isDeleted: false,
    } as unknown as Partial<Teacher>);
    setSelectedItem(null);
    showToast(
      "success",
      item.active ? "Teacher deactivated." : "Teacher activated.",
    );
    await load();
  };


  const printTeachersTable = () => {
    printBranchTable({
      title: "Teacher Records",
      subtitle: `Current branch · ${filteredRows.length} matching teachers`,
      columns: [
        { key: "teacher", label: "Teachers" },
        { key: "role", label: "Role" },
        { key: "organization", label: "Organization" },
        { key: "contact", label: "Contact" },
        { key: "qualification", label: "Qualification" },
        { key: "salary", label: "Salary" },
        { key: "assignments", label: "Assignments" },
        { key: "subjects", label: "Class Subjects" },
        { key: "classTeacher", label: "Class Teacher" },
        { key: "attendance", label: "Attendance" },
        { key: "status", label: "Status" },
        { key: "updated", label: "Updated" },
      ],
      rows: filteredRows.map((item) => {
        const row: any = item.row;
        return {
          teacher: { text: row.fullName || "Unnamed teacher", detail: row.gender || undefined, image: item.photoUrl || safeRecordMediaValue(row.photo) },
          role: roleLabel(row.role),
          organization: item.organizationName,
          contact: { text: row.phone || "—", detail: row.email || undefined },
          qualification: row.qualification || "—",
          salary: moneyText(row.salary),
          assignments: item.assignmentCount,
          subjects: item.classSubjectCount,
          classTeacher: item.classTeacherCount,
          attendance: item.attendanceCount,
          status: item.active ? "Active" : "Inactive",
          updated: timeText(row.updatedAt || row.createdAt),
        };
      }),
    });
  };

  // The portal owns the action strip. All module actions stay functional.
  useRegisterBranchWorkspaceToolbar("teachers", {
    add: () => openCreate(),
    search: setSearch,
    filter: () => setFilterOpen(true),
    more: () => setMoreOpen(true),
    print: printTeachersTable,
  });

  // Table is the efficient default on a laptop; mobile starts in cards.
  useEffect(() => {
    if (typeof window !== "undefined") {
      setViewMode(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
    }
  }, []);

  if (accountLoading || contextLoading || settingsLoading || loading)
    return (
      <State
        primary={primary}
        title="Opening Teachers..."
        text="Checking account, branch, organizations, class links, attendance and teacher records."
      />
    );
  if (!authenticated || !accountId)
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing teachers."
      />
    );
  if (!schoolId || !branchId)
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>No branch workspace selected</h2>
          <p>
            Teachers belong to the selected branch-admin workspace. Use Select
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

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Teachers by Organization"
            rows={countsByOrganization}
            total={summary.total}
          />
          <AnalysisCard
            title="Teachers by Role"
            rows={countsByRole}
            total={summary.total}
          />
          <AnalysisCard
            title="Teachers by Gender"
            rows={countsByGender}
            total={summary.total}
          />
          <AnalysisCard
            title="Most Linked Teachers"
            rows={countsByUsage}
            total={Math.max(
              1,
              countsByUsage.reduce((s, r) => s + r.value, 0),
            )}
          />
          <article className="ba-analysis">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>
              Teacher record(s) currently match your search and filter
              conditions.
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          onOpen={(item) => setSelectedItem(item)}
          openEdit={openEdit}
          remove={remove}
          toggleActive={toggleActive}
        />
      )}
      {viewMode === "map" && (
        <section className="teachers-map-view" aria-label="Teachers map">
          <div className="teachers-map-summary">
            <span>Teachers on map</span>
            <strong>{teacherMarkers.length}</strong>
            <small>
              {filteredRows.length - teacherMarkers.length} filtered teacher(s)
              have no visible coordinates.
            </small>
          </div>

          <SchoolMap
            markers={teacherMarkers}
            height="min(68vh, 720px)"
            searchable={false}
            filterable={false}
            showLegend={false}
            cluster
            fitMarkers
            allowCreateAtLocation
            createEntityTypes={["teacher"]}
            onCreateAtLocation={handleCreateAtLocation}
            allowLocationEditing
            onLocationUpdate={handleTeacherLocationUpdate}
            emptyView={
              <div className="teachers-map-empty">
                <span aria-hidden="true">⌖</span>
                <strong>No teacher locations to display</strong>
                <small>
                  Add latitude and longitude to teacher records, or change the
                  current search and filters.
                </small>
              </div>
            }
          />
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <TeacherListItem
              key={String(item.id)}
              item={item}
              primary={primary}
              onOpen={() => setSelectedItem(item)}
            />
          ))}
          {!filteredRows.length && (
            <Empty
              icon="👩‍🏫"
              title="No teachers found"
              text="Add teachers for this branch, assign departments, connect class subjects, and track attendance links."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <BranchViewportPortal themeSourceClass=".ba-page" onEscape={() => setFilterOpen(false)}>
        <FilterSheet
          search={search}
          setSearch={setSearch}
          organizations={organizations}
          genderOptions={genderOptions}
          filterOrganizationId={filterOrganizationId}
          filterRole={filterRole}
          filterStatus={filterStatus}
          filterGender={filterGender}
          setFilterOrganizationId={setFilterOrganizationId}
          setFilterRole={setFilterRole}
          setFilterStatus={setFilterStatus}
          setFilterGender={setFilterGender}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
        </BranchViewportPortal>
      )}
      {moreOpen && (
        <BranchViewportPortal themeSourceClass=".ba-page" onEscape={() => setMoreOpen(false)}>
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
          onBatchIds={() => { setMoreOpen(false); setBatchIdsOpen(true); }}
          onClose={() => setMoreOpen(false)}
        />
        </BranchViewportPortal>
      )}
      {batchIdsOpen && (
        <IdentityCardBatch
          open={batchIdsOpen}
          onClose={() => setBatchIdsOpen(false)}
          subjectType="teacher"
          schoolId={String(schoolId)}
          branchId={String(branchId)}
          accountId={accountId}
          people={viewRows.filter(item => item.active).map(item => {
            const row: any = item.row;
            return {
              id: item.id,
              name: String(row.fullName || "Unnamed teacher"),
              staffNumber: String(row.staffNumber || row.employeeNumber || row.employeeId || ""),
              organizationName: item.organizationName === "No organization" ? "" : item.organizationName,
              gender: String(row.gender || ""),
              dateOfBirth: String(row.dateOfBirth || ""),
              phone: String(row.phone || ""),
              emergencyPhone: String(row.emergencyPhone || row.relativePhone || ""),
              photoMediaId: String(row.photoMediaId || ""),
              photoUrl: item.photoUrl || "",
            };
          })}
        />
      )}

      {selectedItem && (
        <BranchViewportPortal themeSourceClass=".ba-page" onEscape={() => setSelectedItem(null)}>
        <ActionSheet
          item={selectedItem}
          schoolId={schoolId}
          branchId={branchId}
          openEdit={openEdit}
          remove={remove}
          toggleActive={toggleActive}
          onClose={() => setSelectedItem(null)}
        />
        </BranchViewportPortal>
      )}
      {modalOpen && !signaturePadOpen && (
        <BranchViewportPortal themeSourceClass=".ba-page" onEscape={() => setModalOpen(false)}>
        <TeacherModal
          form={form}
          saving={saving}
          organizations={organizations}
          setModalOpen={setModalOpen}
          updateForm={updateForm}
          handleImageUpload={handleImageUpload}
          openCameraForField={openCameraForField}
          openSignaturePad={openSignaturePad}
          save={save}
        />
        </BranchViewportPortal>
      )}

      <SignaturePadModal
        open={signaturePadOpen}
        title="Draw Teacher Signature"
        description="Sign inside the pad. The saved signature keeps a transparent background for reports and documents."
        fileName={`teacher-signature-${form.id || "new"}-${Date.now()}.png`}
        defaultColor="#111827"
        onClose={() => setSignaturePadOpen(false)}
        onSave={handleSignaturePadSave}
      />

      {cameraOpen && (
        <BranchViewportPortal themeSourceClass=".ba-page" onEscape={() => closeCamera()}>
        <CameraCaptureModal
          field={cameraField}
          videoRef={cameraVideoRef}
          starting={cameraStarting}
          capturing={cameraCapturing}
          facing={cameraFacing}
          setFacing={setCameraFacing}
          capture={captureCameraPhoto}
          close={closeCamera}
          entityLabel={TEACHER_MEDIA_ENTITY_LABEL}
        />
        </BranchViewportPortal>
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

function TeacherListItem({
  item,
  primary,
  onOpen,
}: {
  item: TeacherView;
  primary: string;
  onOpen: () => void;
}) {
  const row: any = item.row;
  return (
    <button type="button" className="student-row" onClick={onOpen}>
      <Avatar
        name={row.fullName}
        photo={item.photoUrl || safeRecordMediaValue(row.photo)}
        primary={primary}
      />
      <span className="student-main">
        <strong>{row.fullName || "Unnamed teacher"}</strong>
        <small>
          {roleLabel(row.role)} · {item.organizationName}
        </small>
        <em>
          {row.phone ? `Phone: ${row.phone}` : "Phone not set"}
          {" · "}
          {row.email ? `Email: ${row.email}` : "Email not set"}
        </em>
      </span>
      <span className="student-side">
        <span
          className={`status-dot-mini ${statusTone(item.active)}`}
          title={item.active ? "Active" : "Inactive"}
          aria-label={item.active ? "Active" : "Inactive"}
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
  search,
  setSearch,
  organizations,
  genderOptions,
  filterOrganizationId,
  filterRole,
  filterStatus,
  filterGender,
  setFilterOrganizationId,
  setFilterRole,
  setFilterStatus,
  setFilterGender,
  clearFilters,
  onClose,
}: {
  search: string;
  setSearch: (value: string) => void;
  organizations: Organization[];
  genderOptions: string[];
  filterOrganizationId: string;
  filterRole: "all" | TeacherRole;
  filterStatus: TeacherStatusFilter;
  filterGender: string;
  setFilterOrganizationId: (value: string) => void;
  setFilterRole: (value: "all" | TeacherRole) => void;
  setFilterStatus: (value: TeacherStatusFilter) => void;
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
            <p>
              Choose only what you need. The teacher list updates after
              applying.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>
        <div className="ba-record-search-in-filter">
          <label htmlFor="ba-records-search">Search</label>
          <input id="ba-records-search" type="search" value={search}
            onChange={(event) => setSearch(event.target.value)} placeholder="Search records..." />
        </div>
        <div className="ba-form compact">
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
            <span>Role</span>
            <select
              value={filterRole}
              onChange={(e) =>
                setFilterRole(e.target.value as "all" | TeacherRole)
              }
            >
              <option value="all">All roles</option>
              <option value="teacher">Teacher</option>
              <option value="head_teacher">Head Teacher</option>
              <option value="lecturer">Lecturer</option>
              <option value="principal">Principal</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as TeacherStatusFilter)
              }
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
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
  summary,
  setViewMode,
  onRefresh,
  onBatchIds,
  onClose,
}: {
  viewMode: ViewMode;
  summary: {
    total: number;
    active: number;
    inactive: number;
    teachers: number;
    leaders: number;
    attendanceRecords: number;
    showing: number;
  };
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void | Promise<void>;
  onBatchIds: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>
              {summary.showing} of {summary.total} teacher record(s) shown.
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
            <small>Simple teacher records</small>
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
            <small>See filtered teachers with saved locations</small>
          </button>
          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Organization, role, gender and usage summaries</small>
          </button>
          <button type="button" onClick={onBatchIds}>
            <span>▣</span>
            <b>Batch ID cards</b>
            <small>Preview and print IDs for all teachers</small>
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
  schoolId,
  branchId,
  openEdit,
  remove,
  toggleActive,
  onClose,
}: {
  item: TeacherView;
  schoolId: string;
  branchId: string;
  openEdit: (row: Teacher) => void;
  remove: (item: TeacherView) => void;
  toggleActive: (item: TeacherView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{row.fullName || "Teacher"}</h2>
            <p>
              {roleLabel(row.role)} · {item.active ? "Active" : "Inactive"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close teacher actions"
          >
            ✕
          </button>
        </div>
        <div className="student-detail-strip">
          <span>
            <b>Assignments</b>
            {item.assignmentCount}
          </span>
          <span>
            <b>Class Subjects</b>
            {item.classSubjectCount}
          </span>
          <span>
            <b>Attendance</b>
            {item.attendanceCount}
          </span>
        </div>
        <div className="ba-menu-list">
          <IdentityCardActions
            subjectType="teacher" subjectId={item.id}
            schoolId={schoolId} branchId={branchId}
            name={String(row.fullName || "Teacher")}
            detail={String(row.role || "Teacher")} photoUrl={item.photoUrl}
          />
          <button type="button" onClick={() => openEdit(item.row)}>
            <span>✎</span>
            <b>Edit teacher</b>
            <small>
              Update profile, organization, salary, photos and signature
            </small>
          </button>
          <button type="button" onClick={() => toggleActive(item)}>
            <span>{item.active ? "⏸" : "✓"}</span>
            <b>{item.active ? "Deactivate" : "Activate"}</b>
            <small>
              {item.active
                ? "Mark this teacher as inactive"
                : "Restore this teacher as active"}
            </small>
          </button>
          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this teacher locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  onOpen,
  openEdit,
  remove,
  toggleActive,
}: {
  rows: TeacherView[];
  onOpen: (item: TeacherView) => void;
  openEdit: (row: Teacher) => void;
  remove: (item: TeacherView) => void;
  toggleActive: (item: TeacherView) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Teachers ({rows.length})</th>
              <th>Role</th>
              <th>Organization</th>
              <th>Contact</th>
              <th>Qualification</th>
              <th>Salary</th>
              <th>Assignments</th>
              <th>Class Subjects</th>
              <th>Class Teacher</th>
              <th>Attendance</th>
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
                    <div className="ba-table-person">
                      <Avatar
                        name={row.fullName || "Teacher"}
                        photo={item.photoUrl || safeRecordMediaValue(row.photo)}
                        primary="var(--ba-primary, #64748b)"
                      />
                      <div className="ba-table-person-details">
                        <strong>{row.fullName || "Unnamed teacher"}</strong>
                        <span>{row.gender || "No gender set"}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Chip tone={roleTone(row.role)}>{roleLabel(row.role)}</Chip>
                  </td>
                  <td>{item.organizationName}</td>
                  <td>
                    <strong>{row.phone || "—"}</strong>
                    <span>{row.email || "No email"}</span>
                  </td>
                  <td>{row.qualification || "—"}</td>
                  <td>{moneyText(row.salary)}</td>
                  <td>{item.assignmentCount}</td>
                  <td>{item.classSubjectCount}</td>
                  <td>{item.classTeacherCount}</td>
                  <td>{item.attendanceCount}</td>
                  <td>
                    <Chip tone={item.active ? "green" : "red"}>
                      {item.active ? "Active" : "Inactive"}
                    </Chip>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button
                        type="button"
                        onClick={() => onOpen(item)}
                        aria-label={`View or generate ID card for ${row.fullName || "teacher"}`}
                        title="View or generate ID card"
                      >
                        ID Card
                      </button>
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
          <div className="ba-empty-table">No teacher matches your filters.</div>
        )}
      </div>
    </section>
  );
}

function TeacherModal({
  form,
  saving,
  organizations,
  setModalOpen,
  updateForm,
  handleImageUpload,
  openCameraForField,
  openSignaturePad,
  save,
}: {
  form: FormState;
  saving: boolean;
  organizations: Organization[];
  setModalOpen: (open: boolean) => void;
  updateForm: (patch: Partial<FormState>) => void;
  handleImageUpload: (field: CameraField, file?: File) => void | Promise<void>;
  openCameraForField: (field: CameraField) => void;
  openSignaturePad: () => void;
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
        updateForm({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? String(Math.round(position.coords.accuracy))
            : "",
          locationSource: "device_gps",
          locationCapturedAt: position.timestamp || Date.now(),
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
            <h2>{form.id ? "Edit Teacher" : "Add Teacher"}</h2>
            <p>Teacher will be saved under the selected school branch.</p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close teacher form"
          >
            ✕
          </button>
        </div>
        <section className="ba-form-section">
          <h3>Teacher</h3>
          <div className="ba-form">
            <label>
              <span>Full Name</span>
              <input
                value={form.fullName}
                onChange={(e) => updateForm({ fullName: e.target.value })}
                placeholder="Teacher full name"
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
              <span>Age</span>
              <input
                type="number"
                value={form.age}
                onChange={(e) => updateForm({ age: e.target.value })}
                placeholder="Age"
              />
            </label>
            <label>
              <span>Role</span>
              <select
                value={form.role}
                onChange={(e) =>
                  updateForm({ role: e.target.value as TeacherRole })
                }
              >
                <option value="teacher">Teacher</option>
                <option value="head_teacher">Head Teacher</option>
                <option value="lecturer">Lecturer</option>
                <option value="principal">Principal</option>
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
        </section>
        <section className="ba-form-section">
          <h3>Work Details</h3>
          <div className="ba-form">
            <label>
              <span>Organization / Department</span>
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
            <label>
              <span>Qualification</span>
              <input
                value={form.qualification}
                onChange={(e) => updateForm({ qualification: e.target.value })}
                placeholder="Qualification"
              />
            </label>
            <label>
              <span>Employment Date</span>
              <input
                type="date"
                value={form.employmentDate}
                onChange={(e) => updateForm({ employmentDate: e.target.value })}
              />
            </label>
            <label>
              <span>Salary</span>
              <input
                type="number"
                value={form.salary}
                onChange={(e) => updateForm({ salary: e.target.value })}
                placeholder="Salary"
              />
            </label>
          </div>
        </section>
        <section className="ba-form-section">
          <h3>Contact</h3>
          <div className="ba-form">
            <label>
              <span>Email</span>
              <input
                value={form.email}
                onChange={(e) => updateForm({ email: e.target.value })}
                placeholder="Email address"
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                value={form.phone}
                onChange={(e) => updateForm({ phone: e.target.value })}
                placeholder="Phone number"
              />
            </label>
            <label>
              <span>Relative Phone</span>
              <input
                value={form.relativePhone}
                onChange={(e) => updateForm({ relativePhone: e.target.value })}
                placeholder="Emergency / relative phone"
              />
            </label>
          </div>
        </section>
        <section className="ba-form-section">
          <div className="ba-section-heading-row">
            <div>
              <h3>Map Location</h3>
              <p>
                Save the teacher&apos;s approved home, workplace, pickup, or
                other operational location.
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
              <span>Address</span>
              <textarea
                value={form.address}
                onChange={(e) => updateForm({ address: e.target.value })}
                placeholder="Teacher address"
              />
            </label>

            <label>
              <span>Location Label</span>
              <input
                value={form.locationLabel}
                onChange={(e) => updateForm({ locationLabel: e.target.value })}
                placeholder="e.g. Teacher home or workplace"
              />
            </label>

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
                <option value="workplace">Workplace</option>
                <option value="pickup_point">Pickup point</option>
                <option value="dropoff_point">Drop-off point</option>
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
                <strong>Show on teacher map</strong>
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
              <span>
                Coordinate source: {form.locationSource.replace("_", " ")}
              </span>
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
              <span>Teacher Photo</span>
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
                  alt="Teacher preview"
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
                  alt="Teacher cover preview"
                  className="ba-preview-banner"
                />
              )}
            </label>
            <label>
              <span>Signature</span>
              <div className="ba-media-actions">
                <label className="ba-media-button">
                  Upload Signature
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleImageUpload("signature", e.target.files?.[0])
                    }
                    hidden
                  />
                </label>
                <button
                  type="button"
                  className="ba-media-button secondary"
                  onClick={openSignaturePad}
                >
                  Draw Signature
                </button>
              </div>
              <small className="ba-media-hint">
                Upload or draw a signature image. It is stored as a compact
                signature media asset.
              </small>
              {form.signature && (
                <img
                  src={form.signature}
                  alt="Teacher signature preview"
                  className="ba-preview-signature"
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
            {saving ? "Saving..." : form.id ? "Save Changes" : "Add Teacher"}
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
      : field === "coverPhoto"
        ? `Take ${entityLabel} Cover Photo`
        : `Capture ${entityLabel} Signature`;

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
            {capturing
              ? "Capturing..."
              : field === "signature"
                ? "Capture Signature"
                : "Capture Photo"}
          </button>
        </div>
      </section>
    </div>
  );
}

function groupedCounts(
  rows: TeacherView[],
  keyFn: (item: TeacherView) => string,
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


/* Teacher page additions that sit on top of the Students golden-standard ba-* CSS. */
.ba-form.two {
  grid-template-columns: minmax(0,1fr);
}

@media (min-width: 680px) {
  .ba-form.two {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }
}

.ba-media-hint {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
}

.ba-preview-signature { width: 180px; height: 72px; object-fit: contain; background: var(--surface,#fff); border-radius: 12px; border: 1px solid var(--border,rgba(0,0,0,.10)); }

.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.ba-media-button {
  min-height: 40px;
  width: auto;
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
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 12px 24px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button.secondary {
  background: var(--surface,#fff);
  color: var(--ba-primary);
  box-shadow: none;
}

.camera-backdrop {
  place-items: center;
}

.ba-camera-modal {
  width: min(720px, 100%);
  max-height: min(92dvh, 760px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface,#fff));
  border: 1px solid var(--border,rgba(0,0,0,.10));
  box-shadow: 0 30px 90px rgba(15,23,42,.36);
}

.ba-camera-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 22px;
  background: #020617;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-camera-preview video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.ba-camera-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  background: rgba(2,6,23,.48);
}

.ba-camera-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
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
  border: 1px solid var(--border,rgba(0,0,0,.10));
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text,#111827);
}

.ba-camera-primary {
  border: 1px solid var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-camera-actions button:disabled {
  opacity: .65;
  cursor: not-allowed;
}


/* Teacher map and location workflow. */
.teachers-map-view {
  display: grid;
  gap: 10px;
}

.teachers-map-summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--ba-primary) 16%, var(--border, rgba(0,0,0,.10)));
  border-radius: 14px;
  background: color-mix(in srgb, var(--ba-primary) 4%, var(--card-bg, var(--surface, #fff)));
}

.teachers-map-summary span {
  font-size: 12px;
  font-weight: 700;
}

.teachers-map-summary strong {
  color: var(--ba-primary);
  font-size: 17px;
}

.teachers-map-summary small {
  margin-left: auto;
  font-size: 10px;
  opacity: .64;
}

.teachers-map-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 7px;
  padding: 24px;
  text-align: center;
  color: var(--text, #111827);
}

.teachers-map-empty > span {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: var(--ba-primary);
  background: color-mix(in srgb, var(--ba-primary) 10%, transparent);
  font-size: 22px;
}

.teachers-map-empty strong {
  font-size: 13px;
}

.teachers-map-empty small {
  max-width: 360px;
  font-size: 10px;
  line-height: 1.5;
  opacity: .62;
}

@media (max-width: 640px) {
  .teachers-map-summary {
    align-items: center;
    flex-wrap: wrap;
  }

  .teachers-map-summary small {
    width: 100%;
    margin-left: 0;
  }
}


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


/* V5 — neutral, lightweight records workspace; theme-aware and low-paint. */
.ba-page { background: var(--bg, var(--background, #f2f4f7)); padding: 5px; min-height: 0; }
.ba-list { gap: 9px; margin-top: 2px; }
.student-row, .ba-card, .ba-table-card, .ba-analysis {
  background: color-mix(in srgb, var(--card-bg, var(--surface, #fff)) 93%, var(--text, #182235) 7%);
  border: 1px solid color-mix(in srgb, var(--border, #d4dae3) 85%, var(--text, #182235) 15%);
  box-shadow: none; border-radius: 13px; transition: border-color .12s ease;
}
.student-row:hover, .ba-card:hover { transform: none; box-shadow: none; }
.ba-table-card { padding: 4px; margin-top: 2px; }
.ba-table-scroll { border-radius: 10px; }
.ba-table-scroll table { background: color-mix(in srgb, var(--card-bg, var(--surface,#fff)) 95%, var(--text,#182235) 5%); }
.ba-table-scroll thead th { position: sticky; top: 0; z-index: 2;
  background: color-mix(in srgb, var(--card-bg, var(--surface,#fff)) 85%, var(--text,#182235) 15%); }
.ba-table-scroll tbody tr:nth-child(even) { background: color-mix(in srgb, var(--card-bg, var(--surface,#fff)) 89%, var(--text,#182235) 11%); }
.ba-table-scroll td { background: transparent; }
.ba-avatar { box-shadow: none; border-radius: 12px; }
.ba-record-search-in-filter { display: grid; gap: 6px; margin: 0 0 12px; }
.ba-record-search-in-filter label { font-size: 12px; font-weight: 700; }
.ba-record-search-in-filter input { width: 100%; min-height: 42px; padding: 0 12px;
  border: 1px solid var(--border, #d4dae3); border-radius: 10px;
  background: var(--input-bg, var(--surface,#fff)); color: var(--text,#182235); }
.ba-page .ba-search-card, .ba-page .ba-filter-chips { display: none !important; }
.ba-page .student-row::before { display: none; }
.ba-page .student-main em { white-space:normal; overflow-wrap:anywhere; line-height:1.35; }
@media (min-width: 1024px) { .ba-list { grid-template-columns: repeat(4,minmax(0,1fr)); } }
@media (max-width: 639px) { .ba-page { padding: 3px; } .student-row { padding: 9px; } }
@media (prefers-reduced-motion: reduce) { .student-row, .ba-card { transition: none; } }

/* ================================================================
   V9 — ASSESSMENT-ENTRIES-ALIGNED FULL-WIDTH RECORDS
   The parent portal owns the sidebar width. Do not place a second
   1180px cap inside the module; use every pixel of its content area.
   Only workspace content is affected: modal/sheet sizes are preserved.
   ================================================================ */
.ba-page {
  width: 100%;
  max-width: none;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 5px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
  overflow-x: clip;
}

.ba-page .ba-list,
.ba-page .ba-table-card,
.ba-page .ba-analysis-grid,
.ba-page .ba-filter-chips,
.ba-page .ba-summary-line,
.ba-page .students-map-view,
.ba-page .teachers-map-view {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: none;
  margin-left: 0;
  margin-right: 0;
}

/* Mirror the efficient Assessment Entries list rhythm. */
.ba-page .ba-list {
  gap: 9px;
  margin-top: 2px;
  align-items: stretch;
}
.ba-page .ba-list > .student-row {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 9px 10px;
}

/* Stretch the table's OUTER card and its horizontal scroll viewport.
   Only the table scrolls horizontally when its columns need more room. */
.ba-page .ba-table-card {
  display: block;
  padding: 4px;
  margin-top: 2px;
  overflow: visible;
}
.ba-page .ba-table-scroll {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  border-radius: 10px;
}
.ba-page .ba-table-scroll table {
  width: 100%;
  margin: 0;
}
.ba-page .ba-table-scroll th,
.ba-page .ba-table-scroll td {
  padding: 9px 10px;
}

.ba-page .ba-analysis-grid {
  margin-top: 2px;
  gap: 9px;
}

/* Keep 1 on small phones, 2 on tablets, and at most 4 on desktops.
   Container queries would be a separate change; preserve V5 view logic. */
@media (min-width: 680px) and (max-width: 1023px) {
  .ba-page .ba-list { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (min-width: 1024px) {
  .ba-page .ba-list { grid-template-columns: repeat(4, minmax(0,1fr)); }
}
@media (max-width: 679px) {
  .ba-page .ba-list { grid-template-columns: minmax(0,1fr); }
}
@media (max-width: 639px) {
  .ba-page {
    padding: 3px;
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }
  .ba-page .ba-list { gap: 7px; }
  .ba-page .ba-list > .student-row { padding: 9px; }
  .ba-page .ba-table-scroll th,
  .ba-page .ba-table-scroll td { padding: 8px 9px; }
}


/* V11 — photos in both cards and tables (matching Students). */
.ba-page .ba-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: #fff;
  isolation: isolate;
}
.ba-page .ba-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
  flex: 1 1 auto;
}
.ba-page .ba-table-person {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 160px;
}
.ba-page .ba-table-person .ba-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 10px;
  font-size: 12px;
}
.ba-page .ba-table-person-details {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.ba-page .ba-table-person-details > strong,
.ba-page .ba-table-person-details > span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
