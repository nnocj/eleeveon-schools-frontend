/**
 * app/lib/theme/localPortalAppearance.ts
 * --------------------------------------------------------------------------
 * Exact extraction of the working LocalSettings light/dark display engine.
 *
 * Ownership:
 * - shared ThemeContext owns primary colour, logo, branding and font family;
 * - this local layer owns mode override, density, motion and personal font size.
 *
 * Important:
 * The light/dark surface tokens below intentionally match the original working
 * app/components/role-portals/LocalSettings.tsx implementation exactly.
 */

export type LocalAppearanceMode =
  | "light"
  | "dark"
  | "system";

export type LocalFontSize =
  | "branch"
  | "small"
  | "normal"
  | "large"
  | "extra-large";

export type LocalDensity =
  | "compact"
  | "comfortable";

export type ResolvedAppearanceMode =
  | "light"
  | "dark";

export type LocalPortalSettings = {
  appearanceMode: LocalAppearanceMode;
  fontSize: LocalFontSize;
  density: LocalDensity;
  reduceMotion: boolean;
};

export type LocalAppearanceId = string | number | null | undefined;

export type LocalAppearanceContext = {
  accountId?: LocalAppearanceId;
  schoolId?: LocalAppearanceId;
  branchId?: LocalAppearanceId;
  roleKey?: string | null;
};

export type ApplyLocalPortalAppearanceOptions = {
  /** Branch/account/platform default mode. */
  sharedDefaultMode?: string | null;

  /** Protected shared primary colour. It is read, never replaced locally. */
  sharedPrimaryColor?: string | null;

  /** Protected shared font size used by the Branch Default option. */
  sharedFontSize?: number | string | null;
};

export const LOCAL_SETTINGS_CHANGED_EVENT =
  "eleeveon:local-settings-changed";

export const LOCAL_APPEARANCE_APPLIED_EVENT =
  "eleeveon:local-appearance-applied";

export const DEFAULT_LOCAL_PORTAL_SETTINGS:
  LocalPortalSettings = {
    appearanceMode: "system",
    fontSize: "branch",
    density: "comfortable",
    reduceMotion: false,
  };

const DISPLAY_PROPERTIES = [
  "--bg",
  "--surface",
  "--text",
  "--border",
  "--card-bg",
  "--card",
  "--muted",
  "--input-bg",
  "--input-text",
  "--input-border",
  "--shell-section-bg",
  "--shell-shadow",
  "--local-density-scale",
  "--motion-duration",
  "--animation-duration",
] as const;

/**
 * Exact helper from the original working LocalSettings implementation.
 */
export function extractCssVarFallback(
  value: string,
) {
  const match =
    value.match(
      /var\([^,]+,\s*([^\)]+)\)/,
    );

  return match?.[1]?.trim() || "";
}

export function getCssPrimary(
  fallback = "#2f6fed",
) {
  if (
    typeof window === "undefined"
  ) {
    return fallback;
  }

  const value =
    getComputedStyle(
      document.documentElement,
    )
      .getPropertyValue(
        "--primary-color",
      )
      .trim();

  return value || fallback;
}

/**
 * Exact colour normalization from the original working LocalSettings file.
 */
export function normalizeCssColor(
  value?: string | null,
  fallback = "#2f6fed",
) {
  const raw =
    String(value || "").trim();

  if (!raw) return fallback;

  if (raw.startsWith("var(")) {
    return (
      extractCssVarFallback(raw) ||
      getCssPrimary(fallback)
    );
  }

  if (
    raw.startsWith("#") ||
    raw.startsWith("rgb") ||
    /^[0-9a-fA-F]{3,8}$/.test(raw)
  ) {
    return raw;
  }

  return fallback;
}

/**
 * Exact darkening algorithm from the original working LocalSettings file.
 */
export function darkenLocalThemeColor(
  color: string,
  factor: number,
) {
  const normalized =
    normalizeCssColor(
      color,
      "#2f6fed",
    );

  if (normalized.startsWith("rgb")) {
    const channels =
      normalized
        .match(/\d+(?:\.\d+)?/g)
        ?.slice(0, 3)
        .map(Number) || [];

    if (
      channels.length >= 3 &&
      channels.every(
        (channel) =>
          Number.isFinite(channel),
      )
    ) {
      const [r, g, b] =
        channels.map(
          (channel) =>
            Math.max(
              0,
              Math.min(
                255,
                Math.floor(
                  channel * factor,
                ),
              ),
            ),
        );

      return `rgb(${r}, ${g}, ${b})`;
    }

    return normalized;
  }

  let col =
    normalized
      .replace("#", "")
      .trim();

  if (col.length === 3) {
    col =
      col
        .split("")
        .map((character) =>
          character + character,
        )
        .join("");
  }

  if (col.length > 6) {
    col = col.slice(0, 6);
  }

  const num =
    parseInt(
      col || "2f6fed",
      16,
    );

  const safeNum =
    Number.isFinite(num)
      ? num
      : parseInt("2f6fed", 16);

  const r =
    Math.floor(
      ((safeNum >> 16) & 255) *
        factor,
    );

  const g =
    Math.floor(
      ((safeNum >> 8) & 255) *
        factor,
    );

  const b =
    Math.floor(
      (safeNum & 255) *
        factor,
    );

  return `rgb(${r}, ${g}, ${b})`;
}

export function updateMetaThemeColor(
  color: string,
) {
  if (
    typeof document === "undefined"
  ) {
    return;
  }

  let meta =
    document.querySelector(
      "meta[name='theme-color']",
    );

  if (!meta) {
    meta =
      document.createElement("meta");

    meta.setAttribute(
      "name",
      "theme-color",
    );

    document.head.appendChild(
      meta,
    );
  }

  meta.setAttribute(
    "content",
    color,
  );
}

function normalizeSharedMode(
  value?: string | null,
): ResolvedAppearanceMode {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "dark"
      ? "dark"
      : "light"
  );
}

/**
 * Phase 11 precedence:
 *
 * local light/dark overrides the shared default;
 * local "system" means use the shared branch/account/platform default.
 */
export function resolveLocalAppearance(
  mode: LocalAppearanceMode,
  sharedDefaultMode?: string | null,
): ResolvedAppearanceMode {
  if (
    mode === "light" ||
    mode === "dark"
  ) {
    return mode;
  }

  return normalizeSharedMode(
    sharedDefaultMode,
  );
}

function normalizeStorageIdentity(
  value: LocalAppearanceId,
  fallback: string,
) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function getLocalSettingsStorageKey(
  input: LocalAppearanceContext,
) {
  const account = normalizeStorageIdentity(input.accountId, "guest");
  const school = normalizeStorageIdentity(input.schoolId, "no-school");
  const branch = normalizeStorageIdentity(input.branchId, "no-branch");
  const role = normalizeStorageIdentity(input.roleKey, "portal");

  return [
    "eleeveon",
    "local-settings",
    account,
    school,
    branch,
    role,
  ].join(":");
}

export function normalizeLocalPortalSettings(
  value?:
    | Partial<LocalPortalSettings>
    | null,
): LocalPortalSettings {
  return {
    appearanceMode:
      value?.appearanceMode ===
        "light" ||
      value?.appearanceMode ===
        "dark" ||
      value?.appearanceMode ===
        "system"
        ? value.appearanceMode
        : DEFAULT_LOCAL_PORTAL_SETTINGS
            .appearanceMode,

    fontSize:
      value?.fontSize === "branch" ||
      value?.fontSize === "small" ||
      value?.fontSize === "normal" ||
      value?.fontSize === "large" ||
      value?.fontSize ===
        "extra-large"
        ? value.fontSize
        : DEFAULT_LOCAL_PORTAL_SETTINGS
            .fontSize,

    density:
      value?.density === "compact" ||
      value?.density === "comfortable"
        ? value.density
        : DEFAULT_LOCAL_PORTAL_SETTINGS
            .density,

    reduceMotion:
      Boolean(value?.reduceMotion),
  };
}

export function readLocalPortalSettings(
  storageKey: string,
): LocalPortalSettings {
  if (
    typeof window === "undefined"
  ) {
    return {
      ...DEFAULT_LOCAL_PORTAL_SETTINGS,
    };
  }

  try {
    const raw =
      window.localStorage.getItem(
        storageKey,
      );

    if (!raw) {
      return {
        ...DEFAULT_LOCAL_PORTAL_SETTINGS,
      };
    }

    return normalizeLocalPortalSettings(
      JSON.parse(raw) as
        Partial<LocalPortalSettings>,
    );
  } catch {
    return {
      ...DEFAULT_LOCAL_PORTAL_SETTINGS,
    };
  }
}

export function saveLocalPortalSettings(
  storageKey: string,
  settings: LocalPortalSettings,
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify(
      normalizeLocalPortalSettings(
        settings,
      ),
    ),
  );
}

export function clearLocalPortalSettings(
  storageKey: string,
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.localStorage.removeItem(
    storageKey,
  );
}

export function resolveSharedFontSize(
  sharedFontSize?:
    | number
    | string
    | null,
) {
  if (
    typeof sharedFontSize === "number"
  ) {
    return `${sharedFontSize}px`;
  }

  if (sharedFontSize === "large") {
    return "18px";
  }

  if (sharedFontSize === "small") {
    return "12px";
  }

  if (
    typeof sharedFontSize === "string" &&
    sharedFontSize.trim()
  ) {
    if (
      sharedFontSize.endsWith("px")
    ) {
      return sharedFontSize;
    }

    const parsed =
      Number(sharedFontSize);

    if (
      Number.isFinite(parsed)
    ) {
      return `${parsed}px`;
    }
  }

  return "14px";
}

export function resolveLocalFontSize(
  mode: LocalFontSize,
  sharedFontSize?:
    | number
    | string
    | null,
) {
  if (mode === "branch") {
    return resolveSharedFontSize(
      sharedFontSize,
    );
  }

  if (mode === "small") {
    return "12px";
  }

  if (mode === "normal") {
    return "14px";
  }

  if (mode === "large") {
    return "18px";
  }

  if (mode === "extra-large") {
    return "20px";
  }

  return resolveSharedFontSize(
    sharedFontSize,
  );
}

/**
 * Applies the exact old LocalSettings mode variables.
 *
 * Difference in ownership only:
 * the function reads the protected shared primary colour to derive dark
 * surfaces, but does not replace --primary-color because ThemeContext owns it.
 */
export function applyResolvedDisplayMode(
  resolvedMode:
    ResolvedAppearanceMode,
  sharedPrimaryColor?:
    | string
    | null,
) {
  if (
    typeof document === "undefined"
  ) {
    return;
  }

  const root =
    document.documentElement;

  const primary =
    normalizeCssColor(
      sharedPrimaryColor ||
        getCssPrimary("#2f6fed"),
      "#2f6fed",
    );

  // These are the exact factors used by the working LocalSettings page.
  const darkBg =
    darkenLocalThemeColor(
      primary,
      0.25,
    );

  const darkerBg =
    darkenLocalThemeColor(
      primary,
      0.15,
    );

  root.setAttribute(
    "data-theme",
    resolvedMode,
  );

  root.dataset.theme =
    resolvedMode;

  root.dataset.eleeveonResolvedMode =
    resolvedMode;

  root.classList.toggle(
    "dark",
    resolvedMode === "dark",
  );

  root.classList.toggle(
    "light",
    resolvedMode === "light",
  );

  // Keep compatibility with newer shared theme selectors too.
  root.classList.toggle(
    "theme-dark",
    resolvedMode === "dark",
  );

  root.classList.toggle(
    "theme-light",
    resolvedMode === "light",
  );

  root.style.colorScheme =
    resolvedMode;

  updateMetaThemeColor(
    resolvedMode === "dark"
      ? darkBg
      : primary,
  );

  if (
    resolvedMode === "dark"
  ) {
    // Exact working LocalSettings values.
    root.style.setProperty(
      "--bg",
      darkBg,
    );

    root.style.setProperty(
      "--surface",
      darkerBg,
    );

    root.style.setProperty(
      "--text",
      "#ffffff",
    );

    root.style.setProperty(
      "--border",
      "rgba(255,255,255,0.14)",
    );

    root.style.setProperty(
      "--card-bg",
      darkerBg,
    );

    root.style.setProperty(
      "--card",
      darkerBg,
    );

    root.style.setProperty(
      "--muted",
      "rgba(255,255,255,0.74)",
    );

    root.style.setProperty(
      "--input-bg",
      darkerBg,
    );

    root.style.setProperty(
      "--input-text",
      "#ffffff",
    );

    root.style.setProperty(
      "--input-border",
      "rgba(255,255,255,0.14)",
    );

    root.style.setProperty(
      "--shell-section-bg",
      "rgba(255,255,255,0.06)",
    );

    root.style.setProperty(
      "--shell-shadow",
      "0 24px 70px rgba(0,0,0,0.28)",
    );
  } else {
    // Exact working LocalSettings values.
    root.style.setProperty(
      "--bg",
      "#f7f8fb",
    );

    root.style.setProperty(
      "--surface",
      "#ffffff",
    );

    root.style.setProperty(
      "--text",
      "#111111",
    );

    root.style.setProperty(
      "--border",
      "rgba(0,0,0,0.10)",
    );

    root.style.setProperty(
      "--card-bg",
      "#ffffff",
    );

    root.style.setProperty(
      "--card",
      "#ffffff",
    );

    root.style.setProperty(
      "--muted",
      "#64748b",
    );

    root.style.setProperty(
      "--input-bg",
      "#ffffff",
    );

    root.style.setProperty(
      "--input-text",
      "#111111",
    );

    root.style.setProperty(
      "--input-border",
      "rgba(0,0,0,0.10)",
    );

    root.style.setProperty(
      "--shell-section-bg",
      "rgba(255,255,255,0.88)",
    );

    root.style.setProperty(
      "--shell-shadow",
      "0 24px 70px rgba(15,23,42,0.10)",
    );
  }

  if (document.body) {
    document.body.style.background =
      "var(--bg)";

    document.body.style.color =
      "var(--text)";
  }

  return {
    primary,
    darkBg,
    darkerBg,
  };
}

export function applyLocalComfortPreferences(
  settings: LocalPortalSettings,
  sharedFontSize?:
    | number
    | string
    | null,
) {
  if (
    typeof document === "undefined"
  ) {
    return;
  }

  const root =
    document.documentElement;

  const fontSize =
    resolveLocalFontSize(
      settings.fontSize,
      sharedFontSize,
    );

  root.style.setProperty(
    "--font-size",
    fontSize,
  );

  root.style.fontSize =
    fontSize;

  if (document.body) {
    document.body.style.fontSize =
      fontSize;
  }

  root.dataset.localFontSize =
    settings.fontSize;

  root.dataset.localDensity =
    settings.density;

  root.dataset.reduceMotion =
    settings.reduceMotion
      ? "true"
      : "false";

  root.style.setProperty(
    "--local-density-scale",
    settings.density === "compact"
      ? "0.88"
      : "1",
  );

  if (settings.reduceMotion) {
    root.style.setProperty(
      "--motion-duration",
      "0ms",
    );

    root.style.setProperty(
      "--animation-duration",
      "0ms",
    );
  } else {
    root.style.removeProperty(
      "--motion-duration",
    );

    root.style.removeProperty(
      "--animation-duration",
    );
  }
}

export function applyLocalPortalSettings(
  settings: LocalPortalSettings,
  options?:
    ApplyLocalPortalAppearanceOptions,
) {
  const normalized =
    normalizeLocalPortalSettings(
      settings,
    );

  const resolvedMode =
    resolveLocalAppearance(
      normalized.appearanceMode,
      options?.sharedDefaultMode,
    );

  const palette =
    applyResolvedDisplayMode(
      resolvedMode,
      options?.sharedPrimaryColor,
    );

  applyLocalComfortPreferences(
    normalized,
    options?.sharedFontSize,
  );

  if (
    typeof document !== "undefined"
  ) {
    const root =
      document.documentElement;

    root.dataset.localAppearance =
      normalized.appearanceMode;

    root.dataset.localAppearanceReady =
      "true";
  }

  return {
    settings: normalized,
    resolvedMode,
    palette,
  };
}

export function announceLocalSettingsChange(
  storageKey: string,
  settings: LocalPortalSettings,
  options?: {
    sharedDefaultMode?: string | null;
    sharedPrimaryColor?: string | null;
    sharedFontSize?: number | string | null;
  },
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  const normalized =
    normalizeLocalPortalSettings(
      settings,
    );

  window.dispatchEvent(
    new CustomEvent(
      LOCAL_SETTINGS_CHANGED_EVENT,
      {
        detail: {
          storageKey,
          settings: normalized,
          appearanceMode:
            normalized.appearanceMode,
          resolvedMode:
            resolveLocalAppearance(
              normalized.appearanceMode,
              options?.sharedDefaultMode,
            ),
          primaryColor:
            options?.sharedPrimaryColor,
          branchFontSize:
            options?.sharedFontSize,
        },
      },
    ),
  );

  window.dispatchEvent(
    new Event(
      "eleeveon:theme-refresh",
    ),
  );
}

export function clearAppliedLocalAppearance() {
  if (
    typeof document === "undefined"
  ) {
    return;
  }

  const root =
    document.documentElement;

  for (
    const property of
    DISPLAY_PROPERTIES
  ) {
    root.style.removeProperty(
      property,
    );
  }

  delete root.dataset.localAppearance;
  delete root.dataset.localAppearanceReady;
  delete root.dataset.localFontSize;
  delete root.dataset.localDensity;
  delete root.dataset.reduceMotion;
  delete root.dataset.eleeveonResolvedMode;

  root.classList.remove(
    "dark",
    "light",
    "theme-dark",
    "theme-light",
  );

  root.style.removeProperty(
    "color-scheme",
  );

  if (document.body) {
    document.body.style.removeProperty(
      "background",
    );

    document.body.style.removeProperty(
      "color",
    );

    document.body.style.removeProperty(
      "font-size",
    );
  }
}