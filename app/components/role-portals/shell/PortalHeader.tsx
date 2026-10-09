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
      {image &&
      !failed ? (
        <img
          src={image}
          alt=""
          onError={() =>
            setFailed(
              true,
            )
          }
        />
      ) : (
        initials(
          name,
        )
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
   * Installed desktop Window Controls Overlay already
   * supplies the top chrome.
   *
   * Therefore this fallback portal header is not rendered
   * while that overlay is active.
   */
  if (
    overlayVisible
  ) {
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
   * Mobile Hub access.
   *
   * PortalMobileNavigation listens for this event and
   * opens the existing Eleeveon Center route.
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
      className="app-header eds-header-surface eds-glass-subtle portal-fixed-header"
      data-window-overlay="fallback"
    >
      {/*
       * Desktop sidebar control.
       *
       * Hidden on mobile because mobile navigation uses:
       * Home / Library / Screens.
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
          {
            activeLabel
          }
        </strong>

        <span>
          {
            workspaceLabel
          }
        </span>
      </div>

      {/*
       * Global Eleeveon Hub button on mobile.
       *
       * Hub has now been removed from the Library page,
       * so this header button remains the permanent
       * mobile access point.
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

      {/*
       * Global synchronization / realtime status.
       */}
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

      {/*
       * Global account / workspace access.
       */}
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
            {
              memberName
            }
          </strong>

          <small>
            {
              memberRole
            }
          </small>
        </span>
      </button>

      <style>
        {css}
      </style>
    </header>
  );
}

const css = `
/*
 * =====================================================
 * FIXED PORTAL HEADER
 * =====================================================
 *
 * The header no longer scrolls with the document.
 *
 * RolePortalShell already publishes:
 *
 * --portal-header-height
 * --portal-content-left
 *
 * We use those existing variables instead of introducing
 * another layout system.
 */
.portal-fixed-header {
  position:
    fixed !important;

  top:
    var(
      --eds-shell-top-offset,
      0px
    ) !important;

  left:
    var(
      --portal-content-left,
      0px
    );

  right:
    0;

  width:
    auto !important;

  min-height:
    var(
      --portal-header-height,
      48px
    );

  z-index:
    38 !important;
}

/*
 * Because a fixed element is removed from normal document
 * flow, reserve exactly the same amount of space at the top
 * of the main portal content.
 */
.app-main {
  padding-top:
    var(
      --portal-header-height,
      48px
    );
}

/*
 * Hub remains a mobile-only global action.
 */
.portal-header-hub {
  display:
    none !important;
}

.portal-header-hub svg {
  width:
    19px;

  height:
    19px;
}

/*
 * =====================================================
 * MOBILE / TABLET
 * =====================================================
 */
@media (
  max-width: 979px
) {
  /*
   * Mobile has no permanent sidebar column.
   *
   * The fixed header therefore spans the full viewport.
   */
  .portal-fixed-header {
    left:
      0 !important;

    right:
      0 !important;

    width:
      100% !important;
  }

  /*
   * Sidebar hamburger disappears on mobile.
   */
  .portal-header-sidebar-toggle {
    display:
      none !important;
  }

  /*
   * Hub becomes globally available in the mobile header.
   */
  .portal-header-hub {
    display:
      grid !important;
  }

  .app-header {
    gap:
      6px;
  }

  .app-header
  .header-title {
    min-width:
      0;
  }
}

/*
 * =====================================================
 * VERY SMALL PHONES
 * =====================================================
 */
@media (
  max-width: 420px
) {
  .portal-header-hub {
    width:
      34px !important;

    height:
      34px !important;

    border-radius:
      13px !important;
  }
}
`;