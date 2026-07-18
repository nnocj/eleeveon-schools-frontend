"use client";

/**
 * app/components/GlobalBrandingRuntime.tsx
 * ---------------------------------------------------------
 * GLOBAL BRANDING RUNTIME
 * ---------------------------------------------------------
 *
 * Purpose:
 * - Applies browser-level branding at all times, not only when Branchsettings opens.
 * - Keeps favicon, Apple touch icon, document title and theme-color aligned with
 *   the currently selected workspace.
 *
 * Source order:
 * 1. selected-role workspace session from eleeveon_open_workspace
 * 2. active membership context
 * 3. active school / branch context
 * 4. mediaAssets/mediaBlobs resolved logo for the active school/branch
 * 5. settings context string fallbacks
 * 6. default Eleeveon fallbacks from /public
 *
 * Ownership rule:
 * - Developer/platform roles keep the Eleeveon title and default Eleeveon favicon.
 * - School-facing roles see the active school name as the app title and the school
 *   logo as favicon so the system feels owned by the institution they operate under.
 * - School-facing roles include owner, school_admin, branch_admin, accountant,
 *   teacher, student and parent.
 *
 * Media behavior:
 * - Mirrors app/owner/schools.tsx media resolution.
 * - School-facing roles first resolve school logo from mediaAssets/mediaBlobs.
 * - The lookup uses MediaOwners + MediaFieldKeys to avoid owner/field mismatch.
 * - The fallback mediaId is accepted only when it belongs to the same owner row.
 * - Then falls back to school/branch/settings string logo fields.
 * - Platform roles always use the default Eleeveon favicon.
 * - Runtime favicon links are owned by this component only.
 * - Next.js metadata icon links are never removed or mutated.
 * - Runtime icon URLs are cache-busted so browsers do not keep stale branding.
 * - Falls back to /favicon.ico and /android-chrome-512x512.png.
 * - Does not mutate theme variables, does not write to IndexedDB, and does not
 *   perform any save/sync action.
 *
 * Usage:
 * - Place inside the provider tree, after ActiveBranchProvider and
 *   ActiveMembershipProvider are available.
 */

import { useEffect, useMemo, useState } from "react";

import { db } from "../lib/db";
import {
  MediaOwners,
  MediaFieldKeys,
  getMediaObjectUrl,
  getOwnerFieldMediaAsset,
  revokeMediaObjectUrl,
} from "../lib/media/mediaAssetUtils";

import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useActiveMembership } from "../context/active-membership-context";

// ======================================================
// CONSTANTS
// ======================================================

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const DEFAULT_APP_TITLE = "Eleeveon School Management";
const DEFAULT_FAVICON = "/favicon.ico";
const DEFAULT_APP_ICON = "/android-chrome-512x512.png";
const DEFAULT_APPLE_ICON = "/apple-touch-icon.png";

const SCHOOL_MEDIA_OWNER_TABLE =
  (MediaOwners as any).SCHOOLS ||
  (MediaOwners as any).SCHOOL ||
  "schools";

const BRANCH_MEDIA_OWNER_TABLE =
  (MediaOwners as any).BRANCHES ||
  (MediaOwners as any).BRANCH ||
  "branches";

const LOGO_FIELD_KEY = (MediaFieldKeys as any).LOGO || "logo";

const PLATFORM_ROLES = new Set([
  "developer",
  "super_admin",
  "platform_admin",
  "platform",
  "platform_team",
  "platform_owner",
]);

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

// ======================================================
// SAFE BROWSER HELPERS
// ======================================================

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanMediaUrl(value: unknown) {
  const url = cleanText(value);

  if (!url) return "";
  if (url.startsWith("blob:")) return "";
  if (url.startsWith("data:image/")) return "";

  return url;
}

function normalizeRole(value: unknown) {
  return cleanText(value).toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function isPlatformRole(role: string) {
  return PLATFORM_ROLES.has(normalizeRole(role));
}

function idOf(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sameId(a: unknown, b: unknown) {
  return String(a ?? "") === String(b ?? "");
}

const RUNTIME_ICON_ATTRIBUTE = "data-eleeveon-runtime-icon";
const RUNTIME_META_ATTRIBUTE = "data-eleeveon-runtime-meta";

function upsertRuntimeMeta(name: string, content: string) {
  if (
    typeof document === "undefined" ||
    !document.head
  ) {
    return;
  }

  let meta =
    document.head.querySelector<HTMLMetaElement>(
      `meta[${RUNTIME_META_ATTRIBUTE}="${name}"]`,
    );

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    meta.setAttribute(RUNTIME_META_ATTRIBUTE, name);
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", content);
}

function removeRuntimeMetaElements() {
  if (typeof document === "undefined") return;

  document
    .querySelectorAll<HTMLMetaElement>(
      `meta[${RUNTIME_META_ATTRIBUTE}]`,
    )
    .forEach((meta) => {
      meta.remove();
    });
}

function withBrandCacheBust(href: string, key: string) {
  if (!href) return href;
  if (href.startsWith("blob:")) return href;
  if (href.startsWith("data:")) return href;

  const separator = href.includes("?") ? "&" : "?";

  return `${href}${separator}brand=${encodeURIComponent(key)}`;
}

/**
 * Remove only icon nodes created by this runtime.
 *
 * Never remove icon nodes created by Next.js metadata. React/Next owns those
 * nodes and expects them to remain available during route transitions.
 */
function removeRuntimeIconLinks() {
  if (typeof document === "undefined") return;

  document
    .querySelectorAll<HTMLLinkElement>(
      `link[${RUNTIME_ICON_ATTRIBUTE}="true"]`,
    )
    .forEach((link) => {
      link.remove();
    });
}

function upsertRuntimeIconLink({
  key,
  rel,
  href,
  sizes,
  type,
}: {
  key: string;
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
}) {
  if (
    typeof document === "undefined" ||
    !document.head ||
    !href
  ) {
    return;
  }

  let link =
    document.head.querySelector<HTMLLinkElement>(
      `link[${RUNTIME_ICON_ATTRIBUTE}="true"][data-eleeveon-icon-key="${key}"]`,
    );

  if (!link) {
    link = document.createElement("link");
    link.setAttribute(RUNTIME_ICON_ATTRIBUTE, "true");
    link.setAttribute("data-eleeveon-icon-key", key);
    document.head.appendChild(link);
  }

  link.rel = rel;
  link.href = href;

  if (sizes) {
    link.setAttribute("sizes", sizes);
  } else {
    link.removeAttribute("sizes");
  }

  if (type) {
    link.type = type;
  } else {
    link.removeAttribute("type");
  }
}

function applyBrowserIcons({
  favicon,
  appleIcon,
  cacheKey,
}: {
  favicon: string;
  appleIcon: string;
  cacheKey: string;
}) {
  if (
    typeof document === "undefined" ||
    !document.head
  ) {
    return;
  }

  const faviconHref = withBrandCacheBust(
    favicon || DEFAULT_FAVICON,
    cacheKey,
  );

  const appleHref = withBrandCacheBust(
    appleIcon || DEFAULT_APPLE_ICON,
    cacheKey,
  );

  upsertRuntimeIconLink({
    key: "favicon-default",
    rel: "icon",
    href: faviconHref,
  });

  upsertRuntimeIconLink({
    key: "favicon-16",
    rel: "icon",
    href: faviconHref,
    sizes: "16x16",
  });

  upsertRuntimeIconLink({
    key: "favicon-32",
    rel: "icon",
    href: faviconHref,
    sizes: "32x32",
  });

  upsertRuntimeIconLink({
    key: "shortcut-icon",
    rel: "shortcut icon",
    href: faviconHref,
  });

  upsertRuntimeIconLink({
    key: "apple-touch-icon",
    rel: "apple-touch-icon",
    href: appleHref,
  });
}

function setDocumentTitle(title: string) {
  if (typeof document === "undefined") return;
  document.title = title || DEFAULT_APP_TITLE;
}

async function resolveOwnerLogoUrl(args: {
  accountId?: string | null;
  ownerTable: string;
  ownerLocalId?: number | string | null;
  ownerCloudId?: string | null;
  fallbackMediaId?: number | string | null;
}) {
  const ownerLocalId = idOf(args.ownerLocalId);
  if (!ownerLocalId) return "";

  const ownedAsset = await getOwnerFieldMediaAsset({
    accountId: args.accountId || undefined,
    ownerTable: args.ownerTable,
    ownerLocalId,
    ownerCloudId: args.ownerCloudId || undefined,
    fieldKey: LOGO_FIELD_KEY,
  });

  if (ownedAsset?.id && !(ownedAsset as any).isDeleted && (ownedAsset as any).active !== false) {
    const url = await getMediaObjectUrl(Number(ownedAsset.id));
    if (url) return url;
  }

  const fallbackMediaId = idOf(args.fallbackMediaId);
  if (!fallbackMediaId) return "";

  const fallbackAsset = await (db as any).mediaAssets?.get?.(fallbackMediaId);

  const belongsToOwner =
    fallbackAsset &&
    !fallbackAsset.isDeleted &&
    fallbackAsset.active !== false &&
    (!args.accountId || fallbackAsset.accountId === args.accountId) &&
    fallbackAsset.ownerTable === args.ownerTable &&
    fallbackAsset.fieldKey === LOGO_FIELD_KEY &&
    sameId(fallbackAsset.ownerLocalId, ownerLocalId);

  if (!belongsToOwner) return "";

  return getMediaObjectUrl(fallbackMediaId);
}

// ======================================================
// COMPONENT
// ======================================================

export default function GlobalBrandingRuntime() {
  const { settings } = useSettings() as any;

  const { activeSchool, activeBranch } = useActiveBranch() as any;

  const { activeMembership } = useActiveMembership() as any;

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const [resolvedSchoolLogoUrl, setResolvedSchoolLogoUrl] = useState("");
  const [resolvedBranchLogoUrl, setResolvedBranchLogoUrl] = useState("");

  const accountId = useMemo(() => {
    return (
      cleanText(openWorkspace?.membership?.accountId) ||
      cleanText((activeMembership as any)?.accountId) ||
      cleanText(settings?.accountId)
    );
  }, [
    activeMembership,
    openWorkspace?.membership?.accountId,
    settings?.accountId,
  ]);

  const role = useMemo(() => {
    return (
      normalizeRole(openWorkspace?.role) ||
      normalizeRole(openWorkspace?.membership?.role) ||
      normalizeRole(activeMembership?.role) ||
      normalizeRole(activeMembership?.membershipRole) ||
      normalizeRole(activeMembership?.userRole)
    );
  }, [
    activeMembership?.membershipRole,
    activeMembership?.role,
    activeMembership?.userRole,
    openWorkspace?.membership?.role,
    openWorkspace?.role,
  ]);

  const platformRole = useMemo(() => isPlatformRole(role), [role]);

  const schoolId = useMemo(() => {
    return idOf(
      openWorkspace?.schoolId ||
        openWorkspace?.membership?.schoolId ||
        openWorkspace?.membership?.school?.id ||
        activeMembership?.schoolId ||
        activeMembership?.school?.id ||
        activeSchool?.id ||
        settings?.schoolId ||
        safeStorageRead("activeSchoolId")
    );
  }, [
    activeMembership?.school?.id,
    activeMembership?.schoolId,
    activeSchool?.id,
    openWorkspace?.membership?.school?.id,
    openWorkspace?.membership?.schoolId,
    openWorkspace?.schoolId,
    settings?.schoolId,
  ]);

  const branchId = useMemo(() => {
    return idOf(
      openWorkspace?.branchId ||
        openWorkspace?.membership?.branchId ||
        openWorkspace?.membership?.schoolBranchId ||
        openWorkspace?.membership?.branch?.id ||
        activeMembership?.branchId ||
        activeMembership?.schoolBranchId ||
        activeMembership?.branch?.id ||
        activeBranch?.id ||
        settings?.branchId ||
        safeStorageRead("activeBranchId")
    );
  }, [
    activeBranch?.id,
    activeMembership?.branch?.id,
    activeMembership?.branchId,
    activeMembership?.schoolBranchId,
    openWorkspace?.branchId,
    openWorkspace?.membership?.branch?.id,
    openWorkspace?.membership?.branchId,
    openWorkspace?.membership?.schoolBranchId,
    settings?.branchId,
  ]);

  const schoolName = useMemo(() => {
    return (
      cleanText(openWorkspace?.membership?.school?.name) ||
      cleanText(openWorkspace?.membership?.schoolName) ||
      cleanText(activeMembership?.school?.name) ||
      cleanText(activeMembership?.schoolName) ||
      cleanText(activeSchool?.name) ||
      cleanText(settings?.schoolName) ||
      cleanText(settings?.name)
    );
  }, [
    activeMembership?.school?.name,
    activeMembership?.schoolName,
    activeSchool?.name,
    openWorkspace?.membership?.school?.name,
    openWorkspace?.membership?.schoolName,
    settings?.name,
    settings?.schoolName,
  ]);

  const schoolLogoUrl = useMemo(() => {
    return (
      resolvedSchoolLogoUrl ||
      cleanMediaUrl(openWorkspace?.membership?.school?.logo) ||
      cleanMediaUrl(activeMembership?.school?.logo) ||
      cleanMediaUrl(activeSchool?.logo) ||
      cleanMediaUrl(settings?.schoolLogo)
    );
  }, [
    activeMembership?.school?.logo,
    activeSchool?.logo,
    openWorkspace?.membership?.school?.logo,
    resolvedSchoolLogoUrl,
    settings?.schoolLogo,
  ]);

  const branchLogoUrl = useMemo(() => {
    return (
      resolvedBranchLogoUrl ||
      cleanMediaUrl(openWorkspace?.membership?.branch?.logo) ||
      cleanMediaUrl(activeMembership?.branch?.logo) ||
      cleanMediaUrl(activeBranch?.logo) ||
      cleanMediaUrl(settings?.branchLogo) ||
      cleanMediaUrl(settings?.logo)
    );
  }, [
    activeBranch?.logo,
    activeMembership?.branch?.logo,
    openWorkspace?.membership?.branch?.logo,
    resolvedBranchLogoUrl,
    settings?.branchLogo,
    settings?.logo,
  ]);

  const logoUrl = useMemo(() => {
    if (platformRole) return DEFAULT_FAVICON;

    return schoolLogoUrl || branchLogoUrl || DEFAULT_FAVICON;
  }, [branchLogoUrl, platformRole, schoolLogoUrl]);

  const appleIconUrl = useMemo(() => {
    if (platformRole) return DEFAULT_APPLE_ICON;

    return schoolLogoUrl || branchLogoUrl || DEFAULT_APPLE_ICON || DEFAULT_APP_ICON;
  }, [branchLogoUrl, platformRole, schoolLogoUrl]);

  const themeColor = useMemo(() => {
    return (
      cleanText(settings?.primaryColor) ||
      cleanText(settings?.themeColor) ||
      "#2f6fed"
    );
  }, [settings?.primaryColor, settings?.themeColor]);

  const title = useMemo(() => {
    if (platformRole) return DEFAULT_APP_TITLE;
    return schoolName || DEFAULT_APP_TITLE;
  }, [platformRole, schoolName]);

  const iconCacheKey = useMemo(() => {
    return platformRole
      ? "platform-default"
      : `school-${schoolId || "none"}-branch-${branchId || "none"}-${logoUrl}`;
  }, [branchId, logoUrl, platformRole, schoolId]);

  useEffect(() => {
    if (platformRole) {
      setResolvedSchoolLogoUrl((current) => {
        if (current) revokeMediaObjectUrl(current);
        return "";
      });

      setResolvedBranchLogoUrl((current) => {
        if (current) revokeMediaObjectUrl(current);
        return "";
      });

      return;
    }

    let cancelled = false;

    const loadResolvedLogos = async () => {
      try {
        const nextSchoolUrl = schoolId
          ? await resolveOwnerLogoUrl({
              accountId,
              ownerTable: SCHOOL_MEDIA_OWNER_TABLE,
              ownerLocalId: schoolId,
              ownerCloudId:
                openWorkspace?.membership?.school?.cloudId ||
                activeMembership?.school?.cloudId ||
                activeSchool?.cloudId,
              fallbackMediaId:
                openWorkspace?.membership?.school?.logoMediaId ||
                activeMembership?.school?.logoMediaId ||
                activeSchool?.logoMediaId,
            })
          : "";

        const nextBranchUrl = branchId
          ? await resolveOwnerLogoUrl({
              accountId,
              ownerTable: BRANCH_MEDIA_OWNER_TABLE,
              ownerLocalId: branchId,
              ownerCloudId:
                openWorkspace?.membership?.branch?.cloudId ||
                activeMembership?.branch?.cloudId ||
                activeBranch?.cloudId,
              fallbackMediaId:
                openWorkspace?.membership?.branch?.logoMediaId ||
                activeMembership?.branch?.logoMediaId ||
                activeBranch?.logoMediaId,
            })
          : "";

        if (cancelled) {
          if (nextSchoolUrl) revokeMediaObjectUrl(nextSchoolUrl);
          if (nextBranchUrl) revokeMediaObjectUrl(nextBranchUrl);
          return;
        }

        setResolvedSchoolLogoUrl((current) => {
          if (current && current !== nextSchoolUrl) revokeMediaObjectUrl(current);
          return nextSchoolUrl || "";
        });

        setResolvedBranchLogoUrl((current) => {
          if (current && current !== nextBranchUrl) revokeMediaObjectUrl(current);
          return nextBranchUrl || "";
        });
      } catch (error) {
        console.warn("Failed to resolve global branding logo:", error);

        if (!cancelled) {
          setResolvedSchoolLogoUrl((current) => {
            if (current) revokeMediaObjectUrl(current);
            return "";
          });

          setResolvedBranchLogoUrl((current) => {
            if (current) revokeMediaObjectUrl(current);
            return "";
          });
        }
      }
    };

    loadResolvedLogos();

    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    activeBranch?.cloudId,
    activeBranch?.logoMediaId,
    activeMembership?.branch?.cloudId,
    activeMembership?.branch?.logoMediaId,
    activeMembership?.school?.cloudId,
    activeMembership?.school?.logoMediaId,
    activeSchool?.cloudId,
    activeSchool?.logoMediaId,
    branchId,
    openWorkspace?.membership?.branch?.cloudId,
    openWorkspace?.membership?.branch?.logoMediaId,
    openWorkspace?.membership?.school?.cloudId,
    openWorkspace?.membership?.school?.logoMediaId,
    platformRole,
    schoolId,
  ]);

  useEffect(() => {
    return () => {
      if (resolvedSchoolLogoUrl) revokeMediaObjectUrl(resolvedSchoolLogoUrl);
      if (resolvedBranchLogoUrl) revokeMediaObjectUrl(resolvedBranchLogoUrl);
    };
  }, [resolvedBranchLogoUrl, resolvedSchoolLogoUrl]);

  useEffect(() => {
    setDocumentTitle(title);
  }, [title]);

  useEffect(() => {
    applyBrowserIcons({
      favicon: logoUrl || DEFAULT_FAVICON,
      appleIcon: appleIconUrl || DEFAULT_APPLE_ICON,
      cacheKey: iconCacheKey,
    });
  }, [appleIconUrl, iconCacheKey, logoUrl]);

  useEffect(() => {
    upsertRuntimeMeta("theme-color", themeColor);
  }, [themeColor]);

  /**
   * Clean up only DOM nodes created by this component.
   *
   * Next.js metadata nodes are intentionally left untouched.
   */
  useEffect(() => {
    return () => {
      removeRuntimeIconLinks();
      removeRuntimeMetaElements();
    };
  }, []);

  return null;
}