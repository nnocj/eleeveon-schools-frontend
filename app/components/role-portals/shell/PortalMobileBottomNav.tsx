"use client";

export type PortalMobileRootTab =
  | "home"
  | "library"
  | "screens";

export interface PortalMobileBottomNavProps {
  active: PortalMobileRootTab;

  onHome(): void;
  onLibrary(): void;
  onScreens(): void;
}

// ======================================================
// HOME ICON
// ======================================================

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M3.8 10.6 12 3.8l8.2 6.8v9a1.4 1.4 0 0 1-1.4 1.4h-4.2v-6.2H9.4V21H5.2a1.4 1.4 0 0 1-1.4-1.4v-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ======================================================
// LIBRARY ICON
// ======================================================

function LibraryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="4"
        width="5"
        height="16"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <rect
        x="10"
        y="2.5"
        width="4.8"
        height="17.5"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="m16.7 5.2 2.9-.8 3.1 13.4-3 .7-3-13.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ======================================================
// SCREENS ICON
// ======================================================

function ScreensIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="3"
        width="12"
        height="14"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <rect
        x="8"
        y="7"
        width="12"
        height="14"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

// ======================================================
// MOBILE BOTTOM NAVIGATION
// ======================================================

export default function PortalMobileBottomNav({
  active,

  onHome,
  onLibrary,
  onScreens,
}: PortalMobileBottomNavProps) {
  return (
    <nav
      className="portal-mobile-bottom-nav"
      aria-label="Portal navigation"
    >
      {/* HOME */}
      <button
        type="button"
        className={
          active === "home"
            ? "active"
            : ""
        }
        onClick={onHome}
        aria-current={
          active === "home"
            ? "page"
            : undefined
        }
      >
        <span className="portal-bottom-nav-icon">
          <HomeIcon />
        </span>

        <strong>
          Home
        </strong>
      </button>

      {/* LIBRARY */}
      <button
        type="button"
        className={
          active === "library"
            ? "active"
            : ""
        }
        onClick={onLibrary}
        aria-current={
          active === "library"
            ? "page"
            : undefined
        }
      >
        <span className="portal-bottom-nav-icon">
          <LibraryIcon />
        </span>

        <strong>
          Library
        </strong>
      </button>

      {/* SCREENS */}
      <button
        type="button"
        className={
          active === "screens"
            ? "active"
            : ""
        }
        onClick={onScreens}
        aria-current={
          active === "screens"
            ? "page"
            : undefined
        }
      >
        <span className="portal-bottom-nav-icon">
          <ScreensIcon />
        </span>

        <strong>
          Screens
        </strong>
      </button>

      <style>
        {css}
      </style>
    </nav>
  );
}

const css = `
/*
 * =====================================================
 * DESKTOP
 * =====================================================
 *
 * Bottom navigation belongs only to the mobile portal.
 */
.portal-mobile-bottom-nav {
  display:
    none;
}

/*
 * =====================================================
 * MOBILE / TABLET
 * =====================================================
 */
@media (
  max-width: 979px
) {
  .portal-mobile-bottom-nav {
    /*
     * Permanently pin the navigation to the viewport.
     *
     * !important prevents older shell/navigation rules
     * from accidentally changing the positioning.
     */
    position:
      fixed !important;

    left:
      0 !important;

    right:
      0 !important;

    bottom:
      0 !important;

    top:
      auto !important;

    width:
      100% !important;

    max-width:
      100vw !important;

    margin:
      0 !important;

    transform:
      none !important;

    /*
     * Keep it above portal content and mobile overlays.
     */
    z-index:
      60 !important;

    /*
     * Normal navigation height plus phone safe area.
     */
    min-height:
      64px;

    height:
      calc(
        64px +
        env(
          safe-area-inset-bottom,
          0px
        )
      );

    display:
      grid !important;

    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );

    align-items:
      start;

    padding:
      4px
      10px
      env(
        safe-area-inset-bottom,
        0px
      );

    box-sizing:
      border-box;

    background:
      color-mix(
        in srgb,
        var(
          --eds-surface,
          var(--surface, #ffffff)
        ) 97%,
        transparent
      );

    border-top:
      1px solid
      var(
        --eds-divider,
        var(
          --border,
          rgba(0,0,0,.08)
        )
      );

    /*
     * Slight glass effect while content moves behind it.
     */
    -webkit-backdrop-filter:
      blur(18px);

    backdrop-filter:
      blur(18px);

    box-shadow:
      0 -7px 24px
      rgba(
        15,
        23,
        42,
        .07
      );

    /*
     * Keep navigation stable while the page scrolls.
     */
    overflow:
      hidden;

    overscroll-behavior:
      none;

    touch-action:
      manipulation;
  }

  /*
   * ===================================================
   * NAV BUTTON
   * ===================================================
   */
  .portal-mobile-bottom-nav
  > button {
    min-width:
      0;

    height:
      56px;

    display:
      grid;

    grid-template-rows:
      31px auto;

    place-items:
      center;

    align-content:
      start;

    gap:
      1px;

    border:
      0;

    border-radius:
      15px;

    padding:
      3px 4px;

    margin:
      0;

    background:
      transparent;

    color:
      var(
        --eds-text-muted,
        var(
          --muted,
          #5f6877
        )
      );

    cursor:
      pointer;

    -webkit-tap-highlight-color:
      transparent;
  }

  /*
   * ===================================================
   * ICON AREA
   * ===================================================
   */
  .portal-bottom-nav-icon {
    width:
      46px;

    height:
      31px;

    display:
      grid;

    place-items:
      center;

    border-radius:
      16px;

    transition:
      background-color
      .16s ease,
      color
      .16s ease;
  }

  .portal-mobile-bottom-nav
  svg {
    width:
      23px;

    height:
      23px;

    display:
      block;
  }

  /*
   * ===================================================
   * LABEL
   * ===================================================
   */
  .portal-mobile-bottom-nav
  strong {
    max-width:
      100%;

    overflow:
      hidden;

    text-overflow:
      ellipsis;

    white-space:
      nowrap;

    font-size:
      10px;

    line-height:
      1.1;

    font-weight:
      800;
  }

  /*
   * ===================================================
   * ACTIVE NAV ITEM
   * ===================================================
   */
  .portal-mobile-bottom-nav
  > button.active {
    color:
      var(
        --eds-primary,
        var(
          --primary-color,
          #2563eb
        )
      );
  }

  .portal-mobile-bottom-nav
  > button.active
  .portal-bottom-nav-icon {
    background:
      color-mix(
        in srgb,
        var(
          --eds-primary,
          var(
            --primary-color,
            #2563eb
          )
        ) 12%,
        transparent
      );
  }

  /*
   * ===================================================
   * PRESSED STATE
   * ===================================================
   */
  .portal-mobile-bottom-nav
  > button:active
  .portal-bottom-nav-icon {
    transform:
      scale(.96);
  }
}

/*
 * =====================================================
 * VERY SMALL PHONES
 * =====================================================
 */
@media (
  max-width: 360px
) {
  .portal-mobile-bottom-nav {
    padding-left:
      5px;

    padding-right:
      5px;
  }

  .portal-bottom-nav-icon {
    width:
      40px;
  }

  .portal-mobile-bottom-nav
  strong {
    font-size:
      9px;
  }
}
`;