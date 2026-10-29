"use client";

/**
 * Eleeveon Schools — synchronized upper + lower horizontal table scrollbars.
 *
 * The top native scrollbar mirrors the existing bottom scrollbar exactly.
 * Only the table scroll position changes; the parent page's vertical scroll,
 * header layout, selection, actions, and print table are left untouched.
 */
import React, { useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  label?: string;
};

export default function SyncedHorizontalTableScroll({
  children,
  className = "ba-table-scroll",
  label = "Scroll table horizontally",
}: Props) {
  const upperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const lowerRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const upper = upperRef.current;
    const lower = lowerRef.current;
    const track = trackRef.current;
    if (!upper || !lower || !track) return;

    let frame = 0;
    let observedTable: Element | null = null;
    let resizeObserver: ResizeObserver | undefined;

    const measure = () => {
      const contentWidth = Math.max(lower.scrollWidth, lower.querySelector("table")?.scrollWidth || 0);
      const viewportWidth = lower.clientWidth;
      track.style.width = `${Math.ceil(Math.max(contentWidth, viewportWidth))}px`;
      setHasOverflow(previous => {
        const next = contentWidth > viewportWidth + 1;
        return previous === next ? previous : next;
      });
      // Align the upper scrollbar even if the lower table was scrolled first.
      if (Math.abs(upper.scrollLeft - lower.scrollLeft) > 1) {
        upper.scrollLeft = lower.scrollLeft;
      }
    };

    const queueMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; measure(); });
    };

    const onUpperScroll = () => {
      if (Math.abs(lower.scrollLeft - upper.scrollLeft) > 0.5) {
        lower.scrollLeft = upper.scrollLeft;
      }
    };
    const onLowerScroll = () => {
      if (Math.abs(upper.scrollLeft - lower.scrollLeft) > 0.5) {
        upper.scrollLeft = lower.scrollLeft;
      }
    };

    upper.addEventListener("scroll", onUpperScroll, { passive: true });
    lower.addEventListener("scroll", onLowerScroll, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(queueMeasure);
      resizeObserver.observe(lower);
      observedTable = lower.querySelector("table");
      if (observedTable) resizeObserver.observe(observedTable);
    }
    // A refreshed list can change the table element or column widths.
    const mutations = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          const table = lower.querySelector("table");
          if (resizeObserver && table !== observedTable) {
            if (observedTable) resizeObserver.unobserve(observedTable);
            if (table) resizeObserver.observe(table);
            observedTable = table;
          }
          queueMeasure();
        })
      : undefined;
    mutations?.observe(lower, { childList: true, subtree: true });
    window.addEventListener("resize", queueMeasure, { passive: true });
    measure();
    // Recheck after initial layout and web fonts have settled.
    queueMeasure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      upper.removeEventListener("scroll", onUpperScroll);
      lower.removeEventListener("scroll", onLowerScroll);
      window.removeEventListener("resize", queueMeasure);
      resizeObserver?.disconnect();
      mutations?.disconnect();
    };
  }, []);

  return (
    <>
      <div
        ref={upperRef}
        className="eleeveon-synced-scrollbar"
        role="region"
        aria-label={label}
        tabIndex={hasOverflow ? 0 : -1}
        style={{
          display: hasOverflow ? "block" : "none",
          boxSizing: "border-box",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          height: 18,
          marginBottom: 5,
          overflowX: "auto",
          overflowY: "hidden",
          overscrollBehaviorX: "contain",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "auto",
        }}
      >
        <div ref={trackRef} aria-hidden="true" style={{ height: 1, minHeight: 1 }} />
      </div>
      <div ref={lowerRef} className={className}>
        {children}
      </div>
    </>
  );
}
