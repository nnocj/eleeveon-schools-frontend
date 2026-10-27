"use client";

/**
 * Branch Admin V7 navigation.
 * Desktop: six horizontal tabs + contextual actions.
 * Mobile: one-row selector + contextual actions; 3x2 card menu on demand.
 * Pin cards is optional and is remembered on this device.
 */
import { useEffect, useRef, useState } from "react";
import type { RoleNavItem } from "../RolePortalShell";
import HubUnreadBadge from "./HubUnreadBadge";
import { printVisibleBranchTable } from "./BranchTablePrint";
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

// Built-in route recognized by RolePortalShellContent for every role.
const HUB_KEY = "__eleeveon_center__";
// Preserve Branch Admin's existing preference; keep the other portals independent.
const BRANCH_PIN_KEY = "eleeveon_branch_admin_pin_cards";
function navIdentity(items: RoleNavItem[]) {
  const keys = new Set(items.map((item) => item.key));
  if (keys.has("saasWorkspace")) {
    return { title: "Developer Portal", icon: "🛠️", pinKey: "eleeveon_developer_pin_cards" };
  }
  if (keys.has("ownerDashboard") || keys.has("institutionWorkspace")) {
    return { title: "Owner Portal", icon: "👑", pinKey: "eleeveon_owner_pin_cards" };
  }
  if (keys.size === 1 && keys.has("financeWorkspace")) {
    return { title: "Accountant Portal", icon: "💼", pinKey: "eleeveon_accountant_pin_cards" };
  }
  return { title: "Branch Admin Portal", icon: "🎓", pinKey: BRANCH_PIN_KEY };
}
const ACTIONS: Array<{ key: BranchToolbarAction; label: string }> = [
  { key: "add", label: "Add" },
  { key: "filter", label: "Filter" },
  { key: "print", label: "Print" },
  { key: "more", label: "More" },
];

function ActionIcon({ name }: { name: BranchToolbarAction }) {
  const attr = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "add") return <svg {...attr}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "filter") return <svg {...attr}><path d="M4 7h16M7 12h10m-7 5h4" /><circle cx="8" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /></svg>;
  if (name === "print") return <svg {...attr}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1-2-2h-2" /><path d="M6 14h12v7H6z" /></svg>;
  return <svg {...attr}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>;
}

export default function BranchWorkspaceNavigation({
  items, activeKey, onNavigate, branchName, online, memberImage,
  memberName, onOpenStatus, onOpenAccount,
}: Props) {
  const identity = navIdentity(items);
  const toolbar = useBranchWorkspaceToolbar();
  const registered = toolbar?.handlers[activeKey];
  const activeLabel = activeKey === HUB_KEY ? "Eleeveon Hub" : items.find((item) => item.key === activeKey)?.label || "Workspace";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { setPinned(localStorage.getItem(identity.pinKey) === "1"); } catch { /* storage may be blocked */ }
  }, [identity.pinKey]);
  useEffect(() => { setFeedback(""); setPickerOpen(false); }, [activeKey]);
  useEffect(() => setAvatarFailed(false), [memberImage]);
  useEffect(() => {
    if (!pickerOpen) return;
    const clickAway = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("pointerdown", clickAway);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", clickAway);
      document.removeEventListener("keydown", escape);
    };
  }, [pickerOpen]);

  const setPinPreference = (next: boolean) => {
    setPinned(next);
    setPickerOpen(false);
    try { localStorage.setItem(identity.pinKey, next ? "1" : "0"); } catch { /* storage may be blocked */ }
  };
  const navigateTo = (key: string) => {
    setPickerOpen(false);
    if (key !== activeKey) onNavigate(key);
  };
  const execute = (action: BranchToolbarAction) => {
    setPickerOpen(false);
    setFeedback("");
    const callback = registered?.[action];
    if (callback) { (callback as () => void)(); return; }
    // Reports (including Remarks and Attendance) deliberately retain their
    // dedicated official printing/export engines, never this generic printer.
    const reportsKeys = new Set(["reportsWorkspace", "studentReports", "broadsheets", "reportRemarks", "studentAttendance"]);
    if (action === "print" && !reportsKeys.has(activeKey)) {
      if (printVisibleBranchTable(activeLabel)) return;
      setFeedback("No table is visible to print in this section.");
      return;
    }
    if (!openExistingModuleAction(action)) {
      setFeedback(`${action.charAt(0).toUpperCase()+action.slice(1)} isn't available in ${activeLabel} yet.`);
    }
  };

  const actions = (
    <div className="ba-v7-tools" role="toolbar" aria-label={`${activeLabel} actions`}>
      {ACTIONS.map(({ key, label }) => (
        <button type="button" key={key} className="ba-v7-tool" onClick={() => execute(key)}
          aria-label={`${label} in ${activeLabel}`} title={`${label} in ${activeLabel}`}>
          <ActionIcon name={key} />
        </button>
      ))}
    </div>
  );

  const cards = (
    <div className="ba-v7-card-grid" role="group" aria-label={`${identity.title} workspaces`}>
      {items.map((item) => (
        <button type="button" key={item.key}
          className={`ba-v7-card ${activeKey === item.key ? "is-active" : ""}`}
          aria-current={activeKey === item.key ? "page" : undefined}
          onClick={() => navigateTo(item.key)}>
          <span className="ba-v7-card-icon" aria-hidden="true">{item.icon}</span>
          <span className="ba-v7-card-name">{item.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
    <div className="ba-v7-nav" ref={rootRef} id="ba-workspace-navigation">
      <style>{styles}</style>
      <header className="ba-v7-header">
        <div className="ba-v7-brand">
          <span className="ba-v7-brand-mark" aria-hidden="true">{identity.icon}</span>
          <div className="ba-v7-brand-copy"><strong>Eleeveon Schools</strong><small title={identity.title === "Branch Admin Portal" ? branchName : identity.title}>{identity.title === "Branch Admin Portal" ? (branchName || "Branch Administration") : identity.title}</small></div>
        </div>
        <div className="ba-v7-header-actions">
          <button type="button" className="ba-v7-status" onClick={onOpenStatus}
            aria-label={`Open sync status — ${online ? "online" : "offline"}`} title={`Sync ${online ? "online" : "offline"}`}>
            <span className={`ba-v7-dot ${online ? "is-online" : "is-offline"}`} aria-hidden="true" />
            <span className="ba-v7-status-name">{online ? "Online" : "Offline"}</span>
          </button>
          <button type="button" className="ba-v7-status ba-v12-hub" onClick={() => navigateTo(HUB_KEY)}
            aria-label="Open Eleeveon Hub" title="Eleeveon Hub"
            aria-current={activeKey === HUB_KEY ? "page" : undefined}>
            <span aria-hidden="true">✉</span><span className="ba-v7-status-name">Hub</span>
             <HubUnreadBadge />
          </button>
          <button type="button" className="ba-v7-avatar" onClick={onOpenAccount} aria-label="Open account and workspace">
            {memberImage && !avatarFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={memberImage} alt="" onError={() => setAvatarFailed(true)} />
            ) : <span aria-hidden="true">{memberName?.trim().slice(0,1).toUpperCase() || "👤"}</span>}
          </button>
        </div>
      </header>
      <div className="ba-v7-nav-body">
        <div className="ba-v7-desktop-row">
          <nav className="ba-v7-tabs" aria-label={`${identity.title} workspaces`}>
            {items.map((item) => (
              <button key={item.key} type="button" onClick={() => navigateTo(item.key)}
                className={`ba-v7-tab ${activeKey === item.key ? "is-active" : ""}`}
                aria-current={activeKey === item.key ? "page" : undefined}>
                <span aria-hidden="true">{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
          {actions}
        </div>
        <div className="ba-v7-mobile-row">
          <button type="button" className="ba-v7-selector" aria-expanded={pickerOpen || pinned}
            aria-controls="ba-v7-card-panel" onClick={() => setPickerOpen((current) => !current)}
            title="Switch workspace">
            <span>{activeLabel}</span><span aria-hidden="true">{pickerOpen ? "⌃" : "⌄"}</span>
          </button>
          {actions}
        </div>
        {pickerOpen && (
          <div id="ba-v7-card-panel" className="ba-v7-panel is-floating">
            <div className="ba-v7-panel-head">
              <span>Workspaces</span>
              <button type="button" className={pinned ? "is-pinned" : ""}
                onClick={() => setPinPreference(!pinned)}
                aria-pressed={pinned} title={pinned ? "Unpin navigation cards" : "Keep navigation cards visible"}>
                <span aria-hidden="true">📌</span> {pinned ? "Unpin cards" : "Pin cards"}
              </button>
            </div>
            {cards}
          </div>
        )}
        {feedback && (
          <div className="ba-v7-feedback" role="status">
            {feedback}<button type="button" aria-label="Dismiss notice" onClick={() => setFeedback("")}>✕</button>
          </div>
        )}
      </div>
    </div>
    {pinned && !pickerOpen && (
      <div className="ba-v7-pinned-cards ba-v7-panel is-pinned">
        <div className="ba-v7-panel-head">
          <span>Workspaces</span>
          <button type="button" onClick={() => setPinPreference(false)} aria-label="Unpin navigation cards">📌 Unpin cards</button>
        </div>
        {cards}
      </div>
    )}
    </>
  );
}

const styles = `
.ba-v7-nav { position:sticky; top:var(--eds-shell-top-offset,0px); z-index:35; width:100%; min-width:0; color:var(--text,#172033); }
.ba-v7-nav *,.ba-v7-nav *::before,.ba-v7-nav *::after { box-sizing:border-box; }
.ba-v7-nav button { font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.ba-v7-header { display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px; width:100%;height:54px;min-height:54px;padding:6px 14px;background:var(--eds-header-bg,var(--surface,#fff));border-bottom:1px solid var(--border,rgba(0,0,0,.1)); }
.ba-v7-brand { display:flex;align-items:center;gap:9px;min-width:0;overflow:hidden; }
.ba-v7-brand-mark {flex:0 0 34px;width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff));font-size:18px;}
.ba-v7-brand-copy {display:grid;gap:2px;min-width:0;overflow:hidden;}
.ba-v7-brand-copy strong,.ba-v7-brand-copy small {overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.ba-v7-brand-copy strong{font-size:13px;line-height:17px;font-weight:800;}
.ba-v7-brand-copy small{font-size:11px;line-height:14px;color:var(--muted,#64748b);}
.ba-v7-header-actions{display:flex;align-items:center;justify-content:flex-end;flex:0 0 140px;width:140px;min-width:140px;height:42px;gap:8px;}
.ba-v7-nav .ba-v7-status{flex:0 0 90px;width:90px;min-width:90px;max-width:90px;height:36px;min-height:36px;max-height:36px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 7px;border:1px solid var(--border,#d4dae3);background:var(--surface,#fff);border-radius:10px;color:var(--text,#172033);font-size:11px;font-weight:700;white-space:nowrap;}
.ba-v7-nav .ba-v12-hub{position:relative;overflow:visible;}
.ba-v7-dot{flex:0 0 8px;width:8px;height:8px;border-radius:50%;}.ba-v7-dot.is-online{background:#16a34a}.ba-v7-dot.is-offline{background:#d97706}
.ba-v7-nav .ba-v7-avatar{flex:0 0 38px;width:38px;min-width:38px;max-width:38px;height:38px;min-height:38px;max-height:38px;display:grid;place-items:center;padding:0;border:1px solid var(--border,#d4dae3);border-radius:50%;background:var(--surface,#fff);overflow:hidden;color:var(--text,#172033);}
.ba-v7-avatar img{width:100%;height:100%;object-fit:cover}.ba-v7-avatar span{font-size:15px;line-height:1}
.ba-v7-nav-body{position:relative;background:var(--eds-header-bg,var(--surface,#fff));border-bottom:1px solid var(--border,rgba(0,0,0,.1));}
.ba-v7-desktop-row{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 12px;}
.ba-v7-tabs{display:flex;flex:1 1 0;align-items:center;gap:3px;min-width:0;overflow-x:auto;white-space:nowrap;scrollbar-width:thin;}
.ba-v7-nav .ba-v7-tab{display:inline-flex;flex:0 0 auto;align-items:center;gap:6px;min-height:37px;padding:7px 11px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--text,#172033);font-size:12px;font-weight:700;white-space:nowrap;}
.ba-v7-tab.is-active{background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--surface,#fff));border-color:color-mix(in srgb,var(--primary-color,#2563eb) 25%,var(--border,#d4dae3));}
.ba-v7-tools{display:flex;align-items:center;flex:0 0 auto;gap:3px;}
.ba-v7-nav .ba-v7-tool{width:34px;min-width:34px;max-width:34px;height:34px;min-height:34px;max-height:34px;display:grid;place-items:center;padding:0;background:transparent;border:1px solid transparent;border-radius:9px;color:var(--text,#172033);}
.ba-v7-tool:hover{background:color-mix(in srgb,var(--primary-color,#2563eb) 9%,var(--surface,#fff));}
.ba-v7-mobile-row{display:none;}
.ba-v7-feedback{display:flex;justify-content:space-between;gap:8px;padding:7px 12px;font-size:12px;background:color-mix(in srgb,var(--primary-color,#2563eb) 6%,var(--surface,#fff));}
.ba-v7-feedback button{border:0;background:transparent;color:inherit}
.ba-v7-panel{padding:7px;background:var(--eds-header-bg,var(--surface,#fff));border:1px solid var(--border,#d4dae3);border-radius:11px;box-shadow:0 14px 34px rgba(15,23,42,.11);}
.ba-v7-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 6px;color:var(--muted,#64748b);font-size:11px;font-weight:700;}
.ba-v7-panel-head button{padding:5px 8px;border:1px solid var(--border,#d4dae3);border-radius:8px;color:var(--text,#172033);background:var(--surface,#fff);font-size:11px;}
.ba-v7-panel-head button.is-pinned{background:color-mix(in srgb,var(--primary-color,#2563eb) 9%,var(--surface,#fff));}
.ba-v7-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;}
.ba-v7-nav .ba-v7-card,.ba-v7-pinned-cards .ba-v7-card{display:grid;place-content:center;justify-items:center;gap:3px;min-width:0;min-height:49px;padding:5px 2px;border:1px solid var(--border,#d4dae3);border-radius:9px;background:color-mix(in srgb,var(--surface,#fff) 94%,var(--text,#172033) 6%);color:var(--text,#172033);}
.ba-v7-nav .ba-v7-card.is-active,.ba-v7-pinned-cards .ba-v7-card.is-active{border-color:var(--primary-color,#2563eb);background:color-mix(in srgb,var(--primary-color,#2563eb) 9%,var(--surface,#fff));}
.ba-v7-card-icon{font-size:16px;line-height:17px}.ba-v7-card-name{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:10px;font-weight:700;}
.ba-v7-nav button:focus-visible{outline:2px solid var(--primary-color,#2563eb);outline-offset:2px;}
@media(max-width:760px){
.ba-v7-header{height:47px;min-height:47px;padding:4px 9px}.ba-v7-brand-mark{flex-basis:29px;width:29px;height:29px;font-size:15px}
.ba-v7-brand-copy strong{font-size:12px;line-height:16px}.ba-v7-brand-copy small{font-size:10px;line-height:12px}
.ba-v7-header-actions{flex:0 0 83px;width:83px;min-width:83px;height:34px;gap:5px}
.ba-v7-nav .ba-v7-status{flex:0 0 33px;width:33px;min-width:33px;max-width:33px;height:32px;min-height:32px;max-height:32px;padding:0}
.ba-v7-status-name{display:none}.ba-v7-nav .ba-v7-avatar{flex-basis:34px;width:34px;min-width:34px;max-width:34px;height:34px;min-height:34px;max-height:34px}
.ba-v7-desktop-row{display:none}.ba-v7-mobile-row{display:flex;align-items:center;gap:4px;min-width:0;padding:5px 8px;}
.ba-v7-nav .ba-v7-selector{display:flex;align-items:center;justify-content:space-between;gap:5px;flex:1 1 0;min-width:0;height:36px;min-height:36px;padding:0 9px;border:1px solid var(--border,#d4dae3);border-radius:9px;background:color-mix(in srgb,var(--surface,#fff) 94%,var(--text,#172033) 6%);color:var(--text,#172033);font-size:12px;font-weight:750;}
.ba-v7-selector span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-v7-mobile-row .ba-v7-tool{width:33px;min-width:33px;height:34px;min-height:34px;}
.ba-v7-panel.is-floating{position:absolute;z-index:95;top:100%;left:8px;right:8px;max-height:min(60dvh,320px);overflow-y:auto;}
.ba-v7-panel.is-pinned{position:relative;z-index:auto;margin:0 8px 6px;box-shadow:none;}
.ba-v7-pinned-cards button {font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;}
}
@media(min-width:761px){.ba-v7-panel{display:none}}
@media(max-width:330px){.ba-v7-mobile-row{gap:2px;padding-left:5px;padding-right:5px}.ba-v7-nav .ba-v7-tool{width:30px;min-width:30px}.ba-v7-card-name{font-size:9px}}
@media print{.ba-v7-nav{display:none!important}}
`;
