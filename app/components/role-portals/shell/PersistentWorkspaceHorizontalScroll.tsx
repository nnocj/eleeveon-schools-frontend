"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Persistent horizontal scrollbar placed between portal navigation and page content.
 * It mirrors the first visible horizontally overflowing workspace table/container.
 */
export default function PersistentWorkspaceHorizontalScroll({
  activeRoute,
}: {
  activeRoute: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const [needed, setNeeded] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const spacer = spacerRef.current;
    if (!host || !spacer) return;

    let target: HTMLElement | null = null;
    let targetObserver: ResizeObserver | null = null;
    let animation = 0;
    let syncingHost = false;
    let syncingTarget = false;

    const disconnectTarget = () => {
      if (target) target.removeEventListener("scroll", onTargetScroll);
      targetObserver?.disconnect();
      targetObserver = null;
      target = null;
    };

    const onTargetScroll = () => {
      if (!target || syncingHost) return;
      syncingTarget = true;
      host.scrollLeft = target.scrollLeft;
      syncingTarget = false;
    };

    const onHostScroll = () => {
      if (!target || syncingTarget) return;
      syncingHost = true;
      target.scrollLeft = host.scrollLeft;
      syncingHost = false;
    };

    const isVisible = (node: HTMLElement) => {
      if (!node.isConnected || node.clientWidth <= 0 || node.getClientRects().length === 0) return false;
      let current: HTMLElement | null = node;
      while (current) {
        const style = window.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
        current = current.parentElement;
      }
      return true;
    };

    const selectTarget = () => {
      // Prefer explicitly marked table containers; include the legacy class as a safe fallback.
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-workspace-hscroll="true"], .ba-table-scroll',
      ));
      const matching = candidates.find((node) =>
        isVisible(node) && node.scrollWidth > node.clientWidth + 2 &&
        node.closest('[aria-hidden="true"]') === null
      ) || null;

      if (matching !== target) {
        disconnectTarget();
        target = matching;
        if (target) {
          target.addEventListener("scroll", onTargetScroll, { passive: true });
          targetObserver = new ResizeObserver(schedule);
          targetObserver.observe(target);
          if (target.firstElementChild instanceof HTMLElement) targetObserver.observe(target.firstElementChild);
        }
      }

      const available = host.clientWidth;
      const overflow = Boolean(target && target.scrollWidth > target.clientWidth + 2 && available > 0);
      setNeeded(overflow);
      if (target && overflow) {
        spacer.style.width = `${available + target.scrollWidth - target.clientWidth}px`;
        host.scrollLeft = target.scrollLeft;
      } else {
        spacer.style.width = `${Math.max(available, 1)}px`;
        host.scrollLeft = 0;
      }
    };

    function schedule() {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(selectTarget);
    }

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });
    const hostObserver = new ResizeObserver(schedule);
    hostObserver.observe(host);
    host.addEventListener("scroll", onHostScroll, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      cancelAnimationFrame(animation);
      disconnectTarget();
      mutationObserver.disconnect();
      hostObserver.disconnect();
      host.removeEventListener("scroll", onHostScroll);
      window.removeEventListener("resize", schedule);
    };
  }, [activeRoute]);

  return (
    <div className="eds-portal-hscroll-slot" aria-label="Table horizontal scrolling">
      <div
        ref={hostRef}
        className={`eds-portal-hscroll${needed ? " is-needed" : ""}`}
        role="region"
        aria-label="Scroll the current table horizontally"
        tabIndex={needed ? 0 : -1}
      >
        <div ref={spacerRef} className="eds-portal-hscroll-spacer" />
      </div>
      <style>{`
        .eds-portal-hscroll-slot {
          display: block !important;
          flex: 0 0 auto;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          padding: 0 12px;
          background: var(--surface, #f8fafc);
          position: relative;
          z-index: 5;
        }
        .eds-portal-hscroll {
          display: block;
          width: 100%;
          height: 16px;
          min-height: 16px;
          box-sizing: border-box;
          overflow-x: auto;
          overflow-y: hidden;
          overscroll-behavior-x: contain;
          scrollbar-width: auto;
          scrollbar-color: #64748b #dbe3ee;
          border-radius: 999px;
        }
        .eds-portal-hscroll-spacer { height: 1px; min-height: 1px; }
        .eds-portal-hscroll::-webkit-scrollbar { height: 12px; }
        .eds-portal-hscroll::-webkit-scrollbar-track { background: #dbe3ee; border-radius: 999px; }
        .eds-portal-hscroll::-webkit-scrollbar-thumb { background: #64748b; border: 2px solid #dbe3ee; border-radius: 999px; }
        .eds-portal-hscroll:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
        .eds-workspace-table-scroll {
          width: 100%; max-width: 100%; min-width: 0;
          overflow-x: auto; overscroll-behavior-x: contain;
          scrollbar-width: none;
        }
        .eds-workspace-table-scroll::-webkit-scrollbar { height: 0 !important; display: none !important; }
      `}</style>
    </div>
  );
}
