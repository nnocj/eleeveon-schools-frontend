"use client";

/**
 * reports/cumulative-book/CumulativeReportBook.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — CUMULATIVE REPORT BOOK ASSEMBLER
 * ---------------------------------------------------------
 *
 * This component creates a printable academic book:
 * - optional front cover
 * - optional profile / journey / summary pages
 * - one StudentReportCard per available academic-period snapshot
 * - optional back cover
 *
 * Important:
 * It does NOT recompute report results. It expects each period to already have
 * a valid StudentReportCardDataset and passes that dataset into StudentReportCard.
 */

import React, { useMemo } from "react";

import StudentReportCard from "../components/StudentReportCard";

import CumulativeBookFrontCover from "./CumulativeBookFrontCover";
import CumulativeBookStudentProfilePage from "./CumulativeBookStudentProfilePage";
import CumulativeBookAcademicJourneyPage from "./CumulativeBookAcademicJourneyPage";
import CumulativeBookSummaryPage from "./CumulativeBookSummaryPage";
import CumulativeBookBackCover from "./CumulativeBookBackCover";

import type {
  CumulativeReportBookDataset,
  CumulativeReportBookProps,
  CumulativeReportBookSettings,
} from "./cumulative-book-types";

import { computeBookSummary, periodName } from "./cumulative-book-utils";

function normalizeBookDataset(
  dataset?: CumulativeReportBookDataset | null,
): CumulativeReportBookDataset | null {
  if (!dataset) return null;

  const periods = Array.isArray(dataset.periods)
    ? dataset.periods.filter((period) => !!period?.dataset)
    : [];

  const normalized: CumulativeReportBookDataset = {
    ...dataset,
    periods,
    summary: {
      ...computeBookSummary({ ...dataset, periods }),
      ...(dataset.summary || {}),
    },
  };

  return normalized;
}

function resolvedSettings(
  settings?: CumulativeReportBookSettings | null,
  templateSettings?: CumulativeReportBookSettings | null,
): CumulativeReportBookSettings {
  return {
    showBookFrontCover: true,
    showBookStudentProfilePage: true,
    showBookAcademicJourneyPage: true,
    showBookSummaryPage: true,
    showBookBackCover: true,
    showGeneratedDate: true,
    generatedDateLabel: "Generated",
    ...(templateSettings || {}),
    ...(settings || {}),
    reportType: "cumulative_book",
  };
}

export default function CumulativeReportBook({
  dataset,
  template,
  settings,
  templateSettings,
  compact = false,
  showWatermark = true,
  pageBreakAfter = true,
  mobilePreview = true,
  includeCovers = true,
}: CumulativeReportBookProps) {
  const bookDataset = useMemo(() => normalizeBookDataset(dataset), [dataset]);
  const bookSettings = useMemo(
    () => resolvedSettings(settings, templateSettings),
    [settings, templateSettings],
  );

  if (!bookDataset || !bookDataset.periods.length) {
    return (
      <div className="cumulative-book-empty-card">
        <style>{css}</style>
        No published report snapshots are available for this cumulative report
        book.
      </div>
    );
  }

  const showFrontCover =
    includeCovers && bookSettings.showBookFrontCover !== false;
  const showProfile = bookSettings.showBookStudentProfilePage !== false;
  const showJourney = bookSettings.showBookAcademicJourneyPage !== false;
  const showSummary = bookSettings.showBookSummaryPage !== false;
  const showBackCover =
    includeCovers && bookSettings.showBookBackCover !== false;

  return (
    <div className="cumulative-book-root">
      <style>{css}</style>

      {showFrontCover && (
        <CumulativeBookFrontCover
          dataset={bookDataset}
          template={template}
          settings={bookSettings}
          compact={compact}
          pageBreakAfter
        />
      )}

      {showProfile && (
        <CumulativeBookStudentProfilePage
          dataset={bookDataset}
          template={template}
          settings={bookSettings}
          compact={compact}
          pageBreakAfter
        />
      )}

      {showJourney && (
        <CumulativeBookAcademicJourneyPage
          dataset={bookDataset}
          template={template}
          settings={bookSettings}
          compact={compact}
          pageBreakAfter
        />
      )}

      {showSummary && (
        <CumulativeBookSummaryPage
          dataset={bookDataset}
          template={template}
          settings={bookSettings}
          compact={compact}
          pageBreakAfter
        />
      )}

      {bookDataset.periods.map((period, index) => (
        <div
          key={String(period.id || period.academicPeriodId || index)}
          className="cumulative-book-report-card-page"
        >
          <div className="report-no-print cumulative-book-period-label">
            <strong>{periodName(period)}</strong>
            <span>
              Period {index + 1} of {bookDataset.periods.length}
            </span>
          </div>

          <StudentReportCard
            dataset={period.dataset}
            template={template as any}
            settings={bookSettings as any}
            compact={compact}
            showWatermark={showWatermark}
            pageBreakAfter={
              pageBreakAfter ||
              index < bookDataset.periods.length - 1 ||
              showBackCover
            }
            mobilePreview={mobilePreview}
          />
        </div>
      ))}

      {showBackCover && (
        <CumulativeBookBackCover
          dataset={bookDataset}
          template={template}
          settings={bookSettings}
          compact={compact}
          pageBreakAfter={false}
        />
      )}
    </div>
  );
}

const css = `
.cumulative-book-empty-card {
  padding: 18px;
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 850;
}

.cumulative-book-root {
  width: 100%;
  max-width: 100%;
}

.cumulative-book-period-label {
  width: min(210mm, 100%);
  margin: 0 auto 8px;
  padding: 8px 10px;
  border-radius: 14px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148,163,184,.25);
  color: var(--text, #0f172a);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  box-sizing: border-box;
}

.cumulative-book-period-label span {
  color: var(--muted, #64748b);
  font-weight: 800;
}

@media print {
  .cumulative-book-period-label,
  .report-no-print {
    display: none !important;
  }

  .cumulative-book-root {
    width: 100% !important;
  }

  .cumulative-book-page {
    box-shadow: none !important;
    margin: 0 auto !important;
    border-color: #111 !important;
    border-radius: 0 !important;
  }
}
`;
