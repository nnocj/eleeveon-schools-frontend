"use client";

/**
 * app/branch-admin/modules/CumulativeRecords.tsx
 * ---------------------------------------------------------
 * BRANCH ADMIN — CUMULATIVE RECORDS ENGINE
 * ---------------------------------------------------------
 *
 * Historical reporting engine for:
 * - student cumulative transcripts
 * - multi-period reports
 * - annual cumulative broadsheets
 * - subject longitudinal history
 * - promotion summaries
 * - student progression timelines
 *
 * Source of truth:
 * StudentReportSnapshot + StudentPromotion
 *
 * Production rules:
 * - Signed-in account required.
 * - Active assigned school + branch required.
 * - All reads are locked to the selected workspace school + branch.
 * - Print zone can remain A4-sized, but screen view is wrapped safely.
 * - Dashboard-shell safe: no horizontal page overflow.
 *
 * Workspace-source fix:
 * - mirrors reports/StudentReports.tsx workspace resolution
 * - reads eleeveon_open_workspace first, then active membership, then active branch/settings
 * - uses tolerant local-id matching so numeric IDs stored as strings still match
 * - filter options are loaded from live setup rows plus historical snapshots/promotions
 * - prevents empty filter selectors caused by strict account/school/branch matching
 *
 * Media asset header update:
 * - resolves cumulative report header logos from mediaAssets/mediaBlobs
 * - prefers active owner-bound media over legacy string image fields
 * - prevents removed/deleted branch-setting logos from reappearing on cumulative outputs
 * - passes resolved logo URLs into the shared ReportHeader contract
 *
 * Phase 6 template integration:
 * - reads the same reportCardTemplates, reportCardTemplateSettings and
 *   reportCardTemplateAssignments records saved from Branch Settings
 * - resolves reportType="cumulative_book" to the selected student-report
 *   template style, then renders a full report book from saved snapshots
 * - resolves reportType="cumulative_transcript" to transcript-only templates
 * - falls back to built-in template registries when the branch has not saved
 *   database rows yet, so preview/rendering still works immediately
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Branch,
  Class,
  Parent,
  School,
  SchoolBranchSetting,
  Student,
  StudentParent,
  StudentPromotion,
  StudentReportSnapshot,
  Subject,
  Teacher,
} from "../../lib/db/db";

import {
  MediaOwners,
  MediaFieldKeys,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  revokeMediaObjectUrl,
} from "../../lib/media/mediaAssetUtils";

import CumulativeReportBook from "./reports/components/CumulativeReportBook";
import CumulativeTranscriptCard from "./reports/components/CumulativeTranscriptCard";
import { STUDENT_REPORT_TEMPLATE_REGISTRY } from "./reports/student-report-templates";
import { CUMULATIVE_TRANSCRIPT_TEMPLATE_REGISTRY } from "./reports/cumulative-transcript-templates";
import AnnualBroadsheet from "./reports/components/AnnualBroadsheet";
import PromotionSummary from "./reports/components/PromotionSummary";
import StudentProgressionTimeline from "./reports/components/StudentProgressionTimeline";
import ReportHeader from "./reports/components/ReportHeader";

import {
  buildCumulativeReportEngineOutput,
  buildStudentTranscript,
} from "./reports/engine/cumulative-report-engine";

import type {
  CumulativeReportEngineDataset,
  CumulativeReportFiltersState,
} from "./reports/engine/cumulative-report-types";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
};

type SchoolRow = {
  accountId?: string | null;
  id?: number | string | null;
  isDeleted?: boolean;
};

type BranchRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  id?: number | string | null;
  isDeleted?: boolean;
};

type PrintOrientation = "portrait" | "landscape";

type ReportTemplateRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  name?: string;
  code?: string;
  templateCode?: string;
  layoutKey?: string;
  templateKey?: string;
  reportType?: string | null;
  orientation?: string;
  paperSize?: string;
  density?: string;
  active?: boolean;
  isDefault?: boolean;
  isDeleted?: boolean;
  [key: string]: any;
};

type ReportTemplateSettingsRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  templateId?: number | string | null;
  templateCode?: string;
  layoutKey?: string;
  templateKey?: string;
  templateName?: string;
  reportType?: string | null;
  active?: boolean;
  isDeleted?: boolean;
  [key: string]: any;
};

type ReportTemplateAssignmentRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  templateId?: number | string | null;
  templateSettingsId?: number | string | null;
  templateCode?: string;
  layoutKey?: string;
  templateKey?: string;
  reportType?: string | null;
  scopeType?: string | null;
  scopeId?: number | string | null;
  active?: boolean;
  isDefault?: boolean;
  isDeleted?: boolean;
  [key: string]: any;
};

function normalizeTemplateRegistryRow(
  item: any,
  index: number,
  reportType: "student_report" | "cumulative_transcript",
): ReportTemplateRow {
  const code = String(item.code || item.templateCode || item.layoutKey || item.key || "").trim();

  return {
    name:
      item.name ||
      item.templateName ||
      (reportType === "cumulative_transcript"
        ? "Cumulative Transcript Classic"
        : "Classic Formal"),
    code: code || (reportType === "cumulative_transcript" ? "cumulative_transcript_classic" : "classic_formal"),
    templateCode: code || (reportType === "cumulative_transcript" ? "cumulative_transcript_classic" : "classic_formal"),
    layoutKey: item.layoutKey || code || (reportType === "cumulative_transcript" ? "cumulative_transcript_classic" : "classic_formal"),
    templateKey: item.templateKey || item.layoutKey || code,
    reportType,
    orientation: item.orientation || "portrait",
    paperSize: item.paperSize || "A4",
    density: item.density || "compact",
    description: item.description || "Built-in report template.",
    active: item.active !== false,
    isDefault: item.isDefault === true || index === 0,
  };
}

function builtInReportTemplateRows(): ReportTemplateRow[] {
  return [
    ...(STUDENT_REPORT_TEMPLATE_REGISTRY as any[]).map((item, index) =>
      normalizeTemplateRegistryRow(item, index, "student_report"),
    ),
    ...(CUMULATIVE_TRANSCRIPT_TEMPLATE_REGISTRY as any[]).map((item, index) =>
      normalizeTemplateRegistryRow(item, index, "cumulative_transcript"),
    ),
  ];
}

function reportTemplateMapKey(row: Partial<ReportTemplateRow>) {
  const reportType = String(row.reportType || "student_report").trim();
  const code = String(row.code || row.templateCode || row.layoutKey || row.templateKey || row.name || row.id || "").trim();
  return `${reportType}:${code}`;
}

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const CUMULATIVE_MEDIA_OWNER_SCHOOLS = String(
  (MediaOwners as any).SCHOOLS || "schools",
);
const CUMULATIVE_MEDIA_OWNER_BRANCHES = String(
  (MediaOwners as any).BRANCHES || "branches",
);
const CUMULATIVE_MEDIA_OWNER_SETTINGS = String(
  (MediaOwners as any).SCHOOL_BRANCH_SETTINGS ||
    (MediaOwners as any).SCHOOL_BRANCHES_SETTINGS ||
    "schoolBranchSettings",
);
const CUMULATIVE_MEDIA_OWNER_STUDENTS = String(
  (MediaOwners as any).STUDENTS || "students",
);

const CUMULATIVE_FIELD_LOGO = String((MediaFieldKeys as any).LOGO || "logo");
const CUMULATIVE_FIELD_PHOTO = String((MediaFieldKeys as any).PHOTO || "photo");

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

function firstMediaText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
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

// ======================================================
// PRINT TOOL
// ======================================================

function applyCumulativePrintStyles(
  targetId: string,
  orientation: PrintOrientation,
) {
  const existing = document.getElementById("cumulative-report-print-style");

  if (existing) existing.remove();

  const style = document.createElement("style");
  style.id = "cumulative-report-print-style";

  style.innerHTML = `
    @page {
      size: A4 ${orientation};
      margin: 10mm;
    }

    @media print {
      body {
        background: #ffffff !important;
      }

      body * {
        visibility: hidden !important;
      }

      #${targetId},
      #${targetId} * {
        visibility: visible !important;
      }

      #${targetId} {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: #fff;
        overflow: visible !important;
      }

      .report-no-print {
        display: none !important;
      }

      .report-screen-scroll {
        overflow: visible !important;
      }

      .report-page-break {
        page-break-after: always;
      }

      .report-page-break:last-child {
        page-break-after: auto;
      }

      tr,
      td,
      th {
        page-break-inside: avoid !important;
      }
    }
  `;

  document.head.appendChild(style);
}

// ======================================================
// SMALL HELPERS
// ======================================================

const formatNumber = (value?: number, decimals = 1) => {
  if (value == null || Number.isNaN(value)) return "0";
  return Number(value).toFixed(decimals);
};

const trendLabel = (trend?: string) => {
  if (trend === "up") return "Improving";
  if (trend === "down") return "Declining";
  if (trend === "stable") return "Stable";
  return "-";
};

const modeLabels: Record<string, string> = {
  "student-transcript": "Cumulative Transcript",
  "cumulative-book": "Cumulative Report Book",
  "multi-period-report": "Multi-Period Report",
  "annual-broadsheet": "Annual Broadsheet",
  "subject-history": "Subject History",
  "promotion-summary": "Promotion Summary",
  "progression-timeline": "Progression Timeline",
};

const printOrientationForMode = (
  mode: CumulativeReportFiltersState["mode"] | string,
): PrintOrientation =>
  mode === "annual-broadsheet" ||
  mode === "subject-history" ||
  mode === "promotion-summary"
    ? "landscape"
    : "portrait";

function labelOf<T extends { id?: number; name?: string; fullName?: string }>(
  rows: T[],
  id?: number,
) {
  if (!id) return "Not selected";
  const found = rows.find((row) => row.id === id);
  return found?.name || found?.fullName || "Not found";
}

function withCumulativeBranchContext<T extends Record<string, any>>(
  output: T,
  branch?: Branch,
): T {
  if (!output) return output;

  const header = (output as any).header || {};
  const headerBranding = header.branding || {};

  const branchName =
    (branch as any)?.name ||
    (branch as any)?.branchName ||
    (branch as any)?.campusName ||
    header.branchName ||
    header.branchLabel ||
    header.branch?.name ||
    headerBranding.branchName ||
    "";

  const branchAddress =
    (branch as any)?.address ||
    (branch as any)?.branchAddress ||
    header.branchAddress ||
    headerBranding.branchAddress ||
    "";

  return {
    ...output,
    header: {
      ...header,
      branch: branch || header.branch,
      branchId: (branch as any)?.id || header.branchId,
      branchName,
      branchLabel: branchName,
      campusName: branchName,
      branchAddress,
      branding: {
        ...headerBranding,
        branchName: headerBranding.branchName || branchName,
        branchLabel: headerBranding.branchLabel || branchName,
        campusName: headerBranding.campusName || branchName,
        branchAddress: headerBranding.branchAddress || branchAddress,
        resolvedLogoUrl:
          headerBranding.resolvedLogoUrl ||
          headerBranding.logo ||
          header.schoolBranchSetting?.logo ||
          header.branch?.logo ||
          header.school?.logo ||
          "",
        logo:
          headerBranding.logo ||
          headerBranding.resolvedLogoUrl ||
          header.schoolBranchSetting?.logo ||
          header.branch?.logo ||
          header.school?.logo ||
          "",
        primaryColor:
          headerBranding.primaryColor ||
          "var(--ba-primary, var(--primary-color, #2563eb))",
      },
    },
  };
}

function idOf(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sameId(a: unknown, b: unknown) {
  const left = idOf(a);
  const right = idOf(b);
  return left > 0 && right > 0 && left === right;
}

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
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
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
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
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

function accountMatches(rowAccountId: unknown, accountId?: string | null) {
  if (!accountId) return true;
  if (!rowAccountId) return true;
  return rowAccountId === accountId;
}

function rowIsActive(row: {
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
}) {
  return !row.isDeleted && row.active !== false && row.status !== "withdrawn";
}

function templateCodeOf(
  row?: Partial<
    ReportTemplateRow | ReportTemplateSettingsRow | ReportTemplateAssignmentRow
  > | null,
) {
  return String(
    row?.code || row?.templateCode || row?.layoutKey || row?.templateKey || "",
  ).trim();
}

function rowReportType(row?: { reportType?: string | null } | null) {
  return String(row?.reportType || "student_report").trim();
}

function isUsableTemplateRow(row: { isDeleted?: boolean; active?: boolean }) {
  return !row.isDeleted && row.active !== false;
}

function templateTenantMatches(
  row: TenantRow,
  accountId?: string | null,
  schoolId?: number,
  branchId?: number,
) {
  return (
    accountMatches(row.accountId, accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted
  );
}

function firstTemplateByReportType(
  templates: ReportTemplateRow[],
  reportType: "student_report" | "cumulative_book" | "cumulative_transcript",
) {
  const scoped = templates.filter(
    (row) => isUsableTemplateRow(row) && rowReportType(row) === reportType,
  );
  return scoped.find((row) => row.isDefault) || scoped[0];
}

function assignmentForReportType(
  assignments: ReportTemplateAssignmentRow[],
  reportType: "student_report" | "cumulative_book" | "cumulative_transcript",
  branchId?: number,
) {
  const scoped = assignments.filter((row) => {
    if (!isUsableTemplateRow(row)) return false;
    if (rowReportType(row) !== reportType) return false;
    if (row.scopeType && row.scopeType !== "branch") return false;
    if (row.scopeId && branchId && !sameId(row.scopeId, branchId)) return false;
    return true;
  });

  return scoped.find((row) => row.isDefault) || scoped[0];
}

function templateFromAssignment(
  templates: ReportTemplateRow[],
  assignment?: ReportTemplateAssignmentRow,
) {
  if (!assignment) return undefined;

  const templateId = idOf(assignment.templateId);
  const code = templateCodeOf(assignment);

  return (
    templates.find(
      (row) =>
        templateId && idOf(row.id) === templateId && isUsableTemplateRow(row),
    ) ||
    templates.find(
      (row) => code && templateCodeOf(row) === code && isUsableTemplateRow(row),
    )
  );
}

function settingsFromAssignment(
  settingsRows: ReportTemplateSettingsRow[],
  assignment?: ReportTemplateAssignmentRow,
  template?: ReportTemplateRow,
  reportType?: string,
) {
  const settingsId = idOf(assignment?.templateSettingsId);
  const templateId = idOf(template?.id || assignment?.templateId);
  const code = templateCodeOf(template) || templateCodeOf(assignment);

  return (
    settingsRows.find(
      (row) =>
        settingsId && idOf(row.id) === settingsId && isUsableTemplateRow(row),
    ) ||
    settingsRows.find(
      (row) =>
        templateId &&
        idOf(row.templateId) === templateId &&
        isUsableTemplateRow(row),
    ) ||
    settingsRows.find(
      (row) =>
        code &&
        templateCodeOf(row) === code &&
        (!reportType || rowReportType(row) === reportType) &&
        isUsableTemplateRow(row),
    )
  );
}

function fallbackStudentTemplate(): ReportTemplateRow {
  return {
    name: "Classic Formal",
    code: "classic_formal",
    layoutKey: "classic_formal",
    templateKey: "classic_formal",
    reportType: "student_report",
    paperSize: "A4",
    orientation: "portrait",
    density: "compact",
    active: true,
    isDefault: true,
  };
}

function fallbackCumulativeTranscriptTemplate(): ReportTemplateRow {
  return {
    name: "Cumulative Transcript Classic",
    code: "cumulative_transcript_classic",
    layoutKey: "cumulative_transcript_classic",
    templateKey: "cumulative_transcript_classic",
    reportType: "cumulative_transcript",
    paperSize: "A4",
    orientation: "portrait",
    density: "compact",
    active: true,
    isDefault: true,
  };
}

function fallbackCumulativeTranscriptSettings(): ReportTemplateSettingsRow {
  return {
    templateCode: "cumulative_transcript_classic",
    layoutKey: "cumulative_transcript_classic",
    templateKey: "cumulative_transcript_classic",
    templateName: "Cumulative Transcript Classic",
    reportType: "cumulative_transcript",
    paperSize: "A4",
    orientation: "portrait",
    density: "compact",
    showAdmissionNumber: true,
    showGender: true,
    showClass: true,
    showAcademicStructure: true,
    showAcademicPeriod: true,
    showBranch: true,
    showTranscriptTermBreakdown: true,
    showTranscriptYearAverage: true,
    showTranscriptCumulativeAverage: true,
    showTranscriptCumulativePosition: true,
    showTranscriptGPAProgression: true,
    showTranscriptFinalRecommendation: true,
    showGeneratedDate: true,
    studentNameLabel: "Student",
    admissionNumberLabel: "Student ID",
    classLabel: "Programme / Class",
    academicPeriodLabel: "Academic Period",
    subjectLabel: "Course / Subject",
    averageLabel: "Average",
    gradeLabel: "Grade",
    gpaLabel: "GPA",
    generatedDateLabel: "Date Generated",
    footerText:
      "Official cumulative academic transcript generated by Eleeveon Schools.",
  };
}

function fallbackCumulativeBookSettings(
  templateSettings?: ReportTemplateSettingsRow,
): ReportTemplateSettingsRow {
  return {
    ...(templateSettings || {}),
    reportType: "cumulative_book",
    showBookFrontCover: templateSettings?.showBookFrontCover ?? true,
    showBookStudentProfilePage:
      templateSettings?.showBookStudentProfilePage ?? true,
    showBookAcademicJourneyPage:
      templateSettings?.showBookAcademicJourneyPage ?? true,
    showBookSummaryPage: templateSettings?.showBookSummaryPage ?? true,
    showBookBackCover: templateSettings?.showBookBackCover ?? true,
    bookTitleLabel:
      templateSettings?.bookTitleLabel || "Cumulative Academic Report Book",
    bookSubtitleLabel:
      templateSettings?.bookSubtitleLabel || "Complete Academic Journey",
    showGeneratedDate: templateSettings?.showGeneratedDate ?? true,
    generatedDateLabel: templateSettings?.generatedDateLabel || "Generated",
  };
}

function snapshotMatchesBookFilters(
  snapshot: StudentReportSnapshot,
  filters: CumulativeReportFiltersState,
  schoolId?: number,
  branchId?: number,
) {
  if (!filters.includeDeletedSnapshots && snapshot.isDeleted) return false;
  if (schoolId && !sameId(snapshot.schoolId, schoolId)) return false;
  if (branchId && !sameId(snapshot.branchId, branchId)) return false;
  if (
    filters.academicStructureId &&
    !sameId(snapshot.academicStructureId, filters.academicStructureId)
  )
    return false;
  if (
    filters.academicPeriodId &&
    !sameId(snapshot.academicPeriodId, filters.academicPeriodId)
  )
    return false;
  if (filters.classId && !sameId(snapshot.classId, filters.classId))
    return false;
  if (filters.studentId && !sameId(snapshot.studentId, filters.studentId))
    return false;
  if (
    filters.snapshotType !== "all" &&
    snapshot.snapshotType !== filters.snapshotType
  )
    return false;
  if (
    snapshot.snapshotType === "manual" &&
    filters.includeManualSnapshots === false
  )
    return false;
  if (
    snapshot.snapshotType === "terminal" &&
    filters.includeTerminalSnapshots === false
  )
    return false;
  if (
    snapshot.snapshotType === "promotion" &&
    filters.includePromotionRecords === false
  )
    return false;
  return true;
}

function studentReportDatasetFromSnapshot(
  snapshot: StudentReportSnapshot,
  header: any,
  studentRow?: Student,
) {
  const raw = (snapshot as any).reportData || {};
  const dataset =
    raw.dataset || raw.reportCardDataset || raw.studentReportDataset || raw;

  const report = dataset?.report || dataset || {};
  const datasetHeader = dataset?.header || {};
  const currentHeader = header || {};
  const datasetBranding = datasetHeader?.branding || {};
  const currentBranding = currentHeader?.branding || {};

  const logo = firstMediaText(
    currentBranding.logo,
    currentBranding.resolvedLogoUrl,
    currentHeader.schoolBranchSetting?.logo,
    currentHeader.branch?.logo,
    currentHeader.school?.logo,
    datasetBranding.logo,
    datasetBranding.resolvedLogoUrl,
    datasetHeader.schoolBranchSetting?.logo,
    datasetHeader.branch?.logo,
    datasetHeader.school?.logo,
  );

  const reportCardBackgroundImage = firstMediaText(
    currentBranding.reportCardBackgroundImage,
    currentHeader.schoolBranchSetting?.reportCardBackgroundImage,
    datasetBranding.reportCardBackgroundImage,
    datasetHeader.schoolBranchSetting?.reportCardBackgroundImage,
  );

  const reportCardWatermark = firstMediaText(
    currentBranding.reportCardWatermark,
    currentHeader.schoolBranchSetting?.reportCardWatermark,
    datasetBranding.reportCardWatermark,
    datasetHeader.schoolBranchSetting?.reportCardWatermark,
    logo,
  );

  const reportCardSignatureImage = firstMediaText(
    currentBranding.reportCardSignatureImage,
    currentHeader.schoolBranchSetting?.reportCardSignatureImage,
    datasetBranding.reportCardSignatureImage,
    datasetHeader.schoolBranchSetting?.reportCardSignatureImage,
  );

  const studentPhoto = firstMediaText(
    (studentRow as any)?.resolvedStudentPhotoUrl,
    (studentRow as any)?.photo,
    (studentRow as any)?.studentPhoto,
    dataset?.studentInfo?.studentPhoto,
    dataset?.studentInfo?.photo,
    dataset?.student?.resolvedStudentPhotoUrl,
    dataset?.student?.studentPhoto,
    dataset?.student?.photo,
    report?.resolvedStudentPhotoUrl,
    report?.studentPhoto,
  );

  return {
    ...dataset,
    generatedAt: dataset?.generatedAt || snapshot.createdAt || new Date().toISOString(),
    header: {
      ...currentHeader,
      ...datasetHeader,
      school: currentHeader.school || datasetHeader.school,
      branch: currentHeader.branch || datasetHeader.branch,
      schoolBranchSetting:
        currentHeader.schoolBranchSetting || datasetHeader.schoolBranchSetting,
      branding: {
        ...datasetBranding,
        ...currentBranding,
        logo,
        resolvedLogoUrl: logo,
        reportCardBackgroundImage,
        reportCardWatermark,
        reportCardSignatureImage,
      },
    },
    branding: {
      ...(dataset?.branding || {}),
      ...currentBranding,
      logo,
      resolvedLogoUrl: logo,
      reportCardBackgroundImage,
      reportCardWatermark,
      reportCardSignatureImage,
    },
    report: {
      ...report,
      studentId: report?.studentId || snapshot.studentId,
      studentPhoto,
      resolvedStudentPhotoUrl: studentPhoto,
    },
    student: {
      ...(studentRow || {}),
      ...(dataset?.student || {}),
      id: dataset?.student?.id || (studentRow as any)?.id || snapshot.studentId,
      name:
        dataset?.student?.name ||
        dataset?.student?.fullName ||
        (studentRow as any)?.fullName ||
        report?.studentName,
      fullName:
        dataset?.student?.fullName ||
        dataset?.student?.name ||
        (studentRow as any)?.fullName ||
        report?.studentName,
      admissionNumber:
        dataset?.student?.admissionNumber ||
        (studentRow as any)?.admissionNumber ||
        report?.admissionNumber,
      gender:
        dataset?.student?.gender || (studentRow as any)?.gender || report?.gender,
      photo: studentPhoto,
      studentPhoto,
      resolvedStudentPhotoUrl: studentPhoto,
    },
    studentInfo: {
      ...(dataset?.studentInfo || {}),
      studentPhoto,
      photo: studentPhoto,
    },
  };
}

// ======================================================
// COMPONENT
// ======================================================

export default function CumulativeRecordsPage() {
  const dataRevision = useDataRevision();

  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();

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

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  /**
   * The settings context can also return scoped appearance settings, so
   * currentAcademicStructureId is not guaranteed to already be a number.
   * Normalize it once before using it in the cumulative-report filters.
   */
  const currentAcademicStructureId =
    idOf(settings?.currentAcademicStructureId) || undefined;

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

  // ======================================================
  // SESSION STATE
  // ======================================================

  const { loading, setLoading } = useBackgroundLoader();
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [filters, setFilters] = useState<CumulativeReportFiltersState>({
    branchId: branchId || 0,
    academicStructureId: currentAcademicStructureId,
    academicPeriodId: undefined,
    fromAcademicPeriodId: undefined,
    toAcademicPeriodId: undefined,
    classId: undefined,
    studentId: undefined,
    subjectId: undefined,
    snapshotType: "all",
    decision: "all",
    mode: "student-transcript",
    sortMode: "position",
    groupingMode: "academic-structure",
    subjectAggregationMode: "average",
    includePromotionRecords: true,
    includeManualSnapshots: true,
    includeTerminalSnapshots: true,
    includeDeletedSnapshots: false,
  });

  // ======================================================
  // DB STATE
  // ======================================================

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
  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [studentReportSnapshots, setStudentReportSnapshots] = useState<
    StudentReportSnapshot[]
  >([]);
  const [studentPromotions, setStudentPromotions] = useState<
    StudentPromotion[]
  >([]);
  const [reportTemplates, setReportTemplates] = useState<ReportTemplateRow[]>(
    [],
  );
  const [reportTemplateSettingsRows, setReportTemplateSettingsRows] = useState<
    ReportTemplateSettingsRow[]
  >([]);
  const [reportTemplateAssignments, setReportTemplateAssignments] = useState<
    ReportTemplateAssignmentRow[]
  >([]);
  const [cumulativeMediaUrls, setCumulativeMediaUrls] = useState<string[]>([]);

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
      router.replace("/owner");
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

  useEffect(() => {
    return () => {
      cumulativeMediaUrls.forEach(revokeMediaObjectUrl);
    };
  }, [cumulativeMediaUrls]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    accountMatches(row.accountId, accountId) &&
    sameId(row.schoolId, schoolId) &&
    sameId(row.branchId, branchId) &&
    !row.isDeleted;

  const sameSchool = (row: TenantRow | SchoolRow) =>
    accountMatches(row.accountId, accountId) &&
    (sameId((row as any).schoolId, schoolId) ||
      sameId((row as any).id, schoolId)) &&
    !row.isDeleted;

  const sameBranch = (row: BranchRow) =>
    accountMatches(row.accountId, accountId) &&
    sameId(row.schoolId, schoolId) &&
    sameId(row.id, branchId) &&
    !row.isDeleted;

  const looseBranchTenant = (row: TenantRow) =>
    accountMatches(row.accountId, accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const clearData = () => {
    cumulativeMediaUrls.forEach(revokeMediaObjectUrl);
    setCumulativeMediaUrls([]);
    setSchools([]);
    setBranches([]);
    setSchoolBranchSettings([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setStudents([]);
    setParents([]);
    setStudentParents([]);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setStudentReportSnapshots([]);
    setStudentPromotions([]);
    setReportTemplates([]);
    setReportTemplateSettingsRows([]);
    setReportTemplateAssignments([]);
  };

  const resolveCumulativeMediaUrl = async ({
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

      if (
        ownedAsset?.id &&
        !(ownedAsset as any).isDeleted &&
        (ownedAsset as any).active !== false
      ) {
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
      (!localId ||
        String(fallbackAsset.ownerLocalId || "") === String(localId));

    if (!belongsToOwner) return "";

    const url = await getMediaObjectUrl(mediaId);
    if (url) nextUrls.push(url);
    return url || "";
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        schoolRows,
        branchRows,
        schoolBranchSettingRows,
        academicStructureRows,
        academicPeriodRows,
        studentRows,
        parentRows,
        studentParentRows,
        teacherRows,
        classRows,
        subjectRows,
        snapshotRows,
        promotionRows,
        reportTemplateRows,
        reportTemplateSettingsRowsData,
        reportTemplateAssignmentRows,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.schoolBranchSettings.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.students.toArray(),
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.studentReportSnapshots.toArray(),
        db.studentPromotions.toArray(),
        (db as any).reportCardTemplates?.toArray?.() || Promise.resolve([]),
        (db as any).reportCardTemplateSettings?.toArray?.() ||
          Promise.resolve([]),
        (db as any).reportCardTemplateAssignments?.toArray?.() ||
          Promise.resolve([]),
      ]);

      const scopedSchools = schoolRows.filter(sameSchool);
      const scopedBranches = branchRows.filter(sameBranch);
      const scopedSettings = schoolBranchSettingRows.filter(
        (row) => sameTenant(row) || looseBranchTenant(row),
      );
      const nextMediaUrls: string[] = [];

      const schoolsWithMedia = await Promise.all(
        scopedSchools.map(async (row: any) => ({
          ...row,
          logo:
            (await resolveCumulativeMediaUrl({
              ownerTable: CUMULATIVE_MEDIA_OWNER_SCHOOLS,
              ownerLocalId: row.id,
              ownerCloudId: row.cloudId,
              fieldKey: CUMULATIVE_FIELD_LOGO,
              fallbackMediaId: row.logoMediaId,
              nextUrls: nextMediaUrls,
            })) || fallbackMediaValue(row, "logo", "logoMediaId"),
        })),
      );

      const branchesWithMedia = await Promise.all(
        scopedBranches.map(async (row: any) => ({
          ...row,
          logo:
            (await resolveCumulativeMediaUrl({
              ownerTable: CUMULATIVE_MEDIA_OWNER_BRANCHES,
              ownerLocalId: row.id,
              ownerCloudId: row.cloudId,
              fieldKey: CUMULATIVE_FIELD_LOGO,
              fallbackMediaId: row.logoMediaId,
              nextUrls: nextMediaUrls,
            })) || fallbackMediaValue(row, "logo", "logoMediaId"),
        })),
      );

      const settingsWithMedia = await Promise.all(
        scopedSettings.map(async (row: any) => ({
          ...row,
          logo:
            (await resolveCumulativeMediaUrl({
              ownerTable: CUMULATIVE_MEDIA_OWNER_SETTINGS,
              ownerLocalId: row.id,
              ownerCloudId: row.cloudId,
              fieldKey: CUMULATIVE_FIELD_LOGO,
              fallbackMediaId: row.logoMediaId,
              nextUrls: nextMediaUrls,
            })) || fallbackMediaValue(row, "logo", "logoMediaId"),
        })),
      );

      cumulativeMediaUrls.forEach((url) => {
        if (!nextMediaUrls.includes(url)) revokeMediaObjectUrl(url);
      });
      setCumulativeMediaUrls(nextMediaUrls);

      const studentsWithMedia = await Promise.all(
        studentRows
          .filter((row) => looseBranchTenant(row) && rowIsActive(row))
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
          .map(async (row: any) => {
            const photo =
              (await resolveCumulativeMediaUrl({
                ownerTable: CUMULATIVE_MEDIA_OWNER_STUDENTS,
                ownerLocalId: row.id,
                ownerCloudId: row.cloudId,
                fieldKey: CUMULATIVE_FIELD_PHOTO,
                fallbackMediaId: row.photoMediaId,
                nextUrls: nextMediaUrls,
              })) || fallbackMediaValue(row, "photo", "photoMediaId");

            return {
              ...row,
              photo,
              studentPhoto: photo,
              resolvedStudentPhotoUrl: photo,
            };
          }),
      );

      setSchools(schoolsWithMedia as School[]);
      setBranches(branchesWithMedia as Branch[]);
      setSchoolBranchSettings(settingsWithMedia as SchoolBranchSetting[]);
      setAcademicStructures(
        academicStructureRows
          .filter((row) => looseBranchTenant(row) && rowIsActive(row))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setAcademicPeriods(
        academicPeriodRows
          .filter((row) => looseBranchTenant(row) && rowIsActive(row))
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
      );
      setStudents(studentsWithMedia as Student[]);
      setParents(
        parentRows.filter((row) => sameTenant(row) || looseBranchTenant(row)),
      );
      setStudentParents(
        studentParentRows.filter(
          (row) => sameTenant(row) || looseBranchTenant(row),
        ),
      );
      setTeachers(
        teacherRows.filter((row) => sameTenant(row) || looseBranchTenant(row)),
      );
      setClasses(
        classRows
          .filter((row) => looseBranchTenant(row) && rowIsActive(row))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSubjects(
        subjectRows
          .filter((row) => looseBranchTenant(row) && rowIsActive(row))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setStudentReportSnapshots(
        snapshotRows.filter((row) => {
          if (!filters.includeDeletedSnapshots && row.isDeleted) return false;
          if (!accountMatches(row.accountId, accountId)) return false;
          if (!sameId(row.schoolId, schoolId)) return false;
          if (!sameId(row.branchId, branchId)) return false;
          return true;
        }),
      );
      setStudentPromotions(
        promotionRows.filter((row) => {
          if (row.isDeleted) return false;
          if (!accountMatches(row.accountId, accountId)) return false;
          if ((row as any).schoolId && !sameId((row as any).schoolId, schoolId))
            return false;
          if ((row as any).branchId && !sameId((row as any).branchId, branchId))
            return false;
          return true;
        }),
      );

      const templateMap = new Map<string, ReportTemplateRow>();

      builtInReportTemplateRows().forEach((template) => {
        const key = reportTemplateMapKey(template);
        if (key) templateMap.set(key, template);
      });

      (reportTemplateRows as ReportTemplateRow[])
        .filter(
          (row) =>
            templateTenantMatches(row, accountId, schoolId, branchId) &&
            isUsableTemplateRow(row),
        )
        .forEach((template) => {
          const normalized: ReportTemplateRow = {
            ...template,
            reportType: template.reportType || "student_report",
            templateCode: template.templateCode || template.code || template.layoutKey,
            templateKey: template.templateKey || template.layoutKey || template.code,
          };
          const key = reportTemplateMapKey(normalized);
          if (key) {
            templateMap.set(key, {
              ...(templateMap.get(key) || {}),
              ...normalized,
            });
          }
        });

      setReportTemplates(
        Array.from(templateMap.values()).sort((a, b) => {
          if (a.reportType !== b.reportType) {
            return String(a.reportType || "").localeCompare(String(b.reportType || ""));
          }
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return String(a.name || "").localeCompare(String(b.name || ""));
        }),
      );

      setReportTemplateSettingsRows(
        (reportTemplateSettingsRowsData as ReportTemplateSettingsRow[]).filter(
          (row) =>
            templateTenantMatches(row, accountId, schoolId, branchId) &&
            isUsableTemplateRow(row),
        ),
      );

      setReportTemplateAssignments(
        (reportTemplateAssignmentRows as ReportTemplateAssignmentRow[]).filter(
          (row) =>
            templateTenantMatches(row, accountId, schoolId, branchId) &&
            isUsableTemplateRow(row),
        ),
      );
    } catch (error) {
      console.error("Failed to load cumulative records:", error);
      clearData();
      alert("Failed to load cumulative records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId,
    dataRevision,
  ]);

  // ======================================================
  // KEEP FILTERS LOCKED TO ACTIVE BRANCH
  // ======================================================

  useEffect(() => {
    setFilters((prev) => {
      const branchChanged = prev.branchId !== (branchId || 0);

      return {
        ...prev,
        branchId: branchId || 0,
        academicStructureId: branchChanged
          ? currentAcademicStructureId
          : prev.academicStructureId || currentAcademicStructureId,
        academicPeriodId: branchChanged ? undefined : prev.academicPeriodId,
        classId: branchChanged ? undefined : prev.classId,
        studentId: branchChanged ? undefined : prev.studentId,
        subjectId: branchChanged ? undefined : prev.subjectId,
      };
    });
  }, [branchId, currentAcademicStructureId]);

  useEffect(() => {
    if (!filters.academicStructureId && academicStructures[0]?.id) {
      setFilters((prev) => ({
        ...prev,
        academicStructureId: academicStructures[0].id,
      }));
    }
  }, [filters.academicStructureId, academicStructures]);

  // ======================================================
  // LOCKED BRANCH DATA
  // ======================================================

  const lockedBranches = useMemo(() => {
    const resolvedBranch = branches.find((branch: any) =>
      sameId(branch.id, branchId),
    );
    if (resolvedBranch) return [resolvedBranch];
    return activeBranch ? [activeBranch] : branches;
  }, [activeBranch, branches, branchId]);

  const filteredSnapshotsForControls = useMemo(() => {
    return studentReportSnapshots.filter((snapshot) => {
      if (!filters.includeDeletedSnapshots && snapshot.isDeleted) return false;
      if (branchId && snapshot.branchId !== branchId) return false;
      if (schoolId && snapshot.schoolId !== schoolId) return false;
      if (accountId && snapshot.accountId !== accountId) return false;
      return true;
    });
  }, [
    studentReportSnapshots,
    branchId,
    schoolId,
    accountId,
    filters.includeDeletedSnapshots,
  ]);

  // ======================================================
  // DATASET
  // ======================================================

  const dataset: CumulativeReportEngineDataset = useMemo(
    () => ({
      schools: schools.length ? schools : activeSchool ? [activeSchool] : [],
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
      activeSchool,
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
    ],
  );

  const rawOutput = useMemo(() => {
    return buildCumulativeReportEngineOutput(dataset, filters);
  }, [dataset, filters]);

  const reportBranch = useMemo(() => {
    return (
      branches.find((branch: any) => idOf(branch.id) === idOf(branchId)) ||
      lockedBranches.find(
        (branch: any) => idOf(branch.id) === idOf(branchId),
      ) ||
      (activeBranch && idOf((activeBranch as any).id) === idOf(branchId)
        ? activeBranch
        : undefined) ||
      activeBranch ||
      branches[0] ||
      lockedBranches[0] ||
      rawOutput.header.branch
    );
  }, [
    activeBranch,
    branchId,
    branches,
    lockedBranches,
    rawOutput.header.branch,
  ]);

  const output = useMemo(() => {
    return withCumulativeBranchContext(
      rawOutput as any,
      reportBranch,
    ) as typeof rawOutput;
  }, [rawOutput, reportBranch]);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student.id === filters.studentId);
  }, [students, filters.studentId]);

  const printablePage: React.CSSProperties = {
    width: "297mm",
    minHeight: "210mm",
    margin: "0 auto 20px",
    padding: "10mm",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111",
    fontFamily: output.header.branding.fontFamily || "Arial, sans-serif",
    border: "1px solid #e5e5e5",
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 9,
  };

  const th: React.CSSProperties = {
    border: "1px solid #222",
    padding: 5,
    background: primary,
    color: "#fff",
    textAlign: "center",
    fontWeight: 800,
  };

  const td: React.CSSProperties = {
    border: "1px solid #222",
    padding: 5,
    verticalAlign: "middle",
  };

  // ======================================================
  // TEMPLATE RESOLUTION FOR CUMULATIVE BOOK + TRANSCRIPT
  // ======================================================

  const selectedStudentReportTemplateForBook = useMemo(() => {
    const bookAssignment = assignmentForReportType(
      reportTemplateAssignments,
      "cumulative_book",
      branchId,
    );
    const studentAssignment = assignmentForReportType(
      reportTemplateAssignments,
      "student_report",
      branchId,
    );

    return (
      templateFromAssignment(reportTemplates, bookAssignment) ||
      templateFromAssignment(reportTemplates, studentAssignment) ||
      firstTemplateByReportType(reportTemplates, "student_report") ||
      fallbackStudentTemplate()
    );
  }, [reportTemplateAssignments, reportTemplates, branchId]);

  const selectedStudentReportSettingsForBook = useMemo(() => {
    const bookAssignment = assignmentForReportType(
      reportTemplateAssignments,
      "cumulative_book",
      branchId,
    );
    const studentAssignment = assignmentForReportType(
      reportTemplateAssignments,
      "student_report",
      branchId,
    );

    const directBookSettings = settingsFromAssignment(
      reportTemplateSettingsRows,
      bookAssignment,
      selectedStudentReportTemplateForBook,
      "cumulative_book",
    );

    const studentSettings = settingsFromAssignment(
      reportTemplateSettingsRows,
      studentAssignment,
      selectedStudentReportTemplateForBook,
      "student_report",
    );

    return fallbackCumulativeBookSettings(
      directBookSettings || studentSettings,
    );
  }, [
    reportTemplateAssignments,
    reportTemplateSettingsRows,
    selectedStudentReportTemplateForBook,
    branchId,
  ]);

  const selectedCumulativeTranscriptTemplate = useMemo(() => {
    const assignment = assignmentForReportType(
      reportTemplateAssignments,
      "cumulative_transcript",
      branchId,
    );
    return (
      templateFromAssignment(reportTemplates, assignment) ||
      firstTemplateByReportType(reportTemplates, "cumulative_transcript") ||
      fallbackCumulativeTranscriptTemplate()
    );
  }, [reportTemplateAssignments, reportTemplates, branchId]);

  const selectedCumulativeTranscriptSettings = useMemo(() => {
    const assignment = assignmentForReportType(
      reportTemplateAssignments,
      "cumulative_transcript",
      branchId,
    );
    return (
      settingsFromAssignment(
        reportTemplateSettingsRows,
        assignment,
        selectedCumulativeTranscriptTemplate,
        "cumulative_transcript",
      ) || fallbackCumulativeTranscriptSettings()
    );
  }, [
    reportTemplateAssignments,
    reportTemplateSettingsRows,
    selectedCumulativeTranscriptTemplate,
    branchId,
  ]);

  const transcriptForTemplates = useMemo(() => {
    if (output.studentTranscript) return output.studentTranscript;
    if (!filters.studentId) return undefined;

    return buildStudentTranscript(
      dataset,
      {
        ...filters,
        mode: "student-transcript",
      } as CumulativeReportFiltersState,
      filters.studentId,
    );
  }, [dataset, filters, output.studentTranscript]);

  const cumulativeTranscriptDataset = useMemo(() => {
    const existing = (output as any).cumulativeTranscriptDataset;
    if (existing?.transcript && existing?.student) return existing;

    return {
      ...(existing || {}),
      header: output.header,
      transcript: transcriptForTemplates,
      generatedAt: existing?.generatedAt || new Date().toISOString(),
      student: transcriptForTemplates
        ? {
            studentId: transcriptForTemplates.studentId,
            studentName: transcriptForTemplates.studentName,
            admissionNumber: transcriptForTemplates.admissionNumber,
            gender: transcriptForTemplates.gender,
            currentClassName: transcriptForTemplates.currentClassName,
            studentPhoto: transcriptForTemplates.studentPhoto,
            parentName: transcriptForTemplates.parentName,
            guardianName: transcriptForTemplates.guardianName,
          }
        : undefined,
      summary: transcriptForTemplates
        ? {
            totalPeriods: transcriptForTemplates.totalPeriods,
            totalSubjects: transcriptForTemplates.totalSubjects,
            cumulativeTotal: transcriptForTemplates.cumulativeTotal,
            cumulativeAverage: transcriptForTemplates.cumulativeAverage,
            cumulativeGPA: transcriptForTemplates.cumulativeGPA,
            cumulativePosition: transcriptForTemplates.latestPosition,
            highestAverage: transcriptForTemplates.highestAverage,
            lowestAverage: transcriptForTemplates.lowestAverage,
            latestAverage: transcriptForTemplates.latestAverage,
            latestPosition: transcriptForTemplates.latestPosition,
            latestDecision: transcriptForTemplates.latestDecision,
            overallTrend: transcriptForTemplates.overallTrend,
          }
        : undefined,
    };
  }, [output, transcriptForTemplates]);

  const cumulativeReportBookDataset = useMemo(() => {
    const student = transcriptForTemplates;
    const scopedSnapshots = studentReportSnapshots
      .filter((snapshot) =>
        snapshotMatchesBookFilters(snapshot, filters, schoolId, branchId),
      )
      .sort((a, b) => {
        const yearCompare = String(a.academicYear || "").localeCompare(
          String(b.academicYear || ""),
        );
        if (yearCompare !== 0) return yearCompare;
        return (
          Number(a.academicPeriodId || 0) - Number(b.academicPeriodId || 0)
        );
      });

    const periods = scopedSnapshots.map((snapshot) => {
      const period = academicPeriods.find((row) =>
        sameId(row.id, snapshot.academicPeriodId),
      );
      const snapshotStudent = students.find((row) =>
        sameId(row.id, snapshot.studentId),
      );
      const reportDataset = studentReportDatasetFromSnapshot(
        snapshot,
        output.header,
        snapshotStudent,
      );
      const report = reportDataset?.report || {};

      return {
        id: snapshot.id,
        academicPeriodId: snapshot.academicPeriodId,
        academicPeriodName:
          period?.name ||
          snapshot.term ||
          reportDataset?.header?.academicPeriod?.name ||
          "Academic Period",
        academicYear: snapshot.academicYear,
        term: snapshot.term,
        startDate: period?.startDate,
        endDate: period?.endDate,
        dataset: reportDataset,
        total: snapshot.total ?? report.total,
        average: snapshot.average ?? report.average,
        position:
          snapshot.position ?? report.overallPosition ?? report.position,
        gpa: report.overallGPA ?? report.gpa,
        recommendation: snapshot.recommendation,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      title:
        selectedStudentReportSettingsForBook.bookTitleLabel ||
        "Cumulative Academic Report Book",
      subtitle:
        selectedStudentReportSettingsForBook.bookSubtitleLabel ||
        "Complete Academic Journey",
      header: output.header,
      branding: output.header.branding,
      student: {
        id: student?.studentId || selectedStudent?.id,
        fullName: student?.studentName || selectedStudent?.fullName,
        name: student?.studentName || selectedStudent?.fullName,
        admissionNumber:
          student?.admissionNumber || selectedStudent?.admissionNumber,
        gender: student?.gender || selectedStudent?.gender,
        className: student?.currentClassName,
        currentClassName: student?.currentClassName,
        photo:
          student?.studentPhoto ||
          (selectedStudent as any)?.resolvedStudentPhotoUrl ||
          selectedStudent?.photo ||
          (periods[0]?.dataset as any)?.studentInfo?.studentPhoto ||
          (periods[0]?.dataset as any)?.report?.studentPhoto,
        studentPhoto:
          student?.studentPhoto ||
          (selectedStudent as any)?.resolvedStudentPhotoUrl ||
          selectedStudent?.photo ||
          (periods[0]?.dataset as any)?.studentInfo?.studentPhoto ||
          (periods[0]?.dataset as any)?.report?.studentPhoto,
        parentName: student?.parentName || selectedStudent?.parentName,
        address: selectedStudent?.address,
        parentPhone: selectedStudent?.parentPhone,
        parentEmail: selectedStudent?.parentEmail,
      },
      periods,
      summary: {
        totalPeriods: student?.totalPeriods || periods.length,
        cumulativeAverage: student?.cumulativeAverage,
        cumulativeGPA: student?.cumulativeGPA,
        bestAverage: student?.highestAverage,
        latestAverage: student?.latestAverage,
        latestPosition: student?.latestPosition,
        finalRecommendation: student?.latestDecision,
        trend: student?.overallTrend,
      },
      notes: output.warnings,
    };
  }, [
    academicPeriods,
    branchId,
    filters,
    output.header,
    output.warnings,
    schoolId,
    selectedStudent,
    selectedStudentReportSettingsForBook,
    studentReportSnapshots,
    transcriptForTemplates,
  ]);

  // ======================================================
  // EXTRA MODE RENDERERS
  // ======================================================

  const renderMultiPeriodReport = () => {
    const report = output.multiPeriodReport;

    return (
      <section
        className="print-page report-page-break cumulative-multi-period-page"
        style={{
          width: "210mm",
          minHeight: "297mm",
          margin: "0 auto 20px",
          padding: "11mm",
          boxSizing: "border-box",
          background: "#fff",
          color: "#111",
          fontFamily: output.header.branding.fontFamily || "Arial, sans-serif",
          border: "1px solid #e5e5e5",
        }}
      >
        <ReportHeader
          header={output.header}
          title="Multi-Period Academic Report"
          subtitle={
            report
              ? `${report.studentName} • ${report.periods.length} Periods`
              : undefined
          }
          orientation="portrait"
        />

        {!report ? (
          <div className="cr-print-empty">
            Select a student with multiple historical snapshots to generate a
            multi-period report.
          </div>
        ) : (
          <>
            <div className="cr-print-summary-grid">
              <div>
                <strong>Student:</strong> {report.studentName}
              </div>
              <div>
                <strong>Class:</strong> {report.className || "-"}
              </div>
              <div>
                <strong>Average:</strong> {formatNumber(report.average, 1)}%
              </div>
              <div>
                <strong>GPA:</strong>{" "}
                {report.gpa != null ? formatNumber(report.gpa, 2) : "-"}
              </div>
            </div>

            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Subject</th>
                  {report.periods.map((period) => (
                    <th key={period.academicPeriodId} style={th}>
                      {period.academicPeriodName}
                    </th>
                  ))}
                  <th style={th}>Average</th>
                  <th style={th}>Best</th>
                  <th style={th}>Latest</th>
                  <th style={th}>Trend</th>
                  <th style={th}>Final Grade</th>
                </tr>
              </thead>
              <tbody>
                {report.subjects.map((subject) => (
                  <tr key={subject.subjectId || subject.subjectName}>
                    <td style={{ ...td, fontWeight: 800 }}>
                      {subject.subjectName}
                      {subject.subjectCode && (
                        <div style={{ fontSize: 8, opacity: 0.7 }}>
                          {subject.subjectCode}
                        </div>
                      )}
                    </td>
                    {report.periods.map((period) => {
                      const score = subject.periodScores.find(
                        (item) =>
                          item.academicPeriodId === period.academicPeriodId,
                      );
                      return (
                        <td
                          key={`${subject.subjectName}-${period.academicPeriodId}`}
                          style={{ ...td, textAlign: "center" }}
                        >
                          {score ? (
                            <>
                              <strong>
                                {formatNumber(score.percentage, 1)}%
                              </strong>
                              <div style={{ fontSize: 8, opacity: 0.7 }}>
                                {score.grade || "-"}
                              </div>
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                      {formatNumber(subject.average, 1)}%
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {formatNumber(subject.bestScore, 1)}%
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {formatNumber(subject.latestScore, 1)}%
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {trendLabel(subject.trend)}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                      {subject.finalGrade || "-"}
                    </td>
                  </tr>
                ))}
                {!report.subjects.length && (
                  <tr>
                    <td
                      style={{ ...td, textAlign: "center", padding: 16 }}
                      colSpan={report.periods.length + 6}
                    >
                      No multi-period subject records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <PrintFooter
              primary={primary}
              schoolName={output.header.branding.schoolName}
              label="Official multi-period academic report"
            />
          </>
        )}
      </section>
    );
  };

  const renderSubjectHistory = () => {
    const history = output.subjectHistory;

    return (
      <section
        className="print-page report-page-break cumulative-subject-history-page"
        style={printablePage}
      >
        <ReportHeader
          header={output.header}
          title="Subject Longitudinal Analytics"
          subtitle={
            history
              ? `${history.subjectName} • ${history.totalStudents} Students • ${history.totalPeriods} Periods`
              : undefined
          }
          orientation="landscape"
        />

        {!history ? (
          <div className="cr-print-empty">
            Select a subject to generate longitudinal subject analytics.
          </div>
        ) : (
          <>
            <div className="cr-print-summary-grid six">
              <div>
                <strong>Subject:</strong> {history.subjectName}
              </div>
              <div>
                <strong>Students:</strong> {history.totalStudents}
              </div>
              <div>
                <strong>Periods:</strong> {history.totalPeriods}
              </div>
              <div>
                <strong>Average:</strong>{" "}
                {formatNumber(history.subjectAverage, 1)}%
              </div>
              <div>
                <strong>Improving:</strong> {history.improvingCount}
              </div>
              <div>
                <strong>Declining:</strong> {history.decliningCount}
              </div>
            </div>

            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={{ ...th, textAlign: "left", minWidth: 180 }}>
                    Student
                  </th>
                  <th style={th}>Class</th>
                  <th style={th}>Periods</th>
                  <th style={th}>Average</th>
                  <th style={th}>Highest</th>
                  <th style={th}>Lowest</th>
                  <th style={th}>Latest</th>
                  <th style={th}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {history.students.map((student, index) => (
                  <tr key={student.studentId}>
                    <td style={{ ...td, textAlign: "center" }}>{index + 1}</td>
                    <td style={{ ...td, fontWeight: 800 }}>
                      {student.studentName}
                      {student.admissionNumber && (
                        <div style={{ fontSize: 8, opacity: 0.7 }}>
                          {student.admissionNumber}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {student.className || "-"}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {student.periods.length}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                      {formatNumber(student.average, 1)}%
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {formatNumber(student.highest, 1)}%
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {formatNumber(student.lowest, 1)}%
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {student.latest != null
                        ? `${formatNumber(student.latest, 1)}%`
                        : "-"}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                      {trendLabel(student.trend)}
                    </td>
                  </tr>
                ))}
                {!history.students.length && (
                  <tr>
                    <td
                      style={{ ...td, textAlign: "center", padding: 16 }}
                      colSpan={9}
                    >
                      No subject history records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <PrintFooter
              primary={primary}
              schoolName={output.header.branding.schoolName}
              label="Official subject history"
            />
          </>
        )}
      </section>
    );
  };

  const renderActiveView = () => {
    if (String(filters.mode) === "cumulative-book") {
      return (
        <CumulativeReportBook
          dataset={cumulativeReportBookDataset as any}
          template={selectedStudentReportTemplateForBook as any}
          settings={selectedStudentReportSettingsForBook as any}
          compact
          pageBreakAfter={false}
          mobilePreview
        />
      );
    }

    if (filters.mode === "student-transcript") {
      return (
        <CumulativeTranscriptCard
          dataset={cumulativeTranscriptDataset as any}
          template={selectedCumulativeTranscriptTemplate as any}
          settings={selectedCumulativeTranscriptSettings as any}
          compact
          pageBreakAfter={false}
          mobilePreview
        />
      );
    }

    if (filters.mode === "multi-period-report")
      return renderMultiPeriodReport();

    if (filters.mode === "annual-broadsheet") {
      return (
        <AnnualBroadsheet
          header={output.header}
          broadsheet={output.annualBroadsheet}
          pageBreakAfter={false}
        />
      );
    }

    if (filters.mode === "subject-history") return renderSubjectHistory();

    if (filters.mode === "promotion-summary") {
      return (
        <PromotionSummary
          header={output.header}
          summary={output.promotionSummary}
          pageBreakAfter={false}
        />
      );
    }

    return (
      <StudentProgressionTimeline
        header={output.header}
        steps={output.progressionTimeline}
        studentName={
          selectedStudent?.fullName || output.studentTranscript?.studentName
        }
        pageBreakAfter={false}
      />
    );
  };

  const setBranchLockedFilters: React.Dispatch<
    React.SetStateAction<CumulativeReportFiltersState>
  > = (next) => {
    if (typeof next === "function") {
      setFilters((prev) => ({
        ...(
          next as (
            value: CumulativeReportFiltersState,
          ) => CumulativeReportFiltersState
        )(prev),
        branchId: branchId || 0,
      }));
      return;
    }

    setFilters({
      ...next,
      branchId: branchId || 0,
    });
  };

  // ======================================================
  // GOLDEN COMPACT UI
  // ======================================================

  const activeFilterCount = useMemo(() => {
    return [
      filters.academicStructureId,
      filters.academicPeriodId,
      filters.fromAcademicPeriodId,
      filters.toAcademicPeriodId,
      filters.classId,
      filters.studentId,
      filters.subjectId,
      filters.snapshotType !== "all" ? filters.snapshotType : undefined,
      filters.decision !== "all" ? filters.decision : undefined,
      String(filters.mode) !== "student-transcript" ? filters.mode : undefined,
      filters.sortMode !== "position" ? filters.sortMode : undefined,
      filters.groupingMode !== "academic-structure"
        ? filters.groupingMode
        : undefined,
      filters.subjectAggregationMode !== "average"
        ? filters.subjectAggregationMode
        : undefined,
      !filters.includePromotionRecords ? "promotion-off" : undefined,
      !filters.includeManualSnapshots ? "manual-off" : undefined,
      !filters.includeTerminalSnapshots ? "terminal-off" : undefined,
      filters.includeDeletedSnapshots ? "deleted-on" : undefined,
    ].filter(Boolean).length;
  }, [filters]);

  const searchTerm = search.trim().toLowerCase();
  const quickStudents = useMemo(() => {
    if (!searchTerm) return students;

    return students.filter((student) =>
      `${student.fullName || ""} ${student.admissionNumber || ""}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [students, searchTerm]);

  const optionAcademicStructures = useMemo(() => {
    const idsFromSnapshots = new Set(
      studentReportSnapshots
        .map((row) => idOf(row.academicStructureId))
        .filter(Boolean),
    );
    const rows = academicStructures.filter(
      (row) =>
        !row.isDeleted &&
        (row.active !== false || idsFromSnapshots.has(idOf(row.id))),
    );
    if (rows.length) return rows;

    return Array.from(idsFromSnapshots).map(
      (id) =>
        ({
          id,
          name: `Academic Structure ${id}`,
          schoolId,
          branchId,
          accountId: accountId || undefined,
          active: true,
        }) as AcademicStructure,
    );
  }, [
    academicStructures,
    studentReportSnapshots,
    schoolId,
    branchId,
    accountId,
  ]);

  const optionAcademicPeriods = useMemo(() => {
    const idsFromSnapshots = new Set(
      studentReportSnapshots
        .filter(
          (row) =>
            !filters.academicStructureId ||
            sameId(row.academicStructureId, filters.academicStructureId),
        )
        .map((row) => idOf(row.academicPeriodId))
        .filter(Boolean),
    );

    const rows = academicPeriods
      .filter((row) => {
        if (row.isDeleted) return false;
        if (
          filters.academicStructureId &&
          !sameId(row.academicStructureId, filters.academicStructureId)
        )
          return false;
        return row.active !== false || idsFromSnapshots.has(idOf(row.id));
      })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    if (rows.length) return rows;

    return Array.from(idsFromSnapshots).map(
      (id, index) =>
        ({
          id,
          name: `Academic Period ${id}`,
          schoolId,
          branchId,
          accountId: accountId || undefined,
          academicStructureId: filters.academicStructureId || 0,
          order: index + 1,
          active: true,
        }) as AcademicPeriod,
    );
  }, [
    academicPeriods,
    studentReportSnapshots,
    filters.academicStructureId,
    schoolId,
    branchId,
    accountId,
  ]);

  const optionClasses = useMemo(() => {
    const idsFromSnapshots = new Set(
      studentReportSnapshots
        .filter((row) => {
          if (
            filters.academicStructureId &&
            !sameId(row.academicStructureId, filters.academicStructureId)
          )
            return false;
          if (
            filters.academicPeriodId &&
            !sameId(row.academicPeriodId, filters.academicPeriodId)
          )
            return false;
          return true;
        })
        .map((row) => idOf(row.classId))
        .filter(Boolean),
    );

    const rows = classes.filter(
      (row) =>
        !row.isDeleted &&
        (row.active !== false || idsFromSnapshots.has(idOf(row.id))),
    );
    if (rows.length) return rows;

    return Array.from(idsFromSnapshots).map(
      (id) =>
        ({
          id,
          name: `Class ${id}`,
          schoolId,
          branchId,
          accountId: accountId || undefined,
          active: true,
        }) as Class,
    );
  }, [
    classes,
    studentReportSnapshots,
    filters.academicStructureId,
    filters.academicPeriodId,
    schoolId,
    branchId,
    accountId,
  ]);

  const optionStudents = useMemo(() => {
    const idsFromSnapshots = new Set(
      studentReportSnapshots
        .filter((row) => {
          if (
            filters.academicStructureId &&
            !sameId(row.academicStructureId, filters.academicStructureId)
          )
            return false;
          if (
            filters.academicPeriodId &&
            !sameId(row.academicPeriodId, filters.academicPeriodId)
          )
            return false;
          if (filters.classId && !sameId(row.classId, filters.classId))
            return false;
          return true;
        })
        .map((row) => idOf(row.studentId))
        .filter(Boolean),
    );

    const rows = quickStudents.filter(
      (row) =>
        !row.isDeleted &&
        (row.status !== "withdrawn" || idsFromSnapshots.has(idOf(row.id))),
    );
    if (rows.length) return rows;

    return Array.from(idsFromSnapshots).map(
      (id) =>
        ({
          id,
          fullName: `Student ${id}`,
          schoolId,
          branchId,
          accountId: accountId || undefined,
          status: "active",
        }) as Student,
    );
  }, [
    quickStudents,
    studentReportSnapshots,
    filters.academicStructureId,
    filters.academicPeriodId,
    filters.classId,
    schoolId,
    branchId,
    accountId,
  ]);

  const optionSubjects = useMemo(() => {
    if (subjects.length) return subjects;

    const subjectMap = new Map<number, Subject>();

    studentReportSnapshots.forEach((snapshot) => {
      const reportData: any = snapshot.reportData || {};
      const report =
        reportData.report ||
        reportData.studentReport ||
        reportData.computedReport ||
        reportData.computedStudentReport ||
        reportData;

      const possibleSubjects =
        report.subjectResults ||
        report.subjects ||
        report.reportItems ||
        reportData.subjectResults ||
        reportData.subjects ||
        reportData.reportItems ||
        [];

      if (!Array.isArray(possibleSubjects)) return;

      possibleSubjects.forEach((subject: any) => {
        const id = idOf(subject.subjectId || subject.id);
        if (!id || subjectMap.has(id)) return;

        subjectMap.set(id, {
          id,
          name:
            subject.subjectName ||
            subject.name ||
            subject.title ||
            subject.shortName ||
            `Subject ${id}`,
          code: subject.subjectCode || subject.code,
          schoolId,
          branchId,
          accountId: accountId || undefined,
          active: true,
        } as Subject);
      });
    });

    return Array.from(subjectMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [subjects, studentReportSnapshots, schoolId, branchId, accountId]);

  const selectedStructureName = labelOf(
    optionAcademicStructures,
    filters.academicStructureId,
  );
  const selectedPeriodName = labelOf(
    optionAcademicPeriods,
    filters.academicPeriodId,
  );
  const selectedStudentName = labelOf(optionStudents, filters.studentId);
  const selectedClassName = labelOf(optionClasses, filters.classId);
  const selectedSubjectName = labelOf(optionSubjects, filters.subjectId);
  const modeLabel =
    modeLabels[filters.mode] || filters.mode.replaceAll("-", " ");

  const printCurrent = () => {
    applyCumulativePrintStyles(
      "cumulative-report-print-zone",
      printOrientationForMode(filters.mode),
    );
    setTimeout(() => window.print(), 120);
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Cumulative Records..."
        text="Checking account, branch, snapshots, promotions and historical academic records."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before viewing cumulative records."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page cumulative-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>
            Cumulative records are generated inside one active school branch.
          </p>
          <button
            type="button"
            className="ba-state-button"
            onClick={() => router.push("/owner")}
          >
            Go to Owner Setup
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="ba-page cumulative-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section
        className="ba-search-card report-no-print"
        aria-label="Cumulative records search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search cumulative records..."
            aria-label="Search cumulative records"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={printCurrent}
          aria-label="Print cumulative record"
          title="Print"
        >
          ⎙
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open cumulative filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section
          className="ba-filter-chips report-no-print"
          aria-label="Active cumulative filters"
        >
          {String(filters.mode) !== "student-transcript" && (
            <button
              type="button"
              onClick={() =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  mode: "student-transcript",
                }))
              }
            >
              Mode: {modeLabel} ×
            </button>
          )}
          {filters.academicStructureId && (
            <button
              type="button"
              onClick={() =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  academicStructureId: undefined,
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
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  academicPeriodId: undefined,
                }))
              }
            >
              Period: {selectedPeriodName} ×
            </button>
          )}
          {filters.classId && (
            <button
              type="button"
              onClick={() =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  classId: undefined,
                  studentId: undefined,
                }))
              }
            >
              Class: {selectedClassName} ×
            </button>
          )}
          {filters.studentId && (
            <button
              type="button"
              onClick={() =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  studentId: undefined,
                }))
              }
            >
              Student: {selectedStudentName} ×
            </button>
          )}
          {filters.subjectId && (
            <button
              type="button"
              onClick={() =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  subjectId: undefined,
                }))
              }
            >
              Subject: {selectedSubjectName} ×
            </button>
          )}
        </section>
      )}

      <section className="ba-print-card">
        <div className="ba-print-head report-no-print">
          <div>
            <strong>{modeLabel}</strong>
            <p>
              {selectedStructureName} · {selectedPeriodName}
              {filters.studentId ? ` · ${selectedStudentName}` : ""}
            </p>
          </div>

          <div className="ba-report-toolbar">
            <div
              className="ba-output-switch"
              role="group"
              aria-label="Choose cumulative record output"
            >
              <button
                type="button"
                className={filters.mode === "student-transcript" ? "active" : ""}
                onClick={() =>
                  setBranchLockedFilters((prev) => ({
                    ...prev,
                    mode: "student-transcript",
                  }))
                }
                title="View cumulative transcript"
              >
                Transcript
              </button>
              <button
                type="button"
                className={String(filters.mode) === "cumulative-book" ? "active" : ""}
                onClick={() =>
                  setBranchLockedFilters((prev) => ({
                    ...prev,
                    mode: "cumulative-book" as any,
                  }))
                }
                title="View cumulative report book"
              >
                Book
              </button>
            </div>

            <button type="button" className="primary" onClick={printCurrent}>
              Print
            </button>
          </div>
        </div>

        <div className="report-screen-scroll ba-print-zone">
          <div id="cumulative-report-print-zone">{renderActiveView()}</div>
        </div>
      </section>

      {filterOpen && (
        <FilterSheet
          filters={filters}
          setBranchLockedFilters={setBranchLockedFilters}
          academicStructures={optionAcademicStructures}
          academicPeriods={optionAcademicPeriods}
          classes={optionClasses}
          students={optionStudents}
          subjects={optionSubjects}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          mode={filters.mode}
          setMode={(mode) => {
            setBranchLockedFilters((prev) => ({
              ...prev,
              mode: mode as any,
            }));
            setMoreOpen(false);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onPrint={() => {
            setMoreOpen(false);
            printCurrent();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </main>
  );
}

// ======================================================
// GOLDEN SMALL COMPONENTS
// ======================================================

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
      className="ba-page cumulative-page"
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

function FilterSheet({
  filters,
  setBranchLockedFilters,
  academicStructures,
  academicPeriods,
  classes,
  students,
  subjects,
  onClose,
}: {
  filters: CumulativeReportFiltersState;
  setBranchLockedFilters: React.Dispatch<
    React.SetStateAction<CumulativeReportFiltersState>
  >;
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  classes: Class[];
  students: Student[];
  subjects: Subject[];
  onClose: () => void;
}) {
  const periodOptions = academicPeriods.filter((period) => {
    if (!filters.academicStructureId) return true;
    return period.academicStructureId === filters.academicStructureId;
  });

  const studentOptions = students.filter((student) => {
    if (!filters.classId) return true;
    return student.currentClassId === filters.classId;
  });

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
              Choose the cumulative record scope. School and branch stay locked.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Academic Structure</span>
            <select
              value={filters.academicStructureId || ""}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  academicStructureId: Number(event.target.value) || undefined,
                  academicPeriodId: undefined,
                  fromAcademicPeriodId: undefined,
                  toAcademicPeriodId: undefined,
                  classId: undefined,
                  studentId: undefined,
                  subjectId: undefined,
                }))
              }
            >
              <option value="">All structures</option>
              {academicStructures.map((item) => (
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
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  academicPeriodId: Number(event.target.value) || undefined,
                  classId: undefined,
                  studentId: undefined,
                }))
              }
            >
              <option value="">All periods</option>
              {periodOptions.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>From Period</span>
            <select
              value={filters.fromAcademicPeriodId || ""}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  fromAcademicPeriodId: Number(event.target.value) || undefined,
                }))
              }
            >
              <option value="">No start period</option>
              {periodOptions.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>To Period</span>
            <select
              value={filters.toAcademicPeriodId || ""}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  toAcademicPeriodId: Number(event.target.value) || undefined,
                }))
              }
            >
              <option value="">No end period</option>
              {periodOptions.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Class</span>
            <select
              value={filters.classId || ""}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  classId: Number(event.target.value) || undefined,
                  studentId: undefined,
                }))
              }
            >
              <option value="">All classes</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Student</span>
            <select
              value={filters.studentId || ""}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  studentId: Number(event.target.value) || undefined,
                }))
              }
            >
              <option value="">Select student</option>
              {studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.fullName}
                  {student.admissionNumber
                    ? ` (${student.admissionNumber})`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Subject</span>
            <select
              value={filters.subjectId || ""}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  subjectId: Number(event.target.value) || undefined,
                }))
              }
            >
              <option value="">Select subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                  {subject.code ? ` (${subject.code})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Snapshot Type</span>
            <select
              value={filters.snapshotType}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  snapshotType: event.target
                    .value as CumulativeReportFiltersState["snapshotType"],
                }))
              }
            >
              <option value="all">All snapshots</option>
              <option value="terminal">Terminal snapshots</option>
              <option value="promotion">Promotion snapshots</option>
              <option value="manual">Manual snapshots</option>
            </select>
          </label>

          <label>
            <span>Decision</span>
            <select
              value={filters.decision || "all"}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  decision: event.target
                    .value as CumulativeReportFiltersState["decision"],
                }))
              }
            >
              <option value="all">All decisions</option>
              <option value="promote">Promote</option>
              <option value="repeat">Repeat</option>
              <option value="graduate">Graduate</option>
            </select>
          </label>

          <label>
            <span>Sort Mode</span>
            <select
              value={filters.sortMode}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  sortMode: event.target
                    .value as CumulativeReportFiltersState["sortMode"],
                }))
              }
            >
              <option value="position">Sort by position</option>
              <option value="alphabetical">Sort alphabetically</option>
              <option value="average">Sort by average</option>
              <option value="admission-number">Sort by admission no.</option>
            </select>
          </label>

          <label>
            <span>Grouping</span>
            <select
              value={filters.groupingMode}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  groupingMode: event.target
                    .value as CumulativeReportFiltersState["groupingMode"],
                }))
              }
            >
              <option value="academic-structure">Academic structure</option>
              <option value="class">Class</option>
              <option value="period">Period</option>
            </select>
          </label>

          <label>
            <span>Subject Aggregation</span>
            <select
              value={filters.subjectAggregationMode}
              onChange={(event) =>
                setBranchLockedFilters((prev) => ({
                  ...prev,
                  subjectAggregationMode: event.target
                    .value as CumulativeReportFiltersState["subjectAggregationMode"],
                }))
              }
            >
              <option value="average">Average</option>
              <option value="latest">Latest score</option>
              <option value="best">Best score</option>
              <option value="weighted-average">Weighted average</option>
            </select>
          </label>
        </div>

        <div className="cumulative-toggle-grid">
          <button
            type="button"
            className={filters.includeTerminalSnapshots ? "active" : ""}
            onClick={() =>
              setBranchLockedFilters((prev) => ({
                ...prev,
                includeTerminalSnapshots: !prev.includeTerminalSnapshots,
              }))
            }
          >
            Terminal: {filters.includeTerminalSnapshots ? "On" : "Off"}
          </button>
          <button
            type="button"
            className={filters.includePromotionRecords ? "active" : ""}
            onClick={() =>
              setBranchLockedFilters((prev) => ({
                ...prev,
                includePromotionRecords: !prev.includePromotionRecords,
              }))
            }
          >
            Promotions: {filters.includePromotionRecords ? "On" : "Off"}
          </button>
          <button
            type="button"
            className={filters.includeManualSnapshots ? "active" : ""}
            onClick={() =>
              setBranchLockedFilters((prev) => ({
                ...prev,
                includeManualSnapshots: !prev.includeManualSnapshots,
              }))
            }
          >
            Manual: {filters.includeManualSnapshots ? "On" : "Off"}
          </button>
          <button
            type="button"
            className={filters.includeDeletedSnapshots ? "active" : ""}
            onClick={() =>
              setBranchLockedFilters((prev) => ({
                ...prev,
                includeDeletedSnapshots: !prev.includeDeletedSnapshots,
              }))
            }
          >
            Deleted: {filters.includeDeletedSnapshots ? "On" : "Off"}
          </button>
        </div>

        <div className="ba-sheet-actions">
          <button
            type="button"
            onClick={() =>
              setBranchLockedFilters((prev) => ({
                ...prev,
                academicStructureId: undefined,
                academicPeriodId: undefined,
                fromAcademicPeriodId: undefined,
                toAcademicPeriodId: undefined,
                classId: undefined,
                studentId: undefined,
                subjectId: undefined,
                snapshotType: "all",
                decision: "all",
                sortMode: "position",
                groupingMode: "academic-structure",
                subjectAggregationMode: "average",
                includePromotionRecords: true,
                includeManualSnapshots: true,
                includeTerminalSnapshots: true,
                includeDeletedSnapshots: false,
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
  mode: CumulativeReportFiltersState["mode"] | string;
  setMode: (mode: CumulativeReportFiltersState["mode"] | string) => void;
  onRefresh: () => void | Promise<void>;
  onPrint: () => void;
  onClose: () => void;
}) {
  const options: {
    mode: CumulativeReportFiltersState["mode"] | string;
    icon: string;
    label: string;
    note: string;
  }[] = [
    {
      mode: "student-transcript",
      icon: "📄",
      label: "Cumulative Transcript",
      note: "Template-based academic transcript",
    },
    {
      mode: "cumulative-book",
      icon: "📘",
      label: "Cumulative Report Book",
      note: "Covers plus period report cards",
    },
    {
      mode: "multi-period-report",
      icon: "📚",
      label: "Multi-Period Report",
      note: "Student performance across periods",
    },
    {
      mode: "annual-broadsheet",
      icon: "☷",
      label: "Annual Broadsheet",
      note: "Class or school annual broadsheet",
    },
    {
      mode: "subject-history",
      icon: "📈",
      label: "Subject History",
      note: "Longitudinal subject analytics",
    },
    {
      mode: "promotion-summary",
      icon: "🎓",
      label: "Promotion Summary",
      note: "Promotion decision summary",
    },
    {
      mode: "progression-timeline",
      icon: "⏱",
      label: "Progression Timeline",
      note: "Student academic timeline",
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
            <p>Choose output mode or run quick actions.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          {options.map((option) => (
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
            <b>Print current view</b>
            <small>Print the selected cumulative output</small>
          </button>

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload branch cumulative records</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function PrintFooter({
  primary,
  schoolName,
  label,
}: {
  primary: string;
  schoolName: string;
  label: string;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        borderTop: `2px solid ${primary}`,
        paddingTop: 5,
        display: "flex",
        justifyContent: "space-between",
        fontSize: 8.5,
        color: "#555",
      }}
    >
      <span>
        {label} generated for {schoolName}
      </span>
      <span>Powered by Eleeveon School Management System</span>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

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

.ba-output-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px;
  border-radius: 999px;
  background: var(--card-bg, #fff);
  border: 1px solid color-mix(in srgb, var(--ba-primary) 32%, rgba(148, 163, 184, .28));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 6px 16px rgba(15,23,42,.06);
}

.ba-output-switch button {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ba-primary) 9%, var(--card-bg, #fff));
  color: var(--ba-primary);
  border: 1px solid color-mix(in srgb, var(--ba-primary) 22%, transparent);
  box-shadow: none;
  opacity: 1;
}

.ba-output-switch button:not(.active):hover {
  background: color-mix(in srgb, var(--ba-primary) 14%, var(--card-bg, #fff));
}

.ba-output-switch button.active {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
  box-shadow: 0 6px 14px rgba(15,23,42,.14);
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



/* Cumulative Records golden compact additions */
.cumulative-page .ba-print-card{margin-top:8px;border-radius:22px}
.cumulative-page .ba-print-head{padding:8px 10px}
.cumulative-page .ba-print-head strong{font-size:14px}
.cumulative-page .ba-print-head p{font-size:11px;margin-top:2px}
.cumulative-page .ba-print-zone{padding:8px;width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
#cumulative-report-print-zone{width:max-content;min-width:100%}
.cumulative-toggle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.cumulative-toggle-grid button{min-height:36px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-size:11px;font-weight:950;cursor:pointer}
.cumulative-toggle-grid button.active{background:color-mix(in srgb,var(--ba-primary) 10%,var(--card-bg,#fff));border-color:color-mix(in srgb,var(--ba-primary) 34%,var(--border,rgba(0,0,0,.10)));color:var(--ba-primary)}
.cr-print-empty{padding:20px;border:1px dashed #bbb;border-radius:12px;text-align:center;font-weight:700}
.cr-print-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;font-size:10px}
.cr-print-summary-grid.six{grid-template-columns:repeat(6,minmax(0,1fr))}
.cr-print-summary-grid div{border:1px solid #ccc;padding:7px}
@media(max-width:520px){.cumulative-toggle-grid{grid-template-columns:minmax(0,1fr)}.ba-output-switch{width:100%;justify-content:center}.ba-output-switch button{flex:1}.cumulative-page .ba-report-toolbar{width:100%;justify-content:stretch}}
@media print{.report-no-print,.ba-search-card,.ba-filter-chips,.ba-sheet-backdrop,.ba-modal-backdrop,.ba-print-head,.ba-report-toolbar{display:none!important}.ba-page,.ba-print-card,.ba-print-zone,.report-screen-scroll,#cumulative-report-print-zone{padding:0!important;margin:0!important;background:#fff!important;box-shadow:none!important;border:0!important;border-radius:0!important;overflow:visible!important}}

`;
