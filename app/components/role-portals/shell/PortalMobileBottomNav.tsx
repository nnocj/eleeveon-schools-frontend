"use client";

/**
 * app/components/role-portals/shell/PortalMobileBottomNav.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON MOBILE BOTTOM NAVIGATION
 * --------------------------------------------------------------------------
 *
 * The mobile portal has three permanent root destinations:
 *
 *   Home · Explore · Screens
 *
 * HOME
 * - Opens the role dashboard/home.
 *
 * EXPLORE
 * - Replaces the old mobile sidebar.
 * - Opens the visual portal category browser.
 *
 * SCREENS
 * - Shows current/recent working modules.
 *
 * This component is intentionally presentation-only.
 * PortalMobileNavigation owns all navigation behavior.
 */

export type PortalMobileRootTab =
  | "home"
  | "explore"
  | "screens";

export interface PortalMobileBottomNavProps {
  active: PortalMobileRootTab;

  onHome(): void;

  onExplore(): void;

  onScreens(): void;
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M3.5 10.5 12 3l8.5 7.5" />

      <path d="M5.5 9.5V21h13V9.5" />

      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
      />

      <path d="m14.9 9.1-2 4-4 2 2-4 4-2Z" />
    </svg>
  );
}

function ScreensIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="5"
        width="13"
        height="14"
        rx="2"
      />

      <path d="M8 2h10a2 2 0 0 1 2 2v11" />
    </svg>
  );
}

export default function PortalMobileBottomNav({
  active,
  onHome,
  onExplore,
  onScreens,
}: PortalMobileBottomNavProps) {
  return (
    <nav
      className="portal-mobile-bottom-nav"
      aria-label="Portal navigation"
    >
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
        <span className="portal-mobile-nav-icon">
          <HomeIcon />
        </span>

        <span className="portal-mobile-nav-label">
          Home
        </span>
      </button>

      <button
        type="button"
        className={
          active === "explore"
            ? "active"
            : ""
        }
        onClick={onExplore}
        aria-current={
          active === "explore"
            ? "page"
            : undefined
        }
      >
        <span className="portal-mobile-nav-icon">
          <ExploreIcon />
        </span>

        <span className="portal-mobile-nav-label">
          Explore
        </span>
      </button>

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
        <span className="portal-mobile-nav-icon">
          <ScreensIcon />
        </span>

        <span className="portal-mobile-nav-label">
          Screens
        </span>
      </button>

      <style>
        {css}
      </style>
    </nav>
  );
}

const css = `
.portal-mobile-bottom-nav {
  display:
    none;
}

@media (
  max-width:
    979px
) {
  .portal-mobile-bottom-nav {
    position:
      fixed !important;

    left:
      0 !important;

    right:
      0 !important;

    bottom:
      0 !important;

    z-index:
      60;

    width:
      100%;

    height:
      calc(
        64px +
        env(
          safe-area-inset-bottom,
          0px
        )
      );

    display:
      grid;

    grid-template-columns:
      repeat(
        3,
        minmax(
          0,
          1fr
        )
      );

    align-items:
      start;

    padding:
      5px
      8px
      env(
        safe-area-inset-bottom,
        0px
      );

    border-top:
      1px
      solid
      var(
        --eds-border,
        var(
          --border,
          rgba(
            15,
            23,
            42,
            .09
          )
        )
      );

    background:
      color-mix(
        in srgb,

        var(
          --eds-surface,
          var(
            --surface,
            #ffffff
          )
        )
        95%,

        transparent
      );

    box-shadow:
      0
      -8px
      28px
      rgba(
        15,
        23,
        42,
        .07
      );

    backdrop-filter:
      blur(
        18px
      );

    -webkit-backdrop-filter:
      blur(
        18px
      );
  }

  .portal-mobile-bottom-nav
  > button {
    position:
      relative;

    min-width:
      0;

    height:
      54px;

    display:
      flex;

    flex-direction:
      column;

    align-items:
      center;

    justify-content:
      center;

    gap:
      2px;

    padding:
      2px
      4px;

    border:
      0;

    border-radius:
      16px;

    background:
      transparent;

    color:
      var(
        --eds-text-muted,
        var(
          --muted,
          #64748b
        )
      );

    font:
      inherit;

    cursor:
      pointer;

    -webkit-tap-highlight-color:
      transparent;
  }

  .portal-mobile-nav-icon {
    width:
      40px;

    height:
      28px;

    display:
      grid;

    place-items:
      center;

    border-radius:
      999px;

    transition:
      background
      .16s
      ease,
      color
      .16s
      ease,
      transform
      .16s
      ease;
  }

  .portal-mobile-nav-icon
  svg {
    width:
      21px;

    height:
      21px;

    fill:
      none;

    stroke:
      currentColor;

    stroke-width:
      1.9;

    stroke-linecap:
      round;

    stroke-linejoin:
      round;
  }

  .portal-mobile-nav-label {
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
  .portal-mobile-nav-icon {
    background:
      color-mix(
        in srgb,

        var(
          --eds-primary,
          var(
            --primary-color,
            #2563eb
          )
        )
        13%,

        transparent
      );
  }

  .portal-mobile-bottom-nav
  > button:active
  .portal-mobile-nav-icon {
    transform:
      scale(
        .94
      );
  }
}

@media (
  prefers-reduced-motion:
  reduce
) {
  .portal-mobile-nav-icon {
    transition:
      none;
  }
}
`;