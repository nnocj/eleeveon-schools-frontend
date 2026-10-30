"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Portal-owned horizontal scrollbar. Lives outside .app-content, beside the
 * persistent portal navigation, and follows the horizontally overflowing
 * visible data table. No second synchronized scrollbar component is mounted.
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
    const pane = host?.parentElement?.querySelector<HTMLElement>(".app-content");
    if (!host || !spacer || !pane) return;

    let target: HTMLElement | null = null;
    let targetObserver: ResizeObserver | null = null;
    let animation = 0;
    let fromHost = false;
    let fromTable = false;

    const disconnect = () => {
      if (target) target.removeEventListener("scroll", onTableScroll);
      targetObserver?.disconnect();
      targetObserver = null;
      target = null;
    };

    const onTableScroll = () => {
      if (!target || fromHost) return;
      fromTable = true;
      host.scrollLeft = target.scrollLeft;
      fromTable = false;
    };

    const onHostScroll = () => {
      if (!target || fromTable) return;
      fromHost = true;
      target.scrollLeft = host.scrollLeft;
      fromHost = false;
    };

    const selectTarget = () => {
      // Ignore hidden tab panels, card views and offscreen dialogs.
      const candidates = Array.from(pane.querySelectorAll<HTMLElement>(
        '[data-workspace-hscroll="true"]',
      ));
      const matching = candidates.find((node) => {
        if (!node.isConnected || node.getClientRects().length === 0) return false;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
        return node.scrollWidth > node.clientWidth + 2;
      }) || null;

      if (matching !== target) {
        disconnect();
        target = matching;
        if (target) {
          target.addEventListener("scroll", onTableScroll, { passive: true });
          targetObserver = new ResizeObserver(schedule);
          targetObserver.observe(target);
          if (target.firstElementChild) targetObserver.observe(target.firstElementChild);
        }
      }
      const isNeeded = Boolean(target && target.scrollWidth > target.clientWidth + 2);
      setNeeded(isNeeded);
      if (target && isNeeded) {
        spacer.style.width = `${host.clientWidth + target.scrollWidth - target.clientWidth}px`;
        host.scrollLeft = target.scrollLeft;
      } else {
        spacer.style.width = "100%";
        host.scrollLeft = 0;
      }
    };

    function schedule() {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(selectTarget);
    }

    const contentObserver = new MutationObserver(schedule);
    contentObserver.observe(pane, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    const paneObserver = new ResizeObserver(schedule);
    paneObserver.observe(pane);
    const hostObserver = new ResizeObserver(schedule);
    hostObserver.observe(host);
    host.addEventListener("scroll", onHostScroll, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      cancelAnimationFrame(animation);
      disconnect();
      contentObserver.disconnect();
      paneObserver.disconnect();
      hostObserver.disconnect();
      host.removeEventListener("scroll", onHostScroll);
      window.removeEventListener("resize", schedule);
    };
  }, [activeRoute]);

  return (
    <div className={`eds-portal-hscroll-slot${needed ? " is-visible" : ""}`}>
      <div
        ref={hostRef}
        className="eds-portal-hscroll"
        role="region"
        aria-label="Scroll the current table horizontally"
                tabIndex={needed ? 0 : -1}
      >
        <div ref={spacerRef} className="eds-portal-hscroll-spacer" />
      </div>
      <style>{`
        .role-shell.workspace-locked-scroll .eds-portal-hscroll-slot {
          display: none; flex: 0 0 auto; min-width: 0;
          padding: 0 12px; background: var(--surface, transparent);
        }
        .role-shell.workspace-locked-scroll .eds-portal-hscroll-slot.is-visible { display: block; }
        .role-shell.workspace-locked-scroll .eds-portal-hscroll {
          width: 100%; height: 12px; overflow-x: auto; overflow-y: hidden;
          scrollbar-width: thin;
          scrollbar-color: var(--primary-color, #2563eb)
            color-mix(in srgb, var(--primary-color, #2563eb) 9%, transparent);
        }
        .role-shell.workspace-locked-scroll .eds-portal-hscroll-spacer { height: 1px; }
        .role-shell.workspace-locked-scroll .eds-portal-hscroll::-webkit-scrollbar { height: 9px; }
        .role-shell.workspace-locked-scroll .eds-portal-hscroll::-webkit-scrollbar-track {
          background: color-mix(in srgb, var(--primary-color, #2563eb) 9%, transparent);
        }
        .role-shell.workspace-locked-scroll .eds-portal-hscroll::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--primary-color, #2563eb) 70%, #64748b);
          border: 2px solid transparent; background-clip: padding-box; border-radius: 999px;
        }
        .eds-workspace-table-scroll {
          width: 100%; max-width: 100%; min-width: 0;
          overflow-x: auto; overscroll-behavior-x: contain;
          scrollbar-width: none;
        }
        .eds-workspace-table-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
