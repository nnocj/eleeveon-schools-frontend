"use client";

/**
 * Eleeveon Schools — Teacher Broadsheets V30
 * app/teacher/modules/Teacherbroadsheets.tsx
 *
 * Matches Branch Admin Broadsheets UI/behavior (V20+ report preview):
 * - Shared A4 landscape preview, one workspace scrollbar and horizontal pan
 * - Shared Reports toolbar: Search / Print / Filter / More
 * - Workspace-safe filter and More sheets, coherent initial filters
 * - Annual/class/subject templates, photos, branch branding and engine
 * - Offline table revision refresh; gradingStructures + gradeRules
 *
 * Teacher access is deliberately more restrictive than Branch Admin:
 * - Subject Broadsheet: ONLY classSubjects.teacherId assigned to the teacher.
 * - Class + Annual: ONLY classTeachers.teacherId assigned to the teacher.
 * - Complete class subjects are included for a class-teacher broadsheet.
 * - No teacher can edit grades or access another branch from this module.
 *   Authorization MUST also be checked in backend & synchronization endpoints.
 */

import BranchViewportPortal from "../../components/role-portals/shell/BranchViewportPortal";
import BranchReportPreview from "../../components/role-portals/shell/BranchReportPreview";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

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
  GradingStructure,
  ReportCard,
  ReportCardItem,
  School,
  Student,
  StudentEnrollment,
  StudentAttendanceSummary,
  Parent,
  StudentParent,
  ClassTeacher,
  Subject,
  Teacher,
  SchoolBranchSetting,
  StudentReportSnapshot,
  StudentPromotion,
} from "../../lib/db/db";

import {
  MediaOwners,
  MediaFieldKeys,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  revokeMediaObjectUrl,
} from "../../lib/media/mediaAssetUtils";

import SubjectBroadsheet from "../../branch-admin/modules/reports/components/SubjectBroadSheet";
import ClassBroadsheet from "../../branch-admin/modules/reports/components/ClassBroadSheet";
import AnnualBroadsheet from "../../branch-admin/modules/reports/components/AnnualBroadsheet";
import { printReportTarget } from "../../branch-admin/modules/reports/components/ReportExportTools";

import {
  getBroadsheetTemplateDefinition,
  resolveBroadsheetTemplateSettings,
} from "../../branch-admin/modules/reports/broadsheet-templates";

import type {
  BroadsheetKind,
  BroadsheetReportType,
  BroadsheetTemplateRecord,
  BroadsheetTemplateSettings,
} from "../../branch-admin/modules/reports/broadsheet-templates";

import { buildReportEngineOutput } from "../../branch-admin/modules/reports/engine/report-engine";
import {
  resolveSubjectBroadsheetAssessmentReportSettings,
} from "../../branch-admin/modules/reports/shared/ReportTemplateUtils";
import { buildCumulativeReportEngineOutput } from "../../branch-admin/modules/reports/engine/cumulative-report-engine";

import type {
  ReportEngineDataset,
  ReportFiltersState,
  ReportMode,
} from "../../branch-admin/modules/reports/engine/report-types";
import type { CumulativeReportEngineDataset } from "../../branch-admin/modules/reports/engine/cumulative-report-types";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useTeacherWorkspaceAccess } from "../hooks/useTeacherWorkspaceAccess";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
type BroadsheetMode = ReportMode | "annual-broadsheet";

type EntityId = string | number;

type TenantRow = {
  accountId?: EntityId;
  schoolId?: EntityId;
  branchId?: EntityId;
  isDeleted?: boolean;
};

type SchoolRow = {
  accountId?: EntityId;
  id?: EntityId;
  isDeleted?: boolean;
};

type BranchRow = {
  accountId?: EntityId;
  schoolId?: EntityId;
  id?: EntityId;
  isDeleted?: boolean;
};

function firstExistingId<T extends { id?: EntityId }>(rows: T[]): string | undefined {
  const id = rows.map((row) => idOf(row.id)).find(Boolean);
  return id || undefined;
}

const BROADSHEET_PRINT_ZONE_ID = "broadsheet-print-zone";

const BROADSHEET_MEDIA_OWNER_SCHOOLS = String(
  (MediaOwners as any).SCHOOLS || "schools",
);
const BROADSHEET_MEDIA_OWNER_BRANCHES = String(
  (MediaOwners as any).BRANCHES || "branches",
);
const BROADSHEET_MEDIA_OWNER_SETTINGS = String(
  (MediaOwners as any).SCHOOL_BRANCH_SETTINGS ||
    (MediaOwners as any).SCHOOL_BRANCHES_SETTINGS ||
    "schoolBranchSettings",
);

const BROADSHEET_FIELD_LOGO = String((MediaFieldKeys as any).LOGO || "logo");
const BROADSHEET_FIELD_PHOTO = String((MediaFieldKeys as any).PHOTO || "photo");
const BROADSHEET_FIELD_REPORT_BACKGROUND = "reportCardBackgroundImage";
const BROADSHEET_FIELD_REPORT_WATERMARK = "reportCardWatermark";
const BROADSHEET_FIELD_REPORT_SIGNATURE = "reportCardSignatureImage";
const BROADSHEET_MEDIA_OWNER_STUDENTS = String(
  (MediaOwners as any).STUDENTS || "students",
);

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

function fallbackMediaValue(
  row: any,
  stringField: string,
  mediaIdField?: string,
) {
  if (!row) return "";

  if (mediaIdField && hasOwn(row, mediaIdField) && !idOf(row[mediaIdField]))
    return "";

  return safeRecordMediaValue(row[stringField]);
}

function idOf(value: unknown): string {
  if (value === null || value === undefined) return "";

  const normalized = String(value).trim();
  if (
    !normalized ||
    normalized === "0" ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return "";
  }

  return normalized;
}

function cleanId(value: unknown): string {
  return idOf(value);
}

function labelOf<T extends { id?: EntityId; name?: string }>(
  rows: T[],
  id?: EntityId,
) {
  const selectedId = idOf(id);
  if (!selectedId) return "Not selected";
  return rows.find((row) => idOf(row.id) === selectedId)?.name || "Not found";
}

function broadsheetKindFromMode(mode: BroadsheetMode): BroadsheetKind {
  if (mode === "class-broadsheet") return "class";
  if (mode === "annual-broadsheet") return "annual";
  return "subject";
}

function broadsheetReportTypeFromMode(
  mode: BroadsheetMode,
): BroadsheetReportType {
  if (mode === "class-broadsheet") return "class_broadsheet";
  if (mode === "annual-broadsheet") return "annual_broadsheet";
  return "subject_broadsheet";
}

function templateCodeOf(row?: Record<string, any> | null) {
  return String(
    row?.code || row?.templateCode || row?.layoutKey || row?.templateKey || "",
  ).trim();
}

function sameOptionalId(value: unknown, expected: unknown) {
  const parsed = idOf(value);
  const expectedId = idOf(expected);
  return !parsed || (!!expectedId && parsed === expectedId);
}

function withBranchHeader<T extends Record<string, any>>(
  header: T | undefined,
  branch?: Branch,
): T | undefined {
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
      resolvedReportCardBackgroundImageUrl:
        ((header as any).branding || {}).resolvedReportCardBackgroundImageUrl ||
        (header as any).schoolBranchSetting?.reportCardBackgroundImage ||
        "",
      reportCardBackgroundImage:
        ((header as any).branding || {}).reportCardBackgroundImage ||
        (header as any).schoolBranchSetting?.reportCardBackgroundImage ||
        "",
      resolvedReportCardWatermarkUrl:
        ((header as any).branding || {}).resolvedReportCardWatermarkUrl ||
        (header as any).schoolBranchSetting?.reportCardWatermark ||
        "",
      reportCardWatermark:
        ((header as any).branding || {}).reportCardWatermark ||
        (header as any).schoolBranchSetting?.reportCardWatermark ||
        "",
      resolvedReportCardSignatureImageUrl:
        ((header as any).branding || {}).resolvedReportCardSignatureImageUrl ||
        (header as any).schoolBranchSetting?.reportCardSignatureImage ||
        "",
      reportCardSignatureImage:
        ((header as any).branding || {}).reportCardSignatureImage ||
        (header as any).schoolBranchSetting?.reportCardSignatureImage ||
        "",
    },
  } as T;
}

export default function Teacherbroadsheets() {
  const dataRevision = useBranchTableRevision([
    "schools",
    "branches",
    "schoolBranchSettings",
    "academicStructures",
    "academicPeriods",
    "students",
    "parents",
    "teachers",
    "classes",
    "subjects",
    "classSubjects",
    "classTeachers",
    "studentEnrollments",
    "studentParents",
    "assessmentApplicabilities",
    "assessmentStructures",
    "assessmentStructureItems",
    "assessmentEntries",
    "gradingStructures",
    "gradeRules",
    "attendance",
    "studentAttendanceSummaries",
    "computedResults",
    "reportCards",
    "reportCardItems",
    "studentReportSnapshots",
    "studentPromotions",
    "reportCardTemplates",
    "reportCardTemplateSettings",
    "reportCardTemplateAssignments",
    "mediaAssets",
    "mediaBlobs",
  ]);

  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeBranch,
  } = useActiveBranch();
  const workspace = useBranchWorkspaceScope();
  const teacherAccess = useTeacherWorkspaceAccess();
  const {
    accountId,
    schoolId,
    branchId,
    authenticated,
    restoring: accountLoading,
    branchLoading: contextLoading,
  } = workspace;

  const teacherId = teacherAccess.teacherId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  /**
   * The settings context may return appearance-only settings, so academic IDs
   * must be normalized before they are used in ReportFiltersState.
   */
  const currentAcademicStructureId: string | undefined =
    idOf(settings?.currentAcademicStructureId) || undefined;

  const currentAcademicPeriodId: string | undefined =
    idOf(settings?.currentAcademicPeriodId) || undefined;

  const { loading: pageLoading, setLoading: setPageLoading } =
    useBackgroundLoader();
  const [mode, setMode] = useState<BroadsheetMode>("subject-broadsheet");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Choose a populated subject/period once per selected branch, unless the
  // school administrator has deliberately selected their own filters.
  const automaticSubjectScopeRef = React.useRef("");
  const manualSubjectScopeRef = React.useRef(false);

  const setFiltersFromUser: React.Dispatch<React.SetStateAction<ReportFiltersState>> =
    (next) => {
      manualSubjectScopeRef.current = true;
      setFilters(next);
    };


  const [filters, setFilters] = useState<ReportFiltersState>({
    branchId: branchId || undefined,
    academicStructureId: currentAcademicStructureId,
    academicPeriodId: currentAcademicPeriodId,
    classId: undefined,
    classSubjectId: undefined,
    studentId: undefined,
    sortMode: "position",
  });

  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schoolBranchSettings, setSchoolBranchSettings] = useState<
    SchoolBranchSetting[]
  >([]);
  const [academicStructures, setAcademicStructures] = useState<
    AcademicStructure[]
  >([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<
    StudentEnrollment[]
  >([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [assessmentApplicabilities, setAssessmentApplicabilities] = useState<
    AssessmentApplicability[]
  >([]);
  const [assessmentStructures, setAssessmentStructures] = useState<
    AssessmentStructure[]
  >([]);
  const [assessmentStructureItems, setAssessmentStructureItems] = useState<
    AssessmentStructureItem[]
  >([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>(
    [],
  );
  const [gradingStructures, setGradingStructures] = useState<GradingStructure[]>([]);
  const [gradeRules, setGradeRules] = useState<GradeRule[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [studentAttendanceSummaries, setStudentAttendanceSummaries] = useState<
    StudentAttendanceSummary[]
  >([]);
  const [computedResults, setComputedResults] = useState<ComputedResult[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [reportCardItems, setReportCardItems] = useState<ReportCardItem[]>([]);
  const [studentReportSnapshots, setStudentReportSnapshots] = useState<
    StudentReportSnapshot[]
  >([]);
  const [studentPromotions, setStudentPromotions] = useState<
    StudentPromotion[]
  >([]);
  const [reportCardTemplates, setReportCardTemplates] = useState<
    BroadsheetTemplateRecord[]
  >([]);
  const [reportCardTemplateSettings, setReportCardTemplateSettings] = useState<
    BroadsheetTemplateSettings[]
  >([]);
  const [reportCardTemplateAssignments, setReportCardTemplateAssignments] =
    useState<Record<string, any>[]>([]);
  const [broadsheetMediaUrls, setBroadsheetMediaUrls] = useState<string[]>([]);

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    // Missing branch workspace is handled locally so the selected-role flow is not broken.
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

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
    setGradingStructures([]);
    setGradeRules([]);
    setAttendance([]);
    setStudentAttendanceSummaries([]);
    setComputedResults([]);
    setReportCards([]);
    setReportCardItems([]);
    setStudentReportSnapshots([]);
    setStudentPromotions([]);
    setReportCardTemplates([]);
    setReportCardTemplateSettings([]);
    setReportCardTemplateAssignments([]);
  };

  const resolveBroadsheetMediaUrl = async ({
    ownerTable,
    ownerId,
    fieldKey,
    fallbackMediaId,
    nextUrls,
  }: {
    ownerTable: string;
    ownerId?: string | null;
    fieldKey: string;
    fallbackMediaId?: EntityId | null;
    nextUrls: string[];
  }) => {
    const ownerIdValue = cleanId(ownerId);

    if (ownerIdValue) {
      const ownedAsset = await getOwnerFieldMediaAsset({
        accountId: accountId || undefined,
        ownerTable,
        ownerId: ownerIdValue,

        fieldKey,
      });

      if (
        ownedAsset?.id &&
        !(ownedAsset as any).isDeleted &&
        (ownedAsset as any).active !== false
      ) {
        const url = await getMediaObjectUrl(String(ownedAsset.id));
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
      (!ownerIdValue ||
        String(fallbackAsset.ownerId || "") === String(ownerIdValue));

    if (!belongsToOwner) return "";

    const url = await getMediaObjectUrl(mediaId);
    if (url) nextUrls.push(url);
    return url || "";
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId ||
        !teacherAccess.ready || !teacherAccess.permitted || !teacherId) {
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
        studentAttendanceSummaryRows,
        computedRows,
        reportCardRows,
        reportCardItemRows,
        snapshotRows,
        promotionRows,
        reportCardTemplateRows,
        reportCardTemplateSettingRows,
        reportCardTemplateAssignmentRows,
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
        db.gradingStructures.toArray(),
        db.gradeRules.toArray(),
        db.attendance.toArray(),
        db.studentAttendanceSummaries.toArray(),
        db.computedResults.toArray(),
        db.reportCards.toArray(),
        db.reportCardItems.toArray(),
        db.studentReportSnapshots.toArray(),
        db.studentPromotions.toArray(),
        (db as any).reportCardTemplates?.toArray?.() || [],
        (db as any).reportCardTemplateSettings?.toArray?.() || [],
        (db as any).reportCardTemplateAssignments?.toArray?.() || [],
      ]);

      const sameSchool = (row: SchoolRow) =>
        idOf(row.accountId) === idOf(accountId) &&
        idOf(row.id) === schoolId && !row.isDeleted;

      const sameBranch = (row: BranchRow) =>
        idOf(row.accountId) === idOf(accountId) &&
        idOf(row.schoolId) === schoolId &&
        idOf(row.id) === branchId &&
        !row.isDeleted;

      const sameTenant = (row: TenantRow) =>
        idOf(row.accountId) === idOf(accountId) &&
        idOf(row.schoolId) === schoolId &&
        idOf(row.branchId) === branchId &&
        !row.isDeleted;

      const currentSchool =
        schoolRows.find(sameSchool) ||
        (activeSchool?.accountId === accountId && activeSchool?.id === schoolId
          ? activeSchool
          : undefined);

      const currentBranch =
        branchRows.find(sameBranch) ||
        (activeBranch?.accountId === accountId &&
        activeBranch?.schoolId === schoolId &&
        activeBranch?.id === branchId
          ? activeBranch
          : undefined);

      const scopedAcademicPeriods = academicPeriodRows.filter(sameTenant);
      const scopedSettings = schoolBranchSettingRows.filter(sameTenant);

      // Active teacher assignments are the sole source of visible classes.
      const teachingSubjectRows = classSubjectRows.filter((r: any) =>
        sameTenant(r) && r.active !== false && idOf(r.teacherId) === teacherId,
      );
      const classTeacherRowsForTeacher = classTeacherRows.filter((r: any) =>
        sameTenant(r) && r.active !== false && idOf(r.teacherId) === teacherId,
      );
      const teachingClassIds = new Set<string>(teachingSubjectRows.map((r: any) => idOf(r.classId)).filter(Boolean));
      const homeClassIds = new Set<string>(classTeacherRowsForTeacher.map((r: any) => idOf(r.classId)).filter(Boolean));
      const authorizedClassIds = new Set<string>([...teachingClassIds, ...homeClassIds]);
      const authorizedEnrollments = enrollmentRows.filter((r: any) =>
        sameTenant(r) && !r.isDeleted && authorizedClassIds.has(idOf(r.classId)));
      const authorizedStudentIds = new Set<string>(authorizedEnrollments.map((r: any) => idOf(r.studentId)).filter(Boolean));
      // Keep colleagues' subjects to calculate a full Class/Annual broadsheet.
      const authorizedClassSubjects = classSubjectRows.filter((r: any) =>
        sameTenant(r) && r.active !== false && authorizedClassIds.has(idOf(r.classId)));
      const authorizedSubjectIds = new Set<string>(authorizedClassSubjects.map((r: any) => idOf(r.id)).filter(Boolean));
      const scopedReportCards = reportCardRows.filter((r: any) =>
        sameTenant(r) && !r.isDeleted && authorizedClassIds.has(idOf(r.classId)));
      const nextMediaUrls: string[] = [];

      const currentSchoolWithMedia = currentSchool
        ? ({
            ...currentSchool,
            logo:
              (await resolveBroadsheetMediaUrl({
                ownerTable: BROADSHEET_MEDIA_OWNER_SCHOOLS,
                ownerId: currentSchool.id,

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
                ownerId: currentBranch.id,

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
              ownerId: row.id,

              fieldKey: BROADSHEET_FIELD_LOGO,
              fallbackMediaId: row.logoMediaId,
              nextUrls: nextMediaUrls,
            })) || fallbackMediaValue(row, "logo", "logoMediaId"),
          reportCardBackgroundImage:
            (await resolveBroadsheetMediaUrl({
              ownerTable: BROADSHEET_MEDIA_OWNER_SETTINGS,
              ownerId: row.id,

              fieldKey: BROADSHEET_FIELD_REPORT_BACKGROUND,
              fallbackMediaId: row.reportCardBackgroundImageMediaId,
              nextUrls: nextMediaUrls,
            })) ||
            fallbackMediaValue(
              row,
              "reportCardBackgroundImage",
              "reportCardBackgroundImageMediaId",
            ),
          reportCardWatermark:
            (await resolveBroadsheetMediaUrl({
              ownerTable: BROADSHEET_MEDIA_OWNER_SETTINGS,
              ownerId: row.id,

              fieldKey: BROADSHEET_FIELD_REPORT_WATERMARK,
              fallbackMediaId: row.reportCardWatermarkMediaId,
              nextUrls: nextMediaUrls,
            })) ||
            fallbackMediaValue(
              row,
              "reportCardWatermark",
              "reportCardWatermarkMediaId",
            ),
          reportCardSignatureImage:
            (await resolveBroadsheetMediaUrl({
              ownerTable: BROADSHEET_MEDIA_OWNER_SETTINGS,
              ownerId: row.id,

              fieldKey: BROADSHEET_FIELD_REPORT_SIGNATURE,
              fallbackMediaId: row.reportCardSignatureImageMediaId,
              nextUrls: nextMediaUrls,
            })) ||
            fallbackMediaValue(
              row,
              "reportCardSignatureImage",
              "reportCardSignatureImageMediaId",
            ),
        })),
      );

      const scopedStudentsWithMedia = await Promise.all(
        studentRows.filter((r: any) => sameTenant(r) &&
          authorizedStudentIds.has(idOf(r.id))).map(async (student: any) => {
          const photo =
            (await resolveBroadsheetMediaUrl({
              ownerTable: BROADSHEET_MEDIA_OWNER_STUDENTS,
              ownerId: student.id,

              fieldKey: BROADSHEET_FIELD_PHOTO,
              fallbackMediaId: student.photoMediaId,
              nextUrls: nextMediaUrls,
            })) || fallbackMediaValue(student, "photo", "photoMediaId");

          return {
            ...student,
            photo,
            studentPhoto: photo,
            resolvedStudentPhotoUrl: photo,
          };
        }),
      );

      const branchPeriodIds = new Set<string>(
        scopedAcademicPeriods.map((row) => idOf(row.id)).filter(Boolean),
      );
      const branchReportCardIds = new Set<string>(
        scopedReportCards.map((row) => idOf(row.id)).filter(Boolean),
      );

      broadsheetMediaUrls.forEach((url) => {
        if (!nextMediaUrls.includes(url)) revokeMediaObjectUrl(url);
      });
      setBroadsheetMediaUrls(nextMediaUrls);

      setSchools(currentSchoolWithMedia ? [currentSchoolWithMedia] : []);
      setBranches(currentBranchWithMedia ? [currentBranchWithMedia] : []);
      setSchoolBranchSettings(scopedSettingsWithMedia as SchoolBranchSetting[]);
      setAcademicStructures(academicStructureRows.filter(sameTenant));
      setAcademicPeriods(scopedAcademicPeriods);
      setStudents(scopedStudentsWithMedia as Student[]);
      setParents(parentRows.filter((r: any) => sameTenant(r) &&
        studentParentRows.some((p: any) => sameTenant(p) && authorizedStudentIds.has(idOf(p.studentId)) && idOf(p.parentId) === idOf(r.id))));
      setTeachers(teacherRows.filter((r: any) => sameTenant(r) &&
        (idOf(r.id) === teacherId || authorizedClassSubjects.some((s: any) => idOf(s.teacherId) === idOf(r.id)) ||
         classTeacherRows.some((s: any) => sameTenant(s) && authorizedClassIds.has(idOf(s.classId)) && idOf(s.teacherId) === idOf(r.id)))));
      setClasses(classRows.filter((r: any) => sameTenant(r) && r.active !== false && authorizedClassIds.has(idOf(r.id))));
      setSubjects(subjectRows.filter((r: any) => sameTenant(r) && r.active !== false &&
        authorizedClassSubjects.some((s: any) => idOf(s.subjectId) === idOf(r.id))));
      setClassSubjects(authorizedClassSubjects);
      setStudentParents(studentParentRows.filter((r: any) => sameTenant(r) && authorizedStudentIds.has(idOf(r.studentId))));
      setStudentEnrollments(authorizedEnrollments);
      setClassTeachers(classTeacherRows.filter((r: any) => sameTenant(r) && r.active !== false && authorizedClassIds.has(idOf(r.classId))));
      setAssessmentApplicabilities(applicabilityRows.filter((r: any) => sameTenant(r) && r.active !== false &&
        (!r.classId || authorizedClassIds.has(idOf(r.classId))) &&
        (!r.classSubjectId || authorizedSubjectIds.has(idOf(r.classSubjectId)))));
      setAssessmentStructures(structureRows.filter((r: any) => sameTenant(r) && r.active !== false));
      setAssessmentStructureItems(structureItemRows.filter((r: any) => sameTenant(r) && r.active !== false));
      setAssessmentEntries(entryRows.filter((r: any) => sameTenant(r) && !r.isDeleted &&
        (!r.classSubjectId || authorizedSubjectIds.has(idOf(r.classSubjectId))) &&
        (!r.studentId || authorizedStudentIds.has(idOf(r.studentId)))));
      setGradingStructures(gradingRows.filter((r: any) => sameTenant(r) && r.active !== false));
      setGradeRules(ruleRows.filter((r: any) => sameTenant(r) && r.active !== false));
      setAttendance(attendanceRows.filter((r: any) => sameTenant(r) && !r.isDeleted &&
        (!r.studentId || authorizedStudentIds.has(idOf(r.studentId)))));
      setStudentAttendanceSummaries(studentAttendanceSummaryRows.filter((r: any) => sameTenant(r) &&
        (!r.studentId || authorizedStudentIds.has(idOf(r.studentId)))));
      setComputedResults(computedRows.filter((r: any) => sameTenant(r) && !r.isDeleted &&
        (!r.classSubjectId || authorizedSubjectIds.has(idOf(r.classSubjectId))) &&
        (!r.studentId || authorizedStudentIds.has(idOf(r.studentId)))));
      setReportCards(scopedReportCards);

      setReportCardItems(
        reportCardItemRows.filter((row) => {
          if (!sameTenant(row)) return false;
          if (
            row.reportCardId &&
            !branchReportCardIds.has(idOf(row.reportCardId))
          )
            return false;
          if (
            row.academicPeriodId &&
            !branchPeriodIds.has(idOf(row.academicPeriodId))
          )
            return false;
          return true;
        }),
      );

      setStudentReportSnapshots(
        snapshotRows.filter((row: any) => {
          if (row.isDeleted) return false;
          if (row.accountId !== accountId) return false;
          if (row.schoolId !== schoolId) return false;
          if (row.branchId !== branchId) return false;
          if (row.classId && !homeClassIds.has(idOf(row.classId))) return false;
          if (row.studentId && !authorizedStudentIds.has(idOf(row.studentId))) return false;
          return true;
        }),
      );

      setStudentPromotions(
        promotionRows.filter((row: any) => {
          if (row.isDeleted) return false;
          if (row.accountId && row.accountId !== accountId) return false;
          if (row.schoolId && row.schoolId !== schoolId) return false;
          if (row.branchId && row.branchId !== branchId) return false;
          if (row.studentId && !authorizedStudentIds.has(idOf(row.studentId))) return false;
          if (row.fromClassId && !homeClassIds.has(idOf(row.fromClassId)) &&
              row.toClassId && !homeClassIds.has(idOf(row.toClassId))) return false;
          return true;
        }),
      );

      setReportCardTemplates(
        (reportCardTemplateRows as BroadsheetTemplateRecord[]).filter(
          (row: any) => {
            if (row.isDeleted || row.active === false) return false;
            if (row.accountId && row.accountId !== accountId) return false;
            if (
              row.schoolId &&
              String(row.schoolId ?? "") !== String(schoolId ?? "")
            )
              return false;
            if (
              row.branchId &&
              String(row.branchId ?? "") !== String(branchId ?? "")
            )
              return false;
            return [
              "subject_broadsheet",
              "class_broadsheet",
              "annual_broadsheet",
            ].includes(String(row.reportType || ""));
          },
        ),
      );

      setReportCardTemplateSettings(
        (reportCardTemplateSettingRows as BroadsheetTemplateSettings[]).filter(
          (row: any) => {
            if (row.isDeleted || row.active === false) return false;
            if (row.accountId && row.accountId !== accountId) return false;
            if (
              row.schoolId &&
              String(row.schoolId ?? "") !== String(schoolId ?? "")
            )
              return false;
            if (
              row.branchId &&
              String(row.branchId ?? "") !== String(branchId ?? "")
            )
              return false;
            return [
              "subject_broadsheet",
              "class_broadsheet",
              "annual_broadsheet",
            ].includes(String(row.reportType || ""));
          },
        ),
      );

      setReportCardTemplateAssignments(
        (reportCardTemplateAssignmentRows as Record<string, any>[]).filter(
          (row: any) => {
            if (row.isDeleted || row.active === false) return false;
            if (row.accountId && row.accountId !== accountId) return false;
            if (
              row.schoolId &&
              String(row.schoolId ?? "") !== String(schoolId ?? "")
            )
              return false;
            if (
              row.branchId &&
              String(row.branchId ?? "") !== String(branchId ?? "")
            )
              return false;
            return [
              "subject_broadsheet",
              "class_broadsheet",
              "annual_broadsheet",
            ].includes(String(row.reportType || ""));
          },
        ),
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
  }, [authenticated, accountId, schoolId, branchId, dataRevision, teacherAccess.ready, teacherAccess.permitted, teacherId]);

  useEffect(() => {
    automaticSubjectScopeRef.current = "";
    manualSubjectScopeRef.current = false;
  }, [accountId, schoolId, branchId, teacherId]);

  useEffect(() => {
    setFilters((prev) => {
      const nextBranchId = branchId || undefined;
      const branchChanged = prev.branchId !== nextBranchId;

      return {
        ...prev,
        branchId: nextBranchId,
        academicStructureId: branchChanged
          ? currentAcademicStructureId
          : prev.academicStructureId || currentAcademicStructureId,
        academicPeriodId: branchChanged
          ? currentAcademicPeriodId
          : prev.academicPeriodId || currentAcademicPeriodId,
        classId: branchChanged ? undefined : prev.classId,
        classSubjectId: branchChanged ? undefined : prev.classSubjectId,
        studentId: branchChanged ? undefined : prev.studentId,
      };
    });
  }, [branchId, currentAcademicStructureId, currentAcademicPeriodId]);

  useEffect(() => {
    if (!filters.academicStructureId) {
      const fallbackId =
        currentAcademicStructureId || firstExistingId(academicStructures);
      if (fallbackId)
        setFilters((prev) => ({ ...prev, academicStructureId: fallbackId }));
    }
  }, [
    filters.academicStructureId,
    currentAcademicStructureId,
    academicStructures,
  ]);

  useEffect(() => {
    if (!filters.academicPeriodId) {
      const fallbackId =
        currentAcademicPeriodId || firstExistingId(academicPeriods);
      if (fallbackId)
        setFilters((prev) => ({ ...prev, academicPeriodId: fallbackId }));
    }
  }, [filters.academicPeriodId, currentAcademicPeriodId, academicPeriods]);

  const lockedBranches = useMemo(() => {
    return activeBranch && activeBranch.id === branchId
      ? [activeBranch]
      : branches;
  }, [activeBranch, branchId, branches]);

  const teachingClassSubjectIds = useMemo(() => new Set<string>(
    classSubjects.filter((r: any) => idOf(r.teacherId) === teacherId)
      .map((r: any) => idOf(r.id)).filter(Boolean)), [classSubjects, teacherId]);
  const teachingClassIds = useMemo(() => new Set<string>(
    classSubjects.filter((r: any) => idOf(r.teacherId) === teacherId)
      .map((r: any) => idOf(r.classId)).filter(Boolean)), [classSubjects, teacherId]);
  const homeroomClassIds = useMemo(() => new Set<string>(
    classTeachers.filter((r: any) => idOf(r.teacherId) === teacherId)
      .map((r: any) => idOf(r.classId)).filter(Boolean)), [classTeachers, teacherId]);
  const modeClassIds = mode === "subject-broadsheet" ? teachingClassIds : homeroomClassIds;
  useEffect(() => {
    if (!teachingClassIds.size && homeroomClassIds.size && mode === "subject-broadsheet") {
      setMode("class-broadsheet");
    }
  }, [teachingClassIds, homeroomClassIds, mode]);
  const canSubject = teachingClassIds.size > 0;
  const canClass = homeroomClassIds.size > 0;
  const changeMode = (nextMode: BroadsheetMode) => {
    setMode(nextMode);
    // Never carry a subject-only class into a class-teacher report (or vice versa).
    manualSubjectScopeRef.current = true;
    setFilters((prev) => ({...prev, classId: undefined, classSubjectId: undefined, studentId: undefined}));
  };
  // Subject teachers cannot open the class or annual broadsheet, even via filters.
  // Class teachers receive full-class broadsheets, regardless of subjects taught.

  const filteredClasses = useMemo(() => {
    const allowedClassIds = new Set<string>();

    studentEnrollments.forEach((row) => {
      if (row.status !== "active") return;
      if (
        filters.academicStructureId &&
        row.academicStructureId !== filters.academicStructureId
      )
        return;
      if (
        filters.academicPeriodId &&
        row.academicPeriodId !== filters.academicPeriodId
      )
        return;
      allowedClassIds.add(idOf(row.classId));
    });

    classSubjects.forEach((row) => {
      if (row.active === false) return;
      if (
        filters.academicStructureId &&
        row.academicStructureId !== filters.academicStructureId
      )
        return;
      if (
        filters.academicPeriodId &&
        row.academicPeriodId &&
        row.academicPeriodId !== filters.academicPeriodId
      )
        return;
      allowedClassIds.add(idOf(row.classId));
    });

    const modeClasses = classes.filter((row) => !!idOf(row.id) && modeClassIds.has(idOf(row.id)));
    if (!filters.academicStructureId && !filters.academicPeriodId) return modeClasses;
    return modeClasses.filter((row) => !!idOf(row.id) && allowedClassIds.has(idOf(row.id)));
  }, [
    classes,
    studentEnrollments,
    classSubjects,
    filters.academicStructureId,
    filters.academicPeriodId,
    modeClassIds,
  ]);

  const filteredClassSubjects = useMemo(() => {
    return classSubjects.filter((row) => {
      if (mode === "subject-broadsheet" && !teachingClassSubjectIds.has(idOf(row.id))) return false;
      if (mode !== "subject-broadsheet" && !homeroomClassIds.has(idOf(row.classId))) return false;
      if (filters.classId && row.classId !== filters.classId) return false;
      if (
        filters.academicStructureId &&
        row.academicStructureId !== filters.academicStructureId
      )
        return false;
      if (
        filters.academicPeriodId &&
        row.academicPeriodId &&
        row.academicPeriodId !== filters.academicPeriodId
      )
        return false;
      return true;
    });
  }, [
    classSubjects,
    filters.classId,
    filters.academicStructureId,
    filters.academicPeriodId,
    mode,
    teachingClassSubjectIds,
    homeroomClassIds,
  ]);

  const filteredStudents = useMemo(() => {
    if (!filters.classId && !filters.academicPeriodId) return students;

    const allowedStudentIds = new Set(
      studentEnrollments
        .filter((row) => {
          if (row.status !== "active") return false;
          if (filters.classId && row.classId !== filters.classId) return false;
          if (
            filters.academicStructureId &&
            row.academicStructureId !== filters.academicStructureId
          )
            return false;
          if (
            filters.academicPeriodId &&
            row.academicPeriodId !== filters.academicPeriodId
          )
            return false;
          return true;
        })
        .map((row) => idOf(row.studentId))
        .filter(Boolean),
    );

    return students.filter((row) => !!idOf(row.id) && allowedStudentIds.has(idOf(row.id)));
  }, [
    students,
    studentEnrollments,
    filters.classId,
    filters.academicStructureId,
    filters.academicPeriodId,
  ]);

  const modeEnrollments = useMemo(() => studentEnrollments.filter((r: any) =>
    modeClassIds.has(idOf(r.classId))), [modeClassIds, studentEnrollments]);
  const modeStudentIds = useMemo(() => new Set<string>(modeEnrollments
    .map((r: any) => idOf(r.studentId)).filter(Boolean)), [modeEnrollments]);
  const modeClasses = useMemo(() => classes.filter((r: any) => modeClassIds.has(idOf(r.id))), [classes, modeClassIds]);
  const modeClassSubjects = useMemo(() => classSubjects.filter((r: any) =>
    mode === "subject-broadsheet" ? teachingClassSubjectIds.has(idOf(r.id)) : homeroomClassIds.has(idOf(r.classId))),
    [classSubjects, mode, teachingClassSubjectIds, homeroomClassIds]);
  const modeClassSubjectIds = useMemo(() => new Set<string>(modeClassSubjects
    .map((r: any) => idOf(r.id)).filter(Boolean)), [modeClassSubjects]);

  const dataset: ReportEngineDataset = useMemo(
    () => ({
      schools,
      branches: lockedBranches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students: students.filter((r: any) => modeStudentIds.has(idOf(r.id))),
      parents,
      studentParents: studentParents.filter((r: any) => modeStudentIds.has(idOf(r.studentId))),
      teachers,
      classes: modeClasses,
      subjects,
      classSubjects: modeClassSubjects,
      studentEnrollments: modeEnrollments,
      classTeachers,
      assessmentApplicabilities: assessmentApplicabilities.filter((r: any) => modeClassSubjectIds.has(idOf(r.classSubjectId))),
      assessmentStructures,
      assessmentStructureItems,
      assessmentEntries: assessmentEntries.filter((r: any) => modeClassSubjectIds.has(idOf(r.classSubjectId))),
      gradingStructures,
      gradeRules,
      attendance: attendance.filter((r: any) => modeStudentIds.has(idOf(r.studentId))),
      studentAttendanceSummaries: studentAttendanceSummaries.filter((r: any) => modeStudentIds.has(idOf(r.studentId))),
      computedResults: computedResults.filter((r: any) => modeClassSubjectIds.has(idOf(r.classSubjectId))),
      reportCards: reportCards.filter((r: any) => modeClassIds.has(idOf(r.classId))),
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
      gradingStructures,
      gradeRules,
      attendance,
      studentAttendanceSummaries,
      computedResults,
      reportCards,
      reportCardItems,
      modeStudentIds, modeClasses, modeClassSubjects, modeClassSubjectIds, modeClassIds, modeEnrollments,
    ],
  );

  const engineAssessmentSettings = useMemo(() => {
    if (
      mode !==
      "subject-broadsheet"
    ) {
      return undefined;
    }

    const row =
      reportCardTemplateSettings.find(
        (item: any) =>
          String(
            item.reportType || "",
          ) ===
            "subject_broadsheet" &&
          item.active !== false,
      ) || null;

    return resolveSubjectBroadsheetAssessmentReportSettings(
      row as any,
    );
  }, [
    mode,
    reportCardTemplateSettings,
  ]);

  const output = useMemo(
    () =>
      buildReportEngineOutput(
        dataset,
        filters,
        engineAssessmentSettings,
      ),
    [
      dataset,
      filters,
      engineAssessmentSettings,
    ],
  );

  /**
   * A subject broadsheet cannot render until one class subject is selected.
   * On first load of a branch, find a real class/term/subject with student rows
   * instead of choosing the first period or subject (which may be empty).
   * Never manufacture placeholder records or overwrite a user's filter choice.
   */
  useEffect(() => {
    const scope = [accountId, schoolId, branchId, teacherId].join(":");
    if (!teacherAccess.ready || !teacherAccess.permitted || mode !== "subject-broadsheet" ||
        !accountId || !schoolId || !branchId || !teacherId || pageLoading ||
        !academicPeriods.length || !classSubjects.length || !studentEnrollments.length ||
        automaticSubjectScopeRef.current === scope || manualSubjectScopeRef.current) return;

    // If the saved/default selection already produces rows, respect it.
    if (filters.classSubjectId &&
        Array.isArray(output.subjectBroadsheet?.students) &&
        output.subjectBroadsheet.students.length > 0) {
      automaticSubjectScopeRef.current = scope;
      return;
    }

    const enrollmentCounts = new Map<string, number>();
    studentEnrollments.forEach((row) => {
      if ((row as any).isDeleted || row.status !== "active") return;
      const key = [idOf(row.classId), idOf(row.academicStructureId), idOf(row.academicPeriodId)].join(":");
      enrollmentCounts.set(key, (enrollmentCounts.get(key) || 0) + 1);
    });

    const entryCounts = new Map<string, number>();
    assessmentEntries.forEach((row) => {
      if ((row as any).isDeleted) return;
      const key = [idOf(row.classSubjectId), idOf(row.academicPeriodId)].join(":");
      entryCounts.set(key, (entryCounts.get(key) || 0) + 1);
    });

    const candidates: Array<{ filters: ReportFiltersState; priority: number }> = [];
    classSubjects.forEach((classSubject) => {
      if ((classSubject as any).isDeleted || classSubject.active === false) return;
      const classId = idOf(classSubject.classId);
      const subjectId = idOf(classSubject.id);
      if (!teachingClassSubjectIds.has(subjectId)) return;
      if (!classId || !subjectId || !classes.some((c) => idOf(c.id) === classId)) return;
      academicPeriods.forEach((period) => {
        if ((period as any).isDeleted || (period as any).active === false) return;
        const periodId = idOf(period.id);
        const structureId = idOf(classSubject.academicStructureId) || idOf((period as any).academicStructureId);
        if (!periodId || !structureId) return;
        if (idOf(classSubject.academicPeriodId) && idOf(classSubject.academicPeriodId) !== periodId) return;
        if (idOf((period as any).academicStructureId) && idOf((period as any).academicStructureId) !== structureId) return;
        const count = enrollmentCounts.get([classId, structureId, periodId].join(":")) || 0;
        if (!count) return;
        const scores = entryCounts.get([subjectId, periodId].join(":")) || 0;
        const priority = scores * 1000 + count * 10 +
          (periodId === idOf(filters.academicPeriodId) ? 5 : 0) +
          (structureId === idOf(filters.academicStructureId) ? 3 : 0) +
          (classId === idOf(filters.classId) ? 2 : 0);
        candidates.push({
          priority,
          filters: {
            ...filters,
            branchId: branchId || undefined,
            academicStructureId: structureId,
            academicPeriodId: periodId,
            classId,
            classSubjectId: subjectId,
            studentId: undefined,
          },
        });
      });
    });

    candidates.sort((a, b) => b.priority - a.priority);
    // Verify the actual engine output. Merely having a class subject is not
    // sufficient: it may not have students or enough data to form a report.
    for (const candidate of candidates.slice(0, 24)) {
      try {
        const test = buildReportEngineOutput(dataset, candidate.filters, engineAssessmentSettings);
        if (Array.isArray(test.subjectBroadsheet?.students) && test.subjectBroadsheet.students.length > 0) {
          automaticSubjectScopeRef.current = scope;
          setFilters((prev) => ({
            ...prev,
            branchId: candidate.filters.branchId,
            academicStructureId: candidate.filters.academicStructureId,
            academicPeriodId: candidate.filters.academicPeriodId,
            classId: candidate.filters.classId,
            classSubjectId: candidate.filters.classSubjectId,
            studentId: undefined,
          }));
          return;
        }
      } catch (error) {
        console.warn("Skipping incomplete default broadsheet candidate:", error);
      }
    }
    // No populated candidate: retain the school's filter state and show the
    // existing empty report rather than pretending a result exists.
    automaticSubjectScopeRef.current = scope;
  }, [
    accountId, schoolId, branchId, pageLoading, academicPeriods, classSubjects,
    classes, studentEnrollments, assessmentEntries, dataset, filters,
    engineAssessmentSettings, output.subjectBroadsheet,
    teacherId, teacherAccess.permitted, teacherAccess.ready, mode, teachingClassSubjectIds,
  ]);


  const cumulativeDataset: CumulativeReportEngineDataset = useMemo(
    () => ({
      schools,
      branches: lockedBranches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students: students.filter((r: any) => modeStudentIds.has(idOf(r.id))),
      parents,
      studentParents,
      teachers,
      classes: modeClasses,
      subjects,
      studentReportSnapshots: studentReportSnapshots.filter((r: any) => modeClassIds.has(idOf(r.classId))),
      studentPromotions: studentPromotions.filter((r: any) => (!r.fromClassId || modeClassIds.has(idOf(r.fromClassId))) || (!r.toClassId || modeClassIds.has(idOf(r.toClassId)))),
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
      modeClassIds, modeStudentIds, modeEnrollments, modeClasses, modeClassSubjects,
    ],
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

  const hasCoreSetup = Boolean(
    academicStructures.length &&
      academicPeriods.length &&
      classes.length &&
      students.length,
  );

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
    return withBranchHeader(
      cumulativeOutput.header as any,
      reportBranch,
    ) as any;
  }, [cumulativeOutput.header, reportBranch]);

  const activeContextName = `${activeSchool?.name || schools[0]?.name || "Selected School"} · ${
    reportBranch?.name ||
    activeBranch?.name ||
    branches[0]?.name ||
    "Assigned Branch"
  }`;

  const selectedClassName = labelOf(classes, filters.classId);
  const selectedPeriodName = labelOf(academicPeriods, filters.academicPeriodId);
  const selectedStructureName = labelOf(
    academicStructures,
    filters.academicStructureId,
  );

  const searchTerm = search.trim().toLowerCase();

  const visibleClasses = useMemo(() => {
    if (!searchTerm) return filteredClasses;

    return filteredClasses.filter((item: any) =>
      `${item.name || ""} ${item.code || ""}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [filteredClasses, searchTerm]);

  const visibleClassSubjects = useMemo(() => {
    if (!searchTerm) return filteredClassSubjects;

    return filteredClassSubjects.filter((item: any) => {
      const subject = subjects.find(
        (row) => row.id === (item as any).subjectId,
      ) as any;
      const klass = classes.find(
        (row) => row.id === (item as any).classId,
      ) as any;
      return `${klass?.name || ""} ${subject?.name || ""} ${(item as any).name || ""}`
        .toLowerCase()
        .includes(searchTerm);
    });
  }, [classes, filteredClassSubjects, searchTerm, subjects]);

  const selectedClassSubjectName = useMemo(() => {
    if (!filters.classSubjectId) return "Not selected";

    const classSubject = classSubjects.find(
      (row) => row.id === filters.classSubjectId,
    ) as any;
    if (!classSubject) return "Not found";

    const subject = subjects.find(
      (row) => row.id === classSubject.subjectId,
    ) as any;
    const klass = classes.find((row) => row.id === classSubject.classId) as any;

    return `${klass?.name || "Class"} · ${subject?.name || classSubject.name || "Subject"}`;
  }, [classSubjects, classes, filters.classSubjectId, subjects]);

  const activeFilterCount = useMemo(() => {
    return [
      filters.academicStructureId,
      filters.academicPeriodId,
      filters.classId,
      filters.classSubjectId,
      filters.sortMode && filters.sortMode !== "position"
        ? filters.sortMode
        : undefined,
      mode !== "subject-broadsheet" ? mode : undefined,
    ].filter(Boolean).length;
  }, [
    filters.academicStructureId,
    filters.academicPeriodId,
    filters.classId,
    filters.classSubjectId,
    filters.sortMode,
    mode,
  ]);

  const canPrint =
    hasCoreSetup && (mode === "subject-broadsheet" ? canSubject : canClass) &&
    (mode === "subject-broadsheet"
      ? Boolean(output.subjectBroadsheet)
      : mode === "class-broadsheet"
        ? Boolean(output.classBroadsheet)
        : Boolean(cumulativeOutput.annualBroadsheet));

  const activeBroadsheetKind = broadsheetKindFromMode(mode);
  const activeBroadsheetReportType = broadsheetReportTypeFromMode(mode);

  const activeBroadsheetAssignment = useMemo(() => {
    const rows = reportCardTemplateAssignments.filter(
      (row: any) =>
        String(row.reportType || "") === activeBroadsheetReportType &&
        row.active !== false &&
        sameOptionalId(row.scopeId, branchId) &&
        (!row.scopeType || row.scopeType === "branch"),
    );

    return rows.find((row: any) => row.isDefault === true) || rows[0] || null;
  }, [activeBroadsheetReportType, branchId, reportCardTemplateAssignments]);

  const activeBroadsheetTemplate = useMemo(() => {
    const assignedTemplateId = idOf(activeBroadsheetAssignment?.templateId);
    const assignedTemplateCode = templateCodeOf(activeBroadsheetAssignment);

    const scopedTemplates = reportCardTemplates.filter(
      (row: any) =>
        String(row.reportType || "") === activeBroadsheetReportType &&
        row.active !== false,
    );

    return (
      scopedTemplates.find(
        (row: any) =>
          Boolean(assignedTemplateId) && idOf(row.id) === assignedTemplateId,
      ) ||
      scopedTemplates.find(
        (row: any) =>
          assignedTemplateCode && templateCodeOf(row) === assignedTemplateCode,
      ) ||
      scopedTemplates.find((row: any) => row.isDefault === true) ||
      scopedTemplates[0] ||
      getBroadsheetTemplateDefinition("broadsheet_classic")
    );
  }, [
    activeBroadsheetAssignment,
    activeBroadsheetReportType,
    reportCardTemplates,
  ]);

  const activeBroadsheetSettingsRow = useMemo(() => {
    const assignedSettingsId = idOf(
      activeBroadsheetAssignment?.templateSettingsId,
    );
    const templateId = idOf((activeBroadsheetTemplate as any)?.id);
    const templateCode = templateCodeOf(activeBroadsheetTemplate as any);

    const scopedSettings = reportCardTemplateSettings.filter(
      (row: any) =>
        String(row.reportType || "") === activeBroadsheetReportType &&
        row.active !== false,
    );

    return (
      scopedSettings.find(
        (row: any) =>
          Boolean(assignedSettingsId) && idOf(row.id) === assignedSettingsId,
      ) ||
      scopedSettings.find(
        (row: any) =>
          Boolean(templateId) && idOf(row.templateId) === templateId,
      ) ||
      scopedSettings.find(
        (row: any) =>
          templateCode && templateCodeOf(row as any) === templateCode,
      ) ||
      scopedSettings[0] ||
      null
    );
  }, [
    activeBroadsheetAssignment,
    activeBroadsheetReportType,
    activeBroadsheetTemplate,
    reportCardTemplateSettings,
  ]);

  const activeBroadsheetSettings = useMemo(
    () =>
      resolveBroadsheetTemplateSettings({
        kind: activeBroadsheetKind,
        template: activeBroadsheetTemplate,
        settings: activeBroadsheetSettingsRow,
      }),
    [
      activeBroadsheetKind,
      activeBroadsheetSettingsRow,
      activeBroadsheetTemplate,
    ],
  );

  const studentPhotoById = useMemo(() => {
    const map = new Map<string, string>();

    students.forEach((student: any) => {
      const studentId = idOf(student.id);
      if (!studentId) return;

      const photo =
        student.resolvedStudentPhotoUrl ||
        student.studentPhoto ||
        student.photo ||
        "";

      if (photo) map.set(studentId, photo);
    });

    return map;
  }, [students]);

  function withResolvedStudentPhotos<T extends Record<string, any> | undefined>(
    value: T,
  ): T {
    if (!value || !Array.isArray((value as any).students)) return value;

    return {
      ...(value as any),
      students: (value as any).students.map((student: any) => {
        const photo =
          student.resolvedStudentPhotoUrl ||
          student.studentPhoto ||
          student.photo ||
          studentPhotoById.get(idOf(student.studentId)) ||
          "";

        return {
          ...student,
          photo,
          studentPhoto: photo,
          resolvedStudentPhotoUrl: photo,
        };
      }),
    } as T;
  }

  const triggerBroadsheetPrint = () => {
    if (!canPrint) return;

    printReportTarget({
      targetId: BROADSHEET_PRINT_ZONE_ID,
      mode: "current-view",
      orientation: "landscape",
      pageSize: "A4",
      title:
        mode === "annual-broadsheet"
          ? "Annual Broadsheet"
          : mode === "class-broadsheet"
            ? "Class Broadsheet"
            : "Subject Broadsheet",
    });
  };

  // Shared Teacher Reports toolbar; A4 print stays inside report target.
  useRegisterBranchWorkspaceToolbar("reportsWorkspace", {
    // Read-only Teacher Broadsheets: no Add action.
    search: setSearch,
    filter: () => setFilterOpen(true),
    print: () => triggerBroadsheetPrint(),
    more: () => setMoreOpen(true),
  });

  const renderActiveReport = () => {
    if (!hasCoreSetup) {
      return (
        <Empty
          icon="📊"
          title="No broadsheet available"
          text="Add academic periods, classes, students, enrollments, class subjects, assessment entries, or computed results before generating broadsheets."
        />
      );
    }

    const sharedProps = {
      template: activeBroadsheetTemplate,
      settings: activeBroadsheetSettings,
      showWatermark: activeBroadsheetSettings.showBroadsheetWatermark,
      generatedAt: new Date(),
      pageBreakAfter: false,
      // V15: let the one shared Reports toolbar handle zoom.
      // The template returns its unscaled A4 page with no local toolbar.
      mobilePreview: false,
    };

    if (mode === "subject-broadsheet") {
      return (
        <SubjectBroadsheet
          {...sharedProps}
          header={broadsheetHeader}
          broadsheet={withResolvedStudentPhotos(
            output.subjectBroadsheet as any,
          )}
        />
      );
    }

    if (mode === "annual-broadsheet") {
      return (
        <AnnualBroadsheet
          {...sharedProps}
          header={annualBroadsheetHeader}
          broadsheet={withResolvedStudentPhotos(
            cumulativeOutput.annualBroadsheet as any,
          )}
        />
      );
    }

    return (
      <ClassBroadsheet
        {...sharedProps}
        header={broadsheetHeader}
        broadsheet={withResolvedStudentPhotos(output.classBroadsheet as any)}
      />
    );
  };

  if (accountLoading || contextLoading || settingsLoading || !teacherAccess.ready || pageLoading) {
    return (
      <State
        primary={primary}
        title="Opening Broadsheets..."
        text="Checking account, assigned branch, academic result data and broadsheet records."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before opening broadsheets."
      />
    );
  }

  if (!teacherAccess.permitted || !teacherId) {
    return <State primary={primary} title="Teacher membership required"
      text="Choose an active teacher membership to view assigned Broadsheets." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Branch workspace required</h2>
          <p>
            Teacher Broadsheets use your selected school branch
            workspace. Use Select Role again if the wrong branch is active.
          </p>
          <button
            type="button"
            className="ba-state-button"
            onClick={() => router.push("/select-role")}
          >
            Go to Select Role
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="ba-page student-reports-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section className="ba-print-card">
        <BranchReportPreview printZoneId={BROADSHEET_PRINT_ZONE_ID} naturalWidth={1122}>
          {renderActiveReport()}
        </BranchReportPreview>
      </section>

      {filterOpen && (
        <BranchViewportPortal themeSourceClass=".student-reports-page" onEscape={() => setFilterOpen(false)}>
        <FilterSheet
          mode={mode}
          filters={filters}
          academicStructures={academicStructures}
          academicPeriods={academicPeriods}
          filteredClasses={visibleClasses}
          filteredClassSubjects={visibleClassSubjects}
          subjects={subjects}
          classes={classes}
          setMode={changeMode}
          allowSubject={canSubject}
          allowClass={canClass}
          setFilters={setFiltersFromUser}
          search={search}
          setSearch={setSearch}
          onClose={() => setFilterOpen(false)}
        />
        </BranchViewportPortal>
      )}

      {moreOpen && (
        <BranchViewportPortal themeSourceClass=".student-reports-page" onEscape={() => setMoreOpen(false)}>
        <MoreSheet
          mode={mode}
          setMode={(nextMode) => {
            changeMode(nextMode);
            setMoreOpen(false);
          }}
          allowSubject={canSubject}
          allowClass={canClass}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onPrint={() => {
            setMoreOpen(false);
            triggerBroadsheetPrint();
          }}
          onClose={() => setMoreOpen(false)}
        />
        </BranchViewportPortal>
      )}
    </main>
  );
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

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
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
  allowSubject,
  allowClass,
  setFilters,
  search,
  setSearch,
  onClose,
}: {
  mode: BroadsheetMode;
  allowSubject: boolean;
  allowClass: boolean;
  filters: ReportFiltersState;
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  filteredClasses: Class[];
  filteredClassSubjects: ClassSubject[];
  subjects: Subject[];
  classes: Class[];
  setMode: (mode: BroadsheetMode) => void;
  setFilters: React.Dispatch<React.SetStateAction<ReportFiltersState>>;
  search: string;
  setSearch: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="ba-sheet-backdrop report-no-print"
      role="dialog"
      aria-modal="true"
    >
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>
              Choose the broadsheet scope. Branch stays locked to the assigned
              branch.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label className="ba-v4-find"><span>Search</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a student, subject or class" />
          </label>
          <label>
            <span>Broadsheet Mode</span>
            <select
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as BroadsheetMode)
              }
            >
              {allowSubject && <option value="subject-broadsheet">Subject Broadsheet</option>}
              {allowClass && <option value="class-broadsheet">Class Broadsheet</option>}
              {allowClass && <option value="annual-broadsheet">Annual Broadsheet</option>}
            </select>
          </label>

          <label>
            <span>Academic Structure</span>
            <select
              value={filters.academicStructureId || ""}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  academicStructureId:
                    cleanId(event.target.value) || undefined,
                  academicPeriodId: undefined,
                  classId: undefined,
                  classSubjectId: undefined,
                  studentId: undefined,
                }))
              }
            >
              <option value="">Select structure</option>
              {academicStructures.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
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
                  academicPeriodId:
                    cleanId(event.target.value) || undefined,
                  classId: undefined,
                  classSubjectId: undefined,
                  studentId: undefined,
                }))
              }
            >
              <option value="">Select period</option>
              {academicPeriods.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
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
                  classId:
                    cleanId(event.target.value) || undefined,
                  classSubjectId: undefined,
                }))
              }
            >
              <option value="">Select class</option>
              {filteredClasses.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {mode === "subject-broadsheet" && (
            <label>
              <span>Class Subject</span>
              <select
                value={filters.classSubjectId || ""}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    classSubjectId: cleanId(event.target.value) || undefined,
                  }))
                }
              >
                <option value="">Select class subject</option>
                {filteredClassSubjects.map((item: any) => {
                  const subject = subjects.find(
                    (row) => row.id === item.subjectId,
                  );
                  const klass = classes.find((row) => row.id === item.classId);
                  return (
                    <option key={item.id} value={item.id}>
                      {klass?.name || "Class"} ·{" "}
                      {subject?.name || item.name || "Subject"}
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
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  sortMode: event.target.value as any,
                }))
              }
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
  allowSubject,
  allowClass,
  onRefresh,
  onPrint,
  onClose,
}: {
  mode: BroadsheetMode;
  setMode: (mode: BroadsheetMode) => void;
  allowSubject: boolean;
  allowClass: boolean;
  onRefresh: () => void | Promise<void>;
  onPrint: () => void;
  onClose: () => void;
}) {
  const options: {
    mode: BroadsheetMode;
    icon: string;
    label: string;
    note: string;
  }[] = [
    {
      mode: "subject-broadsheet",
      icon: "☷",
      label: "Subject Broadsheet",
      note: "One subject across a class",
    },
    {
      mode: "class-broadsheet",
      icon: "▦",
      label: "Class Broadsheet",
      note: "All subjects for one class",
    },
    {
      mode: "annual-broadsheet",
      icon: "📊",
      label: "Annual Broadsheet",
      note: "Cumulative annual class view",
    },
  ];

  return (
    <div
      className="ba-sheet-backdrop report-no-print"
      role="dialog"
      aria-modal="true"
    >
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
          {options.filter((option) => option.mode === "subject-broadsheet" ? allowSubject : allowClass).map((option) => (
            <button
              key={option.mode}
              type="button"
              className={mode === option.mode ? "active" : ""}
              onClick={() => setMode(option.mode)}
            >
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


.ba-add-inline:disabled,
.ba-report-toolbar button:disabled {
  opacity: .45;
  cursor: not-allowed;
  box-shadow: none;
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

@media (min-width:980px){
  .student-reports-page .ba-modal-backdrop,
  .student-reports-page .ba-sheet-backdrop{
    top:var(--eds-shell-top-offset,0px);
    right:0;
    bottom:0;
    left:var(--portal-content-left,0px);
    width:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }

  .student-reports-page .ba-modal,
  .student-reports-page .ba-sheet{
    min-width:0;
    max-width:calc(100vw - var(--portal-content-left,0px) - 20px);
  }
}


/* V4 records workspace: neutral surface, efficient scroll, no duplicated toolbars. */
.ba-page.student-reports-page, .ba-page.report-remarks-page { min-height:0; padding:3px 4px 18px; background:transparent; overflow-x:clip; }
.ba-page.student-reports-page .ba-search-card, .ba-page.report-remarks-page .ba-search-card,
.ba-page.report-remarks-page .ba-summary-line { display:none; }
.ba-page.student-reports-page .ba-print-card,
.ba-page.report-remarks-page .ba-remark-card,
.ba-page.report-remarks-page .ba-student-row,
.ba-page.report-remarks-page .ba-list,
.ba-page.report-remarks-page .ba-sheet {
  background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 83%,var(--bg,#f3f5f8) 17%);
  border-color:var(--border,rgba(15,23,42,.13));
  box-shadow:none;
}
.ba-page.student-reports-page .ba-print-card { margin:0; padding:5px; border-radius:11px; box-shadow:none; }
.ba-page.student-reports-page .ba-print-zone { padding:3px; overflow-x:auto; overscroll-behavior-inline:contain; }
.ba-page.report-remarks-page .ba-remark-card { margin-top:0; box-shadow:none; border-radius:11px; }
.ba-page.report-remarks-page .ba-student-row { border-radius:9px; box-shadow:none; transform:none; }
.ba-page.report-remarks-page .ba-list { gap:6px; }
.ba-page.report-remarks-page .ba-student-row:hover { transform:none; }
.ba-page .ba-v4-find { display:grid; gap:5px; grid-column:1/-1; font-size:12px; font-weight:700; color:var(--muted,#64748b); }
.ba-page .ba-v4-find input { min-height:40px; padding:0 10px; border-radius:9px; background:var(--input-bg,var(--surface,#fff)); color:var(--text,#111827); }
@media(max-width:760px){
 .ba-page.student-reports-page,.ba-page.report-remarks-page{padding:0 1px 14px;}
 .ba-page.student-reports-page .ba-print-card{padding:3px;border-radius:9px;}
 .ba-page.report-remarks-page .ba-remark-card{padding:9px;}
}
@media print {
  .ba-page.student-reports-page,.ba-page.report-remarks-page,
  .ba-page.student-reports-page .ba-print-card,
  .ba-page.student-reports-page .ba-print-zone {
    background:#fff!important;box-shadow:none!important;border:0!important;
    margin:0!important;padding:0!important;overflow:visible!important;
  }
}

/* V6 — quiet neutral records presentation matching Students/Teachers/Classes V5 */

.student-reports-page {background:var(--bg,var(--background,#f2f4f7));padding:5px;min-height:0;}
.student-reports-page .ba-print-card {margin:0;padding:5px;border-radius:13px;
 border:1px solid color-mix(in srgb,var(--border,#d4dae3) 85%,var(--text,#182235) 15%);
 background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%);box-shadow:none;}
.student-reports-page .ba-print-zone {border-radius:10px;}
.student-reports-page .ba-sheet,.student-reports-page .ba-card,.student-reports-page .ba-analysis {
 background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%);
 box-shadow:none;border-radius:13px;}
@media(max-width:639px){.student-reports-page{padding:3px;}}


/* V14: printable document uses the full available preview canvas, without a chrome/header card. */
.ba-page.student-reports-page { width:100%; max-width:none; padding:0; margin:0; overflow:visible; }
.ba-page.student-reports-page > .ba-print-card { width:100%; max-width:none; min-width:0;
  padding:0!important; margin:0!important; border:0!important; border-radius:0!important;
  background:transparent!important; box-shadow:none!important; overflow:visible!important; }
.ba-page.student-reports-page .ba-fit-viewport { width:100%; max-width:100%; }
.ba-page.student-reports-page .ba-print-head, .ba-page.student-reports-page .ba-report-toolbar { display:none!important; }
@media print { .ba-page.student-reports-page .ba-fit-viewport { max-height:none!important; overflow:visible!important; } }
`;
 
