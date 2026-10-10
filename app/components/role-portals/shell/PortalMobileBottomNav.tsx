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

function ExploreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5 5.5-2.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <circle
        cx="12"
        cy="12"
        r="1"
        fill="currentColor"
      />
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
      <button
        type="button"
        className={
          active === "home"
            ? "active"
            : ""
        }
        onClick={onHome}
      >
        <span>
          <HomeIcon />
        </span>

        <strong>
          Home
        </strong>
      </button>

      <button
        type="button"
        className={
          active === "library"
            ? "active"
            : ""
        }
        onClick={onLibrary}
      >
        <span>
          <ExploreIcon />
        </span>

        <strong>
          Explore
        </strong>
      </button>

      <button
        type="button"
        className={
          active === "screens"
            ? "active"
            : ""
        }
        onClick={onScreens}
      >
        <span>
          <ScreensIcon />
        </span>

        <strong>
          Screens
        </strong>
      </button>

      <style>{css}</style>
    </nav>
  );
}

const css = `
.portal-mobile-bottom-nav {
  display: none;
}

@media (max-width: 979px) {
  .portal-mobile-bottom-nav {
    position: fixed;

    left: 0;
    right: 0;
    bottom: 0;

    z-index: 80;

    height:
      calc(
        66px +
        env(
          safe-area-inset-bottom,
          0px
        )
      );

    display: grid;

    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );

    align-items: start;

    padding:
      5px 10px
      env(
        safe-area-inset-bottom,
        0px
      );

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

    backdrop-filter:
      blur(18px);

    box-shadow:
      0 -8px 24px
      rgba(15,23,42,.055);
  }

  .portal-mobile-bottom-nav button {
    min-width: 0;

    height: 56px;

    display: grid;

    grid-template-rows:
      31px auto;

    place-items: center;

    align-content: start;

    gap: 1px;

    border: 0;

    border-radius: 16px;

    padding: 3px 4px;

    background: transparent;

    color:
      var(
        --eds-text-muted,
        var(--muted, #5f6877)
      );

    cursor: pointer;
  }

  .portal-mobile-bottom-nav button > span {
    width: 46px;
    height: 31px;

    display: grid;

    place-items: center;

    border-radius: 16px;

    transition:
      background-color .18s ease,
      color .18s ease,
      transform .18s ease;
  }

  .portal-mobile-bottom-nav svg {
    width: 24px;
    height: 24px;

    display: block;
  }

  .portal-mobile-bottom-nav strong {
    max-width: 100%;

    overflow: hidden;

    text-overflow: ellipsis;

    white-space: nowrap;

    font-size: 10px;

    font-weight: 800;

    line-height: 1.1;
  }

  .portal-mobile-bottom-nav button.active {
    color:
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      );
  }

  .portal-mobile-bottom-nav button.active > span {
    background:
      color-mix(
        in srgb,
        var(
          --eds-primary,
          var(--primary-color, #2563eb)
        ) 12%,
        transparent
      );
  }

  .portal-mobile-bottom-nav button:active > span {
    transform: scale(.96);
  }
}
`;