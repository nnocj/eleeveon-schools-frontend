/**
 * app/lib/theme/applyScopedAppearance.ts
 * --------------------------------------------------------------------------
 * Owns all role-scoped writes to document appearance.
 *
 * Every role transition clears the previous scoped variables before the target
 * platform/account/school/branch appearance is applied. This is what prevents
 * Branch Admin branding from leaking into Owner or Developer portals.
 */

import type { AppearanceScope } from "./appearanceScope";
import {
  appearanceIdentityFor,
} from "./appearanceScope";

export type ScopedAppearanceSettings = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  surfaceColor?: string | null;
  cardBackgroundColor?: string | null;
  textColor?: string | null;
  mutedColor?: string | null;
  borderColor?: string | null;
  fontFamily?: string | null;
  fontSize?: string | number | null;
  theme?: string | null;
  appearanceMode?: string | null;
  mode?: string | null;
  [key: string]: unknown;
};

export type ScopedAppearanceInput = {
  role: string;
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  settings?: ScopedAppearanceSettings | null;
};

export type AppliedAppearance = ReturnType<
  typeof appearanceIdentityFor
> & {
  appliedAt: number;
  primaryColor: string;
  mode: "light" | "dark";
};

export const PLATFORM_APPEARANCE_DEFAULTS = {
  primaryColor: "#2f6fed",
  fontFamily:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: "16px",
  mode: "light" as const,
};

const OWNED_CSS_PROPERTIES = [
  "--primary-color",
  "--dashboard-primary",
  "--branch-primary",
  "--branch-accent",
  "--secondary-color",
  "--accent-color",
  "--bg",
  "--surface",
  "--card-bg",
  "--text",
  "--muted",
  "--border",
  "--font-family",
  "--font-size",
] as const;

const OWNED_ATTRIBUTES = [
  "data-appearance-scope",
  "data-appearance-role",
  "data-appearance-account-id",
  "data-appearance-school-id",
  "data-appearance-branch-id",
] as const;

function rootElement() {
  return typeof document === "undefined"
    ? null
    : document.documentElement;
}

function cleanColor(value: unknown) {
  const text = String(value || "").trim();
  return text || undefined;
}

function cleanFontSize(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Math.max(10, Math.min(24, value))}px`;
  }

  const text = String(value || "").trim();
  if (!text) return undefined;
  if (/^\d+(\.\d+)?$/.test(text)) return `${text}px`;
  return text;
}

function resolveMode(settings?: ScopedAppearanceSettings | null) {
  const value = String(
    settings?.appearanceMode ||
      settings?.theme ||
      settings?.mode ||
      "light",
  )
    .trim()
    .toLowerCase();

  if (value === "dark") return "dark" as const;
  return "light" as const;
}

export function clearScopedAppearance() {
  const root = rootElement();
  if (!root) return;

  for (const property of OWNED_CSS_PROPERTIES) {
    root.style.removeProperty(property);
  }

  for (const attribute of OWNED_ATTRIBUTES) {
    root.removeAttribute(attribute);
  }

  root.classList.remove("theme-light", "theme-dark");
  root.removeAttribute("data-theme");
}

function applyAppearance(
  scope: AppearanceScope,
  input: ScopedAppearanceInput,
): AppliedAppearance | null {
  const root = rootElement();
  if (!root) return null;

  clearScopedAppearance();

  const identity = appearanceIdentityFor(input);
  const settings = input.settings || {};
  const primaryColor =
    cleanColor(settings.primaryColor) ||
    PLATFORM_APPEARANCE_DEFAULTS.primaryColor;
  const mode = resolveMode(settings);

  root.style.setProperty("--primary-color", primaryColor);
  root.style.setProperty("--dashboard-primary", primaryColor);

  if (scope === "branch") {
    root.style.setProperty("--branch-primary", primaryColor);
  }

  const propertyValues: Array<[string, string | undefined]> = [
    ["--secondary-color", cleanColor(settings.secondaryColor)],
    ["--accent-color", cleanColor(settings.accentColor)],
    ["--branch-accent", scope === "branch" ? cleanColor(settings.accentColor) : undefined],
    ["--bg", cleanColor(settings.backgroundColor)],
    ["--surface", cleanColor(settings.surfaceColor)],
    ["--card-bg", cleanColor(settings.cardBackgroundColor)],
    ["--text", cleanColor(settings.textColor)],
    ["--muted", cleanColor(settings.mutedColor)],
    ["--border", cleanColor(settings.borderColor)],
    ["--font-family", String(settings.fontFamily || "").trim() || undefined],
    ["--font-size", cleanFontSize(settings.fontSize)],
  ];

  for (const [property, value] of propertyValues) {
    if (value) root.style.setProperty(property, value);
  }

  root.setAttribute("data-appearance-scope", scope);
  root.setAttribute("data-appearance-role", identity.role || "unknown");
  if (identity.accountId) {
    root.setAttribute("data-appearance-account-id", identity.accountId);
  }
  if (identity.schoolId) {
    root.setAttribute("data-appearance-school-id", String(identity.schoolId));
  }
  if (identity.branchId) {
    root.setAttribute("data-appearance-branch-id", String(identity.branchId));
  }

  root.setAttribute("data-theme", mode);
  root.classList.add(mode === "dark" ? "theme-dark" : "theme-light");
  root.style.colorScheme = mode;

  return {
    ...identity,
    appliedAt: Date.now(),
    primaryColor,
    mode,
  };
}

export function applyPlatformAppearance(
  input: ScopedAppearanceInput,
) {
  return applyAppearance("platform", {
    ...input,
    schoolId: null,
    branchId: null,
    settings: {
      ...PLATFORM_APPEARANCE_DEFAULTS,
      ...(input.settings || {}),
    },
  });
}

export function applyAccountAppearance(
  input: ScopedAppearanceInput,
) {
  return applyAppearance("account", {
    ...input,
    schoolId: null,
    branchId: null,
  });
}

export function applySchoolAppearance(
  input: ScopedAppearanceInput,
) {
  return applyAppearance("school", {
    ...input,
    branchId: null,
  });
}

export function applyBranchAppearance(
  input: ScopedAppearanceInput,
) {
  return applyAppearance("branch", input);
}

export function applyAppearanceForRole(
  input: ScopedAppearanceInput,
) {
  const identity = appearanceIdentityFor(input);

  switch (identity.scope) {
    case "branch":
      return applyBranchAppearance(input);
    case "school":
      return applySchoolAppearance(input);
    case "account":
      return applyAccountAppearance(input);
    default:
      return applyPlatformAppearance(input);
  }
}