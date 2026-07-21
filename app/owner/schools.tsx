"use client";

/**
 * app/owner/schools.tsx
 * Eleeveon Owner Schools V2.
 * Account-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Rebuilt from the Branch Admin Students golden pattern:
 * - compact search strip, inline + add, slider filter, More sheet
 * - cards/table/analytics modes under More
 * - createLocal(...) for school creation
 * - updateLocal(...) for edits and status changes
 * - softDeleteLocal(...) for local soft delete
 * - listActiveLocal(...) for active branch lookup
 * - saveImageAsset(...) for logo/photo/banner image so large Base64 files stay out of school records
 * - logoMediaId/photoMediaId/bannerImageMediaId remain small references on the School row
 * - upload and camera capture share the same media pipeline
 * - unsaved uploads use ownerTempKey and are attached after create/update
 * - UI uses the same ba-* theme classes as Students for dark mode and local settings support
 *
 * Permanent-ID persistence fix:
 * - Treats School and Branch IDs as stable string UUIDs throughout the page.
 * - Verifies every create/update directly from Dexie before reporting success.
 * - Keeps media ownership and branch counts linked to the real school UUID.
 *
 * Workspace source fix:
 * - Resolves account/workspace from eleeveon_open_workspace first.
 * - Falls back to active membership, AccountContext, settings, then storage.
 * - Prevents stale owner school data after role/workspace switching.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveMembership } from "../context/active-membership-context";
import { db, type Branch, type School } from "../lib/db/db";
import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../lib/sync/syncUtils";
import {
  MediaOwners,
  MediaFieldKeys,
  attachCameraStreamToVideo,
  attachMediaAssetToOwner,
  captureImageFileFromVideo,
  createMediaSessionKey as createSharedMediaSessionKey,
  getCameraUnavailableMessage,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  isCameraApiAvailable,
  openCameraStream,
  revokeMediaObjectUrl,
  saveImageAsset,
  stopCameraStream,
  type CameraFacingMode,
} from "../lib/media/mediaAssetUtils";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type SchoolFilter = "all" | "active" | "inactive" | "no_contact" | "no_branch";
type CameraField = "logo" | "photo" | "bannerImage";

type TenantRow = {
  id?: number | string;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
};

type FormState = {
  id?: string;
  name: string;
  motto: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  logo: string;
  logoMediaId?: string;
  photo: string;
  photoMediaId?: string;
  bannerImage: string;
  bannerImageMediaId?: string;
  active: boolean;
};

type SchoolView = {
  id: string;
  row: School;
  branchCount: number;
  logoUrl?: string;
  photoUrl?: string;
  bannerImageUrl?: string;
  active: boolean;
};

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  openedAt?: number;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

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

const emptyForm: FormState = {
  name: "",
  motto: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  logo: "",
  logoMediaId: undefined,
  photo: "",
  photoMediaId: undefined,
  bannerImage: "",
  bannerImageMediaId: undefined,
  active: true,
};

const idOf = (value: unknown) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (v: any) => String(v || "").toLowerCase().trim();
const tableSafe = (name: string) => (db as any)[name];

const cleanText = (v: any) => String(v || "").trim();
const schoolName = (row?: Partial<School>) => cleanText((row as any)?.name) || "Unnamed school";
const isActiveSchool = (row: any) => !row?.isDeleted && row?.active !== false && !["deleted", "archived", "inactive"].includes(safeLower(row?.status));
const statusLabel = (active?: boolean) => (active === false ? "Inactive" : "Active");

function statusTone(active?: boolean): "green" | "red" | "blue" | "orange" | "gray" {
  return active === false ? "red" : "green";
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

const mediaKey = (schoolId: string, field: CameraField) => `schools:${schoolId}:${field}`;

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
};

const SCHOOL_MEDIA_OWNER_TABLE = (MediaOwners as any).SCHOOLS || (MediaOwners as any).SCHOOL || "schools";
const SCHOOL_MEDIA_ENTITY_LABEL = "School";
const SCHOOL_FIELD_KEYS: Record<CameraField, string> = {
  logo: (MediaFieldKeys as any).LOGO || "logo",
  photo: (MediaFieldKeys as any).PHOTO || "photo",
  bannerImage: (MediaFieldKeys as any).BANNER_IMAGE || (MediaFieldKeys as any).COVER_PHOTO || "bannerImage",
};

const createSchoolMediaSessionKey = () => createSharedMediaSessionKey(SCHOOL_MEDIA_OWNER_TABLE);

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

export default function OwnerSchoolsPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeMembership } = useActiveMembership() as any;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const selectedAccountId = useMemo(
    () =>
      cleanText(openWorkspace?.accountId) ||
      cleanText(openWorkspace?.membership?.accountId) ||
      cleanText(activeMembership?.accountId) ||
      cleanText(accountId) ||
      cleanText(settings?.accountId) ||
      cleanText(safeStorageRead("accountId")) ||
      cleanText(safeStorageRead("eleeveon_account_id")),
    [
      accountId,
      activeMembership?.accountId,
      openWorkspace?.accountId,
      openWorkspace?.membership?.accountId,
      settings?.accountId,
    ]
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<Record<string, string>>({});

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<SchoolFilter>("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SchoolView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const mediaSessionKeyRef = useRef(createSchoolMediaSessionKey());
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraField, setCameraField] = useState<CameraField>("logo");
  const [cameraFacing, setCameraFacing] = useState<CameraFacingMode>("environment");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraCapturing, setCameraCapturing] = useState(false);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !selectedAccountId) router.replace("/login");
  }, [accountLoading, authenticated, selectedAccountId, router]);

  const sameAccount = (row: TenantRow) => (!row.accountId || row.accountId === selectedAccountId) && !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast((c) => (c?.message === message ? null : c)), 4200);
  };

  const stopCurrentCamera = () => {
    stopCameraStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  };

  const requireAccount = () => {
    if (!authenticated || !selectedAccountId) {
      showToast("error", "Sign in before managing owner schools.");
      return false;
    }
    return true;
  };

  const openCameraForField = (field: CameraField) => {
    if (!requireAccount()) return;
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
        maxWidth: cameraField === "logo" ? 900 : 1440,
        maxHeight: cameraField === "logo" ? 900 : 900,
      });

      await handleImageUpload(cameraField, file);
      closeCamera();
    } catch (error: any) {
      console.error("Failed to capture school image:", error);
      showToast("error", error?.message || "Failed to capture photo.");
    } finally {
      setCameraCapturing(false);
    }
  };

  const clearData = () => {
    Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
    setRows([]);
    setBranches([]);
    setMediaPreviewUrls({});
  };

  const resolveSchoolMediaUrls = async (schoolRows: School[]) => {
    const next: Record<string, string> = {};

    await Promise.all(
      schoolRows.map(async (school: any) => {
        const schoolId = idOf(school.id);
        if (!schoolId) return;

        const resolveOwnedAssetUrl = async (field: CameraField, fallbackMediaId?: number | string | null) => {
          const ownedAsset = await getOwnerFieldMediaAsset({
            accountId: selectedAccountId || undefined,
            ownerTable: SCHOOL_MEDIA_OWNER_TABLE,
            ownerId: String(school.cloudId || school.id || schoolId),
            fieldKey: SCHOOL_FIELD_KEYS[field],
          });

          if (ownedAsset?.id) {
            const url = await getMediaObjectUrl(String(ownedAsset.id));
            if (url) return url;
          }

          const fallbackId = idOf(fallbackMediaId);
          if (!fallbackId) return "";

          const fallbackAsset = await tableSafe("mediaAssets")?.get?.(fallbackId);
          const belongsToThisSchool =
            fallbackAsset &&
            !fallbackAsset.isDeleted &&
            fallbackAsset.active !== false &&
            fallbackAsset.accountId === selectedAccountId &&
            fallbackAsset.ownerTable === SCHOOL_MEDIA_OWNER_TABLE &&
            fallbackAsset.fieldKey === SCHOOL_FIELD_KEYS[field] &&
            sameId(fallbackAsset.ownerLocalId, schoolId);

          if (!belongsToThisSchool) return "";
          return getMediaObjectUrl(String(fallbackId));
        };

        try {
          const logoUrl = await resolveOwnedAssetUrl("logo", school.logoMediaId);
          if (logoUrl) next[mediaKey(schoolId, "logo")] = logoUrl;

          const photoUrl = await resolveOwnedAssetUrl("photo", school.photoMediaId);
          if (photoUrl) next[mediaKey(schoolId, "photo")] = photoUrl;

          const bannerUrl = await resolveOwnedAssetUrl("bannerImage", school.bannerImageMediaId);
          if (bannerUrl) next[mediaKey(schoolId, "bannerImage")] = bannerUrl;
        } catch (error) {
          console.error("Failed to resolve school media:", schoolId, error);
        }
      })
    );

    setMediaPreviewUrls((current) => {
      Object.values(current).forEach((url) => {
        if (!Object.values(next).includes(url)) revokeMediaObjectUrl(url);
      });
      return next;
    });
  };

  const load = async () => {
    if (!authenticated || !selectedAccountId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [schoolRows, branchRows] = await Promise.all([
        tableSafe("schools")?.toArray?.() || [],
        listActiveLocal("branches", { accountId: selectedAccountId } as any),
      ]);

      const scopedSchools = (schoolRows as School[])
        .filter((r) => sameAccount(r as TenantRow))
        .sort((a: any, b: any) => schoolName(a).localeCompare(schoolName(b)));

      const schoolIds = new Set(scopedSchools.map((r: any) => idOf(r.id)).filter((id) => Boolean(id)));
      const scopedBranches = (branchRows as Branch[]).filter((r: any) => sameAccount(r) && schoolIds.has(idOf(r.schoolId)));

      setRows(scopedSchools);
      setBranches(scopedBranches);
      await resolveSchoolMediaUrls(scopedSchools);
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load owner schools.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    selectedAccountId,
    accountLoading,
    settingsLoading,
    activeMembership?.role,
    activeMembership?.accountId,
    openWorkspace?.openedAt,
    openWorkspace?.membershipId,
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

        const stream = await openCameraStream({ facingMode: cameraFacing, width: 1280, height: 720 });
        if (cancelled) {
          stopCameraStream(stream);
          return;
        }

        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) await attachCameraStreamToVideo(cameraVideoRef.current, stream);
      } catch (error: any) {
        console.error("Failed to open school camera:", error);
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

  const branchCountMap = useMemo(() => {
    const m = new Map<string, number>();
    branches.forEach((branch: any) => {
      const sid = idOf(branch.schoolId);
      if (!sid) return;
      m.set(sid, (m.get(sid) || 0) + 1);
    });
    return m;
  }, [branches]);

  const viewRows = useMemo<SchoolView[]>(
    () =>
      rows.map((row: any) => {
        const id = idOf(row.id);
        return {
          id,
          row,
          branchCount: branchCountMap.get(id) || 0,
          logoUrl: mediaPreviewUrls[mediaKey(id, "logo")] || safeRecordMediaValue(row.logo),
          photoUrl: mediaPreviewUrls[mediaKey(id, "photo")] || safeRecordMediaValue(row.photo),
          bannerImageUrl: mediaPreviewUrls[mediaKey(id, "bannerImage")] || safeRecordMediaValue(row.bannerImage),
          active: isActiveSchool(row),
        };
      }),
    [branchCountMap, mediaPreviewUrls, rows]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row: any = item.row;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "no_contact" && (row.phone || row.email)) return false;
        if (filterStatus === "no_branch" && item.branchCount > 0) return false;
        if (!q) return true;

        return `${row.name || ""} ${row.motto || ""} ${row.phone || ""} ${row.email || ""} ${row.address || ""} ${row.website || ""}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => schoolName(a.row).localeCompare(schoolName(b.row)));
  }, [filterStatus, search, viewRows]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      branches: branches.length,
      active: rows.filter((r: any) => r.active !== false && !r.isDeleted).length,
      inactive: rows.filter((r: any) => r.active === false && !r.isDeleted).length,
      noContact: rows.filter((r: any) => !r.phone && !r.email).length,
      noBranch: viewRows.filter((r) => !r.branchCount).length,
      showing: filteredRows.length,
    }),
    [branches.length, filteredRows.length, rows, viewRows]
  );

  const activeFilterCount = useMemo(() => (filterStatus === "all" ? 0 : 1), [filterStatus]);
  const countsByStatus = useMemo(() => groupedCounts(viewRows, (i) => statusLabel((i.row as any).active)), [viewRows]);
  const countsByBranchCoverage = useMemo(() => groupedCounts(viewRows, (i) => (i.branchCount ? "Has branches" : "No branch")), [viewRows]);
  const countsByContact = useMemo(() => groupedCounts(viewRows, (i) => ((i.row as any).phone || (i.row as any).email ? "Contact ready" : "No contact")), [viewRows]);

  const updateForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const handleImageUpload = async (field: CameraField, file?: File) => {
    if (!file) return;
    if (!requireAccount()) return;

    try {
      const ownerTempKey = form.id ? undefined : mediaSessionKeyRef.current;
      const result = await saveImageAsset(file, {
        accountId: selectedAccountId!,
        schoolId: form.id || undefined,
        branchId: undefined,
        ownerTable: SCHOOL_MEDIA_OWNER_TABLE,
        ownerId: form.id ? String(form.id) : undefined,
        ownerTempKey,
        fieldKey: SCHOOL_FIELD_KEYS[field],
        variant: field === "logo" ? "avatar" : field === "bannerImage" ? "cover" : "image",
        replaceExisting: true,
      } as any);

      updateForm({
        [field]: result.previewUrl,
        [`${field}MediaId`]: result.assetId,
      } as Partial<FormState>);

      const label = field === "logo" ? "School logo" : field === "photo" ? "School photo" : "School banner";
      showToast("success", `${label} optimized.`);
    } catch (error: any) {
      console.error("Failed to process school image:", error);
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const openCreate = () => {
    if (!requireAccount()) return;
    mediaSessionKeyRef.current = createSchoolMediaSessionKey();
    setSelectedItem(null);
    setForm({ ...emptyForm, active: filterStatus === "inactive" ? false : true });
    setModalOpen(true);
  };

  const openEdit = (row: School) => {
    const s: any = row;
    const id = idOf(s.id);
    mediaSessionKeyRef.current = createSchoolMediaSessionKey();
    setSelectedItem(null);
    setForm({
      id,
      name: s.name || "",
      motto: s.motto || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      website: s.website || "",
      logo: mediaPreviewUrls[mediaKey(id, "logo")] || safeRecordMediaValue(s.logo) || "",
      logoMediaId: s.logoMediaId ? String(s.logoMediaId) : undefined,
      photo: mediaPreviewUrls[mediaKey(id, "photo")] || safeRecordMediaValue(s.photo) || "",
      photoMediaId: s.photoMediaId ? String(s.photoMediaId) : undefined,
      bannerImage: mediaPreviewUrls[mediaKey(id, "bannerImage")] || safeRecordMediaValue(s.bannerImage) || "",
      bannerImageMediaId: s.bannerImageMediaId ? String(s.bannerImageMediaId) : undefined,
      active: s.active !== false,
    });
    setModalOpen(true);
  };

  const clearFilters = () => setFilterStatus("all");

  const validate = () => {
    if (!authenticated || !selectedAccountId) return "Sign in first.";
    if (!form.name.trim()) return "Enter school name.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return cleanText(row.name).toLowerCase() === cleanText(form.name).toLowerCase() && !row.isDeleted;
    });

    if (duplicate) return "A school with this name already exists on this account.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid school email.";
    if (form.website.trim() && !/^https?:\/\/.+/i.test(form.website.trim()) && !/^www\..+/i.test(form.website.trim())) {
      return "Website should begin with https://, http://, or www.";
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

    if (!authenticated || !selectedAccountId) return;

    try {
      setSaving(true);
      const existing = form.id ? rows.find((row: any) => sameId(row.id, form.id)) : undefined;
      const payload: Partial<School> = {
        accountId: selectedAccountId,
        name: form.name.trim(),
        motto: form.motto.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        website: form.website.trim() || undefined,
        logo: safeRecordMediaValue(form.logo),
        logoMediaId: form.logoMediaId || undefined,
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue(form.bannerImage),
        bannerImageMediaId: form.bannerImageMediaId || undefined,
        active: form.active,
        isDeleted: false,
      } as Partial<School>;

      const savedSchool =
        form.id && existing
          ? await updateLocal("schools", form.id, payload)
          : await createLocal("schools", payload as School);

      const savedSchoolId = idOf((savedSchool as any)?.id || form.id);

      if (!savedSchoolId) {
        throw new Error("The school record was written without a valid permanent ID.");
      }

      const persistedSchool = await tableSafe("schools")?.get?.(savedSchoolId);

      if (!persistedSchool || persistedSchool.isDeleted) {
        throw new Error("The school could not be verified in local storage after saving.");
      }

      if (cleanText(persistedSchool.accountId) !== selectedAccountId) {
        throw new Error("The school was saved under the wrong account workspace.");
      }

      await Promise.all(
        [
          { id: form.logoMediaId, field: "logo" as CameraField },
          { id: form.photoMediaId, field: "photo" as CameraField },
          { id: form.bannerImageMediaId, field: "bannerImage" as CameraField },
        ]
          .filter((asset) => Boolean(asset.id))
          .map((asset) =>
            attachMediaAssetToOwner({
              assetId: String(asset.id),
              ownerTable: SCHOOL_MEDIA_OWNER_TABLE,
              ownerId: savedSchoolId,
              ownerTempKey: mediaSessionKeyRef.current,
              fieldKey: SCHOOL_FIELD_KEYS[asset.field],
            })
          )
      );

      mediaSessionKeyRef.current = createSchoolMediaSessionKey();
      setModalOpen(false);
      await load();
      showToast("success", form.id ? "School changes saved." : "School created and saved locally.");
    } catch (error: any) {
      console.error("Failed to save school:", error);
      showToast("error", error?.message || "Failed to save school.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: SchoolView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;

    const ok = window.confirm(
      item.branchCount
        ? `"${schoolName(item.row)}" has ${item.branchCount} branch record(s). Delete anyway?`
        : `Delete "${schoolName(item.row)}"?`
    );

    if (!ok) return;
    await softDeleteLocal("schools", String(id));
    setSelectedItem(null);
    showToast("success", "School deleted.");
    await load();
  };

  const setActive = async (item: SchoolView, active: boolean) => {
    const id = idOf((item.row as any).id);
    if (!id) return;

    await updateLocal("schools", String(id), { active, isDeleted: false } as Partial<School>);
    setSelectedItem(null);
    showToast("success", active ? "School activated." : "School deactivated.");
    await load();
  };

  if (accountLoading || settingsLoading || loading) {
    return <State primary={primary} title="Opening Schools..." text="Checking owner account, local school records, branch coverage, and media assets." />;
  }

  if (!authenticated || !selectedAccountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing owner schools." />;
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      )}

      <section className="ba-search-card" aria-label="School search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search schools..." aria-label="Search schools" />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Add school">+</button>

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

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          <button type="button" onClick={() => setFilterStatus("all")}>Filter: {filterTitle(filterStatus)} ×</button>
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="Schools by Status" rows={countsByStatus} total={summary.total} />
          <AnalysisCard title="Branch Coverage" rows={countsByBranchCoverage} total={summary.total} />
          <AnalysisCard title="Contact Readiness" rows={countsByContact} total={summary.total} />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>{summary.branches} branch record(s) connected across {summary.total} owner school(s).</p>
          </article>
        </section>
      )}

      {viewMode === "table" && <TableView rows={filteredRows} openEdit={openEdit} remove={remove} setActive={setActive} />}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <SchoolListItem key={String(item.id)} item={item} primary={primary} onOpen={() => setSelectedItem(item)} />
          ))}

          {!filteredRows.length && (
            <Empty icon="🏫" title="No schools found" text="Add owner school records, connect logo and banner images, then create branches under each school." />
          )}
        </section>
      )}

      {filterOpen && <FilterSheet filterStatus={filterStatus} setFilterStatus={setFilterStatus} clearFilters={clearFilters} onClose={() => setFilterOpen(false)} />}

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

      {selectedItem && <ActionSheet item={selectedItem} openEdit={openEdit} remove={remove} setActive={setActive} onClose={() => setSelectedItem(null)} />}

      {modalOpen && (
        <SchoolModal
          form={form}
          saving={saving}
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
          entityLabel={SCHOOL_MEDIA_ENTITY_LABEL}
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

function SchoolListItem({ item, primary, onOpen }: { item: SchoolView; primary: string; onOpen: () => void }) {
  const row: any = item.row;
  const image = item.logoUrl || item.photoUrl;

  return (
    <button type="button" className="student-row" onClick={onOpen}>
      <Avatar name={schoolName(row)} photo={image} primary={primary} />
      <span className="student-main">
        <strong>{schoolName(row)}</strong>
        <small>{item.branchCount} branch{item.branchCount === 1 ? "" : "es"}{row.motto ? ` · ${row.motto}` : ""}</small>
        <em>{row.phone || row.email || row.address || "No contact details yet"}</em>
      </span>
      <span className="student-side">
        <span className={`status-dot-mini ${statusTone(row.active)}`} title={statusLabel(row.active)} aria-label={statusLabel(row.active)} />
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

function filterTitle(filter: SchoolFilter) {
  if (filter === "active") return "Active only";
  if (filter === "inactive") return "Inactive only";
  if (filter === "no_contact") return "Missing contact";
  if (filter === "no_branch") return "No branch";
  return "All schools";
}

function FilterSheet({
  filterStatus,
  setFilterStatus,
  clearFilters,
  onClose,
}: {
  filterStatus: SchoolFilter;
  setFilterStatus: (value: SchoolFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  const options: { value: SchoolFilter; label: string; note: string }[] = [
    { value: "all", label: "All schools", note: "Show every owner school record" },
    { value: "active", label: "Active only", note: "Schools currently enabled" },
    { value: "inactive", label: "Inactive only", note: "Schools disabled for daily use" },
    { value: "no_contact", label: "Missing contact", note: "Schools without phone or email" },
    { value: "no_branch", label: "No branch", note: "Schools that still need branch setup" },
  ];

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Keep the owner school register compact and focused.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-menu-list">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filterStatus === option.value ? "active" : ""}
              onClick={() => setFilterStatus(option.value)}
            >
              <span>{filterStatus === option.value ? "✓" : "⌁"}</span>
              <b>{option.label}</b>
              <small>{option.note}</small>
            </button>
          ))}
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>Clear</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
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
            <p>Switch views or reload the local owner school register.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close more options">✕</button>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            <span>▦</span>
            <b>Cards</b>
            <small>Compact school register</small>
          </button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span>
            <b>Table view</b>
            <small>Dense laptop-friendly owner records</small>
          </button>
          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>
            <span>◔</span>
            <b>Analytics</b>
            <small>Status, contact and branch coverage</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local schools and branches</small>
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
  setActive,
  onClose,
}: {
  item: SchoolView;
  openEdit: (row: School) => void;
  remove: (item: SchoolView) => void;
  setActive: (item: SchoolView, active: boolean) => void;
  onClose: () => void;
}) {
  const row: any = item.row;

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{schoolName(row)}</h2>
            <p>{item.branchCount} branch{item.branchCount === 1 ? "" : "es"} · {statusLabel(row.active)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close school actions">✕</button>
        </div>

        <div className="student-detail-strip">
          <span><b>Contact</b>{row.phone || row.email || "Not set"}</span>
          <span><b>Website</b>{row.website || "Not set"}</span>
          <span><b>Updated</b>{timeText(row.updatedAt || row.createdAt)}</span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item.row)}>
            <span>✎</span>
            <b>Edit school</b>
            <small>Update profile, contact, logo and banner</small>
          </button>

          {row.active === false ? (
            <button type="button" onClick={() => setActive(item, true)}>
              <span>✓</span>
              <b>Activate</b>
              <small>Enable this school for account operations</small>
            </button>
          ) : (
            <button type="button" onClick={() => setActive(item, false)}>
              <span>⏸</span>
              <b>Deactivate</b>
              <small>Keep the record but disable daily use</small>
            </button>
          )}

          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this school locally</small>
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
  setActive,
}: {
  rows: SchoolView[];
  openEdit: (row: School) => void;
  remove: (item: SchoolView) => void;
  setActive: (item: SchoolView, active: boolean) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Schools ({rows.length})</th>
              <th>Contact</th>
              <th>Website</th>
              <th>Branches</th>
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
                  <td><strong>{schoolName(row)}</strong><span>{row.motto || row.address || "No motto/address"}</span></td>
                  <td>{row.phone || row.email || "—"}</td>
                  <td>{row.website || "—"}</td>
                  <td><Chip tone={item.branchCount ? "green" : "orange"}>{item.branchCount}</Chip></td>
                  <td><Chip tone={statusTone(row.active)}>{statusLabel(row.active)}</Chip></td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item.row)}>Edit</button>
                      <button type="button" onClick={() => setActive(item, row.active === false)}> {row.active === false ? "Activate" : "Deactivate"}</button>
                      <button type="button" className="ba-delete" onClick={() => remove(item)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="ba-empty-table">No school matches your filters.</div>}
      </div>
    </section>
  );
}

function SchoolModal({
  form,
  saving,
  setModalOpen,
  updateForm,
  handleImageUpload,
  openCameraForField,
  save,
}: {
  form: FormState;
  saving: boolean;
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
            <h2>{form.id ? "Edit School" : "Add School"}</h2>
            <p>School is saved locally first and syncs through your normal sync pipeline.</p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close school form">✕</button>
        </div>

        <section className="ba-form-section">
          <h3>School Profile</h3>
          <div className="ba-form">
            <label className="wide"><span>School Name</span><input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} placeholder="School name" /></label>
            <label className="wide"><span>Motto</span><input value={form.motto} onChange={(e) => updateForm({ motto: e.target.value })} placeholder="School motto" /></label>
            <label><span>Phone</span><input value={form.phone} onChange={(e) => updateForm({ phone: e.target.value })} placeholder="Phone" /></label>
            <label><span>Email</span><input value={form.email} onChange={(e) => updateForm({ email: e.target.value })} placeholder="Email" /></label>
            <label className="wide"><span>Website</span><input value={form.website} onChange={(e) => updateForm({ website: e.target.value })} placeholder="https://example.com" /></label>
            <label className="wide"><span>Address</span><textarea value={form.address} onChange={(e) => updateForm({ address: e.target.value })} placeholder="School address" /></label>
            <label>
              <span>Status</span>
              <select value={form.active ? "active" : "inactive"} onChange={(e) => updateForm({ active: e.target.value === "active" })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Images</h3>
          <div className="ba-form">
            <MediaInput title="Logo" field="logo" preview={form.logo} handleImageUpload={handleImageUpload} openCameraForField={openCameraForField} />
            <MediaInput title="School Photo" field="photo" preview={form.photo} handleImageUpload={handleImageUpload} openCameraForField={openCameraForField} />
            <MediaInput title="Banner Image" field="bannerImage" preview={form.bannerImage} banner handleImageUpload={handleImageUpload} openCameraForField={openCameraForField} />
          </div>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : form.id ? "Save Changes" : "Add School"}</button>
        </div>
      </form>
    </div>
  );
}

function MediaInput({
  title,
  field,
  preview,
  banner = false,
  handleImageUpload,
  openCameraForField,
}: {
  title: string;
  field: CameraField;
  preview?: string;
  banner?: boolean;
  handleImageUpload: (field: CameraField, file?: File) => void | Promise<void>;
  openCameraForField: (field: CameraField) => void;
}) {
  return (
    <label className={banner ? "wide" : undefined}>
      <span>{title}</span>
      <div className="ba-media-actions">
        <label className="ba-media-button">
          Upload
          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(field, e.target.files?.[0])} hidden />
        </label>
        <button type="button" className="ba-media-button secondary" onClick={() => openCameraForField(field)}>Take Photo</button>
      </div>
      <small className="ba-media-hint">Upload from files or take a camera photo. It is optimized and saved as a media asset.</small>
      {preview && <img src={preview} alt={`${title} preview`} className={banner ? "ba-preview-banner" : "ba-preview-photo"} />}
    </label>
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
  const title = field === "logo" ? `Take ${entityLabel} Logo` : field === "bannerImage" ? `Take ${entityLabel} Banner` : `Take ${entityLabel} Photo`;

  return (
    <div className="ba-modal-backdrop camera-backdrop" role="dialog" aria-modal="true">
      <section className="ba-camera-modal">
        <div className="ba-modal-head">
          <div>
            <h2>{title}</h2>
            <p>Use the live camera preview, then capture. The image will be compressed and saved as a media asset.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close camera">✕</button>
        </div>

        <div className="ba-camera-preview">
          <video ref={videoRef} autoPlay muted playsInline />
          {starting && <span className="ba-camera-loading">Opening camera...</span>}
        </div>

        <div className="ba-camera-actions">
          <button type="button" className="ba-camera-secondary" onClick={() => setFacing(facing === "environment" ? "user" : "environment")} disabled={starting || capturing}>Switch Camera</button>
          <button type="button" className="ba-camera-secondary" onClick={close} disabled={capturing}>Cancel</button>
          <button type="button" className="ba-camera-primary" onClick={capture} disabled={starting || capturing}>{capturing ? "Capturing..." : "Capture Photo"}</button>
        </div>
      </section>
    </div>
  );
}

function groupedCounts(rows: SchoolView[], keyFn: (item: SchoolView) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = keyFn(r) || "Unknown";
    m.set(k, (m.get(k) || 0) + 1);
  });
  return Array.from(m.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{total}</strong>
      <div className="ba-analysis-list">
        {rows.map((row) => {
          const percent = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <section key={row.label}>
              <div><b>{row.label}</b><small>{row.value}</small></div>
              <div className="ba-progress"><i style={{ width: `${percent}%` }} /></div>
            </section>
          );
        })}
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
  width: 100%; min-height: 44px; border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px; padding: 0 12px; background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827)); outline: none; font-weight: 750;
}
.ba-page input:focus, .ba-page select:focus, .ba-page textarea:focus {
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}
.ba-state, .ba-search-card, .ba-card, .ba-table-card, .ba-analysis, .ba-empty, .ba-sheet, .ba-modal, .student-row {
  background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); box-shadow: 0 12px 28px rgba(15,23,42,.045);
}
.ba-state { min-height: min(420px, calc(100dvh - 32px)); width: min(520px, 100%); margin: 0 auto; display: grid; place-items: center; align-content: center; gap: 10px; padding: 22px; border-radius: 28px; text-align: center; }
.ba-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent); border-top-color: var(--ba-primary); animation: spin .8s linear infinite; }
.ba-state h2 { margin: 0; font-size: 22px; font-weight: 1000; letter-spacing: -.04em; }
.ba-state p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.ba-toast { position: sticky; top: 8px; z-index: 40; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; padding: 12px 14px; border-radius: 18px; font-size: 13px; font-weight: 850; box-shadow: 0 18px 40px rgba(15,23,42,.12); }
.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; } .ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; } .ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }
.ba-toast button { border: 0; background: transparent; color: currentColor; font-weight: 1000; cursor: pointer; }
.ba-icon-button, .ba-filter-button, .ba-add-inline { width: 42px; height: 42px; border: 1px solid var(--border, rgba(0,0,0,.10)); border-radius: 999px; display: grid; place-items: center; background: var(--card-bg, var(--surface,#fff)); color: var(--text,#111827); font-size: 18px; font-weight: 1000; cursor: pointer; box-shadow: 0 10px 22px rgba(15,23,42,.045); }
.ba-add-inline { flex: 0 0 42px; border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; font-size: 25px; line-height: 1; box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent); }
.ba-search-card { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 8px; align-items: center; margin-top: 2px; padding: 8px; border-radius: 24px; }
.ba-search { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; min-height: 44px; padding: 0 11px; border-radius: 18px; background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent); }
.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input { min-height: 42px; border: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 14px; }
.ba-slider-icon { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.ba-filter-button { position: relative; background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff)); color: var(--ba-primary); }
.ba-filter-button.active { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-filter-button b { position: absolute; top: -4px; right: -4px; min-width: 19px; height: 19px; display: grid; place-items: center; border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; border: 2px solid var(--card-bg,#fff); }
.ba-filter-chips { display: flex; gap: 7px; overflow-x: auto; padding: 8px 1px 0; scrollbar-width: none; -ms-overflow-style: none; }
.ba-filter-chips::-webkit-scrollbar { display: none; }
.ba-filter-chips button { flex: 0 0 auto; min-height: 31px; border: 0; border-radius: 999px; padding: 0 10px; background: color-mix(in srgb, var(--ba-primary) 11%, transparent); color: var(--ba-primary); font-size: 11px; font-weight: 950; white-space: nowrap; cursor: pointer; }
.ba-list { display: grid; gap: 7px; margin-top: 10px; }
.student-row { width: 100%; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 10px; border-radius: 22px; text-align: left; cursor: pointer; transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease); }
.student-row:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10))); box-shadow: 0 16px 34px rgba(15,23,42,.07); }
.ba-avatar { width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; color: #fff; font-size: 17px; font-weight: 1000; box-shadow: 0 12px 24px rgba(15,23,42,.12); }
.student-main, .student-main strong, .student-main small, .student-main em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.student-main strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.02em; }
.student-main small { margin-top: 3px; color: var(--muted,#64748b); font-size: 12px; font-weight: 850; font-style: normal; }
.student-main em { margin-top: 3px; color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827)); font-size: 11px; font-weight: 750; font-style: normal; }
.student-side { display: grid; justify-items: end; gap: 6px; flex: 0 0 auto; }
.student-side i { color: var(--muted,#64748b); font-style: normal; font-size: 18px; font-weight: 1000; line-height: 1; }
.ba-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; }
.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; } .ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; } .ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; } .ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); } .ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; } .ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.status-dot-mini { width: 10px; height: 10px; display: inline-block; border-radius: 999px; background: var(--muted,#64748b); box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent); }
.status-dot-mini.green { background: #22c55e; } .status-dot-mini.red { background: #ef4444; } .status-dot-mini.blue { background: #3b82f6; } .status-dot-mini.orange { background: #f59e0b; } .status-dot-mini.gray { background: var(--muted,#64748b); }
.ba-sheet-backdrop, .ba-modal-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; padding: 10px; background: rgba(15,23,42,.50); backdrop-filter: blur(12px); }
.ba-sheet { width: min(760px, 100%); max-height: min(88dvh, 760px); overflow-y: auto; padding: 14px; border-radius: 28px 28px 22px 22px; box-shadow: 0 30px 90px rgba(15,23,42,.32); animation: sheetIn .18s var(--ease); }
.ba-sheet.small { width: min(520px, 100%); }
@keyframes sheetIn { from { transform: translateY(16px); opacity: .7; } to { transform: translateY(0); opacity: 1; } }
.ba-sheet-head, .ba-sheet-profile, .ba-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; }
.ba-sheet-head h2, .ba-sheet-profile h2, .ba-modal-head h2 { margin: 0; color: var(--text,#111827); font-size: 21px; font-weight: 1000; letter-spacing: -.05em; }
.ba-sheet-head p, .ba-sheet-profile p, .ba-modal-head p { margin: 5px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; font-weight: 750; }
.ba-sheet-head button, .ba-sheet-profile button, .ba-modal-head button { width: 38px; height: 38px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; background: var(--surface,#fff); color: var(--text,#111827); font-weight: 1000; cursor: pointer; flex: 0 0 auto; }
.ba-sheet-actions, .ba-modal-actions { position: sticky; bottom: -14px; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding: 12px 0 2px; background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent); }
.ba-sheet-actions button, .ba-modal-actions button { min-height: 42px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 16px; background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); color: var(--text,#111827); font-size: 12px; font-weight: 950; cursor: pointer; }
.ba-sheet-actions button.primary, .ba-modal-actions button:last-child { border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent); }
.ba-modal-actions button:disabled { opacity: .65; cursor: not-allowed; }
.ba-menu-list { display: grid; gap: 8px; }
.ba-menu-list button { width: 100%; display: grid; grid-template-columns: 42px minmax(0,1fr); column-gap: 10px; align-items: center; min-height: 58px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 18px; padding: 9px; background: var(--surface,#fff); color: var(--text,#111827); text-align: left; cursor: pointer; }
.ba-menu-list button span { grid-row: span 2; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 16px; background: color-mix(in srgb, var(--ba-primary) 10%, transparent); color: var(--ba-primary); font-weight: 1000; }
.ba-menu-list button b, .ba-menu-list button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-menu-list button b { font-size: 13px; font-weight: 1000; } .ba-menu-list button small { margin-top: 2px; color: var(--muted,#64748b); font-size: 11px; font-weight: 750; }
.ba-menu-list button.active { border-color: color-mix(in srgb, var(--ba-primary) 34%, var(--border,rgba(0,0,0,.10))); background: color-mix(in srgb, var(--ba-primary) 8%, var(--surface,#fff)); }
.ba-menu-list button.danger span { background: color-mix(in srgb, #dc2626 10%, transparent); color: #dc2626; } .ba-menu-list button.danger b { color: #991b1b; }
.student-detail-strip { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 7px; margin-bottom: 10px; }
.student-detail-strip span { display: block; padding: 9px; border-radius: 16px; background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent); color: var(--muted,#64748b); font-size: 11px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.student-detail-strip b { display: block; margin-bottom: 3px; color: var(--text,#111827); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
.ba-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; } .ba-form.two { grid-template-columns: minmax(0,1fr); } .ba-form.compact { gap: 9px; }
.ba-form label { display: grid; gap: 6px; min-width: 0; } .ba-form span { color: var(--muted,#64748b); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.ba-media-hint { color: var(--muted,#64748b); font-size: 11px; font-weight: 750; line-height: 1.4; }
.ba-form .wide { grid-column: 1 / -1; }
.ba-form-section { padding: 12px 0; border-top: 1px solid var(--border,rgba(0,0,0,.08)); } .ba-form-section:first-of-type { border-top: 0; padding-top: 0; }
.ba-form-section h3 { margin: 0 0 10px; color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.03em; }
.ba-page textarea { min-height: 92px; padding: 12px; resize: vertical; line-height: 1.55; }
.ba-media-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.ba-media-button { min-height: 40px; border: 1px solid var(--ba-primary); border-radius: 999px; padding: 0 14px; display: inline-flex; align-items: center; justify-content: center; background: var(--ba-primary); color: #fff !important; font-size: 12px; font-weight: 950; letter-spacing: 0 !important; text-transform: none !important; cursor: pointer; text-align: center; box-shadow: 0 12px 26px color-mix(in srgb, var(--ba-primary) 18%, transparent); }
.ba-media-button.secondary { background: var(--surface, #fff); color: var(--ba-primary) !important; box-shadow: none; }
.ba-media-button input { display: none; }
.ba-preview-photo { width: 96px; height: 96px; object-fit: cover; border-radius: 22px; border: 1px solid var(--border,rgba(0,0,0,.10)); }
.ba-preview-banner { width: 100%; height: 130px; object-fit: cover; border-radius: 22px; border: 1px solid var(--border,rgba(0,0,0,.10)); }
.ba-modal { width: min(980px, 100%); max-height: min(92dvh, 900px); overflow-y: auto; padding: 14px; border-radius: 28px; box-shadow: 0 30px 90px rgba(15,23,42,.35); }
.ba-analysis-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 10px; margin-top: 10px; }
.ba-analysis, .ba-table-card, .ba-empty { padding: 13px; border-radius: 24px; }
.ba-analysis span { color: var(--muted,#64748b); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .08em; }
.ba-analysis strong { display: block; margin-top: 8px; font-size: clamp(22px,7vw,30px); line-height: 1; font-weight: 1000; letter-spacing: -.06em; overflow-wrap: anywhere; }
.ba-analysis p { margin: 8px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; }
.ba-analysis-list { display: grid; gap: 10px; margin-top: 12px; }
.ba-analysis-list section { display: grid; gap: 6px; padding: 10px; border-radius: 16px; background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent); }
.ba-analysis-list section > div:first-child { display: flex; justify-content: space-between; gap: 10px; }
.ba-analysis-list b, .ba-analysis-list small { font-size: 12px; } .ba-analysis-list small { color: var(--muted,#64748b); font-weight: 850; }
.ba-progress { height: 8px; border-radius: 999px; background: color-mix(in srgb,var(--muted,#64748b) 18%,transparent); overflow: hidden; } .ba-progress i { display: block; height: 100%; border-radius: inherit; background: var(--ba-primary); }
.ba-empty { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 220px; text-align: center; border-style: dashed; }
.ba-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)); font-size: 28px; }
.ba-empty h3 { margin: 0; font-size: 18px; font-weight: 1000; } .ba-empty p { margin: 0; color: var(--muted,#64748b); font-size: 13px; line-height: 1.6; }
.ba-table-card { margin-top: 10px; } .ba-table-scroll { width: 100%; max-width: 100%; overflow-x: auto; border-radius: 18px; border: 1px solid var(--border,rgba(0,0,0,.08)); }
.ba-table-scroll table { width: 100%; min-width: 920px; border-collapse: collapse; background: var(--card-bg, var(--surface, var(--bg, transparent))); }
.ba-table-scroll th, .ba-table-scroll td { padding: 10px; border-bottom: 1px solid var(--border,rgba(0,0,0,.08)); vertical-align: top; text-align: left; font-size: 13px; }
.ba-table-scroll th { background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent))))); color: var(--table-header-text, var(--muted, var(--text))); font-size: 11px; font-weight: 1000; text-transform: uppercase; letter-spacing: .07em; }
.ba-table-scroll td strong, .ba-table-scroll td span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ba-table-scroll td span { margin-top: 3px; color: var(--muted,#64748b); font-size: 11px; }
.ba-table-actions { display: flex; flex-wrap: nowrap; gap: 7px; width: 100%; max-width: 100%; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; } .ba-table-actions::-webkit-scrollbar { display: none; }
.ba-table-actions button { flex: 0 0 auto; min-height: 34px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 10px; background: var(--surface,#fff); color: var(--text,#111827); font-size: 11px; font-weight: 950; cursor: pointer; white-space: nowrap; }
.ba-table-actions button:first-child { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-delete, .ba-table-actions button.ba-delete { color: #991b1b; background: color-mix(in srgb,#dc2626 7%,var(--surface,#fff)); border-color: color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10))); }
.ba-empty-table { padding: 22px; text-align: center; color: var(--muted,#64748b); font-weight: 850; }
.camera-backdrop { z-index: 100; place-items: center; }
.ba-camera-modal { width: min(720px, 100%); max-height: min(92dvh, 880px); overflow-y: auto; padding: 14px; border-radius: 28px; background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); box-shadow: 0 30px 90px rgba(15,23,42,.35); }
.ba-camera-preview { position: relative; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 24px; background: #020617; border: 1px solid var(--border, rgba(0,0,0,.10)); }
.ba-camera-preview video { width: 100%; height: 100%; display: block; object-fit: cover; background: #020617; }
.ba-camera-loading { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(2,6,23,.72); color: #fff; font-size: 13px; font-weight: 950; }
.ba-camera-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.ba-camera-actions button { min-height: 42px; border-radius: 999px; padding: 0 14px; font-size: 12px; font-weight: 950; cursor: pointer; }
.ba-camera-secondary { border: 1px solid var(--border, rgba(0,0,0,.10)); background: color-mix(in srgb, var(--muted, #64748b) 8%, var(--surface, #fff)); color: var(--text, #111827); }
.ba-camera-primary { border: 1px solid var(--ba-primary); background: var(--ba-primary); color: #fff; box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent); }
.ba-camera-actions button:disabled { opacity: .62; cursor: not-allowed; }
@media (min-width: 680px) { .ba-page { padding: calc(12px * var(--local-density-scale,1)); padding-bottom: 44px; } .ba-search-card { grid-template-columns: minmax(0,1fr) 48px 48px 48px; } .ba-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .student-row { border-radius: 24px; padding: 12px; } .ba-analysis-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } .ba-form { grid-template-columns: repeat(2, minmax(0,1fr)); } .ba-modal-backdrop, .ba-sheet-backdrop { place-items: center; padding: 18px; } .ba-sheet { border-radius: 28px; padding: 18px; } .ba-modal { padding: 18px; } }
@media (min-width: 1040px) { .ba-page { padding: calc(16px * var(--local-density-scale,1)); padding-bottom: 48px; } .ba-search-card, .ba-list, .ba-analysis-grid, .ba-table-card, .ba-filter-chips { max-width: 1180px; margin-left: auto; margin-right: auto; } .ba-list { grid-template-columns: repeat(3, minmax(0, 1fr)); } .ba-analysis-grid { grid-template-columns: repeat(4, minmax(0,1fr)); } .ba-current-filter { grid-column: span 2; } .ba-form { grid-template-columns: repeat(3, minmax(0,1fr)); } }
@media (max-width: 520px) { .ba-page { padding: calc(7px * var(--local-density-scale,1)); padding-bottom: max(38px, env(safe-area-inset-bottom)); } .ba-icon-button, .ba-filter-button, .ba-add-inline { width: 40px; height: 40px; } .student-detail-strip { grid-template-columns: minmax(0,1fr); } .ba-sheet, .ba-modal { border-radius: 24px 24px 18px 18px; padding: 12px; } .ba-sheet-actions, .ba-modal-actions { display: grid; grid-template-columns: minmax(0,1fr); } .ba-sheet-actions button, .ba-modal-actions button { width: 100%; } .ba-media-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .ba-media-button, .ba-camera-actions button { width: 100%; } .ba-camera-actions { display: grid; grid-template-columns: minmax(0, 1fr); } .ba-camera-modal { border-radius: 22px; padding: 11px; } }
`;