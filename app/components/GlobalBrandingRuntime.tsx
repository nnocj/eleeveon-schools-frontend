"use client";

/**
 * app/components/GlobalBrandingRuntime.tsx
 * --------------------------------------------------------------------------
 * Permanent-ID global branding runtime.
 *
 * Ownership:
 * - owns document title, favicon, Apple touch icon and workspace logos;
 * - does not own light/dark mode, primary-colour CSS variables or theme-color;
 * - active React contexts take precedence over persisted workspace fallbacks;
 * - effective settings take precedence over stale raw settings.
 *
 * This prevents branding hydration from competing with ThemeContext,
 * PortalAppearanceRuntime and LocalAppearanceRuntime.
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
  schoolId?: string | null;
  branchId?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

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
  return String(value ?? "").trim();
}

function cleanId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const id = String(value).trim();
  return id || null;
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

function sameId(a: unknown, b: unknown) {
  const left = cleanId(a);
  const right = cleanId(b);
  return Boolean(left && right && left === right);
}

const RUNTIME_ICON_ATTRIBUTE = "data-eleeveon-runtime-icon";

function withBrandCacheBust(href: string, key: string) {
  if (!href || href.startsWith("blob:") || href.startsWith("data:")) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}brand=${encodeURIComponent(key)}`;
}

function removeRuntimeIconLinks() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll<HTMLLinkElement>(`link[${RUNTIME_ICON_ATTRIBUTE}="true"]`)
    .forEach((link) => link.remove());
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
  if (typeof document === "undefined" || !document.head || !href) return;

  let link = document.head.querySelector<HTMLLinkElement>(
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
  if (sizes) link.setAttribute("sizes", sizes);
  else link.removeAttribute("sizes");
  if (type) link.type = type;
  else link.removeAttribute("type");
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
  if (typeof document === "undefined" || !document.head) return;

  const faviconHref = withBrandCacheBust(favicon || DEFAULT_FAVICON, cacheKey);
  const appleHref = withBrandCacheBust(appleIcon || DEFAULT_APPLE_ICON, cacheKey);

  upsertRuntimeIconLink({ key: "favicon-default", rel: "icon", href: faviconHref });
  upsertRuntimeIconLink({ key: "favicon-16", rel: "icon", href: faviconHref, sizes: "16x16" });
  upsertRuntimeIconLink({ key: "favicon-32", rel: "icon", href: faviconHref, sizes: "32x32" });
  upsertRuntimeIconLink({ key: "shortcut-icon", rel: "shortcut icon", href: faviconHref });
  upsertRuntimeIconLink({ key: "apple-touch-icon", rel: "apple-touch-icon", href: appleHref });
}

function setDocumentTitle(title: string) {
  if (typeof document === "undefined") return;
  document.title = title || DEFAULT_APP_TITLE;
}

async function resolveOwnerLogoUrl(args: {
  accountId?: string | null;
  ownerTable: string;
  ownerId?: string | null;
  fallbackMediaId?: string | null;
}) {
  const ownerId = cleanId(args.ownerId);
  if (!ownerId) return "";

  const ownedAsset = await getOwnerFieldMediaAsset({
    accountId: args.accountId || undefined,
    ownerTable: args.ownerTable,
    ownerId,
    fieldKey: LOGO_FIELD_KEY,
  });

  if (
    ownedAsset?.id &&
    !(ownedAsset as any).isDeleted &&
    (ownedAsset as any).active !== false
  ) {
    const url = await getMediaObjectUrl(String(ownedAsset.id));
    if (url) return url;
  }

  const fallbackMediaId = cleanId(args.fallbackMediaId);
  if (!fallbackMediaId) return "";

  const fallbackAsset = await (db as any).mediaAssets?.get?.(fallbackMediaId);

  const belongsToOwner =
    fallbackAsset &&
    !fallbackAsset.isDeleted &&
    fallbackAsset.active !== false &&
    (!args.accountId || fallbackAsset.accountId === args.accountId) &&
    fallbackAsset.ownerTable === args.ownerTable &&
    fallbackAsset.fieldKey === LOGO_FIELD_KEY &&
    sameId(fallbackAsset.ownerId, ownerId);

  if (!belongsToOwner) return "";
  return getMediaObjectUrl(fallbackMediaId);
}

export default function GlobalBrandingRuntime() {
  const settingsContext = useSettings() as any;
  const { activeSchool, activeBranch } = useActiveBranch() as any;
  const { activeMembership } = useActiveMembership() as any;

  const settings =
    settingsContext.effectiveSettings ||
    settingsContext.settings ||
    null;

  /*
   * Persisted workspace data is fallback-only. The active contexts represent
   * the workspace the user is actually viewing and must always win.
   */
  const openWorkspace = readOpenWorkspaceSession();
  const [resolvedSchoolLogoUrl, setResolvedSchoolLogoUrl] = useState("");
  const [resolvedBranchLogoUrl, setResolvedBranchLogoUrl] = useState("");

  const accountId = useMemo(
    () =>
      cleanText((activeMembership as any)?.accountId) ||
      cleanText(settings?.accountId) ||
      cleanText(openWorkspace?.membership?.accountId),
    [activeMembership, openWorkspace?.membership?.accountId, settings?.accountId],
  );

  const role = useMemo(
    () =>
      normalizeRole(activeMembership?.role) ||
      normalizeRole(activeMembership?.membershipRole) ||
      normalizeRole(activeMembership?.userRole) ||
      normalizeRole(openWorkspace?.role) ||
      normalizeRole(openWorkspace?.membership?.role),
    [
      activeMembership?.membershipRole,
      activeMembership?.role,
      activeMembership?.userRole,
      openWorkspace?.membership?.role,
      openWorkspace?.role,
    ],
  );

  const platformRole = useMemo(() => isPlatformRole(role), [role]);

  const schoolId = useMemo(
    () =>
      cleanId(
        activeMembership?.schoolId ||
          activeMembership?.school?.id ||
          activeSchool?.id ||
          settings?.schoolId ||
          openWorkspace?.schoolId ||
          openWorkspace?.membership?.schoolId ||
          openWorkspace?.membership?.school?.id ||
          safeStorageRead("activeSchoolId"),
      ),
    [
      activeMembership?.school?.id,
      activeMembership?.schoolId,
      activeSchool?.id,
      openWorkspace?.membership?.school?.id,
      openWorkspace?.membership?.schoolId,
      openWorkspace?.schoolId,
      settings?.schoolId,
    ],
  );

  const branchId = useMemo(
    () =>
      cleanId(
        activeMembership?.branchId ||
          activeMembership?.schoolBranchId ||
          activeMembership?.branch?.id ||
          activeBranch?.id ||
          settings?.branchId ||
          openWorkspace?.branchId ||
          openWorkspace?.membership?.branchId ||
          openWorkspace?.membership?.schoolBranchId ||
          openWorkspace?.membership?.branch?.id ||
          safeStorageRead("activeBranchId"),
      ),
    [
      activeBranch?.id,
      activeMembership?.branch?.id,
      activeMembership?.branchId,
      activeMembership?.schoolBranchId,
      openWorkspace?.branchId,
      openWorkspace?.membership?.branch?.id,
      openWorkspace?.membership?.branchId,
      openWorkspace?.membership?.schoolBranchId,
      settings?.branchId,
    ],
  );

  const schoolName = useMemo(
    () =>
      cleanText(activeMembership?.school?.name) ||
      cleanText(activeMembership?.schoolName) ||
      cleanText(activeSchool?.name) ||
      cleanText(settings?.schoolName) ||
      cleanText(settings?.name) ||
      cleanText(openWorkspace?.membership?.school?.name) ||
      cleanText(openWorkspace?.membership?.schoolName),
    [
      activeMembership?.school?.name,
      activeMembership?.schoolName,
      activeSchool?.name,
      openWorkspace?.membership?.school?.name,
      openWorkspace?.membership?.schoolName,
      settings?.name,
      settings?.schoolName,
    ],
  );

  const schoolLogoUrl = useMemo(
    () =>
      resolvedSchoolLogoUrl ||
      cleanMediaUrl(activeMembership?.school?.logo) ||
      cleanMediaUrl(activeSchool?.logo) ||
      cleanMediaUrl(settings?.schoolLogo) ||
      cleanMediaUrl(openWorkspace?.membership?.school?.logo),
    [
      activeMembership?.school?.logo,
      activeSchool?.logo,
      openWorkspace?.membership?.school?.logo,
      resolvedSchoolLogoUrl,
      settings?.schoolLogo,
    ],
  );

  const branchLogoUrl = useMemo(
    () =>
      resolvedBranchLogoUrl ||
      cleanMediaUrl(activeMembership?.branch?.logo) ||
      cleanMediaUrl(activeBranch?.logo) ||
      cleanMediaUrl(settings?.branchLogo) ||
      cleanMediaUrl(settings?.logo) ||
      cleanMediaUrl(openWorkspace?.membership?.branch?.logo),
    [
      activeBranch?.logo,
      activeMembership?.branch?.logo,
      openWorkspace?.membership?.branch?.logo,
      resolvedBranchLogoUrl,
      settings?.branchLogo,
      settings?.logo,
    ],
  );

  const logoUrl = useMemo(
    () => (platformRole ? DEFAULT_FAVICON : schoolLogoUrl || branchLogoUrl || DEFAULT_FAVICON),
    [branchLogoUrl, platformRole, schoolLogoUrl],
  );

  const appleIconUrl = useMemo(
    () =>
      platformRole
        ? DEFAULT_APPLE_ICON
        : schoolLogoUrl || branchLogoUrl || DEFAULT_APPLE_ICON || DEFAULT_APP_ICON,
    [branchLogoUrl, platformRole, schoolLogoUrl],
  );

  const title = useMemo(
    () => (platformRole ? DEFAULT_APP_TITLE : schoolName || DEFAULT_APP_TITLE),
    [platformRole, schoolName],
  );

  const iconCacheKey = useMemo(
    () =>
      platformRole
        ? "platform-default"
        : `school-${schoolId || "none"}-branch-${branchId || "none"}-${logoUrl}`,
    [branchId, logoUrl, platformRole, schoolId],
  );

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
              ownerId: schoolId,
              fallbackMediaId: cleanId(
                openWorkspace?.membership?.school?.logoMediaId ||
                  activeMembership?.school?.logoMediaId ||
                  activeSchool?.logoMediaId,
              ),
            })
          : "";

        const nextBranchUrl = branchId
          ? await resolveOwnerLogoUrl({
              accountId,
              ownerTable: BRANCH_MEDIA_OWNER_TABLE,
              ownerId: branchId,
              fallbackMediaId: cleanId(
                openWorkspace?.membership?.branch?.logoMediaId ||
                  activeMembership?.branch?.logoMediaId ||
                  activeBranch?.logoMediaId,
              ),
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

    void loadResolvedLogos();

    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    activeBranch?.logoMediaId,
    activeMembership?.branch?.logoMediaId,
    activeMembership?.school?.logoMediaId,
    activeSchool?.logoMediaId,
    branchId,
    openWorkspace?.membership?.branch?.logoMediaId,
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

  useEffect(() => setDocumentTitle(title), [title]);

  useEffect(() => {
    applyBrowserIcons({
      favicon: logoUrl || DEFAULT_FAVICON,
      appleIcon: appleIconUrl || DEFAULT_APPLE_ICON,
      cacheKey: iconCacheKey,
    });
  }, [appleIconUrl, iconCacheKey, logoUrl]);

  useEffect(() => {
    return () => {
      removeRuntimeIconLinks();
    };
  }, []);

  return null;
}