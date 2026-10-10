"use client";

/**
 * app/components/role-portals/shell/PortalMobileNavigation.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON MOBILE ROOT NAVIGATION
 * --------------------------------------------------------------------------
 *
 * Mobile portal navigation has three permanent root destinations:
 *
 *   Home · Explore · Screens
 *
 * HISTORY BEHAVIOUR
 * --------------------------------------------------------------------------
 * These surfaces now participate in the browser's real History API.
 *
 * Example:
 *
 *   Home
 *     ↓
 *   Explore
 *     ↓
 *   People
 *     ↓
 *   Students
 *
 * Android/browser Back:
 *
 *   Students
 *     ↓
 *   People
 *     ↓
 *   Explore
 *     ↓
 *   Home
 *
 * No page reload is required.
 *
 * HOME
 * - Returns to the role dashboard.
 *
 * EXPLORE
 * - Replaces the mobile sidebar.
 * - Presents portal modules as visual categories.
 *
 * SCREENS
 * - Shows recently opened/working modules.
 *
 * SCROLL OWNERSHIP
 * - Normal modules use the document's single scroll.
 * - Explore and Screens own scrolling only while their fixed surface is open.
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

import {
  readPortalSurface,
  writePortalSurfaceHistory,
} from "./portalHistory";

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

function initialRootTab(
  activeTab: string,
  homeKey: string,
): PortalMobileRootTab {
  if (
    typeof window ===
    "undefined"
  ) {
    return activeTab ===
      homeKey
      ? "home"
      : "explore";
  }

  const surface =
    readPortalSurface();

  if (
    surface ===
    "screens"
  ) {
    return "screens";
  }

  if (
    surface ===
      "explore" ||
    activeTab !==
      homeKey
  ) {
    return "explore";
  }

  return "home";
}

function initialOverlay():
  OverlayMode {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  const surface =
    readPortalSurface();

  if (
    surface ===
    "explore"
  ) {
    return "explore";
  }

  if (
    surface ===
    "screens"
  ) {
    return "screens";
  }

  return null;
}

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
  const [
    rootTab,
    setRootTab,
  ] =
    useState<PortalMobileRootTab>(
      () =>
        initialRootTab(
          activeTab,
          homeKey,
        ),
    );

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayMode>(
      () =>
        initialOverlay(),
    );

  const overlayOpen =
    overlay !== null;

  const labels =
    useMemo(() => {
      const out:
        Record<string, string> =
        {};

      sections.forEach(
        (section) =>
          section.items.forEach(
            (item) => {
              out[item.key] =
                item.label;
            },
          ),
      );

      out[hubKey] =
        "Eleeveon Hub";

      return out;
    }, [
      sections,
      hubKey,
    ]);

  const groups =
    useMemo(() => {
      const out:
        Record<string, string> =
        {};

      sections.forEach(
        (section) =>
          section.items.forEach(
            (item) => {
              out[item.key] =
                section.title;
            },
          ),
      );

      out[hubKey] =
        "Messages, notices and support";

      return out;
    }, [
      sections,
      hubKey,
    ]);

  const screenScope =
    useMemo(
      () =>
        [
          portalTitle,

          activeInstitutionName ||
            "institution",

          activeBranchName ||
            "workspace",
        ].join("|"),
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
   * Lock the normal document while Explore or Screens owns the viewport.
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
   * Restore the mobile root surface when the browser/Android Back or
   * Forward button changes the history entry.
   *
   * RolePortalShell independently restores the active module.
   */
  useEffect(() => {
    const handlePopState =
      () => {
        const surface =
          readPortalSurface();

        if (
          surface ===
          "explore"
        ) {
          setRootTab(
            "explore",
          );

          setOverlay(
            "explore",
          );

          return;
        }

        if (
          surface ===
          "screens"
        ) {
          setRootTab(
            "screens",
          );

          setOverlay(
            "screens",
          );

          return;
        }

        setOverlay(
          null,
        );

        setRootTab(
          surface ===
            "home" &&
          activeTab ===
            homeKey
            ? "home"
            : "explore",
        );
      };

    window.addEventListener(
      "popstate",
      handlePopState,
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handlePopState,
      );
    };
  }, [
    activeTab,
    homeKey,
  ]);

  /**
   * Screens automatically remembers visited modules.
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

    if (!label) {
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
   * Eleeveon Hub remains outside Explore.
   */
  useEffect(() => {
    const openHub =
      () => {
        setOverlay(
          null,
        );

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
        /**
         * RolePortalShell owns module/history navigation.
         */
        onNavigate(
          homeKey,
        );

        return;
      }

      /**
       * If Home is already underneath an Explore/Screens overlay,
       * Home still becomes a new browser-history destination.
       */
      writePortalSurfaceHistory({
        surface:
          "home",
      });
    };

  const openExplore =
    () => {
      if (
        overlay ===
        "explore"
      ) {
        return;
      }

      setRootTab(
        "explore",
      );

      setOverlay(
        "explore",
      );

      writePortalSurfaceHistory({
        surface:
          "explore",
      });
    };

  const openScreens =
    () => {
      if (
        overlay ===
        "screens"
      ) {
        return;
      }

      setRootTab(
        "screens",
      );

      setOverlay(
        "screens",
      );

      writePortalSurfaceHistory({
        surface:
          "screens",
      });
    };

  /**
   * Selecting a module from Explore does NOT replace the Explore
   * history entry. RolePortalShell pushes the module after it.
   *
   * This creates:
   *
   *   Explore -> Module
   *
   * so Back returns to Explore.
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
   * Selecting something from Screens behaves the same way:
   *
   *   Screens -> Module
   *
   * therefore Back returns to Screens.
   */
  const openFromScreens =
    (
      key: string,
    ) => {
      setOverlay(
        null,
      );

      if (
        key ===
        hubKey
      ) {
        setRootTab(
          "explore",
        );

        onOpenHub();

        return;
      }

      setRootTab(
        "screens",
      );

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
        {css}
      </style>
    </div>
  );
}

const css = `
.portal-mobile-navigation {
  display:
    none;
}

@media (
  max-width:
    979px
) {
  /*
   * The desktop sidebar is removed on mobile.
   * Explore replaces it.
   */
  .app-sidebar {
    display:
      none !important;
  }

  .portal-mobile-navigation {
    display:
      block;
  }

  /*
   * Explore and Screens occupy the usable area between
   * the portal header and bottom navigation.
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
        64px +
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

  .portal-mobile-explore-overlay,
  .portal-mobile-screens-overlay {
    height:
      auto;
  }

  /*
   * Leave enough room below ordinary module pages for the
   * fixed Home / Explore / Screens navigation.
   */
  .app-content {
    padding-bottom:
      calc(
        82px +
        env(
          safe-area-inset-bottom,
          0px
        )
      ) !important;
  }

  .background-refresh-indicator {
    bottom:
      calc(
        78px +
        env(
          safe-area-inset-bottom,
          0px
        )
      ) !important;
  }
}
`;