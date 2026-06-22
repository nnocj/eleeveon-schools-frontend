
"use client";

/**
 * reports/Broadsheets.tsx
 * ---------------------------------------------------------
 * BRANCH-LOCKED ACADEMIC BROADSHEET MODULE
 * ---------------------------------------------------------
 *
 * No branch selector.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents broadsheets from accidentally using stale school/branch context
 *   left behind by another role or portal
 * - all broadsheet engine data reads now use the resolved workspace schoolId and branchId
 *
 * Branch header fix:
 * - mirrors StudentReports.tsx behavior
 * - resolves the locked branch from loaded branch rows / ActiveBranchContext
 * - injects branch, branchName, branchLabel and branding.branchName into output.header
 *   before SubjectBroadsheet and ClassBroadsheet render
 * - no styling, print layout, filter UI or engine logic changed
 *
 * Media asset header update:
 * - resolves broadsheet header images from mediaAssets/mediaBlobs
 * - prefers active owner-bound media over legacy string fields
 * - prevents removed/deleted branch-setting logos from reappearing on broadsheets
 * - injects resolved logo URL into the shared ReportHeader contract
 *
 * Annual broadsheet update:
 * - adds Annual Broadsheet as a selectable broadsheet mode
 * - reuses the existing cumulative AnnualBroadsheet component and cumulative engine
 * - loads StudentReportSnapshot and StudentPromotion rows for annual calculations
 * - keeps Subject and Class broadsheet behavior unchanged
 *
 * Golden cleanup: top row stays Search + Print + Filter + More only.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/app/context/account-context";

import { useSettings } from "../../../context/settings-context";
import { useActiveBranch } from "../../../context/active-branch-context";
import { useActiveMembership } from "../../../context/active-membership-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  AssessmentEntry,
  AssessmentStructure,
  AssessmentStructureItem,
  Attendance,
  Branch,
  Class,
  ClassSubject,
  ComputedResult,
  GradeRule,
  GradingSystem,
  ReportCard,
  ReportCardItem,
  School,
  Student,
  StudentEnrollment,
  Parent,
  StudentParent,
  ClassTeacher,
  Subject,
  Teacher,
  SchoolBranchSetting,
  StudentReportSnapshot,
  StudentPromotion,
} from "../../../lib/db";

import {
  MediaOwners,
  MediaFieldKeys,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  revokeMediaObjectUrl,
} from "../../../lib/media/mediaAssetUtils";

import SubjectBroadsheet from "./components/SubjectBroadSheet";
import ClassBroadsheet from "./components/ClassBroadSheet";
import AnnualBroadsheet from "./components/AnnualBroadsheet";

import { buildReportEngineOutput } from "./engine/report-engine";
import { buildCumulativeReportEngineOutput } from "./engine/cumulative-report-engine";

import type {
  ReportEngineDataset,
  ReportFiltersState,
  ReportMode,
} from "./engine/report-types";
import type { CumulativeReportEngineDataset } from "./engine/cumulative-report-types";

type BroadsheetMode = ReportMode | "annual-broadsheet";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type SchoolRow = {
  accountId?: string;
  id?: number;
  isDeleted?: boolean;
};

type BranchRow = {
  accountId?: string;
  schoolId?: number;
  id?: number;
  isDeleted?: boolean;
};

function firstExistingId<T extends { id?: number }>(rows: T[]) {
  return rows.find((row) => typeof row.id === "number")?.id;
}


const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const BROADSHEET_MEDIA_OWNER_SCHOOLS = String((MediaOwners as any).SCHOOLS || "schools");
const BROADSHEET_MEDIA_OWNER_BRANCHES = String((MediaOwners as any).BRANCHES || "branches");
const BROADSHEET_MEDIA_OWNER_SETTINGS = String(
  (MediaOwners as any).SCHOOL_BRANCH_SETTINGS ||
    (MediaOwners as any).SCHOOL_BRANCHES_SETTINGS ||
    "schoolBranchSettings"
);

const BROADSHEET_FIELD_LOGO = String((MediaFieldKeys as any).LOGO || "logo");

function hasOwn(row: any, key: string) {
  return !!row && Object.prototype.hasOwnProperty.call(row, key);
}

function safeRecordMediaValue(value?: string | null) {
  const media = String(value || "");
  if (!media) return "";
  if (media.startsWith("blob:")) return "";
  if (media.startsWith("data:image/")) return "";
  return media;
}

function fallbackMediaValue(row: any, stringField: string, mediaIdField?: string) {
  if (!row) return "";

  if (mediaIdField && hasOwn(row, mediaIdField) && !idOf(row[mediaIdField])) return "";

  return safeRecordMediaValue(row[stringField]);
}

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

function idOf(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

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



function labelOf<T extends { id?: number; name?: string }>(rows: T[], id?: number) {
  if (!id) return "Not selected";
  return rows.find((row) => row.id === id)?.name || "Not found";
}

function withBranchHeader<T extends Record<string, any>>(header: T | undefined, branch?: Branch): T | undefined {
  if (!header) return header;

  const branchName =
    (branch as any)?.name ||
    (branch as any)?.branchName ||
    (branch as any)?.campusName ||
    (header as any).branchName ||
    (header as any).branchLabel ||
    (header as any).branch?.name ||
    (header as any).branding?.branchName ||
    "";

  return {
    ...header,
    branch,
    branchId: (branch as any)?.id || (header as any).branchId,
    branchName,
    branchLabel: branchName,
    campusName: branchName,
    branding: {
      ...((header as any).branding || {}),
      branchName: ((header as any).branding || {}).branchName || branchName,
      branchLabel: ((header as any).branding || {}).branchLabel || branchName,
      campusName: ((header as any).branding || {}).campusName || branchName,
      resolvedLogoUrl:
        ((header as any).branding || {}).resolvedLogoUrl ||
        (header as any).schoolBranchSetting?.logo ||
        (header as any).branch?.logo ||
        (header as any).school?.logo ||
        "",
      logo:
        ((header as any).branding || {}).logo ||
        (header as any).schoolBranchSetting?.logo ||
        (header as any).branch?.logo ||
        (header as any).school?.logo ||
        "",
    },
  } as T;
}

export default function Broadsheets() {
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

  const [pageLoading, setPageLoading] = useState(true);
  const [mode, setMode] = useState<BroadsheetMode>("subject-broadsheet");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [filters, setFilters] = useState<ReportFiltersState>({
    branchId: branchId || 0,
    academicStructureId: settings?.currentAcademicStructureId,
    academicPeriodId: settings?.currentAcademicPeriodId,
    classId: undefined,
    classSubjectId: undefined,
    studentId: undefined,
    sortMode: "position",
  });

  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schoolBranchSettings, setSchoolBranchSettings] = useState<SchoolBranchSetting[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<StudentEnrollment[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [assessmentApplicabilities, setAssessmentApplicabilities] = useState<AssessmentApplicability[]>([]);
  const [assessmentStructures, setAssessmentStructures] = useState<AssessmentStructure[]>([]);
  const [assessmentStructureItems, setAssessmentStructureItems] = useState<AssessmentStructureItem[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>([]);
  const [gradingSystems, setGradingSystems] = useState<GradingSystem[]>([]);
  const [gradeRules, setGradeRules] = useState<GradeRule[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [computedResults, setComputedResults] = useState<ComputedResult[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [reportCardItems, setReportCardItems] = useState<ReportCardItem[]>([]);
  const [studentReportSnapshots, setStudentReportSnapshots] = useState<StudentReportSnapshot[]>([]);
  const [studentPromotions, setStudentPromotions] = useState<StudentPromotion[]>([]);
  const [broadsheetMediaUrls, setBroadsheetMediaUrls] = useState<string[]>([]);

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    // Missing branch workspace is handled locally so the selected-role flow is not broken.
  }, [accountLoading, contextLoading, authenticated, accountId, schoolId, branchId, router]);


  useEffect(() => {
    return () => {
      broadsheetMediaUrls.forEach(revokeMediaObjectUrl);
    };
  }, [broadsheetMediaUrls]);

  const clearState = () => {
    broadsheetMediaUrls.forEach(revokeMediaObjectUrl);
    setBroadsheetMediaUrls([]);
    setSchools([]);
    setBranches([]);
    setSchoolBranchSettings([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setStudents([]);
    setTeachers([]);
    setParents([]);
    setClassTeachers([]);
    setClasses([]);
    setSubjects([]);
    setClassSubjects([]);
    setStudentEnrollments([]);
    setStudentParents([]);
    setAssessmentApplicabilities([]);
    setAssessmentStructures([]);
    setAssessmentStructureItems([]);
    setAssessmentEntries([]);
    setGradingSystems([]);
    setGradeRules([]);
    setAttendance([]);
    setComputedResults([]);
    setReportCards([]);
    setReportCardItems([]);
    setStudentReportSnapshots([]);
    setStudentPromotions([]);
  };

  const resolveBroadsheetMediaUrl = async ({
    ownerTable,
    ownerLocalId,
    ownerCloudId,
    fieldKey,
    fallbackMediaId,
    nextUrls,
  }: {
    ownerTable: string;
    ownerLocalId?: number | string | null;
    ownerCloudId?: string | null;
    fieldKey: string;
    fallbackMediaId?: number | string | null;
    nextUrls: string[];
  }) => {
    const localId = idOf(ownerLocalId);

    if (localId) {
      const ownedAsset = await getOwnerFieldMediaAsset({
        accountId: accountId || undefined,
        ownerTable,
        ownerLocalId: localId,
        ownerCloudId: ownerCloudId || undefined,
        fieldKey,
      });

      if (ownedAsset?.id && !(ownedAsset as any).isDeleted && (ownedAsset as any).active !== false) {
        const url = await getMediaObjectUrl(Number(ownedAsset.id));
        if (url) {
          nextUrls.push(url);
          return url;
        }
      }
    }

    const mediaId = idOf(fallbackMediaId);
    if (!mediaId) return "";

    const fallbackAsset = await (db as any).mediaAssets?.get?.(mediaId);
    const belongsToOwner =
      fallbackAsset &&
      !fallbackAsset.isDeleted &&
      fallbackAsset.active !== false &&
      (!accountId || fallbackAsset.accountId === accountId) &&
      fallbackAsset.ownerTable === ownerTable &&
      fallbackAsset.fieldKey === fieldKey &&
      (!localId || String(fallbackAsset.ownerLocalId || "") === String(localId));

    if (!belongsToOwner) return "";

    const url = await getMediaObjectUrl(mediaId);
    if (url) nextUrls.push(url);
    return url || "";
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearState();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

      const [
        schoolRows,
        branchRows,
        schoolBranchSettingRows,
        academicStructureRows,
        academicPeriodRows,
        studentRows,
        parentRows,
        teacherRows,
        classRows,
        subjectRows,
        classSubjectRows,
        classTeacherRows,
        enrollmentRows,
        studentParentRows,
        applicabilityRows,
        structureRows,
        structureItemRows,
        entryRows,
        gradingRows,
        ruleRows,
        attendanceRows,
        computedRows,
        reportCardRows,
        reportCardItemRows,
        snapshotRows,
        promotionRows,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.schoolBranchSettings.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.students.toArray(),
        db.parents.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.classSubjects.toArray(),
        db.classTeachers.toArray(),
        db.studentEnrollments.toArray(),
        db.studentParents.toArray(),
        db.assessmentApplicabilities.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentEntries.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
        db.attendance.toArray(),
        db.computedResults.toArray(),
        db.reportCards.toArray(),
        db.reportCardItems.toArray(),
        db.studentReportSnapshots.toArray(),
        db.studentPromotions.toArray(),
      ]);

      const sameSchool = (row: SchoolRow) =>
        row.accountId === accountId &&
        row.id === schoolId &&
        !row.isDeleted;

      const sameBranch = (row: BranchRow) =>
        row.accountId === accountId &&
        row.schoolId === schoolId &&
        row.id === branchId &&
        !row.isDeleted;

      const sameTenant = (row: TenantRow) =>
        row.accountId === accountId &&
        row.schoolId === schoolId &&
        row.branchId === branchId &&
        !row.isDeleted;

      const currentSchool =
        schoolRows.find(sameSchool) ||
        (activeSchool?.accountId === accountId && activeSchool?.id === schoolId ? activeSchool : undefined);

      const currentBranch =
        branchRows.find(sameBranch) ||
        (activeBranch?.accountId === accountId &&
        activeBranch?.schoolId === schoolId &&
        activeBranch?.id === branchId
          ? activeBranch
          : undefined);

      const scopedAcademicPeriods = academicPeriodRows.filter(sameTenant);
      const scopedReportCards = reportCardRows.filter(sameTenant);
      const scopedSettings = schoolBranchSettingRows.filter(sameTenant);
      const nextMediaUrls: string[] = [];

      const currentSchoolWithMedia = currentSchool
        ? ({
            ...currentSchool,
            logo:
              (await resolveBroadsheetMediaUrl({
                ownerTable: BROADSHEET_MEDIA_OWNER_SCHOOLS,
                ownerLocalId: currentSchool.id,
                ownerCloudId: (currentSchool as any).cloudId,
                fieldKey: BROADSHEET_FIELD_LOGO,
                fallbackMediaId: (currentSchool as any).logoMediaId,
                nextUrls: nextMediaUrls,
              })) || fallbackMediaValue(currentSchool, "logo", "logoMediaId"),
          } as School)
        : undefined;

      const currentBranchWithMedia = currentBranch
        ? ({
            ...currentBranch,
            logo:
              (await resolveBroadsheetMediaUrl({
                ownerTable: BROADSHEET_MEDIA_OWNER_BRANCHES,
                ownerLocalId: currentBranch.id,
                ownerCloudId: (currentBranch as any).cloudId,
                fieldKey: BROADSHEET_FIELD_LOGO,
                fallbackMediaId: (currentBranch as any).logoMediaId,
                nextUrls: nextMediaUrls,
              })) || fallbackMediaValue(currentBranch, "logo", "logoMediaId"),
          } as Branch)
        : undefined;

      const scopedSettingsWithMedia = await Promise.all(
        scopedSettings.map(async (row: any) => ({
          ...row,
          logo:
            (await resolveBroadsheetMediaUrl({
              ownerTable: BROADSHEET_MEDIA_OWNER_SETTINGS,
              ownerLocalId: row.id,
              ownerCloudId: row.cloudId,
              fieldKey: BROADSHEET_FIELD_LOGO,
              fallbackMediaId: row.logoMediaId,
              nextUrls: nextMediaUrls,
            })) || fallbackMediaValue(row, "logo", "logoMediaId"),
        }))
      );

      const branchPeriodIds = new Set(scopedAcademicPeriods.map((row) => row.id).filter(Boolean) as number[]);
      const branchReportCardIds = new Set(scopedReportCards.map((row) => row.id).filter(Boolean) as number[]);

      broadsheetMediaUrls.forEach((url) => {
        if (!nextMediaUrls.includes(url)) revokeMediaObjectUrl(url);
      });
      setBroadsheetMediaUrls(nextMediaUrls);

      setSchools(currentSchoolWithMedia ? [currentSchoolWithMedia] : []);
      setBranches(currentBranchWithMedia ? [currentBranchWithMedia] : []);
      setSchoolBranchSettings(scopedSettingsWithMedia as SchoolBranchSetting[]);
      setAcademicStructures(academicStructureRows.filter(sameTenant));
      setAcademicPeriods(scopedAcademicPeriods);
      setStudents(studentRows.filter(sameTenant));
      setParents(parentRows.filter(sameTenant));
      setTeachers(teacherRows.filter(sameTenant));
      setClasses(classRows.filter((row) => sameTenant(row) && row.active !== false));
      setSubjects(subjectRows.filter((row) => sameTenant(row) && row.active !== false));
      setClassSubjects(classSubjectRows.filter((row) => sameTenant(row) && row.active !== false));
      setStudentParents(studentParentRows.filter(sameTenant));
      setStudentEnrollments(enrollmentRows.filter(sameTenant));
      setClassTeachers(classTeacherRows.filter(sameTenant));
      setAssessmentApplicabilities(applicabilityRows.filter((row) => sameTenant(row) && row.active !== false));
      setAssessmentStructures(structureRows.filter((row) => sameTenant(row) && row.active !== false));
      setAssessmentStructureItems(structureItemRows.filter((row) => sameTenant(row) && row.active !== false));
      setAssessmentEntries(entryRows.filter(sameTenant));
      setGradingSystems(gradingRows.filter((row) => sameTenant(row) && row.active !== false));
      setGradeRules(ruleRows.filter((row) => sameTenant(row) && row.active !== false));
      setAttendance(attendanceRows.filter(sameTenant));
      setComputedResults(computedRows.filter(sameTenant));
      setReportCards(scopedReportCards);

      setReportCardItems(
        reportCardItemRows.filter((row) => {
          if (!sameTenant(row)) return false;
          if (row.reportCardId && !branchReportCardIds.has(row.reportCardId)) return false;
          if (row.academicPeriodId && !branchPeriodIds.has(row.academicPeriodId)) return false;
          return true;
        })
      );

      setStudentReportSnapshots(
        snapshotRows.filter((row: any) => {
          if (row.isDeleted) return false;
          if (row.accountId !== accountId) return false;
          if (row.schoolId !== schoolId) return false;
          if (row.branchId !== branchId) return false;
          return true;
        })
      );

      setStudentPromotions(
        promotionRows.filter((row: any) => {
          if (row.isDeleted) return false;
          if (row.accountId && row.accountId !== accountId) return false;
          if (row.schoolId && row.schoolId !== schoolId) return false;
          if (row.branchId && row.branchId !== branchId) return false;
          return true;
        })
      );
    } catch (error) {
      console.error("Failed to load report data:", error);
      clearState();
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  useEffect(() => {
    setFilters((prev) => {
      const nextBranchId = branchId || 0;
      const branchChanged = prev.branchId !== nextBranchId;

      return {
        ...prev,
        branchId: nextBranchId,
        academicStructureId: branchChanged
          ? settings?.currentAcademicStructureId
          : prev.academicStructureId || settings?.currentAcademicStructureId,
        academicPeriodId: branchChanged
          ? settings?.currentAcademicPeriodId
          : prev.academicPeriodId || settings?.currentAcademicPeriodId,
        classId: branchChanged ? undefined : prev.classId,
        classSubjectId: branchChanged ? undefined : prev.classSubjectId,
        studentId: branchChanged ? undefined : prev.studentId,
      };
    });
  }, [branchId, settings?.currentAcademicStructureId, settings?.currentAcademicPeriodId]);

  useEffect(() => {
    if (!filters.academicStructureId) {
      const fallbackId = settings?.currentAcademicStructureId || firstExistingId(academicStructures);
      if (fallbackId) setFilters((prev) => ({ ...prev, academicStructureId: fallbackId }));
    }
  }, [filters.academicStructureId, settings?.currentAcademicStructureId, academicStructures]);

  useEffect(() => {
    if (!filters.academicPeriodId) {
      const fallbackId = settings?.currentAcademicPeriodId || firstExistingId(academicPeriods);
      if (fallbackId) setFilters((prev) => ({ ...prev, academicPeriodId: fallbackId }));
    }
  }, [filters.academicPeriodId, settings?.currentAcademicPeriodId, academicPeriods]);

  const lockedBranches = useMemo(() => {
    return activeBranch && activeBranch.id === branchId ? [activeBranch] : branches;
  }, [activeBranch, branchId, branches]);

  const filteredClasses = useMemo(() => {
    const allowedClassIds = new Set<number>();

    studentEnrollments.forEach((row) => {
      if (row.status !== "active") return;
      if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return;
      if (filters.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return;
      allowedClassIds.add(row.classId);
    });

    classSubjects.forEach((row) => {
      if (row.active === false) return;
      if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return;
      if (filters.academicPeriodId && row.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return;
      allowedClassIds.add(row.classId);
    });

    if (!filters.academicStructureId && !filters.academicPeriodId) return classes;
    return classes.filter((row) => row.id && allowedClassIds.has(row.id));
  }, [classes, studentEnrollments, classSubjects, filters.academicStructureId, filters.academicPeriodId]);

  const filteredClassSubjects = useMemo(() => {
    return classSubjects.filter((row) => {
      if (filters.classId && row.classId !== filters.classId) return false;
      if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return false;
      if (filters.academicPeriodId && row.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return false;
      return true;
    });
  }, [classSubjects, filters.classId, filters.academicStructureId, filters.academicPeriodId]);

  const filteredStudents = useMemo(() => {
    if (!filters.classId && !filters.academicPeriodId) return students;

    const allowedStudentIds = new Set(
      studentEnrollments
        .filter((row) => {
          if (row.status !== "active") return false;
          if (filters.classId && row.classId !== filters.classId) return false;
          if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return false;
          if (filters.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return false;
          return true;
        })
        .map((row) => row.studentId)
    );

    return students.filter((row) => row.id && allowedStudentIds.has(row.id));
  }, [students, studentEnrollments, filters.classId, filters.academicStructureId, filters.academicPeriodId]);

  const dataset: ReportEngineDataset = useMemo(
    () => ({
      schools,
      branches: lockedBranches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students,
      parents,
      studentParents,
      teachers,
      classes,
      subjects,
      classSubjects,
      studentEnrollments,
      classTeachers,
      assessmentApplicabilities,
      assessmentStructures,
      assessmentStructureItems,
      assessmentEntries,
      gradingSystems,
      gradeRules,
      attendance,
      computedResults,
      reportCards,
      reportCardItems,
    }),
    [
      schools,
      lockedBranches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students,
      parents,
      studentParents,
      teachers,
      classes,
      subjects,
      classSubjects,
      studentEnrollments,
      classTeachers,
      assessmentApplicabilities,
      assessmentStructures,
      assessmentStructureItems,
      assessmentEntries,
      gradingSystems,
      gradeRules,
      attendance,
      computedResults,
      reportCards,
      reportCardItems,
    ]
  );

  const output = useMemo(() => buildReportEngineOutput(dataset, filters), [dataset, filters]);

  const cumulativeDataset: CumulativeReportEngineDataset = useMemo(
    () => ({
      schools,
      branches: lockedBranches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students,
      parents,
      studentParents,
      teachers,
      classes,
      subjects,
      studentReportSnapshots,
      studentPromotions,
    }),
    [
      schools,
      lockedBranches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students,
      parents,
      studentParents,
      teachers,
      classes,
      subjects,
      studentReportSnapshots,
      studentPromotions,
    ]
  );

  const cumulativeOutput = useMemo(() => {
    return buildCumulativeReportEngineOutput(cumulativeDataset, {
      branchId: filters.branchId,
      academicStructureId: filters.academicStructureId,
      academicPeriodId: filters.academicPeriodId,
      fromAcademicPeriodId: undefined,
      toAcademicPeriodId: filters.academicPeriodId,
      classId: filters.classId,
      studentId: filters.studentId,
      subjectId: undefined,
      snapshotType: "all",
      decision: "all",
      mode: "annual-broadsheet",
      sortMode: filters.sortMode as any,
      groupingMode: "class",
      subjectAggregationMode: "average",
      includePromotionRecords: true,
      includeManualSnapshots: true,
      includeTerminalSnapshots: true,
      includeDeletedSnapshots: false,
    } as any);
  }, [cumulativeDataset, filters]);

  const hasCoreSetup = Boolean(academicStructures.length && academicPeriods.length && classes.length && students.length);

  const reportBranch = useMemo(() => {
    return (
      branches.find((branch: any) => branch.id === branchId) ||
      lockedBranches.find((branch: any) => branch.id === branchId) ||
      activeBranch ||
      branches[0] ||
      lockedBranches[0]
    );
  }, [activeBranch, branchId, branches, lockedBranches]);

  const broadsheetHeader = useMemo(() => {
    return withBranchHeader(output.header as any, reportBranch) as any;
  }, [output.header, reportBranch]);

  const annualBroadsheetHeader = useMemo(() => {
    return withBranchHeader(cumulativeOutput.header as any, reportBranch) as any;
  }, [cumulativeOutput.header, reportBranch]);

  const activeContextName = `${activeSchool?.name || schools[0]?.name || "Selected School"} · ${
    reportBranch?.name || activeBranch?.name || branches[0]?.name || "Assigned Branch"
  }`;

  const selectedClassName = labelOf(classes, filters.classId);
  const selectedPeriodName = labelOf(academicPeriods, filters.academicPeriodId);
  const selectedStructureName = labelOf(academicStructures, filters.academicStructureId);

  const searchTerm = search.trim().toLowerCase();

  const visibleClasses = useMemo(() => {
    if (!searchTerm) return filteredClasses;

    return filteredClasses.filter((item: any) => `${item.name || ""} ${item.code || ""}`.toLowerCase().includes(searchTerm));
  }, [filteredClasses, searchTerm]);

  const visibleClassSubjects = useMemo(() => {
    if (!searchTerm) return filteredClassSubjects;

    return filteredClassSubjects.filter((item: any) => {
      const subject = subjects.find((row) => row.id === (item as any).subjectId) as any;
      const klass = classes.find((row) => row.id === (item as any).classId) as any;
      return `${klass?.name || ""} ${subject?.name || ""} ${(item as any).name || ""}`.toLowerCase().includes(searchTerm);
    });
  }, [classes, filteredClassSubjects, searchTerm, subjects]);

  const selectedClassSubjectName = useMemo(() => {
    if (!filters.classSubjectId) return "Not selected";

    const classSubject = classSubjects.find((row) => row.id === filters.classSubjectId) as any;
    if (!classSubject) return "Not found";

    const subject = subjects.find((row) => row.id === classSubject.subjectId) as any;
    const klass = classes.find((row) => row.id === classSubject.classId) as any;

    return `${klass?.name || "Class"} · ${subject?.name || classSubject.name || "Subject"}`;
  }, [classSubjects, classes, filters.classSubjectId, subjects]);

  const activeFilterCount = useMemo(() => {
    return [
      filters.academicStructureId,
      filters.academicPeriodId,
      filters.classId,
      filters.classSubjectId,
      filters.sortMode && filters.sortMode !== "position" ? filters.sortMode : undefined,
      mode !== "subject-broadsheet" ? mode : undefined,
    ].filter(Boolean).length;
  }, [filters.academicStructureId, filters.academicPeriodId, filters.classId, filters.classSubjectId, filters.sortMode, mode]);

  const canPrint =
    hasCoreSetup &&
    (mode === "subject-broadsheet"
      ? Boolean(output.subjectBroadsheet)
      : mode === "class-broadsheet"
        ? Boolean(output.classBroadsheet)
        : Boolean(cumulativeOutput.annualBroadsheet));

  const renderActiveReport = () => {
    if (!hasCoreSetup) {
      return (
        <Empty
          icon="📊"
          title="Broadsheets need academic data first"
          text="Add academic periods, classes, students, enrollments, class subjects, assessment entries, or computed results before generating broadsheets."
        />
      );
    }

    if (mode === "subject-broadsheet") {
      return (
        <SubjectBroadsheet
          header={broadsheetHeader}
          broadsheet={output.subjectBroadsheet}
          pageBreakAfter={false}
        />
      );
    }

    if (mode === "annual-broadsheet") {
      return (
        <AnnualBroadsheet
          header={annualBroadsheetHeader}
          broadsheet={cumulativeOutput.annualBroadsheet}
          pageBreakAfter={false}
        />
      );
    }

    return (
      <ClassBroadsheet
        header={broadsheetHeader}
        broadsheet={output.classBroadsheet}
        pageBreakAfter={false}
      />
    );
  };

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <State
        primary={primary}
        title="Opening Broadsheets..."
        text="Checking account, assigned branch, academic result data and broadsheet records."
      />
    );
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before opening broadsheets." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Branch workspace required</h2>
          <p>Broadsheets are generated inside the selected branch-admin workspace. Use Select Role again if the wrong branch is active.</p>
          <button type="button" className="ba-state-button" onClick={() => router.push("/select-role")}>
            Go to Select Role
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page student-reports-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ba-search-card report-no-print" aria-label="Broadsheet search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search broadsheets..."
            aria-label="Search broadsheets"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={() => {
            if (canPrint) window.print();
          }}
          aria-label="Print broadsheet"
          title="Print"
        >
          ⎙
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open broadsheet filters"
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
        <section className="ba-filter-chips report-no-print" aria-label="Active broadsheet filters">
          {mode !== "subject-broadsheet" && (
            <button type="button" onClick={() => setMode("subject-broadsheet")}>
              Mode: {mode === "annual-broadsheet" ? "Annual Broadsheet" : "Class Broadsheet"} ×
            </button>
          )}
          {filters.academicStructureId && (
            <button
              type="button"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  academicStructureId: undefined,
                  academicPeriodId: undefined,
                  classId: undefined,
                  classSubjectId: undefined,
                  studentId: undefined,
                }))
              }
            >
              Structure: {selectedStructureName} ×
            </button>
          )}
          {filters.academicPeriodId && (
            <button
              type="button"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  academicPeriodId: undefined,
                  classId: undefined,
                  classSubjectId: undefined,
                  studentId: undefined,
                }))
              }
            >
              Period: {selectedPeriodName} ×
            </button>
          )}
          {filters.classId && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, classId: undefined, classSubjectId: undefined }))}
            >
              Class: {selectedClassName} ×
            </button>
          )}
          {filters.classSubjectId && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, classSubjectId: undefined }))}
            >
              Subject: {selectedClassSubjectName} ×
            </button>
          )}
        </section>
      )}

      <section className="ba-print-card">
        <div className="ba-print-head report-no-print">
          <div>
            <strong>{mode === "annual-broadsheet" ? "Annual Broadsheet" : mode === "class-broadsheet" ? "Class Broadsheet" : "Subject Broadsheet"}</strong>
            <p>{selectedStructureName} · {selectedPeriodName}</p>
          </div>
          <div className="ba-report-toolbar">
            <button type="button" className="primary" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>

        <div id="broadsheet-print-zone" className="ba-print-zone">
          {renderActiveReport()}
        </div>
      </section>

      {filterOpen && (
        <FilterSheet
          mode={mode}
          filters={filters}
          academicStructures={academicStructures}
          academicPeriods={academicPeriods}
          filteredClasses={visibleClasses}
          filteredClassSubjects={visibleClassSubjects}
          subjects={subjects}
          classes={classes}
          setMode={setMode}
          setFilters={setFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          mode={mode}
          setMode={(nextMode) => {
            setMode(nextMode);
            setMoreOpen(false);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onPrint={() => {
            setMoreOpen(false);
            window.print();
          }}
          onClose={() => setMoreOpen(false)}
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

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
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
  mode,
  filters,
  academicStructures,
  academicPeriods,
  filteredClasses,
  filteredClassSubjects,
  subjects,
  classes,
  setMode,
  setFilters,
  onClose,
}: {
  mode: BroadsheetMode;
  filters: ReportFiltersState;
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  filteredClasses: Class[];
  filteredClassSubjects: ClassSubject[];
  subjects: Subject[];
  classes: Class[];
  setMode: (mode: BroadsheetMode) => void;
  setFilters: React.Dispatch<React.SetStateAction<ReportFiltersState>>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop report-no-print" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose the broadsheet scope. Branch stays locked to the assigned branch.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Broadsheet Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as BroadsheetMode)}>
              <option value="subject-broadsheet">Subject Broadsheet</option>
              <option value="class-broadsheet">Class Broadsheet</option>
              <option value="annual-broadsheet">Annual Broadsheet</option>
            </select>
          </label>

          <label>
            <span>Academic Structure</span>
            <select
              value={filters.academicStructureId || ""}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  academicStructureId: Number(event.target.value) || undefined,
                  academicPeriodId: undefined,
                  classId: undefined,
                  classSubjectId: undefined,
                  studentId: undefined,
                }))
              }
            >
              <option value="">Select structure</option>
              {academicStructures.map((item: any) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Academic Period</span>
            <select
              value={filters.academicPeriodId || ""}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  academicPeriodId: Number(event.target.value) || undefined,
                  classId: undefined,
                  classSubjectId: undefined,
                  studentId: undefined,
                }))
              }
            >
              <option value="">Select period</option>
              {academicPeriods.map((item: any) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Class</span>
            <select
              value={filters.classId || ""}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  classId: Number(event.target.value) || undefined,
                  classSubjectId: undefined,
                }))
              }
            >
              <option value="">Select class</option>
              {filteredClasses.map((item: any) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          {mode === "subject-broadsheet" && (
            <label>
              <span>Class Subject</span>
              <select
                value={filters.classSubjectId || ""}
                onChange={(event) => setFilters((prev) => ({ ...prev, classSubjectId: Number(event.target.value) || undefined }))}
              >
                <option value="">Select class subject</option>
                {filteredClassSubjects.map((item: any) => {
                  const subject = subjects.find((row) => row.id === item.subjectId);
                  const klass = classes.find((row) => row.id === item.classId);
                  return (
                    <option key={item.id} value={item.id}>
                      {klass?.name || "Class"} · {subject?.name || item.name || "Subject"}
                    </option>
                  );
                })}
              </select>
            </label>
          )}

          <label>
            <span>Sort Mode</span>
            <select
              value={filters.sortMode || "position"}
              onChange={(event) => setFilters((prev) => ({ ...prev, sortMode: event.target.value as any }))}
            >
              <option value="position">Position</option>
              <option value="name">Name</option>
              <option value="score">Score</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button
            type="button"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                academicStructureId: undefined,
                academicPeriodId: undefined,
                classId: undefined,
                classSubjectId: undefined,
                studentId: undefined,
                sortMode: "position",
              }))
            }
          >
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
  mode,
  setMode,
  onRefresh,
  onPrint,
  onClose,
}: {
  mode: BroadsheetMode;
  setMode: (mode: BroadsheetMode) => void;
  onRefresh: () => void | Promise<void>;
  onPrint: () => void;
  onClose: () => void;
}) {
  const options: { mode: BroadsheetMode; icon: string; label: string; note: string }[] = [
    { mode: "subject-broadsheet", icon: "☷", label: "Subject Broadsheet", note: "One subject across a class" },
    { mode: "class-broadsheet", icon: "▦", label: "Class Broadsheet", note: "All subjects for one class" },
    { mode: "annual-broadsheet", icon: "📊", label: "Annual Broadsheet", note: "Cumulative annual class view" },
  ];

  return (
    <div className="ba-sheet-backdrop report-no-print" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Quick broadsheet actions only.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          {options.map((option) => (
            <button key={option.mode} type="button" className={mode === option.mode ? "active" : ""} onClick={() => setMode(option.mode)}>
              <span>{option.icon}</span>
              <b>{option.label}</b>
              <small>{option.note}</small>
            </button>
          ))}

          <button type="button" onClick={onPrint}>
            <span>⎙</span>
            <b>Print broadsheet</b>
            <small>Print the current preview output</small>
          </button>

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch broadsheet records</small>
          </button>
        </div>
      </section>
    </div>
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
  grid-template-columns: minmax(0, 1fr) repeat(3, 42px);
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
    grid-template-columns: minmax(0,1fr) repeat(3, 42px);
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

/* Broadsheets golden additions */

/* Extra compact report-only layout */
.student-reports-page .ba-print-card{margin-top:8px;border-radius:22px}
.student-reports-page .ba-print-head{padding:8px 10px}
.student-reports-page .ba-print-head strong{font-size:14px}
.student-reports-page .ba-print-head p{font-size:11px;margin-top:2px}
.student-reports-page .ba-print-zone{padding:8px}


.student-reports-page .ba-list {
  grid-template-columns: minmax(0, 1fr);
}

.ba-report-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  font-size: 18px;
  color: var(--ba-primary);
}

.ba-print-card {
  margin-top: 10px;
  background: var(--card-bg, var(--surface,#fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 24px;
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
  overflow: hidden;
}

.ba-print-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  background: color-mix(in srgb, var(--muted,#64748b) 6%, transparent);
}

.ba-print-head span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ba-print-head strong {
  display: block;
  margin-top: 3px;
  color: var(--text,#111827);
  font-size: 15px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.ba-print-head p {
  margin: 3px 0 0;
  color: var(--muted,#64748b);
  font-size: 11px;
  line-height: 1.4;
}

.ba-print-zone {
  padding: 10px;
  background: var(--card-bg, var(--surface,#fff));
}

.ba-report-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
}

.ba-report-toolbar button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 10%, var(--card-bg,#fff));
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.ba-report-toolbar button.primary {
  background: var(--ba-primary);
  color: #fff;
}

.report-analytics-card {
  grid-column: 1 / -1;
}

.report-analytics-card > div {
  margin-top: 10px;
}

@media (min-width: 680px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1320px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media print {
  .report-no-print,
  .ba-search-card,
  .ba-filter-chips,
  .ba-sheet-backdrop,
  .ba-modal-backdrop,
  .ba-toast,
  .ba-print-head,
  .ba-report-toolbar {
    display: none !important;
  }

  .ba-page,
  .ba-print-card,
  .ba-print-zone {
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }
}


/* StudentReports final golden fixes: one-row action strip, theme-safe buttons/tables, clean preview */
.student-reports-page .ba-search-card {
  grid-template-columns: minmax(0, 1fr) repeat(4, 42px) !important;
  gap: 7px;
  align-items: center;
  overflow: hidden;
}

.student-reports-page .ba-search {
  min-width: 0;
  overflow: hidden;
}

.student-reports-page .ba-icon-button,
.student-reports-page .ba-filter-button,
.student-reports-page .ba-view-button,
.student-reports-page .ba-add-inline {
  width: 42px;
  height: 42px;
  min-width: 42px;
  min-height: 42px;
  flex: 0 0 42px;
  border-color: var(--border, rgba(0,0,0,.10));
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-add-inline {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.student-reports-page .ba-filter-button {
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary);
}

.student-reports-page .ba-filter-button.active {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.student-reports-page .ba-view-button {
  background: color-mix(in srgb, var(--muted,#64748b) 8%, var(--card-bg,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-icon-button:hover,
.student-reports-page .ba-view-button:hover {
  border-color: color-mix(in srgb, var(--ba-primary) 28%, var(--border,rgba(0,0,0,.10)));
  color: var(--ba-primary);
}

.student-reports-page .ba-table-scroll th {
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface,#fff))));
  color: var(--table-header-text, var(--muted, var(--text,#111827)));
}

.student-reports-page .ba-table-scroll table,
.student-reports-page .ba-table-scroll td {
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-print-head {
  align-items: center;
}

@media (max-width: 520px) {
  .student-reports-page .ba-search-card {
    grid-template-columns: minmax(0, 1fr) repeat(4, 38px) !important;
    gap: 5px;
    padding: 6px;
  }

  .student-reports-page .ba-icon-button,
  .student-reports-page .ba-filter-button,
  .student-reports-page .ba-view-button,
  .student-reports-page .ba-add-inline {
    width: 38px;
    height: 38px;
    min-width: 38px;
    min-height: 38px;
    flex-basis: 38px;
  }

  .student-reports-page .ba-search {
    min-height: 38px;
    padding: 0 8px;
  }

  .student-reports-page .ba-search input {
    min-height: 38px;
    font-size: 13px;
  }
}



/* Broadsheets compact overrides */
.student-reports-page .ba-print-card{margin-top:8px;border-radius:22px}
.student-reports-page .ba-print-head{padding:8px 10px}
.student-reports-page .ba-print-head strong{font-size:14px}
.student-reports-page .ba-print-head p{font-size:11px;margin-top:2px}
.student-reports-page .ba-print-zone{padding:8px}

`;
