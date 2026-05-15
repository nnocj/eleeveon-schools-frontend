"use client";

/**
 * academicAndAssessmentConfiguration.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL ACADEMIC + ASSESSMENT CONFIGURATION COCKPIT
 * ---------------------------------------------------------
 *
 * DB tables managed here:
 * - academicStructures
 * - academicPeriods
 * - assessmentStructures
 * - assessmentStructureItems
 * - gradingSystems
 * - gradeRules
 *
 * DB tables read for safety/usage:
 * - organizations
 * - assessmentApplicabilities
 * - assessmentEntries
 * - computedResults
 * - classes
 * - classSubjects
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * Active School -> Active Branch -> Academic Configuration
 *
 * This page does NOT enter marks.
 * This page does NOT activate assessment for class subjects.
 * This page defines the reusable academic and assessment frameworks:
 *
 * 1. Academic Structure
 *    e.g. 2026 Basic School Year, JHS Academic Year, Semester System
 *
 * 2. Academic Period
 *    e.g. Term 1, Term 2, Semester 1
 *
 * 3. Assessment Structure
 *    e.g. Class Score + Exam, Project + Practical + Exam
 *
 * 4. Assessment Structure Items
 *    e.g. Class Test 30%, Exam 70%
 *
 * 5. Grading System
 *    e.g. Percentage, GPA, Competency, Custom
 *
 * 6. Grade Rules
 *    e.g. 80-100 = A1, 70-79 = B2
 */

import React, { useEffect, useMemo, useState } from "react";

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
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

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

type AcademicStructureView = {
  row: AcademicStructure;
  periodCount: number;
  classSubjectCount: number;
  assessmentStructureCount: number;
  enrollmentCount: number;
};

type AcademicPeriodView = {
  row: AcademicPeriod;
  structureName: string;
  enrollmentCount: number;
  classSubjectCount: number;
  entryCount: number;
};

type AssessmentStructureView = {
  row: AssessmentStructure;
  academicStructureName: string;
  organizationName: string;
  itemCount: number;
  totalWeight: number;
  applicabilityCount: number;
  entryCount: number;
};

type AssessmentItemView = {
  row: AssessmentStructureItem;
  assessmentStructureName: string;
  entryCount: number;
};

type GradingSystemView = {
  row: GradingSystem;
  organizationName: string;
  ruleCount: number;
  applicabilityCount: number;
  computedResultCount: number;
};

type GradeRuleView = {
  row: GradeRule;
  gradingSystemName: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const endOfYearISO = () => `${new Date().getFullYear()}-12-31`;

// ======================================================
// COMPONENT
// ======================================================

export default function AcademicAndAssessmentConfiguration() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
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

  const [academicStructureForm, setAcademicStructureForm] = useState<AcademicStructureForm>({
    name: "",
    level: "primary",
    startDate: todayISO(),
    endDate: endOfYearISO(),
    photo: "",
    bannerImage: "",
    active: true,
  });

  const [academicPeriodForm, setAcademicPeriodForm] = useState<AcademicPeriodForm>({
    academicStructureId: undefined,
    name: "",
    type: "Term 1",
    startDate: todayISO(),
    endDate: endOfYearISO(),
    photo: "",
    order: 1,
    active: true,
  });

  const [assessmentStructureForm, setAssessmentStructureForm] = useState<AssessmentStructureForm>({
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

  const [assessmentItemForm, setAssessmentItemForm] = useState<AssessmentItemForm>({
    assessmentStructureId: undefined,
    name: "",
    weight: 0,
    maxScore: 100,
    order: 1,
    compulsory: true,
    active: true,
  });

  const [gradingSystemForm, setGradingSystemForm] = useState<GradingSystemForm>({
    organizationId: undefined,
    name: "",
    type: "percentage",
    description: "",
    photo: "",
    active: true,
    default: false,
    locked: false,
  });

  const [gradeRuleForm, setGradeRuleForm] = useState<GradeRuleForm>({
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
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

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

      setAcademicStructures(
        academicStructureRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setAcademicPeriods(
        academicPeriodRows
          .filter(row => row.branchId === branchId && !row.isDeleted)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setAssessmentStructures(
        assessmentStructureRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setAssessmentItems(
        assessmentItemRows
          .filter(row => row.branchId === branchId && !row.isDeleted)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setGradingSystems(
        gradingSystemRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setGradeRules(
        gradeRuleRows
          .filter(row => row.branchId === branchId && !row.isDeleted)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setOrganizations(
        organizationRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setAssessmentApplicabilities(
        applicabilityRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setAssessmentEntries(
        entryRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setComputedResults(
        computedRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setClasses(classRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setClassSubjects(
        classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load academic and assessment configuration:", error);
      alert("Failed to load academic and assessment configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const academicStructureMap = useMemo(
    () => new Map(academicStructures.map(row => [row.id, row])),
    [academicStructures]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map(row => [row.id, row])),
    [organizations]
  );

  const assessmentStructureMap = useMemo(
    () => new Map(assessmentStructures.map(row => [row.id, row])),
    [assessmentStructures]
  );

  const gradingSystemMap = useMemo(
    () => new Map(gradingSystems.map(row => [row.id, row])),
    [gradingSystems]
  );

  const periodCountByStructure = useMemo(() => {
    const map = new Map<number, number>();
    academicPeriods.forEach(row => {
      map.set(row.academicStructureId, (map.get(row.academicStructureId) || 0) + 1);
    });
    return map;
  }, [academicPeriods]);

  const classSubjectCountByStructure = useMemo(() => {
    const map = new Map<number, number>();
    classSubjects.forEach(row => {
      map.set(row.academicStructureId, (map.get(row.academicStructureId) || 0) + 1);
    });
    return map;
  }, [classSubjects]);

  const assessmentStructureCountByAcademicStructure = useMemo(() => {
    const map = new Map<number, number>();
    assessmentStructures.forEach(row => {
      map.set(row.academicStructureId, (map.get(row.academicStructureId) || 0) + 1);
    });
    return map;
  }, [assessmentStructures]);

  const enrollmentCountByStructure = useMemo(() => {
    const map = new Map<number, number>();
    classes.forEach(() => undefined);
    return map;
  }, [classes]);

  const classSubjectCountByPeriod = useMemo(() => {
    const map = new Map<number, number>();
    classSubjects.forEach(row => {
      if (!row.academicPeriodId) return;
      map.set(row.academicPeriodId, (map.get(row.academicPeriodId) || 0) + 1);
    });
    return map;
  }, [classSubjects]);

  const entryCountByPeriod = useMemo(() => {
    const map = new Map<number, number>();
    assessmentEntries.forEach(row => {
      map.set(row.academicPeriodId, (map.get(row.academicPeriodId) || 0) + 1);
    });
    return map;
  }, [assessmentEntries]);

  const itemStatsByAssessmentStructure = useMemo(() => {
    const map = new Map<number, { count: number; weight: number }>();
    assessmentItems.forEach(row => {
      const current = map.get(row.assessmentStructureId) || { count: 0, weight: 0 };
      current.count += 1;
      if (row.active !== false) current.weight += Number(row.weight || 0);
      map.set(row.assessmentStructureId, current);
    });
    return map;
  }, [assessmentItems]);

  const applicabilityCountByAssessmentStructure = useMemo(() => {
    const map = new Map<number, number>();
    assessmentApplicabilities.forEach(row => {
      map.set(row.assessmentStructureId, (map.get(row.assessmentStructureId) || 0) + 1);
    });
    return map;
  }, [assessmentApplicabilities]);

  const entryCountByAssessmentStructure = useMemo(() => {
    const map = new Map<number, number>();
    assessmentEntries.forEach(row => {
      if (!row.assessmentStructureId) return;
      map.set(row.assessmentStructureId, (map.get(row.assessmentStructureId) || 0) + 1);
    });
    return map;
  }, [assessmentEntries]);

  const entryCountByAssessmentItem = useMemo(() => {
    const map = new Map<number, number>();
    assessmentEntries.forEach(row => {
      map.set(row.assessmentStructureItemId, (map.get(row.assessmentStructureItemId) || 0) + 1);
    });
    return map;
  }, [assessmentEntries]);

  const ruleCountByGradingSystem = useMemo(() => {
    const map = new Map<number, number>();
    gradeRules.forEach(row => {
      map.set(row.gradingSystemId, (map.get(row.gradingSystemId) || 0) + 1);
    });
    return map;
  }, [gradeRules]);

  const applicabilityCountByGradingSystem = useMemo(() => {
    const map = new Map<number, number>();
    assessmentApplicabilities.forEach(row => {
      if (!row.gradingSystemId) return;
      map.set(row.gradingSystemId, (map.get(row.gradingSystemId) || 0) + 1);
    });
    return map;
  }, [assessmentApplicabilities]);

  const computedCountByGradingSystem = useMemo(() => {
    const map = new Map<number, number>();
    computedResults.forEach(row => {
      if (!row.gradingSystemId) return;
      map.set(row.gradingSystemId, (map.get(row.gradingSystemId) || 0) + 1);
    });
    return map;
  }, [computedResults]);

  // ======================================================
  // VIEW MODELS
  // ======================================================

  const academicStructureViews = useMemo<AcademicStructureView[]>(() => {
    return academicStructures.map(row => {
      const id = row.id || 0;
      return {
        row,
        periodCount: periodCountByStructure.get(id) || 0,
        classSubjectCount: classSubjectCountByStructure.get(id) || 0,
        assessmentStructureCount: assessmentStructureCountByAcademicStructure.get(id) || 0,
        enrollmentCount: enrollmentCountByStructure.get(id) || 0,
      };
    });
  }, [
    academicStructures,
    periodCountByStructure,
    classSubjectCountByStructure,
    assessmentStructureCountByAcademicStructure,
    enrollmentCountByStructure,
  ]);

  const academicPeriodViews = useMemo<AcademicPeriodView[]>(() => {
    return academicPeriods.map(row => {
      const structure = academicStructureMap.get(row.academicStructureId);
      const id = row.id || 0;
      return {
        row,
        structureName: structure?.name || "Unknown academic structure",
        enrollmentCount: 0,
        classSubjectCount: classSubjectCountByPeriod.get(id) || 0,
        entryCount: entryCountByPeriod.get(id) || 0,
      };
    });
  }, [academicPeriods, academicStructureMap, classSubjectCountByPeriod, entryCountByPeriod]);

  const assessmentStructureViews = useMemo<AssessmentStructureView[]>(() => {
    return assessmentStructures.map(row => {
      const structure = academicStructureMap.get(row.academicStructureId);
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const stats = itemStatsByAssessmentStructure.get(row.id || 0) || { count: 0, weight: 0 };
      return {
        row,
        academicStructureName: structure?.name || "Unknown academic structure",
        organizationName: organization?.name || "No organization",
        itemCount: stats.count,
        totalWeight: stats.weight,
        applicabilityCount: applicabilityCountByAssessmentStructure.get(row.id || 0) || 0,
        entryCount: entryCountByAssessmentStructure.get(row.id || 0) || 0,
      };
    });
  }, [
    assessmentStructures,
    academicStructureMap,
    organizationMap,
    itemStatsByAssessmentStructure,
    applicabilityCountByAssessmentStructure,
    entryCountByAssessmentStructure,
  ]);

  const assessmentItemViews = useMemo<AssessmentItemView[]>(() => {
    return assessmentItems.map(row => {
      const structure = assessmentStructureMap.get(row.assessmentStructureId);
      return {
        row,
        assessmentStructureName: structure?.name || "Unknown assessment structure",
        entryCount: entryCountByAssessmentItem.get(row.id || 0) || 0,
      };
    });
  }, [assessmentItems, assessmentStructureMap, entryCountByAssessmentItem]);

  const gradingSystemViews = useMemo<GradingSystemView[]>(() => {
    return gradingSystems.map(row => {
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const id = row.id || 0;
      return {
        row,
        organizationName: organization?.name || "No organization",
        ruleCount: ruleCountByGradingSystem.get(id) || 0,
        applicabilityCount: applicabilityCountByGradingSystem.get(id) || 0,
        computedResultCount: computedCountByGradingSystem.get(id) || 0,
      };
    });
  }, [
    gradingSystems,
    organizationMap,
    ruleCountByGradingSystem,
    applicabilityCountByGradingSystem,
    computedCountByGradingSystem,
  ]);

  const gradeRuleViews = useMemo<GradeRuleView[]>(() => {
    return gradeRules.map(row => {
      const system = gradingSystemMap.get(row.gradingSystemId);
      return {
        row,
        gradingSystemName: system?.name || "Unknown grading system",
      };
    });
  }, [gradeRules, gradingSystemMap]);

  // ======================================================
  // FILTERED VIEWS
  // ======================================================

  const query = search.trim().toLowerCase();

  const filteredAcademicStructures = useMemo(() => {
    return academicStructureViews
      .filter(item => {
        const row = item.row;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (!query) return true;
        return `${row.name} ${row.level} ${row.startDate} ${row.endDate}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [academicStructureViews, filterStatus, query]);

  const filteredAcademicPeriods = useMemo(() => {
    return academicPeriodViews
      .filter(item => {
        const row = item.row;
        if (filterStructureId && row.academicStructureId !== filterStructureId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (!query) return true;
        return `${row.name} ${row.type || ""} ${item.structureName} ${row.startDate} ${row.endDate}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => Number(a.row.order || 0) - Number(b.row.order || 0));
  }, [academicPeriodViews, filterStructureId, filterStatus, query]);

  const filteredAssessmentStructures = useMemo(() => {
    return assessmentStructureViews
      .filter(item => {
        const row = item.row;
        if (filterStructureId && row.academicStructureId !== filterStructureId) return false;
        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "locked" && row.locked !== true) return false;
        if (!query) return true;
        return `${row.name} ${row.description || ""} ${item.academicStructureName} ${item.organizationName}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [assessmentStructureViews, filterStructureId, filterOrganizationId, filterStatus, query]);

  const filteredAssessmentItems = useMemo(() => {
    return assessmentItemViews
      .filter(item => {
        const row = item.row;
        if (filterAssessmentStructureId && row.assessmentStructureId !== filterAssessmentStructureId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (!query) return true;
        return `${row.name} ${item.assessmentStructureName} ${row.weight} ${row.maxScore}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => Number(a.row.order || 0) - Number(b.row.order || 0));
  }, [assessmentItemViews, filterAssessmentStructureId, filterStatus, query]);

  const filteredGradingSystems = useMemo(() => {
    return gradingSystemViews
      .filter(item => {
        const row = item.row;
        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "locked" && row.locked !== true) return false;
        if (!query) return true;
        return `${row.name} ${row.type} ${row.description || ""} ${item.organizationName}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [gradingSystemViews, filterOrganizationId, filterStatus, query]);

  const filteredGradeRules = useMemo(() => {
    return gradeRuleViews
      .filter(item => {
        const row = item.row;
        if (filterGradingSystemId && row.gradingSystemId !== filterGradingSystemId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (!query) return true;
        return `${row.grade} ${row.remark || ""} ${row.minScore} ${row.maxScore} ${item.gradingSystemName}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => Number(a.row.order || 0) - Number(b.row.order || 0));
  }, [gradeRuleViews, filterGradingSystemId, filterStatus, query]);

  // ======================================================
  // SUMMARY
  // ======================================================

  const summary = useMemo(() => {
    const completeAssessmentStructures = assessmentStructureViews.filter(row => row.totalWeight === 100).length;
    const incompleteAssessmentStructures = assessmentStructureViews.filter(row => row.totalWeight !== 100).length;
    const gradingReady = gradingSystemViews.filter(row => row.ruleCount > 0).length;

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
  }, [
    academicStructures,
    academicPeriods,
    assessmentStructures,
    assessmentItems,
    gradingSystems,
    gradeRules,
    assessmentStructureViews,
    gradingSystemViews,
    assessmentApplicabilities,
  ]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const fileToBase64 = (file: File) => {
    return new Promise<string>(resolve => {
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

    if (target === "academicStructurePhoto") {
      setAcademicStructureForm(prev => ({ ...prev, photo: value }));
    }
    if (target === "academicStructureBanner") {
      setAcademicStructureForm(prev => ({ ...prev, bannerImage: value }));
    }
    if (target === "academicPeriodPhoto") {
      setAcademicPeriodForm(prev => ({ ...prev, photo: value }));
    }
    if (target === "assessmentStructurePhoto") {
      setAssessmentStructureForm(prev => ({ ...prev, photo: value }));
    }
    if (target === "assessmentStructureBanner") {
      setAssessmentStructureForm(prev => ({ ...prev, bannerImage: value }));
    }
    if (target === "gradingSystemPhoto") {
      setGradingSystemForm(prev => ({ ...prev, photo: value }));
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditMode(false);
  };

  const openCreate = (mode: DrawerMode) => {
    if (!activeBranchId) {
      alert("Select a branch first.");
      return;
    }

    setEditMode(false);
    setDrawerMode(mode);

    if (mode === "academicStructure") {
      setAcademicStructureForm({
        name: "",
        level: "primary",
        startDate: todayISO(),
        endDate: endOfYearISO(),
        photo: "",
        bannerImage: "",
        active: true,
      });
    }

    if (mode === "academicPeriod") {
      const selectedStructure = filterStructureId || settings?.currentAcademicStructureId;
      const structure = selectedStructure ? academicStructureMap.get(selectedStructure) : undefined;
      setAcademicPeriodForm({
        academicStructureId: selectedStructure,
        name: "",
        type: "Term 1",
        startDate: structure?.startDate || todayISO(),
        endDate: structure?.endDate || endOfYearISO(),
        photo: "",
        order: academicPeriods.filter(row => row.academicStructureId === selectedStructure).length + 1,
        active: true,
      });
    }

    if (mode === "assessmentStructure") {
      setAssessmentStructureForm({
        organizationId: filterOrganizationId,
        academicStructureId: filterStructureId || settings?.currentAcademicStructureId,
        name: "",
        description: "",
        photo: "",
        bannerImage: "",
        totalScore: 100,
        active: true,
        locked: false,
      });
    }

    if (mode === "assessmentItem") {
      setAssessmentItemForm({
        assessmentStructureId: filterAssessmentStructureId,
        name: "",
        weight: 0,
        maxScore: 100,
        order: assessmentItems.filter(row => row.assessmentStructureId === filterAssessmentStructureId).length + 1,
        compulsory: true,
        active: true,
      });
    }

    if (mode === "gradingSystem") {
      setGradingSystemForm({
        organizationId: filterOrganizationId,
        name: "",
        type: "percentage",
        description: "",
        photo: "",
        active: true,
        default: false,
        locked: false,
      });
    }

    if (mode === "gradeRule") {
      setGradeRuleForm({
        gradingSystemId: filterGradingSystemId,
        minScore: 0,
        maxScore: 100,
        grade: "",
        remark: "",
        gpa: undefined,
        color: "",
        order: gradeRules.filter(row => row.gradingSystemId === filterGradingSystemId).length + 1,
        active: true,
      });
    }

    setDrawerOpen(true);
  };

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

    const duplicate = academicStructures.find(row => {
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

    const duplicate = academicPeriods.find(row => {
      if (editMode && row.id === form.id) return false;
      return (
        row.academicStructureId === Number(form.academicStructureId) &&
        row.name.trim().toLowerCase() === form.name.trim().toLowerCase()
      );
    });

    if (duplicate) return "Academic period with this name already exists under this structure";
    return null;
  };

  const validateAssessmentStructure = () => {
    const form = assessmentStructureForm;
    if (!form.academicStructureId) return "Select academic structure";
    if (!form.name.trim()) return "Enter assessment structure name";

    const duplicate = assessmentStructures.find(row => {
      if (editMode && row.id === form.id) return false;
      return (
        row.academicStructureId === Number(form.academicStructureId) &&
        row.name.trim().toLowerCase() === form.name.trim().toLowerCase()
      );
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

    const duplicate = assessmentItems.find(row => {
      if (editMode && row.id === form.id) return false;
      return (
        row.assessmentStructureId === Number(form.assessmentStructureId) &&
        row.name.trim().toLowerCase() === form.name.trim().toLowerCase()
      );
    });

    if (duplicate) return "Assessment item with this name already exists in this structure";
    return null;
  };

  const validateGradingSystem = () => {
    const form = gradingSystemForm;
    if (!form.name.trim()) return "Enter grading system name";

    const duplicate = gradingSystems.find(row => {
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

    const duplicate = gradeRules.find(row => {
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

  const saveAcademicStructure = async () => {
    const error = validateAcademicStructure();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
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
          name: payload.name,
          level: payload.level,
          startDate: payload.startDate,
          endDate: payload.endDate,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
    const error = validateAcademicPeriod();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
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
          academicStructureId: payload.academicStructureId,
          name: payload.name,
          type: payload.type,
          startDate: payload.startDate,
          endDate: payload.endDate,
          photo: payload.photo,
          order: payload.order,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
    const error = validateAssessmentStructure();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
        branchId,
        organizationId: assessmentStructureForm.organizationId
          ? Number(assessmentStructureForm.organizationId)
          : undefined,
        academicStructureId: Number(assessmentStructureForm.academicStructureId),
        name: assessmentStructureForm.name.trim(),
        description: assessmentStructureForm.description?.trim() || undefined,
        photo: assessmentStructureForm.photo || undefined,
        bannerImage: assessmentStructureForm.bannerImage || undefined,
        totalScore:
          assessmentStructureForm.totalScore == null
            ? undefined
            : Number(assessmentStructureForm.totalScore),
        active: assessmentStructureForm.active !== false,
        locked: !!assessmentStructureForm.locked,
      }) as AssessmentStructure;

      if (editMode && assessmentStructureForm.id) {
        await db.assessmentStructures.update(assessmentStructureForm.id, {
          organizationId: payload.organizationId,
          academicStructureId: payload.academicStructureId,
          name: payload.name,
          description: payload.description,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          totalScore: payload.totalScore,
          active: payload.active,
          locked: payload.locked,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
    const error = validateAssessmentItem();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
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
          assessmentStructureId: payload.assessmentStructureId,
          name: payload.name,
          weight: payload.weight,
          maxScore: payload.maxScore,
          order: payload.order,
          compulsory: payload.compulsory,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
    const error = validateGradingSystem();
    if (error) return alert(error);

    try {
      setSaving(true);

      if (gradingSystemForm.default) {
        await Promise.all(
          gradingSystems
            .filter(row => row.id && row.id !== gradingSystemForm.id)
            .map(row => db.gradingSystems.update(row.id!, { default: false, updatedAt: Date.now() }))
        );
      }

      const payload = prepareSyncData({
        branchId,
        organizationId: gradingSystemForm.organizationId
          ? Number(gradingSystemForm.organizationId)
          : undefined,
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
          organizationId: payload.organizationId,
          name: payload.name,
          type: payload.type,
          description: payload.description,
          photo: payload.photo,
          active: payload.active,
          default: payload.default,
          locked: payload.locked,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
    const error = validateGradeRule();
    if (error) return alert(error);

    try {
      setSaving(true);
      const payload = prepareSyncData({
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
          gradingSystemId: payload.gradingSystemId,
          minScore: payload.minScore,
          maxScore: payload.maxScore,
          grade: payload.grade,
          remark: payload.remark,
          gpa: payload.gpa,
          color: payload.color,
          order: payload.order,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
  // DELETE / TOGGLE HELPERS
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

  const setAsCurrentStructure = async (id?: number) => {
    if (!id) return;
    const setting = (await db.schoolBranchSettings.toArray())[0];
    if (!setting?.id) return;
    await db.schoolBranchSettings.update(setting.id, { currentAcademicStructureId: id, updatedAt: Date.now() });
    await load();
  };

  const setAsCurrentPeriod = async (period: AcademicPeriod) => {
    const setting = (await db.schoolBranchSettings.toArray())[0];
    if (!setting?.id) return;
    await db.schoolBranchSettings.update(setting.id, {
      currentAcademicStructureId: period.academicStructureId,
      currentAcademicPeriodId: period.id,
      updatedAt: Date.now(),
    });
    await load();
  };

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  const tabButton = (active: boolean): React.CSSProperties => ({
    padding: "12px 16px",
    borderRadius: 16,
    border: active ? `2px solid ${primary}` : "1px solid rgba(0,0,0,0.10)",
    background: active ? "rgba(59,130,246,0.08)" : "var(--surface)",
    color: "var(--text)",
    cursor: "pointer",
    fontWeight: 900,
  });

  const gridList: React.CSSProperties = {
    marginTop: 18,
    display: "grid",
    gap: 12,
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading academic and assessment configuration...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Academic and assessment configuration belongs to a branch. Select a school and branch first.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // RENDER
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>
            Academic & Assessment Configuration
          </h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Configuring academic and assessment frameworks in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button type="button" onClick={load} style={ghostButton}>
          Refresh
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Academic Structures</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.academicStructures}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Periods</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.academicPeriods}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Assessment Structures</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.assessmentStructures}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Complete Weights</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.completeAssessmentStructures}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Grading Ready</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.gradingReady}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setTab("academic")} style={tabButton(tab === "academic")}>
          Academic Calendar
        </button>
        <button type="button" onClick={() => setTab("assessment")} style={tabButton(tab === "assessment")}>
          Assessment Structures
        </button>
        <button type="button" onClick={() => setTab("grading")} style={tabButton(tab === "grading")}>
          Grading Systems
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input
          placeholder="Search configuration..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        {(tab === "academic" || tab === "assessment") && (
          <select
            value={filterStructureId || ""}
            onChange={e => setFilterStructureId(Number(e.target.value) || undefined)}
            style={input}
          >
            <option value="">All Academic Structures</option>
            {academicStructures.map(row => (
              <option key={row.id} value={row.id}>
                {row.name} • {row.level}
              </option>
            ))}
          </select>
        )}

        {(tab === "assessment" || tab === "grading") && (
          <select
            value={filterOrganizationId || ""}
            onChange={e => setFilterOrganizationId(Number(e.target.value) || undefined)}
            style={input}
          >
            <option value="">All Organizations</option>
            {organizations.map(row => (
              <option key={row.id} value={row.id}>
                {row.name} • {row.type}
              </option>
            ))}
          </select>
        )}

        {tab === "assessment" && (
          <select
            value={filterAssessmentStructureId || ""}
            onChange={e => setFilterAssessmentStructureId(Number(e.target.value) || undefined)}
            style={input}
          >
            <option value="">All Assessment Structures</option>
            {assessmentStructures.map(row => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        )}

        {tab === "grading" && (
          <select
            value={filterGradingSystemId || ""}
            onChange={e => setFilterGradingSystemId(Number(e.target.value) || undefined)}
            style={input}
          >
            <option value="">All Grading Systems</option>
            {gradingSystems.map(row => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          style={input}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>
      </div>

      {/* ACADEMIC TAB */}
      {tab === "academic" && (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Academic Structures</h3>
              <button style={button} onClick={() => openCreate("academicStructure")}>+ Structure</button>
            </div>

            <div style={gridList}>
              {filteredAcademicStructures.map(item => {
                const row = item.row;
                const current = settings?.currentAcademicStructureId === row.id;
                return (
                  <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
                    {row.bannerImage && (
                      <div
                        style={{
                          height: 80,
                          backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.45), rgba(15,23,42,0.08)), url(${row.bannerImage})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                    )}
                    <div style={{ padding: 16 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <strong style={{ fontSize: 17 }}>{row.name}</strong>
                        <span style={badge("blue")}>{row.level}</span>
                        <span style={badge(row.active === false ? "red" : "green")}>
                          {row.active === false ? "Inactive" : "Active"}
                        </span>
                        {current && <span style={badge("purple")}>Current</span>}
                      </div>
                      <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>
                        {row.startDate} → {row.endDate}
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={badge("gray")}>{item.periodCount} period(s)</span>
                        <span style={badge("gray")}>{item.classSubjectCount} class subject(s)</span>
                        <span style={badge("gray")}>{item.assessmentStructureCount} assessment structure(s)</span>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {!current && <button style={ghostButton} onClick={() => setAsCurrentStructure(row.id)}>Set Current</button>}
                        <button style={ghostButton} onClick={() => toggleField("academicStructures", row.id, "active", row.active !== false)}>
                          {row.active === false ? "Activate" : "Deactivate"}
                        </button>
                        <button style={ghostButton} onClick={() => openEditAcademicStructure(row)}>Edit</button>
                        <button
                          style={{ ...ghostButton, color: "#dc2626" }}
                          onClick={() => softDelete("academicStructures", row.id, "Delete this academic structure?")}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!filteredAcademicStructures.length && <div style={{ ...card, textAlign: "center" }}>No academic structures found.</div>}
            </div>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Academic Periods</h3>
              <button style={button} onClick={() => openCreate("academicPeriod")}>+ Period</button>
            </div>

            <div style={gridList}>
              {filteredAcademicPeriods.map(item => {
                const row = item.row;
                const current = settings?.currentAcademicPeriodId === row.id;
                return (
                  <div key={row.id} style={card}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ fontSize: 17 }}>{row.name}</strong>
                      {row.type && <span style={badge("blue")}>{row.type}</span>}
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      {current && <span style={badge("purple")}>Current</span>}
                    </div>
                    <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>
                      {item.structureName} • {row.startDate} → {row.endDate}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("gray")}>Order: {row.order}</span>
                      <span style={badge("gray")}>{item.classSubjectCount} class subject(s)</span>
                      <span style={badge("gray")}>{item.entryCount} entry record(s)</span>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {!current && <button style={ghostButton} onClick={() => setAsCurrentPeriod(row)}>Set Current</button>}
                      <button style={ghostButton} onClick={() => toggleField("academicPeriods", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button style={ghostButton} onClick={() => openEditAcademicPeriod(row)}>Edit</button>
                      <button
                        style={{ ...ghostButton, color: "#dc2626" }}
                        onClick={() => softDelete("academicPeriods", row.id, "Delete this academic period?")}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {!filteredAcademicPeriods.length && <div style={{ ...card, textAlign: "center" }}>No academic periods found.</div>}
            </div>
          </section>
        </div>
      )}

      {/* ASSESSMENT TAB */}
      {tab === "assessment" && (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Assessment Structures</h3>
              <button style={button} onClick={() => openCreate("assessmentStructure")}>+ Structure</button>
            </div>

            <div style={gridList}>
              {filteredAssessmentStructures.map(item => {
                const row = item.row;
                return (
                  <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
                    {row.bannerImage && (
                      <div
                        style={{
                          height: 80,
                          backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.45), rgba(15,23,42,0.08)), url(${row.bannerImage})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                    )}
                    <div style={{ padding: 16 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <strong style={{ fontSize: 17 }}>{row.name}</strong>
                        <span style={badge(row.active === false ? "red" : "green")}>
                          {row.active === false ? "Inactive" : "Active"}
                        </span>
                        {row.locked && <span style={badge("orange")}>Locked</span>}
                        <span style={badge(item.totalWeight === 100 ? "green" : "orange")}>Weight: {item.totalWeight}%</span>
                      </div>
                      <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>
                        {item.academicStructureName} • {item.organizationName}
                      </div>
                      {row.description && <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>{row.description}</div>}
                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={badge("gray")}>{item.itemCount} item(s)</span>
                        <span style={badge("gray")}>{item.applicabilityCount} applicability link(s)</span>
                        <span style={badge("gray")}>{item.entryCount} entry record(s)</span>
                        <span style={badge("blue")}>Total score: {row.totalScore ?? 100}</span>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button style={ghostButton} onClick={() => toggleField("assessmentStructures", row.id, "locked", !!row.locked)}>
                          {row.locked ? "Unlock" : "Lock"}
                        </button>
                        <button style={ghostButton} onClick={() => toggleField("assessmentStructures", row.id, "active", row.active !== false)}>
                          {row.active === false ? "Activate" : "Deactivate"}
                        </button>
                        <button style={ghostButton} onClick={() => openEditAssessmentStructure(row)}>Edit</button>
                        <button
                          style={{ ...ghostButton, color: "#dc2626" }}
                          onClick={() => softDelete("assessmentStructures", row.id, "Delete this assessment structure?")}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!filteredAssessmentStructures.length && <div style={{ ...card, textAlign: "center" }}>No assessment structures found.</div>}
            </div>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Structure Items</h3>
              <button style={button} onClick={() => openCreate("assessmentItem")}>+ Item</button>
            </div>

            <div style={gridList}>
              {filteredAssessmentItems.map(item => {
                const row = item.row;
                return (
                  <div key={row.id} style={card}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ fontSize: 17 }}>{row.name}</strong>
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      {row.compulsory !== false && <span style={badge("purple")}>Compulsory</span>}
                    </div>
                    <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>
                      {item.assessmentStructureName}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>Weight: {row.weight}%</span>
                      <span style={badge("blue")}>Max: {row.maxScore}</span>
                      <span style={badge("gray")}>Order: {row.order}</span>
                      <span style={badge("gray")}>{item.entryCount} entry record(s)</span>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={ghostButton} onClick={() => toggleField("assessmentStructureItems", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button style={ghostButton} onClick={() => openEditAssessmentItem(row)}>Edit</button>
                      <button
                        style={{ ...ghostButton, color: "#dc2626" }}
                        onClick={() => softDelete("assessmentStructureItems", row.id, "Delete this assessment item?")}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {!filteredAssessmentItems.length && <div style={{ ...card, textAlign: "center" }}>No assessment structure items found.</div>}
            </div>
          </section>
        </div>
      )}

      {/* GRADING TAB */}
      {tab === "grading" && (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Grading Systems</h3>
              <button style={button} onClick={() => openCreate("gradingSystem")}>+ System</button>
            </div>

            <div style={gridList}>
              {filteredGradingSystems.map(item => {
                const row = item.row;
                return (
                  <div key={row.id} style={card}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ fontSize: 17 }}>{row.name}</strong>
                      <span style={badge("blue")}>{row.type}</span>
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      {row.default && <span style={badge("purple")}>Default</span>}
                      {row.locked && <span style={badge("orange")}>Locked</span>}
                    </div>
                    <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>
                      {item.organizationName}
                    </div>
                    {row.description && <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>{row.description}</div>}
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("gray")}>{item.ruleCount} rule(s)</span>
                      <span style={badge("gray")}>{item.applicabilityCount} applicability link(s)</span>
                      <span style={badge("gray")}>{item.computedResultCount} computed result(s)</span>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={ghostButton} onClick={() => toggleField("gradingSystems", row.id, "locked", !!row.locked)}>
                        {row.locked ? "Unlock" : "Lock"}
                      </button>
                      <button style={ghostButton} onClick={() => toggleField("gradingSystems", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button style={ghostButton} onClick={() => openEditGradingSystem(row)}>Edit</button>
                      <button
                        style={{ ...ghostButton, color: "#dc2626" }}
                        onClick={() => softDelete("gradingSystems", row.id, "Delete this grading system?")}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {!filteredGradingSystems.length && <div style={{ ...card, textAlign: "center" }}>No grading systems found.</div>}
            </div>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Grade Rules</h3>
              <button style={button} onClick={() => openCreate("gradeRule")}>+ Rule</button>
            </div>

            <div style={gridList}>
              {filteredGradeRules.map(item => {
                const row = item.row;
                return (
                  <div key={row.id} style={card}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ fontSize: 17 }}>{row.grade}</strong>
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      {row.color && <span style={{ ...badge("gray"), borderLeft: `12px solid ${row.color}` }}>{row.color}</span>}
                    </div>
                    <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>
                      {item.gradingSystemName}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{row.minScore} - {row.maxScore}</span>
                      <span style={badge("gray")}>Order: {row.order}</span>
                      <span style={badge("purple")}>GPA: {row.gpa ?? "-"}</span>
                      {row.remark && <span style={badge("orange")}>{row.remark}</span>}
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={ghostButton} onClick={() => toggleField("gradeRules", row.id, "active", row.active !== false)}>
                        {row.active === false ? "Activate" : "Deactivate"}
                      </button>
                      <button style={ghostButton} onClick={() => openEditGradeRule(row)}>Edit</button>
                      <button
                        style={{ ...ghostButton, color: "#dc2626" }}
                        onClick={() => softDelete("gradeRules", row.id, "Delete this grade rule?")}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {!filteredGradeRules.length && <div style={{ ...card, textAlign: "center" }}>No grade rules found.</div>}
            </div>
          </section>
        </div>
      )}

      {/* DRAWER */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={closeDrawer}
        >
          <div
            style={{
              width: "min(650px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit" : "Create"} {drawerMode.replace(/([A-Z])/g, " $1")}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Saved under {activeBranch?.name || "the selected branch"}.
                </div>
              </div>

              <button type="button" style={ghostButton} onClick={closeDrawer}>Close</button>
            </div>

            {/* ACADEMIC STRUCTURE FORM */}
            {drawerMode === "academicStructure" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={label}>Name</label>
                  <input
                    value={academicStructureForm.name}
                    onChange={e => setAcademicStructureForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. 2026 Basic School Academic Year"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Level</label>
                  <select
                    value={academicStructureForm.level}
                    onChange={e => setAcademicStructureForm(prev => ({ ...prev, level: e.target.value as AcademicLevel }))}
                    style={input}
                  >
                    <option value="nursery">Nursery</option>
                    <option value="primary">Primary</option>
                    <option value="junior_high">Junior High</option>
                    <option value="senior_high">Senior High</option>
                    <option value="tertiary">Tertiary</option>
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Start Date</label>
                    <input
                      type="date"
                      value={academicStructureForm.startDate}
                      onChange={e => setAcademicStructureForm(prev => ({ ...prev, startDate: e.target.value }))}
                      style={input}
                    />
                  </div>
                  <div>
                    <label style={label}>End Date</label>
                    <input
                      type="date"
                      value={academicStructureForm.endDate}
                      onChange={e => setAcademicStructureForm(prev => ({ ...prev, endDate: e.target.value }))}
                      style={input}
                    />
                  </div>
                </div>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input
                    type="checkbox"
                    checked={academicStructureForm.active !== false}
                    onChange={e => setAcademicStructureForm(prev => ({ ...prev, active: e.target.checked }))}
                  />
                  Active
                </label>

                <div>
                  <label style={label}>Photo</label>
                  <input type="file" accept="image/*" onChange={e => uploadImage("academicStructurePhoto", e.target.files?.[0])} style={input} />
                </div>
                <div>
                  <label style={label}>Banner Image</label>
                  <input type="file" accept="image/*" onChange={e => uploadImage("academicStructureBanner", e.target.files?.[0])} style={input} />
                </div>
              </div>
            )}

            {/* ACADEMIC PERIOD FORM */}
            {drawerMode === "academicPeriod" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={label}>Academic Structure</label>
                  <select
                    value={academicPeriodForm.academicStructureId || ""}
                    onChange={e => {
                      const id = Number(e.target.value) || undefined;
                      const structure = id ? academicStructureMap.get(id) : undefined;
                      setAcademicPeriodForm(prev => ({
                        ...prev,
                        academicStructureId: id,
                        startDate: structure?.startDate || prev.startDate,
                        endDate: structure?.endDate || prev.endDate,
                      }));
                    }}
                    style={input}
                  >
                    <option value="">Select Academic Structure</option>
                    {academicStructures.map(row => (
                      <option key={row.id} value={row.id}>{row.name} • {row.level}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Period Name</label>
                  <input
                    value={academicPeriodForm.name}
                    onChange={e => setAcademicPeriodForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Term 1"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Type</label>
                  <select
                    value={academicPeriodForm.type || ""}
                    onChange={e => setAcademicPeriodForm(prev => ({ ...prev, type: (e.target.value || undefined) as TermType | undefined }))}
                    style={input}
                  >
                    <option value="">No type</option>
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                    <option value="Semester 1">Semester 1</option>
                    <option value="Semester 2">Semester 2</option>
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Start Date</label>
                    <input type="date" value={academicPeriodForm.startDate} onChange={e => setAcademicPeriodForm(prev => ({ ...prev, startDate: e.target.value }))} style={input} />
                  </div>
                  <div>
                    <label style={label}>End Date</label>
                    <input type="date" value={academicPeriodForm.endDate} onChange={e => setAcademicPeriodForm(prev => ({ ...prev, endDate: e.target.value }))} style={input} />
                  </div>
                </div>

                <div>
                  <label style={label}>Order</label>
                  <input
                    type="number"
                    value={academicPeriodForm.order}
                    onChange={e => setAcademicPeriodForm(prev => ({ ...prev, order: Number(e.target.value) }))}
                    style={input}
                  />
                </div>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={academicPeriodForm.active !== false} onChange={e => setAcademicPeriodForm(prev => ({ ...prev, active: e.target.checked }))} />
                  Active
                </label>

                <div>
                  <label style={label}>Photo</label>
                  <input type="file" accept="image/*" onChange={e => uploadImage("academicPeriodPhoto", e.target.files?.[0])} style={input} />
                </div>
              </div>
            )}

            {/* ASSESSMENT STRUCTURE FORM */}
            {drawerMode === "assessmentStructure" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={label}>Academic Structure</label>
                  <select
                    value={assessmentStructureForm.academicStructureId || ""}
                    onChange={e => setAssessmentStructureForm(prev => ({ ...prev, academicStructureId: Number(e.target.value) || undefined }))}
                    style={input}
                  >
                    <option value="">Select Academic Structure</option>
                    {academicStructures.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={label}>Organization</label>
                  <select
                    value={assessmentStructureForm.organizationId || ""}
                    onChange={e => setAssessmentStructureForm(prev => ({ ...prev, organizationId: Number(e.target.value) || undefined }))}
                    style={input}
                  >
                    <option value="">No organization</option>
                    {organizations.map(row => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}
                  </select>
                </div>

                <div>
                  <label style={label}>Name</label>
                  <input
                    value={assessmentStructureForm.name}
                    onChange={e => setAssessmentStructureForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Class Score + Exam"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Total Score</label>
                  <input
                    type="number"
                    value={assessmentStructureForm.totalScore ?? ""}
                    onChange={e => setAssessmentStructureForm(prev => ({ ...prev, totalScore: e.target.value === "" ? undefined : Number(e.target.value) }))}
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Description</label>
                  <textarea
                    value={assessmentStructureForm.description || ""}
                    onChange={e => setAssessmentStructureForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    style={{ ...input, resize: "vertical" }}
                  />
                </div>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={assessmentStructureForm.active !== false} onChange={e => setAssessmentStructureForm(prev => ({ ...prev, active: e.target.checked }))} />
                  Active
                </label>
                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={!!assessmentStructureForm.locked} onChange={e => setAssessmentStructureForm(prev => ({ ...prev, locked: e.target.checked }))} />
                  Locked
                </label>

                <div>
                  <label style={label}>Photo</label>
                  <input type="file" accept="image/*" onChange={e => uploadImage("assessmentStructurePhoto", e.target.files?.[0])} style={input} />
                </div>
                <div>
                  <label style={label}>Banner Image</label>
                  <input type="file" accept="image/*" onChange={e => uploadImage("assessmentStructureBanner", e.target.files?.[0])} style={input} />
                </div>
              </div>
            )}

            {/* ASSESSMENT ITEM FORM */}
            {drawerMode === "assessmentItem" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={label}>Assessment Structure</label>
                  <select
                    value={assessmentItemForm.assessmentStructureId || ""}
                    onChange={e => setAssessmentItemForm(prev => ({ ...prev, assessmentStructureId: Number(e.target.value) || undefined }))}
                    style={input}
                  >
                    <option value="">Select Assessment Structure</option>
                    {assessmentStructures.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={label}>Item Name</label>
                  <input value={assessmentItemForm.name} onChange={e => setAssessmentItemForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Class Test" style={input} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Weight</label>
                    <input type="number" value={assessmentItemForm.weight} onChange={e => setAssessmentItemForm(prev => ({ ...prev, weight: Number(e.target.value) }))} style={input} />
                  </div>
                  <div>
                    <label style={label}>Max Score</label>
                    <input type="number" value={assessmentItemForm.maxScore} onChange={e => setAssessmentItemForm(prev => ({ ...prev, maxScore: Number(e.target.value) }))} style={input} />
                  </div>
                  <div>
                    <label style={label}>Order</label>
                    <input type="number" value={assessmentItemForm.order} onChange={e => setAssessmentItemForm(prev => ({ ...prev, order: Number(e.target.value) }))} style={input} />
                  </div>
                </div>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={assessmentItemForm.compulsory !== false} onChange={e => setAssessmentItemForm(prev => ({ ...prev, compulsory: e.target.checked }))} />
                  Compulsory
                </label>
                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={assessmentItemForm.active !== false} onChange={e => setAssessmentItemForm(prev => ({ ...prev, active: e.target.checked }))} />
                  Active
                </label>
              </div>
            )}

            {/* GRADING SYSTEM FORM */}
            {drawerMode === "gradingSystem" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={label}>Name</label>
                  <input value={gradingSystemForm.name} onChange={e => setGradingSystemForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. NaCCA Percentage Grading" style={input} />
                </div>

                <div>
                  <label style={label}>Type</label>
                  <select value={gradingSystemForm.type} onChange={e => setGradingSystemForm(prev => ({ ...prev, type: e.target.value as GradingSystemType }))} style={input}>
                    <option value="percentage">Percentage</option>
                    <option value="gpa">GPA</option>
                    <option value="competency">Competency</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label style={label}>Organization</label>
                  <select value={gradingSystemForm.organizationId || ""} onChange={e => setGradingSystemForm(prev => ({ ...prev, organizationId: Number(e.target.value) || undefined }))} style={input}>
                    <option value="">No organization</option>
                    {organizations.map(row => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}
                  </select>
                </div>

                <div>
                  <label style={label}>Description</label>
                  <textarea value={gradingSystemForm.description || ""} onChange={e => setGradingSystemForm(prev => ({ ...prev, description: e.target.value }))} rows={3} style={{ ...input, resize: "vertical" }} />
                </div>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={gradingSystemForm.active !== false} onChange={e => setGradingSystemForm(prev => ({ ...prev, active: e.target.checked }))} />
                  Active
                </label>
                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={!!gradingSystemForm.default} onChange={e => setGradingSystemForm(prev => ({ ...prev, default: e.target.checked }))} />
                  Default grading system
                </label>
                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={!!gradingSystemForm.locked} onChange={e => setGradingSystemForm(prev => ({ ...prev, locked: e.target.checked }))} />
                  Locked
                </label>

                <div>
                  <label style={label}>Photo</label>
                  <input type="file" accept="image/*" onChange={e => uploadImage("gradingSystemPhoto", e.target.files?.[0])} style={input} />
                </div>
              </div>
            )}

            {/* GRADE RULE FORM */}
            {drawerMode === "gradeRule" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={label}>Grading System</label>
                  <select value={gradeRuleForm.gradingSystemId || ""} onChange={e => setGradeRuleForm(prev => ({ ...prev, gradingSystemId: Number(e.target.value) || undefined }))} style={input}>
                    <option value="">Select Grading System</option>
                    {gradingSystems.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={label}>Grade</label>
                  <input value={gradeRuleForm.grade} onChange={e => setGradeRuleForm(prev => ({ ...prev, grade: e.target.value }))} placeholder="e.g. A1" style={input} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Min Score</label>
                    <input type="number" value={gradeRuleForm.minScore} onChange={e => setGradeRuleForm(prev => ({ ...prev, minScore: Number(e.target.value) }))} style={input} />
                  </div>
                  <div>
                    <label style={label}>Max Score</label>
                    <input type="number" value={gradeRuleForm.maxScore} onChange={e => setGradeRuleForm(prev => ({ ...prev, maxScore: Number(e.target.value) }))} style={input} />
                  </div>
                  <div>
                    <label style={label}>Order</label>
                    <input type="number" value={gradeRuleForm.order} onChange={e => setGradeRuleForm(prev => ({ ...prev, order: Number(e.target.value) }))} style={input} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>GPA</label>
                    <input type="number" value={gradeRuleForm.gpa ?? ""} onChange={e => setGradeRuleForm(prev => ({ ...prev, gpa: e.target.value === "" ? undefined : Number(e.target.value) }))} style={input} />
                  </div>
                  <div>
                    <label style={label}>Color</label>
                    <input value={gradeRuleForm.color || ""} onChange={e => setGradeRuleForm(prev => ({ ...prev, color: e.target.value }))} placeholder="#16a34a" style={input} />
                  </div>
                </div>

                <div>
                  <label style={label}>Remark</label>
                  <input value={gradeRuleForm.remark || ""} onChange={e => setGradeRuleForm(prev => ({ ...prev, remark: e.target.value }))} placeholder="e.g. Excellent" style={input} />
                </div>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input type="checkbox" checked={gradeRuleForm.active !== false} onChange={e => setGradeRuleForm(prev => ({ ...prev, active: e.target.checked }))} />
                  Active
                </label>
              </div>
            )}

            <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1, marginTop: 18 }}>
              {saving ? "Saving..." : editMode ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
