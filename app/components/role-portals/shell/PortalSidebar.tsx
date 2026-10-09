"use client";

import type {
  MouseEvent,
  ReactElement,
  ReactNode,
} from "react";

import type {
  RoleNavSection,
} from "../RolePortalShell";

import {
  BrandGlow,
  BrandPattern,
  BrandTexture,
} from "../../branding";

import type {
  EleeveonIconName,
} from "../../icons";

import NavigationGroup from "./NavigationGroup";
import SidebarWorkspace from "./SidebarWorkspace";

import PortalMobileNavigation from "./PortalMobileNavigation";
import PortalSearchBridge from "./PortalSearchBridge";

export interface PortalSidebarProps {
  open: boolean;
  hidden: boolean;

  portalTitle: string;
  portalSubtitle: string;

  activeInstitutionName?: string | null;
  activeBranchName?: string | null;

  hubUnreadCount?: number;
  hubHasAttention?: boolean;
  hubKey: string;

  activeTab: string;
  homeKey: string;

  sections: RoleNavSection[];

  openSections:
    Record<string, boolean>;

  footer?: ReactNode;

  onNavigate(
    key: string,
  ): void;

  onOpenHub(): void;

  onToggleSection(
    title: string,
  ): void;

  onResizeStart(
    event: MouseEvent,
  ): void;
}

type ResolvedNavigationIcon =
  | EleeveonIconName
  | ReactElement;

const ICON_ALIASES:
  Record<
    string,
    EleeveonIconName
  > = {
    dashboard: "dashboard",
    home: "dashboard",

    students: "student",
    student: "student",

    teachers: "teacher",
    teacher: "teacher",

    parents: "parent",
    parent: "parent",

    attendance: "attendance",

    assessment: "assessment",
    assessments: "assessment",

    reports: "reports",
    report: "reports",

    calendar: "calendar",
    timetable: "timetable",

    finance: "finance",

    communication: "communication",
    communications: "communication",

    messages: "communication",
    message: "communication",

    announcements: "communication",
    announcement: "communication",

    workspace: "workspace",

    settings: "settings",
    setting: "settings",

    sync: "sync",

    devices: "device",
    device: "device",

    school: "school",
    schools: "school",

    branches: "branch",
    branch: "branch",
  };

function resolveIcon(
  key: string,
  label: string,
  legacyIcon?: ReactNode,
): ResolvedNavigationIcon {
  const normalized = [
    key,
    label,
  ]
    .join(" ")
    .toLowerCase();

  for (
    const [
      needle,
      icon,
    ] of
    Object.entries(
      ICON_ALIASES,
    )
  ) {
    if (
      normalized.includes(
        needle,
      )
    ) {
      return icon;
    }
  }

  if (
    legacyIcon !== null &&
    legacyIcon !== undefined &&
    legacyIcon !== false
  ) {
    return (
      <span
        className="shell-nav-legacy-icon"
        aria-hidden="true"
      >
        {legacyIcon}
      </span>
    );
  }

  return (
    <span
      className="shell-nav-legacy-icon"
      aria-hidden="true"
    >
      •
    </span>
  );
}

export default function PortalSidebar({
  open,
  hidden,

  portalTitle,
  portalSubtitle,

  activeInstitutionName,
  activeBranchName,

  hubUnreadCount = 0,
  hubHasAttention = false,
  hubKey,

  activeTab,
  homeKey,

  sections,
  openSections,

  footer,

  onNavigate,
  onOpenHub,
  onToggleSection,
  onResizeStart,
}: PortalSidebarProps) {
  void portalSubtitle;

  return (
    <>
      {/* ==================================================
       * DESKTOP SIDEBAR
       * ================================================== */}

      <aside
        data-surface="role-sidebar"
        className={[
          "app-sidebar",
          "shell-sidebar",
          "eds-sidebar-surface",

          open &&
            "open",

          hidden &&
            "hidden",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <BrandGlow />

        <BrandPattern />

        <BrandTexture />

        <div className="shell-sidebar-inner">
          <header className="sidebar-head shell-sidebar-head shell-hub-head">
            <SidebarWorkspace
              unreadCount={
                hubUnreadCount
              }
              attention={
                hubHasAttention
              }
              active={
                activeTab ===
                hubKey
              }
              onOpen={
                onOpenHub
              }
            />
          </header>

          <nav
            className="nav-list shell-nav-list"
            aria-label={`${portalTitle} navigation`}
          >
            {sections.map(
              (section) => (
                <NavigationGroup
                  key={
                    section.title
                  }
                  title={
                    section.title
                  }
                  open={
                    openSections[
                      section.title
                    ] !== false
                  }
                  activeKey={
                    activeTab
                  }
                  items={
                    section.items.map(
                      (item) => ({
                        key:
                          item.key,

                        label:
                          item.label,

                        icon:
                          resolveIcon(
                            item.key,
                            item.label,
                            item.icon,
                          ),
                      }),
                    )
                  }
                  onToggle={() =>
                    onToggleSection(
                      section.title,
                    )
                  }
                  onNavigate={
                    onNavigate
                  }
                />
              ),
            )}
          </nav>

          {footer ? (
            <footer className="shell-sidebar-footer">
              {footer}
            </footer>
          ) : null}
        </div>

        <button
          type="button"
          className="sidebar-resize-handle"
          aria-label="Resize sidebar"
          onMouseDown={
            onResizeStart
          }
        />
      </aside>

      {/* ==================================================
       * GLOBAL PORTAL SEARCH
       * ==================================================
       *
       * PortalHeader communicates with this bridge using
       * browser events. NAV_SECTIONS remains authoritative.
       */}

      <PortalSearchBridge
        sections={
          sections
        }
        hubKey={
          hubKey
        }
        onNavigate={
          onNavigate
        }
        onOpenHub={
          onOpenHub
        }
      />

      {/* ==================================================
       * MOBILE NAVIGATION
       * ================================================== */}

      <PortalMobileNavigation
        portalTitle={
          portalTitle
        }
        activeInstitutionName={
          activeInstitutionName
        }
        activeBranchName={
          activeBranchName
        }
        activeTab={
          activeTab
        }
        homeKey={
          homeKey
        }
        hubKey={
          hubKey
        }
        sections={
          sections
        }
        hubUnreadCount={
          hubUnreadCount
        }
        hubHasAttention={
          hubHasAttention
        }
        onNavigate={
          onNavigate
        }
        onOpenHub={
          onOpenHub
        }
      />
    </>
  );
}