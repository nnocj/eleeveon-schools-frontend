"use client";

/**
 * reports/cumulative-book/cumulative-book-utils.ts
 * ---------------------------------------------------------
 * Utility helpers for the cumulative report book pages.
 */

import type React from "react";
import type {
  CumulativeBookTemplateTone,
  CumulativeReportBookDataset,
  CumulativeReportBookSettings,
} from "./cumulative-book-types";
import {
  friendlyReportDate,
  firstText,
  formatNumber,
  ordinal,
} from "../shared/ReportTemplateUtils";

export { friendlyReportDate, firstText, formatNumber, ordinal };

export function resolveBookBranding(
  dataset?: CumulativeReportBookDataset | null,
) {
  const headerBranding = (dataset as any)?.header?.branding || {};
  const header = (dataset as any)?.header || {};
  const branding = ((dataset as any)?.branding || {}) as any;

  return {
    schoolName: firstText(
      branding.schoolName,
      headerBranding.schoolName,
      header.schoolName,
      header.school?.name,
      "School Name",
    ),
    branchName: firstText(
      branding.branchName,
      headerBranding.branchName,
      header.branchName,
      header.branch?.name,
    ),
    motto: firstText(
      branding.motto,
      headerBranding.motto,
      header.school?.motto,
    ),
    logo: firstText(
      branding.logo,
      branding.resolvedLogoUrl,
      headerBranding.logo,
      headerBranding.resolvedLogoUrl,
      header.logo,
      header.resolvedLogoUrl,
      header.schoolBranchSetting?.logo,
      header.schoolBranchSetting?.resolvedLogoUrl,
      header.school?.logo,
      header.school?.resolvedLogoUrl,
      header.branch?.logo,
      header.branch?.resolvedLogoUrl,
    ),
    address: firstText(
      branding.address,
      headerBranding.address,
      header.school?.address,
    ),
    phone: firstText(
      branding.phone,
      headerBranding.phone,
      header.school?.phone,
    ),
    email: firstText(
      branding.email,
      headerBranding.email,
      header.school?.email,
    ),
    website: firstText(
      branding.website,
      headerBranding.website,
      header.school?.website,
    ),
    primaryColor: firstText(
      branding.primaryColor,
      headerBranding.primaryColor,
      header.primaryColor,
      "#1d4ed8",
    ),
    fontFamily: firstText(
      branding.fontFamily,
      headerBranding.fontFamily,
      header.fontFamily,
      "Arial, sans-serif",
    ),
    reportCardBackgroundImage: firstText(
      branding.reportCardBackgroundImage,
      branding.resolvedReportCardBackgroundImage,
      headerBranding.reportCardBackgroundImage,
      headerBranding.resolvedReportCardBackgroundImage,
      header.reportCardBackgroundImage,
      header.resolvedReportCardBackgroundImage,
      header.schoolBranchSetting?.reportCardBackgroundImage,
      header.schoolBranchSetting?.resolvedReportCardBackgroundImage,
    ),
    reportCardWatermark: firstText(
      branding.reportCardWatermark,
      branding.resolvedReportCardWatermark,
      headerBranding.reportCardWatermark,
      headerBranding.resolvedReportCardWatermark,
      header.reportCardWatermark,
      header.resolvedReportCardWatermark,
      header.schoolBranchSetting?.reportCardWatermark,
      header.schoolBranchSetting?.resolvedReportCardWatermark,
      branding.logo,
      branding.resolvedLogoUrl,
      headerBranding.logo,
      headerBranding.resolvedLogoUrl,
      header.logo,
      header.resolvedLogoUrl,
      header.schoolBranchSetting?.logo,
      header.school?.logo,
      header.branch?.logo,
    ),
    reportCardSignatureImage: firstText(
      branding.reportCardSignatureImage,
      branding.resolvedReportCardSignatureImage,
      headerBranding.reportCardSignatureImage,
      headerBranding.resolvedReportCardSignatureImage,
      header.reportCardSignatureImage,
      header.resolvedReportCardSignatureImage,
      header.schoolBranchSetting?.reportCardSignatureImage,
      header.schoolBranchSetting?.resolvedReportCardSignatureImage,
    ),
  };
}

export function resolveBookStudent(
  dataset?: CumulativeReportBookDataset | null,
) {
  const firstPeriodDataset = dataset?.periods?.[0]?.dataset as any;
  const firstReport = firstPeriodDataset?.report || {};
  const firstStudent = firstPeriodDataset?.student || {};
  const firstStudentInfo = firstPeriodDataset?.studentInfo || {};
  const student = ((dataset as any)?.student ||
    (dataset as any)?.studentInfo ||
    {}) as any;

  return {
    id: student.id || firstStudent.id || firstReport.studentId,
    fullName: firstText(
      student.fullName,
      student.name,
      firstStudent.fullName,
      firstStudent.name,
      firstReport.studentName,
      "Student Name",
    ),
    admissionNumber: firstText(
      student.admissionNumber,
      firstStudent.admissionNumber,
      firstReport.admissionNumber,
    ),
    gender: firstText(student.gender, firstStudent.gender, firstReport.gender),
    className: firstText(
      student.className,
      student.currentClassName,
      firstReport.className,
    ),
    photo: firstText(
      student.photo,
      student.studentPhoto,
      student.resolvedPhotoUrl,
      student.resolvedStudentPhotoUrl,
      firstStudentInfo.studentPhoto,
      firstStudentInfo.photo,
      firstStudentInfo.resolvedPhotoUrl,
      firstStudentInfo.resolvedStudentPhotoUrl,
      firstStudent.studentPhoto,
      firstStudent.photo,
      firstStudent.resolvedPhotoUrl,
      firstStudent.resolvedStudentPhotoUrl,
      firstReport.studentPhoto,
      firstReport.photo,
    ),
    dateOfBirth: firstText(student.dateOfBirth, firstStudent.dateOfBirth),
    parentName: firstText(student.parentName, firstStudent.parentName),
    parentPhone: firstText(student.parentPhone, firstStudent.parentPhone),
    parentEmail: firstText(student.parentEmail, firstStudent.parentEmail),
    address: firstText(student.address, firstStudent.address),
  };
}

export function templateCodeOf(template?: any, settings?: any) {
  return firstText(
    template?.code,
    template?.templateCode,
    template?.layoutKey,
    template?.templateKey,
    settings?.templateCode,
    settings?.layoutKey,
    "classic_formal",
  );
}

export function templateTone(
  template?: any,
  settings?: any,
): CumulativeBookTemplateTone {
  const code = templateCodeOf(template, settings).toLowerCase();

  if (code.includes("modern")) return "modern";
  if (code.includes("bordered") || code.includes("traditional"))
    return "traditional";
  if (code.includes("letterhead") || code.includes("premium")) return "premium";
  if (code.includes("side")) return "sideProfile";
  if (code.includes("cambridge")) return "cambridge";
  if (code === "ib" || code.includes("international")) return "ib";
  if (code.includes("kindergarten")) return "kindergarten";
  if (code.includes("montessori")) return "montessori";
  if (code.includes("university") || code.includes("transcript"))
    return "transcript";
  if (code.includes("compact")) return "compact";

  return "classic";
}

export function computeBookSummary(
  dataset?: CumulativeReportBookDataset | null,
) {
  const periods = dataset?.periods || [];
  const averages = periods
    .map((period) =>
      Number(period.average ?? (period.dataset as any)?.report?.average),
    )
    .filter((value) => Number.isFinite(value));

  const positions = periods
    .map((period) =>
      Number(
        period.position ?? (period.dataset as any)?.report?.overallPosition,
      ),
    )
    .filter((value) => Number.isFinite(value) && value > 0);

  const gpas = periods
    .map((period) =>
      Number(period.gpa ?? (period.dataset as any)?.report?.overallGPA),
    )
    .filter((value) => Number.isFinite(value));

  const firstAverage = averages.length ? averages[0] : null;
  const latestAverage = averages.length ? averages[averages.length - 1] : null;
  const bestAverage = averages.length ? Math.max(...averages) : null;
  const cumulativeAverage = averages.length
    ? averages.reduce((sum, value) => sum + value, 0) / averages.length
    : null;
  const cumulativeGPA = gpas.length
    ? gpas.reduce((sum, value) => sum + value, 0) / gpas.length
    : null;

  let trend: "up" | "down" | "stable" | "none" = "none";
  if (firstAverage != null && latestAverage != null && averages.length > 1) {
    const diff = latestAverage - firstAverage;
    trend = Math.abs(diff) < 1 ? "stable" : diff > 0 ? "up" : "down";
  }

  return {
    totalPeriods: periods.length,
    firstPeriodName: periodName(periods[0]),
    latestPeriodName: periodName(periods[periods.length - 1]),
    firstAverage,
    latestAverage,
    bestAverage,
    cumulativeAverage,
    cumulativeGPA,
    bestPosition: positions.length ? Math.min(...positions) : null,
    latestPosition: positions.length ? positions[positions.length - 1] : null,
    trend,
    ...(dataset?.summary || {}),
  };
}

export function periodName(period?: any) {
  return firstText(
    period?.academicPeriodName,
    period?.title,
    period?.label,
    period?.term,
    period?.dataset?.header?.academicPeriod?.name,
    period?.dataset?.header?.academicPeriodName,
    "Academic Period",
  );
}

export function periodDateRange(period?: any) {
  const start = firstText(
    period?.formattedStartDate,
    friendlyReportDate(period?.startDate),
  );
  const end = firstText(
    period?.formattedEndDate,
    friendlyReportDate(period?.endDate),
  );
  if (start && end) return `${start} – ${end}`;
  return start || end || "";
}

export function trendText(trend?: string | null) {
  if (trend === "up") return "Improving";
  if (trend === "down") return "Needs attention";
  if (trend === "stable") return "Stable";
  return "Not enough data";
}

export function decisionText(value?: string | null) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function bookPageStyle(args: {
  primary: string;
  fontFamily: string;
  compact?: boolean;
  pageBreakAfter?: boolean;
  tone?: CumulativeBookTemplateTone;
}): React.CSSProperties {
  const tone = args.tone || "classic";
  const paper =
    tone === "kindergarten"
      ? "linear-gradient(180deg,#fff8f1,#ffffff 42%,#f0fdfa)"
      : tone === "montessori"
        ? "linear-gradient(180deg,#fffdf7,#ffffff 48%,#f8faf4)"
        : tone === "premium"
          ? "linear-gradient(180deg,#fff,#fffaf0)"
          : "#ffffff";

  return {
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto 18px",
    padding: args.compact ? "10mm" : "12mm",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    background: paper,
    color: "#111827",
    fontFamily: args.fontFamily,
    border: tone === "transcript" ? "1px solid #111827" : "1px solid #d1d5db",
    borderRadius: tone === "transcript" ? 2 : tone === "classic" ? 6 : 18,
    boxShadow: "0 18px 48px rgba(15,23,42,.10)",
    pageBreakAfter: args.pageBreakAfter ? "always" : "auto",
    breakAfter: args.pageBreakAfter ? "page" : "auto",
  };
}

export function sectionTitleStyle(
  primary: string,
  tone?: CumulativeBookTemplateTone,
): React.CSSProperties {
  if (tone === "transcript") {
    return {
      margin: "0 0 8px",
      padding: "6px 8px",
      background: "#111827",
      color: "#fff",
      fontSize: 10,
      fontWeight: 900,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    };
  }

  return {
    margin: "0 0 8px",
    color: primary,
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  };
}

export function getContrastTextColor(hex: string) {
  let col = (hex || "#ffffff").replace("#", "");
  if (col.startsWith("rgb")) return "#fff";
  if (col.length === 3)
    col = col
      .split("")
      .map((c) => c + c)
      .join("");

  const num = parseInt(col, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 140 ? "#111827" : "#fff";
}

export function generatedBookDate(
  dataset?: CumulativeReportBookDataset | null,
  settings?: CumulativeReportBookSettings | null,
) {
  if (settings?.showGeneratedDate === false) return "";
  return friendlyReportDate(dataset?.generatedAt || new Date());
}
