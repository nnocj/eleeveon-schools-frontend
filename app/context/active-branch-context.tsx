"use client";

/**
 * context/active-branch-context.tsx
 * ---------------------------------------------------------
 * ACTIVE SCHOOL + BRANCH CONTEXT
 * ---------------------------------------------------------
 *
 * This file intentionally keeps the old filename and hook name:
 * - ActiveBranchProvider
 * - useActiveBranch
 *
 * So existing imports do not need to change.
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * Active School -> Active Branch
 *
 * Rules:
 * 1. School is selected first.
 * 2. Branches are filtered by selected school.
 * 3. If selected branch does not belong to selected school,
 *    the provider auto-selects the first active branch under that school.
 * 4. localStorage keeps the live selected school/branch.
 * 5. settings.schoolId and settings.branchId are kept in sync for older pages.
 *
 * IMPORTANT LAYOUT ORDER
 * ---------------------------------------------------------
 * Since this provider uses useSettings(), your RootLayout should wrap providers as:
 *
 * <SettingsProvider>
 *   <ActiveBranchProvider>
 *     <AppWrapper>{children}</AppWrapper>
 *   </ActiveBranchProvider>
 * </SettingsProvider>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { db, Branch, School } from "../lib/db";
import { useSettings } from "./settings-context";

// ======================================================
// TYPES
// ======================================================

export type ActiveInstitutionContextType = {
  // School context
  activeSchoolId: number | null;
  activeSchool: School | null;
  schools: School[];
  setActiveSchoolId: (id: number | null) => Promise<void>;

  // Branch context
  activeBranchId: number | null;
  activeBranch: Branch | null;
  branches: Branch[];
  allBranches: Branch[];
  setActiveBranchId: (id: number | null) => Promise<void>;

  // State
  loading: boolean;
  refreshInstitution: () => Promise<void>;
};

// Backward-compatible name.
export type ActiveBranchContextType = ActiveInstitutionContextType;

// ======================================================
// CONSTANTS
// ======================================================

const SCHOOL_STORAGE_KEY = "activeSchoolId";
const BRANCH_STORAGE_KEY = "activeBranchId";

// ======================================================
// CONTEXT
// ======================================================

const ActiveBranchContext = createContext<ActiveBranchContextType | undefined>(
  undefined
);

// ======================================================
// PROVIDER
// ======================================================

export function ActiveBranchProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();

  const [activeSchoolId, setActiveSchoolIdState] = useState<number | null>(null);
  const [activeBranchId, setActiveBranchIdState] = useState<number | null>(null);

  const [schools, setSchools] = useState<School[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // ======================================================
  // LOAD + RESOLVE CONTEXT
  // ======================================================

  const refreshInstitution = useCallback(async () => {
    setLoading(true);

    try {
      const [schoolRows, branchRows] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
      ]);

      const activeSchools = schoolRows
        .filter(row => !row.isDeleted)
        .sort((a, b) => a.name.localeCompare(b.name));

      const activeBranches = branchRows
        .filter(row => !row.isDeleted && row.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name));

      setSchools(activeSchools);
      setAllBranches(activeBranches);

      // ------------------------------
      // Resolve school
      // ------------------------------

      const storedSchoolRaw = localStorage.getItem(SCHOOL_STORAGE_KEY);
      const storedSchoolId = storedSchoolRaw ? Number(storedSchoolRaw) : null;
      const settingsSchoolId = settings?.schoolId ? Number(settings.schoolId) : null;

      const storedSchoolExists = storedSchoolId
        ? activeSchools.some(school => school.id === storedSchoolId)
        : false;

      const settingsSchoolExists = settingsSchoolId
        ? activeSchools.some(school => school.id === settingsSchoolId)
        : false;

      const resolvedSchoolId = storedSchoolExists
        ? storedSchoolId
        : settingsSchoolExists
        ? settingsSchoolId
        : activeSchools[0]?.id || null;

      // ------------------------------
      // Resolve branch under school
      // ------------------------------

      const branchesForSchool = resolvedSchoolId
        ? activeBranches.filter(branch => branch.schoolId === resolvedSchoolId)
        : [];

      const storedBranchRaw = localStorage.getItem(BRANCH_STORAGE_KEY);
      const storedBranchId = storedBranchRaw ? Number(storedBranchRaw) : null;
      const settingsBranchId = settings?.branchId ? Number(settings.branchId) : null;

      const storedBranchExists = storedBranchId
        ? branchesForSchool.some(branch => branch.id === storedBranchId)
        : false;

      const settingsBranchExists = settingsBranchId
        ? branchesForSchool.some(branch => branch.id === settingsBranchId)
        : false;

      const resolvedBranchId = storedBranchExists
        ? storedBranchId
        : settingsBranchExists
        ? settingsBranchId
        : branchesForSchool[0]?.id || null;

      setActiveSchoolIdState(resolvedSchoolId);
      setActiveBranchIdState(resolvedBranchId);

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

      // Keep legacy settings in sync without forcing a loop every render.
      const settingsAlreadySynced =
        Number(settings?.schoolId || 0) === Number(resolvedSchoolId || 0) &&
        Number(settings?.branchId || 0) === Number(resolvedBranchId || 0);

      if (!settingsAlreadySynced) {
        await updateSettings({
          schoolId: resolvedSchoolId || undefined,
          branchId: resolvedBranchId || undefined,
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("Failed to refresh active school/branch context:", error);
    } finally {
      setLoading(false);
    }
  }, [settings?.schoolId, settings?.branchId, updateSettings]);

  useEffect(() => {
    refreshInstitution();
  }, [refreshInstitution]);

  // ======================================================
  // DERIVED DATA
  // ======================================================

  const activeSchool = useMemo(() => {
    if (!activeSchoolId) return null;
    return schools.find(school => school.id === activeSchoolId) || null;
  }, [schools, activeSchoolId]);

  const branches = useMemo(() => {
    if (!activeSchoolId) return [];
    return allBranches.filter(branch => branch.schoolId === activeSchoolId);
  }, [allBranches, activeSchoolId]);

  const activeBranch = useMemo(() => {
    if (!activeBranchId) return null;
    return branches.find(branch => branch.id === activeBranchId) || null;
  }, [branches, activeBranchId]);

  // ======================================================
  // SCHOOL SWITCHER
  // ======================================================

  const setActiveSchoolId = useCallback(
    async (id: number | null) => {
      const nextSchoolId = id;

      setActiveSchoolIdState(nextSchoolId);

      if (nextSchoolId) {
        localStorage.setItem(SCHOOL_STORAGE_KEY, String(nextSchoolId));
      } else {
        localStorage.removeItem(SCHOOL_STORAGE_KEY);
      }

      // When school changes, branch must belong to that school.
      const branchesForSchool = nextSchoolId
        ? allBranches.filter(branch => branch.schoolId === nextSchoolId)
        : [];

      const currentBranchStillValid = activeBranchId
        ? branchesForSchool.some(branch => branch.id === activeBranchId)
        : false;

      const nextBranchId = currentBranchStillValid
        ? activeBranchId
        : branchesForSchool[0]?.id || null;

      setActiveBranchIdState(nextBranchId);

      if (nextBranchId) {
        localStorage.setItem(BRANCH_STORAGE_KEY, String(nextBranchId));
      } else {
        localStorage.removeItem(BRANCH_STORAGE_KEY);
      }

      await updateSettings({
        schoolId: nextSchoolId || undefined,
        branchId: nextBranchId || undefined,
        currentAcademicStructureId: undefined,
        currentAcademicPeriodId: undefined,
        updatedAt: Date.now(),
      });
    },
    [allBranches, activeBranchId, updateSettings]
  );

  // ======================================================
  // BRANCH SWITCHER
  // ======================================================

  const setActiveBranchId = useCallback(
    async (id: number | null) => {
      let nextBranchId = id;
      let nextSchoolId = activeSchoolId;

      if (nextBranchId) {
        const branch = allBranches.find(row => row.id === nextBranchId) || null;

        if (!branch) {
          nextBranchId = null;
        } else {
          // If user picks a branch from another school, switch school too.
          nextSchoolId = branch.schoolId || null;
        }
      }

      setActiveSchoolIdState(nextSchoolId);
      setActiveBranchIdState(nextBranchId);

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

      await updateSettings({
        schoolId: nextSchoolId || undefined,
        branchId: nextBranchId || undefined,
        currentAcademicStructureId: undefined,
        currentAcademicPeriodId: undefined,
        updatedAt: Date.now(),
      });
    },
    [activeSchoolId, allBranches, updateSettings]
  );

  // ======================================================
  // SAFETY: ACTIVE BRANCH MUST BELONG TO ACTIVE SCHOOL
  // ======================================================

  useEffect(() => {
    if (!activeSchoolId) return;
    if (!activeBranchId) return;

    const branchStillValid = branches.some(branch => branch.id === activeBranchId);

    if (!branchStillValid) {
      const nextBranchId = branches[0]?.id || null;
      setActiveBranchIdState(nextBranchId);

      if (nextBranchId) {
        localStorage.setItem(BRANCH_STORAGE_KEY, String(nextBranchId));
      } else {
        localStorage.removeItem(BRANCH_STORAGE_KEY);
      }

      updateSettings({
        schoolId: activeSchoolId || undefined,
        branchId: nextBranchId || undefined,
        currentAcademicStructureId: undefined,
        currentAcademicPeriodId: undefined,
        updatedAt: Date.now(),
      });
    }
  }, [activeSchoolId, activeBranchId, branches, updateSettings]);

  // ======================================================
  // VALUE
  // ======================================================

  const value = useMemo<ActiveBranchContextType>(
    () => ({
      activeSchoolId,
      activeSchool,
      schools,
      setActiveSchoolId,

      activeBranchId,
      activeBranch,
      branches,
      allBranches,
      setActiveBranchId,

      loading,
      refreshInstitution,
    }),
    [
      activeSchoolId,
      activeSchool,
      schools,
      setActiveSchoolId,
      activeBranchId,
      activeBranch,
      branches,
      allBranches,
      setActiveBranchId,
      loading,
      refreshInstitution,
    ]
  );

  return <ActiveBranchContext.Provider value={value}>{children}</ActiveBranchContext.Provider>;
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
