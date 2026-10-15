"use client";

/**
 * Full-viewport dialog layer for Branch Admin modules.
 * The portal escapes transformed/scroll-clipped RolePortalShell ancestors.
 * It intentionally does NOT modify a module's form, data or save logic.
 */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

let lockUsers = 0;
let oldBodyOverflow = "";
let oldHtmlOverflow = "";

const variables = [
  "--ba-primary", "--ba-primary-text", "--primary-color", "--surface",
  "--surface-2", "--card-bg", "--bg", "--background", "--text",
  "--foreground", "--muted", "--muted-foreground", "--border",
  "--input-bg", "--input-text", "--input-border", "--font-family",
  "--font-size", "--ba-card", "--ba-border", "--ba-text", "--ba-muted",
];

const layerStyles = `
.branch-viewport-layer { display:contents; }
.branch-viewport-layer > .ba-sheet-backdrop,
.branch-viewport-layer > .ba-modal-backdrop {
  position:fixed !important;
  inset:0 !important;
  top:0 !important; right:0 !important; bottom:0 !important; left:0 !important;
  width:100vw !important; height:100vh !important; height:100dvh !important;
  min-width:100vw !important; min-height:100vh !important; min-height:100dvh !important;
  max-width:none !important; max-height:none !important;
  margin:0 !important; box-sizing:border-box !important;
  z-index:2147482000 !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  padding:max(10px, env(safe-area-inset-top, 0px)) 10px max(10px, env(safe-area-inset-bottom, 0px)) !important;
  overflow:hidden !important;
  background:rgba(2,6,23,.66) !important;
  -webkit-backdrop-filter:blur(9px) !important;
  backdrop-filter:blur(9px) !important;
  transform:none !important;
  isolation:isolate;
}
.branch-viewport-layer > .ba-sheet-backdrop > .ba-sheet,
.branch-viewport-layer > .ba-modal-backdrop > .ba-modal,
.branch-viewport-layer > .ba-modal-backdrop > .ba-camera-modal {
  position:relative !important; inset:auto !important; transform:none !important;
  width:min(820px,100%) !important; max-width:100% !important;
  max-height:calc(100vh - 24px) !important; max-height:calc(100dvh - 24px) !important;
  min-height:0 !important; margin:0 !important;
  overflow-x:hidden !important; overflow-y:auto !important;
  overscroll-behavior:contain !important;
  -webkit-overflow-scrolling:touch;
  border:1px solid var(--ba-border,var(--border,rgba(15,23,42,.16))) !important;
  border-radius:20px !important;
  background:var(--ba-card,var(--card-bg,var(--surface,#fff))) !important;
  color:var(--ba-text,var(--text,#172033)) !important;
  box-shadow:0 25px 75px rgba(2,6,23,.32) !important;
}
.branch-viewport-layer > .ba-sheet-backdrop > .ba-sheet.small { width:min(540px,100%) !important; }
.branch-viewport-layer > .ba-sheet-backdrop.ba-basis-backdrop > .ba-basis-sheet { width:min(720px,100%) !important; max-height:calc(100vh - 24px) !important; max-height:calc(100dvh - 24px) !important; }
.branch-viewport-layer .ba-sheet-head,
.branch-viewport-layer .ba-sheet-profile,
.branch-viewport-layer .ba-modal-head {
  position:sticky !important; top:0 !important; z-index:5 !important;
  background:var(--ba-card,var(--card-bg,var(--surface,#fff))) !important;
}
.branch-viewport-layer .ba-sheet-head button[aria-label^="Close"],
.branch-viewport-layer .ba-sheet-profile button[aria-label^="Close"],
.branch-viewport-layer .ba-modal-head button[aria-label^="Close"],
.branch-viewport-layer button.ba-modal-close {
  flex:0 0 42px !important; display:grid !important; place-items:center !important;
  width:42px !important; min-width:42px !important;
  height:42px !important; min-height:42px !important;
  padding:0 !important; border-radius:50% !important;
  background:color-mix(in srgb,var(--ba-text,var(--text,#172033)) 7%,var(--ba-card,var(--surface,#fff))) !important;
  color:var(--ba-text,var(--text,#172033)) !important;
  border:1px solid var(--ba-border,var(--border,#d4dae3)) !important;
  opacity:1 !important; visibility:visible !important; cursor:pointer !important;
}
.branch-viewport-layer input,
.branch-viewport-layer select,
.branch-viewport-layer textarea {
  background:var(--input-bg,var(--ba-card,var(--surface,#fff)));
  color:var(--input-text,var(--ba-text,var(--text,#172033)));
  border-color:var(--input-border,var(--ba-border,var(--border,#d4dae3)));
}
@media(max-width:760px){
  .branch-viewport-layer > .ba-sheet-backdrop,
  .branch-viewport-layer > .ba-modal-backdrop { padding:8px !important; }
  .branch-viewport-layer > .ba-sheet-backdrop > .ba-sheet,
  .branch-viewport-layer > .ba-modal-backdrop > .ba-modal,
  .branch-viewport-layer > .ba-modal-backdrop > .ba-camera-modal { max-height:calc(100vh - 16px) !important; max-height:calc(100dvh - 16px) !important; border-radius:17px !important; }
}
@media print { .branch-viewport-layer { display:none !important; } }
`;

export default function BranchViewportPortal({
  children,
  themeSourceClass,
  onEscape,
}: {
  children: React.ReactNode;
  themeSourceClass?: string;
  onEscape?: () => void;
}) {
  const [theme, setTheme] = useState<React.CSSProperties>({});

  useEffect(() => {
    const source =
      (themeSourceClass ? document.querySelector(themeSourceClass) : null) ||
      document.querySelector(".ba-page") || document.documentElement;
    const computed = getComputedStyle(source);
    const values: Record<string, string> = {};
    for (const name of variables) {
      const value = computed.getPropertyValue(name).trim();
      if (value) values[name] = value;
    }
    setTheme(values as React.CSSProperties);
  }, [themeSourceClass]);

  useEffect(() => {
    if (lockUsers++ === 0) {
      oldBodyOverflow = document.body.style.overflow;
      oldHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    return () => {
      lockUsers = Math.max(0, lockUsers - 1);
      if (lockUsers === 0) {
        document.body.style.overflow = oldBodyOverflow;
        document.documentElement.style.overflow = oldHtmlOverflow;
      }
    };
  }, []);

  useEffect(() => {
    if (!onEscape) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onEscape(); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onEscape]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="branch-viewport-layer" style={theme}>
      <style>{layerStyles}</style>
      {children}
    </div>,
    document.body,
  );
}
