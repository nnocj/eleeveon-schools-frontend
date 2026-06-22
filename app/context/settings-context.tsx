"use client";

/**
 * context/settings-context.tsx
 * ---------------------------------------------------------
 * SCHOOL-BRANCH SETTINGS PROVIDER
 * ---------------------------------------------------------
 *
 * Architecture:
 * School -> Branch -> SchoolBranchSettings
 *
 * There is no global settings row anymore.
 * Every setting belongs to a specific school + branch.
 *
 * This file keeps the old API names for compatibility:
 * - SettingsProvider
 * - useSettings()
 * - settings
 * - updateSettings()
 * - refreshSettings()
 *
 * Existing pages can continue using useSettings(), but the returned
 * settings object is now the active school-branch settings row.
 *
 * IMPORTANT:
 * This provider intentionally does NOT use useActiveBranch(), because
 * active-branch-context may use useSettings(). To avoid circular provider
 * dependency, this provider resolves the active IDs from localStorage first,
 * then falls back to the first active school/branch in IndexedDB.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { db, SchoolBranchSetting } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { SyncStatus } from "../lib/constants/syncStatus";

// ======================================================
// TYPES
// ======================================================

type SettingsPatch = Partial<SchoolBranchSetting> & Record<string, any>;

type SettingsValue = SchoolBranchSetting & Record<string, any>;

type SettingsContextType = {
  settings: SettingsValue | null;
  loading: boolean;

  activeSchoolId: number | null;
  activeBranchId: number | null;

  updateSettings: (patch: SettingsPatch) => Promise<SettingsValue>;
  refreshSettings: () => Promise<void>;
  refreshSettingsForContext: (
    schoolId?: number | null,
    branchId?: number | null
  ) => Promise<void>;
};

// ======================================================
// STORAGE KEYS
// ======================================================

const SCHOOL_STORAGE_KEY = "activeSchoolId";
const BRANCH_STORAGE_KEY = "activeBranchId";

// ======================================================
// CONTEXT
// ======================================================

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

// ======================================================
// DEFAULTS
// ======================================================

const defaultSettings = (
  schoolId?: number | null,
  branchId?: number | null
): Partial<SchoolBranchSetting> & Record<string, any> => ({
  schoolId: schoolId || undefined,
  branchId: branchId || undefined,

  // Branch behavior
  mode: "manual",
  theme: "light",
  primaryColor: "#2f6fed",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 16,

  // Academic branch defaults
  academicYear: "",
  currentTerm: "Term 1",
  currentAcademicStructureId: undefined,
  currentAcademicPeriodId: undefined,

  // Branch-specific branding / visual assets
  logo: "",
  reportCardBackgroundImage: "",
  reportCardWatermark: "",
  reportCardSignatureImage: "",

  dashboardHeroImage: "",
  dashboardBannerImage: "",
  studentPortalImage: "",
  teacherPortalImage: "",
  classroomPlaceholderImage: "",
  subjectPlaceholderImage: "",

  schoolGalleryImages: [],
});

// ======================================================
// HELPERS
// ======================================================

function numberOrNull(value: string | null | undefined) {
  if (!value) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeSyncStatus(value: unknown): SyncStatus | undefined {
  if (!value) return undefined;

  const raw = String(value);
  const values = Object.values(SyncStatus) as string[];

  return values.includes(raw) ? (raw as unknown as SyncStatus) : undefined;
}

function toSchoolBranchSetting(
  value: Partial<SchoolBranchSetting> & Record<string, any>,
  fallbackSchoolId?: number | null,
  fallbackBranchId?: number | null
): SettingsValue {
  const normalized = normalizeSettings(
    value,
    fallbackSchoolId,
    fallbackBranchId
  );

  return {
    ...normalized,
    synced:
      normalizeSyncStatus(normalized.synced) ||
      normalizeSyncStatus((value as any).synced) ||
      SyncStatus.PENDING,
  } as SettingsValue;
}

function prepareSettingsSyncData(
  value: Partial<SchoolBranchSetting> & Record<string, any>,
  fallbackSchoolId?: number | null,
  fallbackBranchId?: number | null
): SettingsValue {
  const prepared = prepareSyncData(
    value as unknown as Record<string, any>
  ) as unknown as Partial<SchoolBranchSetting> & Record<string, any>;

  return toSchoolBranchSetting(
    prepared,
    fallbackSchoolId,
    fallbackBranchId
  );
}

function normalizeSettings(
  row: Partial<SchoolBranchSetting> & Record<string, any>,
  fallbackSchoolId?: number | null,
  fallbackBranchId?: number | null
): SettingsValue {
  const normalized = {
    ...defaultSettings(fallbackSchoolId, fallbackBranchId),
    ...row,
    schoolId: Number(row.schoolId || fallbackSchoolId || 0) || undefined,
    branchId: Number(row.branchId || fallbackBranchId || 0) || undefined,
    fontSize: Number(row.fontSize || 16),
    schoolGalleryImages: Array.isArray(row.schoolGalleryImages)
      ? row.schoolGalleryImages
      : [],
    synced:
      normalizeSyncStatus(row.synced) ||
      SyncStatus.PENDING,
  } as SettingsValue;

  return normalized;
}

async function resolveStoredOrFirstContext() {
  const storedSchoolId = numberOrNull(
    localStorage.getItem(SCHOOL_STORAGE_KEY)
  );

  const storedBranchId = numberOrNull(
    localStorage.getItem(BRANCH_STORAGE_KEY)
  );

  const [schoolRows, branchRows] = await Promise.all([
    db.schools.toArray(),
    db.branches.toArray(),
  ]);

  const schools = schoolRows.filter(
    (row) => !row.isDeleted && (row as any).active !== false
  );

  const branches = branchRows.filter(
    (row) => !row.isDeleted && row.active !== false
  );

  const storedSchoolExists = storedSchoolId
    ? schools.some((row) => row.id === storedSchoolId)
    : false;

  const resolvedSchoolId = storedSchoolExists
    ? storedSchoolId
    : schools[0]?.id || null;

  const branchesForSchool = resolvedSchoolId
    ? branches.filter((row) => row.schoolId === resolvedSchoolId)
    : [];

  const storedBranchExists = storedBranchId
    ? branchesForSchool.some((row) => row.id === storedBranchId)
    : false;

  const resolvedBranchId = storedBranchExists
    ? storedBranchId
    : branchesForSchool[0]?.id || null;

  if (resolvedSchoolId) {
    localStorage.setItem(SCHOOL_STORAGE_KEY, String(resolvedSchoolId));
  } else {
    localStorage.removeItem(SCHOOL_STORAGE_KEY);
  }

  if (resolvedBranchId) {
    localStorage.setItem(BRANCH_STORAGE_KEY, String(resolvedBranchId));
  } else {
    localStorage.removeItem(BRANCH_STORAGE_KEY);
  }

  return {
    schoolId: resolvedSchoolId,
    branchId: resolvedBranchId,
  };
}

async function getOrCreateSchoolBranchSettings(
  schoolId: number | null,
  branchId: number | null
) {
  if (!schoolId || !branchId) {
    return normalizeSettings(
      defaultSettings(schoolId, branchId),
      schoolId,
      branchId
    );
  }

  const rows = await db.schoolBranchSettings.toArray();

  const existing = rows
    .filter(
      (row) =>
        row.schoolId === schoolId &&
        row.branchId === branchId &&
        !row.isDeleted
    )
    .sort(
      (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    )[0];

  if (existing) {
    return normalizeSettings(
      existing as SettingsValue,
      schoolId,
      branchId
    );
  }

  const created = prepareSettingsSyncData(
    defaultSettings(schoolId, branchId),
    schoolId,
    branchId
  );

  const id = await db.schoolBranchSettings.add(
    created as SchoolBranchSetting
  );

  return normalizeSettings(
    {
      ...created,
      id: Number(id),
    },
    schoolId,
    branchId
  );
}

// ======================================================
// PROVIDER
// ======================================================

export function SettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<SettingsValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSchoolId, setActiveSchoolId] = useState<number | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null);

  // ======================================================
  // REFRESH SETTINGS FOR CURRENT/STORED CONTEXT
  // ======================================================

  const refreshSettings = useCallback(async () => {
    setLoading(true);

    try {
      const context = await resolveStoredOrFirstContext();

      setActiveSchoolId(context.schoolId);
      setActiveBranchId(context.branchId);

      const current = await getOrCreateSchoolBranchSettings(
        context.schoolId,
        context.branchId
      );

      setSettings(current);
    } catch (error) {
      console.error("Failed to load school branch settings:", error);

      setSettings(normalizeSettings(defaultSettings(), null, null));
    } finally {
      setLoading(false);
    }
  }, []);

  // ======================================================
  // REFRESH FOR EXPLICIT SCHOOL/BRANCH CONTEXT
  // ======================================================

  const refreshSettingsForContext = useCallback(
    async (schoolId?: number | null, branchId?: number | null) => {
      setLoading(true);

      try {
        const nextSchoolId = schoolId || null;
        const nextBranchId = branchId || null;

        setActiveSchoolId(nextSchoolId);
        setActiveBranchId(nextBranchId);

        if (nextSchoolId) {
          localStorage.setItem(SCHOOL_STORAGE_KEY, String(nextSchoolId));
        } else {
          localStorage.removeItem(SCHOOL_STORAGE_KEY);
        }

        if (nextBranchId) {
          localStorage.setItem(BRANCH_STORAGE_KEY, String(nextBranchId));
        } else {
          localStorage.removeItem(BRANCH_STORAGE_KEY);
        }

        const current = await getOrCreateSchoolBranchSettings(
          nextSchoolId,
          nextBranchId
        );

        setSettings(current);
      } catch (error) {
        console.error(
          "Failed to refresh school branch settings context:",
          error
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Keep settings in sync when another context file changes localStorage.
  useEffect(() => {
    const onStorage = () => {
      refreshSettings();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(
      "school-branch-context-changed",
      onStorage as EventListener
    );

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "school-branch-context-changed",
        onStorage as EventListener
      );
    };
  }, [refreshSettings]);

  // ======================================================
  // UPDATE ACTIVE SCHOOL-BRANCH SETTINGS
  // ======================================================

  const updateSettings = useCallback(
    async (patch: SettingsPatch) => {
      const targetSchoolId =
        Number(patch.schoolId || settings?.schoolId || activeSchoolId || 0) ||
        null;

      const targetBranchId =
        Number(patch.branchId || settings?.branchId || activeBranchId || 0) ||
        null;

      if (!targetSchoolId || !targetBranchId) {
        const fallback = normalizeSettings(
          {
            ...(settings || defaultSettings(targetSchoolId, targetBranchId)),
            ...patch,
          },
          targetSchoolId,
          targetBranchId
        );

        setSettings(fallback);
        return fallback;
      }

      const existing = await getOrCreateSchoolBranchSettings(
        targetSchoolId,
        targetBranchId
      );

      const next = prepareSettingsSyncData(
        {
          ...existing,
          ...patch,
          id: existing.id,
          schoolId: targetSchoolId,
          branchId: targetBranchId,
          isDeleted: false,
          schoolGalleryImages: Array.isArray(patch.schoolGalleryImages)
            ? patch.schoolGalleryImages
            : Array.isArray(existing.schoolGalleryImages)
            ? existing.schoolGalleryImages
            : [],
        },
        targetSchoolId,
        targetBranchId
      );

      if (existing.id) {
        await db.schoolBranchSettings.update(existing.id, {
          schoolId: targetSchoolId,
          branchId: targetBranchId,

          mode: next.mode,
          theme: next.theme,
          primaryColor: next.primaryColor,
          fontFamily: next.fontFamily,
          fontSize: next.fontSize,

          academicYear: next.academicYear,
          currentTerm: next.currentTerm,
          currentAcademicStructureId: next.currentAcademicStructureId,
          currentAcademicPeriodId: next.currentAcademicPeriodId,

          logo: next.logo,
          reportCardBackgroundImage: next.reportCardBackgroundImage,
          reportCardWatermark: next.reportCardWatermark,
          reportCardSignatureImage: next.reportCardSignatureImage,

          dashboardHeroImage: next.dashboardHeroImage,
          dashboardBannerImage: next.dashboardBannerImage,
          studentPortalImage: next.studentPortalImage,
          teacherPortalImage: next.teacherPortalImage,
          classroomPlaceholderImage: next.classroomPlaceholderImage,
          subjectPlaceholderImage: next.subjectPlaceholderImage,

          schoolGalleryImages: next.schoolGalleryImages,

          accountId: next.accountId,
          cloudId: next.cloudId,
          createdAt: next.createdAt,
          updatedAt: next.updatedAt,
          version: next.version,
          deviceId: next.deviceId,
          synced: next.synced,
          isDeleted: false,
        } as Partial<SchoolBranchSetting>);
      } else {
        const id = await db.schoolBranchSettings.add(
          next as SchoolBranchSetting
        );

        next.id = Number(id);
      }

      setActiveSchoolId(targetSchoolId);
      setActiveBranchId(targetBranchId);
      setSettings(next);

      localStorage.setItem(SCHOOL_STORAGE_KEY, String(targetSchoolId));
      localStorage.setItem(BRANCH_STORAGE_KEY, String(targetBranchId));

      window.dispatchEvent(new Event("school-branch-settings-updated"));

      return next;
    },
    [settings, activeSchoolId, activeBranchId]
  );

  // ======================================================
  // VALUE
  // ======================================================

  const value = useMemo<SettingsContextType>(
    () => ({
      settings,
      loading,
      activeSchoolId,
      activeBranchId,
      updateSettings,
      refreshSettings,
      refreshSettingsForContext,
    }),
    [
      settings,
      loading,
      activeSchoolId,
      activeBranchId,
      updateSettings,
      refreshSettings,
      refreshSettingsForContext,
    ]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// ======================================================
// HOOK
// ======================================================

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings must be used inside SettingsProvider");
  }

  return context;
}
