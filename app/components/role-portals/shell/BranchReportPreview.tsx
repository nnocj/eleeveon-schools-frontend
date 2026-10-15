"use client";

/**
 * Auto-fit an A4 portrait/landscape preview to its actual available width.
 * The PDF/print engine receives ONLY the untransformed #printZoneId content.
 * No zoom or transform is written onto printable report nodes.
 */
import React, { useLayoutEffect, useRef, useState } from "react";

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let frame = 0;
    const measure = () => {
      const available = Math.max(1, viewport.clientWidth - 2);
      const printContent = content.querySelector<HTMLElement>(`#${printZoneId}`);
      // Wide tables can extend beyond the nominal A4 page. Include their
      // real width so an entire document fits rather than getting cropped.
      const intrinsicWidth = Math.max(naturalWidth, printContent?.scrollWidth || 0);
      const scale = Math.min(1, available / intrinsicWidth);
      const height = Math.max(content.scrollHeight, content.offsetHeight) * scale;
      setSize((prev) =>
        Math.abs(prev.scale - scale) < 0.002 && Math.abs(prev.height - height) < 2
          ? prev : { scale, height },
      );
    };
    // Measure before first paint (prevents a flash of oversized report content).
    measure();
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(viewport);
    observer?.observe(content);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [naturalWidth, printZoneId]);

  return (
    <div className="ba-fit-viewport" ref={viewportRef} style={{ height: size.height || undefined }}>
      <style>{`
        .ba-fit-viewport { position:relative; width:100%; min-width:0; overflow:visible; }
        .ba-fit-content { transform-origin:top left; box-sizing:border-box; }
        .ba-fit-content > .ba-print-zone { width:100%; box-sizing:border-box; overflow:visible!important; }
        @media print {
          .ba-fit-viewport { height:auto!important; overflow:visible!important; }
          .ba-fit-content { width:auto!important; transform:none!important; }
        }
      `}</style>
      <div
        className="ba-fit-content"
        ref={contentRef}
        style={{ width:naturalWidth, transform:`scale(${size.scale})` }}
      >
        <div id={printZoneId} className="ba-print-zone">{children}</div>
      </div>
    </div>
  );
}
