"use client";

/**
 * Eleeveon Schools - compact reports-first Branch Admin navigation.
 * Desktop: six single-tap tabs + shared Add / Filter / Print / More on the SAME row.
 * Mobile: 3 x 2 compact cards, followed by the same shared toolbar.
 * Header status/avatar use fixed dimensions and cannot resize across tabs.
 * Real module actions remain intact. Toolbar can forward to the current
 * module's accessible buttons until those modules register direct handlers.
 */
import { useEffect, useState } from "react";
import type { RoleNavItem } from "../RolePortalShell";
import {
  openExistingModuleAction,
  useBranchWorkspaceToolbar,
  type BranchToolbarAction,
} from "./BranchWorkspaceToolbar";

type Props = {
  items: RoleNavItem[];
  activeKey: string;
  onNavigate: (key: string) => void;
  branchName: string;
  online: boolean;
  memberImage?: string | null;
  memberName?: string | null;
  onOpenStatus: () => void;
  onOpenAccount: () => void;
};

const TOOLBAR_ACTIONS: Array<{ key: BranchToolbarAction; label: string }> = [
  { key: "add", label: "Add" },
  { key: "filter", label: "Filter" },
  { key: "print", label: "Print" },
  { key: "more", label: "More" },
];

function ActionIcon({ name }: { name: BranchToolbarAction }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "add") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 7h16M7 12h10m-7 5h4"/><circle cx="8" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/></svg>;
  if (name === "print") return <svg {...common}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/><path d="M18 12h.01"/></svg>;
  return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></svg>;
}

export default function BranchWorkspaceNavigation({
  items,
  activeKey,
  onNavigate,
  branchName,
  online,
  memberImage,
  memberName,
  onOpenStatus,
  onOpenAccount,
}: Props) {
  const toolbar = useBranchWorkspaceToolbar();
  const registered = toolbar?.handlers[activeKey];
  const [feedback, setFeedback] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const activeLabel = items.find((item) => item.key === activeKey)?.label || "Workspace";

  useEffect(() => {
    setFeedback("");
  }, [activeKey]);

  useEffect(() => setAvatarFailed(false), [memberImage]);

  const execute = (action: BranchToolbarAction) => {
    setFeedback("");
    const callback = registered?.[action];
    if (callback) {
      // The action is registered by the active module. No DOM guessing.
      (callback as () => void)();
      return;
    }

    if (!openExistingModuleAction(action)) {
      setFeedback(
        `The ${action} action has not yet been connected in ${activeLabel}. ` +
        "Its existing module controls remain available.",
      );
    }
  };

  const actions = (
    <div className="ba-v2-tools" role="toolbar" aria-label={`${activeLabel} actions`}>
      {TOOLBAR_ACTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className="ba-v2-tool"
          onClick={() => execute(key)}
          aria-label={`${label} in ${activeLabel}`}
          title={`${label} in ${activeLabel}`}
        >
          <ActionIcon name={key}/>
        </button>
      ))}
    </div>
  );

  const cards = items.map((item) => (
    <button
      type="button"
      key={item.key}
      className={`ba-v2-card ${activeKey === item.key ? "is-active" : ""}`}
      aria-current={activeKey === item.key ? "page" : undefined}
      onClick={() => onNavigate(item.key)}
    >
      <span className="ba-v2-card-icon" aria-hidden="true">{item.icon}</span>
      <span className="ba-v2-card-label">{item.label}</span>
    </button>
  ));

  return (
    <div className="ba-v2-nav" id="ba-workspace-navigation">
      <style>{styles}</style>
      <header className="ba-v2-header">
        <div className="ba-v2-brand">
          <span className="ba-v2-brand-mark" aria-hidden="true">🎓</span>
          <div className="ba-v2-brand-text">
            <strong>Eleeveon Schools</strong>
            <small title={branchName}>{branchName || "Branch Administration"}</small>
          </div>
        </div>
        <div className="ba-v2-header-actions">
          <button type="button" className="ba-v2-status" onClick={onOpenStatus}
            aria-label={`Open sync status — ${online ? "online" : "offline"}`}
            title={`Synchronization status: ${online ? "online" : "offline"}`}>
            <span className={`ba-v2-dot ${online ? "is-online" : "is-offline"}`} aria-hidden="true"/>
            <span className="ba-v2-status-label">{online ? "Online" : "Offline"}</span>
          </button>
          <button type="button" className="ba-v2-avatar" onClick={onOpenAccount}
            title="Account and workspace" aria-label="Open account and workspace">
            {memberImage && !avatarFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={memberImage} alt="" onError={() => setAvatarFailed(true)}/>
            ) : (
              <span aria-hidden="true">{memberName?.trim().slice(0,1).toUpperCase() || "👤"}</span>
            )}
          </button>
        </div>
      </header>
      <div className="ba-v2-navigation-body">
        <div className="ba-v2-desktop-row">
          <nav className="ba-v2-tabs" aria-label="Branch Admin destinations">
            {items.map((item) => (
              <button type="button" key={item.key}
                className={`ba-v2-tab ${activeKey === item.key ? "is-active" : ""}`}
                aria-current={activeKey === item.key ? "page" : undefined}
                onClick={() => onNavigate(item.key)}>
                <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>
              </button>
            ))}
          </nav>
          {actions}
        </div>
        <nav className="ba-v2-mobile-cards" aria-label="Branch Admin destinations">
          {cards}
        </nav>
        <div className="ba-v2-mobile-toolbar">
          <strong className="ba-v2-active-title" title={activeLabel}>{activeLabel}</strong>
          {actions}
        </div>
        {feedback && (
          <div className="ba-v2-notice" role="status">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback("")} aria-label="Dismiss toolbar notice">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = `
.ba-v2-nav { width:100%; min-width:0; color:var(--text,#111827); }
.ba-v2-nav *, .ba-v2-nav *::before, .ba-v2-nav *::after { box-sizing:border-box; }
.ba-v2-header { width:100%; height:54px; min-height:54px; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px; padding:6px 14px; background:var(--eds-header-bg,var(--surface,#fff)); border-bottom:1px solid var(--border,rgba(0,0,0,.1)); overflow:hidden; }
.ba-v2-brand { display:flex; align-items:center; gap:9px; min-width:0; max-width:100%; overflow:hidden; }
.ba-v2-brand-mark { flex:0 0 34px; width:34px; height:34px; display:grid; place-items:center; border-radius:9px; background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff)); font-size:18px; }
.ba-v2-brand-text { display:grid; min-width:0; gap:2px; overflow:hidden; }
.ba-v2-brand-text strong { display:block; font-size:13px; line-height:17px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:800; }
.ba-v2-brand-text small { display:block; max-width:100%; font-size:11px; line-height:14px; color:var(--muted,#64748b); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ba-v2-header-actions { flex:0 0 auto; display:flex; align-items:center; justify-content:flex-end; gap:8px; width:140px; min-width:140px; height:42px; }
.ba-v2-nav .ba-v2-status { display:flex; flex:0 0 90px; width:90px; min-width:90px; max-width:90px; height:36px; min-height:36px; max-height:36px; align-items:center; justify-content:center; gap:6px; border:1px solid var(--border,rgba(0,0,0,.14)); background:var(--surface,#fff); border-radius:10px; padding:0 7px; color:var(--text,#111827); font:inherit; font-size:11px; line-height:1; font-weight:700; cursor:pointer; white-space:nowrap; }
.ba-v2-dot { display:block; width:8px; min-width:8px; max-width:8px; height:8px; min-height:8px; flex:0 0 8px; border-radius:50%; }
.ba-v2-dot.is-online { background:#16a34a; }
.ba-v2-dot.is-offline { background:#ef9f16; }
.ba-v2-status-label { display:inline-block; min-width:42px; max-width:42px; text-align:left; white-space:nowrap; }
.ba-v2-nav .ba-v2-avatar { flex:0 0 40px; display:grid; place-items:center; width:40px; min-width:40px; max-width:40px; height:40px; min-height:40px; max-height:40px; padding:0; border-radius:50%; overflow:hidden; border:1px solid var(--border,rgba(0,0,0,.14)); background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff)); color:var(--text,#111827); cursor:pointer; font:inherit; font-weight:800; }
.ba-v2-avatar img { display:block; width:100%; height:100%; min-width:100%; object-fit:cover; border-radius:inherit; }
.ba-v2-avatar span { font-size:15px; line-height:1; }
.ba-v2-navigation-body { position:relative; background:var(--eds-header-bg,var(--surface,#fff)); border-bottom:1px solid var(--border,rgba(0,0,0,.1)); }
.ba-v2-desktop-row { display:flex; width:100%; min-width:0; align-items:center; gap:8px; padding:6px 12px; }
.ba-v2-tabs { display:flex; flex:1 1 0; min-width:0; align-items:center; gap:3px; overflow-x:auto; overflow-y:hidden; white-space:nowrap; scrollbar-width:thin; }
.ba-v2-nav .ba-v2-tab { display:inline-flex; flex:0 0 auto; align-items:center; justify-content:center; gap:6px; min-height:37px; padding:7px 11px; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--text,#111827); font:inherit; font-size:12px; font-weight:700; white-space:nowrap; cursor:pointer; }
.ba-v2-tab.is-active { background:color-mix(in srgb,var(--primary-color,#2563eb) 11%,var(--surface,#fff)); border-color:color-mix(in srgb,var(--primary-color,#2563eb) 25%,var(--border,rgba(0,0,0,.1))); }
.ba-v2-nav .ba-v2-tools { display:flex; flex:0 0 auto; align-items:center; gap:3px; padding:0; }
.ba-v2-nav .ba-v2-tool { flex:0 0 34px; display:grid; place-items:center; width:34px; min-width:34px; height:34px; min-height:34px; padding:0; background:transparent; border:1px solid transparent; border-radius:9px; cursor:pointer; color:var(--text,#111827); }
.ba-v2-nav .ba-v2-tool:hover, .ba-v2-nav .ba-v2-tool.is-active { background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff)); }
.ba-v2-nav button:focus-visible, .ba-v2-nav input:focus-visible { outline:2px solid var(--primary-color,#2563eb); outline-offset:2px; }
.ba-v2-mobile-cards, .ba-v2-mobile-toolbar { display:none; }
.ba-v2-search-panel, .ba-v2-notice { display:flex; align-items:center; gap:9px; padding:8px 12px; border-top:1px solid var(--border,rgba(0,0,0,.1)); font-size:12px; }
.ba-v2-search-panel label { font-weight:750; white-space:nowrap; }
.ba-v2-search-panel input { flex:1 1 0; min-width:0; padding:8px 10px; border-radius:9px; border:1px solid var(--border,rgba(0,0,0,.16)); background:var(--surface,#fff); color:var(--text,#111827); font:inherit; }
.ba-v2-search-panel button, .ba-v2-notice button { background:transparent; color:inherit; border:none; font-size:17px; cursor:pointer; }
.ba-v2-notice { justify-content:space-between; background:color-mix(in srgb,var(--primary-color,#2563eb) 6%,var(--surface,#fff)); }
@media (min-width:761px) { .ba-v2-nav { position:sticky; top:var(--eds-shell-top-offset,0px); z-index:32; } }
@media (max-width:760px) {
  .ba-v2-nav { position:sticky; top:var(--eds-shell-top-offset,0px); z-index:32; }
  .ba-v2-header { height:47px; min-height:47px; padding:4px 9px; }
  .ba-v2-brand-mark { width:29px; height:29px; flex-basis:29px; font-size:15px; }
  .ba-v2-brand-text strong { font-size:12px; line-height:16px; }
  .ba-v2-brand-text small { font-size:10px; line-height:12px; }
  .ba-v2-header-actions { width:83px; min-width:83px; gap:5px; height:34px; }
  .ba-v2-nav .ba-v2-status { flex:0 0 33px; width:33px; min-width:33px; max-width:33px; height:32px; min-height:32px; max-height:32px; padding:0; }
  .ba-v2-status-label { display:none; }
  .ba-v2-nav .ba-v2-avatar { flex-basis:34px; width:34px; min-width:34px; max-width:34px; height:34px; min-height:34px; max-height:34px; }
  .ba-v2-desktop-row { display:none; }
  .ba-v2-mobile-cards { display:grid; width:100%; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; padding:6px 8px 5px; }
  .ba-v2-nav .ba-v2-card { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; min-height:48px; padding:5px 2px; gap:3px; background:var(--surface,#fff); border:1px solid var(--border,rgba(0,0,0,.14)); border-radius:9px; color:var(--text,#111827); font:inherit; cursor:pointer; }
  .ba-v2-card.is-active { border-color:var(--primary-color,#2563eb); background:color-mix(in srgb,var(--primary-color,#2563eb) 9%,var(--surface,#fff)); box-shadow:inset 0 0 0 1px var(--primary-color,#2563eb); }
  .ba-v2-card-icon { font-size:16px; line-height:16px; }
  .ba-v2-card-label { font-size:10px; line-height:13px; font-weight:750; text-align:center; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; max-width:100%; }
  .ba-v2-mobile-toolbar { display:flex; width:100%; align-items:center; justify-content:space-between; gap:5px; min-height:39px; padding:1px 9px 5px; }
  .ba-v2-active-title { display:block; flex:1 1 0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
  .ba-v2-nav .ba-v2-tool { width:32px; min-width:32px; height:32px; min-height:32px; flex-basis:32px; }
  .ba-v2-search-panel label { display:none; }
}
@media (max-width:320px) { .ba-v2-mobile-cards { gap:3px; padding-left:5px; padding-right:5px; } .ba-v2-card-label { font-size:9px; } .ba-v2-mobile-toolbar { padding-left:6px; padding-right:6px; } .ba-v2-tools { gap:1px; } }
`;
