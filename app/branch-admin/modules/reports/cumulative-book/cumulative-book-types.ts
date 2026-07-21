"use client";

/**
 * reports/cumulative-book/cumulative-book-types.ts
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — CUMULATIVE REPORT BOOK TYPES
 * ---------------------------------------------------------
 *
 * The cumulative report book is not a new result engine.
 * It is a printable book assembler:
 * - cover pages and information pages are rendered here
 * - each academic period/snapshot page reuses StudentReportCard
 * - the selected student report template controls the visual style of each report page
 */

import type { StudentReportCardDataset } from "../engine/report-types";
import type {
  ReportCardTemplateLike,
  StudentReportTemplateDefinition,
  StudentReportTemplateSettings,
} from "../shared/ReportTemplateTypes";

export type CumulativeBookTemplateTone =
  | "classic"
  | "modern"
  | "traditional"
  | "premium"
  | "sideProfile"
  | "cambridge"
  | "ib"
  | "kindergarten"
  | "montessori"
  | "transcript"
  | "compact";

export type CumulativeBookPeriodDataset = {
  id?: string | string;
  academicPeriodId?: string | string | null;
  academicPeriodName?: string | null;
  academicYear?: string | null;
  term?: string | null;
  title?: string | null;
  label?: string | null;
  startDate?: string | number | Date | null;
  endDate?: string | number | Date | null;
  formattedStartDate?: string | null;
  formattedEndDate?: string | null;

  /**
   * This is the already-normal student report-card dataset for one period.
   * Cumulative book pages should pass it directly into StudentReportCard.
   */
  dataset: StudentReportCardDataset;

  total?: number | null;
  average?: number | null;
  position?: number | null;
  gpa?: number | null;
  recommendation?: string | null;
  publishedAt?: string | number | Date | null;
};

export type CumulativeBookStudentInfo = {
  id?: string | string | null;
  fullName?: string | null;
  name?: string | null;
  admissionNumber?: string | null;
  gender?: string | null;
  className?: string | null;
  currentClassName?: string | null;
  photo?: string | null;
  studentPhoto?: string | null;
  dateOfBirth?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  address?: string | null;
};

export type CumulativeBookBranding = {
  schoolName?: string | null;
  branchName?: string | null;
  motto?: string | null;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  primaryColor?: string | null;
  fontFamily?: string | null;
  reportCardBackgroundImage?: string | null;
  reportCardWatermark?: string | null;
  reportCardSignatureImage?: string | null;
};

export type CumulativeBookSummary = {
  totalPeriods?: number;
  firstPeriodName?: string;
  latestPeriodName?: string;
  firstAverage?: number | null;
  latestAverage?: number | null;
  bestAverage?: number | null;
  cumulativeAverage?: number | null;
  cumulativeGPA?: number | null;
  bestPosition?: number | null;
  latestPosition?: number | null;
  trend?: "up" | "down" | "stable" | "none" | string;
  finalRecommendation?: string | null;
};

export type CumulativeReportBookDataset = {
  generatedAt?: string | number | Date | null;
  title?: string | null;
  subtitle?: string | null;

  header?: any;
  branding?: CumulativeBookBranding;
  student?: CumulativeBookStudentInfo;
  studentInfo?: CumulativeBookStudentInfo;

  periods: CumulativeBookPeriodDataset[];
  summary?: CumulativeBookSummary;
  notes?: string[];
};

export type CumulativeReportBookSettings =
  Partial<StudentReportTemplateSettings> & {
    reportType?: "cumulative_book" | string;

    showBookFrontCover?: boolean;
    showBookStudentProfilePage?: boolean;
    showBookAcademicJourneyPage?: boolean;
    showBookSummaryPage?: boolean;
    showBookBackCover?: boolean;

    bookTitleLabel?: string;
    bookSubtitleLabel?: string;

    showGeneratedDate?: boolean;
    generatedDateLabel?: string;

    footerText?: string;
  };

export type CumulativeReportBookProps = {
  dataset?: CumulativeReportBookDataset | null;

  /**
   * The selected STUDENT report template. The book uses it for each period page
   * and also uses its code/layoutKey to style the extra book pages.
   */
  template?: ReportCardTemplateLike | StudentReportTemplateDefinition | null;

  /**
   * The selected STUDENT report template settings.
   */
  settings?: CumulativeReportBookSettings | null;
  templateSettings?: CumulativeReportBookSettings | null;

  compact?: boolean;
  showWatermark?: boolean;
  pageBreakAfter?: boolean;
  mobilePreview?: boolean;

  /**
   * Optional override when a page wants to hide the book covers without changing saved settings.
   */
  includeCovers?: boolean;
};
