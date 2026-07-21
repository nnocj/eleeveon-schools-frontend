"use client";

/**
 * reports/components/ReportExportTools.ts
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — ISOLATED A4 REPORT PRINT ENGINE
 * ---------------------------------------------------------
 *
 * This is intentionally a .ts utility, not a visible React component.
 *
 * Why this version uses an isolated print frame:
 * - StudentReports.tsx already owns the visible Print and More > Print buttons.
 * - We must not add extra print buttons to the UI.
 * - CSS-only print hiding can fail because the report sits inside app shell
 *   ancestors. If an ancestor such as .branch-admin-shell/.portal-shell is
 *   hidden with display:none, the selected report also disappears.
 * - The safest solution is to clone ONLY the report print zone into a temporary
 *   iframe and print that isolated document.
 *
 * Print rules:
 * - print ONLY the selected report target
 * - ignore current preview zoom completely
 * - force report templates to print at true A4 100%
 * - preserve report/template CSS by copying app styles into the print frame
 * - keep color printing, while remaining readable in black-and-white
 */

import type { ReportPrintMode } from "../engine/report-types";

// ======================================================
// TYPES
// ======================================================

export type ReportPrintOrientation = "portrait" | "landscape";

export type PrintReportTargetOptions = {
  targetId: string;
  mode?: ReportPrintMode;
  orientation?: ReportPrintOrientation;
  pageSize?: "A4";
  title?: string;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
};

// ======================================================
// HELPERS
// ======================================================

function resolveOrientation(
  mode: ReportPrintMode,
  orientation?: ReportPrintOrientation,
): ReportPrintOrientation {
  if (orientation) return orientation;

  return mode === "single-student" || mode === "whole-class-reports"
    ? "portrait"
    : "landscape";
}

function pageSizeFor(orientation: ReportPrintOrientation) {
  return orientation === "landscape"
    ? { width: "297mm", height: "210mm" }
    : { width: "210mm", height: "297mm" };
}

function removeOldReportPrintFrames() {
  if (typeof document === "undefined") return;

  document
    .querySelectorAll("iframe[data-eleeveon-report-print-frame='true']")
    .forEach((node) => node.remove());
}

/**
 * Copy currently loaded app styles into the iframe.
 * This keeps template styles, fonts and global CSS available inside the
 * isolated print document.
 */
function collectDocumentStyles() {
  if (typeof document === "undefined") return "";

  const parts: string[] = [];

  document
    .querySelectorAll<
      HTMLStyleElement | HTMLLinkElement
    >("style, link[rel='stylesheet']")
    .forEach((node) => {
      if (node.tagName.toLowerCase() === "style") {
        parts.push((node as HTMLStyleElement).outerHTML);
        return;
      }

      const link = node as HTMLLinkElement;
      if (link.href) {
        parts.push(`<link rel="stylesheet" href="${link.href}">`);
      }
    });

  return parts.join("\n");
}

/**
 * Preserve important CSS variables from the live app/report context.
 * The report templates use variables like --ba-primary / --primary-color,
 * and cloning only the report target can otherwise lose ancestor variables.
 */
function collectCssVariables(source: HTMLElement) {
  const variableNames = [
    "--ba-primary",
    "--primary-color",
    "--bg",
    "--surface",
    "--card-bg",
    "--text",
    "--muted",
    "--border",
    "--font-family",
    "--font-size",
    "--local-density-scale",
  ];

  const values = new Map<string, string>();

  const candidates: Element[] = [
    document.documentElement,
    document.body,
    ...Array.from(document.querySelectorAll(".student-reports-page, .ba-page")),
    source,
  ].filter(Boolean);

  for (const element of candidates) {
    const computed = window.getComputedStyle(element);

    for (const name of variableNames) {
      const value = computed.getPropertyValue(name).trim();
      if (value) values.set(name, value);
    }
  }

  return Array.from(values.entries())
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}

function buildPrintLockCss(options: {
  orientation: ReportPrintOrientation;
  pageSize: "A4";
}) {
  const { width, height } = pageSizeFor(options.orientation);

  return `
    @page {
      size: ${options.pageSize} ${options.orientation};
      margin: 0;
    }

    html,
    body {
      width: 100%;
      min-height: 100%;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      display: block !important;
      font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      color: var(--text, #111827);
    }

    #eleeveon-report-print-root {
      width: 100% !important;
      min-height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      overflow: visible !important;
    }

    /*
     * Hide preview controls only. We are not hiding the whole document because
     * this iframe already contains only the report target.
     */
    .report-no-print,
    .report-no-print *,
    .src-mobile-toolbar,
    .src-mobile-toolbar *,
    .src-zoom-controls,
    .src-zoom-controls *,
    .src-zoom-menu,
    .src-zoom-menu *,
    .ba-print-head,
    .ba-report-toolbar {
      display: none !important;
      visibility: hidden !important;
    }

    /*
     * Reset PDF preview wrappers. They exist for screen preview only.
     */
    .src-preview-shell,
    .src-preview-scroll,
    .src-preview-center,
    .src-preview-scale,
    .report-screen-scroll,
    .report-preview-shell,
    .report-preview-scroll,
    .report-preview-center,
    .report-preview-scale {
      display: block !important;
      position: static !important;
      width: auto !important;
      height: auto !important;
      min-width: 0 !important;
      min-height: 0 !important;
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
      transform-origin: top left !important;
      scale: 1 !important;
      zoom: 1 !important;
      opacity: 1 !important;
    }

    /*
     * Lock the actual selected report template page to real A4.
     * This ignores whether the preview was 20%, 30%, 100%, 200%, etc.
     */
    .student-report-card-page,
    .classic-formal-template-page,
    .classic-formal-template,
    .src-a4-page,
    .print-page,
    [data-report-page="true"] {
      display: block !important;
      position: relative !important;
      visibility: visible !important;
      width: ${width} !important;
      min-width: ${width} !important;
      max-width: ${width} !important;
      min-height: ${height} !important;
      margin: 0 auto !important;
      transform: none !important;
      transform-origin: top left !important;
      scale: 1 !important;
      zoom: 1 !important;
      box-shadow: none !important;
      overflow: hidden !important;
      background: #ffffff !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .report-page-break {
      page-break-after: always !important;
      break-after: page !important;
    }

    .report-page-break:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }

    table {
      width: 100% !important;
      border-collapse: collapse !important;
    }

    thead {
      display: table-header-group !important;
    }

    tfoot {
      display: table-footer-group !important;
    }

    tr,
    td,
    th {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    img {
      max-width: 100% !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }

    @media print {
      html,
      body,
      #eleeveon-report-print-root {
        background: #ffffff !important;
      }
    }
  `;
}

function removeLiteralBackslashNewlineTextNodes(root: Node) {
  const ownerDocument = root.ownerDocument || document;
  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const toRemove: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.nodeValue || "";

    /*
     * This removes accidental literal "\\n\\n\\n" text that can appear in
     * the iframe when stylesheet strings are joined incorrectly or copied from
     * serialized content.
     */
    if (/^(\\n|\s)+$/.test(value)) {
      toRemove.push(node);
    }
  }

  toRemove.forEach((node) => node.remove());
}

function getPrintableReportNodes(target: HTMLElement) {
  const selector = [
    ".student-report-card-page",
    ".classic-formal-template-page",
    ".src-a4-page",
    ".print-page",
    "[data-report-page='true']",
  ].join(", ");

  const pages = Array.from(
    target.querySelectorAll<HTMLElement>(selector),
  ).filter((page) => {
    const text = (page.textContent || "").replace(/\\n/g, "").trim();
    return text.length > 0 || page.querySelector("img, table, svg");
  });

  /*
   * Important:
   * Clone the real A4 report page(s), not the outer preview/print zone.
   * Cloning the outer zone can produce a blank first sheet because the
   * preview shell/scale wrappers reserve height before the real page.
   */
  if (pages.length) {
    return pages.map((page) => page.cloneNode(true) as HTMLElement);
  }

  const fallback = target.cloneNode(true) as HTMLElement;
  return [fallback];
}

function writePrintFrameDocument(args: {
  iframe: HTMLIFrameElement;
  title: string;
  target: HTMLElement;
  orientation: ReportPrintOrientation;
  pageSize: "A4";
}) {
  const doc =
    args.iframe.contentDocument || args.iframe.contentWindow?.document;
  if (!doc) throw new Error("Unable to open report print frame.");

  const cssVariables = collectCssVariables(args.target);
  const styles = collectDocumentStyles();
  const printCss = buildPrintLockCss({
    orientation: args.orientation,
    pageSize: args.pageSize,
  });

  const printableNodes = getPrintableReportNodes(args.target);

  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${args.title}</title>
  ${styles}
  <style data-eleeveon-report-print-lock="true">${printCss}</style>
</head>
<body style="${cssVariables}">
  <div id="eleeveon-report-print-root" style="${cssVariables}"></div>
</body>
</html>`);
  doc.close();

  const root = doc.getElementById("eleeveon-report-print-root");
  if (!root) throw new Error("Report print frame root was not created.");

  printableNodes.forEach((node, index) => {
    removeLiteralBackslashNewlineTextNodes(node);

    if (printableNodes.length > 1 && index < printableNodes.length - 1) {
      node.classList.add("report-page-break");
    }

    root.appendChild(node);
  });

  removeLiteralBackslashNewlineTextNodes(root);
}

async function waitForFrameAssets(iframe: HTMLIFrameElement) {
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;

  const imagePromises = Array.from(doc.images).map((img) => {
    if (img.complete) return Promise.resolve();

    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  });

  const fontReady = (doc as any).fonts?.ready
    ? (doc as any).fonts.ready.catch(() => undefined)
    : Promise.resolve();

  await Promise.race([
    Promise.all([...imagePromises, fontReady]),
    new Promise((resolve) => window.setTimeout(resolve, 900)),
  ]);
}

// ======================================================
// PUBLIC PRINT API
// ======================================================

export async function printReportTarget({
  targetId,
  mode = "single-student",
  orientation,
  pageSize = "A4",
  title,
  onBeforePrint,
  onAfterPrint,
}: PrintReportTargetOptions) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const target = document.getElementById(targetId);

  if (!target) {
    console.error(`[Eleeveon Reports] Print target not found: ${targetId}`);
    alert("Report print area was not found. Please refresh and try again.");
    return;
  }

  const hasReportPage =
    target.querySelector(
      ".student-report-card-page, .classic-formal-template-page, .src-a4-page, .print-page, [data-report-page='true']",
    ) || target.textContent?.trim();

  if (!hasReportPage) {
    console.error(`[Eleeveon Reports] Print target is empty: ${targetId}`);
    alert(
      "No report is available to print yet. Please select a report and try again.",
    );
    return;
  }

  onBeforePrint?.();

  removeOldReportPrintFrames();

  const resolvedOrientation = resolveOrientation(mode, orientation);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-eleeveon-report-print-frame", "true");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.zIndex = "-1";

  document.body.appendChild(iframe);

  try {
    writePrintFrameDocument({
      iframe,
      title: title || "Eleeveon Report",
      target,
      orientation: resolvedOrientation,
      pageSize,
    });

    await waitForFrameAssets(iframe);

    const printWindow = iframe.contentWindow;
    if (!printWindow) throw new Error("Report print window was not available.");

    printWindow.focus();

    /*
     * Printing from the iframe means the browser receives a document containing
     * only the report, not the app shell. This avoids blank previews caused by
     * hidden app-shell ancestors.
     */
    window.setTimeout(() => {
      printWindow.print();

      window.setTimeout(() => {
        iframe.remove();
        onAfterPrint?.();
      }, 1500);
    }, 80);
  } catch (error) {
    console.error("[Eleeveon Reports] Failed to print report:", error);
    iframe.remove();
    alert(
      "Unable to prepare the report for printing. Please refresh and try again.",
    );
  }
}

export default printReportTarget;
