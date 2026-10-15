"use client";

/**
 * Branch Admin report viewing surface.
 *
 * - A4 portrait at 794 CSS pixels; landscape at 1122 CSS pixels (96 dpi).
 * - Default: 100% A4 on laptop AND phone, with horizontal scrolling.
 * - Each preview can scroll horizontally AND vertically after zooming.
 * - A single control in the Reports subtab row manages every preview.
 * - The report print zone stays unscaled in the source DOM for existing export tools.
 */
import React, {
  createContext,
  useCallback,
  useContext,
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
  const [zoom, setZoom] = useState<ZoomChoice>(1);
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
      // 100% means actual A4 CSS size on EVERY screen, including phones.
      // Phones can pan horizontally and vertically instead of silently shrinking.
      const viewportWidth = Math.max(1, viewport.clientWidth - 1);
      const fit = Math.min(2, viewportWidth / pageWidth);
      const scale = typeof requestedZoom === "number"
        ? clampZoom(requestedZoom)
        : fit; // optional Fit width is deliberate, never the default
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
    <div className="ba-fit-viewport" ref={viewportRef} aria-label="Scrollable report preview" tabIndex={0}>
      <style>{`
        .ba-fit-viewport {
          position:relative; width:100%; max-width:100%; min-width:0;
          max-height:calc(100dvh - 168px);
          overflow-x:auto; overflow-y:auto;
          overscroll-behavior:contain; -webkit-overflow-scrolling:touch;
          scrollbar-width:thin; scrollbar-color:var(--border,#aab4c2) transparent;
        }
        .ba-fit-stage { position:relative; margin-inline:auto; box-sizing:border-box; }
        .ba-fit-viewport { touch-action:pan-x pan-y; }
        .ba-fit-content { position:absolute; top:0; left:0; transform-origin:top left; box-sizing:border-box; }
        .ba-fit-content > .ba-print-zone { box-sizing:border-box; width:100%; padding:0!important; overflow:visible!important; }
        .ba-fit-viewport:focus-visible { outline:2px solid var(--primary-color,#2563eb); outline-offset:-2px; }
        @media (max-width:640px) { .ba-fit-viewport { max-height:calc(100dvh - 192px); } }
        @media print {
          .ba-fit-viewport { max-height:none!important; width:auto!important; height:auto!important; overflow:visible!important; }
          .ba-fit-stage { width:auto!important; height:auto!important; margin:0!important; }
          .ba-fit-content { position:static!important; width:auto!important; transform:none!important; }
        }
      `}</style>
      <div className="ba-fit-stage" style={{ width: layout.width, height: layout.height }}>
        <div
          className="ba-fit-content"
          ref={contentRef}
          style={{ width: naturalWidth, transform: `scale(${layout.scale})` }}
        >
          <div id={printZoneId} className="ba-print-zone">{children}</div>
        </div>
      </div>
    </div>
  );
}
