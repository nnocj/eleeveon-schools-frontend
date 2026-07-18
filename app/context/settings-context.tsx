"use client";

/**
 * app/context/settings-context.tsx
 * --------------------------------------------------------------------------
 * Role-aware settings resolver.
 *
 * Branch settings remain cached and editable, but they become effective only
 * for branch-scoped memberships. Owner, Developer, Platform Team, and school
 * roles never inherit a previously active branch row.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { db, type SchoolBranchSetting } from "../lib/db";
import type { UserMembership } from "../lib/auth/roleRedirect";
import { getStoredActiveMembership } from "../lib/auth/activeMembership";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { SyncStatus } from "../lib/constants/syncStatus";
import {
  appearanceIdentityFor,
  appearanceScopeForRole,
  normalizeAppearanceRole,
  type AppearanceScope,
} from "../lib/theme/appearanceScope";
import {
  PLATFORM_APPEARANCE_DEFAULTS,
  type ScopedAppearanceSettings,
} from "../lib/theme/applyScopedAppearance";

export type SettingsPatch = Partial<SchoolBranchSetting> & Record<string, any>;
export type SettingsValue = SchoolBranchSetting & Record<string, any>;
export type SettingsLoadedFor = {
  role: string;
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  key: string;
};

export type SettingsContextValue = {
  /** Backward-compatible alias for effectiveSettings. */
  settings: SettingsValue | ScopedAppearanceSettings | null;
  effectiveSettings: SettingsValue | ScopedAppearanceSettings | null;
  effectiveScope: AppearanceScope;

  platformSettings: ScopedAppearanceSettings | null;
  accountSettings: ScopedAppearanceSettings | null;
  schoolSettings: ScopedAppearanceSettings | null;
  branchSettings: SettingsValue | null;

  ready: boolean;
  loading: boolean;
  loadedFor: SettingsLoadedFor | null;

  activeSchoolId: number | null;
  activeBranchId: number | null;

  refreshSettings: () => Promise<void>;
  refreshSettingsForContext: (
    schoolId?: number | null,
    branchId?: number | null,
  ) => Promise<void>;
  hydrateSettingsForMembership: (
    membership: UserMembership,
    preferredSettings?: Record<string, any> | null,
  ) => Promise<SettingsValue | ScopedAppearanceSettings | null>;
  updateSettings: (patch: SettingsPatch) => Promise<SettingsValue>;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const CURRENT_SETTINGS_POINTER = "eleeveon_current_workspace_settings";
const SCOPED_SETTINGS_PREFIX = "eleeveon_cached_settings";

const platformSettings: ScopedAppearanceSettings = {
  ...PLATFORM_APPEARANCE_DEFAULTS,
};

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeSyncStatus(value: unknown): SyncStatus | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  switch (parsed) {
    case SyncStatus.PENDING:
    case SyncStatus.SYNCED:
    case SyncStatus.FAILED:
    case SyncStatus.CONFLICT:
      return parsed;
    default:
      return undefined;
  }
}

function defaultBranchSettings(
  accountId: string,
  schoolId: number,
  branchId: number,
): SettingsValue {
  return {
    accountId,
    schoolId,
    branchId,
    mode: "manual",
    theme: "light",
    primaryColor: PLATFORM_APPEARANCE_DEFAULTS.primaryColor,
    fontFamily: PLATFORM_APPEARANCE_DEFAULTS.fontFamily,
    fontSize: 16,
    academicYear: "",
    currentTerm: "Term 1",
    logo: "",
    schoolGalleryImages: [],
    synced: SyncStatus.PENDING,

    // Required local-first sync metadata. These defaults keep the temporary
    // first-entry settings structurally valid until the exact branch row loads.
    updatedAt: Date.now(),
    version: 1,
    deviceId: "",
  };
}

function normalizeBranchSettings(
  row: Record<string, any>,
  accountId: string,
  schoolId: number,
  branchId: number,
): SettingsValue {
  const base = defaultBranchSettings(accountId, schoolId, branchId);
  return {
    ...base,
    ...row,
    accountId: cleanString(row.accountId) ?? accountId,
    schoolId: positiveNumber(row.schoolId) ?? schoolId,
    branchId: positiveNumber(row.branchId) ?? branchId,
    fontSize: Number(row.fontSize || 16),
    schoolGalleryImages: Array.isArray(row.schoolGalleryImages)
      ? row.schoolGalleryImages
      : [],
    synced: normalizeSyncStatus(row.synced) || SyncStatus.PENDING,
  } as SettingsValue;
}

function scopedCacheKey(accountId: string, schoolId: number, branchId: number) {
  return [SCOPED_SETTINGS_PREFIX, accountId, schoolId, branchId].join(":");
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(value);
  try { window.localStorage.setItem(key, raw); } catch {}
  try { window.sessionStorage.setItem(key, raw); } catch {}
}

async function findExactBranchSettings(input: {
  accountId: string;
  schoolId: number;
  branchId: number;
  preferred?: Record<string, any> | null;
}) {
  const preferred = input.preferred;
  if (
    preferred &&
    String(preferred.accountId || input.accountId) === input.accountId &&
    Number(preferred.schoolId || 0) === input.schoolId &&
    Number(preferred.branchId || 0) === input.branchId &&
    !preferred.isDeleted
  ) {
    return normalizeBranchSettings(preferred, input.accountId, input.schoolId, input.branchId);
  }

  const rows = await db.schoolBranchSettings.toArray();
  const exact = rows
    .filter((row: any) =>
      !row.isDeleted &&
      String(row.accountId || "") === input.accountId &&
      Number(row.schoolId || 0) === input.schoolId &&
      Number(row.branchId || 0) === input.branchId,
    )
    .sort((a: any, b: any) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];

  if (exact) {
    return normalizeBranchSettings(exact as any, input.accountId, input.schoolId, input.branchId);
  }

  const cached = readJson<any>(scopedCacheKey(input.accountId, input.schoolId, input.branchId));
  const cachedSettings = cached?.settings || cached;
  if (
    cachedSettings &&
    String(cachedSettings.accountId || input.accountId) === input.accountId &&
    Number(cachedSettings.schoolId || 0) === input.schoolId &&
    Number(cachedSettings.branchId || 0) === input.branchId
  ) {
    return normalizeBranchSettings(cachedSettings, input.accountId, input.schoolId, input.branchId);
  }

  return null;
}

function baseSettingsForScope(scope: AppearanceScope): ScopedAppearanceSettings {
  if (scope === "platform") return { ...platformSettings };
  if (scope === "account") return { ...platformSettings };
  if (scope === "school") return { ...platformSettings };
  return { ...platformSettings };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [effectiveSettings, setEffectiveSettings] =
    useState<SettingsValue | ScopedAppearanceSettings | null>(null);
  const [effectiveScope, setEffectiveScope] = useState<AppearanceScope>("platform");
  const [accountSettings, setAccountSettings] = useState<ScopedAppearanceSettings | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<ScopedAppearanceSettings | null>(null);
  const [branchSettings, setBranchSettings] = useState<SettingsValue | null>(null);
  const [loadedFor, setLoadedFor] = useState<SettingsLoadedFor | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const hydrateSettingsForMembership = useCallback(async (
    membership: UserMembership,
    preferredSettings?: Record<string, any> | null,
  ) => {
    const request = ++requestRef.current;
    const identity = appearanceIdentityFor({
      role: membership.role,
      accountId: membership.accountId,
      schoolId: membership.schoolId,
      branchId: membership.branchId,
    });

    setLoading(true);
    setEffectiveScope(identity.scope);

    try {
      let resolved: SettingsValue | ScopedAppearanceSettings | null = null;

      if (identity.scope === "branch") {
        if (!identity.accountId || !identity.schoolId || !identity.branchId) {
          throw new Error("Branch appearance requires account, school, and branch context.");
        }
        const branchResolved: SettingsValue =
          (await findExactBranchSettings({
            accountId: identity.accountId,
            schoolId: identity.schoolId,
            branchId: identity.branchId,
            preferred: preferredSettings,
          })) ??
          defaultBranchSettings(
            identity.accountId,
            identity.schoolId,
            identity.branchId,
          );

        // Membership restoration can finish before workspace bootstrap has
        // populated Dexie. The valid defaults above keep the portal usable;
        // a later settings refresh replaces them with the exact branch row.
        resolved = branchResolved;

        if (request === requestRef.current) {
          setBranchSettings(branchResolved);
        }
      } else if (identity.scope === "school") {
        resolved = baseSettingsForScope("school");
        if (request === requestRef.current) setSchoolSettings(resolved);
      } else if (identity.scope === "account") {
        resolved = baseSettingsForScope("account");
        if (request === requestRef.current) setAccountSettings(resolved);
      } else {
        resolved = baseSettingsForScope("platform");
      }

      if (request !== requestRef.current) return resolved;

      setEffectiveSettings(resolved);
      setLoadedFor({
        role: normalizeAppearanceRole(membership.role),
        accountId: identity.accountId || undefined,
        schoolId: identity.schoolId || undefined,
        branchId: identity.branchId || undefined,
        key: identity.key,
      });

      if (identity.scope === "branch" && resolved) {
        const envelope = {
          accountId: identity.accountId,
          schoolId: identity.schoolId,
          branchId: identity.branchId,
          role: identity.role,
          appearanceScope: identity.scope,
          settings: resolved,
          cachedAt: Date.now(),
        };
        writeJson(scopedCacheKey(identity.accountId!, identity.schoolId!, identity.branchId!), envelope);
        writeJson(CURRENT_SETTINGS_POINTER, envelope);
      } else {
        writeJson(CURRENT_SETTINGS_POINTER, {
          accountId: identity.accountId,
          role: identity.role,
          appearanceScope: identity.scope,
          settings: resolved,
          cachedAt: Date.now(),
        });
      }

      return resolved;
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    const membership = getStoredActiveMembership();
    if (!membership) {
      setEffectiveScope("platform");
      setEffectiveSettings(platformSettings);
      setLoadedFor(null);
      setLoading(false);
      return;
    }
    await hydrateSettingsForMembership(membership);
  }, [hydrateSettingsForMembership]);

  const refreshSettingsForContext = useCallback(async (
    schoolId?: number | null,
    branchId?: number | null,
  ) => {
    const stored = getStoredActiveMembership();
    if (!stored) return refreshSettings();
    await hydrateSettingsForMembership({
      ...stored,
      schoolId: schoolId ?? stored.schoolId,
      branchId: branchId ?? stored.branchId,
    });
  }, [hydrateSettingsForMembership, refreshSettings]);

  const updateSettings = useCallback(async (patch: SettingsPatch) => {
    const membership = getStoredActiveMembership();
    const role = normalizeAppearanceRole(membership?.role);
    const scope = appearanceScopeForRole(role);
    if (scope !== "branch") {
      throw new Error("Branch Settings can only update a branch-scoped membership.");
    }

    const accountId = cleanString(patch.accountId || membership?.accountId);
    const schoolId = positiveNumber(patch.schoolId || membership?.schoolId);
    const branchId = positiveNumber(patch.branchId || membership?.branchId);
    if (!accountId || !schoolId || !branchId) {
      throw new Error("Account, school, and branch are required to save Branch Settings.");
    }

    const existing = await findExactBranchSettings({ accountId, schoolId, branchId });
    const prepared = prepareSyncData({
      ...(existing || defaultBranchSettings(accountId, schoolId, branchId)),
      ...patch,
      accountId,
      schoolId,
      branchId,
      isDeleted: false,
    } as any) as any;
    const next = normalizeBranchSettings(prepared, accountId, schoolId, branchId);

    if (existing?.id) {
      await db.schoolBranchSettings.update(existing.id, next as any);
      next.id = existing.id;
    } else {
      next.id = Number(await db.schoolBranchSettings.add(next as any));
    }

    setBranchSettings(next);
    setEffectiveScope("branch");
    setEffectiveSettings(next);
    const identity = appearanceIdentityFor({ role, accountId, schoolId, branchId });
    setLoadedFor({ role, accountId, schoolId, branchId, key: identity.key });

    const envelope = {
      accountId, schoolId, branchId, role,
      appearanceScope: "branch",
      settings: next,
      cachedAt: Date.now(),
    };
    writeJson(scopedCacheKey(accountId, schoolId, branchId), envelope);
    writeJson(CURRENT_SETTINGS_POINTER, envelope);
    window.dispatchEvent(new CustomEvent("school-branch-settings-updated", {
      detail: { accountId, schoolId, branchId, settings: next },
    }));
    return next;
  }, []);

  useEffect(() => {
    void refreshSettings().catch((error) => {
      console.error("Failed to restore role-aware settings:", error);
      setEffectiveSettings(platformSettings);
      setEffectiveScope("platform");
      setLoading(false);
    });
  }, [refreshSettings]);

  useEffect(() => {
    const handle = () => { void refreshSettings(); };
    window.addEventListener("active-membership-changed", handle);
    window.addEventListener("storage", handle);
    window.addEventListener("school-branch-settings-updated", handle);
    return () => {
      window.removeEventListener("active-membership-changed", handle);
      window.removeEventListener("storage", handle);
      window.removeEventListener("school-branch-settings-updated", handle);
    };
  }, [refreshSettings]);

  const ready = Boolean(!loading && effectiveSettings && loadedFor);
  const value = useMemo<SettingsContextValue>(() => ({
    settings: effectiveSettings,
    effectiveSettings,
    effectiveScope,
    platformSettings,
    accountSettings,
    schoolSettings,
    branchSettings,
    ready,
    loading,
    loadedFor,
    activeSchoolId: loadedFor?.schoolId || null,
    activeBranchId: loadedFor?.branchId || null,
    refreshSettings,
    refreshSettingsForContext,
    hydrateSettingsForMembership,
    updateSettings,
  }), [
    effectiveSettings, effectiveScope, accountSettings, schoolSettings,
    branchSettings, ready, loading, loadedFor, refreshSettings,
    refreshSettingsForContext, hydrateSettingsForMembership, updateSettings,
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}