"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useWindowChrome,
} from "../../../context/window-chrome-context";

export interface PortalHeaderProps {
  activeLabel: string;
  workspaceLabel: string;

  memberName: string;
  memberRole: string;
  memberImage?: string | null;
  memberMeta: string;

  online: boolean;
  realtimeConnected: boolean;
  initialSyncDone: boolean;
  realtimeStatus: string;

  sidebarHidden: boolean;

  onToggleSidebar(): void;
  onOpenStatus(): void;
  onOpenAccount(): void;
}

function initials(
  name: string,
) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part[0] ?? "",
    )
    .join("")
    .toUpperCase();
}

function HeaderAvatar({
  image,
  name,
}: {
  image?: string | null;
  name: string;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image]);

  return (
    <span className="header-account-avatar">
      {image && !failed ? (
        <img
          src={image}
          alt=""
          onError={() =>
            setFailed(true)
          }
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

function HubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PortalHeader({
  activeLabel,
  workspaceLabel,

  memberName,
  memberRole,
  memberImage,
  memberMeta,

  online,
  realtimeConnected,
  initialSyncDone,
  realtimeStatus,

  onToggleSidebar,
  onOpenStatus,
  onOpenAccount,
}: PortalHeaderProps) {
  const {
    overlayVisible,
  } =
    useWindowChrome();

  /*
   * Installed desktop overlay mode has exactly one top bar:
   * WindowTitleBar.
   *
   * The portal header is only a normal browser/mobile
   * fallback and must not consume height while the
   * overlay is active.
   */
  if (overlayVisible) {
    return null;
  }

  const statusClass =
    !online
      ? "warn"
      : realtimeConnected
        ? "live"
        : initialSyncDone
          ? "ok"
          : "warn";

  const statusTitle =
    !online
      ? "Offline — using local data"
      : realtimeConnected
        ? "Live updates connected"
        : initialSyncDone
          ? `Synced — realtime ${realtimeStatus}`
          : "Sync needs attention";

  /*
   * The mobile navigation component listens for this event.
   *
   * This avoids moving Hub state into PortalHeader and keeps
   * the existing RolePortalShell contract intact.
   */
  const openHub = () => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(
        "eleeveon:open-hub",
      ),
    );
  };

  return (
    <header
      className="app-header eds-header-surface eds-glass-subtle"
      data-window-overlay="fallback"
    >
      {/*
       * Desktop:
       * keeps the sidebar control.
       *
       * Mobile:
       * CSS hides it because Home / Library / Screens
       * replace the sidebar.
       */}
      <button
        className="icon-btn primary portal-header-sidebar-toggle"
        onClick={
          onToggleSidebar
        }
        type="button"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>

      <div className="header-title">
        <strong>
          {activeLabel}
        </strong>

        <span>
          {workspaceLabel}
        </span>
      </div>

      {/*
       * Mobile global Hub access.
       * Hidden on desktop because desktop already has Hub
       * inside the sidebar workspace area.
       */}
      <button
        type="button"
        className="icon-btn portal-header-hub"
        onClick={
          openHub
        }
        aria-label="Open Eleeveon Hub"
        title="Eleeveon Hub"
      >
        <HubIcon />
      </button>

      <button
        type="button"
        className={`sync-dot-btn header-status ${statusClass}`}
        onClick={
          onOpenStatus
        }
        aria-label="Open system status"
        title={
          statusTitle
        }
      >
        <span />
      </button>

      <button
        type="button"
        className="header-account-button"
        onClick={
          onOpenAccount
        }
        aria-label="Open account and workspace menu"
        title={
          memberMeta
        }
      >
        <HeaderAvatar
          image={
            memberImage
          }
          name={
            memberName
          }
        />

        <span className="header-account-copy">
          <strong>
            {memberName}
          </strong>

          <small>
            {memberRole}
          </small>
        </span>
      </button>

      <style>{css}</style>
    </header>
  );
}

const css = `
.portal-header-hub {
  display: none !important;
}

.portal-header-hub svg {
  width: 19px;
  height: 19px;
}

@media (max-width: 979px) {
  /*
   * Mobile no longer opens the role sidebar.
   * Home / Library / Screens live in the bottom navigation.
   */
  .portal-header-sidebar-toggle {
    display: none !important;
  }

  .portal-header-hub {
    display: grid !important;
  }

  .app-header {
    gap: 6px;
  }

  .app-header .header-title {
    min-width: 0;
  }
}

@media (max-width: 420px) {
  .portal-header-hub {
    width: 34px !important;
    height: 34px !important;
    border-radius: 13px !important;
  }
}
`;