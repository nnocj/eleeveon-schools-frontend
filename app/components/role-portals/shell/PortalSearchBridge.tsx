"use client";

import {
  useEffect,
  useMemo,
} from "react";

import type {
  RoleNavSection,
} from "../RolePortalShell";

export type PortalSearchResult = {
  key: string;
  label: string;
  group: string;
  icon?: string;
};

export interface PortalSearchBridgeProps {
  sections: RoleNavSection[];
  hubKey: string;

  onNavigate(key: string): void;
  onOpenHub(): void;
}

/**
 * PortalSearchBridge
 * ---------------------------------------------------------
 * Connects the fixed portal header search to the role's
 * existing navigation configuration.
 *
 * Important:
 * - NAV_SECTIONS remains the single source of truth.
 * - Search works from every portal page.
 * - No duplicated route list is introduced.
 * - Eleeveon Hub remains searchable even though Hub no
 *   longer appears in the mobile Library.
 */
export default function PortalSearchBridge({
  sections,
  hubKey,
  onNavigate,
  onOpenHub,
}: PortalSearchBridgeProps) {
  const searchItems =
    useMemo<PortalSearchResult[]>(
      () => {
        const items:
          PortalSearchResult[] =
          [];

        sections.forEach(
          (section) => {
            section.items.forEach(
              (item) => {
                items.push({
                  key: item.key,
                  label:
                    item.label,
                  group:
                    section.title,
                  icon:
                    item.icon,
                });
              },
            );
          },
        );

        items.push({
          key: hubKey,
          label:
            "Eleeveon Hub",
          group:
            "Messages, notices and support",
          icon: "◎",
        });

        return items;
      },
      [
        sections,
        hubKey,
      ],
    );

  useEffect(() => {
    const handleSearch =
      (
        event: Event,
      ) => {
        const custom =
          event as CustomEvent<{
            query?: string;
          }>;

        const query =
          String(
            custom.detail?.query ||
              "",
          )
            .trim()
            .toLowerCase();

        const results =
          !query
            ? []
            : searchItems
                .filter(
                  (item) =>
                    [
                      item.label,
                      item.group,
                      item.key,
                    ]
                      .join(" ")
                      .toLowerCase()
                      .includes(
                        query,
                      ),
                )
                .slice(
                  0,
                  12,
                );

        window.dispatchEvent(
          new CustomEvent(
            "eleeveon:portal-search-results",
            {
              detail: {
                query,
                results,
              },
            },
          ),
        );
      };

    const handleOpen =
      (
        event: Event,
      ) => {
        const custom =
          event as CustomEvent<{
            key?: string;
          }>;

        const key =
          String(
            custom.detail?.key ||
              "",
          ).trim();

        if (!key) {
          return;
        }

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

    window.addEventListener(
      "eleeveon:portal-search-query",
      handleSearch,
    );

    window.addEventListener(
      "eleeveon:portal-search-open",
      handleOpen,
    );

    return () => {
      window.removeEventListener(
        "eleeveon:portal-search-query",
        handleSearch,
      );

      window.removeEventListener(
        "eleeveon:portal-search-open",
        handleOpen,
      );
    };
  }, [
    searchItems,
    hubKey,
    onNavigate,
    onOpenHub,
  ]);

  return null;
}