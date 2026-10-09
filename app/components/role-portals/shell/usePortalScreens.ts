"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export type PortalScreen = {
  routeKey: string;
  label: string;
  group: string;

  openedAt: number;
  lastVisitedAt: number;
};

const MAX_SCREENS = 12;

function storageKey(
  scopeKey: string,
) {
  return [
    "eleeveon_portal_screens",
    encodeURIComponent(
      scopeKey || "default",
    ),
  ].join(":");
}

function safeParse(
  raw: string | null,
): PortalScreen[] {
  if (!raw) return [];

  try {
    const parsed =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.routeKey ===
            "string",
      )
      .map((item) => ({
        routeKey:
          String(
            item.routeKey,
          ),

        label:
          String(
            item.label ||
              item.routeKey,
          ),

        group:
          String(
            item.group ||
              "Workspace",
          ),

        openedAt:
          Number(
            item.openedAt ||
              Date.now(),
          ),

        lastVisitedAt:
          Number(
            item.lastVisitedAt ||
              item.openedAt ||
              Date.now(),
          ),
      }))
      .slice(
        0,
        MAX_SCREENS,
      );
  } catch {
    return [];
  }
}

export function usePortalScreens(
  scopeKey: string,
) {
  const key =
    useMemo(
      () =>
        storageKey(
          scopeKey,
        ),
      [scopeKey],
    );

  const [
    screens,
    setScreens,
  ] =
    useState<PortalScreen[]>(
      [],
    );

  const [
    hydrated,
    setHydrated,
  ] =
    useState(false);

  useEffect(() => {
    setHydrated(false);

    if (
      typeof window ===
      "undefined"
    ) {
      setScreens([]);
      setHydrated(true);
      return;
    }

    try {
      setScreens(
        safeParse(
          window.sessionStorage.getItem(
            key,
          ),
        ),
      );
    } catch {
      setScreens([]);
    }

    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (
      !hydrated ||
      typeof window ===
        "undefined"
    ) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        key,
        JSON.stringify(
          screens,
        ),
      );
    } catch {
      // Screen history is a convenience feature.
      // Storage failure must never block the portal.
    }
  }, [
    hydrated,
    key,
    screens,
  ]);

  const touchScreen =
    useCallback(
      (
        routeKey: string,
        label: string,
        group: string,
      ) => {
        const cleanKey =
          String(
            routeKey || "",
          ).trim();

        if (!cleanKey) {
          return;
        }

        const now =
          Date.now();

        setScreens(
          (current) => {
            const existing =
              current.find(
                (item) =>
                  item.routeKey ===
                  cleanKey,
              );

            const next: PortalScreen = {
              routeKey:
                cleanKey,

              label:
                String(
                  label ||
                    cleanKey,
                ),

              group:
                String(
                  group ||
                    "Workspace",
                ),

              openedAt:
                existing?.openedAt ||
                now,

              lastVisitedAt:
                now,
            };

            return [
              next,

              ...current.filter(
                (item) =>
                  item.routeKey !==
                  cleanKey,
              ),
            ].slice(
              0,
              MAX_SCREENS,
            );
          },
        );
      },
      [],
    );

  const removeScreen =
    useCallback(
      (
        routeKey: string,
      ) => {
        setScreens(
          (current) =>
            current.filter(
              (item) =>
                item.routeKey !==
                routeKey,
            ),
        );
      },
      [],
    );

  const clearScreens =
    useCallback(() => {
      setScreens([]);
    }, []);

  return {
    screens,
    touchScreen,
    removeScreen,
    clearScreens,
  };
}

export default usePortalScreens;