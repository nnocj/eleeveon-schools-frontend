"use client";

/**
 * Eleeveon Schools â€” printable A4 NEXT-TERM fees and requirements notice.
 *
 * The title identifies BOTH the current and upcoming academic periods.
 * Only next-term fees, requirements and instructions appear in the body.
 * The sole current-term financial carry-forward is the student's recorded
 * outstanding balance (arrears), shown separately from next-term fees.
 *
 * Presentation only: this component does not read Dexie, issue invoices,
 * collect payments or update financial records.
 */

import React from "react";
import type { FeeStructureItem } from "../../../lib/db/db";
import { formatFinanceMoney, getFinanceCurrency } from "./financeCurrency";

export type TermNoticePrintTemplateProps = {
  schoolName: string;
  branchName?: string;
  schoolLogo?: string;
  schoolMotto?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  primaryColor?: string;

  // Current term: displayed ONLY in the title, with studentBalance below.
  academicStructure: string;
  academicPeriod: string;

  // Upcoming term: the period whose fees and supplies are being announced.
  nextAcademicStructure?: string;
  nextAcademicPeriod?: string;
  nextPeriodConfigured?: boolean;

  className: string;
  studentName?: string;
  admissionNumber?: string;

  // Retained for compatibility; current-term line items are not printed.
  fees: FeeStructureItem[];
  requirements: FeeStructureItem[];
  dueDate?: string;
  notice?: string;

  nextFees?: FeeStructureItem[];
  nextRequirements?: FeeStructureItem[];
  nextDueDate?: string;
  nextNotice?: string;

  // Must be the student's CURRENT-TERM outstanding invoice balance, not fees.
  studentBalance?: number;
  currencyCode?: string;
  nextCurrencyCode?: string;
  issuedOn: string;
};

function nonNegativeAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatQuantity(item: FeeStructureItem): string {
  const supplied = Number(item.quantity);
  const quantity = Number.isFinite(supplied) && supplied > 0 ? supplied : 1;
  return `${quantity.toLocaleString("en-GH")} ${item.unit?.trim() || "pcs"}`;
}

export default function TermNoticePrintTemplate({
  schoolName,
  branchName,
  schoolLogo,
  schoolMotto,
  schoolAddress,
  schoolPhone,
  primaryColor = "#1e4f83",
  academicStructure,
  academicPeriod,
  nextAcademicStructure,
  nextAcademicPeriod,
  nextPeriodConfigured = false,
  className,
  studentName,
  admissionNumber,
  nextFees = [],
  nextRequirements = [],
  studentBalance,
  currencyCode = "GHS",
  nextCurrencyCode = "GHS",
  nextDueDate,
  nextNotice,
  issuedOn,
}: TermNoticePrintTemplateProps) {
  const currentStructure = academicStructure?.trim() || "Not specified";
  const currentPeriod = academicPeriod?.trim() || "Not specified";
  const upcomingStructure = nextAcademicStructure?.trim() || "Not configured";
  const upcomingPeriod = nextAcademicPeriod?.trim() || "Not configured";
  const hasUpcomingPeriod = Boolean(nextAcademicPeriod?.trim());

  // Only period-specific NEXT-term fee data contributes to next-term fees.
  const nextFeeTotal = nextFees.reduce(
    (total, item) => total + nonNegativeAmount(item.amount),
    0,
  );
  const hasNextFees = nextFees.length > 0;
  const nextCurrency = getFinanceCurrency(nextCurrencyCode).code;
  const currentCurrency = getFinanceCurrency(currencyCode).code;
  const moneyNext = (amount: number) =>
    formatFinanceMoney(amount, nextCurrencyCode);
  const moneyCurrent = (amount: number) =>
    formatFinanceMoney(amount, currencyCode);

  // Undefined is different from zero: it means no balance was supplied.
  const hasRecordedBalance =
    studentBalance !== undefined &&
    studentBalance !== null &&
    Number.isFinite(Number(studentBalance));
  const currentArrears = hasRecordedBalance
    ? nonNegativeAmount(studentBalance)
    : 0;
  const currenciesMatch = nextCurrency === currentCurrency;
  const canShowCombinedTotal =
    hasNextFees && hasRecordedBalance && currenciesMatch;
  const hasNextNoticeDetails = Boolean(
    nextPeriodConfigured ||
      nextFees.length ||
      nextRequirements.length ||
      nextDueDate ||
      nextNotice,
  );
  const showNextNotice = hasUpcomingPeriod && hasNextNoticeDetails;

  return (
    <article
      className="ef-print-sheet ef-term-notice-a4"
      data-a4-paper="portrait"
      style={{ "--notice-accent": primaryColor } as React.CSSProperties}
    >
      <style>{`
        .ef-term-notice-a4 {
          width:100%;min-height:265mm;padding:0;box-sizing:border-box;
          color:#142238;background:#fff;font:11px/1.43 Arial,Helvetica,sans-serif;
          overflow:visible;
        }
        .ef-term-notice-a4 * {box-sizing:border-box;}
        .ef-term-notice-a4 .ef-document-head {
          display:grid;grid-template-columns:76px minmax(0,1fr) 76px;
          gap:12px;align-items:center;padding:0 0 11px;
          border-bottom:2px solid #193655;
        }
        .ef-term-notice-a4 .ef-document-logo {
          width:70px;height:70px;object-fit:contain;
        }
        .ef-term-notice-a4 .ef-document-logo-fallback {
          width:70px;height:70px;display:grid;place-items:center;
          text-align:center;font-size:10px;border:1px solid #98a8bc;
        }
        .ef-term-notice-a4 .ef-document-school {
          margin:0;font-size:20px;line-height:1.12;font-weight:900;
          text-transform:uppercase;overflow-wrap:anywhere;
        }
        .ef-term-notice-a4 .ef-document-motto {
          margin:4px 0 0;font-size:10px;font-style:italic;
        }
        .ef-term-notice-a4 .ef-document-contact {
          margin:3px 0 0;font-size:10px;overflow-wrap:anywhere;
        }

        /* Both academic structures and periods sit directly below the title. */
        .ef-term-notice-a4 .ef-document-title {
          margin:13px 0 11px;border:1px solid #bac7d2;
          border-left:4px solid var(--notice-accent,#1e4f83);
          background:#f6f8fa;
        }
        .ef-term-notice-a4 .ef-document-title h2 {
          margin:0;padding:10px 10px 8px;text-align:center;
          font-size:17px;line-height:1.2;font-weight:900;
          letter-spacing:.3px;text-transform:uppercase;
        }
        .ef-term-notice-a4 .ef-title-periods {
          display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);
          border-top:1px solid #c6d0db;
        }
        .ef-term-notice-a4 .ef-title-period {
          min-width:0;padding:8px 12px 9px;
        }
        .ef-term-notice-a4 .ef-title-period.current {
          border-right:1px solid #c6d0db;background:#f5f7f9;
        }
        .ef-term-notice-a4 .ef-title-period.next {
          background:#eaf2fa;border-top:2px solid var(--notice-accent,#1e4f83);
          padding-top:6px;
        }
        .ef-term-notice-a4 .ef-title-period-title {
          display:block;margin-bottom:5px;color:#5e6c7d;
          font-size:9px;font-weight:900;letter-spacing:.7px;
          text-transform:uppercase;
        }
        .ef-term-notice-a4 .ef-title-period.next .ef-title-period-title {
          color:var(--notice-accent,#1e4f83);font-size:10px;
        }
        .ef-term-notice-a4 .ef-period-field {margin-top:3px;min-width:0;}
        .ef-term-notice-a4 .ef-period-field small {
          display:block;color:#66778a;font-size:8.5px;font-weight:750;
          text-transform:uppercase;letter-spacing:.2px;
        }
        .ef-term-notice-a4 .ef-period-field strong {
          display:block;color:#445468;font-size:11px;font-weight:750;
          line-height:1.25;overflow-wrap:anywhere;
        }
        .ef-term-notice-a4 .ef-title-period.next .ef-period-field strong {
          color:#18324d;font-size:12px;font-weight:900;
        }

        .ef-term-notice-a4 .ef-document-info {
          display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
          margin-bottom:13px;border:1px solid #c5cfd9;
        }
        .ef-term-notice-a4 .ef-document-info>div {
          min-width:0;padding:7px 9px;border-right:1px solid #c5cfd9;
        }
        .ef-term-notice-a4 .ef-document-info>div:last-child {border-right:0;}
        .ef-term-notice-a4 .ef-document-info small {
          display:block;color:#64748b;font-size:9px;font-weight:850;
          letter-spacing:.3px;text-transform:uppercase;
        }
        .ef-term-notice-a4 .ef-document-info b {
          display:block;font-size:11.5px;overflow-wrap:anywhere;
        }

        /* Original-style full-width sections, not two fee/term panels. */
        .ef-term-notice-a4 .ef-doc-section {margin-top:15px;min-width:0;}
        .ef-term-notice-a4 .ef-doc-section h3 {
          margin:0 0 7px;color:#182d47;font-size:13.5px;
          font-weight:900;text-transform:uppercase;break-after:avoid-page;
        }
        .ef-term-notice-a4 .ef-doc-table {
          width:100%;border-collapse:collapse;table-layout:fixed;
        }
        .ef-term-notice-a4 .ef-doc-table th,
        .ef-term-notice-a4 .ef-doc-table td {
          padding:8px 9px;border:1px solid #a9b6c5;
          font-size:11.5px;text-align:left;vertical-align:top;
          overflow-wrap:anywhere;
        }
        .ef-term-notice-a4 .ef-doc-table th {
          background:#e9eff5;color:#1b3148;font-size:11px;font-weight:900;
        }
        .ef-term-notice-a4 .ef-doc-table .ef-doc-number {
          width:32%;text-align:right;font-variant-numeric:tabular-nums;
        }
        .ef-term-notice-a4 .ef-doc-table .ef-doc-total {
          background:#f1f5f9;font-weight:850;
        }
        .ef-term-notice-a4 .ef-doc-table .ef-doc-arrears {
          background:#fcfcfd;color:#35465c;
        }
        .ef-term-notice-a4 .ef-doc-table .ef-doc-payable {
          background:#eaf2fa;font-size:13px;font-weight:900;
          border-top:2px solid var(--notice-accent,#1e4f83);
        }
        .ef-term-notice-a4 .ef-doc-table .ef-doc-payable .ef-doc-number {
          color:#173d61;font-size:14px;
        }
        .ef-term-notice-a4 .ef-doc-muted {
          margin:7px 0 0;color:#5f6f83;font-size:10px;
        }
        .ef-term-notice-a4 .ef-doc-table .ef-material-item {width:36%;}
        .ef-term-notice-a4 .ef-doc-table .ef-material-qty {
          width:18%;white-space:normal;
        }
        .ef-term-notice-a4 .ef-doc-table .ef-material-instructions {width:46%;}
        .ef-term-notice-a4 .ef-doc-optional {
          display:block;margin-top:2px;color:#607187;font-size:10px;
        }
        .ef-term-notice-a4 .ef-doc-note {
          margin-top:15px;padding:10px 12px;border:1px solid #bac7d2;
          border-left:3px solid var(--notice-accent,#1e4f83);
          background:#f9fbfd;font-size:11px;overflow-wrap:anywhere;
        }
        .ef-term-notice-a4 .ef-doc-note strong {
          display:block;margin-bottom:4px;font-size:11.5px;
        }
        .ef-term-notice-a4 .ef-doc-note p {
          margin:4px 0 0;white-space:pre-wrap;
        }
        .ef-term-notice-a4 .ef-doc-status {
          margin:16px 0;padding:14px;border:1px solid #c3ceda;
          background:#f8fafc;color:#43566b;font-size:11.5px;
        }
        .ef-term-notice-a4 .ef-doc-footer {
          display:flex;justify-content:space-between;gap:12px;
          margin-top:23px;padding-top:8px;border-top:1px solid #94a3b8;
          font-size:10px;color:#475569;
        }
        @media (max-width:560px) and (not print) {
          .ef-term-notice-a4 .ef-document-head {
            grid-template-columns:52px minmax(0,1fr) 0;gap:8px;
          }
          .ef-term-notice-a4 .ef-document-logo,
          .ef-term-notice-a4 .ef-document-logo-fallback {
            width:49px;height:49px;
          }
          .ef-term-notice-a4 .ef-document-school {font-size:15px;}
          .ef-term-notice-a4 .ef-title-period {padding-left:7px;padding-right:7px;}
          .ef-term-notice-a4 .ef-doc-table th,
          .ef-term-notice-a4 .ef-doc-table td {padding:6px;font-size:10px;}
          .ef-term-notice-a4 .ef-doc-table .ef-material-qty {width:22%;}
        }
        @media print {
          @page {size:A4 portrait;margin:11mm;}
          .ef-term-notice-a4 {
            width:100%!important;min-width:0!important;min-height:0!important;
            padding:0!important;margin:0!important;border:0!important;
            box-shadow:none!important;page-break-after:always;break-after:page;
            print-color-adjust:exact;-webkit-print-color-adjust:exact;
          }
          .ef-term-notice-a4 .ef-title-periods,
          .ef-term-notice-a4 .ef-document-head,
          .ef-term-notice-a4 .ef-document-info,
          .ef-term-notice-a4 .ef-doc-note {break-inside:avoid-page;}
          .ef-term-notice-a4 .ef-doc-table thead {display:table-header-group;}
          .ef-term-notice-a4 .ef-doc-table tr {break-inside:avoid-page;}
          .ef-term-notice-a4 .ef-doc-section h3 {break-after:avoid-page;}
        }
      `}</style>

      <header className="ef-document-head">
        <div>
          {schoolLogo ? (
            <img className="ef-document-logo" src={schoolLogo} alt="School crest" />
          ) : (
            <div className="ef-document-logo-fallback">SCHOOL<br />CREST</div>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <h1 className="ef-document-school">{schoolName}</h1>
          {schoolMotto && <p className="ef-document-motto">{schoolMotto}</p>}
          {branchName && (
            <p className="ef-document-contact" style={{ fontWeight: 800 }}>
              {branchName}
            </p>
          )}
          {(schoolAddress || schoolPhone) && (
            <p className="ef-document-contact">
              {[schoolAddress, schoolPhone ? `Tel: ${schoolPhone}` : ""]
                .filter(Boolean)
                .join(" â€¢ ")}
            </p>
          )}
        </div>
        <div aria-hidden="true" />
      </header>

      <div className="ef-document-title">
        <h2>Next Term Fees &amp; Requirements</h2>
        <div className="ef-title-periods">
          <div className="ef-title-period current">
            <span className="ef-title-period-title">Current Term</span>
            <div className="ef-period-field">
              <small>Academic Structure</small>
              <strong>{currentStructure}</strong>
            </div>
            <div className="ef-period-field">
              <small>Academic Period</small>
              <strong>{currentPeriod}</strong>
            </div>
          </div>
          <div className="ef-title-period next">
            <span className="ef-title-period-title">Next Term</span>
            <div className="ef-period-field">
              <small>Academic Structure</small>
              <strong>{upcomingStructure}</strong>
            </div>
            <div className="ef-period-field">
              <small>Academic Period</small>
              <strong>{upcomingPeriod}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="ef-document-info">
        <div><small>Class</small><b>{className}</b></div>
        <div><small>Student</small><b>{studentName || "All Students"}</b></div>
        <div><small>Admission No.</small><b>{admissionNumber || "â€”"}</b></div>
      </div>

      {!hasUpcomingPeriod ? (
        <div className="ef-doc-status">
          The next academic period has not been configured in the school calendar.
          Next-term fees and requirements cannot be displayed yet.
        </div>
      ) : !showNextNotice ? (
        <div className="ef-doc-status">
          No next-term fee notice has been prepared for {upcomingPeriod}.
          Fees and requirements will appear after the school enters them.
        </div>
      ) : (
        <>
          <section className="ef-doc-section">
            <h3>A. Next Term Fees</h3>
            <table className="ef-doc-table" aria-label="Next term fees and amount payable">
              <thead>
                <tr>
                  <th>Fee Description</th>
                  <th className="ef-doc-number">Amount ({nextCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {hasNextFees ? (
                  nextFees.map((item, index) => (
                    <tr key={`${item.itemKey || item.name}-${index}`}>
                      <td>{item.name}</td>
                      <td className="ef-doc-number">
                        {moneyNext(nonNegativeAmount(item.amount))}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={2}>No next-term fees have been entered.</td></tr>
                )}
                <tr className="ef-doc-total">
                  <td>Next Term Fees</td>
                  <td className="ef-doc-number">
                    {hasNextFees ? moneyNext(nextFeeTotal) : "Not entered"}
                  </td>
                </tr>
                <tr className="ef-doc-arrears">
                  <td>Outstanding Balance from Current Term (Arrears)</td>
                  <td className="ef-doc-number">
                    {hasRecordedBalance ? moneyCurrent(currentArrears) : "Not provided"}
                  </td>
                </tr>
                {canShowCombinedTotal && (
                  <tr className="ef-doc-payable">
                    <td>Total Amount Payable</td>
                    <td className="ef-doc-number">
                      {moneyNext(nextFeeTotal + currentArrears)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!hasRecordedBalance && (
              <p className="ef-doc-muted">
                The student's current-term outstanding balance was not supplied.
                A combined amount payable cannot be calculated.
              </p>
            )}
            {hasRecordedBalance && !currenciesMatch && (
              <p className="ef-doc-muted">
                Current-term arrears are recorded in {currentCurrency}, while
                next-term fees are in {nextCurrency}. The amounts are shown
                separately and have not been added together.
              </p>
            )}
          </section>

          <section className="ef-doc-section">
            <h3>B. Next Term Books, Materials &amp; Supplies</h3>
            <table className="ef-doc-table" aria-label="Next term materials and supplies">
              <thead>
                <tr>
                  <th className="ef-material-item">Item</th>
                  <th className="ef-material-qty">Quantity</th>
                  <th className="ef-material-instructions">Instructions / Specification</th>
                </tr>
              </thead>
              <tbody>
                {nextRequirements.length ? (
                  nextRequirements.map((item, index) => (
                    <tr key={`${item.itemKey || item.name}-${index}`}>
                      <td>
                        {item.name}
                        {item.required === false && (
                          <small className="ef-doc-optional">Optional</small>
                        )}
                      </td>
                      <td>{formatQuantity(item)}</td>
                      <td>{item.instructions?.trim() || "â€”"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No next-term materials have been specified.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="ef-doc-muted">
              These are physical supplies, not additional monetary charges
              unless they are also listed under Next Term Fees.
            </p>
          </section>

          {(nextDueDate || nextNotice) && (
            <div className="ef-doc-note">
              <strong>School Instructions â€” Next Term</strong>
              {nextDueDate && <p>Payment / materials submission due date: {nextDueDate}</p>}
              {nextNotice && <p>{nextNotice}</p>}
            </div>
          )}
        </>
      )}

      <footer className="ef-doc-footer">
        <span>Issued by School Administration Â· {issuedOn}</span>
        <span>Keep this notice for your records</span>
      </footer>
    </article>
  );
}