"use client";

/**
 * reports/components/BroadsheetCard.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — BROADSHEET TEMPLATE ROUTER / VIEWER
 * ---------------------------------------------------------
 *
 * Responsibilities:
 * - resolve the selected broadsheet template from the shared registry
 * - fall back safely when a visual template has not been registered yet
 * - provide a fixed A4 landscape preview like a PDF viewer
 * - support fit-to-screen, manual zoom and zoom presets
 * - keep app controls out of print output
 * - provide a clear empty state when no broadsheet dataset exists
 *
 * The router does not calculate broadsheet results. It only passes the
 * already-computed engine dataset to the selected visual template.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  computeBroadsheetSummary,
  defaultBroadsheetEmptyMessage,
  firstText,
  getBroadsheetTemplateDefinition,
  getBroadsheetTemplateComponent,
  resolveBroadsheetBranding,
  resolveBroadsheetTemplateSettings,
} from "../broadsheet-templates";

import type {
  BroadsheetDatasetFor,
  BroadsheetKind,
  BroadsheetTemplateDefinition,
  BroadsheetTemplateRecord,
  BroadsheetTemplateSettings,
} from "../broadsheet-templates";

// ======================================================
// TYPES
// ======================================================

export type BroadsheetCardProps<K extends BroadsheetKind = BroadsheetKind> = {
  kind: K;
  dataset?: BroadsheetDatasetFor<K> | null;
  header?: any;
  template?: BroadsheetTemplateRecord | BroadsheetTemplateDefinition | null;
  settings?: BroadsheetTemplateSettings | null;

  compact?: boolean;
  showWatermark?: boolean;
  pageBreakAfter?: boolean;
  mobilePreview?: boolean;
  generatedAt?: string | number | Date;
  pageNumber?: number;
  totalPages?: number;

  className?: string;
  emptyMessage?: string;
};

// ======================================================
// CONSTANTS
// ======================================================

const A4_LANDSCAPE_WIDTH_PX = 1122.5197;
const A4_LANDSCAPE_HEIGHT_PX = 793.7008;
const SAFE_GAP = 8;
const ZOOM_STEP = 1.01;
const ZOOM_PRESETS = [30, 40, 50, 60, 70, 80, 90, 100, 125, 150];

// ======================================================
// SMALL HELPERS
// ======================================================

function templateCodeOf(template?: any, settings?: any) {
  return firstText(
    template?.code,
    template?.templateCode,
    template?.layoutKey,
    template?.templateKey,
    settings?.templateCode,
    settings?.layoutKey,
    "broadsheet_classic",
  );
}

function kindLabel(kind: BroadsheetKind) {
  if (kind === "class") return "Class Broadsheet";
  if (kind === "annual") return "Annual Broadsheet";
  return "Subject Broadsheet";
}

function hasDatasetRows(kind: BroadsheetKind, dataset: any) {
  if (!dataset) return false;
  if (kind === "subject")
    return Array.isArray(dataset.students) && dataset.students.length > 0;
  if (kind === "class")
    return Array.isArray(dataset.students) && dataset.students.length > 0;
  if (kind === "annual")
    return Array.isArray(dataset.students) && dataset.students.length > 0;
  return false;
}

// ======================================================
// COMPONENT
// ======================================================

export default function BroadsheetCard<K extends BroadsheetKind>({
  kind,
  dataset,
  header,
  template,
  settings,
  compact = false,
  showWatermark = true,
  pageBreakAfter = true,
  mobilePreview = true,
  generatedAt,
  pageNumber,
  totalPages,
  className,
  emptyMessage,
}: BroadsheetCardProps<K>) {
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  const previewScale = expanded ? zoomScale : fitScale;
  const displayZoomPercent = Math.round(previewScale * 100);

  const resolvedSettings = useMemo(
    () => resolveBroadsheetTemplateSettings({ kind, template, settings }),
    [kind, template, settings],
  );

  const selectedCode = templateCodeOf(template, resolvedSettings);
  const definition = useMemo(
    () => getBroadsheetTemplateDefinition(selectedCode),
    [selectedCode],
  );

  const SelectedTemplate = useMemo(
    () => getBroadsheetTemplateComponent(selectedCode),
    [selectedCode],
  );

  const branding = useMemo(() => resolveBroadsheetBranding(header), [header]);

  const summary = useMemo(
    () => computeBroadsheetSummary(kind, dataset as any),
    [kind, dataset],
  );

  const hasRows = hasDatasetRows(kind, dataset);

  const stopZoomHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (holdIntervalRef.current != null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const applyZoomStep = useCallback(
    (direction: "in" | "out") => {
      setZoomScale((previous) => {
        const base = expanded ? previous : fitScale;
        const next = direction === "in" ? base * ZOOM_STEP : base / ZOOM_STEP;
        return Math.min(2.5, Math.max(0.2, Number(next.toFixed(4))));
      });
      setExpanded(true);
    },
    [expanded, fitScale],
  );

  const startZoomHold = useCallback(
    (direction: "in" | "out") => {
      stopZoomHold();
      applyZoomStep(direction);

      holdTimerRef.current = window.setTimeout(() => {
        holdIntervalRef.current = window.setInterval(() => {
          applyZoomStep(direction);
        }, 55);
      }, 260);
    },
    [applyZoomStep, stopZoomHold],
  );

  const fitToScreen = useCallback(() => {
    stopZoomHold();
    setExpanded(false);
    setZoomScale(1);
    setZoomMenuOpen(false);
  }, [stopZoomHold]);

  const actualSize = useCallback(() => {
    stopZoomHold();
    setExpanded(true);
    setZoomScale(1);
    setZoomMenuOpen(false);
  }, [stopZoomHold]);

  const selectZoomPercent = useCallback(
    (percent: number) => {
      stopZoomHold();
      setExpanded(true);
      setZoomScale(Number((percent / 100).toFixed(4)));
      setZoomMenuOpen(false);
    },
    [stopZoomHold],
  );

  useEffect(() => {
    if (!mobilePreview) return;

    const updateScale = () => {
      const frame = previewFrameRef.current;
      if (!frame) return;

      const rect = frame.getBoundingClientRect();
      const availableWidth = Math.max(160, rect.width - SAFE_GAP);
      const availableHeight = Math.max(
        180,
        window.innerHeight - rect.top - SAFE_GAP,
      );

      const widthScale = availableWidth / A4_LANDSCAPE_WIDTH_PX;
      const heightScale = availableHeight / A4_LANDSCAPE_HEIGHT_PX;
      const nextScale = Math.min(1, widthScale, heightScale);

      setFitScale(Number(nextScale.toFixed(4)));
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    if (previewFrameRef.current) observer.observe(previewFrameRef.current);

    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
    };
  }, [mobilePreview]);

  useEffect(() => {
    return () => stopZoomHold();
  }, [stopZoomHold]);

  const templatePage = !hasRows ? (
    <BroadsheetEmptyPage
      kind={kind}
      header={header}
      settings={resolvedSettings}
      message={emptyMessage || defaultBroadsheetEmptyMessage(kind)}
      pageBreakAfter={pageBreakAfter}
      compact={compact}
    />
  ) : SelectedTemplate ? (
    <SelectedTemplate
      kind={kind}
      dataset={dataset}
      header={header}
      template={template || definition}
      settings={resolvedSettings}
      compact={compact}
      showWatermark={showWatermark}
      pageBreakAfter={pageBreakAfter}
      generatedAt={generatedAt}
      pageNumber={pageNumber}
      totalPages={totalPages}
      className={className}
    />
  ) : (
    <BroadsheetFallbackPage
      kind={kind}
      header={header}
      templateDefinition={definition}
      settings={resolvedSettings}
      summary={summary}
      pageBreakAfter={pageBreakAfter}
      compact={compact}
    />
  );

  if (!mobilePreview) return templatePage;

  return (
    <div className={`bs-viewer-shell ${expanded ? "expanded" : ""}`}>
      <style>{css}</style>

      <div className="bs-viewer-toolbar report-no-print">
        <div className="bs-viewer-toolbar-copy">
          <strong>
            {resolvedSettings.broadsheetTitleLabel || kindLabel(kind)}
          </strong>
          <span>
            {branding.schoolName}
            {branding.branchName ? ` · ${branding.branchName}` : ""}
            {SelectedTemplate
              ? ` · ${definition.name}`
              : ` · ${definition.name} fallback`}
          </span>
        </div>

        <div
          className="bs-viewer-controls"
          aria-label="Broadsheet zoom controls"
        >
          <button
            type="button"
            className="bs-viewer-icon-button"
            onClick={() => applyZoomStep("out")}
            onPointerDown={() => startZoomHold("out")}
            onPointerUp={stopZoomHold}
            onPointerCancel={stopZoomHold}
            onPointerLeave={stopZoomHold}
            aria-label="Zoom out"
            title="Click or hold to zoom out"
          >
            −
          </button>

          <button
            type="button"
            className="bs-viewer-fit-button"
            onClick={fitToScreen}
            aria-label="Fit broadsheet to screen"
            title="Fit to screen"
          >
            Fit
          </button>

          <div className="bs-viewer-menu-wrap">
            <button
              type="button"
              className="bs-viewer-percent-button"
              onClick={() => setZoomMenuOpen((current) => !current)}
              aria-label="Choose zoom percentage"
              aria-expanded={zoomMenuOpen}
            >
              <span>{displayZoomPercent}%</span>
              <span className="bs-viewer-caret">▾</span>
            </button>

            {zoomMenuOpen && (
              <div className="bs-viewer-menu" role="menu">
                <button
                  type="button"
                  className="bs-viewer-menu-item"
                  onClick={actualSize}
                  role="menuitem"
                >
                  Actual size
                </button>

                {ZOOM_PRESETS.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    className={`bs-viewer-menu-item ${displayZoomPercent === percent ? "active" : ""}`}
                    onClick={() => selectZoomPercent(percent)}
                    role="menuitem"
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="bs-viewer-icon-button"
            onClick={() => applyZoomStep("in")}
            onPointerDown={() => startZoomHold("in")}
            onPointerUp={stopZoomHold}
            onPointerCancel={stopZoomHold}
            onPointerLeave={stopZoomHold}
            aria-label="Zoom in"
            title="Click or hold to zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={previewFrameRef}
        className="bs-viewer-scroll report-screen-scroll"
        style={
          { "--broadsheet-preview-scale": previewScale } as React.CSSProperties
        }
      >
        <div className="bs-viewer-center">
          <div className="bs-viewer-scale">{templatePage}</div>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// FALLBACK / EMPTY PAGES
// ======================================================

function BroadsheetEmptyPage({
  kind,
  header,
  settings,
  message,
  pageBreakAfter,
  compact,
}: {
  kind: BroadsheetKind;
  header?: any;
  settings: any;
  message: string;
  pageBreakAfter: boolean;
  compact: boolean;
}) {
  const branding = resolveBroadsheetBranding(header);

  return (
    <section
      className="print-page report-page-break bs-router-page bs-empty-page"
      style={{
        width: "297mm",
        minHeight: "210mm",
        margin: "0 auto 18px",
        padding: compact ? "8mm" : "10mm",
        boxSizing: "border-box",
        background: "#fff",
        color: "#111827",
        fontFamily: branding.fontFamily,
        border: "1px solid #d1d5db",
        pageBreakAfter: pageBreakAfter ? "always" : "auto",
        breakAfter: pageBreakAfter ? "page" : "auto",
      }}
    >
      <FallbackHeader
        title={settings.broadsheetTitleLabel || kindLabel(kind)}
        branding={branding}
      />

      <div className="bs-empty-card">
        <div className="bs-empty-icon">▦</div>
        <h3>No broadsheet data</h3>
        <p>{message}</p>
      </div>
    </section>
  );
}

function BroadsheetFallbackPage({
  kind,
  header,
  templateDefinition,
  settings,
  summary,
  pageBreakAfter,
  compact,
}: {
  kind: BroadsheetKind;
  header?: any;
  templateDefinition: BroadsheetTemplateDefinition;
  settings: any;
  summary: ReturnType<typeof computeBroadsheetSummary>;
  pageBreakAfter: boolean;
  compact: boolean;
}) {
  const branding = resolveBroadsheetBranding(header);

  return (
    <section
      className="print-page report-page-break bs-router-page bs-fallback-page"
      style={{
        width: "297mm",
        minHeight: "210mm",
        margin: "0 auto 18px",
        padding: compact ? "8mm" : "10mm",
        boxSizing: "border-box",
        background: "#fff",
        color: "#111827",
        fontFamily: branding.fontFamily,
        border: "1px solid #d1d5db",
        pageBreakAfter: pageBreakAfter ? "always" : "auto",
        breakAfter: pageBreakAfter ? "page" : "auto",
      }}
    >
      <FallbackHeader
        title={settings.broadsheetTitleLabel || kindLabel(kind)}
        branding={branding}
      />

      {summary.length > 0 && (
        <div className="bs-fallback-summary">
          {summary.map((item) => (
            <div key={item.key} className="bs-fallback-stat">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="bs-fallback-notice">
        <strong>{templateDefinition.name}</strong>
        <span>
          The dataset is ready, but this visual template has not been registered
          yet. The router has safely fallen back instead of failing. Register
          the Classic template in Phase 4 and it will render here automatically.
        </span>
      </div>
    </section>
  );
}

function FallbackHeader({
  title,
  branding,
}: {
  title: string;
  branding: ReturnType<typeof resolveBroadsheetBranding>;
}) {
  return (
    <header className="bs-fallback-header">
      <div className="bs-fallback-logo">
        {branding.logo ? (
          <img src={branding.logo} alt="School logo" />
        ) : (
          <span>LOGO</span>
        )}
      </div>

      <div className="bs-fallback-identity">
        <strong>{branding.schoolName}</strong>
        <span>
          {[branding.branchName, branding.address, branding.phone]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div
        className="bs-fallback-title"
        style={{
          borderColor: branding.primaryColor,
          color: branding.primaryColor,
        }}
      >
        {title}
      </div>
    </header>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
.bs-viewer-shell {
  --a4-landscape-width-px: 1122.5197;
  --a4-landscape-height-px: 793.7008;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  border-radius: 22px;
}

.bs-viewer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 8px;
  padding: 10px;
  border-radius: 18px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148,163,184,.24);
  box-shadow: 0 10px 24px rgba(15,23,42,.06);
}

.bs-viewer-toolbar-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.bs-viewer-toolbar-copy strong,
.bs-viewer-toolbar-copy span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bs-viewer-toolbar-copy strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 950;
}

.bs-viewer-toolbar-copy span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.bs-viewer-controls {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 10%, transparent);
  border: 1px solid rgba(148,163,184,.18);
}

.bs-viewer-controls button {
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}

.bs-viewer-icon-button,
.bs-viewer-fit-button,
.bs-viewer-percent-button {
  height: 32px;
  min-height: 32px;
  border-radius: 999px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-weight: 950;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(15,23,42,.12);
}

.bs-viewer-icon-button {
  width: 32px;
  min-width: 32px;
  padding: 0;
  font-size: 18px;
}

.bs-viewer-fit-button {
  min-width: 42px;
  padding: 0 12px;
  font-size: 12px;
}

.bs-viewer-menu-wrap {
  position: relative;
  display: inline-flex;
}

.bs-viewer-percent-button {
  min-width: 72px;
  padding: 0 10px;
  gap: 5px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.bs-viewer-caret {
  font-size: 9px;
  opacity: .9;
}

.bs-viewer-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 80;
  width: 128px;
  max-height: 280px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
  padding: 7px;
  border-radius: 16px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148,163,184,.34);
  box-shadow: 0 20px 46px rgba(15,23,42,.20);
}

.bs-viewer-menu-item {
  width: 100%;
  min-height: 32px;
  padding: 0 9px;
  border-radius: 10px;
  background: transparent;
  color: var(--text, #0f172a);
  font-size: 11px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bs-viewer-menu-item:hover {
  background: color-mix(in srgb, var(--primary-color, #2563eb) 10%, transparent);
}

.bs-viewer-menu-item.active {
  background: var(--primary-color, #2563eb);
  color: #fff;
}

.bs-viewer-scroll {
  --broadsheet-preview-scale: 1;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  -webkit-overflow-scrolling: touch;
  padding: 4px;
  border-radius: 20px;
  background: rgba(148,163,184,.10);
  border: 1px solid rgba(148,163,184,.18);
  box-sizing: border-box;
}

.bs-viewer-center {
  width: 100%;
  height: calc(210mm * var(--broadsheet-preview-scale));
  min-height: calc(210mm * var(--broadsheet-preview-scale));
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}

.bs-viewer-scale {
  width: 297mm;
  height: 210mm;
  min-width: 297mm;
  min-height: 210mm;
  transform: scale(var(--broadsheet-preview-scale));
  transform-origin: top center;
  flex: 0 0 auto;
}

.bs-viewer-shell:not(.expanded) .bs-viewer-scroll {
  overflow: hidden;
}

.bs-viewer-shell.expanded .bs-viewer-scroll {
  overflow: auto;
}

.bs-viewer-shell.expanded .bs-viewer-center {
  width: max(100%, calc(297mm * var(--broadsheet-preview-scale)));
  height: calc(210mm * var(--broadsheet-preview-scale));
  min-height: calc(210mm * var(--broadsheet-preview-scale));
  overflow: visible;
}

.bs-router-page {
  width: 297mm !important;
  min-width: 297mm !important;
  max-width: 297mm !important;
  min-height: 210mm !important;
}

.bs-fallback-header {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding-bottom: 9px;
  border-bottom: 2px solid #111827;
}

.bs-fallback-logo {
  width: 50px;
  height: 50px;
  border: 1px solid #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #fff;
}

.bs-fallback-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 4px;
  box-sizing: border-box;
}

.bs-fallback-logo span {
  font-size: 7px;
  font-weight: 900;
  color: #6b7280;
}

.bs-fallback-identity {
  min-width: 0;
}

.bs-fallback-identity strong,
.bs-fallback-identity span {
  display: block;
}

.bs-fallback-identity strong {
  font-size: 17px;
  font-weight: 950;
  text-transform: uppercase;
}

.bs-fallback-identity span {
  margin-top: 3px;
  font-size: 8px;
  color: #4b5563;
  font-weight: 700;
}

.bs-fallback-title {
  border: 1px solid currentColor;
  padding: 7px 11px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .3px;
}

.bs-fallback-summary {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 7px;
}

.bs-fallback-stat {
  border: 1px solid #d1d5db;
  padding: 8px;
  background: #f8fafc;
}

.bs-fallback-stat span,
.bs-fallback-stat strong {
  display: block;
}

.bs-fallback-stat span {
  font-size: 7px;
  font-weight: 900;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .25px;
}

.bs-fallback-stat strong {
  margin-top: 3px;
  font-size: 13px;
  font-weight: 950;
}

.bs-fallback-notice,
.bs-empty-card {
  margin: 28px auto 0;
  max-width: 620px;
  border: 1px dashed #94a3b8;
  background: #f8fafc;
  padding: 20px;
  text-align: center;
}

.bs-fallback-notice strong,
.bs-fallback-notice span {
  display: block;
}

.bs-fallback-notice strong {
  font-size: 14px;
  font-weight: 950;
}

.bs-fallback-notice span,
.bs-empty-card p {
  margin-top: 7px;
  font-size: 10px;
  line-height: 1.5;
  color: #475569;
  font-weight: 650;
}

.bs-empty-card {
  margin-top: 42px;
}

.bs-empty-icon {
  font-size: 28px;
  line-height: 1;
}

.bs-empty-card h3 {
  margin: 10px 0 0;
  font-size: 15px;
  font-weight: 950;
}

.bs-empty-card p {
  margin-bottom: 0;
}

@media screen and (max-width: 560px) {
  .bs-viewer-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .bs-viewer-controls {
    width: 100%;
    justify-content: center;
  }
}

@media print {
  @page {
    size: A4 landscape;
    margin: 0;
  }

  .bs-viewer-shell,
  .bs-viewer-scroll,
  .bs-viewer-center,
  .bs-viewer-scale {
    display: contents !important;
    transform: none !important;
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .bs-viewer-toolbar,
  .report-no-print {
    display: none !important;
    visibility: hidden !important;
  }

  .bs-router-page,
  .broadsheet-template-page,
  .broadsheet-page {
    width: 297mm !important;
    min-width: 297mm !important;
    max-width: 297mm !important;
    min-height: 210mm !important;
    margin: 0 auto !important;
    transform: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }

  table,
  tr,
  td,
  th {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
`;
