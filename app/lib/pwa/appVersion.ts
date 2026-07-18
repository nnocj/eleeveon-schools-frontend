/**
 * app/lib/pwa/appVersion.ts
 * --------------------------------------------------------------------------
 * Build metadata and safe application-update helpers.
 */

export type AppVersionMetadata = {
  buildId: string;
  appVersion: string;
  minimumDbVersion: number;
  currentDbVersion: number;
};

export type AppVersionComparison = {
  updateAvailable: boolean;
  databaseUpgradeRequired: boolean;
  remote: AppVersionMetadata;
  local: AppVersionMetadata;
};

const VERSION_ENDPOINT = "/version.json";
const VERSION_STORAGE_KEY =
  "eleeveon_last_loaded_app_version";
const UPDATE_RELOAD_GUARD_KEY =
  "eleeveon_update_reload_guard";

function positiveInteger(
  value: unknown,
  fallback: number,
) {
  const parsed = Number(value);

  return Number.isFinite(parsed) &&
    parsed >= 0
    ? Math.floor(parsed)
    : fallback;
}

function cleanString(
  value: unknown,
  fallback: string,
) {
  const result =
    String(value || "").trim();

  return result || fallback;
}

export function getBundledAppVersion():
  AppVersionMetadata {
  return {
    buildId: cleanString(
      process.env
        .NEXT_PUBLIC_ELEEVEON_BUILD_ID,
      "development",
    ),
    appVersion: cleanString(
      process.env
        .NEXT_PUBLIC_ELEEVEON_APP_VERSION,
      "0.0.0",
    ),
    minimumDbVersion:
      positiveInteger(
        process.env
          .NEXT_PUBLIC_ELEEVEON_MINIMUM_DB_VERSION,
        0,
      ),
    currentDbVersion:
      positiveInteger(
        process.env
          .NEXT_PUBLIC_ELEEVEON_CURRENT_DB_VERSION,
        0,
      ),
  };
}

export function normalizeAppVersionMetadata(
  input: Partial<AppVersionMetadata> | null | undefined,
): AppVersionMetadata {
  const local = getBundledAppVersion();

  return {
    buildId:
      cleanString(
        input?.buildId,
        local.buildId,
      ),
    appVersion:
      cleanString(
        input?.appVersion,
        local.appVersion,
      ),
    minimumDbVersion:
      positiveInteger(
        input?.minimumDbVersion,
        local.minimumDbVersion,
      ),
    currentDbVersion:
      positiveInteger(
        input?.currentDbVersion,
        local.currentDbVersion,
      ),
  };
}

export async function fetchRemoteAppVersion(
  signal?: AbortSignal,
): Promise<AppVersionMetadata> {
  const separator =
    VERSION_ENDPOINT.includes("?")
      ? "&"
      : "?";

  const response = await fetch(
    `${VERSION_ENDPOINT}${separator}t=${Date.now()}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control":
          "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Version check failed with HTTP ${response.status}.`,
    );
  }

  return normalizeAppVersionMetadata(
    await response.json(),
  );
}

export function compareAppVersions(
  remote: AppVersionMetadata,
  local = getBundledAppVersion(),
): AppVersionComparison {
  const updateAvailable =
    remote.buildId !== local.buildId ||
    remote.appVersion !== local.appVersion;

  return {
    updateAvailable,
    databaseUpgradeRequired:
      remote.minimumDbVersion >
        local.currentDbVersion ||
      remote.currentDbVersion >
        local.currentDbVersion,
    remote,
    local,
  };
}

export function rememberLoadedAppVersion(
  metadata = getBundledAppVersion(),
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      VERSION_STORAGE_KEY,
      JSON.stringify(metadata),
    );
  } catch {}
}

export function getRememberedAppVersion():
  AppVersionMetadata | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        VERSION_STORAGE_KEY,
      );

    return raw
      ? normalizeAppVersionMetadata(
          JSON.parse(raw),
        )
      : null;
  } catch {
    return null;
  }
}

export function shouldReloadForControllerChange(
  buildId: string,
) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const previous =
      window.sessionStorage.getItem(
        UPDATE_RELOAD_GUARD_KEY,
      );

    if (previous === buildId) {
      return false;
    }

    window.sessionStorage.setItem(
      UPDATE_RELOAD_GUARD_KEY,
      buildId,
    );

    return true;
  } catch {
    return true;
  }
}

export function clearUpdateReloadGuard() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      UPDATE_RELOAD_GUARD_KEY,
    );
  } catch {}
}