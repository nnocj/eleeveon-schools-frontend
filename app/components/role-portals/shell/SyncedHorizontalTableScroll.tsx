"use client";

/**
 * Eleeveon Schools — always-visible, synchronized TOP table scrollbar.
 *
 * The browser may hide native horizontal scrollbars (overlay scrollbars, OS
 * preferences, or global CSS). For that reason the upper control is an explicit
 * visual track and draggable thumb instead of a 1px-high native overflow area.
 *
 * The original table wrapper keeps its native bottom scrollbar, layout,
 * content, actions, and vertical scrolling behavior. Only its scrollLeft is
 * controlled. The top control is removed entirely when nothing overflows.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  label?: string;
};

type Measurements = {
  contentWidth: number;
  viewportWidth: number;
  trackWidth: number;
  scrollLeft: number;
};

type Drag = {
  pointerId: number;
  grabOffset: number;
};

const EMPTY: Measurements = {
  contentWidth: 0,
  viewportWidth: 0,
  trackWidth: 0,
  scrollLeft: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function SyncedHorizontalTableScroll({
  children,
  className = "ba-table-scroll",
  label = "Scroll table horizontally",
}: Props) {
  const tableId = useId();
  const lowerRef = useRef<HTMLDivElement>(null);
  const upperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef(0);
  const [measurements, setMeasurements] = useState<Measurements>(EMPTY);
  const measurementsRef = useRef(measurements);
  measurementsRef.current = measurements;

  const measure = useCallback(() => {
    const lower = lowerRef.current;
    if (!lower) return;

    const table = lower.querySelector<HTMLTableElement>("table");
    const viewportWidth = Math.max(0, lower.clientWidth);
    const contentWidth = Math.max(
      lower.scrollWidth,
      table?.scrollWidth ?? 0,
      table ? Math.ceil(table.getBoundingClientRect().width) : 0,
    );
    // A hidden top control measures zero. Fall back to the actual table viewport
    // until the upper control is displayed and has a measurable width.
    const trackWidth = upperRef.current?.clientWidth || viewportWidth;
    const maxScroll = Math.max(0, contentWidth - viewportWidth);
    const scrollLeft = clamp(lower.scrollLeft, 0, maxScroll);

    setMeasurements(previous => {
      if (
        previous.contentWidth === contentWidth &&
        previous.viewportWidth === viewportWidth &&
        previous.trackWidth === trackWidth &&
        Math.abs(previous.scrollLeft - scrollLeft) < 0.5
      ) return previous;
      return { contentWidth, viewportWidth, trackWidth, scrollLeft };
    });
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    const lower = lowerRef.current;
    if (!lower) return;

    const resize = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleMeasure)
      : null;
    let watchedTable: HTMLTableElement | null = lower.querySelector("table");
    resize?.observe(lower);
    if (watchedTable) resize?.observe(watchedTable);
    if (upperRef.current) resize?.observe(upperRef.current);

    // Table rows and the table element can change as local records sync.
    const mutation = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          const currentTable = lower.querySelector<HTMLTableElement>("table");
          if (currentTable !== watchedTable) {
            if (watchedTable) resize?.unobserve(watchedTable);
            if (currentTable) resize?.observe(currentTable);
            watchedTable = currentTable;
          }
          scheduleMeasure();
        })
      : null;
    mutation?.observe(lower, { childList: true, subtree: true });

    window.addEventListener("resize", scheduleMeasure, { passive: true });
    measure();
    scheduleMeasure();
    // Font loading may change table widths after the first measurement.
    void document.fonts?.ready.then(scheduleMeasure).catch(() => {});

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", scheduleMeasure);
      mutation?.disconnect();
      resize?.disconnect();
    };
  }, [measure, scheduleMeasure]);

  const maxScroll = Math.max(0, measurements.contentWidth - measurements.viewportWidth);
  const hasOverflow = maxScroll > 1 && measurements.viewportWidth > 0;
  const trackWidth = Math.max(0, measurements.trackWidth || measurements.viewportWidth);
  const thumbWidth = trackWidth > 0
    ? clamp(trackWidth * measurements.viewportWidth / Math.max(measurements.contentWidth, 1), 42, trackWidth)
    : 0;
  const travel = Math.max(0, trackWidth - thumbWidth);
  const thumbLeft = maxScroll > 0 ? (measurements.scrollLeft / maxScroll) * travel : 0;

  const moveTo = useCallback((left: number) => {
    const lower = lowerRef.current;
    if (!lower) return;
    const m = measurementsRef.current;
    const max = Math.max(0, m.contentWidth - m.viewportWidth);
    const next = clamp(left, 0, max);
    lower.scrollLeft = next;
    setMeasurements(previous =>
      Math.abs(previous.scrollLeft - lower.scrollLeft) < 0.5
        ? previous
        : { ...previous, scrollLeft: lower.scrollLeft },
    );
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasOverflow || (event.pointerType === "mouse" && event.button !== 0)) return;
    const rectangle = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rectangle.left, 0, rectangle.width);
    const thumb = (event.target as Element).closest?.("[data-scroll-thumb]");
    // Grabbing the thumb does not jump the table. Clicking the track jumps to
    // the clicked position and starts a drag from there.
    const grabOffset = thumb ? x - thumbLeft : thumbWidth / 2;
    dragRef.current = { pointerId: event.pointerId, grabOffset };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!thumb && travel > 0) moveTo(((x - grabOffset) / travel) * maxScroll);
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || travel <= 0) return;
    const rectangle = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rectangle.left, 0, rectangle.width);
    moveTo(((x - drag.grabOffset) / travel) * maxScroll);
    event.preventDefault();
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 150 : 56;
    let next: number | undefined;
    switch (event.key) {
      case "ArrowLeft": next = measurements.scrollLeft - step; break;
      case "ArrowRight": next = measurements.scrollLeft + step; break;
      case "PageUp": next = measurements.scrollLeft - measurements.viewportWidth * 0.85; break;
      case "PageDown": next = measurements.scrollLeft + measurements.viewportWidth * 0.85; break;
      case "Home": next = 0; break;
      case "End": next = maxScroll; break;
      default: return;
    }
    event.preventDefault();
    moveTo(next);
  };

  return (
    <>
      {/* Never leave an empty reserved strip when columns fit the viewport. */}
      <div
          ref={upperRef}
          className="eleeveon-visible-top-table-scroll"
          role="scrollbar"
          aria-label={label}
          aria-controls={tableId}
          aria-orientation="horizontal"
          aria-hidden={!hasOverflow}
          aria-valuemin={0}
          aria-valuemax={Math.ceil(maxScroll)}
          aria-valuenow={Math.round(measurements.scrollLeft)}
          tabIndex={hasOverflow ? 0 : -1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onLostPointerCapture={() => { dragRef.current = null; }}
          onKeyDown={onKeyDown}
          style={{
            display: hasOverflow ? "block" : "none",
            boxSizing: "border-box",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            height: 20,
            padding: "4px 0",
            margin: "0 0 4px",
            touchAction: "none",
            userSelect: "none",
            cursor: dragRef.current ? "grabbing" : "pointer",
          }}
          title="Drag to move through table columns; keyboard left/right arrows also work"
        >
          <div
            aria-hidden="true"
            style={{
              position: "relative",
              width: "100%",
              height: 12,
              borderRadius: 999,
              border: "1px solid var(--border, rgba(100,116,139,.27))",
              boxSizing: "border-box",
              background: "color-mix(in srgb, var(--text, #334155) 13%, var(--surface, #fff))",
            }}
          >
            <div
              data-scroll-thumb="true"
              style={{
                position: "absolute",
                left: thumbLeft,
                top: -1,
                width: thumbWidth,
                height: 12,
                borderRadius: 999,
                border: "1px solid color-mix(in srgb, var(--ba-primary, #2563eb) 75%, black)",
                boxSizing: "border-box",
                background: "var(--ba-primary, var(--primary-color, #2563eb))",
                boxShadow: "0 1px 3px rgba(15, 23, 42, .18)",
                cursor: "grab",
              }}
            />
          </div>
        </div>
      <div
        ref={lowerRef}
        id={tableId}
        className={className}
        onScroll={() => {
          const lower = lowerRef.current;
          if (!lower) return;
          const next = lower.scrollLeft;
          setMeasurements(previous =>
            Math.abs(previous.scrollLeft - next) < 0.5
              ? previous
              : { ...previous, scrollLeft: next },
          );
        }}
      >
        {children}
      </div>
    </>
  );
}
