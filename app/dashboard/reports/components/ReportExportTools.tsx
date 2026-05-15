"use client";

/**
 * reports/components/ReportExportTools.tsx
 * ---------------------------------------------------------
 * ENTERPRISE REPORT EXPORT / PRINT TOOLS
 * ---------------------------------------------------------
 *
 * Supports:
 * - Student report printing
 * - Whole class report printing
 * - Subject broadsheet printing
 * - Class broadsheet printing
 *
 * Optimized for:
 * - A4 professional school printing
 * - Ghana school reporting workflows
 * - Institutional export consistency
 */

import React from "react";

import type {
  ReportExportConfig,
  ReportPrintButton,
  ReportPrintMode,
} from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  targetId: string;
  primaryColor?: string;
  onBeforePrint?: () => void;
  extraButtons?: ReportPrintButton[];
};

// ======================================================
// DEFAULT BUTTONS
// ======================================================

const defaultButtons: ReportPrintButton[] = [
  {
    label: "Print Student Report",
    mode: "single-student",
    orientation: "portrait",
  },
  {
    label: "Print Whole Class Reports",
    mode: "whole-class-reports",
    orientation: "portrait",
  },
  {
    label: "Print Subject Broadsheet",
    mode: "subject-broadsheet",
    orientation: "landscape",
  },
  {
    label: "Print Class Broadsheet",
    mode: "class-broadsheet",
    orientation: "landscape",
  },
];

// ======================================================
// PRINT ENGINE
// ======================================================

function applyPrintStyles(config: ReportExportConfig) {
  const existing = document.getElementById("report-print-style");

  if (existing) {
    existing.remove();
  }

  const style = document.createElement("style");
  style.id = "report-print-style";

  style.innerHTML = `
    @page {
      size: ${config.pageSize} ${config.orientation};
      margin: 10mm;
    }

    @media print {
      body {
        background: #ffffff !important;
      }

      body * {
        visibility: hidden !important;
      }

      #${config.targetId},
      #${config.targetId} * {
        visibility: visible !important;
      }

      #${config.targetId} {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: #fff;
      }

      .report-no-print {
        display: none !important;
      }

      .report-page-break {
        page-break-after: always;
      }

      .report-page-break:last-child {
        page-break-after: auto;
      }

      table {
        width: 100% !important;
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

function executePrint(config: ReportExportConfig) {
  applyPrintStyles(config);

  setTimeout(() => {
    window.print();
  }, 200);
}

// ======================================================
// COMPONENT
// ======================================================

export default function ReportExportTools({
  targetId,
  primaryColor = "var(--primary-color)",
  onBeforePrint,
  extraButtons = [],
}: Props) {
  const buttons = [...defaultButtons, ...extraButtons];

  const handlePrint = (mode: ReportPrintMode) => {
    onBeforePrint?.();

    const orientation =
      mode === "single-student" ||
      mode === "whole-class-reports"
        ? "portrait"
        : "landscape";

    executePrint({
      title: mode,
      targetId,
      printMode: mode,
      orientation,
      pageSize: "A4",
    });
  };

  return (
    <div
      className="report-no-print"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
      }}
    >
      {buttons.map(button => (
        <button
          key={button.label}
          onClick={() => handlePrint(button.mode)}
          style={{
            padding: "12px 16px",
            borderRadius: 14,
            border: "none",
            background: primaryColor,
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
            transition: "0.2s ease",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = "translateY(0px)";
          }}
        >
          {button.label}
        </button>
      ))}

      <div
        style={{
          marginLeft: "auto",
          fontSize: 12,
          opacity: 0.7,
          fontWeight: 700,
        }}
      >
        Standardized A4 Institutional Printing
      </div>
    </div>
  );
}
