"use client";

/**
 * reports/components/ReportExportTools.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — ADVANCED REPORT EXPORT / PRINT TOOLS
 * ---------------------------------------------------------
 *
 * Supports:
 * - Student report printing
 * - Whole class report printing
 * - Subject broadsheet printing
 * - Class broadsheet printing
 *
 * Upgrade goals:
 * - print ONLY the report target, not the app shell, hamburger, sidebar or toolbar
 * - preserve A4 report-sheet output even when printing from mobile phones
 * - reset preview transforms during print
 * - support portrait and landscape printing
 * - keep color printing, but remain readable in black-and-white print
 * - avoid cutting rows/tables awkwardly across pages
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
  compact?: boolean;
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

function cssEscapeId(id: string) {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(id);
  }

  return id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function removeOldPrintStyles() {
  document
    .querySelectorAll("style[data-eleeveon-report-print='true']")
    .forEach((node) => node.remove());
}

function applyPrintStyles(config: ReportExportConfig) {
  removeOldPrintStyles();

  const targetSelector = `#${cssEscapeId(config.targetId)}`;
  const style = document.createElement("style");

  style.id = "report-print-style";
  style.setAttribute("data-eleeveon-report-print", "true");

  style.innerHTML = `
    @page {
      size: ${config.pageSize} ${config.orientation};
      margin: 0;
    }

    @media print {
      html,
      body {
        width: 100% !important;
        min-height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        overflow: visible !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      body {
        position: static !important;
      }

      body * {
        visibility: hidden !important;
      }

      ${targetSelector},
      ${targetSelector} * {
        visibility: visible !important;
      }

      ${targetSelector} {
        display: block !important;
        position: absolute !important;
        inset: 0 auto auto 0 !important;
        width: 100% !important;
        min-height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        overflow: visible !important;
        z-index: 2147483647 !important;
      }

      ${targetSelector} .src-preview-shell,
      ${targetSelector} .src-preview-scroll,
      ${targetSelector} .src-preview-scale,
      ${targetSelector} .report-screen-scroll {
        display: contents !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        overflow: visible !important;
        transform: none !important;
      }

      .report-no-print,
      .report-no-print *,
      ${targetSelector} .report-no-print,
      ${targetSelector} .report-no-print * {
        display: none !important;
        visibility: hidden !important;
      }

      ${targetSelector} .student-report-card-page,
      ${targetSelector} .src-a4-page,
      ${targetSelector} .print-page {
        display: block !important;
        position: relative !important;
        transform: none !important;
        margin: 0 auto !important;
        box-shadow: none !important;
        overflow: hidden !important;
        background: #ffffff !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      ${targetSelector} .report-page-break {
        page-break-after: always !important;
        break-after: page !important;
      }

      ${targetSelector} .report-page-break:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }

      ${targetSelector} table {
        width: 100% !important;
        border-collapse: collapse !important;
      }

      ${targetSelector} thead {
        display: table-header-group !important;
      }

      ${targetSelector} tfoot {
        display: table-footer-group !important;
      }

      ${targetSelector} tr,
      ${targetSelector} td,
      ${targetSelector} th {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      ${targetSelector} img {
        max-width: 100% !important;
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }

      nav,
      aside,
      body > header,
      body > footer,
      [role="navigation"],
      [data-sidebar],
      [data-header],
      [data-navbar],
      [data-topbar],
      [data-mobile-nav],
      [data-hamburger],
      .sidebar,
      .side-nav,
      .topbar,
      .navbar,
      .hamburger,
      .mobile-menu,
      .app-shell,
      .portal-shell,
      .role-shell,
      .dashboard-shell,
      .ba-shell,
      .branch-admin-shell {
        display: none !important;
        visibility: hidden !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function executePrint(config: ReportExportConfig) {
  const target = document.getElementById(config.targetId);

  if (!target) {
    console.error(`[Eleeveon Reports] Print target not found: ${config.targetId}`);
    alert("Report print area was not found. Please refresh and try again.");
    return;
  }

  applyPrintStyles(config);

  window.setTimeout(() => {
    window.print();

    window.setTimeout(() => {
      removeOldPrintStyles();
    }, 800);
  }, 150);
}

// ======================================================
// COMPONENT
// ======================================================

export default function ReportExportTools({
  targetId,
  primaryColor = "var(--primary-color)",
  onBeforePrint,
  extraButtons = [],
  compact = false,
}: Props) {
  const buttons = [...defaultButtons, ...extraButtons];

  const handlePrint = (button: ReportPrintButton) => {
    onBeforePrint?.();

    const orientation =
      button.orientation ||
      (
        button.mode === "single-student" ||
        button.mode === "whole-class-reports"
          ? "portrait"
          : "landscape"
      );

    executePrint({
      title: button.label || button.mode,
      targetId,
      printMode: button.mode,
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
        gap: compact ? 7 : 10,
        alignItems: "center",
        padding: compact ? "6px 0" : "8px 0",
      }}
    >
      {buttons.map(button => (
        <button
          key={`${button.mode}-${button.label}`}
          type="button"
          onClick={() => handlePrint(button)}
          style={{
            minHeight: compact ? 34 : 40,
            padding: compact ? "8px 11px" : "10px 14px",
            borderRadius: compact ? 12 : 14,
            border: "1px solid rgba(255,255,255,.22)",
            background: primaryColor,
            color: "#fff",
            fontWeight: 850,
            fontSize: compact ? 11.5 : 12.5,
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
            transition: "0.2s ease",
            whiteSpace: "nowrap",
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
          fontSize: compact ? 10.5 : 11.5,
          opacity: 0.7,
          fontWeight: 750,
          minWidth: 150,
          textAlign: "right",
        }}
      >
        A4 report-only printing
      </div>
    </div>
  );
}
