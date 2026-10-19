"use client";
/**
 * app/components/GlobalBrandingRuntime.tsx
 * Browser title and icons only. Role-scoped colours and design tokens are
 * exclusively managed by ThemeContext and LocalAppearanceRuntime.
 */
import { useEffect, useMemo } from "react";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useActiveMembership } from "../context/active-membership-context";

const DEFAULT_TITLE = "Eleeveon School Management";
const DEFAULT_FAVICON = "/favicon.ico";
const DEFAULT_APPLE_ICON = "/apple-touch-icon.png";
const PLATFORM_ROLES = new Set(["developer", "platform_admin", "platform", "platform_team", "platform_owner"]);
const clean = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) => clean(value).toLowerCase().replace(/[\s-]+/g, "_");
const validMedia = (value: unknown) => {
  const url = clean(value);
  // Blob URLs from a previous browser session cannot be reused.
  return /^(https?:\/\/|\/)/i.test(url) ? url : "";
};
const first = (...values: unknown[]) => values.map(clean).find(Boolean) || "";
function upsertMeta(name: string, content: string) {
  let node = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!node) { node = document.createElement("meta"); node.name = name; document.head.appendChild(node); }
  node.content = content;
}
function upsertIcon(rel: string, href: string) {
  let node = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!node) { node = document.createElement("link"); node.rel = rel; document.head.appendChild(node); }
  node.href = href;
}
export default function GlobalBrandingRuntime() {
  const { settings } = useSettings() as any;
  const { activeSchool, activeBranch } = useActiveBranch() as any;
  const { activeMembership } = useActiveMembership() as any;
  // Membership is authoritative. Never retain a stale saved role when switching.
  const role = normalize(activeMembership?.role || activeMembership?.membershipRole || activeMembership?.userRole);
  const platform = PLATFORM_ROLES.has(role);
  const schoolName = first(activeSchool?.name, activeMembership?.school?.name,
    activeMembership?.schoolName, settings?.schoolName, settings?.name);
  const schoolLogo = validMedia(activeSchool?.logo) || validMedia(activeMembership?.school?.logo) || validMedia(settings?.schoolLogo);
  const branchLogo = validMedia(activeBranch?.logo) || validMedia(activeMembership?.branch?.logo) ||
    validMedia(settings?.branchLogo) || validMedia(settings?.logo);
  const title = platform ? DEFAULT_TITLE : schoolName || DEFAULT_TITLE;
  const icon = platform ? DEFAULT_FAVICON : schoolLogo || branchLogo || DEFAULT_FAVICON;
  const apple = platform ? DEFAULT_APPLE_ICON : schoolLogo || branchLogo || DEFAULT_APPLE_ICON;
  useEffect(() => {
    document.title = title;
    upsertMeta("application-name", title);
    upsertMeta("apple-mobile-web-app-title", title);
  }, [title]);
  useEffect(() => {
    upsertIcon("icon", icon);
    upsertIcon("shortcut icon", icon);
    upsertIcon("apple-touch-icon", apple);
  }, [icon, apple]);
  return null;
}
