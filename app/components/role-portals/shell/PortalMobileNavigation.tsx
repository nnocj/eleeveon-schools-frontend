"use client";

/**
 * app/components/role-portals/shell/PortalMobileNavigation.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON MOBILE ROOT NAVIGATION
 * --------------------------------------------------------------------------
 *
 * Mobile portal navigation is built around three permanent root destinations:
 *
 *   Home · Explore · Screens
 *
 * HOME
 * - Returns to the role dashboard/home.
 * - Shows the most relevant information for the current role.
 *
 * EXPLORE
 * - Replaces the old mobile sidebar.
 * - Presents the portal's modules as visual categories.
 * - Users move from category -> module.
 * - Eleeveon Hub does not live inside Explore.
 *
 * SCREENS
 * - Keeps track of recently opened/current working modules.
 * - Allows the user to quickly return to recent work.
 * - "Add screen" opens Explore so another module can be selected.
 *
 * MOBILE OVERLAYS
 * - Explore and Screens are fixed application-level surfaces.
 * - They fill the usable area between the fixed portal header and
 *   the fixed bottom navigation.
 * - The page underneath is scroll-locked while either surface is open.
 *
 * ELEEVEON HUB
 * - Hub lives in the account/workspace experience rather than Explore.
 * - The account/workspace drawer can dispatch "eleeveon:open-hub".
 *
 * SCROLL OWNERSHIP
 * - Home and normal modules use the document's single scroll.
 * - Explore and Screens temporarily own scrolling only while their
 *   fixed overlay is open.
 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  RoleNavSection,
} from "../RolePortalShell";

import PortalExplore from "./PortalExplore";
import PortalScreens from "./PortalScreens";

import PortalMobileBottomNav, {
  type PortalMobileRootTab,
} from "./PortalMobileBottomNav";

import {
  usePortalScreens,
} from "./usePortalScreens";

export interface PortalMobileNavigationProps {
  portalTitle: string;

  activeInstitutionName?: string | null;
  activeBranchName?: string | null;

  activeTab: string;
  homeKey: string;
  hubKey: string;

  sections: RoleNavSection[];

  hubUnreadCount?: number;
  hubHasAttention?: boolean;

  onNavigate(
    key: string,
  ): void;

  onOpenHub(): void;
}

type OverlayMode =
  | "explore"
  | "screens"
  | null;

export default function PortalMobileNavigation({
  portalTitle,

  activeInstitutionName,
  activeBranchName,

  activeTab,
  homeKey,
  hubKey,

  sections,

  hubUnreadCount = 0,
  hubHasAttention = false,

  onNavigate,
  onOpenHub,
}: PortalMobileNavigationProps) {
  /**
   * Root bottom-navigation selection.
   *
   * If the portal opens directly on Home, Home is active.
   * If it opens on another module, Explore represents the
   * module/navigation side of the portal.
   */
  const [
    rootTab,
    setRootTab,
  ] =
    useState<PortalMobileRootTab>(
      activeTab === homeKey
        ? "home"
        : "explore",
    );

  /**
   * Explore and Screens are temporary full mobile surfaces.
   *
   * null = normal portal module/home is visible.
   */
  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayMode>(
      null,
    );

  const overlayOpen =
    overlay !== null;

  /**
   * Build a lookup table for module names.
   *
   * Screens uses these labels when remembering recently
   * opened modules.
   */
  const labels =
    useMemo(() => {
      const out:
        Record<
          string,
          string
        > =
        {};

      sections.forEach(
        (
          section,
        ) =>
          section.items.forEach(
            (
              item,
            ) => {
              out[
                item.key
              ] =
                item.label;
            },
          ),
      );

      out[
        hubKey
      ] =
        "Eleeveon Hub";

      return out;
    }, [
      sections,
      hubKey,
    ]);

  /**
   * Build a second lookup containing each module's category.
   *
   * Example:
   * Students -> People
   * Fees -> Finance
   * Announcements -> Communication
   */
  const groups =
    useMemo(() => {
      const out:
        Record<
          string,
          string
        > =
        {};

      sections.forEach(
        (
          section,
        ) =>
          section.items.forEach(
            (
              item,
            ) => {
              out[
                item.key
              ] =
                section.title;
            },
          ),
      );

      out[
        hubKey
      ] =
        "Messages, notices and support";

      return out;
    }, [
      sections,
      hubKey,
    ]);

  /**
   * Screens history should remain scoped to the current
   * portal/institution/branch rather than leaking across
   * unrelated workspaces.
   */
  const screenScope =
    useMemo(
      () =>
        [
          portalTitle,

          activeInstitutionName ||
            "institution",

          activeBranchName ||
            "workspace",
        ].join(
          "|",
        ),
      [
        portalTitle,
        activeInstitutionName,
        activeBranchName,
      ],
    );

  const {
    screens,
    touchScreen,
    removeScreen,
    clearScreens,
  } =
    usePortalScreens(
      screenScope,
    );

  /**
   * ------------------------------------------------------------------------
   * LOCK THE UNDERLYING DOCUMENT WHILE EXPLORE OR SCREENS IS OPEN
   * ------------------------------------------------------------------------
   *
   * Explore and Screens are app-level mobile surfaces.
   *
   * The Home dashboard or module underneath them must not continue
   * scrolling while the user scrolls one of these overlays.
   *
   * We deliberately do NOT use position: fixed on body because doing
   * so can cause the document to jump back to the top or lose its
   * previous scroll position.
   *
   * Instead, overflow is temporarily disabled and restored exactly
   * when the overlay closes.
   */
  useEffect(() => {
    if (
      !overlayOpen ||
      typeof document ===
        "undefined"
    ) {
      return;
    }

    const html =
      document.documentElement;

    const body =
      document.body;

    const previousHtmlOverflow =
      html.style.overflow;

    const previousHtmlOverflowY =
      html.style.overflowY;

    const previousBodyOverflow =
      body.style.overflow;

    const previousBodyOverflowY =
      body.style.overflowY;

    const previousBodyTouchAction =
      body.style.touchAction;

    html.style.overflow =
      "hidden";

    html.style.overflowY =
      "hidden";

    body.style.overflow =
      "hidden";

    body.style.overflowY =
      "hidden";

    body.style.touchAction =
      "none";

    return () => {
      html.style.overflow =
        previousHtmlOverflow;

      html.style.overflowY =
        previousHtmlOverflowY;

      body.style.overflow =
        previousBodyOverflow;

      body.style.overflowY =
        previousBodyOverflowY;

      body.style.touchAction =
        previousBodyTouchAction;
    };
  }, [
    overlayOpen,
  ]);

  /**
   * ------------------------------------------------------------------------
   * KEEP SCREENS AWARE OF VISITED MODULES
   * ------------------------------------------------------------------------
   *
   * Home is not treated as a working screen.
   *
   * Whenever another portal module becomes active we remember it
   * automatically so the user can return through Screens.
   */
  useEffect(() => {
    if (
      activeTab ===
      homeKey
    ) {
      if (
        !overlay
      ) {
        setRootTab(
          "home",
        );
      }

      return;
    }

    /**
     * A module is open outside Home.
     *
     * Explore represents the navigation/module side of the
     * application unless Screens itself is currently open.
     */
    if (
      rootTab ===
        "home" &&
      !overlay
    ) {
      setRootTab(
        "explore",
      );
    }

    const label =
      labels[
        activeTab
      ];

    if (
      !label
    ) {
      return;
    }

    touchScreen(
      activeTab,

      label,

      groups[
        activeTab
      ] ||
        "Workspace",
    );
  }, [
    activeTab,
    homeKey,
    labels,
    groups,
    overlay,
    rootTab,
    touchScreen,
  ]);

  /**
   * ------------------------------------------------------------------------
   * GLOBAL ELEEVEON HUB BRIDGE
   * ------------------------------------------------------------------------
   *
   * Eleeveon Hub is no longer part of Explore.
   *
   * The account/workspace drawer can dispatch:
   *
   *   eleeveon:open-hub
   *
   * This closes any mobile overlay and opens Hub using the
   * RolePortalShell-provided handler.
   */
  useEffect(() => {
    const openHub =
      () => {
        setOverlay(
          null,
        );

        /**
         * Hub is not one of the three bottom-navigation roots.
         *
         * Keep Explore selected because Hub belongs to the broader
         * workspace/application area rather than Home.
         */
        setRootTab(
          "explore",
        );

        onOpenHub();
      };

    window.addEventListener(
      "eleeveon:open-hub",
      openHub,
    );

    return () => {
      window.removeEventListener(
        "eleeveon:open-hub",
        openHub,
      );
    };
  }, [
    onOpenHub,
  ]);

  /**
   * ------------------------------------------------------------------------
   * HOME
   * ------------------------------------------------------------------------
   */
  const openHome =
    () => {
      setOverlay(
        null,
      );

      setRootTab(
        "home",
      );

      if (
        activeTab !==
        homeKey
      ) {
        onNavigate(
          homeKey,
        );
      }
    };

  /**
   * ------------------------------------------------------------------------
   * EXPLORE
   * ------------------------------------------------------------------------
   *
   * Opens the visual replacement for the old mobile sidebar.
   */
  const openExplore =
    () => {
      setRootTab(
        "explore",
      );

      setOverlay(
        "explore",
      );
    };

  /**
   * ------------------------------------------------------------------------
   * SCREENS
   * ------------------------------------------------------------------------
   */
  const openScreens =
    () => {
      setRootTab(
        "screens",
      );

      setOverlay(
        "screens",
      );
    };

  /**
   * A module was selected from Explore.
   *
   * Close Explore, keep Explore selected in the root navigation,
   * then let RolePortalShell open the chosen module.
   */
  const openFromExplore =
    (
      key: string,
    ) => {
      setRootTab(
        "explore",
      );

      setOverlay(
        null,
      );

      onNavigate(
        key,
      );
    };

  /**
   * A remembered module was selected from Screens.
   *
   * Screens closes after selection while remaining the most
   * recently used root destination.
   */
  const openFromScreens =
    (
      key: string,
    ) => {
      setRootTab(
        "screens",
      );

      setOverlay(
        null,
      );

      if (
        key ===
        hubKey
      ) {
        onOpenHub();

        return;
      }

      onNavigate(
        key,
      );
    };

  return (
    <div className="portal-mobile-navigation">
      {overlay ===
      "explore" ? (
        <section
          className="portal-mobile-overlay portal-mobile-explore-overlay"
          aria-label="Explore"
        >
          <PortalExplore
            sections={
              sections
            }

            homeKey={
              homeKey
            }

            activeKey={
              activeTab
            }

            hubUnreadCount={
              hubUnreadCount
            }

            hubHasAttention={
              hubHasAttention
            }

            onNavigate={
              openFromExplore
            }
          />
        </section>
      ) : null}

      {overlay ===
      "screens" ? (
        <section
          className="portal-mobile-overlay portal-mobile-screens-overlay"
          aria-label="Screens"
        >
          <PortalScreens
            screens={
              screens
            }

            activeKey={
              activeTab
            }

            onOpenScreen={
              openFromScreens
            }

            onRemoveScreen={
              removeScreen
            }

            onClearScreens={
              clearScreens
            }

            /**
             * Adding another working screen begins in Explore.
             */
            onAddScreen={
              openExplore
            }
          />
        </section>
      ) : null}

      <PortalMobileBottomNav
        active={
          rootTab
        }

        onHome={
          openHome
        }

        onExplore={
          openExplore
        }

        onScreens={
          openScreens
        }
      />

      <style>
        {
          css
        }
      </style>
    </div>
  );
}

const css = `
.portal-mobile-navigation {
  display:
    none;
}


/* ========================================================================
   MOBILE ROOT NAVIGATION
   ======================================================================== */

@media (
  max-width:
    979px
) {
  /**
   * The desktop/sidebar navigation disappears completely on mobile.
   *
   * Explore is now the mobile replacement for that sidebar.
   */
  .app-sidebar {
    display:
      none !important;
  }

  .portal-mobile-navigation {
    display:
      block;
  }


  /**
   * ----------------------------------------------------------------------
   * EXPLORE + SCREENS OVERLAY SURFACE
   * ----------------------------------------------------------------------
   *
   * Both root surfaces occupy exactly the usable space between:
   *
   *   fixed portal header
   *          ↓
   *   Explore / Screens
   *          ↓
   *   fixed bottom navigation
   *
   * Each overlay owns its own scrolling while it is open.
   */
  .portal-mobile-overlay {
    position:
      fixed;

    top:
      calc(
        var(
          --eds-shell-top-offset,
          0px
        )
        +
        var(
          --portal-header-height,
          48px
        )
      );

    left:
      0;

    right:
      0;

    bottom:
      calc(
        64px
        +
        env(
          safe-area-inset-bottom,
          0px
        )
      );

    z-index:
      55;

    width:
      100%;

    min-width:
      0;

    overflow-x:
      hidden;

    overflow-y:
      auto;

    overscroll-behavior:
      contain;

    -webkit-overflow-scrolling:
      touch;

    touch-action:
      pan-y;

    background:
      var(
        --eds-shell-bg,
        var(
          --bg,
          #f7f8fb
        )
      );

    color:
      var(
        --eds-text,
        var(
          --text,
          #111827
        )
      );
  }


  /**
   * Explore and Screens intentionally share the same geometry.
   *
   * Individual classes are retained so either surface can receive
   * specialised styling later without changing the navigation API.
   */
  .portal-mobile-explore-overlay,
  .portal-mobile-screens-overlay {
    height:
      auto;
  }


  /**
   * ----------------------------------------------------------------------
   * NORMAL HOME / MODULE CONTENT
   * ----------------------------------------------------------------------
   *
   * Home and ordinary modules remain part of the normal document
   * and use the application's single page scroll.
   *
   * Extra bottom space prevents the fixed Home / Explore / Screens
   * navigation from covering the final content.
   */
  .app-content {
    padding-bottom:
      calc(
        82px
        +
        env(
          safe-area-inset-bottom,
          0px
        )
      ) !important;
  }


  /**
   * Keep the background refresh indicator above the fixed
   * Home / Explore / Screens navigation.
   */
  .background-refresh-indicator {
    bottom:
      calc(
        78px
        +
        env(
          safe-area-inset-bottom,
          0px
        )
      ) !important;
  }
}
`;