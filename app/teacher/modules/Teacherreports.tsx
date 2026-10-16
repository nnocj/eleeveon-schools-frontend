"use client";

/**
 * app/teacher/modules/Teacherreports.tsx
 * Eleeveon Schools — Teacher Report Cards V29
 *
 * Adapted from the latest Branch Admin StudentReports workspace.
 * Design / behavior parity:
 * - Shared Reports toolbar (Search / Print / Filter / More)
 * - Full-size A4 preview with shared workspace vertical scrolling
 * - Workspace-aware filter and More sheets via BranchViewportPortal
 * - A coherent initial class/period/structure selection (when available)
 * - Single-student and whole-class printable report cards
 * - Student photos, school/branch branding, signatures, watermarks
 * - Branch report templates / grading structures / report engine
 * - Offline-first table revision updates; class/term filters don't create records
 *
 * Teacher access (READ scope only; must also be enforced on server/sync):
 * - Only students in classes explicitly assigned as class teacher OR subject teacher
 * - All class subjects may contribute to a complete report for an allowed class
 * - No branch selector, school switch, admissions, publishing, or admin mutation
 * - Assignment-derived access is re-evaluated when local tables change
 */

import BranchViewportPortal from "../../components/role-portals/shell/BranchViewportPortal";
import BranchReportPreview from "../../components/role-portals/shell/BranchReportPreview";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "../../lib/db/db";

import {
  MediaOwners,
  MediaFieldKeys,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  revokeMediaObjectUrl,
} from "../../lib/media/mediaAssetUtils";

import ReportAnalytics from "../../branch-admin/modules/reports/components/ReportAnalytics";
import StudentReportCard from "../../branch-admin/modules/reports/components/StudentReportCard";
import { printReportTarget } from "../../branch-admin/modules/reports/components/ReportExportTools";

import { buildReportEngineOutput } from "../../branch-admin/modules/reports/engine/report-engine";

import type {
  ReportEngineDataset,
  ReportFiltersState,
  ReportMode,
} from "../../branch-admin/modules/reports/engine/report-types";

import type {
  ReportCardTemplateAssignmentLike,
  ReportCardTemplateLike,
  ReportCardTemplateSettingsLike,
  StudentReportTemplateSettings,
} from "../../branch-admin/modules/reports/shared/ReportTemplateTypes";

import {
  DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
  mergeStudentReportTemplateSettings,
  normalizeStudentReportTemplateDefinition,
} from "../../branch-admin/modules/reports/shared/ReportTemplateTypes";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useTeacherWorkspaceAccess } from "../../hooks/useTeacherWorkspaceAccess";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
const TemplateAwareStudentReportCard =
  StudentReportCard as React.ComponentType<any>;

const STUDENT_REPORT_TYPE = "student_report";

function isStudentReportRecord(row: any) {
  return row?.reportType === STUDENT_REPORT_TYPE || !row?.reportType;
}

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

const STUDENT_REPORT_PRINT_ZONE_ID = "student-report-print-zone";

const REPORT_MEDIA_OWNER_STUDENTS = String(
  (MediaOwners as any).STUDENTS || "students",
);
const REPORT_MEDIA_OWNER_SCHOOLS = String(
  (MediaOwners as any).SCHOOLS || "schools",
);
const REPORT_MEDIA_OWNER_BRANCHES = String(
  (MediaOwners as any).BRANCHES || "branches",
);
const REPORT_MEDIA_OWNER_SETTINGS = String(
  (MediaOwners as any).SCHOOL_BRANCH_SETTINGS ||
    (MediaOwners as any).SCHOOL_BRANCHES_SETTINGS ||
    "schoolBranchSettings",
);

const REPORT_FIELD_PHOTO = String((MediaFieldKeys as any).PHOTO || "photo");
const REPORT_FIELD_LOGO = String((MediaFieldKeys as any).LOGO || "logo");
const REPORT_FIELD_BANNER = String(
  (MediaFieldKeys as any).BANNER || "bannerImage",
);
const REPORT_FIELD_REPORT_BACKGROUND = "reportCardBackgroundImage";
const REPORT_FIELD_REPORT_WATERMARK = "reportCardWatermark";
const REPORT_FIELD_REPORT_SIGNATURE = "reportCardSignatureImage";

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

  // If the new mediaId field exists but is empty/null/0, treat that as an intentional removal.
  // This prevents old legacy string fields from reviving deleted media on reports.
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

export default function Teacherreports() {
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
    "reportCardTemplates",
    "reportCardTemplateSettings",
    "reportCardTemplateAssignments",
    "mediaAssets",
    "mediaBlobs",
  ]);

  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeBranch } = useActiveBranch();
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
  const initialScopeAppliedRef = useRef<string>("");
  const [loadedScopeWorkspace, setLoadedScopeWorkspace] = useState("");
  const teacherId = teacherAccess.teacherId;
  const teacherWorkspaceKey = [accountId, schoolId, branchId, teacherId].join(":");
  const [mode, setMode] = useState<ReportMode>("student-report");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
  const [reportCardTemplates, setReportCardTemplates] = useState<
    ReportCardTemplateLike[]
  >([]);
  const [reportCardTemplateSettings, setReportCardTemplateSettings] = useState<
    ReportCardTemplateSettingsLike[]
  >([]);
  const [reportCardTemplateAssignments, setReportCardTemplateAssignments] =
    useState<ReportCardTemplateAssignmentLike[]>([]);
  const [reportMediaUrls, setReportMediaUrls] = useState<string[]>([]);

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
      reportMediaUrls.forEach(revokeMediaObjectUrl);
    };
  }, [reportMediaUrls]);

  const clearState = () => {
    reportMediaUrls.forEach(revokeMediaObjectUrl);
    setReportMediaUrls([]);
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
    setReportCardTemplates([]);
    setReportCardTemplateSettings([]);
    setReportCardTemplateAssignments([]);
  };

  const resolveReportMediaUrl = async ({
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
    if (
      !authenticated ||
      !accountId ||
      !schoolId ||
      !branchId ||
      !teacherAccess.ready ||
      !teacherAccess.permitted ||
      !teacherId
    ) {
      clearState();
      setLoadedScopeWorkspace("");
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
        (db as any).studentAttendanceSummaries?.toArray?.() || [],
        db.computedResults.toArray(),
        db.reportCards.toArray(),
        db.reportCardItems.toArray(),
        (db as any).reportCardTemplates?.toArray?.() || [],
        (db as any).reportCardTemplateSettings?.toArray?.() || [],
        (db as any).reportCardTemplateAssignments?.toArray?.() || [],
      ]);

      const sameSchool = (row: SchoolRow) =>
        idOf(row.accountId) === idOf(accountId) &&
        idOf(row.id) === schoolId &&
        !row.isDeleted;

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
        (idOf(activeSchool?.accountId) === idOf(accountId) &&
        idOf(activeSchool?.id) === schoolId
          ? activeSchool
          : undefined);

      const currentBranch =
        branchRows.find(sameBranch) ||
        (idOf(activeBranch?.accountId) === idOf(accountId) &&
        idOf(activeBranch?.schoolId) === schoolId &&
        idOf(activeBranch?.id) === branchId
          ? activeBranch
          : undefined);

      const scopedAcademicPeriods = academicPeriodRows.filter(sameTenant);
      const scopedReportCards = reportCardRows.filter(sameTenant);
      const scopedSettings = schoolBranchSettingRows.filter(sameTenant);
      const currentSetting = scopedSettings[0];

      // Teacher assignment is scoped to the selected account, school and branch.
      // A subject-teacher assignment opens that class's REPORT CARDS, not permission
      // to edit another teacher's scores. A class-teacher assignment also opens
      // the complete class reports. This is a read-only module.
      const scopedClassTeacherRows = classTeacherRows.filter(
        (row: any) => sameTenant(row) && row.active !== false,
      );
      const scopedClassSubjectRows = classSubjectRows.filter(
        (row: any) => sameTenant(row) && row.active !== false,
      );
      const assignedClassIds = new Set<string>([
        ...scopedClassTeacherRows.filter((r: any) => idOf(r.teacherId) === teacherId)
          .map((r: any) => idOf(r.classId)),
        ...scopedClassSubjectRows.filter((r: any) => idOf(r.teacherId) === teacherId)
          .map((r: any) => idOf(r.classId)),
      ].filter(Boolean));
      const scopedEnrollmentRows = enrollmentRows.filter(
        (r: any) => sameTenant(r) && !r.isDeleted &&
          assignedClassIds.has(idOf(r.classId)),
      );
      const assignedStudentIds = new Set<string>(scopedEnrollmentRows
        .filter((r: any) => r.status === "active")
        .map((r: any) => idOf(r.studentId)).filter(Boolean));
      // A full-class report needs every subject associated with that class,
      // even if it is taught by a different teacher.
      const visibleClassSubjects = scopedClassSubjectRows.filter(
        (r: any) => assignedClassIds.has(idOf(r.classId)),
      );
      const allowedSubjectIds = new Set<string>(visibleClassSubjects
        .map((r: any) => idOf(r.id)).filter(Boolean));
      const scopedReportCardsForBranch = scopedReportCards.filter(
        (r: any) => !r.isDeleted && assignedClassIds.has(idOf(r.classId)),
      );

      const scopedReportCardTemplates = (
        reportCardTemplateRows as ReportCardTemplateLike[]
      )
        .filter((row: any) => {
          if (row.isDeleted || row.active === false) return false;
          if (!isStudentReportRecord(row)) return false;
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
          return true;
        })
        .sort((a: any, b: any) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return String(a.name || "").localeCompare(String(b.name || ""));
        });

      const scopedReportCardTemplateSettings = (
        reportCardTemplateSettingRows as ReportCardTemplateSettingsLike[]
      ).filter((row: any) => {
        if (row.isDeleted || row.active === false) return false;
          if (!isStudentReportRecord(row)) return false;
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
        return true;
      });

      const scopedReportCardTemplateAssignments = (
        reportCardTemplateAssignmentRows as ReportCardTemplateAssignmentLike[]
      ).filter((row: any) => {
        if (row.isDeleted || row.active === false) return false;
          if (!isStudentReportRecord(row)) return false;
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
        return true;
      });

      const nextMediaUrls: string[] = [];

      const currentSchoolWithMedia = currentSchool
        ? ({
            ...currentSchool,
            logo:
              (await resolveReportMediaUrl({
                ownerTable: REPORT_MEDIA_OWNER_SCHOOLS,
                ownerId: currentSchool.id,

                fieldKey: REPORT_FIELD_LOGO,
                fallbackMediaId: (currentSchool as any).logoMediaId,
                nextUrls: nextMediaUrls,
              })) || fallbackMediaValue(currentSchool, "logo", "logoMediaId"),
          } as School)
        : undefined;

      const currentBranchWithMedia = currentBranch
        ? ({
            ...currentBranch,
            logo:
              (await resolveReportMediaUrl({
                ownerTable: REPORT_MEDIA_OWNER_BRANCHES,
                ownerId: currentBranch.id,

                fieldKey: REPORT_FIELD_LOGO,
                fallbackMediaId: (currentBranch as any).logoMediaId,
                nextUrls: nextMediaUrls,
              })) || fallbackMediaValue(currentBranch, "logo", "logoMediaId"),
          } as Branch)
        : undefined;

      const scopedSettingsWithMedia = await Promise.all(
        scopedSettings.map(async (row: any) => ({
          ...row,
          logo:
            (await resolveReportMediaUrl({
              ownerTable: REPORT_MEDIA_OWNER_SETTINGS,
              ownerId: row.id,

              fieldKey: REPORT_FIELD_LOGO,
              fallbackMediaId: row.logoMediaId,
              nextUrls: nextMediaUrls,
            })) || fallbackMediaValue(row, "logo", "logoMediaId"),
          reportCardBackgroundImage:
            (await resolveReportMediaUrl({
              ownerTable: REPORT_MEDIA_OWNER_SETTINGS,
              ownerId: row.id,

              fieldKey: REPORT_FIELD_REPORT_BACKGROUND,
              fallbackMediaId: row.reportCardBackgroundImageMediaId,
              nextUrls: nextMediaUrls,
            })) ||
            fallbackMediaValue(
              row,
              "reportCardBackgroundImage",
              "reportCardBackgroundImageMediaId",
            ),
          reportCardWatermark:
            (await resolveReportMediaUrl({
              ownerTable: REPORT_MEDIA_OWNER_SETTINGS,
              ownerId: row.id,

              fieldKey: REPORT_FIELD_REPORT_WATERMARK,
              fallbackMediaId: row.reportCardWatermarkMediaId,
              nextUrls: nextMediaUrls,
            })) ||
            fallbackMediaValue(
              row,
              "reportCardWatermark",
              "reportCardWatermarkMediaId",
            ),
          reportCardSignatureImage:
            (await resolveReportMediaUrl({
              ownerTable: REPORT_MEDIA_OWNER_SETTINGS,
              ownerId: row.id,

              fieldKey: REPORT_FIELD_REPORT_SIGNATURE,
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
        studentRows
          .filter(
            (student: any) =>
              sameTenant(student) &&
              !student.isDeleted &&
              assignedStudentIds.has(idOf(student.id)) &&
              student.status !== "withdrawn",
          )
          .map(async (student: any) => ({
          ...student,
          photo:
            (await resolveReportMediaUrl({
              ownerTable: REPORT_MEDIA_OWNER_STUDENTS,
              ownerId: student.id,

              fieldKey: REPORT_FIELD_PHOTO,
              fallbackMediaId: student.photoMediaId,
              nextUrls: nextMediaUrls,
            })) || fallbackMediaValue(student, "photo", "photoMediaId"),
        })),
      );

      const branchPeriodIds = new Set<string>(
        scopedAcademicPeriods.map((row) => idOf(row.id)).filter(Boolean),
      );
      const branchReportCardIds = new Set<string>(
        scopedReportCardsForBranch.map((row) => idOf(row.id)).filter(Boolean),
      );

      reportMediaUrls.forEach((url) => {
        if (!nextMediaUrls.includes(url)) revokeMediaObjectUrl(url);
      });
      setReportMediaUrls(nextMediaUrls);

      setSchools(currentSchoolWithMedia ? [currentSchoolWithMedia] : []);
      setBranches(currentBranchWithMedia ? [currentBranchWithMedia] : []);
      setSchoolBranchSettings(scopedSettingsWithMedia as SchoolBranchSetting[]);
      setAcademicStructures(academicStructureRows.filter(sameTenant));
      setAcademicPeriods(scopedAcademicPeriods);
      setStudents(scopedStudentsWithMedia as Student[]);
      const assignedStudentParentRows = studentParentRows.filter((r: any) =>
        sameTenant(r) && assignedStudentIds.has(idOf(r.studentId)));
      const assignedParentIds = new Set<string>(assignedStudentParentRows
        .map((r: any) => idOf(r.parentId)).filter(Boolean));
      setParents(parentRows.filter((r: any) => sameTenant(r) &&
        assignedParentIds.has(idOf(r.id))));
      setTeachers(
        // Retain all teachers for accurate subject/class-teacher name display.
        teacherRows.filter(
          (row: any) => sameTenant(row) && row.active !== false,
        ),
      );
      setClasses(
        classRows.filter(
          (row: any) => sameTenant(row) && row.active !== false &&
            assignedClassIds.has(idOf(row.id)),
        ),
      );
      setSubjects(
        subjectRows.filter((row) => sameTenant(row) && row.active !== false),
      );
      setClassSubjects(visibleClassSubjects);
      setStudentParents(assignedStudentParentRows);
      setStudentEnrollments(scopedEnrollmentRows);
      setClassTeachers(scopedClassTeacherRows.filter((r: any) =>
        assignedClassIds.has(idOf(r.classId))));
      setAssessmentApplicabilities(
        applicabilityRows.filter(
          (row: any) => sameTenant(row) && row.active !== false &&
            (!row.classId || assignedClassIds.has(idOf(row.classId))) &&
            (!row.classSubjectId || allowedSubjectIds.has(idOf(row.classSubjectId))),
        ),
      );
      setAssessmentStructures(
        structureRows.filter((row) => sameTenant(row) && row.active !== false),
      );
      setAssessmentStructureItems(
        structureItemRows.filter(
          (row) => sameTenant(row) && row.active !== false,
        ),
      );
      setAssessmentEntries(
        entryRows.filter(
          (row: any) => sameTenant(row) && !row.isDeleted &&
            (!row.classSubjectId || allowedSubjectIds.has(idOf(row.classSubjectId))) &&
            (!row.classId || assignedClassIds.has(idOf(row.classId))) &&
            (!row.studentId || assignedStudentIds.has(idOf(row.studentId))),
        ),
      );
      setGradingStructures(
        gradingRows.filter((row) => sameTenant(row) && row.active !== false),
      );
      setGradeRules(
        ruleRows.filter((row) => sameTenant(row) && row.active !== false),
      );
      setAttendance(
        attendanceRows.filter(
          (row: any) => sameTenant(row) && !row.isDeleted &&
            (!row.classId || assignedClassIds.has(idOf(row.classId))) &&
            (!row.studentId || assignedStudentIds.has(idOf(row.studentId))),
        ),
      );
      setStudentAttendanceSummaries(
        (studentAttendanceSummaryRows as StudentAttendanceSummary[]).filter((r: any) =>
          sameTenant(r) &&
          (!r.classId || assignedClassIds.has(idOf(r.classId))) &&
          (!r.studentId || assignedStudentIds.has(idOf(r.studentId)))),
      );
      setComputedResults(
        computedRows.filter(
          (row: any) => sameTenant(row) && !row.isDeleted &&
            (!row.classSubjectId || allowedSubjectIds.has(idOf(row.classSubjectId))) &&
            (!row.classId || assignedClassIds.has(idOf(row.classId))) &&
            (!row.studentId || assignedStudentIds.has(idOf(row.studentId))),
        ),
      );
      setReportCards(scopedReportCardsForBranch);

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
      setReportCardTemplates(scopedReportCardTemplates);
      setReportCardTemplateSettings(scopedReportCardTemplateSettings);
      setReportCardTemplateAssignments(scopedReportCardTemplateAssignments);
      setLoadedScopeWorkspace(teacherWorkspaceKey);
    } catch (error) {
      console.error("Failed to load report data:", error);
      clearState();
      setLoadedScopeWorkspace("");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    dataRevision,
    teacherAccess.ready,
    teacherAccess.permitted,
    teacherId,
  ]);

  // Select one *coherent* reporting scope rather than picking three unrelated
  // dropdown defaults. An active enrollment or a configured class subject can
  // establish the structure + period + class combination.
  const availableReportScopes = useMemo(() => {
    type Scope = { academicStructureId: string; academicPeriodId: string; classId: string };
    const byKey = new Map<string, Scope>();
    const structureIds = new Set(academicStructures.map((row) => idOf(row.id)));
    const classIds = new Set(classes.map((row) => idOf(row.id)));
    const periodById = new Map(academicPeriods.map((row) => [idOf(row.id), row]));

    const addScope = (structureId: unknown, periodId: unknown, classId: unknown) => {
      const sid = idOf(structureId);
      const pid = idOf(periodId);
      const cid = idOf(classId);
      if (!sid || !pid || !cid || !structureIds.has(sid) || !classIds.has(cid)) return;
      const period: any = periodById.get(pid);
      if (!period || (period.academicStructureId && idOf(period.academicStructureId) !== sid)) return;
      const scope: Scope = { academicStructureId: sid, academicPeriodId: pid, classId: cid };
      byKey.set(`${sid}:${pid}:${cid}`, scope);
    };

    studentEnrollments.forEach((row: any) => {
      if (row.isDeleted || row.status !== "active") return;
      addScope(row.academicStructureId, row.academicPeriodId, row.classId);
    });
    classSubjects.forEach((row: any) => {
      if (row.isDeleted || row.active === false) return;
      // A class subject without a period cannot establish a complete scope.
      addScope(row.academicStructureId, row.academicPeriodId, row.classId);
    });
    return [...byKey.values()];
  }, [academicStructures, academicPeriods, classes, studentEnrollments, classSubjects]);

  useEffect(() => {
    setFilters((prev) => prev.branchId === (branchId || undefined)
      ? prev
      : {
          ...prev, branchId: branchId || undefined,
          academicStructureId: undefined, academicPeriodId: undefined,
          classId: undefined, classSubjectId: undefined, studentId: undefined,
        });
  }, [branchId]);

  useEffect(() => {
    const workspaceKey = teacherWorkspaceKey;
    if (!accountId || !schoolId || !branchId || !teacherAccess.permitted ||
        loadedScopeWorkspace !== workspaceKey ||
        !availableReportScopes.length ||
        initialScopeAppliedRef.current === workspaceKey) return;
    // Apply a default only once per workspace. Later manual Clear must remain cleared.
    initialScopeAppliedRef.current = workspaceKey;
    const preferred = [...availableReportScopes].sort((a, b) =>
      Number(b.academicStructureId === currentAcademicStructureId && b.academicPeriodId === currentAcademicPeriodId) -
      Number(a.academicStructureId === currentAcademicStructureId && a.academicPeriodId === currentAcademicPeriodId) ||
      Number(b.academicStructureId === currentAcademicStructureId) - Number(a.academicStructureId === currentAcademicStructureId) ||
      Number(b.academicPeriodId === currentAcademicPeriodId) - Number(a.academicPeriodId === currentAcademicPeriodId)
    )[0];
    if (!preferred) return;
    setFilters((prev) => ({
      ...prev, branchId: branchId || undefined,
      academicStructureId: preferred.academicStructureId,
      academicPeriodId: preferred.academicPeriodId,
      classId: preferred.classId,
      classSubjectId: undefined,
      studentId: undefined,
    }));
  }, [teacherWorkspaceKey, accountId, schoolId, branchId, teacherAccess.permitted,
      availableReportScopes, loadedScopeWorkspace,
      currentAcademicStructureId, currentAcademicPeriodId]);


  // All three selections are required, and their existing records must match.
  // A manual complete selection is allowed even before any assessments are entered.
  const hasCompleteReportScope = Boolean(
    teacherAccess.permitted && teacherAccess.ready &&
    loadedScopeWorkspace === teacherWorkspaceKey &&
    filters.academicStructureId && filters.academicPeriodId && filters.classId &&
    academicStructures.some((row) => idOf(row.id) === idOf(filters.academicStructureId)) &&
    classes.some((row) => idOf(row.id) === idOf(filters.classId)) &&
    teacherAccess.allowedClassIds.has(idOf(filters.classId)) &&
    academicPeriods.some((row: any) =>
      idOf(row.id) === idOf(filters.academicPeriodId) &&
      (!row.academicStructureId || idOf(row.academicStructureId) === idOf(filters.academicStructureId)))
  );

  const selectablePeriods = useMemo(() => academicPeriods.filter((row: any) =>
    !filters.academicStructureId || !row.academicStructureId ||
    idOf(row.academicStructureId) === idOf(filters.academicStructureId)),
    [academicPeriods, filters.academicStructureId]);

  const lockedBranches = useMemo(() => {
    return activeBranch && idOf(activeBranch.id) === branchId
      ? [activeBranch]
      : branches;
  }, [activeBranch, branchId, branches]);

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

    if (!filters.academicStructureId && !filters.academicPeriodId)
      return classes;
    return classes.filter((row) => !!idOf(row.id) && allowedClassIds.has(idOf(row.id)));
  }, [
    classes,
    studentEnrollments,
    classSubjects,
    filters.academicStructureId,
    filters.academicPeriodId,
  ]);

  useEffect(() => {
    if (
      filters.classId &&
      !classes.some((row: any) => idOf(row.id) === idOf(filters.classId))
    ) {
      setFilters((prev) => ({
        ...prev,
        classId: undefined,
        classSubjectId: undefined,
        studentId: undefined,
      }));
    }
  }, [classes, filters.classId]);

  const filteredClassSubjects = useMemo(() => {
    return classSubjects.filter((row) => {
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
      gradingStructures,
      gradeRules,
      attendance,
      studentAttendanceSummaries,
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
      gradingStructures,
      gradeRules,
      attendance,
      studentAttendanceSummaries,
      computedResults,
      reportCards,
      reportCardItems,
    ],
  );

  const output = useMemo(
    () => hasCompleteReportScope
      ? buildReportEngineOutput(dataset, filters)
      : { classReports: [], studentReport: undefined, warnings: [] },
    [dataset, filters, hasCompleteReportScope],
  );

  const hasCoreSetup = Boolean(
    academicStructures.length &&
      academicPeriods.length &&
      classes.length &&
      students.length,
  );

  const reportBranch = useMemo(() => {
    return (
      branches.find((branch: any) => idOf(branch.id) === branchId) ||
      lockedBranches.find((branch: any) => idOf(branch.id) === branchId) ||
      activeBranch ||
      branches[0] ||
      lockedBranches[0]
    );
  }, [activeBranch, branchId, branches, lockedBranches]);

  const activeContextName = `${activeSchool?.name || schools[0]?.name || "Selected School"} · ${
    reportBranch?.name ||
    activeBranch?.name ||
    branches[0]?.name ||
    "Selected Branch"
  }`;

  const selectedClassName = labelOf(classes, filters.classId);
  const selectedPeriodName = labelOf(academicPeriods, filters.academicPeriodId);
  const selectedStructureName = labelOf(
    academicStructures,
    filters.academicStructureId,
  );

  const searchTerm = search.trim().toLowerCase();

  const visibleStudents = useMemo(() => {
    if (!searchTerm) return filteredStudents;

    return filteredStudents.filter((student: any) =>
      `${student.fullName || student.name || ""} ${student.admissionNumber || ""} ${student.gender || ""}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [filteredStudents, searchTerm]);

  const visibleClasses = useMemo(() => {
    if (!searchTerm) return filteredClasses;

    return filteredClasses.filter((item: any) =>
      `${item.name || ""} ${item.code || ""}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [filteredClasses, searchTerm]);

  const activeFilterCount = useMemo(() => {
    return [
      filters.academicStructureId,
      filters.academicPeriodId,
      filters.classId,
      filters.classSubjectId,
      filters.studentId,
      filters.sortMode && filters.sortMode !== "position"
        ? filters.sortMode
        : undefined,
      mode !== "student-report" ? mode : undefined,
    ].filter(Boolean).length;
  }, [
    filters.academicStructureId,
    filters.academicPeriodId,
    filters.classId,
    filters.classSubjectId,
    filters.studentId,
    filters.sortMode,
    mode,
  ]);

  const selectedStudentName = labelOf(students, filters.studentId);
  const selectedClassSubjectName = labelOf(
    filteredClassSubjects.map((row: any) => ({
      id: row.id,
      name: subjectName(row, subjects),
    })),
    filters.classSubjectId,
  );

  const reportCardsToShow =
    mode === "class-reports"
      ? output.classReports.length
      : output.studentReport
        ? 1
        : 0;
  const warningCount = output.warnings.length;
  const canPrint =
    hasCompleteReportScope && hasCoreSetup &&
    (mode === "class-reports"
      ? output.classReports.length > 0
      : Boolean(output.studentReport));

  const triggerReportPrint = () => {
    if (!canPrint) return;

    printReportTarget({
      targetId: STUDENT_REPORT_PRINT_ZONE_ID,
      mode: mode === "class-reports" ? "whole-class-reports" : "single-student",
      orientation: "portrait",
      pageSize: "A4",
    });
  };

  const activeReportTemplateAssignment = useMemo(() => {
    const studentAssignments = reportCardTemplateAssignments.filter(
      (row: any) => row.active !== false && isStudentReportRecord(row),
    );

    return (
      studentAssignments.find(
        (row: any) =>
          row.isDefault === true &&
          (!row.scopeType || row.scopeType === "branch") &&
          (!row.scopeId ||
            String(row.scopeId ?? "") === String(branchId ?? "")),
      ) ||
      studentAssignments.find(
        (row: any) =>
          (!row.scopeType || row.scopeType === "branch") &&
          (!row.scopeId ||
            String(row.scopeId ?? "") === String(branchId ?? "")),
      ) ||
      studentAssignments.find((row: any) => row.isDefault === true) ||
      studentAssignments[0] ||
      null
    );
  }, [reportCardTemplateAssignments, branchId]);

  const activeReportTemplate = useMemo(() => {
    const assignedTemplateId = idOf(activeReportTemplateAssignment?.templateId);

    return (
      reportCardTemplates.find(
        (row: any) => assignedTemplateId && idOf(row.id) === assignedTemplateId,
      ) ||
      reportCardTemplates.find((row: any) => row.isDefault) ||
      reportCardTemplates.find(
        (row: any) => String(row.code || "") === "classic_formal",
      ) ||
      reportCardTemplates[0] ||
      normalizeStudentReportTemplateDefinition(null)
    );
  }, [activeReportTemplateAssignment, reportCardTemplates]);

  const activeReportTemplateSettingsRow = useMemo(() => {
    const assignedSettingsId = idOf(
      activeReportTemplateAssignment?.templateSettingsId,
    );
    const activeTemplateId = idOf(activeReportTemplate?.id);

    return (
      reportCardTemplateSettings.find(
        (row: any) => assignedSettingsId && idOf(row.id) === assignedSettingsId,
      ) ||
      reportCardTemplateSettings.find(
        (row: any) =>
          activeTemplateId && idOf(row.templateId) === activeTemplateId,
      ) ||
      reportCardTemplateSettings.find((row: any) => row.active !== false) ||
      null
    );
  }, [
    activeReportTemplateAssignment,
    activeReportTemplate,
    reportCardTemplateSettings,
  ]);

  const activeReportTemplateSettings =
    useMemo<StudentReportTemplateSettings>(() => {
      return mergeStudentReportTemplateSettings(
        {
          ...DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
          ...(activeReportTemplateSettingsRow || {}),
        },
        activeReportTemplate || null,
        activeReportTemplateAssignment || null,
      );
    }, [
      activeReportTemplate,
      activeReportTemplateAssignment,
      activeReportTemplateSettingsRow,
    ]);

  function studentForReport(reportDataset: Record<string, any> | undefined) {
    const reportStudentId = idOf(
      reportDataset?.report?.studentId || reportDataset?.studentId,
    );
    if (!reportStudentId) return undefined;

    return students.find(
      (student: any) => idOf(student.id) === reportStudentId,
    );
  }

  function studentPhotoForReport(
    reportDataset: Record<string, any> | undefined,
  ) {
    const matchedStudent = studentForReport(reportDataset) as any;

    return (
      matchedStudent?.resolvedStudentPhotoUrl ||
      matchedStudent?.photo ||
      (reportDataset as any)?.report?.resolvedStudentPhotoUrl ||
      (reportDataset as any)?.report?.studentPhoto ||
      ""
    );
  }

  function withBranchContext<T extends Record<string, any>>(
    reportDataset: T | undefined,
    branch?: Branch,
  ): T | undefined {
    if (!reportDataset) return reportDataset;

    const branchName =
      (branch as any)?.name ||
      (branch as any)?.branchName ||
      (branch as any)?.campusName ||
      reportDataset.branchName ||
      reportDataset.branchLabel ||
      reportDataset.branch?.name ||
      "";

    const matchedStudent = studentForReport(reportDataset) as any;
    const matchedStudentPhoto = studentPhotoForReport(reportDataset);

    return {
      ...reportDataset,
      student: matchedStudent || (reportDataset as any).student,
      branch,
      branchId: (branch as any)?.id || reportDataset.branchId,
      branchName,
      branchLabel: branchName,
      template: activeReportTemplate,
      templateSettings: activeReportTemplateSettings,
      reportCardTemplate: activeReportTemplate,
      reportCardTemplateSettings: activeReportTemplateSettings,
      reportCardTemplateAssignment: activeReportTemplateAssignment,
      header: {
        ...(reportDataset as any).header,
        branch,
        branchId:
          (branch as any)?.id || (reportDataset as any).header?.branchId,
        branchName,
        branchLabel: branchName,
        template: activeReportTemplate,
        templateSettings: activeReportTemplateSettings,
        reportCardTemplate: activeReportTemplate,
        reportCardTemplateSettings: activeReportTemplateSettings,
        reportCardTemplateAssignment: activeReportTemplateAssignment,
        branding: {
          ...((reportDataset as any).header?.branding || {}),
          primaryColor:
            ((reportDataset as any).header?.branding || {}).primaryColor ||
            "var(--ba-primary, var(--primary-color, #2563eb))",
          branchName:
            ((reportDataset as any).header?.branding || {}).branchName ||
            branchName,
          logo:
            ((reportDataset as any).header?.branding || {}).logo ||
            (reportDataset as any).header?.schoolBranchSetting?.logo ||
            (reportDataset as any).header?.branch?.logo ||
            (reportDataset as any).header?.school?.logo,
          reportCardBackgroundImage:
            ((reportDataset as any).header?.branding || {})
              .reportCardBackgroundImage ||
            (reportDataset as any).header?.schoolBranchSetting
              ?.reportCardBackgroundImage,
          reportCardWatermark:
            ((reportDataset as any).header?.branding || {})
              .reportCardWatermark ||
            (reportDataset as any).header?.schoolBranchSetting
              ?.reportCardWatermark,
          reportCardSignatureImage:
            ((reportDataset as any).header?.branding || {})
              .reportCardSignatureImage ||
            (reportDataset as any).header?.schoolBranchSetting
              ?.reportCardSignatureImage,
        },
      },
      report: {
        ...(reportDataset as any).report,
        studentPhoto:
          matchedStudentPhoto || (reportDataset as any).report?.studentPhoto,
        resolvedStudentPhotoUrl:
          matchedStudentPhoto ||
          (reportDataset as any).report?.resolvedStudentPhotoUrl,
        branch,
        branchId:
          (branch as any)?.id || (reportDataset as any).report?.branchId,
        branchName,
        branchLabel: branchName,
        template: activeReportTemplate,
        templateSettings: activeReportTemplateSettings,
        reportCardTemplate: activeReportTemplate,
        reportCardTemplateSettings: activeReportTemplateSettings,
        reportCardTemplateAssignment: activeReportTemplateAssignment,
      },
    };
  }

  // Shared Teacher Reports toolbar: matches Branch Admin without exposing admin actions.
  useRegisterBranchWorkspaceToolbar("reportsWorkspace", {
    // Report Cards are read-only; no Add action is registered.
    search: setSearch,
    filter: () => setFilterOpen(true),
    print: () => triggerReportPrint(),
    more: () => setMoreOpen(true),
  });

  const renderActiveReport = () => {
    // Never display a template or a placeholder card without the complete scope.
    if (!hasCompleteReportScope || !hasCoreSetup) return null;

    if (mode === "class-reports") {
      return output.classReports.length ? (
        output.classReports.map((reportDataset, index) => (
          <TemplateAwareStudentReportCard
            key={reportDataset.report?.studentId || index}
            dataset={
              withBranchContext(reportDataset as any, reportBranch) as any
            }
            template={activeReportTemplate}
            settings={activeReportTemplateSettings}
            compact
            mobilePreview={false}
            pageBreakAfter={index < output.classReports.length - 1}
          />
        ))
      ) : null;
    }

    if (!output.studentReport) return null;
    return (
      <TemplateAwareStudentReportCard
        dataset={
          withBranchContext(output.studentReport as any, reportBranch) as any
        }
        template={activeReportTemplate}
        settings={activeReportTemplateSettings}
        mobilePreview={false}
        pageBreakAfter={false}
      />
    );
  };

  if (accountLoading || contextLoading || settingsLoading || !teacherAccess.ready || pageLoading) {
    return (
      <State
        primary={primary}
        title="Opening Teacher Report Cards..."
        text="Checking branch students, classes, reports, results, attendance and report templates."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before opening student reports."
      />
    );
  }

  if (!teacherAccess.permitted) {
    return <State primary={primary} title="Teacher workspace required"
      text="Open an assigned teacher membership to view report cards." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={
          {
            "--ba-primary": primary,
            "--primary-color": primary,
          } as React.CSSProperties
        }
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Branch workspace required</h2>
          <p>
            Teacher report cards are limited to your selected school branch.
            Choose your teacher workspace if the wrong branch is active.
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
      style={
        {
          "--ba-primary": primary,
          "--primary-color": primary,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>

      {!classes.length ? (
        <section className="ba-v6-scope-picker report-no-print" aria-label="No assigned classes">
          <p>No assigned classes are available for Report Cards in this branch.
             Ask your school administrator to assign you as a subject teacher or class teacher.</p>
        </section>
      ) : !hasCompleteReportScope && (
        <section className="ba-v6-scope-picker report-no-print" aria-label="Select reporting context">
          <label>
            <span>Academic structure</span>
            <select value={filters.academicStructureId || ""} onChange={(event) =>
              setFilters((prev) => ({ ...prev,
                academicStructureId: event.target.value || undefined,
                academicPeriodId: undefined, classId: undefined,
                classSubjectId: undefined, studentId: undefined }))}>
              <option value="">Structure</option>
              {academicStructures.map((row: any) =>
                <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}
            </select>
          </label>
          <label>
            <span>Academic period</span>
            <select value={filters.academicPeriodId || ""} onChange={(event) =>
              setFilters((prev) => ({ ...prev,
                academicPeriodId: event.target.value || undefined,
                classId: undefined, classSubjectId: undefined, studentId: undefined }))}>
              <option value="">Period</option>
              {selectablePeriods.map((row: any) =>
                <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}
            </select>
          </label>
          <label>
            <span>Class</span>
            <select value={filters.classId || ""} onChange={(event) =>
              setFilters((prev) => ({ ...prev, classId: event.target.value || undefined,
                classSubjectId: undefined, studentId: undefined }))}>
              <option value="">Class</option>
              {filteredClasses.map((row: any) =>
                <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}
            </select>
          </label>
        </section>
      )}
      {hasCompleteReportScope && (
        <section className="ba-print-card">
          <BranchReportPreview printZoneId={STUDENT_REPORT_PRINT_ZONE_ID} naturalWidth={794}>
          {renderActiveReport()}
        </BranchReportPreview>
        </section>
      )}

      {filterOpen && (
        <BranchViewportPortal themeSourceClass=".student-reports-page" onEscape={() => setFilterOpen(false)}>
        <FilterSheet
          mode={mode}
          filters={filters}
          academicStructures={academicStructures}
          academicPeriods={selectablePeriods}
          filteredClasses={visibleClasses}
          filteredClassSubjects={filteredClassSubjects}
          filteredStudents={visibleStudents}
          setMode={setMode}
          setFilters={setFilters}
          search={search}
          setSearch={setSearch}
          onClose={() => setFilterOpen(false)}
        />
        </BranchViewportPortal>
      )}

      {moreOpen && (
        <BranchViewportPortal themeSourceClass=".student-reports-page" onEscape={() => setMoreOpen(false)}>
        <MoreSheet
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onPrint={() => {
            setMoreOpen(false);
            triggerReportPrint();
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
      style={
        {
          "--ba-primary": primary,
          "--primary-color": primary,
        } as React.CSSProperties
      }
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

function subjectName(row: ClassSubject, subjects: Subject[]) {
  const subject = subjects.find(
    (item: any) => item.id === (row as any).subjectId,
  ) as any;
  return (
    (row as any).name ||
    subject?.name ||
    `Subject ${(row as any).subjectId || ""}`
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
  filteredStudents,
  setMode,
  setFilters,
  search,
  setSearch,
  onClose,
}: {
  mode: ReportMode;
  filters: ReportFiltersState;
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  filteredClasses: Class[];
  filteredClassSubjects: ClassSubject[];
  filteredStudents: Student[];
  setMode: (mode: ReportMode) => void;
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
              Select an assigned class and its academic period to generate report cards.
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
            <span>Report Mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as ReportMode)}
            >
              <option value="student-report">Single Student Report</option>
              <option value="class-reports">Class Batch Reports</option>
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
                  studentId: undefined,
                }))
              }
            >
              <option value="">Select assigned class</option>
              {filteredClasses.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

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
              <option value="">All subjects</option>
              {filteredClassSubjects.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name || `Subject ${item.subjectId || ""}`}
                </option>
              ))}
            </select>
          </label>

          {mode === "student-report" && (
            <label>
              <span>Student</span>
              <select
                value={filters.studentId || ""}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    studentId:
                      cleanId(event.target.value) || undefined,
                  }))
                }
              >
                <option value="">Select student</option>
                {filteredStudents.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName || item.name}
                  </option>
                ))}
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
  onRefresh,
  onPrint,
  onClose,
}: {
  onRefresh: () => void | Promise<void>;
  onPrint: () => void;
  onClose: () => void;
}) {
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
            <p>Quick report actions only.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={onPrint}>
            <span>⎙</span>
            <b>Print report</b>
            <small>Print the current preview output</small>
          </button>

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch report records</small>
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

.ba-add-inline:disabled {
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

/* Student Reports golden additions */

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


/* Role-portal modal/sheet containment -------------------------------- */
@media (min-width:980px){
  .ba-sheet-backdrop,
  .ba-modal-backdrop{
    position:fixed;
    top:var(--eds-shell-top-offset,0px) !important;
    right:0 !important;
    bottom:0 !important;
    left:var(--portal-content-left,0px) !important;
    inset:auto 0 0 var(--portal-content-left,0px) !important;
    width:auto;
    height:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }

  .ba-sheet,
  .ba-modal{
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
.student-reports-page .ba-print-card {margin:0; padding:5px; border-radius:13px;
  border:1px solid color-mix(in srgb,var(--border,#d4dae3) 85%,var(--text,#182235) 15%);
  background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%);box-shadow:none;}
/* Printed report templates are intentionally NOT restyled; only the preview frame changes. */
.student-reports-page .ba-print-zone {border-radius:10px;}
.ba-v6-scope-picker {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;align-items:end;
  padding:8px;border:1px solid var(--border,#d4dae3);border-radius:12px;
  background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%);}
.ba-v6-scope-picker label {min-width:0;display:grid;gap:4px;}
.ba-v6-scope-picker label span {font-size:10px;color:var(--muted,#64748b);font-weight:700;}
.ba-v6-scope-picker select {width:100%;min-width:0;min-height:38px;padding:0 8px;border-radius:9px;
  background:var(--input-bg,var(--surface,#fff));border:1px solid var(--border,#d4dae3);
  color:var(--text,#182235);font-size:12px;}
@media(max-width:639px){.student-reports-page {padding:3px;}.ba-v6-scope-picker {grid-template-columns:1fr;}}
@media print {.ba-v6-scope-picker{display:none!important;}}


/* V14: printable document uses the full available preview canvas, without a chrome/header card. */
.ba-page.student-reports-page { width:100%; max-width:none; padding:0; margin:0; overflow:visible; }
.ba-page.student-reports-page > .ba-print-card { width:100%; max-width:none; min-width:0;
  padding:0!important; margin:0!important; border:0!important; border-radius:0!important;
  background:transparent!important; box-shadow:none!important; overflow:visible!important; }
.ba-page.student-reports-page .ba-fit-viewport { width:100%; max-width:100%; }
.ba-page.student-reports-page .ba-print-head, .ba-page.student-reports-page .ba-report-toolbar { display:none!important; }
@media print { .ba-page.student-reports-page .ba-fit-viewport { max-height:none!important; overflow:visible!important; } }
`;
