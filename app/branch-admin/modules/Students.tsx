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
 * - photoMediaId / coverPhotoMediaId remain as backward-compatible references, but reloads resolve media by ownerTable + ownerLocalId + fieldKey
 *
 * Media behavior:
 * - selected or camera-captured images are compressed and stored once in mediaAssets/mediaBlobs
 * - student records save small media IDs instead of full image strings
 * - old photo/coverPhoto fields remain as backward-compatible fallbacks only
 * - unsaved-form uploads use ownerTempKey so one student/teacher/parent upload cannot bleed into another record
 * - new uploads are attached to the student after create/update so media can sync separately
 * - photo fields offer both Upload and Take Photo actions while using the same saveImageAsset(...) pipeline
 * - media owner table comes from shared MediaOwners.STUDENTS so the camera/upload system stays reusable across Students, Teachers, Parents, Settings, and finance documents
 * - this file only supplies the student owner constant; the camera utility itself remains shared and module-agnostic
 *
 * Compact mobile-first UI update:
 * - keeps the original page styling intact
 * - removed the duplicate Students / Branch / School header block
 * - removed the floating add button
 * - placed the + add action beside search
 * - replaced the gear filter with a horizontal slider filter icon
 * - replaced large status chips in list rows with small status dots
 * - removed the branch shell sync/online status dot and status sheet from this module
 * - removed the separate shown/total/active summary strip from all views
 * - shows the filtered count minimally inside the Student table header, for example Students (2)
 * - keeps analytics/table under More so the main page stays clean
 * - keeps table colors tied to existing theme variables for dark mode support
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db, type Class, type Organization, type Student, type StudentEnrollment } from "../../lib/db";
import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../../lib/sync/syncUtils";
import {
  MediaOwners,
  MediaFieldKeys,
  attachCameraStreamToVideo,
  attachMediaAssetToOwner,
  captureImageFileFromVideo,
  createMediaSessionKey as createSharedMediaSessionKey,
  getCameraUnavailableMessage,
  resolveOwnerMediaUrl,
  isCameraApiAvailable,
  openCameraStream,
  revokeMediaObjectUrl,
  saveImageAsset,
  stopCameraStream,
  type CameraFacingMode,
} from "../../lib/media/mediaAssetUtils";


type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn";
type CameraField = "photo" | "coverPhoto";

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
  currentClassId: string;
  admissionNumber: string;
  fullName: string;
  gender: string;
  age: string;
  dateOfBirth: string;
  photo: string;
  photoMediaId?: number;
  coverPhoto: string;
  coverPhotoMediaId?: number;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  address: string;
  status: StudentStatus;
};

type StudentView = {
  id: number;
  row: Student;
  photoUrl?: string;
  coverPhotoUrl?: string;
  className: string;
  organizationName: string;
  enrollmentCount: number;
  activeEnrollment?: StudentEnrollment;
  active: boolean;
};

const emptyForm: FormState = {
  organizationId: "",
  currentClassId: "",
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
  status: "active",
};

const idOf = (v: any) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (v: any) => String(v || "").toLowerCase().trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) =>
  !row?.isDeleted && !["withdrawn", "deleted", "archived", "inactive"].includes(safeLower(row?.status));

const statusLabel = (s?: StudentStatus) => (!s ? "Active" : s.charAt(0).toUpperCase() + s.slice(1));

function statusTone(s?: StudentStatus): "green" | "red" | "blue" | "orange" | "gray" {
  if (!s || s === "active") return "green";
  if (s === "graduated") return "blue";
  if (s === "transferred") return "orange";
  if (s === "withdrawn") return "red";
  return "gray";
}

const timeText = (v?: string | number | null) => {
  if (!v) return "Not set";
  const t = typeof v === "number" ? v : new Date(v).getTime();
  if (!Number.isFinite(t)) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(t));
  } catch {
    return "Not set";
  }
};

const mediaKey = (studentId: number, field: "photo" | "coverPhoto") => `students:${studentId}:${field}`;

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
};

const STUDENT_MEDIA_OWNER_TABLE = MediaOwners.STUDENTS;
const STUDENT_MEDIA_ENTITY_LABEL = "Student";

const createStudentMediaSessionKey = () =>
  createSharedMediaSessionKey(STUDENT_MEDIA_OWNER_TABLE);

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div
      className="ba-avatar"
      style={{
        background: photo
          ? `url(${photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {!photo && String(name || "S").slice(0, 1).toUpperCase()}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

export default function StudentsPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, activeBranch, activeBranchId, loading: contextLoading } = useActiveBranch();
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

  const [rows, setRows] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<Record<string, string>>({});

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState("all");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | StudentStatus>("all");
  const [filterGender, setFilterGender] = useState("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StudentView | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);
  const mediaSessionKeyRef = useRef(createStudentMediaSessionKey());
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraField, setCameraField] = useState<CameraField>("photo");
  const [cameraFacing, setCameraFacing] = useState<CameraFacingMode>("environment");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraCapturing, setCameraCapturing] = useState(false);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    else if (!schoolId || !branchId) router.replace("/account");
  }, [accountLoading, contextLoading, authenticated, accountId, schoolId, branchId, router]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast((c) => (c?.message === message ? null : c)), 4200);
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
        fileName: `${cameraField}-${Date.now()}.jpg`,
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
    setClasses([]);
    setOrganizations([]);
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
            ownerLocalId: studentId,
            ownerCloudId: student.cloudId || undefined,
            fieldKey: MediaFieldKeys.PHOTO,
            fallbackAssetId: student.photoMediaId,
          });
          if (photoUrl) next[mediaKey(studentId, "photo")] = photoUrl;

          const coverPhotoUrl = await resolveOwnerMediaUrl({
            accountId: accountId || undefined,
            ownerTable: STUDENT_MEDIA_OWNER_TABLE,
            ownerLocalId: studentId,
            ownerCloudId: student.cloudId || undefined,
            fieldKey: MediaFieldKeys.COVER_PHOTO,
            fallbackAssetId: student.coverPhotoMediaId,
          });
          if (coverPhotoUrl) next[mediaKey(studentId, "coverPhoto")] = coverPhotoUrl;
        } catch (error) {
          console.error("Failed to resolve student media:", studentId, error);
        }
      })
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
      const [studentRows, classRows, organizationRows, enrollmentRows] = await Promise.all([
        tableSafe("students")?.toArray?.() || [],
        listActiveLocal("classes", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("organizations", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        tableSafe("studentEnrollments")?.toArray?.() || [],
      ]);

      const scopedStudents = (studentRows as Student[])
        .filter((r) => sameTenant(r as TenantRow))
        .sort((a: any, b: any) => String(a.fullName || "").localeCompare(String(b.fullName || "")));

      setRows(scopedStudents);
      await resolveStudentMediaUrls(scopedStudents);

      setClasses(
        (classRows as Class[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );

      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        )
      );

      setEnrollments((enrollmentRows as StudentEnrollment[]).filter((r) => sameTenant(r as TenantRow)));
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
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading, contextLoading]);

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

  const classMap = useMemo(() => new Map(classes.map((r: any) => [idOf(r.id), r])), [classes]);
  const organizationMap = useMemo(() => new Map(organizations.map((r: any) => [idOf(r.id), r])), [organizations]);

  const enrollmentMap = useMemo(() => {
    const m = new Map<number, StudentEnrollment[]>();
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
        const activeEnrollment = studentEnrollments.find((i: any) => i.status === "active");
        const classData: any = classMap.get(idOf((activeEnrollment as any)?.classId || row.currentClassId));
        const organization: any = organizationMap.get(idOf(row.organizationId));

        return {
          id,
          row,
          photoUrl: mediaPreviewUrls[mediaKey(id, "photo")] || safeRecordMediaValue(row.photo),
          coverPhotoUrl: mediaPreviewUrls[mediaKey(id, "coverPhoto")] || safeRecordMediaValue(row.coverPhoto),
          className: classData?.name || "No class assigned",
          organizationName: organization?.name || "No organization",
          enrollmentCount: studentEnrollments.length,
          activeEnrollment,
          active: isActiveRow(row),
        };
      }),
    [classMap, enrollmentMap, mediaPreviewUrls, organizationMap, rows]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row: any = item.row;

        if (filterClassId !== "all") {
          const activeClassId = idOf((item.activeEnrollment as any)?.classId || row.currentClassId);
          if (!sameId(activeClassId, filterClassId)) return false;
        }

        if (filterOrganizationId !== "all" && !sameId(row.organizationId, filterOrganizationId)) return false;
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
        String((a.row as any).fullName || "").localeCompare(String((b.row as any).fullName || ""))
      );
  }, [filterClassId, filterGender, filterOrganizationId, filterStatus, search, viewRows]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((r: any) => r.status === "active" || !r.status).length,
      graduated: rows.filter((r: any) => r.status === "graduated").length,
      transferred: rows.filter((r: any) => r.status === "transferred").length,
      withdrawn: rows.filter((r: any) => r.status === "withdrawn").length,
      withClass: new Set(enrollments.filter((r: any) => r.status === "active").map((r: any) => r.studentId)).size,
      showing: filteredRows.length,
    }),
    [enrollments, filteredRows.length, rows]
  );

  const activeFilterCount = useMemo(() => {
    return [filterClassId, filterOrganizationId, filterStatus, filterGender].filter((v) => v !== "all").length;
  }, [filterClassId, filterGender, filterOrganizationId, filterStatus]);

  const genderOptions = useMemo(() => Array.from(new Set(rows.map((r: any) => r.gender).filter(Boolean))) as string[], [rows]);
  const countsByClass = useMemo(() => groupedCounts(viewRows, (i) => i.className), [viewRows]);
  const countsByOrganization = useMemo(() => groupedCounts(viewRows, (i) => i.organizationName), [viewRows]);
  const countsByStatus = useMemo(() => groupedCounts(viewRows, (i) => statusLabel((i.row as any).status)), [viewRows]);
  const countsByGender = useMemo(() => groupedCounts(viewRows, (i) => String((i.row as any).gender || "Not set")), [viewRows]);

  const updateForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const handleImageUpload = async (field: "photo" | "coverPhoto", file?: File) => {
    if (!file) return;

    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return;
    }

    try {
      const ownerTempKey = form.id ? undefined : mediaSessionKeyRef.current;

      const result = await saveImageAsset(file, {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        ownerTable: STUDENT_MEDIA_OWNER_TABLE,
        ownerLocalId: form.id || undefined,
        ownerTempKey,
        fieldKey: field === "photo" ? MediaFieldKeys.PHOTO : MediaFieldKeys.COVER_PHOTO,
        variant: field === "photo" ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateForm({
        [field]: result.previewUrl,
        [`${field}MediaId`]: result.assetId,
      } as Partial<FormState>);

      showToast("success", field === "photo" ? "Student photo optimized." : "Cover photo optimized.");
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

  const openCreate = () => {
    if (!requireTenant()) return;

    mediaSessionKeyRef.current = createStudentMediaSessionKey();

    setForm({
      ...emptyForm,
      currentClassId: filterClassId !== "all" ? filterClassId : "",
      organizationId: filterOrganizationId !== "all" ? filterOrganizationId : "",
      status: filterStatus !== "all" ? filterStatus : "active",
    });
    setModalOpen(true);
  };

  const openEdit = (row: Student) => {
    const s: any = row;
    mediaSessionKeyRef.current = createStudentMediaSessionKey();
    setSelectedItem(null);
    setForm({
      id: idOf(s.id),
      organizationId: s.organizationId ? String(s.organizationId) : "",
      currentClassId: s.currentClassId ? String(s.currentClassId) : "",
      admissionNumber: s.admissionNumber || "",
      fullName: s.fullName || "",
      gender: s.gender || "",
      age: s.age == null ? "" : String(s.age),
      dateOfBirth: s.dateOfBirth || "",
      photo: mediaPreviewUrls[mediaKey(idOf(s.id), "photo")] || safeRecordMediaValue(s.photo) || "",
      photoMediaId: s.photoMediaId ? Number(s.photoMediaId) : undefined,
      coverPhoto: mediaPreviewUrls[mediaKey(idOf(s.id), "coverPhoto")] || safeRecordMediaValue(s.coverPhoto) || "",
      coverPhotoMediaId: s.coverPhotoMediaId ? Number(s.coverPhotoMediaId) : undefined,
      parentName: s.parentName || "",
      parentPhone: s.parentPhone || "",
      parentEmail: s.parentEmail || "",
      address: s.address || "",
      status: s.status || "active",
    });
    setModalOpen(true);
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
    if (form.age !== "" && Number(form.age) < 0) return "Age cannot be negative.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return !!form.admissionNumber.trim() && safeLower(row.admissionNumber) === safeLower(form.admissionNumber) && !row.isDeleted;
    });

    if (duplicate) return "A student with this admission number already exists in this branch.";
    if (form.currentClassId && !classMap.get(idOf(form.currentClassId))) return "Selected class is not in this branch.";
    if (form.organizationId && !organizationMap.get(idOf(form.organizationId))) return "Selected organization is not in this branch.";

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

      const existing = form.id ? rows.find((row: any) => sameId(row.id, form.id)) : undefined;

      const payload: Partial<Student> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        currentClassId: form.currentClassId ? Number(form.currentClassId) : undefined,
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
        status: form.status || "active",
        active: true,
        isDeleted: false,
      } as Partial<Student>;

      const savedStudent = form.id && existing
        ? await updateLocal("students", Number(form.id), payload)
        : await createLocal("students", payload as unknown as Student);

      const savedStudentId = Number(
        typeof savedStudent === "number" ? savedStudent : (savedStudent as any)?.id || form.id || 0
      );
      if (savedStudentId) {
        await Promise.all(
          [form.photoMediaId, form.coverPhotoMediaId]
            .filter(Boolean)
            .map((assetId) =>
              attachMediaAssetToOwner({
                assetId: Number(assetId),
                ownerTable: STUDENT_MEDIA_OWNER_TABLE,
                ownerLocalId: savedStudentId,
                ownerTempKey: mediaSessionKeyRef.current,
              })
            )
        );
      }

      mediaSessionKeyRef.current = createStudentMediaSessionKey();
      setModalOpen(false);
      showToast("success", "Student saved.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to save student.");
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
        : `Delete "${row.fullName}"?`
    );

    if (!ok) return;

    await softDeleteLocal("students", Number(id));
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
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing students." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>No branch workspace selected</h2>
          <p>Students belong to the selected branch-admin workspace. Use Select Role again if the wrong branch is active.</p>
          <button type="button" className="ba-state-button" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">
            ✕
          </button>
        </section>
      )}

      <section className="ba-search-card" aria-label="Student search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students..."
            aria-label="Search students"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Add student">
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

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {filterClassId !== "all" && (
            <button type="button" onClick={() => setFilterClassId("all")}>
              Class: {(classMap.get(idOf(filterClassId)) as any)?.name || filterClassId} ×
            </button>
          )}
          {filterOrganizationId !== "all" && (
            <button type="button" onClick={() => setFilterOrganizationId("all")}>
              Organization: {(organizationMap.get(idOf(filterOrganizationId)) as any)?.name || filterOrganizationId} ×
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
          <AnalysisCard title="Students by Class" rows={countsByClass} total={summary.total} />
          <AnalysisCard title="Students by Organization" rows={countsByOrganization} total={summary.total} />
          <AnalysisCard title="Students by Status" rows={countsByStatus} total={summary.total} />
          <AnalysisCard title="Students by Gender" rows={countsByGender} total={summary.total} />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>Student record(s) currently match your search and filter conditions.</p>
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
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <StudentModal
          form={form}
          saving={saving}
          classes={classes}
          organizations={organizations}
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
          entityLabel={STUDENT_MEDIA_ENTITY_LABEL}
        />
      )}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
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
      <Avatar name={row.fullName} photo={item.photoUrl || safeRecordMediaValue(row.photo)} primary={primary} />

      <span className="student-main">
        <strong>{row.fullName || "Unnamed student"}</strong>
        <small>
          {item.className}
          {row.admissionNumber ? ` · ${row.admissionNumber}` : ""}
        </small>
        <em>
          {row.parentPhone ? `Parent: ${row.parentPhone}` : row.parentName ? `Parent: ${row.parentName}` : item.organizationName}
        </em>
      </span>

      <span className="student-side">
        <span className={`status-dot-mini ${statusTone(row.status)}`} title={statusLabel(row.status)} aria-label={statusLabel(row.status)} />
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
            <select value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)}>
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
            <select value={filterOrganizationId} onChange={(e) => setFilterOrganizationId(e.target.value)}>
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
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "all" | StudentStatus)}>
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="graduated">Graduated</option>
              <option value="transferred">Transferred</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </label>

          <label>
            <span>Gender</span>
            <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
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
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            <span>☰</span>
            <b>List view</b>
            <small>Simple student records</small>
          </button>

          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span>
            <b>Table view</b>
            <small>Dense records for laptop work</small>
          </button>

          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>
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
  onClose,
}: {
  item: StudentView;
  openEdit: (row: Student) => void;
  remove: (item: StudentView) => void;
  setStatus: (item: StudentView, status: StudentStatus) => void;
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
          <button type="button" onClick={onClose} aria-label="Close student actions">
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
            <small>Update profile, class, parent and photos</small>
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
            <button type="button" onClick={() => setStatus(item, "transferred")}>
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
                    <Chip tone={statusTone(row.status)}>{statusLabel(row.status)}</Chip>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item.row)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => setStatus(item, "active")}>
                        Activate
                      </button>
                      <button type="button" onClick={() => setStatus(item, "graduated")}>
                        Graduate
                      </button>
                      <button type="button" className="ba-delete" onClick={() => remove(item)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && <div className="ba-empty-table">No student matches your filters.</div>}
      </div>
    </section>
  );
}

function StudentModal({
  form,
  saving,
  classes,
  organizations,
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
  setModalOpen: (open: boolean) => void;
  updateForm: (patch: Partial<FormState>) => void;
  handleImageUpload: (field: "photo" | "coverPhoto", file?: File) => void | Promise<void>;
  openCameraForField: (field: CameraField) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Student" : "Add Student"}</h2>
            <p>Student will be saved under the selected school branch.</p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close student form">
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Student</h3>
          <div className="ba-form">
            <label>
              <span>Full Name</span>
              <input value={form.fullName} onChange={(e) => updateForm({ fullName: e.target.value })} placeholder="Student full name" />
            </label>

            <label>
              <span>Admission Number</span>
              <input
                value={form.admissionNumber}
                onChange={(e) => updateForm({ admissionNumber: e.target.value })}
                placeholder="Admission number"
              />
            </label>

            <label>
              <span>Gender</span>
              <select value={form.gender} onChange={(e) => updateForm({ gender: e.target.value })}>
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label>
              <span>Date of Birth</span>
              <input type="date" value={form.dateOfBirth} onChange={(e) => updateForm({ dateOfBirth: e.target.value })} />
            </label>

            <label>
              <span>Age</span>
              <input type="number" value={form.age} onChange={(e) => updateForm({ age: e.target.value })} placeholder="Age" />
            </label>

            <label>
              <span>Status</span>
              <select value={form.status} onChange={(e) => updateForm({ status: e.target.value as StudentStatus })}>
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
              <span>Current Class</span>
              <select value={form.currentClassId} onChange={(e) => updateForm({ currentClassId: e.target.value })}>
                <option value="">No class assigned</option>
                {classes.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Organization / House / Department</span>
              <select value={form.organizationId} onChange={(e) => updateForm({ organizationId: e.target.value })}>
                <option value="">No organization</option>
                {organizations.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name}
                    {r.type ? ` · ${r.type}` : ""}
                  </option>
                ))}
              </select>
            </label>
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
              <input value={form.parentPhone} onChange={(e) => updateForm({ parentPhone: e.target.value })} placeholder="Parent phone" />
            </label>

            <label>
              <span>Parent Email</span>
              <input value={form.parentEmail} onChange={(e) => updateForm({ parentEmail: e.target.value })} placeholder="Parent email" />
            </label>

            <label className="wide">
              <span>Address</span>
              <textarea value={form.address} onChange={(e) => updateForm({ address: e.target.value })} placeholder="Student address" />
            </label>
          </div>
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
                    onChange={(e) => handleImageUpload("photo", e.target.files?.[0])}
                    hidden
                  />
                </label>

                <button type="button" className="ba-media-button secondary" onClick={() => openCameraForField("photo")}>
                  Take Photo
                </button>
              </div>
              <small className="ba-media-hint">Upload from files or take a quick camera photo. The image is optimized and saved as a media asset.</small>
              {form.photo && <img src={form.photo} alt="Student preview" className="ba-preview-photo" />}
            </label>

            <label>
              <span>Cover Photo</span>
              <div className="ba-media-actions">
                <label className="ba-media-button">
                  Upload Cover
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload("coverPhoto", e.target.files?.[0])}
                    hidden
                  />
                </label>

                <button type="button" className="ba-media-button secondary" onClick={() => openCameraForField("coverPhoto")}>
                  Take Photo
                </button>
              </div>
              <small className="ba-media-hint">Upload from files or use the camera. The cover is compressed separately so sync records stay small.</small>
              {form.coverPhoto && <img src={form.coverPhoto} alt="Student cover preview" className="ba-preview-banner" />}
            </label>
          </div>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Add Student"}
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
  const title = field === "photo" ? `Take ${entityLabel} Photo` : `Take ${entityLabel} Cover Photo`;

  return (
    <div className="ba-modal-backdrop camera-backdrop" role="dialog" aria-modal="true">
      <section className="ba-camera-modal">
        <div className="ba-modal-head">
          <div>
            <h2>{title}</h2>
            <p>Use the live camera preview, then capture. The image will still be compressed and saved as a media asset.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close camera">
            ✕
          </button>
        </div>

        <div className="ba-camera-preview">
          <video ref={videoRef} autoPlay muted playsInline />
          {starting && <span className="ba-camera-loading">Opening camera...</span>}
        </div>

        <div className="ba-camera-actions">
          <button
            type="button"
            className="ba-camera-secondary"
            onClick={() => setFacing(facing === "environment" ? "user" : "environment")}
            disabled={starting || capturing}
          >
            Switch Camera
          </button>
          <button type="button" className="ba-camera-secondary" onClick={close} disabled={capturing}>
            Cancel
          </button>
          <button type="button" className="ba-camera-primary" onClick={capture} disabled={starting || capturing}>
            {capturing ? "Capturing..." : "Capture Photo"}
          </button>
        </div>
      </section>
    </div>
  );
}

function groupedCounts(rows: StudentView[], keyFn: (item: StudentView) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = keyFn(r) || "Unknown";
    m.set(k, (m.get(k) || 0) + 1);
  });

  return Array.from(m.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
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
`;
