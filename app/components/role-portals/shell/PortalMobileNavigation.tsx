"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  RoleNavSection,
} from "../RolePortalShell";

import PortalLibrary from "./PortalLibrary";
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
  | "library"
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
  const [
    rootTab,
    setRootTab,
  ] =
    useState<PortalMobileRootTab>(
      activeTab === homeKey
        ? "home"
        : "library",
    );

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayMode>(
      null,
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
   * -----------------------------------------------------
   * LOCK UNDERLYING PAGE SCROLL
   * -----------------------------------------------------
   *
   * Library and Screens are app-level root surfaces.
   * Home or another module underneath them must not keep
   * moving while the user scrolls Library/Screens.
   *
   * We deliberately avoid position:fixed on body so the
   * underlying document keeps its exact scroll position.
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
   * Keep Screens automatically aware of visited modules.
   */
  useEffect(() => {
    if (
      activeTab ===
      homeKey
    ) {
      if (!overlay) {
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
        "library",
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
   * Global Eleeveon Hub bridge.
   *
   * The account/workspace drawer can dispatch this event,
   * allowing Hub to open from either mobile or desktop.
   */
  useEffect(() => {
    const openHub =
      () => {
        setOverlay(
          null,
        );

        setRootTab(
          "library",
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
        onNavigate(
          homeKey,
        );
      }
    };

  const openLibrary =
    () => {
      setRootTab(
        "library",
      );

      setOverlay(
        "library",
      );
    };

  const openScreens =
    () => {
      setRootTab(
        "screens",
      );

      setOverlay(
        "screens",
      );
    };

  const openFromLibrary =
    (
      key: string,
    ) => {
      setRootTab(
        "library",
      );

      setOverlay(
        null,
      );

      onNavigate(
        key,
      );
    };

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
        key === hubKey
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
      "library" ? (
        <section
          className="portal-mobile-overlay"
          aria-label="Library"
        >
          <PortalLibrary
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
              openFromLibrary
            }
          />
        </section>
      ) : null}

      {overlay ===
      "screens" ? (
        <section
          className="portal-mobile-overlay"
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
              openLibrary
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
        onLibrary={
          openLibrary
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
  max-width: 979px
) {
  /*
   * Mobile completely removes the old sidebar.
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
   * Library and Screens fill the usable area between
   * the fixed header and fixed bottom navigation.
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
        var(--bg, #f7f8fb)
      );

    color:
      var(
        --eds-text,
        var(--text, #111827)
      );
  }

  /*
   * Normal modules need enough bottom room so the fixed
   * navigation never covers their final content.
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