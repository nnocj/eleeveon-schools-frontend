"use client";

/**
 * Branch Admin report viewing surface.
 *
 * - A4 portrait at 794 CSS pixels; landscape at 1122 CSS pixels (96 dpi).
 * - Responsive defaults: 100% A4 on laptops/desktops, Fit width on phones/tablets.
 * - A manual zoom choice overrides the responsive default until unmount.
 * - Horizontal panning stays in the A4 preview; V19 .app-content owns vertical scrolling.
 * - No independent vertical scroll viewport or fixed preview max-height.
 * - A single control in the Reports subtab row manages every preview.
 * - The report print zone stays unscaled in the source DOM for existing export tools.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ZoomChoice = "fit" | number;
type ZoomContextValue = {
  zoom: ZoomChoice;
  setZoom: (next: ZoomChoice) => void;
  effective: number;
  setEffective: (value: number) => void;
};

const ZoomContext = createContext<ZoomContextValue | null>(null);

const clampZoom = (value: number) => Math.max(0.25, Math.min(2, value));

export function BranchReportZoomProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep the responsive default separate from the user's explicit choice.
  // When the user has not selected a zoom, narrower screens use Fit width;
  // laptop/desktop workspaces remain at the natural A4 100% size.
  const [userZoom, setUserZoom] = useState<ZoomChoice | null>(null);
  const [compactScreen, setCompactScreen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 979px)");
    const syncScreenSize = () => setCompactScreen(media.matches);
    syncScreenSize();
    // Older mobile browsers expose addListener/removeListener instead.
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncScreenSize);
      return () => media.removeEventListener("change", syncScreenSize);
    }
    media.addListener(syncScreenSize);
    return () => media.removeListener(syncScreenSize);
  }, []);

  const zoom: ZoomChoice = userZoom ?? (compactScreen ? "fit" : 1);
  const setZoom = useCallback((next: ZoomChoice) => setUserZoom(next), []);
  const [effective, setEffectiveState] = useState(1);
  const setEffective = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setEffectiveState((current) =>
      Math.abs(current - value) < 0.003 ? current : value,
    );
  }, []);
  const value = useMemo(
    () => ({ zoom, setZoom, effective, setEffective }),
    [zoom, effective, setEffective],
  );
  return <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>;
}

/** One control for the entire Reports workspace, not a control per card. */
export function BranchReportZoomControls() {
  const zoomContext = useContext(ZoomContext);
  if (!zoomContext) return null;
  const { zoom, setZoom, effective } = zoomContext;
  const choices = [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200];
  const selectedValue = typeof zoom === "number" ? String(Math.round(zoom * 100)) : zoom;
  const hasCustom = typeof zoom === "number" && !choices.includes(Math.round(zoom * 100));
  const nudge = (direction: number) => {
    // Round to the nearest ten for predictable +/- steps after Auto/Fit.
    const current = Math.round(effective * 100);
    const next = direction > 0
      ? Math.floor(current / 10) * 10 + 10
      : Math.ceil(current / 10) * 10 - 10;
    setZoom(clampZoom(next / 100));
  };
  return (
    <div className="ba-global-report-zoom report-no-print" role="group" aria-label="Zoom all report previews">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => nudge(-1)}>−</button>
      <select
        aria-label="Report preview zoom"
        title="Set zoom for all report cards and broadsheets"
        value={selectedValue}
        onChange={(event) => {
          const next = event.target.value;
          setZoom(next === "fit" ? "fit" : clampZoom(Number(next) / 100));
        }}
      >
        <option value="fit">Fit width</option>
        {hasCustom && <option value={selectedValue}>{Math.round(Number(zoom) * 100)}%</option>}
        {choices.map((percent) => <option key={percent} value={String(percent)}>{percent}%</option>)}
      </select>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => nudge(1)}>+</button>
    </div>
  );
}

type Props = {
  printZoneId: string;
  naturalWidth?: number;
  children: React.ReactNode;
};

export default function BranchReportPreview({
  printZoneId,
  naturalWidth = 794,
  children,
}: Props) {
  const zoomContext = useContext(ZoomContext);
  const requestedZoom = zoomContext?.zoom ?? 1;
  const publishEffective = zoomContext?.setEffective;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, width: naturalWidth, height: 1123 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let frame = 0;
    const calculate = () => {
      const printZone = content.querySelector<HTMLElement>(`#${printZoneId}`);
      const pageWidth = Math.max(naturalWidth, content.scrollWidth, printZone?.scrollWidth || 0);
      const pageHeight = Math.max(1, content.scrollHeight, printZone?.scrollHeight || 0);
      // CSS px is the same 96-dpi unit used by the report templates.
      // 100% always means natural A4 size. Fit width is the responsive default
      // on phone/tablet viewports; the user may still choose 100% to pan around.
      const viewportWidth = Math.max(1, viewport.clientWidth - 1);
      const fit = Math.min(2, viewportWidth / pageWidth);
      const scale = typeof requestedZoom === "number"
        ? clampZoom(requestedZoom)
        : fit; // responsive default for narrow workspaces; selectable on any device
      const nextWidth = Math.max(1, Math.ceil(pageWidth * scale));
      const nextHeight = Math.max(1, Math.ceil(pageHeight * scale));
      setLayout((prev) =>
        Math.abs(prev.scale - scale) < 0.002 &&
        Math.abs(prev.width - nextWidth) < 2 &&
        Math.abs(prev.height - nextHeight) < 2
          ? prev
          : { scale, width: nextWidth, height: nextHeight },
      );
      publishEffective?.(scale);
    };
    const requestMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(calculate);
    };
    calculate();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(requestMeasure) : null;
    observer?.observe(viewport);
    observer?.observe(content);
    window.addEventListener("resize", requestMeasure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", requestMeasure);
    };
  }, [naturalWidth, printZoneId, requestedZoom, publishEffective]);

  return (
    <div className="ba-fit-viewport" ref={viewportRef} aria-label="Report preview — scroll the workspace vertically, or pan this document horizontally" tabIndex={0}>
      <style>{`
        .ba-fit-viewport {
          position:relative; width:100%; max-width:100%; min-width:0;
          /* V20: let the shared V19 .app-content pane handle ALL vertical
             document/batch scrolling. This preview only owns sideways panning.
             Without a height cap, its full natural height contributes to the
             parent scroller. overflow-y:visible computes as auto alongside
             overflow-x:auto, but has no independent scroll range. */
          max-height:none; height:auto; min-height:0;
          overflow-x:auto; overflow-y:visible;
          overscroll-behavior-x:contain;
          overscroll-behavior-y:auto;
          -webkit-overflow-scrolling:touch;
          scrollbar-width:auto;
          scrollbar-color:var(--ba-primary,var(--primary-color,#2563eb)) var(--surface-secondary,rgba(100,116,139,.17));
          border-radius:6px;
        }
        /* Distinct, branch-coloured scrollbars for long report batches. */
        .ba-fit-viewport::-webkit-scrollbar { width:13px; height:13px; }
        .ba-fit-viewport::-webkit-scrollbar-track {
          background:var(--surface-secondary,rgba(100,116,139,.16)); border-radius:10px;
        }
        .ba-fit-viewport::-webkit-scrollbar-thumb {
          background:var(--ba-primary,var(--primary-color,#2563eb));
          border:2px solid var(--surface-secondary,#e2e8f0); border-radius:10px;
        }
        .ba-fit-viewport::-webkit-scrollbar-thumb:hover {
          background:var(--ba-primary,var(--primary-color,#1d4ed8));
        }
        .ba-fit-viewport::-webkit-scrollbar-corner {
          background:var(--surface-secondary,rgba(100,116,139,.16));
        }
        .ba-fit-stage { position:relative; margin-inline:auto; box-sizing:border-box; }
        /* Lock the actual print-paper geometry on narrow phones.
           Never let the mobile viewport turn A4 into a reflowed card. */
        @media screen {
          .ba-fit-content[data-a4-paper="portrait"] :is(.src-a4-page,.student-report-card-page,.classic-formal-template-page,.print-page) {
            width:210mm!important; min-width:210mm!important; max-width:210mm!important;
            min-height:297mm!important; box-sizing:border-box!important; flex-shrink:0!important;
          }
          .ba-fit-content[data-a4-paper="landscape"] :is(.bs-router-page,.print-page) {
            width:297mm!important; min-width:297mm!important; max-width:297mm!important;
            min-height:210mm!important; box-sizing:border-box!important; flex-shrink:0!important;
          }
        }
        .ba-fit-viewport { touch-action:pan-x pan-y; }
        .ba-fit-content { position:absolute; top:0; left:0; transform-origin:top left; box-sizing:border-box; }
        .ba-fit-content > .ba-print-zone { box-sizing:border-box; width:100%; padding:0!important; overflow:visible!important; }
        .ba-fit-viewport:focus-visible { outline:2px solid var(--primary-color,#2563eb); outline-offset:-2px; }
        /* Mobile shares the exact same page-height behavior as desktop.
           The existing responsive Fit width zoom still applies below 980px. */
        @media print {
          .ba-fit-viewport { max-height:none!important; width:auto!important; height:auto!important; overflow:visible!important; }
          .ba-fit-stage { width:auto!important; height:auto!important; margin:0!important; }
          .ba-fit-content { position:static!important; width:auto!important; transform:none!important; }
        }
      `}</style>
      <div className="ba-fit-stage" style={{ width: layout.width, height: layout.height }}>
        <div
          className="ba-fit-content"
          data-a4-paper={naturalWidth >= 1000 ? "landscape" : "portrait"}
          ref={contentRef}
          style={{ width: naturalWidth, transform: `scale(${layout.scale})` }}
        >
          <div id={printZoneId} className="ba-print-zone">{children}</div>
        </div>
      </div>
    </div>
  );
}
