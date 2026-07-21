"use client";

/**
 * active-branch-context.tsx
 * ---------------------------------------------------------
 * SECURE ACTIVE SCHOOL / BRANCH CONTROLLER
 * ---------------------------------------------------------
 *
 * Purpose:
 * - Prevent logged-out users from seeing active school/branch data.
 * - Scope all institution context by signed-in accountId.
 * - Keep Dexie + localStorage + settings context aligned.
 * - Avoid maximum update depth loops during sync bootstrap.
 *
 * Important fixes:
 * - refreshInstitution no longer depends on settings.schoolId/settings.branchId.
 * - updateSettings is guarded and not allowed to create a refresh loop.
 * - State setters avoid updates when the value is already the same.
 * - Logged-out state clears local institution context safely.
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

import { db, type Branch, type School } from "../lib/db";
import { useSettings } from "./settings-context";
import { useAccount } from "./account-context";
import { subscribeToAtomicLogout } from "../lib/auth/logout";
import { getSessionGeneration, isSessionGenerationCurrent } from "../lib/auth/sessionGeneration";
import { getStoredActiveMembership } from "../lib/auth/activeMembership";
import {
  appearanceScopeForRole,
  normalizeAppearanceRole,
} from "../lib/theme/appearanceScope";

// ======================================================
// TYPES
// ======================================================

export type ActiveInstitutionContextType = {
  activeSchoolId: string | null;
  activeSchool: School | null;
  schools: School[];
  setActiveSchoolId: (id: string | null) => Promise<void>;

  activeBranchId: string | null;
  activeBranch: Branch | null;
  branches: Branch[];
  allBranches: Branch[];
  setActiveBranchId: (id: string | null) => Promise<void>;

  loading: boolean;
  refreshInstitution: () => Promise<void>;
};

export type ActiveBranchContextType = ActiveInstitutionContextType;

type SettingsLike = {
  schoolId?: string;
  branchId?: string;
};

// ======================================================
// CONSTANTS
// ======================================================

const SCHOOL_STORAGE_KEY = "activeSchoolId";
const BRANCH_STORAGE_KEY = "activeBranchId";

const ActiveBranchContext = createContext<ActiveBranchContextType | undefined>(
  undefined
);

// ======================================================
// HELPERS
// ======================================================

function sameSchoolList(a: School[], b: School[]) {
  if (a.length !== b.length) return false;
  return a.every((row, index) => row.id === b[index]?.id && row.updatedAt === b[index]?.updatedAt);
}

function sameBranchList(a: Branch[], b: Branch[]) {
  if (a.length !== b.length) return false;
  return a.every((row, index) => row.id === b[index]?.id && row.updatedAt === b[index]?.updatedAt);
}

function cleanId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
}

function readStorageId(key: string): string | null {
  if (typeof window === "undefined") return null;
  return cleanId(window.localStorage.getItem(key) || window.sessionStorage.getItem(key));
}

function writeStorageId(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value) {
    try { window.localStorage.setItem(key, value); } catch {}
    try { window.sessionStorage.setItem(key, value); } catch {}
  } else {
    try { window.localStorage.removeItem(key); } catch {}
    try { window.sessionStorage.removeItem(key); } catch {}
  }
}

function normalizeId(value?: unknown): string | null {
  return cleanId(value);
}

function readSettingsId(value: unknown): string | undefined {
  return cleanId(value) || undefined;
}

function canPersistBranchSettings() {
  const membership = getStoredActiveMembership();
  if (!membership) return false;
  return appearanceScopeForRole(normalizeAppearanceRole(membership.role)) === "branch";
}

// ======================================================
// PROVIDER
// ======================================================

export function ActiveBranchProvider({ children }: { children: React.ReactNode }) {
  const { accountId, loading: accountLoading } = useAccount();
  const { settings, updateSettings } = useSettings();

  const settingsRef = useRef<SettingsLike>({});
  const refreshRunningRef = useRef(false);
  const mountedRef = useRef(true);

  const initialSchoolId = readStorageId(SCHOOL_STORAGE_KEY);
  const initialBranchId = readStorageId(BRANCH_STORAGE_KEY);

  const [activeSchoolId, setActiveSchoolIdState] =
    useState<string | null>(initialSchoolId);
  const [activeBranchId, setActiveBranchIdState] =
    useState<string | null>(initialBranchId);

  const [schools, setSchools] = useState<School[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(
    !initialSchoolId && !initialBranchId,
  );

  // Keep latest settings in a ref so refreshInstitution does not depend on
  // settings.schoolId/settings.branchId and recreate itself repeatedly.
  useEffect(() => {
    settingsRef.current = {
      schoolId: readSettingsId(settings?.schoolId),
      branchId: readSettingsId(settings?.branchId),
    };
  }, [settings?.schoolId, settings?.branchId]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ======================================================
  // SAFE STATE HELPERS
  // ======================================================

  const setSchoolIdSafely = useCallback((next: string | null) => {
    setActiveSchoolIdState((prev) => (prev === next ? prev : next));
  }, []);

  const setBranchIdSafely = useCallback((next: string | null) => {
    setActiveBranchIdState((prev) => (prev === next ? prev : next));
  }, []);

  const setSchoolsSafely = useCallback((next: School[]) => {
    setSchools((prev) => (sameSchoolList(prev, next) ? prev : next));
  }, []);

  const setBranchesSafely = useCallback((next: Branch[]) => {
    setAllBranches((prev) => (sameBranchList(prev, next) ? prev : next));
  }, []);

  // ======================================================
  // CLEAR CONTEXT
  // ======================================================

  const clearInstitutionContext = useCallback(async () => {
    setSchoolIdSafely(null);
    setBranchIdSafely(null);
    setSchoolsSafely([]);
    setBranchesSafely([]);

    writeStorageId(SCHOOL_STORAGE_KEY, null);
    writeStorageId(BRANCH_STORAGE_KEY, null);

    const currentSchoolId = normalizeId(settingsRef.current.schoolId);
    const currentBranchId = normalizeId(settingsRef.current.branchId);

    if (
      (currentSchoolId || currentBranchId) &&
      canPersistBranchSettings()
    ) {
      await updateSettings({
        schoolId: undefined,
        branchId: undefined,
        updatedAt: Date.now(),
      });
    }
  }, [setSchoolIdSafely, setBranchIdSafely, setSchoolsSafely, setBranchesSafely, updateSettings]);

  // ======================================================
  // REFRESH INSTITUTION
  // ======================================================

  const refreshInstitution = useCallback(async () => {
    if (refreshRunningRef.current) return;

    const generation = getSessionGeneration();
    refreshRunningRef.current = true;

    // Existing cached context remains usable while Dexie refreshes silently.
    if (!activeSchoolId && !activeBranchId) {
      setLoading(true);
    }

    try {
      if (accountLoading) return;

      if (!accountId) {
        await clearInstitutionContext();
        return;
      }

      const [schoolRows, branchRows] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
      ]);

      if (!mountedRef.current || !isSessionGenerationCurrent(generation)) return;

      const activeSchools = schoolRows
        .filter((row) => row.accountId === accountId && !row.isDeleted)
        .sort((a, b) => a.name.localeCompare(b.name));

      const activeBranches = branchRows
        .filter(
          (row) =>
            row.accountId === accountId &&
            !row.isDeleted &&
            row.active !== false
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      setSchoolsSafely(activeSchools);
      setBranchesSafely(activeBranches);

      const storedSchoolId = readStorageId(SCHOOL_STORAGE_KEY);
      const settingsSchoolId = cleanId(settingsRef.current.schoolId);

      const storedSchoolExists = storedSchoolId
        ? activeSchools.some((school) => school.id === storedSchoolId)
        : false;

      const settingsSchoolExists = settingsSchoolId
        ? activeSchools.some((school) => school.id === settingsSchoolId)
        : false;

      const resolvedSchoolId = storedSchoolExists
        ? storedSchoolId
        : settingsSchoolExists
        ? settingsSchoolId
        : activeSchools[0]?.id || null;

      const branchesForSchool = resolvedSchoolId
        ? activeBranches.filter((branch) => branch.schoolId === resolvedSchoolId)
        : [];

      const storedBranchId = readStorageId(BRANCH_STORAGE_KEY);
      const settingsBranchId = cleanId(settingsRef.current.branchId);

      const storedBranchExists = storedBranchId
        ? branchesForSchool.some((branch) => branch.id === storedBranchId)
        : false;

      const settingsBranchExists = settingsBranchId
        ? branchesForSchool.some((branch) => branch.id === settingsBranchId)
        : false;

      const resolvedBranchId = storedBranchExists
        ? storedBranchId
        : settingsBranchExists
        ? settingsBranchId
        : branchesForSchool[0]?.id || null;

      setSchoolIdSafely(resolvedSchoolId);
      setBranchIdSafely(resolvedBranchId);

      writeStorageId(SCHOOL_STORAGE_KEY, resolvedSchoolId);
      writeStorageId(BRANCH_STORAGE_KEY, resolvedBranchId);

      const currentSchoolId = normalizeId(settingsRef.current.schoolId);
      const currentBranchId = normalizeId(settingsRef.current.branchId);
      const nextSchoolId = normalizeId(resolvedSchoolId);
      const nextBranchId = normalizeId(resolvedBranchId);

      if (currentSchoolId !== nextSchoolId || currentBranchId !== nextBranchId) {
        settingsRef.current = {
          schoolId: resolvedSchoolId || undefined,
          branchId: resolvedBranchId || undefined,
        };

        if (canPersistBranchSettings()) {
          await updateSettings({
            schoolId: resolvedSchoolId || undefined,
            branchId: resolvedBranchId || undefined,
            updatedAt: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error("Failed to refresh active school/branch context:", error);
    } finally {
      refreshRunningRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [
    accountId,
    accountLoading,
    activeSchoolId,
    activeBranchId,
    clearInstitutionContext,
    setSchoolIdSafely,
    setBranchIdSafely,
    setSchoolsSafely,
    setBranchesSafely,
    updateSettings,
  ]);

  useEffect(() => subscribeToAtomicLogout(() => {
    refreshRunningRef.current = false;
    setSchoolIdSafely(null);
    setBranchIdSafely(null);
    setSchoolsSafely([]);
    setBranchesSafely([]);
    setLoading(false);
    writeStorageId(SCHOOL_STORAGE_KEY, null);
    writeStorageId(BRANCH_STORAGE_KEY, null);
  }), [setSchoolIdSafely, setBranchIdSafely, setSchoolsSafely, setBranchesSafely]);

  // ======================================================
  // BOOT / ACCOUNT CHANGE
  // ======================================================

  useEffect(() => {
    if (accountLoading) return;

    if (!accountId) {
      clearInstitutionContext().finally(() => setLoading(false));
      return;
    }

    refreshInstitution();
    // Deliberately depend only on account identity/loading.
    // refreshInstitution is stable enough, but it updates settings, so we avoid
    // using settings changes as refresh triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, accountId]);

  // ======================================================
  // DERIVED VALUES
  // ======================================================

  const activeSchool = useMemo(() => {
    if (!accountId || !activeSchoolId) return null;
    return schools.find((school) => school.id === activeSchoolId) || null;
  }, [accountId, schools, activeSchoolId]);

  const branches = useMemo(() => {
    if (!accountId || !activeSchoolId) return [];
    return allBranches.filter((branch) => branch.schoolId === activeSchoolId);
  }, [accountId, allBranches, activeSchoolId]);

  const activeBranch = useMemo(() => {
    if (!accountId || !activeBranchId) return null;
    return branches.find((branch) => branch.id === activeBranchId) || null;
  }, [accountId, branches, activeBranchId]);

  // ======================================================
  // MANUAL SCHOOL SWITCH
  // ======================================================

  const setActiveSchoolId = useCallback(
    async (id: string | null) => {
      if (!accountId) {
        await clearInstitutionContext();
        return;
      }

      const nextSchoolId = id;

      const schoolExists = nextSchoolId
        ? schools.some((school) => school.id === nextSchoolId)
        : true;

      if (!schoolExists) return;

      const branchesForSchool = nextSchoolId
        ? allBranches.filter((branch) => branch.schoolId === nextSchoolId)
        : [];

      const currentBranchStillValid = activeBranchId
        ? branchesForSchool.some((branch) => branch.id === activeBranchId)
        : false;

      const nextBranchId = currentBranchStillValid
        ? activeBranchId
        : branchesForSchool[0]?.id || null;

      setSchoolIdSafely(nextSchoolId);
      setBranchIdSafely(nextBranchId);

      writeStorageId(SCHOOL_STORAGE_KEY, nextSchoolId);
      writeStorageId(BRANCH_STORAGE_KEY, nextBranchId);

      const currentSchoolId = normalizeId(settingsRef.current.schoolId);
      const currentBranchId = normalizeId(settingsRef.current.branchId);
      const normalizedNextSchoolId = normalizeId(nextSchoolId);
      const normalizedNextBranchId = normalizeId(nextBranchId);

      if (
        currentSchoolId !== normalizedNextSchoolId ||
        currentBranchId !== normalizedNextBranchId
      ) {
        settingsRef.current = {
          schoolId: nextSchoolId || undefined,
          branchId: nextBranchId || undefined,
        };

        if (canPersistBranchSettings()) {
          await updateSettings({
            schoolId: nextSchoolId || undefined,
            branchId: nextBranchId || undefined,
            updatedAt: Date.now(),
          });
        }
      }
    },
    [
      accountId,
      activeBranchId,
      allBranches,
      schools,
      clearInstitutionContext,
      setSchoolIdSafely,
      setBranchIdSafely,
      updateSettings,
    ]
  );

  // ======================================================
  // MANUAL BRANCH SWITCH
  // ======================================================

  const setActiveBranchId = useCallback(
    async (id: string | null) => {
      if (!accountId) {
        await clearInstitutionContext();
        return;
      }

      const nextBranchId = id;

      const branchBelongsToSchool = nextBranchId
        ? branches.some((branch) => branch.id === nextBranchId)
        : true;

      if (!branchBelongsToSchool) return;

      setBranchIdSafely(nextBranchId);
      writeStorageId(BRANCH_STORAGE_KEY, nextBranchId);

      const currentSchoolId = normalizeId(settingsRef.current.schoolId);
      const currentBranchId = normalizeId(settingsRef.current.branchId);
      const nextSchoolId = normalizeId(activeSchoolId);
      const normalizedNextBranchId = normalizeId(nextBranchId);

      if (currentSchoolId !== nextSchoolId || currentBranchId !== normalizedNextBranchId) {
        settingsRef.current = {
          schoolId: activeSchoolId || undefined,
          branchId: nextBranchId || undefined,
        };

        if (canPersistBranchSettings()) {
          await updateSettings({
            schoolId: activeSchoolId || undefined,
            branchId: nextBranchId || undefined,
            updatedAt: Date.now(),
          });
        }
      }
    },
    [
      accountId,
      branches,
      activeSchoolId,
      clearInstitutionContext,
      setBranchIdSafely,
      updateSettings,
    ]
  );

  // ======================================================
  // CONTEXT VALUE
  // ======================================================

  const value = useMemo<ActiveBranchContextType>(
    () => ({
      activeSchoolId: accountId ? activeSchoolId : null,
      activeSchool: accountId ? activeSchool : null,
      schools: accountId ? schools : [],
      setActiveSchoolId,

      activeBranchId: accountId ? activeBranchId : null,
      activeBranch: accountId ? activeBranch : null,
      branches: accountId ? branches : [],
      allBranches: accountId ? allBranches : [],
      setActiveBranchId,

      loading: accountLoading || loading,
      refreshInstitution,
    }),
    [
      accountId,
      accountLoading,
      activeSchoolId,
      activeSchool,
      schools,
      activeBranchId,
      activeBranch,
      branches,
      allBranches,
      loading,
      setActiveSchoolId,
      setActiveBranchId,
      refreshInstitution,
    ]
  );

  return (
    <ActiveBranchContext.Provider value={value}>
      {children}
    </ActiveBranchContext.Provider>
  );
}

// ======================================================
// HOOK
// ======================================================

export function useActiveBranch() {
  const context = useContext(ActiveBranchContext);

  if (!context) {
    throw new Error("useActiveBranch must be used inside ActiveBranchProvider");
  }

  return context;
}