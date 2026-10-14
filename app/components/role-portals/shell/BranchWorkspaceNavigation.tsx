"use client";

/**
 * app/components/role-portals/shell/BranchWorkspaceNavigation.tsx
 * One Branch Admin navigation surface:
 * - desktop: six direct top links;
 * - mobile: six cards arranged in two columns;
 * - no sidebar or bottom bar.
 */
import type { RoleNavItem } from "../RolePortalShell";

type Props = {
  items: RoleNavItem[];
  activeKey: string;
  onNavigate: (key: string) => void;
  branchName: string;
  online: boolean;
  onOpenStatus: () => void;
  onOpenAccount: () => void;
};

export default function BranchWorkspaceNavigation({
  items,
  activeKey,
  onNavigate,
  branchName,
  online,
  onOpenStatus,
  onOpenAccount,
}: Props) {
  return (
    <div className="ba-navigation" id="ba-workspace-navigation">
      <style>{styles}</style>
      <header className="ba-navigation-header">
        <div className="ba-brand">
          <span className="ba-brand-icon" aria-hidden="true">🎓</span>
          <div className="ba-brand-text">
            <strong>Eleeveon Schools</strong>
            <small title={branchName}>{branchName || "Branch Administration"}</small>
          </div>
        </div>
        <div className="ba-header-actions">
          <button
            type="button"
            className="ba-icon-button"
            onClick={onOpenStatus}
            aria-label="Open synchronization status"
            title={online ? "Online · Sync status" : "Offline · Sync status"}
          >
            <span className={online ? "ba-connection-dot online" : "ba-connection-dot"} />
            <span className="ba-action-text">{online ? "Online" : "Offline"}</span>
          </button>
          <button
            type="button"
            className="ba-icon-button ba-account-button"
            onClick={onOpenAccount}
            aria-label="Open account and workspace settings"
            title="Account and workspace"
          >
            <span aria-hidden="true">👤</span>
          </button>
        </div>
      </header>
      <nav className="ba-desktop-navigation" aria-label="Branch Admin main navigation">
        {items.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`ba-top-link ${activeKey === item.key ? "is-active" : ""}`}
            aria-current={activeKey === item.key ? "page" : undefined}
            onClick={() => onNavigate(item.key)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <nav className="ba-mobile-navigation" aria-label="Branch Admin workspaces">
        {items.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`ba-workspace-card ${activeKey === item.key ? "is-active" : ""}`}
            aria-current={activeKey === item.key ? "page" : undefined}
            onClick={() => onNavigate(item.key)}
          >
            <span className="ba-workspace-icon" aria-hidden="true">{item.icon}</span>
            <span className="ba-workspace-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

const styles = `
.ba-navigation { width: 100%; min-width: 0; color: var(--text, #111827); }
.ba-navigation-header { min-height: 55px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 16px; background: var(--eds-header-bg, var(--surface, #fff)); border-bottom: 1px solid var(--border, rgba(0,0,0,.09)); }
.ba-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
.ba-brand-icon { display: grid; place-items: center; flex: 0 0 auto; width: 36px; height: 36px; border-radius: 10px; background: color-mix(in srgb, var(--primary-color, #2563eb) 10%, var(--surface, #fff)); font-size: 21px; }
.ba-brand-text { min-width: 0; display: grid; gap: 1px; }
.ba-brand-text strong { font-size: 13px; line-height: 1.25; font-weight: 850; }
.ba-brand-text small { max-width: min(50vw, 420px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 11px; color: var(--muted, #64748b); }
.ba-header-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 7px; }
.ba-icon-button { cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 38px; min-width: 38px; padding: 7px 10px; color: var(--text, #111827); background: var(--surface, #fff); border: 1px solid var(--border, rgba(0,0,0,.10)); border-radius: 11px; font: inherit; font-size: 12px; font-weight: 650; }
.ba-account-button { font-size: 18px; }
.ba-connection-dot { display: inline-block; width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: #eab308; }
.ba-connection-dot.online { background: #16a34a; }
.ba-navigation button:focus-visible { outline: 3px solid var(--primary-color, #2563eb); outline-offset: 2px; }
.ba-desktop-navigation { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 8px 14px; background: var(--eds-header-bg, var(--surface, #fff)); border-bottom: 1px solid var(--border, rgba(0,0,0,.10)); }
.ba-top-link { display: flex; align-items: center; gap: 7px; min-height: 40px; padding: 9px 13px; border: 1px solid transparent; border-radius: 10px; color: var(--text, #111827); background: transparent; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.ba-top-link.is-active { border-color: color-mix(in srgb, var(--primary-color, #2563eb) 22%, transparent); background: color-mix(in srgb, var(--primary-color, #2563eb) 11%, var(--surface, #fff)); }
.ba-top-link:hover, .ba-workspace-card:hover { background: color-mix(in srgb, var(--primary-color, #2563eb) 8%, var(--surface, #fff)); }
.ba-mobile-navigation { display: none; }
@media (min-width: 761px) { .ba-navigation { position: sticky; top: var(--eds-shell-top-offset, 0px); z-index: 32; } }
@media (max-width: 760px) {
  .ba-navigation-header { position: relative; padding: 7px 10px; }
  .ba-action-text { display: none; }
  .ba-desktop-navigation { display: none; }
  .ba-mobile-navigation { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 10px; }
  .ba-workspace-card { cursor: pointer; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 7px; min-width: 0; min-height: 83px; padding: 11px 6px; border: 1px solid var(--border, rgba(0,0,0,.12)); border-radius: 14px; background: var(--surface, #fff); color: var(--text, #111827); font: inherit; }
  .ba-workspace-card.is-active { border: 2px solid var(--primary-color, #2563eb); background: color-mix(in srgb, var(--primary-color, #2563eb) 8%, var(--surface, #fff)); }
  .ba-workspace-icon { font-size: 23px; line-height: 1; }
  .ba-workspace-label { font-size: 12px; line-height: 1.25; font-weight: 750; text-align: center; overflow-wrap: anywhere; }
}
@media (max-width: 350px) { .ba-brand-text strong { font-size: 12px; } .ba-workspace-card { min-height: 78px; } }
`;
