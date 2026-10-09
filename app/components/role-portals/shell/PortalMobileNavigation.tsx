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

  onNavigate(key: string): void;
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

  useEffect(() => {
    if (
      activeTab === homeKey
    ) {
      if (!overlay) {
        setRootTab(
          "home",
        );
      }

      return;
    }

    if (
      rootTab === "home" &&
      !overlay
    ) {
      setRootTab(
        "library",
      );
    }

    const label =
      labels[activeTab];

    if (!label) {
      return;
    }

    touchScreen(
      activeTab,
      label,
      groups[activeTab] ||
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

  useEffect(() => {
    const openHub = () => {
      setOverlay(null);

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
  }, [onOpenHub]);

  const openHome = () => {
    setOverlay(null);

    setRootTab(
      "home",
    );

    if (
      activeTab !== homeKey
    ) {
      onNavigate(
        homeKey,
      );
    }
  };

  const openLibrary = () => {
    setRootTab(
      "library",
    );

    setOverlay(
      "library",
    );
  };

  const openScreens = () => {
    setRootTab(
      "screens",
    );

    setOverlay(
      "screens",
    );
  };

  const openFromLibrary =
    (key: string) => {
      setRootTab(
        "library",
      );

      setOverlay(null);

      onNavigate(
        key,
      );
    };

  const openFromScreens =
    (key: string) => {
      setRootTab(
        "screens",
      );

      setOverlay(null);

      if (
        key === hubKey
      ) {
        onOpenHub();
      } else {
        onNavigate(
          key,
        );
      }
    };

  const openHubFromLibrary =
    () => {
      setRootTab(
        "library",
      );

      setOverlay(null);

      onOpenHub();
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
            onOpenHub={
              openHubFromLibrary
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

      <style>{css}</style>
    </div>
  );
}

const css = `
.portal-mobile-navigation {
  display: none;
}

@media (max-width: 979px) {
  /*
   * Mobile navigation is no longer a drawer/sidebar.
   * The desktop sidebar remains mounted for desktop,
   * but it disappears completely on phone/tablet.
   */
  .app-sidebar {
    display: none !important;
  }

  .portal-mobile-navigation {
    display: block;
  }

  /*
   * Library and Screens are root surfaces underneath
   * the global portal header and above the bottom nav.
   */
  .portal-mobile-overlay {
    position: fixed;

    top:
      var(
        --portal-header-height,
        48px
      );

    left: 0;
    right: 0;

    bottom:
      calc(
        66px +
        env(
          safe-area-inset-bottom
        )
      );

    z-index: 26;

    overflow-x: hidden;
    overflow-y: auto;

    overscroll-behavior: contain;

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
   * Normal module content must never disappear under
   * the persistent bottom navigation.
   */
  .app-content {
    padding-bottom:
      calc(
        82px +
        env(
          safe-area-inset-bottom
        )
      ) !important;
  }

  .background-refresh-indicator {
    bottom:
      calc(
        78px +
        env(
          safe-area-inset-bottom
        )
      ) !important;
  }

  /*
   * If a stale mobile sidebar-open state exists from an
   * earlier build, do not leave a dark overlay blocking
   * the app. The account drawer still receives the same
   * overlay because it sits above this layer.
   */
  .role-shell
  > .app-overlay {
    z-index: 40;
  }
}
`;