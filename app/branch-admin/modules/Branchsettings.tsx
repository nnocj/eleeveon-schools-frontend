"use client";

/**
 * app/branch-admin/modules/Branchsettings.tsx
 * ---------------------------------------------------------
 * BRANCH ADMIN — BRANCH SETTINGS
 * ---------------------------------------------------------
 *
 * Built from the old schoolBranchSettings.tsx functionality.
 *
 * Same functional areas:
 * - school identity
 * - branch identity
 * - academic defaults
 * - current academic structure
 * - current academic period
 * - theme / color / font
 * - dashboard images
 * - portal images
 * - report card branding
 * - gallery fallback images
 * - report card templates and display controls
 *
 * Branch-admin difference:
 * - No school switching.
 * - No branch switching.
 * - Everything is locked to the assigned active school + branch.
 *
 * UI difference:
 * - Students.tsx golden compact layout
 * - no hero, summary strip, or dashboard cards
 * - Save + Filter + More top row
 * - settings grouped into compact bottom sheets
 *
 * Workspace + media upgrade:
 * - reads eleeveon_open_workspace from /select-role first, then active membership,
 *   then ActiveBranchContext/settings so branch settings cannot use stale role context
 * - image uploads now use mediaAssets/mediaBlobs through saveImageAsset(...)
 * - school/branch/settings records keep only small media IDs and safe fallback strings
 * - unsaved branch-settings uploads use ownerTempKey and are attached after save
 * - old Base64 fields are preserved only as fallback display values, not new storage
 *
 * Sync utility alignment:
 * - create/update actions now use createLocal(...) and updateLocal(...)
 * - active lookup tables use listActiveLocal(...) where appropriate
 * - softDeleteLocal is imported with the standard local-first CRUD toolkit, although
 *   this settings module has no delete action in the current UI
 *
 * LocalSettings theme alignment:
 * - light mode now applies the exact same old Eleeveon CSS variable values as
 *   app/components/role-portals/LocalSettings.tsx
 * - dark mode now also applies the complete variable set used by LocalSettings
 * - keeps branch settings as the protected source for branch color/font/theme while
 *   rendering with the same light/dark surface, input, card and shell tokens
 *
 * Theme safety fix:
 * - opening the Branch Settings tab is passive and never changes the active app theme
 * - Save, Save All, sheet saves and the More modal never mutate document theme variables
 * - this module stores theme values only; global theme application remains outside this page
 *
 * Media removal fix:
 * - clicking Remove clears the preview, fallback string field and saved mediaId field immediately
 * - removals are tracked by owner identity, not only by mediaId
 * - Save soft-deletes every active mediaAsset for ownerTable + ownerLocalId + fieldKey
 * - this handles records resolved through getOwnerFieldMediaAsset(...) even when the form has no mediaId
 * - owner records are saved with empty string fallbacks and null media IDs so old links cannot survive merge updates
 * - removed mediaAssets and their mediaBlobs are soft-deleted locally and marked pending sync
 * - Save All performs all writes first, then reloads once so removed images cannot rehydrate mid-save
 * - gallery removals persist after Save instead of reappearing after reload
 * - MediaSheet, SchoolSheet and BranchSheet receive clearImage as props so remove actions are in scope
 *
 * Report card template/settings upgrade:
 * - keeps all existing branch settings exactly as they are
 * - adds a dedicated Report Card Template & Display Controls section
 * - reads/writes reportCardTemplates, reportCardTemplateSettings and
 *   reportCardTemplateAssignments as local-first Dexie/sync records
 * - supports show/hide controls without leaving blank table/report areas
 * - stores template assignment separately from branding media so more templates
 *   can be added later without rewriting schoolBranchSettings
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Branch,
  School,
  SchoolBranchSetting,
} from "../../lib/db";

import {
  attachMediaAssetToOwner,
  createMediaSessionKey as createSharedMediaSessionKey,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  revokeMediaObjectUrl,
  saveImageAsset,
} from "../../lib/media/mediaAssetUtils";

import {
  createLocal,
  updateLocal,
  softDeleteLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";

import {
  STUDENT_REPORT_TEMPLATE_REGISTRY,
  getStudentReportTemplateRegistryItem,
} from "./reports/student-report-templates";

import {
  CUMULATIVE_TRANSCRIPT_TEMPLATE_REGISTRY,
  getCumulativeTranscriptTemplateRegistryItem,
} from "./reports/cumulative-transcript-templates";

import StudentReportCard from "./reports/components/StudentReportCard";
import CumulativeReportBook from "./reports/components/CumulativeReportBook";
import CumulativeTranscriptCard from "./reports/components/CumulativeTranscriptCard";

const TemplatePreviewStudentReportCard = StudentReportCard as React.ComponentType<any>;
const TemplatePreviewCumulativeReportBook = CumulativeReportBook as React.ComponentType<any>;
const TemplatePreviewCumulativeTranscriptCard = CumulativeTranscriptCard as React.ComponentType<any>;

// ======================================================
// COLOR UTILITIES
// ======================================================

function getContrastTextColor(hex: string) {
  let col = (hex || "#ffffff").replace("#", "");

  if (col.startsWith("rgb")) return "#fff";

  if (col.length === 3) {
    col = col
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(col, 16);

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 140 ? "#111" : "#fff";
}

// ======================================================
// OPTIONS + TYPES
// ======================================================

const fontOptions = [
  { label: "System Default", value: "system-ui, -apple-system, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Segoe UI", value: "'Segoe UI', sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Open Sans", value: "'Open Sans', sans-serif" },
  { label: "Lato", value: "Lato, sans-serif" },
  { label: "Nunito", value: "Nunito, sans-serif" },
  { label: "Ubuntu", value: "Ubuntu, sans-serif" },
  { label: "Merriweather", value: "Merriweather, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Palatino", value: "'Palatino Linotype', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Monaco", value: "Monaco, monospace" },
];


const generatedDateLabelOptions = [
  "Generated",
  "Report Generated",
  "Date Generated",
  "Printed On",
  "Report Issued",
];

type ToastTone = "success" | "error" | "info";
type ReportTemplateReportType = "student_report" | "cumulative_book" | "cumulative_transcript";
type SettingsSection = "academic" | "school" | "branch" | "appearance" | "dashboardMedia" | "reportMedia" | "reportTemplates" | "gallery";

type ImageField =
  | "logo"
  | "reportCardBackgroundImage"
  | "reportCardWatermark"
  | "reportCardSignatureImage"
  | "dashboardHeroImage"
  | "dashboardBannerImage"
  | "studentPortalImage"
  | "teacherPortalImage"
  | "classroomPlaceholderImage"
  | "subjectPlaceholderImage";

type SettingsForm = {
  id?: number;
  schoolId?: number;
  branchId?: number;
  mode: string;
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  theme: "light" | "dark";
  currentTerm: string;
  academicYear: string;
  currentAcademicStructureId?: number;
  currentAcademicPeriodId?: number;
  logo: string;
  logoMediaId?: number;
  reportCardBackgroundImage: string;
  reportCardBackgroundImageMediaId?: number;
  reportCardWatermark: string;
  reportCardWatermarkMediaId?: number;
  reportCardSignatureImage: string;
  reportCardSignatureImageMediaId?: number;
  dashboardHeroImage: string;
  dashboardHeroImageMediaId?: number;
  dashboardBannerImage: string;
  dashboardBannerImageMediaId?: number;
  studentPortalImage: string;
  studentPortalImageMediaId?: number;
  teacherPortalImage: string;
  teacherPortalImageMediaId?: number;
  classroomPlaceholderImage: string;
  classroomPlaceholderImageMediaId?: number;
  subjectPlaceholderImage: string;
  subjectPlaceholderImageMediaId?: number;
  schoolGalleryImages: string[];
  schoolGalleryMediaIds?: number[];
};

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
};

type SchoolForm = {
  id?: number;
  name?: string;
  motto?: string;
  logo?: string;
  logoMediaId?: number;
  address?: string;
  location?: string;
  email?: string;
  phone?: string;
  website?: string;
  galleryImages?: string[];
  bannerImage?: string;
  bannerImageMediaId?: number;
  active?: boolean;
};

type BranchForm = {
  id?: number;
  schoolId?: number;
  name?: string;
  code?: string;
  address?: string;
  location?: string;
  city?: string;
  email?: string;
  phone?: string;
  website?: string;
  logo?: string;
  logoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  active?: boolean;
};


type ReportTemplateForm = {
  templateId?: number;
  templateSettingsId?: number;
  assignmentId?: number;

  reportType: ReportTemplateReportType;

  templateName: string;
  templateCode: string;
  layoutKey: string;
  orientation: "portrait" | "landscape";
  paperSize: "A4" | "Letter";
  density: "compact" | "comfortable" | "spacious";

  showSubjectPosition: boolean;
  showClassPosition: boolean;
  showNumberOnRoll: boolean;
  showAttendance: boolean;
  showAttendancePercent: boolean;
  showStudentPhoto: boolean;
  showTeacherNames: boolean;
  showCurrentAcademicPeriodEnd: boolean;
  showNextAcademicPeriod: boolean;
  showPromotionStatus: boolean;
  showGPA: boolean;
  showAverage: boolean;
  showTotal: boolean;
  showGrade: boolean;
  showSubjectRemarks: boolean;
  showWatermark: boolean;
  showParentSignature: boolean;
  showGeneratedDate: boolean;

  showBookFrontCover: boolean;
  showBookStudentProfilePage: boolean;
  showBookAcademicJourneyPage: boolean;
  showBookSummaryPage: boolean;
  showBookBackCover: boolean;

  showTranscriptTermBreakdown: boolean;
  showTranscriptYearAverage: boolean;
  showTranscriptCumulativeAverage: boolean;
  showTranscriptCumulativePosition: boolean;
  showTranscriptGPAProgression: boolean;
  showTranscriptFinalRecommendation: boolean;

  classTeacherLabel: string;
  headTeacherLabel: string;
  parentLabel: string;
  principalLabel: string;
  currentAcademicPeriodEndLabel: string;
  nextAcademicPeriodLabel: string;
  numberOnRollLabel: string;
  classPositionLabel: string;
  subjectPositionLabel: string;
  generatedDateLabel: string;
  bookTitleLabel: string;
  bookSubtitleLabel: string;
  studentNameLabel: string;
  admissionNumberLabel: string;
  genderLabel: string;
  classLabel: string;
  academicStructureLabel: string;
  academicPeriodLabel: string;
  subjectLabel: string;
  totalLabel: string;
  averageLabel: string;
  gradeLabel: string;
  gpaLabel: string;
  footerText: string;

  active: boolean;
};

type ReportTemplateRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  name?: string;
  code?: string;
  layoutKey?: string;
  reportType?: ReportTemplateReportType | string;
  orientation?: string;
  paperSize?: string;
  density?: string;
  description?: string | null;
  active?: boolean;
  isDefault?: boolean;
  isDeleted?: boolean;
};

type ReportTemplateSettingsRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  templateId?: number | string | null;
  reportType?: ReportTemplateReportType | string;
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
  reportType?: ReportTemplateReportType | string;
  scopeType?: string | null;
  scopeId?: number | string | null;
  isDefault?: boolean;
  active?: boolean;
  isDeleted?: boolean;
  [key: string]: any;
};


type PendingMediaRemoval = {
  assetId?: number | null;
  ownerTable: string;
  fieldKey: string;
  accountId?: string | null;
  schoolId?: number | null;
  branchId?: number | null;
  ownerLocalId?: number | null;
  ownerCloudId?: string | null;
  ownerTempKey?: string | null;
};

type SaveOptions = {
  silent?: boolean;
  reloadAfterSave?: boolean;
  persistRemovals?: boolean;
};


const defaultForm = (
  schoolId?: number | null,
  branchId?: number | null
): SettingsForm => ({
  schoolId: schoolId || undefined,
  branchId: branchId || undefined,
  mode: "manual",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 16,
  primaryColor: "#2f6fed",
  theme: "light",
  currentTerm: "Term 1",
  academicYear: "",
  currentAcademicStructureId: undefined,
  currentAcademicPeriodId: undefined,
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


function studentReportTemplateDefinitionOptions(): ReportTemplateRow[] {
  return STUDENT_REPORT_TEMPLATE_REGISTRY.map((item: any, index: number) => ({
    name: item.name,
    code: item.code,
    layoutKey: item.layoutKey,
    reportType: "student_report",
    orientation: item.orientation || "portrait",
    paperSize: item.paperSize || "A4",
    density: item.density || "compact",
    description: item.description || "Student report card template.",
    active: item.active !== false,
    isDefault: item.isDefault === true || index === 0,
  }));
}

function cumulativeBookTemplateDefinitionOptions(): ReportTemplateRow[] {
  return STUDENT_REPORT_TEMPLATE_REGISTRY.map((item: any, index: number) => ({
    name: `${item.name} Book`,
    code: item.code,
    layoutKey: item.layoutKey,
    reportType: "cumulative_book",
    orientation: item.orientation || "portrait",
    paperSize: item.paperSize || "A4",
    density: item.density || "compact",
    description: `Cumulative report book using ${item.name} for every period snapshot.`,
    active: item.active !== false,
    isDefault: item.isDefault === true || index === 0,
  }));
}

function cumulativeTranscriptTemplateDefinitionOptions(): ReportTemplateRow[] {
  return CUMULATIVE_TRANSCRIPT_TEMPLATE_REGISTRY.map((item: any, index: number) => ({
    name: item.name,
    code: item.code,
    layoutKey: item.layoutKey,
    reportType: "cumulative_transcript",
    orientation: item.orientation || "portrait",
    paperSize: item.paperSize || "A4",
    density: item.density || "compact",
    description: item.description || "Cumulative transcript template.",
    active: item.active !== false,
    isDefault: item.isDefault === true || index === 0,
  }));
}

function reportTemplateDefinitionOptions(reportType?: ReportTemplateReportType): ReportTemplateRow[] {
  const all = [
    ...studentReportTemplateDefinitionOptions(),
    ...cumulativeBookTemplateDefinitionOptions(),
    ...cumulativeTranscriptTemplateDefinitionOptions(),
  ];

  return reportType ? all.filter((item: any) => item.reportType === reportType) : all;
}

function defaultReportTemplateDefinition(reportType: ReportTemplateReportType = "student_report") {
  return reportTemplateDefinitionOptions(reportType)[0] || reportTemplateDefinitionOptions("student_report")[0];
}

function reportTemplateFormFromDefinition(
  template?: Partial<ReportTemplateRow> | null,
  reportType: ReportTemplateReportType = "student_report"
): ReportTemplateForm {
  const fallback = defaultReportTemplateDefinition(reportType);
  const selected = template || fallback;
  const selectedReportType = ((selected as any).reportType || reportType || "student_report") as ReportTemplateReportType;

  return {
    reportType: selectedReportType,
    templateName: selected.name || fallback.name || "Classic Formal",
    templateCode: selected.code || fallback.code || "classic_formal",
    layoutKey: selected.layoutKey || fallback.layoutKey || "classic_formal",
    orientation: ((selected.orientation || fallback.orientation || "portrait") as "portrait" | "landscape"),
    paperSize: ((selected.paperSize || fallback.paperSize || "A4") as "A4" | "Letter"),
    density: ((selected.density || fallback.density || "compact") as "compact" | "comfortable" | "spacious"),

    showSubjectPosition: true,
    showClassPosition: true,
    showNumberOnRoll: false,
    showAttendance: true,
    showAttendancePercent: true,
    showStudentPhoto: true,
    showTeacherNames: true,
    showCurrentAcademicPeriodEnd: true,
    showNextAcademicPeriod: true,
    showPromotionStatus: false,
    showGPA: true,
    showAverage: true,
    showTotal: true,
    showGrade: true,
    showSubjectRemarks: true,
    showWatermark: true,
    showParentSignature: true,
    showGeneratedDate: selectedReportType !== "student_report",

    showBookFrontCover: true,
    showBookStudentProfilePage: true,
    showBookAcademicJourneyPage: true,
    showBookSummaryPage: true,
    showBookBackCover: true,

    showTranscriptTermBreakdown: true,
    showTranscriptYearAverage: true,
    showTranscriptCumulativeAverage: true,
    showTranscriptCumulativePosition: true,
    showTranscriptGPAProgression: true,
    showTranscriptFinalRecommendation: true,

    classTeacherLabel: "Class Teacher",
    headTeacherLabel: "Headteacher / Principal",
    parentLabel: "Parent / Guardian",
    principalLabel: "Principal",
    currentAcademicPeriodEndLabel: "This Academic Period Ends",
    nextAcademicPeriodLabel: "Next Academic Period Begins",
    numberOnRollLabel: "Number On Roll",
    classPositionLabel: "Class Position",
    subjectPositionLabel: selectedReportType === "cumulative_transcript" ? "Rank" : "Position",
    generatedDateLabel: "Generated",
    bookTitleLabel: "Cumulative Academic Report Book",
    bookSubtitleLabel: "Student Academic Journey",
    studentNameLabel: "Student",
    admissionNumberLabel: "Student ID",
    genderLabel: "Gender",
    classLabel: selectedReportType === "cumulative_transcript" ? "Programme / Class" : "Class",
    academicStructureLabel: "Academic Structure",
    academicPeriodLabel: selectedReportType === "cumulative_transcript" ? "Academic Period" : "Academic Period",
    subjectLabel: selectedReportType === "cumulative_transcript" ? "Course / Subject" : "Subject",
    totalLabel: "Total",
    averageLabel: "Average",
    gradeLabel: "Grade",
    gpaLabel: "GPA",
    footerText: "Official academic document generated by Eleeveon Schools.",

    active: true,
  };
}

const defaultReportTemplateForm = (): ReportTemplateForm =>
  reportTemplateFormFromDefinition(defaultReportTemplateDefinition("student_report"), "student_report");

function reportTemplatePreviewSettingsFromForm(
  form: ReportTemplateForm,
  template?: Partial<ReportTemplateRow> | null
) {
  const selected = template || null;

  return {
    ...form,
    reportType: (selected as any)?.reportType || form.reportType || "student_report",
    templateName: selected?.name || form.templateName,
    templateCode: selected?.code || form.templateCode,
    layoutKey: selected?.layoutKey || form.layoutKey,
    orientation: (form.orientation || selected?.orientation || "portrait") as "portrait" | "landscape",
    paperSize: (form.paperSize || selected?.paperSize || "A4") as "A4" | "Letter",
    density: form.density || selected?.density || "compact",
  };
}

function selectReportTemplateIntoForm(
  template: Partial<ReportTemplateRow> | null | undefined,
  updateField: (key: keyof ReportTemplateForm, value: any) => void,
  reportType?: ReportTemplateReportType
) {
  const resolvedReportType = ((template as any)?.reportType || reportType || "student_report") as ReportTemplateReportType;
  const selected = template || defaultReportTemplateDefinition(resolvedReportType);
  const code = selected.code || selected.layoutKey || defaultReportTemplateDefinition(resolvedReportType).code || "classic_formal";

  updateField("reportType", resolvedReportType);
  updateField("templateId", idOf((selected as any)?.id) || undefined);
  updateField("templateName", selected.name || "Report Template");
  updateField("templateCode", code);
  updateField("layoutKey", selected.layoutKey || code);
  updateField("orientation", ((selected as any)?.orientation || "portrait") as "portrait" | "landscape");
  updateField("paperSize", ((selected as any)?.paperSize || "A4") as "A4" | "Letter");
  updateField("density", ((selected as any)?.density || "compact") as "compact" | "comfortable" | "spacious");
}

function createDummyStudentReportPreviewDataset(args: {
  schoolName?: string;
  branchName?: string;
  primaryColor?: string;
  fontFamily?: string;
  logo?: string;
  reportCardBackgroundImage?: string;
  reportCardWatermark?: string;
  reportCardSignatureImage?: string;
}) {
  const schoolName = args.schoolName || "Eleeveon International Academy";
  const branchName = args.branchName || "Main Campus";

  const currentAcademicPeriod = {
    id: 1,
    name: "Term 2, 2026",
    startDate: "2026-05-06",
    endDate: "2026-07-31",
    formattedStartDate: "May 06, 2026",
    formattedEndDate: "Jul 31, 2026",
  };

  const nextAcademicPeriod = {
    id: 2,
    name: "Term 3, 2026",
    startDate: "2026-09-10",
    endDate: "2026-12-12",
    formattedStartDate: "Sep 10, 2026",
    formattedEndDate: "Dec 12, 2026",
  };

  const assessmentColumns = [
    { assessmentStructureItemId: 1, name: "Class Score", maxScore: 50, weight: 50, order: 1 },
    { assessmentStructureItemId: 2, name: "Exam", maxScore: 100, weight: 50, order: 2 },
  ];

  const subjects = [
    ["English Language", "Ms. Abena Mensah", 42, 84, 88, "A", 2, "Excellent"],
    ["Mathematics", "Mr. Kofi Addo", 45, 90, 92, "A+", 1, "Outstanding"],
    ["Science", "Mrs. Ama Boateng", 39, 82, 84, "A", 3, "Very Good"],
    ["Social Studies", "Mr. Kwame Owusu", 40, 78, 80, "B+", 4, "Good"],
  ] as const;

  return {
    generatedAt: "2026-07-07T12:00:00.000Z",
    header: {
      schoolName,
      branchName,
      primaryColor: args.primaryColor || "#2f6fed",
      fontFamily: args.fontFamily || "system-ui, -apple-system, sans-serif",
      logo: args.logo || "",
      reportCardBackgroundImage: args.reportCardBackgroundImage || "",
      reportCardWatermark: args.reportCardWatermark || args.logo || "",
      reportCardSignatureImage: args.reportCardSignatureImage || "",
      school: {
        name: schoolName,
        motto: "Excellence, Character and Service",
        address: "P.O. Box 100, Accra",
        phone: "+233 24 000 0000",
        email: "info@school.edu.gh",
        website: "www.school.edu.gh",
        logo: args.logo || "",
      },
      branch: {
        name: branchName,
        address: "Main Campus, Accra",
        phone: "+233 24 000 0000",
        email: "branch@school.edu.gh",
        website: "www.school.edu.gh",
        logo: args.logo || "",
      },
      academicStructure: { id: 1, name: "Basic School" },
      academicStructureName: "Basic School",
      academicPeriod: currentAcademicPeriod,
      academicPeriodName: currentAcademicPeriod.name,
      classData: { id: 1, name: "Grade 6" },
      className: "Grade 6",
    },
    branding: {
      schoolName,
      branchName,
      primaryColor: args.primaryColor || "#2f6fed",
      fontFamily: args.fontFamily || "system-ui, -apple-system, sans-serif",
      logo: args.logo || "",
      reportCardBackgroundImage: args.reportCardBackgroundImage || "",
      reportCardWatermark: args.reportCardWatermark || args.logo || "",
      reportCardSignatureImage: args.reportCardSignatureImage || "",
      address: "P.O. Box 100, Accra",
      phone: "+233 24 000 0000",
      email: "info@school.edu.gh",
      website: "www.school.edu.gh",
      motto: "Excellence, Character and Service",
      branchAddress: "Main Campus, Accra",
    },
    currentAcademicPeriod,
    nextAcademicPeriod,
    student: {
      id: 1,
      name: "Jonathan Commey",
      fullName: "Jonathan Commey",
      admissionNumber: "STD-2026-014",
      gender: "Male",
      photo: "",
    },
    studentInfo: {
      studentPhoto: "",
      numberOnRoll: 38,
    },
    signatures: {
      classTeacherName: "Ms. Abena Mensah",
      headTeacherName: "Rev. Daniel Asare",
      principalName: "Rev. Daniel Asare",
      parentName: "Parent / Guardian",
      guardianName: "Parent / Guardian",
      officialSignatureImage: args.reportCardSignatureImage || "",
    },
    report: {
      studentId: 1,
      studentName: "Jonathan Commey",
      admissionNumber: "STD-2026-014",
      gender: "Male",
      className: "Grade 6",
      attendance: {
        presentDays: 58,
        totalDays: 62,
        attendancePercent: 93.5,
      },
      total: 344,
      average: 86,
      overallPosition: 2,
      overallGPA: 3.82,
      classTeacherRemark: "Jonathan is attentive, respectful and participates actively in class.",
      headTeacherRemark: "A strong performance. Keep building excellent learning habits.",
      subjectResults: subjects.map((subject, index) => {
        const [subjectName, teacherName, classScore, examScore, percentage, grade, position, remark] = subject;
        return {
          classSubjectId: index + 1,
          subjectName,
          teacherName,
          breakdown: assessmentColumns.map((column) => ({
            ...column,
            score: column.assessmentStructureItemId === 1 ? classScore : examScore,
          })),
          weightedTotal: percentage,
          percentage,
          grade,
          subjectPosition: position,
          remark,
        };
      }),
    },
  };
}



function createDummyCumulativeReportBookPreviewDataset(args: {
  schoolName?: string;
  branchName?: string;
  primaryColor?: string;
  fontFamily?: string;
  logo?: string;
  reportCardBackgroundImage?: string;
  reportCardWatermark?: string;
  reportCardSignatureImage?: string;
}) {
  const term1 = createDummyStudentReportPreviewDataset(args);
  const term2 = createDummyStudentReportPreviewDataset(args) as any;
  const term3 = createDummyStudentReportPreviewDataset(args) as any;

  term1.header.academicPeriod = { ...term1.header.academicPeriod, name: "Term 1, 2026", formattedEndDate: "Apr 04, 2026" };
  term1.header.academicPeriodName = "Term 1, 2026";
  term1.report.average = 82.4;
  term1.report.total = 329.6;
  term1.report.overallPosition = 4;

  term2.header.academicPeriod = { ...term2.header.academicPeriod, name: "Term 2, 2026", formattedEndDate: "Jul 31, 2026" };
  term2.header.academicPeriodName = "Term 2, 2026";

  term3.header.academicPeriod = { ...term3.header.academicPeriod, name: "Term 3, 2026", formattedEndDate: "Dec 12, 2026" };
  term3.header.academicPeriodName = "Term 3, 2026";
  term3.report.average = 89.2;
  term3.report.total = 356.8;
  term3.report.overallPosition = 1;

  return {
    generatedAt: "2026-07-07T12:00:00.000Z",
    title: "Cumulative Academic Report Book",
    subtitle: "Student Academic Journey",
    header: term2.header,
    branding: term2.branding,
    student: {
      id: 1,
      fullName: "Jonathan Commey",
      admissionNumber: "STD-2026-014",
      gender: "Male",
      currentClassName: "Grade 6",
      parentName: "Parent / Guardian",
      parentPhone: "+233 24 000 0000",
      address: "Accra, Ghana",
      studentPhoto: "",
    },
    periods: [
      { id: 1, academicPeriodName: "Term 1, 2026", academicYear: "2026", dataset: term1, average: 82.4, position: 4, gpa: 3.54, recommendation: "promote" },
      { id: 2, academicPeriodName: "Term 2, 2026", academicYear: "2026", dataset: term2, average: 86, position: 2, gpa: 3.82, recommendation: "promote" },
      { id: 3, academicPeriodName: "Term 3, 2026", academicYear: "2026", dataset: term3, average: 89.2, position: 1, gpa: 3.9, recommendation: "promote" },
    ],
    notes: [
      "This is a preview-only academic booklet using dummy records.",
      "Actual cumulative books will use the student's saved report snapshots.",
    ],
  };
}

function createDummyCumulativeTranscriptPreviewDataset(args: {
  schoolName?: string;
  branchName?: string;
  primaryColor?: string;
  fontFamily?: string;
  logo?: string;
  reportCardWatermark?: string;
}) {
  const schoolName = args.schoolName || "Eleeveon International Academy";
  const branchName = args.branchName || "Main Campus";
  const primaryColor = args.primaryColor || "#111827";

  return {
    generatedAt: "2026-07-07T12:00:00.000Z",
    header: {
      branding: {
        schoolName,
        branchName,
        primaryColor,
        fontFamily: args.fontFamily || "Arial, sans-serif",
        logo: args.logo || "",
        reportCardWatermark: args.reportCardWatermark || args.logo || "",
        address: "P.O. Box 100, Accra",
        phone: "+233 24 000 0000",
        email: "records@school.edu.gh",
        website: "www.school.edu.gh",
        motto: "Excellence, Character and Service",
      },
      academicStructure: { id: 1, name: "Basic School" },
      academicPeriod: { id: 3, name: "Term 3, 2026" },
      classData: { id: 1, name: "Grade 6" },
    },
    transcript: {
      studentId: 1,
      studentName: "Jonathan Commey",
      admissionNumber: "STD-2026-014",
      gender: "Male",
      studentPhoto: "",
      currentClassName: "Grade 6",
      parentName: "Parent / Guardian",
      guardianName: "Parent / Guardian",
      periods: [
        {
          academicPeriodId: 1,
          academicPeriodName: "Term 1, 2026",
          academicYear: "2026",
          className: "Grade 6",
          total: 329.6,
          average: 82.4,
          gpa: 3.54,
          position: 4,
          recommendation: "promote",
          subjectResults: [
            { subjectId: 1, subjectName: "English Language", subjectCode: "ENG", percentage: 82, grade: "A", remark: "Very Good", position: 3 },
            { subjectId: 2, subjectName: "Mathematics", subjectCode: "MATH", percentage: 86, grade: "A", remark: "Excellent", position: 2 },
            { subjectId: 3, subjectName: "Science", subjectCode: "SCI", percentage: 80, grade: "B+", remark: "Good", position: 5 },
          ],
        },
        {
          academicPeriodId: 2,
          academicPeriodName: "Term 2, 2026",
          academicYear: "2026",
          className: "Grade 6",
          total: 344,
          average: 86,
          gpa: 3.82,
          position: 2,
          recommendation: "promote",
          subjectResults: [
            { subjectId: 1, subjectName: "English Language", subjectCode: "ENG", percentage: 88, grade: "A", remark: "Excellent", position: 2 },
            { subjectId: 2, subjectName: "Mathematics", subjectCode: "MATH", percentage: 92, grade: "A+", remark: "Outstanding", position: 1 },
            { subjectId: 3, subjectName: "Science", subjectCode: "SCI", percentage: 84, grade: "A", remark: "Very Good", position: 3 },
          ],
        },
        {
          academicPeriodId: 3,
          academicPeriodName: "Term 3, 2026",
          academicYear: "2026",
          className: "Grade 6",
          total: 356.8,
          average: 89.2,
          gpa: 3.9,
          position: 1,
          recommendation: "promote",
          subjectResults: [
            { subjectId: 1, subjectName: "English Language", subjectCode: "ENG", percentage: 90, grade: "A+", remark: "Outstanding", position: 1 },
            { subjectId: 2, subjectName: "Mathematics", subjectCode: "MATH", percentage: 94, grade: "A+", remark: "Outstanding", position: 1 },
            { subjectId: 3, subjectName: "Science", subjectCode: "SCI", percentage: 88, grade: "A", remark: "Excellent", position: 2 },
          ],
        },
      ],
      academicYears: [],
      subjectHistories: [],
      progression: [],
      totalPeriods: 3,
      totalSubjects: 3,
      cumulativeTotal: 1030.4,
      cumulativeAverage: 85.9,
      cumulativeGPA: 3.75,
      highestAverage: 89.2,
      lowestAverage: 82.4,
      latestAverage: 89.2,
      latestPosition: 1,
      latestDecision: "promote",
      overallTrend: "up",
    },
  };
}

const reportBooleanKeys: (keyof ReportTemplateForm)[] = [
  "showSubjectPosition",
  "showClassPosition",
  "showNumberOnRoll",
  "showAttendance",
  "showAttendancePercent",
  "showStudentPhoto",
  "showTeacherNames",
  "showCurrentAcademicPeriodEnd",
  "showNextAcademicPeriod",
  "showPromotionStatus",
  "showGPA",
  "showAverage",
  "showTotal",
  "showGrade",
  "showSubjectRemarks",
  "showWatermark",
  "showParentSignature",
  "showGeneratedDate",
  "showBookFrontCover",
  "showBookStudentProfilePage",
  "showBookAcademicJourneyPage",
  "showBookSummaryPage",
  "showBookBackCover",
  "showTranscriptTermBreakdown",
  "showTranscriptYearAverage",
  "showTranscriptCumulativeAverage",
  "showTranscriptCumulativePosition",
  "showTranscriptGPAProgression",
  "showTranscriptFinalRecommendation",
];


// ======================================================
// HELPERS
// ======================================================

function sameId(a: unknown, b: unknown) {
  return String(a ?? "") === String(b ?? "");
}

const idOf = (value: unknown) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const SETTINGS_MEDIA_OWNER_TABLE = "schoolBranchSettings";
const SCHOOL_MEDIA_OWNER_TABLE = "schools";
const BRANCH_MEDIA_OWNER_TABLE = "branches";
const GALLERY_FIELD_KEY = "schoolGalleryImages";

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

function mediaIdFieldFor(field: ImageField) {
  return `${field}MediaId` as keyof SettingsForm;
}

function schoolMediaIdFieldFor(field: keyof SchoolForm) {
  return `${String(field)}MediaId` as keyof SchoolForm;
}

function branchMediaIdFieldFor(field: keyof BranchForm) {
  return `${String(field)}MediaId` as keyof BranchForm;
}

function isPositiveMediaId(value: unknown) {
  return idOf(value) > 0;
}

function mediaIdOrNull(value: unknown) {
  const parsed = idOf(value);
  return parsed > 0 ? parsed : null;
}

function safeRecordMediaValue(value?: string) {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
}

function assetPreviewKey(ownerTable: string, ownerLocalId: number, fieldKey: string) {
  return `${ownerTable}:${ownerLocalId}:${fieldKey}`;
}

function createSettingsMediaSessionKey() {
  return createSharedMediaSessionKey(SETTINGS_MEDIA_OWNER_TABLE);
}

function createPendingRemoval(args: {
  assetId?: unknown;
  ownerTable: string;
  fieldKey: string;
  accountId?: string | null;
  schoolId?: unknown;
  branchId?: unknown;
  ownerLocalId?: unknown;
  ownerCloudId?: string | null;
  ownerTempKey?: string | null;
}): PendingMediaRemoval {
  return {
    assetId: idOf(args.assetId) || null,
    ownerTable: args.ownerTable,
    fieldKey: args.fieldKey,
    accountId: args.accountId || null,
    schoolId: idOf(args.schoolId) || null,
    branchId: idOf(args.branchId) || null,
    ownerLocalId: idOf(args.ownerLocalId) || null,
    ownerCloudId: args.ownerCloudId || null,
    ownerTempKey: args.ownerTempKey || null,
  };
}

function hasOwn(source: any, key: string) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function valueOrExisting<T>(source: any, key: string, existingValue: T): T {
  return hasOwn(source, key) ? source[key] : existingValue;
}

function makeSettingsPayload(
  payload: Partial<SchoolBranchSetting>,
  existing?: Partial<SchoolBranchSetting>
): SchoolBranchSetting {
  const now = Date.now();

  return {
    ...(existing || {}),
    ...payload,
    accountId: payload.accountId ?? existing?.accountId ?? "",
    schoolId: Number(payload.schoolId ?? existing?.schoolId ?? 0),
    branchId: Number(payload.branchId ?? existing?.branchId ?? 0),

    mode: payload.mode ?? existing?.mode ?? "manual",
    theme: payload.theme ?? existing?.theme ?? "light",
    primaryColor: payload.primaryColor ?? existing?.primaryColor ?? "#2f6fed",
    fontFamily: payload.fontFamily ?? existing?.fontFamily ?? "system-ui, -apple-system, sans-serif",
    fontSize: Number(payload.fontSize ?? existing?.fontSize ?? 16),

    academicYear: payload.academicYear ?? existing?.academicYear ?? "",
    currentTerm: payload.currentTerm ?? existing?.currentTerm ?? "Term 1",
    currentAcademicStructureId:
      payload.currentAcademicStructureId ?? existing?.currentAcademicStructureId,
    currentAcademicPeriodId:
      payload.currentAcademicPeriodId ?? existing?.currentAcademicPeriodId,

    logo: valueOrExisting(payload, "logo", existing?.logo),
    logoMediaId: hasOwn(payload as any, "logoMediaId") ? (payload as any).logoMediaId : (existing as any)?.logoMediaId,
    reportCardBackgroundImage:
      valueOrExisting(payload, "reportCardBackgroundImage", existing?.reportCardBackgroundImage),
    reportCardBackgroundImageMediaId:
      hasOwn(payload as any, "reportCardBackgroundImageMediaId") ? (payload as any).reportCardBackgroundImageMediaId : (existing as any)?.reportCardBackgroundImageMediaId,
    reportCardWatermark:
      valueOrExisting(payload, "reportCardWatermark", existing?.reportCardWatermark),
    reportCardWatermarkMediaId:
      hasOwn(payload as any, "reportCardWatermarkMediaId") ? (payload as any).reportCardWatermarkMediaId : (existing as any)?.reportCardWatermarkMediaId,
    reportCardSignatureImage:
      valueOrExisting(payload, "reportCardSignatureImage", existing?.reportCardSignatureImage),
    reportCardSignatureImageMediaId:
      hasOwn(payload as any, "reportCardSignatureImageMediaId") ? (payload as any).reportCardSignatureImageMediaId : (existing as any)?.reportCardSignatureImageMediaId,
    dashboardHeroImage: valueOrExisting(payload, "dashboardHeroImage", existing?.dashboardHeroImage),
    dashboardHeroImageMediaId: hasOwn(payload as any, "dashboardHeroImageMediaId") ? (payload as any).dashboardHeroImageMediaId : (existing as any)?.dashboardHeroImageMediaId,
    dashboardBannerImage: valueOrExisting(payload, "dashboardBannerImage", existing?.dashboardBannerImage),
    dashboardBannerImageMediaId: hasOwn(payload as any, "dashboardBannerImageMediaId") ? (payload as any).dashboardBannerImageMediaId : (existing as any)?.dashboardBannerImageMediaId,
    studentPortalImage: valueOrExisting(payload, "studentPortalImage", existing?.studentPortalImage),
    studentPortalImageMediaId: hasOwn(payload as any, "studentPortalImageMediaId") ? (payload as any).studentPortalImageMediaId : (existing as any)?.studentPortalImageMediaId,
    teacherPortalImage: valueOrExisting(payload, "teacherPortalImage", existing?.teacherPortalImage),
    teacherPortalImageMediaId: hasOwn(payload as any, "teacherPortalImageMediaId") ? (payload as any).teacherPortalImageMediaId : (existing as any)?.teacherPortalImageMediaId,
    classroomPlaceholderImage:
      valueOrExisting(payload, "classroomPlaceholderImage", existing?.classroomPlaceholderImage),
    classroomPlaceholderImageMediaId:
      hasOwn(payload as any, "classroomPlaceholderImageMediaId") ? (payload as any).classroomPlaceholderImageMediaId : (existing as any)?.classroomPlaceholderImageMediaId,
    subjectPlaceholderImage:
      valueOrExisting(payload, "subjectPlaceholderImage", existing?.subjectPlaceholderImage),
    subjectPlaceholderImageMediaId:
      hasOwn(payload as any, "subjectPlaceholderImageMediaId") ? (payload as any).subjectPlaceholderImageMediaId : (existing as any)?.subjectPlaceholderImageMediaId,
    schoolGalleryImages: Array.isArray(payload.schoolGalleryImages)
      ? payload.schoolGalleryImages
      : Array.isArray(existing?.schoolGalleryImages)
        ? existing?.schoolGalleryImages
        : [],
    schoolGalleryMediaIds: Array.isArray((payload as any).schoolGalleryMediaIds)
      ? (payload as any).schoolGalleryMediaIds
      : Array.isArray((existing as any)?.schoolGalleryMediaIds)
        ? (existing as any).schoolGalleryMediaIds
        : [],

    createdAt: existing?.createdAt || payload.createdAt || now,
    updatedAt: now,
    version: Number(existing?.version || 0) + 1,
    cloudId: payload.cloudId ?? existing?.cloudId,
    synced: "pending" as unknown as SchoolBranchSetting["synced"],
    isDeleted: payload.isDeleted ?? existing?.isDeleted ?? false,
  } as unknown as SchoolBranchSetting;
}


function makeReportTemplatePayload(args: {
  form: ReportTemplateForm;
  accountId: string;
  schoolId: number;
  branchId: number;
  existing?: any;
}) {
  const now = Date.now();
  const existing = args.existing || {};

  return {
    ...existing,
    accountId: args.accountId,
    schoolId: args.schoolId,
    branchId: args.branchId,
    name: args.form.templateName?.trim() || defaultReportTemplateDefinition().name || "Classic Formal",
    code: args.form.templateCode?.trim() || defaultReportTemplateDefinition().code || "classic_formal",
    layoutKey: args.form.layoutKey || defaultReportTemplateDefinition().layoutKey || "classic_formal",
    orientation: args.form.orientation || "portrait",
    paperSize: args.form.paperSize || "A4",
    density: args.form.density || "compact",
    templateKey: args.form.templateCode?.trim() || args.form.layoutKey,
    reportType: args.form.reportType || "student_report",
    description: existing.description || (
      args.form.reportType === "cumulative_book"
        ? "Default configurable cumulative report book template."
        : args.form.reportType === "cumulative_transcript"
          ? "Default configurable cumulative transcript template."
          : "Default configurable student report card template."
    ),
    active: args.form.active !== false,
    isDefault: true,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    version: Number(existing.version || 0) + 1,
    synced: "pending",
    isDeleted: false,
  };
}

function makeReportTemplateSettingsPayload(args: {
  form: ReportTemplateForm;
  accountId: string;
  schoolId: number;
  branchId: number;
  templateId: number;
  existing?: any;
}) {
  const now = Date.now();
  const existing = args.existing || {};

  return {
    ...existing,
    accountId: args.accountId,
    schoolId: args.schoolId,
    branchId: args.branchId,
    templateId: args.templateId,
    templateCode: args.form.templateCode,
    layoutKey: args.form.layoutKey,
    templateKey: args.form.templateCode,
    templateName: args.form.templateName,
    reportType: args.form.reportType || "student_report",

    orientation: args.form.orientation,
    paperSize: args.form.paperSize,
    density: args.form.density,

    showSubjectPosition: !!args.form.showSubjectPosition,
    showClassPosition: !!args.form.showClassPosition,
    showNumberOnRoll: !!args.form.showNumberOnRoll,
    showAttendance: !!args.form.showAttendance,
    showAttendancePercent: !!args.form.showAttendancePercent,
    showStudentPhoto: !!args.form.showStudentPhoto,
    showTeacherNames: !!args.form.showTeacherNames,
    showCurrentAcademicPeriodEnd: !!args.form.showCurrentAcademicPeriodEnd,
    showNextAcademicPeriod: !!args.form.showNextAcademicPeriod,
    showPromotionStatus: !!args.form.showPromotionStatus,
    showGPA: !!args.form.showGPA,
    showAverage: !!args.form.showAverage,
    showTotal: !!args.form.showTotal,
    showGrade: !!args.form.showGrade,
    showSubjectRemarks: !!args.form.showSubjectRemarks,
    showWatermark: !!args.form.showWatermark,
    showParentSignature: !!args.form.showParentSignature,
    showGeneratedDate: !!args.form.showGeneratedDate,

    showBookFrontCover: !!args.form.showBookFrontCover,
    showBookStudentProfilePage: !!args.form.showBookStudentProfilePage,
    showBookAcademicJourneyPage: !!args.form.showBookAcademicJourneyPage,
    showBookSummaryPage: !!args.form.showBookSummaryPage,
    showBookBackCover: !!args.form.showBookBackCover,

    showTranscriptTermBreakdown: !!args.form.showTranscriptTermBreakdown,
    showTranscriptYearAverage: !!args.form.showTranscriptYearAverage,
    showTranscriptCumulativeAverage: !!args.form.showTranscriptCumulativeAverage,
    showTranscriptCumulativePosition: !!args.form.showTranscriptCumulativePosition,
    showTranscriptGPAProgression: !!args.form.showTranscriptGPAProgression,
    showTranscriptFinalRecommendation: !!args.form.showTranscriptFinalRecommendation,

    classTeacherLabel: args.form.classTeacherLabel?.trim() || "Class Teacher",
    headTeacherLabel: args.form.headTeacherLabel?.trim() || "Headteacher / Principal",
    parentLabel: args.form.parentLabel?.trim() || "Parent / Guardian",
    principalLabel: args.form.principalLabel?.trim() || "Principal",
    currentAcademicPeriodEndLabel: args.form.currentAcademicPeriodEndLabel?.trim() || "This Academic Period Ends",
    nextAcademicPeriodLabel: args.form.nextAcademicPeriodLabel?.trim() || "Next Academic Period Begins",
    numberOnRollLabel: args.form.numberOnRollLabel?.trim() || "Number On Roll",
    classPositionLabel: args.form.classPositionLabel?.trim() || "Class Position",
    subjectPositionLabel: args.form.subjectPositionLabel?.trim() || "Position",
    generatedDateLabel: args.form.generatedDateLabel?.trim() || "Generated",
    bookTitleLabel: args.form.bookTitleLabel?.trim() || "Cumulative Academic Report Book",
    bookSubtitleLabel: args.form.bookSubtitleLabel?.trim() || "Student Academic Journey",
    studentNameLabel: args.form.studentNameLabel?.trim() || "Student",
    admissionNumberLabel: args.form.admissionNumberLabel?.trim() || "Student ID",
    genderLabel: args.form.genderLabel?.trim() || "Gender",
    classLabel: args.form.classLabel?.trim() || "Class",
    academicStructureLabel: args.form.academicStructureLabel?.trim() || "Academic Structure",
    academicPeriodLabel: args.form.academicPeriodLabel?.trim() || "Academic Period",
    subjectLabel: args.form.subjectLabel?.trim() || "Subject",
    totalLabel: args.form.totalLabel?.trim() || "Total",
    averageLabel: args.form.averageLabel?.trim() || "Average",
    gradeLabel: args.form.gradeLabel?.trim() || "Grade",
    gpaLabel: args.form.gpaLabel?.trim() || "GPA",
    footerText: args.form.footerText?.trim() || "Official academic document generated by Eleeveon Schools.",

    active: args.form.active !== false,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    version: Number(existing.version || 0) + 1,
    synced: "pending",
    isDeleted: false,
  };
}

function makeReportTemplateAssignmentPayload(args: {
  form: ReportTemplateForm;
  accountId: string;
  schoolId: number;
  branchId: number;
  templateId: number;
  templateSettingsId: number;
  existing?: any;
}) {
  const now = Date.now();
  const existing = args.existing || {};

  return {
    ...existing,
    accountId: args.accountId,
    schoolId: args.schoolId,
    branchId: args.branchId,
    templateId: args.templateId,
    templateSettingsId: args.templateSettingsId,
    templateCode: args.form.templateCode,
    layoutKey: args.form.layoutKey,
    templateKey: args.form.templateCode,
    reportType: args.form.reportType || "student_report",
    scopeType: "branch",
    scopeId: args.branchId,
    isDefault: true,
    active: args.form.active !== false,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    version: Number(existing.version || 0) + 1,
    synced: "pending",
    isDeleted: false,
  };
}

function assetReady(value: unknown) {
  return !!String(value || "").trim();
}

// Settings has no delete action, but keeping the shared CRUD toolkit import
// makes future soft-delete additions consistent with the other golden modules.
void softDeleteLocal;

// ======================================================
// COMPONENT
// ======================================================

export default function Branchsettings() {
  const accountContext = useAccount() as any;
  const { accountId, authenticated, loading: accountLoading } = accountContext;

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
    refreshInstitution,
  } = useActiveBranch() as any;
  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const selectedAccountId = accountId || settings?.accountId;
  const selectedSchoolId = selectedWorkspaceSchoolId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeSchoolId,
    activeSchool: activeSchool as any,
    settings: settings as any,
  });
  const selectedBranchId = selectedWorkspaceBranchId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeBranchId,
    activeBranch: activeBranch as any,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState<SettingsSection | null>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [settingsRow, setSettingsRow] = useState<SchoolBranchSetting | null>(null);
  const [reportTemplates, setReportTemplates] = useState<ReportTemplateRow[]>([]);
  const [reportTemplateSettingsRow, setReportTemplateSettingsRow] = useState<ReportTemplateSettingsRow | null>(null);
  const [reportTemplateAssignmentRow, setReportTemplateAssignmentRow] = useState<ReportTemplateAssignmentRow | null>(null);

  const [form, setForm] = useState<SettingsForm>(
    defaultForm(selectedSchoolId, selectedBranchId)
  );
  const [schoolForm, setSchoolForm] = useState<SchoolForm>({});
  const [branchForm, setBranchForm] = useState<BranchForm>({});
  const [reportTemplateForm, setReportTemplateForm] = useState<ReportTemplateForm>(defaultReportTemplateForm());

  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingReportTemplate, setSavingReportTemplate] = useState(false);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<Record<string, string>>({});
  const [pendingMediaRemovals, setPendingMediaRemovals] = useState<PendingMediaRemoval[]>([]);
  const settingsMediaSessionKeyRef = useRef(createSettingsMediaSessionKey());

  // ======================================================
  // TENANT HELPERS
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === selectedAccountId) &&
    (!row.schoolId || sameId(row.schoolId, selectedSchoolId)) &&
    (!row.branchId || sameId(row.branchId, selectedBranchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  const clearData = () => {
    Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
    setMediaPreviewUrls({});
    setSchool(null);
    setBranch(null);
    setSettingsRow(null);
    setReportTemplates([]);
    setReportTemplateSettingsRow(null);
    setReportTemplateAssignmentRow(null);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setSchoolForm({});
    setBranchForm({});
    setReportTemplateForm(defaultReportTemplateForm());
    setPendingMediaRemovals([]);
    setForm(defaultForm(selectedSchoolId, selectedBranchId));
  };


  const resolveOwnedAssetUrl = async ({
    ownerTable,
    ownerLocalId,
    ownerCloudId,
    fieldKey,
    fallbackMediaId,
  }: {
    ownerTable: string;
    ownerLocalId?: number | string | null;
    ownerCloudId?: string | null;
    fieldKey: string;
    fallbackMediaId?: number | string | null;
  }) => {
    const localId = idOf(ownerLocalId);

    if (localId) {
      const ownedAsset = await getOwnerFieldMediaAsset({
        accountId: selectedAccountId || undefined,
        ownerTable,
        ownerLocalId: localId,
        ownerCloudId: ownerCloudId || undefined,
        fieldKey,
      });

      if (ownedAsset?.id && !(ownedAsset as any).isDeleted && (ownedAsset as any).active !== false) {
        const url = await getMediaObjectUrl(Number(ownedAsset.id));
        if (url) return url;
      }
    }

    const fallbackId = idOf(fallbackMediaId);
    if (!fallbackId) return "";

    const fallbackAsset = await (db as any).mediaAssets?.get?.(fallbackId);
    const belongsToOwner =
      fallbackAsset &&
      !fallbackAsset.isDeleted &&
      fallbackAsset.active !== false &&
      (!selectedAccountId || fallbackAsset.accountId === selectedAccountId) &&
      fallbackAsset.ownerTable === ownerTable &&
      fallbackAsset.fieldKey === fieldKey &&
      (!localId || sameId(fallbackAsset.ownerLocalId, localId));

    if (!belongsToOwner) return "";
    return getMediaObjectUrl(fallbackId);
  };

  const resolveBranchSettingsMedia = async ({
    currentSchool,
    currentBranch,
    currentSetting,
  }: {
    currentSchool?: School | null;
    currentBranch?: Branch | null;
    currentSetting?: SchoolBranchSetting | null;
  }) => {
    const next: Record<string, string> = {};

    const resolveAndPut = async (
      ownerTable: string,
      ownerLocalId: number | string | null | undefined,
      ownerCloudId: string | null | undefined,
      fieldKey: string,
      fallbackMediaId?: number | string | null
    ) => {
      const localId = idOf(ownerLocalId);
      if (!localId) return "";

      const url = await resolveOwnedAssetUrl({
        ownerTable,
        ownerLocalId: localId,
        ownerCloudId: ownerCloudId || undefined,
        fieldKey,
        fallbackMediaId,
      });

      if (url) next[assetPreviewKey(ownerTable, localId, fieldKey)] = url;
      return url;
    };

    const schoolIdValue = idOf((currentSchool as any)?.id);
    const branchIdValue = idOf((currentBranch as any)?.id);
    const settingIdValue = idOf((currentSetting as any)?.id);

    const schoolLogoUrl = await resolveAndPut(
      SCHOOL_MEDIA_OWNER_TABLE,
      schoolIdValue,
      (currentSchool as any)?.cloudId,
      "logo",
      (currentSchool as any)?.logoMediaId
    );
    const schoolBannerUrl = await resolveAndPut(
      SCHOOL_MEDIA_OWNER_TABLE,
      schoolIdValue,
      (currentSchool as any)?.cloudId,
      "bannerImage",
      (currentSchool as any)?.bannerImageMediaId
    );

    const branchLogoUrl = await resolveAndPut(
      BRANCH_MEDIA_OWNER_TABLE,
      branchIdValue,
      (currentBranch as any)?.cloudId,
      "logo",
      (currentBranch as any)?.logoMediaId
    );
    const branchBannerUrl = await resolveAndPut(
      BRANCH_MEDIA_OWNER_TABLE,
      branchIdValue,
      (currentBranch as any)?.cloudId,
      "bannerImage",
      (currentBranch as any)?.bannerImageMediaId
    );

    const settingUrls: Partial<Record<ImageField, string>> = {};
    for (const field of [
      "logo",
      "reportCardBackgroundImage",
      "reportCardWatermark",
      "reportCardSignatureImage",
      "dashboardHeroImage",
      "dashboardBannerImage",
      "studentPortalImage",
      "teacherPortalImage",
      "classroomPlaceholderImage",
      "subjectPlaceholderImage",
    ] as ImageField[]) {
      const url = await resolveAndPut(
        SETTINGS_MEDIA_OWNER_TABLE,
        settingIdValue,
        (currentSetting as any)?.cloudId,
        field,
        (currentSetting as any)?.[mediaIdFieldFor(field)]
      );
      if (url) settingUrls[field] = url;
    }

    const galleryUrls: string[] = [];
    const galleryIds = Array.isArray((currentSetting as any)?.schoolGalleryMediaIds)
      ? (currentSetting as any).schoolGalleryMediaIds
      : [];

    for (const assetId of galleryIds) {
      const url = await resolveOwnedAssetUrl({
        ownerTable: SETTINGS_MEDIA_OWNER_TABLE,
        ownerLocalId: settingIdValue,
        ownerCloudId: (currentSetting as any)?.cloudId,
        fieldKey: GALLERY_FIELD_KEY,
        fallbackMediaId: assetId,
      });
      if (url) galleryUrls.push(url);
    }

    setMediaPreviewUrls((current) => {
      Object.values(current).forEach((url) => {
        if (!Object.values(next).includes(url)) revokeMediaObjectUrl(url);
      });
      return next;
    });

    return {
      schoolLogoUrl,
      schoolBannerUrl,
      branchLogoUrl,
      branchBannerUrl,
      settingUrls,
      galleryUrls,
    };
  };

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    if (!authenticated || !selectedAccountId || !selectedSchoolId || !selectedBranchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
  
      const [
        schoolRows,
        branchRows,
        settingRows,
        structureRows,
        periodRows,
        reportTemplateRows,
        reportTemplateSettingsRows,
        reportTemplateAssignmentRows,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.schoolBranchSettings.toArray(),
        listActiveLocal("academicStructures", {
          accountId: selectedAccountId,
          schoolId: Number(selectedSchoolId),
          branchId: Number(selectedBranchId),
        } as any),
        listActiveLocal("academicPeriods", {
          accountId: selectedAccountId,
          schoolId: Number(selectedSchoolId),
          branchId: Number(selectedBranchId),
        } as any),
        (db as any).reportCardTemplates?.toArray?.() || [],
        (db as any).reportCardTemplateSettings?.toArray?.() || [],
        (db as any).reportCardTemplateAssignments?.toArray?.() || [],
      ]);

      const currentSchool =
        schoolRows.find(
          (row: any) =>
            row.accountId === selectedAccountId &&
            sameId(row.id, selectedSchoolId) &&
            !row.isDeleted
        ) ||
        schoolRows.find((row: any) => sameId(row.id, selectedSchoolId) && !row.isDeleted) ||
        null;

      const currentBranch =
        branchRows.find(
          (row: any) =>
            row.accountId === selectedAccountId &&
            sameId(row.schoolId, selectedSchoolId) &&
            sameId(row.id, selectedBranchId) &&
            !row.isDeleted
        ) ||
        branchRows.find(
          (row: any) =>
            sameId(row.schoolId, selectedSchoolId) &&
            sameId(row.id, selectedBranchId) &&
            !row.isDeleted
        ) ||
        null;

      const currentSetting =
        settingRows.find((row: any) => sameTenant(row)) || null;

      const dbReportTemplates = (reportTemplateRows as ReportTemplateRow[])
        .filter((row: any) => {
          if (row.isDeleted || row.active === false) return false;
          if (row.accountId && row.accountId !== selectedAccountId) return false;
          if (row.schoolId && !sameId(row.schoolId, selectedSchoolId)) return false;
          if (row.branchId && !sameId(row.branchId, selectedBranchId)) return false;
          return true;
        });

      const templateMap = new Map<string, ReportTemplateRow>();

      reportTemplateDefinitionOptions().forEach((template) => {
        const baseKey = String(template.code || template.layoutKey || template.name || "").trim();
        const reportTypeKey = String(template.reportType || "student_report");
        const key = baseKey ? `${reportTypeKey}:${baseKey}` : "";
        if (key) templateMap.set(key, template);
      });

      dbReportTemplates.forEach((template) => {
        const baseKey = String(template.code || template.layoutKey || template.name || template.id || "").trim();
        const reportTypeKey = String(template.reportType || "student_report");
        const key = baseKey ? `${reportTypeKey}:${baseKey}` : "";
        if (key) {
          templateMap.set(key, {
            ...(templateMap.get(key) || {}),
            ...template,
            reportType: (template as any).reportType || (templateMap.get(key) as any)?.reportType || "student_report",
          });
        }
      });

      const branchReportTemplates = Array.from(templateMap.values())
        .filter((row: any) => row.active !== false && !row.isDeleted)
        .sort((a: any, b: any) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return String(a.name || "").localeCompare(String(b.name || ""));
        });

      const defaultReportTemplate =
        branchReportTemplates.find((row: any) => row.isDefault) ||
        branchReportTemplates.find((row: any) => String(row.code || "") === defaultReportTemplateDefinition().code) ||
        branchReportTemplates[0] ||
        defaultReportTemplateDefinition();

      const currentReportAssignment =
        (reportTemplateAssignmentRows as ReportTemplateAssignmentRow[]).find((row: any) =>
          sameTenant(row) &&
          row.active !== false &&
          (row.reportType === "student_report" || !row.reportType) &&
          row.isDefault === true &&
          (!row.scopeType || row.scopeType === "branch")
        ) ||
        (reportTemplateAssignmentRows as ReportTemplateAssignmentRow[]).find((row: any) =>
          sameTenant(row) &&
          row.active !== false &&
          (row.reportType === "student_report" || !row.reportType)
        ) ||
        null;

      const assignedTemplateId = idOf(currentReportAssignment?.templateId) || idOf(defaultReportTemplate?.id);

      const assignedTemplateCode = String((currentReportAssignment as any)?.templateCode || "").trim();

      const currentReportTemplate =
        branchReportTemplates.find((row: any) => assignedTemplateId > 0 && sameId(row.id, assignedTemplateId)) ||
        branchReportTemplates.find((row: any) => assignedTemplateCode && sameId(row.code, assignedTemplateCode)) ||
        defaultReportTemplate;

      const assignedSettingsId = idOf(currentReportAssignment?.templateSettingsId);

      const currentReportTemplateSettings =
        (reportTemplateSettingsRows as ReportTemplateSettingsRow[]).find((row: any) =>
          sameTenant(row) &&
          row.active !== false &&
          (row.reportType === "student_report" || !row.reportType) &&
          assignedSettingsId > 0 &&
          sameId(row.id, assignedSettingsId)
        ) ||
        (reportTemplateSettingsRows as ReportTemplateSettingsRow[]).find((row: any) =>
          sameTenant(row) &&
          row.active !== false &&
          (row.reportType === "student_report" || !row.reportType) &&
          currentReportTemplate?.id &&
          sameId(row.templateId, currentReportTemplate.id)
        ) ||
        (reportTemplateSettingsRows as ReportTemplateSettingsRow[]).find((row: any) =>
          sameTenant(row) &&
          row.active !== false &&
          (row.reportType === "student_report" || !row.reportType)
        ) ||
        null;

      const branchStructures = structureRows
        .filter((row: any) => sameTenant(row))
        .filter((row: any) => row.active !== false)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      const branchPeriods = periodRows
        .filter((row: any) => sameTenant(row))
        .filter((row: any) => row.active !== false)
        .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0));

      const mediaUrls = await resolveBranchSettingsMedia({
        currentSchool,
        currentBranch,
        currentSetting,
      });

      setSchool(currentSchool);
      setBranch(currentBranch);
      setSettingsRow(currentSetting);
      setReportTemplates(branchReportTemplates);
      setReportTemplateSettingsRow(currentReportTemplateSettings);
      setReportTemplateAssignmentRow(currentReportAssignment);
      setAcademicStructures(branchStructures);
      setAcademicPeriods(branchPeriods);

      setSchoolForm({
        id: currentSchool?.id,
        name: currentSchool?.name || "",
        motto: currentSchool?.motto || "",
        logo: mediaUrls.schoolLogoUrl || safeRecordMediaValue(currentSchool?.logo || currentSchool?.photo) || "",
        logoMediaId: (currentSchool as any)?.logoMediaId,
        address: currentSchool?.address || "",
        location: (currentSchool as any)?.location || "",
        email: currentSchool?.email || "",
        phone: currentSchool?.phone || "",
        website: currentSchool?.website || "",
        galleryImages: Array.isArray(currentSchool?.galleryImages)
          ? currentSchool.galleryImages
          : [],
        bannerImage: mediaUrls.schoolBannerUrl || safeRecordMediaValue(currentSchool?.bannerImage) || "",
        bannerImageMediaId: (currentSchool as any)?.bannerImageMediaId,
        active: (currentSchool as any)?.active !== false,
      });

      setBranchForm({
        id: currentBranch?.id,
        schoolId: currentBranch?.schoolId,
        name: currentBranch?.name || "",
        code: currentBranch?.code || "",
        address: currentBranch?.address || "",
        location: (currentBranch as any)?.location || currentBranch?.city || "",
        city: currentBranch?.city || "",
        email: currentBranch?.email || "",
        phone: currentBranch?.phone || "",
        website: (currentBranch as any)?.website || "",
        logo: mediaUrls.branchLogoUrl || safeRecordMediaValue(currentBranch?.logo || currentBranch?.photo) || "",
        logoMediaId: (currentBranch as any)?.logoMediaId,
        bannerImage: mediaUrls.branchBannerUrl || safeRecordMediaValue(currentBranch?.bannerImage) || "",
        bannerImageMediaId: (currentBranch as any)?.bannerImageMediaId,
        active: currentBranch?.active !== false,
      });

      setForm({
        ...defaultForm(selectedSchoolId, selectedBranchId),
        ...(currentSetting || {}),
        id: currentSetting?.id,
        schoolId: selectedSchoolId,
        branchId: selectedBranchId,
        fontSize: Number((currentSetting as any)?.fontSize || 16),
        fontFamily:
          (currentSetting as any)?.fontFamily ||
          "system-ui, -apple-system, sans-serif",
        primaryColor:
          (currentSetting as any)?.primaryColor ||
          settings?.primaryColor ||
          "#2f6fed",
        theme: ((currentSetting as any)?.theme || "light") as "light" | "dark",
        mode: (currentSetting as any)?.mode || "manual",
        currentTerm: (currentSetting as any)?.currentTerm || "Term 1",
        academicYear: (currentSetting as any)?.academicYear || "",
        currentAcademicStructureId:
          (currentSetting as any)?.currentAcademicStructureId || undefined,
        currentAcademicPeriodId:
          (currentSetting as any)?.currentAcademicPeriodId || undefined,
        logo: mediaUrls.settingUrls.logo || safeRecordMediaValue((currentSetting as any)?.logo) || "",
        logoMediaId: (currentSetting as any)?.logoMediaId,
        reportCardBackgroundImage:
          mediaUrls.settingUrls.reportCardBackgroundImage || safeRecordMediaValue((currentSetting as any)?.reportCardBackgroundImage) || "",
        reportCardBackgroundImageMediaId: (currentSetting as any)?.reportCardBackgroundImageMediaId,
        reportCardWatermark:
          mediaUrls.settingUrls.reportCardWatermark || safeRecordMediaValue((currentSetting as any)?.reportCardWatermark) || "",
        reportCardWatermarkMediaId: (currentSetting as any)?.reportCardWatermarkMediaId,
        reportCardSignatureImage:
          mediaUrls.settingUrls.reportCardSignatureImage || safeRecordMediaValue((currentSetting as any)?.reportCardSignatureImage) || "",
        reportCardSignatureImageMediaId: (currentSetting as any)?.reportCardSignatureImageMediaId,
        dashboardHeroImage:
          mediaUrls.settingUrls.dashboardHeroImage || safeRecordMediaValue((currentSetting as any)?.dashboardHeroImage) || "",
        dashboardHeroImageMediaId: (currentSetting as any)?.dashboardHeroImageMediaId,
        dashboardBannerImage:
          mediaUrls.settingUrls.dashboardBannerImage || safeRecordMediaValue((currentSetting as any)?.dashboardBannerImage) || "",
        dashboardBannerImageMediaId: (currentSetting as any)?.dashboardBannerImageMediaId,
        studentPortalImage:
          mediaUrls.settingUrls.studentPortalImage || safeRecordMediaValue((currentSetting as any)?.studentPortalImage) || "",
        studentPortalImageMediaId: (currentSetting as any)?.studentPortalImageMediaId,
        teacherPortalImage:
          mediaUrls.settingUrls.teacherPortalImage || safeRecordMediaValue((currentSetting as any)?.teacherPortalImage) || "",
        teacherPortalImageMediaId: (currentSetting as any)?.teacherPortalImageMediaId,
        classroomPlaceholderImage:
          mediaUrls.settingUrls.classroomPlaceholderImage || safeRecordMediaValue((currentSetting as any)?.classroomPlaceholderImage) || "",
        classroomPlaceholderImageMediaId: (currentSetting as any)?.classroomPlaceholderImageMediaId,
        subjectPlaceholderImage:
          mediaUrls.settingUrls.subjectPlaceholderImage || safeRecordMediaValue((currentSetting as any)?.subjectPlaceholderImage) || "",
        subjectPlaceholderImageMediaId: (currentSetting as any)?.subjectPlaceholderImageMediaId,
        schoolGalleryImages: mediaUrls.galleryUrls.length
          ? mediaUrls.galleryUrls
          : Array.isArray((currentSetting as any)?.schoolGalleryImages)
            ? (currentSetting as any).schoolGalleryImages.filter((value: string) => !!safeRecordMediaValue(value))
            : [],
        schoolGalleryMediaIds: Array.isArray((currentSetting as any)?.schoolGalleryMediaIds)
          ? (currentSetting as any).schoolGalleryMediaIds
          : [],
      });

      setReportTemplateForm({
        ...defaultReportTemplateForm(),
        ...(currentReportTemplateSettings || {}),
        templateId: idOf(currentReportTemplate?.id) || undefined,
        templateSettingsId: idOf(currentReportTemplateSettings?.id) || undefined,
        assignmentId: idOf(currentReportAssignment?.id) || undefined,
        reportType: "student_report",
        templateName: currentReportTemplate?.name || currentReportTemplateSettings?.templateName || defaultReportTemplateDefinition().name || "Classic Formal",
        templateCode: currentReportTemplate?.code || currentReportTemplateSettings?.templateCode || defaultReportTemplateDefinition().code || "classic_formal",
        layoutKey: currentReportTemplate?.layoutKey || currentReportTemplateSettings?.layoutKey || defaultReportTemplateDefinition().layoutKey || "classic_formal",
        orientation: (currentReportTemplateSettings?.orientation || currentReportTemplate?.orientation || "portrait") as "portrait" | "landscape",
        paperSize: (currentReportTemplateSettings?.paperSize || currentReportTemplate?.paperSize || "A4") as "A4" | "Letter",
        density: (currentReportTemplateSettings?.density || currentReportTemplate?.density || "compact") as "compact" | "comfortable" | "spacious",
      });

    } catch (error) {
      console.error("Failed to load branch settings:", error);
      clearData();
      showToast("error", "Failed to load branch settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    selectedAccountId,
    selectedSchoolId,
    selectedBranchId,
    accountLoading,
    settingsLoading,
    contextLoading,
  ]);

  useEffect(() => {
    return () => {
      Object.values(mediaPreviewUrls).forEach(revokeMediaObjectUrl);
    };
  }, [mediaPreviewUrls]);

  // ======================================================
  // DERIVED DATA
  // ======================================================

  const filteredAcademicStructures = useMemo(() => {
    return academicStructures
      .filter((structure: any) => sameId(structure.branchId, selectedBranchId))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [academicStructures, selectedBranchId]);

  const filteredAcademicPeriods = useMemo(() => {
    return academicPeriods
      .filter((period: any) => {
        if (!selectedBranchId) return false;
        if (!sameId(period.branchId, selectedBranchId)) return false;
        if (period.active === false) return false;
        if (
          form.currentAcademicStructureId &&
          !sameId(period.academicStructureId, form.currentAcademicStructureId)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [academicPeriods, selectedBranchId, form.currentAcademicStructureId]);

  const activeStructure = useMemo(() => {
    return filteredAcademicStructures.find((row: any) =>
      sameId(row.id, form.currentAcademicStructureId)
    );
  }, [filteredAcademicStructures, form.currentAcademicStructureId]);

  const activePeriod = useMemo(() => {
    return filteredAcademicPeriods.find((row: any) =>
      sameId(row.id, form.currentAcademicPeriodId)
    );
  }, [filteredAcademicPeriods, form.currentAcademicPeriodId]);

  const assetCount = [
    schoolForm.logo,
    schoolForm.bannerImage,
    branchForm.logo,
    branchForm.bannerImage,
    form.logo,
    form.dashboardHeroImage,
    form.dashboardBannerImage,
    form.studentPortalImage,
    form.teacherPortalImage,
    form.classroomPlaceholderImage,
    form.subjectPlaceholderImage,
    form.reportCardBackgroundImage,
    form.reportCardWatermark,
    form.reportCardSignatureImage,
  ].filter(Boolean).length + (form.schoolGalleryImages?.length || 0);

  const completion = useMemo(() => {
    const checks = [
      !!school?.name,
      !!branch?.name,
      !!form.academicYear,
      !!form.currentTerm,
      !!form.currentAcademicStructureId,
      !!form.currentAcademicPeriodId,
      !!form.primaryColor,
      !!form.logo || !!schoolForm.logo || !!branchForm.logo,
      !!form.dashboardHeroImage,
      !!form.reportCardSignatureImage,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [school, branch, form, schoolForm.logo, branchForm.logo]);


  // ======================================================
  // FIELD HELPERS
  // ======================================================

  const updateForm = (key: keyof SettingsForm, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSchoolField = (key: keyof SchoolForm, value: any) => {
    setSchoolForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateBranchField = (key: keyof BranchForm, value: any) => {
    setBranchForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateReportTemplateField = (key: keyof ReportTemplateForm, value: any) => {
    setReportTemplateForm((prev) => ({ ...prev, [key]: value }));
  };

  const queueMediaRemoval = (removal: PendingMediaRemoval) => {
    const normalized = createPendingRemoval({
      ...removal,
      accountId: removal.accountId || selectedAccountId || null,
      schoolId: removal.schoolId || selectedSchoolId || null,
      branchId: removal.branchId || selectedBranchId || null,
    });

    if (!normalized.assetId && !normalized.ownerLocalId && !normalized.ownerTempKey && !normalized.ownerCloudId) {
      return;
    }

    setPendingMediaRemovals((current) => {
      const exists = current.some(
        (item) =>
          idOf(item.assetId) === idOf(normalized.assetId) &&
          item.ownerTable === normalized.ownerTable &&
          item.fieldKey === normalized.fieldKey &&
          sameId(item.ownerLocalId, normalized.ownerLocalId) &&
          sameId(item.ownerTempKey, normalized.ownerTempKey) &&
          sameId(item.ownerCloudId, normalized.ownerCloudId)
      );

      return exists ? current : [...current, normalized];
    });
  };

  const clearSettingsImage = (field: ImageField) => {
    const mediaField = mediaIdFieldFor(field);
    const assetId = idOf(form[mediaField]);
    const ownerLocalId = settingsRow?.id || form.id || undefined;

    queueMediaRemoval(
      createPendingRemoval({
        assetId,
        ownerTable: SETTINGS_MEDIA_OWNER_TABLE,
        fieldKey: field,
        accountId: selectedAccountId,
        schoolId: selectedSchoolId,
        branchId: selectedBranchId,
        ownerLocalId,
        ownerCloudId: (settingsRow as any)?.cloudId,
        ownerTempKey: ownerLocalId ? null : settingsMediaSessionKeyRef.current,
      })
    );

    setForm((prev) => ({
      ...prev,
      [field]: "",
      [mediaField]: null as any,
    }));
  };

  const clearSchoolImage = (field: keyof SchoolForm) => {
    const mediaField = schoolMediaIdFieldFor(field);
    const assetId = idOf((schoolForm as any)[mediaField]);

    queueMediaRemoval(
      createPendingRemoval({
        assetId,
        ownerTable: SCHOOL_MEDIA_OWNER_TABLE,
        fieldKey: String(field),
        accountId: selectedAccountId,
        schoolId: selectedSchoolId,
        branchId: selectedBranchId,
        ownerLocalId: schoolForm.id,
        ownerCloudId: (school as any)?.cloudId,
      })
    );

    setSchoolForm((prev) => ({
      ...prev,
      [field]: "",
      [mediaField]: null as any,
    }));
  };

  const clearBranchImage = (field: keyof BranchForm) => {
    const mediaField = branchMediaIdFieldFor(field);
    const assetId = idOf((branchForm as any)[mediaField]);

    queueMediaRemoval(
      createPendingRemoval({
        assetId,
        ownerTable: BRANCH_MEDIA_OWNER_TABLE,
        fieldKey: String(field),
        accountId: selectedAccountId,
        schoolId: selectedSchoolId,
        branchId: selectedBranchId,
        ownerLocalId: branchForm.id,
        ownerCloudId: (branch as any)?.cloudId,
      })
    );

    setBranchForm((prev) => ({
      ...prev,
      [field]: "",
      [mediaField]: null as any,
    }));
  };

  const uploadImage = async (field: ImageField, file?: File) => {
    if (!file) return;
    if (!requireTenant()) return;

    try {
      const ownerLocalId = settingsRow?.id || form.id || undefined;
      const ownerTempKey = ownerLocalId ? undefined : settingsMediaSessionKeyRef.current;

      const result = await saveImageAsset(file, {
        accountId: selectedAccountId,
        schoolId: Number(selectedSchoolId),
        branchId: Number(selectedBranchId),
        ownerTable: SETTINGS_MEDIA_OWNER_TABLE,
        ownerLocalId,
        ownerTempKey,
        fieldKey: field,
        variant: field.includes("logo") || field.includes("Signature") ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateForm(field, result.previewUrl);
      updateForm(mediaIdFieldFor(field), result.assetId);
      setPendingMediaRemovals((current) =>
        current.filter(
          (item) =>
            item.assetId !== result.assetId ||
            item.ownerTable !== SETTINGS_MEDIA_OWNER_TABLE ||
            item.fieldKey !== field
        )
      );
      showToast("success", "Image optimized and stored as a media asset.");
    } catch (error: any) {
      console.error("Failed to process settings image:", error);
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const uploadSchoolImage = async (field: keyof SchoolForm, file?: File) => {
    if (!file) return;
    if (!selectedAccountId || !selectedSchoolId || !schoolForm.id) {
      showToast("error", "Assigned school record is required before uploading media.");
      return;
    }

    try {
      const result = await saveImageAsset(file, {
        accountId: selectedAccountId,
        schoolId: Number(selectedSchoolId),
        branchId: selectedBranchId ? Number(selectedBranchId) : undefined,
        ownerTable: SCHOOL_MEDIA_OWNER_TABLE,
        ownerLocalId: Number(schoolForm.id),
        fieldKey: String(field),
        variant: String(field).toLowerCase().includes("logo") ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateSchoolField(field, result.previewUrl);
      updateSchoolField(schoolMediaIdFieldFor(field), result.assetId);
      setPendingMediaRemovals((current) =>
        current.filter(
          (item) =>
            item.assetId !== result.assetId ||
            item.ownerTable !== SCHOOL_MEDIA_OWNER_TABLE ||
            item.fieldKey !== String(field)
        )
      );
      showToast("success", "School image optimized and stored as a media asset.");
    } catch (error: any) {
      console.error("Failed to process school image:", error);
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const uploadBranchImage = async (field: keyof BranchForm, file?: File) => {
    if (!file) return;
    if (!selectedAccountId || !selectedSchoolId || !selectedBranchId || !branchForm.id) {
      showToast("error", "Assigned branch record is required before uploading media.");
      return;
    }

    try {
      const result = await saveImageAsset(file, {
        accountId: selectedAccountId,
        schoolId: Number(selectedSchoolId),
        branchId: Number(selectedBranchId),
        ownerTable: BRANCH_MEDIA_OWNER_TABLE,
        ownerLocalId: Number(branchForm.id),
        fieldKey: String(field),
        variant: String(field).toLowerCase().includes("logo") ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateBranchField(field, result.previewUrl);
      updateBranchField(branchMediaIdFieldFor(field), result.assetId);
      setPendingMediaRemovals((current) =>
        current.filter(
          (item) =>
            item.assetId !== result.assetId ||
            item.ownerTable !== BRANCH_MEDIA_OWNER_TABLE ||
            item.fieldKey !== String(field)
        )
      );
      showToast("success", "Branch image optimized and stored as a media asset.");
    } catch (error: any) {
      console.error("Failed to process branch image:", error);
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const handleGalleryUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!requireTenant()) return;

    try {
      const ownerLocalId = settingsRow?.id || form.id || undefined;
      const ownerTempKey = ownerLocalId ? undefined : settingsMediaSessionKeyRef.current;
      const results = await Promise.all(
        Array.from(files).map((file) =>
          saveImageAsset(file, {
            accountId: selectedAccountId,
            schoolId: Number(selectedSchoolId),
            branchId: Number(selectedBranchId),
            ownerTable: SETTINGS_MEDIA_OWNER_TABLE,
            ownerLocalId,
            ownerTempKey,
            fieldKey: GALLERY_FIELD_KEY,
            variant: "cover",
            replaceExisting: false,
          })
        )
      );

      setForm((prev) => ({
        ...prev,
        schoolGalleryImages: [
          ...(prev.schoolGalleryImages || []),
          ...results.map((result) => result.previewUrl),
        ],
        schoolGalleryMediaIds: [
          ...(prev.schoolGalleryMediaIds || []),
          ...results.map((result) => result.assetId),
        ],
      }));
      showToast("success", "Gallery image(s) optimized and stored as media assets.");
    } catch (error: any) {
      console.error("Failed to process gallery images:", error);
      showToast("error", error?.message || "Failed to process gallery images.");
    }
  };

  const removeGalleryImage = (index: number) => {
    const assetId = idOf(form.schoolGalleryMediaIds?.[index]);
    const ownerLocalId = settingsRow?.id || form.id || undefined;

    queueMediaRemoval(
      createPendingRemoval({
        assetId,
        ownerTable: SETTINGS_MEDIA_OWNER_TABLE,
        fieldKey: GALLERY_FIELD_KEY,
        accountId: selectedAccountId,
        schoolId: selectedSchoolId,
        branchId: selectedBranchId,
        ownerLocalId,
        ownerCloudId: (settingsRow as any)?.cloudId,
        ownerTempKey: ownerLocalId ? null : settingsMediaSessionKeyRef.current,
      })
    );

    setForm((prev) => ({
      ...prev,
      schoolGalleryImages: (prev.schoolGalleryImages || []).filter((_, i) => i !== index),
      schoolGalleryMediaIds: (prev.schoolGalleryMediaIds || []).filter((_, i) => i !== index),
    }));
  };

  // ======================================================
  // SAVE HANDLERS
  // ======================================================

  const persistPendingMediaRemovals = async () => {
    const removals = pendingMediaRemovals.filter(
      (item) => isPositiveMediaId(item.assetId) || idOf(item.ownerLocalId) || item.ownerTempKey || item.ownerCloudId
    );

    if (!removals.length) return;

    const now = Date.now();
    const allAssets = await (db as any).mediaAssets?.toArray?.();

    const sameOptionalNumber = (a: unknown, b: unknown) => {
      if (!idOf(a) || !idOf(b)) return true;
      return sameId(a, b);
    };

    const sameOptionalString = (a: unknown, b: unknown) => {
      if (!String(a || "") || !String(b || "")) return true;
      return sameId(a, b);
    };

    const assetsToDelete = new Map<number, any>();

    for (const removal of removals) {
      if (isPositiveMediaId(removal.assetId)) {
        const asset = await (db as any).mediaAssets?.get?.(Number(removal.assetId));
        if (asset?.id) assetsToDelete.set(Number(asset.id), asset);
      }

      const ownerMatches = (allAssets || []).filter((asset: any) => {
        if (!asset?.id || asset.isDeleted || asset.active === false) return false;
        if (asset.ownerTable !== removal.ownerTable) return false;
        if (asset.fieldKey !== removal.fieldKey) return false;
        if (removal.accountId && asset.accountId !== removal.accountId) return false;
        if (!sameOptionalNumber(asset.schoolId, removal.schoolId)) return false;
        if (!sameOptionalNumber(asset.branchId, removal.branchId)) return false;

        const localMatch = idOf(removal.ownerLocalId) && sameId(asset.ownerLocalId, removal.ownerLocalId);
        const cloudMatch = removal.ownerCloudId && sameOptionalString(asset.ownerCloudId, removal.ownerCloudId) && String(asset.ownerCloudId || "");
        const tempMatch = removal.ownerTempKey && sameId(asset.ownerTempKey, removal.ownerTempKey);

        return !!localMatch || !!cloudMatch || !!tempMatch;
      });

      ownerMatches.forEach((asset: any) => assetsToDelete.set(Number(asset.id), asset));
    }

    await Promise.all(
      Array.from(assetsToDelete.values()).map(async (asset: any) => {
        try {
          await updateLocal("mediaAssets", Number(asset.id), {
            active: false,
            isDeleted: true,
            deletedAt: now,
            updatedAt: now,
            synced: "pending",
            uploadStatus: asset.uploadStatus || "local",
          } as any).catch(async () => {
            await (db as any).mediaAssets?.update?.(Number(asset.id), {
              active: false,
              isDeleted: true,
              deletedAt: now,
              updatedAt: now,
              synced: "pending",
            });
          });

          const blobId = asset.localBlobId || asset.blobId || asset.mediaBlobId;
          if (blobId) {
            await (db as any).mediaBlobs?.update?.(Number(blobId), {
              active: false,
              isDeleted: true,
              deletedAt: now,
              updatedAt: now,
              synced: "pending",
            });
          }

          if (asset.localObjectUrl) {
            revokeMediaObjectUrl(asset.localObjectUrl);
          }
        } catch (error) {
          console.warn("Failed to soft-delete removed media asset:", asset, error);
        }
      })
    );

    setPendingMediaRemovals([]);
  };

  const requireTenant = () => {
    if (!authenticated || !selectedAccountId) {
      showToast("error", "Sign in first.");
      return false;
    }

    if (!selectedSchoolId) {
      showToast("error", "Assigned school is required.");
      return false;
    }

    if (!selectedBranchId) {
      showToast("error", "Assigned branch is required.");
      return false;
    }

    return true;
  };

  const saveSchoolBranchSettings = async (options: boolean | SaveOptions = false) => {
    const silent = typeof options === "boolean" ? options : !!options.silent;
    const reloadAfterSave = typeof options === "boolean" ? true : options.reloadAfterSave !== false;
    const shouldPersistRemovals = typeof options === "boolean" ? true : options.persistRemovals !== false;
    if (!requireTenant()) return false;

    try {
      setSavingSettings(true);

      const settingsMediaPatch = {
        logo: safeRecordMediaValue(form.logo) || "",
        reportCardBackgroundImage: safeRecordMediaValue(form.reportCardBackgroundImage) || "",
        reportCardWatermark: safeRecordMediaValue(form.reportCardWatermark) || "",
        reportCardSignatureImage: safeRecordMediaValue(form.reportCardSignatureImage) || "",
        dashboardHeroImage: safeRecordMediaValue(form.dashboardHeroImage) || "",
        dashboardBannerImage: safeRecordMediaValue(form.dashboardBannerImage) || "",
        studentPortalImage: safeRecordMediaValue(form.studentPortalImage) || "",
        teacherPortalImage: safeRecordMediaValue(form.teacherPortalImage) || "",
        classroomPlaceholderImage: safeRecordMediaValue(form.classroomPlaceholderImage) || "",
        subjectPlaceholderImage: safeRecordMediaValue(form.subjectPlaceholderImage) || "",
        schoolGalleryImages: (form.schoolGalleryImages || [])
          .map(safeRecordMediaValue)
          .filter(Boolean) as string[],
        logoMediaId: mediaIdOrNull(form.logoMediaId),
        reportCardBackgroundImageMediaId: mediaIdOrNull(form.reportCardBackgroundImageMediaId),
        reportCardWatermarkMediaId: mediaIdOrNull(form.reportCardWatermarkMediaId),
        reportCardSignatureImageMediaId: mediaIdOrNull(form.reportCardSignatureImageMediaId),
        dashboardHeroImageMediaId: mediaIdOrNull(form.dashboardHeroImageMediaId),
        dashboardBannerImageMediaId: mediaIdOrNull(form.dashboardBannerImageMediaId),
        studentPortalImageMediaId: mediaIdOrNull(form.studentPortalImageMediaId),
        teacherPortalImageMediaId: mediaIdOrNull(form.teacherPortalImageMediaId),
        classroomPlaceholderImageMediaId: mediaIdOrNull(form.classroomPlaceholderImageMediaId),
        subjectPlaceholderImageMediaId: mediaIdOrNull(form.subjectPlaceholderImageMediaId),
        schoolGalleryMediaIds: (form.schoolGalleryMediaIds || []).map(mediaIdOrNull).filter(Boolean) as number[],
      };

      const payload = makeSettingsPayload(
        {
          ...form,
          ...settingsMediaPatch,
          accountId: selectedAccountId,
          schoolId: Number(selectedSchoolId),
          branchId: Number(selectedBranchId),
          currentAcademicStructureId: form.currentAcademicStructureId || undefined,
          currentAcademicPeriodId: form.currentAcademicPeriodId || undefined,
          schoolGalleryImages: settingsMediaPatch.schoolGalleryImages,
          schoolGalleryMediaIds: settingsMediaPatch.schoolGalleryMediaIds,
          isDeleted: false,
        } as Partial<SchoolBranchSetting>,
        settingsRow || undefined
      );

      const existingId = settingsRow?.id || form.id;

      let savedSettingsId = Number(existingId || 0);

      if (existingId) {
        await updateLocal("schoolBranchSettings", Number(existingId), {
          ...payload,
          accountId: selectedAccountId,
          schoolId: Number(selectedSchoolId),
          branchId: Number(selectedBranchId),
          isDeleted: false,
        } as any);
      } else {
        const { id, ...withoutId } = payload as any;
        const created = await createLocal("schoolBranchSettings", withoutId as any);
        savedSettingsId = Number(typeof created === "number" ? created : (created as any)?.id || 0);
      }

      if (savedSettingsId) {
        const mediaIds = [
          form.logoMediaId,
          form.reportCardBackgroundImageMediaId,
          form.reportCardWatermarkMediaId,
          form.reportCardSignatureImageMediaId,
          form.dashboardHeroImageMediaId,
          form.dashboardBannerImageMediaId,
          form.studentPortalImageMediaId,
          form.teacherPortalImageMediaId,
          form.classroomPlaceholderImageMediaId,
          form.subjectPlaceholderImageMediaId,
          ...(form.schoolGalleryMediaIds || []),
        ].filter(Boolean);

        await Promise.all(
          mediaIds.map((assetId) =>
            attachMediaAssetToOwner({
              assetId: Number(assetId),
              ownerTable: SETTINGS_MEDIA_OWNER_TABLE,
              ownerLocalId: savedSettingsId,
              ownerTempKey: settingsMediaSessionKeyRef.current,
            })
          )
        );
        settingsMediaSessionKeyRef.current = createSettingsMediaSessionKey();
      }

      await persistPendingMediaRemovals();


      await load();
      await refreshInstitution?.();
      window.dispatchEvent(new Event("school-branch-settings-updated"));

      if (!silent) showToast("success", "School branch settings saved successfully.");
      return true;
    } catch (error) {
      console.error("Failed to save school branch settings:", error);
      showToast("error", "Failed to save school branch settings.");
      return false;
    } finally {
      setSavingSettings(false);
    }
  };

  const saveSchoolIdentity = async (options: boolean | SaveOptions = false) => {
    const silent = typeof options === "boolean" ? options : !!options.silent;
    const reloadAfterSave = typeof options === "boolean" ? true : options.reloadAfterSave !== false;
    const shouldPersistRemovals = typeof options === "boolean" ? true : options.persistRemovals !== false;
    if (!selectedAccountId) {
      showToast("error", "Sign in first.");
      return false;
    }

    if (!schoolForm.id) {
      showToast("error", "Assigned school record was not found.");
      return false;
    }

    if (!schoolForm.name?.trim()) {
      showToast("error", "School name is required.");
      return false;
    }

    try {
      setSavingSchool(true);

      await updateLocal("schools", Number(schoolForm.id), {
        accountId: selectedAccountId,
        name: schoolForm.name.trim(),
        motto: schoolForm.motto?.trim() || undefined,
        logo: safeRecordMediaValue(schoolForm.logo) || "",
        logoMediaId: mediaIdOrNull(schoolForm.logoMediaId),
        bannerImage: safeRecordMediaValue(schoolForm.bannerImage) || "",
        bannerImageMediaId: mediaIdOrNull(schoolForm.bannerImageMediaId),
        galleryImages: (schoolForm.galleryImages || []).map(safeRecordMediaValue).filter(Boolean),
        address: schoolForm.address?.trim() || undefined,
        location: schoolForm.location?.trim() || undefined,
        email: schoolForm.email?.trim() || undefined,
        phone: schoolForm.phone?.trim() || undefined,
        website: schoolForm.website?.trim() || undefined,
        active: schoolForm.active !== false,
        updatedAt: Date.now(),
        synced: "pending",
      } as any);

      await Promise.all(
        [schoolForm.logoMediaId, schoolForm.bannerImageMediaId]
          .filter(Boolean)
          .map((assetId) =>
            attachMediaAssetToOwner({
              assetId: Number(assetId),
              ownerTable: SCHOOL_MEDIA_OWNER_TABLE,
              ownerLocalId: Number(schoolForm.id),
            })
          )
      );

      if (shouldPersistRemovals) await persistPendingMediaRemovals();

      if (reloadAfterSave) await load();
      await refreshInstitution?.();
      window.dispatchEvent(new Event("school-branch-settings-updated"));

      if (!silent) showToast("success", "School identity saved successfully.");
      return true;
    } catch (error) {
      console.error("Failed to save school identity:", error);
      showToast("error", "Failed to save school identity.");
      return false;
    } finally {
      setSavingSchool(false);
    }
  };

  const saveBranchIdentity = async (options: boolean | SaveOptions = false) => {
    const silent = typeof options === "boolean" ? options : !!options.silent;
    const reloadAfterSave = typeof options === "boolean" ? true : options.reloadAfterSave !== false;
    const shouldPersistRemovals = typeof options === "boolean" ? true : options.persistRemovals !== false;
    if (!selectedAccountId) {
      showToast("error", "Sign in first.");
      return false;
    }

    if (!branchForm.id) {
      showToast("error", "Assigned branch record was not found.");
      return false;
    }

    if (!branchForm.name?.trim()) {
      showToast("error", "Branch name is required.");
      return false;
    }

    try {
      setSavingBranch(true);

      await updateLocal("branches", Number(branchForm.id), {
        accountId: selectedAccountId,
        schoolId: Number(selectedSchoolId || branchForm.schoolId),
        name: branchForm.name.trim(),
        code: branchForm.code?.trim() || undefined,
        logo: safeRecordMediaValue(branchForm.logo) || "",
        logoMediaId: mediaIdOrNull(branchForm.logoMediaId),
        bannerImage: safeRecordMediaValue(branchForm.bannerImage) || "",
        bannerImageMediaId: mediaIdOrNull(branchForm.bannerImageMediaId),
        address: branchForm.address?.trim() || undefined,
        location: branchForm.location?.trim() || undefined,
        city: branchForm.city?.trim() || branchForm.location?.trim() || undefined,
        email: branchForm.email?.trim() || undefined,
        phone: branchForm.phone?.trim() || undefined,
        website: branchForm.website?.trim() || undefined,
        active: branchForm.active !== false,
        updatedAt: Date.now(),
        synced: "pending",
      } as any);

      await Promise.all(
        [branchForm.logoMediaId, branchForm.bannerImageMediaId]
          .filter(Boolean)
          .map((assetId) =>
            attachMediaAssetToOwner({
              assetId: Number(assetId),
              ownerTable: BRANCH_MEDIA_OWNER_TABLE,
              ownerLocalId: Number(branchForm.id),
            })
          )
      );

      if (shouldPersistRemovals) await persistPendingMediaRemovals();

      if (reloadAfterSave) await load();
      await refreshInstitution?.();
      window.dispatchEvent(new Event("school-branch-settings-updated"));

      if (!silent) showToast("success", "Branch identity saved successfully.");
      return true;
    } catch (error) {
      console.error("Failed to save branch identity:", error);
      showToast("error", "Failed to save branch identity.");
      return false;
    } finally {
      setSavingBranch(false);
    }
  };


  const saveReportCardTemplateSettings = async (options: boolean | SaveOptions = false) => {
    const silent = typeof options === "boolean" ? options : !!options.silent;
    const reloadAfterSave = typeof options === "boolean" ? true : options.reloadAfterSave !== false;

    if (!requireTenant()) return false;

    if (!(db as any).reportCardTemplates || !(db as any).reportCardTemplateSettings || !(db as any).reportCardTemplateAssignments) {
      showToast("error", "Report card template tables are missing. Update db.ts first.");
      return false;
    }

    try {
      setSavingReportTemplate(true);

      const accountIdValue = String(selectedAccountId);
      const schoolIdValue = Number(selectedSchoolId);
      const branchIdValue = Number(selectedBranchId);

      const activeReportType = (reportTemplateForm.reportType || "student_report") as ReportTemplateReportType;
      const existingTemplateId = idOf(reportTemplateForm.templateId);
      const allExistingTemplates = await ((db as any).reportCardTemplates?.toArray?.() || []);
      const existingTemplate =
        existingTemplateId > 0
          ? await (db as any).reportCardTemplates.get(existingTemplateId)
          : (allExistingTemplates as any[]).find((row: any) =>
              !row.isDeleted &&
              row.active !== false &&
              row.accountId === accountIdValue &&
              sameId(row.schoolId, schoolIdValue) &&
              sameId(row.branchId, branchIdValue) &&
              (row.reportType === activeReportType || (!row.reportType && activeReportType === "student_report")) &&
              sameId(row.code, reportTemplateForm.templateCode)
            ) || null;

      const templatePayload = makeReportTemplatePayload({
        form: reportTemplateForm,
        accountId: accountIdValue,
        schoolId: schoolIdValue,
        branchId: branchIdValue,
        existing: existingTemplate || undefined,
      });

      let savedTemplateId = existingTemplateId || idOf(existingTemplate?.id);

      if (savedTemplateId) {
        await updateLocal("reportCardTemplates" as any, savedTemplateId, templatePayload as any);
      } else {
        const { id, ...withoutId } = templatePayload as any;
        const created = await createLocal("reportCardTemplates" as any, withoutId as any);
        savedTemplateId = Number(typeof created === "number" ? created : (created as any)?.id || 0);
      }

      if (!savedTemplateId) {
        throw new Error("Could not save the report card template.");
      }

      const existingSettingsId = idOf(reportTemplateForm.templateSettingsId);
      const existingTemplateSettingsById = existingSettingsId > 0
        ? await (db as any).reportCardTemplateSettings.get(existingSettingsId)
        : null;
      const existingTemplateSettings =
        existingTemplateSettingsById && (existingTemplateSettingsById.reportType === activeReportType || (!existingTemplateSettingsById.reportType && activeReportType === "student_report"))
          ? existingTemplateSettingsById
          : (await ((db as any).reportCardTemplateSettings?.toArray?.() || [])).find((row: any) =>
              !row.isDeleted &&
              row.active !== false &&
              row.accountId === accountIdValue &&
              sameId(row.schoolId, schoolIdValue) &&
              sameId(row.branchId, branchIdValue) &&
              (row.reportType === activeReportType || (!row.reportType && activeReportType === "student_report")) &&
              (sameId(row.templateCode, reportTemplateForm.templateCode) || sameId(row.templateId, savedTemplateId))
            ) || null;

      const settingsPayload = makeReportTemplateSettingsPayload({
        form: reportTemplateForm,
        accountId: accountIdValue,
        schoolId: schoolIdValue,
        branchId: branchIdValue,
        templateId: savedTemplateId,
        existing: existingTemplateSettings || undefined,
      });

      let savedSettingsId = idOf(existingTemplateSettings?.id);

      if (savedSettingsId) {
        await updateLocal("reportCardTemplateSettings" as any, savedSettingsId, settingsPayload as any);
      } else {
        const { id, ...withoutId } = settingsPayload as any;
        const created = await createLocal("reportCardTemplateSettings" as any, withoutId as any);
        savedSettingsId = Number(typeof created === "number" ? created : (created as any)?.id || 0);
      }

      if (!savedSettingsId) {
        throw new Error("Could not save the report card display settings.");
      }

      const existingAssignmentId = idOf(reportTemplateForm.assignmentId);
      const existingAssignmentById = existingAssignmentId > 0
        ? await (db as any).reportCardTemplateAssignments.get(existingAssignmentId)
        : null;
      const existingAssignment =
        existingAssignmentById && (existingAssignmentById.reportType === activeReportType || (!existingAssignmentById.reportType && activeReportType === "student_report"))
          ? existingAssignmentById
          : (await ((db as any).reportCardTemplateAssignments?.toArray?.() || [])).find((row: any) =>
              !row.isDeleted &&
              row.active !== false &&
              row.accountId === accountIdValue &&
              sameId(row.schoolId, schoolIdValue) &&
              sameId(row.branchId, branchIdValue) &&
              (row.reportType === activeReportType || (!row.reportType && activeReportType === "student_report")) &&
              (!row.scopeType || row.scopeType === "branch") &&
              sameId(row.scopeId, branchIdValue)
            ) || null;

      const assignmentPayload = makeReportTemplateAssignmentPayload({
        form: reportTemplateForm,
        accountId: accountIdValue,
        schoolId: schoolIdValue,
        branchId: branchIdValue,
        templateId: savedTemplateId,
        templateSettingsId: savedSettingsId,
        existing: existingAssignment || undefined,
      });

      const saveAssignmentId = idOf(existingAssignment?.id);
      if (saveAssignmentId) {
        await updateLocal("reportCardTemplateAssignments" as any, saveAssignmentId, assignmentPayload as any);
      } else {
        const { id, ...withoutId } = assignmentPayload as any;
        await createLocal("reportCardTemplateAssignments" as any, withoutId as any);
      }

      if (reloadAfterSave) await load();
      window.dispatchEvent(new Event("school-branch-settings-updated"));

      if (!silent) {
        const savedLabel = activeReportType === "cumulative_book" ? "Cumulative report book" : activeReportType === "cumulative_transcript" ? "Cumulative transcript" : "Student report card";
        showToast("success", `${savedLabel} template settings saved successfully.`);
      }
      return true;
    } catch (error: any) {
      console.error("Failed to save report card template settings:", error);
      showToast("error", error?.message || "Failed to save report card template settings.");
      return false;
    } finally {
      setSavingReportTemplate(false);
    }
  };

  const saveAll = async () => {
    if (!requireTenant()) return;

    try {
      setSavingAll(true);

      if (schoolForm.id) {
        await saveSchoolIdentity({
          silent: true,
          reloadAfterSave: false,
          persistRemovals: false,
        });
      }

      if (branchForm.id) {
        await saveBranchIdentity({
          silent: true,
          reloadAfterSave: false,
          persistRemovals: false,
        });
      }

      await saveSchoolBranchSettings({
        silent: true,
        reloadAfterSave: false,
        persistRemovals: false,
      });

      await saveReportCardTemplateSettings({
        silent: true,
        reloadAfterSave: false,
        persistRemovals: false,
      });

      await persistPendingMediaRemovals();
      await load();
      await refreshInstitution?.();
      window.dispatchEvent(new Event("school-branch-settings-updated"));

      showToast("success", "All school branch settings saved successfully.");
    } finally {
      setSavingAll(false);
    }
  };

  // ======================================================
  // THEME SAFETY
  // ======================================================

  // Branch Settings stores theme preferences only.
  // It intentionally does not mutate document.documentElement on open or save.
  // Global theme application belongs to the shell/settings provider.

  useEffect(() => {
    const icon = form.logo || schoolForm.logo || branchForm.logo;
    if (!icon) return;

    const link: HTMLLinkElement =
      document.querySelector("link[rel~='icon']") || document.createElement("link");

    link.rel = "icon";
    link.href = icon;
    document.head.appendChild(link);
  }, [form.logo, schoolForm.logo, branchForm.logo]);

  // ======================================================
  // PREVIEW
  // ======================================================

  const previewStyle: React.CSSProperties = {
    background:
      "linear-gradient(135deg, color-mix(in srgb, var(--ba-primary, var(--primary-color, #2563eb)) 10%, var(--card-bg, var(--surface, #ffffff))), var(--card-bg, var(--surface, #ffffff)))",
    color: "var(--text, #111111)",
    borderColor: "var(--border, rgba(0,0,0,.10))",
  };


  // ======================================================
  // GOLDEN COMPACT UI
  // ======================================================

  const activeFilterCount = useMemo(() => {
    return [
      form.currentAcademicStructureId,
      form.currentAcademicPeriodId,
      form.academicYear,
      form.currentTerm && form.currentTerm !== "Term 1" ? form.currentTerm : undefined,
      form.theme !== "light" ? form.theme : undefined,
      form.mode !== "manual" ? form.mode : undefined,
    ].filter(Boolean).length;
  }, [
    form.currentAcademicStructureId,
    form.currentAcademicPeriodId,
    form.academicYear,
    form.currentTerm,
    form.theme,
    form.mode,
  ]);

  const searchTerm = search.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    const sections = [
      {
        key: "academic" as SettingsSection,
        icon: "📚",
        title: "Academic Defaults",
        subtitle: `${activeStructure?.name || "No structure"} · ${activePeriod?.name || "No period"}`,
        detail: `${form.academicYear || "No academic year"} · ${form.currentTerm || "No term"}`,
        tone: activeStructure && activePeriod ? "green" : "orange",
      },
      {
        key: "school" as SettingsSection,
        icon: "🏫",
        title: "School Identity",
        subtitle: schoolForm.name || "No school name",
        detail: `${schoolForm.phone || "No phone"} · ${schoolForm.email || "No email"}`,
        tone: schoolForm.name ? "green" : "red",
      },
      {
        key: "branch" as SettingsSection,
        icon: "🏢",
        title: "Branch Identity",
        subtitle: branchForm.name || "No branch name",
        detail: `${branchForm.code || "No code"} · ${branchForm.location || branchForm.city || "No location"}`,
        tone: branchForm.name ? "green" : "red",
      },
      {
        key: "appearance" as SettingsSection,
        icon: "🎨",
        title: "Appearance",
        subtitle: `${form.theme} · ${form.primaryColor}`,
        detail: `${form.fontSize}px · ${fontOptions.find((item) => item.value === form.fontFamily)?.label || "Custom font"}`,
        tone: form.primaryColor ? "green" : "orange",
      },
      {
        key: "dashboardMedia" as SettingsSection,
        icon: "🖼️",
        title: "Dashboard & Portal Images",
        subtitle: `${[
          form.dashboardHeroImage,
          form.dashboardBannerImage,
          form.studentPortalImage,
          form.teacherPortalImage,
          form.classroomPlaceholderImage,
          form.subjectPlaceholderImage,
        ].filter(Boolean).length} asset(s)`,
        detail: "Dashboards, portals, classes and subject placeholders",
        tone: form.dashboardHeroImage || form.dashboardBannerImage ? "green" : "gray",
      },
      {
        key: "reportMedia" as SettingsSection,
        icon: "📄",
        title: "Report Branding",
        subtitle: `${[
          form.reportCardBackgroundImage,
          form.reportCardWatermark,
          form.reportCardSignatureImage,
          form.logo,
        ].filter(Boolean).length} asset(s)`,
        detail: "Report background, watermark, signature and branch logo",
        tone: form.reportCardSignatureImage ? "green" : "gray",
      },
      {
        key: "reportTemplates" as SettingsSection,
        icon: "🧾",
        title: "Report Card Template",
        subtitle: `${reportTemplateForm.templateName || "Classic Ghana Report"} · ${reportTemplateForm.density}`,
        detail: `${[
          reportTemplateForm.showSubjectPosition ? "Subject pos." : "",
          reportTemplateForm.showClassPosition ? "Class pos." : "",
          reportTemplateForm.showNumberOnRoll ? "Roll" : "",
          reportTemplateForm.showCurrentAcademicPeriodEnd ? "Period end" : "",
          reportTemplateForm.showNextAcademicPeriod ? "Next period" : "",
          reportTemplateForm.showGeneratedDate ? (reportTemplateForm.generatedDateLabel || "Generated") : "",
        ].filter(Boolean).join(" · ") || "Display controls ready"}`,
        tone: reportTemplateForm.active ? "green" : "gray",
      },
      {
        key: "gallery" as SettingsSection,
        icon: "🌄",
        title: "Gallery",
        subtitle: `${form.schoolGalleryImages.length} image(s)`,
        detail: "Branch experience images",
        tone: form.schoolGalleryImages.length ? "green" : "gray",
      },
    ];

    if (!searchTerm) return sections;

    return sections.filter((section) =>
      `${section.title} ${section.subtitle} ${section.detail}`.toLowerCase().includes(searchTerm)
    );
  }, [activePeriod, activeStructure, branchForm, form, schoolForm, searchTerm]);

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Branch Settings..."
        text="Checking account, school, branch, academic defaults and branding assets."
      />
    );
  }

  if (!authenticated || !selectedAccountId) {
    return <State primary={primary} title="Sign in required" text="You must sign in before managing school branch settings." />;
  }

  if (!selectedSchoolId || !selectedBranchId) {
    return <State primary={primary} title="Assigned branch required" text="This settings page is locked to the active branch-admin school branch assignment." />;
  }

  return (
    <main className="ba-page branch-settings-page" style={{ "--ba-primary": form.primaryColor || primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">
            ✕
          </button>
        </section>
      )}

      <section className="ba-search-card" aria-label="Branch settings search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search settings..."
            aria-label="Search branch settings"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline settings-save-button"
          onClick={saveAll}
          disabled={savingAll}
          aria-label="Save all settings"
          title="Save all"
        >
          {savingAll ? "..." : "Save"}
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open branch setting filters"
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
        <section className="ba-filter-chips" aria-label="Active branch setting filters">
          {form.currentAcademicStructureId && (
            <button type="button" onClick={() => updateForm("currentAcademicStructureId", undefined)}>
              Structure: {activeStructure?.name || "Selected"} ×
            </button>
          )}
          {form.currentAcademicPeriodId && (
            <button type="button" onClick={() => updateForm("currentAcademicPeriodId", undefined)}>
              Period: {activePeriod?.name || "Selected"} ×
            </button>
          )}
          {form.academicYear && (
            <button type="button" onClick={() => updateForm("academicYear", "")}>
              Year: {form.academicYear} ×
            </button>
          )}
          {form.theme !== "light" && (
            <button type="button" onClick={() => updateForm("theme", "light")}>
              Theme: {form.theme} ×
            </button>
          )}
        </section>
      )}

      <section className="branch-live-preview" style={previewStyle}>
        <div className="branch-preview-aa" style={{ background: form.primaryColor, color: getContrastTextColor(form.primaryColor) }}>
          Aa
        </div>
        <div>
          <strong>{school?.name || activeSchool?.name || "School"} · {branch?.name || activeBranch?.name || "Branch"}</strong>
          <span>{completion}% complete · {assetCount} asset(s)</span>
        </div>
      </section>

      <section className="ba-list branch-settings-list">
        {visibleSections.map((section) => (
          <button key={section.key} type="button" className="student-row" onClick={() => setSectionOpen(section.key)}>
            <span className="branch-settings-icon">{section.icon}</span>

            <span className="student-main">
              <strong>{section.title}</strong>
              <small>{section.subtitle}</small>
              <em>{section.detail}</em>
            </span>

            <span className="student-side">
              <span className={`status-dot-mini ${section.tone}`} />
              <i>⋯</i>
            </span>
          </button>
        ))}

        {!visibleSections.length && (
          <Empty icon="⚙️" title="No settings found" text="Try another search term or open More to refresh the branch settings." />
        )}
      </section>

      {filterOpen && (
        <AcademicFilterSheet
          form={form}
          filteredAcademicStructures={filteredAcademicStructures}
          filteredAcademicPeriods={filteredAcademicPeriods}
          updateForm={updateForm}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          savingAll={savingAll}
          onSave={async () => {
            setMoreOpen(false);
            await saveAll();
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          openSection={(section) => {
            setMoreOpen(false);
            setSectionOpen(section);
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {sectionOpen === "academic" && (
        <AcademicSheet
          form={form}
          savingSettings={savingSettings}
          filteredAcademicStructures={filteredAcademicStructures}
          filteredAcademicPeriods={filteredAcademicPeriods}
          updateForm={updateForm}
          saveSchoolBranchSettings={saveSchoolBranchSettings}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "school" && (
        <SchoolSheet
          schoolForm={schoolForm}
          savingSchool={savingSchool}
          updateSchoolField={updateSchoolField}
          uploadSchoolImage={uploadSchoolImage}
          saveSchoolIdentity={saveSchoolIdentity}
          clearImage={clearSchoolImage}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "branch" && (
        <BranchSheet
          branchForm={branchForm}
          savingBranch={savingBranch}
          updateBranchField={updateBranchField}
          uploadBranchImage={uploadBranchImage}
          saveBranchIdentity={saveBranchIdentity}
          clearImage={clearBranchImage}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "appearance" && (
        <AppearanceSheet
          form={form}
          savingSettings={savingSettings}
          updateForm={updateForm}
          saveSchoolBranchSettings={saveSchoolBranchSettings}
          previewStyle={previewStyle}
          schoolName={school?.name || activeSchool?.name || "School"}
          branchName={branch?.name || activeBranch?.name || "Branch"}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "dashboardMedia" && (
        <MediaSheet
          title="Dashboard & Portal Images"
          text="These images belong only to the assigned school branch settings row."
          form={form}
          fields={[
            ["Dashboard Hero Image", "dashboardHeroImage", "Main dashboard hero visual for this branch."],
            ["Dashboard Banner Image", "dashboardBannerImage", "Wide dashboard and finance banner visual for this branch."],
            ["Student Portal Image", "studentPortalImage", "Image used for student dashboard/portal cards in this branch."],
            ["Teacher Portal Image", "teacherPortalImage", "Image used for teacher dashboard/portal cards in this branch."],
            ["Classroom Placeholder Image", "classroomPlaceholderImage", "Image used for class/classroom cards in this branch."],
            ["Subject Placeholder Image", "subjectPlaceholderImage", "Image used for subject cards in this branch."],
          ]}
          uploadImage={uploadImage}
          updateForm={updateForm}
          clearImage={clearSettingsImage}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "reportMedia" && (
        <MediaSheet
          title="Report Card Branding"
          text="These report card assets belong only to the assigned school branch."
          form={form}
          fields={[
            ["Report Background Image", "reportCardBackgroundImage", "A light background image for this branch's printed report cards."],
            ["Report Watermark", "reportCardWatermark", "Used behind report card content for this branch."],
            ["Official Signature Image", "reportCardSignatureImage", "Used near the headteacher/principal signature section."],
            ["Branch Settings Logo", "logo", "Optional settings-level logo for this branch experience."],
          ]}
          uploadImage={uploadImage}
          updateForm={updateForm}
          clearImage={clearSettingsImage}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "reportTemplates" && (
        <ReportTemplateSheet
          form={reportTemplateForm}
          templates={reportTemplates}
          settingsForm={form}
          schoolName={schoolForm.name || school?.name || activeSchool?.name || "Eleeveon International Academy"}
          branchName={branchForm.name || branch?.name || activeBranch?.name || "Main Campus"}
          saving={savingReportTemplate}
          updateField={updateReportTemplateField}
          saveReportCardTemplateSettings={saveReportCardTemplateSettings}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "gallery" && (
        <GallerySheet
          images={form.schoolGalleryImages}
          handleGalleryUpload={handleGalleryUpload}
          removeGalleryImage={removeGalleryImage}
          onClose={() => setSectionOpen(null)}
        />
      )}
    </main>
  );
}

// ======================================================
// GOLDEN SMALL COMPONENTS
// ======================================================

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page branch-settings-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="branch-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ImagePreview({ label, value, clear }: { label: string; value: string; clear: () => void }) {
  return (
    <div className="branch-image-preview">
      <img src={value} alt={label} />
      <button type="button" onClick={clear}>
        Remove
      </button>
    </div>
  );
}

function ImageUploader({
  label,
  field,
  helper,
  value,
  upload,
  clear,
}: {
  label: string;
  field: ImageField;
  helper?: string;
  value: string;
  upload: (field: ImageField, file?: File) => void;
  clear: () => void;
}) {
  return (
    <div className="branch-media-block">
      <div className="branch-media-title">{label}</div>
      {helper && <p>{helper}</p>}
      <input type="file" accept="image/*" onChange={(event) => upload(field, event.target.files?.[0])} />
      {value && <ImagePreview label={label} value={value} clear={clear} />}
    </div>
  );
}

function GenericImageUploader<TField extends string>({
  label,
  field,
  helper,
  value,
  upload,
  clear,
}: {
  label: string;
  field: TField;
  helper?: string;
  value: string;
  upload: (field: TField, file?: File) => void;
  clear: () => void;
}) {
  return (
    <div className="branch-media-block">
      <div className="branch-media-title">{label}</div>
      {helper && <p>{helper}</p>}
      <input type="file" accept="image/*" onChange={(event) => upload(field, event.target.files?.[0])} />
      {value && <ImagePreview label={label} value={value} clear={clear} />}
    </div>
  );
}

function AcademicFilterSheet({
  form,
  filteredAcademicStructures,
  filteredAcademicPeriods,
  updateForm,
  onClose,
}: {
  form: SettingsForm;
  filteredAcademicStructures: AcademicStructure[];
  filteredAcademicPeriods: AcademicPeriod[];
  updateForm: (key: keyof SettingsForm, value: any) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Quick branch academic defaults and theme filters.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <Field label="Academic Structure">
            <select
              value={form.currentAcademicStructureId || ""}
              onChange={(event) => {
                updateForm("currentAcademicStructureId", Number(event.target.value) || undefined);
                updateForm("currentAcademicPeriodId", undefined);
              }}
            >
              <option value="">Select academic structure</option>
              {filteredAcademicStructures.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({(item as any).level || "Level"})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Academic Period">
            <select value={form.currentAcademicPeriodId || ""} onChange={(event) => updateForm("currentAcademicPeriodId", Number(event.target.value) || undefined)}>
              <option value="">Select academic period</option>
              {filteredAcademicPeriods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Academic Year">
            <input value={form.academicYear || ""} onChange={(event) => updateForm("academicYear", event.target.value)} placeholder="e.g. 2025/2026" />
          </Field>

          <Field label="Current Term">
            <select value={form.currentTerm || "Term 1"} onChange={(event) => updateForm("currentTerm", event.target.value)}>
              <option>Term 1</option>
              <option>Term 2</option>
              <option>Term 3</option>
              <option>Semester 1</option>
              <option>Semester 2</option>
            </select>
          </Field>

          <Field label="Theme">
            <select value={form.theme} onChange={(event) => updateForm("theme", event.target.value as "light" | "dark")}>
              <option value="light">Light Theme</option>
              <option value="dark">Dark Theme</option>
            </select>
          </Field>

          <Field label="Mode">
            <select value={form.mode} onChange={(event) => updateForm("mode", event.target.value)}>
              <option value="manual">Manual Mode</option>
              <option value="auto">Auto Mode</option>
            </select>
          </Field>
        </div>

        <div className="ba-sheet-actions">
          <button
            type="button"
            onClick={() => {
              updateForm("currentAcademicStructureId", undefined);
              updateForm("currentAcademicPeriodId", undefined);
              updateForm("academicYear", "");
              updateForm("currentTerm", "Term 1");
              updateForm("theme", "light");
              updateForm("mode", "manual");
            }}
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
  savingAll,
  onSave,
  onRefresh,
  openSection,
  onClose,
}: {
  savingAll: boolean;
  onSave: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  openSection: (section: SettingsSection) => void;
  onClose: () => void;
}) {
  const sections: { key: SettingsSection; icon: string; label: string; note: string }[] = [
    { key: "academic", icon: "📚", label: "Academic Defaults", note: "Structure, period, term and year" },
    { key: "school", icon: "🏫", label: "School Identity", note: "Name, motto, contacts and logo" },
    { key: "branch", icon: "🏢", label: "Branch Identity", note: "Branch name, code, contact and media" },
    { key: "appearance", icon: "🎨", label: "Appearance", note: "Theme, primary color and font" },
    { key: "dashboardMedia", icon: "🖼️", label: "Dashboard Media", note: "Portal and dashboard images" },
    { key: "reportMedia", icon: "📄", label: "Report Branding", note: "Report images, watermark and signature" },
    { key: "reportTemplates", icon: "🧾", label: "Report Card Template", note: "Template, visibility, labels and report fields" },
    { key: "gallery", icon: "🌄", label: "Gallery", note: "Branch experience images" },
  ];

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Open a settings group or run quick actions.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          {sections.map((section) => (
            <button key={section.key} type="button" onClick={() => openSection(section.key)}>
              <span>{section.icon}</span>
              <b>{section.label}</b>
              <small>{section.note}</small>
            </button>
          ))}

          <button type="button" onClick={onSave} disabled={savingAll}>
            <span>✓</span>
            <b>{savingAll ? "Saving..." : "Save all"}</b>
            <small>Save school, branch and settings changes</small>
          </button>

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch settings</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function AcademicSheet({
  form,
  savingSettings,
  filteredAcademicStructures,
  filteredAcademicPeriods,
  updateForm,
  saveSchoolBranchSettings,
  onClose,
}: {
  form: SettingsForm;
  savingSettings: boolean;
  filteredAcademicStructures: AcademicStructure[];
  filteredAcademicPeriods: AcademicPeriod[];
  updateForm: (key: keyof SettingsForm, value: any) => void;
  saveSchoolBranchSettings: (options?: boolean | SaveOptions) => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Academic Defaults</h2>
            <p>Set current structure, period, academic year and term for this branch.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close academic defaults">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <Field label="Academic Structure">
            <select
              value={form.currentAcademicStructureId || ""}
              onChange={(event) => {
                updateForm("currentAcademicStructureId", Number(event.target.value) || undefined);
                updateForm("currentAcademicPeriodId", undefined);
              }}
            >
              <option value="">Select Academic Structure</option>
              {filteredAcademicStructures.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({(item as any).level || "Level"})</option>
              ))}
            </select>
          </Field>

          <Field label="Academic Period">
            <select value={form.currentAcademicPeriodId || ""} onChange={(event) => updateForm("currentAcademicPeriodId", Number(event.target.value) || undefined)}>
              <option value="">Select Academic Period</option>
              {filteredAcademicPeriods.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Academic Year">
            <input value={form.academicYear || ""} onChange={(event) => updateForm("academicYear", event.target.value)} placeholder="e.g. 2025/2026" />
          </Field>

          <Field label="Current Term">
            <select value={form.currentTerm || "Term 1"} onChange={(event) => updateForm("currentTerm", event.target.value)}>
              <option>Term 1</option>
              <option>Term 2</option>
              <option>Term 3</option>
              <option>Semester 1</option>
              <option>Semester 2</option>
            </select>
          </Field>

          <Field label="Mode">
            <select value={form.mode} onChange={(event) => updateForm("mode", event.target.value)}>
              <option value="manual">Manual Mode</option>
              <option value="auto">Auto Mode</option>
            </select>
          </Field>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={savingSettings}
            onClick={async () => {
              await saveSchoolBranchSettings();
              onClose();
            }}
          >
            {savingSettings ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SchoolSheet({
  schoolForm,
  savingSchool,
  updateSchoolField,
  uploadSchoolImage,
  saveSchoolIdentity,
  clearImage,
  onClose,
}: {
  schoolForm: SchoolForm;
  savingSchool: boolean;
  updateSchoolField: (key: keyof SchoolForm, value: any) => void;
  uploadSchoolImage: (field: keyof SchoolForm, file?: File) => void | Promise<void>;
  saveSchoolIdentity: (options?: boolean | SaveOptions) => Promise<boolean>;
  clearImage: (field: keyof SchoolForm) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>School Identity</h2>
            <p>School identity remains on the school record.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close school identity">✕</button>
        </div>

        <div className="ba-form compact">
          <Field label="School Name"><input value={schoolForm.name || ""} onChange={(event) => updateSchoolField("name", event.target.value)} /></Field>
          <Field label="Motto"><input value={schoolForm.motto || ""} onChange={(event) => updateSchoolField("motto", event.target.value)} /></Field>
          <Field label="Location"><input value={schoolForm.location || ""} onChange={(event) => updateSchoolField("location", event.target.value)} /></Field>
          <Field label="Address"><input value={schoolForm.address || ""} onChange={(event) => updateSchoolField("address", event.target.value)} /></Field>
          <Field label="Email"><input value={schoolForm.email || ""} onChange={(event) => updateSchoolField("email", event.target.value)} /></Field>
          <Field label="Phone"><input value={schoolForm.phone || ""} onChange={(event) => updateSchoolField("phone", event.target.value)} /></Field>
          <Field label="Website"><input value={schoolForm.website || ""} onChange={(event) => updateSchoolField("website", event.target.value)} /></Field>
        </div>

        <div className="branch-media-grid">
          <GenericImageUploader label="School Logo" field="logo" helper="Official school logo stored on the school record." value={schoolForm.logo || ""} upload={uploadSchoolImage} clear={() => clearImage("logo")} />
          <GenericImageUploader label="School Banner" field="bannerImage" helper="General school banner stored on the school record." value={schoolForm.bannerImage || ""} upload={uploadSchoolImage} clear={() => clearImage("bannerImage")} />
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={savingSchool} onClick={async () => { await saveSchoolIdentity(); onClose(); }}>
            {savingSchool ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}

function BranchSheet({
  branchForm,
  savingBranch,
  updateBranchField,
  uploadBranchImage,
  saveBranchIdentity,
  clearImage,
  onClose,
}: {
  branchForm: BranchForm;
  savingBranch: boolean;
  updateBranchField: (key: keyof BranchForm, value: any) => void;
  uploadBranchImage: (field: keyof BranchForm, file?: File) => void | Promise<void>;
  saveBranchIdentity: (options?: boolean | SaveOptions) => Promise<boolean>;
  clearImage: (field: keyof BranchForm) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Branch Identity</h2>
            <p>Branch identity remains on the assigned branch record.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close branch identity">✕</button>
        </div>

        {!branchForm.id && <div className="ba-warning">Assigned branch record was not found.</div>}

        <div className="ba-form compact">
          <Field label="Branch Name"><input value={branchForm.name || ""} onChange={(event) => updateBranchField("name", event.target.value)} /></Field>
          <Field label="Branch Code"><input value={branchForm.code || ""} onChange={(event) => updateBranchField("code", event.target.value)} /></Field>
          <Field label="Location / City"><input value={branchForm.location || ""} onChange={(event) => { updateBranchField("location", event.target.value); updateBranchField("city", event.target.value); }} /></Field>
          <Field label="Address"><input value={branchForm.address || ""} onChange={(event) => updateBranchField("address", event.target.value)} /></Field>
          <Field label="Email"><input value={branchForm.email || ""} onChange={(event) => updateBranchField("email", event.target.value)} /></Field>
          <Field label="Phone"><input value={branchForm.phone || ""} onChange={(event) => updateBranchField("phone", event.target.value)} /></Field>
          <Field label="Website"><input value={branchForm.website || ""} onChange={(event) => updateBranchField("website", event.target.value)} /></Field>
        </div>

        <div className="branch-media-grid">
          <GenericImageUploader label="Branch Logo" field="logo" helper="Optional branch-specific logo stored on the branch record." value={branchForm.logo || ""} upload={uploadBranchImage} clear={() => clearImage("logo")} />
          <GenericImageUploader label="Branch Banner" field="bannerImage" helper="Optional branch-specific banner stored on the branch record." value={branchForm.bannerImage || ""} upload={uploadBranchImage} clear={() => clearImage("bannerImage")} />
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={savingBranch} onClick={async () => { await saveBranchIdentity(); onClose(); }}>
            {savingBranch ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AppearanceSheet({
  form,
  savingSettings,
  updateForm,
  saveSchoolBranchSettings,
  previewStyle,
  schoolName,
  branchName,
  onClose,
}: {
  form: SettingsForm;
  savingSettings: boolean;
  updateForm: (key: keyof SettingsForm, value: any) => void;
  saveSchoolBranchSettings: (options?: boolean | SaveOptions) => Promise<boolean>;
  previewStyle: React.CSSProperties;
  schoolName: string;
  branchName: string;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Appearance</h2>
            <p>Theme, color and font belong to this school branch only.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close appearance">✕</button>
        </div>

        <div className="ba-form compact">
          <Field label="Font Family">
            <select value={form.fontFamily} onChange={(event) => updateForm("fontFamily", event.target.value)}>
              {fontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
            </select>
          </Field>

          <Field label="Font Size">
            <input type="number" min={12} max={22} value={form.fontSize} onChange={(event) => updateForm("fontSize", Number(event.target.value))} />
          </Field>

          <Field label="Primary Color">
            <input className="branch-color-input" type="color" value={form.primaryColor} onChange={(event) => updateForm("primaryColor", event.target.value)} />
          </Field>

          <Field label="Theme">
            <select value={form.theme} onChange={(event) => updateForm("theme", event.target.value as "light" | "dark")}>
              <option value="light">Light Theme</option>
              <option value="dark">Dark Theme</option>
            </select>
          </Field>
        </div>

        <div className="branch-live-preview sheet-preview" style={previewStyle}>
          <div className="branch-preview-aa" style={{ background: form.primaryColor, color: getContrastTextColor(form.primaryColor) }}>Aa</div>
          <div>
            <strong>{schoolName} · {branchName}</strong>
            <span>Live Branch Theme Preview</span>
          </div>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={savingSettings} onClick={async () => { await saveSchoolBranchSettings(); onClose(); }}>
            {savingSettings ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}


function ReportTemplateSheet({
  form,
  templates,
  settingsForm,
  schoolName,
  branchName,
  saving,
  updateField,
  saveReportCardTemplateSettings,
  onClose,
}: {
  form: ReportTemplateForm;
  templates: ReportTemplateRow[];
  settingsForm: SettingsForm;
  schoolName: string;
  branchName: string;
  saving: boolean;
  updateField: (key: keyof ReportTemplateForm, value: any) => void;
  saveReportCardTemplateSettings: (options?: boolean | SaveOptions) => Promise<boolean>;
  onClose: () => void;
}) {
  const reportTabs: { key: ReportTemplateReportType; label: string; note: string }[] = [
    { key: "student_report", label: "Student Report Cards", note: "Existing template gallery and display controls." },
    { key: "cumulative_book", label: "Cumulative Report Book", note: "Student report templates assembled as printable booklets." },
    { key: "cumulative_transcript", label: "Cumulative Transcript", note: "Official transcript-style academic history." },
  ];

  const activeReportType = (form.reportType || "student_report") as ReportTemplateReportType;

  const studentTemplates = reportTemplateDefinitionOptions("student_report").map((definition) => {
    const existing = templates.find((row: any) =>
      (row.reportType === "student_report" || !row.reportType) &&
      (sameId(row.code, definition.code) || sameId(row.layoutKey, definition.layoutKey))
    );
    return { ...definition, ...(existing || {}) };
  });

  const bookTemplates = reportTemplateDefinitionOptions("cumulative_book").map((definition) => {
    const existing = templates.find((row: any) =>
      row.reportType === "cumulative_book" &&
      (sameId(row.code, definition.code) || sameId(row.layoutKey, definition.layoutKey))
    );
    return { ...definition, ...(existing || {}) };
  });

  const transcriptTemplates = reportTemplateDefinitionOptions("cumulative_transcript").map((definition) => {
    const existing = templates.find((row: any) =>
      row.reportType === "cumulative_transcript" &&
      (sameId(row.code, definition.code) || sameId(row.layoutKey, definition.layoutKey))
    );
    return { ...definition, ...(existing || {}) };
  });

  const galleryTemplates =
    activeReportType === "cumulative_book"
      ? bookTemplates
      : activeReportType === "cumulative_transcript"
        ? transcriptTemplates
        : studentTemplates;

  const previewDataset = useMemo(
    () =>
      createDummyStudentReportPreviewDataset({
        schoolName,
        branchName,
        primaryColor: settingsForm.primaryColor,
        fontFamily: settingsForm.fontFamily,
        logo: settingsForm.logo,
        reportCardBackgroundImage: settingsForm.reportCardBackgroundImage,
        reportCardWatermark: settingsForm.reportCardWatermark,
        reportCardSignatureImage: settingsForm.reportCardSignatureImage,
      }),
    [
      schoolName,
      branchName,
      settingsForm.primaryColor,
      settingsForm.fontFamily,
      settingsForm.logo,
      settingsForm.reportCardBackgroundImage,
      settingsForm.reportCardWatermark,
      settingsForm.reportCardSignatureImage,
    ]
  );

  const bookPreviewDataset = useMemo(
    () =>
      createDummyCumulativeReportBookPreviewDataset({
        schoolName,
        branchName,
        primaryColor: settingsForm.primaryColor,
        fontFamily: settingsForm.fontFamily,
        logo: settingsForm.logo,
        reportCardBackgroundImage: settingsForm.reportCardBackgroundImage,
        reportCardWatermark: settingsForm.reportCardWatermark,
        reportCardSignatureImage: settingsForm.reportCardSignatureImage,
      }),
    [schoolName, branchName, settingsForm.primaryColor, settingsForm.fontFamily, settingsForm.logo, settingsForm.reportCardBackgroundImage, settingsForm.reportCardWatermark, settingsForm.reportCardSignatureImage]
  );

  const transcriptPreviewDataset = useMemo(
    () =>
      createDummyCumulativeTranscriptPreviewDataset({
        schoolName,
        branchName,
        primaryColor: settingsForm.primaryColor,
        fontFamily: settingsForm.fontFamily,
        logo: settingsForm.logo,
        reportCardWatermark: settingsForm.reportCardWatermark,
      }),
    [schoolName, branchName, settingsForm.primaryColor, settingsForm.fontFamily, settingsForm.logo, settingsForm.reportCardWatermark]
  );

  const selectedPreviewTemplate =
    galleryTemplates.find((item) => sameId(item.code, form.templateCode)) ||
    galleryTemplates.find((item) => sameId(item.layoutKey, form.layoutKey)) ||
    (activeReportType === "cumulative_transcript"
      ? getCumulativeTranscriptTemplateRegistryItem(form.templateCode)
      : getStudentReportTemplateRegistryItem(form.templateCode)) ||
    defaultReportTemplateDefinition(activeReportType);

  const selectedPreviewSettings = reportTemplatePreviewSettingsFromForm(
    form,
    selectedPreviewTemplate as any
  );

  const studentVisibilityControls: { key: keyof ReportTemplateForm; label: string; note: string }[] = [
    { key: "showSubjectPosition", label: "Subject Positions", note: "Remove the subject position column entirely when off." },
    { key: "showClassPosition", label: "Class Position", note: "Remove class position summary entirely when off." },
    { key: "showNumberOnRoll", label: "Number On Roll", note: "Show class size/roll count only for schools that want it." },
    { key: "showAttendance", label: "Attendance", note: "Show attendance count section." },
    { key: "showAttendancePercent", label: "Attendance Percentage", note: "Show attendance percentage field." },
    { key: "showStudentPhoto", label: "Student Photo", note: "Show or hide student photo box." },
    { key: "showTeacherNames", label: "Subject Teacher Names", note: "Show teacher name under each subject." },
    { key: "showCurrentAcademicPeriodEnd", label: "Current Period End", note: "Show this academic period ends line before the next period line." },
    { key: "showNextAcademicPeriod", label: "Next Academic Period", note: "Show reopening/next period begins line." },
    { key: "showPromotionStatus", label: "Promotion Status", note: "Show promote/repeat/graduate status when available." },
    { key: "showGPA", label: "GPA", note: "Show GPA summary field." },
    { key: "showAverage", label: "Average", note: "Show average summary field." },
    { key: "showTotal", label: "Total", note: "Show total summary field." },
    { key: "showGrade", label: "Grade", note: "Show grade column." },
    { key: "showSubjectRemarks", label: "Subject Remarks", note: "Show subject remark column." },
    { key: "showWatermark", label: "Watermark", note: "Use saved report watermark on report cards." },
    { key: "showParentSignature", label: "Parent Signature", note: "Show parent/guardian signature area." },
    { key: "showGeneratedDate", label: "Generated Date", note: "Show generated/printed date using the selected label." },
  ];

  const bookControls: { key: keyof ReportTemplateForm; label: string; note: string }[] = [
    { key: "showBookFrontCover", label: "Front Cover", note: "Start the cumulative book with a designed cover page." },
    { key: "showBookStudentProfilePage", label: "Student Profile Page", note: "Show student identity, parent and branch profile details." },
    { key: "showBookAcademicJourneyPage", label: "Academic Journey Page", note: "Show the student's period-by-period progress timeline." },
    { key: "showBookSummaryPage", label: "Summary Page", note: "Show cumulative average, GPA, trend and final recommendation." },
    { key: "showBookBackCover", label: "Back Cover", note: "End the printable booklet with an official closing cover." },
    { key: "showGeneratedDate", label: "Generated Date", note: "Show generated/printed date on cover and info pages." },
    { key: "showWatermark", label: "Watermark", note: "Use saved report watermark on book pages." },
  ];

  const transcriptControls: { key: keyof ReportTemplateForm; label: string; note: string }[] = [
    { key: "showTranscriptTermBreakdown", label: "Term / Period Breakdown", note: "Show subject rows grouped under each academic period." },
    { key: "showTranscriptYearAverage", label: "Year Average", note: "Show academic-year average/statistics where available." },
    { key: "showTranscriptCumulativeAverage", label: "Cumulative Average", note: "Show overall cumulative average in the transcript summary." },
    { key: "showTranscriptCumulativePosition", label: "Cumulative Position", note: "Show latest/cumulative rank or position where available." },
    { key: "showTranscriptGPAProgression", label: "GPA Progression", note: "Show term GPA and cumulative GPA values." },
    { key: "showTranscriptFinalRecommendation", label: "Final Recommendation", note: "Show promote/repeat/graduate recommendation." },
    { key: "showStudentPhoto", label: "Student Photo", note: "Show student photo if the template supports it." },
    { key: "showGeneratedDate", label: "Generated Date", note: "Show generated/printed date in transcript footer or metadata." },
    { key: "showWatermark", label: "Watermark", note: "Use saved report watermark on transcripts." },
  ];

  const activeControls = activeReportType === "cumulative_book" ? bookControls : activeReportType === "cumulative_transcript" ? transcriptControls : studentVisibilityControls;

  const switchReportType = (reportType: ReportTemplateReportType) => {
    const defaultTemplate = defaultReportTemplateDefinition(reportType);
    updateField("reportType", reportType);
    selectReportTemplateIntoForm(defaultTemplate, updateField, reportType);
  };

  const renderPreviewCard = (template: ReportTemplateRow, templateSettings: any) => {
    if (activeReportType === "cumulative_book") {
      return (
        <TemplatePreviewCumulativeReportBook
          dataset={bookPreviewDataset}
          template={template}
          settings={templateSettings}
          compact
          showWatermark={form.showWatermark}
          pageBreakAfter={false}
          mobilePreview={false}
        />
      );
    }

    if (activeReportType === "cumulative_transcript") {
      return (
        <TemplatePreviewCumulativeTranscriptCard
          dataset={transcriptPreviewDataset}
          template={template}
          settings={templateSettings}
          compact
          showWatermark={form.showWatermark}
          pageBreakAfter={false}
          mobilePreview={false}
        />
      );
    }

    return (
      <TemplatePreviewStudentReportCard
        dataset={previewDataset}
        template={template}
        settings={templateSettings}
        compact
        showWatermark={form.showWatermark}
        pageBreakAfter={false}
        mobilePreview={false}
      />
    );
  };

  const renderFocusedPreview = () => {
    if (activeReportType === "cumulative_book") {
      return (
        <TemplatePreviewCumulativeReportBook
          dataset={bookPreviewDataset}
          template={selectedPreviewTemplate}
          settings={selectedPreviewSettings}
          compact
          showWatermark={form.showWatermark}
          pageBreakAfter={false}
          mobilePreview
        />
      );
    }

    if (activeReportType === "cumulative_transcript") {
      return (
        <TemplatePreviewCumulativeTranscriptCard
          dataset={transcriptPreviewDataset}
          template={selectedPreviewTemplate}
          settings={selectedPreviewSettings}
          compact
          showWatermark={form.showWatermark}
          pageBreakAfter={false}
          mobilePreview
        />
      );
    }

    return (
      <TemplatePreviewStudentReportCard
        dataset={previewDataset}
        template={selectedPreviewTemplate}
        settings={selectedPreviewSettings}
        compact
        showWatermark={form.showWatermark}
        pageBreakAfter={false}
        mobilePreview
      />
    );
  };

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet report-template-suite-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Report Template & Document Controls</h2>
            <p>Configure student report cards, cumulative report books and cumulative transcripts. Each tab saves to reportCardTemplates, reportCardTemplateSettings and reportCardTemplateAssignments with its own reportType.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close report template settings">✕</button>
        </div>

        <div className="report-template-tabs" role="tablist" aria-label="Report template setting tabs">
          {reportTabs.map((tab) => (
            <button
              type="button"
              key={tab.key}
              className={activeReportType === tab.key ? "active" : ""}
              onClick={() => switchReportType(tab.key)}
            >
              <strong>{tab.label}</strong>
              <span>{tab.note}</span>
            </button>
          ))}
        </div>

        <div className="ba-form compact">
          <Field label={activeReportType === "cumulative_book" ? "Book Style" : activeReportType === "cumulative_transcript" ? "Transcript Template" : "Template"}>
            <select
              value={form.templateCode || ""}
              onChange={(event) => {
                const templateCode = event.target.value;
                const selected =
                  galleryTemplates.find((item) => sameId(item.code, templateCode)) ||
                  galleryTemplates.find((item) => sameId(item.layoutKey, templateCode)) ||
                  (activeReportType === "cumulative_transcript"
                    ? getCumulativeTranscriptTemplateRegistryItem(templateCode)
                    : getStudentReportTemplateRegistryItem(templateCode));

                selectReportTemplateIntoForm(selected as any, updateField, activeReportType);
              }}
            >
              {galleryTemplates.map((template) => (
                <option key={`${activeReportType}-${template.code || template.id || template.name}`} value={template.code || template.layoutKey || ""}>
                  {template.name || template.code || "Report Template"}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Template Name">
            <input value={form.templateName} readOnly />
          </Field>

          <Field label="Layout">
            <input value={form.layoutKey} readOnly />
          </Field>

          <Field label="Paper">
            <select value={form.paperSize} onChange={(event) => updateField("paperSize", event.target.value as "A4" | "Letter")}>
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
            </select>
          </Field>

          <Field label="Orientation">
            <select value={form.orientation} onChange={(event) => updateField("orientation", event.target.value as "portrait" | "landscape")}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </Field>

          <Field label="Density">
            <select value={form.density} onChange={(event) => updateField("density", event.target.value as "compact" | "comfortable" | "spacious")}>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </select>
          </Field>
        </div>

        <section className="branch-settings-subsection template-preview-studio">
          <div className="template-preview-studio-head">
            <div>
              <h3>{activeReportType === "cumulative_book" ? "Cumulative Book Preview Studio" : activeReportType === "cumulative_transcript" ? "Transcript Preview Studio" : "Student Report Preview Studio"}</h3>
              <p>{activeReportType === "cumulative_book" ? "Preview each student-report style as a printable report book with covers and journey pages." : activeReportType === "cumulative_transcript" ? "Preview each transcript design using a dummy academic-history dataset." : "Preview every student report-card design with the same dummy filled dataset before saving."}</p>
            </div>
            <span className="template-preview-badge">Preview only</span>
          </div>

          <div className="template-preview-gallery">
            {galleryTemplates.map((template) => {
              const templateCode = String(template.code || template.layoutKey || template.name || "");
              const isSelected =
                sameId(template.code, form.templateCode) ||
                sameId(template.layoutKey, form.layoutKey) ||
                sameId(template.name, form.templateName);

              const templateSettings = reportTemplatePreviewSettingsFromForm(form, template);

              return (
                <button
                  type="button"
                  key={`${activeReportType}-${templateCode || template.id || template.name}`}
                  className={`template-preview-card ${isSelected ? "selected" : ""}`}
                  onClick={() => selectReportTemplateIntoForm(template, updateField, activeReportType)}
                >
                  <span className="template-preview-card-top">
                    <strong>{template.name || template.code || "Report Template"}</strong>
                    <em>{isSelected ? "Selected" : "Tap to select"}</em>
                  </span>

                  <span className="template-preview-mini" aria-hidden="true">
                    <span className="template-preview-mini-scale">
                      {renderPreviewCard(template, templateSettings)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="template-preview-focus">
            <div className="template-preview-focus-head">
              <strong>{selectedPreviewTemplate?.name || form.templateName || "Selected Template"}</strong>
              <span>Live fit-preview using the selected template and current display controls.</span>
            </div>
            {renderFocusedPreview()}
          </div>
        </section>

        <section className="branch-settings-subsection">
          <h3>{activeReportType === "cumulative_book" ? "Book Pages" : activeReportType === "cumulative_transcript" ? "Transcript Display Controls" : "Student Report Display Controls"}</h3>
          <p>Turn a field off to remove it from the printed output completely.</p>

          <div className="branch-report-toggle-grid">
            {activeControls.map((control) => (
              <label key={String(control.key)} className={`branch-report-toggle ${form[control.key] ? "is-on" : "is-off"}`}>
                <span>
                  <strong>{control.label}</strong>
                  <small>{control.note}</small>
                </span>

                <select
                  value={form[control.key] ? "yes" : "no"}
                  onChange={(event) => updateField(control.key, event.target.value === "yes")}
                >
                  <option value="yes">Show</option>
                  <option value="no">Hide</option>
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="branch-settings-subsection">
          <h3>{activeReportType === "cumulative_book" ? "Book Labels" : activeReportType === "cumulative_transcript" ? "Transcript Labels" : "Report Labels"}</h3>
          <p>Use each school's preferred wording without changing component code.</p>

          <div className="ba-form compact">
            {activeReportType === "student_report" && (
              <>
                <Field label="Class Teacher Label"><input value={form.classTeacherLabel} onChange={(event) => updateField("classTeacherLabel", event.target.value)} /></Field>
                <Field label="Headteacher Label"><input value={form.headTeacherLabel} onChange={(event) => updateField("headTeacherLabel", event.target.value)} /></Field>
                <Field label="Parent Label"><input value={form.parentLabel} onChange={(event) => updateField("parentLabel", event.target.value)} /></Field>
                <Field label="Principal Label"><input value={form.principalLabel} onChange={(event) => updateField("principalLabel", event.target.value)} /></Field>
                <Field label="Current Period End Label"><input value={form.currentAcademicPeriodEndLabel} onChange={(event) => updateField("currentAcademicPeriodEndLabel", event.target.value)} /></Field>
                <Field label="Next Period Label"><input value={form.nextAcademicPeriodLabel} onChange={(event) => updateField("nextAcademicPeriodLabel", event.target.value)} /></Field>
                <Field label="Number On Roll Label"><input value={form.numberOnRollLabel} onChange={(event) => updateField("numberOnRollLabel", event.target.value)} /></Field>
                <Field label="Class Position Label"><input value={form.classPositionLabel} onChange={(event) => updateField("classPositionLabel", event.target.value)} /></Field>
                <Field label="Subject Position Label"><input value={form.subjectPositionLabel} onChange={(event) => updateField("subjectPositionLabel", event.target.value)} /></Field>
              </>
            )}

            {activeReportType === "cumulative_book" && (
              <>
                <Field label="Book Title"><input value={form.bookTitleLabel} onChange={(event) => updateField("bookTitleLabel", event.target.value)} /></Field>
                <Field label="Book Subtitle"><input value={form.bookSubtitleLabel} onChange={(event) => updateField("bookSubtitleLabel", event.target.value)} /></Field>
                <Field label="Student Label"><input value={form.studentNameLabel} onChange={(event) => updateField("studentNameLabel", event.target.value)} /></Field>
                <Field label="Admission / Student ID Label"><input value={form.admissionNumberLabel} onChange={(event) => updateField("admissionNumberLabel", event.target.value)} /></Field>
                <Field label="Academic Period Label"><input value={form.academicPeriodLabel} onChange={(event) => updateField("academicPeriodLabel", event.target.value)} /></Field>
                <Field label="Average Label"><input value={form.averageLabel} onChange={(event) => updateField("averageLabel", event.target.value)} /></Field>
                <Field label="GPA Label"><input value={form.gpaLabel} onChange={(event) => updateField("gpaLabel", event.target.value)} /></Field>
              </>
            )}

            {activeReportType === "cumulative_transcript" && (
              <>
                <Field label="Student Label"><input value={form.studentNameLabel} onChange={(event) => updateField("studentNameLabel", event.target.value)} /></Field>
                <Field label="Student ID Label"><input value={form.admissionNumberLabel} onChange={(event) => updateField("admissionNumberLabel", event.target.value)} /></Field>
                <Field label="Programme / Class Label"><input value={form.classLabel} onChange={(event) => updateField("classLabel", event.target.value)} /></Field>
                <Field label="Academic Period Label"><input value={form.academicPeriodLabel} onChange={(event) => updateField("academicPeriodLabel", event.target.value)} /></Field>
                <Field label="Course / Subject Label"><input value={form.subjectLabel} onChange={(event) => updateField("subjectLabel", event.target.value)} /></Field>
                <Field label="Score / Total Label"><input value={form.totalLabel} onChange={(event) => updateField("totalLabel", event.target.value)} /></Field>
                <Field label="Average Label"><input value={form.averageLabel} onChange={(event) => updateField("averageLabel", event.target.value)} /></Field>
                <Field label="Grade Label"><input value={form.gradeLabel} onChange={(event) => updateField("gradeLabel", event.target.value)} /></Field>
                <Field label="GPA Label"><input value={form.gpaLabel} onChange={(event) => updateField("gpaLabel", event.target.value)} /></Field>
                <Field label="Position / Rank Label"><input value={form.subjectPositionLabel} onChange={(event) => updateField("subjectPositionLabel", event.target.value)} /></Field>
              </>
            )}

            <Field label="Generated Date Label">
              <select
                value={generatedDateLabelOptions.includes(form.generatedDateLabel) ? form.generatedDateLabel : "__custom__"}
                onChange={(event) => {
                  if (event.target.value === "__custom__") return;
                  updateField("generatedDateLabel", event.target.value);
                }}
              >
                {generatedDateLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                <option value="__custom__">Custom label...</option>
              </select>
            </Field>

            <Field label="Custom Generated Date Label">
              <input value={form.generatedDateLabel} onChange={(event) => updateField("generatedDateLabel", event.target.value)} placeholder="Generated" />
            </Field>

            <Field label="Footer Text">
              <input value={form.footerText} onChange={(event) => updateField("footerText", event.target.value)} placeholder="Official academic document generated by Eleeveon Schools." />
            </Field>
          </div>
        </section>

        <div className="ba-sheet-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={async () => {
              await saveReportCardTemplateSettings();
              onClose();
            }}
          >
            {saving ? "Saving..." : activeReportType === "cumulative_book" ? "Save Cumulative Book" : activeReportType === "cumulative_transcript" ? "Save Cumulative Transcript" : "Save Student Report"}
          </button>
        </div>
      </section>
    </div>
  );
}


function MediaSheet({
  title,
  text,
  form,
  fields,
  uploadImage,
  updateForm,
  clearImage,
  onClose,
}: {
  title: string;
  text: string;
  form: SettingsForm;
  fields: [string, ImageField, string][];
  uploadImage: (field: ImageField, file?: File) => void | Promise<void>;
  updateForm: (key: keyof SettingsForm, value: any) => void;
  clearImage: (field: ImageField) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}>✕</button>
        </div>

        <div className="branch-media-grid">
          {fields.map(([label, field, helper]) => (
            <ImageUploader
              key={field}
              label={label}
              field={field}
              helper={helper}
              value={String(form[field] || "")}
              upload={uploadImage}
              clear={() => clearImage(field)}
            />
          ))}
        </div>

        <div className="ba-sheet-actions">
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

function GallerySheet({
  images,
  handleGalleryUpload,
  removeGalleryImage,
  onClose,
}: {
  images: string[];
  handleGalleryUpload: (files: FileList | null) => void;
  removeGalleryImage: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Gallery</h2>
            <p>Images stored on this branch settings row for dashboards and future experiences.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close gallery">✕</button>
        </div>

        <div className="branch-media-block">
          <div className="branch-media-title">Gallery Images</div>
          <p>Used to bring the selected school branch into the app.</p>
          <input type="file" accept="image/*" multiple onChange={(event) => handleGalleryUpload(event.target.files)} />
        </div>

        {!!images?.length && (
          <div className="branch-gallery-grid">
            {images.map((image, index) => (
              <div key={`${image}-${index}`} className="branch-gallery-item">
                <img src={image} alt={`Gallery ${index + 1}`} />
                <button type="button" onClick={() => removeGalleryImage(index)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="ba-sheet-actions">
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </section>
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

.template-preview-studio {
  display: grid;
  gap: 12px;
}

.template-preview-studio-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.template-preview-studio-head h3,
.template-preview-focus-head strong {
  margin: 0;
}

.template-preview-badge {
  flex: 0 0 auto;
  padding: 6px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ba-primary, var(--primary-color, #2563eb)) 12%, transparent);
  color: var(--ba-primary, var(--primary-color, #2563eb));
  font-size: 10px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.template-preview-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
  gap: 10px;
}

.template-preview-card {
  appearance: none;
  -webkit-appearance: none;
  min-width: 0;
  display: grid;
  gap: 8px;
  padding: 9px;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--card-bg, var(--surface, #fff));
  color: var(--text, #111827);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 14px 30px rgba(15,23,42,.07);
}

.template-preview-card.selected {
  border-color: var(--ba-primary, var(--primary-color, #2563eb));
  box-shadow:
    0 18px 40px rgba(15,23,42,.10),
    0 0 0 3px color-mix(in srgb, var(--ba-primary, var(--primary-color, #2563eb)) 16%, transparent);
}

.template-preview-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.template-preview-card-top strong,
.template-preview-card-top em {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.template-preview-card-top strong {
  color: var(--text, #111827);
  font-size: 12px;
  font-weight: 1000;
}

.template-preview-card-top em {
  color: var(--muted, #64748b);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
}

.template-preview-card.selected .template-preview-card-top em {
  color: var(--ba-primary, var(--primary-color, #2563eb));
}

.template-preview-mini {
  height: 230px;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(148,163,184,.10), rgba(148,163,184,.05));
  border: 1px solid rgba(148,163,184,.18);
}

.template-preview-mini-scale {
  width: 210mm;
  min-width: 210mm;
  transform: scale(.235);
  transform-origin: top center;
  pointer-events: none;
}

.template-preview-mini .student-report-card-page,
.template-preview-mini .src-a4-page {
  margin: 0 !important;
  box-shadow: none !important;
}

.template-preview-focus {
  display: grid;
  gap: 9px;
  padding: 10px;
  border-radius: 20px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--muted, #64748b) 6%, transparent);
}

.template-preview-focus-head {
  display: grid;
  gap: 2px;
}

.template-preview-focus-head strong {
  color: var(--text, #111827);
  font-size: 13px;
  font-weight: 1000;
}

.template-preview-focus-head span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

@media screen and (max-width: 520px) {
  .template-preview-gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .template-preview-mini {
    height: 180px;
  }

  .template-preview-mini-scale {
    transform: scale(.18);
  }
}



.report-template-suite-sheet {
  width: min(980px, 100%);
}

.report-template-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 0 12px;
}

.report-template-tabs button {
  appearance: none;
  -webkit-appearance: none;
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border, rgba(148,163,184,.26));
  border-radius: 16px;
  background: var(--card-bg, var(--surface, #fff));
  color: var(--text, #0f172a);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15,23,42,.045);
}

.report-template-tabs button.active {
  border-color: var(--ba-primary, var(--primary-color, #2563eb));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ba-primary, #2563eb) 14%, transparent), transparent 64%),
    var(--card-bg, var(--surface, #fff));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ba-primary, #2563eb) 13%, transparent);
}

.report-template-tabs strong,
.report-template-tabs span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.report-template-tabs strong {
  font-size: 12px;
  font-weight: 1000;
  white-space: nowrap;
}

.report-template-tabs span {
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 760;
  line-height: 1.25;
}

.template-preview-mini .cumulative-book-page,
.template-preview-mini .cumulative-transcript-page {
  margin: 0 !important;
  box-shadow: none !important;
}

@media(max-width:720px) {
  .report-template-tabs {
    grid-template-columns: minmax(0, 1fr);
  }
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



/* Branch settings golden compact additions */
.branch-settings-page .ba-search-card {
  grid-template-columns: minmax(0, 1fr) auto auto auto;
}

.branch-settings-page .settings-save-button {
  width: auto;
  min-width: 46px;
  padding: 0 10px;
  font-size: 11px;
  letter-spacing: 0;
}

.branch-settings-page .branch-settings-list {
  grid-template-columns: minmax(0, 1fr);
}

.branch-settings-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  color: var(--ba-primary);
  font-size: 18px;
}

.branch-live-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 10px;
  border-radius: 20px;
  background: var(--card-bg, var(--surface, #ffffff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.branch-live-preview.sheet-preview {
  margin-top: 12px;
}

.branch-preview-aa {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  font-size: 15px;
  font-weight: 1000;
}

.branch-live-preview strong,
.branch-live-preview span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-live-preview strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.branch-live-preview span {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 800;
}

.branch-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.branch-field > span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.branch-color-input {
  padding: 4px !important;
  height: 44px;
}

.branch-media-grid {
  display: grid;
  grid-template-columns: minmax(0,1fr);
  gap: 10px;
  margin-top: 12px;
}

.branch-media-block {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
  border: 1px solid var(--border,rgba(0,0,0,.08));
}

.branch-media-title {
  color: var(--text,#111827);
  font-size: 13px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.branch-media-block p {
  margin: 0;
  color: var(--muted,#64748b);
  font-size: 11px;
  line-height: 1.5;
}

.branch-media-block input[type="file"] {
  min-height: auto;
  padding: 9px;
  font-size: 11px;
}

.branch-image-preview {
  position: relative;
  overflow: hidden;
  min-height: 130px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 12%, transparent);
}

.branch-image-preview img {
  width: 100%;
  height: 150px;
  display: block;
  object-fit: cover;
}

.branch-image-preview button {
  position: absolute;
  right: 8px;
  bottom: 8px;
  min-height: 30px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(15,23,42,.72);
  color: #fff;
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
}

.branch-gallery-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 8px;
  margin-top: 12px;
}

.branch-gallery-item {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 10%, transparent);
}

.branch-gallery-item img {
  width: 100%;
  height: 120px;
  display: block;
  object-fit: cover;
}

.branch-gallery-item button {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: rgba(15,23,42,.72);
  color: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.ba-menu-list button:disabled,
.ba-add-inline:disabled {
  opacity: .55;
  cursor: not-allowed;
}

@media(min-width:680px) {
  .branch-settings-page .branch-settings-list {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .branch-media-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .branch-gallery-grid {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }
}

@media(min-width:1040px) {
  .branch-settings-page .branch-settings-list {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }
}

@media(min-width:1320px) {
  .branch-settings-page .branch-settings-list {
    grid-template-columns: repeat(4, minmax(0,1fr));
  }
}

@media(max-width:520px) {
  .branch-settings-page .settings-save-button {
    min-width: 42px;
    width: 42px;
    padding: 0;
    font-size: 10px;
  }

  .branch-gallery-grid {
    grid-template-columns: minmax(0,1fr);
  }
}


.branch-settings-subsection {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid rgba(148,163,184,.22);
  border-radius: 18px;
  background: var(--card-bg, var(--surface, #ffffff));
}

.branch-settings-subsection h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 950;
}

.branch-settings-subsection p {
  margin: 4px 0 12px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.branch-report-toggle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.branch-report-toggle {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  border-radius: 16px;
  background: var(--card-bg, var(--surface, #ffffff));
  color: var(--text, #0f172a);
  box-shadow: 0 10px 24px rgba(15,23,42,.045);
  transition:
    border-color .18s var(--ease),
    background .18s var(--ease),
    box-shadow .18s var(--ease),
    transform .18s var(--ease);
}

.branch-report-toggle.is-on {
  border-color: color-mix(in srgb, var(--ba-primary, #2563eb) 34%, var(--border, rgba(148,163,184,.24)));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ba-primary, #2563eb) 10%, transparent), transparent 62%),
    var(--card-bg, var(--surface, #ffffff));
}

.branch-report-toggle.is-off {
  background: color-mix(in srgb, var(--muted, #64748b) 7%, var(--card-bg, var(--surface, #ffffff)));
  opacity: .92;
}

.branch-report-toggle:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ba-primary, #2563eb) 42%, var(--border, rgba(148,163,184,.24)));
  box-shadow: 0 14px 30px rgba(15,23,42,.075);
}

.branch-report-toggle span,
.branch-report-toggle strong,
.branch-report-toggle small {
  display: block;
  min-width: 0;
}

.branch-report-toggle strong {
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  line-height: 1.15;
  letter-spacing: -.01em;
}

.branch-report-toggle small {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 750;
  line-height: 1.28;
}

.branch-report-toggle.is-off strong {
  color: var(--muted, #64748b);
}

.branch-report-toggle select {
  min-height: 34px;
  height: 34px;
  border-radius: 999px;
  padding: 0 26px 0 12px;
  border: 1px solid color-mix(in srgb, var(--ba-primary, #2563eb) 30%, var(--border, rgba(148,163,184,.26)));
  background: var(--input-bg, var(--surface, #ffffff));
  color: var(--input-text, var(--text, #0f172a));
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
}

.branch-report-toggle.is-on select {
  background: var(--ba-primary, #2563eb);
  color: #ffffff;
  border-color: var(--ba-primary, #2563eb);
}

.branch-report-toggle.is-off select {
  background: var(--input-bg, var(--surface, #ffffff));
  color: var(--muted, #64748b);
  border-color: var(--border, rgba(148,163,184,.26));
}

.branch-report-toggle select option {
  background: var(--input-bg, var(--surface, #ffffff));
  color: var(--input-text, var(--text, #0f172a));
}

@media(max-width:720px) {
  .branch-report-toggle-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}


`;
