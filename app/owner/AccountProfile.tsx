"use client";

/**
 * app/owner/modules/AccountProfile.tsx
 * Eleeveon Account Profile V4.
 *
 * Drop-in replacement for the previous AccountProfile.tsx.
 * Existing account media, defaults, sync, protected billing and mobile-first
 * behavior are preserved. The owner identity now follows Eleeveon's actual
 * model: Account is the owner/customer record and the owner is also an AppUser
 * for authentication. Owner email and phone are synchronized across both.
 *
 * Backend contracts used:
 * - GET/PATCH /accounts/me                    -> Account workspace
 * - GET/PATCH /accounts/me/profile            -> current AppUser
 * - PATCH     /accounts/me/email              -> login email + current password
 * - PATCH     /accounts/me/password           -> password change
 * - POST      /accounts/me/ownership/transfer -> complete owner transfer
 * - GET/PATCH /accounts/me/settings           -> AccountSystemSetting
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { db } from "../lib/db/db";
import { apiRequest, saveAuthToken } from "../lib/platformApi";
import {
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

type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type CameraField = "logo" | "photo" | "bannerImage";
type SheetKey =
  | "myProfile"
  | "account"
  | "defaults"
  | "security"
  | "sync"
  | "protected"
  | "email"
  | "password"
  | "transfer"
  | null;

type OwnerUser = {
  id?: string;
  accountId?: string;
  fullName?: string;
  email?: string;
  phone?: string | null;
  role?: string;
  preferredLocale?: string | null;
  active?: boolean;
  emailVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
  passwordChangedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  memberships?: any[];
};

type AccountData = {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  currency?: string | null;
  defaultLocale?: string | null;
  timeZone?: string | null;
  status?: string;
  website?: string | null;
  address?: string | null;
  description?: string | null;
  logoMediaId?: string | number | null;
  photoMediaId?: string | number | null;
  bannerMediaId?: string | number | null;
  bannerImageMediaId?: string | number | null;
  logo?: string | null;
  photo?: string | null;
  bannerImage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  subscription?: {
    status?: string;
    billingCycle?: string;
    currentPeriodEnd?: string | null;
    plan?: {
      name?: string;
      code?: string;
      apiAccess?: boolean;
      cloudBackup?: boolean;
      advancedAnalytics?: boolean;
    };
  } | null;
  users?: any[];
  invoices?: any[];
  payments?: any[];
};

type MyProfileResponse = {
  user?: OwnerUser | null;
  account?: AccountData | null;
  ownerIdentity?: {
    ownerLevel?: boolean;
    emailSynchronized?: boolean;
    phoneSynchronized?: boolean;
  };
};

type AccountSetting = {
  id?: string | number;
  accountId?: string;
  key?: string;
  value?: any;
  group?: string;
  label?: string;
  description?: string;
  locked?: boolean;
  updatedAt?: number | string;
};

type MyProfileForm = {
  fullName: string;
  phone: string;
  preferredLocale: string;
};

type AccountProfileForm = {
  name: string;
  website: string;
  address: string;
  description: string;
  logo: string;
  logoMediaId?: string;
  photo: string;
  photoMediaId?: string;
  bannerImage: string;
  bannerMediaId?: string;
};

type SettingsForm = {
  country: string;
  currency: string;
  timezone: string;
  academicYearStartMonth: string;
  defaultLanguage: string;
  allowOfflineMode: boolean;
  autoSyncOnLogin: boolean;
  requireStrongPasswords: boolean;
  requirePasswordChangeForTempUsers: boolean;
  allowBranchSwitching: boolean;
  allowOwnerDataExport: boolean;
  backupFrequency: string;
};

type EmailForm = {
  newEmail: string;
  currentPassword: string;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type TransferOwnershipForm = {
  targetUserId: string;
  currentPassword: string;
  confirmation: string;
};

const emptyMyProfile: MyProfileForm = {
  fullName: "",
  phone: "",
  preferredLocale: "",
};

const emptyAccountProfile: AccountProfileForm = {
  name: "",
  website: "",
  address: "",
  description: "",
  logo: "",
  logoMediaId: undefined,
  photo: "",
  photoMediaId: undefined,
  bannerImage: "",
  bannerMediaId: undefined,
};

const defaultSettings: SettingsForm = {
  country: "GH",
  currency: "GHS",
  timezone: "Africa/Accra",
  academicYearStartMonth: "9",
  defaultLanguage: "en-GH",
  allowOfflineMode: true,
  autoSyncOnLogin: true,
  requireStrongPasswords: true,
  requirePasswordChangeForTempUsers: true,
  allowBranchSwitching: true,
  allowOwnerDataExport: true,
  backupFrequency: "weekly",
};

const ACCOUNT_MEDIA_OWNER_TABLE = "accounts";
const ACCOUNT_MEDIA_ENTITY_LABEL = "Account";
const ACCOUNT_FIELD_KEYS: Record<CameraField, string> = {
  logo: (MediaFieldKeys as any).LOGO || "logo",
  photo: (MediaFieldKeys as any).PHOTO || "photo",
  bannerImage:
    (MediaFieldKeys as any).BANNER ||
    (MediaFieldKeys as any).BANNER_IMAGE ||
    "bannerImage",
};

const createAccountMediaSessionKey = (accountId?: string | null) =>
  createSharedMediaSessionKey(ACCOUNT_MEDIA_OWNER_TABLE, accountId || "new");

const idOf = (value: unknown) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const cleanText = (value: any) => String(value || "").trim();
const safeText = (value: any, fallback = "Not set") =>
  cleanText(value) || fallback;
const titleCase = (value?: string | null) =>
  safeText(value, "Not set").replaceAll("_", " ");
const mediaKey = (accountCloudId: string, field: CameraField) =>
  `accounts:${accountCloudId}:${field}`;

const safeRecordMediaValue = (value?: string | null) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
};

function safeDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (
    ["active", "paid", "succeeded", "current", "enabled", "healthy"].includes(
      value,
    )
  )
    return "green";
  if (
    ["suspended", "closed", "expired", "cancelled", "failed", "disabled"].includes(
      value,
    )
  )
    return "red";
  if (["trial", "past_due", "pending", "draft", "limited"].includes(value))
    return "orange";
  if (!value || value === "not set") return "gray";
  return "blue";
}

function booleanLabel(value: boolean) {
  return value ? "Enabled" : "Disabled";
}

function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) if (anyDb[name]) return anyDb[name];
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  return table?.toArray ? table.toArray() : [];
}

async function cacheSettingsLocally(accountId: string, values: SettingsForm) {
  const table = getTable<AccountSetting>("accountSystemSettings", "settings");
  if (!table?.put && !table?.add) return;
  const now = Date.now();

  for (const [key, value] of Object.entries(values)) {
    const row = {
      id: `${accountId}:${key}`,
      accountId,
      key,
      value,
      updatedAt: now,
    };
    try {
      if (table.put) await table.put(row);
      else await table.add(row);
    } catch {
      // Local cache must never block the account profile page.
    }
  }
}

function settingsArrayToForm(
  rows: AccountSetting[],
  fallback: Partial<SettingsForm>,
): SettingsForm {
  const next: any = { ...defaultSettings, ...fallback };
  for (const row of rows) {
    if (!row.key) continue;
    if (!(row.key in defaultSettings)) continue;
    next[row.key] = row.value;
  }
  return next as SettingsForm;
}

function readStoredUser(): OwnerUser | null {
  if (typeof window === "undefined") return null;
  const stores = [window.localStorage, window.sessionStorage];
  const keys = ["eleeveon_auth_user", "eleeveon_account_user", "user"];

  for (const storage of stores) {
    for (const key of keys) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed as OwnerUser;
      } catch {
        // Ignore malformed old caches.
      }
    }
  }

  return null;
}

function mergeStoredJson(
  storage: Storage,
  key: string,
  patch: Record<string, any>,
) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return;
    const current = JSON.parse(raw);
    if (!current || typeof current !== "object") return;
    storage.setItem(key, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Cache refresh is best-effort only.
  }
}

function refreshStoredUserCaches(user: OwnerUser) {
  if (typeof window === "undefined") return;
  const patch = {
    id: user.id,
    accountId: user.accountId,
    fullName: user.fullName,
    name: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    preferredLocale: user.preferredLocale,
    active: user.active,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    passwordChangedAt: user.passwordChangedAt,
    lastLoginAt: user.lastLoginAt,
  };

  ["eleeveon_auth_user", "eleeveon_account_user", "user"].forEach((key) =>
    mergeStoredJson(window.localStorage, key, patch),
  );
  mergeStoredJson(window.sessionStorage, "eleeveon_auth_user", patch);
}

function refreshStoredAccountCaches(account: AccountData) {
  if (typeof window === "undefined") return;
  const patch = { ...account };

  ["eleeveon_auth_account", "eleeveon_account_info", "account"].forEach((key) =>
    mergeStoredJson(window.localStorage, key, patch),
  );
  mergeStoredJson(window.sessionStorage, "eleeveon_auth_account", patch);
}

function clearOwnerAuthAfterTransfer() {
  if (typeof window === "undefined") return;

  // platformApi owns the actual token storage contract. An empty token prevents
  // this former-owner tab from continuing with stale owner claims.
  try {
    saveAuthToken("");
  } catch {
    // Continue clearing the compatibility caches below.
  }

  const keys = [
    "eleeveon_auth_user",
    "eleeveon_auth_account",
    "eleeveon_account_user",
    "eleeveon_account_info",
    "eleeveon_user_memberships",
    "eleeveon_active_membership",
    "activeMembership",
    "user",
    "account",
  ];

  for (const key of keys) {
    try { window.localStorage.removeItem(key); } catch {}
    try { window.sessionStorage.removeItem(key); } catch {}
  }
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

export default function AccountProfilePage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [ownerUser, setOwnerUser] = useState<OwnerUser | null>(null);
  const [myProfile, setMyProfile] = useState<MyProfileForm>(emptyMyProfile);
  const [accountProfile, setAccountProfile] =
    useState<AccountProfileForm>(emptyAccountProfile);
  const [accountSettings, setAccountSettings] =
    useState<SettingsForm>(defaultSettings);
  const [emailForm, setEmailForm] = useState<EmailForm>({
    newEmail: "",
    currentPassword: "",
  });
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [transferForm, setTransferForm] = useState<TransferOwnershipForm>({
    targetUserId: "",
    currentPassword: "",
    confirmation: "",
  });
  const [transferCandidate, setTransferCandidate] = useState<OwnerUser | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetKey>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<
    Record<string, string>
  >({});

  const mediaSessionKeyRef = useRef(createAccountMediaSessionKey(accountId));
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraField, setCameraField] = useState<CameraField>("logo");
  const [cameraFacing, setCameraFacing] =
    useState<CameraFacingMode>("environment");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraCapturing, setCameraCapturing] = useState(false);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

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

  const requireAccount = () => {
    if (!authenticated || !accountId) {
      showToast("error", "Sign in before managing the account profile.");
      return false;
    }
    return true;
  };

  const stopCurrentCamera = () => {
    stopCameraStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  };

  const cacheAccount = async (data: AccountData | null) => {
    if (!data?.id || !(db as any).accounts?.put) return;
    await (db as any).accounts.put({
      ...(data as any),
      id: data.id,
      accountId: data.id,
      status: data.status || "active",
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
  };

  const resolveAccountMediaUrls = async (data: AccountData | null) => {
    const cloudId = data?.id || accountId || "";
    if (!cloudId || !accountId) return;
    const next: Record<string, string> = {};

    const resolveOwnedAssetUrl = async (
      field: CameraField,
      fallbackMediaId?: string | number | null,
    ) => {
      const ownedAsset = await getOwnerFieldMediaAsset({
        accountId,
        ownerTable: ACCOUNT_MEDIA_OWNER_TABLE,
        ownerId: cloudId,
        fieldKey: ACCOUNT_FIELD_KEYS[field],
      });
      if (ownedAsset?.id) {
        const url = await getMediaObjectUrl(String(ownedAsset.id));
        if (url) return url;
      }
      const fallbackId = idOf(fallbackMediaId);
      return fallbackId ? getMediaObjectUrl(fallbackId) : "";
    };

    try {
      const logoUrl = await resolveOwnedAssetUrl("logo", data?.logoMediaId);
      if (logoUrl) next[mediaKey(cloudId, "logo")] = logoUrl;

      const photoUrl = await resolveOwnedAssetUrl("photo", data?.photoMediaId);
      if (photoUrl) next[mediaKey(cloudId, "photo")] = photoUrl;

      const bannerUrl = await resolveOwnedAssetUrl(
        "bannerImage",
        data?.bannerMediaId || data?.bannerImageMediaId,
      );
      if (bannerUrl) next[mediaKey(cloudId, "bannerImage")] = bannerUrl;
    } catch (error) {
      console.error("Failed to resolve account media:", error);
    }

    setMediaPreviewUrls((current) => {
      Object.values(current).forEach((url) => {
        if (!Object.values(next).includes(url)) revokeMediaObjectUrl(url);
      });
      return next;
    });
  };

  async function load() {
    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setNotice("");

      let loadedAccount: AccountData | null = null;
      let loadedUser: OwnerUser | null = null;
      let loadedSettings: AccountSetting[] = [];
      let liveAccountAvailable = false;

      try {
        const [accountResult, profileResult, settingsResult] = await Promise.allSettled([
          apiRequest<AccountData>("/accounts/me"),
          apiRequest<MyProfileResponse>("/accounts/me/profile"),
          apiRequest<any>("/accounts/me/settings"),
        ]);

        if (accountResult.status === "fulfilled") {
          loadedAccount = accountResult.value;
          liveAccountAvailable = true;
        }

        if (profileResult.status === "fulfilled") {
          loadedUser = profileResult.value?.user || null;
          loadedAccount = loadedAccount || profileResult.value?.account || null;
        }

        if (settingsResult.status === "fulfilled") {
          const remoteSettings = settingsResult.value;
          loadedSettings = Array.isArray(remoteSettings)
            ? remoteSettings
            : remoteSettings?.settings || remoteSettings?.data || [];
        }
      } catch {
        // Promise.allSettled protects individual requests, this is only a final guard.
      }

      loadedUser = loadedUser || readStoredUser();

      if (!loadedAccount) {
        const localAccountTable = (db as any).accounts;
        if (localAccountTable?.get) {
          loadedAccount =
            (await localAccountTable.get(accountId).catch(() => undefined)) || null;
        }
      }

      if (!liveAccountAvailable) {
        setNotice(
          "Live account data was not fully available, so some values may reflect the latest information saved on this device.",
        );
      }

      if (!loadedSettings.length) {
        const localRows = await tableToArray<AccountSetting>(
          "accountSystemSettings",
          "settings",
        );
        loadedSettings = localRows.filter(
          (row) => !row.accountId || row.accountId === accountId,
        );
      }

      setAccount(loadedAccount);
      setOwnerUser(loadedUser);

      if (loadedAccount) {
        await cacheAccount(loadedAccount);
        await resolveAccountMediaUrls(loadedAccount);
        refreshStoredAccountCaches(loadedAccount);
      }
      if (loadedUser) refreshStoredUserCaches(loadedUser);

      setMyProfile(userToMyProfileForm(loadedUser));
      setAccountProfile(accountToProfileForm(loadedAccount, mediaPreviewUrls));
      setEmailForm({
        newEmail: loadedAccount?.email || loadedUser?.email || "",
        currentPassword: "",
      });

      const accountEmail = loadedAccount?.email?.toLowerCase().trim() || "";
      const userEmail = loadedUser?.email?.toLowerCase().trim() || "";
      if (accountEmail && userEmail && accountEmail !== userEmail) {
        setNotice((current) =>
          [
            current,
            "Owner email is currently out of sync between the Account record and the owner login. Use Login & Security → Change Owner Email to repair both together.",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
      setAccountSettings(
        settingsArrayToForm(loadedSettings, {
          country: loadedAccount?.country || "GH",
          currency: loadedAccount?.currency || "GHS",
          timezone: loadedAccount?.timeZone || "Africa/Accra",
          defaultLanguage: loadedAccount?.defaultLocale || "en-GH",
        }),
      );
    } catch (error: any) {
      showToast("error", error?.message || "Unable to load account profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, accountLoading, settingsLoading]);

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
        console.error("Failed to open account camera:", error);
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

  const summary = useMemo(() => {
    const enabledSettings = [
      accountSettings.allowOfflineMode,
      accountSettings.autoSyncOnLogin,
      accountSettings.requireStrongPasswords,
      accountSettings.requirePasswordChangeForTempUsers,
      accountSettings.allowBranchSwitching,
      accountSettings.allowOwnerDataExport,
    ].filter(Boolean).length;

    const ownerAccountEmail = account?.email?.toLowerCase().trim() || "";
    const ownerLoginEmail = ownerUser?.email?.toLowerCase().trim() || "";
    const ownerEmailSynchronized =
      Boolean(ownerAccountEmail || ownerLoginEmail) &&
      ownerAccountEmail === ownerLoginEmail;

    const ownerAccountPhone = account?.phone?.trim() || "";
    const ownerLoginPhone = ownerUser?.phone?.trim() || "";
    const ownerPhoneSynchronized = ownerAccountPhone === ownerLoginPhone;

    return {
      accountStatus: account?.status || "active",
      plan: account?.subscription?.plan?.name || "No active plan",
      planCode: account?.subscription?.plan?.code || "Not set",
      subscriptionStatus: account?.subscription?.status || "not set",
      billingCycle: account?.subscription?.billingCycle || "Not set",
      periodEnd: account?.subscription?.currentPeriodEnd || null,
      users: account?.users?.length || 0,
      invoices: account?.invoices?.length || 0,
      payments: account?.payments?.length || 0,
      enabledSettings,
      ownerEmailSynchronized,
      ownerPhoneSynchronized,
    };
  }, [account, ownerUser, accountSettings]);

  const accountCloudId = account?.id || accountId || "";
  const bannerUrl =
    mediaPreviewUrls[mediaKey(accountCloudId, "bannerImage")] ||
    safeRecordMediaValue(account?.bannerImage);

  const updateMyProfile = (patch: Partial<MyProfileForm>) => {
    setMyProfile((current) => ({ ...current, ...patch }));
    setMessage("");
  };

  const updateAccountProfile = (patch: Partial<AccountProfileForm>) => {
    setAccountProfile((current) => ({ ...current, ...patch }));
    setMessage("");
  };

  const updateSettings = <K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ) => {
    setAccountSettings((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const openMyProfileSheet = () => {
    setMyProfile(userToMyProfileForm(ownerUser));
    setMessage("");
    setActiveSheet("myProfile");
  };

  const openAccountSheet = () => {
    mediaSessionKeyRef.current = createAccountMediaSessionKey(
      account?.id || accountId,
    );
    setAccountProfile(accountToProfileForm(account, mediaPreviewUrls));
    setMessage("");
    setActiveSheet("account");
  };

  const openEmailSheet = () => {
    setEmailForm({
      newEmail: account?.email || ownerUser?.email || "",
      currentPassword: "",
    });
    setMessage("");
    setActiveSheet("email");
  };

  const openPasswordSheet = () => {
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setMessage("");
    setActiveSheet("password");
  };

  const openTransferSheet = (candidate?: OwnerUser | null, currentPassword = "") => {
    const selected = candidate || null;
    setTransferCandidate(selected);
    setTransferForm({
      targetUserId: selected?.id || "",
      currentPassword,
      confirmation: "",
    });
    setMessage("");
    setActiveSheet("transfer");
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
        fileName: `account-${cameraField}-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        quality: 0.88,
        maxWidth: cameraField === "logo" ? 900 : 1440,
        maxHeight: 900,
      });
      await handleImageUpload(cameraField, file);
      closeCamera();
    } catch (error: any) {
      console.error("Failed to capture account image:", error);
      showToast("error", error?.message || "Failed to capture photo.");
    } finally {
      setCameraCapturing(false);
    }
  };

  const handleImageUpload = async (field: CameraField, file?: File) => {
    if (!file) return;
    if (!requireAccount()) return;

    try {
      const result = await saveImageAsset(file, {
        accountId: accountId!,
        ownerTable: ACCOUNT_MEDIA_OWNER_TABLE,
        ownerCloudId: account?.id || accountId!,
        ownerTempKey: mediaSessionKeyRef.current,
        fieldKey: ACCOUNT_FIELD_KEYS[field],
        variant:
          field === "logo"
            ? "avatar"
            : field === "bannerImage"
              ? "cover"
              : "image",
        replaceExisting: true,
      } as any);

      updateAccountProfile({
        [field]: result.previewUrl,
        [field === "bannerImage" ? "bannerMediaId" : `${field}MediaId`]:
          idOf(result.assetId) || undefined,
      } as Partial<AccountProfileForm>);

      showToast(
        "success",
        `${
          field === "logo"
            ? "Account logo"
            : field === "photo"
              ? "Account photo"
              : "Account banner"
        } optimized.`,
      );
    } catch (error: any) {
      console.error("Failed to process account image:", error);
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const validateMyProfile = () => {
    if (!myProfile.fullName.trim()) return "Your full name is required.";
    return "";
  };

  const validateAccountProfile = () => {
    if (!accountProfile.name.trim()) return "Account name is required.";
    if (
      accountProfile.website.trim() &&
      !/^https?:\/\/.+/i.test(accountProfile.website.trim()) &&
      !/^www\..+/i.test(accountProfile.website.trim())
    ) {
      return "Website should begin with https://, http://, or www.";
    }
    return "";
  };

  const validateDefaults = () => {
    if (!accountSettings.country.trim()) return "Country is required.";
    if (!accountSettings.currency.trim()) return "Currency is required.";
    if (!accountSettings.timezone.trim()) return "Timezone is required.";
    if (!accountSettings.defaultLanguage.trim()) return "Default language is required.";
    return "";
  };

  async function saveMyProfile(event?: React.FormEvent) {
    event?.preventDefault();
    const error = validateMyProfile();
    if (error) {
      setMessage(error);
      return;
    }

    try {
      setSaving(true);
      const result = await apiRequest<MyProfileResponse>("/accounts/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: myProfile.fullName.trim(),
          phone: myProfile.phone.trim(),
          preferredLocale: myProfile.preferredLocale.trim(),
        }),
      } as any);

      const mergedUser = {
        ...(ownerUser || {}),
        ...(result?.user || {}),
      };
      const mergedAccount = {
        ...(account || {}),
        ...(result?.account || {}),
      };

      setOwnerUser(mergedUser);
      setAccount(mergedAccount);
      refreshStoredUserCaches(mergedUser);
      refreshStoredAccountCaches(mergedAccount);
      await cacheAccount(mergedAccount);

      setActiveSheet(null);
      showToast("success", "Owner profile updated and contact details synchronized.");
    } catch (error: any) {
      setMessage(error?.message || "Owner profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccountProfile(event?: React.FormEvent) {
    event?.preventDefault();
    const error = validateAccountProfile();
    if (error) {
      setMessage(error);
      return;
    }

    try {
      setSaving(true);
      const payload: Partial<AccountData> = {
        name: accountProfile.name.trim(),
        website: accountProfile.website.trim() || undefined,
        address: accountProfile.address.trim() || undefined,
        description: accountProfile.description.trim() || undefined,
        logoMediaId: accountProfile.logoMediaId || undefined,
        photoMediaId: accountProfile.photoMediaId || undefined,
        bannerMediaId: accountProfile.bannerMediaId || undefined,
      };

      const updated = await apiRequest<AccountData>("/accounts/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      } as any);

      const merged = { ...(account || {}), ...payload, ...updated };
      setAccount(merged);
      await cacheAccount(merged);
      refreshStoredAccountCaches(merged);

      await Promise.all(
        [
          { id: accountProfile.logoMediaId, field: "logo" as CameraField },
          { id: accountProfile.photoMediaId, field: "photo" as CameraField },
          {
            id: accountProfile.bannerMediaId,
            field: "bannerImage" as CameraField,
          },
        ]
          .filter((asset) => Boolean(asset.id))
          .map((asset) =>
            attachMediaAssetToOwner({
              assetId: String(asset.id),
              ownerTable: ACCOUNT_MEDIA_OWNER_TABLE,
              ownerId: account?.id || accountId!,
              ownerTempKey: mediaSessionKeyRef.current,
            }),
          ),
      );

      mediaSessionKeyRef.current = createAccountMediaSessionKey(
        account?.id || accountId,
      );
      setActiveSheet(null);
      showToast("success", "Account profile saved.");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Account profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDefaults(event?: React.FormEvent) {
    event?.preventDefault();
    const error = validateDefaults();
    if (error) {
      setMessage(error);
      return;
    }

    try {
      setSaving(true);
      const cleanSettings: SettingsForm = {
        ...accountSettings,
        country: accountSettings.country.trim().toUpperCase(),
        currency: accountSettings.currency.trim().toUpperCase(),
        timezone: accountSettings.timezone.trim(),
        defaultLanguage: accountSettings.defaultLanguage.trim(),
      };

      const updatedAccount = await apiRequest<AccountData>("/accounts/me", {
        method: "PATCH",
        body: JSON.stringify({
          country: cleanSettings.country,
          currency: cleanSettings.currency,
          timeZone: cleanSettings.timezone,
          defaultLocale: cleanSettings.defaultLanguage,
        }),
      } as any);

      await apiRequest<any>("/accounts/me/settings", {
        method: "PATCH",
        body: JSON.stringify({
          academicYearStartMonth: cleanSettings.academicYearStartMonth,
        }),
      } as any);

      const mergedAccount = { ...(account || {}), ...updatedAccount };
      setAccount(mergedAccount);
      setAccountSettings(cleanSettings);
      await cacheAccount(mergedAccount);
      refreshStoredAccountCaches(mergedAccount);
      await cacheSettingsLocally(accountId!, cleanSettings);

      setActiveSheet(null);
      showToast("success", "Account defaults saved.");
    } catch (error: any) {
      setMessage(error?.message || "Account defaults could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSecuritySettings(event?: React.FormEvent) {
    event?.preventDefault();
    try {
      setSaving(true);
      await apiRequest<any>("/accounts/me/settings", {
        method: "PATCH",
        body: JSON.stringify({
          requireStrongPasswords: accountSettings.requireStrongPasswords,
          requirePasswordChangeForTempUsers:
            accountSettings.requirePasswordChangeForTempUsers,
          allowBranchSwitching: accountSettings.allowBranchSwitching,
          allowOwnerDataExport: accountSettings.allowOwnerDataExport,
        }),
      } as any);

      await cacheSettingsLocally(accountId!, accountSettings);
      setActiveSheet(null);
      showToast("success", "Security preferences saved.");
    } catch (error: any) {
      setMessage(error?.message || "Security preferences could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSyncSettings(event?: React.FormEvent) {
    event?.preventDefault();
    try {
      setSaving(true);
      await apiRequest<any>("/accounts/me/settings", {
        method: "PATCH",
        body: JSON.stringify({
          allowOfflineMode: accountSettings.allowOfflineMode,
          autoSyncOnLogin: accountSettings.autoSyncOnLogin,
          backupFrequency: accountSettings.backupFrequency,
        }),
      } as any);

      await cacheSettingsLocally(accountId!, accountSettings);
      setActiveSheet(null);
      showToast("success", "Sync and backup preferences saved.");
    } catch (error: any) {
      setMessage(error?.message || "Sync preferences could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function changeLoginEmail(event?: React.FormEvent) {
    event?.preventDefault();
    const nextEmail = emailForm.newEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setMessage("Enter a valid owner email address.");
      return;
    }
    if (!emailForm.currentPassword) {
      setMessage("Enter your current password to change the owner email.");
      return;
    }

    const existingAccountUser = (account?.users || []).find((candidate: any) =>
      candidate?.id &&
      candidate.id !== ownerUser?.id &&
      String(candidate.email || "").trim().toLowerCase() === nextEmail
    ) as OwnerUser | undefined;

    if (existingAccountUser) {
      openTransferSheet(existingAccountUser, emailForm.currentPassword);
      setMessage(
        `${safeText(existingAccountUser.fullName, "This user")} already owns this login email. Transfer ownership to the existing user instead of creating a duplicate login identity.`,
      );
      return;
    }

    try {
      setSaving(true);
      const result = await apiRequest<MyProfileResponse>("/accounts/me/email", {
        method: "PATCH",
        body: JSON.stringify({
          newEmail: nextEmail,
          currentPassword: emailForm.currentPassword,
        }),
      } as any);

      const mergedUser = {
        ...(ownerUser || {}),
        ...(result?.user || {}),
      };
      const mergedAccount = {
        ...(account || {}),
        ...(result?.account || {}),
      };

      setOwnerUser(mergedUser);
      setAccount(mergedAccount);
      refreshStoredUserCaches(mergedUser);
      refreshStoredAccountCaches(mergedAccount);
      await cacheAccount(mergedAccount);

      setEmailForm({
        newEmail: mergedAccount.email || mergedUser.email || nextEmail,
        currentPassword: "",
      });
      setActiveSheet("security");
      showToast("success", "Owner email changed and synchronized across Account and login.");
    } catch (error: any) {
      setMessage(error?.message || "Owner email could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  async function transferOwnership(event?: React.FormEvent) {
    event?.preventDefault();

    const targetUser = (account?.users || []).find(
      (candidate: any) => String(candidate?.id || "") === transferForm.targetUserId,
    ) as OwnerUser | undefined;

    if (!transferForm.targetUserId || !targetUser) {
      setMessage("Select the existing user who should become the new owner.");
      return;
    }

    if (targetUser.id === ownerUser?.id) {
      setMessage("You are already the current owner.");
      return;
    }

    if (!transferForm.currentPassword) {
      setMessage("Enter the current owner's password to authorize the transfer.");
      return;
    }

    if (transferForm.confirmation.trim().toUpperCase() !== "TRANSFER") {
      setMessage('Type TRANSFER exactly to confirm the ownership transfer.');
      return;
    }

    try {
      setSaving(true);
      await apiRequest<any>("/accounts/me/ownership/transfer", {
        method: "POST",
        body: JSON.stringify({
          targetUserId: transferForm.targetUserId,
          currentPassword: transferForm.currentPassword,
        }),
      } as any);

      // This browser belongs to the former owner. The backend has revoked the
      // owner sessions, so remove cached owner identity immediately and force a
      // fresh login. The new owner signs in with THEIR EXISTING password.
      clearOwnerAuthAfterTransfer();
      setTransferForm({ targetUserId: "", currentPassword: "", confirmation: "" });
      setTransferCandidate(null);

      window.alert(
        `Ownership transferred to ${safeText(targetUser.fullName, targetUser.email || "the selected user")}. They can now sign in with their existing email and existing password.`,
      );
      window.location.assign("/login");
    } catch (error: any) {
      setMessage(error?.message || "Ownership could not be transferred.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event?: React.FormEvent) {
    event?.preventDefault();

    if (!passwordForm.currentPassword) {
      setMessage("Enter your current password.");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setMessage("New password must be at least 6 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage("New password and confirmation do not match.");
      return;
    }

    try {
      setSaving(true);
      const result = await apiRequest<any>("/accounts/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      } as any);

      const merged = {
        ...(ownerUser || {}),
        passwordChangedAt:
          result?.passwordChangedAt || new Date().toISOString(),
      };
      setOwnerUser(merged);
      refreshStoredUserCaches(merged);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setActiveSheet("security");
      showToast("success", "Password changed successfully.");
    } catch (error: any) {
      setMessage(error?.message || "Password could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  if (accountLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Account Profile..."
        text="Loading your login identity, account workspace, defaults, security and billing context."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before viewing the account profile."
      />
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

      {notice && <section className="ba-notice">{notice}</section>}

      <section className="ba-search-card" aria-label="Account profile actions">
        <label className="ba-search ba-profile-search">
          <span>👑</span>
          <input
            value={`${safeText(ownerUser?.fullName, "Owner")} · ${safeText(
              account?.name,
              "Account",
            )} · ${titleCase(summary.accountStatus)}`}
            readOnly
            aria-label="Owner and account profile"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline ba-edit-inline"
          onClick={openMyProfileSheet}
          aria-label="Edit my profile"
          title="Edit my profile"
        >
          ✎
        </button>

        <button
          type="button"
          className="ba-filter-button"
          onClick={() => setActiveSheet("defaults")}
          aria-label="Open account defaults"
          title="Account defaults"
        >
          <SliderIcon />
        </button>

        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
          title="More"
        >
          ⋯
        </button>
      </section>

      <section className="ba-profile-panel" aria-label="Account profile overview">
        <div className="ba-profile-panel-head">
          <div>
            <span>Account Profile</span>
            <h2>{safeText(account?.name, "Account")}</h2>
            <p>{safeText(account?.description, "No account description yet")}</p>
          </div>
          <Chip tone={statusTone(summary.accountStatus)}>
            {titleCase(summary.accountStatus)}
          </Chip>
        </div>

        <div className="ba-profile-detail-grid">
          <button
            type="button"
            className="ba-profile-detail wide"
            onClick={openMyProfileSheet}
          >
            <b>My Profile</b>
            <strong>{safeText(ownerUser?.fullName, "Name not set")}</strong>
            <small>
              {safeText(ownerUser?.email, "No login email")} · {titleCase(ownerUser?.role)}
            </small>
          </button>

          <button
            type="button"
            className="ba-profile-detail"
            onClick={openAccountSheet}
          >
            <b>Owner Account</b>
            <strong>{safeText(account?.email, "Owner email not set")}</strong>
            <small>{safeText(account?.website, "Website not set")}</small>
          </button>

          <button
            type="button"
            className="ba-profile-detail"
            onClick={() => setActiveSheet("security")}
          >
            <b>Login & Security</b>
            <strong>
              {summary.ownerEmailSynchronized ? "Owner identity synced" : "Owner email needs sync"}
            </strong>
            <small>{safeText(ownerUser?.email || account?.email, "No owner email")}</small>
          </button>

          <button
            type="button"
            className="ba-profile-detail"
            onClick={() => setActiveSheet("defaults")}
          >
            <b>Defaults</b>
            <strong>
              {accountSettings.country} · {accountSettings.currency}
            </strong>
            <small>
              {accountSettings.timezone} · {accountSettings.defaultLanguage}
            </small>
          </button>

          <button
            type="button"
            className="ba-profile-detail"
            onClick={() => setActiveSheet("sync")}
          >
            <b>Sync & Backup</b>
            <strong>{booleanLabel(accountSettings.allowOfflineMode)}</strong>
            <small>
              {accountSettings.backupFrequency} backup · auto sync{" "}
              {accountSettings.autoSyncOnLogin ? "on" : "off"}
            </small>
          </button>

          <button
            type="button"
            className="ba-profile-detail"
            onClick={() => setActiveSheet("protected")}
          >
            <b>Plan</b>
            <strong>{summary.plan}</strong>
            <small>
              {titleCase(summary.subscriptionStatus)} · {summary.billingCycle}
            </small>
          </button>
        </div>

        <div className="ba-profile-metrics" aria-label="Account metrics">
          <span>
            <b>{summary.users}</b>
            <small>Users</small>
          </span>
          <span>
            <b>{summary.invoices}</b>
            <small>Invoices</small>
          </span>
          <span>
            <b>{summary.payments}</b>
            <small>Payments</small>
          </span>
          <span>
            <b>{bannerUrl ? "Saved" : "Missing"}</b>
            <small>Banner</small>
          </span>
        </div>

        <p className="ba-profile-note">
          This page manages the owner across both records: Account is the top-level
          owner/customer record, while the owner AppUser provides authentication.
          Owner email and phone stay synchronized; password remains AppUser-only.
        </p>
      </section>

      {moreOpen && (
        <MoreSheet
          onMyProfile={() => {
            setMoreOpen(false);
            openMyProfileSheet();
          }}
          onAccount={() => {
            setMoreOpen(false);
            openAccountSheet();
          }}
          onDefaults={() => {
            setMoreOpen(false);
            setActiveSheet("defaults");
          }}
          onSecurity={() => {
            setMoreOpen(false);
            setActiveSheet("security");
          }}
          onTransfer={() => {
            setMoreOpen(false);
            openTransferSheet();
          }}
          onSync={() => {
            setMoreOpen(false);
            setActiveSheet("sync");
          }}
          onProtected={() => {
            setMoreOpen(false);
            setActiveSheet("protected");
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {activeSheet === "myProfile" && (
        <MyProfileSheet
          form={myProfile}
          user={ownerUser}
          saving={saving}
          message={message}
          update={updateMyProfile}
          save={saveMyProfile}
          openSecurity={() => setActiveSheet("security")}
          close={() => setActiveSheet(null)}
        />
      )}

      {activeSheet === "account" && (
        <AccountProfileSheet
          profile={accountProfile}
          saving={saving}
          message={message}
          updateProfile={updateAccountProfile}
          handleImageUpload={handleImageUpload}
          openCameraForField={openCameraForField}
          saveProfile={saveAccountProfile}
          close={() => setActiveSheet(null)}
        />
      )}

      {activeSheet === "defaults" && (
        <DefaultsSheet
          settings={accountSettings}
          saving={saving}
          message={message}
          updateSettings={updateSettings}
          saveSettings={saveDefaults}
          close={() => setActiveSheet(null)}
        />
      )}

      {activeSheet === "security" && (
        <SecuritySheet
          user={ownerUser}
          settings={accountSettings}
          saving={saving}
          message={message}
          updateSettings={updateSettings}
          saveSettings={saveSecuritySettings}
          openEmail={openEmailSheet}
          openPassword={openPasswordSheet}
          openTransfer={() => openTransferSheet()}
          close={() => setActiveSheet(null)}
        />
      )}

      {activeSheet === "email" && (
        <ChangeEmailSheet
          form={emailForm}
          saving={saving}
          message={message}
          update={(patch) => {
            setEmailForm((current) => ({ ...current, ...patch }));
            setMessage("");
          }}
          save={changeLoginEmail}
          close={() => setActiveSheet("security")}
        />
      )}

      {activeSheet === "password" && (
        <ChangePasswordSheet
          form={passwordForm}
          saving={saving}
          message={message}
          update={(patch) => {
            setPasswordForm((current) => ({ ...current, ...patch }));
            setMessage("");
          }}
          save={changePassword}
          close={() => setActiveSheet("security")}
        />
      )}

      {activeSheet === "transfer" && (
        <TransferOwnershipSheet
          currentOwner={ownerUser}
          users={(account?.users || []) as OwnerUser[]}
          candidate={transferCandidate}
          form={transferForm}
          saving={saving}
          message={message}
          update={(patch) => {
            const next = { ...transferForm, ...patch };
            setTransferForm(next);
            if (patch.targetUserId !== undefined) {
              const selected = (account?.users || []).find(
                (user: any) => String(user?.id || "") === patch.targetUserId,
              ) as OwnerUser | undefined;
              setTransferCandidate(selected || null);
            }
            setMessage("");
          }}
          save={transferOwnership}
          close={() => setActiveSheet("security")}
        />
      )}

      {activeSheet === "sync" && (
        <SyncSheet
          settings={accountSettings}
          saving={saving}
          message={message}
          updateSettings={updateSettings}
          saveSettings={saveSyncSettings}
          close={() => setActiveSheet(null)}
        />
      )}

      {activeSheet === "protected" && (
        <ProtectedSheet
          account={account}
          summary={summary}
          close={() => setActiveSheet(null)}
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
          entityLabel={ACCOUNT_MEDIA_ENTITY_LABEL}
        />
      )}
    </main>
  );
}

function userToMyProfileForm(user: OwnerUser | null): MyProfileForm {
  return {
    fullName: user?.fullName || "",
    phone: user?.phone || "",
    preferredLocale: user?.preferredLocale || "",
  };
}

function accountToProfileForm(
  account: AccountData | null,
  previews: Record<string, string>,
): AccountProfileForm {
  const cloudId = account?.id || "";
  return {
    name: account?.name || "",
    website: account?.website || "",
    address: account?.address || "",
    description: account?.description || "",
    logo:
      previews[mediaKey(cloudId, "logo")] ||
      safeRecordMediaValue(account?.logo) ||
      "",
    logoMediaId: idOf(account?.logoMediaId) || undefined,
    photo:
      previews[mediaKey(cloudId, "photo")] ||
      safeRecordMediaValue(account?.photo) ||
      "",
    photoMediaId: idOf(account?.photoMediaId) || undefined,
    bannerImage:
      previews[mediaKey(cloudId, "bannerImage")] ||
      safeRecordMediaValue(account?.bannerImage) ||
      "",
    bannerMediaId:
      idOf(account?.bannerMediaId || account?.bannerImageMediaId) || undefined,
  };
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

function MoreSheet({
  onMyProfile,
  onAccount,
  onDefaults,
  onSecurity,
  onTransfer,
  onSync,
  onProtected,
  onRefresh,
  onClose,
}: {
  onMyProfile: () => void;
  onAccount: () => void;
  onDefaults: () => void;
  onSecurity: () => void;
  onTransfer: () => void;
  onSync: () => void;
  onProtected: () => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Manage your profile, workspace and account preferences.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close more options">
            ✕
          </button>
        </div>
        <div className="ba-menu-list">
          <MenuButton
            icon="👤"
            title="My Profile"
            note="Your name, phone and personal locale"
            onClick={onMyProfile}
          />
          <MenuButton
            icon="🏢"
            title="Owner Account"
            note="Account/workspace name, website and branding"
            onClick={onAccount}
          />
          <MenuButton
            icon="🔒"
            title="Owner Login & Security"
            note="Login email, password and access rules"
            onClick={onSecurity}
          />
          <MenuButton
            icon="↔"
            title="Transfer Ownership"
            note="Move the complete owner account to an existing user"
            onClick={onTransfer}
          />
          <MenuButton
            icon="⚙"
            title="Defaults"
            note="Country, currency, timezone and locale"
            onClick={onDefaults}
          />
          <MenuButton
            icon="☁"
            title="Sync & Backup"
            note="Offline mode, auto sync and backup frequency"
            onClick={onSync}
          />
          <MenuButton
            icon="🛡"
            title="Protected"
            note="Plan, subscription and platform flags"
            onClick={onProtected}
          />
          <MenuButton
            icon="↻"
            title="Refresh"
            note="Reload backend and local account data"
            onClick={onRefresh}
          />
        </div>
      </section>
    </div>
  );
}

function MenuButton({
  icon,
  title,
  note,
  onClick,
}: {
  icon: string;
  title: string;
  note: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button type="button" onClick={onClick}>
      <span>{icon}</span>
      <b>{title}</b>
      <small>{note}</small>
    </button>
  );
}

function MyProfileSheet({
  form,
  user,
  saving,
  message,
  update,
  save,
  openSecurity,
  close,
}: {
  form: MyProfileForm;
  user: OwnerUser | null;
  saving: boolean;
  message: string;
  update: (patch: Partial<MyProfileForm>) => void;
  save: (event?: React.FormEvent) => void | Promise<void>;
  openSecurity: () => void;
  close: () => void;
}) {
  return (
    <div className="ba-modal-backdrop" role="dialog" aria-modal="true">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>Owner Profile</h2>
            <p>Update the owner's personal identity. Phone is synchronized to the Account owner record.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close my profile form">
            ✕
          </button>
        </div>
        {message && <section className="ba-toast error">{message}</section>}

        <section className="ba-form-section">
          <h3>Personal Identity</h3>
          <div className="ba-form">
            <TextInput
              wide
              label="Full Name"
              value={form.fullName}
              onChange={(value) => update({ fullName: value })}
              placeholder="Your full name"
              autoComplete="name"
            />
            <TextInput
              label="Phone"
              value={form.phone}
              onChange={(value) => update({ phone: value })}
              placeholder="Phone"
              autoComplete="tel"
            />
            <TextInput
              label="Preferred Locale"
              value={form.preferredLocale}
              onChange={(value) => update({ preferredLocale: value })}
              placeholder="e.g. en-GH"
            />
            <TextInput
              wide
              label="Owner Email"
              value={user?.email || ""}
              onChange={() => undefined}
              readOnly
              autoComplete="email"
            />
          </div>
          <p className="ba-inline-note">
            Owner email is shared by Account.email and the owner AppUser.email.
            Change it from Login &amp; Security so both records update together.
            Password remains only on the AppUser login.
          </p>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={openSecurity}>
            Login &amp; Security
          </button>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save My Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AccountProfileSheet({
  profile,
  saving,
  message,
  updateProfile,
  handleImageUpload,
  openCameraForField,
  saveProfile,
  close,
}: {
  profile: AccountProfileForm;
  saving: boolean;
  message: string;
  updateProfile: (patch: Partial<AccountProfileForm>) => void;
  handleImageUpload: (field: CameraField, file?: File) => void | Promise<void>;
  openCameraForField: (field: CameraField) => void;
  saveProfile: (event?: React.FormEvent) => void | Promise<void>;
  close: () => void;
}) {
  return (
    <div className="ba-modal-backdrop" role="dialog" aria-modal="true">
      <form className="ba-modal" onSubmit={saveProfile}>
        <div className="ba-modal-head">
          <div>
            <h2>Edit Account</h2>
            <p>
              Update the owner Account/workspace name, website, address and
              branding. Owner email and phone are managed from Owner Profile and
              Login & Security so Account + AppUser stay synchronized.
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close account form">
            ✕
          </button>
        </div>
        {message && <section className="ba-toast error">{message}</section>}

        <section className="ba-form-section">
          <h3>Workspace Identity</h3>
          <div className="ba-form">
            <TextInput
              wide
              label="Account Name"
              value={profile.name}
              onChange={(value) => updateProfile({ name: value })}
              placeholder="Account name"
            />
            <TextInput
              wide
              label="Website"
              value={profile.website}
              onChange={(value) => updateProfile({ website: value })}
              placeholder="https://example.com"
            />
            <TextareaInput
              wide
              label="Address"
              value={profile.address}
              onChange={(value) => updateProfile({ address: value })}
              placeholder="Account address"
            />
            <TextareaInput
              wide
              label="Description"
              value={profile.description}
              onChange={(value) => updateProfile({ description: value })}
              placeholder="Short account description"
            />
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Media</h3>
          <div className="ba-form">
            <MediaInput
              title="Logo"
              field="logo"
              preview={profile.logo}
              handleImageUpload={handleImageUpload}
              openCameraForField={openCameraForField}
            />
            <MediaInput
              title="Account Photo"
              field="photo"
              preview={profile.photo}
              handleImageUpload={handleImageUpload}
              openCameraForField={openCameraForField}
            />
            <MediaInput
              title="Banner Image"
              field="bannerImage"
              preview={profile.bannerImage}
              banner
              handleImageUpload={handleImageUpload}
              openCameraForField={openCameraForField}
            />
          </div>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Account"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DefaultsSheet({
  settings,
  saving,
  message,
  updateSettings,
  saveSettings,
  close,
}: {
  settings: SettingsForm;
  saving: boolean;
  message: string;
  updateSettings: <K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ) => void;
  saveSettings: (event?: React.FormEvent) => void | Promise<void>;
  close: () => void;
}) {
  return (
    <SettingsModal
      title="Defaults"
      text="Set account localization defaults used across schools, reports and billing."
      saving={saving}
      message={message}
      onSubmit={saveSettings}
      close={close}
      submitLabel="Save Defaults"
    >
      <div className="ba-form">
        <TextInput
          label="Country"
          value={settings.country}
          onChange={(value) => updateSettings("country", value.toUpperCase())}
          placeholder="GH"
        />
        <TextInput
          label="Currency"
          value={settings.currency}
          onChange={(value) => updateSettings("currency", value.toUpperCase())}
          placeholder="GHS"
        />
        <TextInput
          label="Timezone"
          value={settings.timezone}
          onChange={(value) => updateSettings("timezone", value)}
          placeholder="Africa/Accra"
        />
        <TextInput
          label="Default Locale"
          value={settings.defaultLanguage}
          onChange={(value) => updateSettings("defaultLanguage", value)}
          placeholder="en-GH"
        />
        <label>
          <span>Academic Year Start</span>
          <select
            value={settings.academicYearStartMonth}
            onChange={(event) =>
              updateSettings("academicYearStartMonth", event.target.value)
            }
          >
            <option value="1">January</option>
            <option value="4">April</option>
            <option value="9">September</option>
          </select>
        </label>
      </div>
    </SettingsModal>
  );
}

function SecuritySheet({
  user,
  settings,
  saving,
  message,
  updateSettings,
  saveSettings,
  openEmail,
  openPassword,
  openTransfer,
  close,
}: {
  user: OwnerUser | null;
  settings: SettingsForm;
  saving: boolean;
  message: string;
  updateSettings: <K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ) => void;
  saveSettings: (event?: React.FormEvent) => void | Promise<void>;
  openEmail: () => void;
  openPassword: () => void;
  openTransfer: () => void;
  close: () => void;
}) {
  return (
    <SettingsModal
      title="Login & Security"
      text="Manage the owner's synchronized email, password and account-wide security preferences."
      saving={saving}
      message={message}
      onSubmit={saveSettings}
      close={close}
      submitLabel="Save Security Preferences"
    >
      <div className="ba-security-actions">
        <button type="button" className="ba-security-action" onClick={openEmail}>
          <div>
            <b>Owner Email</b>
            <small>
              {safeText(user?.email, "No login email")} · {user?.emailVerifiedAt ? "verified" : "not verified"}
            </small>
          </div>
          <span>›</span>
        </button>

        <button
          type="button"
          className="ba-security-action"
          onClick={openPassword}
        >
          <div>
            <b>Password</b>
            <small>Last changed: {safeDate(user?.passwordChangedAt)}</small>
          </div>
          <span>›</span>
        </button>

        <button
          type="button"
          className="ba-security-action danger"
          onClick={openTransfer}
        >
          <div>
            <b>Transfer Ownership</b>
            <small>Move the complete owner identity to an existing active user in this account.</small>
          </div>
          <span>›</span>
        </button>
      </div>

      <div className="ba-toggle-grid">
        <ToggleCard
          title="Require Strong Passwords"
          note="New users must use secure passwords."
          value={settings.requireStrongPasswords}
          onToggle={() =>
            updateSettings(
              "requireStrongPasswords",
              !settings.requireStrongPasswords,
            )
          }
        />
        <ToggleCard
          title="Force Temporary Password Change"
          note="Temporary users must change their password after first login."
          value={settings.requirePasswordChangeForTempUsers}
          onToggle={() =>
            updateSettings(
              "requirePasswordChangeForTempUsers",
              !settings.requirePasswordChangeForTempUsers,
            )
          }
        />
        <ToggleCard
          title="Allow Branch Switching"
          note="Permitted users can switch assigned branches."
          value={settings.allowBranchSwitching}
          onToggle={() =>
            updateSettings("allowBranchSwitching", !settings.allowBranchSwitching)
          }
        />
        <ToggleCard
          title="Owner Data Export"
          note="Owner can export account-scoped backup data."
          value={settings.allowOwnerDataExport}
          onToggle={() =>
            updateSettings("allowOwnerDataExport", !settings.allowOwnerDataExport)
          }
        />
      </div>
    </SettingsModal>
  );
}

function ChangeEmailSheet({
  form,
  saving,
  message,
  update,
  save,
  close,
}: {
  form: EmailForm;
  saving: boolean;
  message: string;
  update: (patch: Partial<EmailForm>) => void;
  save: (event?: React.FormEvent) => void | Promise<void>;
  close: () => void;
}) {
  return (
    <SettingsModal
      title="Change Owner Email"
      text="This changes the owner email on both the Account record and the owner AppUser login. Your current password is required."
      saving={saving}
      message={message}
      onSubmit={save}
      close={close}
      submitLabel="Change Owner Email"
    >
      <div className="ba-form">
        <TextInput
          wide
          label="New Owner Email"
          value={form.newEmail}
          onChange={(value) => update({ newEmail: value })}
          placeholder="new@example.com"
          autoComplete="email"
        />
        <PasswordInput
          wide
          label="Current Password"
          value={form.currentPassword}
          onChange={(value) => update({ currentPassword: value })}
          autoComplete="current-password"
        />
      </div>
      <p className="ba-inline-note">
        School and branch contact emails do not count as registered owner logins.
        If this email already belongs to another AppUser, the backend will identify
        that separately because AppUser login emails must remain unique.
      </p>
    </SettingsModal>
  );
}

function TransferOwnershipSheet({
  currentOwner,
  users,
  candidate,
  form,
  saving,
  message,
  update,
  save,
  close,
}: {
  currentOwner: OwnerUser | null;
  users: OwnerUser[];
  candidate: OwnerUser | null;
  form: TransferOwnershipForm;
  saving: boolean;
  message: string;
  update: (patch: Partial<TransferOwnershipForm>) => void;
  save: (event?: React.FormEvent) => void | Promise<void>;
  close: () => void;
}) {
  const candidates = users.filter((user) => {
    if (!user?.id || user.id === currentOwner?.id || user.active === false) return false;
    const role = String(user.role || "").toLowerCase();
    return role !== "developer" && role !== "platform_team";
  });

  const selected =
    candidate ||
    candidates.find((user) => String(user.id) === form.targetUserId) ||
    null;

  return (
    <SettingsModal
      title="Transfer Ownership"
      text="Move the complete Eleeveon Account owner identity to an existing user. The new owner keeps their existing email, password and lower memberships."
      saving={saving}
      message={message}
      onSubmit={save}
      close={close}
      submitLabel="Transfer Ownership"
    >
      <div className="ba-transfer-warning">
        <strong>This is a complete ownership transfer.</strong>
        <span>
          Your owner/super-admin authority will be removed. If you have no other
          active lower membership, your login will be deactivated. Existing owner
          sessions are revoked after the transfer.
        </span>
      </div>

      <div className="ba-form">
        <label className="wide">
          <span>New Owner</span>
          <select
            value={form.targetUserId}
            onChange={(event) => update({ targetUserId: event.target.value })}
          >
            <option value="">Select an existing account user</option>
            {candidates.map((user) => (
              <option key={user.id} value={user.id}>
                {safeText(user.fullName, "Unnamed user")} · {safeText(user.email, "No email")} · {titleCase(user.role)}
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <div className="ba-transfer-summary wide">
            <div>
              <span>New owner</span>
              <strong>{safeText(selected.fullName, "Unnamed user")}</strong>
              <small>{safeText(selected.email, "No email")}</small>
            </div>
            <div>
              <span>Existing password</span>
              <strong>Preserved</strong>
              <small>Their password hash is not changed or copied.</small>
            </div>
            <div>
              <span>Existing memberships</span>
              <strong>Preserved</strong>
              <small>Branch/school roles stay available alongside owner access.</small>
            </div>
          </div>
        )}

        <PasswordInput
          wide
          label="Current Owner Password"
          value={form.currentPassword}
          onChange={(value) => update({ currentPassword: value })}
          autoComplete="current-password"
        />

        <TextInput
          wide
          label='Type "TRANSFER" to Confirm'
          value={form.confirmation}
          onChange={(value) => update({ confirmation: value })}
          placeholder="TRANSFER"
          autoComplete="off"
        />
      </div>

      <p className="ba-inline-note danger-note">
        After completion, the new owner signs in using their existing email and
        the same password they already use now. This browser will be signed out
        because it belongs to the former owner.
      </p>
    </SettingsModal>
  );
}

function ChangePasswordSheet({
  form,
  saving,
  message,
  update,
  save,
  close,
}: {
  form: PasswordForm;
  saving: boolean;
  message: string;
  update: (patch: Partial<PasswordForm>) => void;
  save: (event?: React.FormEvent) => void | Promise<void>;
  close: () => void;
}) {
  return (
    <SettingsModal
      title="Change Password"
      text="Confirm your current password, then choose a new password."
      saving={saving}
      message={message}
      onSubmit={save}
      close={close}
      submitLabel="Change Password"
    >
      <div className="ba-form">
        <PasswordInput
          wide
          label="Current Password"
          value={form.currentPassword}
          onChange={(value) => update({ currentPassword: value })}
          autoComplete="current-password"
        />
        <PasswordInput
          label="New Password"
          value={form.newPassword}
          onChange={(value) => update({ newPassword: value })}
          autoComplete="new-password"
        />
        <PasswordInput
          label="Confirm New Password"
          value={form.confirmPassword}
          onChange={(value) => update({ confirmPassword: value })}
          autoComplete="new-password"
        />
      </div>
    </SettingsModal>
  );
}

function SyncSheet({
  settings,
  saving,
  message,
  updateSettings,
  saveSettings,
  close,
}: {
  settings: SettingsForm;
  saving: boolean;
  message: string;
  updateSettings: <K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ) => void;
  saveSettings: (event?: React.FormEvent) => void | Promise<void>;
  close: () => void;
}) {
  return (
    <SettingsModal
      title="Sync & Backup"
      text="Control offline behavior, login sync and backup rhythm."
      saving={saving}
      message={message}
      onSubmit={saveSettings}
      close={close}
      submitLabel="Save Sync"
    >
      <div className="ba-toggle-grid">
        <ToggleCard
          title="Offline Mode"
          note="Allow school work to continue in IndexedDB when internet is unavailable."
          value={settings.allowOfflineMode}
          onToggle={() =>
            updateSettings("allowOfflineMode", !settings.allowOfflineMode)
          }
        />
        <ToggleCard
          title="Auto Sync on Login"
          note="Try to sync pending records when a user signs in."
          value={settings.autoSyncOnLogin}
          onToggle={() =>
            updateSettings("autoSyncOnLogin", !settings.autoSyncOnLogin)
          }
        />
      </div>
      <div className="ba-form compact top-gap">
        <label>
          <span>Backup Frequency</span>
          <select
            value={settings.backupFrequency}
            onChange={(event) =>
              updateSettings("backupFrequency", event.target.value)
            }
          >
            <option value="manual">Manual only</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>
    </SettingsModal>
  );
}

function ProtectedSheet({
  account,
  summary,
  close,
}: {
  account: AccountData | null;
  summary: any;
  close: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Protected Values</h2>
            <p>
              These values are read-only here and controlled by backend
              billing/platform rules.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close protected values"
          >
            ✕
          </button>
        </div>
        <div className="ba-protected-grid">
          <Detail label="Account Status" value={account?.status || "active"} />
          <Detail label="Plan" value={summary.plan} />
          <Detail label="Plan Code" value={summary.planCode} />
          <Detail label="Subscription" value={summary.subscriptionStatus} />
          <Detail label="Billing Cycle" value={summary.billingCycle} />
          <Detail label="Period Ends" value={safeDate(summary.periodEnd)} />
          <Detail
            label="API Access"
            value={booleanLabel(Boolean(account?.subscription?.plan?.apiAccess))}
          />
          <Detail
            label="Cloud Backup"
            value={booleanLabel(Boolean(account?.subscription?.plan?.cloudBackup))}
          />
          <Detail
            label="Advanced Analytics"
            value={booleanLabel(
              Boolean(account?.subscription?.plan?.advancedAnalytics),
            )}
          />
          <Detail label="Users" value={summary.users} />
          <Detail label="Invoices" value={summary.invoices} />
          <Detail label="Payments" value={summary.payments} />
        </div>
      </section>
    </div>
  );
}

function SettingsModal({
  title,
  text,
  saving,
  message,
  submitLabel,
  children,
  onSubmit,
  close,
}: {
  title: string;
  text: string;
  saving: boolean;
  message: string;
  submitLabel: string;
  children: React.ReactNode;
  onSubmit: (event?: React.FormEvent) => void | Promise<void>;
  close: () => void;
}) {
  return (
    <div className="ba-modal-backdrop" role="dialog" aria-modal="true">
      <form className="ba-modal settings-modal" onSubmit={onSubmit}>
        <div className="ba-modal-head">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
          <button type="button" onClick={close} aria-label={`Close ${title}`}>
            ✕
          </button>
        </div>
        {message && <section className="ba-toast error">{message}</section>}
        <section className="ba-form-section">{children}</section>
        <div className="ba-modal-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  wide = false,
  readOnly = false,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className={wide ? "wide" : undefined}>
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        autoComplete={autoComplete}
      />
    </label>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  wide = false,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className={wide ? "wide" : undefined}>
      <span>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
      />
    </label>
  );
}

function TextareaInput({
  label,
  value,
  onChange,
  placeholder,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "wide" : undefined}>
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function ToggleCard({
  title,
  note,
  value,
  onToggle,
}: {
  title: string;
  note: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="ba-toggle-card">
      <div>
        <h3>{title}</h3>
        <p>{note}</p>
        <Chip tone={value ? "green" : "gray"}>
          {value ? "Enabled" : "Disabled"}
        </Chip>
      </div>
      <button
        type="button"
        className={`ba-switch ${value ? "on" : ""}`}
        onClick={onToggle}
        aria-pressed={value}
      >
        <span />
      </button>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ba-detail">
      <span>{label}</span>
      <strong>{value}</strong>
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
          <input
            type="file"
            accept="image/*"
            onChange={(event) => handleImageUpload(field, event.target.files?.[0])}
            hidden
          />
        </label>
        <button
          type="button"
          className="ba-media-button secondary"
          onClick={() => openCameraForField(field)}
        >
          Take Photo
        </button>
      </div>
      <small className="ba-media-hint">
        Upload from files or take a camera photo. It is optimized and saved as a
        media asset.
      </small>
      {preview && (
        <img
          src={preview}
          alt={`${title} preview`}
          className={banner ? "ba-preview-banner" : "ba-preview-photo"}
        />
      )}
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
  const title =
    field === "logo"
      ? `Take ${entityLabel} Logo`
      : field === "bannerImage"
        ? `Take ${entityLabel} Banner`
        : `Take ${entityLabel} Photo`;

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
              Use the live camera preview, then capture. The image will be
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

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.ba-page { --ease: cubic-bezier(.2,.8,.2,1); min-height: 100dvh; width: 100%; max-width: 100%; min-width: 0; padding: calc(8px * var(--local-density-scale, 1)); padding-bottom: max(40px, env(safe-area-inset-bottom)); background: radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem), var(--bg, #f7f8fb); color: var(--text, #111827); font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); font-size: var(--font-size, 14px); overflow-x: hidden; }
.ba-page *, .ba-page *::before, .ba-page *::after { box-sizing: border-box; min-width: 0; }
.ba-page button, .ba-page input, .ba-page select, .ba-page textarea { font: inherit; max-width: 100%; }
.ba-page button { -webkit-tap-highlight-color: transparent; }
.ba-page input, .ba-page select, .ba-page textarea { width: 100%; min-height: 44px; border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10))); border-radius: 16px; padding: 0 12px; background: var(--input-bg, var(--surface, #fff)); color: var(--input-text, var(--text, #111827)); outline: none; font-weight: 750; }
.ba-page input:focus, .ba-page select:focus, .ba-page textarea:focus { border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10))); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent); }
.ba-state, .ba-search-card, .ba-profile-panel, .ba-sheet, .ba-modal, .ba-toggle-card, .ba-detail { background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); box-shadow: 0 12px 28px rgba(15,23,42,.045); }
.ba-state { min-height: min(420px, calc(100dvh - 32px)); width: min(520px, 100%); margin: 0 auto; display: grid; place-items: center; align-content: center; gap: 10px; padding: 22px; border-radius: 28px; text-align: center; }
.ba-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent); border-top-color: var(--ba-primary); animation: spin .8s linear infinite; }
.ba-state h2 { margin: 0; font-size: 22px; font-weight: 1000; letter-spacing: -.04em; }
.ba-state p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.ba-toast, .ba-notice { position: sticky; top: 8px; z-index: 40; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; padding: 12px 14px; border-radius: 18px; font-size: 13px; font-weight: 850; box-shadow: 0 18px 40px rgba(15,23,42,.12); }
.ba-toast.success, .ba-notice { background: rgba(34,197,94,.14); color: #166534; } .ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; } .ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }
.ba-toast button { border: 0; background: transparent; color: currentColor; font-weight: 1000; cursor: pointer; }
.ba-icon-button, .ba-filter-button, .ba-add-inline { width: 42px; height: 42px; border: 1px solid var(--border, rgba(0,0,0,.10)); border-radius: 999px; display: grid; place-items: center; background: var(--card-bg, var(--surface,#fff)); color: var(--text,#111827); font-size: 18px; font-weight: 1000; cursor: pointer; box-shadow: 0 10px 22px rgba(15,23,42,.045); }
.ba-add-inline { flex: 0 0 42px; border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; font-size: 18px; line-height: 1; box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent); }
.ba-search-card { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 8px; align-items: center; margin-top: 2px; padding: 8px; border-radius: 24px; }
.ba-search { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; min-height: 44px; padding: 0 11px; border-radius: 18px; background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent); }
.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input { min-height: 42px; border: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 14px; cursor: default; }
.ba-slider-icon { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.ba-filter-button { color: var(--ba-primary); background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff)); }
.ba-profile-panel { max-width: 1180px; margin: 10px auto 0; padding: 12px; border-radius: 24px; }
.ba-profile-panel-head { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: start; gap: 10px; padding: 4px 2px 10px; border-bottom: 1px solid var(--border,rgba(0,0,0,.08)); }
.ba-profile-panel-head span { color: var(--muted,#64748b); font-size: 10px; font-weight: 1000; text-transform: uppercase; letter-spacing: .08em; }
.ba-profile-panel-head h2 { margin: 3px 0 0; color: var(--text,#111827); font-size: 16px; font-weight: 1000; letter-spacing: -.04em; }
.ba-profile-panel-head p { margin: 4px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.45; font-weight: 750; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ba-profile-detail-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; margin-top: 10px; }
.ba-profile-detail { width: 100%; padding: 10px; border-radius: 18px; background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent); border: 1px solid color-mix(in srgb, var(--border,rgba(0,0,0,.10)) 70%, transparent); text-align: left; cursor: pointer; }
.ba-profile-detail b { display: block; color: var(--muted,#64748b); font-size: 10px; font-weight: 1000; text-transform: uppercase; letter-spacing: .07em; }
.ba-profile-detail strong { display: block; margin-top: 4px; color: var(--text,#111827); font-size: 13px; font-weight: 1000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-profile-detail small { display: block; margin-top: 3px; color: var(--muted,#64748b); font-size: 11px; line-height: 1.35; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-profile-metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 7px; margin-top: 9px; }
.ba-profile-metrics span { min-height: 54px; display: grid; place-items: center; align-content: center; gap: 2px; padding: 8px 5px; border-radius: 17px; background: color-mix(in srgb, var(--ba-primary) 8%, transparent); color: var(--ba-primary); text-align: center; }
.ba-profile-metrics b { max-width: 100%; font-size: 15px; font-weight: 1000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-profile-metrics small { color: var(--muted,#64748b); font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .05em; }
.ba-profile-note { margin: 9px 2px 0; color: var(--muted,#64748b); font-size: 11px; line-height: 1.55; font-weight: 750; }
.ba-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; }
.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; } .ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; } .ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; } .ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); } .ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; } .ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.ba-sheet-backdrop, .ba-modal-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; padding: 10px; background: rgba(15,23,42,.50); backdrop-filter: blur(12px); }
.ba-sheet, .ba-modal { width: min(760px, 100%); max-height: min(88dvh, 760px); overflow-y: auto; padding: 14px; border-radius: 28px 28px 22px 22px; box-shadow: 0 30px 90px rgba(15,23,42,.32); animation: sheetIn .18s var(--ease); }
.ba-sheet.small { width: min(520px, 100%); }
.ba-modal { width: min(980px, 100%); max-height: min(92dvh, 900px); }
@keyframes sheetIn { from { transform: translateY(16px); opacity: .7; } to { transform: translateY(0); opacity: 1; } }
.ba-sheet-head, .ba-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; }
.ba-sheet-head h2, .ba-modal-head h2 { margin: 0; color: var(--text,#111827); font-size: 21px; font-weight: 1000; letter-spacing: -.05em; }
.ba-sheet-head p, .ba-modal-head p { margin: 5px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; font-weight: 750; }
.ba-sheet-head button, .ba-modal-head button { width: 38px; height: 38px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; background: var(--surface,#fff); color: var(--text,#111827); font-weight: 1000; cursor: pointer; flex: 0 0 auto; }
.ba-modal-actions { position: sticky; bottom: -14px; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding: 12px 0 2px; background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent); }
.ba-modal-actions button { min-height: 42px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 16px; background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); color: var(--text,#111827); font-size: 12px; font-weight: 950; cursor: pointer; }
.ba-modal-actions button:last-child { border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent); }
.ba-modal-actions button:disabled { opacity: .65; cursor: not-allowed; }
.ba-menu-list { display: grid; gap: 8px; }
.ba-menu-list button { width: 100%; display: grid; grid-template-columns: 42px minmax(0,1fr); column-gap: 10px; align-items: center; min-height: 58px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 18px; padding: 9px; background: var(--surface,#fff); color: var(--text,#111827); text-align: left; cursor: pointer; }
.ba-menu-list button span { grid-row: span 2; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 16px; background: color-mix(in srgb, var(--ba-primary) 10%, transparent); color: var(--ba-primary); font-weight: 1000; }
.ba-menu-list button b, .ba-menu-list button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-menu-list button b { font-size: 13px; font-weight: 1000; } .ba-menu-list button small { margin-top: 2px; color: var(--muted,#64748b); font-size: 11px; font-weight: 750; }
.ba-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; } .ba-form.compact { gap: 9px; } .top-gap { margin-top: 10px; }
.ba-form label { display: grid; gap: 6px; min-width: 0; } .ba-form span { color: var(--muted,#64748b); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.ba-form .wide { grid-column: 1 / -1; }
.ba-form-section { padding: 12px 0; border-top: 1px solid var(--border,rgba(0,0,0,.08)); } .ba-form-section:first-of-type { border-top: 0; padding-top: 0; }
.ba-form-section h3 { margin: 0 0 10px; color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.03em; }
.ba-page textarea { min-height: 92px; padding: 12px; resize: vertical; line-height: 1.55; }
.ba-media-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.ba-media-button { min-height: 40px; border: 1px solid var(--ba-primary); border-radius: 999px; padding: 0 14px; display: inline-flex; align-items: center; justify-content: center; background: var(--ba-primary); color: #fff !important; font-size: 12px; font-weight: 950; letter-spacing: 0 !important; text-transform: none !important; cursor: pointer; text-align: center; box-shadow: 0 12px 26px color-mix(in srgb, var(--ba-primary) 18%, transparent); }
.ba-media-button.secondary { background: var(--surface, #fff); color: var(--ba-primary) !important; box-shadow: none; }
.ba-media-button input { display: none; }
.ba-media-hint { color: var(--muted,#64748b); font-size: 11px; font-weight: 750; line-height: 1.4; }
.ba-preview-photo { width: 96px; height: 96px; object-fit: cover; border-radius: 22px; border: 1px solid var(--border,rgba(0,0,0,.10)); }
.ba-preview-banner { width: 100%; height: 130px; object-fit: cover; border-radius: 22px; border: 1px solid var(--border,rgba(0,0,0,.10)); }
.ba-toggle-grid, .ba-protected-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; }
.ba-toggle-card { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 12px; padding: 12px; border-radius: 20px; }
.ba-toggle-card h3 { margin: 0; font-size: 14px; font-weight: 1000; letter-spacing: -.03em; }
.ba-toggle-card p { margin: 4px 0 8px; color: var(--muted,#64748b); font-size: 12px; line-height: 1.45; }
.ba-switch { width: 58px; height: 34px; flex: 0 0 auto; border-radius: 999px; border: 0; padding: 3px; background: rgba(100,116,139,.22); cursor: pointer; }
.ba-switch span { display: block; width: 28px; height: 28px; border-radius: 999px; background: #fff; box-shadow: 0 8px 18px rgba(15,23,42,.18); transition: transform .18s ease; }
.ba-switch.on { background: rgba(34,197,94,.35); } .ba-switch.on span { transform: translateX(24px); }
.ba-detail { min-width: 0; padding: 10px; border-radius: 18px; background: color-mix(in srgb,var(--ba-primary) 5%,var(--surface,#fff)); }
.ba-detail span { display: block; color: var(--muted,#64748b); font-size: 10px; font-weight: 1000; text-transform: uppercase; letter-spacing: .07em; }
.ba-detail strong { display: block; margin-top: 4px; font-size: 13px; font-weight: 1000; overflow-wrap: anywhere; }
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
@media (min-width: 680px) { .ba-page { padding: calc(12px * var(--local-density-scale,1)); padding-bottom: 44px; } .ba-search-card { grid-template-columns: minmax(0,1fr) 48px 48px 48px; } .ba-profile-detail-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } .ba-form { grid-template-columns: repeat(2, minmax(0,1fr)); } .ba-toggle-grid, .ba-protected-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } .ba-modal-backdrop, .ba-sheet-backdrop { place-items: center; padding: 18px; } .ba-sheet, .ba-modal { border-radius: 28px; padding: 18px; } }
@media (min-width: 1040px) { .ba-page { padding: calc(16px * var(--local-density-scale,1)); padding-bottom: 48px; } .ba-search-card, .ba-profile-panel { max-width: 1180px; margin-left: auto; margin-right: auto; } .ba-form { grid-template-columns: repeat(3, minmax(0,1fr)); } .ba-protected-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
@media (max-width: 520px) { .ba-profile-metrics { grid-template-columns: repeat(2, minmax(0,1fr)); } .ba-page { padding: calc(7px * var(--local-density-scale,1)); padding-bottom: max(38px, env(safe-area-inset-bottom)); } .ba-icon-button, .ba-filter-button, .ba-add-inline { width: 40px; height: 40px; } .ba-sheet, .ba-modal { border-radius: 24px 24px 18px 18px; padding: 12px; } .ba-modal-actions { display: grid; grid-template-columns: minmax(0,1fr); } .ba-modal-actions button { width: 100%; } .ba-media-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .ba-media-button, .ba-camera-actions button { width: 100%; } .ba-camera-actions { display: grid; grid-template-columns: minmax(0, 1fr); } .ba-camera-modal { border-radius: 22px; padding: 11px; } }
.ba-identity-card { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 12px; border-radius: 20px; border: 1px solid var(--border,rgba(0,0,0,.10)); background: color-mix(in srgb,var(--ba-primary) 5%,var(--surface,#fff)); }
.ba-identity-card h3 { margin: 0; font-size: 14px; font-weight: 1000; letter-spacing: -.03em; }
.ba-identity-card p { margin: 4px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.45; font-weight: 750; overflow-wrap: anywhere; }
.ba-identity-card small { display: block; margin-top: 5px; color: var(--muted,#64748b); font-size: 10px; font-weight: 850; }
.ba-security-actions { display: grid; gap: 8px; margin-bottom: 12px; }
.ba-security-action { width: 100%; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; align-items: center; min-height: 62px; padding: 10px 12px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 18px; background: var(--surface,#fff); color: var(--text,#111827); text-align: left; cursor: pointer; }
.ba-security-action b { display: block; font-size: 13px; font-weight: 1000; }
.ba-security-action small { display: block; margin-top: 3px; color: var(--muted,#64748b); font-size: 11px; line-height: 1.4; font-weight: 750; overflow-wrap: anywhere; }
.ba-security-action span { color: var(--ba-primary); font-size: 18px; font-weight: 1000; }
.ba-security-action.danger { border-color: rgba(220,38,38,.24); background: rgba(239,68,68,.055); }
.ba-security-action.danger b, .ba-security-action.danger span { color: #b91c1c; }
.ba-transfer-warning { display: grid; gap: 5px; margin-bottom: 12px; padding: 12px; border-radius: 18px; border: 1px solid rgba(220,38,38,.20); background: rgba(239,68,68,.07); }
.ba-transfer-warning strong { color: #991b1b; font-size: 13px; font-weight: 1000; }
.ba-transfer-warning span { color: var(--muted,#64748b); font-size: 11px; line-height: 1.5; font-weight: 750; }
.ba-transfer-summary { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; padding: 10px; border-radius: 18px; background: color-mix(in srgb,var(--ba-primary) 6%,transparent); border: 1px solid color-mix(in srgb,var(--ba-primary) 16%,var(--border,rgba(0,0,0,.10))); }
.ba-transfer-summary div { min-width: 0; padding: 8px; border-radius: 14px; background: var(--surface,#fff); border: 1px solid var(--border,rgba(0,0,0,.08)); }
.ba-transfer-summary span, .ba-transfer-summary strong, .ba-transfer-summary small { display: block; }
.ba-transfer-summary span { color: var(--muted,#64748b); font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .05em; }
.ba-transfer-summary strong { margin-top: 3px; font-size: 13px; font-weight: 1000; overflow-wrap: anywhere; }
.ba-transfer-summary small { margin-top: 3px; color: var(--muted,#64748b); font-size: 11px; line-height: 1.4; font-weight: 750; overflow-wrap: anywhere; }
.danger-note { background: rgba(239,68,68,.07) !important; color: #991b1b !important; }
@media (min-width: 680px) { .ba-transfer-summary { grid-template-columns: repeat(3,minmax(0,1fr)); } }
.ba-inline-note { margin: 8px 0 0; padding: 10px 12px; border-radius: 16px; background: color-mix(in srgb,var(--ba-primary) 7%,transparent); color: var(--muted,#64748b); font-size: 11px; line-height: 1.5; font-weight: 750; }
.ba-form input[readonly] { background: color-mix(in srgb,var(--muted,#64748b) 7%,var(--surface,#fff)); color: var(--muted,#64748b); cursor: default; }

`;
