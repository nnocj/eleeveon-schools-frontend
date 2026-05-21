"use client";

/**
 * academicAndAssessmentConfiguration.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE ACADEMIC + ASSESSMENT CONFIGURATION COCKPIT
 * ---------------------------------------------------------
 * Manages:
 * - academicStructures
 * - academicPeriods
 * - assessmentStructures
 * - assessmentStructureItems
 * - gradingSystems
 * - gradeRules
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Cards are mobile-first and dashboard-shell safe.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  AcademicLevel,
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  AssessmentEntry,
  AssessmentStructure,
  AssessmentStructureItem,
  Class,
  ClassSubject,
  ComputedResult,
  GradeRule,
  GradingSystem,
  GradingSystemType,
  Organization,
  TermType,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type TabKey = "academic" | "assessment" | "grading";

type DrawerMode =
  | "academicStructure"
  | "academicPeriod"
  | "assessmentStructure"
  | "assessmentItem"
  | "gradingSystem"
  | "gradeRule";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type AcademicStructureForm = {
  id?: number;
  name: string;
  level: AcademicLevel;
  startDate: string;
  endDate: string;
  photo?: string;
  bannerImage?: string;
  active?: boolean;
};

type AcademicPeriodForm = {
  id?: number;
  academicStructureId?: number;
  name: string;
  type?: TermType;
  startDate: string;
  endDate: string;
  photo?: string;
  order: number;
  active?: boolean;
};

type AssessmentStructureForm = {
  id?: number;
  organizationId?: number;
  academicStructureId?: number;
  name: string;
  description?: string;
  photo?: string;
  bannerImage?: string;
  totalScore?: number;
  active?: boolean;
  locked?: boolean;
};

type AssessmentItemForm = {
  id?: number;
  assessmentStructureId?: number;
  name: string;
  weight: number;
  maxScore: number;
  order: number;
  compulsory?: boolean;
  active?: boolean;
};

type GradingSystemForm = {
  id?: number;
  organizationId?: number;
  name: string;
  type: GradingSystemType;
  description?: string;
  photo?: string;
  active?: boolean;
  default?: boolean;
  locked?: boolean;
};

type GradeRuleForm = {
  id?: number;
  gradingSystemId?: number;
  minScore: number;
  maxScore: number;
  grade: string;
  remark?: string;
  gpa?: number;
  color?: string;
  order: number;
  active?: boolean;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const endOfYearISO = () => `${new Date().getFullYear()}-12-31`;

const emptyAcademicStructure = (): AcademicStructureForm => ({
  name: "",
  level: "primary",
  startDate: todayISO(),
  endDate: endOfYearISO(),
  photo: "",
  bannerImage: "",
  active: true,
});

const emptyAcademicPeriod = (): AcademicPeriodForm => ({
  academicStructureId: undefined,
  name: "",
  type: "Term 1",
  startDate: todayISO(),
  endDate: endOfYearISO(),
  photo: "",
  order: 1,
  active: true,
});

const emptyAssessmentStructure = (): AssessmentStructureForm => ({
  organizationId: undefined,
  academicStructureId: undefined,
  name: "",
  description: "",
  photo: "",
  bannerImage: "",
  totalScore: 100,
  active: true,
  locked: false,
});

const emptyAssessmentItem = (): AssessmentItemForm => ({
  assessmentStructureId: undefined,
  name: "",
  weight: 0,
  maxScore: 100,
  order: 1,
  compulsory: true,
  active: true,
});

const emptyGradingSystem = (): GradingSystemForm => ({
  organizationId: undefined,
  name: "",
  type: "percentage",
  description: "",
  photo: "",
  active: true,
  default: false,
  locked: false,
});

const emptyGradeRule = (): GradeRuleForm => ({
  gradingSystemId: undefined,
  minScore: 0,
  maxScore: 100,
  grade: "",
  remark: "",
  gpa: undefined,
  color: "",
  order: 1,
  active: true,
});

// ======================================================
// COMPONENT
// ======================================================

export default function AcademicAndAssessmentConfiguration() {
  const router = useRouter();

  const {
    accountId,
    loading: accountLoading,
    authenticated,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("academic");

  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [assessmentStructures, setAssessmentStructures] = useState<AssessmentStructure[]>([]);
  const [assessmentItems, setAssessmentItems] = useState<AssessmentStructureItem[]>([]);
  const [gradingSystems, setGradingSystems] = useState<GradingSystem[]>([]);
  const [gradeRules, setGradeRules] = useState<GradeRule[]>([]);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [assessmentApplicabilities, setAssessmentApplicabilities] = useState<AssessmentApplicability[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>([]);
  const [computedResults, setComputedResults] = useState<ComputedResult[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [search, setSearch] = useState("");
  const [filterStructureId, setFilterStructureId] = useState<number | undefined>();
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterAssessmentStructureId, setFilterAssessmentStructureId] = useState<number | undefined>();
  const [filterGradingSystemId, setFilterGradingSystemId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "locked">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("academicStructure");
  const [editMode, setEditMode] = useState(false);

  const [academicStructureForm, setAcademicStructureForm] = useState<AcademicStructureForm>(emptyAcademicStructure);
  const [academicPeriodForm, setAcademicPeriodForm] = useState<AcademicPeriodForm>(emptyAcademicPeriod);
  const [assessmentStructureForm, setAssessmentStructureForm] = useState<AssessmentStructureForm>(emptyAssessmentStructure);
  const [assessmentItemForm, setAssessmentItemForm] = useState<AssessmentItemForm>(emptyAssessmentItem);
  const [gradingSystemForm, setGradingSystemForm] = useState<GradingSystemForm>(emptyGradingSystem);
  const [gradeRuleForm, setGradeRuleForm] = useState<GradeRuleForm>(emptyGradeRule);

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const clearData = () => {
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setAssessmentStructures([]);
    setAssessmentItems([]);
    setGradingSystems([]);
    setGradeRules([]);
    setOrganizations([]);
    setAssessmentApplicabilities([]);
    setAssessmentEntries([]);
    setComputedResults([]);
    setClasses([]);
    setClassSubjects([]);
  };

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

      const [
        academicStructureRows,
        academicPeriodRows,
        assessmentStructureRows,
        assessmentItemRows,
        gradingSystemRows,
        gradeRuleRows,
        organizationRows,
        applicabilityRows,
        entryRows,
        computedRows,
        classRows,
        classSubjectRows,
      ] = await Promise.all([
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
        db.organizations.toArray(),
        db.assessmentApplicabilities.toArray(),
        db.assessmentEntries.toArray(),
        db.computedResults.toArray(),
        db.classes.toArray(),
        db.classSubjects.toArray(),
      ]);

      setAcademicStructures(academicStructureRows.filter(sameTenant));
      setAcademicPeriods(
        academicPeriodRows
          .filter(sameTenant)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setAssessmentStructures(assessmentStructureRows.filter(sameTenant));
      setAssessmentItems(
        assessmentItemRows
          .filter(sameTenant)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setGradingSystems(gradingSystemRows.filter(sameTenant));
      setGradeRules(
        gradeRuleRows
          .filter(sameTenant)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setOrganizations(organizationRows.filter(sameTenant));
      setAssessmentApplicabilities(applicabilityRows.filter(sameTenant));
      setAssessmentEntries(entryRows.filter(sameTenant));
      setComputedResults(computedRows.filter(sameTenant));
      setClasses(classRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load academic and assessment configuration:", error);
      clearData();
      alert("Failed to load academic and assessment configuration");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS + STATS
  // ======================================================

  const academicStructureMap = useMemo(
    () => new Map(academicStructures.map((row) => [row.id, row])),
    [academicStructures]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((row) => [row.id, row])),
    [organizations]
  );

  const assessmentStructureMap = useMemo(
    () => new Map(assessmentStructures.map((row) => [row.id, row])),
    [assessmentStructures]
  );

  const gradingSystemMap = useMemo(
    () => new Map(gradingSystems.map((row) => [row.id, row])),
    [gradingSystems]
  );

  const summary = useMemo(() => {
    const itemStats = new Map<number, number>();
    assessmentItems.forEach((row) => {
      if (row.active === false) return;
      itemStats.set(row.assessmentStructureId, (itemStats.get(row.assessmentStructureId) || 0) + Number(row.weight || 0));
    });

    const completeAssessmentStructures = assessmentStructures.filter((row) => itemStats.get(row.id || 0) === 100).length;
    const incompleteAssessmentStructures = assessmentStructures.length - completeAssessmentStructures;
    const gradingReady = gradingSystems.filter((row) => gradeRules.some((rule) => rule.gradingSystemId === row.id)).length;

    return {
      academicStructures: academicStructures.length,
      academicPeriods: academicPeriods.length,
      assessmentStructures: assessmentStructures.length,
      assessmentItems: assessmentItems.length,
      gradingSystems: gradingSystems.length,
      gradeRules: gradeRules.length,
      completeAssessmentStructures,
      incompleteAssessmentStructures,
      gradingReady,
      applicabilities: assessmentApplicabilities.length,
    };
  }, [academicStructures, academicPeriods, assessmentStructures, assessmentItems, gradingSystems, gradeRules, assessmentApplicabilities]);

  const query = search.trim().toLowerCase();

  const periodCountByStructure = useMemo(() => countBy(academicPeriods, (row) => row.academicStructureId), [academicPeriods]);
  const classSubjectCountByStructure = useMemo(() => countBy(classSubjects, (row) => row.academicStructureId), [classSubjects]);
  const assessmentCountByStructure = useMemo(() => countBy(assessmentStructures, (row) => row.academicStructureId), [assessmentStructures]);
  const classSubjectCountByPeriod = useMemo(() => countBy(classSubjects.filter((row) => !!row.academicPeriodId), (row) => row.academicPeriodId || 0), [classSubjects]);
  const entryCountByPeriod = useMemo(() => countBy(assessmentEntries, (row) => row.academicPeriodId), [assessmentEntries]);
  const itemCountByAssessment = useMemo(() => countBy(assessmentItems, (row) => row.assessmentStructureId), [assessmentItems]);
  const entryCountByAssessment = useMemo(() => countBy(assessmentEntries.filter((row) => !!row.assessmentStructureId), (row) => row.assessmentStructureId || 0), [assessmentEntries]);
  const applicabilityCountByAssessment = useMemo(() => countBy(assessmentApplicabilities, (row) => row.assessmentStructureId), [assessmentApplicabilities]);
  const entryCountByItem = useMemo(() => countBy(assessmentEntries, (row) => row.assessmentStructureItemId), [assessmentEntries]);
  const ruleCountByGrading = useMemo(() => countBy(gradeRules, (row) => row.gradingSystemId), [gradeRules]);
  const applicabilityCountByGrading = useMemo(() => countBy(assessmentApplicabilities.filter((row) => !!row.gradingSystemId), (row) => row.gradingSystemId || 0), [assessmentApplicabilities]);
  const computedCountByGrading = useMemo(() => countBy(computedResults.filter((row) => !!row.gradingSystemId), (row) => row.gradingSystemId || 0), [computedResults]);

  const weightByAssessment = useMemo(() => {
    const map = new Map<number, number>();
    assessmentItems.forEach((row) => {
      if (row.active === false) return;
      map.set(row.assessmentStructureId, (map.get(row.assessmentStructureId) || 0) + Number(row.weight || 0));
    });
    return map;
  }, [assessmentItems]);

  // ======================================================
  // FILTERED DATA
  // ======================================================

  const filteredAcademicStructures = useMemo(() => {
    return academicStructures
      .filter((row) => {
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (!query) return true;
        return `${row.name} ${row.level} ${row.startDate} ${row.endDate}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [academicStructures, filterStatus, query]);

  const filteredAcademicPeriods = useMemo(() => {
    return academicPeriods
      .filter((row) => {
        const structure = academicStructureMap.get(row.academicStructureId);
        if (filterStructureId && row.academicStructureId !== filterStructureId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (!query) return true;
        return `${row.name} ${row.type || ""} ${structure?.name || ""} ${row.startDate} ${row.endDate}`.toLowerCase().includes(query);
      })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [academicPeriods, academicStructureMap, filterStructureId, filterStatus, query]);

  const filteredAssessmentStructures = useMemo(() => {
    return assessmentStructures
      .filter((row) => {
        const structure = academicStructureMap.get(row.academicStructureId);
        const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
        if (filterStructureId && row.academicStructureId !== filterStructureId) return false;
        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "locked" && row.locked !== true) return false;
        if (!query) return true;
        return `${row.name} ${row.description || ""} ${structure?.name || ""} ${organization?.name || ""}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assessmentStructures, academicStructureMap, organizationMap, filterStructureId, filterOrganizationId, filterStatus, query]);

  const filteredAssessmentItems = useMemo(() => {
    return assessmentItems
      .filter((row) => {
        const structure = assessmentStructureMap.get(row.assessmentStructureId);
        if (filterAssessmentStructureId && row.assessmentStructureId !== filterAssessmentStructureId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (!query) return true;
        return `${row.name} ${structure?.name || ""} ${row.weight} ${row.maxScore}`.toLowerCase().includes(query);
      })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [assessmentItems, assessmentStructureMap, filterAssessmentStructureId, filterStatus, query]);

  const filteredGradingSystems = useMemo(() => {
    return gradingSystems
      .filter((row) => {
        const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "locked" && row.locked !== true) return false;
        if (!query) return true;
        return `${row.name} ${row.type} ${row.description || ""} ${organization?.name || ""}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [gradingSystems, organizationMap, filterOrganizationId, filterStatus, query]);

  const filteredGradeRules = useMemo(() => {
    return gradeRules
      .filter((row) => {
        const system = gradingSystemMap.get(row.gradingSystemId);
        if (filterGradingSystemId && row.gradingSystemId !== filterGradingSystemId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (!query) return true;
        return `${row.grade} ${row.remark || ""} ${row.minScore} ${row.maxScore} ${system?.name || ""}`.toLowerCase().includes(query);
      })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [gradeRules, gradingSystemMap, filterGradingSystemId, filterStatus, query]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const uploadImage = async (
    target:
      | "academicStructurePhoto"
      | "academicStructureBanner"
      | "academicPeriodPhoto"
      | "assessmentStructurePhoto"
      | "assessmentStructureBanner"
      | "gradingSystemPhoto",
    file?: File
  ) => {
    if (!file) return;
    const value = await fileToBase64(file);

    if (target === "academicStructurePhoto") setAcademicStructureForm((prev) => ({ ...prev, photo: value }));
    if (target === "academicStructureBanner") setAcademicStructureForm((prev) => ({ ...prev, bannerImage: value }));
    if (target === "academicPeriodPhoto") setAcademicPeriodForm((prev) => ({ ...prev, photo: value }));
    if (target === "assessmentStructurePhoto") setAssessmentStructureForm((prev) => ({ ...prev, photo: value }));
    if (target === "assessmentStructureBanner") setAssessmentStructureForm((prev) => ({ ...prev, bannerImage: value }));
    if (target === "gradingSystemPhoto") setGradingSystemForm((prev) => ({ ...prev, photo: value }));
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditMode(false);
  };

  const openCreate = (mode: DrawerMode) => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Select a branch first.");
      return;
    }

    setEditMode(false);
    setDrawerMode(mode);

    if (mode === "academicStructure") setAcademicStructureForm(emptyAcademicStructure());

    if (mode === "academicPeriod") {
      const selectedStructure = filterStructureId || settings?.currentAcademicStructureId || academicStructures[0]?.id;
      const structure = selectedStructure ? academicStructureMap.get(selectedStructure) : undefined;
      setAcademicPeriodForm({
        ...emptyAcademicPeriod(),
        academicStructureId: selectedStructure,
        startDate: structure?.startDate || todayISO(),
        endDate: structure?.endDate || endOfYearISO(),
        order: academicPeriods.filter((row) => row.academicStructureId === selectedStructure).length + 1,
      });
    }

    if (mode === "assessmentStructure") {
      setAssessmentStructureForm({
        ...emptyAssessmentStructure(),
        organizationId: filterOrganizationId,
        academicStructureId: filterStructureId || settings?.currentAcademicStructureId || academicStructures[0]?.id,
      });
    }

    if (mode === "assessmentItem") {
      const selectedAssessment = filterAssessmentStructureId || assessmentStructures[0]?.id;
      setAssessmentItemForm({
        ...emptyAssessmentItem(),
        assessmentStructureId: selectedAssessment,
        order: assessmentItems.filter((row) => row.assessmentStructureId === selectedAssessment).length + 1,
      });
    }

    if (mode === "gradingSystem") {
      setGradingSystemForm({
        ...emptyGradingSystem(),
        organizationId: filterOrganizationId,
      });
    }

    if (mode === "gradeRule") {
      const selectedSystem = filterGradingSystemId || gradingSystems[0]?.id;
      setGradeRuleForm({
        ...emptyGradeRule(),
        gradingSystemId: selectedSystem,
        order: gradeRules.filter((row) => row.gradingSystemId === selectedSystem).length + 1,
      });
    }

    setDrawerOpen(true);
  };

  // ======================================================
  // EDIT OPENERS
  // ======================================================

  const openEditAcademicStructure = (row: AcademicStructure) => {
    setEditMode(true);
    setDrawerMode("academicStructure");
    setAcademicStructureForm({
      id: row.id,
      name: row.name,
      level: row.level,
      startDate: row.startDate,
      endDate: row.endDate,
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      active: row.active ?? true,
    });
    setDrawerOpen(true);
  };

  const openEditAcademicPeriod = (row: AcademicPeriod) => {
    setEditMode(true);
    setDrawerMode("academicPeriod");
    setAcademicPeriodForm({
      id: row.id,
      academicStructureId: row.academicStructureId,
      name: row.name,
      type: row.type,
      startDate: row.startDate,
      endDate: row.endDate,
      photo: row.photo || "",
      order: row.order,
      active: row.active ?? true,
    });
    setDrawerOpen(true);
  };

  const openEditAssessmentStructure = (row: AssessmentStructure) => {
    setEditMode(true);
    setDrawerMode("assessmentStructure");
    setAssessmentStructureForm({
      id: row.id,
      organizationId: row.organizationId,
      academicStructureId: row.academicStructureId,
      name: row.name,
      description: row.description || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      totalScore: row.totalScore,
      active: row.active ?? true,
      locked: row.locked ?? false,
    });
    setDrawerOpen(true);
  };

  const openEditAssessmentItem = (row: AssessmentStructureItem) => {
    setEditMode(true);
    setDrawerMode("assessmentItem");
    setAssessmentItemForm({
      id: row.id,
      assessmentStructureId: row.assessmentStructureId,
      name: row.name,
      weight: row.weight,
      maxScore: row.maxScore,
      order: row.order,
      compulsory: row.compulsory ?? true,
      active: row.active ?? true,
    });
    setDrawerOpen(true);
  };

  const openEditGradingSystem = (row: GradingSystem) => {
    setEditMode(true);
    setDrawerMode("gradingSystem");
    setGradingSystemForm({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      type: row.type,
      description: row.description || "",
      photo: row.photo || "",
      active: row.active ?? true,
      default: row.default ?? false,
      locked: row.locked ?? false,
    });
    setDrawerOpen(true);
  };

  const openEditGradeRule = (row: GradeRule) => {
    setEditMode(true);
    setDrawerMode("gradeRule");
    setGradeRuleForm({
      id: row.id,
      gradingSystemId: row.gradingSystemId,
      minScore: row.minScore,
      maxScore: row.maxScore,
      grade: row.grade,
      remark: row.remark || "",
      gpa: row.gpa,
      color: row.color || "",
      order: row.order,
      active: row.active ?? true,
    });
    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION
  // ======================================================

  const validateAcademicStructure = () => {
    const form = academicStructureForm;
    if (!form.name.trim()) return "Enter academic structure name";
    if (!form.startDate) return "Select start date";
    if (!form.endDate) return "Select end date";
    if (form.endDate < form.startDate) return "End date cannot be before start date";

    const duplicate = academicStructures.find((row) => {
      if (editMode && row.id === form.id) return false;
      return row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
    });

    if (duplicate) return "Academic structure with this name already exists in this branch";
    return null;
  };

  const validateAcademicPeriod = () => {
    const form = academicPeriodForm;
    if (!form.academicStructureId) return "Select academic structure";
    if (!form.name.trim()) return "Enter academic period name";
    if (!form.startDate) return "Select start date";
    if (!form.endDate) return "Select end date";
    if (form.endDate < form.startDate) return "End date cannot be before start date";

    const duplicate = academicPeriods.find((row) => {
      if (editMode && row.id === form.id) return false;
      return row.academicStructureId === Number(form.academicStructureId) && row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
    });

    if (duplicate) return "Academic period with this name already exists under this structure";
    return null;
  };

  const validateAssessmentStructure = () => {
    const form = assessmentStructureForm;
    if (!form.academicStructureId) return "Select academic structure";
    if (!form.name.trim()) return "Enter assessment structure name";

    const duplicate = assessmentStructures.find((row) => {
      if (editMode && row.id === form.id) return false;
      return row.academicStructureId === Number(form.academicStructureId) && row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
    });

    if (duplicate) return "Assessment structure with this name already exists under this academic structure";
    return null;
  };

  const validateAssessmentItem = () => {
    const form = assessmentItemForm;
    if (!form.assessmentStructureId) return "Select assessment structure";
    if (!form.name.trim()) return "Enter assessment item name";
    if (Number(form.weight) <= 0) return "Weight must be greater than zero";
    if (Number(form.maxScore) <= 0) return "Max score must be greater than zero";

    const duplicate = assessmentItems.find((row) => {
      if (editMode && row.id === form.id) return false;
      return row.assessmentStructureId === Number(form.assessmentStructureId) && row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
    });

    if (duplicate) return "Assessment item with this name already exists in this structure";
    return null;
  };

  const validateGradingSystem = () => {
    const form = gradingSystemForm;
    if (!form.name.trim()) return "Enter grading system name";

    const duplicate = gradingSystems.find((row) => {
      if (editMode && row.id === form.id) return false;
      return row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
    });

    if (duplicate) return "Grading system with this name already exists in this branch";
    return null;
  };

  const validateGradeRule = () => {
    const form = gradeRuleForm;
    if (!form.gradingSystemId) return "Select grading system";
    if (!form.grade.trim()) return "Enter grade";
    if (Number(form.maxScore) < Number(form.minScore)) return "Max score cannot be lower than min score";

    const duplicate = gradeRules.find((row) => {
      if (editMode && row.id === form.id) return false;
      return (
        row.gradingSystemId === Number(form.gradingSystemId) &&
        row.grade.trim().toLowerCase() === form.grade.trim().toLowerCase() &&
        Number(row.minScore) === Number(form.minScore) &&
        Number(row.maxScore) === Number(form.maxScore)
      );
    });

    if (duplicate) return "This grade rule already exists";
    return null;
  };

  // ======================================================
  // SAVE HANDLERS
  // ======================================================

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const saveAcademicStructure = async () => {
    if (!requireTenant()) return;
    const error = validateAcademicStructure();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        name: academicStructureForm.name.trim(),
        level: academicStructureForm.level,
        startDate: academicStructureForm.startDate,
        endDate: academicStructureForm.endDate,
        photo: academicStructureForm.photo || undefined,
        bannerImage: academicStructureForm.bannerImage || undefined,
        active: academicStructureForm.active !== false,
      }) as AcademicStructure;

      if (editMode && academicStructureForm.id) {
        await db.academicStructures.update(academicStructureForm.id, {
          ...payload,
          id: academicStructureForm.id,
          isDeleted: false,
        });
      } else {
        await db.academicStructures.add(payload);
      }

      closeDrawer();
      await load();
    } catch (error) {
      console.error("Failed to save academic structure:", error);
      alert("Failed to save academic structure");
    } finally {
      setSaving(false);
    }
  };

  const saveAcademicPeriod = async () => {
    if (!requireTenant()) return;
    const error = validateAcademicPeriod();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        academicStructureId: Number(academicPeriodForm.academicStructureId),
        name: academicPeriodForm.name.trim(),
        type: academicPeriodForm.type || undefined,
        startDate: academicPeriodForm.startDate,
        endDate: academicPeriodForm.endDate,
        photo: academicPeriodForm.photo || undefined,
        order: Number(academicPeriodForm.order),
        active: academicPeriodForm.active !== false,
      }) as AcademicPeriod;

      if (editMode && academicPeriodForm.id) {
        await db.academicPeriods.update(academicPeriodForm.id, {
          ...payload,
          id: academicPeriodForm.id,
          isDeleted: false,
        });
      } else {
        await db.academicPeriods.add(payload);
      }

      closeDrawer();
      await load();
    } catch (error) {
      console.error("Failed to save academic period:", error);
      alert("Failed to save academic period");
    } finally {
      setSaving(false);
    }
  };

  const saveAssessmentStructure = async () => {
    if (!requireTenant()) return;
    const error = validateAssessmentStructure();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        organizationId: assessmentStructureForm.organizationId ? Number(assessmentStructureForm.organizationId) : undefined,
        academicStructureId: Number(assessmentStructureForm.academicStructureId),
        name: assessmentStructureForm.name.trim(),
        description: assessmentStructureForm.description?.trim() || undefined,
        photo: assessmentStructureForm.photo || undefined,
        bannerImage: assessmentStructureForm.bannerImage || undefined,
        totalScore: assessmentStructureForm.totalScore == null ? undefined : Number(assessmentStructureForm.totalScore),
        active: assessmentStructureForm.active !== false,
        locked: !!assessmentStructureForm.locked,
      }) as AssessmentStructure;

      if (editMode && assessmentStructureForm.id) {
        await db.assessmentStructures.update(assessmentStructureForm.id, {
          ...payload,
          id: assessmentStructureForm.id,
          isDeleted: false,
        });
      } else {
        await db.assessmentStructures.add(payload);
      }

      closeDrawer();
      await load();
    } catch (error) {
      console.error("Failed to save assessment structure:", error);
      alert("Failed to save assessment structure");
    } finally {
      setSaving(false);
    }
  };

  const saveAssessmentItem = async () => {
    if (!requireTenant()) return;
    const error = validateAssessmentItem();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        assessmentStructureId: Number(assessmentItemForm.assessmentStructureId),
        name: assessmentItemForm.name.trim(),
        weight: Number(assessmentItemForm.weight),
        maxScore: Number(assessmentItemForm.maxScore),
        order: Number(assessmentItemForm.order),
        compulsory: assessmentItemForm.compulsory !== false,
        active: assessmentItemForm.active !== false,
      }) as AssessmentStructureItem;

      if (editMode && assessmentItemForm.id) {
        await db.assessmentStructureItems.update(assessmentItemForm.id, {
          ...payload,
          id: assessmentItemForm.id,
          isDeleted: false,
        });
      } else {
        await db.assessmentStructureItems.add(payload);
      }

      closeDrawer();
      await load();
    } catch (error) {
      console.error("Failed to save assessment item:", error);
      alert("Failed to save assessment item");
    } finally {
      setSaving(false);
    }
  };

  const saveGradingSystem = async () => {
    if (!requireTenant()) return;
    const error = validateGradingSystem();
    if (error) return alert(error);

    try {
      setSaving(true);

      if (gradingSystemForm.default) {
        await Promise.all(
          gradingSystems
            .filter((row) => row.id && row.id !== gradingSystemForm.id)
            .map((row) => db.gradingSystems.update(row.id!, { default: false, updatedAt: Date.now() }))
        );
      }

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        organizationId: gradingSystemForm.organizationId ? Number(gradingSystemForm.organizationId) : undefined,
        name: gradingSystemForm.name.trim(),
        type: gradingSystemForm.type,
        description: gradingSystemForm.description?.trim() || undefined,
        photo: gradingSystemForm.photo || undefined,
        active: gradingSystemForm.active !== false,
        default: !!gradingSystemForm.default,
        locked: !!gradingSystemForm.locked,
      }) as GradingSystem;

      if (editMode && gradingSystemForm.id) {
        await db.gradingSystems.update(gradingSystemForm.id, {
          ...payload,
          id: gradingSystemForm.id,
          isDeleted: false,
        });
      } else {
        await db.gradingSystems.add(payload);
      }

      closeDrawer();
      await load();
    } catch (error) {
      console.error("Failed to save grading system:", error);
      alert("Failed to save grading system");
    } finally {
      setSaving(false);
    }
  };

  const saveGradeRule = async () => {
    if (!requireTenant()) return;
    const error = validateGradeRule();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        gradingSystemId: Number(gradeRuleForm.gradingSystemId),
        minScore: Number(gradeRuleForm.minScore),
        maxScore: Number(gradeRuleForm.maxScore),
        grade: gradeRuleForm.grade.trim(),
        remark: gradeRuleForm.remark?.trim() || undefined,
        gpa: gradeRuleForm.gpa == null ? undefined : Number(gradeRuleForm.gpa),
        color: gradeRuleForm.color?.trim() || undefined,
        order: Number(gradeRuleForm.order),
        active: gradeRuleForm.active !== false,
      }) as GradeRule;

      if (editMode && gradeRuleForm.id) {
        await db.gradeRules.update(gradeRuleForm.id, {
          ...payload,
          id: gradeRuleForm.id,
          isDeleted: false,
        });
      } else {
        await db.gradeRules.add(payload);
      }

      closeDrawer();
      await load();
    } catch (error) {
      console.error("Failed to save grade rule:", error);
      alert("Failed to save grade rule");
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (drawerMode === "academicStructure") return saveAcademicStructure();
    if (drawerMode === "academicPeriod") return saveAcademicPeriod();
    if (drawerMode === "assessmentStructure") return saveAssessmentStructure();
    if (drawerMode === "assessmentItem") return saveAssessmentItem();
    if (drawerMode === "gradingSystem") return saveGradingSystem();
    return saveGradeRule();
  };

  // ======================================================
  // DELETE / TOGGLE / SETTINGS
  // ======================================================

  const softDelete = async (table: keyof typeof db, id?: number, message = "Delete this record?") => {
    if (!id) return;
    if (!confirm(message)) return;
    await (db[table] as any).update(id, { isDeleted: true, updatedAt: Date.now() });
    await load();
  };

  const toggleField = async (
    table: keyof typeof db,
    id: number | undefined,
    field: "active" | "locked",
    current?: boolean
  ) => {
    if (!id) return;
    await (db[table] as any).update(id, { [field]: !current, updatedAt: Date.now() });
    await load();
  };

  const getBranchSetting = async () => {
    if (!accountId || !schoolId || !branchId) return undefined;
    const rows = await db.schoolBranchSettings.toArray();
    return rows.find((row) => sameTenant(row));
  };

  const setAsCurrentStructure = async (id?: number) => {
    if (!id) return;
    const setting = await getBranchSetting();
    if (!setting?.id) {
      alert("Create branch settings first before setting current academic structure.");
      return;
    }
    await db.schoolBranchSettings.update(setting.id, {
      currentAcademicStructureId: id,
      updatedAt: Date.now(),
    });
    await load();
  };

  const setAsCurrentPeriod = async (period: AcademicPeriod) => {
    const setting = await getBranchSetting();
    if (!setting?.id) {
      alert("Create branch settings first before setting current academic period.");
      return;
    }
    await db.schoolBranchSettings.update(setting.id, {
      currentAcademicStructureId: period.academicStructureId,
      currentAcademicPeriodId: period.id,
      updatedAt: Date.now(),
    });
    await load();
  };

  // ======================================================
  // UI HELPERS
  // ======================================================

  const drawerTitle = {
    academicStructure: editMode ? "Edit Academic Structure" : "Create Academic Structure",
    academicPeriod: editMode ? "Edit Academic Period" : "Create Academic Period",
    assessmentStructure: editMode ? "Edit Assessment Structure" : "Create Assessment Structure",
    assessmentItem: editMode ? "Edit Assessment Item" : "Create Assessment Item",
    gradingSystem: editMode ? "Edit Grading System" : "Create Grading System",
    gradeRule: editMode ? "Edit Grade Rule" : "Create Grade Rule",
  }[drawerMode];

  const currentStructureId = settings?.currentAcademicStructureId;
  const currentPeriodId = settings?.currentAcademicPeriodId;

  // ======================================================
  // LOADING / PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <main className="aac-page" style={{ "--aac-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="aac-state-card">
          <div className="aac-spinner" />
          <h2>Opening configuration...</h2>
          <p>Checking account, school, branch, and academic configuration data.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="aac-page" style={{ "--aac-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="aac-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing academic configuration.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="aac-page" style={{ "--aac-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="aac-state-card">
          <h2>Select a branch first</h2>
          <p>Academic and assessment configuration belongs to one active school branch.</p>
          <button type="button" className="aac-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // RENDER
  // ======================================================

  return (
    <main className="aac-page" style={{ "--aac-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="aac-hero">
        <div className="aac-hero-left">
          <div className="aac-hero-icon">🎯</div>
          <div className="aac-title-wrap">
            <p>Branch Configuration</p>
            <h2>Academic & Assessment</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="aac-ghost-btn" onClick={load}>
          Refresh
        </button>
      </section>

      <section className="aac-summary-grid" aria-label="Configuration summary">
        <SummaryCard label="Academic Structures" value={summary.academicStructures} icon="📘" />
        <SummaryCard label="Periods" value={summary.academicPeriods} icon="📅" />
        <SummaryCard label="Assessment Structures" value={summary.assessmentStructures} icon="🧩" />
        <SummaryCard label="Complete Weights" value={summary.completeAssessmentStructures} icon="✅" />
        <SummaryCard label="Grading Ready" value={summary.gradingReady} icon="🏅" />
      </section>

      <section className="aac-tabs" aria-label="Configuration sections">
        <button type="button" className={tab === "academic" ? "active" : ""} onClick={() => setTab("academic")}>
          Academic Calendar
        </button>
        <button type="button" className={tab === "assessment" ? "active" : ""} onClick={() => setTab("assessment")}>
          Assessment
        </button>
        <button type="button" className={tab === "grading" ? "active" : ""} onClick={() => setTab("grading")}>
          Grading
        </button>
      </section>

      <section className="aac-filter-card">
        <input
          placeholder="Search configuration..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {(tab === "academic" || tab === "assessment") && (
          <select
            value={filterStructureId || ""}
            onChange={(event) => setFilterStructureId(Number(event.target.value) || undefined)}
          >
            <option value="">All Academic Structures</option>
            {academicStructures.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} • {row.level}
              </option>
            ))}
          </select>
        )}

        {(tab === "assessment" || tab === "grading") && (
          <select
            value={filterOrganizationId || ""}
            onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}
          >
            <option value="">All Organizations</option>
            {organizations.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} • {row.type}
              </option>
            ))}
          </select>
        )}

        {tab === "assessment" && (
          <select
            value={filterAssessmentStructureId || ""}
            onChange={(event) => setFilterAssessmentStructureId(Number(event.target.value) || undefined)}
          >
            <option value="">All Assessment Structures</option>
            {assessmentStructures.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        )}

        {tab === "grading" && (
          <select
            value={filterGradingSystemId || ""}
            onChange={(event) => setFilterGradingSystemId(Number(event.target.value) || undefined)}
          >
            <option value="">All Grading Systems</option>
            {gradingSystems.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        )}

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>
      </section>

      {tab === "academic" && (
        <section className="aac-two-col">
          <EntitySection
            title="Academic Structures"
            subtitle="Define the academic year, semester system, or level calendar."
            actionLabel="+ Structure"
            onAction={() => openCreate("academicStructure")}
            emptyText="No academic structures found."
          >
            {filteredAcademicStructures.map((row) => {
              const current = currentStructureId === row.id;
              const id = row.id || 0;
              return (
                <article key={row.id} className="aac-entity-card with-banner">
                  {row.bannerImage && (
                    <div
                      className="aac-card-banner"
                      style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.48), rgba(15,23,42,.08)), url(${row.bannerImage})` }}
                    />
                  )}
                  <div className="aac-card-body">
                    <div className="aac-card-top">
                      <div>
                        <h3>{row.name}</h3>
                        <p>{row.startDate} → {row.endDate}</p>
                      </div>
                      <div className="aac-card-avatar">📘</div>
                    </div>

                    <div className="aac-chip-row">
                      <Chip tone="blue">{row.level}</Chip>
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      {current && <Chip tone="purple">Current</Chip>}
                    </div>

                    <div className="aac-stat-row">
                      <MiniStat label="Periods" value={periodCountByStructure.get(id) || 0} />
                      <MiniStat label="Class Subjects" value={classSubjectCountByStructure.get(id) || 0} />
                      <MiniStat label="Assessments" value={assessmentCountByStructure.get(id) || 0} />
                    </div>

                    <div className="aac-action-row">
                      {!current && <button type="button" onClick={() => setAsCurrentStructure(row.id)}>Set Current</button>}
                      <button type="button" onClick={() => toggleField("academicStructures", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button type="button" onClick={() => openEditAcademicStructure(row)}>Edit</button>
                      <button type="button" className="danger" onClick={() => softDelete("academicStructures", row.id, "Delete this academic structure?")}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </EntitySection>

          <EntitySection
            title="Academic Periods"
            subtitle="Create terms or semesters inside an academic structure."
            actionLabel="+ Period"
            onAction={() => openCreate("academicPeriod")}
            emptyText="No academic periods found."
          >
            {filteredAcademicPeriods.map((row) => {
              const current = currentPeriodId === row.id;
              const id = row.id || 0;
              const structure = academicStructureMap.get(row.academicStructureId);
              return (
                <article key={row.id} className="aac-entity-card">
                  <div className="aac-card-body">
                    <div className="aac-card-top">
                      <div>
                        <h3>{row.name}</h3>
                        <p>{structure?.name || "Unknown academic structure"} · {row.startDate} → {row.endDate}</p>
                      </div>
                      <div className="aac-card-avatar">📅</div>
                    </div>

                    <div className="aac-chip-row">
                      {row.type && <Chip tone="blue">{row.type}</Chip>}
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      {current && <Chip tone="purple">Current</Chip>}
                      <Chip tone="gray">Order {row.order}</Chip>
                    </div>

                    <div className="aac-stat-row">
                      <MiniStat label="Class Subjects" value={classSubjectCountByPeriod.get(id) || 0} />
                      <MiniStat label="Entry Records" value={entryCountByPeriod.get(id) || 0} />
                    </div>

                    <div className="aac-action-row">
                      {!current && <button type="button" onClick={() => setAsCurrentPeriod(row)}>Set Current</button>}
                      <button type="button" onClick={() => toggleField("academicPeriods", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button type="button" onClick={() => openEditAcademicPeriod(row)}>Edit</button>
                      <button type="button" className="danger" onClick={() => softDelete("academicPeriods", row.id, "Delete this academic period?")}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </EntitySection>
        </section>
      )}

      {tab === "assessment" && (
        <section className="aac-two-col">
          <EntitySection
            title="Assessment Structures"
            subtitle="Define reusable scoring frameworks like class score + exam."
            actionLabel="+ Structure"
            onAction={() => openCreate("assessmentStructure")}
            emptyText="No assessment structures found."
          >
            {filteredAssessmentStructures.map((row) => {
              const id = row.id || 0;
              const totalWeight = weightByAssessment.get(id) || 0;
              const structure = academicStructureMap.get(row.academicStructureId);
              const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
              return (
                <article key={row.id} className="aac-entity-card with-banner">
                  {row.bannerImage && (
                    <div
                      className="aac-card-banner"
                      style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.48), rgba(15,23,42,.08)), url(${row.bannerImage})` }}
                    />
                  )}
                  <div className="aac-card-body">
                    <div className="aac-card-top">
                      <div>
                        <h3>{row.name}</h3>
                        <p>{structure?.name || "Unknown academic structure"} · {organization?.name || "No organization"}</p>
                      </div>
                      <div className="aac-card-avatar">🧩</div>
                    </div>

                    {row.description && <p className="aac-description">{row.description}</p>}

                    <div className="aac-chip-row">
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      {row.locked && <Chip tone="orange">Locked</Chip>}
                      <Chip tone={totalWeight === 100 ? "green" : "orange"}>Weight {totalWeight}%</Chip>
                      <Chip tone="blue">Total {row.totalScore ?? 100}</Chip>
                    </div>

                    <div className="aac-stat-row">
                      <MiniStat label="Items" value={itemCountByAssessment.get(id) || 0} />
                      <MiniStat label="Links" value={applicabilityCountByAssessment.get(id) || 0} />
                      <MiniStat label="Entries" value={entryCountByAssessment.get(id) || 0} />
                    </div>

                    <div className="aac-action-row">
                      <button type="button" onClick={() => toggleField("assessmentStructures", row.id, "locked", !!row.locked)}>
                        {row.locked ? "Unlock" : "Lock"}
                      </button>
                      <button type="button" onClick={() => toggleField("assessmentStructures", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button type="button" onClick={() => openEditAssessmentStructure(row)}>Edit</button>
                      <button type="button" className="danger" onClick={() => softDelete("assessmentStructures", row.id, "Delete this assessment structure?")}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </EntitySection>

          <EntitySection
            title="Structure Items"
            subtitle="Break assessment structures into weighted items."
            actionLabel="+ Item"
            onAction={() => openCreate("assessmentItem")}
            emptyText="No assessment structure items found."
          >
            {filteredAssessmentItems.map((row) => {
              const id = row.id || 0;
              const structure = assessmentStructureMap.get(row.assessmentStructureId);
              return (
                <article key={row.id} className="aac-entity-card">
                  <div className="aac-card-body">
                    <div className="aac-card-top">
                      <div>
                        <h3>{row.name}</h3>
                        <p>{structure?.name || "Unknown assessment structure"}</p>
                      </div>
                      <div className="aac-card-avatar">📝</div>
                    </div>

                    <div className="aac-chip-row">
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      {row.compulsory !== false && <Chip tone="purple">Compulsory</Chip>}
                      <Chip tone="blue">Weight {row.weight}%</Chip>
                      <Chip tone="blue">Max {row.maxScore}</Chip>
                      <Chip tone="gray">Order {row.order}</Chip>
                    </div>

                    <div className="aac-stat-row">
                      <MiniStat label="Entry Records" value={entryCountByItem.get(id) || 0} />
                    </div>

                    <div className="aac-action-row">
                      <button type="button" onClick={() => toggleField("assessmentStructureItems", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button type="button" onClick={() => openEditAssessmentItem(row)}>Edit</button>
                      <button type="button" className="danger" onClick={() => softDelete("assessmentStructureItems", row.id, "Delete this assessment item?")}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </EntitySection>
        </section>
      )}

      {tab === "grading" && (
        <section className="aac-two-col">
          <EntitySection
            title="Grading Systems"
            subtitle="Create percentage, GPA, competency, or custom grading schemes."
            actionLabel="+ System"
            onAction={() => openCreate("gradingSystem")}
            emptyText="No grading systems found."
          >
            {filteredGradingSystems.map((row) => {
              const id = row.id || 0;
              const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
              return (
                <article key={row.id} className="aac-entity-card">
                  <div className="aac-card-body">
                    <div className="aac-card-top">
                      <div>
                        <h3>{row.name}</h3>
                        <p>{organization?.name || "No organization"}</p>
                      </div>
                      <div className="aac-card-avatar">🏅</div>
                    </div>

                    {row.description && <p className="aac-description">{row.description}</p>}

                    <div className="aac-chip-row">
                      <Chip tone="blue">{row.type}</Chip>
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      {row.default && <Chip tone="purple">Default</Chip>}
                      {row.locked && <Chip tone="orange">Locked</Chip>}
                    </div>

                    <div className="aac-stat-row">
                      <MiniStat label="Rules" value={ruleCountByGrading.get(id) || 0} />
                      <MiniStat label="Links" value={applicabilityCountByGrading.get(id) || 0} />
                      <MiniStat label="Results" value={computedCountByGrading.get(id) || 0} />
                    </div>

                    <div className="aac-action-row">
                      <button type="button" onClick={() => toggleField("gradingSystems", row.id, "locked", !!row.locked)}>
                        {row.locked ? "Unlock" : "Lock"}
                      </button>
                      <button type="button" onClick={() => toggleField("gradingSystems", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button type="button" onClick={() => openEditGradingSystem(row)}>Edit</button>
                      <button type="button" className="danger" onClick={() => softDelete("gradingSystems", row.id, "Delete this grading system?")}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </EntitySection>

          <EntitySection
            title="Grade Rules"
            subtitle="Define score bands and remarks for each grading system."
            actionLabel="+ Rule"
            onAction={() => openCreate("gradeRule")}
            emptyText="No grade rules found."
          >
            {filteredGradeRules.map((row) => {
              const system = gradingSystemMap.get(row.gradingSystemId);
              return (
                <article key={row.id} className="aac-entity-card">
                  <div className="aac-card-body">
                    <div className="aac-card-top">
                      <div>
                        <h3>{row.grade}</h3>
                        <p>{system?.name || "Unknown grading system"}</p>
                      </div>
                      <div className="aac-grade-badge" style={{ background: row.color || primary }}>
                        {row.grade}
                      </div>
                    </div>

                    <div className="aac-chip-row">
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      <Chip tone="blue">{row.minScore} - {row.maxScore}</Chip>
                      {row.gpa != null && <Chip tone="purple">GPA {row.gpa}</Chip>}
                      <Chip tone="gray">Order {row.order}</Chip>
                    </div>

                    {row.remark && <p className="aac-description">{row.remark}</p>}

                    <div className="aac-action-row">
                      <button type="button" onClick={() => toggleField("gradeRules", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button type="button" onClick={() => openEditGradeRule(row)}>Edit</button>
                      <button type="button" className="danger" onClick={() => softDelete("gradeRules", row.id, "Delete this grade rule?")}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </EntitySection>
        </section>
      )}

      {drawerOpen && (
        <div className="aac-drawer-layer">
          <button type="button" className="aac-drawer-overlay" aria-label="Close drawer" onClick={closeDrawer} />

          <aside className="aac-drawer">
            <div className="aac-drawer-head">
              <div>
                <p>{editMode ? "Update record" : "New record"}</p>
                <h2>{drawerTitle}</h2>
              </div>
              <button type="button" onClick={closeDrawer}>✕</button>
            </div>

            <div className="aac-form-grid">
              {drawerMode === "academicStructure" && (
                <>
                  <Field label="Name"><input value={academicStructureForm.name} onChange={(e) => setAcademicStructureForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. 2026 Basic School Year" /></Field>
                  <Field label="Level"><select value={academicStructureForm.level} onChange={(e) => setAcademicStructureForm((p) => ({ ...p, level: e.target.value as AcademicLevel }))}><option value="nursery">Nursery</option><option value="primary">Primary</option><option value="junior_high">Junior High</option><option value="senior_high">Senior High</option><option value="tertiary">Tertiary</option></select></Field>
                  <div className="aac-form-two"><Field label="Start Date"><input type="date" value={academicStructureForm.startDate} onChange={(e) => setAcademicStructureForm((p) => ({ ...p, startDate: e.target.value }))} /></Field><Field label="End Date"><input type="date" value={academicStructureForm.endDate} onChange={(e) => setAcademicStructureForm((p) => ({ ...p, endDate: e.target.value }))} /></Field></div>
                  <Field label="Photo"><input type="file" accept="image/*" onChange={(e) => uploadImage("academicStructurePhoto", e.target.files?.[0])} /></Field>
                  <Field label="Banner Image"><input type="file" accept="image/*" onChange={(e) => uploadImage("academicStructureBanner", e.target.files?.[0])} /></Field>
                  <Check label="Active" checked={academicStructureForm.active !== false} onChange={(checked) => setAcademicStructureForm((p) => ({ ...p, active: checked }))} />
                </>
              )}

              {drawerMode === "academicPeriod" && (
                <>
                  <Field label="Academic Structure"><select value={academicPeriodForm.academicStructureId || ""} onChange={(e) => setAcademicPeriodForm((p) => ({ ...p, academicStructureId: Number(e.target.value) || undefined }))}><option value="">Select Academic Structure</option>{academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
                  <Field label="Name"><input value={academicPeriodForm.name} onChange={(e) => setAcademicPeriodForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Term 1" /></Field>
                  <Field label="Type"><select value={academicPeriodForm.type || ""} onChange={(e) => setAcademicPeriodForm((p) => ({ ...p, type: e.target.value as TermType }))}><option value="Term 1">Term 1</option><option value="Term 2">Term 2</option><option value="Term 3">Term 3</option><option value="Semester 1">Semester 1</option><option value="Semester 2">Semester 2</option></select></Field>
                  <div className="aac-form-two"><Field label="Start Date"><input type="date" value={academicPeriodForm.startDate} onChange={(e) => setAcademicPeriodForm((p) => ({ ...p, startDate: e.target.value }))} /></Field><Field label="End Date"><input type="date" value={academicPeriodForm.endDate} onChange={(e) => setAcademicPeriodForm((p) => ({ ...p, endDate: e.target.value }))} /></Field></div>
                  <Field label="Order"><input type="number" value={academicPeriodForm.order} onChange={(e) => setAcademicPeriodForm((p) => ({ ...p, order: Number(e.target.value) }))} /></Field>
                  <Field label="Photo"><input type="file" accept="image/*" onChange={(e) => uploadImage("academicPeriodPhoto", e.target.files?.[0])} /></Field>
                  <Check label="Active" checked={academicPeriodForm.active !== false} onChange={(checked) => setAcademicPeriodForm((p) => ({ ...p, active: checked }))} />
                </>
              )}

              {drawerMode === "assessmentStructure" && (
                <>
                  <Field label="Name"><input value={assessmentStructureForm.name} onChange={(e) => setAssessmentStructureForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Class Score + Exam" /></Field>
                  <Field label="Academic Structure"><select value={assessmentStructureForm.academicStructureId || ""} onChange={(e) => setAssessmentStructureForm((p) => ({ ...p, academicStructureId: Number(e.target.value) || undefined }))}><option value="">Select Academic Structure</option>{academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
                  <Field label="Organization"><select value={assessmentStructureForm.organizationId || ""} onChange={(e) => setAssessmentStructureForm((p) => ({ ...p, organizationId: Number(e.target.value) || undefined }))}><option value="">No organization</option>{organizations.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}</select></Field>
                  <Field label="Description"><textarea value={assessmentStructureForm.description || ""} onChange={(e) => setAssessmentStructureForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></Field>
                  <Field label="Total Score"><input type="number" value={assessmentStructureForm.totalScore ?? ""} onChange={(e) => setAssessmentStructureForm((p) => ({ ...p, totalScore: e.target.value === "" ? undefined : Number(e.target.value) }))} /></Field>
                  <Field label="Photo"><input type="file" accept="image/*" onChange={(e) => uploadImage("assessmentStructurePhoto", e.target.files?.[0])} /></Field>
                  <Field label="Banner Image"><input type="file" accept="image/*" onChange={(e) => uploadImage("assessmentStructureBanner", e.target.files?.[0])} /></Field>
                  <Check label="Active" checked={assessmentStructureForm.active !== false} onChange={(checked) => setAssessmentStructureForm((p) => ({ ...p, active: checked }))} />
                  <Check label="Locked" checked={!!assessmentStructureForm.locked} onChange={(checked) => setAssessmentStructureForm((p) => ({ ...p, locked: checked }))} />
                </>
              )}

              {drawerMode === "assessmentItem" && (
                <>
                  <Field label="Assessment Structure"><select value={assessmentItemForm.assessmentStructureId || ""} onChange={(e) => setAssessmentItemForm((p) => ({ ...p, assessmentStructureId: Number(e.target.value) || undefined }))}><option value="">Select Assessment Structure</option>{assessmentStructures.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
                  <Field label="Name"><input value={assessmentItemForm.name} onChange={(e) => setAssessmentItemForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Class Test" /></Field>
                  <div className="aac-form-three"><Field label="Weight"><input type="number" value={assessmentItemForm.weight} onChange={(e) => setAssessmentItemForm((p) => ({ ...p, weight: Number(e.target.value) }))} /></Field><Field label="Max Score"><input type="number" value={assessmentItemForm.maxScore} onChange={(e) => setAssessmentItemForm((p) => ({ ...p, maxScore: Number(e.target.value) }))} /></Field><Field label="Order"><input type="number" value={assessmentItemForm.order} onChange={(e) => setAssessmentItemForm((p) => ({ ...p, order: Number(e.target.value) }))} /></Field></div>
                  <Check label="Compulsory" checked={assessmentItemForm.compulsory !== false} onChange={(checked) => setAssessmentItemForm((p) => ({ ...p, compulsory: checked }))} />
                  <Check label="Active" checked={assessmentItemForm.active !== false} onChange={(checked) => setAssessmentItemForm((p) => ({ ...p, active: checked }))} />
                </>
              )}

              {drawerMode === "gradingSystem" && (
                <>
                  <Field label="Name"><input value={gradingSystemForm.name} onChange={(e) => setGradingSystemForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. NaCCA Percentage Grading" /></Field>
                  <Field label="Type"><select value={gradingSystemForm.type} onChange={(e) => setGradingSystemForm((p) => ({ ...p, type: e.target.value as GradingSystemType }))}><option value="percentage">Percentage</option><option value="gpa">GPA</option><option value="competency">Competency</option><option value="custom">Custom</option></select></Field>
                  <Field label="Organization"><select value={gradingSystemForm.organizationId || ""} onChange={(e) => setGradingSystemForm((p) => ({ ...p, organizationId: Number(e.target.value) || undefined }))}><option value="">No organization</option>{organizations.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}</select></Field>
                  <Field label="Description"><textarea value={gradingSystemForm.description || ""} onChange={(e) => setGradingSystemForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></Field>
                  <Field label="Photo"><input type="file" accept="image/*" onChange={(e) => uploadImage("gradingSystemPhoto", e.target.files?.[0])} /></Field>
                  <Check label="Active" checked={gradingSystemForm.active !== false} onChange={(checked) => setGradingSystemForm((p) => ({ ...p, active: checked }))} />
                  <Check label="Default grading system" checked={!!gradingSystemForm.default} onChange={(checked) => setGradingSystemForm((p) => ({ ...p, default: checked }))} />
                  <Check label="Locked" checked={!!gradingSystemForm.locked} onChange={(checked) => setGradingSystemForm((p) => ({ ...p, locked: checked }))} />
                </>
              )}

              {drawerMode === "gradeRule" && (
                <>
                  <Field label="Grading System"><select value={gradeRuleForm.gradingSystemId || ""} onChange={(e) => setGradeRuleForm((p) => ({ ...p, gradingSystemId: Number(e.target.value) || undefined }))}><option value="">Select Grading System</option>{gradingSystems.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
                  <Field label="Grade"><input value={gradeRuleForm.grade} onChange={(e) => setGradeRuleForm((p) => ({ ...p, grade: e.target.value }))} placeholder="e.g. A1" /></Field>
                  <div className="aac-form-three"><Field label="Min Score"><input type="number" value={gradeRuleForm.minScore} onChange={(e) => setGradeRuleForm((p) => ({ ...p, minScore: Number(e.target.value) }))} /></Field><Field label="Max Score"><input type="number" value={gradeRuleForm.maxScore} onChange={(e) => setGradeRuleForm((p) => ({ ...p, maxScore: Number(e.target.value) }))} /></Field><Field label="Order"><input type="number" value={gradeRuleForm.order} onChange={(e) => setGradeRuleForm((p) => ({ ...p, order: Number(e.target.value) }))} /></Field></div>
                  <div className="aac-form-two"><Field label="GPA"><input type="number" value={gradeRuleForm.gpa ?? ""} onChange={(e) => setGradeRuleForm((p) => ({ ...p, gpa: e.target.value === "" ? undefined : Number(e.target.value) }))} /></Field><Field label="Color"><input value={gradeRuleForm.color || ""} onChange={(e) => setGradeRuleForm((p) => ({ ...p, color: e.target.value }))} placeholder="#16a34a" /></Field></div>
                  <Field label="Remark"><input value={gradeRuleForm.remark || ""} onChange={(e) => setGradeRuleForm((p) => ({ ...p, remark: e.target.value }))} placeholder="e.g. Excellent" /></Field>
                  <Check label="Active" checked={gradeRuleForm.active !== false} onChange={(checked) => setGradeRuleForm((p) => ({ ...p, active: checked }))} />
                </>
              )}
            </div>

            <button type="button" onClick={save} disabled={saving} className="aac-save-btn">
              {saving ? "Saving..." : editMode ? "Save Changes" : "Create"}
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function countBy<T>(rows: T[], getKey: (row: T) => number) {
  const map = new Map<number, number>();
  rows.forEach((row) => {
    const key = getKey(row);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <article className="aac-summary-card">
      <div className="aac-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function EntitySection({
  title,
  subtitle,
  actionLabel,
  onAction,
  emptyText,
  children,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  emptyText: string;
  children: React.ReactNode;
}) {
  const count = React.Children.count(children);
  return (
    <section className="aac-section-card">
      <div className="aac-section-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" onClick={onAction}>{actionLabel}</button>
      </div>

      <div className="aac-list">
        {count ? children : <div className="aac-empty-card">{emptyText}</div>}
      </div>
    </section>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`aac-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="aac-mini-stat">
      <strong>{value}</strong>
      <em>{label}</em>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="aac-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="aac-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes aacSpin {
  to { transform: rotate(360deg); }
}

.aac-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.aac-page *,
.aac-page *::before,
.aac-page *::after {
  box-sizing: border-box;
}

.aac-page button,
.aac-page input,
.aac-page select,
.aac-page textarea {
  font: inherit;
  max-width: 100%;
}

.aac-page input,
.aac-page select,
.aac-page textarea {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}

.aac-page textarea {
  min-height: 88px;
  padding: 12px;
  resize: vertical;
}

.aac-page img,
.aac-page svg,
.aac-page canvas,
.aac-page video {
  max-width: 100%;
  height: auto;
}

.aac-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.aac-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.aac-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.aac-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--aac-primary) 18%, transparent);
  border-top-color: var(--aac-primary);
  animation: aacSpin .8s linear infinite;
}

.aac-primary-btn,
.aac-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--aac-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.aac-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--aac-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.aac-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.aac-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--aac-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--aac-primary) 28%, transparent);
  font-size: 22px;
}

.aac-title-wrap {
  min-width: 0;
}

.aac-title-wrap p,
.aac-title-wrap h2,
.aac-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aac-title-wrap p {
  margin: 0 0 2px;
  color: var(--aac-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.aac-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.aac-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.aac-ghost-btn,
.aac-section-head button,
.aac-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.aac-section-head button {
  background: var(--aac-primary);
  color: #fff;
  border-color: transparent;
}

.aac-action-row button.danger {
  color: #dc2626;
  background: rgba(239, 68, 68, .08);
  border-color: rgba(239, 68, 68, .12);
}

.aac-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.aac-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}

.aac-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--aac-primary) 12%, #fff);
}

.aac-summary-card div:last-child {
  min-width: 0;
}

.aac-summary-card strong,
.aac-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aac-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.aac-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.aac-tabs {
  position: sticky;
  top: 50px;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
  padding: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg, #f8fafc) 88%, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  backdrop-filter: blur(12px);
}

.aac-tabs button {
  min-width: 0;
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 8px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aac-tabs button.active {
  background: var(--aac-primary);
  color: #fff;
}

.aac-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
}

.aac-two-col {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.aac-section-card {
  min-width: 0;
  border-radius: 26px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
  padding: 10px;
  overflow: hidden;
}

.aac-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.aac-section-head div {
  min-width: 0;
}

.aac-section-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.aac-section-head p {
  margin: 3px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.aac-list {
  display: grid;
  gap: 10px;
}

.aac-entity-card,
.aac-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: linear-gradient(135deg, #fff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.aac-empty-card {
  padding: 22px;
  text-align: center;
  color: var(--muted, #64748b);
  font-size: 13px;
  font-weight: 800;
  border-style: dashed;
}

.aac-card-banner {
  height: 82px;
  background-size: cover;
  background-position: center;
}

.aac-card-body {
  padding: 13px;
}

.aac-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.aac-card-top div:first-child {
  min-width: 0;
}

.aac-card-top h3,
.aac-card-top p {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aac-card-top h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.035em;
}

.aac-card-top p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.aac-card-avatar,
.aac-grade-badge {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: color-mix(in srgb, var(--aac-primary) 12%, #fff);
  font-weight: 1000;
}

.aac-grade-badge {
  color: #fff;
}

.aac-description {
  margin: 9px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.55;
}

.aac-chip-row,
.aac-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.aac-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aac-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.aac-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.aac-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.aac-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.aac-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.aac-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.aac-stat-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.aac-mini-stat {
  min-width: 0;
  display: block;
  padding: 9px;
  border-radius: 17px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .13);
  overflow: hidden;
}

.aac-mini-stat strong,
.aac-mini-stat em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aac-mini-stat strong {
  font-size: 17px;
  font-weight: 1000;
  font-style: normal;
}

.aac-mini-stat em {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
  font-style: normal;
}

.aac-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.aac-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, .52);
}

.aac-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 520px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: -24px 0 70px rgba(15, 23, 42, .22);
}

.aac-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--surface, #fff);
}

.aac-drawer-head div {
  min-width: 0;
}

.aac-drawer-head p {
  margin: 0;
  color: var(--aac-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.aac-drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aac-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 15px;
  background: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.aac-form-grid {
  display: grid;
  gap: 12px;
}

.aac-form-two,
.aac-form-three {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.aac-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.aac-field > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.aac-check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .14);
  font-weight: 850;
}

.aac-check input {
  width: 18px;
  min-height: 18px;
  flex: 0 0 auto;
}

.aac-save-btn {
  width: 100%;
  margin-top: 14px;
}

.aac-save-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}

@media (min-width: 680px) {
  .aac-page {
    padding: 12px;
  }

  .aac-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .aac-filter-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .aac-stat-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .aac-form-two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .aac-form-three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .aac-page {
    padding: 16px;
  }

  .aac-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .aac-filter-card {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }

  .aac-two-col {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .aac-tabs {
    position: static;
    width: min(560px, 100%);
  }

  .aac-section-card {
    padding: 12px;
  }
}

@media (max-width: 520px) {
  .aac-page {
    padding: 6px;
  }

  .aac-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .aac-ghost-btn {
    width: 100%;
  }

  .aac-tabs {
    top: 46px;
    border-radius: 22px;
  }

  .aac-tabs button {
    min-height: 36px;
    font-size: 11px;
  }

  .aac-summary-grid {
    gap: 6px;
  }

  .aac-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .aac-section-card {
    border-radius: 22px;
    padding: 8px;
  }

  .aac-section-head {
    align-items: stretch;
    flex-direction: column;
  }

  .aac-section-head button {
    width: 100%;
  }

  .aac-card-body {
    padding: 11px;
  }

  .aac-action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .aac-action-row button {
    width: 100%;
    padding: 0 8px;
  }

  .aac-drawer {
    width: min(96vw, 520px);
    padding: 12px;
  }
}
`;
