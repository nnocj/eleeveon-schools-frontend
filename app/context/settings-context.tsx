"use client";

/**
 * app/context/settings-context.tsx
 * --------------------------------------------------------------------------
 * Role-aware settings resolver.
 *
 * Branch settings remain cached and editable, but they become effective only
 * for branch-scoped memberships. Owner, Developer, Platform Team, and school
 * roles never inherit a previously active branch row.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { db, type SchoolBranchSetting } from "../lib/db";
import type { UserMembership } from "../lib/auth/roleRedirect";
import { getStoredActiveMembership } from "../lib/auth/activeMembership";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { SyncStatus } from "../lib/constants/syncStatus";
import {
  appearanceIdentityFor,
  appearanceScopeForRole,
  normalizeAppearanceRole,
  type AppearanceScope,
} from "../lib/theme/appearanceScope";
import {
  PLATFORM_APPEARANCE_DEFAULTS,
  type ScopedAppearanceSettings,
} from "../lib/theme/applyScopedAppearance";

export type SettingsPatch =
  Partial<SchoolBranchSetting> &
  Record<string, unknown>;

export type SettingsValue = SchoolBranchSetting;

export type SettingsLoadedFor = {
  role: string;
  accountId?: string;
  schoolId?: string;
  branchId?: string;
  key: string;
};

export type SettingsContextValue = {
  /** Backward-compatible alias for effectiveSettings. */
  settings: SettingsValue | ScopedAppearanceSettings | null;
  effectiveSettings: SettingsValue | ScopedAppearanceSettings | null;
  effectiveScope: AppearanceScope;

  platformSettings: ScopedAppearanceSettings | null;
  accountSettings: ScopedAppearanceSettings | null;
  schoolSettings: ScopedAppearanceSettings | null;
  branchSettings: SettingsValue | null;

  ready: boolean;
  loading: boolean;
  loadedFor: SettingsLoadedFor | null;

  activeSchoolId: string | null;
  activeBranchId: string | null;

  refreshSettings: () => Promise<void>;

  refreshSettingsForContext: (
    schoolId?: string | null,
    branchId?: string | null,
  ) => Promise<void>;

  hydrateSettingsForMembership: (
    membership: UserMembership,
    preferredSettings?: Record<string, unknown> | null,
  ) => Promise<SettingsValue | ScopedAppearanceSettings | null>;

  updateSettings: (
    patch: SettingsPatch,
  ) => Promise<SettingsValue>;
};

const SettingsContext =
  createContext<SettingsContextValue | undefined>(undefined);

const CURRENT_SETTINGS_POINTER =
  "eleeveon_current_workspace_settings";

const SCOPED_SETTINGS_PREFIX =
  "eleeveon_cached_settings";

const platformSettings: ScopedAppearanceSettings = {
  ...PLATFORM_APPEARANCE_DEFAULTS,
};

function createPermanentId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join("-");
}

function cleanId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const id = String(value).trim();
  return id || null;
}

function cleanString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeSyncStatus(
  value: unknown,
): SyncStatus | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  switch (parsed) {
    case SyncStatus.PENDING:
    case SyncStatus.SYNCED:
    case SyncStatus.FAILED:
    case SyncStatus.CONFLICT:
      return parsed;

    default:
      return undefined;
  }
}

function defaultBranchSettings(
  accountId: string,
  schoolId: string,
  branchId: string,
): SettingsValue {
  const now = Date.now();
  const id = createPermanentId();

  return {
    id,
    accountId,
    schoolId,
    branchId,

    mode: "manual",
    theme: "light",
    primaryColor:
      PLATFORM_APPEARANCE_DEFAULTS.primaryColor,
    fontFamily:
      PLATFORM_APPEARANCE_DEFAULTS.fontFamily,
    fontSize: 16,

    academicYear: "",
    currentTerm: "Term 1",
    logo: "",
    schoolGalleryImages: [],

    createdAt: now,
    updatedAt: now,
    version: 1,

    createdByDeviceId: "",
    updatedByDeviceId: "",
    deviceId: "",

    synced: SyncStatus.PENDING,
    isDeleted: false,
  } as SettingsValue;
}

function normalizeBranchSettings(
  row: Record<string, unknown>,
  accountId: string,
  schoolId: string,
  branchId: string,
): SettingsValue {
  const base = defaultBranchSettings(
    accountId,
    schoolId,
    branchId,
  );

  const normalizedId =
    cleanId(row.id) ??
    base.id;

  const createdAt =
    typeof row.createdAt === "number" &&
    row.createdAt > 0
      ? row.createdAt
      : base.createdAt;

  const updatedAt =
    typeof row.updatedAt === "number" &&
    row.updatedAt > 0
      ? row.updatedAt
      : base.updatedAt;

  const version =
    typeof row.version === "number" &&
    row.version > 0
      ? row.version
      : base.version;

  return {
    ...base,
    ...row,

    id: normalizedId,
    accountId:
      cleanString(row.accountId) ??
      accountId,
    schoolId:
      cleanId(row.schoolId) ??
      schoolId,
    branchId:
      cleanId(row.branchId) ??
      branchId,

    fontSize:
      Number(row.fontSize || 16),

    schoolGalleryImages:
      Array.isArray(row.schoolGalleryImages)
        ? row.schoolGalleryImages
        : [],

    createdAt,
    updatedAt,
    version,

    createdByDeviceId:
      cleanString(row.createdByDeviceId) ??
      cleanString(row.deviceId) ??
      "",

    updatedByDeviceId:
      cleanString(row.updatedByDeviceId) ??
      cleanString(row.deviceId) ??
      "",

    deviceId:
      cleanString(row.deviceId) ??
      cleanString(row.updatedByDeviceId) ??
      "",

    synced:
      normalizeSyncStatus(row.synced) ??
      SyncStatus.PENDING,

    isDeleted:
      row.isDeleted === true,
  } as SettingsValue;
}

function scopedCacheKey(
  accountId: string,
  schoolId: string,
  branchId: string,
): string {
  return [
    SCOPED_SETTINGS_PREFIX,
    accountId,
    schoolId,
    branchId,
  ].join(":");
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(key) ||
      window.sessionStorage.getItem(key);

    return raw
      ? (JSON.parse(raw) as T)
      : null;
  } catch {
    return null;
  }
}

function writeJson(
  key: string,
  value: unknown,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const raw = JSON.stringify(value);

  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Storage may be unavailable or full.
  }

  try {
    window.sessionStorage.setItem(key, raw);
  } catch {
    // Storage may be unavailable or full.
  }
}

async function findExactBranchSettings(input: {
  accountId: string;
  schoolId: string;
  branchId: string;
  preferred?: Record<string, unknown> | null;
}): Promise<SettingsValue | null> {
  const preferred = input.preferred;

  if (
    preferred &&
    String(
      preferred.accountId ??
      input.accountId,
    ) === input.accountId &&
    cleanId(preferred.schoolId) ===
      input.schoolId &&
    cleanId(preferred.branchId) ===
      input.branchId &&
    preferred.isDeleted !== true
  ) {
    return normalizeBranchSettings(
      preferred,
      input.accountId,
      input.schoolId,
      input.branchId,
    );
  }

  const rows =
    await db.schoolBranchSettings.toArray();

  const exact = rows
    .filter(
      (row) =>
        !row.isDeleted &&
        String(row.accountId || "") ===
          input.accountId &&
        cleanId(row.schoolId) ===
          input.schoolId &&
        cleanId(row.branchId) ===
          input.branchId,
    )
    .sort(
      (a, b) =>
        Number(b.updatedAt || 0) -
        Number(a.updatedAt || 0),
    )[0];

  if (exact) {
    return normalizeBranchSettings(
      exact as unknown as Record<
        string,
        unknown
      >,
      input.accountId,
      input.schoolId,
      input.branchId,
    );
  }

  type CachedSettingsEnvelope = {
    settings?: Record<string, unknown>;
    accountId?: unknown;
    schoolId?: unknown;
    branchId?: unknown;
  };

  const cached = readJson<CachedSettingsEnvelope>(
    scopedCacheKey(
      input.accountId,
      input.schoolId,
      input.branchId,
    ),
  );

  const cachedSettings: Record<string, unknown> | null =
    cached?.settings && typeof cached.settings === "object"
      ? cached.settings
      : cached && typeof cached === "object"
        ? (cached as Record<string, unknown>)
        : null;

  if (
    cachedSettings &&
    String(
      cachedSettings.accountId ??
      input.accountId,
    ) === input.accountId &&
    cleanId(cachedSettings.schoolId) ===
      input.schoolId &&
    cleanId(cachedSettings.branchId) ===
      input.branchId
  ) {
    return normalizeBranchSettings(
      cachedSettings,
      input.accountId,
      input.schoolId,
      input.branchId,
    );
  }

  return null;
}

function baseSettingsForScope(
  scope: AppearanceScope,
): ScopedAppearanceSettings {
  switch (scope) {
    case "platform":
    case "account":
    case "school":
    case "branch":
    default:
      return {
        ...platformSettings,
      };
  }
}

export function SettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [
    effectiveSettings,
    setEffectiveSettings,
  ] = useState<
    SettingsValue |
    ScopedAppearanceSettings |
    null
  >(null);

  const [
    effectiveScope,
    setEffectiveScope,
  ] = useState<AppearanceScope>("platform");

  const [
    accountSettings,
    setAccountSettings,
  ] = useState<
    ScopedAppearanceSettings | null
  >(null);

  const [
    schoolSettings,
    setSchoolSettings,
  ] = useState<
    ScopedAppearanceSettings | null
  >(null);

  const [
    branchSettings,
    setBranchSettings,
  ] = useState<SettingsValue | null>(null);

  const [
    loadedFor,
    setLoadedFor,
  ] = useState<SettingsLoadedFor | null>(
    null,
  );

  const [loading, setLoading] =
    useState(true);

  const requestRef = useRef(0);

  const hydrateSettingsForMembership =
    useCallback(
      async (
        membership: UserMembership,
        preferredSettings?:
          | Record<string, unknown>
          | null,
      ): Promise<
        | SettingsValue
        | ScopedAppearanceSettings
        | null
      > => {
        const request =
          ++requestRef.current;

        const rawIdentity =
          appearanceIdentityFor({
            role: membership.role,
            accountId:
              membership.accountId,
            schoolId:
              membership.schoolId,
            branchId:
              membership.branchId,
          });

        /*
         * appearanceIdentityFor may temporarily receive legacy numeric
         * values from cached authentication data. Normalize all entity
         * identities to permanent strings at this context boundary.
         */
        const accountId =
          cleanString(
            rawIdentity.accountId,
          );

        const schoolId =
          cleanId(
            rawIdentity.schoolId,
          );

        const branchId =
          cleanId(
            rawIdentity.branchId,
          );

        const role =
          normalizeAppearanceRole(
            membership.role,
          );

        const identityKey = [
          rawIdentity.scope,
          role,
          accountId ?? "",
          schoolId ?? "",
          branchId ?? "",
        ].join(":");

        setLoading(true);
        setEffectiveScope(
          rawIdentity.scope,
        );

        try {
          let resolved:
            | SettingsValue
            | ScopedAppearanceSettings
            | null = null;

          if (
            rawIdentity.scope ===
            "branch"
          ) {
            if (
              !accountId ||
              !schoolId ||
              !branchId
            ) {
              /*
               * Role selection can briefly publish the membership role before
               * its complete branch identity has been persisted. Do not crash
               * the role transition. Keep a safe platform appearance until the
               * membership-changed event runs again with the complete context.
               */
              resolved =
                baseSettingsForScope(
                  "platform",
                );

              if (
                request ===
                requestRef.current
              ) {
                setEffectiveScope(
                  "platform",
                );
                setEffectiveSettings(
                  resolved,
                );
                setLoadedFor(null);
              }

              return resolved;
            }

            const branchResolved:
              SettingsValue =
              (await findExactBranchSettings(
                {
                  accountId,
                  schoolId,
                  branchId,
                  preferred:
                    preferredSettings,
                },
              )) ??
              defaultBranchSettings(
                accountId,
                schoolId,
                branchId,
              );

            resolved = branchResolved;

            if (
              request ===
              requestRef.current
            ) {
              setBranchSettings(
                branchResolved,
              );
            }
          } else if (
            rawIdentity.scope ===
            "school"
          ) {
            resolved =
              baseSettingsForScope(
                "school",
              );

            if (
              request ===
              requestRef.current
            ) {
              setSchoolSettings(
                resolved,
              );
            }
          } else if (
            rawIdentity.scope ===
            "account"
          ) {
            resolved =
              baseSettingsForScope(
                "account",
              );

            if (
              request ===
              requestRef.current
            ) {
              setAccountSettings(
                resolved,
              );
            }
          } else {
            resolved =
              baseSettingsForScope(
                "platform",
              );
          }

          if (
            request !==
            requestRef.current
          ) {
            return resolved;
          }

          setEffectiveSettings(
            resolved,
          );

          setLoadedFor({
            role,
            accountId:
              accountId ??
              undefined,
            schoolId:
              schoolId ??
              undefined,
            branchId:
              branchId ??
              undefined,
            key: identityKey,
          });

          if (
            rawIdentity.scope ===
              "branch" &&
            resolved &&
            accountId &&
            schoolId &&
            branchId
          ) {
            const envelope = {
              accountId,
              schoolId,
              branchId,
              role,
              appearanceScope:
                rawIdentity.scope,
              settings: resolved,
              cachedAt: Date.now(),
            };

            writeJson(
              scopedCacheKey(
                accountId,
                schoolId,
                branchId,
              ),
              envelope,
            );

            writeJson(
              CURRENT_SETTINGS_POINTER,
              envelope,
            );
          } else {
            writeJson(
              CURRENT_SETTINGS_POINTER,
              {
                accountId:
                  accountId ??
                  undefined,
                role,
                appearanceScope:
                  rawIdentity.scope,
                settings: resolved,
                cachedAt: Date.now(),
              },
            );
          }

          return resolved;
        } finally {
          if (
            request ===
            requestRef.current
          ) {
            setLoading(false);
          }
        }
      },
      [],
    );

  const refreshSettings =
    useCallback(async () => {
      const membership =
        getStoredActiveMembership();

      if (!membership) {
        setEffectiveScope("platform");
        setEffectiveSettings(
          platformSettings,
        );
        setLoadedFor(null);
        setLoading(false);
        return;
      }

      await hydrateSettingsForMembership(
        membership,
      );
    }, [
      hydrateSettingsForMembership,
    ]);

  const refreshSettingsForContext =
    useCallback(
      async (
        schoolId?: string | null,
        branchId?: string | null,
      ) => {
        const stored =
          getStoredActiveMembership();

        if (!stored) {
          await refreshSettings();
          return;
        }

        await hydrateSettingsForMembership({
          ...stored,
          schoolId:
            schoolId ??
            cleanId(
              stored.schoolId,
            ) ??
            undefined,
          branchId:
            branchId ??
            cleanId(
              stored.branchId,
            ) ??
            undefined,
        });
      },
      [
        hydrateSettingsForMembership,
        refreshSettings,
      ],
    );

  const updateSettings =
    useCallback(
      async (
        patch: SettingsPatch,
      ): Promise<SettingsValue> => {
        const membership =
          getStoredActiveMembership();

        const role =
          normalizeAppearanceRole(
            loadedFor?.role ||
              membership?.role,
          );

        const scope =
          appearanceScopeForRole(role);

        if (scope !== "branch") {
          throw new Error(
            "Branch Settings can only update a branch-scoped membership.",
          );
        }

        const accountId =
          cleanString(
            patch.accountId ??
              loadedFor?.accountId ??
              membership?.accountId,
          );

        const schoolId =
          cleanId(
            patch.schoolId ??
              loadedFor?.schoolId ??
              membership?.schoolId,
          );

        const branchId =
          cleanId(
            patch.branchId ??
              loadedFor?.branchId ??
              membership?.branchId,
          );

        if (
          !accountId ||
          !schoolId ||
          !branchId
        ) {
          throw new Error(
            "Account, school, and branch are required to save Branch Settings.",
          );
        }

        const existing =
          await findExactBranchSettings({
            accountId,
            schoolId,
            branchId,
          });

        const base =
          existing ??
          defaultBranchSettings(
            accountId,
            schoolId,
            branchId,
          );

        const prepared =
          prepareSyncData({
            ...base,
            ...patch,

            id:
              cleanId(
                existing?.id ??
                patch.id,
              ) ??
              base.id,

            accountId,
            schoolId,
            branchId,

            createdAt:
              existing?.createdAt ??
              base.createdAt,

            createdByDeviceId:
              existing
                ?.createdByDeviceId ??
              base.createdByDeviceId,

            isDeleted: false,
          } as SchoolBranchSetting);

        const next =
          normalizeBranchSettings(
            prepared as unknown as Record<
              string,
              unknown
            >,
            accountId,
            schoolId,
            branchId,
          );

        if (existing?.id) {
          const updatedRecord: SchoolBranchSetting = {
            ...next,
            id: existing.id,
          };

          await db.schoolBranchSettings.put(updatedRecord);

          next.id = existing.id;
        } else {
          await db.schoolBranchSettings.add(next);
        }

        setBranchSettings(next);
        setEffectiveScope("branch");
        setEffectiveSettings(next);

        const identityKey = [
          "branch",
          role,
          accountId,
          schoolId,
          branchId,
        ].join(":");

        setLoadedFor({
          role,
          accountId,
          schoolId,
          branchId,
          key: identityKey,
        });

        const envelope = {
          accountId,
          schoolId,
          branchId,
          role,
          appearanceScope:
            "branch" as const,
          settings: next,
          cachedAt: Date.now(),
        };

        writeJson(
          scopedCacheKey(
            accountId,
            schoolId,
            branchId,
          ),
          envelope,
        );

        writeJson(
          CURRENT_SETTINGS_POINTER,
          envelope,
        );

        if (
          typeof window !== "undefined"
        ) {
          window.dispatchEvent(
            new CustomEvent(
              "school-branch-settings-updated",
              {
                detail: {
                  accountId,
                  schoolId,
                  branchId,
                  settings: next,
                },
              },
            ),
          );
        }

        return next;
      },
      [
        loadedFor?.role,
        loadedFor?.accountId,
        loadedFor?.schoolId,
        loadedFor?.branchId,
      ],
    );

  useEffect(() => {
    void refreshSettings().catch(
      (error) => {
        console.error(
          "Failed to restore role-aware settings:",
          error,
        );

        setEffectiveSettings(
          platformSettings,
        );

        setEffectiveScope("platform");
        setLoading(false);
      },
    );
  }, [refreshSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleMembershipChange = () => {
      void refreshSettings();
    };

    const handleStorage = (
      event: StorageEvent,
    ) => {
      if (
        event.key ===
          CURRENT_SETTINGS_POINTER ||
        event.key?.startsWith(
          SCOPED_SETTINGS_PREFIX,
        )
      ) {
        void refreshSettings();
      }
    };

    const handleSettingsUpdate = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<{
          accountId?: unknown;
          schoolId?: unknown;
          branchId?: unknown;
          settings?: Record<
            string,
            unknown
          >;
        }>;

      const nextSettings =
        customEvent.detail?.settings;

      if (
        !nextSettings ||
        !loadedFor
      ) {
        return;
      }

      const eventAccountId =
        cleanString(
          customEvent.detail
            ?.accountId,
        );

      const eventSchoolId =
        cleanId(
          customEvent.detail
            ?.schoolId,
        );

      const eventBranchId =
        cleanId(
          customEvent.detail
            ?.branchId,
        );

      const matchesCurrentContext =
        eventAccountId ===
          cleanString(
            loadedFor.accountId,
          ) &&
        eventSchoolId ===
          cleanId(
            loadedFor.schoolId,
          ) &&
        eventBranchId ===
          cleanId(
            loadedFor.branchId,
          );

      if (
        !matchesCurrentContext ||
        !eventAccountId ||
        !eventSchoolId ||
        !eventBranchId
      ) {
        return;
      }

      const normalized =
        normalizeBranchSettings(
          nextSettings,
          eventAccountId,
          eventSchoolId,
          eventBranchId,
        );

      setBranchSettings(
        normalized,
      );

      setEffectiveScope(
        "branch",
      );

      setEffectiveSettings(
        normalized,
      );
    };

    window.addEventListener(
      "active-membership-changed",
      handleMembershipChange,
    );

    window.addEventListener(
      "storage",
      handleStorage,
    );

    window.addEventListener(
      "school-branch-settings-updated",
      handleSettingsUpdate,
    );

    return () => {
      window.removeEventListener(
        "active-membership-changed",
        handleMembershipChange,
      );

      window.removeEventListener(
        "storage",
        handleStorage,
      );

      window.removeEventListener(
        "school-branch-settings-updated",
        handleSettingsUpdate,
      );
    };
  }, [
    refreshSettings,
    loadedFor,
  ]);

  const ready = Boolean(
    !loading &&
    effectiveSettings &&
    loadedFor,
  );

  const value =
    useMemo<SettingsContextValue>(
      () => ({
        settings:
          effectiveSettings,
        effectiveSettings,
        effectiveScope,

        platformSettings,
        accountSettings,
        schoolSettings,
        branchSettings,

        ready,
        loading,
        loadedFor,

        activeSchoolId:
          loadedFor?.schoolId ??
          null,

        activeBranchId:
          loadedFor?.branchId ??
          null,

        refreshSettings,
        refreshSettingsForContext,
        hydrateSettingsForMembership,
        updateSettings,
      }),
      [
        effectiveSettings,
        effectiveScope,
        accountSettings,
        schoolSettings,
        branchSettings,
        ready,
        loading,
        loadedFor,
        refreshSettings,
        refreshSettingsForContext,
        hydrateSettingsForMembership,
        updateSettings,
      ],
    );

  return (
    <SettingsContext.Provider
      value={value}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings():
  SettingsContextValue {
  const context =
    useContext(SettingsContext);

  if (!context) {
    throw new Error(
      "useSettings must be used inside SettingsProvider",
    );
  }

  return context;
}