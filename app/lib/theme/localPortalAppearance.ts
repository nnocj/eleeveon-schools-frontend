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
  /** Permanent authenticated AppUser.id, NEVER the shared account id. */
  userId?: LocalAppearanceId;
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
  const user = normalizeStorageIdentity(input.userId, "unresolved-user");
  const school = normalizeStorageIdentity(input.schoolId, "no-school");
  const branch = normalizeStorageIdentity(input.branchId, "no-branch");
  // UI labels such as "branch-admin" and membership role "branch_admin"
  // must address the same saved preference record.
  const role = normalizeStorageIdentity(input.roleKey, "portal")
    .toLowerCase().replace(/[\s-]+/g, "_");

  // V2 deliberately does NOT reuse the earlier account-wide local settings key.
  // A shared browser might contain another user's former light/dark preference;
  // adopting that value for the next person would violate user separation.
  // We leave old keys untouched and start every user with Portal Default until
  // that user explicitly makes a choice in their own private local key.
  return [
    "eleeveon",
    "local-settings",
    "v2",
    account,
    user,
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

  const darkBg = "#0b1220";
  const darkerBg = "#111a2b";

  const dark =
    resolvedMode === "dark";

  const palette = dark
    ? {
        bg: "#0b1220",
        surface: "#111a2b",
        raised: "#162136",
        sunken: "#0c1524",
        text: "#e9eef7",
        textStrong: "#f8fafc",
        muted: "#a7b0c0",
        border:
          "rgba(255,255,255,0.11)",
        divider:
          "rgba(255,255,255,0.085)",
        input: "#0f1929",
        shell: "#0f1828",
        header: "#111a2b",
        drawer: "#111a2b",
      }
    : {
        bg: "#f4f7fb",
        surface: "#ffffff",
        raised: "#ffffff",
        sunken: "#f1f5f9",
        text: "#263244",
        textStrong: "#111827",
        muted: "#667085",
        border:
          "rgba(15,23,42,0.09)",
        divider:
          "rgba(15,23,42,0.075)",
        input: "#ffffff",
        shell: "#fbfcfe",
        header: "#f8fafc",
        drawer: "#ffffff",
      };

  root.setAttribute(
    "data-theme",
    resolvedMode,
  );

  root.dataset.theme =
    resolvedMode;
  root.dataset.appearanceMode =
    resolvedMode;
  root.dataset.eleeveonResolvedMode =
    resolvedMode;

  root.classList.toggle(
    "dark",
    dark,
  );
  root.classList.toggle(
    "light",
    !dark,
  );
  root.classList.toggle(
    "theme-dark",
    dark,
  );
  root.classList.toggle(
    "theme-light",
    !dark,
  );

  root.style.colorScheme =
    resolvedMode;

  const variables:
    Record<string, string> = {
    "--eds-bg": palette.bg,
    "--eds-bg-raised":
      dark ? "#0f1828" : "#f8fafc",
    "--eds-surface":
      palette.surface,
    "--eds-surface-raised":
      palette.raised,
    "--eds-surface-sunken":
      palette.sunken,
    "--eds-card":
      palette.surface,
    "--eds-card-strong":
      dark ? "#17243a" : "#fbfcfe",
    "--eds-input":
      palette.input,
    "--eds-text":
      palette.text,
    "--eds-text-strong":
      palette.textStrong,
    "--eds-text-muted":
      palette.muted,
    "--eds-border":
      palette.border,
    "--eds-divider":
      palette.divider,

    "--eds-shell-bg":
      palette.bg,
    "--eds-sidebar-bg":
      palette.shell,
    "--eds-header-bg":
      palette.header,
    "--eds-drawer-bg":
      palette.drawer,
    "--eds-window-bg":
      palette.header,

    "--bg": palette.bg,
    "--surface":
      palette.surface,
    "--card":
      palette.surface,
    "--card-bg":
      palette.surface,
    "--text":
      palette.text,
    "--muted":
      palette.muted,
    "--border":
      palette.border,
    "--input-bg":
      palette.input,
    "--input-text":
      palette.text,
    "--input-border":
      palette.border,

    "--shell-sidebar-bg":
      palette.shell,
    "--shell-header-bg":
      palette.header,
    "--shell-menu-bg":
      palette.drawer,
    "--shell-section-bg":
      palette.sunken,
    "--shell-hover-bg":
      `color-mix(in srgb, ${primary} 7%, ${palette.surface})`,
    "--shell-active-bg":
      `color-mix(in srgb, ${primary} 12%, ${palette.surface})`,
    "--shell-soft-border":
      palette.divider,

    "--eds-window-chrome-color":
      palette.header,
    "--window-chrome-fallback":
      palette.header,
  };

  for (
    const [name, value] of
    Object.entries(variables)
  ) {
    root.style.setProperty(
      name,
      value,
    );
  }

  updateMetaThemeColor(
    palette.header,
  );

  if (document.body) {
    document.body.style.background =
      palette.bg;
    document.body.style.color =
      palette.text;
  }

  window.dispatchEvent(
    new CustomEvent(
      "eleeveon:surface-theme-applied",
      {
        detail: {
          mode: resolvedMode,
          primary,
          surface:
            palette.surface,
          header:
            palette.header,
          sidebar:
            palette.shell,
          at: Date.now(),
        },
      },
    ),
  );

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

  /*
   * Do not dispatch "eleeveon:theme-refresh" here.
   *
   * That event belongs to protected shared branding and can immediately
   * repaint the branch default over a just-selected local Light/Dark choice.
   * Local changes have their own exact event and refresh contracts.
   */
  window.dispatchEvent(
    new CustomEvent(
      "eleeveon:local-appearance-refresh",
      {
        detail: {
          storageKey,
          settings: normalized,
          resolvedMode:
            resolveLocalAppearance(
              normalized.appearanceMode,
              options?.sharedDefaultMode,
            ),
          at: Date.now(),
        },
      },
    ),
  );

  window.dispatchEvent(
    new Event(
      "eleeveon:window-theme-refresh",
    ),
  );
}

/**
 * Explicit local-settings transaction.
 *
 * This is intentionally not used by route mount/navigation. Call it only from
 * a user action such as selecting an appearance, density, text size or motion.
 */
export function saveApplyAndAnnounceLocalPortalSettings(
  storageKey: string,
  settings: LocalPortalSettings,
  options?:
    ApplyLocalPortalAppearanceOptions,
): LocalPortalSettings {
  const normalized =
    normalizeLocalPortalSettings(
      settings,
    );

  saveLocalPortalSettings(
    storageKey,
    normalized,
  );

  applyLocalPortalSettings(
    normalized,
    options,
  );

  announceLocalSettingsChange(
    storageKey,
    normalized,
    options,
  );

  return normalized;
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
