/**
 * app/components/role-portals/shell/portalHistory.ts
 * --------------------------------------------------------------------------
 * ELEEVEON PORTAL HISTORY
 * --------------------------------------------------------------------------
 *
 * Browser-history bridge for role portals.
 *
 * It allows Eleeveon modules and mobile root surfaces to behave like real
 * pages without forcing every existing module into a separate Next.js route.
 *
 * URL examples:
 *
 *   /branch-admin
 *   /branch-admin?surface=explore
 *   /branch-admin?surface=explore&category=people
 *   /branch-admin?screen=students&surface=module
 *   /branch-admin?screen=studentReports&surface=module
 *   /branch-admin?screen=studentReports&surface=screens
 *
 * Browser Back / Android Back then walks naturally through those states.
 */

export type PortalSurface =
  | "home"
  | "explore"
  | "screens"
  | "module";

export type PortalHistoryState = {
  eleeveonPortal: true;

  screen?: string | null;

  surface:
    PortalSurface;

  category?:
    string | null;
};

export function currentPortalUrl() {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  return new URL(
    window.location.href,
  );
}

export function readPortalScreen() {
  const url =
    currentPortalUrl();

  return (
    url?.searchParams.get(
      "screen",
    ) ||
    null
  );
}

export function readPortalSurface():
  PortalSurface {
  const url =
    currentPortalUrl();

  const value =
    url?.searchParams.get(
      "surface",
    );

  if (
    value ===
      "explore" ||
    value ===
      "screens" ||
    value ===
      "module"
  ) {
    return value;
  }

  return "home";
}

export function readExploreCategory() {
  const url =
    currentPortalUrl();

  return (
    url?.searchParams.get(
      "category",
    ) ||
    null
  );
}

function commitPortalHistory(
  url: URL,
  state:
    PortalHistoryState,
  mode:
    "push" |
    "replace",
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  const destination =
    `${url.pathname}${url.search}${url.hash}`;

  if (
    mode ===
    "replace"
  ) {
    window.history.replaceState(
      state,
      "",
      destination,
    );

    return;
  }

  window.history.pushState(
    state,
    "",
    destination,
  );
}

export function writePortalModuleHistory(args: {
  screen: string;
  homeKey: string;

  mode?:
    "push" |
    "replace";
}) {
  const url =
    currentPortalUrl();

  if (!url) {
    return;
  }

  const isHome =
    args.screen ===
    args.homeKey;

  if (
    isHome
  ) {
    url.searchParams.delete(
      "screen",
    );

    url.searchParams.delete(
      "surface",
    );

    url.searchParams.delete(
      "category",
    );
  } else {
    url.searchParams.set(
      "screen",
      args.screen,
    );

    url.searchParams.set(
      "surface",
      "module",
    );

    url.searchParams.delete(
      "category",
    );
  }

  commitPortalHistory(
    url,
    {
      eleeveonPortal:
        true,

      screen:
        isHome
          ? null
          : args.screen,

      surface:
        isHome
          ? "home"
          : "module",

      category:
        null,
    },
    args.mode ||
      "push",
  );
}

export function writePortalSurfaceHistory(args: {
  surface:
    "home" |
    "explore" |
    "screens";

  mode?:
    "push" |
    "replace";
}) {
  const url =
    currentPortalUrl();

  if (!url) {
    return;
  }

  if (
    args.surface ===
    "home"
  ) {
    url.searchParams.delete(
      "screen",
    );

    url.searchParams.delete(
      "surface",
    );

    url.searchParams.delete(
      "category",
    );
  } else {
    url.searchParams.set(
      "surface",
      args.surface,
    );

    if (
      args.surface !==
      "explore"
    ) {
      url.searchParams.delete(
        "category",
      );
    }
  }

  commitPortalHistory(
    url,
    {
      eleeveonPortal:
        true,

      screen:
        url.searchParams.get(
          "screen",
        ),

      surface:
        args.surface,

      category:
        url.searchParams.get(
          "category",
        ),
    },
    args.mode ||
      "push",
  );
}

export function writeExploreCategoryHistory(args: {
  category:
    string | null;

  mode?:
    "push" |
    "replace";
}) {
  const url =
    currentPortalUrl();

  if (!url) {
    return;
  }

  url.searchParams.set(
    "surface",
    "explore",
  );

  if (
    args.category
  ) {
    url.searchParams.set(
      "category",
      args.category,
    );
  } else {
    url.searchParams.delete(
      "category",
    );
  }

  commitPortalHistory(
    url,
    {
      eleeveonPortal:
        true,

      screen:
        url.searchParams.get(
          "screen",
        ),

      surface:
        "explore",

      category:
        args.category,
    },
    args.mode ||
      "push",
  );
}