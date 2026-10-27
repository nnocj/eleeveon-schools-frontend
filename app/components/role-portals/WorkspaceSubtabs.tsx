"use client";

/**
 * app/components/role-portals/WorkspaceSubtabs.tsx
 * Compact contextual subtabs shared by Developer, Owner and Accountant.
 * Mirrors the Branch Admin Finance / Reports contextual toolbar.
 * Presentation only: it never changes account or role permissions.
 */
import React from "react";

export type WorkspaceSubtab<K extends string = string> = {
  key: K;
  label: string;
};

type Props<K extends string> = {
  value: K;
  onChange: (next: K) => void;
  tabs: readonly WorkspaceSubtab<K>[];
  ariaLabel: string;
  secondary?: boolean;
};

export default function WorkspaceSubtabs<K extends string>({
  value, onChange, tabs, ariaLabel, secondary = false,
}: Props<K>) {
  return (
    <div className={`eds-workspace-subtabs ${secondary ? "eds-subtabs-secondary" : ""}`}>
      <style>{CSS}</style>
      <div className="eds-workspace-subtabs-row" role="group" aria-label={ariaLabel}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            className={value === key ? "is-active" : ""}
            onClick={() => {
              if (value === key) return;
              onChange(key);
              const pane = document.querySelector<HTMLElement>(
                ".role-shell.workspace-locked-scroll .app-content",
              );
              if (pane) pane.scrollTop = 0;
            }}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.eds-workspace-subtabs { position:sticky;top:0;z-index:22;display:flex;align-items:center;width:100%;min-width:0;margin:0 0 8px;padding:4px 0 5px;background:var(--eds-shell-bg,var(--bg,var(--surface,#fff)));border-bottom:1px solid var(--border,rgba(15,23,42,.10));backdrop-filter:blur(12px); }
.eds-workspace-subtabs-row { display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;overflow-x:auto;white-space:nowrap;scrollbar-width:thin;overscroll-behavior-x:contain; }
.eds-workspace-subtabs-row button { flex:0 0 auto;min-height:31px;padding:5px 11px;font:inherit;font-size:11px;font-weight:750;color:var(--text,#172033);border-radius:7px;border:1px solid transparent;background:transparent;cursor:pointer; }
.eds-workspace-subtabs-row button:hover { background:color-mix(in srgb,var(--primary-color,#2563eb) 6%,var(--surface,#fff)); }
.eds-workspace-subtabs-row button.is-active { border-color:color-mix(in srgb,var(--primary-color,#2563eb) 26%,var(--border,#d4dae3));background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff)); }
.eds-workspace-subtabs-row button:focus-visible {outline:2px solid var(--primary-color,#2563eb);outline-offset:1px;}
.eds-subtabs-secondary {position:relative;z-index:1;margin:2px 0 9px;backdrop-filter:none;}
.eds-subtabs-secondary .eds-workspace-subtabs-row button {min-height:30px;border:1px solid var(--border,rgba(15,23,42,.1));border-radius:8px;background:var(--surface,#fff);}
.eds-subtabs-secondary .eds-workspace-subtabs-row button.is-active {border-color:var(--primary-color,#2563eb);background:color-mix(in srgb,var(--primary-color,#2563eb) 12%,var(--surface,#fff));}
@media print { .eds-workspace-subtabs {display:none!important;} }
`;
